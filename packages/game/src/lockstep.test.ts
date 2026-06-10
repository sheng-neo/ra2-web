import { describe, expect, it } from 'vitest';
import { LockstepSession, type OutgoingPacket } from './lockstep';
import { World, type Command } from './world';
import { gridTerrain } from './replay';

/**
 * 模拟两名玩家经「中继服务器」对打：
 * 各自一份 World + LockstepSession，命令包互发，验证两端逐 tick 哈希一致。
 * 这是锁步联机正确性的核心证明（不依赖真实网络）。
 */
interface Peer {
  world: World;
  session: LockstepSession;
  hashes: number[];
}

function makePeer(localId: number, players: number[]): Peer {
  const world = new World(gridTerrain(30, 30), 0xc0ffee);
  world.addPlayer(1, 'allied', 5000);
  world.addPlayer(2, 'soviet', 5000);
  return { world, session: new LockstepSession(localId, players, 3), hashes: [] };
}

describe('LockstepSession 双端同步', () => {
  it('两端喂相同命令流 → 逐 tick 哈希完全一致', () => {
    const players = [1, 2];
    const p1 = makePeer(1, players);
    const p2 = makePeer(2, players);

    // 中继：服务器收齐某 tick 两玩家包后广播。这里用「待广播」队列模拟。
    const serverBuffer = new Map<number, Map<number, Command[]>>();
    const broadcastTo: Peer[] = [p1, p2];

    function relay(from: number, pkt: OutgoingPacket): void {
      let byP = serverBuffer.get(pkt.tick);
      if (!byP) {
        byP = new Map();
        serverBuffer.set(pkt.tick, byP);
      }
      byP.set(from, pkt.commands);
      if (byP.size === players.length) {
        // 收齐 → 广播
        for (const peer of broadcastTo) {
          for (const pid of players) {
            peer.session.receive({ tick: pkt.tick, playerId: pid, commands: byP.get(pid)! });
          }
        }
      }
    }

    // 启动空包
    for (const pkt of p1.session.start()) relay(1, pkt);
    for (const pkt of p2.session.start()) relay(2, pkt);

    // 玩家操作脚本：在「执行 tick」边界注入本地命令
    const p1ops: Record<number, Command[]> = {
      0: [{ kind: 'spawn', owner: 1, typeId: 'grizzly', cellX: 3, cellY: 3 }],
      4: [{ kind: 'move', entityIds: [1], cellX: 20, cellY: 20 }],
    };
    const p2ops: Record<number, Command[]> = {
      0: [{ kind: 'spawn', owner: 2, typeId: 'rhino', cellX: 25, cellY: 25 }],
      6: [{ kind: 'move', entityIds: [2], cellX: 5, cellY: 5 }],
    };

    function stepPeer(peer: Peer, ops: Record<number, Command[]>, from: number): void {
      while (peer.session.ready()) {
        const execNow = peer.session.currentTick;
        for (const cmd of ops[execNow] ?? []) peer.session.queueLocal(cmd);
        const cmds = peer.session.take();
        peer.world.applyCommands(cmds);
        peer.world.step();
        peer.hashes.push(peer.world.hash());
        relay(from, peer.session.afterStep());
      }
    }

    // 交替推进若干轮（两端可能相差 1 tick，下面比较公共前缀）
    for (let round = 0; round < 200; round++) {
      stepPeer(p1, p1ops, 1);
      stepPeer(p2, p2ops, 2);
      if (p1.world.tick >= 40 && p2.world.tick >= 40) break;
    }

    // 核心断言：两端逐 tick 哈希在公共前缀上完全一致（即从未失同步）
    const n = Math.min(p1.hashes.length, p2.hashes.length);
    expect(n).toBeGreaterThanOrEqual(40);
    expect(p1.hashes.slice(0, n)).toEqual(p2.hashes.slice(0, n));
    // 命令确有效果：两边都生成了 2 个单位
    expect(p1.world.entities.size).toBe(2);
    expect(p2.world.entities.size).toBe(2);
  });

  it('未收齐时 stall（不前进）', () => {
    const s = new LockstepSession(1, [1, 2], 3);
    for (const pkt of s.start()) s.receive({ tick: pkt.tick, playerId: 1, commands: [] });
    // 只有玩家1的包 → tick0 收不齐
    expect(s.ready()).toBe(false);
    s.receive({ tick: 0, playerId: 2, commands: [] });
    expect(s.ready()).toBe(true);
  });

  it('afterStep 安排到正确的未来 tick', () => {
    const s = new LockstepSession(1, [1], 3);
    for (const pkt of s.start()) s.receive({ tick: pkt.tick, playerId: 1, commands: [] });
    expect(s.ready()).toBe(true);
    s.take(); // 执行 tick 0
    const pkt = s.afterStep();
    expect(pkt.tick).toBe(3); // 0 + inputDelay
  });

  it('单玩家命令包按 playerId 升序合并', () => {
    const s = new LockstepSession(1, [2, 1], 1);
    for (const pkt of s.start()) {
      s.receive({ tick: pkt.tick, playerId: 1, commands: [] });
      s.receive({ tick: pkt.tick, playerId: 2, commands: [] });
    }
    s.receive({ tick: 0, playerId: 1, commands: [{ kind: 'cancel', owner: 1, category: 'building' }] });
    s.receive({ tick: 0, playerId: 2, commands: [{ kind: 'cancel', owner: 2, category: 'infantry' }] });
    const merged = s.take();
    expect(merged[0]).toMatchObject({ owner: 1 });
    expect(merged[1]).toMatchObject({ owner: 2 });
  });
});
