import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MeshBuilder, RANK_CASTER, RANK_HIGH, RANK_LOW, RANK_MAIN_ONLY, RANK_MEDIUM, type RGB, SceneryBatcher, applyRankRange, densityRank } from './geo';

const WHITE: RGB = [1, 1, 1];

/** 往构建器里写一个三角形(三个顶点的 x 都等于 tag，方便事后认出它是谁) */
function tri(b: MeshBuilder, tag: number): void {
  const a = b.vertex(tag, 0, 0, WHITE);
  const c = b.vertex(tag, 1, 0, WHITE);
  const d = b.vertex(tag, 0, 1, WHITE);
  b.tri(a, c, d);
}

/** 按绘制顺序读出每个三角形的 tag */
function order(geo: THREE.BufferGeometry): number[] {
  const idx = geo.index as THREE.BufferAttribute;
  const pos = geo.attributes.position;
  const out: number[] = [];
  for (let i = 0; i < idx.count; i += 3) out.push(pos.getX(idx.getX(i)));
  return out;
}

describe('MeshBuilder 的档位分段', () => {
  it('不设档位时全部是 CASTER，主通道与阴影通道都画全部', () => {
    const b = new MeshBuilder();
    tri(b, 1);
    tri(b, 2);
    const geo = b.build();
    expect(geo.userData.rankEnds).toEqual([0, 6, 6, 6, 6]);
    expect(order(geo)).toEqual([1, 2]);
  });

  it('按档位把索引排成连续的几段，段内保持原顺序', () => {
    const b = new MeshBuilder();
    b.setRank(RANK_HIGH);
    tri(b, 30);
    b.setRank(RANK_CASTER);
    tri(b, 0);
    b.setRank(RANK_MAIN_ONLY);
    tri(b, -1);
    b.setRank(RANK_MEDIUM);
    tri(b, 20);
    b.setRank(RANK_LOW);
    tri(b, 10);
    b.setRank(RANK_CASTER);
    tri(b, 1);
    const geo = b.build();
    expect(order(geo)).toEqual([-1, 0, 1, 10, 20, 30]);
    // 各段终点：只进主通道 / CASTER / LOW / MEDIUM / HIGH
    expect(geo.userData.rankEnds).toEqual([3, 9, 12, 15, 18]);
  });

  it('applyRankRange：主通道画到所选档位，阴影通道跳过「只进主通道」的那段并止于阴影档位', () => {
    const b = new MeshBuilder();
    for (const [rank, tag] of [
      [RANK_MAIN_ONLY, -1],
      [RANK_CASTER, 0],
      [RANK_LOW, 10],
      [RANK_MEDIUM, 20],
      [RANK_HIGH, 30],
    ]) {
      b.setRank(rank);
      tri(b, tag);
    }
    const mesh = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial());
    mesh.castShadow = true;
    const shadowRange = (): [number, number] => {
      const call = mesh.onBeforeShadow as unknown as () => void;
      const done = mesh.onAfterShadow as unknown as () => void;
      call();
      const r: [number, number] = [mesh.geometry.drawRange.start, mesh.geometry.drawRange.count];
      done();
      return r;
    };
    // low：主通道到 LOW 为止
    applyRankRange(mesh, RANK_LOW, RANK_CASTER);
    expect([mesh.geometry.drawRange.start, mesh.geometry.drawRange.count]).toEqual([0, 9]);
    // medium：主通道到 MEDIUM，阴影只画 CASTER 那一段
    applyRankRange(mesh, RANK_MEDIUM, RANK_CASTER);
    expect([mesh.geometry.drawRange.start, mesh.geometry.drawRange.count]).toEqual([0, 12]);
    expect(shadowRange()).toEqual([3, 3]);
    expect([mesh.geometry.drawRange.start, mesh.geometry.drawRange.count]).toEqual([0, 12]);
    // high：全部；阴影从 CASTER 画到 HIGH
    applyRankRange(mesh, RANK_HIGH, RANK_HIGH);
    expect([mesh.geometry.drawRange.start, mesh.geometry.drawRange.count]).toEqual([0, 15]);
    expect(shadowRange()).toEqual([3, 12]);
  });

  it('SceneryBatcher：投影组缺省 CASTER、不投影组缺省 LOW；rank 选项生效', () => {
    const batch = new SceneryBatcher(32);
    const proto = new MeshBuilder();
    tri(proto, 0);
    const geo = proto.build();
    const m = new THREE.Matrix4();
    batch.add(geo, m, { rank: RANK_HIGH });
    batch.add(geo, m);
    batch.add(geo, m, { shadow: false });
    batch.add(geo, m, { shadow: false, rank: RANK_MEDIUM });
    const parent = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    const meshes = batch.build(mat, mat, parent, 't');
    const caster = meshes.find((x) => x.castShadow) as THREE.Mesh;
    const clutter = meshes.find((x) => !x.castShadow) as THREE.Mesh;
    expect(caster.geometry.userData.rankEnds).toEqual([0, 3, 3, 3, 6]);
    expect(clutter.geometry.userData.rankEnds).toEqual([0, 0, 3, 6, 6]);
  });

  it('densityRank：同一位置结果稳定，三档的占比接近给定份额', () => {
    const count = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) {
      const x = ((i * 37) % 113) - 56 + i * 0.013;
      const z = ((i * 91) % 109) - 54 - i * 0.007;
      const r = densityRank(x, z);
      expect(densityRank(x, z)).toBe(r);
      count[r]++;
    }
    expect(count[RANK_LOW] / 4000).toBeGreaterThan(0.39);
    expect(count[RANK_LOW] / 4000).toBeLessThan(0.51);
    expect(count[RANK_MEDIUM] / 4000).toBeGreaterThan(0.24);
    expect(count[RANK_MEDIUM] / 4000).toBeLessThan(0.36);
    expect(count[RANK_HIGH] / 4000).toBeGreaterThan(0.19);
  });
});
