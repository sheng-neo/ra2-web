/**
 * 樊哙 · 坦克：魁梧的汉初猛将。玄铁札甲 + 方片披膊 + 赭红战裙，须发戟张、络腮虬髯、怒目；
 * 左臂一面黑漆朱纹的双弧大盾(上缘两道圆弧、中间起尖)，右手一柄汉剑。
 * 俯视识别三要素：全场最大的身板、身前的黑漆大盾、向后上方炸开的发束与大胡子。动作沉重。
 * 造型依据只有《史记》鸿门宴一段(带剑拥盾、头发上指、目眦尽裂)与汉初甲胄、漆盾的一般形制。
 */
import { type CKP, type CommonAnims, E, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, type TrackKey, animateCommon, applyCKP, breathe, bump, emptyCKP, humanRig, kp, makeCommon, mix, runCycle, sampleTrack, sat, strikeWarp, track } from '../humanoid';
import { MAT, ModelBuilder, PATTERN, X, lerp } from '../kit';
import { beard, chainBind, face, hairCap, hand, head, lock, strip, torsoBind } from '../parts';
import type { Pose } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  iron: 0x4a5360,
  ironLight: 0x7c8898,
  ironDark: 0x343b46,
  bronze: 0xd9a441,
  bronzeDark: 0x94692a,
  lacquer: 0x1b181d,
  lacquerHi: 0x3a3440,
  red: 0xa8302a,
  redDark: 0x6e1f1c,
  cloth: 0x7a4e30,
  clothDark: 0x543422,
  clothLight: 0x9a6a42,
  skirt: 0x8c3b2a,
  skirtDark: 0x5c2319,
  steel: 0xc9d2da,
  steelDark: 0x7c8894,
  skin: 0xd9a67c,
  hair: 0x221c1c,
  hairHi: 0x3d3230,
  leather: 0x4c3628,
  leatherDark: 0x2c1f18,
  amber: 0xffc35a,
};

const DIMS: HumanDims = {
  ankleY: 0.11, kneeY: 0.42, hipY: 0.76, hipX: 0.19, pelvisY: 0.8, spineY: 0.98, chestY: 1.2, neckY: 1.54, headY: 1.56,
  clavX: 0.16, shoulderX: 0.47, shoulderY: 1.43, elbowY: 1.06, wristY: 0.73, handY: 0.61,
};

const SCALE = 1.36;
const DEG = Math.PI / 180;

/** 盾的尺寸：全高 / 半宽 / 握带(前臂)到盾中心的距离(盾心在握带下方，举起时盾顶不挡脸) / 弧面深度 */
const SH = { h: 1.45, w: 0.45, grip: 0.24, curve: 0.11 };

interface Extra {
  shield: number;
  mane: number[];
}

/**
 * 一排札甲片：绕竖轴的一段弧面。每片两列——片心列鼓出、片缝列收进并在下缘上提，
 * 所以下缘是一排圆角甲片，片与片之间有竖向的凹缝。a0/a1 为角度范围(度，0 = +X，90 = +Z)，整圈时只生成外表面。
 */
function plates(
  b: ModelBuilder,
  o: { cx?: number; cz?: number; yTop: number; yBot: number; top: [number, number]; bot: [number, number]; a0?: number; a1?: number; n: number; scallop?: number; groove?: number; lip?: number; double?: boolean },
): void {
  const a0 = o.a0 ?? 0;
  const a1 = o.a1 ?? 360;
  const nu = o.n * 2;
  const scallop = o.scallop ?? 0.016;
  const groove = o.groove ?? 0.012;
  const lip = o.lip ?? 0.014;
  b.sheet(
    nu,
    2,
    (u, v) => {
      const i = Math.round(u * nu);
      const seam = i % 2 === 0;
      const a = (a0 + (a1 - a0) * u) * DEG;
      const out = (seam ? -groove : 0) + (v > 0.4 ? lip * (v > 0.9 ? 1 : 0.7) : 0);
      const rx = lerp(o.top[0], o.bot[0], v) + out;
      const rz = lerp(o.top[1], o.bot[1], v) + out;
      const y = lerp(o.yTop, o.yBot, v) + (v > 0.9 && seam ? scallop : 0);
      return [(o.cx ?? 0) + Math.cos(a) * rx, y, (o.cz ?? 0) + Math.sin(a) * rz];
    },
    o.double ?? false,
    34,
  );
}

function build(): { h: Human; b: ModelBuilder; extra: Extra } {
  const h = humanRig(DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();
  b.crease = 36;

  // ── 附加关节与弹簧链 ──
  const shield = rig.add('shield', J.foreL, d.shoulderX + 0.17, 0.9, 0.03);
  const frontPts = [[0, 0.86, 0.285], [0, 0.64, 0.31], [0, 0.44, 0.315], [0, 0.27, 0.315]];
  const front = rig.addChain('tab', J.hips, frontPts.slice(0, 3));
  rig.chain({ joints: front, tip: [0, -0.17, 0], stiffness: 9, drag: 0.85, gravity: 10, maxAngle: 45 });
  const backPts = [[0, 0.86, -0.27], [0, 0.62, -0.31], [0, 0.4, -0.32], [0, 0.22, -0.32]];
  const back = rig.addChain('tail', J.hips, backPts.slice(0, 3));
  rig.chain({ joints: back, tip: [0, -0.18, 0], stiffness: 8, drag: 0.86, gravity: 10, maxAngle: 50 });
  // 头顶炸开的发束：两节硬链，跃起下落时整体上扬
  const hs = 1.12;
  const hcy = d.headY + 0.25 * hs;
  const manePts = [[0, hcy + 0.2 * hs, -0.06], [0, hcy + 0.4 * hs, -0.2], [0, hcy + 0.58 * hs, -0.36]];
  const mane = rig.addChain('mane', J.head, manePts.slice(0, 2));
  rig.chain({ joints: mane, tip: [0, 0.2, -0.16], stiffness: 16, drag: 0.8, gravity: 3, maxAngle: 26, wind: 0.8 });

  // ── 腿：粗布裤 + 皮绑腿 + 方头靴 ──
  b.sym((s) => {
    const x = d.hipX;
    b.bone(s > 0 ? J.thighL : J.thighR).paint(C.clothDark, { c2: C.cloth, ao: 0.85, ao2: 1, mat: MAT.cloth });
    b.limb([x, d.hipY + 0.06, 0], [x, d.kneeY - 0.02, 0], 0.19, 0.155, { seg: 7 });
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.leatherDark, { c2: C.leather, gloss: 0.2, mat: MAT.leather });
    b.lathe([[d.ankleY - 0.01, 0.135, 0.145, x, 0], [0.22, 0.156, 0.168, x, -0.008], [0.44, 0.158, 0.16, x, 0], [0.47, 0.12, 0.12, x, 0]], { seg: 8 });
    // 绑腿的两道缠带与膝下的铜扣
    b.paint(C.clothLight, { c2: C.cloth, mat: MAT.cloth });
    for (const y of [0.17, 0.29]) b.lathe([[y, 0.158, 0.168, x, -0.006], [y + 0.035, 0.162, 0.171, x, -0.006]], { seg: 8, cap0: false, cap1: false });
    b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
    b.ball(x, 0.43, 0.15, 0.04, 0.045, 0.025, 0);
    b.bone(s > 0 ? J.footL : J.footR).paint(0x1d1612, { c2: C.leatherDark, gloss: 0.25, mat: MAT.leather });
    b.tube([[x, 0.07, -0.17, 0.12, 0.07], [x, 0.09, -0.02, 0.15, 0.09], [x, 0.08, 0.22, 0.16, 0.08], [x, 0.07, 0.35, 0.14, 0.055]], { seg: 8, power: 3.2, up: [1, 0, 0] });
  });

  // ── 躯干：粗布短衣打底 ──
  const prof: number[][] = [
    [0.64, 0.2, 0.17],
    [0.74, 0.33, 0.26],
    [0.9, 0.345, 0.275],
    [1.0, 0.335, 0.272],
    [1.14, 0.385, 0.3],
    [1.3, 0.43, 0.325],
    [1.42, 0.415, 0.3],
    [1.5, 0.29, 0.23],
    [1.57, 0.15, 0.14],
  ];
  const R = (y: number): [number, number] => {
    for (let i = 1; i < prof.length; i++) {
      if (y <= prof[i][0]) {
        const t = sat((y - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]));
        return [lerp(prof[i - 1][1], prof[i][1], t), lerp(prof[i - 1][2], prof[i][2], t)];
      }
    }
    return [prof[prof.length - 1][1], prof[prof.length - 1][2]];
  };
  const grow = (r: [number, number], k: number): [number, number] => [r[0] + k, r[1] + k];
  b.bind(torsoBind(h)).paint(C.clothDark, { c2: C.cloth, ao: 0.85, ao2: 1, mat: MAT.cloth });
  b.lathe(prof, { seg: 12 });
  // 交领：露在甲上的一圈衣领
  b.bone(J.chest).paint(C.clothLight, { c2: C.cloth, mat: MAT.cloth });
  b.g(X(0, 1.535, 0.01, 14, 0, 0, 1, 1, 0.92), () => b.torus(0.17, 0.05, 0.04, 10, 4));
  b.bone(J.neck).paint(C.skin, { ao: 0.72, glow: 0.05, mat: MAT.skin });
  b.lathe([[1.5, 0.125, 0.125], [1.66, 0.118, 0.122]], { seg: 9, cap0: false });

  // ── 玄铁札甲：四排甲片自上而下层层压住，每排上缘一道朱红甲绦 ──
  const tiers: [number, number, number][] = [
    [1.475, 1.3, J.chest],
    [1.325, 1.165, J.chest],
    [1.185, 1.045, J.spine],
    [1.065, 0.94, J.spine],
  ];
  tiers.forEach(([yt, yb, bone], i) => {
    b.bone(bone).paint(C.ironDark, { c2: C.ironLight, gloss: 0.4, ao: 0.7, ao2: 1, mat: MAT.metal, pattern: PATTERN.scale, patternScale: 9, patternAmt: 0.25 });
    plates(b, { yTop: yt, yBot: yb, top: grow(R(yt), i === 0 ? 0.012 : 0.02), bot: grow(R(yb), 0.03), n: 8 });
    if (i > 0) {
      b.paint(C.red, { c2: C.redDark, mat: MAT.cloth });
      const r = grow(R(yt - 0.012), 0.034);
      b.lathe([[yt - 0.026, r[0], r[1]], [yt - 0.004, r[0], r[1]]], { seg: 12, cap0: false, cap1: false });
    }
  });
  // ── 宽革带 + 青铜兽面带扣 ──
  b.bone(J.spine).paint(C.leather, { c2: C.leatherDark, gloss: 0.2, mat: MAT.leather });
  {
    const r0 = grow(R(0.89), 0.04);
    const r1 = grow(R(0.99), 0.04);
    b.lathe([[0.875, r0[0] - 0.012, r0[1] - 0.012], [0.89, r0[0], r0[1]], [0.99, r1[0], r1[1]], [1.005, r1[0] - 0.012, r1[1] - 0.012]], { seg: 12 });
  }
  b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
  b.g(X(0, 0.94, R(0.94)[1] + 0.045), () => {
    // 兽面：圆角方牌 + 突出的眉弓与鼻 + 下方衔环
    b.g(X(0, 0, 0, 0, 0, 0), () => b.extrude([[-0.085, 0.07], [0.085, 0.07], [0.1, 0.0], [0.06, -0.075], [-0.06, -0.075], [-0.1, 0.0]], 0.04, 0.016));
    b.paint(C.bronzeDark, { c2: C.bronze, gloss: 1, mat: MAT.metal });
    b.sym(() => b.g(X(0.042, 0.022, 0.024, 0, 0, 18), () => b.box(0, 0, 0, 0.06, 0.022, 0.02)));
    b.ball(0, -0.012, 0.026, 0.02, 0.034, 0.016, 0);
    b.paint(C.bronze, { gloss: 1, mat: MAT.metal });
    b.g(X(0, -0.085, 0.02, 90, 0, 0), () => b.torus(0.042, 0.012, 0.012, 6, 3, { crease: 30 }));
  });

  // ── 战裙：前后两片赭红布(队伍色镶边)，两胯各两排甲裙 ──
  const skirtPiece = (joints: number[], pts: number[][], w0: number, w1: number, bow: number, tail: number): void => {
    b.bind(chainBind(joints, pts, J.hips)).paint(0xffffff, { team: 1, mat: MAT.cloth });
    const edge = pts.map((p) => [p[0], p[1], p[2] - Math.sign(bow) * 0.006]);
    strip(b, edge, { width: (v) => mix(w0, w1, v) + 0.026, bow: [0, 0, bow], nu: 2, nv: 5, tail: 'swallow', tailLen: tail + 0.03 });
    b.paint(C.skirt, { c2: C.skirtDark, mat: MAT.cloth, pattern: PATTERN.weave, patternScale: 14, patternAmt: 0.2 });
    strip(b, pts, { width: (v) => mix(w0, w1, v), bow: [0, 0, bow], nu: 4, nv: 5, tail: 'swallow', tailLen: tail });
  };
  skirtPiece(front, frontPts, 0.15, 0.125, 0.03, 0.1);
  skirtPiece(back, backPts, 0.2, 0.165, -0.03, 0.12);
  b.sym(() => {
    b.bone(J.hips).paint(C.ironDark, { c2: C.ironLight, gloss: 0.4, ao: 0.75, ao2: 1, mat: MAT.metal, pattern: PATTERN.scale, patternScale: 9, patternAmt: 0.25 });
    plates(b, { yTop: 0.9, yBot: 0.72, top: [0.36, 0.29], bot: [0.4, 0.32], a0: -62, a1: 62, n: 3 });
    plates(b, { yTop: 0.75, yBot: 0.56, top: [0.375, 0.3], bot: [0.42, 0.335], a0: -56, a1: 56, n: 3 });
    b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
    b.tube([-56, 0, 56].map((a) => [Math.cos(a * DEG) * 0.436, 0.558, Math.sin(a * DEG) * 0.35, 0.016, 0.014]), { seg: 4, up: [0, 1, 0] });
  });

  // ── 手臂：粗布袖 + 皮护臂 ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.cloth, { c2: C.clothDark, ao: 0.85, ao2: 1, mat: MAT.cloth });
    b.limb([x, d.shoulderY + 0.06, 0], [x, d.elbowY - 0.03, 0], 0.16, 0.14, { seg: 7 });
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.clothDark, { c2: C.cloth, mat: MAT.cloth });
    // 袖子到前臂中段，袖口外翻一圈
    b.lathe([[d.wristY + 0.19, 0.15, 0.15, x, 0], [d.wristY + 0.21, 0.153, 0.153, x, 0], [d.elbowY + 0.05, 0.14, 0.14, x, 0]], { seg: 8 });
    b.paint(C.leather, { c2: C.leatherDark, gloss: 0.2, mat: MAT.leather });
    b.lathe([[d.wristY - 0.005, 0.112, 0.112, x, 0], [d.wristY + 0.03, 0.128, 0.128, x, 0], [d.wristY + 0.2, 0.138, 0.138, x, 0]], { seg: 8, cap1: false });
    b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
    for (const y of [d.wristY + 0.02, d.wristY + 0.15]) b.lathe([[y, 0.136, 0.136, x, 0], [y + 0.016, 0.146, 0.146, x, 0], [y + 0.032, 0.14, 0.14, x, 0]], { seg: 8, cap0: false, cap1: false, crease: 30 });
  });
  b.paint(C.skin, { glow: 0.05, ao: 0.9, mat: MAT.skin });
  hand(b, h, 1, 0.1);
  hand(b, h, -1, 0.1);

  // ── 披膊：每肩三层叠瓦甲片向外翘，铜包边，下缘一圈队伍色布边 ──
  b.sym((s) => {
    const clav = s > 0 ? J.clavL : J.clavR;
    const arm = s > 0 ? J.armL : J.armR;
    const cx = d.shoulderX + 0.01;
    const ironPaint = (): void => {
      b.paint(C.ironDark, { c2: C.ironLight, gloss: 0.4, ao: 0.72, ao2: 1, mat: MAT.metal, pattern: PATTERN.scale, patternScale: 8, patternAmt: 0.25 });
    };
    // 肩头：一块盖住肩关节的弧形甲
    b.bone(clav);
    ironPaint();
    b.g(X(cx - 0.03, 1.565, 0, 0, 0, -10), () => b.ball(0, 0, 0, 0.2, 0.085, 0.215, 1, 40));
    plates(b, { cx, yTop: 1.59, yBot: 1.455, top: [0.15, 0.2], bot: [0.255, 0.27], a0: -112, a1: 112, n: 3, lip: 0.018, double: true });
    b.bone(arm);
    ironPaint();
    plates(b, { cx, yTop: 1.49, yBot: 1.345, top: [0.225, 0.245], bot: [0.3, 0.295], a0: -106, a1: 106, n: 3, lip: 0.018 });
    plates(b, { cx, yTop: 1.38, yBot: 1.225, top: [0.25, 0.26], bot: [0.325, 0.31], a0: -100, a1: 100, n: 3, lip: 0.02 });
    // 铜包边
    b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
    b.tube([-100, -50, 0, 50, 100].map((a) => [cx + Math.cos(a * DEG) * 0.342 * (a === 0 ? 1 : 1.03), 1.222, Math.sin(a * DEG) * 0.327 * 1.03, 0.018, 0.015]), { seg: 4, up: [0, 1, 0] });
    // 布边(队伍色)
    b.paint(0xffffff, { team: 1, mat: MAT.cloth });
    b.sheet(6, 1, (u, v) => {
      const a = lerp(-96, 96, u) * DEG;
      const r = lerp(0.325, 0.345, v);
      return [cx + Math.cos(a) * r, lerp(1.215, 1.13, v) + (Math.round(u * 6) % 2 === 0 ? 0 : -0.012) * v, Math.sin(a) * r * 0.95];
    });
  });

  // ── 头：怒目、虬髯、上指的发束 ──
  const hd = head(b, h, C.skin, hs, 0.25, 1.1);
  face(b, h, hd, {
    iris: 0x2e1c12, irisGlow: 0.04, irisSize: 0.5, brow: C.hair, browTilt: 22, browH: 0.034, browLen: 1.12, eyeW: 0.056, eyeH: 0.05, slant: 3, lash: 0.016,
    lip: 0x6c3226, skin: C.skin, nose: 1.25, ears: true, mouthW: 1.25, smile: -0.7, open: 0.5, lite: true,
  });
  hairCap(b, h, hd, {
    c: C.hair,
    c2: C.hairHi,
    thick: 0.03,
    gloss: 0,
    line: (phi) => (phi < 0.9 ? 0.168 - 0.02 * Math.cos((phi / 0.9) * Math.PI * 0.5) : phi < 1.45 ? mix(0.168, -0.06, (phi - 0.9) / 0.55) : -0.3),
  });
  beard(b, h, hd, { c: C.hair, c2: C.hairHi, spread: 1.5, thick: 0.07, drop: 0.1, tufts: 7, len: 0.2, tuftR: 0.078, puff: 0.75, mustache: 0.15, mustacheR: 0.028, curl: 0.06, gloss: 0 });
  // 赭红额带(脑后打结，两条短带尾)
  {
    const yb = hd.cy + 0.135 * hs;
    const r = hd.ring(0.135 * hs);
    b.bone(J.head).paint(C.red, { c2: C.redDark, mat: MAT.cloth });
    b.g(X(0, yb, r[2], -7, 0, 0, 1, 1, (r[1] + 0.03) / (r[0] + 0.03)), () => b.torus(r[0] + 0.028, 0.014, 0.03, 12, 4, { crease: 30 }));
    b.ball(0, yb + 0.02, r[2] - r[1] - 0.045, 0.04, 0.035, 0.03, 0);
    b.tube([[0.03, yb + 0.01, r[2] - r[1] - 0.05, 0.03, 0.008], [0.07, yb - 0.1, r[2] - r[1] - 0.09, 0.034, 0.008], [0.08, yb - 0.2, r[2] - r[1] - 0.1, 0.012, 0.006]], { seg: 4, up: [1, 0, 0] });
    b.tube([[-0.03, yb + 0.01, r[2] - r[1] - 0.05, 0.03, 0.008], [-0.06, yb - 0.08, r[2] - r[1] - 0.1, 0.034, 0.008], [-0.1, yb - 0.16, r[2] - r[1] - 0.12, 0.012, 0.006]], { seg: 4, up: [1, 0, 0] });
  }
  // 发束：自头顶向后上方炸开(「头发上指」)。五股粗发像火焰一样扇开，中间最长
  b.bind(chainBind(mane, manePts, J.head)).paint(C.hair, { c2: C.hairHi, mat: MAT.fur });
  const crown = [0, hd.cy + 0.2 * hs, -0.05];
  const locks: [number, number, number, number][] = [
    // [侧向扇开的角度(度), 后仰, 长度, 粗细]
    [0, 0.75, 0.44, 0.125],
    [24, 0.3, 0.38, 0.11],
    [-24, 0.3, 0.38, 0.11],
    [52, 0.6, 0.3, 0.1],
    [-52, 0.6, 0.3, 0.1],
    [0, 1.7, 0.32, 0.11],
  ];
  for (const [ang, lean, len, r] of locks) {
    const sx = Math.sin(ang * DEG);
    const sy = Math.cos(ang * DEG);
    lock(b, [crown[0] + sx * 0.1, crown[1] - Math.abs(sx) * 0.05, crown[2] - lean * 0.03], [sx, sy, -lean], len, r, { curl: [sx * 0.16, -0.06, -0.34], n: 4, seg: 6, flat: 0.62, up: [1, 0, 0], tip: 0.14 });
  }
  b.bone(J.head).paint(C.hair, { c2: C.hairHi, mat: MAT.fur });
  b.ball(crown[0], crown[1] - 0.01, crown[2] - 0.02, 0.15, 0.09, 0.14, 1);

  // ── 汉剑(右手)：沿 +Z，刃宽方向为上下。铜剑首与菱形剑格，亮钢直刃 ──
  b.bone(J.propR);
  b.g(X(-d.shoulderX, d.handY, 0), () => {
    b.paint(C.leatherDark, { c2: C.redDark, gloss: 0.2, mat: MAT.leather });
    b.tube([[0, 0, -0.15, 0.027, 0.03], [0, 0, 0.07, 0.03, 0.033]], { seg: 6 });
    b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
    b.g(X(0, 0, -0.165, 90, 0, 0), () => b.lathe([[-0.014, 0.03], [0, 0.056], [0.014, 0.03]], { seg: 6, crease: 30 }));
    b.g(X(0, 0, 0.085), () => b.extrude([[0, 0.115], [0.036, 0.014], [0.036, -0.014], [0, -0.115], [-0.036, -0.014], [-0.036, 0.014]], 0.045, 0.012));
    b.paint(C.steelDark, { c2: C.steel, gloss: 1, mat: MAT.metal });
    b.tube([[0, 0, 0.1, 0.014, 0.05], [0, 0, 0.3, 0.014, 0.054], [0, 0, 0.82, 0.011, 0.046], [0, 0, 0.94, 0.007, 0.028], [0, 0, 1.02, 0.001, 0.002]], { seg: 4, up: [1, 0, 0], crease: 0 });
  });

  // ── 双弧大盾(左前臂外侧) ──
  // 盾的局部坐标：x 宽、y 长轴(举起时朝上)、z 朝外。上缘中间起尖、两侧各一道圆弧；两侧微微收腰；整面向后弧
  const topLine = [0.15, 0.045, 0.085, 0.1, 0.08, 0.02, -0.13];
  const botLine = [-0.045, -0.03, -0.012, 0, 0.012, 0.045, 0.14];
  const edgeAt = (line: number[], a: number): number => {
    const f = sat(a) * (line.length - 1);
    const i = Math.min(line.length - 2, Math.floor(f));
    return lerp(line[i], line[i + 1], f - i);
  };
  const y0 = -SH.grip - SH.h / 2 + 0.05;
  const y1 = -SH.grip + SH.h / 2 - 0.15;
  const surf = (u: number, v: number, lift = 0): number[] => {
    const a = Math.abs(u * 2 - 1);
    const hw = SH.w * (0.93 + 0.07 * Math.cos(v * Math.PI * 2));
    const x = (u * 2 - 1) * hw;
    const y = lerp(y0 + edgeAt(botLine, a), y1 + edgeAt(topLine, a), v);
    return [x, y, -SH.curve * (x / SH.w) ** 2 + lift];
  };
  /** 盾面上按「宽度比例 px(−1..1)、长轴位置 py(米)」取点 */
  const onFace = (px: number, py: number, lift: number): number[] => {
    const x = px * SH.w;
    return [x, py, -SH.curve * px * px + lift];
  };
  b.bone(shield);
  b.g(X(d.shoulderX + 0.17, 0.9, 0.03, 0, 90, 90), () => {
    // 正面：黑漆
    b.paint(C.lacquer, { c2: C.lacquerHi, gloss: 0.25, mat: MAT.leather });
    b.sheet(8, 6, (u, v) => surf(u, v, 0.02), false);
    // 背面：木胎与皮衬
    b.paint(C.leatherDark, { c2: C.leather, mat: MAT.leather, ao: 0.8 });
    b.sheet(8, 4, (u, v) => surf(1 - u, v, -0.012), false);
    // 朱漆包边：沿轮廓一圈
    const rim: number[][] = [];
    for (let i = 0; i < 8; i++) rim.push([...surf(i / 8, 0, 0.004), 0.026, 0.026]);
    for (let i = 0; i < 4; i++) rim.push([...surf(1, i / 4, 0.004), 0.026, 0.026]);
    for (let i = 0; i < 8; i++) rim.push([...surf(1 - i / 8, 1, 0.004), 0.026, 0.026]);
    for (let i = 0; i < 4; i++) rim.push([...surf(0, 1 - i / 4, 0.004), 0.026, 0.026]);
    b.paint(C.red, { c2: C.redDark, gloss: 0.4, mat: MAT.leather });
    b.tube(rim, { seg: 4, closed: true, up: [0, 0, 1], crease: 50 });
    // 队伍色竖带
    b.paint(0xffffff, { team: 1, mat: MAT.cloth, line: 0 });
    b.sheet(1, 6, (u, v) => surf(lerp(0.41, 0.59, u), lerp(0.05, 0.93, v), 0.03), false);
    // 朱红云气纹：上下各一对向内卷的勾云(贴在漆面上的浅浮雕条)
    b.paint(0xc23a2e, { gloss: 0.3, mat: MAT.leather, line: 0 });
    const cloud = (sx: number, sy: number, cy: number): void => {
      const pts = [[0.2, 0.34], [0.52, 0.36], [0.76, 0.24], [0.78, 0.07], [0.6, -0.01], [0.42, 0.05], [0.42, 0.17], [0.54, 0.2]];
      const n = pts.length - 1;
      // 单面的窄带：沿折线两侧各展开半个线宽。镜像时翻转参数方向，保证正面朝外
      b.sheet(n, 1, (u, v) => {
        const f = (sx * sy > 0 ? u : 1 - u) * n;
        const i = Math.min(n - 1, Math.floor(f));
        const t = f - i;
        const px = lerp(pts[i][0], pts[i + 1][0], t);
        const py = lerp(pts[i][1], pts[i + 1][1], t);
        const dx = pts[i + 1][0] - pts[i][0];
        const dy = pts[i + 1][1] - pts[i][1];
        const dl = Math.hypot(dx, dy) || 1;
        const w = (v - 0.5) * 0.05 * (1 - f / n * 0.5);
        return onFace(sx * (px + (-dy / dl) * w * 2.2), cy + sy * (py + (dx / dl) * w), 0.034);
      }, false);
    };
    for (const sx of [1, -1]) {
      cloud(sx, 1, -SH.grip + 0.07);
      cloud(sx, -1, -SH.grip - 0.1);
    }
    // 中央青铜盾鼻：半球 + 环，微微泛琥珀光
    b.paint(C.bronze, { c2: C.amber, gloss: 1, glow: 0.1, glow2: 0.26, mat: MAT.metal, line: 1 });
    b.ball(0, -SH.grip, 0.035, 0.115, 0.115, 0.075, 1);
    b.paint(C.bronzeDark, { c2: C.bronze, gloss: 1, mat: MAT.metal });
    b.g(X(0, -SH.grip, 0.035, 90, 0, 0), () => b.torus(0.15, 0.024, 0.02, 10, 3, { crease: 30 }));
    // 四角铜泡钉
    b.paint(C.bronze, { gloss: 1, mat: MAT.metal });
    for (const [px, py] of [[0.62, y1 - 0.1], [-0.62, y1 - 0.1], [0.62, y0 + 0.16], [-0.62, y0 + 0.16]]) {
      const p = onFace(px, py, 0.03);
      b.ball(p[0], p[1], p[2], 0.03, 0.03, 0.018, 0);
    }
  });

  b.bakeGrounding(2.1);
  return { h, b, extra: { shield, mane } };
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 2.9, stance: 0.44, lift: 0.22, bob: 0.07, drop: 0.08, lean: 10, sway: 0.06, twist: 7, width: 0.22, arm: 0 };

const CHARGE_RUN: RunStyle = { ...RUN, lean: 30, drop: 0.16, bob: 0.03, stance: 0.36, lift: 0.26 };

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
  // 站姿：两脚开立，盾护在身前左侧(斜向外，不挡住胸口)，剑尖斜指地
  const stance = kp(h, null, {
    hipsPos: [0, -0.06, 0],
    hips: [3, 14, 0],
    spine: [3, -6, 0],
    chest: [2, -8, 0],
    head: [0, -4, 0],
    footL: [0.27, 0.11, 0.14, 0, 16],
    footR: [-0.29, 0.11, -0.12, 0, -24],
    armL: [-26, 0, 20],
    foreL: [-80, -44, 0],
    armR: [-6, 0, -16],
    foreR: [-24, 0, 0],
    propR: [66, -12, 0],
  });
  // 拥盾姿态(二技能持续期间)：盾立到身前正中，人压在盾后
  const guard = kp(h, stance, {
    hipsPos: [0, -0.14, 0.02],
    hips: [6, 18, 0],
    chest: [6, -10, 0],
    armL: [-50, 0, 8],
    foreL: [-84, -76, 0],
    armR: [-20, 0, -22],
    foreR: [-50, 0, 0],
    propR: [50, -20, 0],
  });
  // 普攻 A：剑自右上斜劈到左下
  const aWind = kp(h, stance, {
    hipsPos: [0.03, -0.08, -0.06],
    hips: [0, -12, 0],
    spine: [-2, -8, 0],
    chest: [-6, -12, 0],
    head: [0, 22, 0],
    armR: [-150, 0, -46],
    foreR: [-70, 0, 0],
    propR: [-10, -20, 0],
    armL: [-22, 0, 26],
  });
  const aHit = kp(h, stance, {
    hipsPos: [-0.03, -0.15, 0.14],
    hips: [8, 14, 0],
    spine: [8, 8, 0],
    chest: [10, 12, 0],
    head: [-8, -24, 0],
    footL: [0.27, 0.11, 0.3, 0, 16],
    armR: [-58, 44, -18],
    foreR: [-12, 0, 0],
    propR: [58, 26, 0],
    armL: [6, 0, 34],
    foreL: [-64, -36, 0],
  });
  const aFollow = kp(h, aHit, { hips: [10, 20, 0], chest: [12, 16, 0], armR: [-28, 64, -10], foreR: [-20, 0, 0], propR: [84, 36, 0] });
  const atkA = track([
    [0, stance],
    [0.22, aWind, E.out],
    [0.35, aHit, E.in3],
    [0.52, aFollow, E.out],
    [1, stance, E.io],
  ]);
  // 普攻 B：盾沿横击，随后反手剑自左向右带过
  const bWind = kp(h, stance, {
    hipsPos: [0, -0.1, -0.04],
    hips: [0, 18, 0],
    chest: [-2, 8, 0],
    armL: [-10, 0, 40],
    foreL: [-92, -20, 0],
    armR: [-50, 60, -20],
    foreR: [-50, 0, 0],
    propR: [60, 50, 0],
  });
  const bHit = kp(h, stance, {
    hipsPos: [0.03, -0.14, 0.14],
    hips: [8, -16, 0],
    spine: [6, -8, 0],
    chest: [6, -12, 0],
    head: [-6, 26, 0],
    footR: [-0.29, 0.11, 0.1, 0, -10],
    armR: [-50, -46, -76],
    foreR: [-10, 0, 0],
    propR: [50, -30, 0],
    armL: [-46, 0, 34],
    foreL: [-70, -84, 0],
  });
  const atkB = track([
    [0, stance],
    [0.22, bWind, E.out],
    [0.35, bHit, E.in3],
    [0.55, bHit, E.out],
    [1, stance, E.io],
  ]);
  // 第三击·覆盾震地：举盾过顶 → 盾下缘砸地，髋下沉
  const sUp = kp(h, stance, {
    hipsPos: [0, 0.0, -0.08],
    hips: [-10, 6, 0],
    spine: [-10, 0, 0],
    chest: [-14, 0, 0],
    head: [10, 0, 0],
    armL: [-150, 0, 16],
    foreL: [-50, -80, 0],
    armR: [-120, 0, -40],
    foreR: [-60, 0, 0],
    propR: [10, 0, 0],
  });
  const sHit = kp(h, stance, {
    hipsPos: [0, -0.24, 0.16],
    hips: [26, 6, 0],
    spine: [14, 0, 0],
    chest: [14, 0, 0],
    head: [-28, 0, 0],
    footL: [0.3, 0.11, 0.32, 0, 12],
    footR: [-0.3, 0.11, -0.16, 10, -20],
    armL: [-58, 0, 6],
    foreL: [-66, -84, 0],
    shield: [0, 0, -18],
    armR: [-30, 0, -30],
    foreR: [-40, 0, 0],
    propR: [70, -20, 0],
  });
  const slam = track([
    [0, stance],
    [0.24, sUp, E.out],
    [0.35, sHit, E.in3],
    [0.62, sHit, E.lin],
    [1, stance, E.io],
  ]);
  // 二技能·拥盾怒目：盾提起吸气 → 盾下缘顿地、身体前压、仰头怒喝 → 保持拥盾
  const s2Up = kp(h, stance, { hipsPos: [0, 0.03, -0.05], chest: [-12, 0, 0], head: [6, 0, 0], armL: [-62, 0, 26], foreL: [-96, -60, 0], armR: [-10, 0, -44], foreR: [-50, 0, 0] });
  const s2Down = kp(h, guard, { hipsPos: [0, -0.26, 0.08], hips: [14, 12, 0], chest: [10, -6, 0], armL: [-44, 0, 4], foreL: [-86, -84, 0], neck: [-16, 0, 0], head: [-26, 0, 0], armR: [10, 0, -50], foreR: [-30, 0, 0], propR: [40, -30, 0] });
  const s2 = track([
    [0, stance],
    [0.3, s2Up, E.out],
    [0.55, s2Down, E.in3],
    [0.8, s2Down, E.lin],
    [1, guard, E.io],
  ]);
  // 大招·死且不避(跃击)：蹲 → 腾空时剑盾张开 → 下落时人压在盾上砸地
  const crouch = kp(h, stance, { hipsPos: [0, -0.28, 0], hips: [18, 0, 0], chest: [10, 0, 0], armR: [20, 0, -30], propR: [80, -10, 0] });
  const lRise = kp(h, null, {
    hips: [-16, 0, 0],
    spine: [-10, 0, 0],
    chest: [-12, 0, 0],
    head: [12, 0, 0],
    footL: [0.24, 0.42, 0.12, 30, 10],
    footR: [-0.24, 0.3, -0.22, 50, -10],
    armR: [-150, 0, -70],
    foreR: [-30, 0, 0],
    propR: [-20, 0, 0],
    armL: [-120, 0, 60],
    foreL: [-60, -40, 0],
  });
  const lFall = kp(h, null, {
    hipsPos: [0, -0.1, 0.1],
    hips: [32, 0, 0],
    spine: [14, 0, 0],
    chest: [14, 0, 0],
    head: [-32, 0, 0],
    footL: [0.3, 0.2, 0.3, -10, 10],
    footR: [-0.3, 0.2, -0.24, 40, -16],
    armL: [-70, 0, 4],
    foreL: [-60, -84, 0],
    shield: [0, 0, -24],
    armR: [-40, 0, -60],
    foreR: [-30, 0, 0],
    propR: [40, -20, 0],
  });
  const lLand = kp(h, lFall, { hipsPos: [0, -0.32, 0.16], footL: [0.32, 0.11, 0.34, 0, 12], footR: [-0.32, 0.11, -0.18, 10, -20], armL: [-56, 0, 4], shield: [0, 0, -30] });
  const leap = track([
    [0, crouch],
    [0.3, lRise, E.out],
    [0.62, lRise, E.lin],
    [0.86, lFall, E.in],
    [1, lLand, E.in],
  ]);
  const runArms = kp(h, null, { armL: [-28, 0, 18], foreL: [-76, -44, 0], armR: [0, 0, -18], foreR: [-40, 0, 0], propR: [50, -10, 0] });
  // 侧盾闯帐：盾顶在身前并偏转一个角度，肩顶在盾后，剑收在身后
  const charge = kp(h, null, { armL: [-58, 0, 2], foreL: [-84, -62, 0], armR: [44, 0, -26], foreR: [-20, 0, 0], propR: [100, -10, 0], head: [-16, 0, 0] });
  // 回城引导：剑拄地、微屈膝，盾放低
  const channel = kp(h, stance, {
    hipsPos: [0, -0.2, 0],
    hips: [8, 0, 0],
    chest: [6, 0, 0],
    head: [12, 0, 0],
    armR: [-40, 30, -4],
    foreR: [-40, 0, 0],
    propR: [130, 0, 0],
    armL: [-6, 0, 24],
    foreL: [-46, -30, 0],
  });
  const common = makeCommon(h, stance, {
    limp: { propR: [84, -8, 0], foreL: [-30, -30, 0] },
    lying: { armR: [-4, 0, -70], propR: [70, -10, 0], armL: [-6, 0, 56], foreL: [-20, -20, 0] },
    lieY: 0.3,
  });
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
        out.glow = 1 + ((a.mode & 1) !== 0 ? 2.2 : 1.2) * bump(p, 0.36, 0.2);
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
          breathe(h, pose, a.time * 0.75, a.seed, 1.5);
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
    height: 2.3,
    radius: 0.66,
    scale: SCALE,
    stride: RUN.stride * SCALE,
    triangles: b.triangleCount,
    attach: {
      head: { joint: J.head, x: 0, y: 0.28, z: 0 },
      chest: { joint: J.chest, x: 0, y: 0.06, z: 0 },
      handR: { joint: J.handR, x: 0, y: -0.1, z: 0 },
      handL: { joint: J.handL, x: 0, y: -0.1, z: 0 },
      weapon: { joint: J.propR, x: 0, y: 0, z: 0.95 },
      muzzle: { joint: J.propR, x: 0, y: 0, z: 0.95 },
    },
    blend: (from, to) => (to === 'attack' ? 0.09 : to === 'dash' || to === 'leap' ? 0.08 : to === 'dead' ? 0.05 : from === 'leap' ? 0.2 : 0.16),
    animate,
  };
}
