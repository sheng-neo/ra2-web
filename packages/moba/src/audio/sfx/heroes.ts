/**
 * 英雄技能音效：skillCast 的施放提示(每位英雄一种音色 + 每个技能一个小动机)、
 * 每个英雄专属 FxKey、以及跟随区域时长的铺底声。
 * 主题：磐岳=岩石与低鸣，赤烬=火焰与刀鸣，星璃=钟琴般的星辉，风翎=气流与弓弦，夜阙=暗哑的次谐波与匕首。
 */
import { mtof } from '../synth';
import type { Patch } from '../synth';
import { BLADE, DAGGER, METAL, def } from './defs';
import type { SfxDef, SfxKey } from './defs';

// ───────────── 五种主题音色(施放动机用) ─────────────

function rockNote(p: Patch, f: number, t: number, d: number, g: number, f1?: number): void {
  const lp = p.filt('lowpass', 1500, 1.2);
  p.osc({ w: 'softsaw', f, f1, t, a: 0.012, h: d * 0.3, d, g: g * 0.6, to: lp });
  p.osc({ w: 'softsaw', f: f * 2, f1: f1 ? f1 * 2 : undefined, t, a: 0.012, h: d * 0.3, d: d * 0.8, g: g * 0.2, to: lp });
  p.osc({ w: 'softsq', f: f / 2, f1: f1 ? f1 / 2 : undefined, t, a: 0.012, h: d * 0.3, d, g: g * 0.15, to: lp });
  p.noise({ k: 'brown', flt: 'bandpass', fc: 300, q: 0.8, t, a: 0.002, d: 0.08, g: g * 0.4 });
}

function fireNote(p: Patch, f: number, t: number, d: number, g: number, f1?: number): void {
  const bp = p.filt('bandpass', 1300, 0.8);
  const dr = p.drive(4, bp);
  p.osc({ w: 'sawtooth', f, f1, t, a: 0.006, d, g: g * 0.5, to: dr });
  p.osc({ w: 'softsaw', f: f * 1.5, f1: f1 ? f1 * 1.5 : undefined, t, a: 0.006, d: d * 0.7, g: g * 0.2, to: dr });
  p.noise({ k: 'pink', flt: 'bandpass', fc: 2400, q: 0.7, t, a: 0.004, d: d * 0.9, g: g * 0.35 });
}

function starNote(p: Patch, f: number, t: number, d: number, g: number): void {
  p.fm({ f, ratio: 3.01, idx: 2.4, idx1: 0.05, idt: Math.min(0.25, d), t, a: 0.002, d, g: g * 0.7 });
  p.osc({ f: f * 2, t, a: 0.002, d: d * 0.5, g: g * 0.15 });
  p.noise({ flt: 'highpass', fc: 8000, t, a: 0.002, d: 0.04, g: g * 0.12 });
}

function windNote(p: Patch, f: number, t: number, d: number, g: number, f1?: number): void {
  p.osc({ w: 'glass', f, f1, t, a: 0.03, h: d * 0.3, d, g: g * 0.6, vib: 12, vr: 6, vd: 0.08 });
  p.noise({ flt: 'bandpass', fc: f * 2, fc1: f1 ? f1 * 2 : undefined, q: 2.5, t, a: 0.02, d: d * 1.1, g: g * 0.5 });
}

function shadeNote(p: Patch, f: number, t: number, d: number, g: number, f1?: number): void {
  const lp = p.filt('lowpass', 1500, 1);
  p.fm({ f, f1, ratio: 0.5, idx: 2.6, idx1: 0.4, t, a: 0.008, d, g: g * 0.6, to: lp });
  p.osc({ f: f / 2, f1: f1 ? f1 / 2 : undefined, t, a: 0.01, d: d * 0.8, g: g * 0.4 });
  p.noise({ k: 'pink', flt: 'bandpass', fc: 800, q: 1.2, t, a: 0.02, d: d * 0.8, g: g * 0.2 });
}

const D3 = mtof(50), A2 = mtof(45), A3 = mtof(57), D4 = mtof(62), E4 = mtof(64), A4 = mtof(69);
const D5 = mtof(74), E5 = mtof(76), G5 = mtof(79), B5 = mtof(83), D6 = mtof(86), E6 = mtof(88), G6 = mtof(91), B6 = mtof(95);

const CAST = { loud: -21, len: 0.5, gap: 0.1, poly: 2, prio: 2, jitter: 0.01, rev: 0.16 } as const;
const FX = { loud: -16, len: 0.7, gap: 0.08, poly: 3, prio: 2, rev: 0.18 } as const;
const BED = { loud: -24, gap: 0.2, poly: 2, prio: 1, jitter: 0.02, rev: 0.16 } as const;

export const HEROES_SFX = {
  // ═════════════ 施放提示 ═════════════
  cast_panyue_s1: def('技能施放', '磐岳·裂地冲撞', (p) => {
    rockNote(p, D3, 0, 0.22, 1, A3);
  }, CAST),
  cast_panyue_s2: def('技能施放', '磐岳·不动壁垒', (p) => {
    rockNote(p, D3, 0, 0.14, 0.9);
    rockNote(p, A2, 0.11, 0.3, 1);
  }, CAST),
  cast_panyue_ult: def('技能施放', '磐岳·山崩地裂', (p) => {
    rockNote(p, D3, 0, 0.12, 0.8);
    rockNote(p, A3, 0.09, 0.12, 0.9);
    rockNote(p, D4, 0.18, 0.5, 1);
    p.noise({ k: 'brown', flt: 'lowpass', fc: 240, a: 0.3, d: 0.3, g: 0.9 });
  }, { ...CAST, len: 0.9, loud: -18 }),

  cast_chijin_s1: def('技能施放', '赤烬·烈焰斩', (p) => {
    fireNote(p, A4, 0, 0.16, 1);
    p.noise({ flt: 'highpass', fc: 5000, a: 0.002, d: 0.06, g: 0.15 });
  }, CAST),
  cast_chijin_s2: def('技能施放', '赤烬·炎步', (p) => {
    fireNote(p, A3, 0, 0.2, 1, E4);
  }, CAST),
  cast_chijin_ult: def('技能施放', '赤烬·焚天旋舞', (p) => {
    fireNote(p, A3, 0, 0.1, 0.8);
    fireNote(p, E4, 0.08, 0.1, 0.9);
    fireNote(p, A4, 0.16, 0.45, 1);
    p.noise({ k: 'pink', flt: 'bandpass', fc: 400, fc1: 1600, q: 0.8, a: 0.3, d: 0.25, g: 0.5 });
  }, { ...CAST, len: 0.9, loud: -18 }),

  cast_xingli_s1: def('技能施放', '星璃·流星矢', (p) => {
    starNote(p, E6, 0, 0.18, 0.8);
    starNote(p, B6, 0.045, 0.3, 1);
  }, { ...CAST, rev: 0.26 }),
  cast_xingli_s2: def('技能施放', '星璃·引力星环', (p) => {
    starNote(p, B5, 0, 0.25, 0.9);
    starNote(p, E5, 0.1, 0.45, 1);
    p.osc({ f: 330, f1: 165, t: 0.05, a: 0.1, d: 0.3, g: 0.12 });
  }, { ...CAST, len: 0.7, rev: 0.26 }),
  cast_xingli_ult: def('技能施放', '星璃·星陨天降', (p) => {
    starNote(p, E5, 0, 0.3, 0.7);
    starNote(p, B5, 0.07, 0.3, 0.8);
    starNote(p, E6, 0.14, 0.35, 0.9);
    starNote(p, G6, 0.21, 0.7, 1);
    p.noise({ flt: 'highpass', fc: 6000, a: 0.25, d: 0.5, g: 0.07 });
  }, { ...CAST, len: 1.1, loud: -18, rev: 0.3 }),

  cast_fengling_s1: def('技能施放', '风翎·贯风矢', (p) => {
    windNote(p, G5, 0, 0.26, 1, D6);
  }, CAST),
  cast_fengling_s2: def('技能施放', '风翎·逐风步', (p) => {
    windNote(p, D6, 0, 0.08, 0.8);
    windNote(p, G6, 0.05, 0.2, 1);
  }, CAST),
  cast_fengling_ult: def('技能施放', '风翎·千羽天幕', (p) => {
    windNote(p, G5, 0, 0.1, 0.8);
    windNote(p, D6, 0.08, 0.1, 0.9);
    windNote(p, G6, 0.16, 0.5, 1);
    p.noise({ k: 'pink', flt: 'bandpass', fc: 700, fc1: 2400, q: 0.8, a: 0.3, d: 0.3, g: 0.4 });
  }, { ...CAST, len: 0.9, loud: -18 }),

  cast_yeque_s1: def('技能施放', '夜阙·瞬影斩', (p) => {
    shadeNote(p, D5, 0, 0.2, 1, D4);
  }, CAST),
  cast_yeque_s2: def('技能施放', '夜阙·影刃飞旋', (p) => {
    p.ring(2500, DAGGER, { a: 0.001, d: 0.14, g: 0.2 });
    p.ring(3300, DAGGER, { t: 0.05, a: 0.001, d: 0.2, g: 0.2 });
    shadeNote(p, D4, 0, 0.16, 0.6);
  }, CAST),
  cast_yeque_ult: def('技能施放', '夜阙·幽夜处决', (p) => {
    shadeNote(p, D4, 0, 0.18, 0.8);
    // 三全音：不祥的处决预告
    shadeNote(p, mtof(68), 0.12, 0.4, 1);
    p.osc({ f: 62, f1: 40, t: 0.02, a: 0.004, d: 0.2, g: 0.6 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 3000, fc1: 500, q: 1.5, a: 0.02, d: 0.35, g: 0.25 });
  }, { ...CAST, len: 0.8, loud: -18 }),

  cast_recall: def('技能施放', '回城·启动', (p) => {
    starNote(p, mtof(81), 0, 0.4, 0.6);
    starNote(p, D6, 0.09, 0.6, 0.7);
  }, { ...CAST, loud: -25, rev: 0.25 }),
  cast_heal: def('技能施放', '恢复·启动', (p) => {
    p.osc({ w: 'glass', f: mtof(72), a: 0.02, d: 0.3, g: 0.5 });
    p.osc({ w: 'glass', f: G5, t: 0.09, a: 0.02, d: 0.45, g: 0.5 });
    p.osc({ f: mtof(84), t: 0.09, a: 0.02, d: 0.3, g: 0.12 });
  }, { ...CAST, loud: -24, rev: 0.25 }),
  cast_flash: def('技能施放', '闪现·启动', (p) => {
    p.osc({ f: 2400, f1: 4800, a: 0.001, d: 0.04, g: 0.4 });
    p.noise({ flt: 'highpass', fc: 6000, a: 0.001, d: 0.025, g: 0.3 });
  }, { ...CAST, loud: -26, len: 0.2 }),

  // ═════════════ 磐岳 ═════════════
  fx_panyue_passive_hit: def('技能特效', '磐岳·第三击震地', (p) => {
    const dr = p.drive(2);
    p.osc({ f: 96, f1: 34, ft: 0.14, a: 0.003, d: 0.48, g: 0.65, to: dr });
    p.osc({ w: 'triangle', f: 240, f1: 90, ft: 0.08, a: 0.002, d: 0.16, g: 0.4, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 900, fc1: 200, a: 0.003, d: 0.42, g: 0.6, to: dr });
    p.noise({ flt: 'bandpass', fc: 1500, q: 0.8, a: 0.001, d: 0.05, g: 0.8 });
    p.ring(310, [1, 1.63, 2.41], { a: 0.002, d: 0.3, g: 0.16 });
    p.scatter(4, 0.06, 0.25, (at) => p.noise({ flt: 'bandpass', fc: p.rr(500, 1400), q: 2, t: at, a: 0.001, d: 0.05, g: 0.3 }));
  }, { ...FX, loud: -15 }),
  fx_panyue_s1_dash: def('技能特效', '磐岳·冲撞起步', (p) => {
    p.osc({ f: 125, f1: 50, a: 0.002, d: 0.13, g: 0.8 });
    p.noise({ k: 'brown', flt: 'bandpass', fc: 200, fc1: 950, q: 0.9, a: 0.06, d: 0.3, g: 1.2 });
    const lp = p.filt('lowpass', 320, 1);
    p.osc({ w: 'sawtooth', f: 55, a: 0.03, d: 0.3, g: 0.4, vib: 60, vr: 31, vd: 0, to: lp });
    p.noise({ flt: 'highpass', fc: 2500, a: 0.04, d: 0.2, g: 0.06 });
  }, { ...FX, loud: -19, len: 0.5 }),
  fx_panyue_s1_impact: def('技能特效', '磐岳·冲撞震击', (p) => {
    const dr = p.drive(2.5);
    p.osc({ f: 104, f1: 32, ft: 0.15, a: 0.003, d: 0.55, g: 0.85, to: dr });
    p.osc({ w: 'triangle', f: 250, f1: 80, ft: 0.1, a: 0.002, d: 0.2, g: 0.45, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2600, fc1: 200, a: 0.002, d: 0.36, g: 0.9, to: dr });
    p.noise({ flt: 'highpass', fc: 2600, a: 0.001, d: 0.014, g: 0.5 });
    p.ring(380, METAL, { a: 0.002, d: 0.42, g: 0.2 });
    p.scatter(6, 0.05, 0.4, (at) => p.noise({ flt: 'bandpass', fc: p.rr(400, 1500), q: 2.5, t: at, a: 0.001, d: p.rr(0.03, 0.08), g: p.rr(0.25, 0.45) }));
  }, { ...FX, loud: -13, len: 0.9, rev: 0.24 }),
  fx_panyue_s2_cast: def('技能特效', '磐岳·壁垒升起', (p) => {
    p.noise({ k: 'brown', flt: 'bandpass', fc: 150, fc1: 520, q: 1, a: 0.2, d: 0.2, g: 1.2 });
    const lp = p.filt('lowpass', 420, 1);
    p.osc({ w: 'softsaw', f: 65, f1: 98, a: 0.2, d: 0.2, g: 0.5, to: lp });
    // 岩壁合拢的「咚」+ 琥珀结晶的护盾鸣响
    p.osc({ f: 132, f1: 58, t: 0.22, a: 0.002, d: 0.22, g: 0.9 });
    p.noise({ flt: 'bandpass', fc: 900, q: 1, t: 0.22, a: 0.001, d: 0.05, g: 0.4 });
    p.fm({ f: 440, ratio: 1.41, idx: 1.6, idx1: 0.1, t: 0.23, a: 0.003, d: 0.6, g: 0.3 });
    p.fm({ f: 659.3, ratio: 1.41, idx: 1.4, idx1: 0.1, t: 0.25, a: 0.003, d: 0.7, g: 0.25 });
  }, { ...FX, loud: -16, len: 1.0 }),
  fx_panyue_ult_leap: def('技能特效', '磐岳·腾跃', (p) => {
    p.osc({ f: 110, f1: 55, a: 0.002, d: 0.12, g: 0.7 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 250, fc1: 1900, fct: 0.42, q: 1, a: 0.12, d: 0.34, g: 1 });
    p.osc({ f: 80, f1: 150, a: 0.06, d: 0.32, g: 0.3 });
    p.scatter(3, 0.02, 0.2, (at) => p.ring(p.rr(700, 1200), METAL, { t: at, a: 0.001, d: 0.06, g: 0.05 }));
  }, { ...FX, loud: -19, len: 0.6 }),
  fx_panyue_ult_land: def('技能特效', '磐岳·山崩轰鸣', (p) => {
    const dr = p.drive(3);
    // 两层低频冲击错开，像山体接连塌落
    p.osc({ f: 72, f1: 24, ft: 0.5, a: 0.004, d: 1.6, g: 0.9, to: dr });
    p.osc({ f: 55, f1: 30, ft: 0.4, t: 0.06, a: 0.006, d: 1.2, g: 0.5, to: dr });
    p.osc({ w: 'triangle', f: 230, f1: 60, ft: 0.25, a: 0.003, d: 0.4, g: 0.5, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 1800, fc1: 150, a: 0.004, d: 1.4, g: 1, to: dr });
    p.noise({ flt: 'bandpass', fc: 1200, q: 0.5, a: 0.001, d: 0.09, g: 1 });
    p.noise({ flt: 'highpass', fc: 3000, a: 0.001, d: 0.02, g: 0.5 });
    // 地裂撕开的低吼
    const lp = p.filt('lowpass', 260, 1.2);
    p.osc({ w: 'sawtooth', f: 48, f1: 36, t: 0.05, a: 0.1, d: 1.0, g: 0.5, vib: 80, vr: 27, vd: 0, to: lp });
    // 滚落的碎石
    p.scatter(16, 0.08, 1.3, (at) => {
      p.noise({ flt: 'bandpass', fc: p.rr(300, 1300), q: 2, t: at, a: 0.001, d: p.rr(0.04, 0.13), g: p.rr(0.2, 0.45) * (1.5 - at) });
    });
    p.ring(205, METAL, { a: 0.004, d: 0.8, g: 0.07 });
  }, { ...FX, loud: -11, len: 2.3, gap: 0.2, poly: 2, prio: 3, rev: 0.3 }),

  // ═════════════ 赤烬 ═════════════
  fx_chijin_passive_hit: def('技能特效', '赤烬·余烬斩', (p) => {
    p.noise({ flt: 'bandpass', fc: 3000, q: 1.2, a: 0.001, d: 0.06, g: 0.7 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 1400, fc1: 500, q: 0.7, a: 0.006, d: 0.3, g: 0.6 });
    p.osc({ w: 'triangle', f: 200, f1: 80, a: 0.002, d: 0.12, g: 0.4 });
    p.noise({ flt: 'highpass', fc: 5000, t: 0.02, a: 0.02, d: 0.3, g: 0.1 });
    p.ring(1900, BLADE, { a: 0.001, d: 0.25, g: 0.14 });
    p.scatter(5, 0.03, 0.25, (at) => p.noise({ flt: 'highpass', fc: p.rr(3000, 6000), t: at, a: 0.001, d: 0.01, g: 0.2 }));
  }, { ...FX, loud: -16 }),
  fx_chijin_s1_slash: def('技能特效', '赤烬·烈焰刀气', (p) => {
    p.noise({ flt: 'bandpass', fc: 700, fc1: 4600, fct: 0.14, q: 1.2, a: 0.05, d: 0.17, g: 1 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 1500, fc1: 500, q: 0.6, t: 0.04, a: 0.06, d: 0.42, g: 0.8 });
    const lp = p.filt('lowpass', 2600, 1);
    p.osc({ w: 'sawtooth', f: 300, f1: 900, a: 0.03, d: 0.1, g: 0.14, to: lp });
    p.osc({ f: 112, f1: 55, a: 0.004, d: 0.22, g: 0.35 });
    p.scatter(8, 0.08, 0.36, (at) => p.noise({ flt: 'highpass', fc: p.rr(2500, 6500), t: at, a: 0.001, d: 0.012, g: p.rr(0.12, 0.28) }));
  }, { ...FX, loud: -15, len: 0.8 }),
  fx_chijin_s2_dash: def('技能特效', '赤烬·炎步火影', (p) => {
    const bp = p.filt('bandpass', 500, 1.1);
    p.ramp(bp.frequency, [[0, 500], [0.1, 3600], [0.3, 800]]);
    p.noise({ a: 0.04, d: 0.26, g: 1.6, to: bp });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2500, a: 0.02, d: 0.3, g: 0.6 });
    p.osc({ f: 200, f1: 520, a: 0.01, d: 0.15, g: 0.18 });
    p.scatter(6, 0.03, 0.26, (at) => p.noise({ flt: 'highpass', fc: p.rr(3000, 6500), t: at, a: 0.001, d: 0.012, g: p.rr(0.1, 0.25) }));
  }, { ...FX, loud: -18, len: 0.6 }),
  fx_chijin_ult_start: def('技能特效', '赤烬·旋舞起手', (p) => {
    p.noise({ k: 'pink', flt: 'bandpass', fc: 300, fc1: 1600, q: 0.9, a: 0.26, d: 0.3, g: 1.2 });
    p.ring(1500, BLADE, { a: 0.002, d: 0.42, g: 0.12 });
    p.ring(1320, BLADE, { t: 0.06, a: 0.002, d: 0.4, g: 0.1 });
    p.osc({ f: 60, f1: 112, a: 0.2, d: 0.3, g: 0.4 });
    const lp = p.filt('lowpass', 950, 1);
    p.osc({ w: 'softsaw', f: 147, f1: 196, a: 0.15, d: 0.26, g: 0.3, to: lp });
  }, { ...FX, loud: -15, len: 0.9 }),
  fx_chijin_ult_tick: def('技能特效', '赤烬·火焰旋风呼啸', (p) => {
    const bp = p.filt('bandpass', 600, 1.2);
    p.ramp(bp.frequency, [[0, 600], [0.1, 2500], [0.27, 700]]);
    p.noise({ k: 'pink', a: 0.08, d: 0.18, g: 3, to: bp });
    p.noise({ flt: 'bandpass', fc: 3500, fc1: 6200, q: 2, t: 0.05, a: 0.03, d: 0.08, g: 0.3 });
    p.osc({ f: 86, f1: 68, a: 0.03, d: 0.19, g: 0.5 });
    p.scatter(3, 0.02, 0.2, (at) => p.noise({ flt: 'highpass', fc: p.rr(3000, 6000), t: at, a: 0.001, d: 0.012, g: 0.2 }));
  }, { ...FX, loud: -17, len: 0.45, gap: 0.12, poly: 3, jitter: 0.06 }),

  // ═════════════ 星璃 ═════════════
  fx_xingli_passive_burst: def('技能特效', '星璃·印记引爆', (p) => {
    p.fm({ f: E6, ratio: 3.5, idx: 3, idx1: 0.05, idt: 0.25, a: 0.001, d: 0.6, g: 0.4 });
    p.fm({ f: B6, ratio: 3.5, idx: 3, idx1: 0.05, idt: 0.25, a: 0.001, d: 0.55, g: 0.32 });
    p.fm({ f: E6 * 2, ratio: 3.5, idx: 2, idx1: 0.05, idt: 0.2, a: 0.001, d: 0.4, g: 0.2 });
    p.noise({ flt: 'bandpass', fc: 4500, q: 0.7, a: 0.001, d: 0.12, g: 0.6 });
    p.osc({ w: 'triangle', f: 260, f1: 90, a: 0.003, d: 0.28, g: 0.5 });
    p.noise({ flt: 'highpass', fc: 7000, t: 0.04, a: 0.05, d: 0.5, g: 0.08 });
    // 眩晕的小星星：三个下行的叮
    [B6, G6, E6].forEach((f, i) => p.fm({ f, ratio: 2, idx: 1, t: 0.16 + i * 0.07, a: 0.001, d: 0.16, g: 0.1 }));
  }, { ...FX, loud: -15, len: 0.9, rev: 0.28 }),
  fx_xingli_s1_cast: def('技能特效', '星璃·流星矢出手', (p) => {
    p.fm({ f: 1800, f1: 500, ft: 0.2, ratio: 1.5, idx: 5, idx1: 0.5, a: 0.002, d: 0.3, g: 0.6 });
    p.noise({ flt: 'bandpass', fc: 2200, fc1: 600, q: 1, a: 0.01, d: 0.26, g: 0.7 });
    p.fm({ f: 2637, ratio: 3.01, idx: 1.5, idx1: 0.05, a: 0.001, d: 0.22, g: 0.12 });
    p.fm({ f: 3136, ratio: 3.01, idx: 1.5, idx1: 0.05, t: 0.03, a: 0.001, d: 0.2, g: 0.1 });
    p.osc({ f: 145, f1: 70, a: 0.003, d: 0.13, g: 0.6 });
  }, { ...FX, loud: -16, len: 0.6, rev: 0.24 }),
  fx_xingli_s2_burst: def('技能特效', '星璃·星环收束', (p) => {
    // 先向内吸入，再塌缩成一声低爆
    p.noise({ flt: 'bandpass', fc: 3200, fc1: 300, fct: 0.14, q: 1.5, a: 0.12, d: 0.04, g: 0.9 });
    p.osc({ f: 900, f1: 120, ft: 0.14, a: 0.1, d: 0.04, g: 0.2 });
    p.osc({ f: 124, f1: 38, t: 0.14, a: 0.003, d: 0.55, g: 0.8 });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2400, fc1: 250, t: 0.14, a: 0.002, d: 0.3, g: 0.7 });
    p.fm({ f: D5, ratio: 3.5, idx: 2.5, idx1: 0.05, idt: 0.3, t: 0.14, a: 0.002, d: 0.75, g: 0.3 });
    p.fm({ f: mtof(81), ratio: 3.5, idx: 2.5, idx1: 0.05, idt: 0.3, t: 0.15, a: 0.002, d: 0.7, g: 0.25 });
    p.noise({ flt: 'highpass', fc: 6500, t: 0.15, a: 0.01, d: 0.3, g: 0.1 });
  }, { ...FX, loud: -14, len: 1.1, rev: 0.28 }),
  fx_xingli_ult_cast: def('技能特效', '星璃·引动星陨', (p) => {
    const lp = p.filt('lowpass', 500, 0.8);
    p.ramp(lp.frequency, [[0, 500], [0.35, 3200], [0.9, 900]]);
    [D4, A4, D5, mtof(77)].forEach((f, i) => {
      p.osc({ w: 'softsaw', f, det: i % 2 ? 8 : -8, a: 0.3, d: 0.5, g: 0.2, to: lp });
    });
    [D6, E6, G6, mtof(93), mtof(96)].forEach((f, i) => p.fm({ f, ratio: 3.01, idx: 2, idx1: 0.05, idt: 0.2, t: 0.05 + i * 0.055, a: 0.001, d: 0.5, g: 0.14 }));
    p.osc({ f: 73.4, a: 0.3, d: 0.42, g: 0.35 });
    p.noise({ flt: 'bandpass', fc: 500, fc1: 6000, q: 1, a: 0.36, d: 0.1, g: 0.3 });
  }, { ...FX, loud: -16, len: 1.2, rev: 0.3 }),
  fx_xingli_meteor: def('技能特效', '星璃·陨星坠落爆裂', (p) => {
    // 坠落的啸声 → 落地爆裂 → 晶屑飞散
    p.osc({ f: 2400, f1: 600, ft: 0.12, a: 0.08, d: 0.04, g: 0.2 });
    p.noise({ flt: 'bandpass', fc: 4200, fc1: 1000, fct: 0.12, q: 2, a: 0.08, d: 0.04, g: 0.4 });
    const dr = p.drive(2);
    p.osc({ f: 132, f1: 36, ft: 0.16, t: 0.12, a: 0.003, d: 0.6, g: 0.8, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 3600, fc1: 250, t: 0.12, a: 0.002, d: 0.5, g: 0.9, to: dr });
    p.noise({ flt: 'highpass', fc: 4000, t: 0.12, a: 0.001, d: 0.02, g: 0.5 });
    p.fm({ f: G5, ratio: 3.5, idx: 2.5, idx1: 0.05, idt: 0.25, t: 0.12, a: 0.002, d: 0.5, g: 0.25 });
    p.scatter(6, 0.14, 0.3, (at) => p.fm({ f: p.rr(1800, 5000), ratio: 2.4, idx: 1, t: at, a: 0.001, d: p.rr(0.06, 0.16), g: 0.12 }));
  }, { ...FX, loud: -14, len: 1.0, gap: 0.09, poly: 4, jitter: 0.07, rev: 0.26 }),

  // ═════════════ 风翎 ═════════════
  fx_fengling_s1_cast: def('技能特效', '风翎·贯风矢出手', (p) => {
    const lp = p.filt('lowpass', 2800, 1.5);
    p.ramp(lp.frequency, [[0, 2800], [0.28, 500]]);
    p.osc({ w: 'triangle', f: 160, f1: 131, ft: 0.06, a: 0.001, d: 0.32, g: 0.6, to: lp });
    p.osc({ w: 'softsaw', f: 320, f1: 262, ft: 0.06, a: 0.001, d: 0.16, g: 0.35, to: lp });
    p.noise({ flt: 'highpass', fc: 2500, a: 0.001, d: 0.01, g: 0.5 });
    const bp = p.filt('bandpass', 1500, 1.4);
    p.ramp(bp.frequency, [[0, 1500], [0.1, 5200], [0.34, 1800]]);
    p.noise({ a: 0.02, d: 0.3, g: 1.4, to: bp });
    p.osc({ f: 1500, f1: 2600, a: 0.03, d: 0.2, g: 0.07 });
    p.osc({ f: 122, f1: 60, a: 0.003, d: 0.13, g: 0.3 });
  }, { ...FX, loud: -16, len: 0.6 }),
  fx_fengling_s2_dash: def('技能特效', '风翎·逐风步', (p) => {
    p.noise({ flt: 'bandpass', fc: 800, fc1: 2900, q: 0.9, a: 0.06, d: 0.2, g: 1 });
    p.noise({ flt: 'highpass', fc: 5000, a: 0.03, d: 0.15, g: 0.14 });
    [0.03, 0.1, 0.17].forEach((t) => p.noise({ k: 'pink', flt: 'lowpass', fc: 500, t, a: 0.01, d: 0.05, g: 0.4 }));
    p.fm({ f: 1760, ratio: 2, idx: 1, idx1: 0.05, t: 0.06, a: 0.002, d: 0.26, g: 0.08 });
  }, { ...FX, loud: -20, len: 0.5 }),
  fx_fengling_ult_cast: def('技能特效', '风翎·朝天齐射', (p) => {
    [0, 0.035, 0.07, 0.105].forEach((t, i) => {
      p.osc({ w: 'triangle', f: 210 + i * 14, f1: 180 + i * 12, ft: 0.05, t, a: 0.001, d: 0.2, g: 0.5 });
      p.noise({ flt: 'highpass', fc: 2600, t, a: 0.001, d: 0.008, g: 0.3 });
    });
    [0, 0.05, 0.1].forEach((t, i) => p.osc({ f: 1200 + i * 180, f1: 3000 + i * 300, ft: 0.35, t, a: 0.05, d: 0.32, g: 0.06 }));
    p.noise({ flt: 'bandpass', fc: 1000, fc1: 5200, fct: 0.36, q: 1.2, a: 0.16, d: 0.26, g: 0.8 });
  }, { ...FX, loud: -17, len: 0.7 }),
  fx_fengling_ult_tick: def('技能特效', '风翎·箭雨落地', (p) => {
    p.scatter(8, 0, 0.26, (at) => {
      p.noise({ flt: 'bandpass', fc: p.rr(2000, 3600), q: 2, t: at, a: 0.001, d: 0.022, g: p.rr(0.3, 0.6) });
      p.osc({ f: p.rr(260, 360), f1: 150, t: at, a: 0.001, d: 0.045, g: p.rr(0.25, 0.5) });
    });
    p.scatter(4, 0, 0.18, (at) => p.osc({ f: p.rr(2600, 3400), f1: 1500, t: at, a: 0.01, d: 0.07, g: 0.05 }));
    p.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 0.8, a: 0.05, d: 0.26, g: 0.5 });
  }, { ...FX, loud: -17, len: 0.55, gap: 0.2, poly: 3, jitter: 0.06 }),

  // ═════════════ 夜阙 ═════════════
  fx_yeque_s1_dash: def('技能特效', '夜阙·瞬影斩', (p) => {
    p.noise({ k: 'pink', flt: 'bandpass', fc: 400, fc1: 2700, fct: 0.12, q: 2, a: 0.03, d: 0.14, g: 1.4 });
    p.fm({ f: 220, f1: 110, ratio: 0.5, idx: 3, idx1: 0.4, a: 0.006, d: 0.26, g: 0.4 });
    p.noise({ flt: 'bandpass', fc: 4500, q: 1.5, t: 0.05, a: 0.001, d: 0.04, g: 0.6 });
    p.ring(2800, DAGGER, { t: 0.06, a: 0.001, d: 0.2, g: 0.08 });
  }, { ...FX, loud: -17, len: 0.5 }),
  fx_yeque_s2_cast: def('技能特效', '夜阙·掷出影刃', (p) => {
    [0, 0.03, 0.06].forEach((t) => p.noise({ flt: 'bandpass', fc: 3000, fc1: 5600, q: 2.5, t, a: 0.004, d: 0.04, g: 0.7 }));
    p.ring(3400, DAGGER, { a: 0.001, d: 0.16, g: 0.07 });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 600, a: 0.006, d: 0.13, g: 0.5 });
  }, { ...FX, loud: -19, len: 0.4 }),
  fx_yeque_ult_vanish: def('技能特效', '夜阙·隐没', (p) => {
    p.noise({ flt: 'bandpass', fc: 2600, fc1: 250, q: 1.5, a: 0.02, d: 0.3, g: 0.9 });
    p.fm({ f: 660, f1: 110, ratio: 0.5, idx: 2, a: 0.01, d: 0.32, g: 0.3 });
    p.osc({ f: 92, f1: 45, a: 0.004, d: 0.22, g: 0.6 });
    p.noise({ flt: 'highpass', fc: 6000, t: 0.08, a: 0.1, d: 0.3, g: 0.05 });
  }, { ...FX, loud: -18, len: 0.6, rev: 0.24 }),
  fx_yeque_ult_strike: def('技能特效', '夜阙·处决斩击', (p) => {
    const dr = p.drive(3);
    p.osc({ f: 112, f1: 35, ft: 0.12, a: 0.003, d: 0.42, g: 0.6, to: dr });
    // 两记交叉斩
    p.noise({ flt: 'bandpass', fc: 4000, q: 1, a: 0.001, d: 0.05, g: 0.9, to: dr });
    p.noise({ flt: 'bandpass', fc: 4600, q: 1, t: 0.07, a: 0.001, d: 0.06, g: 0.9, to: dr });
    p.ring(2300, DAGGER, { a: 0.001, d: 0.5, g: 0.2 });
    p.ring(2750, DAGGER, { t: 0.07, a: 0.001, d: 0.5, g: 0.16 });
    // 低沉的三全音和弦刺入
    const lp = p.filt('lowpass', 1200, 1);
    p.osc({ w: 'softsaw', f: D3, a: 0.004, d: 0.34, g: 0.3, to: lp });
    p.osc({ w: 'softsaw', f: mtof(56), a: 0.004, d: 0.34, g: 0.25, to: lp });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 500, fc1: 3000, q: 1, t: 0.08, a: 0.02, d: 0.3, g: 0.2 });
  }, { ...FX, loud: -13, len: 0.9, prio: 3, rev: 0.24 }),

  // ═════════════ 区域铺底 ═════════════
  area_telegraph: def('区域铺底', '预警圈(己方)', (p) => {
    p.osc({ f: 587, a: 0.01, d: 0.14, g: 0.4 });
    p.osc({ f: 880, t: 0.07, a: 0.01, d: 0.16, g: 0.3 });
  }, { ...BED, loud: -32, len: 0.4, prio: 0 }),
  area_telegraph_enemy: def('区域铺底', '预警圈(敌方)', (p) => {
    const d = Math.min(1.2, Math.max(0.3, p.dur));
    const lp = p.filt('lowpass', 900, 1);
    p.osc({ w: 'softsq', f: 311, a: 0.01, d: 0.28, g: 0.4, to: lp });
    p.osc({ w: 'softsq', f: 294, a: 0.01, d: 0.3, g: 0.4, to: lp });
    p.osc({ f: 200, f1: 420, ft: d, a: d * 0.9, d: 0.06, g: 0.25 });
  }, { ...BED, loud: -26, len: 0.6, prio: 2 }),
  area_panyue_aura: def('区域铺底', '不动壁垒·岩环', (p) => {
    const d = p.dur;
    const g = p.gain(1);
    p.lfo(g.gain, 2.2, 0.3, 0, d + 0.5);
    p.noise({ k: 'brown', flt: 'lowpass', fc: 230, a: 0.2, h: Math.max(0.1, d - 0.8), d: 0.6, g: 0.6, to: g });
    // 中频的岩石摩擦声：小喇叭上也听得见
    p.noise({ k: 'pink', flt: 'bandpass', fc: 380, q: 1, a: 0.2, h: Math.max(0.1, d - 0.8), d: 0.6, g: 0.35, to: g });
    p.osc({ f: 73.4, a: 0.25, h: Math.max(0.1, d - 0.9), d: 0.6, g: 0.2, to: g });
  }, { ...BED, loud: -30, len: 4 }),
  area_panyue_fissure: def('区域铺底', '山崩地裂·裂隙', (p) => {
    const d = p.dur;
    const g = p.gain(1);
    p.lfo(g.gain, 3.1, 0.25, 0, d + 0.7);
    p.noise({ k: 'brown', flt: 'lowpass', fc: 190, a: 0.12, h: Math.max(0.1, d - 0.7), d: 0.6, g: 0.7, to: g });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 450, q: 0.9, a: 0.12, h: Math.max(0.1, d - 0.7), d: 0.6, g: 0.4, to: g });
    p.osc({ w: 'softsaw', f: 41, a: 0.2, h: Math.max(0.1, d - 0.8), d: 0.5, g: 0.3, to: p.filt('lowpass', 160, 0.7, g) });
    p.scatter(Math.round(d * 5), 0.1, Math.max(0.2, d - 0.3), (at) => {
      p.noise({ flt: 'bandpass', fc: p.rr(500, 1800), q: 2, t: at, a: 0.001, d: p.rr(0.03, 0.09), g: p.rr(0.25, 0.5) });
    });
  }, { ...BED, loud: -24, len: 3 }),
  area_chijin_spin: def('区域铺底', '焚天旋舞·火旋风', (p) => {
    const d = p.dur;
    const g = p.gain(1);
    p.lfo(g.gain, 6.5, 0.35, 0, d + 0.5);
    const bp = p.filt('bandpass', 700, 1.1, g);
    p.lfo(bp.frequency, 6.5, 260, 0, d + 0.5);
    p.noise({ k: 'pink', a: 0.15, h: Math.max(0.1, d - 0.45), d: 0.3, g: 2.4, to: bp });
    p.noise({ flt: 'highpass', fc: 5200, a: 0.2, h: Math.max(0.1, d - 0.5), d: 0.25, g: 0.07, to: g });
    p.osc({ w: 'softsaw', f: 73, a: 0.2, h: Math.max(0.1, d - 0.5), d: 0.3, g: 0.2, to: p.filt('lowpass', 240, 0.7, g) });
    p.scatter(Math.round(d * 7), 0.05, Math.max(0.2, d - 0.2), (at) => {
      p.noise({ flt: 'highpass', fc: p.rr(2500, 6000), t: at, a: 0.001, d: 0.012, g: p.rr(0.08, 0.2) });
    });
  }, { ...BED, loud: -22, len: 3 }),
  area_xingli_well: def('区域铺底', '引力星环·蓄势', (p) => {
    const d = Math.max(0.25, p.dur);
    p.fm({ f: 90, f1: 190, ft: d, ratio: 2, idx: 2, a: d * 0.92, d: 0.05, g: 0.6 });
    p.noise({ flt: 'bandpass', fc: 300, fc1: 2600, fct: d, q: 2, a: d * 0.92, d: 0.05, g: 0.5 });
    p.fm({ f: 1175, ratio: 3.01, idx: 1.5, idx1: 0.1, a: 0.002, d: 0.3, g: 0.15 });
  }, { ...BED, loud: -25, len: 0.6 }),
  area_xingli_storm: def('区域铺底', '星陨天降·星域', (p) => {
    const d = p.dur;
    const g = p.gain(1);
    p.lfo(g.gain, 4.3, 0.3, 0, d + 0.8);
    [D5, mtof(81), E6].forEach((f, i) => {
      p.fm({ f, ratio: 2.01, idx: 0.8, det: i * 5, a: 0.3, h: Math.max(0.1, d - 0.8), d: 0.7, g: 0.2, to: g });
    });
    p.noise({ flt: 'highpass', fc: 5500, a: 0.3, h: Math.max(0.1, d - 0.8), d: 0.6, g: 0.1, to: g });
    p.osc({ f: 73.4, a: 0.3, h: Math.max(0.1, d - 0.8), d: 0.5, g: 0.3 });
  }, { ...BED, loud: -27, len: 3, rev: 0.3 }),
  area_fengling_rain: def('区域铺底', '千羽天幕·风声', (p) => {
    const d = p.dur;
    const bp = p.filt('bandpass', 650, 0.9);
    p.lfo(bp.frequency, 0.9, 220, 0, d + 0.6);
    p.noise({ k: 'pink', a: 0.2, h: Math.max(0.1, d - 0.6), d: 0.45, g: 1.8, to: bp });
    p.noise({ flt: 'bandpass', fc: 2600, q: 6, a: 0.3, h: Math.max(0.1, d - 0.8), d: 0.4, g: 0.25 });
    p.noise({ flt: 'highpass', fc: 6000, a: 0.3, h: Math.max(0.1, d - 0.8), d: 0.4, g: 0.05 });
  }, { ...BED, loud: -25, len: 3 }),
} satisfies Partial<Record<SfxKey, SfxDef>>;
