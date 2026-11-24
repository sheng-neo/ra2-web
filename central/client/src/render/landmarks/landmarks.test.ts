import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { LandmarkPlacement } from '@central/data';
import { flatGround } from '../../data/terrain';
import { newFacadeArrays } from '../facade';
import { newNeonArrays } from '../materials/neon';
import { newSolidArrays } from '../materials/solid';
import type { MeshArrays } from '../mesh-arrays';
import { LANDMARK_BUILDERS } from './index';
import { Placement, type LandmarkSink } from './kit';

function placement(id: string, rot: number): LandmarkPlacement {
  // 50 m × 50 m 方形轮廓，中心 (1000, 2000) dm，高 300 m
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const outer: number[] = [];
  for (const [x, y] of [
    [-250, -250],
    [250, -250],
    [250, 250],
    [-250, 250],
  ] as const) {
    outer.push(1000 + x * c - y * s, 2000 + x * s + y * c);
  }
  return { id, name: { zh: '測試', en: 'Test' }, x: 1000, y: 2000, rot, base: 0, height: 3000, footprint: { outer }, replaces: [] };
}

/** 三角形几何法线与顶点法线同向（正面朝外）。 */
function windingOk(m: MeshArrays): boolean {
  const pos = m.data[0]!;
  const nrm = m.data[1]!;
  for (let t = 0; t < m.index.length; t += 3) {
    const [a, b, c] = [m.index[t]!, m.index[t + 1]!, m.index[t + 2]!];
    const pa = new Vector3().fromArray(pos, a * 3);
    const face = new Vector3().fromArray(pos, b * 3).sub(pa).cross(new Vector3().fromArray(pos, c * 3).sub(pa));
    if (face.lengthSq() < 1e-12) continue;
    if (face.normalize().dot(new Vector3().fromArray(nrm, a * 3)) < 0.99) return false;
  }
  return true;
}

describe('landmark builders', () => {
  for (const [id, build] of Object.entries(LANDMARK_BUILDERS)) {
    it(`${id}：生成非空几何，绕向与法线一致，高度不超过 placement.height`, () => {
      for (const rot of [0, 0.7, -2.1]) {
        const sink: LandmarkSink = { facade: newFacadeArrays(), solid: newSolidArrays(), neon: newNeonArrays() };
        const p = new Placement(placement(id, rot), flatGround, []);
        expect(p.hx).toBeCloseTo(25);
        expect(p.hy).toBeCloseTo(25);
        build(p, sink);
        expect(sink.facade.triangleCount).toBeGreaterThan(0);
        expect(windingOk(sink.facade)).toBe(true);
        expect(windingOk(sink.solid)).toBe(true);
        const ys = [sink.facade, sink.solid, sink.neon].flatMap((m) => m.data[0]!.filter((_, i) => i % 3 === 1));
        expect(Math.max(...ys)).toBeLessThanOrEqual(300 + 1e-3);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1);
      }
    });
  }

  it('敏感区内的地标退化成无窗灰体、不出霓虹', () => {
    const pl = placement('neon-centre', 0);
    const zone = { id: 'z', kind: 'military' as const, area: { outer: [0, 0, 3000, 0, 3000, 4000, 0, 4000] } };
    const sink: LandmarkSink = { facade: newFacadeArrays(), solid: newSolidArrays(), neon: newNeonArrays() };
    LANDMARK_BUILDERS['neon-centre']!(new Placement(pl, flatGround, [zone]), sink);
    expect(sink.neon.vertexCount).toBe(0);
    const styles = sink.facade.data[2]!.filter((_, i) => i % 4 === 3);
    expect(styles.every((s) => Math.floor(s / 256) === 1)).toBe(true);
  });
});
