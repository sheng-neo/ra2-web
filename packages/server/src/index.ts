import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './server';

const port = Number(process.env.PORT ?? 7301);

// 生产模式：托管构建好的客户端（STATIC_DIR，或自动探测 packages/client/dist）
const here = fileURLToPath(new URL('.', import.meta.url));
const autoStatic = resolve(here, '../../client/dist');
const staticDir = process.env.STATIC_DIR ?? (existsSync(autoStatic) ? autoStatic : undefined);

const server = await createGameServer(port, { staticDir });
console.log(`[ra2web] 对战服务器已启动: http://localhost:${server.port}/`);
if (staticDir) console.log(`[ra2web] 托管客户端: ${staticDir}`);
else console.log('[ra2web] 仅 WS 中继（未构建客户端；开发期用 pnpm dev:client）');
