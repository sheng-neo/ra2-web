// ===== render/scene/index.ts =====（WP10；CONTRACTS §V RenderEntry.sceneCompiler 的真实现出口）
// 纯函数层（tsconfig.sim.json 下编译，无 DOM）：投影 / 场景编译 / 拾取 / 相机 / 小地图 LUT。
// render/index.ts（WP11）把 sceneCompiler 切到这里：`export { sceneCompiler } from './scene'`。
import type { SceneCompiler } from '../../contracts/render';
import { sceneCompiler } from './compiler';

export { sceneCompiler, createSceneCompiler, compileTile, compileAll, compileTileP, edgeOf, labelsOf, trafficSurface, MAX_ITEMS_PER_TILE, MAX_EDGE_WALLS_PER_TILE, INFRA_FIRST } from './compiler';
export type { SceneSnapshot, SceneLabel, LabelKind, CompilerHooks } from './compiler';
export * from './projection';
export * from './picking';
export * from './camera';
export * from './minimap';
export * from './tileInfo';
export * from './tuning';

sceneCompiler satisfies SceneCompiler;
