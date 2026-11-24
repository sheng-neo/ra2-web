/**
 * 路灯布置（纯函数，可测）：沿每条画出来的道路，用与路面带状网格完全相同的重采样折线和沿线距离，
 * 按「间距 S、相位 φ、排布」规则放灯：第 k 盏在沿线 s = φ + k·S 处。路面 shader 拿同一组参数解析地算光斑，
 * 所以光斑与灯头精灵永远对得上。
 *
 * 规则（realism spec C1）：
 * - 间距：快速路 / 主干道 28 m，≥ 4 车道两侧对置，否则左右交错；次干道 30 m 交错；
 *   支路 / 街坊路 / 小路 35 m 单侧；行人街 20 m 柱顶灯（4 m）。
 * - 灯杆立在路缘外 0.8 m（人行道上），灯臂伸出 1.5–2.5 m 到车道上空；灯头高 10–12 m（主路）/ 8 m（支路、山路）。
 * - 颜色：钠灯概率 = streetWarmth × 0.5（快速路、主干道）/ × 0.6（次干道）/ × 1.4（其余，封顶 1），否则白光 LED。
 *   2026 年中环核心的主路、次干道几乎都已换成白光 LED（照片 09、10），钠灯留在横街、山路与旧区。
 *   同一条路（一段 way）用同一种灯：香港换灯按街道分批，同一段街颜色一致。
 * - 64 盏真实路灯（props.streetLamps）：落在某条路旁的，用它定这条路的相位与灯侧。
 *
 * 横向约定：side = +1 为折线前进方向的左侧（与 ribbon 的 across 同号），−1 为右侧。
 */
import type { RoadClass } from '@central/data';

/** 排布代码（写进顶点属性 aLamp.z，shader 按同一规则解码）。 */
export const LampPattern = {
  None: 0,
  Left: 1,
  Right: 2,
  /** 交错：k 为偶数在左。 */
  StaggerLeft: 3,
  /** 交错：k 为偶数在右。 */
  StaggerRight: 4,
  /** 两侧对置。 */
  Opposite: 5,
} as const;
export type LampPatternCode = (typeof LampPattern)[keyof typeof LampPattern];

export interface LampRule {
  /** 间距（m）。 */
  spacing: number;
  pattern: LampPatternCode;
  /** 灯头离路面高度（m）。 */
  headH: number;
  /** 灯臂伸出路缘的长度（m，灯头在车道上空）。 */
  overhang: number;
  /** 行人街的柱顶灯。 */
  postTop: boolean;
}

/** 路两端各留出的距离（m）：路口里不放灯。 */
export const LAMP_END_MARGIN_M = 2;
/** 灯杆离路缘的距离（m）。 */
export const POLE_KERB_OFFSET_M = 0.8;
/** 两盏灯（不同道路）之间小于此距离时只留一盏灯头。 */
export const LAMP_DEDUPE_M = 12;

const MAIN: ReadonlySet<RoadClass> = new Set(['motorway', 'trunk', 'primary']);

/** 道路等级 → 灯的间距与排布。side 是单侧布灯时用哪一侧（种子决定）。hill：地面 > 60 mPD 的山路。 */
export function lampRule(cls: RoadClass, lanes: number, side: 1 | -1, hill: boolean): LampRule | null {
  if (cls === 'pedestrian') return { spacing: 20, pattern: side > 0 ? LampPattern.Left : LampPattern.Right, headH: 4, overhang: 0, postTop: true };
  if (MAIN.has(cls)) {
    return {
      spacing: 28,
      pattern: lanes >= 4 ? LampPattern.Opposite : side > 0 ? LampPattern.StaggerLeft : LampPattern.StaggerRight,
      headH: hill ? 9 : 11,
      overhang: 2.2,
      postTop: false,
    };
  }
  if (cls === 'secondary') {
    return { spacing: 30, pattern: side > 0 ? LampPattern.StaggerLeft : LampPattern.StaggerRight, headH: hill ? 8 : 10, overhang: 2, postTop: false };
  }
  if (cls === 'footway' || cls === 'steps' || cls === 'path' || cls === 'cycleway') return null;
  return { spacing: 35, pattern: side > 0 ? LampPattern.Left : LampPattern.Right, headH: 8, overhang: 1.5, postTop: false };
}

/** 钠灯概率：streetWarmth × 等级系数。 */
export function sodiumProbability(cls: RoadClass, warmth: number): number {
  const k = MAIN.has(cls) ? 0.5 : cls === 'secondary' ? 0.6 : 1.4;
  return Math.min(Math.max(warmth * k, 0), 1);
}

/** 第 k 盏灯在哪些侧（+1 左 / −1 右）。 */
export function lampSides(pattern: number, k: number): (1 | -1)[] {
  const even = ((k % 2) + 2) % 2 === 0;
  switch (pattern) {
    case LampPattern.Left:
      return [1];
    case LampPattern.Right:
      return [-1];
    case LampPattern.StaggerLeft:
      return [even ? 1 : -1];
    case LampPattern.StaggerRight:
      return [even ? -1 : 1];
    case LampPattern.Opposite:
      return [1, -1];
    default:
      return [];
  }
}

export interface LampAlong {
  /** 沿线距离（m）。 */
  s: number;
  k: number;
  side: 1 | -1;
}

/** 一条路上全部灯位（沿线距离 m，按 k 递增）。len 为路长（m）。 */
export function lampsAlong(spacing: number, phase: number, pattern: number, len: number): LampAlong[] {
  const out: LampAlong[] = [];
  if (spacing <= 0 || pattern === LampPattern.None) return out;
  const k0 = Math.ceil((LAMP_END_MARGIN_M - phase) / spacing);
  for (let k = k0; ; k++) {
    const s = phase + k * spacing;
    if (s > len - LAMP_END_MARGIN_M) break;
    if (s < LAMP_END_MARGIN_M) continue;
    for (const side of lampSides(pattern, k)) out.push({ s, k, side });
  }
  return out;
}

/**
 * 用一盏真实路灯（沿线 s、侧 side）对齐这条路的相位与排布：相位 = s mod S；
 * 单侧排布改到真实灯所在一侧，交错排布按 k 的奇偶换成让第 k 盏落在该侧。
 */
export function snapToReal(spacing: number, pattern: LampPatternCode, s: number, side: 1 | -1): { phase: number; pattern: LampPatternCode } {
  const phase = ((s % spacing) + spacing) % spacing;
  const k = Math.round((s - phase) / spacing);
  const even = ((k % 2) + 2) % 2 === 0;
  if (pattern === LampPattern.Left || pattern === LampPattern.Right) return { phase, pattern: side > 0 ? LampPattern.Left : LampPattern.Right };
  if (pattern === LampPattern.StaggerLeft || pattern === LampPattern.StaggerRight) {
    const leftOnEven = even ? side > 0 : side < 0;
    return { phase, pattern: leftOnEven ? LampPattern.StaggerLeft : LampPattern.StaggerRight };
  }
  return { phase, pattern };
}

/** 32 位整数哈希（确定性，JS 与 GLSL 都好写）。 */
export function hash32(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 字符串 → 32 位种子（FNV-1a）。 */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** 种子 + 盐 → [0, 1) 均匀数。 */
export function unit(seed: number, salt: number): number {
  return hash32(seed ^ Math.imul(salt + 1, 0x9e3779b9)) / 4294967296;
}
