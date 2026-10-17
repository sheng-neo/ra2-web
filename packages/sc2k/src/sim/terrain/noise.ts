// ===== sim/terrain/noise.ts =====（spec:terrain §3.6；ARCHITECTURE §5.8：无 Math.pow/sin，只用 + − × ÷ floor）
// 值噪声 + fBm：格点值来自契约 hashNoise（无状态、确定性），插值用五次多项式；全部浮点只经基本四则运算，跨引擎可复现。
import { hash32, hashNoise } from '../../contracts/prng';

/** 五次缓和 t³(6t² − 15t + 10)。 */
export const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** spec §3.6 的 pow(n, 1.15) 多项式近似（n ∈ [0,1]）。 */
export const powApprox115 = (n: number): number => n * (0.85 + 0.15 * n);

/** 二维值噪声 ∈ [0,1]；seed 须为 int32。 */
export function valueNoise2(seed: number, px: number, py: number): number {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const u = fade(fx), v = fade(fy);
  const a = hashNoise(seed, ix, iy), b = hashNoise(seed, ix + 1, iy), c = hashNoise(seed, ix, iy + 1), d = hashNoise(seed, ix + 1, iy + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
/** 一维值噪声 ∈ [0,1]。 */
export function valueNoise1(seed: number, t: number): number {
  const it = Math.floor(t);
  return lerp(hashNoise(seed, it, 0), hashNoise(seed, it + 1, 0), fade(t - it));
}
export interface FbmParams { octaves: number; baseFreq: number; gain: number; lacunarity: number }
/** 二维 fBm ∈ [0,1]（按振幅和归一）；每个倍频用 hash32(seed, k) 派生独立格点。 */
export function fbm2(seed: number, x: number, y: number, p: FbmParams): number {
  let amp = 1, freq = p.baseFreq, sum = 0, norm = 0;
  for (let k = 0; k < p.octaves; k++) {
    sum += amp * valueNoise2(hash32(seed, k) | 0, x * freq, y * freq);
    norm += amp; amp *= p.gain; freq *= p.lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}
/** 一维 fBm ∈ [0,1]。 */
export function fbm1(seed: number, t: number, octaves: number, baseFreq: number, gain = 0.5, lacunarity = 2): number {
  let amp = 1, freq = baseFreq, sum = 0, norm = 0;
  for (let k = 0; k < octaves; k++) {
    sum += amp * valueNoise1(hash32(seed, k) | 0, t * freq);
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}
