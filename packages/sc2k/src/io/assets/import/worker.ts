// ===== io/assets/import/worker.ts =====（ARCHITECTURE §8.4 / §9.3）
// 解码 Worker 入口：收到 decode 请求 → decodeBundle → 把图集页以 transfer 方式送回。无网络、无 DOM；字节只在本 Worker 与主线程之间流动。
import { handleDecodeRequest, isDecodeRequest } from './protocol';

const scope = self as unknown as {
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
};

scope.addEventListener('message', (e) => {
  if (!isDecodeRequest(e.data)) return;
  const { response, transfer } = handleDecodeRequest(e.data);
  scope.postMessage(response, transfer);
});
