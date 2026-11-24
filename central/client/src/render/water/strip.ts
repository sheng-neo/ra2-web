/**
 * LOW 档（及 HIGH 降档）倒影：按方位角索引的发光条（1D，STRIP_BINS 格覆盖 360°）。
 * CPU 上把岸上的亮光源（楼面平均亮度、地标冠顶、对岸灯带）按方位角与仰角溅射进去；
 * 由近到远处理，每格只记被更近光源挡剩下的那部分仰角（粗略遮挡）。
 * 每格存：rgb = Σ 亮度 × 可见仰角覆盖率（以 2·σ 波面倾角 ≈ 0.5 rad 为满格），a = 天际线仰角（弧度，该方位最高光源顶部；
 * 水面着色器把它的一半当作光源平均仰角，并认为低于它的反射方向被楼挡住、看不到天光）。
 * 相机移动 > 50 m 或转向 > 5° 才重算（见 water/index.ts）。纯函数，可测。
 */

export const STRIP_BINS = 1024;
/** 满覆盖对应的仰角宽度（弧度）：约等于波面倾角分布 ±2σ 映射到反射角。 */
const FULL_SPAN = 0.5;

export interface Emitter {
  /** 模拟米。 */
  x: number;
  y: number;
  /** 发光段的底与顶（mPD，米）。 */
  z0: number;
  z1: number;
  /** 水平半宽（米）。 */
  halfWidth: number;
  /** 线性亮度（已乘颜色）。 */
  r: number;
  g: number;
  b: number;
}

/** 方位角（弧度，北 = 0，顺时针）→ 格号。 */
export function bearingBin(dx: number, dy: number, bins = STRIP_BINS): number {
  let a = Math.atan2(dx, dy);
  if (a < 0) a += Math.PI * 2;
  return Math.min(bins - 1, Math.floor((a / (Math.PI * 2)) * bins));
}

/**
 * 重算发光条。out 长度 bins × 4（rgba）；camZ 为相机高度（mPD）。
 * maxDist：更远的光源不计（米）。
 */
export function splatStrip(out: Float32Array, emitters: readonly Emitter[], camX: number, camY: number, camZ: number, bins = STRIP_BINS, maxDist = 9000): void {
  out.fill(0);
  const top = new Float32Array(bins).fill(-Math.PI / 2);
  const order = emitters
    .map((e, i) => ({ i, d: Math.hypot(e.x - camX, e.y - camY) }))
    .filter((o) => o.d > 1 && o.d < maxDist)
    .sort((a, b) => a.d - b.d);
  const binW = (Math.PI * 2) / bins;
  for (const { i, d } of order) {
    const e = emitters[i]!;
    const e0 = Math.atan2(e.z0 - camZ, d);
    const e1 = Math.atan2(e.z1 - camZ, d);
    if (e1 <= e0) continue;
    const half = Math.atan2(e.halfWidth, d);
    let a = Math.atan2(e.x - camX, e.y - camY);
    if (a < 0) a += Math.PI * 2;
    const b0 = Math.floor((a - half) / binW);
    const b1 = Math.floor((a + half) / binW);
    for (let b = b0; b <= b1; b++) {
      const k = ((b % bins) + bins) % bins;
      // 本格被光源覆盖的比例（光源比一格窄时按比例摊）
      const lo = Math.max(b * binW, a - half);
      const hi = Math.min((b + 1) * binW, a + half);
      const frac = Math.max(0, hi - lo) / binW;
      if (frac <= 0) continue;
      const visLo = Math.max(e0, top[k]!);
      const vis = Math.max(0, e1 - visLo);
      if (vis <= 0) continue;
      top[k] = Math.max(top[k]!, e1);
      const w = Math.min(vis / FULL_SPAN, 1) * frac;
      out[k * 4] = out[k * 4]! + e.r * w;
      out[k * 4 + 1] = out[k * 4 + 1]! + e.g * w;
      out[k * 4 + 2] = out[k * 4 + 2]! + e.b * w;
      out[k * 4 + 3] = Math.max(out[k * 4 + 3]!, e1);
    }
  }
}
