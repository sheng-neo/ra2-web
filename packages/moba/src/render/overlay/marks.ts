/**
 * 世界内标记(贴地，走特效层的贴花/拖尾系统)：
 *   玩家英雄脚下的指向环、当前目标(targetId)的锁定圈、
 *   靠近敌方防御塔/水晶时的攻击范围圈，以及被塔锁定时的红色警示连线与脚下红光。
 * 作为 FxKit 的每帧钩子运行(在贴花上传之前)，与本帧镜头同步。
 */
import type { Unit } from '../../core/types';
import type { FrameInfo } from '../engine/context';
import { PALETTE } from '../materials';
import { R } from '../fx/common';
import { DECAL } from '../fx/decals';
import type { FxKit } from '../fx/kit';
import { C, col, smooth } from '../fx/util';

const POINTER = col(PALETTE.player.main);
const LOCK_ENEMY = col(0xff4a3a);
const LOCK_NEUTRAL = col(0xffc84a);
const RANGE_WARN = col(0xffa23a);
const RANGE_DANGER = col(0xff3626);
const DANGER_UNDER = col(0x3a0806);
/** 离塔的攻击范围还有多远时开始显示范围圈 */
const SHOW_MARGIN = 6;
const MAX_TOWERS = 2;

interface TowerMark {
  id: number;
  slot: number;
  seen: number;
}

export class WorldMarks {
  private k: FxKit;
  private pointer = -1;
  private lock = -1;
  private warn = -1;
  private towers: TowerMark[] = [];
  private facing = 0;
  private stamp = 0;
  enabled = true;

  constructor(k: FxKit) {
    this.k = k;
  }

  private drop(name: 'pointer' | 'lock' | 'warn'): void {
    if (this[name] >= 0) {
      this.k.decals.release(this[name], 0.15);
      this[name] = -1;
    }
  }

  update(frame: FrameInfo): void {
    const k = this.k;
    const d = k.decals;
    const st = frame.state;
    const stamp = ++this.stamp;
    const player = this.enabled && k.anchor(st.playerId) && k.a.unit && k.a.unit.alive ? k.a.unit : null;
    if (!player) {
      this.drop('pointer');
      this.drop('lock');
      this.drop('warn');
      for (const t of this.towers) d.release(t.slot, 0.15);
      this.towers.length = 0;
      return;
    }
    const px = k.a.x;
    const py = k.a.y;
    const pz = k.a.z;
    const pr = k.a.radius;
    const ph = k.a.height;

    // ── 脚下指向环：朝向做角度缓动，转身时不跳 ──
    let df = player.facing - this.facing;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    this.facing += df * Math.min(1, frame.dt * 16);
    if (this.pointer < 0) {
      this.pointer = d.hold(DECAL.pointer, 0.2);
      this.facing = player.facing;
    }
    d.at(this.pointer).at(px, pz).y(0.07).radius(pr + 0.95).rot(this.facing).color(POINTER, 1.5, 0.9).under(C.shadow, 0.35);

    // ── 当前目标的锁定圈 ──
    let locked = false;
    if (player.targetId >= 0 && k.anchor(player.targetId) && k.a.visible) {
      const t = k.a.unit;
      if (t && t.team !== player.team) {
        if (this.lock < 0) this.lock = d.hold(DECAL.lock, 0.1);
        d.at(this.lock).at(k.a.x, k.a.z).y(0.08).radius(k.a.radius + 0.7).color(t.team === 2 ? LOCK_NEUTRAL : LOCK_ENEMY, 1.9, 0.95).under(C.shadow, 0.4);
        locked = true;
      }
    }
    if (!locked) this.drop('lock');

    // ── 敌方防御塔/水晶：靠近时显示攻击范围，被锁定时拉红线(只管最近的两座) ──
    let n0: Unit | null = null;
    let n1: Unit | null = null;
    let d0 = Infinity;
    let d1 = Infinity;
    for (const u of st.units) {
      if ((u.kind !== 'tower' && u.kind !== 'core') || !u.alive || u.team === player.team) continue;
      const dist = Math.hypot(u.pos.x - player.pos.x, u.pos.y - player.pos.y);
      if (dist >= u.stats.attackRange + SHOW_MARGIN) continue;
      if (dist < d0) {
        n1 = n0;
        d1 = d0;
        n0 = u;
        d0 = dist;
      } else if (dist < d1) {
        n1 = u;
        d1 = dist;
      }
    }
    let targeted = false;
    for (let i = 0; i < MAX_TOWERS; i++) {
      const u = i === 0 ? n0 : n1;
      if (!u) break;
      const dist = i === 0 ? d0 : d1;
      const range = u.stats.attackRange;
      let mark: TowerMark | null = null;
      for (const t of this.towers) if (t.id === u.id) mark = t;
      if (!mark) {
        mark = { id: u.id, slot: d.hold(DECAL.range, 0.25), seen: stamp };
        this.towers.push(mark);
      }
      mark.seen = stamp;
      const aimsMe = u.targetId === st.playerId;
      const inside = dist <= range + pr;
      const fade = smooth(range + SHOW_MARGIN, range + SHOW_MARGIN - 3, dist);
      const c = aimsMe || inside ? RANGE_DANGER : RANGE_WARN;
      const pulse = aimsMe ? 0.8 + 0.2 * Math.sin(k.now * 12) : 1;
      d.at(mark.slot)
        .at(u.pos.x, u.pos.y)
        .y(0.08)
        .radius(range)
        .params(aimsMe ? 0.016 : inside ? 0.013 : 0.011, aimsMe ? 0 : 40)
        .color(c, aimsMe ? 2.2 : inside ? 1.8 : 1.6, fade * pulse * (inside ? 1 : 0.9))
        .under(DANGER_UNDER, aimsMe ? 0.5 : 0.3);
      if (aimsMe && k.anchor(u.id)) {
        targeted = true;
        // 从塔的能量核心到玩家胸口的红色警示线
        let cx = k.a.x;
        let cy = k.a.y + k.a.height * 0.82;
        let cz = k.a.z;
        if (k.anchors.attach?.(u.id, 'core', k.v)) {
          cx = k.v.x;
          cy = k.v.y;
          cz = k.v.z;
        }
        k.ribbons.line(R.warn, cx, cy, cz, px, py + ph * 0.5, pz, RANGE_DANGER, 0.75 + 0.25 * Math.sin(k.now * 16));
      }
    }
    for (let i = this.towers.length - 1; i >= 0; i--) {
      if (this.towers[i].seen !== stamp) {
        d.release(this.towers[i].slot, 0.25);
        this.towers.splice(i, 1);
      }
    }
    if (targeted) {
      if (this.warn < 0) this.warn = d.hold(DECAL.glow, 0.1);
      d.at(this.warn).at(px, pz).y(0.065).radius(pr + 1.5).params(1.2).color(RANGE_DANGER, 1.2, 0.55 + 0.35 * Math.sin(k.now * 12)).under(DANGER_UNDER, 0.5);
    } else this.drop('warn');
  }

  reset(): void {
    // 槽位由贴花系统统一清空(fx.reset)；这里只忘掉句柄
    this.pointer = -1;
    this.lock = -1;
    this.warn = -1;
    this.towers.length = 0;
  }

  dispose(): void {
    this.drop('pointer');
    this.drop('lock');
    this.drop('warn');
    for (const t of this.towers) this.k.decals.release(t.slot, 0);
    this.towers.length = 0;
  }
}
