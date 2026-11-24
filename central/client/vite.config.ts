import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';

/** 地图数据（public/city/，由 pnpm citymap 生成）里要出 gzip 版的文件。 */
const CITY_DATA = ['central.json', 'terrain.bin'];

/**
 * 构建时给地图数据各出一份 .gz（原文件照常保留，供 ODbL 下载与其他用途）。
 * 生产服务器（红警的零依赖静态托管）不做 Content-Encoding 压缩，客户端改下 .gz 后自行解压，
 * 首次下载从约 1.9 MB 降到约 0.55 MB（data/load-city.ts）。
 */
function precompressCity(): Plugin {
  return {
    name: 'central:precompress-city',
    apply: 'build',
    generateBundle() {
      for (const name of CITY_DATA) {
        const file = path.resolve(import.meta.dirname, 'public/city', name);
        if (!existsSync(file)) continue; // 还没跑过 pnpm citymap：只能用 ?fixture=1
        const raw = readFileSync(file);
        this.emitFile({ type: 'asset', fileName: `city/${name}.gz`, source: gzipSync(raw, { level: 9 }) });
      }
    },
  };
}

// 相对 base：构建产物既能挂在 /central/（与红警同一容器），也能单独托管。
export default defineConfig({
  base: './',
  plugins: [precompressCity()],
  build: {
    target: 'es2022',
    // 预算按 gzip 计（PLAN §7.1：three + 游戏 JS ≤ 400 KB gzip）；three 本身压缩前就约 550 KB，
    // 默认 500 KB（未压缩）的告警没有意义。
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5174,
    host: true,
  },
});
