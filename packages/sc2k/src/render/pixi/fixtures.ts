// ===== render/pixi/fixtures.ts =====（仅供 render/pixi 的单元测试使用：假 provider / 叠加项编译器 / RenderSource；不被生产代码 import）
// 只依赖 contracts，与桩解耦：测试针对 SceneCompiler / SpriteProvider 接口编程。
import type { ArtScale, IndexedBitmap, Palette, RenderSnapshot, RenderSource, SceneCompiler, SceneItem, SpriteKey, SpriteProvider } from '../../contracts/render';
import { OverlayId, SceneLayer, ZOOM_TABLE, zKeyOf } from '../../contracts/render';
import { TILES, XBit, tileX, tileY } from '../../contracts/grid';
import { rotateTile } from '../../contracts/rotation';
import type { CityState } from '../../contracts/state';
import { createCityState } from '../../contracts/state';
import { createDirtyTracker } from '../../contracts/dirty';
import type { DirtyTracker } from '../../contracts/dirty';

const SCALES: readonly ArtScale[] = ['XS', 'S', 'M', 'L', 'XL'];
const tileWOf = (s: ArtScale): number => ZOOM_TABLE[SCALES.indexOf(s)]!.tileW;

export interface FakeProviderOptions {
  name?: 'procedural' | 'dat';
  scales?: readonly ArtScale[];
  has?: (key: SpriteKey, scale: ArtScale) => boolean;
  /** 位图尺寸（默认：地块菱形尺寸；xbld 族按 id 变化以制造多种尺寸）。 */
  sizeOf?: (key: SpriteKey, scale: ArtScale) => [number, number];
  /** 填充索引（默认 1 + id % 200）。 */
  fill?: number;
  opaqueMask?: boolean;
}

export function makePalette(seed = 0): Palette {
  const rgba = new Uint8ClampedArray(256 * 4);
  for (let k = 1; k < 256; k++) { rgba[k * 4] = (k * 7 + seed) & 255; rgba[k * 4 + 1] = (k * 13 + seed) & 255; rgba[k * 4 + 2] = (k * 29 + seed) & 255; rgba[k * 4 + 3] = 255; }
  return { rgba, cycles: [] };
}

/** 假 provider：每个 (key, scale) 给一张尺寸可预测的位图；记录 bitmap 调用次数。 */
export function createFakeProvider(opts: FakeProviderOptions = {}): SpriteProvider & { calls: number; palette: Palette } {
  const name = opts.name ?? 'procedural';
  const native = new Set<ArtScale>(opts.scales ?? ['S', 'M', 'L']);
  const palette = makePalette(name === 'dat' ? 100 : 0);
  const sizeOf = opts.sizeOf ?? ((key: SpriteKey, scale: ArtScale): [number, number] => {
    const tw = tileWOf(scale), th = tw / 2;
    if (key.kind === 'xbld') return [tw + ((key.id * 5) % (tw * 2)), th + ((key.id * 11) % (tw * 3))];
    return [tw, th];
  });
  const cache = new Map<string, IndexedBitmap>();
  const p = {
    name, palette, nativeScales: native as ReadonlySet<ArtScale>, calls: 0,
    has: (key: SpriteKey, scale: ArtScale): boolean => native.has(scale) && (opts.has ? opts.has(key, scale) : true),
    bitmap: (key: SpriteKey, scale: ArtScale): IndexedBitmap | null => {
      if (!p.has(key, scale)) return null;
      p.calls++;
      const ck = `${key.kind}/${key.id}/${key.variant ?? 0}/${key.frame ?? 0}/${scale}`;
      let b = cache.get(ck);
      if (b) return b;
      const [w, h] = sizeOf(key, scale);
      const data = new Uint8Array(w * h).fill(opts.fill ?? 1 + (key.id % 200));
      data[0] = 0;   // 左上角透明像素（procedural 语义）
      b = { w, h, data, anchorX: w >> 1, anchorY: h, cycling: false };
      if (opts.opaqueMask) { const opaque = new Uint8Array(w * h).fill(1); opaque[w - 1] = 0; b = { ...b, opaque }; }
      cache.set(ck, b);
      return b;
    },
    frameCount: () => 1,
    fps: () => 0,
  };
  return p;
}

/** 每格一项 Terrain 的最小编译器（与 WP0 桩语义一致，但不依赖桩文件），供叠加项编译器包装。 */
export function createTerrainOnlyCompiler(): SceneCompiler {
  const worldToScreen = (snap: RenderSnapshot, x: number, y: number, h: number): [number, number] => {
    const z = ZOOM_TABLE[snap.view.zoom];
    const S = z.tileW / 2;
    const [rx, ry] = rotateTile(x, y, snap.view.rotation);
    return [128 * S + (rx - ry) * S, 31 * z.levelPx + ((rx + ry) * S) / 2 - h * z.levelPx];
  };
  const compileTile = (snap: RenderSnapshot, i: number, out: SceneItem[]): void => {
    const x = tileX(i), y = tileY(i);
    const [rx, ry] = rotateTile(x, y, snap.view.rotation);
    const depth = rx + ry, base = snap.layers.alt[i]!;
    const [sx, sy] = worldToScreen(snap, x, y, base);
    out.push({ tile: i, layer: SceneLayer.Terrain, key: { kind: 'terrain', id: snap.layers.xter[i]! & 0x0f, variant: (base >> 3) | (snap.view.underground ? 0x80 : 0) }, x: sx, y: sy + ZOOM_TABLE[snap.view.zoom].tileH, depth, rx, zKey: zKeyOf(depth, rx, SceneLayer.Terrain), flip: false, anim: 'none' });
  };
  return {
    compileTile,
    compileAll: (snap) => { const out: SceneItem[] = []; for (let i = 0; i < TILES; i++) compileTile(snap, i, out); return out; },
    worldToScreen,
    pick: () => null,
    edgeOf: () => null,
  };
}

/**
 * 叠加项编译器：在基础编译器之上，为建筑格（xbld ≥ 0x70 且 Powerable 未 Powered）追加 NoPower 闪烁叠加，
 * 为 xtxt ∈ 0x01..0x32 / 0xFA 的格追加 Sign / Connection 叠加；地下视图不追加。
 */
export function createOverlayCompiler(base: SceneCompiler): SceneCompiler {
  const compileTile = (snap: RenderSnapshot, i: number, out: SceneItem[]): void => {
    const start = out.length;
    base.compileTile(snap, i, out);
    if (snap.view.underground || out.length === start) return;
    const t = out[start]!;
    const L = snap.layers;
    const id = L.xbld[i]!, xbit = L.xbit[i]!, xtxt = L.xtxt[i]!;
    if (id >= 0x70 && (xbit & XBit.Powerable) !== 0 && (xbit & XBit.Powered) === 0) {
      out.push({ ...t, layer: SceneLayer.Overlay, key: { kind: 'overlay', id: OverlayId.NoPower }, zKey: zKeyOf(t.depth, t.rx, SceneLayer.Overlay), anim: 'blink' });
    }
    if (snap.view.show.signs && ((xtxt >= 0x01 && xtxt <= 0x32) || xtxt === 0xfa)) {
      out.push({ ...t, layer: SceneLayer.Overlay, key: { kind: 'overlay', id: xtxt === 0xfa ? OverlayId.Connection : OverlayId.Sign }, zKey: zKeyOf(t.depth, t.rx, SceneLayer.Overlay), anim: 'none' });
    }
  };
  return {
    ...base,
    compileTile,
    compileAll: (snap) => { const out: SceneItem[] = []; for (let i = 0; i < TILES; i++) compileTile(snap, i, out); return out; },
  };
}

export interface FixtureSource extends RenderSource { readonly stateMut: CityState; readonly dirty: DirtyTracker }
/** 最小 RenderSource：空城 + DirtyTracker + 只提供 disasters.markers() 的 q（渲染器只读这一项）。 */
export function createFixtureSource(markers?: Uint8Array): FixtureSource {
  const state = createCityState();
  state.layers.alt.fill(4);
  const dirty = createDirtyTracker();
  const zeros = markers ?? new Uint8Array(TILES);
  const q = { disasters: { markers: () => zeros } } as unknown as RenderSource['q'];
  return { state, stateMut: state, q, takeChanges: () => dirty.take(), animTick: 0, dirty };
}
