/**
 * 地政总署 Building（data-raw/landsd/landsd-buildings.geojson.gz）→ 本地 dm 的楼底/楼顶高程与轮廓，
 * 以及“楼底高程 vs 地形”的对照统计（M2 验收：95% 楼基底与地形差 < 3 m）。
 * 源数据 EPSG:2326（米）、高程 mPD；快照里不含楼名字段。
 */
import { gunzipSync } from 'node:zlib';
import { sampleTerrain, type TerrainGrid } from '@central/data';
import { ringCentroid } from '../geo/ring';
import { gridToLocal } from './project';

export const LANDSD_BUILDINGS_FILE = 'landsd-buildings.geojson.gz';

/** 快照里用到的 GeoJSON 字段（FeatureServer f=geojson 原样）。 */
interface BuildingFeature {
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] } | null;
  properties: {
    BuildingCSUID: string;
    BuildingBlockType: string | null;
    BaseHeight: number | null;
    TopHeight: number | null;
    Storeys: number | null;
  };
}

export interface LandsdBuilding {
  /** BuildingCSUID（地政总署楼宇唯一 ID），作源 ID。 */
  id: string;
  /** 'Tower' | 'Podium' | 'Open-sided Structure' | 'Temporary Structure'。 */
  blockType: string;
  /** 楼底高程 dm（mPD），源数据缺失为 null（多为有盖结构、临时构筑物）。 */
  base: number | null;
  /** 楼顶高程 dm（mPD），缺失为 null。 */
  top: number | null;
  storeys: number | null;
  /** [外环, ...洞] 的列表，扁平本地 dm，含首尾闭合点（与 RawBuilding.polygons 同格式）。 */
  polygons: number[][][];
}

const toDm = (m: number | null): number | null => (m === null ? null : Math.round(m * 10));

function ringToLocal(ring: readonly number[][]): number[] {
  const out: number[] = [];
  for (const c of ring) out.push(...gridToLocal(c[0]!, c[1]!));
  return out;
}

/** GeoJSON FeatureCollection（EPSG:2326）→ LandsdBuilding[]，保持源顺序；无几何的要素跳过。 */
export function landsdBuildingsFromGeoJson(fc: { features: readonly BuildingFeature[] }): LandsdBuilding[] {
  const out: LandsdBuilding[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const p = f.properties;
    out.push({
      id: p.BuildingCSUID,
      blockType: p.BuildingBlockType ?? 'unknown',
      base: toDm(p.BaseHeight),
      top: toDm(p.TopHeight),
      storeys: p.Storeys,
      polygons: polys.map((poly) => poly.map(ringToLocal)),
    });
  }
  return out;
}

/** 从快照文件表（loadSnapshot(LANDSD_DIR).files）读出全部建筑。 */
export function readLandsdBuildings(files: ReadonlyMap<string, Uint8Array>): LandsdBuilding[] {
  const gz = files.get(LANDSD_BUILDINGS_FILE);
  if (!gz) throw new Error(`快照缺少 ${LANDSD_BUILDINGS_FILE}`);
  return landsdBuildingsFromGeoJson(JSON.parse(gunzipSync(gz).toString('utf8')) as { features: BuildingFeature[] });
}

/** 第一块多边形外环的面积质心（本地 dm）。 */
export function buildingCentroid(b: LandsdBuilding): [number, number] {
  return ringCentroid(b.polygons[0]![0]!);
}

export interface BaseResiduals {
  /** 参与统计的楼数（有楼底高程且质心落在网格内）。 */
  n: number;
  /** |地形(质心) − 楼底| 的中位数与 p90（dm）。 */
  medianAbsDm: number;
  p90AbsDm: number;
  /** 地形(质心) − 楼底 的中位数（dm），看系统偏差。 */
  medianDm: number;
  /** 差值 < 3 m 的比例。 */
  within3m: number;
}

/** 在每栋楼质心采样地形，与楼底高程比较。塔楼压在裙楼上、坡地楼会有大差值，属正常。 */
export function baseResiduals(grid: TerrainGrid, buildings: readonly LandsdBuilding[]): BaseResiduals {
  const d: number[] = [];
  const maxX = grid.x0 + (grid.nx - 1) * grid.cell;
  const maxY = grid.y0 + (grid.ny - 1) * grid.cell;
  for (const b of buildings) {
    if (b.base === null) continue;
    const [x, y] = buildingCentroid(b);
    if (x < grid.x0 || y < grid.y0 || x > maxX || y > maxY) continue;
    d.push(sampleTerrain(grid, x, y) - b.base);
  }
  const abs = d.map(Math.abs).sort((a, b) => a - b);
  const signed = [...d].sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] ?? 0;
  return {
    n: d.length,
    medianAbsDm: q(abs, 0.5),
    p90AbsDm: q(abs, 0.9),
    medianDm: q(signed, 0.5),
    within3m: d.length ? abs.filter((v) => v < 30).length / d.length : 0,
  };
}
