import { describe, expect, it } from 'vitest';
import { NewsType } from '../../contracts/events';
import { MISC, miscGet } from '../../contracts/io';
import type { System } from '../../contracts/system';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, nullSystem, runDays } from '../../testkit';
import { createServicesSystem } from './index';
import { daysUntil } from './testFixtures';

/** events 桩 + news 间谍（act.news 归 events）。 */
function spyEvents(profile: StubProfile, log: Array<[number, number]>): System {
  const base = nullSystem('events', profile);
  return { ...base, actions: { ...base.actions!, news: (type, value) => { log.push([type, value]); } } };
}
const mk = (profile: StubProfile, log: Array<[number, number]>, tuning?: object) =>
  createTestContext({ profile, systems: [createServicesSystem(), spyEvents(profile, log)], tuning: tuning ? { services: tuning } : undefined });

describe.each(['optimistic', 'pessimistic'] as const)('services.milestones（%s 桩）', (profile) => {
  it('严格大于：2,000 不升级、2,001 升级；事件 milestone / reward(bit0) / toolbar；news(Growth, 旧进度)', () => {
    const log: Array<[number, number]> = [];
    const { host, state } = mk(profile, log);
    state.census.normalPop = 2000;
    runDays(host, daysUntil(host, 22) + 1);
    expect(state.rewards.progression).toBe(0);
    expect(state.rewards.grantedMask).toBe(0);
    state.census.normalPop = 2001;
    host.drainEvents();
    runDays(host, 25);
    expect(state.rewards.progression).toBe(1);
    expect(state.rewards.grantedMask).toBe(1);
    const ev = host.drainEvents();
    expect(ev).toEqual(expect.arrayContaining([{ type: 'milestone', progression: 1 }, { type: 'reward', bit: 0 }, { type: 'toolbar', reason: 'reward' }]));
    expect(log.filter(([t]) => t === NewsType.Growth)).toEqual([[NewsType.Growth, 0]]);   // 其余为 cityStatus 的诉求故事
  });

  it('每月至多一级；进度 4 在 v1 只 emit militaryOffer 不挂起；不含巨型住区人口', () => {
    const log: Array<[number, number]> = [];
    const { host, state } = mk(profile, log);
    state.census.normalPop = 70_000;
    state.census.arcoPop = 5_000_000;
    runDays(host, daysUntil(host, 22) + 1);
    expect(state.rewards.progression).toBe(1);
    runDays(host, 25); expect(state.rewards.progression).toBe(2);
    runDays(host, 25); expect(state.rewards.progression).toBe(3);
    expect(state.rewards.grantedMask).toBe(0b111);
    host.drainEvents();
    runDays(host, 25);
    expect(state.rewards.progression).toBe(4);
    expect(state.clock.modalPause).toBe(0);
    expect(host.drainEvents()).toEqual(expect.arrayContaining([{ type: 'militaryOffer' }]));
    expect(state.rewards.militaryBase).toBe(0);
    runDays(host, 25);
    expect(state.rewards.progression).toBe(4);                 // 70,000 ≤ 90,000
    const growth = log.filter(([t]) => t === NewsType.Growth);
    expect(growth.map(([, v]) => v)).toEqual([0, 1, 2, 3]);
  });

  it('巨型住区位 bit4：进度 6 且已发明（乐观桩）才置位；悲观桩不置', () => {
    const log: Array<[number, number]> = [];
    const { host, state } = mk(profile, log);
    state.census.normalPop = 200_000;
    runDays(host, daysUntil(host, 22) + 1 + 25 * 5);
    expect(state.rewards.progression).toBe(6);
    expect((state.rewards.grantedMask >>> 4) & 1).toBe(profile === 'optimistic' ? 1 : 0);
    expect(state.rewards.grantedMask & 0b1111).toBe(0b1111);
  });

  it('militaryOfferModal 调参打开时：进度 4 挂起并弹 militaryOffer 模态；回答后 militaryBase = 1（v1 无选址）', () => {
    const log: Array<[number, number]> = [];
    const { host, state } = mk(profile, log, { militaryOfferModal: true });
    state.census.normalPop = 70_000;
    state.rewards.progression = 3;
    state.clock.speed = 5;
    const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 25 });
    expect(r.suspended).toBe(true);
    expect(state.clock.modalPause).toBe(1);
    expect(host.drainEvents()).toEqual(expect.arrayContaining([{ type: 'modal', id: 'militaryOffer', payload: null }]));
    expect(host.dispatch({ type: 'modalAnswer', dialog: 'militaryOffer', answer: 0 }).ok).toBe(true);
    expect(state.rewards.militaryBase).toBe(1);
    host.modalClosed();
    expect(state.clock.modalPause).toBe(0);
    expect(state.rewards.progression).toBe(4);
  });
});

describe('services.milestones（存档）', () => {
  it('.SC2 往返保留 progression / grantedMask / militaryBase / stadiumTeams / oldArrests / prisonBonus；进度 ≥ 表长不再升级', () => {
    const { host, state } = createTestContext({ systems: [createServicesSystem()] });
    const r = state.rewards;
    r.progression = 10; r.grantedMask = 0b11111; r.militaryBase = 3; r.stadiumTeams = 0b101;
    state.census.normalPop = 20_000_000;
    runDays(host, daysUntil(host, 22) + 1);
    expect(r.progression).toBe(10);
    r.oldArrests = 1234; r.prisonBonus = 1;                   // 在 1 月 facilityAnnual 之后设置（它会按监狱 / 警局重算这两项）
    const doc = host.exportSc2();
    expect(miscGet(doc.misc, MISC.cityStatus)).toBe(10);
    expect(miscGet(doc.misc, MISC.rewardsAvailable)).toBe(0b11111);
    expect(miscGet(doc.misc, MISC.militaryBase)).toBe(3);
    expect(miscGet(doc.misc, MISC.policeBonus)).toBe(1);
    host.importSc2(doc);
    expect(state.rewards).toEqual({ progression: 10, grantedMask: 0b11111, militaryBase: 3, prisonBonus: 1, oldArrests: 1234, stadiumTeams: 0b101, mayorApproval: 0 });
  });
});
