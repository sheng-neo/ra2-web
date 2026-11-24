/**
 * 可增长的顶点/索引数组：按块累积几何，最后一次性拼成 BufferGeometry。
 * 第 0 个属性固定是 position（three 坐标，米），其余按 layout 声明。
 */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

export interface AttrSpec {
  readonly name: string;
  readonly size: number;
}

export class MeshArrays {
  readonly data: number[][];
  readonly index: number[] = [];

  constructor(readonly layout: readonly AttrSpec[]) {
    if (layout[0]?.name !== 'position' || layout[0].size !== 3) {
      throw new Error('MeshArrays: 第一个属性必须是 position(3)');
    }
    this.data = layout.map(() => []);
  }

  get vertexCount(): number {
    return this.data[0]!.length / 3;
  }

  get triangleCount(): number {
    return this.index.length / 3;
  }

  /** 按 layout 顺序写入一个顶点的全部分量，返回顶点下标。 */
  push(values: ArrayLike<number>): number {
    const id = this.vertexCount;
    let k = 0;
    for (let a = 0; a < this.layout.length; a++) {
      const arr = this.data[a]!;
      const size = this.layout[a]!.size;
      for (let c = 0; c < size; c++) arr.push(values[k++]!);
    }
    return id;
  }

  tri(a: number, b: number, c: number): void {
    this.index.push(a, b, c);
  }
}

/** 一个子块在合并几何里的索引区间与包围球（用于单独视锥剔除）。 */
export interface DrawRange {
  start: number;
  count: number;
  sphere: Sphere;
}

function sphereOf(pos: Float32Array, from: number, to: number): Sphere {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  for (let i = from; i < to; i++) {
    v.fromArray(pos, i * 3);
    min.min(v);
    max.max(v);
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  let r2 = 0;
  for (let i = from; i < to; i++) {
    v.fromArray(pos, i * 3);
    r2 = Math.max(r2, v.distanceToSquared(center));
  }
  return new Sphere(center, Math.sqrt(r2));
}

/**
 * 把若干块按顺序拼成一个几何体；每块的索引连续，返回各块 draw range。
 * 空块（无三角形）不产生 range，调用方按返回顺序对应非空块。
 */
export function mergeArrays(parts: readonly MeshArrays[]): { geometry: BufferGeometry; ranges: DrawRange[] } {
  const layout = parts[0]?.layout;
  if (!layout) throw new Error('mergeArrays: 没有输入');
  let vtx = 0;
  let idx = 0;
  for (const p of parts) {
    vtx += p.vertexCount;
    idx += p.index.length;
  }
  const geometry = new BufferGeometry();
  const buffers = layout.map((a) => new Float32Array(vtx * a.size));
  const index = vtx > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  const ranges: DrawRange[] = [];
  let vBase = 0;
  let iBase = 0;
  for (const p of parts) {
    layout.forEach((a, k) => buffers[k]!.set(p.data[k]!, vBase * a.size));
    for (let i = 0; i < p.index.length; i++) index[iBase + i] = p.index[i]! + vBase;
    if (p.index.length > 0) {
      ranges.push({
        start: iBase,
        count: p.index.length,
        sphere: sphereOf(buffers[0]!, vBase, vBase + p.vertexCount),
      });
    }
    vBase += p.vertexCount;
    iBase += p.index.length;
  }
  layout.forEach((a, k) => geometry.setAttribute(a.name, new BufferAttribute(buffers[k]!, a.size)));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.boundingSphere = vtx > 0 ? sphereOf(buffers[0]!, 0, vtx) : new Sphere();
  return { geometry, ranges };
}

/** 共享 GPU 缓冲、只画其中一段的子几何（属性对象相同，three 只上传一次）。 */
export function subGeometry(parent: BufferGeometry, range: DrawRange): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(parent.attributes)) g.setAttribute(name, attr);
  g.setIndex(parent.index);
  g.setDrawRange(range.start, range.count);
  g.boundingSphere = range.sphere;
  return g;
}
