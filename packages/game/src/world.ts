/**
 * 模拟世界：固定 tick、命令驱动、全整数状态。
 * 锁步联机的共享内核 —— 同样的初始状态 + 同样的命令序列
 * 必须在任何机器上产生逐 tick 完全相同的世界（用 hash() 校验）。
 *
 * 本文件按系统分区：玩家经济 / 生产 / 建筑放置 / 移动寻路 / 采矿 / 战斗。
 * 所有遍历都按 id 升序（Map 插入序 = id 递增），保证全端一致。
 */
import {
  DEFAULT_RULES,
  producibleBy,
  type ArmorType,
  type RulesData,
  type Side,
  type UnitType,
} from './content';
import { cellToLepton, leptonToCell } from './coords';
import { dirToBangle, dist, turnToward, velocity } from './fixed';
import { StateHash } from './hash';
import { findPath, type PathGrid } from './pathfind';
import { Prng } from './prng';

export interface TerrainInfo extends PathGrid {
  width: number;
  height: number;
  passable(x: number, y: number): boolean;
}

export interface Player {
  id: number;
  side: Side;
  credits: number;
  /** 上一 tick 结算的发电/耗电（仅供显示与建造速度）。 */
  powerProduced: number;
  powerDrained: number;
  /** 曾拥有过建筑 —— 据此判负（避免开局未落基地即判负）。 */
  everBuilt: boolean;
  defeated: boolean;
}

/** 生产分类：建筑/步兵/车辆各一条并行队列。 */
export type ProdCategory = 'building' | 'infantry' | 'vehicle';

export interface ProductionQueue {
  /** 队列中的 typeId（含正在生产的队首）。 */
  items: string[];
  /** 队首已积累的建造进度（tick）。 */
  progress: number;
  /** 建筑造好后等待放置。 */
  readyToPlace: boolean;
}

export interface HarvesterState {
  mode: 'seek' | 'toOre' | 'harvest' | 'toRefinery' | 'unload';
  /** 已装载矿石价值。 */
  load: number;
  timer: number;
}

/** 作战姿态：进攻=更大半径主动出击；警戒=默认，警戒半径内迎击；
 *  坚守=只打武器射程内、绝不移动追击；不还火=不自动索敌也不还击（仅听显式命令）。 */
export type Stance = 'aggressive' | 'guard' | 'holdground' | 'holdfire';

export interface Entity {
  id: number;
  owner: number;
  typeId: string;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  /** 建筑左上角格（仅建筑）。 */
  cellX: number;
  cellY: number;
  // 移动
  path: { x: number; y: number }[];
  waypoint: { x: number; y: number } | null;
  goal: { x: number; y: number } | null;
  // 战斗
  targetId: number | null;
  cooldown: number;
  /** 累计击杀（老兵等级：≥2 老兵、≥5 精英，伤害递增）。 */
  kills: number;
  /** 攻击移动：朝目标格行军，沿途逐个停下歼敌再续行。 */
  attackMove: boolean;
  /** 攻击移动/巡逻的最终行军终点（格）。途中迎敌时被临时绕开，敌灭后据此续行/折返。null=无。 */
  attackDest: { x: number; y: number } | null;
  /** 巡逻：到达当前目的地后折返的另一端点（格），null=不巡逻。沿途自动交战。 */
  patrol: { x: number; y: number } | null;
  /** 作战姿态（默认 guard 警戒）。 */
  stance: Stance;
  // 采矿
  harvester: HarvesterState | null;
  // 建筑：集结点（格，-1=无）+ 是否在修理
  rallyX: number;
  rallyY: number;
  repairing: boolean;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  targetId: number;
  speed: number;
  damage: number;
  warheadId: string;
  splash: number;
  owner: number;
  shooterId: number;
}

export type Command =
  | { kind: 'spawn'; owner: number; typeId: string; cellX: number; cellY: number }
  | { kind: 'produce'; owner: number; typeId: string }
  | { kind: 'cancel'; owner: number; category: ProdCategory }
  | { kind: 'place'; owner: number; typeId: string; cellX: number; cellY: number }
  | { kind: 'move'; entityIds: number[]; cellX: number; cellY: number }
  | { kind: 'attackMove'; entityIds: number[]; cellX: number; cellY: number }
  | { kind: 'patrol'; entityIds: number[]; cellX: number; cellY: number }
  | { kind: 'attack'; entityIds: number[]; targetId: number }
  | { kind: 'harvest'; entityIds: number[]; cellX: number; cellY: number }
  | { kind: 'setRally'; owner: number; buildingId: number; cellX: number; cellY: number }
  | { kind: 'sell'; owner: number; entityId: number }
  | { kind: 'repair'; owner: number; entityId: number }
  | { kind: 'stance'; entityIds: number[]; stance: Stance }
  | { kind: 'stop'; entityIds: number[] };

const CATEGORY_PRODUCER: Record<ProdCategory, string> = {
  building: 'conyard',
  infantry: 'barracks',
  vehicle: 'warfactory',
};

const HARVEST_RATE = 30;
const HARVEST_CAPACITY = 700;
const HARVEST_TICKS = 2;
/** 建造半径（格）：新建筑须距己方某建筑足迹不超过此距离。 */
const BUILD_RADIUS = 6;
/** 单位「警戒」半径（lepton）：空闲单位会主动迎击此范围内的敌人（即便超出武器射程也会上前）。 */
const GUARD_RANGE = 6 * 256;
/** 修理：每隔多少 tick 回一次血。 */
const REPAIR_INTERVAL = 5;
/** 修理花费相对造价比例（修满约花造价的此比例）。 */
const REPAIR_COST_RATIO = 0.5;

export function categoryOf(u: UnitType): ProdCategory {
  return u.domain === 'building' ? 'building' : u.domain;
}

export class World {
  tick = 0;
  readonly prng: Prng;
  readonly entities = new Map<number, Entity>();
  readonly players = new Map<number, Player>();
  readonly projectiles: Projectile[] = [];
  /** 每格矿石价值（credit）。 */
  readonly ore: Int16Array;
  private readonly queues = new Map<string, ProductionQueue>(); // key = `${owner}:${category}`
  private nextEntityId = 1;
  private nextProjectileId = 1;
  /** 建筑占用的格 → entityId，用于放置校验与寻路阻挡。 */
  private readonly occupied = new Map<number, number>();

  constructor(
    readonly terrain: TerrainInfo,
    seed: number,
    readonly rules: RulesData = DEFAULT_RULES,
  ) {
    this.prng = new Prng(seed);
    this.ore = new Int16Array(terrain.width * terrain.height);
  }

  // ───────────────────────── 玩家 / 矿石 ─────────────────────────

  addPlayer(id: number, side: Side, credits: number): void {
    this.players.set(id, {
      id,
      side,
      credits,
      powerProduced: 0,
      powerDrained: 0,
      everBuilt: false,
      defeated: false,
    });
  }

  setOre(cellX: number, cellY: number, value: number): void {
    if (cellX < 0 || cellY < 0 || cellX >= this.terrain.width || cellY >= this.terrain.height) return;
    this.ore[cellY * this.terrain.width + cellX] = value;
  }

  oreAt(cellX: number, cellY: number): number {
    if (cellX < 0 || cellY < 0 || cellX >= this.terrain.width || cellY >= this.terrain.height) return 0;
    return this.ore[cellY * this.terrain.width + cellX]!;
  }

  // ───────────────────────── 命令 ─────────────────────────

  applyCommands(commands: Command[]): void {
    for (const cmd of commands) {
      switch (cmd.kind) {
        case 'spawn':
          this.spawnUnit(cmd.owner, cmd.typeId, cmd.cellX, cmd.cellY);
          break;
        case 'produce':
          this.queueProduction(cmd.owner, cmd.typeId);
          break;
        case 'cancel':
          this.cancelProduction(cmd.owner, cmd.category);
          break;
        case 'place':
          this.placeBuilding(cmd.owner, cmd.typeId, cmd.cellX, cmd.cellY);
          break;
        case 'move': {
          // 多个单位：散开到目标周围不同格（队形展开），避免挤成一坨/互相挡路
          const ids = [...cmd.entityIds].sort((a, b) => a - b);
          const slots = ids.length > 1 ? this.spreadDestinations(cmd.cellX, cmd.cellY, ids.length) : [{ x: cmd.cellX, y: cmd.cellY }];
          ids.forEach((eid, i) => {
            const e = this.entities.get(eid);
            if (!e) return;
            const s = slots[i] ?? slots[0]!;
            this.orderMove(e, s.x, s.y);
            e.targetId = null;
            e.attackMove = false;
            e.attackDest = null;
            e.patrol = null;
            // 矿车手动移动后回到自动采矿状态：先去目的地，到了再自找最近矿（见 stepHarvester seek）
            if (e.harvester) e.harvester.mode = 'seek';
          });
          break;
        }
        case 'attackMove': {
          const ids = [...cmd.entityIds].sort((a, b) => a - b);
          const slots = ids.length > 1 ? this.spreadDestinations(cmd.cellX, cmd.cellY, ids.length) : [{ x: cmd.cellX, y: cmd.cellY }];
          ids.forEach((eid, i) => {
            const e = this.entities.get(eid);
            if (!e) return;
            const s = slots[i] ?? slots[0]!;
            this.orderMove(e, s.x, s.y);
            e.targetId = null;
            e.attackMove = true;
            e.attackDest = { x: s.x, y: s.y };
            e.patrol = null;
          });
          break;
        }
        case 'patrol':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            // 巡逻：以当前格为一端、目标格为另一端往返；途中按攻击移动逻辑自动交战。
            // 无武器单位（如矿车）不巡逻。
            if (!e || !this.rules.units.get(e.typeId)?.weapon) continue;
            e.patrol = { x: e.cellX, y: e.cellY };
            this.orderMove(e, cmd.cellX, cmd.cellY);
            e.targetId = null;
            e.attackMove = true;
            e.attackDest = { x: cmd.cellX, y: cmd.cellY };
          }
          break;
        case 'attack':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            if (e) {
              e.targetId = cmd.targetId;
              e.attackMove = false;
              e.attackDest = null;
              e.patrol = null;
            }
          }
          break;
        case 'harvest':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            if (!e || !e.harvester) continue;
            e.targetId = null;
            e.attackMove = false;
            if (this.oreAt(cmd.cellX, cmd.cellY) > 0) {
              this.orderMove(e, cmd.cellX, cmd.cellY); // 去指定矿点开采
              e.harvester.mode = 'toOre';
            } else {
              e.path = [];
              e.waypoint = null;
              e.goal = null;
              e.harvester.mode = 'seek'; // 恢复自动采矿：自找最近矿田
            }
          }
          break;
        case 'setRally': {
          const b = this.entities.get(cmd.buildingId);
          if (b && b.owner === cmd.owner && this.rules.units.get(b.typeId)?.building) {
            b.rallyX = cmd.cellX;
            b.rallyY = cmd.cellY;
          }
          break;
        }
        case 'sell':
          this.sellBuilding(cmd.owner, cmd.entityId);
          break;
        case 'repair': {
          const b = this.entities.get(cmd.entityId);
          if (b && b.owner === cmd.owner && this.rules.units.get(b.typeId)?.building) {
            b.repairing = !b.repairing; // 切换
          }
          break;
        }
        case 'stance':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            if (e) {
              e.stance = cmd.stance;
              // 切到不还火：放下当前自动锁定的目标（显式攻击命令仍可下达）
              if (cmd.stance === 'holdfire' && !e.attackMove) e.targetId = null;
            }
          }
          break;
        case 'stop':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            if (e) {
              e.path = [];
              e.waypoint = null;
              e.goal = null;
              e.targetId = null;
              e.attackMove = false;
              e.attackDest = null;
              e.patrol = null;
            }
          }
          break;
      }
    }
  }

  private sellBuilding(owner: number, entityId: number): void {
    const e = this.entities.get(entityId);
    const type = e && this.rules.units.get(e.typeId);
    if (!e || e.owner !== owner || !type?.building) return;
    const player = this.players.get(owner);
    if (player) player.credits += Math.floor((type.cost * e.hp) / e.maxHp / 2); // 按现血量半价回款
    this.removeBuildingOccupancy(e);
    this.entities.delete(entityId);
  }

  private makeEntity(owner: number, type: UnitType, x: number, y: number): Entity {
    const id = this.nextEntityId++;
    const e: Entity = {
      id,
      owner,
      typeId: type.id,
      x,
      y,
      facing: 0,
      hp: type.hp,
      maxHp: type.hp,
      cellX: leptonToCell(x),
      cellY: leptonToCell(y),
      path: [],
      waypoint: null,
      goal: null,
      targetId: null,
      cooldown: 0,
      kills: 0,
      attackMove: false,
      attackDest: null,
      patrol: null,
      stance: 'guard',
      rallyX: -1,
      rallyY: -1,
      repairing: false,
      harvester: type.id === 'harvester' ? { mode: 'seek', load: 0, timer: 0 } : null,
    };
    this.entities.set(id, e);
    return e;
  }

  /** 直接生成单位（调试 / 测试 / 单位出厂）。 */
  spawnUnit(owner: number, typeId: string, cellX: number, cellY: number): Entity | null {
    const type = this.rules.units.get(typeId);
    if (!type) return null;
    if (type.domain === 'building') {
      return this.placeBuildingEntity(owner, type, cellX, cellY);
    }
    return this.makeEntity(owner, type, cellToLepton(cellX), cellToLepton(cellY));
  }

  // ───────────────────────── 生产 ─────────────────────────

  private queueKey(owner: number, category: ProdCategory): string {
    return `${owner}:${category}`;
  }

  private getQueue(owner: number, category: ProdCategory): ProductionQueue {
    const key = this.queueKey(owner, category);
    let q = this.queues.get(key);
    if (!q) {
      q = { items: [], progress: 0, readyToPlace: false };
      this.queues.set(key, q);
    }
    return q;
  }

  queueFor(owner: number, category: ProdCategory): ProductionQueue | undefined {
    return this.queues.get(this.queueKey(owner, category));
  }

  queueProduction(owner: number, typeId: string): boolean {
    const type = this.rules.units.get(typeId);
    if (!type || !this.canBuild(owner, type)) return false;
    this.getQueue(owner, categoryOf(type)).items.push(typeId);
    return true;
  }

  cancelProduction(owner: number, category: ProdCategory): void {
    const q = this.queueFor(owner, category);
    if (!q || q.items.length === 0) return;
    // 退还队首已花费的金钱
    const type = this.rules.units.get(q.items[0]!);
    if (type) {
      const player = this.players.get(owner);
      if (player) player.credits += Math.floor((q.progress / type.buildTime) * type.cost);
    }
    q.items.shift();
    q.progress = 0;
    q.readyToPlace = false;
  }

  /** 玩家是否拥有某 typeId 的建筑（前置科技判断）。 */
  hasBuilding(owner: number, buildingId: string): boolean {
    for (const e of this.entities.values()) {
      if (e.owner === owner && e.typeId === buildingId && this.rules.units.get(e.typeId)?.domain === 'building') {
        return true;
      }
    }
    return false;
  }

  /** 该单位当前能否建造（生产建筑存在 + 前置满足）。 */
  canBuild(owner: number, type: UnitType): boolean {
    const producer = CATEGORY_PRODUCER[categoryOf(type)];
    if (!this.hasBuilding(owner, producer)) return false;
    for (const pre of type.prerequisites) {
      if (!this.hasBuilding(owner, pre)) return false;
    }
    return true;
  }

  /** 当前可建造清单（按规则表顺序）。 */
  buildOptions(owner: number): UnitType[] {
    const out: UnitType[] = [];
    for (const u of this.rules.units.values()) {
      if (this.canBuild(owner, u)) out.push(u);
    }
    return out;
  }

  private stepProduction(): void {
    for (const player of this.players.values()) {
      if (player.defeated) continue;
      // 低电时建造减速：电力不足 → 半速
      const powerOk = player.powerProduced >= player.powerDrained;
      for (const category of ['building', 'infantry', 'vehicle'] as ProdCategory[]) {
        const q = this.queueFor(player.id, category);
        if (!q || q.items.length === 0 || q.readyToPlace) continue;
        const type = this.rules.units.get(q.items[0]!);
        if (!type) {
          q.items.shift();
          continue;
        }
        // 生产建筑被摧毁 → 暂停
        if (!this.hasBuilding(player.id, CATEGORY_PRODUCER[category])) continue;

        const step = powerOk ? 2 : 1; // 半速即每 2 tick 进 1
        const costPerTick = type.cost / type.buildTime;
        const wouldSpend = Math.ceil(costPerTick * step);
        if (player.credits < wouldSpend) continue; // 钱不够则停滞
        player.credits -= wouldSpend;
        q.progress += step;

        if (q.progress >= type.buildTime) {
          q.progress = type.buildTime;
          if (type.domain === 'building') {
            q.readyToPlace = true; // 等放置命令
          } else {
            this.spawnFromFactory(player.id, type);
            q.items.shift();
            q.progress = 0;
          }
        }
      }
    }
  }

  private spawnFromFactory(owner: number, type: UnitType): void {
    const producerId = CATEGORY_PRODUCER[categoryOf(type)];
    // 找该玩家的生产建筑，单位在其下方空格出现
    let exit: { x: number; y: number } | null = null;
    let rally: { x: number; y: number } | null = null;
    for (const e of this.entities.values()) {
      if (e.owner === owner && e.typeId === producerId) {
        const traits = this.rules.units.get(e.typeId)!.building!;
        const ex = e.cellX + Math.floor(traits.footprintW / 2);
        const ey = e.cellY + traits.footprintH;
        exit = { x: Math.min(ex, this.terrain.width - 1), y: Math.min(ey, this.terrain.height - 1) };
        if (e.rallyX >= 0 && e.rallyY >= 0) rally = { x: e.rallyX, y: e.rallyY };
        break;
      }
    }
    if (!exit) return;
    const unit = this.makeEntity(owner, type, cellToLepton(exit.x), cellToLepton(exit.y));
    // 有集结点则前往
    if (rally) this.orderMove(unit, rally.x, rally.y);
  }

  /** 修理：开启修理的建筑每隔若干 tick 扣钱回血。 */
  private stepRepair(): void {
    if (this.tick % REPAIR_INTERVAL !== 0) return;
    for (const e of this.entities.values()) {
      if (!e.repairing) continue;
      const type = this.rules.units.get(e.typeId);
      if (!type?.building) {
        e.repairing = false;
        continue;
      }
      if (e.hp >= e.maxHp) {
        e.repairing = false;
        continue;
      }
      const player = this.players.get(e.owner);
      // 每次回血 maxHp/40，花费按造价等比例
      const heal = Math.max(1, Math.ceil(e.maxHp / 40));
      const cost = Math.ceil((heal / e.maxHp) * type.cost * REPAIR_COST_RATIO);
      if (player && player.credits >= cost) {
        player.credits -= cost;
        e.hp = Math.min(e.maxHp, e.hp + heal);
        if (e.hp >= e.maxHp) e.repairing = false; // 修满即停
      }
    }
  }

  // ───────────────────────── 建筑放置 ─────────────────────────

  canPlace(owner: number, type: UnitType, cellX: number, cellY: number): boolean {
    const b = type.building;
    if (!b) return false;
    for (let dy = 0; dy < b.footprintH; dy++) {
      for (let dx = 0; dx < b.footprintW; dx++) {
        const cx = cellX + dx;
        const cy = cellY + dy;
        if (cx < 0 || cy < 0 || cx >= this.terrain.width || cy >= this.terrain.height) return false;
        if (!this.terrain.passable(cx, cy)) return false;
        if (this.occupied.has(cy * this.terrain.width + cx)) return false;
      }
    }
    // 建造半径：须毗邻己方已有建筑（首座除外，避免开局无处可放）
    if (this.ownsAnyBuilding(owner) && !this.withinBuildRadius(owner, cellX, cellY, b.footprintW, b.footprintH)) {
      return false;
    }
    return true;
  }

  private ownsAnyBuilding(owner: number): boolean {
    for (const e of this.entities.values()) {
      if (e.owner === owner && this.rules.units.get(e.typeId)?.building) return true;
    }
    return false;
  }

  private withinBuildRadius(owner: number, cellX: number, cellY: number, w: number, h: number): boolean {
    for (const e of this.entities.values()) {
      if (e.owner !== owner) continue;
      const eb = this.rules.units.get(e.typeId)?.building;
      if (!eb) continue;
      // 两个矩形足迹间的切比雪夫间隙
      const gapX = Math.max(0, e.cellX - (cellX + w), cellX - (e.cellX + eb.footprintW));
      const gapY = Math.max(0, e.cellY - (cellY + h), cellY - (e.cellY + eb.footprintH));
      if (Math.max(gapX, gapY) <= BUILD_RADIUS) return true;
    }
    return false;
  }

  placeBuilding(owner: number, typeId: string, cellX: number, cellY: number): Entity | null {
    const type = this.rules.units.get(typeId);
    if (!type || type.domain !== 'building') return null;
    const q = this.queueFor(owner, 'building');
    // 必须是队首已就绪的该建筑
    if (!q || !q.readyToPlace || q.items[0] !== typeId) return null;
    if (!this.canPlace(owner, type, cellX, cellY)) return null;
    const e = this.placeBuildingEntity(owner, type, cellX, cellY);
    q.items.shift();
    q.progress = 0;
    q.readyToPlace = false;
    return e;
  }

  private placeBuildingEntity(owner: number, type: UnitType, cellX: number, cellY: number): Entity {
    const b = type.building!;
    const cx = cellX + b.footprintW / 2;
    const cy = cellY + b.footprintH / 2;
    const e = this.makeEntity(owner, type, Math.round(cellToLepton(cellX) + ((b.footprintW - 1) * 256) / 2), Math.round(cellToLepton(cellY) + ((b.footprintH - 1) * 256) / 2));
    e.cellX = cellX;
    e.cellY = cellY;
    void cx;
    void cy;
    const player = this.players.get(owner);
    if (player) player.everBuilt = true;
    for (let dy = 0; dy < b.footprintH; dy++) {
      for (let dx = 0; dx < b.footprintW; dx++) {
        this.occupied.set((cellY + dy) * this.terrain.width + (cellX + dx), e.id);
      }
    }
    // 精炼厂送一辆免费矿车
    if (b.freeHarvester) {
      const hx = Math.min(cellX + b.footprintW, this.terrain.width - 1);
      this.makeEntity(owner, this.rules.units.get('harvester')!, cellToLepton(hx), cellToLepton(cellY + 1));
    }
    return e;
  }

  private removeBuildingOccupancy(e: Entity): void {
    const type = this.rules.units.get(e.typeId);
    if (!type?.building) return;
    for (let dy = 0; dy < type.building.footprintH; dy++) {
      for (let dx = 0; dx < type.building.footprintW; dx++) {
        const key = (e.cellY + dy) * this.terrain.width + (e.cellX + dx);
        if (this.occupied.get(key) === e.id) this.occupied.delete(key);
      }
    }
  }

  // ───────────────────────── 电力结算 ─────────────────────────

  private stepPower(): void {
    for (const p of this.players.values()) {
      p.powerProduced = 0;
      p.powerDrained = 0;
    }
    for (const e of this.entities.values()) {
      const b = this.rules.units.get(e.typeId)?.building;
      if (!b) continue;
      const p = this.players.get(e.owner);
      if (!p) continue;
      // 受损建筑按血量比例发电（红警2 风格）
      if (b.power > 0) {
        p.powerProduced += Math.floor((b.power * e.hp) / e.maxHp);
      } else {
        p.powerDrained += -b.power;
      }
    }
  }

  // ───────────────────────── 寻路 / 移动 ─────────────────────────

  private isCellBlocked(x: number, y: number): boolean {
    return !this.terrain.passable(x, y) || this.occupied.has(y * this.terrain.width + x);
  }

  /** 返回 (cx,cy) 或其最近的可通行+未占用格（环形扩展），找不到返回 null。 */
  passableNear(cx: number, cy: number, maxR = 10): { x: number; y: number } | null {
    if (cx >= 0 && cy >= 0 && cx < this.terrain.width && cy < this.terrain.height && !this.isCellBlocked(cx, cy)) {
      return { x: cx, y: cy };
    }
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= this.terrain.width || y >= this.terrain.height) continue;
          if (!this.isCellBlocked(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  /** 为 n 个单位在 (cx,cy) 周围取 n 个互不相同的可通行格（队形展开，避免挤成一坨、
   *  互相挡路）。中心优先、按环形从内向外扩展；空间不足时用中心兜底。确定性遍历。 */
  private spreadDestinations(cx: number, cy: number, n: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const seen = new Set<number>();
    const tryAdd = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= this.terrain.width || y >= this.terrain.height) return;
      if (this.isCellBlocked(x, y)) return;
      const key = y * this.terrain.width + x;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ x, y });
    };
    tryAdd(cx, cy);
    for (let r = 1; out.length < n && r <= 12; r++) {
      for (let dy = -r; dy <= r && out.length < n; dy++) {
        for (let dx = -r; dx <= r && out.length < n; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          tryAdd(cx + dx, cy + dy);
        }
      }
    }
    const fallback = out[0] ?? { x: cx, y: cy };
    while (out.length < n) out.push(fallback);
    return out;
  }

  private orderMove(e: Entity, cellX: number, cellY: number): void {
    const grid: PathGrid = {
      width: this.terrain.width,
      height: this.terrain.height,
      passable: (x, y) => !this.isCellBlocked(x, y),
    };
    const path = findPath(grid, leptonToCell(e.x), leptonToCell(e.y), cellX, cellY);
    e.goal = { x: cellX, y: cellY };
    e.path = path ? path.reverse() : [];
    e.waypoint = null;
  }

  private stepMovement(e: Entity, type: UnitType): void {
    if (type.domain === 'building') return;
    if (!e.waypoint) {
      const next = e.path.pop();
      if (!next) {
        // 攻击移动/巡逻的续行与折返由 stepAggressiveMarch 统一负责，这里不擅自结束
        if (e.attackMove && (e.attackDest || e.patrol)) return;
        e.goal = null;
        e.attackMove = false; // 普通移动抵达目的地
        return;
      }
      e.waypoint = { x: cellToLepton(next.x), y: cellToLepton(next.y) };
    }
    const dx = e.waypoint.x - e.x;
    const dy = e.waypoint.y - e.y;
    const target = dirToBangle(dx, dy);
    e.facing = turnToward(e.facing, target, type.rot);
    const diff = ((target - e.facing + 128) & 0xff) - 128;
    if (Math.abs(diff) > 32) return;
    const d = dist(dx, dy);
    if (d <= type.speed) {
      e.x = e.waypoint.x;
      e.y = e.waypoint.y;
      e.cellX = leptonToCell(e.x);
      e.cellY = leptonToCell(e.y);
      e.waypoint = null;
      return;
    }
    const v = velocity(e.facing, type.speed);
    e.x += v.dx;
    e.y += v.dy;
    e.cellX = leptonToCell(e.x);
    e.cellY = leptonToCell(e.y);
  }

  // ───────────────────────── 采矿 ─────────────────────────

  private findNearest(
    fromX: number,
    fromY: number,
    pred: (e: Entity) => boolean,
  ): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of this.entities.values()) {
      if (!pred(e)) continue;
      const d = dist(e.x - fromX, e.y - fromY);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private findNearestOreCell(fromX: number, fromY: number): { x: number; y: number } | null {
    const cx = leptonToCell(fromX);
    const cy = leptonToCell(fromY);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    // 半径扩展搜索（确定性：固定遍历顺序）
    for (let y = 0; y < this.terrain.height; y++) {
      for (let x = 0; x < this.terrain.width; x++) {
        if (this.ore[y * this.terrain.width + x]! <= 0) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
  }

  private stepHarvester(e: Entity, type: UnitType): void {
    const h = e.harvester!;
    switch (h.mode) {
      case 'seek': {
        if (e.goal || e.waypoint) break; // 有手动目的地：先去，到了（goal 清空）再自找最近矿
        const ore = this.findNearestOreCell(e.x, e.y);
        if (ore) {
          this.orderMove(e, ore.x, ore.y);
          h.mode = 'toOre';
        }
        break;
      }
      case 'toOre': {
        if (!e.goal && !e.waypoint) {
          // 抵达：若脚下有矿则采，否则重找
          h.mode = this.oreAt(e.cellX, e.cellY) > 0 ? 'harvest' : 'seek';
        }
        break;
      }
      case 'harvest': {
        if (h.timer++ < HARVEST_TICKS) break;
        h.timer = 0;
        const cellOre = this.oreAt(e.cellX, e.cellY);
        if (cellOre <= 0 || h.load >= HARVEST_CAPACITY) {
          h.mode = h.load >= HARVEST_CAPACITY ? 'toRefinery' : 'seek';
          if (h.mode === 'toRefinery') this.routeToRefinery(e);
          break;
        }
        const take = Math.min(HARVEST_RATE, cellOre, HARVEST_CAPACITY - h.load);
        this.ore[e.cellY * this.terrain.width + e.cellX] = (cellOre - take) as number;
        h.load += take;
        if (h.load >= HARVEST_CAPACITY) {
          h.mode = 'toRefinery';
          this.routeToRefinery(e);
        }
        break;
      }
      case 'toRefinery': {
        if (!e.goal && !e.waypoint) h.mode = 'unload';
        break;
      }
      case 'unload': {
        const player = this.players.get(e.owner);
        if (player) player.credits += h.load;
        h.load = 0;
        h.mode = 'seek';
        break;
      }
    }
    void type;
  }

  private routeToRefinery(e: Entity): void {
    const refinery = this.findNearest(e.x, e.y, (o) =>
      o.owner === e.owner && this.rules.units.get(o.typeId)?.building?.refinery === true,
    );
    if (refinery) {
      const dock = this.passableNear(refinery.cellX, refinery.cellY + 1) ?? { x: refinery.cellX, y: refinery.cellY + 1 };
      this.orderMove(e, dock.x, dock.y);
    } else {
      e.harvester!.mode = 'seek'; // 没精炼厂就先囤着
    }
  }

  // ───────────────────────── 战斗 ─────────────────────────

  /** 返回 true 表示正在交火（本 tick 应暂停移动）。 */
  /** 索敌（带目标优先级，让单位"不傻"）：在射程/警戒半径内按优先级挑目标——
   *  先打能威胁我的武装单位 > 其它单位 > 建筑；同档优先残血者（自发集火补刀）；
   *  再近者，再 id 小（确定性）。非建筑单位用警戒半径主动迎击（超射程也上前，
   *  靠追击带进射程）；敌"建筑"仅在非攻击移动时受武器射程约束——空闲单位不会
   *  自发跑去拆远处建筑，攻击移动/巡逻则一并清理。 */
  private acquireEnemy(e: Entity, type: UnitType): Entity | null {
    const onMission = e.attackMove; // 攻击移动/巡逻：无视姿态，强制按警戒半径交战
    if (!onMission && e.stance === 'holdfire') return null; // 不还火：不自动索敌
    // 姿态决定索敌半径：坚守=仅武器射程；进攻=更大半径主动出击；其余=警戒半径
    let acquireRange: number;
    if (type.domain === 'building') acquireRange = type.weapon!.range;
    else if (!onMission && e.stance === 'holdground') acquireRange = type.weapon!.range;
    else if (!onMission && e.stance === 'aggressive') acquireRange = Math.max(type.weapon!.range, 2 * GUARD_RANGE);
    else acquireRange = Math.max(type.weapon!.range, GUARD_RANGE);
    let best: Entity | null = null;
    let bestRank = 0;
    let bestHp = 0;
    let bestD = 0;
    for (const o of this.entities.values()) {
      if (o.owner === e.owner || this.players.get(o.owner)?.defeated) continue;
      const ot = this.rules.units.get(o.typeId);
      if (!ot) continue;
      const isBuilding = ot.domain === 'building';
      const range = isBuilding && !onMission ? type.weapon!.range : acquireRange;
      const d = dist(o.x - e.x, o.y - e.y);
      if (d > range) continue;
      const rank = isBuilding ? 1 : ot.weapon ? 3 : 2; // 武装单位 > 无武装单位 > 建筑
      // 同档：残血优先（集火），再近，再 id 小
      const better =
        best === null ||
        rank > bestRank ||
        (rank === bestRank && (o.hp < bestHp || (o.hp === bestHp && (d < bestD || (d === bestD && o.id < best.id)))));
      if (better) {
        best = o;
        bestRank = rank;
        bestHp = o.hp;
        bestD = d;
      }
    }
    return best;
  }

  private stepCombat(e: Entity, type: UnitType): boolean {
    if (!type.weapon) return false;
    if (e.cooldown > 0) e.cooldown--;

    let target: Entity | undefined;
    if (e.attackMove) {
      // 攻击移动/巡逻：每帧锁定射程/警戒内最近的敌人——逐个停下歼灭挡路之敌，
      // 打完（目标消失/驶离警戒）再据 attackDest 续行或折返。
      target = this.acquireEnemy(e, type) ?? undefined;
      e.targetId = target ? target.id : null;
    } else {
      // 显式攻击：紧咬指定目标；空闲（无目的地）：警戒索敌被动自卫。
      target = e.targetId !== null ? this.entities.get(e.targetId) : undefined;
      if (target && (target.owner === e.owner || this.players.get(target.owner)?.defeated)) target = undefined;
      if (!target && !e.goal) target = this.acquireEnemy(e, type) ?? undefined;
      e.targetId = target ? target.id : null;
    }

    if (!target) {
      // 攻击移动/巡逻无敌可打：继续奔向终点（到点则结束/折返）
      if (e.attackMove && e.attackDest) this.stepAggressiveMarch(e);
      return false;
    }

    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = dist(dx, dy);
    if (d > type.weapon.range) {
      // 坚守：绝不移动追击，够不着就放下目标原地待机
      if (!e.attackMove && e.stance === 'holdground') {
        e.targetId = null;
        return false;
      }
      // 够不着：上前进入射程。攻击移动暂离行军路线迎敌（attackDest 留待事后续行）；
      // 显式攻击同样追击；建筑不能动。
      if (e.attackMove ? e.path.length === 0 && !e.waypoint : type.domain !== 'building' && !e.goal) {
        const near = this.passableNear(target.cellX, target.cellY);
        if (near) this.orderMove(e, near.x, near.y);
      }
      return false;
    }
    // 进入射程：停住、转向、开火（攻击移动也停下打完，靠 attackDest 事后续行）
    e.path = [];
    e.waypoint = null;
    e.goal = null;
    const aim = dirToBangle(dx, dy);
    if (type.rot > 0) {
      e.facing = turnToward(e.facing, aim, type.rot);
      if ((((aim - e.facing + 128) & 0xff) - 128) > 8) return true;
    }
    if (e.cooldown <= 0) {
      this.fire(e, target, type.weapon);
      e.cooldown = type.weapon.cooldown;
    }
    return true;
  }

  /** 攻击移动/巡逻在无敌情时推进：未到终点则（站定后）继续奔向终点；
   *  到终点——巡逻折返另一端，普通攻击移动则结束。 */
  private stepAggressiveMarch(e: Entity): void {
    const dest = e.attackDest!;
    if (e.cellX === dest.x && e.cellY === dest.y) {
      if (e.patrol) {
        const next = e.patrol; // 折返：刚到的点成为新的折返点
        e.patrol = e.attackDest;
        e.attackDest = next;
        this.orderMove(e, next.x, next.y);
      } else {
        e.attackMove = false;
        e.attackDest = null;
      }
    } else if (e.path.length === 0 && !e.waypoint) {
      this.orderMove(e, dest.x, dest.y); // 刚打完站住 / 路径耗尽未到点：续行
    }
  }

  /** 老兵伤害倍率（百分比，整数）：新兵 100、老兵(≥2 杀) 125、精英(≥5 杀) 150。 */
  private vetMul(e: Entity): number {
    return e.kills >= 5 ? 150 : e.kills >= 2 ? 125 : 100;
  }

  private fire(shooter: Entity, target: Entity, weapon: NonNullable<UnitType['weapon']>): void {
    const dmg = Math.floor((weapon.damage * this.vetMul(shooter)) / 100); // 老兵加成
    if (weapon.projectileSpeed <= 0) {
      this.applyDamage(target, dmg, weapon.warhead, weapon.splash, shooter.owner, shooter.id);
    } else {
      this.projectiles.push({
        id: this.nextProjectileId++,
        x: shooter.x,
        y: shooter.y,
        targetId: target.id,
        speed: weapon.projectileSpeed,
        damage: dmg,
        warheadId: JSON.stringify(weapon.warhead),
        splash: weapon.splash,
        owner: shooter.owner,
        shooterId: shooter.id,
      });
    }
  }

  private armorOf(e: Entity): ArmorType {
    return this.rules.units.get(e.typeId)?.armor ?? 'none';
  }

  private applyDamage(
    target: Entity,
    damage: number,
    warhead: NonNullable<UnitType['weapon']>['warhead'],
    splash: number,
    owner: number,
    attackerId = -1,
  ): void {
    const verses = this.rules.resolveVerses(warhead);
    const deal = (e: Entity, base: number): void => {
      const pct = verses[this.armorOf(e)];
      e.hp -= Math.max(1, Math.floor((base * pct) / 100));
    };
    const before = target.hp;
    deal(target, damage);
    // 击杀归属：致命一击让攻击者涨经验（升老兵/精英）；溅射误伤不计
    if (before > 0 && target.hp <= 0 && attackerId >= 0) {
      const killer = this.entities.get(attackerId);
      if (killer && killer.owner !== target.owner) killer.kills++;
    }
    // 反击：空闲的武装单位被打 → 自动还击攻击者（即便对方在远处/警戒范围外）；
    // 不还火姿态不还击
    if (attackerId >= 0 && target.stance !== 'holdfire' && target.targetId === null && !target.goal && !target.attackMove) {
      const tt = this.rules.units.get(target.typeId);
      if (tt?.weapon && tt.domain !== 'building' && this.entities.has(attackerId)) target.targetId = attackerId;
    }
    if (splash > 0) {
      for (const e of this.entities.values()) {
        if (e.id === target.id || e.owner === owner) continue;
        const d = dist(e.x - target.x, e.y - target.y);
        if (d <= splash) deal(e, Math.floor((damage * (splash - d)) / splash));
      }
    }
  }

  private stepProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const target = this.entities.get(p.targetId);
      if (!target) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = dist(dx, dy);
      if (d <= p.speed) {
        this.applyDamage(target, p.damage, JSON.parse(p.warheadId), p.splash, p.owner, p.shooterId);
        this.projectiles.splice(i, 1);
      } else {
        const ang = dirToBangle(dx, dy);
        const v = velocity(ang, p.speed);
        p.x += v.dx;
        p.y += v.dy;
      }
    }
  }

  private reapDead(): void {
    for (const [id, e] of this.entities) {
      if (e.hp <= 0) {
        this.removeBuildingOccupancy(e);
        this.entities.delete(id);
      }
    }
    // 胜负：曾建过基地却失去全部建筑即判负
    for (const player of this.players.values()) {
      if (player.defeated || !player.everBuilt) continue;
      let hasBuilding = false;
      for (const e of this.entities.values()) {
        if (e.owner === player.id && this.rules.units.get(e.typeId)?.domain === 'building') {
          hasBuilding = true;
          break;
        }
      }
      if (!hasBuilding) player.defeated = true;
    }
  }

  // ───────────────────────── tick ─────────────────────────

  step(): void {
    this.stepPower();
    this.stepProduction();
    this.stepRepair();
    for (const e of this.entities.values()) {
      const type = this.rules.units.get(e.typeId);
      if (!type) continue;
      if (e.harvester) this.stepHarvester(e, type);
      const engaging = this.stepCombat(e, type);
      if (!engaging) this.stepMovement(e, type);
    }
    this.stepProjectiles();
    this.reapDead();
    this.tick++;
  }

  // ───────────────────────── 状态指纹 ─────────────────────────

  hash(): number {
    const h = new StateHash();
    h.addInt(this.tick);
    h.addInt(this.prng.getState());
    h.addInt(this.entities.size);
    for (const p of this.players.values()) {
      h.addInt(p.id).addInt(p.credits).addInt(p.defeated ? 1 : 0);
    }
    for (const e of this.entities.values()) {
      h.addInt(e.id).addInt(e.owner).addInt(e.x).addInt(e.y).addInt(e.facing).addInt(e.hp);
      h.addInt(e.harvester ? e.harvester.load : -1);
      h.addInt(e.repairing ? 1 : 0).addInt(e.rallyX).addInt(e.rallyY);
    }
    h.addInt(this.projectiles.length);
    for (const p of this.projectiles) h.addInt(p.id).addInt(p.x).addInt(p.y);
    return h.value;
  }
}

export { producibleBy };
