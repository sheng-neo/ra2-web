// ===== render/pixi/tree.ts =====（ARCHITECTURE §6.5 / §6.6：场景树 = 编译器输出 → 带内精灵；脏更新与整层扫描）
// 一棵树对应一组根（groundRoot 或 undergroundRoot）：每格持有 SpriteHandle[]，全量重建 = compileAll → 按带分桶 → 各桶按 zKey 稳定排序 → 整批追加；
// 脏格 = 重编译该格（+ 其多格建筑的渲染锚格）后与旧项 diff（同层复用精灵，改 texture / x / y / zKey，带内二分移动）；
// 整层标志只扫受影响的格（断电图标 → 建筑格；通水变体 → 地下项；车流 → 道路格；标牌 → xtxt 格）。
// 地下树与地面树共用本文件：区别仅在 compileTile 走 snap.view.underground 分支。隐藏的树把变更排队，再次显示时补做或整树重建。
import type { BulkLayer } from '../../contracts/dirty';
import type { RenderSnapshot, SceneCompiler, SceneItem } from '../../contracts/render';
import { OverlayId, SPRITE_KIND_CODE, SceneLayer, bandOf, spriteKeyHash } from '../../contracts/render';
import { DEVELOPED_FIRST, TILES, XBit } from '../../contracts/grid';
import { FOOTPRINT, anchorOf } from '../../contracts/footprint';
import { renderAnchor } from '../../contracts/rotation';
import { isBridge, isHighway, isRoad } from '../../contracts/net';
import type { Atlas } from './atlas';
import { BAND_COUNT } from './bands';
import type { BandSet, SpriteHandle } from './bands';
import { scaleIndexOf } from './resolve';

export interface LabelSpec { tile: number; x: number; y: number; kind: 'sign' | 'connection' }
export interface SceneTreeDeps { compiler: SceneCompiler; atlas: Atlas; bands: BandSet; underground: boolean }
/** 隐藏树排队的变更：超过 PENDING_TILE_CAP 个脏格则退化为整树重建。 */
export const PENDING_TILE_CAP = 2048;

export interface SceneTree {
  readonly underground: boolean; readonly bands: BandSet;
  readonly built: boolean; readonly itemCount: number;
  /** 全量重建。调用前若带里还挂着别人的句柄（地面角色）须先 detach：rebuild 会整批 removeChildren。 */
  rebuild(snap: RenderSnapshot): void;
  updateTiles(snap: RenderSnapshot, tiles: ArrayLike<number>, count: number): void;
  applyBulk(snap: RenderSnapshot, bulk: Readonly<Record<BulkLayer, boolean>>): void;
  /** 隐藏期间排队（显示时 ensureFresh 补做）。 */
  defer(tiles: ArrayLike<number>, count: number, bulk: Readonly<Record<BulkLayer, boolean>>): void;
  /** 标记"下次显示必须整树重建"（档位 / 旋转 / 显示开关 / provider 变化）。 */
  invalidate(): void;
  /** 显示前调用：未建或已失效 → rebuild；否则补做排队的变更。 */
  ensureFresh(snap: RenderSnapshot): void;
  setBlink(on: boolean): void;
  readonly blinkCount: number;
  /** 标牌项（Sign / Connection）的锚点列表；labelsDirty 由调用方读后清零。 */
  labels(): LabelSpec[];
  labelsDirty: boolean;
  handlesOf(tile: number): readonly SpriteHandle[] | undefined;
  clear(): void;
}

const EMPTY: readonly SpriteHandle[] = [];
const OVERLAY_HI = ((SPRITE_KIND_CODE.overlay + 1) & 0xff) << 24;
const SIGN_HI = OVERLAY_HI | ((OverlayId.Sign & 0xff) << 16);
const CONNECTION_HI = OVERLAY_HI | ((OverlayId.Connection & 0xff) << 16);
const isSignHash = (h: number): boolean => { const hi = h & 0xffff0000; return hi === SIGN_HI || hi === CONNECTION_HI; };
const isSignTxt = (v: number): boolean => (v >= 0x01 && v <= 0x32) || v === 0xfa;
const byZKey = (a: SpriteHandle, b: SpriteHandle): number => a.zKey - b.zKey;

export function createSceneTree(deps: SceneTreeDeps): SceneTree {
  const { compiler, atlas, bands, underground } = deps;
  const tileHandles: (SpriteHandle[] | undefined)[] = new Array<SpriteHandle[] | undefined>(TILES);
  const blinkers = new Set<SpriteHandle>();
  const signTiles = new Set<number>();
  const scratch: SceneItem[] = [];
  const stamp = new Uint32Array(TILES);
  let stampGen = 1;
  const marked: number[] = [];
  let built = false, invalid = false, itemCount = 0, blinkOn = true;
  // 排队（隐藏期间）
  const pendingBits = new Uint8Array(TILES);
  let pendingList: number[] = [];
  let pendingFull = false;
  const pendingBulk: Record<BulkLayer, boolean> = { xbit: false, maps: false, xtxt: false, xthg: false, xmic: false, all: false };

  const mark = (i: number): void => { if (stamp[i] !== stampGen) { stamp[i] = stampGen; marked.push(i); } };

  /** 把编译项写到句柄：纹理 / 锚点 / 翻转 / 位置 / 色调 / 闪烁登记；attach 为 true 时再做带内插入或移动。 */
  const apply = (h: SpriteHandle, item: SceneItem, snap: RenderSnapshot, attach: boolean): void => {
    const sIdx = scaleIndexOf(snap.artScale);
    const hash = spriteKeyHash(item.key);
    const sp = h.sprite;
    if (h.entry === null || h.keyHash !== hash || h.scaleIdx !== sIdx || h.flip !== item.flip || !atlas.isValid(h.entry)) {
      const e = atlas.get(item.key, snap.artScale);
      const flipChanged = h.flip !== item.flip;
      h.entry = e; h.keyHash = hash; h.scaleIdx = sIdx; h.flip = item.flip;
      sp.texture = e.texture;
      const ax = e.w > 0 ? (item.flip ? (e.w - e.anchorX) / e.w : e.anchorX / e.w) : 0, ay = e.h > 0 ? e.anchorY / e.h : 0;
      if (ax !== h.ax || ay !== h.ay) { h.ax = ax; h.ay = ay; sp.anchor.set(ax, ay); }
      if (flipChanged || sp.scale.x !== (item.flip ? -1 : 1)) sp.scale.x = item.flip ? -1 : 1;
    }
    if (h.x !== item.x || h.y !== item.y) { h.x = item.x; h.y = item.y; sp.position.set(item.x, item.y); }
    const tint = item.tint ?? 0xffffff;
    if (h.tint !== tint) { h.tint = tint; sp.tint = tint; }
    const alpha = item.alpha ?? 1;
    if (h.alpha !== alpha) { h.alpha = alpha; sp.alpha = alpha; }
    const isBlink = item.anim === 'blink';
    if (isBlink !== (h.anim === 'blink')) {
      if (isBlink) { blinkers.add(h); sp.visible = blinkOn; } else { blinkers.delete(h); sp.visible = true; }
    }
    h.anim = item.anim; h.tile = item.tile; h.layer = item.layer;
    const band = bandOf(item.depth);
    if (!attach) { h.band = band; h.zKey = item.zKey; return; }
    if (!h.inBand) bands.insert(h, band, item.zKey);
    else if (h.band !== band || h.zKey !== item.zKey) bands.move(h, band, item.zKey);
  };
  const releaseHandle = (h: SpriteHandle): void => { blinkers.delete(h); bands.release(h); };

  /** 重编译一格并与旧句柄 diff（同层优先同键复用）；每格数组对象复用（减少 GC）。 */
  const next: SpriteHandle[] = [];
  const recompile = (snap: RenderSnapshot, i: number): void => {
    scratch.length = 0;
    compiler.compileTile(snap, i, scratch);
    const old = tileHandles[i] ?? EMPTY;
    let used = 0, hasSign = false;
    next.length = 0;
    for (const item of scratch) {
      const hash = spriteKeyHash(item.key);
      let pick = -1;
      for (let k = 0; k < old.length; k++) {
        if (used & (1 << k)) continue;
        const oh = old[k]!;
        if (oh.layer !== item.layer) continue;
        if (oh.keyHash === hash) { pick = k; break; }
        if (pick < 0) pick = k;
      }
      let h: SpriteHandle;
      if (pick >= 0) { used |= 1 << pick; h = old[pick]!; } else h = bands.acquire();
      apply(h, item, snap, true);
      next.push(h);
      if (item.layer === SceneLayer.Overlay && isSignHash(hash)) hasSign = true;
    }
    for (let k = 0; k < old.length; k++) if (!(used & (1 << k))) releaseHandle(old[k]!);
    itemCount += next.length - old.length;
    let arr = tileHandles[i];
    if (!arr) { arr = []; tileHandles[i] = arr; }
    arr.length = 0;
    for (const h of next) arr.push(h);
    next.length = 0;
    const hadSign = signTiles.has(i);
    if (hasSign) signTiles.add(i); else signTiles.delete(i);
    if (hasSign || hadSign) tree.labelsDirty = true;
  };
  const flushMarked = (snap: RenderSnapshot): void => {
    for (let k = 0; k < marked.length; k++) recompile(snap, marked[k]!);
    marked.length = 0;
  };
  const markWithLot = (snap: RenderSnapshot, i: number): void => {
    mark(i);
    const id = snap.layers.xbld[i]!;
    if (id >= 0x0e && FOOTPRINT[id]! > 1) {
      const a = anchorOf(snap.layers, i);
      if (a >= 0) mark(renderAnchor(a, FOOTPRINT[id]! as 1 | 2 | 3 | 4, snap.view.rotation));
    }
  };
  const clearPending = (): void => {
    for (const t of pendingList) pendingBits[t] = 0;
    pendingList = [];
    pendingFull = false;
    for (const k of Object.keys(pendingBulk) as BulkLayer[]) pendingBulk[k] = false;
  };

  /** 整批清空：带一次 removeChildren，句柄逐个归池（不逐个二分移除）；每格数组保留复用。 */
  const clear = (): void => {
    bands.clear();
    for (let i = 0; i < TILES; i++) {
      const hs = tileHandles[i];
      if (!hs || hs.length === 0) continue;
      for (const h of hs) bands.releaseDetached(h);
      hs.length = 0;
    }
    blinkers.clear(); signTiles.clear();
    built = false; itemCount = 0;
    tree.labelsDirty = true;
  };
  const buckets: SpriteHandle[][] = [];
  for (let b = 0; b < BAND_COUNT; b++) buckets.push([]);
  const rebuild = (snap: RenderSnapshot): void => {
    clear();
    const items = compiler.compileAll(snap);
    for (const item of items) {
      const h = bands.acquire();
      apply(h, item, snap, false);
      buckets[h.band]!.push(h);
      let arr = tileHandles[item.tile];
      if (!arr) { arr = []; tileHandles[item.tile] = arr; }
      arr.push(h);
      if (item.layer === SceneLayer.Overlay && isSignHash(h.keyHash)) signTiles.add(item.tile);
    }
    for (let b = 0; b < BAND_COUNT; b++) { const bucket = buckets[b]!; bucket.sort(byZKey); bands.appendSorted(b, bucket); bucket.length = 0; }
    itemCount = items.length;
    built = true; invalid = false;
    clearPending();
    tree.labelsDirty = true;
  };
  const updateTiles = (snap: RenderSnapshot, tiles: ArrayLike<number>, count: number): void => {
    if (!built) return;
    stampGen++;
    for (let k = 0; k < count; k++) markWithLot(snap, tiles[k]!);
    flushMarked(snap);
  };
  const applyBulk = (snap: RenderSnapshot, bulk: Readonly<Record<BulkLayer, boolean>>): void => {
    if (!built) return;
    if (bulk.all) { rebuild(snap); return; }
    const L = snap.layers;
    stampGen++;
    if (bulk.xbit) {
      if (underground) { for (let i = 0; i < TILES; i++) if (L.xund[i] !== 0 || (L.xbit[i]! & XBit.Piped) !== 0) mark(i); }
      else { for (let i = 0; i < TILES; i++) if (L.xbld[i]! >= DEVELOPED_FIRST) mark(i); }
    }
    if (bulk.maps && !underground) {
      for (let i = 0; i < TILES; i++) { const id = L.xbld[i]!; if (isRoad(id) || isHighway(id) || isBridge(id)) mark(i); }
    }
    if (bulk.xtxt && !underground) {
      for (let i = 0; i < TILES; i++) if (isSignTxt(L.xtxt[i]!)) mark(i);
      for (const t of signTiles) mark(t);
    }
    flushMarked(snap);
  };

  const tree: SceneTree = {
    underground, bands,
    get built() { return built && !invalid; },
    get itemCount() { return itemCount; },
    rebuild, updateTiles, applyBulk,
    defer(tiles, count, bulk) {
      if (bulk.all) pendingFull = true;
      for (const k of Object.keys(pendingBulk) as BulkLayer[]) if (bulk[k]) pendingBulk[k] = true;
      if (pendingFull) return;
      for (let k = 0; k < count; k++) {
        const t = tiles[k]!;
        if (pendingBits[t]) continue;
        pendingBits[t] = 1; pendingList.push(t);
        if (pendingList.length > PENDING_TILE_CAP) { pendingFull = true; return; }
      }
    },
    invalidate() { invalid = true; },
    ensureFresh(snap) {
      if (!built || invalid || pendingFull) { rebuild(snap); return; }
      if (pendingList.length > 0) { const list = pendingList; updateTiles(snap, list, list.length); }
      if (pendingBulk.xbit || pendingBulk.maps || pendingBulk.xtxt) applyBulk(snap, pendingBulk);
      clearPending();
    },
    setBlink(on) {
      if (on === blinkOn) return;
      blinkOn = on;
      for (const h of blinkers) h.sprite.visible = on;
    },
    get blinkCount() { return blinkers.size; },
    labels() {
      const out: LabelSpec[] = [];
      for (const t of signTiles) {
        const hs = tileHandles[t];
        if (!hs) continue;
        for (const h of hs) {
          if (h.layer !== SceneLayer.Overlay || !isSignHash(h.keyHash)) continue;
          out.push({ tile: t, x: h.x, y: h.y, kind: (h.keyHash & 0xffff0000) === CONNECTION_HI ? 'connection' : 'sign' });
        }
      }
      return out;
    },
    labelsDirty: false,
    handlesOf: (tile) => tileHandles[tile],
    clear,
  };
  return tree;
}
