/**
 * 电车脚踏铃「叮叮」（R2 TRAMS T10）：纯函数部分（音色参数、两下敲击时刻、距离增益、立体声相位），可在 Node 里测。
 * 音色：四个不谐和正弦分音，频率比 1 : 2.76 : 5.40 : 8.93（自由端金属板 / 钟的经典比例），
 * 基频 1000 Hz ± 80（按车的种子），振幅 1 : 0.6 : 0.35 : 0.2；起音 2 ms，基音指数衰减 τ = 0.22 s（约 1 s 衰减到 −40 dB；
 * 规格写 τ ≈ 0.3 s 又写约 0.9 s 到 −60 dB，两者对不上，取中间值），高分音衰减更快，
 * 每下敲击另有 3 ms 噪声「咔」声。两下敲击相隔 0.25 s。
 */

export const BELL_RATIOS = [1, 2.76, 5.4, 8.93] as const;
export const BELL_AMPS = [1, 0.6, 0.35, 0.2] as const;
export const BELL_ATTACK_S = 0.002;
export const BELL_TAU_S = 0.22;
export const BELL_GAP_S = 0.25;
export const BELL_CLICK_S = 0.003;
/** 一次打铃的总时长（第二下之后衰减到 −60 dB）。 */
export const BELL_DURATION_S = BELL_GAP_S + 7 * BELL_TAU_S;
/** 最多同时响几次铃。 */
export const MAX_BELL_VOICES = 4;
/** 只有离相机这个距离（m）内离站的车才打铃。 */
export const BELL_RANGE_M = 120;

export interface Partial {
  freq: number;
  amp: number;
  /** 衰减时间常数（s）。 */
  tau: number;
}

/** 一辆车的铃的分音表（seed 0–1 定基频）。 */
export function bellPartials(seed: number): Partial[] {
  const f0 = 1000 + (seed * 2 - 1) * 80;
  return BELL_RATIOS.map((r, k) => ({ freq: f0 * r, amp: BELL_AMPS[k]!, tau: BELL_TAU_S / (1 + 0.45 * k) }));
}

/** 两下敲击相对第一下的时刻（s）。 */
export function bellStrikes(): number[] {
  return [0, BELL_GAP_S];
}

/** 单下敲击、单个分音在时刻 t（s，相对敲击）的包络（0–1）：2 ms 线性起音，之后指数衰减。 */
export function strikeEnvelope(t: number, tau: number): number {
  if (t < 0) return 0;
  if (t < BELL_ATTACK_S) return t / BELL_ATTACK_S;
  return Math.exp(-(t - BELL_ATTACK_S) / tau);
}

/** 距离增益：1 / (1 + d / 15)，超出 BELL_RANGE_M 为 0。 */
export function distanceGain(d: number): number {
  if (d > BELL_RANGE_M) return 0;
  return 1 / (1 + Math.max(d, 0) / 15);
}

/**
 * 立体声相位（−1 左 … +1 右）：声源相对相机的方位角（水平面）。
 * camRight：相机右方向（three xz），toSource：相机 → 声源（three xz）。
 */
export function panFor(camRightX: number, camRightZ: number, toX: number, toZ: number): number {
  const l = Math.hypot(toX, toZ);
  if (l < 1e-6) return 0;
  const rl = Math.hypot(camRightX, camRightZ) || 1;
  return Math.max(-1, Math.min(1, (camRightX * toX + camRightZ * toZ) / (rl * l)));
}

/** 主音量：峰值 ≤ −12 dBFS（四个分音振幅和 2.15，第二下叠在第一下的尾音上，再留余量）。 */
export const MASTER_GAIN = Math.pow(10, -12 / 20) / 2.6;

// ---------------------------------------------------------------------------------------------
// 牵引马达声（T13）：锯齿波 → 低通（300–900 Hz 随车速），只听最近两辆、80 m 内的车
// ---------------------------------------------------------------------------------------------

export const HUM_RANGE_M = 80;
export const HUM_VOICES = 2;

/** 马达声参数（纯函数）：频率（Hz）、低通截止（Hz）、增益（0–1，乘距离增益前）。 */
export function humParams(speed: number): { freq: number; cutoff: number; gain: number } {
  const v = Math.max(0, Math.min(speed, 7)) / 7;
  return { freq: 55 + 240 * v, cutoff: 300 + 600 * v, gain: 0.25 * Math.min(1, v * 1.3) };
}

/** 马达声的距离增益（比铃声衰减快）。 */
export function humDistanceGain(d: number): number {
  if (d > HUM_RANGE_M) return 0;
  return (1 / (1 + Math.max(d, 0) / 8)) * (1 - d / HUM_RANGE_M);
}
