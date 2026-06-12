/**
 * WebSocket 客户端封装：连接对战服务器，收发协议消息。
 */
import {
  decodeMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from '@ra2web/game';

export class NetClient {
  private ws: WebSocket | null = null;
  onMessage: ((msg: ServerMessage) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  connect(url: string): Promise<void> {
    // 重复 connect 防僵尸：关掉旧连接，且旧 socket 的事件不再上抛
    // （否则旧连接仍挂在服务器房间里占位，"全员准备"永远凑不齐）
    const old = this.ws;
    this.ws = null;
    old?.close();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.addEventListener('open', () => {
        if (this.ws === ws) this.onOpen?.();
        resolve();
      });
      ws.addEventListener('error', () => reject(new Error('无法连接服务器')));
      ws.addEventListener('close', () => {
        if (this.ws === ws) this.onClose?.();
      });
      ws.addEventListener('message', (e) => {
        if (this.ws !== ws) return;
        try {
          this.onMessage?.(decodeMessage<ServerMessage>(String(e.data)));
        } catch {
          /* 忽略坏消息 */
        }
      });
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeMessage(msg));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

/**
 * 默认服务器地址：
 * - 开发期（Vite 在 5173）：服务器单独跑在 7301
 * - 生产期（服务器同端口托管客户端）：同源 ws/wss
 */
export function defaultServerUrl(): string {
  const host = location.hostname || 'localhost';
  if (location.port === '5173') return `ws://${host}:7301`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}
