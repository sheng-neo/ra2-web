// ===== render/pixi/index.ts =====（WP11 出口；render/index.ts 用它装配 RenderEntry.createRenderer）
export { createPixiRenderer, PIXI_BACKGROUND, BLINK_PERIOD_MS, boxDownsample } from './backend';
export type { PixiRenderer, PixiRendererOptions, RendererDeps, RendererInternals } from './backend';
export { createAtlas, ATLAS_PAGE_SIZE, ATLAS_MAX_PAGES, ATLAS_PADDING } from './atlas';
export type { Atlas, AtlasEntry, AtlasOptions, AtlasStats } from './atlas';
export { createBandSet, BAND_COUNT, upperBound, lowerBound } from './bands';
export type { BandSet, SpriteHandle } from './bands';
export { createSceneTree } from './tree';
export type { SceneTree, LabelSpec } from './tree';
export { resolveBitmap, nearestUpscale, sampleDownscale, bakeRgba, createResolvingProvider, placeholderBitmap, PLACEHOLDER_PALETTE } from './resolve';
export type { ResolvedBitmap, ResolvedSource } from './resolve';
export { createLabelLayer, decodeLabel, labelTextOf } from './labels';
export { paintMinimap, heatColor } from './minimap';
export { createActorLayer, actorPlacement } from './actors';
export { createPreviewLayer } from './preview';
