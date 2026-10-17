// ===== sim/transport/piece.ts =====（spec:transport §2.1 拼接规则、§2.5 坡道规则、§3.3 片段选择与交叉件）
// pieceFor(family, i)：给出五族（电线 / 道路 / 铁路 / 地铁 / 管线）在格 i 按当前四邻与坡面应写入的 XBLD / XUND 值：
//  平地 15 片段（末端按直线、孤立取 L-R / 管线十字）、坡面件 idx 2..5（只许沿坡向直线）、铁路坡脚半高件 0x3B–0x3E、
//  与另一族平地直线的直角交叉件（0x43–0x48、0x4B–0x50、XUND 0x1F/0x20）；非法 → −1。车站不参与选片（§4.12）。
import { Dir, DX, DY, dirBit, inMap, opposite, tileIndex, tileX, tileY } from '../../contracts/grid';
import { NET_BASE, SLOPE_PIECE, pieceIndexFor } from '../../contracts/net';
import type { NetFamily } from '../../contracts/net';
import {
  MASK_LR, MASK_TB, SLOPE_LOW_END, crossoverFor, familyPieceIdx, foreignStraight, isRailHalf, isRailSlope, isStraightMask, isSurfaceFamily,
  normalizeStraight, slopeAxis, surfaceConnMask, undConnMask,
} from './model';
import type { SurfaceFamily } from './model';
import { isWaterAt, slopeAt } from './runtime';
import type { Runtime } from './runtime';

/** 四邻中"可向本格连通"的同族格掩码（地表族）。 */
export function surfaceNeighborMask(rt: Runtime, f: SurfaceFamily, i: number): number {
  const L = rt.state.layers;
  const x = tileX(i), y = tileY(i);
  let m = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d]!, ny = y + DY[d]!;
    if (!inMap(nx, ny)) continue;
    const j = tileIndex(nx, ny);
    if ((surfaceConnMask(f, L.xbld[j]!, L.xbit[j]!) & dirBit(opposite(d as Dir))) !== 0) m |= dirBit(d as Dir);
  }
  return m;
}
/** 四邻中可向本格连通的地下同族格掩码。 */
export function undNeighborMask(rt: Runtime, f: 'subway' | 'pipe', i: number): number {
  const xund = rt.state.layers.xund;
  const x = tileX(i), y = tileY(i);
  let m = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d]!, ny = y + DY[d]!;
    if (!inMap(nx, ny)) continue;
    if ((undConnMask(f, xund[tileIndex(nx, ny)]!) & dirBit(opposite(d as Dir))) !== 0) m |= dirBit(d as Dir);
  }
  return m;
}

/** 本格已有的"固定轴向"同族元素（交叉件 / 桥段 / 隧道口 / 匝道 / 转换件 / 入口）能否承载邻接需求 m：m 为 0 或 ⊆ 元素轴的直线 → 保留原值。 */
function keepFixedElement(other: number, ownMask: number, m: number): number {
  if (m === 0) return other;
  const want = normalizeStraight(m);
  return isStraightMask(want) && (want & ~ownMask) === 0 ? other : -1;
}

function surfacePieceFor(rt: Runtime, f: SurfaceFamily, i: number): number {
  const L = rt.state.layers;
  if (isWaterAt(rt, i)) return -1;                                   // 水面走桥（placement 先查 bridgeOptions）
  const s = slopeAt(rt, i);
  const other = L.xbld[i]!;
  const m = surfaceNeighborMask(rt, f, i);
  const ownIdx = familyPieceIdx(f, other);
  const ownFlat = ownIdx >= 0 || (f === 'rail' && isRailHalf(other));
  if (other >= 0x0e && !ownFlat) {
    const ownMask = surfaceConnMask(f, other, L.xbit[i]!);
    if (ownMask !== 0) return keepFixedElement(other, ownMask, m);   // 重复拖过自家交叉件 / 桥 / 隧道口等：免费保留
    if (s !== 0) return -1;                                           // 交叉件只在平地
    const g = foreignStraight(other);
    if (!g) return -1;                                                // 建筑 / 另一族的坡面 / 非直线 → 非法
    const want = normalizeStraight(m);
    if (!isStraightMask(want)) return -1;                             // 本格要成为弯 / 三岔 → 不能叠在别人的直线上
    return crossoverFor(f, want, g.f, g.axis);                        // 平行 / 不支持的组合 → −1
  }
  if (s > 4) return -1;                                               // 只有 0x01..0x04 单级坡能承载直线
  const base = NET_BASE[f];
  if (s !== 0) {
    const axis = slopeAxis(s);
    if ((m & ~axis) !== 0) return -1;                                 // 坡面上不能转弯 / 分叉
    if (f === 'rail') {                                               // 铁路不允许连续坡面（spec:terrain §2.11.3）
      const x = tileX(i), y = tileY(i);
      for (let d = 0; d < 4; d++) {
        if ((axis & dirBit(d as Dir)) === 0) continue;
        const nx = x + DX[d]!, ny = y + DY[d]!;
        if (inMap(nx, ny) && isRailSlope(L.xbld[tileIndex(nx, ny)]!)) return -1;
      }
    }
    return base + SLOPE_PIECE[s]!;
  }
  if (f === 'rail') {
    // 坡脚半高件：本格为直线且恰有一侧轴向邻格是"低端朝向本格"的铁路坡面件
    const want = normalizeStraight(m);
    const x = tileX(i), y = tileY(i);
    let count = 0, halfIdx = -1, foot = false;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!, ny = y + DY[d]!;
      if (!inMap(nx, ny)) continue;
      const id = L.xbld[tileIndex(nx, ny)]!;
      if (!isRailSlope(id)) continue;
      const k = id - NET_BASE.rail;
      if (SLOPE_LOW_END[k] !== opposite(d as Dir)) continue;          // 高端朝向本格：普通平地件即可
      foot = true;
      if ((want & dirBit(d as Dir)) !== 0 && isStraightMask(want)) { count++; halfIdx = k; }
    }
    if (count === 1) return 0x3b + (halfIdx - 2);
    if (count === 2 || (foot && !isStraightMask(want))) return -1;    // 两侧都要爬 / 坡脚是路口 → 非法
    if (foot && isStraightMask(want)) return -1;                      // 坡脚直线却与坡向垂直
  }
  return base + pieceIndexFor(m, f);
}

function undPieceFor(rt: Runtime, f: 'subway' | 'pipe', i: number): number {
  const xund = rt.state.layers.xund;
  const other = xund[i]!;
  const m = undNeighborMask(rt, f, i);
  const ownFlat = f === 'subway' ? other >= 0x01 && other <= 0x0f : other >= 0x10 && other <= 0x1e;
  if (other !== 0 && !ownFlat) {
    const ownMask = undConnMask(f, other);
    if (ownMask !== 0) return keepFixedElement(other, ownMask, m);   // 0x1F / 0x20 交叉件、0x23 地铁入口
    // 另一族的平地直线：地铁 ⟂ 水管 → 0x1F（水管 TB × 地铁 LR）/ 0x20（水管 LR × 地铁 TB）；其它地下物件（0x22 导弹井等）→ 非法
    const gAxis = f === 'subway'
      ? (other === NET_BASE.pipe ? MASK_LR : other === NET_BASE.pipe + 1 ? MASK_TB : 0)
      : (other === NET_BASE.subway ? MASK_LR : other === NET_BASE.subway + 1 ? MASK_TB : 0);
    if (gAxis === 0) return -1;
    const want = normalizeStraight(m);
    if (!isStraightMask(want) || want === gAxis) return -1;
    const subwayAxis = f === 'subway' ? want : gAxis;
    return subwayAxis === MASK_LR ? 0x1f : 0x20;
  }
  return NET_BASE[f] + pieceIndexFor(m, f);
}

/** TransportQuery.pieceFor（§3.3）。 */
export function pieceFor(rt: Runtime, family: NetFamily, i: number): number {
  if (!inMap(tileX(i), tileY(i))) return -1;
  return isSurfaceFamily(family) ? surfacePieceFor(rt, family, i) : undPieceFor(rt, family, i);
}
