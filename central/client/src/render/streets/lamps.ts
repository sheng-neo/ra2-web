/**
 * 路灯：全部灯头进一个静态 GlowBatch（山路上的灯连成等高线一样的灯链，见参考照 05/07）；
 * 灯杆 + 灯臂只在相机 ~350 m 内画（一个 InstancedMesh，相机移动 > 50 m 时重排）。
 * 灯位与路面 shader 的光斑来自同一组 RoadPlan 参数（lamp-placement.ts）。
 */
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Camera, type Material } from 'three';
import { simToThree } from '../../coords';
import type { GlowBatch } from '../materials/lighting';
import { lightColour } from '../materials/lighting';
import { HEAD_LED, HEAD_SODIUM } from '../materials/road';
import { centreZ, pointAt, type RoadPlan } from '../roads';
import { LAMP_DEDUPE_M, lampsAlong } from './lamp-placement';
import { createPropMaterial } from './prop-material';
import { PropBuilder, linearRGB } from './prop-geometry';

/** 一盏路灯（three 坐标，米）。 */
export interface StreetLamp {
  head: [number, number, number];
  pole: [number, number, number];
  /** 灯杆 → 灯头的水平方向（three xz，单位向量）。 */
  dirX: number;
  dirZ: number;
  headH: number;
  sodium: boolean;
  /** R4：暖白 LED 比例 0–1（与钠灯色线性混合，见 roads.ts LampPlan.warm）。 */
  warm?: number;
}

/** 全部路灯位置（已去重：不同道路的两盏灯头 < 12 m 时只留先到的一盏）。 */
export function streetLamps(plans: readonly RoadPlan[]): StreetLamp[] {
  const out: StreetLamp[] = [];
  const cell = LAMP_DEDUPE_M;
  const grid = new Map<string, number[]>();
  const v = [0, 0, 0];
  const w = [0, 0, 0];
  for (const p of plans) {
    const l = p.lamps;
    if (!l) continue;
    for (const lamp of lampsAlong(l.spacing, l.phase, l.pattern, p.len / 10)) {
      const c = pointAt(p.pts, p.along, lamp.s * 10);
      const nx = -c.ty * lamp.side;
      const ny = c.tx * lamp.side;
      const hx = c.x + nx * l.inset * 10;
      const hy = c.y + ny * l.inset * 10;
      // 去重（模拟坐标 m）
      const gx = Math.floor(hx / 10 / cell);
      const gy = Math.floor(hy / 10 / cell);
      let dup = false;
      for (let i = -1; i <= 1 && !dup; i++)
        for (let j = -1; j <= 1 && !dup; j++) {
          for (const k of grid.get(`${gx + i},${gy + j}`) ?? []) {
            const o = out[k]!;
            if (Math.hypot(o.head[0] - hx / 10, -o.head[2] - hy / 10) < cell) {
              dup = true;
              break;
            }
          }
        }
      if (dup) continue;
      const z = centreZ(p, lamp.s * 10);
      simToThree(hx, hy, z + l.headH * 10, v);
      simToThree(c.x + nx * l.poleLat * 10, c.y + ny * l.poleLat * 10, z, w);
      const key = `${gx},${gy}`;
      const list = grid.get(key);
      if (list) list.push(out.length);
      else grid.set(key, [out.length]);
      // 灯臂方向：从灯杆指向路中（three xz）
      const ax = v[0]! - w[0]!;
      const az = v[2]! - w[2]!;
      const al = Math.hypot(ax, az) || 1;
      out.push({
        head: [v[0]!, v[1]!, v[2]!],
        pole: [w[0]!, w[1]!, w[2]!],
        dirX: ax / al,
        dirZ: az / al,
        headH: l.headH,
        sodium: l.sodium,
        warm: l.warm ?? 0,
      });
    }
  }
  return out;
}

/** 灯头发光半径（m）。 */
const HEAD_RADIUS_M = 0.3;

/** 把灯头写进光点批（从 start 起），返回写到的下一个下标。 */
export function writeLampHeads(batch: GlowBatch, lamps: readonly StreetLamp[], start: number): number {
  const sodium = lightColour('sodium');
  const led = lightColour('ledWhite');
  let i = start;
  const warmC = new Color();
  for (const l of lamps) {
    const w = l.sodium ? 0 : (l.warm ?? 0);
    // 两个亮度归一（Y = 1）的颜色线性混合，结果仍是 Y = 1
    const c = w > 0 ? warmC.copy(led).lerp(sodium, w) : l.sodium ? sodium : led;
    batch.set(i++, l.head, c, l.sodium ? HEAD_SODIUM : HEAD_LED, HEAD_RADIUS_M);
  }
  return i;
}

/** 灯杆几何：10 m 高（按灯头高缩放），灯臂沿 +x 伸出 2 m，灯具在臂端朝下。 */
function poleGeometry() {
  const b = new PropBuilder();
  const metal = { alb: linearRGB('#3a3d40') };
  b.box([0, 0, 0], [0.22, 10, 0.22], metal, { bottom: null }, [0.6, 0.6]);
  b.box([1.0, 9.75, 0], [2.0, 0.12, 0.12], metal, { bottom: null, px: null, nx: null });
  // 灯具外壳（底面发光：在灯头精灵之外给近处一点实体感）
  b.box([2.0, 9.62, 0], [0.7, 0.18, 0.32], metal, { bottom: { alb: [0.1, 0.1, 0.1], em: [4, 3.6, 3] } });
  return b.build();
}

/** 相机附近才画的立柱类小物件（灯杆、交通灯杆、树）：一个 InstancedMesh，相机移动 > 50 m 时按距离重排。 */
export interface NearItem {
  /** 底部位置（three 坐标）。 */
  p: readonly [number, number, number];
  /** 局部 +x 转到的水平方向（three xz）。 */
  dirX: number;
  dirZ: number;
  /** 均匀缩放。 */
  scale: number;
  /** 竖向再乘的系数（树冠高矮不一），缺省 1。 */
  sy?: number;
}

export class NearProps {
  readonly mesh: InstancedMesh;
  private readonly last = new Vector3(Infinity, 0, 0);
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly p = new Vector3();
  private readonly s = new Vector3();

  constructor(
    geometry: BufferGeometry,
    material: Material,
    private readonly items: readonly NearItem[],
    private readonly radiusM: number,
    capacity: number,
    name: string,
    private readonly moveM = 50,
    /** 比这更近（米，三维距离）的不画：远近两级 LOD 的外一级用。 */
    private readonly innerM = 0,
  ) {
    this.mesh = new InstancedMesh(geometry, material, Math.max(capacity, 1));
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  update(camera: Camera): void {
    const c = camera.position;
    if (this.last.distanceToSquared(c) < this.moveM * this.moveM) return;
    this.last.copy(c);
    // 三维距离：鸟瞰（离地上千米）时不会把半径内的上千个小物件全画出来
    const r2 = this.radiusM * this.radiusM;
    const i2 = this.innerM * this.innerM;
    let n = 0;
    for (const it of this.items) {
      if (n >= this.mesh.instanceMatrix.count) break;
      const dx = it.p[0] - c.x;
      const dy = it.p[1] - c.y;
      const dz = it.p[2] - c.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2 || d2 < i2) continue;
      // 局部 +x 转到 (dirX, dirZ)：绕 y 轴转 atan2(−dirZ, dirX)
      this.q.setFromAxisAngle(this.up, Math.atan2(-it.dirZ, it.dirX));
      this.m.compose(this.p.set(it.p[0], it.p[1], it.p[2]), this.q, this.s.set(it.scale, it.scale * (it.sy ?? 1), it.scale));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** 相机附近的灯杆（一个 draw call）。 */
export function lampPoles(lamps: readonly StreetLamp[], radiusM: number, capacity: number): NearProps {
  const items = lamps.map((l) => ({ p: l.pole, dirX: l.dirX, dirZ: l.dirZ, scale: l.headH / 10 }));
  return new NearProps(poleGeometry(), createPropMaterial({ warmth: 0.4 }), items, radiusM, capacity, 'lamp-poles');
}
