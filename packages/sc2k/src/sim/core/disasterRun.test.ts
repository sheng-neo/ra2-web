// ===== sim/core/disasterRun.test.ts =====（contract-rfc WP13-6 / open-questions #28：灾害与日历的衔接，INT-A）
// 真 events + 桩其余系统：中途一次灾害（菜单请求 / 随机掷出）时 runDays（advance 路径）不停滞、灾害自然结束后日历继续；
// 同 seed 双跑逐位相同；replay（stepDay + settleTicks 路径）= 原跑；灾害进行中的快照载入后续跑与不中断一致。
import { describe, expect, it } from 'vitest';
import { CityMode, DisasterKind, TileMarker, tileIndex } from '../../contracts/grid';
import type { StubProfile } from '../../contracts/testkit';
import type { TestContext } from '../../contracts/testkit';
import { createEventsSystem } from '../events';
import { placeBuilding } from '../events/fixtures';
import { createTestContext, runDays, runScript } from '../../testkit';

const HOUSE = 0x70;
const PROFILE: StubProfile = 'optimistic';

/** 真 events + 乐观桩 + 一片 1×1 住宅（可燃）。 */
function city(seed: number, tuning?: object): TestContext {
  const tc = createTestContext({ systems: [createEventsSystem()], profile: PROFILE, seed, tuning: tuning ? { events: tuning } : undefined });
  for (let x = 40; x < 48; x++) for (let y = 40; y < 46; y++) placeBuilding(tc.ctx, HOUSE, x, y, 1);
  tc.host.drainEvents();
  return tc;
}
const rubbleCount = (tc: TestContext): number => { let n = 0; for (let i = 0; i < 16384; i++) { const b = tc.state.layers.xbld[i]!; if (b >= 0x01 && b <= 0x04) n++; } return n; };
const FIRE_AT = { type: 'requestDisaster', kind: DisasterKind.Fire, x: 43, y: 42 } as const;

describe('disasterRun: 中途一次灾害（菜单请求）', () => {
  it('runDays 跨过灾害：启动 → 逐 tick 烧尽 → 回到城市模式 → 日历走到目标；双跑哈希相同；重放 = 原跑', () => {
    const run = (): TestContext => {
      const tc = city(7);
      runDays(tc.host, 30);
      expect(tc.host.dispatch(FIRE_AT).ok).toBe(true);
      runDays(tc.host, 120);
      return tc;
    };
    const a = run();
    expect(a.state.clock.age).toBe(150);
    expect(a.state.clock.mode).toBe(CityMode.City);
    expect(a.state.disaster.active).toBe(false); expect(a.state.disaster.pending).toBe(DisasterKind.None);
    expect(a.state.clock.disasterTicks).toBeGreaterThan(0);
    expect(rubbleCount(a)).toBeGreaterThan(0);                                               // 真的烧掉了房子
    expect(a.host.q.disasters.markers().every((m) => m === 0)).toBe(true);
    const ev = a.host.drainEvents();
    expect(ev.filter((e) => e.type === 'disasterStarted')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'disasterEnded')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'modeChanged').map((e) => e.mode)).toEqual([CityMode.Disaster, CityMode.City]);
    const b = run();
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    expect(b.state.clock.disasterTicks).toBe(a.state.clock.disasterTicks);
    // 重放：同夹具 + 同日志，走 stepDay + settleTicks 路径
    const log = a.host.commandLog();
    expect(log.map((l) => [l.age, l.phaseCursor, l.cmd.type])).toEqual([[30, 0, 'requestDisaster']]);
    const c = city(7);
    runScript(c.host, log, 150);
    expect(c.state.clock.age).toBe(150);
    expect(c.host.hash('full')).toBe(a.host.hash('full')); expect(c.host.hash('sc2')).toBe(a.host.hash('sc2'));
    expect(c.state.clock.disasterTicks).toBe(a.state.clock.disasterTicks);
  });
  it('灾害进行中的快照：载入后处于同一灾害态，续跑与不中断一致', () => {
    const a = city(11);
    runDays(a.host, 10);
    a.host.dispatch(FIRE_AT);
    a.state.clock.speed = 5;
    // 一帧 advance(0)：pending 置位 → 先跑一次物件 tick 启动灾害（弹出 disasterAlert），不推进日历
    expect(a.host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 1 })).toEqual({ daysRun: 0, suspended: true });
    expect(a.state.clock.mode).toBe(CityMode.Disaster); expect(a.state.clock.age).toBe(10);
    a.host.modalClosed();
    expect(a.host.q.disasters.marker(tileIndex(43, 42))).toBe(TileMarker.Fire);
    const bytes = a.host.saveSnapshot();
    const b = createTestContext({ systems: [createEventsSystem()], profile: PROFILE, seed: 99 });
    expect(b.host.loadSnapshot(bytes).filter((d) => d.level !== 'info')).toEqual([]);
    expect(b.state.clock.mode).toBe(CityMode.Disaster); expect(b.state.disaster.active).toBe(true);
    expect(b.host.q.disasters.marker(tileIndex(43, 42))).toBe(TileMarker.Fire);
    runDays(a.host, 60); runDays(b.host, 60);
    expect(a.state.clock.age).toBe(70); expect(a.state.clock.mode).toBe(CityMode.City);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    expect(b.state.clock.disasterTicks).toBe(a.state.clock.disasterTicks);
  });
});

describe('disasterRun: 随机灾害长跑', () => {
  const EVERY_MONTH = { graceDays: [0, 0, 0, 0], monthlyChance: [0, 1, 1, 1] };
  it('月概率 1 的两年：每月掷出的灾害都在日边界启动并自然结束；runDays 与 replay 路径逐位相同', () => {
    const a = city(3, EVERY_MONTH);
    runDays(a.host, 600);
    expect(a.state.clock.age).toBe(600); expect(a.state.clock.mode).toBe(CityMode.City);
    const ev = a.host.drainEvents();
    const started = ev.filter((e) => e.type === 'disasterStarted').length;
    expect(started).toBeGreaterThanOrEqual(12);                                              // 24 个月：前置不满足的月份只发 message
    expect(ev.filter((e) => e.type === 'disasterEnded')).toHaveLength(started);
    expect(a.state.clock.disasterTicks).toBeGreaterThan(started);
    const b = city(3, EVERY_MONTH);
    runScript(b.host, [], 600);                                                               // replayInto：stepDay + settleTicks
    expect(b.state.clock.age).toBe(600);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    expect(b.state.clock.disasterTicks).toBe(a.state.clock.disasterTicks);
  });
});
