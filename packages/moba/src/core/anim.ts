/**
 * 动作状态机：把运行时状态归结为契约里的 unit.anim / animStart / animDur。
 *
 * 优先级（高 → 低）：dead > airborne > stunned > 位移(dash/leap) > 动作(attack/cast_x/spin/channel) > move > idle。
 * 「动作」由 setAction 登记，到时自动结束；可被移动打断的动作(普攻后摇/施法后摇)一旦单位开始移动就让位给 move。
 */
import type { SimUnit } from './internal';
import type { UnitAnim } from './types';
import type { Sim } from './world';

/**
 * 登记一个动作动画。dur = 0 表示循环动作，需手动 clearAction。
 * moveCancel：单位自主移动时是否让位给 move（旋转、引导这类应传 false）。
 */
export function setAction(sim: Sim, u: SimUnit, anim: UnitAnim, dur: number, moveCancel = true): void {
  const rt = u.rt;
  const t = sim.state.time;
  rt.act = anim;
  rt.actStart = t;
  rt.actDur = dur;
  rt.actUntil = dur > 0 ? t + dur : Infinity;
  rt.actMoveCancel = moveCancel;
}

/** 结束当前动作（给了 anim 则仅当当前动作是它时才结束） */
export function clearAction(u: SimUnit, anim?: UnitAnim): void {
  if (anim === undefined || u.rt.act === anim) u.rt.act = null;
}

function apply(u: SimUnit, anim: UnitAnim, start: number, dur: number): void {
  if (u.anim !== anim || u.animStart !== start) {
    u.anim = anim;
    u.animStart = start;
    u.animDur = dur;
  }
}

/** 每 tick 末尾调用一次 */
export function updateAnim(sim: Sim, u: SimUnit): void {
  if (!u.alive) return; // 'dead' 在死亡时一次性设置
  const rt = u.rt;
  const t = sim.state.time;
  if (rt.airborne) {
    apply(u, 'airborne', rt.airborne.startTime, rt.airborne.duration);
    return;
  }
  if (rt.stunned) {
    if (u.anim !== 'stunned') apply(u, 'stunned', t, 0);
    return;
  }
  const d = rt.dash;
  if (d && d.anim) {
    apply(u, d.anim, d.startTime, d.dur);
    return;
  }
  if (rt.act !== null) {
    if (t >= rt.actUntil || (rt.moved && rt.actMoveCancel)) {
      rt.act = null;
    } else {
      apply(u, rt.act, rt.actStart, rt.actDur);
      return;
    }
  }
  const want: UnitAnim = rt.moved ? 'move' : 'idle';
  if (u.anim !== want) apply(u, want, t, 0);
}
