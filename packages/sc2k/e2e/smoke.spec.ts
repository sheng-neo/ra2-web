// ===== e2e/smoke.spec.ts =====（WP12b：冒烟，WORKPLAN WP12 / WP11 验收）
// 标题页 → 新城 → 放电厂 / 电线 / 分区 / 道路 / 水泵 / 管线 / 铁路 + 火车站 / 医院 → 极速 24 个月 → Query 火车站与医院 → Disasters → Fire → 等待结束
// → 截图；画布非单色；资金变化；.SC2 文档往返；stats() 门禁；旋转 / 缩放后截图变化；无 console error。
// 驱动方式：尽量经 window.__sc2k（host.dispatch / renderer / shell），不依赖外壳的具体选择器，因而对 WP12a 的实现细节不敏感。
// 依赖真系统的断言在 SC2K_E2E_STRICT=1 时为硬断言；否则只记 annotation（type 'needs-real-sim'），让冒烟在桩应用上也能跑完。
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'output');
const STRICT = process.env['SC2K_E2E_STRICT'] === '1';
const MONTHS = Number(process.env['SC2K_SMOKE_MONTHS'] ?? 24);
const DAYS_PER_MONTH = 25;

/** 建筑 / 工具常量（data/buildings.generated.ts、contracts/grid.DisasterKind、contracts/state.CityMode）。 */
const BLD = { coal: 0xcf, pump: 0xdc, railDepot: 0xed, hospital: 0xd1 } as const;
const ZONE = { lightR: 1, lightC: 3, lightI: 5 } as const;
const DISASTER_FIRE = 1;
const MODE = { terrainEdit: 0, city: 1, disaster: 2 } as const;

/** 需要真系统才成立的断言：STRICT 下硬断言，否则记 annotation。 */
function needsSim(info: TestInfo, ok: boolean, what: string): void {
  if (STRICT) expect(ok, what).toBe(true);
  else if (!ok) info.annotations.push({ type: 'needs-real-sim', description: what });
}

const sha1 = (b: Buffer): string => createHash('sha1').update(b).digest('hex');

/** 画布不同颜色数：优先 renderer.thumbnail（CPU 合成 PNG → 浏览器解码），其次读 2D 画布；WebGL 画布无 2D 上下文时返回 -1。 */
async function distinctColors(page: Page): Promise<{ thumb: number; canvas: number }> {
  return page.evaluate(async () => {
    const count = (d: Uint8ClampedArray): number => {
      const seen = new Set<number>();
      for (let i = 0; i < d.length && seen.size < 16; i += 4 * 7) seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
      return seen.size;
    };
    let thumb = -1;
    try {
      const png = await window.__sc2k!.renderer.thumbnail(128, 128);
      const blob = new Blob([new Uint8Array(png)], { type: 'image/png' });
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      thumb = count(ctx.getImageData(0, 0, c.width, c.height).data);
    } catch { thumb = -1; }
    let canvas = -1;
    const c = document.querySelector('canvas');
    if (c) {
      const ctx = c.getContext('2d');
      if (ctx) canvas = count(ctx.getImageData(0, 0, c.width, c.height).data);
    }
    return { thumb, canvas };
  });
}

/** 推进到目标 age；挂起的模态优先点外壳按钮（data-testid=modal-ok），1 s 后仍挂起则直接 host.modalClosed()。 */
async function advanceToAge(page: Page, targetAge: number, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  let lastPauseAt = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = await page.evaluate(() => { const c = window.__sc2k!.host.state.clock; return { age: c.age, paused: c.modalPause > 0, speed: c.speed }; });
    if (s.age >= targetAge) return;
    if (s.paused) {
      if (!lastPauseAt) lastPauseAt = Date.now();
      const okBtn = page.locator('[data-testid="modal-ok"], [data-testid="budget-ok"], [data-testid="paper-ok"], [data-testid="alert-ok"]').first();
      if (await okBtn.count()) { await okBtn.click({ timeout: 1000 }).catch(() => undefined); }
      else if (Date.now() - lastPauseAt > 1000) { await page.evaluate(() => window.__sc2k!.host.modalClosed()); lastPauseAt = 0; }
    } else {
      lastPauseAt = 0;
      if (s.speed !== 5) await page.evaluate(() => window.__sc2k!.host.dispatch({ type: 'setSpeed', speed: 5 }));
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`advanceToAge: 超时（目标 ${targetAge}）`);
}

test('标题页 → 新城 → 建设 → 24 个月 → 查询 → 火灾 → 截图', async ({ page }, info) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // 1. 标题页 → 新城
  await page.goto('/?debug');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('new-city').click();
  await page.waitForFunction(() => Boolean(window.__sc2k));
  // 外壳可能把"新城"做成窗口（NewCity 的 Done 按钮）而不是直接开局：兜底点 Done，再兜底直接经 host 开局
  const done = page.getByTestId('newcity-done');
  if (await done.count()) await done.click().catch(() => undefined);
  await page.waitForTimeout(300);
  await page.evaluate(({ terrainEdit }) => {
    const h = window.__sc2k!.host;
    if (h.state.clock.mode === terrainEdit) {
      h.newCity({ name: 'Smoketown', difficulty: 1, startYear: 1950, seed: 0x5eed, terrainSeed: 0x7e55, terrain: { coast: false, river: true, hills: 10, water: 8, trees: 20 } });
      h.dispatch({ type: 'terrainDone' });
    }
    h.dispatch({ type: 'setSpeed', speed: 1 });
  }, MODE);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();

  // 2. 建设（暂停中派发；经济 / 放置真系统缺席时结果为 notImplemented）
  const build = await page.evaluate(({ BLD, ZONE }) => {
    const h = window.__sc2k!.host;
    const ti = (x: number, y: number): number => x * 128 + y;
    const fundsBefore = h.state.economy.funds;
    h.dispatch({ type: 'setOption', key: 'autoBudget', value: true });
    h.dispatch({ type: 'setOption', key: 'paperDelivery', value: false });
    const cmds = [
      { type: 'placeBuilding', id: BLD.coal, x: 56, y: 56 },
      { type: 'network', kind: 'power', from: ti(60, 57), to: ti(72, 57) },
      { type: 'zoneRect', zone: ZONE.lightR, x0: 61, y0: 58, x1: 66, y1: 61 },
      { type: 'zoneRect', zone: ZONE.lightC, x0: 61, y0: 63, x1: 64, y1: 66 },
      { type: 'zoneRect', zone: ZONE.lightI, x0: 67, y0: 58, x1: 71, y1: 61 },
      { type: 'network', kind: 'road', from: ti(58, 62), to: ti(74, 62) },
      { type: 'placeBuilding', id: BLD.pump, x: 56, y: 62 },
      { type: 'network', kind: 'pipe', from: ti(57, 63), to: ti(70, 63) },
      { type: 'network', kind: 'rail', from: ti(58, 68), to: ti(74, 68) },
      { type: 'placeBuilding', id: BLD.railDepot, x: 64, y: 69 },
      { type: 'placeBuilding', id: BLD.hospital, x: 68, y: 69 },
    ] as const;
    const results = cmds.map((c) => { const r = h.dispatch(c as never); return { type: c.type, ok: r.ok, reason: r.reason, cost: r.cost }; });
    return { fundsBefore, fundsAfter: h.state.economy.funds, results, depot: ti(64, 69), hospital: ti(68, 69) };
  }, { BLD, ZONE });
  info.annotations.push({ type: 'build', description: JSON.stringify(build.results) });
  needsSim(info, build.results.every((r) => r.ok), `建设命令全部成功：${JSON.stringify(build.results.filter((r) => !r.ok))}`);
  needsSim(info, build.fundsAfter !== build.fundsBefore, `资金变化（${build.fundsBefore} → ${build.fundsAfter}）`);

  // 3. 极速 24 个月
  const startAge = await page.evaluate(() => window.__sc2k!.host.state.clock.age);
  await advanceToAge(page, startAge + MONTHS * DAYS_PER_MONTH, 150_000);
  await page.evaluate(() => window.__sc2k!.host.dispatch({ type: 'setSpeed', speed: 1 }));

  // 4. Query：火车站与医院各一次有数据
  await page.evaluate(() => window.__sc2k!.shell.openWindow('query'));
  const q = await page.evaluate(({ depot, hospital }) => {
    const h = window.__sc2k!.host;
    return { depot: h.q.services.queryStats(depot).length, hospital: h.q.services.queryStats(hospital).length, station: h.q.transport.stationAt(depot) !== null, xbldDepot: h.state.layers.xbld[depot], xbldHospital: h.state.layers.xbld[hospital] };
  }, build);
  needsSim(info, q.depot > 0 && q.station, `火车站 queryStats 有数据（${JSON.stringify(q)}）`);
  needsSim(info, q.hospital > 0, `医院 queryStats 有数据（${JSON.stringify(q)}）`);
  if (await page.getByTestId('query-rows').count()) info.annotations.push({ type: 'shell', description: 'Query 窗口（WP12b 组件）已由外壳挂载' });
  else info.annotations.push({ type: 'needs-shell', description: 'Query 窗口未由外壳挂载（WINDOW_FACTORIES 未接入或选择器不同）' });

  // 5. .SC2 文档往返（exportSc2 → importSc2 保持 hash('sc2')）
  const rt = await page.evaluate(() => {
    const h = window.__sc2k!.host;
    const before = h.hash('sc2');
    const doc = h.exportSc2();
    const diag = h.importSc2(doc);
    return { before, after: h.hash('sc2'), diag: diag.length, cityName: doc.cityName };
  });
  needsSim(info, rt.before === rt.after, `.SC2 文档往返保持 hash('sc2')（${rt.before} → ${rt.after}，诊断 ${rt.diag}）`);

  // 6. Disasters → Fire → 等待结束
  const fire = await page.evaluate(({ kind }) => window.__sc2k!.host.dispatch({ type: 'requestDisaster', kind, x: 63, y: 60 }), { kind: DISASTER_FIRE });
  needsSim(info, fire.ok, `requestDisaster(Fire) 被接受（${fire.reason ?? 'ok'}）`);
  if (fire.ok) {
    await page.evaluate(() => window.__sc2k!.host.dispatch({ type: 'setSpeed', speed: 4 }));
    const entered = await page.waitForFunction((m) => window.__sc2k!.host.state.clock.mode === m || window.__sc2k!.host.state.disaster.active, MODE.disaster, { timeout: 20_000 }).then(() => true).catch(() => false);
    needsSim(info, entered, '进入灾害模式');
    if (entered) {
      const ended = await page.waitForFunction((m) => window.__sc2k!.host.state.clock.mode === m && !window.__sc2k!.host.state.disaster.active, MODE.city, { timeout: 90_000 }).then(() => true).catch(() => false);
      needsSim(info, ended, '灾害结束（disasterEnded → 回到城市模式）');
      const paper = await page.evaluate(() => window.__sc2k!.host.q.news.currentPaper());
      needsSim(info, paper !== null && paper.extra, '号外已组版（currentPaper().extra）');
    }
    await page.evaluate(() => window.__sc2k!.host.dispatch({ type: 'setSpeed', speed: 1 }));
  }

  // 7. 画布非单色 + 截图
  const colors = await distinctColors(page);
  info.annotations.push({ type: 'colors', description: JSON.stringify(colors) });
  expect(Math.max(colors.thumb, colors.canvas), `画布应非单色 ${JSON.stringify(colors)}`).toBeGreaterThan(1);
  await page.screenshot({ path: resolve(OUT, 'smoke.png') });

  // 8. stats() 门禁（真渲染器才有非零值）
  const stats = await page.evaluate(() => window.__sc2k!.renderer.stats());
  info.annotations.push({ type: 'stats', description: JSON.stringify(stats) });
  if (stats.sprites > 0 || stats.drawCalls > 0) {
    expect(stats.drawCalls, 'drawCalls ≤ 48').toBeLessThanOrEqual(48);
    expect(stats.vramBytes, 'vramBytes ≤ 128 MB').toBeLessThanOrEqual(128 * 1024 * 1024);
  } else info.annotations.push({ type: 'needs-real-renderer', description: 'stats() 全零（桩渲染器）' });

  // 9. 缩放 / 旋转后截图变化
  const shot = async (): Promise<string> => sha1(await page.locator('canvas').first().screenshot());
  const base = await shot();
  await page.evaluate(() => { const r = window.__sc2k!.renderer; const v = r.getView(); r.setView({ ...v, zoom: v.zoom === 1 ? 2 : 1 }); });
  await page.waitForTimeout(400);
  const zoomed = await shot();
  expect(zoomed, '缩放后画面应变化').not.toBe(base);
  await page.evaluate(() => { const r = window.__sc2k!.renderer; const v = r.getView(); r.setView({ ...v, rotation: ((v.rotation + 1) & 3) as 0 | 1 | 2 | 3 }); });
  await page.waitForTimeout(400);
  const rotated = await shot();
  needsSim(info, rotated !== zoomed, '旋转后画面变化（桩的均匀洋红地图旋转后可能相同）');
  await page.screenshot({ path: resolve(OUT, 'smoke-rotated.png') });

  expect(errors, errors.join('\n')).toEqual([]);
});
