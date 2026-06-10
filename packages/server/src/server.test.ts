import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  decodeMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
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

function connect(): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function send(ws: WebSocket, msg: ClientMessage): void {
  ws.send(encodeMessage(msg));
}

/** 收集消息，提供「等到满足谓词」的 helper。 */
function collector(ws: WebSocket): {
  messages: ServerMessage[];
  waitFor: (pred: (m: ServerMessage) => boolean, timeout?: number) => Promise<ServerMessage>;
} {
  const messages: ServerMessage[] = [];
  const waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  ws.on('message', (data) => {
    const msg = decodeMessage<ServerMessage>(String(data));
    messages.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.pred(msg)) {
        waiters[i]!.resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });
  return {
    messages,
    waitFor: (pred, timeout = 2000) =>
      new Promise((resolve, reject) => {
        const existing = messages.find(pred);
        if (existing) return resolve(existing);
        const t = setTimeout(() => reject(new Error('waitFor 超时')), timeout);
        waiters.push({ pred: (m) => pred(m), resolve: (m) => { clearTimeout(t); resolve(m); } });
      }),
  };
}

describe('对战服务器', () => {
  it('health 返回协议版本', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { protocol: number };
    expect(body.protocol).toBe(PROTOCOL_VERSION);
  });

  it('两人加入大厅 → 都 ready → 开局，收到 MatchConfig', async () => {
    const a = await connect();
    const b = await connect();
    const ca = collector(a);
    const cb = collector(b);

    send(a, { t: 'join', room: 'r1', name: 'A', protocol: PROTOCOL_VERSION });
    send(b, { t: 'join', room: 'r1', name: 'B', protocol: PROTOCOL_VERSION });

    const joinedA = (await ca.waitFor((m) => m.t === 'joined')) as Extract<ServerMessage, { t: 'joined' }>;
    const joinedB = (await cb.waitFor((m) => m.t === 'joined')) as Extract<ServerMessage, { t: 'joined' }>;
    expect(joinedA.playerId).toBe(1);
    expect(joinedB.playerId).toBe(2);

    send(a, { t: 'ready', ready: true });
    send(b, { t: 'ready', ready: true });

    const start = (await ca.waitFor((m) => m.t === 'start')) as Extract<ServerMessage, { t: 'start' }>;
    expect(start.config.spawns.length).toBe(2);
    expect(start.config.seed).toBeGreaterThan(0);
    expect(start.config.inputDelay).toBeGreaterThan(0);
    await cb.waitFor((m) => m.t === 'start');

    a.close();
    b.close();
  });

  it('协议不匹配被拒', async () => {
    const a = await connect();
    const ca = collector(a);
    send(a, { t: 'join', room: 'rx', name: 'X', protocol: 999 });
    const err = (await ca.waitFor((m) => m.t === 'error')) as Extract<ServerMessage, { t: 'error' }>;
    expect(err.message).toContain('协议版本');
    a.close();
  });

  it('命令中继：收齐两玩家某 tick 包后广播', async () => {
    const a = await connect();
    const b = await connect();
    const ca = collector(a);
    const cb = collector(b);
    send(a, { t: 'join', room: 'r2', name: 'A', protocol: PROTOCOL_VERSION });
    send(b, { t: 'join', room: 'r2', name: 'B', protocol: PROTOCOL_VERSION });
    await ca.waitFor((m) => m.t === 'joined');
    await cb.waitFor((m) => m.t === 'joined');
    send(a, { t: 'ready', ready: true });
    send(b, { t: 'ready', ready: true });
    await ca.waitFor((m) => m.t === 'start');

    // 两人都发 tick 0 的包（A 带一条 spawn）
    send(a, { t: 'cmd', tick: 0, commands: [{ kind: 'spawn', owner: 1, typeId: 'gi', cellX: 5, cellY: 5 }] });
    send(b, { t: 'cmd', tick: 0, commands: [] });

    const tickMsg = (await ca.waitFor((m) => m.t === 'tick')) as Extract<ServerMessage, { t: 'tick' }>;
    expect(tickMsg.tick).toBe(0);
    expect(tickMsg.commandsByPlayer[1]).toHaveLength(1);
    expect(tickMsg.commandsByPlayer[2]).toHaveLength(0);
    // B 也应收到同样的广播
    const tickB = (await cb.waitFor((m) => m.t === 'tick')) as Extract<ServerMessage, { t: 'tick' }>;
    expect(tickB.commandsByPlayer[1]).toHaveLength(1);

    a.close();
    b.close();
  });
});
