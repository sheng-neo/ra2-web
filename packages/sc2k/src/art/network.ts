// ===== art/network.ts =====（spec:ui-art §3.7.3 道路 / 铁路 / 电线 / 管线 / 地铁 / 高速 / 交叉件 / 隧道口 / 桥件 / 匝道；WP9）
// 15 片段由 contracts/net.PIECE_MASK 给出连接掩码（bit0=T bit1=R bit2=B bit3=L），坡面件 idx 2..5 ↔ XTER 1..4。
// 带子在"地面多边形"上绘制：坡面时顶点高度按角高线性插值。翻转族（桥件 / 高架电线）只画 L–R 轴向，T–B 由渲染器水平镜像。
import type { IndexedBitmap } from '../contracts/render';
import { Dir } from '../contracts/grid';
import { PIECE_MASK } from '../contracts/net';
import { SLOPE_CORNERS } from '../contracts/rotation';
import { Ramp, ci } from './palette';
import type { ScaleSpec } from './raster';
import { fillEllipse, fillRect, line, newBitmap, px, px0, setPx } from './raster';
import { fillLot, groundDiamond, isoBox, lotLine, lotPoly, lotPt, newObjectLot, type Lot } from './iso';
import { fillPoly } from './raster';

export type NetKind = 'road' | 'rail' | 'power' | 'pipe' | 'subway';
export type ZFn = (u: number, v: number) => number;
export const flatZ: ZFn = () => 0;
/** XTER 1..4 边坡的高度函数（角高双线性）。 */
export function slopeZ(xter: number, LEVEL: number): ZFn {
  const bits = SLOPE_CORNERS[xter] ?? 0;
  const hU = (bits >> 3) & 1, hR = (bits >> 2) & 1, hL = (bits >> 1) & 1, hD = bits & 1;
  return (u, v) => LEVEL * ((1 - u) * (1 - v) * hU + u * (1 - v) * hR + (1 - u) * v * hL + u * v * hD);
}
/** 坡面件 idx 2..5 → XTER 1..4；其余 0。 */
export const pieceXter = (idx: number): number => (idx >= 2 && idx <= 5 ? idx - 1 : 0);

interface Net { lot: Lot; z: ZFn; sp: ScaleSpec }
const EXT = 0.14;
/** 方向 d 的带子矩形（从中心伸向边中点并略超出），hw 为半宽。 */
function bandRect(d: Dir, hw: number, ext = EXT): [number, number, number, number] {
  switch (d) {
    case Dir.T: return [0.5 - hw, -ext, 0.5 + hw, 0.5];
    case Dir.R: return [0.5, 0.5 - hw, 1 + ext, 0.5 + hw];
    case Dir.B: return [0.5 - hw, 0.5, 0.5 + hw, 1 + ext];
    default: return [-ext, 0.5 - hw, 0.5, 0.5 + hw];
  }
}
const quadZ = (net: Net, u0: number, v0: number, u1: number, v1: number): number[] => [u0, v0, net.z(u0, v0), u1, v0, net.z(u1, v0), u1, v1, net.z(u1, v1), u0, v1, net.z(u0, v1)];
const fillQ = (net: Net, u0: number, v0: number, u1: number, v1: number, idx: number): void => fillLot(net.lot, quadZ(net, u0, v0, u1, v1), idx);
const lineZ = (net: Net, u0: number, v0: number, u1: number, v1: number, idx: number, lw = 1, dz = 0): void => lotLine(net.lot, u0, v0, net.z(u0, v0) + dz, u1, v1, net.z(u1, v1) + dz, idx, lw);

/** 把一组矩形画成掩码位图（与画布同尺寸）。 */
function maskOf(net: Net, rects: ReadonlyArray<readonly [number, number, number, number]>): IndexedBitmap {
  const m = newBitmap(net.lot.bmp.w, net.lot.bmp.h, 0, 0);
  const tmp: Lot = { ...net.lot, bmp: m };
  for (const [u0, v0, u1, v1] of rects) fillLot(tmp, quadZ(net, u0, v0, u1, v1), 1);
  return m;
}
/** 地块四边形掩码（裁剪用）。 */
function clipMask(net: Net): IndexedBitmap {
  const m = newBitmap(net.lot.bmp.w, net.lot.bmp.h, 0, 0);
  fillPoly(m, lotPoly(net.lot, quadZ(net, 0, 0, 1, 1)), 1);
  return m;
}
/** 掩码 ∧ 裁剪 → 填色；curb 给出时，掩码边缘像素（4 邻有外部；L 档含 8 邻）画路缘色。 */
function paintMask(net: Net, mask: IndexedBitmap, clip: IndexedBitmap | null, fill: number, curb?: number): void {
  const b = net.lot.bmp, w = b.w, h = b.h;
  const m = mask.data;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 1 : m[y * w + x]!);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (m[k] === 0 || (clip && clip.data[k] === 0)) continue;
    let v = fill;
    if (curb !== undefined) {
      const edge4 = at(x - 1, y) === 0 || at(x + 1, y) === 0 || at(x, y - 1) === 0 || at(x, y + 1) === 0;
      const edge8 = net.sp.scale === 'L' && (at(x - 1, y - 1) === 0 || at(x + 1, y - 1) === 0 || at(x - 1, y + 1) === 0 || at(x + 1, y + 1) === 0 || at(x - 2, y) === 0 || at(x + 2, y) === 0);
      if (edge4 || edge8) v = curb;
    }
    b.data[k] = v;
  }
}
const dirs = (mask: number): Dir[] => [Dir.T, Dir.R, Dir.B, Dir.L].filter((d) => (mask >> d) & 1);
/** 方向 d 的单位向量 (du, dv) 与"右侧"垂直方向。 */
const DIRV: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const PERP: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // T→R 侧, R→B 侧, B→L 侧, L→T 侧
const ADJ: ReadonlyArray<readonly [Dir, Dir]> = [[Dir.R, Dir.L], [Dir.B, Dir.T], [Dir.L, Dir.R], [Dir.T, Dir.B]];   // [正侧邻向, 负侧邻向]

/** 道路：Asphalt[3] 带 + Neutral[6] 路缘 + 中心虚线（L/M）。 */
export function drawRoad(net: Net, mask: number, clip: IndexedBitmap | null): void {
  const hw = 0.3125;
  const rects: Array<[number, number, number, number]> = [[0.5 - hw, 0.5 - hw, 0.5 + hw, 0.5 + hw]];
  for (const d of dirs(mask)) rects.push(bandRect(d, hw));
  paintMask(net, maskOf(net, rects), clip, ci(Ramp.Asphalt, 3), ci(Ramp.Neutral, 6));
  if (net.sp.scale === 'S') return;
  const dash = ci(Ramp.Neutral, 5);
  for (const d of dirs(mask)) {
    const [du, dv] = DIRV[d]!;
    for (let t = hw + 0.03; t < 0.5; t += 0.125) {
      const t2 = Math.min(0.5, t + 0.06);
      lineZ(net, 0.5 + du * t, 0.5 + dv * t, 0.5 + du * t2, 0.5 + dv * t2, dash);
    }
  }
}
/** 铁路：道砟带 + 枕木 + 两条钢轨（弯道在中心方形处成直角）。dim 为地下版的降阶。 */
export function drawRail(net: Net, mask: number, clip: IndexedBitmap | null, opts: { ballast?: number | null; dim?: number; trench?: boolean } = {}): void {
  const dim = opts.dim ?? 0;
  const g = 0.09375, tieHalf = 0.14, tieStep = 0.09375, tieW = 0.03;
  const hwB = opts.trench ? 0.156 : 0.17;
  const ds = dirs(mask);
  if (opts.ballast !== null) {
    const rects: Array<[number, number, number, number]> = [[0.5 - hwB, 0.5 - hwB, 0.5 + hwB, 0.5 + hwB]];
    for (const d of ds) rects.push(bandRect(d, hwB));
    paintMask(net, maskOf(net, rects), clip, opts.ballast ?? ci(Ramp.Sand, 3), opts.trench ? ci(Ramp.Earth, 0) : undefined);
  }
  const tie = ci(Ramp.Rust, Math.max(0, 2 - dim)), railIdx = ci(Ramp.Neutral, Math.max(2, 6 - dim));
  const junction = ds.length >= 3;
  for (const d of ds) {
    const [du, dv] = DIRV[d]!, [pu, pv] = PERP[d]!;
    for (let s = junction ? hwB + tieStep / 2 : tieStep / 2; s < 0.5 + 0.08; s += tieStep) {
      const cu = 0.5 + du * s, cv = 0.5 + dv * s;
      fillLot(net.lot, [cu - pu * tieHalf - du * tieW / 2, cv - pv * tieHalf - dv * tieW / 2, net.z(cu - pu * tieHalf, cv - pv * tieHalf),
        cu + pu * tieHalf - du * tieW / 2, cv + pv * tieHalf - dv * tieW / 2, net.z(cu + pu * tieHalf, cv + pv * tieHalf),
        cu + pu * tieHalf + du * tieW / 2, cv + pv * tieHalf + dv * tieW / 2, net.z(cu + pu * tieHalf, cv + pv * tieHalf),
        cu - pu * tieHalf + du * tieW / 2, cv - pv * tieHalf + dv * tieW / 2, net.z(cu - pu * tieHalf, cv - pv * tieHalf)], tie);
    }
  }
  for (const d of ds) {
    const [du, dv] = DIRV[d]!, [pu, pv] = PERP[d]!;
    for (const side of [1, -1] as const) {
      const adj = ADJ[d]![side === 1 ? 0 : 1];
      const start = ((mask >> adj) & 1) ? g : -g;    // 内侧轨从转角起，外侧轨穿过中心
      const ou = pu * g * side, ov = pv * g * side;
      lineZ(net, 0.5 + ou + du * start, 0.5 + ov + dv * start, 0.5 + ou + du * (0.5 + 0.02), 0.5 + ov + dv * (0.5 + 0.02), railIdx);
    }
  }
}
/** 电线：中心立杆 + 横担 + 到各连接边中点的下垂导线。 */
export function drawPower(net: Net, mask: number, poleHL = 22): void {
  const sp = net.sp;
  const poleH = px(sp, poleHL), poleW = px(sp, 2);
  const [cx, cy] = lotPt(net.lot, 0.5, 0.5, net.z(0.5, 0.5));
  const x = Math.round(cx), y = Math.round(cy);
  fillRect(net.lot.bmp, x - (poleW >> 1), y - poleH, poleW, poleH, ci(Ramp.Rust, 1));
  const arm = px(sp, 8);
  fillRect(net.lot.bmp, x - (arm >> 1), y - poleH + px(sp, 2), arm, Math.max(1, px0(sp, 1)), ci(Ramp.Rust, 2));
  if (sp.scale === 'L') { setPx(net.lot.bmp, x - (arm >> 1), y - poleH + 1, ci(Ramp.Glass, 6)); setPx(net.lot.bmp, x + (arm >> 1) - 1, y - poleH + 1, ci(Ramp.Glass, 6)); }
  const wire = ci(Ramp.Neutral, 1), sag = px(sp, 2);
  for (const d of dirs(mask)) {
    const [du, dv] = DIRV[d]!;
    const eu = 0.5 + du * 0.5, ev = 0.5 + dv * 0.5;
    const [ex, ey] = lotPt(net.lot, eu, ev, net.z(eu, ev));
    const x0 = x, y0 = y - poleH + px(sp, 2), x1 = Math.round(ex), y1 = Math.round(ey) - poleH + px(sp, 2);
    const steps = Math.max(2, Math.abs(x1 - x0) + Math.abs(y1 - y0));
    let lx = x0, ly = y0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const wx = Math.round(x0 + (x1 - x0) * t), wy = Math.round(y0 + (y1 - y0) * t + 4 * sag * t * (1 - t));
      line(net.lot.bmp, lx, ly, wx, wy, wire); lx = wx; ly = wy;
    }
  }
}
/** 管线（地下）：Teal[3] 带 + Teal[1] 边 + 有水时中心 Water[6] 线；≥3 连接时中心接头方块。 */
export function drawPipe(net: Net, mask: number, watered: boolean): void {
  const hw = 0.078;
  const ds = dirs(mask);
  const rects: Array<[number, number, number, number]> = [[0.5 - hw, 0.5 - hw, 0.5 + hw, 0.5 + hw]];
  for (const d of ds) rects.push(bandRect(d, hw));
  paintMask(net, maskOf(net, rects), clipMask(net), ci(Ramp.Teal, 3), ci(Ramp.Teal, 1));
  if (watered && net.sp.scale !== 'S') { const c = ci(Ramp.Water, 6); for (const d of ds) { const [du, dv] = DIRV[d]!; lineZ(net, 0.5, 0.5, 0.5 + du * 0.5, 0.5 + dv * 0.5, c); } }
  if (ds.length >= 3) {
    const j = 0.11;
    fillQ(net, 0.5 - j, 0.5 - j, 0.5 + j, 0.5 + j, ci(Ramp.Teal, 4));
    lineZ(net, 0.5 - j, 0.5 - j, 0.5 + j, 0.5 - j, ci(Ramp.Teal, 1)); lineZ(net, 0.5 - j, 0.5 - j, 0.5 - j, 0.5 + j, ci(Ramp.Teal, 1));
    lineZ(net, 0.5 + j, 0.5 - j, 0.5 + j, 0.5 + j, ci(Ramp.Teal, 1)); lineZ(net, 0.5 - j, 0.5 + j, 0.5 + j, 0.5 + j, ci(Ramp.Teal, 1));
    if (watered) fillQ(net, 0.5 - j * 0.4, 0.5 - j * 0.4, 0.5 + j * 0.4, 0.5 + j * 0.4, ci(Ramp.Water, 6));
  }
}
/** 地铁（地下）：Earth[1] 隧道槽 + 降 2 阶的轨枕 / 钢轨。 */
export function drawSubway(net: Net, mask: number): void {
  drawRail(net, mask, clipMask(net), { ballast: ci(Ramp.Earth, 1), dim: 2, trench: true });
}

/** 高架桥面：带子矩形 (u0,v0)-(u1,v1)，顶面高度 zTop(u,v)，厚 thick；画两侧面、顶面、护栏与中线。 */
export interface DeckOpts { top?: number; side?: number; rail?: number | null; dash?: number | null; thick?: number; axis: 'u' | 'v' }
export function deck(net: Net, u0: number, v0: number, u1: number, v1: number, zTop: ZFn, o: DeckOpts): void {
  const sp = net.sp;
  const thick = o.thick ?? px(sp, 6);
  const top = o.top ?? ci(Ramp.Asphalt, 4), side = o.side ?? ci(Ramp.WarmGray, 3), sideDark = ci(Ramp.WarmGray, 2);
  const lot = net.lot;
  // 左侧面（v = v1）与右侧面（u = u1）
  fillLot(lot, [u0, v1, zTop(u0, v1) - thick, u1, v1, zTop(u1, v1) - thick, u1, v1, zTop(u1, v1), u0, v1, zTop(u0, v1)], side);
  fillLot(lot, [u1, v1, zTop(u1, v1) - thick, u1, v0, zTop(u1, v0) - thick, u1, v0, zTop(u1, v0), u1, v1, zTop(u1, v1)], sideDark);
  fillLot(lot, [u0, v0, zTop(u0, v0), u1, v0, zTop(u1, v0), u1, v1, zTop(u1, v1), u0, v1, zTop(u0, v1)], top);
  const railIdx = o.rail === null ? null : (o.rail ?? ci(Ramp.Neutral, 5));
  if (railIdx !== null && sp.scale !== 'S') {
    if (o.axis === 'u') { lotLine(lot, u0, v0, zTop(u0, v0), u1, v0, zTop(u1, v0), railIdx); lotLine(lot, u0, v1, zTop(u0, v1), u1, v1, zTop(u1, v1), railIdx); }
    else { lotLine(lot, u0, v0, zTop(u0, v0), u0, v1, zTop(u0, v1), railIdx); lotLine(lot, u1, v0, zTop(u1, v0), u1, v1, zTop(u1, v1), railIdx); }
  }
  const dashIdx = o.dash === null ? null : (o.dash ?? ci(Ramp.Amber, 6));
  if (dashIdx !== null && sp.scale !== 'S') {
    const cm = o.axis === 'u' ? (v0 + v1) / 2 : (u0 + u1) / 2;
    const a0 = o.axis === 'u' ? u0 : v0, a1 = o.axis === 'u' ? u1 : v1;
    for (let t = a0 + 0.04; t < a1; t += 0.19) {
      const t2 = Math.min(a1, t + 0.09);
      if (o.axis === 'u') lotLine(lot, t, cm, zTop(t, cm), t2, cm, zTop(t2, cm), dashIdx); else lotLine(lot, cm, t, zTop(cm, t), cm, t2, zTop(cm, t2), dashIdx);
    }
  }
}
/** 桥墩：从地面 z(u,v) 到 zBottom 的方柱。 */
export function pylon(net: Net, u: number, v: number, zBottom: number, wL = 4, ramp: Ramp = Ramp.WarmGray, i0 = 2): void {
  const w = wL / 64;
  const z0 = net.z(u, v);
  const h = zBottom - z0;
  if (h <= 0) return;
  isoBox(net.lot, u - w / 2, v - w / 2, u + w / 2, v + w / 2, h, ramp, i0, { z0, outline: false, noTop: true });
}

const HWY_HW = 0.47;
export const hwyDeckZ = (sp: ScaleSpec): number => Math.round(sp.LEVEL * 0.75);
/** 1×1 高速直线段（axis 'u' = L–R）。 */
export function drawHighwayStraight(net: Net, axis: 'u' | 'v'): void {
  const zd = hwyDeckZ(net.sp);
  const zTop: ZFn = (u, v) => net.z(u, v) + zd;
  if (axis === 'u') { pylon(net, 0.5, 0.5 - 0.3, zd - px(net.sp, 6)); pylon(net, 0.5, 0.5 + 0.3, zd - px(net.sp, 6)); deck(net, 0, 0.5 - HWY_HW, 1, 0.5 + HWY_HW, zTop, { axis: 'u' }); }
  else { pylon(net, 0.5 - 0.3, 0.5, zd - px(net.sp, 6)); pylon(net, 0.5 + 0.3, 0.5, zd - px(net.sp, 6)); deck(net, 0.5 - HWY_HW, 0, 0.5 + HWY_HW, 1, zTop, { axis: 'v' }); }
}

function newNet(sp: ScaleSpec, z: ZFn = flatZ, n: 1 | 2 = 1): Net { return { lot: newObjectLot(sp, n), z, sp }; }

/** 道路 / 铁路 / 电线片段 idx 0..14（含坡面件）。 */
export function genNetwork(kind: 'road' | 'rail' | 'power', idx: number, sp: ScaleSpec): IndexedBitmap {
  const i = Math.max(0, Math.min(14, idx | 0));
  const xter = pieceXter(i);
  const net = newNet(sp, xter ? slopeZ(xter, sp.LEVEL) : flatZ);
  const mask = PIECE_MASK[i]!;
  const clip = xter ? clipMask(net) : null;   // 坡面件：带子裁剪到坡面四边形，地表由 terrain 层负责（海拔带颜色一致）
  if (kind === 'road') drawRoad(net, mask, clip);
  else if (kind === 'rail') drawRail(net, mask, clip);
  else drawPower(net, mask);
  return net.lot.bmp;
}
/** 地下片段：地铁 idx / 管线 idx（watered 变体）。 */
export function genUnderground(kind: 'subway' | 'pipe', idx: number, watered: boolean, sp: ScaleSpec): IndexedBitmap {
  const net = newNet(sp);
  const mask = PIECE_MASK[Math.max(0, Math.min(14, idx | 0))]!;
  if (kind === 'pipe') drawPipe(net, mask, watered); else drawSubway(net, mask);
  return net.lot.bmp;
}
/** 交叉件 0x43–0x48 与高速交叉 0x4B–0x50。 */
export function genCrossover(id: number, sp: ScaleSpec): IndexedBitmap {
  const net = newNet(sp);
  const LR = PIECE_MASK[0]!, TB = PIECE_MASK[1]!;
  switch (id) {
    case 0x43: drawRoad(net, LR, null); drawPower(net, TB); break;
    case 0x44: drawRoad(net, TB, null); drawPower(net, LR); break;
    case 0x45: drawRoad(net, LR, null); drawRail(net, TB, null, { ballast: null }); break;
    case 0x46: drawRoad(net, TB, null); drawRail(net, LR, null, { ballast: null }); break;
    case 0x47: drawRail(net, LR, null); drawPower(net, TB); break;
    case 0x48: drawRail(net, TB, null); drawPower(net, LR); break;
    case 0x4b: drawRoad(net, TB, null); drawHighwayStraight(net, 'u'); break;
    case 0x4c: drawRoad(net, LR, null); drawHighwayStraight(net, 'v'); break;
    case 0x4d: drawRail(net, TB, null); drawHighwayStraight(net, 'u'); break;
    case 0x4e: drawRail(net, LR, null); drawHighwayStraight(net, 'v'); break;
    case 0x4f: drawPower(net, TB, 14); drawHighwayStraight(net, 'u'); break;
    default: drawPower(net, LR, 14); drawHighwayStraight(net, 'v'); break;
  }
  return net.lot.bmp;
}
/** 地铁 × 管线交叉：0x1F 地铁 L–R × 管线 T–B；0x20 相反。 */
export function genUndCrossover(code: number, watered: boolean, sp: ScaleSpec): IndexedBitmap {
  const net = newNet(sp);
  const LR = PIECE_MASK[0]!, TB = PIECE_MASK[1]!;
  if (code === 0x1f) { drawSubway(net, LR); drawPipe(net, TB, watered); } else { drawSubway(net, TB); drawPipe(net, LR, watered); }
  return net.lot.bmp;
}
/** 隧道口 genTunnelPortal(dir)：朝 dir 的半边为山体，道路自对边接入拱门。 */
export function genTunnelPortal(dir: Dir, sp: ScaleSpec): IndexedBitmap {
  const net = newNet(sp);
  const opp = ((dir + 2) & 3) as Dir;
  const hw = 0.3125;
  // 道路半带（从对边到中心）
  const rects: Array<[number, number, number, number]> = [bandRect(opp, hw), [0.5 - hw, 0.5 - hw, 0.5 + hw, 0.5 + hw]];
  paintMask(net, maskOf(net, rects), null, ci(Ramp.Asphalt, 3), ci(Ramp.Neutral, 6));
  // 山体：朝 dir 的半格，高 0.9 LEVEL，Earth 色 + 顶面草
  const h = Math.round(sp.LEVEL * 0.9);
  const r = bandRect(dir, 0.5, 0);
  const u0 = Math.max(0, r[0]), v0 = Math.max(0, r[1]), u1 = Math.min(1, r[2]), v1 = Math.min(1, r[3]);
  isoBox(net.lot, u0, v0, u1, v1, h, Ramp.Earth, 2, { top: ci(Ramp.Grass, 4), outline: false });
  // 拱门：在山体朝向道路的面上（dir=T → 面 v=0.5（+y 侧可见）；dir=L → 面 u=0.5（+x 侧可见）；B / R 的入口面背向观者，只画顶缘暗口）
  const arch = ci(Ramp.Asphalt, 1);
  const [ax, ay] = lotPt(net.lot, dir === Dir.T ? 0.5 : dir === Dir.L ? 0.5 : dir === Dir.B ? 0.5 : 0.5, dir === Dir.T ? 0.5 : dir === Dir.L ? 0.5 : dir === Dir.B ? 0.5 : 0.5);
  const aw = Math.max(2, 12 * sp.k), ah = Math.max(2, h * 0.8);
  if (dir === Dir.T || dir === Dir.L) {
    fillRect(net.lot.bmp, Math.round(ax - aw), Math.round(ay - ah * 0.55), Math.round(aw * 2), Math.round(ah * 0.55), arch);
    fillEllipse(net.lot.bmp, ax, ay - ah * 0.55, aw, ah * 0.45, arch);
    if (sp.scale !== 'S') { line(net.lot.bmp, Math.round(ax - aw) - 1, Math.round(ay - ah * 0.55), Math.round(ax - aw) - 1, Math.round(ay), ci(Ramp.Neutral, 6)); line(net.lot.bmp, Math.round(ax + aw), Math.round(ay - ah * 0.55), Math.round(ax + aw), Math.round(ay), ci(Ramp.Neutral, 6)); }
  } else {
    fillEllipse(net.lot.bmp, ax, ay - h, aw * 0.9, Math.max(1, 3 * sp.k), arch);
  }
  return net.lot.bmp;
}
/** 铁路坡脚半高件 0x3B–0x3E：高端方向 highDir 抬 LEVEL/2 的路堤 + 直线铁路。 */
export function genRailHalf(highDir: Dir, sp: ScaleSpec): IndexedBitmap {
  const half = sp.LEVEL / 2;
  const z: ZFn = (u, v) => highDir === Dir.T ? half * (1 - v) : highDir === Dir.B ? half * v : highDir === Dir.R ? half * u : half * (1 - u);
  const net = newNet(sp, z);
  fillLot(net.lot, quadZ(net, 0, 0, 1, 1), ci(Ramp.Grass, 3));
  // 路堤侧面（朝观者的两边）
  fillLot(net.lot, [0, 1, 0, 1, 1, 0, 1, 1, z(1, 1), 0, 1, z(0, 1)], ci(Ramp.Earth, 3));
  fillLot(net.lot, [1, 1, 0, 1, 0, 0, 1, 0, z(1, 0), 1, 1, z(1, 1)], ci(Ramp.Earth, 2));
  const mask = (highDir === Dir.T || highDir === Dir.B) ? PIECE_MASK[1]! : PIECE_MASK[0]!;
  drawRail(net, mask, null);
  return net.lot.bmp;
}
/** 地铁↔铁路转换件 0x6C–0x6F：自 dir 边接入的铁路 + 中心下行坑口。 */
export function genSubRail(dir: Dir, sp: ScaleSpec): IndexedBitmap {
  const net = newNet(sp);
  groundDiamond(net.lot, ci(Ramp.Sand, 4));
  drawRail(net, 1 << dir, null);
  const j = 0.2;
  fillQ(net, 0.5 - j, 0.5 - j, 0.5 + j, 0.5 + j, ci(Ramp.Neutral, 1));
  const frame = ci(Ramp.Rust, 3);
  lineZ(net, 0.5 - j, 0.5 - j, 0.5 + j, 0.5 - j, frame); lineZ(net, 0.5 - j, 0.5 - j, 0.5 - j, 0.5 + j, frame);
  lineZ(net, 0.5 + j, 0.5 - j, 0.5 + j, 0.5 + j, frame); lineZ(net, 0.5 - j, 0.5 + j, 0.5 + j, 0.5 + j, frame);
  if (sp.scale !== 'S') { const [du, dv] = DIRV[dir]!; for (const t of [0.05, 0.11, 0.17]) lineZ(net, 0.5 + du * t - dv * 0.1, 0.5 + dv * t - du * 0.1, 0.5 + du * t + dv * 0.1, 0.5 + dv * t + du * 0.1, ci(Ramp.Neutral, 3)); }
  return net.lot.bmp;
}
/** 匝道 0x5D–0x60：道路自 roadSide 接入，爬升到 hwySide 边的高速桥面高度。 */
export function genOnramp(hwySide: Dir.T | Dir.B, roadSide: Dir.L | Dir.R, sp: ScaleSpec): IndexedBitmap {
  const net = newNet(sp);
  const hw = 0.3125;
  const zd = hwyDeckZ(sp);
  const rects: Array<[number, number, number, number]> = [bandRect(roadSide, hw), [0.5 - hw, 0.5 - hw, 0.5 + hw, 0.5 + hw]];
  paintMask(net, maskOf(net, rects), null, ci(Ramp.Asphalt, 3), ci(Ramp.Neutral, 6));
  const vEnd = hwySide === Dir.T ? 0 : 1, vStart = 0.5;
  const zAt = (v: number): number => zd * Math.abs(v - vStart) / 0.5;
  const zTop: ZFn = (_u, v) => zAt(v);
  // 挡土侧面 + 坡面
  fillLot(net.lot, [0.5 - hw, vEnd, 0, 0.5 + hw, vEnd, 0, 0.5 + hw, vEnd, zAt(vEnd), 0.5 - hw, vEnd, zAt(vEnd)], ci(Ramp.WarmGray, 3));
  fillLot(net.lot, [0.5 + hw, vStart, 0, 0.5 + hw, vEnd, 0, 0.5 + hw, vEnd, zAt(vEnd), 0.5 + hw, vStart, 0], ci(Ramp.WarmGray, 2));
  const v0 = Math.min(vStart, vEnd), v1 = Math.max(vStart, vEnd);
  deck(net, 0.5 - hw, v0, 0.5 + hw, v1, zTop, { axis: 'v', thick: 0, dash: null, top: ci(Ramp.Asphalt, 3) });
  return net.lot.bmp;
}

export type BridgePart = 'suspStart' | 'suspMid' | 'suspCenter' | 'suspMidT' | 'suspEnd' | 'raisingTower' | 'causewayPylon' | 'deck' | 'raisingUp' | 'railPylon' | 'railDeck' | 'elevatedWire';
export const BRIDGE_PART_BY_ID: Readonly<Record<number, BridgePart>> = { 0x51: 'suspStart', 0x52: 'suspMid', 0x53: 'suspCenter', 0x54: 'suspMidT', 0x55: 'suspEnd', 0x56: 'raisingTower', 0x57: 'causewayPylon', 0x58: 'deck', 0x59: 'raisingUp', 0x5a: 'railPylon', 0x5b: 'railDeck', 0x5c: 'elevatedWire' };
/** 桥件（L–R 轴向；桥面抬高 LEVEL）。 */
export function genBridge(part: BridgePart, sp: ScaleSpec): IndexedBitmap {
  const net = newNet(sp);
  const L = sp.LEVEL;
  const hw = 0.3125, thick = px(sp, 4);
  const deckZ: ZFn = () => L;
  const roadDeck = (): void => deck(net, 0, 0.5 - hw, 1, 0.5 + hw, deckZ, { axis: 'u', thick, dash: null, rail: ci(Ramp.Neutral, 6) });
  const pylons = (): void => { pylon(net, 0.5, 0.5 - hw - 0.03, L - thick, 4); pylon(net, 0.5, 0.5 + hw + 0.03, L - thick, 4); pylon(net, 0.5, 0.5, L - thick, 6); };
  const rust = ci(Ramp.Rust, 3), cable = ci(Ramp.Neutral, 2);
  const towerH = px(sp, 48);
  switch (part) {
    case 'causewayPylon': pylons(); roadDeck(); break;
    case 'deck': roadDeck(); break;
    case 'railPylon': pylons(); deck(net, 0, 0.5 - 0.2, 1, 0.5 + 0.2, deckZ, { axis: 'u', thick, dash: null, rail: null, top: ci(Ramp.Rust, 2), side: ci(Ramp.Rust, 2) }); drawRail({ ...net, z: deckZ }, PIECE_MASK[0]!, null, { ballast: null }); break;
    case 'railDeck': deck(net, 0, 0.5 - 0.2, 1, 0.5 + 0.2, deckZ, { axis: 'u', thick, dash: null, rail: null, top: ci(Ramp.Rust, 2), side: ci(Ramp.Rust, 2) }); drawRail({ ...net, z: deckZ }, PIECE_MASK[0]!, null, { ballast: null }); break;
    case 'elevatedWire': { const n2: Net = { ...net, z: () => 0 }; drawPower(n2, PIECE_MASK[0]!, 40); break; }
    case 'suspCenter': {
      roadDeck();
      for (const v of [0.5 - hw - 0.04, 0.5 + hw + 0.04]) { const [x, y] = lotPt(net.lot, 0.5, v, L); fillRect(net.lot.bmp, Math.round(x) - px(sp, 2), Math.round(y) - towerH, px(sp, 4), towerH + px(sp, 6), rust); }
      const [tx, ty] = lotPt(net.lot, 0.5, 0.5, L);
      fillRect(net.lot.bmp, Math.round(tx) - px(sp, 18), Math.round(ty) - towerH, px(sp, 36), px(sp, 3), rust);
      for (const u of [0, 1]) { const [ex, ey] = lotPt(net.lot, u, 0.5 - hw - 0.04, L + px(sp, 10)); line(net.lot.bmp, Math.round(tx) - px(sp, 2) * (u ? -1 : 1), Math.round(ty) - towerH, Math.round(ex), Math.round(ey), cable); }
      break;
    }
    case 'suspMid': case 'suspMidT': {
      roadDeck();
      const dirSign = part === 'suspMid' ? 1 : -1;
      const [ax, ay] = lotPt(net.lot, dirSign > 0 ? 0 : 1, 0.5 - hw - 0.04, L + px(sp, 10)), [bx, by] = lotPt(net.lot, dirSign > 0 ? 1 : 0, 0.5 - hw - 0.04, L + px(sp, 30));
      line(net.lot.bmp, Math.round(ax), Math.round(ay), Math.round(bx), Math.round(by), cable);
      for (let t = 0.15; t < 1; t += 0.28) { const [hx, hy] = lotPt(net.lot, dirSign > 0 ? t : 1 - t, 0.5 - hw - 0.04, L); const cy = Math.round(ay + (by - ay) * t); line(net.lot.bmp, Math.round(hx), Math.round(hy), Math.round(hx), cy, cable); }
      break;
    }
    case 'suspStart': case 'suspEnd': {
      roadDeck();
      const u = part === 'suspStart' ? 0.12 : 0.88;
      isoBox(net.lot, u - 0.08, 0.5 - hw - 0.1, u + 0.08, 0.5 - hw - 0.02, px(sp, 10), Ramp.WarmGray, 3, { z0: L, outline: false });
      const [ax, ay] = lotPt(net.lot, u, 0.5 - hw - 0.06, L + px(sp, 10)), [bx, by] = lotPt(net.lot, part === 'suspStart' ? 1 : 0, 0.5 - hw - 0.04, L + px(sp, 14));
      line(net.lot.bmp, Math.round(ax), Math.round(ay), Math.round(bx), Math.round(by), cable);
      break;
    }
    case 'raisingTower': {
      roadDeck();
      for (const v of [0.5 - hw - 0.04, 0.5 + hw + 0.04]) isoBox(net.lot, 0.5 - 0.06, v - 0.04, 0.5 + 0.06, v + 0.04, px(sp, 36), Ramp.Rust, 3, { z0: L });
      break;
    }
    default: {   // raisingUp：桥面竖起
      pylons();
      const zTop: ZFn = (u) => L + u * px(sp, 44);
      deck(net, 0, 0.5 - hw, 0.6, 0.5 + hw, zTop, { axis: 'u', thick, dash: null });
      break;
    }
  }
  return net.lot.bmp;
}
/** 高速 2×2 件 0x61–0x69 与加固高速桥 0x6A / 0x6B。 */
export function genHighway2x2(id: number, sp: ScaleSpec): IndexedBitmap {
  const lot = newObjectLot(sp, 2);
  const net: Net = { lot, z: flatZ, sp };
  const zd = hwyDeckZ(sp), L = sp.LEVEL;
  const hw = HWY_HW;
  const legs = (pts: ReadonlyArray<readonly [number, number]>, zb: number): void => { for (const [u, v] of pts) pylon(net, u, v, zb, 5); };
  const flat: ZFn = () => zd;
  switch (id) {
    case 0x61: case 0x63: {   // T–B 轴坡：0x61 T 高，0x63 B 高
      const zT: ZFn = (_u, v) => zd + (id === 0x61 ? (1 - v / 2) : v / 2) * L;
      legs([[1 - 0.33, 0.5], [1 + 0.33, 0.5], [1 - 0.33, 1.5], [1 + 0.33, 1.5]], zd - px(sp, 6));
      deck(net, 1 - hw, 0, 1 + hw, 2, zT, { axis: 'v' }); break;
    }
    case 0x62: case 0x64: {   // L–R 轴坡：0x62 R 高，0x64 L 高
      const zT: ZFn = (u) => zd + (id === 0x62 ? u / 2 : 1 - u / 2) * L;
      legs([[0.5, 1 - 0.33], [0.5, 1 + 0.33], [1.5, 1 - 0.33], [1.5, 1 + 0.33]], zd - px(sp, 6));
      deck(net, 0, 1 - hw, 2, 1 + hw, zT, { axis: 'u' }); break;
    }
    case 0x65: case 0x66: case 0x67: case 0x68: {   // 弯：BR BL TL TR
      const a: Dir = id === 0x65 ? Dir.B : id === 0x66 ? Dir.B : id === 0x67 ? Dir.T : Dir.T;
      const b: Dir = id === 0x65 ? Dir.R : id === 0x66 ? Dir.L : id === 0x67 ? Dir.L : Dir.R;
      legs([[1 - 0.33, 1 - 0.33], [1 + 0.33, 1 + 0.33], [1 + 0.33, 1 - 0.33], [1 - 0.33, 1 + 0.33]], zd - px(sp, 6));
      for (const d of [a, b]) {
        const r = bandRect(d, hw, 0).map((x) => x * 2) as [number, number, number, number];
        const [u0, v0, u1, v1] = r;
        deck(net, u0, v0, u1, v1, flat, { axis: d === Dir.T || d === Dir.B ? 'v' : 'u', dash: null, rail: null });
      }
      deck(net, 1 - hw, 1 - hw, 1 + hw, 1 + hw, flat, { axis: 'u', dash: null, rail: null });
      break;
    }
    case 0x69: {   // 立交：两向直线 + 中心板
      legs([[0.5, 1 - 0.33], [0.5, 1 + 0.33], [1.5, 1 - 0.33], [1.5, 1 + 0.33], [1 - 0.33, 0.5], [1 + 0.33, 0.5], [1 - 0.33, 1.5], [1 + 0.33, 1.5]], zd - px(sp, 6));
      deck(net, 0, 1 - hw, 2, 1 + hw, flat, { axis: 'u' });
      deck(net, 1 - hw, 0, 1 + hw, 2, () => zd + px(sp, 10), { axis: 'v' });
      legs([[1 - 0.33, 1 - 0.33], [1 + 0.33, 1 + 0.33]], zd + px(sp, 4));
      break;
    }
    case 0x6a: {   // 加固桥（带桥墩）
      const zT: ZFn = () => L + zd;
      legs([[0.5, 1 - 0.36], [0.5, 1 + 0.36], [1.5, 1 - 0.36], [1.5, 1 + 0.36], [1, 1]], L + zd - px(sp, 6));
      deck(net, 0, 1 - hw, 2, 1 + hw, zT, { axis: 'u', thick: px(sp, 8) }); break;
    }
    default: {     // 0x6B 加固桥面
      deck(net, 0, 1 - hw, 2, 1 + hw, () => L + zd, { axis: 'u', thick: px(sp, 8) }); break;
    }
  }
  return lot.bmp;
}

/** XUND 杂项：0x00 空、0x21 建筑短管桩、0x22 导弹井地下、0x23 地铁入口。 */
export function genUndMisc(code: number, watered: boolean, sp: ScaleSpec): IndexedBitmap {
  const net = newNet(sp);
  if (code === 0x00) return net.lot.bmp;
  if (code === 0x21) {
    const j = 0.1;
    for (const d of [Dir.T, Dir.R, Dir.B, Dir.L]) { const [du, dv] = DIRV[d]!; const hw = 0.05; fillQ(net, 0.5 + Math.min(0, du * 0.22) - (du ? 0 : hw), 0.5 + Math.min(0, dv * 0.22) - (dv ? 0 : hw), 0.5 + Math.max(0, du * 0.22) + (du ? 0 : hw), 0.5 + Math.max(0, dv * 0.22) + (dv ? 0 : hw), ci(Ramp.Teal, 3)); }
    fillQ(net, 0.5 - j, 0.5 - j, 0.5 + j, 0.5 + j, ci(Ramp.Teal, 4));
    lineZ(net, 0.5 - j, 0.5 - j, 0.5 + j, 0.5 - j, ci(Ramp.Teal, 1)); lineZ(net, 0.5 - j, 0.5 - j, 0.5 - j, 0.5 + j, ci(Ramp.Teal, 1));
    lineZ(net, 0.5 + j, 0.5 - j, 0.5 + j, 0.5 + j, ci(Ramp.Teal, 1)); lineZ(net, 0.5 - j, 0.5 + j, 0.5 + j, 0.5 + j, ci(Ramp.Teal, 1));
    if (watered) fillQ(net, 0.5 - j * 0.45, 0.5 - j * 0.45, 0.5 + j * 0.45, 0.5 + j * 0.45, ci(Ramp.Water, 6));
    return net.lot.bmp;
  }
  if (code === 0x22) {
    const [x, y] = lotPt(net.lot, 0.5, 0.5);
    const r = Math.max(2, 14 * sp.k);
    fillEllipse(net.lot.bmp, x, y, r, r / 2, ci(Ramp.Teal, 2));
    fillEllipse(net.lot.bmp, x, y, r * 0.75, r * 0.375, ci(Ramp.Neutral, 0));
    fillEllipse(net.lot.bmp, x, y, r * 0.45, r * 0.22, ci(Ramp.Teal, 4));
    if (sp.scale !== 'S') fillEllipse(net.lot.bmp, x, y, r * 0.15, r * 0.08, ci(Ramp.Signal, 5));
    return net.lot.bmp;
  }
  // 0x23 地铁入口：短槽 + 站台块 + 台阶
  drawSubway(net, PIECE_MASK[0]!);
  isoBox(net.lot, 0.3, 0.5 - 0.3, 0.7, 0.5 - 0.17, px(sp, 6), Ramp.Neutral, 4, { outline: false });
  if (sp.scale !== 'S') for (const t of [0.36, 0.44, 0.52, 0.6]) lineZ(net, t, 0.5 - 0.17, t, 0.5 - 0.3, ci(Ramp.Neutral, 2), 1, px(sp, 6) + 1);
  return net.lot.bmp;
}
