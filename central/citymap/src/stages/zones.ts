/**
 * 10-zones：可玩区（MVP 矩形）与敏感区（军事用地 + 政府设施）。
 */
import type { Ring, SensitiveKind, SensitiveZone, Zones } from '@central/data';
import type { LonLatRect } from '../config';
import { shortId } from '../geo/hash';
import { pointInRing, ringCentroid } from '../geo/ring';
import { GOVERNMENT_IDS, GOVERNMENT_NAMES } from '../overrides/sensitive';
import { polygonsOf, rawName, type OvtFeature } from '../sources/overture';
import { cleanPolygon } from './buildings';
import { project, projectCoords } from './project';

/** 经纬度矩形 → 本地 dm 四边形（CCW：西南、东南、东北、西北）。 */
function rectRing(r: LonLatRect): Ring {
  return {
    outer: [
      ...project(r.west, r.south),
      ...project(r.east, r.south),
      ...project(r.east, r.north),
      ...project(r.west, r.north),
    ],
  };
}

function isGovernment(f: OvtFeature): boolean {
  const name = rawName(f);
  return GOVERNMENT_IDS.includes(f.id) || GOVERNMENT_NAMES.some((n) => name.includes(n));
}

export function buildZones(
  landUse: readonly OvtFeature[],
  buildingRows: readonly OvtFeature[],
  playable: LonLatRect,
): Zones {
  const sensitive: SensitiveZone[] = [];
  const addFeature = (f: OvtFeature, kind: SensitiveKind, skipCovered: boolean): void => {
    polygonsOf(f.geometry).forEach((poly, k) => {
      const area = cleanPolygon(poly.map(projectCoords));
      if (!area) return;
      const [cx, cy] = ringCentroid(area.outer);
      if (skipCovered && sensitive.some((z) => pointInRing(cx, cy, z.area.outer))) return;
      sensitive.push({ id: shortId(`zone:${f.id}#${k}`), kind, area });
    });
  };
  for (const f of landUse) if (f.subtype === 'military') addFeature(f, 'military', false);
  for (const f of landUse) if (isGovernment(f)) addFeature(f, 'government', false);
  // 已被院落（land_use）覆盖的政府楼不重复列出
  for (const f of buildingRows) if (isGovernment(f)) addFeature(f, 'government', true);
  sensitive.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { playable: [rectRing(playable)], sensitive };
}
