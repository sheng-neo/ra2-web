// WP10 验收：cpu/compositor —— spec:ui-art §3.3 旋转用例三帧快照（(10,10) XTER 0x01 与 (12,10) 道路 0x1F：抬高边在右上 / 左上 / 左下）、
// §2.9.3 (a)(b)(c) 翻转用例、相邻平地无 1 px 缝、多格锚点、边缘岩壁、opaque 掩码、toRgba。
// 像素几何用测试内的"几何 provider"（坡面四边形 / 道路坡件 / 非对称码头 / 2×2 建筑 / 岩壁），颜色为纯索引以便断言。
import { describe, expect, it } from 'vitest';
import { Corner, XBit, tileIndex } from '../../contracts/grid';
import type { Rotation } from '../../contracts/rotation';
import { SLOPE_CORNERS } from '../../contracts/rotation';
import type { ArtScale, IndexedBitmap, Palette, SceneItem, SpriteKey, SpriteProvider } from '../../contracts/render';
import { OverlayId, SceneLayer, ZOOM_TABLE, zKeyOf } from '../../contracts/render';
import { fnv1aBytes, FNV_OFFSET } from '../../contracts/prng';
import { BUILTIN_PROCEDURAL_STUB } from '../../testkit';
import { compileAll } from '../scene/compiler';
import { pointInQuad, worldToScreen } from '../scene/projection';
import type { ScreenQuad } from '../scene/projection';
import { flatState, placeLot, snapshotOf } from '../scene/testFixtures';
import { cpuCompositor, render, renderRgba, sortByZ, toRgba } from './compositor';

const ROTS: readonly Rotation[] = [0, 1, 2, 3];
const C = { FLAT: 40, SLOPE: 41, ROAD: 42, WALL: 43, BLD: 44, PIER_A: 45, PIER_B: 46 } as const;
const scaleRow = (s: ArtScale) => ZOOM_TABLE.find((r) => r.scale === s)!;

/** 像素中心采样的四边形填充。 */
function fillQuad(bmp: IndexedBitmap, q: ScreenQuad, color: number): void {
  for (let y = 0; y < bmp.h; y++) for (let x = 0; x < bmp.w; x++) if (pointInQuad(q, x + 0.5, y + 0.5)) bmp.data[y * bmp.w + x] = color;
}
const blank = (w: number, h: number, ax: number, ay: number): IndexedBitmap => ({ w, h, data: new Uint8Array(w * h), anchorX: ax, anchorY: ay, cycling: false });

/** 几何 provider：terrain n → 带抬角的菱形（画布 W×(H+LEVEL)，锚 (W/2, H+LEVEL)）；道路 0x1D..0x22 同几何（ROAD 色）；0xDF 非对称；0x8C 2×2；EdgeWall。 */
function geoProvider(opts: { terrain?: boolean } = {}): SpriteProvider {
  const rgba = new Uint8ClampedArray(256 * 4);
  for (let k = 1; k < 256; k++) { rgba[k * 4] = k; rgba[k * 4 + 1] = k; rgba[k * 4 + 2] = k; rgba[k * 4 + 3] = 255; }
  const palette: Palette = { rgba, cycles: [] };
  const cache = new Map<string, IndexedBitmap | null>();
  const make = (key: SpriteKey, scale: ArtScale): IndexedBitmap | null => {
    const { tileW: W, tileH: H, levelPx: L } = scaleRow(scale);
    const S = W / 2;
    const slopeQuad = (bits: number, color: number): IndexedBitmap => {
      const b = blank(W, H + L, S, H + L);
      const ax = S, ay = H + L;
      fillQuad(b, { x0: ax, y0: ay - H - ((bits >> 3) & 1) * L, x1: ax + S, y1: ay - H / 2 - ((bits >> 2) & 1) * L, x2: ax, y2: ay - (bits & 1) * L, x3: ax - S, y3: ay - H / 2 - ((bits >> 1) & 1) * L }, color);
      return b;
    };
    if (key.kind === 'terrain') return opts.terrain === false ? null : slopeQuad(SLOPE_CORNERS[key.id]!, key.id === 0 ? C.FLAT : C.SLOPE);
    if (key.kind === 'xbld' && key.id >= 0x1d && key.id <= 0x22) return slopeQuad(key.id >= 0x1f ? SLOPE_CORNERS[key.id - 0x1f + 1]! : 0, C.ROAD);
    if (key.kind === 'xbld' && key.id === 0xdf) {
      const b = blank(W, H, S, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.data[y * W + x] = x < W / 4 ? C.PIER_A : x >= W - 2 && y < 2 ? C.PIER_B : 0;
      return b;
    }
    if (key.kind === 'xbld' && key.id === 0x8c) {
      const b = blank(2 * W, 2 * H + L, W, 2 * H + L);
      const ax = W, ay = 2 * H + L;
      fillQuad(b, { x0: ax, y0: ay - 2 * H, x1: ax + W, y1: ay - H, x2: ax, y2: ay, x3: ax - W, y3: ay - H }, C.BLD);
      for (let y = 0; y < L; y++) for (let x = W - 2; x < W + 2; x++) b.data[y * 2 * W + x] = C.BLD;   // 塔
      return b;
    }
    if (key.kind === 'overlay' && (key.id === OverlayId.EdgeWallR || key.id === OverlayId.EdgeWallL)) {
      const levels = key.variant ?? 1;
      const b = blank(S, S / 2 + levels * L, key.id === OverlayId.EdgeWallR ? 0 : S, S / 2);
      const right = key.id === OverlayId.EdgeWallR;
      // 顶边从 (0, S/2)（c11'）到 (S, 0)（c10'）或镜像；底边再下 levels·L
      fillQuad(b, right
        ? { x0: 0, y0: S / 2, x1: S, y1: 0, x2: S, y2: levels * L, x3: 0, y3: S / 2 + levels * L }
        : { x0: 0, y0: 0, x1: S, y1: S / 2, x2: S, y2: S / 2 + levels * L, x3: 0, y3: levels * L }, C.WALL);
      return b;
    }
    return null;
  };
  return {
    name: 'procedural', palette, nativeScales: new Set<ArtScale>(['S', 'M', 'L']),
    has: (k, s) => make(k, s) !== null,
    bitmap: (k, s) => { const id = `${k.kind}:${k.id}:${k.variant ?? 0}:${s}`; if (!cache.has(id)) cache.set(id, make(k, s)); return cache.get(id)!; },
    frameCount: () => 1, fps: () => 0,
  };
}
const hashOf = (b: IndexedBitmap): number => fnv1aBytes(FNV_OFFSET, b.data);
const colorRegion = (b: IndexedBitmap, color: number, x0: number, x1: number, y0: number, y1: number): { minY: number; count: number } => {
  let minY = Infinity, count = 0;
  for (let y = Math.max(0, y0); y < Math.min(b.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(b.w, x1); x++) if (b.data[y * b.w + x] === color) { count++; minY = Math.min(minY, y); }
  return { minY, count };
};

describe('compositor: §3.3 旋转用例', () => {
  const s = flatState();
  s.layers.xter[tileIndex(10, 10)] = 0x01;
  s.layers.xbld[tileIndex(12, 10)] = 0x1f; s.layers.xzon[tileIndex(12, 10)] = Corner.All;
  const prov = geoProvider();
  const frames = new Map<number, IndexedBitmap>();
  const renderRot = (rotation: Rotation): { bmp: IndexedBitmap; at: (x: number, y: number) => [number, number] } => {
    const snap = snapshotOf(s, { rotation, zoom: 3 });
    const [cx, cy] = worldToScreen(snap, 11, 10, 4);
    const rect = { x: cx - 160, y: cy - 96, w: 320, h: 192 };
    const bmp = render(compileAll(snap), prov, 'L', rect);
    frames.set(rotation, bmp);
    return { bmp, at: (x, y) => { const [sx, sy] = worldToScreen(snap, x, y, 4); return [sx - rect.x, sy - rect.y]; } };
  };
  const check = (bmp: IndexedBitmap, color: number, vx: number, vy: number, side: 'UR' | 'UL' | 'LL'): void => {
    const { tileW: W, tileH: H, levelPx: L } = ZOOM_TABLE[3];
    const S = W / 2;
    const all = colorRegion(bmp, color, vx - S, vx + S, vy - L, vy + H);
    const left = colorRegion(bmp, color, vx - S, vx - S / 2, vy - L, vy + H);
    const right = colorRegion(bmp, color, vx + S / 2, vx + S, vy - L, vy + H);
    expect(all.count).toBeGreaterThan(0);
    if (side === 'UR') { expect(all.minY).toBe(vy - L); expect(right.minY).toBeLessThan(left.minY); }
    if (side === 'UL') { expect(all.minY).toBe(vy - L); expect(left.minY).toBeLessThan(right.minY); }
    if (side === 'LL') { expect(all.minY).toBeGreaterThan(vy - L); expect(left.minY).toBeLessThan(right.minY); }
  };
  it('旋转 0：坡面与道路坡件的抬高边都在右上', () => {
    const { bmp, at } = renderRot(0);
    check(bmp, C.SLOPE, ...at(10, 10), 'UR'); check(bmp, C.ROAD, ...at(12, 10), 'UR');
  });
  it('旋转 1：抬高边在左上', () => {
    const { bmp, at } = renderRot(1);
    check(bmp, C.SLOPE, ...at(10, 10), 'UL'); check(bmp, C.ROAD, ...at(12, 10), 'UL');
  });
  it('旋转 2：抬高边在左下', () => {
    const { bmp, at } = renderRot(2);
    check(bmp, C.SLOPE, ...at(10, 10), 'LL'); check(bmp, C.ROAD, ...at(12, 10), 'LL');
  });
  it('三帧快照两两不同且可复现', () => {
    for (const r of [0, 1, 2] as const) renderRot(r);
    const hs = [0, 1, 2].map((r) => hashOf(frames.get(r)!));
    expect(new Set(hs).size).toBe(3);
    expect(hashOf(renderRot(1).bmp)).toBe(hs[1]);
  });
});

describe('compositor: §2.9.3 翻转用例（码头 0xDF）', () => {
  const prov = geoProvider({ terrain: false });
  const { tileW: W, tileH: H } = ZOOM_TABLE[2];
  const crop = (xbit: number, rotation: Rotation): IndexedBitmap => {
    const s = flatState();
    s.layers.xbld[tileIndex(20, 20)] = 0xdf; s.layers.xzon[tileIndex(20, 20)] = Corner.All; s.layers.xbit[tileIndex(20, 20)] = xbit;
    const snap = snapshotOf(s, { rotation });
    const [ax, ay] = worldToScreen(snap, 20, 20, 4);
    return render(compileAll(snap), prov, 'M', { x: ax - W / 2, y: ay + H - H, w: W, h: H });
  };
  it('(a) Powered 置位与清零逐像素相同', () => {
    expect(crop(XBit.Powered, 0).data).toEqual(crop(0, 0).data);
    expect(crop(XBit.Powered | XBit.Flipped, 0).data).toEqual(crop(XBit.Flipped, 0).data);
  });
  it('(b) Flipped 0 → 1 得到水平镜像', () => {
    const a = crop(0, 0), b = crop(XBit.Flipped, 0);
    expect(a.data).not.toEqual(b.data);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) expect(b.data[y * W + x]).toBe(a.data[y * W + (W - 1 - x)]);
    expect(colorRegion(a, C.PIER_A, 0, W / 4, 0, H).count).toBe((W / 4) * H);
  });
  it('(c) 旋转 1 次 + Flipped 0 与旋转 0 次 + Flipped 1 渲染相同；旋转 2 次回到原样', () => {
    expect(crop(0, 1).data).toEqual(crop(XBit.Flipped, 0).data);
    expect(crop(XBit.Flipped, 1).data).toEqual(crop(0, 0).data);
    expect(crop(0, 2).data).toEqual(crop(0, 0).data);
  });
});

describe('compositor: 无缝 / 锚点 / 岩壁 / 掩码', () => {
  it('相邻平地无 1 px 缝：桩菱形铺满视口中部每个像素（三档 × 四旋转）', () => {
    const s = flatState();
    for (const zoom of [1, 2, 3] as const) for (const rotation of ROTS) {
      const snap = snapshotOf(s, { zoom, rotation });
      const [cx, cy] = worldToScreen(snap, 64, 64, 4);
      const w = ZOOM_TABLE[zoom].tileW * 6, h = ZOOM_TABLE[zoom].tileH * 6;
      const bmp = render(compileAll(snap), BUILTIN_PROCEDURAL_STUB, ZOOM_TABLE[zoom].scale, { x: cx - w / 2, y: cy - h / 2, w, h });
      let holes = 0;
      for (let k = 0; k < bmp.data.length; k++) if (bmp.data[k] === 0) holes++;
      expect(holes).toBe(0);
      expect(bmp.opaque!.every((v) => v === 1)).toBe(true);
    }
  });
  it('多格锚点：2×2 建筑的底顶点像素落在 renderAnchor 格的底顶点，四旋转', () => {
    const prov = geoProvider();
    const { tileW: W, tileH: H } = ZOOM_TABLE[2];
    for (const rotation of ROTS) {
      const s = flatState();
      placeLot(s, 0x8c, 30, 30, XBit.Powerable | XBit.Powered);
      const snap = snapshotOf(s, { rotation });
      const items = compileAll(snap);
      const st = items.find((it) => it.layer === SceneLayer.Structure)!;
      const rect = { x: st.x - 2 * W, y: st.y - 3 * H, w: 4 * W, h: 4 * H };
      const bmp = render(items, prov, 'M', rect);
      // 最低一行 BLD 像素恰在锚点上一行、居中两像素
      let maxY = -1; const xs: number[] = [];
      for (let y = 0; y < bmp.h; y++) for (let x = 0; x < bmp.w; x++) if (bmp.data[y * bmp.w + x] === C.BLD) { if (y > maxY) { maxY = y; xs.length = 0; } if (y === maxY) xs.push(x); }
      expect(maxY).toBe(st.y - rect.y - 1);
      expect(xs).toEqual([st.x - rect.x - 1, st.x - rect.x]);
      // 底顶点以下是地面（FLAT），说明建筑没有盖过锚格前方
      expect(bmp.data[(st.y - rect.y + 1) * bmp.w + (st.x - rect.x)]).toBe(C.FLAT);
    }
  });
  it('边缘岩壁：右边 (127,5) 的壁像素在地块下方、左边 (5,127) 同理；内部格无壁', () => {
    const prov = geoProvider();
    const s = flatState(6);
    const snap = snapshotOf(s, { rotation: 0, zoom: 2 });
    const { tileW: W, tileH: H, levelPx: L } = ZOOM_TABLE[2];
    const S = W / 2;
    const items = compileAll(snap);
    const probe = (x: number, y: number, side: 'R' | 'L' | null): void => {
      const [vx, vy] = worldToScreen(snap, x, y, 6);
      const rect = { x: vx - W, y: vy - L, w: 2 * W, h: H + 8 * L };
      const bmp = render(items, prov, 'M', rect);
      const below = colorRegion(bmp, C.WALL, vx - rect.x - S, vx - rect.x + S, vy - rect.y + H, vy - rect.y + H + 6 * L + 1);
      if (side === null) { expect(below.count).toBe(0); return; }
      expect(below.count).toBeGreaterThan(0);
      const px = side === 'R' ? vx - rect.x + S / 2 : vx - rect.x - S / 2;
      expect(bmp.data[(vy - rect.y + H + 2) * bmp.w + px]).toBe(C.WALL);
      expect(bmp.data[(vy - rect.y + H + 6 * L + 2) * bmp.w + px]).not.toBe(C.WALL);   // 壁高 = 6 级
    };
    probe(127, 5, 'R'); probe(5, 127, 'L'); probe(60, 60, null);
  });
  it('DAT 风格 opaque 掩码：索引 0 为合法黑色；输出掩码与 toRgba 一致；flip 以锚点 x 为轴', () => {
    const prov: SpriteProvider = {
      name: 'dat', palette: { rgba: new Uint8ClampedArray(1024).fill(255), cycles: [] }, nativeScales: new Set<ArtScale>(['M']),
      has: () => true, frameCount: () => 1, fps: () => 0,
      bitmap: () => ({ w: 3, h: 1, data: new Uint8Array([0, 5, 0]), anchorX: 0, anchorY: 1, cycling: true, opaque: new Uint8Array([1, 1, 0]) }),
    };
    const item = (x: number, flip: boolean): SceneItem => ({ tile: 0, layer: SceneLayer.Ground, key: { kind: 'xbld', id: 1 }, x, y: 1, depth: 0, rx: 0, zKey: zKeyOf(0, 0, SceneLayer.Ground), flip, anim: 'none' });
    const out = render([item(0, false)], prov, 'M', { x: 0, y: 0, w: 4, h: 1 });
    expect(Array.from(out.data)).toEqual([0, 5, 0, 0]);
    expect(Array.from(out.opaque!)).toEqual([1, 1, 0, 0]);
    expect(out.cycling).toBe(true);
    const rgba = toRgba(out, prov.palette);
    expect(Array.from(rgba.subarray(0, 16))).toEqual([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    const f = render([item(0, true)], prov, 'M', { x: 0, y: 0, w: 4, h: 1 });
    expect(Array.from(f.opaque!)).toEqual([0, 1, 1, 0]);
    expect(Array.from(f.data)).toEqual([0, 5, 0, 0]);
  });
  it('sortByZ 稳定；renderRgba 底色填充；cpuCompositor 对象三方法可用', () => {
    const mk = (z: number, tag: number): SceneItem => ({ tile: tag, layer: SceneLayer.Terrain, key: { kind: 'terrain', id: 0 }, x: 0, y: 0, depth: 0, rx: 0, zKey: z, flip: false, anim: 'none' });
    expect(sortByZ([mk(5, 1), mk(2, 2), mk(5, 3), mk(2, 4)]).map((it) => it.tile)).toEqual([2, 4, 1, 3]);
    const rgba = renderRgba([], BUILTIN_PROCEDURAL_STUB, 'M', { x: 0, y: 0, w: 2, h: 1 }, [1, 2, 3]);
    expect(Array.from(rgba)).toEqual([1, 2, 3, 255, 1, 2, 3, 255]);
    const png = cpuCompositor.encodePng(cpuCompositor.toRgba(cpuCompositor.render([], BUILTIN_PROCEDURAL_STUB, 'M', { x: 0, y: 0, w: 2, h: 2 }), BUILTIN_PROCEDURAL_STUB.palette), 2, 2);
    expect(Array.from(png.subarray(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  });
});
