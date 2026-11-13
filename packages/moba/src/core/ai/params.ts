/**
 * Bot 的全部可调参数：难度档案(反应/准头/进攻性…)、各英雄的打法参数、全局阈值。
 * 调平衡/调手感只改这里；逻辑文件里不出现魔法数字(几何常量除外)。
 */
import type { Difficulty, HeroId, PlayerTeam } from '../types';

/** 难度档案：只描述「操作与判断的水平」，不改变规则、不给额外信息或数值 */
export interface Profile {
  /** 决策间隔（秒） */
  think: number;
  /** 反应时间（秒）：敌人/预警圈/弹道出现后多久才会对它做出反应 */
  reaction: number;
  /** 技能瞄准的角度误差上限（弧度），均匀分布在 ±aimError */
  aimError: number;
  /** 预判比例：0 = 瞄当前位置，1 = 按目标速度完全预判 */
  aimLead: number;
  /** 看到预警圈/直线弹道后选择躲的概率 */
  dodge: number;
  /** 补刀时对「这一刀能不能收掉」的估计误差（比例，±） */
  lastHitError: number;
  /** 明明能补却没出手的概率 */
  lastHitSkip: number;
  /** 进攻性：>1 更敢打（开战门槛按它缩放） */
  aggression: number;
  /** 骚扰/越线意愿 0..1：对线时主动上前消耗的频率 */
  harass: number;
  /** 是否考虑越塔强杀 */
  dive: boolean;
  /** 连招中两个技能之间的最短间隔（秒）：越大越「手慢」 */
  comboGap: number;
  /** 远程是否走 A（攻击间隙移动） */
  orbwalk: boolean;
  /** 用闪现追杀的概率（每次机会掷一次） */
  flashKill: number;
  /** 用闪现/位移逃生的血量门槛倍率（1 = 标准；越小越晚交） */
  escapeSense: number;
  /** 跟随队友集火目标的概率 */
  focus: number;
  /** 地图意识 0..1：对「消失在视野里的敌人」的警惕程度 */
  awareness: number;
  /** 团队协作 0..1：支援、反蹲、争夺史诗野怪的积极性 */
  teamwork: number;
  /** 发呆：每秒触发概率与持续时间范围（秒） */
  idleRate: number;
  idleMin: number;
  idleMax: number;
  /** 打野 gank 的最短间隔（秒） */
  gankCooldown: number;
}

/**
 * Bot 档位：三档难度之外多一档 novice。玩家选「简单」时红方用 novice(比 easy 再软一档)，蓝方队友用 easy；
 * 选「普通 / 困难」时红方用同名档、队友固定 normal(见 world.ts 的 botTierFor)。
 */
export type BotTier = Difficulty | 'novice';

export const PROFILES: Record<BotTier, Profile> = {
  // 「简单」局里的敌方：反应更慢、更不敢打、更爱发呆、几乎不配合。数值来自「慢反应真人」脚本的批量对照(Q3)：
  // 认真打的新手八成能赢，泉水挂机只有三成多——赢不赢看玩家，而不是看队友
  novice: {
    think: 0.4, reaction: 0.9, aimError: 0.3, aimLead: 0, dodge: 0.05, lastHitError: 0.22, lastHitSkip: 0.3,
    aggression: 0.72, harass: 0.1, dive: false, comboGap: 0.9, orbwalk: false, flashKill: 0, escapeSense: 0.75,
    focus: 0, awareness: 0, teamwork: 0.25, idleRate: 0.07, idleMin: 1, idleMax: 2.5, gankCooldown: 100,
  },
  easy: {
    think: 0.3, reaction: 0.6, aimError: 0.2, aimLead: 0, dodge: 0.15, lastHitError: 0.22, lastHitSkip: 0.3,
    aggression: 0.8, harass: 0.2, dive: false, comboGap: 0.6, orbwalk: false, flashKill: 0, escapeSense: 0.75,
    focus: 0, awareness: 0, teamwork: 0.4, idleRate: 0.035, idleMin: 0.7, idleMax: 1.8, gankCooldown: 70,
  },
  normal: {
    think: 0.16, reaction: 0.28, aimError: 0.09, aimLead: 0.8, dodge: 0.6, lastHitError: 0.1, lastHitSkip: 0.1,
    aggression: 1, harass: 0.55, dive: true, comboGap: 0.22, orbwalk: true, flashKill: 0.45, escapeSense: 1,
    focus: 0.6, awareness: 0.4, teamwork: 0.7, idleRate: 0, idleMin: 0, idleMax: 0, gankCooldown: 34,
  },
  hard: {
    think: 0.1, reaction: 0.12, aimError: 0.03, aimLead: 1, dodge: 0.85, lastHitError: 0.04, lastHitSkip: 0,
    aggression: 1.06, harass: 0.75, dive: true, comboGap: 0.08, orbwalk: true, flashKill: 0.9, escapeSense: 1.1,
    focus: 1, awareness: 0.7, teamwork: 1, idleRate: 0, idleMin: 0, idleMax: 0, gankCooldown: 30,
  },
};

/**
 * 玩家选的难度 → 某一方 Bot 实际用的档位。
 * 简单：敌方 novice、队友 easy——队友要是仍用 normal，四个人自己就能赢(实测泉水挂机九成胜率)，胜负与玩家无关；
 * 普通 / 困难：敌方用同名档，队友固定 normal。
 */
export function botTierFor(difficulty: Difficulty, team: PlayerTeam): BotTier {
  if (difficulty === 'easy') return team === 1 ? 'novice' : 'easy';
  return team === 1 ? difficulty : 'normal';
}

/** 各英雄的打法参数（与难度无关） */
export interface Style {
  /** 战斗中血量比例低于此值就脱离战斗 */
  fleeHp: number;
  /** 脱战后血量比例低于此值就回城补给 */
  recallHp: number;
  /** 开战门槛修正：<1 更愿意先手（坦克/战士），>1 更谨慎（法师/射手） */
  engage: number;
  /** 是否由它来开团：抱团对峙时，非开团位会等队友先动手(开战门槛更高) */
  initiator: boolean;
  /** 选目标时对后排(法师/射手)的偏好 */
  diveBackline: number;
  /** 对线时是否把补刀让给同路队友 */
  support: boolean;
}

export const STYLES: Record<HeroId, Style> = {
  panyue: { fleeHp: 0.22, recallHp: 0.33, engage: 0.9, initiator: true, diveBackline: 0.2, support: true },
  chijin: { fleeHp: 0.23, recallHp: 0.34, engage: 0.82, initiator: true, diveBackline: 0.5, support: false },
  xingli: { fleeHp: 0.3, recallHp: 0.38, engage: 1.05, initiator: false, diveBackline: 0, support: false },
  fengling: { fleeHp: 0.3, recallHp: 0.38, engage: 1.05, initiator: false, diveBackline: 0, support: false },
  yeque: { fleeHp: 0.28, recallHp: 0.38, engage: 0.94, initiator: false, diveBackline: 1.2, support: false },
};

/** 全局阈值 */
export const TUNE = {
  /** 感知半径：这个范围内的英雄参与「局部战力」评估 */
  senseRadius: 15,
  /**
   * 战力评估的距离权重：队友在 allyNear 内算满、allyFar 外不算；敌人同理，范围只略大一点(略偏谨慎)。
   * 这组数决定「抱团对峙时敢不敢开团」：队友的范围比敌人小得多时(早期是 7/14)，站在前排的人永远觉得自己人少，
   * 5v5 只会互相消耗、没人先手 —— 整局击杀偏少，近战英雄也打不出伤害。
   */
  allyNear: 10,
  allyFar: 18,
  foeNear: 11,
  foeFar: 18,
  /** 战力评估的时间窗（秒）：伤害输出 = 普攻 DPS × 窗口 + 可用技能爆发 */
  fightHorizon: 5,
  /** 优势比(adv)门槛：≥ allIn 全力开打；≥ poke 可以消耗；< flee 撤退 */
  advAllIn: 1.18,
  advPoke: 0.85,
  advFlee: 0.62,
  /** 够得着我的敌人一套能打掉我这么大比例的血(接近致命)：退到他们够不着的地方 */
  respectLethal: 0.8,
  /** 优势比低于此值(明显打不过，比如被多打少)：同样敬而远之 */
  advOutgunned: 0.7,
  /** 压制门槛：优势比不低于此值时，对站在自己攻击范围里的敌人直接出手 */
  advPress: 1.08,
  /** 被人打了、且对方在手边时的还手门槛 */
  advFightBack: 0.95,
  /** 还手换血每持续 1 秒，继续换下去所需的优势比增加多少 */
  tradeFatigue: 0.05,
  /** 正被追着打时，优势比低于此值就撤 */
  advPressed: 0.85,
  /** 敌方泉水周围这么远以内算「对面家门口」：活着但看不见的敌人每人按 baseGhost 个英雄计入敌方战力 */
  baseGhostRange: 42,
  baseGhost: 0.75,
  /** 队友已经集火某个目标时，跟进开战的门槛倍率 */
  followUp: 0.85,
  /** 抱团时还没人动手，非开团位(法师/射手/刺客)自己先上的门槛倍率 */
  waitForEngage: 1.12,
  /** 击杀窗口的宽限（秒）：估计的击杀时间可以比目标逃回塔下的时间长这么多 */
  killSlack: 2.2,
  /** 撤退之后这么久内，重新开战/压制的门槛乘以 shakenFactor */
  shakenTime: 4,
  shakenFactor: 1.25,
  /** 撤退状态至少保持多久（防止进退抖动） */
  fleeHold: 1.4,
  /** 开战状态的最短承诺时间 */
  fightHold: 1.0,
  /** 回城后在泉水补到多少才出门 */
  baseHpReady: 0.92,
  baseManaReady: 0.8,
  /** 用「恢复」的血量门槛 */
  healHp: 0.5,
  /** 塔下判定的余量（米）：离塔射程边缘多远算「危险」 */
  towerMargin: 1.2,
  /** 小兵仇恨半径（与引擎 MINION_AGGRO 一致）：打英雄时这个范围内的敌方小兵会转火 */
  minionAggro: 8,
  /** 对线期结束时间（秒）：之后队伍开始按目标转线/抱团 */
  laneEnd: 270,
  /** 中期游走小队：每次帮边路的时长 / 两次之间的休整时间（秒） */
  squadTime: 50,
  squadRest: 35,
  /** 进入后期抱团推进的时间（秒） */
  lateStart: 570,
  /** 抱团推进时，至少聚齐多少人才越过河道/进塔 */
  groupMin: 3,
  /** 史诗野怪：开打所需的人数 / 平均等级 */
  drakeHeroes: 2,
  drakeLevel: 5,
  colossusHeroes: 3,
  colossusLevel: 8,
  /** 打野 gank：同一个目标 / 同一条路 的最短间隔（秒） */
  gankSameTarget: 80,
  gankSameLane: 45,
  /** 被派去回防后，至少守这么久（秒，威胁完全消失则提前解除） */
  defendHold: 6,
  /** 回防时守军没到齐，先退到建筑后方这么远集合（米） */
  regroupBack: 11,
  /** 回防保持时间（秒）：敌方多人逼近过的建筑，在他们消失后还要守多久 */
  threatHold: 18,
  /** 敌方大部队位置的记忆时间（秒）：这段时间内主推路跟着他们走 */
  massMemory: 25,
  /** 团队决策刷新间隔（秒） */
  teamTick: 0.8,
  /** 清线放技能要求的最低法力比例 */
  waveclearMana: 0.55,
  /** 抱团对峙(推进/回防)时，消耗意愿在难度档案 harass 的基础上再加多少 */
  groupHarass: 0.3,
  /** 消耗放技能后要保留的法力比例 */
  pokeMana: 0.35,
  /** 打野用技能要求的最低法力比例 */
  jungleMana: 0.25,
};
