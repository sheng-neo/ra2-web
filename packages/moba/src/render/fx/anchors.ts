/**
 * 单位锚点查询：特效/叠加层需要的「某个单位此刻画在哪」。
 *
 * 默认实现：有单位视图模块('units')时直接取它的渲染信息——真正画出来的位置(含跳跃/击飞/河道下沉)、模型头顶高度、
 * 显示不透明度(视野淡入淡出)；没有时退回 ctx.unitQuery + GameState 的插值位置。半径与敌我可见性取自 GameState。
 * 需要完全自定义可用 FxModule.setAnchors() 整体替换。
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
  /** 存活且对玩家队伍可见(单位视图还在淡出的那一小段时间也算) */
  visible: boolean;
  /**
   * 单位模型当前显示的不透明度 0..1：刚进视野时从 0 淡入、丢失视野后淡出到 0，草丛里/不可选中时停在半透明。
   * 血条等跟着它淡入淡出。没有单位视图模块时恒为 1。
   */
  opacity: number;
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
  /** 可选：让单位模型整体短暂染色(被吐息喷中等)，从 amount 起在 dur 秒内衰减。没有单位视图模块时无效 */
  flashTint?(id: number, color: THREE.ColorRepresentation, amount: number, dur: number): void;
  /** 可选：让单位模型的描边转金 dur 秒(河道巨龙的全队奖励到手)。没有单位视图模块或不描边的档位无效 */
  flashRim?(id: number, dur: number): void;
}

/** 单位视图模块里与锚点有关的那一小部分(鸭子类型：不依赖其具体实现) */
interface ViewProvider extends RenderModule {
  getAttach?(id: number, name: string, out: THREE.Vector3): boolean;
  getInfo?(id: number, out: ViewInfo): boolean;
  flashTint?(id: number, color: THREE.ColorRepresentation, amount: number, dur: number): void;
  flashRim?(id: number, dur: number): void;
}

/** 单位视图的渲染信息(units 模块 UnitViewInfo 的子集) */
interface ViewInfo {
  x: number;
  y: number;
  z: number;
  height: number;
  opacity: number;
}

export function createAnchor(): UnitAnchor {
  return { x: 0, y: 0, z: 0, height: 2, radius: 0.6, visible: false, opacity: 1, unit: null };
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
  // 单位视图模块(有的话)：位置/头顶高度/显示不透明度都以真正画出来的模型为准
  let views: ViewProvider | undefined;
  const info: ViewInfo = { x: 0, y: 0, z: 0, height: 2, opacity: 1 };
  return {
    begin(f) {
      frame = f;
      views = ctx.getModule<ViewProvider>('units');
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
      const seen = u.team === frame.playerTeam || u.visible[frame.playerTeam];
      out.radius = u.radius;
      out.unit = u;
      if (views?.getInfo && views.getInfo(id, info)) {
        out.x = info.x;
        out.y = info.y;
        out.z = info.z;
        out.height = info.height;
        out.opacity = info.opacity;
        // 模拟层刚判定「看不见」时模型还要淡出一小会儿：这段时间血条/状态跟着一起淡，而不是先消失
        out.visible = u.alive && (seen || info.opacity > 0.02);
        return true;
      }
      if (!ctx.unitQuery.getPosition(id, pos)) {
        const a = frame.alpha;
        pos.set(u.prevPos.x + (u.pos.x - u.prevPos.x) * a, 0, u.prevPos.y + (u.pos.y - u.prevPos.y) * a);
      }
      out.x = pos.x;
      out.y = pos.y;
      out.z = pos.z;
      out.height = ctx.unitQuery.getHeight(id);
      out.opacity = 1;
      out.visible = u.alive && seen;
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
      const units = views ?? ctx.getModule<ViewProvider>('units');
      return units?.getAttach ? units.getAttach(id, name, out) : false;
    },
    flashTint(id, color, amount, dur) {
      (views ?? ctx.getModule<ViewProvider>('units'))?.flashTint?.(id, color, amount, dur);
    },
    flashRim(id, dur) {
      (views ?? ctx.getModule<ViewProvider>('units'))?.flashRim?.(id, dur);
    },
  };
}
