// ===== art/buildings.ts =====（spec:ui-art §3.8 建筑配方表、ARCHITECTURE §8.3 多样性保证；WP9）
// genBuilding(id) = 配方（占地 / ramp / i0 / 高度 / 轮廓 / 附属物）× seed = id 的抖动（高度 ±10%、窗格亮灭、落点）。
// 分区建筑：同 (zone, level) 内 (ramp, silhouette) 两两不同；i0 = 3 + tier（buildings.test 校验）。公共建筑按类别专用画法。
import type { IndexedBitmap } from '../contracts/render';
import { FOOTPRINT } from '../contracts/footprint';
import { hashNoise } from '../contracts/prng';
import { IDX, Ramp, ci, misc } from './palette';
import type { ScaleSpec } from './raster';
import { fillEllipse, fillHalfEllipse, fillPoly, fillRect, line, px, setPx, strokeEllipse } from './raster';
import {
  STRUCTURE_MAX_H_L, antenna, blitAt, car, chimney, columns, cylinder, dome, door, fence, fillLot, fillLotRect, flag, groundDiamond, hvac, isoBox, lotLine, lotPt,
  newObjectLot, parkingLot, roofBarrel, roofGable, roofHip, roofSawtooth, rotor, scatterTrees, shrubSprite, signPlate, steps, treeSprite, windows, type BoxFaces, type Lot,
} from './iso';

export type Silhouette = 'gable' | 'gableV' | 'hip' | 'lshape' | 'flat' | 'stepped' | 'tower' | 'podium' | 'court' | 'mall' | 'canopy' | 'pavilion' | 'barrel' | 'sawtooth' | 'tanks' | 'dome' | 'lot' | 'parking' | 'substation' | 'campus' | 'custom';
export type GroundKind = 'grass' | 'asphalt' | 'sand' | 'olive' | 'earth' | 'none';
export interface BuildingRecipe {
  readonly id: number; readonly size: 1 | 2 | 3 | 4; readonly ramp: Ramp; readonly i0: number; readonly hL: number; readonly sil: Silhouette;
  readonly ground: GroundKind; readonly roof?: Ramp; readonly n?: number; readonly zone?: { type: 'R' | 'C' | 'I'; tier: 0 | 1 | 2; level: 1 | 2 | 3 | 4 };
}
type Z = BuildingRecipe['zone'];
const z = (type: 'R' | 'C' | 'I', tier: 0 | 1 | 2, level: 1 | 2 | 3 | 4): Z => ({ type, tier, level });
const R = (id: number, size: 1 | 2 | 3 | 4, tier: 0 | 1 | 2, level: 1 | 2 | 3 | 4, ramp: Ramp, hL: number, sil: Silhouette, roof?: Ramp, n?: number): BuildingRecipe =>
  ({ id, size, ramp, i0: 3 + tier, hL, sil, ground: 'grass', roof, n, zone: z('R', tier, level) });
const C = (id: number, size: 1 | 2 | 3 | 4, tier: 0 | 1 | 2, level: 1 | 2 | 3 | 4, ramp: Ramp, hL: number, sil: Silhouette, roof?: Ramp, n?: number): BuildingRecipe =>
  ({ id, size, ramp, i0: 3 + tier, hL, sil, ground: 'asphalt', roof, n, zone: z('C', tier, level) });
const I = (id: number, size: 1 | 2 | 3 | 4, tier: 0 | 1 | 2, level: 1 | 2 | 3 | 4, ramp: Ramp, hL: number, sil: Silhouette, roof?: Ramp, n?: number): BuildingRecipe =>
  ({ id, size, ramp, i0: 3 + tier, hL, sil, ground: 'asphalt', roof, n, zone: z('I', tier, level) });
const P = (id: number, size: 1 | 2 | 3 | 4, ramp: Ramp, i0: number, hL: number, ground: GroundKind, sil: Silhouette = 'custom'): BuildingRecipe => ({ id, size, ramp, i0, hL, sil, ground });

/** 0x70–0xFF 全覆盖（施工 / 废弃 0x88–0x8B、0xA6–0xAD、0xC2–0xC5 由 nature.ts 覆盖，不在此表）。 */
const RECIPE_LIST: readonly BuildingRecipe[] = [
  // ---- R L1：tier0 Brick 系 / tier1 WarmGray 系 / tier2 Neutral 系（12 个 (ramp, sil) 两两不同）----
  R(0x70, 1, 0, 1, Ramp.Brick, 14, 'gable', Ramp.Earth), R(0x71, 1, 0, 1, Ramp.Brick, 14, 'gableV', Ramp.Rust), R(0x72, 1, 0, 1, Ramp.Sand, 13, 'hip', Ramp.Earth), R(0x73, 1, 0, 1, Ramp.Brick, 12, 'lshape', Ramp.WarmGray),
  R(0x74, 1, 1, 1, Ramp.WarmGray, 18, 'gable', Ramp.Brick), R(0x75, 1, 1, 1, Ramp.WarmGray, 18, 'hip', Ramp.Forest), R(0x76, 1, 1, 1, Ramp.Brick, 18, 'hip', Ramp.Asphalt), R(0x77, 1, 1, 1, Ramp.Sand, 17, 'gableV', Ramp.Brick),
  R(0x78, 1, 2, 1, Ramp.Neutral, 22, 'lshape', Ramp.Teal), R(0x79, 1, 2, 1, Ramp.Neutral, 22, 'hip', Ramp.Violet), R(0x7a, 1, 2, 1, Ramp.WarmGray, 22, 'lshape', Ramp.Glass), R(0x7b, 1, 2, 1, Ramp.Neutral, 21, 'gable', Ramp.Brick),
  // ---- C L1 ----
  C(0x7c, 1, 0, 1, Ramp.WarmGray, 10, 'canopy'), C(0x7d, 1, 1, 1, Ramp.Brick, 20, 'gable', Ramp.Forest), C(0x7e, 1, 0, 1, Ramp.WarmGray, 12, 'flat'), C(0x7f, 1, 0, 1, Ramp.Sand, 10, 'canopy'),
  C(0x80, 1, 1, 1, Ramp.Glass, 28, 'flat'), C(0x81, 1, 2, 1, Ramp.WarmGray, 34, 'tower'), C(0x82, 1, 0, 1, Ramp.Sand, 16, 'barrel'), C(0x83, 1, 1, 1, Ramp.Violet, 16, 'flat'),
  // ---- I L1 ----
  I(0x84, 1, 0, 1, Ramp.Rust, 16, 'barrel'), I(0x85, 1, 0, 1, Ramp.Teal, 18, 'tanks', undefined, 2), I(0x86, 1, 1, 1, Ramp.WarmGray, 16, 'barrel'), I(0x87, 1, 1, 1, Ramp.Neutral, 10, 'substation'),
  // ---- R L2 / L3 ----
  R(0x8c, 2, 0, 2, Ramp.Brick, 40, 'flat'), R(0x8d, 2, 0, 2, Ramp.Rust, 38, 'flat'), R(0x8e, 2, 0, 2, Ramp.Brick, 36, 'court'), R(0x8f, 2, 1, 2, Ramp.WarmGray, 56, 'flat'),
  R(0x90, 2, 1, 3, Ramp.WarmGray, 56, 'stepped'), R(0x91, 2, 2, 3, Ramp.Neutral, 64, 'flat'), R(0x92, 2, 2, 3, Ramp.Glass, 64, 'flat'), R(0x93, 2, 2, 3, Ramp.Neutral, 62, 'stepped'),
  // ---- C L2 / L3 ----
  C(0x94, 2, 1, 2, Ramp.WarmGray, 20, 'mall'), C(0x95, 2, 0, 2, Ramp.Sand, 18, 'mall'), C(0x96, 2, 1, 2, Ramp.Glass, 72, 'flat'), C(0x97, 2, 2, 2, Ramp.Neutral, 60, 'flat'), C(0x98, 2, 1, 2, Ramp.Glass, 70, 'stepped'),
  C(0x99, 2, 0, 3, Ramp.WarmGray, 48, 'flat'), C(0x9a, 2, 1, 3, Ramp.Glass, 80, 'flat'), C(0x9b, 2, 2, 3, Ramp.Neutral, 85, 'flat'), C(0x9c, 2, 2, 3, Ramp.Glass, 90, 'stepped'), C(0x9d, 2, 2, 3, Ramp.Neutral, 96, 'stepped'),
  // ---- I L2 / L3 ----
  I(0x9e, 2, 0, 2, Ramp.Sand, 22, 'barrel', undefined, 2), I(0x9f, 2, 0, 2, Ramp.Teal, 30, 'tanks', undefined, 2), I(0xa0, 2, 0, 2, Ramp.Rust, 26, 'sawtooth', undefined, 4), I(0xa1, 2, 0, 2, Ramp.WarmGray, 26, 'sawtooth', undefined, 3),
  I(0xa2, 2, 1, 3, Ramp.Rust, 28, 'sawtooth', undefined, 5), I(0xa3, 2, 1, 3, Ramp.WarmGray, 30, 'flat'), I(0xa4, 2, 2, 3, Ramp.Teal, 28, 'sawtooth', undefined, 4), I(0xa5, 2, 2, 3, Ramp.Neutral, 32, 'flat'),
  // ---- R / C / I L4 ----
  R(0xae, 3, 0, 4, Ramp.Brick, 96, 'flat'), R(0xaf, 3, 1, 4, Ramp.WarmGray, 96, 'flat'), R(0xb0, 3, 2, 4, Ramp.Neutral, 120, 'tower'), R(0xb1, 3, 2, 4, Ramp.Glass, 120, 'tower'),
  C(0xb2, 3, 1, 4, Ramp.Glass, 30, 'campus'), C(0xb3, 3, 1, 4, Ramp.Glass, 140, 'tower'), C(0xb4, 3, 0, 4, Ramp.WarmGray, 20, 'mall'), C(0xb5, 3, 1, 4, Ramp.Violet, 36, 'flat'), C(0xb6, 3, 0, 4, Ramp.Asphalt, 8, 'lot'),
  C(0xb7, 3, 2, 4, Ramp.Neutral, 144, 'stepped'), C(0xb8, 3, 2, 4, Ramp.Glass, 136, 'dome'), C(0xb9, 3, 0, 4, Ramp.Asphalt, 0, 'parking'), C(0xba, 3, 2, 4, Ramp.Sand, 60, 'hip', Ramp.Rust), C(0xbb, 3, 2, 4, Ramp.Glass, 144, 'podium'),
  I(0xbc, 3, 0, 4, Ramp.Teal, 36, 'tanks', undefined, 4), I(0xbd, 3, 1, 4, Ramp.Rust, 40, 'sawtooth', undefined, 6), I(0xbe, 3, 2, 4, Ramp.Neutral, 48, 'tanks', undefined, 1), I(0xbf, 3, 1, 4, Ramp.WarmGray, 32, 'sawtooth', undefined, 4),
  I(0xc0, 3, 0, 4, Ramp.Sand, 28, 'barrel', undefined, 3), I(0xc1, 3, 0, 4, Ramp.Rust, 28, 'barrel', undefined, 3),
  // ---- 电厂 ----
  P(0xc6, 1, Ramp.WarmGray, 4, 20, 'none'), P(0xc7, 1, Ramp.WarmGray, 4, 20, 'none'), P(0xc8, 1, Ramp.Neutral, 6, 36, 'grass'),
  P(0xc9, 4, Ramp.WarmGray, 4, 36, 'asphalt'), P(0xca, 4, Ramp.Rust, 3, 44, 'asphalt'), P(0xcb, 4, Ramp.Neutral, 5, 48, 'asphalt'), P(0xcc, 4, Ramp.Glass, 4, 6, 'sand'),
  P(0xcd, 4, Ramp.Neutral, 4, 40, 'asphalt'), P(0xce, 4, Ramp.Violet, 3, 56, 'asphalt'), P(0xcf, 4, Ramp.WarmGray, 2, 40, 'asphalt'),
  // ---- 公共 / 奖励 / 休闲 ----
  P(0xd0, 3, Ramp.Neutral, 6, 48, 'grass'), P(0xd1, 3, Ramp.Neutral, 6, 56, 'asphalt'), P(0xd2, 3, Ramp.Glass, 3, 36, 'asphalt'), P(0xd3, 3, Ramp.Brick, 4, 30, 'asphalt'),
  P(0xd4, 3, Ramp.Sand, 6, 44, 'grass'), P(0xd5, 3, Ramp.Grass, 5, 0, 'grass'), P(0xd6, 3, Ramp.Brick, 4, 24, 'grass'), P(0xd7, 4, Ramp.Neutral, 5, 60, 'asphalt'),
  P(0xd8, 4, Ramp.WarmGray, 3, 28, 'asphalt'), P(0xd9, 4, Ramp.Brick, 5, 40, 'grass'), P(0xda, 4, Ramp.Sand, 5, 12, 'grass'), P(0xdb, 1, Ramp.Neutral, 6, 40, 'grass'),
  P(0xdc, 1, Ramp.Water, 4, 14, 'sand'), P(0xdd, 1, Ramp.Asphalt, 2, 0, 'none'), P(0xde, 1, Ramp.Asphalt, 2, 0, 'none'), P(0xdf, 1, Ramp.Rust, 4, 4, 'none'),
  P(0xe0, 1, Ramp.Amber, 5, 50, 'asphalt'), P(0xe1, 1, Ramp.Neutral, 5, 48, 'asphalt'), P(0xe2, 1, Ramp.Olive, 4, 40, 'asphalt'), P(0xe3, 1, Ramp.Olive, 4, 18, 'asphalt'),
  P(0xe4, 1, Ramp.Glass, 4, 24, 'asphalt'), P(0xe5, 1, Ramp.Glass, 4, 32, 'asphalt'), P(0xe6, 1, Ramp.Asphalt, 3, 0, 'asphalt'), P(0xe7, 1, Ramp.Olive, 5, 6, 'asphalt'),
  P(0xe8, 1, Ramp.Neutral, 4, 24, 'asphalt'), P(0xe9, 1, Ramp.WarmGray, 5, 10, 'asphalt'), P(0xea, 1, Ramp.Olive, 4, 20, 'asphalt'), P(0xeb, 2, Ramp.Water, 5, 56, 'grass'),
  P(0xec, 2, Ramp.Amber, 4, 20, 'asphalt'), P(0xed, 2, Ramp.Brick, 4, 22, 'asphalt'), P(0xee, 2, Ramp.Asphalt, 3, 0, 'asphalt', 'parking'), P(0xef, 2, Ramp.Asphalt, 3, 0, 'asphalt', 'parking'),
  P(0xf0, 2, Ramp.Rust, 4, 14, 'asphalt'), P(0xf1, 2, Ramp.Olive, 3, 24, 'olive'), P(0xf2, 2, Ramp.Asphalt, 3, 10, 'asphalt'), P(0xf3, 2, Ramp.Neutral, 6, 30, 'grass'),
  P(0xf4, 2, Ramp.Teal, 4, 14, 'asphalt'), P(0xf5, 2, Ramp.Sand, 6, 28, 'grass'), P(0xf6, 2, Ramp.Neutral, 4, 32, 'asphalt'), P(0xf7, 2, Ramp.Neutral, 7, 30, 'grass'),
  P(0xf8, 3, Ramp.Rust, 4, 6, 'none'), P(0xf9, 3, Ramp.Olive, 3, 6, 'olive'), P(0xfa, 3, Ramp.Teal, 4, 24, 'asphalt'),
  P(0xfb, 4, Ramp.WarmGray, 4, 180, 'asphalt'), P(0xfc, 4, Ramp.Glass, 4, 150, 'grass'), P(0xfd, 4, Ramp.Violet, 2, 190, 'asphalt'), P(0xfe, 4, Ramp.Neutral, 5, 192, 'asphalt'), P(0xff, 4, Ramp.Amber, 5, 100, 'grass'),
];
export const BUILDING_RECIPES: ReadonlyMap<number, BuildingRecipe> = new Map(RECIPE_LIST.map((r) => [r.id, r]));
/** 配方表中的 ID（升序）。 */
export const RECIPE_IDS: readonly number[] = RECIPE_LIST.map((r) => r.id);

const GROUND_IDX: Readonly<Record<GroundKind, number>> = { grass: ci(Ramp.Grass, 5), asphalt: ci(Ramp.Asphalt, 4), sand: ci(Ramp.Sand, 4), olive: ci(Ramp.Olive, 3), earth: ci(Ramp.Earth, 4), none: 0 };
const LIT = ci(Ramp.Amber, 6), DARK = ci(Ramp.Glass, 2);

interface Ctx { lot: Lot; sp: ScaleSpec; r: BuildingRecipe; n: number; h: number; seed: number; margin: number }
const jitter = (seed: number, k: number): number => 0.9 + 0.2 * hashNoise(seed, k, 0);

/** 主体盒 + 窗 + 平顶装饰。 */
function mainBox(c: Ctx, u0: number, v0: number, u1: number, v1: number, h: number, ramp = c.r.ramp, i0 = c.r.i0, win = true): BoxFaces {
  const box = isoBox(c.lot, u0, v0, u1, v1, h, ramp, i0);
  if (win && h > 0) windows(c.lot, box, { seed: c.seed, lit: LIT, dark: ramp === Ramp.Glass ? ci(Ramp.Glass, 3) : DARK });
  return box;
}
function parapet(c: Ctx, box: BoxFaces, n = 1): void {
  const z1 = box.z0 + box.h;
  const inset = 0.03 * c.n;
  fillLotRect(c.lot, box.u0 + inset, box.v0 + inset, box.u1 - inset, box.v1 - inset, ci(box.ramp, box.i0 + 1), z1);
  for (let k = 0; k < n; k++) {
    const u = box.u0 + (box.u1 - box.u0) * (0.2 + 0.6 * hashNoise(c.seed, k, 5)), v = box.v0 + (box.v1 - box.v0) * (0.2 + 0.6 * hashNoise(c.seed, k, 6));
    hvac(c.lot, u, v, z1, 0.1 * c.n, 0.08 * c.n, 4);
  }
}
function yardTrees(c: Ctx, n: number, where: 'front' | 'corners' = 'front'): void {
  const sz = c.n;
  if (where === 'front') scatterTrees(c.lot, sz * 0.05, sz * 0.78, sz * 0.5, sz * 0.95, n, c.seed, 0.9);
  else { scatterTrees(c.lot, 0.02, 0.02, sz * 0.3, sz * 0.3, Math.max(1, n >> 1), c.seed, 0.9); scatterTrees(c.lot, sz * 0.7, sz * 0.7, sz * 0.98, sz * 0.98, Math.max(1, n - (n >> 1)), c.seed + 1, 0.9); }
}

// ---------------- 分区建筑轮廓 ----------------
function house(c: Ctx, sil: Silhouette): void {
  const { lot, sp, r } = c;
  const roof = r.roof ?? Ramp.Brick;
  const m = 0.2, h = c.h;
  const rh = Math.max(2, Math.round(h * 0.5));
  if (sil === 'lshape') {
    const main = mainBox(c, m, m, 0.8, 0.62, h, r.ramp, r.i0, false);
    windows(lot, main, { seed: c.seed, rows: 1, marginTop: Math.round(h * 0.3), pitchX: sp.scale === 'L' ? 7 : sp.scale === 'M' ? 4 : 2 });
    roofGable(lot, main, rh, roof, r.i0, 'u');
    const wing = mainBox(c, m, 0.62, 0.55, 0.82, Math.round(h * 0.6), r.ramp, r.i0, false);
    roofGable(lot, wing, Math.round(rh * 0.6), roof, r.i0, 'v');
    door(lot, wing, 'right', 0.5, 3, 6, ci(Ramp.Earth, 1));
  } else {
    const box = mainBox(c, m, m, 0.8, 0.8, h, r.ramp, r.i0, false);
    windows(lot, box, { seed: c.seed, rows: h >= 20 * sp.k ? 2 : 1, marginTop: Math.round(h * 0.25), pitchX: sp.scale === 'L' ? 7 : sp.scale === 'M' ? 4 : 2 });
    if (sil === 'gable') roofGable(lot, box, rh, roof, r.i0, 'u');
    else if (sil === 'gableV') roofGable(lot, box, rh, roof, r.i0, 'v');
    else roofHip(lot, box, rh, roof, r.i0, 0.22);
    door(lot, box, 'left', 0.35, 3, 6, ci(Ramp.Earth, 1));
  }
  // 档次附属物：tier1 烟囱 + 车库门；tier2 泳池 + 车道 + 2 棵树
  const tier = r.zone?.tier ?? 0;
  if (tier >= 1) { chimney(lot, 0.68, 0.3, h + Math.round(rh * 0.5), 3, Math.max(2, Math.round(6 * sp.k))); }
  if (tier === 1) { const [x, y] = lotPt(lot, 0.8, 0.5); fillRect(lot.bmp, Math.round(x) - Math.max(1, Math.round(3 * sp.k)), Math.round(y) - Math.max(2, Math.round(5 * sp.k)), Math.max(2, Math.round(6 * sp.k)), Math.max(2, Math.round(5 * sp.k)), ci(Ramp.Neutral, 5)); }
  if (tier === 2) {
    fillLotRect(lot, 0.84, 0.3, 0.98, 0.5, ci(Ramp.Water, 5)); lotLine(lot, 0.84, 0.3, 0, 0.98, 0.3, 0, ci(Ramp.Neutral, 7)); lotLine(lot, 0.84, 0.3, 0, 0.84, 0.5, 0, ci(Ramp.Neutral, 7));
    fillLotRect(lot, 0.35, 0.82, 0.55, 1.0, ci(Ramp.Sand, 6));
    yardTrees(c, 2, 'corners');
  } else if (tier === 1) yardTrees(c, 1, 'corners');
}
function office(c: Ctx, sil: Silhouette): void {
  const { lot, sp, r, n } = c;
  const m = c.margin, h = c.h;
  if (sil === 'flat') {
    const box = mainBox(c, m, m, n - m, n - m, h);
    parapet(c, box, n >= 2 ? 2 : 1);
    if (r.zone?.type === 'C' && n === 1) signPlate(lot, box, 'left', 0.5, Math.round(h * 0.75), 10, 4, r.ramp === Ramp.Violet ? ci(Ramp.Amber, 6) : ci(Ramp.Violet, 5));
    if (r.zone?.type === 'C' && n === 2 && r.id === 0x97) { fillLotRect(lot, n - m + 0.02, 0.2, n - 0.02, 0.6, ci(Ramp.Water, 5)); scatterTrees(lot, 0.05, n - 0.3, 0.4, n - 0.05, 2, c.seed, 0.8); }
    if (r.zone?.type === 'R' && n >= 2) lotLine(lot, m, n - m, h * 0.5, n - m, n - m, h * 0.5, ci(Ramp.Neutral, 6));   // 阳台横线
    if (r.zone?.type === 'R' && r.zone.tier === 2) fillLotRect(lot, m + 0.15, m + 0.15, n - m - 0.15, n - m - 0.15, ci(Ramp.Forest, 4), h);
    if (r.zone?.type === 'I') { chimney(lot, n - m - 0.2, m + 0.2, h, 6, Math.round(h * 0.5)); if (n >= 2) chimney(lot, n - m - 0.5, m + 0.2, h, 6, Math.round(h * 0.45)); }
    if (n === 1 && r.id === 0x7e) { fillLot(lot, [m, n - m, 0, n - m, n - m, 0, n - m, n - m, h * 0.5, m, n - m, h * 0.5], ci(Ramp.Glass, 4)); signPlate(lot, box, 'left', 0.5, Math.round(h * 0.85), 12, 4, ci(Ramp.Violet, 5)); }
    if (r.id === 0x99) fillLot(lot, [m, n - m, 0, n - m, n - m, 0, n - m, n - m, h * 0.3, m, n - m, h * 0.3], ci(Ramp.Glass, 5));
    if (r.id === 0xb5) { signPlate(lot, box, 'left', 0.5, Math.round(h * 0.9), 24, 8, ci(Ramp.Amber, 6), ci(Ramp.Signal, 5)); signPlate(lot, box, 'right', 0.5, Math.round(h * 0.9), 14, 6, ci(Ramp.Violet, 6)); }
    if (r.id === 0xa3 || r.id === 0xa5) { isoBox(lot, m + 0.1, m + 0.1, n - m - 0.1, n - m - 0.1, Math.round(h * 0.25), r.ramp, r.i0, { z0: h, outline: false }); }
  } else if (sil === 'stepped') {
    const h1 = Math.round(h * 0.6), h2 = h - h1;
    mainBox(c, m, m, n - m, n - m, h1);
    const ins = 0.15 * n;
    const top = mainBox(c, m + ins, m + ins, n - m - ins, n - m - ins, h2, r.ramp, r.i0);
    top.z0 = h1;
    isoBox(lot, m + ins, m + ins, n - m - ins, n - m - ins, h2, r.ramp, r.i0, { z0: h1 });
    windows(lot, { ...top, z0: h1 }, { seed: c.seed + 1, lit: LIT, dark: DARK });
    parapet(c, { ...top, z0: h1 }, 1);
    if (r.id === 0x9d) fillLotRect(lot, m + ins, m + ins, n - m - ins, n - m - ins, ci(Ramp.Violet, 4), h);
    antenna(lot, n / 2, n / 2, h, 14);
  } else if (sil === 'tower') {
    const ins = n === 1 ? 0.1 : 0.22 * n;
    const box = mainBox(c, m + ins * 0.5, m + ins * 0.5, n - m - ins * 0.5, n - m - ins * 0.5, h);
    if (r.ramp === Ramp.Glass) { lotLine(lot, m + ins * 0.5, n - m - ins * 0.5, 0, m + ins * 0.5, n - m - ins * 0.5, h, ci(Ramp.Glass, 6)); }
    parapet(c, box, 1);
    antenna(lot, n / 2, n / 2, h, 16);
    if (r.zone?.type === 'R') fillLotRect(lot, m + ins * 0.6, m + ins * 0.6, n - m - ins * 0.6, n - m - ins * 0.6, ci(Ramp.Forest, 4), h);
    if (n >= 3) scatterTrees(lot, 0.1, n - 0.5, 0.6, n - 0.1, 2, c.seed, 0.8);
  } else if (sil === 'podium') {
    const hb = Math.round(h * 0.18);
    const base = mainBox(c, m * 0.7, m * 0.7, n - m * 0.7, n - m * 0.7, hb, Ramp.Neutral, 6);
    parapet(c, base, 0);
    const ins = 0.28 * n;
    isoBox(lot, m + ins * 0.5, m + ins * 0.5, n - m - ins * 0.5, n - m - ins * 0.5, h - hb, r.ramp, r.i0, { z0: hb });
    windows(lot, { u0: m + ins * 0.5, v0: m + ins * 0.5, u1: n - m - ins * 0.5, v1: n - m - ins * 0.5, z0: hb, h: h - hb, ramp: r.ramp, i0: r.i0, leftW: (n - 2 * m - ins) * sp.W / 2, rightW: (n - 2 * m - ins) * sp.W / 2 }, { seed: c.seed, lit: LIT, dark: ci(Ramp.Glass, 3) });
    // 直升机坪
    const [hx, hy] = lotPt(lot, n / 2, n / 2, h);
    fillEllipse(lot.bmp, hx, hy, Math.max(2, 10 * sp.k), Math.max(1, 5 * sp.k), ci(Ramp.Neutral, 6));
    if (sp.scale !== 'S') { line(lot.bmp, Math.round(hx) - Math.round(3 * sp.k), Math.round(hy) - Math.round(2 * sp.k), Math.round(hx) - Math.round(3 * sp.k), Math.round(hy) + Math.round(2 * sp.k), ci(Ramp.Neutral, 2)); line(lot.bmp, Math.round(hx) + Math.round(3 * sp.k), Math.round(hy) - Math.round(2 * sp.k), Math.round(hx) + Math.round(3 * sp.k), Math.round(hy) + Math.round(2 * sp.k), ci(Ramp.Neutral, 2)); line(lot.bmp, Math.round(hx) - Math.round(3 * sp.k), Math.round(hy), Math.round(hx) + Math.round(3 * sp.k), Math.round(hy), ci(Ramp.Neutral, 2)); }
  } else if (sil === 'court') {
    const d = 0.55;
    const a = mainBox(c, m, m, n - m, m + d, h); parapet(c, a, 0);
    const b = mainBox(c, m, m + d, m + d, n - m, h); parapet(c, b, 0);
    const e = mainBox(c, n - m - d, m + d, n - m, n - m, Math.round(h * 0.8)); parapet(c, e, 0);
    scatterTrees(lot, m + d + 0.1, m + d + 0.1, n - m - d - 0.1, n - m - 0.1, 2, c.seed, 0.8);
  } else if (sil === 'mall') {
    const split = n * 0.55;
    const box = mainBox(c, m, m, n - m, split, h, r.ramp, r.i0, false);
    parapet(c, box, 2);
    // 连续橱窗
    fillLot(lot, [m, split, 0, n - m, split, 0, n - m, split, h * 0.45, m, split, h * 0.45], ci(Ramp.Glass, 5));
    const signs = n >= 3 ? 4 : 3;
    for (let k = 0; k < signs; k++) signPlate(lot, box, 'left', (k + 0.5) / signs, Math.round(h * 0.85), 10, 4, [ci(Ramp.Violet, 5), ci(Ramp.Amber, 6), ci(Ramp.Signal, 5), ci(Ramp.Teal, 5)][k % 4]!);
    parkingLot(lot, m, split + 0.06, n - m, n - 0.05, c.seed, n >= 3 ? 7 : 4, 'u');
  } else if (sil === 'campus') {
    const hb = Math.round(h);
    for (const [u0, v0, u1, v1] of [[0.2, 0.2, 1.3, 1.1], [1.6, 0.2, 2.8, 1.1], [0.2, 1.4, 1.3, 2.6]] as const) { const b = mainBox(c, u0, v0, u1, v1, hb); parapet(c, b, 1); }
    scatterTrees(lot, 1.5, 1.5, 2.6, 2.6, 3, c.seed, 0.9);
    parkingLot(lot, 1.6, 1.3, 2.8, 2.0, c.seed, 3, 'u');
  }
}
function industrial(c: Ctx, sil: Silhouette): void {
  const { lot, sp, r, n } = c;
  const m = c.margin, h = c.h;
  if (sil === 'barrel') {
    const spans = r.n ?? 1;
    const box = mainBox(c, m, m, n - m, n - m, h, r.ramp, r.i0, false);
    windows(lot, box, { seed: c.seed, rows: 1, marginTop: Math.round(h * 0.35), faces: 'right' });
    roofBarrel(lot, box, Math.max(2, Math.round(h * 0.4)), r.ramp, r.i0, 'u', spans);
    const doors = spans === 1 ? 1 : spans === 2 ? 3 : 6;
    for (let k = 0; k < doors; k++) door(lot, box, 'left', (k + 0.5) / doors, n === 1 ? 10 : 8, n === 1 ? 8 : 7, ci(Ramp.Neutral, 4));
    if (n >= 3) fillLotRect(lot, m, n - m, n - m, n - 0.02, ci(Ramp.Asphalt, 2));
    if (r.id === 0x84 || r.id === 0x86) lotLine(lot, n - m, m, h * 0.5, n - m, n - m, h * 0.5, ci(Ramp.Teal, 3));
  } else if (sil === 'sawtooth') {
    const segs = r.n ?? 4;
    const box = mainBox(c, m, m, n - m, n - m, Math.round(h * 0.7), r.ramp, r.i0, false);
    windows(lot, box, { seed: c.seed, rows: 1, marginTop: Math.round(h * 0.2), lit: ci(Ramp.Glass, 5), dark: ci(Ramp.Glass, 3) });
    roofSawtooth(lot, box, Math.max(2, Math.round(h * 0.3)), r.ramp, r.i0, segs);
    const stacks = n >= 3 ? 3 : 1 + (r.id & 1);
    for (let k = 0; k < stacks; k++) chimney(lot, n - m - 0.15 - k * 0.3, m + 0.15, Math.round(h * 0.7), 6, Math.round(h * 0.6));
    if (n >= 3) { door(lot, box, 'left', 0.3, 10, 9, ci(Ramp.Neutral, 2)); door(lot, box, 'left', 0.7, 10, 9, ci(Ramp.Neutral, 2)); }
  } else if (sil === 'tanks') {
    const k = r.n ?? 2;
    const slabH = Math.max(1, Math.round(3 * sp.k));
    isoBox(lot, m, m, n - m, n - m, slabH, Ramp.Asphalt, 3, { outline: false });
    if (r.id === 0xbe) {
      // 球形罐 + 高塔 + 管道
      const [sx, sy] = lotPt(lot, 1.0, 1.9, slabH);
      const rr = Math.max(3, 15 * sp.k);
      fillEllipse(lot.bmp, sx, sy - rr, rr, rr, ci(Ramp.Neutral, 3)); fillEllipse(lot.bmp, sx - rr * 0.3, sy - rr * 1.25, rr * 0.5, rr * 0.5, ci(Ramp.Neutral, 5)); fillEllipse(lot.bmp, sx - rr * 0.4, sy - rr * 1.4, rr * 0.2, rr * 0.2, ci(Ramp.Neutral, 7));
      strokeEllipse(lot.bmp, sx, sy - rr, rr, rr, ci(Ramp.Neutral, 1));
      isoBox(lot, 2.0, 0.6, 2.5, 1.1, h, Ramp.Neutral, 3, { z0: slabH });
      cylinder(lot, 2.25, 2.2, slabH, 20, Math.round(h * 0.6), Ramp.Teal, 3);
      lotLine(lot, 1.2, 1.9, slabH + rr, 2.0, 0.9, slabH + h * 0.5, ci(Ramp.Teal, 4)); lotLine(lot, 2.25, 2.2, slabH + h * 0.6, 2.25, 1.1, slabH + h * 0.6, ci(Ramp.Teal, 4));
      antenna(lot, 2.25, 0.85, slabH + h, 10);
      return;
    }
    for (let t = 0; t < k; t++) {
      const u = n === 1 ? 0.33 + 0.36 * t : m + 0.35 + ((n - 2 * m - 0.7) * (t % 2)), v = n === 1 ? 0.5 : m + 0.35 + ((n - 2 * m - 0.7) * (t >> 1 & 1));
      cylinder(lot, u, v, slabH, n === 1 ? 14 : 24, Math.round(h * 0.9), r.ramp, r.i0, ci(Ramp.Neutral, 6));
      if (sp.scale !== 'S') { const [x, y] = lotPt(lot, u, v, slabH + h * 0.9); strokeEllipse(lot.bmp, x, y, Math.max(1, (n === 1 ? 7 : 12) * sp.k), Math.max(1, (n === 1 ? 3.5 : 6) * sp.k), ci(Ramp.Neutral, 6)); }
    }
    if (n >= 2) { chimney(lot, n - m - 0.15, n - m - 0.15, slabH, 5, Math.round(h * 0.9)); lotLine(lot, m + 0.35, m + 0.35, slabH + h * 0.5, n - m - 0.35, n - m - 0.35, slabH + h * 0.5, ci(Ramp.Teal, 4)); }
    if (n >= 3) { chimney(lot, m + 0.15, n - m - 0.15, slabH, 5, Math.round(h * 0.8)); }
  } else if (sil === 'substation') {
    fence(lot, 0.08, 0.08, 0.92, 0.92, ci(Ramp.Neutral, 5), 5);
    isoBox(lot, 0.25, 0.3, 0.45, 0.5, h, Ramp.Neutral, 3); isoBox(lot, 0.55, 0.55, 0.75, 0.75, h, Ramp.Neutral, 3);
    const w = ci(Ramp.Neutral, 1);
    lotLine(lot, 0.35, 0.4, h + px(sp, 6), 0.65, 0.65, h + px(sp, 6), w); antenna(lot, 0.35, 0.4, h, 6, ci(Ramp.Glass, 6)); antenna(lot, 0.65, 0.65, h, 6, ci(Ramp.Glass, 6));
  }
}
function gasStation(c: Ctx): void {
  const { lot, sp, r } = c;
  const h = c.h;
  const kiosk = mainBox(c, 0.55, 0.15, 0.9, 0.5, h, r.ramp, r.i0, false);
  fillLot(lot, [0.55, 0.5, 0, 0.9, 0.5, 0, 0.9, 0.5, h * 0.6, 0.55, 0.5, h * 0.6], ci(Ramp.Glass, 5));
  parapet(c, kiosk, 0);
  // 雨棚：4 柱 + 薄顶
  const ch = Math.round(h * 1.4);
  const post = ci(Ramp.Neutral, 6);
  for (const [u, v] of [[0.15, 0.55], [0.5, 0.55], [0.15, 0.9], [0.5, 0.9]] as const) lotLine(lot, u, v, 0, u, v, ch, post);
  isoBox(lot, 0.08, 0.5, 0.56, 0.96, Math.max(1, Math.round(3 * sp.k)), Ramp.Signal, 5, { z0: ch, outline: false, top: ci(Ramp.Neutral, 7) });
  // 油泵
  for (const [u, v] of [[0.28, 0.72], [0.4, 0.72]] as const) isoBox(lot, u, v, u + 0.06, v + 0.05, Math.max(2, Math.round(5 * sp.k)), Ramp.Amber, 5, { outline: false });
  if (r.id === 0x7f) signPlate(lot, kiosk, 'right', 0.5, Math.round(h * 0.9), 8, 4, ci(Ramp.Signal, 5));
}
function parking(c: Ctx, sil: Silhouette): void {
  const { lot, sp, n, r } = c;
  parkingLot(lot, 0.05, 0.05, n - 0.05, n - 0.05, c.seed, n === 3 ? 6 : 8, 'u');
  if (sil === 'lot') {   // 汽车影院：银幕
    const [x, y] = lotPt(lot, 0.3, 0.3);
    const sw = Math.max(4, Math.round(40 * sp.k)), sh = Math.max(3, Math.round(30 * sp.k));
    fillRect(lot.bmp, Math.round(x) - (sw >> 1), Math.round(y) - sh - Math.round(8 * sp.k), sw, sh, ci(Ramp.Neutral, 7));
    fillRect(lot.bmp, Math.round(x) - (sw >> 1), Math.round(y) - Math.round(8 * sp.k), sw, Math.round(8 * sp.k), ci(Ramp.Neutral, 3));
    isoBox(lot, 2.3, 2.3, 2.8, 2.8, Math.round(8 * sp.k), Ramp.WarmGray, 4);
  }
  if (r.id === 0xef) { fence(lot, 0.03, 0.03, n - 0.03, n - 0.03, ci(Ramp.Neutral, 5), 4); }
}

// ---------------- 公共 / 特殊建筑 ----------------
function special(c: Ctx): void {
  const { lot, sp, r, n } = c;
  const m = c.margin, h = c.h;
  const id = r.id;
  const pxs = (v: number): number => Math.max(1, Math.round(v * sp.k));
  switch (id) {
    case 0xc6: case 0xc7: {   // 水电：坝体横跨水流
      const along = id === 0xc6 ? 'u' : 'v';
      const box = along === 'u' ? isoBox(lot, 0, 0.36, 1, 0.64, h, Ramp.WarmGray, 4) : isoBox(lot, 0.36, 0, 0.64, 1, h, Ramp.WarmGray, 4);
      void box;
      for (const t of [0.3, 0.7]) { if (along === 'u') fillLot(lot, [t - 0.08, 0.64, 0, t + 0.08, 0.64, 0, t + 0.08, 0.64, h * 0.5, t - 0.08, 0.64, h * 0.5], ci(Ramp.Water, 7)); else fillLot(lot, [0.64, t - 0.08, 0, 0.64, t + 0.08, 0, 0.64, t + 0.08, h * 0.5, 0.64, t - 0.08, h * 0.5], ci(Ramp.Water, 7)); }
      isoBox(lot, 0.42, 0.42, 0.58, 0.58, Math.round(h * 0.4), Ramp.WarmGray, 5, { z0: h, outline: false });
      break;
    }
    case 0xc8: {   // 风电
      const [x, y] = lotPt(lot, 0.5, 0.5);
      fillRect(lot.bmp, Math.round(x) - 1, Math.round(y) - h, Math.max(2, pxs(2)), h, ci(Ramp.Neutral, 6));
      fillRect(lot.bmp, Math.round(x) - pxs(3), Math.round(y) - h - pxs(2), pxs(6), pxs(4), ci(Ramp.Neutral, 5));
      rotor(lot, Math.round(x), Math.round(y) - h, 20, ci(Ramp.Neutral, 7));
      break;
    }
    case 0xc9: {   // 燃气：主楼 + 球罐 + 2 烟囱 + 配电场
      const box = mainBox(c, 0.4, 0.4, 2.2, 1.8, h); parapet(c, box, 2);
      const [sx, sy] = lotPt(lot, 3.0, 1.0); const rr = Math.max(4, 22 * sp.k);
      fillEllipse(lot.bmp, sx, sy - rr, rr, rr, ci(Ramp.WarmGray, 5)); fillEllipse(lot.bmp, sx - rr * 0.3, sy - rr * 1.25, rr * 0.45, rr * 0.45, ci(Ramp.WarmGray, 7)); strokeEllipse(lot.bmp, sx, sy - rr, rr, rr, ci(Ramp.WarmGray, 2));
      for (const [u, v] of [[0.7, 2.6], [1.2, 2.6]] as const) cylinder(lot, u, v, 0, 7, Math.round(h * 1.1), Ramp.Teal, 4);
      fence(lot, 2.0, 2.2, 3.7, 3.7, ci(Ramp.Neutral, 5), 5);
      for (let k = 0; k < 4; k++) isoBox(lot, 2.3 + (k % 2) * 0.6, 2.5 + (k >> 1) * 0.6, 2.6 + (k % 2) * 0.6, 2.8 + (k >> 1) * 0.6, pxs(8), Ramp.Neutral, 3, { outline: false });
      break;
    }
    case 0xca: {   // 石油：主楼 + 3 圆柱油罐 + 2 烟囱
      const box = mainBox(c, 2.1, 0.4, 3.6, 1.9, h); parapet(c, box, 1);
      for (const [u, v] of [[0.9, 0.9], [0.9, 2.3], [2.2, 2.9]] as const) cylinder(lot, u, v, 0, 36, Math.round(h * 0.7), Ramp.Rust, 3, ci(Ramp.Rust, 5));
      chimney(lot, 3.3, 2.4, 0, 8, Math.round(h * 1.3)); chimney(lot, 3.0, 2.9, 0, 8, Math.round(h * 1.1));
      break;
    }
    case 0xcb: {   // 核电：主楼 + 穹顶反应堆 + 2 冷却塔
      const box = mainBox(c, 0.4, 2.0, 2.0, 3.6, h); parapet(c, box, 1);
      isoBox(lot, 2.4, 2.4, 3.6, 3.6, Math.round(h * 0.5), Ramp.Neutral, 5);
      dome(lot, 3.0, 3.0, Math.round(h * 0.5), 30, 24, Ramp.Neutral, 5);
      for (const [u, v] of [[1.0, 0.9], [2.6, 0.9]] as const) {
        const [x, y] = lotPt(lot, u, v); const th = pxs(70), bw = pxs(40), tw = pxs(28);
        fillLot(lot, [u, v, 0, u, v, 0, u, v, 0], 0);
        const poly = [x - bw / 2, y, x + bw / 2, y, x + tw / 2, y - th, x - tw / 2, y - th];
        fillPolyIdx(lot, poly, ci(Ramp.Neutral, 5)); fillPolyIdx(lot, [x - bw / 2, y, x - bw / 2 + bw * 0.35, y, x - tw / 2 + tw * 0.35, y - th, x - tw / 2, y - th], ci(Ramp.Neutral, 6)); fillPolyIdx(lot, [x + bw / 2 - bw * 0.3, y, x + bw / 2, y, x + tw / 2, y - th, x + tw / 2 - tw * 0.3, y - th], ci(Ramp.Neutral, 3));
        fillEllipse(lot.bmp, x, y - th, tw / 2, Math.max(1, tw / 4), ci(Ramp.Neutral, 2)); fillHalfEllipse(lot.bmp, x, y, bw / 2, Math.max(1, bw / 4), ci(Ramp.Neutral, 4), 'bottom');
        if (sp.scale !== 'S') fillEllipse(lot.bmp, x - tw * 0.1, y - th - pxs(6), tw * 0.5, pxs(5), IDX.SmokeBase + 6);
      }
      break;
    }
    case 0xcc: {   // 太阳能：面板阵列 + 角落机房
      for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) {
        const u = 0.3 + col * 0.85, v = 0.3 + row * 0.55;
        fillLot(lot, [u, v, pxs(3), u + 0.65, v, pxs(3), u + 0.65, v + 0.35, pxs(8), u, v + 0.35, pxs(8)], ci(Ramp.Glass, 6));
        fillLot(lot, [u, v, 0, u + 0.65, v, 0, u + 0.65, v, pxs(3), u, v, pxs(3)], ci(Ramp.Glass, 3));
        if (sp.scale === 'L') lotLine(lot, u, v + 0.17, pxs(5.5), u + 0.65, v + 0.17, pxs(5.5), ci(Ramp.Glass, 4));
      }
      const box = mainBox(c, 3.0, 3.0, 3.8, 3.8, pxs(14), Ramp.Neutral, 5); parapet(c, box, 0);
      break;
    }
    case 0xcd: {   // 微波：中央接收碟 + 四角立柱 + 机房
      const box = mainBox(c, 0.3, 2.9, 1.3, 3.7, pxs(16), Ramp.Neutral, 4); parapet(c, box, 1);
      for (const [u, v] of [[1.0, 1.0], [3.0, 1.0], [1.0, 3.0], [3.0, 3.0]] as const) isoBox(lot, u - 0.1, v - 0.1, u + 0.1, v + 0.1, h, Ramp.Neutral, 4);
      const [x, y] = lotPt(lot, 2.0, 2.0, h * 0.8);
      fillEllipse(lot.bmp, x, y, pxs(60), pxs(24), ci(Ramp.Glass, 5)); fillEllipse(lot.bmp, x - pxs(8), y - pxs(3), pxs(40), pxs(14), ci(Ramp.Glass, 6)); strokeEllipse(lot.bmp, x, y, pxs(60), pxs(24), ci(Ramp.Neutral, 2));
      fillEllipse(lot.bmp, x, y, pxs(5), pxs(2.5), ci(Ramp.Signal, 5));
      break;
    }
    case 0xce: {   // 聚变：环形主体 + 穹顶 + 发光环
      const ring = Math.round(h * 0.55);
      cylinder(lot, 2.0, 2.0, 0, 90, ring, Ramp.Violet, 3);
      const [x, y] = lotPt(lot, 2.0, 2.0, ring);
      fillEllipse(lot.bmp, x, y, pxs(25), pxs(12.5), ci(Ramp.Violet, 1));
      strokeEllipse(lot.bmp, x, y, pxs(36), pxs(18), ci(Ramp.Violet, 6));
      isoBox(lot, 1.6, 1.6, 2.4, 2.4, Math.round(h * 0.75), Ramp.Violet, 3, { z0: 0 });
      dome(lot, 2.0, 2.0, Math.round(h * 0.75), 20, 14, Ramp.Violet, 4);
      const box = mainBox(c, 0.2, 2.9, 1.2, 3.8, pxs(16)); parapet(c, box, 1);
      break;
    }
    case 0xcf: {   // 燃煤：主楼 + 4 高烟囱 + 煤堆 + 输送带
      const box = mainBox(c, 1.5, 0.3, 3.7, 2.0, h); parapet(c, box, 1);
      for (let k = 0; k < 4; k++) chimney(lot, 1.9 + k * 0.5, 0.6, h, 8, Math.round(h * 1.2));
      const [cx, cy] = lotPt(lot, 1.0, 2.8); fillHalfEllipse(lot.bmp, cx, cy, pxs(34), pxs(14), ci(Ramp.Neutral, 1), 'top'); fillHalfEllipse(lot.bmp, cx - pxs(6), cy, pxs(20), pxs(9), ci(Ramp.Neutral, 2), 'top');
      lotLine(lot, 1.0, 2.6, pxs(14), 2.2, 1.9, h * 0.8, ci(Ramp.Rust, 3), pxs(2));
      isoBox(lot, 0.3, 0.3, 1.2, 1.2, Math.round(h * 0.4), Ramp.WarmGray, 2);
      break;
    }
    case 0xd0: {   // 市政厅：穹顶 + 6 柱 + 台阶 + 树
      const box = mainBox(c, 0.5, 0.5, 2.6, 2.4, h); parapet(c, box, 0);
      isoBox(lot, 1.1, 1.0, 2.0, 1.9, Math.round(h * 0.3), Ramp.Neutral, 6, { z0: h }); dome(lot, 1.55, 1.45, Math.round(h * 1.3), 18, 16, Ramp.Teal, 4);
      columns(lot, box, 'left', 6, ci(Ramp.Neutral, 7)); steps(lot, box, 'left', 3, ci(Ramp.Neutral, 5));
      scatterTrees(lot, 0.1, 2.5, 2.9, 2.95, 2, c.seed, 0.9); flag(lot, 2.5, 0.6, h, 14, ci(Ramp.Signal, 5));
      break;
    }
    case 0xd1: {   // 医院：主楼 + 直升机坪 + 红十字
      const box = mainBox(c, 0.4, 0.4, 2.6, 2.3, h); parapet(c, box, 1);
      const [hx, hy] = lotPt(lot, 1.5, 1.35, h); fillEllipse(lot.bmp, hx, hy, pxs(12), pxs(6), ci(Ramp.Neutral, 6)); if (sp.scale !== 'S') { line(lot.bmp, Math.round(hx) - pxs(3), Math.round(hy) - pxs(2), Math.round(hx) - pxs(3), Math.round(hy) + pxs(2), ci(Ramp.Neutral, 2)); line(lot.bmp, Math.round(hx) + pxs(3), Math.round(hy) - pxs(2), Math.round(hx) + pxs(3), Math.round(hy) + pxs(2), ci(Ramp.Neutral, 2)); line(lot.bmp, Math.round(hx) - pxs(3), Math.round(hy), Math.round(hx) + pxs(3), Math.round(hy), ci(Ramp.Neutral, 2)); }
      const [cx, cy] = lotPt(lot, 1.5, 2.3, h * 0.6); fillRect(lot.bmp, Math.round(cx) - pxs(1), Math.round(cy) - pxs(4), pxs(2), pxs(8), ci(Ramp.Signal, 5)); fillRect(lot.bmp, Math.round(cx) - pxs(4), Math.round(cy) - pxs(1), pxs(8), pxs(2), ci(Ramp.Signal, 5));
      parkingLot(lot, 0.4, 2.4, 2.9, 2.95, c.seed, 2, 'u');
      break;
    }
    case 0xd2: {   // 警察局：基座 + 玻璃上层 + 天线 + 条带 + 停车场
      const hb = Math.round(h * 0.4);
      const base = mainBox(c, 0.4, 0.4, 2.1, 2.1, hb, Ramp.WarmGray, 4); parapet(c, base, 0);
      isoBox(lot, 0.7, 0.7, 1.8, 1.8, h - hb, Ramp.Glass, 3, { z0: hb }); windows(lot, { u0: 0.7, v0: 0.7, u1: 1.8, v1: 1.8, z0: hb, h: h - hb, ramp: Ramp.Glass, i0: 3, leftW: 1.1 * sp.W / 2, rightW: 1.1 * sp.W / 2 }, { seed: c.seed, lit: LIT, dark: ci(Ramp.Glass, 3) });
      lotLine(lot, 0.4, 2.1, hb * 0.5, 2.1, 2.1, hb * 0.5, ci(Ramp.Water, 5), pxs(2)); antenna(lot, 1.25, 1.25, h, 18);
      parkingLot(lot, 2.2, 0.3, 2.9, 2.9, c.seed, 3, 'v');
      break;
    }
    case 0xd3: {   // 消防局：3 红门 + 训练塔
      const box = mainBox(c, 0.4, 0.5, 2.4, 2.5, h, Ramp.Brick, 4, false); windows(lot, box, { seed: c.seed, rows: 1, marginTop: pxs(4), faces: 'right' }); parapet(c, box, 0);
      for (let k = 0; k < 3; k++) door(lot, box, 'left', (k + 0.5) / 3, 10, 10, ci(Ramp.Signal, 4));
      isoBox(lot, 2.5, 0.4, 2.9, 0.8, Math.round(h * 1.3), Ramp.Brick, 4); fillLotRect(lot, 2.5, 0.4, 2.9, 0.8, ci(Ramp.Neutral, 5), Math.round(h * 1.3));
      parkingLot(lot, 0.3, 2.6, 2.9, 2.95, c.seed, 1, 'u');
      break;
    }
    case 0xd4: {   // 博物馆：四坡顶 + 8 柱 + 台阶 + 雕塑
      const box = mainBox(c, 0.4, 0.4, 2.6, 2.4, h, Ramp.Sand, 6, false); windows(lot, box, { seed: c.seed, rows: 1, marginTop: Math.round(h * 0.3), faces: 'right' });
      roofHip(lot, box, Math.round(h * 0.4), Ramp.Rust, 3, 0.3);
      columns(lot, box, 'left', 8, ci(Ramp.Neutral, 7)); steps(lot, box, 'left', 3, ci(Ramp.Neutral, 5));
      const [sx, sy] = lotPt(lot, 2.8, 2.8); fillRect(lot.bmp, Math.round(sx) - pxs(2), Math.round(sy) - pxs(8), pxs(4), pxs(8), ci(Ramp.Neutral, 6));
      break;
    }
    case 0xd5: {   // 大公园：环形小径 + 池 + 7 树 + 长椅
      const [cx, cy] = lotPt(lot, 1.5, 1.5);
      strokeEllipse(lot.bmp, cx, cy, pxs(44), pxs(22), ci(Ramp.Sand, 6)); if (sp.scale !== 'S') strokeEllipse(lot.bmp, cx, cy, pxs(42), pxs(21), ci(Ramp.Sand, 6));
      fillEllipse(lot.bmp, cx, cy, pxs(20), pxs(10), ci(Ramp.Water, 5)); fillEllipse(lot.bmp, cx - pxs(4), cy - pxs(2), pxs(10), pxs(4), ci(Ramp.Water, 6));
      lotLine(lot, 1.5, 0, 0, 1.5, 0.8, 0, ci(Ramp.Sand, 6), sp.lw); lotLine(lot, 0, 1.5, 0, 0.8, 1.5, 0, ci(Ramp.Sand, 6), sp.lw);
      scatterTrees(lot, 0.15, 0.15, 1.1, 1.1, 2, c.seed, 1.0); scatterTrees(lot, 1.9, 0.15, 2.85, 1.1, 2, c.seed + 1, 1.0); scatterTrees(lot, 0.15, 1.9, 1.1, 2.85, 2, c.seed + 2, 1.0); scatterTrees(lot, 1.9, 1.9, 2.85, 2.85, 1, c.seed + 3, 1.1);
      for (const [u, v] of [[2.2, 1.3], [1.3, 2.2]] as const) { const [bx, by] = lotPt(lot, u, v); fillRect(lot.bmp, Math.round(bx), Math.round(by) - pxs(2), pxs(4), pxs(2), ci(Ramp.Rust, 2)); }
      break;
    }
    case 0xd6: {   // 学校：L 形主体 + 操场
      const a = mainBox(c, 0.3, 0.3, 1.5, 2.6, h, Ramp.Brick, 4); parapet(c, a, 1);
      const b = mainBox(c, 1.5, 0.3, 2.7, 1.1, h, Ramp.Brick, 4); parapet(c, b, 0);
      fillLotRect(lot, 1.6, 1.3, 2.9, 2.9, ci(Ramp.Sand, 5));
      const [cx, cy] = lotPt(lot, 2.25, 2.1); strokeEllipse(lot.bmp, cx, cy, pxs(18), pxs(9), ci(Ramp.Neutral, 7));
      flag(lot, 2.8, 1.2, 0, 16, ci(Ramp.Water, 5));
      break;
    }
    case 0xd7: {   // 体育场：椭圆看台 + 场地 + 4 灯塔
      const [cx, cy] = lotPt(lot, 2.0, 2.0);
      const H = Math.round(h * 0.6);
      for (let k = 4; k >= 1; k--) { const f = k / 4; fillEllipse(lot.bmp, cx, cy - H * (1 - f) * 0.9, pxs(120) * (0.72 + 0.28 * f), pxs(60) * (0.72 + 0.28 * f), ci(Ramp.Neutral, 2 + k)); }
      fillEllipse(lot.bmp, cx, cy - H * 0.65, pxs(84), pxs(42), ci(Ramp.Neutral, 3));
      fillEllipse(lot.bmp, cx, cy - H * 0.65 + pxs(4), pxs(78), pxs(39), ci(Ramp.Grass, 5));
      if (sp.scale !== 'S') { strokeEllipse(lot.bmp, cx, cy - H * 0.65 + pxs(4), pxs(70), pxs(35), ci(Ramp.Neutral, 7)); fillRect(lot.bmp, Math.round(cx) - pxs(1), Math.round(cy - H * 0.65 + pxs(4)) - pxs(30), pxs(2), pxs(60), ci(Ramp.Neutral, 7)); }
      for (const [u, v] of [[0.4, 0.4], [3.6, 0.4], [0.4, 3.6], [3.6, 3.6]] as const) { const [x, y] = lotPt(lot, u, v); fillRect(lot.bmp, Math.round(x) - 1, Math.round(y) - pxs(80), Math.max(1, pxs(2)), pxs(80), ci(Ramp.Neutral, 4)); fillRect(lot.bmp, Math.round(x) - pxs(4), Math.round(y) - pxs(80) - pxs(3), pxs(8), pxs(3), ci(Ramp.Amber, 7)); }
      break;
    }
    case 0xd8: {   // 监狱：双重围墙 + 4 岗楼 + 2 栋 H 形牢房
      fence(lot, 0.12, 0.12, 3.88, 3.88, ci(Ramp.Neutral, 5), 6); fence(lot, 0.38, 0.38, 3.62, 3.62, ci(Ramp.Neutral, 5), 6);
      for (const [u, v] of [[0.12, 0.12], [3.88, 0.12], [0.12, 3.88], [3.88, 3.88]] as const) isoBox(lot, u - 0.15, v - 0.15, u + 0.15, v + 0.15, pxs(36), Ramp.WarmGray, 4);
      for (const off of [0.7, 2.2]) { const a = mainBox(c, off, 0.9, off + 0.4, 3.1, h); parapet(c, a, 0); const b = mainBox(c, off + 0.4, 1.7, off + 1.0, 2.3, h); parapet(c, b, 0); const d = mainBox(c, off + 1.0, 0.9, off + 1.4, 3.1, h); parapet(c, d, 0); }
      break;
    }
    case 0xd9: {   // 大学：三栋围合 + 钟塔 + 中庭
      const a = mainBox(c, 0.3, 0.3, 3.7, 1.2, h, Ramp.Brick, 5, false); windows(lot, a, { seed: c.seed }); roofGable(lot, a, Math.round(h * 0.3), Ramp.Rust, 3, 'u');
      const b = mainBox(c, 0.3, 1.2, 1.2, 3.7, h, Ramp.Brick, 5, false); windows(lot, b, { seed: c.seed + 1 }); roofGable(lot, b, Math.round(h * 0.3), Ramp.Rust, 3, 'v');
      const d = mainBox(c, 2.8, 1.2, 3.7, 3.7, h, Ramp.Brick, 5, false); windows(lot, d, { seed: c.seed + 2 }); roofGable(lot, d, Math.round(h * 0.3), Ramp.Rust, 3, 'v');
      isoBox(lot, 1.7, 0.4, 2.3, 1.0, Math.round(h * 1.5), Ramp.Brick, 5); isoBox(lot, 1.8, 0.5, 2.2, 0.9, Math.round(h * 0.25), Ramp.Neutral, 6, { z0: Math.round(h * 1.5) });
      const [kx, ky] = lotPt(lot, 2.3, 1.0, h * 1.3); fillEllipse(lot.bmp, kx - pxs(3), ky, pxs(3), pxs(3), ci(Ramp.Neutral, 7));
      lotLine(lot, 2.0, 1.3, 0, 2.0, 3.6, 0, ci(Ramp.Sand, 6), sp.lw); lotLine(lot, 1.3, 2.4, 0, 2.7, 2.4, 0, ci(Ramp.Sand, 6), sp.lw);
      scatterTrees(lot, 1.4, 1.4, 2.6, 3.5, 4, c.seed, 0.9);
      break;
    }
    case 0xda: {   // 动物园：围栏区 + 动物点 + 水池 + 入口拱门
      const pens: ReadonlyArray<readonly [number, number, number, number]> = [[0.3, 0.3, 1.5, 1.4], [1.8, 0.3, 3.6, 1.2], [0.3, 1.7, 1.3, 2.9], [1.6, 1.5, 2.6, 2.6], [2.9, 1.5, 3.7, 2.7], [0.5, 3.1, 2.2, 3.8]];
      pens.forEach(([u0, v0, u1, v1], k) => { fillLotRect(lot, u0, v0, u1, v1, k % 2 ? ci(Ramp.Sand, 4) : ci(Ramp.Grass, 4)); fence(lot, u0, v0, u1, v1, ci(Ramp.Rust, 2), 3); const [ax, ay] = lotPt(lot, (u0 + u1) / 2, (v0 + v1) / 2); fillRect(lot.bmp, Math.round(ax) - pxs(1), Math.round(ay) - pxs(2), pxs(3), pxs(2), [ci(Ramp.Earth, 2), ci(Ramp.Neutral, 7), ci(Ramp.Amber, 5), ci(Ramp.Neutral, 1), ci(Ramp.Rust, 4), ci(Ramp.Olive, 4)][k]!); });
      fillLotRect(lot, 2.7, 2.9, 3.7, 3.7, ci(Ramp.Water, 5));
      const [gx, gy] = lotPt(lot, 3.75, 3.2); fillRect(lot.bmp, Math.round(gx) - pxs(5), Math.round(gy) - pxs(12), pxs(2), pxs(12), ci(Ramp.Rust, 4)); fillRect(lot.bmp, Math.round(gx) + pxs(3), Math.round(gy) - pxs(12), pxs(2), pxs(12), ci(Ramp.Rust, 4)); fillRect(lot.bmp, Math.round(gx) - pxs(5), Math.round(gy) - pxs(14), pxs(10), pxs(3), ci(Ramp.Amber, 6));
      scatterTrees(lot, 1.4, 2.8, 2.5, 3.8, 2, c.seed, 0.8);
      break;
    }
    case 0xdb: {   // 雕像：基座 + 立像
      const base = isoBox(lot, 0.3, 0.3, 0.7, 0.7, pxs(10), Ramp.Neutral, 6); void base;
      const [x, y] = lotPt(lot, 0.5, 0.5, pxs(10));
      const fh = h - pxs(10);
      fillRect(lot.bmp, Math.round(x) - pxs(3), Math.round(y) - fh, pxs(6), fh, ci(Ramp.Neutral, 3));
      fillEllipse(lot.bmp, x, y - fh - pxs(2), pxs(4), pxs(4), ci(Ramp.Neutral, 3));
      fillRect(lot.bmp, Math.round(x) + pxs(3), Math.round(y) - fh - pxs(6), pxs(2), pxs(10), ci(Ramp.Amber, 6));
      scatterTrees(lot, 0.05, 0.7, 0.3, 0.95, 1, c.seed, 0.7);
      break;
    }
    case 0xdc: {   // 水泵：泵房 + 进水管
      const box = mainBox(c, 0.3, 0.3, 0.7, 0.7, h, Ramp.Water, 4, false); parapet(c, box, 0);
      lotLine(lot, 0.7, 0.5, pxs(4), 1.0, 0.5, pxs(3), ci(Ramp.Teal, 3), pxs(3)); lotLine(lot, 0.5, 0.7, pxs(4), 0.5, 1.0, pxs(3), ci(Ramp.Teal, 3), pxs(3));
      cylinder(lot, 0.5, 0.5, h, 10, pxs(6), Ramp.Teal, 4);
      break;
    }
    case 0xdd: case 0xde: {   // 跑道（L–R 轴）/ 十字
      const hw = 56 / 128;
      fillLotRect(lot, 0, 0.5 - hw, 1, 0.5 + hw, ci(Ramp.Asphalt, 2));
      if (id === 0xde) fillLotRect(lot, 0.5 - hw, 0, 0.5 + hw, 1, ci(Ramp.Asphalt, 2));
      if (sp.scale !== 'S') { for (let t = 0.05; t < 1; t += 0.25) lotLine(lot, t, 0.5, 0, t + 0.12, 0.5, 0, ci(Ramp.Neutral, 7)); if (id === 0xde) for (let t = 0.05; t < 1; t += 0.25) lotLine(lot, 0.5, t, 0, 0.5, t + 0.12, 0, ci(Ramp.Neutral, 7)); lotLine(lot, 0, 0.5 - hw, 0, 1, 0.5 - hw, 0, ci(Ramp.Neutral, 6)); lotLine(lot, 0, 0.5 + hw, 0, 1, 0.5 + hw, 0, ci(Ramp.Neutral, 6)); }
      break;
    }
    case 0xdf: {   // 栈桥（L–R 轴）：木板带 + 桩
      const hw = 20 / 128;
      const zt = pxs(4);
      fillLot(lot, [0, 0.5 + hw, 0, 1, 0.5 + hw, 0, 1, 0.5 + hw, zt, 0, 0.5 + hw, zt], ci(Ramp.Rust, 2));
      fillLotRect(lot, 0, 0.5 - hw, 1, 0.5 + hw, ci(Ramp.Rust, 4), zt);
      if (sp.scale !== 'S') for (let t = 0.1; t < 1; t += 0.125) { lotLine(lot, t, 0.5 - hw, zt, t, 0.5 + hw, zt, ci(Ramp.Rust, 3)); lotLine(lot, t, 0.5 + hw, 0, t, 0.5 + hw, -pxs(3), ci(Ramp.Earth, 1)); }
      break;
    }
    case 0xe0: {   // 起重机：龙门架 + 吊臂 + 集装箱
      const legs = ci(Ramp.Amber, 5);
      for (const [u, v] of [[0.2, 0.3], [0.2, 0.7], [0.8, 0.3], [0.8, 0.7]] as const) lotLine(lot, u, v, 0, u, v, h, legs, pxs(2));
      lotLine(lot, 0.2, 0.3, h, 0.8, 0.3, h, legs, pxs(3)); lotLine(lot, 0.2, 0.7, h, 0.8, 0.7, h, legs, pxs(3)); lotLine(lot, 0.5, 0.7, h, 0.5, 1.25, h + pxs(10), ci(Ramp.Amber, 6));
      for (let k = 0; k < 3; k++) isoBox(lot, 0.3 + k * 0.15, 0.4, 0.42 + k * 0.15, 0.6, pxs(6), Ramp.Neutral, 1 + (k & 1) * 2, { outline: false, top: misc(k === 0 ? 3 : 1, k === 1 ? 2 : 1, k === 2 ? 3 : 0) });
      break;
    }
    case 0xe1: case 0xe2: {   // 塔台
      const ramp = id === 0xe1 ? Ramp.Neutral : Ramp.Olive;
      const box = mainBox(c, 0.3, 0.3, 0.7, 0.7, pxs(12), ramp, r.i0, false); parapet(c, box, 0);
      const [x, y] = lotPt(lot, 0.5, 0.5, pxs(12));
      fillRect(lot.bmp, Math.round(x) - pxs(4), Math.round(y) - h, pxs(8), h, ci(ramp, r.i0 - 1)); fillRect(lot.bmp, Math.round(x) - pxs(4), Math.round(y) - h, pxs(3), h, ci(ramp, r.i0 + 1));
      fillEllipse(lot.bmp, x, y - h, pxs(10), pxs(5), ci(Ramp.Glass, 5)); fillRect(lot.bmp, Math.round(x) - pxs(10), Math.round(y) - h - pxs(6), pxs(20), pxs(6), ci(Ramp.Glass, 5)); fillEllipse(lot.bmp, x, y - h - pxs(6), pxs(10), pxs(5), ci(ramp, r.i0 + 2));
      if (id === 0xe1) antenna(lot, 0.5, 0.5, h + pxs(8), 8); else { fillRect(lot.bmp, Math.round(x) - pxs(6), Math.round(y) - h - pxs(9), pxs(12), pxs(2), ci(Ramp.Neutral, 6)); }
      break;
    }
    case 0xe3: case 0xe8: case 0xf6: {   // 拱形库 / 机库
      const ramp = id === 0xe3 ? Ramp.Olive : Ramp.Neutral;
      const box = mainBox(c, m, m, n - m, n - m, Math.round(h * 0.7), ramp, r.i0, false);
      roofBarrel(lot, box, Math.round(h * 0.4), ramp, r.i0, 'u');
      if (id === 0xe3) door(lot, box, 'left', 0.5, 10, 8, ci(Ramp.Neutral, 4)); else fillLot(lot, [n - m, m, 0, n - m, n - m, 0, n - m, n - m, h * 0.6, n - m, m, h * 0.6], ci(Ramp.Neutral, 2));
      break;
    }
    case 0xe4: case 0xe5: {   // 机场建筑：玻璃带 + 廊桥
      const box = mainBox(c, 0.1, 0.1, 0.9, 0.9, h, Ramp.Glass, 4, false); parapet(c, box, 1);
      fillLot(lot, [0.1, 0.9, h * 0.35, 0.9, 0.9, h * 0.35, 0.9, 0.9, h * 0.65, 0.1, 0.9, h * 0.65], ci(Ramp.Glass, 6));
      if (id === 0xe5) { lotLine(lot, 0.9, 0.5, h * 0.4, 1.0, 0.5, h * 0.35, ci(Ramp.Amber, 5), pxs(3)); }
      break;
    }
    case 0xe6: {   // 停机坪：T 形线
      if (sp.scale !== 'S') { lotLine(lot, 0.2, 0.5, 0, 0.8, 0.5, 0, ci(Ramp.Neutral, 7)); lotLine(lot, 0.5, 0.2, 0, 0.5, 0.5, 0, ci(Ramp.Neutral, 7)); }
      break;
    }
    case 0xe7: {   // 战机：三角翼剪影
      fillLot(lot, [0.5, 0.15, pxs(2), 0.85, 0.75, pxs(2), 0.5, 0.6, pxs(2), 0.15, 0.75, pxs(2)], ci(Ramp.Olive, 5));
      fillLot(lot, [0.47, 0.2, pxs(2), 0.53, 0.2, pxs(2), 0.53, 0.8, pxs(2), 0.47, 0.8, pxs(2)], ci(Ramp.Olive, 6));
      if (sp.scale !== 'S') { const [x, y] = lotPt(lot, 0.5, 0.35, pxs(3)); setPx(lot.bmp, Math.round(x), Math.round(y), ci(Ramp.Glass, 6)); }
      break;
    }
    case 0xe9: {   // 地铁站：入口棚 + 台阶 + 标志牌
      const box = mainBox(c, 0.3, 0.2, 0.8, 0.5, h, Ramp.WarmGray, 5, false); parapet(c, box, 0);
      fillLotRect(lot, 0.35, 0.55, 0.75, 0.85, ci(Ramp.Neutral, 2));
      if (sp.scale !== 'S') for (const t of [0.6, 0.68, 0.76]) lotLine(lot, 0.35, t, 0, 0.75, t, 0, ci(Ramp.Neutral, 4));
      const [x, y] = lotPt(lot, 0.85, 0.85); fillRect(lot.bmp, Math.round(x), Math.round(y) - pxs(14), 1, pxs(14), ci(Ramp.Neutral, 2)); fillRect(lot.bmp, Math.round(x) - pxs(3), Math.round(y) - pxs(14), pxs(7), pxs(5), ci(Ramp.Water, 5));
      break;
    }
    case 0xea: {   // 雷达
      const box = mainBox(c, 0.3, 0.3, 0.7, 0.7, h, Ramp.Olive, 4, false); parapet(c, box, 0);
      const [x, y] = lotPt(lot, 0.5, 0.5, h);
      fillRect(lot.bmp, Math.round(x) - 1, Math.round(y) - pxs(10), Math.max(1, pxs(2)), pxs(10), ci(Ramp.Neutral, 4));
      fillEllipse(lot.bmp, x, y - pxs(12), pxs(10), pxs(4), ci(Ramp.Neutral, 6)); fillEllipse(lot.bmp, x - pxs(2), y - pxs(13), pxs(6), pxs(2), ci(Ramp.Neutral, 7));
      break;
    }
    case 0xeb: {   // 水塔：4 腿 + 圆柱罐
      const legIdx = ci(Ramp.Neutral, 4);
      const zt = Math.round(h * 0.55);
      for (const [u, v] of [[0.6, 0.6], [1.4, 0.6], [0.6, 1.4], [1.4, 1.4]] as const) lotLine(lot, u, v, 0, u * 0.5 + 0.5, v * 0.5 + 0.5, zt, legIdx, pxs(1.5));
      lotLine(lot, 0.6, 0.6, zt * 0.5, 1.4, 1.4, zt * 0.5, legIdx); lotLine(lot, 1.4, 0.6, zt * 0.5, 0.6, 1.4, zt * 0.5, legIdx);
      cylinder(lot, 1.0, 1.0, zt, 36, Math.round(h * 0.4), Ramp.Neutral, 6);
      const [x, y] = lotPt(lot, 1.0, 1.0, zt + h * 0.2); fillRect(lot.bmp, Math.round(x) - pxs(18), Math.round(y) - pxs(2), pxs(36), pxs(4), ci(Ramp.Water, 6));
      dome(lot, 1.0, 1.0, zt + Math.round(h * 0.4), 18, 8, Ramp.Neutral, 5);
      break;
    }
    case 0xec: {   // 公交总站：车库占一半 + 停车场 + 3 辆巴士
      const box = mainBox(c, 0.15, 0.15, 1.85, 0.9, h, Ramp.Amber, 4, false); windows(lot, box, { seed: c.seed, rows: 1, faces: 'right' }); parapet(c, box, 1);
      for (let k = 0; k < 3; k++) door(lot, box, 'left', (k + 0.5) / 3, 12, 10, ci(Ramp.Neutral, 2));
      fillLotRect(lot, 0.1, 1.0, 1.9, 1.95, ci(Ramp.Asphalt, 3)); lotLine(lot, 1.0, 1.0, 0, 1.0, 2.0, 0, ci(Ramp.Neutral, 5), pxs(2));
      for (let k = 0; k < 3; k++) { const u = 0.25 + k * 0.5; fillLot(lot, [u, 1.2, 0, u + 0.4, 1.2, 0, u + 0.4, 1.4, 0, u, 1.4, 0], ci(Ramp.Amber, 6)); fillLot(lot, [u, 1.2, 0, u + 0.4, 1.2, 0, u + 0.4, 1.4, 0, u, 1.4, 0], ci(Ramp.Amber, 6)); isoBox(lot, u, 1.2, u + 0.4, 1.4, pxs(6), Ramp.Amber, 5, { outline: false }); }
      break;
    }
    case 0xed: {   // 火车站：站房 + 站台 + 轨道 + 雨棚
      const box = mainBox(c, 0.2, 0.2, 1.8, 0.95, h, Ramp.Brick, 4, false); windows(lot, box, { seed: c.seed, rows: 1 }); roofGable(lot, box, Math.round(h * 0.4), Ramp.Asphalt, 3, 'u');
      isoBox(lot, 0.1, 1.05, 1.9, 1.35, pxs(3), Ramp.Neutral, 6, { outline: false });
      fillLotRect(lot, 0, 1.4, 2, 1.95, ci(Ramp.Sand, 3));
      for (let t = 0.05; t < 2; t += 0.125) fillLotRect(lot, t, 1.5, t + 0.05, 1.85, ci(Ramp.Rust, 2));
      lotLine(lot, 0, 1.58, 0, 2, 1.58, 0, ci(Ramp.Neutral, 6)); lotLine(lot, 0, 1.77, 0, 2, 1.77, 0, ci(Ramp.Neutral, 6));
      for (const u of [0.3, 1.0, 1.7]) lotLine(lot, u, 1.2, pxs(3), u, 1.2, pxs(16), ci(Ramp.Neutral, 5));
      isoBox(lot, 0.15, 1.05, 1.85, 1.35, pxs(2), Ramp.WarmGray, 5, { z0: pxs(16), outline: false });
      break;
    }
    case 0xf0: {   // 装卸区：低库房 + 装卸门 + 卡车
      const box = mainBox(c, 0.15, 0.15, 1.85, 1.15, h, Ramp.Rust, 4, false); parapet(c, box, 1);
      for (let k = 0; k < 4; k++) door(lot, box, 'left', (k + 0.5) / 4, 8, 6, ci(Ramp.Neutral, 2));
      for (let k = 0; k < 3; k++) { const u = 0.3 + k * 0.5; isoBox(lot, u, 1.3, u + 0.3, 1.5, pxs(6), Ramp.Neutral, 6, { outline: false }); isoBox(lot, u + 0.3, 1.3, u + 0.4, 1.5, pxs(5), Ramp.Signal, 4, { outline: false }); }
      break;
    }
    case 0xf1: {   // 绝密：无窗盒 + 双围栏 + 警示灯 + 小雷达
      fence(lot, 0.06, 0.06, 1.94, 1.94, ci(Ramp.Neutral, 5), 4); fence(lot, 0.2, 0.2, 1.8, 1.8, ci(Ramp.Neutral, 5), 4);
      const box = mainBox(c, 0.5, 0.5, 1.5, 1.5, h, Ramp.Olive, 3, false); parapet(c, box, 0);
      antenna(lot, 0.55, 0.55, h, 8, ci(Ramp.Signal, 6)); antenna(lot, 1.45, 1.45, h, 8, ci(Ramp.Signal, 6));
      const [x, y] = lotPt(lot, 1.0, 1.0, h); fillEllipse(lot.bmp, x, y - pxs(4), pxs(6), pxs(2.5), ci(Ramp.Neutral, 6));
      break;
    }
    case 0xf2: {   // 货场：集装箱堆 + 跨运车
      const cols = [misc(3, 1, 0), misc(0, 1, 3), misc(2, 3, 1), misc(3, 3, 0), misc(3, 0, 0), misc(1, 2, 3)];
      let k = 0;
      for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) { const u = 0.2 + col * 0.28, v = 0.25 + row * 0.42; const layers = 1 + ((hashNoise(id, k, 1) * 3) | 0); for (let l = 0; l < layers; l++) isoBox(lot, u, v, u + 0.24, v + 0.16, pxs(4), Ramp.Neutral, 3, { z0: l * pxs(4), outline: false, top: cols[(k + l) % 6]!, left: cols[(k + l + 2) % 6]!, right: ci(Ramp.Neutral, 2) }); k++; }
      for (const [u, v] of [[1.55, 1.75], [1.85, 1.75], [1.55, 1.95], [1.85, 1.95]] as const) lotLine(lot, u, v, 0, u, v, pxs(14), ci(Ramp.Amber, 5), pxs(2));
      lotLine(lot, 1.5, 1.85, pxs(14), 1.9, 1.85, pxs(14), ci(Ramp.Amber, 5), pxs(3));
      break;
    }
    case 0xf3: {   // 市长官邸：草坪 + 环形车道 + 四坡顶 + 门廊 + 泳池 + 树
      groundDiamond(lot, ci(Ramp.Grass, 6));
      const [cx, cy] = lotPt(lot, 1.0, 1.55); strokeEllipse(lot.bmp, cx, cy, pxs(26), pxs(13), ci(Ramp.Sand, 6)); if (sp.scale !== 'S') strokeEllipse(lot.bmp, cx, cy, pxs(24), pxs(12), ci(Ramp.Sand, 6));
      const box = mainBox(c, 0.35, 0.3, 1.5, 1.1, h, Ramp.Neutral, 6, false); windows(lot, box, { seed: c.seed, rows: 2 }); roofHip(lot, box, Math.round(h * 0.45), Ramp.Brick, 3, 0.25);
      columns(lot, box, 'left', 4, ci(Ramp.Neutral, 7));
      fillLotRect(lot, 1.6, 0.4, 1.9, 0.9, ci(Ramp.Water, 5));
      scatterTrees(lot, 0.05, 1.3, 0.5, 1.95, 2, c.seed, 0.9); scatterTrees(lot, 1.5, 1.3, 1.95, 1.95, 2, c.seed + 1, 0.9);
      break;
    }
    case 0xf4: {   // 净水厂：4 圆形沉淀池 + 机房
      for (const [u, v] of [[0.5, 0.5], [1.4, 0.5], [0.5, 1.4], [1.4, 1.4]] as const) { const [x, y] = lotPt(lot, u, v); fillEllipse(lot.bmp, x, y, pxs(14), pxs(7), ci(Ramp.Teal, 2)); fillEllipse(lot.bmp, x, y, pxs(12), pxs(6), ci(Ramp.Water, 4)); if (sp.scale !== 'S') line(lot.bmp, Math.round(x), Math.round(y), Math.round(x) + pxs(10), Math.round(y) - pxs(3), ci(Ramp.Neutral, 6)); }
      const box = mainBox(c, 1.7, 1.7, 1.97, 1.97, h, Ramp.Teal, 4, false); parapet(c, box, 0);
      break;
    }
    case 0xf5: {   // 图书馆：四坡顶 + 4 柱 + 台阶 + 树
      const box = mainBox(c, 0.3, 0.3, 1.7, 1.5, h, Ramp.Sand, 6, false); windows(lot, box, { seed: c.seed, rows: 1, marginTop: Math.round(h * 0.3), faces: 'right' });
      roofHip(lot, box, Math.round(h * 0.4), Ramp.Teal, 3, 0.3); columns(lot, box, 'left', 4, ci(Ramp.Neutral, 7)); steps(lot, box, 'left', 2, ci(Ramp.Neutral, 5));
      scatterTrees(lot, 0.1, 1.6, 1.9, 1.95, 2, c.seed, 0.9);
      break;
    }
    case 0xf7: {   // 教堂：陡坡顶 + 钟塔 + 尖顶 + 拱窗
      const nave = mainBox(c, 0.6, 0.35, 1.8, 1.1, h, Ramp.Neutral, 7, false);
      windows(lot, nave, { seed: c.seed, rows: 1, marginTop: Math.round(h * 0.3), lit: ci(Ramp.Violet, 5), dark: ci(Ramp.Water, 3), pitchX: sp.scale === 'L' ? 8 : 4 });
      roofGable(lot, nave, Math.round(h * 0.6), Ramp.Asphalt, 3, 'u');
      const th = Math.round(h * 1.6);
      isoBox(lot, 0.25, 0.5, 0.6, 0.85, th, Ramp.Neutral, 7);
      const [tx, ty] = lotPt(lot, 0.425, 0.675, th);
      fillPolyIdx(lot, [tx - pxs(6), ty + pxs(1), tx + pxs(6), ty + pxs(1), tx, ty - pxs(18)], ci(Ramp.Asphalt, 4)); fillPolyIdx(lot, [tx - pxs(6), ty + pxs(1), tx, ty + pxs(1), tx, ty - pxs(18)], ci(Ramp.Asphalt, 5));
      setPx(lot.bmp, Math.round(tx), Math.round(ty) - pxs(19), ci(Ramp.Amber, 7));
      door(lot, nave, 'left', 0.15, 4, 7, ci(Ramp.Earth, 1));
      scatterTrees(lot, 0.1, 1.3, 1.9, 1.9, 2, c.seed, 0.85);
      break;
    }
    case 0xf8: {   // 码头：T 形栈桥 + 小船 + 俱乐部小屋
      fillLotRect(lot, 0, 0, 1, 1, ci(Ramp.Sand, 5));
      const box = mainBox(c, 0.25, 0.25, 0.8, 0.8, pxs(14), Ramp.Rust, 4, false); roofGable(lot, box, pxs(6), Ramp.Teal, 3, 'u');
      const zt = pxs(4);
      fillLotRect(lot, 1.0, 1.35, 2.9, 1.65, ci(Ramp.Rust, 4), zt); fillLotRect(lot, 1.35, 1.0, 1.65, 2.9, ci(Ramp.Rust, 4), zt);
      const boats: ReadonlyArray<readonly [number, number]> = [[1.1, 1.0], [1.6, 0.7], [2.2, 1.0], [1.0, 2.1], [1.9, 2.0], [2.5, 2.1]];
      boats.forEach(([u, v], k) => { fillLot(lot, [u, v, pxs(1), u + 0.3, v, pxs(1), u + 0.3, v + 0.15, pxs(1), u, v + 0.15, pxs(1)], k % 2 ? ci(Ramp.Neutral, 7) : ci(Ramp.Signal, 5)); if (sp.scale !== 'S') { const [x, y] = lotPt(lot, u + 0.15, v + 0.07, pxs(1)); line(lot.bmp, Math.round(x), Math.round(y), Math.round(x), Math.round(y) - pxs(8), ci(Ramp.Neutral, 6)); } });
      break;
    }
    case 0xf9: {   // 导弹井：圆形井盖 + 四角掩体 + 围栏 + 警示灯
      fence(lot, 0.1, 0.1, 2.9, 2.9, ci(Ramp.Neutral, 5), 4);
      const [x, y] = lotPt(lot, 1.5, 1.5); fillEllipse(lot.bmp, x, y, pxs(40), pxs(20), ci(Ramp.Neutral, 4)); fillEllipse(lot.bmp, x, y, pxs(36), pxs(18), ci(Ramp.Olive, 4)); if (sp.scale !== 'S') line(lot.bmp, Math.round(x) - pxs(36), Math.round(y), Math.round(x) + pxs(36), Math.round(y), ci(Ramp.Neutral, 1));
      for (const [u, v] of [[0.4, 0.4], [2.4, 0.4], [0.4, 2.4], [2.4, 2.4]] as const) { isoBox(lot, u - 0.2, v - 0.2, u + 0.2, v + 0.2, pxs(10), Ramp.Olive, 3); antenna(lot, u, v, pxs(10), 6, ci(Ramp.Signal, 6)); }
      break;
    }
    case 0xfa: {   // 淡化厂：3 卧式罐 + 取水管 + 出水口
      for (let k = 0; k < 3; k++) { const b = isoBox(lot, 0.4, 0.4 + k * 0.75, 2.0, 0.9 + k * 0.75, Math.round(h * 0.6), Ramp.Teal, 4); roofBarrel(lot, b, Math.round(h * 0.4), Ramp.Teal, 4, 'u'); }
      const box = mainBox(c, 2.2, 0.4, 2.8, 1.4, h, Ramp.Teal, 3, false); parapet(c, box, 1);
      lotLine(lot, 2.9, 2.0, pxs(3), 2.9, 2.95, pxs(3), ci(Ramp.Teal, 3), pxs(3)); fillLotRect(lot, 2.6, 2.6, 2.9, 2.9, ci(Ramp.Water, 7));
      break;
    }
    case 0xfb: {   // 拱城一：4 段阶梯金字塔 + 信标
      const tiers = 4; let z0 = 0;
      for (let t = 0; t < tiers; t++) { const ins = 0.25 * t + 0.15; const th = Math.round(h / tiers); const b = isoBox(lot, ins, ins, 4 - ins, 4 - ins, th, Ramp.WarmGray, 4, { z0 }); windows(lot, { ...b, z0 }, { seed: c.seed + t, lit: LIT, dark: DARK, rows: 3 }); z0 += th; }
      antenna(lot, 2, 2, z0, 16, ci(Ramp.Signal, 7));
      fillLotRect(lot, 0.15 + 0.75, 0.15 + 0.75, 4 - 0.9, 4 - 0.9, ci(Ramp.Forest, 4), z0);
      break;
    }
    case 0xfc: {   // 拱城二：玻璃半球罩 + 基座
      const bh = Math.round(h * 0.15);
      isoBox(lot, 0.2, 0.2, 3.8, 3.8, bh, Ramp.Neutral, 5);
      const [x, y] = lotPt(lot, 2, 2, bh);
      const rx = pxs(112), ry = Math.min(pxs(112), h - bh);
      fillHalfEllipse(lot.bmp, x, y, rx, ry, ci(Ramp.Forest, 3), 'top');
      for (let k = 0; k < 5; k++) { const f = 1 - k * 0.12; fillHalfEllipse(lot.bmp, x - rx * 0.12 * k, y, rx * f, ry * f, k % 2 ? ci(Ramp.Forest, 4) : ci(Ramp.Glass, 5), 'top'); }
      fillHalfEllipse(lot.bmp, x - rx * 0.3, y - ry * 0.2, rx * 0.22, ry * 0.3, ci(Ramp.Glass, 7), 'top');
      strokeEllipse(lot.bmp, x, y, rx, ry, ci(Ramp.Glass, 3));
      if (sp.scale !== 'S') for (let k = 1; k < 6; k++) line(lot.bmp, Math.round(x - rx + rx * 2 * k / 6), Math.round(y), Math.round(x - rx * 0.6 + rx * 1.2 * k / 6), Math.round(y - ry * 0.95), ci(Ramp.Glass, 3));
      break;
    }
    case 0xfd: {   // 拱城三：3 个错位圆柱 + 脉络
      groundDiamond(lot, ci(Ramp.Violet, 1));
      cylinder(lot, 1.3, 2.7, 0, 50, Math.round(h * 0.58), Ramp.Violet, 2); cylinder(lot, 2.6, 1.6, 0, 40, Math.round(h * 0.79), Ramp.Violet, 2); cylinder(lot, 1.8, 1.2, 0, 30, h, Ramp.Violet, 2);
      if (sp.scale !== 'S') { const [x, y] = lotPt(lot, 1.8, 1.2); for (let k = 0; k < 6; k++) line(lot.bmp, Math.round(x) - pxs(14) + k * pxs(5), Math.round(y) - pxs(4), Math.round(x) - pxs(10) + k * pxs(4), Math.round(y) - h + pxs(6), ci(Ramp.Violet, 4)); }
      const [tx, ty] = lotPt(lot, 1.8, 1.2, h); fillEllipse(lot.bmp, tx, ty, pxs(5), pxs(2.5), ci(Ramp.Violet, 6));
      break;
    }
    case 0xfe: {   // 拱城四：火箭形主塔 + 4 助推柱 + 发射架
      for (const [u, v] of [[1.0, 1.0], [3.0, 1.0], [1.0, 3.0], [3.0, 3.0]] as const) cylinder(lot, u, v, 0, 20, Math.round(h * 0.62), Ramp.Neutral, 4);
      cylinder(lot, 2, 2, 0, 48, Math.round(h * 0.84), Ramp.Neutral, 5);
      const [x, y] = lotPt(lot, 2, 2, Math.round(h * 0.84)); const cw = pxs(24), chh = h - Math.round(h * 0.84);
      fillPolyIdx(lot, [x - cw, y, x + cw, y, x, y - chh], ci(Ramp.Neutral, 5)); fillPolyIdx(lot, [x - cw, y, x, y, x, y - chh], ci(Ramp.Neutral, 6));
      setPx(lot.bmp, Math.round(x), Math.round(y) - chh - 1, ci(Ramp.Signal, 6));
      lotLine(lot, 3.6, 2.0, 0, 3.6, 2.0, h * 0.8, ci(Ramp.Rust, 3), pxs(2)); lotLine(lot, 3.6, 2.0, h * 0.8, 2.4, 2.0, h * 0.8, ci(Ramp.Rust, 3));
      break;
    }
    case 0xff: {   // 大穹顶：条纹穹顶 + 入口拱门 + 4 旗
      const bh = Math.round(h * 0.2);
      cylinder(lot, 2, 2, 0, 120, bh, Ramp.Amber, 4);
      const [x, y] = lotPt(lot, 2, 2, bh); const rx = pxs(60), ry = Math.max(2, h - bh);
      fillHalfEllipse(lot.bmp, x, y, rx, ry, ci(Ramp.Amber, 4), 'top');
      for (let k = 0; k < 12; k++) if (k % 2 === 0) fillPolyIdx(lot, [x, y, x - rx + rx * 2 * k / 12, y, x - rx + rx * 2 * (k + 1) / 12, y, x, y - ry], ci(Ramp.Amber, 6));
      // 用半椭圆重新裁出轮廓
      const b = lot.bmp; const ry2 = ry * ry, rx2 = rx * rx;
      for (let yy = Math.floor(y - ry); yy <= Math.ceil(y); yy++) for (let xx = Math.floor(x - rx); xx <= Math.ceil(x + rx); xx++) { const dx = xx + 0.5 - x, dy = yy + 0.5 - y; if (dx * dx * ry2 + dy * dy * rx2 > rx2 * ry2 && dy <= 0 && xx >= 0 && yy >= 0 && xx < b.w && yy < b.h) { const v = b.data[yy * b.w + xx]!; if (v === ci(Ramp.Amber, 6)) b.data[yy * b.w + xx] = 0; } }
      fillHalfEllipse(lot.bmp, x - rx * 0.4, y - ry * 0.55, rx * 0.15, ry * 0.12, ci(Ramp.Amber, 7), 'top');
      const [ex, ey] = lotPt(lot, 2.8, 3.5); fillRect(lot.bmp, Math.round(ex) - pxs(6), Math.round(ey) - pxs(10), pxs(12), pxs(10), ci(Ramp.Amber, 3)); fillHalfEllipse(lot.bmp, ex, ey - pxs(10), pxs(6), pxs(4), ci(Ramp.Amber, 3), 'top'); fillRect(lot.bmp, Math.round(ex) - pxs(3), Math.round(ey) - pxs(7), pxs(6), pxs(7), ci(Ramp.Neutral, 1));
      for (const [u, v] of [[0.3, 0.3], [3.7, 0.3], [0.3, 3.7], [3.7, 3.7]] as const) flag(lot, u, v, 0, 18, ci(Ramp.Signal, 5));
      break;
    }
    default: {   // 未列专画的：类别盒体
      const box = mainBox(c, m, m, n - m, n - m, h); parapet(c, box, 1);
      break;
    }
  }
}
/** 画布像素多边形（screen 坐标）。 */
const fillPolyIdx = (lot: Lot, pts: number[], idx: number): void => fillPoly(lot.bmp, pts, idx);

/** 建筑 genBuilding(id)：0x70–0xFF（含施工 / 废弃以外的全部）。缺配方的 ID 返回类别盒体。 */
export function genBuilding(id: number, sp: ScaleSpec): IndexedBitmap {
  const r = BUILDING_RECIPES.get(id) ?? P(id, FOOTPRINT[id] as 1 | 2 | 3 | 4, Ramp.WarmGray, 4, 24, 'asphalt');
  const n = r.size;
  const lot = newObjectLot(sp, n);
  const maxH = Math.round(STRUCTURE_MAX_H_L[n] * sp.k);
  const h = Math.min(maxH, Math.max(0, Math.round(r.hL * sp.k * (r.zone ? jitter(id, 1) : 1))));
  const c: Ctx = { lot, sp, r, n, h, seed: id, margin: n === 1 ? 0.1 : 0.12 * n };
  if (r.ground !== 'none') groundDiamond(lot, GROUND_IDX[r.ground]);
  switch (r.sil) {
    case 'gable': case 'gableV': case 'hip': case 'lshape':
      if (r.zone && n === 1) house(c, r.sil);
      else {   // 大占地的坡顶建筑（历史办公楼 0xBA）：四坡顶 + 钟塔 + 拱窗感的高窗
        const box = mainBox(c, c.margin, c.margin, n - c.margin, n - c.margin, Math.round(h * 0.75), r.ramp, r.i0, false);
        windows(lot, box, { seed: c.seed, pitchY: sp.scale === 'L' ? 7 : sp.scale === 'M' ? 4 : 2 });
        roofHip(lot, box, Math.round(h * 0.3), r.roof ?? Ramp.Rust, 3, 0.3);
        const tz = Math.round(h * 0.75);
        isoBox(lot, n - c.margin - 0.5, c.margin + 0.1, n - c.margin - 0.1, c.margin + 0.5, Math.round(h * 0.6), r.ramp, r.i0, { z0: tz });
        const [kx, ky] = lotPt(lot, n - c.margin - 0.1, c.margin + 0.3, tz + h * 0.45); fillEllipse(lot.bmp, kx - px(sp, 3), ky, px(sp, 2.5), px(sp, 2.5), ci(Ramp.Neutral, 7));
        roofHip(lot, { ...box, u0: n - c.margin - 0.5, v0: c.margin + 0.1, u1: n - c.margin - 0.1, v1: c.margin + 0.5, z0: tz, h: Math.round(h * 0.6) }, Math.round(h * 0.2), r.roof ?? Ramp.Rust, 3, 0.1);
        columns(lot, box, 'left', 6, ci(Ramp.Neutral, 7)); steps(lot, box, 'left', 2, ci(Ramp.Neutral, 5));
      }
      break;
    case 'dome': {   // 穹顶塔楼（0xB8）：塔身 + 顶部穹顶 + 冠带
      const ins = 0.2 * n;
      const box = mainBox(c, c.margin + ins * 0.5, c.margin + ins * 0.5, n - c.margin - ins * 0.5, n - c.margin - ins * 0.5, Math.round(h * 0.85));
      fillLotRect(lot, box.u0, box.v0, box.u1, box.v1, ci(Ramp.Violet, 5), box.h);
      dome(lot, (box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2, box.h, (box.u1 - box.u0) * sp.W * 0.42 / sp.k, Math.max(2, h * 0.15 / sp.k), Ramp.Glass, 4);
      antenna(lot, (box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2, h, 10);
      scatterTrees(lot, 0.1, n - 0.5, 0.6, n - 0.1, 2, c.seed, 0.8);
      break;
    }
    case 'flat': case 'stepped': case 'tower': case 'podium': case 'court': case 'mall': case 'campus': office(c, r.sil); break;
    case 'barrel': case 'sawtooth': case 'tanks': case 'substation': industrial(c, r.sil); break;
    case 'canopy': case 'pavilion': gasStation(c); break;
    case 'lot': case 'parking': parking(c, r.sil); break;
    default: special(c); break;
  }
  // 小尺寸点缀：住宅 / 公园类加一两株灌木
  if (r.zone?.type === 'R' && n >= 2 && sp.scale !== 'S') { const s = shrubSprite(sp); for (let k = 0; k < 2; k++) { const [x, y] = lotPt(lot, 0.06 + 0.1 * k, n - 0.1 - 0.15 * k); blitAt(lot.bmp, s, Math.round(x), Math.round(y)); } }
  return lot.bmp;
}

/** 供测试：某配方的 (ramp, silhouette) 签名。 */
export const recipeSignature = (r: BuildingRecipe): string => `${r.ramp}:${r.sil}`;
export { treeSprite, car };
