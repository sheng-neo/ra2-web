/**
 * 分块图层：同一材质的块按「区」（4×4 块）合并成一个几何体。
 * 相机远离时整区一次 draw call；靠近时拆回逐块子网格（共享 GPU 缓冲，只换 draw range），
 * 由 three 按块包围球做视锥剔除。这样全城鸟瞰也只有十来个 draw call。
 */
import { Box3, Group, Mesh, type Material, type Vector3 } from 'three';
import { regionOf, chunkKey, type ChunkCoord } from './chunks';
import { mergeArrays, subGeometry, type MeshArrays } from './mesh-arrays';

interface Region {
  whole: Mesh;
  leaves: Mesh[];
  box: Box3;
  near: boolean;
}

export class ChunkLayer {
  readonly group = new Group();
  private readonly regions: Region[] = [];

  constructor(name: string, chunks: Map<string, { coord: ChunkCoord; arrays: MeshArrays }>, material: Material) {
    this.group.name = name;
    const byRegion = new Map<string, { coord: ChunkCoord; arrays: MeshArrays }[]>();
    for (const c of chunks.values()) {
      if (c.arrays.index.length === 0) continue;
      const k = chunkKey(regionOf(c.coord));
      const list = byRegion.get(k) ?? [];
      list.push(c);
      byRegion.set(k, list);
    }
    for (const [key, list] of byRegion) {
      list.sort((a, b) => a.coord.cy - b.coord.cy || a.coord.cx - b.coord.cx);
      const { geometry, ranges } = mergeArrays(list.map((c) => c.arrays));
      geometry.computeBoundingBox();
      const whole = new Mesh(geometry, material);
      whole.name = `${name}@${key}`;
      whole.matrixAutoUpdate = false;
      const leaves = ranges.map((r, i) => {
        const m = new Mesh(subGeometry(geometry, r), material);
        m.name = `${name}@${chunkKey(list[i]!.coord)}`;
        m.matrixAutoUpdate = false;
        m.visible = false;
        return m;
      });
      this.group.add(whole, ...leaves);
      this.regions.push({ whole, leaves, box: geometry.boundingBox!.clone(), near: false });
    }
  }

  /** 相机到区包围盒的距离小于 nearM（米）时拆成逐块。 */
  update(camera: Vector3, nearM: number): void {
    for (const r of this.regions) {
      const near = r.box.distanceToPoint(camera) < nearM;
      if (near === r.near) continue;
      r.near = near;
      r.whole.visible = !near;
      for (const l of r.leaves) l.visible = near;
    }
  }

  get regionCount(): number {
    return this.regions.length;
  }

  get chunkCount(): number {
    return this.regions.reduce((n, r) => n + r.leaves.length, 0);
  }
}
