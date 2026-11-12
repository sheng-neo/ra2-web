/**
 * 王昭君 · 法师：出塞的汉家女子。绛红(偏紫)斗篷配一圈蓬松的雪白毛领，头戴白毛帽箍，露出黑色发髻与金步摇；
 * 斗篷下是月白曲裾深衣(石青镶边)与长绶带；怀里斜抱一把梨形四弦曲项琵琶，全程抱琴拨弦。
 * 俯视识别三要素：白毛帽箍 + 白毛领两个白环、绛红斗篷、斜抱的琵琶。意象是弦音、雁、塞外月色，不是冰雪法师。
 * 造型依据只有《汉书》《后汉书》的记载、昭君出塞的诗文与历代《明妃出塞图》的一般样貌(红斗篷、毛领、怀抱琵琶)。
 *
 * 抱琴的做法：琵琶是挂在胸腔下的一个关节，关键帧里直接写它的转角(pipa)；另有三个只记参数的空关节——
 *   pipaPos = 琴的平移；pluck = 右手相对默认拨弦点的偏移[横向, 沿弦, 离开面板]；free = [右手松开, 左手松开, 左手沿琴颈滑动]。
 * 每帧先摆好躯干与琴，再用 IK 把左手放到琴颈、右手放到弦上，所以琴怎么动，手都在琴上。
 */
import { type CKP, type CommonAnims, E, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, STANDARD_DIMS, type TrackKey, animateCommon, applyCKP, breathe, bump, emptyCKP, humanRig, kp, makeCommon, mix, mixQ, reachHand, runCycle, sampleTrack, sat, strikeWarp, track } from '../humanoid';
import { MAT, ModelBuilder, type SoftBind, X, lerp } from '../kit';
import { chainBind, face, furRing, furTube, hairCap, hand, head, polyAt, strip, torsoBind } from '../parts';
import type { Pose } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  cloak: 0xaa2448,
  cloakDark: 0x701737,
  cloakLight: 0xc8426a,
  fur: 0xfaf7f0,
  furShade: 0xc9cfdd,
  robe: 0xf3ede0,
  robeShade: 0xcbc3b6,
  hem: 0xd79aa0,
  trim: 0x2f5d7c,
  trimDark: 0x1f4058,
  skin: 0xf6d5c2,
  hair: 0x1c1a22,
  hairHi: 0x3a3448,
  gold: 0xf0c060,
  goldDark: 0xb48632,
  lip: 0xc8384a,
  wood: 0xe2c08a,
  woodShade: 0xc79d62,
  woodDark: 0xb8793a,
  woodDeep: 0x7c4a26,
  string: 0xffe9b8,
};

const DIMS: HumanDims = { ...STANDARD_DIMS, hipX: 0.105, shoulderX: 0.265, clavX: 0.08 };
const SCALE = 1.16;
const DEG = Math.PI / 180;

interface Extra {
  pipa: number;
  pipaPos: number;
  pluck: number;
  free: number;
  /** 琴的三根轴(横向 / 沿弦朝琴头 / 面板法线)在关节局部坐标里的方向 */
  ax: number[][];
  /** 默认的右手腕 / 左手腕落点(关节局部坐标) */
  handR: number[];
  handL: number[];
  /** 面板中心(弦音从这里出) */
  face: number[];
}

function build(): { h: Human; b: ModelBuilder; extra: Extra } {
  const h = humanRig(DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();

  // ── 琵琶的摆放：音箱在右腰前，琴头斜向左肩上方，面板朝前并略微仰起 ──
  const PIV = [-0.1, 1.02, 0.255];
  const T = X(PIV[0], PIV[1], PIV[2], -14, 8, -52, 1.14);
  const te = T.elements;
  /** 琴自身坐标(x 横向, y 沿弦朝琴头, z 面板法线) → 关节局部坐标(相对琴关节的绑定位置) */
  const toJoint = (x: number, y: number, z: number): number[] => [te[0] * x + te[4] * y + te[8] * z, te[1] * x + te[5] * y + te[9] * z, te[2] * x + te[6] * y + te[10] * z];

  // ── 附加关节 ──
  const pipa = rig.add('pipa', J.chest, PIV[0], PIV[1], PIV[2]);
  const pipaPos = rig.add('pipaPos', J.chest, 0, d.chestY, 0);
  const pluck = rig.add('pluck', J.chest, 0, d.chestY, 0);
  const free = rig.add('free', J.chest, 0, d.chestY, 0);
  const hs = 0.97;
  const hcy = d.headY + 0.25 * hs;
  const hairPts = [[0, hcy - 0.1, -0.22], [0, 1.38, -0.33], [0, 1.16, -0.37], [0, 0.96, -0.38]];
  const hair = rig.addChain('hair', J.head, hairPts.slice(0, 3));
  rig.chain({ joints: hair, tip: [0, -0.2, -0.01], stiffness: 7, drag: 0.88, gravity: 10, maxAngle: 50, wind: 1.2, colliders: [{ joint: J.chest, x: 0, y: 0.05, z: -0.04, r: 0.27 }] });
  const ribbonPts = (s: number): number[][] => [[s * 0.1, 1.0, 0.14], [s * 0.15, 0.78, 0.2], [s * 0.17, 0.54, 0.25], [s * 0.18, 0.32, 0.3]];
  const ribL = rig.addChain('ribL', J.hips, ribbonPts(1).slice(0, 3));
  const ribR = rig.addChain('ribR', J.hips, ribbonPts(-1).slice(0, 3));
  for (const r of [ribL, ribR]) rig.chain({ joints: r, tip: [0, -0.22, 0.04], stiffness: 4, drag: 0.92, gravity: 7, maxAngle: 70, wind: 2.2 });
  // 斗篷后摆：宽链，被髋与胸的碰撞球托住
  const cloakPts = [[0, 1.3, -0.05], [0, 1.03, -0.15], [0, 0.76, -0.23], [0, 0.5, -0.28], [0, 0.26, -0.31]];
  const cloak = rig.addChain('cloak', J.chest, cloakPts.slice(0, 4));
  rig.chain({
    joints: cloak, tip: [0, -0.24, -0.03], stiffness: 3.4, drag: 0.92, gravity: 8, maxAngle: 68, wind: 2.4,
    colliders: [{ joint: J.hips, x: 0, y: -0.12, z: 0.1, r: 0.36 }, { joint: J.chest, x: 0, y: 0, z: 0.08, r: 0.3 }],
  });

  // 裙摆的蒙皮：腰部跟髋，越往下越跟随同侧的大腿/小腿，走动时裙子被腿带着摆
  const skirtBind: SoftBind = (x, y) => {
    const left = x >= 0;
    const thigh = left ? J.thighL : J.thighR;
    const shin = left ? J.shinL : J.shinR;
    if (y >= 0.9) return [J.hips, J.hips, 1];
    if (y >= 0.5) return [J.hips, thigh, 1 - (0.9 - y) / 0.4];
    return [thigh, shin, 1 - sat((0.5 - y) / 0.4) * 0.6];
  };

  // ── 鞋(裙底只露出翘头履的鞋尖) ──
  b.sym((s) => {
    b.bone(s > 0 ? J.footL : J.footR).paint(C.cloakDark, { c2: C.cloak, mat: MAT.cloth });
    b.tube([[d.hipX, 0.05, -0.07, 0.06, 0.045], [d.hipX, 0.06, 0.07, 0.07, 0.055], [d.hipX, 0.075, 0.21, 0.05, 0.036], [d.hipX, 0.12, 0.25, 0.03, 0.02]], { seg: 6 });
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.robeShade, { mat: MAT.cloth });
    b.limb([d.hipX, d.kneeY, 0], [d.hipX, d.ankleY, 0], 0.07, 0.055, { seg: 5 });
  });

  // ── 曲裾深衣的下摆：喇叭形带褶，月白向下缘渐变浅绛，石青镶边 ──
  const skirtProf = [
    [0.05, 0.46, 0.46],
    [0.09, 0.445, 0.445],
    [0.3, 0.365, 0.365],
    [0.55, 0.28, 0.27],
    [0.8, 0.215, 0.185],
    [0.94, 0.19, 0.155],
    [1.0, 0.16, 0.125],
  ];
  const pleat = (a: number, k: number): number => 1 + (k < 4 ? 0.04 * (1 - k / 4) * Math.sin(a * 8) : 0);
  b.bind(skirtBind).paint(C.hem, { c2: C.robe, ao: 0.9, ao2: 1, mat: MAT.cloth, by: (_x, y) => (y - 0.08) / 0.34 });
  b.lathe(skirtProf, { seg: 16, cap0: false, cap1: false, shape: pleat });
  // 裙底：一片浅色衬裙(倒地时会朝向镜头；带一点自发光，不被「朝下的面压暗」的烘焙涂黑)
  b.paint(C.robeShade, { c2: C.hem, glow: 0.06, mat: MAT.cloth, line: 0 });
  b.lathe([[0.05, 0.02, 0.02], [0.058, 0.452, 0.452]], { seg: 16, cap1: false });
  b.paint(C.hem, { c2: C.robe, ao: 0.9, ao2: 1, mat: MAT.cloth });
  const skirtR = (y: number): number => {
    for (let i = 1; i < skirtProf.length; i++) {
      if (y <= skirtProf[i][0]) return lerp(skirtProf[i - 1][1], skirtProf[i][1], (y - skirtProf[i - 1][0]) / (skirtProf[i][0] - skirtProf[i - 1][0]));
    }
    return 0.16;
  };
  b.paint(C.trimDark, { c2: C.trim, mat: MAT.cloth });
  // 镶边是开口的环(不封底)：倒地时从裙底看进去是浅色衬裙，而不是一块深色的底盖
  b.lathe([[0.04, 0.465, 0.465], [0.05, 0.48, 0.48], [0.105, 0.455, 0.455], [0.11, 0.435, 0.435]], { seg: 16, cap0: false, cap1: false, shape: (a) => 1 + 0.04 * Math.sin(a * 8) });
  // 曲裾的绕襟：一道石青衣缘自右腰斜绕到左下摆
  b.paint(C.trim, { c2: C.trimDark, mat: MAT.cloth, line: 0 });
  b.sheet(8, 1, (u, v) => {
    const y = lerp(0.97, 0.13, u) + (v - 0.5) * 0.07;
    const ang = lerp(40, 200, u) * DEG;
    const r = skirtR(y) * (1 + (y < 0.55 ? 0.04 * (1 - y / 0.55) * Math.sin(ang * 8) : 0)) + 0.01;
    return [Math.cos(ang) * r, y, Math.sin(ang) * r * (y > 0.7 ? 0.86 : 1)];
  }, false);

  // ── 上身：月白深衣，交领右衽，石青领缘 ──
  b.bind(torsoBind(h)).paint(C.robeShade, { c2: C.robe, mat: MAT.cloth, gloss: 0.1 });
  b.lathe(
    [
      [0.86, 0.185, 0.15],
      [0.95, 0.178, 0.14],
      [1.02, 0.145, 0.114],
      [1.12, 0.162, 0.13],
      [1.22, 0.195, 0.152],
      [1.32, 0.2, 0.138],
      [1.385, 0.13, 0.105],
      [1.425, 0.07, 0.066],
    ],
    { seg: 12 },
  );
  b.bone(J.neck).paint(C.skin, { ao: 0.78, glow: 0.05, mat: MAT.skin });
  b.lathe([[1.4, 0.06, 0.06], [1.52, 0.058, 0.058]], { seg: 8, cap0: false });
  b.bone(J.chest).paint(C.trim, { c2: C.trimDark, mat: MAT.cloth });
  b.tube([[0.075, 1.44, 0.05, 0.03, 0.01], [0.045, 1.36, 0.128, 0.032, 0.01], [-0.03, 1.25, 0.152, 0.032, 0.01], [-0.11, 1.12, 0.128, 0.03, 0.01]], { seg: 4, up: [1, 0.4, 0] });
  b.tube([[-0.075, 1.44, 0.05, 0.03, 0.01], [-0.045, 1.37, 0.122, 0.03, 0.01], [0.0, 1.31, 0.14, 0.028, 0.01]], { seg: 4, up: [1, -0.4, 0] });
  // 腰间帛带(石青) + 金带钩
  b.bone(J.spine).paint(C.trim, { c2: C.trimDark, mat: MAT.cloth });
  b.lathe([[0.965, 0.184, 0.148], [0.985, 0.17, 0.134], [1.06, 0.153, 0.121], [1.075, 0.147, 0.117]], { seg: 12 });
  b.paint(C.gold, { c2: C.goldDark, gloss: 1, mat: MAT.metal });
  b.g(X(0, 1.02, 0.132, 0, 0, 0), () => b.extrude([[0, 0.04], [0.035, 0], [0, -0.04], [-0.035, 0]], 0.018, 0.006));
  // 两条长绶带(队伍色)，自腰前两侧垂下
  for (const [r, sgn] of [[ribL, 1], [ribR, -1]] as [number[], number][]) {
    const pts = ribbonPts(sgn);
    b.bind(chainBind(r, pts, J.hips)).paint(0xffffff, { team: 1, mat: MAT.cloth });
    strip(b, pts, { width: (v) => lerp(0.038, 0.058, v), axis: [1, 0, 0], bow: [0, 0, 0.012], nu: 2, nv: 6, tail: 'swallow', tailLen: 0.09, wave: 0.5 });
  }

  // ── 手臂：窄袖上臂 + 喇叭袖(石青袖缘、队伍色内衬、白毛袖口) ──
  b.sym((s) => {
    const x = d.shoulderX;
    // 上臂罩在斗篷里(绛红)，肘上一圈白毛滚边；小臂是深衣的喇叭袖
    b.bone(s > 0 ? J.armL : J.armR).paint(C.cloakLight, { c2: C.cloak, mat: MAT.cloth });
    b.limb([x, d.shoulderY + 0.03, 0], [x, d.elbowY + 0.03, 0], 0.096, 0.1, { seg: 8 });
    b.g(X(x, 0, 0), () => furRing(b, 0.1, 0.1, 0.028, 0.026, { c: C.fur, c2: C.furShade, tufts: 6, seg: 5, y: d.elbowY + 0.03 }));
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.robeShade, { c2: C.robe, mat: MAT.cloth, gloss: 0.1 });
    b.lathe([[d.wristY - 0.04, 0.108, 0.108, x, 0], [d.wristY + 0.01, 0.104, 0.104, x, 0], [d.wristY + 0.14, 0.082, 0.082, x, 0], [d.elbowY + 0.03, 0.066, 0.066, x, 0]], { seg: 10, cap0: false });
    b.paint(C.robeShade, { mat: MAT.cloth, ao: 0.7 });
    b.lathe([[d.wristY - 0.02, 0.02, 0.02, x, 0], [d.wristY - 0.036, 0.104, 0.104, x, 0]], { seg: 10, cap0: false, cap1: false });
    b.paint(C.trim, { c2: C.trimDark, mat: MAT.cloth });
    b.lathe([[d.wristY + 0.0, 0.108, 0.108, x, 0], [d.wristY + 0.04, 0.101, 0.101, x, 0]], { seg: 10, cap0: false, cap1: false });
    b.g(X(x, 0, 0), () => furRing(b, 0.108, 0.108, 0.03, 0.028, { c: C.fur, c2: C.furShade, tufts: 6, seg: 5, y: d.wristY - 0.04 }));
  });
  b.paint(C.skin, { glow: 0.07, mat: MAT.skin });
  hand(b, h, 1, 0.05, true);
  hand(b, h, -1, 0.05, true);

  // ── 绛红斗篷：披肩(前面敞开) + 垂到小腿的后摆(下缘白毛滚边，其上一道队伍色) ──
  b.bone(J.chest).paint(C.cloakLight, { c2: C.cloakDark, ao: 0.9, mat: MAT.cloth });
  {
    const rows = [[1.475, 0.1, 0.1], [1.41, 0.29, 0.2], [1.31, 0.385, 0.27], [1.17, 0.415, 0.3]];
    b.sheet(12, 3, (u, v) => {
      const a = lerp(144, 396, u) * DEG;
      const r = rows[Math.round(v * 3)];
      // 前襟两条边略向下垂
      const edge = Math.pow(Math.abs(u * 2 - 1), 6);
      return [Math.cos(a) * r[1], r[0] - edge * 0.07 * v, Math.sin(a) * r[2] - 0.015];
    });
  }
  b.bind(chainBind(cloak, cloakPts, J.chest)).paint(C.cloak, { c2: C.cloakDark, mat: MAT.cloth });
  const cloakW = (v: number): number => mix(0.3, 0.44, Math.sin(v * Math.PI * 0.5));
  const upper = [0, 0.22, 0.44, 0.66, 0.84].map((v) => polyAt(cloakPts, v));
  strip(b, upper, { width: (v) => cloakW(v * 0.84), bow: [0, 0, -0.19], wave: 0.16, nu: 6, nv: 8, tail: 'flat' });
  b.paint(0xffffff, { team: 1, mat: MAT.cloth });
  strip(b, [polyAt(cloakPts, 0.84), polyAt(cloakPts, 0.9)], { width: (v) => cloakW(0.84 + v * 0.06), bow: [0, 0, -0.19], nu: 6, nv: 1, tail: 'flat' });
  b.paint(C.cloak, { c2: C.cloakDark, mat: MAT.cloth });
  strip(b, [polyAt(cloakPts, 0.9), polyAt(cloakPts, 0.97)], { width: (v) => cloakW(0.9 + v * 0.07), bow: [0, 0, -0.19], nu: 6, nv: 1, tail: 'flat' });
  {
    // 下缘白毛滚边：沿后摆底边的弧线
    const p = polyAt(cloakPts, 0.985);
    const w = cloakW(1);
    const path: number[][] = [];
    for (let i = 0; i <= 8; i++) {
      const uu = (i / 8) * 2 - 1;
      path.push([p[0] + uu * w, p[1], p[2] - 0.19 * (1 - uu * uu), 0.045, 0.04]);
    }
    furTube(b, path, { c: C.fur, c2: C.furShade, tufts: 9, seg: 5, up: [0, 1, 0] });
  }
  // 雪白大毛领：俯视是红披肩上的大白环
  b.bone(J.chest);
  b.g(X(0, 1.405, 0.0, 15, 0, 0), () => furRing(b, 0.215, 0.195, 0.1, 0.085, { c: C.fur, c2: C.furShade, tufts: 9, amp: 0.2, lobes: 6, lobeAmp: 0.12, seg: 7 }));

  // ── 头：黑发高髻、白毛帽箍、金步摇、额前花钿 ──
  const hd = head(b, h, C.skin, hs);
  face(b, h, hd, { iris: 0x4a2c26, irisGlow: 0.12, brow: C.hair, browTilt: 4, browH: 0.012, browLen: 1.08, eyeW: 0.05, eyeH: 0.046, slant: 5, lash: 0.015, lip: C.lip, skin: C.skin, nose: 0.55, mouthW: 0.85, smile: 0.35, lite: true });
  hairCap(b, h, hd, {
    c: C.hair,
    c2: C.hairHi,
    thick: 0.028,
    gloss: 0,
    // 中分：额心略高，两鬓压低，耳后全盖
    line: (phi) => (phi < 0.8 ? 0.15 - 0.045 * Math.sin((phi / 0.8) * Math.PI * 0.5) : phi < 1.3 ? mix(0.105, -0.12, (phi - 0.8) / 0.5) : -0.3),
  });
  const cy = hd.cy;
  b.bone(J.head).paint(C.hair, { c2: C.hairHi, mat: MAT.fur });
  // 鬓边两绺垂发
  b.sym(() => b.tube([[0.205, cy + 0.07, 0.085, 0.034, 0.04], [0.235, cy - 0.1, 0.09, 0.036, 0.036], [0.225, cy - 0.3, 0.115, 0.028, 0.026], [0.21, cy - 0.44, 0.13, 0.008, 0.008]], { seg: 5, crease: 180 }));
  // 发髻：帽箍里升起的高髻，一道金箍
  b.ball(0, cy + 0.3 * hs, -0.04, 0.115, 0.1, 0.115, 1);
  b.ball(0, cy + 0.4 * hs, -0.06, 0.075, 0.065, 0.075, 1);
  b.paint(C.gold, { c2: C.goldDark, gloss: 1, mat: MAT.metal });
  b.g(X(0, cy + 0.355 * hs, -0.05, -8, 0, 0), () => b.torus(0.078, 0.012, 0.014, 8, 3, { crease: 30 }));
  // 金步摇：斜插在髻侧的一支簪，簪头一片金叶，垂两粒珠
  b.tube([[0.03, cy + 0.33 * hs, -0.02, 0.006], [0.2, cy + 0.4 * hs, 0.06, 0.006]], { seg: 3 });
  b.g(X(0.2, cy + 0.41 * hs, 0.065, 0, 30, -30), () => b.extrude([[0, 0.05], [0.03, 0.01], [0.018, -0.03], [-0.018, -0.03], [-0.03, 0.01]], 0.008, 0));
  b.paint(C.gold, { c2: 0xffe6a8, gloss: 1, glow: 0.12, mat: MAT.metal });
  b.ball(0.19, cy + 0.335 * hs, 0.075, 0.014, 0.018, 0.014, 0);
  b.ball(0.215, cy + 0.325 * hs, 0.055, 0.012, 0.016, 0.012, 0);
  // 额前花钿
  b.paint(C.lip, { glow: 0.1, line: 0 });
  b.g(X(0, cy + 0.085 * hs, hd.surf(0, cy + 0.085 * hs) + 0.002, -12, 0, 0), () => b.extrude([[0, 0.022], [0.012, 0.004], [0.007, -0.016], [-0.007, -0.016], [-0.012, 0.004]], 0.006, 0));
  // 白毛帽箍(昭君套)：俯视是「白环套黑髻」
  {
    const r = hd.ring(0.17 * hs);
    b.bone(J.head);
    b.g(X(0, cy + 0.168 * hs, r[2], -9, 0, 0), () => furRing(b, r[0] + 0.03, r[1] + 0.03, 0.052, 0.05, { c: C.fur, c2: C.furShade, tufts: 9, amp: 0.18, lobes: 5, seg: 6 }));
  }
  // 脑后低垂的发束(弹簧链)，末端系一段绛红发带
  b.bind(chainBind(hair, hairPts, J.head)).paint(C.hair, { c2: C.hairHi, mat: MAT.fur });
  b.tube(
    [
      [0, hcy - 0.06, -0.2, 0.09, 0.05],
      [0, hcy - 0.2, -0.27, 0.085, 0.05],
      [0, 1.36, -0.335, 0.072, 0.045],
      [0, 1.16, -0.37, 0.06, 0.04],
      [0, 0.98, -0.38, 0.04, 0.03],
      [0, 0.8, -0.385, 0.008, 0.008],
    ],
    { seg: 7, up: [1, 0, 0], crease: 180 },
  );
  b.paint(C.cloakLight, { c2: C.cloak, mat: MAT.cloth });
  b.tube([[0, 1.2, -0.365, 0.066, 0.046], [0, 1.14, -0.372, 0.064, 0.044]], { seg: 7, up: [1, 0, 0], cap0: false, cap1: false });

  // ── 琵琶：梨形音箱 + 曲项 + 四弦。先在琴自身坐标里建(y 沿弦朝琴头，z 为面板法线)，整体转到怀抱的位置 ──
  b.bone(pipa);
  b.g(T, () => {
    // 背板与琴颈：深色木
    b.paint(C.woodDeep, { c2: C.woodDark, gloss: 0.5, mat: MAT.leather });
    b.lathe(
      [
        [-0.27, 0.03, 0.02, 0, -0.01],
        [-0.235, 0.115, 0.045, 0, -0.012],
        [-0.14, 0.165, 0.056, 0, -0.016],
        [-0.03, 0.172, 0.056, 0, -0.016],
        [0.08, 0.13, 0.048, 0, -0.012],
        [0.18, 0.066, 0.036, 0, -0.006],
        [0.25, 0.034, 0.028, 0, 0],
      ],
      { seg: 10, crease: 180 },
    );
    b.tube([[0, 0.23, 0, 0.03, 0.026], [0, 0.5, 0.004, 0.024, 0.022]], { seg: 6 });
    // 曲项：琴头向后折，末端一个小卷
    b.tube([[0, 0.49, 0.004, 0.026, 0.022], [0, 0.56, -0.03, 0.03, 0.02], [0, 0.63, -0.1, 0.028, 0.018], [0, 0.645, -0.15, 0.02, 0.016], [0, 0.61, -0.17, 0.008, 0.008]], { seg: 5, crease: 180 });
    // 四个弦轸
    b.paint(C.woodShade, { c2: C.wood, gloss: 0.5, mat: MAT.leather });
    for (const [y, z, sx] of [[0.55, -0.025, 1], [0.59, -0.062, -1], [0.615, -0.092, 1], [0.635, -0.125, -1]]) {
      b.tube([[sx * 0.02, y, z, 0.012], [sx * 0.085, y + 0.006, z, 0.016], [sx * 0.1, y + 0.008, z, 0.01]], { seg: 4 });
    }
    // 面板：浅色木，略高出背板
    b.paint(C.woodShade, { c2: C.wood, gloss: 0.5, mat: MAT.leather });
    const board: number[][] = [];
    const half = [[-0.262, 0.03], [-0.228, 0.108], [-0.14, 0.157], [-0.03, 0.164], [0.08, 0.122], [0.18, 0.06], [0.245, 0.03]];
    for (const [y, w] of half) board.push([w, y]);
    for (let i = half.length - 1; i >= 0; i--) board.push([-half[i][1], half[i][0]]);
    b.g(X(0, 0, 0.03), () => b.extrude(board, 0.024, 0.006));
    // 捍拨：拨弦处一块绛红漆底，上有一弯金月
    b.paint(C.cloak, { c2: C.cloakLight, gloss: 0.5, mat: MAT.leather, line: 0 });
    b.g(X(0, -0.06, 0.044), () => b.extrude([[-0.085, 0.05], [0.085, 0.05], [0.1, -0.03], [0.06, -0.06], [-0.06, -0.06], [-0.1, -0.03]], 0.006, 0));
    b.paint(C.gold, { c2: 0xfff0c0, gloss: 1, glow: 0.2, mat: MAT.metal, line: 0 });
    const moon: number[][] = [];
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * (0.15 + (0.7 * i) / 6);
      moon.push([Math.cos(a) * 0.05, -Math.sin(a) * 0.05 + 0.03]);
    }
    for (let i = 6; i >= 0; i--) {
      const a = Math.PI * (0.15 + (0.7 * i) / 6);
      moon.push([Math.cos(a) * 0.05, -Math.sin(a) * 0.026 + 0.036]);
    }
    b.g(X(0, -0.075, 0.049), () => b.extrude(moon, 0.005, 0));
    // 覆手(系弦的横木)与品
    b.paint(C.woodDeep, { gloss: 0.5, mat: MAT.leather, line: 0 });
    b.box(0, -0.17, 0.05, 0.1, 0.022, 0.018, 0.004);
    b.paint(C.wood, { c2: 0xfff2d8, gloss: 0.4, mat: MAT.leather, line: 0 });
    for (const y of [0.12, 0.2, 0.28, 0.36, 0.44]) b.box(0, y, y < 0.22 ? 0.046 : 0.03, y < 0.22 ? 0.07 : 0.05, 0.012, 0.012);
    // 四弦：发光的细线。施法时由自发光倍率提亮，就是「弦光」
    b.paint(C.string, { c2: 0xffffff, glow: 0.35, gloss: 1, mat: MAT.metal, line: 0 });
    for (const sx of [-0.027, -0.009, 0.009, 0.027]) {
      b.tube([[sx, -0.17, 0.062, 0.0055], [sx * 0.9, 0.1, 0.056, 0.0055], [sx * 0.7, 0.49, 0.036, 0.005]], { seg: 3 });
    }
  });

  b.bakeGrounding(2.05, 0.75, 0.9);
  return {
    h,
    b,
    extra: {
      pipa, pipaPos, pluck, free,
      ax: [toJoint(1, 0, 0), toJoint(0, 1, 0), toJoint(0, 0, 1)],
      // 右手腕停在弦的右外侧，指尖落在捍拨上；左手腕在琴颈左下方，手掌托住琴颈
      handR: (() => {
        const p = toJoint(-0.09, -0.02, 0.11);
        return [p[0] - 0.02, p[1] + 0.03, p[2] + 0.01];
      })(),
      handL: (() => {
        const p = toJoint(0.0, 0.3, 0.0);
        return [p[0] + 0.03, p[1] - 0.06, p[2] + 0.02];
      })(),
      face: toJoint(0, -0.04, 0.07),
    },
  };
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 2.1, stance: 0.42, lift: 0.14, bob: 0.028, drop: 0.03, lean: 11, twist: 4, sway: 0.02, width: 0.1, arm: 0 };

interface Anims {
  stance: CKP;
  tmp: CKP;
  atk: TrackKey[];
  s1: TrackKey[];
  s2: TrackKey[];
  ult: TrackKey[];
  run: CKP;
  channel: CKP;
  common: CommonAnims;
}

function makeAnims(h: Human): Anims {
  // 站姿：身体微侧抱琴，微微低头看弦
  const stance = kp(h, null, {
    hipsPos: [0, -0.01, 0],
    hips: [0, -10, 2],
    spine: [1, 4, -2],
    chest: [2, 4, 0],
    neck: [6, 2, 0],
    head: [8, 6, -3],
    footL: [0.11, 0.09, 0.06, 0, 10],
    footR: [-0.12, 0.09, -0.05, 0, -16],
  });
  // 普攻：右手抬起 → 自上而下一扫弦，琴面朝目标一送
  const aWind = kp(h, stance, { hips: [0, -16, 2], chest: [-2, -4, 0], head: [2, 14, -2], pipa: [-8, 0, 4], pluck: [0.02, 0.13, 0.07] });
  const aHit = kp(h, stance, { hipsPos: [0, -0.03, 0.04], hips: [2, -2, 0], chest: [6, 10, 0], head: [0, -6, 0], pipa: [14, 0, -4], pipaPos: [0, 0.0, 0.05], pluck: [-0.03, -0.14, 0.02] });
  const aOut = kp(h, aHit, { pluck: [-0.1, -0.2, 0.12] });
  const atk = track([
    [0, stance],
    [0.2, aWind, E.out],
    [0.35, aHit, E.in3],
    [0.5, aOut, E.out],
    [1, stance, E.io],
  ]);
  // 一技能·一弦穿云(推)：收手蓄势 → 右手向外推弹，上身前送，琴头前倾指向目标
  const s1Wind = kp(h, stance, { hipsPos: [0, -0.03, -0.05], hips: [-2, -22, 0], spine: [-4, -6, 0], chest: [-6, -12, 0], head: [2, 30, 0], pipa: [-12, 0, 8], pluck: [0.04, 0.06, 0.0] });
  const s1Hit = kp(h, stance, {
    hipsPos: [0, -0.07, 0.12],
    hips: [8, 6, 0],
    spine: [8, 6, 0],
    chest: [10, 12, 0],
    neck: [-8, 0, 0],
    head: [-10, -14, 0],
    footL: [0.11, 0.09, 0.26, 0, 8],
    footR: [-0.12, 0.1, -0.14, 16, -20],
    pipa: [42, -8, -6],
    pipaPos: [0.02, 0.05, 0.1],
    pluck: [-0.16, -0.06, 0.26],
  });
  const s1 = track([
    [0, stance],
    [0.24, s1Wind, E.out],
    [0.42, s1Hit, E.in3],
    [0.72, s1Hit, E.lin],
    [1, stance, E.io],
  ]);
  // 二技能·回环收弦(却)：右手先探出 → 向内勾回，身体后仰，琴立起来，左手在琴颈上滑一下
  const s2Out = kp(h, stance, { hipsPos: [0, -0.03, 0.05], hips: [4, -4, 0], chest: [8, 6, 0], head: [-4, -4, 0], pipa: [20, 0, -6], pipaPos: [0, 0, 0.05], pluck: [-0.18, 0.02, 0.24] });
  const s2In = kp(h, stance, {
    hipsPos: [0, -0.02, -0.07],
    hips: [-6, -14, 0],
    spine: [-6, 0, 0],
    chest: [-8, -6, 0],
    neck: [-6, 0, 0],
    head: [-12, 10, 0],
    footR: [-0.12, 0.09, -0.16, 0, -20],
    pipa: [-16, 6, 16],
    pipaPos: [0.02, 0.06, -0.03],
    pluck: [0.07, 0.1, -0.01],
    free: [0, 0, -0.1],
  });
  const s2 = track([
    [0, stance],
    [0.3, s2Out, E.out],
    [0.5, s2In, E.in3],
    [0.78, s2In, E.lin],
    [1, stance, E.io],
  ]);
  // 大招·雁落平沙：把琴抱高，仰头望天，右手轮指(手的抖动在 animate 里叠加)
  const ultUp = kp(h, stance, {
    hipsPos: [0, 0.03, -0.02],
    hips: [-4, 0, 0],
    spine: [-6, 0, 0],
    chest: [-10, 0, 0],
    neck: [-12, 0, 0],
    head: [-20, 0, 0],
    footL: [0.1, 0.11, 0.04, 14, 8],
    footR: [-0.11, 0.11, -0.04, 14, -12],
    pipa: [-10, 4, 12],
    pipaPos: [0.03, 0.1, 0.0],
    pluck: [0, 0.02, 0.01],
  });
  const ult = track([
    [0, stance],
    [0.4, ultUp, E.out],
    [1, ultUp, E.lin],
  ]);
  const run = kp(h, null, { pipa: [-6, 0, 4], pipaPos: [0, 0.02, -0.01], head: [-4, 0, 0] });
  // 回城引导：抱琴垂首，右手按住弦
  const channel = kp(h, stance, { hipsPos: [0, -0.03, 0], chest: [6, 0, 0], neck: [10, 0, 0], head: [16, 0, 0], pipa: [-6, 0, 6], pluck: [0.05, 0.02, -0.02] });
  const common = makeCommon(h, stance, {
    // 倒地：松开双手，琴落在身侧
    lying: { free: [1, 1, 0], pipaPos: [0.5, -0.1, -0.02], pipa: [14, 0, 70], armL: [-6, 0, 60], foreL: [-24, 0, 0], armR: [-4, 0, -66], foreR: [-16, 0, 0] },
  });
  return { stance, tmp: emptyCKP(h), atk, s1, s2, ult, run, channel, common };
}

const _sv = new Float32Array(8);

export function createXingli(): ModelDef {
  const { h, b, extra } = build();
  const A = makeAnims(h);
  const J = h.J;
  const k = A.tmp;
  const geometry = b.build();
  const PP = extra.pipaPos * 3;
  const PL = extra.pluck * 3;
  const FR = extra.free * 3;
  const [ax, ay, az] = extra.ax;

  /**
   * 躯干与琴的转角就位之后：写入琴的平移，再把双手放到琴上。
   * shake 为右手沿弦方向的附加位移(拨弦、轮指)。
   */
  const hold = (pose: Pose, e: Float32Array, shake = 0): void => {
    pose.pos(extra.pipa, e[PP], e[PP + 1], e[PP + 2]);
    const q = pose.q;
    const wl = 1 - sat(e[FR + 1]);
    if (wl > 0.01) {
      for (let i = 0; i < 4; i++) {
        _sv[i] = q[J.armL * 4 + i];
        _sv[4 + i] = q[J.foreL * 4 + i];
      }
      const sl = e[FR + 2];
      reachHand(h, pose, 1, extra.pipa, extra.handL[0] + ay[0] * sl, extra.handL[1] + ay[1] * sl, extra.handL[2] + ay[2] * sl, 0.6, -0.75, -0.3);
      if (wl < 0.99) {
        mixQ(q, J.armL * 4, _sv, 0, wl);
        mixQ(q, J.foreL * 4, _sv, 4, wl);
      }
    }
    const wr = 1 - sat(e[FR]);
    if (wr > 0.01) {
      for (let i = 0; i < 4; i++) {
        _sv[i] = q[J.armR * 4 + i];
        _sv[4 + i] = q[J.foreR * 4 + i];
      }
      const u = e[PL];
      const v = e[PL + 1] + shake;
      const n = e[PL + 2];
      reachHand(
        h, pose, -1, extra.pipa,
        extra.handR[0] + ax[0] * u + ay[0] * v + az[0] * n,
        extra.handR[1] + ax[1] * u + ay[1] * v + az[1] * n,
        extra.handR[2] + ax[2] * u + ay[2] * v + az[2] * n,
        -0.75, -0.55, -0.25,
      );
      if (wr < 0.99) {
        mixQ(q, J.armR * 4, _sv, 0, wr);
        mixQ(q, J.foreR * 4, _sv, 4, wr);
      }
    }
  };

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const C0 = A.common;
    if (animateCommon(h, pose, a.anim === 'leap' ? 'airborne' : a.anim, a.t, a.p, a.time, C0)) {
      hold(pose, (a.anim === 'dead' ? C0.tmp : a.anim === 'stunned' ? C0.stun : C0.air).e);
      if (a.anim === 'dead') out.glow = Math.max(0.1, 1 - a.t * 1.2);
      return;
    }
    let power = 0;
    let shake = 0;
    switch (a.anim) {
      case 'move':
      case 'dash': {
        const e = A.run.e;
        runCycle(h, pose, a.stride, RUN, () => {
          // 抱琴小步快走：上身稳，头略抬看路
          pose.add(J.head, e[J.head * 3], 0, 0);
          pose.rot(extra.pipa, e[extra.pipa * 3] + Math.sin(a.stride * Math.PI * 4) * 1.5, 0, e[extra.pipa * 3 + 2]);
        });
        hold(pose, e);
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        sampleTrack(A.atk, p, k);
        applyCKP(h, pose, k);
        hold(pose, k.e);
        power = bump(p, 0.36, 0.2) * 0.7;
        break;
      }
      case 'cast_s1': {
        sampleTrack(A.s1, a.p, k);
        applyCKP(h, pose, k);
        hold(pose, k.e);
        power = bump(a.p, 0.44, 0.34);
        break;
      }
      case 'cast_s2': {
        sampleTrack(A.s2, a.p, k);
        applyCKP(h, pose, k);
        hold(pose, k.e);
        power = bump(a.p, 0.5, 0.36);
        break;
      }
      case 'cast_ult':
      case 'spin': {
        sampleTrack(A.ult, a.p, k);
        // 轮指：右手沿弦高频小幅来回，幅度先起后衰
        const env = Math.min(1, a.p * 3) * (1 - 0.6 * a.p);
        shake = Math.sin(a.t * 44) * 0.035 * env;
        applyCKP(h, pose, k, () => {
          pose.add(J.chest, 0, Math.sin(a.t * 44) * 1.2 * env, 0);
        });
        hold(pose, k.e, shake);
        power = Math.min(1, a.p * 3) * (0.8 + 0.2 * Math.sin(a.t * 44));
        break;
      }
      case 'channel': {
        applyCKP(h, pose, A.channel, () => breathe(h, pose, a.time, a.seed, 0.8));
        hold(pose, A.channel.e);
        power = 0.2 + 0.1 * Math.sin(a.time * 4);
        break;
      }
      default: {
        // 待机：每隔两三秒轻拨一下弦
        const cyc = (a.time * 0.36 + a.seed) % 1;
        const tw = bump(cyc, 0.5, 0.07);
        shake = -tw * 0.05;
        applyCKP(h, pose, A.stance, () => {
          breathe(h, pose, a.time, a.seed);
          pose.add(J.head, tw * 2, 0, 0);
          pose.add(J.hips, 0, 0, Math.sin(a.time * 0.8 + a.seed * 4) * 1.2);
        });
        hold(pose, A.stance.e, shake);
        power = tw * 0.3;
      }
    }
    out.glow = 1 + power * 2.6 + 0.08 * Math.sin(a.time * 2.6);
  };

  return {
    key: 'hero:xingli',
    geometry,
    rig: h.rig,
    height: 2.14,
    radius: 0.6,
    scale: SCALE,
    stride: RUN.stride * SCALE,
    triangles: b.triangleCount,
    attach: {
      head: { joint: J.head, x: 0, y: 0.25, z: 0 },
      chest: { joint: J.chest, x: 0, y: 0.08, z: 0 },
      handR: { joint: J.handR, x: 0, y: -0.07, z: 0 },
      handL: { joint: J.handL, x: 0, y: -0.07, z: 0 },
      weapon: { joint: extra.pipa, x: extra.face[0], y: extra.face[1], z: extra.face[2] },
      muzzle: { joint: extra.pipa, x: extra.face[0], y: extra.face[1], z: extra.face[2] },
    },
    // 施法动作很短(0.2~0.4 秒)：收招放慢一些，让推/却/仰头的姿态多留一会儿
    blend: (from, to) => (to === 'attack' ? 0.08 : to === 'dead' ? 0.05 : to.startsWith('cast_') ? 0.07 : from.startsWith('cast_') ? 0.3 : 0.14),
    animate,
  };
}
