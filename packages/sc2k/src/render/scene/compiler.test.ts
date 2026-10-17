// WP10 验收：compiler —— 每格 ≤ 5 项（岩壁另计 ≤ 2）、zKey 随 depth 单调、多格建筑只在 renderAnchor 出项且四旋转各自正确、1×1 走 Ground、
// 边缘岩壁、Marker 真实现、地下分支、全部项 y == worldToScreen(锚格).y + tileH、局部性、show 开关、车流阈值、水面、翻转族、标牌登记。
import { describe, expect, it } from 'vitest';
import { Corner, MAP, TILES, TileMarker, XBit, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { Rotation } from '../../contracts/rotation';
import { SLOPE_ROT_CCW, renderAnchor, rotateTile, rotateXund } from '../../contracts/rotation';
import { FOOTPRINT } from '../../contracts/footprint';
import type { SceneItem } from '../../contracts/render';
import { OverlayId, SceneLayer, XUND_PIPE_STUB, ZOOM_TABLE, zKeyOf, zoneOverlayId } from '../../contracts/render';
import { createTestContext } from '../../testkit';
import { MAX_EDGE_WALLS_PER_TILE, MAX_ITEMS_PER_TILE, compileAll, compileTile, createSceneCompiler, edgeOf, labelsOf, sceneCompiler } from './compiler';
import type { SceneLabel } from './compiler';
import { worldToScreen } from './projection';
import { DEFAULT_SCENE_TUNING } from './tuning';
import { denseState, flatState, lotTiles, placeLot, snapshotOf } from './testFixtures';

const ROTS: readonly Rotation[] = [0, 1, 2, 3];
const byTile = (items: readonly SceneItem[]): Map<number, SceneItem[]> => {
  const m = new Map<number, SceneItem[]>();
  for (const it of items) { const a = m.get(it.tile); if (a) a.push(it); else m.set(it.tile, [it]); }
  return m;
};
const ofLayer = (items: readonly SceneItem[], layer: SceneLayer): SceneItem[] => items.filter((it) => it.layer === layer);
const tileItems = (snapArgs: Parameters<typeof snapshotOf>, i: number): SceneItem[] => { const out: SceneItem[] = []; compileTile(snapshotOf(...snapArgs), i, out); return out; };

describe('compiler: 项数上限与 zKey', () => {
  it('稠密夹具：每格 ≤ 5 项（不含岩壁），岩壁 ≤ 2；四旋转 × 地面 / 地下', () => {
    const s = denseState();
    for (const rotation of ROTS) for (const underground of [false, true]) {
      const items = compileAll(snapshotOf(s, { rotation, underground, animTick: 7 }));
      let maxCore = 0, maxWall = 0;
      for (const [, arr] of byTile(items)) {
        const walls = ofLayer(arr, SceneLayer.EdgeWall).length;
        maxWall = Math.max(maxWall, walls);
        maxCore = Math.max(maxCore, arr.length - walls);
      }
      expect(maxCore).toBeLessThanOrEqual(MAX_ITEMS_PER_TILE);
      expect(maxWall).toBeLessThanOrEqual(MAX_EDGE_WALLS_PER_TILE);
      expect(items.length).toBeGreaterThanOrEqual(TILES);
    }
  });
  it('zKey == zKeyOf(depth, rx, layer)，depth = 旋转后 rx+ry，按 zKey 排序即按 depth 非降', () => {
    const s = denseState();
    for (const rotation of ROTS) {
      const items = compileAll(snapshotOf(s, { rotation }));
      let bad = 0;
      for (const it of items) {
        const [rx, ry] = rotateTile(tileX(it.tile), tileY(it.tile), rotation);
        if (it.rx !== rx || it.depth !== rx + ry || it.zKey !== zKeyOf(it.depth, it.rx, it.layer)) bad++;
      }
      expect(bad).toBe(0);
      const sorted = items.slice().sort((a, b) => a.zKey - b.zKey);
      let unordered = 0;
      for (let k = 1; k < sorted.length; k++) if (sorted[k]!.depth < sorted[k - 1]!.depth) unordered++;
      expect(unordered).toBe(0);
    }
  });
  it('所有项 (x,y) == worldToScreen(锚格, 基准海拔) + [0, tileH]；NoPower 例外：多格建筑抬到占地中心线', () => {
    const s = denseState();
    for (const rotation of ROTS) for (const zoom of [1, 2, 3] as const) {
      const snap = snapshotOf(s, { rotation, zoom });
      const tileH = ZOOM_TABLE[zoom].tileH, level = ZOOM_TABLE[zoom].levelPx;
      const bad: string[] = [];
      let noPower = 0;
      for (const it of compileAll(snap)) {
        const i = it.tile, alt = s.layers.alt[i]!;
        const [sx, sy] = worldToScreen(snap, tileX(i), tileY(i), alt);
        let wantY = sy + tileH;
        if (it.layer === SceneLayer.Water && ((s.layers.xter[i]! & 0xf0) === 0x10 || (s.layers.xter[i]! & 0xf0) === 0x20)) wantY = sy + tileH - (s.layers.waterLevel[i]! - alt) * level;   // 水下 / 岸边画在 waterLevel（tuning.shoreAtWaterLevel）
        else if (it.key.kind === 'overlay' && it.key.id === OverlayId.NoPower) { noPower++; wantY = sy + tileH - ((FOOTPRINT[s.layers.xbld[i]!]! - 1) * tileH) / 2; }
        if (it.x !== sx || it.y !== wantY) bad.push(`${i}:${it.layer}`);
      }
      expect(bad.slice(0, 5)).toEqual([]);
      expect(noPower).toBe(2);   // 断电 1×1 (13,11) 与断电 3×3 (26,12)
    }
  });
});

describe('compiler: 地形 / 岩壁', () => {
  it('每格恰一个 Terrain 项：id = 旋转后坡面码，variant = 海拔带·4 + 噪点（0..3），噪点确定性', () => {
    const s = flatState();
    s.layers.xter[tileIndex(10, 10)] = 0x01; s.layers.alt[tileIndex(5, 5)] = 25; s.layers.alt[tileIndex(6, 6)] = 11;
    for (const rotation of ROTS) {
      const items = compileAll(snapshotOf(s, { rotation }));
      const terr = ofLayer(items, SceneLayer.Terrain);
      expect(terr).toHaveLength(TILES);
      const t10 = terr.find((it) => it.tile === tileIndex(10, 10))!;
      let code = 1; for (let k = 0; k < rotation; k++) code = SLOPE_ROT_CCW[code]!;
      expect(t10.key.id).toBe(code);
      for (const it of terr) { expect(it.key.variant! & 0x80).toBe(0); expect(it.key.variant! % 4).toBeLessThan(4); }
      expect(terr.find((it) => it.tile === tileIndex(5, 5))!.key.variant! >> 2).toBe(2);
      expect(terr.find((it) => it.tile === tileIndex(6, 6))!.key.variant! >> 2).toBe(1);
      expect(terr.find((it) => it.tile === tileIndex(7, 7))!.key.variant! >> 2).toBe(0);
    }
    const a = compileAll(snapshotOf(s)), b = compileAll(snapshotOf(s));
    expect(a.map((it) => it.key.variant)).toEqual(b.map((it) => it.key.variant));
    expect(new Set(a.slice(0, 2000).map((it) => it.key.variant! & 3)).size).toBeGreaterThan(1);
  });
  it('浅水 / 溪流地表为平地 0，瀑布为 13；水下保留海床坡面', () => {
    const s = flatState();
    s.layers.xter[tileIndex(1, 1)] = 0x35; s.layers.xter[tileIndex(2, 2)] = 0x41; s.layers.xter[tileIndex(3, 3)] = 0x3e; s.layers.xter[tileIndex(4, 4)] = 0x12;
    const items = ofLayer(compileAll(snapshotOf(s)), SceneLayer.Terrain);
    const id = (x: number, y: number): number => items.find((it) => it.tile === tileIndex(x, y))!.key.id;
    expect([id(1, 1), id(2, 2), id(3, 3), id(4, 4)]).toEqual([0, 0, 13, 2]);
  });
  it('边缘岩壁只在旋转后 rx==127 || ry==127 出项，variant == alt，角格 L+R，0 级无壁；与 edgeOf 一致', () => {
    const s = flatState();
    s.layers.alt[tileIndex(127, 0)] = 0;   // 一格 0 级
    for (let y = 120; y < 128; y++) s.layers.alt[tileIndex(127, y)] = 9;
    for (const rotation of ROTS) {
      const snap = snapshotOf(s, { rotation });
      const walls = byTile(ofLayer(compileAll(snap), SceneLayer.EdgeWall));
      for (let i = 0; i < TILES; i++) {
        const e = edgeOf(snap, i), w = walls.get(i) ?? [];
        const alt = s.layers.alt[i]!;
        if (e === null || alt === 0) { expect(w).toHaveLength(0); continue; }
        expect(w).toHaveLength(e === 'LR' ? 2 : 1);
        for (const it of w) { expect(it.key.kind).toBe('overlay'); expect(it.key.variant).toBe(alt); }
        const ids = w.map((it) => it.key.id).sort();
        if (e === 'L') expect(ids).toEqual([OverlayId.EdgeWallL]);
        if (e === 'R') expect(ids).toEqual([OverlayId.EdgeWallR]);
        if (e === 'LR') expect(ids).toEqual([OverlayId.EdgeWallL, OverlayId.EdgeWallR]);
        const [rx, ry] = rotateTile(tileX(i), tileY(i), rotation);
        expect(rx === MAP - 1 || ry === MAP - 1).toBe(true);
      }
      // 边上 255 格，减去落在边上的 0 级格（(127,0) 只在旋转 0 / 1 时落在旋转后的边上）
      let expectedWalls = 0;
      for (let i = 0; i < TILES; i++) if (edgeOf(snap, i) !== null && s.layers.alt[i]! > 0) expectedWalls++;
      expect([...walls.keys()].length).toBe(expectedWalls);
      expect(expectedWalls).toBeGreaterThanOrEqual(2 * MAP - 2);
    }
  });
});

describe('compiler: 建筑 / 地面物', () => {
  it('多格建筑只在 renderAnchor 格出 Structure，四个旋转各自正确；其他占地格无建筑项', () => {
    const s = flatState();
    const lots: Array<[number, number, number]> = [[0x8c, 20, 20], [0xae, 40, 40], [0xcf, 60, 60], [0xfb, 80, 10]];
    for (const [id, x, y] of lots) placeLot(s, id, x, y, XBit.Powerable | XBit.Powered);
    for (const rotation of ROTS) {
      const items = compileAll(snapshotOf(s, { rotation }));
      for (const [id, x, y] of lots) {
        const n = FOOTPRINT[id]!;
        const a = tileIndex(x, y);
        const expectAnchor = renderAnchor(a, n as 2 | 3 | 4, rotation);
        const structs = items.filter((it) => it.key.kind === 'xbld' && it.key.id === id);
        expect(structs).toHaveLength(1);
        expect(structs[0]!.tile).toBe(expectAnchor);
        expect(structs[0]!.layer).toBe(SceneLayer.Structure);
        expect(structs[0]!.flip).toBe(false);
        for (const t of lotTiles(id, x, y)) if (t !== expectAnchor) expect(items.filter((it) => it.tile === t && (it.layer === SceneLayer.Ground || it.layer === SceneLayer.Structure))).toHaveLength(0);
        // 锚格 = 旋转后 rx+ry 最大的占地格
        const depths = lotTiles(id, x, y).map((t) => { const [rx, ry] = rotateTile(tileX(t), tileY(t), rotation); return rx + ry; });
        expect(structs[0]!.depth).toBe(Math.max(...depths));
      }
    }
  });
  it('1×1 建筑 / 树 / 道路走 Ground 并按 rotateXbld 置换；损坏占地（无 TL 角标）按 1×1 处理', () => {
    const s = flatState();
    s.layers.xbld[tileIndex(5, 5)] = 0x70; s.layers.xzon[tileIndex(5, 5)] = Corner.All;
    s.layers.xbld[tileIndex(6, 6)] = 0x07;
    s.layers.xbld[tileIndex(7, 7)] = 0x1f;   // 道路坡件 +2 → +5 → +4 → +3
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) s.layers.xbld[tileIndex(30 + dx, 30 + dy)] = 0x8c;   // 无角标
    const ringRoad = [0x1f, 0x22, 0x21, 0x20];
    for (const rotation of ROTS) {
      const items = compileAll(snapshotOf(s, { rotation }));
      const g = (i: number): SceneItem[] => items.filter((it) => it.tile === i && it.key.kind === 'xbld');
      expect(g(tileIndex(5, 5))).toHaveLength(1); expect(g(tileIndex(5, 5))[0]!.layer).toBe(SceneLayer.Ground); expect(g(tileIndex(5, 5))[0]!.key.id).toBe(0x70);
      expect(g(tileIndex(6, 6))[0]!.key.id).toBe(0x07);
      expect(g(tileIndex(7, 7))[0]!.key.id).toBe(ringRoad[rotation]);
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) { const it = g(tileIndex(30 + dx, 30 + dy)); expect(it).toHaveLength(1); expect(it[0]!.layer).toBe(SceneLayer.Ground); }
    }
  });
  it('翻转族（码头 0xDF）：flip = Flipped XOR (rot&1)，Powered 位无关；水电 0xC6↔0xC7 按 id 置换', () => {
    const s = flatState();
    s.layers.xbld[tileIndex(5, 5)] = 0xdf; s.layers.xzon[tileIndex(5, 5)] = Corner.All; s.layers.xbit[tileIndex(5, 5)] = XBit.Flipped | XBit.Powered;
    s.layers.xbld[tileIndex(6, 6)] = 0xdf; s.layers.xzon[tileIndex(6, 6)] = Corner.All; s.layers.xbit[tileIndex(6, 6)] = XBit.Powerable;
    s.layers.xbld[tileIndex(7, 7)] = 0xc6; s.layers.xzon[tileIndex(7, 7)] = Corner.All;
    for (const rotation of ROTS) {
      const items = compileAll(snapshotOf(s, { rotation }));
      const at = (i: number): SceneItem => items.find((it) => it.tile === i && it.key.kind === 'xbld')!;
      expect(at(tileIndex(5, 5)).flip).toBe(((rotation & 1) === 1) !== true);
      expect(at(tileIndex(6, 6)).flip).toBe((rotation & 1) === 1);
      expect(at(tileIndex(7, 7)).key.id).toBe(rotation & 1 ? 0xc7 : 0xc6);
    }
  });
  it('show 开关：buildings 关 → 无建筑项且已建分区格出 ZoneTint；infrastructure 关 → 无路网 / 车流；zones 关 → 无 ZoneTint；signs 关 → 无标牌', () => {
    const s = denseState();
    const all = compileAll(snapshotOf(s));
    expect(all.some((it) => it.key.kind === 'xbld' && it.key.id >= 0x70)).toBe(true);
    const noB = compileAll(snapshotOf(s, { show: { buildings: false } }));
    expect(noB.some((it) => it.key.kind === 'xbld' && it.key.id >= 0x70)).toBe(false);
    expect(noB.some((it) => it.key.kind === 'overlay' && it.key.id === OverlayId.NoPower)).toBe(false);
    expect(noB.filter((it) => it.tile === tileIndex(11, 11) && it.layer === SceneLayer.ZoneTint)).toHaveLength(1);
    expect(all.filter((it) => it.tile === tileIndex(11, 11) && it.layer === SceneLayer.ZoneTint)).toHaveLength(0);
    const noI = compileAll(snapshotOf(s, { show: { infrastructure: false } }));
    expect(noI.some((it) => it.key.kind === 'xbld' && it.key.id >= 0x0e && it.key.id < 0x70)).toBe(false);
    expect(noI.some((it) => it.key.kind === 'overlay' && (it.key.id === OverlayId.TrafficLight || it.key.id === OverlayId.TrafficHeavy))).toBe(false);
    expect(noI.some((it) => it.key.kind === 'xbld' && it.key.id === 0x07)).toBe(true);   // 树照画
    const noZ = compileAll(snapshotOf(s, { show: { zones: false } }));
    expect(noZ.some((it) => it.layer === SceneLayer.ZoneTint)).toBe(false);
    expect(all.filter((it) => it.layer === SceneLayer.ZoneTint).every((it) => it.key.id >= OverlayId.ZoneRLight && it.key.id <= OverlayId.ZoneSeaport)).toBe(true);
    expect(all.find((it) => it.tile === tileIndex(15, 15) && it.layer === SceneLayer.ZoneTint)!.key.id).toBe(zoneOverlayId(1));
    const noS = compileAll(snapshotOf(s, { show: { signs: false } }));
    expect(noS.some((it) => it.key.kind === 'overlay' && (it.key.id === OverlayId.Sign || it.key.id === OverlayId.Connection))).toBe(false);
  });
});

describe('compiler: 状态槽（Marker > NoPower > Traffic）', () => {
  it('markers[i] = Fire 出且只出一个 OverlayId.Fire 项（layer Marker、anim fire）；无标记不出项；其余标记映射正确', () => {
    const s = flatState();
    const markers = new Uint8Array(TILES);
    const fire = tileIndex(20, 20);
    markers[fire] = TileMarker.Fire; markers[tileIndex(21, 21)] = TileMarker.Flood; markers[tileIndex(22, 22)] = TileMarker.ToxicCloud;
    markers[tileIndex(23, 23)] = TileMarker.Rioters; markers[tileIndex(24, 24)] = TileMarker.MassRioters;
    for (const rotation of ROTS) {
      const items = compileAll(snapshotOf(s, { rotation, markers }));
      const mk = ofLayer(items, SceneLayer.Marker);
      expect(mk).toHaveLength(5);
      const f = mk.filter((it) => it.tile === fire);
      expect(f).toHaveLength(1);
      expect(f[0]!.key).toEqual({ kind: 'overlay', id: OverlayId.Fire, frame: 0 });
      expect(f[0]!.anim).toBe('fire');
      expect(mk.find((it) => it.tile === tileIndex(21, 21))!.key.id).toBe(OverlayId.Flood);
      expect(mk.find((it) => it.tile === tileIndex(22, 22))!.key.id).toBe(OverlayId.Toxic);
      expect(mk.find((it) => it.tile === tileIndex(23, 23))!.key.id).toBe(OverlayId.Riot);
      expect(mk.find((it) => it.tile === tileIndex(24, 24))!.key.id).toBe(OverlayId.Riot);
    }
    expect(ofLayer(compileAll(snapshotOf(s)), SceneLayer.Marker)).toHaveLength(0);
    expect(ofLayer(compileAll(snapshotOf(s, { markers, underground: true })), SceneLayer.Marker)).toHaveLength(0);
  });
  it('Marker 帧由 animTick 派生（fire 4 帧 @ 8 fps，24 Hz 节拍 → 每 3 tick 一帧）', () => {
    const s = flatState();
    const markers = new Uint8Array(TILES); markers[tileIndex(1, 1)] = TileMarker.Fire;
    const frame = (tick: number): number => ofLayer(compileAll(snapshotOf(s, { markers, animTick: tick })), SceneLayer.Marker)[0]!.key.frame!;
    expect([0, 1, 2, 3, 4, 5, 6, 9, 12, 15].map(frame)).toEqual([0, 0, 0, 1, 1, 1, 2, 3, 0, 1]);
    expect(DEFAULT_SCENE_TUNING.anim.fire.frames).toBe(4);
  });
  it('NoPower 只给 Powerable && !Powered 的可见建筑（多格在锚格），anim blink；着火时让位给 Marker', () => {
    const s = flatState();
    placeLot(s, 0x70, 5, 5, XBit.Powerable);
    placeLot(s, 0xae, 10, 10, XBit.Powerable);
    placeLot(s, 0x71, 7, 7, XBit.Powerable | XBit.Powered);
    s.layers.xbld[tileIndex(8, 8)] = 0x07;   // 树：无图标
    for (const rotation of ROTS) {
      const items = compileAll(snapshotOf(s, { rotation }));
      const np = items.filter((it) => it.key.kind === 'overlay' && it.key.id === OverlayId.NoPower);
      expect(np.map((it) => it.tile).sort((a, b) => a - b)).toEqual([tileIndex(5, 5), renderAnchor(tileIndex(10, 10), 3, rotation)].sort((a, b) => a - b));
      for (const it of np) { expect(it.anim).toBe('blink'); expect(it.layer).toBe(SceneLayer.Overlay); }
    }
    const markers = new Uint8Array(TILES); markers[tileIndex(5, 5)] = TileMarker.Fire;
    const burning = compileAll(snapshotOf(s, { markers })).filter((it) => it.tile === tileIndex(5, 5));
    expect(burning.some((it) => it.key.kind === 'overlay' && it.key.id === OverlayId.NoPower)).toBe(false);
    expect(burning.some((it) => it.layer === SceneLayer.Marker)).toBe(true);
  });
  it('车流阈值：xtrf ≥ heavy → TrafficHeavy，≥ light → TrafficLight，否则无；只对路面；frame 随 animTick', () => {
    const s = flatState();
    for (let x = 0; x < 6; x++) s.layers.xbld[tileIndex(x * 2, 40)] = 0x1d;
    s.maps.xtrf[(0 >> 1) * 64 + (40 >> 1)] = 200; s.maps.xtrf[(2 >> 1) * 64 + (40 >> 1)] = 100; s.maps.xtrf[(4 >> 1) * 64 + (40 >> 1)] = 10;
    s.maps.xtrf[(6 >> 1) * 64 + (41 >> 1)] = 255;   // 同半格但 (6,41) 不是路
    const items = compileAll(snapshotOf(s, { animTick: 4 }));
    const tr = (x: number, y = 40): SceneItem | undefined => items.find((it) => it.tile === tileIndex(x, y) && it.key.kind === 'overlay' && (it.key.id === OverlayId.TrafficLight || it.key.id === OverlayId.TrafficHeavy));
    expect(tr(0)!.key.id).toBe(OverlayId.TrafficHeavy); expect(tr(0)!.anim).toBe('traffic'); expect(tr(0)!.key.frame).toBe(1);
    expect(tr(2)!.key.id).toBe(OverlayId.TrafficLight);
    expect(tr(4)).toBeUndefined();
    expect(tr(6, 41)).toBeUndefined();
    // 自定义阈值
    const hi = compileAll(snapshotOf(s, { trafficLight: 150, trafficHeavy: 250 }));
    expect(hi.find((it) => it.tile === tileIndex(0, 40) && it.layer === SceneLayer.Overlay)!.key.id).toBe(OverlayId.TrafficLight);
    expect(hi.find((it) => it.tile === tileIndex(2, 40) && it.layer === SceneLayer.Overlay)).toBeUndefined();
  });
});

describe('compiler: 水面', () => {
  it('水下 → water 0 @ waterLevel、variant = 水深带；岸边 / 浅水 / 溪流 / 水湾 / 瀑布按旋转置换取 id；岸边画在 waterLevel（与湖面齐平），其余画在 alt', () => {
    const s = flatState();
    const L = s.layers;
    L.xter[tileIndex(1, 1)] = 0x10; L.waterLevel[tileIndex(1, 1)] = 7;        // 水下深 3
    L.xter[tileIndex(2, 2)] = 0x21; L.waterLevel[tileIndex(2, 2)] = 5;        // 岸边 T 高
    L.xter[tileIndex(3, 3)] = 0x35;                                            // 浅水形状 5
    L.xter[tileIndex(4, 4)] = 0x3e;                                            // 瀑布
    L.xter[tileIndex(5, 5)] = 0x40;                                            // 溪流 L-R
    L.xter[tileIndex(6, 6)] = 0x42;                                            // 水湾 B
    const shore = [1, 4, 3, 2], shape5 = [5, 8, 7, 6], stream = [15, 16, 15, 16], bay = [17, 20, 19, 18];
    for (const rotation of ROTS) {
      const snap = snapshotOf(s, { rotation });
      const items = ofLayer(compileAll(snap), SceneLayer.Water);
      expect(items).toHaveLength(6);
      const w = (x: number): SceneItem => items.find((it) => it.tile === tileIndex(x, x))!;
      expect(w(1).key).toEqual({ kind: 'water', id: 0, variant: 3 });
      expect(w(1).y).toBe(worldToScreen(snap, 1, 1, 7)[1] + 16);
      expect(w(1).anim).toBe('water');
      expect(w(2).key.id).toBe(shore[rotation]); expect(w(2).key.variant).toBe(1); expect(w(2).y).toBe(worldToScreen(snap, 2, 2, 5)[1] + 16);   // 岸边 @ waterLevel 5（tuning.shoreAtWaterLevel）
      expect(w(3).key.id).toBe(shape5[rotation]); expect(w(3).key.variant).toBe(0);
      expect(w(4).key.id).toBe(14);
      expect(w(5).key.id).toBe(stream[rotation]);
      expect(w(6).key.id).toBe(bay[rotation]);
    }
    expect(ofLayer(compileAll(snapshotOf(s, { underground: true })), SceneLayer.Water)).toHaveLength(0);
  });
  it('水面格不画 ZoneTint', () => {
    const s = flatState();
    s.layers.xter[tileIndex(1, 1)] = 0x10; s.layers.waterLevel[tileIndex(1, 1)] = 6; s.layers.xzon[tileIndex(1, 1)] = 1;
    expect(compileAll(snapshotOf(s)).filter((it) => it.tile === tileIndex(1, 1) && it.layer === SceneLayer.ZoneTint)).toHaveLength(0);
  });
});

describe('compiler: 地下视图', () => {
  it('建筑格只出短管桩（PIPED），地表 variant 0x80；管线 / 地铁按 rotateXund；无 Structure / Water / Zone / Sign', () => {
    const s = denseState();
    for (const rotation of ROTS) {
      const items = compileAll(snapshotOf(s, { rotation }).view.underground ? snapshotOf(s, { rotation }) : snapshotOf(s, { rotation, underground: true }));
      expect(items.some((it) => it.layer === SceneLayer.Structure || it.layer === SceneLayer.Water || it.layer === SceneLayer.ZoneTint || it.layer === SceneLayer.Marker)).toBe(false);
      expect(items.some((it) => it.key.kind === 'xbld')).toBe(false);
      expect(items.some((it) => it.key.kind === 'overlay' && it.key.id !== OverlayId.EdgeWallL && it.key.id !== OverlayId.EdgeWallR)).toBe(false);
      for (const it of ofLayer(items, SceneLayer.Terrain)) expect(it.key.variant).toBe(0x80);
      // 有水住宅 (11,11)：短管桩 variant 1；2×2 商业 (21..22, 12..13) PIPED 无水：每格一根 variant 0；断电 3×3 (26,12) 未 PIPED：无地面项
      const at = (x: number, y: number): SceneItem[] => items.filter((it) => it.tile === tileIndex(x, y) && it.layer !== SceneLayer.Terrain && it.layer !== SceneLayer.EdgeWall);
      expect(at(11, 11)).toHaveLength(1); expect(at(11, 11)[0]!.key).toEqual({ kind: 'xund', id: XUND_PIPE_STUB, variant: 1 });
      for (const t of lotTiles(0x94, 21, 12)) { const a = items.filter((it) => it.tile === t && it.layer === SceneLayer.Ground); expect(a).toHaveLength(1); expect(a[0]!.key).toEqual({ kind: 'xund', id: XUND_PIPE_STUB, variant: 0 }); }
      expect(at(26, 12)).toHaveLength(0);
      // 管线 (10..29, 15) 直线 0x10 → 旋转环 0x10↔0x11；地铁 (45, 30..59) 0x01↔0x02
      const pipe = at(12, 15)[0]!, sub = at(45, 35)[0]!;
      expect(pipe.key).toEqual({ kind: 'xund', id: rotateXund(0x10, rotation), variant: 0 });
      expect(sub.key).toEqual({ kind: 'xund', id: rotateXund(0x01, rotation), variant: 0 });
      expect(rotateXund(0x10, 1)).toBe(0x11);
    }
  });
});

describe('compiler: 标牌与局部性', () => {
  it('xtxt 0x01..0x32 → Sign、0xFA → Connection、微模拟标签不出项；onLabel 钩子与 labelsOf 一致', () => {
    const s = denseState();
    const got: SceneLabel[] = [];
    const c = createSceneCompiler({ onLabel: (l) => got.push(l) });
    const snap = snapshotOf(s, { rotation: 1 });
    const items = c.compileAll(snap);
    const signs = items.filter((it) => it.key.kind === 'overlay' && (it.key.id === OverlayId.Sign || it.key.id === OverlayId.Connection));
    expect(signs.map((it) => [it.tile, it.key.id]).sort((a, b) => a[0]! - b[0]!)).toEqual([[tileIndex(5, 22), OverlayId.Connection], [tileIndex(11, 11), OverlayId.Sign]]);
    expect(got.map((l) => [l.tile, l.kind, l.xtxt]).sort((a, b) => (a[0] as number) - (b[0] as number))).toEqual([[tileIndex(5, 22), 'connection', 0xfa], [tileIndex(11, 11), 'sign', 0x05]]);
    const labels = labelsOf(snap);
    expect(labels.map((l) => [l.tile, l.x, l.y])).toEqual(got.sort((a, b) => a.tile - b.tile).map((l) => [l.tile, l.x, l.y]));
    expect(labelsOf(snapshotOf(s, { underground: true }))).toHaveLength(0);
  });
  it('局部性：改一格只产生该格（与其锚格）的 diff', () => {
    const s = denseState();
    const snap = snapshotOf(s);
    const ser = (items: readonly SceneItem[]): Map<number, string> => { const m = new Map<number, string>(); for (const [t, arr] of byTile(items)) m.set(t, JSON.stringify(arr)); return m; };
    const diffTiles = (a: Map<number, string>, b: Map<number, string>): number[] => { const out: number[] = []; for (const t of new Set([...a.keys(), ...b.keys()])) if (a.get(t) !== b.get(t)) out.push(t); return out.sort((p, q) => p - q); };
    const before = ser(compileAll(snap));
    // 空地上种树
    s.layers.xbld[tileIndex(100, 50)] = 0x08;
    const after1 = ser(compileAll(snap));
    expect(diffTiles(before, after1)).toEqual([tileIndex(100, 50)]);
    // 3×3 工业（锚 26,12）一个非锚占地格通电位变化：只有该格（无变化：非锚格不出项）与锚格可能变
    const lot = tileIndex(26, 12), anchor = renderAnchor(lot, 3, 0);
    for (const t of lotTiles(0xbc, 26, 12)) s.layers.xbit[t] = s.layers.xbit[t]! | XBit.Powered;
    const after2 = ser(compileAll(snap));
    const d2 = diffTiles(after1, after2);
    expect(d2.every((t) => t === anchor || lotTiles(0xbc, 26, 12).includes(t))).toBe(true);
    expect(d2).toContain(anchor);
    // 单格编译结果与全量编译中该格一致
    for (const t of [tileIndex(100, 50), anchor, tileIndex(11, 11), tileIndex(127, 127)]) {
      expect(JSON.stringify(tileItems([s], t))).toBe(after2.get(t));
    }
  });
});

describe.each(['optimistic', 'pessimistic'] as const)('compiler: 桩城（%s）', (profile) => {
  it('空城快照：16384 个 Terrain 项、无 Marker（桩 markers 全零）、pick 往返、sceneCompiler 对象可用', () => {
    const { ctx } = createTestContext({ profile });
    const s = ctx.state;
    const snap = snapshotOf(s, { markers: ctx.q.disasters.markers() as Uint8Array });
    const items = sceneCompiler.compileAll(snap);
    expect(ofLayer(items, SceneLayer.Terrain)).toHaveLength(TILES);
    expect(ofLayer(items, SceneLayer.Marker)).toHaveLength(0);
    for (const t of [0, 5000, 16383]) {
      const [sx, sy] = sceneCompiler.worldToScreen(snap, tileX(t), tileY(t), s.layers.alt[t]!);
      expect(sceneCompiler.pick(snap, sx, sy + 8)).toBe(t);
    }
    const out: SceneItem[] = [];
    sceneCompiler.compileTile(snap, 77, out);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(sceneCompiler.edgeOf(snap, tileIndex(127, 127))).toBe('LR');
  });
});
