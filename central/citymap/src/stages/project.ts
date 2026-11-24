/**
 * 01-project：WGS84 → HK1980 Grid（EPSG:2326）→ 减本地原点 → 整数分米。
 * 全管线只有这里做投影；其他阶段只碰本地 dm。
 */
import proj4 from 'proj4';
import { ORIGIN, type LonLatRect } from '../config';
import type { Rect } from '../geo/polyline';

/**
 * EPSG:2326 定义（七参数 towgs84，Position Vector 约定）。
 * 基准点 (114.1594, 22.2810) → (834467.1, 815791.9)，与 pyproj 相差 < 0.1 m（见 project.test.ts）。
 * 旋转参数取 EPSG 原始符号即通过，无需翻转。
 */
export const EPSG_2326 =
  '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 ' +
  '+ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs';

const converter = proj4('EPSG:4326', EPSG_2326);

/** WGS84 → HK1980 Grid 东/北坐标（米，浮点）。 */
export function toGrid(lon: number, lat: number): [number, number] {
  const [e, n] = converter.forward([lon, lat]) as [number, number];
  return [e, n];
}

/** HK1980 Grid（米）→ 本地整数 dm。LandsD 等原生 EPSG:2326 数据直接用它。 */
export function gridToLocal(e: number, n: number): [number, number] {
  return [Math.round((e - ORIGIN.e) * 10), Math.round((n - ORIGIN.n) * 10)];
}

/** WGS84 → 本地整数 dm（x 东，y 北）。 */
export function project(lon: number, lat: number): [number, number] {
  const [e, n] = toGrid(lon, lat);
  return gridToLocal(e, n);
}

/** 本地 dm → WGS84（用于测试与调试，不进产物）。 */
export function unproject(x: number, y: number): [number, number] {
  const [lon, lat] = converter.inverse([ORIGIN.e + x / 10, ORIGIN.n + y / 10]) as [number, number];
  return [lon, lat];
}

/** 经纬度矩形投影后的外包矩形（dm，向外取整）。沿四边密采样，兼顾投影后边线的微小弯曲。 */
export function projectRectBounds(r: LonLatRect): Rect {
  const STEPS = 64;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const lon = r.west + t * (r.east - r.west);
    const lat = r.south + t * (r.north - r.south);
    for (const [ln, lt] of [[lon, r.south], [lon, r.north], [r.west, lat], [r.east, lat]] as const) {
      const [e, n] = toGrid(ln, lt);
      const x = (e - ORIGIN.e) * 10;
      const y = (n - ORIGIN.n) * 10;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [Math.floor(minX), Math.floor(minY), Math.ceil(maxX), Math.ceil(maxY)];
}

/** 把 GeoJSON 坐标串 [[lon, lat], ...] 投影成扁平 dm 数组。 */
export function projectCoords(coords: readonly (readonly number[])[]): number[] {
  const out: number[] = [];
  for (const c of coords) {
    const [x, y] = project(c[0]!, c[1]!);
    out.push(x, y);
  }
  return out;
}
