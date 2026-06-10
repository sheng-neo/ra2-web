import { createGameServer } from './server';

const port = Number(process.env.PORT ?? 7301);
const server = await createGameServer(port);
console.log(`[ra2web] 对战服务器已启动: http://localhost:${server.port}/health`);
