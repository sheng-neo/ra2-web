/**
 * 02-buildings：任意来源的原始楼体 → Building[]。
 * 来源藏在 BuildingSource 后面（LandsD 或 Overture，整层二选一，绝不逐栋混合）。
 * 楼底：源数据给了就用源数据；否则取轮廓最低顶点处的地形高程（没有地形时为 0）。
 */
import type { Building, BuildingKind, HeightSource, Ring, SourceRef } from '@central/data';
import { lowestGround, type GroundFn } from '../geo/ground';
import { hashU32, shortId } from '../geo/hash';
import { inRect, type Rect } from '../geo/polyline';
import { dedupeRing, orientRing, ringArea, ringCentroid, simplifyRing } from '../geo/ring';

/** 来源无关的原始楼体。坐标已投影到本地 dm。 */
export interface RawBuilding {
  /** 源数据 ID（未哈希），用于生成稳定短 ID 与启发式种子。 */
  rawId: string;
  /** 多边形列表；每块为 [外环, ...洞]，扁平 dm，绕向任意，可含首尾闭合点。 */
  polygons: number[][][];
  /** 源数据给出的总高（米）。 */
  heightM?: number;
  /** heightM 的来源。 */
  heightFrom?: Extract<HeightSource, 'tag' | 'landsd'>;
  /** 源数据给出的楼底高程（dm，mPD）；缺失时按地形取。 */
  base?: number;
  /** 源数据直接给出的类别（如 LandsD 的 BuildingBlockType）；缺失时由 kindOf 推断。 */
  kind?: BuildingKind;
  floors?: number;
  subtype?: string;
  cls?: string;
  /** 该楼对应的署名（汇总进 meta.sources）。 */
  ref: SourceRef;
}

export interface BuildingSource {
  /** 写进 Building.src 的短前缀，如 'ovt'。 */
  readonly src: string;
  load(): Promise<RawBuilding[]>;
}

/** 面积阈值：4 m² = 400 dm²。 */
const MIN_AREA_DM2 = 400;
/** 简化容差 0.3 m。 */
const SIMPLIFY_DM = 3;
const FLOOR_M = 3.2;
const GROUND_EXTRA_M = 1.3;
/** 最矮 2.5 m，避免零高或负高。 */
const MIN_HEIGHT_DM = 25;

const CIVIC = new Set(['civic', 'religious', 'education', 'medical', 'entertainment', 'military']);
const INDUSTRIAL = new Set(['industrial', 'service', 'transportation', 'agricultural', 'outbuilding']);
const HOUSE_CLASSES = new Set(['house', 'terrace', 'detached', 'semidetached_house', 'bungalow']);
const SHED_CLASSES = new Set(['roof', 'shelter', 'garage', 'kiosk', 'toilets', 'carport']);

/** 楼层启发式区间 [min, max]，按面积（m²）分档；数据里有层数的楼的 p25–p75 校准而来。 */
const FLOOR_BANDS: Record<'res' | 'gen', [maxArea: number, lo: number, hi: number][]> = {
  res: [[60, 5, 7], [150, 6, 20], [400, 10, 32], [1000, 20, 40], [Infinity, 4, 30]],
  gen: [[60, 1, 5], [150, 4, 17], [400, 7, 23], [1000, 4, 26], [3000, 4, 40], [Infinity, 2, 8]],
};

/** 没有高度数据时的确定性估计（米）。 */
export function heuristicHeightM(raw: RawBuilding, areaM2: number): number {
  const h = hashU32(raw.rawId, 'floors');
  if ((raw.cls && SHED_CLASSES.has(raw.cls)) || raw.subtype === 'outbuilding') return 3 + (h % 3);
  if (raw.subtype && (CIVIC.has(raw.subtype) || INDUSTRIAL.has(raw.subtype))) {
    const [lo, hi] = areaM2 < 400 ? [1, 4] : [2, 6];
    return (lo + (h % (hi - lo + 1))) * FLOOR_M + GROUND_EXTRA_M;
  }
  const bands = FLOOR_BANDS[raw.subtype === 'residential' ? 'res' : 'gen'];
  const [, lo, hi] = bands.find(([maxArea]) => areaM2 < maxArea)!;
  return (lo + (h % (hi - lo + 1))) * FLOOR_M + GROUND_EXTRA_M;
}

/** 高度优先级：源数据高度 → 层数 × 3.2 m + 1.3 m → 启发式。地标表在 landmarks 阶段整体替换。 */
export function resolveHeight(raw: RawBuilding, areaM2: number): { m: number; source: HeightSource } {
  if (raw.heightM !== undefined && raw.heightM > 0) return { m: raw.heightM, source: raw.heightFrom ?? 'tag' };
  if (raw.floors !== undefined && raw.floors > 0) return { m: raw.floors * FLOOR_M + GROUND_EXTRA_M, source: 'levels' };
  return { m: heuristicHeightM(raw, areaM2), source: 'heuristic' };
}

export function kindOf(subtype: string | undefined, cls: string | undefined, heightM: number, areaM2: number): BuildingKind {
  if (subtype && CIVIC.has(subtype)) return 'civic';
  if (subtype && INDUSTRIAL.has(subtype)) return 'industrial';
  if (heightM >= 35) return 'tower';
  if ((cls && HOUSE_CLASSES.has(cls)) || (subtype === 'residential' && heightM < 15)) return 'house';
  if (areaM2 >= 800) return 'podium';
  return 'other';
}

/** 单个环：去重 → 简化 → 再去重；不足 3 点返回 null。 */
function cleanRing(r: readonly number[]): number[] | null {
  const d = dedupeRing(r);
  if (d.length < 6) return null;
  const s = dedupeRing(simplifyRing(d, SIMPLIFY_DM));
  return s.length >= 6 ? s : null;
}

/** 清理一块多边形：外环 CCW、洞 CW，丢掉 < 4 m² 的外环和洞。 */
export function cleanPolygon(rings: readonly number[][]): Ring | null {
  const [outerRaw, ...holesRaw] = rings;
  if (!outerRaw) return null;
  const outer = cleanRing(outerRaw);
  if (!outer || ringArea(outer) < MIN_AREA_DM2) return null;
  const holes: number[][] = [];
  for (const h of holesRaw) {
    const c = cleanRing(h);
    if (c && ringArea(c) >= MIN_AREA_DM2) holes.push(orientRing(c, false));
  }
  const ring: Ring = { outer: orientRing(outer, true) };
  if (holes.length > 0) ring.holes = holes;
  return ring;
}

export interface BuildingsResult {
  buildings: Building[];
  /** 实际用到的署名。 */
  refs: SourceRef[];
}

/** 原始楼体 → Building[]（质心在 extent 内，按 id 排序）。ground 用来给没有楼底高程的楼定楼底。 */
export function buildBuildings(
  raws: readonly RawBuilding[],
  src: string,
  extent: Rect,
  ground: GroundFn = () => 0,
): BuildingsResult {
  const out: Building[] = [];
  const refs = new Map<string, SourceRef>();
  for (const raw of raws) {
    raw.polygons.forEach((rings, k) => {
      const footprint = cleanPolygon(rings);
      if (!footprint) return;
      const [cx, cy] = ringCentroid(footprint.outer);
      if (!inRect(cx, cy, extent)) return;
      const areaM2 = ringArea(footprint.outer) / 100;
      const { m, source } = resolveHeight(raw, areaM2);
      const key = k === 0 ? raw.rawId : `${raw.rawId}#${k}`;
      out.push({
        id: shortId(`${src}:${key}`),
        src,
        footprint,
        base: raw.base ?? lowestGround(footprint.outer, ground),
        height: Math.max(MIN_HEIGHT_DM, Math.round(m * 10)),
        heightSource: source,
        kind: raw.kind ?? kindOf(raw.subtype, raw.cls, m, areaM2),
        style: hashU32(key, 'style') & 255,
      });
      refs.set(raw.ref.id, raw.ref);
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.id === out[i - 1]!.id) throw new Error(`建筑 ID 碰撞：${out[i]!.id}`);
  }
  return { buildings: out, refs: [...refs.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
