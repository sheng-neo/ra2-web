/**
 * 极简遭遇战 AI（占位）：纯靠发命令驱动，便于将来移进确定性 sim / 回放。
 * 按固定 tick 节奏：补齐基地科技链 → 持续造兵 → 攒够一波就 attack-move 推进。
 * 不是强 AI，只为让单机演示「有对手、能打起来」。
 */
import type { Command, World } from '@ra2web/game';

const BUILD_ORDER = ['powerplant', 'refinery', 'barracks', 'warfactory', 'tesla'];

export class SimpleAI {
  private waveTimer = 0;

  constructor(private readonly playerId: number) {}

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
    } else {
      // 按科技链补建：跳过已拥有的、以及已在队列里的（避免在建未落成时重复排）
      const bq = world.queueFor(this.playerId, 'building');
      const inQueue = (id: string): boolean => !!bq?.items.includes(id);
      for (const id of BUILD_ORDER) {
        if (this.builtOrQueued(world, id, inQueue)) continue;
        if (world.queueProduction(this.playerId, id)) break;
      }
    }

    // 有战车工厂就持续造坦克（直接走 produce 命令，由 sim 出厂）
    if (world.hasBuilding(this.playerId, 'warfactory')) {
      const vq = world.queueFor(this.playerId, 'vehicle');
      if (!vq || vq.items.length === 0) {
        cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'rhino' });
      }
    } else if (world.hasBuilding(this.playerId, 'barracks')) {
      const iq = world.queueFor(this.playerId, 'infantry');
      if (!iq || iq.items.length === 0) {
        cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'conscript' });
      }
    }

    // 攒兵成波推进：用攻击命令咬住敌方最近的建筑（会自动追击+开火）
    if (++this.waveTimer >= 12) {
      this.waveTimer = 0;
      const army: number[] = [];
      for (const e of world.entities.values()) {
        const type = world.rules.units.get(e.typeId);
        if (e.owner === this.playerId && type && type.domain !== 'building' && type.weapon) {
          army.push(e.id);
        }
      }
      if (army.length >= 3) {
        const targetId = this.nearestEnemyBuilding(world);
        if (targetId !== null) {
          cmds.push({ kind: 'attack', entityIds: army, targetId });
        }
      }
    }
    return cmds;
  }

  private builtOrQueued(world: World, id: string, inQueue: (id: string) => boolean): boolean {
    return world.hasBuilding(this.playerId, id) || inQueue(id);
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
