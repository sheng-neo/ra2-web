import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PropBuilder, linearRGB } from './prop-geometry';
import { busGeometry, carGeometry } from './vehicles';
import { tramGeometry } from './tram/body'; // [r2:trams]

describe('PropBuilder', () => {
  it('盒子各面法线朝外、绕向与法线一致', () => {
    const b = new PropBuilder();
    b.box([0, 0, 0], [2, 1, 4], { alb: [0.5, 0.5, 0.5] }, {});
    const g = b.build();
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const idx = g.index!;
    expect(b.triangleCount).toBe(12);
    for (let t = 0; t < idx.count; t += 3) {
      const [a, c, d] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)].map((i) => new Vector3().fromBufferAttribute(pos, i));
      const face = c!.clone().sub(a!).cross(d!.clone().sub(a!)).normalize();
      const n = new Vector3().fromBufferAttribute(nrm, idx.getX(t));
      expect(face.dot(n)).toBeGreaterThan(0.99);
      // 面中心在盒子中心 (0, 0.5, 0) 的法线方向一侧
      const centre = a!.clone().add(c!).add(d!).multiplyScalar(1 / 3).sub(new Vector3(0, 0.5, 0));
      expect(centre.dot(n)).toBeGreaterThan(0);
    }
  });

  it('发光上下渐变：顶边亮、底边暗', () => {
    const b = new PropBuilder();
    b.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], { em: [1, 1, 1], emGrad: [0.2, 1] });
    const em = b.em;
    expect(em[0]).toBeCloseTo(0.2);
    expect(em[2 * 3]).toBeCloseTo(1);
  });

  it('linearRGB 与 three 的 sRGB → 线性一致', () => {
    expect(linearRGB('#ffffff')).toEqual([1, 1, 1]);
    expect(linearRGB('#000000')).toEqual([0, 0, 0]);
    expect(linearRGB('#808080')[0]).toBeCloseTo(0.2158, 3);
  });

  it('车辆三角形数在预算内（私家车 40–80、巴士 ≤ 150、电车 ≤ 160）', () => {
    const car = carGeometry().index!.count / 3;
    expect(car).toBeGreaterThanOrEqual(40);
    expect(car).toBeLessThanOrEqual(80);
    expect(busGeometry().index!.count / 3).toBeLessThanOrEqual(150);
    expect(tramGeometry({ lod: 1 }).index!.count / 3).toBeLessThanOrEqual(160); // [r2:trams] 远处一级（近处一级见 tram/tram.test.ts）
  });
});

describe('树（近 / 远两级）', () => {
  it('近处的树 4 团树冠、约 90 个三角形；远处的 ≤ 30；树冠底面法线朝下（吃街面暖光）', async () => {
    const { treeGeometry, farTreeGeometry } = await import('./trees');
    const near = treeGeometry();
    const t = near.index!.count / 3;
    expect(t).toBeGreaterThanOrEqual(80);
    expect(t).toBeLessThanOrEqual(100);
    expect(farTreeGeometry().index!.count / 3).toBeLessThanOrEqual(30);
    const n = near.getAttribute('normal');
    let down = 0;
    for (let i = 0; i < n.count; i++) if (n.getY(i) < -0.5) down++;
    expect(down).toBeGreaterThan(10);
  });
});
