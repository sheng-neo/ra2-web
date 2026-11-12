/**
 * 装备数据：17 件(鞋 4 / 攻击 5 / 法术 4 / 防御 4)。
 * 无合成树、无小件：任何装备可直接购买；可随时随地购买(不必回泉水)，出售返还 60%。
 * 鞋子类(category 'boots')同时只能持有一件(购买进阶鞋会自动替换基础鞋并抵扣其售价)。
 *
 * 命名口径：「功能词 + 古器物」，看前两个字就知道作用；brief 是一句大白话(≤16 字，不带数值细节)；
 * 被动不起雅名，直接用功能词。数值(cost / stats / passive.value / value2)自第一阶段平衡后未改。
 */
import type { ItemDef, ItemId } from '../types';

export const ITEMS: Record<ItemId, ItemDef> = {
  // ── 鞋 ──
  boots: {
    id: 'boots', name: '移速草鞋', brief: '跑得更快的基础鞋', category: 'boots', tier: 1, cost: 250,
    stats: { moveSpeed: 0.5 }, color: '#a8794f',
  },
  boots_guard: {
    id: 'boots_guard', name: '护甲铁靴', brief: '跑得快，还更抗物理伤害', category: 'boots', tier: 2, cost: 710,
    stats: { moveSpeed: 0.6, armor: 110 }, color: '#8d99a8',
  },
  boots_arcane: {
    id: 'boots_arcane', name: '减冷却布靴', brief: '跑得快，技能冷却更短', category: 'boots', tier: 2, cost: 710,
    stats: { moveSpeed: 0.6, cdr: 0.15 }, color: '#7f8cff',
  },
  boots_fury: {
    id: 'boots_fury', name: '攻速皮靴', brief: '跑得快，普攻出手更快', category: 'boots', tier: 2, cost: 710,
    stats: { moveSpeed: 0.6, attackSpeedPct: 0.25 }, color: '#56c7a0',
  },

  // ── 攻击 ──
  starfall_blade: {
    id: 'starfall_blade', name: '收割斩马剑', brief: '物攻最高，打残血更疼', category: 'attack', tier: 2, cost: 2100,
    stats: { ad: 110, cdr: 0.1 },
    passive: { id: 'execute_bonus', name: '收割', desc: '对生命低于 50% 的敌人，伤害 +15%(对建筑无效)。', value: 0.15, value2: 0.5 },
    color: '#ffb44d',
  },
  sunchaser_bow: {
    id: 'sunchaser_bow', name: '攻速角弓', brief: '攻速大涨，普攻附带法伤', category: 'attack', tier: 2, cost: 1900,
    stats: { attackSpeedPct: 0.35, critChance: 0.15, moveSpeed: 0.25 },
    passive: { id: 'onhit_magic', name: '附带法伤', desc: '普攻额外造成 45 点法术伤害(对建筑无效)。', value: 45 },
    color: '#ffd76a',
  },
  blood_scythe: {
    // 吸血只对普攻生效
    id: 'blood_scythe', name: '吸血环首刀', brief: '普攻造成伤害，自己回血', category: 'attack', tier: 2, cost: 1800,
    stats: { ad: 85, lifesteal: 0.2 }, color: '#d8433f',
  },
  piercing_spear: {
    id: 'piercing_spear', name: '破甲长戟', brief: '专克高护甲：无视 35% 护甲', category: 'attack', tier: 2, cost: 2000,
    stats: { ad: 75, armorPen: 0.35 }, color: '#9fb4c9',
  },
  phantom_edge: {
    id: 'phantom_edge', name: '暴击吴钩', brief: '暴击率高，暴击打得更疼', category: 'attack', tier: 2, cost: 2150,
    stats: { ad: 60, critChance: 0.3, critDamage: 0.3 }, color: '#b48cff',
  },

  // ── 法术 ──
  astral_staff: {
    id: 'astral_staff', name: '减冷却法杖', brief: '法强、蓝量、减冷却都给', category: 'magic', tier: 2, cost: 2000,
    stats: { ap: 180, mana: 300, cdr: 0.1 }, color: '#6aa8ff',
  },
  void_crown: {
    id: 'void_crown', name: '法穿玉冠', brief: '专克高魔抗：无视 35% 魔抗', category: 'magic', tier: 2, cost: 2100,
    stats: { ap: 150, magicPen: 0.35 }, color: '#9b6bff',
  },
  winter_scepter: {
    id: 'winter_scepter', name: '减速权杖', brief: '技能打中就减速，还加血', category: 'magic', tier: 2, cost: 2000,
    stats: { ap: 110, hp: 800 },
    passive: { id: 'spell_slow', name: '技能减速', desc: '技能造成伤害时使目标减速 20%，持续 1 秒。', value: 0.2, value2: 1 },
    color: '#8fe3ff',
  },
  sage_codex: {
    id: 'sage_codex', name: '法强竹简', brief: '法强最高，技能伤害最猛', category: 'magic', tier: 2, cost: 2300,
    stats: { ap: 220, apPct: 0.3 }, color: '#f1d27a',
  },

  // ── 防御 ──
  guardian_plate: {
    id: 'guardian_plate', name: '护甲重铠', brief: '护甲最高，打你的人攻速降低', category: 'defense', tier: 2, cost: 1900,
    stats: { hp: 1000, armor: 210 },
    passive: { id: 'cripple_aura', name: '减攻速', desc: '用普攻打你的敌人攻速 −20%，持续 2 秒。', value: 0.2, value2: 2 },
    color: '#7f8ea3',
  },
  starweave_cloak: {
    id: 'starweave_cloak', name: '魔抗狐裘', brief: '很抗法术，残血自动开盾', category: 'defense', tier: 2, cost: 1850,
    stats: { hp: 1000, mr: 200 },
    passive: { id: 'spell_shield', name: '保命盾', desc: '生命低于 35% 时获得 600(+每级 60) 护盾，持续 4 秒，冷却 60 秒。', value: 600, value2: 60 },
    color: '#6fd0c5',
  },
  undying_heart: {
    id: 'undying_heart', name: '回血护心镜', brief: '血最厚，脱战后快速回血', category: 'defense', tier: 2, cost: 2000,
    stats: { hp: 2000 },
    passive: { id: 'regen_ooc', name: '脱战回血', desc: '脱离战斗 5 秒后，每秒回复 2% 最大生命。', value: 0.02 },
    color: '#e0566f',
  },
  thorn_mail: {
    id: 'thorn_mail', name: '反伤钉盾', brief: '谁普攻你，谁就被反伤', category: 'defense', tier: 2, cost: 1750,
    stats: { hp: 500, armor: 170 },
    passive: { id: 'thorns', name: '反伤', desc: '被普攻打中时，对攻击者造成该次伤害 18% 的法术伤害。', value: 0.18 },
    color: '#7da36b',
  },
};

export const ITEM_LIST: ItemDef[] = Object.values(ITEMS);
export const ITEM_SLOTS = 6;
export const SELL_RATIO = 0.6;
