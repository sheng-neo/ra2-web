/**
 * 特效模块(RenderModule 'fx')：一次性技能特效、投射物、区域效果、状态特效、瞄准指示器。
 *
 * 接入：render/index.ts 的 DEFAULT_MODULES 里放在单位视图模块之后、叠加层模块之前。
 *   - 单位位置/头顶高度走 ctx.unitQuery(单位视图模块用 ctx.setUnitQuery 提供真实挂点后自动生效)；
 *     需要完全自定义时调用 FxModule.setAnchors()。
 *   - 画廊页/集成层可用 playFx() 直接触发任意 FxKey，reset() 清空所有进行中的效果。
 */
import { HEROES } from '../../core/data/heroes';
import { MONSTERS } from '../../core/data/units';
import type { FxKey, GameEvent, GameState, PlayerTeam } from '../../core/types';
import type { AimIndicator } from '../api';
import type { FrameInfo, RenderContext, RenderModule } from '../engine/context';
import { AimIndicators } from './aim';
import type { UnitAnchors } from './anchors';
import { AreaViews } from './areas';
import { AmbientFx } from './ambient';
import { FX_HANDLERS, type FxEnv, type FxEvent, drakeBreathHit, epicSlainFx, heroDeathFx, meleeSwingFx, minionDeathFx, monsterSpawnFx } from './effects';
import { FxKit } from './kit';
import { ProjectileViews } from './projectiles';
import { StatusViews } from './status';
import { THEME } from './util';

export { FX_KEYS } from './effects';
export { AREA_VISUALS } from './areas';
export { PROJECTILE_VISUALS } from './projectiles';
export { STATUS_BUFFS } from './status';
export type { UnitAnchor, UnitAnchors } from './anchors';
export { FxKit } from './kit';

export interface FxStats {
  /** 累计出生的粒子数 */
  particlesSpawned: number;
  particleCapacity: number;
  decals: number;
  projectiles: number;
  areas: number;
  statuses: number;
  /** 本帧特效层的可见网格数(≈ 新增 draw call，不含受光岩刺的阴影通道) */
  drawCalls: number;
  /** 此刻存活的粒子数(逐个扫描，统计用) */
  particlesLive: number;
}

export interface FxModule extends RenderModule {
  readonly kit: FxKit;
  /** 替换单位锚点查询(默认基于 ctx.unitQuery + GameState) */
  setAnchors(a: UnitAnchors): void;
  /** 直接播放一个一次性特效(画廊/调试/测试)。忽略视野与距离裁剪 */
  playFx(e: FxEvent, state: GameState): void;
  /** 清空所有进行中的特效与视图 */
  reset(): void;
  /**
   * 玩家阵亡时把画面去色(走引擎调色，low 档无后期时无效)。默认关闭：正式对局里这件事由应用层(app/match.ts)统一负责，
   * 它还管 low 档的 CSS 兜底；两边同时写同一个调色参数会互相覆盖。只有不经应用层直接用渲染器的场合(演示/画廊)才需要打开。
   */
  setDeathGrade(enabled: boolean): void;
  getStats(): FxStats;
}

/** 超过这个距离(到镜头注视点)的一次性特效直接跳过 */
const CULL_DIST = 46;

export function createFxModule(ctx: RenderContext): FxModule {
  const kit = new FxKit(ctx);
  const projectiles = new ProjectileViews(kit);
  const areas = new AreaViews(kit);
  const status = new StatusViews(kit);
  const aim = new AimIndicators(kit);
  const env: FxEnv = { state: ctx.frame.state, playerId: ctx.frame.state.playerId, playerTeam: ctx.frame.playerTeam };
  const ambient = new AmbientFx(kit);
  const stats: FxStats = { particlesSpawned: 0, particleCapacity: 0, decals: 0, projectiles: 0, areas: 0, statuses: 0, drawCalls: 0, particlesLive: 0 };
  /** 每个近战英雄交替左右挥砍 */
  const swingCount = new Map<number, number>();
  let deathGrade = false;
  let gray = 0;

  /** 玩家阵亡：画面缓缓去色，复活时恢复 */
  const updateDeathGrade = (frame: FrameInfo): void => {
    // 没开启、也没有待恢复的去色：完全不碰调色参数
    if (!deathGrade && gray === 0) return;
    let dead = false;
    for (const h of frame.state.heroes) if (h.id === frame.state.playerId) dead = !h.alive;
    const target = deathGrade && dead ? 0.82 : 0;
    if (gray === target) return;
    const step = frame.dt * (target > gray ? 1.6 : 3);
    gray = Math.abs(target - gray) <= step ? target : gray + Math.sign(target - gray) * step;
    ctx.grade.desaturate = gray;
  };

  const syncEnv = (state: GameState): void => {
    env.state = state;
    env.playerId = state.playerId;
    let team: PlayerTeam = 0;
    for (const h of state.heroes) if (h.id === state.playerId) team = h.team;
    env.playerTeam = team;
  };

  /** 敌方在迷雾里放的技能不画：事件属于己方、施放者/目标可见、或落点在己方视野内才播放 */
  const fxVisible = (e: FxEvent): boolean => {
    // 命中类特效打在玩家看不见的敌人身上(技能蒙中了草里/视野外的目标)：不画，否则火花会把位置漏出来
    if (e.targetId !== undefined && e.key.startsWith('hit_') && kit.anchor(e.targetId)) {
      const t = kit.a.unit;
      if (t && t.team !== env.playerTeam && t.team !== 2 && t.id !== env.playerId && !t.visible[env.playerTeam]) return false;
    }
    if (e.team === env.playerTeam) return true;
    if (kit.anchor(e.unitId) && kit.a.visible) return true;
    if (kit.anchor(e.targetId) && kit.a.visible) return true;
    if (kit.anchors.pointVisible(e.pos.x, e.pos.y)) return true;
    return e.to !== undefined && kit.anchors.pointVisible(e.to.x, e.to.y);
  };

  const dispatch = (e: FxEvent): void => {
    const h = FX_HANDLERS[e.key];
    if (h) h(kit, e, env);
  };

  const onEvent = (e: GameEvent, state: GameState): void => {
    switch (e.type) {
      case 'fx':
        if (kit.focusDist(e.pos.x, e.pos.y) > CULL_DIST && !(e.to && kit.focusDist(e.to.x, e.to.y) <= CULL_DIST)) return;
        if (!fxVisible(e)) return;
        dispatch(e);
        break;
      case 'projectileHit':
      case 'projectileEnd':
        if (kit.focusDist(e.pos.x, e.pos.y) > CULL_DIST) return;
        projectiles.handle(e, env.playerId, env.playerTeam);
        break;
      case 'attack': {
        // 近战英雄普攻：在命中点(出手动作的 windup 比例处，与模型挥砍动作、模拟层结算同一时刻)前一瞬补一道主题色刀光
        if (!kit.anchor(e.unitId) || !kit.a.visible) return;
        const u = kit.a.unit;
        if (!u || u.kind !== 'hero' || HEROES[u.heroId].attackType !== 'melee') return;
        if (kit.focusDist(kit.a.x, kit.a.z) > CULL_DIST) return;
        const th = THEME[u.heroId];
        const id = u.id;
        const n = (swingCount.get(id) ?? 0) + 1;
        swingCount.set(id, n);
        const delay = Math.max(0.03, (u.animDur > 0 ? u.animDur : 0.5) * HEROES[u.heroId].basicAttack.windup - 0.05);
        kit.after(delay, () => {
          if (!kit.anchor(id) || !kit.a.unit || !kit.a.unit.alive || kit.a.unit.anim !== 'attack') return;
          const f = kit.a.unit.facing;
          meleeSwingFx(kit, kit.a.x + Math.cos(f) * 0.3, kit.a.y + kit.a.height * 0.5, kit.a.z + Math.sin(f) * 0.3, f, th.glow, th.deep, u.stats.attackRange * 0.72 + 0.3, n);
        });
        break;
      }
      case 'death': {
        if (kit.focusDist(e.pos.x, e.pos.y) > CULL_DIST) return;
        if (e.team !== env.playerTeam && !kit.anchors.pointVisible(e.pos.x, e.pos.y)) return;
        if (e.kind === 'hero') heroDeathFx(kit, e.pos.x, e.pos.y, e.team, e.unitId === env.playerId || e.killerId === env.playerId);
        else if (e.kind === 'minion') minionDeathFx(kit, e.pos.x, e.pos.y, e.team);
        break;
      }
      case 'monsterSpawn':
        // 开局预置的野怪不演出(C 包的出生动作同样只在对局进行中播)
        if (state.time < 1 || kit.focusDist(e.pos.x, e.pos.y) > CULL_DIST) return;
        monsterSpawnFx(kit, e.pos.x, e.pos.y, e.monsterType);
        break;
      case 'epicSlain':
        if (kit.focusDist(e.pos.x, e.pos.y) > CULL_DIST + (MONSTERS[e.monsterType].epic ? 20 : 0)) return;
        epicSlainFx(kit, e.pos.x, e.pos.y, e.team, e.monsterType, state);
        break;
      case 'damage':
        // 被河道巨龙的吐息喷中：紫色水雾
        if (e.dtype === 'magic' && kit.focusDist(e.pos.x, e.pos.y) <= CULL_DIST) {
          const s = kit.anchors.unit(e.sourceId);
          if (s && s.kind === 'monster' && s.monsterType === 'abyss_drake') drakeBreathHit(kit, e.sourceId, e.targetId);
        }
        break;
      default:
        break;
    }
  };

  const countDraws = (): number => {
    let n = 0;
    ctx.layers.fx.traverse((o) => {
      const m = o as { isMesh?: boolean; visible: boolean; parent: { visible: boolean } | null };
      if (m.isMesh && m.visible && (!m.parent || m.parent.visible)) n++;
    });
    return n;
  };

  return {
    name: 'fx',
    kit,
    update(frame: FrameInfo): void {
      syncEnv(frame.state);
      kit.begin(frame);
      projectiles.update(frame);
      areas.update(frame);
      status.update(frame);
      ambient.update(frame);
      aim.update(frame);
      updateDeathGrade(frame);
      kit.flush(frame);
    },
    handleEvents(events: GameEvent[], state: GameState): void {
      syncEnv(state);
      for (const e of events) onEvent(e, state);
    },
    setAim(a: AimIndicator | null): void {
      aim.set(a);
    },
    setQuality(s): void {
      kit.setQuality(s);
    },
    setAnchors(a: UnitAnchors): void {
      kit.anchors = a;
    },
    setDeathGrade(enabled: boolean): void {
      deathGrade = enabled;
    },
    playFx(e: FxEvent, state: GameState): void {
      syncEnv(state);
      dispatch(e);
    },
    reset(): void {
      projectiles.reset();
      areas.reset();
      status.reset();
      ambient.reset();
      aim.reset();
      swingCount.clear();
      kit.clear();
    },
    getStats(): FxStats {
      stats.particlesSpawned = kit.particles.spawned;
      stats.particleCapacity = kit.particles.capacity;
      stats.decals = kit.decals.activeCount;
      stats.projectiles = projectiles.count;
      stats.areas = areas.count;
      stats.statuses = status.count;
      stats.drawCalls = countDraws();
      stats.particlesLive = kit.particles.liveCount();
      return stats;
    },
    dispose(): void {
      if (gray > 0) ctx.grade.desaturate = 0;
      projectiles.reset();
      areas.reset();
      status.reset();
      aim.reset();
      kit.dispose();
    },
  };
}

/** 供调试：全部 FxKey 的类型守卫 */
export function isFxKey(k: string): k is FxKey {
  return k in FX_HANDLERS;
}
