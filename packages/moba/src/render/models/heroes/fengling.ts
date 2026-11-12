/**
 * 风翎 · 逐风射手：矫健的猎手。青绿短斗篷(兜帽放下，下摆像羽翼般分叉)，浅金侧辫，米白轻皮甲与长靴，背后箭筒，
 * 手持比上半身还长的白木长弓，弓梢有发光的翠色风纹。
 * 剪影要点：竖在身侧的长弓、身后两条羽翼般的斗篷尾、箭筒。射击时侧身拉满弓。
 */
import { type CKP, type CommonAnims, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, STANDARD_DIMS, animateCommon, applyCKP, breathe, emptyCKP, humanRig, kp, lerpCKP, makeCommon, mix, reachHand, runCycle, sat, seg, strikeWarp } from '../humanoid';
import { ModelBuilder, type SoftBind, X, lerp } from '../kit';
import { boot, chainBind, face, fist, hairCap, head, strip, torsoBind, trim } from '../parts';
import type { Pose } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  teal: 0x3fae8c,
  tealDark: 0x26775f,
  tealLight: 0x74d6b4,
  cream: 0xf3f0e2,
  creamShade: 0xcfc6a8,
  leather: 0x8e6a45,
  leatherDark: 0x5d432c,
  gold: 0xe9c46a,
  skin: 0xf7d2b6,
  hair: 0xf6e2a4,
  hairTip: 0xe2b85c,
  wood: 0xf6f1e4,
  woodShade: 0xcfc4a6,
  jade: 0x4fe0a8,
};

const DIMS: HumanDims = { ...STANDARD_DIMS, hipX: 0.11, shoulderX: 0.27, clavX: 0.08 };
const SCALE = 1.12;

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

  // ── 弓的关节：上下弓臂各自弯曲，弦的中点(搭箭处)可后拉 ──
  const bowUp = rig.add('bowUp', J.propL, gx, gy, 0.12);
  const bowDn = rig.add('bowDn', J.propL, gx, gy, -0.12);
  const nock = rig.add('nock', J.propL, gx, gy + 0.2, 0);
  const arrow = rig.add('arrow', nock, gx, gy + 0.2, 0);
  // ── 弹簧链：斗篷的两条羽尾、侧辫 ──
  const tailPts = (s: number): number[][] => [[s * 0.12, 1.34, -0.17], [s * 0.2, 1.08, -0.3], [s * 0.26, 0.8, -0.4], [s * 0.3, 0.52, -0.46]];
  const tailL = rig.addChain('capeL', J.chest, tailPts(1).slice(0, 3));
  const tailR = rig.addChain('capeR', J.chest, tailPts(-1).slice(0, 3));
  for (const t of [tailL, tailR]) rig.chain({ joints: t, tip: [0, -0.26, -0.05], stiffness: 4, drag: 0.91, gravity: 7, maxAngle: 75, wind: 2.6, colliders: [{ joint: J.hips, x: 0, y: 0, z: 0, r: 0.24 }] });
  const braidPts = [[0.19, 1.62, 0.02], [0.24, 1.42, 0.1], [0.23, 1.2, 0.15], [0.21, 1.0, 0.16]];
  const braid = rig.addChain('braid', J.head, braidPts.slice(0, 3));
  rig.chain({ joints: braid, tip: [0, -0.2, 0], stiffness: 7, drag: 0.88, gravity: 10, maxAngle: 50, wind: 1, colliders: [{ joint: J.chest, x: 0, y: 0.05, z: 0, r: 0.2 }] });

  // ── 腿：米白马裤 + 过膝长靴 ──
  b.sym((s) => {
    const x = d.hipX;
    b.bone(s > 0 ? J.thighL : J.thighR).paint(C.cream, { c2: C.creamShade, ao: 0.9 });
    b.limb([x, d.hipY + 0.04, 0], [x, d.kneeY, 0], 0.115, 0.088, { seg: 8, bulge: 0.05 });
  });
  for (const s of [1, -1] as const) {
    b.paint(C.leather, { c2: C.leatherDark });
    boot(b, h, s, { top: 0.52, rTop: 0.105, rAnkle: 0.075, len: 0.23, toe: 0.03 });
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.gold, { gloss: 1 });
    trim(b, s * d.hipX, 0.515, 0, 0.108, 0.108, 0.012, 0.02, 8);
    // 靴筒翻边上的翠色小羽
    b.paint(C.teal, { c2: C.tealLight });
    b.g(X(s * (d.hipX + 0.1), 0.48, -0.02, 0, 90, s * -24), () => b.extrude([[-0.03, 0.06], [0.03, 0.06], [0, -0.1]], 0.012, 0.004));
  }

  // ── 躯干：米白皮甲 + 青绿腰封 ──
  b.bind(torsoBind(h)).paint(C.creamShade, { c2: C.cream });
  b.lathe(
    [
      [0.76, 0.1, 0.09],
      [0.83, 0.185, 0.145],
      [0.92, 0.18, 0.14],
      [1.0, 0.142, 0.112],
      [1.1, 0.16, 0.126],
      [1.21, 0.2, 0.15],
      [1.32, 0.2, 0.135],
      [1.385, 0.13, 0.105],
      [1.425, 0.07, 0.066],
    ],
    { seg: 12 },
  );
  b.bone(J.neck).paint(C.skin, { ao: 0.78, glow: 0.05 });
  b.lathe([[1.4, 0.062, 0.062], [1.52, 0.06, 0.06]], { seg: 8, cap0: false });
  b.bone(J.spine).paint(C.tealDark, { c2: C.teal });
  b.lathe([[0.93, 0.186, 0.146], [0.96, 0.172, 0.134], [1.05, 0.152, 0.12], [1.07, 0.146, 0.115]], { seg: 12 });
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 0.995, 0.132), () => b.extrude([[-0.04, 0.045], [0.04, 0.045], [0.05, 0], [0, -0.06], [-0.05, 0]], 0.02, 0.008));
  b.paint(C.jade, { glow: 0.5 });
  b.g(X(0, 1.0, 0.146, 0, 0, 45), () => b.box(0, 0, 0, 0.03, 0.03, 0.012));
  // 皮甲裙片
  b.sym(() => {
    b.bone(J.hips).paint(C.leather, { c2: C.leatherDark });
    b.g(X(0.175, 0.82, 0.02, 0, 80, -10), () => b.extrude([[-0.1, 0.1], [0.1, 0.1], [0.08, -0.1], [0, -0.16], [-0.08, -0.1]], 0.025, 0.01));
  });
  // 斜挎的箭筒背带
  b.bone(J.chest).paint(C.leatherDark);
  b.tube([[-0.19, 1.34, 0.06, 0.03, 0.012], [-0.06, 1.24, 0.155, 0.03, 0.012], [0.1, 1.12, 0.14, 0.03, 0.012], [0.16, 1.06, 0.05, 0.03, 0.012]], { seg: 4, up: [0, 0.6, 0.8] });

  // ── 手臂：米白衣袖 + 皮护臂(持弓的左臂更长)，队伍色臂带 ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.cream, { c2: C.creamShade });
    b.ball(x, d.shoulderY, 0, 0.08, 0.08, 0.08, 1);
    b.limb([x, d.shoulderY, 0], [x, d.elbowY, 0], 0.074, 0.062, { seg: 8 });
    b.paint(0xffffff, { team: 1 });
    trim(b, x, d.shoulderY - 0.16, 0, 0.074, 0.074, 0.012, 0.032, 8);
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.cream, { c2: C.creamShade });
    b.ball(x, d.elbowY, 0, 0.064, 0.064, 0.064, 1);
    b.limb([x, d.elbowY, 0], [x, d.wristY, 0], 0.06, 0.054, { seg: 8 });
    b.paint(C.leather, { c2: C.leatherDark });
    const top = s > 0 ? 0.22 : 0.14;
    b.lathe([[d.wristY - 0.01, 0.064, 0.064, x, 0], [d.wristY + 0.03, 0.074, 0.074, x, 0], [d.wristY + top, 0.076, 0.076, x, 0], [d.wristY + top + 0.012, 0.064, 0.064, x, 0]], { seg: 8 });
    b.paint(C.gold, { gloss: 1 });
    trim(b, x, d.wristY + top, 0, 0.078, 0.078, 0.01, 0.014, 8);
  });
  b.paint(C.leatherDark, { c2: C.leather });
  fist(b, h, 1, 0.056);
  fist(b, h, -1, 0.056);

  // ── 斗篷：罩肩短披 + 脑后放下的兜帽 + 两条羽尾 ──
  b.bone(J.chest).paint(C.tealDark, { c2: C.teal, ao: 0.9 });
  b.lathe(
    [
      [1.22, 0.33, 0.25],
      [1.26, 0.325, 0.245],
      [1.37, 0.215, 0.17],
      [1.425, 0.13, 0.115],
      [1.46, 0.105, 0.1],
    ],
    { seg: 14, cap0: false, cap1: false, shape: (a, k) => (k === 0 ? 1 + 0.07 * Math.sin(a * 7) : 1) },
  );
  // 披肩下缘的队伍色滚边
  b.paint(0xffffff, { team: 1 });
  b.lathe([[1.2, 0.338, 0.256], [1.215, 0.345, 0.262], [1.245, 0.34, 0.258]], { seg: 14, cap0: false, cap1: false, shape: (a) => 1 + 0.07 * Math.sin(a * 7) });
  // 兜帽：堆在后颈的一团
  b.paint(C.teal, { c2: C.tealLight });
  b.ball(0, 1.46, -0.13, 0.17, 0.11, 0.14, 1);
  b.g(X(0, 1.47, 0.0, 10, 0, 0, 1, 1, 0.92), () => b.torus(0.125, 0.045, 0.05, 12, 5));
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 1.4, 0.125), () => b.extrude([[-0.03, 0.03], [0.03, 0.03], [0, -0.05]], 0.02, 0.006));
  for (const [t, sgn] of [[tailL, 1], [tailR, -1]] as [number[], number][]) {
    const pts = tailPts(sgn);
    b.bind(chainBind(t, pts, J.chest)).paint(C.teal, { c2: C.tealDark });
    // 羽尾：上宽下尖，像一片长翎
    strip(b, pts, { width: (v) => lerp(0.13, 0.02, Math.pow(v, 1.6)) + 0.05 * Math.sin(v * Math.PI), axis: [1, 0, sgn * 0.3], bow: [0, 0, -0.03], nu: 3, nv: 8, tail: 'flat', wave: 0.3 });
    b.paint(C.tealLight, { c2: C.teal });
    strip(b, pts.map((p) => [p[0], p[1], p[2] - 0.012]), { width: (v) => 0.016 * (1 - v * 0.6), axis: [1, 0, sgn * 0.3], nu: 1, nv: 8, tail: 'flat' });
  }

  // ── 箭筒 ──
  b.bone(J.chest);
  b.g(X(-0.1, 1.18, -0.2, -8, 0, 22), () => {
    b.paint(C.leather, { c2: C.leatherDark });
    b.lathe([[-0.3, 0.06], [-0.26, 0.075], [0.2, 0.085], [0.22, 0.07]], { seg: 8 });
    b.paint(C.gold, { gloss: 1 });
    trim(b, 0, 0.2, 0, 0.086, 0.086, 0.01, 0.016, 8);
    trim(b, 0, -0.22, 0, 0.078, 0.078, 0.01, 0.016, 8);
    // 露出筒口的羽箭
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      const ox = Math.cos(a) * 0.04;
      const oz = Math.sin(a) * 0.04;
      b.paint(C.woodShade);
      b.tube([[ox, 0.15, oz, 0.008], [ox * 1.3, 0.46, oz * 1.3, 0.008]], { seg: 4 });
      b.paint(i % 2 ? C.cream : C.tealLight);
      b.g(X(ox * 1.3, 0.4, oz * 1.3, 0, i * 50, 0), () => {
        b.extrude([[0, -0.08], [0.04, -0.05], [0.04, 0.05], [0, 0.08]], 0.006, 0);
        b.g(X(0, 0, 0, 0, 90, 0), () => b.extrude([[0, -0.08], [0.04, -0.05], [0.04, 0.05], [0, 0.08]], 0.006, 0));
      });
    }
  });

  // ── 头：浅金发，刘海斜分，左肩一条侧辫，耳后一支翠羽 ──
  const hd = head(b, h, C.skin, 0.97);
  face(b, h, hd, { iris: 0x2fb886, irisGlow: 0.2, brow: 0xc9a85a, browTilt: 6, eyeW: 0.054, eyeH: 0.046, slant: 6, lash: 0.015, lip: 0xd9807a });
  hairCap(b, h, hd, {
    c: C.hair,
    c2: C.hairTip,
    thick: 0.028,
    line: (phi) => (phi < 0.9 ? 0.15 : phi < 1.4 ? mix(0.15, -0.1, (phi - 0.9) / 0.5) : -0.3),
    gloss: 0.4,
  });
  const cy = hd.cy;
  b.paint(C.hair, { c2: C.hairTip, gloss: 0.4 });
  // 斜刘海：从右上扫向左下的三片
  for (const [x0, x1, len] of [[-0.12, -0.2, 0.14], [-0.02, -0.11, 0.17], [0.07, 0.0, 0.15], [0.15, 0.13, 0.12]]) {
    const y = cy + 0.165;
    b.tube([[x0, y + 0.05, hd.surf(x0, y + 0.05) - 0.01, 0.055, 0.02], [(x0 + x1) / 2, y - len * 0.4, hd.surf((x0 + x1) / 2, y - len * 0.4) + 0.016, 0.05, 0.02], [x1, y - len, hd.surf(x1, y - len) + 0.012, 0.01, 0.008]], { seg: 5, up: [1, 0, 0] });
  }
  b.tube([[-0.2, cy + 0.06, 0.07, 0.035, 0.04], [-0.24, cy - 0.1, 0.07, 0.03, 0.035], [-0.22, cy - 0.26, 0.09, 0.008, 0.01]], { seg: 6 });
  // 侧辫(弹簧链)：一节一节的麻花
  b.bind(chainBind(braid, braidPts, J.head)).paint(C.hair, { c2: C.hairTip, gloss: 0.4 });
  const bp: number[][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const k = braidPts.length - 1;
    const f = t * k;
    const j = Math.min(k - 1, Math.floor(f));
    const u = f - j;
    const r = 0.055 * (1 - t * 0.35) * (1 + 0.28 * Math.abs(Math.sin(t * Math.PI * 5)));
    bp.push([lerp(braidPts[j][0], braidPts[j + 1][0], u), lerp(braidPts[j][1], braidPts[j + 1][1], u), lerp(braidPts[j][2], braidPts[j + 1][2], u), r]);
  }
  bp.push([0.2, 0.92, 0.16, 0.01]);
  b.tube(bp, { seg: 6 });
  b.paint(C.teal);
  b.ball(0.212, 1.02, 0.158, 0.05, 0.035, 0.05, 1);
  // 耳后的翠羽
  b.bone(J.head).paint(C.teal, { c2: C.tealLight, glow: 0, glow2: 0.25 });
  b.g(X(-0.21, cy + 0.08, -0.06, -30, -70, 24), () => b.extrude([[0, -0.03], [0.05, 0.06], [0.04, 0.2], [0, 0.34], [-0.04, 0.2], [-0.05, 0.06]], 0.012, 0.004));

  // ── 长弓(左手)：握把在手心，弓臂沿 ±Z，弓背朝 −Y，弦在 +Y 一侧 ──
  const limbPath = (sgn: number, from: number, to: number): number[][] => {
    const out: number[][] = [];
    for (let i = 0; i <= 6; i++) {
      const t = lerp(from, to, i / 6);
      const z = sgn * (0.06 + t * 0.94);
      // 反曲：中段向前鼓，弓梢再向后勾
      const y = -0.04 + 0.2 * t * t + 0.06 * Math.pow(t, 6);
      const w = lerp(0.03, 0.018, t);
      out.push([0, y, z, lerp(0.022, 0.012, t), w]);
    }
    return out;
  };
  b.g(X(gx, gy, 0), () => {
    b.bone(J.propL).paint(C.leather, { c2: C.leatherDark });
    b.tube([[0, -0.04, -0.1, 0.026, 0.03], [0, -0.045, 0, 0.03, 0.034], [0, -0.04, 0.1, 0.026, 0.03]], { seg: 6 });
    b.paint(C.gold, { gloss: 1 });
    b.g(X(0, -0.04, 0.1, 90, 0, 0), () => b.torus(0.03, 0.01, 0.014, 6, 4, { crease: 30 }));
    b.g(X(0, -0.04, -0.1, 90, 0, 0), () => b.torus(0.03, 0.01, 0.014, 6, 4, { crease: 30 }));
    for (const sgn of [1, -1]) {
      const limb = sgn > 0 ? bowUp : bowDn;
      // 弓臂根部一小段跟握把，其余跟弓臂关节
      b.bind((_x, _y, z) => {
        const t = sat((Math.abs(z) - 0.1) / 0.14);
        return [limb, J.propL, t];
      });
      b.paint(C.wood, { c2: C.woodShade, gloss: 0.4 });
      b.tube(limbPath(sgn, 0, 1), { seg: 6, up: [1, 0, 0] });
      // 弓梢的翠色风纹(发光)
      b.bone(limb).paint(C.jade, { glow: 0.5, c2: 0xb6ffe0 });
      const tip = limbPath(sgn, 0.72, 1.0).map((p) => [p[0], p[1] - 0.004, p[2], p[3] * 1.25, p[4] * 1.4]);
      b.tube(tip, { seg: 4, up: [1, 0, 0], crease: 0 });
      b.g(X(0, 0.22, sgn * 1.0, sgn > 0 ? 60 : 120, 0, 0), () => b.crystal(0.022, 0.1, 4, 0.7, 0.2));
    }
    // 弓弦：两端跟弓梢，中点跟搭箭点
    const sb: SoftBind = (_x, _y, z) => {
      const t = sat(Math.abs(z) / 0.98);
      return [z >= 0 ? bowUp : bowDn, nock, t];
    };
    b.bind(sb).paint(0xe8fff4, { glow: 0.25, line: 0 });
    const sp: number[][] = [];
    for (let i = 0; i <= 8; i++) sp.push([0, 0.2, lerp(-0.98, 0.98, i / 8), 0.005]);
    b.tube(sp, { seg: 3, up: [1, 0, 0] });
    // 箭：平时缩到看不见，拉弓时出现在弦上，箭头朝 −Y(目标方向)
    b.bone(arrow).paint(C.woodShade);
    b.tube([[0, 0.2, 0, 0.009], [0, -0.72, 0, 0.009]], { seg: 4 });
    b.paint(0xdff8ee, { gloss: 1, glow: 0.3 });
    b.g(X(0, -0.72, 0, 180, 0, 0), () => b.crystal(0.03, 0.13, 4, 0.75, 0.05));
    b.paint(C.tealLight);
    for (let i = 0; i < 3; i++) b.g(X(0, 0.12, 0, 0, i * 120, 0), () => b.extrude([[0, -0.07], [0.045, -0.04], [0.045, 0.05], [0, 0.07]], 0.006, 0));
  });

  b.bakeGrounding(2.05, 0.75, 0.9);
  return { h, b, extra: { bowUp, bowDn, nock, arrow } };
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 2.7, stance: 0.33, lift: 0.3, bob: 0.05, drop: 0.05, lean: 15, twist: 9, width: 0.11, arm: 0 };

interface Anims {
  stance: CKP;
  aim: CKP;
  aimUp: CKP;
  tmp: CKP;
  runArms: CKP;
  tuck: CKP;
  channel: CKP;
  common: CommonAnims;
}

function makeAnims(h: Human): Anims {
  // 站姿：重心放在后脚，长弓竖握在身侧，右手自然垂在箭筒一侧
  const stance = kp(h, null, {
    hipsPos: [0, -0.02, 0],
    hips: [0, -14, -3],
    spine: [0, 6, 2],
    chest: [-2, 6, 0],
    head: [-2, 6, 0],
    footL: [0.12, 0.09, 0.1, 0, 4],
    footR: [-0.13, 0.09, -0.08, 0, -30],
    armL: [-16, 0, 14],
    foreL: [-28, 0, 0],
    propL: [-44, 0, 14],
    armR: [6, 0, -14],
    foreR: [-26, 0, 0],
  });
  // 瞄准：侧身，左臂平举指向目标，弓竖直
  const aim = kp(h, null, {
    hipsPos: [0, -0.05, 0],
    hips: [0, -44, 0],
    spine: [0, -16, 0],
    chest: [-2, -22, 0],
    neck: [0, 34, 0],
    head: [0, 42, 0],
    footL: [0.08, 0.09, 0.24, 0, -24],
    footR: [-0.1, 0.09, -0.2, 0, -78],
    armL: [0, 6, 88],
    foreL: [0, 0, 0],
    propL: [0, 90, 0],
  });
  // 仰射(大招)：上身后仰，弓指向天空
  const aimUp = kp(h, aim, {
    hipsPos: [0, -0.1, -0.04],
    spine: [0, -16, -14],
    chest: [-2, -22, -24],
    neck: [-10, 34, 10],
    head: [-24, 42, 0],
    armL: [0, 6, 132],
  });
  const runArms = kp(h, null, { armL: [-22, 0, 16], foreL: [-52, 0, 0], propL: [-30, 0, 20], armR: [0, 0, -12], foreR: [-70, 0, 0] });
  // 逐风步：团身翻跃
  const tuck = kp(h, null, {
    hipsPos: [0, -0.1, 0],
    hips: [30, 0, 0],
    spine: [20, 0, 0],
    chest: [16, 0, 0],
    head: [20, 0, 0],
    footL: [0.1, 0.42, 0.12, 30, 0],
    footR: [-0.1, 0.36, 0.0, 40, 0],
    armL: [-40, 0, 34],
    foreL: [-70, 0, 0],
    propL: [-20, 0, 30],
    armR: [-30, 0, -30],
    foreR: [-90, 0, 0],
  });
  const channel = kp(h, stance, { hipsPos: [0, -0.16, 0], hips: [6, -14, 0], chest: [6, 6, 0], head: [12, 6, 0], armL: [-40, 0, 8], foreL: [-40, 0, 0], propL: [-10, 0, 0], armR: [-30, 0, -8], foreR: [-80, 30, 0] });
  const common = makeCommon(h, stance, { limp: { propL: [-30, 0, 20] }, lying: { armL: [-6, 0, 70], propL: [0, 0, 60] } });
  return { stance, aim, aimUp, tmp: emptyCKP(h), runArms, tuck, channel, common };
}

const _sv = new Float32Array(8);

/** q[o..] = nlerp(from[fo..], q[o..], w) */
function mixQ(q: Float32Array, o: number, from: Float32Array, fo: number, w: number): void {
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

export function createFengling(): ModelDef {
  const { h, b, extra } = build();
  const A = makeAnims(h);
  const J = h.J;
  const k = A.tmp;
  const geometry = b.build();

  /**
   * 一次完整的射击：举弓搭箭 → 拉满 → 撒放(release 时刻) → 弓弦回弹、手向后带 → 收弓。
   * p 为动作进度，release 为撒放时刻，depth 为拉弓深度，target 为瞄准姿态。
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
      const d = seg(p, release * 0.3, release * 0.95);
      pull = depth * (1 - (1 - d) * (1 - d));
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
        reachHand(h, pose, -1, extra.nock, 0, 0.06, 0, -0.3, 0.5, -0.9);
        if (grip < 1) {
          mixQ(q, J.armR * 4, _sv, 0, grip);
          mixQ(q, J.foreR * 4, _sv, 4, grip);
        }
      } else {
        // 撒放后的随势：右手顺着箭的反方向甩开
        const f = seg(p, release, release + 0.16);
        const back = 0.5 + 0.35 * f;
        reachHand(h, pose, -1, extra.nock, 0.02, back * w + 0.06, 0.04 * f, -0.3, 0.5, -0.9);
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
          pose.rot(J.armL, e[J.armL * 3] + sw * 8, 0, e[J.armL * 3 + 2]);
          pose.rot(J.foreL, e[J.foreL * 3], 0, 0);
          pose.rot(J.propL, e[J.propL * 3] + sw * 4, 0, e[J.propL * 3 + 2]);
          pose.rot(J.armR, e[J.armR * 3] - sw * 34, 0, e[J.armR * 3 + 2]);
          pose.rot(J.foreR, e[J.foreR * 3] - sw * 14, 0, 0);
        });
        break;
      }
      case 'attack': {
        const g = shoot(pose, strikeWarp(a.p, a.windup), 0.35, 0.46, A.aim);
        out.glow = 1 + g * ((a.mode & 1) !== 0 ? 2.2 : 0.9);
        break;
      }
      case 'cast_s1': {
        // 贯风矢：出手点在施法动作的 40% 处，拉得更满
        const g = shoot(pose, a.p, 0.4, 0.56, A.aim);
        out.glow = 1 + g * 2.4;
        break;
      }
      case 'cast_ult': {
        const g = shoot(pose, a.p, 0.4, 0.54, A.aimUp);
        out.glow = 1 + g * 2.6;
        break;
      }
      case 'cast_s2':
      case 'dash': {
        applyCKP(h, pose, A.tuck, () => {
          // 整个人团身前翻一圈，离地划一道弧
          const p = a.anim === 'dash' ? a.p : 0;
          pose.rot(J.root, 360 * p, 0, 0);
          pose.pos(J.root, 0, 0.55 * Math.sin(p * Math.PI) + 0.45 * (1 - Math.cos(p * Math.PI * 2)) * 0.5, 0);
        });
        out.glow = 1.8;
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
          breathe(h, pose, a.time, a.seed);
          pose.add(J.propL, Math.sin(a.time * 1.1) * 2, 0, 0);
          pose.add(J.hips, 0, 0, Math.sin(a.time * 0.8 + a.seed * 4) * 1.5);
        });
        out.glow = 1 + 0.12 * Math.sin(a.time * 2.6);
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
