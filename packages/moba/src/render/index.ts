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
import type { GameState, HeroId } from '../core/types';
import { HEROES } from '../core/data/heroes';
import type { GameRenderer, HeroPreview, RendererOptions } from './api';
import type { RenderModuleFactory } from './engine/context';
import { createRendererCore, type GameRendererCore } from './engine/core';
import { createTerrainModule } from './terrain';
import { createUnitsModule } from './units';

export { createUnitsModule } from './units';
export type { UnitViewInfo, UnitsModule } from './units';
export { detectQuality } from './engine/quality';
export { createRendererCore } from './engine/core';
export type { GameRendererCore } from './engine/core';
export type { FrameInfo, RenderContext, RenderModule, RenderModuleFactory, TerrainQuery, UnitQuery } from './engine/context';
export { createTerrainModule } from './terrain';
export { createPlaceholderUnits } from './engine/placeholders';

/**
 * 正式对局使用的模块列表(顺序即 update 顺序)。
 * R2：用单位视图模块替换 createPlaceholderUnits；R3：追加特效与叠加层模块。
 */
export const DEFAULT_MODULES: RenderModuleFactory[] = [createTerrainModule, createUnitsModule];

export function createGameRenderer(container: HTMLElement, state: GameState, opts: RendererOptions): GameRenderer {
  const core: GameRendererCore = createRendererCore(container, state, opts, DEFAULT_MODULES);
  return core;
}

// ───────────── 占位实现(R2 会用真实 3D 模型替换) ─────────────

function drawPlaceholderHero(ctx: CanvasRenderingContext2D, w: number, h: number, heroId: HeroId, portrait: boolean): void {
  const def = HEROES[heroId];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, def.palette.secondary);
  g.addColorStop(1, '#0b1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const s = Math.min(w, h);
  // 简化的半身剪影：头 + 肩
  ctx.fillStyle = def.palette.primary;
  ctx.beginPath();
  ctx.ellipse(cx, h * (portrait ? 0.98 : 0.9), s * 0.36, s * 0.34, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = def.palette.accent;
  ctx.beginPath();
  ctx.arc(cx, h * (portrait ? 0.46 : 0.42), s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = def.palette.glow;
  ctx.font = `bold ${Math.round(s * 0.2)}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.name.slice(0, 1), cx, h * (portrait ? 0.47 : 0.43));
}

export function createHeroPreview(canvas: HTMLCanvasElement, heroId: HeroId): HeroPreview {
  let current = heroId;
  const draw = (): void => {
    const w = Math.max(1, canvas.clientWidth || canvas.width);
    const h = Math.max(1, canvas.clientHeight || canvas.height);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) drawPlaceholderHero(ctx, w, h, current, false);
  };
  draw();
  return {
    setHero(id) {
      current = id;
      draw();
    },
    play() {
      /* 占位：无动作 */
    },
    resize: draw,
    dispose() {
      /* 占位：无资源 */
    },
  };
}

const portraitCache = new Map<HeroId, string>();

export function getHeroPortrait(heroId: HeroId): string {
  let url = portraitCache.get(heroId);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    if (ctx) drawPlaceholderHero(ctx, 128, 128, heroId, true);
    url = c.toDataURL('image/png');
    portraitCache.set(heroId, url);
  }
  return url;
}
