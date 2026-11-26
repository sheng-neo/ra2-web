/**
 * 电车涂装、车队编号与目的地牌（R3 LIVERIES，取代 R2 的抽象车身）：纯数据 + 纯函数，按车的种子确定性分配。
 *
 * 负责人 2026-11-26 拍板（PLAN §1「品牌」）：电车按真实涂装与外观做，营运商的车队编号、目的地可以出现；车身广告仍是虚构的。
 * - 标准涂装（STANDARD_SHARE ≈ 25 %，surfaces-facts §1.1，照片 01）：光面深青绿车身（反照率 #42605d），窗框窗柱同色，
 *   车顶 #374c50，车顶一端白色百叶冷气箱 #c8c7c9，两端全宽黑色防撞杠 #2c2b30（0.02–0.11 H）；车身侧面与两端都没有营运商字样。
 * - 广告车身（其余，§1.4，照片 02 / 03）：按真实广告车的包法——下层板、两层之间的广告带（最大一块）、两端板、檐口字牌、窗柱、
 *   车顶两侧都包；玻璃、防撞杠、车顶面、冷气箱、集电杆、灯、目的地牌、车队编号不包。内容虚构：大块几何插画（色块、渐变、
 *   几何拼成的「吉祥物」……）配 12 + 4 组自拟配色，部分车再加一个招牌白名单里的行业通称（AD_WORDS），没有任何品牌或标语。
 *   约三成广告车下层有两扇窗贴了网点单向透视贴（P1）。
 * - 车队编号（§1.2）：每车唯一，1–170 去掉 28、128（开篷观光车），白色窄身数字，画在两端顶角与防撞杠右侧。
 * - 目的地（§1.6，transit-data.ts TRAM_DESTINATIONS）：西行车显示西端总站（堅尼地城 / 石塘咀 / 上環(西港城)），
 *   东行车显示东端（跑馬地 / 銅鑼灣 / 北角 / 筲箕灣）；牌上一行字，中文与英文每 4 s 轮换（material.ts）。
 */
import { AD_WORDS } from '../liveries/atlas';
import { TRAM_DESTINATIONS } from '../transit-data';

/** 标准涂装车的比例（20–30 %，规格 L-T1）。 */
export const STANDARD_SHARE = 0.25;
/** 广告车里带一个行业通称的比例。 */
export const WRAP_WORD_SHARE = 0.45;
/** 广告车里下层两扇窗贴网点透视贴的比例（P1）。 */
export const PERFORATED_SHARE = 0.3;

export const LiveryKind = { Wrap: 0, Standard: 1 } as const;
export type LiveryKind = (typeof LiveryKind)[keyof typeof LiveryKind];

/** 标准涂装（sRGB，surfaces-facts §1.1 照片 01 实测）。 */
export const STANDARD = { body: '#42605d', roof: '#374c50', bumper: '#2c2b30', ac: '#c8c7c9' } as const;
/** 广告车车顶面（不包）。 */
export const WRAP_ROOF = '#4a5356';

/** 虚构广告车身的配色（sRGB）：[底色, 强调 1, 强调 2]。不对应任何真实品牌。 */
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
  // 照片 02 / 03 的常见底色：蓝紫、饱和绿、浅蓝
  ['#4e62a8', '#dfe6f6', '#f2c14e'],
  ['#2f9a3e', '#c4262e', '#f7e36a'],
  ['#9cc8ea', '#ffffff', '#e2477a'],
  ['#e9e4da', '#d43d2f', '#2b2b30'],
];

/** 图案种类（着色器 PATTERN 分支）：斜色块、大圆点、天空渐变 + 大圆、几何吉祥物、波浪条、对角分色。 */
export const WRAP_PATTERNS = 6;

/** 车队编号上限与不用的号（28、128 是开篷观光车）。 */
export const FLEET_MAX = 170;
export const SPECIAL_FLEET: readonly number[] = [28, 128];

/** 目的地牌：黑底琥珀 LED（照片 01 litcol #e4a648）。 */
export const DEST_LED = { fg: '#e4a648', bg: '#0a0806' } as const;

/** 西行 / 东行车的目的地权重（TRAM_DESTINATIONS 下标 → 权重）。 */
const DEST_WEIGHT: Record<string, number> = {
  堅尼地城: 0.6,
  石塘咀: 0.2,
  '上環(西港城)': 0.2,
  跑馬地: 0.25,
  銅鑼灣: 0.15,
  北角: 0.25,
  筲箕灣: 0.35,
};

export interface CarLivery {
  kind: LiveryKind;
  /** sRGB 三色：标准车 = 车身、车顶、防撞杠；广告车 = 底色、强调 1、强调 2。 */
  colours: [string, string, string];
  pattern: number;
  /** 目的地（TRAM_DESTINATIONS 下标）。 */
  dest: number;
  /** 车队编号（1–170，不含 28、128）。 */
  fleet: number;
  /** 广告字（AD_WORDS 下标，−1 = 无字）。 */
  word: number;
  /** 下层两扇窗贴网点透视贴。 */
  perforated: boolean;
  /** 0–1 稳定种子（乘客、图案相位、目的地牌轮换相位）。 */
  seed: number;
}

export function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 可用的车队编号（1–170 去掉特殊车）。 */
export function fleetPool(): number[] {
  const out: number[] = [];
  for (let k = 1; k <= FLEET_MAX; k++) if (!SPECIAL_FLEET.includes(k)) out.push(k);
  return out;
}

/** n 辆车的车队编号：按 salt 洗牌后取前 n 个（每车唯一；n ≤ 168）。 */
export function fleetNumbers(n: number, salt: number): number[] {
  const pool = fleetPool();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(hash01(salt * 7919 + i * 104729) * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(n, pool.length));
}

/**
 * n 辆车里哪几辆是标准涂装：恰好 round(n × share) 辆（按种子排序取前几），heroes（开场主角）一定是标准车。
 */
export function standardMask(n: number, salt: number, share = STANDARD_SHARE, heroes: readonly number[] = []): boolean[] {
  const want = Math.round(n * share);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => hash01(salt + a * 2654435761) - hash01(salt + b * 2654435761));
  const hs = [...new Set(heroes.filter((h) => h >= 0 && h < n))].slice(0, want);
  // 先放主角车，再按种子顺序补足（总数不变）
  const pick = new Set(hs);
  for (const i of order) {
    if (pick.size >= want) break;
    pick.add(i);
  }
  return Array.from({ length: n }, (_, i) => pick.has(i));
}

/** 按权重抽目的地（只取对应方向的）。 */
export function pickDestination(u: number, westbound: boolean): number {
  const opts = TRAM_DESTINATIONS.map((d, i) => ({ i, w: d.westbound === westbound ? (DEST_WEIGHT[d.zh] ?? 0.1) : 0 })).filter((o) => o.w > 0);
  const total = opts.reduce((a, o) => a + o.w, 0);
  let r = u * total;
  for (const o of opts) {
    r -= o.w;
    if (r < 0) return o.i;
  }
  return opts[opts.length - 1]!.i;
}

/** 第 carSeed 号车的涂装（确定性）。standard / fleet 由车队整体分配（tramFleet）。 */
export function carLivery(carSeed: number, westbound: boolean, standard: boolean, fleet: number): CarLivery {
  const pattern = Math.floor(hash01(carSeed * 977 + 1) * WRAP_PATTERNS);
  const pal = WRAP_PALETTES[Math.floor(hash01(carSeed * 40503 + 3) * WRAP_PALETTES.length)]!;
  const dest = pickDestination(hash01(carSeed * 7 + 5), westbound);
  const seed = hash01(carSeed * 101 + 17);
  if (standard) {
    return { kind: LiveryKind.Standard, colours: [STANDARD.body, STANDARD.roof, STANDARD.bumper], pattern: 0, dest, fleet, word: -1, perforated: false, seed };
  }
  const word = hash01(carSeed * 313 + 7) < WRAP_WORD_SHARE ? Math.floor(hash01(carSeed * 53 + 11) * AD_WORDS.length) : -1;
  return {
    kind: LiveryKind.Wrap,
    colours: [pal[0], pal[1], pal[2]],
    pattern,
    dest,
    fleet,
    word,
    perforated: hash01(carSeed * 211 + 13) < PERFORATED_SHARE,
    seed,
  };
}

/**
 * 整个车队的涂装：cars[i] = 第 i 辆车的种子与方向；heroes = 开场主角（例如西行第 0 号车，「電車」机位迎面开来那辆），一定是标准涂装。
 * 车队编号每车唯一。
 */
export function tramFleet(cars: readonly { seed: number; westbound: boolean }[], heroes: readonly number[] = [], salt = 1904): CarLivery[] {
  const std = standardMask(cars.length, salt, STANDARD_SHARE, heroes);
  const fleet = fleetNumbers(cars.length, salt);
  return cars.map((c, i) => carLivery(c.seed, c.westbound, std[i]!, fleet[i] ?? 1 + (i % FLEET_MAX)));
}
