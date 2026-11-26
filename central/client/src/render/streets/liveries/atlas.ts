/**
 * 营运商涂装图集（R3 LIVERIES）：电车、巴士、小巴、的士、渡轮共用一张运行时用 canvas 画的单通道字形图（R8，白字黑底，
 * 颜色在各自着色器里给）。HIGH 1024 × 1008 + mipmap ≈ 1.3 MB，LOW 半分辨率 ≈ 0.34 MB，登记为 'liveries:atlas'
 * （预算 HIGH ≤ 4 MB、LOW ≤ 2 MB）。
 *
 * 图集里只有：
 * - 真实地名 / 目的地（transit-data.ts：电车 TRAM_DESTINATIONS、巴士与小巴 ROUTES、红色小巴 RED_MINIBUS_PLACES）、真实路线号；
 * - 营运商字样（城巴 / Citybus、KMB、PUBLIC LIGHT BUS 19 SEATS 公共小型巴士十九座位、TAXI / 的士、天星小轮船名、新渡輪 SUN FERRY）
 *   与车队编号用的数字 0–9；标志（城巴红色 C、天星小轮烟囱上的星）是着色器里的几何图形，不是图片；
 * - 车身广告只用招牌白名单里的行业通称（AD_WORDS ⊂ SIGN_WORDS，测试检查），没有任何真实品牌或广告。
 *
 * 版面（layout）是纯函数：各块按顺序「装架子」（从左到右、满了换行），块内是等大格子；
 * 着色器拿到的是 GLSL 常量（liveryAtlasGlsl），不需要 uniform 数组。纹理行序与画布相同（v = 画布 y / 高，上 = 0）。
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat, UnsignedByteType, type Texture } from 'three';
import { getQuality, registerTextureBytes } from '../../materials/lighting';
import { SIGN_WORDS } from '../../signs/whitelist';
import { RED_MINIBUS_PLACES, ROUTES, STAR_FERRY_NAMES, TRAM_DESTINATIONS, type RouteDest } from '../transit-data';

export const ATLAS_W = 1024;

/** 车身广告可用的字（全部取自招牌白名单 SIGN_WORDS；本轮不扩充白名单）。 */
export const AD_WORDS = ['時裝', '珠寶', '眼鏡', '鐘錶', '涼茶', '餅家', '茶餐廳', '地產'] as const satisfies readonly (typeof SIGN_WORDS)[number][];

/** 九巴车队编号的车型前缀（surfaces-facts §3：ATENU1668、V6X171、E6X249 式，P1）。 */
export const KMB_CLASSES = ['ATENU', 'V6X', 'E6X'] as const;

/** 新渡輪「新輝玫」号（照片 12）：船名与公司字样。 */
export const SUN_FERRY_NAME = '新輝玫 FIRST FERRY IX';
export const SUN_FERRY_LOGO = '新渡輪 SUN FERRY';

/** 巴士 / 小巴目的地表：ROUTES 两端与「經」字幕（按出现顺序去重）+ 红色小巴地名。英文一律大写（巴士显示屏）。 */
export const BUS_DESTS: readonly RouteDest[] = (() => {
  const out: RouteDest[] = [];
  const seen = new Set<string>();
  const add = (d: RouteDest) => {
    if (seen.has(d.zh)) return;
    seen.add(d.zh);
    out.push({ zh: d.zh, en: d.en.toUpperCase() });
  };
  for (const r of ROUTES) {
    add(r.a);
    add(r.b);
    if (r.via) add(r.via);
  }
  for (const p of RED_MINIBUS_PLACES) add(p);
  return out;
})();

/** 路线号表（ROUTES 去重，按出现顺序）。 */
export const ROUTE_NUMBERS: readonly string[] = [...new Set(ROUTES.map((r) => r.route))];

/** 船名格：天星小轮 8 艘（船头「星 NORTHERN STAR 北」式：中文名拆在英文两边）+ 新渡輪船名。 */
export const BOAT_NAMES: readonly string[] = [
  ...STAR_FERRY_NAMES.map((n) => `${[...n.zh][1] ?? ''} ${n.en.toUpperCase()} ${[...n.zh][0] ?? ''}`),
  SUN_FERRY_NAME,
];

/** 网格块：左上角 (x, y)、格宽高 cw × ch、列数 cols、格数 n（像素）。 */
export interface GridBlock {
  x: number;
  y: number;
  cw: number;
  ch: number;
  cols: number;
  n: number;
}

/** 单格（像素矩形）。 */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const grid = (n: number, cw: number, ch: number, cols: number) => ({ n, cw, ch, cols, w: Math.min(n, cols) * cw, h: Math.ceil(n / cols) * ch });

/** 各块的尺寸（顺序 = 装架顺序）。 */
const BLOCKS = {
  tramDest: grid(TRAM_DESTINATIONS.length * 2, 192, 64, 5),
  busDest: grid(BUS_DESTS.length, 192, 56, 5),
  route: grid(ROUTE_NUMBERS.length, 64, 48, 16),
  digits: grid(10, 24, 40, 10),
  cbZh: grid(1, 96, 48, 1),
  cbEn: grid(1, 192, 48, 1),
  kmb: grid(1, 192, 64, 1),
  taxi: grid(1, 128, 40, 1),
  taxiZh: grid(1, 40, 80, 1),
  plbEn: grid(1, 512, 32, 1),
  plbZh: grid(1, 384, 32, 1),
  boatNames: grid(BOAT_NAMES.length, 336, 40, 3),
  adWords: grid(AD_WORDS.length, 96, 56, 8),
  sunLogo: grid(1, 256, 56, 1),
  kmbClass: grid(KMB_CLASSES.length, 96, 32, KMB_CLASSES.length),
} as const;

export type BlockName = keyof typeof BLOCKS;

export interface AtlasLayout {
  w: number;
  h: number;
  blocks: Record<BlockName, GridBlock>;
}

/** 装架（纯函数）：块按 BLOCKS 顺序从左到右排，放不下就另起一行（行高 = 本行最高的块）。 */
export function atlasLayout(): AtlasLayout {
  let x = 0;
  let y = 0;
  let shelf = 0;
  const blocks = {} as Record<BlockName, GridBlock>;
  for (const [name, b] of Object.entries(BLOCKS) as [BlockName, (typeof BLOCKS)[BlockName]][]) {
    if (x + b.w > ATLAS_W) {
      y += shelf;
      x = 0;
      shelf = 0;
    }
    blocks[name] = { x, y, cw: b.cw, ch: b.ch, cols: b.cols, n: b.n };
    x += b.w;
    shelf = Math.max(shelf, b.h);
  }
  const h = Math.ceil((y + shelf) / 16) * 16;
  return { w: ATLAS_W, h, blocks };
}

export const LAYOUT = atlasLayout();

/** 网格块里第 i 格的像素矩形。 */
export function cellRect(b: GridBlock, i: number): CellRect {
  return { x: b.x + (i % b.cols) * b.cw, y: b.y + Math.floor(i / b.cols) * b.ch, w: b.cw, h: b.ch };
}

/** 各图集格画的文字（纯函数，测试检查红线：广告字只来自白名单、地名只来自 transit-data）。 */
export function atlasTexts(): { block: BlockName; i: number; text: string }[] {
  const out: { block: BlockName; i: number; text: string }[] = [];
  TRAM_DESTINATIONS.forEach((d, i) => {
    out.push({ block: 'tramDest', i: i * 2, text: d.zh }, { block: 'tramDest', i: i * 2 + 1, text: d.en });
  });
  BUS_DESTS.forEach((d, i) => out.push({ block: 'busDest', i, text: `${d.zh}\n${d.en}` }));
  ROUTE_NUMBERS.forEach((r, i) => out.push({ block: 'route', i, text: r }));
  for (let i = 0; i < 10; i++) out.push({ block: 'digits', i, text: String(i) });
  out.push({ block: 'cbZh', i: 0, text: '城巴' }, { block: 'cbEn', i: 0, text: 'Citybus' }, { block: 'kmb', i: 0, text: 'KMB' });
  out.push({ block: 'taxi', i: 0, text: 'TAXI' }, { block: 'taxiZh', i: 0, text: '的士' });
  out.push({ block: 'plbEn', i: 0, text: 'PUBLIC LIGHT BUS 19 SEATS' }, { block: 'plbZh', i: 0, text: '公共小型巴士十九座位' });
  BOAT_NAMES.forEach((t, i) => out.push({ block: 'boatNames', i, text: t }));
  AD_WORDS.forEach((t, i) => out.push({ block: 'adWords', i, text: t }));
  out.push({ block: 'sunLogo', i: 0, text: SUN_FERRY_LOGO });
  KMB_CLASSES.forEach((t, i) => out.push({ block: 'kmbClass', i, text: t }));
  return out;
}

/** 巴士目的地格下标（按中文名）；没有返回 −1。 */
export function busDestIndex(zh: string): number {
  return BUS_DESTS.findIndex((d) => d.zh === zh);
}

/** 路线号格下标；没有返回 −1。 */
export function routeIndex(route: string): number {
  return ROUTE_NUMBERS.indexOf(route);
}

const CJK = "'PingFang HK','Noto Sans CJK TC','Noto Sans HK','Microsoft JhengHei','WenQuanYi Zen Hei',sans-serif";
const LATIN = "'Helvetica Neue','Inter','Liberation Sans',Arial,sans-serif";
const MIXED = `'Helvetica Neue','Inter','Liberation Sans','PingFang HK','Noto Sans CJK TC','WenQuanYi Zen Hei',Arial,sans-serif`;

/** 在格子里居中画一行字：先按字号画，超宽就横向压缩（不缩字高），留 pad 边。 */
function fitText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, font: string, sx = 1): void {
  g.save();
  g.font = font;
  const w = g.measureText(text).width * sx;
  const k = w > maxW ? maxW / w : 1;
  g.translate(cx, cy);
  g.scale(sx * k, 1);
  g.fillText(text, 0, 0);
  g.restore();
}

/** 把整张图集画到画布上（白字黑底）。 */
function paint(g: CanvasRenderingContext2D, L: AtlasLayout): void {
  g.fillStyle = '#000';
  g.fillRect(0, 0, L.w, L.h);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const B = L.blocks;
  // 电车目的地牌：一行，中文 / 英文轮流（每格一行字，字高约格高 0.62）
  TRAM_DESTINATIONS.forEach((d, i) => {
    const zh = cellRect(B.tramDest, i * 2);
    const en = cellRect(B.tramDest, i * 2 + 1);
    // 中文字距稍开（港式 LED 牌）
    const chars = [...d.zh];
    g.font = `bold 42px ${CJK}`;
    const step = Math.min(44, (zh.w - 16) / chars.length);
    chars.forEach((ch, k) => fitText(g, ch, zh.x + zh.w / 2 + (k - (chars.length - 1) / 2) * step, zh.y + zh.h / 2 + 1, step, `bold 42px ${CJK}`));
    fitText(g, d.en, en.x + en.w / 2, en.y + en.h / 2 + 1, en.w - 14, `bold 30px ${LATIN}`);
  });
  // 巴士 / 小巴目的地：中文上行（大）、英文大写下行（约一半高）
  BUS_DESTS.forEach((d, i) => {
    const r = cellRect(B.busDest, i);
    fitText(g, d.zh, r.x + r.w / 2, r.y + 18, r.w - 10, `bold 30px ${CJK}`);
    fitText(g, d.en, r.x + r.w / 2, r.y + 45, r.w - 10, `bold 17px ${LATIN}`);
  });
  ROUTE_NUMBERS.forEach((t, i) => {
    const r = cellRect(B.route, i);
    fitText(g, t, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 6, `bold 40px ${LATIN}`, 0.82);
  });
  // 车队编号数字：窄身无衬线（横向压到 0.7）
  for (let i = 0; i < 10; i++) {
    const r = cellRect(B.digits, i);
    fitText(g, String(i), r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 2, `bold 38px ${LATIN}`, 0.72);
  }
  // 城巴字样（深蓝字在着色器里上色；红色 C 标志由着色器画在两段字之间）
  const cz = cellRect(B.cbZh, 0);
  fitText(g, '城巴', cz.x + cz.w / 2, cz.y + cz.h / 2 + 1, cz.w - 6, `bold 36px ${CJK}`);
  const ce = cellRect(B.cbEn, 0);
  fitText(g, 'Citybus', ce.x + ce.w / 2, ce.y + ce.h / 2 + 1, ce.w - 8, `bold 38px 'Trebuchet MS','Verdana',${LATIN}`);
  // 九巴：粗、连笔感、略斜（斜切变换）
  const km = cellRect(B.kmb, 0);
  g.save();
  g.translate(km.x + km.w / 2, km.y + km.h / 2 + 2);
  g.transform(1, 0, -0.2, 1, 0, 0);
  g.font = `900 58px 'Arial Black','Inter',${LATIN}`;
  const kw = g.measureText('KMB').width;
  g.scale(Math.min(1, (km.w - 16) / kw), 1);
  g.fillText('KMB', 0, 0);
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.strokeText('KMB', 0, 0);
  g.restore();
  // 的士顶灯：TAXI（粗体大写，红色由着色器给）与竖排「的士」
  const tx = cellRect(B.taxi, 0);
  fitText(g, 'TAXI', tx.x + tx.w / 2, tx.y + tx.h / 2 + 2, tx.w - 8, `900 36px ${LATIN}`);
  const tz = cellRect(B.taxiZh, 0);
  fitText(g, '的', tz.x + tz.w / 2, tz.y + tz.h * 0.27, tz.w - 4, `bold 32px ${CJK}`);
  fitText(g, '士', tz.x + tz.w / 2, tz.y + tz.h * 0.74, tz.w - 4, `bold 32px ${CJK}`);
  // 小巴车顶带：白色窄身大写
  const pe = cellRect(B.plbEn, 0);
  fitText(g, 'PUBLIC LIGHT BUS 19 SEATS', pe.x + pe.w / 2, pe.y + pe.h / 2 + 1, pe.w - 8, `bold 26px ${LATIN}`, 0.8);
  const pz = cellRect(B.plbZh, 0);
  fitText(g, '公共小型巴士十九座位', pz.x + pz.w / 2, pz.y + pz.h / 2 + 1, pz.w - 8, `bold 26px ${CJK}`);
  BOAT_NAMES.forEach((t, i) => {
    const r = cellRect(B.boatNames, i);
    fitText(g, t, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 10, `bold 28px ${MIXED}`);
  });
  AD_WORDS.forEach((t, i) => {
    const r = cellRect(B.adWords, i);
    fitText(g, t, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 6, `900 44px ${CJK}`);
  });
  const sl = cellRect(B.sunLogo, 0);
  fitText(g, SUN_FERRY_LOGO, sl.x + sl.w / 2, sl.y + sl.h / 2 + 1, sl.w - 10, `bold 30px ${MIXED}`);
  // 九巴车型前缀：右对齐（后面接数字）
  KMB_CLASSES.forEach((t, i) => {
    const r = cellRect(B.kmbClass, i);
    g.save();
    g.textAlign = 'right';
    g.font = `bold 26px ${LATIN}`;
    g.translate(r.x + r.w - 2, r.y + r.h / 2 + 1);
    const w = g.measureText(t).width * 0.8;
    g.scale(0.8 * Math.min(1, (r.w - 6) / w), 1);
    g.fillText(t, 0, 0);
    g.restore();
  });
}

let cached: Texture | null = null;

/**
 * 纹理分辨率倍数：HIGH 1（1024 宽，≈ 1.3 MB），LOW 0.5（512 宽，≈ 0.34 MB；LOW 只在 30 m 内画字，半分辨率够用，
 * LOW 的显存账本很紧：桌面 DPR 1.25 时底数已约 62 MB / 64 MB）。版面与 GLSL 常量仍按逻辑像素，取样用归一化坐标，所以两档通用。
 */
export function atlasScale(tier: 'high' | 'low'): number {
  return tier === 'low' ? 0.5 : 1;
}

/** 图集纹理（只建一次）；没有 DOM（单元测试）时返回 null。 */
export function liveryAtlasTexture(): Texture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const L = LAYOUT;
  const k = atlasScale(getQuality().tier);
  const w = Math.round(L.w * k);
  const h = Math.round(L.h * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.scale(k, k);
  paint(g, L);
  const rgba = g.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4]!;
  const tex = new DataTexture(data, w, h, RedFormat, UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  tex.unpackAlignment = 1;
  tex.flipY = false;
  tex.needsUpdate = true;
  tex.name = 'liveries:atlas';
  registerTextureBytes('liveries:atlas', Math.round(w * h * (4 / 3)));
  cached = tex;
  return tex;
}

const f1 = (n: number) => n.toFixed(1);

/**
 * GLSL：图集常量与取样函数（需要 uniform sampler2D uLiv）。
 * - livTex(r, uv)：取像素矩形 r = (x, y, w, h) 里 uv（u 向右、v 向下，0–1）处的字形掩码，矩形外为 0；
 * - livCell(block, cols, i)：网格块第 i 格的矩形；
 * - livNumber(p, c, h, n)：以 c 为中心、字高 h 画整数 n（1–5 位），p 与 c 同一坐标系（右 +x、上 +y）。
 */
export function liveryAtlasGlsl(): string {
  const L = LAYOUT;
  const defs = (Object.entries(L.blocks) as [BlockName, GridBlock][])
    .map(([k, b]) => `const vec4 LIV_${k.toUpperCase()} = vec4(${f1(b.x)}, ${f1(b.y)}, ${f1(b.cw)}, ${f1(b.ch)});\nconst float LIV_${k.toUpperCase()}_COLS = ${f1(b.cols)};`)
    .join('\n');
  return /* glsl */ `
uniform sampler2D uLiv;
${defs}
const vec2 LIV_SIZE = vec2(${f1(L.w)}, ${f1(L.h)});
float livTex(vec4 r, vec2 uv) {
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec2 q = clamp(uv, 0.0, 1.0);
  // 半像素内缩：不取到相邻格
  vec2 px = r.xy + 0.5 + q * (r.zw - 1.0);
  return texture2D(uLiv, px / LIV_SIZE).r * inside;
}
vec4 livCell(vec4 b, float cols, float i) {
  float k = floor(i + 0.5);
  return vec4(b.x + mod(k, cols) * b.z, b.y + floor(k / cols) * b.w, b.z, b.w);
}
float livDigits(float n) {
  return n >= 9999.5 ? 5.0 : (n >= 999.5 ? 4.0 : (n >= 99.5 ? 3.0 : (n >= 9.5 ? 2.0 : 1.0)));
}
float livNumber(vec2 p, vec2 c, float h, float n) {
  float nd = livDigits(n);
  float w = h * 0.56;
  vec2 q = p - c + vec2(w * nd * 0.5, h * 0.5);
  if (q.x < 0.0 || q.x > w * nd || q.y < 0.0 || q.y > h) return 0.0;
  float k = floor(q.x / w);
  float e = nd - 1.0 - k;
  float div = e < 0.5 ? 1.0 : (e < 1.5 ? 10.0 : (e < 2.5 ? 100.0 : (e < 3.5 ? 1000.0 : 10000.0)));
  float d = mod(floor((n + 0.5) / div), 10.0);
  return livTex(livCell(LIV_DIGITS, LIV_DIGITS_COLS, d), vec2(fract(q.x / w), 1.0 - q.y / h));
}
`;
}
