// ===== testkit/goldenMiniCity.ts =====（CONTRACTS §U goldenMiniCity；ARCHITECTURE §10.3 "golden-mini-city"）
// 迷你金城命令脚本：煤电 + 电线 + R/C/I 六分区 + 道路 + 水泵管线 + 医院 + 铁路与车站，全部用 CATALOGUE 的真实工具 / 建筑 id。
// 变体：'noPower' 不铺电线（电厂孤立 → 分区永远无电，24 个月零施工）；'noRoad' 不修路（无可达 → 不长）。
// 布局（x 向右、y 向下；全部落在平地中部）无任何网络交叉，便于桩与真系统都能派发：
//   煤电 4×4 @(40,44)        主干电线 y=45: x 44..85；电线立柱 x=85: y 45..56；南电线 y=56: x 46..85
//   主路 y=50: x 46..83       支路 x=74: y 46..55
//   北带 y 46..49：R 密 x 46..53 / C 密 x 55..62 / I 密 x 64..72     南带 y 51..55：R 轻 / C 轻 / I 轻（同 x 区间）
//   水泵 1×1 @(44,58)；管线 x=45: y 48..58、y=48: x 45..85、y=53: x 45..85
//   医院 3×3 @(76,57)（紧贴南电线）；铁路 x=87: y 44..66；火车站 2×2 @(88,58)
// 系统全是桩时这些命令返回 notImplemented（不入日志）也算跑通；真系统合入后它就是集成烟测的脚本。
import type { Command, LoggedCommand } from '../contracts/commands';
import { ZoneCode, tileIndex } from '../contracts/grid';
import type { NewCityParams } from '../contracts/system';
import type { GoldenMiniCity, GoldenMiniCityFn, GoldenMiniCityVariant } from '../contracts/testkit';
import { CATALOGUE } from '../data';

/** 建筑 id 经 CATALOGUE 的 key 解析（而非手写数字），缺失时在模块加载期就抛错。 */
function buildingId(key: string): number {
  const def = CATALOGUE.buildingByKey(key);
  if (!def) throw new Error(`goldenMiniCity: CATALOGUE 中没有建筑 key "${key}"`);
  return def.id;
}
/** 工具 id 存在性检查（脚本只经命令派发，不直接用 ToolDef，但要保证引用的工具在目录表里）。 */
function toolId(id: string): string {
  if (!CATALOGUE.toolById(id)) throw new Error(`goldenMiniCity: CATALOGUE 中没有工具 "${id}"`);
  return id;
}

/** 脚本用到的建筑 / 工具（集中一处，便于布局与测试引用）。 */
export const GOLDEN_IDS = {
  coal: buildingId('coalPlant'), pump: buildingId('waterPump'), hospital: buildingId('hospital'), railDepot: buildingId('railDepot'),
  tools: {
    coal: toolId('power.coal'), wires: toolId('power.wires'), road: toolId('roads.road'), pump: toolId('water.pump'), pipes: toolId('water.pipes'),
    hospital: toolId('services.hospital'), rail: toolId('rail.rail'), depot: toolId('rail.depot'),
    zones: [toolId('zone.rDense'), toolId('zone.cDense'), toolId('zone.iDense'), toolId('zone.rLight'), toolId('zone.cLight'), toolId('zone.iLight')],
  },
} as const;

export interface GoldenRect { zone: ZoneCode; x0: number; y0: number; x1: number; y1: number }
/** 布局常量（测试据此检查"分区内出现施工 / 建筑瓦片"）。 */
export const GOLDEN_LAYOUT = {
  coal: { x: 40, y: 44 },
  pump: { x: 44, y: 58 },
  hospital: { x: 76, y: 57 },
  railDepot: { x: 88, y: 58 },
  wires: [{ from: [44, 45], to: [85, 45] }, { from: [85, 45], to: [85, 56] }, { from: [85, 56], to: [46, 56] }] as ReadonlyArray<{ from: readonly [number, number]; to: readonly [number, number] }>,
  roads: [{ from: [46, 50], to: [83, 50] }, { from: [74, 46], to: [74, 55] }] as ReadonlyArray<{ from: readonly [number, number]; to: readonly [number, number] }>,
  pipes: [{ from: [45, 58], to: [45, 48] }, { from: [45, 48], to: [85, 48] }, { from: [45, 53], to: [85, 53] }] as ReadonlyArray<{ from: readonly [number, number]; to: readonly [number, number] }>,
  rail: { from: [87, 44], to: [87, 66] } as { from: readonly [number, number]; to: readonly [number, number] },
  zones: [
    { zone: ZoneCode.DenseR, x0: 46, y0: 46, x1: 53, y1: 49 }, { zone: ZoneCode.DenseC, x0: 55, y0: 46, x1: 62, y1: 49 }, { zone: ZoneCode.DenseI, x0: 64, y0: 46, x1: 72, y1: 49 },
    { zone: ZoneCode.LightR, x0: 46, y0: 51, x1: 53, y1: 55 }, { zone: ZoneCode.LightC, x0: 55, y0: 51, x1: 62, y1: 55 }, { zone: ZoneCode.LightI, x0: 64, y0: 51, x1: 72, y1: 55 },
  ] as readonly GoldenRect[],
} as const;

/** 金城新城参数：平地、无水无树、固定种子（原创城市名）。 */
export const GOLDEN_PARAMS: NewCityParams = {
  name: 'Kestrel Flats', mayor: 'Golden Tester', difficulty: 1, startYear: 1950, seed: 0x5c2c, terrainSeed: 0x7e11,
  terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 },
};

/** 遍历某分区矩形内的全部格索引。 */
export function forEachGoldenRectTile(r: GoldenRect, fn: (i: number, x: number, y: number) => void): void {
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) fn(tileIndex(x, y), x, y);
}

const net = (kind: 'power' | 'road' | 'pipe' | 'rail', seg: { from: readonly [number, number]; to: readonly [number, number] }): Command =>
  ({ type: 'network', kind, from: tileIndex(seg.from[0], seg.from[1]), to: tileIndex(seg.to[0], seg.to[1]) });

/**
 * 命令脚本（全部在 age 0、phaseCursor 0 派发；seq 按顺序）：terrainDone → 煤电 → 电线 → 道路 → 六分区 → 水泵 + 管线 → 医院 → 铁路 + 车站。
 * 参数 seed 可覆盖（headless --seed）。
 */
export const goldenMiniCity: GoldenMiniCityFn = (variant: GoldenMiniCityVariant = 'full'): GoldenMiniCity => {
  const L = GOLDEN_LAYOUT;
  const cmds: Command[] = [{ type: 'terrainDone' }, { type: 'placeBuilding', id: GOLDEN_IDS.coal, x: L.coal.x, y: L.coal.y }];
  if (variant !== 'noPower') for (const seg of L.wires) cmds.push(net('power', seg));
  if (variant !== 'noRoad') for (const seg of L.roads) cmds.push(net('road', seg));
  for (const z of L.zones) cmds.push({ type: 'zoneRect', zone: z.zone, x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 });
  cmds.push({ type: 'placeBuilding', id: GOLDEN_IDS.pump, x: L.pump.x, y: L.pump.y });
  for (const seg of L.pipes) cmds.push(net('pipe', seg));
  cmds.push({ type: 'placeBuilding', id: GOLDEN_IDS.hospital, x: L.hospital.x, y: L.hospital.y });
  cmds.push(net('rail', L.rail));
  cmds.push({ type: 'placeBuilding', id: GOLDEN_IDS.railDepot, x: L.railDepot.x, y: L.railDepot.y });
  const commands: LoggedCommand[] = cmds.map((cmd, seq) => ({ age: 0, phaseCursor: 0, seq, cmd }));
  return { params: { ...GOLDEN_PARAMS, terrain: { ...GOLDEN_PARAMS.terrain } }, commands };
};
