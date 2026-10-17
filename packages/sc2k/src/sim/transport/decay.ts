// ===== sim/transport/decay.ts =====（spec:transport §2.15 预算衰败、§3.7 budgetTick、§4.16 / §4.17）
// growthVisit(x, y)：资金率 < 100% 时按条目掷骰——高速 2×2 块（偶数锚点一次）/ 桥格（wind + rand(0..49) ≥ funding，坍塌 + 报纸 + 居中）/
// 道路 / 铁路（rand(0..99) ≥ funding → 瓦砾并清 POWERABLE）/ 地铁段（subwayDecays）。funding == 100 不掷骰、零 PRNG 消费。
// 隧道衰败留 v2（tunnelLevels 没有写入 action）。写入一律经 act.set*，缓存由 onTilesChanged 的扇出同步。
import { Corner, XBit, inMap, tileIndex } from '../../contracts/grid';
import { NewsType } from '../../contracts/events';
import { isBridge, isHighway, isOnramp, isRail, isRoad } from '../../contracts/net';
import { BudgetLine } from '../../contracts/state';
import { rubbleIdFor, undWithoutSubway } from './model';
import type { Runtime } from './runtime';

const isSubwayTile = (u: number): boolean => (u >= 0x01 && u <= 0x0f) || u === 0x1f || u === 0x20;

export function growthVisit(rt: Runtime, x: number, y: number): void {
  const T = rt.tune;
  const act = rt.act, prng = rt.prng, q = rt.q;
  if (!T.budgetDecay || !act || !prng || !q) return;
  const L = rt.state.layers;
  const i = tileIndex(x, y);
  const id = L.xbld[i]!;
  /** roll(line)：先比较 != 100 再掷骰（§4.17）。 */
  const roll = (line: BudgetLine): boolean => { const f = q.economy.funding(line); return f !== 100 && prng.int(100) >= f; };
  const rubble = (t: number, tx: number, ty: number, cause: 'DECAY' | 'BRIDGE'): void => {
    const old = L.xbld[t]!;
    act.setXbld(t, cause === 'BRIDGE' ? 0 : rubbleIdFor(tx, ty));
    if ((L.xzon[t]! & Corner.All) !== 0) act.setXzon(t, L.xzon[t]! & ~Corner.All);
    if ((L.xbit[t]! & (XBit.Powerable | XBit.Powered)) !== 0) act.setXbit(t, XBit.Powerable | XBit.Powered, false);
    act.emit({ type: 'structureDestroyed', x: tx, y: ty, oldId: old, cause });
  };

  if (isHighway(id) && !isBridge(id) && !isOnramp(id)) {
    // 高速块：只在偶数锚点判定一次，整块 4 格变废墟（水块上的段清空）
    if ((x & 1) === 0 && (y & 1) === 0 && roll(BudgetLine.Highways)) {
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
        const tx = x + dx, ty = y + dy;
        if (!inMap(tx, ty)) continue;
        const t = tileIndex(tx, ty);
        const tid = L.xbld[t]!;
        if (!isHighway(tid) || isBridge(tid)) continue;
        if (q.terrain.isWater(t)) { act.setXbld(t, 0); act.emit({ type: 'structureDestroyed', x: tx, y: ty, oldId: tid, cause: 'DECAY' }); }
        else rubble(t, tx, ty, 'DECAY');
      }
    }
  } else if (isBridge(id)) {
    const f = q.economy.funding(BudgetLine.Bridges);
    if (f !== 100 && rt.state.weather.wind + prng.int(T.bridgeDecayRoll) >= f) {
      rubble(i, x, y, 'BRIDGE');
      act.emit({ type: 'bridgeCollapse', x, y });
      act.emit({ type: 'goto', x, y, smooth: true });
      act.news(NewsType.BridgeCollapse, 1);
    }
  } else if (isOnramp(id)) {
    if (roll(BudgetLine.Highways)) rubble(i, x, y, 'DECAY');          // 匝道计入 Highways（按 1 格）
  } else if (isRoad(id)) {
    if (roll(BudgetLine.Roads)) rubble(i, x, y, 'DECAY');
  } else if (isRail(id)) {
    if (roll(BudgetLine.Rail)) rubble(i, x, y, 'DECAY');
  }
  const u = L.xund[i]!;
  if (T.subwayDecays && isSubwayTile(u) && roll(BudgetLine.Subway)) act.setXund(i, undWithoutSubway(u));   // 地铁段塌陷
}
