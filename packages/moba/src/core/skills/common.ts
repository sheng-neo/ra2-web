/**
 * 五位英雄技能脚本共用的小工具。出手点等时序约定见 timing.ts。
 */
import type { SimUnit } from '../internal';
import type { DamageType, Vec2 } from '../types';
import type { Sim } from '../world';
import type { CastContext } from './registry';
import * as tk from './toolkit';

export { CAST_POINT, castPoint, castRange, fixedValue } from './timing';

export function copyVec(v: Vec2): Vec2 {
  return { x: v.x, y: v.y };
}

/** 技能命中火花（普攻的由引擎发；弹道命中另有 projectileHit 事件，不必再发） */
export function hitSpark(sim: Sim, source: SimUnit, target: SimUnit, dtype: DamageType): void {
  sim.fx(dtype === 'magic' ? 'hit_magic' : 'hit_physical', target.pos, source.team, { unitId: source.id, targetId: target.id });
}

/** 一次技能命中：火花 + 技能伤害。返回实际伤害 */
export function strike(ctx: CastContext, target: SimUnit, amount: number, dtype: DamageType): number {
  hitSpark(ctx.sim, ctx.caster, target, dtype);
  return tk.skillDamage(ctx.sim, ctx.caster, target, amount, dtype, ctx.slot);
}

/** 预估一段冲刺的终点（撞墙即停），用于在起步时就把完整的 from → to 交给渲染层画残影 */
export function dashEnd(sim: Sim, unit: SimUnit, dir: Vec2, distance: number): Vec2 {
  const p = { x: unit.pos.x, y: unit.pos.y };
  sim.nav.moveStraight(p, dir.x, dir.y, distance, unit.rt.navR);
  return p;
}
