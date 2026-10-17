// ===== render/pixi/bands.test.ts =====（WORKPLAN WP11 验收：二分插入保持 zKey 有序；bandOf 分带；单格更新只触碰 ≤ 2 带；
// 平移不触发重分配；地下根与地面根 visible 互斥；setActors 的地面角色落在 bandOf(depth) 带、空中角色在 airLayer）
import { describe, expect, it } from 'vitest';
import type { ActorSprite } from '../../contracts/render';
import { ActorId, OverlayId, SceneLayer, bandOf, spriteKeyHash } from '../../contracts/render';
import { XBit, tileIndex } from '../../contracts/grid';
import { createBandSet, lowerBound, upperBound } from './bands';
import { createPixiRenderer } from './backend';
import { decodeLabel, labelTextOf } from './labels';
import { createFakeProvider, createFixtureSource, createOverlayCompiler, createTerrainOnlyCompiler } from './fixtures';

const cpuStub = { render: () => ({ w: 0, h: 0, data: new Uint8Array(0), anchorX: 0, anchorY: 0, cycling: false }), toRgba: () => new Uint8ClampedArray(0), encodePng: () => new Uint8Array(0) };
const makeRenderer = (compiler = createOverlayCompiler(createTerrainOnlyCompiler())) => {
  const r = createPixiRenderer({ sceneCompiler: compiler, cpuCompositor: cpuStub }, { headless: true, viewport: { w: 640, h: 480 } });
  r.setProvider(createFakeProvider(), null);
  const src = createFixtureSource();
  r.setSource(src);
  return { r, src, i: r.internals };
};
/** 用 LCG 生成可复现的伪随机 zKey（测试文件允许任何随机，这里只求可复现）。 */
const lcg = (seed: number) => () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 11;

describe('bands：二分插入', () => {
  it('upperBound / lowerBound', () => {
    const ks = [1, 3, 3, 3, 8];
    expect(lowerBound(ks, 3)).toBe(1); expect(upperBound(ks, 3)).toBe(4);
    expect(lowerBound(ks, 0)).toBe(0); expect(upperBound(ks, 9)).toBe(5);
    expect(upperBound([], 1)).toBe(0);
  });
  it('乱序插入后每带 children 与 keys 平行且非降；移除 / 移动保持有序；等键稳定', () => {
    const set = createBandSet();
    const rnd = lcg(7);
    const handles = [];
    for (let k = 0; k < 500; k++) { const h = set.acquire(); const z = rnd() % 5000; set.insert(h, (rnd() % 16), z); handles.push(h); }
    expect(set.isSorted()).toBe(true);
    expect(set.count).toBe(500);
    const a = set.acquire(), b = set.acquire();
    set.insert(a, 3, 42); set.insert(b, 3, 42);
    expect(set.indexOf(b)).toBe(set.indexOf(a) + 1);           // 等键按插入次序排在后面
    for (let k = 0; k < 500; k += 3) set.remove(handles[k]!);
    expect(set.isSorted()).toBe(true);
    for (let k = 1; k < 500; k += 3) set.move(handles[k]!, rnd() % 16, rnd() % 5000);
    expect(set.isSorted()).toBe(true);
    set.beginFrame();
    const h = handles[2]!;
    const before = set.indexOf(h);
    set.move(h, h.band, h.zKey);                                 // 同键：无操作
    expect(set.touched.size).toBe(0);
    expect(set.indexOf(h)).toBe(before);
    set.release(h);
    expect(h.inBand).toBe(false);
    expect(set.poolSize).toBe(1);
    expect(set.acquire()).toBe(h);                               // 池复用
  });
  it('带可见区间：只有与视口相交且非空的带 visible', () => {
    const set = createBandSet();
    for (let b = 0; b < 16; b++) { const h = set.acquire(); set.insert(h, b, b * 4096); }
    const g = { oy: 372, S: 16, tileH: 16, levelPx: 12, maxSpriteH: 64 };
    // 视口覆盖 band 0..3 的 y 区间附近
    const n = set.updateVisibility(0, 372 + 60 * 8, g);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(16);
    expect(set.bands[0]!.visible).toBe(true);
    expect(set.bands[15]!.visible).toBe(false);
    expect(set.updateVisibility(-1e9, 1e9, g)).toBe(16);
  });
});

describe('场景树 + 后端（headless）', () => {
  it('全量重建：每格 1 项、带 = bandOf(depth)、zKey 有序、sprites 统计', () => {
    const { r, i } = makeRenderer();
    r.frame(16);
    expect(i.ground.built).toBe(true);
    expect(i.groundBands.count).toBe(16384);
    expect(i.groundBands.isSorted()).toBe(true);
    for (const [x, y] of [[0, 0], [10, 20], [127, 127], [64, 63]] as const) {
      const hs = i.ground.handlesOf(tileIndex(x, y))!;
      expect(hs).toHaveLength(1);
      expect(hs[0]!.band).toBe(bandOf(x + y));
      expect(hs[0]!.inBand).toBe(true);
    }
    expect(r.stats().sprites).toBe(16384);
    expect(r.stats().bandRebuilds).toBe(16);
    expect(i.rebuilds()).toBe(1);
    expect(i.visibleBands()).toBeGreaterThan(0);
    expect(i.visibleBands()).toBeLessThan(16);
  });
  it('单格更新只触碰 ≤ 2 带，不做全量重建；同层复用同一精灵', () => {
    const { r, src, i } = makeRenderer();
    r.frame(16);
    const t = tileIndex(40, 41);
    const before = i.ground.handlesOf(t)![0]!;
    const y0 = before.y, sprite0 = before.sprite;
    src.stateMut.layers.alt[t] = 9;
    src.dirty.mark(t);
    r.frame(16);
    expect(i.lastTouchedBands()).toBeLessThanOrEqual(2);
    expect(i.rebuilds()).toBe(1);
    const after = i.ground.handlesOf(t)![0]!;
    expect(after).toBe(before);
    expect(after.sprite).toBe(sprite0);
    expect(after.y).toBe(y0 - 5 * 12);                         // 升高 5 级 → 上移 5·levelPx
    expect(after.sprite.y).toBe(after.y);
    expect(i.groundBands.isSorted()).toBe(true);
    // 新增叠加项（断电）：同格两项，触碰同一带
    src.stateMut.layers.xbld[t] = 0x70;
    src.stateMut.layers.xbit[t] = XBit.Powerable;
    src.dirty.mark(t);
    r.frame(16);
    expect(i.ground.handlesOf(t)).toHaveLength(2);
    expect(i.lastTouchedBands()).toBeLessThanOrEqual(2);
    expect(i.groundBands.count).toBe(16385);
    expect(i.ground.blinkCount).toBe(1);
  });
  it('整层标志 xbit 只重编译建筑格；xtxt 只重编译标牌格', () => {
    const { r, src, i } = makeRenderer();
    const L = src.stateMut.layers;
    const a = tileIndex(5, 5), b = tileIndex(100, 3);
    L.xbld[a] = 0x80; L.xbit[a] = XBit.Powerable; L.xbld[b] = 0x81; L.xbit[b] = XBit.Powerable | XBit.Powered;
    r.frame(16);
    expect(i.ground.handlesOf(a)).toHaveLength(2);
    expect(i.ground.handlesOf(b)).toHaveLength(1);
    L.xbit[a] = XBit.Powerable | XBit.Powered; L.xbit[b] = XBit.Powerable;
    src.dirty.markBulk('xbit');
    r.frame(16);
    expect(i.ground.handlesOf(a)).toHaveLength(1);
    expect(i.ground.handlesOf(b)).toHaveLength(2);
    expect(i.rebuilds()).toBe(1);
    L.xtxt[a] = 0x05;
    src.dirty.markBulk('xtxt');
    r.frame(16);
    expect(i.ground.handlesOf(a)!.some((h) => h.keyHash === spriteKeyHash({ kind: 'overlay', id: OverlayId.Sign }))).toBe(true);
    expect(i.ground.labels()).toEqual([expect.objectContaining({ tile: a, kind: 'sign' })]);
    L.xtxt[a] = 0;
    src.dirty.markBulk('xtxt');
    r.frame(16);
    expect(i.ground.labels()).toEqual([]);
  });
  it('断电图标按 1 fps 用 visible 闪烁', () => {
    const { r, src, i } = makeRenderer();
    const t = tileIndex(3, 3);
    src.stateMut.layers.xbld[t] = 0x70; src.stateMut.layers.xbit[t] = XBit.Powerable;
    r.frame(0);
    const icon = i.ground.handlesOf(t)!.find((h) => h.layer === SceneLayer.Overlay)!;
    expect(icon.sprite.visible).toBe(true);
    r.frame(600);
    expect(icon.sprite.visible).toBe(false);
    r.frame(500);
    expect(icon.sprite.visible).toBe(true);
  });
  it('平移不触发任何重分配（句柄同一、touched = 0、只改 worldRoot 位置）', () => {
    const { r, i } = makeRenderer();
    r.frame(16);
    const t = tileIndex(64, 64);
    const h = i.ground.handlesOf(t)![0]!;
    const cam0 = i.camera();
    r.setView({ ...r.getView(), centerX: 30, centerY: 90 });
    r.frame(16);
    expect(i.lastTouchedBands()).toBe(0);
    expect(i.rebuilds()).toBe(1);
    expect(i.ground.handlesOf(t)![0]).toBe(h);
    expect(i.camera()).not.toEqual(cam0);
    expect([i.worldRoot.x, i.worldRoot.y]).toEqual([i.camera().x, i.camera().y]);
    expect(Number.isInteger(i.worldRoot.x) && Number.isInteger(i.worldRoot.y)).toBe(true);
    r.goto(10, 10, false);
    r.frame(16);
    expect(i.lastTouchedBands()).toBe(0);
    expect(r.getView().centerX).toBe(10);
  });
  it('缩放 / 旋转 / 显示开关触发全量重编译；S/M/L 换档后精灵用新档纹理', () => {
    const { r, i } = makeRenderer();
    r.frame(16);
    const t = tileIndex(20, 20);
    const eM = i.ground.handlesOf(t)![0]!.entry!;
    r.setView({ ...r.getView(), zoom: 1 });
    r.frame(16);
    expect(i.rebuilds()).toBe(2);
    const eS = i.ground.handlesOf(t)![0]!.entry!;
    expect(eS.scale).toBe('S');
    expect(eS).not.toBe(eM);
    expect(i.groundBands.count).toBe(16384);
    r.setView({ ...r.getView(), rotation: 1 });
    r.frame(16);
    expect(i.rebuilds()).toBe(3);
    expect(i.ground.handlesOf(t)![0]!.band).toBe(bandOf(20 + (127 - 20)));
    r.setView({ ...r.getView(), show: { ...r.getView().show, zones: false } });
    r.frame(16);
    expect(i.rebuilds()).toBe(4);
    expect(i.fullRebuildMs()).toBeGreaterThanOrEqual(0);
  });
  it('地下根与地面根 visible 互斥；地下树首次切换时懒构建，隐藏期间的变更在再次显示时补做', () => {
    const { r, src, i } = makeRenderer();
    r.frame(16);
    expect(i.underground.built).toBe(false);
    expect(i.groundBands.root.visible).toBe(true);
    expect(i.undergroundBands.root.visible).toBe(false);
    r.setView({ ...r.getView(), underground: true });
    r.frame(16);
    expect(i.groundBands.root.visible).toBe(false);
    expect(i.undergroundBands.root.visible).toBe(true);
    expect(i.underground.built).toBe(true);
    expect(i.undergroundBands.count).toBe(16384);
    const t = tileIndex(50, 50);
    expect(i.underground.handlesOf(t)![0]!.entry!.texture).not.toBe(i.ground.handlesOf(t)![0]!.entry!.texture);   // 地下变体 0x80
    // 地面树隐藏时改一格：地面树不立即更新，再切回时补做
    src.stateMut.layers.alt[t] = 12;
    src.dirty.mark(t);
    const groundY = i.ground.handlesOf(t)![0]!.y;
    r.frame(16);
    expect(i.ground.handlesOf(t)![0]!.y).toBe(groundY);
    expect(i.underground.handlesOf(t)![0]!.y).not.toBe(groundY);
    const rebuilds = i.rebuilds();
    r.setView({ ...r.getView(), underground: false });
    r.frame(16);
    expect(i.groundBands.root.visible).toBe(true);
    expect(i.undergroundBands.root.visible).toBe(false);
    expect(i.rebuilds()).toBe(rebuilds);                           // 补做脏格而非整树重建
    expect(i.ground.handlesOf(t)![0]!.y).not.toBe(groundY);
    expect(i.ground.handlesOf(t)![0]!.y).toBe(i.underground.handlesOf(t)![0]!.y);
  });
  it('setActors：地面角色落在 bandOf(depth) 带（Actor 层键），空中角色在 airLayer；只改位置不重排', () => {
    const { r, i } = makeRenderer();
    r.frame(16);
    const ship: ActorSprite = { slot: 1, key: { kind: 'actor', id: ActorId.Ship, variant: 2 }, x: 10, y: 20, z: 0, px: 0, py: 0, dir: 2, air: false };
    const plane: ActorSprite = { slot: 2, key: { kind: 'actor', id: ActorId.Plane, variant: 1 }, x: 40, y: 40, z: 8, px: 4, py: 4, dir: 1, air: true };
    r.setActors([ship, plane]);
    r.frame(16);
    const s = i.actorOf(1)!, p = i.actorOf(2)!;
    expect(s.handle.inBand).toBe(true);
    expect(s.handle.band).toBe(bandOf(30));
    expect(s.handle.zKey & 15).toBe(SceneLayer.Actor);
    expect(s.handle.sprite.parent).toBe(i.groundBands.bands[bandOf(30)]);
    expect(p.handle.inBand).toBe(false);
    expect(p.handle.sprite.parent).toBe(i.airLayer);
    expect(i.airLayer.children).toHaveLength(1);
    expect(i.groundBands.isSorted()).toBe(true);
    expect(r.stats().sprites).toBe(16384 + 2);
    // 带内移动：只改 x/y
    const pos0 = [s.handle.sprite.x, s.handle.sprite.y];
    r.setActors([{ ...ship, px: 8 }, plane]);
    r.frame(16);
    expect(i.lastTouchedBands()).toBe(0);
    expect([s.handle.sprite.x, s.handle.sprite.y]).not.toEqual(pos0);
    // 跨带：重排到新带
    r.setActors([{ ...ship, x: 60, y: 60 }, plane]);
    r.frame(16);
    expect(s.handle.band).toBe(bandOf(120));
    expect(i.lastTouchedBands()).toBeLessThanOrEqual(2);
    // 移除
    r.setActors([]);
    r.frame(16);
    expect(i.actorOf(1)).toBeUndefined();
    expect(i.airLayer.children).toHaveLength(0);
    expect(i.groundBands.count).toBe(16384);
  });
  it('预览层：每个预览格一张 PreviewOk / PreviewBad；pick / screenOf 含相机偏移', () => {
    const { r, i } = makeRenderer();
    r.frame(16);
    r.setPreview({ ok: false, cost: 10, tiles: [{ i: tileIndex(1, 1), ok: true }, { i: tileIndex(1, 2), ok: false }] });
    r.frame(16);
    expect(i.previewLayer.count).toBe(2);
    expect(r.stats().sprites).toBe(16386);
    r.setPreview(null);
    r.frame(16);
    expect(i.previewLayer.count).toBe(0);
    const [sx, sy] = r.screenOf(64, 64);
    const cam = i.camera();
    expect([sx - cam.x, sy - cam.y]).toEqual([64 * 16 - 64 * 16 + 2048, 372 + 64 * 16 - 4 * 12]);
    expect(r.pick(0, 0)).toBeNull();                                // 夹具编译器的 pick 恒 null
  });
  it('minimap 写满 128×128×4；thumbnail 走 CpuCompositor', async () => {
    const { r } = makeRenderer();
    const out = new Uint8ClampedArray(128 * 128 * 4);
    r.minimap('structures', out);
    expect(out[3]).toBe(255);
    expect(out[128 * 128 * 4 - 1]).toBe(255);
    const png = await r.thumbnail(8, 4);
    expect(png).toBeInstanceOf(Uint8Array);
  });
});

describe('labels：XLAB 解码', () => {
  it('Pascal 串、首个 0 截断、越界为空；标牌格 / 连接格文本', () => {
    const xlab = new Uint8Array(256 * 25);
    const put = (idx: number, s: string, len = s.length): void => { xlab[idx * 25] = len; for (let k = 0; k < s.length; k++) xlab[idx * 25 + 1 + k] = s.charCodeAt(k); };
    put(5, 'Oak Lane');
    put(6, 'Cut\0Here', 8);
    put(0xfa, 'Eastbridge');
    expect(decodeLabel(xlab, 5)).toBe('Oak Lane');
    expect(decodeLabel(xlab, 6)).toBe('Cut');
    expect(decodeLabel(xlab, 7)).toBe('');
    expect(decodeLabel(xlab, 300)).toBe('');
    const xtxt = new Uint8Array(16384);
    xtxt[1] = 5; xtxt[2] = 0xfa; xtxt[3] = 0x40;
    expect(labelTextOf({ xtxt, xlab }, 1)).toBe('Oak Lane');
    expect(labelTextOf({ xtxt, xlab }, 2)).toBe('Eastbridge');
    expect(labelTextOf({ xtxt, xlab }, 3)).toBe('');
  });
});
