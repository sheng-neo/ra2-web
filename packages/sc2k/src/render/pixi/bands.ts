// ===== render/pixi/bands.ts =====（ARCHITECTURE §6.5 深度带与绘制顺序）
// 16 条深度带：每带一个 Container({ isRenderGroup: true })，子精灵按 zKey 二分插入（不用 sortableChildren）；
// SpriteHandle 池；带的屏幕 y 区间可见判断（每帧 16 次）；touched / bandRebuilds 统计。不含任何编译逻辑（tree.ts）。
import { Container, Sprite, Texture } from 'pixi.js';
import type { AnimGroup } from '../../contracts/render';
import { MAX_ALT } from '../../contracts/grid';
import type { AtlasEntry } from './atlas';

export const BAND_COUNT = 16;
export const BAND_DEPTHS = 16;             // 每带 16 个 depth（bandOf = depth >> 4）
const POOL_CAP = 8192;

export interface SpriteHandle {
  readonly sprite: Sprite;
  band: number; zKey: number; inBand: boolean;
  keyHash: number; scaleIdx: number; flip: boolean; entry: AtlasEntry | null;
  tile: number; layer: number; anim: AnimGroup; x: number; y: number; tint: number; alpha: number;
  ax: number; ay: number;                   // 已设置的 anchor 比例（避免重复触发 Pixi 更新）
}
/** 带可见区间所需的几何（当前档）：oy = mapOrigin.y，S = tileW/2。 */
export interface BandGeometry { oy: number; S: number; tileH: number; levelPx: number; maxSpriteH: number }

export interface BandSet {
  readonly root: Container; readonly bands: readonly Container[];
  /** 每带与 children 平行的 zKey 数组（测试断言有序）。 */
  readonly keys: ReadonlyArray<readonly number[]>;
  insert(h: SpriteHandle, band: number, zKey: number): void;
  remove(h: SpriteHandle): void;
  /** 跨带或破坏有序时重排；带内邻居仍有序则只改键。 */
  move(h: SpriteHandle, band: number, zKey: number): void;
  /** 全量重建路径：调用方已按 zKey 非降排好序（各 h.zKey 已赋值）→ 整批追加到带尾（不逐个二分 / splice）。带必须为空或末键 ≤ 首键。 */
  appendSorted(band: number, handles: readonly SpriteHandle[]): void;
  acquire(): SpriteHandle;
  /** 归还：若在带内先移除；重置精灵属性；入池。 */
  release(h: SpriteHandle): void;
  /** 归还一个已被 clear() 整批摘下的句柄（不再逐个 remove）。 */
  releaseDetached(h: SpriteHandle): void;
  readonly count: number; readonly poolSize: number;
  /** 帧开始：清空 touched（本帧被结构性修改的带集合）。 */
  beginFrame(): void;
  readonly touched: ReadonlySet<number>;
  /** 累计 (带, 帧) 结构修改次数（stats().bandRebuilds）。 */
  readonly bandRebuilds: number;
  /** 视口在地图像素系中的 [top, bottom] → 设置各带 visible；返回可见带数。 */
  updateVisibility(top: number, bottom: number, g: BandGeometry): number;
  indexOf(h: SpriteHandle): number;
  isSorted(): boolean;
  clear(): void;
  destroy(): void;
}

/** 第一个 > z 的下标（等键之后插入，保持稳定）。 */
export function upperBound(keys: readonly number[], z: number): number {
  let lo = 0, hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (keys[mid]! <= z) lo = mid + 1; else hi = mid; }
  return lo;
}
/** 第一个 ≥ z 的下标。 */
export function lowerBound(keys: readonly number[], z: number): number {
  let lo = 0, hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (keys[mid]! < z) lo = mid + 1; else hi = mid; }
  return lo;
}

export function createBandSet(label = 'bands'): BandSet {
  const root = new Container({ label });
  const bands: Container[] = [];
  const keys: number[][] = [];
  for (let b = 0; b < BAND_COUNT; b++) {
    const c = new Container({ isRenderGroup: true, label: `${label}-${b}` });
    bands.push(c); keys.push([]); root.addChild(c);
  }
  const touched = new Set<number>();
  const pool: SpriteHandle[] = [];
  let count = 0, bandRebuilds = 0;

  const indexOf = (h: SpriteHandle): number => {
    const ks = keys[h.band]!, ch = bands[h.band]!.children;
    let i = lowerBound(ks, h.zKey);
    while (i < ks.length && ks[i] === h.zKey) { if (ch[i] === h.sprite) return i; i++; }
    return -1;
  };
  const insert = (h: SpriteHandle, band: number, zKey: number): void => {
    const ks = keys[band]!;
    const idx = upperBound(ks, zKey);
    bands[band]!.addChildAt(h.sprite, idx);
    ks.splice(idx, 0, zKey);
    h.band = band; h.zKey = zKey; h.inBand = true;
    touched.add(band); count++;
  };
  const remove = (h: SpriteHandle): void => {
    if (!h.inBand) return;
    const idx = indexOf(h);
    if (idx >= 0) { bands[h.band]!.removeChildAt(idx); keys[h.band]!.splice(idx, 1); count--; }
    h.inBand = false;
    touched.add(h.band);
  };
  const move = (h: SpriteHandle, band: number, zKey: number): void => {
    if (!h.inBand) { insert(h, band, zKey); return; }
    if (band === h.band) {
      if (zKey === h.zKey) return;
      const ks = keys[band]!;
      const idx = indexOf(h);
      if (idx >= 0 && (idx === 0 || ks[idx - 1]! <= zKey) && (idx === ks.length - 1 || ks[idx + 1]! >= zKey)) { ks[idx] = zKey; h.zKey = zKey; return; }
    }
    remove(h); insert(h, band, zKey);
  };

  /**
   * 归池：不重置精灵属性（每次 ObservablePoint / tint 赋值约 1 µs，4 万次就是 40 ms）——x / y / flip / tint / alpha / ax / ay
   * 继续如实描述精灵当前状态，复用时 apply 只写有差异的字段；只把闪烁可能留下的 visible=false 复位。
   */
  const recycle = (h: SpriteHandle): void => {
    h.sprite.removeFromParent();
    if (h.anim === 'blink') h.sprite.visible = true;
    h.keyHash = 0; h.scaleIdx = -1; h.entry = null; h.tile = -1; h.layer = 0; h.anim = 'none';
    if (pool.length < POOL_CAP) pool.push(h); else h.sprite.destroy();
  };

  return {
    root, bands, keys,
    insert, remove, move, indexOf,
    appendSorted(band, handles) {
      if (handles.length === 0) return;
      const ks = keys[band]!, c = bands[band]!;
      for (const h of handles) { c.addChild(h.sprite); ks.push(h.zKey); h.band = band; h.inBand = true; }
      count += handles.length;
      touched.add(band);
    },
    acquire() {
      const h = pool.pop();
      if (h) return h;
      return { sprite: new Sprite(Texture.EMPTY), band: 0, zKey: 0, inBand: false, keyHash: 0, scaleIdx: -1, flip: false, entry: null, tile: -1, layer: 0, anim: 'none', x: 0, y: 0, tint: 0xffffff, alpha: 1, ax: 0, ay: 0 };
    },
    release(h) { remove(h); recycle(h); },
    releaseDetached(h) { h.inBand = false; recycle(h); },
    get count() { return count; },
    get poolSize() { return pool.length; },
    beginFrame() { bandRebuilds += touched.size; touched.clear(); },
    get touched() { return touched; },
    get bandRebuilds() { return bandRebuilds + touched.size; },
    updateVisibility(top, bottom, g) {
      let vis = 0;
      for (let b = 0; b < BAND_COUNT; b++) {
        const d0 = b * BAND_DEPTHS, d1 = d0 + BAND_DEPTHS - 1;
        const minY = g.oy + (d0 * g.S) / 2 - MAX_ALT * g.levelPx - g.maxSpriteH;
        const maxY = g.oy + (d1 * g.S) / 2 + 2 * g.tileH + MAX_ALT * g.levelPx;
        const v = maxY >= top && minY <= bottom && keys[b]!.length > 0;
        bands[b]!.visible = v;
        if (v) vis++;
      }
      return vis;
    },
    isSorted() {
      for (let b = 0; b < BAND_COUNT; b++) {
        const ks = keys[b]!;
        if (ks.length !== bands[b]!.children.length) return false;
        for (let i = 1; i < ks.length; i++) if (ks[i - 1]! > ks[i]!) return false;
      }
      return true;
    },
    /** 整批摘下全部子精灵（每带一次 removeChildren）；句柄随后由调用方 releaseDetached。带内若有别人的句柄（角色）须先自行 detach。 */
    clear() {
      for (let b = 0; b < BAND_COUNT; b++) { if (keys[b]!.length > 0) touched.add(b); bands[b]!.removeChildren(); keys[b]!.length = 0; }
      count = 0;
    },
    destroy() {
      for (const h of pool) h.sprite.destroy();
      pool.length = 0;
      root.destroy({ children: true });
      count = 0;
    },
  };
}
