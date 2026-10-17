import { describe, expect, it } from 'vitest';
import { TileMarker } from './grid';
import { rotateTile, unrotateTile } from './rotation';
import type { Rotation } from './rotation';
import type { SpriteKey, ZoomLevel } from './render';
import {
  ACTOR_COUNT, ActorId, MAP_LAYER_MODES, OVERLAY_COUNT, OverlayId, SPRITE_KINDS, SPRITE_KIND_CODE, SceneLayer, UiIconId, ZOOM_TABLE,
  backingScaleFor, bandOf, mapCanvasSize, mapOrigin, markerOverlayId, spriteKeyHash, zKeyOf, zoneOverlayId,
} from './render';

const ZOOMS: readonly ZoomLevel[] = [0, 1, 2, 3, 4];
const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
/** 契约注释里的像素约定：旋转后地块 (rx,ry) 在海拔 h 的顶点 c00'。 */
function c00(z: ZoomLevel, rx: number, ry: number, h: number): [number, number] {
  const { tileW, levelPx } = ZOOM_TABLE[z];
  const S = tileW / 2;
  const o = mapOrigin(z);
  return [o.x + (rx - ry) * S, o.y + (rx + ry) * S / 2 - h * levelPx];
}

describe('render: ZOOM_TABLE', () => {
  it('五档 2:1 等轴：tileH = tileW/2，levelPx = 3/4·tileH，档间 2 倍', () => {
    expect(ZOOM_TABLE).toHaveLength(5);
    for (const [k, row] of ZOOM_TABLE.entries()) {
      expect(row.tileH * 2).toBe(row.tileW);
      expect(row.levelPx * 4).toBe(row.tileH * 3);
      if (k > 0) expect(row.tileW).toBe(ZOOM_TABLE[k - 1]!.tileW * 2);
    }
    expect(ZOOM_TABLE.map((r) => r.scale)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
  });
});

describe('render: mapOrigin（五档 × 四旋转）', () => {
  it('旋转后 (0,0) 在海拔 31 的顶点 c00\' 落在 y == 0', () => {
    for (const z of ZOOMS) for (const r of ROTATIONS) {
      const [wx, wy] = unrotateTile(0, 0, r);                       // 世界格 → 旋转后恰为 (0,0)
      const [rx, ry] = rotateTile(wx, wy, r);
      expect([rx, ry]).toEqual([0, 0]);
      expect(c00(z, rx, ry, 31)[1]).toBe(0);
    }
  });
  it('旋转后 (0,127) 的左顶点落在 x == 0（与海拔无关）', () => {
    for (const z of ZOOMS) for (const r of ROTATIONS) {
      const [wx, wy] = unrotateTile(0, 127, r);
      const [rx, ry] = rotateTile(wx, wy, r);
      expect([rx, ry]).toEqual([0, 127]);
      const S = ZOOM_TABLE[z].tileW / 2;
      for (const h of [0, 15, 31]) expect(c00(z, rx, ry, h)[0] - S).toBe(0);
    }
  });
  it('画布尺寸 = 128·tileW × (31·levelPx + 128·tileH)：右顶点 (127,0) 触右边、底顶点 (127,127)@0 触下边', () => {
    for (const z of ZOOMS) {
      const { tileW, tileH } = ZOOM_TABLE[z];
      const S = tileW / 2;
      const size = mapCanvasSize(z);
      expect(size).toEqual({ w: 128 * tileW, h: 31 * ZOOM_TABLE[z].levelPx + 128 * tileH });
      expect(c00(z, 127, 0, 0)[0] + S).toBe(size.w);
      expect(c00(z, 127, 127, 0)[1] + tileH).toBe(size.h);
      expect(mapOrigin(z)).toEqual({ x: 64 * tileW, y: 31 * ZOOM_TABLE[z].levelPx });
    }
  });
});

describe('render: overlay / actor / ui id', () => {
  it('zoneOverlayId(1..9) 单调 +1，且落在 ZoneRLight..ZoneSeaport', () => {
    expect(zoneOverlayId(1)).toBe(OverlayId.ZoneRLight);
    expect(zoneOverlayId(9)).toBe(OverlayId.ZoneSeaport);
    for (let zone = 1; zone <= 9; zone++) {
      const id = zoneOverlayId(zone);
      expect(id).toBeGreaterThanOrEqual(OverlayId.ZoneRLight);
      expect(id).toBeLessThanOrEqual(OverlayId.ZoneSeaport);
      if (zone > 1) expect(id).toBe(zoneOverlayId(zone - 1) + 1);
    }
  });
  it('markerOverlayId：五个标记值映射到四种叠加（两种暴民同用 Riot），其余为 null', () => {
    expect(markerOverlayId(TileMarker.Fire)).toBe(OverlayId.Fire);
    expect(markerOverlayId(TileMarker.Flood)).toBe(OverlayId.Flood);
    expect(markerOverlayId(TileMarker.ToxicCloud)).toBe(OverlayId.Toxic);
    expect(markerOverlayId(TileMarker.Rioters)).toBe(OverlayId.Riot);
    expect(markerOverlayId(TileMarker.MassRioters)).toBe(OverlayId.Riot);
    expect(markerOverlayId(TileMarker.None)).toBeNull();
    for (const v of [0x01, 0x7f, 0xc8, 0xfa]) expect(markerOverlayId(v)).toBeNull();
  });
  it('OVERLAY_COUNT / ACTOR_COUNT 与枚举末项一致；MAP_LAYER_MODES 装得进 ui 区段', () => {
    expect(OVERLAY_COUNT).toBe(OverlayId.EdgeWallR + 1);
    expect(ACTOR_COUNT).toBe(ActorId.DeployMilitary + 1);
    expect(MAP_LAYER_MODES).toHaveLength(15);
    expect(new Set(MAP_LAYER_MODES).size).toBe(15);
    expect(MAP_LAYER_MODES.length).toBeLessThanOrEqual(UiIconId.SubToolBase - UiIconId.MapLayerBase);
    expect(UiIconId.Pin).toBeLessThan(UiIconId.SpeedBase);              // 固定图标不侵入区段
    expect(UiIconId.WeatherBase - UiIconId.SpeedBase).toBeGreaterThanOrEqual(5);    // 5 档速度
    expect(UiIconId.MapLayerBase - UiIconId.WeatherBase).toBeGreaterThanOrEqual(12); // 12 种天气
    expect(UiIconId.SubToolBase + 64).toBeLessThanOrEqual(256);          // ≤ 64 个子工具，8 位 id
  });
});

describe('render: spriteKeyHash', () => {
  it('七种 kind 编码两两不同（不用首字母：xbld / xund 同为 x），哈希随 kind 变化且恒 > 0', () => {
    expect(SPRITE_KINDS).toHaveLength(7);
    expect(SPRITE_KINDS.map((k) => SPRITE_KIND_CODE[k])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const hashes = SPRITE_KINDS.map((kind) => spriteKeyHash({ kind, id: 0x21 }));
    expect(new Set(hashes).size).toBe(7);
    expect(spriteKeyHash({ kind: 'xbld', id: 0x21 })).not.toBe(spriteKeyHash({ kind: 'xund', id: 0x21 }));
    for (const h of hashes) expect(h).toBeGreaterThan(0);
    expect(spriteKeyHash({ kind: 'xbld', id: 0 })).toBeGreaterThan(0);
  });
  it('按 (kindCode+1)|id|variant|frame 各 8 位打包；缺省 variant / frame = 0', () => {
    const k: SpriteKey = { kind: 'xbld', id: 0x12, variant: 3, frame: 4 };
    expect(spriteKeyHash(k)).toBe((1 << 24) | (0x12 << 16) | (3 << 8) | 4);
    expect(spriteKeyHash({ kind: 'ui', id: 0xff, variant: 0xff, frame: 0xff })).toBe((7 << 24) | 0xffffff);
    expect(spriteKeyHash({ kind: 'xbld', id: 0x12 })).toBe((1 << 24) | (0x12 << 16));
    expect(spriteKeyHash({ kind: 'xbld', id: 0x12, variant: 0, frame: 0 })).toBe(spriteKeyHash({ kind: 'xbld', id: 0x12 }));
  });
});

describe('render: zKeyOf / bandOf', () => {
  it('depth 主序 > rx > layer，且可逆分解', () => {
    expect(zKeyOf(1, 0, SceneLayer.Terrain)).toBeGreaterThan(zKeyOf(0, 255, SceneLayer.Preview));
    expect(zKeyOf(0, 1, SceneLayer.Terrain)).toBeGreaterThan(zKeyOf(0, 0, SceneLayer.Preview));
    for (let layer = SceneLayer.Terrain; layer < SceneLayer.Preview; layer++) expect(zKeyOf(5, 5, layer + 1)).toBe(zKeyOf(5, 5, layer) + 1);
    const key = zKeyOf(254, 127, SceneLayer.Actor);
    expect(key % 16).toBe(SceneLayer.Actor);
    expect(Math.floor(key / 16) % 256).toBe(127);
    expect(Math.floor(key / 4096)).toBe(254);
    expect(SceneLayer.Preview).toBeLessThan(16);
  });
  it('bandOf：depth 0..254 → 16 条带', () => {
    expect(bandOf(0)).toBe(0); expect(bandOf(15)).toBe(0); expect(bandOf(16)).toBe(1); expect(bandOf(254)).toBe(15);
    expect(new Set(Array.from({ length: 255 }, (_, d) => bandOf(d))).size).toBe(16);
  });
});

describe('render: backingScaleFor', () => {
  it('整数舞台缩放：向下取整且 ≥ 1', () => {
    expect(backingScaleFor(0.5)).toBe(1); expect(backingScaleFor(1)).toBe(1); expect(backingScaleFor(1.5)).toBe(1);
    expect(backingScaleFor(2)).toBe(2); expect(backingScaleFor(2.75)).toBe(2);
  });
});
