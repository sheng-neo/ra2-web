import { defineConfig } from 'vite';

/**
 * packages/sc2k 的 Vite 配置（ARCHITECTURE §2.3）：
 *  - base './'：产物可放任何静态路径；
 *  - 无自定义中间件、不开 COOP/COEP（本项目不用 SharedArrayBuffer）；
 *  - worker.format 'es'：art Worker 以 ES 模块加载；
 *  - 端口 5174（与 packages/client 的 5173 并行开发不冲突）。
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: ['pixi.js'],
  },
  server: {
    port: 5174,
    host: true,
  },
  preview: {
    port: 5174,
    host: true,
  },
});
