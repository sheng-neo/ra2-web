/**
 * 特效画廊（仅开发用）：/dev/fx.html?…
 *
 * 在一小块舞台上摆几个占位单位(玩家、队友、两个敌方英雄、几个小兵)，左侧面板点哪个放哪个：
 *   全部 FxKey(单个事件)、技能连招(按模拟层的真实时序发一整套事件/区域/投射物)、投射物、区域、状态 buff、瞄准指示器。
 * 舞台由页面里的一个极简「假模拟」推进(30Hz：位移、弹道、区域计时、buff 计时)，产生与真模拟同样格式的事件。
 *
 * URL 参数：
 *   play=<名字>      自动播放：FxKey | seq:<连招> | proj:<ProjectileVisual> | area:<AreaVisual>[:enemy] | buff:<BuffId> | aim:<种类>[:cancel]
 *   t=<秒>           与 play 连用：快进到该时刻后定格(逐个截图用)
 *   hero=<HeroId>    玩家英雄(缺省按 play 的键名前缀自动选)
 *   quality=low|medium|high      (缺省 high)
 *   x=&y=&dir=       舞台中心(模拟坐标)与朝向(度，0 = 朝东)
 *   sim=1            真实模拟：全 AI 对局(seed=、hero= 可选)，ff=<秒> 先快进，t=<秒> 再带特效跑一段后定格
 *   overlay=1        叠加层演示：直接用 createMockState 的整张假对局，并定时注入伤害/治疗/金币事件(可配 t=<秒> 定格)
 *   units=placeholder  用胶囊占位单位代替真实模型
 *   panel=0 / hud=0  隐藏按钮面板 / 统计
 *   loop=<秒>        每隔几秒重播
 *   speed=<倍率>     时间倍率(慢放看细节)
 * 脚本接口：window.__fx.play(name, t?) / .names / .stats()。
 */
import { HEROES, HERO_IDS } from '../core/data/heroes';
import { createMockState } from '../core/mock';
import { createWorld } from '../core/world';
import {
  TICK_DT, type AreaEffect, type AreaVisual, type Buff, type BuffId, type DamageType, type FxKey, type GameEvent, type GameState, type HeroId, type HeroUnit,
  type Projectile, type ProjectileVisual, type TeamId, type Unit, type UnitAnim, type Vec2, type World,
} from '../core/types';
import type { AimIndicator, Quality } from '../render/api';
import type { RenderModule, RenderModuleFactory } from '../render/engine/context';
import { createRendererCore } from '../render/engine/core';
import { createPlaceholderUnits } from '../render/engine/placeholders';
import { AREA_VISUALS, FX_KEYS, PROJECTILE_VISUALS, STATUS_BUFFS, createFxModule, type FxModule } from '../render/fx';
import { DECAL } from '../render/fx/decals';
import { MODE, SHAPE } from '../render/fx/glow';
import { particleStyle } from '../render/fx/particles';
import { createOverlayModule, type OverlayModule } from '../render/overlay';
import * as THREE from 'three';
import { createTerrainModule } from '../render/terrain';
import { createUnitsModule } from '../render/units';

const params = new URLSearchParams(location.search);
const num = (k: string): number | null => {
  const v = params.get(k);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const app = document.getElementById('app') as HTMLElement;
const panel = document.getElementById('panel') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;

const qp = params.get('quality');
const quality: Quality = qp === 'low' || qp === 'medium' || qp === 'high' ? qp : 'high';
const overlayDemo = params.get('overlay') === '1';
const playParam = params.get('play') ?? '';
const isHero = (v: string | null | undefined): v is HeroId => !!v && v in HEROES;
const prefix = playParam.replace(/^seq:/, '').split('_')[0];
const heroParam = params.get('hero');
const heroId: HeroId = isHero(heroParam) ? heroParam : isHero(prefix) ? prefix : 'chijin';

// ───────────────────────── 舞台 ─────────────────────────

// ?sim=1：用真实模拟内核跑一局全 AI 对局，把真实事件流喂给特效/叠加层(集成冒烟测试)
const simMode = params.get('sim') === '1';
const world: World | null = simMode ? createWorld({ seed: num('seed') ?? 7, playerHero: heroId, difficulty: 'normal', autoPlay: true }) : null;
const state: GameState = world ? world.state : createMockState(heroId);
/** 不搭舞台：直接用整张对局状态 */
const freeStage = overlayDemo || simMode;
/** 舞台的「前方」(玩家 → 敌人的方向，缺省朝东)与「右方」 */
const stageDir = ((num('dir') ?? 0) * Math.PI) / 180;
const F: Vec2 = { x: Math.cos(stageDir), y: Math.sin(stageDir) };
const RT: Vec2 = { x: -F.y, y: F.x };
// 默认舞台：下路中段(砂岩路 + 两侧草地，附近没有塔)。?x=-3&y=3&dir=-45 可以换到中路河道渡口看水面上的效果
const center: Vec2 = { x: num('x') ?? 10, y: num('y') ?? 51.5 };
const at = (f: number, r: number): Vec2 => ({ x: center.x + F.x * f + RT.x * r, y: center.y + F.y * f + RT.y * r });

const player = state.heroes.find((h) => h.id === state.playerId) as HeroUnit;
const ally = state.heroes[1];
const foe = state.heroes[5];
const foe2 = state.heroes[6];
const stageMinions: Unit[] = [];
interface Spot {
  u: Unit;
  pos: Vec2;
  facing: number;
}
const spots: Spot[] = [];

if (!freeStage) {
  // 只留舞台上的单位 + 建筑/野怪；其余英雄送回泉水
  const minions = state.units.filter((u) => u.kind === 'minion');
  const foeMinions = minions.filter((u) => u.team === 1).slice(0, 3);
  const allyMinions = minions.filter((u) => u.team === 0).slice(0, 1);
  stageMinions.push(...foeMinions, ...allyMinions);
  state.units = state.units.filter((u) => u.kind !== 'minion' || stageMinions.includes(u));
  state.projectiles.length = 0;
  state.areas.length = 0;
  const fwd = Math.atan2(F.y, F.x);
  spots.push({ u: player, pos: at(-3.5, 0), facing: fwd });
  spots.push({ u: ally, pos: at(-5.5, -3.2), facing: fwd });
  spots.push({ u: foe, pos: at(2.5, 0), facing: fwd + Math.PI });
  spots.push({ u: foe2, pos: at(4.2, 3.2), facing: fwd + Math.PI });
  spots.push({ u: foeMinions[0], pos: at(1.2, -3.2), facing: fwd + Math.PI });
  spots.push({ u: foeMinions[1], pos: at(2.6, -4.6), facing: fwd + Math.PI });
  spots.push({ u: foeMinions[2], pos: at(0.4, 3.4), facing: fwd + Math.PI });
  spots.push({ u: allyMinions[0], pos: at(-2.2, 3.4), facing: fwd });
  state.heroes.forEach((h) => {
    if (spots.some((s) => s.u === h)) return;
    const base = state.map.bases[h.team];
    h.pos = { ...base.fountain };
    h.prevPos = { ...base.fountain };
    h.alive = true;
    h.hp = h.stats.maxHp;
    h.anim = 'idle';
    h.respawnIn = 0;
    h.buffs.length = 0;
  });
}

function resetStage(): void {
  if (freeStage) return;
  for (const s of spots) {
    const u = s.u;
    u.pos = { ...s.pos };
    u.prevPos = { ...s.pos };
    u.facing = s.facing;
    u.alive = true;
    u.hp = u.stats.maxHp * (u.kind === 'hero' ? 0.8 : 0.7);
    u.shield = 0;
    u.buffs.length = 0;
    u.anim = 'idle';
    u.animStart = state.time;
    u.animDur = 0;
    u.targetId = -1;
    u.visible = [true, true];
    u.lastHitTime = -999;
  }
  for (const u of state.units) if (u.kind === 'tower') u.targetId = -1;
  homeMonsters();
  state.projectiles.length = 0;
  state.areas.length = 0;
  timers.length = 0;
  movers.length = 0;
  projMeta.clear();
  events.length = 0;
  aim = null;
  renderer.setAim(null);
}

// ───────────────────────── 极简假模拟 ─────────────────────────

const events: GameEvent[] = [];
const timers: { at: number; fn: () => void }[] = [];
interface Mover {
  u: Unit;
  from: Vec2;
  to: Vec2;
  t0: number;
  dur: number;
  done: (() => void) | null;
}
const movers: Mover[] = [];
const projMeta = new Map<number, { pierce: boolean; hit: Set<number> }>();
let nextId = 50000;
let aim: AimIndicator | null = null;

const after = (delay: number, fn: () => void): void => {
  timers.push({ at: state.time + delay, fn });
};
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const cp = (p: Vec2): Vec2 => ({ x: p.x, y: p.y });
type FxExtra = Partial<Omit<Extract<GameEvent, { type: 'fx' }>, 'type' | 'key' | 'pos'>>;
const fx = (key: FxKey, pos: Vec2, extra: FxExtra = {}): void => {
  events.push({ type: 'fx', key, pos: cp(pos), team: extra.team ?? 0, ...extra });
};

function setAnim(u: Unit, anim: UnitAnim, dur: number): void {
  u.anim = anim;
  u.animStart = state.time;
  u.animDur = dur;
  if (dur > 0) after(dur, () => {
    if (u.anim === anim) u.anim = 'idle';
  });
}

function addBuff(u: Unit, id: BuffId, duration: number, value = 0, stacks = 1, sourceId = -1): Buff {
  let b = u.buffs.find((x) => x.id === id);
  if (!b) {
    b = { id, sourceId, timeLeft: duration, duration, stacks, value };
    u.buffs.push(b);
  } else {
    b.timeLeft = duration;
    b.duration = duration;
    b.stacks = stacks;
    b.value = value;
  }
  if (id === 'shield') u.shield = value;
  return b;
}

function damage(target: Unit, amount: number, dtype: DamageType, crit = false, skill = true, source: Unit = player): void {
  target.hp = Math.max(target.stats.maxHp * 0.12, target.hp - amount);
  target.lastHitTime = state.time;
  events.push({ type: 'damage', targetId: target.id, sourceId: source.id, amount, dtype, crit, pos: cp(target.pos), skill });
}

function move(u: Unit, to: Vec2, speed: number, anim: UnitAnim, done?: () => void): number {
  const d = dist(u.pos, to);
  const dur = Math.max(TICK_DT, d / speed);
  movers.push({ u, from: cp(u.pos), to: cp(to), t0: state.time, dur, done: done ?? null });
  u.facing = Math.atan2(to.y - u.pos.y, to.x - u.pos.x);
  setAnim(u, anim, dur);
  return dur;
}

function spawnArea(visual: AreaVisual, pos: Vec2, radius: number, duration: number, owner: Unit, follow?: Unit, onEnd?: () => void): AreaEffect {
  const a: AreaEffect = { id: nextId++, visual, team: owner.team, ownerId: owner.id, pos: cp(pos), radius, age: 0, duration, followUnitId: follow ? follow.id : -1 };
  state.areas.push(a);
  events.push({ type: 'areaSpawn', id: a.id, visual, pos: cp(pos), radius, duration });
  if (onEnd) after(duration, onEnd);
  return a;
}

function spawnProjectile(visual: ProjectileVisual, owner: Unit, from: Vec2, dir: Vec2, speed: number, opts: { target?: Unit; range?: number; radius?: number; pierce?: boolean }): Projectile {
  const p: Projectile = {
    id: nextId++, visual, team: owner.team, ownerId: owner.id, pos: cp(from), prevPos: cp(from), dir: cp(dir), speed, radius: opts.radius ?? 0.3,
    targetId: opts.target ? opts.target.id : -1, traveled: 0, maxRange: opts.range ?? 0,
  };
  state.projectiles.push(p);
  projMeta.set(p.id, { pierce: opts.pierce ?? false, hit: new Set() });
  events.push({ type: 'projectileSpawn', id: p.id, visual, pos: cp(from), ownerId: owner.id });
  return p;
}

const enemiesOf = (team: TeamId): Unit[] => spots.map((s) => s.u).filter((u) => u.team !== team && u.alive);
const inCircle = (c: Vec2, r: number, team: TeamId): Unit[] => enemiesOf(team).filter((u) => dist(u.pos, c) <= r + u.radius);

function tick(): void {
  state.time += TICK_DT;
  state.tick++;
  for (const u of state.units) {
    u.prevPos.x = u.pos.x;
    u.prevPos.y = u.pos.y;
  }
  for (let i = movers.length - 1; i >= 0; i--) {
    const m = movers[i];
    const t = Math.min(1, (state.time - m.t0) / m.dur);
    m.u.pos.x = m.from.x + (m.to.x - m.from.x) * t;
    m.u.pos.y = m.from.y + (m.to.y - m.from.y) * t;
    if (t >= 1) {
      movers.splice(i, 1);
      m.done?.();
    }
  }
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const meta = projMeta.get(p.id);
    p.prevPos.x = p.pos.x;
    p.prevPos.y = p.pos.y;
    const step = p.speed * TICK_DT;
    let ended = false;
    if (p.targetId >= 0) {
      const tgt = state.units.find((u) => u.id === p.targetId);
      if (!tgt) ended = true;
      else {
        const d = dist(p.pos, tgt.pos);
        if (d <= step + tgt.radius * 0.5) {
          p.pos.x = tgt.pos.x;
          p.pos.y = tgt.pos.y;
          events.push({ type: 'projectileHit', id: p.id, visual: p.visual, pos: cp(tgt.pos), targetId: tgt.id });
          ended = true;
        } else {
          p.dir.x = (tgt.pos.x - p.pos.x) / d;
          p.dir.y = (tgt.pos.y - p.pos.y) / d;
        }
      }
    }
    if (!ended) {
      p.pos.x += p.dir.x * step;
      p.pos.y += p.dir.y * step;
      p.traveled += step;
      if (p.targetId < 0 && meta) {
        for (const u of enemiesOf(p.team)) {
          if (meta.hit.has(u.id) || dist(u.pos, p.pos) > p.radius + u.radius) continue;
          meta.hit.add(u.id);
          events.push({ type: 'projectileHit', id: p.id, visual: p.visual, pos: cp(p.pos), targetId: u.id });
          damage(u, 320, p.visual === 'xingli_s1' ? 'magic' : 'physical');
          if (!meta.pierce) {
            ended = true;
            break;
          }
        }
        if (p.maxRange > 0 && p.traveled >= p.maxRange) ended = true;
      }
    }
    if (ended) {
      events.push({ type: 'projectileEnd', id: p.id, visual: p.visual, pos: cp(p.pos) });
      state.projectiles.splice(i, 1);
      projMeta.delete(p.id);
    }
  }
  for (let i = state.areas.length - 1; i >= 0; i--) {
    const a = state.areas[i];
    a.age += TICK_DT;
    if (a.followUnitId >= 0) {
      const f = state.units.find((u) => u.id === a.followUnitId);
      if (f) {
        a.pos.x = f.pos.x;
        a.pos.y = f.pos.y;
      }
    }
    if (a.age >= a.duration - 1e-6) {
      events.push({ type: 'areaEnd', id: a.id, visual: a.visual, pos: cp(a.pos) });
      state.areas.splice(i, 1);
    }
  }
  for (const u of state.units) {
    if (u.buffs.length === 0) continue;
    for (let i = u.buffs.length - 1; i >= 0; i--) {
      const b = u.buffs[i];
      b.timeLeft -= TICK_DT;
      if (b.timeLeft <= 0) {
        if (b.id === 'shield') u.shield = 0;
        u.buffs.splice(i, 1);
      }
    }
  }
  // 定时器：回调里可能再注册，按进入时的长度处理
  const n = timers.length;
  const due: (() => void)[] = [];
  let w = 0;
  for (let i = 0; i < n; i++) {
    if (timers[i].at <= state.time + 1e-6) due.push(timers[i].fn);
    else timers[w++] = timers[i];
  }
  for (let i = n; i < timers.length; i++) timers[w++] = timers[i];
  timers.length = w;
  for (const fn of due) fn();
}

// ───────────────────────── 播放表 ─────────────────────────

const PLAYS = new Map<string, () => void>();
const P0 = (): Vec2 => cp(player.pos);
const T0 = (): Vec2 => cp(foe.pos);
const dirTo = (a: Vec2, b: Vec2): Vec2 => {
  const d = dist(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};
const ahead = (d: number): Vec2 => {
  const dir = dirTo(player.pos, foe.pos);
  return { x: player.pos.x + dir.x * d, y: player.pos.y + dir.y * d };
};
const skill = (hero: HeroId, slot: 's1' | 's2' | 'ult') => HEROES[hero].skills[slot];
const val = (hero: HeroId, slot: 's1' | 's2' | 'ult', key: string): number => {
  const v = skill(hero, slot).values[key];
  return typeof v === 'number' ? v : v[0];
};
const castRange = (hero: HeroId, slot: 's1' | 's2' | 'ult'): number => {
  const c = skill(hero, slot).cast;
  return c.type === 'self' ? c.radius : c.range;
};
const castRadius = (hero: HeroId, slot: 's1' | 's2' | 'ult'): number => {
  const c = skill(hero, slot).cast;
  return c.type === 'position' || c.type === 'self' ? c.radius : 0;
};

/** 单个 FxKey 的事件(字段按 types.ts 注释给全) */
const SINGLE: Record<FxKey, () => void> = {
  hit_physical: () => fx('hit_physical', T0(), { unitId: player.id, targetId: foe.id }),
  hit_magic: () => fx('hit_magic', T0(), { unitId: player.id, targetId: foe.id }),
  hit_crit: () => fx('hit_crit', T0(), { unitId: player.id, targetId: foe.id }),
  hit_tower: () => fx('hit_tower', P0(), { team: 1, targetId: player.id }),
  heal: () => fx('heal', P0(), { unitId: player.id }),
  shield_break: () => fx('shield_break', P0(), { unitId: player.id }),
  level_up: () => fx('level_up', P0(), { unitId: player.id }),
  respawn: () => fx('respawn', P0(), { unitId: player.id }),
  recall_start: () => {
    fx('recall_start', P0(), { unitId: player.id });
    addBuff(player, 'recall', 5);
    setAnim(player, 'channel', 0);
  },
  recall_done: () => fx('recall_done', P0(), { unitId: player.id }),
  flash: () => {
    const from = P0();
    const to = ahead(5);
    player.pos = cp(to);
    player.prevPos = cp(to);
    fx('flash', to, { unitId: player.id, from, to, dir: dirTo(from, to) });
  },
  gold_gain: () => fx('gold_gain', cp(stageMinions[0].pos), { unitId: player.id, value: 42 }),
  tower_destroyed: () => fx('tower_destroyed', ahead(7), { team: 1 }),
  core_destroyed: () => fx('core_destroyed', ahead(9), { team: 1 }),
  monster_slain: () => fx('monster_slain', T0(), { team: 2, unitId: foe.id }),
  buff_gain: () => {
    addBuff(player, 'ember_might', 70);
    fx('buff_gain', P0(), { unitId: player.id });
  },
  // 河道巨龙吐息(C1 占位：只发事件，舞台上没有巨龙单位；待 D 特效包换成带巨龙与 cast_s1 动作的完整演示)
  drake_breath_warn: () => {
    const d = stageDrake();
    setAnim(d, 'cast_s1', 1.7);
    fx('drake_breath_warn', cp(d.pos), { team: 2, unitId: d.id, targetId: player.id, dir: dirTo(d.pos, player.pos), radius: 7.5, angle: Math.PI / 3, value: 0.9 });
  },
  drake_breath: () => {
    const d = stageDrake();
    setAnim(d, 'cast_s1', 1.7);
    d.animStart = state.time - 0.9;
    fx('drake_breath', cp(d.pos), { team: 2, unitId: d.id, dir: dirTo(d.pos, player.pos), radius: 7.5, angle: Math.PI / 3, value: 0.8 });
    for (let i = 0; i < 4; i++) after(i * 0.2, () => [player, ally].forEach((u) => damage(u, 90, 'magic', false, true, d)));
  },
  panyue_passive_hit: () => fx('panyue_passive_hit', T0(), { unitId: player.id, targetId: foe.id }),
  panyue_s1_dash: () => {
    const dir = dirTo(player.pos, foe.pos);
    fx('panyue_s1_dash', P0(), { unitId: player.id, dir });
    move(player, ahead(castRange('panyue', 's1')), val('panyue', 's1', 'dashSpeed'), 'dash');
  },
  panyue_s1_impact: () => fx('panyue_s1_impact', P0(), { unitId: player.id, radius: val('panyue', 's1', 'impactRadius') }),
  panyue_s2_cast: () => fx('panyue_s2_cast', P0(), { unitId: player.id, radius: castRadius('panyue', 's2') }),
  panyue_ult_leap: () => {
    const from = P0();
    const to = T0();
    fx('panyue_ult_leap', from, { unitId: player.id, from, to });
    move(player, to, dist(from, to) / val('panyue', 'ult', 'leapTime'), 'leap');
  },
  panyue_ult_land: () => fx('panyue_ult_land', T0(), { unitId: player.id, radius: castRadius('panyue', 'ult') }),
  chijin_passive_hit: () => fx('chijin_passive_hit', T0(), { unitId: player.id, targetId: foe.id }),
  chijin_s1_slash: () => {
    const c = skill('chijin', 's1').cast;
    fx('chijin_s1_slash', P0(), { unitId: player.id, dir: dirTo(player.pos, foe.pos), radius: castRange('chijin', 's1'), angle: c.type === 'cone' ? c.angle : 1.9 });
  },
  chijin_s2_dash: () => {
    const from = P0();
    const to = ahead(castRange('chijin', 's2'));
    fx('chijin_s2_dash', from, { unitId: player.id, from, to, dir: dirTo(from, to) });
    move(player, to, val('chijin', 's2', 'dashSpeed'), 'dash');
  },
  chijin_ult_start: () => fx('chijin_ult_start', P0(), { unitId: player.id }),
  chijin_ult_tick: () => fx('chijin_ult_tick', P0(), { unitId: player.id, radius: castRadius('chijin', 'ult') }),
  xingli_passive_burst: () => fx('xingli_passive_burst', T0(), { unitId: player.id, targetId: foe.id }),
  xingli_s1_cast: () => fx('xingli_s1_cast', P0(), { unitId: player.id, dir: dirTo(player.pos, foe.pos) }),
  xingli_s2_burst: () => fx('xingli_s2_burst', T0(), { unitId: player.id, radius: castRadius('xingli', 's2') }),
  xingli_ult_cast: () => fx('xingli_ult_cast', P0(), { unitId: player.id }),
  xingli_meteor: () => fx('xingli_meteor', T0(), { unitId: player.id, radius: 1.7 }),
  fengling_s1_cast: () => fx('fengling_s1_cast', P0(), { unitId: player.id, dir: dirTo(player.pos, foe.pos) }),
  fengling_s2_dash: () => {
    const from = P0();
    const to = ahead(castRange('fengling', 's2'));
    fx('fengling_s2_dash', from, { unitId: player.id, from, to, dir: dirTo(from, to) });
    move(player, to, val('fengling', 's2', 'dashSpeed'), 'dash');
  },
  fengling_ult_cast: () => fx('fengling_ult_cast', P0(), { unitId: player.id }),
  fengling_ult_tick: () => fx('fengling_ult_tick', T0(), { unitId: player.id, radius: castRadius('fengling', 'ult') }),
  yeque_s1_dash: () => {
    const from = P0();
    const to = ahead(castRange('yeque', 's1'));
    fx('yeque_s1_dash', from, { unitId: player.id, from, to, dir: dirTo(from, to) });
    move(player, to, val('yeque', 's1', 'dashSpeed'), 'dash');
  },
  yeque_s2_cast: () => fx('yeque_s2_cast', P0(), { unitId: player.id, dir: dirTo(player.pos, foe.pos) }),
  yeque_ult_vanish: () => {
    fx('yeque_ult_vanish', P0(), { unitId: player.id, targetId: foe.id });
    addBuff(player, 'untargetable', val('yeque', 'ult', 'vanish'));
  },
  yeque_ult_strike: () => {
    const from = P0();
    const back = foe.facing + Math.PI;
    const to = { x: foe.pos.x + Math.cos(back) * 1.5, y: foe.pos.y + Math.sin(back) * 1.5 };
    player.pos = cp(to);
    player.prevPos = cp(to);
    fx('yeque_ult_strike', T0(), { unitId: player.id, targetId: foe.id, from, to });
  },
};
for (const k of FX_KEYS) PLAYS.set(k, SINGLE[k]);

/** 技能连招：按模拟层 skills/*.ts 的时序发事件 */
const SEQ: Record<string, () => void> = {
  basic_melee: () => {
    player.targetId = foe.id;
    setAnim(player, 'attack', 0.6);
    events.push({ type: 'attack', unitId: player.id, targetId: foe.id });
    after(0.21, () => {
      fx('hit_physical', T0(), { unitId: player.id, targetId: foe.id });
      damage(foe, 172, 'physical', false, false);
    });
  },
  basic_crit: () => {
    setAnim(player, 'attack', 0.6);
    events.push({ type: 'attack', unitId: player.id, targetId: foe.id });
    after(0.21, () => {
      fx('hit_crit', T0(), { unitId: player.id, targetId: foe.id });
      damage(foe, 388, 'physical', true, false);
    });
  },
  panyue_s1: () => {
    SINGLE.panyue_s1_dash();
    const dur = castRange('panyue', 's1') / val('panyue', 's1', 'dashSpeed');
    after(dur, () => {
      const r = val('panyue', 's1', 'impactRadius');
      fx('panyue_s1_impact', P0(), { unitId: player.id, radius: r });
      for (const u of inCircle(player.pos, r, 0)) {
        damage(u, 300, 'physical');
        addBuff(u, 'airborne', val('panyue', 's1', 'knockup'));
        setAnim(u, 'airborne', val('panyue', 's1', 'knockup'));
      }
    });
  },
  panyue_s2: () => {
    const r = castRadius('panyue', 's2');
    const dur = val('panyue', 's2', 'duration');
    setAnim(player, 'cast_s2', 0.2);
    fx('panyue_s2_cast', P0(), { unitId: player.id, radius: r });
    addBuff(player, 'panyue_bulwark', dur);
    addBuff(player, 'shield', dur, 520, 1, player.id);
    spawnArea('panyue_s2_aura', P0(), r, dur, player, player);
    for (const u of inCircle(player.pos, r, 0)) {
      damage(u, 160, 'magic');
      addBuff(u, 'slow', val('panyue', 's2', 'slowDur'), val('panyue', 's2', 'slow'));
    }
  },
  panyue_ult: () => {
    const from = P0();
    const to = T0();
    const r = castRadius('panyue', 'ult');
    const leap = val('panyue', 'ult', 'leapTime');
    fx('panyue_ult_leap', from, { unitId: player.id, from, to });
    addBuff(player, 'unstoppable', leap + 0.1);
    spawnArea('telegraph', to, r, leap, player);
    move(player, to, dist(from, to) / leap, 'leap', () => {
      fx('panyue_ult_land', to, { unitId: player.id, radius: r });
      spawnArea('panyue_ult_fissure', to, r, val('panyue', 'ult', 'zoneDur'), player);
      for (const u of inCircle(to, r, 0)) {
        damage(u, 620, 'physical');
        addBuff(u, 'airborne', val('panyue', 'ult', 'knockup'));
        setAnim(u, 'airborne', val('panyue', 'ult', 'knockup'));
        addBuff(u, 'slow', 3, val('panyue', 'ult', 'slow'));
      }
    });
  },
  chijin_s1: () => {
    setAnim(player, 'cast_s1', 0.25);
    after(0.1, () => {
      SINGLE.chijin_s1_slash();
      for (const u of inCircle(player.pos, castRange('chijin', 's1'), 0)) {
        fx('hit_physical', cp(u.pos), { unitId: player.id, targetId: u.id });
        damage(u, 340, 'physical');
        addBuff(u, 'slow', val('chijin', 's1', 'slowDur'), val('chijin', 's1', 'slow'));
      }
      addBuff(player, 'chijin_ember', 4);
    });
  },
  chijin_s2: () => {
    SINGLE.chijin_s2_dash();
    addBuff(player, 'chijin_blaze', val('chijin', 's2', 'asDur'), 0.4);
  },
  chijin_ult: () => {
    const r = castRadius('chijin', 'ult');
    const dur = val('chijin', 'ult', 'duration');
    const interval = val('chijin', 'ult', 'tick');
    fx('chijin_ult_start', P0(), { unitId: player.id });
    addBuff(player, 'chijin_spin', dur);
    setAnim(player, 'spin', dur);
    spawnArea('chijin_ult_spin', P0(), r, dur, player, player);
    // 旋舞期间可以移动：让他慢慢向前走，验证区域跟随
    move(player, ahead(4), 4 / dur, 'spin');
    const total = Math.round(dur / interval);
    for (let i = 0; i < total; i++) {
      after(0.1 + i * interval, () => {
        fx('chijin_ult_tick', P0(), { unitId: player.id, radius: r });
        for (const u of inCircle(player.pos, r, 0)) {
          fx('hit_physical', cp(u.pos), { unitId: player.id, targetId: u.id });
          damage(u, 135, 'physical');
        }
      });
    }
  },
  xingli_basic: () => {
    setAnim(player, 'attack', 0.6);
    events.push({ type: 'attack', unitId: player.id, targetId: foe.id });
    after(0.18, () => spawnProjectile('xingli_basic', player, P0(), dirTo(player.pos, foe.pos), 24, { target: foe }));
  },
  xingli_s1: () => {
    setAnim(player, 'cast_s1', 0.2);
    after(0.08, () => {
      const dir = dirTo(player.pos, foe.pos);
      fx('xingli_s1_cast', P0(), { unitId: player.id, dir });
      spawnProjectile('xingli_s1', player, P0(), dir, val('xingli', 's1', 'speed'), { range: castRange('xingli', 's1'), radius: 0.65, pierce: true });
    });
  },
  xingli_s2: () => {
    const pos = T0();
    const r = castRadius('xingli', 's2');
    const delay = val('xingli', 's2', 'delay');
    setAnim(player, 'cast_s2', 0.25);
    spawnArea('telegraph', pos, r, delay, player);
    spawnArea('xingli_s2_well', pos, r, delay, player, undefined, () => {
      fx('xingli_s2_burst', pos, { unitId: player.id, radius: r });
      for (const u of inCircle(pos, r, 0)) {
        damage(u, 390, 'magic');
        addBuff(u, 'slow', val('xingli', 's2', 'slowDur'), val('xingli', 's2', 'slow'));
        addBuff(u, 'xingli_mark', 5, 0, Math.min(3, (u.buffs.find((b) => b.id === 'xingli_mark')?.stacks ?? 0) + 1));
      }
    });
  },
  xingli_ult: () => {
    const pos = T0();
    const r = castRadius('xingli', 'ult');
    const dur = val('xingli', 'ult', 'duration');
    const waves = val('xingli', 'ult', 'waves');
    const interval = dur / waves;
    setAnim(player, 'cast_ult', 0.4);
    fx('xingli_ult_cast', P0(), { unitId: player.id });
    spawnArea('telegraph', pos, r, val('xingli', 'ult', 'delay'), player, undefined, () => {
      spawnArea('xingli_ult_storm', pos, r, dur, player);
      let seed = 7;
      const rnd = (): number => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let w = 0; w < waves; w++) {
        for (let i = 0; i < 3; i++) {
          const rr = Math.sqrt(rnd()) * (r - 0.85);
          const a = rnd() * Math.PI * 2;
          const spot = { x: pos.x + Math.cos(a) * rr, y: pos.y + Math.sin(a) * rr };
          after(w * interval + (interval * i) / 3 + 0.001, () => fx('xingli_meteor', spot, { unitId: player.id, radius: 1.7 }));
        }
        after(w * interval + 0.001, () => {
          for (const u of inCircle(pos, r, 0)) {
            damage(u, 260, 'magic');
            addBuff(u, 'slow', 1, val('xingli', 'ult', 'slow'));
          }
        });
      }
    });
  },
  fengling_basic: () => {
    setAnim(player, 'attack', 0.5);
    events.push({ type: 'attack', unitId: player.id, targetId: foe.id });
    after(0.14, () => spawnProjectile('fengling_basic', player, P0(), dirTo(player.pos, foe.pos), 30, { target: foe }));
    addBuff(player, 'fengling_gale', 3, 0, Math.min(5, (player.buffs.find((b) => b.id === 'fengling_gale')?.stacks ?? 0) + 1));
  },
  fengling_s1: () => {
    setAnim(player, 'cast_s1', 0.3);
    after(0.1, () => {
      const dir = dirTo(player.pos, foe.pos);
      fx('fengling_s1_cast', P0(), { unitId: player.id, dir });
      spawnProjectile('fengling_s1', player, P0(), dir, val('fengling', 's1', 'speed'), { range: castRange('fengling', 's1'), radius: 0.65 });
    });
  },
  fengling_s2: () => {
    // 逐风步是向后拉开：朝远离敌人的方向翻跃
    const from = P0();
    const dir = dirTo(foe.pos, player.pos);
    const to = { x: from.x + dir.x * castRange('fengling', 's2'), y: from.y + dir.y * castRange('fengling', 's2') };
    fx('fengling_s2_dash', from, { unitId: player.id, from, to, dir });
    move(player, to, val('fengling', 's2', 'dashSpeed'), 'dash', () => {
      addBuff(player, 'haste', val('fengling', 's2', 'hasteDur'), val('fengling', 's2', 'haste'));
      addBuff(player, 'fengling_crit', val('fengling', 's2', 'critWindow'));
    });
  },
  fengling_ult: () => {
    const pos = T0();
    const r = castRadius('fengling', 'ult');
    const dur = val('fengling', 'ult', 'duration');
    const interval = val('fengling', 'ult', 'tick');
    setAnim(player, 'cast_ult', 0.4);
    fx('fengling_ult_cast', P0(), { unitId: player.id });
    spawnArea('telegraph', pos, r, val('fengling', 'ult', 'delay'), player, undefined, () => {
      spawnArea('fengling_ult_rain', pos, r, dur, player);
      const total = Math.round(dur / interval);
      for (let i = 0; i < total; i++) {
        after(i * interval + 0.001, () => {
          fx('fengling_ult_tick', pos, { unitId: player.id, radius: r });
          for (const u of inCircle(pos, r, 0)) {
            damage(u, 160, 'physical');
            addBuff(u, 'slow', val('fengling', 'ult', 'slowDur'), val('fengling', 'ult', 'slow'));
          }
        });
      }
    });
  },
  yeque_s1: () => {
    SINGLE.yeque_s1_dash();
    after(0.1, () => {
      fx('hit_physical', T0(), { unitId: player.id, targetId: foe.id });
      damage(foe, 255, 'physical');
    });
  },
  yeque_s2: () => {
    setAnim(player, 'cast_s2', 0.15);
    after(0.06, () => {
      const dir = dirTo(player.pos, foe.pos);
      const base = Math.atan2(dir.y, dir.x);
      fx('yeque_s2_cast', P0(), { unitId: player.id, dir });
      const spread = val('yeque', 's2', 'spread');
      for (let i = -1; i <= 1; i++) {
        const a = base + i * spread;
        spawnProjectile('yeque_s2', player, P0(), { x: Math.cos(a), y: Math.sin(a) }, val('yeque', 's2', 'speed'), { range: castRange('yeque', 's2'), radius: 0.5 });
      }
    });
  },
  yeque_ult: () => {
    const vanish = val('yeque', 'ult', 'vanish');
    setAnim(player, 'cast_ult', vanish);
    SINGLE.yeque_ult_vanish();
    after(vanish, () => {
      SINGLE.yeque_ult_strike();
      damage(foe, 820, 'physical');
    });
  },
  tower_shot: () => {
    // 敌方塔弹从高处追踪玩家，命中后叠一层锁定
    const from = ahead(8.5);
    const p = spawnProjectile('tower_bolt', foe2, from, dirTo(from, player.pos), 26, { target: player });
    p.team = 1;
    after(dist(from, player.pos) / 26, () => {
      fx('hit_tower', P0(), { team: 1, targetId: player.id });
      damage(player, 420, 'physical', false, false, foe2);
      addBuff(player, 'tower_focus', 3, 0, Math.min(4, (player.buffs.find((b) => b.id === 'tower_focus')?.stacks ?? 0) + 1));
    });
  },
  /** 走进敌方防御塔射程被锁定：范围圈由橙变红、警示连线、塔弹与锁定层数。配合 ?x=48.6&y=31&dir=-90 把舞台搬到红方下路一塔前 */
  tower_aggro: () => {
    let tower: Unit | null = null;
    let best = Infinity;
    for (const u of state.units) {
      if (u.kind !== 'tower' || u.team === player.team) continue;
      const d = dist(u.pos, player.pos);
      if (d < best) {
        best = d;
        tower = u;
      }
    }
    if (!tower) return;
    const t = tower;
    const dir = dirTo(player.pos, t.pos);
    const stop = Math.max(0, best - (t.stats.attackRange - 1.8));
    move(player, { x: player.pos.x + dir.x * stop, y: player.pos.y + dir.y * stop }, 5.5, 'move', () => {
      t.targetId = player.id;
      for (let i = 0; i < 3; i++) {
        after(0.3 + i, () => {
          const p = spawnProjectile('tower_bolt', t, cp(t.pos), dirTo(t.pos, player.pos), 26, { target: player });
          p.team = t.team;
          after(dist(t.pos, player.pos) / 26, () => {
            fx('hit_tower', P0(), { team: t.team, targetId: player.id });
            damage(player, 420 * (1 + 0.25 * i), 'physical', false, false, t);
            addBuff(player, 'tower_focus', 3, 0, i + 1, t.id);
          });
        });
      }
    });
  },
  hero_death: () => {
    foe.alive = false;
    foe.hp = 0;
    foe.anim = 'dead';
    events.push({ type: 'death', unitId: foe.id, kind: 'hero', team: foe.team, killerId: player.id, pos: T0() });
    events.push({ type: 'gold', unitId: player.id, amount: 280, pos: T0(), reason: 'kill' });
  },
  minion_lasthit: () => {
    const m = stageMinions[0];
    events.push({ type: 'death', unitId: m.id, kind: 'minion', team: m.team, killerId: player.id, pos: cp(m.pos) });
    fx('gold_gain', cp(m.pos), { unitId: player.id, value: 42 });
    events.push({ type: 'gold', unitId: player.id, amount: 42, pos: cp(m.pos), reason: 'lasthit' });
  },
  /** 团战压力测试：五个大招 + 弹道 + 普攻命中同时进行 */
  teamfight: () => {
    const c = at(0.5, 0);
    const casters = [player, ally, foe, foe2];
    const r = (hero: HeroId): number => castRadius(hero, 'ult');
    // 磐岳落地 + 裂隙
    fx('panyue_ult_land', at(1.5, -1), { unitId: ally.id, radius: r('panyue') });
    spawnArea('panyue_ult_fissure', at(1.5, -1), r('panyue'), 3, ally);
    // 星陨
    spawnArea('xingli_ult_storm', at(2.5, 2), r('xingli'), 2.5, player);
    for (let i = 0; i < 15; i++) after(i * 0.16, () => fx('xingli_meteor', at(2.5 + Math.sin(i * 2.4) * 3.6, 2 + Math.cos(i * 1.7) * 3.6), { unitId: player.id, radius: 1.7 }));
    // 箭雨(敌方)
    spawnArea('fengling_ult_rain', at(-2.5, -1.5), r('fengling'), 3, foe);
    for (let i = 0; i < 6; i++) after(i * 0.5, () => fx('fengling_ult_tick', at(-2.5, -1.5), { team: 1, unitId: foe.id, radius: r('fengling') }));
    // 旋舞(敌方，跟随)
    fx('chijin_ult_start', cp(foe2.pos), { team: 1, unitId: foe2.id });
    spawnArea('chijin_ult_spin', cp(foe2.pos), r('chijin'), 3, foe2, foe2);
    for (let i = 0; i < 10; i++) after(0.1 + i * 0.3, () => fx('chijin_ult_tick', cp(foe2.pos), { team: 1, unitId: foe2.id, radius: r('chijin') }));
    // 处决
    after(0.4, () => fx('yeque_ult_strike', cp(foe.pos), { unitId: player.id, targetId: foe.id, from: P0(), to: at(3.6, 0) }));
    // 壁垒 + 护盾
    addBuff(ally, 'shield', 4, 500, 1, ally.id);
    spawnArea('panyue_s2_aura', cp(ally.pos), 4.5, 4, ally, ally);
    // 弹道与普攻
    for (let i = 0; i < 8; i++) {
      after(i * 0.3, () => {
        spawnProjectile('xingli_s1', player, P0(), dirTo(player.pos, foe.pos), 26, { range: 12, radius: 0.65, pierce: true });
        spawnProjectile('fengling_basic', foe, cp(foe.pos), dirTo(foe.pos, ally.pos), 30, { target: ally });
        spawnProjectile('minion_ranged', stageMinions[1], cp(stageMinions[1].pos), dirTo(stageMinions[1].pos, player.pos), 18, { target: player });
        for (const u of casters) {
          fx(i % 3 === 0 ? 'hit_crit' : 'hit_physical', cp(u.pos), { unitId: -1, targetId: u.id });
          damage(u, 120 + i * 40, i % 2 ? 'magic' : 'physical', i % 3 === 0, false);
        }
      });
    }
    for (const u of casters) {
      addBuff(u, 'slow', 3, 0.35);
      addBuff(u, 'burn', 3, 20);
    }
    addBuff(foe, 'stun', 2);
    addBuff(foe, 'xingli_mark', 5, 0, 2);
    void c;
  },
};
for (const [k, fn] of Object.entries(SEQ)) PLAYS.set('seq:' + k, fn);

// ───────────────────────── 野怪 / 史诗 / 增益(把营地里的野怪临时搬上舞台) ─────────────────────────

const monsterHome = new Map<number, Vec2>();
/** 把某种野怪搬到舞台右前方(面朝玩家)；resetStage 时送回营地 */
function stageMonster(type: string, f = 4.8, r = 0.6): Unit {
  const m = state.units.find((u) => u.kind === 'monster' && u.monsterType === type) as Unit;
  if (!monsterHome.has(m.id)) monsterHome.set(m.id, cp(m.pos));
  const p = at(f, r);
  m.pos = cp(p);
  m.prevPos = cp(p);
  m.alive = true;
  m.hp = m.stats.maxHp * 0.6;
  m.anim = 'idle';
  m.animStart = state.time;
  m.animDur = 0;
  m.visible = [true, true];
  m.facing = Math.atan2(player.pos.y - p.y, player.pos.x - p.x);
  return m;
}
const stageDrake = (): Unit => stageMonster('abyss_drake', 5.5, 0.4);
function homeMonsters(): void {
  for (const [id, p] of monsterHome) {
    const m = state.units.find((u) => u.id === id);
    if (!m) continue;
    m.pos = cp(p);
    m.prevPos = cp(p);
    m.alive = true;
    m.anim = 'idle';
  }
  monsterHome.clear();
  state.teams[0].blessingLeft = 0;
  state.teams[1].blessingLeft = 0;
}

const MONSTER_TYPES = ['frost_golem', 'ember_golem', 'mossback', 'glimwing', 'abyss_drake', 'star_colossus'] as const;
const SEQ2: Record<string, () => void> = {
  /** 河道巨龙吐息全程：0.9 秒预警 → 0.8 秒喷吐(喷中玩家与队友) */
  drake_breath: () => {
    const d = stageDrake();
    setAnim(d, 'cast_s1', 1.7);
    fx('drake_breath_warn', cp(d.pos), { team: 2, unitId: d.id, targetId: player.id, dir: dirTo(d.pos, player.pos), radius: 7.5, angle: Math.PI / 3, value: 0.9 });
    after(0.9, () => {
      fx('drake_breath', cp(d.pos), { team: 2, unitId: d.id, dir: dirTo(d.pos, player.pos), radius: 7.5, angle: Math.PI / 3, value: 0.8 });
      for (let i = 0; i < 4; i++) after(i * 0.2, () => [player, ally].forEach((u) => damage(u, 90, 'magic', false, true, d)));
    });
  },
  /** 河道巨龙被击杀：倒地演出 + 全队奖励(光带飞向本方英雄) */
  drake_slain: () => {
    const d = stageDrake();
    d.alive = false;
    d.anim = 'dead';
    d.animStart = state.time;
    fx('monster_slain', cp(d.pos), { team: 2, unitId: d.id });
    events.push({ type: 'epicSlain', monsterType: 'abyss_drake', team: 0, pos: cp(d.pos) });
  },
  /** 远古巨灵被击杀：星雨 + 八芒星印，之后全队挂星陨祝福(英雄脚环 + 小兵头顶金星) */
  colossus_slain: () => {
    const c = stageMonster('star_colossus', 7, 0);
    c.alive = false;
    c.anim = 'dead';
    c.animStart = state.time;
    fx('monster_slain', cp(c.pos), { team: 2, unitId: c.id });
    events.push({ type: 'epicSlain', monsterType: 'star_colossus', team: 0, pos: cp(c.pos) });
    after(1.0, () => {
      state.teams[0].blessingLeft = 80;
      for (const u of [player, ally]) addBuff(u, 'star_blessing', 80, 0, 1, u.id);
    });
  },
  /** 蓝buff 被击杀：霜纹晶化成光球飞向击杀者 */
  frost_gain: () => {
    const m = stageMonster('frost_golem', 3.5, -2.2);
    m.alive = false;
    m.anim = 'dead';
    m.animStart = state.time;
    fx('monster_slain', cp(m.pos), { team: 2, unitId: m.id });
    addBuff(player, 'frost_insight', 90, 0, 1, player.id);
    fx('buff_gain', P0(), { unitId: player.id });
  },
  /** 红buff 被击杀：熔核化成光球飞来 */
  ember_gain: () => {
    const m = stageMonster('ember_golem', 3.5, -2.2);
    m.alive = false;
    m.anim = 'dead';
    m.animStart = state.time;
    fx('monster_slain', cp(m.pos), { team: 2, unitId: m.id });
    addBuff(player, 'ember_might', 90, 0, 1, player.id);
    fx('buff_gain', P0(), { unitId: player.id });
  },
  /** 三种增益同时在身上：脚环分层(蓝 1.6 / 红 1.85 / 巨灵 2.1 倍半径)；队友只有巨灵；小兵头顶金星 */
  buff_rings: () => {
    addBuff(player, 'frost_insight', 90, 0, 1, player.id);
    addBuff(player, 'ember_might', 90, 0, 1, player.id);
    addBuff(player, 'star_blessing', 80, 0, 1, player.id);
    addBuff(ally, 'star_blessing', 80, 0, 1, ally.id);
    addBuff(foe, 'ember_might', 4, 0, 1, foe.id);
    state.teams[0].blessingLeft = 80;
  },
  /** 野怪营地的远程小野怪：磷粉弹 */
  moth_spit: () => {
    const m = stageMonster('glimwing', 4.5, -2);
    for (let i = 0; i < 3; i++) after(i * 0.45, () => spawnProjectile('monster_spit', m, cp(m.pos), dirTo(m.pos, player.pos), 16, { target: player }));
  },
};
for (const t of MONSTER_TYPES) {
  SEQ2['spawn_' + t] = () => {
    const m = stageMonster(t, 4.5, 0);
    events.push({ type: 'monsterSpawn', campId: 0, monsterType: t, pos: cp(m.pos) });
  };
  SEQ2['slain_' + t] = () => {
    const m = stageMonster(t, 4.5, 0);
    m.alive = false;
    m.anim = 'dead';
    m.animStart = state.time;
    fx('monster_slain', cp(m.pos), { team: 2, unitId: m.id });
  };
}
for (const [k, fn] of Object.entries(SEQ2)) PLAYS.set('seq:' + k, fn);

/** 投射物预览 */
const PROJ_SPEED: Record<ProjectileVisual, number> = {
  xingli_basic: 24, xingli_s1: 26, fengling_basic: 30, fengling_s1: 32, yeque_s2: 26, minion_ranged: 18, minion_siege: 14, tower_bolt: 26, core_bolt: 26, monster_spit: 16,
};
for (const v of PROJECTILE_VISUALS) {
  PLAYS.set('proj:' + v, () => {
    const dir = dirTo(player.pos, foe.pos);
    const linear = v === 'xingli_s1' || v === 'fengling_s1' || v === 'yeque_s2';
    if (linear) spawnProjectile(v, player, P0(), dir, PROJ_SPEED[v], { range: 12, radius: 0.6, pierce: v === 'xingli_s1' });
    else if (v === 'tower_bolt' || v === 'core_bolt') {
      // 从高处(塔顶)飞向玩家：两种队伍色各来一发
      const p = spawnProjectile(v, foe2, ahead(9), dirTo(ahead(9), player.pos), PROJ_SPEED[v], { target: player });
      p.team = 1;
      after(0.25, () => spawnProjectile(v, ally, at(-9, -2), dirTo(at(-9, -2), foe.pos), PROJ_SPEED[v], { target: foe }));
    } else if (v === 'minion_ranged' || v === 'minion_siege') {
      spawnProjectile(v, stageMinions[3], cp(stageMinions[3].pos), dirTo(stageMinions[3].pos, foe.pos), PROJ_SPEED[v], { target: foe });
      const m = stageMinions[1];
      after(0.2, () => spawnProjectile(v, m, cp(m.pos), dirTo(m.pos, player.pos), PROJ_SPEED[v], { target: player }));
    } else spawnProjectile(v, player, P0(), dir, PROJ_SPEED[v], { target: foe });
  });
}

/** 区域预览(enemy = 敌方施放) */
const AREA_SPEC: Record<AreaVisual, { radius: number; duration: number; follow: boolean }> = {
  telegraph: { radius: 4.5, duration: 1.2, follow: false },
  panyue_s2_aura: { radius: 4.5, duration: 4, follow: true },
  panyue_ult_fissure: { radius: 4.5, duration: 3, follow: false },
  chijin_ult_spin: { radius: 4.2, duration: 3, follow: true },
  xingli_s2_well: { radius: 3.4, duration: 0.6, follow: false },
  xingli_ult_storm: { radius: 5.2, duration: 2.5, follow: false },
  fengling_ult_rain: { radius: 5, duration: 3, follow: false },
  fountain_zone: { radius: 4.5, duration: 3, follow: false },
};
for (const v of AREA_VISUALS) {
  for (const enemy of [false, true]) {
    PLAYS.set('area:' + v + (enemy ? ':enemy' : ''), () => {
      const spec = AREA_SPEC[v];
      const owner = enemy ? foe : player;
      const pos = spec.follow ? cp(owner.pos) : enemy ? P0() : T0();
      spawnArea(v, pos, spec.radius, spec.duration, owner, spec.follow ? owner : undefined);
    });
  }
}
PLAYS.set('area:telegraph:ally', () => spawnArea('telegraph', T0(), 4.5, 1.2, ally));

/** 状态预览：挂在最合适的单位上 */
const BUFF_SPEC: Partial<Record<BuffId, { on: 'self' | 'foe'; value?: number; stacks?: number }>> = {
  stun: { on: 'foe' }, airborne: { on: 'foe' }, root: { on: 'foe' }, slow: { on: 'foe', value: 0.4 }, shield: { on: 'self', value: 500 }, haste: { on: 'self', value: 0.3 },
  burn: { on: 'foe', value: 20 }, untargetable: { on: 'self' }, unstoppable: { on: 'self' }, recall: { on: 'self' }, restore: { on: 'self' }, fountain: { on: 'self' },
  respawn_guard: { on: 'self' }, frost_insight: { on: 'self' }, ember_might: { on: 'self' }, star_blessing: { on: 'self' }, xingli_mark: { on: 'foe', stacks: 3 },
  tower_focus: { on: 'self', stacks: 3 }, panyue_passive: { on: 'self', stacks: 2 }, chijin_ember: { on: 'self' }, chijin_blaze: { on: 'self' },
  fengling_gale: { on: 'self', stacks: 5 }, fengling_crit: { on: 'self' }, yeque_shadow: { on: 'self' },
};
for (const id of STATUS_BUFFS) {
  PLAYS.set('buff:' + id, () => {
    const spec = BUFF_SPEC[id] ?? { on: 'self' };
    const u = spec.on === 'foe' ? foe : player;
    addBuff(u, id, 6, spec.value ?? 0, spec.stacks ?? 1, u.id);
    if (id === 'haste') move(player, at(-3.5, 6.5), 7, 'move');
    if (id === 'airborne') setAnim(foe, 'airborne', 1);
  });
}
PLAYS.set('buff:all', () => {
  const units = [player, ally, foe, foe2, ...stageMinions];
  STATUS_BUFFS.forEach((id, i) => {
    const spec = BUFF_SPEC[id] ?? { on: 'self' };
    addBuff(units[i % units.length], id, 8, spec.value ?? 0, spec.stacks ?? 1, units[i % units.length].id);
  });
});
PLAYS.set('buff:stacks', () => {
  // 层数类：依次叠到满，检查层数显示
  for (let i = 1; i <= 5; i++) {
    after((i - 1) * 0.6, () => {
      addBuff(foe, 'xingli_mark', 5, 0, Math.min(3, i));
      addBuff(player, 'fengling_gale', 5, 0, i);
      addBuff(player, 'tower_focus', 5, 0, Math.min(4, i));
    });
  }
});

/** 瞄准指示器预览 */
const AIMS: Record<string, () => AimIndicator> = {
  direction: () => ({ kind: 'direction', dir: dirTo(player.pos, foe.pos), range: 12, width: 1.3 }),
  cone: () => ({ kind: 'cone', dir: dirTo(player.pos, foe.pos), range: 5.5, angle: (110 * Math.PI) / 180 }),
  position: () => ({ kind: 'position', pos: T0(), range: 9.5, radius: 4.5 }),
  target: () => ({ kind: 'target', targetId: foe.id, range: 8 }),
  self: () => ({ kind: 'self', radius: 4.2 }),
};
for (const [k, mk] of Object.entries(AIMS)) {
  PLAYS.set('aim:' + k, () => {
    aim = mk();
    renderer.setAim(aim);
  });
  PLAYS.set('aim:' + k + ':cancel', () => {
    aim = { ...mk(), cancel: true };
    renderer.setAim(aim);
  });
}

// ───────────────────────── 底层样例(逐个形状/贴花/图集，检查着色器) ─────────────────────────

const DBG_COLORS = [0xff5a1e, 0x3aa8ff, 0x2ee096, 0x9050ff, 0xffa22a, 0xffd04a];
PLAYS.set('dbg:shapes', () => {
  const kit = fxModule.kit;
  const modes: [number, number, string][] = [
    [SHAPE.pillar, MODE.pillar, '光柱'], [SHAPE.sphere, MODE.rim, '光壳'], [SHAPE.sphere, MODE.core, '光球'], [SHAPE.sphere, MODE.hex, '护罩'],
    [SHAPE.slash, MODE.slash, '斩弧'], [SHAPE.cone, MODE.vortex, '旋风'], [SHAPE.hoop, MODE.hoop, '环箍'], [SHAPE.diamond, MODE.core, '晶弹'],
    [SHAPE.arrow, MODE.solid, '箭'], [SHAPE.blade, MODE.solid, '飞刃'], [SHAPE.spike, MODE.plain, '岩刺'], [SHAPE.rock, MODE.plain, '碎岩'],
  ];
  modes.forEach(([shape, mode], i) => {
    const p = at(-6 + (i % 6) * 2.6, i < 6 ? -1.6 : 2.2);
    const m = kit.glow.hold(shape, mode);
    const c = new THREE.Color(DBG_COLORS[i % DBG_COLORS.length]);
    const lit = shape === SHAPE.spike || shape === SHAPE.rock;
    m.color(lit ? new THREE.Color(0xffffff) : c, lit ? 1 : 1.4, 0.95);
    m.add = mode === MODE.solid ? 0.3 : 0.5;
    m.k = mode === MODE.slash ? 1 : mode === MODE.vortex ? 4 : 2;
    m.progress = mode === MODE.slash ? -2 : mode === MODE.vortex ? 0.15 : 0;
    const flat = shape === SHAPE.slash || shape === SHAPE.hoop || shape === SHAPE.blade;
    m.at(p.x, flat ? 0.8 : shape === SHAPE.sphere || shape === SHAPE.diamond || shape === SHAPE.arrow ? 1.1 : 0.05, p.y);
    const tall = shape === SHAPE.pillar || shape === SHAPE.cone || shape === SHAPE.spike;
    m.scale3(1, tall ? 2.6 : 1, 1);
    if (shape === SHAPE.rock) m.scale(0.6);
  });
});
PLAYS.set('dbg:decals', () => {
  const kit = fxModule.kit;
  const entries = Object.entries(DECAL);
  entries.forEach(([, type], i) => {
    const p = at(-6.6 + (i % 5) * 3.3, -3.4 + Math.floor(i / 5) * 3.3);
    const c = new THREE.Color(DBG_COLORS[i % DBG_COLORS.length]);
    const pen = kit.decals.at(kit.decals.hold(type, 0)).at(p.x, p.y).radius(1.45).color(c, 1.6, 1).under(new THREE.Color(0x120c20), 0.6);
    if (type === DECAL.cone) pen.params(0.96, 1);
    else if (type === DECAL.rune) pen.params(6, 0.6);
    else if (type === DECAL.telegraph) pen.params(0.6);
    else if (type === DECAL.rect) pen.rot(0, 0.3);
    else if (type === DECAL.range) pen.params(0.02, 24);
    else if (type === DECAL.swirl) pen.params(3, 2.4);
    else if (type === DECAL.star) pen.params(5, 2.6);
    else if (type === DECAL.streak) pen.rot(0, 0.3).params(0.5, 0);
    else if (type === DECAL.zone) pen.params(16, 0);
    else if (type === DECAL.ring) pen.params(0.2, 1);
    else if (type === DECAL.glow) pen.params(1.5);
    else if (type === DECAL.sigil) pen.params(i % 4, 1);
    else if (type === DECAL.coneWarn) pen.rot(0).params(0.52, 0.6).under(new THREE.Color(0xa070ff), 0.55);
  });
});
PLAYS.set('dbg:new', () => {
  // D 包新增的基元：纹章细环 4 种纹样 / 扇形预警 / 图集第 5 行的 5 个通用精灵 / 吐息锥
  const kit = fxModule.kit;
  const pats: [number, number][] = [[0, 0x4f9cff], [1, 0xff7a3c], [2, 0xffd04a], [3, 0xa070ff]];
  pats.forEach(([pat, c], i) => {
    const p = at(-6.5 + i * 4.2, -2.6);
    kit.decals.at(kit.decals.hold(DECAL.sigil, 0)).at(p.x, p.y).radius(2.0).params(pat, 1).color(new THREE.Color(c), 1.5, 0.9).under(new THREE.Color(0x120c20), 0.3);
  });
  const cw = at(-6.5, 1.2);
  kit.decals.at(kit.decals.hold(DECAL.coneWarn, 0)).at(cw.x, cw.y).radius(4).rot(stageDir).params(0.52, 0.6).color(new THREE.Color(0xffc24a), 1.6, 0.95).under(new THREE.Color(0x8040ff), 0.7);
  for (let i = 35; i < 40; i++) {
    const p = at(-0.5 + (i - 35) * 2.0, 2.6);
    const st = particleStyle({ sprite: i, add: 0.3, color: DBG_COLORS[i % DBG_COLORS.length], intensity: 1.4, fadeIn: 0.01, fadeOut: 0.98, rot: 0 });
    kit.particles.use(st).spawn(p.x, 1.2, p.y, 0, 0, 0, 60, 1.7, 1.7);
  }
  const m = kit.glow.hold(SHAPE.breath, MODE.breath);
  const bp = at(3.5, -3);
  m.at(bp.x, 1.6, bp.y).scale3(5, 1.2, 2.6).rot(0, -stageDir, -0.2).color(new THREE.Color(0xa070ff), 1.05, 0.85);
  m.add = 0.4;
  m.k = 2.6;
  m.progress = 0;
});
PLAYS.set('dbg:hero', () => {
  // 英雄特效包新增的基元：盾影(正面 / 侧面) / 匕首 / 墨迹笔触 / 帛卷 / 音波环(一次性外扩、常驻点亮、涟漪) / 盾印 / 圆月 / 雁 · 音波弧 · 墨溅三个精灵
  const kit = fxModule.kit;
  const ink = new THREE.Color(0x0e0a16);
  [0, 1.2].forEach((yaw, i) => {
    const p = at(-6.4 + i * 2.2, -3.2);
    const m = kit.glow.hold(SHAPE.shield, MODE.plate);
    m.at(p.x, 0.05, p.y).scale(2.4).rot(0, -(stageDir + Math.PI * 0.5 + yaw), 0.08).color(new THREE.Color(0xffc44e), 1.2, 0.95);
    m.add = 0.25;
    m.k = 0.18;
    m.progress = 0.45;
  });
  [0, 0.9].forEach((roll, i) => {
    const p = at(-1.6 + i * 2.2, -3.4);
    const m = kit.glow.hold(SHAPE.dagger, MODE.solid);
    m.at(p.x, 1.1, p.y).scale(1.5).rot(roll, -stageDir - 0.5, 0.15).color(new THREE.Color(0xe8f0ff), 1.5, 1);
    m.add = 0.2;
  });
  const d = kit.decals;
  const hold = (type: number, f: number, r: number, radius: number) => {
    const p = at(f, r);
    return d.at(d.hold(type, 0)).at(p.x, p.y).radius(radius);
  };
  hold(DECAL.ink, -5.2, 0.2, 2.6).rot(stageDir, 0.22).params(0, 1).color(new THREE.Color(0xe8f0ff), 1.6, 1).under(ink, 0.8);
  // 帛卷是按寿命铺开的：用一次性贴花(寿命很长，铺开只占开头一瞬)才看得到全貌
  const sp = at(0.4, 0.2);
  d.add(DECAL.scroll, sp.x, sp.y, 2.6, 120).rot(stageDir, 0.12).params(0.002, 1.3).color(ink, 1, 1).under(new THREE.Color(0xf0e6cc), 0.6);
  hold(DECAL.rings, 5.2, -2.8, 1.6).params(4, 0.6).color(new THREE.Color(0xf2f8ff), 1.5, 1).under(new THREE.Color(0x141a3c), 0.3);
  hold(DECAL.rings, 5.2, 0.9, 1.6).params(3, 2).color(new THREE.Color(0x8cc4ff), 1.3, 1).under(new THREE.Color(0x141a3c), 0.3);
  hold(DECAL.shieldMark, -5.6, 3.4, 1.7).rot(stageDir, 0.72).params(1, 0.4).color(new THREE.Color(0xffc44e), 1.8, 1).under(new THREE.Color(0x120c20), 0.8);
  hold(DECAL.moon, -1.8, 3.4, 1.7).params(0.72, 1).color(new THREE.Color(0xf2f8ff), 1.5, 1).under(new THREE.Color(0x141a3c), 0.35);
  for (let i = 32; i < 35; i++) {
    const p = at(1.6 + (i - 32) * 2.2, 3.4);
    const dark = i === 34;
    const st = particleStyle({ sprite: i, add: dark ? 0 : 0.4, color: dark ? 0x0e0a16 : 0xf2f8ff, intensity: dark ? 1 : 1.6, fadeIn: 0.01, fadeOut: 0.98, rot: 0 });
    kit.particles.use(st).spawn(p.x, 1.2, p.y, 0, 0, 0, 60, 1.9, 1.9);
  }
});
PLAYS.set('dbg:sprites', () => {
  // 图集里的每个图形各发一个长寿命粒子
  const kit = fxModule.kit;
  for (let i = 0; i < 40; i++) {
    const p = at(-7 + (i % 8) * 2, -3.2 + Math.floor(i / 8) * 1.7);
    const st = particleStyle({ sprite: i, add: i % 2 ? 1 : 0.3, color: DBG_COLORS[i % DBG_COLORS.length], intensity: 1.4, fadeIn: 0.01, fadeOut: 0.98, rot: 0 });
    kit.particles.use(st).spawn(p.x, 1, p.y, 0, 0, 0, 60, 1.5, 1.5);
  }
});

// ───────────────────────── 渲染器 ─────────────────────────

// ?units=placeholder 用胶囊占位单位(不依赖单位模型)；缺省用真实的单位视图模块
const unitsFactory: RenderModuleFactory = params.get('units') === 'placeholder' ? createPlaceholderUnits : createUnitsModule;
const factories: RenderModuleFactory[] = [createTerrainModule, unitsFactory, createFxModule, createOverlayModule];
const renderer = createRendererCore(app, state, { quality }, factories);
const engine = renderer.engine;
const ctx = renderer.context;
const fxModule = ctx.getModule<FxModule>('fx') as FxModule;
const overlayModule = ctx.getModule<OverlayModule>('overlay') as OverlayModule;
// 画廊不经应用层：阵亡去色由特效模块自己来
fxModule.setDeathGrade(true);
const modules = ['terrain', 'units', 'fx', 'overlay'].map((n) => ctx.getModule(n)).filter((m): m is RenderModule => !!m);
if (!freeStage) {
  renderer.setCameraPeek({ x: center.x + F.x * 0.5, y: center.y + F.y * 0.5 - 1.5 });
  renderer.snapCamera();
}
resetStage();

/** 推进 dt 秒；draw = false 时只更新不绘制(快进用) */
let tickAcc = 0;
function advance(dt: number, draw: boolean): void {
  tickAcc += dt;
  while (tickAcc >= TICK_DT) {
    tickAcc -= TICK_DT;
    if (world) {
      world.step();
      for (const e of world.drainEvents()) events.push(e);
    } else tick();
  }
  const alpha = Math.min(1, tickAcc / TICK_DT);
  if (events.length > 0) {
    renderer.handleEvents(events, state);
    events.length = 0;
  }
  if (draw) renderer.render(state, alpha, dt);
  else {
    // 与 core.render 相同的顺序，只是不调引擎绘制
    const f = ctx.frame;
    f.state = state;
    f.alpha = alpha;
    f.dt = dt;
    f.time += dt;
    f.frame++;
    engine.updateCamera(dt);
    for (const m of modules) m.update(f);
    engine.lights.update(dt);
  }
}

let frozen = false;
let settledFrames = 0;
let current = '';
function play(name: string, freezeAt?: number): boolean {
  const fn = PLAYS.get(name);
  if (!fn) return false;
  current = name;
  frozen = false;
  settledFrames = 0;
  if (window.__fx) window.__fx.settled = false;
  fxModule.reset();
  overlayModule.reset();
  resetStage();
  // 先空跑两帧让锚点/镜头就位，再触发
  advance(1 / 60, false);
  fn();
  if (freezeAt !== undefined) {
    const steps = Math.max(1, Math.round(freezeAt * 60));
    for (let i = 0; i < steps; i++) advance(1 / 60, false);
    frozen = true;
  }
  for (const b of panel.querySelectorAll('button')) b.classList.toggle('on', b.dataset.play === name);
  return true;
}

// ───────────────────────── 面板 ─────────────────────────

function section(title: string, names: string[], label: (n: string) => string): void {
  const h = document.createElement('h3');
  h.textContent = title;
  panel.appendChild(h);
  for (const n of names) {
    const b = document.createElement('button');
    b.textContent = label(n);
    b.dataset.play = n;
    b.addEventListener('click', () => play(n));
    panel.appendChild(b);
  }
}
const strip = (n: string): string => n.replace(/^[a-z]+:/, '');
const keysOf = (pre: string): string[] => [...PLAYS.keys()].filter((k) => k.startsWith(pre));
section('技能连招(真实时序)', keysOf('seq:'), strip);
section('通用 FxKey', FX_KEYS.filter((k) => !HERO_IDS.some((h) => k.startsWith(h + '_'))), (n) => n);
for (const h of HERO_IDS) section(`${HEROES[h].name} FxKey`, FX_KEYS.filter((k) => k.startsWith(h + '_')), (n) => n.slice(h.length + 1));
section('投射物', keysOf('proj:'), strip);
section('区域', keysOf('area:'), strip);
section('状态 buff', keysOf('buff:'), strip);
section('瞄准指示器', keysOf('aim:'), strip);
section('底层样例', keysOf('dbg:'), strip);
if (params.get('panel') === '0' || freeStage) panel.style.display = 'none';
if (params.get('hud') === '0') hud.style.display = 'none';

// ───────────────────────── 叠加层演示：定时注入事件 ─────────────────────────

let demoT = 0;
let demoN = 0;
function overlayEvents(dt: number): void {
  demoT += dt;
  if (demoT < 0.28) return;
  demoT = 0;
  demoN++;
  const heroes = state.heroes.filter((h) => h.alive);
  const tgt = heroes[demoN % heroes.length];
  const types: DamageType[] = ['physical', 'magic', 'true'];
  const crit = demoN % 5 === 0;
  const amount = Math.round(60 + ((demoN * 97) % 520));
  tgt.hp = Math.max(tgt.stats.maxHp * 0.15, tgt.hp - amount);
  if (tgt.hp < tgt.stats.maxHp * 0.2) tgt.hp = tgt.stats.maxHp * 0.95;
  tgt.lastHitTime = state.time;
  events.push({ type: 'damage', targetId: tgt.id, sourceId: state.playerId, amount, dtype: types[demoN % 3], crit, pos: cp(tgt.pos), skill: demoN % 2 === 0 });
  if (demoN % 3 === 0) events.push({ type: 'damage', targetId: tgt.id, sourceId: state.playerId, amount: amount * 0.4, dtype: 'magic', crit: false, pos: cp(tgt.pos), skill: true });
  if (demoN % 7 === 0) events.push({ type: 'heal', targetId: player.id, amount: 180, pos: cp(player.pos) });
  if (demoN % 9 === 0) events.push({ type: 'gold', unitId: player.id, amount: 42, pos: cp(tgt.pos), reason: 'lasthit' });
  if (demoN % 23 === 0) events.push({ type: 'levelUp', unitId: player.id, level: player.level + 1 });
  if (demoN === 2) {
    // 给几个单位挂上状态，检查头顶图标
    addBuff(state.heroes[5], 'stun', 999);
    addBuff(state.heroes[6], 'xingli_mark', 999, 0, 2);
    addBuff(state.heroes[2], 'fengling_gale', 999, 0, 4);
    addBuff(player, 'tower_focus', 999, 0, 2);
    addBuff(state.heroes[7], 'root', 999);
    addBuff(state.heroes[7], 'silence', 999);
    player.targetId = state.heroes[5].id;
  }
}

// ───────────────────────── 主循环 ─────────────────────────

const speed = num('speed') ?? 1;
const loop = num('loop');
let loopT = 0;
let last = performance.now();
let hudT = 0;
function frame(now: number): void {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (frozen) {
    // 定格：dt = 0，特效时钟不走。画够三帧就停止重绘(软件渲染很慢，停下来截图才不会超时)
    if (settledFrames < 3) {
      renderer.render(state, Math.min(1, tickAcc / TICK_DT), 0);
      settledFrames++;
      window.__fx.settled = settledFrames >= 3;
    }
  } else {
    const dt = real * speed;
    if (overlayDemo) overlayEvents(dt);
    advance(dt, true);
    if (loop !== null && current) {
      loopT += dt;
      if (loopT >= loop) {
        loopT = 0;
        play(current);
      }
    }
  }
  hudT -= real;
  if (hudT <= 0) {
    hudT = 0.25;
    const s = renderer.getStats();
    const f = fxModule.getStats();
    hud.textContent =
      `画质 ${engine.quality}  FPS ${s.fps}  draw ${s.drawCalls}  tri ${s.triangles.toLocaleString()}\n` +
      `特效网格 ${f.drawCalls}  贴花 ${f.decals}  投射物 ${f.projectiles}  区域 ${f.areas}  状态 ${f.statuses}\n` +
      `粒子累计 ${f.particlesSpawned} / 容量 ${f.particleCapacity}   ${current}${frozen ? ' (定格)' : ''}`;
  }
  requestAnimationFrame(frame);
}

addEventListener('resize', () => renderer.resize());
addEventListener('keydown', (e) => {
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') renderer.setQuality(e.code === 'Digit1' ? 'low' : e.code === 'Digit2' ? 'medium' : 'high');
  if (e.code === 'Space') {
    frozen = !frozen;
    settledFrames = 0;
  }
});


declare global {
  interface Window {
    __fx: {
      play: typeof play;
      /** 推进 dt 秒(draw = false 只更新不绘制)：脚本做长时间压力测试用 */
      advance: typeof advance;
      /** 定格后画面已经稳定(可以截图) */
      settled: boolean;
      names: string[];
      stats: () => { renderer: ReturnType<typeof renderer.getStats>; fx: ReturnType<FxModule['getStats']> };
      state: GameState;
      renderer: typeof renderer;
      /** 世界坐标 → 屏幕坐标(截图脚本用它找裁剪区域) */
      w2s: (x: number, y: number, h?: number) => { x: number; y: number; visible: boolean };
      stage: { center: Vec2; player: () => Vec2; foe: () => Vec2 };
    };
  }
}
window.__fx = {
  play,
  advance,
  settled: false,
  names: [...PLAYS.keys()],
  stats: () => ({ renderer: { ...renderer.getStats() }, fx: { ...fxModule.getStats() } }),
  state,
  renderer,
  w2s: (x, y, h = 0) => renderer.worldToScreen({ x, y }, h),
  stage: { center, player: () => cp(player.pos), foe: () => cp(foe.pos) },
};

if (playParam) {
  const t = num('t');
  if (!play(playParam, t ?? undefined)) console.warn('未知的 play 名字：' + playParam);
} else if (world) {
  // 快进 ff 秒(只跑模拟，不喂事件)，再带着特效跑 t 秒后定格；不给 t 就一直实时播放
  const ff = Math.round((num('ff') ?? 0) / TICK_DT);
  for (let i = 0; i < ff && !state.over; i++) world.step();
  world.drainEvents();
  renderer.snapCamera();
  const t = num('t');
  if (t !== null) {
    const steps = Math.max(1, Math.round(t * 60));
    for (let i = 0; i < steps; i++) advance(1 / 60, false);
    frozen = true;
  }
} else if (overlayDemo && num('t') !== null) {
  // 叠加层演示也支持定格：快进 t 秒(期间照常注入演示事件)后停住
  const steps = Math.max(1, Math.round((num('t') ?? 0) * 60));
  for (let i = 0; i < steps; i++) {
    overlayEvents(1 / 60);
    advance(1 / 60, false);
  }
  frozen = true;
}
requestAnimationFrame(frame);
