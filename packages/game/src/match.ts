/**
 * 从 MatchConfig 构建初始 World —— 单机、联机客户端、服务端 e2e 测试共用，
 * 保证所有端从完全相同的世界起步（锁步同步的前提）。
 */
import { gridTerrain } from './replay';
import { World } from './world';
import type { MatchConfig } from './protocol';

export function createWorldFromConfig(config: MatchConfig): World {
  const world = new World(gridTerrain(config.mapWidth, config.mapHeight), config.seed);
  const startCredits = config.startingCredits ?? 5000;
  for (const spawn of config.spawns) {
    world.addPlayer(spawn.playerId, spawn.side, startCredits);
    world.spawnUnit(spawn.playerId, 'conyard', spawn.cellX, spawn.cellY);
    world.spawnUnit(spawn.playerId, 'powerplant', spawn.cellX + 4, spawn.cellY);
    world.spawnUnit(spawn.playerId, 'refinery', spawn.cellX, spawn.cellY + 4);
  }
  for (const patch of config.orePatches) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= 3) {
          world.setOre(patch.cellX + dx, patch.cellY + dy, 600);
        }
      }
    }
  }
  return world;
}
