// ===== sim/terrain/slope.ts =====（spec:terrain §2.4 / §2.5 / §3.2）
// 坡面表与角点编解码：旋转置换表的唯一真源在 contracts/rotation.ts，这里只 re-export；补上 XTER 码分类与"地块 ⇄ 角点"换算。
import { CORNER_SIZE, XterClass, xterClassOf } from '../../contracts/grid';
import { CORNERS_TO_SLOPE, SLOPE_CORNERS } from '../../contracts/rotation';

export {
  SLOPE_CORNERS, CORNERS_TO_SLOPE, SLOPE_ROT_CCW, SLOPE_ROT_CW, XTER_STREAM_ROT_CCW, DIR_ROT_CCW,
  rotateXter, rotateTile, unrotateTile, rotateCorner, rotateDir,
} from '../../contracts/rotation';
export type { Rotation } from '../../contracts/rotation';

export const BEDROCK_SLOPE = 13;
export const XTER_WATERFALL = 0x3e, XTER_STREAM_LR = 0x40, XTER_STREAM_TB = 0x41;
export const XTER_BAY_B = 0x42, XTER_BAY_L = 0x43, XTER_BAY_T = 0x44, XTER_BAY_R = 0x45;
/** 树木密度 1..7 对应 XBLD 0x06..0x0C。 */
export const TREE_FIRST = 0x06, TREE_LAST = 0x0c, TREE_MAX_DENSITY = 7;
export const isTreeXbld = (b: number): boolean => b >= TREE_FIRST && b <= TREE_LAST;
export const treeDensityOf = (b: number): number => (isTreeXbld(b) ? b - TREE_FIRST + 1 : 0);
export const treeXbldOf = (density: number): number => (density <= 0 ? 0 : TREE_FIRST + Math.min(TREE_MAX_DENSITY, density) - 1);

/** XTER 码是否未定义（0x0E/0x0F/0x1E/0x1F/0x2E/0x2F/0x3F/0x46–0xFF）。 */
export function isUndefinedXter(code: number): boolean {
  if (code === XTER_WATERFALL) return false;
  if (code >= 0x40) return code > XTER_BAY_R;
  return (code & 0x0f) > BEDROCK_SLOPE;
}
/** 坡面码：0x0X/0x1X/0x2X 低 nibble；0x3E → 13；0x3X 浅水（形状码，不是高度）与 0x4X 溪流 → 0。 */
export function slopeCodeOf(xter: number): number {
  if (xter === XTER_WATERFALL) return BEDROCK_SLOPE;
  if (xter >= 0x30) return 0;
  const lo = xter & 0x0f;
  return lo <= BEDROCK_SLOPE ? lo : 0;
}
export const isDecorativeWaterClass = (c: XterClass): boolean => c === XterClass.Surface || c === XterClass.Waterfall || c === XterClass.Stream;
export const xterClass = xterClassOf;

/** 角点线性索引（129×129，x 主序）。 */
export const cornerIndex = (cx: number, cy: number): number => cx * CORNER_SIZE + cy;

/**
 * 地块 (alt, xter) 的 4 角高度 [c00, c10, c01, c11]。bedrock / 瀑布（码 13）按 forBedrock：
 *  'surface' → 全部 alt+1（渲染 / cornerHeights 查询：1 级高台）；'flat' → 全部 alt（构建角点场：不把高台传播给邻居）。
 */
export function cornersOf(alt: number, xter: number, forBedrock: 'surface' | 'flat'): [number, number, number, number] {
  const code = slopeCodeOf(xter);
  if (code === BEDROCK_SLOPE) { const v = forBedrock === 'surface' ? alt + 1 : alt; return [v, v, v, v]; }
  const bits = SLOPE_CORNERS[code]!;
  return [alt + ((bits >> 3) & 1), alt + ((bits >> 2) & 1), alt + ((bits >> 1) & 1), alt + (bits & 1)];
}

export interface TileGeometry { alt: number; slope: number; min: number; max: number }
/** 从角点场读出地块几何；违反 ≤1 级不变量返回 null。全高（不可能出现：bits 相对 min 取）按平地 alt+1 处理。 */
export function tileFromCorners(h: Uint8Array, x: number, y: number): TileGeometry | null {
  const a = h[cornerIndex(x, y)]!, b = h[cornerIndex(x + 1, y)]!, c = h[cornerIndex(x, y + 1)]!, d = h[cornerIndex(x + 1, y + 1)]!;
  const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
  if (hi - lo > 1) return null;
  const bits = ((a - lo) << 3) | ((b - lo) << 2) | ((c - lo) << 1) | (d - lo);
  if (bits === 0b1111) return { alt: lo + 1, slope: 0, min: lo + 1, max: lo + 1 };
  return { alt: lo, slope: CORNERS_TO_SLOPE[bits]!, min: lo, max: hi };
}
/** 浅水形状码：4 个"陆地角"位 → nibble；对角线组合（无对应码）退化为 0（整块水面）。 */
export function shapeFromLandBits(bits: number): number {
  const code = CORNERS_TO_SLOPE[bits & 0x0f]!;
  return code < 0 ? 0 : code;
}
