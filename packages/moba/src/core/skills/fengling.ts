/**
 * 风翎 · 逐风射手（射手）
 *
 * 被动 风之眷顾：普攻命中叠 fengling_gale(每层加攻速)；满层时加移速，且普攻附带额外物理伤害(并入普攻本体)。
 * S1 贯风矢：穿透小兵/野怪(按比例减伤)的直线箭，命中第一个敌方英雄即停：全额物理伤害 + 减速。
 * S2 逐风步：朝移动/面向方向翻跃；落地后获得移速，且下一次普攻必定暴击(fengling_crit)。
 * 大招 千羽天幕：预警后箭雨持续覆盖落点，逐跳物理伤害 + 减速。箭雨不随风翎阵亡而消失。
 */
import { HEROES } from '../data/heroes';
import { isStructure } from '../entity';
import { castPoint, copyVec, dashEnd, fixedValue, strike } from './common';
import * as tk from './toolkit';

const P = HEROES.fengling.passive.values;
const S1_POINT = castPoint('fengling', 's1');
/** 大招自动瞄准时比预警时间多看一点：让目标落在箭雨靠里的位置 */
const ULT_EXTRA_LEAD = 0.2;

tk.registerHeroHooks('fengling', {
  statMods(_sim, hero, acc) {
    const stacks = tk.buffStacks(hero, 'fengling_gale');
    if (stacks <= 0) return;
    acc.asPct += stacks * P.asPerStack;
    if (stacks >= P.maxStacks) acc.movePct += P.haste;
  },
  modifyBasicAttack(_sim, hero, target, mod) {
    // 攻速层数打建筑也照叠，但附加伤害与必暴只对单位生效
    if (isStructure(target)) return;
    if (tk.buffStacks(hero, 'fengling_gale') >= P.maxStacks) mod.bonus += P.bonus + P.bonusPerLevel * hero.level;
    if (tk.hasBuff(hero, 'fengling_crit')) mod.forceCrit = true;
  },
  onBasicAttackHit(sim, hero, target) {
    tk.addBuff(sim, hero, 'fengling_gale', { duration: P.duration, maxStacks: P.maxStacks, sourceId: hero.id });
    if (!isStructure(target)) tk.removeBuff(sim, hero, 'fengling_crit');
  },
});

tk.registerSkill('fengling', 's1', {
  aimSpeed: fixedValue('fengling', 's1', 'speed'),
  aimLead: S1_POINT,
  cast(ctx) {
    const { sim, caster } = ctx;
    tk.after(ctx, S1_POINT, () => {
      const damage = tk.scaled(ctx, 'damage', { ad: 'adRatio' });
      tk.fx(sim, 'fengling_s1_cast', caster.pos, caster.team, { unitId: caster.id, dir: copyVec(ctx.dir) });
      tk.spawnLinearProjectile(sim, {
        visual: 'fengling_s1', owner: caster, from: caster.pos, dir: ctx.dir, speed: ctx.val('speed'), range: ctx.range,
        radius: ctx.width * 0.5, pierce: true, filter: tk.enemyFilter(caster.team),
        onHit(s, _proj, t) {
          if (t.kind !== 'hero') {
            tk.skillDamage(s, caster, t, damage * ctx.val('minionRatio'), 'physical', ctx.slot);
            return false;
          }
          tk.skillDamage(s, caster, t, damage, 'physical', ctx.slot);
          tk.slow(s, t, ctx.val('slow'), ctx.val('slowDur'), caster, 'fengling_s1');
          return true;
        },
      });
    });
  },
});

tk.registerSkill('fengling', 's2', {
  aim: 'facing',
  movement: true,
  noAnim: true,
  lockTime: 0,
  cast(ctx) {
    const { sim, caster } = ctx;
    const from = copyVec(caster.pos);
    tk.fx(sim, 'fengling_s2_dash', from, caster.team, {
      unitId: caster.id, from, to: dashEnd(sim, caster, ctx.dir, ctx.range), dir: copyVec(ctx.dir),
    });
    tk.startDash(sim, caster, {
      dir: ctx.dir,
      distance: ctx.range,
      speed: ctx.val('dashSpeed'),
      onEnd() {
        // 增益从落地算起(哪怕翻跃被打断)，不把持续时间浪费在空中
        if (!caster.alive) return;
        tk.haste(sim, caster, ctx.val('haste'), ctx.val('hasteDur'), caster, 'fengling_s2');
        tk.addBuff(sim, caster, 'fengling_crit', { duration: ctx.val('critWindow'), sourceId: caster.id, merge: 'replace' });
      },
    });
  },
});

tk.registerSkill('fengling', 'ult', {
  aimLead: fixedValue('fengling', 'ult', 'delay') + ULT_EXTRA_LEAD,
  cast(ctx) {
    const { sim, caster } = ctx;
    const pos = copyVec(ctx.targetPos);
    const duration = ctx.val('duration');
    const interval = ctx.val('tick');
    const total = Math.round(duration / interval);
    tk.fx(sim, 'fengling_ult_cast', caster.pos, caster.team, { unitId: caster.id });
    tk.spawnArea(sim, {
      visual: 'telegraph', owner: caster, pos, radius: ctx.radius, duration: ctx.val('delay'),
      onEnd(s, _area, expired) {
        if (!expired) return;
        // 第一跳在预警结束的同一刻落下，其余每隔 tick 秒一跳；总数封顶(区域结束的那一 tick 不再多落一跳)
        let done = 0;
        const volley = (area: tk.SimArea): void => {
          done++;
          const damage = tk.scaled(ctx, 'damage', { ad: 'adRatio' });
          tk.fx(sim, 'fengling_ult_tick', area.pos, caster.team, { unitId: caster.id, radius: area.radius });
          for (const t of tk.unitsInCircle(sim, area.pos, area.radius, tk.enemyFilter(caster.team))) {
            strike(ctx, t, damage, 'physical');
            tk.slow(sim, t, ctx.val('slow'), ctx.val('slowDur'), caster, 'fengling_ult');
          }
        };
        const rain = tk.spawnArea(s, {
          visual: 'fengling_ult_rain', owner: caster, pos, radius: ctx.radius, duration,
          tickInterval: interval,
          onTick(_s, area) {
            if (done < total) volley(area);
          },
        });
        volley(rain);
      },
    });
  },
});
