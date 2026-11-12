/**
 * 界面音效：短、干净、不抢戏；与播报/配乐同一音集(D / A / F#)。
 */
import { bell } from '../instruments';
import { mtof } from '../synth';
import { COIN, def } from './defs';
import type { SfxDef, SfxKey } from './defs';

const UI = { bus: 'ui', loud: -25, len: 0.3, gap: 0.03, poly: 2, prio: 2, jitter: 0, rev: 0.08 } as const;

export const UI_SFX = {
  ui_click: def('界面', '点击', (p) => {
    p.osc({ f: 1250, f1: 800, a: 0.001, d: 0.035, g: 0.5 });
    p.noise({ flt: 'highpass', fc: 4000, a: 0.001, d: 0.005, g: 0.3 });
    p.osc({ w: 'triangle', f: 400, a: 0.001, d: 0.03, g: 0.2 });
  }, { ...UI, len: 0.15 }),
  ui_hover: def('界面', '悬停', (p) => {
    p.osc({ f: 2200, a: 0.002, d: 0.018, g: 0.4 });
    p.osc({ f: 3300, a: 0.002, d: 0.012, g: 0.12 });
  }, { ...UI, loud: -36, len: 0.1, gap: 0.05, prio: 0, rev: 0.04 }),
  ui_confirm: def('界面', '确认', (p) => {
    bell(p, mtof(86), 0, 0.3, 0.8);
    bell(p, mtof(93), 0.065, 0.45, 0.9);
    p.osc({ f: 220, f1: 147, a: 0.002, d: 0.06, g: 0.2 });
  }, { ...UI, loud: -22, len: 0.6, gap: 0.08, rev: 0.16 }),
  ui_back: def('界面', '返回', (p) => {
    bell(p, mtof(81), 0, 0.2, 0.7);
    bell(p, mtof(76), 0.06, 0.3, 0.6);
    p.noise({ flt: 'bandpass', fc: 2400, fc1: 900, q: 2, a: 0.01, d: 0.08, g: 0.08 });
  }, { ...UI, loud: -25, len: 0.45, gap: 0.08, rev: 0.12 }),
  ui_select: def('界面', '选中', (p) => {
    p.osc({ w: 'triangle', f: 1320, a: 0.002, d: 0.16, g: 0.4 });
    bell(p, mtof(88), 0, 0.3, 0.7);
    p.noise({ flt: 'bandpass', fc: 1500, fc1: 5000, q: 2, a: 0.02, d: 0.06, g: 0.1 });
    p.osc({ f: 147, a: 0.002, d: 0.08, g: 0.3 });
  }, { ...UI, loud: -22, len: 0.45, gap: 0.06, rev: 0.16 }),
  ui_buy: def('界面', '购买', (p) => {
    [0, 0.045, 0.09].forEach((t, i) => p.ring(2637 / (1 + i * 0.12), COIN, { t, a: 0.001, d: 0.12, g: 0.18 }));
    p.osc({ f: 200, f1: 120, t: 0.1, a: 0.002, d: 0.08, g: 0.4 });
    bell(p, mtof(81), 0.14, 0.4, 0.8);
    bell(p, mtof(86), 0.22, 0.6, 0.9);
  }, { ...UI, loud: -19, len: 0.9, gap: 0.25, group: 'buy', rev: 0.18 }),
  ui_error: def('界面', '错误', (p) => {
    const lp = p.filt('lowpass', 1000, 1);
    p.osc({ w: 'softsq', f: 220, a: 0.004, d: 0.07, g: 0.6, to: lp });
    p.osc({ w: 'softsq', f: 207.6, t: 0.1, a: 0.004, d: 0.12, g: 0.6, to: lp });
    p.noise({ flt: 'bandpass', fc: 500, q: 1, a: 0.002, d: 0.03, g: 0.15 });
  }, { ...UI, loud: -24, len: 0.35, gap: 0.25, group: 'error', rev: 0.04 }),
  ui_ready: def('界面', '就绪', (p) => {
    [74, 81, 86, 90].forEach((m, i) => bell(p, mtof(m), i * 0.05, 0.7, 0.8));
    const lp = p.filt('lowpass', 2200, 0.8);
    [62, 69].forEach((m) => p.osc({ w: 'softsaw', f: mtof(m), t: 0.15, a: 0.04, h: 0.1, d: 0.5, g: 0.14, to: lp }));
    p.noise({ flt: 'highpass', fc: 6000, t: 0.12, a: 0.02, d: 0.4, g: 0.05 });
  }, { ...UI, loud: -19, len: 1.1, gap: 0.2, rev: 0.26 }),
  ui_countdown: def('界面', '倒计时', (p) => {
    p.osc({ f: 880, a: 0.001, d: 0.07, g: 0.6 });
    p.osc({ w: 'triangle', f: 1760, a: 0.001, d: 0.03, g: 0.2 });
    p.noise({ flt: 'bandpass', fc: 2500, q: 2, a: 0.001, d: 0.012, g: 0.2 });
  }, { ...UI, loud: -22, len: 0.25, gap: 0.2, rev: 0.14 }),
} satisfies Partial<Record<SfxKey, SfxDef>>;
