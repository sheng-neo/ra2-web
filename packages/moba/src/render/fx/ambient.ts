/**
 * 环境交互(art-v2 §7.2 第 9 项)：
 *   - 涉水：单位在河道水面里移动时，脚下每 0.25 秒一个贴水面的涟漪环；冲刺 / 跃击落地 / 被击飞落地时溅起水花；
 *   - 草丛：英雄进出草丛时拨起几片叶子(只在玩家看得见的一侧画，不泄露敌人位置)；
 *   - 重型单位落地：巨熊、巨灵、樊哙及其它大体型单位在冲刺 / 跃击 / 击飞结束时扬起一圈尘环。
 * 只处理镜头附近(28 米内)且对玩家可见的单位；每个单位记一份很小的状态，单位离场后回收。
 */
import type { FrameInfo } from '../engine/context';
import { P, dustRing } from './common';
import { splashBurst } from './effects/monsters';
import type { FxKit } from './kit';
import { C, TAU } from './util';

interface AmbientState {
  /** 下一次涟漪的时刻(特效时钟) */
  ripple: number;
  bush: number;
  anim: string;
  seen: number;
}

/** 镜头注视点多远以内的单位才画环境交互 */
const NEAR = 28;
/** 「重型」单位：体型半径阈值(野怪的巨熊 1.6、巨灵 2.4、龙 2.0；英雄 ≈0.6 只有樊哙算) */
const HEAVY_RADIUS = 1.2;

export class AmbientFx {
  private k: FxKit;
  private states = new Map<number, AmbientState>();
  private stamp = 0;

  constructor(k: FxKit) {
    this.k = k;
  }

  update(frame: FrameInfo): void {
    const k = this.k;
    const terrain = k.ctx.terrain;
    const stamp = ++this.stamp;
    const playerTeam = frame.playerTeam;
    for (const u of frame.state.units) {
      if (!u.alive || (u.kind !== 'hero' && u.kind !== 'monster' && u.kind !== 'minion')) continue;
      if (u.team !== playerTeam && u.team !== 2 && !u.visible[playerTeam]) continue;
      if (k.focusDist(u.pos.x, u.pos.y) > NEAR) continue;
      let st = this.states.get(u.id);
      if (!st) {
        st = { ripple: 0, bush: u.bushId, anim: u.anim, seen: stamp };
        this.states.set(u.id, st);
      }
      st.seen = stamp;
      if (!k.anchor(u.id)) continue;
      const x = k.a.x;
      const z = k.a.z;
      const rad = k.a.radius;
      const moving = Math.abs(u.pos.x - u.prevPos.x) + Math.abs(u.pos.y - u.prevPos.y) > 1e-3;
      const wet = terrain.inWater(x, z);
      const heavy = rad >= HEAVY_RADIUS || (u.kind === 'hero' && u.heroId === 'panyue');
      // 动作切换：冲刺 / 跃起 / 被击飞结束 = 落地
      if (st.anim !== u.anim) {
        const landed = (st.anim === 'dash' || st.anim === 'leap' || st.anim === 'airborne') && u.anim !== 'dash' && u.anim !== 'leap';
        if (landed) {
          if (wet) splashBurst(k, x, z, Math.max(1.2, rad * 2), heavy ? 16 : 9);
          else if (heavy) dustRing(k, x, z, 8, rad * 0.6, 2.6, C.dust, C.dustDark, 1.0 + rad * 0.3, 0.7);
        }
        st.anim = u.anim;
      }
      // 涉水涟漪：移动时每 0.25 秒一个；站着不动时 1.2 秒一个更淡的
      if (wet && k.now >= st.ripple) {
        const size = rad * 2.2 + 0.6;
        k.particles.use(P.ripple).tint(C.white, C.frost).spawn(x, terrain.waterLevel + 0.03, z, 0, 0, 0, moving ? 0.7 : 1.1, size * 0.5, size * (moving ? 1.6 : 1.3));
        if (moving && (u.anim === 'dash' || heavy)) {
          const p = k.particles.use(P.droplet);
          for (let i = 0; i < k.n(3); i++) {
            const a = k.rnd.next() * TAU;
            p.spawn(x + Math.cos(a) * rad, terrain.waterLevel + 0.1, z + Math.sin(a) * rad, Math.cos(a) * 1.5, k.rnd.range(2, 3.5), Math.sin(a) * 1.5, 0.45, 0.12, 0.08);
          }
        }
        st.ripple = k.now + (moving ? (u.anim === 'dash' ? 0.12 : 0.25) : 1.2);
      }
      // 进出草丛：英雄拨起几片叶子(敌方英雄进草时玩家本来就该看见它的那一下)
      if (u.kind === 'hero' && st.bush !== u.bushId) {
        const bx = x;
        const bz = z;
        const p = k.particles.use(P.broadleaf);
        for (let i = 0; i < k.n(6); i++) {
          const a = k.rnd.next() * TAU;
          p.spawn(bx + Math.cos(a) * rad * 0.8, k.rnd.range(0.4, 1.1), bz + Math.sin(a) * rad * 0.8, Math.cos(a) * k.rnd.range(1, 2.4), k.rnd.range(1.5, 3), Math.sin(a) * k.rnd.range(1, 2.4), k.rnd.range(0.6, 0.9), 0.26, 0.2);
        }
        st.bush = u.bushId;
      }
    }
    // 回收已不在附近的单位状态(隔一阵扫一次)
    if ((stamp & 31) === 0) for (const [id, st] of this.states) if (stamp - st.seen > 60) this.states.delete(id);
  }

  /** 单位视图离场时也能调用：画廊页 / 重开对局 */
  reset(): void {
    this.states.clear();
  }
}
