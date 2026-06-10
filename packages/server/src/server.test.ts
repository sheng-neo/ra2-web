import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createGameServer, PROTOCOL_VERSION, type GameServer } from './server';

let server: GameServer;

beforeAll(async () => {
  server = await createGameServer(0);
});

afterAll(async () => {
  await server.close();
});

describe('对战服务器骨架', () => {
  it('health 返回协议版本', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ ok: true, protocol: PROTOCOL_VERSION });
  });

  it('WebSocket 连接收到 hello', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const message = await new Promise<unknown>((resolve, reject) => {
      ws.once('message', (data) => resolve(JSON.parse(String(data))));
      ws.once('error', reject);
    });
    ws.close();
    expect(message).toEqual({ type: 'hello', protocol: PROTOCOL_VERSION });
  });
});
