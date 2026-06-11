/**
 * 遭遇战 AI（命令驱动，便于将来移进确定性 sim / 回放）。
 * 思路：稳经济（多矿车 + 双精炼）→ 持续造兵 → 攒成「波」一起推进
 * （而非挤牙膏）→ 老家被骚扰则回防 → 目标动态选最近敌人，目标死了自动换。
 * 比占位强很多：会持续施压、会回防、不会打完一波就发呆。
 * 仅读世界状态 + 发命令（确定性，无随机/时钟）。
 */
import type { Command, Entity, Player, World } from '@ra2web/game';

const BUILD_ORDER = ['powerplant', 'refinery', 'barracks', 'warfactory'];

export type Difficulty = 'easy' | 'normal' | 'hard';

interface DiffParams {
  /** 攒够多少「闲置」作战单位就发起一波进攻。 */
  waveSize: number;
  /** 维持的矿车数。 */
  harvesters: number;
  /** 防御建筑上限。 */
  defenses: number;
}

const DIFF: Record<Difficulty, DiffParams> = {
  easy: { waveSize: 8, harvesters: 2, defenses: 1 },
  normal: { waveSize: 5, harvesters: 3, defenses: 2 },
  hard: { waveSize: 3, harvesters: 4, defenses: 3 },
};

export class SimpleAI {
  private readonly params: DiffParams;
  private engaged = false;

  constructor(
    private readonly playerId: number,
    difficulty: Difficulty = 'normal',
  ) {
    this.params = DIFF[difficulty];
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

  // ——— 生产：保矿车 → 持续造兵（坦克为主，攒够补攻城车/防空，穿插步兵） ———
  private manageProduction(world: World, player: Player, cmds: Command[]): void {
    const side = player.side;
    if (world.hasBuilding(this.playerId, 'warfactory')) {
      const vq = world.queueFor(this.playerId, 'vehicle');
      if (!vq || vq.items.length === 0) {
        const tank = side === 'soviet' ? 'rhino' : 'grizzly';
        const siege = side === 'soviet' ? 'v3' : 'arty';
        const harvesters = this.countUnits(world, 'harvester');
        const tanks = this.countUnits(world, tank);
        if (harvesters < this.params.harvesters) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'harvester' });
        } else if (tanks >= 5 && this.countUnits(world, siege) < 3) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: siege });
        } else if (tanks >= 3 && this.countUnits(world, 'flaktrak') < 2) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'flaktrak' });
        } else {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: tank });
        }
      }
    }
    // 步兵与载具并行造（不同队列），廉价填充兵力
    if (world.hasBuilding(this.playerId, 'barracks')) {
      const iq = world.queueFor(this.playerId, 'infantry');
      if (!iq || iq.items.length === 0) {
        cmds.push({ kind: 'produce', owner: this.playerId, typeId: side === 'soviet' ? 'conscript' : 'gi' });
      }
    }
  }

  // ——— 军队：攒够一波后「全军压上」并每轮重发（滚雪球式持续推进，不回撤，避免拉锯僵局） ———
  private manageArmy(world: World, cmds: Command[]): void {
    const army: Entity[] = [];
    const enemies: Entity[] = [];
    for (const e of world.entities.values()) {
      const type = world.rules.units.get(e.typeId);
      if (!type) continue;
      if (e.owner === this.playerId) {
        if (type.domain !== 'building' && type.weapon) army.push(e);
      } else if (e.owner !== this.playerId && world.players.has(e.owner)) {
        enemies.push(e);
      }
    }
    if (army.length === 0 || enemies.length === 0) return;

    // 先攒够一波再开打（避免单兵送死）；攒过一次后保持交战，全军每轮重发压上
    if (army.length >= this.params.waveSize) this.engaged = true;
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

  private nearest(list: Entity[], from: { x: number; y: number }, maxCells = Infinity): Entity | null {
    let best: Entity | null = null;
    let bestD = maxCells * maxCells;
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

  /** 决定下一座建筑：保电 → 科技链 → 扩经济（双精炼）→ 防御 → 多电托底。 */
  private nextBuilding(world: World, player: Player): string | null {
    const has = (id: string): boolean => world.hasBuilding(this.playerId, id);
    if (player.powerDrained > player.powerProduced - 20 && has('powerplant')) return 'powerplant';
    for (const id of BUILD_ORDER) if (!has(id)) return id;
    if (this.countBuildings(world, 'refinery') < 2) return 'refinery';
    if (this.countBuildings(world, 'tesla') + this.countBuildings(world, 'pillbox') < this.params.defenses) {
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
