/**
 * 人行道铺地种类场（R4 STREET，route-facts §8）：德辅道中的红褐 / 灰陶土砖、金钟道的灰色人字砖。
 * 路面带状网格（roads.ts）按道路名把种类写进顶点；路面带以外、楼前那一截人行道是地形网格（materials/terrain.ts 的平地铺地），
 * 这里另摊一张 4 m 格的小贴图（R = 种类，G = 街道走向角 0–π），地形材质按它换铺地、并把砖缝转到顺街方向。
 * 只读 RoadPlan，不改道路数据；登记进显存账本（'streets:paving'）。
 */
import { DataTexture, NearestFilter, RGFormat, UnsignedByteType, Vector4, type IUniform } from 'three';
import type { RoadPlan } from '../roads';
import { pavingKindOf } from '../roads';
import { registerTextureBytes } from '../materials/lighting';

export const PAVE_CELL_M = 4;
/** 道路中线外多远（车行道半宽 + 人行道 + 这么多米）算这条街的人行道。 */
export const PAVE_EXTRA_M = 7;

const empty = () => {
  const t = new DataTexture(new Uint8Array(2), 1, 1, RGFormat, UnsignedByteType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
};

export const PAVING_UNIFORMS = {
  uPaveGrid: { value: empty() } as IUniform<DataTexture>,
  /** 原点 (minX, minY)、格边长、列数；行数放 uPaveRows。 */
  uPaveRect: { value: new Vector4(0, 0, PAVE_CELL_M, 0) } as IUniform<Vector4>,
  uPaveRows: { value: 0 } as IUniform<number>,
};

/** 铺地种类格（纯计算，测试用）：返回格数据（每格 [种类, 走向角字节]）与原点。 */
export function pavingGrid(plans: readonly Pick<RoadPlan, 'road' | 'pts' | 'hw' | 'pavL' | 'pavR'>[]): { minX: number; minY: number; cols: number; rows: number; data: Uint8Array } | null {
  const segs: number[] = [];
  for (const p of plans) {
    const kind = pavingKindOf(p.road);
    if (!kind) continue;
    const pav = Math.max(...p.pavL, ...p.pavR, 0) / 10;
    const reach = p.hw / 10 + pav + PAVE_EXTRA_M;
    for (let i = 2; i < p.pts.length; i += 2) segs.push(p.pts[i - 2]! / 10, p.pts[i - 1]! / 10, p.pts[i]! / 10, p.pts[i + 1]! / 10, reach, kind);
  }
  if (!segs.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < segs.length; k += 6) {
    const r = segs[k + 4]!;
    x0 = Math.min(x0, segs[k]! - r, segs[k + 2]! - r);
    y0 = Math.min(y0, segs[k + 1]! - r, segs[k + 3]! - r);
    x1 = Math.max(x1, segs[k]! + r, segs[k + 2]! + r);
    y1 = Math.max(y1, segs[k + 1]! + r, segs[k + 3]! + r);
  }
  const C = PAVE_CELL_M;
  const minX = Math.floor(x0 / C) * C;
  const minY = Math.floor(y0 / C) * C;
  const cols = Math.ceil((x1 - minX) / C) + 1;
  const rows = Math.ceil((y1 - minY) / C) + 1;
  const data = new Uint8Array(cols * rows * 2);
  const best = new Float32Array(cols * rows).fill(Infinity);
  for (let k = 0; k < segs.length; k += 6) {
    const ax = segs[k]!;
    const ay = segs[k + 1]!;
    const bx = segs[k + 2]!;
    const by = segs[k + 3]!;
    const r = segs[k + 4]!;
    const kind = segs[k + 5]!;
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 <= 0) continue;
    let ang = Math.atan2(dy, dx);
    if (ang < 0) ang += Math.PI;
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - minX) / C));
    const gx1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + r - minX) / C));
    const gy0 = Math.max(0, Math.floor((Math.min(ay, by) - r - minY) / C));
    const gy1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + r - minY) / C));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = minX + (gx + 0.5) * C;
        const py = minY + (gy + 0.5) * C;
        const t = Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / l2, 0), 1);
        const d = Math.hypot(px - ax - dx * t, py - ay - dy * t);
        const i = gy * cols + gx;
        if (d > r || d >= best[i]!) continue;
        best[i] = d;
        data[i * 2] = kind;
        data[i * 2 + 1] = Math.round((ang / Math.PI) * 255);
      }
    }
  }
  return { minX, minY, cols, rows, data };
}

/** 摊好铺地种类场并换上 uniform（buildStreets 调一次）。 */
export function setPavingField(plans: readonly RoadPlan[]): void {
  const g = pavingGrid(plans);
  const U = PAVING_UNIFORMS;
  if (!g) {
    U.uPaveRows.value = 0;
    registerTextureBytes('streets:paving', 0);
    return;
  }
  const t = new DataTexture(g.data, g.cols, g.rows, RGFormat, UnsignedByteType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  U.uPaveGrid.value.dispose();
  U.uPaveGrid.value = t;
  U.uPaveRect.value.set(g.minX, g.minY, PAVE_CELL_M, g.cols);
  U.uPaveRows.value = g.rows;
  registerTextureBytes('streets:paving', g.data.byteLength);
}

/** GLSL：铺地种类与走向（sim = 模拟米）：返回 vec2(种类, 走向角 rad)。 */
export const GLSL_PAVE_FIELD = /* glsl */ `
uniform sampler2D uPaveGrid;
uniform vec4 uPaveRect;
uniform float uPaveRows;
vec2 paveKindAt(vec2 sim) {
if (uPaveRows < 0.5) return vec2(0.0);
vec2 g = (sim - uPaveRect.xy) / uPaveRect.z;
if (g.x < 0.0 || g.y < 0.0 || g.x >= uPaveRect.w || g.y >= uPaveRows) return vec2(0.0);
vec2 v = texelFetch(uPaveGrid, ivec2(floor(g)), 0).rg * 255.0;
return vec2(floor(v.x + 0.5), v.y / 255.0 * 3.14159265);
}
`;
