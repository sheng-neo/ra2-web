/**
 * 冒烟 + 截图：vite build → 仿生产的静态服务器 → Playwright（无头 Chromium，SwiftShader）打开页面，
 * 等 window.__central.ready，断言零 console error、draw call ≤ 150、三角形 ≤ 30 万（PLAN §7.2 中档）、
 * 地图数据实际下载量 ≤ 1 MB，按三种视口截图。
 *
 * 仿生产：与红警的 packages/server/src/static.ts 行为一致——产物挂在 /central/ 下，不压缩、
 * 不给 Content-Length、目录不做 301，未知路径回退到站点根的 index.html（text/html）。
 * 另外单独打开一次不带结尾斜杠的 /central，确认也能启动。
 *
 * 用法：node central/client/scripts/shoot.mjs [--no-build] [--only=fixture|city]
 * 截图目录：环境变量 SHOT_DIR（默认系统临时目录下的 central-shots）。
 * 有 dist/city/central.json 时同时测真实数据（city）与合成数据（fixture）。
 * 注意：SwiftShader 是 CPU 光栅化，帧率没有参考意义；renderer.info 的计数有。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { build } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.SHOT_DIR || path.join(os.tmpdir(), 'central-shots');
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const MAX_CALLS = 150;
const MAX_TRIANGLES = 300_000;
/** 地图数据（city/ 下的请求）实际传输字节上限：PLAN §7.1 MVP 1 MB，服务器不压缩也要满足。 */
const MAX_DATA_BYTES = 1024 * 1024;
/** 产物挂载的子路径（与 Dockerfile 一致）。 */
const MOUNT = '/central';

/** packages/server/src/static.ts 的 MIME 表（没有的类型一律 application/octet-stream）。 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const OTHER_APP = '<!doctype html><title>other app</title><p>SPA fallback</p>';

/** 仿生产静态服务器：dist 挂在 MOUNT 下，其余路径回退成别的应用的 index.html。 */
function serveLikeProduction(dist) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = url === MOUNT || url.startsWith(`${MOUNT}/`) ? path.join(dist, url.slice(MOUNT.length)) : null;
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    res.statusCode = 200;
    if (!file || !file.startsWith(dist) || !fs.existsSync(file)) {
      res.setHeader('Content-Type', MIME['.html']);
      res.end(OTHER_APP);
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720, mobile: false, presets: ['harbour', 'statue', 'aerial'] },
  { name: 'phone-land', width: 874, height: 402, mobile: true, presets: ['harbour', 'statue'] },
  { name: 'phone-port', width: 402, height: 874, mobile: true, presets: ['harbour'] },
];

const waitFrames = (page, n) =>
  page.evaluate(`new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  if (!args.includes('--no-build')) await build({ root, logLevel: 'warn' });
  const server = await serveLikeProduction(path.join(root, 'dist'));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = `${origin}${MOUNT}/`;
  const targets = [];
  if (fs.existsSync(path.join(root, 'dist/city/central.json'))) targets.push({ name: 'city', query: '' });
  else console.log('（dist/city/central.json 不存在，只测 fixture）');
  targets.push({ name: 'fixture', query: '?fixture=1' });
  const browser = await chromium.launch();
  const failures = [];
  const report = [];
  try {
    // 不带结尾斜杠：生产服务器直接回 index.html，相对路径要靠页面里补的 <base> 才不会解析到站点根
    {
      const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${origin}${MOUNT}?fixture=1`);
      await page.waitForFunction('window.__central && (window.__central.ready || window.__central.error)', null, {
        timeout: 180000,
      });
      const err = await page.evaluate('window.__central.error ?? null');
      if (err || errors.length) failures.push(`${MOUNT}（無結尾斜線）: ${err ?? errors.slice(0, 3).join(' | ')}`);
      report.push({ target: 'no-slash', url: `${MOUNT}?fixture=1`, ok: !err && errors.length === 0 });
      await page.close();
    }
    for (const t of targets.filter((x) => !only || x.name === only)) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
          isMobile: vp.mobile,
          hasTouch: vp.mobile,
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));
        const sizes = [];
        page.on('requestfinished', (r) => sizes.push(r.sizes().then((s) => ({ url: r.url(), bytes: s.responseBodySize }))));
        const t0 = Date.now();
        await page.goto(base + t.query);
        await page.waitForFunction('window.__central && (window.__central.ready || window.__central.error)', null, {
          timeout: 180000,
        });
        const err = await page.evaluate('window.__central.error ?? null');
        if (err) failures.push(`${t.name}/${vp.name}: 啟動錯誤 ${err}`);
        const loadMs = Date.now() - t0;
        const done = await Promise.all(sizes);
        const totalBytes = done.reduce((n, s) => n + s.bytes, 0);
        const dataBytes = done.filter((s) => s.url.includes('/city/')).reduce((n, s) => n + s.bytes, 0);
        if (dataBytes > MAX_DATA_BYTES) failures.push(`${t.name}/${vp.name}: 地圖數據下載 ${dataBytes} B > ${MAX_DATA_BYTES}`);
        // 等加载层淡出
        await page.waitForTimeout(900);
        for (const preset of vp.presets) {
          await page.evaluate(`window.__central.setView(${JSON.stringify(preset)}, true)`);
          await waitFrames(page, 3);
          const stats = await page.evaluate('window.__central.stats()');
          const file = path.join(outDir, `${t.name}-${vp.name}-${preset}.png`);
          await page.screenshot({ path: file });
          report.push({ target: t.name, viewport: vp.name, preset, loadMs, totalBytes, dataBytes, ...stats });
          if (stats.calls > MAX_CALLS) failures.push(`${t.name}/${vp.name}/${preset}: draw calls ${stats.calls} > ${MAX_CALLS}`);
          if (stats.triangles > MAX_TRIANGLES) {
            failures.push(`${t.name}/${vp.name}/${preset}: 三角形 ${stats.triangles} > ${MAX_TRIANGLES}`);
          }
        }
        const summary = await page.evaluate('window.__central.summary()');
        report.push({ target: t.name, viewport: vp.name, summary });
        if (errors.length) failures.push(`${t.name}/${vp.name}: console error ×${errors.length}: ${errors.slice(0, 3).join(' | ')}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  for (const r of report) console.log(JSON.stringify(r));
  console.log(`截圖：${outDir}`);
  if (failures.length) {
    console.error(`失敗 ${failures.length} 項：\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('全部通過');
  }
}

await run();
