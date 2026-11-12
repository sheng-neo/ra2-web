/**
 * 赤烬 · 焰刃武者：精悍的双刀武者。深色轻甲 + 赤红披巾与腰带，高马尾，额前火纹，双手各一把烧红的弧刃。
 * 剪影要点：两把长刃(根部暗红 → 刃尖亮橙发光)、身后飘动的披巾与马尾、不对称的左肩甲。
 */
import { type CKP, type CommonAnims, E, type Human, type RunStyle, RUN_DEFAULT, STANDARD_DIMS, animateCommon, applyCKP, breathe, bump, copyCKP, emptyCKP, humanRig, kp, makeCommon, mix, runCycle, sampleTrack, strikeWarp, track } from '../humanoid';
import { ModelBuilder, X } from '../kit';
import { boot, chainBind, face, fist, hairCap, head, strip, torsoBind, trim } from '../parts';
import type { Pose } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  red: 0xd43a2e,
  redDark: 0x8a1e1c,
  redLight: 0xf4704e,
  cloth: 0x4c3e47,
  clothDark: 0x30262d,
  steel: 0x8d8994,
  steelDark: 0x55505b,
  gold: 0xffb347,
  goldDark: 0xc47a26,
  skin: 0xf2c29b,
  hair: 0x271c20,
  hairLight: 0x55302e,
  ember: 0xff6a2a,
  leather: 0x5c4036,
};

const SCALE = 1.15;

function build(): { h: Human; b: ModelBuilder; extra: Extra } {
  const h = humanRig(STANDARD_DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();

  // ── 弹簧链 ──
  const ponyPts = [[0, 1.94, -0.2], [0, 1.97, -0.44], [0, 1.78, -0.66], [0, 1.5, -0.75], [0, 1.2, -0.76]];
  const pony = rig.addChain('pony', J.head, ponyPts.slice(0, 4));
  rig.chain({ joints: pony, tip: [0, -0.3, -0.01], stiffness: 5, drag: 0.9, gravity: 9, maxAngle: 75, wind: 1.5, colliders: [{ joint: J.chest, x: 0, y: 0.1, z: -0.02, r: 0.3 }] });
  const scarfPts = [[0.09, 1.4, -0.18], [0.13, 1.36, -0.5], [0.14, 1.29, -0.82], [0.14, 1.24, -1.14]];
  const scarf = rig.addChain('scarf', J.chest, scarfPts.slice(0, 3));
  rig.chain({ joints: scarf, tip: [0, -0.05, -0.32], stiffness: 3.5, drag: 0.92, gravity: 7, maxAngle: 80, wind: 3, colliders: [{ joint: J.chest, x: 0, y: 0, z: 0, r: 0.26 }] });
  const sashPts = [[0.19, 0.96, 0.09], [0.24, 0.74, 0.1], [0.25, 0.52, 0.08], [0.25, 0.34, 0.07]];
  const sash = rig.addChain('sash', J.hips, sashPts.slice(0, 3));
  rig.chain({ joints: sash, tip: [0, -0.18, -0.01], stiffness: 6, drag: 0.88, gravity: 10, maxAngle: 60, wind: 1 });
  const frontPts = [[0, 0.9, 0.15], [0, 0.7, 0.185], [0, 0.5, 0.19], [0, 0.34, 0.19]];
  const front = rig.addChain('tab', J.hips, frontPts.slice(0, 3));
  rig.chain({ joints: front, tip: [0, -0.16, 0], stiffness: 8, drag: 0.86, gravity: 10, maxAngle: 50, wind: 0.8 });
  const backPts = [[0, 0.9, -0.15], [0, 0.68, -0.2], [0, 0.46, -0.21], [0, 0.28, -0.21]];
  const back = rig.addChain('tail', J.hips, backPts.slice(0, 3));
  rig.chain({ joints: back, tip: [0, -0.18, 0], stiffness: 6, drag: 0.88, gravity: 10, maxAngle: 60, wind: 1 });

  // ── 腿 ──
  b.sym((s) => {
    const x = d.hipX;
    b.bone(s > 0 ? J.thighL : J.thighR).paint(C.cloth, { c2: C.clothDark, ao: 0.9 });
    b.limb([x, d.hipY + 0.04, 0], [x, d.kneeY, 0], 0.128, 0.098, { seg: 8, bulge: 0.06 });
    // 护膝
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.steelDark, { c2: C.steel, gloss: 0.8 });
    b.ball(x, d.kneeY + 0.01, 0.05, 0.088, 0.095, 0.07, 1, 50);
    b.paint(C.gold, { gloss: 1 });
    b.ball(x, d.kneeY + 0.015, 0.11, 0.032, 0.036, 0.022, 0);
  });
  for (const s of [1, -1] as const) {
    b.paint(C.leather, { c2: 0x3a2823, ao: 0.95 });
    boot(b, h, s, { top: 0.43, rTop: 0.118, rAnkle: 0.086, len: 0.25 });
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.gold, { gloss: 1 });
    trim(b, s * d.hipX, 0.425, 0, 0.12, 0.12, 0.015, 0.024);
    // 胫甲
    b.paint(C.steelDark, { gloss: 0.8, c2: C.steel });
    b.g(X(s * d.hipX, 0.26, 0.088, -5, 0, 0), () => b.box(0, 0, 0, 0.12, 0.27, 0.04, 0.016));
  }

  // ── 躯干 ──
  b.bind(torsoBind(h)).paint(C.cloth, { c2: C.clothDark });
  b.lathe(
    [
      [0.76, 0.11, 0.1],
      [0.83, 0.2, 0.15],
      [0.9, 0.2, 0.15],
      [0.99, 0.172, 0.13],
      [1.08, 0.195, 0.14],
      [1.2, 0.245, 0.16],
      [1.33, 0.262, 0.162],
      [1.39, 0.17, 0.125],
      [1.43, 0.09, 0.086],
    ],
    { seg: 12 },
  );
  b.bone(J.neck).paint(C.skin, { ao: 0.75 });
  b.lathe([[1.4, 0.08, 0.08], [1.52, 0.078, 0.078]], { seg: 8, cap0: false });
  // 胸甲：深色钢片 + 金色镶边
  b.bone(J.chest).paint(C.steelDark, { c2: C.steel, gloss: 0.8 });
  b.lathe(
    [
      [1.09, 0.2, 0.146],
      [1.18, 0.25, 0.17],
      [1.29, 0.274, 0.176],
      [1.345, 0.25, 0.16],
    ],
    { seg: 12, cap0: false },
  );
  b.paint(C.gold, { gloss: 1 });
  trim(b, 0, 1.095, 0, 0.205, 0.15, 0.014, 0.02, 12);
  // 胸口火纹徽记
  b.g(X(0, 1.22, 0.178, 0, 0, 45), () => b.box(0, 0, 0, 0.09, 0.09, 0.02, 0.014));
  b.paint(C.ember, { glow: 0.6 });
  b.g(X(0, 1.22, 0.187, 0, 0, 45), () => b.box(0, 0, 0, 0.05, 0.05, 0.02, 0.01));
  // 腰带(赤红)与绳结
  b.bone(J.spine).paint(C.redLight, { c2: C.red });
  b.lathe([[0.925, 0.2, 0.15], [0.95, 0.212, 0.162], [1.03, 0.19, 0.146], [1.065, 0.178, 0.134]], { seg: 12 });
  b.bone(J.hips).paint(C.redLight, { c2: C.red });
  b.ball(0.185, 0.975, 0.1, 0.052, 0.046, 0.046, 1);
  // 腰带垂绦
  b.bind(chainBind(sash, sashPts, J.hips)).paint(C.red, { c2: C.redDark });
  strip(b, sashPts, { width: (v) => mix(0.045, 0.07, v), axis: [0, 0, 1], bow: [0.02, 0, 0], nu: 2, nv: 6, tail: 'point', tailLen: 0.1 });
  // 前摆(本色，带金边) / 后摆(队伍色)
  b.bind(chainBind(front, frontPts, J.hips)).paint(C.red, { c2: C.redDark });
  strip(b, frontPts, { width: (v) => mix(0.125, 0.1, v), bow: [0, 0, 0.035], nu: 4, nv: 6, tail: 'swallow', tailLen: 0.1 });
  b.bind(chainBind(back, backPts, J.hips)).paint(0xffffff, { team: 1 });
  strip(b, backPts, { width: (v) => mix(0.16, 0.13, v), bow: [0, 0, -0.04], nu: 4, nv: 6, tail: 'swallow', tailLen: 0.12 });
  // 胯甲(两侧)
  b.sym(() => {
    b.bone(J.hips).paint(C.steelDark, { c2: C.steel, gloss: 0.8 });
    b.g(X(0.215, 0.8, 0, 0, 90, -12), () =>
      b.extrude([[-0.11, 0.13], [0.11, 0.13], [0.12, -0.02], [0, -0.17], [-0.12, -0.02]], 0.035, 0.014));
    b.paint(C.gold, { gloss: 1 });
    b.g(X(0.24, 0.77, 0, 0, 90, -12), () => b.box(0, 0, 0, 0.05, 0.05, 0.02, 0.012));
  });

  // ── 手臂 ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.cloth, { c2: C.clothDark, ao: 0.9 });
    b.ball(x, d.shoulderY, 0, 0.1, 0.1, 0.1, 1);
    b.limb([x, d.shoulderY, 0], [x, d.elbowY, 0], 0.092, 0.076, { seg: 8, bulge: 0.05 });
    // 队伍色臂环
    b.paint(0xffffff, { team: 1 });
    trim(b, x, d.shoulderY - 0.15, 0, 0.088, 0.088, 0.014, 0.036, 8);
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.cloth, { ao: 0.9 });
    b.ball(x, d.elbowY, 0, 0.078, 0.078, 0.078, 1);
    b.limb([x, d.elbowY, 0], [x, d.wristY, 0], 0.074, 0.066, { seg: 8 });
    // 护腕：钢 + 金边，向手腕方向外扩(大手大脚的英雄比例)
    b.paint(C.steelDark, { c2: C.steel, gloss: 0.8 });
    b.lathe([[d.wristY - 0.01, 0.08, 0.08, x, 0], [d.wristY + 0.03, 0.098, 0.098, x, 0], [d.wristY + 0.19, 0.092, 0.092, x, 0], [d.wristY + 0.205, 0.078, 0.078, x, 0]], { seg: 8 });
    b.paint(C.gold, { gloss: 1 });
    trim(b, x, d.wristY + 0.195, 0, 0.094, 0.094, 0.012, 0.016, 8);
    trim(b, x, d.wristY + 0.02, 0, 0.098, 0.098, 0.012, 0.016, 8);
  });
  b.paint(C.clothDark, { c2: C.cloth });
  fist(b, h, 1);
  fist(b, h, -1);

  // ── 披巾：罩住双肩的短斗篷领 + 绕颈一圈 + 身后的长尾 ──
  b.bone(J.chest).paint(C.redDark, { c2: C.red, ao: 0.9 });
  b.lathe(
    [
      [1.295, 0.315, 0.215],
      [1.33, 0.31, 0.215],
      [1.39, 0.24, 0.185],
      [1.445, 0.165, 0.15],
      [1.485, 0.13, 0.125],
    ],
    { seg: 12, cap0: false, cap1: false, shape: (a) => 1 + 0.035 * Math.sin(a * 6) },
  );
  b.paint(C.redLight, { c2: C.red });
  b.g(X(0, 1.465, 0.01, 12, 0, 0, 1, 1, 0.9), () => b.torus(0.135, 0.055, 0.05, 12, 5));
  b.bind(chainBind(scarf, scarfPts, J.chest)).paint(C.red, { c2: C.redDark });
  strip(b, scarfPts, { width: (v) => mix(0.12, 0.17, Math.sin(v * Math.PI * 0.62)), bow: [0, 0.035, 0], wave: 0.25, nu: 4, nv: 10, tail: 'swallow', tailLen: 0.22 });

  // ── 肩甲：左肩三层大甲，右肩一片小甲 ──
  const plate = (bone: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, tilt: number): void => {
    b.bone(bone).paint(C.steelDark, { c2: C.steel, gloss: 0.9 });
    b.g(X(x, y, z, 0, 0, tilt), () => {
      b.lathe([[-ry * 0.3, rx, rz], [0, rx * 0.98, rz * 0.98], [ry * 0.62, rx * 0.68, rz * 0.68], [ry, rx * 0.16, rz * 0.16]], { seg: 10, crease: 60 });
      b.paint(C.gold, { gloss: 1 });
      trim(b, 0, -ry * 0.3, 0, rx, rz, 0.015, 0.02, 10);
    });
  };
  plate(J.clavL, 0.33, 1.46, 0, 0.2, 0.13, 0.18, -16);
  plate(J.armL, 0.385, 1.355, 0, 0.155, 0.09, 0.15, -36);
  plate(J.armL, 0.405, 1.26, 0, 0.125, 0.07, 0.125, -52);
  // 肩甲上的余烬晶刺
  b.bone(J.clavL).paint(C.ember, { glow: 0.3, glow2: 0.6, c2: 0xffc060, line: 1 });
  b.g(X(0.35, 1.565, 0, 0, 0, -16), () => b.crystal(0.04, 0.16, 4, 0.6, 0.2));
  plate(J.clavR, -0.33, 1.45, 0, 0.145, 0.085, 0.135, 20);

  // ── 头 ──
  const hd = head(b, h, C.skin);
  face(b, h, hd, { iris: 0xff9a30, irisGlow: 0.22, brow: C.hair, browTilt: 17, eyeW: 0.052, eyeH: 0.036, slant: 7, lip: 0xa85a4a });
  // 额前火纹
  b.bone(J.head).paint(C.ember, { glow: 0.9 });
  b.g(X(0, hd.cy + 0.105, hd.surf(0, hd.cy + 0.105) + 0.002, -14, 0, 0), () =>
    b.extrude([[0, -0.04], [0.02, 0], [0.009, 0.014], [0.016, 0.045], [0, 0.03], [-0.016, 0.045], [-0.009, 0.014], [-0.02, 0]], 0.012, 0));
  // 头发：后梳的发盖(中间略带美人尖) + 额前分向两侧的两绺 + 鬓角
  hairCap(b, h, hd, {
    c: C.hair,
    c2: C.hairLight,
    line: (phi) => (phi < 0.95 ? 0.165 - 0.035 * Math.cos((phi / 0.95) * Math.PI * 0.5) : phi < 1.5 ? mix(0.165, -0.08, (phi - 0.95) / 0.55) : -0.3),
  });
  b.sym(() => {
    b.paint(C.hair, { c2: C.hairLight, gloss: 0.25 });
    const y = hd.cy;
    b.tube([[0.02, y + 0.235, 0.13, 0.06, 0.03], [0.12, y + 0.2, 0.2, 0.065, 0.03], [0.2, y + 0.1, 0.19, 0.05, 0.026], [0.235, y - 0.02, 0.14, 0.03, 0.02], [0.23, y - 0.12, 0.1, 0.008, 0.008]], { seg: 6, up: [0, 0, 1] });
    b.tube([[0.2, y + 0.06, 0.08, 0.035, 0.04], [0.245, y - 0.06, 0.07, 0.035, 0.04], [0.235, y - 0.22, 0.085, 0.008, 0.01]], { seg: 6 });
  });
  // 发髻与发箍
  b.paint(C.hair, { c2: C.hairLight });
  b.ball(0, 1.94, -0.2, 0.085, 0.08, 0.085, 1);
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 1.945, -0.225, 62, 0, 0), () => b.torus(0.072, 0.018, 0.024, 10, 4, { crease: 30 }));
  // 马尾：根部深色 → 发梢余烬色并微微发光
  b.bind(chainBind(pony, ponyPts, J.head)).paint(C.hair, { c2: 0xc8421e, glow: 0, glow2: 0.3, gloss: 0.25 });
  b.tube(
    [
      [0, 1.945, -0.23, 0.06, 0.06],
      [0, 1.99, -0.42, 0.1, 0.085],
      [0, 1.83, -0.63, 0.115, 0.09],
      [0, 1.58, -0.745, 0.1, 0.075],
      [0, 1.36, -0.77, 0.065, 0.05],
      [0, 1.16, -0.76, 0.012, 0.01],
    ],
    { seg: 8, up: [1, 0, 0], shape: (a) => 1 + 0.12 * Math.cos(a * 4) },
  );

  // ── 双刃 ──
  const blade = (bone: number, x: number): void => {
    b.bone(bone);
    b.g(X(x, d.handY, 0), () => {
      // 握把
      b.paint(C.leather, { c2: C.clothDark });
      b.tube([[0, 0, -0.16, 0.028], [0, 0, 0.12, 0.03]], { seg: 6 });
      b.paint(C.gold, { gloss: 1 });
      b.ball(0, 0, -0.18, 0.04, 0.04, 0.045, 1);
      // 护手：扁八角盘
      b.tube([[0, 0, 0.12, 0.075, 0.105], [0, 0, 0.15, 0.075, 0.105]], { seg: 8, crease: 30 });
      // 刃：菱形截面，沿 +Z 略向上弯。根部暗红 → 刃尖亮橙
      b.paint(0x7a1a12, { c2: 0xff9a30, glow: 0.12, glow2: 0.62, gloss: 1, line: 1 });
      const path: number[][] = [];
      const n = 9;
      const L = 1.3;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const wid = i === 0 ? 0.04 : mix(0.085, 0.07, t) * (t > 0.8 ? 1 - Math.pow((t - 0.8) / 0.2, 1.5) : 1);
        path.push([0, 0.2 * t * t, 0.15 + t * L, 0.02 * (1 - t * 0.5), Math.max(0.005, wid)]);
      }
      b.tube(path, { seg: 4, up: [1, 0, 0], crease: 0 });
      // 刃脊上的炽纹(发光细条)
      b.paint(0xff8a30, { glow: 0.75 });
      const ridge: number[][] = [];
      for (let i = 1; i <= 7; i++) {
        const t = i / n;
        ridge.push([0, 0.2 * t * t + 0.016, 0.15 + t * L, 0.024, 0.016]);
      }
      b.tube(ridge, { seg: 4, up: [1, 0, 0], crease: 0 });
    });
  };
  blade(J.propR, -d.shoulderX);
  blade(J.propL, d.shoulderX);

  b.bakeGrounding(2.05);
  return { h, b, extra: { pony, scarf } };
}

interface Extra {
  pony: number[];
  scarf: number[];
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 2.8, stance: 0.34, lift: 0.3, bob: 0.05, drop: 0.09, lean: 20, twist: 10, arm: 0, width: 0.13 };

interface Anims {
  stance: CKP;
  tmp: CKP;
  atkA: ReturnType<typeof track>;
  atkB: ReturnType<typeof track>;
  s1: ReturnType<typeof track>;
  runArms: CKP;
  dash: CKP;
  spin: CKP;
  channel: CKP;
  ult: ReturnType<typeof track>;
  common: CommonAnims;
}

function makeAnims(h: Human): Anims {
  // 站姿：左脚在前的低架，双刃斜垂身侧
  const stance = kp(h, null, {
    hipsPos: [0, -0.07, 0],
    hips: [4, -14, 0],
    spine: [3, 6, 0],
    chest: [2, 8, 0],
    neck: [0, 4, 0],
    head: [-4, 6, 0],
    footL: [0.17, 0.1, 0.16, 0, 14],
    footR: [-0.19, 0.1, -0.16, 0, -30],
    armL: [-14, 0, 22],
    foreL: [-32, 0, 0],
    propL: [62, 22, 0],
    armR: [18, 0, -24],
    foreR: [-30, 0, 0],
    propR: [78, -30, 0],
  });
  // 普攻 A：右刃自右上向左下斜斩
  const aWind = kp(h, stance, {
    hipsPos: [0.02, -0.1, -0.05],
    hips: [2, -30, 0],
    spine: [0, -14, 0],
    chest: [-4, -22, 0],
    head: [0, 34, 0],
    armR: [40, 0, -95],
    foreR: [-95, 0, 0],
    propR: [20, -10, 0],
    armL: [-30, 0, 30],
    foreL: [-50, 0, 0],
    propL: [50, 30, 0],
  });
  const aHit = kp(h, stance, {
    hipsPos: [-0.02, -0.14, 0.12],
    hips: [10, 20, 0],
    spine: [8, 16, 0],
    chest: [8, 24, 0],
    head: [-8, -30, 0],
    footL: [0.17, 0.1, 0.34, 0, 14],
    armR: [-70, 55, -30],
    foreR: [-20, 0, 0],
    propR: [70, 20, 0],
    armL: [30, 0, 40],
    foreL: [-40, 0, 0],
    propL: [80, 30, 0],
  });
  const aFollow = kp(h, aHit, {
    hips: [12, 28, 0],
    chest: [10, 32, 0],
    armR: [-30, 80, -10],
    foreR: [-30, 0, 0],
    propR: [95, 30, 0],
  });
  const atkA = track([
    [0, stance],
    [0.2, aWind, E.out],
    [0.35, aHit, E.in3],
    [0.5, aFollow, E.out],
    [1, stance, E.io],
  ]);
  // 普攻 B：左刃自左向右横斩
  const bWind = kp(h, stance, {
    hipsPos: [-0.02, -0.1, -0.03],
    hips: [2, 10, 0],
    spine: [0, 14, 0],
    chest: [-2, 26, 0],
    head: [0, -28, 0],
    armL: [10, 0, 80],
    foreL: [-100, 0, 0],
    propL: [10, 60, 0],
    armR: [26, 0, -30],
  });
  const bHit = kp(h, stance, {
    hipsPos: [0.02, -0.13, 0.12],
    hips: [8, -34, 0],
    spine: [6, -16, 0],
    chest: [6, -26, 0],
    head: [-6, 44, 0],
    footL: [0.17, 0.1, 0.3, 0, 14],
    armL: [-75, -50, 30],
    foreL: [-15, 0, 0],
    propL: [60, -30, 0],
    armR: [35, 0, -45],
    propR: [90, -30, 0],
  });
  const bFollow = kp(h, bHit, {
    hips: [10, -42, 0],
    chest: [8, -34, 0],
    armL: [-35, -85, 10],
    propL: [90, -40, 0],
  });
  const atkB = track([
    [0, stance],
    [0.2, bWind, E.out],
    [0.35, bHit, E.in3],
    [0.5, bFollow, E.out],
    [1, stance, E.io],
  ]);
  // 一技能·烈焰斩：双刃交叉收于左侧 → 向前扇形横扫
  const s1Wind = kp(h, stance, {
    hipsPos: [0, -0.16, -0.06],
    hips: [0, 30, 0],
    spine: [-4, 16, 0],
    chest: [-6, 24, 0],
    head: [0, -50, 0],
    armR: [-60, 70, -10],
    foreR: [-70, 0, 0],
    propR: [30, 40, 0],
    armL: [20, 0, 70],
    foreL: [-110, 0, 0],
    propL: [20, 70, 0],
  });
  const s1Hit = kp(h, stance, {
    hipsPos: [0, -0.18, 0.2],
    hips: [12, -30, 0],
    spine: [8, -18, 0],
    chest: [8, -24, 0],
    head: [-8, 50, 0],
    footL: [0.2, 0.1, 0.42, 0, 10],
    footR: [-0.2, 0.12, -0.3, 30, -30],
    armR: [-60, -70, -70],
    foreR: [-10, 0, 0],
    propR: [40, -30, 0],
    armL: [-70, -40, 60],
    foreL: [-10, 0, 0],
    propL: [50, -50, 0],
  });
  const s1 = track([
    [0, stance],
    [0.3, s1Wind, E.out],
    [0.48, s1Hit, E.in3],
    [0.7, s1Hit, E.lin],
    [1, stance, E.io],
  ]);
  // 跑动时的上半身：身体压低，双刃拖在身后两侧
  const runArms = kp(h, null, {
    armL: [48, 0, 30],
    foreL: [-28, 0, 0],
    propL: [118, 26, 0],
    armR: [48, 0, -30],
    foreR: [-28, 0, 0],
    propR: [118, -26, 0],
  });
  // 冲刺(炎步)：大幅前倾，右刃前指，左刃后拖
  const dash = kp(h, null, {
    hipsPos: [0, -0.2, 0.1],
    hips: [38, -20, 0],
    spine: [12, 8, 0],
    chest: [8, 10, 0],
    neck: [-20, 0, 0],
    head: [-28, 6, 0],
    footL: [0.12, 0.14, 0.5, -20, 0],
    footR: [-0.12, 0.3, -0.62, 60, 0],
    armR: [-95, 20, -20],
    foreR: [-12, 0, 0],
    propR: [70, 0, 0],
    armL: [62, 0, 34],
    foreL: [-10, 0, 0],
    propL: [112, 20, 0],
  });
  // 旋舞：双臂平展，双刃向外
  const spin = kp(h, null, {
    hipsPos: [0, -0.12, 0],
    hips: [4, 0, 0],
    spine: [2, 0, 0],
    chest: [-6, 0, 0],
    head: [8, 0, 0],
    footL: [0.2, 0.1, 0.05, 0, 20],
    footR: [-0.2, 0.1, -0.05, 0, -20],
    armL: [0, 0, 86],
    foreL: [-8, 0, 0],
    propL: [0, 92, 0],
    armR: [0, 0, -86],
    foreR: [-8, 0, 0],
    propR: [0, -92, 0],
  });
  // 回城引导：单膝微蹲，双刃交叉于身前插地
  const channel = kp(h, stance, {
    hipsPos: [0, -0.2, 0],
    hips: [8, 0, 0],
    spine: [6, 0, 0],
    chest: [4, 0, 0],
    head: [14, 0, 0],
    footL: [0.18, 0.1, 0.1, 0, 10],
    footR: [-0.18, 0.1, -0.1, 0, -14],
    armL: [-50, 0, 6],
    foreL: [-40, 0, 0],
    propL: [150, -34, 0],
    armR: [-50, 0, -6],
    foreR: [-40, 0, 0],
    propR: [150, 34, 0],
  });
  // 大招起手(很短)：双刃上举交叉
  const ultUp = kp(h, stance, {
    hipsPos: [0, -0.2, 0],
    chest: [-10, 0, 0],
    armL: [-150, 0, 30],
    foreL: [-30, 0, 0],
    propL: [0, -30, 0],
    armR: [-150, 0, -30],
    foreR: [-30, 0, 0],
    propR: [0, 30, 0],
  });
  const ult = track([
    [0, stance],
    [0.6, ultUp, E.out],
    [1, spin, E.in],
  ]);
  const common = makeCommon(h, stance, {
    limp: { propL: [100, 10, 0], propR: [100, -10, 0] },
    lying: { armL: [-6, 0, 66], foreL: [-20, 0, 0], propL: [60, 30, 0], armR: [-4, 0, -72], foreR: [-10, 0, 0], propR: [70, -20, 0] },
  });
  return { stance, tmp: emptyCKP(h), atkA, atkB, s1, runArms, dash, spin, channel, ult, common };
}

export function createChijin(): ModelDef {
  const { h, b, extra } = build();
  void extra;
  const A = makeAnims(h);
  const J = h.J;
  const k = A.tmp;
  const geometry = b.build();

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    if (animateCommon(h, pose, a.anim === 'leap' ? 'airborne' : a.anim, a.t, a.p, a.time, A.common)) {
      if (a.anim === 'dead') out.glow = Math.max(0.15, 1 - a.t * 1.2);
      return;
    }
    switch (a.anim) {
      case 'move': {
        runCycle(h, pose, a.stride, RUN, () => {
          const e = A.runArms.e;
          const sw = Math.cos(a.stride * Math.PI * 2);
          pose.rot(J.armL, e[J.armL * 3] + sw * 10, 0, e[J.armL * 3 + 2]);
          pose.rot(J.foreL, e[J.foreL * 3], 0, 0);
          pose.rot(J.propL, e[J.propL * 3] + sw * 6, e[J.propL * 3 + 1], 0);
          pose.rot(J.armR, e[J.armR * 3] - sw * 10, 0, e[J.armR * 3 + 2]);
          pose.rot(J.foreR, e[J.foreR * 3], 0, 0);
          pose.rot(J.propR, e[J.propR * 3] - sw * 6, e[J.propR * 3 + 1], 0);
        });
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        sampleTrack(a.variant % 2 === 0 ? A.atkA : A.atkB, p, k);
        applyCKP(h, pose, k);
        out.glow = 1 + 1.2 * bump(p, 0.36, 0.2);
        break;
      }
      case 'cast_s1': {
        sampleTrack(A.s1, a.p, k);
        applyCKP(h, pose, k);
        out.glow = 1 + 2 * bump(a.p, 0.45, 0.3);
        break;
      }
      case 'cast_s2':
      case 'dash': {
        applyCKP(h, pose, A.dash);
        out.glow = 2.2;
        break;
      }
      case 'cast_ult': {
        sampleTrack(A.ult, a.p, k);
        applyCKP(h, pose, k);
        out.glow = 1 + 1.5 * a.p;
        break;
      }
      case 'spin': {
        copyCKP(k, A.spin);
        applyCKP(h, pose, k, () => {
          // 整个人绕竖轴高速旋转：每秒约 2.4 圈；起手 0.15 秒内加速
          const t = a.t;
          const turns = t < 0.15 ? (t * t) / 0.3 * 2.4 : (t - 0.075) * 2.4;
          pose.rot(J.root, 0, -turns * 360, 0);
          pose.add(J.spine, 0, 0, 4 * Math.sin(t * 9));
        });
        out.glow = 2.4;
        break;
      }
      case 'channel': {
        applyCKP(h, pose, A.channel, () => {
          breathe(h, pose, a.time, a.seed, 0.8);
        });
        out.glow = 1 + 0.5 * (0.5 + 0.5 * Math.sin(a.time * 5));
        break;
      }
      default: {
        applyCKP(h, pose, A.stance, () => {
          breathe(h, pose, a.time, a.seed);
          pose.add(J.propL, Math.sin(a.time * 1.3) * 2.5, 0, 0);
          pose.add(J.propR, Math.sin(a.time * 1.3 + 1) * 2.5, 0, 0);
        });
        out.glow = 1 + 0.12 * Math.sin(a.time * 3);
      }
    }
  };

  return {
    key: 'hero:chijin',
    geometry,
    rig: h.rig,
    height: 2.06,
    radius: 0.62,
    scale: SCALE,
    stride: RUN.stride * SCALE,
    triangles: b.triangleCount,
    attach: {
      head: { joint: J.head, x: 0, y: 0.25, z: 0 },
      chest: { joint: J.chest, x: 0, y: 0.08, z: 0 },
      handR: { joint: J.handR, x: 0, y: -0.07, z: 0 },
      handL: { joint: J.handL, x: 0, y: -0.07, z: 0 },
      weapon: { joint: J.propR, x: 0, y: 0.1, z: 1.2 },
      muzzle: { joint: J.propL, x: 0, y: 0.1, z: 1.2 },
    },
    blend: (from, to) => (to === 'attack' || to === 'dash' || to === 'cast_s2' ? 0.07 : to === 'dead' ? 0.05 : from === 'dash' ? 0.16 : 0.13),
    animate,
  };
}
