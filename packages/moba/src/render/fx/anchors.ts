/**
 * 单位锚点查询：特效/叠加层需要的「某个单位此刻画在哪」。
 *
 * 默认实现 = ctx.unitQuery(位置已按 tick 插值；R2 的单位视图通过 ctx.setUnitQuery 换成带跳跃/击飞高度的版本后，
 * 这里自动跟着变) + GameState 里的半径/可见性。集成时如需完全自定义，可用 FxModule.setAnchors() 整体替换。
 */
import type * as THREE from 'three';
import { VISION } from '../../core/data/units';
import type { Unit } from '../../core/types';
import type { FrameInfo, RenderContext, RenderModule } from '../engine/context';

export interface UnitAnchor {
  /** 脚底的世界坐标(已插值)：x、离地高度、z */
  x: number;
  y: number;
  z: number;
  /** 头顶相对脚底的高度(血条/头顶图标挂点) */
  height: number;
  /** 碰撞半径 */
  radius: number;
  /** 存活且对玩家队伍可见 */
  visible: boolean;
  unit: Unit | null;
}

export interface UnitAnchors {
  /** 每帧开始时调用一次 */
  begin(frame: FrameInfo): void;
  /** 查询锚点。单位不存在返回 false(out 不变) */
  get(id: number, out: UnitAnchor): boolean;
  /** 按 id 取单位(本帧状态) */
  unit(id: number): Unit | undefined;
  /** 地面上一点是否在玩家队伍的视野内(敌方技能特效/弹道在迷雾里不画) */
  pointVisible(x: number, z: number): boolean;
  /**
   * 可选：模型挂点的世界坐标('muzzle' 弹道出口 / 'core' 塔与水晶的能量核心 / 'chest' 胸口…)。
   * 没有实现或返回 false 时，调用方按单位高度估算。
   */
  attach?(id: number, name: string, out: THREE.Vector3): boolean;
}

/** 单位视图模块里与挂点有关的那一小部分(鸭子类型：不依赖其具体实现) */
interface AttachProvider extends RenderModule {
  getAttach?(id: number, name: string, out: THREE.Vector3): boolean;
}

export function createAnchor(): UnitAnchor {
  return { x: 0, y: 0, z: 0, height: 2, radius: 0.6, visible: false, unit: null };
}

function sightOf(u: Unit): number {
  switch (u.kind) {
    case 'hero':
      return VISION.hero;
    case 'minion':
      return VISION.minion;
    case 'tower':
      return VISION.tower;
    case 'core':
      return VISION.core;
    default:
      return 0;
  }
}

export function createDefaultAnchors(ctx: RenderContext, pos: THREE.Vector3): UnitAnchors {
  const index = new Map<number, Unit>();
  // 己方有视野的单位：x, z, 视野半径²
  let allies = new Float32Array(64 * 3);
  let allyCount = 0;
  let frame: FrameInfo = ctx.frame;
  return {
    begin(f) {
      frame = f;
      index.clear();
      allyCount = 0;
      const team = f.playerTeam;
      for (const u of f.state.units) {
        index.set(u.id, u);
        if (u.team !== team || !u.alive) continue;
        const s = sightOf(u);
        if (s <= 0) continue;
        if (allyCount * 3 + 3 > allies.length) {
          const grown = new Float32Array(allies.length * 2);
          grown.set(allies);
          allies = grown;
        }
        allies[allyCount * 3] = u.pos.x;
        allies[allyCount * 3 + 1] = u.pos.y;
        allies[allyCount * 3 + 2] = s * s;
        allyCount++;
      }
    },
    get(id, out) {
      const u = index.get(id);
      if (!u) return false;
      if (!ctx.unitQuery.getPosition(id, pos)) {
        const a = frame.alpha;
        pos.set(u.prevPos.x + (u.pos.x - u.prevPos.x) * a, 0, u.prevPos.y + (u.pos.y - u.prevPos.y) * a);
      }
      out.x = pos.x;
      out.y = pos.y;
      out.z = pos.z;
      out.height = ctx.unitQuery.getHeight(id);
      out.radius = u.radius;
      out.visible = u.alive && (u.team === frame.playerTeam || u.visible[frame.playerTeam]);
      out.unit = u;
      return true;
    },
    unit(id) {
      return index.get(id);
    },
    pointVisible(x, z) {
      for (let i = 0; i < allyCount; i++) {
        const dx = allies[i * 3] - x;
        const dz = allies[i * 3 + 1] - z;
        if (dx * dx + dz * dz <= allies[i * 3 + 2]) return true;
      }
      return false;
    },
    attach(id, name, out) {
      const units = ctx.getModule<AttachProvider>('units');
      return units?.getAttach ? units.getAttach(id, name, out) : false;
    },
  };
}
