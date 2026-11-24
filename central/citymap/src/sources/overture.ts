/**
 * Overture GeoParquet 读取：hyparquet 按 GeoParquet 'geo' 元数据把 WKB 解成 GeoJSON。
 * 这里只声明管线用到的字段；类型是对快照内容的约定，读入时不做深度校验。
 */
import { parquetReadObjects } from 'hyparquet';

export type Position = number[];
export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }
  | { type: 'GeometryCollection'; geometries: Geometry[] };

export interface OvtNames {
  primary?: string | null;
  /** 语言 → 名称，如 { zh: '德輔道中', en: 'Des Voeux Road Central' }。 */
  common?: Record<string, string> | null;
}

export interface OvtSourceRow {
  dataset?: string | null;
  license?: string | null;
}

export interface OvtFeature {
  id: string;
  geometry: Geometry;
  subtype?: string | null;
  class?: string | null;
  names?: OvtNames | null;
  sources?: OvtSourceRow[] | null;
}

export interface OvtBuilding extends OvtFeature {
  height?: number | null;
  num_floors?: number | null;
  is_underground?: boolean | null;
}

/** 线性参考区间 [起, 止]（0–1，沿几何长度）；null 表示整段。 */
export type Between = number[] | null | undefined;

export interface OvtWhen {
  heading?: string | null;
  during?: string | null;
  using?: string[] | null;
  recognized?: string[] | null;
  mode?: string[] | null;
  vehicle?: unknown[] | null;
}

export interface OvtSegment extends OvtFeature {
  road_flags?: { values?: string[] | null; between?: Between }[] | null;
  level_rules?: { value?: number | null; between?: Between }[] | null;
  access_restrictions?: { access_type?: string | null; when?: OvtWhen | null; between?: Between }[] | null;
  speed_limits?: {
    max_speed?: { value?: number | null; unit?: string | null } | null;
    when?: OvtWhen | null;
    between?: Between;
  }[] | null;
}

export interface OvertureSnapshot {
  buildings: OvtBuilding[];
  segments: OvtSegment[];
  infrastructure: OvtFeature[];
  landUse: OvtFeature[];
  water: OvtFeature[];
  land: OvtFeature[];
}

const COMMON = ['id', 'geometry', 'subtype', 'class', 'names', 'sources'];

/** 各图层文件名与需要的列。connector 只做快照校验，M0 不读（车道图在 M3）。 */
const LAYERS = {
  buildings: { file: 'building.parquet', columns: [...COMMON, 'height', 'num_floors', 'is_underground'] },
  segments: {
    file: 'segment.parquet',
    columns: [...COMMON, 'road_flags', 'level_rules', 'access_restrictions', 'speed_limits'],
  },
  infrastructure: { file: 'infrastructure.parquet', columns: COMMON },
  landUse: { file: 'land_use.parquet', columns: COMMON },
  water: { file: 'water.parquet', columns: COMMON },
  land: { file: 'land.parquet', columns: COMMON },
} as const;

async function readRows<T>(bytes: Uint8Array, columns: readonly string[]): Promise<T[]> {
  const file = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const rows = await parquetReadObjects({ file, columns: [...columns] });
  return rows as T[];
}

/** 从已校验的文件字节读出快照（文件名 → 内容）。 */
export async function readOverture(files: ReadonlyMap<string, Uint8Array>): Promise<OvertureSnapshot> {
  const get = (name: string): Uint8Array => {
    const b = files.get(name);
    if (!b) throw new Error(`快照缺少 ${name}`);
    return b;
  };
  const [buildings, segments, infrastructure, landUse, water, land] = await Promise.all([
    readRows<OvtBuilding>(get(LAYERS.buildings.file), LAYERS.buildings.columns),
    readRows<OvtSegment>(get(LAYERS.segments.file), LAYERS.segments.columns),
    readRows<OvtFeature>(get(LAYERS.infrastructure.file), LAYERS.infrastructure.columns),
    readRows<OvtFeature>(get(LAYERS.landUse.file), LAYERS.landUse.columns),
    readRows<OvtFeature>(get(LAYERS.water.file), LAYERS.water.columns),
    readRows<OvtFeature>(get(LAYERS.land.file), LAYERS.land.columns),
  ]);
  return { buildings, segments, infrastructure, landUse, water, land };
}

/** Polygon / MultiPolygon → 多边形列表（每块为环列表，环为 GeoJSON 坐标串）。其他类型返回空。 */
export function polygonsOf(g: Geometry): Position[][][] {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(polygonsOf);
  return [];
}

/** LineString / MultiLineString → 折线列表。 */
export function linesOf(g: Geometry): Position[][] {
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(linesOf);
  return [];
}

/** 原始主名称（只用于匹配，绝不输出）。 */
export function rawName(f: OvtFeature): string {
  return f.names?.primary ?? '';
}
