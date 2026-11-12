/**
 * 渲染层入口（实现 render/api.ts 的契约）。
 *
 * 结构：
 *   engine/        引擎：渲染器/画质档/相机装置/灯光与阴影/后期管线/坐标换算/模块宿主   (R1)
 *   materials.ts   共享着色套件：风格化受光材质、描边、发光体、调色板、程序化纹理与 GLSL 片段  (R1)
 *   terrain/       整张地图的静态场景(地表/河道/断崖/草丛/基地/营地/点缀/外缘/远景)         (R1)
 *   —— 后续同轨代理把各自的模块工厂加进 DEFAULT_MODULES 即可接入 ——
 *   单位/建筑/投射物视图 (R2)：替换 createPlaceholderUnits，名字用 'units'，并通过 ctx.setUnitQuery 提供真实挂点；
 *   特效与世界内叠加层 (R3)：追加 'fx' / 'overlay' 模块，实现 handleEvents / setAim。
 *
 * 模块接口与上下文见 engine/context.ts；各模块自己的画廊页可以直接用
 *   createRendererCore(container, state, { quality }, [createTerrainModule, 自己的模块])
 * 做隔离测试(参考 src/dev/terrain.ts)。
 */
import type { GameState } from '../core/types';
import type { GameRenderer, RendererOptions } from './api';
import type { RenderModuleFactory } from './engine/context';
import { createRendererCore, type GameRendererCore } from './engine/core';
import { createFxModule } from './fx';
import { createOverlayModule } from './overlay';
import { createTerrainModule } from './terrain';
import { createUnitsModule } from './units';

export { createUnitsModule } from './units';
export type { UnitViewInfo, UnitsModule } from './units';
export { detectQuality } from './engine/quality';
export { createRendererCore } from './engine/core';
export type { GameRendererCore } from './engine/core';
export type { FrameInfo, RenderContext, RenderModule, RenderModuleFactory, TerrainQuery, UnitQuery } from './engine/context';
export type { LightTint } from './engine/lighttint';
export type { QualitySettings } from './engine/quality';
export { createTerrainModule } from './terrain';
export { createPlaceholderUnits } from './engine/placeholders';
export { createFxModule } from './fx';
export type { FxModule, FxStats, UnitAnchor, UnitAnchors } from './fx';
export { createOverlayModule } from './overlay';
export type { OverlayModule } from './overlay';

/**
 * 正式对局使用的模块列表(顺序即 update 顺序)。
 * 顺序有讲究：单位视图先接管 ctx.unitQuery，特效('fx')再读它；叠加层('overlay')共用特效层的贴花系统，必须排在 'fx' 之后。
 */
export const DEFAULT_MODULES: RenderModuleFactory[] = [createTerrainModule, createUnitsModule, createFxModule, createOverlayModule];

export function createGameRenderer(container: HTMLElement, state: GameState, opts: RendererOptions): GameRenderer {
  const core: GameRendererCore = createRendererCore(container, state, opts, DEFAULT_MODULES);
  return core;
}

// 英雄展示(选人界面的 3D 立绘)与头像：见 preview.ts(独立小场景，不依赖主渲染器)
export { createHeroPreview, getHeroPortrait } from './preview';
