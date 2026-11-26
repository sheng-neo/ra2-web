/**
 * 招牌摆放（纯函数）：
 * - 平贴招牌（B7）：贴在铺面上方的招牌带（离街约 3.5–5.8 m，大小、高低、离墙远近各家不同），与建筑 shader 的铺面单元逐位对齐
 *   （单元宽、单元类型用 windows.ts 的同一个哈希）；只挂在营业的商铺上（不挂大堂、落闸、熄灯铺）。
 *   密度：中环核心约 15 %，上环 / 唐楼一带约 40 %。
 * - 直招牌（B12）：唐楼与上环一带每 7–10 m 一块，核心区每 45 m 一块；0.8–1.2 m 宽、2–6 m 高、离街 4.6–6 m 起，
 *   与墙垂直、伸出街外；正反两片各自单面，字从上到下、正立、不镜像。
 * - R2 STREETLIFE S8：中环 / 上环的横街（支路、街坊路、行人街；威灵顿街、德己立街、摆花街一带，参考照 20、R1-16）
 *   临街铺面一律加密到每 8–12 m 一块直招牌（0.8–1.0 × 2.5–4 m，底边 4–6 m，伸出 0.4–1.4 m），约 8 % 不亮。
 *   临哪条街由 facesStreet 顺手记下（RoadIndex 存道路等级），placeSigns 读取，不改建筑模块的调用。
 * 坐标：模拟坐标「米」（x 东、y 北、z mPD）。四边形四角顺序 BL, BR, TR, TL（从正面看逆时针），
 * uv 为格内坐标（可超出 0–1，shader 夹在格内延续底色）。
 */
import type { Road, RoadClass } from '@central/data';
import type { Typology } from '../typology';
import { INT_OFFSET, hash3 } from '../windows';
import { H_CELL, V_CELL, atlasLayout, styleGain, type AtlasCell, type SignStyle } from './atlas';

/** 道路中线段的网格索引（模拟坐标米，格 50 m），判断墙面是否临街。 */
export class RoadIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly segs: number[] = [];
  /** 各段所属道路等级。 */
  private readonly cls: RoadClass[] = [];
  private static readonly CELL = 50;

  constructor(roads: readonly Pick<Road, 'pts' | 'cls'>[]) {
    for (const r of roads) {
      if (r.cls === 'motorway') continue;
      for (let i = 2; i < r.pts.length; i += 2) {
        const ax = r.pts[i - 2]! / 10;
        const ay = r.pts[i - 1]! / 10;
        const bx = r.pts[i]! / 10;
        const by = r.pts[i + 1]! / 10;
        const k = this.segs.length / 4;
        this.segs.push(ax, ay, bx, by);
        this.cls.push(r.cls);
        const c = RoadIndex.CELL;
        for (let gx = Math.floor(Math.min(ax, bx) / c); gx <= Math.floor(Math.max(ax, bx) / c); gx++) {
          for (let gy = Math.floor(Math.min(ay, by) / c); gy <= Math.floor(Math.max(ay, by) / c); gy++) {
            const key = gx * 65536 + gy;
            const list = this.cells.get(key);
            if (list) list.push(k);
            else this.cells.set(key, [k]);
          }
        }
      }
    }
  }

  /** (x, y) 到最近道路中线的距离（米），超过 maxM 时返回 Infinity。 */
  distance(x: number, y: number, maxM: number): number {
    return this.nearest(x, y, maxM).d;
  }

  /** 最近道路中线的距离（米）与该路等级；超过 maxM 时 d = Infinity、cls = null。 */
  nearest(x: number, y: number, maxM: number): { d: number; cls: RoadClass | null } {
    const c = RoadIndex.CELL;
    let best = Infinity;
    let bestCls: RoadClass | null = null;
    for (let gx = Math.floor((x - maxM) / c); gx <= Math.floor((x + maxM) / c); gx++) {
      for (let gy = Math.floor((y - maxM) / c); gy <= Math.floor((y + maxM) / c); gy++) {
        for (const k of this.cells.get(gx * 65536 + gy) ?? []) {
          const ax = this.segs[k * 4]!;
          const ay = this.segs[k * 4 + 1]!;
          const dx = this.segs[k * 4 + 2]! - ax;
          const dy = this.segs[k * 4 + 3]! - ay;
          const l2 = dx * dx + dy * dy;
          const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1) : 0;
          const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
          if (d < best) {
            best = d;
            bestCls = this.cls[k]!;
          }
        }
      }
    }
    return best <= maxM ? { d: best, cls: bestCls } : { d: Infinity, cls: null };
  }
}

/** 横街（直招牌加密）的道路等级。 */
const SIDE_STREETS: ReadonlySet<RoadClass> = new Set(['tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian']);
/** facesStreet 记下的「这段墙临的是哪种街」。 */
const streetOf = new WeakMap<object, RoadClass>();

/** 墙面临的是中环 / 上环的横街（直招牌每 8–12 m 一块）：西至上环、东至毕打街一带，平地（墙脚 < 60 mPD）。 */
export function sideStreetSpan(span: Pick<FrontageSpan, 'x0' | 'groundM'>, cls: RoadClass | null | undefined): boolean {
  return !!cls && SIDE_STREETS.has(cls) && span.x0 > -450 && span.x0 < 420 && span.groundM < 60;
}

/** 墙面是否临街：墙外 6 m 处离道路中线 ≤ 14 m（含路半宽与行人路）。 */
export function facesStreet(span: Pick<FrontageSpan, 'x0' | 'y0' | 'x1' | 'y1' | 'nx' | 'ny'>, roads: RoadIndex): boolean {
  const mx = (span.x0 + span.x1) / 2 + span.nx * 6;
  const my = (span.y0 + span.y1) / 2 + span.ny * 6;
  const hit = roads.nearest(mx, my, 14);
  if (hit.cls) streetOf.set(span, hit.cls);
  return hit.d <= 14;
}

/** 平贴招牌密度：上环 / 中环西段约 60 %，往东到皇后像广场一带降到约 25 %（只算营业的商铺单元）。 */
export function signDensity(x: number, typology: Typology): number {
  const t = Math.min(Math.max((x - 200) / 350, 0), 1);
  const s = t * t * (3 - 2 * t);
  return 0.6 - 0.35 * s + (typology === 'tenement' ? 0.1 : 0) - (typology === 'office' ? 0.05 : 0);
}

/** 直招牌：唐楼与上环平地住宅（x < 150 m）才有，平地上（墙脚 < 35 mPD）。 */
export function wantsVerticalSigns(span: Pick<FrontageSpan, 'typology' | 'groundM' | 'x0'>): boolean {
  if (span.groundM >= 35) return false;
  return span.typology === 'tenement' || (span.x0 < 150 && (span.typology === 'residential' || span.typology === 'podium'));
}

/** 一段临街墙面（建筑 onSpan 收集）：起止点（米）、立面 u 起点、外法线。 */
export interface FrontageSpan {
  key: number;
  typology: Typology;
  /** 中环商业核心权重 0–1。 */
  core: number;
  /** 墙脚地面（mPD，米）。 */
  groundM: number;
  /** 楼顶（mPD，米）。 */
  topM: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 起点的立面 u（米），与 shader 的 u 相同。 */
  u0: number;
  nx: number;
  ny: number;
}

export type P3 = [number, number, number];

export interface SignQuad {
  corners: [P3, P3, P3, P3];
  uv: [[number, number], [number, number], [number, number], [number, number]];
  cell: number;
  gain: number;
  /** 期望的正面朝向（测试用）。 */
  facing: [number, number, number];
}

/** 与 building.ts 铺面一致的常量。 */
export const SHOP_TOP_M = 4.6;
export const SIGN_BOTTOM_M = 3.8;
export const SIGN_TOP_M = 4.75;

/** 铺面单元宽（米）：与 shader 的 unitW 相同。 */
export function shopUnitWidth(key: number): number {
  return 4.5 + 3.5 * hash3(key, 52, 0);
}

export type ShopKind = 'shop' | 'lobby' | 'shutter' | 'dark';

/** 铺面单元类型：与 shader 的 kind 相同（写字楼 30 % 大堂）。unit 为 floor(u / 单元宽)。 */
export function shopUnitKind(key: number, unit: number, typology: Typology): ShopKind {
  const r = hash3(key, unit + INT_OFFSET, 53);
  if (typology === 'office') return r < 0.3 ? 'lobby' : r < 0.88 ? 'shop' : 'shutter';
  return r < 0.2 ? 'shutter' : r < 0.27 ? 'dark' : 'shop';
}

/** 有铺面（shader 画铺面）的类型。 */
export function hasShopfront(t: Typology): boolean {
  return t === 'office' || t === 'residential' || t === 'tenement' || t === 'podium';
}

const CORE_STYLES: readonly SignStyle[] = ['boxRed', 'boxBlack', 'boxYellow', 'ledBlue', 'boxCrimson', 'boxNavy'];

/** 按样式过滤的格子序号表。 */
function cellsBy(cells: readonly AtlasCell[], vertical: boolean, styles?: readonly SignStyle[]): number[] {
  const out: number[] = [];
  cells.forEach((c, i) => {
    if (c.vertical === vertical && (!styles || styles.includes(c.style))) out.push(i);
  });
  return out;
}

/** 四边形的格内 uv：格子按宽高比放进四边形、居中，较长的一边延伸（夹到格边）。 */
function quadUv(widthM: number, heightM: number, cellAspect: number): SignQuad['uv'] {
  const k = Math.min(heightM, widthM / cellAspect);
  const du = widthM / (2 * cellAspect * k);
  const dt = heightM / (2 * k);
  return [
    [0.5 - du, 0.5 - dt],
    [0.5 + du, 0.5 - dt],
    [0.5 + du, 0.5 + dt],
    [0.5 - du, 0.5 + dt],
  ];
}

/** 一段墙面上的全部招牌。vertical = false 时不出直招牌（LOW 档省三角形）。 */
export function placeSigns(span: FrontageSpan, cells: readonly AtlasCell[] = atlasLayout(), vertical = true): SignQuad[] {
  if (!hasShopfront(span.typology)) return [];
  const out: SignQuad[] = [];
  const dx = span.x1 - span.x0;
  const dy = span.y1 - span.y0;
  const len = Math.hypot(dx, dy);
  if (len < 4) return out;
  const ex = dx / len;
  const ey = dy / len;
  const at = (s: number, off: number, z: number): P3 => [span.x0 + ex * s + span.nx * off, span.y0 + ey * s + span.ny * off, z];
  const key = span.key;

  // 平贴招牌
  const unitW = shopUnitWidth(key);
  const pSign = signDensity((span.x0 + span.x1) / 2, span.typology);
  const hCells = cellsBy(cells, false, span.core > 0.6 ? CORE_STYLES : undefined);
  // 与墙面块相交的每个单元；招牌裁到墙面块内（窄楼临街面常比一个单元短）
  const first = Math.floor(span.u0 / unitW);
  const last = Math.floor((span.u0 + len) / unitW);
  // 相邻三间铺不重复同一个字（照片 16：一条街上招牌字各不相同）
  const recent: string[] = [];
  for (let unit = first; unit <= last; unit++) {
    if (shopUnitKind(key, unit, span.typology) !== 'shop') continue;
    if (hash3(key, unit + INT_OFFSET, 58) >= pSign) continue;
    const hu = (salt: number) => hash3(key, unit + INT_OFFSET, 140 + salt);
    // 大小 0.7–1.5 倍、上下错开 −0.3…+0.6 m、离墙 6–40 cm（招牌各家各做，不是一排整齐的灯箱）
    const scale = 0.7 + 0.8 * hu(0) * hu(0);
    const inset = 0.45 + (1 - Math.min(scale, 1)) * 0.8 * hu(1);
    const s0 = Math.max(unit * unitW, span.u0) - span.u0 + inset;
    const s1 = Math.min((unit + 1) * unitW, span.u0 + len) - span.u0 - inset;
    if (s1 - s0 < 2.2) continue;
    const z0 = span.groundM + SIGN_BOTTOM_M - 0.3 + 0.9 * hu(2);
    const z1 = z0 + (SIGN_TOP_M - SIGN_BOTTOM_M) * scale;
    const off = 0.06 + 0.34 * hu(3);
    let ci = Math.floor(hash3(key, unit + INT_OFFSET, 59) * hCells.length);
    for (let k = 0; k < hCells.length && recent.includes(cells[hCells[ci]!]!.word); k++) ci = (ci + 1) % hCells.length;
    const cell = hCells[ci]!;
    recent.push(cells[cell]!.word);
    if (recent.length > 2) recent.shift();
    out.push({
      corners: [at(s0, off, z0), at(s1, off, z0), at(s1, off, z1), at(s0, off, z1)],
      uv: quadUv(s1 - s0, z1 - z0, H_CELL.w / H_CELL.h),
      cell,
      gain: styleGain(cells[cell]!.style),
      facing: [span.nx, span.ny, 0],
    });
  }

  // 直招牌：唐楼 / 上环一带每 7–10 m 一块，核心区（中环西段的唐楼）每 45 m 一块；
  // 横街（R2 S8）一律每 8–12 m 一块，较矮（2.5–4 m）、底边 4–6 m，约 8 % 不亮
  const side = sideStreetSpan(span, streetOf.get(span));
  const pitch = side ? 8 + 4 * hash3(key, 7, 133) : 8 + 37 * span.core;
  const vCells = cellsBy(cells, true);
  const maxH = span.topM - span.groundM - 6;
  if (vertical && maxH >= 2 && (wantsVerticalSigns(span) || side)) {
    const firstV = Math.ceil((span.u0 + 1) / pitch);
    const lastV = Math.floor((span.u0 + len - 1) / pitch);
    for (let i = firstV; i <= lastV; i++) {
      const h = (salt: number) => hash3(key, i + INT_OFFSET, 120 + salt);
      if (h(0) > 0.8) continue;
      const s = i * pitch - span.u0 + (h(1) - 0.5) * 2;
      if (s < 0.6 || s > len - 0.6) continue;
      const w = side ? 0.8 + 0.2 * h(2) : 0.8 + 0.4 * h(2);
      const height = Math.min(side ? 2.5 + 1.5 * h(3) : 2 + 4 * h(3), maxH);
      const z0 = span.groundM + (side ? 4 + 2 * h(4) : 4.6 + 1.4 * h(4));
      const z1 = z0 + height;
      const inner = side ? 0.4 : 0.3;
      const outer = inner + w;
      // 同一栋楼的直招牌字不重复（R2 修复轮）：按楼哈希一个起点，沿墙顺序取，直到 16 格轮完
      const nV = vCells.length;
      const cell = vCells[(((Math.floor(hash3(key, 5, 134) * nV) + i) % nV) + nV) % nV]!;
      const uv = quadUv(w, height, V_CELL.w / V_CELL.h);
      const gain = side && h(6) < 0.08 ? 0.02 : styleGain(cells[cell]!.style);
      const sep = 0.03;
      // 正面朝 +e：读字方向 Z × e = −n（指向墙），所以左边在外端
      out.push({
        corners: [at(s + sep, outer, z0), at(s + sep, inner, z0), at(s + sep, inner, z1), at(s + sep, outer, z1)],
        uv,
        cell,
        gain,
        facing: [ex, ey, 0],
      });
      // 背面朝 −e：读字方向 = n（离墙），左边在内端
      out.push({
        corners: [at(s - sep, inner, z0), at(s - sep, outer, z0), at(s - sep, outer, z1), at(s - sep, inner, z1)],
        uv,
        cell,
        gain,
        facing: [-ex, -ey, 0],
      });
    }
  }
  return out;
}
