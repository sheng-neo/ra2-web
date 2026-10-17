// ===== sim/events/machine.ts =====（spec:disasters §2.2.4 状态机 / §3.3 主状态机伪代码）
// IDLE ─(pending)→ STARTING ─→ ACTIVE ─(无标记 / 无物件 / 无余震，或超时)→ ENDING ─→ IDLE。
// state.disaster.pending 的唯一消费入口是 consumePending（thingsTick 两种模式都调）；进入 / 退出 CityMode.Disaster 在此发 modeChanged。
// 来自 tick 的模态（disasterAlert / extraPaper）没有阶段可挂起：emit modal 后手动 modalPause++，UI 关闭时 host.modalClosed() 归零。
import { NewsType } from '../../contracts/events';
import { CityMode, DisasterKind, TileMarker, V1_DISASTERS, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { SimContext } from '../../contracts/system';
import { spawnMonster, spawnTornado, stepActors } from './actors';
import { flammableAt, privOf } from './common';
import { clearUnits } from './dispatch';
import { pickFireOrigin, stepFire } from './fire';
import { pickFloodOrigin, seedFlood, stepFlood } from './flood';
import { anyMarker, centroidOf, countMarker, igniteTile } from './marker';
import { composePaper, extraPaperOn, pushStory } from './news';
import type { EventsPriv } from './priv';
import { FloodPhase } from './priv';
import { quakeFocus, startQuake, stepQuake } from './quake';
import type { EventsTuning } from './tuning';

/** 灾害名的 strings 键（message 事件参数用；文案在 data/strings）。 */
const DISASTER_KEY: readonly string[] = ['none', 'fire', 'flood', 'riot', 'toxicSpill', 'airCrashLegacy', 'earthquake', 'tornado', 'monster', 'meltdown', 'microwave', 'volcano', 'firestorm', 'massRiots', 'massFloods', 'pollution', 'hurricane', 'helicopterCrash', 'planeCrash'];
export const disasterNameKey = (kind: number): string => `disaster.${DISASTER_KEY[kind] ?? 'none'}`;

/** 灾害结束时的报纸类型（spec §2.1 报纸类型列）。 */
export function newsTypeOfDisaster(kind: number): NewsType {
  switch (kind) {
    case DisasterKind.Fire: case DisasterKind.Firestorm: return NewsType.DisasterFire;
    case DisasterKind.Flood: case DisasterKind.MassFloods: return NewsType.DisasterFlood;
    case DisasterKind.Riot: case DisasterKind.MassRiots: return NewsType.DisasterRiot;
    case DisasterKind.ToxicSpill: return NewsType.DisasterChemicalSpill;
    case DisasterKind.Earthquake: return NewsType.DisasterEarthquake;
    case DisasterKind.Tornado: return NewsType.DisasterTornado;
    case DisasterKind.Monster: return NewsType.DisasterMonster;
    case DisasterKind.Meltdown: return NewsType.DisasterMeltdown;
    case DisasterKind.Microwave: return NewsType.DisasterMicrowave;
    case DisasterKind.Volcano: return NewsType.DisasterVolcano;
    case DisasterKind.Pollution: return NewsType.DisasterPollution;
    case DisasterKind.Hurricane: return NewsType.DisasterHurricane;
    case DisasterKind.HelicopterCrash: return NewsType.DisasterHelicopterCrash;
    case DisasterKind.PlaneCrash: case DisasterKind.AirCrashLegacy: return NewsType.DisasterPlaneCrash;
    default: return NewsType.Disaster;
  }
}

/** 终止条件：无任何标记、无灾害物件、无余震、洪水阶段已归零。 */
export const nothingActive = (P: EventsPriv): boolean => !anyMarker(P) && P.actors.length === 0 && P.quakeShake === 0 && P.floodPhase === FloodPhase.None;

/** 原点选择 + 种子（STARTING 的核心）；返回 null 表示前置条件不满足（不进入灾害模式）。 */
function seed(ctx: SimContext, T: EventsTuning, kind: DisasterKind, at: number): { x: number; y: number } | null {
  const P = privOf(ctx.state);
  const xy = (i: number): { x: number; y: number } => ({ x: tileX(i), y: tileY(i) });
  switch (kind) {
    case DisasterKind.Fire: {
      if (countMarker(P, TileMarker.Fire) > 0 && at < 0) return centroidOf(P, TileMarker.Fire)!;   // 已在烧（电厂到期预点燃 / 叠加）
      const origin = at >= 0 && flammableAt(ctx, at) ? at : pickFireOrigin(ctx);
      if (origin < 0) return null;
      igniteTile(ctx, P, T.fire, origin);
      return xy(origin);
    }
    case DisasterKind.Flood: {
      const origin = pickFloodOrigin(ctx);
      if (origin < 0) return null;
      seedFlood(ctx, T, origin);
      return xy(origin);
    }
    case DisasterKind.Tornado: { const a = spawnTornado(ctx, T); return { x: a.x, y: a.y }; }
    case DisasterKind.Monster: { const a = spawnMonster(ctx, T); return { x: a.x, y: a.y }; }
    case DisasterKind.Earthquake: { startQuake(ctx, T); return at >= 0 ? xy(at) : quakeFocus(ctx); }
    default: return null;
  }
}

/** STARTING：消费 pending；前置不满足 → 回 IDLE 并发 message。 */
export function startDisaster(ctx: SimContext, T: EventsTuning, kind: DisasterKind): boolean {
  const s = ctx.state, D = s.disaster, P = privOf(s);
  const at = P.pendingAt;
  D.pending = DisasterKind.None; P.pendingAt = -1;
  if (!V1_DISASTERS.has(kind)) {
    ctx.act.emit({ type: 'message', key: 'message.disasterUnavailable', args: { name: disasterNameKey(kind) }, level: 'alert' });
    return false;
  }
  const wasActive = D.active;
  if (!wasActive) { P.idleTicks = 0; P.deaths = 0; P.destroyedTiles = 0; }
  const point = seed(ctx, T, kind, at);
  if (!point) {
    ctx.act.emit({ type: 'message', key: 'message.disasterUnavailable', args: { name: disasterNameKey(kind) }, level: 'alert' });
    return false;
  }
  D.current = kind; D.active = true; D.pointX = point.x; D.pointY = point.y;
  if (s.clock.mode !== CityMode.Disaster) {
    s.clock.mode = CityMode.Disaster;
    ctx.act.emit({ type: 'modeChanged', mode: CityMode.Disaster });
    ctx.act.emit({ type: 'toolbar', reason: 'mode' });
  }
  ctx.act.emit({ type: 'disasterStarted', kind, x: point.x, y: point.y });
  ctx.act.emit({ type: 'sound', id: 'siren' });
  if (D.autoGoto) ctx.act.emit({ type: 'goto', x: point.x, y: point.y, smooth: false });
  ctx.act.emit({ type: 'modal', id: 'disasterAlert', payload: { kind, x: point.x, y: point.y } });
  s.clock.modalPause++;
  return true;
}

/** ENDING：清单位、退出灾害模式、入池报纸、号外。 */
export function endDisaster(ctx: SimContext, T: EventsTuning): void {
  const s = ctx.state, D = s.disaster, P = privOf(s);
  clearUnits(ctx, P);
  D.active = false; D.windOverride = -1;
  D.pointX = 64; D.pointY = 64;                                       // 原点无 .SC2 落点：灾害间回到地图中心，使 hash('sc2') 往返不变
  P.actors = []; P.floodPhase = FloodPhase.None; P.quakeShake = 0;
  if (s.clock.mode === CityMode.Disaster) {
    s.clock.mode = CityMode.City;
    ctx.act.emit({ type: 'modeChanged', mode: CityMode.City });
    ctx.act.emit({ type: 'toolbar', reason: 'mode' });
  }
  const kind = D.current;
  const deaths = Math.min(P.deaths, 255);
  const lead = pushStory(ctx, T.news, newsTypeOfDisaster(kind), kind === DisasterKind.Earthquake ? P.quakeMag10 : deaths);
  P.deaths = 0; P.destroyedTiles = 0; P.idleTicks = 0; P.quakeMag10 = 0;
  ctx.act.emit({ type: 'disasterEnded', kind, deaths });
  ctx.act.emit({ type: 'message', key: 'message.disasterEnded', args: { name: disasterNameKey(kind) }, level: 'info' });
  const extra = extraPaperOn(s);
  composePaper(ctx, T.news, true, extra, lead);
  ctx.act.emit({ type: 'paper', extra: true });
  if (extra) { ctx.act.emit({ type: 'modal', id: 'extraPaper', payload: { extra: true } }); s.clock.modalPause++; }
}

/** 超时强制清场（maxDisasterTicks）。 */
function forceClear(P: EventsPriv): void {
  P.marker.fill(0); P.fuel.fill(0); P.actors = []; P.floodPhase = FloodPhase.None; P.quakeShake = 0;
}

/** 读档后的状态对齐：灾害模式下 active 与标记不一致时以标记为准（有标记 → 进行中；全无 → 安静退回城市模式，不发报纸）。 */
export function reconcile(ctx: SimContext): void {
  const s = ctx.state, D = s.disaster, P = privOf(s);
  if (s.clock.mode !== CityMode.Disaster) return;
  if (nothingActive(P)) {
    D.active = false; clearUnits(ctx, P);
    s.clock.mode = CityMode.City;
    ctx.act.emit({ type: 'modeChanged', mode: CityMode.City });
    ctx.act.emit({ type: 'toolbar', reason: 'mode' });
  } else D.active = true;
}

/** 灾害模式 tick（System.disasterTick）：固定顺序保证 PRNG 可复现。 */
export function disasterTick(ctx: SimContext, T: EventsTuning): void {
  const s = ctx.state;
  if (s.clock.modalPause > 0 || s.clock.mode !== CityMode.Disaster) return;
  const P = privOf(s);
  if (!s.disaster.active) { reconcile(ctx); if (!s.disaster.active) return; }
  P.idleTicks++;
  stepActors(ctx, P, T);
  stepFire(ctx, P, T);
  stepFlood(ctx, P, T);
  stepQuake(P);
  if (P.idleTicks >= T.maxDisasterTicks) { forceClear(P); ctx.diag.push({ level: 'info', code: 'events.disasterTimeout', message: `灾害超过 ${T.maxDisasterTicks} tick，强制清场` }); }
  if (nothingActive(P)) endDisaster(ctx, T);
}

/** 两种模式都调（System.thingsTick）：消费 pending；城市模式且无灾害时清理遗留调度单位。 */
export function consumePending(ctx: SimContext, T: EventsTuning): void {
  const s = ctx.state, D = s.disaster;
  if (s.clock.modalPause > 0 || s.clock.mode === CityMode.TerrainEdit) return;
  if (D.pending !== DisasterKind.None) { startDisaster(ctx, T, D.pending); return; }
  if (s.clock.mode === CityMode.City && !D.active) { const P = privOf(s); if (P.units.length > 0) clearUnits(ctx, P); }
}

/** 红箭头循环目标：每个活动物件 + 火 / 洪水质心。 */
export function focusPoints(P: EventsPriv): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const a of P.actors) if (inMap(a.x, a.y)) out.push({ x: a.x, y: a.y });
  const f = centroidOf(P, TileMarker.Fire); if (f) out.push(f);
  const w = centroidOf(P, TileMarker.Flood); if (w) out.push(w);
  return out;
}

/** 便于测试：某格是否带火标记。 */
export const isBurning = (P: EventsPriv, x: number, y: number): boolean => P.marker[tileIndex(x, y)] === TileMarker.Fire;
