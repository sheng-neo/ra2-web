/**
 * 简易兜底 AI：沿分路推进、打最近的敌人、塔下没兵就退、残血回泉水、按推荐出装买装备。
 * 目的只是让引擎在正式 Bot(ai/index.ts 里替换工厂)完成之前就能无头跑完整对局；它不会打野、不会配合。
 */
import { HEROES } from '../data/heroes';
import { ITEMS, SELL_RATIO } from '../data/items';
import { LanePath } from '../lanes';
import type { AbilitySlot, CoreUnit, HeroUnit, LaneId, TowerUnit, Unit, Vec2 } from '../types';
import type { BotController, BotView } from './types';

const ABILITIES: AbilitySlot[] = ['s1', 's2', 'ult'];
/** 残血撤退 / 回满再出门 的血量比例（每个 Bot 在此基础上有一点随机浮动，避免双方镜像地做出完全相同的决定） */
const RETREAT_HP = 0.3;
const RECOVERED_HP = 0.85;

const lanePaths = new WeakMap<object, Record<LaneId, LanePath>>();

function pathsOf(view: BotView): Record<LaneId, LanePath> {
  let p = lanePaths.get(view.map);
  if (!p) {
    p = { top: new LanePath(view.map.lanes.top), mid: new LanePath(view.map.lanes.mid), bot: new LanePath(view.map.lanes.bot) };
    lanePaths.set(view.map, p);
  }
  return p;
}

const edgeDist = (a: Vec2, u: Unit): number => Math.hypot(u.pos.x - a.x, u.pos.y - a.y) - u.radius;

export class FallbackBot implements BotController {
  readonly interval = 0.25;
  private readonly lane: LaneId;
  /** 沿兵线前进方向：蓝 +1，红 -1 */
  private readonly dir: 1 | -1;
  private retreating = false;
  private readonly retreatHp: number;
  /** 站位的前后随机偏移（米） */
  private readonly anchorJitter: number;
  private buildIdx = 0;
  private lastGoal: Vec2 = { x: 1e9, y: 1e9 };
  private readonly tmp: Vec2 = { x: 0, y: 0 };

  constructor(view: BotView) {
    // 打野位在兜底 AI 里当作上路的第二人
    this.lane = view.hero.lane === 'jungle' ? 'top' : view.hero.lane;
    this.dir = view.team === 0 ? 1 : -1;
    this.retreatHp = RETREAT_HP + view.rng.range(-0.05, 0.05);
    this.anchorJitter = view.rng.range(-1, 1);
  }

  think(v: BotView): void {
    const me = v.hero;
    this.shop(v);
    if (!me.alive || v.state.over) return;
    const hpRatio = me.hp / me.stats.maxHp;
    const fountain = v.map.bases[v.team].fountain;
    const toFountain = Math.hypot(me.pos.x - fountain.x, me.pos.y - fountain.y);

    // —— 残血回泉水 ——
    if (this.retreating) {
      if (hpRatio >= RECOVERED_HP) this.retreating = false;
    } else if (hpRatio < this.retreatHp) {
      this.retreating = true;
    }
    if (this.retreating) {
      if (hpRatio < 0.45 && v.skillReady('heal') && me.inCombat) v.command({ type: 'cast', slot: 'heal' });
      if (toFountain < 2.5) return;
      const channeling = me.buffs.some((b) => b.id === 'recall');
      let threatened = v.enemyStructureCovering(me.pos, 1) !== null;
      for (const e of v.enemies()) if (edgeDist(me.pos, e) < 11) threatened = true;
      if (!threatened && toFountain > 25) {
        if (!channeling && v.skillReady('recall')) v.command({ type: 'cast', slot: 'recall' });
        if (channeling || v.skillReady('recall')) return;
      }
      this.moveTo(v, fountain);
      return;
    }

    const path = pathsOf(v)[this.lane];
    const myS = path.project(me.pos.x, me.pos.y);

    // —— 塔下没有己方小兵，或者塔正在打我：后撤 ——
    const cover = v.enemyStructureCovering(me.pos, 1.5);
    if (cover && (cover.targetId === me.id || !this.minionsTanking(v, cover))) {
      path.pointAt(myS - this.dir * 9, this.tmp);
      this.moveTo(v, this.tmp);
      return;
    }

    // —— 选目标 ——
    const range = me.stats.attackRange;
    let target: Unit | null = null;
    let heroTarget: HeroUnit | null = null;
    let best = Infinity;
    for (const e of v.enemyHeroes()) {
      const d = edgeDist(me.pos, e);
      if (d > range + 4) continue;
      // 不追进没有兵线掩护的敌方塔下
      const guard = v.enemyStructureCovering(e.pos, 0);
      if (guard && !this.minionsTanking(v, guard)) continue;
      const score = e.hp / e.stats.maxHp;
      if (score < best) {
        best = score;
        heroTarget = e;
      }
    }
    target = heroTarget;
    if (!target) {
      best = Infinity;
      for (const e of v.enemies()) {
        if (e.kind !== 'minion' || edgeDist(me.pos, e) > range + 5) continue;
        if (e.hp < best) {
          best = e.hp;
          target = e;
        }
      }
    }
    if (!target) {
      for (const s of v.enemyStructures()) {
        if (s.invulnerable || edgeDist(me.pos, s) > range + 6) continue;
        if (this.minionsTanking(v, s)) target = s;
      }
    }

    if (target) {
      if (heroTarget) this.useSkills(v, heroTarget);
      v.command({ type: 'attack', targetId: target.id });
      this.lastGoal.x = 1e9;
      return;
    }

    // —— 没有目标：跟着兵线推进 ——
    this.moveTo(v, this.laneAnchor(v, path));
  }

  /** 这座建筑的射程内有没有己方小兵替我扛塔 */
  private minionsTanking(v: BotView, s: TowerUnit | CoreUnit): boolean {
    const r = s.stats.attackRange;
    for (const a of v.allies()) {
      if (a.kind !== 'minion') continue;
      const dx = a.pos.x - s.pos.x;
      const dy = a.pos.y - s.pos.y;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    return false;
  }

  /** 站位点：己方最靠前的小兵身后；没有小兵就守在本路最外侧的己方塔后 */
  private laneAnchor(v: BotView, path: LanePath): Vec2 {
    const me = v.hero;
    const back = (me.stats.attackRange > 4 ? 4.5 : 1.5) + this.anchorJitter;
    let front = -Infinity;
    for (const a of v.allies()) {
      if (a.kind !== 'minion' || a.lane !== this.lane) continue;
      const s = path.project(a.pos.x, a.pos.y) * this.dir;
      if (s > front) front = s;
    }
    if (front === -Infinity) {
      let tier = 99;
      for (const s of v.alliedStructures()) {
        if (s.kind !== 'tower' || s.lane !== this.lane || s.tier >= tier) continue;
        tier = s.tier;
        front = path.project(s.pos.x, s.pos.y) * this.dir;
      }
      if (front === -Infinity) front = (this.dir > 0 ? 0 : path.total) * this.dir + 6;
      front -= 1;
    }
    path.pointAt((front - back) * this.dir, this.tmp);
    return this.tmp;
  }

  private moveTo(v: BotView, goal: Vec2): void {
    const me = v.hero;
    const moving = me.anim === 'move';
    const changed = Math.hypot(goal.x - this.lastGoal.x, goal.y - this.lastGoal.y) > 1.5;
    const there = Math.hypot(goal.x - me.pos.x, goal.y - me.pos.y) < 1.2;
    if (there) {
      if (moving) v.command({ type: 'stop' });
      this.lastGoal.x = 1e9;
      return;
    }
    // 目标没怎么变且还在路上就不重复下令（每次 moveTo 都可能触发一次寻路）
    if (!changed && moving) return;
    this.lastGoal.x = goal.x;
    this.lastGoal.y = goal.y;
    v.command({ type: 'moveTo', pos: { x: goal.x, y: goal.y } });
  }

  private useSkills(v: BotView, enemy: HeroUnit): void {
    const me = v.hero;
    const d = edgeDist(me.pos, enemy);
    for (const slot of ABILITIES) {
      if (!v.skillReady(slot)) continue;
      const spec = v.castSpec(slot);
      const reach = spec.type === 'self' ? Math.max(spec.radius, me.stats.attackRange) : spec.range;
      if (d > reach) continue;
      v.command({ type: 'cast', slot, targetId: enemy.id });
      return;
    }
    if (me.hp < me.stats.maxHp * 0.45 && v.skillReady('heal')) v.command({ type: 'cast', slot: 'heal' });
  }

  /** 按推荐出装顺序购买，钱够就买 */
  private shop(v: BotView): void {
    const me = v.hero;
    const build = HEROES[me.heroId].build;
    if (this.buildIdx >= build.length) return;
    const id = build[this.buildIdx];
    const item = ITEMS[id];
    let cost = item.cost;
    const ownedBoots = me.items.find((it) => it !== null && ITEMS[it].category === 'boots');
    if (item.category === 'boots' && ownedBoots) {
      if (ownedBoots === id || item.tier === 1) {
        this.buildIdx++;
        return;
      }
      cost -= Math.floor(ITEMS[ownedBoots].cost * SELL_RATIO);
    } else if (me.items.indexOf(null) < 0) {
      return;
    }
    if (me.gold < cost) return;
    v.command({ type: 'buy', itemId: id });
    this.buildIdx++;
  }
}
