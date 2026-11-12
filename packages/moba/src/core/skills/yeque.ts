/**
 * 荆轲 · 易水壮士（刺客）
 *
 * 被动 一去不还：对低血量敌人增伤、对野怪增伤(乘算)；参与击杀英雄后刷新 S1/S2、回血，并挂 yeque_shadow 作为刷新提示。
 * S1 风萧易水：穿过路径上的敌人各造成一次物理伤害；命中过英雄则返还一次冷却。
 * S2 引匕一掷：扇形掷出若干匕首(相邻夹角 = spread)，各自命中第一个敌人：物理伤害 + 减速；
 *   同一目标被这次施放的后续匕首命中时只受部分伤害。
 * 大招 图穷匕见：隐身(untargetable)后出现在目标身后：物理伤害 + 目标已损生命比例伤害。
 *   隐身期间目标阵亡则这一匕落空(原地现身)；目标只是位移/闪现则照样追到它身后。
 */
import { HEROES } from '../data/heroes';
import { isStructure } from '../entity';
import { castPoint, copyVec, dashEnd, fixedValue, strike } from './common';
import * as tk from './toolkit';

const P = HEROES.yeque.passive.values;
const S2_POINT = castPoint('yeque', 's2');
/** 击杀刷新提示(yeque_shadow)的显示时长 */
const SHADOW_HINT_TIME = 3;
/** 现身时与目标身体之间留的空隙 */
const BEHIND_GAP = 0.3;

tk.registerHeroHooks('yeque', {
  modifyDamageDealt(_sim, _hero, target, info) {
    if (isStructure(target)) return;
    if (target.hp < target.stats.maxHp * P.threshold) info.amount *= 1 + P.bonus;
    if (target.kind === 'monster') info.amount *= 1 + P.monsterBonus;
  },
  onTakedown(sim, hero) {
    tk.resetCooldown(hero, 's1');
    tk.resetCooldown(hero, 's2');
    if (!hero.alive) return;
    tk.heal(sim, hero, hero, hero.stats.maxHp * P.healHpRatio, true);
    tk.addBuff(sim, hero, 'yeque_shadow', { duration: SHADOW_HINT_TIME, sourceId: hero.id, merge: 'replace' });
  },
});

tk.registerSkill('yeque', 's1', {
  movement: true,
  noAnim: true,
  lockTime: 0,
  aimSpeed: fixedValue('yeque', 's1', 'dashSpeed'),
  cast(ctx) {
    const { sim, caster } = ctx;
    const from = copyVec(caster.pos);
    let refunded = false;
    tk.fx(sim, 'yeque_s1_dash', from, caster.team, {
      unitId: caster.id, from, to: dashEnd(sim, caster, ctx.dir, ctx.range), dir: copyVec(ctx.dir),
    });
    tk.startDash(sim, caster, {
      dir: ctx.dir,
      distance: ctx.range,
      speed: ctx.val('dashSpeed'),
      hitRadius: ctx.width * 0.5,
      filter: tk.enemyFilter(caster.team),
      onHit(t) {
        const isHero = t.kind === 'hero';
        strike(ctx, t, tk.scaled(ctx, 'damage', { ad: 'adRatio' }), 'physical');
        if (isHero && !refunded) {
          refunded = true;
          tk.refundCooldown(caster, 's1', ctx.val('refund'));
        }
      },
    });
  },
});

tk.registerSkill('yeque', 's2', {
  aimSpeed: fixedValue('yeque', 's2', 'speed'),
  aimLead: S2_POINT,
  cast(ctx) {
    const { sim, caster } = ctx;
    tk.after(ctx, S2_POINT, () => {
      const damage = tk.scaled(ctx, 'damage', { ad: 'adRatio' });
      const blades = Math.round(ctx.val('blades'));
      const spread = ctx.val('spread');
      const base = Math.atan2(ctx.dir.y, ctx.dir.x);
      const struck = new Set<number>();
      tk.fx(sim, 'yeque_s2_cast', caster.pos, caster.team, { unitId: caster.id, dir: copyVec(ctx.dir) });
      for (let i = 0; i < blades; i++) {
        const a = base + (i - (blades - 1) * 0.5) * spread;
        tk.spawnLinearProjectile(sim, {
          visual: 'yeque_s2', owner: caster, from: caster.pos, dir: { x: Math.cos(a), y: Math.sin(a) },
          speed: ctx.val('speed'), range: ctx.range, radius: ctx.width * 0.5, filter: tk.enemyFilter(caster.team),
          onHit(s, _proj, t) {
            const ratio = struck.has(t.id) ? ctx.val('repeatRatio') : 1;
            struck.add(t.id);
            tk.skillDamage(s, caster, t, damage * ratio, 'physical', ctx.slot);
            tk.slow(s, t, ctx.val('slow'), ctx.val('slowDur'), caster, 'yeque_s2');
          },
        });
      }
    });
  },
});

tk.registerSkill('yeque', 'ult', {
  // 现身也是位移：和其他位移技能一样，被定身时放不出来
  movement: true,
  cast(ctx) {
    const { sim, caster } = ctx;
    const target = ctx.target;
    if (!target) return;
    const from = copyVec(caster.pos);
    tk.fx(sim, 'yeque_ult_vanish', from, caster.team, { unitId: caster.id, targetId: target.id });
    // 隐身结束的那一刻现身并处决：挂在 buff 到期回调上，「不可选中」与「现身」之间不会有空档
    tk.addBuff(sim, caster, 'untargetable', {
      duration: ctx.val('vanish'),
      sourceId: caster.id,
      key: 'yeque_ult',
      merge: 'replace',
      onExpire() {
        if (!caster.alive || !target.alive || sim.byId.get(target.id) !== target) return;
        const back = target.facing + Math.PI;
        const gap = target.radius + caster.radius + BEHIND_GAP;
        const to = copyVec(tk.blink(sim, caster, { x: target.pos.x + Math.cos(back) * gap, y: target.pos.y + Math.sin(back) * gap }));
        tk.facePoint(caster, target.pos);
        tk.fx(sim, 'yeque_ult_strike', target.pos, caster.team, { unitId: caster.id, targetId: target.id, from, to });
        const damage = tk.scaled(ctx, 'damage', { ad: 'adRatio' }) + ctx.val('missingRatio') * (target.stats.maxHp - target.hp);
        strike(ctx, target, damage, 'physical');
      },
    });
  },
});
