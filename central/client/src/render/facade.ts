/**
 * 立面网格的顶点布局与风格码。建筑与地标共用 building 材质，所以都按这里的布局写顶点
 * （远景另有 materials/backdrop.ts）。
 *
 * aFacade = (u, v, h, style)：
 * - u：沿墙水平距离（米，含每栋楼的随机起点，令相邻楼窗格错开）；屋顶为世界平面 x（米）
 * - v：离楼底基准的高度（米）；屋顶为世界平面 y（米）
 * - h：楼高（米），用于女儿墙不画窗
 * - style：seed(0–255) + 256 × mode + 小数部分为逐栋随机数
 *
 * aBldg = (f2f, warmth, ground, feature)（写实化一轮新增，逐栋恒定；旧调用方不传时全为 0，shader 用各模式缺省值）：
 * - f2f：层高（米，typology.floorToFloor），0 = 按模式缺省（写字楼 4.0、住宅 2.9……）
 * - warmth：街面主光源冷暖 0–1（lighting.streetWarmth，0 = 白光 LED 区，1 = 钠灯区），定楼底街面反光的颜色
 * - ground：墙脚地面高程（mPD，米）。shader 用 世界高度 − ground 算离街高度（铺面、街面反光、墙脚压暗）
 * - feature：整数位域，见 FEATURE
 *
 * aPhoto = (s, t, page, phase)（R3 真实贴面新增）：
 * - s、t：贴图页里的纹理坐标（0–1，左上为原点，见 facades/layout.ts）；
 * - page：贴图页号（整数），−1 = 这块面没有照片（程序立面）；
 * - phase：楼层线相位（米，楼底起算；照片检测到的真楼层，窗灯按它排），没有时为 0。
 *
 * aHires = (s, t, page, d)（R4 电车走廊高清街面层新增，见 facades/hires-layout.ts）：
 * - s、t：高清页里的纹理坐标（0–1）；page：高清页号，−1 = 没有高清照片；d：这一段的密度（px/m，视差换算用）。
 */
import { simToThree } from '../coords';
import { MeshArrays, type AttrSpec } from './mesh-arrays';

export const FACADE_LAYOUT: readonly AttrSpec[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
  { name: 'aFacade', size: 4 },
  { name: 'aBldg', size: 4 },
  { name: 'aPhoto', size: 4 },
  { name: 'aHires', size: 4 },
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
  // 4 = 旧「远山」模式（M0 的九龙 / 山体远景），远景改用自己的材质后已删除；编号保留不复用
  // 写实化一轮新增（≥ 5，按 typology.TYPOLOGY_ORDER 的顺序；sensitive 沿用 Plain）
  /** 写字楼：4 m 层高、深色窗间墙、按楼层与租户成片亮灯、天花灯具。 */
  Office: 5,
  /** 住宅：2.9 m 层高、小窗按户亮灯、冷暖混合、窗机。 */
  Residential: 6,
  /** 唐楼 / 旧楼：地铺 + 小窗、旧墙面、窗机多。 */
  Tenement: 7,
  /** 裙楼：铺面 + 商场玻璃 / 停车场 / 素墙。 */
  Podium: 8,
  /** 公共建筑：石材、高窗、少灯。 */
  Civic: 9,
  /** 屋顶机房、水箱、楼梯间：深色无窗（住宅偶有暖光小窗）。 */
  Plant: 10,
} as const;
export type FacadeMode = (typeof FacadeMode)[keyof typeof FacadeMode];

/**
 * seed 的位含义（管线随机给 0–255；地标按需精确指定）：
 * bit0–1 灯色（0 暖 … 3 冷），bit2–3 亮灯率档，bit4–5 窗距档，bit6–7 墙色族。
 */
export function styleSeed(tint: number, lit: number, bay: number, body: number): number {
  return (tint & 3) | ((lit & 3) << 2) | ((bay & 3) << 4) | ((body & 3) << 6);
}

/** 逐栋随机数量化成 1/4096 的整数倍：float32 里精确可表示，shader 与 TS 算出的楼键（facadeKey）逐位一致。 */
export const RND_STEPS = 4096;

export function styleCode(seed: number, mode: FacadeMode, rnd: number): number {
  const q = Math.min(Math.max(Math.floor(rnd * RND_STEPS), 0), RND_STEPS - 1) / RND_STEPS;
  return (seed & 255) + 256 * mode + q;
}

/** 楼键（非负整数）：与 building.ts 里 key = seed * 4099 + int(rnd * 4093.0) 相同，windows.ts 的哈希以它为第一参数。 */
export function facadeKey(style: number): number {
  const seed = Math.floor(style) & 255;
  const rnd = style - Math.floor(style);
  return seed * 4099 + Math.floor(Math.fround(rnd * 4093));
}

export function newFacadeArrays(): MeshArrays {
  return new MeshArrays(FACADE_LAYOUT);
}

/** aBldg.w 的位域。 */
export const FEATURE = {
  /** bit 0–2：冠顶泛光色（0 无、1 白、2 金、3 青、4 品红），静态。 */
  crownMask: 7,
  /** bit 3：避难层 / 机电层整层通亮带（≥ 150 m 塔楼）。 */
  refuge: 8,
  /** bit 4：裙楼的商场玻璃（地铺之上整段亮）。 */
  mall: 16,
  /** bit 5：裙楼是停车场（横向开口、冷白光管）。 */
  carPark: 32,
  /** bit 6：幕墙竖梃节点点阵 LED（地标镜面大厦）。 */
  nodeLeds: 64,
  /** bit 7：亮灯率按 19:00 计（约 60 %，地标鋼架大樓：深色钢架衬亮窗）。 */
  litBoost: 128,
  /** bit 8（R4 复审修正）：街面带是连续的亮玻璃墙（名店裙楼），程序铺面不画闸、不分铺。 */
  luxury: 256,
} as const;

/** R4 复审修正：街面带画成连续亮玻璃墙的楼（毕打街口的名店裙楼：照片面因源数据错误排除，程序立面原来是铺 + 闸 + 牙科灯箱）。 */
export const LUXURY_PODIUMS: ReadonlySet<string> = new Set(['3891de5b97']);

/** 逐栋的 aBldg 值（见文件头）。 */
export type BldgAttr = readonly [f2f: number, warmth: number, ground: number, feature: number];

export const NO_BLDG: BldgAttr = [0, 0, 0, 0];

/** 逐顶点 aPhoto 值（见文件头）。 */
export type PhotoAttr = readonly [s: number, t: number, page: number, phase: number];

export const NO_PHOTO: PhotoAttr = [0, 0, -1, 0];

/** 逐顶点 aHires 值（见文件头）。 */
export type HiresVertexAttr = readonly [s: number, t: number, page: number, d: number];

export const NO_HIRES_ATTR: HiresVertexAttr = [0, 0, -1, 0];

const scratch = new Float32Array(22);

/** 写一个立面顶点：位置为模拟坐标（dm），法线为模拟坐标系方向（单位向量）。bldg 省略时为全 0（旧调用方），photo 省略时没有照片。 */
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
  bldg: BldgAttr = NO_BLDG,
  photo: PhotoAttr = NO_PHOTO,
  hires: HiresVertexAttr = NO_HIRES_ATTR,
): number {
  simToThree(x, y, z, scratch, 0);
  simToThree(nx, ny, nz, scratch, 3, 1);
  scratch[6] = u;
  scratch[7] = v;
  scratch[8] = h;
  scratch[9] = style;
  scratch[10] = bldg[0];
  scratch[11] = bldg[1];
  scratch[12] = bldg[2];
  scratch[13] = bldg[3];
  scratch[14] = photo[0];
  scratch[15] = photo[1];
  scratch[16] = photo[2];
  scratch[17] = photo[3];
  scratch[18] = hires[0];
  scratch[19] = hires[1];
  scratch[20] = hires[2];
  scratch[21] = hires[3];
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
