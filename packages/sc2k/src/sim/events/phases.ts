// ===== sim/events/phases.ts =====（contracts/clock：techCheck（第 0 天 1 月）/ weatherAndDisaster / news（第 24 天））
// weatherAndDisaster：为下月生成天气 → emit weatherChanged → 宽限期 / 月概率 / 前置条件 / 权重抽样写 pending。
// news：故事池月衰减 → 6 类月检 → month ∈ paperMonths 组订阅版（emit paper + modal newspaper + suspend；订阅关闭时只发事件）。
import { DisasterKind } from '../../contracts/grid';
import { dateOf } from '../../contracts/state';
import type { PhaseRunner, SimContext } from '../../contracts/system';
import { privOf, tuningOf } from './common';
import { hasFlammable } from './fire';
import { floodOriginCandidates } from './flood';
import { composePaper, decayPool, monthlyChecks, paperDeliveryOn } from './news';
import { announceDue } from './tech';
import { Trend } from './tuning';
import type { EventsTuning } from './tuning';
import { generateWeather } from './weather';

export const techCheck: PhaseRunner = (ctx) => { announceDue(ctx); return 'done'; };

/** 地图是否有"与水相邻的陆地格"（洪水前置；不消费 PRNG）。 */
const hasShore = (ctx: SimContext): boolean => floodOriginCandidates(ctx).length > 0;

/** 月随机判定（spec §2.3.1 / §2.3.3）：只约束随机灾害。 */
function rollDisaster(ctx: SimContext, T: EventsTuning): void {
  const s = ctx.state, D = s.disaster;
  if (D.noDisasters || D.active || D.pending !== DisasterKind.None) return;
  const diff = s.economy.difficulty;
  if (s.clock.age < (T.graceDays[diff] ?? 0)) return;
  if (ctx.prng.float() >= (T.monthlyChance[diff] ?? 0)) return;
  const eligible: { kind: DisasterKind; w: number }[] = [];
  if (hasFlammable(ctx)) eligible.push({ kind: DisasterKind.Fire, w: T.weights.fire });
  if (hasShore(ctx)) eligible.push({ kind: DisasterKind.Flood, w: T.weights.flood });
  eligible.push({ kind: DisasterKind.Earthquake, w: T.weights.earthquake });
  if (s.weather.trend === Trend.Tornado) eligible.push({ kind: DisasterKind.Tornado, w: T.weights.tornado });
  if (s.census.normalPop >= T.monsterMinPop) eligible.push({ kind: DisasterKind.Monster, w: T.weights.monster });
  let total = 0;
  for (const e of eligible) total += e.w;
  if (total <= 0) return;
  let r = ctx.prng.int(total);
  for (const e of eligible) { r -= e.w; if (r < 0) { D.pending = e.kind; privOf(s).pendingAt = -1; return; } }
}

export const weatherAndDisaster: PhaseRunner = (ctx) => {
  const T = tuningOf(ctx), s = ctx.state;
  const next = (dateOf(s.clock).month + 1) % 12;
  const w = generateWeather(T.weather, ctx.prng, next, s.terrain.coast);
  s.weather.heat = w.heat; s.weather.wind = w.wind; s.weather.humid = w.humid; s.weather.trend = w.trend; s.weather.season = w.season;
  ctx.act.emit({ type: 'weatherChanged', weather: { ...s.weather } });
  rollDisaster(ctx, T);
  return 'done';
};

export const news: PhaseRunner = (ctx) => {
  const T = tuningOf(ctx), s = ctx.state, P = privOf(s);
  decayPool(P, T.news);
  monthlyChecks(ctx, T.news);
  const month = dateOf(s.clock).month;
  if (!T.news.paperMonths.includes(month)) return 'done';
  const on = paperDeliveryOn(s);
  composePaper(ctx, T.news, false, on);
  ctx.act.emit({ type: 'paper', extra: false });
  if (!on) return 'done';
  ctx.act.emit({ type: 'modal', id: 'newspaper', payload: { extra: false } });
  return 'suspend';
};
