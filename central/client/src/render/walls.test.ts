import { describe, expect, it } from 'vitest';
import { reliefHeight } from '../data/terrain';
import { lowestAlongRings, planWallCuts, visibleSpans } from './walls';

describe('lowestAlongRings', () => {
  it('取到两顶点之间的地形凹陷，而不只是顶点', () => {
    // 3 × 3 节点、10 m 网格：中间一列凹下去 4 m，四角都在 10 m
    const grid = { x0: 0, y0: 0, cell: 100, nx: 3, ny: 3, heights: Int16Array.from([100, 60, 100, 100, 60, 100, 100, 60, 100]) };
    const ground = reliefHeight(grid);
    // 顶点都在 x = 0 与 x = 200 上（地面 10 m），南北两条边横跨 x = 100 的凹槽
    const square = [0, 0, 200, 0, 200, 200, 0, 200];
    expect(lowestAlongRings([square], ground)).toBeCloseTo(60, 6);
  });
});

describe('planWallCuts / visibleSpans', () => {
  // 裙楼 20 m × 10 m、高 12 m；塔楼占裙楼西半，西、南、北三边与裙楼外边重合，高 80 m
  const podium = { rings: [[0, 0, 200, 0, 200, 100, 0, 100]], bottom: -5, top: 120 };
  const tower = { rings: [[0, 0, 100, 0, 100, 100, 0, 100]], bottom: -5, top: 800 };

  it('裙楼在重合段上让出被塔楼覆盖的高度，塔楼的墙一面不少', () => {
    const cutsOf = planWallCuts([podium, tower]);
    for (let e = 0; e < 4; e++) expect(cutsOf(1, 0, e)).toBeUndefined();
    // 裙楼南边（第 0 条）的西半段、北边（第 2 条，自东向西）的西半段、西边（第 3 条）整条
    expect(cutsOf(0, 0, 0)).toEqual([{ s0: 0, s1: 100, z0: -5, z1: 120 }]);
    expect(cutsOf(0, 0, 2)).toEqual([{ s0: 100, s1: 200, z0: -5, z1: 120 }]);
    expect(cutsOf(0, 0, 3)).toEqual([{ s0: 0, s1: 100, z0: -5, z1: 120 }]);
    expect(cutsOf(0, 0, 1)).toBeUndefined();
    expect(visibleSpans(200, -5, 120, cutsOf(0, 0, 0)!)).toEqual([{ s0: 100, s1: 200, z0: -5, z1: 120 }]);
    expect(visibleSpans(100, -5, 120, cutsOf(0, 0, 3)!)).toEqual([]);
  });

  it('高的楼墙底更高时，矮楼只保留它下面那一截', () => {
    const raised = { ...tower, bottom: 40 };
    const cutsOf = planWallCuts([podium, raised]);
    expect(visibleSpans(100, -5, 120, cutsOf(0, 0, 3)!)).toEqual([{ s0: 0, s1: 100, z0: -5, z1: 40 }]);
  });

  it('朝向相反（背靠背的共用墙）或错开超过 1 dm 的边不算共面', () => {
    const east = { rings: [[200, 0, 300, 0, 300, 100, 200, 100]], bottom: -5, top: 400 };
    const shifted = { rings: [[0, -3, 100, -3, 100, 100, 0, 100]], bottom: -5, top: 400 };
    const cutsOf = planWallCuts([podium, east, shifted]);
    expect(cutsOf(0, 0, 1)).toBeUndefined();
    // shifted 南边比裙楼南边偏 0.3 m，不去重；西边重合（0..100 段）照常去重
    expect(cutsOf(0, 0, 0)).toBeUndefined();
    expect(cutsOf(0, 0, 3)).toEqual([{ s0: 0, s1: 100, z0: -5, z1: 120 }]);
  });

  it('visibleSpans：多段 cut 叠加后按段扣除高程', () => {
    const spans = visibleSpans(100, 0, 100, [
      { s0: 0, s1: 60, z0: 20, z1: 40 },
      { s0: 30, s1: 100, z0: 30, z1: 100 },
    ]);
    expect(spans).toEqual([
      { s0: 0, s1: 30, z0: 0, z1: 20 },
      { s0: 0, s1: 30, z0: 40, z1: 100 },
      { s0: 30, s1: 60, z0: 0, z1: 20 },
      { s0: 60, s1: 100, z0: 0, z1: 30 },
    ]);
  });
});
