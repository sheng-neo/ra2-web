// ===== art/terrain.ts =====（spec:ui-art §3.6.2 坡面着色表、§3.7.1 地形 / 边缘岩壁 / 地下地表；WP9；INT-C 打磨）
// 坡面码 0..13 的角位来自 contracts/rotation.SLOPE_CORNERS（bit3=c00=上顶点 U，bit2=c10=右 Rt，bit1=c01=左 Lf，bit0=c11=下 D）。
// 平地色 Grass[i]，i = 3 + altBand；坡面三角只靠明暗面区分（半阶用 50% 抖动合成，S 档四舍五入），不画等高线 / 脊线 —— 整张地图
// 才不会像"等高线图"（INT-C 实测）；只有 bedrock（13）保留岩壁的地层线。地下版用 Earth 色带、倍率减半。
import type { IndexedBitmap } from '../contracts/render';
import { hashNoise } from '../contracts/prng';
import { SLOPE_CORNERS } from '../contracts/rotation';
import { Ramp, ci } from './palette';
import type { ScaleSpec } from './raster';
import { ditherFill, fillPoly, line, newBitmap, setPx } from './raster';
import { fillLot, lotLine, lotPoly, lotPt, newTerrainLot, type Lot } from './iso';

/**
 * 坡面码 → 阶偏移（可为半阶；屏幕左上光源）：1 朝 +y（屏幕左下）−1；2 朝 −x（左上）+1；3 朝 −y（右上）+½；4 朝 +x（右下）−1½；
 * 5–8 低角方向 / 9–12 高角反方向的对角：(−x,−y) +1、(−x,+y) 0、(+x,−y) −½、(+x,+y) −1½；13 顶面平。
 * 比 spec §3.6.2 表（+x 为 −2）收敛半阶：Grass 色带相邻两阶亮度差约 0.1，整两阶的背光坡在真实地图里过黑。
 */
export const SLOPE_SHADE: readonly number[] = [0, -1, 1, 0.5, -1.5, 0, 1, -0.5, -1.5, 0, 1, -0.5, -1.5, 0];
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

/** 半阶着色：整阶直接填；半阶在 M / L 用 50% 棋盘抖动合成（S 档四舍五入到整阶）。 */
function fillShaded(lot: Lot, uvz: readonly number[], ramp: Ramp, i: number, shade: number): void {
  const lo = Math.floor(shade), hi = Math.ceil(shade);
  if (lo === hi || lot.sp.scale === 'S') { fillLot(lot, uvz, ci(ramp, i + Math.round(shade))); return; }
  ditherFill(lot.bmp, lotPoly(lot, uvz), ci(ramp, i + hi), ci(ramp, i + lo), 'checker');
}

function drawSlopes(lot: Lot, nibble: number, ramp: Ramp, i: number, shadeMul: number, speckleSeed: number, speckles: number): void {
  const sp = lot.sp;
  if (nibble === 13) {
    const L = sp.LEVEL;
    fillLot(lot, [0, 0, L, 1, 0, L, 1, 1, L, 0, 1, L], ci(ramp, i));
    fillLot(lot, [0, 1, 0, 1, 1, 0, 1, 1, L, 0, 1, L], ci(Ramp.Earth, 2));
    fillLot(lot, [1, 1, 0, 1, 0, 0, 1, 0, L, 1, 1, L], ci(Ramp.Earth, 1));
    if (sp.scale !== 'S') { lotLine(lot, 0, 1, L * 0.5, 1, 1, L * 0.5, ci(Ramp.Earth, 0)); lotLine(lot, 1, 1, L * 0.5, 1, 0, L * 0.5, ci(Ramp.Earth, 0)); lotLine(lot, 0, 1, L, 1, 1, L, ci(ramp, i - 1)); lotLine(lot, 1, 1, L, 1, 0, L, ci(ramp, i - 1)); }
  } else {
    const shade = SLOPE_SHADE[nibble]! * shadeMul;
    for (const tri of triangulate(nibble, sp.LEVEL)) { if (tri.slope) fillShaded(lot, tri.uvz, ramp, i, shade); else fillLot(lot, tri.uvz, ci(ramp, i)); }
  }
  // 噪点：让大片平地不"塑料"（坡面上也落，但只落同阶 ±1，不形成线）
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
