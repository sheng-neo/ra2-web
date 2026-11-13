/**
 * 菜单层的两处纯函数：加载页小贴士按输入方式取、结算页评分的显示刻度。
 */
import { describe, expect, it } from 'vitest';
import { loadingTips } from './loading';
import { displayScore } from './result';

describe('加载页小贴士', () => {
  it('讲操作的贴士按输入方式取：键鼠看不到「轻点 / 取消圈」，触控看不到键位', () => {
    const kbm = loadingTips('kbm');
    const touch = loadingTips('touch');
    expect(kbm.length).toBe(touch.length);
    expect(kbm.some((t) => /轻点|拖到「取消」/.test(t))).toBe(false);
    expect(kbm.some((t) => t.includes('Q / E / R'))).toBe(true);
    expect(touch.some((t) => /[QERB] |Esc|鼠标|空格/.test(t))).toBe(false);
    expect(touch.some((t) => t.includes('轻点技能键'))).toBe(true);
    // 专属的几条插在通用的之间，不扎堆在开头或结尾
    const idx = kbm.map((t, i) => (touch[i] === t ? -1 : i)).filter((i) => i >= 0);
    expect(idx.length).toBe(2);
    expect(idx[0]).toBeGreaterThan(0);
    expect(idx[1] - idx[0]).toBeGreaterThan(2);
  });

  it('叫法统一：不再出现「引导 N 秒」「远古巨灵」「补刀」', () => {
    for (const t of [...loadingTips('kbm'), ...loadingTips('touch')]) {
      expect(t).not.toMatch(/引导 ?\d|远古巨灵|补刀/);
      expect([...t].length).toBeLessThanOrEqual(46);
    }
  });
});

describe('结算评分的显示刻度', () => {
  it('原始分 3~16 线性换算成 10 分制，一位小数，两端封顶', () => {
    expect(displayScore(3)).toBe('0.0');
    expect(displayScore(16)).toBe('10.0');
    expect(displayScore(9.5)).toBe('5.0');
    expect(displayScore(12.8)).toBe('7.5');
    expect(displayScore(0)).toBe('0.0');
    expect(displayScore(99)).toBe('10.0');
  });
});
