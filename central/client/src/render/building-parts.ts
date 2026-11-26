/**
 * LOD2 分层体块（Building.parts，细节一轮 R2）的客户端规划：纯函数，不碰 three。
 *
 * 数据约定见 @central/data schema：parts 按 top 升序，parts[0] 是底座（环 = footprint），
 * 其余每块立在「比它低的最高一层」上。这里把它们换成可挤出的棱柱：
 * - 底座的墙从楼脚（埋进地面）起，其余块的墙从下一层的顶起——不画藏在下层体块里的墙；
 * - 主体 main：面积 ≥ 底座 40 % 的最高一块。冠顶泛光只画在主体及以上的块（逐级退台的塔冠每级都亮）；
 * - 顶块 crest：面积 ≥ 底座 15 % 的最高一块（裙楼 + 塔楼同在一个 2D 轮廓时就是塔楼）。灯箱、边缘 LED、
 *   程序化屋顶机房放在它上面；顶块之上还有块（机房、桅杆）的楼不再加程序化屋顶机房，3D 数据里已经有了；
 * - 最高块 peak：航空障碍灯放这里；
 * - 顶块之上的小块（< 顶块面积 30 %、高 ≤ 8 m，或 < 4 m² 的桅杆）按屋顶机房立面画（深色百叶、无窗）；
 * - LOW 档三角形预算只给约 5k：按最高点从高到低挑楼，累计多出的三角形不超过预算，其余楼照旧画平顶。
 */
import type { Building, FlatXY } from '@central/data';
import { normalizeRing, signedArea } from '../geom/ring';

/** 一块棱柱（模拟坐标 dm）。 */
export interface PreparedPart {
  /** 在 Building.parts 里的序号（0 = 底座）。 */
  index: number;
  ring: { outer: FlatXY; holes: FlatXY[] };
  /** [外环, ...洞]，与 extrudePrism 的环序号一致。 */
  rings: FlatXY[];
  /** 墙底 / 顶（dm）。 */
  bottom: number;
  top: number;
  /** 面积（dm²，外环减洞）。 */
  area: number;
  /** 墙面去重（walls.planWallCuts）的楼体序号，由 prepareBuildings 填。 */
  body: number;
}

/** 块顶至少高出楼底（dm），与 buildings.ts 的最矮楼高一致。 */
const MIN_HEIGHT_DM = 25;
/** 主体：面积 ≥ 底座的这个比例。 */
const MAIN_SHARE = 0.4;
/** 顶块：面积 ≥ 底座的这个比例。 */
const CREST_SHARE = 0.15;
/** 机房块：面积 < 主体的这个比例、高 ≤ 8 m；或 < 4 m²。 */
const PLANT_SHARE = 0.3;
const PLANT_RISE_DM = 80;
const SPIRE_AREA_DM2 = 400;
/** LOW 档分层体块额外三角形预算。 */
export const LOW_PARTS_TRIANGLES = 4500;

function areaOf(r: { outer: FlatXY; holes: FlatXY[] }): number {
  return Math.abs(signedArea(r.outer)) - r.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
}

/**
 * Building.parts → 棱柱列表；没有 parts、不足两块或数据坏了时返回 null（照旧画平顶）。
 * footprint：已归一的底座环；bottom：底座墙底；base：楼底（立面 v = 0）；shift：part.top 的偏移（楼底来自地形采样时）。
 */
export function prepareParts(
  b: Pick<Building, 'parts'>,
  footprint: { outer: FlatXY; holes: FlatXY[] },
  bottom: number,
  base: number,
  shift = 0,
): PreparedPart[] | null {
  if (!b.parts || b.parts.length < 2) return null;
  const out: PreparedPart[] = [];
  const tops = [...new Set(b.parts.map((p) => Math.max(p.top + shift, base + MIN_HEIGHT_DM)))].sort((a, c) => a - c);
  b.parts.forEach((pt, index) => {
    const ring = index === 0 ? footprint : pt.ring ? normalizeRing({ outer: pt.ring, holes: pt.holes }) : null;
    if (!ring) return;
    const top = Math.max(pt.top + shift, base + MIN_HEIGHT_DM);
    const below = tops.filter((t) => t < top);
    const b0 = index === 0 ? bottom : below.length > 0 ? below[below.length - 1]! : bottom;
    if (top <= b0) return;
    out.push({ index, ring, rings: [ring.outer, ...ring.holes], bottom: b0, top, area: areaOf(ring), body: -1 });
  });
  return out.length >= 2 && out[0]!.index === 0 ? out : null;
}

/** 面积 ≥ 底座 share 的最高一块（同高取面积大的）；share 默认 40 %（主体），顶块用 15 %（crestPart）。 */
export function mainPart(parts: readonly PreparedPart[], share = MAIN_SHARE): PreparedPart {
  const floor = parts[0]!.area * share;
  let best = parts[0]!;
  for (const p of parts) if (p.area >= floor && (p.top > best.top || (p.top === best.top && p.area > best.area))) best = p;
  return best;
}

/** 顶块：面积 ≥ 底座 15 % 的最高一块。 */
export function crestPart(parts: readonly PreparedPart[]): PreparedPart {
  return mainPart(parts, CREST_SHARE);
}

/** 最高的一块（同高取面积大的）。 */
export function peakPart(parts: readonly PreparedPart[]): PreparedPart {
  let best = parts[0]!;
  for (const p of parts) if (p.top > best.top || (p.top === best.top && p.area > best.area)) best = p;
  return best;
}

/** 顶块之上的小块（机房、水箱间、桅杆）：按屋顶机房立面画。 */
export function isPlantPart(p: PreparedPart, crest: PreparedPart): boolean {
  if (p.index === 0 || p.top <= crest.top) return false;
  return p.area < SPIRE_AREA_DM2 || (p.area < crest.area * PLANT_SHARE && p.top - p.bottom <= PLANT_RISE_DM);
}

/** 一块的三角形数：每条边一个墙面四边形 + 屋顶（点数 − 2 + 2 × 洞数）。 */
export function partTriangles(rings: readonly FlatXY[]): number {
  let verts = 0;
  for (const r of rings) verts += r.length >> 1;
  return 2 * verts + (verts - 2 + 2 * (rings.length - 1));
}

/**
 * LOW 档挑哪些楼按分层画：按最高点从高到低，累计多出来的三角形（底座以上各块）不超过 budget。
 * 返回楼 ID 集合；确定性（同高按 ID）。
 */
export function lowTierPartBuildings(buildings: readonly Building[], budget = LOW_PARTS_TRIANGLES): Set<string> {
  const cands = buildings
    .filter((b) => b.parts && b.parts.length >= 2)
    .map((b) => ({
      id: b.id,
      peak: Math.max(...b.parts!.map((p) => p.top)),
      extra: b.parts!.slice(1).reduce((s, p) => s + partTriangles([p.ring!, ...(p.holes ?? [])]), 0),
    }))
    .sort((a, c) => c.peak - a.peak || (a.id < c.id ? -1 : 1));
  const out = new Set<string>();
  let used = 0;
  for (const c of cands) {
    if (used + c.extra > budget) continue;
    used += c.extra;
    out.add(c.id);
  }
  return out;
}
