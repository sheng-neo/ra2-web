/**
 * 英雄技能音效：skillCast 的施放提示(每位英雄一种音色 + 每个技能一个小动机)、
 * 每个英雄专属 FxKey、以及跟随区域时长的铺底声。
 * 主题：樊哙 = 铜铁厚木与战鼓，程咬金 = 生铁重击与挥空呼啸(三板斧：一声 / 两声 / 三声)，
 * 王昭君 = 琵琶拨弦与轮指(五声音阶 E G A B D)，李广 = 弓弦、箭啸与钉入声，荆轲 = 击筑、易水寒风与匕首。
 */
import { HEROES } from '../../core/data/heroes';
import { bell } from '../instruments';
import { mtof } from '../synth';
import type { Patch } from '../synth';
import { DAGGER, def } from './defs';
import type { SfxDef, SfxKey } from './defs';
import { IRON, creak, drum, honk, iron, pick, pipa, shield, shout, thunk, twang, whistle, whoosh, zhu } from './timbre';

const A3 = mtof(57), D4 = mtof(62), E4 = mtof(64), A4 = mtof(69), B4 = mtof(71);
const D5 = mtof(74), E5 = mtof(76), G5 = mtof(79), A5 = mtof(81), B5 = mtof(83), D6 = mtof(86), E6 = mtof(88), G6 = mtof(91), B6 = mtof(95);

/** 程咬金三板斧的三个音：一技能敲第一个，二技能敲前两个，大招三个敲全 */
const AXE = [D4, A4, D5] as const;
function axes(p: Patch, n: number): void {
  for (let i = 0; i < n; i++) iron(p, AXE[i], i * 0.105, 0.8 + i * 0.1, i === n - 1 ? 0.32 : 0.2);
}

/** 王昭君落雁的起音：五声音阶的高音区 */
const GOOSE = [B5, D6, E6, G6] as const;

/** 「抡圆了砍」每跳的间隔：铺底的呼啸要和每一跳对上 */
const spinTick = HEROES.chijin.skills.ult.values.tick;
const SPIN_TICK = typeof spinTick === 'number' && spinTick > 0.05 ? spinTick : 0.3;

const CAST = { loud: -21, len: 0.5, gap: 0.1, poly: 2, prio: 2, jitter: 0.01, rev: 0.16 } as const;
const FX = { loud: -16, len: 0.7, gap: 0.08, poly: 3, prio: 2, rev: 0.18 } as const;
const BED = { loud: -24, gap: 0.2, poly: 2, prio: 1, jitter: 0.02, rev: 0.16 } as const;
/** 有固定音高的拨弦/击弦：不做随机移调，免得跑调 */
const TUNED = { jitter: 0 } as const;

export const HEROES_SFX = {
  // ═════════════ 施放提示 ═════════════
  cast_panyue_s1: def('技能施放', '樊哙·侧盾闯帐', (p) => {
    // 一通鼓，盾沿两下由低到高
    drum(p, 0, 0.6, 1.15);
    shield(p, D4, 0.005, 0.26, 0.9);
    shield(p, A4, 0.1, 0.36, 1);
  }, CAST),
  cast_panyue_s2: def('技能施放', '樊哙·拥盾怒目', (p) => {
    // 两通鼓由高到低：站定
    drum(p, 0, 0.55, 1.1);
    shield(p, D4, 0.005, 0.24, 0.8);
    drum(p, 0.12, 0.6, 0.82, 0.5);
    shield(p, A3, 0.125, 0.5, 1);
  }, CAST),
  cast_panyue_ult: def('技能施放', '樊哙·跃盾砸阵', (p) => {
    // 三通鼓越擂越高，最后一下带起盾鸣
    drum(p, 0, 0.5, 0.9, 0.3);
    drum(p, 0.09, 0.55, 1.1, 0.3);
    drum(p, 0.18, 0.65, 1.35, 0.5);
    shield(p, A3, 0.005, 0.2, 0.5);
    shield(p, D4, 0.185, 0.6, 1.1);
    p.noise({ k: 'brown', flt: 'lowpass', fc: 260, a: 0.3, d: 0.3, g: 0.5 });
  }, { ...CAST, len: 0.9, loud: -18 }),

  cast_chijin_s1: def('技能施放', '程咬金·拦腰一斧(一声)', (p) => {
    axes(p, 1);
    whoosh(p, 0, 0.14, 0.25, 600, 2200, 900);
  }, CAST),
  cast_chijin_s2: def('技能施放', '程咬金·半路杀出(两声)', (p) => {
    axes(p, 2);
  }, CAST),
  cast_chijin_ult: def('技能施放', '程咬金·抡圆了砍(三声)', (p) => {
    axes(p, 3);
    whoosh(p, 0.05, 0.5, 0.4, 400, 1700, 900, 0.9, 'pink');
  }, { ...CAST, len: 0.9, loud: -18 }),

  cast_xingli_s1: def('技能施放', '王昭君·一弦穿云', (p) => {
    pipa(p, E6, 0, 0.16, 0.8);
    pipa(p, B6, 0.045, 0.28, 1);
  }, { ...CAST, ...TUNED, rev: 0.26 }),
  cast_xingli_s2: def('技能施放', '王昭君·回环收弦', (p) => {
    // 外推一音：拨响后把弦推高一个全音
    pipa(p, A5, 0, 0.6, 1, B5);
    pipa(p, E5, 0.16, 0.4, 0.5);
  }, { ...CAST, ...TUNED, len: 0.7, rev: 0.26 }),
  cast_xingli_ult: def('技能施放', '王昭君·雁落平沙', (p) => {
    [E5, B5, E6, G6].forEach((f, i) => pipa(p, f, i * 0.07, i === 3 ? 0.7 : 0.3, 0.7 + i * 0.1));
    p.noise({ flt: 'highpass', fc: 6000, a: 0.25, d: 0.5, g: 0.05 });
  }, { ...CAST, ...TUNED, len: 1.1, loud: -18, rev: 0.3 }),

  cast_fengling_s1: def('技能施放', '李广·白羽没石', (p) => {
    // 拉满弓的吱呀
    creak(p, 0, 0.26, 1);
    p.osc({ w: 'triangle', f: 98, f1: 147, a: 0.2, d: 0.08, g: 0.1 });
  }, CAST),
  cast_fengling_s2: def('技能施放', '李广·飞将腾身', (p) => {
    twang(p, D4, 0, 0.1, 0.6);
    twang(p, mtof(67), 0.05, 0.18, 0.8);
  }, CAST),
  cast_fengling_ult: def('技能施放', '李广·箭锁阴山', (p) => {
    // 两拍战鼓 + 开弓
    drum(p, 0, 0.6, 1.3, 0.3);
    drum(p, 0.14, 0.7, 1.3, 0.36);
    creak(p, 0.05, 0.36, 1.3);
  }, { ...CAST, len: 0.9, loud: -18 }),

  cast_yeque_s1: def('技能施放', '荆轲·风萧易水', (p) => {
    zhu(p, D5, 0, 0.32, 1);
    // 暗哑的低音：杀气的底色
    p.osc({ f: 73.4, f1: 55, a: 0.01, d: 0.26, g: 0.25 });
    p.noise({ flt: 'bandpass', fc: 900, fc1: 2200, q: 4, a: 0.05, d: 0.2, g: 0.2 });
  }, { ...CAST, ...TUNED }),
  cast_yeque_s2: def('技能施放', '荆轲·引匕一掷', (p) => {
    zhu(p, A4, 0, 0.22, 0.8);
    // 匕首出鞘
    p.noise({ flt: 'bandpass', fc: 2200, fc1: 6800, q: 4, t: 0.01, a: 0.03, d: 0.07, g: 0.5 });
    p.ring(3300, DAGGER, { t: 0.05, a: 0.001, d: 0.2, g: 0.14 });
  }, { ...CAST, ...TUNED }),
  cast_yeque_ult: def('技能施放', '荆轲·卷尽匕现', (p) => {
    // 两个下行的筑音，落在三全音上：不祥的预告
    zhu(p, D5, 0, 0.22, 0.8);
    zhu(p, mtof(68), 0.13, 0.5, 1);
    p.osc({ f: 62, f1: 40, t: 0.02, a: 0.004, d: 0.24, g: 0.4 });
    p.noise({ flt: 'bandpass', fc: 1200, fc1: 500, q: 4, a: 0.05, d: 0.35, g: 0.2 });
  }, { ...CAST, ...TUNED, len: 0.8, loud: -18 }),

  cast_recall: def('技能施放', '回城·启动', (p) => {
    bell(p, A5, 0, 0.4, 0.8);
    bell(p, D6, 0.09, 0.6, 0.9);
  }, { ...CAST, loud: -25, rev: 0.25 }),
  cast_heal: def('技能施放', '疗伤·启动', (p) => {
    p.osc({ w: 'glass', f: mtof(72), a: 0.02, d: 0.3, g: 0.5 });
    p.osc({ w: 'glass', f: G5, t: 0.09, a: 0.02, d: 0.45, g: 0.5 });
    p.osc({ f: mtof(84), t: 0.09, a: 0.02, d: 0.3, g: 0.12 });
  }, { ...CAST, loud: -24, rev: 0.25 }),
  cast_flash: def('技能施放', '闪现·启动', (p) => {
    p.osc({ f: 2400, f1: 4800, a: 0.001, d: 0.04, g: 0.4 });
    p.noise({ flt: 'highpass', fc: 6000, a: 0.001, d: 0.025, g: 0.3 });
  }, { ...CAST, loud: -26, len: 0.2 }),

  // ═════════════ 樊哙 ═════════════
  fx_panyue_passive_hit: def('技能特效', '樊哙·覆盾震地', (p) => {
    // 「咚」+ 盾面嗡鸣
    const dr = p.drive(2);
    p.osc({ f: 100, f1: 36, ft: 0.14, a: 0.003, d: 0.46, g: 0.5, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 900, fc1: 220, a: 0.003, d: 0.34, g: 0.5, to: dr });
    shield(p, 247, 0, 0.75, 1);
    p.noise({ flt: 'bandpass', fc: 1500, q: 0.8, a: 0.001, d: 0.045, g: 0.7 });
    // 溅起的碎土
    p.scatter(3, 0.05, 0.2, (at) => p.noise({ k: 'pink', flt: 'bandpass', fc: p.rr(300, 800), q: 2, t: at, a: 0.001, d: 0.05, g: 0.25 }));
  }, { ...FX, loud: -15 }),
  fx_panyue_s1_dash: def('技能特效', '樊哙·闯帐起步', (p) => {
    // 披甲起步：三记越来越急的踏步 + 盾前压出的风 + 甲片晃动
    [0, 0.1, 0.19].forEach((t, i) => {
      p.osc({ f: 120 - i * 8, f1: 50, t, a: 0.002, d: 0.1, g: 0.75 - i * 0.12 });
      p.noise({ k: 'pink', flt: 'lowpass', fc: 700, t, a: 0.001, d: 0.04, g: 0.4 });
    });
    whoosh(p, 0, 0.34, 0.6, 200, 950, 420, 0.9, 'brown');
    p.scatter(4, 0.02, 0.26, (at) => p.ring(p.rr(900, 1500), IRON, { t: at, a: 0.001, d: 0.035, g: 0.05 }));
  }, { ...FX, loud: -19, len: 0.5 }),
  fx_panyue_s1_impact: def('技能特效', '樊哙·侧盾撞击', (p) => {
    const dr = p.drive(2.5);
    p.osc({ f: 108, f1: 34, ft: 0.15, a: 0.003, d: 0.5, g: 0.6, to: dr });
    p.osc({ w: 'triangle', f: 250, f1: 85, ft: 0.1, a: 0.002, d: 0.2, g: 0.4, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2400, fc1: 220, a: 0.002, d: 0.3, g: 0.8, to: dr });
    p.noise({ flt: 'highpass', fc: 2600, a: 0.001, d: 0.014, g: 0.5 });
    shield(p, 294, 0, 0.7, 1.1);
    // 被撞翻的卫士与交戟：几下错落的闷响
    p.scatter(4, 0.08, 0.3, (at) => p.osc({ f: p.rr(90, 150), f1: 50, t: at, a: 0.002, d: 0.08, g: p.rr(0.2, 0.35) }));
    p.ring(1150, IRON, { t: 0.04, a: 0.001, d: 0.12, g: 0.06 });
  }, { ...FX, loud: -13, len: 0.9, rev: 0.24 }),
  fx_panyue_s2_cast: def('技能特效', '樊哙·拥盾一喝', (p) => {
    // 盾下缘顿地
    p.osc({ f: 128, f1: 55, a: 0.002, d: 0.2, g: 0.6 });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 800, a: 0.001, d: 0.06, g: 0.5 });
    shield(p, 262, 0, 0.9, 0.9);
    // 一声喝(震慑环)
    shout(p, 0.04, 0.3, 0.9);
    // 盾影合拢成护盾：一道上行的铜色泛音
    p.osc({ f: 440, f1: 660, t: 0.1, a: 0.12, d: 0.5, g: 0.1 });
  }, { ...FX, loud: -16, len: 1.0 }),
  fx_panyue_ult_leap: def('技能特效', '樊哙·腾跃', (p) => {
    p.osc({ f: 115, f1: 55, a: 0.002, d: 0.12, g: 0.7 });
    whoosh(p, 0, 0.45, 0.5, 240, 1700, 900, 1, 'pink');
    shout(p, 0, 0.22, 0.45, 150);
    p.scatter(3, 0.02, 0.2, (at) => p.ring(p.rr(800, 1300), IRON, { t: at, a: 0.001, d: 0.05, g: 0.05 }));
  }, { ...FX, loud: -19, len: 0.6 }),
  fx_panyue_ult_land: def('技能特效', '樊哙·砸地(大鼓 + 盾震)', (p) => {
    // 失真器的输出接近满幅：后面压一道增益，给盾震和尘浪的中频留出峰值余量
    const dr = p.drive(3, p.gain(0.8));
    // 大鼓：两层低频冲击错开
    p.osc({ f: 76, f1: 25, ft: 0.5, a: 0.004, d: 1.5, g: 0.75, to: dr });
    p.osc({ f: 150, f1: 48, ft: 0.2, a: 0.003, d: 0.5, g: 0.35, to: dr });
    p.osc({ f: 56, f1: 30, ft: 0.4, t: 0.07, a: 0.006, d: 1.1, g: 0.3, to: dr });
    // 厚尘浪
    p.noise({ k: 'pink', flt: 'lowpass', fc: 1800, fc1: 160, a: 0.004, d: 1.2, g: 0.9, to: dr });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 700, q: 0.7, a: 0.01, d: 0.5, g: 0.6 });
    p.noise({ flt: 'bandpass', fc: 1200, q: 0.5, a: 0.001, d: 0.09, g: 1 });
    p.noise({ flt: 'highpass', fc: 3000, a: 0.001, d: 0.02, g: 0.5 });
    // 盾震：大盾印的长鸣
    shield(p, 262, 0, 1.6, 0.8);
    shield(p, 392, 0.02, 1.1, 0.45);
    // 三道由内向外的冲击弧
    [0.1, 0.24, 0.4].forEach((t, i) => p.noise({ k: 'pink', flt: 'bandpass', fc: 900 - i * 190, q: 0.9, t, a: 0.03, d: 0.3, g: 0.6 - i * 0.1 }));
    // 落回地面的碎土块
    p.scatter(9, 0.15, 1.1, (at) => p.osc({ f: p.rr(80, 160), f1: 50, t: at, a: 0.002, d: p.rr(0.05, 0.1), g: p.rr(0.12, 0.3) * (1.4 - at) }));
  }, { ...FX, loud: -11, len: 2.3, gap: 0.2, poly: 2, prio: 3, rev: 0.3 }),

  // ═════════════ 程咬金 ═════════════
  fx_chijin_passive_hit: def('技能特效', '程咬金·重斧(带回血音)', (p) => {
    // 「哐」
    const dr = p.drive(2.5);
    p.osc({ f: 150, f1: 48, ft: 0.1, a: 0.002, d: 0.28, g: 0.5, to: dr });
    p.noise({ flt: 'bandpass', fc: 1700, q: 0.8, a: 0.001, d: 0.06, g: 0.7, to: dr });
    iron(p, 392, 0, 1, 0.34);
    p.scatter(4, 0.02, 0.18, (at) => p.noise({ flt: 'highpass', fc: p.rr(3500, 6500), t: at, a: 0.001, d: 0.01, g: 0.18 }));
    // 回血：三个很短的上行音
    [G5, mtof(84), E6].forEach((f, i) => p.osc({ w: 'glass', f, t: 0.09 + i * 0.05, a: 0.004, d: 0.14, g: 0.16 }));
  }, { ...FX, loud: -16 }),
  fx_chijin_s1_slash: def('技能特效', '程咬金·拦腰斧弧', (p) => {
    // 斧风扫过半圈 + 扬起的尘土 + 斧刃的铁鸣
    whoosh(p, 0, 0.3, 0.5, 350, 2600, 600, 1.1);
    p.noise({ k: 'pink', flt: 'bandpass', fc: 1200, fc1: 450, q: 0.6, t: 0.05, a: 0.05, d: 0.36, g: 0.6 });
    p.osc({ f: 105, f1: 55, a: 0.004, d: 0.22, g: 0.4 });
    iron(p, 520, 0.09, 0.5, 0.22);
    p.scatter(5, 0.1, 0.3, (at) => p.noise({ flt: 'highpass', fc: p.rr(3000, 6500), t: at, a: 0.001, d: 0.012, g: p.rr(0.1, 0.22) }));
  }, { ...FX, loud: -15, len: 0.8 }),
  fx_chijin_s2_dash: def('技能特效', '程咬金·半路杀出', (p) => {
    whoosh(p, 0, 0.3, 0.55, 450, 3000, 800, 1.1);
    [0, 0.09, 0.18].forEach((t) => p.osc({ f: 130, f1: 55, t, a: 0.002, d: 0.08, g: 0.5 }));
    p.noise({ k: 'pink', flt: 'lowpass', fc: 1800, a: 0.02, d: 0.28, g: 0.4 });
    // 拖在身后的斧刃刮过地面
    p.noise({ flt: 'bandpass', fc: 2600, fc1: 3400, q: 6, t: 0.04, a: 0.04, d: 0.2, g: 0.3 });
  }, { ...FX, loud: -18, len: 0.6 }),
  fx_chijin_ult_start: def('技能特效', '程咬金·抡斧起手', (p) => {
    // 抡起来：越来越急的呼啸 + 斧头的铁嗡
    whoosh(p, 0, 0.55, 0.55, 300, 1600, 1000, 0.9, 'pink');
    iron(p, 294, 0, 0.5, 0.4);
    iron(p, 440, 0.07, 0.4, 0.35);
    p.osc({ f: 62, f1: 115, a: 0.2, d: 0.3, g: 0.4 });
    p.noise({ k: 'brown', flt: 'bandpass', fc: 300, q: 0.8, a: 0.2, d: 0.3, g: 0.4 });
  }, { ...FX, loud: -15, len: 0.9 }),
  fx_chijin_ult_tick: def('技能特效', '程咬金·斧环一圈', (p) => {
    // 「呼」
    whoosh(p, 0, 0.27, 0.7, 500, 2300, 650, 1.2, 'pink');
    p.osc({ f: 88, f1: 66, a: 0.03, d: 0.19, g: 0.5 });
    p.osc({ f: 1620, a: 0.02, d: 0.1, g: 0.04 });
    p.scatter(2, 0.04, 0.16, (at) => p.noise({ flt: 'highpass', fc: p.rr(3000, 6000), t: at, a: 0.001, d: 0.012, g: 0.2 }));
  }, { ...FX, loud: -17, len: 0.45, gap: 0.12, poly: 3, jitter: 0.06 }),

  // ═════════════ 王昭君 ═════════════
  fx_xingli_passive_burst: def('技能特效', '王昭君·余音三叠', (p) => {
    // 三个音叠成和音
    [E5, B5, E6].forEach((f, i) => pipa(p, f, i * 0.045, 0.5, 0.8));
    // 叠起来之后的共振：和音的分音慢起，各带一只略高的伙伴起拍
    [E5, B5, E6, G6].forEach((f) => {
      p.osc({ f, t: 0.1, a: 0.12, d: 0.6, g: 0.12 });
      p.osc({ f: f * 1.006, t: 0.1, a: 0.14, d: 0.55, g: 0.08 });
    });
    // 震晕的一下
    p.osc({ w: 'triangle', f: 260, f1: 90, t: 0.1, a: 0.003, d: 0.26, g: 0.5 });
    p.noise({ flt: 'bandpass', fc: 4200, q: 0.7, t: 0.1, a: 0.001, d: 0.1, g: 0.4 });
  }, { ...FX, ...TUNED, loud: -15, len: 0.9, rev: 0.28 }),
  fx_xingli_s1_cast: def('技能特效', '王昭君·一弦穿云出手', (p) => {
    // 利落的一声「铮」：两根弦同拨
    pipa(p, B5, 0, 0.3, 1.1);
    pipa(p, E6, 0.004, 0.26, 0.7);
    // 一丝裂帛：向上撕开的噪声，带很快的抖动
    const rip = p.gain(1);
    p.lfo(rip.gain, 70, 0.5, 0, 0.3);
    p.noise({ flt: 'bandpass', fc: 1800, fc1: 6500, fct: 0.16, q: 1.4, a: 0.012, d: 0.2, g: 0.6, to: rip });
    // 音波推出去的一下
    p.osc({ f: 150, f1: 70, a: 0.003, d: 0.12, g: 0.35 });
  }, { ...FX, ...TUNED, loud: -16, len: 0.6, rev: 0.24 }),
  fx_xingli_s2_burst: def('技能特效', '王昭君·回环收拨', (p) => {
    // 向内收拢的气声
    p.noise({ flt: 'bandpass', fc: 3200, fc1: 400, fct: 0.12, q: 1.5, a: 0.1, d: 0.04, g: 0.8 });
    // 收拨：四弦由高到低一扫而过(空弦 A D E A)
    [A5, E5, D5, A4].forEach((f, i) => pipa(p, f, 0.12 + i * 0.02, 0.62 - i * 0.05, 0.9));
    // 拉拽的一沉
    p.osc({ f: 124, f1: 40, t: 0.12, a: 0.003, d: 0.5, g: 0.55 });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2200, fc1: 260, t: 0.12, a: 0.002, d: 0.28, g: 0.5 });
  }, { ...FX, ...TUNED, loud: -14, len: 1.1, rev: 0.28 }),
  fx_xingli_ult_cast: def('技能特效', '王昭君·起曲引雁', (p) => {
    // 一小段渐强渐弱的轮指 + 低处两根空弦
    const lp = p.filt('lowpass', 5200, 0.8);
    const n = 13;
    for (let i = 0; i < n; i++) pick(p, i % 4 === 3 ? D6 : B5, 0.03 + i * 0.062, 0.2, 0.25 + 0.6 * Math.sin((Math.PI * i) / n), i % 2 === 0, lp);
    pipa(p, E4, 0, 0.9, 0.7);
    pipa(p, B4, 0.05, 0.8, 0.5);
    p.osc({ f: 82.4, a: 0.3, d: 0.42, g: 0.15 });
    // 远远的一声雁鸣
    honk(p, 0.5, 0.22);
  }, { ...FX, ...TUNED, loud: -16, len: 1.2, rev: 0.3 }),
  fx_xingli_meteor: def('技能特效', '王昭君·落雁', (p) => {
    // 雁影俯冲：一声下行五度的滑音拨弦 + 翼尖带起的风
    const top = GOOSE[Math.floor(p.rnd() * GOOSE.length) % GOOSE.length];
    pipa(p, top, 0, 0.42, 1, top * 0.667);
    p.noise({ flt: 'bandpass', fc: 3600, fc1: 1200, fct: 0.11, q: 2, a: 0.07, d: 0.04, g: 0.3 });
    // 落地：音波环的一震 + 轻的落沙
    p.osc({ f: 150, f1: 48, ft: 0.14, t: 0.11, a: 0.003, d: 0.4, g: 0.5 });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 2600, fc1: 300, t: 0.11, a: 0.002, d: 0.26, g: 0.45 });
    p.noise({ flt: 'highpass', fc: 4500, t: 0.13, a: 0.03, d: 0.35, g: 0.12 });
  }, { ...FX, ...TUNED, loud: -15, len: 0.8, gap: 0.09, poly: 4, rev: 0.26 }),

  // ═════════════ 李广 ═════════════
  fx_fengling_s1_cast: def('技能特效', '李广·白羽没石出手', (p) => {
    // 沉的一声「嘣」+ 「咻」
    twang(p, 123, 0, 0.34, 1.1);
    p.osc({ f: 120, f1: 58, a: 0.003, d: 0.14, g: 0.25 });
    whistle(p, 0.01, 0.3, 0.45, 4200, 1900);
    p.noise({ flt: 'bandpass', fc: 2400, fc1: 900, q: 1.5, t: 0.01, a: 0.015, d: 0.22, g: 0.35 });
  }, { ...FX, loud: -16, len: 0.6 }),
  fx_fengling_s2_dash: def('技能特效', '李广·飞将腾身(落地上弦)', (p) => {
    // 腾身：衣甲带风
    whoosh(p, 0, 0.22, 0.4, 700, 2400, 1100, 0.9);
    // 落地
    p.noise({ k: 'pink', flt: 'lowpass', fc: 500, t: 0.19, a: 0.004, d: 0.06, g: 0.5 });
    p.osc({ f: 110, f1: 60, t: 0.19, a: 0.002, d: 0.07, g: 0.4 });
    // 上弦的「咔」：必暴就绪
    p.osc({ f: 1900, f1: 1300, t: 0.3, a: 0.001, d: 0.012, g: 0.5 });
    p.noise({ flt: 'bandpass', fc: 3200, q: 2.5, t: 0.3, a: 0.001, d: 0.008, g: 0.6 });
    p.osc({ w: 'triangle', f: 520, f1: 420, t: 0.302, a: 0.001, d: 0.03, g: 0.35 });
  }, { ...FX, loud: -20, len: 0.5 }),
  fx_fengling_ult_cast: def('技能特效', '李广·仰射(三弦齐发)', (p) => {
    // 连续三声弓弦
    [0, 0.075, 0.15].forEach((t, i) => twang(p, 150 + i * 14, t, 0.2, 0.8));
    // 箭群升空的群啸：几支箭先后离弦，哨音各自上行
    [0.02, 0.06, 0.1, 0.15, 0.19].forEach((t, i) => whistle(p, t, 0.36, 0.3, 1500 + i * 260, 3400 + i * 380));
    p.noise({ flt: 'bandpass', fc: 1000, fc1: 4800, fct: 0.4, q: 1.2, a: 0.16, d: 0.26, g: 0.5 });
  }, { ...FX, loud: -17, len: 0.7 }),
  fx_fengling_ult_tick: def('技能特效', '李广·箭雨落地', (p) => {
    // 一阵箭钉进地面：密集的「笃笃笃」+ 几声下坠的箭啸
    p.scatter(9, 0, 0.28, (at) => thunk(p, at, p.rr(0.4, 0.8), p.rr(0.8, 1.3)));
    p.scatter(3, 0, 0.14, (at) => whistle(p, at, 0.08, 0.25, p.rr(3200, 4200), 1800));
    p.noise({ k: 'pink', flt: 'bandpass', fc: 600, q: 0.8, a: 0.03, d: 0.22, g: 0.3 });
  }, { ...FX, loud: -17, len: 0.55, gap: 0.2, poly: 3, jitter: 0.06 }),

  // ═════════════ 荆轲 ═════════════
  fx_yeque_s1_dash: def('技能特效', '荆轲·风萧易水', (p) => {
    // 一笔横扫的「唰」
    whoosh(p, 0, 0.17, 0.7, 700, 5200, 1600, 2);
    p.noise({ k: 'pink', flt: 'bandpass', fc: 400, fc1: 1500, fct: 0.12, q: 1.2, a: 0.02, d: 0.14, g: 0.5 });
    // 匕首的寒光
    p.ring(2900, DAGGER, { t: 0.05, a: 0.001, d: 0.18, g: 0.1 });
    p.osc({ f: 98, f1: 52, a: 0.004, d: 0.16, g: 0.35 });
    // 人过之后留下的一缕易水寒风：缓慢扫频的窄带噪声
    p.noise({ flt: 'bandpass', fc: 700, fc1: 1500, fct: 0.5, q: 5, t: 0.08, a: 0.15, d: 0.4, g: 0.16 });
  }, { ...FX, loud: -17, len: 0.7 }),
  fx_yeque_s2_cast: def('技能特效', '荆轲·掷匕', (p) => {
    // 三声轻的「嗖」
    [0, 0.035, 0.07].forEach((t, i) => p.noise({ flt: 'bandpass', fc: 2800 + i * 300, fc1: 5600 + i * 400, q: 3, t, a: 0.004, d: 0.045, g: 0.7 }));
    p.ring(3500, DAGGER, { a: 0.001, d: 0.14, g: 0.06 });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 600, a: 0.006, d: 0.1, g: 0.35 });
  }, { ...FX, loud: -19, len: 0.4 }),
  fx_yeque_ult_vanish: def('技能特效', '荆轲·图卷展开', (p) => {
    // 帛卷铺开的「哗——」：纸帛摩擦的噪声，带细密的抖动
    const g = p.gain(1);
    p.lfo(g.gain, 38, 0.45, 0, 0.45);
    p.noise({ flt: 'bandpass', fc: 1400, fc1: 4600, fct: 0.3, q: 1.2, a: 0.05, d: 0.3, g: 0.8, to: g });
    p.noise({ flt: 'highpass', fc: 5500, a: 0.06, d: 0.26, g: 0.1, to: g });
    // 人散成墨：一记低处的筑音往下沉
    zhu(p, D4, 0.02, 0.4, 0.5);
    p.osc({ f: 92, f1: 45, a: 0.004, d: 0.24, g: 0.5 });
  }, { ...FX, loud: -18, len: 0.6, rev: 0.24 }),
  fx_yeque_ult_strike: def('技能特效', '荆轲·卷尽匕现', (p) => {
    // 极短的留白，然后一声干脆的「嚓」+ 低音鼓
    const T = 0.045;
    const dr = p.drive(3, p.gain(0.6));
    p.noise({ flt: 'highpass', fc: 3200, t: T, a: 0.001, d: 0.04, g: 1.1 });
    p.noise({ flt: 'bandpass', fc: 5200, q: 1.5, t: T, a: 0.001, d: 0.06, g: 0.6 });
    // 自下而上的一道寒光
    p.noise({ flt: 'bandpass', fc: 2600, fc1: 7000, q: 2, t: T, a: 0.004, d: 0.1, g: 0.5 });
    p.ring(2500, DAGGER, { t: T, a: 0.001, d: 0.45, g: 0.2 });
    p.osc({ f: 110, f1: 36, ft: 0.13, t: T + 0.01, a: 0.003, d: 0.42, g: 0.4, to: dr });
    p.noise({ k: 'pink', flt: 'lowpass', fc: 1400, fc1: 300, t: T + 0.01, a: 0.001, d: 0.07, g: 0.3, to: dr });
    // 收尾：低处一组相距三全音的筑音
    zhu(p, D4, T + 0.02, 0.5, 0.6);
    zhu(p, mtof(56), T + 0.03, 0.5, 0.5);
  }, { ...FX, loud: -13, len: 0.9, prio: 3, rev: 0.24 }),
  yeque_refresh: def('技能特效', '荆轲·得手(技能刷新)', (p) => {
    // 一声冷的击弦泛音
    p.osc({ f: D6, a: 0.001, d: 0.6, g: 0.4 });
    p.osc({ f: D6 * 1.5, t: 0.004, a: 0.001, d: 0.4, g: 0.14 });
    p.osc({ w: 'zhu', f: D5, a: 0.001, d: 0.12, g: 0.12 });
    p.noise({ flt: 'bandpass', fc: 2600, q: 2, a: 0.001, d: 0.008, g: 0.3 });
  }, { ...FX, ...TUNED, bus: 'ui', loud: -24, len: 0.7, gap: 0.3, poly: 1, rev: 0.26 }),

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
  area_panyue_aura: def('区域铺底', '拥盾怒目·盾影', (p) => {
    const d = p.dur;
    const hold = Math.max(0.1, d - 0.8);
    const g = p.gain(1);
    p.lfo(g.gain, 2.2, 0.3, 0, d + 0.5);
    // 盾影缓转：铜面的低鸣，两对相近的分音各自起拍
    [147, 148.6, 223.5, 225.7, 334].forEach((f, i) => p.osc({ f, a: 0.25, h: hold, d: 0.6, g: i < 4 ? 0.22 : 0.1, to: g }));
    p.noise({ k: 'brown', flt: 'lowpass', fc: 240, a: 0.2, h: hold, d: 0.6, g: 0.4, to: g });
    // 中频的一层：小喇叭上也听得见
    p.noise({ k: 'pink', flt: 'bandpass', fc: 420, q: 1, a: 0.2, h: hold, d: 0.6, g: 0.3, to: g });
  }, { ...BED, loud: -30, len: 4 }),
  area_panyue_fissure: def('区域铺底', '跃盾砸阵·震裂的地面', (p) => {
    const d = p.dur;
    const hold = Math.max(0.1, d - 0.7);
    const g = p.gain(1);
    p.lfo(g.gain, 3.1, 0.25, 0, d + 0.7);
    // 裂缝里冒出的尘
    p.noise({ k: 'brown', flt: 'lowpass', fc: 190, a: 0.12, h: hold, d: 0.6, g: 0.7, to: g });
    p.noise({ k: 'pink', flt: 'bandpass', fc: 450, q: 0.9, a: 0.12, h: hold, d: 0.6, g: 0.4, to: g });
    // 零星跳动的碎土
    p.scatter(Math.round(d * 3), 0.1, Math.max(0.2, d - 0.3), (at) => {
      p.osc({ f: p.rr(90, 170), f1: 55, t: at, a: 0.002, d: p.rr(0.04, 0.08), g: p.rr(0.2, 0.4) });
      p.noise({ k: 'pink', flt: 'bandpass', fc: p.rr(400, 1100), q: 2, t: at, a: 0.001, d: 0.04, g: p.rr(0.15, 0.3) });
    });
  }, { ...BED, loud: -24, len: 3 }),
  area_chijin_spin: def('区域铺底', '抡圆了砍·呼啸', (p) => {
    const d = p.dur;
    const hold = Math.max(0.1, d - 0.45);
    // 「呼——呼——」：增益与带通中心每一跳起伏一次，峰值落在每跳上(振荡器晚四分之三拍起振)
    const rate = 1 / SPIN_TICK;
    const lead = SPIN_TICK * 0.75;
    const g = p.gain(0.55);
    p.lfo(g.gain, rate, 0.45, lead, d + 0.3);
    const bp = p.filt('bandpass', 800, 1.1, g);
    p.lfo(bp.frequency, rate, 380, lead, d + 0.3);
    p.noise({ k: 'pink', a: 0.15, h: hold, d: 0.3, g: 2.4, to: bp });
    p.osc({ w: 'softsaw', f: 73, a: 0.2, h: hold, d: 0.3, g: 0.2, to: p.filt('lowpass', 240, 0.7, g) });
    // 被卷起的尘土 + 零星的铁火星
    p.noise({ k: 'brown', flt: 'bandpass', fc: 300, q: 0.8, a: 0.3, h: hold, d: 0.3, g: 0.3, to: g });
    p.scatter(Math.round(d * 3), 0.05, Math.max(0.2, d - 0.2), (at) => {
      p.noise({ flt: 'highpass', fc: p.rr(3000, 6000), t: at, a: 0.001, d: 0.01, g: p.rr(0.06, 0.14) });
    });
  }, { ...BED, loud: -22, len: 3 }),
  area_xingli_well: def('区域铺底', '回环收弦·蓄势', (p) => {
    const d = Math.max(0.25, p.dur);
    // 回旋收拢：轮指越来越密、越来越亮
    const lp = p.filt('lowpass', 1500, 1);
    p.ramp(lp.frequency, [[0, 1500], [d, 6000]]);
    const n = Math.max(4, Math.round(d * 14));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      pick(p, A5, d * Math.pow(k, 0.7), 0.14, 0.3 + 0.7 * k, i % 2 === 0, lp);
    }
    p.noise({ flt: 'bandpass', fc: 300, fc1: 2400, fct: d, q: 2, a: d * 0.92, d: 0.05, g: 0.4 });
  }, { ...BED, ...TUNED, loud: -25, len: 0.6 }),
  area_xingli_storm: def('区域铺底', '雁落平沙·轮指', (p) => {
    const d = p.dur;
    const hold = Math.max(0.1, d - 0.8);
    const g = p.gain(1);
    const lp = p.filt('lowpass', 5200, 0.8, g);
    // 轮指：同一个音每秒十三四下，力度一阵一阵地渐强渐弱
    const rate = 13.5;
    const n = Math.round(d * rate);
    for (let i = 0; i < n; i++) {
      const t = 0.05 + i / rate + p.rr(-0.006, 0.006);
      const swell = 0.35 + 0.65 * Math.pow(Math.sin((Math.PI * t) / 1.25), 2);
      const fade = Math.min(1, Math.max(0.15, (d - t) / 0.5));
      pick(p, i % 8 === 7 ? D6 : B5, t, 0.16, 0.5 * swell * fade, i % 2 === 0, lp);
    }
    // 沙面上的风 + 低处的空弦
    p.noise({ flt: 'highpass', fc: 5500, a: 0.3, h: hold, d: 0.6, g: 0.05, to: g });
    p.osc({ f: 82.4, a: 0.3, h: hold, d: 0.5, g: 0.08, to: g });
  }, { ...BED, ...TUNED, loud: -27, len: 3, rev: 0.3 }),
  area_fengling_rain: def('区域铺底', '箭锁阴山·箭阵', (p) => {
    const d = p.dur;
    // 箭阵压在头顶：稀疏不断的「笃」取代风声，偶尔一声下坠的箭啸
    p.scatter(Math.round(d * 7), 0.05, Math.max(0.2, d - 0.15), (at) => thunk(p, at, p.rr(0.25, 0.55), p.rr(0.75, 1.35)));
    p.scatter(Math.round(d * 1.6), 0.1, Math.max(0.2, d - 0.4), (at) => whistle(p, at, 0.16, 0.2, p.rr(3000, 4400), 1700));
    // 尘土的底
    p.noise({ k: 'pink', flt: 'bandpass', fc: 500, q: 0.7, a: 0.2, h: Math.max(0.1, d - 0.6), d: 0.4, g: 0.25 });
  }, { ...BED, loud: -25, len: 3 }),
} satisfies Partial<Record<SfxKey, SfxDef>>;
