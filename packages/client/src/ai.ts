/**
 * 极简遭遇战 AI（占位）：纯靠发命令驱动，便于将来移进确定性 sim / 回放。
 * 按固定 tick 节奏：补齐基地科技链 → 持续造兵 → 攒够一波就 attack-move 推进。
 * 不是强 AI，只为让单机演示「有对手、能打起来」。
 */
import type { Command, World } from '@ra2web/game';

const BUILD_ORDER = ['powerplant', 'refinery', 'barracks', 'warfactory', 'tesla'];

export type Difficulty = 'easy' | 'normal' | 'hard';

interface DiffParams {
  /** 攒够多少作战单位才发起一波。 */
  waveSize: number;
  /** 每隔多少次决策（决策周期≈1s）攒兵推进一次。 */
  waveInterval: number;
}

const DIFF: Record<Difficulty, DiffParams> = {
  easy: { waveSize: 6, waveInterval: 20 },
  normal: { waveSize: 4, waveInterval: 12 },
  hard: { waveSize: 3, waveInterval: 7 },
};

export class SimpleAI {
  private waveTimer = 0;
  private readonly params: DiffParams;

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

    const queue = world.queueFor(this.playerId, 'building');
    // 队首就绪 → 找空位放置
    if (queue?.readyToPlace) {
      const typeId = queue.items[0]!;
      const spot = this.findBuildSpot(world, typeId);
      if (spot) cmds.push({ kind: 'place', owner: this.playerId, typeId, cellX: spot.x, cellY: spot.y });
    } else if (!queue || queue.items.length === 0) {
      const next = this.nextBuilding(world, player);
      if (next) world.queueProduction(this.playerId, next);
    }

    // 经济：矿车不足则补（保证采矿）
    const side = player.side;
    if (world.hasBuilding(this.playerId, 'warfactory')) {
      const harvesters = this.countUnits(world, 'harvester');
      const vq = world.queueFor(this.playerId, 'vehicle');
      if ((!vq || vq.items.length === 0)) {
        if (harvesters < 2) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'harvester' });
        } else {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: side === 'soviet' ? 'rhino' : 'grizzly' });
        }
      }
    } else if (world.hasBuilding(this.playerId, 'barracks')) {
      const iq = world.queueFor(this.playerId, 'infantry');
      if (!iq || iq.items.length === 0) {
        cmds.push({ kind: 'produce', owner: this.playerId, typeId: side === 'soviet' ? 'conscript' : 'gi' });
      }
    }

    // 攒兵成波推进：用攻击命令咬住敌方最近的建筑（会自动追击+开火）
    if (++this.waveTimer >= this.params.waveInterval) {
      this.waveTimer = 0;
      const army: number[] = [];
      for (const e of world.entities.values()) {
        const type = world.rules.units.get(e.typeId);
        if (e.owner === this.playerId && type && type.domain !== 'building' && type.weapon) {
          army.push(e.id);
        }
      }
      if (army.length >= this.params.waveSize) {
        const targetId = this.nearestEnemyBuilding(world);
        if (targetId !== null) {
          cmds.push({ kind: 'attack', entityIds: army, targetId });
        }
      }
    }
    return cmds;
  }

  private countUnits(world: World, typeId: string): number {
    let n = 0;
    for (const e of world.entities.values()) if (e.owner === this.playerId && e.typeId === typeId) n++;
    return n;
  }

  /** 决定下一个该建的建筑：保电 → 科技链 → 扩经济 → 防御。 */
  private nextBuilding(world: World, player: { powerProduced: number; powerDrained: number }): string | null {
    const has = (id: string): boolean => world.hasBuilding(this.playerId, id);
    // 电力告急优先补电厂
    if (player.powerDrained > player.powerProduced - 20 && has('powerplant')) return 'powerplant';
    // 科技链
    for (const id of BUILD_ORDER) {
      if (id === 'tesla') continue; // 防御单独处理
      if (!has(id)) return id;
    }
    // 第二座精炼厂扩经济（用现有建筑数粗略判断只建一次额外的）
    if (this.countBuildings(world, 'refinery') < 2) return 'refinery';
    // 防御：最多 2 座
    if (this.countBuildings(world, 'tesla') + this.countBuildings(world, 'pillbox') < 2) {
      return player.powerProduced > player.powerDrained + 150 ? 'tesla' : 'pillbox';
    }
    // 多电厂托底
    if (player.powerDrained > player.powerProduced - 50) return 'powerplant';
    return null;
  }

  private countBuildings(world: World, typeId: string): number {
    let n = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && e.typeId === typeId && world.rules.units.get(e.typeId)?.domain === 'building') n++;
    }
    return n;
  }

  private nearestEnemyBuilding(world: World): number | null {
    for (const e of world.entities.values()) {
      const type = world.rules.units.get(e.typeId);
      if (e.owner !== this.playerId && type?.domain === 'building') return e.id;
    }
    return null;
  }

  private findBuildSpot(world: World, typeId: string): { x: number; y: number } | null {
    const type = world.rules.units.get(typeId);
    if (!type) return null;
    // 找自家任一建筑，绕其螺旋扩展找可放置点
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
