/**
 * 静态文件服务（生产模式）：服务器在同一端口托管构建好的客户端 +
 * WebSocket，玩家只需一个 URL、无跨域、WS 同源。零依赖。
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

/**
 * 尝试以静态文件响应请求。命中返回 true。
 * SPA 回退：未知路径返回 index.html（hash 路由）。
 */
export function serveStatic(rootDir: string, req: IncomingMessage, res: ServerResponse): boolean {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
  let filePath = normalize(join(rootDir, urlPath));
  if (!filePath.startsWith(rootDir)) {
    res.statusCode = 403;
    res.end();
    return true;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    const indexCandidate = join(filePath, 'index.html');
    if (existsSync(indexCandidate)) {
      filePath = indexCandidate;
    } else {
      // SPA 回退
      filePath = join(rootDir, 'index.html');
      if (!existsSync(filePath)) return false;
    }
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
  createReadStream(filePath).pipe(res);
  return true;
}
