/**
 * 回放脚本执行器：确定性测试与 desync 排查的核心工具。
 * 命令日志（tick → 命令）就是回放文件格式的雏形。
 */
import type { Command, TerrainInfo, World } from './world';

export interface ScriptedCommand {
  tick: number;
  command: Command;
}

export interface ReplayResult {
  /** 每个采样点的 (tick, hash)。 */
  samples: { tick: number; hash: number }[];
  finalHash: number;
}

/** 把脚本跑到 untilTick，每 sampleEvery tick 采一次状态哈希。 */
export function runScript(
  world: World,
  script: ScriptedCommand[],
  untilTick: number,
  sampleEvery = 10,
): ReplayResult {
  const byTick = new Map<number, Command[]>();
  for (const s of script) {
    const list = byTick.get(s.tick) ?? [];
    list.push(s.command);
    byTick.set(s.tick, list);
  }

  const samples: { tick: number; hash: number }[] = [];
  while (world.tick < untilTick) {
    const cmds = byTick.get(world.tick);
    if (cmds) world.applyCommands(cmds);
    world.step();
    if (world.tick % sampleEvery === 0) {
      samples.push({ tick: world.tick, hash: world.hash() });
    }
  }
  return { samples, finalHash: world.hash() };
}

/** 简单矩形地形 + 障碍列表（测试/沙盒用）。 */
export function gridTerrain(
  width: number,
  height: number,
  blocked: ReadonlySet<number> = new Set(),
): TerrainInfo {
  return {
    width,
    height,
    passable: (x, y) => x >= 0 && y >= 0 && x < width && y < height && !blocked.has(y * width + x),
  };
}
