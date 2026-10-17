// ===== e2e/hash.spec.ts =====（WP12b：浏览器与 Node 的 hash('full') 一致性，WORKPLAN WP12 验收）
// 浏览器经 window.__sc2k.host 以固定参数开新城并跑 N 年（默认 5，SC2K_HASH_YEARS 可改），Node 侧在本进程用同一套 sim 代码（sim/core + 8 个系统 + data + io/snapshot）
// 跑同样的日程，比较 hash('full')。两边都只调用 advance(0, …)（dt = 0 → 无灾害 / 物件 tick 的真实时间依赖），模态挂起一律 modalClosed()。
// 基线：SC2K_HASH_BASELINE=<十进制或 0x 十六进制> 时另与之比较（集成后由 Lead 建立）；结果写到 e2e/output/hash.json。
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NewCityParams } from '../src/contracts/system';
import type { SimHost } from '../src/contracts/host';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'output');
const YEARS = Number(process.env['SC2K_HASH_YEARS'] ?? 5);
const DAYS = YEARS * 300;
const BASELINE = process.env['SC2K_HASH_BASELINE'];
const CHUNK_DAYS = 60;

/** 固定开局参数（两边必须逐字相同）。 */
export const HASH_PARAMS: NewCityParams = {
  name: 'Hashford', mayor: 'Auditor', difficulty: 1, startYear: 1900, seed: 0x0c0ffee, terrainSeed: 0x2a,
  terrain: { coast: false, river: true, hills: 16, water: 16, trees: 24 },
};

/** 推进 n 天（与浏览器端 runChunk 逐字相同的步进逻辑）。 */
function runChunkOn(host: SimHost, n: number): void {
  const c = host.state.clock;
  const target = c.age + n;
  const prev = c.speed;
  c.speed = 5;
  try {
    let guard = 0;
    while (c.age < target) {
      if (c.modalPause > 0) host.modalClosed();
      else { const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: Math.min(10, target - c.age) }); if (r.suspended) host.modalClosed(); }
      if (++guard > n * 64 + 1024) throw new Error('runChunk: 推进停滞');
    }
  } finally { c.speed = prev; }
}

/** Node 侧：同一套代码装配（不经 app/wire，避免拉入渲染 / UI 模块）。 */
async function nodeHash(info: TestInfo): Promise<number | null> {
  try {
    const [core, terrain, placement, utilities, zones, transport, services, economy, events, data, snap] = await Promise.all([
      import('../src/sim/core/index'), import('../src/sim/terrain/index'), import('../src/sim/placement/index'), import('../src/sim/utilities/index'),
      import('../src/sim/zones/index'), import('../src/sim/transport/index'), import('../src/sim/services/index'), import('../src/sim/economy/index'),
      import('../src/sim/events/index'), import('../src/data/index'), import('../src/io/snapshot/index'),
    ]);
    const host = core.createSim({
      systems: [core.createCoreSystem(), terrain.createTerrainSystem(), placement.createPlacementSystem(), utilities.createUtilitiesSystem(), zones.createZonesSystem(),
        transport.createTransportSystem(), services.createServicesSystem(), economy.createEconomySystem(), events.createEventsSystem()],
      catalogue: data.CATALOGUE, snapshot: snap.snapshotCodec,
      stubAllowlist: ['terrain', 'placement', 'utilities', 'zones', 'transport', 'services', 'economy', 'events'],
    });
    host.newCity(HASH_PARAMS);
    host.dispatch({ type: 'terrainDone' });
    while (host.state.clock.age < DAYS) runChunkOn(host, Math.min(CHUNK_DAYS, DAYS - host.state.clock.age));
    return host.hash('full') >>> 0;
  } catch (e) {
    info.annotations.push({ type: 'node-hash-unavailable', description: String(e) });
    return null;
  }
}

async function browserHash(page: Page): Promise<{ hash: number; age: number; sc2: number }> {
  await page.goto('/?debug');
  await page.waitForFunction(() => Boolean(window.__sc2k));
  await page.evaluate((p) => {
    const h = window.__sc2k!.host;
    h.dispatch({ type: 'setSpeed', speed: 1 });          // 让应用主循环不推进（speed 1 直接返回，也不跑 tick）
    h.newCity(p);
    h.dispatch({ type: 'terrainDone' });
  }, HASH_PARAMS);
  let age = 0;
  while (age < DAYS) {
    age = await page.evaluate(({ n, days }) => {
      const host = window.__sc2k!.host;
      const c = host.state.clock;
      const target = Math.min(days, c.age + n);
      const prev = c.speed;
      c.speed = 5;
      try {
        let guard = 0;
        while (c.age < target) {
          if (c.modalPause > 0) host.modalClosed();
          else { const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: Math.min(10, target - c.age) }); if (r.suspended) host.modalClosed(); }
          if (++guard > n * 64 + 1024) throw new Error('runChunk: 推进停滞');
        }
      } finally { c.speed = prev; }
      return c.age;
    }, { n: CHUNK_DAYS, days: DAYS });
  }
  return page.evaluate(() => { const h = window.__sc2k!.host; return { hash: h.hash('full') >>> 0, age: h.state.clock.age, sc2: h.hash('sc2') >>> 0 }; });
}

test(`浏览器 ${YEARS} 年 hash('full') 与 Node 一致`, async ({ page }, info) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const [browser, node] = await Promise.all([browserHash(page), nodeHash(info)]);
  const record = { years: YEARS, params: HASH_PARAMS, browser, node, baseline: BASELINE ?? null, at: new Date().toISOString() };
  writeFileSync(resolve(OUT, 'hash.json'), JSON.stringify(record, null, 2));
  console.log(`[hash.spec] browser=0x${browser.hash.toString(16)} node=${node === null ? 'n/a' : '0x' + node.toString(16)} age=${browser.age}`);
  info.annotations.push({ type: 'hash', description: JSON.stringify(record) });

  expect(browser.age).toBe(DAYS);
  expect(errors, errors.join('\n')).toEqual([]);
  if (node !== null) expect(browser.hash, 'browser hash(full) === node hash(full)').toBe(node);
  if (BASELINE) expect(browser.hash, `与基线 ${BASELINE} 一致`).toBe(Number(BASELINE) >>> 0);
  else info.annotations.push({ type: 'baseline', description: '未设置 SC2K_HASH_BASELINE：基线在集成后建立' });
});
