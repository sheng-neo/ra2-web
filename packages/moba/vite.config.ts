import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 普通构建 → dist/（多文件，随主站部署到 /moba/）
// `--mode single` → dist-single/index.html（JS/CSS 全内联的单文件，可离线打开或嵌入任意页面）
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 4000,
    // 只有一个入口块，用不上 modulepreload 的兼容垫片；去掉它，产物里就不含任何 fetch 调用(受限宿主的 CSP 禁止一切外部请求)
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5183,
    host: true,
  },
}));
