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
  },
  server: {
    port: 5183,
    host: true,
  },
}));
