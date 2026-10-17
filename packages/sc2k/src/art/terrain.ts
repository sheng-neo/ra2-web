// ===== art/terrain.ts =====（spec:ui-art §3.6.2 坡面着色表、§3.7.1 地形 / 边缘岩壁 / 地下地表；WP9）
// 坡面码 0..13 的角位来自 contracts/rotation.SLOPE_CORNERS（bit3=c00=上顶点 U，bit2=c10=右 Rt，bit1=c01=左 Lf，bit0=c11=下 D）。
// 平地色 Grass[i]，i = 3 + altBand；坡面三角按朝向加偏移；地下版用 Earth 色带。
import type { IndexedBitmap } from '../contracts/render';
import { hashNoise } from '../contracts/prng';
import { SLOPE_CORNERS } from '../contracts/rotation';
import { Ramp, ci } from './palette';
import type { ScaleSpec } from './raster';
import { fillPoly, line, newBitmap, setPx } from './raster';
import { fillLot, lotLine, lotPt, newTerrainLot, type Lot } from './iso';

/** 坡面码 → 阶偏移（spec §3.6.2 的倍率四舍五入）：1 朝 +y −1；2 朝 −x +1；3 朝 −y +1；4 朝 +x −2；5–8 低角方向；9–12 高角反方向；13 顶面平。 */
export const SLOPE_SHADE: readonly number[] = [0, -1, 1, 1, -2, 0, 1, -1, -2, 0, 1, -1, -2, 0];
/** 角高（单位：级）：[U, Rt, Lf, D]。 */
export function cornerLevels(nibble: number): [number, number, number, number] {
  const bits = SLOPE_CORNERS[nibble] ?? 0;
  return [(bits >> 3) & 1, (bits >> 2) & 1, (bits >> 1) & 1, bits & 1];
}
/** 地块角 (u,v) 下标：U=(0,0) Rt=(1,0) Lf=(0,1) D=(1,1)。 */
const CORNER_UV: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [0, 1], [1, 1]];
const OPPOSITE: readonly number[] = [3, 2, 1, 0];

/** 剖分：返回 [{ pts(uvz 三元组), slope }]，slope 为 true 的三角形用坡面偏移着色。nibble 13 另行处理。 */
export function triangulate(nibble: number, LEVEL: number): Array<{ uvz: number[]; slope: boolean }> {
  const lv = cornerLevels(nibble);
  const P = (c: number): number[] => [CORNER_UV[c]![0], CORNER_UV[c]![1], lv[c]! * LEVEL];
  if (nibble === 0) return [{ uvz: [...P(0), ...P(1), ...P(3), ...P(2)], slope: false }];
  if (nibble >= 1 && nibble <= 4) return [{ uvz: [...P(0), ...P(1), ...P(3), ...P(2)], slope: true }];
  // 5–8：恰一个低角；9–12：恰一个高角。特殊角 c 与对角 o；剖分沿另两角 p–q。
  const raised = lv.reduce((s, x) => s + x, 0);
  let c = 0;
  for (let k = 0; k < 4; k++) if (lv[k] === (raised === 3 ? 0 : 1)) c = k;
  const o = OPPOSITE[c]!;
  const [p, q] = [0, 1, 2, 3].filter((k) => k !== c && k !== o) as [number, number];
  return [{ uvz: [...P(c), ...P(p), ...P(q)], slope: true }, { uvz: [...P(o), ...P(p), ...P(q)], slope: false }];
}

/** 等高线段（lot 坐标 + 高度分数），t ∈ (0,1)；平地 / 13 无。 */
function contourSegments(nibble: number): Array<[number, number, number, number, number]> {
  const out: Array<[number, number, number, number, number]> = [];
  for (const t of [0.34, 0.67]) {
    const c = t;
    switch (nibble) {
      case 1: out.push([0, t, 1, t, 1 - t]); break;
      case 2: out.push([1 - t, 0, 1 - t, 1, 1 - t]); break;
      case 3: out.push([0, 1 - t, 1, 1 - t, 1 - t]); break;
      case 4: out.push([t, 0, t, 1, 1 - t]); break;
      case 5: out.push([0, c, 1 - c, 1, 1 - c]); break;
      case 6: out.push([0, c, c, 0, c]); break;
      case 7: out.push([c, 0, 1, 1 - c, 1 - c]); break;
      case 8: out.push([c, 1, 1, c, c]); break;
      case 9: out.push([c, 0, 1, 1 - c, c]); break;
      case 10: out.push([c, 1, 1, c, c]); break;
      case 11: out.push([0, c, 1 - c, 1, c]); break;
      case 12: out.push([0, 1 - c, 1 - c, 0, c]); break;
      default: break;
    }
  }
  return out;
}

function drawSlopes(lot: Lot, nibble: number, ramp: Ramp, i: number, shadeMul: number, speckleSeed: number, speckles: number): void {
  const sp = lot.sp;
  const shade = Math.round(SLOPE_SHADE[nibble]! * shadeMul);
  if (nibble === 13) {
    const L = sp.LEVEL;
    fillLot(lot, [0, 0, L, 1, 0, L, 1, 1, L, 0, 1, L], ci(ramp, i));
    fillLot(lot, [0, 1, 0, 1, 1, 0, 1, 1, L, 0, 1, L], ci(Ramp.Earth, 2));
    fillLot(lot, [1, 1, 0, 1, 0, 0, 1, 0, L, 1, 1, L], ci(Ramp.Earth, 1));
    if (sp.scale !== 'S') { lotLine(lot, 0, 1, L * 0.5, 1, 1, L * 0.5, ci(Ramp.Earth, 0)); lotLine(lot, 1, 1, L * 0.5, 1, 0, L * 0.5, ci(Ramp.Earth, 0)); lotLine(lot, 0, 1, L, 1, 1, L, ci(ramp, i - 1)); lotLine(lot, 1, 1, L, 1, 0, L, ci(ramp, i - 1)); }
  } else {
    for (const tri of triangulate(nibble, sp.LEVEL)) fillLot(lot, tri.uvz, ci(ramp, tri.slope ? i + shade : i));
    if (sp.scale !== 'S' && nibble !== 0) {
      const dark = ci(ramp, i + shade - 1);
      for (const [u0, v0, u1, v1, zf] of contourSegments(nibble)) lotLine(lot, u0, v0, zf * sp.LEVEL, u1, v1, zf * sp.LEVEL, dark);
      // 抬高边的脊线
      const lv = cornerLevels(nibble);
      const edges: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 3], [3, 2], [2, 0]];
      for (const [a, b] of edges) if (lv[a] === 1 && lv[b] === 1) lotLine(lot, CORNER_UV[a]![0], CORNER_UV[a]![1], sp.LEVEL, CORNER_UV[b]![0], CORNER_UV[b]![1], sp.LEVEL, ci(ramp, i + shade - 1));
    }
  }
  // 噪点：让大片平地不"塑料"
  const n = sp.scale === 'S' ? Math.min(1, speckles) : speckles;
  for (let k = 0; k < n; k++) {
    const u = 0.12 + 0.76 * hashNoise(speckleSeed, k, 1), v = 0.12 + 0.76 * hashNoise(speckleSeed, k, 2);
    const z = nibble === 13 ? sp.LEVEL : surfaceZ(nibble, u, v, sp.LEVEL);
    const [x, y] = lotPt(lot, u, v, z);
    setPx(lot.bmp, Math.round(x), Math.round(y), ci(ramp, i + (k & 1 ? 1 : -1)));
  }
}

/** 坡面在 (u,v) 的高度（像素）：按 triangulate 的平面三角插值；13 → LEVEL。 */
export function surfaceZ(nibble: number, u: number, v: number, LEVEL: number): number {
  if (nibble === 13) return LEVEL;
  if (nibble === 0) return 0;
  const lv = cornerLevels(nibble);
  const [hU, hR, hL, hD] = lv;
  if (nibble <= 4) return LEVEL * ((1 - u) * (1 - v) * hU! + u * (1 - v) * hR! + (1 - u) * v * hL! + u * v * hD!);
  // 两平面三角：先判在哪个三角（由剖分对角线决定）
  const raised = hU! + hR! + hL! + hD!;
  let c = 0;
  for (let k = 0; k < 4; k++) if (lv[k] === (raised === 3 ? 0 : 1)) c = k;
  // c 为 U 或 D 时对角线为 Lf–Rt（u+v=1）；c 为 Rt 或 Lf 时对角线为 U–D（u=v）
  const inTriC = (c === 0 && u + v <= 1) || (c === 3 && u + v >= 1) || (c === 1 && u >= v) || (c === 2 && v >= u);
  if (!inTriC) return LEVEL * (raised === 3 ? 1 : 0);
  // 含特殊角的三角形平面：高度随到对角线的距离线性变化
  const d = c === 0 ? 1 - u - v : c === 3 ? u + v - 1 : c === 1 ? u - v : v - u;   // 0 在对角线，1 在角 c
  return LEVEL * (raised === 3 ? 1 - d : d);
}

/** 地表 genTerrain(nibble 0..13, altBand 0..2, variant 0..3)。画布 W × (H + LEVEL)，锚点 (W/2, H + LEVEL)。 */
export function genTerrain(nibble: number, altBand: number, variant: number, sp: ScaleSpec): IndexedBitmap {
  const lot = newTerrainLot(sp);
  const i = 3 + Math.max(0, Math.min(2, altBand | 0));
  drawSlopes(lot, nibble, Ramp.Grass, i, 1, (variant & 3) * 64 + nibble + altBand * 16, 2 + (variant & 3));
  return lot.bmp;
}
/** 地下视图地表：同几何，Earth[3] 为主，坡面偏移减半。 */
export function genTerrainUnderground(nibble: number, sp: ScaleSpec): IndexedBitmap {
  const lot = newTerrainLot(sp);
  drawSlopes(lot, nibble, Ramp.Earth, 3, 0.5, 900 + nibble, 3);
  return lot.bmp;
}
/**
 * 地图边缘岩壁 genEdgeWall(levels 1..31, side)：side 'L' 为地块左下边（Lf→D）之下的竖直四边形，'R' 为右下边（D→Rt）之下。
 * 画布 W/2 × (H/2 + levels·LEVEL)；锚点落在地块底顶点 D：L 为 (W/2, H/2)，R 为 (0, H/2)。
 */
export function genEdgeWall(levels: number, side: 'L' | 'R', sp: ScaleSpec): IndexedBitmap {
  const lv = Math.max(1, Math.min(31, levels | 0));
  const w = sp.W >> 1, drop = lv * sp.LEVEL, h = (sp.H >> 1) + drop;
  const b = newBitmap(w, h, side === 'L' ? w : 0, sp.H >> 1);
  const base = ci(Ramp.Earth, side === 'L' ? 2 : 1), dark = ci(Ramp.Earth, 0);
  const pts = side === 'L' ? [0, 0, w, sp.H >> 1, w, h, 0, drop] : [0, sp.H >> 1, w, 0, w, drop, 0, h];
  fillPoly(b, pts, base);
  const step = Math.max(2, Math.round(8 * sp.k));
  for (let y = step; y < drop; y += step) {
    if (side === 'L') line(b, 0, y, w - 1, y + (sp.H >> 1), dark); else line(b, 0, y + (sp.H >> 1), w - 1, y, dark);
  }
  // 地层噪点
  const n = Math.round(lv * (sp.scale === 'L' ? 3 : sp.scale === 'M' ? 1.5 : 0.5));
  for (let k = 0; k < n; k++) {
    const x = Math.floor(hashNoise(lv * 7 + (side === 'L' ? 0 : 1), k, 3) * w), y = Math.floor(hashNoise(lv * 7 + (side === 'L' ? 0 : 1), k, 4) * h);
    if (b.data[y * w + x] === base) b.data[y * w + x] = ci(Ramp.Earth, side === 'L' ? 3 : 2);
  }
  // 最底一行
  if (side === 'L') line(b, 0, drop - 1, w - 1, h - 1, dark); else line(b, 0, h - 1, w - 1, drop - 1, dark);
  return b;
}
