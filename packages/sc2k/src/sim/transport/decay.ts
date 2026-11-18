// ===== sim/transport/decay.ts =====（spec:transport §2.15 预算衰败、§3.7 budgetTick、§4.16 / §4.17 / §4.18）
// growthVisit(x, y)：资金率 < 100% 时按条目掷骰——高速 2×2 块（偶数锚点一次）/ 桥格（wind + rand(0..49) ≥ funding → 整座桥坍塌 + 报纸 + 居中）/
// 道路 / 铁路（rand(0..99) ≥ funding → 瓦砾并清 POWERABLE）/ 地铁段（subwayDecays）。funding == 100 不掷骰、零 PRNG 消费。
// 变瓦砾 / 清空之后对四邻的电线 / 道路 / 铁路平地片段重新选片（与推土机 refreshSurface 同口径），不留指向瓦砾的三岔 / 弯。
// 本函数随生长扫描对每格调用（16384 次 / 月）：热路径不分配闭包 / 数组，非网络格直接返回。
// 隧道衰败留 v2（tunnelLevels 没有写入 action）。写入一律经 act.set*，缓存由 onTilesChanged 的扇出同步。
import { Corner, DX, DY, XBit, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { NewsType } from '../../contracts/events';
import { isBridge, isHighway, isOnramp, isRail, isRoad } from '../../contracts/net';
import { BudgetLine } from '../../contracts/state';
import { familyPieceIdx, rubbleIdFor, undWithoutSubway } from './model';
import type { SurfaceFamily } from './model';
import { pieceFor } from './piece';
import type { Runtime } from './runtime';
import { slopeAt } from './runtime';

const isSubwayTile = (u: number): boolean => (u >= 0x01 && u <= 0x0f) || u === 0x1f || u === 0x20;
const REFRESH_FAMILIES: readonly SurfaceFamily[] = ['power', 'road', 'rail'];

/** roll(line)：先比较 != 100 再掷骰（§4.17）。调用方已确认 rt.q / rt.prng 绑定。 */
function roll(rt: Runtime, line: BudgetLine): boolean {
  const f = rt.q!.economy.funding(line);
  return f !== 100 && rt.prng!.int(100) >= f;
}

/** 格 t 变瓦砾（DECAY）或清空（BRIDGE：桥下是水）：清角标 / POWERABLE / POWERED，发 structureDestroyed。 */
function wreck(rt: Runtime, t: number, cause: 'DECAY' | 'BRIDGE'): void {
  const act = rt.act!, L = rt.state.layers;
  const tx = tileX(t), ty = tileY(t), old = L.xbld[t]!;
  act.setXbld(t, cause === 'BRIDGE' ? 0 : rubbleIdFor(tx, ty));
  if ((L.xzon[t]! & Corner.All) !== 0) act.setXzon(t, L.xzon[t]! & ~Corner.All);
  if ((L.xbit[t]! & (XBit.Powerable | XBit.Powered)) !== 0) act.setXbit(t, XBit.Powerable | XBit.Powered, false);
  act.emit({ type: 'structureDestroyed', x: tx, y: ty, oldId: old, cause });
}

/**
 * 格 t 的地表网络元素消失后，对其四邻重新选片：只动本族平地 15 片段（坡面件 / 半高件 / 桥 / 交叉件 / 匝道 / 车站不动），
 * 且只接受 pieceFor 返回的本族平地片段（非法 → 保留原值），与 placement 推土后的 refreshSurface 同口径。
 */
function refreshNeighbors(rt: Runtime, t: number): void {
  const act = rt.act!, xbld = rt.state.layers.xbld;
  const x = tileX(t), y = tileY(t);
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d]!, ny = y + DY[d]!;
    if (!inMap(nx, ny)) continue;
    const j = tileIndex(nx, ny);
    for (const f of REFRESH_FAMILIES) {
      const v = xbld[j]!, k = familyPieceIdx(f, v);
      if (k < 0 || (k >= 2 && k <= 5) || slopeAt(rt, j) !== 0) continue;
      const p = pieceFor(rt, f, j), pk = familyPieceIdx(f, p);
      if (p !== v && pk >= 0 && (pk < 2 || pk > 5)) act.setXbld(j, p);
      break;
    }
  }
}

/** 同一座桥沿其轴向的连续桥件（与 placement 推土的 bridgeRun 同口径：左 / 右邻是桥件 → 沿 x，否则沿 y）。 */
function bridgeRun(rt: Runtime, i: number): number[] {
  const xbld = rt.state.layers.xbld;
  const isB = (j: number): boolean => isBridge(xbld[j]!);
  const x = tileX(i), y = tileY(i);
  const lr = (x > 0 && isB(tileIndex(x - 1, y))) || (x < 127 && isB(tileIndex(x + 1, y)));
  const run = [i];
  for (let step = -1; step <= 1; step += 2) {
    for (let k = 1; ; k++) {
      const nx = lr ? x + k * step : x, ny = lr ? y : y + k * step;
      if (!inMap(nx, ny)) break;
      const j = tileIndex(nx, ny);
      if (!isB(j)) break;
      run.push(j);
    }
  }
  return run;
}

/** 桥梁坍塌：整座桥（spec §4.18：不要只清一格）→ 清空，一次 bridgeCollapse + 居中 + 报纸；两岸引道重新选片。 */
function collapseBridge(rt: Runtime, i: number): void {
  const act = rt.act!;
  const run = bridgeRun(rt, i);
  for (const t of run) wreck(rt, t, 'BRIDGE');
  for (const t of run) refreshNeighbors(rt, t);
  const x = tileX(i), y = tileY(i);
  act.emit({ type: 'bridgeCollapse', x, y });
  act.emit({ type: 'goto', x, y, smooth: true });
  act.news(NewsType.BridgeCollapse, 1);
}

export function growthVisit(rt: Runtime, x: number, y: number): void {
  const T = rt.tune;
  if (!T.budgetDecay || !rt.act || !rt.prng || !rt.q) return;
  const L = rt.state.layers;
  const i = tileIndex(x, y);
  const id = L.xbld[i]!;

  if (isHighway(id) && !isBridge(id) && !isOnramp(id)) {
    // 高速块：只在偶数锚点判定一次，整块 4 格变废墟（水块上的段清空）
    if ((x & 1) === 0 && (y & 1) === 0 && roll(rt, BudgetLine.Highways)) {
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
        const tx = x + dx, ty = y + dy;
        if (!inMap(tx, ty)) continue;
        const t = tileIndex(tx, ty);
        const tid = L.xbld[t]!;
        if (!isHighway(tid) || isBridge(tid)) continue;
        if (rt.q.terrain.isWater(t)) { rt.act.setXbld(t, 0); rt.act.emit({ type: 'structureDestroyed', x: tx, y: ty, oldId: tid, cause: 'DECAY' }); }
        else wreck(rt, t, 'DECAY');
        refreshNeighbors(rt, t);
      }
    }
  } else if (isBridge(id)) {
    const f = rt.q.economy.funding(BudgetLine.Bridges);
    if (f !== 100 && rt.state.weather.wind + rt.prng.int(T.bridgeDecayRoll) >= f) collapseBridge(rt, i);
  } else if (isOnramp(id)) {
    if (roll(rt, BudgetLine.Highways)) { wreck(rt, i, 'DECAY'); refreshNeighbors(rt, i); }   // 匝道计入 Highways（按 1 格）
  } else if (isRoad(id)) {
    if (roll(rt, BudgetLine.Roads)) { wreck(rt, i, 'DECAY'); refreshNeighbors(rt, i); }
  } else if (isRail(id)) {
    if (roll(rt, BudgetLine.Rail)) { wreck(rt, i, 'DECAY'); refreshNeighbors(rt, i); }
  }
  const u = L.xund[i]!;
  if (T.subwayDecays && isSubwayTile(u) && roll(rt, BudgetLine.Subway)) rt.act.setXund(i, undWithoutSubway(u));   // 地铁段塌陷
}
