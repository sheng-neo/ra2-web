/**
 * BuildingSource 的 LandsD 实现（地政总署 Building，经 CSDI 取得，条款见 data-raw/landsd/TERMS.md）。
 * 整层替换 Overture 建筑：楼底 = BaseHeight，总高 = TopHeight − BaseHeight，类别取 BuildingBlockType。
 * 有盖构筑物（Open-sided Structure：雨棚、有盖行人通道等）只有顶盖没有墙，画成实心块会挡住路面，不输出。
 * 快照本身不含名称字段；源 ID（BuildingCSUID）只用来生成短哈希。
 */
import type { BuildingKind } from '@central/data';
import type { BuildingSource, RawBuilding } from '../stages/buildings';
import type { LandsdBuilding } from '../stages/terrain-buildings';
import { REF_LANDSD_BUILDINGS } from '../stages/terrain-refs';

/** BuildingBlockType → BuildingKind；不在表里的类型不输出。 */
const KIND: Readonly<Record<string, BuildingKind>> = {
  Tower: 'tower',
  Podium: 'podium',
  'Temporary Structure': 'other',
};

function toRaw(b: LandsdBuilding): RawBuilding[] {
  const kind = KIND[b.blockType];
  if (!kind) return [];
  const raw: RawBuilding = { rawId: b.id, polygons: b.polygons, kind, ref: REF_LANDSD_BUILDINGS };
  if (b.base !== null) {
    raw.base = b.base;
    if (b.top !== null) {
      raw.heightM = (b.top - b.base) / 10;
      raw.heightFrom = 'landsd';
    }
  }
  if (b.storeys !== null && b.storeys > 0) raw.floors = b.storeys;
  // 临时构筑物多为地盘办公室、小亭，缺高度时按附属小屋估 3–5 m
  if (b.blockType === 'Temporary Structure') raw.subtype = 'outbuilding';
  return [raw];
}

export function landsdBuildingSource(rows: readonly LandsdBuilding[]): BuildingSource {
  return { src: 'landsd', load: () => Promise.resolve(rows.flatMap(toRaw)) };
}
