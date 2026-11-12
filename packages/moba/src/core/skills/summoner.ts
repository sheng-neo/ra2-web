/**
 * 召唤师技能（所有英雄通用）：回城 / 恢复 / 闪现。同时也是技能脚本的写法示例。
 */
import { setAction } from '../anim';
import { addBuff, hasBuff } from '../buffs';
import { heal } from '../combat';
import { SUMMONER } from '../data/heroes';
import type { SimBuff, SimUnit } from '../internal';
import { stopMove, teleport } from '../movement';
import type { Sim } from '../world';
import { registerSummoner } from './registry';

/** 「恢复」的回复跳间隔 */
const RESTORE_TICK = 0.5;

function recallDone(sim: Sim, unit: SimUnit): void {
  if (unit.kind !== 'hero' || !unit.alive) return;
  stopMove(unit);
  unit.h.atkOrder = false;
  const to = teleport(sim, unit, unit.h.spawn.x, unit.h.spawn.y);
  unit.facing = unit.team === 1 ? Math.PI * 0.75 : -Math.PI * 0.25;
  sim.fx('recall_done', to, unit.team, { unitId: unit.id });
}

// 回城：原地引导，结束时传送回泉水。移动/攻击/施法/受伤/被控 都会移除 recall buff 从而打断(见 hero.ts / combat.ts / buffs.ts)
registerSummoner('recall', {
  canCast: (_sim, hero) => (hasBuff(hero, 'recall') ? 'disabled' : null),
  cast(ctx) {
    const { sim, caster } = ctx;
    stopMove(caster);
    caster.h.atkOrder = false;
    addBuff(sim, caster, 'recall', { duration: SUMMONER.recall.channel, sourceId: caster.id, merge: 'replace', onExpire: recallDone });
    setAction(sim, caster, 'channel', 0, false);
    sim.fx('recall_start', caster.pos, caster.team, { unitId: caster.id });
  },
});

function restoreTick(sim: Sim, unit: SimUnit, _buff: SimBuff): void {
  const S = SUMMONER.heal;
  const ticks = Math.round(S.duration / RESTORE_TICK);
  heal(sim, unit, unit, (unit.stats.maxHp * S.hpRatio) / ticks);
  unit.mana = Math.min(unit.stats.maxMana, unit.mana + (unit.stats.maxMana * S.manaRatio) / ticks);
}

// 恢复：持续回复生命与法力。受到英雄/建筑伤害时由 combat.ts 移除 restore buff 打断
registerSummoner('heal', {
  cast(ctx) {
    const { sim, caster } = ctx;
    addBuff(sim, caster, 'restore', {
      duration: SUMMONER.heal.duration, sourceId: caster.id, merge: 'replace', tickInterval: RESTORE_TICK, onTick: restoreTick,
    });
    sim.fx('heal', caster.pos, caster.team, { unitId: caster.id });
  },
});

// 闪现：朝瞄准方向瞬移固定距离，可穿墙；落点不可走时取最近可走点
registerSummoner('flash', {
  aim: 'facing',
  cast(ctx) {
    const { sim, caster, dir } = ctx;
    const from = { x: caster.pos.x, y: caster.pos.y };
    const range = SUMMONER.flash.range;
    const to = teleport(sim, caster, from.x + dir.x * range, from.y + dir.y * range);
    sim.fx('flash', to, caster.team, { unitId: caster.id, from, to: { x: to.x, y: to.y }, dir: { x: dir.x, y: dir.y } });
  },
});
