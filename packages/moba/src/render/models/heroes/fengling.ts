/**
 * 李广 · 射手：高瘦的汉代边将，双臂比常人长(「猿臂」)。鬓角微霜，束髻戴鹖冠，冠两侧各插一支上翘的褐色鹖尾；
 * 苍青戎服(下摆到膝、窄袖)外罩熟皮札甲，甲只护胸背与左肩(右肩不披甲便于开弓)；胸前交叉革带，铜带钩；
 * 短披风斜搭身后(苍青面、白里)；左前臂皮臂鞲、右手拇指白玉扳指；右腰后斜挂箭箙，露出一排白羽；左腰一把环首短刀；
 * 手持比上半身还长的黑漆角弓(弓梢白骨色、握把缠朱丝)。
 * 俯视识别三要素：黑漆长弓、头后 V 形双鹖尾、腰后一排白羽。射击时侧身拉满弓。
 * 造型依据只有《史记·李将军列传》与汉代边塞诗(猿臂善射、没石饮羽)。
 */
import { type CKP, type CommonAnims, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, STANDARD_DIMS, animateCommon, applyCKP, breathe, emptyCKP, humanRig, kp, lerpCKP, makeCommon, mix, mixQ, reachHand, runCycle, sat, seg, strikeWarp } from '../humanoid';
import { MAT, type MatClass, ModelBuilder, PATTERN, type SoftBind, X, lerp } from '../kit';
import { beard, boot, chainBind, face, hairCap, hand, head, lock, polyAt, strip, torsoBind, trim } from '../parts';
import { type Pose, poseSpace, setSpaceRot } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  robe: 0x2f6f78,
  robeDark: 0x1d4a52,
  robeLight: 0x4b8f97,
  pants: 0x2b3940,
  pantsDark: 0x1a252b,
  wrap: 0xb9ae92,
  wrapDark: 0x857b62,
  leather: 0x8a6238,
  leatherDark: 0x5a3e22,
  leatherLight: 0xa97d4c,
  iron: 0x59616b,
  ironLight: 0x8f98a3,
  brass: 0xc99a45,
  brassDark: 0x8a6526,
  skin: 0xd9a57e,
  hair: 0x2a2a2e,
  hairHi: 0x6a6a70,
  cap: 0x1c1b20,
  capHi: 0x3a3842,
  pheasant: 0xa07242,
  pheasantTip: 0x2a1c12,
  lining: 0xe9e2cf,
  liningShade: 0xbfb69e,
  lacquer: 0x3a2a22,
  lacquerDark: 0x1d1512,
  bone: 0xe8dcc0,
  silk: 0xb0342a,
  shaft: 0xc8a860,
  head: 0x6a7078,
  feather: 0xf4f1e8,
  featherShade: 0xc9c4b6,
  jade: 0xe6efe0,
};

/** 肩更宽；前臂与手下移 = 手臂加长约 12%(「猿臂」) */
const DIMS: HumanDims = { ...STANDARD_DIMS, hipX: 0.125, shoulderX: 0.31, clavX: 0.09, elbowY: 1.05, wristY: 0.76, handY: 0.67 };
const SCALE = 1.2;
const DEG = Math.PI / 180;

/** 弓：弓梢到握点的距离(沿 ±Z)、弦所在的高度(握把局部 +Y) */
const BOW = { tip: 0.86, string: 0.2 };

interface Extra {
  bowUp: number;
  bowDn: number;
  nock: number;
  arrow: number;
}

function build(): { h: Human; b: ModelBuilder; extra: Extra } {
  const h = humanRig(DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();
  const gx = d.shoulderX;
  const gy = d.handY;
  const hs = 0.95;

  // ── 弓的关节：上下弓臂各自弯曲，弦的中点(搭箭处)可后拉 ──
  const bowUp = rig.add('bowUp', J.propL, gx, gy, 0.12);
  const bowDn = rig.add('bowDn', J.propL, gx, gy, -0.12);
  const nock = rig.add('nock', J.propL, gx, gy + BOW.string, 0);
  const arrow = rig.add('arrow', nock, gx, gy + BOW.string, 0);
  // ── 弹簧链：短披风的两片下摆 ──
  const capePts = (s: number): number[][] => [[s * 0.13, 1.36, -0.19], [s * 0.19, 1.14, -0.28], [s * 0.22, 0.92, -0.33], [s * 0.24, 0.7, -0.36]];
  const capeL = rig.addChain('capeL', J.chest, capePts(1).slice(0, 3));
  const capeR = rig.addChain('capeR', J.chest, capePts(-1).slice(0, 3));
  for (const t of [capeL, capeR]) rig.chain({ joints: t, tip: [0, -0.22, -0.03], stiffness: 4, drag: 0.91, gravity: 8, maxAngle: 70, wind: 2.4, colliders: [{ joint: J.hips, x: 0, y: -0.02, z: 0, r: 0.26 }, { joint: J.chest, x: 0, y: 0, z: 0, r: 0.22 }] });

  // 下摆的蒙皮：腰部跟髋，越往下越跟同侧大腿
  const skirtBind: SoftBind = (x, y) => {
    const thigh = x >= 0 ? J.thighL : J.thighR;
    if (y >= 0.9) return [J.hips, J.hips, 1];
    return [J.hips, thigh, sat((y - 0.52) / 0.38)];
  };

  // ── 腿：深色裤 + 浅色行縢(绑腿) + 皮靴 ──
  b.sym((s) => {
    const x = d.hipX;
    b.bone(s > 0 ? J.thighL : J.thighR).paint(C.pants, { c2: C.pantsDark, ao: 0.88, ao2: 1, mat: MAT.cloth });
    b.limb([x, d.hipY + 0.04, 0], [x, d.kneeY, 0], 0.112, 0.086, { seg: 8, bulge: 0.04 });
  });
  for (const s of [1, -1] as const) {
    b.paint(C.leatherDark, { c2: C.leather, gloss: 0.25, mat: MAT.leather });
    boot(b, h, s, { top: 0.3, rTop: 0.088, rAnkle: 0.074, len: 0.23, toe: 0.02 });
    const shin = s > 0 ? J.shinL : J.shinR;
    // 行縢：自靴口缠到膝下，几道斜缠的绑带
    b.bone(shin).paint(C.wrap, { c2: C.wrapDark, mat: MAT.cloth });
    b.lathe([[0.28, 0.084, 0.084, s * d.hipX, 0], [0.33, 0.088, 0.088, s * d.hipX, 0], [0.43, 0.09, 0.09, s * d.hipX, 0], [0.46, 0.084, 0.084, s * d.hipX, 0]], { seg: 8 });
    b.paint(C.leatherDark, { c2: C.leather, mat: MAT.leather });
    b.g(X(s * d.hipX, 0.37, 0, 12, 0, 0), () => b.torus(0.091, 0.008, 0.011, 8, 3, { crease: 30 }));
  }

  // ── 戎服下摆：到膝，前后开衩(两片)，下缘一道深边 ──
  {
    const prof = [
      [0.5, 0.2, 0.19, 0, 0],
      [0.62, 0.195, 0.18, 0, 0],
      [0.78, 0.18, 0.16, 0, 0],
      [0.92, 0.17, 0.14, 0, 0],
    ];
    const slit = (a: number, k: number): number => 1 + (k < 2 ? 0.03 * Math.sin(a * 6) : 0);
    b.bind(skirtBind).paint(C.robe, { c2: C.robeDark, ao: 0.9, ao2: 1, mat: MAT.cloth, by: (_x, y) => (y - 0.5) / 0.4 });
    b.lathe(prof, { seg: 14, cap0: false, cap1: false, shape: slit });
    // 下缘深色镶边(开口环，不封底)
    b.paint(C.robeDark, { c2: C.pantsDark, mat: MAT.cloth });
    b.lathe([[0.49, 0.204, 0.194], [0.5, 0.208, 0.198], [0.55, 0.204, 0.192], [0.56, 0.198, 0.186]], { seg: 14, cap0: false, cap1: false, shape: (a) => 1 + 0.03 * Math.sin(a * 6) });
  }

  // ── 躯干：苍青戎服，修长；外罩熟皮札甲(胸背) ──
  const prof: number[][] = [
    [0.84, 0.17, 0.14],
    [0.92, 0.172, 0.138],
    [1.0, 0.152, 0.118],
    [1.1, 0.172, 0.13],
    [1.21, 0.215, 0.152],
    [1.32, 0.22, 0.142],
    [1.385, 0.14, 0.108],
    [1.425, 0.072, 0.068],
  ];
  const R = (y: number): [number, number] => {
    for (let i = 1; i < prof.length; i++) {
      if (y <= prof[i][0]) {
        const t = Math.max(0, (y - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]));
        return [lerp(prof[i - 1][1], prof[i][1], t), lerp(prof[i - 1][2], prof[i][2], t)];
      }
    }
    return [prof[prof.length - 1][1], prof[prof.length - 1][2]];
  };
  const band = (ys: number[], grow: number[]): number[][] => ys.map((y, i) => [y, R(y)[0] + grow[i], R(y)[1] + grow[i]]);
  b.bind(torsoBind(h)).paint(C.robe, { c2: C.robeDark, ao: 0.88, ao2: 1, mat: MAT.cloth });
  b.lathe(prof, { seg: 12 });
  b.bone(J.neck).paint(C.skin, { ao: 0.75, glow: 0.05, mat: MAT.skin });
  b.lathe([[1.4, 0.064, 0.064], [1.53, 0.062, 0.062]], { seg: 8, cap0: false });
  // 交领：右衽的深色领缘
  b.bone(J.chest).paint(C.robeDark, { c2: C.pantsDark, mat: MAT.cloth });
  b.tube([[0.07, 1.445, 0.05, 0.026, 0.01], [0.04, 1.39, 0.115, 0.028, 0.01], [-0.02, 1.33, 0.135, 0.028, 0.01]], { seg: 4, up: [1, 0.4, 0] });
  b.tube([[-0.07, 1.445, 0.05, 0.026, 0.01], [-0.045, 1.4, 0.108, 0.026, 0.01]], { seg: 4, up: [1, -0.4, 0] });
  // 札甲：护胸背的一整片熟皮甲(鳞纹)，胸口几排铁札
  b.bind(torsoBind(h)).paint(C.leatherDark, { c2: C.leatherLight, gloss: 0.25, ao: 0.82, ao2: 1, mat: MAT.leather, pattern: PATTERN.scale, patternScale: 13, patternAmt: 0.3 });
  b.lathe(band([1.03, 1.06, 1.15, 1.25, 1.33, 1.37], [0.008, 0.024, 0.022, 0.02, 0.018, 0.008]), { seg: 12, cap0: false, cap1: false });
  b.bone(J.chest).paint(C.iron, { c2: C.ironLight, gloss: 0.8, mat: MAT.metal, pattern: PATTERN.scale, patternScale: 16, patternAmt: 0.35 });
  b.sheet(4, 2, (u, v) => {
    const a = lerp(58, 122, u) * DEG;
    const y = lerp(1.3, 1.17, v);
    const r = R(y);
    return [Math.cos(a) * (r[0] + 0.028), y + (Math.round(u * 4) % 2 ? 0.006 : 0), Math.sin(a) * (r[1] + 0.028)];
  });
  // 胸前交叉革带(一条斜挎箭箙，一条斜挎披膊) + 交叉处一枚铜扣
  b.paint(C.leatherDark, { c2: C.leather, gloss: 0.3, mat: MAT.leather });
  b.tube([[0.2, 1.37, 0.07, 0.03, 0.012], [0.08, 1.26, 0.17, 0.032, 0.012], [-0.08, 1.12, 0.165, 0.032, 0.012], [-0.18, 1.04, 0.08, 0.03, 0.012]], { seg: 4, up: [0, 0.6, 0.8] });
  b.tube([[-0.2, 1.37, 0.07, 0.03, 0.012], [-0.08, 1.26, 0.17, 0.032, 0.012], [0.08, 1.12, 0.165, 0.032, 0.012], [0.18, 1.04, 0.08, 0.03, 0.012]], { seg: 4, up: [0, 0.6, 0.8] });
  b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
  b.ball(0, 1.19, 0.182, 0.032, 0.032, 0.016, 0);
  // 革带 + 铜带钩
  b.bone(J.spine).paint(C.leatherDark, { c2: C.leather, gloss: 0.3, mat: MAT.leather });
  b.lathe([[0.93, 0.178, 0.146], [0.945, 0.186, 0.152], [1.0, 0.168, 0.136], [1.015, 0.16, 0.13]], { seg: 12 });
  b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
  b.g(X(0, 0.97, 0.15, 0, 0, 0), () => b.extrude([[-0.05, 0.012], [0.03, 0.022], [0.055, 0], [0.03, -0.022], [-0.05, -0.012]], 0.02, 0.006));

  // ── 左肩披膊(熟皮 + 铁札，两层) ──
  const plate = (bone: number, x: number, y: number, rx: number, ry: number, rz: number, tilt: number, c: number, c2: number, mat: MatClass): void => {
    b.bone(bone).paint(c, { c2, gloss: mat === MAT.metal ? 0.8 : 0.25, ao: 0.82, ao2: 1, mat, pattern: PATTERN.scale, patternScale: 14, patternAmt: 0.3 });
    b.g(X(x, y, 0, 0, 0, tilt), () => {
      b.lathe([[-ry * 0.34, rx, rz], [-ry * 0.1, rx * 1.02, rz * 1.02], [ry * 0.6, rx * 0.72, rz * 0.72], [ry, rx * 0.2, rz * 0.2]], { seg: 9, crease: 50 });
    });
  };
  plate(J.clavL, 0.33, 1.42, 0.15, 0.075, 0.15, -22, C.leatherDark, C.leatherLight, MAT.leather);
  plate(J.armL, 0.37, 1.3, 0.12, 0.06, 0.125, -42, C.iron, C.ironLight, MAT.metal);
  b.bone(J.armL).paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
  b.g(X(0.37, 1.3, 0, 0, 0, -42), () => b.lathe([[-0.026, 0.118, 0.123], [-0.016, 0.128, 0.133], [-0.006, 0.122, 0.127]], { seg: 9, cap0: false, cap1: false, crease: 30 }));

  // ── 手臂：窄袖 + 队伍色臂带；左前臂长皮臂鞲，右手拇指白玉扳指 ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.robe, { c2: C.robeDark, ao: 0.9, ao2: 1, mat: MAT.cloth });
    b.ball(x, d.shoulderY, 0, 0.082, 0.08, 0.082, 1);
    b.limb([x, d.shoulderY, 0], [x, d.elbowY, 0], 0.076, 0.064, { seg: 8 });
    b.paint(0xffffff, { team: 1, mat: MAT.cloth });
    trim(b, x, d.elbowY + 0.1, 0, 0.07, 0.07, 0.012, 0.03, 8);
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.robe, { c2: C.robeDark, mat: MAT.cloth });
    b.ball(x, d.elbowY, 0, 0.064, 0.064, 0.064, 1);
    b.limb([x, d.elbowY, 0], [x, d.wristY, 0], 0.06, 0.052, { seg: 8 });
    b.paint(C.leather, { c2: C.leatherDark, gloss: 0.25, mat: MAT.leather });
    const top = s > 0 ? 0.24 : 0.1;
    b.lathe([[d.wristY - 0.01, 0.058, 0.058, x, 0], [d.wristY + 0.02, 0.07, 0.07, x, 0], [d.wristY + top, 0.074, 0.074, x, 0], [d.wristY + top + 0.014, 0.062, 0.062, x, 0]], { seg: 8 });
    if (s > 0) {
      b.paint(C.leatherDark, { c2: C.leather, mat: MAT.leather });
      trim(b, x, d.wristY + 0.12, 0, 0.074, 0.074, 0.008, 0.012, 8);
    }
  });
  b.paint(C.skin, { glow: 0.06, ao: 0.9, mat: MAT.skin });
  hand(b, h, 1, 0.056);
  hand(b, h, -1, 0.056);
  b.bone(J.handR).paint(C.jade, { c2: 0xc6d6c0, gloss: 0.9, mat: MAT.crystal });
  b.g(X(-d.shoulderX + 0.012, d.handY + 0.02, 0.05, 70, 0, -20), () => b.torus(0.017, 0.008, 0.008, 8, 3, { crease: 40 }));

  // ── 短披风：罩住两肩背后的披领 + 两片平切的下摆(苍青面、白里，白里下缘一道队伍色) ──
  b.bone(J.chest).paint(C.robeDark, { c2: C.robe, ao: 0.9, mat: MAT.cloth });
  b.sheet(8, 2, (u, v) => {
    const a = lerp(200, 340, u) * DEG;
    const rows = [[1.45, 0.11, 0.1], [1.4, 0.25, 0.18], [1.33, 0.29, 0.22]];
    const r = rows[Math.round(v * 2)];
    return [Math.cos(a) * r[1], r[0], Math.sin(a) * r[2] - 0.02];
  });
  b.paint(C.lining, { c2: C.liningShade, mat: MAT.cloth });
  b.g(X(0, 1.455, -0.02, 10, 0, 0, 1, 1, 0.9), () => b.torus(0.105, 0.03, 0.028, 10, 4));
  for (const [t, sgn] of [[capeL, 1], [capeR, -1]] as [number[], number][]) {
    const pts = capePts(sgn);
    const w = (v: number): number => mix(0.13, 0.17, v);
    b.bind(chainBind(t, pts, J.chest)).paint(C.robe, { c2: C.robeDark, mat: MAT.cloth });
    strip(b, pts.map((p) => [p[0], p[1], p[2] - 0.01]), { width: w, axis: [1, 0, sgn * 0.35], bow: [0, 0, -0.03], nu: 3, nv: 6, tail: 'flat', wave: 0.2 });
    b.paint(C.lining, { c2: C.liningShade, mat: MAT.cloth });
    const inner = [0, 0.3, 0.6, 0.86].map((v) => polyAt(pts, v));
    strip(b, inner.map((p) => [p[0], p[1], p[2] + 0.006]), { width: (v) => w(v * 0.86), axis: [1, 0, sgn * 0.35], bow: [0, 0, -0.03], nu: 3, nv: 5, tail: 'flat' });
    b.paint(0xffffff, { team: 1, mat: MAT.cloth });
    strip(b, [polyAt(pts, 0.86), polyAt(pts, 0.93), polyAt(pts, 1)].map((p) => [p[0], p[1], p[2] + 0.006]), { width: (v) => w(0.86 + v * 0.14), axis: [1, 0, sgn * 0.35], bow: [0, 0, -0.03], nu: 3, nv: 2, tail: 'flat' });
  }

  // ── 箭箙：右腰后斜挂，筒口朝后上方，露出一排白羽(俯视可见)；羽根一道队伍色 ──
  b.bone(J.hips);
  b.g(X(-0.25, 0.86, -0.1, -32, 0, 26), () => {
    b.paint(C.leatherDark, { c2: C.leather, gloss: 0.3, mat: MAT.leather });
    b.lathe([[-0.34, 0.035, 0.03], [-0.3, 0.06, 0.05], [0.12, 0.078, 0.06], [0.2, 0.085, 0.066]], { seg: 8, cap1: false });
    b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
    trim(b, 0, 0.19, 0, 0.088, 0.068, 0.01, 0.016, 8);
    trim(b, 0, -0.2, 0, 0.072, 0.058, 0.008, 0.012, 8);
    for (let i = 0; i < 7; i++) {
      const ox = lerp(-0.055, 0.055, i / 6);
      const oz = (i % 2 ? 0.018 : -0.016);
      const tip = 0.44 + (i % 3) * 0.025;
      b.paint(C.shaft, { c2: 0x9a8040, mat: MAT.leather });
      b.tube([[ox, 0.1, oz, 0.007], [ox * 1.2, tip, oz, 0.007]], { seg: 3 });
      b.paint(0xffffff, { team: 1, mat: MAT.cloth });
      b.tube([[ox * 1.2, tip - 0.2, oz, 0.011], [ox * 1.2, tip - 0.18, oz, 0.011]], { seg: 3 });
      b.paint(C.feather, { c2: C.featherShade, mat: MAT.fur, line: 0 });
      b.g(X(ox * 1.2, tip - 0.07, oz, 0, 60 + i * 20, 0), () => b.extrude([[-0.04, -0.1], [0.04, -0.1], [0.045, 0.07], [0, 0.1], [-0.045, 0.07]], 0.006, 0));
    }
  });
  // 左腰的环首短刀(装饰)：刀鞘斜向后下
  b.g(X(0.2, 0.9, 0.02, 64, 0, -14), () => {
    b.paint(C.lacquerDark, { c2: C.lacquer, gloss: 0.6, mat: MAT.leather });
    b.tube([[0, 0, -0.04, 0.022, 0.012], [0, 0, 0.42, 0.024, 0.012], [0, -0.01, 0.48, 0.012, 0.008]], { seg: 4, up: [0, 1, 0] });
    b.paint(C.leatherDark, { mat: MAT.leather });
    b.tube([[0, 0, -0.06, 0.016], [0, 0, -0.2, 0.016]], { seg: 5 });
    b.paint(C.iron, { c2: C.ironLight, gloss: 0.8, mat: MAT.metal });
    b.g(X(0, 0, -0.24, 90, 0, 0), () => b.torus(0.035, 0.009, 0.009, 6, 3, { crease: 30 }));
  });

  // ── 头：风霜肤色，剑眉细眼，短髭与八字胡；黑灰发束髻、鬓角微霜；鹖冠 + 双鹖尾 ──
  const hd = head(b, h, C.skin, hs, 0.25, 1.04);
  const cy = hd.cy;
  face(b, h, hd, {
    iris: 0x2a1c14, irisGlow: 0.05, irisSize: 0.62, brow: C.hair, browTilt: 14, browH: 0.022, browLen: 1.1, eyeW: 0.052, eyeH: 0.034, slant: 6, lash: 0.017,
    lip: 0x9a5a48, skin: C.skin, nose: 1.0, ears: true, mouthW: 0.95, smile: -0.15, lite: true,
  });
  hairCap(b, h, hd, {
    c: C.hair,
    c2: C.hairHi,
    thick: 0.024,
    gloss: 0.2,
    line: (phi) => (phi < 0.85 ? 0.17 - 0.015 * Math.cos((phi / 0.85) * Math.PI * 0.5) : phi < 1.4 ? mix(0.16, -0.06, (phi - 0.85) / 0.55) : -0.28),
  });
  beard(b, h, hd, { c: C.hair, c2: C.hairHi, spread: 0, tufts: 1, len: 0.075, tuftR: 0.026, puff: 0.1, mustache: 0.075, mustacheR: 0.012, curl: -0.012, gloss: 0.1, tuftSeg: 4 });
  // 鬓角的霜色：两侧贴在耳前的一小片灰白
  b.bone(J.head).paint(C.hairHi, { c2: C.hair, mat: MAT.fur });
  b.sym(() => {
    const y = cy + 0.02;
    const r = hd.ring(0.02);
    b.tube([[r[0] * 0.95, y + 0.07, r[2] + r[1] * 0.26, 0.01, 0.022], [r[0] * 0.98, y - 0.0, r[2] + r[1] * 0.28, 0.01, 0.02], [r[0] * 0.92, y - 0.06, r[2] + r[1] * 0.32, 0.004, 0.008]], { seg: 4, crease: 180, up: [0, 0, 1] });
  });
  // 鹖冠：黑漆纱冠罩住脑后的发髻，前低后高；额前一道冠梁
  {
    const ring = (dy: number, grow: number): number[] => {
      const r = hd.ring(dy * hs);
      return [cy + dy * hs, r[0] + grow, r[1] + grow, 0, r[2]];
    };
    b.paint(C.cap, { c2: C.capHi, gloss: 0.5, mat: MAT.leather });
    b.lathe([ring(0.13, 0.012), ring(0.15, 0.016), ring(0.17, 0.014)], { seg: 14, cap0: false, cap1: false, crease: 40 });
    b.g(X(0, cy + 0.19, -0.1, -24, 0, 0), () => {
      b.lathe([[-0.06, 0.11, 0.11], [0.04, 0.105, 0.11], [0.11, 0.085, 0.095], [0.15, 0.05, 0.06], [0.165, 0.02, 0.02]], { seg: 10, crease: 50 });
    });
    // 冠两侧的铜珰
    b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
    b.sym(() => b.ball(0.13, cy + 0.22, -0.06, 0.022, 0.022, 0.014, 0));
    // 双鹖尾：插在冠顶后部两侧、贴着发髻向后上方斜掠出去的两支长羽，末段向后平垂，俯视是头后的一个 V。
    // 羽片宽面朝上朝前(正面、俯视都看得到羽面)：中段最宽、梢头收尖；浅褐底上一道道深色横斑、梢头近黑、正中一条浅色羽轴。
    // 原先是从冠的两侧竖着长出来、向外卷的两根细圆条，正面看像一对触角；根部收到冠顶、整体向后掠之后读作冠羽
    for (const s of [1, -1]) {
      const N = 10;
      const L = 0.6;
      const at = (t: number): number[] => {
        const q = t * t;
        return [s * (0.075 + L * (0.2 * t + 0.1 * q)), cy + 0.26 + L * (0.66 * t - 0.34 * q), -0.13 - L * (0.5 * t + 0.46 * q)];
      };
      const half = (t: number): number => 0.012 + 0.038 * Math.pow(Math.sin(Math.PI * 0.86 * Math.pow(t, 0.7)), 0.8) * (1 - 0.3 * t);
      const blade: number[][] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = at(t);
        blade.push([p[0], p[1], p[2], i === N ? 0.004 : half(t), 0.006]);
      }
      // 横斑：沿羽片一环深一环浅，越往梢头越深
      b.paint(C.pheasant, { c2: C.pheasantTip, mat: MAT.fur, by: (_x, _y, _z, g) => Math.min(1, (Math.round(g * N) % 2 === 1 ? 0.7 : 0.0) + Math.max(0, g - 0.66) * 2.6) });
      b.tube(blade, { seg: 4, up: [s, 0, 0], crease: 180 });
      // 羽轴：羽片上下两面正中的一道浅色
      b.paint(C.bone, { c2: C.pheasant, mat: MAT.fur, line: 0 });
      b.tube(blade.slice(0, N).map((p, i) => [p[0], p[1], p[2], 0.005 * (1 - (i / N) * 0.6), 0.011]), { seg: 4, up: [s, 0, 0], crease: 180 });
      // 羽根的铜管座
      b.paint(C.brass, { c2: C.brassDark, gloss: 1, mat: MAT.metal });
      b.limb(at(-0.06), at(0.07), 0.02, 0.017, { seg: 5 });
    }
  }

  // ── 黑漆角弓(左手)：握把在手心，弓臂沿 ±Z，弓背朝 −Y，弦在 +Y 一侧；弓梢白骨反曲 ──
  const limbY = (t: number): number => -0.04 + (BOW.string + 0.04) * (t * t * 0.7 + 0.3 * Math.pow(t, 4));
  const limbPath = (sgn: number, from: number, to: number): number[][] => {
    const out: number[][] = [];
    for (let i = 0; i <= 6; i++) {
      const t = lerp(from, to, i / 6);
      const z = sgn * (0.06 + t * (BOW.tip - 0.06));
      out.push([0, limbY(t), z, lerp(0.028, 0.016, t), lerp(0.036, 0.02, t)]);
    }
    return out;
  };
  b.g(X(gx, gy, 0), () => {
    // 握把：缠朱丝
    b.bone(J.propL).paint(C.silk, { c2: 0x6a1a14, gloss: 0.2, mat: MAT.cloth });
    b.tube([[0, -0.04, -0.11, 0.026, 0.03], [0, -0.045, 0, 0.03, 0.034], [0, -0.04, 0.11, 0.026, 0.03]], { seg: 6 });
    for (const sgn of [1, -1]) {
      const limb = sgn > 0 ? bowUp : bowDn;
      // 弓臂根部一小段跟握把，其余跟弓臂关节
      b.bind((_x, _y, z) => [limb, J.propL, sat((Math.abs(z) - 0.1) / 0.14)]);
      b.paint(C.lacquer, { c2: C.lacquerDark, gloss: 0.6, mat: MAT.leather });
      b.tube(limbPath(sgn, 0, 1), { seg: 5, up: [1, 0, 0] });
      // 弓梢(弰)：白骨色，向前(背离弦的一侧)反曲
      b.bone(limb).paint(C.bone, { c2: 0xbfae88, gloss: 0.9, mat: MAT.crystal });
      const z0 = sgn * BOW.tip;
      b.tube([[0, BOW.string, z0 - sgn * 0.03, 0.016, 0.02], [0, BOW.string - 0.015, z0 + sgn * 0.05, 0.014, 0.018], [0, BOW.string - 0.07, z0 + sgn * 0.12, 0.008, 0.01]], { seg: 4, up: [1, 0, 0] });
      // 弓臂中段的骨片贴面(角弓的层次)
      b.paint(C.bone, { c2: 0xa8946c, gloss: 0.7, mat: MAT.crystal, line: 0 });
      b.tube(limbPath(sgn, 0.25, 0.55).map((p) => [p[0], p[1] + 0.012, p[2], p[3] * 0.6, p[4] * 1.04]), { seg: 3, up: [1, 0, 0] });
    }
    // 弓弦：两端跟弓梢，中点跟搭箭点
    const sb: SoftBind = (_x, _y, z) => [z >= 0 ? bowUp : bowDn, nock, sat(Math.abs(z) / BOW.tip)];
    b.bind(sb).paint(0xf2ead6, { line: 0, mat: MAT.cloth });
    const sp: number[][] = [];
    for (let i = 0; i <= 8; i++) sp.push([0, BOW.string, lerp(-BOW.tip, BOW.tip, i / 8), 0.005]);
    b.tube(sp, { seg: 3, up: [1, 0, 0] });
    // 箭：平时缩到看不见，拉弓时出现在弦上，箭头朝 −Y(目标方向)。竹黄杆、铁灰镞、白羽(根部一道队伍色)
    b.bone(arrow).paint(C.shaft, { c2: 0x9a8040, mat: MAT.leather });
    b.tube([[0, BOW.string, 0, 0.009], [0, -0.78, 0, 0.009]], { seg: 4 });
    b.paint(C.head, { c2: 0xb8d4dc, gloss: 1, glow: 0.18, mat: MAT.metal });
    b.g(X(0, -0.78, 0, 180, 0, 0), () => b.crystal(0.028, 0.12, 4, 0.75, 0.05));
    b.paint(0xffffff, { team: 1, mat: MAT.cloth });
    b.tube([[0, 0.02, 0, 0.012], [0, 0.0, 0, 0.012]], { seg: 4 });
    b.paint(C.feather, { c2: C.featherShade, mat: MAT.fur, line: 0 });
    for (let i = 0; i < 3; i++) b.g(X(0, 0.11, 0, 0, i * 120, 0), () => b.extrude([[0, -0.07], [0.04, -0.04], [0.04, 0.05], [0, 0.07]], 0.006, 0));
  });

  b.bakeGrounding(2.05, 0.75, 0.9);
  return { h, b, extra: { bowUp, bowDn, nock, arrow } };
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 2.8, stance: 0.33, lift: 0.28, bob: 0.05, drop: 0.05, lean: 14, twist: 9, width: 0.12, arm: 0 };

interface Anims {
  stance: CKP;
  aim: CKP;
  aimLow: CKP;
  aimUp: CKP;
  tmp: CKP;
  runArms: CKP;
  tuck: CKP;
  channel: CKP;
  common: CommonAnims;
}

function makeAnims(h: Human): Anims {
  // 站姿：侧身而立(左肩朝前)，长弓斜握垂在左侧，右手搭在腰后的箭箙上(见 animate 里的 IK)
  const stance = kp(h, null, {
    hipsPos: [0, -0.02, 0],
    hips: [0, -22, -2],
    spine: [0, 4, 1],
    chest: [-2, 4, 0],
    neck: [0, 8, 0],
    head: [-2, 10, 0],
    footL: [0.14, 0.09, 0.12, 0, 0],
    footR: [-0.15, 0.09, -0.1, 0, -34],
    armL: [-6, 0, 22],
    foreL: [-30, 0, 0],
    propL: [-50, 0, -30],
    armR: [22, 0, -14],
    foreR: [-24, 0, 0],
  });
  // 瞄准：侧身弓步(两脚分得更开)，左臂平举指向目标，弓竖直
  const aim = kp(h, null, {
    hipsPos: [0, -0.08, 0],
    hips: [0, -48, 0],
    spine: [0, -16, 0],
    chest: [-2, -22, 0],
    neck: [0, 36, 0],
    head: [0, 44, 0],
    footL: [0.1, 0.09, 0.32, 0, -24],
    footR: [-0.12, 0.09, -0.28, 0, -80],
    armL: [0, 6, 88],
    foreL: [0, 0, 0],
    propL: [0, 90, 0],
  });
  // 一技能：再沉腰下蹲，拉得更满
  const aimLow = kp(h, aim, { hipsPos: [0, -0.18, -0.02], spine: [4, -16, 0], footL: [0.12, 0.09, 0.4, 0, -24], footR: [-0.14, 0.09, -0.34, 0, -80] });
  // 仰射(大招)：上身后仰，弓指向天空
  const aimUp = kp(h, aim, {
    hipsPos: [0, -0.12, -0.04],
    spine: [0, -16, 12],
    chest: [-2, -22, 20],
    neck: [-10, 36, -8],
    head: [-24, 44, 0],
    armL: [0, 6, 104],
  });
  const runArms = kp(h, null, { armL: [-20, 0, 14], foreL: [-50, 0, 0], propL: [-30, 0, 20], armR: [0, 0, -12], foreR: [-70, 0, 0] });
  // 飞将腾身：低平的侧滚翻(团身，弓收在怀里)
  const tuck = kp(h, null, {
    hipsPos: [0, -0.16, 0],
    hips: [34, 0, 0],
    spine: [22, 0, 0],
    chest: [16, 0, 0],
    head: [24, 0, 0],
    footL: [0.12, 0.38, 0.16, 30, 0],
    footR: [-0.12, 0.3, 0.02, 40, 0],
    armL: [-40, 0, 30],
    foreL: [-70, 0, 0],
    propL: [-20, 0, 30],
    armR: [-34, 0, -26],
    foreR: [-90, 0, 0],
  });
  // 回城引导：拄弓而立。弓竖在左前方，下梢点地，左手握弓、右手叠在左手上
  const channel = kp(h, null, {
    hipsPos: [0, -0.04, 0],
    hips: [0, -10, 0],
    spine: [2, 2, 0],
    chest: [2, 4, 0],
    neck: [4, 0, 0],
    head: [10, 4, 0],
    footL: [0.15, 0.09, 0.06, 0, 6],
    footR: [-0.15, 0.09, -0.04, 0, -16],
    armL: [-38, 0, 14],
    foreL: [-56, 0, 0],
    propL: [-34, 0, -8],
  });
  const common = makeCommon(h, stance, { limp: { propL: [-30, 0, 20] }, lying: { armL: [-6, 0, 70], propL: [20, 90, -20] } });
  return { stance, aim, aimLow, aimUp, tmp: emptyCKP(h), runArms, tuck, channel, common };
}

const _sv = new Float32Array(8);
const _hp = [0, 0, 0];
const _hq = [0, 0, 0, 1];
/** 待机时弓(上梢方向 = 关节的 +Z)在英雄自身坐标里的[俯仰, 偏航, 滚转](度) */
const IDLE_BOW = [-125, -48, 0];

export function createFengling(): ModelDef {
  const { h, b, extra } = build();
  const A = makeAnims(h);
  const J = h.J;
  const k = A.tmp;
  const geometry = b.build();

  /**
   * 一次完整的射击：举弓搭箭 → 拉满 → 撒放(release 时刻) → 弓弦回弹、手向后带 → 收弓。
   * p 为动作进度，release 为撒放时刻，depth 为拉弓深度，target 为瞄准姿态。返回弓与箭镞的亮度系数。
   */
  const shoot = (pose: Pose, p: number, release: number, depth: number, target: CKP): number => {
    const raise = seg(p, 0, release * 0.42);
    const lower = seg(p, Math.min(0.9, release + 0.3), 1);
    const w = raise * raise * (3 - 2 * raise) * (1 - lower * lower * (3 - 2 * lower));
    lerpCKP(k, A.stance, target, w);
    const drawing = p < release;
    // 拉弓：先快后慢地拉满；撒放后弦快速回弹并略微过冲
    let pull = 0;
    if (drawing) {
      const dd = seg(p, release * 0.3, release * 0.95);
      pull = depth * (1 - (1 - dd) * (1 - dd));
    } else {
      const r = (p - release) / 0.12;
      pull = r < 1 ? -0.035 * Math.sin(r * Math.PI * 2.5) * (1 - r) : 0;
    }
    applyCKP(h, pose, k);
    pose.pos(extra.nock, 0, pull, 0);
    const bend = (pull / 0.5) * 16;
    pose.rot(extra.bowUp, -bend, 0, 0);
    pose.rot(extra.bowDn, bend, 0, 0);
    pose.scale(extra.arrow, drawing && p > release * 0.2 ? Math.min(1, seg(p, release * 0.2, release * 0.3) * 1.2) : 0);
    if (w > 0.02) {
      if (drawing) {
        // 右手捏着弦：手腕在搭箭点略靠后的位置，肘抬高向后。起手阶段从垂手姿态过渡过来
        const grip = seg(p, release * 0.1, release * 0.34);
        const q = pose.q;
        for (let i = 0; i < 4; i++) {
          _sv[i] = q[J.armR * 4 + i];
          _sv[4 + i] = q[J.foreR * 4 + i];
        }
        reachHand(h, pose, -1, extra.nock, 0, 0.06, 0, -0.3, 0.55, -1);
        if (grip < 1) {
          mixQ(q, J.armR * 4, _sv, 0, grip);
          mixQ(q, J.foreR * 4, _sv, 4, grip);
        }
      } else {
        // 撒放后的随势：右手顺着箭的反方向甩开
        const f = seg(p, release, release + 0.16);
        const back = 0.5 + 0.35 * f;
        reachHand(h, pose, -1, extra.nock, 0.02, back * w + 0.06, 0.04 * f, -0.3, 0.55, -1);
      }
    }
    return drawing ? seg(p, release * 0.3, release) : Math.max(0, 1 - (p - release) / 0.15);
  };

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    pose.scale(extra.arrow, 0);
    if (animateCommon(h, pose, a.anim === 'leap' ? 'airborne' : a.anim, a.t, a.p, a.time, A.common)) {
      if (a.anim === 'dead') out.glow = Math.max(0.15, 1 - a.t * 1.2);
      return;
    }
    switch (a.anim) {
      case 'move': {
        runCycle(h, pose, a.stride, RUN, () => {
          const e = A.runArms.e;
          const sw = Math.cos(a.stride * Math.PI * 2);
          pose.rot(J.armL, e[J.armL * 3] + sw * 6, 0, e[J.armL * 3 + 2]);
          pose.rot(J.foreL, e[J.foreL * 3], 0, 0);
          pose.rot(J.propL, e[J.propL * 3] + sw * 3, 0, e[J.propL * 3 + 2]);
          pose.rot(J.armR, e[J.armR * 3] - sw * 34, 0, e[J.armR * 3 + 2]);
          pose.rot(J.foreR, e[J.foreR * 3] - sw * 14, 0, 0);
        });
        break;
      }
      case 'attack': {
        const g = shoot(pose, strikeWarp(a.p, a.windup), 0.35, 0.54, A.aim);
        out.glow = 1 + g * ((a.mode & 1) !== 0 ? 2.2 : 0.9);
        break;
      }
      case 'cast_s1': {
        // 白羽没石：沉腰拉到最满，撒放后弓身向前一弹
        const g = shoot(pose, a.p, 0.4, 0.62, A.aimLow);
        const kick = a.p > 0.4 ? Math.sin(seg(a.p, 0.4, 0.62) * Math.PI) : 0;
        pose.add(J.propL, 0, 0, -kick * 10);
        pose.add(J.armL, 0, kick * 6, 0);
        out.glow = 1 + g * 2.4;
        break;
      }
      case 'cast_ult': {
        const g = shoot(pose, a.p, 0.4, 0.58, A.aimUp);
        out.glow = 1 + g * 2.6;
        break;
      }
      case 'cast_s2':
      case 'dash': {
        applyCKP(h, pose, A.tuck, () => {
          // 低平的前滚翻：绕腰的高度(而不是脚底)翻一圈，离地只有一个小跳
          const p = a.anim === 'dash' ? a.p : 0;
          const th = p * Math.PI * 2;
          const pivot = 0.7;
          pose.rot(J.root, 360 * p, 0, 0);
          pose.pos(J.root, 0, pivot * (1 - Math.cos(th)) + 0.15 * Math.sin(p * Math.PI), -pivot * Math.sin(th));
        });
        out.glow = 1.8;
        break;
      }
      case 'spin':
      case 'channel': {
        applyCKP(h, pose, A.channel, () => breathe(h, pose, a.time, a.seed, 0.6));
        // 右手叠在左手上
        reachHand(h, pose, -1, J.handL, -0.02, 0.1, 0.05, -0.6, -0.4, 0.6);
        out.glow = 1 + 0.4 * (0.5 + 0.5 * Math.sin(a.time * 5));
        break;
      }
      default: {
        applyCKP(h, pose, A.stance, () => {
          breathe(h, pose, a.time, a.seed);
          pose.add(J.hips, 0, 0, Math.sin(a.time * 0.8 + a.seed * 4) * 1.2);
        });
        // 待机时弓的指向直接按英雄自身坐标给(不跟着手臂的欧拉角间接决定)：上梢朝左后上方斜出去、落在左肩外侧，
        // 下梢斜到身前小腿的高度。原先弓几乎竖直握在体侧，上梢正好在左脸旁边，正面和四分之三侧面看都贴着脸
        poseSpace(h.rig, pose, J.handL, _hp, _hq);
        setSpaceRot(pose, J.propL, _hq, IDLE_BOW[0] + Math.sin(a.time * 1.1) * 2, IDLE_BOW[1], IDLE_BOW[2]);
        out.glow = 1 + 0.08 * Math.sin(a.time * 2.6);
      }
    }
  };

  return {
    key: 'hero:fengling',
    geometry,
    rig: h.rig,
    height: 2.06,
    radius: 0.58,
    scale: SCALE,
    stride: RUN.stride * SCALE,
    triangles: b.triangleCount,
    attach: {
      head: { joint: J.head, x: 0, y: 0.25, z: 0 },
      chest: { joint: J.chest, x: 0, y: 0.08, z: 0 },
      handR: { joint: J.handR, x: 0, y: -0.07, z: 0 },
      handL: { joint: J.handL, x: 0, y: -0.07, z: 0 },
      weapon: { joint: J.propL, x: 0, y: -0.2, z: 0 },
      muzzle: { joint: J.propL, x: 0, y: -0.5, z: 0 },
    },
    blend: (_from, to) => (to === 'attack' ? 0.06 : to === 'dash' ? 0.05 : to === 'dead' ? 0.05 : 0.13),
    animate,
  };
}
