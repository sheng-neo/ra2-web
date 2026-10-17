// ===== art/water.ts =====（spec:ui-art §3.7.2 水面 21 形；spec:terrain §2.5.2 / §2.5.3 角语义；WP9）
// shape 0 整块；1–12 岸形（陆地角 = SLOPE_CORNERS 位，陆地部分透明以露出其下地形）；13 孤立水；14 瀑布；15–20 溪流 / 水湾。
// v1 为静帧：高光像素写循环组 A 索引（cycling = true），由调色板环移产生动感；S 档不画高光。
import type { IndexedBitmap } from '../contracts/render';
import { hashNoise } from '../contracts/prng';
import { SLOPE_CORNERS } from '../contracts/rotation';
import { IDX, Ramp, ci } from './palette';
import type { ScaleSpec } from './raster';
import { fillEllipse, fillRect } from './raster';
import { fillLot, lotLine, lotPt, newTerrainLot, newTileLot, type Lot } from './iso';

/** depthBand 0 池塘 / 溪流 → Water[4]；1 → Water[3]；2 深水 → Water[2]。 */
export const waterIndexFor = (depthBand: number): number => ci(Ramp.Water, depthBand <= 0 ? 4 : depthBand === 1 ? 3 : 2);
const SAND = ci(Ramp.Sand, 5);
const CORNER_UV: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];   // U Rt D Lf（绕行序）
/** 绕行序下的陆地标志（SLOPE_CORNERS: bit3 U, bit2 Rt, bit1 Lf, bit0 D）。 */
const landFlags = (shape: number): boolean[] => { const b = SLOPE_CORNERS[shape] ?? 0; return [(b >> 3 & 1) === 1, (b >> 2 & 1) === 1, (b & 1) === 1, (b >> 1 & 1) === 1]; };

/** 岸形水域多边形：水角原样、相邻陆/水边取中点。返回 uvz 列表与岸线段（中点对）。 */
export function shoreWaterPolygon(shape: number): { uvz: number[]; shore: number[][] } {
  const land = landFlags(shape);
  const uvz: number[] = [];
  const mids: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const [u, v] = CORNER_UV[k]!;
    if (!land[k]) uvz.push(u, v, 0);
    const n = (k + 1) & 3;
    if (land[k] !== land[n]) { const [u2, v2] = CORNER_UV[n]!; const m = [(u + u2) / 2, (v + v2) / 2]; uvz.push(m[0]!, m[1]!, 0); mids.push(m); }
  }
  return { uvz, shore: mids };
}

function highlights(lot: Lot, waterIdx: number, seed: number): void {
  const sp = lot.sp;
  if (sp.scale === 'S') return;
  const b = lot.bmp;
  const thr = sp.scale === 'L' ? 0.93 : 0.9;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (b.data[y * b.w + x] !== waterIdx) continue;
    if (hashNoise(seed, x, y) > thr) { b.data[y * b.w + x] = IDX.CycleA + ((x + y * 3) & 15); b.cycling = true; }
  }
}

/** genWater(shape 0..20, depthBand 0..2)。画布 W × H（瀑布 W × (H + LEVEL)），锚点在底顶点。 */
export function genWater(shape: number, depthBand: number, sp: ScaleSpec): IndexedBitmap {
  const s = Math.max(0, Math.min(20, shape | 0));
  const widx = waterIndexFor(depthBand);
  const seed = s * 4 + (depthBand & 3);
  if (s === 14) return waterfall(sp, seed);
  const lot = newTileLot(sp);
  if (s === 0) {
    fillLot(lot, [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], widx);
    if (depthBand >= 2 && sp.scale !== 'S') { const dark = ci(Ramp.Water, 1); const b = lot.bmp; for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.data[y * b.w + x] === widx && hashNoise(seed + 77, x, y) > 0.9) b.data[y * b.w + x] = dark; }
  } else if (s <= 12) {
    const { uvz, shore } = shoreWaterPolygon(s);
    fillLot(lot, uvz, widx);
    if (shore.length === 2) {
      const [a, c] = shore as [number[], number[]];
      // 岸线：1 px 沙色 + 水侧一条浅色浪线（L）
      lotLine(lot, a[0]!, a[1]!, 0, c[0]!, c[1]!, 0, SAND);
      if (sp.scale === 'L') {
        // 浪线位于水侧：朝水域多边形质心偏移一点
        let cu = 0, cv = 0; for (let k = 0; k + 2 < uvz.length; k += 3) { cu += uvz[k]!; cv += uvz[k + 1]!; }
        const n = uvz.length / 3; cu /= n; cv /= n;
        const mu = (a[0]! + c[0]!) / 2, mv = (a[1]! + c[1]!) / 2;
        const du = (cu - mu) * 0.08, dv = (cv - mv) * 0.08;
        lotLine(lot, a[0]! + du, a[1]! + dv, 0, c[0]! + du, c[1]! + dv, 0, ci(Ramp.Water, 5));
      }
    }
  } else if (s === 13) {
    const ins = 3 / 32;
    fillLot(lot, [0.5, ins, 0, 1 - ins, 0.5, 0, 0.5, 1 - ins, 0, ins, 0.5, 0], widx);
    strokeDiamondInset(lot, ins, SAND);
  } else {
    stream(lot, s, widx);
  }
  highlights(lot, widx, seed);
  return lot.bmp;
}

function strokeDiamondInset(lot: Lot, ins: number, idx: number): void {
  lotLine(lot, 0.5, ins, 0, 1 - ins, 0.5, 0, idx); lotLine(lot, 1 - ins, 0.5, 0, 0.5, 1 - ins, 0, idx);
  lotLine(lot, 0.5, 1 - ins, 0, ins, 0.5, 0, idx); lotLine(lot, ins, 0.5, 0, 0.5, ins, 0, idx);
}

/** 15 L–R 溪流、16 T–B 溪流、17 水湾 B、18 水湾 L、19 水湾 T、20 水湾 R。带宽 W/4。 */
function stream(lot: Lot, s: number, widx: number): void {
  const hw = 0.125;
  const sp = lot.sp;
  const band = (u0: number, v0: number, u1: number, v1: number): void => {
    fillLot(lot, [u0, v0, 0, u1, v0, 0, u1, v1, 0, u0, v1, 0], widx);
    if (u1 - u0 > v1 - v0) { lotLine(lot, u0, v0, 0, u1, v0, 0, SAND); lotLine(lot, u0, v1, 0, u1, v1, 0, SAND); }
    else { lotLine(lot, u0, v0, 0, u0, v1, 0, SAND); lotLine(lot, u1, v0, 0, u1, v1, 0, SAND); }
  };
  const cap = (): void => {
    const [x, y] = lotPt(lot, 0.5, 0.5);
    fillEllipse(lot.bmp, x, y, Math.max(1, hw * sp.W), Math.max(1, hw * sp.W / 2), widx);
    if (sp.scale !== 'S') { const r = hw * sp.W; for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r / 2]] as const) { const xx = Math.round(x + dx), yy = Math.round(y + dy); if (lot.bmp.data[yy * lot.bmp.w + xx] !== widx) fillRect(lot.bmp, xx, yy, 1, 1, SAND); } }
  };
  switch (s) {
    case 15: band(0, 0.5 - hw, 1, 0.5 + hw); break;
    case 16: band(0.5 - hw, 0, 0.5 + hw, 1); break;
    case 17: band(0.5 - hw, 0.5, 0.5 + hw, 1); cap(); break;
    case 18: band(0, 0.5 - hw, 0.5, 0.5 + hw); cap(); break;
    case 19: band(0.5 - hw, 0, 0.5 + hw, 0.5); cap(); break;
    default: band(0.5, 0.5 - hw, 1, 0.5 + hw); cap(); break;
  }
}

/** 瀑布：顶面水菱形在 LEVEL 高度 + 两侧下落水面（循环组 C 竖条纹）。 */
function waterfall(sp: ScaleSpec, seed: number): IndexedBitmap {
  const lot = newTerrainLot(sp);
  const L = sp.LEVEL;
  const base = ci(Ramp.Water, 5);
  fillLot(lot, [0, 1, 0, 1, 1, 0, 1, 1, L, 0, 1, L], base);
  fillLot(lot, [1, 1, 0, 1, 0, 0, 1, 0, L, 1, 1, L], ci(Ramp.Water, 4));
  fillLot(lot, [0, 0, L, 1, 0, L, 1, 1, L, 0, 1, L], ci(Ramp.Water, 4));
  const b = lot.bmp;
  // 竖条纹：画布 x 每 4 px 一条 2 px 宽（L），只落在下落面上
  const stripeW = Math.max(1, Math.round(2 * sp.k)), period = Math.max(2, Math.round(4 * sp.k));
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const v = b.data[y * b.w + x]!;
    if (v !== base && v !== ci(Ramp.Water, 4)) continue;
    if (y < lot.baseY + sp.H / 2 - 1) continue;   // 顶面不画条纹（近似：顶面位于上半部）
    if ((x % period) < stripeW) { b.data[y * b.w + x] = IDX.CycleC + ((y >> 1) & 7); b.cycling = true; }
  }
  highlights(lot, ci(Ramp.Water, 4), seed);
  return b;
}
