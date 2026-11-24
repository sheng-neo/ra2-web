/**
 * BuildingSource 的 Overture 实现：投影坐标、按行内 sources[] 区分 ODbL / CC-BY 署名。
 * 名称字段不进入 RawBuilding——建筑名永远不会走到产物里。
 */
import type { BuildingSource, RawBuilding } from '../stages/buildings';
import { projectCoords } from '../stages/project';
import { polygonsOf, type OvtBuilding } from './overture';
import { REF_EAST_ASIA_BUILDINGS, REF_OSM } from './refs';

export function overtureBuildingSource(rows: readonly OvtBuilding[]): BuildingSource {
  return {
    src: 'ovt',
    load: () => Promise.resolve(rows.filter((r) => !r.is_underground).map(toRaw)),
  };
}

function toRaw(r: OvtBuilding): RawBuilding {
  const ccBy = (r.sources ?? []).some((s) => s.license === 'CC-BY-4.0');
  const raw: RawBuilding = {
    rawId: r.id,
    polygons: polygonsOf(r.geometry).map((rings) => rings.map(projectCoords)),
    ref: ccBy ? REF_EAST_ASIA_BUILDINGS : REF_OSM,
  };
  if (r.height != null) {
    raw.heightM = r.height;
    raw.heightFrom = 'tag';
  }
  if (r.num_floors != null) raw.floors = r.num_floors;
  if (r.subtype) raw.subtype = r.subtype;
  if (r.class) raw.cls = r.class;
  return raw;
}
