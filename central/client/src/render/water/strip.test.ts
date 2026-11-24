import { describe, expect, it } from 'vitest';
import { STRIP_BINS, bearingBin, splatStrip, type Emitter } from './strip';

const em = (x: number, y: number, z0: number, z1: number, r = 1): Emitter => ({ x, y, z0, z1, halfWidth: 20, r, g: r, b: r });

describe('倒影发光条', () => {
  it('方位角：北 = 0，东 = 1/4，南 = 1/2，西 = 3/4', () => {
    expect(bearingBin(0, 100)).toBe(0);
    expect(bearingBin(100, 0)).toBe(STRIP_BINS / 4);
    expect(bearingBin(0, -100)).toBe(STRIP_BINS / 2);
    expect(bearingBin(-100, 0)).toBe((STRIP_BINS * 3) / 4);
  });

  it('光源落在自己方位的格子里，a 通道是天际线仰角', () => {
    const out = new Float32Array(STRIP_BINS * 4);
    splatStrip(out, [em(0, -1000, 0, 200)], 0, 0, 0);
    const k = bearingBin(0, -1000);
    expect(out[k * 4]).toBeGreaterThan(0);
    expect(out[k * 4 + 3]).toBeCloseTo(Math.atan2(200, 1000), 3);
    // 对面（北）没有光
    expect(out[0]).toBe(0);
  });

  it('近处较高的光源挡住远处同高的光源', () => {
    const both = new Float32Array(STRIP_BINS * 4);
    splatStrip(both, [em(0, -2000, 0, 300, 5), em(0, -500, 0, 300, 1)], 0, 0, 0);
    const alone = new Float32Array(STRIP_BINS * 4);
    splatStrip(alone, [em(0, -500, 0, 300, 1)], 0, 0, 0);
    const k = bearingBin(0, -500);
    expect(both[k * 4]).toBeCloseTo(alone[k * 4]!, 5);
  });

  it('确定性：同样输入同样输出', () => {
    const a = new Float32Array(STRIP_BINS * 4);
    const b = new Float32Array(STRIP_BINS * 4);
    const list = [em(300, 900, 0, 120), em(-800, 1500, 10, 260, 2), em(2000, -300, 0, 60)];
    splatStrip(a, list, 10, 20, 45);
    splatStrip(b, list, 10, 20, 45);
    expect([...a]).toEqual([...b]);
  });
});
