// ===== app/stubs/stubScene.ts =====（CONTRACTS §V RenderEntry.sceneCompiler 的 WP0 最小实现；WP10 的 render/scene 接手）
// 只编译 Terrain 项（每格 1 项）：key = { kind:'terrain', id: 旋转后坡面码, variant: altBand(alt>>3) | 地下 0x80 }，
// 投影 / 像素锚点严格按 contracts/render.ts 的 mapOrigin 约定（worldToScreen = 顶点 c00'，SceneItem.x/y = 底顶点 c11'），
// pick 用"31→0 级逆投影 + 本格海拔区间"近似（不做四边形精确测试），edgeOf 按旋转后 rx==127 / ry==127。无 DOM 依赖。
import type { RenderSnapshot, SceneCompiler, SceneItem } from '../../contracts/render';
import { SceneLayer, ZOOM_TABLE, mapOrigin, zKeyOf } from '../../contracts/render';
import { MAP, MAX_ALT, TILES, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { rotateTile, rotateXter, unrotateTile } from '../../contracts/rotation';

/** 海拔分带（0..3）：桩按 alt >> 3；真编译器按 spec:ui-art §3.7。 */
export const altBandOf = (alt: number): number => Math.min(3, alt >> 3);
const slopeOfRotated = (xter: number, rot: 0 | 1 | 2 | 3): number => {
  const c = rotateXter(xter, rot);
  return c === 0x3e ? 13 : c >= 0x40 ? 0 : c & 0x0f;
};

function worldToScreen(snap: RenderSnapshot, x: number, y: number, h: number): [number, number] {
  const z = ZOOM_TABLE[snap.view.zoom];
  const S = z.tileW / 2, LEVEL = z.levelPx;
  const o = mapOrigin(snap.view.zoom);
  const [rx, ry] = rotateTile(x, y, snap.view.rotation);
  return [o.x + (rx - ry) * S, o.y + ((rx + ry) * S) / 2 - h * LEVEL];
}

function compileTile(snap: RenderSnapshot, i: number, out: SceneItem[]): void {
  const x = tileX(i), y = tileY(i);
  const [rx, ry] = rotateTile(x, y, snap.view.rotation);
  const depth = rx + ry;
  const base = snap.layers.alt[i]!;
  const slope = slopeOfRotated(snap.layers.xter[i]!, snap.view.rotation);
  const variant = altBandOf(base) | (snap.view.underground ? 0x80 : 0);
  const [sx, sy] = worldToScreen(snap, x, y, base);
  const tileH = ZOOM_TABLE[snap.view.zoom].tileH;
  out.push({
    tile: i, layer: SceneLayer.Terrain, key: { kind: 'terrain', id: slope, variant },
    x: sx, y: sy + tileH,
    depth, rx, zKey: zKeyOf(depth, rx, SceneLayer.Terrain), flip: false, anim: 'none',
  });
}

function compileAll(snap: RenderSnapshot): SceneItem[] {
  const out: SceneItem[] = [];
  for (let i = 0; i < TILES; i++) compileTile(snap, i, out);
  return out;
}

/** 近似拾取：从 31 级到 0 级逆投影，命中条件 alt[i] ≤ lvl ≤ alt[i] + (坡面 ? 1 : 0)。地块中心往返精确（picking.test 口径）。 */
function pick(snap: RenderSnapshot, px: number, py: number): number | null {
  const z = ZOOM_TABLE[snap.view.zoom];
  const S = z.tileW / 2, LEVEL = z.levelPx;
  const o = mapOrigin(snap.view.zoom);
  for (let lvl = MAX_ALT; lvl >= 0; lvl--) {
    const wy = py + lvl * LEVEL;
    const fx = (px - o.x) / S, fy = (wy - o.y) / (S / 2);
    const rx = Math.floor((fx + fy) / 2), ry = Math.floor((fy - fx) / 2);
    if (rx < 0 || ry < 0 || rx >= MAP || ry >= MAP) continue;
    const [x, y] = unrotateTile(rx, ry, snap.view.rotation);
    if (!inMap(x, y)) continue;
    const i = tileIndex(x, y);
    const a = snap.layers.alt[i]!;
    const top = a + (slopeOfRotated(snap.layers.xter[i]!, snap.view.rotation) === 0 ? 0 : 1);
    if (lvl >= a && lvl <= top) return i;
  }
  return null;
}

function edgeOf(snap: RenderSnapshot, i: number): 'L' | 'R' | 'LR' | null {
  const [rx, ry] = rotateTile(tileX(i), tileY(i), snap.view.rotation);
  const r = rx === MAP - 1, l = ry === MAP - 1;
  return r && l ? 'LR' : r ? 'R' : l ? 'L' : null;
}

export const stubSceneCompiler: SceneCompiler = { compileTile, compileAll, worldToScreen, pick, edgeOf };
