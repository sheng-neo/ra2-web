// ===== data/tools.ts =====（spec:building-catalogue §2.11；ARCHITECTURE §7.6 的 54 个 v1 工具 id 全部在列）
// 玩家工具表：顺序 = 原版工具栏分组 / 子工具顺序（UiIconId.SubToolBase + 下标 依赖此顺序，不得重排）。
// label 为 strings 键 'tool.<id>'；hotkey 为本项目原创建议键位（必须可配置）。
// buildingIds = 该工具可产生的 XBLD（含拖动 / 桥对话框 / 坡面自动派生的片段）；分区 / 管线 / 地铁工具不产生 XBLD。
import type { ToolDef, ToolId } from '../contracts/catalogue';

/** 闭区间 [lo, hi] 的 id 列表。 */
const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
const label = (id: ToolId): string => `tool.${id}`;

export const TOOLS: readonly ToolDef[] = [
  // 0 Bulldozer（推土五子）
  { id: 'bulldozer.demolish', group: 'bulldozer', label: label('bulldozer.demolish'), placeMode: 'path', cursor: 1, cost: 1, costUnit: 'tile', hotkey: 'B', availableIn: 'both' },
  { id: 'bulldozer.level', group: 'bulldozer', label: label('bulldozer.level'), placeMode: 'path', cursor: 1, cost: 25, costUnit: 'changedTile', hotkey: 'Shift+B', availableIn: 'both' },
  { id: 'bulldozer.raise', group: 'bulldozer', label: label('bulldozer.raise'), placeMode: 'point', cursor: 1, cost: 25, costUnit: 'changedTile', hotkey: ']', availableIn: 'both' },
  { id: 'bulldozer.lower', group: 'bulldozer', label: label('bulldozer.lower'), placeMode: 'point', cursor: 1, cost: 25, costUnit: 'changedTile', hotkey: '[', availableIn: 'both' },
  { id: 'bulldozer.dezone', group: 'bulldozer', label: label('bulldozer.dezone'), placeMode: 'rect', cursor: 1, cost: 1, costUnit: 'tile', hotkey: 'X', availableIn: 'city' },
  // 1 Nature
  { id: 'nature.trees', group: 'nature', label: label('nature.trees'), placeMode: 'path', cursor: 1, cost: 3, costUnit: 'click', buildingIds: range(0x06, 0x0c), hotkey: 'T', availableIn: 'both' },
  { id: 'nature.water', group: 'nature', label: label('nature.water'), placeMode: 'point', cursor: 1, cost: 100, costUnit: 'tile', hotkey: 'Shift+T', availableIn: 'both' },
  // 2 Dispatch
  { id: 'dispatch.police', group: 'dispatch', label: label('dispatch.police'), placeMode: 'point', cursor: 1, cost: 0, costUnit: 'none', requires: 'policeStation', hotkey: 'F5', availableIn: 'city' },
  { id: 'dispatch.fire', group: 'dispatch', label: label('dispatch.fire'), placeMode: 'point', cursor: 1, cost: 0, costUnit: 'none', requires: 'fireStation', hotkey: 'F6', availableIn: 'city' },
  { id: 'dispatch.military', group: 'dispatch', label: label('dispatch.military'), placeMode: 'point', cursor: 1, cost: 0, costUnit: 'none', requires: 'militaryBase', hotkey: 'F7', availableIn: 'city' },
  // 3 Power
  { id: 'power.wires', group: 'power', label: label('power.wires'), placeMode: 'line', cursor: 1, cost: 2, costUnit: 'tile', buildingIds: [...range(0x0e, 0x1c), 0x5c], hotkey: 'P', availableIn: 'city' },
  { id: 'power.coal', group: 'power', label: label('power.coal'), placeMode: 'point', cursor: 4, cost: 4000, costUnit: 'building', buildingIds: [0xcf], availableIn: 'city' },
  { id: 'power.hydro', group: 'power', label: label('power.hydro'), placeMode: 'point', cursor: 1, cost: 400, costUnit: 'building', buildingIds: [0xc6, 0xc7], availableIn: 'city' },
  { id: 'power.oil', group: 'power', label: label('power.oil'), placeMode: 'point', cursor: 4, cost: 6600, costUnit: 'building', buildingIds: [0xca], availableIn: 'city' },
  { id: 'power.gas', group: 'power', label: label('power.gas'), placeMode: 'point', cursor: 4, cost: 2000, costUnit: 'building', buildingIds: [0xc9], tech: 'gas', availableIn: 'city' },
  { id: 'power.nuclear', group: 'power', label: label('power.nuclear'), placeMode: 'point', cursor: 4, cost: 15000, costUnit: 'building', buildingIds: [0xcb], tech: 'nuclear', availableIn: 'city' },
  { id: 'power.wind', group: 'power', label: label('power.wind'), placeMode: 'point', cursor: 1, cost: 100, costUnit: 'building', buildingIds: [0xc8], tech: 'wind', availableIn: 'city' },
  { id: 'power.solar', group: 'power', label: label('power.solar'), placeMode: 'point', cursor: 4, cost: 1300, costUnit: 'building', buildingIds: [0xcc], tech: 'solar', availableIn: 'city' },
  { id: 'power.microwave', group: 'power', label: label('power.microwave'), placeMode: 'point', cursor: 4, cost: 28000, costUnit: 'building', buildingIds: [0xcd], tech: 'microwave', availableIn: 'city' },
  { id: 'power.fusion', group: 'power', label: label('power.fusion'), placeMode: 'point', cursor: 4, cost: 40000, costUnit: 'building', buildingIds: [0xce], tech: 'fusion', availableIn: 'city' },
  // 4 Water
  { id: 'water.pipes', group: 'water', label: label('water.pipes'), placeMode: 'line', cursor: 1, cost: 3, costUnit: 'tile', undergroundView: true, hotkey: 'W', availableIn: 'city' },
  { id: 'water.pump', group: 'water', label: label('water.pump'), placeMode: 'point', cursor: 1, cost: 100, costUnit: 'building', buildingIds: [0xdc], availableIn: 'city' },
  { id: 'water.tower', group: 'water', label: label('water.tower'), placeMode: 'point', cursor: 2, cost: 250, costUnit: 'building', buildingIds: [0xeb], availableIn: 'city' },
  { id: 'water.treatment', group: 'water', label: label('water.treatment'), placeMode: 'point', cursor: 2, cost: 500, costUnit: 'building', buildingIds: [0xf4], tech: 'waterTreatment', availableIn: 'city' },
  { id: 'water.desalination', group: 'water', label: label('water.desalination'), placeMode: 'point', cursor: 3, cost: 1000, costUnit: 'building', buildingIds: [0xfa], tech: 'desalinization', availableIn: 'city' },
  // 5 Rewards（奖励位：bit0 官邸 / bit1 市政厅 / bit2 雕像 / bit3 大穹顶 / bit4 拱城——spec:file-formats MISC 0x0078；人口门槛严格大于）
  { id: 'rewards.mayorsHouse', group: 'rewards', label: label('rewards.mayorsHouse'), placeMode: 'point', cursor: 2, cost: 0, costUnit: 'building', buildingIds: [0xf3], unlock: { rewardBit: 0, popOver: 2000, once: true }, availableIn: 'city' },
  { id: 'rewards.cityHall', group: 'rewards', label: label('rewards.cityHall'), placeMode: 'point', cursor: 3, cost: 0, costUnit: 'building', buildingIds: [0xd0], unlock: { rewardBit: 1, popOver: 10000, once: true }, availableIn: 'city' },
  { id: 'rewards.statue', group: 'rewards', label: label('rewards.statue'), placeMode: 'point', cursor: 1, cost: 0, costUnit: 'building', buildingIds: [0xdb], unlock: { rewardBit: 2, popOver: 30000, once: true }, availableIn: 'city' },
  { id: 'rewards.greatDome', group: 'rewards', label: label('rewards.greatDome'), placeMode: 'point', cursor: 4, cost: 0, costUnit: 'building', buildingIds: [0xff], unlock: { rewardBit: 3, popOver: 90000, once: true }, availableIn: 'city' },
  { id: 'rewards.arcoPioneer', group: 'rewards', label: label('rewards.arcoPioneer'), placeMode: 'point', cursor: 4, cost: 100000, costUnit: 'building', buildingIds: [0xfb], tech: 'arcoPioneer', unlock: { rewardBit: 4, popOver: 120000, once: false }, availableIn: 'city' },
  { id: 'rewards.arcoCanopy', group: 'rewards', label: label('rewards.arcoCanopy'), placeMode: 'point', cursor: 4, cost: 120000, costUnit: 'building', buildingIds: [0xfc], tech: 'arcoCanopy', unlock: { rewardBit: 4, popOver: 120000, once: false }, availableIn: 'city' },
  { id: 'rewards.arcoDusk', group: 'rewards', label: label('rewards.arcoDusk'), placeMode: 'point', cursor: 4, cost: 150000, costUnit: 'building', buildingIds: [0xfd], tech: 'arcoDusk', unlock: { rewardBit: 4, popOver: 120000, once: false }, availableIn: 'city' },
  { id: 'rewards.arcoSkyward', group: 'rewards', label: label('rewards.arcoSkyward'), placeMode: 'point', cursor: 4, cost: 200000, costUnit: 'building', buildingIds: [0xfe], tech: 'arcoSkyward', unlock: { rewardBit: 4, popOver: 120000, once: false }, availableIn: 'city' },
  // 6 Roads（道路工具经桥对话框产生 0x51–0x58；高速工具自动派生坡面 / 转弯 / 立交 0x61–0x69 与加固桥 0x6A/0x6B）
  { id: 'roads.road', group: 'roads', label: label('roads.road'), placeMode: 'line', cursor: 1, cost: 10, costUnit: 'tile', buildingIds: [...range(0x1d, 0x2b), ...range(0x51, 0x58)], hotkey: 'R', availableIn: 'city' },
  { id: 'roads.highway', group: 'roads', label: label('roads.highway'), placeMode: 'line', cursor: 2, cost: 100, costUnit: 'segment2x2', buildingIds: [0x49, 0x4a, ...range(0x61, 0x6b)], tech: 'highways', hotkey: 'H', availableIn: 'city' },
  { id: 'roads.tunnel', group: 'roads', label: label('roads.tunnel'), placeMode: 'point', cursor: 1, cost: 150, costUnit: 'tile', buildingIds: range(0x3f, 0x42), hotkey: 'Shift+R', availableIn: 'city' },
  { id: 'roads.onramp', group: 'roads', label: label('roads.onramp'), placeMode: 'point', cursor: 1, cost: 25, costUnit: 'building', buildingIds: range(0x5d, 0x60), tech: 'highways', hotkey: 'Shift+H', availableIn: 'city' },
  { id: 'roads.busDepot', group: 'roads', label: label('roads.busDepot'), placeMode: 'point', cursor: 2, cost: 250, costUnit: 'building', buildingIds: [0xec], tech: 'buses', hotkey: 'U', availableIn: 'city' },
  // 7 Rail（铁路工具跨水自动产生铁路桥 0x5A/0x5B；坡脚半高件 0x3B–0x3E 自动）
  { id: 'rail.rail', group: 'rail', label: label('rail.rail'), placeMode: 'line', cursor: 1, cost: 25, costUnit: 'tile', buildingIds: [...range(0x2c, 0x3e), 0x5a, 0x5b], hotkey: 'L', availableIn: 'city' },
  { id: 'rail.subway', group: 'rail', label: label('rail.subway'), placeMode: 'line', cursor: 1, cost: 100, costUnit: 'tile', undergroundView: true, tech: 'subways', hotkey: 'Shift+L', availableIn: 'city' },
  { id: 'rail.depot', group: 'rail', label: label('rail.depot'), placeMode: 'point', cursor: 2, cost: 500, costUnit: 'building', buildingIds: [0xed], hotkey: 'D', availableIn: 'city' },
  { id: 'rail.subStation', group: 'rail', label: label('rail.subStation'), placeMode: 'point', cursor: 1, cost: 250, costUnit: 'building', buildingIds: [0xe9], tech: 'subways', hotkey: 'Shift+D', availableIn: 'city' },
  { id: 'rail.subToRail', group: 'rail', label: label('rail.subToRail'), placeMode: 'point', cursor: 1, cost: 250, costUnit: 'building', buildingIds: range(0x6c, 0x6f), tech: 'subways', hotkey: 'Ctrl+D', availableIn: 'city' },
  // 8 Ports（分区工具：按格计费，部件由生长扫描放置）
  { id: 'ports.seaport', group: 'ports', label: label('ports.seaport'), placeMode: 'rect', cursor: 'variable', cost: 150, costUnit: 'tile', zoneCode: 9, hotkey: 'O', availableIn: 'city' },
  { id: 'ports.airport', group: 'ports', label: label('ports.airport'), placeMode: 'rect', cursor: 'variable', cost: 250, costUnit: 'tile', zoneCode: 8, tech: 'airport', hotkey: 'Shift+O', availableIn: 'city' },
  // 9–11 Zones
  { id: 'zone.rLight', group: 'residential', label: label('zone.rLight'), placeMode: 'rect', cursor: 'variable', cost: 5, costUnit: 'tile', zoneCode: 1, hotkey: '1', availableIn: 'city' },
  { id: 'zone.rDense', group: 'residential', label: label('zone.rDense'), placeMode: 'rect', cursor: 'variable', cost: 10, costUnit: 'tile', zoneCode: 2, hotkey: 'Shift+1', availableIn: 'city' },
  { id: 'zone.cLight', group: 'commercial', label: label('zone.cLight'), placeMode: 'rect', cursor: 'variable', cost: 5, costUnit: 'tile', zoneCode: 3, hotkey: '2', availableIn: 'city' },
  { id: 'zone.cDense', group: 'commercial', label: label('zone.cDense'), placeMode: 'rect', cursor: 'variable', cost: 10, costUnit: 'tile', zoneCode: 4, hotkey: 'Shift+2', availableIn: 'city' },
  { id: 'zone.iLight', group: 'industrial', label: label('zone.iLight'), placeMode: 'rect', cursor: 'variable', cost: 5, costUnit: 'tile', zoneCode: 5, hotkey: '3', availableIn: 'city' },
  { id: 'zone.iDense', group: 'industrial', label: label('zone.iDense'), placeMode: 'rect', cursor: 'variable', cost: 10, costUnit: 'tile', zoneCode: 6, hotkey: 'Shift+3', availableIn: 'city' },
  // 12 Education
  { id: 'education.school', group: 'education', label: label('education.school'), placeMode: 'point', cursor: 3, cost: 250, costUnit: 'building', buildingIds: [0xd6], availableIn: 'city' },
  { id: 'education.college', group: 'education', label: label('education.college'), placeMode: 'point', cursor: 4, cost: 1000, costUnit: 'building', buildingIds: [0xd9], availableIn: 'city' },
  { id: 'education.library', group: 'education', label: label('education.library'), placeMode: 'point', cursor: 2, cost: 500, costUnit: 'building', buildingIds: [0xf5], availableIn: 'city' },
  { id: 'education.museum', group: 'education', label: label('education.museum'), placeMode: 'point', cursor: 3, cost: 1000, costUnit: 'building', buildingIds: [0xd4], availableIn: 'city' },
  // 13 Services
  { id: 'services.police', group: 'services', label: label('services.police'), placeMode: 'point', cursor: 3, cost: 500, costUnit: 'building', buildingIds: [0xd2], availableIn: 'city' },
  { id: 'services.fire', group: 'services', label: label('services.fire'), placeMode: 'point', cursor: 3, cost: 500, costUnit: 'building', buildingIds: [0xd3], availableIn: 'city' },
  { id: 'services.hospital', group: 'services', label: label('services.hospital'), placeMode: 'point', cursor: 3, cost: 500, costUnit: 'building', buildingIds: [0xd1], availableIn: 'city' },
  { id: 'services.prison', group: 'services', label: label('services.prison'), placeMode: 'point', cursor: 4, cost: 3000, costUnit: 'building', buildingIds: [0xd8], availableIn: 'city' },
  // 14 Parks
  { id: 'parks.small', group: 'parks', label: label('parks.small'), placeMode: 'point', cursor: 1, cost: 20, costUnit: 'tile', buildingIds: [0x0d], availableIn: 'city' },
  { id: 'parks.big', group: 'parks', label: label('parks.big'), placeMode: 'point', cursor: 3, cost: 150, costUnit: 'building', buildingIds: [0xd5], availableIn: 'city' },
  { id: 'parks.zoo', group: 'parks', label: label('parks.zoo'), placeMode: 'point', cursor: 4, cost: 3000, costUnit: 'building', buildingIds: [0xda], availableIn: 'city' },
  { id: 'parks.stadium', group: 'parks', label: label('parks.stadium'), placeMode: 'point', cursor: 4, cost: 5000, costUnit: 'building', buildingIds: [0xd7], availableIn: 'city' },
  { id: 'parks.marina', group: 'parks', label: label('parks.marina'), placeMode: 'point', cursor: 3, cost: 1000, costUnit: 'building', buildingIds: [0xf8], availableIn: 'city' },
  // 15–17 Signs / Query / Centering
  { id: 'signs.place', group: 'signs', label: label('signs.place'), placeMode: 'point', cursor: 1, cost: 0, costUnit: 'none', hotkey: 'N', availableIn: 'city' },
  { id: 'query', group: 'query', label: label('query'), placeMode: 'point', cursor: 1, cost: 0, costUnit: 'none', hotkey: 'Q', availableIn: 'both' },
  { id: 'center', group: 'center', label: label('center'), placeMode: 'point', cursor: 'none', cost: 0, costUnit: 'none', hotkey: 'C', availableIn: 'both' },
];

/** 工具 id → 定义（index.ts 的 toolById 也用它）。 */
export const TOOL_BY_ID: ReadonlyMap<ToolId, ToolDef> = new Map(TOOLS.map((t) => [t.id, t]));
