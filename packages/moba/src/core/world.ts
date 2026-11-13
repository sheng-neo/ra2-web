/**
 * 模拟世界：createWorld(config) 的实现。
 *
 * Sim 是整个模拟层的中心对象：持有 GameState(对外契约) 与全部内部运行时数据，各玩法模块都是
 * 「以 sim 为第一个参数的函数」。Sim.step() 按固定顺序推进一个 30Hz tick：
 *
 *   调度器(延迟回调) → 出兵/刷野/祝福计时 → 重建空间网格 → Bot 决策 → 各单位(buff → 行动) →
 *   重建空间网格 → 弹道 → 区域 → 软分离 → 泉水 → 视野(每 0.2s) → 动画状态 → 移除死亡单位
 *
 * 确定性：只用 sim.rng(种子 PRNG)；不读真实时间；单位按创建顺序遍历，每 tick 由 rng 决定正序还是倒序
 * (否则先创建的蓝方永远先手)。同种子 + 同命令序列 → 逐 tick 完全相同的状态(见 hash.ts)。
 * 对局结束(state.over)后 step() 只推进 time/tick(供渲染层继续播放结束动画)，世界不再变化、命令被忽略；
 * 分出胜负那一刻的时间记在 state.endTime。
 *
 * 模块地图(都在 core/ 下)：
 *   internal.ts   内部类型：SimUnit(=契约单位+rt 运行时字段)、SimBuff、HeroHooks、DamageInfo…
 *   entity.ts     单位创建与基础判定(canTarget / isTargetable / isStructure)
 *   nav.ts        距离场网格、A*、碰撞移动            spatial.ts  单位空间哈希
 *   movement.ts   行走/追击/冲刺/跃击/被迫位移/瞬移/软分离
 *   combat.ts     伤害、治疗、死亡、普攻循环           rewards.ts  金币/经验/击杀结算
 *   buffs.ts      buff 增删合并、控制、护盾            stats.ts    属性重算
 *   projectiles.ts / areas.ts   投射物与区域效果       anim.ts     动作状态机
 *   hero.ts       命令处理、施法管线、智能目标、装备、复活
 *   minions.ts / structures.ts / monsters.ts / vision.ts
 *   skills/       registry(注册表) toolkit(技能工具箱) summoner(通用技能) panyue/chijin/xingli/fengling/yeque(英雄技能与被动)
 *                 timing(出手点约定) intents(给 Bot 的技能意图表与伤害估算)
 *   passives.ts   装备被动                             ai/         Bot 接口、公平视图、兜底 AI
 *   headless.ts   无头跑完整对局                       testkit.ts  测试辅助
 */
import { createBot } from './ai/index';
import { botTierFor } from './ai/params';
import type { BotFactory, LastSeen } from './ai/types';
import { SimBotView } from './ai/view';
import { updateAnim } from './anim';
import { updateAreas } from './areas';
import { tickBuffs } from './buffs';
import { HERO_IDS } from './data/heroes';
import { WAVES } from './data/units';
import { createCore, createHero, createTower } from './entity';
import { heroCommand, initHero, updateHero } from './hero';
import type { BreathState, CampRt, SimArea, SimCore, SimHero, SimProjectile, SimTower, SimUnit } from './internal';
import { LanePath } from './lanes';
import { createMap } from './map';
import { updateMinion, updateWaves } from './minions';
import { initCamps, updateCamps, updateMonster } from './monsters';
import { separate } from './movement';
import { NavGrid } from './nav';
import { updateProjectiles } from './projectiles';
import { Rng } from './rng';
import { Scheduler, type Task } from './scheduler';
import './skills/index';
import { SpatialGrid } from './spatial';
import { recomputeStats } from './stats';
import { refreshInvulnerability, updateFountains, updateStructure } from './structures';
import {
  TICK_DT,
  type FxKey, type GameEvent, type GameState, type HeroId, type LaneId, type MapData, type MatchConfig, type PlayerCommand, type PlayerTeam,
  type TeamId, type Unit, type Vec2, type World,
} from './types';
import { updateVision } from './vision';

/** 测试/调试用的开关（正式对局不传） */
export interface SimOptions {
  /** 不创建任何 AI 控制器（包括队友与敌人） */
  noBots?: boolean;
  /** 不出兵 */
  noWaves?: boolean;
  /** 不刷野怪 */
  noCamps?: boolean;
  /** 指定 Bot 工厂（缺省用 ai/index.ts 的默认工厂） */
  botFactory?: BotFactory;
}

type FxEvent = Extract<GameEvent, { type: 'fx' }>;
type FxExtra = Partial<Omit<FxEvent, 'type' | 'key' | 'pos' | 'team'>>;

/** 视野更新间隔（tick）：约 0.2 秒 */
const VISION_TICKS = 6;
/** 没人取事件时的保护上限（无头长跑不至于吃光内存） */
const MAX_PENDING_EVENTS = 50000;
const DEFAULT_THINK_INTERVAL = 0.2;

export class Sim implements World {
  readonly state: GameState;
  readonly config: MatchConfig;
  readonly opts: SimOptions;
  readonly map: MapData;
  readonly nav: NavGrid;
  readonly grid = new SpatialGrid();
  /** 战斗随机流（暴击等）。Bot 用各自 fork 出来的子流 */
  readonly rng: Rng;
  readonly scheduler = new Scheduler();

  /** 与 state.units 是同一个数组（内部类型视角） */
  readonly units: SimUnit[] = [];
  /** 与 state.heroes 是同一个数组 */
  readonly heroes: SimHero[] = [];
  readonly projectiles: SimProjectile[] = [];
  readonly areas: SimArea[] = [];
  /** 进行中的扇形危险区(河道巨龙吐息)。不进 GameState：画面靠 fx 事件，这张表只给 Bot 的躲避逻辑看 */
  readonly cones: BreathState[] = [];
  readonly byId = new Map<number, SimUnit>();

  readonly lanes: Record<LaneId, LanePath>;
  /** towers[队伍][路] = [一塔, 二塔, 高地塔]，被毁的位置为 null */
  readonly towers: [Record<LaneId, (SimTower | null)[]>, Record<LaneId, (SimTower | null)[]>];
  readonly cores: [SimCore, SimCore];
  readonly camps: CampRt[] = [];
  /** lastSeen[观察方队伍][英雄下标]：敌方英雄最后一次被看到的位置 */
  readonly lastSeen: [LastSeen[], LastSeen[]];
  /** 已播报过「超级兵出击」的 [队伍][路] */
  readonly superAnnounced: [Record<LaneId, boolean>, Record<LaneId, boolean>];

  firstBlood = false;
  nextWaveAt = WAVES.firstAt;
  /** 护盾等「每次独立」buff 的序号 */
  buffSeq = 0;

  private events: GameEvent[] = [];
  private nextId = 1;
  private frozen = false;
  private readonly views = new Map<number, SimBotView>();

  constructor(config: MatchConfig, opts: SimOptions = {}) {
    // 防御：外部传入了不存在的英雄 id 时退回第一个英雄，而不是在建英雄时崩掉
    const playerHero = HERO_IDS.includes(config.playerHero) ? config.playerHero : HERO_IDS[0];
    this.config = { ...config, playerHero };
    this.opts = opts;
    this.map = createMap();
    this.nav = new NavGrid(this.map);
    this.rng = new Rng(config.seed);
    this.lanes = {
      top: new LanePath(this.map.lanes.top),
      mid: new LanePath(this.map.lanes.mid),
      bot: new LanePath(this.map.lanes.bot),
    };
    this.state = {
      time: 0, tick: 0, config: this.config, map: this.map,
      units: this.units, heroes: this.heroes, projectiles: this.projectiles, areas: this.areas,
      teams: [
        { kills: 0, towersDestroyed: 0, gold: 0, blessingLeft: 0 },
        { kills: 0, towersDestroyed: 0, gold: 0, blessingLeft: 0 },
      ],
      camps: this.map.camps.map((c) => ({ campId: c.id, alive: false, respawnIn: c.firstSpawn })),
      playerId: -1, nextWaveIn: WAVES.firstAt, wave: 0, over: false, winner: null,
    };
    const emptyLane = (): Record<LaneId, (SimTower | null)[]> => ({ top: [null, null, null], mid: [null, null, null], bot: [null, null, null] });
    this.towers = [emptyLane(), emptyLane()];
    this.superAnnounced = [
      { top: false, mid: false, bot: false },
      { top: false, mid: false, bot: false },
    ];
    const seen = (): LastSeen[] => Array.from({ length: 10 }, () => ({ x: 0, y: 0, time: -999 }));
    this.lastSeen = [seen(), seen()];

    // 英雄：玩家选的英雄排第一位，其余按固定顺序；红方镜像同样的顺序
    const order: HeroId[] = [playerHero, ...HERO_IDS.filter((h) => h !== playerHero)];
    for (const team of [0, 1] as PlayerTeam[]) {
      order.forEach((heroId, i) => {
        const hero = createHero(this, team * 5 + i, team, heroId, team === 0 && i === 0);
        this.addUnit(hero);
        this.heroes.push(hero);
        this.state.teams[team].gold += hero.goldEarned;
        if (hero.isPlayer) this.state.playerId = hero.id;
      });
    }
    // 建筑
    for (const spot of this.map.towers) {
      const tower = createTower(this, spot);
      this.towers[spot.team][spot.lane][spot.tier - 1] = tower;
      this.addUnit(tower);
      this.nav.addObstacle(tower.id, tower.pos.x, tower.pos.y, tower.radius);
    }
    const cores = this.map.bases.map((base) => {
      const core = createCore(this, base);
      this.addUnit(core);
      this.nav.addObstacle(core.id, core.pos.x, core.pos.y, core.radius);
      return core;
    });
    this.cores = [cores[0], cores[1]];
    refreshInvulnerability(this);
    initCamps(this);

    for (const hero of this.heroes) initHero(this, hero);

    // 每个英雄一个「公平视图」(各自独立的随机流)；除玩家外的 9 个英雄由 Bot 控制，autoPlay 时玩家英雄也交给 AI
    const botRng = new Rng((config.seed ^ 0x5bd1e995) >>> 0);
    for (const hero of this.heroes) {
      // 难度决定双方 Bot 的档位：普通 / 困难只影响红方(队友固定 normal)；简单时红方再软一档、队友也降到 easy
      this.views.set(hero.id, new SimBotView(this, hero, botTierFor(config.difficulty, hero.team), botRng.fork()));
      if (!opts.noBots && (!hero.isPlayer || config.autoPlay)) this.setBotControl(hero.id, true);
    }

    this.grid.rebuild(this.units);
    updateVision(this);
    this.emit({ type: 'announce', key: 'match_start', team: 2 });
  }

  // ───────────────────────── World 接口 ─────────────────────────

  step(): void {
    const st = this.state;
    st.tick++;
    st.time = st.tick * TICK_DT;
    if (st.over) {
      this.freeze();
      return;
    }
    const dt = TICK_DT;
    const units = this.units;

    this.scheduler.run(st.time);
    updateWaves(this);
    updateCamps(this);
    this.updateBlessing(dt);

    // 每 tick 用随机数决定本 tick 的遍历方向(单位更新 / Bot 决策各用一位)。
    // 蓝方单位总是先创建：若永远正序更新，镜像对拼时蓝方永远先出手，平局全归蓝方；
    // 按 tick 奇偶交替也不行 —— 兵线每 900 tick 一波，每波交战时的奇偶性相同，会让同一侧每波都占 1 tick 先手。
    const coin = this.rng.next();
    const forward = coin < 0.5;
    const botsForward = ((coin * 4) | 0) % 2 === 0;

    this.grid.rebuild(units);
    this.runBots(botsForward);

    // 单位：先记下上一 tick 位置，再推进 buff 与行动。本 tick 新生成的单位从下一 tick 开始行动
    const count = units.length;
    for (let i = 0; i < count; i++) {
      const u = units[i];
      u.prevPos.x = u.pos.x;
      u.prevPos.y = u.pos.y;
      u.rt.moved = false;
    }
    for (let k = 0; k < count; k++) {
      const u = units[forward ? k : count - 1 - k];
      if (u.alive) tickBuffs(this, u, dt);
      switch (u.kind) {
        case 'hero': updateHero(this, u, dt); break;
        case 'minion': if (u.alive) updateMinion(this, u, dt); break;
        case 'monster': if (u.alive) updateMonster(this, u, dt); break;
        case 'tower':
        case 'core': if (u.alive) updateStructure(this, u, dt); break;
      }
      if (st.over) break;
    }

    this.grid.rebuild(units);
    updateProjectiles(this, dt);
    updateAreas(this, dt);
    separate(this);
    updateFountains(this, dt);
    if (st.tick % VISION_TICKS === 0) updateVision(this);

    for (let i = 0; i < units.length; i++) updateAnim(this, units[i]);
    this.removeDead();
  }

  command(heroUnitId: number, cmd: PlayerCommand): void {
    const u = this.byId.get(heroUnitId);
    if (!u || u.kind !== 'hero') return;
    heroCommand(this, u, cmd);
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  getUnit(id: number): Unit | undefined {
    return this.byId.get(id);
  }

  // ───────────────────────── 内部服务 ─────────────────────────

  get time(): number {
    return this.state.time;
  }

  allocId(): number {
    return this.nextId++;
  }

  emit(e: GameEvent): void {
    const ev = this.events;
    if (ev.length >= MAX_PENDING_EVENTS) ev.length = 0;
    ev.push(e);
  }

  /** 发一次性特效事件 */
  fx(key: FxKey, pos: Vec2, team: TeamId, extra?: FxExtra): void {
    this.emit({ type: 'fx', key, pos: { x: pos.x, y: pos.y }, team, ...extra });
  }

  /** delay 秒(模拟时间)后执行 fn */
  schedule(delay: number, fn: () => void): Task {
    return this.scheduler.at(this.state.time + Math.max(0, delay), fn);
  }

  /** 把新单位加入世界（立即可被查询；从下一 tick 开始行动） */
  addUnit(u: SimUnit): void {
    this.units.push(u);
    this.byId.set(u.id, u);
    this.grid.insert(u);
  }

  /** 英雄对应的 Bot 视图（每个英雄都有，不论当前是否由 AI 控制）。调试/测试用 */
  botView(heroUnitId: number): SimBotView | undefined {
    return this.views.get(heroUnitId);
  }

  /**
   * 把某个英雄交给 AI / 收回手动控制（托管、演示模式用）。
   * 开启时用 SimOptions.botFactory(缺省为 ai/index.ts 的默认工厂)新建一个控制器。
   */
  setBotControl(heroUnitId: number, enabled: boolean): void {
    const hero = this.byId.get(heroUnitId);
    const view = this.views.get(heroUnitId);
    if (!hero || hero.kind !== 'hero' || !view) return;
    if (!enabled) {
      hero.h.controller = null;
      return;
    }
    hero.h.controller = (this.opts.botFactory ?? createBot)(view);
    // 错峰：同队的 Bot 不在同一个 tick 思考；双方同位置的 Bot 在同一个 tick 思考(公平)
    hero.h.nextThink = Math.max(0.5, this.state.time) + (hero.h.index % 5) * 0.04;
  }

  private runBots(forward: boolean): void {
    const time = this.state.time;
    const heroes = this.heroes;
    for (let k = 0; k < heroes.length; k++) {
      const h = heroes[forward ? k : heroes.length - 1 - k];
      const c = h.h.controller;
      if (!c || time < h.h.nextThink) continue;
      h.h.nextThink = time + (c.interval ?? DEFAULT_THINK_INTERVAL);
      const view = this.views.get(h.id);
      if (view) c.think(view);
    }
  }

  /** 星陨祝福计时；结束时把小兵属性恢复 */
  private updateBlessing(dt: number): void {
    for (const team of [0, 1] as PlayerTeam[]) {
      const t = this.state.teams[team];
      if (t.blessingLeft <= 0) continue;
      t.blessingLeft -= dt;
      if (t.blessingLeft > 0) continue;
      t.blessingLeft = 0;
      for (const u of this.units) if (u.kind === 'minion' && u.team === team && u.alive) recomputeStats(this, u);
    }
  }

  /** 死亡的小兵/野怪/塔在本 tick 末移除（death 事件已发出）；阵亡英雄与被毁水晶保留 */
  private removeDead(): void {
    const units = this.units;
    let w = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive && (u.kind === 'minion' || u.kind === 'monster' || u.kind === 'tower')) {
        this.byId.delete(u.id);
        continue;
      }
      units[w++] = u;
    }
    units.length = w;
  }

  /** 对局结束后的第一个 tick：让所有东西停在原地（插值不再抖动），之后不再做任何事 */
  private freeze(): void {
    if (this.frozen) return;
    this.frozen = true;
    for (const u of this.units) {
      u.prevPos.x = u.pos.x;
      u.prevPos.y = u.pos.y;
    }
    for (const p of this.projectiles) {
      p.prevPos.x = p.pos.x;
      p.prevPos.y = p.pos.y;
    }
  }
}

/** 创建一局对战。opts 仅测试/调试使用 */
export function createWorld(config: MatchConfig, opts?: SimOptions): Sim {
  return new Sim(config, opts);
}
