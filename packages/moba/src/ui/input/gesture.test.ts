import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS, isTapPress } from './gesture';

describe('技能键原地按压：轻点 / 长按 判定', () => {
  it('短按是轻点', () => {
    expect(isTapPress(1000, 1080)).toBe(true);
    expect(isTapPress(1000, 1000 + LONG_PRESS_MS)).toBe(true);
  });

  it('按住超过阈值是长按', () => {
    expect(isTapPress(1000, 1000 + LONG_PRESS_MS + 1)).toBe(false);
    expect(isTapPress(1000, 2200)).toBe(false);
  });

  it('阈值比早先的 350ms 宽：一次 380ms 的慢点仍算轻点', () => {
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(400);
    expect(isTapPress(0, 380)).toBe(true);
  });

  it('只看事件时间戳之差：处理被主线程拖晚不影响判定', () => {
    // 手指 100ms 就抬起了；即使回调在 900ms 后才被执行，时间戳之差仍是 100
    const down = 5000;
    const up = 5100;
    expect(isTapPress(down, up)).toBe(true);
  });

  it('时间戳不可用时当作轻点(不吞操作)', () => {
    expect(isTapPress(0, Number.NaN)).toBe(true);
    expect(isTapPress(Number.NaN, 100)).toBe(true);
    expect(isTapPress(500, 100)).toBe(true);
  });

  it('可自定义阈值', () => {
    expect(isTapPress(0, 300, 250)).toBe(false);
    expect(isTapPress(0, 200, 250)).toBe(true);
  });
});
