/**
 * 人形骨架与通用动作层：五位英雄共用同一套关节命名、关键姿态插值、腿部 IK 与跑步循环，
 * 各英雄只需描述「自己的站姿/出招关键帧/跑姿参数」。
 *
 * 关键姿态(KP)是一张「关节名 → [x, y, z] 欧拉角(度)」的表，另有几个特殊键：
 *   hipsPos  [x, y, z]            髋部相对绑定位置的平移(下蹲/重心移动)
 *   footL/R  [x, y, z, 俯仰, 偏航]  脚踝在根空间里的目标位置(腿用 IK 解)，俯仰正值 = 脚尖向下
 *   rootPos  [x, y, z]            根关节平移(腾空高度等)
 * 腿的旋转永远由 IK 给出，所以改髋部高度/躯干倾斜时脚仍然踩在原地。
 */
import { type Pose, Rig, ikLimb, poseSpace, setSpaceRot } from './rig';

export interface HumanDims {
  ankleY: number;
  kneeY: number;
  hipY: number;
  /** 两髋关节的半间距 */
  hipX: number;
  pelvisY: number;
  spineY: number;
  chestY: number;
  neckY: number;
  headY: number;
  clavX: number;
  shoulderX: number;
  shoulderY: number;
  elbowY: number;
  wristY: number;
  /** 手心(武器握点)高度 */
  handY: number;
}

export interface HumanJ {
  root: number;
  hips: number;
  spine: number;
  chest: number;
  neck: number;
  head: number;
  clavL: number;
  armL: number;
  foreL: number;
  handL: number;
  propL: number;
  clavR: number;
  armR: number;
  foreR: number;
  handR: number;
  propR: number;
  thighL: number;
  shinL: number;
  footL: number;
  thighR: number;
  shinR: number;
  footR: number;
}

/**
 * 标准英雄身材(模型空间总高约 2.0，头身比约 1:4；实际身高再乘各英雄的整体缩放)。
 * 对局镜头里英雄只有几十像素高，所以刻意做成大头、宽肩、粗四肢的「英雄 Q 版」比例，剪影才立得住。
 */
export const STANDARD_DIMS: HumanDims = {
  ankleY: 0.09, kneeY: 0.45, hipY: 0.82, hipX: 0.125, pelvisY: 0.86, spineY: 1.0, chestY: 1.17, neckY: 1.42, headY: 1.47,
  clavX: 0.09, shoulderX: 0.3, shoulderY: 1.37, elbowY: 1.09, wristY: 0.83, handY: 0.75,
};

export interface Human {
  rig: Rig;
  J: HumanJ;
  d: HumanDims;
}

export function humanRig(d: HumanDims): Human {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const hips = rig.add('hips', root, 0, d.pelvisY, 0);
  const spine = rig.add('spine', hips, 0, d.spineY, 0);
  const chest = rig.add('chest', spine, 0, d.chestY, 0);
  const neck = rig.add('neck', chest, 0, d.neckY, 0);
  const head = rig.add('head', neck, 0, d.headY, 0);
  const arm = (s: 1 | -1, n: string): [number, number, number, number, number] => {
    const clav = rig.add(`clav${n}`, chest, s * d.clavX, d.shoulderY - 0.02, 0);
    const up = rig.add(`arm${n}`, clav, s * d.shoulderX, d.shoulderY, 0);
    const fore = rig.add(`fore${n}`, up, s * d.shoulderX, d.elbowY, 0);
    const hand = rig.add(`hand${n}`, fore, s * d.shoulderX, d.wristY, 0);
    const prop = rig.add(`prop${n}`, hand, s * d.shoulderX, d.handY, 0);
    return [clav, up, fore, hand, prop];
  };
  const [clavL, armL, foreL, handL, propL] = arm(1, 'L');
  const [clavR, armR, foreR, handR, propR] = arm(-1, 'R');
  const leg = (s: 1 | -1, n: string): [number, number, number] => {
    const thigh = rig.add(`thigh${n}`, hips, s * d.hipX, d.hipY, 0);
    const shin = rig.add(`shin${n}`, thigh, s * d.hipX, d.kneeY, 0);
    const foot = rig.add(`foot${n}`, shin, s * d.hipX, d.ankleY, 0);
    return [thigh, shin, foot];
  };
  const [thighL, shinL, footL] = leg(1, 'L');
  const [thighR, shinR, footR] = leg(-1, 'R');
  return {
    rig,
    d,
    J: { root, hips, spine, chest, neck, head, clavL, armL, foreL, handL, propL, clavR, armR, foreR, handR, propR, thighL, shinL, footL, thighR, shinR, footR },
  };
}

// ───────────── 缓动 ─────────────

export type Ease = (x: number) => number;
export const E = {
  lin: (x: number): number => x,
  in: (x: number): number => x * x,
  out: (x: number): number => 1 - (1 - x) * (1 - x),
  io: (x: number): number => x * x * (3 - 2 * x),
  in3: (x: number): number => x * x * x,
  out3: (x: number): number => 1 - Math.pow(1 - x, 3),
  out5: (x: number): number => 1 - Math.pow(1 - x, 5),
  /** 冲过头再回来(跟随) */
  back: (x: number): number => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  },
} as const;

export const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** p 在 [a,b] 内的归一化进度 */
export const seg = (p: number, a: number, b: number): number => sat((p - a) / (b - a));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 钟形脉冲：p 在 c 附近(半宽 w)为 1，两侧平滑落到 0 */
export const bump = (p: number, c: number, w: number): number => {
  const x = sat(1 - Math.abs(p - c) / w);
  return x * x * (3 - 2 * x);
};

/**
 * 把「命中点在 windup 处」的实际进度，映射到「命中点固定在 0.35 处」的动作时间轴：
 * 关键帧统一按 0.35 命中来写，不同英雄/攻速的前摇比例由这里对齐。
 */
export function strikeWarp(p: number, windup: number): number {
  const w = Math.min(0.6, Math.max(0.15, windup));
  return p < w ? (p / w) * 0.35 : 0.35 + ((p - w) / (1 - w)) * 0.65;
}

// ───────────── 关键姿态 ─────────────

export type KP = Record<string, number[]>;

/** 编译后的关键姿态：全部关节的欧拉角 + 髋平移 + 双脚目标 + 根平移 */
export interface CKP {
  e: Float32Array;
  hips: Float32Array;
  footL: Float32Array;
  footR: Float32Array;
  root: Float32Array;
}

export function emptyCKP(h: Human): CKP {
  const d = h.d;
  return {
    e: new Float32Array(h.rig.count * 3),
    hips: new Float32Array(3),
    footL: new Float32Array([d.hipX + 0.04, d.ankleY, 0, 0, 0]),
    footR: new Float32Array([-d.hipX - 0.04, d.ankleY, 0, 0, 0]),
    root: new Float32Array(3),
  };
}

export function copyCKP(dst: CKP, src: CKP): CKP {
  dst.e.set(src.e);
  dst.hips.set(src.hips);
  dst.footL.set(src.footL);
  dst.footR.set(src.footR);
  dst.root.set(src.root);
  return dst;
}

/** 在 base 的基础上覆盖 dict 里列出的项，得到一个新的关键姿态 */
export function kp(h: Human, base: CKP | null, dict: KP): CKP {
  const k = emptyCKP(h);
  if (base) copyCKP(k, base);
  for (const name in dict) {
    const v = dict[name];
    if (name === 'hipsPos') k.hips.set(v);
    else if (name === 'rootPos') k.root.set(v);
    else if (name === 'footL' || name === 'footR') {
      const f = name === 'footL' ? k.footL : k.footR;
      for (let i = 0; i < v.length; i++) f[i] = v[i];
    } else {
      const j = h.rig.id(name);
      k.e[j * 3] = v[0] ?? 0;
      k.e[j * 3 + 1] = v[1] ?? 0;
      k.e[j * 3 + 2] = v[2] ?? 0;
    }
  }
  return k;
}

function lerpArr(out: Float32Array, a: Float32Array, b: Float32Array, t: number): void {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
}

export function lerpCKP(out: CKP, a: CKP, b: CKP, t: number): CKP {
  lerpArr(out.e, a.e, b.e, t);
  lerpArr(out.hips, a.hips, b.hips, t);
  lerpArr(out.footL, a.footL, b.footL, t);
  lerpArr(out.footR, a.footR, b.footR, t);
  lerpArr(out.root, a.root, b.root, t);
  return out;
}

export interface TrackKey {
  t: number;
  k: CKP;
  ease: Ease;
}

/** 关键帧轨道：[时刻, 姿态, 到达该帧所用的缓动] */
export function track(keys: [number, CKP, Ease?][]): TrackKey[] {
  return keys.map(([t, k, ease]) => ({ t, k, ease: ease ?? E.io }));
}

export function sampleTrack(tr: TrackKey[], p: number, out: CKP): CKP {
  if (p <= tr[0].t) return copyCKP(out, tr[0].k);
  for (let i = 1; i < tr.length; i++) {
    const b = tr[i];
    if (p <= b.t) {
      const a = tr[i - 1];
      return lerpCKP(out, a.k, b.k, b.ease((p - a.t) / (b.t - a.t)));
    }
  }
  return copyCKP(out, tr[tr.length - 1].k);
}

const _lq = [0, 0, 0, 1];
const _tp = [0, 0, 0];
const _tq = [0, 0, 0, 1];

/** 把脚踝放到根空间的 (x, y, z)，脚掌朝向由俯仰/偏航(度)给出；膝盖朝脚尖方向弯 */
export function plantFoot(h: Human, pose: Pose, side: 1 | -1, x: number, y: number, z: number, pitch = 0, yaw = 0): void {
  const J = h.J;
  const thigh = side > 0 ? J.thighL : J.thighR;
  const shin = side > 0 ? J.shinL : J.shinR;
  const foot = side > 0 ? J.footL : J.footR;
  const yr = (yaw * Math.PI) / 180;
  // 极向量：脚尖方向略向外，防止双膝内扣
  ikLimb(h.rig, pose, thigh, shin, foot, x, y, z, Math.sin(yr) + side * 0.12, 0.1, Math.cos(yr), 1, _lq);
  setSpaceRot(pose, foot, _lq, pitch, yaw, 0);
}

/**
 * 把手腕放到「某关节局部坐标里的一点」(例如武器握把上的第二握点)。肘部朝 pole(根空间)方向。
 */
export function reachHand(h: Human, pose: Pose, side: 1 | -1, joint: number, x: number, y: number, z: number, poleX = side * 0.6, poleY = -0.6, poleZ = -0.5): void {
  const J = h.J;
  poseSpace(h.rig, pose, joint, _tp, _tq);
  // 目标点 = 关节位置 + 关节朝向 · 局部偏移
  const qx = _tq[0];
  const qy = _tq[1];
  const qz = _tq[2];
  const qw = _tq[3];
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  const wx = _tp[0] + x + qw * tx + (qy * tz - qz * ty);
  const wy = _tp[1] + y + qw * ty + (qz * tx - qx * tz);
  const wz = _tp[2] + z + qw * tz + (qx * ty - qy * tx);
  ikLimb(h.rig, pose, side > 0 ? J.armL : J.armR, side > 0 ? J.foreL : J.foreR, side > 0 ? J.handL : J.handR, wx, wy, wz, poleX, poleY, poleZ, -1);
}

/** 把手腕放到根空间的一点 */
export function placeHand(h: Human, pose: Pose, side: 1 | -1, x: number, y: number, z: number, poleX = side * 0.6, poleY = -0.6, poleZ = -0.5): void {
  const J = h.J;
  ikLimb(h.rig, pose, side > 0 ? J.armL : J.armR, side > 0 ? J.foreL : J.foreR, side > 0 ? J.handL : J.handR, x, y, z, poleX, poleY, poleZ, -1);
}

/**
 * 把姿态里某关节的旋转向 from 里保存的旋转混合：q[o..] = nlerp(from[fo..], q[o..], w)。
 * 用于 IK 的权重(手从「叉腰」过渡到「握住武器」)：先存下 IK 之前的臂/前臂旋转，解完 IK 再按权重混回去。
 */
export function mixQ(q: Float32Array, o: number, from: Float32Array, fo: number, w: number): void {
  const dot = q[o] * from[fo] + q[o + 1] * from[fo + 1] + q[o + 2] * from[fo + 2] + q[o + 3] * from[fo + 3];
  const u = (1 - w) * (dot < 0 ? -1 : 1);
  const x = from[fo] * u + q[o] * w;
  const y = from[fo + 1] * u + q[o + 1] * w;
  const z = from[fo + 2] * u + q[o + 2] * w;
  const ww = from[fo + 3] * u + q[o + 3] * w;
  const l = Math.hypot(x, y, z, ww) || 1;
  q[o] = x / l;
  q[o + 1] = y / l;
  q[o + 2] = z / l;
  q[o + 3] = ww / l;
}

const LEG_JOINTS = new Set<string>(['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']);

/**
 * 把关键姿态写入 pose。overlay 在「躯干/手臂已就位、腿还没解」时调用：
 * 在这里叠加呼吸、重心晃动等，脚会在之后重新踩实。
 */
export function applyCKP(h: Human, pose: Pose, k: CKP, overlay?: () => void): void {
  const rig = h.rig;
  const n = rig.count;
  const e = k.e;
  for (let j = 0; j < n; j++) {
    const x = e[j * 3];
    const y = e[j * 3 + 1];
    const z = e[j * 3 + 2];
    if (x !== 0 || y !== 0 || z !== 0) pose.rot(j, x, y, z);
  }
  pose.pos(h.J.hips, k.hips[0], k.hips[1], k.hips[2]);
  pose.pos(h.J.root, k.root[0], k.root[1], k.root[2]);
  if (overlay) overlay();
  plantFoot(h, pose, 1, k.footL[0], k.footL[1], k.footL[2], k.footL[3], k.footL[4]);
  plantFoot(h, pose, -1, k.footR[0], k.footR[1], k.footR[2], k.footR[3], k.footR[4]);
}

export function isLegJoint(name: string): boolean {
  return LEG_JOINTS.has(name);
}

// ───────────── 跑步循环 ─────────────

export interface RunStyle {
  /** 一个完整循环(两步)前进的距离(模型空间，未乘整体缩放) */
  stride: number;
  /** 支撑相占比(跑 0.3~0.4，走 0.55~0.6) */
  stance: number;
  /** 抬脚高度 */
  lift: number;
  /** 重心起伏幅度 */
  bob: number;
  /** 髋部整体下沉(屈膝奔跑) */
  drop: number;
  /** 躯干前倾(度) */
  lean: number;
  /** 髋部横摆(米) */
  sway: number;
  /** 髋与胸的对扭(度) */
  twist: number;
  /** 半步宽 */
  width: number;
  /** 手臂摆幅(度)；0 = 手臂完全交给英雄自己摆 */
  arm: number;
  /** 肘部弯曲(度) */
  elbow: number;
}

export const RUN_DEFAULT: RunStyle = { stride: 2.6, stance: 0.36, lift: 0.26, bob: 0.045, drop: 0.07, lean: 12, sway: 0.03, twist: 9, width: 0.13, arm: 38, elbow: 70 };

const TAU = Math.PI * 2;

/** 单脚在一个循环内的轨迹：返回 [z, y, 俯仰] */
function footPath(u: number, st: RunStyle, ankleY: number, out: number[]): void {
  const f = st.stance;
  const reach = st.stride * f;
  // 落地点比离地点更靠近身体：前 42% 后 58%
  const zF = reach * 0.42;
  const zB = -reach * 0.58;
  if (u < f) {
    const s = u / f;
    out[0] = mix(zF, zB, s);
    out[1] = ankleY + 0.03 * s * s;
    out[2] = mix(-14, 26, s * s);
  } else {
    const s = (u - f) / (1 - f);
    const e = s * s * (3 - 2 * s);
    out[0] = mix(zB, zF, e);
    // 蹬地后脚跟先向后上方甩起，再向前迈
    out[1] = ankleY + st.lift * Math.sin(Math.PI * Math.pow(s, 0.8)) + st.lift * 0.55 * Math.sin(Math.PI * s) * (1 - s);
    out[2] = mix(26, -14, e) + 34 * Math.sin(Math.PI * s) * (1 - s);
  }
}

const _fp = [0, 0, 0];

/**
 * 程序化跑步：髋部起伏/横摆/扭转 + 躯干前倾 + 双腿 IK(支撑相脚相对身体匀速后移，所以不打滑) + 可选的摆臂。
 * phase 为循环相位 0..1。overlay 同 applyCKP：在解腿之前叠加上半身的修饰。
 */
export function runCycle(h: Human, pose: Pose, phase: number, st: RunStyle, overlay?: () => void): void {
  const J = h.J;
  const d = h.d;
  const f = st.stance;
  const c1 = Math.cos(TAU * phase);
  const mid = phase - f * 0.5;
  // 每步一次的起伏：支撑中点最低
  const bob = -st.bob * Math.cos(2 * TAU * mid);
  pose.pos(J.hips, st.sway * Math.cos(TAU * mid), -st.drop + bob, 0);
  pose.rot(J.hips, st.lean * 0.45, -st.twist * c1, -2.5 * Math.cos(TAU * mid));
  pose.rot(J.spine, st.lean * 0.35, st.twist * 0.9 * c1, 0);
  pose.rot(J.chest, st.lean * 0.2, st.twist * 0.9 * c1, 0);
  pose.rot(J.neck, -st.lean * 0.3, -st.twist * 0.4 * c1, 0);
  pose.rot(J.head, -st.lean * 0.3, -st.twist * 0.3 * c1, 0);
  if (st.arm > 0) {
    // 左腿在前(c1=1)时左臂在后
    pose.rot(J.armL, st.arm * c1 + 8, 0, 8);
    pose.rot(J.foreL, -st.elbow + 18 * c1, 0, 0);
    pose.rot(J.armR, -st.arm * c1 + 8, 0, -8);
    pose.rot(J.foreR, -st.elbow - 18 * c1, 0, 0);
  }
  if (overlay) overlay();
  footPath(phase % 1, st, d.ankleY, _fp);
  plantFoot(h, pose, 1, st.width, _fp[1], _fp[0], _fp[2], 0);
  footPath((phase + 0.5) % 1, st, d.ankleY, _fp);
  plantFoot(h, pose, -1, -st.width, _fp[1], _fp[0], _fp[2], 0);
}

// ───────────── 通用状态动作(眩晕/击飞/阵亡/待机呼吸) ─────────────

export interface CommonAnims {
  stance: CKP;
  stun: CKP;
  air: CKP;
  dead: TrackKey[];
  tmp: CKP;
}

export interface CommonOpts {
  /** 眩晕/击飞/阵亡时手臂与武器的覆盖(各英雄武器的握法不同) */
  limp?: KP;
  /** 倒地后的手臂与武器摆放 */
  lying?: KP;
  /** 倒地时髋部离地高度(身体厚的英雄大一些) */
  lieY?: number;
}

/** 由站姿派生出各英雄通用的 眩晕 / 腾空 / 阵亡 姿态 */
export function makeCommon(h: Human, stance: CKP, o: CommonOpts = {}): CommonAnims {
  const d = h.d;
  const leg = d.hipY - d.ankleY;
  const limp = o.limp ?? {};
  const stun = kp(h, stance, {
    hipsPos: [0, -0.12 * leg, 0],
    hips: [6, 0, 0],
    spine: [10, 0, 0],
    chest: [8, 0, 0],
    neck: [14, 0, 0],
    head: [18, 0, 0],
    armL: [6, 0, 14],
    foreL: [-14, 0, 0],
    armR: [6, 0, -14],
    foreR: [-14, 0, 0],
    ...limp,
  });
  const air = kp(h, null, {
    hips: [-24, 0, 0],
    spine: [-10, 0, 0],
    chest: [-12, 0, 0],
    head: [-16, 0, 0],
    footL: [d.hipX + 0.04, d.ankleY + 0.3 * leg, 0.34 * leg, 30, 10],
    footR: [-d.hipX - 0.04, d.ankleY + 0.16 * leg, 0.16 * leg, 40, -10],
    armL: [-30, 0, 70],
    foreL: [-30, 0, 0],
    armR: [-20, 0, -80],
    foreR: [-40, 0, 0],
    ...limp,
  });
  // 阵亡：膝盖一软(d1) → 向后仰倒(d2)
  const d1 = kp(h, stance, {
    hipsPos: [0, -0.4 * leg, -0.12 * leg],
    hips: [-20, 0, 0],
    spine: [-14, 0, 0],
    chest: [-12, 0, 0],
    head: [-24, 0, 0],
    armL: [-10, 0, 50],
    armR: [-10, 0, -50],
    ...limp,
  });
  const lieY = o.lieY ?? 0.17;
  const d2 = kp(h, null, {
    hipsPos: [0, lieY - d.pelvisY, -0.5 * leg],
    hips: [-84, 0, 0],
    spine: [-4, 0, 0],
    chest: [-2, 6, 0],
    neck: [0, 10, 0],
    head: [0, 24, 0],
    footL: [d.hipX + 0.08, d.ankleY + 0.03, 0.55 * leg, 50, 24],
    footR: [-d.hipX - 0.05, d.ankleY + 0.25 * leg, 0.3 * leg, 20, -20],
    armL: [-6, 0, 62],
    foreL: [-30, 0, 0],
    armR: [-4, 0, -74],
    foreR: [-14, 0, 0],
    ...limp,
    ...(o.lying ?? {}),
  });
  const dead = track([
    [0, stance],
    [0.16, d1, E.out],
    [0.42, d2, E.in],
    [1, d2, E.lin],
  ]);
  return { stance, stun, air, dead, tmp: emptyCKP(h) };
}

/**
 * 处理各英雄通用的状态：眩晕摇晃 / 被击飞 / 阵亡倒地。已处理返回 true。
 * (待机、移动、出招由各英雄自己实现)
 */
export function animateCommon(h: Human, pose: Pose, anim: string, t: number, p: number, time: number, C: CommonAnims): boolean {
  const J = h.J;
  switch (anim) {
    case 'stunned':
      applyCKP(h, pose, C.stun, () => {
        const w = time * 5.2;
        pose.add(J.hips, Math.sin(w) * 4, 0, Math.cos(w) * 5);
        pose.add(J.chest, Math.cos(w) * 3, 0, Math.sin(w) * 3);
        pose.add(J.head, Math.cos(w * 1.1) * 6, 0, Math.sin(w * 1.1) * 8);
      });
      return true;
    case 'airborne':
      applyCKP(h, pose, C.air, () => {
        // 抛起时后仰、落下时略收
        pose.add(J.hips, -14 * Math.sin(p * Math.PI) + 10 * p, 0, 6 * Math.sin(p * 9));
      });
      return true;
    case 'dead':
      sampleTrack(C.dead, sat(t / 1.5), C.tmp);
      applyCKP(h, pose, C.tmp);
      return true;
    default:
      return false;
  }
}

/** 待机时的呼吸叠加层(在 applyCKP 的 overlay 里调用) */
export function breathe(h: Human, pose: Pose, time: number, seed: number, amount = 1): number {
  const J = h.J;
  const b = Math.sin(time * 2.1 + seed * 6.28);
  pose.add(J.chest, b * 1.4 * amount, 0, 0);
  pose.add(J.spine, b * 0.6 * amount, 0, 0);
  pose.move(J.hips, 0, b * 0.006 * amount, 0);
  pose.add(J.head, -b * 0.8 * amount, Math.sin(time * 0.7 + seed * 9) * 3 * amount, 0);
  pose.add(J.armL, 0, 0, b * 1.2 * amount);
  pose.add(J.armR, 0, 0, -b * 1.2 * amount);
  return b;
}
