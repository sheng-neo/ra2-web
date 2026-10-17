// ===== sim/utilities/power.test.ts =====（spec:power-water §3.8 T1–T6 / T9 + 两遍 BFS 的基本语义）
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FOOTPRINT } from '../../contracts/footprint';
import { MAP, XBit, tileIndex, tileX, tileY } from '../../contracts/grid';
import { createPrng } from '../../contracts/prng';
import type { StubProfile } from '../../contracts/testkit';
import { CATALOGUE } from '../../data';
import { createTestContext, runDays } from '../../testkit';
import { POWER_PLANT_DEFS, POWER_PLANT_KINDS } from './defs';
import { fakePlacementSystem, line, paintLot, paintWater, paintXbld, place } from './fixtures';
import { createUtilitiesSystem } from './index';
import { count3x3, createScratch, runPowerScan } from './scan';
import type { PowerScanInput } from './scan';
import { DEFAULT_UTILITIES_TUNING } from './tuning';

const PROFILES = ['optimistic', 'pessimistic'] as const;
const mk = (profile: StubProfile = 'realistic', seed = 12345) => createTestContext({ profile, seed, systems: [createUtilitiesSystem(), fakePlacementSystem()] });
const HOUSE = 0x70, COAL = 0xcf, GAS = 0xc9, WIND = 0xc8, SOLAR = 0xcc, STATUE = 0xdb, SMALL_PARK = 0x0d, TREE = 0x06, CROSS_POWER_ROAD = 0x43, ELEVATED = 0x5c;
const powered = (xbit: Uint8Array, x: number, y: number): boolean => (xbit[tileIndex(x, y)]! & XBit.Powered) !== 0;
const scanInput = (state: ReturnType<typeof mk>['state'], over: Partial<PowerScanInput> = {}): PowerScanInput => ({
  xbld: state.layers.xbld, xbit: state.layers.xbit, alt: state.layers.alt, wind: state.weather.wind, humid: state.weather.humid,
  energyConservation: false, rng: null, tune: DEFAULT_UTILITIES_TUNING, scratch: createScratch(), ...over,
});

describe('T1 索引与掩码契约', () => {
  it('tileIndex / tileX / tileY 全图互逆且 x 主序', () => {
    for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
      const i = tileIndex(x, y);
      expect(i).toBe((x << 7) + y);
      expect(tileX(i)).toBe(x); expect(tileY(i)).toBe(y);
    }
    expect(XBit.Powerable).toBe(0x80); expect(XBit.Powered).toBe(0x40); expect(XBit.Piped).toBe(0x20); expect(XBit.Watered).toBe(0x10); expect(XBit.Mark).toBe(0x08);
  });
  it('本目录源码不出现 "* 128" / "% 128" 字面量（一律经 contracts/grid 换算）', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(/[*%]\s*128\b/.test(readFileSync(dir + f, 'utf8')), f).toBe(false);
  });
  it('POWER_PLANT_DEFS 与 CATALOGUE 对账：固定产量 = 目录整厂产量 / 占地格数、科技键、寿命、占地', () => {
    for (const kind of POWER_PLANT_KINDS) {
      const d = POWER_PLANT_DEFS[kind];
      for (const id of d.xbld) {
        const b = CATALOGUE.BUILDINGS[id]!;
        expect(b.category).toBe('powerPlant');
        expect(b.tech ?? null).toBe(d.tech);
        expect(b.lifetimeYears !== undefined).toBe(d.expires);
        expect(b.microsim?.type).toBe(d.microsimType);
        expect(b.nimby).toBe(d.nimby);
        const n = FOOTPRINT[id]!;
        if (d.output.kind === 'fixed' && b.powerOutput?.kind === 'fixed') expect(b.powerOutput.tiles).toBe(d.output.tilesPerCell * n * n);
        else if (d.output.kind === 'fixed') expect(b.powerOutput?.kind).toBe('hydro');
        else expect(b.powerOutput?.kind).toBe(d.output.kind);
      }
    }
  });
});

describe('T2 / T3 反转置与同字节', () => {
  it('count3x3：仅 x == 0 一列为水时，(1,5) 数到 3、(5,1) 数到 0', () => {
    const { state } = mk();
    for (let y = 0; y < MAP; y++) paintWater(state, 0, y);
    const xbit = state.layers.xbit;
    expect(count3x3(xbit, tileIndex(1, 5), false)).toBe(3);
    expect(count3x3(xbit, tileIndex(5, 1), false)).toBe(0);
    expect(count3x3(xbit, tileIndex(0, 5), false)).toBe(3);
    expect(count3x3(xbit, tileIndex(0, 0), false)).toBe(2);
    expect(count3x3(xbit, tileIndex(1, 5), true)).toBe(0);
  });
  it('查询与 terrain 桩读同一 XBIT 实例、同一偏移（200 个伪随机格）', () => {
    const { state, ctx } = mk();
    const rng = createPrng(7);
    for (let k = 0; k < 200; k++) {
      const x = rng.int(MAP), y = rng.int(MAP), i = tileIndex(x, y);
      if (rng.bit()) paintWater(state, x, y);
      state.layers.xbit[i] = state.layers.xbit[i]! | (rng.bit() ? XBit.Piped : 0);
      expect(ctx.q.terrain.isWater(i)).toBe((state.layers.xbit[i]! & XBit.Water) !== 0);
      expect(ctx.q.utilities.piped(i)).toBe((state.layers.xbit[i]! & XBit.Piped) !== 0);
    }
  });
});

describe.each(PROFILES)('电力扫描（%s 桩）', (profile) => {
  it('孤立煤电厂：容量 704、16 格自供电、消费者 0、利用率 0', () => {
    const { host, state, ctx } = mk(profile);
    expect(place(host, COAL, 10, 10).ok).toBe(true);
    runDays(host, 2);
    expect(state.utilities.power).toEqual({ generation: 704, consumers: 0, supplied: 0, usagePct: 0, unpoweredBuildingTiles: 0 });
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 4; dy++) expect(powered(state.layers.xbit, 10 + dx, 10 + dy)).toBe(true);
    expect(ctx.q.utilities.poweredSelf(tileIndex(10, 10))).toBe(true);
    expect(ctx.q.utilities.lastPower()).toBe(state.utilities.power);
  });
  it('导电规则：电线 / 十字口 / 架空线 / 建筑导电；道路 / 树 / 雕像 / 公园 / 空分区地阻断；hasPower 看 4 邻', () => {
    const { host, state, ctx } = mk(profile);
    place(host, COAL, 10, 10);
    line(host, 'power', 14, 10, 20, 10); place(host, HOUSE, 21, 10); line(host, 'road', 22, 10, 22, 10); place(host, HOUSE, 23, 10);   // A 受电，道路阻断 B
    line(host, 'power', 10, 14, 10, 20); paintXbld(state, 10, 21, TREE); place(host, HOUSE, 10, 22);                                // 树阻断 C
    line(host, 'power', 14, 12, 17, 12); paintXbld(state, 18, 12, CROSS_POWER_ROAD); place(host, HOUSE, 19, 12);                    // 十字口导电 D
    paintXbld(state, 14, 13, ELEVATED); place(host, HOUSE, 15, 13);                                                                   // 架空线导电 E
    place(host, STATUE, 12, 14); place(host, HOUSE, 12, 15);                                                                           // 雕像阻断 G
    place(host, SMALL_PARK, 13, 14); place(host, HOUSE, 13, 15);                                                                       // 小公园阻断 H
    state.layers.xzon[tileIndex(21, 11)] = 1; place(host, HOUSE, 21, 12);                                                              // 空分区地阻断 F
    runDays(host, 2);
    const xbit = state.layers.xbit;
    expect(powered(xbit, 21, 10)).toBe(true); expect(powered(xbit, 23, 10)).toBe(false); expect(powered(xbit, 22, 10)).toBe(false);
    expect(powered(xbit, 10, 22)).toBe(false); expect(powered(xbit, 10, 20)).toBe(true);
    expect(powered(xbit, 19, 12)).toBe(true); expect(powered(xbit, 18, 12)).toBe(true);
    expect(powered(xbit, 15, 13)).toBe(true);
    expect(powered(xbit, 12, 15)).toBe(false); expect(xbit[tileIndex(12, 14)]! & XBit.Powerable).toBe(0); expect(xbit[tileIndex(12, 14)]! & XBit.Piped).toBe(XBit.Piped);
    expect(powered(xbit, 13, 15)).toBe(false); expect(xbit[tileIndex(13, 14)]! & XBit.Piped).toBe(XBit.Piped);
    expect(powered(xbit, 21, 12)).toBe(false); expect(xbit[tileIndex(21, 11)]! & XBit.Powerable).toBe(0);
    expect(ctx.q.utilities.hasPower(tileIndex(21, 11))).toBe(true); expect(ctx.q.utilities.poweredSelf(tileIndex(21, 11))).toBe(false);
    expect(ctx.q.utilities.hasPower(tileIndex(23, 10))).toBe(false);
    expect(state.utilities.power).toEqual({ generation: 704, consumers: 3, supplied: 3, usagePct: 0, unpoweredBuildingTiles: 5 });
  });
  it('T4 断电方向沿 y：海拔 31 无风风车容量 15 → 自供 1 + y 最小的 14 座房子受电', () => {
    const { host, state } = mk(profile);
    place(host, WIND, 0, 0); state.layers.alt[0] = 31;
    for (let y = 1; y <= 40; y++) place(host, HOUSE, 0, y);
    runDays(host, 2);
    for (let y = 1; y <= 40; y++) expect(powered(state.layers.xbit, 0, y), `y=${y}`).toBe(y <= 14);
    expect(state.utilities.power).toMatchObject({ generation: 15, consumers: 40, supplied: 15, unpoweredBuildingTiles: 26 });
  });
  it('T5 断电方向沿 x：同上但房子沿 +x（索引步长 128）', () => {
    const { host, state } = mk(profile);
    place(host, WIND, 0, 0); state.layers.alt[0] = 31;
    for (let x = 1; x <= 40; x++) place(host, HOUSE, x, 0);
    runDays(host, 2);
    for (let x = 1; x <= 40; x++) expect(powered(state.layers.xbit, x, 0), `x=${x}`).toBe(x <= 14);
  });
  it('T6 邻居顺序：容量 2 的风车四周各一座房子，唯一受电的是 (x, y−1)', () => {
    const { host, state } = mk(profile);
    place(host, WIND, 5, 5);                                   // 平地 alt 4、无风 → floor(4 / 2) = 2
    place(host, HOUSE, 5, 4); place(host, HOUSE, 4, 5); place(host, HOUSE, 5, 6); place(host, HOUSE, 6, 5);
    runDays(host, 2);
    const xbit = state.layers.xbit;
    expect(powered(xbit, 5, 5)).toBe(true);
    expect([powered(xbit, 5, 4), powered(xbit, 4, 5), powered(xbit, 5, 6), powered(xbit, 6, 5)]).toEqual([true, false, false, false]);
  });
  it('多厂合并：相邻两座煤电同网 1408；隔一条道路是两张网', () => {
    const a = mk(profile);
    place(a.host, COAL, 10, 10); place(a.host, COAL, 14, 10);
    runDays(a.host, 2);
    expect(a.state.utilities.power.generation).toBe(1408);
    expect(runPowerScan(scanInput(a.state)).networks).toHaveLength(1);
    const b = mk(profile);
    place(b.host, COAL, 10, 10); line(b.host, 'road', 14, 10, 14, 13); place(b.host, COAL, 15, 10);
    runDays(b.host, 2);
    const nets = runPowerScan(scanInput(b.state)).networks;
    expect(nets.map((n) => [n.start, n.capacity])).toEqual([[tileIndex(10, 10), 704], [tileIndex(15, 10), 704]]);
    expect(b.state.utilities.power.generation).toBe(1408);
  });
  it('T9 科技只读：悲观桩 invented=false 时既有燃气电厂仍计入容量；本模块不发 techInvented', () => {
    const { host, state, ctx } = mk(profile);
    place(host, GAS, 10, 10);
    runDays(host, 2);
    expect(ctx.q.tech.invented('gas')).toBe(profile === 'optimistic');
    expect(state.utilities.power.generation).toBe(176);
    expect(host.drainEvents().some((e) => e.type === 'techInvented')).toBe(false);
  });
});

describe('风 / 太阳能抽样与确定性', () => {
  it('第一遍遇到电厂格时抽样：风车 1 次、太阳能 16 次；两个同 seed 上下文位图与报告相同', () => {
    const a = mk('realistic', 99), b = mk('realistic', 99);
    for (const t of [a, b]) { place(t.host, WIND, 0, 0); place(t.host, SOLAR, 10, 10); }
    const before = a.ctx.prng.state();
    runDays(a.host, 1); runDays(b.host, 1);                     // 第 0 天日末 flush 重扫（消费 PRNG）
    const replay = createPrng(before);
    for (let k = 0; k < 17; k++) replay.next32();
    expect(a.ctx.prng.state()).toBe(replay.state());
    expect(a.ctx.prng.state()).toBe(b.ctx.prng.state());
    expect(Array.from(a.state.layers.xbit)).toEqual(Array.from(b.state.layers.xbit));
    expect(a.state.utilities.power).toEqual(b.state.utilities.power);
    const gen = a.state.utilities.power.generation;
    expect(gen).toBeGreaterThanOrEqual(2 + 80); expect(gen).toBeLessThanOrEqual(2 + 224);
  });
  it('无 PRNG 模式取分布中值；风速 / 湿度影响区间', () => {
    const { state } = mk();
    paintLot(state, WIND, 0, 0); state.layers.alt[0] = 10;
    expect(runPowerScan(scanInput(state, { wind: 0 })).report.generation).toBe(5);                 // floor((10 + 0) / 2)
    expect(runPowerScan(scanInput(state, { wind: 48 })).report.generation).toBe(6);                // gust 6 → 中值 3 → floor(13 / 2)
    const s2 = mk().state;
    paintLot(s2, SOLAR, 10, 10);
    expect(runPowerScan(scanInput(s2, { humid: 0 })).report.generation).toBe(16 * (5 + 4));       // range 10 → 中值 4
    expect(runPowerScan(scanInput(s2, { humid: 95 })).report.generation).toBe(16 * 5);            // range 1 → 恒 5
    let draws = 0;
    expect(runPowerScan(scanInput(s2, { humid: 95, rng: () => { draws++; return 0; } })).report.generation).toBe(80);
    expect(draws).toBe(16);
  });
  it('legacyTraceQueue=512 对小网络无影响', () => {
    const { state } = mk();
    paintLot(state, COAL, 10, 10);
    for (let y = 14; y < 40; y++) paintXbld(state, 10, y, 0x0f);
    paintLot(state, HOUSE, 10, 40);
    const r1 = runPowerScan(scanInput(state)).report;
    const r2 = runPowerScan(scanInput(state, { tune: { ...DEFAULT_UTILITIES_TUNING, legacyTraceQueue: 512 } })).report;
    expect(r2).toEqual(r1);
    expect(r1).toEqual({ generation: 704, consumers: 1, supplied: 1, usagePct: 0, unpoweredBuildingTiles: 0 });
  });
});

describe('查询与系统外形', () => {
  it('plantAt：种类 / 锚点 / 标称 MW / 到期标志；非电厂与绑定前为 null；绑定前查询按空城作答', () => {
    const fresh = createUtilitiesSystem();
    expect(fresh.queries!.utilities!.hasPower(0)).toBe(false);
    expect(fresh.queries!.utilities!.plantAt(0)).toBeNull();
    expect(fresh.queries!.utilities!.lastPower().usagePct).toBe(100);
    const { host, ctx } = mk();
    place(host, COAL, 10, 10); place(host, WIND, 3, 3); place(host, HOUSE, 5, 5);
    runDays(host, 2);
    expect(ctx.q.utilities.plantAt(tileIndex(12, 13))).toEqual({ kind: 'coal', anchor: tileIndex(10, 10), ageYears: 0, loadPct: 0, nominalMW: 200, expires: true });
    expect(ctx.q.utilities.plantAt(tileIndex(3, 3))).toMatchObject({ kind: 'wind', anchor: tileIndex(3, 3), ageYears: 0, nominalMW: 4, expires: false });
    expect(ctx.q.utilities.plantAt(tileIndex(5, 5))).toBeNull();
  });
  it('系统外形：阶段 / 查询 / 动作键集合、privVersion、无命令、非桩', () => {
    const sys = createUtilitiesSystem();
    expect(sys.id).toBe('utilities'); expect(sys.stub).toBeUndefined(); expect(sys.privVersion).toBe(1);
    expect(Object.keys(sys.phases!).sort()).toEqual(['powerScan', 'utilitiesAnnual', 'waterScan']);
    expect(Object.keys(sys.queries!)).toEqual(['utilities']); expect(Object.keys(sys.actions!)).toEqual(['requestRescan']);
    expect(sys.commands).toBeUndefined();
    expect(typeof sys.endOfDay).toBe('function'); expect(typeof sys.onTilesChanged).toBe('function');
    expect(typeof sys.importFrom).toBe('function'); expect(typeof sys.exportTo).toBe('function'); expect(typeof sys.postLoad).toBe('function');
  });
});
