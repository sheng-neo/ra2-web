/**
 * 四足骨架模板：根 / 腰 / 胸 / 颈 N 节 / 头 / (下颌) / 尾 N 节 / 四肢各 上·下·掌。
 * 鹿、熊、獾、龙和攻城兵共用：各模型只给关节位置，这里负责建骨架、两段式 IK 落脚、步态(慢走 / 对角小跑 / 熊式奔跃)、人立。
 *
 * 约定(与 rig.ts 一致)：+Z 前、+Y 上、+X 左；腰是根的子关节，胸是腰的子关节(转腰 = 整个前半身跟着转，人立靠它)；
 * 后腿挂在腰上，前腿挂在胸上。脚的目标点一律在「根空间」里给出，所以先摆好躯干(腰 / 胸的位移与旋转)，
 * 最后再调 plant / stand / gait 解腿——这样无论躯干怎么起伏，脚都踩在原地不打滑。
 */
import { type Pose, Rig, ikLimb, setSpaceRot } from './rig';

const TAU = Math.PI * 2;

export interface QuadSpec {
  /** 腰、胸关节的 [高度, 前后位置] */
  pelvis: number[];
  chest: number[];
  /** 颈各节关节的 [y, z](自胸向头) */
  neck: number[][];
  head: number[];
  /** 下颌关节(可选) */
  jaw?: number[];
  /** 尾各节关节的 [y, z](自腰向尾尖)；可带第三个数 x(盘向一侧的尾巴) */
  tail: number[][];
  /** 左前腿：肩、肘(腕)、掌 三个关节的 [x, y, z]；右腿自动镜像 */
  front: number[][];
  /** 左后腿：髋、膝(飞节)、掌 */
  hind: number[][];
  /** 中间关节的弯曲朝向：+1 朝前凸(人的膝、蹄类前腿的腕)，-1 朝后凸(肘、蹄类后腿的飞节) */
  bendFront: 1 | -1;
  bendHind: 1 | -1;
}

export interface QuadLeg {
  upper: number;
  lower: number;
  foot: number;
  side: 1 | -1;
  front: boolean;
  bend: 1 | -1;
  /** 掌关节的绑定位置(根空间)：站立时的落脚点 */
  rx: number;
  ry: number;
  rz: number;
}

export interface Quad {
  rig: Rig;
  root: number;
  pelvis: number;
  chest: number;
  neck: number[];
  head: number;
  /** 没有下颌时为 -1 */
  jaw: number;
  tail: number[];
  /** 0 左前 / 1 右前 / 2 左后 / 3 右后 */
  legs: QuadLeg[];
}

export function quadRig(s: QuadSpec): Quad {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const pelvis = rig.add('pelvis', root, 0, s.pelvis[0], s.pelvis[1]);
  const chest = rig.add('chest', pelvis, 0, s.chest[0], s.chest[1]);
  const neck: number[] = [];
  s.neck.forEach((p, i) => neck.push(rig.add(`neck${i}`, i === 0 ? chest : neck[i - 1], 0, p[0], p[1])));
  const head = rig.add('head', neck.length ? neck[neck.length - 1] : chest, 0, s.head[0], s.head[1]);
  const jaw = s.jaw ? rig.add('jaw', head, 0, s.jaw[0], s.jaw[1]) : -1;
  const tail: number[] = [];
  s.tail.forEach((p, i) => tail.push(rig.add(`tail${i}`, i === 0 ? pelvis : tail[i - 1], p[2] ?? 0, p[0], p[1])));
  const legs: QuadLeg[] = [];
  const leg = (name: string, pts: number[][], side: 1 | -1, front: boolean): void => {
    const upper = rig.add(`${name}U`, front ? chest : pelvis, pts[0][0] * side, pts[0][1], pts[0][2]);
    const lower = rig.add(`${name}L`, upper, pts[1][0] * side, pts[1][1], pts[1][2]);
    const foot = rig.add(`${name}F`, lower, pts[2][0] * side, pts[2][1], pts[2][2]);
    legs.push({ upper, lower, foot, side, front, bend: front ? s.bendFront : s.bendHind, rx: pts[2][0] * side, ry: pts[2][1], rz: pts[2][2] });
  };
  leg('fl', s.front, 1, true);
  leg('fr', s.front, -1, true);
  leg('hl', s.hind, 1, false);
  leg('hr', s.hind, -1, false);
  return { rig, root, pelvis, chest, neck, head, jaw, tail, legs };
}

const _lq = [0, 0, 0, 1];

/**
 * 让第 i 条腿的掌关节到达根空间里的 (x, y, z)，掌保持水平(可再给一个俯仰角：正值 = 趾尖向下)。
 * 调用前躯干(腰 / 胸)的姿态必须已经定好。
 */
export function plantLeg(q: Quad, pose: Pose, i: number, x: number, y: number, z: number, pitch = 0): void {
  const l = q.legs[i];
  ikLimb(q.rig, pose, l.upper, l.lower, l.foot, x, y, z, l.side * 0.12, 0.1, l.bend, l.bend, _lq);
  setSpaceRot(pose, l.foot, _lq, pitch, 0, 0);
}

/** 四脚都踩在各自的站位上(可整体偏移 dx / dz；legsMask 的 bit i = 这条腿参与，默认全部) */
export function standLegs(q: Quad, pose: Pose, dx = 0, dz = 0, legsMask = 15): void {
  for (let i = 0; i < 4; i++) {
    if (!(legsMask & (1 << i))) continue;
    const l = q.legs[i];
    plantLeg(q, pose, i, l.rx + dx, l.ry, l.rz + dz);
  }
}

/** 直接给一条腿摆角度(正向运动学，人立时悬空的前腿用)：上段 / 下段 / 掌 绕 X 的角度(度)，上段另可外展 */
export function poseLeg(q: Quad, pose: Pose, i: number, upperX: number, lowerX: number, footX = 0, spread = 0): void {
  const l = q.legs[i];
  pose.rot(l.upper, upperX, 0, l.side * spread);
  pose.rot(l.lower, lowerX, 0, 0);
  pose.rot(l.foot, footX, 0, 0);
}

export type GaitStyle = 'walk' | 'trot' | 'bound';

export interface GaitOpts {
  style: GaitStyle;
  /** 一个完整循环身体前进的距离(模型空间，米) = ModelDef.stride / 缩放 */
  stride: number;
  /** 抬脚高度(米) */
  lift: number;
  /** 躯干起伏幅度(米) / 俯仰摆幅(度) / 偏航摆幅(度) / 侧倾摆幅(度) */
  bob?: number;
  pitch?: number;
  sway?: number;
  roll?: number;
  /** 抬起的脚向后勾的角度(度) */
  curl?: number;
  /** 幅度倍率 0..1(起步 / 收步时渐入渐出) */
  amount?: number;
}

/** 各步态四条腿的相位差(左前 / 右前 / 左后 / 右后)与着地占比 */
const GAITS: Record<GaitStyle, { off: number[]; duty: number }> = {
  walk: { off: [0, 0.5, 0.75, 0.25], duty: 0.64 },
  trot: { off: [0, 0.5, 0.5, 0], duty: 0.5 },
  bound: { off: [0, 0.14, 0.56, 0.7], duty: 0.42 },
};

/**
 * 步态：先给躯干叠上起伏 / 摆动，再用 IK 让四只脚按相位「着地后划 → 抬起前摆」。
 * phase 为循环相位 0..1(单位视图按实际位移累计，所以脚不打滑)。
 */
export function gait(q: Quad, pose: Pose, phase: number, o: GaitOpts): void {
  const g = GAITS[o.style];
  const amt = o.amount ?? 1;
  const c = phase * TAU;
  const bob = (o.bob ?? 0) * amt;
  const pitch = (o.pitch ?? 0) * amt;
  if (o.style === 'bound') {
    // 奔跃：一个循环一次腾跃，前半身与后半身反相起伏(脊柱屈伸)
    pose.move(q.pelvis, 0, bob * Math.sin(c + 2.2), 0);
    pose.add(q.pelvis, pitch * Math.sin(c + 0.5), 0, 0);
    pose.add(q.chest, -pitch * 1.5 * Math.sin(c + 1.0), 0, 0);
  } else {
    // 慢走 / 小跑：每步一次起伏
    pose.move(q.pelvis, 0, -bob * Math.cos(c * 2), 0);
    pose.add(q.pelvis, pitch * Math.sin(c * 2 + 0.6), (o.sway ?? 0) * amt * Math.sin(c), (o.roll ?? 0) * amt * Math.sin(c));
    pose.add(q.chest, 0, -(o.sway ?? 0) * amt * 1.6 * Math.sin(c), 0);
  }
  for (let i = 0; i < 4; i++) {
    const l = q.legs[i];
    let f = phase + g.off[i];
    f -= Math.floor(f);
    const reach = o.stride * g.duty * amt;
    let z: number;
    let y = 0;
    let toe = 0;
    if (f < g.duty) {
      // 支撑相：脚相对身体匀速后移
      z = reach * (0.5 - f / g.duty);
    } else {
      const u = (f - g.duty) / (1 - g.duty);
      const e = u * u * (3 - 2 * u);
      z = reach * (e - 0.5);
      y = o.lift * amt * Math.sin(Math.PI * u) * (1 - 0.35 * u);
      toe = (o.curl ?? 30) * amt * Math.sin(Math.PI * Math.min(1, u * 1.3));
    }
    plantLeg(q, pose, i, l.rx, l.ry + y, l.rz + z, toe);
  }
}

/**
 * 人立：腰向后上方翻起 k(0..1)×angle 度，后脚仍踩在原地；前腿悬空，由调用方用 poseLeg 摆姿势。
 * back 为重心后移的距离(米)。
 */
export function rearUp(q: Quad, pose: Pose, k: number, angle = 52, back = 0.3): void {
  pose.add(q.pelvis, -angle * k, 0, 0);
  pose.move(q.pelvis, 0, -0.08 * k, -back * k);
  standLegs(q, pose, 0, 0, 12);
}

/** 尾巴 / 脖子等关节链的行波：每节绕 Y(左右)与 X(上下)按相位递推摆动 */
export function waveChain(pose: Pose, joints: number[], t: number, yawAmp: number, pitchAmp = 0, step = 0.7, grow = 0.25): void {
  for (let i = 0; i < joints.length; i++) {
    const k = 1 + i * grow;
    pose.add(joints[i], pitchAmp * k * Math.sin(t * 1.3 - i * step), yawAmp * k * Math.sin(t - i * step), 0);
  }
}

/** 受击的短促脉冲 0..1：0.03 秒到顶，0.22 秒内回落(叠加在当前动作上，不打断动作) */
export function hitPulse(hitT: number, dur = 0.22): number {
  if (hitT < 0 || hitT >= dur) return 0;
  const x = hitT / dur;
  return Math.min(1, x * 7) * (1 - x) * (1 - x);
}
