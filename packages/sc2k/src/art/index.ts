// ===== art/index.ts =====（CONTRACTS §V ArtEntry：createProceduralProvider / createProceduralProviderAsync；WP9 真实现）
// 程序化原创像素精灵：等距 2:1、分面着色盒体、256 色原创调色板、S/M/L 三档原生。spec:ui-art §3.5–§3.9。
import type { ArtEntry } from '../contracts/entrypoints';
import { createProceduralProvider as createProvider } from './provider';
import { createProceduralProviderAsync as createProviderAsync } from './worker';

export const createProceduralProvider = ((): ReturnType<typeof createProvider> => createProvider()) satisfies ArtEntry['createProceduralProvider'];
export const createProceduralProviderAsync = createProviderAsync satisfies NonNullable<ArtEntry['createProceduralProviderAsync']>;

export { buildPalette, Ramp, IDX, ci, misc, rampRgb, hslToRgb, luma, RAMP_HS, RAMP_L, RAMP_BASE } from './palette';
export { SCALES, NATIVE_SCALES, isNativeScale, newBitmap, fillPoly, strokePoly, fillDiamond, diamondRowWidth, ditherFill, isoLine, line, blit, blitAnchored, mirrored, upscale, bitmapHash, fillEllipse } from './raster';
export type { ScaleSpec, NativeScale } from './raster';
export { isoBox, windows, roofGable, roofHip, roofBarrel, roofSawtooth, dome, cylinder, treeSprite, newObjectLot, newTerrainLot, newTileLot, OBJECT_CANVAS_H_L, STRUCTURE_MAX_H_L } from './iso';
export type { Lot, BoxFaces } from './iso';
export { genTerrain, genTerrainUnderground, genEdgeWall, SLOPE_SHADE, cornerLevels, surfaceZ } from './terrain';
export { genWater, waterIndexFor, shoreWaterPolygon } from './water';
export { genNetwork, genUnderground, genCrossover, genUndCrossover, genTunnelPortal, genRailHalf, genSubRail, genOnramp, genBridge, genHighway2x2, genUndMisc, BRIDGE_PART_BY_ID } from './network';
export type { BridgePart, NetKind } from './network';
export { genTrees, genGround, genConstruction, genAbandoned } from './nature';
export { genBuilding, BUILDING_RECIPES, RECIPE_IDS, recipeSignature } from './buildings';
export type { BuildingRecipe, Silhouette } from './buildings';
export { genOverlay, genActor } from './overlays';
export { genIcon, iconGlyphName, allIconIds, disabledIcon, ICON_SIZE } from './icons';
export { genMinimapLut, heatColor, MinimapClass, TransportClass, PowerClass, WaterClass } from './minimap';
export { requiredKeys, requiredKeyGroups, TERRAIN_VARIANTS, V1_ACTORS } from './keys';
export { generate, supports, normalizeKey, cacheKeyOf } from './provider';
export { packSprites, unpackSprites, handleArtWorkerMessage, installArtWorker, ART_MSG_GENERATE, ART_MSG_PACK } from './worker';
