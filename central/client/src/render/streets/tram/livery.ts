/**
 * 电车涂装与目的地牌（R2 TRAMS T4 / T5）：纯数据 + 纯函数，按车的种子确定性分配。
 *
 * 红线（PLAN §1）：车身不写任何字、不放标志、不画车队编号；广告车身只用抽象色块 / 条纹 / 渐变。
 * - 抽象广告车身（≥ 75 %）：底色 + 2 个强调色，取自 12 组自拟配色；图案（斜条、大圆点、色块、渐变波浪、对角分色）在着色器里画。
 * - 传统深绿车身（HERITAGE_SHARE，整合定为 0 = 不用）：深绿车身、两层之间一条米色带、柚木色窗框、浅灰车顶，无徽号、无字。
 *   **待负责人定**：PLAN §1「品牌」一栏把电车营运商的外观列为「一律不用」，这只是一种配色、不含名称标志，
 *   但是否采用由整合者 / 负责人决定；设为 0 时这些车改用白色车身 + 一道色带。
 * - 白色车身 + 一道色带（约 10 %）。
 * 目的地牌只显示允许的地名（中文一行 + 英文一行）：西行车 堅尼地城 / 西營盤，东行车 筲箕灣 / 北角 / 銅鑼灣 / 跑馬地。
 */

/**
 * 传统深绿涂装的比例（0 = 不用）。整合（R2）定为 0：PLAN §1「品牌」把电车营运商的外观列为一律不用，
 * 深绿 + 米色带就是那套外观；改由抽象广告车身与白色车身撑起「叮叮」的辨识度（车身比例、双层窗、集电杆、目的地牌）。
 */
export const HERITAGE_SHARE = 0;
/** 白色车身的比例。 */
export const WHITE_SHARE = 0.1;

export const LiveryKind = { Wrap: 0, Heritage: 1, White: 2 } as const;
export type LiveryKind = (typeof LiveryKind)[keyof typeof LiveryKind];

/** 抽象广告车身的配色（sRGB）：[底色, 强调 1, 强调 2]。不对应任何真实品牌。 */
export const WRAP_PALETTES: readonly (readonly [string, string, string])[] = [
  ['#d8326e', '#f5a623', '#ffe36e'],
  ['#0f6e7a', '#14234b', '#e8eef0'],
  ['#c8202a', '#f2efe6', '#1b1b1f'],
  ['#f2c230', '#1d1d22', '#2f6bd8'],
  ['#6a3d9a', '#f07ab8', '#f4f0f6'],
  ['#5fb4e6', '#f6f6f2', '#f07a2a'],
  ['#8cc63f', '#3a2f6b', '#f4f6ee'],
  ['#d98a7a', '#f3d9c4', '#6b3a2e'],
  ['#1f4fb4', '#e3b23c', '#f5f5f2'],
  ['#202226', '#b9bec4', '#e03a32'],
  ['#ee7d30', '#f6ead2', '#127a80'],
  ['#9fd8c4', '#b8a6e0', '#fafaf6'],
];

/** 图案种类（着色器 PATTERN 分支）。 */
export const WRAP_PATTERNS = 5;

/** 传统深绿涂装（sRGB）。 */
export const HERITAGE = { body: '#1a4436', band: '#e8dcb5', frame: '#945735', roof: '#c9ccc8', skirt: '#313c35' } as const;
/** 白色车身 + 色带（色带从配色表里取）。 */
export const WHITE_BODY = '#e6e8e6';
export const ROOF_GREY = '#c9ccc8';
export const SKIRT_DARK = '#26292a';
export const POST_DARK = '#3a3d40';

/** 允许出现的目的地（中文、英文）：只用于电车目的地牌。 */
export const DESTINATIONS = [
  { zh: '堅尼地城', en: 'Kennedy Town', westbound: true },
  { zh: '西營盤', en: 'Sai Ying Pun', westbound: true },
  { zh: '筲箕灣', en: 'Shau Kei Wan', westbound: false },
  { zh: '北角', en: 'North Point', westbound: false },
  { zh: '銅鑼灣', en: 'Causeway Bay', westbound: false },
  { zh: '跑馬地', en: 'Happy Valley', westbound: false },
] as const;

/** 允许的地名全集（规格 / PLAN §1 名单）：目的地只能取自这里。 */
export const ALLOWED_PLACE_NAMES: ReadonlySet<string> = new Set([
  '堅尼地城',
  'Kennedy Town',
  '筲箕灣',
  'Shau Kei Wan',
  '跑馬地',
  'Happy Valley',
  '北角',
  'North Point',
  '西營盤',
  'Sai Ying Pun',
  '銅鑼灣',
  'Causeway Bay',
  '中環',
  'Central',
]);

/** 目的地牌样式：0 = 黑底橙色 LED 点阵，1 = 红底黄字灯箱。 */
export const DEST_LED = { fg: '#dca139', bg: '#0a0806' } as const;
export const DEST_BOX = { fg: '#f0c02a', bg: '#9c061c' } as const;

export interface CarLivery {
  kind: LiveryKind;
  /** sRGB 三色：车身底色、强调 1、强调 2。 */
  colours: [string, string, string];
  pattern: number;
  /** 窗柱同车身色（否则深灰）。 */
  postsBody: boolean;
  /** 目的地下标（DESTINATIONS）。 */
  dest: number;
  /** 目的地牌样式 0 / 1。 */
  destStyle: number;
  /** 0–1 稳定种子（乘客、图案相位）。 */
  seed: number;
}

export function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** sRGB 十六进制 → HSL（h 度，s、l 0–1）。 */
export function hexHsl(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  const r = ((v >> 16) & 255) / 255;
  const g = ((v >> 8) & 255) / 255;
  const b = (v & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

/** 绿 / 青色（色相 75°–200°、有饱和度、不太亮）。 */
const greenish = (hex: string) => {
  const [h, s, l] = hexHsl(hex);
  return h >= 75 && h <= 200 && s > 0.2 && l < 0.72;
};
/** 米 / 白 / 浅色。 */
const lightish = (hex: string) => hexHsl(hex)[2] > 0.72;

/**
 * 会不会让人一眼看成营运商的「绿车身 + 米色」两色（PLAN §1：营运商涂装一律不用）：
 * 上层主色是绿 / 青、下层主色是米 / 白（或反过来）的分色图案。各图案的上下层主色见 material.ts livery()。
 */
export function evokesOperatorLivery(kind: LiveryKind, pattern: number, colours: readonly [string, string, string]): boolean {
  if (kind === LiveryKind.Heritage) return true;
  if (kind === LiveryKind.White) return greenish(colours[1]) && greenish(colours[2]);
  // 色块、对角分色：上层 c0、下层 c1；渐变波浪：下层 c0、上层偏 c1；斜条与圆点：上下同一底色
  const split = pattern === 2 || pattern === 4 ? [colours[0], colours[1]] : pattern === 3 ? [colours[1], colours[0]] : null;
  if (!split) return false;
  const [upper, lower] = split as [string, string];
  return (greenish(upper) && lightish(lower)) || (lightish(upper) && greenish(lower));
}

/** 第 carSeed 号车的涂装（确定性）。heritageShare 可覆盖默认比例（测试用）。 */
export function carLivery(carSeed: number, westbound: boolean, heritageShare = HERITAGE_SHARE): CarLivery {
  const u = hash01(carSeed * 2654435761 + 11);
  const kind = u < heritageShare ? LiveryKind.Heritage : u < heritageShare + WHITE_SHARE ? LiveryKind.White : LiveryKind.Wrap;
  const pattern = Math.floor(hash01(carSeed * 977 + 1) * WRAP_PATTERNS);
  // 配色：抽到会像营运商绿 + 米两色的组合就顺延到下一套（确定性）
  let pi = Math.floor(hash01(carSeed * 40503 + 3) * WRAP_PALETTES.length);
  for (let k = 0; k < WRAP_PALETTES.length; k++) {
    const p = WRAP_PALETTES[(pi + k) % WRAP_PALETTES.length]!;
    const cols: [string, string, string] = kind === LiveryKind.White ? [WHITE_BODY, p[0], p[1]] : [p[0], p[1], p[2]];
    if (kind === LiveryKind.Heritage || !evokesOperatorLivery(kind, pattern, cols)) {
      pi = (pi + k) % WRAP_PALETTES.length;
      break;
    }
  }
  const pal = WRAP_PALETTES[pi]!;
  const dests = DESTINATIONS.map((d, i) => ({ d, i })).filter((o) => o.d.westbound === westbound);
  const dest = dests[Math.floor(hash01(carSeed * 7 + 5) * dests.length)]!.i;
  const colours: [string, string, string] =
    kind === LiveryKind.Heritage ? [HERITAGE.body, HERITAGE.band, HERITAGE.frame] : kind === LiveryKind.White ? [WHITE_BODY, pal[0], pal[1]] : [pal[0], pal[1], pal[2]];
  return {
    kind,
    colours,
    pattern,
    postsBody: hash01(carSeed * 31 + 9) < 0.6,
    dest,
    destStyle: hash01(carSeed * 13 + 2) < 0.6 ? 0 : 1,
    seed: hash01(carSeed * 101 + 17),
  };
}
