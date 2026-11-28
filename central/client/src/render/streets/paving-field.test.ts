import { describe, expect, it } from 'vitest';
import type { Road } from '@central/data';
import { pavingKindOf } from '../roads';
import { PAVE_CELL_M, pavingGrid } from './paving-field';
import { markBusyPaths } from './streetlife';
import type { WalkPath } from '../people/walkways';

const road = (en: string): Road => ({ id: en, cls: 'secondary', pts: [], oneway: 0, lanes: 2, name: { en, zh: '' } }) as unknown as Road;

describe('人行道铺地种类（R4 route-facts §8）', () => {
  it('德辅道中 / 西 = 陶土砖，金钟道 / 轩尼诗道 = 人字砖，其余 = 0', () => {
    expect(pavingKindOf(road('Des Voeux Road Central'))).toBe(1);
    expect(pavingKindOf(road('Des Voeux Road West'))).toBe(1);
    expect(pavingKindOf(road('Queensway'))).toBe(2);
    expect(pavingKindOf(road('Hennessy Road'))).toBe(2);
    expect(pavingKindOf(road("Queen's Road Central"))).toBe(0);
    expect(pavingKindOf({ name: null })).toBe(0);
  });

  it('种类格：沿街走向角、离中线超出范围的格为 0', () => {
    // 一条东西向的德辅道中（dm）：(0,0) → (1000,0)，车行道半宽 6 m、人行道 4 m
    const g = pavingGrid([{ road: road('Des Voeux Road Central'), pts: [0, 0, 1000, 0], hw: 60, pavL: [40, 40], pavR: [40, 40] }])!;
    expect(g).not.toBeNull();
    const at = (x: number, y: number) => {
      const gx = Math.floor((x - g.minX) / PAVE_CELL_M);
      const gy = Math.floor((y - g.minY) / PAVE_CELL_M);
      return [g.data[(gy * g.cols + gx) * 2]!, g.data[(gy * g.cols + gx) * 2 + 1]!];
    };
    expect(at(50, 9)[0]).toBe(1);
    expect(at(50, 9)[1]).toBe(0); // 东西向：角 0
    expect(at(50, 19.5)[0]).toBe(0);
    expect(pavingGrid([{ road: road('Lyndhurst Terrace'), pts: [0, 0, 100, 0], hw: 40, pavL: [20], pavR: [20] }])).toBeNull();
  });

  it('电车走廊上的走线按核心区密度（只改离街 ≤ 18 m 的）', () => {
    const path = (cx: number, cy: number, core = false): WalkPath => ({ id: 0, cls: 'main', core, pts: new Float64Array(), cum: new Float64Array(), len: 10, loop: true, side: 10, box: [cx - 5, cy - 1, cx + 5, cy + 1] });
    const paths = [path(-300, 10), path(-300, 40), path(-300, 0, true)];
    const n = markBusyPaths(paths, [{ road: road('Des Voeux Road Central'), pts: [-4000, 0, 0, 0] }]);
    expect(n).toBe(1);
    expect(paths.map((p) => p.core)).toEqual([true, false, true]);
  });
});
