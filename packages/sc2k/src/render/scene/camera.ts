// ===== render/scene/camera.ts =====（spec:ui-art §3.1 "(ox, oy) 使 centerX/centerY 落在画布中心"、ARCHITECTURE §6.5 可见带区间）
// 相机 = 整数偏移 (camX, camY)：屏幕像素 = 地图像素 + 相机偏移（RendererApi.screenOf / pick 的同一偏移）。
// centerX / centerY 是连续世界坐标（角点空间：整数 = 地块 c00 角，(x+0.5, y+0.5) = 地块中心），旋转时同一世界点保持在视口中心。
import type { TileLayers } from '../../contracts/state';
import { MAP, MAX_ALT, tileIndex } from '../../contracts/grid';
import { bandOf } from '../../contracts/render';
import { pointToScreen, screenToPoint } from './projection';
import type { Projection } from './projection';

export interface Camera { camX: number; camY: number }
export const BAND_COUNT = 16;
export const BAND_DEPTHS = 16;

export const clampCenter = (v: number): number => Math.max(0, Math.min(MAP, v));
/** 中心点所在地块的海拔（越界夹到地图内）。 */
export function centerHeight(layers: Pick<TileLayers, 'alt'>, centerX: number, centerY: number): number {
  const x = Math.max(0, Math.min(MAP - 1, Math.floor(centerX))), y = Math.max(0, Math.min(MAP - 1, Math.floor(centerY)));
  return layers.alt[tileIndex(x, y)] ?? 0;
}
/** 让世界点 (centerX, centerY)@h 落在 viewport 中心的整数相机偏移。 */
export function cameraFor(p: Projection, centerX: number, centerY: number, h: number, viewportW: number, viewportH: number): Camera {
  const [sx, sy] = pointToScreen(p, centerX, centerY, h);
  return { camX: Math.round(viewportW / 2 - sx), camY: Math.round(viewportH / 2 - sy) };
}
/** cameraFor 的逆：由相机偏移反推视口中心对应的世界点（海拔 h 平面）。 */
export function centerOfCamera(p: Projection, cam: Camera, h: number, viewportW: number, viewportH: number): [number, number] {
  return screenToPoint(p, viewportW / 2 - cam.camX, viewportH / 2 - cam.camY, h);
}
/** 拖动平移：屏幕像素位移 (dxPx, dyPx)（内容随手指移动）→ 新中心。 */
export function panCenter(p: Projection, centerX: number, centerY: number, dxPx: number, dyPx: number, h: number): [number, number] {
  const [sx, sy] = pointToScreen(p, centerX, centerY, h);
  const [nx, ny] = screenToPoint(p, sx - dxPx, sy - dyPx, h);
  return [clampCenter(nx), clampCenter(ny)];
}

/** 深度带 b 在屏幕上的 y 区间（含相机）：顶 = 最浅深度顶点抬到 MAX_ALT 再减去最高精灵；底 = 最深深度底顶点加岩壁（最多 MAX_ALT 级）。 */
export function bandScreenRange(p: Projection, b: number, cam: Camera, maxSpriteH = 0): [number, number] {
  const half = p.S / 2;
  const d0 = b * BAND_DEPTHS, d1 = Math.min(2 * (MAP - 1), d0 + BAND_DEPTHS - 1);
  const top = p.oy + d0 * half - MAX_ALT * p.level - maxSpriteH + cam.camY;
  const bottom = p.oy + d1 * half + p.tileH + MAX_ALT * p.level + cam.camY;
  return [top, bottom];
}
/** 与 [0, viewportH] 相交的带区间 [b0, b1]（含）；全部不可见返回 null。 */
export function visibleBands(p: Projection, cam: Camera, viewportH: number, maxSpriteH = 0): [number, number] | null {
  let b0 = -1, b1 = -1;
  for (let b = 0; b < BAND_COUNT; b++) {
    const [top, bottom] = bandScreenRange(p, b, cam, maxSpriteH);
    if (bottom < 0 || top > viewportH) continue;
    if (b0 < 0) b0 = b;
    b1 = b;
  }
  return b0 < 0 ? null : [b0, b1];
}
/** 深度 → 带（re-export 便于 camera 调用方不再 import contracts）。 */
export const bandOfDepth = bandOf;
