// ===== sim/events/dispatch.ts =====（spec:disasters §2.7 紧急调度单位；WORKPLAN WP13：军队 v2）
// 单位 = priv.units 的 {kind, x, y, order} 列表；可用数 = 警局 / 消防局数（q.services.structureCounts）；3×3 保护区；只在灾害模式可放。
import type { CommandResult } from '../../contracts/commands';
import { NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import { CityMode, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { SimContext } from '../../contracts/system';
import { cheb, privOf, peekPriv } from './common';
import type { EventsPriv } from './priv';
import { UnitKind } from './priv';
import type { EventsTuning } from './tuning';

/** 单位种类掩码（unitWithin 的 kinds 参数）。 */
export const UNIT_POLICE = 1 << UnitKind.Police, UNIT_FIRE = 1 << UnitKind.Fire, UNIT_ANY = UNIT_POLICE | UNIT_FIRE;
/** 调度单位占用的 XTHG 槽位从 1 起；灾害主物件固定用预留槽 39。 */
export const UNIT_SLOT_BASE = 1, PRIMARY_SLOT = 39;

/** 格 i 的切比雪夫 radius 内是否有 kinds 掩码内的单位。 */
export function unitWithin(P: EventsPriv, i: number, kinds: number, radius: number): boolean {
  const x = tileX(i), y = tileY(i);
  for (const u of P.units) if (((kinds >> u.kind) & 1) === 1 && cheb(u.x, u.y, x, y) <= radius) return true;
  return false;
}

/** 可用总数（不扣已放置）。 */
export function unitsAvailableTotal(ctx: SimContext, kind: number): number {
  const c = ctx.q.services.structureCounts();
  return kind === UnitKind.Police ? c.police : kind === UnitKind.Fire ? c.fire : 0;
}
/** DisasterQuery.dispatchAvailable：剩余可放数（军队 v2 → 0）。 */
export function dispatchAvailable(ctx: SimContext, kind: number): number {
  if (kind !== UnitKind.Police && kind !== UnitKind.Fire) return 0;
  const P = peekPriv(ctx.state);
  const placed = P ? P.units.filter((u) => u.kind === kind).length : 0;
  return Math.max(0, unitsAvailableTotal(ctx, kind) - placed);
}

const reject = (reason: CommandResult['reason']): CommandResult => ({ ok: false, cost: 0, reason, changed: [] });

/** dispatch 命令：灾害模式 + 有对应局所 + 陆地格；已放满则把该类最早放置的单位移到新位置（spec §2.7 [中]）。 */
export function dispatchCommand(ctx: SimContext, T: EventsTuning, kind: number, x: number, y: number): CommandResult {
  if (kind !== UnitKind.Police && kind !== UnitKind.Fire) return NOT_IMPLEMENTED_RESULT;
  const s = ctx.state;
  if (s.clock.mode !== CityMode.Disaster || !s.disaster.active) return reject('mode');
  if (!inMap(x, y)) return reject('outOfBounds');
  const i = tileIndex(x, y);
  if (ctx.q.terrain.isWater(i)) return reject('water');
  const total = unitsAvailableTotal(ctx, kind);
  if (total <= 0) return reject('noTarget');
  const P = privOf(s);
  const mine = P.units.filter((u) => u.kind === kind);
  if (mine.length >= total || P.units.length >= T.dispatch.maxUnits) {
    const oldest = mine.length > 0 ? mine.reduce((a, b) => (a.order < b.order ? a : b)) : null;
    if (!oldest) return reject('limit');
    oldest.x = x; oldest.y = y;
    ctx.act.emit({ type: 'actor', op: 'move', slot: UNIT_SLOT_BASE + P.units.indexOf(oldest) });
    return { ok: true, cost: 0, changed: [i] };
  }
  P.units.push({ kind, x, y, order: P.unitSeq++ });
  ctx.act.emit({ type: 'actor', op: 'spawn', slot: UNIT_SLOT_BASE + P.units.length - 1 });
  ctx.act.emit({ type: 'sound', id: 'siren' });
  return { ok: true, cost: 0, changed: [i] };
}

/** 灾害结束 / 城市模式清场：删除全部单位。 */
export function clearUnits(ctx: SimContext, P: EventsPriv): void {
  if (P.units.length === 0) return;
  for (let k = P.units.length - 1; k >= 0; k--) ctx.act.emit({ type: 'actor', op: 'remove', slot: UNIT_SLOT_BASE + k });
  P.units = [];
}
