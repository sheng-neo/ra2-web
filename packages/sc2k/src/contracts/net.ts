// ===== net.ts =====（spec:transport §2.1 / §2.3 / §2.11、spec:power-water §3.5）
// 网络族片段、瓦片集合、可达偏移（CONTRACTS §D）。
import { Dir } from './grid';
/** 15 片段：idx → 连接掩码（bit0=T bit1=R bit2=B bit3=L）。0–5 直线（含 4 个坡面件），6–9 弯 BR BL TL TR，10–13 三岔，14 十字。 */
export const PIECE_MASK: readonly number[] = [0b1010, 0b0101, 0b0101, 0b1010, 0b0101, 0b1010, 0b0110, 0b1100, 0b1001, 0b0011, 0b0111, 0b1110, 0b1101, 0b1011, 0b1111];
/** 坡面件：XTER 0x01..0x04 → idx 2..5。 */
export const SLOPE_PIECE: Readonly<Record<number, number>> = { 0x01: 2, 0x02: 3, 0x03: 4, 0x04: 5 };
export const NET_BASE = { power: 0x0e, road: 0x1d, rail: 0x2c, subway: 0x01, pipe: 0x10 } as const;
export type NetFamily = keyof typeof NET_BASE;                  // 'highway' 不是族（2×2 块），见 commands.ts
/**
 * 平地选形：由 4 邻可连通掩码给出 idx。单方向视为沿该轴直线；掩码 0：电线 / 地铁 / 道路 / 铁路取 0 (L-R)，管线取 14 (十字，原版孤立管线为十字)。
 * 坡面格由调用方先查 SLOPE_PIECE 并要求直线沿坡向。
 */
export function pieceIndexFor(mask: number, family: NetFamily): number {
  if (mask === 0) return family === 'pipe' ? 14 : 0;
  if (mask === 0b0001 || mask === 0b0100) return 1;
  if (mask === 0b0010 || mask === 0b1000) return 0;
  for (let k = 0; k < 15; k++) if (k !== 2 && k !== 3 && k !== 4 && k !== 5 && PIECE_MASK[k] === mask) return k;
  return 0;
}
/** 瓦片类别位（按 XBLD 值预计算成 256 项表，spec:transport §2.3）。 */
export const enum NetFlag { Road = 1, Rail = 2, Highway = 4, Power = 8, Bridge = 16, Portal = 32, Onramp = 64, Station = 128 }
/** 各类别位对应的 XBLD 闭区间集合（NET_FLAGS 由此生成；测试与 transport 的集合定义对账用）。 */
export const NET_FLAG_RANGES: ReadonlyArray<readonly [flag: NetFlag, ranges: ReadonlyArray<readonly [number, number]>]> = [
  [NetFlag.Road, [[0x1d, 0x2b], [0x3f, 0x46], [0x4b, 0x4c], [0x5d, 0x60]]],
  [NetFlag.Rail, [[0x2c, 0x3e], [0x45, 0x48], [0x4d, 0x4e], [0x6c, 0x6f]]],
  [NetFlag.Highway, [[0x49, 0x50], [0x61, 0x6b]]],
  [NetFlag.Bridge, [[0x51, 0x5c], [0x6a, 0x6b]]],
  [NetFlag.Portal, [[0x3f, 0x42]]],
  [NetFlag.Onramp, [[0x5d, 0x60]]],
  [NetFlag.Station, [[0xe9, 0xe9], [0xec, 0xed]]],
  [NetFlag.Power, [[0x0e, 0x1c], [0x43, 0x44], [0x47, 0x48], [0x4f, 0x50], [0x5c, 0x5c]]]];
function buildNetFlags(): Uint8Array {
  const t = new Uint8Array(256);
  for (const [flag, ranges] of NET_FLAG_RANGES) for (const [lo, hi] of ranges) for (let id = lo; id <= hi; id++) t[id] = t[id]! | flag;
  return t;
}
/** 256 项；ROAD_SET = 0x1D–0x2B,0x3F–0x46,0x4B,0x4C,0x5D–0x60；RAIL_SET = 0x2C–0x3E,0x45–0x48,0x4D,0x4E,0x6C–0x6F；HIGHWAY_SET = 0x49–0x50,0x61–0x6B；BRIDGE_SET = 0x51–0x5C,0x6A,0x6B；PORTAL_SET = 0x3F–0x42；Onramp = 0x5D–0x60；Station = 0xE9,0xEC,0xED；Power = 0x0E–0x1C,0x43,0x44,0x47,0x48,0x4F,0x50,0x5C */
export const NET_FLAGS: Uint8Array = buildNetFlags();
export const isRoad = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Road) !== 0;
export const isRoadSurface = (id: number): boolean => isRoad(id) && !(id >= 0x5d && id <= 0x60);
export const isRail = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Rail) !== 0;
export const isHighway = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Highway) !== 0;
export const isBridge = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Bridge) !== 0;
export const isPortal = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Portal) !== 0;
export const isOnramp = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Onramp) !== 0;
export const isPowerCarrier = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Power) !== 0;
export const isStationTile = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Station) !== 0;
export const isTerminal = (id: number): boolean => id > 0xfa;   // 四种巨型住区 + 大穹顶：出行无条件目的地
export const isSubwayUnd = (u: number): boolean => (u >= 0x01 && u <= 0x0f) || u === 0x1f || u === 0x20 || u === 0x22 || u === 0x23;
export const isPipeUnd = (u: number): boolean => (u >= 0x10 && u <= 0x1e) || u === 0x1f || u === 0x20;
/** 24 偏移可达表，顺序即原版检查顺序（spec:transport §2.11）；关于原点对称，可用于反向脏标记。 */
export const ACCESS_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 0], [0, -1], [-1, 0], [0, 2], [2, 0], [0, -2], [-2, 0], [0, 3], [3, 0], [0, -3], [-3, 0],
  [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]];
export const enum StationKind { None = 0, Bus = 1, Rail = 2, Subway = 3, SubRail = 4 }
export const enum BridgeKind { Causeway = 0, Raising = 1, Suspension = 2, Rail = 3, HighwayLow = 4, HighwayReinforced = 5, Wire = 6 }
export { Dir };
