/**
 * 播报提示乐句。全部以 D 为中心(与配乐的 D 多利亚同一音集)：
 * - 连杀：首杀 → 双杀 → … → 五杀，音符数、音高、配器逐级递进(加八度、定音鼓、镲、合唱、星辉)。
 * - 敌方达成时(v = 1)用「暗」变体：整体移低四度、旋律走向倒置成下行、二/六级降半音、
 *   去掉明亮的配器并垫一个三全音低鸣——一听就知道是坏消息。
 */
import { bell, brass, choir, cymbal, horn, snare, timpani } from '../instruments';
import { mtof } from '../synth';
import type { Patch } from '../synth';
import { def } from './defs';
import type { SfxDef, SfxKey } from './defs';

/** [拍, 相对根音的半音, 时值(拍), 力度] */
type Note = readonly [number, number, number, number];

interface Sting {
  bpm: number;
  mel: readonly Note[];
  inst?: 'brass' | 'horn';
  /** 高八度叠加 */
  oct?: boolean;
  /** 钟琴叠加旋律 */
  bells?: boolean;
  /** 定音鼓落点(拍) */
  timp?: readonly number[];
  /** 镲片落点(拍) */
  cym?: number;
  /** 结尾和弦(合唱)：[起始拍, 相对根音的半音组, 时值(拍)] */
  chord?: readonly [number, readonly number[], number];
  /** 结尾的上行星辉琶音 */
  sparkle?: boolean;
}

const ROOT = 62; // D4

/** 暗变体的音级改写：大二度/大六度/大三度/大七度各降半音(弗里几亚色彩) */
function darken(semi: number): number {
  const m = ((semi % 12) + 12) % 12;
  return m === 2 || m === 4 || m === 9 || m === 11 ? semi - 1 : semi;
}

function sting(p: Patch, s: Sting, dark: boolean): void {
  const beat = 60 / s.bpm;
  const root = ROOT + (dark ? -5 : 0);
  const n = s.mel.length;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const m = s.mel[i];
    const semi = dark ? darken(s.mel[n - 1 - i][1]) : m[1];
    const f = mtof(root + semi);
    const t = m[0] * beat;
    const dur = m[2] * beat;
    last = Math.max(last, t + dur);
    if (s.inst === 'horn') horn(p, f, t, dur, m[3]);
    else brass(p, f, t, dur, m[3], dark ? 0.85 : 1);
    if (dark) brass(p, f / 2, t, dur, m[3] * 0.35, 0.8);
    else {
      if (s.oct) brass(p, f * 2, t, dur, m[3] * 0.45, 1.1);
      if (s.bells) bell(p, f * 2, t, Math.max(0.4, dur), m[3] * 0.5);
    }
  }
  for (const b of s.timp ?? []) timpani(p, mtof(root - 24), b * beat, dark ? 0.55 : 0.6);
  if (s.cym !== undefined) {
    if (dark) p.noise({ k: 'pink', flt: 'lowpass', fc: 1800, fc1: 300, t: s.cym * beat, a: 0.004, d: 1.0, g: 0.35 });
    else cymbal(p, s.cym * beat, 0.6, 1.4);
  }
  if (s.chord) {
    const [at, notes, len] = s.chord;
    const fr = notes.map((x) => mtof(root + (dark ? darken(x) : x)));
    choir(p, fr, at * beat, len * beat, dark ? 0.35 : 0.5);
    last = Math.max(last, (at + len) * beat);
  }
  if (s.sparkle && !dark) {
    const top = s.mel[n - 1];
    const base = root + top[1] + 12;
    [0, 7, 12, 16, 19].forEach((x, i) => bell(p, mtof(base + x), top[0] * beat + 0.05 + i * 0.05, 0.7, 0.3));
  }
  if (dark) {
    // 三全音低鸣
    const lp = p.filt('lowpass', 520, 1);
    p.osc({ w: 'softsaw', f: mtof(root - 12), a: 0.05, h: last * 0.6, d: 0.6, g: 0.12, to: lp });
    p.osc({ w: 'softsaw', f: mtof(root - 6), a: 0.05, h: last * 0.6, d: 0.6, g: 0.09, to: lp });
  }
}

const BOTH = [{ label: '己方', v: 0 }, { label: '敌方', v: 1 }];
const ANN = { bus: 'ui', loud: -15, gap: 0.4, poly: 1, prio: 3, jitter: 0, rev: 0.26 } as const;

const S: Record<string, Sting> = {
  match_start: { bpm: 120, mel: [[0, 0, 1, 0.8], [1, 7, 1, 0.85], [2, 12, 2.5, 1]], oct: true, timp: [0, 1, 2], cym: 2, chord: [2, [-12, 0, 7, 14], 2.5] },
  minions_spawn: { bpm: 140, inst: 'horn', mel: [[0, 7, 0.5, 0.75], [0.5, 7, 0.5, 0.75], [1, 12, 1.6, 0.95]], timp: [1] },
  first_blood: { bpm: 150, mel: [[0, 0, 0.5, 0.9], [0.5, 7, 0.5, 0.95], [1, 12, 2, 1]], oct: true, timp: [0, 1], cym: 1, chord: [1, [0, 7, 12, 15], 2] },
  double_kill: { bpm: 150, mel: [[0, 7, 0.5, 0.9], [0.5, 12, 1.6, 1]], bells: true, timp: [0.5] },
  triple_kill: { bpm: 150, mel: [[0, 7, 0.5, 0.9], [0.5, 12, 0.5, 0.95], [1, 15, 1.6, 1]], bells: true, timp: [1], cym: 1 },
  quadra_kill: { bpm: 150, mel: [[0, 7, 0.5, 0.9], [0.5, 12, 0.5, 0.92], [1, 15, 0.5, 0.96], [1.5, 19, 2, 1]], oct: true, bells: true, timp: [0, 1.5], cym: 1.5, chord: [1.5, [0, 7, 12, 15], 2] },
  penta_kill: { bpm: 150, mel: [[0, 7, 0.5, 0.9], [0.5, 12, 0.5, 0.92], [1, 15, 0.5, 0.95], [1.5, 19, 0.5, 0.98], [2, 24, 3.2, 1]], oct: true, bells: true, timp: [0, 1, 2], cym: 2, chord: [2, [0, 4, 7, 12, 16], 3.2], sparkle: true },
  killing_spree: { bpm: 160, mel: [[0, 12, 0.5, 0.8], [0.5, 12, 0.5, 0.8], [1, 15, 1.3, 0.95]], timp: [1] },
  unstoppable: { bpm: 160, mel: [[0, 12, 0.5, 0.85], [0.5, 12, 0.5, 0.85], [1, 12, 0.5, 0.9], [1.5, 17, 1.8, 1]], oct: true, timp: [0, 1.5], cym: 1.5 },
  legendary: { bpm: 160, mel: [[0, 12, 0.5, 0.85], [0.5, 15, 0.5, 0.9], [1, 19, 0.5, 0.93], [1.5, 22, 0.5, 0.96], [2, 24, 3, 1]], oct: true, bells: true, timp: [0, 0.5, 1, 1.5, 2], cym: 2, chord: [2, [0, 7, 12, 16, 19], 3], sparkle: true },
  shutdown: { bpm: 150, mel: [[0, 19, 0.5, 1], [0.5, 12, 1.6, 0.95]], timp: [0.5] },
  ace: { bpm: 120, mel: [[0, 0, 0.75, 1], [1, 0, 0.4, 0.9], [1.5, 3, 0.4, 0.95], [2, 7, 3, 1]], oct: true, timp: [0, 1, 1.5, 2], cym: 2, chord: [2, [-12, 0, 7, 12, 15], 3], sparkle: true },
  tower_destroyed: { bpm: 120, inst: 'horn', mel: [[0, 0, 1, 0.85], [1, 7, 2.2, 0.95]], timp: [0, 1] },
  epic_slain: { bpm: 150, mel: [[0, 0, 0.5, 0.9], [0.5, 5, 0.5, 0.92], [1, 7, 0.5, 0.95], [1.5, 12, 2.2, 1]], oct: true, timp: [0, 1.5], cym: 1.5, chord: [1.5, [0, 7, 12, 16], 2.2], sparkle: true },
  super_minions: { bpm: 132, inst: 'horn', mel: [[0, 0, 0.5, 0.8], [0.5, 0, 0.5, 0.8], [1, 3, 0.5, 0.85], [1.5, 5, 1.6, 0.95]], timp: [0, 1.5] },
};

const stingDef = (key: string, label: string, len: number, loud: number, both: boolean, extra?: (p: Patch, dark: boolean) => void): SfxDef =>
  def('播报', label, (p, v) => {
    const dark = both && v > 0.5;
    sting(p, S[key], dark);
    extra?.(p, dark);
  }, { ...ANN, len, loud, variants: both ? BOTH : undefined });

export const ANNOUNCE = {
  ann_match_start: stingDef('match_start', '战斗开始', 2.8, -14, false, (p) => {
    snare(p, 0.5 - 0.11, 0.4);
    snare(p, 0.5 - 0.055, 0.5);
  }),
  ann_minions_spawn: stingDef('minions_spawn', '小兵出击', 1.5, -19, false),
  ann_first_blood: stingDef('first_blood', '首杀', 1.9, -14, true, (p, dark) => {
    // 一声出鞘的刀鸣
    if (!dark) p.ring(2600, [1, 1.48, 2.36], { a: 0.001, d: 0.5, g: 0.07 });
    p.noise({ flt: 'bandpass', fc: 3000, fc1: 6000, q: 2, a: 0.01, d: 0.1, g: 0.2 });
  }),
  ann_double_kill: stingDef('double_kill', '双杀', 1.3, -16, true),
  ann_triple_kill: stingDef('triple_kill', '三杀', 1.5, -15, true),
  ann_quadra_kill: stingDef('quadra_kill', '四杀', 2.0, -14, true),
  ann_penta_kill: stingDef('penta_kill', '五杀', 3.0, -12, true),
  ann_killing_spree: stingDef('killing_spree', '大杀特杀(连杀 3)', 1.3, -17, true),
  ann_unstoppable: stingDef('unstoppable', '势不可挡(连杀 5)', 1.6, -15, true),
  ann_legendary: stingDef('legendary', '超神(连杀 7+)', 2.6, -13, true),
  ann_shutdown: stingDef('shutdown', '终结', 1.4, -16, true, (p) => {
    p.noise({ flt: 'bandpass', fc: 5000, fc1: 1200, q: 1.5, a: 0.004, d: 0.14, g: 0.4 });
  }),
  ann_ace: stingDef('ace', '团灭', 3.2, -12, true),
  ann_tower_destroyed: stingDef('tower_destroyed', '摧毁防御塔', 2.2, -17, true, (p) => {
    p.noise({ k: 'brown', flt: 'lowpass', fc: 300, a: 0.05, d: 0.9, g: 0.2 });
  }),
  ann_epic_spawn: def('播报', '史诗野怪出现', (p) => {
    // 不祥的低音铜管簇 + 两记定音鼓
    const lp = p.filt('lowpass', 300, 1);
    p.ramp(lp.frequency, [[0, 300], [0.9, 2200], [2.0, 500]]);
    [38, 50, 57, 63].forEach((m, i) => {
      p.osc({ w: 'softsaw', f: mtof(m), det: i * 5 - 8, a: 0.8, h: 0.2, d: 0.9, g: 0.22, to: lp });
    });
    timpani(p, mtof(38), 0, 0.7);
    timpani(p, mtof(38), 0.85, 0.85);
    p.noise({ k: 'brown', flt: 'lowpass', fc: 200, a: 0.6, h: 0.3, d: 0.9, g: 0.25 });
    horn(p, mtof(62), 0.85, 0.9, 0.8);
    horn(p, mtof(63), 0.85, 0.9, 0.5);
    brass(p, mtof(50), 0.85, 0.9, 0.9, 0.8);
    brass(p, mtof(56), 0.85, 0.9, 0.7, 0.8);
  }, { ...ANN, len: 2.4, loud: -15 }),
  ann_epic_slain: stingDef('epic_slain', '史诗野怪被击杀', 2.2, -14, true),
  ann_super_minions: stingDef('super_minions', '超级兵出击', 1.7, -17, true),
  ann_victory: def('播报', '胜利(冲击音)', (p) => {
    // 只做一记辉煌的和弦冲击：旋律交给随后的胜利配乐
    timpani(p, mtof(38), 0, 0.9);
    timpani(p, mtof(45), 0.12, 0.6);
    cymbal(p, 0, 0.8, 2.2);
    // 各声部错开几毫秒进入：同时起振的振荡器相位对齐，会叠出一个很高的起始峰值
    [50, 57, 62, 66, 69, 74].forEach((m, i) => brass(p, mtof(m), i * 0.007, 1.2, 0.8 - i * 0.05, 1.1));
    choir(p, [mtof(62), mtof(66), mtof(69), mtof(74)], 0.01, 1.4, 0.5);
    [74, 78, 81, 86, 90].forEach((m, i) => bell(p, mtof(m), 0.08 + i * 0.06, 1.0, 0.45));
  }, { ...ANN, len: 2.6, loud: -12 }),
  ann_defeat: def('播报', '失败(冲击音)', (p) => {
    timpani(p, mtof(38), 0, 1);
    timpani(p, mtof(33), 0.5, 0.7);
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2400, fc1: 200, a: 0.004, d: 1.8, g: 0.5 });
    [38, 45, 50, 53, 57].forEach((m, i) => brass(p, mtof(m), i * 0.009, 1.5, 0.8 - i * 0.05, 0.75));
    // 下坠的叹息
    const lp = p.filt('lowpass', 900, 1);
    p.osc({ w: 'softsaw', f: mtof(69), f1: mtof(62), ft: 1.4, a: 0.1, h: 0.6, d: 0.9, g: 0.18, to: lp });
    p.osc({ w: 'softsaw', f: mtof(65), f1: mtof(57), ft: 1.4, a: 0.1, h: 0.6, d: 0.9, g: 0.14, to: lp });
  }, { ...ANN, len: 2.8, loud: -13 }),
} satisfies Partial<Record<SfxKey, SfxDef>>;
