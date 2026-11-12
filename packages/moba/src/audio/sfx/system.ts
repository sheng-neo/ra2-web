/**
 * 状态与系统音效：受击、死亡、复活、升级、金币、购买、回城、治疗、护盾、野区增益、史诗野怪、塔与水晶的毁灭。
 */
import { MONSTER_RULES } from '../../core/data/units';
import { bell, brass, horn } from '../instruments';
import { mtof } from '../synth';
import type { Patch } from '../synth';
import { COIN, CRYSTAL, METAL, def } from './defs';
import type { SfxDef, SfxKey } from './defs';
import { growl } from './timbre';

const A3 = mtof(57), D4 = mtof(62), F4 = mtof(65), A4 = mtof(69), C5 = mtof(72), D5 = mtof(74), G5 = mtof(79), A5 = mtof(81);
const C6 = mtof(84), D6 = mtof(86), E6 = mtof(88), G6 = mtof(91), A6 = mtof(93), C7 = mtof(96);

const SYS = { loud: -19, len: 0.8, gap: 0.1, poly: 2, prio: 2, jitter: 0.01, rev: 0.2 } as const;

/** 龙啸：比兽吼多一层高处的啸音和带水汽的嘶声。f 是喉音的整体高低(1 = 出生时的长啸) */
function dragonRoar(p: Patch, t: number, d: number, g: number, f = 1): void {
  // 失真之后再过一道低通：把被削成方波的边沿磨圆
  const dr = p.drive(4, p.filt('lowpass', 3200, 0.6));
  const lp = p.filt('lowpass', 300, 2.4, dr);
  p.ramp(lp.frequency, [[t, 300], [t + d * 0.22, 1900], [t + d * 0.7, 1200], [t + d, 300]]);
  p.osc({ w: 'sawtooth', f: 82 * f, f1: 58 * f, ft: d, t, a: d * 0.12, h: d * 0.5, d: d * 0.4, g: g * 0.55, vib: 90, vr: 29, vd: 0, to: lp });
  p.osc({ w: 'sawtooth', f: 123 * f, f1: 80 * f, ft: d, t, a: d * 0.15, h: d * 0.45, d: d * 0.4, g: g * 0.4, vib: 70, vr: 37, vd: 0, to: lp });
  p.osc({ w: 'softsaw', f: 520 * f, f1: 330 * f, ft: d, t: t + d * 0.08, a: d * 0.15, h: d * 0.35, d: d * 0.4, g: g * 0.22, vib: 40, vr: 9, vd: 0, to: p.filt('bandpass', 1400, 1.6) });
  p.noise({ k: 'brown', flt: 'bandpass', fc: 340, fc1: 180, q: 1.4, t, a: d * 0.14, h: d * 0.45, d: d * 0.5, g: g * 0.8 });
  p.noise({ flt: 'bandpass', fc: 2600, q: 3, t, a: d * 0.2, h: d * 0.35, d: d * 0.45, g: g * 0.14 });
  p.osc({ f: 46, t, a: d * 0.2, h: d * 0.35, d: d * 0.6, g: g * 0.4 });
}

/** 重物落水：一记闷响 + 泼开的水花 */
function splash(p: Patch, t: number, g: number): void {
  p.osc({ f: 84, f1: 30, ft: 0.3, t, a: 0.004, d: 0.7, g: g * 0.8 });
  p.noise({ k: 'pink', flt: 'lowpass', fc: 3000, fc1: 400, t, a: 0.004, d: 0.6, g: g * 0.8 });
  p.noise({ flt: 'highpass', fc: 3500, t: t + 0.02, a: 0.02, d: 0.5, g: g * 0.28 });
  p.scatter(6, t + 0.1, 0.6, (at) => p.noise({ flt: 'bandpass', fc: p.rr(1800, 4500), q: 3, t: at, a: 0.002, d: p.rr(0.02, 0.05), g: g * p.rr(0.1, 0.25) }));
}

export const SYSTEM = {
  // ───────────── 通用 FxKey ─────────────
  fx_heal: def('状态与系统', '治疗', (p) => {
    [C6, E6, G6].forEach((f, i) => p.fm({ f, ratio: 2, idx: 1.2, idx1: 0.05, t: i * 0.07, a: 0.004, d: 0.42, g: 0.2 }));
    p.osc({ w: 'glass', f: C5, a: 0.1, d: 0.5, g: 0.14 });
    p.osc({ w: 'glass', f: G5, t: 0.05, a: 0.12, d: 0.5, g: 0.1 });
    p.noise({ flt: 'highpass', fc: 6000, a: 0.15, d: 0.3, g: 0.04 });
  }, { ...SYS, loud: -24, gap: 0.4, group: 'heal', rev: 0.26 }),
  fx_shield_break: def('状态与系统', '护盾破碎', (p) => {
    p.noise({ flt: 'highpass', fc: 2500, a: 0.001, d: 0.26, g: 0.6 });
    p.osc({ f: 300, f1: 90, a: 0.001, d: 0.08, g: 0.6 });
    p.scatter(9, 0, 0.22, (at) => p.ring(p.rr(2000, 6000), CRYSTAL, { t: at, a: 0.001, d: p.rr(0.05, 0.14), g: 0.07 }));
    p.fm({ f: 1245, f1: 830, ratio: 1.41, idx: 2, idx1: 0.1, a: 0.001, d: 0.3, g: 0.14 });
  }, { ...SYS, loud: -19, len: 0.6, jitter: 0.04 }),
  fx_level_up: def('状态与系统', '升级(他人)', (p) => {
    [G5, C6, E6, G6].forEach((f, i) => bell(p, f, i * 0.055, 0.5, 0.7));
    p.noise({ flt: 'bandpass', fc: 800, fc1: 6000, q: 1.2, a: 0.24, d: 0.1, g: 0.2 });
    p.osc({ f: 196, a: 0.1, d: 0.4, g: 0.2 });
  }, { ...SYS, loud: -24, gap: 0.2, rev: 0.26 }),
  fx_respawn: def('状态与系统', '复活(他人)', (p) => {
    p.osc({ f: 110, f1: 220, a: 0.3, d: 0.4, g: 0.4 });
    p.noise({ flt: 'bandpass', fc: 400, fc1: 4200, q: 1.2, a: 0.34, d: 0.14, g: 0.3 });
    [D5, A5, D6].forEach((f, i) => bell(p, f, 0.34 + i * 0.03, 0.9, 0.6));
  }, { ...SYS, loud: -23, len: 1.4, rev: 0.28 }),
  fx_recall_start: def('状态与系统', '回城引导开始', (p) => {
    p.osc({ w: 'glass', f: 293.7, f1: 330, a: 0.2, d: 0.5, g: 0.3 });
    bell(p, A5, 0.05, 0.5, 0.6);
    p.noise({ flt: 'bandpass', fc: 2000, q: 2, a: 0.2, d: 0.3, g: 0.06 });
  }, { ...SYS, loud: -26, rev: 0.26 }),
  fx_recall_done: def('状态与系统', '回城传送完成', (p) => {
    p.noise({ flt: 'bandpass', fc: 500, fc1: 6500, fct: 0.18, q: 1.5, a: 0.16, d: 0.05, g: 0.7 });
    p.osc({ f: 300, f1: 1800, ft: 0.18, a: 0.15, d: 0.04, g: 0.2 });
    bell(p, D6, 0.19, 0.7, 0.8);
    bell(p, A6, 0.2, 0.6, 0.6);
    p.osc({ f: 125, f1: 60, t: 0.19, a: 0.003, d: 0.2, g: 0.6 });
    p.noise({ flt: 'highpass', fc: 5000, t: 0.19, a: 0.005, d: 0.4, g: 0.1 });
  }, { ...SYS, loud: -19, len: 1.0, rev: 0.28 }),
  fx_flash: def('状态与系统', '闪现', (p) => {
    p.noise({ flt: 'bandpass', fc: 1500, fc1: 9000, fct: 0.07, q: 1.5, a: 0.01, d: 0.07, g: 0.8 });
    p.osc({ f: 700, f1: 2800, ft: 0.07, a: 0.005, d: 0.07, g: 0.3 });
    const e = p.echo(0.09, 0.3, 0.35, 0.4);
    p.osc({ f: 1800, f1: 900, t: 0.08, a: 0.002, d: 0.08, g: 0.4, to: e });
    p.fm({ f: 2637, ratio: 3.01, idx: 1.5, idx1: 0.05, t: 0.08, a: 0.001, d: 0.26, g: 0.18, to: e });
    p.osc({ f: 160, f1: 70, t: 0.08, a: 0.002, d: 0.1, g: 0.4 });
  }, { ...SYS, loud: -18, len: 0.8, jitter: 0.03 }),
  fx_gold_gain: def('状态与系统', '金币掉落(他人)', (p) => {
    p.noise({ flt: 'highpass', fc: 6000, a: 0.001, d: 0.005, g: 0.2 });
    p.ring(2400, COIN, { a: 0.001, d: 0.13, g: 0.2 });
  }, { ...SYS, loud: -32, len: 0.25, gap: 0.12, prio: 0, jitter: 0.06, rev: 0.1 }),
  fx_tower_destroyed: def('状态与系统', '防御塔倒塌', (p) => {
    const dr = p.drive(3);
    p.osc({ f: 82, f1: 28, ft: 0.4, a: 0.004, d: 1.3, g: 0.8, to: dr });
    p.osc({ w: 'triangle', f: 240, f1: 60, ft: 0.3, a: 0.003, d: 0.45, g: 0.45, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 1600, fc1: 150, a: 0.004, d: 1.5, g: 0.9, to: dr });
    p.noise({ flt: 'bandpass', fc: 1800, q: 0.6, a: 0.001, d: 0.13, g: 0.8, to: dr });
    // 水晶尖塔碎裂
    p.scatter(14, 0.02, 0.7, (at) => p.ring(p.rr(1500, 5000), CRYSTAL, { t: at, a: 0.001, d: p.rr(0.08, 0.25), g: 0.1 }));
    // 塔身坍塌的滚石
    p.noise({ k: 'brown', flt: 'lowpass', fc: 320, t: 0.15, a: 0.25, h: 0.5, d: 0.9, g: 0.6 });
    p.scatter(12, 0.2, 1.4, (at) => {
      p.noise({ flt: 'bandpass', fc: p.rr(300, 1200), q: 2, t: at, a: 0.001, d: p.rr(0.05, 0.14), g: p.rr(0.2, 0.45) });
    });
    // 核心熄灭：下滑的鸣响
    p.fm({ f: 880, f1: 110, ft: 0.9, ratio: 1.5, idx: 3, idx1: 0.3, a: 0.01, d: 1.0, g: 0.14 });
  }, { ...SYS, loud: -12, len: 2.6, gap: 0.3, prio: 3, range: 46, rev: 0.32 }),
  fx_core_destroyed: def('状态与系统', '水晶爆炸', (p) => {
    // 过载尖啸与裂纹 → 大爆炸 → 晶屑与余波
    p.fm({ f: 200, f1: 2200, ft: 0.6, ratio: 1.5, idx: 4, a: 0.5, d: 0.12, g: 0.3 });
    p.noise({ flt: 'bandpass', fc: 600, fc1: 6000, fct: 0.6, q: 2, a: 0.55, d: 0.06, g: 0.5 });
    p.scatter(6, 0, 0.5, (at) => p.ring(p.rr(2000, 5000), CRYSTAL, { t: at, a: 0.001, d: 0.1, g: 0.06 }));
    const T = 0.62;
    const dr = p.drive(3.5);
    p.osc({ f: 64, f1: 22, ft: 0.7, t: T, a: 0.004, d: 2.4, g: 0.85, to: dr });
    p.osc({ f: 96, f1: 30, ft: 0.5, t: T + 0.08, a: 0.006, d: 1.6, g: 0.5, to: dr });
    p.osc({ w: 'triangle', f: 260, f1: 55, ft: 0.4, t: T, a: 0.003, d: 0.6, g: 0.45, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2400, fc1: 120, t: T, a: 0.004, d: 2.2, g: 1, to: dr });
    p.noise({ flt: 'bandpass', fc: 1500, q: 0.5, t: T, a: 0.001, d: 0.16, g: 0.9 });
    p.scatter(26, T + 0.02, 1.6, (at) => p.ring(p.rr(1200, 5200), CRYSTAL, { t: at, a: 0.001, d: p.rr(0.1, 0.35), g: 0.09 }));
    p.scatter(14, T + 0.2, 2.0, (at) => {
      p.noise({ flt: 'bandpass', fc: p.rr(250, 1100), q: 2, t: at, a: 0.001, d: p.rr(0.06, 0.16), g: p.rr(0.15, 0.3) });
    });
    p.fm({ f: 1760, f1: 55, ft: 2.2, ratio: 1.5, idx: 3, idx1: 0.2, t: T, a: 0.01, d: 2.4, g: 0.12 });
    p.osc({ f: 36.7, t: T + 0.3, a: 0.4, h: 0.6, d: 1.6, g: 0.5 });
  }, { ...SYS, loud: -10, len: 4.2, gap: 1, poly: 1, prio: 3, range: 400, rev: 0.36 }),
  fx_monster_slain: def('状态与系统', '野怪倒地', (p) => {
    p.osc({ w: 'triangle', f: 140, f1: 45, a: 0.003, d: 0.32, g: 0.7 });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 900, fc1: 250, a: 0.003, d: 0.28, g: 0.6 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 1400, q: 0.8, t: 0.03, a: 0.03, d: 0.3, g: 0.35 });
  }, { ...SYS, loud: -20, len: 0.6, jitter: 0.05 }),
  // 河道巨龙吐息：预警与喷吐的时长都跟随事件给的秒数(p.dur)
  fx_drake_breath_warn: def('状态与系统', '河道巨龙·吐息预警(蓄息)', (p) => {
    const d = Math.min(1.6, Math.max(0.4, p.dur));
    // 吸气：气流由低到高、越来越急，到喷吐的那一刻收住
    p.noise({ flt: 'bandpass', fc: 350, fc1: 2200, fct: d, q: 1.6, a: d * 0.95, d: 0.06, g: 0.7 });
    p.noise({ flt: 'highpass', fc: 4500, a: d * 0.95, d: 0.05, g: 0.08 });
    // 喉间的低吼跟着爬升
    const dr = p.drive(3, p.filt('lowpass', 2400, 0.6));
    const lp = p.filt('lowpass', 260, 2, dr);
    p.ramp(lp.frequency, [[0, 260], [d, 1100]]);
    p.osc({ w: 'sawtooth', f: 58, f1: 104, ft: d, a: d * 0.9, d: 0.1, g: 0.5, vib: 80, vr: 26, vd: 0, to: lp });
    p.osc({ w: 'sawtooth', f: 87, f1: 156, ft: d, a: d * 0.9, d: 0.1, g: 0.3, vib: 60, vr: 35, vd: 0, to: lp });
    // 腹甲节片由后向前逐节亮起：五下上行的晶音
    [0, 3, 7, 10, 14].forEach((semi, i) => p.fm({ f: mtof(62 + semi), ratio: 2.4, idx: 1.6, idx1: 0.1, t: d * (0.12 + i * 0.17), a: 0.004, d: 0.22, g: 0.09 + i * 0.02 }));
    // 口中聚光：一线越来越尖、颤得越来越快的鸣响——预警的主要识别音，小喇叭上也清楚
    const am = p.gain(0.6);
    p.lfo(am.gain, 9, 0.4, 0, d + 0.1, 22);
    p.osc({ w: 'softsq', f: 311, f1: 622, ft: d, a: d * 0.92, d: 0.06, g: 0.2, to: p.filt('lowpass', 2600, 1, am) });
    p.osc({ f: 933, f1: 1866, ft: d, a: d * 0.95, d: 0.05, g: 0.07, to: am });
  }, { ...SYS, loud: -18, len: 0.95, gap: 0.5, poly: 1, range: 34, rev: 0.26 }),
  fx_drake_breath: def('状态与系统', '河道巨龙·吐息喷吐', (p) => {
    const d = Math.min(1.6, Math.max(0.3, p.dur));
    const hold = Math.max(0.05, d - 0.12);
    // 喷流的主体：宽带气流，中心由亮转暗，带湍流的抖动
    const jet = p.gain(0.75);
    p.lfo(jet.gain, 23, 0.25, 0, d + 0.5);
    const bp = p.filt('bandpass', 1500, 0.7, jet);
    p.ramp(bp.frequency, [[0, 2400], [0.12, 1500], [d, 800]]);
    p.noise({ a: 0.03, h: hold, d: 0.35, g: 2.2, to: bp });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 520, fc1: 200, a: 0.03, h: hold, d: 0.4, g: 0.7, to: jet });
    // 深渊的质感：带水汽的高频嘶声 + 压着嗓子的喉音
    p.noise({ flt: 'bandpass', fc: 5200, q: 2.5, a: 0.05, h: hold, d: 0.3, g: 0.25, to: jet });
    const dr = p.drive(3, p.filt('lowpass', 1800, 0.6));
    p.osc({ w: 'sawtooth', f: 74, f1: 52, ft: d, a: 0.03, h: hold, d: 0.3, g: 0.35, vib: 90, vr: 31, vd: 0, to: p.filt('lowpass', 700, 1.5, dr) });
    p.osc({ f: 62, f1: 40, a: 0.02, h: hold * 0.8, d: 0.5, g: 0.5 });
    // 张口的一下爆发
    p.noise({ flt: 'bandpass', fc: 1100, q: 0.6, a: 0.002, d: 0.1, g: 0.9 });
    // 每一跳伤害：喷流里的一次鼓动
    const ticks = Math.max(1, Math.round(MONSTER_RULES.breathTicks));
    for (let i = 0; i < ticks; i++) p.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 1, t: (d * i) / ticks, a: 0.01, d: 0.12, g: 0.45 });
    // 口角余雾
    p.noise({ flt: 'highpass', fc: 3800, t: d, a: 0.08, d: 0.45, g: 0.07 });
  }, { ...SYS, loud: -14, len: 1.3, gap: 0.5, poly: 1, prio: 3, range: 34, rev: 0.3 }),
  fx_buff_gain: def('状态与系统', '获得野区增益', (p) => {
    const lp = p.filt('lowpass', 800, 1);
    p.ramp(lp.frequency, [[0, 800], [0.3, 3200], [0.8, 1000]]);
    [D4, A4, D5].forEach((f, i) => p.osc({ w: 'softsaw', f, det: i * 6 - 6, a: 0.15, d: 0.6, g: 0.22, to: lp }));
    p.noise({ flt: 'bandpass', fc: 600, fc1: 5200, q: 1.2, a: 0.25, d: 0.1, g: 0.3 });
    bell(p, D6, 0.26, 0.7, 0.7);
    bell(p, A6, 0.33, 0.7, 0.6);
    p.osc({ f: 73.4, a: 0.15, d: 0.5, g: 0.4 });
  }, { ...SYS, loud: -18, len: 1.2, rev: 0.28 }),

  // ───────────── 玩家受击 / 命中确认 / 濒死 ─────────────
  player_hurt: def('状态与系统', '玩家受击', (p, v) => {
    p.osc({ f: 180, f1: 70, a: 0.002, d: 0.09 + v * 0.05, g: 0.8 });
    p.noise({ flt: 'bandpass', fc: 900, q: 1, a: 0.002, d: 0.07, g: 0.5 });
    p.noise({ flt: 'highpass', fc: 3000, a: 0.001, d: 0.012, g: 0.2 + v * 0.3 });
  }, { ...SYS, bus: 'ui', loud: -22, len: 0.3, gap: 0.1, group: 'hurt', jitter: 0.06, rev: 0.05 }),
  player_hurt_heavy: def('状态与系统', '玩家受重击', (p) => {
    const dr = p.drive(3);
    p.osc({ w: 'triangle', f: 190, f1: 55, a: 0.002, d: 0.3, g: 0.8, to: dr });
    p.noise({ flt: 'bandpass', fc: 1100, q: 0.8, a: 0.001, d: 0.1, g: 0.9, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 500, a: 0.01, d: 0.25, g: 0.4 });
    // 短暂的「耳鸣」
    p.osc({ f: 2400, a: 0.01, d: 0.4, g: 0.025 });
  }, { ...SYS, bus: 'ui', loud: -17, len: 0.6, gap: 0.12, group: 'hurt', prio: 3, jitter: 0.04, rev: 0.08 }),
  skill_hit: def('状态与系统', '技能命中确认', (p) => {
    p.fm({ f: 1320, ratio: 2, idx: 1, idx1: 0.05, a: 0.001, d: 0.11, g: 0.4 });
    p.noise({ flt: 'highpass', fc: 5000, a: 0.001, d: 0.012, g: 0.25 });
    p.osc({ f: 660, a: 0.001, d: 0.05, g: 0.15 });
  }, { ...SYS, bus: 'ui', loud: -27, len: 0.25, gap: 0.08, jitter: 0.04, rev: 0.08 }),
  heartbeat: def('状态与系统', '濒死心跳', (p) => {
    // 用三角波 + 高一个八度的泛音：纯低频正弦在手机喇叭上听不见
    p.osc({ w: 'triangle', f: 120, f1: 70, a: 0.006, d: 0.12, g: 1 });
    p.osc({ f: 240, f1: 140, a: 0.004, d: 0.06, g: 0.4 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 400, q: 2, a: 0.003, d: 0.04, g: 0.5 });
    p.osc({ w: 'triangle', f: 105, f1: 62, t: 0.24, a: 0.006, d: 0.14, g: 0.7 });
    p.osc({ f: 210, f1: 124, t: 0.24, a: 0.004, d: 0.06, g: 0.28 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 350, q: 2, t: 0.24, a: 0.003, d: 0.04, g: 0.3 });
  }, { ...SYS, bus: 'ui', loud: -22, len: 0.6, gap: 0.5, poly: 1, rev: 0 }),

  // ───────────── 死亡 ─────────────
  death_hero_ally: def('状态与系统', '友方英雄阵亡', (p) => {
    const lp = p.filt('lowpass', 1000, 0.9);
    p.osc({ w: 'softsaw', f: A4, a: 0.01, h: 0.12, d: 0.25, g: 0.3, to: lp });
    p.osc({ w: 'softsaw', f: D4, t: 0.2, a: 0.01, h: 0.2, d: 0.6, g: 0.34, to: lp });
    p.osc({ w: 'softsaw', f: F4, t: 0.2, a: 0.01, h: 0.2, d: 0.6, g: 0.18, to: lp });
    p.noise({ flt: 'bandpass', fc: 3000, fc1: 300, q: 1, a: 0.02, d: 0.6, g: 0.3 });
    p.osc({ f: 110, f1: 45, a: 0.003, d: 0.3, g: 0.7 });
  }, { ...SYS, loud: -18, len: 1.2, rev: 0.26 }),
  death_hero_enemy: def('状态与系统', '敌方英雄阵亡', (p) => {
    p.noise({ k: 'pink', flt: 'lowpass', fc: 4200, fc1: 500, a: 0.002, d: 0.32, g: 0.8 });
    p.osc({ w: 'triangle', f: 180, f1: 60, a: 0.002, d: 0.22, g: 0.5 });
    [E6, C6, A5].forEach((f, i) => bell(p, f, 0.03 + i * 0.06, 0.4, 0.95));
    p.noise({ flt: 'highpass', fc: 6000, t: 0.05, a: 0.02, d: 0.4, g: 0.07 });
  }, { ...SYS, loud: -17, len: 0.9, rev: 0.24 }),
  death_player: def('状态与系统', '玩家阵亡', (p) => {
    const dr = p.drive(2);
    p.osc({ f: 72, f1: 28, ft: 0.4, a: 0.004, d: 1.1, g: 1, to: dr });
    const lp = p.filt('lowpass', 1400, 1);
    p.ramp(lp.frequency, [[0, 1400], [1.0, 200]]);
    p.osc({ w: 'softsaw', f: A4, f1: 110, ft: 0.95, a: 0.02, h: 0.3, d: 0.7, g: 0.4, to: lp });
    p.osc({ w: 'softsaw', f: D4, f1: 73.4, ft: 0.95, a: 0.02, h: 0.3, d: 0.7, g: 0.3, to: lp });
    p.noise({ flt: 'bandpass', fc: 3200, fc1: 200, fct: 0.9, q: 1.2, a: 0.03, d: 0.9, g: 0.5 });
    // 丧钟
    p.fm({ f: D4, ratio: 3.5, idx: 2, idx1: 0.05, idt: 0.4, t: 0.5, a: 0.004, d: 1.5, g: 0.2 });
    p.fm({ f: A3, ratio: 3.5, idx: 2, idx1: 0.05, idt: 0.4, t: 0.52, a: 0.004, d: 1.5, g: 0.16 });
  }, { ...SYS, bus: 'ui', loud: -14, len: 2.2, prio: 3, rev: 0.3 }),
  death_minion: def('状态与系统', '小兵阵亡', (p) => {
    p.noise({ flt: 'bandpass', fc: 1300, fc1: 400, q: 1, a: 0.002, d: 0.13, g: 0.6 });
    p.osc({ f: 240, f1: 90, a: 0.002, d: 0.1, g: 0.5 });
    p.scatter(3, 0.02, 0.12, (at) => p.ring(p.rr(900, 1800), [1, 2.4], { t: at, a: 0.001, d: 0.04, g: 0.08 }));
  }, { ...SYS, loud: -26, len: 0.35, gap: 0.09, poly: 3, prio: 0, jitter: 0.1, rev: 0.08 }),
  death_minion_big: def('状态与系统', '攻城兵/超级兵阵亡', (p) => {
    p.noise({ k: 'pink', flt: 'lowpass', fc: 1500, fc1: 250, a: 0.002, d: 0.3, g: 0.8 });
    p.osc({ f: 130, f1: 48, a: 0.002, d: 0.26, g: 0.8 });
    p.scatter(5, 0.02, 0.25, (at) => p.ring(p.rr(400, 900), METAL, { t: at, a: 0.001, d: 0.09, g: 0.1 }));
  }, { ...SYS, loud: -22, len: 0.6, gap: 0.1, prio: 1, jitter: 0.06 }),
  death_monster: def('状态与系统', '野怪·倒下', (p, v) => {
    if (v < 0.5) {
      // 苔背獾：一声下行的尖叫 + 四脚朝天的一摔
      p.sub(1, (q) => {
        const lp = q.filt('lowpass', 1500, 1.5);
        q.osc({ w: 'sawtooth', f: 330, f1: 110, ft: 0.3, a: 0.01, d: 0.32, g: 0.5, vib: 50, vr: 19, vd: 0, to: lp });
        q.noise({ k: 'pink', flt: 'bandpass', fc: 900, fc1: 400, q: 1, a: 0.01, d: 0.3, g: 0.4 });
        q.osc({ f: 110, f1: 50, t: 0.22, a: 0.003, d: 0.2, g: 0.7 });
      });
    } else if (v < 1.5) {
      // 霜晶巨鹿：一声下行的长鸣 + 跪倒 + 鹿角由尖向根碎成冰屑
      p.sub(1, (q) => {
        const bp = q.filt('bandpass', 850, 2.2);
        q.osc({ w: 'reed', f: 330, f1: 165, ft: 0.5, a: 0.03, h: 0.15, d: 0.4, g: 0.5, vib: 30, vr: 7, vd: 0.1, to: bp });
        q.osc({ w: 'softsaw', f: 330, f1: 165, ft: 0.5, a: 0.04, h: 0.12, d: 0.36, g: 0.2, to: bp });
        q.osc({ f: 100, f1: 44, t: 0.3, a: 0.003, d: 0.26, g: 0.7 });
        q.scatter(9, 0.32, 0.4, (at) => q.ring(q.rr(2200, 5600), CRYSTAL, { t: at, a: 0.001, d: q.rr(0.05, 0.16), g: 0.07 }));
      });
    } else if (v < 2.5) {
      // 炽焰巨熊：人立长嚎 → 前扑趴倒 → 熔核熄灭的嘶声
      p.sub(1, (q) => {
        growl(q, 0, 0.5, 0.8, 120, 62, 400, 1300);
        const dr = q.drive(2);
        q.osc({ f: 92, f1: 34, t: 0.42, a: 0.003, d: 0.4, g: 0.8, to: dr });
        q.noise({ k: 'pink', flt: 'lowpass', fc: 1200, fc1: 250, t: 0.42, a: 0.003, d: 0.3, g: 0.6, to: dr });
        q.noise({ flt: 'highpass', fc: 3200, fc1: 1500, t: 0.45, a: 0.03, d: 0.45, g: 0.12 });
      });
    } else {
      // 荧翅蛾：扑翅越来越慢，像落叶一样飘下，碎成鳞粉
      p.sub(1, (q) => {
        const g = q.gain(0.6);
        q.lfo(g.gain, 18, 0.4, 0, 0.45, 5);
        q.noise({ flt: 'bandpass', fc: 1400, fc1: 600, q: 1.5, a: 0.02, d: 0.4, g: 0.7, to: g });
        q.osc({ f: 2300, f1: 900, ft: 0.35, a: 0.01, d: 0.35, g: 0.06 });
        q.noise({ k: 'pink', flt: 'lowpass', fc: 2200, fc1: 600, t: 0.3, a: 0.01, d: 0.16, g: 0.4 });
      });
    }
  }, { ...SYS, loud: -21, len: 0.8, jitter: 0.06, variants: [{ label: '苔背獾', v: 0 }, { label: '霜晶巨鹿', v: 1 }, { label: '炽焰巨熊', v: 2 }, { label: '荧翅蛾', v: 5 }] }),

  // ───────────── 史诗野怪 ─────────────
  epic_roar: def('状态与系统', '史诗野怪现身', (p, v) => {
    if (v < 0.5) {
      // 河道巨龙：潭面起旋涡 → 水柱炸开 → 展翼长啸
      p.sub(1, (q) => {
        const sw = q.gain(0.6);
        q.lfo(sw.gain, 2.5, 0.35, 0, 1.1, 7);
        q.noise({ k: 'pink', flt: 'bandpass', fc: 500, fc1: 1500, fct: 1.0, q: 1.2, a: 0.9, d: 0.12, g: 0.9, to: sw });
        q.noise({ k: 'brown', flt: 'lowpass', fc: 200, a: 0.8, d: 0.3, g: 0.5 });
        splash(q, 1.0, 1);
        dragonRoar(q, 1.55, 1.1, 1);
      });
    } else {
      // 远古巨灵：陨星拖尾坠下 → 砸进潭心 → 碎石浮起拼合 → 浑仪点亮
      p.sub(1, (q) => {
        q.osc({ f: 2200, f1: 240, ft: 0.95, a: 0.5, d: 0.5, g: 0.12 });
        q.noise({ flt: 'bandpass', fc: 5000, fc1: 700, fct: 0.95, q: 2, a: 0.85, d: 0.1, g: 0.5 });
        const T = 1.0;
        const dr = q.drive(3);
        q.osc({ f: 70, f1: 24, ft: 0.5, t: T, a: 0.004, d: 1.4, g: 0.9, to: dr });
        q.noise({ k: 'pink', flt: 'lowpass', fc: 2200, fc1: 160, t: T, a: 0.004, d: 1.1, g: 0.9, to: dr });
        q.noise({ flt: 'highpass', fc: 3000, t: T + 0.03, a: 0.05, d: 0.9, g: 0.2 });
        // 石块一块块相扣，越来越密
        for (let i = 0; i < 9; i++) {
          const t = T + 0.25 + 1.3 * Math.pow(i / 9, 0.75);
          q.noise({ flt: 'bandpass', fc: 400 + i * 70, q: 2.2, t, a: 0.001, d: 0.06, g: 0.35 });
          q.osc({ f: 120 + i * 9, f1: 70, t, a: 0.002, d: 0.07, g: 0.3 });
        }
        // 浑仪环点亮：一组金属和声升起
        [D4, A4, D5, A5, E6].forEach((f, i) => q.fm({ f, ratio: 1.41, idx: 1.8, idx1: 0.3, t: T + 1.5 + i * 0.05, a: 0.3, h: 0.3, d: 0.9, g: 0.09 }));
        q.osc({ f: 36.7, t: T + 1.4, a: 0.4, h: 0.3, d: 1.0, g: 0.4 });
      });
    }
  }, { ...SYS, loud: -14, len: 3.6, gap: 1, poly: 1, prio: 3, range: 400, rev: 0.34, variants: [{ label: '河道巨龙', v: 0 }, { label: '远古巨灵', v: 1 }] }),
  epic_fall: def('状态与系统', '史诗野怪倒下', (p, v) => {
    if (v < 0.5) {
      // 河道巨龙：仰天长啸 → 渊珠碎裂 → 侧倒 → 头颈落水 → 鳞片化成上升的光点
      p.sub(1, (q) => {
        dragonRoar(q, 0, 0.75, 0.9, 1.25);
        q.noise({ flt: 'highpass', fc: 4000, t: 0.6, a: 0.001, d: 0.03, g: 0.4 });
        q.scatter(7, 0.6, 0.25, (at) => q.ring(q.rr(2200, 5200), CRYSTAL, { t: at, a: 0.001, d: q.rr(0.08, 0.2), g: 0.1 }));
        const dr = q.drive(2.5);
        q.osc({ f: 64, f1: 24, ft: 0.5, t: 1.25, a: 0.004, d: 1.2, g: 0.8, to: dr });
        q.noise({ k: 'pink', flt: 'lowpass', fc: 1500, fc1: 140, t: 1.25, a: 0.004, d: 0.9, g: 0.8, to: dr });
        splash(q, 1.8, 0.7);
        q.noise({ flt: 'bandpass', fc: 2500, fc1: 7000, fct: 1.1, q: 2, t: 2.0, a: 0.5, d: 0.6, g: 0.1 });
        [D5, A5, D6, A6].forEach((f, i) => bell(q, f, 2.0 + i * 0.12, 0.9, 0.5));
      });
    } else {
      // 远古巨灵：浑仪环一道道崩断 → 双拳坠水 → 肩台胸甲塌成石冢 → 星核升空爆成星雨
      p.sub(1, (q) => {
        [0, 0.34, 0.68].forEach((t, i) => {
          q.fm({ f: 660 - i * 110, f1: 180, ft: 0.5, ratio: 1.41, idx: 3, idx1: 0.4, t, a: 0.002, d: 0.5, g: 0.3 });
          q.noise({ flt: 'bandpass', fc: 2600, q: 1.5, t, a: 0.001, d: 0.03, g: 0.5 });
        });
        splash(q, 1.0, 0.8);
        splash(q, 1.3, 0.7);
        const dr = q.drive(2.5);
        q.osc({ f: 58, f1: 24, ft: 0.6, t: 1.6, a: 0.01, d: 1.3, g: 0.8, to: dr });
        q.noise({ k: 'pink', flt: 'lowpass', fc: 1300, fc1: 140, t: 1.6, a: 0.05, d: 1.0, g: 0.8, to: dr });
        q.scatter(10, 1.6, 0.9, (at) => q.noise({ flt: 'bandpass', fc: q.rr(300, 1100), q: 2, t: at, a: 0.001, d: q.rr(0.05, 0.12), g: q.rr(0.15, 0.3) }));
        q.osc({ f: 300, f1: 1800, ft: 0.4, t: 2.2, a: 0.35, d: 0.08, g: 0.2 });
        [D5, A5, D6].forEach((f) => bell(q, f, 2.6, 1.0, 0.6));
        const rain = [86, 88, 91, 93, 96, 98].map(mtof);
        q.scatter(12, 2.6, 0.9, (at, i) => bell(q, rain[i % rain.length], at, 0.6, 0.4));
      });
    }
  }, { ...SYS, loud: -13, len: 3.6, gap: 1, poly: 1, prio: 3, range: 400, rev: 0.32, variants: [{ label: '河道巨龙', v: 0 }, { label: '远古巨灵', v: 1 }] }),

  // ───────────── 击杀提示(无更高级播报时) ─────────────
  kill_player: def('状态与系统', '玩家完成击杀', (p) => {
    [D5, A5, D6].forEach((f, i) => {
      brass(p, f, i * 0.05, i === 2 ? 0.3 : 0.06, 0.9);
      bell(p, f * 2, i * 0.05, 0.4, 0.5);
    });
    p.noise({ flt: 'highpass', fc: 6000, t: 0.1, a: 0.01, d: 0.4, g: 0.06 });
  }, { ...SYS, bus: 'ui', loud: -17, len: 0.8, rev: 0.24 }),
  kill_ally: def('状态与系统', '友方完成击杀', (p) => {
    bell(p, A5, 0, 0.3, 0.6);
    bell(p, D6, 0.08, 0.5, 0.7);
  }, { ...SYS, bus: 'ui', loud: -25, len: 0.7, rev: 0.24 }),
  kill_enemy: def('状态与系统', '敌方完成击杀', (p) => {
    horn(p, D5, 0, 0.1, 0.8);
    horn(p, A4, 0.11, 0.3, 0.9);
    p.osc({ f: 110, f1: 73, a: 0.01, d: 0.4, g: 0.2 });
  }, { ...SYS, bus: 'ui', loud: -24, len: 0.7, rev: 0.24 }),

  // ───────────── 玩家成长 ─────────────
  levelup_player: def('状态与系统', '玩家升级', (p) => {
    [G5, C6, E6, G6].forEach((f, i) => {
      bell(p, f, i * 0.06, 0.6, 0.8);
      bell(p, f / 2, i * 0.06, 0.4, 0.4);
    });
    // 落在一个明亮的大三和弦上
    [C6, E6, G6, C7].forEach((f) => bell(p, f, 0.26, 1.0, 0.5));
    const lp = p.filt('lowpass', 600, 0.8);
    p.ramp(lp.frequency, [[0, 600], [0.3, 2400], [1.0, 800]]);
    [mtof(60), mtof(67), C5].forEach((f, i) => p.osc({ w: 'softsaw', f, det: i * 7 - 7, a: 0.25, h: 0.1, d: 0.6, g: 0.14, to: lp }));
    p.noise({ flt: 'bandpass', fc: 800, fc1: 7000, q: 1.2, a: 0.26, d: 0.12, g: 0.18 });
    p.osc({ f: 130.8, a: 0.1, d: 0.5, g: 0.3 });
  }, { ...SYS, bus: 'ui', loud: -16, len: 1.5, rev: 0.3 }),
  respawn_player: def('状态与系统', '玩家复活', (p) => {
    p.osc({ f: 73.4, f1: 146.8, a: 0.35, d: 0.5, g: 0.6 });
    p.noise({ flt: 'bandpass', fc: 300, fc1: 5000, q: 1.2, a: 0.4, d: 0.16, g: 0.4 });
    [D5, A5, D6, mtof(90)].forEach((f, i) => bell(p, f, 0.4 + i * 0.035, 1.1, 0.7));
    const lp = p.filt('lowpass', 1800, 0.8);
    [D4, A4].forEach((f) => p.osc({ w: 'softsaw', f, t: 0.38, a: 0.05, h: 0.2, d: 0.7, g: 0.16, to: lp }));
  }, { ...SYS, bus: 'ui', loud: -17, len: 1.7, rev: 0.3 }),
  coin: def('状态与系统', '补刀金币', (p, v) => {
    const k = 1 + v * 0.25;
    p.noise({ flt: 'highpass', fc: 6000, a: 0.001, d: 0.006, g: 0.3 });
    p.ring(1976 * k, COIN, { a: 0.001, d: 0.2, g: 0.28 });
    p.ring(2637 * k, COIN, { t: 0.055, a: 0.001, d: 0.34, g: 0.3 });
  }, { ...SYS, bus: 'ui', loud: -20, len: 0.5, gap: 0.07, poly: 3, group: 'coin', jitter: 0.02, rev: 0.14 }),
  coin_big: def('状态与系统', '大额金币', (p) => {
    p.osc({ f: 180, f1: 90, a: 0.002, d: 0.1, g: 0.3 });
    p.scatter(7, 0, 0.3, (at, i) => p.ring(1760 * (1 + i * 0.09), COIN, { t: at, a: 0.001, d: p.rr(0.15, 0.3), g: 0.16 }));
    p.ring(3520, COIN, { t: 0.32, a: 0.001, d: 0.45, g: 0.2 });
    p.noise({ flt: 'highpass', fc: 7000, a: 0.02, d: 0.35, g: 0.06 });
  }, { ...SYS, bus: 'ui', loud: -19, len: 0.9, gap: 0.2, rev: 0.16 }),
  buy: def('状态与系统', '购买装备', (p) => {
    [0, 0.045, 0.09].forEach((t, i) => p.ring(2637 / (1 + i * 0.12), COIN, { t, a: 0.001, d: 0.12, g: 0.18 }));
    p.osc({ f: 200, f1: 120, t: 0.1, a: 0.002, d: 0.08, g: 0.4 });
    bell(p, A5, 0.14, 0.4, 0.8);
    bell(p, D6, 0.22, 0.6, 0.9);
  }, { ...SYS, bus: 'ui', loud: -19, len: 0.9, gap: 0.25, group: 'buy', rev: 0.18 }),
  reject: def('状态与系统', '操作被拒绝', (p) => {
    const lp = p.filt('lowpass', 1100, 1);
    p.osc({ w: 'softsq', f: 247, a: 0.004, d: 0.07, g: 0.5, to: lp });
    p.osc({ w: 'softsq', f: 233, t: 0.09, a: 0.004, d: 0.1, g: 0.5, to: lp });
  }, { ...SYS, bus: 'ui', loud: -26, len: 0.3, gap: 0.25, group: 'error', rev: 0.04 }),
  recall_channel: def('状态与系统', '回城引导(持续)', (p) => {
    const d = Math.max(1, p.dur);
    const g = p.gain(1);
    // 颤动越来越快，音高与亮度一起爬升
    p.lfo(g.gain, 3, 0.3, 0, d + 0.3, 9);
    const lp = p.filt('lowpass', 500, 1.2, g);
    p.ramp(lp.frequency, [[0, 500], [d, 2600]]);
    p.osc({ w: 'softsaw', f: 146.8, f1: 220, ft: d, a: d * 0.95, d: 0.15, g: 0.5, to: lp });
    p.osc({ w: 'softsaw', f: 220.5, f1: 330, ft: d, a: d * 0.95, d: 0.15, g: 0.35, to: lp });
    p.noise({ flt: 'bandpass', fc: 1200, fc1: 5000, fct: d, q: 2, a: d * 0.95, d: 0.15, g: 0.14, to: g });
    const scale = [74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
    const n = Math.min(scale.length, Math.floor(d / 0.5));
    for (let i = 0; i < n; i++) {
      p.fm({ f: mtof(scale[i + scale.length - n]), ratio: 3.01, idx: 1.5, idx1: 0.05, t: i * 0.5 + 0.25, a: 0.002, d: 0.4, g: 0.08 + i * 0.012 });
    }
  }, { ...SYS, bus: 'ui', loud: -24, len: 5, gap: 0.5, poly: 1, rev: 0.24 }),
} satisfies Partial<Record<SfxKey, SfxDef>>;
