// WP13 验收：科技（发明年 ∈ [base, base+19]、2050 开局槽位 0、公告写 0、toolbar 事件恰一次、TechQuery）。
import { describe, expect, it } from 'vitest';
import { TECH_SLOT_KEYS } from '../../contracts/catalogue';
import { NewsType } from '../../contracts/events';
import { CATALOGUE } from '../../data';
import { createTestContext, runDays } from '../../testkit';
import { ofType } from './fixtures';
import { createEventsSystem } from './index';

describe('tech', () => {
  it('1900 开局：16 个槽位发明年 ∈ [base, base+19]（都 ≥ 1900 故无 0）；槽 16 为 0 且已公告', () => {
    const { state } = createTestContext({ systems: [createEventsSystem()], params: { startYear: 1900 } });
    for (let i = 0; i < 16; i++) {
      const base = CATALOGUE.TECH_BASE_YEAR[TECH_SLOT_KEYS[i]!];
      expect(state.tech.invented[i]).toBeGreaterThanOrEqual(base);
      expect(state.tech.invented[i]).toBeLessThanOrEqual(base + 19);
      expect(state.tech.announced[i]).toBe(0);
    }
    expect(state.tech.invented[16]).toBe(0); expect(state.tech.announced[16]).toBe(1);
  });

  it('2050 开局：槽位 0–3、7–11 必为 0（开局即有）并已公告；TechQuery 对应为真，未到年份的为假', () => {
    const { state, host } = createTestContext({ systems: [createEventsSystem()], params: { startYear: 2050 }, seed: 77 });
    for (const i of [0, 1, 2, 3, 7, 8, 9, 10, 11]) { expect(state.tech.invented[i]).toBe(0); expect(state.tech.announced[i]).toBe(1); }
    expect(host.q.tech.invented('gas')).toBe(true);
    expect(host.q.tech.invented('subways')).toBe(true);
    expect(host.q.tech.invented('arcoDusk')).toBe(false);                 // 2100+
    expect(host.q.tech.invented('arcoSkyward')).toBe(false);
  });

  it('每年 1 月：year ≥ invented 的未公告槽位 → 公告写 0 + techInvented + 报纸 Invention/Innovation + toolbar 恰一次', () => {
    const { host, state } = createTestContext({ systems: [createEventsSystem()], params: { startYear: 1900 }, seed: 5 });
    state.tech.invented.fill(3000); state.tech.announced.fill(0);
    state.tech.invented[0] = 1901; state.tech.invented[3] = 1901; state.tech.invented[12] = 1901;   // gas / wind / arcoPioneer
    state.tech.invented[5] = 1902;
    runDays(host, 299);
    expect(host.q.tech.invented('gas')).toBe(false);                      // 1900 年
    runDays(host, 1);                                                      // 到 age 300（1901-01-00），该日阶段尚未执行
    expect(ofType(host.drainEvents(), 'techInvented')).toHaveLength(0);
    expect(host.q.tech.invented('gas')).toBe(true);                       // 查询按年份即时成立，公告在 techCheck
    runDays(host, 1);                                                      // 执行 age 300 的 techCheck
    const ev = host.drainEvents();
    expect(ofType(ev, 'techInvented').map((e) => e.slot)).toEqual([0, 3, 12]);
    expect(ofType(ev, 'toolbar').filter((e) => e.reason === 'tech')).toHaveLength(1);
    expect(ofType(ev, 'newsStory').map((e) => [e.storyType, e.value])).toEqual([[NewsType.Invention, 0], [NewsType.Invention, 3], [NewsType.Innovation, 12]]);
    expect(state.tech.invented[0]).toBe(0); expect(state.tech.announced[0]).toBe(1);
    expect(state.tech.invented[5]).toBe(1902); expect(state.tech.announced[5]).toBe(0);
    expect(host.q.tech.invented('gas')).toBe(true);
    expect(host.q.tech.invented('fusion')).toBe(false);
    runDays(host, 300);
    expect(ofType(host.drainEvents(), 'toolbar').filter((e) => e.reason === 'tech')).toHaveLength(1);
    expect(state.tech.invented[5]).toBe(0);
    expect(host.q.news.stories().filter((s) => s.type === NewsType.Invention).length).toBeGreaterThan(0);
  });
});
