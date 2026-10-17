// ===== render/scene/projection.ts =====（spec:ui-art §3.1 / §3.2.1、contracts/render.ts 的 mapOrigin / 顶点与锚点约定）
// 2:1 等轴投影的纯函数：旋转后地块 (rx,ry) 在海拔 h 的顶点 c00' = [ox + (rx−ry)·S, oy + (rx+ry)·S/2 − h·LEVEL]；
// SceneItem.x/y = c00' + [0, tileH]（底顶点 c11'）；地块中心 = c00' + [0, tileH/2]。地图像素系原点 mapOrigin(zoom)，不含相机。
import type { ArtScale, RenderSnapshot, ZoomLevel } from '../../contracts/render';
import { ZOOM_TABLE, mapCanvasSize, mapOrigin } from '../../contracts/render';
import type { Rotation } from '../../contracts/rotation';
import { rotateCorner, rotateTile, unrotateTile } from '../../contracts/rotation';

export { ZOOM_TABLE, mapOrigin, mapCanvasSize };

/** 一档投影的全部常量（由 view.zoom / view.rotation 派生；compileTile / pick / camera 共用，避免每格重查表）。 */
export interface Projection {
  zoom: ZoomLevel; rot: Rotation;
  tileW: number; tileH: number; S: number /*tileW/2*/; level: number /*levelPx*/;
  ox: number; oy: number;
}

export const zoomRow = (z: ZoomLevel) => ZOOM_TABLE[z];

/** ArtScale → ZoomLevel 下标（'XS' 0 … 'XL' 4）。 */
export function zoomOfScale(scale: ArtScale): ZoomLevel {
  for (let z = 0; z < ZOOM_TABLE.length; z++) if (ZOOM_TABLE[z]!.scale === scale) return z as ZoomLevel;
  return 2;
}

export function projectionFor(zoom: ZoomLevel, rot: Rotation): Projection {
  const row = ZOOM_TABLE[zoom];
  const o = mapOrigin(zoom);
  return { zoom, rot, tileW: row.tileW, tileH: row.tileH, S: row.tileW / 2, level: row.levelPx, ox: o.x, oy: o.y };
}
export const projectionOf = (snap: Pick<RenderSnapshot, 'view'>): Projection => projectionFor(snap.view.zoom, snap.view.rotation);

/** 旋转后地块坐标 → 顶点 c00'（地图像素）。 */
export const rotatedToScreen = (p: Projection, rx: number, ry: number, h: number): [number, number] =>
  [p.ox + (rx - ry) * p.S, p.oy + ((rx + ry) * p.S) / 2 - h * p.level];

/** SceneCompiler.worldToScreen：世界地块 (x,y)（整数）在海拔 h 的旋转后顶点 c00'。 */
export function worldToScreen(snap: Pick<RenderSnapshot, 'view'>, x: number, y: number, h: number): [number, number] {
  const p = projectionOf(snap);
  const [rx, ry] = rotateTile(x, y, p.rot);
  return rotatedToScreen(p, rx, ry, h);
}

/**
 * 连续坐标（角点空间：整数 = 地块 c00 角、(x+0.5, y+0.5) = 地块中心）→ 地图像素。
 * 与 worldToScreen 的区别：整数输入等价，分数输入用角点变换 (X,Y)→(Y,128−X) 保持连续，相机平移 / 旋转时不会跳格。
 */
export function pointToScreen(p: Projection, X: number, Y: number, h: number): [number, number] {
  const [rx, ry] = rotateCorner(X, Y, p.rot);
  return rotatedToScreen(p, rx, ry, h);
}

/** 地图像素 → 海拔 h 平面上的旋转后连续坐标（角点空间）。rotatedToScreen 的逆。 */
export function screenToRotated(p: Projection, px: number, py: number, h: number): [number, number] {
  const fx = (px - p.ox) / p.S;
  const fy = (py + h * p.level - p.oy) / (p.S / 2);
  return [(fx + fy) / 2, (fy - fx) / 2];
}

/** 地图像素 → 海拔 h 平面上的世界连续坐标（角点空间）；pointToScreen 的逆。 */
export function screenToPoint(p: Projection, px: number, py: number, h: number): [number, number] {
  const [rx, ry] = screenToRotated(p, px, py, h);
  // rotateCorner 的逆：(a,b) ← (128 − b, a)，应用 rot 次
  let X = rx, Y = ry;
  for (let k = 0; k < p.rot; k++) { const t = X; X = 128 - Y; Y = t; }
  return [X, Y];
}

/** 地图像素 → 海拔 h 平面上的整数世界地块（不做四边形测试，越界返回 null）；pick 的平面近似，camera 用。 */
export function screenToTile(p: Projection, px: number, py: number, h: number): [number, number] | null {
  const [frx, fry] = screenToRotated(p, px, py, h);
  const rx = Math.floor(frx), ry = Math.floor(fry);
  if (rx < 0 || ry < 0 || rx > 127 || ry > 127) return null;
  return unrotateTile(rx, ry, p.rot);
}

/** 地块菱形在屏幕上的四个顶点（旋转后命名 c00' 上、c10' 右、c11' 下、c01' 左），各自带海拔。 */
export interface ScreenQuad { x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }

/**
 * 地块四边形：base 为基准海拔，bits 为旋转后角位（SLOPE_CORNERS 编码：bit3 = c00'，bit2 = c10'，bit1 = c01'，bit0 = c11'），置位的角抬高 1 级。
 */
export function tileQuad(p: Projection, rx: number, ry: number, base: number, bits: number): ScreenQuad {
  const [sx, sy] = rotatedToScreen(p, rx, ry, base);
  const L = p.level;
  return {
    x0: sx, y0: sy - ((bits >> 3) & 1) * L,                    // c00' 上
    x1: sx + p.S, y1: sy + p.S / 2 - ((bits >> 2) & 1) * L,    // c10' 右
    x2: sx, y2: sy + p.tileH - (bits & 1) * L,                 // c11' 下
    x3: sx - p.S, y3: sy + p.S / 2 - ((bits >> 1) & 1) * L,    // c01' 左
  };
}

/** 点在四边形内（射线法；边上的点不保证，picking.test 不对顶点 / 共享边作断言）。 */
export function pointInQuad(q: ScreenQuad, px: number, py: number): boolean {
  const xs = [q.x0, q.x1, q.x2, q.x3], ys = [q.y0, q.y1, q.y2, q.y3];
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = xs[i]!, yi = ys[i]!, xj = xs[j]!, yj = ys[j]!;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
