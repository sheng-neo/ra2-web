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
 *   豁免只有两种，都按出处与次数：src/render/streets/transit-data.ts 字符串字面量里的楼宇 / 企业 / 政府地点名（真实站名、路线目的地，
 *   负责人拍板 D2，2026-11-26），以及六座地标的真名（负责人 D6，2026-11-27：redlines.ts 的 LANDMARK_REAL_NAMES 那 12 个字符串，
 *   客户端里只有 src/dev/fixture.ts 的地标名用到）：扫描前把产物里逐字相同的这些字面量（连引号）换成 ""，每个值最多换掉它在
 *   transit-data.ts 里出现的次数，多出来的（别处用了同一个字符串）算失败；D6 的名字在合成城市的 fixture chunk 里须与 fixture.ts 逐个相等；
 *   游戏系列名不豁免；
 *   其余位置出现红线词照样失败（见 scanDist）；
 * - 贴面 404：city/facades/ 一律回 404 时最多 1 条 console error（熔断：远景图集失败就不再请求近景页），facadesIdle 照样兑现；
 *   R5 起 city/landmarks/ 一并 404（地标远景网格失败就不再请求图集），合计最多 2 条；
 * - 窗口变大：手机 874×402 @2 开场后把窗口拉到 1280×720，DPR 按档位上限重新封顶，显存账本 ≤ 160 MB（拉大后是桌面级窗口）。
 *
 * R4 电车走廊高清街面层：手机 DPR 2 与 1440p 两轮另加「電車」街面机位（高清页与 R3 页共用近景池，显存照样按上面的上限查）；
 * 等贴面到齐后视野要的高清页不能还缺（stats().hiresPending = 0）；LOW 档不载高清（hiresMB = 0）；报告高清显存与已下载字节。
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
/**
 * R4：每档账本至少留这么多余量（MB；R4 时手机还余 1.9 MB）。R4 + R5 整合复审修正：手机降到 0.5 MB——R5 地标图集（ETC2 1024²，1.3 MB，
 * R5 预算里本来就有）并入后参考手机 874×402 @2 的账本 127.4 MB（≤ 128），整合时为守 1.5 MB 给所有触屏设备的 HIGH 档加的
 * 1.34 Mpx buffer 上限（参考手机 DPR 2 → 1.95、平板一律降 DPR）改动了 R1 起的 DPR 规则，复审后撤掉；要恢复 1.5 MB 余量得在手机上
 * 让出别的显存（例如少一层高清页），留给负责人定。
 * 贴面（远景图集 + 近景池 + 高清页 + 辅助图）各档份额上限（MB）：
 * 导演规格给贴面的份额是 70 / 85 / 16.5、街道 +6 MB；整合后 HIRES 用了 74.7 / 86.7（共用近景池：桌面 11 + 5 层、手机 9 + 4 层），
 * STREET 只用了 1.3 MB，合计仍在总上限内且余量（R4 时）≥ 1.5 MB，所以份额按实际分配记为 75 / 87 / 16.5（总上限与余量照旧断言）。
 */
const TEX_MARGIN_MB = { phone: 0.5, desktop: 1.5, low: 1.5 };
const MAX_FACADE_MB = { phone: 75, desktop: 87, low: 16.5 };
/** 首帧前地图数据（city/ 下、city/facades/ 以外的请求）实际传输字节上限：R3 起 2.5 MiB，服务器不压缩也要满足。 */
const MAX_DATA_BYTES = 2.5 * 1024 * 1024;
/** 流式加载的贴面贴图（city/facades/）与 R5 地标网格 / 图集（city/landmarks/）：首帧之后才下载，只报告，不计入首帧前的下载。 */
const isFacade = (url) => url.includes('/city/facades/') || url.includes('/city/landmarks/');
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
  // R4 + R5 整合复审：1280×720 @1（MSAA 2）的起始渲染目标 41 MiB，地标用全分辨率图集（landmarks/format.ts desktopAtlasRes），账本照桌面上限查
  { name: 'desktop', width: 1280, height: 720, mobile: false, presets: ['harbour', 'statue', 'aerial'], memCheck: 'desktop' },
  { name: 'phone-land', width: 874, height: 402, mobile: true, presets: ['harbour', 'statue'] },
  { name: 'phone-port', width: 402, height: 874, mobile: true, presets: ['harbour'] },
  // iPhone 17 横屏的真实像素（DPR 2 → 1748×804 ≈ 1.4 Mpx）：查显存账本与 MSAA 规则
  { name: 'phone-dpr2', width: 874, height: 402, mobile: true, dsf: 2, presets: ['harbour', 'statue', 'tram'], memCheck: 'phone', onlyCity: true },
  // 1440p 桌面窗口：CSS 尺寸本身就超过 HIGH 的 buffer 上限，DPR 要降到 1 以下才守得住 64 MB（含画布）
  { name: 'desktop-1440', width: 2560, height: 1440, mobile: false, presets: ['harbour', 'statue', 'tram'], memCheck: 'desktop', onlyCity: true },
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

/**
 * citymap/src/redlines.ts 的红线词，按文本解析（不引 TS）：plain 是明文词条（真实企业 / 楼宇名），
 * series 是 base64 词条（某游戏系列名，D2 不放开）。
 */
function redlineWords() {
  const src = fs.readFileSync(path.join(root, '../citymap/src/redlines.ts'), 'utf8');
  const series = [...(src.match(/const ENCODED = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => Buffer.from(m[1], 'base64').toString('utf8'));
  const body = src.split('export const BLACKLIST')[1]?.split('];')[0] ?? '';
  const plain = [...body.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  return { plain, series };
}

/**
 * 负责人 D6：redlines.ts 里 LANDMARK_REAL_NAMES 的 12 个字符串（六座地标的繁中 / 英文真名），按文本解析（不引 TS）。
 */
function landmarkRealNames() {
  const src = fs.readFileSync(path.join(root, '../citymap/src/redlines.ts'), 'utf8');
  const body = src.split('export const LANDMARK_REAL_NAMES')[1]?.split('};\n')[0] ?? '';
  return [...body.matchAll(/\b(?:zh|en): '([^']+)'/g)].map((m) => m[1]);
}

/**
 * 一个源文件里的全部字符串字面量：值 → 在文件里出现的次数。按文本逐字扫描：跳过 // 与 /* *\/ 注释（transit-data.ts 的文件头注释里写着真名），
 * 只收 '…'、"…"、`…`（transit-data.ts 与 fixture.ts 都没有带真名的 ${} 插值）。
 * transit-data.ts：站名、目的地、电车站 / 码头 / 船名……；fixture.ts：合成城市的地标名（D6 真名）。
 */
function stringLiterals(file) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const out = new Map();
  const esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') i = src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i);
    else if (c === '/' && src[i + 1] === '*') i = src.indexOf('*/', i + 2) < 0 ? src.length : src.indexOf('*/', i + 2) + 2;
    else if (c === "'" || c === '"' || c === '`') {
      let v = '';
      for (i++; i < src.length && src[i] !== c; i++) {
        if (src[i] !== '\\') v += src[i];
        else if (src[i + 1] === 'u') {
          const m = /^u(?:\{([0-9a-fA-F]+)\}|([0-9a-fA-F]{4}))/.exec(src.slice(i + 1));
          v += String.fromCodePoint(parseInt(m[1] ?? m[2], 16));
          i += m[0].length;
        } else v += esc[src[++i]] ?? src[i];
      }
      i++;
      out.set(v, (out.get(v) ?? 0) + 1);
    } else i++;
  }
  return out;
}

/** 压缩产物里一个字符串值可能的写法（esbuild 按转义最少挑引号）。 */
function quotedForms(v) {
  const b = v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  return [`"${b.replace(/"/g, '\\"')}"`, `'${b.replace(/'/g, "\\'")}'`, `\`${b.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``];
}

/** 把 \uXXXX、\u{…}、\xXX 写成的非 ASCII 字符还原（esbuild 用 charset: ascii 时中文是这样写的；ASCII 的转义保持不动）。 */
function unescapeNonAscii(js) {
  return js.replace(/(?<!\\)((?:\\\\)*)\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))/g, (all, pre, a, b, c) => {
    const cp = parseInt(a ?? b ?? c, 16);
    return cp >= 0x80 ? pre + String.fromCodePoint(cp) : all;
  });
}

/**
 * 构建产物里命中红线词的 JS 片段（最多 10 条）。按词表原样的大小写匹配（不像数据检查那样不分大小写）：
 * 压缩后的 three.js 着色器代码里有 vClipPosition 之类的标识符，不分大小写会把「Lippo」误报出来。
 * 负责人拍板 D2（2026-11-26，真实站名放开）：transit-data.ts 字符串字面量里的楼宇 / 企业 / 政府地点名（真实站名、目的地）豁免——
 * 扫描前先把产物里与这些字面量逐字相同的整段字符串（连引号）换成 ""，再扫；同样的词出现在其他任何地方照样报。
 * 豁免按出处而不只按值：每个值在产物里（所有 chunk 合计）最多换掉它在 transit-data.ts 里出现的次数（打包不合并相同的字符串，
 * tree-shaking 只会减少），多出来的说明别处（HUD、地标名、长字符串里带引号的一段……）用了同一个字符串，算失败。
 * 含游戏系列名（不分大小写）的字面量不豁免（D2 只放开楼宇 / 企业 / 政府地点名），照样扫出来。
 * 只需剔除本身含红线词的字面量（换掉不含红线词的字面量不会改变扫描结果）；换成 "" 而不是删掉，前后文不会拼出新词。
 * transit-data 里本来就有含红线词的字面量（如「中環（交易廣場）」），一条都没在产物里认出来说明写法变了，也算失败。
 */
function scanDist(dist) {
  const { plain, series } = redlineWords();
  const words = [...plain, ...series];
  const transit = stringLiterals('src/render/streets/transit-data.ts');
  // D6：六座地标的真名。合成城市（fixture.ts）是动态 import 的独立 chunk（fixture-*.js）：它的名字只许出现在那个 chunk 里、
  // 次数与 fixture.ts 逐个相等（少了 = 写法变了或挪走了；复审 R5b 修正二：原来按全部 chunk 合计、只查「至少一次」，
  // 12 个名字又都在 transit-data 里，fixture 里少一个或挪到别处都查不出来）；其余 chunk 里只许 transit-data（同名的站）的次数
  const d6 = landmarkRealNames();
  const fixture = stringLiterals('src/dev/fixture.ts');
  const fixAllow = new Map(d6.filter((v) => (fixture.get(v) ?? 0) > 0).map((v) => [v, fixture.get(v)]));
  const values = new Set([...transit.keys(), ...fixAllow.keys()]);
  const exempt = [...values]
    .filter((v) => plain.some((w) => v.includes(w)) && !series.some((g) => v.toLowerCase().includes(g.toLowerCase())))
    .sort((a, b) => b.length - a.length);
  const hits = [];
  const used = new Map();
  const usedFix = new Map();
  let fixChunks = 0;
  const dir = path.join(dist, 'assets');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.js')) : []) {
    const isFix = /^fixture-/.test(f);
    if (isFix) fixChunks++;
    const tally = isFix ? usedFix : used;
    let js = unescapeNonAscii(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const v of exempt)
      for (const q of quotedForms(v)) {
        const parts = js.split(q);
        if (parts.length < 2) continue;
        tally.set(v, (tally.get(v) ?? 0) + parts.length - 1);
        js = parts.join('""');
      }
    for (const w of words) if (js.includes(w)) hits.push(`${f}: ${w}`);
  }
  const extra = [...used]
    .filter(([v, n]) => n > (transit.get(v) ?? 0))
    .map(([v, n]) => `「${v}」在產物裡 ×${n}，多於 transit-data 裡的 ×${transit.get(v) ?? 0}（多出的不是站名數據）`);
  const fixWrong = [...new Set([...fixAllow.keys(), ...usedFix.keys()])]
    .filter((v) => (usedFix.get(v) ?? 0) !== (fixAllow.get(v) ?? 0))
    .map((v) => `「${v}」在 fixture chunk 裡 ×${usedFix.get(v) ?? 0}，fixture.ts 裡 ×${fixAllow.get(v) ?? 0}（D6 地標名應逐個相等）`);
  hits.unshift(...extra, ...fixWrong);
  const stripped = [...used.values(), ...usedFix.values()].reduce((a, n) => a + n, 0);
  if (exempt.length && !stripped) hits.unshift(`transit-data 的 ${exempt.length} 条含红线词的字面量一条也没在产物里认出来（写法变了？）`);
  if (d6.length !== 12) hits.unshift(`redlines.ts 的 LANDMARK_REAL_NAMES 解析出 ${d6.length} 个名字（应为 12）`);
  if (fixAllow.size && fixChunks !== 1) hits.unshift(`fixture chunk（fixture-*.js）應正好 1 個，產物裡 ${fixChunks} 個`);
  const d6Stripped = d6.reduce((a, v) => a + (used.get(v) ?? 0) + (usedFix.get(v) ?? 0), 0);
  return { hits: hits.slice(0, 10), stripped, found: new Set([...used.keys(), ...usedFix.keys()]).size, exempt: exempt.length, d6: d6.length, d6Stripped };
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  if (!args.includes('--no-build')) await build({ root, logLevel: 'warn' });
  const red = scanDist(path.join(root, 'dist'));
  const redHits = red.hits;
  console.log(
    `紅線詞掃描：transit-data 含紅線詞的字面量與 D6 地標真名共 ${red.exempt} 種（D6 ${red.d6} 個），產物裡認出 ${red.found} 種、剔除 ${red.stripped} 處` +
      `（其中 D6 名字 ${red.d6Stripped} 處）；其餘命中 ${redHits.length} 條`,
  );
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
      // 贴面文件全部 404：最多 1 条 console error，facadesIdle 照样兑现（熔断，见 facades/streamer.ts）；
      // R5 起地标网格与图集（city/landmarks/）也一并 404：远景网格失败就不再请求图集（同样熔断），console.warn 一次、留着轮廓白模，
      // facadesIdle 照样兑现；所以浏览器的网络错误最多 2 条（贴面 1 + 地标 1）
      const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      let facadeReq = 0;
      await page.route((u) => isFacade(u.href), (r) => {
        facadeReq++;
        return r.fulfill({ status: 404, body: '' });
      });
      await page.goto(base);
      await page.waitForFunction('window.__central && (window.__central.ready || window.__central.error)', null, { timeout: 180000 });
      await page.evaluate(`window.__central.setView('statue', true)`);
      const idle = await page.evaluate('Promise.race([window.__central.facadesIdle?.().then(() => true) ?? Promise.resolve(true), new Promise((r) => setTimeout(() => r(false), 60000))])');
      await page.waitForTimeout(3000);
      if (errors.length > 2 || !idle) failures.push(`city/facades-404: console error ×${errors.length}（≤ 2）、idle ${idle}、請求 ${facadeReq} 次`);
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
        // R5：记下 __central.ready 变真的时刻（首帧，与流式加载开始同一帧），检查贴面 / 地标的请求都不早于它
        await page.addInitScript(() => {
          /* global window, performance */
          let dbg;
          Object.defineProperty(window, '__central', {
            configurable: true,
            get: () => dbg,
            set: (v) => {
              dbg = v;
              let r = v.ready;
              Object.defineProperty(v, 'ready', {
                configurable: true,
                enumerable: true,
                get: () => r,
                set: (x) => {
                  if (x && !r) window.__readyAt = performance.now();
                  r = x;
                },
              });
            },
          });
        });
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
        // 流式数据（贴面、地标）只能在首帧之后请求：否则上面按网址排除就漏算了首帧前的下载
        const early = await page.evaluate(
          `performance.getEntriesByType('resource').filter((e) => (e.name.includes('/city/facades/') || e.name.includes('/city/landmarks/')) && !(e.startTime >= window.__readyAt)).map((e) => e.name)`,
        );
        if (early.length) failures.push(`${tag}: 首幀前就請求了流式數據 ${early.length} 個（${early.slice(0, 3).join(', ')}）`);
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
          if (run.name === 'low' && t.name === 'city' && !(stats.texMB <= MAX_TEX_MB.low - TEX_MARGIN_MB.low)) failures.push(`${at}: GPU 貼圖 ${stats.texMB} MB > ${MAX_TEX_MB.low} − ${TEX_MARGIN_MB.low}（LOW，R4 留餘量）`);
          if (run.name === 'low' && t.name === 'city' && !((stats.facadeMB ?? 0) <= MAX_FACADE_MB.low)) failures.push(`${at}: 貼面 ${stats.facadeMB} MB > ${MAX_FACADE_MB.low}（LOW）`);
          // R4 高清街面层：只给 HIGH（LOW 不应有高清显存）；等贴面到齐后视野要的高清页不该还缺
          if (t.name === 'city' && stats.tier === 'low' && (stats.hiresMB ?? 0) > 0) failures.push(`${at}: LOW 檔不應載入高清街面（${stats.hiresMB} MB）`);
          if (t.name === 'city' && (stats.hiresPending ?? 0) > 0) failures.push(`${at}: 高清街面還有 ${stats.hiresPending} 頁未到`);
          // R4 整合：HIGH 档有高清街面的墙不加程序招牌（facades().procSuppressed > 0）、雨篷让开街上障碍后仍在
          if (t.name === 'city' && stats.tier === 'high') {
            const fd = await page.evaluate('window.__central.facades?.() ?? null');
            if (fd && !(fd.procSuppressed > 0)) failures.push(`${at}: 高清街面沒有壓掉程序招牌（procSuppressed ${fd.procSuppressed}）`);
            if (fd && !(fd.canopies > 0)) failures.push(`${at}: 沒有雨篷（${fd.canopies}）`);
          }
          if (vp.memCheck) {
            if (!(stats.texMB <= MAX_TEX_MB[vp.memCheck] - TEX_MARGIN_MB[vp.memCheck])) failures.push(`${at}: GPU 貼圖 ${stats.texMB} MB > ${MAX_TEX_MB[vp.memCheck]} − ${TEX_MARGIN_MB[vp.memCheck]}（R4 留餘量）`);
            if (t.name === 'city' && !((stats.facadeMB ?? 0) <= MAX_FACADE_MB[vp.memCheck])) failures.push(`${at}: 貼面 ${stats.facadeMB} MB > ${MAX_FACADE_MB[vp.memCheck]}`);
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
    console.log(`數據 ${r.target}/${r.run}/${r.viewport}/${r.preset}: 首幀前 ${r.dataBytes} B；貼面串流 ${r.streamedFacadeBytes ?? 0} B（高清 ${r.hiresBytes ?? 0} B）；GPU ${r.texMB} MB（貼面 ${r.facadeMB ?? 0} MB，高清 ${r.hiresMB ?? 0} MB，待載 ${r.hiresPending ?? 0}）`);
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
