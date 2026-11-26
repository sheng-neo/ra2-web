/**
 * 冒烟 + 截图：vite build → 仿生产的静态服务器 → Playwright（无头 Chromium，SwiftShader）打开页面，
 * 等 window.__central.ready，按三种视口截图并断言（写实化 realism spec §v 的两档预算）：
 * - 零 console error；地图数据实际下载量 ≤ 1 MB；
 * - draw call ≤ 150（每个机位、两档都是）；三角形 HIGH ≤ 75 万（R2 细节一轮由 60 万上调）、LOW ≤ 30 万（按 stats().tier 判档）；
 * - 全分辨率后处理 pass ≤ 2（stats().passesFull）；
 * - LOW 档（?q=low#q-low，另跑一轮）：stats().tier === 'low'、bloom 与平面反射都关；
 * - 手机横屏按 iPhone 的 DPR 2、桌面按 2560×1440 各再跑一次：GPU 贴图 + 渲染目标 + 画布 ≤ 64 MB（stats().texMB），
 *   起始 buffer > 1.2 Mpx 时不开 MSAA。
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
/** 三角形上限：HIGH（iPhone 17 / 桌面）75 万（R2 细节一轮：LOD2 + 电车 + 街头生活，由 60 万上调）、LOW 30 万。 */
const MAX_TRIANGLES = { high: 750_000, low: 300_000 };
/** 全分辨率后处理 pass 上限（bloom 在半分辨率以下，不计）。 */
const MAX_PASSES_FULL = 2;
/** GPU 贴图 + 渲染目标内存上限（MB，手机 DPR 2）。 */
const MAX_TEX_MB = 64;
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
  // iPhone 17 横屏的真实像素（DPR 2 → 1748×804 ≈ 1.4 Mpx）：查显存账本与 MSAA 规则
  { name: 'phone-dpr2', width: 874, height: 402, mobile: true, dsf: 2, presets: ['harbour'], memCheck: true, onlyCity: true },
  // 1440p 桌面窗口：CSS 尺寸本身就超过 HIGH 的 buffer 上限，DPR 要降到 1 以下才守得住 64 MB（含画布）
  { name: 'desktop-1440', width: 2560, height: 1440, mobile: false, presets: ['harbour'], memCheck: true, onlyCity: true },
];

/** 画质档轮次：auto（URL 不指定，能力探测；无头 Chromium 一般是 HIGH）与 LOW（?q=low#q-low，只测真实数据）。 */
const RUNS = [
  { name: 'auto', query: '', hash: '' },
  { name: 'low', query: 'q=low', hash: '#q-low', onlyCity: true, viewports: ['desktop', 'phone-land'] },
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
    for (const run of RUNS) for (const t of targets.filter((x) => !only || x.name === only)) {
      if (run.onlyCity && t.name !== 'city') continue;
      for (const vp of VIEWPORTS) {
        if (run.viewports && !run.viewports.includes(vp.name)) continue;
        if (vp.onlyCity && (t.name !== 'city' || run.name !== 'auto')) continue;
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.dsf ?? 1,
          isMobile: vp.mobile,
          hasTouch: vp.mobile,
        });
        const tag = `${t.name}/${run.name}/${vp.name}`;
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));
        const sizes = [];
        page.on('requestfinished', (r) => sizes.push(r.sizes().then((s) => ({ url: r.url(), bytes: s.responseBodySize }))));
        const t0 = Date.now();
        const qs = [t.query.replace(/^\?/, ''), run.query].filter(Boolean).join('&');
        await page.goto(`${base}${qs ? `?${qs}` : ''}${run.hash}`);
        await page.waitForFunction('window.__central && (window.__central.ready || window.__central.error)', null, {
          timeout: 180000,
        });
        const err = await page.evaluate('window.__central.error ?? null');
        if (err) failures.push(`${tag}: 啟動錯誤 ${err}`);
        const loadMs = Date.now() - t0;
        const done = await Promise.all(sizes);
        const totalBytes = done.reduce((n, s) => n + s.bytes, 0);
        const dataBytes = done.filter((s) => s.url.includes('/city/')).reduce((n, s) => n + s.bytes, 0);
        if (dataBytes > MAX_DATA_BYTES) failures.push(`${tag}: 地圖數據下載 ${dataBytes} B > ${MAX_DATA_BYTES}`);
        // 等加载层淡出
        await page.waitForTimeout(900);
        for (const preset of vp.presets) {
          await page.evaluate(`window.__central.setView(${JSON.stringify(preset)}, true)`);
          await waitFrames(page, 3);
          const stats = await page.evaluate('window.__central.stats()');
          const file = path.join(outDir, `${t.name}-${run.name}-${vp.name}-${preset}.png`);
          await page.screenshot({ path: file });
          report.push({ target: t.name, run: run.name, viewport: vp.name, preset, loadMs, totalBytes, dataBytes, ...stats });
          const at = `${tag}/${preset}`;
          if (stats.calls > MAX_CALLS) failures.push(`${at}: draw calls ${stats.calls} > ${MAX_CALLS}`);
          const triCap = MAX_TRIANGLES[stats.tier] ?? MAX_TRIANGLES.low;
          if (stats.triangles > triCap) failures.push(`${at}: 三角形 ${stats.triangles} > ${triCap}（${stats.tier}）`);
          if (!(stats.passesFull <= MAX_PASSES_FULL)) failures.push(`${at}: 全分辨率 pass ${stats.passesFull} > ${MAX_PASSES_FULL}`);
          if (run.name === 'low') {
            if (stats.tier !== 'low') failures.push(`${at}: 畫質檔 ${stats.tier}，應為 low`);
            if (stats.bloom !== false) failures.push(`${at}: LOW 檔不應開 bloom`);
            if (stats.reflection !== false) failures.push(`${at}: LOW 檔不應開平面反射`);
          }
          if (vp.memCheck) {
            if (!(stats.texMB <= MAX_TEX_MB)) failures.push(`${at}: GPU 貼圖 ${stats.texMB} MB > ${MAX_TEX_MB}`);
            if (stats.tier === 'high' && stats.bufferPx > 1.2e6 && stats.msaa !== 0) failures.push(`${at}: 起始 buffer ${stats.bufferPx} px > 1.2 Mpx 卻開了 MSAA ${stats.msaa}`);
          }
        }
        const summary = await page.evaluate('window.__central.summary()');
        report.push({ target: t.name, run: run.name, viewport: vp.name, summary });
        if (errors.length) failures.push(`${tag}: console error ×${errors.length}: ${errors.slice(0, 3).join(' | ')}`);
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
