import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { simMetresToThree, simToThree, simToThreeVec, threeToSim } from './coords';

describe('simToThree', () => {
  it('dm → 米，x 东、z 上、y 北 → three (x, z, −y)', () => {
    expect(simToThreeVec(10, 20, 30)).toEqual([1, 3, -2]);
    const out = [0, 0, 0, 0, 0];
    simToThree(-1234, 5678, 90, out, 2);
    expect(out[2]).toBeCloseTo(-123.4);
    expect(out[3]).toBeCloseTo(9);
    expect(out[4]).toBeCloseTo(-567.8);
  });

  it('scale = 1 时只换轴（方向向量）', () => {
    const out = [0, 0, 0];
    simToThree(0, 1, 0, out, 0, 1);
    expect(out).toEqual([0, 0, -1]);
  });

  it('北方在 three 的 −Z，东在 +X，上在 +Y', () => {
    // +0 归一掉 −0，便于逐项比较
    const v = (a: number[]) => a.map((x) => x + 0);
    expect(v(simMetresToThree(0, 100, 0))).toEqual([0, 0, -100]);
    expect(v(simMetresToThree(100, 0, 0))).toEqual([100, 0, 0]);
    expect(v(simMetresToThree(0, 0, 100))).toEqual([0, 100, 0]);
  });

  it('是真旋转：行列式 +1，叉积方向保持', () => {
    const ex = new Vector3(...simToThreeVec(1, 0, 0, 1));
    const ey = new Vector3(...simToThreeVec(0, 1, 0, 1));
    const ez = new Vector3(...simToThreeVec(0, 0, 1, 1));
    expect(new Matrix4().makeBasis(ex, ey, ez).determinant()).toBeCloseTo(1);
    expect(ex.clone().cross(ey).distanceTo(ez)).toBeCloseTo(0);
  });

  it('模拟里绕 z 逆时针 θ = three 里绕 +Y 转 θ', () => {
    const theta = 0.7;
    const sim = [Math.cos(theta), Math.sin(theta)];
    const v = new Vector3(...simToThreeVec(1, 0, 0, 1)).applyAxisAngle(new Vector3(0, 1, 0), theta);
    const expected = new Vector3(...simToThreeVec(sim[0]!, sim[1]!, 0, 1));
    expect(v.distanceTo(expected)).toBeCloseTo(0);
  });

  it('threeToSim 是逆换算', () => {
    const [x, y, z] = simToThreeVec(-4321, 8765, 123);
    const back = threeToSim(x, y, z);
    expect(back[0]).toBeCloseTo(-4321);
    expect(back[1]).toBeCloseTo(8765);
    expect(back[2]).toBeCloseTo(123);
  });
});
