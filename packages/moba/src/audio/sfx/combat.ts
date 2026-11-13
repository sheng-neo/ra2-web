/**
 * 战斗基础音效：英雄普攻、小兵/野怪/塔、通用命中、技能弹道。
 * 每个配方都按「瞬态 + 主体 + 尾音」分层，主题音色随英雄：铜盾短剑 / 生铁大斧 / 琵琶 / 弓箭 / 匕首。
 * 野怪的挥击、命中用变体参数 v 区分体型与种类(见 engine.ts 的 MON_VAR)：0 苔背獾、1 霜晶巨鹿、2 炽焰巨熊、3 河道巨龙、4 星陨巨灵、5 荧翅蛾。
 */
import { mtof } from '../synth';
import { BLADE, CRYSTAL, DAGGER, METAL, def } from './defs';
import type { SfxDef, SfxKey } from './defs';
import { creak, growl, iron, pipa, thunk, twang, whistle, whoosh } from './timbre';

/** 王昭君普攻沿着弹的一句五声音阶乐句(E G A B D)：连续普攻听起来像在弹曲子 */
const STRUM = [76, 79, 81, 83, 86, 83, 81, 79].map(mtof);
const E6 = mtof(88), B6 = mtof(95);

export const COMBAT = {
  // ───────────── 樊哙：短剑斜劈 / 盾沿横击 ─────────────
  atk_panyue_swing: def('英雄普攻', '樊哙·挥剑带盾', (p) => {
    // 披甲的大个子出手：一道偏低的剑风 + 甲片一响
    whoosh(p, 0, 0.22, 0.4, 260, 1300, 500, 1.3, 'pink');
    p.noise({ k: 'brown', flt: 'lowpass', fc: 260, a: 0.08, d: 0.14, g: 0.5 });
    p.ring(1100, [1, 2.76], { t: 0.06, a: 0.001, d: 0.04, g: 0.05 });
  }, { loud: -27, len: 0.4, gap: 0.12, rev: 0.06 }),
  atk_panyue_hit: def('英雄普攻', '樊哙·剑盾命中', (p) => {
    // 主体过一道软失真：压低峰值、加厚质感，同样的峰值下听起来更重
    const dr = p.drive(2.5);
    p.osc({ f: 118, f1: 40, ft: 0.1, a: 0.002, d: 0.28, g: 0.55, to: dr });
    p.osc({ w: 'triangle', f: 260, f1: 120, ft: 0.06, a: 0.001, d: 0.12, g: 0.5, to: dr });
    p.noise({ flt: 'highpass', fc: 2800, a: 0.001, d: 0.012, g: 0.3 });
    p.noise({ flt: 'bandpass', fc: 1300, q: 0.8, a: 0.001, d: 0.08, g: 0.6, to: dr });
    // 厚木盾沿的一磕 + 青铜剑身的短鸣
    p.noise({ k: 'pink', flt: 'bandpass', fc: 520, q: 1.4, a: 0.001, d: 0.05, g: 0.7 });
    p.ring(620, [1, 1.52, 2.27], { a: 0.002, d: 0.24, g: 0.3 });
  }, { loud: -16, len: 0.55, gap: 0.08, rev: 0.14 }),

  // ───────────── 程咬金：大斧 ─────────────
  atk_chijin_swing: def('英雄普攻', '程咬金·抡斧', (p) => {
    // 「呼」：比刀剑更低更长的斧风
    whoosh(p, 0, 0.24, 0.5, 300, 1500, 480, 1.2);
    p.osc({ f: 92, f1: 70, a: 0.06, d: 0.14, g: 0.2 });
  }, { loud: -27, len: 0.35, gap: 0.1, rev: 0.06 }),
  atk_chijin_hit: def('英雄普攻', '程咬金·斧劈命中', (p) => {
    // 「哐」：生铁砍实的闷响
    const dr = p.drive(2);
    p.osc({ w: 'triangle', f: 170, f1: 60, a: 0.002, d: 0.14, g: 0.4, to: dr });
    p.noise({ flt: 'bandpass', fc: 1800, q: 0.9, a: 0.001, d: 0.05, g: 0.6, to: dr });
    iron(p, 430, 0, 0.9, 0.22);
    p.noise({ flt: 'highpass', fc: 4500, a: 0.001, d: 0.01, g: 0.3 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 1000, fc1: 450, q: 0.8, a: 0.01, d: 0.14, g: 0.25 });
  }, { loud: -17, len: 0.45, gap: 0.07 }),

  // ───────────── 王昭君：琵琶音波 ─────────────
  atk_xingli_charge: def('英雄普攻', '王昭君·按弦', (p) => {
    // 手指按上弦：很轻的擦弦声 + 一点泛音
    p.noise({ flt: 'bandpass', fc: 2600, fc1: 3800, q: 3, a: 0.04, d: 0.08, g: 0.3 });
    p.osc({ w: 'string', f: E6, a: 0.03, d: 0.1, g: 0.2 });
  }, { loud: -30, len: 0.3, gap: 0.12, jitter: 0 }),
  atk_xingli_launch: def('英雄普攻', '王昭君·扫弦出手', (p, v) => {
    // v = 乐句里的第几个音(引擎按每位王昭君各自的普攻次数递增)
    const f = STRUM[Math.max(0, Math.round(v)) % STRUM.length];
    pipa(p, f, 0, 0.28, 1);
    // 音波离弦
    p.noise({ flt: 'bandpass', fc: 2200, fc1: 4200, q: 2, a: 0.01, d: 0.1, g: 0.18 });
    p.osc({ f: 300, f1: 170, a: 0.002, d: 0.06, g: 0.2 });
  }, { loud: -21, len: 0.4, gap: 0.07, rev: 0.18, jitter: 0, variants: [{ label: '乐句第 1 音', v: 0 }, { label: '乐句第 5 音', v: 4 }] }),
  atk_xingli_hit: def('英雄普攻', '王昭君·音波命中', (p) => {
    // 音波环打在身上：一声泛音 + 小小的一震
    p.osc({ w: 'string', f: E6, a: 0.001, d: 0.3, g: 0.8 });
    p.osc({ f: B6, t: 0.01, a: 0.001, d: 0.22, g: 0.14 });
    p.noise({ flt: 'bandpass', fc: 4200, q: 1, a: 0.001, d: 0.05, g: 0.4 });
    p.osc({ f: 240, f1: 130, a: 0.002, d: 0.08, g: 0.3 });
  }, { loud: -18, len: 0.5, gap: 0.07, rev: 0.22, jitter: 0 }),

  // ───────────── 李广：弓弦与箭矢 ─────────────
  atk_fengling_draw: def('英雄普攻', '李广·引弓', (p) => {
    creak(p, 0, 0.14, 0.6);
  }, { loud: -31, len: 0.3, gap: 0.12, rev: 0.05 }),
  atk_fengling_launch: def('英雄普攻', '李广·放箭', (p) => {
    // 「嘣」+ 短促的「咻」
    twang(p, 196, 0, 0.2, 1);
    whistle(p, 0.008, 0.16, 0.5, 3600, 2000);
    p.noise({ flt: 'highpass', fc: 2500, a: 0.001, d: 0.008, g: 0.3 });
  }, { loud: -20, len: 0.4, gap: 0.07, rev: 0.1 }),
  atk_fengling_hit: def('英雄普攻', '李广·箭矢命中', (p) => {
    // 「笃」+ 箭杆的余颤
    const dr = p.drive(2);
    thunk(p, 0, 1.1, 1, dr);
    p.noise({ k: 'pink', flt: 'lowpass', fc: 700, a: 0.003, d: 0.07, g: 0.3, to: dr });
    p.osc({ w: 'triangle', f: 188, a: 0.004, d: 0.14, g: 0.16, vib: 90, vr: 38, vd: 0 });
  }, { loud: -18, len: 0.3, gap: 0.07 }),

  // ───────────── 荆轲：匕首快划 ─────────────
  atk_yeque_swing: def('英雄普攻', '荆轲·匕首划刺', (p) => {
    // 两下又细又快的「嗖」
    p.noise({ flt: 'bandpass', fc: 1500, fc1: 4200, fct: 0.05, q: 4, a: 0.015, d: 0.045, g: 0.8 });
    p.noise({ flt: 'bandpass', fc: 1800, fc1: 4800, fct: 0.05, q: 4, t: 0.07, a: 0.015, d: 0.045, g: 0.65 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 500, q: 1.5, a: 0.02, d: 0.1, g: 0.12 });
  }, { loud: -27, len: 0.3, gap: 0.1, rev: 0.06 }),
  atk_yeque_hit: def('英雄普攻', '荆轲·匕首命中', (p) => {
    // 干脆的一声「嚓」+ 匕首的冷鸣
    const dr = p.drive(2);
    p.noise({ flt: 'highpass', fc: 3600, a: 0.001, d: 0.02, g: 0.5 });
    p.ring(3100, DAGGER, { a: 0.001, d: 0.15, g: 0.14 });
    p.osc({ w: 'triangle', f: 280, f1: 100, a: 0.001, d: 0.065, g: 0.4, to: dr });
    p.noise({ flt: 'bandpass', fc: 3200, q: 2, a: 0.001, d: 0.04, g: 0.4, to: dr });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 1, a: 0.008, d: 0.12, g: 0.18 });
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
  minion_siege_launch: def('小兵与野怪', '攻城兵·开炮', (p) => {
    p.osc({ f: 165, f1: 50, a: 0.002, d: 0.22, g: 0.7 });
    p.osc({ w: 'triangle', f: 330, f1: 110, a: 0.001, d: 0.1, g: 0.4 });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 600, q: 0.7, a: 0.002, d: 0.13, g: 0.5 });
    p.noise({ flt: 'highpass', fc: 2000, a: 0.001, d: 0.03, g: 0.25 });
  }, { loud: -22, len: 0.4, gap: 0.15, poly: 2, rev: 0.12 }),
  minion_siege_hit: def('小兵与野怪', '攻城兵·炮弹爆炸', (p) => {
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2200, fc1: 300, a: 0.002, d: 0.32, g: 0.8 });
    p.osc({ f: 92, f1: 40, a: 0.002, d: 0.26, g: 0.6 });
    p.noise({ flt: 'bandpass', fc: 1800, q: 0.7, a: 0.001, d: 0.05, g: 0.6 });
  }, { loud: -20, len: 0.5, gap: 0.15, poly: 2, rev: 0.16 }),
  super_hit: def('小兵与野怪', '超级兵·重击', (p) => {
    p.ring(520, METAL, { a: 0.001, d: 0.16, g: 0.14 });
    p.noise({ flt: 'bandpass', fc: 1600, q: 1, a: 0.001, d: 0.05, g: 0.5 });
    p.osc({ f: 140, f1: 60, a: 0.001, d: 0.14, g: 0.8 });
  }, { loud: -21, len: 0.35, gap: 0.12, poly: 2, jitter: 0.06 }),

  // ───────────── 野怪 ─────────────
  monster_swing: def('小兵与野怪', '野怪·出手', (p, v) => {
    if (v < 0.5) {
      // 苔背獾：短促的嘶吼 + 前爪扒击
      p.sub(0.41, (q) => {
        growl(q, 0, 0.16, 0.6, 150, 105, 500, 1300);
        q.noise({ flt: 'bandpass', fc: 900, fc1: 2400, q: 2, t: 0.03, a: 0.03, d: 0.07, g: 0.5 });
      });
    } else if (v < 1.5) {
      // 霜晶巨鹿：甩角的风声 + 一声鼻息 + 冰晶轻响
      p.sub(1, (q) => {
        whoosh(q, 0, 0.2, 0.4, 500, 2200, 900, 1.2);
        q.noise({ k: 'pink', flt: 'bandpass', fc: 420, q: 1.5, a: 0.02, d: 0.09, g: 0.5 });
        q.ring(3300, CRYSTAL, { t: 0.05, a: 0.001, d: 0.12, g: 0.06 });
      });
    } else if (v < 2.5) {
      // 炽焰巨熊：沉重的挥掌 + 低吼
      p.sub(0.52, (q) => {
        growl(q, 0, 0.24, 0.7, 92, 66, 380, 1000);
        whoosh(q, 0.02, 0.2, 0.3, 200, 900, 400, 1, 'pink');
      });
    } else if (v < 3.5) {
      // 河道巨龙：缩颈吸气的嘶声 + 喉音
      p.sub(0.36, (q) => {
        q.noise({ flt: 'bandpass', fc: 1200, fc1: 3200, q: 2.5, a: 0.1, d: 0.1, g: 0.7 });
        growl(q, 0, 0.26, 0.6, 70, 52, 300, 800);
      });
    } else {
      // 星陨巨灵：巨拳破风 + 陨铁关节的低鸣
      p.sub(0.77, (q) => {
        whoosh(q, 0, 0.3, 0.5, 110, 520, 200, 0.9, 'brown');
        q.osc({ w: 'softsaw', f: 55, f1: 82, a: 0.12, d: 0.16, g: 0.3, to: q.filt('lowpass', 300, 1) });
        q.ring(310, METAL, { t: 0.02, a: 0.02, d: 0.2, g: 0.06 });
      });
    }
  }, { loud: -27, len: 0.4, gap: 0.14, poly: 2, jitter: 0.08, variants: [{ label: '苔背獾', v: 0 }, { label: '霜晶巨鹿', v: 1 }, { label: '炽焰巨熊', v: 2 }, { label: '河道巨龙', v: 3 }, { label: '星陨巨灵', v: 4 }] }),
  monster_hit: def('小兵与野怪', '野怪·命中', (p, v) => {
    if (v < 0.5) {
      // 苔背獾：两道爪痕
      p.sub(0.7, (q) => {
        q.noise({ flt: 'bandpass', fc: 1600, q: 1, a: 0.001, d: 0.06, g: 0.6 });
        q.noise({ flt: 'bandpass', fc: 2600, q: 2, t: 0.02, a: 0.001, d: 0.04, g: 0.4 });
        q.osc({ f: 145, f1: 60, a: 0.002, d: 0.12, g: 0.5 });
      });
    } else if (v < 1.5) {
      // 霜晶巨鹿：角挑的脆响 + 冰屑飞溅
      p.sub(1, (q) => {
        q.osc({ f: 150, f1: 60, a: 0.002, d: 0.14, g: 0.45 });
        q.noise({ flt: 'bandpass', fc: 2400, q: 1.2, a: 0.001, d: 0.04, g: 0.6 });
        q.scatter(4, 0.01, 0.14, (at) => q.ring(q.rr(2600, 5200), CRYSTAL, { t: at, a: 0.001, d: q.rr(0.05, 0.12), g: 0.07 }));
      });
    } else {
      // 炽焰巨熊：巨掌拍实 + 迸出的火星
      p.sub(0.44, (q) => {
        const dr = q.drive(2);
        q.osc({ f: 120, f1: 44, a: 0.002, d: 0.2, g: 0.55, to: dr });
        q.noise({ k: 'pink', flt: 'lowpass', fc: 1500, fc1: 300, a: 0.002, d: 0.14, g: 0.6, to: dr });
        q.noise({ flt: 'bandpass', fc: 1400, q: 0.8, a: 0.001, d: 0.06, g: 0.7 });
        q.scatter(4, 0.02, 0.16, (at) => q.noise({ flt: 'highpass', fc: q.rr(3000, 6000), t: at, a: 0.001, d: 0.012, g: 0.2 }));
      });
    }
  }, { loud: -21, len: 0.35, gap: 0.1, poly: 2, jitter: 0.08, variants: [{ label: '苔背獾', v: 0 }, { label: '霜晶巨鹿', v: 1 }, { label: '炽焰巨熊', v: 2 }] }),
  monster_spit_launch: def('小兵与野怪', '荧翅蛾·抖出磷粉', (p) => {
    // 猛扇一下前翅：一串很快的扑动 + 「噗」的一团粉
    const g = p.gain(0.6);
    p.lfo(g.gain, 28, 0.4, 0, 0.2);
    p.noise({ flt: 'bandpass', fc: 700, fc1: 1500, q: 1.5, a: 0.02, d: 0.12, g: 0.8, to: g });
    p.noise({ flt: 'bandpass', fc: 2600, fc1: 4200, q: 2, t: 0.03, a: 0.01, d: 0.06, g: 0.35 });
    p.osc({ f: 1700, f1: 2300, t: 0.03, a: 0.005, d: 0.07, g: 0.06 });
  }, { loud: -26, len: 0.25, gap: 0.12, poly: 2, jitter: 0.08 }),
  monster_spit_hit: def('小兵与野怪', '荧翅蛾·磷粉命中', (p) => {
    // 粉团散开：一口软的「噗」+ 两点微光
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2600, fc1: 500, a: 0.001, d: 0.11, g: 0.7 });
    p.osc({ f: 300, f1: 130, a: 0.001, d: 0.07, g: 0.35 });
    p.osc({ f: 2400, t: 0.01, a: 0.001, d: 0.05, g: 0.06 });
    p.osc({ f: 3200, t: 0.04, a: 0.001, d: 0.05, g: 0.05 });
  }, { loud: -24, len: 0.25, gap: 0.1, poly: 2, jitter: 0.08 }),
  epic_hit: def('小兵与野怪', '史诗野怪·重击', (p, v) => {
    if (v < 0.5) {
      // 河道巨龙噬咬 / 尾扫：上下颌合拢的脆响 + 沉闷的一撞 + 带起的水花
      p.sub(1, (q) => {
        const dr = q.drive(2.5, q.gain(0.55));
        q.osc({ f: 80, f1: 30, a: 0.003, d: 0.5, g: 0.8, to: dr });
        q.osc({ w: 'triangle', f: 230, f1: 70, a: 0.002, d: 0.18, g: 0.5, to: dr });
        q.noise({ flt: 'bandpass', fc: 2200, q: 1.2, a: 0.001, d: 0.03, g: 0.9 });
        q.noise({ k: 'pink', flt: 'bandpass', fc: 900, q: 0.8, a: 0.002, d: 0.14, g: 1 });
        q.noise({ k: 'pink', flt: 'lowpass', fc: 1500, fc1: 220, a: 0.003, d: 0.36, g: 0.6, to: dr });
        q.noise({ flt: 'bandpass', fc: 3000, fc1: 1500, q: 0.9, t: 0.03, a: 0.02, d: 0.3, g: 0.35 });
      });
    } else {
      // 星陨巨灵的陨铁巨拳：更沉的一砸 + 陨铁的鸣响 + 崩落的碎石
      p.sub(0.85, (q) => {
        const dr = q.drive(2.5, q.gain(0.55));
        q.osc({ f: 66, f1: 26, a: 0.003, d: 0.6, g: 0.8, to: dr });
        q.osc({ w: 'triangle', f: 200, f1: 60, a: 0.002, d: 0.22, g: 0.5, to: dr });
        q.noise({ k: 'pink', flt: 'lowpass', fc: 1300, fc1: 180, a: 0.003, d: 0.45, g: 0.7, to: dr });
        q.noise({ flt: 'bandpass', fc: 1200, q: 0.7, a: 0.001, d: 0.07, g: 0.8 });
        q.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 0.8, a: 0.002, d: 0.16, g: 1 });
        q.ring(330, METAL, { a: 0.002, d: 0.4, g: 0.25 });
        q.scatter(4, 0.06, 0.3, (at) => q.noise({ flt: 'bandpass', fc: q.rr(350, 1100), q: 2, t: at, a: 0.001, d: q.rr(0.04, 0.09), g: q.rr(0.2, 0.35) }));
      });
    }
  }, { loud: -15, len: 0.8, gap: 0.15, poly: 2, rev: 0.22, variants: [{ label: '河道巨龙', v: 0 }, { label: '星陨巨灵', v: 1 }] }),
  monster_spawn: def('小兵与野怪', '野怪·刷新', (p, v) => {
    if (v < 0.5) {
      // 苔背獾：从地洞里钻出来——刨土声 + 两声嗅地
      p.sub(0.89, (q) => {
        q.scatter(5, 0, 0.4, (at) => q.noise({ k: 'pink', flt: 'bandpass', fc: q.rr(500, 1300), q: 1.5, t: at, a: 0.004, d: q.rr(0.04, 0.08), g: q.rr(0.3, 0.6) }));
        [0.5, 0.66].forEach((t) => q.noise({ flt: 'bandpass', fc: 1700, q: 3, t, a: 0.02, d: 0.05, g: 0.3 }));
        growl(q, 0.78, 0.18, 0.4, 170, 120, 500, 1200);
      });
    } else if (v < 1.5) {
      // 霜晶巨鹿：冰雕解冻的碎裂声 → 昂首长鸣
      p.sub(1, (q) => {
        q.scatter(8, 0, 0.5, (at) => q.ring(q.rr(2400, 5600), CRYSTAL, { t: at, a: 0.001, d: q.rr(0.05, 0.14), g: 0.06 }));
        q.noise({ flt: 'highpass', fc: 5000, a: 0.3, d: 0.4, g: 0.05 });
        const bp = q.filt('bandpass', 900, 2.5);
        q.osc({ w: 'reed', f: 233, f1: 349, ft: 0.35, t: 0.5, a: 0.1, h: 0.3, d: 0.35, g: 0.5, vib: 25, vr: 6, vd: 0.2, to: bp });
        q.osc({ w: 'softsaw', f: 233, f1: 349, ft: 0.35, t: 0.5, a: 0.12, h: 0.28, d: 0.3, g: 0.2, to: bp });
      });
    } else if (v < 2.5) {
      // 炽焰巨熊：拱开碎石 → 仰头咆哮
      p.sub(0.55, (q) => {
        q.scatter(6, 0, 0.45, (at) => q.noise({ flt: 'bandpass', fc: q.rr(300, 1000), q: 2, t: at, a: 0.001, d: q.rr(0.05, 0.1), g: q.rr(0.3, 0.5) }));
        q.noise({ k: 'brown', flt: 'lowpass', fc: 260, a: 0.2, d: 0.4, g: 0.6 });
        growl(q, 0.5, 0.6, 0.9, 105, 70, 350, 1300);
      });
    } else {
      // 荧翅蛾：从灯花里飞出，扑翅声由远及近
      p.sub(0.64, (q) => {
        const g = q.gain(0.6);
        q.lfo(g.gain, 9, 0.4, 0, 0.9, 14);
        q.noise({ flt: 'bandpass', fc: 900, fc1: 1600, q: 1.5, a: 0.5, d: 0.3, g: 0.7, to: g });
        [0.3, 0.5, 0.66].forEach((t, i) => q.osc({ f: 2100 + i * 350, t, a: 0.004, d: 0.1, g: 0.05 }));
      });
    }
  }, { loud: -25, len: 1.2, gap: 0.3, poly: 2, prio: 0, jitter: 0.04, rev: 0.2, range: 22, variants: [{ label: '苔背獾', v: 0 }, { label: '霜晶巨鹿', v: 1 }, { label: '炽焰巨熊', v: 2 }, { label: '荧翅蛾', v: 5 }] }),

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
  xingli_s1_fly: def('技能弹道', '一弦穿云·飞行', (p) => {
    // 绷直的弦音在飞：持续颤动的两根弦 + 一层气声
    const lp = p.filt('lowpass', 4200, 1);
    p.osc({ w: 'string', f: mtof(76), a: 0.03, d: 0.42, g: 0.7, vib: 35, vr: 13, vd: 0, to: lp });
    p.osc({ w: 'string', f: mtof(83), a: 0.04, d: 0.36, g: 0.35, vib: 35, vr: 13, vd: 0, to: lp });
    p.noise({ flt: 'bandpass', fc: 1400, fc1: 3600, q: 2, a: 0.04, d: 0.42, g: 0.4 });
  }, { loud: -26, len: 0.6, gap: 0.1, poly: 2, rev: 0.2, jitter: 0 }),
  xingli_s1_hit: def('技能弹道', '一弦穿云·贯穿命中', (p) => {
    pipa(p, E6, 0, 0.36, 0.9);
    pipa(p, B6, 0.02, 0.3, 0.5);
    p.noise({ flt: 'bandpass', fc: 4000, q: 0.8, a: 0.001, d: 0.08, g: 0.5 });
    p.osc({ f: 210, f1: 80, a: 0.002, d: 0.14, g: 0.45 });
  }, { loud: -17, len: 0.6, gap: 0.07, rev: 0.24, jitter: 0 }),
  fengling_s1_fly: def('技能弹道', '白羽没石·破空', (p) => {
    // 「咻」：又干又直的箭啸
    whistle(p, 0, 0.42, 0.9, 3000, 1900);
    p.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 0.8, a: 0.03, d: 0.3, g: 0.3 });
  }, { loud: -26, len: 0.55, gap: 0.1, poly: 2, rev: 0.12 }),
  fengling_s1_hit: def('技能弹道', '白羽没石·命中', (p, v) => {
    // 重箭钉入的「笃」+ 箭杆的余颤
    const dr = p.drive(2, p.gain(0.7));
    thunk(p, 0, 1.1, 0.85, dr);
    p.osc({ f: 230, f1: 110, a: 0.001, d: 0.1, g: 0.3, to: dr });
    // 箭头没进去的那一下拖得稍长：「笃——」
    p.osc({ w: 'triangle', f: 430, f1: 300, a: 0.001, d: 0.12, g: 0.5 });
    p.osc({ w: 'triangle', f: 172, a: 0.004, d: 0.18, g: 0.2, vib: 90, vr: 38, vd: 0 });
    if (v > 0.5) {
      // 命中英雄：「没石」——石面迸裂的「喀」+ 几粒石屑
      p.noise({ flt: 'highpass', fc: 1800, t: 0.004, a: 0.001, d: 0.02, g: 0.6 });
      p.noise({ flt: 'bandpass', fc: 950, q: 1.2, t: 0.008, a: 0.001, d: 0.05, g: 0.55 });
      p.scatter(5, 0.03, 0.22, (at) => p.noise({ flt: 'bandpass', fc: p.rr(1400, 3600), q: 3, t: at, a: 0.001, d: p.rr(0.012, 0.03), g: p.rr(0.2, 0.4) }));
    }
  }, { loud: -17, len: 0.45, gap: 0.07, rev: 0.16, variants: [{ label: '钉入', v: 0 }, { label: '命中英雄(石裂)', v: 1 }] }),
  yeque_s2_fly: def('技能弹道', '引匕一掷·飞行', (p) => {
    // 刃尖朝前直飞：一线细细的「嗖」+ 极淡的金属微光
    whistle(p, 0, 0.36, 0.7, 3600, 3000);
    p.osc({ f: 5200, a: 0.02, d: 0.3, g: 0.02 });
  }, { loud: -27, len: 0.5, gap: 0.1, poly: 2, rev: 0.1 }),
  yeque_s2_hit: def('技能弹道', '引匕一掷·命中', (p) => {
    // 「叮」+ 扎实的一下 + 墨溅
    p.ring(3300, DAGGER, { a: 0.001, d: 0.22, g: 0.22 });
    p.noise({ flt: 'highpass', fc: 4500, a: 0.001, d: 0.01, g: 0.5 });
    const dr = p.drive(2);
    p.osc({ w: 'triangle', f: 250, f1: 95, a: 0.001, d: 0.08, g: 0.4, to: dr });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 0.8, a: 0.005, d: 0.1, g: 0.2 });
  }, { loud: -18, len: 0.4, gap: 0.06, rev: 0.14 }),
  proj_fizzle: def('技能弹道', '弹道落空', (p, v) => {
    if (v > 0.5) {
      // 匕首落空：钉进地面的一声闷响 + 刃身的余颤
      p.sub(0.85, (q) => {
        thunk(q, 0, 0.8, 1.2);
        q.ring(2900, DAGGER, { t: 0.004, a: 0.001, d: 0.12, g: 0.07 });
      });
    } else {
      p.sub(1, (q) => {
        q.noise({ flt: 'highpass', fc: 3000, a: 0.01, d: 0.12, g: 0.4 });
        q.osc({ f: 900, f1: 500, a: 0.005, d: 0.1, g: 0.2 });
      });
    }
  }, { loud: -33, len: 0.25, gap: 0.1, poly: 2, prio: 0, rev: 0.14, variants: [{ label: '消散', v: 0 }, { label: '匕首钉地', v: 1 }] }),
} satisfies Partial<Record<SfxKey, SfxDef>>;
