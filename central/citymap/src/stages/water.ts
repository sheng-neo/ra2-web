/**
 * 海面：只取 Overture water 里 subtype=ocean 的多边形（海面高程 0 mPD）。
 * 公园池塘、泳池等多在高处，不当海面画；它们本来就在快照里被裁到范围内。
 */
import type { Ring } from '@central/data';
import { polygonsOf, type OvtFeature } from '../sources/overture';
import { cleanPolygon } from './buildings';
import { projectCoords } from './project';

export function buildWater(water: readonly OvtFeature[]): Ring[] {
  const rings: Ring[] = [];
  for (const f of water) {
    if (f.subtype !== 'ocean') continue;
    for (const poly of polygonsOf(f.geometry)) {
      const ring = cleanPolygon(poly.map(projectCoords));
      if (ring) rings.push(ring);
    }
  }
  return rings;
}
