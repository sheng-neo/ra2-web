import { describe, expect, it } from 'vitest';
import { pointInFlat } from '../geom/ring';
import { FacadeMode, newFacadeArrays } from './facade';
import { addRooftops, planRooftop, type RooftopHost } from './rooftops';

function host(id: string, typology: string, heightM: number, outer = [0, 0, 400, 0, 400, 250, 0, 250]): RooftopHost {
  return {
    p: { b: { id, style: 7 }, ring: { outer, holes: [] }, cx: 200, cy: 125, base: 50, top: 50 + heightM * 10 },
    typology,
    rnd: 0.3,
    bldg: [3, 0.5, 5, 0],
  };
}

describe('屋顶机房 / 水箱', () => {
  it('矮于 20 m 或敏感区不加', () => {
    expect(planRooftop(host('a', 'office', 15)).boxes).toHaveLength(0);
    expect(planRooftop(host('a', 'sensitive', 80)).boxes).toHaveLength(0);
  });

  it('盒子四角都在轮廓内、在屋顶之上；覆盖屋顶面积 5–45 %', () => {
    let covered = 0;
    let n = 0;
    for (let i = 0; i < 100; i++) {
      const h = host(`b${i}`, i % 2 ? 'residential' : 'office', 30 + i);
      const { boxes, rings } = planRooftop(h);
      expect(boxes.length).toBeGreaterThan(0);
      rings.forEach((r, k) => {
        for (let j = 0; j < r.length; j += 2) expect(pointInFlat(h.p.ring.outer, r[j]!, r[j + 1]!)).toBe(true);
        covered += 4 * boxes[k]!.hu * boxes[k]!.hv;
      });
      n++;
    }
    const share = covered / (n * 400 * 250);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.45);
  });

  it('写进立面网格：模式 Plant、顶点都在楼顶附近及以上', () => {
    const m = newFacadeArrays();
    const h = host('c', 'residential', 60);
    addRooftops(m, h);
    expect(m.triangleCount).toBeGreaterThan(0);
    const styles = m.data[2]!.filter((_, i) => i % 4 === 3);
    expect(styles.every((s) => Math.floor(s / 256) === FacadeMode.Plant)).toBe(true);
    const ys = m.data[0]!.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(h.p.top / 10 - 0.3);
    expect(Math.max(...ys)).toBeLessThanOrEqual(h.p.top / 10 + 9.5);
  });

  it('确定性', () => {
    expect(planRooftop(host('d', 'office', 90))).toEqual(planRooftop(host('d', 'office', 90)));
  });
});
