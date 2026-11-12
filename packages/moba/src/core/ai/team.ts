/**
 * 队伍大脑（战略层）：同队 Bot 共用的一块「黑板」，相当于队内语音/信号。
 *
 * 只汇总本队本来就能看到的信息(己方单位、可见敌人、建筑、记分板、野怪)，据此给每个英雄派任务：
 *   lane 对线 / jungle 打野 / push 抱团推进 / defend 回防 / epic 打史诗野怪
 * 另外维护：各路兵线态势、集火目标、「看见敌人交过哪些技能」的记忆。
 * 英雄自己的战术层(bot.ts)拿到任务后自行决定怎么执行，生存/战斗判断可以临时压过任务。
 */
import { HEROES, skillLevelsAt } from '../data/heroes';
import { MONSTERS } from '../data/units';
import type {
  AbilitySlot, CoreUnit, HeroId, HeroUnit, LaneId, MonsterUnit, PlayerTeam, TowerUnit, UnitAnim, Vec2,
} from '../types';
import { dist, LANES, laneGeo, type LaneGeo } from './geom';
import { PROFILES, TUNE, type Profile } from './params';
import type { BotView, PublicState } from './types';

export type Phase = 'lane' | 'mid' | 'late';
export type TaskKind = 'lane' | 'jungle' | 'push' | 'defend' | 'epic';

export interface Task {
  kind: TaskKind;
  /** lane / push / defend 的目标路 */
  lane: LaneId;
  /** epic 的营地 id */
  campId: number;
}

export interface LaneState {
  lane: LaneId;
  /** 己方 / (可见的)敌方最靠前小兵的进度；没有为 -1 */
  allyFront: number;
  enemyFront: number;
  allyMinions: number;
  enemyMinions: number;
  /** 己方在这条路上最外侧的存活建筑(塔全毁则为水晶)与它的进度 */
  ownStruct: TowerUnit | CoreUnit;
  ownP: number;
  /** 敌方在这条路上当前可以攻击的建筑(最外侧的塔；塔全毁则为水晶)与它的进度 */
  foeStruct: TowerUnit | CoreUnit;
  foeP: number;
  /** 敌方这条路还剩几座塔 */
  foeTowers: number;
  ownTowers: number;
  /** 己方建筑附近的敌方英雄数 / 小兵数，与综合威胁值 */
  threatHeroes: number;
  threatMinions: number;
  threat: number;
  /** 这条路上可见的敌方英雄数 */
  foeHeroes: number;
  /** 己方小兵已经进入敌方建筑射程(可以点塔) */
  atFoeStruct: boolean;
}

/** 看见敌方英雄做出某个动作 = 他交了哪个技能（位移技能没有 cast_* 动作，靠 dash/leap/spin 识别） */
const ANIM_SLOT: Record<HeroId, Partial<Record<UnitAnim, AbilitySlot>>> = {
  panyue: { cast_s2: 's2', dash: 's1', leap: 'ult' },
  chijin: { cast_s1: 's1', dash: 's2', spin: 'ult' },
  xingli: { cast_s1: 's1', cast_s2: 's2', cast_ult: 'ult' },
  fengling: { cast_s1: 's1', dash: 's2', cast_ult: 'ult' },
  yeque: { dash: 's1', cast_s2: 's2', cast_ult: 'ult' },
};

const THREAT_HERO_RANGE = 20;
const THREAT_MINION_RANGE = 10;
/** 认为敌人「没带冷却缩减」会高估他技能转好的时间，这里按 10% 估 */
const ASSUMED_CDR = 0.1;

export class TeamBrain {
  readonly team: PlayerTeam;
  readonly enemyTeam: PlayerTeam;
  readonly geo: LaneGeo;
  readonly profile: Profile;
  phase: Phase = 'lane';
  readonly lanes: Record<LaneId, LaneState>;
  readonly tasks = new Map<HeroId, Task>();
  pushLane: LaneId = 'mid';
  aliveAllies = 5;
  aliveFoes = 5;
  /** 人数劣势，收缩防守 */
  turtle = false;
  /** 当前要打的史诗野怪营地(-1 = 没有) */
  epicCamp = -1;
  /** 集火目标 */
  focusId = -1;
  private focusUntil = 0;
  private epicSince = 0;
  private epicRetryAt = 0;
  private epicLastHp = new Map<number, number>();
  private nextUpdate = -1;
  private lastTime = -1;
  private readonly casts = new Map<number, Record<AbilitySlot, number>>();
  private readonly castStamp = new Map<number, number>();
  private readonly tmp: Vec2 = { x: 0, y: 0 };

  constructor(view: BotView) {
    this.team = view.team;
    this.enemyTeam = view.enemyTeam;
    this.geo = laneGeo(view.map);
    this.profile = PROFILES[view.difficulty];
    const core = view.alliedStructures().find((s) => s.kind === 'core') as CoreUnit;
    const foeCore = view.enemyStructures().find((s) => s.kind === 'core') as CoreUnit;
    const mk = (lane: LaneId): LaneState => ({
      lane, allyFront: -1, enemyFront: -1, allyMinions: 0, enemyMinions: 0, ownStruct: core, ownP: 0, foeStruct: foeCore, foeP: 0,
      foeTowers: 3, ownTowers: 3, threatHeroes: 0, threatMinions: 0, threat: 0, foeHeroes: 0, atFoeStruct: false,
    });
    this.lanes = { top: mk('top'), mid: mk('mid'), bot: mk('bot') };
  }

  // ───────────────────────── 每个 Bot 思考前调用 ─────────────────────────

  /** 记下「看见敌人交了技能」。每个 Bot 思考时都调，等于全队共享情报 */
  observe(v: BotView): void {
    if (v.time === this.lastTime) return;
    this.lastTime = v.time;
    const board = v.scoreboard();
    for (let i = 0; i < board.length; i++) {
      const e = board[i];
      if (e.team === this.team || !e.alive || !v.canSee(e)) continue;
      const slot = ANIM_SLOT[e.heroId][e.anim];
      if (!slot) continue;
      // 同一次动作只记一次
      if (this.castStamp.get(e.id * 4 + (slot === 's1' ? 0 : slot === 's2' ? 1 : 2)) === e.animStart) continue;
      this.castStamp.set(e.id * 4 + (slot === 's1' ? 0 : slot === 's2' ? 1 : 2), e.animStart);
      let rec = this.casts.get(e.id);
      if (!rec) {
        rec = { s1: -999, s2: -999, ult: -999 };
        this.casts.set(e.id, rec);
      }
      rec[slot] = e.animStart;
    }
  }

  /** 推断敌方英雄的某个技能现在是否可用（没见他交过就当作可用） */
  enemyReady(e: HeroUnit, slot: AbilitySlot, time: number): boolean {
    const level = skillLevelsAt(e.level)[slot];
    if (level <= 0) return false;
    const rec = this.casts.get(e.id);
    if (!rec) return true;
    const cd = HEROES[e.heroId].skills[slot].cooldown[level - 1] * (1 - ASSUMED_CDR);
    return time - rec[slot] >= cd;
  }

  update(v: BotView): void {
    this.observe(v);
    if (v.time < this.nextUpdate) return;
    this.nextUpdate = v.time + TUNE.teamTick;
    this.refreshLanes(v);
    this.refreshPhase(v);
    this.choosePushLane(v);
    this.refreshEpic(v);
    this.assign(v);
    if (v.time >= this.focusUntil) this.focusId = -1;
  }

  taskOf(heroId: HeroId): Task {
    return this.tasks.get(heroId) ?? { kind: 'lane', lane: 'mid', campId: -1 };
  }

  callFocus(id: number, time: number): void {
    this.focusId = id;
    this.focusUntil = time + 2.5;
  }

  // ───────────────────────── 兵线态势 ─────────────────────────

  private refreshLanes(v: BotView): void {
    const geo = this.geo;
    const team = this.team;
    for (const lane of LANES) {
      const ls = this.lanes[lane];
      ls.allyFront = -1;
      ls.enemyFront = -1;
      ls.allyMinions = 0;
      ls.enemyMinions = 0;
      ls.threatHeroes = 0;
      ls.threatMinions = 0;
      ls.foeHeroes = 0;
      ls.atFoeStruct = false;
      ls.ownTowers = 0;
      ls.foeTowers = 0;
    }
    // 建筑：每路最外侧的塔；没有塔了就是水晶
    let core: CoreUnit | null = null;
    let foeCore: CoreUnit | null = null;
    const ownTier: Record<LaneId, number> = { top: 9, mid: 9, bot: 9 };
    const foeTier: Record<LaneId, number> = { top: 9, mid: 9, bot: 9 };
    for (const s of v.alliedStructures()) {
      if (s.kind === 'core') {
        core = s;
        continue;
      }
      const ls = this.lanes[s.lane];
      ls.ownTowers++;
      if (s.tier < ownTier[s.lane]) {
        ownTier[s.lane] = s.tier;
        ls.ownStruct = s;
      }
    }
    for (const s of v.enemyStructures()) {
      if (s.kind === 'core') {
        foeCore = s;
        continue;
      }
      const ls = this.lanes[s.lane];
      ls.foeTowers++;
      if (s.tier < foeTier[s.lane]) {
        foeTier[s.lane] = s.tier;
        ls.foeStruct = s;
      }
    }
    for (const lane of LANES) {
      const ls = this.lanes[lane];
      if (ls.ownTowers === 0 && core) ls.ownStruct = core;
      if (ls.foeTowers === 0 && foeCore) ls.foeStruct = foeCore;
      ls.ownP = geo.prog(team, lane, ls.ownStruct.pos.x, ls.ownStruct.pos.y);
      ls.foeP = geo.prog(team, lane, ls.foeStruct.pos.x, ls.foeStruct.pos.y);
    }
    // 小兵前线
    for (const u of v.allies()) {
      if (u.kind !== 'minion') continue;
      const ls = this.lanes[u.lane];
      const p = geo.prog(team, u.lane, u.pos.x, u.pos.y);
      ls.allyMinions++;
      if (p > ls.allyFront) ls.allyFront = p;
      if (dist(u.pos, ls.foeStruct.pos) <= ls.foeStruct.stats.attackRange) ls.atFoeStruct = true;
    }
    for (const u of v.enemies()) {
      if (u.kind === 'minion') {
        const ls = this.lanes[u.lane];
        const p = geo.prog(team, u.lane, u.pos.x, u.pos.y);
        ls.enemyMinions++;
        if (ls.enemyFront < 0 || p < ls.enemyFront) ls.enemyFront = p;
        if (dist(u.pos, ls.ownStruct.pos) <= THREAT_MINION_RANGE) ls.threatMinions++;
      } else if (u.kind === 'hero') {
        const lane = geo.nearestLane(u.pos.x, u.pos.y);
        if (geo.lateral < 10) this.lanes[lane].foeHeroes++;
        for (const l of LANES) {
          const ls = this.lanes[l];
          if (dist(u.pos, ls.ownStruct.pos) <= THREAT_HERO_RANGE) ls.threatHeroes++;
        }
      }
    }
    for (const lane of LANES) {
      const ls = this.lanes[lane];
      const hit = v.time - ls.ownStruct.lastHitTime < 3 ? 1 : 0;
      ls.threat = ls.threatHeroes * 2 + Math.min(ls.threatMinions, 6) * 0.35 + hit;
    }
  }

  private refreshPhase(v: BotView): void {
    const st = v.state;
    const board = v.scoreboard();
    let a = 0;
    let e = 0;
    for (let i = 0; i < board.length; i++) {
      if (!board[i].alive) continue;
      if (board[i].team === this.team) a++;
      else e++;
    }
    this.aliveAllies = a;
    this.aliveFoes = e;
    // 少两个人以上就收缩；人数追平后才恢复(滞回)
    if (a <= e - 2) this.turtle = true;
    else if (a >= e) this.turtle = false;
    const down = st.teams[0].towersDestroyed + st.teams[1].towersDestroyed;
    if (this.phase === 'lane' && (v.time >= TUNE.laneEnd || (down >= 1 && v.time >= TUNE.laneEnd * 0.7))) this.phase = 'mid';
    if (this.phase !== 'late' && (v.time >= TUNE.lateStart || down >= 4)) this.phase = 'late';
  }

  /** 主推路：进度最好(敌塔最少/血量最低)、兵线占优的那一路；带滞回避免来回换线 */
  private choosePushLane(v: BotView): void {
    let best: LaneId = this.pushLane;
    let bestScore = -Infinity;
    for (const lane of LANES) {
      const ls = this.lanes[lane];
      const hp = ls.foeStruct.hp / ls.foeStruct.stats.maxHp;
      let score = (3 - ls.foeTowers) * 1.2 + (1 - hp) * 1.2;
      if (lane === 'mid') score += 0.6;
      if (ls.allyFront >= 0) score += (ls.allyFront - this.geo.total(lane) * 0.5) / 30;
      if (ls.atFoeStruct) score += 0.8;
      if (lane === this.pushLane) score += 1.2;
      // 己方这条路的高地已破：对面会出超级兵，得优先处理
      if (ls.ownTowers === 0) score -= 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = lane;
      }
    }
    void v;
    this.pushLane = best;
  }

  // ───────────────────────── 史诗野怪 ─────────────────────────

  private epicMonster(v: BotView, campId: number): MonsterUnit | null {
    for (const m of v.monsters()) if (m.campId === campId) return m;
    return null;
  }

  private refreshEpic(v: BotView): void {
    const time = v.time;
    if (this.epicCamp >= 0) {
      const mon = this.epicMonster(v, this.epicCamp);
      // 打完 / 拖太久 / 人数落入劣势 → 放弃
      if (!mon || time - this.epicSince > 50 || this.turtle) {
        this.epicCamp = -1;
        this.epicRetryAt = time + 12;
      }
      return;
    }
    if (time < this.epicRetryAt || this.turtle || time < 140) return;
    this.epicRetryAt = time + 4;
    const board = v.scoreboard();
    for (const camp of v.map.camps) {
      if (!MONSTERS[camp.monsterType].epic) continue;
      const mon = this.epicMonster(v, camp.id);
      if (!mon) {
        this.epicLastHp.delete(camp.id);
        continue;
      }
      const colossus = camp.monsterType === 'star_colossus';
      const needHeroes = colossus ? TUNE.colossusHeroes : TUNE.drakeHeroes;
      const needLevel = colossus ? TUNE.colossusLevel : TUNE.drakeLevel;
      // 可以叫来的人：存活、状态尚可、离得不太远
      let n = 0;
      let lv = 0;
      for (let i = 0; i < board.length; i++) {
        const h = board[i];
        if (h.team !== this.team || !h.alive || h.hp < h.stats.maxHp * 0.55) continue;
        if (dist(h.pos, camp.pos) > 48) continue;
        n++;
        lv += h.level;
      }
      if (n < needHeroes || lv / n < needLevel) continue;
      // 营地附近有几个可见的敌人
      let foesNear = 0;
      for (const e of v.enemyHeroes()) if (dist(e.pos, camp.pos) < 20) foesNear++;
      // 野怪在掉血而我们没人在打 = 对面在偷：协作好的队伍会去抢
      const last = this.epicLastHp.get(camp.id) ?? mon.hp;
      this.epicLastHp.set(camp.id, mon.hp);
      const beingTaken = mon.hp < last - 1 && mon.hp < mon.stats.maxHp * 0.9;
      const numbers = this.aliveAllies - this.aliveFoes;
      let want = false;
      if (beingTaken) want = this.profile.teamwork >= 0.9 && n >= needHeroes + 1;
      else if (foesNear >= n) want = false;
      else if (numbers >= 1) want = true;
      else if (this.phase !== 'lane' && numbers >= 0) want = v.rng.chance(0.25 * this.profile.teamwork);
      if (!want) continue;
      this.epicCamp = camp.id;
      this.epicSince = time;
      return;
    }
  }

  // ───────────────────────── 派任务 ─────────────────────────

  private assign(v: BotView): void {
    const board = v.scoreboard();
    const allies: HeroUnit[] = [];
    for (let i = 0; i < board.length; i++) if (board[i].team === this.team) allies.push(board[i]);
    const numbers = this.aliveAllies - this.aliveFoes;
    // 多两个人：全员压上(推塔/上高地)
    const powerPlay = this.phase !== 'lane' && numbers >= 2;

    // —— 默认任务 ——
    for (const h of allies) {
      let task: Task;
      const home: LaneId = h.lane === 'jungle' ? 'mid' : h.lane;
      if (this.phase === 'late' || powerPlay) {
        task = { kind: 'push', lane: this.pushLane, campId: -1 };
      } else if (h.lane === 'jungle') {
        task = { kind: 'jungle', lane: home, campId: -1 };
      } else if (this.phase === 'mid' && this.lanes[home].foeTowers < 3) {
        // 本路外塔已破：转去主推路集合
        task = { kind: 'push', lane: this.pushLane, campId: -1 };
      } else {
        task = { kind: 'lane', lane: home, campId: -1 };
      }
      this.tasks.set(h.heroId, task);
    }

    // —— 人数劣势：不主动推进，守最吃紧的那一路 ——
    if (this.turtle) {
      let lane: LaneId = this.pushLane;
      let worst = 0;
      for (const l of LANES) {
        if (this.lanes[l].threat > worst) {
          worst = this.lanes[l].threat;
          lane = l;
        }
      }
      for (const h of allies) {
        const t = this.tasks.get(h.heroId);
        if (t && t.kind === 'push') this.tasks.set(h.heroId, { kind: 'defend', lane: worst > 0 ? lane : t.lane, campId: -1 });
      }
    }

    // —— 回防：按威胁从大到小，每路派最近的人 ——
    const taken = new Set<HeroId>();
    const order = [...LANES].sort((a, b) => this.lanes[b].threat - this.lanes[a].threat);
    for (const lane of order) {
      const ls = this.lanes[lane];
      if (ls.threat < 1.2) continue;
      const critical = ls.ownStruct.kind === 'core' || (ls.ownStruct.kind === 'tower' && ls.ownStruct.tier === 3);
      let need: number;
      if (this.phase === 'lane') {
        // 对线期：这路自己的人还在就不用别人；人不在(阵亡/回城)时让打野来补
        let present = false;
        for (const h of allies) if (h.alive && h.lane === lane && dist(h.pos, ls.ownStruct.pos) < 24) present = true;
        need = present ? 0 : 1;
      } else {
        need = ls.threatHeroes > 0 ? ls.threatHeroes + (critical ? 1 : 0) : ls.threatMinions >= 3 ? 1 : 0;
        if (critical && ls.threatHeroes >= 2) need = 5;
      }
      if (need <= 0) continue;
      const cands = allies.filter((h) => h.alive && !taken.has(h.heroId)).sort((a, b) => dist(a.pos, ls.ownStruct.pos) - dist(b.pos, ls.ownStruct.pos));
      for (const h of cands) {
        if (need <= 0) break;
        // 对线期只调动打野和本路英雄，别把其他路的人拽走
        if (this.phase === 'lane' && h.lane !== 'jungle' && h.lane !== lane) continue;
        if (dist(h.pos, ls.ownStruct.pos) > 70 && !critical) continue;
        this.tasks.set(h.heroId, { kind: 'defend', lane, campId: -1 });
        taken.add(h.heroId);
        need--;
      }
    }

    // —— 史诗野怪：打野 + 附近状态好的队友 ——
    if (this.epicCamp >= 0) {
      const camp = v.map.camps[this.epicCamp];
      const colossus = camp.monsterType === 'star_colossus';
      const want = (colossus ? TUNE.colossusHeroes : TUNE.drakeHeroes) + 1;
      const cands = allies
        .filter((h) => h.alive && !taken.has(h.heroId) && h.hp >= h.stats.maxHp * 0.5 && dist(h.pos, camp.pos) < 55)
        .sort((a, b) => (a.lane === 'jungle' ? -100 : 0) + dist(a.pos, camp.pos) - ((b.lane === 'jungle' ? -100 : 0) + dist(b.pos, camp.pos)));
      let n = 0;
      for (const h of cands) {
        if (n >= want) break;
        this.tasks.set(h.heroId, { kind: 'epic', lane: 'mid', campId: this.epicCamp });
        n++;
      }
      if (n < (colossus ? TUNE.colossusHeroes : TUNE.drakeHeroes)) {
        // 人凑不齐：取消
        for (const h of cands) {
          const t = this.tasks.get(h.heroId);
          if (t && t.kind === 'epic') this.tasks.set(h.heroId, h.lane === 'jungle' ? { kind: 'jungle', lane: 'mid', campId: -1 } : { kind: 'lane', lane: h.lane, campId: -1 });
        }
        this.epicCamp = -1;
        this.epicRetryAt = v.time + 8;
      }
    }
  }

  /** 推进/打龙时身边聚了多少队友（含自己）：pos 周围 radius 内的存活己方英雄数 */
  alliesNear(v: BotView, pos: Vec2, radius: number): number {
    let n = 0;
    for (const h of v.alliedHeroes()) if (dist(h.pos, pos) <= radius) n++;
    return n;
  }

  /** 被派去同一个推进任务的存活队友数（含自己） */
  pushers(v: BotView, lane: LaneId): number {
    let n = 0;
    for (const h of v.alliedHeroes()) {
      const t = this.tasks.get(h.heroId);
      if (t && t.kind === 'push' && t.lane === lane) n++;
    }
    return n;
  }

  /** 兵线上某进度处的点（己方坐标），写入内部缓冲 */
  lanePoint(lane: LaneId, p: number, side = 0): Vec2 {
    return this.geo.point(this.team, lane, p, this.tmp, side);
  }
}

const brains = new WeakMap<PublicState, [TeamBrain | null, TeamBrain | null]>();

/** 取(或创建)本队的队伍大脑。按对局状态对象挂载，不同对局互不干扰 */
export function teamBrain(view: BotView): TeamBrain {
  let pair = brains.get(view.state);
  if (!pair) {
    pair = [null, null];
    brains.set(view.state, pair);
  }
  let b = pair[view.team];
  if (!b) {
    b = new TeamBrain(view);
    pair[view.team] = b;
  }
  return b;
}
