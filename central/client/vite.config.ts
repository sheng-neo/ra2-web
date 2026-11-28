import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import { looksLikeGlsl, minifyGlslQuasis } from './src/build/glsl-minify';

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

interface AstNode {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
}

/**
 * R4 + R5 整合（JS 预算）：构建时给 src/ 里的 GLSL 模板字符串去注释与行首尾空白（规则见 src/build/glsl-minify.ts）。
 * 在 esbuild 把 TS 转成 JS 之后跑（enforce: 'post'），用 Rollup 的解析器找模板字符串，只改静态段的 raw 文本；
 * 开发服务器不跑（apply: 'build'），three.js 自己的着色器块不碰。
 */
function minifyGlsl(): Plugin {
  const stats = { modules: 0, templates: 0, saved: 0 };
  return {
    name: 'central:minify-glsl',
    apply: 'build',
    enforce: 'post',
    transform(code, id) {
      if (!/[\\/]central[\\/]client[\\/]src[\\/].*\.ts$/.test(id.split('?')[0]!) || !code.includes('`')) return null;
      const edits: [number, number, string][] = [];
      const walk = (n: unknown): void => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) {
          for (const c of n) walk(c);
          return;
        }
        const node = n as AstNode;
        if (node.type === 'TemplateLiteral') {
          const quasis = node.quasis as (AstNode & { value: { raw: string } })[];
          if (looksLikeGlsl(quasis.map((q) => q.value.raw).join(' '))) {
            stats.templates++;
            // 整个模板一起处理（注释跨过 ${…} 时状态带到下一段）；位置对不上（不该发生）时整个模板不动
            const raws = quasis.map((q) => code.slice(q.start, q.end));
            if (raws.every((raw, k) => raw === quasis[k]!.value.raw)) {
              const mins = minifyGlslQuasis(raws);
              quasis.forEach((q, k) => {
                if (mins[k] !== raws[k]) edits.push([q.start, q.end, mins[k]!]);
              });
            }
          }
        }
        for (const [k, v] of Object.entries(node)) if (k !== 'type' && k !== 'start' && k !== 'end' && v && typeof v === 'object') walk(v);
      };
      walk(this.parse(code));
      if (!edits.length) return null;
      edits.sort((a, b) => b[0] - a[0]);
      let out = code;
      for (const [s, e, text] of edits) {
        stats.saved += e - s - text.length;
        out = out.slice(0, s) + text + out.slice(e);
      }
      stats.modules++;
      return { code: out, map: null };
    },
    buildEnd() {
      this.info(`GLSL 瘦身：${stats.modules} 个模块、${stats.templates} 段着色器，省 ${(stats.saved / 1024).toFixed(1)} KiB（未压缩字符数）`);
    },
  };
}

// 相对 base：构建产物既能挂在 /central/（与红警同一容器），也能单独托管。
export default defineConfig({
  base: './',
  plugins: [precompressCity(), minifyGlsl()],
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
