import { describe, expect, it } from 'vitest';
import { createDirtyTracker as fromContracts } from '../../contracts/dirty';
import { createDirtyTracker } from './dirtyTracker';
import { createTestContext } from '../../testkit';

describe('sim/core/dirtyTracker（薄转发）', () => {
  it('与 contracts/dirty 的 createDirtyTracker 是同一实现', () => {
    expect(createDirtyTracker).toBe(fromContracts);
  });
  it('集成：ctx.act.set* 经 TileWriter 标脏 host.dirty；take 清空；layerChanged 置整层标志；newCity 后清空并置 all', () => {
    const { ctx, host } = createTestContext();
    host.dirty.take();                                    // 丢弃 createTestContext 置的 all
    expect(host.dirty.count).toBe(0);
    ctx.act.setXbld(100, 0x0e); ctx.act.setXzon(100, 0xf0); ctx.act.setXund(200, 0x10);
    expect(host.dirty.count).toBe(2);
    ctx.act.layerChanged('xmic');
    const c = host.dirty.take();
    expect(Array.from(c.tiles)).toEqual([100, 200]);
    expect(c.bulk.xmic).toBe(true); expect(c.bulk.all).toBe(false);
    expect(host.dirty.count).toBe(0);
    host.newCity({ name: 'Again', difficulty: 1, startYear: 1950, seed: 1, terrainSeed: 2, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } });
    expect(host.dirty.bulk.all).toBe(true);
    expect(host.dirty.count).toBe(0);
  });
});
