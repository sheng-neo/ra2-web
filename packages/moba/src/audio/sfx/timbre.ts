/**
 * 主题音色：五位英雄与野怪各自的「材质」，供施放提示、技能特效、普攻与弹道的配方共用。
 * 樊哙 = 铜盾厚木与战鼓；程咬金 = 生铁重击与挥空呼啸；王昭君 = 琵琶拨弦；李广 = 弓弦、箭啸与钉入声；荆轲 = 击筑与匕首。
 * 每个函数往 Patch 里叠加一个音(或一下打击)，t 为相对 Patch 起点的偏移，g 为这一下的力度。
 */
import type { NoiseKind, Patch } from '../synth';

/** 铜盾面的泛音比：接近圆板的振动模式，低而浑 */
export const BRONZE = [1, 1.52, 2.27, 3.05] as const;
/** 生铁斧头的泛音比：自由棒的弯曲模式，音高感模糊 */
export const IRON = [1, 2.76, 5.4] as const;

/** 战鼓：鼓腔下坠 + 鼓皮拍击 */
export function drum(p: Patch, t: number, g: number, pitch = 1, len = 0.42, to?: AudioNode): void {
  p.osc({ f: 128 * pitch, f1: 56 * pitch, ft: 0.13, t, a: 0.002, d: len, g: g * 0.8, to });
  p.osc({ w: 'triangle', f: 250 * pitch, f1: 110 * pitch, ft: 0.08, t, a: 0.002, d: len * 0.4, g: g * 0.4, to });
  p.noise({ k: 'pink', flt: 'lowpass', fc: 1500, fc1: 320, t, a: 0.001, d: 0.06, g: g * 0.35, to });
}

/** 盾击：厚木的「咚」+ 铜盾面的嗡鸣(每个分音配一只略微失谐的伙伴，起拍后就是「嗡——」) */
export function shield(p: Patch, f: number, t: number, d: number, g: number, to?: AudioNode): void {
  p.osc({ w: 'triangle', f: 210, f1: 120, ft: 0.05, t, a: 0.001, d: 0.09, g: g * 0.55, to });
  p.noise({ k: 'pink', flt: 'bandpass', fc: 520, q: 1.4, t, a: 0.001, d: 0.045, g: g * 0.6, to });
  for (let i = 0; i < BRONZE.length; i++) {
    const fi = f * BRONZE[i];
    const gi = (g * 0.3) / (1 + i * 0.8);
    const di = d / (1 + i * 0.5);
    p.osc({ f: fi, t, a: 0.002, d: di, g: gi, to });
    if (i < 2) p.osc({ f: fi * 1.013, t, a: 0.004, d: di * 0.9, g: gi * 0.6, to });
  }
  // 金属相碰的瞬态
  p.noise({ flt: 'bandpass', fc: Math.min(4200, f * 4.2), q: 3, t, a: 0.001, d: 0.03, g: g * 0.25, to });
}

/** 一声短喝：粗糙的低音过三个共振峰。不求像人声，只要读作「喝！」 */
export function shout(p: Patch, t: number, d: number, g: number, f = 135, to?: AudioNode): void {
  const mix = p.gain(1.5, to);
  const src = p.ctx.createGain();
  src.connect(p.filt('bandpass', 700, 3, mix));
  src.connect(p.filt('bandpass', 1150, 3.5, mix));
  src.connect(p.filt('bandpass', 2600, 3, p.gain(0.35, mix)));
  p.osc({ w: 'sawtooth', f: f * 1.18, f1: f * 0.8, ft: d, t, a: 0.02, h: d * 0.3, d: d * 0.7, g, vib: 60, vr: 31, vd: 0, to: src });
  p.noise({ k: 'pink', t, a: 0.015, h: d * 0.2, d: d * 0.8, g: g * 0.5, to: src });
}

/** 生铁重击：闷的「哐」。生铁不像钢那样长鸣，分音衰减很快 */
export function iron(p: Patch, f: number, t: number, g: number, len = 0.2, to?: AudioNode): void {
  p.osc({ w: 'triangle', f: 190, f1: 75, ft: 0.07, t, a: 0.001, d: 0.12, g: g * 0.6, to });
  p.noise({ flt: 'bandpass', fc: 2100, q: 0.9, t, a: 0.001, d: 0.035, g: g * 0.6, to });
  for (let i = 0; i < IRON.length; i++) {
    p.osc({ f: f * IRON[i], t, a: 0.001, d: len / (1 + i * 0.6), g: (g * 0.32) / (1 + i * 0.6), to });
  }
  // 一只不在分音列上的三角波：听起来更像粗糙的铸铁，而不是音叉
  p.osc({ w: 'triangle', f: f * 1.47, t, a: 0.001, d: len * 0.5, g: g * 0.12, to });
}

/** 挥空呼啸：带通噪声的中心频率先扬后落(f0 → fPeak → f1) */
export function whoosh(p: Patch, t: number, d: number, g: number, f0: number, fPeak: number, f1: number, q = 1.2, k: NoiseKind = 'white', to?: AudioNode): void {
  const bp = p.filt('bandpass', f0, q, to);
  p.ramp(bp.frequency, [[t, f0], [t + d * 0.45, fPeak], [t + d, f1]]);
  // 带通之后只剩一小部分能量：这里直接给足增益(不经过 noise 的滤波补偿)
  p.noise({ k, t, a: d * 0.4, d: d * 0.6, g: g * 2.4, to: bp });
}

/**
 * 琵琶拨弦：指甲触弦的「啪」+ 靠近码子拨弦的明亮弦音，高次泛音很快收拢。
 * f1 给出时音高滑向 f1(推拉弦 / 下行滑音)。
 */
export function pipa(p: Patch, f: number, t: number, d: number, g: number, f1?: number, to?: AudioNode): void {
  const lp = p.filt('lowpass', 2000, 1.3, to);
  const top = Math.min(15000, f * 10 + 2000);
  p.ramp(lp.frequency, [[t, top], [t + 0.045, Math.max(1500, f * 3.5)], [t + Math.max(0.1, d), Math.max(800, f * 1.6)]]);
  // 弦被拨开的瞬间张力略高：音高从稍高处落回
  if (f1 === undefined) p.osc({ w: 'string', f: f * 1.014, f1: f, ft: 0.035, t, a: 0.001, d, g: g * 0.62, to: lp });
  else p.osc({ w: 'string', f, f1, ft: d * 0.7, t, a: 0.001, d, g: g * 0.62, to: lp });
  p.osc({ w: 'string', f: (f1 ?? f) * 2.003, t: t + 0.002, a: 0.001, d: d * 0.4, g: g * 0.1, to: lp });
  p.noise({ flt: 'bandpass', fc: 3400, q: 1.1, t, a: 0.001, d: 0.011, g: g * 0.45, to });
  // 桐木面板的一下共鸣
  p.osc({ w: 'triangle', f: 330, f1: 250, t, a: 0.001, d: 0.04, g: g * 0.2, to });
}

/** 轮指用的轻拨：只有一只振荡器，几十个连着排也不重。snap = 是否带指甲声 */
export function pick(p: Patch, f: number, t: number, d: number, g: number, snap: boolean, to?: AudioNode): void {
  p.osc({ w: 'string', f, t, a: 0.001, d, g: g * 0.6, to });
  if (snap) p.noise({ flt: 'bandpass', fc: 3400, q: 1.1, t, a: 0.001, d: 0.008, g: g * 0.3, to });
}

/** 一声雁鸣：两个音节的簧片音过一个鼻音共振峰 */
export function honk(p: Patch, t: number, g: number, to?: AudioNode): void {
  const bp = p.filt('bandpass', 1250, 2.2, to);
  p.osc({ w: 'reed', f: 500, f1: 430, t, a: 0.015, h: 0.05, d: 0.07, g, to: bp });
  p.osc({ w: 'reed', f: 610, f1: 470, t: t + 0.15, a: 0.02, h: 0.08, d: 0.14, g: g * 1.1, to: bp });
}

/** 击筑：竹尺敲在弦上——短、硬、偏冷；两根弦略微失谐 */
export function zhu(p: Patch, f: number, t: number, d: number, g: number, to?: AudioNode): void {
  const lp = p.filt('lowpass', 3000, 0.9, to);
  p.ramp(lp.frequency, [[t, Math.min(12000, f * 12)], [t + 0.03, Math.max(1800, f * 4)], [t + Math.max(0.08, d), Math.max(900, f * 2)]]);
  p.osc({ w: 'zhu', f, det: -6, t, a: 0.001, d, g: g * 0.4, to: lp });
  p.osc({ w: 'zhu', f, det: 7, t: t + 0.003, a: 0.001, d: d * 0.85, g: g * 0.3, to: lp });
  // 竹尺的「嗒」
  p.noise({ flt: 'bandpass', fc: 2600, q: 2, t, a: 0.001, d: 0.008, g: g * 0.5, to });
  p.osc({ f: 1250, f1: 800, t, a: 0.001, d: 0.012, g: g * 0.15, to });
}

/** 弓弦：「嘣」——音高很快落回的闷弹 + 弦拍弓臂的一下 */
export function twang(p: Patch, f: number, t: number, d: number, g: number, to?: AudioNode): void {
  const lp = p.filt('lowpass', 2600, 1.2, to);
  p.ramp(lp.frequency, [[t, 2600], [t + d * 0.8, 420]]);
  p.osc({ w: 'triangle', f: f * 1.16, f1: f, ft: 0.045, t, a: 0.001, d, g: g * 0.7, to: lp });
  p.osc({ w: 'softsaw', f: f * 2.32, f1: f * 2, ft: 0.045, t, a: 0.001, d: d * 0.5, g: g * 0.3, to: lp });
  p.noise({ flt: 'bandpass', fc: 1900, q: 1.6, t, a: 0.001, d: 0.012, g: g * 0.45, to });
}

/** 拉弓的吱呀：粘滑抖动的窄带声，音高随张力上行 */
export function creak(p: Patch, t: number, d: number, g: number, to?: AudioNode): void {
  const bp = p.filt('bandpass', 600, 5, to);
  p.ramp(bp.frequency, [[t, 600], [t + d, 1100]]);
  const am = p.gain(0.5, bp);
  p.lfo(am.gain, 34, 0.5, t, d, 52);
  p.osc({ w: 'sawtooth', f: 92, f1: 150, ft: d, t, a: d * 0.5, d: d * 0.5, g, to: am });
  p.noise({ k: 'pink', t, a: d * 0.5, d: d * 0.5, g: g * 0.4, to: am });
}

/** 箭矢钉入：「笃」——短促的木质闷响 */
export function thunk(p: Patch, t: number, g: number, pitch = 1, to?: AudioNode): void {
  p.osc({ f: 340 * pitch, f1: 170 * pitch, t, a: 0.001, d: 0.05, g: g * 0.7, to });
  p.osc({ w: 'triangle', f: 700 * pitch, f1: 380 * pitch, t, a: 0.001, d: 0.022, g: g * 0.3, to });
  p.noise({ flt: 'bandpass', fc: 1500 * pitch, q: 1.8, t, a: 0.001, d: 0.016, g: g * 0.5, to });
}

/** 箭啸：「咻」——窄带噪声 + 一丝哨音，频率随飞行变化 */
export function whistle(p: Patch, t: number, d: number, g: number, f0: number, f1: number, to?: AudioNode): void {
  const a = Math.min(0.03, d * 0.3);
  p.noise({ flt: 'bandpass', fc: f0, fc1: f1, q: 7, t, a, d, g, to });
  p.osc({ f: f0 * 0.98, f1: f1 * 0.98, t, a, d: d * 0.9, g: g * 0.07, to });
}

/**
 * 兽吼：两只带粗糙颤动的锯齿 → 随「开口」变化的共振 → 轻失真。
 * f0 → f1 是喉音的走向，open0 → open1 → open0 是共振(嘴张开再合上)。
 */
export function growl(p: Patch, t: number, d: number, g: number, f0: number, f1: number, open0: number, open1: number, to?: AudioNode): void {
  // 失真之后再过一道低通：把被削成方波的边沿磨圆
  const dr = p.drive(3, p.filt('lowpass', 3000, 0.6, to));
  const lp = p.filt('lowpass', open0, 2.2, dr);
  p.ramp(lp.frequency, [[t, open0], [t + d * 0.3, open1], [t + d, open0]]);
  p.osc({ w: 'sawtooth', f: f0, f1, ft: d, t, a: d * 0.12, h: d * 0.45, d: d * 0.45, g: g * 0.55, vib: 80, vr: 27, vd: 0, to: lp });
  p.osc({ w: 'sawtooth', f: f0 * 1.49, f1: f1 * 1.45, ft: d, t, a: d * 0.15, h: d * 0.4, d: d * 0.4, g: g * 0.3, vib: 60, vr: 37, vd: 0, to: lp });
  p.noise({ k: 'pink', flt: 'bandpass', fc: open1 * 0.8, fc1: open0, q: 1.5, t, a: d * 0.15, h: d * 0.35, d: d * 0.5, g: g * 0.5, to });
}
