/**
 * 端到端联机同步测试：两个真实 ws 客户端经真实服务器中继打一局，
 * 各跑独立 World + LockstepSession，注入互不相同的操作，
 * 最终断言两端逐 tick 状态哈希完全一致 —— 验证「协议 + 服务器中继 +
 * 锁步 + 确定性 sim」整条链路不失同步。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  LockstepSession,
  PROTOCOL_VERSION,
  World,
  createWorldFromConfig,
  decodeMessage,
  encodeMessage,
  type ClientMessage,
  type Command,
  type MatchConfig,
  type ServerMessage,
} from '@ra2web/game';
import { createGameServer, type GameServer } from './server';

let server: GameServer;
beforeAll(async () => {
  server = await createGameServer(0);
});
afterAll(async () => {
  await server.close();
});

interface Peer {
  ws: WebSocket;
  id: number;
  world: World | null;
  session: LockstepSession | null;
  hashes: Map<number, number>;
  inbox: ServerMessage[];
}

function send(ws: WebSocket, msg: ClientMessage): void {
  ws.send(encodeMessage(msg));
}

function openPeer(): Promise<Peer> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  const peer: Peer = { ws, id: 0, world: null, session: null, hashes: new Map(), inbox: [] };
  ws.on('message', (d) => peer.inbox.push(decodeMessage<ServerMessage>(String(d))));
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(peer));
    ws.once('error', reject);
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 处理收件箱：建立对局、把 tick 包喂进 session。 */
function pump(peer: Peer, ops: Record<number, Command[]>): void {
  while (peer.inbox.length > 0) {
    const msg = peer.inbox.shift()!;
    if (msg.t === 'joined') peer.id = msg.playerId;
    else if (msg.t === 'start') {
      const config: MatchConfig = msg.config;
      peer.world = createWorldFromConfig(config);
      const ids = config.spawns.map((s) => s.playerId).sort((a, b) => a - b);
      peer.session = new LockstepSession(peer.id, ids, config.inputDelay);
      for (const pkt of peer.session.start()) send(peer.ws, { t: 'cmd', tick: pkt.tick, commands: pkt.commands });
    } else if (msg.t === 'tick' && peer.session) {
      for (const [pid, cmds] of Object.entries(msg.commandsByPlayer)) {
        peer.session.receive({ tick: msg.tick, playerId: Number(pid), commands: cmds });
      }
    }
  }
  // 推进所有已就绪 tick
  if (peer.world && peer.session) {
    while (peer.session.ready()) {
      const execTick = peer.session.currentTick;
      const cmds = peer.session.take();
      peer.world.applyCommands(cmds);
      peer.world.step();
      peer.hashes.set(execTick, peer.world.hash());
      for (const c of ops[execTick] ?? []) peer.session.queueLocal(c);
      const pkt = peer.session.afterStep();
      send(peer.ws, { t: 'cmd', tick: pkt.tick, commands: pkt.commands });
    }
  }
}

describe('端到端联机同步', () => {
  it('两客户端经真实服务器对局 → 逐 tick 哈希一致', async () => {
    const a = await openPeer();
    const b = await openPeer();
    send(a.ws, { t: 'join', room: 'e2e', name: 'A', protocol: PROTOCOL_VERSION });
    send(b.ws, { t: 'join', room: 'e2e', name: 'B', protocol: PROTOCOL_VERSION });
    await sleep(50);
    send(a.ws, { t: 'ready', ready: true });
    send(b.ws, { t: 'ready', ready: true });
    await sleep(50);

    // 各自的操作脚本（盟军 A=玩家1，苏军 B=玩家2；建造场坐标见 server start）
    const aOps: Record<number, Command[]> = {
      6: [{ kind: 'produce', owner: 1, typeId: 'barracks' }],
      8: [{ kind: 'produce', owner: 1, typeId: 'powerplant' }],
    };
    const bOps: Record<number, Command[]> = {
      6: [{ kind: 'produce', owner: 2, typeId: 'barracks' }],
      10: [{ kind: 'produce', owner: 2, typeId: 'powerplant' }],
    };

    // 异步泵：反复处理消息直到双方都到约 80 tick
    for (let i = 0; i < 400; i++) {
      pump(a, aOps);
      pump(b, bOps);
      if ((a.world?.tick ?? 0) >= 80 && (b.world?.tick ?? 0) >= 80) break;
      await sleep(5);
    }

    expect(a.world).not.toBeNull();
    expect(b.world).not.toBeNull();
    // 公共 tick 区间哈希全等
    let compared = 0;
    for (const [tick, ha] of a.hashes) {
      const hb = b.hashes.get(tick);
      if (hb !== undefined) {
        expect(hb, `tick ${tick} 哈希应一致`).toBe(ha);
        compared++;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(70);
    // B 的造兵营命令跨网到达 A 的 sim：A 上玩家2的建筑队列应出现 barracks
    const p2queueOnA = a.world!.queueFor(2, 'building');
    const p2builtBarracks = p2queueOnA?.items.includes('barracks') || p2queueOnA?.readyToPlace;
    expect(p2builtBarracks).toBe(true);
    // 反向：A 的造兵营命令到达 B 的 sim
    const p1queueOnB = b.world!.queueFor(1, 'building');
    expect(p1queueOnB?.items.includes('barracks') || p1queueOnB?.readyToPlace).toBe(true);

    a.ws.close();
    b.ws.close();
  }, 15000);
});
