import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';

export const PROTOCOL_VERSION = 1;

export interface GameServer {
  /** 实际监听端口（传 0 时由系统分配）。 */
  port: number;
  close(): Promise<void>;
}

/**
 * 对战服务器骨架：HTTP /health + WebSocket 握手。
 * M7 将在此之上实现大厅/房间与锁步 tick 中继。
 */
export function createGameServer(port = 0): Promise<GameServer> {
  const http: Server = createServer((req, res) => {
    if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const wss = new WebSocketServer({ server: http });
  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION }));
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
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            for (const client of wss.clients) client.terminate();
            wss.close(() => {
              http.close((err) => (err ? rejectClose(err) : resolveClose()));
            });
          }),
      });
    });
  });
}
