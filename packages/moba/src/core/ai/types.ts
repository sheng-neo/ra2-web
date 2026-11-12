/**
 * Bot 接入点：控制器接口 + 「公平视图」BotView。
 *
 * 规则：控制器只能通过 BotView 读世界、通过 BotView.command 下命令(与玩家同一入口)。
 * BotView 的所有查询都已按「对本队可见」过滤 —— 看不见的敌人不会出现在任何返回值里。
 */
import type { Rng } from '../rng';
import type {
  AreaEffect, CastSpec, CoreUnit, Difficulty, GameState, HeroUnit, MapData, MonsterUnit, PlayerCommand, PlayerTeam, Projectile,
  SkillSlot, TowerUnit, Unit, Vec2,
} from '../types';

/** 敌方英雄最后一次被本队看到时的信息 */
export interface LastSeen {
  x: number;
  y: number;
  /** 模拟时间；从未见过为 -999 */
  time: number;
}

/** 公共对局信息（比分、野怪刷新、兵线波次等记分板级别的信息，双方都能看到） */
export type PublicState = Readonly<Pick<GameState, 'time' | 'tick' | 'teams' | 'camps' | 'wave' | 'nextWaveIn' | 'over' | 'winner'>>;

export interface BotView {
  /** 自己的英雄（完整信息） */
  readonly hero: HeroUnit;
  readonly team: PlayerTeam;
  readonly enemyTeam: PlayerTeam;
  readonly difficulty: Difficulty;
  /** 该 Bot 专属的确定性随机流 */
  readonly rng: Rng;
  readonly map: MapData;
  /** 当前模拟时间 */
  readonly time: number;
  readonly state: PublicState;

  // ── 单位查询：只含存活单位；敌方只含当前对本队可见者。返回的数组在下一次 think 前有效，不要修改 ──
  /** 己方全部单位（英雄/小兵/塔/水晶，含自己） */
  allies(): readonly Unit[];
  /** 己方存活英雄（含自己） */
  alliedHeroes(): readonly HeroUnit[];
  /** 可见、可被选中的敌方英雄与小兵（不含建筑/野怪） */
  enemies(): readonly Unit[];
  /** 可见、可被选中的敌方英雄 */
  enemyHeroes(): readonly HeroUnit[];
  /** 敌方存活建筑（恒可见；注意 invulnerable） */
  enemyStructures(): readonly (TowerUnit | CoreUnit)[];
  alliedStructures(): readonly (TowerUnit | CoreUnit)[];
  /** 存活野怪（恒可见） */
  monsters(): readonly MonsterUnit[];
  /** 按 id 取单位：己方 / 野怪 / 建筑 / 可见的敌人；否则 undefined */
  unit(id: number): Unit | undefined;
  /** 该单位当前是否对本队可见 */
  canSee(u: Unit): boolean;
  /** pos 周围 radius 内可感知的存活单位（己方 + 可见敌方 + 野怪 + 建筑），按身体边缘距离判定 */
  near(pos: Vec2, radius: number): Unit[];
  /**
   * 全部 10 名英雄（记分板）。对不可见的敌方英雄，只应读取记分板字段：
   * heroId/level/kills/deaths/assists/cs/items/alive/respawnIn —— 不要读它的 pos/hp/buffs。
   */
  scoreboard(): readonly HeroUnit[];
  /** 敌方英雄最后一次被本队看到的位置与时间 */
  lastSeen(heroUnitId: number): LastSeen | null;
  /** 这个己方英雄当前是否由 AI 控制（真人队友不会听从队伍的任务分配，协作时不能指望他到场） */
  botControlled(hero: HeroUnit): boolean;

  // ── 地形 ──
  /** 半径 radius(默认自身)的单位能否站在 pos */
  walkable(pos: Vec2, radius?: number): boolean;
  /** a→b 能否直线走过去(不被墙/建筑挡) */
  lineClear(a: Vec2, b: Vec2, radius?: number): boolean;
  /** 离 pos 最近的可站立点 */
  nearestWalkable(pos: Vec2): Vec2;
  /** 从自己走到 to 的寻路距离（会真的跑一次 A*，别每次 think 都大量调用）。不可达返回 Infinity */
  pathDistance(to: Vec2): number;
  /**
   * 规划一条从自己到 to、绕开敌方建筑射程(外加 margin 米)的路线，返回拉直后的路点(不含起点)。
   * 自己或目的地所在的射程圈不算禁区(否则无路可走)。直线可达且不穿塔区时返回 [to]；不可达返回 null。
   * 会真的跑一次 A*，目的地没怎么变就别重复调用。
   */
  safePath(to: Vec2, margin?: number): Vec2[] | null;
  /** pos 所在草丛下标，-1 = 不在草丛 */
  bushAt(pos: Vec2): number;
  /** pos 是否在某个存活敌方塔/水晶的攻击范围内(可加余量)，返回那个建筑 */
  enemyStructureCovering(pos: Vec2, margin?: number): TowerUnit | CoreUnit | null;

  // ── 危险感知 ──
  /** 敌方的区域效果（预警圈/持续伤害区），仅本队视野内的 */
  hostileAreas(): readonly AreaEffect[];
  /** 敌方的飞行弹道，仅本队视野内的 */
  hostileProjectiles(): readonly Projectile[];

  // ── 自身技能 ──
  castSpec(slot: SkillSlot): CastSpec;
  /** 已学会、冷却完毕、法力足够、未被控制 */
  skillReady(slot: SkillSlot): boolean;

  // ── 自己的指令/出手状态（玩家从自己英雄的动作上也能看到这些，不属于隐藏信息）──
  /** 当前生效的指令：0 = 无，1 = 摇杆方向移动，2 = 寻路移动，3 = 普攻指令 */
  orderState(): 0 | 1 | 2 | 3;
  /** 普攻指令的目标 id；没有普攻指令为 -1 */
  orderTargetId(): number;
  /** 正处于普攻前摇（此时下移动/施法命令会取消这一下） */
  attackWindup(): boolean;
  /** 距下一次普攻可以出手的剩余时间（秒），可出手为 0 */
  attackCooldown(): number;
  /** 动作锁 / 位移途中 / 被眩晕击飞：此刻下的移动与普攻命令不会立即生效 */
  busy(): boolean;

  /** 对自己的英雄下命令（与玩家同一入口） */
  command(cmd: PlayerCommand): void;
}

export interface BotController {
  /** 决策间隔（秒）。缺省 0.2。world 按此节奏调用 think，并按英雄下标错峰 */
  readonly interval?: number;
  think(view: BotView): void;
}

export type BotFactory = (view: BotView) => BotController;
