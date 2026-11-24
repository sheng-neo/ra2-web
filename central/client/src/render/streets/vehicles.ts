/**
 * 车辆外形与车灯（realism C5）：私家车 / 出租车一个 InstancedMesh、巴士一个 InstancedMesh（车身共 2 个 draw call），
 * 车灯全部进一个动态 GlowBatch（1 个 draw call）。
 * - 私家车 4.5 × 1.8 × 1.5 m：车轮、底裙、倒角车身、收顶玻璃车舱、尾灯带与日行灯带，约 64 个三角形；车色多为深色 / 银 / 白。
 * - 出租车：法定红色车身 #c41e1e、银色车顶、车顶空白白色顶灯（不写字）。
 * - 巴士：通用双层（12 × 2.55 × 4.4 m），浅灰车身配石板灰色腰线（不用任何营运商涂装），
 *   上下层车窗带冷白车厢灯（0.6–0.8），车头上方橙色 LED 路线牌（只有光点、没有文字）。
 * - 车灯：头灯白（6–12，半径 0.12 m，左右相距 1.4 m，高 0.7 m），尾灯红（1.5–3，刹车 / 停车时取上限），
 *   亮度按车头 / 车尾是否朝向相机调整（从车后看不到头灯）。
 * 几何局部坐标：车头朝 +x，y 向上，z 为车宽方向。
 */
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Camera,
} from 'three';
import { lightColour, type GlowBatch } from '../materials/lighting';
import { hash32 } from './lamp-placement';
import { createPropMaterial } from './prop-material';
import { PropBuilder, outwardOnly, scale3, type V3 } from './prop-geometry';

const GLASS: V3 = [0.02, 0.022, 0.026];

/** 光源色（亮度归一）× 亮度，作为顶点发光。 */
export function lightV3(name: string, k: number): V3 {
  const c = lightColour(name);
  return scale3([c.r, c.g, c.b], k);
}

/** 四个车轮（暗色方块，只画外侧面与前后面）：x 为前后轴位置，半宽 hw，轮径 d。 */
function wheels(b: PropBuilder, axles: readonly number[], hw: number, d: number, w: number): void {
  const tyre = { alb: [0.012, 0.012, 0.013] as V3 };
  for (const x of axles) {
    for (const z of [hw - w / 2, -hw + w / 2]) {
      const out = z > 0 ? { bottom: null, top: null, nz: null } : { bottom: null, top: null, pz: null };
      b.box([x, 0, z], [d, d, w], tyre, out);
    }
  }
}

/**
 * 私家车 / 出租车（通用外形，不仿任何厂牌）：暗色底裙 + 四个车轮、倒角的下车身、收顶的玻璃车舱（深色反光玻璃）、
 * 车尾一条横向尾灯带、车头一条日行灯带，约 64 个三角形。part 1 = 车身色，2 = 车顶色（出租车银色，其他同车身），
 * 4 = 出租车顶灯（不写字）。
 */
export function carGeometry(): BufferGeometry {
  const b = new PropBuilder();
  const body = { part: 1 };
  const dark = { alb: [0.014, 0.014, 0.016] as V3 };
  // 车轮外侧比车身宽出 2 cm：侧面看得到深色轮子（轮拱位置）
  wheels(b, [1.4, -1.35], 0.92, 0.64, 0.24);
  // 底裙（轮拱之间的暗带）
  b.box([0, 0.16, 0], [4.3, 0.2, 1.7], dark, { bottom: null, top: null });
  // 下车身：前后收窄（倒角）
  b.box([0, 0.36, 0], [4.5, 0.5, 1.8], body, { bottom: null }, [0.96, 0.95]);
  // 车舱：前挡、后挡都斜（收顶），侧窗深色玻璃，车顶 part 2
  b.box([-0.25, 0.86, 0], [2.5, 0.5, 1.64], { part: 3, alb: GLASS }, { bottom: null, top: { part: 2 } }, [0.72, 0.84]);
  // 尾灯带（车尾，红）与日行灯带（车头，冷白）：只画朝外的一面
  b.box([-2.17, 0.66, 0], [0.04, 0.1, 1.5], { alb: [0.05, 0.01, 0.01], em: lightV3('tailLight', 1.4) }, { bottom: null, top: null, px: null, pz: null, nz: null });
  b.box([2.17, 0.7, 0], [0.04, 0.06, 1.4], { alb: [0.3, 0.3, 0.3], em: lightV3('headlight', 1.2) }, { bottom: null, top: null, nx: null, pz: null, nz: null });
  b.box([-0.35, 1.36, 0], [0.5, 0.16, 0.28], { part: 4, alb: [0.8, 0.8, 0.78], em: [0.55, 0.55, 0.52] }, { bottom: null, px: null, nx: null });
  return b.build();
}

/** 通用双层巴士。part 1 = 车身，2 = 腰线。 */
export function busGeometry(): BufferGeometry {
  const b = new PropBuilder();
  const L = 12;
  const W = 2.55;
  const cabin = lightV3('tubeCool', 0.55);
  const cabinUp = lightV3('tubeCool', 0.65);
  const led = lightV3('#ff8a1e', 1.6);
  const win = (em: V3) => ({ part: 3, alb: GLASS, em, emGrad: [0.25, 1.15] as const });
  wheels(b, [L / 2 - 2.6, -L / 2 + 3.2], W / 2 + 0.01, 1.0, 0.3);
  b.box([0, 0.3, 0], [L, 0.75, W], { part: 1 }, { bottom: null });
  b.box([0, 1.05, 0], [L, 1.05, W], win(cabin), { bottom: null, top: null });
  b.box([0, 2.1, 0], [L, 0.5, W], { part: 2 }, { bottom: null, top: null });
  b.box([0, 2.6, 0], [L, 1.15, W], win(cabinUp), { bottom: null, top: null });
  b.box([0, 3.75, 0], [L, 0.55, W], { part: 1 }, { bottom: null }, [0.99, 0.95]);
  // 车窗立柱（两侧、两层）
  const post = { part: 1 };
  for (const y0 of [1.05, 2.6]) {
    for (let k = 1; k < 7; k++) {
      const x = -L / 2 + (k * L) / 7;
      for (const z of [W / 2 + 0.01, -W / 2 - 0.01]) b.box([x, y0, z], [0.14, y0 > 2 ? 1.15 : 1.05, 0.02], post, outwardOnly(z));
    }
  }
  // 路线牌：车头上层窗上方，橙色 LED（无文字）
  b.box([L / 2 + 0.01, 3.4, 0], [0.04, 0.3, 1.6], { alb: [0.02, 0.02, 0.02], em: led }, { bottom: null, top: null, nx: null });
  return b.build();
}

/** 私家车颜色（sRGB）：深色、银、白为主。 */
const CAR_COLOURS = ['#1b1c1e', '#2b2e33', '#3c4046', '#8b9096', '#a9adb1', '#d8dadb', '#e4e4e0', '#1e2a3c', '#4a1e22', '#2f3a2f'];
const TAXI_RED = '#c41e1e';
const TAXI_ROOF = '#b9bcbf';
const BUS_BODY = '#aeb3b6';
const BUS_BAND = '#4f5d66';

/** 车辆实例（一个 InstancedMesh）+ 实例颜色属性。 */
function instanced(geo: BufferGeometry, capacity: number, name: string): {
  mesh: InstancedMesh;
  body: InstancedBufferAttribute;
  band: InstancedBufferAttribute;
  emit: InstancedBufferAttribute;
} {
  const body = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const band = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const emit = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geo.setAttribute('iBody', body);
  geo.setAttribute('iBand', band);
  geo.setAttribute('iEmit', emit);
  const mesh = new InstancedMesh(geo, createPropMaterial({ instanceColours: true, warmth: 0.4 }), capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  return { mesh, body, band, emit };
}

export interface VehiclePose {
  x: number;
  y: number;
  z: number;
  /** 水平朝向（three xz 单位向量）。 */
  hx: number;
  hz: number;
  kind: number;
  /** 刹车 / 停车。 */
  brake: boolean;
  /** 颜色种子。 */
  seed: number;
}

const HEAD_COLOUR = lightColour('headlight');
const TAIL_COLOUR = lightColour('tailLight');

/** 车身实例与车灯。 */
export class VehicleRenderer {
  readonly cars: InstancedMesh;
  readonly buses: InstancedMesh;
  private readonly carAttr: ReturnType<typeof instanced>;
  private readonly busAttr: ReturnType<typeof instanced>;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly c = new Color();

  constructor(capCars: number, capBuses: number) {
    this.carAttr = instanced(carGeometry(), Math.max(capCars, 1), 'cars');
    this.busAttr = instanced(busGeometry(), Math.max(capBuses, 1), 'buses');
    this.cars = this.carAttr.mesh;
    this.buses = this.busAttr.mesh;
  }

  /**
   * 写一帧：poses 为全部车辆；lights 从 start 起写车灯，返回下一个下标。
   */
  write(poses: readonly VehiclePose[], camera: Camera, lights: GlowBatch, start: number, bodyM = Infinity): number {
    let nc = 0;
    let nb = 0;
    let li = start;
    const cam = camera.position;
    const body2 = bodyM * bodyM;
    for (const v of poses) {
      const bus = v.kind === 2;
      const a = bus ? this.busAttr : this.carAttr;
      // 车身只画相机 bodyM 米内的（更远的车只是几个像素，靠车灯光点就够）：三角形不随车数线性涨
      const ddx = v.x - cam.x;
      const ddy = v.y - cam.y;
      const ddz = v.z - cam.z;
      const nearBody = ddx * ddx + ddy * ddy + ddz * ddz < body2;
      const idx = nearBody ? (bus ? nb++ : nc++) : a.mesh.instanceMatrix.count;
      if (idx < a.mesh.instanceMatrix.count) {
      this.q.setFromAxisAngle(this.up, Math.atan2(-v.hz, v.hx));
      this.m.compose(this.p.set(v.x, v.y, v.z), this.q, this.one);
      a.mesh.setMatrixAt(idx, this.m);
      if (bus) {
        this.c.set(BUS_BODY);
        a.body.setXYZ(idx, this.c.r, this.c.g, this.c.b);
        this.c.set(BUS_BAND);
        a.band.setXYZ(idx, this.c.r, this.c.g, this.c.b);
        a.emit.setX(idx, 1);
      } else if (v.kind === 1) {
        this.c.set(TAXI_RED);
        a.body.setXYZ(idx, this.c.r, this.c.g, this.c.b);
        this.c.set(TAXI_ROOF);
        a.band.setXYZ(idx, this.c.r, this.c.g, this.c.b);
        a.emit.setX(idx, 1);
      } else {
        this.c.set(CAR_COLOURS[hash32(v.seed) % CAR_COLOURS.length]!);
        a.body.setXYZ(idx, this.c.r, this.c.g, this.c.b);
        a.band.setXYZ(idx, this.c.r, this.c.g, this.c.b);
        a.emit.setX(idx, 0);
      }
      }
      // 车灯：朝向相机的一端亮
      const half = bus ? 6 : 2.25;
      const dx = cam.x - v.x;
      const dz = cam.z - v.z;
      const dl = Math.hypot(dx, dz) || 1;
      const facing = (v.hx * dx + v.hz * dz) / dl;
      const headK = 0.1 + 0.9 * smooth(-0.25, 0.6, facing);
      const tailK = 0.1 + 0.9 * smooth(-0.25, 0.6, -facing);
      const sx = -v.hz;
      const sz = v.hx;
      const hw = bus ? 0.95 : 0.7;
      for (const side of [-1, 1]) {
        lights.set(li++, [v.x + v.hx * half + sx * hw * side, v.y + (bus ? 0.8 : 0.7), v.z + v.hz * half + sz * hw * side], HEAD_COLOUR, 9 * headK, 0.12);
        lights.set(
          li++,
          [v.x - v.hx * half + sx * (hw + 0.05) * side, v.y + (bus ? 1.0 : 0.85), v.z - v.hz * half + sz * (hw + 0.05) * side],
          TAIL_COLOUR,
          (v.brake ? 3 : 1.8) * tailK,
          0.1,
        );
      }
    }
    for (const [a, n] of [
      [this.carAttr, nc],
      [this.busAttr, nb],
    ] as const) {
      a.mesh.count = Math.min(n, a.mesh.instanceMatrix.count);
      a.mesh.visible = a.mesh.count > 0;
      a.mesh.instanceMatrix.needsUpdate = true;
      a.body.needsUpdate = true;
      a.band.needsUpdate = true;
      a.emit.needsUpdate = true;
    }
    return li;
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

