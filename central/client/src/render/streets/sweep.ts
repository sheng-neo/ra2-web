/**
 * 车身扫过的范围（R2 修复轮）：车流按车道位姿画刚体盒子（lanePose + 换道错位渐变，见 streets/index.ts），
 * 弯道、路口接缝处盒子的车头 / 车尾 / 车角会伸出车道中心线。过路处与穿轨区都按「盒子真的碰到」来登记，
 * 车停在区外时整个车身都在区外。全部是纯函数（three 坐标，米）。
 *
 * 登记的区间 [e0, e1] 是「车头位置」口径（与 Traffic.laneCross 相同）：车身半长 h 的车，中心 c 处碰到 ⇔ c ∈ [e0 − h, e1 + h]。
 * 不同车长的盒子在弯道上扫到的范围不同：按几种半长分别求中心区间，换算成车头口径后取并集（对每种车都保守）。
 */
import { lanePose, type Lane } from './lanes';

/** 采样点：车身中心位置与朝向（three xz）、沿本车道位置 s。 */
export interface SweepSample {
  s: number;
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/** 车型半长（m）：私家车 / 的士、小巴、巴士。 */
export const SWEEP_HALF_LENGTHS = [2.5, 3.6, 6.2] as const;
/** 车身半宽上限（巴士 1.25 m）。 */
export const SWEEP_HALF_WIDTH = 1.25;
/** 换道错位渐变距离（m，与 traffic.ts TRANSITION_M 相同）。 */
const TRANSITION = 10;

/**
 * 每条车道的车身中心轨迹采样（step 米一点）：本车道 s ∈ [0, len]；每个上游车道接过来时（错位 > 0.3 m）
 * 前 TRANSITION 米内中心画在「本车道位置 + 错位 × (1 − s / TRANSITION)」，另成一组。
 */
export function laneSweepSamples(lanes: readonly Lane[], step = 0.5): SweepSample[][][] {
  const preds: number[][] = lanes.map(() => []);
  for (const l of lanes) for (const n of l.next) preds[n]?.push(l.id);
  const pose = { x: 0, y: 0, z: 0, hx: 1, hz: 0 };
  return lanes.map((l) => {
    const groups: SweepSample[][] = [];
    const main: SweepSample[] = [];
    const k = Math.max(1, Math.ceil(l.len / step));
    for (let i = 0; i <= k; i++) {
      const s = (i * l.len) / k;
      lanePose(l, s, pose);
      main.push({ s, x: pose.x, z: pose.z, hx: pose.hx, hz: pose.hz });
    }
    groups.push(main);
    for (const p of preds[l.id]!) {
      const P = lanes[p]!;
      const m = P.pts.length / 3;
      const ox = P.pts[(m - 1) * 3]! - l.pts[0]!;
      const oz = P.pts[(m - 1) * 3 + 2]! - l.pts[2]!;
      if (Math.hypot(ox, oz) <= 0.3) continue;
      const g: SweepSample[] = [];
      const end = Math.min(TRANSITION, l.len);
      const kk = Math.max(1, Math.ceil(end / step));
      for (let i = 0; i <= kk; i++) {
        const s = (i * end) / kk;
        lanePose(l, s, pose);
        const w = 1 - s / TRANSITION;
        g.push({ s, x: pose.x + ox * w, z: pose.z + oz * w, hx: pose.hx, hz: pose.hz });
      }
      groups.push(g);
    }
    return groups;
  });
}

/** 盒子四角（xz 平铺 8 个数）。 */
export function boxCorners(c: SweepSample, h: number, w: number, out: number[]): number[] {
  const sx = -c.hz;
  const sz = c.hx;
  out[0] = c.x + c.hx * h + sx * w;
  out[1] = c.z + c.hz * h + sz * w;
  out[2] = c.x - c.hx * h + sx * w;
  out[3] = c.z - c.hz * h + sz * w;
  out[4] = c.x - c.hx * h - sx * w;
  out[5] = c.z - c.hz * h - sz * w;
  out[6] = c.x + c.hx * h - sx * w;
  out[7] = c.z + c.hz * h - sz * w;
  return out;
}

/** 两个凸四边形（xz 平铺）是否相交（分离轴）。 */
export function quadsOverlap(a: readonly number[], b: readonly number[]): boolean {
  for (const p of [a, b])
    for (let k = 0; k < 4; k++) {
      const nx = -(p[((k + 1) % 4) * 2 + 1]! - p[k * 2 + 1]!);
      const nz = p[((k + 1) % 4) * 2]! - p[k * 2]!;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (let j = 0; j < 4; j++) {
        const pa = a[j * 2]! * nx + a[j * 2 + 1]! * nz;
        const pb = b[j * 2]! * nx + b[j * 2 + 1]! * nz;
        a0 = Math.min(a0, pa);
        a1 = Math.max(a1, pa);
        b0 = Math.min(b0, pb);
        b1 = Math.max(b1, pb);
      }
      if (a1 < b0 || b1 < a0) return false;
    }
  return true;
}

/**
 * 一组采样里盒子碰到目标（hit(四角)）的车头口径区间 [e0, e1]（各种车长取并集），碰不到返回 null。
 * hit 收到的四角数组会被复用，不要留着。
 */
export function sweptInterval(
  groups: readonly (readonly SweepSample[])[],
  hit: (corners: number[]) => boolean,
  pad = 0,
  near?: { x: number; z: number; r: number },
  /** hit 是精确的面积相交（短盒子包在长盒子里 ⇒ 长的碰不到短的也碰不到）时可以从长到短试、提前停；点采样的 hit 不行。 */
  nested = true,
): [number, number] | null {
  let e0 = Infinity;
  let e1 = -Infinity;
  const q: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  const H = SWEEP_HALF_LENGTHS;
  const c0 = [Infinity, Infinity, Infinity];
  const c1 = [-Infinity, -Infinity, -Infinity];
  for (const g of groups) {
    c0.fill(Infinity);
    c1.fill(-Infinity);
    for (const c of g) {
      if (near && (c.x - near.x) ** 2 + (c.z - near.z) ** 2 > near.r * near.r) continue;
      // 同一中心、同一朝向：短盒子包在长盒子里，长的碰不到短的也碰不到（从长到短试）
      for (let k = H.length - 1; k >= 0; k--) {
        if (!hit(boxCorners(c, H[k]! + pad, SWEEP_HALF_WIDTH + pad, q))) {
          if (nested) break;
          continue;
        }
        c0[k] = Math.min(c0[k]!, c.s);
        c1[k] = Math.max(c1[k]!, c.s);
      }
    }
    for (let k = 0; k < H.length; k++) {
      if (c0[k]! > c1[k]!) continue;
      // 中心区间 (c0, c1) → 车头口径：车头 > e0 且车尾 < e1 ⇔ 中心 ∈ (e0 − h, e1 + h)
      e0 = Math.min(e0, c0[k]! + H[k]!);
      e1 = Math.max(e1, c1[k]! - H[k]!);
    }
  }
  if (e0 === Infinity) return null;
  // 盒子只擦边（中心区间短于车长）时 e1 < e0：取 e1 = e0，各车长的占用范围仍然包住真实范围
  return [e0, Math.max(e0, e1)];
}
