/**
 * 音效注册表的静态检查：每个键都有配平值、每个配方(含变体与不同时长)都能在假上下文上排完而不触发
 * WebAudio 会抛异常的参数、收声时刻合理、画廊里的名字已经换成第二阶段的叫法。
 */
import { describe, expect, it } from 'vitest';
import { Kit, Patch } from '../synth';
import { fakeContext } from '../testkit';
import { SFX, SFX_KEYS } from './index';
import type { SfxKey } from './index';
import { TRIM } from './levels';

function build(key: SfxKey, v: number, dur: number, pitch = 1): { end: number; sources: number } {
  const ctx = fakeContext();
  const kit = new Kit(ctx);
  const p = new Patch(kit, ctx.createGain() as unknown as AudioNode, 0.004);
  p.pm = pitch;
  p.dur = dur;
  SFX[key].fn(p, v);
  p.finish();
  return { end: p.end, sources: ctx.sources };
}

describe('音效注册表', () => {
  it('每个键都有配平增益，配平表里没有多余的键', () => {
    const missing = SFX_KEYS.filter((k) => TRIM[k] === undefined);
    const stale = Object.keys(TRIM).filter((k) => !(k in SFX));
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
    for (const k of SFX_KEYS) {
      const t = TRIM[k] ?? 0;
      expect(t, k).toBeGreaterThan(0.05);
      expect(t, k).toBeLessThan(3);
    }
  });

  it('每个配方(含各变体)都能排完，参数合法，收声时刻有限', () => {
    for (const key of SFX_KEYS) {
      const def = SFX[key];
      const vs = def.variants ? def.variants.map((x) => x.v) : [0];
      for (const v of vs) {
        const r = build(key, v, def.len);
        expect(r.sources, `${key} v=${v} 应至少有一个声源`).toBeGreaterThan(0);
        expect(Number.isFinite(r.end), `${key} v=${v}`).toBe(true);
        // 名义时长之外最多再拖 1.6 秒(衰减尾 / 回声)
        expect(r.end, `${key} v=${v} 的收声时刻`).toBeLessThan(def.len + 1.6);
      }
    }
  });

  it('跟随时长的键在很短、很长的时长下也能排完', () => {
    const beds = SFX_KEYS.filter((k) => k.startsWith('area_') || k === 'recall_channel' || k === 'fx_drake_breath_warn' || k === 'fx_drake_breath');
    expect(beds.length).toBeGreaterThanOrEqual(10);
    for (const key of beds) {
      for (const dur of [0.05, 0.3, 1, 6]) {
        const r = build(key, 0, dur, 0.8);
        expect(Number.isFinite(r.end), `${key} dur=${dur}`).toBe(true);
        expect(r.end, `${key} dur=${dur}`).toBeLessThan(Math.max(dur, 1.6) + 2);
      }
    }
  });

  it('巨龙吐息：预警在给定的秒数收住，喷吐的主体持续到给定的秒数', () => {
    for (const d of [0.5, 0.9]) {
      const warn = build('fx_drake_breath_warn', 0, d).end;
      expect(warn).toBeGreaterThan(d);
      expect(warn).toBeLessThan(d + 0.4);
      const breath = build('fx_drake_breath', 0, d).end;
      expect(breath).toBeGreaterThan(d + 0.2);
      expect(breath).toBeLessThan(d + 1);
    }
  });

  it('程咬金三板斧：一技能、二技能、大招的施放提示声源数逐级增加', () => {
    const n1 = build('cast_chijin_s1', 0, 0.5).sources;
    const n2 = build('cast_chijin_s2', 0, 0.5).sources;
    const n3 = build('cast_chijin_ult', 0, 0.9).sources;
    expect(n2).toBeGreaterThan(n1 - 2);
    expect(n3).toBeGreaterThan(n2);
  });

  it('画廊里的名字用第二阶段的叫法(不再出现旧英雄名与旧兵种 / 野怪名)', () => {
    const old = ['磐岳', '赤烬', '星璃', '风翎', '夜阙', '巨卫', '攻城兽', '荧翼蜥', '鳞兽'];
    for (const key of SFX_KEYS) {
      const text = SFX[key].label + (SFX[key].variants ?? []).map((x) => x.label).join('');
      for (const w of old) expect(text.includes(w), `${key}: ${text}`).toBe(false);
    }
    for (const [hero, name] of [['panyue', '樊哙'], ['chijin', '程咬金'], ['xingli', '王昭君'], ['fengling', '李广'], ['yeque', '荆轲']] as const) {
      for (const slot of ['s1', 's2', 'ult'] as const) expect(SFX[`cast_${hero}_${slot}`].label.startsWith(name)).toBe(true);
    }
  });
});
