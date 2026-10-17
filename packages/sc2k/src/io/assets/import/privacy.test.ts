// WP14 验收：隐私红线（spec:file-formats §3.9.2、ARCHITECTURE §9.4）——根 eslint.config.js 存在 io/assets 的网络禁令规则，
// 且 src/io/assets/** 的生产代码里没有任何网络 API 引用（grep 断言；测试文件自身除外）。
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assetsRoot = resolve(here, '..');
const repoRoot = resolve(assetsRoot, '../../../../..');

function* walk(p: string): Generator<string> {
  for (const e of readdirSync(p).sort()) {
    const full = join(p, e);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) yield full;
  }
}

/** 网络 API / 网络模块的文本特征（含动态 import 与 URL 字面量）。 */
const FORBIDDEN: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'fetch()', re: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', re: /\bWebSocket\b/ },
  { name: 'EventSource', re: /\bEventSource\b/ },
  { name: 'RTCPeerConnection', re: /\bRTCPeerConnection\b/ },
  { name: 'sendBeacon', re: /\bsendBeacon\b/ },
  { name: 'node 网络模块', re: /from\s+['"](node:)?(http|https|http2|net|dgram|tls)['"]/ },
  { name: '第三方网络库', re: /from\s+['"](undici|axios|node-fetch|ws|socket\.io-client)['"]/ },
  { name: 'require 网络模块', re: /require\s*\(\s*['"](node:)?(http|https|http2|net|dgram|tls|undici|axios|node-fetch|ws)['"]\s*\)/ },
  { name: '动态 import URL', re: /import\s*\(\s*['"`]https?:/ },
  { name: 'http(s) URL 字面量', re: /['"`]https?:\/\//i },
  { name: 'navigator.onLine / connection', re: /navigator\s*\.\s*(onLine|connection)\b/ },
];

describe('io/assets 隐私红线', () => {
  it('根 eslint.config.js 含 io/assets 的网络模块与网络全局禁令', () => {
    const cfg = readFileSync(join(repoRoot, 'eslint.config.js'), 'utf8');
    expect(cfg).toContain('SC2K_NET_MODULES');
    expect(cfg).toContain('io/assets 禁止网络 I/O');
    expect(cfg).toMatch(/files:\s*\[`\$\{SC2K\}\/io\/assets\/\*\*\/\*\.ts`\]/);
    for (const g of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection']) expect(cfg).toContain(`{ name: '${g}', message: 'io/assets 禁止网络 I/O`);
    expect(cfg).toContain("{ object: 'navigator', property: 'sendBeacon'");
    for (const m of ['undici', 'axios', 'node-fetch', 'ws', 'socket.io-client', 'node:https']) expect(cfg).toContain(`'${m}'`);
  });

  it('src/io/assets/** 生产代码中没有任何网络 API 引用', () => {
    const files = [...walk(assetsRoot)];
    expect(files.length).toBeGreaterThanOrEqual(15);
    for (const required of ['index.ts', 'import/panel.ts', 'import/store.ts', 'import/worker.ts', 'sprites/archive.ts', 'sprites/provider.ts', 'palette/bmp.ts']) {
      expect(files.map((f) => relative(assetsRoot, f))).toContain(required);
    }
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const { name, re } of FORBIDDEN) {
        const m = re.exec(src);
        if (m) hits.push(`${relative(assetsRoot, f)}: ${name} → ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('面板与存储只把字节交给 IndexedDB / Worker（不碰 localStorage / 剪贴板 / URL）', () => {
    for (const f of ['import/panel.ts', 'import/store.ts', 'import/decodeClient.ts']) {
      const src = readFileSync(join(assetsRoot, f), 'utf8');
      expect(src, f).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|navigator\s*\.\s*clipboard|\blocation\s*\.\s*(href|hash|search)\b|URLSearchParams/);
    }
  });
});
