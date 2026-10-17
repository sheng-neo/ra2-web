// ===== app/v1Tools.ts =====（ARCHITECTURE §7.6）
// v1 工具白名单：BuildingDef / ToolDef 不含交付排期字段，排期只在这里。工具栏对不在集合中的工具隐藏；
// PlacementQuery.availability(toolId) 对未实现工具返回 { enabled: false, reason: 'notImplemented' }。
// 完整显式集合（54 个，无省略）；v2 删除本白名单或置为全集。
import type { ToolId } from '../contracts/catalogue';

export const V1_TOOL_IDS: ReadonlySet<ToolId> = new Set<ToolId>([
  // Bulldozer（推土五子）
  'bulldozer.demolish', 'bulldozer.level', 'bulldozer.raise', 'bulldozer.lower', 'bulldozer.dezone',
  // Nature
  'nature.trees', 'nature.water',
  // Dispatch
  'dispatch.police', 'dispatch.fire',
  // Power（全部 10 种电厂）
  'power.wires', 'power.coal', 'power.hydro', 'power.oil', 'power.gas', 'power.nuclear', 'power.wind', 'power.solar', 'power.microwave', 'power.fusion',
  // Water
  'water.pipes', 'water.pump', 'water.tower', 'water.treatment', 'water.desalination',
  // Rewards
  'rewards.mayorsHouse', 'rewards.cityHall', 'rewards.statue', 'rewards.greatDome',
  // Roads
  'roads.road', 'roads.busDepot',
  // Rail
  'rail.rail', 'rail.depot',
  // Zones（六分区）
  'zone.rLight', 'zone.rDense', 'zone.cLight', 'zone.cDense', 'zone.iLight', 'zone.iDense',
  // Education
  'education.school', 'education.college', 'education.library', 'education.museum',
  // Services
  'services.police', 'services.fire', 'services.hospital', 'services.prison',
  // Parks
  'parks.small', 'parks.big', 'parks.zoo', 'parks.stadium', 'parks.marina',
  // Other
  'signs.place', 'query', 'center',
]);

/** 预期规模；v1Tools.test 断言 V1_TOOL_IDS.size === V1_TOOL_COUNT 且每个 id 都在 CATALOGUE.TOOLS 中。 */
export const V1_TOOL_COUNT = 54;
