// ===== grid.ts =====（spec:file-formats §2.2.1、spec:power-water §1.1、spec:terrain §2.1）
// 坐标、位标志、枚举：全仓库唯一的线性索引与方向约定（CONTRACTS §A）。
export const MAP = 128, TILES = 16384, HALF_N = 4096, QUARTER_N = 1024, CORNER_SIZE = 129, MAX_ALT = 31;

/** 全仓库唯一的线性索引：x 主序，y 变化最快；与 .SC2 逐字节一致。禁止在任何模块自写 `* 128`。 */
export const tileIndex = (x: number, y: number): number => x * 128 + y;
export const tileX = (i: number): number => i >> 7;            // 不是 i % 128
export const tileY = (i: number): number => i & 127;
/** 64×64 半格图（XTRF XPLT XVAL XCRM）与 32×32 四分格图（XPLC XFIR XPOP XROG）的索引。 */
export const halfIndex = (x: number, y: number): number => (x >> 1) * 64 + (y >> 1);
export const quarterIndex = (x: number, y: number): number => (x >> 2) * 32 + (y >> 2);
export const halfOfTile = (i: number): number => halfIndex(tileX(i), tileY(i));
export const quarterOfTile = (i: number): number => quarterIndex(tileX(i), tileY(i));
export const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 128 && y < 128;

export const enum Dir { T = 0, R = 1, B = 2, L = 3 }           // T=−y R=+x B=+y L=−x（与 XBLD 片段命名一致）
export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];
export const opposite = (d: Dir): Dir => ((d + 2) & 3) as Dir;
export const dirBit = (d: Dir): number => 1 << d;              // T=1 R=2 B=4 L=8（spec:transport §2.1 掩码位序）
/** 4 邻；越界返回 −1。任何模块不得用 i±1±128 直接加减（x 边缘会绕到相邻列）。 */
export function neighbor(i: number, d: Dir): number {
  const x = tileX(i) + DX[d]!, y = tileY(i) + DY[d]!;
  return inMap(x, y) ? tileIndex(x, y) : -1;
}
export function neighborXY(i: number, dx: number, dy: number): number {
  const x = tileX(i) + dx, y = tileY(i) + dy;
  return inMap(x, y) ? tileIndex(x, y) : -1;
}
/** 电 / 水 BFS 的邻居顺序（spec:power-water §2.4）：索引增量 −1, −128, +1, +128。只允许重排，不许增删。 */
export const SCAN_NEIGHBORS: ReadonlyArray<readonly [dx: number, dy: number]> = [[0, -1], [-1, 0], [0, 1], [1, 0]];

/** XBIT 掩码值（bit0 = 最低位；社区文档的"bit 0"是最高位，一律按掩码）。 */
export const enum XBit { SaltWater = 0x01, Flipped = 0x02, Water = 0x04, Mark = 0x08, Watered = 0x10, Piped = 0x20, Powered = 0x40, Powerable = 0x80 }
/** XZON 高 4 位角标；1×1 写 All (0xF0)；多格建筑每格只置自己所在角，内部格 0。 */
export const enum Corner { BL = 0x10, BR = 0x20, TL = 0x40, TR = 0x80, All = 0xF0 }
export const ANCHOR_BIT = Corner.TL;                            // 全仓库唯一锚点约定（1×1 也含 TL）
export const ZONE_MASK = 0x0F;
export const enum ZoneCode { None = 0, LightR = 1, DenseR = 2, LightC = 3, DenseC = 4, LightI = 5, DenseI = 6, Military = 7, Airport = 8, Seaport = 9 }
export type ZoneType = 'R' | 'C' | 'I';
export const zoneTypeOf = (z: number): ZoneType | null => (z === 1 || z === 2 ? 'R' : z === 3 || z === 4 ? 'C' : z === 5 || z === 6 ? 'I' : null);
export const isDenseZone = (z: number): boolean => z === 2 || z === 4 || z === 6;
export const enum CityMode { TerrainEdit = 0, City = 1, Disaster = 2 }
/** XTER 高 nibble 类别（spec:terrain §2.5.1）。 */
export const enum XterClass { Dry = 0x00, Submerged = 0x10, Shore = 0x20, Surface = 0x30, Waterfall = 0x3e, Stream = 0x40 }
export const xterClassOf = (code: number): XterClass =>
  code === 0x3e ? XterClass.Waterfall : code >= 0x40 && code <= 0x45 ? XterClass.Stream : ((code & 0xf0) as XterClass);
/** XBLD ≥ 0x70 即"建筑格"（电 / 水消费者口径）。 */
export const DEVELOPED_FIRST = 0x70;
/** 运行时灾害标记（沿用 XTXT 字节值；运行时只存在于 events 的 marker 层，写档时才合成，spec:disasters §2.5.1）。 */
export const enum TileMarker { None = 0, ToxicCloud = 0xfb, Flood = 0xfc, Rioters = 0xfd, MassRioters = 0xfe, Fire = 0xff }
/** 灾害类型（MISC 0x0070 / SCEN 0x04 同一枚举，spec:disasters §2.1）：Command.requestDisaster.kind、SimEvent.disasterStarted.kind、DestroyCause 的数字分支、state.disaster.pending/current 都用它。 */
export const enum DisasterKind { None = 0, Fire, Flood, Riot, ToxicSpill, AirCrashLegacy, Earthquake, Tornado, Monster, Meltdown, Microwave, Volcano, Firestorm, MassRiots, MassFloods, Pollution, Hurricane, HelicopterCrash, PlaneCrash }
/** Disasters 菜单 8 项的顺序（UI 与 events 共用）。v1 实现 Fire / Flood / Tornado / Earthquake / Monster；其余项 requestDisaster 返回 notImplemented（UI 灰掉）。 */
export const DISASTER_MENU: readonly DisasterKind[] = [DisasterKind.Fire, DisasterKind.Flood, DisasterKind.PlaneCrash, DisasterKind.Tornado, DisasterKind.Earthquake, DisasterKind.Monster, DisasterKind.Hurricane, DisasterKind.Riot];
export const V1_DISASTERS: ReadonlySet<DisasterKind> = new Set([DisasterKind.Fire, DisasterKind.Flood, DisasterKind.Tornado, DisasterKind.Earthquake, DisasterKind.Monster]);
