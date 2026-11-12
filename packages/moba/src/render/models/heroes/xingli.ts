/**
 * 星璃 · 星语术士：轻盈的观星术士。靛蓝与月白相间的长袍(下摆星空渐变，缀着亮点)，银白长发，月牙与星环冠饰，
 * 手持顶端悬浮多面水晶星体的长杖，身周三枚缓缓环绕的小星辰。
 * 剪影要点：喇叭形长袍、比人还高的星杖、绕身的星辰。
 */
import { type CKP, type CommonAnims, E, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, STANDARD_DIMS, type TrackKey, animateCommon, applyCKP, breathe, bump, emptyCKP, humanRig, kp, makeCommon, mix, runCycle, sampleTrack, sat, strikeWarp, track } from '../humanoid';
import { ModelBuilder, type SoftBind, X, lerp } from '../kit';
import { chainBind, face, fist, hairCap, head, strip, torsoBind, trim } from '../parts';
import type { Pose } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  indigo: 0x5a6fe0,
  indigoDark: 0x3443a8,
  night: 0x1b2268,
  white: 0xf1ecff,
  whiteShade: 0xc9c6ee,
  gold: 0xffd98a,
  goldDark: 0xd8a650,
  skin: 0xf8d6c0,
  hair: 0xeef0fb,
  hairTip: 0xb4c2ee,
  glow: 0x8fd8ff,
  wood: 0x2f3a86,
};

const DIMS: HumanDims = { ...STANDARD_DIMS, hipX: 0.105, shoulderX: 0.265, clavX: 0.08 };
const SCALE = 1.16;

interface Extra {
  orb: number;
  stars: number[];
}

function build(): { h: Human; b: ModelBuilder; extra: Extra } {
  const h = humanRig(DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();

  // ── 附加关节 ──
  const orb = rig.add('orb', J.propR, -d.shoulderX, d.handY, 1.12);
  const stars = [0, 1, 2].map((i) => rig.add(`star${i}`, J.root, 0, 1.2, 0));
  const hairPts = [[0, 1.78, -0.2], [0, 1.52, -0.3], [0, 1.24, -0.33], [0, 0.96, -0.33]];
  const hair = rig.addChain('hair', J.head, hairPts.slice(0, 3));
  rig.chain({ joints: hair, tip: [0, -0.28, 0], stiffness: 6, drag: 0.9, gravity: 10, maxAngle: 60, wind: 1.6, colliders: [{ joint: J.chest, x: 0, y: 0.05, z: 0, r: 0.24 }] });
  const ribbonPts = (s: number): number[][] => [[s * 0.07, 1.0, -0.15], [s * 0.16, 0.76, -0.34], [s * 0.2, 0.5, -0.46], [s * 0.22, 0.26, -0.52]];
  const ribL = rig.addChain('ribL', J.hips, ribbonPts(1).slice(0, 3));
  const ribR = rig.addChain('ribR', J.hips, ribbonPts(-1).slice(0, 3));
  for (const r of [ribL, ribR]) rig.chain({ joints: r, tip: [0, -0.22, -0.04], stiffness: 3.5, drag: 0.92, gravity: 6, maxAngle: 75, wind: 2.6 });

  // 裙摆的蒙皮：腰部跟髋，越往下越跟随同侧的大腿/小腿，走动时裙子被腿带着摆
  const skirtBind: SoftBind = (x, y) => {
    const left = x >= 0;
    const thigh = left ? J.thighL : J.thighR;
    const shin = left ? J.shinL : J.shinR;
    if (y >= 0.9) return [J.hips, J.hips, 1];
    if (y >= 0.5) return [J.hips, thigh, 1 - (0.9 - y) / 0.4];
    return [thigh, shin, 1 - sat((0.5 - y) / 0.4) * 0.6];
  };

  // ── 鞋(裙底只露出鞋尖) ──
  b.sym((s) => {
    b.bone(s > 0 ? J.footL : J.footR).paint(C.white, { c2: C.whiteShade });
    b.tube([[d.hipX, 0.05, -0.07, 0.06, 0.045], [d.hipX, 0.06, 0.06, 0.07, 0.055], [d.hipX, 0.05, 0.2, 0.045, 0.03]], { seg: 6 });
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.indigoDark);
    b.limb([d.hipX, d.kneeY, 0], [d.hipX, d.ankleY, 0], 0.07, 0.055, { seg: 6 });
  });

  // ── 长袍下摆：喇叭形，带褶；靛蓝 → 夜空蓝 ──
  const skirtProf = [
    [0.05, 0.47, 0.47],
    [0.09, 0.455, 0.455],
    [0.3, 0.37, 0.37],
    [0.55, 0.28, 0.27],
    [0.8, 0.215, 0.185],
    [0.94, 0.19, 0.155],
    [1.0, 0.16, 0.125],
  ];
  b.bind(skirtBind).paint(C.night, { c2: C.indigo, ao: 0.9, ao2: 1 });
  b.lathe(skirtProf, { seg: 16, cap1: false, shape: (a, k) => 1 + (k < 4 ? 0.045 * (1 - k / 4) * Math.sin(a * 8) : 0) });
  const skirtR = (y: number): number => {
    for (let i = 1; i < skirtProf.length; i++) {
      if (y <= skirtProf[i][0]) return lerp(skirtProf[i - 1][1], skirtProf[i][1], (y - skirtProf[i - 1][0]) / (skirtProf[i][0] - skirtProf[i - 1][0]));
    }
    return 0.16;
  };
  // 下摆月白镶边
  b.paint(C.white, { c2: C.whiteShade });
  b.lathe([[0.04, 0.475, 0.475], [0.05, 0.49, 0.49], [0.1, 0.47, 0.47], [0.105, 0.45, 0.45]], { seg: 16, shape: (a) => 1 + 0.045 * Math.sin(a * 8) });
  // 袍面上的星点
  for (let i = 0; i < 20; i++) {
    const a = i * 2.39996 + 0.4;
    const y = 0.15 + ((i * 0.618) % 1) * 0.5;
    const r = skirtR(y) * (1 + 0.03 * Math.sin(a * 8)) + 0.008;
    const sz = 0.014 + ((i * 0.37) % 1) * 0.016;
    b.paint(i % 3 === 0 ? C.gold : 0xbfe2ff, { glow: 0.55, line: 0 });
    b.g(X(Math.cos(a) * r, y, Math.sin(a) * r, 0, 90 - (a * 180) / Math.PI, 45), () => b.box(0, 0, 0, sz * 2, sz * 2, 0.008));
  }
  // 身前一道月白衬摆
  b.paint(C.white, { c2: C.whiteShade });
  b.sheet(3, 6, (u, v) => {
    const y = lerp(0.98, 0.1, v);
    const w = lerp(0.07, 0.16, v);
    const ang = Math.PI / 2 + (u - 0.5) * 2 * (w / skirtR(y));
    const r = skirtR(y) * (1 + (v > 0.5 ? 0.045 * Math.sin(ang * 8) * ((v - 0.5) * 2) : 0)) + 0.012;
    return [Math.cos(ang) * r, y, Math.sin(ang) * r * (y > 0.7 ? 0.86 : 1)];
  }, false);

  // ── 上身 ──
  b.bind(torsoBind(h)).paint(C.indigoDark, { c2: C.indigo });
  b.lathe(
    [
      [0.86, 0.185, 0.15],
      [0.95, 0.178, 0.14],
      [1.02, 0.142, 0.112],
      [1.12, 0.162, 0.128],
      [1.22, 0.198, 0.152],
      [1.32, 0.2, 0.135],
      [1.385, 0.13, 0.105],
      [1.425, 0.07, 0.066],
    ],
    { seg: 12 },
  );
  b.bone(J.neck).paint(C.skin, { ao: 0.78 });
  b.lathe([[1.4, 0.062, 0.062], [1.52, 0.06, 0.06]], { seg: 8, cap0: false });
  // 腰封：月白 + 金边 + 星扣
  b.bone(J.spine).paint(C.white, { c2: C.whiteShade });
  b.lathe([[0.965, 0.182, 0.146], [0.99, 0.165, 0.13], [1.06, 0.15, 0.118], [1.075, 0.145, 0.115]], { seg: 12 });
  b.paint(C.gold, { gloss: 1 });
  trim(b, 0, 0.975, 0, 0.184, 0.148, 0.01, 0.014, 12);
  trim(b, 0, 1.07, 0, 0.152, 0.12, 0.01, 0.014, 12);
  b.g(X(0, 1.02, 0.128, 0, 0, 0), () => b.extrude(starOutline(0.055, 0.022, 4), 0.02, 0.006));
  b.paint(C.glow, { glow: 0.7 });
  b.g(X(0, 1.02, 0.14, 0, 0, 45), () => b.box(0, 0, 0, 0.026, 0.026, 0.012));
  // 背后的蝴蝶结与两条飘带(队伍色)
  b.bone(J.hips).paint(0xffffff, { team: 1 });
  b.sym(() => b.g(X(0.075, 1.02, -0.15, 0, 0, 20), () => b.box(0, 0, 0, 0.13, 0.085, 0.04, 0.02)));
  for (const [r, sgn] of [[ribL, 1], [ribR, -1]] as [number[], number][]) {
    const pts = ribbonPts(sgn);
    b.bind(chainBind(r, pts, J.hips)).paint(0xffffff, { team: 1 });
    strip(b, pts, { width: (v) => lerp(0.04, 0.065, v), axis: [1, 0, 0], bow: [0, 0, -0.012], nu: 2, nv: 7, tail: 'swallow', tailLen: 0.1, wave: 0.6 });
  }

  // ── 披肩：月白短披，星芒形下缘，金边 ──
  b.bone(J.chest).paint(C.whiteShade, { c2: C.white });
  b.lathe(
    [
      [1.235, 0.345, 0.25],
      [1.27, 0.335, 0.245],
      [1.37, 0.21, 0.165],
      [1.42, 0.125, 0.11],
      [1.45, 0.1, 0.095],
    ],
    { seg: 16, cap0: false, cap1: false, shape: (a, k) => (k === 0 ? 1 + 0.12 * Math.pow(Math.abs(Math.sin(a * 4)), 0.7) : k === 1 ? 1 + 0.03 * Math.abs(Math.sin(a * 4)) : 1) },
  );
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 1.4, 0.135), () => b.extrude(starOutline(0.05, 0.02, 4), 0.02, 0.006));
  b.paint(C.glow, { glow: 0.7 });
  b.g(X(0, 1.4, 0.148, 0, 0, 45), () => b.box(0, 0, 0, 0.024, 0.024, 0.012));

  // ── 手臂：窄袖上臂 + 喇叭袖 ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.indigo, { c2: C.indigoDark });
    b.ball(x, d.shoulderY, 0, 0.078, 0.078, 0.078, 1);
    b.limb([x, d.shoulderY, 0], [x, d.elbowY, 0], 0.072, 0.062, { seg: 8 });
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.indigo, { c2: C.indigoDark });
    b.lathe([[d.wristY - 0.05, 0.15, 0.15, x, 0], [d.wristY, 0.14, 0.14, x, 0], [d.wristY + 0.14, 0.085, 0.085, x, 0], [d.elbowY + 0.02, 0.066, 0.066, x, 0]], { seg: 10, cap0: false });
    // 袖口内衬与队伍色滚边
    b.paint(C.white, { c2: C.whiteShade });
    b.lathe([[d.wristY - 0.046, 0.02, 0.02, x, 0], [d.wristY - 0.046, 0.146, 0.146, x, 0]], { seg: 10, cap0: false, cap1: false });
    b.paint(0xffffff, { team: 1 });
    trim(b, x, d.wristY - 0.045, 0, 0.152, 0.152, 0.012, 0.03, 10);
  });
  b.paint(C.skin, { glow: 0.07 });
  fist(b, h, 1, 0.052);
  fist(b, h, -1, 0.052);

  // ── 头与长发 ──
  const hd = head(b, h, C.skin, 0.97);
  face(b, h, hd, { iris: 0x4f9cff, irisGlow: 0.2, brow: 0x9ea6cc, browTilt: 1, eyeW: 0.054, eyeH: 0.05, slant: 3, lash: 0.015, lip: 0xe08a8a });
  hairCap(b, h, hd, {
    c: C.hair,
    c2: C.hairTip,
    thick: 0.03,
    line: (phi) => (phi < 0.85 ? 0.11 : phi < 1.35 ? mix(0.11, -0.14, (phi - 0.85) / 0.5) : -0.3),
    gloss: 0.5,
  });
  // 齐眉刘海(几片尖角发片) 与垂在胸前的两绺
  b.paint(C.hair, { c2: C.hairTip, gloss: 0.5 });
  const cy = hd.cy;
  for (const [x, len] of [[-0.15, 0.1], [-0.075, 0.125], [0, 0.11], [0.075, 0.125], [0.15, 0.1]]) {
    const y = cy + 0.115;
    const yaw = (Math.atan2(x, 0.2) * 180) / Math.PI;
    b.g(X(x, y, hd.surf(x, y) + 0.012, -10, yaw, x * 60), () => b.extrude([[-0.05, 0.03], [0.05, 0.03], [0.012, -len], [-0.012, -len]], 0.02, 0.006));
  }
  b.sym(() => {
    b.tube([[0.2, cy + 0.06, 0.08, 0.04, 0.045], [0.24, cy - 0.12, 0.08, 0.045, 0.045], [0.225, cy - 0.32, 0.11, 0.04, 0.035], [0.2, cy - 0.5, 0.13, 0.012, 0.012]], { seg: 6 });
  });
  // 披在背后的长发(弹簧链)
  b.bind(chainBind(hair, hairPts, J.head)).paint(C.hair, { c2: C.hairTip, gloss: 0.5 });
  b.tube(
    [
      [0, 1.84, -0.19, 0.2, 0.07],
      [0, 1.66, -0.26, 0.235, 0.085],
      [0, 1.42, -0.31, 0.225, 0.08],
      [0, 1.16, -0.33, 0.18, 0.06],
      [0, 0.92, -0.33, 0.1, 0.035],
      [0, 0.74, -0.32, 0.012, 0.008],
    ],
    { seg: 10, up: [1, 0, 0], shape: (a) => 1 + 0.07 * Math.cos(a * 6) },
  );
  // 冠饰：额前月牙 + 脑后星环
  b.bone(J.head).paint(C.gold, { gloss: 1, glow: 0.18 });
  const crescent: number[][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.08 + (0.84 * i) / 8);
    crescent.push([Math.cos(a) * 0.105, -Math.sin(a) * 0.105 + 0.085]);
  }
  for (let i = 8; i >= 0; i--) {
    const a = Math.PI * (0.08 + (0.84 * i) / 8);
    crescent.push([Math.cos(a) * 0.105, -Math.sin(a) * 0.062 + 0.098]);
  }
  b.g(X(0, cy + 0.2, 0.17, -24, 0, 0), () => b.extrude(crescent, 0.022, 0.006));
  b.paint(C.glow, { glow: 0.75 });
  b.g(X(0, cy + 0.255, 0.165, -24, 0, 45), () => b.box(0, 0, 0, 0.034, 0.034, 0.02));
  b.paint(C.gold, { gloss: 1, glow: 0.22 });
  b.g(X(0, cy + 0.14, -0.14, 68, 0, 0), () => {
    b.torus(0.25, 0.013, 0.013, 16, 4, { crease: 30 });
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.1 + 0.2 * i);
      b.g(X(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25, 0, (a * 180) / Math.PI, 0), () => b.g(X(0, 0, 0, 90, 0, 0), () => b.extrude(starOutline(i === 2 ? 0.06 : 0.04, 0.016, 4), 0.014, 0.004)));
    }
  });

  // ── 星杖(右手)：沿 +Z，自然握持时杖身竖直 ──
  b.bone(J.propR);
  b.g(X(-d.shoulderX, d.handY, 0), () => {
    b.paint(C.wood, { c2: C.indigo });
    b.tube([[0, 0, -1.0, 0.02], [0, 0, -0.2, 0.026], [0, 0, 0.78, 0.024]], { seg: 6 });
    b.paint(C.gold, { gloss: 1 });
    b.g(X(0, 0, -1.0), () => b.g(X(0, 0, 0, -90, 0, 0), () => b.crystal(0.035, 0.12, 4, 0.7, 0.2)));
    for (const z of [-0.5, -0.06, 0.4, 0.76]) b.g(X(0, 0, z, 90, 0, 0), () => b.torus(0.03, 0.01, 0.02, 6, 4, { crease: 30 }));
    // 杖首：一对向上环抱的月牙托
    b.sym(() => {
      b.tube([[0.0, 0, 0.78, 0.03, 0.02], [0.1, 0, 0.86, 0.034, 0.02], [0.17, 0, 1.0, 0.03, 0.018], [0.17, 0, 1.16, 0.022, 0.014], [0.1, 0, 1.3, 0.006, 0.006]], { seg: 5, up: [0, 1, 0] });
    });
    b.g(X(0, 0, 0.82, 90, 0, 0), () => b.crystal(0.04, 0.1, 4, 0.5, 0.5));
  });
  // 悬浮的多面星体(可独立旋转/脉动)
  b.bone(orb).paint(0x6cc6ff, { c2: 0xbfeaff, glow: 0.4, gloss: 1, line: 1 });
  b.g(X(-d.shoulderX, d.handY, 1.12, 90, 0, 0), () => {
    b.g(X(0, -0.16, 0), () => b.crystal(0.085, 0.32, 6, 0.5, 0.5, 1));
    b.paint(0xd8f2ff, { glow: 0.6 });
    for (let i = 0; i < 4; i++) b.g(X(0, 0, 0, 0, i * 90, 90), () => b.g(X(0, 0.06, 0), () => b.crystal(0.025, 0.11, 4, 0.8, 0.1)));
  });

  // ── 环绕的三枚小星辰 ──
  stars.forEach((sj, i) => {
    b.bone(sj).paint(i === 1 ? 0xffc860 : 0x8fd8ff, { glow: 0.5, gloss: 1, line: 1 });
    b.g(X(0, 1.2, 0), () => {
      const r = i === 1 ? 0.075 : 0.06;
      b.g(X(0, -r * 1.6, 0), () => b.crystal(r * 0.5, r * 3.2, 4, 0.5, 0.5, 1));
      b.g(X(0, 0, 0, 0, 0, 90), () => b.g(X(0, -r * 1.2, 0), () => b.crystal(r * 0.42, r * 2.4, 4, 0.5, 0.5, 1)));
      b.g(X(0, 0, 0, 90, 0, 0), () => b.g(X(0, -r * 1.2, 0), () => b.crystal(r * 0.42, r * 2.4, 4, 0.5, 0.5, 1)));
    });
  });

  b.bakeGrounding(2.05, 0.75, 0.9);
  return { h, b, extra: { orb, stars } };
}

/** n 角星轮廓(外半径 R，内半径 r) */
function starOutline(R: number, r: number, n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? R : r;
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 2.1, stance: 0.42, lift: 0.14, bob: 0.03, drop: 0.03, lean: 13, twist: 5, sway: 0.02, width: 0.1, arm: 0 };

interface Anims {
  stance: CKP;
  tmp: CKP;
  atk: TrackKey[];
  s1: TrackKey[];
  s2: TrackKey[];
  ult: TrackKey[];
  runArms: CKP;
  channel: CKP;
  common: CommonAnims;
}

function makeAnims(h: Human): Anims {
  // 站姿：身体微侧，右手持杖立于身前，左手轻抬
  const stance = kp(h, null, {
    hipsPos: [0, -0.01, 0],
    hips: [0, -8, 2],
    spine: [0, 4, -2],
    chest: [-2, 6, 0],
    head: [-2, 4, 0],
    footL: [0.11, 0.09, 0.06, 0, 10],
    footR: [-0.12, 0.09, -0.05, 0, -16],
    armR: [-26, 0, -12],
    foreR: [-50, 0, 0],
    propR: [-12, 0, -4],
    armL: [-6, 0, 16],
    foreL: [-34, -10, 0],
  });
  // 普攻：星杖后引 → 杖首前点，弹出一颗星辉
  const aWind = kp(h, stance, {
    hips: [0, -20, 0],
    chest: [-6, -14, 0],
    head: [0, 26, 0],
    armR: [20, 0, -34],
    foreR: [-96, 0, 0],
    propR: [-40, 0, 0],
    armL: [-50, 0, 20],
    foreL: [-30, 0, 0],
  });
  const aHit = kp(h, stance, {
    hipsPos: [0, -0.04, 0.06],
    hips: [6, 14, 0],
    chest: [8, 16, 0],
    head: [-6, -24, 0],
    armR: [-78, 14, -10],
    foreR: [-14, 0, 0],
    propR: [50, 0, 0],
    armL: [24, 0, 30],
    foreL: [-30, 0, 0],
  });
  const atk = track([
    [0, stance],
    [0.2, aWind, E.out],
    [0.35, aHit, E.in3],
    [0.55, aHit, E.out],
    [1, stance, E.io],
  ]);
  // 一技能·流星矢：双手推杖，杖身平指前方
  const s1Wind = kp(h, stance, { hipsPos: [0, -0.05, -0.06], hips: [0, -30, 0], chest: [-4, -20, 0], head: [0, 44, 0], armR: [30, 0, -40], foreR: [-80, 0, 0], propR: [10, -30, 0], armL: [-70, 0, 10], foreL: [-20, 0, 0] });
  const s1Hit = kp(h, stance, {
    hipsPos: [0, -0.08, 0.1],
    hips: [8, 24, 0],
    chest: [10, 22, 0],
    head: [-8, -40, 0],
    footL: [0.11, 0.09, 0.22, 0, 10],
    armR: [-84, 30, -6],
    foreR: [-6, 0, 0],
    propR: [84, 0, 0],
    armL: [30, 0, 40],
    foreL: [-20, 0, 0],
  });
  const s1 = track([
    [0, stance],
    [0.28, s1Wind, E.out],
    [0.45, s1Hit, E.in3],
    [0.7, s1Hit, E.lin],
    [1, stance, E.io],
  ]);
  // 二技能·引力星环：左手高举 → 向下一握
  const s2Up = kp(h, stance, { chest: [-10, 10, 0], head: [-14, 0, 0], armL: [-150, 0, 24], foreL: [-24, 0, 0], armR: [-20, 0, -20] });
  const s2Down = kp(h, stance, { hipsPos: [0, -0.07, 0], chest: [10, 0, 0], head: [8, 0, 0], armL: [-70, 0, 10], foreL: [-80, 0, 0], armR: [-30, 0, -16] });
  const s2 = track([
    [0, stance],
    [0.35, s2Up, E.out],
    [0.6, s2Down, E.in3],
    [1, stance, E.io],
  ]);
  // 大招·星陨天降：双臂展开，星杖高举过顶，身体浮起
  const ultUp = kp(h, stance, {
    rootPos: [0, 0.22, 0],
    hips: [-6, 0, 0],
    spine: [-8, 0, 0],
    chest: [-12, 0, 0],
    head: [-22, 0, 0],
    footL: [0.1, 0.02, -0.02, 34, 6],
    footR: [-0.1, 0.06, -0.1, 44, -6],
    armR: [-160, 0, -20],
    foreR: [-14, 0, 0],
    propR: [84, 0, 0],
    armL: [-120, 0, 60],
    foreL: [-20, 0, 0],
  });
  const ult = track([
    [0, stance],
    [0.5, ultUp, E.out],
    [1, ultUp, E.lin],
  ]);
  const runArms = kp(h, null, { armR: [-20, 0, -14], foreR: [-58, 0, 0], propR: [-38, 0, -6], armL: [20, 0, 22], foreL: [-30, 0, 0] });
  const channel = kp(h, stance, { hipsPos: [0, -0.04, 0], chest: [6, 0, 0], head: [14, 0, 0], armR: [-40, 20, -6], foreR: [-56, 0, 0], propR: [0, 0, 0], armL: [-44, -20, 10], foreL: [-70, -30, 0] });
  const common = makeCommon(h, stance, { limp: { propR: [10, 0, -10] }, lying: { armR: [-4, 0, -70], propR: [80, -10, 0] } });
  return { stance, tmp: emptyCKP(h), atk, s1, s2, ult, runArms, channel, common };
}

export function createXingli(): ModelDef {
  const { h, b, extra } = build();
  const A = makeAnims(h);
  const J = h.J;
  const k = A.tmp;
  const geometry = b.build();

  /** 星体自转/脉动 + 三枚小星辰绕身：power 0..1 表示施法强度(转得更快、圈更大) */
  const celestial = (pose: Pose, a: AnimInput, power: number, hidden = 0): void => {
    const t = a.time;
    pose.rot(extra.orb, 0, 0, t * (60 + power * 240));
    pose.scale(extra.orb, 1 + 0.06 * Math.sin(t * 3) + power * 0.35);
    pose.move(extra.orb, 0, 0, 0.02 * Math.sin(t * 2.2) + power * 0.05);
    for (let i = 0; i < 3; i++) {
      const sj = extra.stars[i];
      const ang = t * (1.1 + power * 3.2) + (i * Math.PI * 2) / 3 + a.seed * 6;
      const R = 0.78 + 0.08 * Math.sin(t * 0.9 + i * 2) + power * 0.2;
      const y = [0.25, -0.1, 0.5][i] + 0.12 * Math.sin(t * 1.3 + i * 2.1) + power * 0.25;
      pose.pos(sj, Math.cos(ang) * R, y, Math.sin(ang) * R);
      pose.rot(sj, t * 70 + i * 40, t * 110, 0);
      pose.scale(sj, (1 + 0.15 * Math.sin(t * 4 + i) + power * 0.5) * (1 - hidden));
    }
  };

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    if (animateCommon(h, pose, a.anim === 'leap' ? 'airborne' : a.anim, a.t, a.p, a.time, A.common)) {
      const fade = a.anim === 'dead' ? sat(a.t * 1.6) : 0;
      celestial(pose, a, 0, fade);
      if (a.anim === 'dead') out.glow = Math.max(0.1, 1 - a.t * 1.2);
      return;
    }
    let power = 0;
    switch (a.anim) {
      case 'move':
      case 'dash': {
        runCycle(h, pose, a.stride, RUN, () => {
          const e = A.runArms.e;
          const sw = Math.cos(a.stride * Math.PI * 2);
          pose.rot(J.armR, e[J.armR * 3] - sw * 6, 0, e[J.armR * 3 + 2]);
          pose.rot(J.foreR, e[J.foreR * 3], 0, 0);
          pose.rot(J.propR, e[J.propR * 3] + sw * 3, 0, e[J.propR * 3 + 2]);
          pose.rot(J.armL, e[J.armL * 3] + sw * 16, 0, e[J.armL * 3 + 2]);
          pose.rot(J.foreL, e[J.foreL * 3] + sw * 8, 0, 0);
        });
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        sampleTrack(A.atk, p, k);
        applyCKP(h, pose, k);
        power = bump(p, 0.33, 0.22) * 0.6;
        break;
      }
      case 'cast_s1': {
        sampleTrack(A.s1, a.p, k);
        applyCKP(h, pose, k);
        power = bump(a.p, 0.42, 0.35);
        break;
      }
      case 'cast_s2': {
        sampleTrack(A.s2, a.p, k);
        applyCKP(h, pose, k);
        power = bump(a.p, 0.5, 0.4);
        break;
      }
      case 'cast_ult':
      case 'spin': {
        sampleTrack(A.ult, a.p, k);
        applyCKP(h, pose, k);
        power = Math.min(1, a.p * 2.5);
        break;
      }
      case 'channel': {
        applyCKP(h, pose, A.channel, () => breathe(h, pose, a.time, a.seed, 0.8));
        power = 0.35;
        break;
      }
      default: {
        applyCKP(h, pose, A.stance, () => {
          breathe(h, pose, a.time, a.seed);
          pose.add(J.foreL, Math.sin(a.time * 1.2) * 4, 0, 0);
          pose.add(J.propR, Math.sin(a.time * 0.9) * 1.5, 0, Math.cos(a.time * 0.8) * 1.5);
        });
      }
    }
    celestial(pose, a, power);
    out.glow = 1 + power * 1.8 + 0.1 * Math.sin(a.time * 2.6);
  };

  return {
    key: 'hero:xingli',
    geometry,
    rig: h.rig,
    height: 2.1,
    radius: 0.6,
    scale: SCALE,
    stride: RUN.stride * SCALE,
    triangles: b.triangleCount,
    attach: {
      head: { joint: J.head, x: 0, y: 0.25, z: 0 },
      chest: { joint: J.chest, x: 0, y: 0.08, z: 0 },
      handR: { joint: J.handR, x: 0, y: -0.07, z: 0 },
      handL: { joint: J.handL, x: 0, y: -0.07, z: 0 },
      weapon: { joint: extra.orb, x: 0, y: 0, z: 0 },
      muzzle: { joint: extra.orb, x: 0, y: 0, z: 0 },
    },
    blend: (_from, to) => (to === 'attack' ? 0.08 : to === 'dead' ? 0.05 : 0.14),
    animate,
  };
}
