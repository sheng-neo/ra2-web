/**
 * 磐岳 · 岩铠守卫（坦克）
 *
 * 被动 磐石之躯：普攻计数(panyue_passive 层数 1..2 = 已打出的次数)，第三下震地：额外法术伤害 + 减速。
 * S1 裂地冲撞：冲锋，撞到第一个敌方英雄或到达终点(含撞墙)时震击周围：物理伤害 + 击飞。
 * S2 不动壁垒：护盾 + panyue_bulwark，同时震慑周围：法术伤害 + 减速。护盾消失(打破/到期)则壁垒随之结束。
 * 大招 山崩地裂：跃起(期间霸体)砸向落点：物理伤害 + 击飞，留下减速裂隙。
 */
import { HEROES } from '../data/heroes';
import { isStructure } from '../entity';
import { castRange, copyVec, fixedValue, strike } from './common';
import * as tk from './toolkit';

const P = HEROES.panyue.passive.values;
/** 裂隙多久刷新一次减速、每次持续多久(离开裂隙后很快恢复) */
const FISSURE_TICK = 0.25;
const FISSURE_SLOW_TIME = 0.5;
/** 霸体比跃起多留的余量：落地回调里会主动移除，这里只防止计时误差出现空档 */
const UNSTOPPABLE_PAD = 0.1;
/** 冲撞自动瞄准时，把震击半径的多大比例算进搜索距离 */
const AIM_IMPACT_SHARE = 0.6;

tk.registerHeroHooks('panyue', {
  modifyBasicAttack(_sim, hero, target, mod) {
    if (isStructure(target)) return;
    if (tk.buffStacks(hero, 'panyue_passive') >= P.hits - 1) mod.bonusMagic += hero.stats.maxHp * P.hpRatio;
  },
  onBasicAttackHit(sim, hero, target) {
    // 打建筑不计数也不消耗：震地只对能被减速的目标有意义
    if (isStructure(target)) return;
    if (tk.buffStacks(hero, 'panyue_passive') >= P.hits - 1) {
      tk.removeBuff(sim, hero, 'panyue_passive');
      tk.fx(sim, 'panyue_passive_hit', target.pos, hero.team, { unitId: hero.id, targetId: target.id });
      if (target.alive) tk.slow(sim, target, P.slow, P.slowDur, hero, 'panyue_passive');
      return;
    }
    tk.addBuff(sim, hero, 'panyue_passive', { duration: Infinity, maxStacks: P.hits - 1, sourceId: hero.id });
  },
});

tk.registerSkill('panyue', 's1', {
  movement: true,
  noAnim: true,
  lockTime: 0,
  aimSpeed: fixedValue('panyue', 's1', 'dashSpeed'),
  // 冲到终点还会震击一圈：比冲锋距离稍远的英雄也值得朝他冲(留一点余量，别指望刚好蹭到边)
  aimRange: castRange('panyue', 's1') + fixedValue('panyue', 's1', 'impactRadius') * AIM_IMPACT_SHARE,
  cast(ctx) {
    const { sim, caster } = ctx;
    const enemies = tk.enemyFilter(caster.team);
    tk.fx(sim, 'panyue_s1_dash', ctx.origin, caster.team, { unitId: caster.id, dir: copyVec(ctx.dir) });
    tk.startDash(sim, caster, {
      dir: ctx.dir,
      distance: ctx.range,
      speed: ctx.val('dashSpeed'),
      hitRadius: ctx.width * 0.5,
      // 只有敌方英雄能拦下冲锋；小兵野怪直接撞过去
      filter: tk.enemyFilter(caster.team, { heroesOnly: true }),
      onHit: () => true,
      onEnd(reason) {
        // 被控制打断/途中阵亡：没有震击
        if (reason === 'interrupted' || !caster.alive) return;
        const radius = ctx.val('impactRadius');
        const damage = tk.scaled(ctx, 'damage', { ad: 'adRatio' });
        tk.fx(sim, 'panyue_s1_impact', caster.pos, caster.team, { unitId: caster.id, radius });
        for (const t of tk.unitsInCircle(sim, caster.pos, radius, enemies)) {
          strike(ctx, t, damage, 'physical');
          tk.knockup(sim, t, ctx.val('knockup'), caster);
        }
      },
    });
  },
});

tk.registerSkill('panyue', 's2', {
  cast(ctx) {
    const { sim, caster } = ctx;
    const duration = ctx.val('duration');
    tk.fx(sim, 'panyue_s2_cast', caster.pos, caster.team, { unitId: caster.id, radius: ctx.radius });
    // 上一面壁垒还在(正常冷却下不会发生)：先让它按正常流程收尾
    tk.removeBuff(sim, caster, 'shield', 'panyue_s2');
    tk.addBuff(sim, caster, 'panyue_bulwark', { duration, sourceId: caster.id, merge: 'replace' });
    const aura = tk.spawnArea(sim, { visual: 'panyue_s2_aura', owner: caster, pos: caster.pos, radius: ctx.radius, duration, follow: caster });
    tk.addBuff(sim, caster, 'shield', {
      duration,
      value: tk.scaled(ctx, 'shield', { hp: 'hpRatio' }),
      sourceId: caster.id,
      key: 'panyue_s2',
      merge: 'replace',
      // 护盾被打破或到期 = 岩壁碎了
      onRemove(s, unit) {
        tk.removeBuff(s, unit, 'panyue_bulwark');
        tk.removeArea(s, aura);
      },
    });
    const damage = ctx.val('damage');
    for (const t of tk.unitsInCircle(sim, caster.pos, ctx.radius, tk.enemyFilter(caster.team))) {
      strike(ctx, t, damage, 'magic');
      tk.slow(sim, t, ctx.val('slow'), ctx.val('slowDur'), caster, 'panyue_s2');
    }
  },
});

tk.registerSkill('panyue', 'ult', {
  movement: true,
  noAnim: true,
  aimLead: fixedValue('panyue', 'ult', 'leapTime'),
  cast(ctx) {
    const { sim, caster } = ctx;
    const leapTime = ctx.val('leapTime');
    const from = copyVec(caster.pos);
    const enemies = tk.enemyFilter(caster.team);
    let warn: tk.SimArea | null = null;
    tk.startLeap(sim, caster, ctx.targetPos.x, ctx.targetPos.y, leapTime, (reason) => {
      tk.removeBuff(sim, caster, 'unstoppable', 'panyue_ult');
      if (reason !== 'arrived' || !caster.alive) {
        if (warn) tk.removeArea(sim, warn);
        return;
      }
      const at = copyVec(caster.pos);
      const damage = tk.scaled(ctx, 'damage', { hp: 'hpRatio' });
      tk.fx(sim, 'panyue_ult_land', at, caster.team, { unitId: caster.id, radius: ctx.radius });
      for (const t of tk.unitsInCircle(sim, at, ctx.radius, enemies)) {
        strike(ctx, t, damage, 'physical');
        tk.knockup(sim, t, ctx.val('knockup'), caster);
      }
      tk.spawnArea(sim, {
        visual: 'panyue_ult_fissure', owner: caster, pos: at, radius: ctx.radius, duration: ctx.val('zoneDur'),
        tickInterval: FISSURE_TICK, firstTick: 0,
        onTick(s, area) {
          for (const t of tk.unitsInCircle(s, area.pos, area.radius, enemies)) {
            tk.slow(s, t, ctx.val('slow'), FISSURE_SLOW_TIME, caster, 'panyue_fissure');
          }
        },
      });
    });
    // 落点可能被修正到最近可走点：以实际落点为准
    const leap = caster.rt.dash;
    const to = leap ? { x: leap.toX, y: leap.toY } : copyVec(caster.pos);
    tk.addBuff(sim, caster, 'unstoppable', { duration: leapTime + UNSTOPPABLE_PAD, sourceId: caster.id, key: 'panyue_ult', merge: 'replace' });
    tk.fx(sim, 'panyue_ult_leap', from, caster.team, { unitId: caster.id, from, to: copyVec(to) });
    warn = tk.spawnArea(sim, { visual: 'telegraph', owner: caster, pos: to, radius: ctx.radius, duration: leapTime });
  },
});
