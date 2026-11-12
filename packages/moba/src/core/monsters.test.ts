/**
 * 河道巨龙的吐息：起手时机、预警/喷吐事件与 cast_s1 动作、扇形范围伤害、躲避、收势、重置与清理，
 * 以及 Bot 侧的感知(BotView.hostileCones)与出逃方向(ai/geom.ts 的 coneEscape)。
 */
import { describe, expect, it } from 'vitest';
import { coneEscape, inCone } from './ai/geom';
import type { ConeHazard } from './ai/types';
import { killUnit } from './combat';
import { ARMOR_K, MONSTER_RULES } from './data/units';
import { createMonster } from './entity';
import { MON_COMBAT, MON_IDLE, type SimHero, type SimMonster } from './internal';
import { eventsOf, freezeUnit, heroOf, levelTo, place, quietWorld, spawnMinionAt, stepFor } from './testkit';
import { TICK_DT, type GameEvent, type HeroId, type Vec2 } from './types';
import type { Sim } from './world';

const R = MONSTER_RULES;
const SQ = Math.SQRT1_2;
/** 巨龙坑四周是 X 形的开阔地：斜向(西南/东南…)各有 9 米以上的空地，正东正西 6 米外是墙 */
const SW: Vec2 = { x: -SQ, y: SQ };
const SE: Vec2 = { x: SQ, y: SQ };

/** 安静的世界里手动放一条河道巨龙(在它的营地原位) */
function drakeWorld(player: HeroId = 'panyue'): { sim: Sim; drake: SimMonster; tank: SimHero } {
  const sim = quietWorld(player);
  const camp = sim.camps.find((c) => c.def.monsterType === 'abyss_drake');
  if (!camp) throw new Error('no drake camp');
  const drake = createMonster(sim, camp, 0);
  camp.members.push(drake);
  sim.addUnit(drake);
  const tank = heroOf(sim, 0, 'panyue');
  levelTo(sim, tank, 10);
  return { sim, drake, tank };
}

const at = (drake: SimMonster, dir: Vec2, d: number): Vec2 => ({ x: drake.pos.x + dir.x * d, y: drake.pos.y + dir.y * d });
const rot = (v: Vec2, deg: number): Vec2 => {
  const a = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
};
const fxOf = (ev: GameEvent[], key: string) => eventsOf(ev, 'fx').filter((e) => e.key === key);
const breathHits = (ev: GameEvent[], drake: SimMonster, targetId: number) =>
  eventsOf(ev, 'damage').filter((e) => e.sourceId === drake.id && e.targetId === targetId && e.skill);
const bites = (ev: GameEvent[], drake: SimMonster) => eventsOf(ev, 'attack').filter((e) => e.unitId === drake.id);

/** 坦克站到巨龙西南 3.2 米处开打，推进到预警事件出现的那一 tick。返回期间的事件与起手时间 */
function fightUntilWarn(sim: Sim, drake: SimMonster, tank: SimHero): { ev: GameEvent[]; aggroAt: number; warnAt: number } {
  const p = at(drake, SW, 3.2);
  place(sim, tank, p.x, p.y);
  sim.command(tank.id, { type: 'attack', targetId: drake.id });
  let aggroAt = -1;
  const ev: GameEvent[] = [];
  for (let i = 0; i < 30 * 8; i++) {
    const step = stepFor(sim, TICK_DT);
    for (const e of step) ev.push(e);
    if (aggroAt < 0 && drake.mon.state === MON_COMBAT) aggroAt = sim.time;
    if (fxOf(step, 'drake_breath_warn').length > 0) return { ev, aggroAt, warnAt: sim.time };
  }
  throw new Error('no breath within 8s');
}

describe('河道巨龙 · 吐息', () => {
  it('进入战斗约 4 秒后起手：预警事件字段齐全，巨龙进入 cast_s1(时长 = 预警 + 喷吐)，Bot 能感知到这个扇形', () => {
    const { sim, drake, tank } = drakeWorld();
    expect(drake.mon.specialAt).toBe(-1);
    const { ev, aggroAt, warnAt } = fightUntilWarn(sim, drake, tank);
    // 到点后还要等手上这一口咬完(前摇最多 0.25 秒)
    expect(warnAt - aggroAt).toBeGreaterThan(R.breathFirst - 0.1);
    expect(warnAt - aggroAt).toBeLessThan(R.breathFirst + 0.35);
    const warn = fxOf(ev, 'drake_breath_warn');
    expect(warn.length).toBe(1);
    expect(warn[0]).toMatchObject({ team: 2, unitId: drake.id, targetId: tank.id, radius: 7.5, value: 0.9 });
    expect(warn[0].angle).toBeCloseTo(Math.PI / 3, 6);
    expect(warn[0].pos).toEqual({ x: drake.pos.x, y: drake.pos.y });
    // 方向锁定为起手时的仇恨目标
    expect(warn[0].dir?.x).toBeCloseTo(SW.x, 3);
    expect(warn[0].dir?.y).toBeCloseTo(SW.y, 3);
    expect(drake.anim).toBe('cast_s1');
    expect(drake.animDur).toBeCloseTo(R.breathWarn + R.breathTime, 6);
    expect(drake.animStart).toBeCloseTo(warnAt, 6);
    expect(drake.facing).toBeCloseTo(Math.atan2(SW.y, SW.x), 3);
    // 模拟层内部登记了一个扇形危险区；双方 Bot 的视图都能看到(野怪的预警敌我可见)
    expect(sim.cones.length).toBe(1);
    const blue = sim.botView(tank.id)?.hostileCones() ?? [];
    expect(blue.length).toBe(1);
    expect(blue[0]).toMatchObject({ ownerId: drake.id, radius: 7.5, warn: 0.9 });
    expect(blue[0].duration).toBeCloseTo(1.7, 6);
    const red = heroOf(sim, 1, 'chijin');
    expect(sim.botView(red.id)?.hostileCones().length).toBe(0);
    place(sim, red, drake.pos.x + 6, drake.pos.y + 6);
    expect(sim.botView(red.id)?.hostileCones().length).toBe(1);
  });

  it('预警 0.9 秒内不出伤害；随后 0.8 秒喷吐分 4 跳，每跳 = 巨龙物攻 × 3/4 的法术伤害；吐完收势 0.5 秒才继续咬', () => {
    const { sim, drake, tank } = drakeWorld();
    fightUntilWarn(sim, drake, tank);
    const warnEv = stepFor(sim, R.breathWarn - 2 * TICK_DT);
    expect(eventsOf(warnEv, 'damage').filter((e) => e.sourceId === drake.id).length).toBe(0);
    expect(bites(warnEv, drake).length).toBe(0);
    expect(fxOf(warnEv, 'drake_breath').length).toBe(0);
    const sprayEv = stepFor(sim, R.breathTime + 3 * TICK_DT);
    const spray = fxOf(sprayEv, 'drake_breath');
    expect(spray.length).toBe(1);
    expect(spray[0]).toMatchObject({ team: 2, unitId: drake.id, radius: 7.5, value: 0.8 });
    expect(spray[0].dir?.x).toBeCloseTo(SW.x, 3);
    const hits = breathHits(sprayEv, drake, tank.id);
    expect(hits.length).toBe(R.breathTicks);
    const perTick = ((drake.stats.ad * R.breathAdRatio) / R.breathTicks) * (ARMOR_K / (ARMOR_K + tank.stats.mr));
    for (const h of hits) {
      expect(h.dtype).toBe('magic');
      expect(h.amount).toBeCloseTo(perTick, 4);
    }
    // 喷吐期间不咬人；吐完扇形危险区撤销、动作结束
    expect(bites(sprayEv, drake).length).toBe(0);
    expect(sim.cones.length).toBe(0);
    expect(drake.mon.breath).toBeNull();
    expect(drake.anim).not.toBe('cast_s1');
    // 收势：0.5 秒内不出手，之后恢复普攻
    expect(bites(stepFor(sim, R.breathRecover - 4 * TICK_DT), drake).length).toBe(0);
    expect(bites(stepFor(sim, 0.4), drake).length).toBe(1);
  });

  it('不躲明显更疼：一次吐息吃满 ≈ 巨龙三口多普攻的量；吐息一轮里巨龙少咬一口以上', () => {
    const { sim, drake, tank } = drakeWorld();
    const { ev: before } = fightUntilWarn(sim, drake, tank);
    const ev = stepFor(sim, R.breathEvery - TICK_DT);
    const biteDmg = eventsOf(before, 'damage').filter((e) => e.sourceId === drake.id && !e.skill).map((e) => e.amount);
    expect(biteDmg.length).toBeGreaterThanOrEqual(2);
    const breath = breathHits(ev, drake, tank.id).reduce((a, e) => a + e.amount, 0);
    expect(breath).toBeGreaterThan(biteDmg[0] * 3);
    expect(breath).toBeLessThan(biteDmg[0] * 4.5);
    // 12 秒一轮：不吐息能咬 7.2 口，现在 5~6 口
    const n = bites(ev, drake).length;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(6);
    // 下一轮在第一次起手后 12 秒(再加上等手上这一口的零头)
    const next = stepFor(sim, 0.5);
    expect(fxOf(ev, 'drake_breath_warn').length + fxOf(next, 'drake_breath_warn').length).toBe(1);
  });

  it('扇形判定：60° 扇面、7.5 米半径，身体沾边也算；侧面、背后和半径之外的不挨打；两队的人和小兵一视同仁', () => {
    const { sim, drake, tank } = drakeWorld();
    const mate = heroOf(sim, 0, 'fengling');
    const foe = heroOf(sim, 1, 'xingli');
    const side = heroOf(sim, 0, 'chijin');
    const far = heroOf(sim, 0, 'xingli');
    for (const h of [mate, foe, side, far]) levelTo(sim, h, 10);
    let p = at(drake, SW, 6.5);
    place(sim, mate, p.x, p.y);
    p = at(drake, rot(SW, 20), 5);
    place(sim, foe, p.x, p.y);
    p = at(drake, SE, 4);
    place(sim, side, p.x, p.y);
    p = at(drake, SW, 9);
    place(sim, far, p.x, p.y);
    // 两个木桩小兵(半径 0.5)在 4 米处：偏轴 35° 身体还沾着扇面，偏轴 41° 就出去了
    p = at(drake, rot(SW, -35), 4);
    const inEdge = spawnMinionAt(sim, 0, 'melee', p.x, p.y, 'mid', 50000);
    p = at(drake, rot(SW, -41), 4);
    const outEdge = spawnMinionAt(sim, 1, 'melee', p.x, p.y, 'mid', 50000);
    freezeUnit(inEdge);
    freezeUnit(outEdge);
    fightUntilWarn(sim, drake, tank);
    const ev = stepFor(sim, R.breathWarn + R.breathTime + 0.1);
    expect(breathHits(ev, drake, tank.id).length).toBe(4);
    expect(breathHits(ev, drake, mate.id).length).toBe(4);
    expect(breathHits(ev, drake, foe.id).length).toBe(4);
    expect(breathHits(ev, drake, inEdge.id).length).toBe(4);
    expect(breathHits(ev, drake, side.id).length).toBe(0);
    expect(breathHits(ev, drake, far.id).length).toBe(0);
    expect(breathHits(ev, drake, outEdge.id).length).toBe(0);
    // 巨龙自己和别的野怪不会被吐息打到
    expect(eventsOf(ev, 'damage').some((e) => e.sourceId === drake.id && e.targetId === drake.id)).toBe(false);
  });

  it('预警期间横着走出扇面就一跳不挨；喷吐开始后才走，只挨前几跳', () => {
    const clean = drakeWorld();
    fightUntilWarn(clean.sim, clean.drake, clean.tank);
    clean.sim.command(clean.tank.id, { type: 'move', dir: SE });
    const ev = stepFor(clean.sim, R.breathWarn + R.breathTime + 0.1);
    expect(breathHits(ev, clean.drake, clean.tank.id).length).toBe(0);
    // 方向在起手时就锁定了，不会跟着目标转
    expect(fxOf(ev, 'drake_breath')[0].dir?.x).toBeCloseTo(SW.x, 3);

    const late = drakeWorld();
    fightUntilWarn(late.sim, late.drake, late.tank);
    let ev2 = stepFor(late.sim, R.breathWarn + 0.05);
    late.sim.command(late.tank.id, { type: 'move', dir: SE });
    ev2 = ev2.concat(stepFor(late.sim, R.breathTime + 0.1));
    const n = breathHits(ev2, late.drake, late.tank.id).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThan(4);
  });

  it('目标不在吐息够得着的范围内就先不吐(继续追)；脱战后计时清零，再开打重新等 4 秒', () => {
    const { sim, drake, tank } = drakeWorld();
    const carry = heroOf(sim, 0, 'fengling');
    levelTo(sim, carry, 10);
    // 射手在 9.5 米外开打：巨龙要先走过去
    const p = at(drake, SW, 9.5);
    place(sim, carry, p.x, p.y);
    sim.command(carry.id, { type: 'attack', targetId: drake.id });
    stepFor(sim, 1);
    expect(drake.mon.state).toBe(MON_COMBAT);
    expect(drake.mon.specialAt).toBeGreaterThan(0);
    // 人都走了：脱战回营，计时清零
    place(sim, carry, drake.pos.x - 40, drake.pos.y + 40);
    sim.command(carry.id, { type: 'stop' });
    const idle = stepFor(sim, 8);
    expect(fxOf(idle, 'drake_breath_warn').length).toBe(0);
    expect(drake.mon.state).toBe(MON_IDLE);
    expect(drake.mon.specialAt).toBe(-1);
    // 换坦克来打：照样是进入战斗约 4 秒后才吐
    const { aggroAt, warnAt } = fightUntilWarn(sim, drake, tank);
    expect(warnAt - aggroAt).toBeGreaterThan(R.breathFirst - 0.1);
  });

  it('巨龙在预警中被打死：扇形危险区立刻撤销，不会再发喷吐事件', () => {
    const { sim, drake, tank } = drakeWorld();
    fightUntilWarn(sim, drake, tank);
    stepFor(sim, 0.3);
    killUnit(sim, drake, tank);
    expect(sim.cones.length).toBe(0);
    const ev = stepFor(sim, 2);
    expect(fxOf(ev, 'drake_breath').length).toBe(0);
    expect(breathHits(ev, drake, tank.id).length).toBe(0);
  });
});

describe('Bot：扇形危险区的出逃方向', () => {
  const cone = (pos: Vec2, dir: Vec2): ConeHazard => ({ id: 1, ownerId: 9, pos, dir, radius: 7.5, angle: Math.PI / 3, age: 0.5, warn: 0.9, duration: 1.7 });
  const open = (): boolean => true;
  const out: Vec2 = { x: 0, y: 0 };
  const c = cone({ x: 0, y: 0 }, { x: 1, y: 0 });

  it('inCone 与吐息结算一致：按身体半径放宽扇面与半径', () => {
    expect(inCone({ x: 3, y: 0 }, 0.6, c)).toBe(true);
    expect(inCone({ x: 8, y: 0 }, 0.6, c)).toBe(true);
    expect(inCone({ x: 8.2, y: 0 }, 0.6, c)).toBe(false);
    expect(inCone({ x: -1, y: 0 }, 0.6, c)).toBe(false);
    expect(inCone({ x: 0.3, y: 0.2 }, 0.6, c)).toBe(true);
    // 4 米处偏轴 37°：半径 0.6 的身体张角约 8.6°，沾边；偏轴 40° 出去了
    const p37 = { x: 4 * Math.cos((37 * Math.PI) / 180), y: 4 * Math.sin((37 * Math.PI) / 180) };
    const p40 = { x: 4 * Math.cos((40 * Math.PI) / 180), y: 4 * Math.sin((40 * Math.PI) / 180) };
    expect(inCone(p37, 0.6, c)).toBe(true);
    expect(inCone(p40, 0.6, c)).toBe(false);
  });

  it('贴着顶点的近战：横移出扇面(朝自己偏的那一侧；正在中轴上就朝家的方向)', () => {
    expect(coneEscape({ x: 3, y: 0.6 }, 0.6, c, { x: -50, y: -50 }, open, out)).toBe(true);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(1, 6);
    expect(coneEscape({ x: 3, y: -0.6 }, 0.6, c, { x: -50, y: 50 }, open, out)).toBe(true);
    expect(out.y).toBeCloseTo(-1, 6);
    // 正在中轴上：家在哪边就往哪边
    expect(coneEscape({ x: 3, y: 0 }, 0.6, c, { x: 0, y: 40 }, open, out)).toBe(true);
    expect(out.y).toBeCloseTo(1, 6);
    expect(coneEscape({ x: 3, y: 0 }, 0.6, c, { x: 0, y: -40 }, open, out)).toBe(true);
    expect(out.y).toBeCloseTo(-1, 6);
  });

  it('那一侧是墙就换另一侧；站得远的直接退出半径；不在扇形里返回 false', () => {
    const wallAbove = (p: Vec2): boolean => p.y < 1;
    expect(coneEscape({ x: 3, y: 0.6 }, 0.6, c, { x: 0, y: 40 }, wallAbove, out)).toBe(true);
    expect(out.y).toBeCloseTo(-1, 6);
    // 7 米处在中轴附近：横移要走 4 米多，后退 1.5 米就出去了
    expect(coneEscape({ x: 7, y: 0.5 }, 0.6, c, { x: -50, y: 50 }, open, out)).toBe(true);
    expect(out.x).toBeGreaterThan(0.99);
    expect(coneEscape({ x: 3, y: 4 }, 0.6, c, { x: 0, y: 0 }, open, out)).toBe(false);
    expect(coneEscape({ x: 9, y: 0 }, 0.6, c, { x: 0, y: 0 }, open, out)).toBe(false);
    expect(coneEscape({ x: -2, y: 0 }, 0.6, c, { x: 0, y: 0 }, open, out)).toBe(false);
  });

  it('沿出逃方向走，预警结束前就能离开扇面(近战在 3 米处、反应 0.3 秒、移速 5.6)', () => {
    const pos: Vec2 = { x: 3, y: 0.2 };
    const speed = 5.6;
    let t = 0.3;
    while (t < c.warn && coneEscape(pos, 0.6, c, { x: 0, y: 40 }, open, out, 0)) {
      pos.x += out.x * speed * TICK_DT;
      pos.y += out.y * speed * TICK_DT;
      t += TICK_DT;
    }
    expect(inCone(pos, 0.6, c)).toBe(false);
    expect(t).toBeLessThan(c.warn);
    // 出来以后离顶点不到 4.5 米：近战不用再跑回去，原地就能接着打
    expect(Math.hypot(pos.x, pos.y)).toBeLessThan(4.5);
  });
});
