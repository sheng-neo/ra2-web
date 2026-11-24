import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { APRON_DM, reliefHeight } from '../data/terrain';
import { reliefGeometry } from './ground';

// 4 × 3 节点、10 m 网格；西列是海（0），其余陆地随东向升高
const GRID = {
  x0: 0,
  y0: 0,
  cell: 100,
  nx: 4,
  ny: 3,
  heights: Int16Array.from([0, 20, 40, 60, 0, 20, 40, 60, 0, 20, 40, 60]),
};

describe('reliefGeometry', () => {
  it('只输出有陆地角的格子；地表与裙坡三角形都朝上，裙坡外圈落到 0', () => {
    const g = reliefGeometry(GRID);
    const pos = g.getAttribute('position');
    const idx = g.index!;
    let inGrid = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const p = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, idx.getX(t + k)));
      const n = p[1]!.clone().sub(p[0]!).cross(p[2]!.clone().sub(p[0]!));
      if (n.length() < 1e-9) continue; // 圆角处的退化三角形
      expect(n.y).toBeGreaterThan(0);
      // three 坐标：x = 东（米），z = −北（米）；网格范围 x ∈ [0, 30]、z ∈ [−20, 0]
      if (p.every((q) => q.x >= -1e-6 && q.x <= 30 + 1e-6 && q.z <= 1e-6 && q.z >= -20 - 1e-6)) inGrid++;
    }
    // 3 × 2 格全部有陆地角 → 12 个地表三角形
    expect(inGrid).toBe(12);
    let far = 0;
    for (let k = 0; k < pos.count; k++) {
      if (pos.getX(k) > 30 + APRON_DM / 10 - 1e-3) {
        expect(pos.getY(k)).toBeCloseTo(0, 6);
        far++;
      }
    }
    expect(far).toBeGreaterThan(0);
  });

  it('网格顶点高度与 reliefHeight 在同一三角剖分上一致', () => {
    const g = reliefGeometry(GRID);
    const pos = g.getAttribute('position');
    const height = reliefHeight(GRID);
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      expect(height(pos.getX(k) * 10, -pos.getZ(k) * 10)).toBeCloseTo(y * 10, 3);
    }
  });
});
