/**
 * 建筑类型（立面族）分类：纯函数，不依赖 three。
 *
 * 依据（写实化规格 B2，阈值用地政总署 Storeys 校准）：
 * - 层高 f2f = 楼高 ÷ 地上层数。写字楼约 3.6–4.5 m（中环核心的老写字楼 3.3–3.5 m），住宅 2.75–3.2 m；
 * - 半山（楼底 ≥ 35 mPD）几乎全是住宅：除非层高 ≥ 4.4 m 且占地大，一律住宅（含低矮的独立屋）；
 * - 平地上不到 30 m、层高不高的楼是唐楼 / 旧楼（地铺 + 小窗）；
 * - 裙楼（kind podium）单独一类：铺面 + 商场玻璃；敏感区一律 sensitive（只做背景，素灰石材、无灯）。
 * 坐标：x 东、y 北，模拟坐标「米」（相对 central.json meta.origin），与 streetWarmth 相同。
 */
import type { Building, BuildingKind } from '@central/data';
import { ringCentroid, signedArea } from '../geom/ring';

export type Typology = 'office' | 'residential' | 'tenement' | 'podium' | 'civic' | 'sensitive';

/** shader 里的类型编号（立面模式 FacadeMode 从 5 起依次排）。 */
export const TYPOLOGY_ORDER: readonly Typology[] = ['office', 'residential', 'tenement', 'podium', 'civic', 'sensitive'];

export interface TypologyInput {
  kind: BuildingKind;
  /** 楼高（米，楼顶 − 楼底）。 */
  heightM: number;
  /** 地上层数（Building.storeys），未知为 undefined。 */
  storeys?: number;
  /** 占地面积（m²）。 */
  areaM2: number;
  /** 楼底高程（mPD，米）。 */
  baseM: number;
  /** 质心（模拟坐标，米）。 */
  x: number;
  y: number;
  /** 质心是否在敏感区内。 */
  sensitive: boolean;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * 中环 / 金钟商业核心的权重 0–1（平地上的写字楼区）：西到上环永和街一线（x ≈ −150 m）、东到金钟以东（x ≈ 1300 m），
 * 南到半山脚（y ≈ −750 m）。楼底高程另由 classify 处理（半山不算核心）。
 */
export function coreWeight(x: number, y: number): number {
  return smooth(-300, -100, x) * (1 - smooth(1250, 1500, x)) * smooth(-850, -650, y);
}

/**
 * 由数据里的 Building 组出分类输入。baseDm：实际楼底（dm，数据 base 为 0 时客户端用地形采样）；
 * sensitive：质心是否在敏感区内（buildings.inSensitive）。
 */
export function typologyInput(b: Building, baseDm: number, sensitive: boolean): TypologyInput {
  const [cx, cy] = ringCentroid(b.footprint.outer);
  return {
    kind: b.kind,
    heightM: b.height / 10,
    storeys: b.storeys,
    areaM2: Math.abs(signedArea(b.footprint.outer)) / 100,
    baseM: baseDm / 10,
    x: cx / 10,
    y: cy / 10,
    sensitive,
  };
}

/** 半山楼底门槛（mPD）：楼底不低于此即按山上住宅区处理。 */
export const HILL_BASE_M = 35;

/** 地上层数推出的层高（米）；没有层数或数据离谱（< 2 m 或 > 12 m）时为 null。 */
export function rawFloorToFloor(heightM: number, storeys: number | undefined): number | null {
  if (storeys === undefined || storeys <= 0) return null;
  const f = heightM / storeys;
  return f >= 2 && f <= 12 ? f : null;
}

export function classify(b: TypologyInput): Typology {
  if (b.sensitive) return 'sensitive';
  if (b.kind === 'civic' || b.kind === 'industrial') return 'civic';
  if (b.kind === 'house') return 'residential';
  if (b.kind === 'podium') return 'podium';
  // 临时构筑物、小亭：当作低矮铺面
  if (b.kind === 'other') return b.baseM >= HILL_BASE_M ? 'residential' : 'podium';
  const f = rawFloorToFloor(b.heightM, b.storeys);
  if (b.baseM >= HILL_BASE_M) {
    // 半山：豪宅层高常到 3.5–4 m，不能拿层高判写字楼；只有又大又高层高的才算（会所、学校、写字楼）
    if (f !== null && f >= 4.4 && b.areaM2 >= 900 && b.heightM >= 20) return 'office';
    return 'residential';
  }
  const core = coreWeight(b.x, b.y);
  // 核心区门槛 3.25 m（老写字楼层高偏低），外围 3.6 m
  const officeF2F = 3.6 - 0.35 * core;
  if (f !== null) {
    if (f >= officeF2F && b.heightM >= 12) return 'office';
    if (b.heightM >= 30) return 'residential';
    return f >= 3.9 && b.areaM2 >= 600 ? 'office' : 'tenement';
  }
  // 没有层数：大而高的平地楼按写字楼；核心区里中高楼也按写字楼
  if (b.heightM >= 40 && (b.areaM2 >= 900 || core > 0.5)) return 'office';
  if (b.heightM >= 30) return core > 0.5 ? 'office' : 'residential';
  return 'tenement';
}

/** 各类型层高的夹取范围与缺省值（米）。 */
export const F2F_RANGE: Readonly<Record<Typology, readonly [min: number, max: number, fallback: number]>> = {
  office: [3.6, 4.5, 4.0],
  residential: [2.75, 3.2, 2.9],
  tenement: [2.9, 3.6, 3.2],
  podium: [3.8, 6.0, 4.5],
  civic: [3.6, 5.0, 4.2],
  sensitive: [3.6, 4.6, 4.0],
};

/**
 * 立面上用的层高（米）：有层数时取 楼高 ÷ 层数 并夹到该类型的合理范围，再微调成整数层（楼高不足一层时保持原值）。
 * 没有层数时用缺省值（写字楼 4.0、住宅 2.9）。
 */
export function floorToFloor(t: Typology, heightM: number, storeys?: number): number {
  const [lo, hi, fb] = F2F_RANGE[t];
  const raw = rawFloorToFloor(heightM, storeys);
  const f = raw === null ? fb : Math.min(Math.max(raw, lo), hi);
  const n = Math.round(heightM / f);
  if (n < 1) return f;
  const even = heightM / n;
  return even >= lo * 0.95 && even <= hi * 1.05 ? even : f;
}

/** 质心落在 [x0, y0, x1, y1]（米）矩形里的「塔楼楼面面积」各类型占比（测试与调参用）。 */
export function floorAreaShare(
  rows: readonly (TypologyInput & { typology: Typology })[],
  rect: readonly [number, number, number, number],
): Map<Typology, number> {
  const sum = new Map<Typology, number>();
  let total = 0;
  for (const r of rows) {
    if (r.kind !== 'tower' || r.x < rect[0] || r.x > rect[2] || r.y < rect[1] || r.y > rect[3]) continue;
    const floors = r.storeys ?? Math.max(1, Math.round(r.heightM / floorToFloor(r.typology, r.heightM)));
    const a = r.areaM2 * floors;
    sum.set(r.typology, (sum.get(r.typology) ?? 0) + a);
    total += a;
  }
  for (const [k, v] of sum) sum.set(k, v / Math.max(total, 1));
  return sum;
}
