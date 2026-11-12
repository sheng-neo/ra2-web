/**
 * 夜阙 · 夜隐刺客：修长的蒙面刺客。贴身的暗紫黑夜行衣，兜帽与面罩，阴影里两点紫光的眼睛，
 * 颈后一条长长的破碎围巾(末端渐隐成烟)，双手反握两把紫色能量短刃。
 * 剪影要点：尖顶兜帽、拖在身后的长围巾、反握的发光短刃；奔跑时身体压得很低。
 */
import { type CKP, type CommonAnims, E, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, STANDARD_DIMS, type TrackKey, animateCommon, applyCKP, breathe, bump, emptyCKP, humanRig, kp, makeCommon, runCycle, sampleTrack, strikeWarp, track } from '../humanoid';
import { ModelBuilder, X, lerp } from '../kit';
import { boot, chainBind, fist, hairCap, head, strip, torsoBind, trim } from '../parts';
import type { Pose } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  suit: 0x5c4a92,
  suitDark: 0x382d5e,
  black: 0x241f36,
  wrap: 0x6a5a9c,
  metal: 0x5a5470,
  metalLight: 0x8a84a4,
  accent: 0xb48cff,
  glow: 0xa070ff,
  glowHot: 0xe2d0ff,
  scarf: 0x5c4690,
  smoke: 0x1a1626,
};

const DIMS: HumanDims = { ...STANDARD_DIMS, hipX: 0.11, shoulderX: 0.275, clavX: 0.08 };
const SCALE = 1.15;

function build(): { h: Human; b: ModelBuilder } {
  const h = humanRig(DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();

  // ── 弹簧链：长围巾(主尾 + 短尾)、腰间垂带 ──
  const scarfPts = [[0.05, 1.42, -0.16], [0.1, 1.32, -0.42], [0.12, 1.1, -0.64], [0.12, 0.84, -0.78], [0.1, 0.56, -0.86], [0.08, 0.28, -0.9]];
  const scarf = rig.addChain('scarf', J.chest, scarfPts.slice(0, 5));
  rig.chain({ joints: scarf, tip: [-0.02, -0.28, -0.04], stiffness: 2.6, drag: 0.93, gravity: 5, maxAngle: 80, wind: 3.4, colliders: [{ joint: J.chest, x: 0, y: 0, z: 0, r: 0.24 }] });
  const scarf2Pts = [[-0.07, 1.42, -0.15], [-0.14, 1.28, -0.36], [-0.17, 1.06, -0.5], [-0.18, 0.82, -0.56]];
  const scarf2 = rig.addChain('scarfB', J.chest, scarf2Pts.slice(0, 3));
  rig.chain({ joints: scarf2, tip: [0, -0.24, -0.06], stiffness: 3.4, drag: 0.92, gravity: 6, maxAngle: 80, wind: 3, colliders: [{ joint: J.chest, x: 0, y: 0, z: 0, r: 0.24 }] });
  const sashPts = [[-0.17, 0.94, -0.06], [-0.24, 0.72, -0.12], [-0.27, 0.5, -0.16], [-0.28, 0.3, -0.18]];
  const sash = rig.addChain('sash', J.hips, sashPts.slice(0, 3));
  rig.chain({ joints: sash, tip: [0, -0.2, -0.02], stiffness: 5, drag: 0.9, gravity: 9, maxAngle: 65, wind: 1.4 });

  // ── 腿：紧身裤 + 绑腿 + 软底靴 ──
  b.sym((s) => {
    const x = d.hipX;
    b.bone(s > 0 ? J.thighL : J.thighR).paint(C.suit, { c2: C.suitDark, ao: 0.9 });
    b.limb([x, d.hipY + 0.04, 0], [x, d.kneeY, 0], 0.112, 0.084, { seg: 8, bulge: 0.05 });
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.metal, { c2: C.metalLight, gloss: 0.8 });
    b.g(X(x, d.kneeY + 0.01, 0.05, -10, 0, 0), () => b.extrude([[-0.06, 0.07], [0.06, 0.07], [0.045, -0.06], [0, -0.1], [-0.045, -0.06]], 0.04, 0.014));
  });
  for (const s of [1, -1] as const) {
    b.paint(C.black, { c2: C.suitDark });
    boot(b, h, s, { top: 0.43, rTop: 0.09, rAnkle: 0.07, len: 0.22, toe: 0.01 });
    // 绑腿：三道浅紫缠带
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.wrap, { c2: C.suit });
    for (const y of [0.2, 0.28, 0.36]) trim(b, s * d.hipX, y, 0, 0.082 + (y - 0.2) * 0.06, 0.082 + (y - 0.2) * 0.06, 0.008, 0.03, 8);
  }

  // ── 躯干 ──
  b.bind(torsoBind(h)).paint(C.suitDark, { c2: C.suit });
  b.lathe(
    [
      [0.76, 0.1, 0.09],
      [0.83, 0.18, 0.14],
      [0.92, 0.175, 0.135],
      [1.0, 0.145, 0.112],
      [1.1, 0.168, 0.128],
      [1.21, 0.215, 0.15],
      [1.33, 0.225, 0.145],
      [1.39, 0.14, 0.11],
      [1.43, 0.075, 0.07],
    ],
    { seg: 12 },
  );
  b.bone(J.neck).paint(C.black);
  b.lathe([[1.4, 0.066, 0.066], [1.52, 0.064, 0.064]], { seg: 8, cap0: false });
  // 胸前的交叉束带与紫晶扣
  b.bone(J.chest).paint(C.black, { c2: C.suitDark });
  b.tube([[-0.21, 1.34, 0.07, 0.035, 0.012], [-0.07, 1.22, 0.158, 0.035, 0.012], [0.09, 1.1, 0.135, 0.035, 0.012], [0.15, 1.04, 0.06, 0.035, 0.012]], { seg: 4, up: [0, 0.6, 0.8] });
  b.tube([[0.21, 1.34, 0.07, 0.035, 0.012], [0.07, 1.22, 0.158, 0.035, 0.012], [-0.09, 1.1, 0.135, 0.035, 0.012], [-0.15, 1.04, 0.06, 0.035, 0.012]], { seg: 4, up: [0, 0.6, 0.8] });
  b.paint(C.metal, { c2: C.metalLight, gloss: 0.9 });
  b.g(X(0, 1.2, 0.165, 0, 0, 45), () => b.box(0, 0, 0, 0.075, 0.075, 0.025, 0.012));
  b.paint(C.glow, { glow: 0.6, c2: C.glowHot });
  b.g(X(0, 1.2, 0.176, 0, 0, 45), () => b.box(0, 0, 0, 0.04, 0.04, 0.02, 0.008));
  // 腰带与垂带(队伍色)
  b.bone(J.spine).paint(C.black, { c2: C.suitDark });
  b.lathe([[0.92, 0.182, 0.142], [0.95, 0.19, 0.148], [1.0, 0.16, 0.124], [1.02, 0.15, 0.116]], { seg: 12 });
  b.paint(0xffffff, { team: 1 });
  b.lathe([[0.955, 0.192, 0.15], [0.965, 0.196, 0.153], [0.99, 0.172, 0.133]], { seg: 12, cap0: false, cap1: false });
  b.bind(chainBind(sash, sashPts, J.hips)).paint(0xffffff, { team: 1 });
  strip(b, sashPts, { width: (v) => lerp(0.05, 0.075, v), axis: [0.3, 0, 1], bow: [-0.015, 0, 0], nu: 2, nv: 6, tail: 'point', tailLen: 0.12, wave: 0.4 });
  // 腰后的两只小囊袋
  b.bone(J.hips).paint(C.black, { c2: C.suitDark });
  b.sym(() => b.box(0.1, 0.9, -0.15, 0.1, 0.1, 0.06, 0.02));

  // ── 手臂：窄袖 + 护臂，左肩一片薄甲 ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.suit, { c2: C.suitDark });
    b.ball(x, d.shoulderY, 0, 0.082, 0.082, 0.082, 1);
    b.limb([x, d.shoulderY, 0], [x, d.elbowY, 0], 0.076, 0.062, { seg: 8 });
    b.paint(0xffffff, { team: 1 });
    trim(b, x, d.shoulderY - 0.16, 0, 0.074, 0.074, 0.01, 0.028, 8);
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.suitDark);
    b.ball(x, d.elbowY, 0, 0.064, 0.064, 0.064, 1);
    b.limb([x, d.elbowY, 0], [x, d.wristY, 0], 0.06, 0.054, { seg: 8 });
    b.paint(C.metal, { c2: C.metalLight, gloss: 0.9 });
    b.g(X(x + 0.05, d.wristY + 0.11, 0, 0, 90, 4), () => b.extrude([[-0.05, 0.11], [0.05, 0.11], [0.04, -0.08], [0, -0.13], [-0.04, -0.08]], 0.03, 0.012));
    b.paint(C.glow, { glow: 0.55 });
    b.g(X(x + 0.07, d.wristY + 0.12, 0, 0, 90, 4), () => b.box(0, 0, 0, 0.016, 0.12, 0.012));
  });
  b.paint(C.black, { c2: C.suitDark });
  fist(b, h, 1, 0.056);
  fist(b, h, -1, 0.056);
  b.bone(J.clavL).paint(C.metal, { c2: C.metalLight, gloss: 0.9 });
  b.g(X(0.3, 1.44, 0, 0, 0, -22), () => {
    b.lathe([[-0.03, 0.14, 0.13], [0.02, 0.13, 0.12], [0.07, 0.08, 0.075], [0.085, 0.015, 0.015]], { seg: 6, crease: 30 });
    b.paint(C.glow, { glow: 0.55 });
    b.g(X(0, 0.07, 0.0, 0, 0, 0), () => b.crystal(0.03, 0.12, 4, 0.6, 0.2));
  });

  // ── 头：阴影里的脸 + 面罩 + 发光的眼 + 尖顶兜帽 ──
  const hd = head(b, h, 0x241d33, 0.95);
  const cy = hd.cy;
  // 面罩：盖住鼻梁以下
  b.bone(J.head).paint(C.suitDark, { c2: C.suit });
  b.lathe([[cy - 0.245, 0.04, 0.04, 0, 0.08], [cy - 0.2, 0.115, 0.108, 0, 0.056], [cy - 0.13, 0.176, 0.17, 0, 0.03], [cy - 0.075, 0.2, 0.2, 0, 0.018], [cy - 0.045, 0.19, 0.19, 0, 0.012]], { seg: 12, cap0: false, cap1: false });
  // 眼：两道上挑的紫光
  b.paint(C.glowHot, { glow: 0.9 });
  b.sym(() => b.g(X(0.092, cy - 0.005, hd.surf(0.092, cy - 0.005) + 0.004, 0, 22, 14), () => b.extrude([[-0.05, -0.012], [0.03, -0.022], [0.055, 0.022], [-0.03, 0.012]], 0.012, 0)));
  // 兜帽：比头大一圈的壳，脸前开口；顶部向后收成尖角
  hairCap(b, h, hd, {
    c: C.suitDark,
    c2: C.suit,
    thick: 0.06,
    gloss: 0,
    line: (phi) => (phi < 0.75 ? 0.14 : phi < 1.25 ? lerp(0.14, -0.26, (phi - 0.75) / 0.5) : -0.4),
  });
  b.paint(C.suitDark, { c2: C.suit });
  b.tube([[0, cy + 0.2, -0.12, 0.17, 0.12], [0, cy + 0.27, -0.24, 0.11, 0.08], [0, cy + 0.27, -0.38, 0.05, 0.04], [0, cy + 0.22, -0.5, 0.008, 0.008]], { seg: 8, up: [1, 0, 0] });
  // 兜帽前沿的滚边
  b.paint(C.wrap, { c2: C.suit });
  b.g(X(0, cy + 0.03, 0.065, -78, 0, 0, 1, 1, 0.94), () => b.torus(0.262, 0.024, 0.03, 14, 4, { crease: 40 }));

  // ── 围巾：绕颈 + 两条破碎的长尾，末端渐隐成烟 ──
  b.bone(J.chest).paint(C.scarf, { c2: C.suit });
  b.g(X(0, 1.455, 0.0, 8, 0, 0, 1, 1, 0.92), () => b.torus(0.14, 0.06, 0.055, 12, 5));
  const tailWidth = (v: number): number => (0.1 + 0.07 * Math.sin(v * Math.PI * 0.7)) * (1 - 0.55 * Math.pow(v, 3));
  b.bind(chainBind(scarf, scarfPts, J.chest)).paint(C.scarf, { c2: C.smoke, glow: 0, glow2: 0.1 });
  strip(b, scarfPts, { width: tailWidth, bow: [0, 0.03, 0], wave: 0.45, nu: 4, nv: 16, tail: 'swallow', tailLen: 0.3 });
  b.bind(chainBind(scarf2, scarf2Pts, J.chest)).paint(C.scarf, { c2: C.smoke });
  strip(b, scarf2Pts, { width: (v) => 0.085 * (1 - 0.5 * v), bow: [0, 0.02, 0], wave: 0.4, nu: 3, nv: 8, tail: 'swallow', tailLen: 0.2 });

  // ── 反握的能量短刃：握把在手心，刃沿 −Z ──
  const dagger = (bone: number, x: number): void => {
    b.bone(bone);
    b.g(X(x, d.handY, 0), () => {
      b.paint(C.black, { c2: C.suitDark });
      b.tube([[0, 0, -0.06, 0.024], [0, 0, 0.12, 0.022]], { seg: 6 });
      b.paint(C.metal, { c2: C.metalLight, gloss: 1 });
      b.ball(0, 0, 0.14, 0.032, 0.032, 0.036, 1, 40);
      b.tube([[0, 0, -0.06, 0.03, 0.075], [0, 0, -0.085, 0.03, 0.075]], { seg: 6, crease: 30 });
      // 能量刃：叶形，中脊更亮
      b.paint(C.glow, { c2: C.glowHot, glow: 0.42, glow2: 0.7, gloss: 1, line: 1 });
      const path: number[][] = [];
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        const w = i === 0 ? 0.03 : 0.085 * Math.pow(Math.sin(Math.PI * (0.18 + t * 0.82)), 0.8);
        path.push([0, -0.03 * t * t, -0.085 - t * 0.62, 0.016 * (1 - t * 0.6), Math.max(0.004, w)]);
      }
      b.tube(path, { seg: 4, up: [1, 0, 0], crease: 0 });
      b.paint(C.glowHot, { glow: 0.85 });
      b.tube([[0, 0, -0.12, 0.02, 0.014], [0, -0.012, -0.4, 0.02, 0.014], [0, -0.02, -0.56, 0.01, 0.006]], { seg: 4, up: [1, 0, 0], crease: 0 });
    });
  };
  dagger(J.propR, -d.shoulderX);
  dagger(J.propL, d.shoulderX);

  b.bakeGrounding(2.05, 0.72, 0.88);
  return { h, b };
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 3.0, stance: 0.3, lift: 0.3, bob: 0.04, drop: 0.14, lean: 30, twist: 8, width: 0.1, arm: 0 };

interface Anims {
  stance: CKP;
  tmp: CKP;
  atkA: TrackKey[];
  atkB: TrackKey[];
  s2: TrackKey[];
  vanish: TrackKey[];
  runArms: CKP;
  dash: CKP;
  channel: CKP;
  common: CommonAnims;
}

function makeAnims(h: Human): Anims {
  // 站姿：压低重心的潜行架势，双刃反握护在身前
  const stance = kp(h, null, {
    hipsPos: [0, -0.13, 0],
    hips: [10, -18, 0],
    spine: [8, 8, 0],
    chest: [6, 10, 0],
    neck: [-10, 0, 0],
    head: [-10, 6, 0],
    footL: [0.17, 0.09, 0.18, 0, 14],
    footR: [-0.19, 0.09, -0.18, 6, -34],
    armL: [-36, 0, 18],
    foreL: [-70, -20, 0],
    propL: [10, 0, 0],
    armR: [-10, 0, -22],
    foreR: [-78, 30, 0],
    propR: [10, 0, 0],
  });
  // 普攻 A：右刃自外向内横抹
  const aWind = kp(h, stance, { hips: [8, -40, 0], chest: [4, -14, 0], head: [-8, 46, 0], armR: [10, 0, -80], foreR: [-100, 0, 0], propR: [0, -40, 0] });
  const aHit = kp(h, stance, {
    hipsPos: [0, -0.17, 0.14],
    hips: [14, 16, 0],
    chest: [10, 30, 0],
    head: [-12, -40, 0],
    footL: [0.17, 0.09, 0.34, 0, 14],
    armR: [-74, 60, -20],
    foreR: [-40, 0, 0],
    propR: [-30, 40, 0],
    armL: [20, 0, 36],
  });
  const atkA = track([
    [0, stance],
    [0.18, aWind, E.out],
    [0.35, aHit, E.in3],
    [0.5, aHit, E.out],
    [1, stance, E.io],
  ]);
  // 普攻 B：左刃前刺
  const bWind = kp(h, stance, { hips: [8, 14, 0], chest: [4, 24, 0], head: [-8, -30, 0], armL: [30, 0, 40], foreL: [-110, 0, 0], propL: [-60, 0, 0] });
  const bHit = kp(h, stance, {
    hipsPos: [0, -0.18, 0.16],
    hips: [16, -40, 0],
    chest: [10, -30, 0],
    head: [-14, 64, 0],
    footL: [0.17, 0.09, 0.36, 0, 14],
    armL: [-84, -24, 10],
    foreL: [-8, 0, 0],
    propL: [-176, 0, 0],
    armR: [30, 0, -40],
  });
  const atkB = track([
    [0, stance],
    [0.18, bWind, E.out],
    [0.35, bHit, E.in3],
    [0.5, bHit, E.out],
    [1, stance, E.io],
  ]);
  // 二技能·影刃飞旋：右臂自左腰向外一挥，甩出一扇飞刃
  const s2Wind = kp(h, stance, { hips: [8, 20, 0], chest: [4, 34, 0], head: [-8, -46, 0], armR: [-50, 80, -10], foreR: [-90, 0, 0] });
  const s2Hit = kp(h, stance, { hipsPos: [0, -0.16, 0.1], hips: [12, -30, 0], chest: [8, -34, 0], head: [-10, 60, 0], armR: [-80, -40, -60], foreR: [-6, 0, 0], propR: [-90, 0, 0], armL: [30, 0, 40] });
  const s2 = track([
    [0, stance],
    [0.3, s2Wind, E.out],
    [0.5, s2Hit, E.in3],
    [1, s2Hit, E.lin],
  ]);
  // 大招·幽夜处决：俯身没入暗影
  const sink = kp(h, stance, { hipsPos: [0, -0.34, 0], hips: [24, 0, 0], spine: [14, 0, 0], chest: [10, 0, 0], head: [10, 0, 0], armL: [-30, 0, 50], foreL: [-100, -30, 0], armR: [-30, 0, -50], foreR: [-100, 30, 0] });
  const vanish = track([
    [0, stance],
    [0.5, sink, E.out],
    [1, sink, E.lin],
  ]);
  // 奔跑：上身几乎放平，双臂拖在身后
  const runArms = kp(h, null, { armL: [66, 0, 24], foreL: [-14, 0, 0], propL: [30, 0, 0], armR: [66, 0, -24], foreR: [-14, 0, 0], propR: [30, 0, 0] });
  // 瞬影斩：整个人拉成一条线，右刃前递
  const dash = kp(h, null, {
    hipsPos: [0, -0.26, 0.12],
    hips: [48, -24, 0],
    spine: [10, 8, 0],
    chest: [6, 12, 0],
    neck: [-24, 0, 0],
    head: [-28, 6, 0],
    footL: [0.11, 0.12, 0.48, -20, 0],
    footR: [-0.11, 0.34, -0.6, 70, 0],
    armR: [-110, 20, -16],
    foreR: [-10, 0, 0],
    propR: [-150, 0, 0],
    armL: [70, 0, 30],
    foreL: [-10, 0, 0],
    propL: [30, 0, 0],
  });
  const channel = kp(h, stance, { hipsPos: [0, -0.3, 0], hips: [14, 0, 0], chest: [8, 0, 0], head: [16, 0, 0], armL: [-20, 0, 30], foreL: [-110, -40, 0], armR: [-20, 0, -30], foreR: [-110, 40, 0] });
  const common = makeCommon(h, stance, { limp: { propL: [20, 0, 0], propR: [20, 0, 0] } });
  return { stance, tmp: emptyCKP(h), atkA, atkB, s2, vanish, runArms, dash, channel, common };
}

export function createYeque(): ModelDef {
  const { h, b } = build();
  const A = makeAnims(h);
  const J = h.J;
  const k = A.tmp;
  const geometry = b.build();

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    if (animateCommon(h, pose, a.anim === 'leap' ? 'airborne' : a.anim, a.t, a.p, a.time, A.common)) {
      if (a.anim === 'dead') out.glow = Math.max(0.1, 1 - a.t * 1.3);
      return;
    }
    switch (a.anim) {
      case 'move': {
        runCycle(h, pose, a.stride, RUN, () => {
          const e = A.runArms.e;
          const sw = Math.cos(a.stride * Math.PI * 2);
          for (const j of [J.armL, J.foreL, J.propL, J.armR, J.foreR, J.propR]) pose.rot(j, e[j * 3], e[j * 3 + 1], e[j * 3 + 2]);
          pose.add(J.armL, sw * 6, 0, 0);
          pose.add(J.armR, -sw * 6, 0, 0);
        });
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        sampleTrack(a.variant % 2 === 0 ? A.atkA : A.atkB, p, k);
        applyCKP(h, pose, k);
        out.glow = 1 + 1.3 * bump(p, 0.36, 0.2);
        break;
      }
      case 'cast_s1':
      case 'dash': {
        applyCKP(h, pose, A.dash);
        out.glow = 2.4;
        break;
      }
      case 'cast_s2': {
        sampleTrack(A.s2, a.p, k);
        applyCKP(h, pose, k);
        out.glow = 1 + 2 * bump(a.p, 0.45, 0.3);
        break;
      }
      case 'cast_ult': {
        sampleTrack(A.vanish, a.p, k);
        applyCKP(h, pose, k, () => pose.rot(J.root, 0, -a.p * 200, 0));
        out.glow = 1 + 2.4 * a.p;
        break;
      }
      case 'spin':
      case 'channel': {
        applyCKP(h, pose, A.channel, () => breathe(h, pose, a.time, a.seed, 0.8));
        out.glow = 1 + 0.5 * (0.5 + 0.5 * Math.sin(a.time * 5));
        break;
      }
      default: {
        applyCKP(h, pose, A.stance, () => {
          breathe(h, pose, a.time * 1.2, a.seed, 0.9);
          pose.move(J.hips, Math.sin(a.time * 1.4 + a.seed * 5) * 0.012, 0, 0);
          pose.add(J.propL, Math.sin(a.time * 2) * 3, 0, 0);
          pose.add(J.propR, Math.cos(a.time * 2) * 3, 0, 0);
        });
        out.glow = 1 + 0.18 * Math.sin(a.time * 3.4);
      }
    }
  };

  return {
    key: 'hero:yeque',
    geometry,
    rig: h.rig,
    height: 2.1,
    radius: 0.58,
    scale: SCALE,
    stride: RUN.stride * SCALE,
    triangles: b.triangleCount,
    attach: {
      head: { joint: J.head, x: 0, y: 0.25, z: 0 },
      chest: { joint: J.chest, x: 0, y: 0.08, z: 0 },
      handR: { joint: J.handR, x: 0, y: -0.07, z: 0 },
      handL: { joint: J.handL, x: 0, y: -0.07, z: 0 },
      weapon: { joint: J.propR, x: 0, y: -0.02, z: -0.6 },
      muzzle: { joint: J.propR, x: 0, y: 0, z: 0 },
    },
    blend: (from, to) => (to === 'attack' || to === 'dash' ? 0.06 : to === 'dead' ? 0.05 : from === 'dash' ? 0.14 : 0.12),
    animate,
  };
}
