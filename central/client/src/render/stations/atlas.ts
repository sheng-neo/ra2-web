/**
 * 车站文字图集（R3 STATIONS）：一张 RGBA 画布纹理（HIGH 1024²、LOW 512²，带 mipmap；HIGH ≈ 5.6 MB、LOW ≈ 1.4 MB，
 * 登记为 'stations:atlas'），装下所有要写字的站牌：
 * - 路面字「LOOK RIGHT 望右」「LOOK LEFT 望左 ←」（白字黑底，路面着色器取 r 通道当油漆遮罩）；
 * - 港铁出口招牌带（红底白色港铁标志、中環站、Central Station）与出口字块（浅蓝底白字，如 J3）；
 * - 电车站名牌（深绿底白字 + 白框站号，如 砵典乍街 Pottinger Street 72W）；
 * - 巴士站牌（城巴橙牌 / 九巴红牌：站名中英 + 酱红色路线带；小巴站：白底绿框小巴图 + 路线圆牌）；
 * - 码头正面：青色方牌白色码头号、青蓝色航线牌、新渡轮檐口字；
 * - 站岛灯箱广告的行业字（只取 signs/whitelist 的 SIGN_WORDS，虚构广告）。
 * 布局用「货架」装箱（纯函数 ShelfPacker，可测）；逻辑尺寸按 1024 画，LOW 整张按 0.5 缩放。
 * 没有 DOM（单元测试）时只做布局、不画（texture 为 null）。
 */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';
import { getQuality, registerTextureBytes } from '../materials/lighting';
import { SIGN_WORDS } from '../signs/whitelist';
import type { FlagSpec } from './rules';

/** 图集逻辑边长（px，HIGH 实际尺寸）。 */
export const ATLAS_SIZE = 1024;
/** 每个格子四周留白（逻辑 px），防 mipmap 串色。 */
const PAD = 3;
const FONT = "'PingFang HK','Noto Sans CJK TC','Noto Sans HK','WenQuanYi Zen Hei',sans-serif";
const FONT_EN = "'Helvetica Neue','Arial Narrow','Liberation Sans Narrow','Liberation Sans','DejaVu Sans',sans-serif";

/** 纹理坐标矩形（v0 在下，CanvasTexture flipY）。 */
export interface AtlasRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * 天际线装箱（skyline bottom-left）：维护一条「已占高度」折线，每个格子放在能放下的位置里最靠上（y 最小）、再最靠左的地方。
 * 比按行摆放省空间（不同高度的格子能互相填缝）。纯函数，可测。
 */
export class ShelfPacker {
  /** 天际线：[x, 宽, 已占到的 y] 逐段，按 x 排序、首尾相接覆盖 [0, width)。 */
  private sky: [number, number, number][];
  private maxY = 0;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.sky = [[0, width, 0]];
  }

  /** 放一个 w × h 的格子，返回左上角；放不下返回 null。 */
  place(w: number, h: number): { x: number; y: number } | null {
    if (w > this.width || h > this.height) return null;
    let best: { i: number; x: number; y: number } | null = null;
    for (let i = 0; i < this.sky.length; i++) {
      const x = this.sky[i]![0];
      if (x + w > this.width) break;
      // 从第 i 段起跨过的各段里最高的 y
      let y = 0;
      let rem = w;
      for (let j = i; j < this.sky.length && rem > 0; j++) {
        y = Math.max(y, this.sky[j]![2]);
        rem -= this.sky[j]![1];
      }
      if (y + h > this.height) continue;
      if (!best || y < best.y || (y === best.y && x < best.x)) best = { i, x, y };
    }
    if (!best) return null;
    // 更新天际线：[x, x + w) 抬到 y + h
    const { x, y } = best;
    const next: [number, number, number][] = [];
    for (const [sx, sw, sy] of this.sky) {
      const ex = sx + sw;
      if (ex <= x || sx >= x + w) {
        next.push([sx, sw, sy]);
        continue;
      }
      if (sx < x) next.push([sx, x - sx, sy]);
      if (ex > x + w) next.push([x + w, ex - (x + w), sy]);
    }
    next.push([x, w, y + h]);
    next.sort((a, b) => a[0] - b[0]);
    // 合并同高的相邻段
    const merged: [number, number, number][] = [];
    for (const seg of next) {
      const last = merged[merged.length - 1];
      if (last && last[2] === seg[2] && last[0] + last[1] === seg[0]) last[1] += seg[1];
      else merged.push([...seg]);
    }
    this.sky = merged;
    this.maxY = Math.max(this.maxY, y + h);
    return { x, y };
  }

  /** 已用到的高度（px）。 */
  get used(): number {
    return this.maxY;
  }
}

/** 固定格子（建图集时先画）的逻辑尺寸（px，不含留白）。 */
export const FIXED_SIZES = {
  lookRight: [256, 178],
  lookLeft: [256, 178],
  mtrBand: [320, 96],
  tramPlate: [160, 80],
  flag: [88, 66],
  gmbSign: [64, 64],
  gmbDisc: [64, 64],
  pierNumber: [64, 64],
  pierBoard: [256, 48],
  sunFascia: [384, 48],
  exitTile: [48, 48],
  adWord: [96, 48],
} as const;

/** 路面字的实际尺寸（米，宽 × 深）：英文一行在上（离路缘远），中文在下（近路缘）。 */
export const ROAD_TEXT_M = [1.8, 1.25] as const;

/** 站岛灯箱上用的行业字（白名单前几个，红线：虚构广告只用行业通称）。 */
export const AD_WORDS: readonly string[] = SIGN_WORDS.filter((w) => w.length >= 2).slice(0, 8);

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export class StationsAtlas {
  readonly scale: number;
  readonly texture: CanvasTexture | null;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly packer = new ShelfPacker(ATLAS_SIZE, ATLAS_SIZE);
  private readonly rects = new Map<string, AtlasRect>();
  /** 放不下而退成纯色的格子数（调试）。 */
  overflow = 0;

  constructor(scale: number) {
    this.scale = scale;
    const px = Math.round(ATLAS_SIZE * scale);
    let g: CanvasRenderingContext2D | null = null;
    let tex: CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      g = canvas.getContext('2d');
      if (g) {
        g.fillStyle = '#000';
        g.fillRect(0, 0, px, px);
        tex = new CanvasTexture(canvas);
        tex.colorSpace = SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.magFilter = LinearFilter;
        tex.anisotropy = 8;
        tex.name = 'stations:atlas';
        registerTextureBytes('stations:atlas', Math.round(px * px * 4 * (4 / 3)));
      }
    }
    this.g = g;
    this.texture = tex;
    this.drawFixed();
  }

  /** 已画好的格子。 */
  rect(key: string): AtlasRect | null {
    return this.rects.get(key) ?? null;
  }

  /** 取格子；没有就装箱并画（逻辑尺寸 w × h）。放不下返回 null。 */
  ensure(key: string, w: number, h: number, draw: Draw): AtlasRect | null {
    const have = this.rects.get(key);
    if (have) return have;
    const at = this.packer.place(w + PAD * 2, h + PAD * 2);
    if (!at) {
      this.overflow++;
      return null;
    }
    const x = at.x + PAD;
    const y = at.y + PAD;
    const r: AtlasRect = { u0: x / ATLAS_SIZE, v0: 1 - (y + h) / ATLAS_SIZE, u1: (x + w) / ATLAS_SIZE, v1: 1 - y / ATLAS_SIZE };
    this.rects.set(key, r);
    const g = this.g;
    if (g) {
      g.save();
      g.scale(this.scale, this.scale);
      g.translate(x, y);
      g.beginPath();
      g.rect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
      g.clip();
      draw(g, w, h);
      g.restore();
      if (this.texture) this.texture.needsUpdate = true;
    }
    return r;
  }

  /** 已用的高度比例（调试 / 测试）。 */
  get usedFraction(): number {
    return this.packer.used / ATLAS_SIZE;
  }

  private drawFixed(): void {
    const S = FIXED_SIZES;
    this.ensure('look-right', S.lookRight[0], S.lookRight[1], (g, w, h) => drawLook(g, w, h, 'right'));
    this.ensure('look-left', S.lookLeft[0], S.lookLeft[1], (g, w, h) => drawLook(g, w, h, 'left'));
    this.ensure('mtr-band', S.mtrBand[0], S.mtrBand[1], drawMtrBand);
    AD_WORDS.forEach((word, i) => this.ensure(`ad-${i}`, S.adWord[0], S.adWord[1], (g, w, h) => drawAdWord(g, w, h, word)));
  }

  /** 港铁出口字块（如 'J3'）。 */
  exitTile(code: string): AtlasRect | null {
    return this.ensure(`exit-${code}`, FIXED_SIZES.exitTile[0], FIXED_SIZES.exitTile[1], (g, w, h) => drawExitTile(g, w, h, code));
  }

  /** 电车站名牌。 */
  tramPlate(zh: string, en: string, ref: string): AtlasRect | null {
    return this.ensure(`tram-${ref}`, FIXED_SIZES.tramPlate[0], FIXED_SIZES.tramPlate[1], (g, w, h) => drawTramPlate(g, w, h, zh, en, ref));
  }

  /** 巴士 / 小巴站牌（同内容共用一格）。 */
  flag(spec: FlagSpec): AtlasRect | null {
    if (spec.kind === 'gmb') return this.ensure(`gmb-${spec.routes.join(',')}`, FIXED_SIZES.gmbSign[0] * 2, FIXED_SIZES.gmbSign[1], (g, w, h) => drawGmb(g, w, h, spec.routes));
    return this.ensure(`flag-${spec.kind}-${spec.zh}-${spec.routes.join(',')}`, FIXED_SIZES.flag[0], FIXED_SIZES.flag[1], (g, w, h) => drawFlag(g, w, h, spec));
  }

  /** 码头号方牌。 */
  pierNumber(n: number): AtlasRect | null {
    return this.ensure(`pier-n-${n}`, FIXED_SIZES.pierNumber[0], FIXED_SIZES.pierNumber[1], (g, w, h) => drawPierNumber(g, w, h, n));
  }

  /** 码头航线牌（两行：中文 + 英文）。 */
  pierBoard(key: string, zh: string, en: string): AtlasRect | null {
    return this.ensure(`pier-b-${key}`, FIXED_SIZES.pierBoard[0], FIXED_SIZES.pierBoard[1], (g, w, h) => drawBoard(g, w, h, zh, en, '#1f7f93'));
  }

  /** 新渡轮檐口字。 */
  sunFascia(): AtlasRect | null {
    return this.ensure('sun-fascia', FIXED_SIZES.sunFascia[0], FIXED_SIZES.sunFascia[1], (g, w, h) => drawBoard(g, w, h, '歡迎乘搭新渡輪', 'WELCOME TO SUN FERRY', '#55889e'));
  }
}

let shared: StationsAtlas | null = null;

/** 当前画质档；没有浏览器环境（单元测试，读不到 location）时按 HIGH。 */
export function stationsTier(): 'high' | 'low' {
  try {
    return getQuality().tier;
  } catch {
    return 'high';
  }
}

/** 全局共用的车站图集（第一次调用时按画质档建：HIGH 1024²、LOW 512²）。 */
export function stationsAtlas(): StationsAtlas {
  shared ??= new StationsAtlas(stationsTier() === 'high' ? 1 : 0.5);
  return shared;
}

/** 图集纹理（无 DOM 时 null）。 */
export function stationsAtlasTexture(): Texture | null {
  return stationsAtlas().texture;
}

// ---------------------------------------------------------------------------------------------
// 画法（逻辑 px，原点 = 格子左上角）
// ---------------------------------------------------------------------------------------------

/** 横向压窄的文字（字宽不超过 maxW）。 */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, squeeze = 1): void {
  const w = g.measureText(text).width * squeeze;
  const k = w > maxW ? maxW / w : 1;
  g.save();
  g.translate(x, y);
  g.scale(squeeze * k, 1);
  // 对齐方式（left / center / right）相对 x 生效：缩放以 x 为原点
  g.fillText(text, 0, 0);
  g.restore();
}

/** 路面「望右 / 望左」：白字（油漆遮罩），上行英文粗体窄体，下行中文约 1.8 倍高；望左加箭头。 */
function drawLook(g: CanvasRenderingContext2D, w0: number, h0: number, side: 'right' | 'left'): void {
  // 按 288 × 200 的版式画，整体缩放到格子
  g.scale(w0 / 288, h0 / 200);
  const w = 288;
  const h = 200;
  g.fillStyle = '#000';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.font = `900 64px ${FONT_EN}`;
  fitText(g, side === 'right' ? 'LOOK RIGHT' : 'LOOK LEFT', 8, 62, w - 16, 0.78);
  g.font = `bold 112px ${FONT}`;
  const zh = side === 'right' ? '望右' : '望左';
  const zx = side === 'right' ? 4 : 64;
  fitText(g, zh, zx, h - 14, 224, 1);
  if (side === 'left') {
    // 左箭头（在中文左边）
    g.beginPath();
    g.moveTo(4, h - 70);
    g.lineTo(44, h - 104);
    g.lineTo(44, h - 84);
    g.lineTo(60, h - 84);
    g.lineTo(60, h - 56);
    g.lineTo(44, h - 56);
    g.lineTo(44, h - 36);
    g.closePath();
    g.fill();
  }
}

/** 港铁标志：红色圆底上的白色标志（上「∪」下「∩」两道弧，中间一竖相连）。 */
function drawMtrLogo(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.fillStyle = '#e0262b';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = r * 0.16;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(cx, cy - r * 0.27);
  g.lineTo(cx, cy + r * 0.27);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy - r * 0.75, r * 0.5, 0, Math.PI);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy + r * 0.75, r * 0.5, Math.PI, Math.PI * 2);
  g.stroke();
}

/** 港铁出口招牌带的字幅：黑底、港铁标志（红圆）、中環站、Central Station（320 × 96 ≈ 2 × 0.6 m，照片 16 的版式）。 */
function drawMtrBand(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#070807';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  const r = h * 0.34;
  const cx = r + 10;
  drawMtrLogo(g, cx, h / 2, r);
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `bold 40px ${FONT}`;
  fitText(g, '中環站', cx + r + 14, h * 0.56, w - cx - r - 20);
  g.font = `600 19px ${FONT_EN}`;
  fitText(g, 'Central Station', cx + r + 15, h * 0.85, w - cx - r - 20);
}

/** 出口字块：浅蓝底、白色大写字母 + 小号数字（48 × 48）。 */
function drawExitTile(g: CanvasRenderingContext2D, w: number, h: number, code: string): void {
  g.fillStyle = '#070807';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  g.fillStyle = '#93b1cc';
  g.fillRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const letter = code[0] ?? '';
  const digit = code.slice(1);
  g.font = `bold 36px ${FONT_EN}`;
  const lw = g.measureText(letter).width;
  g.font = `bold 18px ${FONT_EN}`;
  const dw = g.measureText(digit).width;
  const x0 = (w - lw - dw) / 2;
  g.font = `bold 36px ${FONT_EN}`;
  g.fillText(letter, x0, h - 10);
  g.font = `bold 18px ${FONT_EN}`;
  g.fillText(digit, x0 + lw + 1, h - 10);
}

/** 电车站名牌：深绿底，左边中文（大）+ 英文，右边白框站号（192 × 96 ≈ 1.0 × 0.5 m）。 */
function drawTramPlate(g: CanvasRenderingContext2D, w0: number, h0: number, zh: string, en: string, ref: string): void {
  // 按 192 × 96 的版式画，整体缩放到格子
  g.scale(w0 / 192, h0 / 96);
  const w = 192;
  const h = 96;
  g.fillStyle = '#1f4a3a';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  g.strokeStyle = '#e8ece8';
  g.lineWidth = 2;
  g.strokeRect(3, 3, w - 6, h - 6);
  const boxW = 54;
  g.fillStyle = '#f2f4f0';
  g.fillRect(w - boxW - 8, 14, boxW, h - 28);
  g.fillStyle = '#1f4a3a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 24px ${FONT_EN}`;
  fitText(g, ref, w - boxW / 2 - 8, h / 2 + 1, boxW - 6);
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `bold 34px ${FONT}`;
  fitText(g, zh, 10, 46, w - boxW - 26);
  g.font = `600 15px ${FONT_EN}`;
  fitText(g, en, 11, 74, w - boxW - 26);
}

/** 城巴橙牌 / 九巴红牌：上部站名（中英）+ 右上营运商字样，下部酱红色路线带（白字、红字相间）。 */
function drawFlag(g: CanvasRenderingContext2D, w0: number, h0: number, spec: FlagSpec): void {
  // 按 112 × 84 的版式画，整体缩放到格子
  g.scale(w0 / 112, h0 / 84);
  const w = 112;
  const h = 84;
  const kmb = spec.kind === 'kmb';
  g.fillStyle = kmb ? '#c8282c' : '#e07020';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  // 营运商字样（右上角小字）
  g.fillStyle = '#ffffff';
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.font = `bold 10px ${FONT}`;
  fitText(g, kmb ? '九巴 KMB' : '城巴 Citybus', w - 4, 11, 60);
  g.textAlign = 'left';
  if (spec.zh) {
    g.font = `bold 17px ${FONT}`;
    fitText(g, spec.zh, 5, 31, w - 10);
    g.font = `600 9px ${FONT_EN}`;
    fitText(g, spec.en, 5, 43, w - 10);
  }
  // 路线带
  const bandY = 48;
  g.fillStyle = '#7a2d38';
  g.fillRect(-PAD, bandY, w + PAD * 2, h - bandY + PAD);
  const routes = spec.routes;
  const cols = 4;
  const cw = (w - 6) / cols;
  g.font = `bold 15px ${FONT_EN}`;
  g.textAlign = 'center';
  routes.forEach((r, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // 白字与红字相间（照片 22：特快 / 过海线红字）
    g.fillStyle = /X|^6\d\d|^9\d\d/.test(r) ? '#ff6b5e' : '#ffffff';
    fitText(g, r, 3 + cw * (col + 0.5), bandY + 15 + row * 17, cw - 3);
  });
}

/** 小巴站：左格白底粗绿框 + 绿色小巴轮廓，右格白色圆牌绿圈 + 路线号竖排。 */
function drawGmb(g: CanvasRenderingContext2D, w: number, h: number, routes: readonly string[]): void {
  const s = h;
  g.fillStyle = '#ffffff';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  g.strokeStyle = '#388d81';
  g.lineWidth = 7;
  g.strokeRect(4, 4, s - 8, s - 8);
  // 小巴轮廓
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(14, 44);
  g.lineTo(14, 26);
  g.quadraticCurveTo(16, 18, 26, 18);
  g.lineTo(46, 18);
  g.lineTo(52, 30);
  g.lineTo(52, 44);
  g.closePath();
  g.stroke();
  g.fillStyle = '#388d81';
  for (const wx of [22, 44]) {
    g.beginPath();
    g.arc(wx, 46, 4, 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(18, 23, 9, 7);
  g.fillRect(30, 23, 9, 7);
  // 路线圆牌
  const cx = s + s / 2;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(cx, s / 2, s / 2 - 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#388d81';
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#2a7a60';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const list = routes.slice(0, 3);
  const n = Math.max(list.length, 1);
  g.font = `bold ${n > 2 ? 13 : 16}px ${FONT_EN}`;
  list.forEach((r, i) => fitText(g, r, cx, s / 2 + (i - (n - 1) / 2) * (n > 2 ? 14 : 18), s - 16));
}

/** 码头号方牌：青色底、白色大号数字。 */
function drawPierNumber(g: CanvasRenderingContext2D, w: number, h: number, n: number): void {
  g.fillStyle = '#1b8a9c';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 52px ${FONT_EN}`;
  g.fillText(String(n), w / 2, h / 2 + 3);
}

/** 青蓝色横牌：上行中文、下行英文（白字）。 */
function drawBoard(g: CanvasRenderingContext2D, w: number, h: number, zh: string, en: string, bg: string): void {
  g.fillStyle = bg;
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `bold 22px ${FONT}`;
  fitText(g, zh, w / 2, 24, w - 12);
  g.font = `600 14px ${FONT_EN}`;
  fitText(g, en, w / 2, 42, w - 12);
}

/** 灯箱广告的行业字：白字透明底（着色器按 r 通道叠在抽象画面上）。 */
function drawAdWord(g: CanvasRenderingContext2D, w: number, h: number, word: string): void {
  g.fillStyle = '#000';
  g.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 38px ${FONT}`;
  fitText(g, word, w / 2, h / 2 + 2, w - 8);
}
