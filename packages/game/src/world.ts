/**
 * 模拟世界：固定 tick、命令驱动、全整数状态。
 * 这是锁步联机的共享内核 —— 同样的初始状态 + 同样的命令序列
 * 必须在任何机器上产生逐 tick 完全相同的世界（用 hash() 校验）。
 */
import { LEPTONS_PER_CELL, cellToLepton, leptonToCell } from './coords';
import { dirToBangle, dist, turnToward, velocity } from './fixed';
import { StateHash } from './hash';
import { findPath, type PathGrid } from './pathfind';
import { Prng } from './prng';

export interface TerrainInfo extends PathGrid {
  width: number;
  height: number;
  passable(x: number, y: number): boolean;
}

export interface UnitSpec {
  /** 速度：lepton / tick。 */
  speed: number;
  /** 转速：二进制角 / tick。 */
  rot: number;
}

export interface Entity {
  id: number;
  owner: number;
  /** 位置（lepton）。 */
  x: number;
  y: number;
  /** 朝向（二进制角 0–255）。 */
  facing: number;
  spec: UnitSpec;
  /** 当前路径（格序列，逆序栈，pop 取下一格）。 */
  path: { x: number; y: number }[];
  /** 当前段目标（lepton），无则为 null。 */
  waypoint: { x: number; y: number } | null;
  /** 最终目的格（重寻路用）。 */
  goal: { x: number; y: number } | null;
}

/** 玩家命令（联机时经服务器排序广播）。 */
export type Command =
  | { kind: 'spawn'; owner: number; cellX: number; cellY: number; spec: UnitSpec }
  | { kind: 'move'; entityIds: number[]; cellX: number; cellY: number };

export class World {
  tick = 0;
  readonly prng: Prng;
  readonly entities = new Map<number, Entity>();
  private nextEntityId = 1;

  constructor(
    readonly terrain: TerrainInfo,
    seed: number,
  ) {
    this.prng = new Prng(seed);
  }

  /** 在本 tick 应用一批命令（顺序敏感，锁步层保证全端一致）。 */
  applyCommands(commands: Command[]): void {
    for (const cmd of commands) {
      switch (cmd.kind) {
        case 'spawn': {
          const id = this.nextEntityId++;
          this.entities.set(id, {
            id,
            owner: cmd.owner,
            x: cellToLepton(cmd.cellX),
            y: cellToLepton(cmd.cellY),
            facing: 0,
            spec: cmd.spec,
            path: [],
            waypoint: null,
            goal: null,
          });
          break;
        }
        case 'move': {
          for (const eid of cmd.entityIds) {
            const e = this.entities.get(eid);
            if (!e) continue;
            this.orderMove(e, cmd.cellX, cmd.cellY);
          }
          break;
        }
      }
    }
  }

  private orderMove(e: Entity, cellX: number, cellY: number): void {
    const path = findPath(
      this.terrain,
      leptonToCell(e.x),
      leptonToCell(e.y),
      cellX,
      cellY,
    );
    e.goal = { x: cellX, y: cellY };
    e.path = path ? path.reverse() : [];
    e.waypoint = null;
  }

  /** 推进一个 tick。 */
  step(): void {
    // 按 id 升序遍历 —— Map 迭代顺序是插入序，id 单调递增，全端一致
    for (const e of this.entities.values()) {
      this.stepEntity(e);
    }
    this.tick++;
  }

  private stepEntity(e: Entity): void {
    if (!e.waypoint) {
      const next = e.path.pop();
      if (!next) {
        e.goal = null;
        return;
      }
      e.waypoint = { x: cellToLepton(next.x), y: cellToLepton(next.y) };
    }

    const dx = e.waypoint.x - e.x;
    const dy = e.waypoint.y - e.y;
    const target = dirToBangle(dx, dy);
    e.facing = turnToward(e.facing, target, e.spec.rot);
    // 没大致朝向路点前不前进（RA2 车辆手感）
    const diff = ((target - e.facing + 128) & 0xff) - 128;
    if (Math.abs(diff) > 32) return;

    const d = dist(dx, dy);
    if (d <= e.spec.speed) {
      e.x = e.waypoint.x;
      e.y = e.waypoint.y;
      e.waypoint = null;
      return;
    }
    const v = velocity(e.facing, e.spec.speed);
    e.x += v.dx;
    e.y += v.dy;
  }

  /** 世界状态指纹。 */
  hash(): number {
    const h = new StateHash();
    h.addInt(this.tick);
    h.addInt(this.prng.getState());
    h.addInt(this.entities.size);
    for (const e of this.entities.values()) {
      h.addInt(e.id).addInt(e.owner).addInt(e.x).addInt(e.y).addInt(e.facing);
    }
    return h.value;
  }
}

export { LEPTONS_PER_CELL };
