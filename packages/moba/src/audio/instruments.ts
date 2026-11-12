/**
 * 合成乐器：配乐与播报乐句共用。每个函数往一个 Patch 里叠加一个音(或一个和弦/一下打击)，
 * t 为相对 Patch 起点的偏移，vel 为 0..1 的力度。音色统一用柔化的自定义波形 + 滤波包络。
 */
import type { Patch } from './synth';

/** 铜管：截止频率先冲高再回落，形成铜管特有的「吐音」 */
export function brass(p: Patch, f: number, t: number, dur: number, vel: number, bright = 1, to?: AudioNode): void {
  const lp = p.filt('lowpass', 420, 1.1, to);
  const top = 2500 * bright * (0.55 + 0.45 * vel);
  p.ramp(lp.frequency, [[t, 420], [t + 0.045, top], [t + 0.22, top * 0.62], [t + Math.max(0.3, dur + 0.1), top * 0.45]]);
  const h = Math.max(0, dur - 0.06);
  p.osc({ w: 'softsaw', f, det: -7, t, a: 0.022, h, d: 0.16, g: 0.2 * vel, to: lp });
  p.osc({ w: 'softsaw', f, det: 8, t: t + 0.003, a: 0.03, h, d: 0.16, g: 0.2 * vel, to: lp });
  p.osc({ w: 'softsq', f: f / 2, t, a: 0.03, h, d: 0.14, g: 0.07 * vel, to: lp });
}

/** 圆号般的柔和主奏：起音更慢、更暗，带延迟颤音 */
export function horn(p: Patch, f: number, t: number, dur: number, vel: number, to?: AudioNode): void {
  const lp = p.filt('lowpass', 380, 0.9, to);
  const top = 2100 * (0.6 + 0.4 * vel);
  p.ramp(lp.frequency, [[t, 380], [t + 0.09, top], [t + Math.max(0.3, dur + 0.15), top * 0.6]]);
  const h = Math.max(0, dur - 0.1);
  p.osc({ w: 'softsaw', f, det: -5, t, a: 0.06, h, d: 0.22, g: 0.2 * vel, vib: 7, vr: 5, vd: 0.25, to: lp });
  p.osc({ w: 'reed', f, det: 6, t, a: 0.07, h, d: 0.22, g: 0.12 * vel, to: lp });
}

/** 钟琴 / 钢片琴：FM 敲击音 */
export function bell(p: Patch, f: number, t: number, dur: number, vel: number, to?: AudioNode): void {
  p.fm({ f, ratio: 3.01, idx: 0.5 + 2.2 * vel, idx1: 0.04, idt: Math.min(0.35, dur), t, a: 0.002, d: dur, g: 0.2 * vel, to });
  p.osc({ f: f * 2, t, a: 0.002, d: dur * 0.4, g: 0.045 * vel, to });
  p.osc({ f: f * 4.2, t, a: 0.001, d: 0.04, g: 0.03 * vel, to });
}

/** 拨弦合成器：滤波包络快速闭合 */
export function pluck(p: Patch, f: number, t: number, dur: number, vel: number, to?: AudioNode): void {
  const d = Math.max(0.2, dur);
  const lp = p.filt('lowpass', 400, 2.2, to);
  p.ramp(lp.frequency, [[t, 800 + 4200 * vel], [t + 0.16, 720], [t + d + 0.05, 380]]);
  p.osc({ w: 'softsaw', f, t, a: 0.004, d, g: 0.22 * vel, to: lp });
  p.osc({ w: 'triangle', f: f * 2, t, a: 0.004, d: d * 0.5, g: 0.06 * vel, to: lp });
}

/** 铺底和弦：每个音两只失谐的柔锯齿分居左右，慢起慢落 */
export function pad(p: Patch, freqs: readonly number[], t: number, dur: number, vel: number, bright = 1, to?: AudioNode): void {
  const lp = p.filt('lowpass', 500, 0.6, to);
  p.ramp(lp.frequency, [[t, 600 * bright], [t + dur * 0.4, 2300 * bright], [t + dur + 1.3, 900 * bright]]);
  const L = p.pan(-0.55, lp);
  const R = p.pan(0.55, lp);
  const a = Math.min(1.0, dur * 0.35);
  const h = Math.max(0, dur - a);
  for (let i = 0; i < freqs.length; i++) {
    const g = (0.085 * vel) / (1 + i * 0.12);
    // 每个音错开几毫秒起振，避免所有振荡器相位对齐
    const ti = t + i * 0.007;
    p.osc({ w: 'softsaw', f: freqs[i], det: -9, t: ti, a, h, d: 1.4, g, to: L });
    p.osc({ w: 'softsaw', f: freqs[i], det: 9, t: ti + 0.011, a: a * 1.1, h, d: 1.4, g, to: R });
  }
  p.osc({ f: freqs[0] / 2, t, a, h, d: 1.2, g: 0.03 * vel, to: lp });
}

/** 低音：正弦基音 + 一层过滤的柔锯齿；punch 越大滤波包络越「弹」 */
export function bass(p: Patch, f: number, t: number, dur: number, vel: number, punch = 0, to?: AudioNode): void {
  const lp = p.filt('lowpass', 300, 1.2, to);
  const top = 380 + 800 * punch + 300 * vel;
  p.ramp(lp.frequency, [[t, top], [t + 0.12, 280 + 160 * punch], [t + dur + 0.3, 220]]);
  // 基音只留一部分给正弦，更多交给带泛音的柔锯齿：小喇叭放不出基音，但能靠泛音「听见」低音
  p.osc({ f, t, a: 0.008, h: dur * 0.8, d: 0.14 + dur * 0.2, g: 0.22 * vel, to });
  p.osc({ w: 'softsaw', f, t, a: 0.006, h: dur * 0.7, d: 0.12 + dur * 0.2, g: 0.26 * vel, to: lp });
}

/** 笛/玻璃质感的柔和主奏，带一点气声 */
export function flute(p: Patch, f: number, t: number, dur: number, vel: number, to?: AudioNode): void {
  p.osc({ w: 'glass', f, t, a: 0.05, h: Math.max(0, dur - 0.1), d: 0.2, g: 0.2 * vel, vib: 9, vr: 5.2, vd: 0.2, to });
  p.osc({ w: 'triangle', f: f * 2, t, a: 0.07, h: Math.max(0, dur - 0.12), d: 0.15, g: 0.03 * vel, to });
  p.noise({ flt: 'bandpass', fc: f * 2, q: 1.5, t, a: 0.03, d: 0.12, g: 0.035 * vel, to });
}

/** 弦乐断奏 */
export function stab(p: Patch, f: number, t: number, dur: number, vel: number, to?: AudioNode): void {
  const lp = p.filt('lowpass', 2200 + 1600 * vel, 0.7, to);
  p.osc({ w: 'softsaw', f, det: -10, t, a: 0.006, h: dur * 0.3, d: dur, g: 0.13 * vel, to: lp });
  p.osc({ w: 'softsaw', f, det: 11, t, a: 0.008, h: dur * 0.3, d: dur, g: 0.13 * vel, to: lp });
  p.noise({ flt: 'bandpass', fc: 2600, q: 1, t, a: 0.002, d: 0.025, g: 0.03 * vel, to });
}

/** 合唱「啊」：柔锯齿和弦过三个共振峰 */
export function choir(p: Patch, freqs: readonly number[], t: number, dur: number, vel: number, to?: AudioNode): void {
  const mix = p.gain(1.6, to);
  const src = p.ctx.createGain();
  src.connect(p.filt('bandpass', 720, 2.2, mix));
  src.connect(p.filt('bandpass', 1150, 2.6, mix));
  src.connect(p.filt('bandpass', 2700, 3, p.gain(0.4, mix)));
  const a = Math.min(0.5, dur * 0.4);
  const h = Math.max(0, dur - a);
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    const ti = t + i * 0.009;
    p.osc({ w: 'softsaw', f, det: -8, t: ti, a, h, d: 0.7, g: 0.16 * vel, vib: 10, vr: 5, vd: 0.3, to: src });
    p.osc({ w: 'softsaw', f, det: 9, t: ti + 0.004, a, h, d: 0.7, g: 0.16 * vel, to: src });
  }
}

// ───────────── 打击乐 ─────────────

export function kick(p: Patch, t: number, vel: number, to?: AudioNode): void {
  p.osc({ f: 150, f1: 46, ft: 0.09, t, a: 0.001, d: 0.26, g: 0.9 * vel, to });
  p.noise({ flt: 'highpass', fc: 1800, t, a: 0.001, d: 0.012, g: 0.18 * vel, to });
}

/** 大鼓(太鼓式)：低沉的鼓腔 + 鼓皮拍击 */
export function taiko(p: Patch, t: number, vel: number, pitch = 1, to?: AudioNode): void {
  p.osc({ f: 118 * pitch, f1: 58 * pitch, ft: 0.14, t, a: 0.002, d: 0.5, g: 0.6 * vel, to });
  p.osc({ w: 'triangle', f: 236 * pitch, f1: 100 * pitch, ft: 0.1, t, a: 0.002, d: 0.2, g: 0.35 * vel, to });
  p.noise({ k: 'pink', flt: 'lowpass', fc: 1400, fc1: 300, t, a: 0.001, d: 0.07, g: 0.3 * vel, to });
}

export function snare(p: Patch, t: number, vel: number, to?: AudioNode): void {
  p.noise({ flt: 'bandpass', fc: 2100, q: 0.6, t, a: 0.001, d: 0.15, g: 0.45 * vel, to });
  p.osc({ w: 'triangle', f: 210, f1: 150, t, a: 0.001, d: 0.08, g: 0.35 * vel, to });
}

export function clap(p: Patch, t: number, vel: number, to?: AudioNode): void {
  p.noise({ flt: 'bandpass', fc: 1300, q: 1.1, t, a: 0.001, d: 0.02, g: 0.3 * vel, to });
  p.noise({ flt: 'bandpass', fc: 1300, q: 1.1, t: t + 0.011, a: 0.001, d: 0.02, g: 0.3 * vel, to });
  p.noise({ flt: 'bandpass', fc: 1300, q: 1.1, t: t + 0.023, a: 0.001, d: 0.13, g: 0.3 * vel, to });
}

export function hat(p: Patch, t: number, vel: number, open = false, to?: AudioNode): void {
  p.noise({ flt: 'highpass', fc: 7200, t, a: 0.001, d: open ? 0.22 : 0.05, g: 0.7 * vel, to });
}

export function shaker(p: Patch, t: number, vel: number, to?: AudioNode): void {
  p.noise({ flt: 'bandpass', fc: 5600, q: 1.4, t, a: 0.012, d: 0.05, g: 0.5 * vel, to });
}

export function rim(p: Patch, t: number, vel: number, to?: AudioNode): void {
  p.osc({ f: 1650, t, a: 0.001, d: 0.022, g: 0.3 * vel, to });
  p.osc({ w: 'triangle', f: 430, t, a: 0.001, d: 0.035, g: 0.3 * vel, to });
  p.noise({ flt: 'highpass', fc: 3000, t, a: 0.001, d: 0.008, g: 0.15 * vel, to });
}

export function cymbal(p: Patch, t: number, vel: number, dur = 1.6, to?: AudioNode): void {
  p.noise({ flt: 'highpass', fc: 4200, t, a: 0.002, d: dur, g: 0.3 * vel, to });
  p.noise({ flt: 'bandpass', fc: 8200, q: 2, t, a: 0.002, d: dur * 0.6, g: 0.18 * vel, to });
  p.ring(3100, [1, 1.34, 1.72, 2.31], { t, a: 0.002, d: dur * 0.5, g: 0.02 * vel, to });
}

/** 反向镲：渐强后收住，用在乐句交接处 */
export function swell(p: Patch, t: number, dur: number, vel: number, to?: AudioNode): void {
  p.noise({ flt: 'highpass', fc: 2500, fc1: 7000, t, a: dur, d: 0.08, g: 0.22 * vel, to });
}

export function timpani(p: Patch, f: number, t: number, vel: number, to?: AudioNode): void {
  p.osc({ f: f * 1.12, f1: f, ft: 0.06, t, a: 0.002, d: 0.9, g: 0.75 * vel, to });
  p.osc({ f: f * 1.5, t, a: 0.002, d: 0.4, g: 0.2 * vel, to });
  p.osc({ f: f * 2, t, a: 0.002, d: 0.25, g: 0.1 * vel, to });
  p.noise({ k: 'pink', flt: 'lowpass', fc: 900, fc1: 200, t, a: 0.001, d: 0.06, g: 0.4 * vel, to });
}
