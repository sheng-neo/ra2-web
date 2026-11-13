/**
 * 五位英雄的全部数据：属性、技能数值、文案、美术设定。
 * 身份是「历史人物 + 职业」：樊哙 · 坦克(panyue) / 程咬金 · 战士(chijin) / 王昭君 · 法师(xingli) /
 * 李广 · 射手(fengling) / 荆轲 · 刺客(yeque)。依据只取史料与民间传说；内部 id 沿用第一阶段的键名，
 * 机制与数值也沿用第一阶段(已测试、已平衡)，这里只有文案、标签与美术设定是第二阶段重写的。
 * 界面上英雄一律显示为「名字 · 职业」，统一走 heroFullName()。
 *
 * 技能「行为」由模拟层 core/skills 按此处 values 实现；界面层读取 name/brief/tags/desc/cast 画按钮与指示器。
 * brief = 一句大白话(≤18 字，不带数值)；tags = 1~2 个类型标签(「大招」「被动」由界面按槽位自动加)。
 *
 * 伤害约定：damage + adRatio×当前物攻 + apRatio×当前法强 (+ hpRatio×自身最大生命)。
 * 技能等级：s1/s2 共 6 级，ult 3 级。自动加点：1 级学 s1，2 级学 s2，4/8/12 级升大招，
 * 其余等级按 s1→s2 交替提升（见 skillLevelsAt）。
 */
import type { AbilitySlot, HeroDef, HeroId, SkillDef, SkillTag, Stats } from '../types';

const DEG = Math.PI / 180;

/** 展示顺序：樊哙 → 程咬金 → 王昭君 → 李广 → 荆轲 */
export const HERO_IDS: HeroId[] = ['panyue', 'chijin', 'xingli', 'fengling', 'yeque'];

export const HEROES: Record<HeroId, HeroDef> = {
  // ───────────────────────── 樊哙 · 坦克 ─────────────────────────
  // 出处：《史记·项羽本纪》《樊郦滕灌列传》——鸿门宴「带剑拥盾入军门」「侧其盾以撞」「头发上指，目眦尽裂」「臣死且不避」
  panyue: {
    id: 'panyue',
    name: '樊哙',
    title: '鸿门闯帐',
    role: 'tank',
    roleName: '坦克',
    lane: 'bot',
    difficulty: 1,
    lore: '沛县屠狗出身的汉初猛将。《史记》载鸿门宴上他「带剑拥盾入军门」，侧过盾牌撞倒卫士闯进大帐，怒视项王，护着刘邦脱了险。',
    tips: '你是队伍的门板：用「侧盾闯帐」撞进去把人顶飞。被集火就开「拥盾怒目」，有护盾还能减速身边的人。大招跳进人堆砸地开团，别忘了每第三下普攻自带减速。',
    attackType: 'melee',
    radius: 0.75,
    base: { hp: 3650, mana: 440, ad: 158, armor: 120, mr: 70, attackSpeed: 0.8, moveSpeed: 5.6, attackRange: 2.3, hpRegen: 11, manaRegen: 3.2 },
    growth: { hp: 330, mana: 100, ad: 9.5, armor: 24, mr: 9, attackSpeedPct: 0.015 },
    basicAttack: { windup: 0.38, damageType: 'physical' },
    passive: {
      name: '覆盾震地',
      brief: '每第三下普攻更疼，还带减速',
      tags: ['slow'],
      desc: '每第三次普攻改用大盾砸地，对目标额外造成自身 4% 最大生命的法术伤害并减速 30%，持续 1 秒。',
      values: { hits: 3, hpRatio: 0.04, slow: 0.3, slowDur: 1 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '侧盾闯帐',
        brief: '举盾冲过去，撞到人就击飞',
        tags: ['dash', 'control'],
        desc: '侧起大盾向指定方向冲撞，撞到第一个敌方英雄或冲到终点时震开周围，造成 {damage}(+{adRatio%}物攻) 点物理伤害并击飞 {knockup} 秒。',
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
        name: '拥盾怒目',
        brief: '给自己加护盾，减速身边敌人',
        tags: ['shield', 'slow'],
        desc: '拥盾立定，获得 {shield}(+{hpRatio%}最大生命) 点护盾，持续 {duration} 秒；同时怒目一喝震慑周围敌人，造成 {damage} 点法术伤害并减速 {slow%}，持续 {slowDur} 秒。',
        maxLevel: 6,
        cooldown: [11, 10.6, 10.2, 9.8, 9.4, 9],
        manaCost: [60, 65, 70, 75, 80, 85],
        cast: { type: 'self', radius: 4.5 },
        values: { shield: [300, 390, 480, 570, 660, 750], hpRatio: 0.09, duration: 4, damage: [120, 160, 200, 240, 280, 320], slow: 0.35, slowDur: 2 },
        castTime: 0.2,
      },
      ult: {
        slot: 'ult',
        name: '跃盾砸阵',
        brief: '跳进人堆砸地，击飞一大片',
        tags: ['control', 'slow'],
        desc: '大喝一声「死且不避」，须发戟张，高高跃起连人带盾砸向目标区域，落地造成 {damage}(+{hpRatio%}最大生命) 点物理伤害并击飞 {knockup} 秒，随后留下持续 {zoneDur} 秒的震裂地面，使其中敌人减速 {slow%}。跃起期间免疫控制。',
        maxLevel: 3,
        cooldown: [50, 45, 40],
        manaCost: [100, 110, 120],
        cast: { type: 'position', range: 9.5, radius: 4.5 },
        values: { damage: [400, 600, 800], hpRatio: 0.06, knockup: 1.0, leapTime: 0.65, zoneDur: 3, slow: 0.4 },
        castTime: 0.65,
      },
    },
    build: ['boots', 'guardian_plate', 'boots_guard', 'starweave_cloak', 'undying_heart', 'thorn_mail', 'winter_scepter'],
    palette: { primary: '#5f6b78', secondary: '#7a4e30', accent: '#d9a441', glow: '#ffcf70' },
    look: '魁梧的汉初猛将：比其他英雄高大宽厚一号，玄铁札甲配方片披膊，赭褐粗布战裙；须发戟张、络腮虬髯、怒目；左臂一面黑漆金纹的双弧大盾，右手一柄汉剑。动作沉重。',
  },

  // ───────────────────────── 程咬金 · 战士 ─────────────────────────
  // 出处：《隋唐演义》《说唐》与评书——瓦岗寨「混世魔王」、宣花大斧、梦里学斧只记住三招、「半路杀出个程咬金」
  chijin: {
    id: 'chijin',
    name: '程咬金',
    title: '混世魔王',
    role: 'fighter',
    roleName: '战士',
    lane: 'top',
    difficulty: 2,
    lore: '隋唐演义里瓦岗寨的「混世魔王」。民间传说他梦里学斧，醒来只记得三招——这「三板斧」却招招要命。',
    tips: '三个技能就是三板斧，每放完一个技能马上补一下普攻，又疼又回血。用「半路杀出」冲到人脸上，再开大招抡斧转圈。血少也能打回来，但别一个人冲进塔里。',
    attackType: 'melee',
    radius: 0.62,
    base: { hp: 3450, mana: 430, ad: 172, armor: 104, mr: 55, attackSpeed: 0.9, moveSpeed: 5.8, attackRange: 2.3, hpRegen: 9, manaRegen: 3 },
    growth: { hp: 310, mana: 95, ad: 12.5, armor: 21, mr: 8, attackSpeedPct: 0.022 },
    basicAttack: { windup: 0.33, damageType: 'physical' },
    passive: {
      name: '越砍越勇',
      brief: '放完技能的下一斧更疼还回血',
      tags: ['heal'],
      desc: '施放技能后，4 秒内的下一次普攻变为重斧：额外造成 80(+50%物攻) 点物理伤害，并回复自身 5% 最大生命。',
      values: { damage: 80, adRatio: 0.5, healHpRatio: 0.05, window: 4 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '拦腰一斧',
        brief: '向前横扫一大片，砍中减速',
        tags: ['burst', 'slow'],
        desc: '三板斧第一式：抡斧横扫前方扇形区域，造成 {damage}(+{adRatio%}物攻) 点物理伤害并减速 {slow%}，持续 {slowDur} 秒。',
        maxLevel: 6,
        cooldown: [6.5, 6.2, 5.9, 5.6, 5.3, 5],
        manaCost: [40, 44, 48, 52, 56, 60],
        cast: { type: 'cone', range: 5.5, angle: 110 * DEG },
        values: { damage: [220, 275, 330, 385, 440, 495], adRatio: 0.8, slow: 0.3, slowDur: 1.5 },
        castTime: 0.25,
      },
      s2: {
        slot: 's2',
        name: '半路杀出',
        brief: '冲上去砍一路，攻速变快',
        tags: ['dash', 'buff'],
        desc: '三板斧第二式：提斧向指定方向猛冲，对路径上的敌人造成 {damage}(+{adRatio%}物攻) 点物理伤害，并获得 {asBonus%} 攻速加成，持续 {asDur} 秒。',
        maxLevel: 6,
        cooldown: [10, 9.5, 9, 8.5, 8, 7.5],
        manaCost: [50, 54, 58, 62, 66, 70],
        cast: { type: 'direction', range: 5.5, width: 2.0 },
        values: { damage: [150, 190, 230, 270, 310, 350], adRatio: 0.5, asBonus: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6], asDur: 4, dashSpeed: 24 },
        castTime: 0.05,
      },
      ult: {
        slot: 'ult',
        name: '抡圆了砍',
        brief: '抡斧转圈持续砍，可以边转边走',
        tags: ['dot', 'buff'],
        desc: '三板斧第三式：抡圆大斧转成一团斧影，持续 {duration} 秒：每 {tick} 秒对周围敌人造成 {damage}(+{adRatio%}物攻) 点物理伤害。期间可以移动，免疫减速并获得 {reduction%} 减伤。',
        maxLevel: 3,
        cooldown: [42, 38, 34],
        manaCost: [100, 110, 120],
        cast: { type: 'self', radius: 4.2 },
        values: { duration: 3, tick: 0.3, damage: [100, 150, 200], adRatio: 0.45, reduction: 0.3 },
        castTime: 0.1,
      },
    },
    build: ['boots', 'blood_scythe', 'boots_guard', 'starfall_blade', 'guardian_plate', 'piercing_spear', 'starweave_cloak'],
    palette: { primary: '#cc3a26', secondary: '#3a3436', accent: '#e2a13a', glow: '#ff7a2a' },
    look: '粗豪敦实的大斧武将：圆铁盔顶一撮红缨，赤褐络腮短髯，咧嘴带笑；胸前两面铜圆护的铁甲，朱红披风与战裙；双手持一柄宽刃的八卦宣花斧，平时扛在右肩。动作大开大合。',
  },

  // ───────────────────────── 王昭君 · 法师 ─────────────────────────
  // 出处：《汉书》《后汉书》昭君出塞；历代《明妃出塞图》的红斗篷与怀抱琵琶；民间「落雁」之说；琴曲《平沙落雁》(又名《雁落平沙》)。
  // 意象只有弦音、雁、塞外月色，不是冰雪法师
  xingli: {
    id: 'xingli',
    name: '王昭君',
    title: '落雁出塞',
    role: 'mage',
    roleName: '法师',
    lane: 'mid',
    difficulty: 2,
    lore: '西汉元帝时出塞和亲的王嫱，《汉书》《后汉书》有载。传说她在马上怀抱琵琶，曲声一起，南飞的大雁听得忘了振翅，纷纷落向平沙，于是有了「落雁」之名。',
    tips: '技能每打中一次留下一层「余音」，同一个人叠满三层就会眩晕。先放「回环收弦」把人圈住拉回来，再把大招盖上去。你很脆，站在队友身后弹，别让人近身。',
    attackType: 'ranged',
    radius: 0.58,
    base: { hp: 3100, mana: 520, ad: 150, armor: 80, mr: 50, attackSpeed: 0.85, moveSpeed: 5.5, attackRange: 7.5, hpRegen: 7, manaRegen: 4.2 },
    growth: { hp: 225, mana: 125, ad: 8, armor: 14, mr: 6, attackSpeedPct: 0.01 },
    basicAttack: { windup: 0.3, damageType: 'magic', projectile: 'xingli_basic', projectileSpeed: 24 },
    passive: {
      name: '余音三叠',
      brief: '技能打中同一人三次就眩晕',
      tags: ['control'],
      desc: '技能命中敌人会留下一层余音(持续 5 秒)。叠满 3 层时弦音共振：造成目标 6% 最大生命的法术伤害(对非英雄上限 300)并眩晕 0.75 秒。',
      values: { stacks: 3, duration: 5, hpRatio: 0.06, cap: 300, stun: 0.75 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '一弦穿云',
        brief: '弹出一道音波，穿透一整条线',
        tags: ['burst'],
        desc: '拨动一弦，弹出一道穿透的弦音，对沿途所有敌人造成 {damage}(+{apRatio%}法强) 点法术伤害。',
        maxLevel: 6,
        cooldown: [6.3, 6, 5.7, 5.4, 5.1, 4.8],
        manaCost: [50, 55, 60, 65, 70, 75],
        cast: { type: 'direction', range: 12, width: 1.3 },
        values: { damage: [280, 350, 420, 490, 560, 630], apRatio: 0.55, speed: 26 },
        castTime: 0.2,
      },
      s2: {
        slot: 's2',
        name: '回环收弦',
        brief: '圈住一片，稍后把人拉到中间',
        tags: ['control', 'slow'],
        desc: '在目标位置拨出一圈回旋的曲音，{delay} 秒后收弦：造成 {damage}(+{apRatio%}法强) 点法术伤害，将敌人拉向中心并减速 {slow%}，持续 {slowDur} 秒。',
        maxLevel: 6,
        cooldown: [11, 10.6, 10.2, 9.8, 9.4, 9],
        manaCost: [70, 75, 80, 85, 90, 95],
        cast: { type: 'position', range: 9, radius: 3.4 },
        values: { damage: [260, 325, 390, 455, 520, 585], apRatio: 0.5, delay: 0.6, pull: 1.6, slow: 0.45, slowDur: 2 },
        castTime: 0.25,
      },
      ult: {
        slot: 'ult',
        name: '雁落平沙',
        brief: '雁群一波波俯冲，覆盖一大片',
        tags: ['dot', 'slow'],
        desc: '一曲引得群雁落向目标区域：{duration} 秒内俯冲 {waves} 波雁影，每波对区域内敌人造成 {damage}(+{apRatio%}法强) 点法术伤害并减速 {slow%}。每波都会附加一层余音。',
        maxLevel: 3,
        cooldown: [48, 43, 38],
        manaCost: [120, 130, 140],
        cast: { type: 'position', range: 11, radius: 5.2 },
        values: { damage: [160, 230, 300], apRatio: 0.3, waves: 5, duration: 2.5, delay: 0.5, slow: 0.3, slowDur: 1 },
        castTime: 0.4,
      },
    },
    build: ['boots', 'astral_staff', 'boots_arcane', 'void_crown', 'sage_codex', 'winter_scepter', 'starweave_cloak'],
    // 界面身份色取夜空靛：她的斗篷是绛红，但把红写进 primary 会和程咬金在小地图与头像底上撞色
    palette: { primary: '#3d4c9e', secondary: '#f6f0e6', accent: '#c8324a', glow: '#a9d4ff' },
    look: '出塞的汉家女子：绛红斗篷配一圈蓬松的雪白毛领，头戴白毛帽箍，露出黑色发髻与金步摇；斗篷下是月白曲裾深衣与长绶带；怀里斜抱一把梨形四弦琵琶。神情沉静，施法时弦上泛起月色与金光。',
  },

  // ───────────────────────── 李广 · 射手 ─────────────────────────
  // 出处：《史记·李将军列传》——「猿臂，其善射亦天性也」「中石没镞」「汉之飞将军」；卢纶《塞下曲》；王昌龄「不教胡马度阴山」
  fengling: {
    id: 'fengling',
    name: '李广',
    title: '汉之飞将',
    role: 'marksman',
    roleName: '射手',
    lane: 'bot',
    difficulty: 2,
    lore: '西汉名将，《史记·李将军列传》说他「猿臂善射」。夜里把草中巨石当成猛虎，一箭射去，箭头没进了石头；匈奴人叫他「汉之飞将军」，多年不敢来犯。',
    tips: '站住了不停射箭，越射越快，叠满五层还会加移速和伤害。被近身就用「飞将腾身」翻开，落地后的下一箭必定暴击。大招箭雨能减速一大片，开团、断后都好用。',
    attackType: 'ranged',
    radius: 0.58,
    base: { hp: 2900, mana: 440, ad: 168, armor: 78, mr: 50, attackSpeed: 0.95, moveSpeed: 5.5, attackRange: 8.2, hpRegen: 7, manaRegen: 3 },
    growth: { hp: 205, mana: 100, ad: 13, armor: 14, mr: 6, attackSpeedPct: 0.03 },
    basicAttack: { windup: 0.28, damageType: 'physical', projectile: 'fengling_basic', projectileSpeed: 30 },
    passive: {
      name: '猿臂连射',
      brief: '连续普攻，越射越快越疼',
      tags: ['buff'],
      desc: '普攻命中获得一层连射(最多 5 层，持续 3 秒)，每层提高 6% 攻速。满层时移速提高 10%，且普攻额外造成 20(+每级 4) 点物理伤害。',
      values: { maxStacks: 5, duration: 3, asPerStack: 0.06, haste: 0.1, bonus: 20, bonusPerLevel: 4 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '白羽没石',
        brief: '一支能穿兵的重箭，射中减速',
        tags: ['burst', 'slow'],
        desc: '引满长弓射出一支能没入石棱的重箭，贯穿沿途小兵，命中的第一个敌方英雄受到 {damage}(+{adRatio%}物攻) 点物理伤害并减速 {slow%}，持续 {slowDur} 秒(对沿途小兵/野怪造成 60% 伤害)。',
        maxLevel: 6,
        cooldown: [8, 7.6, 7.2, 6.8, 6.4, 6],
        manaCost: [50, 55, 60, 65, 70, 75],
        cast: { type: 'direction', range: 14, width: 1.3 },
        values: { damage: [280, 350, 420, 490, 560, 630], adRatio: 1.0, slow: 0.3, slowDur: 1.5, speed: 32, minionRatio: 0.6 },
        castTime: 0.3,
      },
      s2: {
        slot: 's2',
        name: '飞将腾身',
        brief: '翻身拉开距离，下一箭必暴击',
        tags: ['dash', 'buff'],
        desc: '向指定方向腾身翻跃，落地后获得 {haste%} 移速加成持续 {hasteDur} 秒，且下一次普攻必定暴击。',
        maxLevel: 6,
        cooldown: [9, 8.5, 8, 7.5, 7, 6.5],
        manaCost: [40, 42, 44, 46, 48, 50],
        cast: { type: 'direction', range: 5, width: 1.2 },
        values: { haste: 0.2, hasteDur: 2, critWindow: 4, dashSpeed: 26 },
        castTime: 0.05,
      },
      ult: {
        slot: 'ult',
        name: '箭锁阴山',
        brief: '箭雨盖住一大片，持续减速',
        tags: ['slow', 'dot'],
        desc: '仰射一簇羽箭，令箭雨封锁目标区域 {duration} 秒：每 {tick} 秒造成 {damage}(+{adRatio%}物攻) 点物理伤害并减速 {slow%}。',
        maxLevel: 3,
        cooldown: [50, 45, 40],
        manaCost: [110, 120, 130],
        cast: { type: 'position', range: 11.5, radius: 5 },
        values: { damage: [95, 140, 185], adRatio: 0.4, duration: 3, tick: 0.5, delay: 0.5, slow: 0.35, slowDur: 0.8 },
        castTime: 0.4,
      },
    },
    build: ['boots', 'sunchaser_bow', 'boots_fury', 'phantom_edge', 'blood_scythe', 'piercing_spear', 'starfall_blade'],
    palette: { primary: '#2f7a78', secondary: '#e9e2cf', accent: '#c99a45', glow: '#9df5d2' },
    look: '高瘦的汉代边将(男)，双臂比常人长：鬓角微霜，头戴插着双鹖尾的武冠；苍青戎服外罩熟皮轻甲，只披左肩，短披风斜搭身后；右腰后一箙白羽箭，手持一张黑漆角弓。站姿沉稳，开弓极满。',
  },

  // ───────────────────────── 荆轲 · 刺客 ─────────────────────────
  // 出处：《史记·刺客列传》《战国策·燕策三》——「风萧萧兮易水寒，壮士一去兮不复还」「图穷而匕首见」「引其匕首以擿秦王」
  // 大招名自拟为「卷尽匕现」(典故原文四字已有别的作品用作同名人物的技能名，避开)
  yeque: {
    id: 'yeque',
    name: '荆轲',
    title: '易水壮士',
    role: 'assassin',
    roleName: '刺客',
    lane: 'jungle',
    difficulty: 3,
    lore: '战国末年的剑客，受燕太子丹之托入秦行刺。《史记·刺客列传》记他易水辞别，献上督亢地图，「图穷而匕首见」。',
    tips: '先在野区打野攒等级，再去各条路抓残血的人。敌人血量低于四成时你打得更疼，拿到击杀或助攻会刷新一、二技能，可以接着追下一个。别第一个冲进人堆：等队友先上，再用大招贴上去收掉脆皮。',
    attackType: 'melee',
    radius: 0.58,
    base: { hp: 3050, mana: 440, ad: 178, armor: 88, mr: 52, attackSpeed: 0.92, moveSpeed: 6.0, attackRange: 2.2, hpRegen: 8, manaRegen: 3 },
    growth: { hp: 250, mana: 100, ad: 13.5, armor: 16, mr: 6.5, attackSpeedPct: 0.022 },
    basicAttack: { windup: 0.3, damageType: 'physical' },
    passive: {
      name: '一去不还',
      brief: '打残血更疼，杀人后刷新技能',
      tags: ['burst'],
      desc: '抱定死志：对生命值低于 40% 的敌人造成的伤害提高 18%。参与击杀英雄后，立即刷新一、二技能冷却并回复 8% 最大生命。对野怪造成的伤害提高 25%。',
      values: { threshold: 0.4, bonus: 0.18, healHpRatio: 0.08, monsterBonus: 0.25 },
    },
    skills: {
      s1: {
        slot: 's1',
        name: '风萧易水',
        brief: '突刺穿过敌人，刺中英雄这招更快转好',
        tags: ['dash'],
        desc: '像一阵寒风向指定方向疾刺穿过，对路径上的敌人造成 {damage}(+{adRatio%}物攻) 点物理伤害。若命中敌方英雄，这一招的冷却立即返还 {refund%}。',
        maxLevel: 6,
        cooldown: [7, 6.7, 6.4, 6.1, 5.8, 5.5],
        manaCost: [40, 44, 48, 52, 56, 60],
        cast: { type: 'direction', range: 6.5, width: 2.0 },
        values: { damage: [200, 255, 310, 365, 420, 475], adRatio: 1.0, refund: 0.4, dashSpeed: 30 },
        castTime: 0.05,
      },
      s2: {
        slot: 's2',
        name: '引匕一掷',
        brief: '扇形丢出三把匕首，命中减速',
        tags: ['slow'],
        desc: '扇形掷出 3 把匕首，每把对命中的第一个敌人造成 {damage}(+{adRatio%}物攻) 点物理伤害并减速 {slow%}，持续 {slowDur} 秒(同一目标被多把命中时，后续匕首只造成 50% 伤害)。',
        maxLevel: 6,
        cooldown: [8, 7.6, 7.2, 6.8, 6.4, 6],
        manaCost: [50, 54, 58, 62, 66, 70],
        cast: { type: 'direction', range: 9, width: 1.0 },
        values: { damage: [165, 210, 255, 300, 345, 390], adRatio: 0.65, slow: 0.35, slowDur: 1.5, blades: 3, spread: 16 * DEG, speed: 26, repeatRatio: 0.5 },
        castTime: 0.15,
      },
      ult: {
        slot: 'ult',
        name: '卷尽匕现',
        brief: '抖开图卷欺近目标，卷尽一匕',
        tags: ['burst', 'dash'],
        desc: '抖开督亢图卷遮住身形(期间不可被选中)，卷尽时人已欺到目标敌方英雄身边，一匕刺出：造成 {damage}(+{adRatio%}物攻) 外加目标 {missingRatio%} 已损生命的物理伤害。',
        maxLevel: 3,
        cooldown: [40, 35, 30],
        manaCost: [100, 105, 110],
        cast: { type: 'target', range: 8 },
        values: { damage: [340, 510, 680], adRatio: 1.2, missingRatio: 0.2, vanish: 0.35 },
        castTime: 0.35,
      },
    },
    build: ['boots', 'starfall_blade', 'boots_arcane', 'piercing_spear', 'phantom_edge', 'blood_scythe', 'starweave_cloak'],
    palette: { primary: '#3a3156', secondary: '#ece8de', accent: '#b48cff', glow: '#a886ff' },
    look: '精瘦冷峻的战国游侠：束发露面，一身近黑的墨紫劲装，束腕绑腿；颈后一条长长的素白巾拖在身后，末端像蘸了墨；背上斜挎一支图卷筒；右手反握一柄淬过药的青钢匕首，左手一把更小的副匕。跑动时身体压低。',
  },
};

/** 「名字 · 职业」，如「王昭君 · 法师」。界面上凡是显示英雄全称的地方都走这里；只要名字时直接用 HeroDef.name */
export function heroFullName(hero: HeroId | HeroDef): string {
  const def = typeof hero === 'string' ? HEROES[hero] : hero;
  return `${def.name} · ${def.roleName}`;
}

/** 技能类型标签的显示文字（固定 8 个；「大招」「被动」由界面按槽位自动加，不在这张表里） */
export const SKILL_TAG_NAME: Record<SkillTag, string> = {
  dash: '位移',
  control: '控制',
  slow: '减速',
  burst: '爆发',
  dot: '持续伤害',
  shield: '护盾',
  heal: '回复',
  buff: '增益',
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

/** 通用技能（所有英雄都有的 回城 / 疗伤 / 闪现；内部槽位名仍是 recall / heal / flash）。brief = 一句大白话 */
export const SUMMONER = {
  recall: { name: '回城', brief: '原地站 5 秒，回泉水补满', desc: '原地站 5 秒后传送回泉水。移动、攻击或受到伤害会打断。', channel: 5, cooldown: 1 },
  heal: { name: '疗伤', brief: '5 秒内回三成血和蓝', desc: '5 秒内持续回复共 30% 最大生命与 30% 最大法力。受到英雄或防御塔伤害会打断。', duration: 5, hpRatio: 0.3, manaRatio: 0.3, cooldown: 60 },
  flash: { name: '闪现', brief: '朝一个方向瞬移一小段', desc: '向指定方向瞬移一小段距离，可穿越薄墙。', range: 5, cooldown: 110 },
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
