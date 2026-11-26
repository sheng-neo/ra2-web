import { describe, expect, it } from 'vitest';
import { BELL_AMPS, BELL_GAP_S, BELL_RANGE_M, BELL_RATIOS, HUM_RANGE_M, MASTER_GAIN, bellPartials, bellStrikes, distanceGain, humDistanceGain, humParams, panFor, strikeEnvelope } from './bell';
import { SOUND_KEY, initialMute, readStoredMute, writeStoredMute } from './engine';

describe('叮叮铃（纯函数）', () => {
  it('四个不谐和分音 1 : 2.76 : 5.40 : 8.93，基频 1000 ± 80 Hz，振幅递减', () => {
    for (const seed of [0, 0.5, 1]) {
      const p = bellPartials(seed);
      expect(p).toHaveLength(4);
      expect(p[0]!.freq).toBeGreaterThanOrEqual(920);
      expect(p[0]!.freq).toBeLessThanOrEqual(1080);
      p.forEach((q, k) => {
        expect(q.freq / p[0]!.freq).toBeCloseTo(BELL_RATIOS[k]!, 6);
        expect(q.amp).toBe(BELL_AMPS[k]);
        if (k > 0) expect(q.tau).toBeLessThan(p[k - 1]!.tau);
      });
    }
    expect(bellPartials(0.3)).toEqual(bellPartials(0.3));
  });

  it('两下敲击相隔 0.25 s；包络 2 ms 起音、约 1 s 衰减到 −40 dB', () => {
    expect(bellStrikes()).toEqual([0, BELL_GAP_S]);
    expect(BELL_GAP_S).toBeCloseTo(0.25);
    const tau = bellPartials(0.5)[0]!.tau;
    expect(strikeEnvelope(-0.01, tau)).toBe(0);
    expect(strikeEnvelope(0.001, tau)).toBeCloseTo(0.5);
    expect(strikeEnvelope(0.002, tau)).toBeCloseTo(1);
    const t40 = 0.002 + tau * Math.log(100);
    expect(t40).toBeGreaterThan(0.8);
    expect(t40).toBeLessThan(1.2);
  });

  it('距离增益 1 / (1 + d / 15)，120 m 外为 0；主音量峰值 ≤ −12 dBFS', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(15)).toBeCloseTo(0.5);
    expect(distanceGain(BELL_RANGE_M + 1)).toBe(0);
    const peak = MASTER_GAIN * BELL_AMPS.reduce((a, b) => a + b, 0) * 1.2;
    expect(20 * Math.log10(peak)).toBeLessThanOrEqual(-12);
  });

  it('立体声相位：声源在相机右边为正、左边为负、正前方为 0', () => {
    // 相机朝 −z（three 默认），右方向 +x
    expect(panFor(1, 0, 10, 0)).toBeCloseTo(1);
    expect(panFor(1, 0, -10, 0)).toBeCloseTo(-1);
    expect(panFor(1, 0, 0, -10)).toBeCloseTo(0);
    expect(panFor(1, 0, 0, 0)).toBe(0);
  });
});

describe('牵引马达声（纯函数）', () => {
  it('停车无声；车速越快音高越高、低通越开（300–900 Hz）', () => {
    expect(humParams(0).gain).toBe(0);
    const slow = humParams(2);
    const fast = humParams(7);
    expect(fast.freq).toBeGreaterThan(slow.freq);
    expect(fast.cutoff).toBeGreaterThan(slow.cutoff);
    expect(humParams(0).cutoff).toBeGreaterThanOrEqual(300);
    expect(humParams(20).cutoff).toBeLessThanOrEqual(900);
  });
  it('80 m 外听不到，越近越响', () => {
    expect(humDistanceGain(HUM_RANGE_M + 1)).toBe(0);
    expect(humDistanceGain(5)).toBeGreaterThan(humDistanceGain(40));
  });
});

describe('静音设定（localStorage，读写失败不抛错）', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('记住、读回', () => {
    const s = mem();
    expect(readStoredMute(s)).toBeNull();
    writeStoredMute(s, true);
    expect(s.getItem(SOUND_KEY)).toBe('off');
    expect(readStoredMute(s)).toBe(true);
    writeStoredMute(s, false);
    expect(readStoredMute(s)).toBe(false);
  });
  it('存储抛错（隐私模式）时静默', () => {
    const bad = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readStoredMute(bad)).toBeNull();
    expect(() => writeStoredMute(bad, true)).not.toThrow();
    expect(readStoredMute(null)).toBeNull();
  });
  it('#mute 一定静音；否则按记住的设定，默认有声', () => {
    expect(initialMute(true, false)).toBe(true);
    expect(initialMute(false, null)).toBe(false);
    expect(initialMute(false, true)).toBe(true);
  });
});
