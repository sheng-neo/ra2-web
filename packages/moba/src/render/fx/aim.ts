/**
 * 技能瞄准指示器(setAim)：全部以玩家英雄为原点，贴地、半透明、柔边、带流动纹；
 * 被地形/单位挡住的部分走贴花系统的透视通道淡淡画出，不会「看不见指到哪了」。cancel = true 时整体变红。
 *   direction 带箭头的矩形条 · cone 扇形 · position 射程圈 + 落点圈 · target 射程圈 + 目标锁定圈 + 连线 · self 范围圈
 */
import type * as THREE from 'three';
import type { FrameInfo } from '../engine/context';
import type { AimIndicator } from '../api';
import { R } from './common';
import { DECAL } from './decals';
import type { FxKit } from './kit';
import { C, col } from './util';

const AIM = col(0x2ab8ff);
const AIM_HOT = col(0x6fd8ff);
const AIM_UNDER = col(0x06243a);
const CANCEL = col(0xff4a3a);
const CANCEL_UNDER = col(0x3a0a08);
const Y = 0.1;

/** 槽位用途：0 = 射程圈，1 = 主形状，2 = 落点辅助/锁定圈 */
const SLOT_TYPES: Record<AimIndicator['kind'], [number, number, number]> = {
  direction: [-1, DECAL.rect, -1],
  cone: [-1, DECAL.cone, -1],
  position: [DECAL.range, DECAL.zone, DECAL.glow],
  target: [DECAL.range, -1, DECAL.lock],
  self: [-1, DECAL.zone, DECAL.glow],
};

export class AimIndicators {
  private k: FxKit;
  private aim: AimIndicator | null = null;
  private kind: AimIndicator['kind'] | null = null;
  private slots: [number, number, number] = [-1, -1, -1];

  constructor(k: FxKit) {
    this.k = k;
  }

  set(aim: AimIndicator | null): void {
    this.aim = aim;
  }

  private release(): void {
    const d = this.k.decals;
    for (let i = 0; i < 3; i++) {
      if (this.slots[i] >= 0) d.release(this.slots[i], 0.1);
      this.slots[i] = -1;
    }
    this.kind = null;
  }

  /** 形状种类变化时重建槽位 */
  private ensure(kind: AimIndicator['kind']): void {
    if (this.kind === kind) return;
    this.release();
    this.kind = kind;
    const types = SLOT_TYPES[kind];
    for (let i = 0; i < 3; i++) if (types[i] >= 0) this.slots[i] = this.k.decals.hold(types[i], 0.08);
  }

  private style(slot: number, c: THREE.Color, under: THREE.Color, intensity: number, alpha: number, underK: number): void {
    this.k.decals.at(slot).y(Y).color(c, intensity, alpha).under(under, underK).xray();
  }

  update(frame: FrameInfo): void {
    const k = this.k;
    const aim = this.aim;
    const st = frame.state;
    if (!aim || !k.anchor(st.playerId) || !k.a.unit || !k.a.unit.alive) {
      if (this.kind) this.release();
      return;
    }
    const px = k.a.x;
    const pz = k.a.z;
    this.ensure(aim.kind);
    const d = k.decals;
    const cancel = aim.cancel === true;
    const c = cancel ? CANCEL : AIM;
    const hot = cancel ? CANCEL : AIM_HOT;
    const under = cancel ? CANCEL_UNDER : AIM_UNDER;
    const [s0, s1, s2] = this.slots;

    switch (aim.kind) {
      case 'direction': {
        const l = Math.hypot(aim.dir.x, aim.dir.y) || 1;
        const dx = aim.dir.x / l;
        const dz = aim.dir.y / l;
        const half = aim.range / 2;
        this.style(s1, c, under, 1.25, 0.9, 0.55);
        d.at(s1).at(px + dx * half, pz + dz * half).radius(half).rot(Math.atan2(dz, dx), Math.max(0.3, aim.width / 2) / half);
        break;
      }
      case 'cone': {
        this.style(s1, c, under, 1.25, 0.9, 0.55);
        d.at(s1).at(px, pz).radius(aim.range).rot(Math.atan2(aim.dir.y, aim.dir.x)).params(aim.angle / 2, 1);
        break;
      }
      case 'position': {
        // 落点超出射程时夹到射程圈上(与模拟层的处理一致)
        let tx = aim.pos.x - px;
        let tz = aim.pos.y - pz;
        const dist = Math.hypot(tx, tz);
        if (dist > aim.range && dist > 0) {
          tx *= aim.range / dist;
          tz *= aim.range / dist;
        }
        this.style(s0, c, under, 1.1, 0.75, 0.35);
        d.at(s0).at(px, pz).radius(aim.range).params(0.008, 0);
        this.style(s1, hot, under, 1.25, 0.95, 0.5);
        d.at(s1).at(px + tx, pz + tz).radius(Math.max(0.6, aim.radius)).params(16, 0);
        this.style(s2, c, C.black, 0.5, 0.8, 0);
        d.at(s2).at(px + tx, pz + tz).radius(Math.max(0.6, aim.radius)).params(0.7);
        break;
      }
      case 'target': {
        this.style(s0, c, under, 1.3, 0.75, 0.35);
        d.at(s0).at(px, pz).radius(aim.range).params(0.008, 0);
        const py = k.a.y + k.a.height * 0.45;
        if (k.anchor(aim.targetId) && k.a.visible) {
          this.style(s2, hot, under, 1.4, 1, 0.5);
          d.at(s2).at(k.a.x, k.a.z).radius(k.a.radius + 0.75);
          k.ribbons.line(R.link, px, py, pz, k.a.x, k.a.y + k.a.height * 0.45, k.a.z, c, 1);
        } else d.at(s2).alpha(0);
        break;
      }
      case 'self': {
        const r = aim.radius > 0 ? aim.radius : 1.4;
        this.style(s1, hot, under, 1.25, 0.95, 0.5);
        d.at(s1).at(px, pz).radius(r).params(aim.radius > 0 ? 16 : 0, 0);
        this.style(s2, c, C.black, 0.45, 0.8, 0);
        d.at(s2).at(px, pz).radius(r).params(0.6);
        break;
      }
    }
  }

  reset(): void {
    this.aim = null;
    this.release();
  }
}
