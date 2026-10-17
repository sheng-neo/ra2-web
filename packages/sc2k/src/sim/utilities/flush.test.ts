// ===== sim/utilities/flush.test.ts =====（WORKPLAN WP4：requestRescan 置脏 + endOfDay 即时重扫、挂起日延后、onTilesChanged 位规则与置脏）
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import { createPrng } from '../../contracts/prng';
import type { System } from '../../contracts/system';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, nullSystem, runDays } from '../../testkit';
import { bulldoze, fakePlacementSystem, line, place } from './fixtures';
import { createUtilitiesSystem } from './index';
import type { UtilitiesPriv } from './priv';

const PROFILES = ['optimistic', 'pessimistic'] as const;
const HOUSE = 0x70, COAL = 0xcf, WIND = 0xc8, PUMP = 0xdc, STATUE = 0xdb, BIG_PARK = 0xd5, SMALL_PARK = 0x0d, SUBWAY_STATION = 0xe9;
const mk = (profile: StubProfile = 'realistic', extra: System[] = []) => createTestContext({ profile, systems: [createUtilitiesSystem(), fakePlacementSystem(), ...extra] });
const privOf = (state: ReturnType<typeof mk>['state']): UtilitiesPriv => state.priv.utilities as UtilitiesPriv;
const powered = (xbit: Uint8Array, x: number, y: number): boolean => (xbit[tileIndex(x, y)]! & XBit.Powered) !== 0;
/** 煤电 + 电线 + 末端房子，跑到第 2 天（电已扫描并稳定）。 */
function wiredHouse(profile: StubProfile, extra: System[] = []) {
  const t = mk(profile, extra);
  place(t.host, COAL, 10, 10); line(t.host, 'power', 14, 10, 20, 10); place(t.host, HOUSE, 21, 10);
  runDays(t.host, 2);
  expect(powered(t.state.layers.xbit, 21, 10)).toBe(true);
  t.host.dirty.take(); t.host.drainEvents();
  return t;
}

describe.each(PROFILES)('日末 flush（%s 桩）', (profile) => {
  it('命令拆电线 → 置脏 → 同日 endOfDay 后 POWERED 已更新且 dirty.bulk.xbit', () => {
    const t = wiredHouse(profile);
    expect(bulldoze(t.host, tileIndex(17, 10)).ok).toBe(true);
    const p = privOf(t.state);
    expect(p.dirtyPower).toBe(true); expect(p.dirtyWater).toBe(true);
    expect(powered(t.state.layers.xbit, 21, 10)).toBe(true);                 // 日末之前仍是旧位
    runDays(t.host, 1);                                                      // 第 2 天：无阶段写层，只有 endOfDay
    expect(powered(t.state.layers.xbit, 21, 10)).toBe(false); expect(powered(t.state.layers.xbit, 16, 10)).toBe(true);
    expect(p.dirtyPower).toBe(false); expect(p.dirtyWater).toBe(false);
    expect(t.host.dirty.take().bulk.xbit).toBe(true);
    expect(t.state.utilities.power).toMatchObject({ consumers: 0, unpoweredBuildingTiles: 1 });
  });
  it('无脏标志时 endOfDay 前后 prng.state() 相同、不写层、不标脏', () => {
    const t = wiredHouse(profile);
    place(t.host, WIND, 40, 40); runDays(t.host, 1); t.host.dirty.take();     // 风车就位并已重扫（有风车时重扫会消费 PRNG）
    const prng = t.ctx.prng.state(), bits = t.state.layers.xbit.slice();
    runDays(t.host, 1);                                                      // 第 3 天 growthScan 无访问者、无脏标志
    expect(t.ctx.prng.state()).toBe(prng);
    expect(Array.from(t.state.layers.xbit)).toEqual(Array.from(bits));
    expect(t.host.dirty.take().bulk.xbit).toBe(false);
  });
  it('requestRescan 只置脏；endOfDay 才重扫（风车恰消费 1 次 PRNG）；仅水脏时零 PRNG', () => {
    const t = wiredHouse(profile);
    place(t.host, WIND, 40, 40); runDays(t.host, 1);
    const before = t.ctx.prng.state();
    t.ctx.act.requestRescan('power');
    expect(privOf(t.state).dirtyPower).toBe(true); expect(t.ctx.prng.state()).toBe(before);
    runDays(t.host, 1);
    const replay = createPrng(before); replay.next32();
    expect(t.ctx.prng.state()).toBe(replay.state()); expect(privOf(t.state).dirtyPower).toBe(false);
    const mid = t.ctx.prng.state();
    t.ctx.act.requestRescan('water');
    runDays(t.host, 1);
    expect(t.ctx.prng.state()).toBe(mid); expect(privOf(t.state).dirtyWater).toBe(false);
    expect(t.host.dirty.take().bulk.xbit).toBe(true);
  });
  it('挂起日：命令在挂起期间拆线，endOfDay 延后到 modalClosed 之后才重扫（且恰一次）', () => {
    let suspended = false;
    const economy: System = { ...nullSystem('economy', profile), phases: { graphs: (ctx) => { if (suspended) return 'done'; suspended = true; ctx.act.emit({ type: 'modal', id: 'budget', payload: null }); return 'suspend'; } } };
    const t = wiredHouse(profile, [economy]);
    runDays(t.host, 19);                                                     // age 21
    t.state.clock.speed = 5;
    expect(t.host.advance(0, () => 0, { maxDaysPerFrame: 1, budgetMs: Infinity })).toEqual({ daysRun: 0, suspended: true });
    expect(t.state.clock.phaseCursor).toBeGreaterThan(0);
    expect(bulldoze(t.host, tileIndex(17, 10)).ok).toBe(true);
    expect(t.host.commandLog().at(-1)!.phaseCursor).toBeGreaterThan(0);
    expect(powered(t.state.layers.xbit, 21, 10)).toBe(true);                 // endOfDay 尚未发生
    const prng = t.ctx.prng.state();
    t.host.modalClosed();
    expect(t.state.clock.age).toBe(22); expect(t.state.clock.phaseCursor).toBe(0);
    expect(powered(t.state.layers.xbit, 21, 10)).toBe(false);
    expect(privOf(t.state).dirtyPower).toBe(false);
    expect(t.ctx.prng.state()).toBe(prng);                                   // 煤电重扫不消费 PRNG
  });
  it('电网重扫连带供水：拆电线后同日水泵停水、WATERED 清掉', () => {
    const t = mk(profile);
    t.state.weather.humid = 14; t.state.terrain.seaLevel = 4;
    place(t.host, COAL, 10, 10); line(t.host, 'power', 14, 10, 20, 10); line(t.host, 'power', 20, 11, 20, 19); place(t.host, PUMP, 20, 20); place(t.host, HOUSE, 20, 21);
    runDays(t.host, 1);
    expect((t.state.layers.xbit[tileIndex(20, 21)]! & XBit.Watered) !== 0).toBe(true);
    bulldoze(t.host, tileIndex(20, 15)); runDays(t.host, 1);
    expect((t.state.layers.xbit[tileIndex(20, 21)]! & XBit.Watered) !== 0).toBe(false);
    expect((t.state.layers.xbit[tileIndex(20, 20)]! & XBit.Watered) !== 0).toBe(false);
    expect(t.state.utilities.water.supply).toBe(0);
  });
});

describe('onTilesChanged：POWERABLE / PIPED 规则与置脏', () => {
  const bits = (state: ReturnType<typeof mk>['state'], x: number, y: number): number => state.layers.xbit[tileIndex(x, y)]! & (XBit.Powerable | XBit.Piped);
  it('建筑 → 两位；雕像 / 大公园 / 小公园只 PIPED；管线下的道路 PIPED；地铁站入口清 PIPED；拆除按地下管线决定 PIPED', () => {
    const t = mk();
    place(t.host, HOUSE, 5, 5); place(t.host, STATUE, 6, 6); place(t.host, BIG_PARK, 10, 10); place(t.host, SMALL_PARK, 3, 3);
    expect(bits(t.state, 5, 5)).toBe(XBit.Powerable | XBit.Piped);
    expect(bits(t.state, 6, 6)).toBe(XBit.Piped); expect(bits(t.state, 12, 12)).toBe(XBit.Piped); expect(bits(t.state, 3, 3)).toBe(XBit.Piped);
    line(t.host, 'pipe', 20, 20, 20, 20); expect(bits(t.state, 20, 20)).toBe(XBit.Piped);
    line(t.host, 'road', 20, 20, 20, 20); expect(bits(t.state, 20, 20)).toBe(XBit.Piped);
    place(t.host, SUBWAY_STATION, 30, 30); expect(bits(t.state, 30, 30)).toBe(XBit.Powerable | XBit.Piped);
    t.ctx.act.setXund(tileIndex(30, 30), 0x23); t.host.dispatch({ type: 'setView', x: 0, y: 0, zoom: 0, rotation: 0 });   // 任一命令触发扇出
    expect(bits(t.state, 30, 30)).toBe(XBit.Powerable);
    bulldoze(t.host, tileIndex(5, 5), tileIndex(20, 20));
    expect(bits(t.state, 5, 5)).toBe(0); expect(bits(t.state, 20, 20)).toBe(XBit.Piped);
    expect(t.host.dirty.take().tiles.length).toBeGreaterThan(0);
  });
  it('他人改位 / 改地形 → 置脏；分区码变化不置脏；自写回声不再次置脏', () => {
    const t = wiredHouse('realistic');
    const p = privOf(t.state);
    t.ctx.act.setXzon(tileIndex(50, 50), 1); t.host.dispatch({ type: 'setView', x: 0, y: 0, zoom: 0, rotation: 0 });
    expect(p.dirtyPower).toBe(false); expect(p.dirtyWater).toBe(false);
    t.ctx.act.setXbit(tileIndex(50, 50), XBit.Water, true); t.host.dispatch({ type: 'setView', x: 0, y: 0, zoom: 0, rotation: 0 });
    expect(p.dirtyWater).toBe(true); expect(p.dirtyPower).toBe(true);
    runDays(t.host, 1);
    expect(p.dirtyPower).toBe(false); expect(p.dirtyWater).toBe(false);
    t.ctx.act.setTerrain(tileIndex(51, 51), 6, 0, 6); t.host.dispatch({ type: 'setView', x: 0, y: 0, zoom: 0, rotation: 0 });
    expect(p.dirtyWater).toBe(true);
    runDays(t.host, 1);
    place(t.host, HOUSE, 60, 60);                                            // 规则自写 → 回声被过滤
    runDays(t.host, 1);
    expect(p.dirtyPower).toBe(false); expect(p.dirtyWater).toBe(false);
  });
});
