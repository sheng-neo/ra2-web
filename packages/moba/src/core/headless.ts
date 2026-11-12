/**
 * 无头对局工具：不依赖渲染/界面，直接在 Node 里把一局跑完。测试、调平衡、跑胜率统计都用它。
 *
 * 用法：
 *   const r = runHeadless({ seed: 1, playerHero: 'chijin', difficulty: 'normal', autoPlay: true }, { maxTime: 25 * 60 });
 *   r.winner / r.time / r.sim.state ...
 */
import type { GameEvent, MatchConfig, PlayerTeam } from './types';
import { createWorld, type Sim, type SimOptions } from './world';

export interface HeadlessOptions {
  /** 最长模拟时间（秒），缺省 25 分钟 */
  maxTime?: number;
  /** 每个 tick 之后调用（事件已取出）。返回 true 可提前结束 */
  onTick?: (sim: Sim, events: GameEvent[]) => boolean | void;
  sim?: SimOptions;
}

export interface HeadlessResult {
  sim: Sim;
  winner: PlayerTeam | null;
  /** 结束时的模拟时间（秒） */
  time: number;
  ticks: number;
  /** 各类事件的计数 */
  eventCounts: Record<string, number>;
}

export function runHeadless(config: MatchConfig, opts: HeadlessOptions = {}): HeadlessResult {
  const sim = createWorld({ ...config, autoPlay: config.autoPlay ?? true }, opts.sim);
  const maxTime = opts.maxTime ?? 25 * 60;
  const eventCounts: Record<string, number> = {};
  while (!sim.state.over && sim.state.time < maxTime) {
    sim.step();
    const events = sim.drainEvents();
    for (const e of events) eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;
    if (opts.onTick && opts.onTick(sim, events) === true) break;
  }
  return { sim, winner: sim.state.winner, time: sim.state.time, ticks: sim.state.tick, eventCounts };
}
