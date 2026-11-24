/**
 * 立面网格的顶点布局与风格码。建筑、地标、九龙对岸背景共用 building 材质，
 * 所以都按这里的布局写顶点。
 *
 * aFacade = (u, v, h, style)：
 * - u：沿墙水平距离（米，含每栋楼的随机起点，令相邻楼窗格错开）；屋顶为世界平面 x（米）
 * - v：离楼底基准的高度（米）；屋顶为世界平面 y（米）
 * - h：楼高（米），用于女儿墙不画窗
 * - style：seed(0–255) + 256 × mode + 小数部分为逐栋随机数
 */
import { simToThree } from '../coords';
import { MeshArrays, type AttrSpec } from './mesh-arrays';

export const FACADE_LAYOUT: readonly AttrSpec[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
  { name: 'aFacade', size: 4 },
];

/** 立面模式（shader 里按 floor(style / 256) 分支）。 */
export const FacadeMode = {
  /** 普通窗格。 */
  Windows: 0,
  /** 敏感区：灰色封闭体，无窗。 */
  Plain: 1,
  /** 圆窗网格。 */
  Porthole: 2,
  /** 玻璃幕墙：反射天色 + 竖梃格线。 */
  Glass: 3,
  /** 远山：深色、稀疏灯点。 */
  Hill: 4,
} as const;
export type FacadeMode = (typeof FacadeMode)[keyof typeof FacadeMode];

/**
 * seed 的位含义（管线随机给 0–255；地标按需精确指定）：
 * bit0–1 灯色（0 暖 … 3 冷），bit2–3 亮灯率档，bit4–5 窗距档，bit6–7 墙色族。
 */
export function styleSeed(tint: number, lit: number, bay: number, body: number): number {
  return (tint & 3) | ((lit & 3) << 2) | ((bay & 3) << 4) | ((body & 3) << 6);
}

export function styleCode(seed: number, mode: FacadeMode, rnd: number): number {
  return (seed & 255) + 256 * mode + Math.min(Math.max(rnd, 0), 0.999);
}

export function newFacadeArrays(): MeshArrays {
  return new MeshArrays(FACADE_LAYOUT);
}

const scratch = new Float32Array(10);

/** 写一个立面顶点：位置为模拟坐标（dm），法线为模拟坐标系方向（单位向量）。 */
export function facadeVertex(
  m: MeshArrays,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number,
  h: number,
  style: number,
): number {
  simToThree(x, y, z, scratch, 0);
  simToThree(nx, ny, nz, scratch, 3, 1);
  scratch[6] = u;
  scratch[7] = v;
  scratch[8] = h;
  scratch[9] = style;
  return m.push(scratch);
}

/** 32 位 FNV-1a 字符串哈希，映射到 [0, 1)。用于逐栋稳定随机数。 */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
