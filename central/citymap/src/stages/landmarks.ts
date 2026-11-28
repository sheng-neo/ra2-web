/**
 * 09-landmarks：按覆盖表匹配原型建筑，输出摆放参数（名字是覆盖表里的真名，负责人 D6），并把原轮廓从 buildings 里删掉。
 * 地标总高是从地面算起的结构高度，所以楼底取轮廓最低顶点处的地形（不用源数据的楼底：
 * LandsD 塔楼的 BaseHeight 常是裙楼顶）。
 */
import type { Building, LandmarkPlacement } from '@central/data';
import { lowestGround, type GroundFn } from '../geo/ground';
import { minAreaRect, pointInRing, ringCentroid } from '../geo/ring';
import { MATCH_RADIUS_M, type LandmarkSpec } from '../overrides/landmarks';
import { project } from './project';

export interface LandmarksResult {
  landmarks: LandmarkPlacement[];
  /** 删除被替换建筑后的 buildings（保持原顺序）。 */
  buildings: Building[];
}

/** 最近质心匹配；超出半径或源高度明显不符时抛错，防止换错楼。 */
function match(spec: LandmarkSpec, buildings: readonly Building[], centroids: readonly [number, number][]): number {
  const [ax, ay] = project(spec.at[0], spec.at[1]);
  let best = -1;
  let bestD = MATCH_RADIUS_M * 10;
  centroids.forEach(([x, y], i) => {
    const d = Math.hypot(x - ax, y - ay);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0) throw new Error(`地标 ${spec.id}：${MATCH_RADIUS_M} m 内没有建筑`);
  const b = buildings[best]!;
  if (b.heightSource !== 'heuristic' && b.height < spec.heightM * 10 * 0.5) {
    throw new Error(`地标 ${spec.id}：匹配到的建筑源高度 ${b.height / 10} m 与核实高度 ${spec.heightM} m 不符`);
  }
  return best;
}

export function placeLandmarks(
  specs: readonly LandmarkSpec[],
  buildings: readonly Building[],
  ground: GroundFn = () => 0,
): LandmarksResult {
  const centroids = buildings.map((b) => ringCentroid(b.footprint.outer));
  const removed = new Set<number>();
  const landmarks: LandmarkPlacement[] = [];
  for (const spec of specs) {
    const i = match(spec, buildings, centroids);
    if (removed.has(i)) throw new Error(`地标 ${spec.id}：原型建筑已被其他地标占用`);
    const footprint = buildings[i]!.footprint;
    // 原型本身 + 质心落在原型轮廓里的重叠碎片
    const replaced = [i];
    centroids.forEach(([x, y], j) => {
      if (j !== i && pointInRing(x, y, footprint.outer)) replaced.push(j);
    });
    for (const j of replaced) removed.add(j);
    const [cx, cy] = centroids[i]!;
    landmarks.push({
      id: spec.id,
      name: { zh: spec.name.zh, en: spec.name.en },
      x: Math.round(cx),
      y: Math.round(cy),
      rot: Math.round(minAreaRect(footprint.outer).angle * 1e4) / 1e4,
      base: lowestGround(footprint.outer, ground),
      height: Math.round(spec.heightM * 10),
      footprint,
      replaces: replaced.map((j) => buildings[j]!.id).sort(),
    });
  }
  landmarks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { landmarks, buildings: buildings.filter((_, i) => !removed.has(i)) };
}
