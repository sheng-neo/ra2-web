/**
 * 轻量骨架系统：关节定义(Rig) / 局部姿态(Pose) / 世界解算 + 弹簧链 + 打包成蒙皮数据(Skeleton) / 两段式 IK。
 *
 * 绑定姿态下所有关节的朝向都是单位旋转(只有平移)，所以蒙皮矩阵退化为「平移 + 旋转 + 等比缩放」，
 * 每根骨骼只需 8 个浮点数：(offset.xyz, scale, quat.xyzw)，顶点着色器里 v' = offset + scale · rotate(quat, v)。
 * 姿态里的欧拉角单位是度，旋转顺序 YXZ：q = Qy · Qx · Qz。按模型空间(+Z 前 / +Y 上 / +X 左)：
 *   绕 X 正转 = 向前低头/躯干前倾(上→前)；下垂的肢体绕 X 负转 = 向前抬起；膝盖向后弯 = 小腿绕 X 正转。
 *   绕 Y 正转 = 向左转(前→左)。绕 Z 正转 = 向右侧倾(左→上)；下垂的左臂绕 Z 正转 = 向外展开。
 */
const DEG = Math.PI / 180;

export interface Collider {
  joint: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

/** 弹簧链(披风/头发/围巾/尾巴)：链上关节的朝向不由动画直接给出，而是被惯性、重力拖着走 */
export interface ChainDef {
  /** 自根向梢的关节序列；每个都是前一个的子关节 */
  joints: number[];
  /** 末节 → 虚拟末端的偏移(绑定空间) */
  tip: [number, number, number];
  /** 回到动画姿态的速度(1/秒)：越大越硬 */
  stiffness: number;
  /** 每帧(按 60fps 计)速度保留比例 0..1：越大越飘 */
  drag: number;
  /** 重力加速度(米/秒²) */
  gravity: number;
  /** 相对动画姿态的最大偏角(度) */
  maxAngle: number;
  /** 风的加速度幅度 */
  wind?: number;
  /** 不能穿过的球(跟随某关节) */
  colliders?: Collider[];
}

export class Rig {
  readonly names: string[] = [];
  readonly parent: number[] = [];
  /** 绑定姿态的模型空间位置(xyz) */
  readonly bind: number[] = [];
  /** 相对父关节的偏移(xyz) */
  readonly local: number[] = [];
  readonly chains: ChainDef[] = [];

  get count(): number {
    return this.names.length;
  }

  /** 添加关节(父关节必须先添加)。坐标为绑定姿态下的模型空间位置 */
  add(name: string, parent: number, x: number, y: number, z: number): number {
    const i = this.names.length;
    this.names.push(name);
    this.parent.push(parent);
    this.bind.push(x, y, z);
    if (parent >= 0) this.local.push(x - this.bind[parent * 3], y - this.bind[parent * 3 + 1], z - this.bind[parent * 3 + 2]);
    else this.local.push(x, y, z);
    return i;
  }

  /** 从 from 关节出发添加一串等分的链关节，返回关节序列(不含 from) */
  addChain(prefix: string, from: number, points: number[][]): number[] {
    const out: number[] = [];
    let p = from;
    points.forEach((pt, i) => {
      p = this.add(`${prefix}${i}`, p, pt[0], pt[1], pt[2]);
      out.push(p);
    });
    return out;
  }

  chain(def: ChainDef): void {
    this.chains.push(def);
  }

  id(name: string): number {
    const i = this.names.indexOf(name);
    if (i < 0) throw new Error(`rig: 没有关节 ${name}`);
    return i;
  }

  bx(j: number): number {
    return this.bind[j * 3];
  }
  by(j: number): number {
    return this.bind[j * 3 + 1];
  }
  bz(j: number): number {
    return this.bind[j * 3 + 2];
  }
}

// ───────────── 四元数小工具(数组 + 偏移，零分配) ─────────────

const _e = [0, 0, 0, 1];

function eulerQ(x: number, y: number, z: number, out: number[] | Float32Array, o: number): void {
  const hx = x * DEG * 0.5;
  const hy = y * DEG * 0.5;
  const hz = z * DEG * 0.5;
  const c1 = Math.cos(hx);
  const c2 = Math.cos(hy);
  const c3 = Math.cos(hz);
  const s1 = Math.sin(hx);
  const s2 = Math.sin(hy);
  const s3 = Math.sin(hz);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3;
  out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[o + 2] = c1 * c2 * s3 - s1 * s2 * c3;
  out[o + 3] = c1 * c2 * c3 + s1 * s2 * s3;
}

type Arr = number[] | Float32Array;

function qmul(a: Arr, ao: number, b: Arr, bo: number, out: Arr, oo: number): void {
  const ax = a[ao];
  const ay = a[ao + 1];
  const az = a[ao + 2];
  const aw = a[ao + 3];
  const bx = b[bo];
  const by = b[bo + 1];
  const bz = b[bo + 2];
  const bw = b[bo + 3];
  out[oo] = ax * bw + aw * bx + ay * bz - az * by;
  out[oo + 1] = ay * bw + aw * by + az * bx - ax * bz;
  out[oo + 2] = az * bw + aw * bz + ax * by - ay * bx;
  out[oo + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** out = rotate(q, v)。sign=-1 时用共轭(逆旋转) */
function qrot(q: Arr, qo: number, vx: number, vy: number, vz: number, out: Arr, oo: number, sign = 1): void {
  const qx = q[qo] * sign;
  const qy = q[qo + 1] * sign;
  const qz = q[qo + 2] * sign;
  const qw = q[qo + 3];
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[oo] = vx + qw * tx + (qy * tz - qz * ty);
  out[oo + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[oo + 2] = vz + qw * tz + (qx * ty - qy * tx);
}

/** 由正交基(三个列向量)得到四元数 */
function basisQ(xx: number, xy: number, xz: number, yx: number, yy: number, yz: number, zx: number, zy: number, zz: number, out: Arr, o: number): void {
  const tr = xx + yy + zz;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    out[o + 3] = 0.25 / s;
    out[o] = (yz - zy) * s;
    out[o + 1] = (zx - xz) * s;
    out[o + 2] = (xy - yx) * s;
  } else if (xx > yy && xx > zz) {
    const s = 2 * Math.sqrt(1 + xx - yy - zz);
    out[o + 3] = (yz - zy) / s;
    out[o] = 0.25 * s;
    out[o + 1] = (yx + xy) / s;
    out[o + 2] = (zx + xz) / s;
  } else if (yy > zz) {
    const s = 2 * Math.sqrt(1 + yy - xx - zz);
    out[o + 3] = (zx - xz) / s;
    out[o] = (yx + xy) / s;
    out[o + 1] = 0.25 * s;
    out[o + 2] = (zy + yz) / s;
  } else {
    const s = 2 * Math.sqrt(1 + zz - xx - yy);
    out[o + 3] = (xy - yx) / s;
    out[o] = (zx + xz) / s;
    out[o + 1] = (zy + yz) / s;
    out[o + 2] = 0.25 * s;
  }
}

/** 把单位向量 u 转到 v 的最短弧旋转 */
function fromTo(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, out: Arr, o: number): void {
  const d = ux * vx + uy * vy + uz * vz;
  if (d < -0.9999) {
    // 反向：任取一条垂直轴转 180°
    let ax = -uz;
    let ay = 0;
    let az = ux;
    if (Math.abs(ux) < 0.1 && Math.abs(uz) < 0.1) {
      ax = 0;
      ay = uz;
      az = -uy;
    }
    const l = Math.hypot(ax, ay, az) || 1;
    out[o] = ax / l;
    out[o + 1] = ay / l;
    out[o + 2] = az / l;
    out[o + 3] = 0;
    return;
  }
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const w = 1 + d;
  const l = Math.hypot(x, y, z, w) || 1;
  out[o] = x / l;
  out[o + 1] = y / l;
  out[o + 2] = z / l;
  out[o + 3] = w / l;
}

// ───────────── 姿态 ─────────────

/** 一组关节的局部变换(相对绑定姿态)：旋转四元数 + 附加平移 + 等比缩放 */
export class Pose {
  readonly q: Float32Array;
  readonly t: Float32Array;
  readonly s: Float32Array;

  constructor(readonly n: number) {
    this.q = new Float32Array(n * 4);
    this.t = new Float32Array(n * 3);
    this.s = new Float32Array(n);
    this.reset();
  }

  reset(): this {
    this.q.fill(0);
    this.t.fill(0);
    this.s.fill(1);
    for (let i = 0; i < this.n; i++) this.q[i * 4 + 3] = 1;
    return this;
  }

  /** 设置关节旋转(度) */
  rot(j: number, x: number, y = 0, z = 0): this {
    eulerQ(x, y, z, this.q, j * 4);
    return this;
  }

  /** 在当前旋转之后再叠加一个局部旋转(q = q · e)：用来加呼吸/抖动等叠加层 */
  add(j: number, x: number, y = 0, z = 0): this {
    eulerQ(x, y, z, _e, 0);
    qmul(this.q, j * 4, _e, 0, this.q, j * 4);
    return this;
  }

  /** 在父空间里预乘一个旋转(q = e · q) */
  pre(j: number, x: number, y = 0, z = 0): this {
    eulerQ(x, y, z, _e, 0);
    qmul(_e, 0, this.q, j * 4, this.q, j * 4);
    return this;
  }

  /** 设置附加平移(父空间，米) */
  pos(j: number, x: number, y: number, z: number): this {
    this.t[j * 3] = x;
    this.t[j * 3 + 1] = y;
    this.t[j * 3 + 2] = z;
    return this;
  }

  move(j: number, x: number, y: number, z: number): this {
    this.t[j * 3] += x;
    this.t[j * 3 + 1] += y;
    this.t[j * 3 + 2] += z;
    return this;
  }

  scale(j: number, s: number): this {
    this.s[j] = s;
    return this;
  }

  copy(o: Pose): this {
    this.q.set(o.q);
    this.t.set(o.t);
    this.s.set(o.s);
    return this;
  }

  /** this = lerp(from, this, w)：状态切换时从上一帧的定格姿态过渡过来 */
  blendFrom(from: Pose, w: number): this {
    const a = from.q;
    const b = this.q;
    const u = 1 - w;
    for (let i = 0; i < this.n * 4; i += 4) {
      const d = a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3];
      const k = d < 0 ? -u : u;
      const x = a[i] * k + b[i] * w;
      const y = a[i + 1] * k + b[i + 1] * w;
      const z = a[i + 2] * k + b[i + 2] * w;
      const ww = a[i + 3] * k + b[i + 3] * w;
      const l = Math.hypot(x, y, z, ww) || 1;
      b[i] = x / l;
      b[i + 1] = y / l;
      b[i + 2] = z / l;
      b[i + 3] = ww / l;
    }
    for (let i = 0; i < this.n * 3; i++) this.t[i] = from.t[i] * u + this.t[i] * w;
    for (let i = 0; i < this.n; i++) this.s[i] = from.s[i] * u + this.s[i] * w;
    return this;
  }
}

// ───────────── 世界解算 ─────────────

const _v = [0, 0, 0];
const _v2 = [0, 0, 0];
const _q = [0, 0, 0, 1];
const _q2 = [0, 0, 0, 1];
const _q3 = [0, 0, 0, 1];
const WIND_X = 0.82;
const WIND_Z = -0.57;

interface ChainState {
  p: Float32Array;
  prev: Float32Array;
  ready: boolean;
}

/** 一个单位实例的骨架运行时：世界变换 + 弹簧链状态 */
export class Skeleton {
  /** 关节世界位置 / 旋转 / 缩放 */
  readonly wp: Float32Array;
  readonly wq: Float32Array;
  readonly ws: Float32Array;
  private chains: ChainState[];
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  private phase: number;

  constructor(readonly rig: Rig, seed = 0) {
    const n = rig.count;
    this.wp = new Float32Array(n * 3);
    this.wq = new Float32Array(n * 4);
    this.ws = new Float32Array(n);
    this.chains = rig.chains.map((c) => ({ p: new Float32Array(c.joints.length * 3), prev: new Float32Array(c.joints.length * 3), ready: false }));
    this.phase = seed * 6.283;
  }

  /**
   * 由姿态解出各关节的世界变换。(x,y,z) 为单位落点，yaw 为绕 Y 的弧度(模型 +Z 转到朝向)，scale 为整体缩放。
   */
  solve(pose: Pose, x: number, y: number, z: number, yaw: number, scale: number): void {
    const rig = this.rig;
    const n = rig.count;
    const wp = this.wp;
    const wq = this.wq;
    const ws = this.ws;
    const loc = rig.local;
    const par = rig.parent;
    const sy = Math.sin(yaw * 0.5);
    const cy = Math.cos(yaw * 0.5);
    for (let j = 0; j < n; j++) {
      const p = par[j];
      const lx = loc[j * 3] + pose.t[j * 3];
      const ly = loc[j * 3 + 1] + pose.t[j * 3 + 1];
      const lz = loc[j * 3 + 2] + pose.t[j * 3 + 2];
      if (p < 0) {
        _q[0] = 0;
        _q[1] = sy;
        _q[2] = 0;
        _q[3] = cy;
        qrot(_q, 0, lx * scale, ly * scale, lz * scale, wp, j * 3);
        wp[j * 3] += x;
        wp[j * 3 + 1] += y;
        wp[j * 3 + 2] += z;
        qmul(_q, 0, pose.q, j * 4, wq, j * 4);
        ws[j] = scale * pose.s[j];
      } else {
        const s = ws[p];
        qrot(wq, p * 4, lx * s, ly * s, lz * s, wp, j * 3);
        wp[j * 3] += wp[p * 3];
        wp[j * 3 + 1] += wp[p * 3 + 1];
        wp[j * 3 + 2] += wp[p * 3 + 2];
        qmul(wq, p * 4, pose.q, j * 4, wq, j * 4);
        ws[j] = s * pose.s[j];
      }
    }
  }

  /** 丢弃弹簧链的历史状态(单位重新出现/瞬移后调用)，下一次 simulate 时从静止姿态开始 */
  resetChains(): void {
    for (const c of this.chains) c.ready = false;
  }

  /**
   * 推进弹簧链并改写链上关节的世界变换。必须在 solve 之后调用。
   * dt=0 时只按当前粒子位置重建朝向(暂停/定格)。
   */
  simulate(pose: Pose, dt: number, time: number): void {
    const rig = this.rig;
    if (rig.chains.length === 0) return;
    const wp = this.wp;
    const wq = this.wq;
    const ws = this.ws;
    // 瞬移(闪现/回城/复活)：整条链跟着平移，避免被甩成一条直线
    const dx = wp[0] - this.lastX;
    const dy = wp[1] - this.lastY;
    const dz = wp[2] - this.lastZ;
    const jumped = dx * dx + dy * dy + dz * dz > 4;
    this.lastX = wp[0];
    this.lastY = wp[1];
    this.lastZ = wp[2];
    const step = Math.min(dt, 1 / 24);
    for (let ci = 0; ci < rig.chains.length; ci++) {
      const def = rig.chains[ci];
      const st = this.chains[ci];
      const m = def.joints.length;
      if (jumped && st.ready) {
        for (let k = 0; k < m; k++) {
          st.p[k * 3] += dx;
          st.p[k * 3 + 1] += dy;
          st.p[k * 3 + 2] += dz;
          st.prev[k * 3] += dx;
          st.prev[k * 3 + 1] += dy;
          st.prev[k * 3 + 2] += dz;
        }
      }
      const keep = Math.pow(def.drag, step * 60);
      const pull = 1 - Math.exp(-def.stiffness * step);
      const cosMax = Math.cos(def.maxAngle * DEG);
      const sinMax = Math.sin(def.maxAngle * DEG);
      const gust = (def.wind ?? 0) * (0.55 + 0.45 * Math.sin(time * 2.3 + this.phase + ci * 1.7)) + (def.wind ?? 0) * 0.25 * Math.sin(time * 7.1 + this.phase * 2 + ci);
      for (let k = 0; k < m; k++) {
        const j = def.joints[k];
        const par = rig.parent[j];
        const s = ws[j];
        if (k > 0) {
          wp[j * 3] = st.p[(k - 1) * 3];
          wp[j * 3 + 1] = st.p[(k - 1) * 3 + 1];
          wp[j * 3 + 2] = st.p[(k - 1) * 3 + 2];
        }
        // 动画给出的朝向(继承父关节已经被拖动后的最终朝向)
        qmul(wq, par * 4, pose.q, j * 4, _q, 0);
        let ox: number;
        let oy: number;
        let oz: number;
        if (k < m - 1) {
          const c = def.joints[k + 1];
          ox = rig.local[c * 3] + pose.t[c * 3];
          oy = rig.local[c * 3 + 1] + pose.t[c * 3 + 1];
          oz = rig.local[c * 3 + 2] + pose.t[c * 3 + 2];
        } else {
          ox = def.tip[0];
          oy = def.tip[1];
          oz = def.tip[2];
        }
        const len0 = Math.hypot(ox, oy, oz) || 1e-4;
        qrot(_q, 0, ox / len0, oy / len0, oz / len0, _v, 0);
        const rx = _v[0];
        const ry = _v[1];
        const rz = _v[2];
        const len = len0 * s;
        const jx = wp[j * 3];
        const jy = wp[j * 3 + 1];
        const jz = wp[j * 3 + 2];
        const restX = jx + rx * len;
        const restY = jy + ry * len;
        const restZ = jz + rz * len;
        const o = k * 3;
        let px: number;
        let py: number;
        let pz: number;
        if (!st.ready) {
          px = restX;
          py = restY;
          pz = restZ;
          st.prev[o] = px;
          st.prev[o + 1] = py;
          st.prev[o + 2] = pz;
        } else {
          px = st.p[o];
          py = st.p[o + 1];
          pz = st.p[o + 2];
          if (step > 0) {
            const vx = (px - st.prev[o]) * keep;
            const vy = (py - st.prev[o + 1]) * keep;
            const vz = (pz - st.prev[o + 2]) * keep;
            st.prev[o] = px;
            st.prev[o + 1] = py;
            st.prev[o + 2] = pz;
            const a = step * step;
            px += vx + WIND_X * gust * a;
            py += vy - def.gravity * a;
            pz += vz + WIND_Z * gust * a;
            px += (restX - px) * pull;
            py += (restY - py) * pull;
            pz += (restZ - pz) * pull;
          }
        }
        // 长度约束 + 偏角上限
        let ddx = px - jx;
        let ddy = py - jy;
        let ddz = pz - jz;
        let dl = Math.hypot(ddx, ddy, ddz);
        if (dl < 1e-5) {
          ddx = rx;
          ddy = ry;
          ddz = rz;
          dl = 1;
        }
        ddx /= dl;
        ddy /= dl;
        ddz /= dl;
        const cosA = ddx * rx + ddy * ry + ddz * rz;
        if (cosA < cosMax) {
          let qx = ddx - rx * cosA;
          let qy = ddy - ry * cosA;
          let qz = ddz - rz * cosA;
          const ql = Math.hypot(qx, qy, qz) || 1;
          qx /= ql;
          qy /= ql;
          qz /= ql;
          ddx = rx * cosMax + qx * sinMax;
          ddy = ry * cosMax + qy * sinMax;
          ddz = rz * cosMax + qz * sinMax;
        }
        px = jx + ddx * len;
        py = jy + ddy * len;
        pz = jz + ddz * len;
        if (def.colliders) {
          let hit = false;
          for (const col of def.colliders) {
            const cs = ws[col.joint];
            qrot(wq, col.joint * 4, col.x * cs, col.y * cs, col.z * cs, _v2, 0);
            const cx = wp[col.joint * 3] + _v2[0];
            const cy = wp[col.joint * 3 + 1] + _v2[1];
            const cz = wp[col.joint * 3 + 2] + _v2[2];
            const R = col.r * cs;
            const ex = px - cx;
            const ey = py - cy;
            const ez = pz - cz;
            const el = Math.hypot(ex, ey, ez);
            if (el < R && el > 1e-5) {
              px = cx + (ex / el) * R;
              py = cy + (ey / el) * R;
              pz = cz + (ez / el) * R;
              hit = true;
            }
          }
          if (hit) {
            ddx = px - jx;
            ddy = py - jy;
            ddz = pz - jz;
            dl = Math.hypot(ddx, ddy, ddz) || 1;
            ddx /= dl;
            ddy /= dl;
            ddz /= dl;
            px = jx + ddx * len;
            py = jy + ddy * len;
            pz = jz + ddz * len;
          }
        }
        st.p[o] = px;
        st.p[o + 1] = py;
        st.p[o + 2] = pz;
        fromTo(rx, ry, rz, ddx, ddy, ddz, _q2, 0);
        qmul(_q2, 0, _q, 0, wq, j * 4);
      }
      st.ready = true;
    }
  }

  /** 让弹簧链在当前姿态下沉降到静止(定格截图/头像用) */
  settle(pose: Pose, time: number, iterations = 40): void {
    for (let i = 0; i < iterations; i++) this.simulate(pose, 1 / 30, time);
  }

  /** 打包蒙皮数据：每关节 8 个浮点 (offset.xyz, scale, quat.xyzw) */
  pack(out: Float32Array, offset: number): void {
    const rig = this.rig;
    const n = rig.count;
    const wp = this.wp;
    const wq = this.wq;
    const ws = this.ws;
    const bind = rig.bind;
    for (let j = 0; j < n; j++) {
      const s = ws[j];
      qrot(wq, j * 4, bind[j * 3] * s, bind[j * 3 + 1] * s, bind[j * 3 + 2] * s, _v, 0);
      const o = offset + j * 8;
      out[o] = wp[j * 3] - _v[0];
      out[o + 1] = wp[j * 3 + 1] - _v[1];
      out[o + 2] = wp[j * 3 + 2] - _v[2];
      out[o + 3] = s;
      out[o + 4] = wq[j * 4];
      out[o + 5] = wq[j * 4 + 1];
      out[o + 6] = wq[j * 4 + 2];
      out[o + 7] = wq[j * 4 + 3];
    }
  }

  /** 关节局部坐标(相对关节的绑定位置)的一点 → 世界坐标 */
  point(j: number, x: number, y: number, z: number, out: { x: number; y: number; z: number }): void {
    const s = this.ws[j];
    qrot(this.wq, j * 4, x * s, y * s, z * s, _v, 0);
    out.x = this.wp[j * 3] + _v[0];
    out.y = this.wp[j * 3 + 1] + _v[1];
    out.z = this.wp[j * 3 + 2] + _v[2];
  }
}

// ───────────── 姿态空间内的查询与 IK ─────────────

const _pp = [0, 0, 0];
const _pq = [0, 0, 0, 1];
const _chain: number[] = [];

/**
 * 关节在「根空间」(根关节 0 视为单位变换)里的位置与朝向，结果写入 outP / outQ。
 * 只沿父链向上累乘，供 IK 使用。
 */
export function poseSpace(rig: Rig, pose: Pose, j: number, outP: Arr, outQ: Arr): void {
  _chain.length = 0;
  for (let k = j; k > 0; k = rig.parent[k]) _chain.push(k);
  let px = 0;
  let py = 0;
  let pz = 0;
  _pq[0] = 0;
  _pq[1] = 0;
  _pq[2] = 0;
  _pq[3] = 1;
  for (let i = _chain.length - 1; i >= 0; i--) {
    const k = _chain[i];
    qrot(_pq, 0, rig.local[k * 3] + pose.t[k * 3], rig.local[k * 3 + 1] + pose.t[k * 3 + 1], rig.local[k * 3 + 2] + pose.t[k * 3 + 2], _pp, 0);
    px += _pp[0];
    py += _pp[1];
    pz += _pp[2];
    qmul(_pq, 0, pose.q, k * 4, _pq, 0);
  }
  outP[0] = px;
  outP[1] = py;
  outP[2] = pz;
  outQ[0] = _pq[0];
  outQ[1] = _pq[1];
  outQ[2] = _pq[2];
  outQ[3] = _pq[3];
}

const _ap = [0, 0, 0];
const _aq = [0, 0, 0, 1];
const _d = [0, 0, 0];
const _pole = [0, 0, 0];
const _f0 = [0, 0, 0, 1];
const _f1 = [0, 0, 0, 1];
const _qa = [0, 0, 0, 1];
const _u2 = [0, 0, 0];
const _nn = [0, 0, 0];

function frameQ(xx: number, xy: number, xz: number, zx: number, zy: number, zz: number, out: Arr): void {
  // y = z × x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  basisQ(xx, xy, xz, yx, yy, yz, zx, zy, zz, out, 0);
}

/**
 * 两段式解析 IK：让 upper→lower→end 这条肢体的末端到达根空间里的目标点 (tx,ty,tz)，
 * 关节(膝/肘)朝 pole 方向(根空间向量)弯。写入 upper 与 lower 的局部旋转。
 * 返回末端父关节(lower)的根空间朝向于 outLowerQ(可选)，用来随后设定手/脚的朝向。
 */
export function ikLimb(
  rig: Rig, pose: Pose, upper: number, lower: number, end: number,
  tx: number, ty: number, tz: number, poleX: number, poleY: number, poleZ: number,
  /** 绑定姿态下关节的自然弯曲朝向：+1 = 朝前(膝)，-1 = 朝后(肘)。决定零扭转时的参考 */
  ref: 1 | -1 = 1,
  outLowerQ?: Arr,
): void {
  const par = rig.parent[upper];
  poseSpace(rig, pose, par, _ap, _aq);
  // upper 关节位置
  qrot(_aq, 0, rig.local[upper * 3] + pose.t[upper * 3], rig.local[upper * 3 + 1] + pose.t[upper * 3 + 1], rig.local[upper * 3 + 2] + pose.t[upper * 3 + 2], _d, 0);
  const ax = _ap[0] + _d[0];
  const ay = _ap[1] + _d[1];
  const az = _ap[2] + _d[2];
  // 目标与极向量转到父关节空间
  qrot(_aq, 0, tx - ax, ty - ay, tz - az, _d, 0, -1);
  qrot(_aq, 0, poleX, poleY, poleZ, _pole, 0, -1);
  const b0x = rig.local[lower * 3];
  const b0y = rig.local[lower * 3 + 1];
  const b0z = rig.local[lower * 3 + 2];
  const c0x = rig.local[end * 3];
  const c0y = rig.local[end * 3 + 1];
  const c0z = rig.local[end * 3 + 2];
  const L1 = Math.hypot(b0x, b0y, b0z);
  const L2 = Math.hypot(c0x, c0y, c0z);
  let D = Math.hypot(_d[0], _d[1], _d[2]);
  if (D < 1e-5) {
    _d[1] = -1;
    D = 1e-5;
  }
  const dx = _d[0] / D;
  const dy = _d[1] / D;
  const dz = _d[2] / D;
  D = Math.min(Math.max(D, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  // 极向量去掉沿目标方向的分量
  let k = _pole[0] * dx + _pole[1] * dy + _pole[2] * dz;
  let px = _pole[0] - dx * k;
  let py = _pole[1] - dy * k;
  let pz = _pole[2] - dz * k;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) {
    // 极向量与目标共线：退回模型前方
    k = dz;
    px = -dx * k;
    py = -dy * k;
    pz = 1 - dz * k;
    pl = Math.hypot(px, py, pz) || 1;
  }
  px /= pl;
  py /= pl;
  pz /= pl;
  // 弯曲平面法线 n = dir × pole
  _nn[0] = dy * pz - dz * py;
  _nn[1] = dz * px - dx * pz;
  _nn[2] = dx * py - dy * px;
  const u1x = dx * cosA + px * sinA;
  const u1y = dy * cosA + py * sinA;
  const u1z = dz * cosA + pz * sinA;
  _u2[0] = (dx * D - u1x * L1) / L2;
  _u2[1] = (dy * D - u1y * L1) / L2;
  _u2[2] = (dz * D - u1z * L1) / L2;
  // 绑定姿态下的参考基：肢体方向 + (肢体方向 × 绑定极向量)，绑定极向量为 (0,0,ref)
  const refQ = (bx: number, by: number, bz: number, out: Arr): void => {
    const l = Math.hypot(bx, by, bz) || 1;
    const x0 = bx / l;
    const y0 = by / l;
    const z0 = bz / l;
    let nx = y0 * ref;
    let ny = -x0 * ref;
    let nz = 0;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-4) {
      nx = 1;
      ny = 0;
      nz = 0;
    } else {
      nx /= nl;
      ny /= nl;
      nz /= nl;
    }
    frameQ(x0, y0, z0, nx, ny, nz, out);
  };
  refQ(b0x, b0y, b0z, _f0);
  frameQ(u1x, u1y, u1z, _nn[0], _nn[1], _nn[2], _f1);
  // qA = F1 · F0⁻¹
  _f0[0] = -_f0[0];
  _f0[1] = -_f0[1];
  _f0[2] = -_f0[2];
  qmul(_f1, 0, _f0, 0, _qa, 0);
  pose.q[upper * 4] = _qa[0];
  pose.q[upper * 4 + 1] = _qa[1];
  pose.q[upper * 4 + 2] = _qa[2];
  pose.q[upper * 4 + 3] = _qa[3];
  // 下段：目标方向与法线转到 upper 的局部空间
  qrot(_qa, 0, _u2[0], _u2[1], _u2[2], _d, 0, -1);
  qrot(_qa, 0, _nn[0], _nn[1], _nn[2], _pole, 0, -1);
  refQ(c0x, c0y, c0z, _f0);
  frameQ(_d[0], _d[1], _d[2], _pole[0], _pole[1], _pole[2], _f1);
  _f0[0] = -_f0[0];
  _f0[1] = -_f0[1];
  _f0[2] = -_f0[2];
  qmul(_f1, 0, _f0, 0, pose.q, lower * 4);
  if (outLowerQ) {
    qmul(_aq, 0, _qa, 0, _q3, 0);
    qmul(_q3, 0, pose.q, lower * 4, outLowerQ, 0);
  }
}

/** 设定关节在根空间里的朝向(欧拉角，度)：local = parentWorld⁻¹ · desired。parentQ 为父关节的根空间朝向 */
export function setSpaceRot(pose: Pose, j: number, parentQ: Arr, x: number, y: number, z: number): void {
  eulerQ(x, y, z, _q, 0);
  _q2[0] = -parentQ[0];
  _q2[1] = -parentQ[1];
  _q2[2] = -parentQ[2];
  _q2[3] = parentQ[3];
  qmul(_q2, 0, _q, 0, pose.q, j * 4);
}
