// ===== art/nature.ts =====（spec:ui-art §3.7.4 树木、§3.7.5 瓦砾 / 放射性 / 小公园 / 施工 / 废弃；WP9）
// 全部画在 1×1 / N×N 物件画布（§3.2.3），锚点为占地底顶点。
import type { IndexedBitmap } from '../contracts/render';
import { hashNoise } from '../contracts/prng';
import { Ramp, ci } from './palette';
import type { ScaleSpec } from './raster';
import { fillEllipse, fillRect, line, setPx } from './raster';
import { blitAt, fillLotRect, groundDiamond, isoBox, lotLine, lotPt, newObjectLot, treeSprite, windows, roofGable, type Lot } from './iso';

/** 每档密度的树数（1..7）：低档稀疏（原版 1–3 档只有零星几棵），5 档起成林。 */
const TREES_PER_DENSITY: readonly number[] = [1, 2, 3, 4, 6, 8, 10];
/**
 * 树 genTrees(density 1..7, variant 0..3)：TREES_PER_DENSITY[d] 棵按 y 排序后贴图；每棵树在右下方投 Forest[0] 椭圆阴影（S 档省略），
 * ≥ 5 档的阴影更大、彼此连片，让树丛成"簇"而不是散点。
 */
export function genTrees(density: number, variant: number, sp: ScaleSpec): IndexedBitmap {
  const d = Math.max(1, Math.min(7, density | 0));
  const lot = newObjectLot(sp, 1);
  const n = TREES_PER_DENSITY[d - 1]!;
  const seed = (variant & 3) * 8 + d;
  const pts: [number, number, number][] = [];
  const spread = d <= 2 ? 0.5 : 0.72;
  for (let k = 0; k < n; k++) pts.push([0.5 - spread / 2 + spread * hashNoise(seed, k, 1), 0.5 - spread / 2 + spread * hashNoise(seed, k, 2), 0.85 + 0.3 * hashNoise(seed, k, 3)]);
  pts.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  // 先铺全部树影（≥ 5 档的影子更大，彼此连成一片林冠底色），再按深度贴树
  const sprites = pts.map(([u, v, m]) => treeSprite(sp, seed * 31 + Math.round(u * 97 + v * 53), d >= 5 ? m * 1.08 : m));
  if (sp.scale !== 'S') pts.forEach(([u, v], k) => { const t = sprites[k]!; const [x, y] = lotPt(lot, u, v); fillEllipse(lot.bmp, x + Math.round(2 * sp.k), y, Math.max(1, t.w * (d >= 5 ? 0.6 : 0.4)), Math.max(1, t.w * (d >= 5 ? 0.3 : 0.16)), ci(Ramp.Forest, 0)); });
  pts.forEach(([u, v], k) => { const [x, y] = lotPt(lot, u, v); blitAt(lot.bmp, sprites[k]!, Math.round(x), Math.round(y)); });
  return lot.bmp;
}

export type GroundKind = 'rubble' | 'radioactive' | 'park';
/** 瓦砾 / 放射性 / 小公园。 */
export function genGround(kind: GroundKind, variant: number, sp: ScaleSpec): IndexedBitmap {
  const lot = newObjectLot(sp, 1);
  if (kind === 'rubble') {
    groundDiamond(lot, ci(Ramp.Earth, 3));
    const n = 6 + (variant & 3);
    for (let k = 0; k < n; k++) {
      const u = 0.15 + 0.7 * hashNoise(variant + 10, k, 1), v = 0.15 + 0.7 * hashNoise(variant + 10, k, 2);
      const [x, y] = lotPt(lot, u, v);
      const w = Math.max(1, Math.round((2 + (k % 2)) * sp.k)), h = Math.max(1, Math.round(2 * sp.k));
      fillRect(lot.bmp, Math.round(x) - (w >> 1), Math.round(y) - h, w, h, ci(Ramp.WarmGray, 2 + (k % 3)));
      if (sp.scale === 'L') setPx(lot.bmp, Math.round(x) - (w >> 1), Math.round(y) - h, ci(Ramp.WarmGray, 5));
    }
    // 焦黑痕
    if (sp.scale !== 'S') { const [x, y] = lotPt(lot, 0.5, 0.5); fillEllipse(lot.bmp, x, y, Math.max(1, 7 * sp.k), Math.max(1, 3 * sp.k), ci(Ramp.Earth, 2)); }
  } else if (kind === 'radioactive') {
    groundDiamond(lot, ci(Ramp.Olive, 3));
    const [x, y] = lotPt(lot, 0.5, 0.5);
    const r = Math.max(1.5, 8 * sp.k);
    fillEllipse(lot.bmp, x, y, r, r / 2, ci(Ramp.Amber, 6));
    if (sp.scale !== 'S') {
      // 三叶：中心点 + 三条暗楔
      fillEllipse(lot.bmp, x, y, r * 0.22, r * 0.11, ci(Ramp.Neutral, 0));
      for (const [dx, dy] of [[0, -0.6], [-0.55, 0.35], [0.55, 0.35]] as const) fillEllipse(lot.bmp, x + dx * r, y + dy * r / 2, r * 0.3, r * 0.15, ci(Ramp.Neutral, 0));
    }
    // 几点警示
    for (let k = 0; k < 3; k++) { const [px_, py_] = lotPt(lot, 0.2 + 0.6 * hashNoise(5, k, 1), 0.2 + 0.6 * hashNoise(5, k, 2)); setPx(lot.bmp, Math.round(px_), Math.round(py_), ci(Ramp.Olive, 1)); }
  } else {
    groundDiamond(lot, ci(Ramp.Grass, 5));
    const path = ci(Ramp.Sand, 6);
    const lw = sp.lw;
    lotLine(lot, 0.5, 0, 0, 0.5, 1, 0, path, lw); lotLine(lot, 0, 0.5, 0, 1, 0.5, 0, path, lw);
    if (sp.scale !== 'S') { lotLine(lot, 0.5, 0.03, 0, 0.5, 0.97, 0, ci(Ramp.Sand, 7)); }
    // 长椅
    const [bx, by] = lotPt(lot, 0.62, 0.3);
    fillRect(lot.bmp, Math.round(bx), Math.round(by) - Math.max(1, Math.round(2 * sp.k)), Math.max(1, Math.round(4 * sp.k)), Math.max(1, Math.round(2 * sp.k)), ci(Ramp.Rust, 2));
    // 两棵树（角落）
    const seed = 40 + (variant & 3);
    for (const [u, v] of [[0.25, 0.25], [0.75, 0.72]] as const) { const t = treeSprite(sp, seed + Math.round(u * 10), 0.9); const [x, y] = lotPt(lot, u + 0.05 * hashNoise(seed, 1, 1), v); blitAt(lot.bmp, t, Math.round(x), Math.round(y)); }
    // 花坛点
    if (sp.scale === 'L') for (let k = 0; k < 4; k++) { const [x, y] = lotPt(lot, 0.35 + 0.3 * hashNoise(seed, k, 7), 0.35 + 0.3 * hashNoise(seed, k, 8)); setPx(lot.bmp, Math.round(x), Math.round(y), k & 1 ? ci(Ramp.Signal, 5) : ci(Ramp.Amber, 6)); }
  }
  return lot.bmp;
}

/** 施工场地：Earth[4] 地面 + 60% 占地的钢架线框盒（高 = 目标高度 × 0.5）+ 吊车臂。 */
export function genConstruction(size: 1 | 2 | 3, variant: number, sp: ScaleSpec): IndexedBitmap {
  const lot = newObjectLot(sp, size);
  groundDiamond(lot, ci(Ramp.Earth, 4));
  const targetL = size === 1 ? 20 : size === 2 ? 48 : 80;
  const h = Math.max(2, Math.round(targetL * 0.5 * sp.k * (0.85 + 0.3 * hashNoise(variant, 1, 1))));
  const m = size * 0.2, u0 = m, v0 = m, u1 = size - m, v1 = size - m;
  const steel = ci(Ramp.Rust, 3), lw = sp.lw;
  // 楼板层
  const floors = Math.max(1, Math.round(h / Math.max(3, 10 * sp.k)));
  for (let f = 0; f <= floors; f++) {
    const z = (h * f) / floors;
    const idx = f === floors ? steel : ci(Ramp.Rust, 2);
    lotLine(lot, u0, v0, z, u1, v0, z, idx, lw); lotLine(lot, u1, v0, z, u1, v1, z, idx, lw); lotLine(lot, u1, v1, z, u0, v1, z, idx, lw); lotLine(lot, u0, v1, z, u0, v0, z, idx, lw);
  }
  // 立柱
  const cols = size + 1;
  for (let a = 0; a <= cols; a++) for (let c = 0; c <= cols; c++) {
    if (a !== 0 && a !== cols && c !== 0 && c !== cols) continue;
    lotLine(lot, u0 + (u1 - u0) * a / cols, v0 + (v1 - v0) * c / cols, 0, u0 + (u1 - u0) * a / cols, v0 + (v1 - v0) * c / cols, h, steel, lw);
  }
  // 材料堆与吊车
  const [mx, my] = lotPt(lot, size * 0.82, size * 0.78);
  fillRect(lot.bmp, Math.round(mx) - Math.max(1, Math.round(3 * sp.k)), Math.round(my) - Math.max(1, Math.round(2 * sp.k)), Math.max(2, Math.round(6 * sp.k)), Math.max(1, Math.round(2 * sp.k)), ci(Ramp.WarmGray, 4));
  const cx = Math.round(lot.cx + sp.W * size * 0.18), cy = Math.round(lot.baseY + size * sp.H * 0.55);
  const mast = Math.round(h + Math.max(6, 20 * sp.k));
  line(lot.bmp, cx, cy, cx, cy - mast, ci(Ramp.Amber, 6), lw);
  line(lot.bmp, cx - Math.round(mast * 0.25), cy - mast, cx + Math.round(mast * 0.6), cy - mast, ci(Ramp.Amber, 6), lw);
  line(lot.bmp, cx + Math.round(mast * 0.45), cy - mast, cx + Math.round(mast * 0.45), cy - mast + Math.round(mast * 0.4), ci(Ramp.Neutral, 2));
  return lot.bmp;
}

/** 废弃建筑：WarmGray 盒体、全暗窗、顶面破损块、地面 Earth[4]。 */
export function genAbandoned(size: 1 | 2 | 3, variant: number, sp: ScaleSpec): IndexedBitmap {
  const lot = newObjectLot(sp, size);
  groundDiamond(lot, ci(Ramp.Earth, 4));
  const hL = size === 1 ? 18 : size === 2 ? 44 : 70;
  const h = Math.max(2, Math.round(hL * sp.k * (0.9 + 0.2 * hashNoise(variant + 3, 2, 2))));
  const m = size * 0.12;
  const box = isoBox(lot, m, m, size - m, size - m, h, Ramp.WarmGray, 3);
  windows(lot, box, { seed: 500 + variant, lit: ci(Ramp.Neutral, 1), dark: ci(Ramp.Neutral, 1) });
  if (size === 1 && (variant & 1)) roofGable(lot, box, Math.round(8 * sp.k), Ramp.WarmGray, 2, 'u');
  // 破损块
  for (let k = 0; k < 3; k++) {
    const u = m + (size - 2 * m) * (0.15 + 0.7 * hashNoise(variant + 9, k, 1)), v = m + (size - 2 * m) * (0.15 + 0.7 * hashNoise(variant + 9, k, 2));
    fillLotRect(lot, u, v, u + 0.12 * size, v + 0.1 * size, ci(Ramp.Earth, 2), h);
  }
  // 木板封门
  if (sp.scale !== 'S') { const [x, y] = lotPt(lot, size - m, size * 0.5 + 0.1); fillRect(lot.bmp, Math.round(x) - Math.max(1, Math.round(3 * sp.k)), Math.round(y) - Math.max(2, Math.round(5 * sp.k)), Math.max(2, Math.round(4 * sp.k)), Math.max(2, Math.round(5 * sp.k)), ci(Ramp.Earth, 3)); }
  return lot.bmp;
}

/**
 * 分区地面（显示 Zones 时的叠加）：1 px 菱形描边 + 内部 1/8 点阵；密区再加一圈内缩约 3 px（L）的虚线菱形。
 * 原来的 2–3 px 实线在相邻格之间叠成 4–6 px 的粗格网，整片分区像铁丝网（INT-C 实测）；原版是细线 + 点阵的淡色菱形。
 */
export function zoneTint(lot: Lot, colorIdx: number, dense: boolean): void {
  const sp = lot.sp;
  const b = lot.bmp;
  const ring = (ins: number, dashed: boolean): void => {
    const pts = [[0.5, ins], [1 - ins, 0.5], [0.5, 1 - ins], [ins, 0.5]] as const;
    for (let k = 0; k < 4; k++) {
      const [ua, va] = pts[k]!, [ub, vb] = pts[(k + 1) & 3]!;
      if (!dashed) { lotLine(lot, ua, va, 0, ub, vb, 0, colorIdx); continue; }
      const segs = Math.max(2, Math.round(sp.W / 8));
      for (let s = 0; s < segs; s += 2) { const t0 = s / segs, t1 = (s + 1) / segs; lotLine(lot, ua + (ub - ua) * t0, va + (vb - va) * t0, 0, ua + (ub - ua) * t1, va + (vb - va) * t1, 0, colorIdx); }
    }
  };
  ring(0, false);
  if (dense) ring(Math.max(2, Math.round(3 * sp.k)) / (sp.W / 2), true);
  // 内部点阵（每 2 行、每 4 列一点，行间错开）
  const inside = (x: number, y: number): boolean => { const dx = Math.abs(x + 0.5 - sp.W / 2) / (sp.W / 2), dy = Math.abs(y + 0.5 - (lot.baseY + sp.H / 2)) / (sp.H / 2); return dx + dy <= 0.9; };
  if (sp.scale !== 'S') for (let y = lot.baseY; y < lot.baseY + sp.H; y++) for (let x = 0; x < sp.W; x++) if (inside(x, y) && ((y & 1) === 0) && ((x + (y >> 1)) & 3) === 0 && b.data[y * b.w + x] === 0) b.data[y * b.w + x] = colorIdx;
}
