// ===== sim/events/news.ts =====（spec:disasters §2.10 报纸最小版 / §3.6 伪代码）
// 故事池：news(type, value) 入池（power / cooldown）、每月衰减（decay ≤ 0 出池）、月检 6 类、组版（头条 = 最高分 + 2–3 条次要 + 天气栏）。
// 文案由 UI 按 strings 键 news.<NewsType>.headline / .body 渲染；本文件只产出数据。
import { NewsType } from '../../contracts/events';
import type { NewsStoryView, PaperView } from '../../contracts/queries';
import { dateOf } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { privOf } from './common';
import type { EventsPriv, PaperRec, StoryRec } from './priv';
import type { NewsTuning } from './tuning';

const DAYS_PER_MONTH = 25;

/** 池内排序：分高在前；同分新的在前；再按类型号。 */
const byScore = (a: StoryRec, b: StoryRec): number => b.score - a.score || b.day - a.day || a.type - b.type;

/** 入池（Actions.news 的实现）：冷却内丢弃；−1 冷却 = 一生一次；池满丢最低分。返回入池的故事（被拒 → null）。 */
export function pushStory(ctx: SimContext, t: NewsTuning, type: number, value: number): StoryRec | null {
  if (!Number.isInteger(type) || type < 0 || type >= t.rows.length) return null;
  const row = t.rows[type]!;
  if (row[0] <= 0) return null;                                    // Weather / AdviceColumn 不入池
  const P = privOf(ctx.state);
  const day = ctx.state.clock.age;
  const last = P.lastIssued[type]!;
  if (row[2] < 0 && last >= 0) return null;
  if (row[2] > 0 && last >= 0 && day - last < row[2] * DAYS_PER_MONTH) return null;
  P.lastIssued[type] = day;
  const story: StoryRec = { type, value: value | 0, score: row[0], day };
  P.pool.push(story);
  if (P.pool.length > t.maxPool) { P.pool.sort(byScore); P.pool.length = t.maxPool; }
  ctx.act.emit({ type: 'newsStory', storyType: type, value: value | 0 });
  return P.pool.includes(story) ? story : null;
}

/** 每月衰减（news 阶段）：score −= decay，≤ 0 出池。 */
export function decayPool(P: EventsPriv, t: NewsTuning): void {
  const keep: StoryRec[] = [];
  for (const s of P.pool) { s.score -= t.rows[s.type]?.[1] ?? 10; if (s.score > 0) keep.push(s); }
  P.pool = keep;
}

/**
 * 6 类月检（spec §2.10.2 #16–21；每项恰消费一次 PRNG，条件不成立也消费，保证流量稳定）。
 * crime / traffic / pollution 用 services 的图表口径；EQ / LE 用 demographics；失业率用 census。
 */
export function monthlyChecks(ctx: SimContext, t: NewsTuning): void {
  const q = ctx.q, s = ctx.state, prng = ctx.prng;
  const crime = q.services.graphCurrent('crime'), pollution = q.services.graphCurrent('pollution'), traffic = q.services.trafficReport().graph;
  const eq = s.demographics.workforceEQ, le = s.demographics.workforceLE, unemp = s.census.unemploymentPct;
  let r = prng.int(128); if (r < crime) pushStory(ctx, t, NewsType.HighCrime, crime);
  r = prng.int(128); if (r < traffic) pushStory(ctx, t, NewsType.HighTraffic, traffic);
  r = prng.int(128); if (r < pollution) pushStory(ctx, t, NewsType.HighPollution, pollution);
  r = prng.int(128); if (eq < 80 && r < 100 - eq) pushStory(ctx, t, NewsType.PoorEducation, eq);
  r = prng.int(128); if (le < 60 && r < 80 - le) pushStory(ctx, t, NewsType.PoorHealth, le);
  r = prng.int(32); if (unemp > r + 5) pushStory(ctx, t, NewsType.PoorEmployment, unemp);
}

/**
 * 组版：头条 = 号外的触发故事 lead，否则池中最高分（空池 → Junk）；正文 = 其后 bodyStories 条（类型互异）+ 天气栏（value = heat − 100）。
 * consume = 把刊出的故事移出池（号外 / 订阅选项关闭时只组版不消费，故事留待下一份）。
 */
export function composePaper(ctx: SimContext, t: NewsTuning, extra: boolean, consume: boolean, lead: StoryRec | null = null): PaperRec {
  const s = ctx.state, P = privOf(s), w = s.weather;
  const sorted = P.pool.slice().sort(byScore);
  const used: StoryRec[] = [];
  const top = lead && P.pool.includes(lead) ? lead : sorted[0];
  const headline = top ?? { type: NewsType.Junk, value: 0, score: 0, day: s.clock.age };
  if (top) used.push(top);
  const body: StoryRec[] = [];
  const seen = new Set<number>([headline.type]);
  for (let k = 0; k < sorted.length && body.length < t.bodyStories; k++) {
    const st = sorted[k]!;
    if (st === top || seen.has(st.type)) continue;
    seen.add(st.type); body.push(st); used.push(st);
  }
  body.push({ type: NewsType.Weather, value: w.heat - 100, score: 0, day: s.clock.age });
  if (consume && used.length > 0) P.pool = P.pool.filter((x) => !used.includes(x));
  const d = dateOf(s.clock);
  const rec: PaperRec = {
    year: d.year, month: d.month, extra,
    headline: [{ ...headline }], stories: body.map((x) => ({ ...x })),
    heat: w.heat, wind: w.wind, humid: w.humid, trend: w.trend, season: w.season,
  };
  P.paper = [rec];
  return rec;
}

const toView = (s: StoryRec): NewsStoryView => ({ type: s.type, value: s.value, power: s.score, monthIndex: Math.floor(s.day / DAYS_PER_MONTH) });

export function paperView(P: EventsPriv): PaperView | null {
  const rec = P.paper[0];
  if (!rec) return null;
  const h = rec.headline[0];
  return {
    year: rec.year, month: rec.month, extra: rec.extra,
    headline: h ? toView(h) : null, stories: rec.stories.map(toView),
    weather: { heat: rec.heat, wind: rec.wind, humid: rec.humid, trend: rec.trend, season: (rec.season & 3) as 0 | 1 | 2 | 3 },
  };
}
export function storiesView(P: EventsPriv): NewsStoryView[] { return P.pool.slice().sort(byScore).map(toView); }

/** 报纸选项（订阅 / 号外）：暂以 rawMisc 的 MISC 0x1004 / 0x1008 为真源（非零 = 开）；见 contract-rfc.md。 */
export const PAPER_DELIVERY_OFF = 0x1004 >> 2, EXTRA_PAPER_OFF = 0x1008 >> 2;
export const paperDeliveryOn = (s: CityState): boolean => s.rawMisc[PAPER_DELIVERY_OFF] !== 0;
export const extraPaperOn = (s: CityState): boolean => s.rawMisc[EXTRA_PAPER_OFF] !== 0;
