/**
 * 属性重算：基础(等级) + 装备 + buff + 被动钩子 → unit.stats（就地更新）。
 * 调用时机：升级、装备变化、影响属性的 buff 增删、星陨祝福开始/结束。
 */
import { heroStatsAt } from './data/heroes';
import { ITEMS } from './data/items';
import { MONSTER_RULES } from './data/units';
import type { SimUnit, StatAcc } from './internal';
import type { Sim } from './world';

/** 攻速上限(次/秒) 与最低移速(被多重减速后也不会完全走不动) */
const MAX_ATTACK_SPEED = 2.5;
const MIN_MOVE_SPEED = 1.2;
const MAX_CDR = 0.4;
const MAX_PEN = 0.8;

const acc: StatAcc = {
  hp: 0, mana: 0, ad: 0, ap: 0, apPct: 0, armor: 0, mr: 0, asPct: 0, moveFlat: 0, movePct: 0, slow: 0, slowResist: 0,
  cdr: 0, lifesteal: 0, crit: 0, critDmg: 0, armorPen: 0, magicPen: 0, hpRegen: 0, manaRegen: 0, adPct: 0, hpPct: 0,
};

function resetAcc(): void {
  acc.hp = 0; acc.mana = 0; acc.ad = 0; acc.ap = 0; acc.apPct = 0; acc.armor = 0; acc.mr = 0; acc.asPct = 0;
  acc.moveFlat = 0; acc.movePct = 0; acc.slow = 0; acc.slowResist = 0; acc.cdr = 0; acc.lifesteal = 0; acc.crit = 0;
  acc.critDmg = 0; acc.armorPen = 0; acc.magicPen = 0; acc.hpRegen = 0; acc.manaRegen = 0; acc.adPct = 0; acc.hpPct = 0;
}

export function recomputeStats(sim: Sim, u: SimUnit): void {
  resetAcc();
  const rt = u.rt;
  let frost = false;
  let blessing = false;
  const buffs = u.buffs;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i];
    switch (b.id) {
      case 'slow': if (b.value > acc.slow) acc.slow = b.value; break;
      case 'haste': acc.movePct += b.value; break;
      case 'attack_speed': acc.asPct += b.value; break;
      case 'frost_insight': frost = true; break;
      case 'star_blessing': blessing = true; break;
      default: break;
    }
  }

  if (u.kind === 'hero') {
    rt.base = heroStatsAt(u.h.def, u.level);
    for (let i = 0; i < u.items.length; i++) {
      const id = u.items[i];
      if (!id) continue;
      const m = ITEMS[id].stats;
      acc.hp += m.hp ?? 0;
      acc.mana += m.mana ?? 0;
      acc.ad += m.ad ?? 0;
      acc.ap += m.ap ?? 0;
      acc.apPct += m.apPct ?? 0;
      acc.armor += m.armor ?? 0;
      acc.mr += m.mr ?? 0;
      acc.asPct += m.attackSpeedPct ?? 0;
      acc.moveFlat += m.moveSpeed ?? 0;
      acc.cdr += m.cdr ?? 0;
      acc.lifesteal += m.lifesteal ?? 0;
      acc.crit += m.critChance ?? 0;
      acc.critDmg += m.critDamage ?? 0;
      acc.armorPen += m.armorPen ?? 0;
      acc.magicPen += m.magicPen ?? 0;
      acc.hpRegen += m.hpRegen ?? 0;
      acc.manaRegen += m.manaRegen ?? 0;
    }
    if (frost) acc.cdr += MONSTER_RULES.frostCdr;
    const hooks = u.h.hooks;
    for (let i = 0; i < hooks.length; i++) {
      const fn = hooks[i].statMods;
      if (fn) fn.call(hooks[i], sim, u, acc);
    }
  } else if (u.kind === 'minion' && sim.state.teams[u.team].blessingLeft > 0) {
    // 星陨祝福期间己方小兵伤害/生命提升
    acc.hpPct += MONSTER_RULES.blessingMinionBoost;
    acc.adPct += MONSTER_RULES.blessingMinionBoost;
  }

  const base = rt.base;
  const s = u.stats;
  const oldMaxHp = s.maxHp;
  const oldMaxMana = s.maxMana;
  s.maxHp = (base.maxHp + acc.hp) * (1 + acc.hpPct);
  s.maxMana = base.maxMana + acc.mana;
  s.ad = (base.ad + acc.ad) * (1 + acc.adPct);
  s.ap = (base.ap + acc.ap) * (1 + acc.apPct);
  s.armor = base.armor + acc.armor;
  s.mr = base.mr + acc.mr;
  s.attackSpeed = Math.min(MAX_ATTACK_SPEED, base.attackSpeed * Math.max(0.2, 1 + acc.asPct));
  if (base.moveSpeed > 0) {
    const resist = acc.slowResist < 0 ? 0 : acc.slowResist > 1 ? 1 : acc.slowResist;
    const slow = Math.min(0.9, acc.slow * (1 - resist));
    s.moveSpeed = Math.max(MIN_MOVE_SPEED, (base.moveSpeed + acc.moveFlat) * Math.max(0.1, 1 + acc.movePct) * (1 - slow));
  } else {
    s.moveSpeed = 0;
  }
  s.attackRange = base.attackRange;
  s.cdr = Math.min(MAX_CDR, base.cdr + acc.cdr);
  s.lifesteal = base.lifesteal + acc.lifesteal;
  s.critChance = Math.min(1, base.critChance + acc.crit);
  s.critDamage = base.critDamage + acc.critDmg;
  s.armorPen = Math.min(MAX_PEN, base.armorPen + acc.armorPen);
  s.magicPen = Math.min(MAX_PEN, base.magicPen + acc.magicPen);
  s.hpRegen = base.hpRegen + acc.hpRegen + (blessing ? s.maxHp * MONSTER_RULES.blessingRegen : 0);
  s.manaRegen = base.manaRegen + acc.manaRegen + (frost ? s.maxMana * MONSTER_RULES.frostManaRegen : 0);

  // 上限提高时当前值同步增加（买血装/升级立刻见效）；上限降低时截断
  if (u.alive) {
    if (s.maxHp > oldMaxHp) u.hp += s.maxHp - oldMaxHp;
    if (s.maxMana > oldMaxMana) u.mana += s.maxMana - oldMaxMana;
  }
  if (u.hp > s.maxHp) u.hp = s.maxHp;
  if (u.mana > s.maxMana) u.mana = s.maxMana;
}
