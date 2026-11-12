/**
 * 模拟层内部类型：契约(types.ts)里的单位/弹道/区域对象在这里被附加上「运行时字段」。
 *
 * state.units / state.projectiles / state.areas 里放的就是这些内部对象本身(结构上兼容契约类型)，
 * 渲染/界面层只读取契约字段；模拟层各模块通过 unit.rt / hero.h 等访问隐藏状态。
 * 本文件只有类型与常量，不依赖任何玩法模块，可被任何模块安全 import。
 */
import type { BotController, ConeHazard } from './ai/types';
import type {
  AreaEffect, Buff, CampDef, CoreUnit, DamageType, HeroDef, HeroUnit, MinionUnit, MonsterUnit, PlayerCommand, Projectile,
  ProjectileVisual, SkillSlot, Stats, TowerUnit, UnitAnim, Vec2,
} from './types';
import type { Sim } from './world';

// ───────────────────────────── Buff ─────────────────────────────

export type BuffFn = (sim: Sim, unit: SimUnit, buff: SimBuff) => void;

export interface SimBuff extends Buff {
  /** 合并键：同一单位上 (id, key) 相同的 buff 会合并，不同 key 并存 */
  key: string;
  maxStacks: number;
  /** 最近一次施加/刷新的模拟时间 */
  startTime: number;
  /** 周期回调间隔（0 = 无） */
  tickInterval: number;
  tickLeft: number;
  onTick: BuffFn | null;
  /** 自然到期时调用（被驱散/死亡清除时不调用） */
  onExpire: BuffFn | null;
  /** 以任何方式移除时调用（在 onExpire 之后） */
  onRemove: BuffFn | null;
}

// ───────────────────────────── 位移 ─────────────────────────────

export type UnitFilter = (u: SimUnit) => boolean;

/** 位移结束原因：到达 / 撞墙 / 途中命中回调要求停下 / 被控制或死亡打断 */
export type DashEndReason = 'arrived' | 'wall' | 'hit' | 'interrupted';

export interface DashState {
  /** dash = 沿方向冲刺；leap = 按时间插值跃向落点(无视地形)；forced = 被拉/被击退 */
  mode: 'dash' | 'leap' | 'forced';
  dirX: number;
  dirY: number;
  speed: number;
  /** 剩余距离（dash/forced） */
  left: number;
  // leap 专用
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  /** 预计总时长（动画时长；leap 的插值时长） */
  dur: number;
  startTime: number;
  ignoreWalls: boolean;
  /** 途中命中判定半径（<0 = 不判定） */
  hitRadius: number;
  filter: UnitFilter | null;
  hitIds: number[];
  /** 途中碰到单位时调用；返回 true = 立即停下 */
  onHit: ((target: SimUnit) => boolean | void) | null;
  onEnd: ((reason: DashEndReason) => void) | null;
  anim: UnitAnim | null;
}

// ───────────────────────────── 单位运行时 ─────────────────────────────

export const MOVE_NONE = 0;
export const MOVE_DIR = 1;
export const MOVE_PATH = 2;
export type MoveMode = typeof MOVE_NONE | typeof MOVE_DIR | typeof MOVE_PATH;

/** 普攻形态（出生时确定） */
export interface AttackProfile {
  /** 前摇占出手动作(animDur)的比例 */
  windup: number;
  dtype: DamageType;
  /** null = 近战 */
  visual: ProjectileVisual | null;
  projSpeed: number;
  /** 对建筑 / 对小兵的伤害倍率 */
  vsStructure: number;
  vsMinion: number;
}

export interface UnitRt {
  /** 地形碰撞半径（大体型单位取上限，避免在野区卡住） */
  navR: number;
  /** 软分离权重；0 = 不可被推动（建筑、史诗野怪） */
  weight: number;
  /** 视野半径 */
  sight: number;
  /** 基础属性：英雄=当前等级裸属性；其他=出生时(含成长)属性 */
  base: Stats;
  atk: AttackProfile;

  // —— 状态缓存（buff 变化时由 refreshFlags 刷新）——
  /** 眩晕或击飞：不能移动/攻击/施法 */
  stunned: boolean;
  rooted: boolean;
  silenced: boolean;
  untargetable: boolean;
  unstoppable: boolean;
  /** 免疫减速（由特定 buff 提供，如程咬金旋斧；不影响其他控制） */
  slowImmune: boolean;
  airborne: SimBuff | null;

  // —— 移动 ——
  moveMode: MoveMode;
  dirX: number;
  dirY: number;
  path: Vec2[] | null;
  pathIdx: number;
  /** 当前路径的目的地、规划时间 */
  goalX: number;
  goalY: number;
  pathTime: number;
  /** 连续「想走却没走动」的时间，用于触发重新寻路 */
  stuck: number;
  /** 本 tick 是否发生了自主移动（决定 move/idle 动画） */
  moved: boolean;
  pushX: number;
  pushY: number;
  dash: DashState | null;

  // —— 普攻 ——
  /** 距下一次可出手的剩余时间 */
  atkCd: number;
  /** >0 表示正处于前摇 */
  windupLeft: number;
  windupTarget: number;
  /** 在此时间之前不能开始普攻（缴械：如旋转大招期间） */
  disarmUntil: number;

  // —— 动作(动画)与动作锁 ——
  /** 在此时间之前不能移动/普攻/施法（施法动作中） */
  lockUntil: number;
  act: UnitAnim | null;
  actStart: number;
  actDur: number;
  actUntil: number;
  /** 移动是否会打断该动作动画（普攻/施法后摇=是；旋转/引导=否） */
  actMoveCancel: boolean;

  // —— 仇恨 / 视野 ——
  /** 最近一次对敌方英雄造成伤害的时间与对象（塔/小兵的「呼救」优先级用） */
  hitHeroTime: number;
  hitHeroId: number;
  /** 草丛中出手后的暴露截止时间 */
  revealUntil: number;
  lastAttackerId: number;
  /** AI 下次思考时间（小兵/塔/野怪错峰） */
  thinkAt: number;
  /** 建筑专用：附近没有敌方小兵 → 受到伤害减免（防偷塔） */
  backdoor: boolean;
}

export type CastCommand = Extract<PlayerCommand, { type: 'cast' }>;

/** 属性累加器：装备/buff/被动钩子往里加，最后由 stats.ts 合成最终属性 */
export interface StatAcc {
  hp: number;
  mana: number;
  ad: number;
  ap: number;
  apPct: number;
  armor: number;
  mr: number;
  /** 攻速加成比例之和（乘在基础攻速上） */
  asPct: number;
  /** 移速固定加成 / 比例加成 */
  moveFlat: number;
  movePct: number;
  /** 最强的一层减速比例 */
  slow: number;
  /** 减速抗性 0..1（1 = 免疫减速） */
  slowResist: number;
  cdr: number;
  lifesteal: number;
  crit: number;
  critDmg: number;
  armorPen: number;
  magicPen: number;
  hpRegen: number;
  manaRegen: number;
  /** 物攻 / 最大生命 比例加成 */
  adPct: number;
  hpPct: number;
}

export type DamageKind =
  | 'basic' // 普攻主体伤害：触发吸血、onBasicAttackHit、荆棘等
  | 'skill' // 技能伤害：触发 onSkillHit
  | 'proc' // 被动/装备附带伤害：不再触发任何钩子(防递归)
  | 'dot' // 持续伤害
  | 'env'; // 环境(泉水)

/** 一次伤害的可变描述，钩子可就地修改 amount */
export interface DamageInfo {
  /** 减免前的原始伤害 */
  amount: number;
  dtype: DamageType;
  kind: DamageKind;
  slot: SkillSlot | null;
  crit: boolean;
}

/** 英雄一次普攻的修正量，由 modifyBasicAttack 钩子填写 */
export interface BasicAttackMod {
  /** 主体伤害倍率（乘在物攻上） */
  mult: number;
  /** 与普攻同类型的附加固定伤害（并入主体，可暴击之外另加） */
  bonus: number;
  /** 额外的独立伤害段（按各自类型结算，kind='proc'） */
  bonusPhysical: number;
  bonusMagic: number;
  bonusTrue: number;
  forceCrit: boolean;
  noCrit: boolean;
}

/**
 * 英雄钩子：英雄被动与装备被动都实现成一组钩子，引擎在对应时机调用。
 * 所有钩子可选。钩子里造成伤害请用 kind='proc'，否则可能递归触发。
 */
export interface HeroHooks {
  /** 出生 / 复活后 */
  onSpawn?(sim: Sim, hero: SimHero): void;
  /** 每 tick（存活时） */
  onTick?(sim: Sim, hero: SimHero, dt: number): void;
  /** 属性重算时追加加成（如按 buff 层数加攻速）。只允许读 hero.level/items/buffs，不要读 hero.stats */
  statMods?(sim: Sim, hero: SimHero, acc: StatAcc): void;
  /** 普攻出手(前摇开始) */
  onBasicAttackStart?(sim: Sim, hero: SimHero, target: SimUnit): void;
  /** 普攻结算前修正本次普攻 */
  modifyBasicAttack?(sim: Sim, hero: SimHero, target: SimUnit, mod: BasicAttackMod): void;
  /** 普攻命中结算后。dealt = 主体伤害的实际值 */
  onBasicAttackHit?(sim: Sim, hero: SimHero, target: SimUnit, dealt: number, crit: boolean): void;
  /** 成功施放技能(含通用技能)后、技能脚本执行前 */
  onSkillCast?(sim: Sim, hero: SimHero, slot: SkillSlot): void;
  /** 技能伤害(kind='skill')命中后 */
  onSkillHit?(sim: Sim, hero: SimHero, target: SimUnit, dealt: number, info: DamageInfo): void;
  /** 造成伤害前修正(乘区)：就地改 info.amount */
  modifyDamageDealt?(sim: Sim, hero: SimHero, target: SimUnit, info: DamageInfo): void;
  /** 受到伤害前修正：就地改 info.amount */
  modifyDamageTaken?(sim: Sim, hero: SimHero, source: SimUnit | null, info: DamageInfo): void;
  /** 受到伤害后（dealt 含被护盾吸收的部分） */
  onDamageTaken?(sim: Sim, hero: SimHero, source: SimUnit | null, dealt: number, info: DamageInfo): void;
  /** 最后一击击杀任意单位 */
  onKill?(sim: Sim, hero: SimHero, victim: SimUnit): void;
  /** 参与击杀敌方英雄（击杀或助攻） */
  onTakedown?(sim: Sim, hero: SimHero, victim: SimHero, isKiller: boolean): void;
  onDeath?(sim: Sim, hero: SimHero, killer: SimUnit | null): void;
}

export interface HeroRt {
  def: HeroDef;
  /** 在 state.heroes 中的下标（0-4 蓝，5-9 红） */
  index: number;
  /** 出生/复活点 */
  spawn: Vec2;
  /** rt.base 对应的等级（升级时才重新计算裸属性） */
  baseLevel: number;

  // —— 普攻指令 ——
  atkOrder: boolean;
  atkTargetId: number;
  /** 指令是否显式指定了目标（显式目标死亡后不自动换目标之外的行为与智能目标相同） */
  atkExplicit: boolean;

  /** 动作锁期间收到的施法指令，解锁后自动重试（输入缓冲） */
  pendingCast: CastCommand | null;
  pendingUntil: number;

  /** 自然金币的小数累积 */
  goldFrac: number;
  multiKill: number;
  lastKillTime: number;
  /** 连续死亡次数（期间没有击杀/助攻）：越多赏金越低 */
  deathStreak: number;
  /** 敌方英雄 id → 最近一次伤害我的时间（击杀归属/助攻） */
  damagers: Map<number, number>;
  lastCombatTime: number;

  /** 生效中的钩子组：英雄被动 + 身上装备的被动（装备变化时重建） */
  hooks: HeroHooks[];
  /** 被动内部冷却：键 → 可再次触发的模拟时间 */
  cooldowns: Map<string, number>;
  /** 技能脚本的自由变量 */
  vars: Map<string, number>;

  controller: BotController | null;
  nextThink: number;
}

export interface MinionRt {
  /** 沿兵线的横向站位偏移（米），避免排成一条线 */
  offset: number;
  /** 沿 lanes[lane] 的行进方向：蓝 +1，红 -1 */
  dir: 1 | -1;
  /** 当前朝兵线前方的引导点 */
  goalX: number;
  goalY: number;
  /** 当前目标是否来自「呼救」（攻击己方英雄的敌人） */
  helping: boolean;
  /** 是否偏离兵线较远（此时回线要走寻路，不能直线硬走） */
  offLane: boolean;
}

export const MON_IDLE = 0;
export const MON_COMBAT = 1;
export const MON_RETURN = 2;

export interface CampRt {
  def: CampDef;
  /** 存活的野怪 */
  members: SimMonster[];
  /** 下次刷新的模拟时间（存活时无意义） */
  respawnAt: number;
}

/** 进行中的一次吐息：对 Bot 而言是一个扇形危险区，外加模拟层自己的结算进度 */
export interface BreathState extends ConeHazard {
  /** 起手时间 */
  start: number;
  /** 是否已进入喷吐阶段（已发 drake_breath 事件） */
  spraying: boolean;
  /** 剩余伤害跳数 / 下一跳的模拟时间 / 每跳原始伤害 */
  ticksLeft: number;
  nextTick: number;
  tickDamage: number;
}

export interface MonsterRt {
  home: Vec2;
  state: typeof MON_IDLE | typeof MON_COMBAT | typeof MON_RETURN;
  camp: CampRt;
  /** 特殊攻击(河道巨龙吐息)下次可以起手的模拟时间；不在战斗中为 -1，进入战斗时才开始计时 */
  specialAt: number;
  /** 进行中的吐息；没有为 null */
  breath: BreathState | null;
}

/** 内部单位 = 契约单位 + 运行时字段（buffs 收窄为内部 buff 类型） */
type WithRt<T extends { buffs: Buff[] }> = Omit<T, 'buffs'> & { buffs: SimBuff[]; rt: UnitRt };
export type SimHero = WithRt<HeroUnit> & { h: HeroRt };
export type SimMinion = WithRt<MinionUnit> & { m: MinionRt };
export type SimTower = WithRt<TowerUnit>;
export type SimCore = WithRt<CoreUnit>;
export type SimMonster = WithRt<MonsterUnit> & { mon: MonsterRt };
export type SimUnit = SimHero | SimMinion | SimTower | SimCore | SimMonster;

// ───────────────────────────── 弹道 / 区域 ─────────────────────────────

export interface SimProjectile extends Projectile {
  homing: boolean;
  /** 直线弹：命中后是否继续飞 */
  pierce: boolean;
  dead: boolean;
  filter: UnitFilter | null;
  hitIds: number[];
  /** 命中回调；直线弹返回 true = 命中后立即销毁（即使 pierce） */
  onHit: ((sim: Sim, proj: SimProjectile, target: SimUnit) => boolean | void) | null;
  /** 销毁时调用（到射程/命中销毁/目标消失） */
  onEnd: ((sim: Sim, proj: SimProjectile) => void) | null;
  /** 普攻弹：出手时的物攻快照与倍率（发射者可能在命中前已被移除） */
  basic: boolean;
  ad: number;
  dtype: DamageType;
  vsStructure: number;
  vsMinion: number;
}

export interface SimArea extends AreaEffect {
  tickInterval: number;
  tickLeft: number;
  dead: boolean;
  /** 跟随的单位死亡时是否随之结束 */
  endWithFollow: boolean;
  onTick: ((sim: Sim, area: SimArea) => void) | null;
  /** expired = 是否自然到期 */
  onEnd: ((sim: Sim, area: SimArea, expired: boolean) => void) | null;
}

/**
 * 把对象上的若干字段设为不可枚举。内部对象(单位/buff/弹道/区域)就放在 GameState 里对外可见，
 * 把带函数、循环引用的内部字段藏起来后，外部层对状态做 JSON.stringify / 展开 / structuredClone 都是安全的。
 */
export function hideFields<T extends object>(obj: T, ...keys: (keyof T)[]): T {
  for (const key of keys) Object.defineProperty(obj, key, { enumerable: false });
  return obj;
}

// ───────────────────────────── 常量 ─────────────────────────────

/** 小兵仇恨半径 */
export const MINION_AGGRO = 8;
/** 「正在攻击己方英雄」的判定窗口（秒） */
export const HELP_WINDOW = 2;
/** 英雄战斗状态持续时间 */
export const COMBAT_WINDOW = 5;
/** 非英雄单位的普攻前摇比例 */
export const DEFAULT_WINDUP = 0.35;
/** 出手动作最长时长 */
export const MAX_ATTACK_ANIM = 0.7;
