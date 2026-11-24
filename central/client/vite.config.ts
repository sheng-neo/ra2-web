import { defineConfig } from 'vite';

// 相对 base：构建产物既能挂在 /central/（与红警同一容器），也能单独托管。
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  server: {
    port: 5174,
    host: true,
  },
});
