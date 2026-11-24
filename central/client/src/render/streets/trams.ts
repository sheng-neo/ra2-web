/**
 * 电车（realism C6）：在两条主轨道上靠左行驶——每条轨道的行驶方向取「另一条轨道在行车方向右侧」。
 * 每方向约 130 m 一辆（德辅道中长镜头里同时看得见 2–3 辆，照片 10），7 m/s 匀速（位置只取决于 uTime，可复现）；到轨道尽头回到起点（两端都在数据范围边缘）。
 * 外形：通用双层电车 12.5 × 2.4 × 4.5 m，上下两排暖白车窗灯（0.6–0.9）、集电杆；
 * 车身 6 种纯色 + 浅色腰线，不写字、不用营运商的绿色涂装与任何广告。
 */
import { InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Camera } from 'three';
import type { FlatXY, Rail } from '@central/data';
import { simToThree } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import { cleanRing } from '../../geom/ring';
import { lightColour, type GlowBatch } from '../materials/lighting';
import { drapeResample } from '../ribbon';
import { lanePose, type Lane } from './lanes';
import { createPropMaterial } from './prop-material';
import { PropBuilder, linearRGB, outwardOnly, type V3 } from './prop-geometry';
import { lightV3 } from './vehicles';

/** 只在长于此（m）的轨道上跑电车（两条主线；支线、车厂线不跑）。 */
const MIN_TRACK_M = 1000;
export const TRAM_SPEED = 7;
export const TRAM_HEADWAY_M = 130;
export const TRAM_LEN_M = 12.5;
/** 各轨道第一辆车的相位（m）：让「街景」机位前方 60–250 m 内开场就有电车（见 trams.test.ts）。 */
export const TRAM_PHASE_M = 40;

/** 折线（dm）长度（m）。 */
function lengthM(pts: FlatXY): number {
  let s = 0;
  for (let i = 2; i < pts.length; i += 2) s += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
  return s / 10;
}

/**
 * 行驶方向（纯函数）：1 = 沿 pts，−1 = 逆 pts。取本轨道中点的前进方向，另一条轨道上最近点若在左侧，
 * 就逆 pts 行驶（让它落到右侧）：靠左行驶时，对向轨道总在右手边。
 */
export function tramDirection(track: FlatXY, other: FlatXY): 1 | -1 {
  const n = track.length >> 1;
  const i = Math.max(1, n >> 1);
  const ax = track[(i - 1) * 2]!;
  const ay = track[(i - 1) * 2 + 1]!;
  const bx = track[i * 2]!;
  const by = track[i * 2 + 1]!;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  let best = Infinity;
  let px = 0;
  let py = 0;
  for (let k = 0; k < other.length; k += 2) {
    const d = Math.hypot(other[k]! - mx, other[k + 1]! - my);
    if (d < best) {
      best = d;
      px = other[k]!;
      py = other[k + 1]!;
    }
  }
  const cross = (bx - ax) * (py - my) - (by - ay) * (px - mx);
  return cross > 0 ? -1 : 1;
}

export interface TramTrack {
  path: Pick<Lane, 'pts' | 'cum' | 'len'>;
  count: number;
}

/** 由电车轨道生成行驶路径（three 坐标，按行驶方向排列）。 */
export function tramTracks(rails: readonly Rail[], ground: HeightFn): TramTrack[] {
  const long = rails.filter((r) => r.kind === 'tram' && lengthM(r.pts) >= MIN_TRACK_M).map((r) => cleanRing(r.pts));
  const out: TramTrack[] = [];
  for (const t of long) {
    const others = long.filter((o) => o !== t);
    if (others.length === 0) continue;
    const dir = tramDirection(t, others[0]!);
    let pts = drapeResample(t, ground, 80);
    if (dir < 0) {
      const rev: FlatXY = [];
      for (let i = pts.length - 2; i >= 0; i -= 2) rev.push(pts[i]!, pts[i + 1]!);
      pts = rev;
    }
    const n = pts.length >> 1;
    const xyz = new Float32Array(n * 3);
    const v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      simToThree(pts[i * 2]!, pts[i * 2 + 1]!, ground(pts[i * 2]!, pts[i * 2 + 1]!) + 2, v);
      xyz.set(v, i * 3);
    }
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1]! + Math.hypot(xyz[i * 3]! - xyz[i * 3 - 3]!, xyz[i * 3 + 2]! - xyz[i * 3 - 1]!);
    const len = cum[n - 1]!;
    out.push({ path: { pts: xyz, cum, len }, count: Math.max(1, Math.round(len / TRAM_HEADWAY_M)) });
  }
  return out;
}

/** 第 k 辆车在时刻 t 的沿线位置（m）。 */
export function tramS(track: TramTrack, k: number, t: number): number {
  const L = track.path.len;
  const s = TRAM_PHASE_M + (k * L) / track.count + TRAM_SPEED * t;
  return ((s % L) + L) % L;
}

/** 车身颜色（主色、腰线）。 */
const LIVERIES: [string, string][] = [
  ['#7d2e35', '#d8c7ae'],
  ['#2d4870', '#c3cedd'],
  ['#b8862f', '#f0e2bc'],
  ['#5d3f78', '#d6c8e4'],
  ['#9c4a2c', '#ecd2bb'],
  ['#3b5f8a', '#dfe6ee'],
];

export function tramGeometry(): BufferGeometry {
  const b = new PropBuilder();
  const L = TRAM_LEN_M;
  const W = 2.4;
  const glass: V3 = [0.03, 0.03, 0.03];
  // 车厢灯：暖白、下沿（座椅、乘客）暗；比车身亮但不是一盏灯笼（契约 vehicleCabin 0.4–1.0）
  const lowWin = lightV3('shopWarm', 0.5);
  const upWin = lightV3('shopWarm', 0.6);
  b.box([0, 0.35, 0], [L, 0.8, W], { part: 1 }, { bottom: { alb: [0.02, 0.02, 0.02] } });
  b.box([0, 1.15, 0], [L, 0.95, W], { part: 3, alb: glass, em: lowWin, emGrad: [0.15, 1.2] }, { bottom: null, top: null });
  b.box([0, 2.1, 0], [L, 0.55, W], { part: 2 }, { bottom: null, top: null });
  b.box([0, 2.65, 0], [L, 1.0, W], { part: 3, alb: glass, em: upWin, emGrad: [0.15, 1.2] }, { bottom: null, top: null });
  b.box([0, 3.65, 0], [L, 0.5, W], { part: 1 }, { bottom: null }, [0.97, 0.85]);
  // 窗柱
  for (const y0 of [1.15, 2.65]) {
    for (let k = 1; k < 11; k++) {
      const x = -L / 2 + (k * L) / 11;
      for (const z of [W / 2 + 0.01, -W / 2 - 0.01]) b.box([x, y0, z], [0.16, y0 > 2 ? 1.0 : 0.95, 0.02], { part: 1 }, outwardOnly(z));
    }
  }
  // 集电杆：从车顶后部斜向前上方（两片细长四边形）
  const dark = { alb: linearRGB('#202224') };
  const x0 = -2.5;
  const x1 = 1.2;
  const y0 = 4.15;
  const y1 = 6.1;
  b.quad([x0, y0, -0.04], [x1, y1, -0.04], [x1, y1, 0.04], [x0, y0, 0.04], dark);
  b.quad([x0, y0, 0.04], [x1, y1, 0.04], [x1, y1, -0.04], [x0, y0, -0.04], dark);
  b.box([x0, 4.15, 0], [0.5, 0.15, 0.5], dark, { bottom: null });
  return b.build();
}

const HEAD = lightColour('headlight');
const TAIL = lightColour('tailLight');

export class Trams {
  readonly mesh: InstancedMesh;
  private readonly body: InstancedBufferAttribute;
  private readonly band: InstancedBufferAttribute;
  private readonly emit: InstancedBufferAttribute;
  private readonly total: number;
  private readonly pose = { x: 0, y: 0, z: 0, hx: 1, hz: 0 };
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);

  constructor(readonly tracks: readonly TramTrack[]) {
    this.total = tracks.reduce((a, t) => a + t.count, 0);
    const cap = Math.max(this.total, 1);
    const geo = tramGeometry();
    this.body = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.band = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.emit = new InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
    geo.setAttribute('iBody', this.body);
    geo.setAttribute('iBand', this.band);
    geo.setAttribute('iEmit', this.emit);
    let i = 0;
    for (const t of tracks) {
      for (let k = 0; k < t.count; k++, i++) {
        const [a, b] = LIVERIES[(i * 5 + 1) % LIVERIES.length]!;
        this.body.setXYZ(i, ...linearRGB(a));
        this.band.setXYZ(i, ...linearRGB(b));
      }
    }
    this.mesh = new InstancedMesh(geo, createPropMaterial({ instanceColours: true, warmth: 0.4 }), cap);
    this.mesh.name = 'trams';
    this.mesh.count = this.total;
    this.mesh.frustumCulled = false;
  }

  get count(): number {
    return this.total;
  }

  /** 时刻 t 的全部电车；车灯从 start 起写进 lights，返回下一个下标。 */
  write(t: number, camera: Camera, lights: GlowBatch, start: number): number {
    let i = 0;
    let li = start;
    const cam = camera.position;
    for (const tr of this.tracks) {
      for (let k = 0; k < tr.count; k++, i++) {
        const s = tramS(tr, k, t);
        lanePose(tr.path, s, this.pose);
        const { x, y, z, hx, hz } = this.pose;
        this.q.setFromAxisAngle(this.up, Math.atan2(-hz, hx));
        this.m.compose(this.p.set(x, y - 2, z), this.q, this.one);
        this.mesh.setMatrixAt(i, this.m);
        const dx = cam.x - x;
        const dz = cam.z - z;
        const facing = (hx * dx + hz * dz) / (Math.hypot(dx, dz) || 1);
        const headK = 0.1 + 0.9 * Math.max(0, Math.min(1, (facing + 0.25) / 0.85));
        const tailK = 0.1 + 0.9 * Math.max(0, Math.min(1, (-facing + 0.25) / 0.85));
        const half = TRAM_LEN_M / 2;
        lights.set(li++, [x + hx * half, y - 2 + 0.9, z + hz * half], HEAD, 8 * headK, 0.14);
        for (const side of [-1, 1]) {
          lights.set(li++, [x - hx * half - hz * 0.9 * side, y - 2 + 1.0, z - hz * half + hx * 0.9 * side], TAIL, 2 * tailK, 0.1);
        }
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return li;
  }
}
