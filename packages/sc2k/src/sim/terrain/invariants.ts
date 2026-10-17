// ===== sim/terrain/invariants.ts =====（spec:terrain §2.7.2 / §4）
// 地形层不变量检查（测试与 debug 面板用，不在模拟路径上调用）：≤1 级连续性、无未定义 XTER、干地水位 = 海拔、
// 海相连水 minCorner < 水位、装饰水零深度（瀑布 alt+1）、水面 / 瀑布上无树。返回违例计数，全 0 即健康。
import { TILES, XBit, XterClass, xterClassOf } from '../../contracts/grid';
import type { CityState } from '../../contracts/state';
import { TerrainField } from './field';
import { isTreeXbld, isUndefinedXter } from './slope';

export interface TerrainViolations { cornerMismatch: number; slopeBad: number; undefinedXter: number; dryWaterLevel: number; seaAboveWater: number; dryBelowSea: number; decorativeDepth: number; treesOnWater: number; saltOnDry: number }

export function terrainViolations(state: CityState): TerrainViolations {
  const L = state.layers, W = state.terrain.seaLevel;
  const field = new TerrainField();
  field.rebuild(L);
  const v: TerrainViolations = { cornerMismatch: field.inconsistent, slopeBad: 0, undefinedXter: 0, dryWaterLevel: 0, seaAboveWater: 0, dryBelowSea: 0, decorativeDepth: 0, treesOnWater: 0, saltOnDry: 0 };
  for (let i = 0; i < TILES; i++) {
    const g = field.geometry(i);
    if (!g) { v.slopeBad++; continue; }
    const xter = L.xter[i]!;
    if (isUndefinedXter(xter)) { v.undefinedXter++; continue; }
    const water = (L.xbit[i]! & XBit.Water) !== 0, salt = (L.xbit[i]! & XBit.SaltWater) !== 0;
    const cls = xterClassOf(xter);
    if (!water) {
      if (L.waterLevel[i] !== L.alt[i]) v.dryWaterLevel++;
      if (g.min < W) v.dryBelowSea++;
      if (salt) v.saltOnDry++;
      continue;
    }
    if (cls === XterClass.Submerged || cls === XterClass.Shore) { if (!(g.min < L.waterLevel[i]!)) v.seaAboveWater++; }
    else if (cls === XterClass.Waterfall) { if (L.waterLevel[i] !== L.alt[i]! + 1) v.decorativeDepth++; }
    else if (L.waterLevel[i] !== L.alt[i]) v.decorativeDepth++;
    if (isTreeXbld(L.xbld[i]!)) v.treesOnWater++;
  }
  return v;
}
export const totalViolations = (v: TerrainViolations): number => Object.values(v).reduce((a, b) => a + b, 0);
