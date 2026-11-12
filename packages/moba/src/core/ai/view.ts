/**
 * BotView 的实现：对 Sim 的只读、按队伍可见性过滤的视图。
 * 列表类查询在同一个模拟 tick 内只计算一次（缓存），Bot 一次 think 里反复调用没有额外开销。
 */
import { HEROES } from '../data/heroes';
import { MOVE_DIR, MOVE_PATH, type SimHero, type SimUnit } from '../internal';
import { pathLength, segmentHitsZones, type AvoidZone } from '../nav';
import type { Rng } from '../rng';
import { getSkill, isSummonerSlot, SUMMONER_CAST } from '../skills/registry';
import type {
  AreaEffect, CastSpec, CoreUnit, Difficulty, HeroUnit, MapData, MonsterUnit, PlayerCommand, PlayerTeam, Projectile, SkillSlot,
  TowerUnit, Unit, Vec2,
} from '../types';
import { bushIndexAt } from '../vision';
import type { Sim } from '../world';
import type { BotView, ConeHazard, LastSeen, PublicState } from './types';

/** safePath 的 A* 启发权重 */
const SAFE_PATH_GREED = 1.6;
/** 感知敌方区域/弹道的距离（约等于英雄视野） */
const PERCEPTION_RANGE = 13;
const NO_CONES: readonly ConeHazard[] = [];

export class SimBotView implements BotView {
  readonly hero: HeroUnit;
  readonly team: PlayerTeam;
  readonly enemyTeam: PlayerTeam;
  readonly difficulty: Difficulty;
  readonly rng: Rng;
  readonly map: MapData;
  readonly state: PublicState;

  private readonly sim: Sim;
  private readonly self: SimHero;
  private cacheTick = -1;
  private cAllies: Unit[] = [];
  private cAlliedHeroes: HeroUnit[] = [];
  private cEnemies: Unit[] = [];
  private cEnemyHeroes: HeroUnit[] = [];
  private cEnemyStructures: (TowerUnit | CoreUnit)[] = [];
  private cAlliedStructures: (TowerUnit | CoreUnit)[] = [];
  private cMonsters: MonsterUnit[] = [];
  private readonly nearBuf: SimUnit[] = [];
  private readonly zones: AvoidZone[] = [];

  constructor(sim: Sim, hero: SimHero, difficulty: Difficulty, rng: Rng) {
    this.sim = sim;
    this.self = hero;
    this.hero = hero;
    this.team = hero.team;
    this.enemyTeam = hero.team === 0 ? 1 : 0;
    this.difficulty = difficulty;
    this.rng = rng;
    this.map = sim.map;
    this.state = sim.state;
  }

  get time(): number {
    return this.sim.state.time;
  }

  private refresh(): void {
    const tick = this.sim.state.tick;
    if (tick === this.cacheTick) return;
    this.cacheTick = tick;
    const team = this.team;
    this.cAllies.length = 0;
    this.cAlliedHeroes.length = 0;
    this.cEnemies.length = 0;
    this.cEnemyHeroes.length = 0;
    this.cEnemyStructures.length = 0;
    this.cAlliedStructures.length = 0;
    this.cMonsters.length = 0;
    const units = this.sim.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      if (u.team === team) {
        this.cAllies.push(u);
        if (u.kind === 'hero') this.cAlliedHeroes.push(u);
        else if (u.kind === 'tower' || u.kind === 'core') this.cAlliedStructures.push(u);
      } else if (u.kind === 'monster') {
        this.cMonsters.push(u);
      } else if (u.kind === 'tower' || u.kind === 'core') {
        this.cEnemyStructures.push(u);
      } else if (u.visible[team] && !u.invulnerable && !u.rt.untargetable) {
        this.cEnemies.push(u);
        if (u.kind === 'hero') this.cEnemyHeroes.push(u);
      }
    }
  }

  allies(): readonly Unit[] {
    this.refresh();
    return this.cAllies;
  }

  alliedHeroes(): readonly HeroUnit[] {
    this.refresh();
    return this.cAlliedHeroes;
  }

  enemies(): readonly Unit[] {
    this.refresh();
    return this.cEnemies;
  }

  enemyHeroes(): readonly HeroUnit[] {
    this.refresh();
    return this.cEnemyHeroes;
  }

  enemyStructures(): readonly (TowerUnit | CoreUnit)[] {
    this.refresh();
    return this.cEnemyStructures;
  }

  alliedStructures(): readonly (TowerUnit | CoreUnit)[] {
    this.refresh();
    return this.cAlliedStructures;
  }

  monsters(): readonly MonsterUnit[] {
    this.refresh();
    return this.cMonsters;
  }

  private perceivable(u: SimUnit): boolean {
    return u.team === this.team || u.kind === 'monster' || u.kind === 'tower' || u.kind === 'core' || u.visible[this.team];
  }

  unit(id: number): Unit | undefined {
    const u = this.sim.byId.get(id);
    return u && this.perceivable(u) ? u : undefined;
  }

  canSee(u: Unit): boolean {
    return u.team === this.team || u.visible[this.team];
  }

  near(pos: Vec2, radius: number): Unit[] {
    const n = this.sim.grid.query(pos.x, pos.y, radius, this.nearBuf);
    const out: Unit[] = [];
    for (let i = 0; i < n; i++) {
      const u = this.nearBuf[i];
      if (!u.alive || !this.perceivable(u)) continue;
      if (Math.hypot(u.pos.x - pos.x, u.pos.y - pos.y) - u.radius <= radius) out.push(u);
    }
    return out;
  }

  scoreboard(): readonly HeroUnit[] {
    return this.sim.heroes;
  }

  lastSeen(heroUnitId: number): LastSeen | null {
    const u = this.sim.byId.get(heroUnitId);
    if (!u || u.kind !== 'hero' || u.team === this.team) return null;
    return this.sim.lastSeen[this.team][u.h.index];
  }

  botControlled(hero: HeroUnit): boolean {
    const u = this.sim.byId.get(hero.id);
    return !!u && u.kind === 'hero' && u.team === this.team && u.h.controller !== null;
  }

  walkable(pos: Vec2, radius?: number): boolean {
    return this.sim.nav.isFree(pos.x, pos.y, radius ?? this.self.rt.navR);
  }

  lineClear(a: Vec2, b: Vec2, radius?: number): boolean {
    return this.sim.nav.segmentFree(a.x, a.y, b.x, b.y, radius ?? this.self.rt.navR);
  }

  nearestWalkable(pos: Vec2): Vec2 {
    const out = { x: pos.x, y: pos.y };
    this.sim.nav.nearestFree(pos.x, pos.y, this.self.rt.navR, out);
    return out;
  }

  pathDistance(to: Vec2): number {
    const p = this.self.pos;
    const nav = this.sim.nav;
    const r = this.self.rt.navR;
    if (nav.segmentFree(p.x, p.y, to.x, to.y, r)) return Math.hypot(to.x - p.x, to.y - p.y);
    const path = nav.findPath(p.x, p.y, to.x, to.y, r);
    if (!path || path.length === 0) return Infinity;
    const last = path[path.length - 1];
    // 只找到部分路径(终点不连通)也算不可达
    if (Math.hypot(last.x - to.x, last.y - to.y) > 2) return Infinity;
    return pathLength(p, path);
  }

  safePath(to: Vec2, margin = 1): Vec2[] | null {
    this.refresh();
    const p = this.self.pos;
    const nav = this.sim.nav;
    const r = this.self.rt.navR;
    const zones = this.zones;
    zones.length = 0;
    for (const s of this.cEnemyStructures) {
      // 起点/终点在射程圈里时把圈缩到刚好不包含它们：既有路可走，又不会往圈里更深处钻
      let zr = s.stats.attackRange + margin;
      zr = Math.min(zr, Math.hypot(p.x - s.pos.x, p.y - s.pos.y) - 0.4, Math.hypot(to.x - s.pos.x, to.y - s.pos.y) - 0.4);
      if (zr > s.radius + 1) zones.push({ x: s.pos.x, y: s.pos.y, r: zr });
    }
    // 敌方泉水同样是禁区
    const base = this.map.bases[this.enemyTeam];
    const fr = Math.min(base.fountainRadius + margin, Math.hypot(p.x - base.fountain.x, p.y - base.fountain.y) - 0.4, Math.hypot(to.x - base.fountain.x, to.y - base.fountain.y) - 0.4);
    if (fr > 1) zones.push({ x: base.fountain.x, y: base.fountain.y, r: fr });
    if (nav.segmentFree(p.x, p.y, to.x, to.y, r) && !segmentHitsZones(zones, p.x, p.y, to.x, to.y)) return [{ x: to.x, y: to.y }];
    // 长途赶路用更贪心的搜索：展开的节点少得多，换来的只是偶尔多绕一点
    const path = nav.findPath(p.x, p.y, to.x, to.y, r, zones, SAFE_PATH_GREED);
    return path && path.length > 0 ? path : null;
  }

  bushAt(pos: Vec2): number {
    return bushIndexAt(this.map, pos);
  }

  enemyStructureCovering(pos: Vec2, margin = 0): TowerUnit | CoreUnit | null {
    this.refresh();
    for (const s of this.cEnemyStructures) {
      const r = s.stats.attackRange + margin;
      const dx = s.pos.x - pos.x;
      const dy = s.pos.y - pos.y;
      if (dx * dx + dy * dy <= r * r) return s;
    }
    return null;
  }

  private perceivesPoint(x: number, y: number, extra: number): boolean {
    this.refresh();
    const r = PERCEPTION_RANGE + extra;
    for (const h of this.cAlliedHeroes) {
      const dx = h.pos.x - x;
      const dy = h.pos.y - y;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    return false;
  }

  hostileAreas(): readonly AreaEffect[] {
    const out: AreaEffect[] = [];
    for (const a of this.sim.areas) {
      if (a.team === this.team || a.dead) continue;
      if (this.perceivesPoint(a.pos.x, a.pos.y, a.radius)) out.push(a);
    }
    return out;
  }

  hostileCones(): readonly ConeHazard[] {
    const cones = this.sim.cones;
    if (cones.length === 0) return NO_CONES;
    const out: ConeHazard[] = [];
    for (const c of cones) if (this.perceivesPoint(c.pos.x, c.pos.y, c.radius)) out.push(c);
    return out;
  }

  hostileProjectiles(): readonly Projectile[] {
    const out: Projectile[] = [];
    for (const p of this.sim.projectiles) {
      if (p.team === this.team || p.dead) continue;
      if (this.perceivesPoint(p.pos.x, p.pos.y, 0)) out.push(p);
    }
    return out;
  }

  castSpec(slot: SkillSlot): CastSpec {
    return isSummonerSlot(slot) ? SUMMONER_CAST[slot] : HEROES[this.self.heroId].skills[slot].cast;
  }

  skillReady(slot: SkillSlot): boolean {
    const h = this.self;
    const s = h.skills[slot];
    if (!h.alive || s.level <= 0 || s.cd > 0 || h.mana < s.cost) return false;
    if (h.rt.stunned) return false;
    if (!isSummonerSlot(slot) && h.rt.silenced) return false;
    // 与施法管线的校验保持一致：位移技能被定身时放不出来；技能自带的额外条件(如回城引导中)
    const impl = getSkill(h.heroId, slot);
    if (impl.movement && h.rt.rooted) return false;
    return !(impl.canCast && impl.canCast(this.sim, h) !== null);
  }

  orderState(): 0 | 1 | 2 | 3 {
    const h = this.self;
    if (h.h.atkOrder) return 3;
    return h.rt.moveMode === MOVE_PATH ? 2 : h.rt.moveMode === MOVE_DIR ? 1 : 0;
  }

  orderTargetId(): number {
    return this.self.h.atkOrder ? this.self.h.atkTargetId : -1;
  }

  attackWindup(): boolean {
    return this.self.rt.windupLeft > 0;
  }

  attackCooldown(): number {
    const rt = this.self.rt;
    const disarm = rt.disarmUntil - this.sim.state.time;
    return Math.max(0, rt.atkCd, disarm);
  }

  busy(): boolean {
    const rt = this.self.rt;
    return rt.stunned || rt.dash !== null || this.sim.state.time < rt.lockUntil;
  }

  command(cmd: PlayerCommand): void {
    this.sim.command(this.self.id, cmd);
  }
}
