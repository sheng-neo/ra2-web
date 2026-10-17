// ===== art/provider.ts =====（CONTRACTS §Q SpriteProvider 的程序化实现；WP9）
// generate(key, scale) 为纯函数分发器（同输入同输出）；createProceduralProvider() 在其上加惰性缓存。
// nativeScales = {S, M, L}；has 只回答原生档且只按规则判断（不触发生成）；v1 全部静态：frameCount 1、fps 0。
import type { ArtScale, IndexedBitmap, Palette, SpriteKey, SpriteProvider } from '../contracts/render';
import { ACTOR_COUNT, OVERLAY_COUNT, spriteKeyHash, XUND_PIPE_STUB } from '../contracts/render';
import { Dir } from '../contracts/grid';
import { buildPalette } from './palette';
import { SCALES, isNativeScale, type NativeScale, type ScaleSpec } from './raster';
import { genTerrain, genTerrainUnderground } from './terrain';
import { genWater } from './water';
import { genAbandoned, genConstruction, genGround, genTrees } from './nature';
import { BRIDGE_PART_BY_ID, genBridge, genCrossover, genHighway2x2, genNetwork, genOnramp, genRailHalf, genSubRail, genTunnelPortal, genUndCrossover, genUndMisc, genUnderground, drawHighwayStraight, flatZ } from './network';
import { genBuilding } from './buildings';
import { genActor, genOverlay } from './overlays';
import { genIcon, iconGlyphName } from './icons';
import { V1_ACTORS, XUND_MAX } from './keys';
import { newObjectLot } from './iso';

const V1_ACTOR_SET: ReadonlySet<number> = new Set(V1_ACTORS);

/** 规则判断：本 provider 是否能生成该 key（与 scale 无关）。 */
export function supports(key: SpriteKey): boolean {
  const id = key.id | 0;
  switch (key.kind) {
    case 'xbld': return id >= 0x01 && id <= 0xff;
    case 'terrain': return id >= 0 && id <= 13;
    case 'water': return id >= 0 && id <= 20;
    case 'xund': return id >= 0 && id <= XUND_MAX;
    case 'overlay': return id >= 0 && id < OVERLAY_COUNT;
    case 'actor': return id >= 0 && id < ACTOR_COUNT && V1_ACTOR_SET.has(id);
    case 'ui': return iconGlyphName(id) !== null;
    default: return false;
  }
}
/** 规范化 key：去掉对该族无意义的 variant / frame，使缓存命中稳定。 */
export function normalizeKey(key: SpriteKey): SpriteKey {
  const id = key.id | 0, v = (key.variant ?? 0) | 0;
  switch (key.kind) {
    case 'xbld': return { kind: 'xbld', id, variant: id <= 0x0d ? (v & 3) : 0 };
    case 'terrain': return { kind: 'terrain', id, variant: v & 0x80 ? 0x80 : Math.min(11, v) };
    case 'water': return { kind: 'water', id, variant: Math.max(0, Math.min(2, v)) };
    case 'xund': return { kind: 'xund', id, variant: (id >= 0x10 && id <= XUND_PIPE_STUB) ? (v & 1) : 0 };
    case 'overlay': return { kind: 'overlay', id, variant: id >= 22 ? Math.max(1, Math.min(31, v)) : 0 };   // EdgeWallL/R 的 levels
    case 'actor': return { kind: 'actor', id };
    default: return { kind: 'ui', id };
  }
}

function xbld(id: number, variant: number, sp: ScaleSpec): IndexedBitmap | null {
  if (id <= 0) return null;
  if (id <= 0x04) return genGround('rubble', id - 1, sp);
  if (id === 0x05) return genGround('radioactive', 0, sp);
  if (id <= 0x0c) return genTrees(id - 0x05, variant & 3, sp);
  if (id === 0x0d) return genGround('park', variant & 3, sp);
  if (id <= 0x1c) return genNetwork('power', id - 0x0e, sp);
  if (id <= 0x2b) return genNetwork('road', id - 0x1d, sp);
  if (id <= 0x3a) return genNetwork('rail', id - 0x2c, sp);
  if (id <= 0x3e) return genRailHalf(([Dir.T, Dir.R, Dir.B, Dir.L] as const)[id - 0x3b]!, sp);
  if (id <= 0x42) return genTunnelPortal(([Dir.T, Dir.R, Dir.B, Dir.L] as const)[id - 0x3f]!, sp);
  if (id <= 0x48) return genCrossover(id, sp);
  if (id === 0x49 || id === 0x4a) { const lot = newObjectLot(sp, 1); drawHighwayStraight({ lot, z: flatZ, sp }, id === 0x49 ? 'u' : 'v'); return lot.bmp; }
  if (id <= 0x50) return genCrossover(id, sp);
  if (id <= 0x5c) return genBridge(BRIDGE_PART_BY_ID[id]!, sp);
  if (id <= 0x60) { const hwy = id <= 0x5e ? Dir.T : Dir.B, road = (id & 1) ? Dir.L : Dir.R; return genOnramp(hwy, road, sp); }
  if (id <= 0x6b) return genHighway2x2(id, sp);
  if (id <= 0x6f) return genSubRail(([Dir.T, Dir.R, Dir.B, Dir.L] as const)[id - 0x6c]!, sp);
  if (id === 0x88 || id === 0x89) return genConstruction(1, id & 1, sp);
  if (id === 0x8a || id === 0x8b) return genAbandoned(1, id & 1, sp);
  if (id >= 0xa6 && id <= 0xa9) return genConstruction(2, id - 0xa6, sp);
  if (id >= 0xaa && id <= 0xad) return genAbandoned(2, id - 0xaa, sp);
  if (id === 0xc2 || id === 0xc3) return genConstruction(3, id & 1, sp);
  if (id === 0xc4 || id === 0xc5) return genAbandoned(3, id & 1, sp);
  return genBuilding(id, sp);
}
function xund(id: number, variant: number, sp: ScaleSpec): IndexedBitmap | null {
  if (id === 0x00 || id === XUND_PIPE_STUB || id === 0x22 || id === 0x23) return genUndMisc(id, (variant & 1) === 1, sp);
  if (id >= 0x01 && id <= 0x0f) return genUnderground('subway', id - 0x01, false, sp);
  if (id >= 0x10 && id <= 0x1e) return genUnderground('pipe', id - 0x10, (variant & 1) === 1, sp);
  if (id === 0x1f || id === 0x20) return genUndCrossover(id, (variant & 1) === 1, sp);
  return null;
}
/** 纯函数分发：不支持的 key / 非原生档返回 null。 */
export function generate(key: SpriteKey, scale: ArtScale): IndexedBitmap | null {
  if (!isNativeScale(scale) || !supports(key)) return null;
  const sp = SCALES[scale];
  const k = normalizeKey(key);
  const v = k.variant ?? 0;
  switch (k.kind) {
    case 'xbld': return xbld(k.id, v, sp);
    case 'terrain': return v & 0x80 ? genTerrainUnderground(k.id, sp) : genTerrain(k.id, v >> 2, v & 3, sp);
    case 'water': return genWater(k.id, v, sp);
    case 'xund': return xund(k.id, v, sp);
    case 'overlay': return genOverlay(k.id, v, sp);
    case 'actor': return genActor(k.id, sp);
    default: return genIcon(k.id);
  }
}

/** 缓存键：档 + 规范化 key 哈希。 */
export const cacheKeyOf = (key: SpriteKey, scale: NativeScale): string => `${scale}:${spriteKeyHash(normalizeKey(key))}`;

/** 同步程序化 provider（惰性生成 + 缓存）。可选 preset：预生成好的位图表（Worker 版本注入）。 */
export function createProceduralProvider(preset?: ReadonlyMap<string, IndexedBitmap>, palette: Palette = buildPalette()): SpriteProvider {
  const cache = new Map<string, IndexedBitmap | null>();
  if (preset) for (const [k, b] of preset) cache.set(k, b);
  const nativeScales: ReadonlySet<ArtScale> = new Set<ArtScale>(['S', 'M', 'L']);
  return {
    name: 'procedural',
    palette,
    nativeScales,
    has: (key, scale) => isNativeScale(scale) && supports(key),
    bitmap: (key, scale) => {
      if (!isNativeScale(scale) || !supports(key)) return null;
      const ck = cacheKeyOf(key, scale);
      const hit = cache.get(ck);
      if (hit !== undefined) return hit;
      const b = generate(key, scale);
      cache.set(ck, b);
      return b;
    },
    frameCount: () => 1,
    fps: () => 0,
  };
}
