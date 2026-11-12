/**
 * 星陨战纪 · 核心契约（THE CONTRACT）
 *
 * 模拟层(core) / 渲染层(render) / 界面层(ui) / 音频层(audio) 之间唯一的共享类型。
 * - 模拟层是纯 TypeScript：不依赖 DOM / three.js，可在 Node 里无头跑完整对局（vitest）。
 * - 渲染/界面/音频层对 GameState **只读**；想改变世界只能通过 World.command()。
 * - 坐标系：模拟平面 (x, y)。x 向东(屏幕右)，y 向南(屏幕下/靠近镜头)。
 *   渲染时映射到 three.js 的 (x, 高度, z=y)。蓝方基地在西南角(-,+)，红方在东北角(+,-)。
 * - 角度 facing：弧度，atan2(dir.y, dir.x)。
 * - 时间单位秒，距离单位「米」(英雄半径约 0.6，移速约 5.5/s，地图 128×128)。
 */

// ───────────────────────────── 基础 ─────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

/** 0 = 蓝方(玩家所在，西南)，1 = 红方(东北) */
export type PlayerTeam = 0 | 1;
/** 2 = 中立(野怪) */
export type TeamId = 0 | 1 | 2;
export const TEAM_BLUE = 0 as const;
export const TEAM_RED = 1 as const;
export const TEAM_NEUTRAL = 2 as const;

export type UnitKind = 'hero' | 'minion' | 'tower' | 'core' | 'monster';
export type LaneId = 'top' | 'mid' | 'bot';
export type RoleLane = LaneId | 'jungle';
export type HeroId = 'panyue' | 'chijin' | 'xingli' | 'fengling' | 'yeque';
export type HeroRole = 'tank' | 'fighter' | 'mage' | 'marksman' | 'assassin';
export type MinionType = 'melee' | 'ranged' | 'siege' | 'super';
export type MonsterType =
  | 'mossback' // 小野怪 · 苔背獾(单只)
  | 'glimwing' // 小野怪 · 荧翅蛾(成对)
  | 'frost_golem' // 蓝buff · 霜晶巨鹿：增益野怪(冷却/回蓝)
  | 'ember_golem' // 红buff · 炽焰巨熊：增益野怪(灼烧/减速)
  | 'abyss_drake' // 河道巨龙 · 深渊鳞龙：河道史诗野怪 A(团队金币经验；会吐息)
  | 'star_colossus'; // 远古巨灵 · 星陨巨灵：河道史诗野怪 B(团队增益)
export type DamageType = 'physical' | 'magic' | 'true';
export type AbilitySlot = 's1' | 's2' | 'ult';
export type SummonerSlot = 'recall' | 'heal' | 'flash';
export type SkillSlot = AbilitySlot | SummonerSlot;
export type Difficulty = 'easy' | 'normal' | 'hard';

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

// ───────────────────────────── 属性 / 增益 ─────────────────────────────

/** 单位当前的最终属性（已含等级成长、装备、增益）。 */
export interface Stats {
  maxHp: number;
  maxMana: number;
  /** 物理攻击 */
  ad: number;
  /** 法术强度 */
  ap: number;
  armor: number;
  /** 法术抗性 */
  mr: number;
  /** 每秒普攻次数 */
  attackSpeed: number;
  /** 米/秒（已含减速/加速） */
  moveSpeed: number;
  attackRange: number;
  /** 每秒 */
  hpRegen: number;
  /** 每秒 */
  manaRegen: number;
  /** 冷却缩减 0..0.4 */
  cdr: number;
  lifesteal: number;
  critChance: number;
  /** 暴击倍率，默认 2.0 */
  critDamage: number;
  /** 护甲穿透百分比 0..1 */
  armorPen: number;
  /** 法术穿透百分比 0..1 */
  magicPen: number;
}

/**
 * 增益/减益标识。渲染层会给部分 id 画持续状态特效（见 SPEC 的「状态特效」表）。
 * value 的含义因 id 而异（例：slow=减速比例 0.3；shield=剩余护盾量；haste=加速比例）。
 */
export type BuffId =
  // 通用控制
  | 'stun' // 眩晕：不能移动/攻击/施法
  | 'airborne' // 击飞：同眩晕，且渲染层把模型抛起
  | 'root' // 定身：不能移动，可攻击/施法
  | 'slow' // 减速：value=比例(取最强一层)
  | 'silence'
  // 通用增益
  | 'shield' // 护盾：value=剩余吸收量
  | 'haste' // 移速加成：value=比例
  | 'attack_speed' // 攻速加成：value=比例
  | 'dmg_reduction' // 减伤：value=比例
  | 'untargetable' // 不可选中、免疫伤害
  | 'unstoppable' // 免疫控制
  | 'burn' // 持续灼烧(红buff 普攻附带)：value=每跳伤害
  // 系统
  | 'recall' // 回城引导中
  | 'restore' // 通用技能「疗伤」持续回复中
  | 'fountain' // 泉水回复
  | 'respawn_guard' // 复活后 2 秒无敌
  // 野区/史诗增益
  | 'frost_insight' // 蓝buff：+20% 冷却缩减、回蓝
  | 'ember_might' // 红buff：普攻附带灼烧+减速
  | 'star_blessing' // 巨灵buff(星陨祝福)：全队 +伤害、回复
  // 英雄专属
  | 'panyue_passive' // 樊哙「覆盾震地」：普攻计数(stacks 0..2)，第三下强化
  | 'panyue_bulwark' // 樊哙 S2「拥盾怒目」持续期间（配合 shield；期间只有护盾，减速只在施放瞬间）
  | 'chijin_ember' // 程咬金「越砍越勇」：技能后下一次普攻强化
  | 'chijin_blaze' // 程咬金 S2「半路杀出」攻速加成期间
  | 'chijin_spin' // 程咬金大招「抡圆了砍」旋转中
  | 'xingli_mark' // 王昭君「余音」(stacks 1..3，挂在敌人身上)
  | 'fengling_gale' // 李广「连射」层数(stacks 1..5)
  | 'fengling_crit' // 李广 S2「飞将腾身」后下一次普攻必暴
  | 'yeque_shadow' // 荆轲「得手」：击杀后一、二技能已刷新的提示(无属性效果)
  | 'tower_focus'; // 被防御塔锁定(连续命中增伤层数)

export interface Buff {
  id: BuffId;
  /** 施加者单位 id（系统增益为 -1） */
  sourceId: number;
  /** 剩余时间（秒）。Infinity = 常驻 */
  timeLeft: number;
  /** 总时长（用于 UI 进度条） */
  duration: number;
  stacks: number;
  value: number;
}

/** 单位当前动作，渲染层据此选择动画。progress = (state.time - animStart) / animDur。 */
export type UnitAnim =
  | 'idle'
  | 'move'
  | 'attack' // 普攻：animDur 为整个出手动作(前摇+后摇)，命中/出弹发生在 ~35% 处
  | 'cast_s1' // 英雄一技能；野怪的特殊攻击也用它(河道巨龙吐息：animDur = 预警 + 喷吐，见 FxKey drake_breath_warn)
  | 'cast_s2'
  | 'cast_ult'
  | 'dash' // 位移途中（前倾冲刺姿态）
  | 'leap' // 跃起落下（渲染层按 progress 画抛物线高度）
  | 'spin' // 持续旋转（程咬金大招）
  | 'channel' // 引导（回城）
  | 'stunned'
  | 'airborne' // 被击飞（渲染层按 progress 画抛起）
  | 'dead';

// ───────────────────────────── 单位 ─────────────────────────────

export interface UnitBase {
  id: number;
  kind: UnitKind;
  team: TeamId;
  /** 当前 tick 位置 */
  pos: Vec2;
  /** 上一 tick 位置（渲染插值用：lerp(prevPos, pos, alpha)）。瞬移时 prevPos = pos。 */
  prevPos: Vec2;
  /** 朝向弧度 atan2(y, x) */
  facing: number;
  /** 碰撞半径 */
  radius: number;
  alive: boolean;
  hp: number;
  mana: number;
  stats: Stats;
  buffs: Buff[];
  /** 所有护盾之和（= shield 类 buff 的 value 之和），血条上画白色段 */
  shield: number;
  anim: UnitAnim;
  /** anim 开始的模拟时间(state.time) */
  animStart: number;
  /** anim 预计时长（秒）；循环动作(idle/move/spin/channel)可为 0 */
  animDur: number;
  /** 当前普攻/锁定目标 id，无则 -1 */
  targetId: number;
  /** [对蓝方可见, 对红方可见]。渲染层只画对玩家队伍可见的敌方单位 */
  visible: [boolean, boolean];
  /** 所在草丛 id（MapData.bushes 的下标），不在草丛为 -1 */
  bushId: number;
  /** 无敌（前一座塔未破时的后一座塔/水晶、复活保护等）：不可被选为目标、不受伤害 */
  invulnerable: boolean;
  /** 最近一次受到伤害的模拟时间（用于受击闪白、脱战判定）；从未受击为 -999 */
  lastHitTime: number;
}

export interface SkillState {
  /** 0 = 未学会 */
  level: number;
  /** 剩余冷却 */
  cd: number;
  /** 本次冷却总长（画转圈用） */
  cdMax: number;
  /** 当前等级法力消耗 */
  cost: number;
}

export interface HeroUnit extends UnitBase {
  kind: 'hero';
  team: PlayerTeam;
  heroId: HeroId;
  /** 显示名（英雄名，敌我同英雄时靠队伍色区分） */
  name: string;
  isPlayer: boolean;
  /** 分路 */
  lane: RoleLane;
  level: number;
  xp: number;
  /** 升到下一级所需经验（满级为 0） */
  xpToNext: number;
  gold: number;
  /** 累计获得金币（经济面板） */
  goldEarned: number;
  kills: number;
  deaths: number;
  assists: number;
  /** 补刀数（小兵+野怪） */
  cs: number;
  /** 当前连杀数（死亡清零） */
  streak: number;
  skills: Record<SkillSlot, SkillState>;
  /** 装备栏，固定 6 格 */
  items: (ItemId | null)[];
  /** 复活剩余时间；存活时为 0 */
  respawnIn: number;
  /** 累计对英雄伤害 / 承受伤害 / 对塔伤害（结算面板） */
  dmgDealt: number;
  dmgTaken: number;
  dmgTower: number;
  /** 最近是否在战斗中（5 秒内对英雄造成或受到英雄/塔伤害） */
  inCombat: boolean;
  /**
   * 本局自动出装是否生效（界面只读；用 PlayerCommand 'autoBuy' 切换）。
   * 初值：玩家英雄取 MatchConfig.autoBuy，其余英雄恒为 false(Bot 自己买)。
   * 玩家卖出一件推荐装备时模拟层会把它置为 false(否则马上又原价买回来)。
   */
  autoBuy?: boolean;
}

export interface MinionUnit extends UnitBase {
  kind: 'minion';
  team: PlayerTeam;
  minionType: MinionType;
  lane: LaneId;
}

export interface TowerUnit extends UnitBase {
  kind: 'tower';
  team: PlayerTeam;
  lane: LaneId;
  /** 1 = 一塔，2 = 二塔，3 = 高地塔 */
  tier: 1 | 2 | 3;
}

export interface CoreUnit extends UnitBase {
  kind: 'core';
  team: PlayerTeam;
}

export interface MonsterUnit extends UnitBase {
  kind: 'monster';
  team: 2;
  monsterType: MonsterType;
  campId: number;
}

export type Unit = HeroUnit | MinionUnit | TowerUnit | CoreUnit | MonsterUnit;

// ───────────────────────────── 投射物 / 区域效果 ─────────────────────────────

/** 投射物外观键。渲染层按键画模型/拖尾，并在 projectileHit / projectileEnd 事件处画命中特效。 */
export type ProjectileVisual =
  | 'xingli_basic' // 王昭君普攻：小月牙音波
  | 'xingli_s1' // 一弦穿云：穿透的弦音音波
  | 'fengling_basic' // 李广普攻：箭矢
  | 'fengling_s1' // 白羽没石：重箭(贯穿小兵)
  | 'yeque_s2' // 引匕一掷：直飞的匕首
  | 'minion_ranged' // 远程兵的能量弹（按 team 着色）
  | 'minion_siege' // 攻城兵的炮弹（抛物线）
  | 'tower_bolt' // 防御塔光弹（按 team 着色，追踪）
  | 'core_bolt' // 水晶光弹
  | 'monster_spit'; // 远程小野怪(荧翅蛾)的磷粉弹

export interface Projectile {
  id: number;
  visual: ProjectileVisual;
  team: TeamId;
  ownerId: number;
  pos: Vec2;
  prevPos: Vec2;
  /** 单位方向向量 */
  dir: Vec2;
  speed: number;
  radius: number;
  /** 追踪目标 id（普攻/塔弹）；直线技能为 -1 */
  targetId: number;
  /** 已飞行距离 / 最大射程（追踪弹 maxRange 可为 0） */
  traveled: number;
  maxRange: number;
}

/** 区域效果外观键（持续存在一段时间的地面/跟随特效）。 */
export type AreaVisual =
  | 'telegraph' // 通用预警圈（延迟技能落地前，敌我都可见）
  | 'panyue_s2_aura' // 拥盾怒目：跟随自身的护盾光环
  | 'panyue_ult_fissure' // 死且不避落地后的震裂减速场
  | 'chijin_ult_spin' // 抡圆了砍：跟随自身的斧影旋风
  | 'xingli_s2_well' // 回环收弦：延迟后收束
  | 'xingli_ult_storm' // 雁落平沙：雁影分波俯冲的区域
  | 'fengling_ult_rain' // 箭锁阴山：持续箭雨
  | 'fountain_zone'; // 泉水（常驻，可由渲染层直接按地图画，不必依赖此项）

export interface AreaEffect {
  id: number;
  visual: AreaVisual;
  team: TeamId;
  ownerId: number;
  /** 中心。followUnitId >= 0 时每 tick 跟随该单位 */
  pos: Vec2;
  radius: number;
  /** 已存在时间 / 总时长 */
  age: number;
  duration: number;
  followUnitId: number;
}

// ───────────────────────────── 事件 ─────────────────────────────

/**
 * 一次性特效键（由 fx 事件触发）。pos 为主位置；有 from/to 的见各键说明。
 * 渲染层为每个键做粒子/光效，音频层为每个键配音效。
 */
export type FxKey =
  // 通用
  | 'hit_physical' // 物理命中火花 @pos
  | 'hit_magic' // 法术命中星屑 @pos
  | 'hit_crit' // 暴击重击 @pos
  | 'hit_tower' // 塔弹命中 @pos
  | 'heal' // 治疗绿光 @unit
  | 'shield_break' // 护盾破碎 @unit
  | 'level_up' // 升级光柱 @unit
  | 'respawn' // 复活光柱 @pos
  | 'recall_start' // 回城引导开始 @unit（持续光环由 buff 'recall' 驱动）
  | 'recall_done' // 回城传送完成 @pos(泉水)
  | 'flash' // 闪现：from 起点 → to 终点
  | 'gold_gain' // 补刀金币 @pos，value=金额
  | 'tower_destroyed' // 防御塔爆炸坍塌 @pos
  | 'core_destroyed' // 水晶爆炸 @pos
  | 'monster_slain' // 野怪倒地 @pos
  | 'buff_gain' // 获得野区增益 @unit
  // 河道巨龙吐息(野怪特殊攻击；team 恒为 2，敌我都可见)。两个键字段相同：
  //   unitId = 巨龙, pos = 扇形顶点(巨龙位置), dir = 扇形朝向(单位向量，起手时锁定、之后不变), radius = 7.5, angle = 全角(弧度，约 1.047)
  //   吐息全程巨龙原地不动，unit.anim = 'cast_s1'(animStart = 预警开始，animDur = 预警 + 喷吐)；数值见 data/units.ts 的 MONSTER_RULES.breath*
  | 'drake_breath_warn' // 吐息预警开始 @pos, dir, radius, angle；value = 预警秒数(之后紧接喷吐)；targetId = 起手时的仇恨目标
  | 'drake_breath' // 吐息喷吐开始 @pos, dir, radius, angle；value = 喷吐秒数(期间分几跳结算范围法术伤害，第一跳就在此刻)
  // 樊哙(panyue)
  | 'panyue_passive_hit' // 覆盾震地：第三击盾砸地 @target
  | 'panyue_s1_dash' // 侧盾闯帐起步尘土 @pos, dir
  | 'panyue_s1_impact' // 冲撞终点震击 @pos, radius
  | 'panyue_s2_cast' // 拥盾怒目：盾影与震慑环 @unit, radius
  | 'panyue_ult_leap' // 死且不避起跳 from → to
  | 'panyue_ult_land' // 落地砸地 @pos, radius
  // 程咬金(chijin)
  | 'chijin_passive_hit' // 越砍越勇：强化重斧 @target
  | 'chijin_s1_slash' // 拦腰一斧：扇形斧弧 @pos, dir, radius, angle
  | 'chijin_s2_dash' // 半路杀出 from → to（斧影残痕）
  | 'chijin_ult_start' // 抡圆了砍起手 @unit
  | 'chijin_ult_tick' // 每跳斧环 @pos, radius
  // 王昭君(xingli)
  | 'xingli_passive_burst' // 余音三叠：三层引爆 @target
  | 'xingli_s1_cast' // 一弦穿云出手 @pos, dir
  | 'xingli_s2_burst' // 回环收弦收束爆发 @pos, radius
  | 'xingli_ult_cast' // 雁落平沙起手 @unit
  | 'xingli_meteor' // 单只雁影俯冲落地 @pos, radius
  // 李广(fengling)
  | 'fengling_s1_cast' // 白羽没石出手 @pos, dir
  | 'fengling_s2_dash' // 飞将腾身 from → to（残痕）
  | 'fengling_ult_cast' // 箭锁阴山：仰射 @unit
  | 'fengling_ult_tick' // 一波箭雨落地 @pos, radius
  // 荆轲(yeque)
  | 'yeque_s1_dash' // 风萧易水 from → to（墨痕）
  | 'yeque_s2_cast' // 引匕一掷：掷出匕首 @pos, dir
  | 'yeque_ult_vanish' // 图穷匕见：隐去身形 @pos(原地墨渍)，targetId = 目标
  | 'yeque_ult_strike'; // 背后一匕 @target, from → to

export type AnnounceKey =
  | 'match_start' // 「对战开始」
  | 'minions_spawn' // 「小兵出发」
  | 'first_blood' // 首杀
  | 'double_kill'
  | 'triple_kill'
  | 'quadra_kill'
  | 'penta_kill'
  | 'killing_spree' // 连杀 3
  | 'unstoppable' // 连杀 5
  | 'legendary' // 连杀 7+
  | 'shutdown' // 终结
  | 'ace' // 团灭
  | 'tower_destroyed'
  | 'epic_spawn' // 史诗野怪(河道巨龙 / 远古巨灵)刷新
  | 'epic_slain' // 史诗野怪被击杀
  | 'super_minions' // 超级兵出击
  | 'victory'
  | 'defeat';

export type GameEvent =
  /** 普攻出手（近战挥砍/远程出弹前摇开始） */
  | { type: 'attack'; unitId: number; targetId: number }
  /** 伤害结算（amount 为实际扣血+扣盾量） */
  | {
      type: 'damage';
      targetId: number;
      sourceId: number;
      amount: number;
      dtype: DamageType;
      crit: boolean;
      pos: Vec2;
      /** 是否来自技能（否则为普攻/塔/小兵） */
      skill: boolean;
    }
  | { type: 'heal'; targetId: number; amount: number; pos: Vec2 }
  /** 技能施放（英雄主动技能 + 通用技能 回城/疗伤/闪现）。渲染层播放施法动作特效，音频层配音 */
  | {
      type: 'skillCast';
      unitId: number;
      heroId: HeroId;
      slot: SkillSlot;
      pos: Vec2;
      dir: Vec2;
      /** 指向型/范围型的落点（无则等于 pos） */
      targetPos: Vec2;
      targetId: number;
    }
  /** 一次性特效 */
  | {
      type: 'fx';
      key: FxKey;
      pos: Vec2;
      team: TeamId;
      unitId?: number;
      targetId?: number;
      dir?: Vec2;
      from?: Vec2;
      to?: Vec2;
      radius?: number;
      /** 扇形全角（弧度） */
      angle?: number;
      value?: number;
    }
  | { type: 'projectileSpawn'; id: number; visual: ProjectileVisual; pos: Vec2; ownerId: number }
  /** 投射物命中单位（穿透弹可多次触发） */
  | { type: 'projectileHit'; id: number; visual: ProjectileVisual; pos: Vec2; targetId: number }
  /** 投射物消失（到达射程/命中后销毁） */
  | { type: 'projectileEnd'; id: number; visual: ProjectileVisual; pos: Vec2 }
  | { type: 'areaSpawn'; id: number; visual: AreaVisual; pos: Vec2; radius: number; duration: number }
  | { type: 'areaEnd'; id: number; visual: AreaVisual; pos: Vec2 }
  /** 任意单位死亡（英雄/小兵/野怪/塔/水晶） */
  | {
      type: 'death';
      unitId: number;
      kind: UnitKind;
      team: TeamId;
      killerId: number;
      pos: Vec2;
    }
  /** 英雄被击杀（击杀播报 + 战报）。killerId 可能是非英雄(塔/小兵)，此时 killerHeroId 为 null */
  | {
      type: 'heroKill';
      victimId: number;
      killerId: number;
      assistIds: number[];
      /** 连续击杀计数（2=双杀…5=五杀），在 10 秒窗口内累计 */
      multiKill: number;
      /** 击杀者当前连杀数 */
      streak: number;
      firstBlood: boolean;
      /** 终结了对方的连杀（对方 streak >= 3） */
      shutdown: boolean;
      bounty: number;
    }
  | { type: 'levelUp'; unitId: number; level: number }
  | { type: 'respawn'; unitId: number; pos: Vec2 }
  | { type: 'gold'; unitId: number; amount: number; pos: Vec2; reason: 'lasthit' | 'kill' | 'assist' | 'tower' | 'monster' | 'passive' }
  /** 购买成功。auto = true 表示由自动出装买入(界面提示「已自动购买」，音效可压低)；手动购买不带该字段 */
  | { type: 'itemBought'; unitId: number; itemId: ItemId; auto?: boolean }
  | { type: 'towerDestroyed'; unitId: number; team: PlayerTeam; lane: LaneId; tier: 1 | 2 | 3; pos: Vec2 }
  | { type: 'waveSpawn'; wave: number }
  | { type: 'monsterSpawn'; campId: number; monsterType: MonsterType; pos: Vec2 }
  /** 史诗野怪被某队击杀 */
  | { type: 'epicSlain'; monsterType: MonsterType; team: PlayerTeam; pos: Vec2 }
  /** 全屏播报。team = 触发方队伍（界面按敌我着色），heroId 为相关英雄 */
  | { type: 'announce'; key: AnnounceKey; team: TeamId; unitId?: number; victimId?: number }
  /** 命令被拒绝的提示（仅玩家）：法力不足、冷却中、被控制… */
  | { type: 'reject'; unitId: number; reason: 'cooldown' | 'mana' | 'disabled' | 'no_target' | 'gold' | 'full' }
  | { type: 'gameOver'; winner: PlayerTeam };

// ───────────────────────────── 命令 ─────────────────────────────

/**
 * 玩家/Bot 对自己英雄下达的命令。Bot 与玩家走同一入口（不作弊）。
 * - move：摇杆/WASD 方向（零向量 = 停止）。持续生效直到下一条 move/moveTo/stop。
 * - moveTo：点地板寻路移动。
 * - attack：按下普攻键。targetId 省略时由模拟层智能选目标（优先射程内英雄→残血小兵→塔→野怪；
 *   近处无目标则朝最近敌人走过去）。
 * - cast：施放技能。dir/pos/targetId 省略时模拟层自动瞄准（轻点施放）。
 *   dir 用于方向型，pos 用于范围型，targetId 用于指向型。
 * - buy / sell / autoBuy：买卖与自动出装开关，阵亡时也可以下达。
 * - autoBuy：切换本局自动出装(HeroUnit.autoBuy)。开启后每 0.5 秒检查一次，金币够就买推荐出装的下一件
 *   (见 core/build.ts 的 nextBuildItem)；栏位满时暂停、不会代卖；卖出推荐装备会自动关闭。
 */
export type PlayerCommand =
  | { type: 'move'; dir: Vec2 }
  | { type: 'moveTo'; pos: Vec2 }
  | { type: 'stop' }
  | { type: 'attack'; targetId?: number }
  | { type: 'cast'; slot: SkillSlot; dir?: Vec2; pos?: Vec2; targetId?: number }
  | { type: 'buy'; itemId: ItemId }
  | { type: 'sell'; index: number }
  | { type: 'autoBuy'; enabled: boolean };

// ───────────────────────────── 地图 ─────────────────────────────

export type Polygon = Vec2[];

export interface TowerSpot {
  team: PlayerTeam;
  lane: LaneId;
  tier: 1 | 2 | 3;
  pos: Vec2;
}

export interface CampDef {
  id: number;
  /** 0/1 = 位于蓝/红方野区，2 = 河道中立 */
  side: TeamId;
  monsterType: MonsterType;
  /** 营地中心（野怪脱战回归点） */
  pos: Vec2;
  /** 每只野怪相对中心的偏移 */
  spawns: Vec2[];
  /** 首次刷新时间 / 被清后重生间隔（秒） */
  firstSpawn: number;
  respawn: number;
}

export interface BaseDef {
  team: PlayerTeam;
  /** 水晶位置 */
  core: Vec2;
  /** 泉水中心（出生/复活/回城点）与半径（范围内快速回复，敌人进入受泉水打击） */
  fountain: Vec2;
  fountainRadius: number;
  /** 5 个英雄出生点 */
  spawns: Vec2[];
  /** 每条路的小兵出生点 */
  minionSpawn: Record<LaneId, Vec2>;
  /** 基地范围多边形（渲染层铺地台用） */
  area: Polygon;
}

export interface MapData {
  /** 可行走范围半边长：|x|,|y| <= bound */
  bound: number;
  /** 地图总半边长（含不可走的边缘装饰带） */
  half: number;
  /** 兵线路点：从蓝方基地到红方基地。红方小兵反向走 */
  lanes: Record<LaneId, Vec2[]>;
  /** 兵线宽度（渲染层铺石板路用） */
  laneWidth: number;
  bases: [BaseDef, BaseDef];
  towers: TowerSpot[];
  /** 不可通行的地形块（山岩/密林），简单多边形 */
  walls: Polygon[];
  /** 草丛（可通行、遮蔽视野），下标即 bushId */
  bushes: Polygon[];
  camps: CampDef[];
  /** 河道中心线（西北 → 东南）与宽度 */
  river: Vec2[];
  riverWidth: number;
}

// ───────────────────────────── 对局状态 ─────────────────────────────

export interface TeamState {
  kills: number;
  towersDestroyed: number;
  /** 全队累计金币 */
  gold: number;
  /** 史诗增益「巨灵buff(星陨祝福)」剩余时间 */
  blessingLeft: number;
}

export interface CampState {
  campId: number;
  alive: boolean;
  /** 距下次刷新的时间；存活时为 0 */
  respawnIn: number;
}

export interface MatchConfig {
  seed: number;
  playerHero: HeroId;
  difficulty: Difficulty;
  /** 测试用：true 时玩家英雄也由 AI 控制（无头对局/演示模式） */
  autoPlay?: boolean;
  /** 玩家英雄的自动出装初值（HeroUnit.autoBuy）。缺省 false：老调用方行为不变 */
  autoBuy?: boolean;
}

export interface GameState {
  /** 模拟时间（秒） */
  time: number;
  tick: number;
  config: MatchConfig;
  map: MapData;
  /** 所有在场单位（含等待复活的英雄 alive=false；死亡的小兵/野怪/塔会在死亡事件后移除，塔的废墟由渲染层保留） */
  units: Unit[];
  /** 10 名英雄，固定顺序：下标 0-4 蓝方，5-9 红方 */
  heroes: HeroUnit[];
  projectiles: Projectile[];
  areas: AreaEffect[];
  teams: [TeamState, TeamState];
  camps: CampState[];
  /** 玩家英雄的单位 id */
  playerId: number;
  /** 距下一波兵的时间 */
  nextWaveIn: number;
  wave: number;
  over: boolean;
  winner: PlayerTeam | null;
  /**
   * 对局分出胜负(水晶被毁)那一 tick 的模拟时间；未结束时为 undefined。
   * 结束后 time/tick 仍会继续推进(供渲染层播放结束演出)，结算页的「对局时长」应读这个字段。
   */
  endTime?: number;
}

export interface World {
  readonly state: GameState;
  /** 推进一个固定 tick（TICK_DT） */
  step(): void;
  /** 对指定英雄下达命令（玩家或 Bot） */
  command(heroUnitId: number, cmd: PlayerCommand): void;
  /** 取走自上次调用以来产生的全部事件 */
  drainEvents(): GameEvent[];
  /** 按 id 查单位（已移除返回 undefined） */
  getUnit(id: number): Unit | undefined;
}

// ───────────────────────────── 数据定义（英雄/装备） ─────────────────────────────

/** 17 件：鞋 4(基础鞋 + 3 双进阶鞋) / 攻击 5 / 法术 4 / 防御 4。没有合成树，也没有小件 */
export type ItemId =
  | 'boots'
  | 'boots_guard'
  | 'boots_arcane'
  | 'boots_fury'
  | 'starfall_blade'
  | 'sunchaser_bow'
  | 'blood_scythe'
  | 'piercing_spear'
  | 'phantom_edge'
  | 'astral_staff'
  | 'void_crown'
  | 'winter_scepter'
  | 'sage_codex'
  | 'guardian_plate'
  | 'starweave_cloak'
  | 'undying_heart'
  | 'thorn_mail';

/** 装备/成长提供的属性加成（全部可选，叠加方式见各字段注释） */
export interface StatMods {
  hp?: number;
  mana?: number;
  ad?: number;
  ap?: number;
  armor?: number;
  mr?: number;
  /** 攻速加成比例：0.25 = +25%（乘在基础攻速上） */
  attackSpeedPct?: number;
  /** 移速固定值（米/秒） */
  moveSpeed?: number;
  /** 冷却缩减（相加，上限 0.4） */
  cdr?: number;
  lifesteal?: number;
  critChance?: number;
  /** 暴击倍率额外加成（加在 2.0 上） */
  critDamage?: number;
  armorPen?: number;
  magicPen?: number;
  hpRegen?: number;
  manaRegen?: number;
  /** 法术强度百分比加成 */
  apPct?: number;
}

export type ItemPassiveId =
  | 'onhit_magic' // 普攻附带法术伤害
  | 'thorns' // 受普攻时反弹法术伤害
  | 'spell_slow' // 技能伤害附带减速
  | 'regen_ooc' // 脱战快速回血
  | 'cripple_aura' // 攻击者被降低攻速
  | 'execute_bonus' // 对低血量目标增伤
  | 'spell_shield'; // 低血时获得一次法术护盾

export interface ItemDef {
  id: ItemId;
  name: string;
  category: 'attack' | 'magic' | 'defense' | 'boots';
  /** 1 = 基础鞋，2 = 其它(进阶鞋与全部成装) */
  tier: 1 | 2;
  /** 一句大白话简介(≤16 字，不带数值)：卡片与浮层里紧跟名字显示 */
  brief?: string;
  cost: number;
  stats: StatMods;
  passive?: { id: ItemPassiveId; name: string; desc: string; value: number; value2?: number };
  /** 图标主色（界面层画程序化图标用） */
  color: string;
}

/** 技能施放方式（界面层据此画瞄准指示器；模拟层据此解析命令） */
export type CastSpec =
  /** 方向型：沿 dir 的直线/冲刺。width 为判定宽度 */
  | { type: 'direction'; range: number; width: number }
  /** 扇形：以自身为顶点、朝 dir 展开 */
  | { type: 'cone'; range: number; angle: number }
  /** 范围型：在 range 内选落点，半径 radius */
  | { type: 'position'; range: number; radius: number }
  /** 指向型：选择 range 内一个敌方英雄 */
  | { type: 'target'; range: number }
  /** 自身周围：立即施放，radius 为影响半径（0 = 仅自身） */
  | { type: 'self'; radius: number };

/**
 * 技能类型标签(固定 8 个，界面显示文字见 data/heroes.ts 的 SKILL_TAG_NAME)：
 * dash 位移 / control 控制(眩晕、击飞、拉拽等硬控) / slow 减速 / burst 爆发 / dot 持续伤害 / shield 护盾 / heal 回复 / buff 增益。
 * 「大招」「被动」不在词表里：界面按槽位自动加。
 */
export type SkillTag = 'dash' | 'control' | 'slow' | 'burst' | 'dot' | 'shield' | 'heal' | 'buff';

export interface SkillDef {
  slot: AbilitySlot;
  name: string;
  /** 一句大白话(≤18 字，不带数值、不带 {占位符})：技能浮层与选英雄页先显示它，再显示 desc */
  brief?: string;
  /** 1~2 个类型标签，最重要的放第一个(技能键角标取第一个) */
  tags?: SkillTag[];
  /** 描述模板：{key} 替换为 values[key] 当前等级数值；{key%} 以百分比显示 */
  desc: string;
  maxLevel: number;
  /** 各等级冷却（秒），长度 = maxLevel */
  cooldown: number[];
  /** 各等级法力消耗 */
  manaCost: number[];
  cast: CastSpec;
  /** 技能数值。数组 = 随技能等级变化(长度 maxLevel)，单值 = 固定 */
  values: Record<string, number | number[]>;
  /** 施法动作时长（秒）：期间英雄做 cast_* 动画 */
  castTime: number;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  role: HeroRole;
  roleName: string;
  lane: RoleLane;
  /** 上手难度 1..3 */
  difficulty: 1 | 2 | 3;
  /** 一句话背景 */
  lore: string;
  /** 玩法提示 */
  tips: string;
  attackType: 'melee' | 'ranged';
  radius: number;
  /** 1 级基础属性 */
  base: {
    hp: number;
    mana: number;
    ad: number;
    armor: number;
    mr: number;
    attackSpeed: number;
    moveSpeed: number;
    attackRange: number;
    hpRegen: number;
    manaRegen: number;
  };
  /** 每级成长 */
  growth: {
    hp: number;
    mana: number;
    ad: number;
    armor: number;
    mr: number;
    /** 每级攻速加成比例 */
    attackSpeedPct: number;
  };
  basicAttack: {
    /** 前摇占整个攻击间隔的比例 */
    windup: number;
    damageType: DamageType;
    /** 远程英雄的弹道 */
    projectile?: ProjectileVisual;
    projectileSpeed?: number;
  };
  passive: { name: string; desc: string; values: Record<string, number>; brief?: string; tags?: SkillTag[] };
  skills: Record<AbilitySlot, SkillDef>;
  /** 推荐出装顺序（Bot 照此购买；玩家的「一键购买」也按此推荐） */
  build: ItemId[];
  /** 界面身份色（十六进制 #rrggbb）：主体 / 辅色 / 点缀 / 技能辉光。头像底、小地图点、图标底用；模型用色以各模型文件为准 */
  palette: { primary: string; secondary: string; accent: string; glow: string };
  /** 美术设定描述（给渲染层建模用） */
  look: string;
}
