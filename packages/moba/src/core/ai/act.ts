/**
 * 指令层：Bot 的决策最终都经过这里变成 PlayerCommand。
 *
 * 负责「别乱发命令」：
 * - 同一个普攻目标/移动目的地不重复下令(引擎每次收到命令都会重置路径，重复下令会让英雄走走停停)；
 * - 普攻前摇中不下移动命令(否则这一刀白抬手)，除非调用方声明是紧急情况；
 * - 走不动时换个落点重新寻路(卡墙自救)。
 */
import type { SkillSlot, Vec2 } from '../types';
import type { BotView } from './types';

/** 目的地变化小于这个距离就不重新下令 */
const SAME_GOAL = 0.9;
/** 多久没挪窝算卡住 */
const STUCK_TIME = 1.4;
const STUCK_DIST = 0.35;

export class Act {
  private v!: BotView;
  private goalX = 1e9;
  private goalY = 1e9;
  private checkX = 0;
  private checkY = 0;
  private checkAt = 0;
  private stuckCount = 0;
  /** 本次思考是否已经下过移动/普攻类命令（一次思考只下一条，后下的不生效） */
  moved = false;
  /** 上一次施法的时间（连招节奏用） */
  lastCastAt = -99;

  begin(v: BotView): void {
    this.v = v;
    this.moved = false;
  }

  /** 走向 (x, y)。urgent = 即使在普攻前摇中也立刻走(逃命/躲技能) */
  moveTo(x: number, y: number, urgent = false): void {
    if (this.moved) return;
    const v = this.v;
    const me = v.hero;
    if (!urgent && v.attackWindup()) {
      this.moved = true;
      return;
    }
    this.moved = true;
    const d = Math.hypot(x - me.pos.x, y - me.pos.y);
    if (d < 0.4) {
      this.halt();
      return;
    }
    const time = v.time;
    const state = v.orderState();
    const same = Math.hypot(x - this.goalX, y - this.goalY) < SAME_GOAL;
    if (state === 2 && same) {
      // 已经在朝那儿走：只做卡死检查
      if (time - this.checkAt >= STUCK_TIME) {
        const progressed = Math.hypot(me.pos.x - this.checkX, me.pos.y - this.checkY) > STUCK_DIST;
        this.checkAt = time;
        this.checkX = me.pos.x;
        this.checkY = me.pos.y;
        if (progressed || v.busy()) {
          this.stuckCount = 0;
        } else {
          // 卡住了：先换成最近可走点；还不行就朝随机方向挪一步再说
          this.stuckCount++;
          if (this.stuckCount >= 2) {
            const a = v.rng.range(0, Math.PI * 2);
            v.command({ type: 'moveTo', pos: v.nearestWalkable({ x: me.pos.x + Math.cos(a) * 3, y: me.pos.y + Math.sin(a) * 3 }) });
            this.goalX = 1e9;
            this.stuckCount = 0;
          } else {
            v.command({ type: 'moveTo', pos: v.nearestWalkable({ x, y }) });
          }
        }
      }
      return;
    }
    this.goalX = x;
    this.goalY = y;
    this.checkAt = time;
    this.checkX = me.pos.x;
    this.checkY = me.pos.y;
    v.command({ type: 'moveTo', pos: { x, y } });
  }

  /** 朝方向 (dx, dy) 直走(不寻路，贴墙滑动)：躲技能、短距离走位用 */
  moveDir(dx: number, dy: number, urgent = false): void {
    if (this.moved) return;
    const v = this.v;
    if (!urgent && v.attackWindup()) {
      this.moved = true;
      return;
    }
    this.moved = true;
    this.goalX = 1e9;
    v.command({ type: 'move', dir: { x: dx, y: dy } });
  }

  /** 普攻指定目标(持续指令)。已经在打它就不重复下令 */
  attack(targetId: number): void {
    if (this.moved) return;
    this.moved = true;
    const v = this.v;
    if (v.orderState() === 3 && v.orderTargetId() === targetId) return;
    this.goalX = 1e9;
    v.command({ type: 'attack', targetId });
  }

  /** 原地站住：取消移动与普攻指令(正在抬手的这一下让它打完) */
  halt(): void {
    if (this.moved) return;
    this.moved = true;
    const v = this.v;
    if (v.orderState() !== 0 && !v.attackWindup()) v.command({ type: 'stop' });
    this.goalX = 1e9;
  }

  castAt(slot: SkillSlot, pos: Vec2): void {
    this.lastCastAt = this.v.time;
    this.v.command({ type: 'cast', slot, pos: { x: pos.x, y: pos.y } });
  }

  castDir(slot: SkillSlot, dx: number, dy: number): void {
    this.lastCastAt = this.v.time;
    this.v.command({ type: 'cast', slot, dir: { x: dx, y: dy } });
  }

  castTarget(slot: SkillSlot, targetId: number): void {
    this.lastCastAt = this.v.time;
    this.v.command({ type: 'cast', slot, targetId });
  }

  castSelf(slot: SkillSlot): void {
    this.lastCastAt = this.v.time;
    this.v.command({ type: 'cast', slot });
  }

  /** 忘掉记住的目的地（位置被瞬移/回城改变后调用） */
  forget(): void {
    this.goalX = 1e9;
  }
}
