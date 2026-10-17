import { describe, expect, it } from 'vitest';
import { NewsType } from '../../contracts/events';
import { XBit, tileIndex } from '../../contracts/grid';
import type { SimEvent } from '../../contracts/events';
import type { System } from '../../contracts/system';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, nullSystem, runDays } from '../../testkit';
import { createServicesSystem } from './index';
import { build, daysUntil, flush, roadLine } from './testFixtures';
import { Xbld } from './tables';

function spyEvents(profile: StubProfile, log: number[]): System {
  const base = nullSystem('events', profile);
  return { ...base, actions: { ...base.actions!, news: (type) => { log.push(type); } } };
}

/** 推进到下一个第 24 天并返回当天的 complaint 键（事件 complaint.key）。 */
function nextComplaint(host: ReturnType<typeof createTestContext>['host']): string | null | undefined {
  host.drainEvents();
  runDays(host, daysUntil(host, 24, true) + 1);
  const ev = host.drainEvents().filter((e): e is Extract<SimEvent, { type: 'complaint' }> => e.type === 'complaint');
  expect(ev).toHaveLength(1);
  return ev[0]!.key;
}

describe.each(['optimistic', 'pessimistic'] as const)('services.cityStatus（%s 桩）', (profile) => {
  it('空城无诉求；电力 ≥ 99% 最优先；道路容量次之', () => {
    const log: number[] = [];
    const { host, state } = createTestContext({ profile, systems: [createServicesSystem(), spyEvents(profile, log)] });
    expect(nextComplaint(host)).toBeNull();
    state.census.normalPop = 500;
    expect(nextComplaint(host)).toBe('complaint.road');
    state.utilities.power.usagePct = 99;
    expect(nextComplaint(host)).toBe('complaint.power');
    expect(log.filter((t) => t !== NewsType.Growth)).toEqual([NewsType.DemandTransit, NewsType.DemandPower]);
  });

  it('诉求链顺序：警 → 消 → (水) → 医院 → 学校 → 海港 / 连接 → 机场 → 休闲；满足一项后进入下一项', () => {
    const log: number[] = [];
    const { ctx, host, state } = createTestContext({ profile, systems: [createServicesSystem(), spyEvents(profile, log)] });
    // 1,500 人：需要 16 格以上道路，然后第 1 座警局 / 消防局
    state.census.normalPop = 1500;
    roadLine(ctx, 10, 2, 25, 2);
    flush(host);
    expect(nextComplaint(host)).toBe('complaint.police');
    build(ctx, Xbld.Police, 10, 10); flush(host);
    expect(nextComplaint(host)).toBe('complaint.fire');
    build(ctx, Xbld.Fire, 20, 10); flush(host);
    expect(nextComplaint(host)).toBeNull();                        // < 3,000 人到此为止
    // 30,000 人：道路 ≥ 301 格、警 + 监狱 ≥ 2、消防 2、医院 2、学校 2
    state.census.normalPop = 30_000;
    roadLine(ctx, 0, 4, 127, 4); roadLine(ctx, 0, 6, 127, 6); roadLine(ctx, 0, 8, 44, 8);
    flush(host);
    expect(nextComplaint(host)).toBe('complaint.police');
    build(ctx, Xbld.Prison, 30, 10); flush(host);                 // 监狱可顶替警局计数
    expect(nextComplaint(host)).toBe('complaint.fire');
    build(ctx, Xbld.Fire, 40, 10); flush(host);
    state.utilities.water.usagePct = 100;
    expect(nextComplaint(host)).toBe('complaint.water');
    state.utilities.water.usagePct = 50;
    expect(nextComplaint(host)).toBe('complaint.hospital');
    build(ctx, Xbld.Hospital, 50, 10); flush(host);
    expect(nextComplaint(host)).toBe('complaint.hospital');       // 30,000 / 25,000 = 1 ≥ 1
    build(ctx, Xbld.Hospital, 60, 10); flush(host);
    expect(nextComplaint(host)).toBe('complaint.school');
    build(ctx, Xbld.School, 70, 10); build(ctx, Xbld.School, 80, 10); flush(host);
    expect(nextComplaint(host)).toBeNull();
    // 工业 20,000 人：起重机 + 工业连接 0 < 2 → 无水体则 connection，有水体则 seaport
    state.census.ind = 20_000;
    expect(nextComplaint(host)).toBe('complaint.connection');
    state.layers.xbit[tileIndex(120, 120)] = state.layers.xbit[tileIndex(120, 120)]! | XBit.Water;
    expect(nextComplaint(host)).toBe('complaint.seaport');
    for (let k = 0; k < 2; k++) ctx.act.setXbld(tileIndex(100 + k, 100), Xbld.Crane);
    flush(host);
    expect(nextComplaint(host)).toBeNull();
    // 商业 20,000 人：跑道组 + 商业连接 0 < 2 → 机场
    state.census.com = 20_000;
    expect(nextComplaint(host)).toBe('complaint.airport');
    for (let k = 0; k < 10; k++) ctx.act.setXbld(tileIndex(90 + k, 90), Xbld.Runway);
    flush(host);
    expect(nextComplaint(host)).toBeNull();
    // 休闲：R 人口撞上休闲 cap → 随机四选一（消费 PRNG）
    state.caps.r = 5000; state.census.res = 6000;
    const before = ctx.prng.state();
    const rec = nextComplaint(host);
    expect(['complaint.park', 'complaint.zoo', 'complaint.stadium', 'complaint.marina']).toContain(rec);
    expect(ctx.prng.state()).not.toBe(before);
    expect(log.filter((t) => t !== NewsType.Growth)).toEqual([
      NewsType.DemandPolice, NewsType.DemandFire, NewsType.DemandPolice, NewsType.DemandFire, NewsType.DemandWater,
      NewsType.DemandHospital, NewsType.DemandHospital, NewsType.DemandSchool, NewsType.DemandIndustrialConnection, NewsType.DemandSeaport,
      NewsType.DemandAirport, expect.any(Number)]);
  });

  it('命中时同时发 citizenDemand；无诉求时只发 complaint{key:null}', () => {
    const { host, state } = createTestContext({ profile, systems: [createServicesSystem()] });
    state.census.normalPop = 1500;
    host.drainEvents();
    runDays(host, daysUntil(host, 24) + 1);
    const ev = host.drainEvents();
    expect(ev).toEqual(expect.arrayContaining([{ type: 'complaint', key: 'complaint.road' }, { type: 'citizenDemand', key: 'complaint.road' }]));
    state.census.normalPop = 0;
    host.drainEvents();
    runDays(host, 25);
    const ev2 = host.drainEvents();
    expect(ev2.filter((e) => e.type === 'complaint')).toEqual([{ type: 'complaint', key: null }]);
    expect(ev2.some((e) => e.type === 'citizenDemand')).toBe(false);
  });
});

describe('services.demographics（v1 简化）', () => {
  it('空城三项为 0；有人口时 workforcePct = 50 + 教育加成（≤ 5）、EQ / LE 有界；写入 MISC 0x0044/0x0048/0x004C', () => {
    const { ctx, host, state } = createTestContext({ profile: 'optimistic', systems: [createServicesSystem()] });
    runDays(host, daysUntil(host, 21) + 1);
    expect([state.demographics.workforcePct, state.demographics.workforceEQ, state.demographics.workforceLE]).toEqual([0, 0, 0]);
    state.census.normalPop = 3000;
    state.economy.funding[3] = 100; state.economy.funding[4] = 100; state.economy.funding[2] = 100;
    runDays(host, 25);
    expect(state.demographics.workforcePct).toBe(50);
    expect(state.demographics.workforceEQ).toBe(85);
    expect(state.demographics.workforceLE).toBe(60);
    build(ctx, Xbld.School, 10, 10); build(ctx, Xbld.College, 20, 10); build(ctx, Xbld.Hospital, 30, 10); flush(host);
    runDays(host, 25);
    // schoolCap 15 + collegeCap 50 = 65 → 65,000 / 3001 = 21‰ → +5（封顶）；healthCap 25 → 8‰ → LE 60 + 24 = 84
    expect(state.demographics.workforcePct).toBe(55);
    expect(state.demographics.workforceEQ).toBe(110);
    expect(state.demographics.workforceLE).toBe(84);
    const doc = host.exportSc2();
    expect([doc.misc[0x0044 >> 2], doc.misc[0x0048 >> 2], doc.misc[0x004c >> 2]]).toEqual([55, 84, 110]);
    host.importSc2(doc);
    expect([state.demographics.workforcePct, state.demographics.workforceLE, state.demographics.workforceEQ]).toEqual([55, 84, 110]);
  });
});
