/**
 * 王昭君 · 落雁出塞（法师）
 *
 * 被动 余音：技能每次命中给敌人叠一层 xingli_mark，满层引爆：按目标最大生命的法术伤害(非英雄有上限) + 眩晕。
 * S1 一弦穿云：穿透直线弹，沿途法术伤害。
 * S2 回环收弦：落点出现音环(预警)，延迟后收束：法术伤害 + 拉向中心 + 减速。
 * 大招 雁落平沙：预警后雁落区域持续落雁，逐波对整个区域造成法术伤害 + 减速(每波都叠余音)。
 *   雁影的落点只是表现(种子随机)，伤害判定是整个圆。
 * 已放出的音环/雁落区域不随王昭君阵亡而消失。
 */
import { HEROES } from '../data/heroes';
import { isStructure } from '../entity';
import type { SimHero } from '../internal';
import type { Vec2 } from '../types';
import type { Sim } from '../world';
import { castPoint, copyVec, fixedValue, strike } from './common';
import type { CastContext } from './registry';
import * as tk from './toolkit';

const P = HEROES.xingli.passive.values;
const S1_POINT = castPoint('xingli', 's1');
/** 每波落下几颗雁影、单颗的爆炸半径(仅表现) */
const METEORS_PER_WAVE = 3;
const METEOR_RADIUS = 1.7;
/** 大招自动瞄准时比预警时间多看一点：让目标落在雁落区域靠里的位置而不是边缘 */
const ULT_EXTRA_LEAD = 0.2;

tk.registerHeroHooks('xingli', {
  onSkillHit(sim, hero, target) {
    if (!target.alive || isStructure(target)) return;
    const mark = tk.addBuff(sim, target, 'xingli_mark', { duration: P.duration, maxStacks: P.stacks, sourceId: hero.id });
    if (!mark || mark.stacks < P.stacks) return;
    tk.removeBuffInstance(sim, target, mark);
    tk.fx(sim, 'xingli_passive_burst', target.pos, hero.team, { unitId: hero.id, targetId: target.id });
    let damage = target.stats.maxHp * P.hpRatio;
    if (target.kind !== 'hero') damage = Math.min(damage, P.cap);
    tk.stun(sim, target, P.stun, hero);
    tk.procDamage(sim, hero, target, damage, 'magic');
  },
});

tk.registerSkill('xingli', 's1', {
  aimSpeed: fixedValue('xingli', 's1', 'speed'),
  aimLead: S1_POINT,
  cast(ctx) {
    const { sim, caster } = ctx;
    tk.after(ctx, S1_POINT, () => {
      const damage = tk.scaled(ctx, 'damage', { ap: 'apRatio' });
      tk.fx(sim, 'xingli_s1_cast', caster.pos, caster.team, { unitId: caster.id, dir: copyVec(ctx.dir) });
      tk.spawnLinearProjectile(sim, {
        visual: 'xingli_s1', owner: caster, from: caster.pos, dir: ctx.dir, speed: ctx.val('speed'), range: ctx.range,
        radius: ctx.width * 0.5, pierce: true, filter: tk.enemyFilter(caster.team),
        onHit(s, _proj, t) {
          tk.skillDamage(s, caster, t, damage, 'magic', ctx.slot);
        },
      });
    });
  },
});

tk.registerSkill('xingli', 's2', {
  aimLead: fixedValue('xingli', 's2', 'delay'),
  cast(ctx) {
    const { sim, caster } = ctx;
    const pos = copyVec(ctx.targetPos);
    const delay = ctx.val('delay');
    tk.spawnArea(sim, { visual: 'telegraph', owner: caster, pos, radius: ctx.radius, duration: delay });
    tk.spawnArea(sim, {
      visual: 'xingli_s2_well', owner: caster, pos, radius: ctx.radius, duration: delay,
      onEnd(s, area, expired) {
        if (!expired) return;
        const damage = tk.scaled(ctx, 'damage', { ap: 'apRatio' });
        tk.fx(s, 'xingli_s2_burst', area.pos, caster.team, { unitId: caster.id, radius: area.radius });
        for (const t of tk.unitsInCircle(s, area.pos, area.radius, tk.enemyFilter(caster.team))) {
          strike(ctx, t, damage, 'magic');
          if (!t.alive) continue;
          tk.pullToward(s, t, area.pos, ctx.val('pull'));
          tk.slow(s, t, ctx.val('slow'), ctx.val('slowDur'), caster, 'xingli_s2');
        }
      },
    });
  },
});

/** 区域内均匀随机的一点（留出雁影自身的半径，爆炸不画到圈外太多） */
function meteorSpot(sim: Sim, center: Vec2, radius: number): Vec2 {
  const r = Math.sqrt(sim.rng.next()) * Math.max(0, radius - METEOR_RADIUS * 0.5);
  const a = sim.rng.next() * Math.PI * 2;
  return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
}

function meteorWave(ctx: CastContext, caster: SimHero, center: Vec2, radius: number, interval: number): void {
  const { sim } = ctx;
  const damage = tk.scaled(ctx, 'damage', { ap: 'apRatio' });
  // 落点先一次抽完(随机数消耗与之后的回调时序无关)；第一颗与伤害同时落地，其余在这一波的间隔里陆续落下
  for (let i = 0; i < METEORS_PER_WAVE; i++) {
    const spot = meteorSpot(sim, center, radius);
    const land = (): void => tk.fx(sim, 'xingli_meteor', spot, caster.team, { unitId: caster.id, radius: METEOR_RADIUS });
    if (i === 0) land();
    else tk.delay(sim, (interval * i) / METEORS_PER_WAVE, land);
  }
  for (const t of tk.unitsInCircle(sim, center, radius, tk.enemyFilter(caster.team))) {
    strike(ctx, t, damage, 'magic');
    tk.slow(sim, t, ctx.val('slow'), ctx.val('slowDur'), caster, 'xingli_ult');
  }
}

tk.registerSkill('xingli', 'ult', {
  aimLead: fixedValue('xingli', 'ult', 'delay') + ULT_EXTRA_LEAD,
  cast(ctx) {
    const { sim, caster } = ctx;
    const pos = copyVec(ctx.targetPos);
    const duration = ctx.val('duration');
    const waves = ctx.val('waves');
    const interval = duration / waves;
    tk.fx(sim, 'xingli_ult_cast', caster.pos, caster.team, { unitId: caster.id });
    tk.spawnArea(sim, {
      visual: 'telegraph', owner: caster, pos, radius: ctx.radius, duration: ctx.val('delay'),
      onEnd(s, _area, expired) {
        if (!expired) return;
        // 第一波在预警结束的同一刻落下，其余每隔 interval 一波；总数封顶(区域结束的那一 tick 不再多落一波)
        let done = 1;
        const storm = tk.spawnArea(s, {
          visual: 'xingli_ult_storm', owner: caster, pos, radius: ctx.radius, duration,
          tickInterval: interval,
          onTick(_s, area) {
            if (done >= waves) return;
            done++;
            meteorWave(ctx, caster, area.pos, area.radius, interval);
          },
        });
        meteorWave(ctx, caster, storm.pos, storm.radius, interval);
      },
    });
  },
});
