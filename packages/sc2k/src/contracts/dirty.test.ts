import { describe, expect, it } from 'vitest';
import { TILES } from './grid';
import { BULK_LAYERS, createDirtyTracker } from './dirty';

const allFalse = { xbit: false, maps: false, xtxt: false, xthg: false, xmic: false, all: false };

describe('dirty: createDirtyTracker', () => {
  it('初始为空：count 0、全部整层标志为 false', () => {
    const t = createDirtyTracker();
    expect(t.count).toBe(0);
    expect(t.bulk).toEqual(allFalse);
    expect(BULK_LAYERS).toEqual(Object.keys(allFalse));
  });
  it('mark 去重：同一格多次 mark 只记一项，顺序 = 首次 mark 顺序', () => {
    const t = createDirtyTracker();
    t.mark(5); t.mark(5); t.mark(7); t.mark(5); t.mark(0); t.mark(TILES - 1);
    expect(t.count).toBe(4);
    const c = t.take();
    expect(Array.from(c.tiles)).toEqual([5, 7, 0, TILES - 1]);
    expect(c.tiles).toBeInstanceOf(Int32Array);
  });
  it('take 清空：之后 count 0、整层标志复位，再次 take 为空；同一格可再次 mark', () => {
    const t = createDirtyTracker();
    t.mark(42); t.markBulk('maps');
    const first = t.take();
    expect(Array.from(first.tiles)).toEqual([42]);
    expect(first.bulk.maps).toBe(true);
    expect(t.count).toBe(0);
    expect(t.bulk).toEqual(allFalse);
    expect(t.take().tiles).toHaveLength(0);
    t.mark(42);
    expect(t.count).toBe(1);
    expect(Array.from(t.take().tiles)).toEqual([42]);
  });
  it('take 返回的 tiles 是内部列表的 subarray 视图（下次 mark 前有效）', () => {
    const t = createDirtyTracker();
    t.mark(1); t.mark(2);
    const view = t.take().tiles;
    expect(view.length).toBe(2);
    t.mark(9);                                   // 覆盖列表头 → 视图内容随之改变，这是契约允许的
    expect(view[0]).toBe(9);
  });
  it('take 返回的 bulk 是拷贝：之后 markBulk 不影响已返回对象；bulk getter 为实时视图', () => {
    const t = createDirtyTracker();
    t.markBulk('xbit');
    expect(t.bulk.xbit).toBe(true);
    const c = t.take();
    t.markBulk('all');
    expect(c.bulk).toEqual({ ...allFalse, xbit: true });
    expect(t.bulk.all).toBe(true);
    expect(t.bulk.xbit).toBe(false);
  });
  it('clear 等价于 take 的清空部分', () => {
    const t = createDirtyTracker();
    t.mark(3); t.mark(4); t.markBulk('xtxt');
    t.clear();
    expect(t.count).toBe(0);
    expect(t.bulk).toEqual(allFalse);
    t.mark(3);
    expect(Array.from(t.take().tiles)).toEqual([3]);
  });
  it('越界 / 非法索引被忽略', () => {
    const t = createDirtyTracker();
    t.mark(-1); t.mark(TILES); t.mark(Number.NaN); t.mark(Number.POSITIVE_INFINITY);
    expect(t.count).toBe(0);
  });
  it('全图 16384 格各 mark 两次：恰 16384 项，升序', () => {
    const t = createDirtyTracker();
    for (let i = 0; i < TILES; i++) { t.mark(i); t.mark(i); }
    expect(t.count).toBe(TILES);
    const tiles = t.take().tiles;
    expect(tiles.length).toBe(TILES);
    for (let i = 0; i < TILES; i++) expect(tiles[i]).toBe(i);
    expect(t.count).toBe(0);
  });
});
