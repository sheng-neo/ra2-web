/**
 * 临街铺面夜间光源（R4 STREET，接口 I-1 的本地副本 + 占位生成器）。
 *
 * - FrontageLight 与 HIRES 包 render/facades/frontage.ts 的同名接口逐字段相同（结构类型，整合时可直接互换）；
 * - stubFrontageLights：在 HIRES 的真实铺面清单接上之前，按今天程序铺面带（materials/building.ts 的 shopfront()）
 *   同一套铺位划分与类型（signs/placement.ts 的 shopUnitWidth / shopUnitKind，与着色器逐位一致）给出每个亮着的铺位；
 *   只读用现有数据，不改建筑模块。整合时 city-renderer.ts 的一行（标 // [r4:street]）换成 HIRES 的 frontageLights()；
 *   没有照片的楼仍可用本函数补上（skip 参数跳过有照片的楼）。
 * - 敏感区（及 3 m 内）、地标（已从 buildings 删除）不出光源；只取临街（墙外 6 m 离道路中线 ≤ 14 m 且法线朝路）的外环墙。
 * 坐标：模拟坐标米（x 东、y 北、z mPD）。
 */
import type { FlatXY, Road } from '@central/data';
import { facadeKey } from '../facade';
import { RoadIndex, hasShopfront, shopUnitKind, shopUnitWidth } from '../signs/placement';
import type { Typology } from '../typology';
import { INT_OFFSET, hash3 } from '../windows';

/** 一段临街铺面的夜间光源（模拟坐标，米）。 */
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

/** 占位生成器读的楼宇字段（BuildingPlan 的结构子集）。 */
export interface StubBuilding {
  p: { b: { id: string }; ring: { outer: FlatXY } };
  typology: Typology;
  style: number;
  /** 墙脚地面（mPD，米）。 */
  groundM: number;
  /** 楼顶离地（米）。 */
  tallM: number;
}

export interface StubOptions {
  /** 跳过的楼（例如已有 HIRES 真实铺面清单的楼）。 */
  skip?: (id: string) => boolean;
}

/** 判断「临街」用的道路等级（车行道与行人街）。 */
const STREET_CLASSES: ReadonlySet<string> = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'pedestrian', 'living_street', 'unknown']);

/** 离敏感区至少这么远（米）才出光源（与 R3「3 m 内的楼一律程序立面」同一规则）。 */
export const ZONE_CLEAR_M = 3;

/** 铺面颜色（与建筑着色器 uShop / uTube 同源：shopWarm #ffd3a1、tubeCool #e8f0f0、officeNeutral #fff0dc 的线性值，max = 1）。 */
const SHOP_WARM: [number, number, number] = [1, 0.651, 0.356];
const TUBE_COOL: [number, number, number] = [0.926, 1, 1];
const OFFICE_N: [number, number, number] = [1, 0.871, 0.716];

function norm(c: readonly [number, number, number]): [number, number, number] {
  const m = Math.max(c[0], c[1], c[2], 1e-6);
  return [c[0] / m, c[1] / m, c[2] / m];
}

const mixC = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
  norm([a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]);

/**
 * 外环墙段是否临街：墙外 6 m 处离道路中线 ≤ 14 m，且法线朝路（墙外 6 m 比墙脚离路近 ≥ 2 m；
 * 垂直于街道的山墙 / 界墙不算，否则光斑会照进邻楼背后）。
 */
export function wallFacesRoad(x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, roads: RoadIndex): boolean {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const out = roads.distance(mx + nx * 6, my + ny * 6, 14);
  if (!(out <= 14)) return false;
  const at = roads.distance(mx + nx * 0.5, my + ny * 0.5, 40);
  return at - out >= 2;
}

/** 光源的关门时刻（占位）：商铺 20:30–23:00 之间（逐铺确定性），大堂 / 银行灯箱整夜亮（26）。 */
function closeHourOf(kind: 'shop' | 'lobby', key: number, unit: number): number {
  return kind === 'lobby' ? 26 : 20.5 + 2.5 * hash3(key, unit, 57);
}

/**
 * 按今天的程序铺面单元给出亮着的铺位光源（纯函数，确定性）。
 * roads：道路（判断临街）。敏感区（区内与 3 m 内）的光源由 FrontageField 统一丢掉（HIRES 的清单也一样过滤），这里不重复。
 */
export function stubFrontageLights(
  plans: readonly StubBuilding[],
  roads: readonly Pick<Road, 'pts' | 'cls'>[],
  opts: StubOptions = {},
): FrontageLight[] {
  // 只认车行道与行人街：人行道（footway）、台阶、小径的中线就贴着铺面，会把「法线朝路」的判断带偏
  const index = new RoadIndex(roads.filter((r) => STREET_CLASSES.has(r.cls)));
  const out: FrontageLight[] = [];
  for (const pl of plans) {
    if (!hasShopfront(pl.typology) || pl.tallM <= 3.5) continue;
    if (opts.skip?.(pl.p.b.id)) continue;
    const key = facadeKey(pl.style);
    const W = shopUnitWidth(key);
    const ring = pl.p.ring.outer;
    const n = ring.length >> 1;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = ring[i * 2]! / 10;
      const ay = ring[i * 2 + 1]! / 10;
      const bx = ring[j * 2]! / 10;
      const by = ring[j * 2 + 1]! / 10;
      const len = Math.hypot(bx - ax, by - ay);
      const u0 = u;
      u += len;
      if (len < 4) continue;
      const dx = (bx - ax) / len;
      const dy = (by - ay) / len;
      // 外环 CCW：外法线 = (dy, −dx)（与 extrude.ts 相同）
      const nx = dy;
      const ny = -dx;
      if (!wallFacesRoad(ax, ay, bx, by, nx, ny, index)) continue;
      const first = Math.floor(u0 / W);
      const last = Math.floor((u0 + len) / W);
      for (let unit = first; unit <= last; unit++) {
        // 单元边上 0.25 m 是柱（与着色器 pier 相同），玻璃在柱之间
        const s0 = Math.max(unit * W + 0.25, u0) - u0;
        const s1 = Math.min((unit + 1) * W - 0.25, u0 + len) - u0;
        if (s1 - s0 < 1.0) continue;
        const kind = shopUnitKind(key, unit, pl.typology);
        if (kind !== 'shop' && kind !== 'lobby') continue;
        const ui = unit + INT_OFFSET;
        let B = 0.35 + 0.65 * hash3(key, ui, 54);
        if (hash3(key, ui, 61) < 0.3) B *= 0.5;
        const tintH = hash3(key, ui, 56);
        const color = kind === 'lobby' ? mixC(TUBE_COOL, OFFICE_N, 0.5) : tintH < 0.38 ? mixC(SHOP_WARM, TUBE_COOL, 0.8) : tintH < 0.46 ? norm([SHOP_WARM[0] * 1.1, SHOP_WARM[1] * 0.85, SHOP_WARM[2] * 0.8]) : SHOP_WARM;
        const intensity = kind === 'lobby' ? 0.4 : Math.min(Math.max(0.6 * B, 0.12), 0.5);
        out.push({
          x0: ax + dx * s0,
          y0: ay + dy * s0,
          x1: ax + dx * s1,
          y1: ay + dy * s1,
          z: pl.groundM,
          nx,
          ny,
          top: kind === 'lobby' ? 4.1 : 3.3,
          color,
          intensity,
          closeHour: closeHourOf(kind, key, ui),
        });
      }
    }
  }
  return out;
}

/** 时钟 clock（18–26）时光源玻璃面的亮度：过了关门时刻按 5 % 留灯（货架灯 / 闸后夜灯）。 */
export function frontageIntensityAt(l: Pick<FrontageLight, 'intensity' | 'closeHour'>, clock: number): number {
  if (l.closeHour === undefined || clock < l.closeHour) return l.intensity;
  return l.intensity * 0.05;
}
