import { describe, expect, it } from 'vitest';
import { PerfMeter, RollingStat } from './perf';

describe('RollingStat', () => {
  it('空窗口的统计都是 0', () => {
    const s = new RollingStat(4);
    expect(s.count).toBe(0);
    expect(s.avg).toBe(0);
    expect(s.max).toBe(0);
    expect(s.percentile(0.95)).toBe(0);
  });

  it('未写满时按已有样本统计', () => {
    const s = new RollingStat(8);
    for (const v of [2, 4, 6]) s.push(v);
    expect(s.count).toBe(3);
    expect(s.avg).toBeCloseTo(4);
    expect(s.max).toBe(6);
    expect(s.last).toBe(6);
    expect(s.percentile(0.5)).toBe(4);
    expect(s.percentile(1)).toBe(6);
    expect(s.percentile(0)).toBe(2);
  });

  it('写满后旧样本滑出窗口，peak 仍记得历史最大值', () => {
    const s = new RollingStat(3);
    for (const v of [100, 1, 2, 3]) s.push(v);
    expect(s.count).toBe(3);
    expect(s.avg).toBeCloseTo(2);
    expect(s.max).toBe(3);
    expect(s.peak).toBe(100);
    for (let i = 0; i < 50; i++) s.push(5);
    expect(s.avg).toBeCloseTo(5, 9);
  });

  it('reset 清空全部状态', () => {
    const s = new RollingStat(3);
    s.push(9);
    s.reset();
    expect(s.count).toBe(0);
    expect(s.peak).toBe(0);
    expect(s.avg).toBe(0);
  });
});

describe('PerfMeter', () => {
  it('按帧间隔换算帧率，间隔为 0 的帧不计入', () => {
    const m = new PerfMeter(16);
    m.frame(1, 5, 0.5, 0.1, 7, 0, 1);
    expect(m.fps).toBe(0);
    for (let i = 0; i < 10; i++) m.frame(1, 5, 0.5, 0.1, 7, 20, 1);
    expect(m.fps).toBeCloseTo(50);
    expect(m.frames).toBe(11);
  });

  it('snapshot 给出各阶段的均值 / P95 / 最大值', () => {
    const m = new PerfMeter(100);
    for (let i = 1; i <= 100; i++) m.frame(i, 2 * i, 0.25, 0, 3 * i, 16, i % 2);
    const snap = m.snapshot();
    expect(snap.frames).toBe(100);
    expect(snap.sim.avg).toBeCloseTo(50.5);
    expect(snap.sim.p95).toBe(95);
    expect(snap.sim.max).toBe(100);
    expect(snap.render.max).toBe(200);
    expect(snap.hud.avg).toBeCloseTo(0.25);
    expect(snap.stepsPerFrame).toBeCloseTo(0.5);
    expect(snap.fps).toBeCloseTo(62.5);
  });
});
