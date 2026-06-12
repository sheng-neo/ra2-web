/**
 * 遭遇战 AI —— 规则化策略（非 ML；仅读世界 + 发命令，确定性，无随机/时钟）。
 *
 * 按种子抽取一种「打法」，三种风格只在「防御投入 / 经济规模」上不同，
 * 但都遵循同一条核心节奏：**攒够约 15 个兵才成波出击；不够就在家积蓄、守家；从不一个一个送。**
 * - 防守流(defensive)：重防御（多碉堡/磁暴）+ 小经济 → 龟壳硬，靠你来啃。
 * - 均衡流(balanced)：防御与兵力兼顾。
 * - 全力进攻流(aggressive)：几乎不修防御 + 大经济 → 兵海，一波接一波压上。
 *
 * 不囤钱：钱持续投进「防御建筑 + 造兵」两条线。难度只改行为（出击门槛/是否按敌情反应），
 * 不给任何经济作弊——双方起始资源一致。
 */
import type { Command, Entity, Player, World } from '@ra2web/game';

const BUILD_ORDER = ['powerplant', 'refinery', 'barracks', 'warfactory'];

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 打法风格（按种子抽取，同图每局不同）。 */
type Mode = 'defensive' | 'balanced' | 'aggressive';
const MODES: Mode[] = ['defensive', 'balanced', 'aggressive'];

interface ModeParams {
  /** 静态防御建筑目标数（碉堡/磁暴）——「防御投入」，越大越龟。 */
  defenseTarget: number;
  /** 攒够多少兵成波出击（核心节奏）。 */
  waveSize: number;
  /** 维持的矿车数（经济规模 → 兵力规模）。 */
  harvesters: number;
  /** 维持的精炼厂数。 */
  refineries: number;
  /** 多少主战坦克后开始补攻城车。 */
  siegeAt: number;
  /** 是否步兵海（廉价兵力更快攒成波）。 */
  infantryHeavy: boolean;
}
const MODE: Record<Mode, ModeParams> = {
  // 防守流：8 座防御 + 小经济（兵少但龟壳硬）
  defensive: { defenseTarget: 8, waveSize: 15, harvesters: 2, refineries: 2, siegeAt: 4, infantryHeavy: false },
  // 均衡流：4 座防御 + 中等经济
  balanced: { defenseTarget: 4, waveSize: 15, harvesters: 3, refineries: 2, siegeAt: 5, infantryHeavy: false },
  // 全力进攻：1 座防御 + 大经济（兵海，一波接一波）
  aggressive: { defenseTarget: 1, waveSize: 15, harvesters: 4, refineries: 2, siegeAt: 6, infantryHeavy: true },
};

interface DiffParams {
  /** 出击门槛偏移（负=更早成波出击/更激进；正=更晚、更被动）。 */
  waveBias: number;
  /** 是否按敌情调整兵种（反装甲步兵/攻城车）。 */
  reacts: boolean;
}
const DIFF: Record<Difficulty, DiffParams> = {
  easy: { waveBias: 6, reacts: false }, // 攒到 ~21 才出击、不反应 → 好打
  normal: { waveBias: 0, reacts: true }, // ~15
  hard: { waveBias: -3, reacts: true }, // ~12 就压上、按敌情反制 → 凶
};

export class SimpleAI {
  private readonly mode: Mode;
  private readonly m: ModeParams;
  private readonly d: DiffParams;
  /** 实际出击门槛（mode.waveSize + 难度偏移）。 */
  private readonly waveSize: number;
  /** 是否已成波出击（攒够→true 全军压上；被打残→false 撤回重整）。 */
  private engaged = false;

  constructor(
    private readonly playerId: number,
    difficulty: Difficulty = 'normal',
    seed: number = playerId,
  ) {
    // 打法由种子决定（同种子可复现；play.ts 每局给不同种子 → 每局风格不同）
    this.mode = MODES[((seed >>> 0) + playerId) % MODES.length]!;
    this.m = MODE[this.mode];
    this.d = DIFF[difficulty];
    this.waveSize = Math.max(6, this.m.waveSize + this.d.waveBias);
  }

  /** 调试/展示用：当前打法（英文键）。 */
  get personality(): string {
    return this.mode;
  }

  /** 敌情简报用：打法中文名。 */
  get personaName(): string {
    return { defensive: '钢铁防线', balanced: '攻守均衡', aggressive: '全力进攻' }[this.mode];
  }

  /** 每 15 tick（≈1s）调用一次，返回要应用的命令。 */
  emit(world: World): Command[] {
    const cmds: Command[] = [];
    const player = world.players.get(this.playerId);
    if (!player || player.defeated) return cmds;

    this.manageBuildings(world, player, cmds);
    this.manageProduction(world, player, cmds);
    this.manageArmy(world, cmds);
    return cmds;
  }

  // ——— 建筑：放置就绪项 + 决定下一座 ———
  private manageBuildings(world: World, player: Player, cmds: Command[]): void {
    const queue = world.queueFor(this.playerId, 'building');
    if (queue?.readyToPlace) {
      const typeId = queue.items[0]!;
      const spot = this.findBuildSpot(world, typeId);
      if (spot) cmds.push({ kind: 'place', owner: this.playerId, typeId, cellX: spot.x, cellY: spot.y });
    } else if (!queue || queue.items.length === 0) {
      const next = this.nextBuilding(world, player);
      if (next) world.queueProduction(this.playerId, next);
    }
  }

  // ——— 生产：保矿车 → 持续造兵（按敌情调兵种），步兵与载具并行；从不囤钱 ———
  private manageProduction(world: World, player: Player, cmds: Command[]): void {
    const side = player.side;
    if (world.hasBuilding(this.playerId, 'warfactory')) {
      const vq = world.queueFor(this.playerId, 'vehicle');
      if (!vq || vq.items.length === 0) {
        const tank = side === 'soviet' ? 'rhino' : 'grizzly';
        const siege = side === 'soviet' ? 'v3' : 'arty';
        const tanks = this.countUnits(world, tank);
        // 反应式：敌步兵海则提前出攻城车（溅射克步兵）
        let siegeAt = this.m.siegeAt;
        if (this.d.reacts) {
          const comp = this.enemyComposition(world);
          if (comp.infantry > comp.vehicle * 2 + 1) siegeAt = Math.min(siegeAt, 3);
        }
        if (this.countUnits(world, 'harvester') < this.m.harvesters) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'harvester' });
        } else if (tanks >= siegeAt && this.countUnits(world, siege) < 3) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: siege });
        } else if (tanks >= 3 && this.countUnits(world, 'flaktrak') < 2) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'flaktrak' });
        } else {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: tank });
        }
      }
    }
    // 步兵与载具并行造（不同队列）。步兵海打法连续补兵，其余兵营空了才补。
    if (world.hasBuilding(this.playerId, 'barracks')) {
      const iq = world.queueFor(this.playerId, 'infantry');
      const inf = side === 'soviet' ? 'conscript' : 'gi';
      const antiArmor = side === 'soviet' ? 'tankbuster' : 'rocketsoldier';
      // 反应式：敌载具多于步兵 → 出反装甲步兵克制坦克
      let pick = inf;
      if (this.d.reacts) {
        const comp = this.enemyComposition(world);
        if (comp.vehicle > comp.infantry) pick = antiArmor;
      }
      if (!iq || iq.items.length === 0) {
        cmds.push({ kind: 'produce', owner: this.playerId, typeId: pick });
        if (this.m.infantryHeavy) cmds.push({ kind: 'produce', owner: this.playerId, typeId: inf });
      }
    }
  }

  // ——— 军队（核心节奏）：攒够 waveSize 才成波「全军压上」；不够则守家积蓄（不一个个送）；
  //      老家受袭就近回防（保持部分攻势避免僵局）；被打残则撤回重整，攒够再来一波 ———
  private manageArmy(world: World, cmds: Command[]): void {
    const army: Entity[] = [];
    const enemies: Entity[] = [];
    for (const e of world.entities.values()) {
      const type = world.rules.units.get(e.typeId);
      if (!type) continue;
      if (e.owner === this.playerId) {
        if (type.domain !== 'building' && type.weapon) army.push(e);
      } else if (world.players.has(e.owner)) {
        enemies.push(e);
      }
    }
    if (army.length === 0 || enemies.length === 0) return;

    // 出击门槛随时间衰减：每 ~45s 降 1，最低 2 —— 后期必然成军出击（也保证 AI 互殴必分胜负）。
    const decay = Math.floor(world.tick / (15 * 45));
    const effWave = Math.max(2, this.waveSize - decay);
    if (army.length >= effWave) this.engaged = true;
    else if (army.length < Math.max(2, effWave >> 1)) this.engaged = false; // 被打残：撤回重整、不添油

    const ids = army.map((e) => e.id);
    const home = this.baseCentroid(world);
    const threat = this.nearestThreatToBase(world, enemies); // 老家是否被敌方单位逼近
    if (threat !== null) {
      // 老家受袭：离家最近的约 1/3 回防迎敌（响应最快），2/3 继续推进（避免双方全员回防→僵局）；兵少则全员御敌。
      if (this.engaged && home && army.length >= 6) {
        const sorted = this.byDistToHome(army, home);
        const d = Math.max(1, Math.floor(sorted.length / 3));
        cmds.push({ kind: 'attack', entityIds: sorted.slice(0, d).map((e) => e.id), targetId: threat });
        const t = this.pickTarget(world, enemies, this.centroid(army));
        if (t !== null) cmds.push({ kind: 'attack', entityIds: sorted.slice(d).map((e) => e.id), targetId: t });
      } else {
        cmds.push({ kind: 'attack', entityIds: ids, targetId: threat });
      }
      return;
    }

    // 没攒够 → 守家积蓄（全部留在家，个体警戒会自卫；这天然让基地在出击前不空）。
    if (!this.engaged) return;
    // 攒够 → 成波，全军压上（绝不一个个送）。
    const target = this.pickTarget(world, enemies, this.centroid(army));
    if (target !== null) cmds.push({ kind: 'attack', entityIds: ids, targetId: target });
  }

  /** 老家威胁：返回最逼近我方建筑（≤12 格）的敌方非建筑单位 id，否则 null。 */
  private nearestThreatToBase(world: World, enemies: Entity[]): number | null {
    const buildings: Entity[] = [];
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') buildings.push(e);
    }
    if (buildings.length === 0) return null;
    let best: number | null = null;
    let bestD = 12 * 12;
    for (const e of enemies) {
      if (world.rules.units.get(e.typeId)?.domain === 'building') continue;
      for (const b of buildings) {
        const dx = e.cellX - b.cellX;
        const dy = e.cellY - b.cellY;
        const d = dx * dx + dy * dy;
        if (d <= bestD) {
          bestD = d;
          best = e.id;
        }
      }
    }
    return best;
  }

  /** 选攻击目标：离主力最近的敌方建筑（逐步推平到老家），无建筑则打最近敌方单位。 */
  private pickTarget(world: World, enemies: Entity[], from: { x: number; y: number }): number | null {
    const buildings = enemies.filter((e) => world.rules.units.get(e.typeId)?.domain === 'building');
    const nb = this.nearest(buildings, from);
    if (nb) return nb.id;
    const nu = this.nearest(enemies, from);
    return nu ? nu.id : null;
  }

  /** 侦察敌军构成（步兵 / 载具数量；仅非建筑）。casual 取全局，反应更明显。 */
  private enemyComposition(world: World): { infantry: number; vehicle: number } {
    let infantry = 0;
    let vehicle = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId || !world.players.has(e.owner)) continue;
      const dom = world.rules.units.get(e.typeId)?.domain;
      if (dom === 'infantry') infantry++;
      else if (dom === 'vehicle') vehicle++;
    }
    return { infantry, vehicle };
  }

  private nearest(list: Entity[], from: { x: number; y: number }): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of list) {
      const dx = e.cellX - from.x;
      const dy = e.cellY - from.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** 按到家距离升序（近家在前；整数距离平方，确定性）。 */
  private byDistToHome(army: Entity[], home: { x: number; y: number }): Entity[] {
    return [...army].sort((a, b) => {
      const da = (a.cellX - home.x) * (a.cellX - home.x) + (a.cellY - home.y) * (a.cellY - home.y);
      const db = (b.cellX - home.x) * (b.cellX - home.x) + (b.cellY - home.y) * (b.cellY - home.y);
      return da - db;
    });
  }

  /** 我方建筑质心（回防判定的「家」）。 */
  private baseCentroid(world: World): { x: number; y: number } | null {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') {
        sx += e.cellX;
        sy += e.cellY;
        n++;
      }
    }
    return n === 0 ? null : { x: Math.round(sx / n), y: Math.round(sy / n) };
  }

  private centroid(list: Entity[]): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    for (const e of list) {
      sx += e.cellX;
      sy += e.cellY;
    }
    return { x: Math.round(sx / list.length), y: Math.round(sy / list.length) };
  }

  private countUnits(world: World, typeId: string): number {
    let n = 0;
    for (const e of world.entities.values()) if (e.owner === this.playerId && e.typeId === typeId) n++;
    return n;
  }

  private countBuildings(world: World, typeId: string): number {
    let n = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && e.typeId === typeId && world.rules.units.get(e.typeId)?.domain === 'building') n++;
    }
    return n;
  }

  /** 决定下一座建筑：保电 → 科技链 → 扩经济 → 防御（按打法 defenseTarget）→ 多电托底。 */
  private nextBuilding(world: World, player: Player): string | null {
    const has = (id: string): boolean => world.hasBuilding(this.playerId, id);
    if (player.powerDrained > player.powerProduced - 20 && has('powerplant')) return 'powerplant';
    for (const id of BUILD_ORDER) if (!has(id)) return id;
    if (this.countBuildings(world, 'refinery') < this.m.refineries) return 'refinery';
    // 防御投入：按打法修到 defenseTarget 座（防守流 8 / 均衡 4 / 进攻 1）。电够上磁暴，否则碉堡。
    if (this.countBuildings(world, 'tesla') + this.countBuildings(world, 'pillbox') < this.m.defenseTarget) {
      return player.powerProduced > player.powerDrained + 150 ? 'tesla' : 'pillbox';
    }
    if (player.powerDrained > player.powerProduced - 50) return 'powerplant';
    return null;
  }

  private findBuildSpot(world: World, typeId: string): { x: number; y: number } | null {
    const type = world.rules.units.get(typeId);
    if (!type) return null;
    let anchor: { x: number; y: number } | null = null;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') {
        anchor = { x: e.cellX, y: e.cellY };
        break;
      }
    }
    if (!anchor) return null;
    for (let r = 2; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = anchor.x + dx;
          const y = anchor.y + dy;
          if (world.canPlace(this.playerId, type, x, y)) return { x, y };
        }
      }
    }
    return null;
  }
}
