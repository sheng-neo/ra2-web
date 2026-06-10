import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { decodeMessage, encodeMessage, PROTOCOL_VERSION, type ClientMessage } from '@ra2web/game';
import { Room } from './room';

export { PROTOCOL_VERSION };

export interface GameServer {
  port: number;
  rooms: Map<string, Room>;
  close(): Promise<void>;
}

/**
 * 对战服务器：HTTP /health + WebSocket 大厅/房间锁步中继。
 * 一条连接加入一个房间（默认 'lobby'），房间满 2 人且都 ready 即开局。
 */
export function createGameServer(port = 0): Promise<GameServer> {
  const rooms = new Map<string, Room>();

  const http: Server = createServer((req, res) => {
    if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.size }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const wss = new WebSocketServer({ server: http });

  wss.on('connection', (socket: WebSocket) => {
    let room: Room | null = null;
    let playerId = 0;

    const send = (s: WebSocket, msg: Parameters<typeof encodeMessage>[0]): void => {
      if (s.readyState === s.OPEN) s.send(encodeMessage(msg));
    };

    socket.on('message', (data) => {
      let msg: ClientMessage;
      try {
        msg = decodeMessage<ClientMessage>(String(data));
      } catch {
        send(socket, { t: 'error', message: '消息解析失败' });
        return;
      }

      if (msg.t === 'join') {
        if (room) return;
        if (msg.protocol !== PROTOCOL_VERSION) {
          send(socket, { t: 'error', message: `协议版本不匹配（服务器 ${PROTOCOL_VERSION}）` });
          return;
        }
        const roomName = msg.room || 'lobby';
        let r = rooms.get(roomName);
        if (!r) {
          r = new Room(roomName);
          rooms.set(roomName, r);
        }
        if (r.started) {
          send(socket, { t: 'error', message: '该房间对局已开始' });
          return;
        }
        room = r;
        const client = r.addClient((m) => send(socket, m), msg.name);
        playerId = client.playerId;
        return;
      }

      if (room && playerId) room.handle(playerId, msg);
    });

    const cleanup = (): void => {
      if (room && playerId) {
        room.removeClient(playerId);
        if (room.empty) rooms.delete(room.name);
      }
      room = null;
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });

  return new Promise((resolvePort, reject) => {
    http.once('error', reject);
    http.listen(port, () => {
      const address = http.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('无法获取监听端口'));
        return;
      }
      resolvePort({
        port: address.port,
        rooms,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            for (const client of wss.clients) client.terminate();
            wss.close(() => http.close((err) => (err ? rejectClose(err) : resolveClose())));
          }),
      });
    });
  });
}
