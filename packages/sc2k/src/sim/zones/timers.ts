// ===== sim/zones/timers.ts =====
// 日末 lot 计时器（spec:zones §3.4 dailyTimers；END_OF_DAY_IO.zones.usesPrng = false）：
// phaseDays++、unpoweredDays 按 q.utilities.poweredSelf 清零 / +1、施工到期完工、断电超宽限衰退一级、废弃到期变瓦砾。
// 本文件不得触碰 ctx.prng；随机选择由 growth.ts 的 hash32(age, anchor) 路径承担。
import type { SimContext } from '../../contracts/system';
import { LotClass } from './buildings';
import { declineOneStep, finishConstruction } from './growth';
import { forEachAnchor, toRubble } from './lots';
import type { ZonesCtx } from './lots';

const MAX_U16 = 0xffff, MAX_U8 = 0xff;

export function dailyTimers(ctx: SimContext, Z: ZonesCtx): void {
  const { tbl, priv, T } = Z;
  const L = ctx.state.layers, util = ctx.q.utilities;
  forEachAnchor(L, tbl, (i, b, cls) => {
    const pd = Math.min(MAX_U16, priv.phaseDays[i]! + 1);
    priv.phaseDays[i] = pd;
    if (cls === LotClass.Built) {
      const up = util.poweredSelf(i) ? 0 : Math.min(MAX_U8, priv.unpoweredDays[i]! + 1);
      priv.unpoweredDays[i] = up;
      if (up > T.unpoweredGraceDays) declineOneStep(ctx, Z, i, b);
    } else if (cls === LotClass.Construct) {
      if (pd >= T.constructDays[tbl.size[b]! - 1]!) finishConstruction(ctx, Z, i, b);
    } else if (pd >= T.abandonToRubbleDays) {
      toRubble(ctx, Z, i, tbl.size[b]!);
    }
  });
}
