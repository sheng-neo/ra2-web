import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../contracts/grid';
import { BudgetLine } from '../../contracts/state';
import { createTestContext, runDays } from '../../testkit';
import { createServicesSystem } from './index';
import { readRecord } from './microsim';
import { score } from './phases';
import { Xbld } from './tables';
import { build, daysUntil, flush } from './testFixtures';

describe('services.facilityAnnual（每年 1 月）', () => {
  it('score：ratio < best → 12；< zero → (zero−1−ratio)/slope；否则 0', () => {
    expect(score(10 * 40, 10, [5, 50, 111])).toBe(12);       // ratio 40
    expect(score(10 * 60, 10, [5, 50, 111])).toBe(10);       // ratio 60 → (110−60)/5
    expect(score(10 * 200, 10, [5, 50, 111])).toBe(0);
    expect(score(100, 0, [3, 15, 52])).toBe(0);              // den 0 → max(1)
  });

  it('1 月第 0 天按记录序更新：警局 stat0 = 资金%、消防 stat2 = 人数>>4 + 1、医院 stat3 = fund/2、学校 fund < 80 → fundEducation；监狱加成', () => {
    const { ctx, host, state } = createTestContext({ profile: 'optimistic', systems: [createServicesSystem()], params: { startYear: 1950 } });
    runDays(host, 1);                                        // 跳过新城当天（age 0 也是 1 月第 0 天，facilityAnnual 会跑一次）
    state.census.normalPop = 40_000;
    state.economy.funding[BudgetLine.Police] = 90; state.economy.funding[BudgetLine.Fire] = 100; state.economy.funding[BudgetLine.Health] = 80; state.economy.funding[BudgetLine.Schools] = 60;
    const police = ctx.act.allocMicrosim(Xbld.Police); build(ctx, Xbld.Police, 10, 10);
    const fire = ctx.act.allocMicrosim(Xbld.Fire); build(ctx, Xbld.Fire, 20, 10);
    const hosp = ctx.act.allocMicrosim(Xbld.Hospital); build(ctx, Xbld.Hospital, 30, 10);
    const school = ctx.act.allocMicrosim(Xbld.School); build(ctx, Xbld.School, 40, 10);
    const prison = ctx.act.allocMicrosim(Xbld.Prison); build(ctx, Xbld.Prison, 50, 10);
    flush(host);
    host.drainEvents();
    runDays(host, daysUntil(host, 0, true) + 25 * 11 + 1);   // 下一年 1 月第 0 天跑完
    const X = state.layers.xmic;
    expect(readRecord(X, police).stat0).toBe(90);
    expect(readRecord(X, police).stat1).toBe(Math.min(180, Math.trunc(40_000 / 90)));
    const f = readRecord(X, fire);
    expect(f.stat0).toBe(100); expect(f.stat1).toBe(50); expect(f.stat2).toBe((50 >> 4) + 1); expect(f.stat3).toBeGreaterThanOrEqual(2);
    expect(readRecord(X, hosp).stat3).toBe(40);
    expect(readRecord(X, school).stat3).toBe(15);
    expect(host.drainEvents()).toEqual(expect.arrayContaining([{ type: 'fundEducation' }]));
    const p = readRecord(X, prison);
    expect([p.stat1, p.stat2, p.stat3, p.stat0]).toEqual([0, 270, 0, 0]);   // 首年无逮捕：囚犯 0、狱警 popCap(3·90, 120) = 270、容量% 0、越狱 0
    expect(state.rewards.prisonBonus).toBe(1);               // 监狱 ≥ 1 且容量 % ≤ 79
    expect(ctx.q.services.queryStats(tileIndex(10, 10))).toEqual(expect.arrayContaining([{ key: 'query.funding', value: 90 }, { key: 'query.officers', value: readRecord(X, police).stat1 }]));
  });
});
