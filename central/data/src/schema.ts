/**
 * city.json / terrain.bin 数据契约 —— 离线管线（@central/citymap）写，客户端（@central/client）读。
 *
 * 坐标约定（全项目唯一真相，改动须同步管线、客户端与测试）：
 * - 投影：WGS84 → HK1980 Grid（EPSG:2326），再减去本地原点 CityMeta.origin。
 * - 单位：整数分米（dm）。x = 东，y = 北，z = 高程（香港主水平基准 mPD，单位同为 dm）。
 * - 平面坐标数组一律扁平：[x0, y0, x1, y1, ...]。
 * - 多边形外环逆时针（CCW，从上往下看），内环（洞）顺时针；首尾点不重复。
 * - three.js 侧的换算 (x, y, z)sim → (x, z, −y)three 只允许写在客户端一个函数里。
 */

export const CITY_FORMAT = 'central-city' as const;
export const CITY_FORMAT_VERSION = 1 as const;

/** 扁平平面坐标 [x0, y0, x1, y1, ...]，整数分米。 */
export type FlatXY = number[];

export interface Ring {
  /** 外环，CCW。 */
  outer: FlatXY;
  /** 洞，CW。省略表示无洞。 */
  holes?: FlatXY[];
}

export interface SourceRef {
  /** 数据集标识，如 'overture-2026-11-18.0/buildings'、'landsd-dtm-5m'。 */
  id: string;
  /** 许可，如 'ODbL-1.0'、'CC-BY-4.0'、'CSDI-Terms'。 */
  license: string;
  /** 署名文本（原样显示在鸣谢页）。 */
  attribution: string;
  url?: string;
}

export interface CityMeta {
  /** 本地原点：HK1980 Grid 东/北坐标（米），以及对应的 WGS84 经纬度。 */
  origin: { e: number; n: number; lon: number; lat: number };
  crs: 'EPSG:2326';
  unit: 'dm';
  /** 数据覆盖范围（渲染范围），本地 dm：[minX, minY, maxX, maxY]。 */
  bbox: [number, number, number, number];
  sources: SourceRef[];
  /** 管线版本与全部输入快照 sha256 的组合摘要，用于判断产物是否过期。 */
  build: { pipelineVersion: string; inputsDigest: string };
}

export type BuildingKind = 'tower' | 'podium' | 'house' | 'civic' | 'industrial' | 'other';

export type HeightSource = 'landsd' | 'tag' | 'levels' | 'landmark' | 'heuristic';

export interface Building {
  /** 稳定 ID（源数据 ID 的短哈希），同一快照多次构建不变。 */
  id: string;
  /** 来源数据集，对应 CityMeta.sources[].id 的前缀，如 'ovt' | 'landsd'。 */
  src: string;
  footprint: Ring;
  /** 楼底高程（dm，mPD）。未知时为 0，客户端改用地形采样。 */
  base: number;
  /** 楼顶高程减楼底高程（dm），> 0。 */
  height: number;
  heightSource: HeightSource;
  kind: BuildingKind;
  /** 立面风格种子 0–255（窗格密度、色温、亮灯率等由客户端按种子决定）。 */
  style: number;
}

export type RoadClass =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'unclassified'
  | 'living_street'
  | 'service'
  | 'pedestrian'
  | 'footway'
  | 'steps'
  | 'path'
  | 'cycleway'
  | 'unknown';

export interface Road {
  id: string;
  cls: RoadClass;
  /** 中心线折线。 */
  pts: FlatXY;
  /** 0 = 双向；1 = 只能沿 pts 方向；-1 = 只能逆 pts 方向。 */
  oneway: 0 | 1 | -1;
  /** 车道总数（源数据没有时按道路等级给默认值）。行人类道路为 0。 */
  lanes: number;
  bridge?: true;
  tunnel?: true;
  /** OSM layer / Overture level，默认 0。 */
  level?: number;
  /** 限速 km/h（有数据时）。 */
  speedKmh?: number;
  /** 街道名是事实信息，可保留；商铺/企业名不得出现在任何字段里。 */
  name?: { zh?: string; en?: string };
}

export interface Rail {
  id: string;
  kind: 'tram' | 'funicular';
  pts: FlatXY;
}

export type SensitiveKind = 'military' | 'government';

export interface SensitiveZone {
  id: string;
  kind: SensitiveKind;
  area: Ring;
}

export interface Zones {
  /** 可玩区（MVP）。玩家、刷车点、任务点只能出现在这里面。 */
  playable: Ring[];
  /** 敏感区：只做背景，不可进入、不可交互、不触发风声。 */
  sensitive: SensitiveZone[];
}

export interface Props {
  signals: FlatXY;
  crossings: FlatXY;
  busStops: FlatXY;
  streetLamps: FlatXY;
  trees: FlatXY;
}

/** 代码建模的地标摆放参数。地标一律用虚构名，不出现真实楼名和 logo。 */
export interface LandmarkPlacement {
  /** 客户端 builder 的键，如 'harbour-spire'。 */
  id: string;
  name: { zh: string; en: string };
  /** 地标中心（dm）。 */
  x: number;
  y: number;
  /** 绕 z 轴旋转（弧度，从东向北为正）。 */
  rot: number;
  /** 楼底高程（dm，mPD）。 */
  base: number;
  /** 总高（dm）。 */
  height: number;
  /** 地标原轮廓（用于碰撞和白模兜底）。 */
  footprint: Ring;
  /** 被这座地标替换掉的建筑 ID（已从 buildings 中删除）。 */
  replaces: string[];
}

export interface CityFile {
  format: typeof CITY_FORMAT;
  version: typeof CITY_FORMAT_VERSION;
  meta: CityMeta;
  buildings: Building[];
  roads: Road[];
  rails: Rail[];
  /** 海面/水体多边形（海面高程 0 mPD）。 */
  water: Ring[];
  zones: Zones;
  props: Props;
  landmarks: LandmarkPlacement[];
}

/**
 * terrain.bin（小端）：
 *   0  char[4]  magic 'CTER'
 *   4  uint16   version = 1
 *   6  uint16   reserved = 0
 *   8  int32    x0  —— 网格左下角（西南）本地 x，dm
 *  12  int32    y0  —— 网格左下角本地 y，dm
 *  16  uint16   cell —— 网格间距，dm
 *  18  uint16   nx   —— 东向采样数
 *  20  uint16   ny   —— 北向采样数
 *  22  uint16   reserved = 0
 *  24  int16[nx*ny] 高程 dm（mPD），行优先：先 x 后 y（index = j*nx + i）
 * 海面及无数据处写 0。
 */
export const TERRAIN_MAGIC = 'CTER' as const;
export const TERRAIN_VERSION = 1 as const;
export const TERRAIN_HEADER_BYTES = 24 as const;

export interface TerrainGrid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  /** 高程 dm，长度 nx*ny。 */
  heights: Int16Array;
}
