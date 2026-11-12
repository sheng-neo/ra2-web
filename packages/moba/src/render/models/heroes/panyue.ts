/**
 * 磐岳 · 岩铠守卫：魁梧的岩石巨灵。灰蓝岩体 + 星铁板甲，巨大的嵌晶肩甲，胸口金色星核，右手嵌晶巨锤，左臂塔盾。
 * 剪影要点：比别人大一圈的倒三角身板、两座带琥珀晶簇的肩甲、巨锤与塔盾。动作沉重。
 */
import { type CKP, type CommonAnims, E, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, type TrackKey, animateCommon, applyCKP, breathe, bump, emptyCKP, humanRig, kp, makeCommon, mix, runCycle, sampleTrack, strikeWarp, track } from '../humanoid';
import { ModelBuilder, X } from '../kit';
import { chainBind, strip, torsoBind, trim } from '../parts';
import type { Pose } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  rock: 0x7b8c9d,
  rockLight: 0xa3b3c2,
  rockDark: 0x505f6e,
  iron: 0x47525f,
  ironLight: 0x74808e,
  gold: 0xf2b75a,
  amber: 0xffc35a,
  amberHot: 0xffe6a0,
};

const DIMS: HumanDims = {
  ankleY: 0.11, kneeY: 0.42, hipY: 0.76, hipX: 0.19, pelvisY: 0.8, spineY: 0.98, chestY: 1.2, neckY: 1.5, headY: 1.5,
  clavX: 0.16, shoulderX: 0.47, shoulderY: 1.43, elbowY: 1.06, wristY: 0.73, handY: 0.61,
};

const SCALE = 1.42;

interface Extra {
  shield: number;
}

function build(): { h: Human; b: ModelBuilder; extra: Extra } {
  const h = humanRig(DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();
  b.crease = 32;

  const shield = rig.add('shield', J.foreL, d.shoulderX + 0.2, 0.92, 0.04);
  const frontPts = [[0, 0.82, 0.27], [0, 0.6, 0.3], [0, 0.4, 0.3], [0, 0.24, 0.3]];
  const front = rig.addChain('tab', J.hips, frontPts.slice(0, 3));
  rig.chain({ joints: front, tip: [0, -0.16, 0], stiffness: 9, drag: 0.85, gravity: 10, maxAngle: 45 });
  const backPts = [[0, 0.82, -0.25], [0, 0.6, -0.3], [0, 0.38, -0.31], [0, 0.2, -0.31]];
  const back = rig.addChain('tail', J.hips, backPts.slice(0, 3));
  rig.chain({ joints: back, tip: [0, -0.18, 0], stiffness: 8, drag: 0.86, gravity: 10, maxAngle: 50 });

  // ── 腿：岩石大腿 + 星铁胫甲与方头战靴 ──
  b.sym((s) => {
    const x = d.hipX;
    b.rough = 0.012;
    b.bone(s > 0 ? J.thighL : J.thighR).paint(C.rock, { c2: C.rockDark, ao: 0.9 });
    b.limb([x, d.hipY + 0.06, 0], [x, d.kneeY - 0.02, 0], 0.2, 0.165, { seg: 7, bulge: 0.08, crease: 28 });
    b.rough = 0;
    const shin = s > 0 ? J.shinL : J.shinR;
    b.bone(shin).paint(C.iron, { c2: C.ironLight, gloss: 0.8 });
    b.lathe([[d.ankleY - 0.02, 0.175, 0.185, x, 0.01], [0.2, 0.19, 0.2, x, 0.01], [0.4, 0.21, 0.21, x, 0.01], [0.46, 0.18, 0.18, x, 0]], { seg: 8, crease: 30 });
    // 护膝：一块凸起的岩晶
    b.paint(C.gold, { gloss: 1 });
    trim(b, x, 0.445, 0.005, 0.2, 0.2, 0.018, 0.026, 8);
    b.paint(C.amber, { glow: 0.35, c2: C.amberHot });
    b.g(X(x, 0.4, 0.2, 60, 0, 0), () => b.crystal(0.05, 0.14, 4, 0.5, 0.3));
    b.bone(s > 0 ? J.footL : J.footR).paint(C.iron, { c2: C.ironLight, gloss: 0.8 });
    b.box(x, 0.075, 0.09, 0.31, 0.15, 0.5, 0.045);
    b.paint(C.gold, { gloss: 1 });
    b.box(x, 0.08, 0.33, 0.25, 0.09, 0.06, 0.02);
  });

  // ── 躯干：岩石身板(倒三角) ──
  b.rough = 0.014;
  b.bind(torsoBind(h)).paint(C.rockDark, { c2: C.rockLight, ao: 0.9 });
  b.lathe(
    [
      [0.64, 0.2, 0.17],
      [0.74, 0.34, 0.27],
      [0.9, 0.34, 0.27],
      [1.0, 0.31, 0.25],
      [1.12, 0.44, 0.33],
      [1.3, 0.54, 0.37],
      [1.45, 0.52, 0.35],
      [1.54, 0.34, 0.27],
      [1.58, 0.14, 0.14],
    ],
    { seg: 8, power: 2.5, crease: 30, phase: 22.5 },
  );
  b.rough = 0;
  // 腰带：星铁 + 金扣
  b.bone(J.spine).paint(C.iron, { c2: C.ironLight, gloss: 0.8 });
  b.lathe([[0.86, 0.355, 0.285], [0.9, 0.365, 0.292], [0.99, 0.335, 0.27], [1.02, 0.31, 0.25]], { seg: 8, power: 2.5, phase: 22.5, crease: 30 });
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 0.94, 0.29), () => b.box(0, 0, 0, 0.17, 0.13, 0.05, 0.02));
  b.paint(C.amber, { glow: 0.45 });
  b.g(X(0, 0.94, 0.315, 0, 0, 45), () => b.box(0, 0, 0, 0.06, 0.06, 0.03, 0.012));
  // 前后战袍下摆(队伍色，带金边条)
  b.bind(chainBind(front, frontPts, J.hips)).paint(0xffffff, { team: 1 });
  strip(b, frontPts, { width: (v) => mix(0.16, 0.13, v), bow: [0, 0, 0.03], nu: 4, nv: 6, tail: 'swallow', tailLen: 0.12 });
  b.bind(chainBind(back, backPts, J.hips)).paint(0xffffff, { team: 1 });
  strip(b, backPts, { width: (v) => mix(0.2, 0.16, v), bow: [0, 0, -0.03], nu: 4, nv: 6, tail: 'swallow', tailLen: 0.14 });
  // 胯侧甲片
  b.sym(() => {
    b.bone(J.hips).paint(C.iron, { c2: C.ironLight, gloss: 0.8 });
    b.g(X(0.36, 0.72, 0, 0, 90, -10), () => b.extrude([[-0.17, 0.15], [0.17, 0.15], [0.18, -0.04], [0, -0.2], [-0.18, -0.04]], 0.05, 0.02));
    b.paint(C.gold, { gloss: 1 });
    b.g(X(0.392, 0.7, 0, 0, 90, -10), () => b.extrude([[-0.07, 0.07], [0.07, 0.07], [0, -0.09]], 0.03, 0.01));
  });

  // ── 胸甲：星铁护胸 + 金色星核 ──
  b.bone(J.chest).paint(C.iron, { c2: C.ironLight, gloss: 0.85 });
  b.g(X(0, 1.3, 0.335, -6, 0, 0), () =>
    b.extrude([[-0.36, 0.2], [-0.12, 0.26], [0.12, 0.26], [0.36, 0.2], [0.4, -0.02], [0.2, -0.24], [0, -0.3], [-0.2, -0.24], [-0.4, -0.02]], 0.1, 0.04));
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 1.29, 0.395, -6, 0, 0), () => b.torus(0.13, 0.022, 0.025, 8, 4, { crease: 30 }));
  b.g(X(0, 1.29, 0.39, 84, 0, 0), () => b.torus(0.13, 0.024, 0.02, 8, 4, { crease: 30 }));
  // 星核：发光的八面晶体
  b.paint(C.amber, { glow: 0.65, c2: C.amberHot });
  b.g(X(0, 1.19, 0.4, 0, 0, 0, 1, 1, 0.7), () => b.crystal(0.085, 0.2, 4, 0.5, 0.5, 1));
  // 背甲与背上的晶簇(从上往下看最显眼)
  b.paint(C.iron, { c2: C.ironLight, gloss: 0.8 });
  b.g(X(0, 1.32, -0.33, 8, 180, 0), () => b.extrude([[-0.34, 0.2], [0.34, 0.2], [0.3, -0.16], [0, -0.26], [-0.3, -0.16]], 0.08, 0.035));
  const shard = (bone: number, x: number, y: number, z: number, rx: number, rz: number, r: number, hgt: number): void => {
    b.bone(bone).paint(0xf09a2a, { glow: 0.22, glow2: 0.5, c2: C.amber, gloss: 1, line: 1 });
    b.g(X(x, y, z, rx, 0, rz), () => b.crystal(r, hgt, 5, 0.45, 0.12));
  };
  shard(J.chest, 0, 1.5, -0.3, -28, 0, 0.075, 0.36);
  shard(J.chest, 0.14, 1.46, -0.31, -34, -18, 0.055, 0.26);
  shard(J.chest, -0.14, 1.46, -0.31, -34, 18, 0.055, 0.26);

  // ── 头：嵌在双肩之间的岩石头颅 + 星铁面甲，眼缝发光 ──
  b.rough = 0.008;
  b.bone(J.head).paint(C.rock, { c2: C.rockLight });
  b.lathe([[1.5, 0.15, 0.15, 0, 0.03], [1.58, 0.19, 0.2, 0, 0.04], [1.7, 0.2, 0.21, 0, 0.03], [1.8, 0.16, 0.17, 0, 0.01], [1.84, 0.06, 0.07, 0, 0]], { seg: 7, crease: 28, phase: 90 });
  b.rough = 0;
  // 眉脊与面甲
  b.paint(C.iron, { c2: C.ironLight, gloss: 0.85 });
  b.g(X(0, 1.71, 0.2, 12, 0, 0), () => b.box(0, 0, 0, 0.36, 0.07, 0.12, 0.025));
  b.g(X(0, 1.58, 0.2, -8, 0, 0), () => b.extrude([[-0.15, 0.06], [0.15, 0.06], [0.11, -0.08], [0, -0.13], [-0.11, -0.08]], 0.08, 0.025));
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 1.76, 0.2, 12, 0, 0), () => b.extrude([[-0.05, -0.02], [0.05, -0.02], [0, 0.14]], 0.05, 0.015));
  // 眼
  b.paint(C.amberHot, { glow: 0.8 });
  b.sym(() => b.g(X(0.085, 1.652, 0.238, 0, 12, 10), () => b.box(0, 0, 0, 0.09, 0.028, 0.03, 0.008)));

  // ── 手臂：岩石上臂 + 越往下越粗的前臂与巨拳 ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.rough = 0.012;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.rock, { c2: C.rockDark, ao: 0.9 });
    b.ball(x, d.shoulderY, 0, 0.19, 0.18, 0.19, 1, 28);
    b.limb([x, d.shoulderY, 0], [x, d.elbowY, 0], 0.175, 0.15, { seg: 7, bulge: 0.08, crease: 28 });
    const fore = s > 0 ? J.foreL : J.foreR;
    b.bone(fore).paint(C.rockDark, { c2: C.rock });
    b.ball(x, d.elbowY, 0, 0.155, 0.15, 0.155, 1, 28);
    b.limb([x, d.elbowY, 0], [x, d.wristY + 0.02, 0], 0.15, 0.185, { seg: 7, crease: 28 });
    b.rough = 0;
    // 臂箍
    b.paint(C.iron, { c2: C.ironLight, gloss: 0.85 });
    b.lathe([[d.wristY + 0.01, 0.2, 0.2, x, 0], [d.wristY + 0.06, 0.215, 0.215, x, 0], [d.wristY + 0.18, 0.205, 0.205, x, 0], [d.wristY + 0.2, 0.18, 0.18, x, 0]], { seg: 8, crease: 30 });
    b.paint(C.gold, { gloss: 1 });
    trim(b, x, d.wristY + 0.19, 0, 0.205, 0.205, 0.016, 0.022, 8);
    trim(b, x, d.wristY + 0.03, 0, 0.212, 0.212, 0.016, 0.022, 8);
    // 巨拳
    b.rough = 0.01;
    b.bone(s > 0 ? J.handL : J.handR).paint(C.rock, { c2: C.rockLight });
    b.box(x, d.handY + 0.01, 0.01, 0.27, 0.27, 0.3, 0.07);
    b.rough = 0;
  });

  // ── 肩甲：两座星铁穹甲，各嵌三枚琥珀晶，甲缘一圈队伍色 ──
  b.sym((s) => {
    const clav = s > 0 ? J.clavL : J.clavR;
    b.bone(clav);
    b.g(X(0.56, 1.5, 0, 0, 0, -14), () => {
      b.paint(C.iron, { c2: C.ironLight, gloss: 0.9 });
      b.lathe([[-0.1, 0.33, 0.31], [-0.02, 0.335, 0.315], [0.1, 0.27, 0.255], [0.18, 0.15, 0.14], [0.21, 0.03, 0.03]], { seg: 8, crease: 34 });
      b.paint(0xffffff, { team: 1 });
      b.lathe([[-0.17, 0.33, 0.31], [-0.165, 0.345, 0.325], [-0.1, 0.345, 0.325], [-0.095, 0.33, 0.31]], { seg: 8, crease: 34, cap1: false });
      b.paint(C.gold, { gloss: 1 });
      trim(b, 0, -0.09, 0, 0.345, 0.325, 0.02, 0.026, 8);
      b.paint(0xf09a2a, { glow: 0.22, glow2: 0.5, c2: C.amber, gloss: 1, line: 1 });
      b.g(X(0.02, 0.12, 0, 0, 0, -8), () => b.crystal(0.085, 0.4, 5, 0.5, 0.1));
      b.g(X(0.15, 0.08, 0.12, 22, 0, -34), () => b.crystal(0.06, 0.27, 5, 0.5, 0.1));
      b.g(X(0.13, 0.08, -0.13, -26, 0, -30), () => b.crystal(0.06, 0.29, 5, 0.5, 0.1));
    });
  });

  // ── 巨锤(右手)：长柄 + 嵌晶岩块锤头 ──
  b.bone(J.propR);
  b.g(X(-d.shoulderX, d.handY, 0), () => {
    b.paint(C.iron, { c2: C.ironLight, gloss: 0.8 });
    b.tube([[0, 0, -0.5, 0.045], [0, 0, 1.05, 0.05]], { seg: 6 });
    b.paint(C.gold, { gloss: 1 });
    b.ball(0, 0, -0.53, 0.07, 0.07, 0.08, 1, 40);
    for (const z of [-0.2, 0.25, 0.78]) b.g(X(0, 0, z, 90, 0, 0), () => b.torus(0.055, 0.014, 0.03, 6, 4, { crease: 30 }));
    // 锤头：沿握持时的上下方向伸出的岩块，两端包星铁
    b.g(X(0, 0, 1.06), () => {
      b.rough = 0.014;
      b.paint(C.rockDark, { c2: C.rockLight });
      b.box(0, 0, 0, 0.42, 0.64, 0.44, 0.08, 30);
      b.rough = 0;
      b.paint(C.iron, { c2: C.ironLight, gloss: 0.9 });
      b.box(0, 0.33, 0, 0.47, 0.12, 0.49, 0.04);
      b.box(0, -0.33, 0, 0.47, 0.12, 0.49, 0.04);
      b.paint(C.gold, { gloss: 1 });
      b.box(0, 0.255, 0, 0.48, 0.035, 0.5, 0.012);
      b.box(0, -0.255, 0, 0.48, 0.035, 0.5, 0.012);
      // 嵌在锤头四面的发光晶体
      b.paint(C.amber, { glow: 0.45, c2: C.amberHot });
      for (const [rx, ry] of [[0, 90], [0, -90], [0, 0], [0, 180]]) b.g(X(0, 0, 0, rx, ry, 0), () => b.g(X(0, 0, 0.2, 90, 0, 0), () => b.crystal(0.085, 0.13, 4, 0.7, 0.05)));
      b.g(X(0, 0.39, 0), () => b.crystal(0.06, 0.16, 4, 0.7, 0.1));
    });
  });

  // ── 塔盾(左前臂外侧) ──
  b.bone(shield);
  b.g(X(d.shoulderX + 0.2, 0.92, 0.04, 0, 90, 90), () => {
    const outline = [[-0.4, 0.62], [-0.2, 0.7], [0.2, 0.7], [0.4, 0.62], [0.43, -0.2], [0.3, -0.52], [0, -0.74], [-0.3, -0.52], [-0.43, -0.2]];
    // 金边夹在正反两片星铁盾板之间
    b.paint(C.gold, { gloss: 1 });
    b.extrude(outline, 0.05, 0.018);
    b.paint(C.iron, { c2: C.ironLight, gloss: 0.85 });
    b.g(X(0, 0, 0.035, 0, 0, 0, 0.88, 0.9, 1), () => b.extrude(outline, 0.06, 0.03));
    b.paint(C.rockDark, { c2: C.iron });
    b.g(X(0, 0, -0.03, 0, 0, 0, 0.88, 0.9, 1), () => b.extrude(outline, 0.04, 0.02));
    // 盾面：队伍色竖带 + 中央星晶
    b.paint(0xffffff, { team: 1 });
    b.g(X(0, -0.02, 0.07), () => b.extrude([[-0.1, 0.58], [0.1, 0.58], [0.1, -0.46], [0, -0.6], [-0.1, -0.46]], 0.03, 0.01));
    b.paint(C.gold, { gloss: 1 });
    b.g(X(0, 0.08, 0.09), () => b.torus(0.15, 0.03, 0.03, 8, 4, { crease: 30 }));
    b.g(X(0, 0.08, 0.085, 90, 0, 0), () => b.torus(0.15, 0.03, 0.026, 8, 4, { crease: 30 }));
    b.paint(C.amber, { glow: 0.5, c2: C.amberHot });
    b.g(X(0, 0.08, 0.06, 90, 0, 0), () => b.crystal(0.1, 0.16, 6, 0.6, 0.1));
  });

  b.bakeGrounding(2.0);
  return { h, b, extra: { shield } };
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 2.9, stance: 0.44, lift: 0.22, bob: 0.07, drop: 0.08, lean: 10, sway: 0.06, twist: 7, width: 0.22, arm: 0 };

const CHARGE_RUN: RunStyle = { ...RUN, lean: 34, drop: 0.16, bob: 0.03, stance: 0.36, lift: 0.26 };

interface Anims {
  stance: CKP;
  guard: CKP;
  tmp: CKP;
  atkA: TrackKey[];
  atkB: TrackKey[];
  slam: TrackKey[];
  s2: TrackKey[];
  leap: TrackKey[];
  runArms: CKP;
  charge: CKP;
  channel: CKP;
  common: CommonAnims;
}

function makeAnims(h: Human): Anims {
  // 站姿：两脚开立，塔盾护在身前左侧，巨锤斜垂右侧
  const stance = kp(h, null, {
    hipsPos: [0, -0.06, 0],
    hips: [3, 16, 0],
    spine: [3, -6, 0],
    chest: [2, -8, 0],
    head: [0, -4, 0],
    footL: [0.27, 0.11, 0.14, 0, 16],
    footR: [-0.29, 0.11, -0.12, 0, -24],
    armL: [-30, 0, 14],
    foreL: [-78, -66, 0],
    armR: [-14, 0, -16],
    foreR: [-104, 0, 0],
    propR: [6, -8, 0],
  });
  // 举盾姿态(不动壁垒期间)
  const guard = kp(h, stance, {
    hipsPos: [0, -0.12, 0.02],
    hips: [6, 20, 0],
    chest: [6, -10, 0],
    armL: [-56, 0, 8],
    foreL: [-84, -78, 0],
  });
  // 普攻 A：巨锤自右后向左前横扫
  const aWind = kp(h, stance, {
    hipsPos: [0.03, -0.1, -0.06],
    hips: [0, -24, 0],
    spine: [0, -16, 0],
    chest: [-4, -22, 0],
    head: [0, 40, 0],
    armR: [30, 0, -70],
    foreR: [-50, 0, 0],
    propR: [50, -50, 0],
    armL: [-20, 0, 26],
  });
  const aHit = kp(h, stance, {
    hipsPos: [-0.03, -0.14, 0.14],
    hips: [8, 34, 0],
    spine: [6, 14, 0],
    chest: [8, 22, 0],
    head: [-6, -44, 0],
    footL: [0.27, 0.11, 0.3, 0, 16],
    armR: [-66, 50, -24],
    foreR: [-14, 0, 0],
    propR: [74, 30, 0],
    armL: [10, 0, 34],
    foreL: [-60, -40, 0],
  });
  const aFollow = kp(h, aHit, { hips: [10, 42, 0], chest: [10, 28, 0], armR: [-40, 84, -10], propR: [92, 40, 0] });
  const atkA = track([
    [0, stance],
    [0.22, aWind, E.out],
    [0.35, aHit, E.in3],
    [0.52, aFollow, E.out],
    [1, stance, E.io],
  ]);
  // 普攻 B：盾击后接反手锤
  const bWind = kp(h, stance, {
    hipsPos: [0, -0.1, -0.04],
    hips: [0, 30, 0],
    chest: [-2, 10, 0],
    armL: [10, 0, 30],
    foreL: [-90, -30, 0],
    armR: [-60, 60, -20],
    foreR: [-40, 0, 0],
    propR: [70, 50, 0],
  });
  const bHit = kp(h, stance, {
    hipsPos: [0.03, -0.14, 0.14],
    hips: [8, -30, 0],
    spine: [6, -14, 0],
    chest: [6, -24, 0],
    head: [-6, 46, 0],
    footR: [-0.29, 0.11, 0.1, 0, -10],
    armR: [-50, -50, -80],
    foreR: [-10, 0, 0],
    propR: [60, -30, 0],
    armL: [-40, 0, 40],
    foreL: [-70, -80, 0],
  });
  const atkB = track([
    [0, stance],
    [0.22, bWind, E.out],
    [0.35, bHit, E.in3],
    [0.55, bHit, E.out],
    [1, stance, E.io],
  ]);
  // 第三击(磐石之躯)：过顶抡锤砸地
  const sUp = kp(h, stance, {
    hipsPos: [0, -0.04, -0.08],
    hips: [-10, 0, 0],
    spine: [-10, 0, 0],
    chest: [-14, 0, 0],
    head: [8, 0, 0],
    armR: [-165, 0, -24],
    foreR: [-50, 0, 0],
    propR: [105, 0, 0],
    armL: [-40, 0, 40],
    foreL: [-60, -40, 0],
  });
  const sHit = kp(h, stance, {
    hipsPos: [0, -0.24, 0.16],
    hips: [26, 0, 0],
    spine: [14, 0, 0],
    chest: [14, 0, 0],
    head: [-26, 0, 0],
    footL: [0.3, 0.11, 0.32, 0, 12],
    footR: [-0.3, 0.11, -0.16, 10, -20],
    armR: [-48, 0, -10],
    foreR: [-8, 0, 0],
    propR: [95, 10, 0],
    armL: [20, 0, 40],
    foreL: [-50, -40, 0],
  });
  const slam = track([
    [0, stance],
    [0.24, sUp, E.out],
    [0.35, sHit, E.in3],
    [0.62, sHit, E.lin],
    [1, stance, E.io],
  ]);
  // 二技能·不动壁垒：盾砸向地面，岩壁升起
  const s2Up = kp(h, stance, { hipsPos: [0, 0.02, -0.04], chest: [-10, 0, 0], armL: [-120, 0, 30], foreL: [-70, -80, 0], armR: [-20, 0, -50] });
  const s2Down = kp(h, guard, { hipsPos: [0, -0.26, 0.06], hips: [14, 10, 0], chest: [12, -4, 0], armL: [-40, 0, 4], foreL: [-86, -84, 0], head: [-14, 0, 0] });
  const s2 = track([
    [0, stance],
    [0.3, s2Up, E.out],
    [0.55, s2Down, E.in3],
    [1, guard, E.io],
  ]);
  // 大招·山崩地裂(跃击)：腾空举锤 → 下落抡砸
  const lRise = kp(h, null, {
    hips: [-16, 0, 0],
    spine: [-10, 0, 0],
    chest: [-12, 0, 0],
    head: [14, 0, 0],
    footL: [0.24, 0.42, 0.12, 30, 10],
    footR: [-0.24, 0.3, -0.22, 50, -10],
    armR: [-170, 0, -20],
    foreR: [-46, 0, 0],
    propR: [106, 0, 0],
    armL: [-60, 0, 50],
    foreL: [-70, -50, 0],
  });
  const lFall = kp(h, null, {
    hipsPos: [0, -0.1, 0.1],
    hips: [30, 0, 0],
    spine: [14, 0, 0],
    chest: [14, 0, 0],
    head: [-30, 0, 0],
    footL: [0.3, 0.2, 0.36, -10, 10],
    footR: [-0.3, 0.16, -0.2, 30, -16],
    armR: [-60, 0, -8],
    foreR: [-6, 0, 0],
    propR: [90, 8, 0],
    armL: [10, 0, 60],
    foreL: [-50, -50, 0],
  });
  const lLand = kp(h, lFall, { hipsPos: [0, -0.3, 0.16], footL: [0.32, 0.11, 0.34, 0, 12], footR: [-0.32, 0.11, -0.18, 10, -20], armR: [-44, 0, -8], propR: [100, 8, 0] });
  const crouch = kp(h, stance, { hipsPos: [0, -0.26, 0], hips: [16, 0, 0], chest: [10, 0, 0], armR: [20, 0, -30], propR: [110, -10, 0] });
  const leap = track([
    [0, crouch],
    [0.3, lRise, E.out],
    [0.62, lRise, E.lin],
    [0.86, lFall, E.in],
    [1, lLand, E.in],
  ]);
  const runArms = kp(h, null, { armL: [-30, 0, 14], foreL: [-74, -60, 0], armR: [-10, 0, -18], foreR: [-100, 0, 0], propR: [4, -8, 0] });
  // 裂地冲撞：塔盾顶在身前，整个人压上去
  const charge = kp(h, null, { armL: [-62, 0, 4], foreL: [-84, -80, 0], armR: [40, 0, -26], foreR: [-20, 0, 0], propR: [116, -10, 0], head: [-18, 0, 0] });
  const channel = kp(h, stance, {
    hipsPos: [0, -0.2, 0],
    hips: [8, 0, 0],
    chest: [6, 0, 0],
    head: [12, 0, 0],
    armR: [-46, 0, -6],
    foreR: [-46, 0, 0],
    propR: [140, 0, 0],
    armL: [-10, 0, 20],
    foreL: [-50, -40, 0],
  });
  const common = makeCommon(h, stance, { limp: { propR: [104, -8, 0], foreL: [-30, -30, 0] }, lying: { armR: [-4, 0, -70], propR: [84, -10, 0], armL: [-6, 0, 56], foreL: [-20, -20, 0] }, lieY: 0.3 });
  return { stance, guard, tmp: emptyCKP(h), atkA, atkB, slam, s2, leap, runArms, charge, channel, common };
}

export function createPanyue(): ModelDef {
  const { h, b } = build();
  const A = makeAnims(h);
  const J = h.J;
  const k = A.tmp;
  const geometry = b.build();

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    if (animateCommon(h, pose, a.anim, a.t, a.p, a.time, A.common)) {
      if (a.anim === 'dead') out.glow = Math.max(0.12, 1 - a.t * 1.1);
      return;
    }
    const guarding = (a.mode & 2) !== 0;
    switch (a.anim) {
      case 'move': {
        runCycle(h, pose, a.stride, RUN, () => {
          const e = (guarding ? A.guard : A.runArms).e;
          const sw = Math.cos(a.stride * Math.PI * 2);
          pose.rot(J.armL, e[J.armL * 3] + sw * 5, 0, e[J.armL * 3 + 2]);
          pose.rot(J.foreL, e[J.foreL * 3], e[J.foreL * 3 + 1], 0);
          pose.rot(J.armR, e[J.armR * 3] - sw * 12, 0, e[J.armR * 3 + 2]);
          pose.rot(J.foreR, e[J.foreR * 3], 0, 0);
          pose.rot(J.propR, A.runArms.e[J.propR * 3] - sw * 5, A.runArms.e[J.propR * 3 + 1], 0);
        });
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const tr = (a.mode & 1) !== 0 ? A.slam : a.variant % 2 === 0 ? A.atkA : A.atkB;
        sampleTrack(tr, p, k);
        applyCKP(h, pose, k);
        out.glow = 1 + 1.4 * bump(p, 0.36, 0.2);
        break;
      }
      case 'cast_s1':
      case 'dash': {
        // 冲撞：腿按时间快速交替蹬地，上身保持顶盾
        runCycle(h, pose, a.t * 3.4, CHARGE_RUN, () => {
          const e = A.charge.e;
          for (const j of [J.armL, J.foreL, J.armR, J.foreR, J.propR]) pose.rot(j, e[j * 3], e[j * 3 + 1], e[j * 3 + 2]);
          pose.add(J.head, e[J.head * 3], 0, 0);
        });
        out.glow = 1.8;
        break;
      }
      case 'cast_s2': {
        sampleTrack(A.s2, a.p, k);
        applyCKP(h, pose, k);
        out.glow = 1 + 2 * bump(a.p, 0.55, 0.3);
        break;
      }
      case 'cast_ult':
      case 'leap': {
        sampleTrack(A.leap, a.p, k);
        applyCKP(h, pose, k);
        out.glow = 1.6 + 1.6 * a.p;
        break;
      }
      case 'spin':
      case 'channel': {
        applyCKP(h, pose, A.channel, () => breathe(h, pose, a.time, a.seed, 0.8));
        out.glow = 1 + 0.5 * (0.5 + 0.5 * Math.sin(a.time * 5));
        break;
      }
      default: {
        applyCKP(h, pose, guarding ? A.guard : A.stance, () => {
          breathe(h, pose, a.time * 0.75, a.seed, 1.3);
          pose.add(J.propR, Math.sin(a.time * 1.1) * 2, 0, 0);
        });
        out.glow = (guarding ? 1.5 : 1) + 0.15 * Math.sin(a.time * 2.2);
      }
    }
  };

  return {
    key: 'hero:panyue',
    geometry,
    rig: h.rig,
    height: 2.02,
    radius: 0.62,
    scale: SCALE,
    stride: RUN.stride * SCALE,
    triangles: b.triangleCount,
    attach: {
      head: { joint: J.head, x: 0, y: 0.2, z: 0 },
      chest: { joint: J.chest, x: 0, y: 0.06, z: 0 },
      handR: { joint: J.handR, x: 0, y: -0.1, z: 0 },
      handL: { joint: J.handL, x: 0, y: -0.1, z: 0 },
      weapon: { joint: J.propR, x: 0, y: 0, z: 1.06 },
      muzzle: { joint: J.propR, x: 0, y: 0, z: 1.06 },
    },
    blend: (from, to) => (to === 'attack' ? 0.09 : to === 'dash' || to === 'leap' ? 0.08 : to === 'dead' ? 0.05 : from === 'leap' ? 0.2 : 0.16),
    animate,
  };
}
