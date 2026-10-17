// ===== render/scene/picking.ts =====（spec:ui-art §3.1 拾取、ARCHITECTURE §6.3）
// 屏幕（地图像素，未含相机）→ 地块：只按地面（高楼上半部不命中）。
// 做法：候选深度带从前到后（d 降序）、同深度先 rx 大者——与画家序一致，因此命中的是"实际画在最上面"的那块地面；
// 每个候选做带海拔的四边形点内测试。等价于规格的"31→0 级逆投影 + 四边形测试"，且对朝向观者的陡坡（前格盖住后格）也给出正确答案。
import type { RenderSnapshot } from '../../contracts/render';
import { MAP, MAX_ALT, tileIndex } from '../../contracts/grid';
import { unrotateTile } from '../../contracts/rotation';
import { pointInQuad, projectionOf, rotatedToScreen, tileQuad } from './projection';
import type { Projection } from './projection';
import { pickSurfaceOf } from './tileInfo';
import { rotateTile } from '../../contracts/rotation';
import { tileX, tileY } from '../../contracts/grid';

/** 拾取用的格表面（base 海拔 + 旋转后角位）；picking.test 的往返用例以 base 为 worldToScreen 的 h。 */
export function pickSurface(snap: Pick<RenderSnapshot, 'layers' | 'view'>, i: number): { base: number; bits: number } {
  const L = snap.layers;
  return pickSurfaceOf(L.xter[i]!, L.alt[i]!, L.waterLevel[i]!, snap.view.rotation);
}

/**
 * 地块表面中心的地图像素：平地 = worldToScreen(t, base) + [0, tileH/2]（契约口径）；
 * 坡面取竖直中线上 c00' / c11' 两角高度的均值上移（三角高坡的四边形非凸，四角重心会落在格外，中线均值恒在格内）。Centering / 往返测试共用。
 */
export function tileCenter(snap: Pick<RenderSnapshot, 'layers' | 'view'>, i: number): [number, number] {
  const p = projectionOf(snap);
  const { base, bits } = pickSurface(snap, i);
  const [rx, ry] = rotateTile(tileX(i), tileY(i), p.rot);
  const [sx, sy] = rotatedToScreen(p, rx, ry, base);
  const axis = ((bits >> 3) & 1) + (bits & 1);
  return [sx, sy + p.tileH / 2 - (p.level * axis) / 2];
}

/** 投影常量已知时的拾取（RendererApi.pick 热路径用）。 */
export function pickP(p: Projection, snap: Pick<RenderSnapshot, 'layers'>, px: number, py: number): number | null {
  const L = snap.layers;
  const half = p.S / 2;
  const fx = (px - p.ox) / p.S;                                  // rx − ry 的连续值（与海拔无关）
  const fy = (py - p.oy) / half;                                 // 海拔 0 平面上 rx + ry 的连续值
  // 菱形底顶点在 (d+2)·S/2，顶点最高抬 (MAX_ALT+1) 级：d ∈ [fy − 2, fy + (MAX_ALT+1)·level/half]
  const dMin = Math.max(0, Math.floor(fy - 2));
  const dMax = Math.min(2 * (MAP - 1), Math.ceil(fy + ((MAX_ALT + 1) * p.level) / half));
  const kLo = Math.floor(fx) - 1, kHi = Math.ceil(fx) + 1;       // 菱形半宽 S：|fx − (rx−ry)| ≤ 1
  for (let d = dMax; d >= dMin; d--) {
    for (let k = kHi; k >= kLo; k--) {
      if (((d + k) & 1) !== 0) continue;                         // rx = (d+k)/2 必须为整数
      const rx = (d + k) >> 1, ry = (d - k) >> 1;
      if (rx < 0 || ry < 0 || rx >= MAP || ry >= MAP) continue;
      const [x, y] = unrotateTile(rx, ry, p.rot);
      const i = tileIndex(x, y);
      // 快速排除：只用 alt / waterLevel 的 y 包围盒（表面最高 max(alt, wl)+1，最低 alt）
      const alt = L.alt[i]!, wl = L.waterLevel[i]!;
      const rowY = p.oy + d * half;
      if (py < rowY - (Math.max(alt, wl) + 1) * p.level || py > rowY + p.tileH - alt * p.level) continue;
      const s = pickSurfaceOf(L.xter[i]!, alt, wl, p.rot);
      if (pointInQuad(tileQuad(p, rx, ry, s.base, s.bits), px, py)) return i;
    }
  }
  return null;
}

/** SceneCompiler.pick：地图像素 → 地块索引；未命中返回 null。 */
export function pick(snap: Pick<RenderSnapshot, 'layers' | 'view'>, px: number, py: number): number | null {
  return pickP(projectionOf(snap), snap, px, py);
}
