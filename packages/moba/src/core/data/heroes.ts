/**
 * 五位原创英雄的全部数据：属性、技能数值、文案、美术设定。
 * 技能「行为」由模拟层 core/skills 按此处 values 实现；界面层读取 name/desc/cast 画按钮与指示器。
 *
 * 伤害约定：damage + adRatio×当前物攻 + apRatio×当前法强 (+ hpRatio×自身最大生命)。
 * 技能等级：s1/s2 共 6 级，ult 3 级。自动加点：1 级学 s1，2 级学 s2，4/8/12 级升大招，
 * 其余等级按 s1→s2 交替提升（见 skillLevelsAt）。
 */
import type { AbilitySlot, HeroDef, HeroId, SkillDef, Stats } from '../types';

const DEG = Math.PI / 180;

export const HERO_IDS: HeroId[] = ['panyue', 'chijin', 'xingli', 'fengling', 'yeque'];

export const HEROES: Record<HeroId, HeroDef> = {
  // ───────────────────────── 磐岳 · 坦克 ─────────────────────────
  panyue: {
    id: 'panyue',
    name: '磐岳',
    title: '岩铠守卫',
    role: 'tank',
    roleName: '坦克',
    lane: 'bot',
    difficulty: 1,
    lore: '沉睡于星陨山脉的岩石巨灵，被坠星唤醒后披上星铁重铠，誓守身后每一寸土地。',
    tips: '用「裂地冲撞」先手击飞，「不动壁垒」吸收伤害并黏住敌人，大招跃入人群开团。',
    attackType: 'melee',
    radius: 0.75,
    base: { hp: 3650, mana: 440, ad: 158, armor: 120, mr: 70, attackSpeed: 0.8, moveSpeed: 5.6, attackRange: 2.3, hpRegen: 11, manaRegen: 3.2 },
    growth: { hp: 330, mana: 100, ad: 9.5, armor: 24, mr: 9, attackSpeedPct: 0.015 },
    basicAttack: { windup: 0.38, damageType: 'physical' },
    passive: {
      name: '磐石之躯',
      desc: '每第三次普攻震击地面，对目标额外造成自身 4% 最大生命的法术伤害并减速 30%，持续 1 秒。',
      values: { hits: 3, hpRatio: 0.04, slow: 0.3, slowDur: 1 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '裂地冲撞',
        desc: '向指定方向冲锋，撞到第一个敌方英雄或到达终点时震击周围，造成 {damage}(+{adRatio%}物攻) 点物理伤害并击飞 {knockup} 秒。',
        maxLevel: 6,
        cooldown: [9, 8.6, 8.2, 7.8, 7.4, 7],
        manaCost: [50, 55, 60, 65, 70, 75],
        cast: { type: 'direction', range: 7.5, width: 2.2 },
        // dashSpeed 米/秒；impactRadius 终点震击半径
        values: { damage: [240, 300, 360, 420, 480, 540], adRatio: 0.6, knockup: 0.75, dashSpeed: 22, impactRadius: 2.6 },
        castTime: 0.1,
      },
      s2: {
        slot: 's2',
        name: '不动壁垒',
        desc: '升起岩壁护体，获得 {shield}(+{hpRatio%}最大生命) 点护盾，持续 {duration} 秒；同时震慑周围敌人，造成 {damage} 点法术伤害并减速 {slow%}，持续 {slowDur} 秒。',
        maxLevel: 6,
        cooldown: [11, 10.6, 10.2, 9.8, 9.4, 9],
        manaCost: [60, 65, 70, 75, 80, 85],
        cast: { type: 'self', radius: 4.5 },
        values: { shield: [300, 390, 480, 570, 660, 750], hpRatio: 0.09, duration: 4, damage: [120, 160, 200, 240, 280, 320], slow: 0.35, slowDur: 2 },
        castTime: 0.2,
      },
      ult: {
        slot: 'ult',
        name: '山崩地裂',
        desc: '高高跃起砸向目标区域，落地造成 {damage}(+{hpRatio%}最大生命) 点物理伤害并击飞 {knockup} 秒，随后留下持续 {zoneDur} 秒的裂隙，使其中敌人减速 {slow%}。跃起期间免疫控制。',
        maxLevel: 3,
        cooldown: [50, 45, 40],
        manaCost: [100, 110, 120],
        cast: { type: 'position', range: 9.5, radius: 4.5 },
        values: { damage: [400, 600, 800], hpRatio: 0.06, knockup: 1.0, leapTime: 0.65, zoneDur: 3, slow: 0.4 },
        castTime: 0.65,
      },
    },
    build: ['boots', 'guardian_plate', 'boots_guard', 'starweave_cloak', 'undying_heart', 'thorn_mail', 'winter_scepter'],
    palette: { primary: '#6f7f8f', secondary: '#3b4654', accent: '#f2b75a', glow: '#ffcf70' },
    look: '魁梧的岩石巨灵战士：比其他英雄高大宽厚(约 1.25 倍)，灰蓝色岩石身躯上覆盖厚重的星铁板甲，肩甲巨大且嵌有发琥珀金光的结晶，胸口有一枚发光的金色星核；右手持巨型战锤(锤头是嵌晶的岩块)，左臂挂一面塔盾。动作沉重有力。',
  },

  // ───────────────────────── 赤烬 · 战士 ─────────────────────────
  chijin: {
    id: 'chijin',
    name: '赤烬',
    title: '焰刃武者',
    role: 'fighter',
    roleName: '战士',
    lane: 'top',
    difficulty: 2,
    lore: '在陨火中淬炼双刃的流浪武者，刀锋所过之处余烬不熄。',
    tips: '技能之后接普攻触发「余烬之刃」回血换血；「炎步」突进贴身，开大招冲进后排。',
    attackType: 'melee',
    radius: 0.62,
    base: { hp: 3300, mana: 430, ad: 172, armor: 98, mr: 55, attackSpeed: 0.9, moveSpeed: 5.8, attackRange: 2.3, hpRegen: 9, manaRegen: 3 },
    growth: { hp: 290, mana: 95, ad: 12.5, armor: 19, mr: 7, attackSpeedPct: 0.022 },
    basicAttack: { windup: 0.33, damageType: 'physical' },
    passive: {
      name: '余烬之刃',
      desc: '施放技能后，4 秒内的下一次普攻附带烈焰：额外造成 60(+40%物攻) 点物理伤害，并回复自身 4% 最大生命。',
      values: { damage: 60, adRatio: 0.4, healHpRatio: 0.04, window: 4 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '烈焰斩',
        desc: '向前方扇形区域挥出烈焰刀气，造成 {damage}(+{adRatio%}物攻) 点物理伤害并减速 {slow%}，持续 {slowDur} 秒。',
        maxLevel: 6,
        cooldown: [6.5, 6.2, 5.9, 5.6, 5.3, 5],
        manaCost: [40, 44, 48, 52, 56, 60],
        cast: { type: 'cone', range: 5.5, angle: 110 * DEG },
        values: { damage: [220, 275, 330, 385, 440, 495], adRatio: 0.7, slow: 0.3, slowDur: 1.5 },
        castTime: 0.25,
      },
      s2: {
        slot: 's2',
        name: '炎步',
        desc: '化作火影向指定方向突进，对路径上的敌人造成 {damage}(+{adRatio%}物攻) 点物理伤害，并获得 {asBonus%} 攻速加成，持续 {asDur} 秒。',
        maxLevel: 6,
        cooldown: [10, 9.5, 9, 8.5, 8, 7.5],
        manaCost: [50, 54, 58, 62, 66, 70],
        cast: { type: 'direction', range: 5.5, width: 2.0 },
        values: { damage: [150, 190, 230, 270, 310, 350], adRatio: 0.5, asBonus: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6], asDur: 4, dashSpeed: 24 },
        castTime: 0.05,
      },
      ult: {
        slot: 'ult',
        name: '焚天旋舞',
        desc: '挥舞双刃化作火焰旋风，持续 {duration} 秒：每 {tick} 秒对周围敌人造成 {damage}(+{adRatio%}物攻) 点物理伤害。期间可以移动，免疫减速并获得 {reduction%} 减伤。',
        maxLevel: 3,
        cooldown: [42, 38, 34],
        manaCost: [100, 110, 120],
        cast: { type: 'self', radius: 4.2 },
        values: { duration: 3, tick: 0.3, damage: [90, 135, 180], adRatio: 0.45, reduction: 0.25 },
        castTime: 0.1,
      },
    },
    build: ['boots', 'blood_scythe', 'boots_guard', 'starfall_blade', 'guardian_plate', 'piercing_spear', 'starweave_cloak'],
    palette: { primary: '#c8372d', secondary: '#2a2326', accent: '#ffb347', glow: '#ff6a2a' },
    look: '精悍的双刀武者：深色轻甲配赤红披巾/腰带，长发束成高马尾在身后飘动，额前有发光的火纹；双手各持一把略带弧度的长刃，刃身像烧红的金属(由根部的暗红渐变到刃尖的亮橙并发光)，奔跑时刀拖在身侧。动作迅捷凌厉。',
  },

  // ───────────────────────── 星璃 · 法师 ─────────────────────────
  xingli: {
    id: 'xingli',
    name: '星璃',
    title: '星语术士',
    role: 'mage',
    roleName: '法师',
    lane: 'mid',
    difficulty: 2,
    lore: '能听懂星辰低语的观星者，以星图为阵，引九天流火坠落凡尘。',
    tips: '技能命中叠加「星辉印记」，三层引爆并眩晕；先用「引力星环」留人，再接大招覆盖。',
    attackType: 'ranged',
    radius: 0.58,
    base: { hp: 2950, mana: 520, ad: 150, armor: 80, mr: 50, attackSpeed: 0.85, moveSpeed: 5.5, attackRange: 7.5, hpRegen: 7, manaRegen: 4.2 },
    growth: { hp: 215, mana: 125, ad: 8, armor: 14, mr: 6, attackSpeedPct: 0.01 },
    basicAttack: { windup: 0.3, damageType: 'magic', projectile: 'xingli_basic', projectileSpeed: 24 },
    passive: {
      name: '星辉印记',
      desc: '技能命中敌人会附加一层星辉印记(持续 5 秒)。叠满 3 层时引爆：造成目标 6% 最大生命的法术伤害(对非英雄上限 300)并眩晕 0.75 秒。',
      values: { stacks: 3, duration: 5, hpRatio: 0.06, cap: 300, stun: 0.75 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '流星矢',
        desc: '射出一道穿透的流星，对沿途所有敌人造成 {damage}(+{apRatio%}法强) 点法术伤害。',
        maxLevel: 6,
        cooldown: [6, 5.7, 5.4, 5.1, 4.8, 4.5],
        manaCost: [50, 55, 60, 65, 70, 75],
        cast: { type: 'direction', range: 12, width: 1.3 },
        values: { damage: [300, 375, 450, 525, 600, 675], apRatio: 0.65, speed: 26 },
        castTime: 0.2,
      },
      s2: {
        slot: 's2',
        name: '引力星环',
        desc: '在目标位置召唤星环，{delay} 秒后收束：造成 {damage}(+{apRatio%}法强) 点法术伤害，将敌人拉向中心并减速 {slow%}，持续 {slowDur} 秒。',
        maxLevel: 6,
        cooldown: [11, 10.6, 10.2, 9.8, 9.4, 9],
        manaCost: [70, 75, 80, 85, 90, 95],
        cast: { type: 'position', range: 9, radius: 3.4 },
        values: { damage: [260, 325, 390, 455, 520, 585], apRatio: 0.55, delay: 0.6, pull: 1.6, slow: 0.45, slowDur: 2 },
        castTime: 0.25,
      },
      ult: {
        slot: 'ult',
        name: '星陨天降',
        desc: '引动星陨轰击目标区域：{duration} 秒内落下 {waves} 波陨星，每波对区域内敌人造成 {damage}(+{apRatio%}法强) 点法术伤害并减速 {slow%}。每波都会附加星辉印记。',
        maxLevel: 3,
        cooldown: [48, 43, 38],
        manaCost: [120, 130, 140],
        cast: { type: 'position', range: 11, radius: 5.2 },
        values: { damage: [180, 260, 340], apRatio: 0.35, waves: 5, duration: 2.5, delay: 0.5, slow: 0.3, slowDur: 1 },
        castTime: 0.4,
      },
    },
    build: ['boots', 'astral_staff', 'boots_arcane', 'void_crown', 'sage_codex', 'winter_scepter', 'starweave_cloak'],
    palette: { primary: '#5a6fe0', secondary: '#f1ecff', accent: '#ffd98a', glow: '#8fd8ff' },
    look: '轻盈的女性观星术士：身着靛蓝与月白相间的长袍(下摆呈星空渐变并缀有细小亮点)，银白长发披散，头戴月牙与星环组成的冠饰；手持一根顶端悬浮着多面水晶星体的长杖，身周有两三枚缓缓环绕的小星辰。施法时长袍与星体发出青蓝辉光。',
  },

  // ───────────────────────── 风翎 · 射手 ─────────────────────────
  fengling: {
    id: 'fengling',
    name: '风翎',
    title: '逐风射手',
    role: 'marksman',
    roleName: '射手',
    lane: 'bot',
    difficulty: 2,
    lore: '苍原上最快的猎手，据说她射出的箭从未被风追上过。',
    tips: '持续普攻叠满「风之眷顾」后输出爆炸；用「逐风步」拉开距离，保持站位别被近身。',
    attackType: 'ranged',
    radius: 0.58,
    base: { hp: 2900, mana: 440, ad: 176, armor: 78, mr: 50, attackSpeed: 0.95, moveSpeed: 5.5, attackRange: 8.2, hpRegen: 7, manaRegen: 3 },
    growth: { hp: 205, mana: 100, ad: 14.5, armor: 14, mr: 6, attackSpeedPct: 0.03 },
    basicAttack: { windup: 0.28, damageType: 'physical', projectile: 'fengling_basic', projectileSpeed: 30 },
    passive: {
      name: '风之眷顾',
      desc: '普攻命中获得一层风势(最多 5 层，持续 3 秒)，每层提高 7% 攻速。满层时移速提高 10%，且普攻额外造成 30(+每级 5) 点物理伤害。',
      values: { maxStacks: 5, duration: 3, asPerStack: 0.07, haste: 0.1, bonus: 30, bonusPerLevel: 5 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '贯风矢',
        desc: '蓄力射出一支贯穿小兵的强力箭矢，命中的第一个敌方英雄受到 {damage}(+{adRatio%}物攻) 点物理伤害并减速 {slow%}，持续 {slowDur} 秒(对沿途小兵/野怪造成 60% 伤害)。',
        maxLevel: 6,
        cooldown: [8, 7.6, 7.2, 6.8, 6.4, 6],
        manaCost: [50, 55, 60, 65, 70, 75],
        cast: { type: 'direction', range: 14, width: 1.3 },
        values: { damage: [280, 350, 420, 490, 560, 630], adRatio: 1.1, slow: 0.3, slowDur: 1.5, speed: 32, minionRatio: 0.6 },
        castTime: 0.3,
      },
      s2: {
        slot: 's2',
        name: '逐风步',
        desc: '乘风向指定方向翻跃，获得 {haste%} 移速加成持续 {hasteDur} 秒，且下一次普攻必定暴击。',
        maxLevel: 6,
        cooldown: [9, 8.5, 8, 7.5, 7, 6.5],
        manaCost: [40, 42, 44, 46, 48, 50],
        cast: { type: 'direction', range: 5, width: 1.2 },
        values: { haste: 0.2, hasteDur: 2, critWindow: 4, dashSpeed: 26 },
        castTime: 0.05,
      },
      ult: {
        slot: 'ult',
        name: '千羽天幕',
        desc: '向天空射出箭簇，令箭雨覆盖目标区域 {duration} 秒：每 {tick} 秒造成 {damage}(+{adRatio%}物攻) 点物理伤害并减速 {slow%}。',
        maxLevel: 3,
        cooldown: [50, 45, 40],
        manaCost: [110, 120, 130],
        cast: { type: 'position', range: 11.5, radius: 5 },
        values: { damage: [110, 160, 210], adRatio: 0.4, duration: 3, tick: 0.5, delay: 0.5, slow: 0.35, slowDur: 0.8 },
        castTime: 0.4,
      },
    },
    build: ['boots', 'sunchaser_bow', 'boots_fury', 'phantom_edge', 'blood_scythe', 'piercing_spear', 'starfall_blade'],
    palette: { primary: '#3fae8c', secondary: '#f3f0e2', accent: '#e9c46a', glow: '#9dffd8' },
    look: '矫健的女性猎手：青绿色短斗篷配兜帽(兜帽放下，露出扎成侧辫的浅金发)，米白色轻皮甲与长靴，背后一只装满羽箭的箭筒；手持一把比她上半身还长的白木长弓，弓臂两端有翠色风纹并微微发光，斗篷下摆像羽翼般分叉、随风摆动。站姿轻盈，射击时拉满弓。',
  },

  // ───────────────────────── 夜阙 · 刺客 ─────────────────────────
  yeque: {
    id: 'yeque',
    name: '夜阙',
    title: '夜隐刺客',
    role: 'assassin',
    roleName: '刺客',
    lane: 'jungle',
    difficulty: 3,
    lore: '行走于星光照不到之处的无面者，目标倒下之前，没有人见过他的刀。',
    tips: '刷野发育后游走抓人；残血目标会受到额外伤害，参与击杀能刷新一、二技能连续收割。',
    attackType: 'melee',
    radius: 0.58,
    base: { hp: 3050, mana: 440, ad: 178, armor: 88, mr: 52, attackSpeed: 0.92, moveSpeed: 6.0, attackRange: 2.2, hpRegen: 8, manaRegen: 3 },
    growth: { hp: 250, mana: 100, ad: 13.5, armor: 16, mr: 6.5, attackSpeedPct: 0.022 },
    basicAttack: { windup: 0.3, damageType: 'physical' },
    passive: {
      name: '猎影',
      desc: '对生命值低于 40% 的敌人造成的伤害提高 18%。参与击杀英雄后，立即刷新一、二技能冷却并回复 8% 最大生命。对野怪造成的伤害提高 25%。',
      values: { threshold: 0.4, bonus: 0.18, healHpRatio: 0.08, monsterBonus: 0.25 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '瞬影斩',
        desc: '瞬身穿过指定方向，对路径上的敌人造成 {damage}(+{adRatio%}物攻) 点物理伤害。若命中敌方英雄，返还 {refund%} 冷却。',
        maxLevel: 6,
        cooldown: [7, 6.7, 6.4, 6.1, 5.8, 5.5],
        manaCost: [40, 44, 48, 52, 56, 60],
        cast: { type: 'direction', range: 6.5, width: 2.0 },
        values: { damage: [200, 255, 310, 365, 420, 475], adRatio: 0.9, refund: 0.4, dashSpeed: 30 },
        castTime: 0.05,
      },
      s2: {
        slot: 's2',
        name: '影刃飞旋',
        desc: '扇形掷出 3 枚影刃，每枚对命中的第一个敌人造成 {damage}(+{adRatio%}物攻) 点物理伤害并减速 {slow%}，持续 {slowDur} 秒(同一目标被多枚命中时，后续影刃只造成 50% 伤害)。',
        maxLevel: 6,
        cooldown: [8, 7.6, 7.2, 6.8, 6.4, 6],
        manaCost: [50, 54, 58, 62, 66, 70],
        cast: { type: 'direction', range: 9, width: 1.0 },
        values: { damage: [150, 190, 230, 270, 310, 350], adRatio: 0.5, slow: 0.35, slowDur: 1.5, blades: 3, spread: 16 * DEG, speed: 26, repeatRatio: 0.5 },
        castTime: 0.15,
      },
      ult: {
        slot: 'ult',
        name: '幽夜处决',
        desc: '遁入暗影，瞬间出现在目标敌方英雄身后发动处决：造成 {damage}(+{adRatio%}物攻) 外加目标 {missingRatio%} 已损生命的物理伤害。遁影期间不可被选中。',
        maxLevel: 3,
        cooldown: [40, 35, 30],
        manaCost: [100, 105, 110],
        cast: { type: 'target', range: 8 },
        values: { damage: [380, 560, 740], adRatio: 1.2, missingRatio: 0.2, vanish: 0.35 },
        castTime: 0.35,
      },
    },
    build: ['boots', 'starfall_blade', 'boots_arcane', 'piercing_spear', 'phantom_edge', 'blood_scythe', 'starweave_cloak'],
    palette: { primary: '#3a2f5b', secondary: '#15131f', accent: '#b48cff', glow: '#a070ff' },
    look: '修长的蒙面刺客：贴身的暗紫黑色夜行衣，戴兜帽与遮住下半张脸的面罩，兜帽阴影里只有两点发紫光的眼睛；颈后一条长长的破碎围巾在身后拖曳飘动(末端渐隐成烟)；双手反握两把短匕首，刀刃是发紫光的能量刃。奔跑时身体压低前倾。',
  },
};

/** 等级上限 */
export const MAX_LEVEL = 15;

/** 自动加点：给定英雄等级，返回三个技能的等级。4/8/12 级点大招，其余 s1→s2 交替。 */
export function skillLevelsAt(heroLevel: number): Record<AbilitySlot, number> {
  let s1 = 0;
  let s2 = 0;
  let ult = 0;
  let toggle = 0;
  for (let l = 1; l <= Math.min(heroLevel, MAX_LEVEL); l++) {
    if (l === 4 || l === 8 || l === 12) {
      ult++;
    } else if ((toggle++ % 2 === 0 && s1 < 6) || s2 >= 6) {
      s1++;
    } else {
      s2++;
    }
  }
  return { s1, s2, ult };
}

/** 取技能数值：数组按技能等级取值（level<1 取第 1 级），单值直接返回。 */
export function skillValue(def: SkillDef, key: string, level: number): number {
  const v = def.values[key];
  if (v === undefined) throw new Error(`skill ${def.name} has no value "${key}"`);
  if (typeof v === 'number') return v;
  const i = Math.max(0, Math.min(v.length - 1, level - 1));
  return v[i];
}

function fmtNum(n: number, pct: boolean): string {
  if (pct) return `${Math.round(n * 100)}%`;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * 渲染技能描述。level >= 1 时显示该等级数值；level = 0 时显示全等级「a/b/c」。
 */
export function formatSkillDesc(def: SkillDef, level: number): string {
  return def.desc.replace(/\{(\w+)(%?)\}/g, (_m, key: string, pctMark: string) => {
    const v = def.values[key];
    const pct = pctMark === '%';
    if (v === undefined) return `{${key}}`;
    if (typeof v === 'number') return fmtNum(v, pct);
    if (level >= 1) return fmtNum(v[Math.min(v.length - 1, level - 1)], pct);
    return v.map((n) => fmtNum(n, pct)).join('/');
  });
}

/** 召唤师技能（所有英雄通用） */
export const SUMMONER = {
  recall: { name: '回城', desc: '原地引导 5 秒后传送回泉水。移动、攻击或受到伤害会打断。', channel: 5, cooldown: 1 },
  heal: { name: '恢复', desc: '5 秒内持续回复共 30% 最大生命与 30% 最大法力。受到英雄或防御塔伤害会打断。', duration: 5, hpRatio: 0.3, manaRatio: 0.3, cooldown: 60 },
  flash: { name: '闪现', desc: '向指定方向瞬移一小段距离，可穿越薄墙。', range: 5, cooldown: 110 },
} as const;

/** 英雄在某等级的裸属性（不含装备与增益）。模拟层在此基础上叠加装备/增益。 */
export function heroStatsAt(def: HeroDef, level: number): Stats {
  const n = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  return {
    maxHp: def.base.hp + def.growth.hp * n,
    maxMana: def.base.mana + def.growth.mana * n,
    ad: def.base.ad + def.growth.ad * n,
    ap: 0,
    armor: def.base.armor + def.growth.armor * n,
    mr: def.base.mr + def.growth.mr * n,
    attackSpeed: def.base.attackSpeed * (1 + def.growth.attackSpeedPct * n),
    moveSpeed: def.base.moveSpeed,
    attackRange: def.base.attackRange,
    hpRegen: def.base.hpRegen + 0.6 * n,
    manaRegen: def.base.manaRegen + 0.2 * n,
    cdr: 0,
    lifesteal: 0,
    critChance: 0,
    critDamage: 2,
    armorPen: 0,
    magicPen: 0,
  };
}
