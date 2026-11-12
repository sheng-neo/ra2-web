/**
 * 赤烬 · 焰刃武者（战士）
 *
 * 被动 余烬之刃：放技能后获得 chijin_ember，窗口内下一次普攻附带额外物理伤害并回血。
 * S1 烈焰斩：前方扇形物理伤害 + 减速。
 * S2 炎步：突进，路径上的敌人各受一次物理伤害；获得攻速(chijin_blaze，value = 加成比例)。
 * 大招 焚天旋舞：火焰旋风跟随自身逐跳伤害；期间可移动/放技能、不能普攻、免疫减速(起手解除已有减速)、减伤。
 *   旋风不是引导：被眩晕/击飞只会让赤烬动不了，旋风照常灼烧，只有阵亡才会中断。
 */
import { HEROES } from '../data/heroes';
import { isStructure } from '../entity';
import { castPoint, copyVec, dashEnd, fixedValue, strike } from './common';
import * as tk from './toolkit';

const P = HEROES.chijin.passive.values;
const S1_POINT = castPoint('chijin', 's1');

tk.registerHeroHooks('chijin', {
  onSkillCast(sim, hero, slot) {
    // 只算英雄技能，召唤师技能不触发
    if (slot !== 's1' && slot !== 's2' && slot !== 'ult') return;
    tk.addBuff(sim, hero, 'chijin_ember', { duration: P.window, sourceId: hero.id, merge: 'replace' });
  },
  modifyBasicAttack(_sim, hero, target, mod) {
    if (isStructure(target) || !tk.hasBuff(hero, 'chijin_ember')) return;
    mod.bonus += P.damage + P.adRatio * hero.stats.ad;
  },
  onBasicAttackHit(sim, hero, target) {
    // 打建筑不消耗余烬
    if (isStructure(target) || !tk.hasBuff(hero, 'chijin_ember')) return;
    tk.removeBuff(sim, hero, 'chijin_ember');
    tk.fx(sim, 'chijin_passive_hit', target.pos, hero.team, { unitId: hero.id, targetId: target.id });
    tk.heal(sim, hero, hero, hero.stats.maxHp * P.healHpRatio);
  },
  statMods(_sim, hero, acc) {
    const blaze = tk.findBuff(hero, 'chijin_blaze');
    if (blaze) acc.asPct += blaze.value;
  },
  onTick(sim, hero) {
    // 旋舞中放了别的技能：施法动作结束后回到旋转
    if (hero.rt.act !== null) return;
    const spin = tk.findBuff(hero, 'chijin_spin');
    if (spin) tk.playAnim(sim, hero, 'spin', spin.timeLeft, false);
  },
});

tk.registerSkill('chijin', 's1', {
  aimLead: S1_POINT,
  cast(ctx) {
    const { sim, caster } = ctx;
    tk.after(ctx, S1_POINT, () => {
      const damage = tk.scaled(ctx, 'damage', { ad: 'adRatio' });
      tk.fx(sim, 'chijin_s1_slash', caster.pos, caster.team, {
        unitId: caster.id, dir: copyVec(ctx.dir), radius: ctx.range, angle: ctx.angle,
      });
      for (const t of tk.unitsInCone(sim, caster.pos, ctx.dir, ctx.range, ctx.angle, tk.enemyFilter(caster.team))) {
        strike(ctx, t, damage, 'physical');
        tk.slow(sim, t, ctx.val('slow'), ctx.val('slowDur'), caster, 'chijin_s1');
      }
    });
  },
});

tk.registerSkill('chijin', 's2', {
  movement: true,
  noAnim: true,
  lockTime: 0,
  aimSpeed: fixedValue('chijin', 's2', 'dashSpeed'),
  cast(ctx) {
    const { sim, caster } = ctx;
    const from = copyVec(caster.pos);
    tk.fx(sim, 'chijin_s2_dash', from, caster.team, {
      unitId: caster.id, from, to: dashEnd(sim, caster, ctx.dir, ctx.range), dir: copyVec(ctx.dir),
    });
    tk.addBuff(sim, caster, 'chijin_blaze', { duration: ctx.val('asDur'), value: ctx.val('asBonus'), sourceId: caster.id, merge: 'replace' });
    tk.startDash(sim, caster, {
      dir: ctx.dir,
      distance: ctx.range,
      speed: ctx.val('dashSpeed'),
      hitRadius: ctx.width * 0.5,
      filter: tk.enemyFilter(caster.team),
      onHit(t) {
        strike(ctx, t, tk.scaled(ctx, 'damage', { ad: 'adRatio' }), 'physical');
      },
    });
  },
});

tk.registerSkill('chijin', 'ult', {
  noAnim: true,
  lockTime: 0,
  cast(ctx) {
    const { sim, caster } = ctx;
    const duration = ctx.val('duration');
    const interval = ctx.val('tick');
    const total = Math.round(duration / interval);
    const enemies = tk.enemyFilter(caster.team);
    let done = 0;
    tk.fx(sim, 'chijin_ult_start', caster.pos, caster.team, { unitId: caster.id });
    // chijin_spin 期间引擎不再接受新的减速(buffs.ts)；身上已有的减速在起手时一并解除
    tk.addBuff(sim, caster, 'chijin_spin', { duration, sourceId: caster.id, merge: 'replace' });
    tk.cleanse(sim, caster, ['slow']);
    tk.addBuff(sim, caster, 'dmg_reduction', { duration, value: ctx.val('reduction'), sourceId: caster.id, key: 'chijin_ult', merge: 'replace' });
    tk.playAnim(sim, caster, 'spin', duration, false);
    tk.disarm(sim, caster, duration);
    tk.spawnArea(sim, {
      visual: 'chijin_ult_spin', owner: caster, pos: caster.pos, radius: ctx.radius, duration, follow: caster,
      tickInterval: interval,
      // 起手动作(castTime)之后出第一跳，之后每 tick 秒一跳，总跳数 = duration / tick
      firstTick: ctx.def ? ctx.def.castTime : 0,
      onTick(s, area) {
        if (done >= total) return;
        done++;
        const damage = tk.scaled(ctx, 'damage', { ad: 'adRatio' });
        tk.fx(s, 'chijin_ult_tick', area.pos, caster.team, { unitId: caster.id, radius: area.radius });
        for (const t of tk.unitsInCircle(s, area.pos, area.radius, enemies)) strike(ctx, t, damage, 'physical');
        tk.revealUnit(s, caster);
      },
    });
  },
});
