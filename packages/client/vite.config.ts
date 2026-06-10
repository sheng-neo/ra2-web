import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DATA_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../game-data');

/**
 * 开发期把仓库根的 game-data/（玩家自备的红警2文件）以 /game-data/* 暴露给浏览器。
 * 支持 HTTP Range，便于后续按需读取大体积 .mix 的片段。
 */
function gameDataPlugin(): Plugin {
  return {
    name: 'ra2web:serve-game-data',
    configureServer(server) {
      server.middlewares.use('/game-data', (req, res) => {
        const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const filePath = normalize(join(GAME_DATA_DIR, urlPath));
        if (
          !filePath.startsWith(GAME_DATA_DIR) ||
          !existsSync(filePath) ||
          !statSync(filePath).isFile()
        ) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const size = statSync(filePath).size;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'application/octet-stream');

        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
        let start = 0;
        let end = size - 1;
        if (range) {
          start = Number(range[1]);
          end = range[2] ? Number(range[2]) : end;
          if (start > end || end >= size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${size}`);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        }
        res.setHeader('Content-Length', end - start + 1);
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        createReadStream(filePath, { start, end }).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [gameDataPlugin()],
  build: {
    target: 'es2022',
  },
  server: {
    port: 5173,
    host: true,
  },
});
