/**
 * 程咬金 · 战士：粗豪敦实的大斧武将。圆铁盔顶一撮红缨，赤褐连鬓短髯，咧嘴带笑；
 * 胸前两面铜圆护的铁甲，朱红(偏橙)披风与战裙；双手持一柄宽刃的宣花大斧，平时斜扛在右肩。
 * 俯视识别三要素：扛在肩上的宽刃大斧、圆铁盔上的红缨点、身后的朱红披风。动作大开大合。
 * 造型依据只有《隋唐演义》《说唐》与评书里的描述(混世魔王、宣花斧、三板斧)。
 *
 * 持斧的做法：右手的位置与斧的指向不由手臂的欧拉角间接决定，而是直接写在关键帧里——
 *   gripR = 右手腕在胸腔坐标里的目标点；aim = 斧在英雄自身坐标(根空间)里的[俯仰, 偏航, 滚转]；gripL = [左手握柄的权重, 握点沿柄的位置]。
 * 每帧先摆好躯干，再用 IK 让右手到位、把斧转到指定朝向、左手去抓斧柄(权重为 0 时叉腰)。
 * 这样「斧从右肩斜劈到左下」就是俯仰角从 −150° 走到 40°：手跟着胸腔走，斧的指向不受躯干拧转影响，落点好控制。
 */
import { type CKP, type CommonAnims, E, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, STANDARD_DIMS, type TrackKey, animateCommon, applyCKP, breathe, bump, copyCKP, emptyCKP, humanRig, kp, makeCommon, mix, mixQ, reachHand, runCycle, sampleTrack, strikeWarp, track } from '../humanoid';
import { MAT, ModelBuilder, PATTERN, X, lerp } from '../kit';
import { beard, boot, chainBind, face, hand, head, lock, polyAt, strip, torsoBind } from '../parts';
import { type Pose, poseSpace, setSpaceRot } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  red: 0xcc3a26,
  redDark: 0x8a2018,
  redLight: 0xe9613a,
  iron: 0x4a4447,
  ironLight: 0x7c767a,
  ironDark: 0x2c2729,
  brass: 0xe2a13a,
  brassDark: 0x9a6722,
  steel: 0xc8ccd4,
  steelDark: 0x676b76,
  beard: 0x7a2e1c,
  beardHi: 0xa94a28,
  skin: 0xd99a72,
  robe: 0x9a6a3c,
  robeDark: 0x6c4728,
  leather: 0x3b2b25,
  leatherDark: 0x221916,
  shaft: 0x5a2c22,
  edge: 0xffb057,
};

const DIMS: HumanDims = { ...STANDARD_DIMS, hipX: 0.15, shoulderX: 0.34, clavX: 0.11 };
const SCALE = 1.24;
const DEG = Math.PI / 180;

/** 斧：握点在原点，柄沿 +Z；斧头中心 / 柄尾 / 柄首的位置 */
const AXE = { head: 1.34, butt: -0.52, top: 1.56 };

interface Extra {
  gripR: number;
  aim: number;
  gripL: number;
}

function build(): { h: Human; b: ModelBuilder; extra: Extra } {
  const h = humanRig(DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();

  // ── 记参数用的空关节(不绑任何几何，只借关键帧的三个数：见文件头) ──
  const gripR = rig.add('gripR', J.chest, 0, d.chestY, 0);
  const aim = rig.add('aim', J.chest, 0, d.chestY, 0);
  const gripL = rig.add('gripL', J.chest, 0, d.chestY, 0);

  // ── 弹簧链 ──
  const hcy = d.headY + 0.25;
  const plumePts = [[0, hcy + 0.33, -0.01], [0, hcy + 0.45, -0.04], [0, hcy + 0.56, -0.08]];
  const plume = rig.addChain('pony', J.head, plumePts.slice(0, 2));
  rig.chain({ joints: plume, tip: [0, 0.11, -0.04], stiffness: 9, drag: 0.86, gravity: 6, maxAngle: 50, wind: 1.6 });
  const capePts = [[0, 1.4, -0.16], [0, 1.17, -0.29], [0, 0.93, -0.35], [0, 0.7, -0.38], [0, 0.48, -0.39]];
  const cape = rig.addChain('scarf', J.chest, capePts.slice(0, 4));
  rig.chain({
    joints: cape, tip: [0, -0.22, -0.01], stiffness: 3.2, drag: 0.92, gravity: 8, maxAngle: 72, wind: 2.6,
    colliders: [{ joint: J.chest, x: 0, y: 0, z: 0.02, r: 0.3 }, { joint: J.hips, x: 0, y: 0, z: 0, r: 0.3 }],
  });
  const sashPts = [[0.23, 0.96, 0.1], [0.28, 0.76, 0.11], [0.29, 0.56, 0.09], [0.29, 0.38, 0.08]];
  const sash = rig.addChain('sash', J.hips, sashPts.slice(0, 3));
  rig.chain({ joints: sash, tip: [0, -0.18, -0.01], stiffness: 6, drag: 0.88, gravity: 10, maxAngle: 60, wind: 1 });
  const frontPts = [[0, 0.9, 0.2], [0, 0.7, 0.225], [0, 0.5, 0.23], [0, 0.34, 0.23]];
  const front = rig.addChain('tab', J.hips, frontPts.slice(0, 3));
  rig.chain({ joints: front, tip: [0, -0.16, 0], stiffness: 8, drag: 0.86, gravity: 10, maxAngle: 50, wind: 0.8 });
  const backPts = [[0, 0.9, -0.19], [0, 0.68, -0.23], [0, 0.46, -0.24], [0, 0.3, -0.24]];
  const back = rig.addChain('tail', J.hips, backPts.slice(0, 3));
  rig.chain({ joints: back, tip: [0, -0.16, 0], stiffness: 6, drag: 0.88, gravity: 10, maxAngle: 60, wind: 1 });
  // 斧颈的红缨：挂在斧上，被重力拖着走
  const tasselPts = [[-d.shoulderX, d.handY - 0.03, 1.1], [-d.shoulderX, d.handY - 0.17, 1.1], [-d.shoulderX, d.handY - 0.31, 1.1]];
  const tassel = rig.addChain('tassel', J.propR, tasselPts.slice(0, 2));
  rig.chain({ joints: tassel, tip: [0, -0.14, 0], stiffness: 2.5, drag: 0.9, gravity: 14, maxAngle: 150, wind: 1.2 });

  // ── 腿：袍裤 + 铁胫甲 + 乌皮靴 ──
  b.sym((s) => {
    const x = d.hipX;
    b.bone(s > 0 ? J.thighL : J.thighR).paint(C.robeDark, { c2: C.robe, ao: 0.88, ao2: 1, mat: MAT.cloth });
    b.limb([x, d.hipY + 0.04, 0], [x, d.kneeY, 0], 0.15, 0.115, { seg: 8, bulge: 0.06 });
  });
  for (const s of [1, -1] as const) {
    b.paint(C.leatherDark, { c2: C.leather, gloss: 0.25, mat: MAT.leather });
    boot(b, h, s, { top: 0.44, rTop: 0.128, rAnkle: 0.094, len: 0.26 });
    const shin = s > 0 ? J.shinL : J.shinR;
    // 胫甲：前面一片铁甲 + 上下铜箍，膝头一枚铜泡
    b.bone(shin).paint(C.ironDark, { c2: C.ironLight, gloss: 0.6, mat: MAT.metal });
    b.sheet(3, 2, (u, v) => {
      const a = lerp(40, 140, u) * DEG;
      const r = lerp(0.108, 0.138, v) + 0.012;
      return [s * d.hipX + Math.cos(a) * r, lerp(0.16, 0.45, v), Math.sin(a) * r];
    });
    b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
    b.lathe([[0.428, 0.132, 0.132, s * d.hipX, 0], [0.446, 0.14, 0.14, s * d.hipX, 0], [0.464, 0.13, 0.13, s * d.hipX, 0]], { seg: 8, cap0: false, cap1: false, crease: 30 });
    b.ball(s * d.hipX, d.kneeY + 0.03, 0.13, 0.04, 0.046, 0.026, 0);
  }

  // ── 躯干：敦实的身板，腰腹外鼓 ──
  const prof: number[][] = [
    [0.76, 0.13, 0.12, 0, 0],
    [0.83, 0.235, 0.19, 0, 0.005],
    [0.92, 0.262, 0.225, 0, 0.026],
    [1.02, 0.268, 0.24, 0, 0.042],
    [1.12, 0.272, 0.225, 0, 0.026],
    [1.22, 0.285, 0.2, 0, 0.008],
    [1.33, 0.295, 0.19, 0, 0],
    [1.39, 0.2, 0.15, 0, 0],
    [1.44, 0.11, 0.105, 0, 0],
  ];
  /** 躯干在高度 y 处的截面 [rx, rz, oz] */
  const R = (y: number): [number, number, number] => {
    for (let i = 1; i < prof.length; i++) {
      if (y <= prof[i][0]) {
        const t = Math.max(0, (y - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]));
        return [lerp(prof[i - 1][1], prof[i][1], t), lerp(prof[i - 1][2], prof[i][2], t), lerp(prof[i - 1][4], prof[i][4], t)];
      }
    }
    const l = prof[prof.length - 1];
    return [l[1], l[2], l[4]];
  };
  const band = (ys: number[], grow: number[]): number[][] => ys.map((y, i) => [y, R(y)[0] + grow[i], R(y)[1] + grow[i], 0, R(y)[2]]);
  b.bind(torsoBind(h)).paint(C.robeDark, { c2: C.robe, ao: 0.88, ao2: 1, mat: MAT.cloth });
  b.lathe(prof, { seg: 12 });
  b.bone(J.neck).paint(C.skin, { ao: 0.72, glow: 0.05, mat: MAT.skin });
  b.lathe([[1.4, 0.092, 0.092], [1.54, 0.09, 0.092]], { seg: 8, cap0: false });
  // 铁甲：护住胸腹的一整片，下缘压在革带上
  b.bind(torsoBind(h)).paint(C.ironDark, { c2: C.ironLight, gloss: 0.6, ao: 0.8, ao2: 1, mat: MAT.metal, pattern: PATTERN.scale, patternScale: 11, patternAmt: 0.22 });
  b.lathe(band([1.03, 1.06, 1.14, 1.24, 1.34, 1.385], [0.012, 0.03, 0.026, 0.022, 0.022, 0.012]), { seg: 12, cap0: false });
  // 胸前两面铜圆护(俯视有反光)，各有一圈凸缘
  b.bone(J.chest);
  b.sym(() => {
    b.g(X(0.125, 1.25, R(1.25)[1] * 0.93 + 0.02, -6, 16, 0), () => {
      b.paint(C.brassDark, { c2: C.brass, gloss: 1, mat: MAT.metal });
      b.g(X(0, 0, 0, 90, 0, 0), () => b.lathe([[0, 0.1], [0.018, 0.094], [0.03, 0.07], [0.036, 0.02]], { seg: 10, cap0: false }));
      b.paint(C.brass, { c2: 0xffd27a, gloss: 1, mat: MAT.metal });
      b.g(X(0, 0, 0.012, 90, 0, 0), () => b.torus(0.098, 0.014, 0.012, 10, 3, { crease: 30 }));
    });
  });
  // 铜兽面护腹：圆肚子上的一块兽面牌
  b.bone(J.spine).paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
  b.g(X(0, 1.07, R(1.07)[1] + R(1.07)[2] + 0.028, 6, 0, 0), () => {
    b.extrude([[-0.1, 0.075], [0, 0.1], [0.1, 0.075], [0.115, 0], [0.07, -0.085], [0, -0.11], [-0.07, -0.085], [-0.115, 0]], 0.04, 0.016);
    b.paint(C.brassDark, { c2: C.brass, gloss: 1, mat: MAT.metal });
    b.sym(() => b.g(X(0.046, 0.03, 0.024, 0, 0, 16), () => b.box(0, 0, 0, 0.07, 0.024, 0.02)));
    b.ball(0, -0.01, 0.026, 0.024, 0.04, 0.018, 0);
    b.sym(() => b.ball(0.045, -0.058, 0.022, 0.016, 0.022, 0.012, 0));
  });
  // 宽革带 + 腰侧红带结
  b.bone(J.spine).paint(C.leather, { c2: C.leatherDark, gloss: 0.25, mat: MAT.leather });
  b.lathe(band([0.9, 0.915, 1.0, 1.015], [0.022, 0.036, 0.036, 0.022]), { seg: 12 });
  b.bone(J.hips).paint(C.redLight, { c2: C.red, mat: MAT.cloth });
  b.ball(0.24, 0.965, 0.1, 0.06, 0.05, 0.052, 1);
  b.bind(chainBind(sash, sashPts, J.hips)).paint(C.red, { c2: C.redDark, mat: MAT.cloth });
  strip(b, sashPts, { width: (v) => mix(0.05, 0.075, v), axis: [0, 0, 1], bow: [0.02, 0, 0], nu: 2, nv: 5, tail: 'point', tailLen: 0.1 });
  // 前后战裙：朱红，队伍色镶边(一条略宽的衬片露出两侧与下缘)
  const skirtPiece = (joints: number[], pts: number[][], w0: number, w1: number, bow: number, tail: number): void => {
    b.bind(chainBind(joints, pts, J.hips)).paint(0xffffff, { team: 1, mat: MAT.cloth });
    const edge = pts.map((p) => [p[0], p[1], p[2] - Math.sign(bow) * 0.006]);
    strip(b, edge, { width: (v) => mix(w0, w1, v) + 0.024, bow: [0, 0, bow], nu: 2, nv: 5, tail: 'swallow', tailLen: tail + 0.03 });
    b.paint(C.red, { c2: C.redDark, mat: MAT.cloth });
    strip(b, pts, { width: (v) => mix(w0, w1, v), bow: [0, 0, bow], nu: 4, nv: 5, tail: 'swallow', tailLen: tail });
  };
  skirtPiece(front, frontPts, 0.14, 0.115, 0.035, 0.1);
  skirtPiece(back, backPts, 0.17, 0.14, -0.035, 0.11);
  // 两胯的甲裙
  b.sym(() => {
    b.bone(J.hips).paint(C.ironDark, { c2: C.ironLight, gloss: 0.6, ao: 0.78, ao2: 1, mat: MAT.metal, pattern: PATTERN.scale, patternScale: 11, patternAmt: 0.22 });
    b.sheet(4, 2, (u, v) => {
      const a = lerp(-64, 64, u) * DEG;
      const r = lerp(0.262, 0.3, v);
      return [Math.cos(a) * r, lerp(0.92, 0.66, v) + (Math.round(u * 4) % 2 === 0 ? 0.014 * v : 0), Math.sin(a) * r * 0.82];
    });
    b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
    b.tube([-64, 0, 64].map((a) => [Math.cos(a * DEG) * 0.306, 0.662, Math.sin(a * DEG) * 0.306 * 0.82, 0.014, 0.012]), { seg: 4, up: [0, 1, 0] });
  });

  // ── 手臂：赭袍袖 + 队伍色臂带 + 铁护腕 ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.red, { c2: C.redDark, ao: 0.88, ao2: 1, mat: MAT.cloth });
    b.limb([x, d.shoulderY + 0.04, 0], [x, d.elbowY - 0.02, 0], 0.112, 0.094, { seg: 8, bulge: 0.06 });
    b.paint(0xffffff, { team: 1, mat: MAT.cloth });
    b.lathe([[d.elbowY + 0.07, 0.101, 0.101, x, 0], [d.elbowY + 0.085, 0.108, 0.108, x, 0], [d.elbowY + 0.115, 0.108, 0.108, x, 0], [d.elbowY + 0.13, 0.103, 0.103, x, 0]], { seg: 8, cap0: false, cap1: false });
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.redDark, { c2: C.red, mat: MAT.cloth });
    b.ball(x, d.elbowY, 0, 0.096, 0.094, 0.096, 1);
    b.limb([x, d.elbowY, 0], [x, d.wristY + 0.16, 0], 0.092, 0.096, { seg: 8 });
    b.paint(C.ironDark, { c2: C.ironLight, gloss: 0.6, mat: MAT.metal });
    b.lathe([[d.wristY - 0.01, 0.082, 0.082, x, 0], [d.wristY + 0.03, 0.098, 0.098, x, 0], [d.wristY + 0.18, 0.106, 0.106, x, 0], [d.wristY + 0.2, 0.09, 0.09, x, 0]], { seg: 8 });
    b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
    for (const y of [d.wristY + 0.02, d.wristY + 0.165]) b.lathe([[y, 0.102, 0.102, x, 0], [y + 0.014, 0.112, 0.112, x, 0], [y + 0.028, 0.104, 0.104, x, 0]], { seg: 8, cap0: false, cap1: false, crease: 30 });
  });
  b.paint(C.skin, { glow: 0.05, ao: 0.9, mat: MAT.skin });
  hand(b, h, 1, 0.078);
  hand(b, h, -1, 0.078);

  // ── 披膊：对称的厚圆甲，两层，铜边 ──
  const plate = (bone: number, x: number, y: number, rx: number, ry: number, rz: number, tilt: number): void => {
    b.bone(bone).paint(C.ironDark, { c2: C.ironLight, gloss: 0.6, ao: 0.8, ao2: 1, mat: MAT.metal });
    b.g(X(x, y, 0, 0, 0, tilt), () => {
      b.lathe([[-ry * 0.34, rx, rz], [-ry * 0.1, rx * 1.02, rz * 1.02], [ry * 0.6, rx * 0.72, rz * 0.72], [ry, rx * 0.18, rz * 0.18]], { seg: 10, crease: 50 });
      b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
      b.lathe([[-ry * 0.42, rx * 0.98, rz * 0.98], [-ry * 0.3, rx * 1.05, rz * 1.05], [-ry * 0.16, rx * 1.03, rz * 1.03]], { seg: 10, cap0: false, cap1: false, crease: 30 });
    });
  };
  b.sym((s) => {
    plate(s > 0 ? J.armL : J.armR, 0.4, 1.3, 0.15, 0.085, 0.155, -44);
    plate(s > 0 ? J.clavL : J.clavR, 0.355, 1.435, 0.2, 0.13, 0.19, -18);
  });

  // ── 朱红披风：罩住双肩的披领 + 颈间红巾结 + 垂到膝的后摆(下缘一道队伍色) ──
  b.bone(J.chest).paint(C.redDark, { c2: C.red, ao: 0.9, mat: MAT.cloth });
  b.lathe([[1.33, 0.3, 0.215], [1.37, 0.27, 0.2], [1.42, 0.19, 0.16], [1.47, 0.135, 0.13]], { seg: 12, cap0: false, cap1: false, shape: (a) => 1 + 0.03 * Math.sin(a * 6) });
  b.paint(C.redLight, { c2: C.red, mat: MAT.cloth });
  b.g(X(0, 1.47, 0.012, 12, 0, 0, 1, 1, 0.92), () => b.torus(0.142, 0.052, 0.046, 10, 4));
  b.ball(0, 1.425, 0.16, 0.048, 0.04, 0.036, 0, 180);
  b.sym(() => b.tube([[0.02, 1.42, 0.165, 0.03, 0.012], [0.07, 1.34, 0.19, 0.034, 0.012], [0.08, 1.27, 0.2, 0.012, 0.008]], { seg: 4, up: [1, 0, 0] }));
  b.bind(chainBind(cape, capePts, J.chest)).paint(C.red, { c2: C.redDark, mat: MAT.cloth });
  const capeW = (v: number): number => mix(0.25, 0.37, Math.sin(v * Math.PI * 0.5));
  const capeMain = [0, 0.25, 0.5, 0.75, 0.9].map((v) => polyAt(capePts, v));
  strip(b, capeMain, { width: (v) => capeW(v * 0.9), bow: [0, 0, -0.07], wave: 0.22, nu: 6, nv: 8, tail: 'flat' });
  b.paint(0xffffff, { team: 1, mat: MAT.cloth });
  strip(b, [polyAt(capePts, 0.9), polyAt(capePts, 0.95), polyAt(capePts, 1)], { width: (v) => capeW(0.9 + v * 0.1), bow: [0, 0, -0.07], nu: 6, nv: 2, tail: 'flat' });

  // ── 头：圆铁盔 + 红缨，赤褐短髯，咧嘴笑 ──
  const hd = head(b, h, C.skin, 1, 0.25, 1.1);
  face(b, h, hd, {
    iris: 0x3a2412, irisGlow: 0.05, irisSize: 0.6, brow: C.beard, browTilt: 5, browH: 0.03, browLen: 1.05, eyeW: 0.05, eyeH: 0.046, slant: 2, lash: 0.014,
    lip: 0x7c3526, skin: C.skin, nose: 1.3, ears: true, mouthW: 1.75, smile: 1, open: 0.85, lite: true,
  });
  beard(b, h, hd, { c: C.beard, c2: C.beardHi, spread: 1.5, thick: 0.075, drop: 0.06, tufts: 9, len: 0.075, tuftR: 0.058, puff: 0.15, mustache: 0.095, mustacheR: 0.017, curl: 0.034, gloss: 0 });
  {
    const ring = (dy: number, grow: number): number[] => {
      const r = hd.ring(dy);
      return [hd.cy + dy, r[0] + grow, r[1] + grow, 0, r[2]];
    };
    // 盔体：罩到眉上；盔沿外翻
    b.bone(J.head).paint(C.ironDark, { c2: C.ironLight, gloss: 0.7, mat: MAT.metal });
    b.lathe([ring(0.085, 0.07), ring(0.1, 0.045), ring(0.17, 0.04), ring(0.225, 0.045), [hd.cy + 0.275, 0.13, 0.135, 0, -0.016], [hd.cy + 0.305, 0.05, 0.05, 0, -0.018]], { seg: 14, cap0: false });
    // 盔箍与盔顶铜座
    b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
    b.lathe([ring(0.1, 0.05), ring(0.117, 0.062), ring(0.134, 0.047)], { seg: 14, cap0: false, cap1: false, crease: 30 });
    b.lathe([[hd.cy + 0.295, 0.06], [hd.cy + 0.32, 0.045], [hd.cy + 0.345, 0.03]], { seg: 8, cap0: false });
    // 额前一枚铜泡
    b.ball(0, hd.cy + 0.165, hd.surf(0, hd.cy + 0.165) + 0.045, 0.04, 0.04, 0.02, 0, 180);
    // 两侧外翻的铁叶与脑后的护颈
    b.paint(C.ironDark, { c2: C.ironLight, gloss: 0.7, mat: MAT.metal });
    const r0 = hd.ring(0.05);
    b.sym(() => b.g(X(r0[0] + 0.04, hd.cy + 0.03, r0[2] - 0.03, -24, 96, 0), () => b.extrude([[-0.1, 0.09], [0.1, 0.09], [0.11, -0.03], [0.04, -0.13], [-0.06, -0.11], [-0.11, -0.01]], 0.022, 0.009)));
    b.g(X(0, hd.cy + 0.0, r0[2] - r0[1] - 0.045, -20, 180, 0), () => b.extrude([[-0.15, 0.1], [0.15, 0.1], [0.17, -0.03], [0.08, -0.11], [-0.08, -0.11], [-0.17, -0.03]], 0.022, 0.009));
  }
  // 盔缨：从盔顶喷泉一样散开的一撮红缨
  b.bind(chainBind(plume, plumePts, J.head)).paint(C.redLight, { c2: C.red, mat: MAT.fur });
  const topY = hd.cy + 0.34;
  b.ball(0, topY + 0.035, -0.015, 0.06, 0.05, 0.06, 1);
  lock(b, [0, topY + 0.03, -0.015], [0, 1, -0.2], 0.22, 0.06, { n: 3, seg: 5, curl: [0, -0.1, -0.25], tip: 0.35 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.5;
    lock(b, [Math.cos(a) * 0.03, topY + 0.04, Math.sin(a) * 0.03 - 0.015], [Math.cos(a) * 0.9, 0.75, Math.sin(a) * 0.9 - 0.1], 0.24, 0.05, { n: 3, seg: 4, curl: [Math.cos(a) * 0.1, -1.0, Math.sin(a) * 0.1], up: [-Math.sin(a), 0, Math.cos(a)], tip: 0.3 });
  }

  // ── 宣花大斧(右手握，左手扶柄)：柄沿 +Z，斧刃朝 −Y ──
  b.bone(J.propR);
  b.g(X(-d.shoulderX, d.handY, 0), () => {
    // 柄：深漆木，握段缠革
    b.paint(C.shaft, { c2: 0x7a3a2a, gloss: 0.35, mat: MAT.leather });
    b.tube([[0, 0, AXE.butt + 0.06, 0.027], [0, 0, 0.3, 0.029], [0, 0, 1.18, 0.031]], { seg: 6 });
    b.paint(C.leatherDark, { c2: C.leather, gloss: 0.2, mat: MAT.leather });
    b.tube([[0, 0, -0.34, 0.033], [0, 0, 0.12, 0.034]], { seg: 6, cap0: false, cap1: false });
    // 柄尾铜鐏
    b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
    b.tube([[0, 0, AXE.butt - 0.07, 0.006], [0, 0, AXE.butt, 0.04], [0, 0, AXE.butt + 0.08, 0.034]], { seg: 6, crease: 30 });
    // 斧銎：套在柄上的铜筒 + 柄首的矛尖
    b.tube([[0, 0, 1.12, 0.036], [0, 0, 1.16, 0.05], [0, 0, 1.5, 0.05], [0, 0, 1.54, 0.036]], { seg: 6, crease: 30 });
    b.paint(C.steelDark, { c2: C.steel, gloss: 1, mat: MAT.metal });
    b.tube([[0, 0, 1.53, 0.012, 0.03], [0, 0, 1.6, 0.014, 0.05], [0, 0, 1.76, 0.002, 0.004]], { seg: 4, up: [1, 0, 0], crease: 0 });
    // 斧背的短尖
    b.tube([[0, 0.03, AXE.head, 0.016, 0.085], [0, 0.14, AXE.head, 0.014, 0.06], [0, 0.3, AXE.head + 0.02, 0.002, 0.004]], { seg: 4, up: [1, 0, 0], crease: 0 });
    // 斧面：半月形宽刃(刃展约 0.8，高 0.6)。轮廓画在[沿柄, 朝刃]平面里，再转到握持坐标
    const zc = AXE.head;
    const outline = [
      [0.13, 0.03], [0.17, 0.17], [0.3, 0.36], [0.42, 0.45], [0.38, 0.535], [0.25, 0.6], [0.085, 0.635],
      [-0.085, 0.635], [-0.25, 0.6], [-0.38, 0.535], [-0.42, 0.45], [-0.3, 0.36], [-0.17, 0.17], [-0.13, 0.03],
    ].map((p) => [zc + p[0], p[1]]);
    b.paint(C.steelDark, { c2: C.steel, gloss: 1, mat: MAT.metal });
    b.g(X(0, 0, 0, 180, -90, 0), () => b.extrude(outline, 0.062, 0.027));
    // 刃口：一线赤金，平时微亮，出招时由自发光倍率提亮
    b.paint(C.edge, { c2: 0xffe0a0, glow: 0.14, gloss: 1, mat: MAT.metal, line: 0 });
    const edge: number[][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = lerp(-1, 1, t);
      // 沿刃口的一段弧：两端收到斧尖
      edge.push([0, -(0.635 - 0.19 * a * a) - 0.004, zc + a * 0.4, 0.012, 0.02 * (1 - 0.5 * a * a)]);
    }
    b.tube(edge, { seg: 4, up: [1, 0, 0], crease: 0 });
    // 宣花：斧面两侧各一朵铜花(花心 + 六瓣)
    for (const sx of [1, -1]) {
      b.paint(C.brass, { c2: 0xffd27a, gloss: 1, mat: MAT.metal, line: 0 });
      b.ball(sx * 0.034, -0.37, zc, 0.016, 0.05, 0.05, 0, 180);
      b.paint(C.brassDark, { c2: C.brass, gloss: 1, mat: MAT.metal, line: 0 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.ball(sx * 0.03, -0.37 + Math.cos(a) * 0.105, zc + Math.sin(a) * 0.105, 0.008, 0.042, 0.042, 0, 180);
      }
    }
  });
  // 斧颈红缨
  b.bind(chainBind(tassel, tasselPts, J.propR)).paint(C.redLight, { c2: C.red, mat: MAT.fur });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    lock(b, [-d.shoulderX + Math.cos(a) * 0.03, d.handY - 0.03, 1.1 + Math.sin(a) * 0.03], [Math.cos(a) * 0.25, -1, Math.sin(a) * 0.25], 0.3, 0.036, { n: 3, seg: 4, tip: 0.3 });
  }

  b.bakeGrounding(2.05);
  return { h, b, extra: { gripR, aim, gripL } };
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 2.75, stance: 0.4, lift: 0.26, bob: 0.06, drop: 0.07, lean: 14, sway: 0.05, twist: 12, width: 0.16, arm: 34, elbow: 56 };

interface Anims {
  stance: CKP;
  tmp: CKP;
  atkA: TrackKey[];
  atkB: TrackKey[];
  atkX: TrackKey[];
  s1: TrackKey[];
  carry: CKP;
  dash: CKP;
  spin: CKP;
  channel: CKP;
  ult: TrackKey[];
  common: CommonAnims;
}

/**
 * 扛斧：右手在右胸前攥住柄的下段，斧柄斜着搭在右肩的披膊上，斧头落在右肩后上方、刃朝外上。
 * 握点抬到齐肩高、柄往后放倒到离水平约 36°：从正面看是一根从胸前斜过肩头的柄，而不是竖在身侧的一根杆
 * (原先握点低、柄离竖直只有 38°，柄从肩膀上方二十多厘米处悬空穿过，读成「拄着」而不是「扛着」)。
 */
const CARRY = { gripR: [-0.17, 0.12, 0.32], aim: [-147, 40, -74], gripL: [0, -0.24, 0] };

function makeAnims(h: Human): Anims {
  // 站姿：两脚开立，肚子挺着，斧扛右肩，左手叉腰
  const stance = kp(h, null, {
    hipsPos: [0, -0.05, 0],
    hips: [-2, -10, 0],
    spine: [-3, 4, 0],
    chest: [-3, 6, 0],
    neck: [2, 4, 0],
    head: [0, 4, 0],
    footL: [0.2, 0.09, 0.1, 0, 18],
    footR: [-0.22, 0.09, -0.08, 0, -26],
    ...CARRY,
  });
  // 普攻 A·斜劈：自右肩抡过头顶，斜劈到左前下方
  const aWind = kp(h, stance, {
    hipsPos: [0.02, -0.06, -0.06],
    hips: [-4, -24, 0],
    spine: [-6, -12, 0],
    chest: [-8, -18, 0],
    head: [4, 30, 0],
    gripR: [-0.2, 0.2, 0.2],
    aim: [-150, 16, 0],
    gripL: [1, -0.22, 0],
  });
  const aHit = kp(h, stance, {
    hipsPos: [-0.02, -0.16, 0.14],
    hips: [12, 14, 0],
    spine: [10, 8, 0],
    chest: [10, 12, 0],
    head: [-12, -18, 0],
    footL: [0.2, 0.09, 0.34, 0, 14],
    gripR: [0.02, 0.0, 0.46],
    aim: [12, 4, 0],
    gripL: [1, -0.22, 0],
  });
  const aFollow = kp(h, aHit, { hips: [14, 20, 0], chest: [12, 16, 0], gripR: [0.08, -0.1, 0.4], aim: [28, 12, 0] });
  const atkA = track([
    [0, stance],
    [0.21, aWind, E.out],
    [0.35, aHit, E.in3],
    [0.5, aFollow, E.out],
    [1, stance, E.io],
  ]);
  // 强化的一斧(越砍越勇)：同样是斜劈，预备更大、下沉更深
  const xWind = kp(h, aWind, { hipsPos: [0.02, 0.0, -0.1], spine: [-12, -14, 0], chest: [-14, -22, 0], gripR: [-0.16, 0.3, 0.12], aim: [-168, 18, 0] });
  const xHit = kp(h, aHit, { hipsPos: [-0.02, -0.24, 0.18], hips: [18, 16, 0], spine: [14, 8, 0], gripR: [0.02, -0.16, 0.44], aim: [20, 4, 0] });
  const atkX = track([
    [0, stance],
    [0.23, xWind, E.out],
    [0.35, xHit, E.in3],
    [0.56, xHit, E.lin],
    [1, stance, E.io],
  ]);
  // 普攻 B·反撩：斧沉到左后下方，贴着身体左侧反手向右前上方撩起
  const bWind = kp(h, stance, {
    hipsPos: [-0.02, -0.14, -0.04],
    hips: [6, 26, 0],
    spine: [6, 14, 0],
    chest: [6, 22, 0],
    head: [0, -34, 0],
    gripR: [-0.02, -0.2, 0.28],
    aim: [24, 150, -100],
    gripL: [1, -0.2, 0],
  });
  const bHit = kp(h, stance, {
    hipsPos: [0.02, -0.06, 0.12],
    hips: [-4, -22, 0],
    spine: [-6, -12, 0],
    chest: [-8, -20, 0],
    head: [6, 36, 0],
    footL: [0.2, 0.09, 0.3, 0, 14],
    gripR: [-0.12, 0.08, 0.42],
    aim: [-12, -8, -105],
    gripL: [1, -0.2, 0],
  });
  const bFollow = kp(h, bHit, { chest: [-12, -26, 0], gripR: [-0.18, 0.2, 0.32], aim: [-46, -46, -105] });
  // 收势：斧从右前上方落回右肩。中间垫一帧「斧在右肩外侧上方、向右歪着」——俯仰与偏航各自线性插值的话，
  // 斧会先竖起来再从头顶正上方往后倒，斧面有两三帧扫过盔顶与盔缨；垫这一帧让它绕着右肩外侧落下去
  const bBack = kp(h, stance, { hips: [-3, -16, 0], chest: [-6, -8, 0], head: [2, 14, 0], gripR: [-0.24, 0.2, 0.33], aim: [-126, 82, -86], gripL: [0.5, -0.2, 0] });
  const atkB = track([
    [0, stance],
    [0.2, bWind, E.out],
    [0.35, bHit, E.in3],
    [0.5, bFollow, E.out],
    [0.76, bBack, E.io],
    [1, stance, E.io],
  ]);
  // 一技能·拦腰一斧：斧自右后经身前平扫到左，拧腰带动
  const s1Wind = kp(h, stance, {
    hipsPos: [0.03, -0.14, -0.06],
    hips: [2, -34, 0],
    spine: [0, -18, 0],
    chest: [-2, -26, 0],
    head: [0, 56, 0],
    footR: [-0.24, 0.09, -0.16, 0, -40],
    gripR: [-0.3, -0.1, 0.16],
    aim: [4, -110, 90],
    gripL: [1, -0.2, 0],
  });
  const s1Hit = kp(h, stance, {
    hipsPos: [0, -0.18, 0.16],
    hips: [8, 14, 0],
    spine: [6, 10, 0],
    chest: [6, 14, 0],
    head: [-6, -20, 0],
    footL: [0.22, 0.09, 0.36, 0, 10],
    footR: [-0.22, 0.11, -0.26, 26, -30],
    gripR: [-0.04, -0.12, 0.44],
    aim: [8, 6, 90],
    gripL: [1, -0.2, 0],
  });
  const s1End = kp(h, s1Hit, { hips: [8, 34, 0], spine: [6, 16, 0], chest: [6, 26, 0], head: [-6, -50, 0], gripR: [0.14, -0.12, 0.3], aim: [8, 104, 90] });
  const s1 = track([
    [0, stance],
    [0.2, s1Wind, E.out],
    [0.4, s1Hit, E.in],
    [0.58, s1End, E.out],
    [0.74, s1End, E.lin],
    [1, stance, E.io],
  ]);
  // 跑动：扛着斧大步走，左臂自己摆
  const carry = kp(h, null, { gripR: [CARRY.gripR[0], CARRY.gripR[1] + 0.02, CARRY.gripR[2]], aim: [CARRY.aim[0] + 2, CARRY.aim[1], CARRY.aim[2]], gripL: [-1, 0, 0] });
  // 二技能·半路杀出：压低身子前冲，斧头在前像撞角
  const dash = kp(h, null, {
    hipsPos: [0, -0.2, 0.1],
    hips: [36, -14, 0],
    spine: [10, 6, 0],
    chest: [6, 8, 0],
    neck: [-20, 0, 0],
    head: [-26, 4, 0],
    footL: [0.14, 0.12, 0.5, -20, 0],
    footR: [-0.14, 0.3, -0.62, 60, 0],
    gripR: [-0.06, -0.06, 0.46],
    aim: [6, 2, 0],
    gripL: [1, -0.22, 0],
  });
  // 大招·抡圆了砍：双手平举大斧伸直，上身略后仰(整个人绕竖轴转，见 animate)
  const spin = kp(h, null, {
    hipsPos: [0, -0.12, 0],
    hips: [0, 0, 0],
    spine: [-4, 0, 0],
    chest: [-8, 0, 0],
    head: [8, 0, 0],
    footL: [0.22, 0.09, 0.06, 0, 20],
    footR: [-0.22, 0.09, -0.06, 0, -20],
    gripR: [-0.08, 0.06, 0.5],
    aim: [10, 0, -90],
    gripL: [1, -0.2, 0],
  });
  // 回城引导：斧拄地立在身前，双手叠在柄上
  const channel = kp(h, stance, {
    hipsPos: [0, -0.1, 0],
    hips: [4, 0, 0],
    spine: [4, 0, 0],
    chest: [4, 0, 0],
    head: [12, 0, 0],
    footL: [0.2, 0.09, 0.04, 0, 14],
    footR: [-0.2, 0.09, -0.04, 0, -18],
    gripR: [-0.06, -0.02, 0.36],
    aim: [-96, 0, 90],
    gripL: [1, 0.36, 0],
  });
  // 大招起手(很短)：斧自肩头抡起
  const ultUp = kp(h, stance, { hipsPos: [0, -0.16, 0], chest: [-10, -20, 0], gripR: [-0.2, 0.12, 0.3], aim: [-60, -50, -90], gripL: [1, -0.2, 0] });
  const ult = track([
    [0, stance],
    [0.55, ultUp, E.out],
    [1, spin, E.in],
  ]);
  const common = makeCommon(h, stance, {
    limp: { gripR: [-0.3, -0.26, 0.16], aim: [30, -20, 0], gripL: [-1, 0, 0] },
    lying: { armL: [-6, 0, 66], foreL: [-20, 0, 0], gripR: [-0.42, 0.0, 0.1], aim: [-4, -70, 90], gripL: [-1, 0, 0] },
  });
  return { stance, tmp: emptyCKP(h), atkA, atkB, atkX, s1, carry, dash, spin, channel, ult, common };
}

const _p = [0, 0, 0];
const _qh = [0, 0, 0, 1];
const _sv = new Float32Array(8);

export function createChijin(): ModelDef {
  const { h, b, extra } = build();
  const A = makeAnims(h);
  const J = h.J;
  const rig = h.rig;
  const k = A.tmp;
  const geometry = b.build();
  const GR = extra.gripR * 3;
  const AM = extra.aim * 3;
  const GL = extra.gripL * 3;

  /**
   * 按关键帧里的持斧参数摆好双臂与斧(躯干已就位之后调用)。
   * slide > 0 时斧沿柄向柄首方向从手里滑出这么多(拄地时握点在柄的中段)。
   */
  const wield = (pose: Pose, e: Float32Array, slide = 0): void => {
    reachHand(h, pose, -1, J.chest, e[GR], e[GR + 1], e[GR + 2], -0.7, -0.55, -0.45);
    // 斧的朝向直接按根空间的欧拉角给：setSpaceRot 需要父关节(手)在根空间里的朝向
    poseSpace(rig, pose, J.handR, _p, _qh);
    setSpaceRot(pose, J.propR, _qh, e[AM], e[AM + 1], e[AM + 2]);
    if (slide !== 0) {
      // 沿斧自身的轴线(关节局部的 +Z 转到手的坐标里)平移
      const q = pose.q;
      const o = J.propR * 4;
      const x = q[o];
      const y = q[o + 1];
      const z = q[o + 2];
      const w = q[o + 3];
      pose.pos(J.propR, 2 * (x * z + w * y) * -slide, 2 * (y * z - w * x) * -slide, (1 - 2 * (x * x + y * y)) * -slide);
    }
    const wl = e[GL];
    if (wl < -0.5) return;
    // 左手：叉腰 ↔ 握住斧柄
    reachHand(h, pose, 1, J.hips, 0.262, 0.09, 0.07, 1, -0.15, -0.6);
    if (wl > 0.01) {
      const q = pose.q;
      for (let i = 0; i < 4; i++) {
        _sv[i] = q[J.armL * 4 + i];
        _sv[4 + i] = q[J.foreL * 4 + i];
      }
      reachHand(h, pose, 1, J.propR, 0, 0, e[GL + 1], 0.7, -0.6, -0.25);
      if (wl < 0.99) {
        mixQ(q, J.armL * 4, _sv, 0, wl);
        mixQ(q, J.foreL * 4, _sv, 4, wl);
      }
    }
  };

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const C0 = A.common;
    if (animateCommon(h, pose, a.anim === 'leap' ? 'airborne' : a.anim, a.t, a.p, a.time, C0)) {
      wield(pose, (a.anim === 'dead' ? C0.tmp : a.anim === 'stunned' ? C0.stun : C0.air).e);
      if (a.anim === 'dead') out.glow = Math.max(0.15, 1 - a.t * 1.2);
      return;
    }
    switch (a.anim) {
      case 'move': {
        runCycle(h, pose, a.stride, RUN, () => {
          // 大摇大摆：上身跟着步子左右晃
          const sw = Math.cos(a.stride * Math.PI * 2);
          pose.add(J.chest, 0, 0, sw * 3);
          pose.add(J.head, 0, 0, -sw * 2);
        });
        copyCKP(k, A.carry);
        // 斧在肩上随步子颠
        k.e[AM] += Math.sin(a.stride * Math.PI * 4) * 2.5;
        wield(pose, k.e);
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const strong = (a.mode & 1) !== 0;
        sampleTrack(strong ? A.atkX : a.variant % 2 === 0 ? A.atkA : A.atkB, p, k);
        applyCKP(h, pose, k);
        wield(pose, k.e);
        // 越砍越勇(技能后的强化普攻)：刃光更盛
        out.glow = 1 + (strong ? 3.2 : 1.4) * bump(p, 0.36, 0.2);
        break;
      }
      case 'cast_s1': {
        sampleTrack(A.s1, a.p, k);
        applyCKP(h, pose, k);
        wield(pose, k.e);
        out.glow = 1 + 2.4 * bump(a.p, 0.42, 0.3);
        break;
      }
      case 'cast_s2':
      case 'dash': {
        applyCKP(h, pose, A.dash);
        wield(pose, A.dash.e);
        out.glow = 2.4;
        break;
      }
      case 'cast_ult': {
        sampleTrack(A.ult, a.p, k);
        applyCKP(h, pose, k);
        wield(pose, k.e);
        out.glow = 1 + 1.6 * a.p;
        break;
      }
      case 'spin': {
        copyCKP(k, A.spin);
        applyCKP(h, pose, k, () => {
          // 整个人绕竖轴高速旋转：每秒约 2.4 圈；起手 0.15 秒内加速
          const t = a.t;
          const turns = t < 0.15 ? ((t * t) / 0.3) * 2.4 : (t - 0.075) * 2.4;
          pose.rot(J.root, 0, -turns * 360, 0);
          pose.add(J.spine, 0, 0, 4 * Math.sin(t * 9));
        });
        wield(pose, k.e);
        out.glow = 2.6;
        break;
      }
      case 'channel': {
        applyCKP(h, pose, A.channel, () => {
          breathe(h, pose, a.time, a.seed, 0.8);
        });
        wield(pose, A.channel.e, 0.5);
        out.glow = 1 + 0.5 * (0.5 + 0.5 * Math.sin(a.time * 5));
        break;
      }
      default: {
        copyCKP(k, A.stance);
        // 每隔几秒掂一下肩上的斧
        const cyc = (a.time * 0.28 + a.seed) % 1;
        const hop = bump(cyc, 0.5, 0.06);
        k.e[GR + 1] += hop * 0.035;
        k.e[AM] += hop * 5 + Math.sin(a.time * 1.3) * 1.2;
        applyCKP(h, pose, k, () => {
          breathe(h, pose, a.time, a.seed, 1.2);
        });
        wield(pose, k.e);
        out.glow = 1 + 0.12 * Math.sin(a.time * 3);
      }
    }
  };

  return {
    key: 'hero:chijin',
    geometry,
    rig: h.rig,
    height: 2.3,
    radius: 0.64,
    scale: SCALE,
    stride: RUN.stride * SCALE,
    triangles: b.triangleCount,
    attach: {
      head: { joint: J.head, x: 0, y: 0.25, z: 0 },
      chest: { joint: J.chest, x: 0, y: 0.08, z: 0 },
      handR: { joint: J.handR, x: 0, y: -0.07, z: 0 },
      handL: { joint: J.handL, x: 0, y: -0.07, z: 0 },
      weapon: { joint: J.propR, x: 0, y: -0.4, z: AXE.head },
      muzzle: { joint: J.propR, x: 0, y: -0.4, z: AXE.head },
    },
    blend: (from, to) => (to === 'attack' || to === 'dash' || to === 'cast_s2' ? 0.07 : to === 'dead' ? 0.05 : from === 'dash' || from === 'spin' ? 0.18 : 0.13),
    animate,
  };
}
