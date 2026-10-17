// ===== art/iso.ts =====（spec:ui-art §3.2.3 画布与锚点、§3.6.1 三面盒体、§3.6.3 窗格 / 屋顶 / 附属物；WP9）
// 地块坐标系：占地 N×N 内的点 (u, v, z)，u 沿世界 +x（屏幕右下）、v 沿世界 +y（屏幕左下）、z 向上（像素）。
//   screenX = cx + (u − v)·W/2，screenY = baseY + (u + v)·H/2 − z；(N, N, 0) 即锚点（占地底顶点 c11'）。
// 光源在屏幕左上：顶面 i0+2、左面（+y 侧）i0、右面（+x 侧）i0−2、轮廓 i0−3。
import type { IndexedBitmap } from '../contracts/render';
import { hashNoise } from '../contracts/prng';
import { Ramp, ci } from './palette';
import type { ScaleSpec } from './raster';
import { fillEllipse, fillHalfEllipse, fillPoly, fillRect, line, newBitmap, polyline, px, px0, setPx, strokePoly } from './raster';

/** 占地 N 的物件画布总高（L 档）与结构高度上限（spec:ui-art §3.2.3）。 */
export const OBJECT_CANVAS_H_L: Readonly<Record<1 | 2 | 3 | 4, number>> = { 1: 96, 2: 160, 3: 240, 4: 320 };
export const STRUCTURE_MAX_H_L: Readonly<Record<1 | 2 | 3 | 4, number>> = { 1: 64, 2: 96, 3: 144, 4: 192 };

export interface Lot { readonly sp: ScaleSpec; readonly n: number; readonly bmp: IndexedBitmap; readonly cx: number; readonly baseY: number }

/** 物件画布：宽 N·W，高按表；锚点 (N·W/2, 总高)。 */
export function newObjectLot(sp: ScaleSpec, n: 1 | 2 | 3 | 4): Lot {
  const w = n * sp.W, h = Math.round(OBJECT_CANVAS_H_L[n] * sp.k);
  return { sp, n, bmp: newBitmap(w, h, w >> 1, h), cx: w >> 1, baseY: h - n * sp.H };
}
/** 地形画布：W × (H + LEVEL)，锚点 (W/2, H + LEVEL)。 */
export function newTerrainLot(sp: ScaleSpec): Lot {
  const w = sp.W, h = sp.H + sp.LEVEL;
  return { sp, n: 1, bmp: newBitmap(w, h, w >> 1, h), cx: w >> 1, baseY: h - sp.H };
}
/** 平面叠加画布：W × H，锚点 (W/2, H)。 */
export function newTileLot(sp: ScaleSpec): Lot {
  return { sp, n: 1, bmp: newBitmap(sp.W, sp.H, sp.W >> 1, sp.H), cx: sp.W >> 1, baseY: 0 };
}
/** 任意高度的 1×1 画布（高 extra 像素位于菱形之上），锚点在底顶点。 */
export function newTallLot(sp: ScaleSpec, extraL: number): Lot {
  const h = sp.H + px0(sp, extraL);
  return { sp, n: 1, bmp: newBitmap(sp.W, h, sp.W >> 1, h), cx: sp.W >> 1, baseY: h - sp.H };
}

export const lotX = (lot: Lot, u: number, v: number): number => lot.cx + (u - v) * lot.sp.W / 2;
export const lotY = (lot: Lot, u: number, v: number, z = 0): number => lot.baseY + (u + v) * lot.sp.H / 2 - z;
export const lotPt = (lot: Lot, u: number, v: number, z = 0): [number, number] => [lotX(lot, u, v), lotY(lot, u, v, z)];
/** (u,v,z) 三元组列表 → 屏幕顶点列表。 */
export function lotPoly(lot: Lot, uvz: readonly number[]): number[] {
  const out: number[] = [];
  for (let k = 0; k + 2 < uvz.length; k += 3) out.push(lotX(lot, uvz[k]!, uvz[k + 1]!), lotY(lot, uvz[k]!, uvz[k + 1]!, uvz[k + 2]!));
  return out;
}
export const fillLot = (lot: Lot, uvz: readonly number[], idx: number): void => fillPoly(lot.bmp, lotPoly(lot, uvz), idx);
export const strokeLot = (lot: Lot, uvz: readonly number[], idx: number, lw = 1): void => strokePoly(lot.bmp, lotPoly(lot, uvz), idx, lw);
/** 地块平面四边形 (u0,v0)-(u1,v1) 在高度 z 的填充。 */
export const fillLotRect = (lot: Lot, u0: number, v0: number, u1: number, v1: number, idx: number, z = 0): void =>
  fillLot(lot, [u0, v0, z, u1, v0, z, u1, v1, z, u0, v1, z], idx);
/** 地块平面上两点间的线（z 可不同）。 */
export function lotLine(lot: Lot, u0: number, v0: number, z0: number, u1: number, v1: number, z1: number, idx: number, lw = 1): void {
  line(lot.bmp, lotX(lot, u0, v0), lotY(lot, u0, v0, z0), lotX(lot, u1, v1), lotY(lot, u1, v1, z1), idx, lw);
}
/** 整个占地的地面菱形。 */
export const groundDiamond = (lot: Lot, idx: number): void => fillLotRect(lot, 0, 0, lot.n, lot.n, idx);

export interface BoxFaces {
  u0: number; v0: number; u1: number; v1: number; z0: number; h: number; ramp: Ramp; i0: number;
  /** 左面（+y 侧）地脚两端：Lf=(u0,v1) → D=(u1,v1)；右面：D → Rt=(u1,v0)。 */
  leftW: number; rightW: number;
}
export interface BoxOpts { z0?: number; outline?: boolean; top?: number; left?: number; right?: number; edge?: number; noTop?: boolean }

/** 三面盒体。返回面描述供窗格 / 屋顶使用。 */
export function isoBox(lot: Lot, u0: number, v0: number, u1: number, v1: number, h: number, ramp: Ramp, i0: number, opts: BoxOpts = {}): BoxFaces {
  const z0 = opts.z0 ?? 0, z1 = z0 + h;
  const top = opts.top ?? ci(ramp, i0 + 2), left = opts.left ?? ci(ramp, i0), right = opts.right ?? ci(ramp, i0 - 2), edge = opts.edge ?? ci(ramp, i0 - 3);
  // 左面 Lf, D, D', Lf'
  fillLot(lot, [u0, v1, z0, u1, v1, z0, u1, v1, z1, u0, v1, z1], left);
  // 右面 D, Rt, Rt', D'
  fillLot(lot, [u1, v1, z0, u1, v0, z0, u1, v0, z1, u1, v1, z1], right);
  if (!opts.noTop) fillLot(lot, [u0, v0, z1, u1, v0, z1, u1, v1, z1, u0, v1, z1], top);
  const leftW = (u1 - u0) * lot.sp.W / 2, rightW = (v1 - v0) * lot.sp.W / 2;
  const outline = opts.outline ?? (lot.sp.scale !== 'S' || Math.min(leftW, rightW) >= 6);
  if (outline && h > 0) {
    const lw = lot.sp.lw;
    // 顶面后两条边
    if (!opts.noTop) { lotLine(lot, u0, v0, z1, u1, v0, z1, edge, lw); lotLine(lot, u0, v0, z1, u0, v1, z1, edge, lw); }
    // 外缘竖边与中缝
    lotLine(lot, u0, v1, z0, u0, v1, z1, edge, lw); lotLine(lot, u1, v0, z0, u1, v0, z1, edge, lw); lotLine(lot, u1, v1, z0, u1, v1, z1, edge, lw);
  }
  return { u0, v0, u1, v1, z0, h, ramp, i0, leftW, rightW };
}

export interface WindowOpts { lit?: number; dark?: number; seed: number; litRatio?: number; rows?: number; marginTop?: number; marginBottom?: number; pitchX?: number; pitchY?: number; faces?: 'both' | 'left' | 'right'; band?: number }
/**
 * 窗格：沿左 / 右面的 2:1 方向排列。L 档单元 4×3、行距 5、列距 6；首行距顶 4，末行距地 3（spec §3.6.3）。
 * 亮窗比例 p = 0.35 + 0.3·hashNoise(seed, 0, 0)，每格按 hashNoise(seed, col, row) < p 判亮。
 */
export function windows(lot: Lot, box: BoxFaces, o: WindowOpts): void {
  const sp = lot.sp;
  if (sp.scale === 'S' && box.h < 4) return;
  const lit = o.lit ?? ci(Ramp.Amber, 6), dark = o.dark ?? ci(Ramp.Glass, 2);
  const cellW = sp.scale === 'L' ? 2 : 1, cellH = sp.scale === 'L' ? 1 : 1;
  const pitchX = o.pitchX ?? (sp.scale === 'L' ? 6 : sp.scale === 'M' ? 3 : 2), pitchY = o.pitchY ?? (sp.scale === 'L' ? 5 : sp.scale === 'M' ? 3 : 2);
  const mTop = o.marginTop ?? px(sp, 4), mBot = o.marginBottom ?? px(sp, 3);
  const p = o.litRatio ?? 0.35 + 0.3 * hashNoise(o.seed, 0, 0);
  const z1 = box.z0 + box.h;
  const faces: ReadonlyArray<'left' | 'right'> = o.faces === 'left' ? ['left'] : o.faces === 'right' ? ['right'] : ['left', 'right'];
  for (const face of faces) {
    const faceW = face === 'left' ? box.leftW : box.rightW;
    const cols = Math.floor((faceW - pitchX / 2) / pitchX);
    if (cols <= 0) continue;
    const x0 = face === 'left' ? lotX(lot, box.u0, box.v1) : lotX(lot, box.u1, box.v1);
    const yBase = face === 'left' ? lotY(lot, box.u0, box.v1) : lotY(lot, box.u1, box.v1);
    const slope = face === 'left' ? 0.5 : -0.5;
    const usable = box.h - mTop - mBot;
    const rows = o.rows ?? Math.max(1, Math.floor(usable / pitchY) + 1);
    const startX = (faceW - (cols - 1) * pitchX) / 2;
    for (let c = 0; c < cols; c++) {
      const sx = startX + c * pitchX;
      const bx = Math.round(x0 + sx), by = yBase + sx * slope;
      for (let r = 0; r < rows; r++) {
        const wy = Math.round(by - z1 + mTop + r * pitchY);
        if (wy > by - box.z0 - mBot) break;
        const on = hashNoise(o.seed, c + (face === 'left' ? 0 : 100), r) < p;
        if (o.band !== undefined && r === o.band) continue;
        fillRect(lot.bmp, bx - (cellW >> 1), wy, cellW, cellH, on ? lit : dark);
      }
    }
  }
}

/** 坡屋顶：脊沿 along 轴（'u' 或 'v'），脊高 rh。两坡面按朝向着色：朝左上 +1 / 朝右下 −1（u 脊）或 +1 / −2（v 脊）。 */
export function roofGable(lot: Lot, box: BoxFaces, rh: number, ramp: Ramp, i0: number, along: 'u' | 'v', overhang = 0): void {
  const z1 = box.z0 + box.h, zr = z1 + rh;
  const u0 = box.u0 - overhang, v0 = box.v0 - overhang, u1 = box.u1 + overhang, v1 = box.v1 + overhang;
  const edge = ci(ramp, Math.max(0, i0 - 3));
  if (along === 'u') {
    const vm = (v0 + v1) / 2;
    // 山墙三角形（+x 侧，右面延伸）
    fillLot(lot, [box.u1, box.v0, z1, box.u1, box.v1, z1, box.u1, vm, zr], ci(box.ramp, box.i0 - 2));
    fillLot(lot, [u0, v0, z1, u1, v0, z1, u1, vm, zr, u0, vm, zr], ci(ramp, i0 + 1));   // 朝 −y（屏幕右上）
    fillLot(lot, [u0, vm, zr, u1, vm, zr, u1, v1, z1, u0, v1, z1], ci(ramp, i0 - 1));   // 朝 +y（屏幕左下）
    lotLine(lot, u0, vm, zr, u1, vm, zr, edge, lot.sp.lw);
    lotLine(lot, u1, vm, zr, u1, v1, z1, edge, lot.sp.lw);
  } else {
    const um = (u0 + u1) / 2;
    fillLot(lot, [box.u0, box.v1, z1, box.u1, box.v1, z1, um, box.v1, zr], ci(box.ramp, box.i0));
    fillLot(lot, [u0, v0, z1, um, v0, zr, um, v1, zr, u0, v1, z1], ci(ramp, i0 + 1));   // 朝 −x（屏幕左上）
    fillLot(lot, [um, v0, zr, u1, v0, z1, u1, v1, z1, um, v1, zr], ci(ramp, i0 - 2));   // 朝 +x（屏幕右下）
    lotLine(lot, um, v0, zr, um, v1, zr, edge, lot.sp.lw);
    lotLine(lot, um, v1, zr, u1, v1, z1, edge, lot.sp.lw);
  }
}
/** 四坡屋顶（脊缩短 d）。 */
export function roofHip(lot: Lot, box: BoxFaces, rh: number, ramp: Ramp, i0: number, d = 0.25): void {
  const z1 = box.z0 + box.h, zr = z1 + rh;
  const { u0, v0, u1, v1 } = box;
  const vm = (v0 + v1) / 2;
  const a = Math.min(d, (u1 - u0) / 2 - 0.05);
  fillLot(lot, [u0, v0, z1, u1, v0, z1, u1 - a, vm, zr, u0 + a, vm, zr], ci(ramp, i0 + 1));  // 朝 −y
  fillLot(lot, [u0 + a, vm, zr, u1 - a, vm, zr, u1, v1, z1, u0, v1, z1], ci(ramp, i0 - 1));  // 朝 +y
  fillLot(lot, [u0, v0, z1, u0 + a, vm, zr, u0, v1, z1], ci(ramp, i0 + 1));                   // 朝 −x
  fillLot(lot, [u1, v0, z1, u1, v1, z1, u1 - a, vm, zr], ci(ramp, i0 - 2));                   // 朝 +x
  const edge = ci(ramp, Math.max(0, i0 - 3));
  lotLine(lot, u0 + a, vm, zr, u1 - a, vm, zr, edge, lot.sp.lw);
}
/** 拱形（筒）屋顶：沿 along 轴的三条横带 i0+3 / i0+2 / i0+1。 */
export function roofBarrel(lot: Lot, box: BoxFaces, rh: number, ramp: Ramp, i0: number, along: 'u' | 'v', spans = 1): void {
  const z1 = box.z0 + box.h;
  const { u0, v0, u1, v1 } = box;
  for (let s = 0; s < spans; s++) {
    if (along === 'u') {
      const va = v0 + (v1 - v0) * s / spans, vb = v0 + (v1 - v0) * (s + 1) / spans, w = vb - va;
      fillLot(lot, [u0, va, z1, u1, va, z1, u1, va + w / 3, z1 + rh * 0.8, u0, va + w / 3, z1 + rh * 0.8], ci(ramp, i0 + 3));
      fillLot(lot, [u0, va + w / 3, z1 + rh * 0.8, u1, va + w / 3, z1 + rh * 0.8, u1, va + 2 * w / 3, z1 + rh * 0.8, u0, va + 2 * w / 3, z1 + rh * 0.8], ci(ramp, i0 + 2));
      fillLot(lot, [u0, va + 2 * w / 3, z1 + rh * 0.8, u1, va + 2 * w / 3, z1 + rh * 0.8, u1, vb, z1, u0, vb, z1], ci(ramp, i0));
      // 右侧端面半拱
      fillLot(lot, [u1, va, z1, u1, vb, z1, u1, va + w / 2, z1 + rh], ci(ramp, i0 - 2));
    } else {
      const ua = u0 + (u1 - u0) * s / spans, ub = u0 + (u1 - u0) * (s + 1) / spans, w = ub - ua;
      fillLot(lot, [ua, v0, z1, ua + w / 3, v0, z1 + rh * 0.8, ua + w / 3, v1, z1 + rh * 0.8, ua, v1, z1], ci(ramp, i0 + 3));
      fillLot(lot, [ua + w / 3, v0, z1 + rh * 0.8, ua + 2 * w / 3, v0, z1 + rh * 0.8, ua + 2 * w / 3, v1, z1 + rh * 0.8, ua + w / 3, v1, z1 + rh * 0.8], ci(ramp, i0 + 2));
      fillLot(lot, [ua + 2 * w / 3, v0, z1 + rh * 0.8, ub, v0, z1, ub, v1, z1, ua + 2 * w / 3, v1, z1 + rh * 0.8], ci(ramp, i0));
      fillLot(lot, [ua, v1, z1, ub, v1, z1, ua + w / 2, v1, z1 + rh], ci(ramp, i0));
    }
  }
}
/** 锯齿顶：沿 u 轴 n 段，每段一面朝 −x 的玻璃斜面 + 一面屋面。 */
export function roofSawtooth(lot: Lot, box: BoxFaces, rh: number, ramp: Ramp, i0: number, n: number): void {
  const z1 = box.z0 + box.h;
  const { u0, v0, u1, v1 } = box;
  const glass = ci(Ramp.Glass, 5), edge = ci(ramp, Math.max(0, i0 - 3));
  for (let s = 0; s < n; s++) {
    const ua = u0 + (u1 - u0) * s / n, ub = u0 + (u1 - u0) * (s + 1) / n, uc = ua + (ub - ua) * 0.35;
    fillLot(lot, [ua, v0, z1, uc, v0, z1 + rh, uc, v1, z1 + rh, ua, v1, z1], glass);              // 陡面（朝 −x）
    fillLot(lot, [uc, v0, z1 + rh, ub, v0, z1, ub, v1, z1, uc, v1, z1 + rh], ci(ramp, i0 + 1)); // 缓面
    fillLot(lot, [ua, v1, z1, ub, v1, z1, uc, v1, z1 + rh], ci(ramp, i0));                         // 左面上的三角山墙
    lotLine(lot, uc, v0, z1 + rh, uc, v1, z1 + rh, edge, lot.sp.lw);
  }
}
/** 穹顶：以 (u,v,z) 为圆心、屏幕半径 rx/ry 的半球，分带着色（左上亮）。 */
export function dome(lot: Lot, u: number, v: number, z: number, rxL: number, ryL: number, ramp: Ramp, i0: number): void {
  const sp = lot.sp;
  const cx = lotX(lot, u, v), cy = lotY(lot, u, v, z);
  const rx = Math.max(1, rxL * sp.k), ry = Math.max(1, ryL * sp.k);
  fillHalfEllipse(lot.bmp, cx, cy, rx, ry, ci(ramp, i0 - 1), 'top');
  fillHalfEllipse(lot.bmp, cx - rx * 0.12, cy, rx * 0.82, ry * 0.9, ci(ramp, i0 + 1), 'top');
  fillHalfEllipse(lot.bmp, cx - rx * 0.28, cy, rx * 0.5, ry * 0.72, ci(ramp, i0 + 2), 'top');
  fillHalfEllipse(lot.bmp, cx - rx * 0.4, cy - ry * 0.1, rx * 0.22, ry * 0.4, ci(ramp, i0 + 3), 'top');
  // 底部椭圆下半（基座阴影线）
  fillHalfEllipse(lot.bmp, cx, cy, rx, ry * 0.3, ci(ramp, i0 - 2), 'bottom');
}
/** 竖直圆柱（罐 / 塔 / 烟囱）：底面中心 (u,v,z0)，直径 dL（L 像素），高 h。 */
export function cylinder(lot: Lot, u: number, v: number, z0: number, dL: number, h: number, ramp: Ramp, i0: number, capIdx?: number): void {
  const sp = lot.sp;
  const cx = lotX(lot, u, v), cy = lotY(lot, u, v, z0);
  const rx = Math.max(1, dL * sp.k / 2), ry = Math.max(1, rx / 2);
  const x0 = Math.round(cx - rx), x1 = Math.round(cx + rx) - 1, w = x1 - x0 + 1;
  const top = Math.round(cy - h);
  if (w <= 0) return;
  // 身：三段竖带
  const wa = Math.max(1, Math.round(w * 0.3)), wc = Math.max(1, Math.round(w * 0.3));
  fillRect(lot.bmp, x0, top, wa, Math.round(h), ci(ramp, i0 + 1));
  fillRect(lot.bmp, x0 + wa, top, w - wa - wc, Math.round(h), ci(ramp, i0));
  fillRect(lot.bmp, x1 - wc + 1, top, wc, Math.round(h), ci(ramp, i0 - 2));
  fillHalfEllipse(lot.bmp, cx, cy, rx, ry, ci(ramp, i0), 'bottom');
  fillHalfEllipse(lot.bmp, cx + rx * 0.35, cy, rx * 0.65, ry, ci(ramp, i0 - 2), 'bottom');
  // 顶
  fillEllipse(lot.bmp, cx, cy - h, rx, ry, capIdx ?? ci(ramp, i0 + 2));
  if (sp.scale !== 'S') { line(lot.bmp, x0, top, x0, Math.round(cy), ci(ramp, i0 - 3)); line(lot.bmp, x1, top, x1, Math.round(cy), ci(ramp, i0 - 3)); }
}
/** 烟囱：圆柱 + 顶端 Signal[4] 一环。 */
export function chimney(lot: Lot, u: number, v: number, z0: number, dL: number, h: number): void {
  cylinder(lot, u, v, z0, dL, h, Ramp.Brick, 3);
  const sp = lot.sp;
  if (sp.scale !== 'S') {
    const cx = lotX(lot, u, v), cy = lotY(lot, u, v, z0) - h;
    const rx = Math.max(1, dL * sp.k / 2);
    fillRect(lot.bmp, Math.round(cx - rx), Math.round(cy - rx / 2), Math.round(rx * 2), Math.max(1, px(sp, 2)), ci(Ramp.Signal, 4));
    fillEllipse(lot.bmp, cx, cy - rx / 2, rx * 0.6, Math.max(1, rx * 0.3), ci(Ramp.Neutral, 1));
  }
}
/** 屋顶设备箱（HVAC）。 */
export function hvac(lot: Lot, u: number, v: number, z: number, sizeU = 0.14, sizeV = 0.1, hL = 4): void {
  isoBox(lot, u, v, u + sizeU, v + sizeV, px(lot.sp, hL), Ramp.WarmGray, 4, { z0: z, outline: false });
}
/** 天线 / 尖塔：1 px 竖线 + 顶端亮点。 */
export function antenna(lot: Lot, u: number, v: number, z: number, hL: number, tipIdx = ci(Ramp.Signal, 6)): void {
  const x = Math.round(lotX(lot, u, v)), y = Math.round(lotY(lot, u, v, z));
  const h = px(lot.sp, hL);
  line(lot.bmp, x, y, x, y - h, ci(Ramp.Neutral, 2));
  setPx(lot.bmp, x, y - h, tipIdx);
}
/** 招牌：面上的色块（左面或右面，位置 t ∈ 0..1 沿面、高度 z）。 */
export function signPlate(lot: Lot, box: BoxFaces, face: 'left' | 'right', t: number, z: number, wL: number, hL: number, idx: number, frame = ci(Ramp.Neutral, 7)): void {
  const sp = lot.sp;
  const w = px(sp, wL), h = px(sp, hL);
  const bx = face === 'left' ? lotX(lot, box.u0 + (box.u1 - box.u0) * t, box.v1) : lotX(lot, box.u1, box.v1 - (box.v1 - box.v0) * t);
  const by = face === 'left' ? lotY(lot, box.u0 + (box.u1 - box.u0) * t, box.v1, box.z0 + z) : lotY(lot, box.u1, box.v1 - (box.v1 - box.v0) * t, box.z0 + z);
  fillRect(lot.bmp, Math.round(bx - w / 2), Math.round(by - h), w, h, idx);
  if (sp.scale === 'L') { setPx(lot.bmp, Math.round(bx - w / 2) + 1, Math.round(by - h) + 1, frame); setPx(lot.bmp, Math.round(bx + w / 2) - 2, Math.round(by - h) + 1, frame); }
}
/** 门：面地脚处的矩形。 */
export function door(lot: Lot, box: BoxFaces, face: 'left' | 'right', t: number, wL: number, hL: number, idx: number): void {
  const sp = lot.sp;
  const w = px(sp, wL), h = px(sp, hL);
  const u = face === 'left' ? box.u0 + (box.u1 - box.u0) * t : box.u1, v = face === 'left' ? box.v1 : box.v1 - (box.v1 - box.v0) * t;
  const bx = lotX(lot, u, v), by = lotY(lot, u, v, box.z0);
  fillRect(lot.bmp, Math.round(bx - w / 2), Math.round(by - h), w, h, idx);
}

/**
 * 独立树精灵：树干 Earth[1] 2×4 + 下冠 Forest[1|2] 12×8 / 上冠 Forest[2|3] 10×7 + 高光 Forest[4]（L 档尺寸）。锚点 = 树根。
 * 树冠整体比平地 Grass[3..5] 暗（INT-C：树比草亮时大片树林像绿色噪点；原版的树是落在草地上的深绿团块）。
 */
export function treeSprite(sp: ScaleSpec, seed = 0, sizeMul = 1): IndexedBitmap {
  const w = Math.max(3, Math.round(14 * sp.k * sizeMul)), h = Math.max(4, Math.round(16 * sp.k * sizeMul));
  const b = newBitmap(w, h, w >> 1, h - 1);
  const cx = w / 2, trunkW = Math.max(1, Math.round(2 * sp.k * sizeMul)), trunkH = Math.max(1, Math.round(4 * sp.k * sizeMul));
  fillRect(b, Math.round(cx - trunkW / 2), h - trunkH, trunkW, trunkH, ci(Ramp.Earth, 1));
  const r1x = Math.max(1, 6 * sp.k * sizeMul), r1y = Math.max(1, 4 * sp.k * sizeMul);
  const cy1 = h - trunkH - r1y * 0.9;
  const shade = hashNoise(seed, 7, 3) > 0.5 ? 0 : 1;
  fillEllipse(b, cx, cy1, r1x, r1y, ci(Ramp.Forest, 1 + shade));
  fillEllipse(b, cx - 0.5 * sp.k * sizeMul, cy1 - r1y * 0.55, r1x * 0.82, r1y * 0.85, ci(Ramp.Forest, 2 + shade));
  if (sp.scale === 'L') fillEllipse(b, cx - r1x * 0.35, cy1 - r1y * 0.9, Math.max(1, r1x * 0.25), Math.max(1, r1y * 0.3), ci(Ramp.Forest, 4));
  else if (sp.scale === 'M' && shade === 1) setPx(b, Math.round(cx - r1x * 0.35), Math.round(cy1 - r1y * 0.9), ci(Ramp.Forest, 4));
  return b;
}
/** 小型柏树 / 灌木（公园、庭院点缀）。 */
export function shrubSprite(sp: ScaleSpec): IndexedBitmap {
  const w = Math.max(2, Math.round(6 * sp.k)), h = Math.max(2, Math.round(5 * sp.k));
  const b = newBitmap(w, h, w >> 1, h - 1);
  fillEllipse(b, w / 2, h / 2, w / 2, h / 2, ci(Ramp.Forest, 3));
  if (sp.scale === 'L') setPx(b, (w >> 1) - 1, 1, ci(Ramp.Forest, 5));
  return b;
}

/** 围栏：沿占地矩形的 1 px 线（+ 每隔若干像素一根立柱）。 */
export function fence(lot: Lot, u0: number, v0: number, u1: number, v1: number, idx: number, hL = 4): void {
  const h = px(lot.sp, hL);
  const pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const;
  for (let k = 0; k < 4; k++) {
    const [ua, va] = pts[k]!, [ub, vb] = pts[(k + 1) % 4]!;
    lotLine(lot, ua, va, h, ub, vb, h, idx);
    const steps = Math.max(1, Math.round(Math.max(Math.abs(ub - ua), Math.abs(vb - va)) * lot.sp.W / px(lot.sp, 8)));
    for (let s = 0; s <= steps; s++) { const t = s / steps; lotLine(lot, ua + (ub - ua) * t, va + (vb - va) * t, 0, ua + (ub - ua) * t, va + (vb - va) * t, h, idx); }
  }
}
/** 小车：4×2（L）杂色块，朝向 axis。 */
export function car(lot: Lot, u: number, v: number, z: number, bodyIdx: number, axis: 'u' | 'v'): void {
  const sp = lot.sp;
  const l = px(sp, 5), wdt = px(sp, 3);
  if (axis === 'u') fillLot(lot, [u, v, z, u + l / sp.W * 2, v, z, u + l / sp.W * 2, v + wdt / sp.W * 2, z, u, v + wdt / sp.W * 2, z], bodyIdx);
  else fillLot(lot, [u, v, z, u + wdt / sp.W * 2, v, z, u + wdt / sp.W * 2, v + l / sp.W * 2, z, u, v + l / sp.W * 2, z], bodyIdx);
  if (sp.scale === 'L') { const [x, y] = lotPt(lot, u + 0.06, v + 0.04, z); setPx(lot.bmp, Math.round(x), Math.round(y) - 1, ci(Ramp.Glass, 6)); }
}
/** 停车场地面：Asphalt[3] + 车位线。 */
export function parkingLot(lot: Lot, u0: number, v0: number, u1: number, v1: number, seed: number, cars: number, axis: 'u' | 'v' = 'u'): void {
  const sp = lot.sp;
  fillLotRect(lot, u0, v0, u1, v1, ci(Ramp.Asphalt, 3));
  const step = px(sp, 6) / (sp.W / 2);
  const lineIdx = ci(Ramp.Neutral, 7);
  if (axis === 'u') { for (let u = u0 + step; u < u1 - step / 2; u += step) lotLine(lot, u, v0 + 0.05, 0, u, v0 + (v1 - v0) * 0.4, 0, lineIdx); }
  else { for (let v = v0 + step; v < v1 - step / 2; v += step) lotLine(lot, u0 + 0.05, v, 0, u0 + (u1 - u0) * 0.4, v, 0, lineIdx); }
  for (let k = 0; k < cars; k++) {
    const t = hashNoise(seed, k, 1), s = hashNoise(seed, k, 2);
    const col = [ci(Ramp.Signal, 4), ci(Ramp.Water, 5), ci(Ramp.Neutral, 6), ci(Ramp.Amber, 5), ci(Ramp.Violet, 4), ci(Ramp.Teal, 4)][k % 6]!;
    if (axis === 'u') car(lot, u0 + (u1 - u0 - 0.2) * t, v0 + 0.08 + (v1 - v0) * 0.3 * s, 0, col, 'v');
    else car(lot, u0 + 0.08 + (u1 - u0) * 0.3 * s, v0 + (v1 - v0 - 0.2) * t, 0, col, 'u');
  }
}
/** 在菱形内随机落树（按 y 排序后依次贴图）。 */
export function scatterTrees(lot: Lot, u0: number, v0: number, u1: number, v1: number, n: number, seed: number, sizeMul = 1): void {
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) pts.push([u0 + (u1 - u0) * hashNoise(seed, k, 11), v0 + (v1 - v0) * hashNoise(seed, k, 12)]);
  pts.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  for (const [u, v] of pts) { const t = treeSprite(lot.sp, seed + (u * 31 | 0) + (v * 17 | 0), sizeMul); const [x, y] = lotPt(lot, u, v); blitAt(lot.bmp, t, Math.round(x), Math.round(y)); }
}
function blitAt(dst: IndexedBitmap, src: IndexedBitmap, ax: number, ay: number): void {
  const dx = ax - src.anchorX, dy = ay - src.anchorY;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const v = src.data[y * src.w + x]!; if (v) setPx(dst, dx + x, dy + y, v); }
}
export { blitAt };
/** 台阶：面前 n 级矮条。 */
export function steps(lot: Lot, box: BoxFaces, face: 'left' | 'right', n: number, idx: number): void {
  const d = 0.06;
  for (let k = 1; k <= n; k++) {
    const h = px0(lot.sp, 2) * (n - k + 1);
    if (face === 'left') isoBox(lot, box.u0 + 0.25, box.v1, box.u1 - 0.25, box.v1 + d * k, h, Ramp.Neutral, 5, { outline: false, top: idx, left: ci(Ramp.Neutral, 4), right: ci(Ramp.Neutral, 3) });
    else isoBox(lot, box.u1, box.v0 + 0.25, box.u1 + d * k, box.v1 - 0.25, h, Ramp.Neutral, 5, { outline: false, top: idx, left: ci(Ramp.Neutral, 4), right: ci(Ramp.Neutral, 3) });
  }
}
/** 柱廊：面前 n 根竖柱。 */
export function columns(lot: Lot, box: BoxFaces, face: 'left' | 'right', n: number, idx: number): void {
  const lw = px(lot.sp, 2);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const u = face === 'left' ? box.u0 + (box.u1 - box.u0) * t : box.u1 + 0.04, v = face === 'left' ? box.v1 + 0.04 : box.v1 - (box.v1 - box.v0) * t;
    const x = Math.round(lotX(lot, u, v)), y = Math.round(lotY(lot, u, v, box.z0));
    fillRect(lot.bmp, x - (lw >> 1), y - box.h, lw, box.h, idx);
  }
}
/** 旗杆 + 小旗。 */
export function flag(lot: Lot, u: number, v: number, z: number, hL: number, flagIdx: number): void {
  const x = Math.round(lotX(lot, u, v)), y = Math.round(lotY(lot, u, v, z));
  const h = px(lot.sp, hL);
  line(lot.bmp, x, y, x, y - h, ci(Ramp.Neutral, 6));
  fillRect(lot.bmp, x + 1, y - h, px(lot.sp, 4), px(lot.sp, 3), flagIdx);
}
/** 螺旋桨 / 风车叶片（3 叶，静帧）。 */
export function rotor(lot: Lot, cx: number, cy: number, rL: number, idx: number): void {
  const r = px(lot.sp, rL);
  polyline(lot.bmp, [cx, cy, cx, cy - r], idx);
  polyline(lot.bmp, [cx, cy, cx + Math.round(r * 0.87), cy + Math.round(r * 0.5)], idx);
  polyline(lot.bmp, [cx, cy, cx - Math.round(r * 0.87), cy + Math.round(r * 0.5)], idx);
}
