/**
 * 近景行人（R4 STREET S-P0-1）：≤ 900 个三角形的平滑人形（顶点法线，无棱面），30 m 内、≤ 64 个实例。
 *
 * 局部坐标（未按身高缩放的 1.70 m 男性）：+x 向前、+y 向上、+z 向右（与 R2 的低模人相同）。
 * 部件（aPart）：脸 / 皮肤、头发、上衣（含上臂、前臂按短袖切成皮肤）、下装、裙、鞋、包、手机、帽舌。
 * 骨骼（aBone，刚性 + aBend 关节混合，不用骨骼贴图）：骨盆、胸（扭转按高度混合）、头、左右大腿 / 小腿 / 脚、
 * 左右上臂 / 前臂（含手）、背包（随胸）、手提包（随左前臂）、手机（随右前臂）。
 * 头发：一层贴着头骨的发壳（发际线按方位：额头高、耳上、后颈低）+ 「长发」形变量 aMorph（发壳下两圈往肩后垂），
 * 每人按发型取 0（短发 / 侧分 / 马尾 / 帽）、0.45（齐耳短发）、1（长发）；马尾、帽舌是另加的小件，只在对应发型上画。
 * 选配件（裙、马尾、帽舌、背包、斜挎包、托特包、公文包、手机）用 aGate：实例没有就把顶点丢到裁剪空间外。
 * 步态：gait() 给出各关节角（与着色器同一组常数，见 GLSL_GAIT），测试用。
 */
import { BufferAttribute, InstancedBufferGeometry } from 'three';

/** 部件编号（aPart）。 */
export const FP = {
  skin: 0,
  hair: 1,
  top: 2,
  bottom: 3,
  shoe: 4,
  phone: 5,
  bag: 6,
  skirt: 7,
  /** 上臂（肩→肘，aU 0–1；短袖的人 aU > 0.45 露皮肤）。 */
  upperArm: 8,
  /** 前臂（长袖 = 上衣色，短袖 = 皮肤）。 */
  foreArm: 9,
  /** 帽舌 / 帽顶。 */
  cap: 10,
  /** 脸（皮肤；戴口罩的人下半张脸换成口罩色）。 */
  face: 11,
} as const;

/** 骨骼编号（aBone）。 */
export const FB = {
  pelvis: 0,
  chest: 1,
  head: 2,
  thighL: 3,
  shinL: 4,
  footL: 5,
  thighR: 6,
  shinR: 7,
  footR: 8,
  upperL: 9,
  foreL: 10,
  upperR: 11,
  foreR: 12,
  pack: 13,
} as const;

/** 选配件（aGate）：0 = 人人都有。 */
export const FG = {
  always: 0,
  skirt: 1,
  ponytail: 2,
  brim: 3,
  backpack: 4,
  shoulderBag: 5,
  tote: 6,
  briefcase: 7,
  phone: 8,
} as const;

/** 关节枢轴（局部米，1.70 m 人形）。 */
export const PIVOT = {
  hip: [0, 0.9, 0.09],
  knee: [0, 0.49, 0.09],
  ankle: [0, 0.085, 0.09],
  shoulder: [0, 1.375, 0.185],
  elbow: [0.0, 1.09, 0.205],
  neck: [0, 1.5, 0],
} as const;

/** 步态常数（与 GLSL_GAIT 一致）。 */
export const GAIT = {
  /** 大腿前后摆幅（rad）。 */
  hip: 0.34,
  /** 摆动期膝盖最大弯曲（rad）。 */
  knee: 1.0,
  /** 支撑期膝盖微弯（rad）。 */
  kneeStance: 0.08,
  /** 手臂摆幅 / 大腿摆幅（反向）。 */
  arm: 0.55,
  /** 肘部常弯（rad）与向前摆时多弯的量。 */
  elbow: 0.22,
  elbowSwing: 0.3,
  /** 上身扭转（rad）。 */
  twist: 0.07,
  /** 每步起伏（m）。 */
  bob: 0.025,
} as const;

export interface GaitAngles {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shoulderL: number;
  shoulderR: number;
  elbowL: number;
  elbowR: number;
  twist: number;
  bob: number;
}

/**
 * 步态关节角（纯函数，测试用；着色器 GLSL_GAIT 同一公式）。phase：步态相位（rad，一个周期两步）；walk：0 站 – 1 走。
 * 角度正值 = 肢体末端往前（+x）摆；膝盖、肘的正值 = 弯曲。
 */
export function gait(phase: number, walk: number): GaitAngles {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const hipL = GAIT.hip * walk * s;
  const kneeL = walk * (GAIT.kneeStance + GAIT.knee * Math.pow(Math.max(0, c), 1.5)) + (1 - walk) * 0.04;
  const kneeR = walk * (GAIT.kneeStance + GAIT.knee * Math.pow(Math.max(0, -c), 1.5)) + (1 - walk) * 0.04;
  const shoulderL = -GAIT.arm * hipL;
  const shoulderR = GAIT.arm * hipL;
  const elbowL = GAIT.elbow + GAIT.elbowSwing * walk * Math.max(0, -s) * 0.6;
  const elbowR = GAIT.elbow + GAIT.elbowSwing * walk * Math.max(0, s) * 0.6;
  return {
    hipL,
    hipR: -hipL,
    kneeL,
    kneeR,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    twist: -GAIT.twist * walk * s,
    bob: walk * GAIT.bob * (Math.abs(c) - 0.5),
  };
}

/** GLSL：与 gait() 相同的关节角（ph 相位，walk 0–1）。 */
export const GLSL_GAIT = /* glsl */ `
void gaitAngles(float ph, float walk, out vec4 legs, out vec4 arms, out vec2 body) {
float s = sin(ph);
float c = cos(ph);
float hipL = ${GAIT.hip.toFixed(3)} * walk * s;
float kneeL = walk * (${GAIT.kneeStance.toFixed(3)} + ${GAIT.knee.toFixed(3)} * pow(max(0.0, c), 1.5)) + (1.0 - walk) * 0.04;
float kneeR = walk * (${GAIT.kneeStance.toFixed(3)} + ${GAIT.knee.toFixed(3)} * pow(max(0.0, -c), 1.5)) + (1.0 - walk) * 0.04;
legs = vec4(hipL, -hipL, kneeL, kneeR);
arms = vec4(-${GAIT.arm.toFixed(3)} * hipL, ${GAIT.arm.toFixed(3)} * hipL,
${GAIT.elbow.toFixed(3)} + ${GAIT.elbowSwing.toFixed(3)} * walk * max(0.0, -s) * 0.6,
${GAIT.elbow.toFixed(3)} + ${GAIT.elbowSwing.toFixed(3)} * walk * max(0.0, s) * 0.6);
body = vec2(-${GAIT.twist.toFixed(3)} * walk * s, walk * ${GAIT.bob.toFixed(3)} * (abs(c) - 0.5));
}
`;

interface Attr {
  pos: number[];
  nrm: number[];
  part: number[];
  bone: number[];
  bend: number[];
  gate: number[];
  u: number[];
  ao: number[];
  morph: number[];
  index: number[];
}

/** 一个顶点的附加属性。 */
interface VInfo {
  part: number;
  bone: number;
  bend?: number;
  gate?: number;
  u?: number;
  ao?: number;
  morph?: readonly [number, number, number];
}

/** 一圈：中心 (x, y, z)、前后半径 rx、左右半径 rz、顶点属性。 */
interface Ring {
  c: readonly [number, number, number];
  rx: number;
  rz: number;
  info: VInfo;
  /** 第 j 个顶点（角度 a）的额外位移（鼻子、耳朵）。 */
  bump?: (a: number) => readonly [number, number, number];
}

class Builder {
  readonly a: Attr = { pos: [], nrm: [], part: [], bone: [], bend: [], gate: [], u: [], ao: [], morph: [], index: [] };

  vert(p: readonly number[], v: VInfo): number {
    const a = this.a;
    a.pos.push(p[0]!, p[1]!, p[2]!);
    a.nrm.push(0, 0, 0);
    a.part.push(v.part);
    a.bone.push(v.bone);
    a.bend.push(v.bend ?? 1);
    a.gate.push(v.gate ?? 0);
    a.u.push(v.u ?? 0);
    a.ao.push(v.ao ?? 1);
    const m = v.morph ?? [0, 0, 0];
    a.morph.push(m[0], m[1], m[2]);
    return a.pos.length / 3 - 1;
  }

  tri(i: number, j: number, k: number): void {
    this.a.index.push(i, j, k);
  }

  /**
   * 管状体：自下而上（或任意顺序）的一串圈，每圈 segs 个顶点（角度 0 = 正前方 +x，π/2 = 右 +z），共享顶点、平滑法线。
   * capStart / capEnd：首 / 末圈加扇形盖（盖心位置给出）。outward：法线朝外（三角形绕向按圈的走向自动定）。
   */
  tube(rings: readonly Ring[], segs: number, capStart?: readonly [number, number, number], capEnd?: readonly [number, number, number], phase = 0): void {
    const start = this.a.pos.length / 3;
    const ids: number[][] = [];
    for (const r of rings) {
      const row: number[] = [];
      for (let j = 0; j < segs; j++) {
        const ang = phase + (j / segs) * Math.PI * 2;
        const b = r.bump?.(ang) ?? [0, 0, 0];
        row.push(this.vert([r.c[0] + r.rx * Math.cos(ang) + b[0], r.c[1] + b[1], r.c[2] + r.rz * Math.sin(ang) + b[2]], r.info));
      }
      ids.push(row);
    }
    // 圈序方向：首圈到末圈是上升（y 增）还是下降，决定绕向使法线朝外
    const up = rings[rings.length - 1]!.c[1] >= rings[0]!.c[1];
    for (let i = 0; i + 1 < ids.length; i++) {
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const a = ids[i]![j]!;
        const b = ids[i]![j1]!;
        const c = ids[i + 1]![j1]!;
        const d = ids[i + 1]![j]!;
        // 角度增大 = 从 +x 转向 +z（从上往下看顺时针），向上的圈序时 a→d→c 朝外
        if (up) {
          this.tri(a, d, c);
          this.tri(a, c, b);
        } else {
          this.tri(a, c, d);
          this.tri(a, b, c);
        }
      }
    }
    const cap = (row: number[], centre: readonly [number, number, number], info: VInfo, top: boolean) => {
      const ci = this.vert(centre, info);
      for (let j = 0; j < segs; j++) {
        const a = row[j]!;
        const b = row[(j + 1) % segs]!;
        if (top) this.tri(ci, b, a);
        else this.tri(ci, a, b);
      }
    };
    const endsUp = up;
    if (capStart) cap(ids[0]!, capStart, rings[0]!.info, !endsUp);
    if (capEnd) cap(ids[ids.length - 1]!, capEnd, rings[rings.length - 1]!.info, endsUp);
    this.smooth(start);
  }

  /** 盒子（只画给出的面，扁平法线：包、鞋底面等小件）。中心 c、半尺寸 h，各面同一属性。 */
  box(c: readonly number[], h: readonly number[], info: VInfo, skipBottom = false, taperTop = 1): void {
    const P = (x: number, y: number, z: number) => [c[0]! + x * h[0]! * (y > 0 ? taperTop : 1), c[1]! + y * h[1]!, c[2]! + z * h[2]!];
    const quad = (p: number[][]) => {
      const e1 = [p[1]![0]! - p[0]![0]!, p[1]![1]! - p[0]![1]!, p[1]![2]! - p[0]![2]!];
      const e2 = [p[3]![0]! - p[0]![0]!, p[3]![1]! - p[0]![1]!, p[3]![2]! - p[0]![2]!];
      const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      const ids = p.map((q) => this.vert(q, info));
      for (const i of ids) this.a.nrm.splice(i * 3, 3, n[0]! / l, n[1]! / l, n[2]! / l);
      this.tri(ids[0]!, ids[1]!, ids[2]!);
      this.tri(ids[0]!, ids[2]!, ids[3]!);
    };
    quad([P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)]); // +x
    quad([P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1)]); // −x
    quad([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)]); // +z
    quad([P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)]); // −z
    quad([P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)]); // +y
    if (!skipBottom) quad([P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)]); // −y
  }

  /** 从下标 start 起的顶点：按三角形面积加权累加面法线（平滑）。 */
  private smooth(start: number): void {
    smoothRange(this.a, start, this.a.pos.length / 3);
  }
}

/** 头的轮廓（局部 y → 前后 / 左右半径与前后偏移），头发壳按它往外加厚。 */
const HEAD: readonly (readonly [number, number, number, number])[] = [
  // y, rx, rz, x 偏移
  [1.505, 0.034, 0.03, 0.034],
  [1.528, 0.07, 0.056, 0.022],
  [1.562, 0.091, 0.07, 0.012],
  [1.603, 0.099, 0.077, 0.004],
  [1.645, 0.099, 0.077, 0.0],
  [1.685, 0.083, 0.066, -0.004],
  [1.71, 0.05, 0.04, -0.006],
];
const CROWN_Y = 1.722;

function headAt(y: number): [number, number, number] {
  if (y <= HEAD[0]![0]) return [HEAD[0]![1], HEAD[0]![2], HEAD[0]![3]];
  for (let i = 1; i < HEAD.length; i++) {
    const a = HEAD[i - 1]!;
    const b = HEAD[i]!;
    if (y <= b[0]) {
      const t = (y - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  const l = HEAD[HEAD.length - 1]!;
  const t = Math.min((y - l[0]) / (CROWN_Y - l[0]), 1);
  return [l[1] * (1 - t * 0.8), l[2] * (1 - t * 0.8), l[3]];
}

/** 发际线高度（按方位角 a：0 前额、±π/2 耳上、π 后颈）。 */
function hairline(a: number): number {
  const back = (1 - Math.cos(a)) / 2; // 0 前 … 1 后
  const side = Math.abs(Math.sin(a));
  return 1.66 - 0.07 * side - 0.1 * back * back;
}

/** 近景人形几何（一份，所有实例共用）。 */
export function nearFigureGeometry(): InstancedBufferGeometry {
  const b = new Builder();
  const ring = (y: number, rx: number, rz: number, info: VInfo, x = 0, z = 0, bump?: Ring['bump']): Ring => ({ c: [x, y, z], rx, rz, info, bump });

  // ---- 腿（大腿 3 圈 + 小腿 3 圈，8 边）与鞋 ----
  for (const side of [-1, 1]) {
    const z = PIVOT.hip[2] * side;
    const thigh = side < 0 ? FB.thighL : FB.thighR;
    const shin = side < 0 ? FB.shinL : FB.shinR;
    const foot = side < 0 ? FB.footL : FB.footR;
    const leg = (bone: number, bend: number, u: number, ao = 1): VInfo => ({ part: FP.bottom, bone, bend, u, ao });
    b.tube(
      [ring(0.95, 0.085, 0.08, leg(thigh, 1, 0, 0.8), 0.0, z * 0.95), ring(0.72, 0.07, 0.066, leg(thigh, 1, 0.4)), ring(0.5, 0.054, 0.052, leg(shin, 0.5, 0.8))].map((r, i) =>
        i === 0 ? r : { ...r, c: [r.c[0], r.c[1], z] as const },
      ),
      8,
    );
    b.tube(
      [ring(0.5, 0.054, 0.052, leg(shin, 0.5, 0.8), 0.0, z), ring(0.34, 0.056, 0.05, leg(shin, 1, 0.9), -0.008, z), ring(0.1, 0.036, 0.034, leg(shin, 1, 1.0), 0.0, z)],
      8,
    );
    // 鞋：脚跟在踝后 5 cm、脚尖往前 19 cm，前低后高
    b.box([0.065, 0.045, z], [0.125, 0.045, 0.048], { part: FP.shoe, bone: foot, ao: 0.9 }, true, 0.85);
  }
  // ---- 躯干（9 圈、10 边）：胯 → 臀 → 腰 → 腹 → 胸 → 肩（三角肌）→ 肩斜两圈 → 颈根；aBend = 胸部扭转的权重 ----
  const torso = (y: number, rx: number, rz: number, x: number, w: number, ao = 1): Ring => ring(y, rx, rz, { part: FP.top, bone: FB.chest, bend: w, u: y, ao }, x);
  b.tube(
    [
      torso(0.8, 0.095, 0.15, 0.0, 0, 0.7),
      torso(0.92, 0.112, 0.17, -0.004, 0),
      torso(1.04, 0.098, 0.148, 0.0, 0.2),
      torso(1.15, 0.104, 0.158, 0.006, 0.45),
      torso(1.27, 0.112, 0.176, 0.01, 0.8),
      torso(1.355, 0.1, 0.196, 0.004, 1, 0.9),
      torso(1.405, 0.082, 0.168, -0.004, 1),
      torso(1.438, 0.062, 0.105, -0.006, 1),
      torso(1.458, 0.05, 0.055, 0.0, 1),
    ],
    10,
    [0, 0.8, 0],
  );
  // ---- 颈 ----
  b.tube([ring(1.43, 0.048, 0.046, { part: FP.skin, bone: FB.chest, ao: 0.75 }), ring(1.53, 0.043, 0.041, { part: FP.skin, bone: FB.head, ao: 0.85 }, 0.008)], 8);
  // ---- 头（7 圈、10 边）：下巴 → 颌 → 颧 → 眼 → 额 → 头顶；正面鼻梁、两侧耳朵微凸 ----
  const nose = (a: number): [number, number, number] => {
    const f = Math.max(0, Math.cos(a));
    return [Math.pow(f, 12) * 0.018, 0, 0];
  };
  const ears = (a: number): [number, number, number] => {
    const s = Math.pow(Math.abs(Math.sin(a)), 10);
    return [-0.004 * s, 0, 0.009 * s * Math.sign(Math.sin(a))];
  };
  const face: VInfo = { part: FP.face, bone: FB.head };
  b.tube(
    HEAD.map(([y, rx, rz, x], i) => ring(y, rx, rz, { ...face, u: y, ao: i === 0 ? 0.85 : 1 }, x, 0, i === 2 ? nose : i === 3 ? (a) => {
      const n = nose(a);
      const e = ears(a);
      return [n[0] * 0.6 + e[0], 0, e[2]];
    } : undefined)),
    10,
    [0.03, 1.5, 0],
    [-0.006, CROWN_Y, 0],
  );
  // ---- 头发壳（10 边）：发冠 → 发际线 4 圈 + 「长发」形变 2 圈 ----
  {
    const segs = 10;
    const rows: number[][] = [];
    const T = [0.18, 0.4, 0.62, 0.82, 1.0, 1.0, 1.0];
    const thick = 0.014;
    T.forEach((t, k) => {
      const row: number[] = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const hl = hairline(a);
        const y = CROWN_Y + 0.006 - (CROWN_Y + 0.006 - hl) * t;
        const [rx, rz, x0] = headAt(Math.min(y, 1.705));
        const shrink = y > 1.70 ? 1 - (y - 1.7) / 0.03 : 1;
        const px = x0 + (rx + thick) * Math.cos(a) * shrink;
        const pz = (rz + thick) * Math.sin(a) * shrink;
        // 长发形变：后脑 / 两侧往下垂到肩（后 1.30、侧 1.40），前面只到眉（刘海）；k = 5、6 两圈
        let morph: [number, number, number] = [0, 0, 0];
        if (k >= 5) {
          const back = (1 - Math.cos(a)) / 2;
          const side = Math.abs(Math.sin(a));
          const drop = k === 5 ? 0.55 : 1;
          const yLong = mix(1.6, mix(1.42, 1.3, back), Math.max(back, side * 0.8)) ;
          const yy = mix(y, yLong, drop) - y;
          const out = (k === 5 ? 0.012 : 0.03) * Math.max(back, side);
          morph = [Math.cos(a) * out - 0.02 * back * drop, Math.min(yy, 0), Math.sin(a) * (out + 0.01 * side)];
        }
        row.push(b.vert([px, y, pz], { part: FP.hair, bone: FB.head, morph, u: t, ao: k >= 4 ? 0.8 : 1 }));
      }
      rows.push(row);
    });
    const ci = b.vert([-0.004, CROWN_Y + 0.012, 0], { part: FP.hair, bone: FB.head, u: 0 });
    for (let j = 0; j < segs; j++) b.tri(ci, rows[0]![(j + 1) % segs]!, rows[0]![j]!);
    for (let k = 0; k + 1 < rows.length; k++) {
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const a = rows[k]![j]!;
        const c = rows[k]![j1]!;
        const d = rows[k + 1]![j1]!;
        const e = rows[k + 1]![j]!;
        b.tri(a, c, d);
        b.tri(a, d, e);
      }
    }
    smoothRange(b.a, rows[0]![0]! - 0, b.a.pos.length / 3);
  }
  // ---- 马尾（6 边 3 圈）----
  b.tube(
    [
      ring(1.63, 0.03, 0.032, { part: FP.hair, bone: FB.head, gate: FG.ponytail }, -0.105),
      ring(1.52, 0.026, 0.026, { part: FP.hair, bone: FB.head, gate: FG.ponytail }, -0.13),
      ring(1.4, 0.016, 0.018, { part: FP.hair, bone: FB.head, gate: FG.ponytail }, -0.125),
    ],
    6,
    undefined,
    [-0.12, 1.36, 0],
  );
  // ---- 帽舌（棒球帽）：额前半圆片，上下两面 ----
  {
    const info: VInfo = { part: FP.cap, bone: FB.head, gate: FG.brim };
    const y = 1.668;
    const c0 = b.vert([0.07, y, 0], info);
    const up: number[] = [];
    for (let j = 0; j <= 6; j++) {
      const a = -Math.PI / 2 + (j / 6) * Math.PI;
      up.push(b.vert([0.075 + 0.085 * Math.cos(a), y - 0.012 * Math.cos(a), 0.085 * Math.sin(a)], info));
    }
    for (let j = 0; j < 6; j++) {
      b.tri(c0, up[j + 1]!, up[j]!);
      b.tri(c0, up[j]!, up[j + 1]!);
    }
    for (const i of [c0, ...up]) b.a.nrm.splice(i * 3, 3, 0.0995, 0.995, 0);
  }
  // ---- 手臂：上臂 3 圈、前臂 3 圈、手 2 圈 + 盖（6 边）----
  for (const side of [-1, 1]) {
    const upper = side < 0 ? FB.upperL : FB.upperR;
    const fore = side < 0 ? FB.foreL : FB.foreR;
    const sz = (z: number) => z * side;
    b.tube(
      [
        ring(1.41, 0.05, 0.048, { part: FP.upperArm, bone: upper, u: 0, ao: 0.85 }, 0, sz(0.178)),
        ring(1.25, 0.046, 0.044, { part: FP.upperArm, bone: upper, u: 0.55 }, 0.004, sz(0.196)),
        ring(1.09, 0.039, 0.038, { part: FP.foreArm, bone: fore, bend: 0.5, u: 1 }, 0, sz(0.205)),
      ],
      6,
    );
    b.tube(
      [
        ring(1.09, 0.039, 0.038, { part: FP.foreArm, bone: fore, bend: 0.5, u: 1 }, 0, sz(0.205)),
        ring(0.97, 0.036, 0.034, { part: FP.foreArm, bone: fore, u: 1.4 }, 0.006, sz(0.208)),
        ring(0.855, 0.027, 0.025, { part: FP.foreArm, bone: fore, u: 2 }, 0.008, sz(0.21)),
      ],
      6,
    );
    b.tube(
      [ring(0.855, 0.03, 0.018, { part: FP.skin, bone: fore, u: 2.1 }, 0.008, sz(0.21)), ring(0.79, 0.034, 0.015, { part: FP.skin, bone: fore, u: 2.4 }, 0.012, sz(0.208))],
      6,
      undefined,
      [0.014, 0.745, sz(0.205)],
    );
  }
  // ---- 裙（A 字，10 边 2 段）----
  b.tube(
    [
      ring(1.03, 0.104, 0.152, { part: FP.skirt, bone: FB.pelvis, gate: FG.skirt, u: 0 }),
      ring(0.78, 0.13, 0.178, { part: FP.skirt, bone: FB.pelvis, gate: FG.skirt, u: 0.5 }),
      ring(0.53, 0.155, 0.2, { part: FP.skirt, bone: FB.pelvis, gate: FG.skirt, u: 1 }),
    ],
    10,
  );
  // ---- 背包（随胸）：圆角盒（8 边 2 圈 + 上下盖）----
  b.tube(
    [
      { c: [-0.2, 1.0, 0], rx: 0.075, rz: 0.15, info: { part: FP.bag, bone: FB.pack, gate: FG.backpack, ao: 0.8 } },
      { c: [-0.205, 1.4, 0], rx: 0.07, rz: 0.14, info: { part: FP.bag, bone: FB.pack, gate: FG.backpack } },
    ],
    8,
    [-0.2, 0.99, 0],
    [-0.19, 1.44, 0],
    Math.PI / 8,
  );
  // ---- 斜挎包（左胯旁，随骨盆）、托特包（左肩挂到左胯，随胸）、公文包（左手提，随左前臂）----
  b.box([0.02, 0.9, -0.215], [0.12, 0.095, 0.035], { part: FP.bag, bone: FB.pelvis, gate: FG.shoulderBag });
  b.box([-0.01, 1.0, -0.245], [0.15, 0.16, 0.05], { part: FP.bag, bone: FB.chest, bend: 1, gate: FG.tote }, false, 0.9);
  b.box([0.03, 0.61, -0.23], [0.19, 0.14, 0.04], { part: FP.bag, bone: FB.foreL, gate: FG.briefcase });
  // ---- 手机（右手；垂手姿势下屏幕朝前上，抬手后朝脸）----
  {
    const info: VInfo = { part: FP.phone, bone: FB.foreR, gate: FG.phone };
    const c = [0.04, 0.79, 0.19];
    const nrm = [0.889, 0.458, 0];
    const ax = [0.457, -0.885, 0];
    const az = [0, 0, 1];
    const P = (u: number, v: number) => [c[0]! + ax[0]! * u + az[0]! * v + nrm[0]! * 0.006, c[1]! + ax[1]! * u + nrm[1]! * 0.006, c[2]! + az[2]! * v];
    const q = [P(-0.07, -0.035), P(0.07, -0.035), P(0.07, 0.035), P(-0.07, 0.035)].map((p) => b.vert(p, info));
    for (const i of q) b.a.nrm.splice(i * 3, 3, nrm[0]!, nrm[1]!, nrm[2]!);
    b.tri(q[0]!, q[2]!, q[1]!);
    b.tri(q[0]!, q[3]!, q[2]!);
  }
  return toGeometry(b.a);
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 只对 [start, end) 的顶点按面法线平滑（头发壳是手工建的网格）。 */
function smoothRange(a: Attr, start: number, end: number): void {
  for (let q = start; q < end; q++) a.nrm.splice(q * 3, 3, 0, 0, 0);
  const n = a.nrm;
  const p = a.pos;
  for (let t = 0; t < a.index.length; t += 3) {
    const i = a.index[t]!;
    const j = a.index[t + 1]!;
    const k = a.index[t + 2]!;
    if (i < start || j < start || k < start || i >= end || j >= end || k >= end) continue;
    const ux = p[j * 3]! - p[i * 3]!;
    const uy = p[j * 3 + 1]! - p[i * 3 + 1]!;
    const uz = p[j * 3 + 2]! - p[i * 3 + 2]!;
    const vx = p[k * 3]! - p[i * 3]!;
    const vy = p[k * 3 + 1]! - p[i * 3 + 1]!;
    const vz = p[k * 3 + 2]! - p[i * 3 + 2]!;
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    for (const q of [i, j, k]) {
      n[q * 3] = n[q * 3]! + fx;
      n[q * 3 + 1] = n[q * 3 + 1]! + fy;
      n[q * 3 + 2] = n[q * 3 + 2]! + fz;
    }
  }
  for (let q = start; q < end; q++) {
    let l = Math.hypot(n[q * 3]!, n[q * 3 + 1]!, n[q * 3 + 2]!);
    if (l < 1e-9) {
      // 只连着退化三角形的顶点（短发时重合的长发圈）：法线取离头心的方向
      n[q * 3] = p[q * 3]!;
      n[q * 3 + 1] = p[q * 3 + 1]! - 1.6;
      n[q * 3 + 2] = p[q * 3 + 2]!;
      l = Math.hypot(n[q * 3]!, n[q * 3 + 1]!, n[q * 3 + 2]!) || 1;
    }
    n[q * 3] = n[q * 3]! / l;
    n[q * 3 + 1] = n[q * 3 + 1]! / l;
    n[q * 3 + 2] = n[q * 3 + 2]! / l;
  }
}

/**
 * 打包成着色器的顶点属性（WebGL2 只保证 16 个顶点属性：4 个逐顶点 + 11 个逐实例）：
 * aRig = (部件, 骨骼 + 16 × 选配件, 关节混合, 沿肢体参数 u)，aMorph = (长发形变 xyz, 遮蔽)。
 */
function toGeometry(a: Attr): InstancedBufferGeometry {
  const n = a.part.length;
  const rig = new Float32Array(n * 4);
  const m4 = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    rig.set([a.part[i]!, a.bone[i]! + 16 * a.gate[i]!, a.bend[i]!, a.u[i]!], i * 4);
    m4.set([a.morph[i * 3]!, a.morph[i * 3 + 1]!, a.morph[i * 3 + 2]!, a.ao[i]!], i * 4);
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(a.pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(a.nrm), 3));
  g.setAttribute('aRig', new BufferAttribute(rig, 4));
  g.setAttribute('aMorph', new BufferAttribute(m4, 4));
  g.setIndex(a.index);
  return g;
}
