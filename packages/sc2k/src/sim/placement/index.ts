// ===== sim/placement/index.ts =====（CONTRACTS §V：createPlacementSystem）
// 放置系统：放置校验、建造 / 拆除、分区、线性网络铺设（桥 / 邻城连接模态）、工具可用性、预览。
// 无阶段、无 priv（挂起态不进 sim：桥型 / 邻城连接 / 选队都由 UI 重发命令）、无 .SC2 读写（图层由 core 清洗步整体拷贝）。
// 不消费 PRNG（NIMBY 掷骰为 v2）。
import type { SimEntries } from '../../contracts/entrypoints';
import type { SimContext, System } from '../../contracts/system';
import { makeCommands } from './commands';
import { makePlacementQuery } from './queries';

export const createPlacementSystem = ((): System => {
  let bound: SimContext | null = null;
  return {
    id: 'placement',
    commands: makeCommands(),
    queries: { placement: makePlacementQuery(() => bound) },
    /** teamPick：答案为球队索引，写入 rewards.stadiumTeams 位掩码（spec:services §2.6.2 / MISC 0x1028）。 */
    onModalAnswer(ctx, dialog, answer) {
      if (dialog !== 'teamPick') return;
      if (!Number.isInteger(answer) || answer < 0 || answer > 30) return;
      ctx.state.rewards.stadiumTeams = (ctx.state.rewards.stadiumTeams | (1 << answer)) >>> 0;
    },
    init(ctx) { bound = ctx; },
    postLoad(ctx) { bound = ctx; },
  };
}) satisfies SimEntries['createPlacementSystem'];
