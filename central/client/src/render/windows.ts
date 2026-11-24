/**
 * 窗灯规律：建筑 shader（materials/building.ts 的 GLSL_WINDOWS）的 TS 镜像，逐位一致，供单元测试与调参。
 *
 * 写字楼（visual-facts §3）：亮灯按「楼层 + 租户」成片，不是椒盐噪点；但也不是整层通亮的「条形码」。
 * - 每栋楼的租户占 1–4 个连续楼层（楼层组 stack）；
 * - 每层先抽状态：整层熄灯 12–18 %、整层通亮 4–8 %（深夜按目标亮灯率压低），其余为「租户段」楼层；
 * - 租户段楼层沿立面按 3–14 个窗距切段，每段整体亮或灭；同一楼层组的段落相同，形成竖向成组的相似楼层；
 * - 亮着的段（含整层通亮）里约 15 % 的单个窗距是暗的（空位、拉下的百叶）——近看能分出一扇扇窗；
 * - 总亮灯率随当地钟点 uClock：18:30 0.60 · 19:00 0.58 · 20:00 0.38 · 21:00 0.25 · 22:00 0.18 · 23:00 0.12 · 01:00 0.08。
 * 住宅（§4）：按户亮灯（同层相邻 2–3 扇窗），户亮灯后每扇窗 75 % 亮；钟点表 19:00 0.22 · 20:00 0.28 · 21:00 0.32 ·
 * 22:00 0.30 · 23:00 0.24 · 01:00 0.10；55–65 % 暖光、35–45 % 冷白光管。
 *
 * 哈希：32 位整数混洗（WebGL2 的 uint 运算），TS 用 Math.imul 逐位复现，所以测试里的统计就是画面上的统计。
 * 整数输入必须非负（shader 里先加 OFFSET 再转 uint）。
 */

/** 楼层号的偏移：v 可为负（楼底以下的墙），加上它再转无符号整数。 */
export const INT_OFFSET = 4096;

/** 32 位整数混洗（lowbias32）。 */
export function mix32(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** 三个非负整数 → [0, 1)，24 位精度（与 GLSL hash3 相同）。 */
export function hash3(a: number, b: number, c: number): number {
  const h = mix32(((a >>> 0) ^ mix32(((b >>> 0) + 0x9e3779b9) >>> 0) ^ mix32((Math.imul(c >>> 0, 0x85ebca6b) + 0xc2b2ae35) >>> 0)) >>> 0);
  return (h >>> 8) / 16777216;
}

/** 分段线性表 [钟点, 值]（钟点 18–26，超出两端取端值）。 */
function piecewise(table: readonly (readonly [number, number])[], x: number): number {
  if (x <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    if (x <= x1) {
      const [x0, y0] = table[i - 1]!;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1]![1];
}

export const OFFICE_LIT_TABLE = [
  [18.5, 0.6],
  [19, 0.58],
  [20, 0.38],
  [21, 0.25],
  [22, 0.18],
  [23, 0.12],
  [25, 0.08],
] as const;

export const HOME_LIT_TABLE = [
  [18, 0.15],
  [19, 0.22],
  [20, 0.28],
  [21, 0.32],
  [22, 0.3],
  [23, 0.24],
  [25, 0.1],
] as const;

/** 写字楼目标亮灯率（窗的比例）。 */
export function officeLitTarget(clock: number): number {
  return piecewise(OFFICE_LIT_TABLE, clock);
}

/** 住宅目标亮灯率（窗的比例）。 */
export function homeLitTarget(clock: number): number {
  return piecewise(HOME_LIT_TABLE, clock);
}

/** GLSL 版的分段线性表（与上面两张表相同）。 */
export function glslPiecewise(name: string, table: readonly (readonly [number, number])[]): string {
  const lines = [`float ${name}(float x) {`, `  if (x <= ${table[0]![0].toFixed(3)}) return ${table[0]![1].toFixed(4)};`];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1]!;
    const [x1, y1] = table[i]!;
    lines.push(`  if (x <= ${x1.toFixed(3)}) return mix(${y0.toFixed(4)}, ${y1.toFixed(4)}, (x - ${x0.toFixed(3)}) / ${(x1 - x0).toFixed(3)});`);
  }
  lines.push(`  return ${table[table.length - 1]![1].toFixed(4)};`, '}');
  return lines.join('\n');
}

/** 一栋写字楼的灯光参数（只取决于楼的整数键）。 */
export interface OfficeParams {
  /** 租户楼层组跨的层数 1–4。 */
  span: number;
  /** 楼层组起点偏移 0–3。 */
  stackOffset: number;
  /** 整层熄灯比例 0.12–0.18。 */
  dark: number;
  /** 整层通亮比例上限 0.04–0.08（实际取 min(它, 0.55 × 目标)）。 */
  fullMax: number;
}

/** 亮着的段里单个窗距熄灯的比例（空位、百叶）。 */
export const OFFICE_BAY_DROP = 0.15;

export function officeParams(key: number): OfficeParams {
  return {
    span: 1 + Math.floor(hash3(key, 11, 0) * 4),
    stackOffset: Math.floor(hash3(key, 12, 0) * 4),
    dark: 0.12 + 0.06 * hash3(key, 13, 0),
    fullMax: 0.04 + 0.04 * hash3(key, 14, 0),
  };
}

export type FloorState = 'dark' | 'full' | 'runs';

/** 楼层组号（floor 已含 INT_OFFSET）。 */
export function officeStack(key: number, floor: number): number {
  const p = officeParams(key);
  return Math.floor((floor + p.stackOffset) / p.span);
}

/** 写字楼一层的状态（floor 已含 INT_OFFSET）。 */
export function officeFloorState(key: number, floor: number, clock: number): FloorState {
  const p = officeParams(key);
  const target = officeLitTarget(clock);
  const full = Math.min(p.fullMax, 0.55 * target);
  const stack = officeStack(key, floor);
  // 楼层状态大多随租户组，20 % 的楼层另抽
  let r = hash3(key, stack, 21);
  if (hash3(key, floor, 22) < 0.2) r = hash3(key, floor, 23);
  if (r < p.dark) return 'dark';
  if (r > 1 - full) return 'full';
  return 'runs';
}

/** 租户段长度（窗距数，3–14），同一楼层组相同。 */
export function officeRunLength(key: number, stack: number): number {
  return 3 + Math.floor(hash3(key, stack, 24) * 12);
}

/** 窗所在的租户段号。 */
export function officeRun(key: number, stack: number, bay: number): number {
  const len = officeRunLength(key, stack);
  const off = Math.floor(hash3(key, stack, 25) * len);
  return Math.floor((bay + off) / len);
}

/** 租户段楼层里一段亮灯的概率（扣掉单窗熄灯后，使总亮灯率 = 目标）。 */
export function officeRunProbability(key: number, clock: number): number {
  const p = officeParams(key);
  const target = officeLitTarget(clock);
  const full = Math.min(p.fullMax, 0.55 * target);
  return Math.min(Math.max((target / (1 - OFFICE_BAY_DROP) - full) / (1 - p.dark - full), 0), 1);
}

/** 亮着的段里这个窗距是否熄灯（空位、百叶）。 */
export function officeBayDropped(key: number, floor: number, bay: number): boolean {
  return hash3(key, floor * 977 + bay, 30) < OFFICE_BAY_DROP;
}

/** 写字楼的一扇窗（floor 已含 INT_OFFSET，bay ≥ 0）是否亮灯。 */
export function officeWindowLit(key: number, floor: number, bay: number, clock: number): boolean {
  const state = officeFloorState(key, floor, clock);
  if (state === 'dark') return false;
  if (state === 'runs') {
    const stack = officeStack(key, floor);
    if (hash3(key, stack * 977 + officeRun(key, stack, bay), 26) >= officeRunProbability(key, clock)) return false;
  }
  return !officeBayDropped(key, floor, bay);
}

/**
 * 租户亮度（乘在亮窗剖面上）：近似对数正态，0.3–1.5，多数租户偏暗、少数很亮；
 * 整层通亮的楼层（大租户 / 交易大堂）比零散租户亮且匀（0.65–1.35）。
 */
export function officeTenantBrightness(h: number, fullFloor: boolean): number {
  return fullFloor ? 0.65 + 0.7 * h * h : 0.3 + 1.2 * h * h;
}

export type OfficeTint = 'warm' | 'neutral' | 'cool';

/** 租户灯色：11 % 暖白，其余中性 / 冷白（约 2 : 1）。 */
export function officeTint(key: number, stack: number, run: number): OfficeTint {
  const h = hash3(key, stack * 977 + run, 27);
  return h < 0.11 ? 'warm' : h < 0.7 ? 'neutral' : 'cool';
}

/** 住宅：一户（floor 已含 INT_OFFSET，flat ≥ 0）是否开灯。 */
export function homeFlatLit(key: number, floor: number, flat: number, clock: number): boolean {
  return hash3(key, floor * 613 + flat, 61) < homeLitTarget(clock) / HOME_WINDOW_GIVEN_FLAT;
}

/** 一户开灯时每扇窗亮的概率。 */
export const HOME_WINDOW_GIVEN_FLAT = 0.75;

/** 住宅一扇窗是否亮灯（slot 为户内窗序号 0–3）。 */
export function homeWindowLit(key: number, floor: number, flat: number, slot: number, clock: number): boolean {
  return homeFlatLit(key, floor, flat, clock) && hash3(key, floor * 613 + flat, 62 + slot) < HOME_WINDOW_GIVEN_FLAT;
}

/** 住宅一户的灯色：60 % 暖、40 % 冷。 */
export function homeWarm(key: number, floor: number, flat: number): boolean {
  return hash3(key, floor * 613 + flat, 66) < 0.6;
}

const OFFICE_BAY_DROP_GLSL = OFFICE_BAY_DROP.toFixed(3);

/** GLSL：与上面逐位一致的哈希与亮灯规律（需要 uniform float uClock）。 */
export const GLSL_WINDOWS = /* glsl */ `
uint mix32(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
float hash3(int a, int b, int c) {
  uint h = mix32(uint(a) ^ mix32(uint(b) + 0x9e3779b9u) ^ mix32(uint(c) * 0x85ebca6bu + 0xc2b2ae35u));
  return float(h >> 8u) / 16777216.0;
}
${glslPiecewise('officeLitTarget', OFFICE_LIT_TABLE)}
${glslPiecewise('homeLitTarget', HOME_LIT_TABLE)}
int officeStack(int key, int fl) {
  int span = 1 + int(hash3(key, 11, 0) * 4.0);
  int off = int(hash3(key, 12, 0) * 4.0);
  return (fl + off) / span;
}
// 返回 (亮 0/1, 楼层组, 租户段)；整层通亮的楼层租户段号记为 −1（亮度另算）
vec3 officeLit(int key, int fl, int bay, float clock) {
  float target = officeLitTarget(clock);
  float dark = 0.12 + 0.06 * hash3(key, 13, 0);
  float full = min(0.04 + 0.04 * hash3(key, 14, 0), 0.55 * target);
  int stack = officeStack(key, fl);
  float r = hash3(key, stack, 21);
  if (hash3(key, fl, 22) < 0.2) r = hash3(key, fl, 23);
  int len = 3 + int(hash3(key, stack, 24) * 12.0);
  int off = int(hash3(key, stack, 25) * float(len));
  int run = (bay + off) / len;
  float keep = hash3(key, fl * 977 + bay, 30) < ${OFFICE_BAY_DROP_GLSL} ? 0.0 : 1.0;
  if (r < dark) return vec3(0.0, float(stack), float(run));
  if (r > 1.0 - full) return vec3(keep, float(stack), -1.0);
  float p = clamp((target / (1.0 - ${OFFICE_BAY_DROP_GLSL}) - full) / (1.0 - dark - full), 0.0, 1.0);
  return vec3(hash3(key, stack * 977 + run, 26) < p ? keep : 0.0, float(stack), float(run));
}
float homeWindowLit(int key, int fl, int flat_, int slot, float clock) {
  float pf = homeLitTarget(clock) / ${HOME_WINDOW_GIVEN_FLAT.toFixed(2)};
  int k = fl * 613 + flat_;
  return hash3(key, k, 61) < pf && hash3(key, k, 62 + slot) < ${HOME_WINDOW_GIVEN_FLAT.toFixed(2)} ? 1.0 : 0.0;
}
`;
