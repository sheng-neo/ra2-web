/**
 * 正式 Bot：单个英雄的战术层。
 *
 * 每次思考(think)按固定的优先级走一遍：
 *   购买 → 感知(附近敌我、塔、兵线、局部战力 adv) → 发呆(仅简单难度) → 躲技能 → 保命(出塔/撤退/逃生技能/闪现)
 *   → 补给(恢复/回城/泉水) → 交战(选目标、连招、走 A、追杀) → 支援附近的战斗 → 执行队伍任务(对线/打野/推进/回防/打龙)
 * 战略层(去哪、做什么)由同队共享的 TeamBrain 决定；各英雄的技能用法在 skills.ts；参数在 params.ts。
 * 只通过 BotView 读世界、下命令 —— 看不见的敌人不会出现在任何判断里。
 */
import { HEROES } from '../data/heroes';
import { ARMOR_K } from '../data/units';
import { AREA_THREATS, estimateBasicDamage, estimateComboDamage } from '../skills/intents';
import type { CoreUnit, HeroId, HeroUnit, LaneId, MinionUnit, PlayerTeam, TowerUnit, Unit, Vec2 } from '../types';
import { Act } from './act';
import { advantageOf, allyWeight, basicDps, burstOn, effHp, foeWeight, heroOutput, structureOutput } from './eval';
import { dist, type LaneGeo } from './geom';
import { epicWork, jungleWork } from './jungle';
import { laneWork } from './lane';
import { PROFILES, STYLES, TUNE, type Profile, type Style } from './params';
import { shop } from './shop';
import { escapeSkills, fightSkills, finisherSkills, pokeSkills } from './skills';
import { teamBrain, type TeamBrain } from './team';
import type { BotController, BotView } from './types';

const TMP: Vec2 = { x: 0, y: 0 };
const STAND: Vec2 = { x: 0, y: 0 };

/** inMood 的类别：上前消耗 / 支援队友 / 跟随集火 / 闪现追杀 */
export const MOOD_POKE = 0;
export const MOOD_ASSIST = 1;
export const MOOD_FOCUS = 2;
export const MOOD_FLASH = 3;
export type Mood = typeof MOOD_POKE | typeof MOOD_ASSIST | typeof MOOD_FOCUS | typeof MOOD_FLASH;
/** 各类别多久重新掷一次（秒） */
const MOOD_SPAN = [2.5, 4, 3, 6];

function hasBuff(u: Unit, id: string): boolean {
  for (let i = 0; i < u.buffs.length; i++) if (u.buffs[i].id === id) return true;
  return false;
}

/** 位移技能能把近战送出多远（没好就是 0）：决定「够不够得着」 */
const GAP_CLOSE: Record<HeroId, { slot: 's1' | 's2'; reach: number } | null> = {
  panyue: { slot: 's1', reach: 9 },
  chijin: { slot: 's2', reach: 5.5 },
  xingli: null,
  fengling: null,
  yeque: { slot: 's1', reach: 6.5 },
};

/** 各英雄留人的本事：换算成「能多拖住目标几秒」(击飞/减速/突进) */
const STICK: Record<HeroId, number> = { panyue: 1.2, chijin: 0.7, xingli: 0.8, fengling: 0.6, yeque: 0.9 };

export class HeroBot implements BotController {
  readonly interval: number;
  readonly prof: Profile;
  readonly style: Style;
  readonly brain: TeamBrain;
  readonly geo: LaneGeo;
  readonly act = new Act();
  readonly heroId: HeroId;
  readonly team: PlayerTeam;
  readonly ranged: boolean;
  /** 己方泉水 / 敌方泉水 */
  readonly home: Vec2;
  readonly foeHome: Vec2;

  v!: BotView;
  me!: HeroUnit;
  time = 0;
  /** 当前在做什么（调试、测试与统计用） */
  label = 'init';

  // ── 感知快照：每次思考重建 ──
  /** 已注意到的敌方英雄：感知半径内 / 全部可见的 */
  readonly foes: HeroUnit[] = [];
  readonly foesAll: HeroUnit[] = [];
  /** 感知半径内的己方英雄（不含自己） */
  readonly friends: HeroUnit[] = [];
  readonly foeMinions: MinionUnit[] = [];
  readonly myMinions: MinionUnit[] = [];
  nearFoe: HeroUnit | null = null;
  nearFoeD = Infinity;
  /** 10 米内的队友数 */
  friendsNear = 0;
  /** 最近的敌方 / 己方建筑(22 米内) */
  foeStruct: TowerUnit | CoreUnit | null = null;
  foeStructD = Infinity;
  myStruct: TowerUnit | CoreUnit | null = null;
  myStructD = Infinity;
  /** 我在敌方建筑射程内 / 它正在打我 / 射程内替我扛塔的己方小兵数与总血量 */
  inFoeRange = false;
  towerOnMe = false;
  tankers = 0;
  tankHp = 0;
  /** 打英雄会引来的敌方小兵数 / 正在打我的敌方小兵、英雄数 */
  aggroMinions = 0;
  minionsOnMe = 0;
  heroesOnMe = 0;
  hpR = 1;
  manaR = 1;
  /** 最近每秒掉血量（平滑） */
  dmgRate = 0;
  /** 我所在位置的局部优势比 */
  adv = 9;
  /** 最近在攻击我的敌方英雄（没有为 null） */
  poker: HeroUnit | null = null;
  private pokedUntil = 0;
  /** 够得着我的敌人一套爆发 / 我的当前生命 */
  danger = 0;
  /** 需要「敬而远之」：站位退到敌人的威胁距离之外 */
  respect = false;
  private respectUntil = 0;
  /** 当前交战目标处的优势比（技能层用） */
  fightAdv = 1;
  /** 最近一次 advantageAt 估出的己方总输出（killWindow 用） */
  private evalAllyOut = 1;

  // ── 跨思考的状态 ──
  fleeUntil = 0;
  fightUntil = 0;
  fightTargetId = -1;
  /** 正在越塔强杀（期间不因为塔的仇恨而后撤） */
  diving = false;
  private forceFightId = -1;
  /** 「还手换血」的起止时间（见 combat） */
  private tradeStart = -99;
  private tradeEnd = -99;
  private trading = false;
  private baseStay = false;
  private idleUntil = 0;
  private lastThink = 0;
  private lastHp = 0;
  private readonly moodUntil = [0, 0, 0, 0];
  private readonly moodOn = [false, false, false, false];
  private readonly seenSince = new Map<number, number>();
  private readonly seenLast = new Map<number, number>();
  private readonly dodgeRoll = new Map<number, boolean>();
  private safeAt = -99;
  private readonly safe: Vec2 = { x: 0, y: 0 };

  /** 兵线站位锚点的平滑值（lane.ts 读写） */
  anchorLane: LaneId | null = null;
  anchorP = 0;
  /** 站位的横向偏移（米）：同路的几个人别叠在一个点上 */
  readonly side: number;
  private tripX = 1e9;
  private tripY = 1e9;
  private route: Vec2[] | null = null;
  private routeIdx = 0;
  private routeAt = -99;
  /** 刚撤退过：这段时间内重新开战的门槛更高(防止进退抖动) */
  private shakenUntil = 0;
  private assistId = -1;
  private assistUntil = 0;
  private assistBanUntil = 0;

  // ── 打野 / gank（jungle.ts 读写）──
  campId = -1;
  gankId = -1;
  gankSince = 0;
  gankSeenAt = 0;
  nextGankAt = 50;
  nextGankEval = 0;
  /** 上次 gank 各个目标 / 各条路的时间 */
  readonly gankedAt = new Map<number, number>();
  readonly gankLaneAt: Record<LaneId, number> = { top: -999, mid: -999, bot: -999 };

  constructor(view: BotView) {
    this.prof = PROFILES[view.difficulty];
    this.interval = this.prof.think;
    this.heroId = view.hero.heroId;
    this.style = STYLES[this.heroId];
    this.team = view.team;
    this.brain = teamBrain(view);
    this.geo = this.brain.geo;
    this.ranged = HEROES[this.heroId].attackType === 'ranged';
    this.home = view.map.bases[view.team].fountain;
    this.foeHome = view.map.bases[view.enemyTeam].fountain;
    this.lastHp = view.hero.hp;
    this.side = view.rng.range(-1, 1) * 1.8;
    // 第一次 gank 的时间各不相同，避免双方打野镜像行动
    this.nextGankAt = 55 + view.rng.range(0, 25);
  }

  // ───────────────────────── 主流程 ─────────────────────────

  think(v: BotView): void {
    this.v = v;
    const me = v.hero;
    this.me = me;
    this.time = v.time;
    this.act.begin(v);
    shop(v);
    if (v.state.over) return;
    if (!me.alive) {
      this.onDead();
      return;
    }
    this.brain.update(v);
    this.sense();
    this.lastThink = this.time;
    if (this.idle()) return;
    if (hasBuff(me, 'recall')) {
      // 回城引导中：没有威胁就别动(任何移动/攻击命令都会打断)
      if (!this.threatened()) {
        this.label = 'recall';
        return;
      }
    }
    if (this.dodge()) return;
    if (this.survive()) return;
    this.finish();
    if (this.sustain()) return;
    if (this.combat()) return;
    if (this.assist()) return;
    this.doTask();
  }

  private onDead(): void {
    this.label = 'dead';
    this.fleeUntil = 0;
    this.fightUntil = 0;
    this.fightTargetId = -1;
    this.forceFightId = -1;
    this.poker = null;
    this.diving = false;
    this.baseStay = false;
    this.gankId = -1;
    this.campId = -1;
    this.dmgRate = 0;
    this.lastHp = 0;
    this.act.forget();
  }

  /**
   * 长途赶路：自己规划一条绕开敌方防御塔射程的路线，再逐个路点交给引擎走。
   * (引擎的寻路只管墙不管塔；直接 moveTo 会一头扎进塔里，再被「出塔」逻辑拽回来，来回折返。)
   * 目的地只挪了一小段(quantum 以内)时沿用原路线 —— 兵线锚点这类目标每时每刻都在动，不能每次都重新寻路。
   */
  travel(x: number, y: number, quantum = 5, urgent = false): void {
    const me = this.me;
    const time = this.time;
    const moved = Math.hypot(x - this.tripX, y - this.tripY);
    const arrived = Math.hypot(me.pos.x - this.tripX, me.pos.y - this.tripY) < 3;
    if (moved > quantum || arrived || this.route === null || time - this.routeAt > 4) {
      this.tripX = x;
      this.tripY = y;
      this.routeAt = time;
      this.routeIdx = 0;
      TMP.x = x;
      TMP.y = y;
      this.route = this.diving ? null : this.v.safePath(TMP);
    }
    const route = this.route;
    if (!route) {
      // 无路可绕(或正在越塔)：直接走
      this.act.moveTo(this.tripX, this.tripY, urgent);
      return;
    }
    while (this.routeIdx < route.length - 1 && Math.hypot(route[this.routeIdx].x - me.pos.x, route[this.routeIdx].y - me.pos.y) < 1.8) this.routeIdx++;
    const wp = route[this.routeIdx];
    this.act.moveTo(wp.x, wp.y, urgent);
  }

  private doTask(): void {
    const task = this.brain.taskOf(this.heroId);
    switch (task.kind) {
      case 'jungle': jungleWork(this); break;
      case 'epic': epicWork(this, task.campId); break;
      case 'lane': laneWork(this, task.lane, 'lane'); break;
      case 'push': laneWork(this, task.lane, 'push'); break;
      case 'defend': laneWork(this, task.lane, 'defend'); break;
    }
  }

  // ───────────────────────── 感知 ─────────────────────────

  private sense(): void {
    const v = this.v;
    const me = this.me;
    const time = this.time;
    const R = TUNE.senseRadius;
    this.foes.length = 0;
    this.foesAll.length = 0;
    this.friends.length = 0;
    this.foeMinions.length = 0;
    this.myMinions.length = 0;
    this.nearFoe = null;
    this.nearFoeD = Infinity;
    this.heroesOnMe = 0;
    this.minionsOnMe = 0;
    this.aggroMinions = 0;
    this.friendsNear = 0;
    if (time >= this.pokedUntil || (this.poker && (!this.poker.alive || !v.canSee(this.poker)))) this.poker = null;
    for (const e of v.enemies()) {
      const d = dist(me.pos, e.pos);
      if (e.kind === 'hero') {
        // 反应时间：刚进入视野的敌人要过一会儿才「注意到」
        const last = this.seenLast.get(e.id) ?? -99;
        if (time - last > 0.7) this.seenSince.set(e.id, time);
        this.seenLast.set(e.id, time);
        if (time - (this.seenSince.get(e.id) ?? time) < this.prof.reaction) continue;
        this.foesAll.push(e);
        if (d > R) continue;
        this.foes.push(e);
        if (d < this.nearFoeD) {
          this.nearFoeD = d;
          this.nearFoe = e;
        }
        if (e.targetId === me.id) {
          this.heroesOnMe++;
          // 记住是谁在点我(保留一小段时间)：不还手的话就得退到他够不着的地方
          this.poker = e;
          this.pokedUntil = time + 1.5;
        }
      } else if (e.kind === 'minion') {
        if (d > 13) continue;
        this.foeMinions.push(e);
        if (d <= TUNE.minionAggro) this.aggroMinions++;
        if (e.targetId === me.id) this.minionsOnMe++;
      }
    }
    for (const a of v.allies()) {
      if (a === me) continue;
      if (a.kind === 'hero') {
        const d = dist(me.pos, a.pos);
        if (d <= R) this.friends.push(a);
        if (d <= 10) this.friendsNear++;
      } else if (a.kind === 'minion') {
        if (dist(me.pos, a.pos) <= 14) this.myMinions.push(a);
      }
    }
    // 最近的建筑
    this.foeStruct = null;
    this.foeStructD = 22;
    for (const s of v.enemyStructures()) {
      const d = dist(me.pos, s.pos);
      if (d < this.foeStructD) {
        this.foeStructD = d;
        this.foeStruct = s;
      }
    }
    this.myStruct = null;
    this.myStructD = 22;
    for (const s of v.alliedStructures()) {
      const d = dist(me.pos, s.pos);
      if (d < this.myStructD) {
        this.myStructD = d;
        this.myStruct = s;
      }
    }
    this.inFoeRange = false;
    this.towerOnMe = false;
    this.tankers = 0;
    this.tankHp = 0;
    const fs = this.foeStruct;
    if (fs) {
      const r = fs.stats.attackRange;
      this.inFoeRange = this.foeStructD <= r + 0.4;
      this.towerOnMe = fs.targetId === me.id;
      for (const m of this.myMinions) {
        if (dist(m.pos, fs.pos) <= r + m.radius) {
          this.tankers++;
          this.tankHp += m.hp;
        }
      }
    }
    this.hpR = me.hp / me.stats.maxHp;
    this.manaR = me.stats.maxMana > 0 ? me.mana / me.stats.maxMana : 1;
    const dt = Math.max(0.05, time - this.lastThink);
    const loss = Math.max(0, this.lastHp - me.hp);
    this.dmgRate = this.dmgRate * 0.55 + (loss / dt) * 0.45;
    if (this.dmgRate < 1) this.dmgRate = 0;
    this.lastHp = me.hp;
    this.adv = this.advantageAt(me.pos.x, me.pos.y);
    this.fightAdv = this.adv;
    // 够得着我的敌人一套能打掉我多少血
    let burst = 0;
    const brain = this.brain;
    for (const e of this.foes) {
      if (dist(me.pos, e.pos) > this.threatReach(e) + 1.5) continue;
      burst += burstOn(e, me, (slot) => brain.enemyReady(e, slot, time));
    }
    this.danger = burst / Math.max(1, me.hp + me.shield);
    // 对面一套打不死我、双方又差不多，就该正常补刀换血；只有「一套接近致命」或「明显打不过」才敬而远之
    // (带保持时间：退开之后敌人权重变小、优势比回升，没有滞回就会在「退」和「上」之间来回挪步)
    if (this.foes.length > 0 && ((this.danger >= TUNE.respectLethal && this.adv < 1.2) || this.adv < TUNE.advOutgunned)) this.respectUntil = time + 1.6;
    this.respect = time < this.respectUntil && this.foes.length > 0;
  }

  /** 敌方英雄 e 的威胁距离：普攻射程 + (近战)突进技能能送出的距离 */
  threatReach(e: HeroUnit): number {
    let r = e.stats.attackRange + e.radius + this.me.radius + 0.8;
    const gc = GAP_CLOSE[e.heroId];
    if (gc && this.brain.enemyReady(e, gc.slot, this.time)) r += gc.reach;
    return r;
  }

  /** 看不见、但按最后出现的位置推算可能就在附近的敌人数（按地图意识折算） */
  private ghosts(x: number, y: number): number {
    const aw = this.prof.awareness;
    const v = this.v;
    const board = v.scoreboard();
    // 敌方高地/基地一带：活着却看不见的敌人多半就在家里(刚复活、刚回城)，不能当他们不存在
    const nearBase = Math.hypot(x - this.foeHome.x, y - this.foeHome.y) < TUNE.baseGhostRange;
    let g = 0;
    let home = 0;
    for (let i = 0; i < board.length; i++) {
      const e = board[i];
      if (e.team === this.team || !e.alive || v.canSee(e)) continue;
      if (nearBase) {
        home++;
        continue;
      }
      const ls = v.lastSeen(e.id);
      if (!ls || ls.time < 0) continue;
      const el = this.time - ls.time;
      if (el > 25) continue;
      if (Math.hypot(ls.x - x, ls.y - y) - 6.5 * el > 12) continue;
      g += el < 3 ? 0.8 : el < 10 ? 0.5 : 0.25;
    }
    return g * aw + home * TUNE.baseGhost * (0.5 + 0.5 * aw);
  }

  /**
   * 如果在 (x, y) 开打，己方相对敌方的优势比(见 eval.ts)。自己按满权重计入，其余按离该点的距离加权。
   */
  advantageAt(x: number, y: number): number {
    const v = this.v;
    const me = this.me;
    const time = this.time;
    const brain = this.brain;
    let aE = 0;
    let aO = 0;
    let fE = 0;
    let fO = 0;
    let nF = 0;
    for (const h of v.alliedHeroes()) {
      const w = h === me ? 1 : allyWeight(Math.hypot(h.pos.x - x, h.pos.y - y));
      if (w <= 0) continue;
      const s = h.skills;
      aE += effHp(h) * w;
      aO += heroOutput(h, (slot) => s[slot].cd <= 0.3 && h.mana >= s[slot].cost) * w;
    }
    for (const e of this.foesAll) {
      const w = foeWeight(Math.hypot(e.pos.x - x, e.pos.y - y));
      if (w <= 0) continue;
      fE += effHp(e) * w;
      fO += heroOutput(e, (slot) => brain.enemyReady(e, slot, time)) * w;
      nF += w;
    }
    const g = this.ghosts(x, y);
    if (nF <= 0 && g <= 0) return 9;
    if (g > 0) {
      // 幽灵按「在场敌人的平均水平」折算；一个都看不见时拿自己当参照
      const e1 = nF > 0 ? fE / nF : effHp(me) / Math.max(0.3, this.hpR);
      const o1 = nF > 0 ? fO / nF : basicDps(me) * TUNE.fightHorizon * 1.6;
      fE += e1 * g;
      fO += o1 * g;
    }
    TMP.x = x;
    TMP.y = y;
    const fs = v.enemyStructureCovering(TMP, 0.5);
    if (fs) fO += structureOutput(fs);
    for (const s of v.alliedStructures()) {
      const r = s.stats.attackRange;
      if ((s.pos.x - x) * (s.pos.x - x) + (s.pos.y - y) * (s.pos.y - y) <= r * r) {
        aO += structureOutput(s);
        break;
      }
    }
    const A2 = TUNE.minionAggro * TUNE.minionAggro;
    for (const m of this.foeMinions) {
      if ((m.pos.x - x) * (m.pos.x - x) + (m.pos.y - y) * (m.pos.y - y) <= A2) fO += basicDps(m) * TUNE.fightHorizon * 0.6;
    }
    for (const m of this.myMinions) {
      if ((m.pos.x - x) * (m.pos.x - x) + (m.pos.y - y) * (m.pos.y - y) <= A2) aO += basicDps(m) * TUNE.fightHorizon * 0.35;
    }
    this.evalAllyOut = aO;
    return advantageOf(aE, aO, fE, fO);
  }

  /**
   * 「杀得掉吗」：按刚才 advantageAt 估出的己方输出，集火 t 需要的时间，是否短于他逃回塔下的时间
   * (加上我方能留人的控制时间)。杀不掉的架不全力打 —— 只会白白吃一身小兵伤害。
   */
  private killWindow(t: HeroUnit): boolean {
    const v = this.v;
    const me = this.me;
    const tKill = effHp(t) / Math.max(1, this.evalAllyOut / TUNE.fightHorizon);
    // 他离最近的己方塔还有多远
    let dTower = 60;
    let tower: Vec2 | null = null;
    for (const s of v.enemyStructures()) {
      const d = dist(s.pos, t.pos) - s.stats.attackRange;
      if (d < dTower) {
        dTower = d;
        tower = s.pos;
      }
    }
    let window = Math.max(0, dTower) / Math.max(1, t.stats.moveSpeed) + TUNE.killSlack + STICK[this.heroId];
    for (let i = 0; i < t.buffs.length; i++) {
      const b = t.buffs[i];
      if (b.id === 'stun' || b.id === 'airborne' || b.id === 'root') window += b.timeLeft;
      else if (b.id === 'slow') window += b.timeLeft * b.value * 1.5;
    }
    // 有人卡在他回塔的路上：跑不掉
    if (tower) {
      const dt = dist(tower, t.pos);
      if (dist(tower, me.pos) < dt - 1) window += 2.5;
      else for (const f of this.friends) {
        if (dist(f.pos, t.pos) < 12) window += STICK[f.heroId] * 0.5;
        if (dist(tower, f.pos) < dt - 1 && dist(f.pos, t.pos) < 10) {
          window += 2.5;
          break;
        }
      }
    }
    return tKill <= window;
  }

  /** pos 是否在敌方泉水的打击范围内(外加 margin 米) */
  nearFoeFountain(pos: Vec2, margin: number): boolean {
    const r = this.v.map.bases[this.v.enemyTeam].fountainRadius + margin;
    const dx = pos.x - this.foeHome.x;
    const dy = pos.y - this.foeHome.y;
    return dx * dx + dy * dy <= r * r;
  }

  /** 附近有需要立刻应对的威胁(回城引导中用它决定要不要取消) */
  private threatened(): boolean {
    if (this.dmgRate > 0) return true;
    if (this.nearFoe && this.nearFoeD < 11) return true;
    return this.minionsOnMe > 0;
  }

  /**
   * 每隔几秒掷一次：这段时间愿不愿意主动做某类「可做可不做」的事。
   * 逐次思考都掷的话，概率再小也会很快掷中；按时间段掷才有「这会儿不想上」的效果。
   */
  inMood(kind: Mood, p: number): boolean {
    if (this.time >= this.moodUntil[kind]) {
      this.moodUntil[kind] = this.time + MOOD_SPAN[kind];
      this.moodOn[kind] = this.v.rng.chance(p);
    }
    return this.moodOn[kind];
  }

  // ───────────────────────── 安全判断（各任务共用） ─────────────────────────

  /**
   * 打单位 u 需不需要站进敌方建筑的射程。有兵扛塔且塔没盯着我时可以进。
   */
  safeToHit(u: Unit): boolean {
    // 目标缩在敌方泉水里：够不着就算了(远程在泉水外能点到的另说)
    if (this.nearFoeFountain(u.pos, 1.5 - this.me.stats.attackRange)) return false;
    const s = this.foeStruct;
    if (!s || u === s) return true;
    if (this.diving) return true;
    if (this.tankers > 0 && this.tankHp > 500 && !this.towerOnMe) return true;
    // 沿「塔 → 目标」延长线站到最远处，离塔还有多远
    const need = dist(u.pos, s.pos) + this.me.stats.attackRange + u.radius;
    return need > s.stats.attackRange + TUNE.towerMargin + 0.4;
  }

  /** 走到单位 u 旁边去打它，会不会把自己送进更强的敌方英雄手里 */
  safeFromFoes(u: Unit): boolean {
    if (!this.respect) return true;
    const mine = this.me.stats.attackRange + u.radius;
    for (const e of this.foes) {
      // 我站在离他最远、又刚好够得着 u 的位置时，是否还在他的威胁距离里
      if (dist(e.pos, u.pos) + mine < this.threatReach(e)) return false;
    }
    return true;
  }

  /** 一套技能加两下普攻能不能带走 */
  killable(e: HeroUnit): boolean {
    const me = this.me;
    return estimateComboDamage(me, e) + 2 * estimateBasicDamage(me, e) >= e.hp + e.shield;
  }

  // ───────────────────────── 发呆（简单难度） ─────────────────────────

  private idle(): boolean {
    const p = this.prof;
    if (p.idleRate <= 0) return false;
    if (this.time < this.idleUntil) {
      // 挨打了就醒
      if (this.dmgRate > 0 || (this.nearFoe && this.nearFoeD < 6)) {
        this.idleUntil = 0;
        return false;
      }
      this.label = 'idle';
      return true;
    }
    if (this.dmgRate > 0 || this.inFoeRange) return false;
    if (this.v.rng.chance(p.idleRate * this.interval)) {
      this.idleUntil = this.time + this.v.rng.range(p.idleMin, p.idleMax);
      this.act.halt();
      this.label = 'idle';
      return true;
    }
    return false;
  }

  // ───────────────────────── 躲技能 ─────────────────────────

  private willDodge(id: number): boolean {
    let r = this.dodgeRoll.get(id);
    if (r === undefined) {
      if (this.dodgeRoll.size > 64) this.dodgeRoll.clear();
      r = this.v.rng.chance(this.prof.dodge);
      this.dodgeRoll.set(id, r);
    }
    return r;
  }

  /** 走出预警圈/持续伤害区，侧移躲直线弹道。返回 true = 这次思考用来躲了 */
  private dodge(): boolean {
    const v = this.v;
    const me = this.me;
    const prof = this.prof;
    if (v.busy()) return false;
    let ux = 0;
    let uy = 0;
    let found = false;
    const speed = Math.max(1, me.stats.moveSpeed);
    for (const a of v.hostileAreas()) {
      const threat = AREA_THREATS[a.visual];
      if (threat !== 'incoming' && threat !== 'damage') continue;
      // 跟着敌人走的区域(旋风)躲不掉，交给战力评估去决定打还是跑
      if (a.followUnitId >= 0) continue;
      if (a.age < prof.reaction) continue;
      const dx = me.pos.x - a.pos.x;
      const dy = me.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      const edge = a.radius + me.radius + 0.35;
      if (d >= edge) continue;
      if (!this.willDodge(a.id)) continue;
      const left = a.duration - a.age;
      const need = (edge - d) / speed;
      let ox: number;
      let oy: number;
      if (d > 0.3) {
        ox = dx / d;
        oy = dy / d;
      } else {
        const l = dist(this.home, me.pos) || 1;
        ox = (this.home.x - me.pos.x) / l;
        oy = (this.home.y - me.pos.y) / l;
      }
      if (threat === 'incoming' && need > left + 0.12) {
        // 走不出去了：反应快的会交位移
        if (prof.dodge >= 0.9 && left > 0.1 && escapeSkills(this, ox, oy)) {
          this.label = 'dodge';
          return true;
        }
        continue;
      }
      ux += ox;
      uy += oy;
      found = true;
    }
    for (const p of v.hostileProjectiles()) {
      if (p.targetId !== -1 || p.speed <= 0) continue;
      if (p.traveled / p.speed < prof.reaction * 0.5) continue;
      const rx = me.pos.x - p.pos.x;
      const ry = me.pos.y - p.pos.y;
      const along = rx * p.dir.x + ry * p.dir.y;
      if (along < 0 || along > p.maxRange - p.traveled + me.radius) continue;
      const perp = rx * p.dir.y - ry * p.dir.x;
      const hitW = p.radius + me.radius + 0.3;
      if (Math.abs(perp) >= hitW) continue;
      if (!this.willDodge(p.id)) continue;
      const need = (hitW - Math.abs(perp)) / speed;
      if (need > along / p.speed + 0.05) continue;
      const side = perp >= 0 ? 1 : -1;
      let sx = p.dir.y * side;
      let sy = -p.dir.x * side;
      // 那一侧是墙就换另一侧
      TMP.x = me.pos.x + sx * 1.6;
      TMP.y = me.pos.y + sy * 1.6;
      if (!v.walkable(TMP)) {
        sx = -sx;
        sy = -sy;
      }
      ux += sx * 1.5;
      uy += sy * 1.5;
      found = true;
    }
    if (!found) return false;
    // 掺一点回家的方向：别往敌人堆里躲
    const hl = dist(this.home, me.pos) || 1;
    ux += ((this.home.x - me.pos.x) / hl) * 0.3;
    uy += ((this.home.y - me.pos.y) / hl) * 0.3;
    const l = Math.hypot(ux, uy);
    if (l < 1e-3) return false;
    this.act.moveDir(ux / l, uy / l, true);
    this.label = 'dodge';
    return true;
  }

  // ───────────────────────── 保命 ─────────────────────────

  private survive(): boolean {
    const time = this.time;
    this.forceFightId = -1;
    if (time >= this.fightUntil) this.diving = false;

    // —— 敌方泉水：进去就是送，无条件出来 ——
    if (this.nearFoeFountain(this.me.pos, 1.2)) {
      this.travel(this.home.x, this.home.y, 8, true);
      this.label = 'leave-fountain';
      return true;
    }
    // —— 敌方建筑：盯上我了 / 没有兵扛 / 最后一个兵快死了 → 出塔 ——
    const st = this.foeStruct;
    const towerDanger = st !== null && this.inFoeRange && !this.diving && (this.towerOnMe || this.tankers === 0 || this.tankHp < 450);

    const foeNear = this.nearFoe !== null && this.nearFoeD < 12;
    const fleeHp = this.style.fleeHp;
    let flee = time < this.fleeUntil;
    if (!flee) {
      if (this.hpR < fleeHp && (foeNear || this.inFoeRange || this.dmgRate > 0)) flee = true;
      else if (foeNear && this.adv < TUNE.advFlee) flee = true;
      // 正被人追着打、又明显打不过：趁早走，别等到残血
      else if (this.heroesOnMe > 0 && this.nearFoeD < 9 && this.adv < TUNE.advPressed) flee = true;
      // 一套会被秒：有地图意识的 Bot 会提前拉开
      else if (foeNear && this.danger >= 1 && this.adv < 1.1 && this.prof.awareness > 0) flee = true;
      if (flee) this.fleeUntil = time + TUNE.fleeHold;
    } else if (foeNear && (this.adv < TUNE.advFlee * 1.2 || this.hpR < fleeHp)) {
      this.fleeUntil = Math.max(this.fleeUntil, time + 0.6);
    }

    if (flee) {
      // 反杀：对面更残、就在手边、一套能带走 → 不跑
      const t = this.nearFoe;
      if (t && this.nearFoeD <= this.engageDist(t) && this.killable(t) && this.adv >= 0.55 && !this.v.enemyStructureCovering(t.pos, 0)) {
        this.forceFightId = t.id;
        return false;
      }
      this.flee();
      return true;
    }
    if (towerDanger && st) {
      this.leaveTower(st);
      return true;
    }
    return false;
  }

  private leaveTower(st: TowerUnit | CoreUnit): void {
    const me = this.me;
    // 径向出塔，掺上回家方向(别从塔后面绕到更深处)
    let ux = me.pos.x - st.pos.x;
    let uy = me.pos.y - st.pos.y;
    const l = Math.hypot(ux, uy) || 1;
    const hl = dist(this.home, me.pos) || 1;
    ux = ux / l + ((this.home.x - me.pos.x) / hl) * 0.9;
    uy = uy / l + ((this.home.y - me.pos.y) / hl) * 0.9;
    const n = Math.hypot(ux, uy) || 1;
    const step = st.stats.attackRange + 3 - this.foeStructD;
    const to = this.v.nearestWalkable({ x: me.pos.x + (ux / n) * Math.max(3, step), y: me.pos.y + (uy / n) * Math.max(3, step) });
    this.act.moveTo(to.x, to.y, true);
    this.label = 'leave-tower';
  }

  /** 撤退的目的地：泉水或某座己方防御塔背后——挑「近、且路上不会撞上敌人」的 */
  private safeSpot(): Vec2 {
    if (this.time - this.safeAt < 1) return this.safe;
    this.safeAt = this.time;
    const me = this.me;
    let best = Infinity;
    const consider = (x: number, y: number, bias: number): void => {
      let cost = Math.hypot(x - me.pos.x, y - me.pos.y) + bias;
      // 路上有敌人挡着：重罚
      const dx = x - me.pos.x;
      const dy = y - me.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      for (const e of this.foes) {
        const rx = e.pos.x - me.pos.x;
        const ry = e.pos.y - me.pos.y;
        const along = (rx * dx + ry * dy) / len;
        if (along <= 0 || along >= len) continue;
        if (Math.abs(rx * dy - ry * dx) / len < 5) cost += 30;
      }
      if (cost < best) {
        best = cost;
        this.safe.x = x;
        this.safe.y = y;
      }
    };
    // 泉水永远是候选(略加偏置：近处有塔就先躲塔后)
    consider(this.home.x, this.home.y, 6);
    for (const s of this.v.alliedStructures()) {
      if (s.kind !== 'tower') continue;
      // 只考虑比我更靠近家的塔，躲到它背后(朝家的一侧)
      const dHome = dist(s.pos, this.home);
      if (dHome > dist(me.pos, this.home) + 2) continue;
      const k = 3 / Math.max(1, dHome);
      consider(s.pos.x + (this.home.x - s.pos.x) * k, s.pos.y + (this.home.y - s.pos.y) * k, 0);
    }
    return this.safe;
  }

  private flee(): void {
    const v = this.v;
    const me = this.me;
    this.label = 'flee';
    this.gankId = -1;
    this.shakenUntil = this.time + TUNE.shakenTime;
    const spot = this.safeSpot();
    let dx = spot.x - me.pos.x;
    let dy = spot.y - me.pos.y;
    const l = Math.hypot(dx, dy);
    if (l < 4) {
      // 已经在塔后还被追：继续往家跑
      dx = this.home.x - me.pos.x;
      dy = this.home.y - me.pos.y;
      this.safe.x = this.home.x;
      this.safe.y = this.home.y;
    }
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    const hunted = this.nearFoe !== null && this.nearFoeD < 8.5;
    const sense = this.prof.escapeSense;
    // 位移留给真正危险的时候：血不多了、被多打少、或者已经被贴脸追着砍
    if (hunted && !v.busy() && (this.hpR < 0.5 * sense || this.adv < 0.5 || (this.heroesOnMe > 0 && this.nearFoeD < 4.5 && this.hpR < 0.75))) {
      if (escapeSkills(this, dx, dy)) return;
    }
    // 闪现：快死了、追兵就在身后；或者被人贴脸、明显打不过、自己的位移又用不出来
    const dying = this.hpR < 0.2 * sense;
    const jumped = this.hpR < 0.65 * sense && this.adv < 0.5 && this.nearFoeD < 4.5;
    if ((dying || jumped) && this.nearFoe && this.nearFoeD < 6.5 && v.skillReady('flash') && !v.busy()) {
      for (const off of [0, 0.6, -0.6]) {
        const a = Math.atan2(dy, dx) + off;
        TMP.x = me.pos.x + Math.cos(a) * 5;
        TMP.y = me.pos.y + Math.sin(a) * 5;
        if (!v.walkable(TMP) || v.enemyStructureCovering(TMP, 0)) continue;
        this.act.castDir('flash', Math.cos(a), Math.sin(a));
        this.act.forget();
        return;
      }
    }
    this.travel(this.safe.x, this.safe.y, 3, true);
  }

  // ───────────────────────── 补给 ─────────────────────────

  private sustain(): boolean {
    const v = this.v;
    const me = this.me;
    const base = v.map.bases[this.team];
    const dHome = dist(me.pos, this.home);
    const inBase = dHome <= base.fountainRadius - 0.5;
    if (this.baseStay) {
      if (this.hpR >= TUNE.baseHpReady && this.manaR >= TUNE.baseManaReady) {
        this.baseStay = false;
      } else {
        this.label = 'base';
        if (inBase) this.act.halt();
        else if (dHome < 26) this.act.moveTo(this.home.x, this.home.y);
        else if (!this.recallNow()) {
          // 回城被打断了：换个安全的地方再回，而不是一路走回家
          const spot = this.safeSpot();
          this.travel(spot.x, spot.y, 3);
        }
        return true;
      }
    }
    const calm = !this.nearFoe || this.nearFoeD > 10;
    const restoring = hasBuff(me, 'restore');
    // 恢复：脱离英雄/塔的伤害后才用(会被打断)
    if (!restoring && this.hpR < TUNE.healHp && calm && !this.inFoeRange && v.skillReady('heal') && !me.inCombat) {
      this.act.castSelf('heal');
    }
    let need = this.hpR < this.style.recallHp || (this.manaR < 0.12 && this.hpR < 0.75) || (this.hpR < 0.55 && this.manaR < 0.2);
    // 「恢复」还在回、或者马上能用：先不回城
    if (need && this.hpR >= 0.2 && (restoring || (v.skillReady('heal') && calm && !me.inCombat))) need = false;
    if (!need) return false;
    // 团战正酣且占优就先打完
    if (this.time < this.fightUntil && this.adv >= 1.3 && this.hpR >= this.style.fleeHp) return false;
    this.label = 'go-home';
    this.gankId = -1;
    if (inBase) {
      this.baseStay = true;
      this.act.halt();
      return true;
    }
    if (dHome < 26) {
      this.baseStay = true;
      this.act.moveTo(this.home.x, this.home.y);
      return true;
    }
    // 找个安全的地方回城：附近没有敌人、不在塔下、没在挨打
    if (this.recallNow()) {
      this.baseStay = true;
      return true;
    }
    const spot = this.safeSpot();
    this.travel(spot.x, spot.y, 3);
    return true;
  }

  /**
   * 此刻原地回城(安全才回)。返回 true = 正在引导或刚开始引导；false = 这里不安全/技能没好，调用方自行走路。
   */
  recallNow(): boolean {
    const v = this.v;
    if (hasBuff(this.me, 'recall')) return true;
    const safe = (!this.nearFoe || this.nearFoeD > 14) && !this.inFoeRange && this.dmgRate <= 0 && this.minionsOnMe === 0 && this.foeMinionsWithin(7) === 0;
    if (!safe || !v.skillReady('recall') || v.busy()) return false;
    this.act.castSelf('recall');
    this.act.forget();
    return true;
  }

  private foeMinionsWithin(r: number): number {
    let n = 0;
    for (const m of this.foeMinions) if (dist(m.pos, this.me.pos) <= r) n++;
    return n;
  }

  // ───────────────────────── 交战 ─────────────────────────

  /** 够得着的距离：远程 = 射程 + 几步；近战 = 位移技能 + 几步 */
  engageDist(t: Unit): number {
    const me = this.me;
    if (this.ranged) return me.stats.attackRange + t.radius + 2.5;
    const gc = GAP_CLOSE[this.heroId];
    const dash = gc && this.v.skillReady(gc.slot) ? gc.reach : 0;
    return me.stats.attackRange + t.radius + 3.5 + dash;
  }

  /** 越塔强杀的条件：能秒，且扛几下塔之后还有不少血；或者兵线进塔 + 绝对优势 */
  private diveOk(t: HeroUnit, st: TowerUnit | CoreUnit, adv: number): boolean {
    if (!this.prof.dive || st.kind === 'core') return false;
    const me = this.me;
    const burst = estimateComboDamage(me, t) + 2 * estimateBasicDamage(me, t);
    const left = t.hp + t.shield;
    const towerHit = (st.stats.ad * 1.5 * ARMOR_K) / (ARMOR_K + me.stats.armor);
    if (burst >= left * 1.15 && me.hp - towerHit * 3 > me.stats.maxHp * 0.3 && adv >= 0.9) return true;
    return this.tankers >= 2 && adv >= 1.8 && this.hpR > 0.5;
  }

  /** 打 t 时我会站在哪：够得着就原地，否则是朝它走到刚好够得着的点 */
  private standPoint(t: Unit, out: Vec2): Vec2 {
    const me = this.me;
    const reach = me.stats.attackRange + t.radius;
    const dx = me.pos.x - t.pos.x;
    const dy = me.pos.y - t.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= reach || d < 1e-3) {
      out.x = me.pos.x;
      out.y = me.pos.y;
    } else {
      out.x = t.pos.x + (dx / d) * reach;
      out.y = t.pos.y + (dy / d) * reach;
    }
    return out;
  }

  private pickTarget(): HeroUnit | null {
    const me = this.me;
    const v = this.v;
    const range = me.stats.attackRange;
    let best: HeroUnit | null = null;
    let bestScore = -Infinity;
    for (const e of this.foes) {
      const d = dist(me.pos, e.pos);
      const hpR = e.hp / e.stats.maxHp;
      let s = 2 - d / 6 + (1 - hpR) * 2.2;
      const role = HEROES[e.heroId].role;
      if (role === 'mage' || role === 'marksman') s += this.style.diveBackline;
      if (e.id === this.brain.focusId && this.inMood(MOOD_FOCUS, this.prof.focus)) s += 1.5;
      if (e.id === this.fightTargetId && this.time < this.fightUntil + 1) s += 0.8;
      if (e.id === this.forceFightId) s += 10;
      if (e.targetId === me.id) s += 0.4;
      if (this.ranged && d <= range + e.radius + 0.5) s += 1;
      if (this.style.support) {
        // 坦克：优先处理贴到己方后排脸上的敌人
        for (const f of this.friends) {
          const fr = HEROES[f.heroId].role;
          if ((fr === 'mage' || fr === 'marksman') && dist(f.pos, e.pos) < 4.5) s += 1.2;
        }
      }
      if (v.enemyStructureCovering(e.pos, -0.5)) s -= 1.5;
      if (this.killable(e)) s += 2;
      if (s > bestScore) {
        bestScore = s;
        best = e;
      }
    }
    return best;
  }

  /** 补一个技能就能收掉的残血敌人：顺手收(施法不占用这次思考的移动/普攻决策) */
  private finish(): void {
    if (this.foes.length === 0 || this.v.busy()) return;
    for (const e of this.foes) {
      if (e.hp > e.stats.maxHp * 0.3) continue;
      if (finisherSkills(this, e)) return;
    }
  }

  private combat(): boolean {
    if (this.foes.length === 0) return false;
    const t = this.pickTarget();
    if (!t) return false;
    const me = this.me;
    const v = this.v;
    const time = this.time;
    const d = dist(me.pos, t.pos);
    const sp = this.standPoint(t, STAND);
    const adv = this.advantageAt(sp.x, sp.y);
    this.fightAdv = adv;
    let thr = (TUNE.advAllIn * this.style.engage) / this.prof.aggression;
    // 队友已经对这个目标开团了：跟上；抱团时还没人动手：后排和刺客等前排先开
    if (t.id === this.brain.focusId) thr *= TUNE.followUp;
    else if (!this.style.initiator && this.friendsNear >= 2 && this.brain.focusId < 0) thr *= TUNE.waitForEngage;
    // 刚撤下来：别一转头又冲回去
    const shaken = time < this.shakenUntil;
    if (shaken) thr *= TUNE.shakenFactor;
    const committed = time < this.fightUntil && this.fightTargetId === t.id;
    const reachNow = d <= me.stats.attackRange + t.radius + 1;
    const attacked = this.heroesOnMe > 0 || (me.inCombat && time - me.lastHitTime < 1.2);
    const eDist = this.engageDist(t);
    const canKill = this.killable(t);
    const feasible = this.killWindow(t);
    let go = false;
    let trade = false;
    if (t.id === this.forceFightId) go = true;
    else if (adv >= thr && feasible) go = true;
    else if (committed && !this.trading && adv >= Math.max(1, thr * 0.85) && feasible) go = true;
    else if (canKill && adv >= 0.75 && d <= eDist && feasible) go = true;
    else if (reachNow && adv >= TUNE.advPress * (shaken ? TUNE.shakenFactor : 1) && !this.respect) {
      // 压制：我更强，而他就站在我够得着的地方 —— 白打为什么不打(只用普攻和小技能；他走了也不追)
      go = true;
      trade = true;
    } else if (attacked && reachNow) {
      // 还手换血：势均力敌时只换几下 —— 换得越久，继续换下去要求的优势越大，避免两个人原地对砍到残血
      const since = time - this.tradeEnd < 3 ? this.tradeStart : time;
      if (adv >= TUNE.advFightBack + (time - since) * TUNE.tradeFatigue) {
        go = true;
        trade = true;
        this.tradeStart = since;
        this.tradeEnd = time;
      }
    }
    this.trading = trade;
    if (!go) return false;
    // 够不着：只有大优势追残血才追出去
    if (d > eDist && !(adv >= thr * 1.2 && d <= 14 && (t.hp < t.stats.maxHp * 0.5 || this.friendsNear >= 1))) return false;
    // 不追进敌方泉水
    if (this.nearFoeFountain(sp, 1.5)) return false;
    // 塔下的目标：满足越塔条件才上
    const st = v.enemyStructureCovering(sp, 0.3);
    if (st) {
      if (!this.diveOk(t, st, adv)) {
        // 不越塔。远程可以在塔外点到的话照打
        if (!(this.ranged && !v.enemyStructureCovering(me.pos, 0.3) && reachNow)) return false;
      } else {
        this.diving = true;
      }
    }
    this.fightUntil = time + TUNE.fightHold;
    this.fightTargetId = t.id;
    if (this.prof.focus > 0 && !trade) this.brain.callFocus(t.id, time);
    this.fight(t, d, !trade);
    return true;
  }

  /** allIn = 全力(连招、大招、闪现追杀)；否则只是还手换血(小技能 + 普攻) */
  private fight(t: HeroUnit, d: number, allIn: boolean): void {
    const v = this.v;
    const me = this.me;
    this.label = allIn ? 'fight' : 'trade';
    if (!v.busy()) {
      if (allIn) fightSkills(this, t);
      else pokeSkills(this, t);
    }
    // 闪现追杀：残血目标眼看要跑出射程，补一下就能收
    const reach = me.stats.attackRange + t.radius;
    if (allIn && d > reach + 0.8 && d < reach + 5 && t.hp <= estimateBasicDamage(me, t) * 1.6 && v.skillReady('flash') && !v.busy()) {
      if (this.inMood(MOOD_FLASH, this.prof.flashKill)) {
        const ux = (t.pos.x - me.pos.x) / d;
        const uy = (t.pos.y - me.pos.y) / d;
        TMP.x = me.pos.x + ux * 5;
        TMP.y = me.pos.y + uy * 5;
        if (v.walkable(TMP) && (this.diving || !v.enemyStructureCovering(TMP, 0))) {
          this.act.castDir('flash', ux, uy);
          this.act.forget();
        }
      }
    }
    if (this.ranged) this.kite(t);
    else this.act.attack(t.id);
  }

  /** 离我最近、已经贴上来的敌方近战英雄 */
  private meleeThreat(): HeroUnit | null {
    let best: HeroUnit | null = null;
    let bd = Infinity;
    for (const e of this.foes) {
      if (e.stats.attackRange >= 4) continue;
      const d = dist(this.me.pos, e.pos);
      if (d < e.stats.attackRange + 2.4 && d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** 远程的走 A：能打就打；攻击间隙里如果有近战贴脸就往后拉 */
  kite(t: Unit): void {
    const v = this.v;
    const me = this.me;
    const act = this.act;
    if (!this.prof.orbwalk || v.attackWindup()) {
      act.attack(t.id);
      return;
    }
    const cd = v.attackCooldown();
    const threat = this.meleeThreat();
    if (!threat || cd <= this.interval * 0.7) {
      act.attack(t.id);
      return;
    }
    // 远离威胁 + 一点回家方向
    let ux = me.pos.x - threat.pos.x;
    let uy = me.pos.y - threat.pos.y;
    const l = Math.hypot(ux, uy) || 1;
    const hl = dist(this.home, me.pos) || 1;
    ux = ux / l + ((this.home.x - me.pos.x) / hl) * 0.5;
    uy = uy / l + ((this.home.y - me.pos.y) / hl) * 0.5;
    const n = Math.hypot(ux, uy) || 1;
    TMP.x = me.pos.x + (ux / n) * 2;
    TMP.y = me.pos.y + (uy / n) * 2;
    if (!v.walkable(TMP) || v.enemyStructureCovering(TMP, 0)) {
      act.attack(t.id);
      return;
    }
    act.moveDir(ux / n, uy / n);
  }

  // ───────────────────────── 支援 ─────────────────────────

  /** 附近(一屏开外)有队友在和敌人交手：状态好、去了能赢就赶过去 */
  private assist(): boolean {
    if (this.hpR < 0.5) return false;
    const v = this.v;
    const me = this.me;
    const task = this.brain.taskOf(this.heroId);
    // 对线期的线上英雄只管同路队友；打野和中后期按协作意愿支援更远的
    const laning = this.brain.phase === 'lane' && task.kind === 'lane';
    const maxD = laning ? 16 : 30;
    let ally: HeroUnit | null = null;
    let bd = Infinity;
    for (const h of v.alliedHeroes()) {
      if (h === me || !h.inCombat) continue;
      const d = dist(me.pos, h.pos);
      if (d < 7) {
        // 已经赶到他身边：打不打由交战判断说了算。没打起来就歇一会儿再响应，免得在「过去」和「回去干活」之间折返
        if (h.id === this.assistId) {
          this.assistId = -1;
          this.assistBanUntil = this.time + 6;
        }
        continue;
      }
      if (d > maxD || d >= bd) continue;
      // 他附近得真有看得见的敌人
      let foe = false;
      for (const e of this.foesAll) if (dist(e.pos, h.pos) < 11) foe = true;
      if (!foe) continue;
      bd = d;
      ally = h;
    }
    if (!ally) return false;
    const time = this.time;
    // 决定去支援就走一段，决定不去也别马上反悔 —— 逐次思考重新判断会在两个任务之间来回折返
    const committed = ally.id === this.assistId && time < this.assistUntil;
    if (!committed) {
      if (time < this.assistBanUntil) return false;
      if (!laning && !this.inMood(MOOD_ASSIST, this.prof.teamwork)) return false;
      if (this.advantageAt(ally.pos.x, ally.pos.y) < 1.05 || v.enemyStructureCovering(ally.pos, 1)) {
        this.assistBanUntil = time + 3;
        return false;
      }
      this.assistId = ally.id;
      this.assistUntil = time + 2.5;
    } else if (this.advantageAt(ally.pos.x, ally.pos.y) < 0.8) {
      this.assistUntil = 0;
      this.assistBanUntil = time + 3;
      return false;
    }
    this.travel(ally.pos.x, ally.pos.y, 2.5);
    this.label = 'assist';
    return true;
  }
}
