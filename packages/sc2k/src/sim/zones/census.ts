// ===== sim/zones/census.ts =====
// 人口汇总与税基（spec:zones §2.7 / §3.3）：按 TL 锚点逐栋求和（断电按 0）、巨型住区分摊份额进税基、
// workforcePctUsed = demographics.workforcePct || 50、劳动力 / 岗位 / 失业。census.arcoPop 是 services 写入的只读输入（MISC 0x1020）。
import type { SimContext } from '../../contracts/system';
import { LotClass } from './buildings';
import { forEachAnchor } from './lots';
import type { ZonesCtx } from './lots';
import { clampInt } from './tuning';
import type { Ratio } from './tuning';

const share = (pop: number, r: Ratio): number => Math.floor((pop * r.num) / r.den);

export function tallyCensus(ctx: SimContext, Z: ZonesCtx): void {
  const { tbl, T } = Z;
  const s = ctx.state, L = s.layers, util = ctx.q.utilities;
  const pop = [0, 0, 0], tiles = [0, 0, 0];
  forEachAnchor(L, tbl, (i, b, cls) => {
    if (cls !== LotClass.Built) return;
    const zi = tbl.zoneIdx[b]!, n = tbl.size[b]!;
    tiles[zi]! += n * n;
    if (!T.countUnpowered && !util.poweredSelf(i)) return;
    pop[zi]! += tbl.pop[b]!;
  });
  const c = s.census;
  const arco = Math.max(0, Math.floor(c.arcoPop)) || 0;
  const res = pop[0]!, com = pop[1]!, ind = pop[2]!;
  c.res = res; c.com = com; c.ind = ind;
  c.arcoPop = arco;
  c.normalPop = res + com + ind;
  c.citySize = c.normalPop + arco;
  c.taxableRes = res + share(arco, T.arcoShare.res);
  c.taxableCom = com + share(arco, T.arcoShare.com);
  c.taxableInd = ind + share(arco, T.arcoShare.ind);
  const pct = clampInt(Math.floor(s.demographics.workforcePct) || T.workforcePctFallback, 1, 100);
  c.workforcePctUsed = pct;
  c.workforce = Math.floor((c.taxableRes * pct) / 100);
  c.jobs = c.taxableCom + c.taxableInd;
  const employed = Math.min(c.workforce, c.jobs);
  c.unemployedN = c.workforce - employed;
  c.unemploymentPct = c.workforce > 0 ? Math.round((100 * c.unemployedN) / c.workforce) : 0;
  c.tiles.res = tiles[0]!; c.tiles.com = tiles[1]!; c.tiles.ind = tiles[2]!;
  c.tiles.total = tiles[0]! + tiles[1]! + tiles[2]!;
}
