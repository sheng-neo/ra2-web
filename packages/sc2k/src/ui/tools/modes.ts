// ===== ui/tools/modes.ts =====（spec:ui-art §2.8 工具操作模式；ARCHITECTURE §7.2）
// 工具 → 十种操作模式的映射、网络族、占地锚格偏移。纯函数，无 DOM。
import type { CatalogueApi, ToolDef, ToolId } from '../../contracts/catalogue';
import type { ToolMode } from '../../contracts/commands';
import type { NetFamily } from '../../contracts/net';

/** 帮助模式的伪工具 id（不在 CATALOGUE.TOOLS 内；工具栏 Help 按钮 / Help 菜单使用）。 */
export const HELP_TOOL: ToolId = 'ui.help';

/**
 * 每个子工具恰好属于一种模式（spec:ui-art §2.8 表）：
 *  Query / Center / Sign 按组；Dispatch 组：军队 = Dispatch，警 / 消 = Paint（原版 Click，本项目允许拖）；
 *  placeMode line → Line；rect → Rect；path → Paint；point：占地 1 → Click，占地 ≥ 2 → Place。
 */
export function modeOf(def: ToolDef | undefined, id: ToolId | null): ToolMode | null {
  if (id === HELP_TOOL) return 'Help';
  if (!def) return null;
  switch (def.group) {
    case 'query': return 'Query';
    case 'center': return 'Center';
    case 'signs': return 'Sign';
    case 'dispatch': return def.id === 'dispatch.military' ? 'Dispatch' : 'Paint';
    default: break;
  }
  switch (def.placeMode) {
    case 'line': return 'Line';
    case 'rect': return 'Rect';
    case 'path': return 'Paint';
    case 'point': return footprintOf(def) >= 2 ? 'Place' : 'Click';
  }
}
/** 工具的占地边长（cursor 为数字时即占地；'variable' / 'none' 按 1）。 */
export const footprintOf = (def: ToolDef): number => (typeof def.cursor === 'number' ? def.cursor : 1);
/** 线性工具 → network 命令的 kind。 */
export function networkKindOf(def: ToolDef): NetFamily | 'highway' | null {
  switch (def.id) {
    case 'power.wires': return 'power';
    case 'roads.road': return 'road';
    case 'roads.highway': return 'highway';
    case 'rail.rail': return 'rail';
    case 'rail.subway': return 'subway';
    case 'water.pipes': return 'pipe';
    default: return null;
  }
}
/** 地形工具 → terrainTool 命令的 tool 字段。 */
export function terrainToolOf(def: ToolDef): 'raise' | 'lower' | 'level' | 'water' | 'trees' | null {
  switch (def.id) {
    case 'bulldozer.raise': return 'raise';
    case 'bulldozer.lower': return 'lower';
    case 'bulldozer.level': return 'level';
    case 'nature.water': return 'water';
    case 'nature.trees': return 'trees';
    default: return null;
  }
}
/** 放置型工具的指针锚格偏移（spec:ui-art §5 问题 8：奇数取正中，偶数取靠 −x,−y 的中心格）：TL = 指针格 − offset。 */
export const anchorOffset = (n: number): number => Math.floor((n - 1) / 2);
/** 该工具放置的建筑 id（buildingIds 首项；无则 −1）。 */
export const buildingIdOf = (def: ToolDef): number => def.buildingIds?.[0] ?? -1;
/** 便捷：按 id 查 ToolDef。 */
export const toolDef = (cat: CatalogueApi, id: ToolId | null): ToolDef | undefined => (id ? cat.toolById(id) : undefined);
/** 触控下"单指拖动 = 平移"的模式集合（spec:ui-art §3.11）；其余模式单指拖动走工具。 */
export const PAN_ON_DRAG_MODES: ReadonlySet<ToolMode> = new Set<ToolMode>(['Click', 'Place', 'Query', 'Center', 'Sign', 'Dispatch', 'Help']);
/** 灾害模式下仍可用的工具组（spec:ui-art §2.1 表：Bulldozer / Emergency / Query / Signs / 视图）。 */
export const DISASTER_MODE_GROUPS: ReadonlySet<ToolDef['group']> = new Set(['bulldozer', 'dispatch', 'query', 'signs', 'center']);
