/**
 * 确定性锁步会话（客户端侧核心，纯逻辑、不依赖网络）。
 *
 * 模型：固定输入延迟锁步。
 * - 每个玩家每个 tick 恰好提交一个命令包（可空）；包标记其「执行 tick」。
 * - 玩家在执行 tick T 期间产生的操作，安排到 tick T+inputDelay 执行 ——
 *   这段延迟为网络往返留出缓冲。
 * - 客户端只有在收齐某 tick 全部玩家的包后，才执行该 tick（否则 stall 等待）。
 * - 所有客户端执行完全相同的命令序列 → 确定性 → 永不失同步。
 *
 * 关键洞察：命令里携带的 entityId 在所有客户端一致 —— 因为同样的命令序列
 * 在确定性 sim 中产生同样的 spawn 顺序、同样的 id。故选中/攻击用本地 id 即安全。
 */
import type { Command } from './world';

export interface OutgoingPacket {
  tick: number;
  commands: Command[];
}

export interface IncomingPacket {
  tick: number;
  playerId: number;
  commands: Command[];
}

export class LockstepSession {
  /** 下一个待执行的 tick。 */
  private execTick = 0;
  /** tick → (playerId → 命令)。 */
  private readonly buffer = new Map<number, Map<number, Command[]>>();
  /** 本地累积、尚未打包发送的命令。 */
  private pending: Command[] = [];
  private readonly sortedPlayers: number[];

  constructor(
    readonly localPlayerId: number,
    playerIds: readonly number[],
    readonly inputDelay = 4,
  ) {
    this.sortedPlayers = [...playerIds].sort((a, b) => a - b);
  }

  get currentTick(): number {
    return this.execTick;
  }

  /** 启动：为 tick 0..inputDelay-1 预发空包（这些 tick 无玩家输入）。 */
  start(): OutgoingPacket[] {
    const out: OutgoingPacket[] = [];
    for (let t = 0; t < this.inputDelay; t++) out.push({ tick: t, commands: [] });
    return out;
  }

  /** 本地操作入队，将在 execTick+inputDelay 执行。 */
  queueLocal(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** 收到某玩家某 tick 的命令包。 */
  receive(pkt: IncomingPacket): void {
    let byPlayer = this.buffer.get(pkt.tick);
    if (!byPlayer) {
      byPlayer = new Map();
      this.buffer.set(pkt.tick, byPlayer);
    }
    byPlayer.set(pkt.playerId, pkt.commands);
  }

  /** execTick 是否已收齐所有玩家的包。 */
  ready(): boolean {
    const byPlayer = this.buffer.get(this.execTick);
    if (!byPlayer) return false;
    for (const pid of this.sortedPlayers) {
      if (!byPlayer.has(pid)) return false;
    }
    return true;
  }

  /**
   * 取出 execTick 的合并命令（按 playerId 升序，保证全端一致顺序），
   * execTick 前进。调用方随后做 world.applyCommands + world.step。
   */
  take(): Command[] {
    const byPlayer = this.buffer.get(this.execTick);
    if (!byPlayer) throw new Error(`tick ${this.execTick} 未就绪`);
    const merged: Command[] = [];
    for (const pid of this.sortedPlayers) {
      const cmds = byPlayer.get(pid);
      if (cmds) merged.push(...cmds);
    }
    this.buffer.delete(this.execTick);
    this.execTick++;
    return merged;
  }

  /**
   * 执行完一个 tick 后调用：把累积的本地命令打包成「未来包」
   * （执行 tick = 刚执行的 tick + inputDelay），清空本地缓冲。
   */
  afterStep(): OutgoingPacket {
    const pkt: OutgoingPacket = {
      tick: this.execTick - 1 + this.inputDelay,
      commands: this.pending,
    };
    this.pending = [];
    return pkt;
  }

  /** 已缓冲但尚未执行的 tick 数（衡量网络余量，可用于自适应延迟）。 */
  bufferedAhead(): number {
    let n = 0;
    let t = this.execTick;
    while (this.buffer.has(t)) {
      t++;
      n++;
    }
    return n;
  }
}
