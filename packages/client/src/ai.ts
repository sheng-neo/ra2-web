/**
 * 遭遇战 AI（命令驱动，便于将来移进确定性 sim / 回放）。
 *
 * 2.0 升级：① 多种「打法人格」按种子随机抽取——同一张图每局开局/兵种/节奏不同；
 * ② 反应式生产——按侦察到的敌军构成微调（步兵多则提前出攻城车补刀）；
 * ③ 防僵持升级——随时间推移降低开战门槛，后期必然全力一击（也保证 AI 互殴能分胜负）。
 * 核心仍是「稳经济 → 持续造兵 → 攒成波一起压上、滚雪球不回撤」，避免拉锯僵局。
 * 仅读世界状态 + 发命令（确定性，无随机/时钟；人格由构造期种子决定）。
 */
import type { Command, Entity, Player, World } from '@ra2web/game';

const BUILD_ORDER = ['powerplant', 'refinery', 'barracks', 'warfactory'];

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 打法人格。 */
type Personality = 'tank' | 'rusher' | 'turtle' | 'economy';
const PERSONAS: Personality[] = ['tank', 'rusher', 'turtle', 'economy'];

interface PersonaParams {
  /** 攒够多少「闲置」作战单位发起一波。 */
  waveSize: number;
  /** 维持的矿车数。 */
  harvesters: number;
  /** 防御建筑上限。 */
  defenses: number;
  /** 维持的精炼厂数（经济规模）。 */
  refineries: number;
  /** 多少主战坦克后开始补攻城车。 */
  siegeAt: number;
  /** 是否步兵海（廉价兵力压制）。 */
  infantryHeavy: boolean;
}

const PERSONA: Record<Personality, PersonaParams> = {
  // 标准重装：坦克为主，中等节奏
  tank: { waveSize: 6, harvesters: 3, defenses: 1, refineries: 2, siegeAt: 5, infantryHeavy: false },
  // 速攻：极简经济、早出步兵+坦克，小波快压
  rusher: { waveSize: 3, harvesters: 2, defenses: 0, refineries: 1, siegeAt: 99, infantryHeavy: true },
  // 龟缩反推：先经济+多防御，攒大军一波带走
  turtle: { waveSize: 9, harvesters: 3, defenses: 4, refineries: 2, siegeAt: 4, infantryHeavy: false },
  // 暴经济：多矿车多精炼，后期兵力滚雪球
  economy: { waveSize: 8, harvesters: 5, defenses: 2, refineries: 3, siegeAt: 6, infantryHeavy: false },
};

interface DiffParams {
  waveBias: number; // 开战门槛偏移（负=更激进）
  harvBonus: number;
  defBonus: number;
  reacts: boolean; // 是否按敌情反应
}
const DIFF: Record<Difficulty, DiffParams> = {
  easy: { waveBias: 4, harvBonus: 0, defBonus: 0, reacts: false },
  normal: { waveBias: 0, harvBonus: 0, defBonus: 1, reacts: true },
  hard: { waveBias: -1, harvBonus: 1, defBonus: 1, reacts: true },
};

export class SimpleAI {
  private readonly persona: Personality;
  private readonly p: PersonaParams;
  private readonly d: DiffParams;
  private readonly harvesters: number;
  private readonly defenses: number;
  private readonly baseWave: number;
  private engaged = false;

  constructor(
    private readonly playerId: number,
    difficulty: Difficulty = 'normal',
    seed: number = playerId,
  ) {
    // 人格由种子决定（同种子可复现；play.ts 每局给不同种子 → 每局打法不同）
    this.persona = PERSONAS[((seed >>> 0) + playerId) % PERSONAS.length]!;
    this.p = PERSONA[this.persona];
    this.d = DIFF[difficulty];
    this.harvesters = this.p.harvesters + this.d.harvBonus;
    this.defenses = this.p.defenses + this.d.defBonus;
    this.baseWave = Math.max(2, this.p.waveSize + this.d.waveBias);
  }

  /** 调试/展示用：当前人格。 */
  get personality(): string {
    return this.persona;
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

  // ——— 生产：保矿车 → 持续造兵（按人格/敌情调兵种），步兵与载具并行 ———
  private manageProduction(world: World, player: Player, cmds: Command[]): void {
    const side = player.side;
    if (world.hasBuilding(this.playerId, 'warfactory')) {
      const vq = world.queueFor(this.playerId, 'vehicle');
      if (!vq || vq.items.length === 0) {
        const tank = side === 'soviet' ? 'rhino' : 'grizzly';
        const siege = side === 'soviet' ? 'v3' : 'arty';
        const tanks = this.countUnits(world, tank);
        // 反应式：敌步兵海则提前出攻城车（溅射克步兵）
        let siegeAt = this.p.siegeAt;
        if (this.d.reacts) {
          const comp = this.enemyComposition(world);
          if (comp.infantry > comp.vehicle * 2 + 1) siegeAt = Math.min(siegeAt, 3);
        }
        if (this.countUnits(world, 'harvester') < this.harvesters) {
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
    // 步兵与载具并行造（不同队列）。步兵海人格连续补兵，其余兵营空了才补。
    if (world.hasBuilding(this.playerId, 'barracks')) {
      const iq = world.queueFor(this.playerId, 'infantry');
      const inf = side === 'soviet' ? 'conscript' : 'gi';
      if (!iq || iq.items.length === 0) {
        cmds.push({ kind: 'produce', owner: this.playerId, typeId: inf });
        if (this.p.infantryHeavy) cmds.push({ kind: 'produce', owner: this.playerId, typeId: inf });
      }
    }
  }

  // ——— 军队：攒够一波「全军压上」并每轮重发（滚雪球持续推进，不回撤）；
  //      开战门槛随时间下降，后期必全力出击（防僵持，保证能分胜负） ———
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

    // 门槛随时间衰减：每 ~45s 降 1，最低 2 —— 后期必然成军出击
    const decay = Math.floor(world.tick / (15 * 45));
    const effWave = Math.max(2, this.baseWave - decay);
    if (army.length >= effWave) this.engaged = true;
    if (!this.engaged) return;

    const target = this.pickTarget(world, enemies, this.centroid(army));
    if (target !== null) cmds.push({ kind: 'attack', entityIds: army.map((e) => e.id), targetId: target });
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

  /** 决定下一座建筑：保电 → 科技链 → 扩经济（按人格精炼厂数）→ 防御（按人格上限）→ 多电托底。 */
  private nextBuilding(world: World, player: Player): string | null {
    const has = (id: string): boolean => world.hasBuilding(this.playerId, id);
    if (player.powerDrained > player.powerProduced - 20 && has('powerplant')) return 'powerplant';
    for (const id of BUILD_ORDER) if (!has(id)) return id;
    if (this.countBuildings(world, 'refinery') < this.p.refineries) return 'refinery';
    if (this.countBuildings(world, 'tesla') + this.countBuildings(world, 'pillbox') < this.defenses) {
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
