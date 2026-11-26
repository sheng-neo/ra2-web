/**
 * 招牌图集：运行时用 canvas 画的 1024 × 1024 RGBA8（带 mipmap ≈ 5.6 MB，登记为 'buildings:sign-atlas'）。
 * - 上 768 px：横招牌格 256 × 64（4 列 × 12 行 = 48 格），灯箱 / 霓虹 / LED 灯带；
 * - 下 256 px：直招牌格 64 × 256（16 格），字自上而下竖排，字形正立（不镜像，PLAN §7.4）。
 * 文字只取白名单（whitelist.ts），每格的 (字, 样式) 由 atlasLayout() 确定性给出，测试检查全部字串都在白名单里。
 * 格子边缘保持纯底色：招牌四边形比格子宽时，shader 把 UV 夹在格内，多出的部分延续底色。
 */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';
import { registerTextureBytes } from '../materials/lighting';
import { SIGN_WORDS, type SignWord } from './whitelist';

export const ATLAS_PX = 1024;
export const H_CELL = { w: 256, h: 64 } as const;
export const V_CELL = { w: 64, h: 256 } as const;
const H_COLS = 4;
const H_ROWS = 12;
const V_COUNT = 16;

/**
 * 招牌样式。gainY 为主色（灯箱底色 / 霓虹字色）要达到的线性亮度（契约：灯箱 1.5–2.5，霓虹 / LED 2.5–4）。
 */
export const SIGN_STYLES = {
  /** 白灯箱红字。 */
  boxRed: { bg: '#fff6e8', fg: '#c8201a', main: '#fff6e8', gainY: 1.6 },
  /** 白灯箱黑字。 */
  boxBlack: { bg: '#fff6e8', fg: '#1a1a22', main: '#fff6e8', gainY: 1.5 },
  /** 黄灯箱红字。 */
  boxYellow: { bg: '#ffd54a', fg: '#b4140f', main: '#ffd54a', gainY: 1.7 },
  /** 黑底红霓虹字。 */
  neonRed: { bg: '#000000', fg: '#ff3b2f', main: '#ff3b2f', gainY: 2.6 },
  /** 黑底绿 LED 字。 */
  neonGreen: { bg: '#000000', fg: '#38ff7a', main: '#38ff7a', gainY: 2.8 },
  /** 蓝色 LED 灯管带 + 白字（主色按白字算，蓝管约 0.6）。 */
  ledBlue: { bg: '#2f6bff', fg: '#eef3ff', main: '#eef3ff', gainY: 2.6 },
  /** R2 修复轮（照片 20）：深红底黄字 + 字色霓虹边框（主色按黄字算）。 */
  boxCrimson: { bg: '#a8141c', fg: '#ffd54a', main: '#ffd54a', gainY: 1.6 },
  /** 藏青底白字 + 白色霓虹边框。 */
  boxNavy: { bg: '#1b2a6b', fg: '#ffffff', main: '#ffffff', gainY: 1.5 },
} as const;

/** 有霓虹边框的样式。 */
const OUTLINED: ReadonlySet<string> = new Set(['boxCrimson', 'boxNavy', 'boxYellow']);

export type SignStyle = keyof typeof SIGN_STYLES;

export const H_STYLES: readonly SignStyle[] = ['boxRed', 'neonRed', 'boxCrimson', 'ledBlue', 'boxYellow', 'boxNavy', 'boxBlack', 'neonGreen'];
/** 直招牌（R2 修复轮）：约六成饱和底色（深红、藏青、黄）、四分之一白底红字、其余霓虹。 */
export const V_STYLES: readonly SignStyle[] = ['boxCrimson', 'boxNavy', 'boxRed', 'boxYellow', 'boxCrimson', 'neonRed', 'boxNavy', 'boxRed'];

export interface AtlasCell {
  /** 格子在图集里的像素矩形（canvas 坐标，y 向下）。 */
  x: number;
  y: number;
  w: number;
  h: number;
  vertical: boolean;
  word: SignWord;
  style: SignStyle;
}

/** 图集布局（纯函数）：横格 48 个、直格 16 个；字与样式轮换，相邻格不重复。 */
export function atlasLayout(): AtlasCell[] {
  const cells: AtlasCell[] = [];
  const n = SIGN_WORDS.length;
  for (let i = 0; i < H_COLS * H_ROWS; i++) {
    cells.push({
      x: (i % H_COLS) * H_CELL.w,
      y: Math.floor(i / H_COLS) * H_CELL.h,
      w: H_CELL.w,
      h: H_CELL.h,
      vertical: false,
      word: SIGN_WORDS[(i * 7) % n]!,
      style: H_STYLES[i % H_STYLES.length]!,
    });
  }
  const multi = SIGN_WORDS.filter((w) => w.length >= 2);
  // 步长与字数互质：16 格直招牌的字各不相同（原来步长 5、30 个字，只轮到 6 个字）
  const stride = [7, 11, 13, 17].find((p) => multi.length % p !== 0) ?? 1;
  for (let i = 0; i < V_COUNT; i++) {
    cells.push({
      x: i * V_CELL.w,
      y: H_ROWS * H_CELL.h,
      w: V_CELL.w,
      h: V_CELL.h,
      vertical: true,
      word: multi[(i * stride + 3) % multi.length]!,
      style: V_STYLES[i % V_STYLES.length]!,
    });
  }
  return cells;
}

/** 格子的 UV 矩形（three 纹理 flipY = true：canvas 顶部对应 v = 1）：[u0, v0, du, dv]。 */
export function cellUv(c: AtlasCell): [number, number, number, number] {
  return [c.x / ATLAS_PX, 1 - (c.y + c.h) / ATLAS_PX, c.w / ATLAS_PX, c.h / ATLAS_PX];
}

/** 样式主色的线性亮度（sRGB 十六进制 → 线性 Y）。 */
export function hexLuminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
}

/** 招牌顶点的发光增益：纹素线性色 × 增益，使主色达到样式的 gainY。 */
export function styleGain(s: SignStyle): number {
  const st = SIGN_STYLES[s];
  return st.gainY / hexLuminance(st.main);
}

const FONT = "'PingFang HK','Noto Sans CJK TC','Noto Sans HK','WenQuanYi Zen Hei',sans-serif";

function drawCell(g: CanvasRenderingContext2D, c: AtlasCell): void {
  const st = SIGN_STYLES[c.style];
  g.save();
  g.beginPath();
  g.rect(c.x, c.y, c.w, c.h);
  g.clip();
  g.fillStyle = st.bg;
  g.fillRect(c.x, c.y, c.w, c.h);
  if (c.style === 'ledBlue') {
    // 竖向 LED 灯管：亮管与暗缝相间
    g.fillStyle = '#0a1430';
    const step = c.vertical ? 6 : 5;
    for (let x = c.x + 3; x < c.x + c.w; x += step) g.fillRect(x, c.y, 1.5, c.h);
  }
  const neon = c.style === 'neonRed' || c.style === 'neonGreen';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...c.word];
  // 每个字的中心与字号
  const glyphs: { ch: string; x: number; y: number }[] = [];
  let size: number;
  if (c.vertical) {
    size = Math.min(52, (c.h - 16) / chars.length);
    const top = c.y + c.h / 2 - (size * chars.length) / 2 + size / 2;
    chars.forEach((ch, i) => glyphs.push({ ch, x: c.x + c.w / 2, y: top + i * size }));
  } else {
    // 字高约占格高 80 %（照片 16：粗字撑满招牌的 70–85 %）
    size = 52;
    g.font = `bold ${size}px ${FONT}`;
    // 字距拉开一点（港式招牌常见）
    const spacingK = chars.length <= 2 ? 0.35 : 0.15;
    const wanted = c.w - 28;
    const total0 = chars.length * size + (chars.length - 1) * size * spacingK;
    if (total0 > wanted) size = Math.floor((size * wanted) / total0);
    const spacing = size * spacingK;
    const total = chars.length * size + (chars.length - 1) * spacing;
    let x = c.x + c.w / 2 - total / 2 + size / 2;
    for (const ch of chars) {
      glyphs.push({ ch, x, y: c.y + c.h / 2 + 2 });
      x += size + spacing;
    }
  }
  g.font = `bold ${Math.round(size)}px ${FONT}`;
  const pass = (fill: string, blur: number) => {
    g.fillStyle = fill;
    g.shadowColor = st.fg;
    g.shadowBlur = blur;
    for (const q of glyphs) g.fillText(q.ch, q.x, q.y);
  };
  if (neon) {
    // 霓虹：先画带光晕的彩色字，再叠一层偏白的灯管芯
    pass(st.fg, 8);
    g.globalAlpha = 0.3;
    pass('#ffffff', 0);
    g.globalAlpha = 1;
  } else {
    pass(st.fg, 0);
  }
  if (OUTLINED.has(c.style)) {
    // 霓虹边框：内缩 5 px、3 px 粗，带光晕
    g.strokeStyle = st.fg;
    g.lineWidth = 3;
    g.shadowColor = st.fg;
    g.shadowBlur = 6;
    g.strokeRect(c.x + 5, c.y + 5, c.w - 10, c.h - 10);
  }
  g.restore();
}

let cached: Texture | null = null;

/** 画好图集并建纹理（只建一次）。没有 DOM（单元测试）时返回 null。 */
export function signAtlasTexture(maxAnisotropy = 4): Texture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, ATLAS_PX, ATLAS_PX);
  for (const c of atlasLayout()) drawCell(g, c);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = Math.min(maxAnisotropy, 4);
  tex.name = 'buildings:sign-atlas';
  registerTextureBytes('buildings:sign-atlas', Math.round(ATLAS_PX * ATLAS_PX * 4 * (4 / 3)));
  cached = tex;
  return tex;
}
