// WP0 桩的自检：PNG 编码合法性、CPU 合成贴图位置、场景编译投影 / 拾取往返、三套 Queries 桩语义、nullSystem 键集合与绑定、v1 白名单。
import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { createCityState } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import { XBit, tileIndex } from '../../contracts/grid';
import { BridgeKind, NET_BASE } from '../../contracts/net';
import { ACTION_OWNER } from '../../contracts/actions';
import { MAX_ALT, TILES } from '../../contracts/grid';
import type { RenderSnapshot, SceneItem } from '../../contracts/render';
import { SceneLayer, ZOOM_TABLE, zKeyOf } from '../../contracts/render';
import type { SimContext, SystemId } from '../../contracts/system';
import type { Queries } from '../../contracts/queries';
import { CATALOGUE } from '../../data';
import { stubCpuCompositor, crc32, adler32, zlibStore } from './stubCompositor';
import { buildDiamond, createStubProvider, STUB_MAGENTA_INDEX } from './stubProvider';
import { stubSceneCompiler } from './stubScene';
import { stubQueries, stubBridgePieces } from './stubQueries';
import { stubActions } from './stubActions';
import { QUERY_OWNER } from '../../contracts/queries';
import { nullSystem } from './null';
import { panDelta } from './stubShell';
import { V1_TOOL_COUNT, V1_TOOL_IDS } from '../v1Tools';

const snapOf = (s: CityState, zoom: 0 | 1 | 2 | 3 | 4 = 2, rotation: 0 | 1 | 2 | 3 = 0, underground = false): RenderSnapshot => ({
  layers: s.layers, maps: s.maps, markers: new Uint8Array(TILES),
  view: { zoom, rotation, centerX: 64, centerY: 64, underground, show: { buildings: true, signs: true, infrastructure: true, zones: true }, mapLayer: null },
  seaLevel: 0, artScale: ZOOM_TABLE[zoom].scale, trafficLight: 48, trafficHeavy: 160,
});
const be32 = (b: Uint8Array, at: number): number => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

describe('stubCompositor', () => {
  it('encodePng 产出合法 PNG（签名 / IHDR / CRC / zlib store 可被 inflate 还原）', () => {
    const w = 5, h = 3;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 255;
    const png = stubCpuCompositor.encodePng(rgba, w, h);
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR
    expect(be32(png, 8)).toBe(13);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe('IHDR');
    expect(be32(png, 16)).toBe(w);
    expect(be32(png, 20)).toBe(h);
    expect(be32(png, 29)).toBe(crc32(png, 12, 29));
    // IDAT
    const idatLen = be32(png, 33);
    expect(String.fromCharCode(...png.subarray(37, 41))).toBe('IDAT');
    const idat = png.subarray(41, 41 + idatLen);
    const raw = inflateSync(idat);
    expect(raw.length).toBe((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
      expect(raw[y * (w * 4 + 1)]).toBe(0);
      expect(Array.from(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)))).toEqual(Array.from(rgba.subarray(y * w * 4, (y + 1) * w * 4)));
    }
    expect(be32(png, 41 + idatLen)).toBe(crc32(png, 37, 41 + idatLen));
    // IEND
    expect(String.fromCharCode(...png.subarray(41 + idatLen + 8, 41 + idatLen + 12))).toBe('IEND');
    expect(png.length).toBe(41 + idatLen + 16);
  });
  it('zlibStore 多块（> 65535 字节）也能 inflate；adler32/crc32 与已知值一致', () => {
    const big = new Uint8Array(70000).map((_, i) => i & 255);
    expect(Array.from(inflateSync(zlibStore(big)))).toEqual(Array.from(big));
    const abc = new TextEncoder().encode('abc');
    expect(crc32(abc)).toBe(0x352441c2);
    expect(adler32(abc)).toBe(0x024d0127);
  });
  it('render 把位图以锚点贴到 (x,y)，按 zKey 排序，索引 0 透明，flip 水平镜像', () => {
    const prov = createStubProvider();
    const d = prov.bitmap({ kind: 'terrain', id: 0 }, 'M')!;
    expect([d.w, d.h, d.anchorX, d.anchorY]).toEqual([32, 16, 16, 16]);
    const item = (x: number, y: number, zKey: number, flip = false): SceneItem => ({ tile: 0, layer: SceneLayer.Terrain, key: { kind: 'terrain', id: 0 }, x, y, depth: 0, rx: 0, zKey, flip, anim: 'none' });
    const out = stubCpuCompositor.render([item(16, 16, 1)], prov, 'M', { x: 0, y: 0, w: 32, h: 16 });
    // 贴图后应与菱形逐像素相同（锚点 (16,16) 贴到 (16,16) → 位图左上角在 (0,0)）
    expect(Array.from(out.data)).toEqual(Array.from(d.data));
    // 中心像素为洋红；四角透明
    expect(out.data[8 * 32 + 16]).toBe(STUB_MAGENTA_INDEX);
    expect(out.data[0]).toBe(0);
    // 平移 + 裁剪：锚点 (0,0) → 只剩右下四分之一
    const clipped = stubCpuCompositor.render([item(0, 0, 1)], prov, 'M', { x: 0, y: 0, w: 32, h: 16 });
    expect(clipped.data[0]).toBe(0);
    expect(clipped.data.some((v) => v !== 0)).toBe(false);   // 位图全在负坐标区
    const shifted = stubCpuCompositor.render([item(32, 8, 1)], prov, 'M', { x: 0, y: 0, w: 32, h: 16 });
    expect(shifted.data[0 * 32 + 31]).toBe(d.data[8 * 32 + 15]);
    // flip 对称菱形不变；用非对称位图验证镜像
    const asym = { w: 3, h: 1, data: new Uint8Array([1, 2, 0]), anchorX: 0, anchorY: 1, cycling: false };
    const asymProv = { ...prov, bitmap: () => asym };
    const f = stubCpuCompositor.render([item(0, 1, 1, true)], asymProv, 'M', { x: 0, y: 0, w: 3, h: 1 });
    expect(Array.from(f.data)).toEqual([0, 2, 1]);
    const rgba = stubCpuCompositor.toRgba(out, prov.palette);
    const c = (8 * 32 + 16) * 4;
    expect(Array.from(rgba.subarray(c, c + 4))).toEqual([255, 0, 255, 255]);
    expect(rgba[3]).toBe(0);
  });
});

describe('stubScene', () => {
  it('worldToScreen 满足 mapOrigin 约定：(0,0)@31 顶点 y==0；(0,127) 左顶点 x==0（四个旋转）', () => {
    const s = createCityState();
    for (const rot of [0, 1, 2, 3] as const) for (const zoom of [1, 2, 3] as const) {
      const snap = snapOf(s, zoom, rot);
      // 旋转后 (0,0) 对应的世界格：unrotate
      const minY = Math.min(...[0, 1, 2, 3].map(() => 0));
      void minY;
      let bestY = Infinity, bestX = Infinity;
      for (let i = 0; i < TILES; i++) {
        const [sx, sy] = stubSceneCompiler.worldToScreen(snap, i >> 7, i & 127, MAX_ALT);
        bestY = Math.min(bestY, sy);
        bestX = Math.min(bestX, sx - ZOOM_TABLE[zoom].tileW / 2);
      }
      expect(bestY).toBe(0);
      expect(bestX).toBe(0);
    }
  });
  it('每格恰一个 Terrain 项，key.id = 旋转后坡面码，y = 顶点 + tileH；zKey = depth·4096 + rx·16', () => {
    const s = createCityState();
    s.layers.alt[tileIndex(10, 10)] = 5;
    s.layers.xter[tileIndex(10, 10)] = 0x01;
    const snap = snapOf(s, 2, 1);
    const out: SceneItem[] = [];
    stubSceneCompiler.compileTile(snap, tileIndex(10, 10), out);
    expect(out).toHaveLength(1);
    const it0 = out[0]!;
    expect(it0.key.kind).toBe('terrain');
    expect(it0.key.id).toBe(4);   // SLOPE_ROT_CCW[1] = 4
    const [sx, sy] = stubSceneCompiler.worldToScreen(snap, 10, 10, 5);
    expect([it0.x, it0.y]).toEqual([sx, sy + 16]);
    expect(it0.zKey).toBe(zKeyOf(it0.depth, it0.rx, SceneLayer.Terrain));
    expect(stubSceneCompiler.compileAll(snap)).toHaveLength(TILES);
    expect(stubSceneCompiler.compileAll(snapOf(s, 2, 0, true))[0]!.key.variant! & 0x80).toBe(0x80);
  });
  it('pick 以地块中心往返（含海拔与四个旋转）', () => {
    const s = createCityState();
    for (let i = 0; i < TILES; i += 97) s.layers.alt[i] = (i * 7) % 32;
    for (const rot of [0, 1, 2, 3] as const) {
      const snap = snapOf(s, 2, rot);
      for (const t of [0, 1, 127, 128, 5000, 8191, 16383, 97 * 13, 97 * 50]) {
        const x = t >> 7, y = t & 127;
        const [sx, sy] = stubSceneCompiler.worldToScreen(snap, x, y, s.layers.alt[t]!);
        expect(stubSceneCompiler.pick(snap, sx, sy + 8)).toBe(t);
      }
    }
    expect(stubSceneCompiler.pick(snapOf(s), -100000, -100000)).toBeNull();
  });
  it('edgeOf：旋转后 rx==127 → R、ry==127 → L、角 → LR', () => {
    const s = createCityState();
    const snap = snapOf(s, 2, 0);
    expect(stubSceneCompiler.edgeOf(snap, tileIndex(127, 5))).toBe('R');
    expect(stubSceneCompiler.edgeOf(snap, tileIndex(5, 127))).toBe('L');
    expect(stubSceneCompiler.edgeOf(snap, tileIndex(127, 127))).toBe('LR');
    expect(stubSceneCompiler.edgeOf(snap, tileIndex(0, 0))).toBeNull();
    const r1 = snapOf(s, 2, 1);   // (x,y)→(y,127−x)：rx==127 ⇔ y==127
    expect(stubSceneCompiler.edgeOf(r1, tileIndex(5, 127))).toBe('R');
  });
});

describe('stubQueries（三套 profile）', () => {
  const city = (): CityState => { const s = createCityState(); s.clock.foundedYear = 1900; s.economy.funds = 1000; return s; };
  it('realistic：hasAccess 查 24 偏移、hasPower 查自身或 4 邻、invented = base+10、canAfford 看资金', () => {
    const s = city();
    const q = stubQueries('realistic', s, CATALOGUE);
    expect(q.transport.hasAccess(50, 50)).toBe(false);
    s.layers.xbld[tileIndex(50, 53)] = 0x1d;            // (0,3) 在偏移表内
    expect(q.transport.hasAccess(50, 50)).toBe(true);
    expect(q.transport.hasAccess(50, 46)).toBe(false);  // (0,7) 不在
    expect(q.transport.runTrip(tileIndex(50, 50), 1, 0).ok).toBe(true);
    expect(q.utilities.hasPower(tileIndex(20, 20))).toBe(false);
    s.layers.xbit[tileIndex(21, 20)] = XBit.Powered;
    expect(q.utilities.hasPower(tileIndex(20, 20))).toBe(true);
    expect(q.utilities.poweredSelf(tileIndex(20, 20))).toBe(false);
    expect(q.tech.invented('gas')).toBe(false);          // 1900 < 1950+10
    s.clock.age = 300 * 61;                               // 1961
    expect(q.tech.invented('gas')).toBe(true);
    expect(q.tech.invented('nuclear')).toBe(false);       // 1955+10 = 1965
    expect(q.economy.canAfford(1000)).toBe(true);
    expect(q.economy.canAfford(1001)).toBe(false);
    expect(q.economy.year()).toBe(1961);
  });
  it('realistic：pieceFor = NET_BASE + 四邻同族选形；railMask；bridgeOptions / bridgePieces 为 v1 集合', () => {
    const s = city();
    const q = stubQueries('realistic', s, CATALOGUE);
    const c = tileIndex(40, 40);
    expect(q.transport.pieceFor('road', c)).toBe(NET_BASE.road + 0);          // 孤立 → L-R 直线
    expect(q.transport.pieceFor('pipe', c)).toBe(NET_BASE.pipe + 14);         // 孤立管线 → 十字
    s.layers.xbld[tileIndex(40, 39)] = 0x1d; s.layers.xbld[tileIndex(40, 41)] = 0x1d;   // T + B
    expect(q.transport.pieceFor('road', c)).toBe(NET_BASE.road + 1);
    s.layers.xbld[tileIndex(41, 40)] = 0x2c;
    expect(q.transport.railMask(c)).toBe(0b0010);
    expect(q.transport.bridgeOptions('road', 9)).toEqual([BridgeKind.Causeway]);
    expect(q.transport.bridgeOptions('rail', 3)).toEqual([BridgeKind.Rail]);
    expect(q.transport.bridgeOptions('power', 3)).toEqual([BridgeKind.Wire]);
    expect(q.transport.bridgeOptions('highway', 3)).toEqual([]);
    expect(stubBridgePieces(BridgeKind.Causeway, 4)).toEqual([0x58, 0x57, 0x58, 0x57]);
    expect(stubBridgePieces(BridgeKind.Rail, 3)).toEqual([0x5b, 0x5a, 0x5b]);
    expect(stubBridgePieces(BridgeKind.Wire, 2)).toEqual([0x5c, 0x5c]);
    expect(stubBridgePieces(BridgeKind.Suspension, 8)).toBeNull();
    expect(q.news.currentPaper()).toBeNull();
    expect(q.disasters.markers().length).toBe(TILES);
  });
  it('optimistic / pessimistic 的固定答案', () => {
    const s = city();
    const o = stubQueries('optimistic', s, CATALOGUE), p = stubQueries('pessimistic', s, CATALOGUE);
    expect(o.utilities.hasPower(0)).toBe(true); expect(p.utilities.hasPower(0)).toBe(false);
    expect(o.transport.hasAccess(0, 0)).toBe(true); expect(p.transport.hasAccess(0, 0)).toBe(false);
    expect(o.transport.runTrip(0, 1, 0).ok).toBe(true); expect(p.transport.runTrip(0, 1, 0).ok).toBe(false);
    expect(o.tech.invented('fusion')).toBe(true); expect(p.tech.invented('gas')).toBe(false);
    expect(o.services.landValue(0)).toBe(128); expect(p.services.landValue(0)).toBe(0);
    expect(o.economy.canAfford(1e9)).toBe(true); expect(p.economy.canAfford(0)).toBe(false);
    expect(o.placement.canPlace(0xcf, 10, 10).ok).toBe(true);
    expect(p.placement.canPlace(0xcf, 10, 10)).toMatchObject({ ok: false, reason: 'occupied' });
  });
  it('realistic placement：占地检查顺序 outOfBounds / water / slope / occupied / funds；availability 顺序', () => {
    const s = city();
    const q = stubQueries('realistic', s, CATALOGUE);
    expect(q.placement.canPlace(0xcf, 126, 126)).toMatchObject({ ok: false, reason: 'outOfBounds' });
    expect(q.placement.canPlace(0xdc, 10, 10)).toMatchObject({ ok: true, cost: CATALOGUE.BUILDINGS[0xdc]!.cost });
    s.layers.xbld[tileIndex(10, 10)] = 0x70;
    expect(q.placement.canPlace(0xdc, 10, 10)).toMatchObject({ ok: false, reason: 'occupied' });
    s.economy.funds = 0;
    expect(q.placement.canPlace(0xdc, 11, 11)).toMatchObject({ ok: false, reason: 'funds' });
    expect(q.placement.availability('no.such.tool')).toEqual({ enabled: false, reason: 'notImplemented' });
    expect(q.placement.availability('power.fusion')).toEqual({ enabled: false, reason: 'notInvented' });
    expect(q.placement.availability('rewards.cityHall')).toEqual({ enabled: false, reason: 'locked' });
    expect(q.placement.availability('roads.road')).toEqual({ enabled: false, reason: 'funds' });
    s.economy.funds = 1e6;
    expect(q.placement.availability('roads.road')).toEqual({ enabled: true });
    const pv = q.placement.preview({ type: 'zoneRect', zone: 1, x0: 20, y0: 20, x1: 21, y1: 21 });
    expect(pv.tiles).toHaveLength(4);
    expect(pv.ok).toBe(true);
  });
});

describe('stubActions', () => {
  it('charge 扣资金；destroyStructure 整栋 → 瓦砾 + 角标清 + 分区保留 + counts 同步', () => {
    const s = createCityState();
    s.economy.funds = 100;
    const a = stubActions(s);
    expect(a.charge(0)).toBe(true);
    expect(a.charge(60)).toBe(true);
    expect(a.charge(60)).toBe(false);
    expect(s.economy.funds).toBe(40);
    // 2×2 建筑 0x8c，锚格 (30,30)，角标 TL/TR/BL/BR，分区 R 密集 (2)
    const id = 0x8c;
    const corners = [0x40, 0x10, 0x80, 0x20];   // (dx,dy)=(0,0) TL,(0,1) BL,(1,0) TR,(1,1) BR
    let k = 0;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = tileIndex(30 + dx, 30 + dy);
      s.layers.xbld[i] = id; s.layers.xzon[i] = corners[k++]! | 2; s.layers.xbit[i] = XBit.Powered | XBit.Powerable; s.counts.tile[id]!++;
    }
    a.destroyStructure(31, 31, 'BULLDOZE');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = tileIndex(30 + dx, 30 + dy);
      expect(s.layers.xbld[i]! >= 0x01 && s.layers.xbld[i]! <= 0x04).toBe(true);
      expect(s.layers.xzon[i]).toBe(2);
      expect(s.layers.xbit[i]! & (XBit.Powered | XBit.Powerable)).toBe(0);
    }
    expect(s.counts.tile[id]).toBe(0);
    expect(s.counts.tile[0x01]! + s.counts.tile[0x02]! + s.counts.tile[0x03]! + s.counts.tile[0x04]!).toBe(4);
    a.addTraffic(tileIndex(2, 2), 300);
    expect(s.maps.xtrf[0]).toBe(0);
    expect(s.maps.xtrf[1 * 64 + 1]).toBe(255);
  });
});

describe('nullSystem', () => {
  const owned = (id: SystemId): string[] => (Object.keys(QUERY_OWNER) as Array<keyof Queries>).filter((k) => QUERY_OWNER[k] === id);
  it('queries 只填自己的键、actions 只填 ACTION_OWNER 归自己的键、stub:true、无阶段 / 命令', () => {
    for (const id of ['terrain', 'placement', 'utilities', 'zones', 'transport', 'services', 'economy', 'events'] as const) {
      const sys = nullSystem(id);
      expect(sys.stub).toBe(true);
      expect(sys.phases).toBeUndefined();
      expect(sys.commands).toBeUndefined();
      expect(Object.keys(sys.queries ?? {}).sort()).toEqual(owned(id).sort());
      const expectedActions = (Object.keys(ACTION_OWNER) as Array<keyof typeof ACTION_OWNER>).filter((k) => ACTION_OWNER[k] === id);
      expect(Object.keys(sys.actions ?? {}).sort()).toEqual(expectedActions.sort());
    }
    expect(nullSystem('events').queries).toHaveProperty('tech');
    expect(nullSystem('events').queries).toHaveProperty('news');
    expect(nullSystem('events').queries).toHaveProperty('disasters');
  });
  it('绑定前按空城作答（不抛错、不碰外部状态）；init(ctx) 后读 ctx.state', () => {
    const sys = nullSystem('utilities');
    expect(sys.queries!.utilities!.hasPower(0)).toBe(false);
    expect(nullSystem('events').queries!.disasters!.markers().length).toBe(TILES);
    const state = createCityState();
    const ctx = { state, catalogue: CATALOGUE } as unknown as SimContext;
    sys.init(ctx, { name: 'x', difficulty: 1, startYear: 1900, seed: 1, terrainSeed: 1, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } });
    expect(sys.queries!.utilities!.hasPower(tileIndex(3, 3))).toBe(false);
    state.layers.xbit[tileIndex(3, 3)] = XBit.Powered;
    expect(sys.queries!.utilities!.hasPower(tileIndex(3, 3))).toBe(true);
    const eco = nullSystem('economy');
    eco.init(ctx, { name: 'x', difficulty: 1, startYear: 1900, seed: 1, terrainSeed: 1, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } });
    state.economy.funds = 10;
    expect(eco.actions!.charge!(5)).toBe(true);
    expect(state.economy.funds).toBe(5);
    expect(nullSystem('terrain', 'optimistic').id).toBe('terrain');
  });
});

describe('stubShell.panDelta / v1Tools', () => {
  it('panDelta：rot 0 下向右 2S 像素 = (+1, −1) 地块；旋转后按逆变换', () => {
    const view = { zoom: 2 as const, rotation: 0 as const, centerX: 0, centerY: 0, underground: false, show: { buildings: true, signs: true, infrastructure: true, zones: true }, mapLayer: null };
    const S = 16;
    expect(panDelta(view, 2 * S, 0)).toEqual([1, -1]);
    expect(panDelta(view, 0, S)).toEqual([1, 1]);
    // 旋转 1 次：旋转后 (rx,ry) 增量 (1,−1) 对应世界增量 (1, 1)·?  —— 用往返验证：rotate(world) == rotated
    const r1 = { ...view, rotation: 1 as const };
    const [vx, vy] = panDelta(r1, 2 * S, 0);
    // 世界向量 (vx,vy) 旋转 1 次 → (vy, −vx) 应为 (1, −1)
    expect([vy, -vx]).toEqual([1, -1]);
  });
  it('V1_TOOL_IDS 恰 54 个且全部存在于 CATALOGUE.TOOLS', () => {
    expect(V1_TOOL_IDS.size).toBe(V1_TOOL_COUNT);
    expect(V1_TOOL_COUNT).toBe(54);
    for (const id of V1_TOOL_IDS) expect(CATALOGUE.toolById(id), id).toBeDefined();
  });
  it('stubProvider：任何 key 同一菱形，nativeScales = {S,M,L}，非原生档返回 null', () => {
    const p = createStubProvider();
    expect(p.bitmap({ kind: 'xbld', id: 0x70 }, 'M')).toBe(p.bitmap({ kind: 'overlay', id: 3, variant: 9 }, 'M'));
    expect(p.bitmap({ kind: 'xbld', id: 0x70 }, 'XS')).toBeNull();
    expect(p.has({ kind: 'ui', id: 1 }, 'L')).toBe(true);
    expect(p.has({ kind: 'ui', id: 1 }, 'XL')).toBe(false);
    expect(Array.from(p.palette.rgba.subarray(255 * 4, 256 * 4))).toEqual([255, 0, 255, 255]);
    const d = buildDiamond(16, 8);
    expect(d.data[3 * 16 + 8]).toBe(STUB_MAGENTA_INDEX);
    expect(d.data[0]).toBe(0);
  });
});
