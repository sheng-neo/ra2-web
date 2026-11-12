/**
 * 战斗基础音效：英雄普攻、小兵/野怪/塔、通用命中、技能弹道。
 * 每个配方都按「瞬态 + 主体 + 尾音」分层，主题音色随英雄：岩石 / 火焰 / 星辉 / 疾风 / 暗影。
 */
import { BLADE, CRYSTAL, DAGGER, METAL, def } from './defs';
import type { SfxDef, SfxKey } from './defs';

export const COMBAT = {
  // ───────────── 磐岳：沉重锤击 ─────────────
  atk_panyue_swing: def('英雄普攻', '磐岳·抡锤', (p) => {
    p.noise({ k: 'pink', flt: 'bandpass', fc: 170, fc1: 620, fct: 0.17, q: 1.3, a: 0.1, d: 0.14, g: 0.9 });
    p.noise({ k: 'brown', flt: 'lowpass', fc: 260, a: 0.08, d: 0.16, g: 0.6 });
    p.osc({ f: 62, f1: 48, a: 0.06, d: 0.16, g: 0.3 });
  }, { loud: -27, len: 0.4, gap: 0.12, rev: 0.06 }),
  atk_panyue_hit: def('英雄普攻', '磐岳·锤击命中', (p) => {
    // 主体过一道软失真：压低峰值、加厚质感，同样的峰值下听起来更重
    const dr = p.drive(2.5);
    p.osc({ f: 118, f1: 40, ft: 0.1, a: 0.002, d: 0.3, g: 0.8, to: dr });
    p.osc({ w: 'triangle', f: 260, f1: 120, ft: 0.06, a: 0.001, d: 0.12, g: 0.5, to: dr });
    p.noise({ flt: 'highpass', fc: 2800, a: 0.001, d: 0.012, g: 0.3 });
    p.noise({ flt: 'bandpass', fc: 1300, q: 0.8, a: 0.001, d: 0.09, g: 0.6, to: dr });
    p.noise({ k: 'brown', flt: 'lowpass', fc: 500, a: 0.004, d: 0.18, g: 0.35, to: dr });
    p.ring(410, METAL, { a: 0.002, d: 0.28, g: 0.16 });
  }, { loud: -16, len: 0.55, gap: 0.08, rev: 0.14 }),

  // ───────────── 赤烬：利刃挥砍 ─────────────
  atk_chijin_swing: def('英雄普攻', '赤烬·挥刃', (p) => {
    p.noise({ flt: 'bandpass', fc: 1700, fc1: 5400, fct: 0.09, q: 2.2, a: 0.03, d: 0.08, g: 0.8 });
    p.osc({ f: 900, f1: 2400, a: 0.03, d: 0.06, g: 0.06 });
    p.noise({ flt: 'highpass', fc: 6000, t: 0.02, a: 0.04, d: 0.12, g: 0.07 });
  }, { loud: -27, len: 0.3, gap: 0.1, rev: 0.06 }),
  atk_chijin_hit: def('英雄普攻', '赤烬·斩击命中', (p) => {
    p.noise({ flt: 'highpass', fc: 4500, a: 0.001, d: 0.01, g: 0.4 });
    p.noise({ flt: 'bandpass', fc: 3600, q: 1.5, a: 0.001, d: 0.055, g: 0.7 });
    p.ring(2100, BLADE, { a: 0.001, d: 0.24, g: 0.16 });
    p.osc({ w: 'triangle', f: 230, f1: 110, a: 0.002, d: 0.08, g: 0.35 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 1100, fc1: 500, q: 0.8, a: 0.01, d: 0.15, g: 0.3 });
  }, { loud: -17, len: 0.45, gap: 0.07 }),

  // ───────────── 星璃：星辉弹 ─────────────
  atk_xingli_charge: def('英雄普攻', '星璃·凝星', (p) => {
    p.fm({ f: 880, f1: 1320, ratio: 2, idx: 1.2, idx1: 0.2, a: 0.05, d: 0.1, g: 0.25 });
    p.noise({ flt: 'highpass', fc: 7000, a: 0.05, d: 0.08, g: 0.06 });
  }, { loud: -30, len: 0.3, gap: 0.12 }),
  atk_xingli_launch: def('英雄普攻', '星璃·星辉弹出手', (p) => {
    p.fm({ f: 1400, f1: 620, ft: 0.12, ratio: 2, idx: 3, idx1: 0.3, a: 0.002, d: 0.17, g: 0.6 });
    p.osc({ f: 2800, f1: 1240, a: 0.002, d: 0.1, g: 0.12 });
    p.noise({ flt: 'highpass', fc: 7000, a: 0.001, d: 0.05, g: 0.2 });
    p.osc({ f: 310, f1: 180, a: 0.002, d: 0.07, g: 0.25 });
  }, { loud: -21, len: 0.35, gap: 0.07, rev: 0.18 }),
  atk_xingli_hit: def('英雄普攻', '星璃·星辉弹命中', (p) => {
    p.fm({ f: 1568, ratio: 3.5, idx: 2, idx1: 0.05, idt: 0.15, a: 0.001, d: 0.36, g: 0.42 });
    p.fm({ f: 2093, ratio: 3.5, idx: 1.5, idx1: 0.05, idt: 0.12, t: 0.03, a: 0.001, d: 0.3, g: 0.22 });
    p.noise({ flt: 'bandpass', fc: 5000, q: 1, a: 0.001, d: 0.06, g: 0.4 });
    p.osc({ f: 240, f1: 140, a: 0.002, d: 0.08, g: 0.45 });
  }, { loud: -18, len: 0.5, gap: 0.07, rev: 0.22 }),

  // ───────────── 风翎：弓弦与箭矢 ─────────────
  atk_fengling_draw: def('英雄普攻', '风翎·引弓', (p) => {
    const bp = p.filt('bandpass', 600, 2);
    p.osc({ w: 'triangle', f: 105, f1: 170, a: 0.06, d: 0.08, g: 0.5, to: bp });
    p.noise({ flt: 'bandpass', fc: 1800, q: 3, t: 0.02, a: 0.03, d: 0.05, g: 0.06 });
  }, { loud: -31, len: 0.3, gap: 0.12, rev: 0.05 }),
  atk_fengling_launch: def('英雄普攻', '风翎·放箭', (p) => {
    const lp = p.filt('lowpass', 3200, 1.5);
    p.ramp(lp.frequency, [[0, 3200], [0.2, 600]]);
    p.osc({ w: 'triangle', f: 228, f1: 196, ft: 0.05, a: 0.001, d: 0.24, g: 0.7, to: lp });
    p.osc({ w: 'softsaw', f: 456, f1: 392, ft: 0.05, a: 0.001, d: 0.12, g: 0.25, to: lp });
    p.noise({ flt: 'highpass', fc: 2500, a: 0.001, d: 0.008, g: 0.4 });
    p.noise({ flt: 'bandpass', fc: 2600, fc1: 900, fct: 0.18, q: 3, a: 0.012, d: 0.2, g: 0.6 });
  }, { loud: -20, len: 0.4, gap: 0.07, rev: 0.1 }),
  atk_fengling_hit: def('英雄普攻', '风翎·箭矢命中', (p) => {
    const dr = p.drive(2);
    p.osc({ f: 330, f1: 150, a: 0.001, d: 0.065, g: 0.7, to: dr });
    p.osc({ w: 'triangle', f: 640, f1: 300, a: 0.001, d: 0.04, g: 0.25, to: dr });
    p.noise({ flt: 'bandpass', fc: 2500, q: 2, a: 0.001, d: 0.04, g: 0.5, to: dr });
    p.osc({ f: 1100, a: 0.001, d: 0.09, g: 0.08 });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 700, a: 0.003, d: 0.08, g: 0.3, to: dr });
  }, { loud: -18, len: 0.3, gap: 0.07 }),

  // ───────────── 夜阙：匕首快划 ─────────────
  atk_yeque_swing: def('英雄普攻', '夜阙·双匕划击', (p) => {
    p.noise({ flt: 'bandpass', fc: 1200, fc1: 3600, fct: 0.05, q: 3, a: 0.015, d: 0.05, g: 0.8 });
    p.noise({ flt: 'bandpass', fc: 1500, fc1: 4200, fct: 0.05, q: 3, t: 0.07, a: 0.015, d: 0.05, g: 0.65 });
    p.fm({ f: 330, f1: 220, ratio: 0.5, idx: 1.5, a: 0.02, d: 0.14, g: 0.08 });
  }, { loud: -27, len: 0.3, gap: 0.1, rev: 0.06 }),
  atk_yeque_hit: def('英雄普攻', '夜阙·匕首命中', (p) => {
    const dr = p.drive(2);
    p.noise({ flt: 'highpass', fc: 4000, a: 0.001, d: 0.012, g: 0.35 });
    p.ring(3100, DAGGER, { a: 0.001, d: 0.15, g: 0.14 });
    p.osc({ w: 'triangle', f: 280, f1: 100, a: 0.001, d: 0.065, g: 0.4, to: dr });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 1, a: 0.008, d: 0.14, g: 0.2 });
    p.noise({ flt: 'bandpass', fc: 3200, q: 2, a: 0.001, d: 0.045, g: 0.4, to: dr });
  }, { loud: -17, len: 0.35, gap: 0.06 }),

  // ───────────── 小兵 ─────────────
  minion_swing: def('小兵与野怪', '小兵·挥击', (p) => {
    p.noise({ flt: 'bandpass', fc: 900, fc1: 2200, q: 2, a: 0.03, d: 0.06, g: 0.5 });
  }, { loud: -34, len: 0.2, gap: 0.16, poly: 2, prio: 0, rev: 0.04, jitter: 0.08 }),
  minion_melee_hit: def('小兵与野怪', '近战兵·命中', (p) => {
    p.ring(880, [1, 2.4, 3.9], { a: 0.001, d: 0.07, g: 0.14 });
    p.noise({ flt: 'bandpass', fc: 2200, q: 1.2, a: 0.001, d: 0.03, g: 0.4 });
    p.osc({ f: 180, f1: 105, a: 0.001, d: 0.055, g: 0.4 });
  }, { loud: -26, len: 0.2, gap: 0.11, poly: 3, prio: 0, jitter: 0.1, rev: 0.06 }),
  minion_ranged_launch: def('小兵与野怪', '远程兵·能量弹出手', (p) => {
    p.osc({ f: 1150, f1: 500, a: 0.002, d: 0.09, g: 0.4 });
    p.osc({ w: 'triangle', f: 2300, f1: 1000, a: 0.002, d: 0.06, g: 0.12 });
    p.noise({ flt: 'highpass', fc: 5000, a: 0.001, d: 0.02, g: 0.1 });
  }, { loud: -29, len: 0.2, gap: 0.12, poly: 2, prio: 0, jitter: 0.08, rev: 0.08 }),
  minion_ranged_hit: def('小兵与野怪', '远程兵·能量弹命中', (p) => {
    p.noise({ flt: 'bandpass', fc: 3000, q: 2, a: 0.001, d: 0.04, g: 0.5 });
    p.osc({ f: 520, f1: 300, a: 0.001, d: 0.05, g: 0.3 });
  }, { loud: -28, len: 0.2, gap: 0.11, poly: 2, prio: 0, jitter: 0.1, rev: 0.08 }),
  minion_siege_launch: def('小兵与野怪', '攻城兽·开炮', (p) => {
    p.osc({ f: 165, f1: 50, a: 0.002, d: 0.22, g: 0.7 });
    p.osc({ w: 'triangle', f: 330, f1: 110, a: 0.001, d: 0.1, g: 0.4 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 600, q: 0.7, a: 0.002, d: 0.13, g: 0.5 });
    p.noise({ flt: 'highpass', fc: 2000, a: 0.001, d: 0.03, g: 0.25 });
  }, { loud: -22, len: 0.4, gap: 0.15, poly: 2, rev: 0.12 }),
  minion_siege_hit: def('小兵与野怪', '攻城兽·炮弹爆炸', (p) => {
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2200, fc1: 300, a: 0.002, d: 0.32, g: 0.8 });
    p.osc({ f: 92, f1: 40, a: 0.002, d: 0.26, g: 0.6 });
    p.noise({ flt: 'bandpass', fc: 1800, q: 0.7, a: 0.001, d: 0.05, g: 0.6 });
  }, { loud: -20, len: 0.5, gap: 0.15, poly: 2, rev: 0.16 }),
  super_hit: def('小兵与野怪', '星陨巨卫·重击', (p) => {
    p.ring(520, METAL, { a: 0.001, d: 0.16, g: 0.14 });
    p.noise({ flt: 'bandpass', fc: 1600, q: 1, a: 0.001, d: 0.05, g: 0.5 });
    p.osc({ f: 140, f1: 60, a: 0.001, d: 0.14, g: 0.8 });
  }, { loud: -21, len: 0.35, gap: 0.12, poly: 2, jitter: 0.06 }),

  // ───────────── 野怪 ─────────────
  monster_swing: def('小兵与野怪', '野怪·扑击', (p) => {
    const lp = p.filt('lowpass', 520, 1.5);
    p.osc({ w: 'sawtooth', f: 96, f1: 70, a: 0.03, d: 0.18, g: 0.5, vib: 40, vr: 23, vd: 0, to: lp });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 500, fc1: 1500, q: 1.2, a: 0.05, d: 0.1, g: 0.5 });
  }, { loud: -27, len: 0.35, gap: 0.14, poly: 2, jitter: 0.08 }),
  monster_hit: def('小兵与野怪', '野怪·爪击命中', (p) => {
    p.noise({ flt: 'bandpass', fc: 1600, q: 1, a: 0.001, d: 0.06, g: 0.6 });
    p.noise({ flt: 'bandpass', fc: 2600, q: 2, t: 0.02, a: 0.001, d: 0.04, g: 0.4 });
    p.osc({ f: 145, f1: 60, a: 0.002, d: 0.12, g: 0.7 });
  }, { loud: -21, len: 0.3, gap: 0.1, poly: 2, jitter: 0.08 }),
  monster_spit_launch: def('小兵与野怪', '荧翼蜥·吐息', (p) => {
    p.noise({ flt: 'bandpass', fc: 900, fc1: 2400, q: 2.5, a: 0.02, d: 0.08, g: 0.7 });
    p.osc({ f: 520, f1: 250, a: 0.004, d: 0.1, g: 0.3 });
  }, { loud: -26, len: 0.25, gap: 0.12, poly: 2, jitter: 0.08 }),
  monster_spit_hit: def('小兵与野怪', '荧翼蜥·吐息命中', (p) => {
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2600, fc1: 400, a: 0.001, d: 0.12, g: 0.7 });
    p.osc({ f: 300, f1: 120, a: 0.001, d: 0.08, g: 0.4 });
  }, { loud: -24, len: 0.25, gap: 0.1, poly: 2, jitter: 0.08 }),
  epic_hit: def('小兵与野怪', '史诗野怪·重砸', (p) => {
    const dr = p.drive(2.5);
    p.osc({ f: 72, f1: 30, a: 0.003, d: 0.55, g: 0.9, to: dr });
    p.osc({ w: 'triangle', f: 220, f1: 70, a: 0.002, d: 0.2, g: 0.5, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 1400, fc1: 200, a: 0.003, d: 0.42, g: 0.7, to: dr });
    p.noise({ flt: 'bandpass', fc: 1300, q: 0.7, a: 0.001, d: 0.07, g: 0.8 });
    p.ring(230, METAL, { a: 0.002, d: 0.3, g: 0.14 });
  }, { loud: -15, len: 0.8, gap: 0.15, poly: 2, rev: 0.22 }),

  // ───────────── 防御塔 / 水晶 ─────────────
  tower_charge: def('防御塔', '防御塔·核心蓄光', (p) => {
    const lp = p.filt('lowpass', 900, 1);
    p.osc({ w: 'softsaw', f: 110, f1: 220, a: 0.24, d: 0.08, g: 0.5, to: lp });
    p.osc({ f: 660, f1: 990, a: 0.24, d: 0.06, g: 0.15 });
    p.noise({ flt: 'bandpass', fc: 1500, fc1: 4000, q: 3, a: 0.24, d: 0.05, g: 0.1 });
  }, { loud: -29, len: 0.4, gap: 0.2, poly: 2, rev: 0.1 }),
  tower_launch: def('防御塔', '防御塔·光弹出膛', (p) => {
    p.fm({ f: 520, f1: 180, ft: 0.25, ratio: 1.5, idx: 4, idx1: 0.5, a: 0.002, d: 0.3, g: 0.6 });
    p.noise({ flt: 'bandpass', fc: 1200, fc1: 400, q: 1.2, a: 0.002, d: 0.2, g: 0.4 });
    p.osc({ f: 82, a: 0.002, d: 0.16, g: 0.5 });
    p.ring(1760, CRYSTAL, { a: 0.002, d: 0.26, g: 0.06 });
  }, { loud: -20, len: 0.5, gap: 0.12, poly: 3, rev: 0.18 }),
  tower_hit: def('防御塔', '防御塔·光弹命中', (p) => {
    p.noise({ k: 'pink', flt: 'lowpass', fc: 3000, fc1: 300, a: 0.001, d: 0.2, g: 0.8 });
    p.osc({ f: 150, f1: 50, a: 0.002, d: 0.2, g: 0.5 });
    p.fm({ f: 660, f1: 220, ratio: 1.5, idx: 3, idx1: 0.3, a: 0.002, d: 0.14, g: 0.3 });
    p.ring(880, CRYSTAL, { a: 0.001, d: 0.2, g: 0.16 });
    p.noise({ flt: 'highpass', fc: 3500, a: 0.001, d: 0.012, g: 0.4 });
  }, { loud: -19, len: 0.45, gap: 0.1, poly: 3, group: 'towerhit', rev: 0.18 }),
  tower_hit_player: def('防御塔', '防御塔·命中玩家(加重)', (p) => {
    const dr = p.drive(3);
    p.osc({ f: 64, f1: 30, a: 0.003, d: 0.42, g: 0.8, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 3200, fc1: 250, a: 0.001, d: 0.26, g: 0.9, to: dr });
    p.osc({ w: 'triangle', f: 200, f1: 60, a: 0.002, d: 0.2, g: 0.5 });
    p.fm({ f: 660, f1: 180, ratio: 1.5, idx: 4, idx1: 0.3, a: 0.002, d: 0.2, g: 0.4 });
    p.ring(880, CRYSTAL, { a: 0.001, d: 0.3, g: 0.16 });
    // 警示感：两个相距小二度的方波短鸣
    const lp = p.filt('lowpass', 1800, 1);
    p.osc({ w: 'softsq', f: 740, a: 0.003, d: 0.14, g: 0.22, to: lp });
    p.osc({ w: 'softsq', f: 698, a: 0.003, d: 0.16, g: 0.22, to: lp });
  }, { loud: -14, len: 0.7, gap: 0.12, poly: 2, prio: 3, group: 'towerhit', rev: 0.2 }),

  // ───────────── 通用命中(fx hit_*)：轻量点缀层，叠在专属命中声上 ─────────────
  fx_hit_physical: def('通用命中', '物理命中火花', (p) => {
    p.noise({ flt: 'highpass', fc: 3500, a: 0.001, d: 0.03, g: 0.5 });
    p.ring(2600, [1, 1.5], { a: 0.001, d: 0.05, g: 0.07 });
    p.osc({ f: 220, f1: 120, a: 0.001, d: 0.04, g: 0.35 });
  }, { loud: -27, len: 0.2, gap: 0.09, poly: 3, prio: 0, jitter: 0.1, rev: 0.06 }),
  fx_hit_magic: def('通用命中', '法术命中星屑', (p) => {
    p.fm({ f: 1900, ratio: 2.7, idx: 1.5, idx1: 0.1, a: 0.001, d: 0.14, g: 0.3 });
    p.noise({ flt: 'bandpass', fc: 6000, q: 1.5, a: 0.001, d: 0.06, g: 0.3 });
    p.osc({ f: 400, f1: 250, a: 0.001, d: 0.05, g: 0.25 });
  }, { loud: -27, len: 0.25, gap: 0.09, poly: 3, prio: 0, jitter: 0.1, rev: 0.14 }),
  fx_hit_crit: def('通用命中', '暴击重击', (p) => {
    const dr = p.drive(3);
    p.osc({ w: 'triangle', f: 200, f1: 60, a: 0.002, d: 0.2, g: 0.6, to: dr });
    p.noise({ flt: 'bandpass', fc: 2000, q: 0.7, a: 0.001, d: 0.07, g: 0.8, to: dr });
    p.noise({ flt: 'bandpass', fc: 5200, q: 2, a: 0.002, d: 0.1, g: 0.3 });
    p.ring(1800, BLADE, { a: 0.001, d: 0.32, g: 0.22 });
    p.osc({ f: 1200, f1: 3200, a: 0.004, d: 0.09, g: 0.16 });
  }, { loud: -16, len: 0.5, gap: 0.09, poly: 2, prio: 2, rev: 0.2 }),
  fx_hit_tower: def('通用命中', '塔弹命中碎光', (p) => {
    p.noise({ flt: 'bandpass', fc: 2500, q: 1, a: 0.001, d: 0.05, g: 0.6 });
    p.ring(1320, CRYSTAL, { a: 0.001, d: 0.16, g: 0.1 });
    p.osc({ f: 170, f1: 70, a: 0.002, d: 0.12, g: 0.6 });
  }, { loud: -23, len: 0.35, gap: 0.1, poly: 2, group: 'towerhit', rev: 0.16 }),

  // ───────────── 技能弹道 ─────────────
  xingli_s1_fly: def('技能弹道', '流星矢·飞行', (p) => {
    p.noise({ flt: 'bandpass', fc: 1200, fc1: 3600, q: 2, a: 0.04, d: 0.42, g: 0.5 });
    p.fm({ f: 1320, f1: 1760, ratio: 2, idx: 1.2, a: 0.03, d: 0.42, g: 0.16, vib: 30, vr: 14, vd: 0 });
    p.noise({ flt: 'highpass', fc: 7500, a: 0.05, d: 0.4, g: 0.07 });
  }, { loud: -26, len: 0.6, gap: 0.1, poly: 2, rev: 0.2 }),
  xingli_s1_hit: def('技能弹道', '流星矢·贯穿命中', (p) => {
    p.fm({ f: 1319, ratio: 3.5, idx: 2.5, idx1: 0.05, idt: 0.2, a: 0.001, d: 0.42, g: 0.4 });
    p.fm({ f: 1976, ratio: 3.5, idx: 2, idx1: 0.05, idt: 0.2, t: 0.025, a: 0.001, d: 0.4, g: 0.25 });
    p.noise({ flt: 'bandpass', fc: 4200, q: 0.8, a: 0.001, d: 0.09, g: 0.6 });
    p.osc({ f: 210, f1: 80, a: 0.002, d: 0.14, g: 0.7 });
  }, { loud: -17, len: 0.6, gap: 0.07, rev: 0.24 }),
  fengling_s1_fly: def('技能弹道', '贯风矢·破空', (p) => {
    p.noise({ flt: 'bandpass', fc: 2600, fc1: 1700, q: 6, a: 0.02, d: 0.4, g: 0.8 });
    p.osc({ f: 1850, f1: 1300, a: 0.02, d: 0.36, g: 0.07 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 600, q: 0.8, a: 0.03, d: 0.3, g: 0.4 });
  }, { loud: -26, len: 0.55, gap: 0.1, poly: 2, rev: 0.12 }),
  fengling_s1_hit: def('技能弹道', '贯风矢·命中', (p) => {
    const dr = p.drive(2);
    p.osc({ f: 280, f1: 90, a: 0.001, d: 0.12, g: 0.8, to: dr });
    p.noise({ flt: 'bandpass', fc: 2400, q: 1.5, a: 0.001, d: 0.05, g: 0.6, to: dr });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 900, fc1: 2800, q: 1, a: 0.01, d: 0.2, g: 0.5 });
    p.osc({ f: 990, a: 0.001, d: 0.14, g: 0.07 });
  }, { loud: -17, len: 0.45, gap: 0.07, rev: 0.16 }),
  yeque_s2_fly: def('技能弹道', '影刃·飞旋', (p) => {
    const g = p.gain(1);
    p.lfo(g.gain, 30, 0.7, 0, 0.5);
    p.noise({ flt: 'bandpass', fc: 2300, q: 3, a: 0.01, d: 0.38, g: 0.6, to: g });
    p.fm({ f: 392, ratio: 0.5, idx: 2, a: 0.01, d: 0.3, g: 0.1, to: g });
  }, { loud: -27, len: 0.5, gap: 0.1, poly: 2, rev: 0.1 }),
  yeque_s2_hit: def('技能弹道', '影刃·命中', (p) => {
    const dr = p.drive(2);
    p.noise({ flt: 'bandpass', fc: 4200, q: 1.5, a: 0.001, d: 0.05, g: 0.6, to: dr });
    p.ring(2900, DAGGER, { a: 0.001, d: 0.2, g: 0.14 });
    p.osc({ w: 'triangle', f: 250, f1: 90, a: 0.001, d: 0.09, g: 0.4, to: dr });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 0.8, a: 0.006, d: 0.14, g: 0.25 });
  }, { loud: -18, len: 0.4, gap: 0.06, rev: 0.14 }),
  proj_fizzle: def('技能弹道', '弹道消散', (p) => {
    p.noise({ flt: 'highpass', fc: 3000, a: 0.01, d: 0.12, g: 0.4 });
    p.osc({ f: 900, f1: 500, a: 0.005, d: 0.1, g: 0.2 });
  }, { loud: -33, len: 0.25, gap: 0.1, poly: 2, prio: 0, rev: 0.14 }),
} satisfies Partial<Record<SfxKey, SfxDef>>;
