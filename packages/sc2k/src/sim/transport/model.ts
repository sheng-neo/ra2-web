// ===== sim/transport/model.ts =====（spec:transport §2.1–§2.3、§3.1、§3.6）
// 交通域的纯常量与纯函数：出行模式、方向掩码、各网络族在某个瓦片上的"可连通方向"、交叉件对照表、车站种类。
// 不持有状态；所有集合谓词沿用 contracts/net 的 NET_FLAGS，不另抄区间。
import { Dir, XBit, dirBit } from '../../contracts/grid';
import { NET_BASE, StationKind } from '../../contracts/net';
import type { NetFamily } from '../../contracts/net';
import { onrampWorldOrient } from '../../contracts/rotation';

/** 出行模式（spec §3.6 Mode）。 */
export const enum Mode {
  Road = 0, Highway = 1, Tunnel = 2, RoadBridge = 3, Walk = 4, WalkHighway = 5, WalkTunnel = 6, WalkBridge = 7,
  Bus = 8, Exit = 9, RailEnter = 10, SubwayEnter = 11, Rail = 12, Subway = 13,
}
export const MODE_COUNT = 14;

/** 方向掩码（bit0=T bit1=R bit2=B bit3=L）。 */
export const MASK_TB = dirBit(Dir.T) | dirBit(Dir.B);   // 0b0101
export const MASK_LR = dirBit(Dir.L) | dirBit(Dir.R);   // 0b1010
export const MASK_ALL = 0b1111;
export const isStraightMask = (m: number): boolean => m === MASK_TB || m === MASK_LR;
/** 单方向 → 所在轴的直线；0 → 族默认（地表族 L-R）；其余原样。 */
export function normalizeStraight(m: number): number {
  if (m === 0) return MASK_LR;
  if (m === dirBit(Dir.T) || m === dirBit(Dir.B)) return MASK_TB;
  if (m === dirBit(Dir.L) || m === dirBit(Dir.R)) return MASK_LR;
  return m;
}

/** 15 片段 idx 的直线轴：0 / 3 / 5 → L-R；1 / 2 / 4 → T-B；弯 / 三岔 / 十字 → 0。 */
export function straightAxisOfIdx(idx: number): number {
  if (idx === 0 || idx === 3 || idx === 5) return MASK_LR;
  if (idx === 1 || idx === 2 || idx === 4) return MASK_TB;
  return 0;
}
/** 坡面件 idx 2..5 的"低端"方向：2 (T 高) → B；3 (R 高) → L；4 (B 高) → T；5 (L 高) → R。 */
export const SLOPE_LOW_END: Readonly<Record<number, Dir>> = { 2: Dir.B, 3: Dir.L, 4: Dir.T, 5: Dir.R };
/** 坡面码 1..4 所在的轴（1 / 3 = T-B；2 / 4 = L-R）。 */
export const slopeAxis = (s: number): number => (s === 1 || s === 3 ? MASK_TB : MASK_LR);

/** 翻转族（桥件 / 高架电线）的行进轴：Flipped 清零 = T–B（与吊桥"起始段 B / 末端段 T"的命名一致），置位 = L–R。 */
export const BRIDGE_UNFLIPPED_AXIS = MASK_TB;
export const bridgeAxis = (xbit: number): number => ((xbit & XBit.Flipped) !== 0 ? MASK_LR : MASK_TB);

/** 隧道口朝向：0x3F T / 0x40 R / 0x41 B / 0x42 L → 轴。 */
export const portalAxis = (id: number): number => (id === 0x3f || id === 0x41 ? MASK_TB : MASK_LR);
/** 地铁↔铁路转换件朝向：0x6C T / 0x6D R / 0x6E B / 0x6F L。 */
export const subRailFacing = (id: number): Dir => ((id - 0x6c) & 3) as Dir;

export type SurfaceFamily = 'power' | 'road' | 'rail';
export type CrossFamily = SurfaceFamily | 'highway';
export const isSurfaceFamily = (f: NetFamily): f is SurfaceFamily => f === 'power' || f === 'road' || f === 'rail';

/** 1×1 交叉件对照（spec §2.2）：每个 ID 恰含两族，各带自己的轴。 */
export const CROSSOVERS: ReadonlyArray<{ id: number; a: CrossFamily; aAxis: number; b: CrossFamily; bAxis: number }> = [
  { id: 0x43, a: 'power', aAxis: MASK_TB, b: 'road', bAxis: MASK_LR },
  { id: 0x44, a: 'power', aAxis: MASK_LR, b: 'road', bAxis: MASK_TB },
  { id: 0x45, a: 'road', aAxis: MASK_LR, b: 'rail', bAxis: MASK_TB },
  { id: 0x46, a: 'road', aAxis: MASK_TB, b: 'rail', bAxis: MASK_LR },
  { id: 0x47, a: 'power', aAxis: MASK_TB, b: 'rail', bAxis: MASK_LR },
  { id: 0x48, a: 'power', aAxis: MASK_LR, b: 'rail', bAxis: MASK_TB },
  { id: 0x4b, a: 'highway', aAxis: MASK_LR, b: 'road', bAxis: MASK_TB },
  { id: 0x4c, a: 'highway', aAxis: MASK_TB, b: 'road', bAxis: MASK_LR },
  { id: 0x4d, a: 'highway', aAxis: MASK_LR, b: 'rail', bAxis: MASK_TB },
  { id: 0x4e, a: 'highway', aAxis: MASK_TB, b: 'rail', bAxis: MASK_LR },
  { id: 0x4f, a: 'highway', aAxis: MASK_LR, b: 'power', bAxis: MASK_TB },
  { id: 0x50, a: 'highway', aAxis: MASK_TB, b: 'power', bAxis: MASK_LR },
];
const CROSS_BY_ID: ReadonlyMap<number, (typeof CROSSOVERS)[number]> = new Map(CROSSOVERS.map((c) => [c.id, c]));
export const isCrossover = (id: number): boolean => CROSS_BY_ID.has(id);
/** 交叉件中族 f 的轴；不含该族 → 0。 */
export function crossoverAxis(id: number, f: CrossFamily): number {
  const c = CROSS_BY_ID.get(id);
  if (!c) return 0;
  return c.a === f ? c.aAxis : c.b === f ? c.bAxis : 0;
}
/** 给定两族及各自轴，查交叉件 ID；不存在（同族 / 平行 / 不支持的组合）→ −1。 */
export function crossoverFor(f: CrossFamily, fAxis: number, g: CrossFamily, gAxis: number): number {
  if (f === g || fAxis === gAxis) return -1;
  for (const c of CROSSOVERS) {
    if ((c.a === f && c.aAxis === fAxis && c.b === g && c.bAxis === gAxis) || (c.a === g && c.aAxis === gAxis && c.b === f && c.bAxis === fAxis)) return c.id;
  }
  return -1;
}

/** 地表族 15 片段（含坡面件）的区间判定与 idx。 */
export const familyPieceIdx = (f: SurfaceFamily, id: number): number => {
  const k = id - NET_BASE[f];
  return k >= 0 && k < 15 ? k : -1;
};
export const isRailHalf = (id: number): boolean => id >= 0x3b && id <= 0x3e;
export const isRailSlope = (id: number): boolean => id >= 0x2e && id <= 0x31;
/** 铁路半高件 0x3B..0x3E → 对应坡面件 idx 2..5。 */
export const railHalfIdx = (id: number): number => id - 0x3b + 2;

/**
 * 地表族 f 在瓦片 (id, xbit) 上可向哪些方向连通（spec §2.1 拼接规则的"可连接的同族格"）：
 *  平地 15 片段任意朝向（放置后会被重新选片）→ 四向；坡面件 / 半高件 / 交叉件 / 隧道口 / 桥段 / 匝道 / 转换件只沿固定轴；不含该族 → 0。
 */
export function surfaceConnMask(f: SurfaceFamily, id: number, xbit: number): number {
  const k = familyPieceIdx(f, id);
  if (k >= 0) return k >= 2 && k <= 5 ? straightAxisOfIdx(k) : MASK_ALL;
  const x = crossoverAxis(id, f);
  if (x !== 0) return x;
  switch (f) {
    case 'road':
      if (id >= 0x3f && id <= 0x42) return portalAxis(id);
      if (id >= 0x51 && id <= 0x59) return bridgeAxis(xbit);
      if (id >= 0x5d && id <= 0x60) { const o = onrampWorldOrient(id, xbit); return o ? dirBit(o.road) : 0; }
      return 0;
    case 'rail':
      if (isRailHalf(id)) return straightAxisOfIdx(railHalfIdx(id));
      if (id === 0x5a || id === 0x5b) return bridgeAxis(xbit);
      if (id >= 0x6c && id <= 0x6f) return dirBit(subRailFacing(id));
      return 0;
    case 'power':
      if (id === 0x5c) return bridgeAxis(xbit);
      return 0;
  }
}
/** 地下族（XUND）在值 u 上的可连通方向：地铁 0x01–0x0F / 管线 0x10–0x1E 四向；0x1F / 0x20 各沿自己的轴；0x23 地铁入口四向（地铁族）。 */
export function undConnMask(f: 'subway' | 'pipe', u: number): number {
  if (f === 'subway') {
    if (u >= 0x01 && u <= 0x0f) return MASK_ALL;
    if (u === 0x1f) return MASK_LR;        // 水管 TB × 地铁 LR
    if (u === 0x20) return MASK_TB;        // 水管 LR × 地铁 TB
    if (u === 0x23) return MASK_ALL;
    return 0;
  }
  if (u >= 0x10 && u <= 0x1e) return MASK_ALL;
  if (u === 0x1f) return MASK_TB;
  if (u === 0x20) return MASK_LR;
  return 0;
}
/** 地表上的"平地直线"元素（可被另一族以直角交叉覆盖）：返回族与轴，否则 null。 */
export function foreignStraight(id: number): { f: CrossFamily; axis: number } | null {
  if (id === NET_BASE.power) return { f: 'power', axis: MASK_LR };
  if (id === NET_BASE.power + 1) return { f: 'power', axis: MASK_TB };
  if (id === NET_BASE.road) return { f: 'road', axis: MASK_LR };
  if (id === NET_BASE.road + 1) return { f: 'road', axis: MASK_TB };
  if (id === NET_BASE.rail) return { f: 'rail', axis: MASK_LR };
  if (id === NET_BASE.rail + 1) return { f: 'rail', axis: MASK_TB };
  if (id === 0x49) return { f: 'highway', axis: MASK_LR };
  if (id === 0x4a) return { f: 'highway', axis: MASK_TB };
  return null;
}

/** 车站种类（按 XBLD；转换件不是车站）。 */
export function stationKindOf(id: number): StationKind {
  return id === 0xec ? StationKind.Bus : id === 0xed ? StationKind.Rail : id === 0xe9 ? StationKind.Subway : StationKind.None;
}
export const STATION_IDS: readonly number[] = [0xe9, 0xec, 0xed];
/** 瓦砾 ID（0x01..0x04）：按坐标派生，确定性且与桩 destroyStructure 的轮换同风格。 */
export const rubbleIdFor = (x: number, y: number): number => 0x01 + ((x + y) & 3);
/** 地铁瓦片（XUND）去掉地铁后剩下的值：交叉件退化为水管直线，其余清零。 */
export const undWithoutSubway = (u: number): number => (u === 0x1f ? NET_BASE.pipe + 1 : u === 0x20 ? NET_BASE.pipe : 0);
