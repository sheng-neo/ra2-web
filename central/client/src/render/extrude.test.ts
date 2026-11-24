import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { normalizeRing } from '../geom/ring';
import { extrudePrism } from './extrude';
import { newFacadeArrays } from './facade';
import type { MeshArrays } from './mesh-arrays';

function extrudeSquare(outer: number[], holes: number[][] = []) {
  const ring = normalizeRing({ outer, holes });
  if (!ring) throw new Error('bad ring');
  const m = newFacadeArrays();
  extrudePrism(m, { ...ring, bottom: 0, base: 0, top: 300, style: 0, uOffset: 0 });
  return m;
}

function vtx(m: MeshArrays, attr: number, i: number): Vector3 {
  return new Vector3().fromArray(m.data[attr]!, i * 3);
}

/** 每个三角形的几何法线（右手、逆时针为正面）必须与顶点法线同向。 */
function expectWindingMatchesNormals(m: MeshArrays): void {
  for (let t = 0; t < m.index.length; t += 3) {
    const [a, b, c] = [m.index[t]!, m.index[t + 1]!, m.index[t + 2]!];
    const pa = vtx(m, 0, a);
    const face = vtx(m, 0, b).sub(pa).cross(vtx(m, 0, c).sub(pa));
    expect(face.length()).toBeGreaterThan(0);
    expect(face.normalize().dot(vtx(m, 1, a))).toBeGreaterThan(0.99);
  }
}

describe('extrudePrism', () => {
  // 10 m × 10 m 正方形，逆时针（从上往下看）
  const square = [0, 0, 100, 0, 100, 100, 0, 100];

  it('单位正方形：4 面墙各 4 顶点 2 三角形 + 屋顶 4 顶点 2 三角形', () => {
    const m = extrudeSquare(square);
    expect(m.vertexCount).toBe(16 + 4);
    expect(m.triangleCount).toBe(8 + 2);
  });

  it('墙法线朝外、屋顶法线朝上，三角形绕向与法线一致', () => {
    const m = extrudeSquare(square);
    // three 坐标里正方形中心在 (5, *, −5)
    for (let i = 0; i < 16; i++) {
      const p = vtx(m, 0, i);
      const n = vtx(m, 1, i);
      const out = new Vector3(p.x - 5, 0, p.z + 5);
      expect(n.y).toBe(0);
      expect(n.dot(out)).toBeGreaterThan(0);
    }
    for (let i = 16; i < 20; i++) expect(vtx(m, 1, i).toArray().map((x) => x + 0)).toEqual([0, 1, 0]);
    expectWindingMatchesNormals(m);
  });

  it('顺时针输入会被归一，结果与逆时针相同', () => {
    const cw = [0, 0, 0, 100, 100, 100, 100, 0];
    const m = extrudeSquare(cw);
    expect(m.triangleCount).toBe(10);
    expectWindingMatchesNormals(m);
  });

  it('带洞：洞墙朝院子内', () => {
    const outer = [0, 0, 300, 0, 300, 300, 0, 300];
    const hole = [100, 100, 200, 100, 200, 200, 100, 200];
    const m = extrudeSquare(outer, [hole]);
    // 外墙 4 + 洞墙 4，每面 4 顶点；屋顶 8 顶点，带洞正方形环带 8 个三角形
    expect(m.vertexCount).toBe(32 + 8);
    expect(m.triangleCount).toBe(16 + 8);
    expectWindingMatchesNormals(m);
    for (let i = 16; i < 32; i++) {
      const p = vtx(m, 0, i);
      const n = vtx(m, 1, i);
      // 洞中心在 three (15, *, −15)，洞墙法线应指向洞中心
      expect(n.dot(new Vector3(15 - p.x, 0, -15 - p.z))).toBeGreaterThan(0);
    }
  });

  it('立面 u 沿周长累积（米），v 为离基准的高度', () => {
    const m = extrudeSquare(square);
    const fac = m.data[2]!;
    // 每面墙顶点序 a(底,u0) b(底,u1) c(顶,u1) d(顶,u0)；第 4 面墙末端 u = 周长 40 m
    expect(fac[0 * 4]).toBeCloseTo(0);
    expect(fac[13 * 4]).toBeCloseTo(40);
    expect(fac[2 * 4 + 1]).toBeCloseTo(30);
    expect(fac[2 * 4 + 2]).toBeCloseTo(30);
  });
});
