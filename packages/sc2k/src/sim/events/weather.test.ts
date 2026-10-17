// WP13 验收：天气（权重行和 = 100、非海岸图无 Hurricane、取值范围、每月第 24 天 weatherChanged）。
import { describe, expect, it } from 'vitest';
import { createPrng } from '../../contracts/prng';
import { createTestContext, runDays } from '../../testkit';
import { ofType } from './fixtures';
import { createEventsSystem } from './index';
import { DEFAULT_EVENTS_TUNING, Trend } from './tuning';
import { generateWeather } from './weather';

const W = DEFAULT_EVENTS_TUNING.weather;

describe('weather', () => {
  it('四季权重行各合计 100，季节表覆盖 12 个月', () => {
    expect(W.weights).toHaveLength(4);
    for (const row of W.weights) { expect(row).toHaveLength(12); expect(row.reduce((a, b) => a + b, 0)).toBe(100); }
    expect(W.seasonOfMonth).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0]);
  });

  it('generateWeather：非海岸图永不 Hurricane（并入 Windy）、海岸图夏季会出现；heat / wind / humid 在范围内；恰消费 4 次 PRNG', () => {
    const prng = createPrng(2024);
    let hurricaneCoast = 0, hurricaneInland = 0;
    for (let k = 0; k < 3000; k++) {
      const month = k % 12;
      const s0 = prng.state();
      const inland = generateWeather(W, prng, month, false);
      const used = (() => { const p2 = createPrng(s0); let n = 0; while (p2.state() !== prng.state() && n < 10) { p2.next32(); n++; } return n; })();
      expect(used).toBe(4);
      const coast = generateWeather(W, prng, month, true);
      for (const w of [inland, coast]) {
        expect(w.trend).toBeGreaterThanOrEqual(0); expect(w.trend).toBeLessThanOrEqual(11);
        expect(w.heat).toBeGreaterThanOrEqual(100); expect(w.heat).toBeLessThanOrEqual(220);
        expect(w.wind).toBeGreaterThanOrEqual(0); expect(w.wind).toBeLessThanOrEqual(255);
        expect(w.humid).toBeGreaterThanOrEqual(0); expect(w.humid).toBeLessThanOrEqual(255);
        expect(w.season).toBe(W.seasonOfMonth[month]);
      }
      if (inland.trend === Trend.Hurricane) hurricaneInland++;
      if (coast.trend === Trend.Hurricane) hurricaneCoast++;
    }
    expect(hurricaneInland).toBe(0);
    expect(hurricaneCoast).toBeGreaterThan(0);
  });

  it('weatherAndDisaster 阶段：每月第 24 天恰发一次 weatherChanged，内容与 state.weather 一致；非海岸城市 24 个月无飓风天', () => {
    const { host, state } = createTestContext({ systems: [createEventsSystem()], seed: 9 });
    runDays(host, 600);
    const ev = ofType(host.drainEvents(), 'weatherChanged');
    expect(ev).toHaveLength(24);
    expect(ev.at(-1)!.weather).toEqual(state.weather);
    for (const e of ev) expect(e.weather.trend).not.toBe(Trend.Hurricane);
    expect(state.weather.season).toBe(W.seasonOfMonth[0]);                 // 第 24 个月末为下月（1 月 → 冬）生成
  });
});
