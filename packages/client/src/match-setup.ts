/**
 * 单机遭遇战的本地配置。世界构建复用 @ra2web/game 的 createWorldFromConfig，
 * 与联机客户端、服务端测试同一套初始化逻辑。
 */
import { createWorldFromConfig, type MatchConfig } from '@ra2web/game';

export { createWorldFromConfig as createMatchWorld };

export type MapSize = 'small' | 'medium' | 'large';
const MAP_DIMS: Record<MapSize, number> = { small: 36, medium: 44, large: 56 };

export function localSkirmishConfig(startingCredits = 5000, size: MapSize = 'medium'): MatchConfig {
  const w = MAP_DIMS[size];
  const h = w;
  return {
    seed: 20260610,
    mapWidth: w,
    mapHeight: h,
    spawns: [
      { playerId: 1, side: 'allied', cellX: 5, cellY: 6 },
      { playerId: 2, side: 'soviet', cellX: w - 8, cellY: h - 9 },
    ],
    orePatches: [
      { cellX: 12, cellY: 14 },
      { cellX: w - 14, cellY: h - 16 },
      { cellX: Math.floor(w / 2), cellY: Math.floor(h / 2) },
      { cellX: 12, cellY: h - 14 },
      { cellX: w - 14, cellY: 14 },
    ],
    inputDelay: 0,
    startingCredits,
  };
}
