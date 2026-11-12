/**
 * 河道巨龙 · 深渊鳞龙(abyss_drake)：蹲伏在浅水里的四足有翼巨龙。
 *   - 一对鳍翼：三根翼指之间张着青紫翼膜，后缘是波浪形的鳍边；收拢时像披风搭在背侧，咆哮 / 吐息 / 出生时完全张开。
 *   - S 形长颈顶着楔形龙首：一对向后弯、末端分两叉的主角，一对贴颊小角，颊后两片鳍耳，下颌两条长须，额心一枚发光的「渊珠」(挂点 crest)。
 *   - 背脊一列由颈到尾渐小的发光背鳍；长尾末端是桨状尾鳍；咽喉到胸腹是浅色的叠片腹甲。
 * 动作：盘踞待机 / 警戒 / 爬行 / 噬咬 / 尾扫(每第三击) / 吐息(cast_s1：蓄息 → 喷吐，喷吐口挂点 vent) / 受击 / 眩晕 / 死亡 / 出生。
 */
import * as THREE from 'three';
import { MONSTER_RULES } from '../../../core/data/units';
import { MAT, ModelBuilder, PATTERN, type RGB, X, lerp, mixCol, smooth } from '../kit';
import { type Quad, gait, hitPulse, plantLeg, quadRig, standLegs } from '../quadruped';
import { type Pose, type SkinFn, bump, chainSkin, easeIO, easeIn, easeOut, seg, strikeWarp } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const TAU = Math.PI * 2;

const SCALE = 0x2c3884;
const SCALE_LIGHT = 0x4e60b8;
const SCALE_DARK = 0x1a2052;
const PLATE = 0x7f96cc;
const PLATE_LIGHT = 0xb8c8ea;
const MEMBRANE = 0x3a2a8a;
const MEMBRANE_EDGE = 0x8a5cff;
const TEAL = 0x3fe0d0;
const FIN = 0xa070ff;
const FIN_HOT = 0xe0c8ff;
const HORN = 0xcfc8e8;
const HORN_ROOT = 0x6a5a9a;
const CLAW = 0xf0ecff;
const EYE = 0x7ff0e0;
const MOUTH = 0x5a2a9a;

/** 吐息动作里「蓄息」占整个 cast_s1 的比例(预警 0.9 秒 / 共 1.7 秒) */
const WARN = MONSTER_RULES.breathWarn / (MONSTER_RULES.breathWarn + MONSTER_RULES.breathTime);

interface Frame {
  p: number[];
  /** 切向(朝头) / 背侧方向 */
  t: number[];
  d: number[];
  rx: number;
  ry: number;
}

/** 过各控制点的 Catmull-Rom 样条(控制点带半径)，每段采 n 个点；返回带切向与背侧方向的截面序列 */
function spine(knots: number[][], n: number): Frame[] {
  const out: Frame[] = [];
  const K = knots.length;
  const at = (i: number): number[] => knots[Math.max(0, Math.min(K - 1, i))];
  for (let i = 0; i < K - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const steps = i === K - 2 ? n + 1 : n;
    for (let k = 0; k < steps; k++) {
      const u = k / n;
      const u2 = u * u;
      const u3 = u2 * u;
      const q = [0, 0, 0, 0, 0];
      for (let c = 0; c < 5; c++) q[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
      out.push({ p: [q[0], q[1], q[2]], t: [0, 0, 1], d: [0, 1, 0], rx: q[3], ry: q[4] });
    }
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)].p;
    const c = out[Math.min(out.length - 1, i + 1)].p;
    const tx = c[0] - a[0];
    const ty = c[1] - a[1];
    const tz = c[2] - a[2];
    const l = Math.hypot(tx, ty, tz) || 1;
    out[i].t = [tx / l, ty / l, tz / l];
    // 背侧 = T × X(脊柱都在 x≈0 的竖直面内弯曲)
    const dl = Math.hypot(tz, ty) || 1;
    out[i].d = [0, tz / dl, -ty / dl];
  }
  return out;
}

export function createAbyssDrake(): ModelDef {
  const Q: Quad = quadRig({
    pelvis: [1.75, -1.3],
    chest: [2.05, 0.9],
    neck: [[2.42, 1.55], [3.02, 2.24], [3.68, 2.06], [4.14, 2.22]],
    head: [4.32, 2.58],
    jaw: [4.14, 2.63],
    tail: [[1.6, -2.1], [1.36, -2.9], [1.12, -3.7], [0.92, -4.5], [0.76, -5.25], [0.66, -5.95]],
    front: [[0.85, 1.9, 0.95], [1.22, 1.05, 0.62], [1.28, 0.2, 1.15]],
    hind: [[0.8, 1.7, -1.35], [1.22, 0.95, -0.92], [1.22, 0.2, -1.6]],
    bendFront: -1,
    bendHind: 1,
  });
  const rig = Q.rig;
  // 头部在自己的局部系里建模(原点 = 头关节，+Z = 吻端方向)，整体下俯 12°
  const HX = X(0, 4.32, 2.58, 12, 0, 0, 1.1);
  const hp = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(HX);
  const hj = (name: string, parent: number, x: number, y: number, z: number): number => {
    const v = hp(x, y, z);
    return rig.add(name, parent, v.x, v.y, v.z);
  };
  const crest = hj('crest', Q.head, 0, 0.37, 0.4);
  const vent = hj('vent', Q.head, 0, -0.13, 1.0);
  const frills = [1, -1].map((s) => hj(`frill${s}`, Q.head, s * 0.36, 0.06, -0.08));
  const whiskers = [1, -1].map((s) => {
    const pts: number[][] = [[s * 0.15, -0.26, 1.1], [s * 0.22, -0.6, 1.04], [s * 0.27, -0.9, 0.82]];
    const js: number[] = [];
    pts.forEach((p, i) => js.push(hj(`whisker${s}_${i}`, i === 0 ? Q.jaw : js[i - 1], p[0], p[1], p[2])));
    const tip = hp(s * 0.3, -1.06, 0.46);
    const last = pts[pts.length - 1];
    const lp = hp(last[0], last[1], last[2]);
    rig.chain({ joints: js, tip: [tip.x - lp.x, tip.y - lp.y, tip.z - lp.z], stiffness: 7, drag: 0.9, gravity: 9, maxAngle: 60, wind: 1.5 });
    return { js, tip: [tip.x, tip.y, tip.z] };
  });
  // 翼：上臂 / 前臂 / 掌 + 三根翼指(都从腕部出发)
  const WS = [0.55, 2.7, 0.6];
  const WE = [1.7, 3.25, 0.05];
  const WW = [2.6, 3.5, 1.0];
  const WF: number[][] = [[4.15, 3.4, 1.25], [4.3, 3.1, -0.9], [3.2, 2.9, -2.5]];
  const WB = [0.62, 2.3, -1.9];
  const wings = [1, -1].map((s) => {
    const a = rig.add(`wingA${s}`, Q.chest, s * WS[0], WS[1], WS[2]);
    const f = rig.add(`wingB${s}`, a, s * WE[0], WE[1], WE[2]);
    const h = rig.add(`wingH${s}`, f, s * WW[0], WW[1], WW[2]);
    const fingers = [0, 1, 2].map((i) => rig.add(`wingF${i}_${s}`, h, s * WW[0], WW[1], WW[2]));
    return { a, f, h, fingers };
  });

  // 收拢姿态(像披风搭在背侧)：上臂朝后上方、前臂折回到肩旁、掌带着三根翼指贴着体侧朝后下方收成一把窄扇。
  // 这里按「各翼骨在胸坐标系里的目标方向」算出各关节的局部旋转(轴角，左翼；右翼镜像)，动画里按张开程度插值。
  const dirOf = (p: number[], q: number[]): THREE.Vector3 => new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]).normalize();
  const basisQ = (x: THREE.Vector3, n: THREE.Vector3): THREE.Quaternion => {
    const y = n.clone().addScaledVector(x, -n.dot(x)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  const qA = new THREE.Quaternion().setFromUnitVectors(dirOf(WS, WE), new THREE.Vector3(0.2, 0.5, -0.84).normalize());
  const qFw = new THREE.Quaternion().setFromUnitVectors(dirOf(WE, WW), new THREE.Vector3(0.26, -0.26, 0.93).normalize());
  const fb = [dirOf(WW, WF[0]), dirOf(WW, WF[1]), dirOf(WW, WF[2])];
  const fanN = new THREE.Vector3().crossVectors(fb[0], fb[2]).normalize();
  const qHw = basisQ(new THREE.Vector3(0.02, -0.3, -0.95).normalize(), new THREE.Vector3(0.8, 0.6, 0)).multiply(basisQ(fb[2], fanN).invert());
  const foldQ: THREE.Quaternion[] = [
    qA,
    qA.clone().invert().multiply(qFw),
    qFw.clone().invert().multiply(qHw),
    new THREE.Quaternion().setFromAxisAngle(fanN, fb[0].angleTo(fb[2]) - 0.56),
    new THREE.Quaternion().setFromAxisAngle(fanN, fb[1].angleTo(fb[2]) - 0.26),
    new THREE.Quaternion(),
  ];
  /** 各关节收拢旋转的 [轴 x, y, z, 角度] */
  const FOLD: number[][] = foldQ.map((q) => {
    const w = Math.min(1, Math.max(-1, q.w));
    const ang = 2 * Math.acos(w);
    const sn = Math.sqrt(Math.max(1e-9, 1 - w * w));
    return [q.x / sn, q.y / sn, q.z / sn, ang];
  });

  const b = new ModelBuilder();
  b.crease = 62;
  const scaleOpts = { mat: MAT.leather, gloss: 0.35, pattern: PATTERN.scale, patternScale: 4.5, patternAmt: 0.6, grain: 0.07 } as const;
  const plateOpts = { mat: MAT.leather, gloss: 0.5 } as const;

  /**
   * 一段身体(躯干 / 颈 / 尾)：沿脊柱的鳞身，外加腹侧一条单独的腹甲带——一片压一片的叠片(每片由薄到厚再突然收回，形成台阶)。
   * 脊柱一律朝头的方向走，这样截面角度 sin > 0 的一侧总是腹侧。
   */
  const bodyTube = (frames: Frame[], skin: SkinFn, plates: number, seg: number, vent2: number[], cap0: boolean, cap1: boolean): void => {
    const N = frames.length;
    const dorsal = (_x: number, _y: number, _z: number, _g: number, nx: number, ny: number, nz: number): number => smooth(0.2, 0.9, -(nx * vent2[0] + ny * vent2[1] + nz * vent2[2]));
    b.bind(skin).paint(SCALE, { c2: SCALE_DARK, by: dorsal, ...scaleOpts });
    b.tube(frames.map((f) => [f.p[0], f.p[1], f.p[2], f.rx, f.ry]), { seg, up: [1, 0, 0], cap0, cap1, crease: 62 });
    // 腹甲带
    const path: number[][] = [];
    const bulge: number[] = [];
    const frac: number[] = [];
    /** 每一圈的切向与背侧方向(台阶处多出来的那一圈沿用前一圈的) */
    const ringF: Frame[] = [];
    for (let i = 0; i < N; i++) {
      const f = frames[i];
      const sI = (i / (N - 1)) * plates;
      const fr = sI - Math.floor(sI);
      path.push([f.p[0], f.p[1], f.p[2], f.rx, f.ry]);
      bulge.push(0.03 + 0.085 * fr);
      frac.push(fr);
      ringF.push(f);
      // 片与片的交界：紧挨着再放一圈鼓到最厚的截面，下一圈突然收回
      const sNext = ((i + 1) / (N - 1)) * plates;
      if (i < N - 1 && Math.floor(sNext) > Math.floor(sI)) {
        const g = frames[i + 1];
        const u = 0.93;
        path.push([lerp(f.p[0], g.p[0], u), lerp(f.p[1], g.p[1], u), lerp(f.p[2], g.p[2], u), lerp(f.rx, g.rx, u), lerp(f.ry, g.ry, u)]);
        bulge.push(0.03 + 0.085);
        frac.push(1);
        ringF.push(f);
      }
    }
    const M = path.length;
    b.bind(skin).paint(PLATE, { c2: PLATE_LIGHT, by: (_x, _y, _z, g) => Math.pow(frac[Math.min(M - 1, Math.round(g * (M - 1)))], 3), ...plateOpts });
    // 腹甲是一条弧形的带(只铺腹侧 140°)：中间五列鼓出成甲面，最外两列刚好埋进鳞身表面，所以甲带的边缘是齐的
    const COLS = 6;
    b.sheet(COLS, M - 1, (u, v) => {
      const k = Math.min(M - 1, Math.round(v * (M - 1)));
      const f = ringF[k];
      const p = path[k];
      const th = ((160 - 140 * u) * Math.PI) / 180;
      const edge = u < 0.01 || u > 0.99;
      const r = edge ? 0.985 : 1.04 + bulge[k];
      // 截面内：cos 沿 +X，sin 沿腹侧(= 背侧方向取反)
      const cx = Math.cos(th) * p[3] * r;
      const sv = Math.sin(th) * p[4] * r;
      return [p[0] + cx, p[1] - f.d[1] * sv, p[2] - f.d[2] * sv];
    }, false, 46);
  };

  /** 背鳍：立在脊背上的后掠三角鳍(根深尖亮) */
  const dorsalFin = (f: Frame, h: number, len: number, skin: SkinFn): void => {
    const base = [f.p[0] + f.d[0] * f.ry * 0.9, f.p[1] + f.d[1] * f.ry * 0.9, f.p[2] + f.d[2] * f.ry * 0.9];
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.t[0], f.t[1], f.t[2]), new THREE.Vector3(f.d[0], f.d[1], f.d[2]), new THREE.Vector3(1, 0, 0));
    m.setPosition(base[0], base[1], base[2]);
    b.bind(skin).paint(FIN, { c2: FIN_HOT, glow: 0.14, glow2: 0.55, gloss: 0.8, mat: MAT.crystal, line: 1 });
    b.g(m, () => b.extrude([[len * 0.5, -0.06], [len * 0.12, h * 0.55], [-len * 0.42, h], [-len * 0.3, h * 0.42], [-len * 0.55, -0.06]], 0.07, 0.03));
  };

  /** 贴在体表的大鳞：菱形小板，尖朝尾，后缘微翘 */
  const bigScale = (f: Frame, th: number, w: number, l: number, skin: SkinFn): void => {
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    // 截面内：左(+X) = cs，背侧 = sn
    const n = new THREE.Vector3(cs, f.d[1] * sn, f.d[2] * sn).normalize();
    const pos = [cs * f.rx * 0.99, f.p[1] + f.d[1] * sn * f.ry * 0.99, f.p[2] + f.d[2] * sn * f.ry * 0.99];
    const y = new THREE.Vector3(-f.t[0], -f.t[1], -f.t[2]);
    const x = new THREE.Vector3().crossVectors(y, n).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, n);
    m.setPosition(pos[0], pos[1], pos[2]);
    b.bind(skin).paint(mixCol(SCALE, SCALE_LIGHT, 0.55), { c2: SCALE, gloss: 0.6, mat: MAT.leather });
    b.g(m, () => b.g(X(0, 0, 0.0, -6, 0, 0), () => b.extrude([[0, -l * 0.35], [w * 0.5, 0], [w * 0.3, l * 0.5], [0, l * 0.68], [-w * 0.3, l * 0.5], [-w * 0.5, 0]], 0.045, 0)));
  };

  // ── 四肢：蹲伏外撑，三趾利爪 ──
  Q.legs.forEach((l) => {
    const s = l.side;
    const skin = chainSkin(rig, [l.upper, l.lower, l.foot], 0.5);
    b.bind(skin).paint(SCALE, { c2: SCALE_DARK, by: (_x, y) => smooth(1.2, 0.2, y), ...scaleOpts });
    if (l.front) {
      b.tube(
        [
          [s * 0.78, 2.1, 0.98, 0.42, 0.56],
          [s * 1.0, 1.6, 0.84, 0.38, 0.46],
          [s * 1.2, 1.08, 0.64, 0.29, 0.33],
          [s * 1.25, 0.62, 0.84, 0.25, 0.27],
          [s * 1.28, 0.28, 1.1, 0.27, 0.32],
        ],
        { seg: 9, cap0: false },
      );
    } else {
      b.tube(
        [
          [s * 0.7, 1.95, -1.4, 0.46, 0.66],
          [s * 1.0, 1.45, -1.16, 0.42, 0.56],
          [s * 1.22, 0.98, -0.94, 0.3, 0.36],
          [s * 1.22, 0.58, -1.3, 0.25, 0.28],
          [s * 1.22, 0.28, -1.56, 0.27, 0.32],
        ],
        { seg: 9, cap0: false },
      );
    }
    // 肘 / 膝后的小鳍刺
    b.bone(l.upper).paint(FIN, { c2: FIN_HOT, glow: 0.15, glow2: 0.6, gloss: 0.8, mat: MAT.crystal, line: 1 });
    b.g(X(l.front ? s * 1.22 : s * 1.3, l.front ? 1.16 : 1.06, l.front ? 0.4 : -0.72, l.front ? -50 : 40, 0, s * -24), () => b.crystal(0.08, 0.5, 4, 0.75, 0.1));
    // 掌 + 三趾 + 爪
    b.bone(l.foot).paint(SCALE_DARK, { c2: SCALE, ...scaleOpts });
    b.ball(l.rx, 0.2, l.rz + 0.08, 0.32, 0.2, 0.36, 1);
    for (let k = -1; k <= 1; k++) {
      const ang = k * 24 * s;
      b.g(X(l.rx + k * 0.17, 0.16, l.rz + 0.28, 0, ang, 0), () => {
        b.paint(SCALE_DARK, { c2: SCALE, ...scaleOpts });
        b.tube([[0, 0.02, 0, 0.12, 0.11], [0, 0.03, 0.26, 0.1, 0.09], [0, -0.02, 0.4, 0.07, 0.06]], { seg: 6, up: [1, 0, 0] });
        b.paint(CLAW, { c2: 0xffffff, gloss: 0.8, mat: MAT.leather });
        b.tube([[0, 0.02, 0.36, 0.06, 0.06], [0, 0.0, 0.52, 0.04, 0.045], [0, -0.1, 0.64, 0.004, 0.004]], { seg: 5, up: [1, 0, 0] });
      });
    }
  });

  // ── 躯干 ──
  const torsoSkin = chainSkin(rig, [Q.pelvis, Q.chest], 1.2);
  const torso = spine(
    [
      [0, 1.52, -2.25, 0.5, 0.48],
      [0, 1.68, -1.75, 0.8, 0.72],
      [0, 1.74, -1.25, 0.94, 0.86],
      [0, 1.7, -0.45, 0.9, 0.82],
      [0, 1.8, 0.35, 1.02, 0.95],
      [0, 2.02, 0.98, 0.98, 0.98],
      [0, 2.26, 1.42, 0.78, 0.8],
    ],
    3,
  );
  bodyTube(torso, torsoSkin, 7, 14, [0, -1, 0], false, false);

  // ── 颈：S 形，过各颈关节 ──
  const neckJoints = [Q.chest, ...Q.neck, Q.head];
  const neckSkin = chainSkin(rig, neckJoints, 0.9);
  const neck = spine(
    [
      [0, 2.16, 1.24, 0.8, 0.82],
      [0, 2.44, 1.6, 0.6, 0.64],
      [0, 3.02, 2.26, 0.43, 0.46],
      [0, 3.68, 2.06, 0.36, 0.38],
      [0, 4.14, 2.24, 0.32, 0.34],
      [0, 4.34, 2.52, 0.3, 0.31],
    ],
    4,
  );
  bodyTube(neck, neckSkin, 10, 12, [0, -0.5, 0.86], false, false);

  // ── 尾：六节，末端桨状尾鳍 ──
  const tailJoints = [Q.pelvis, ...Q.tail];
  const tailTip = [0, 0.6, -7.0];
  const tailSkin = chainSkin(rig, tailJoints, 0.9, tailTip);
  const tail = spine(
    [
      [0, 0.62, -6.6, 0.07, 0.08],
      [0, 0.66, -5.95, 0.15, 0.17],
      [0, 0.76, -5.25, 0.22, 0.24],
      [0, 0.92, -4.5, 0.3, 0.32],
      [0, 1.12, -3.7, 0.4, 0.42],
      [0, 1.36, -2.9, 0.52, 0.52],
      [0, 1.56, -2.2, 0.62, 0.6],
    ],
    3,
  );
  bodyTube(tail, tailSkin, 9, 10, [0, -1, 0], true, false);
  // 尾鳍：竖立的桨叶，沿尾端上下展开
  b.bind(tailSkin).paint(MEMBRANE_EDGE, { c2: FIN_HOT, glow: 0.12, glow2: 0.5, gloss: 0.6, mat: MAT.crystal, line: 1, by: (_x, y, z) => Math.max(smooth(-6.1, -7.3, z), smooth(0.9, 1.5, y), smooth(0.4, 0.0, y)) });
  b.g(X(0, 0.66, -6.35, 0, -90, 0), () => b.extrude([[-0.75, 0], [-0.3, 0.42], [0.25, 0.78], [0.95, 0.6], [1.1, 0.05], [0.9, -0.5], [0.25, -0.62], [-0.3, -0.36]], 0.07, 0.03));
  b.paint(SCALE_DARK, { c2: MEMBRANE_EDGE, gloss: 0.5, mat: MAT.leather });
  b.limb([0, 0.64, -6.0], [0, 0.68, -7.3], 0.075, 0.02, { seg: 5 });

  // ── 背鳍：由颈到尾一列，肩背处最大 ──
  const finAt = (frames: Frame[], idx: number[], skin: SkinFn, hgt: (u: number) => number): void => {
    idx.forEach((k, n) => {
      const f = frames[k];
      dorsalFin(f, hgt(n / Math.max(1, idx.length - 1)), 0.5 + f.ry * 0.5, skin);
    });
  };
  finAt(neck, [3, 6, 9, 12, 15, 18], neckSkin, (u) => lerp(0.7, 0.36, u));
  finAt(torso, [15, 11, 7, 3], torsoSkin, (u) => lerp(0.86, 0.6, u));
  finAt(tail, [16, 13, 10, 7, 4], tailSkin, (u) => lerp(0.56, 0.24, u));

  // ── 大鳞：肩、颈根、腰胯、尾根 ──
  for (const s of [1, -1]) {
    const m = (th: number): number => (s > 0 ? th : Math.PI - th);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 3; k++) {
        bigScale(torso[13 + k + (row % 2)], m(0.62 + row * 0.3 + (k % 2) * 0.1), 0.42, 0.52, torsoSkin);
      }
      for (let k = 0; k < 3; k++) bigScale(torso[2 + k * 2 + (row % 2)], m(0.56 + row * 0.32 + (k % 2) * 0.1), 0.4, 0.5, torsoSkin);
    }
    for (let k = 0; k < 4; k++) bigScale(tail[17 - k * 2], m(0.6 + (k % 2) * 0.4), 0.3 - k * 0.03, 0.42, tailSkin);
  }

  // ── 头 ──
  b.g(HX, () => {
    // 颅与上颌：楔形，下缘压平
    b.bone(Q.head).paint(SCALE, { c2: SCALE_LIGHT, by: (_x, _y, _z, g) => g * g, ...scaleOpts });
    b.tube(
      [
        [0, 0.02, -0.26, 0.3, 0.28],
        [0, 0.08, 0.16, 0.41, 0.31],
        [0, 0.06, 0.52, 0.38, 0.27],
        [0, 0.01, 0.92, 0.28, 0.2],
        [0, -0.02, 1.24, 0.22, 0.155],
        [0, -0.05, 1.44, 0.13, 0.09],
      ],
      { seg: 12, up: [1, 0, 0], shape: (th) => 1 - 0.42 * smooth(0.2, 0.9, Math.sin(th)) },
    );
    // 鼻梁上的三枚小棘
    b.paint(HORN_ROOT, { c2: HORN, gloss: 0.7, mat: MAT.leather });
    for (let i = 0; i < 3; i++) b.g(X(0, 0.17 - i * 0.045, 0.78 + i * 0.2, -30, 0, 0), () => b.crystal(0.045, 0.2 - i * 0.03, 4, 0.8, 0.1));
    // 口腔上膛(暗紫，蓄息时随整体发光变亮)
    b.paint(MOUTH, { c2: 0x8a5cd8, glow: 0.1, glow2: 0.3, mat: MAT.cloth, line: 0 });
    b.tube([[0, -0.07, 0.1, 0.26, 0.03], [0, -0.075, 0.9, 0.18, 0.03], [0, -0.07, 1.3, 0.07, 0.02]], { seg: 4, up: [1, 0, 0] });
    b.sym((s) => {
      // 眉脊：从吻侧向后上方挑起的甲片
      b.paint(SCALE_DARK, { c2: SCALE, gloss: 0.6, mat: MAT.leather });
      b.g(X(0.3, 0.27, 0.36, 8, 14, -18), () => b.extrude([[-0.16, -0.02], [0.0, 0.07], [0.12, 0.03], [0.1, -0.05], [-0.14, -0.07]], 0.52, 0.03));
      // 眼：竖瞳的发光缝
      b.paint(EYE, { glow: 0.95, mat: MAT.crystal });
      b.g(X(0.375, 0.15, 0.4, 0, 72, 12), () => b.extrude([[-0.12, 0], [-0.02, 0.05], [0.12, 0.02], [0.02, -0.045]], 0.05, 0));
      b.paint(0x0a1024, { mat: MAT.crystal, line: 0 });
      b.g(X(0.4, 0.152, 0.4, 0, 72, 12), () => b.box(0, 0, 0, 0.03, 0.085, 0.02));
      // 主角：向后上方弯，末端分两叉
      const horn = (pts: number[][], r0: number, r1: number, t0: number, t1: number): void => {
        const c0: RGB = mixCol(HORN_ROOT, HORN, t0);
        const c1: RGB = mixCol(HORN_ROOT, HORN, t1);
        b.paint(c0, { c2: t1 >= 1 ? FIN_HOT : c1, glow: 0, glow2: t1 >= 1 ? 0.5 : 0, gloss: 0.75, mat: MAT.leather, line: 1 });
        b.tube(pts.map((p, i) => [p[0], p[1], p[2], lerp(r0, r1, i / (pts.length - 1))]), { seg: 6, crease: 30 });
      };
      horn([[0.21, 0.24, -0.06], [0.36, 0.36, -0.48], [0.45, 0.4, -0.9], [0.5, 0.5, -1.2]], 0.125, 0.07, 0, 0.6);
      horn([[0.5, 0.5, -1.2], [0.52, 0.7, -1.44], [0.5, 0.98, -1.56]], 0.07, 0.006, 0.6, 1);
      horn([[0.5, 0.5, -1.2], [0.6, 0.46, -1.48], [0.73, 0.38, -1.72]], 0.062, 0.006, 0.6, 1);
      // 贴颊小角
      horn([[0.36, -0.06, 0.06], [0.58, -0.12, -0.3], [0.72, -0.04, -0.66]], 0.085, 0.006, 0.2, 1);
      // 上颌的牙：前端两枚长牙
      b.paint(CLAW, { gloss: 0.7, mat: MAT.leather, line: 0 });
      for (let i = 0; i < 5; i++) {
        const z = 0.5 + i * 0.19;
        const xx = lerp(0.3, 0.12, i / 4);
        b.g(X(xx, -0.1, z, 180, 0, 8), () => b.crystal(0.035, i === 4 ? 0.24 : 0.13, 4, 0.9, 0.05));
      }
      // 鳍耳：颊后三根棘 + 棘间的膜(可张合)
      b.bone(frills[s > 0 ? 0 : 1]);
      const root = [0.36, 0.06, -0.08];
      const tips: number[][] = [[0.62, 0.46, -0.5], [0.86, 0.12, -0.64], [0.7, -0.24, -0.5]];
      b.paint(SCALE_DARK, { c2: MEMBRANE_EDGE, gloss: 0.5, mat: MAT.leather });
      for (const tp of tips) b.limb(root, tp, 0.05, 0.012, { seg: 4 });
      b.paint(MEMBRANE, { c2: TEAL, glow: 0.03, glow2: 0.4, mat: MAT.cloth, pattern: PATTERN.vein, patternScale: 8, patternAmt: 0.5, by: (_x, _y, _z, g) => Math.pow(g, 4) });
      for (let k = 0; k < 2; k++) {
        b.sheet(1, 3, (u, v) => {
          const e = [lerp(tips[k][0], tips[k + 1][0], u), lerp(tips[k][1], tips[k + 1][1], u), lerp(tips[k][2], tips[k + 1][2], u)];
          const pull = 1 - 0.2 * Math.sin(u * Math.PI) * v;
          return [lerp(root[0], e[0], v * pull), lerp(root[1], e[1], v * pull), lerp(root[2], e[2], v * pull)];
        });
      }
      b.bone(Q.head);
    });
    // 渊珠：额心的发光宝珠，嵌在一圈角质座里
    b.paint(HORN_ROOT, { c2: HORN, gloss: 0.7, mat: MAT.leather });
    b.g(X(0, 0.33, 0.4, -14, 0, 0), () => b.torus(0.15, 0.035, 0.05, 8, 4, { crease: 30 }));
    b.bone(crest).paint(FIN, { c2: FIN_HOT, glow: 0.4, glow2: 0.7, gloss: 1, mat: MAT.crystal, line: 0 });
    b.ball(0, 0.37, 0.4, 0.12, 0.12, 0.12, 1);
    // 喷吐口的聚光球(平时缩为零)
    b.bone(vent).paint(0xeaffff, { c2: 0xb48cff, glow: 1, mat: MAT.crystal, line: 0 });
    b.ball(0, -0.13, 1.0, 0.2, 0.17, 0.24, 1);

    // 下颌
    b.bone(Q.jaw).paint(SCALE, { c2: PLATE, by: (_x, _y, _z, _g, _nx, ny) => smooth(-0.1, -0.8, ny), ...scaleOpts });
    b.tube(
      [
        [0, -0.17, -0.1, 0.3, 0.12],
        [0, -0.22, 0.45, 0.32, 0.12],
        [0, -0.215, 0.92, 0.23, 0.095],
        [0, -0.185, 1.24, 0.15, 0.07],
        [0, -0.165, 1.38, 0.08, 0.05],
      ],
      { seg: 10, up: [1, 0, 0], shape: (th) => 1 - 0.4 * smooth(-0.2, -0.9, Math.sin(th)) },
    );
    b.paint(MOUTH, { c2: 0x8a5cd8, glow: 0.1, glow2: 0.3, mat: MAT.cloth, line: 0 });
    b.tube([[0, -0.165, 0.1, 0.24, 0.03], [0, -0.165, 0.9, 0.16, 0.03], [0, -0.15, 1.26, 0.07, 0.02]], { seg: 4, up: [1, 0, 0] });
    b.sym(() => {
      b.paint(CLAW, { gloss: 0.7, mat: MAT.leather, line: 0 });
      for (let i = 0; i < 4; i++) {
        const z = 0.58 + i * 0.2;
        const xx = lerp(0.26, 0.1, i / 3);
        b.g(X(xx + 0.02, -0.15, z, 0, 0, -8), () => b.crystal(0.03, i === 3 ? 0.17 : 0.09, 4, 0.9, 0.05));
      }
      // 下颌后角的小棘
      b.paint(HORN_ROOT, { c2: HORN, gloss: 0.7, mat: MAT.leather });
      b.g(X(0.26, -0.25, 0.02, 140, 0, 24), () => b.crystal(0.06, 0.34, 4, 0.8, 0.1));
    });
  });
  // 须：下颌两条长须(弹簧链)
  whiskers.forEach((w, i) => {
    const s = i === 0 ? 1 : -1;
    const pts: number[][] = [[s * 0.15, -0.26, 1.1], [s * 0.22, -0.6, 1.04], [s * 0.27, -0.9, 0.82], [s * 0.3, -1.06, 0.46]];
    b.bind(chainSkin(rig, w.js, 0.9, w.tip)).paint(PLATE_LIGHT, { c2: TEAL, glow: 0, glow2: 0.6, mat: MAT.leather, line: 1 });
    b.tube(pts.map((p, k) => { const v = hp(p[0], p[1], p[2]); return [v.x, v.y, v.z, lerp(0.034, 0.006, k / 3)]; }), { seg: 4 });
  });

  // ── 翼 ──
  wings.forEach((w, wi) => {
    const s = wi === 0 ? 1 : -1;
    const P = (p: number[]): number[] => [p[0] * s, p[1], p[2]];
    const S = P(WS);
    const E = P(WE);
    const W = P(WW);
    const F = WF.map(P);
    const B = P(WB);
    // 翼臂与翼指
    b.bone(w.a).paint(SCALE, { c2: SCALE_DARK, ...scaleOpts });
    b.limb(S, E, 0.17, 0.11, { seg: 6, bulge: 0.2 });
    b.bone(w.f);
    b.limb(E, W, 0.11, 0.08, { seg: 6, bulge: 0.12 });
    // 肘后的鳍刺
    b.paint(FIN, { c2: FIN_HOT, glow: 0.15, glow2: 0.6, gloss: 0.8, mat: MAT.crystal, line: 1 });
    b.limb(E, [E[0] + s * 0.1, E[1] + 0.3, E[2] - 0.5], 0.08, 0.008, { seg: 4 });
    // 腕爪
    b.bone(w.h).paint(CLAW, { c2: 0xffffff, gloss: 0.8, mat: MAT.leather });
    b.limb(W, [W[0] + s * 0.12, W[1] + 0.12, W[2] + 0.5], 0.09, 0.006, { seg: 5 });
    b.paint(SCALE, { ...scaleOpts });
    b.ball(W[0], W[1], W[2], 0.11, 0.11, 0.11, 1);
    w.fingers.forEach((fj, k) => {
      b.bone(fj).paint(SCALE, { c2: MEMBRANE_EDGE, gloss: 0.5, mat: MAT.leather });
      b.limb(W, F[k], 0.06, 0.014, { seg: 5 });
    });
    // 翼膜：指间两片 + 第三指到体侧一片；后缘向内收成波浪形的鳍边
    const maxLen = 3.9;
    const memb = (boneA: number, boneB: number, fn: (u: number, v: number) => number[]): void => {
      b.bind((_x, _y, _z, g) => [boneA, boneB, 1 - g]);
      b.paint(MEMBRANE, {
        c2: MEMBRANE_EDGE, glow: 0.03, glow2: 0.34, mat: MAT.cloth, pattern: PATTERN.vein, patternScale: 3, patternAmt: 0.6,
        by: (x, y, z) => smooth(0.25, 1, Math.hypot(x - W[0], y - W[1], z - W[2]) / maxLen),
      });
      // sheet 的渐变参数是 v：这里让 v 走「骨 A → 骨 B」方向，u 走「腕 → 翼缘」
      b.sheet(5, 4, (u, v) => fn(u, v));
    };
    const fan = (A: number[], C: number[], sag: number) => (u: number, v: number): number[] => {
      const e = [lerp(A[0], C[0], v), lerp(A[1], C[1], v), lerp(A[2], C[2], v)];
      const pull = u * (1 - (0.17 * Math.sin(Math.PI * v) + 0.035 * Math.sin(Math.PI * v * 3)) * u * u);
      return [lerp(W[0], e[0], pull), lerp(W[1], e[1], pull) - sag * Math.sin(Math.PI * v) * u, lerp(W[2], e[2], pull)];
    };
    memb(w.fingers[0], w.fingers[1], fan(F[0], F[1], 0.14));
    memb(w.fingers[1], w.fingers[2], fan(F[1], F[2], 0.16));
    memb(w.fingers[2], Q.chest, (u, v) => {
      const a = [lerp(W[0], F[2][0], u), lerp(W[1], F[2][1], u), lerp(W[2], F[2][2], u)];
      const c = [lerp(S[0], B[0], u), lerp(S[1] - 0.12, B[1], u), lerp(S[2] - 0.2, B[2], u)];
      const scallop = 1 - 0.14 * Math.sin(Math.PI * v) * u * u;
      return [lerp(a[0], c[0], v), lerp(a[1], c[1], v) - 0.18 * Math.sin(Math.PI * v) * (0.4 + 0.6 * u), lerp(a[2], c[2], v) * scallop + (1 - scallop) * 0.2];
    });
    // 前膜：肩 — 肘 — 腕之间的小三角膜
    b.bind((x) => [w.f, w.a, smooth(0.9, 2.3, Math.abs(x))]);
    b.paint(MEMBRANE, { c2: MEMBRANE_EDGE, glow: 0.02, glow2: 0.2, mat: MAT.cloth, pattern: PATTERN.vein, patternScale: 3, patternAmt: 0.6 });
    b.sheet(3, 2, (u, v) => {
      const lead = [lerp(S[0], W[0], u), lerp(S[1], W[1], u) + 0.04, lerp(S[2] + 0.05, W[2], u) - 0.2 * Math.sin(Math.PI * u)];
      const arm = u < 0.5 ? [lerp(S[0], E[0], u * 2), lerp(S[1], E[1], u * 2), lerp(S[2], E[2], u * 2)] : [lerp(E[0], W[0], u * 2 - 1), lerp(E[1], W[1], u * 2 - 1), lerp(E[2], W[2], u * 2 - 1)];
      return [lerp(lead[0], arm[0], v), lerp(lead[1], arm[1], v), lerp(lead[2], arm[2], v)];
    });
  });
  b.bakeGrounding(4.4, 0.72, 0.9);

  const STRIDE = 4.2;
  const TAIL_CURL = [8, 18, 30, 38, 40, 34];

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 7;
    const br = Math.sin((t * TAU) / 3.2);
    const alert = (a.mode & 2) !== 0;
    const hurt = a.hp < 0.5;
    /** 翼的张开程度 0 = 收拢搭在背侧，1 = 完全张开(绑定姿态)；lift = 上举角度；flap = 整翼前后扇动 */
    let open = 0;
    let lift = 0;
    let sweep = 0;
    let curl = 1;
    let tailWave = 6;
    let jaw = 4 + br * 2;
    let frill = 0.1 + 0.05 * br;
    let glow = 1 + 0.12 * br + (alert ? 0.35 : 0) + (hurt ? 0.25 * Math.sin(t * 9) : 0);
    let ventK = 0;
    let planted = true;
    /** 颈的姿态：各节绕 X 的角度(正 = 向前低头)与整体左右偏角 */
    const neckPose = (n0: number, n1: number, n2: number, n3: number, hd: number, yaw = 0): void => {
      pose.add(Q.neck[0], n0, yaw * 0.3, 0);
      pose.add(Q.neck[1], n1, yaw * 0.3, 0);
      pose.add(Q.neck[2], n2, yaw * 0.25, 0);
      pose.add(Q.neck[3], n3, yaw * 0.15, 0);
      pose.add(Q.head, hd, 0, 0);
    };
    // 通用底层：慢呼吸、长颈 S 形游摆
    pose.pos(Q.pelvis, 0, -0.12 + br * 0.03, 0);
    pose.rot(Q.chest, br * 1.0, 0, 0);
    pose.rot(Q.neck[0], br * 1.5, Math.sin(t * 0.45) * 7, 0);
    pose.rot(Q.neck[1], -br * 1.5, Math.sin(t * 0.45 + 0.7) * 8, 0);
    pose.rot(Q.neck[2], 0, Math.sin(t * 0.45 + 1.4) * 7, 0);
    pose.rot(Q.neck[3], br, Math.sin(t * 0.45 + 2.1) * 5, 0);
    pose.rot(Q.head, Math.sin(t * 0.8) * 3, Math.sin(t * 0.45 + 2.6) * 5, 0);
    pose.rot(crest, 0, t * 30, 0);

    switch (a.anim) {
      case 'dead': {
        // 仰天长啸、翼全张 → 渊珠碎裂 → 侧倒，双翼塌落盖住身体 → 颈与头最后落下 → 由尾向头消散
        const d = a.t;
        const cry = easeOut(seg(d, 0, 0.3)) * (1 - seg(d, 0.6, 0.9));
        const fall = easeIn(seg(d, 0.6, 1.5));
        const drop = easeIn(seg(d, 1.3, 1.95));
        const side = a.seed > 0.5 ? 1 : -1;
        open = 0.96 * cry + 0.3 * fall * (1 - cry);
        lift = 26 * cry - 46 * fall;
        jaw = 4 + 40 * cry + 14 * drop;
        frill = cry;
        neckPose(-16 * cry + 30 * drop, -18 * cry + 36 * drop, -6 * cry + 30 * drop, -24 * cry + 16 * drop, -26 * cry - 10 * drop, 0);
        pose.add(Q.head, 0, 0, side * -40 * drop);
        pose.move(Q.pelvis, 0, 0.1 * cry - 0.3 * fall, 0);
        pose.rot(Q.root, 0, 0, side * (78 * fall + 3 * bump(d, 1.62, 0.15)));
        pose.pos(Q.root, side * 0.9 * fall, 0.72 * fall, 0);
        Q.legs.forEach((l, i) => plantLeg(Q, pose, i, l.rx + l.side * 0.1 * fall, l.ry - 0.1 * fall, l.rz + (l.front ? -0.3 : 0.3) * fall, 30 * fall));
        planted = false;
        curl = 1 - 0.5 * fall;
        tailWave = 6 * (1 - fall);
        const shatter = seg(d, 0.58, 0.72);
        pose.scale(crest, (1 + 0.8 * bump(d, 0.6, 0.08)) * (1 - shatter));
        // 消散：尾 → 身 → 头依次缩没
        const gone = seg(d, 2.0, 3.1);
        for (let i = 0; i < 6; i++) pose.scale(Q.tail[5 - i], 1 - 0.999 * seg(gone, i * 0.07, i * 0.07 + 0.3));
        out.tint = 0.6 * seg(d, 1.8, 2.8);
        out.tintColor = 0xb090ff;
        glow = (1 + 1.2 * bump(d, 0.62, 0.14)) * (1 - 0.85 * seg(d, 0.8, 1.6)) + 0.9 * gone;
        break;
      }
      case 'move': {
        const c = a.stride * TAU;
        neckPose(14, 8, -6, -10, -4, Math.sin(c) * 6);
        curl = 0.12;
        tailWave = 16;
        gait(Q, pose, a.stride, { style: 'walk', stride: STRIDE, lift: 0.4, bob: 0.05, pitch: 1.5, sway: 4, roll: 2.5, curl: 20 });
        planted = false;
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.27));
        const hit = seg(p, 0.27, 0.36);
        const rec = easeIO(seg(p, 0.5, 1));
        const back = wind * (1 - hit);
        const fwd = hit * (1 - rec);
        if (a.mode & 1) {
          // 尾扫：反向蓄势 → 转体，尾鳍横扫
          const turn = 34 * back - 128 * fwd;
          pose.rot(Q.root, 0, turn, 0);
          pose.move(Q.pelvis, 0, -0.1 * (back + fwd), 0);
          curl = 1 - 0.9 * Math.max(back, fwd);
          for (let i = 0; i < 6; i++) pose.add(Q.tail[i], 0, 16 * back - 22 * fwd * (1 - i * 0.1), 0);
          neckPose(10 * fwd, 6 * fwd, 0, 0, 0, 40 * fwd - 20 * back);
          open = 0.45 * fwd;
          lift = 10 * fwd;
          tailWave = 0;
          // 转体时四脚交替点地，不至于整只在地上平移
          const step = Math.max(back, fwd);
          Q.legs.forEach((l, i) => plantLeg(Q, pose, i, l.rx, l.ry + 0.28 * step * Math.max(0, Math.sin(p * 40 + i * 1.6)), l.rz, 0));
          planted = false;
          glow += 0.3 * back + 0.8 * bump(p, 0.38, 0.16);
        } else {
          // 噬咬：颈后缩成弓 → 弹射前探，咬合
          neckPose(-22 * back + 34 * fwd, -26 * back + 40 * fwd, 22 * back + 16 * fwd, 20 * back - 30 * fwd, 12 * back - 22 * fwd, 0);
          pose.move(Q.pelvis, 0, 0.08 * back - 0.14 * fwd, -0.3 * back + 0.55 * fwd);
          pose.add(Q.pelvis, -4 * back + 6 * fwd, 0, 0);
          jaw = 4 + 34 * back + 30 * hit * (1 - seg(p, 0.36, 0.41));
          frill = back + 0.4 * fwd;
          open = 0.3 * back + 0.14 * fwd;
          lift = 14 * back - 6 * fwd;
          glow += 0.3 * back + 0.8 * bump(p, 0.36, 0.14);
        }
        break;
      }
      case 'cast_s1': {
        // 吐息：蓄息(四爪抓地、双翼张开上举、颈后仰成弓、口中聚光) → 喷吐(头猛地前伸张口、由左向右横扫、双翼向后一振)
        const warn = seg(a.p, 0, WARN);
        const w = easeOut(Math.min(1, warn * 1.6));
        const spray = seg(a.p, WARN, 1);
        const thrust = easeOut(seg(spray, 0, 0.18));
        const k = w * (1 - thrust);
        const sweepYaw = thrust * lerp(11, -11, easeIO(spray));
        neckPose(-20 * k + 14 * thrust, -24 * k + 20 * thrust, -8 * k + 8 * thrust, 26 * k - 20 * thrust, 18 * k - 12 * thrust, sweepYaw * 2.4);
        pose.move(Q.pelvis, 0, -0.16 * w + 0.06 * thrust, 0.12 * k - 0.32 * thrust * (1 - 0.4 * spray));
        pose.add(Q.pelvis, -5 * k + 4 * thrust, 0, 0);
        open = w;
        lift = 28 * k - 8 * thrust + 4 * Math.sin(spray * 30) * thrust;
        sweep = -24 * thrust * (1 - spray * 0.5);
        jaw = 4 + 14 * warn * (1 - thrust) + 40 * thrust;
        frill = w;
        curl = 1 - 0.75 * w;
        ventK = warn * warn * (1 - thrust) + 0.55 * thrust * (1 - seg(spray, 0.85, 1));
        glow += 0.3 * warn + 0.6 * warn * warn + 0.5 * thrust;
        break;
      }
      case 'stunned': {
        neckPose(26, 30, 16, 6, 10, Math.sin(t * 2.4) * 16);
        pose.add(Q.head, 0, 0, Math.sin(t * 2.4 + 1) * 14);
        lift = -14;
        open = 0.12;
        jaw = 14;
        glow *= 0.7;
        break;
      }
      default: {
        if (a.spawnT >= 0) {
          // 出生：龙首先破水而出 → 前爪搭岸撑起身体 → 展翼长啸
          const s = a.spawnT;
          const head = easeOut(seg(s, 0.9, 1.4));
          const body = easeIO(seg(s, 1.3, 1.9));
          const cry = easeOut(seg(s, 1.6, 1.95)) * (1 - easeIO(seg(s, 2.15, 2.4)));
          pose.pos(Q.root, 0, -4.6 + 2.4 * head + 2.2 * body, 0);
          pose.add(Q.pelvis, -22 * head * (1 - body), 0, 0);
          neckPose(-10 * (1 - body) - 12 * cry, -12 * (1 - body) - 16 * cry, -8 * cry, -16 * cry, -14 * (1 - head) - 22 * cry, 0);
          open = cry;
          lift = 24 * cry;
          jaw = 4 + 40 * cry;
          frill = cry;
          curl = 0.3 + 0.7 * easeIO(seg(s, 1.9, 2.4));
          glow += 0.4 * head * (1 - body) + 0.7 * cry;
        } else if (alert) {
          // 警戒：翼张到六成，身体压低，头对准目标
          open = 0.6;
          lift = 8 + 3 * Math.sin(t * 3);
          pose.move(Q.pelvis, 0, -0.12, 0);
          neckPose(10, 12, 0, -6, 4, 0);
          jaw = 10 + 4 * Math.sin(t * 5);
          frill = 0.8;
          curl = 0.7;
        } else {
          // 待机(盘踞)：每隔十来秒昂首低吼一次(翼半张)；尾尖不时拍一下水
          const cyc = (t / 10.5) % 1;
          const roar = easeIO(seg(cyc, 0.7, 0.76)) * (1 - easeIO(seg(cyc, 0.9, 0.97)));
          neckPose(-8 * roar, -10 * roar, -4 * roar, -12 * roar, -14 * roar, 0);
          open = 0.45 * roar + 0.012 * (1 + Math.sin(t * 7));
          lift = 10 * roar;
          jaw = 4 + br * 2 + 26 * roar;
          frill = 0.1 + 0.7 * roar;
          glow += 0.5 * roar;
          const slap = bump((t / 4) % 1, 0.5, 0.07);
          pose.add(Q.tail[4], -22 * slap, 0, 0);
          pose.add(Q.tail[5], -30 * slap, 0, 0);
        }
      }
    }
    // 受击：头侧偏，翼一抖
    const hk = hitPulse(a.hitT);
    if (hk > 0 && a.anim !== 'dead') {
      const sgn = a.seed > 0.5 ? 1 : -1;
      pose.add(Q.neck[2], 4 * hk, sgn * 14 * hk, 0);
      pose.add(Q.head, 6 * hk, sgn * 12 * hk, sgn * 16 * hk);
      lift += 9 * hk;
      open += 0.06 * hk;
    }
    // 尾：盘向身侧 + 行波
    for (let i = 0; i < 6; i++) {
      pose.add(Q.tail[i], Math.sin(t * 0.9 - i * 0.6) * 2, TAIL_CURL[i] * curl + Math.sin(t * 0.8 - i * 0.7) * tailWave * (0.4 + i * 0.2), 0);
    }
    // 翼：按张开程度在「收拢(披风)」与「张开(绑定姿态)」之间插值，再叠上举 / 前后扇动
    const fold = 1 - Math.min(1, Math.max(0, open));
    wings.forEach((w, i) => {
      const sd = i === 0 ? 1 : -1;
      const js = [w.a, w.f, w.h, w.fingers[0], w.fingers[1], w.fingers[2]];
      for (let k = 0; k < 6; k++) {
        const F = FOLD[k];
        const half = F[3] * fold * 0.5;
        const sn = Math.sin(half);
        const o4 = js[k] * 4;
        pose.q[o4] = F[0] * sn;
        pose.q[o4 + 1] = F[1] * sn * sd;
        pose.q[o4 + 2] = F[2] * sn * sd;
        pose.q[o4 + 3] = Math.cos(half);
      }
      pose.pre(w.a, 0, sd * sweep, sd * lift);
      pose.add(w.f, 0, 0, sd * lift * 0.3);
    });
    pose.rot(Q.jaw, jaw, 0, 0);
    frills.forEach((fr, i) => {
      const s = i === 0 ? 1 : -1;
      pose.rot(fr, 0, s * (34 - 44 * frill), s * (-8 + 14 * frill));
      pose.scale(fr, 0.8 + 0.3 * frill);
    });
    pose.scale(vent, Math.max(0.001, ventK));
    out.glow = Math.max(0.05, glow);
    if (planted) standLegs(Q, pose);
  };

  return {
    key: 'monster:abyss_drake',
    geometry: b.build(),
    rig,
    height: 4.9,
    radius: 2.6,
    scale: 1,
    stride: STRIDE,
    triangles: b.triangleCount,
    deathDur: 3.2,
    spawnDur: 2.4,
    outline: 1.8,
    attach: {
      chest: { joint: Q.chest, x: 0, y: 0.1, z: 0.3 },
      head: { joint: Q.head, x: 0, y: 0.35, z: 0.3 },
      muzzle: { joint: vent, x: 0, y: 0, z: 0.45 },
      weapon: { joint: vent, x: 0, y: 0, z: 0.45 },
      vent: { joint: vent, x: 0, y: 0, z: 0.3 },
      crest: { joint: crest, x: 0, y: 0, z: 0 },
      tail: { joint: Q.tail[5], x: 0, y: 0, z: -0.8 },
      wingL: { joint: wings[0].fingers[0], x: WF[0][0] - WW[0], y: WF[0][1] - WW[1], z: WF[0][2] - WW[2] },
      wingR: { joint: wings[1].fingers[0], x: -(WF[0][0] - WW[0]), y: WF[0][1] - WW[1], z: WF[0][2] - WW[2] },
    },
    blend: (_f, to) => (to === 'attack' ? 0.12 : to === 'cast_s1' ? 0.18 : 0.3),
    animate,
  };
}
