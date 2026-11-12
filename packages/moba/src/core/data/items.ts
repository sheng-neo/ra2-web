/**
 * 装备数据。无合成树：任何装备可直接购买；可随时随地购买(不必回泉水)，出售返还 60%。
 * 鞋子类(category 'boots')同时只能持有一件(购买升级鞋会自动替换基础鞋并抵扣其售价)。
 */
import type { ItemDef, ItemId } from '../types';

export const ITEMS: Record<ItemId, ItemDef> = {
  // ── 基础小件 ──
  iron_blade: { id: 'iron_blade', name: '铁刃', category: 'attack', tier: 1, cost: 250, stats: { ad: 20 }, color: '#c9ced6' },
  swift_bow: { id: 'swift_bow', name: '轻羽短弓', category: 'attack', tier: 1, cost: 290, stats: { attackSpeedPct: 0.15 }, color: '#8fd3a8' },
  spell_tome: { id: 'spell_tome', name: '秘法残页', category: 'magic', tier: 1, cost: 300, stats: { ap: 40 }, color: '#8aa4ff' },
  cloth_armor: { id: 'cloth_armor', name: '织甲', category: 'defense', tier: 1, cost: 220, stats: { armor: 90 }, color: '#b9a37c' },
  boots: { id: 'boots', name: '疾行靴', category: 'boots', tier: 1, cost: 250, stats: { moveSpeed: 0.5 }, color: '#a8794f' },

  // ── 鞋 ──
  boots_guard: { id: 'boots_guard', name: '磐守之靴', category: 'boots', tier: 2, cost: 710, stats: { moveSpeed: 0.6, armor: 110 }, color: '#8d99a8' },
  boots_arcane: { id: 'boots_arcane', name: '星辉之靴', category: 'boots', tier: 2, cost: 710, stats: { moveSpeed: 0.6, cdr: 0.15 }, color: '#7f8cff' },
  boots_fury: { id: 'boots_fury', name: '疾风之靴', category: 'boots', tier: 2, cost: 710, stats: { moveSpeed: 0.6, attackSpeedPct: 0.25 }, color: '#56c7a0' },

  // ── 攻击 ──
  starfall_blade: {
    id: 'starfall_blade', name: '陨星战刃', category: 'attack', tier: 2, cost: 2100,
    stats: { ad: 110, cdr: 0.1 },
    passive: { id: 'execute_bonus', name: '坠星', desc: '对生命值低于 50% 的敌人造成的伤害提高 15%。', value: 0.15, value2: 0.5 },
    color: '#ffb44d',
  },
  sunchaser_bow: {
    id: 'sunchaser_bow', name: '逐日长弓', category: 'attack', tier: 2, cost: 1900,
    stats: { attackSpeedPct: 0.35, critChance: 0.15, moveSpeed: 0.25 },
    passive: { id: 'onhit_magic', name: '灼光', desc: '普攻额外造成 45 点法术伤害。', value: 45 },
    color: '#ffd76a',
  },
  blood_scythe: { id: 'blood_scythe', name: '饮血镰', category: 'attack', tier: 2, cost: 1800, stats: { ad: 85, lifesteal: 0.2 }, color: '#d8433f' },
  piercing_spear: { id: 'piercing_spear', name: '破阵枪', category: 'attack', tier: 2, cost: 2000, stats: { ad: 75, armorPen: 0.35 }, color: '#9fb4c9' },
  phantom_edge: { id: 'phantom_edge', name: '无影刃', category: 'attack', tier: 2, cost: 2150, stats: { ad: 60, critChance: 0.3, critDamage: 0.3 }, color: '#b48cff' },

  // ── 法术 ──
  astral_staff: { id: 'astral_staff', name: '星辰法杖', category: 'magic', tier: 2, cost: 2000, stats: { ap: 180, mana: 300, cdr: 0.1 }, color: '#6aa8ff' },
  void_crown: { id: 'void_crown', name: '虚空之冠', category: 'magic', tier: 2, cost: 2100, stats: { ap: 150, magicPen: 0.35 }, color: '#9b6bff' },
  winter_scepter: {
    id: 'winter_scepter', name: '凛冬权杖', category: 'magic', tier: 2, cost: 2000,
    stats: { ap: 110, hp: 800 },
    passive: { id: 'spell_slow', name: '霜蚀', desc: '技能伤害使目标减速 20%，持续 1 秒。', value: 0.2, value2: 1 },
    color: '#8fe3ff',
  },
  sage_codex: { id: 'sage_codex', name: '贤者星典', category: 'magic', tier: 2, cost: 2300, stats: { ap: 220, apPct: 0.3 }, color: '#f1d27a' },

  // ── 防御 ──
  guardian_plate: {
    id: 'guardian_plate', name: '守护者重铠', category: 'defense', tier: 2, cost: 1900,
    stats: { hp: 1000, armor: 210 },
    passive: { id: 'cripple_aura', name: '寒铁', desc: '用普攻攻击你的敌人攻速降低 20%，持续 2 秒。', value: 0.2, value2: 2 },
    color: '#7f8ea3',
  },
  starweave_cloak: {
    id: 'starweave_cloak', name: '星纹斗篷', category: 'defense', tier: 2, cost: 1850,
    stats: { hp: 1000, mr: 200 },
    passive: { id: 'spell_shield', name: '星幕', desc: '生命值低于 35% 时获得可吸收 600(+每级 60) 点伤害的护盾，持续 4 秒(冷却 60 秒)。', value: 600, value2: 60 },
    color: '#6fd0c5',
  },
  undying_heart: {
    id: 'undying_heart', name: '不灭之心', category: 'defense', tier: 2, cost: 2000,
    stats: { hp: 2000 },
    passive: { id: 'regen_ooc', name: '生生不息', desc: '脱离战斗后每秒回复 2% 最大生命。', value: 0.02 },
    color: '#e0566f',
  },
  thorn_mail: {
    id: 'thorn_mail', name: '荆棘岩甲', category: 'defense', tier: 2, cost: 1750,
    stats: { hp: 500, armor: 170 },
    passive: { id: 'thorns', name: '反震', desc: '受到普攻时，对攻击者造成其伤害 18% 的法术伤害。', value: 0.18 },
    color: '#7da36b',
  },
};

export const ITEM_LIST: ItemDef[] = Object.values(ITEMS);
export const ITEM_SLOTS = 6;
export const SELL_RATIO = 0.6;
