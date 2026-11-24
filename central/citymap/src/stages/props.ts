/**
 * 08-props：红绿灯、过路处、巴士站、路灯、树 → 扁平点数组（按 x、y 排序去重）。
 * 行道树（tree_row 线）每 8 m 取一棵。
 * 敏感区内的点一律不出（PLAN §3.1：敏感区内不放可交互、可破坏的道具）。
 */
import type { Props, SensitiveZone } from '@central/data';
import { pointInRing } from '../geo/ring';
import { inRect, samplePolyline, type Rect } from '../geo/polyline';
import { linesOf, type OvtFeature } from '../sources/overture';
import { project, projectCoords } from './project';

const TREE_ROW_STEP_DM = 80;

const INFRA_CLASS: Record<string, keyof Omit<Props, 'trees'>> = {
  traffic_signals: 'signals',
  crossing: 'crossings',
  bus_stop: 'busStops',
  street_lamp: 'streetLamps',
};

function finish(points: [number, number][]): number[] {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: number[] = [];
  for (const [x, y] of points) {
    const n = out.length;
    if (n >= 2 && out[n - 2] === x && out[n - 1] === y) continue;
    out.push(x, y);
  }
  return out;
}

export function buildProps(
  infrastructure: readonly OvtFeature[],
  land: readonly OvtFeature[],
  extent: Rect,
  sensitive: readonly SensitiveZone[],
): Props {
  const buckets: Record<keyof Props, [number, number][]> = {
    signals: [],
    crossings: [],
    busStops: [],
    streetLamps: [],
    trees: [],
  };
  const add = (key: keyof Props, x: number, y: number): void => {
    if (!inRect(x, y, extent) || sensitive.some((z) => pointInRing(x, y, z.area.outer))) return;
    buckets[key].push([x, y]);
  };
  for (const f of infrastructure) {
    const key = f.class ? INFRA_CLASS[f.class] : undefined;
    if (key && f.geometry.type === 'Point') add(key, ...project(f.geometry.coordinates[0]!, f.geometry.coordinates[1]!));
  }
  for (const f of land) {
    if (f.subtype !== 'tree') continue;
    if (f.geometry.type === 'Point') {
      add('trees', ...project(f.geometry.coordinates[0]!, f.geometry.coordinates[1]!));
      continue;
    }
    for (const line of linesOf(f.geometry)) {
      const pts = samplePolyline(projectCoords(line), TREE_ROW_STEP_DM);
      for (let i = 0; i < pts.length; i += 2) add('trees', pts[i]!, pts[i + 1]!);
    }
  }
  return {
    signals: finish(buckets.signals),
    crossings: finish(buckets.crossings),
    busStops: finish(buckets.busStops),
    streetLamps: finish(buckets.streetLamps),
    trees: finish(buckets.trees),
  };
}
