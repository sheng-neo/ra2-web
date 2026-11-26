/**
 * 冒烟 + 截图：vite build → 仿生产的静态服务器 → Playwright（无头 Chromium，SwiftShader）打开页面，
 * 等 window.__central.ready，按三种视口截图并断言（写实化 realism spec §v 的两档预算）：
 * - 零 console error；首帧前的地图数据实际下载量 ≤ 2.5 MiB（R3 起；city/facades/ 下流式加载的贴面贴图另计，单独报告）；
 * - draw call ≤ 150（每个机位、两档都是）；三角形 HIGH ≤ 75 万（R2 细节一轮由 60 万上调）、LOW ≤ 30 万（按 stats().tier 判档）；
 * - 全分辨率后处理 pass ≤ 2（stats().passesFull）；
 * - LOW 档（?q=low#q-low，另跑一轮）：stats().tier === 'low'、bloom 与平面反射都关；
 * - 手机横屏按 iPhone 的 DPR 2、桌面按 2560×1440 各再跑一次：等贴面加载完（__central.facadesIdle）后
 *   GPU 贴图 + 渲染目标 + 画布（stats().texMB）手机 ≤ 128 MB、1440p ≤ 160 MB（R3 真实贴面），LOW 档 ≤ 64 MB
 *   （LOW 另跑 1280×720 @2，画布 4× MSAA 最吃显存的一种）；
 *   起始 buffer > 1.2 Mpx 时不开 MSAA。
 *
 * 仿生产：与红警的 packages/server/src/static.ts 行为一致——产物挂在 /central/ 下，不压缩、
 * 不给 Content-Length、目录不做 301，未知路径回退到站点根的 index.html（text/html）。
 * 另外单独打开一次不带结尾斜杠的 /central，确认也能启动。
 *
 * R3 复审修正后另加三项：
 * - 红线词扫描：构建产物的 JS 里不得出现 citymap/src/redlines.ts 的词（真实企业 / 楼宇名、某游戏系列名）；
 * - 贴面 404：city/facades/ 一律回 404 时最多 1 条 console error（熔断：远景图集失败就不再请求近景页），facadesIdle 照样兑现；
 * - 窗口变大：手机 874×402 @2 开场后把窗口拉到 1280×720，DPR 按档位上限重新封顶，显存账本 ≤ 160 MB（拉大后是桌面级窗口）。
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
import { Buffer } from 'node:buffer';
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
/** GPU 贴图 + 渲染目标内存上限（MB）：HIGH 手机 DPR 2、HIGH 2560×1440 桌面、LOW（R3 真实贴面预算）。 */
const MAX_TEX_MB = { phone: 128, desktop: 160, low: 64 };
/** 首帧前地图数据（city/ 下、city/facades/ 以外的请求）实际传输字节上限：R3 起 2.5 MiB，服务器不压缩也要满足。 */
const MAX_DATA_BYTES = 2.5 * 1024 * 1024;
/** 流式加载的贴面贴图（city/facades/）：只报告，不计入首帧前的下载。 */
const isFacade = (url) => url.includes('/city/facades/');
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
  { name: 'phone-dpr2', width: 874, height: 402, mobile: true, dsf: 2, presets: ['harbour', 'statue'], memCheck: 'phone', onlyCity: true },
  // 1440p 桌面窗口：CSS 尺寸本身就超过 HIGH 的 buffer 上限，DPR 要降到 1 以下才守得住 64 MB（含画布）
  { name: 'desktop-1440', width: 2560, height: 1440, mobile: false, presets: ['harbour', 'statue'], memCheck: 'desktop', onlyCity: true },
  // LOW 档最吃显存的一种（R3 整合）：1280×720 @2 的画布 4× MSAA；只在 LOW 轮跑，账本 ≤ 64 MB
  { name: 'desktop-dpr2', width: 1280, height: 720, mobile: false, dsf: 2, presets: ['harbour'], memCheck: 'low', lowOnly: true },
];

/** 画质档轮次：auto（URL 不指定，能力探测；无头 Chromium 一般是 HIGH）与 LOW（?q=low#q-low，只测真实数据）。 */
const RUNS = [
  { name: 'auto', query: '', hash: '' },
  { name: 'low', query: 'q=low', hash: '#q-low', onlyCity: true, viewports: ['desktop', 'phone-land', 'desktop-dpr2'] },
];

const waitFrames = (page, n) =>
  page.evaluate(`new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

/** citymap/src/redlines.ts 的红线词（明文词条 + base64 词条），按文本解析（不引 TS）。 */
function redlineWords() {
  const src = fs.readFileSync(path.join(root, '../citymap/src/redlines.ts'), 'utf8');
  const enc = [...(src.match(/const ENCODED = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => Buffer.from(m[1], 'base64').toString('utf8'));
  const body = src.split('export const BLACKLIST')[1]?.split('];')[0] ?? '';
  const plain = [...body.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  return [...plain, ...enc];
}

/**
 * 构建产物里命中红线词的 JS 片段（最多 10 条）。按词表原样的大小写匹配（不像数据检查那样不分大小写）：
 * 压缩后的 three.js 着色器代码里有 vClipPosition 之类的标识符，不分大小写会把「Lippo」误报出来。
 */
function scanDist(dist) {
  const words = redlineWords();
  const hits = [];
  const dir = path.join(dist, 'assets');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.js')) : []) {
    const js = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const w of words) if (js.includes(w)) hits.push(`${f}: ${w}`);
  }
  return hits.slice(0, 10);
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  if (!args.includes('--no-build')) await build({ root, logLevel: 'warn' });
  const redHits = scanDist(path.join(root, 'dist'));
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
  if (redHits.length) failures.push(`構建產物含紅線詞：${redHits.join(' | ')}`);
  try {
    if (targets.some((t) => t.name === 'city') && (!only || only === 'city')) {
      // 贴面文件全部 404：最多 1 条 console error，facadesIdle 照样兑现（熔断，见 facades/streamer.ts）
      const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      let facadeReq = 0;
      await page.route('**/city/facades/**', (r) => {
        facadeReq++;
        return r.fulfill({ status: 404, body: '' });
      });
      await page.goto(base);
      await page.waitForFunction('window.__central && (window.__central.ready || window.__central.error)', null, { timeout: 180000 });
      await page.evaluate(`window.__central.setView('statue', true)`);
      const idle = await page.evaluate('Promise.race([window.__central.facadesIdle?.().then(() => true) ?? Promise.resolve(true), new Promise((r) => setTimeout(() => r(false), 60000))])');
      await page.waitForTimeout(3000);
      if (errors.length > 1 || !idle) failures.push(`city/facades-404: console error ×${errors.length}（≤ 1）、idle ${idle}、請求 ${facadeReq} 次`);
      report.push({ target: 'facades-404', errors: errors.length, idle, requests: facadeReq });
      await page.close();
      // 窗口变大：DPR 重新封顶，显存仍在手机上限内
      const ctx = await browser.newContext({ viewport: { width: 874, height: 402 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const p2 = await ctx.newPage();
      const e2 = [];
      p2.on('console', (m) => m.type() === 'error' && e2.push(m.text()));
      await p2.goto(base);
      await p2.waitForFunction('window.__central && (window.__central.ready || window.__central.error)', null, { timeout: 180000 });
      await p2.setViewportSize({ width: 1280, height: 720 });
      await waitFrames(p2, 4);
      await p2.evaluate('Promise.race([window.__central.facadesIdle?.() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 60000))])');
      const st = await p2.evaluate('window.__central.stats()');
      // 拉大后是桌面级窗口（平板 / 折叠屏 / 桌面浏览器）：按桌面上限 160 MB 断言（贴面份额仍是手机的）
      if (!(st.texMB <= MAX_TEX_MB.desktop) || e2.length) failures.push(`city/resize 874×402@2 → 1280×720: GPU ${st.texMB} MB（≤ ${MAX_TEX_MB.desktop}）、buffer ${st.bufferPx} px、dpr ${st.dpr}、console error ×${e2.length}`);
      report.push({ target: 'resize', texMB: st.texMB, bufferPx: st.bufferPx, dpr: st.dpr });
      await ctx.close();
    }
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
        if (vp.lowOnly && run.name !== 'low') continue;
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
        const dataBytes = done.filter((s) => s.url.includes('/city/') && !isFacade(s.url)).reduce((n, s) => n + s.bytes, 0);
        if (dataBytes > MAX_DATA_BYTES) failures.push(`${tag}: 地圖數據下載 ${dataBytes} B > ${MAX_DATA_BYTES}`);
        // 等加载层淡出
        await page.waitForTimeout(900);
        for (const preset of vp.presets) {
          await page.evaluate(`window.__central.setView(${JSON.stringify(preset)}, true)`);
          await waitFrames(page, 3);
          // 真实贴面（R3）：查显存与截图前等视野要的贴面页到齐（最多 60 s）
          if (t.name === 'city') {
            await page.evaluate('Promise.race([window.__central.facadesIdle?.() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 60000))])');
            await waitFrames(page, 2);
          }
          const stats = await page.evaluate('window.__central.stats()');
          const facadeBytes = (await Promise.all(sizes)).filter((s) => isFacade(s.url)).reduce((n, s) => n + s.bytes, 0);
          const file = path.join(outDir, `${t.name}-${run.name}-${vp.name}-${preset}.png`);
          await page.screenshot({ path: file });
          report.push({ target: t.name, run: run.name, viewport: vp.name, preset, loadMs, totalBytes, dataBytes, streamedFacadeBytes: facadeBytes, ...stats });
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
          if (run.name === 'low' && t.name === 'city' && !(stats.texMB <= MAX_TEX_MB.low)) failures.push(`${at}: GPU 貼圖 ${stats.texMB} MB > ${MAX_TEX_MB.low}（LOW）`);
          if (vp.memCheck) {
            if (!(stats.texMB <= MAX_TEX_MB[vp.memCheck])) failures.push(`${at}: GPU 貼圖 ${stats.texMB} MB > ${MAX_TEX_MB[vp.memCheck]}`);
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
  // 首帧前的地图数据与首帧后流式加载的贴面贴图分开报告（R3）
  for (const r of report.filter((x) => x.preset && x.dataBytes !== undefined)) {
    console.log(`數據 ${r.target}/${r.run}/${r.viewport}/${r.preset}: 首幀前 ${r.dataBytes} B；貼面串流 ${r.streamedFacadeBytes ?? 0} B；GPU ${r.texMB} MB（貼面 ${r.facadeMB ?? 0} MB）`);
  }
  console.log(`截圖：${outDir}`);
  if (failures.length) {
    console.error(`失敗 ${failures.length} 項：\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('全部通過');
  }
}

await run();
