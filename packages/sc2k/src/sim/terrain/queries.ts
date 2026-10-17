// ===== sim/terrain/queries.ts =====（CONTRACTS §I TerrainQuery；spec:terrain §3.1 TerrainReadApi）
// 只读查询：全部读真源层，不消费 PRNG。state 在 init / importFrom / postLoad 时绑定；绑定前回退到一份私有空城作答（与 nullSystem 同口径）。
import { XBit, inMap, tileIndex, tileX, tileY, xterClassOf } from '../../contracts/grid';
import type { TerrainQuery } from '../../contracts/queries';
import type { CityState } from '../../contracts/state';
import { cornersOf, slopeCodeOf, treeDensityOf } from './slope';

export const DISTANCE_TO_WATER_LIMIT = 8;
export const FEET_PER_LEVEL = 100, FEET_OFFSET = 50;

export function makeTerrainQuery(getState: () => CityState): TerrainQuery {
  const isWater = (i: number): boolean => (getState().layers.xbit[i]! & XBit.Water) !== 0;
  return {
    alt: (i) => getState().layers.alt[i]!,
    slope: (i) => slopeCodeOf(getState().layers.xter[i]!),
    xterClass: (i) => xterClassOf(getState().layers.xter[i]!),
    isWater,
    isSalt: (i) => (getState().layers.xbit[i]! & XBit.SaltWater) !== 0,
    isFlatDry: (i) => slopeCodeOf(getState().layers.xter[i]!) === 0 && !isWater(i),
    waterDepth: (i) => { const L = getState().layers; return isWater(i) ? Math.max(0, L.waterLevel[i]! - L.alt[i]!) : 0; },
    treeDensity: (i) => treeDensityOf(getState().layers.xbld[i]!),
    cornerHeights: (i) => { const L = getState().layers; return cornersOf(L.alt[i]!, L.xter[i]!, 'surface'); },
    distanceToWater: (i) => {
      const x = tileX(i), y = tileY(i);
      if (isWater(i)) return 0;
      for (let d = 1; d <= DISTANCE_TO_WATER_LIMIT; d++) {
        for (let dx = -d; dx <= d; dx++) {
          const edge = dx === -d || dx === d;
          for (let dy = -d; dy <= d; dy += edge ? 1 : 2 * d) {
            const nx = x + dx, ny = y + dy;
            if (inMap(nx, ny) && isWater(tileIndex(nx, ny))) return d;
          }
        }
      }
      return DISTANCE_TO_WATER_LIMIT;
    },
    altitudeFeet: (i) => getState().layers.alt[i]! * FEET_PER_LEVEL + FEET_OFFSET,
  };
}
