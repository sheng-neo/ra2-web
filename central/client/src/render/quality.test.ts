import { describe, expect, it } from 'vitest';
import { AdaptiveDpr, DowngradeWatch, MSAA_MAX_START_PX, TIER_SPECS, adaptiveLadder, canvasBytes, chooseQuality, msaaSamples, startDpr, type Caps } from './quality';

const full: Caps = { webgl2: true, halfFloatRT: true, msaaHalfFloat: true };

describe('画质档选择', () => {
  it('URL 优先，其次能力；HalfFloat 目标不可渲染时退到 LOW', () => {
    expect(chooseQuality(null, full)).toEqual({ tier: 'high', bloom: true, reflection: true });
    expect(chooseQuality('low', full)).toEqual({ tier: 'low', bloom: false, reflection: false });
    expect(chooseQuality(null, { ...full, halfFloatRT: false, msaaHalfFloat: false }).tier).toBe('low');
    expect(chooseQuality('high', { ...full, halfFloatRT: false }).tier).toBe('low');
    expect(chooseQuality(null, { webgl2: false, halfFloatRT: false, msaaHalfFloat: false }).tier).toBe('low');
    // 多重采样浮点目标不行：仍是 HIGH，只是不开 MSAA
    expect(chooseQuality(null, { ...full, msaaHalfFloat: false }).tier).toBe('high');
  });

  it('MSAA：只在 HIGH、支持且起始 buffer ≤ 1.2 Mpx 时为 2', () => {
    const high = chooseQuality(null, full);
    expect(msaaSamples(high, full, 1280 * 720)).toBe(2);
    expect(msaaSamples(high, full, 1748 * 804)).toBe(0); // iPhone 横屏 DPR 2
    expect(msaaSamples(high, full, MSAA_MAX_START_PX)).toBe(2);
    expect(msaaSamples(high, { ...full, msaaHalfFloat: false }, 1280 * 720)).toBe(0);
    expect(msaaSamples(chooseQuality('low', full), full, 1280 * 720)).toBe(0);
  });
});

describe('起始 DPR', () => {
  it('HIGH 上限 2、LOW 上限 1.5', () => {
    expect(startDpr('high', 3, 874, 402)).toBe(2);
    expect(startDpr('low', 3, 874, 402)).toBe(1.5);
    expect(startDpr('high', 1, 1280, 720)).toBe(1);
  });

  it('超过 buffer 像素上限时沿阶梯下降', () => {
    // 2560×1440 CSS 在 DPR 2 下 14.7 Mpx：HIGH 上限 2.4 Mpx → 降到 0.75（2.07 Mpx；DPR 1 时 3.7 Mpx，显存超 64 MB）
    expect(startDpr('high', 2, 2560, 1440)).toBe(0.75);
    expect(startDpr('high', 1, 2560, 1440)).toBe(0.75);
    // 4K 桌面窗口 @1：8.3 Mpx → 0.5
    expect(startDpr('high', 1, 3840, 2160)).toBe(0.5);
    for (const [w, h] of [
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ] as const) {
      expect(w * h * startDpr('high', 1, w, h) ** 2).toBeLessThanOrEqual(TIER_SPECS.high.bufferCapPx);
    }
    // 1440×900 @2 = 5.2 Mpx → 1.25 时 2.0 Mpx 满足
    expect(startDpr('high', 2, 1440, 900)).toBe(1.25);
    // 1024×768 @2 = 3.1 Mpx → 1.75 时 2.41 Mpx 仍超 → 1.5
    expect(startDpr('high', 2, 1024, 768)).toBe(1.5);
    for (const tier of ['high', 'low'] as const) {
      const d = startDpr(tier, 2, 874, 402);
      expect(874 * 402 * d * d).toBeLessThanOrEqual(TIER_SPECS[tier].bufferCapPx);
    }
  });
});

describe('自适应 DPR', () => {
  it('慢 2 s 降一级，冷却 3 s，快 5 s 升回但不超过起始值', () => {
    const a = new AdaptiveDpr(TIER_SPECS.high.ladder, 2);
    let t = 0;
    let changed: number | null = null;
    // 50 ms 帧：EMA 很快超过 36 ms，持续 2 s 后降到 1.75
    while (t < 5000 && changed === null) {
      t += 50;
      changed = a.sample(50, t);
    }
    expect(changed).toBe(1.75);
    expect(t).toBeGreaterThanOrEqual(2000);
    // 冷却期内不再变
    const t1 = t;
    while (t < t1 + 2900) {
      t += 50;
      expect(a.sample(50, t)).toBeNull();
    }
    // 之后变快：至少 5 s 才升回 2，且不会超过 2
    let up: number | null = null;
    const t2 = t;
    while (t < t2 + 20000 && up === null) {
      t += 16;
      up = a.sample(16, t);
    }
    expect(up).toBe(2);
    expect(t - t2).toBeGreaterThanOrEqual(5000);
    for (let k = 0; k < 2000; k++) {
      t += 16;
      expect(a.sample(16, t)).toBeNull();
    }
    expect(a.dpr).toBe(2);
  });

  it('起始 DPR 不在阶梯上时插到最前；自适应不降到 1 以下（只为显存设的几级不拿来换帧率）', () => {
    const a = new AdaptiveDpr(adaptiveLadder('high', 1), 1);
    expect(a.dpr).toBe(1);
    expect(a.atBottom).toBe(true);
    expect(adaptiveLadder('high', 2)).toEqual([2, 1.75, 1.5, 1.25, 1]);
    expect(adaptiveLadder('high', 0.5)).toEqual([0.5]);
    const b = new AdaptiveDpr(TIER_SPECS.low.ladder, 1.3);
    expect(b.dpr).toBe(1.3);
    expect(b.atBottom).toBe(false);
  });

  it('指数退避：两级之间（高一级 40 ms、低一级 26 ms）不会每 5–8 s 来回切', () => {
    const a = new AdaptiveDpr(adaptiveLadder('high', 2), 2);
    let t = 0;
    const changes: number[] = [];
    while (t < 60000) {
      t += 16;
      const ms = a.dpr >= 2 ? 40 : 26;
      const c = a.sample(ms, t);
      if (c !== null) changes.push(t);
    }
    // 原来 60 s 里切 9 次；退避后：降、升、降、（等 10 s）升、降……约 4–5 次
    expect(changes.length).toBeLessThanOrEqual(5);
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it('画布显存估算：HIGH 无深度 8 B/px，LOW 4× MSAA 约 40 B/px', () => {
    expect(canvasBytes(1000, false, 0)).toBe(8000);
    expect(canvasBytes(1000, true, 4)).toBe(40000);
  });

  it('A11 自动降档：只在阶梯底、中位帧时间 > 40 ms 持续 4 s 后触发一次', () => {
    const w = new DowngradeWatch();
    let t = 0;
    let fired = false;
    while (t < 3000) {
      t += 60;
      fired ||= w.sample(60, t, false);
    }
    expect(fired).toBe(false);
    let firedAt = -1;
    for (let k = 0; k < 200; k++) {
      t += 60;
      if (w.sample(60, t, true)) firedAt = t;
    }
    expect(firedAt).toBeGreaterThan(0);
    expect(w.sample(60, t + 60, true)).toBe(false);
  });
});
