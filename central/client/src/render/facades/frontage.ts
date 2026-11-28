/**
 * 接口 I-1（R4 整合）：电车走廊高清街面层的铺面夜间光源 → 路面铺面溢光（render/streets/frontage-field.ts）。
 *
 * - 铺位来自 Building.hires.b（fetch/landsd_3d_hires_bays.py 从已打包的街面页读出的逐铺开口，面键与高清段相同）；
 *   亮不亮、色温、亮度与建筑着色器 hiresNight 逐位相同：h1/h2/h3 = hash3(楼 key, 7000 + 种子, 71/72/73)，
 *   亮 ⇔ h1 < shopLitTarget(钟点, x)（复审修正：按路段，20:00 上环 0.65 / 中环西 0.45 / 中环东 0.30 / 金钟道 0.6，20:30 起渐渐收铺）；
 *   所以路面光斑正好落在照片里亮着的那几间铺门前，
 *   落闸的铺门前没有光斑。
 * - 雨篷（Building.hires.c，先按 canopy-fit.ts 让开街上的杆、候车亭、电车与天桥）底下另出一条「只有雨篷灯」的光源
 *   （canopyLights：强度 0、整夜亮，雨篷筒灯与 canopies.ts 相同整夜不关），路面在雨篷下有一条亮带。
 * - 没有高清街面的墙仍由 STREET 的占位生成器（streets/frontage-stub.ts，今天的程序铺位）出光；有高清街面的墙上的占位光源
 *   用 dropOnHiresFaces 去掉（与 signs 的 hasHiresStreet 同一判断：底座外环这面墙有街面段）。
 * - 敏感区与地标：高清层本来就没有它们（管线与烘焙都已排除），溢光场再按 3 m 规则过滤一次。
 * 坐标：模拟坐标米（x 东、y 北、z mPD）；环坐标为 dm。
 */
import type { FlatXY } from '@central/data';
import { facadeKey } from '../facade';
import { lightColour } from '../materials/lighting';
import { hash3 } from '../windows';
import { canopyThicknessDm, type CanopyItem } from './canopies';
import { hiresFaceKey, type BuildingHiresPlan } from './hires-layout';

/** 一段临街铺面的夜间光源（模拟坐标，米）。与 streets/frontage-stub.ts 的同名接口逐字段相同（结构类型）。 */
export interface FrontageLight {
  x0: number;
  y0: number;
  x1: number;
  y1: number; // 墙脚线段（铺面玻璃线，沿墙外法线朝外）
  z: number; // 地面高程（mPD）
  nx: number;
  ny: number; // 墙外法线（单位向量）
  top: number; // 亮面顶离地（m），一般 2.6–4.5
  color: [number, number, number]; // 线性 RGB，亮度已归一（max = 1）
  intensity: number; // 20:00 时玻璃面亮度 Y（0 = 关门 / 卷闸）
  closeHour?: number; // 关门时刻（模拟时钟 18–26），之后 intensity → 卷闸 / 室内留灯的值
  canopy?: { under: number; depth: number; soffitY: number }; // 雨篷底离地、深度（m）、雨篷底亮度
}

/** frontageLights 读的楼宇字段（BuildingPlan 的结构子集）。 */
export interface FrontagePlan {
  p: { rings: FlatXY[]; parts: readonly { index: number; rings: FlatXY[] }[] | null; b: { parts?: readonly unknown[] } };
  style: number;
  hires: Pick<BuildingHiresPlan, 'faces' | 'bays'> | null;
  /** 墙脚地面（mPD，米）。 */
  groundM: number;
}

/** 雨篷底亮度（规格 H-P0-5：lit soffit Y 0.25–0.31）。 */
export const CANOPY_SOFFIT_Y = 0.27;
/** 亮铺玻璃面亮度（tone map 后 Y，规格 H-P0-2：0.30–0.50），按 h3 在区间里取。 */
export const SHOP_Y_MIN = 0.3;
export const SHOP_Y_MAX = 0.5;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 与着色器 shopLitBase 相同（复审修正，route-facts §2）：20:00 的亮铺比例按路段——上环 0.65、中环西 0.45、中环东 0.30、金钟道 0.6。x = 模拟米（东）。 */
export function shopLitBase(x: number): number {
  let t = 0.65 + (0.45 - 0.65) * smooth(0, 60, x);
  t += (0.3 - t) * smooth(290, 350, x);
  return t + (0.6 - t) * smooth(660, 720, x);
}

/** 与着色器 shopLitTarget 相同：钟点（18–26，< 12 当次日）、位置 x 时「亮着」的门槛（随钟点单调下降）。 */
export function shopLitTarget(clock: number, x: number): number {
  const t = clock < 12 ? clock + 24 : clock;
  return shopLitBase(x) * (1 + (0.2 - 1) * smooth(20.5, 24.5, t)) + 0.08 * (1 - smooth(18.5, 20, t));
}

/** h1 对应的关门时刻（18–26 点里二分 shopLitTarget 的反函数）：18:00 就不亮的返回 null，到 26:00 仍亮的返回 undefined。 */
export function shopCloseHour(h1: number, x: number): number | null | undefined {
  if (h1 >= shopLitTarget(18, x)) return null;
  if (h1 < shopLitTarget(26, x)) return undefined;
  let a = 18;
  let b = 26;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (h1 < shopLitTarget(m, x)) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

function norm(c: { r: number; g: number; b: number }): [number, number, number] {
  const m = Math.max(c.r, c.g, c.b, 1e-6);
  return [c.r / m, c.g / m, c.b / m];
}

let palette: { shop: [number, number, number]; neutral: [number, number, number]; cool: [number, number, number] } | null = null;
/** 与着色器 uShop / uOfficeN / mix(uOfficeC, uTube, 0.5) 同源的三种铺内色（线性，max = 1）。 */
function shopPalette() {
  if (!palette) {
    const t = lightColour('tubeCool');
    const c = lightColour('officeCool');
    palette = {
      shop: norm(lightColour('shopWarm')),
      neutral: norm(lightColour('officeNeutral')),
      cool: norm({ r: (c.r + t.r) / 2, g: (c.g + t.g) / 2, b: (c.b + t.b) / 2 }),
    };
  }
  return palette;
}

/** 这栋楼第 part 块第 ring 个环（dm）；高清层没画的块（LOW 档把分层楼画成平顶）返回 null。 */
function ringOf(pl: FrontagePlan, part: number, ring: number): FlatXY | null {
  if (pl.p.parts) return pl.p.parts.find((x) => x.index === part)?.rings[ring] ?? null;
  if (part !== 0 || pl.p.b.parts?.length) return null;
  return pl.p.rings[ring] ?? null;
}

/** 墙边 → (起点, 单位方向, 长度 m, 外法线)，与 extrude.ts 相同（外法线 = (dy, −dx)）。 */
function edgeOf(ring: FlatXY, edge: number): { ax: number; ay: number; dx: number; dy: number; len: number } | null {
  const n = ring.length >> 1;
  if (edge < 0 || edge >= n) return null;
  const j = (edge + 1) % n;
  const ax = ring[edge * 2]! / 10;
  const ay = ring[edge * 2 + 1]! / 10;
  const bx = ring[j * 2]! / 10;
  const by = ring[j * 2 + 1]! / 10;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 0.1) return null;
  return { ax, ay, dx: (bx - ax) / len, dy: (by - ay) / len, len };
}

/**
 * 高清街面层的铺面光源（纯函数，确定性；LOW 档 plans 没有高清层时为空）：每个亮得起来的铺位一条（整夜落闸的铺不出）。
 */
export function frontageLights(plans: readonly FrontagePlan[]): FrontageLight[] {
  const out: FrontageLight[] = [];
  const pal = shopPalette();
  for (const pl of plans) {
    const hi = pl.hires;
    if (!hi || !hi.bays.length) continue;
    const key = facadeKey(pl.style);
    for (const b of hi.bays) {
      if (b.length !== 9) continue;
      const [part, ring, edge, s0c, s1c, seed, zt] = b as [number, number, number, number, number, number, number];
      const r = ringOf(pl, part, ring);
      const e = r ? edgeOf(r, edge) : null;
      if (!e) continue;
      // 着色器只在有高清段的面上画这间铺（没有段的面照旧程序铺面，由占位生成器出光）
      if (!hi.faces.get(hiresFaceKey(part, ring, edge))?.some((s) => s.kind === 0)) continue;
      const s0 = Math.max(0, s0c / 100);
      const s1 = Math.min(e.len, s1c / 100);
      if (s1 - s0 < 0.5) continue;
      const h1 = hash3(key, 7000 + seed, 71);
      // 着色器按片元的世界 x 取门槛（路段之间 60 m 渐变）；这里取铺位中点
      const close = shopCloseHour(h1, e.ax + (e.dx * (s0 + s1)) / 2);
      if (close === null) continue; // 整夜落闸：门前没有光斑
      const h2 = hash3(key, 7000 + seed, 72);
      const h3 = hash3(key, 7000 + seed, 73);
      out.push({
        x0: e.ax + e.dx * s0,
        y0: e.ay + e.dy * s0,
        x1: e.ax + e.dx * s1,
        y1: e.ay + e.dy * s1,
        z: pl.groundM,
        nx: e.dy,
        ny: -e.dx,
        top: Math.min(Math.max(zt / 10 - pl.groundM, 2.6), 4.5),
        color: h2 < 0.4 ? pal.cool : h2 < 0.7 ? pal.neutral : pal.shop,
        intensity: SHOP_Y_MIN + (SHOP_Y_MAX - SHOP_Y_MIN) * h3,
        ...(close !== undefined ? { closeHour: close } : {}),
      });
    }
  }
  return out;
}

/**
 * 雨篷底的亮带（雨篷筒灯整夜亮，与 canopies.ts 相同）：每块（已让开街上障碍的，见 canopy-fit.ts）一条强度 0、只有雨篷灯的光源，
 * 沿雨篷贴墙的一边，外法线 = 这条边的右手侧。雨篷底离地按楼的墙脚地面算（没有时按 4 m）。
 */
export function canopyLights(items: readonly Pick<CanopyItem, 'rec' | 'groundM'>[]): FrontageLight[] {
  const out: FrontageLight[] = [];
  const shop = shopPalette().shop;
  for (const it of items) {
    const r = it.rec;
    if (r.length !== 10) continue;
    const [x0, y0, x1, y1, depth, zTop, th] = r as [number, number, number, number, number, number, number];
    const L = Math.hypot(x1 - x0, y1 - y0) / 10;
    if (L < 0.5 || depth <= 0) continue;
    const zb = (zTop - canopyThicknessDm(th)) / 10;
    out.push({
      x0: x0 / 10,
      y0: y0 / 10,
      x1: x1 / 10,
      y1: y1 / 10,
      z: it.groundM ?? zb - 4,
      nx: (y1 - y0) / 10 / L,
      ny: -(x1 - x0) / 10 / L,
      top: 0,
      color: shop,
      intensity: 0,
      canopy: { under: it.groundM === undefined ? 4 : zb - it.groundM, depth: depth / 10, soffitY: CANOPY_SOFFIT_Y },
    });
  }
  return out;
}

/** 有高清街面段的墙（模拟米）：[ax, ay, bx, by]，用来去掉这些墙上的占位光源。 */
export function hiresStreetWalls(plans: readonly FrontagePlan[]): number[][] {
  const out: number[][] = [];
  for (const pl of plans) {
    const hi = pl.hires;
    if (!hi) continue;
    for (const [fk, secs] of hi.faces) {
      if (!secs.some((s) => s.kind === 0 && s.pieces.length > 0)) continue;
      const edge = fk % 65536;
      const pr = Math.floor(fk / 65536);
      const r = ringOf(pl, Math.floor(pr / 64), pr % 64);
      const e = r ? edgeOf(r, edge) : null;
      if (e) out.push([e.ax, e.ay, e.ax + e.dx * e.len, e.ay + e.dy * e.len]);
    }
  }
  return out;
}

/**
 * 去掉落在有高清街面段的墙上的占位光源（STREET 的 stubFrontageLights 按整栋外环出光，不知道哪面墙换成了照片铺面）：
 * 光源中点离这样一面墙 ≤ 1.2 m（在墙的范围内）且方向平行（夹角 < 15°）就去掉。
 */
export function dropOnHiresFaces<T extends Pick<FrontageLight, 'x0' | 'y0' | 'x1' | 'y1'>>(lights: readonly T[], walls: readonly number[][]): T[] {
  if (!walls.length) return [...lights];
  const CELL = 16;
  const grid = new Map<string, number[]>();
  walls.forEach(([ax, ay, bx, by], i) => {
    const x0 = Math.floor((Math.min(ax!, bx!) - 1.5) / CELL);
    const x1 = Math.floor((Math.max(ax!, bx!) + 1.5) / CELL);
    const y0 = Math.floor((Math.min(ay!, by!) - 1.5) / CELL);
    const y1 = Math.floor((Math.max(ay!, by!) + 1.5) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) (grid.get(`${x},${y}`) ?? grid.set(`${x},${y}`, []).get(`${x},${y}`)!).push(i);
  });
  return lights.filter((l) => {
    const mx = (l.x0 + l.x1) / 2;
    const my = (l.y0 + l.y1) / 2;
    const L = Math.hypot(l.x1 - l.x0, l.y1 - l.y0) || 1;
    const lx = (l.x1 - l.x0) / L;
    const ly = (l.y1 - l.y0) / L;
    for (const i of grid.get(`${Math.floor(mx / CELL)},${Math.floor(my / CELL)}`) ?? []) {
      const [ax, ay, bx, by] = walls[i]!;
      const W = Math.hypot(bx! - ax!, by! - ay!);
      if (W < 0.1) continue;
      const tx = (bx! - ax!) / W;
      const ty = (by! - ay!) / W;
      if (Math.abs(lx * tx + ly * ty) < Math.cos((15 * Math.PI) / 180)) continue;
      const along = (mx - ax!) * tx + (my - ay!) * ty;
      const off = Math.abs((mx - ax!) * ty - (my - ay!) * tx);
      if (along >= -0.5 && along <= W + 0.5 && off <= 1.2) return false;
    }
    return true;
  });
}
