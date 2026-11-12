import { describe, expect, it } from 'vitest';
import { MAX_SPEED, parseDebugParams } from './params';

describe('parseDebugParams', () => {
  it('没有参数时全部为缺省值', () => {
    expect(parseDebugParams('')).toEqual({
      hero: null, difficulty: null, seed: null, skipMenu: false, auto: false, speed: 1, quality: null, showFps: false,
    });
  });

  it('解析完整的查询串', () => {
    const p = parseDebugParams('?hero=xingli&difficulty=hard&seed=42&skipmenu=1&auto=1&speed=8&quality=high&fps=1');
    expect(p).toEqual({ hero: 'xingli', difficulty: 'hard', seed: 42, skipMenu: true, auto: true, speed: 8, quality: 'high', showFps: true });
  });

  it('非法取值被忽略而不是原样放行', () => {
    const p = parseDebugParams('?hero=nobody&difficulty=insane&seed=abc&speed=-3&quality=ultra&skipmenu=0&auto=false');
    expect(p.hero).toBeNull();
    expect(p.difficulty).toBeNull();
    expect(p.seed).toBeNull();
    expect(p.speed).toBe(1);
    expect(p.quality).toBeNull();
    expect(p.skipMenu).toBe(false);
    expect(p.auto).toBe(false);
  });

  it('种子取整为 32 位无符号数，倍率有上下限', () => {
    expect(parseDebugParams('?seed=-7.9').seed).toBe(7);
    expect(parseDebugParams('?seed=4294967301').seed).toBe(5);
    expect(parseDebugParams('?speed=9999').speed).toBe(MAX_SPEED);
    expect(parseDebugParams('?speed=0.01').speed).toBe(0.1);
    expect(parseDebugParams('?speed=2.5').speed).toBe(2.5);
  });

  it('hash 里可以写同样的键值，查询串优先', () => {
    expect(parseDebugParams('', '#skipmenu=1&hero=yeque&speed=4')).toMatchObject({ skipMenu: true, hero: 'yeque', speed: 4 });
    expect(parseDebugParams('?hero=panyue', '#hero=yeque&auto=1')).toMatchObject({ hero: 'panyue', auto: true });
  });

  it('单词 hash 当作开关，#demo = 跳过菜单 + 托管', () => {
    expect(parseDebugParams('', '#auto')).toMatchObject({ auto: true, skipMenu: false });
    expect(parseDebugParams('', '#fps')).toMatchObject({ showFps: true });
    expect(parseDebugParams('', '#demo')).toMatchObject({ auto: true, skipMenu: true });
    expect(parseDebugParams('', '#')).toMatchObject({ auto: false, skipMenu: false });
    // 宿主自己的锚点名不应误触发任何开关
    expect(parseDebugParams('', '#section-2')).toEqual(parseDebugParams(''));
  });
});
