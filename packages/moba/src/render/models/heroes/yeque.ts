/**
 * 荆轲 · 刺客：精瘦冷峻的战国游侠。束发露面(偏后的椎髻 + 白色束发带)，近黑的墨紫交领窄袖短衣，皮束腕、绑腿软靴；
 * 颈后一条长长的素白巾拖在身后(呼应易水送行的白衣冠)，末端像蘸了墨；背上斜挎督亢地图的漆木卷筒(两端铜箍)；
 * 右手反握一柄淬过药的青钢主匕(徐夫人匕首，柳叶刃、青铜环首，刃口一线寒光)，左手一把更小的素钢副匕；后腰别三把小飞匕。
 * 俯视识别三要素：黑衣小身形、身后长长的素白巾、背上斜挎的一根卷筒。跑动时身体压低。
 * 造型依据只有《史记·刺客列传》《战国策·燕策三》(易水送别、徐夫人匕首、图穷匕见)。
 */
import { type CKP, type CommonAnims, E, type Human, type HumanDims, type RunStyle, RUN_DEFAULT, STANDARD_DIMS, type TrackKey, animateCommon, applyCKP, breathe, bump, emptyCKP, humanRig, kp, makeCommon, runCycle, sampleTrack, sat, seg, strikeWarp, track } from '../humanoid';
import { MAT, ModelBuilder, type SoftBind, X, lerp } from '../kit';
import { boot, chainBind, face, hairCap, hand, head, lock, strip, torsoBind, trim } from '../parts';
import type { Pose } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const C = {
  suit: 0x242030,
  suitHi: 0x4a3f66,
  suitDark: 0x18141f,
  sash: 0x4a3a78,
  sashDark: 0x2c2248,
  scarf: 0xece8de,
  scarfShade: 0xc9c3b4,
  ink: 0x1a1626,
  leather: 0x3e2e26,
  leatherLight: 0x6a5040,
  bronze: 0xa8843c,
  bronzeDark: 0x6e5524,
  steel: 0x9fc2c8,
  steelDark: 0x5e7a82,
  edge: 0xd8f4f2,
  plain: 0xb8bcc4,
  skin: 0xe2b690,
  hair: 0x18161c,
  hairHi: 0x3a3644,
  tube: 0x5a2a1e,
  tubeDark: 0x34160f,
  silk: 0xe8dfc6,
  silkShade: 0xbfb294,
};

const DIMS: HumanDims = { ...STANDARD_DIMS, hipX: 0.11, shoulderX: 0.275, clavX: 0.08 };
const SCALE = 1.17;

/** 帛卷的帛面沿长度分成几段(每一排顶点各跟一个关节) */
const FURL_N = 5;
/** 帛面全长(米) */
const FURL_LEN = 1.05;

interface Extra {
  /** 大招里从左手抖开的帛卷(平时缩到看不见)：卷轴所在的关节 */
  furl: number;
  /** 帛面第 1..FURL_N 排的关节(父关节都是 furl)，与各排(含第 0 排 = 卷轴)在绑定姿态里的位置 */
  furlRows: number[];
  furlPts: number[][];
}

function build(): { h: Human; b: ModelBuilder; extra: Extra } {
  const h = humanRig(DIMS);
  const { rig, J, d } = h;
  const b = new ModelBuilder();
  const hs = 0.94;

  // ── 弹簧链：素白长巾(主尾 + 短尾)、腰间垂带 ──
  const scarfPts = [[0.05, 1.42, -0.16], [0.1, 1.32, -0.42], [0.12, 1.1, -0.64], [0.12, 0.84, -0.78], [0.1, 0.56, -0.86], [0.08, 0.28, -0.9]];
  const scarf = rig.addChain('scarf', J.chest, scarfPts.slice(0, 5));
  rig.chain({ joints: scarf, tip: [-0.02, -0.28, -0.04], stiffness: 2.6, drag: 0.93, gravity: 5, maxAngle: 80, wind: 3.4, colliders: [{ joint: J.chest, x: 0, y: 0, z: 0, r: 0.24 }] });
  const scarf2Pts = [[-0.07, 1.42, -0.15], [-0.14, 1.28, -0.36], [-0.17, 1.06, -0.5], [-0.18, 0.82, -0.56]];
  const scarf2 = rig.addChain('scarfB', J.chest, scarf2Pts.slice(0, 3));
  rig.chain({ joints: scarf2, tip: [0, -0.24, -0.06], stiffness: 3.4, drag: 0.92, gravity: 6, maxAngle: 80, wind: 3, colliders: [{ joint: J.chest, x: 0, y: 0, z: 0, r: 0.24 }] });
  const sashPts = [[-0.17, 0.94, -0.06], [-0.24, 0.72, -0.12], [-0.27, 0.5, -0.16], [-0.28, 0.3, -0.18]];
  const sash = rig.addChain('sash', J.hips, sashPts.slice(0, 3));
  rig.chain({ joints: sash, tip: [0, -0.2, -0.02], stiffness: 5, drag: 0.9, gravity: 9, maxAngle: 65, wind: 1.4 });
  // 帛卷：卷轴挂在左手上；帛面的每一排顶点各跟一个关节——展开时卷尾的木轴带着还没放出来的帛面从手边一排一排滚向远端
  const furl = rig.add('furl', J.handL, d.shoulderX, d.handY, 0);
  const silkMid = (v: number): number[] => [d.shoulderX, d.handY - 0.02 - v * FURL_LEN, 0.05 + 0.3 * Math.sin(v * Math.PI * 0.55)];
  const furlPts = Array.from({ length: FURL_N + 1 }, (_, i) => silkMid(i / FURL_N));
  const furlRows = furlPts.slice(1).map((p, i) => rig.add(`furl${i + 1}`, furl, p[0], p[1], p[2]));

  // 短衣下摆的蒙皮：腰部跟髋，越往下越跟同侧大腿
  const skirtBind: SoftBind = (x, y) => {
    const thigh = x >= 0 ? J.thighL : J.thighR;
    if (y >= 0.92) return [J.hips, J.hips, 1];
    return [J.hips, thigh, sat((y - 0.6) / 0.32)];
  };

  // ── 腿：紧身裤 + 绑腿 + 软底靴 ──
  b.sym((s) => {
    const x = d.hipX;
    b.bone(s > 0 ? J.thighL : J.thighR).paint(C.suit, { c2: C.suitDark, ao: 0.9, ao2: 1, mat: MAT.cloth });
    b.limb([x, d.hipY + 0.04, 0], [x, d.kneeY, 0], 0.108, 0.082, { seg: 8, bulge: 0.04 });
  });
  for (const s of [1, -1] as const) {
    b.paint(C.suitDark, { c2: C.leather, mat: MAT.leather, gloss: 0.15 });
    boot(b, h, s, { top: 0.32, rTop: 0.082, rAnkle: 0.066, len: 0.22, toe: 0.01 });
    // 绑腿：深色缠带斜缠到膝下
    b.bone(s > 0 ? J.shinL : J.shinR).paint(C.suitHi, { c2: C.suit, mat: MAT.cloth });
    for (const y of [0.32, 0.38, 0.44]) b.g(X(s * d.hipX, y, 0, 14, 0, 0), () => b.torus(0.084, 0.009, 0.014, 8, 3, { crease: 30 }));
  }

  // ── 短衣下摆：到大腿中段，前后开衩 ──
  b.bind(skirtBind).paint(C.suit, { c2: C.suitDark, ao: 0.9, ao2: 1, mat: MAT.cloth, by: (_x, y) => (y - 0.62) / 0.32 });
  b.lathe([[0.62, 0.19, 0.17], [0.72, 0.185, 0.162], [0.84, 0.175, 0.145], [0.94, 0.168, 0.136]], { seg: 12, cap0: false, cap1: false, shape: (a, k) => 1 + (k < 2 ? 0.035 * Math.sin(a * 5) : 0) });
  b.paint(C.suitHi, { c2: C.suit, mat: MAT.cloth });
  b.lathe([[0.61, 0.193, 0.173], [0.62, 0.197, 0.177], [0.66, 0.193, 0.173]], { seg: 12, cap0: false, cap1: false, shape: (a) => 1 + 0.035 * Math.sin(a * 5) });

  // ── 躯干：精瘦，交领右衽 ──
  b.bind(torsoBind(h)).paint(C.suit, { c2: C.suitHi, ao: 0.88, ao2: 1, mat: MAT.cloth });
  b.lathe(
    [
      [0.86, 0.172, 0.138],
      [0.94, 0.168, 0.132],
      [1.0, 0.145, 0.112],
      [1.1, 0.165, 0.126],
      [1.21, 0.205, 0.146],
      [1.33, 0.215, 0.14],
      [1.39, 0.14, 0.108],
      [1.43, 0.072, 0.068],
    ],
    { seg: 12 },
  );
  b.bone(J.neck).paint(C.skin, { ao: 0.75, glow: 0.05, mat: MAT.skin });
  b.lathe([[1.4, 0.058, 0.058], [1.53, 0.056, 0.056]], { seg: 8, cap0: false });
  b.bone(J.chest).paint(C.suitHi, { c2: C.suit, mat: MAT.cloth });
  b.tube([[0.07, 1.44, 0.05, 0.026, 0.01], [0.04, 1.37, 0.118, 0.028, 0.01], [-0.04, 1.26, 0.142, 0.028, 0.01], [-0.11, 1.12, 0.122, 0.026, 0.01]], { seg: 4, up: [1, 0.4, 0] });
  b.tube([[-0.07, 1.44, 0.05, 0.026, 0.01], [-0.045, 1.38, 0.112, 0.026, 0.01], [0.0, 1.32, 0.13, 0.024, 0.01]], { seg: 4, up: [1, -0.4, 0] });
  // 卷筒的皮背带：右肩斜下到左腰
  b.paint(C.leather, { c2: C.leatherLight, gloss: 0.3, mat: MAT.leather });
  b.tube([[-0.19, 1.39, 0.06, 0.028, 0.012], [-0.07, 1.27, 0.15, 0.03, 0.012], [0.08, 1.12, 0.14, 0.03, 0.012], [0.16, 1.03, 0.07, 0.028, 0.012], [0.17, 1.0, -0.06, 0.028, 0.012]], { seg: 4, up: [0, 0.6, 0.8] });
  b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
  b.g(X(-0.07, 1.27, 0.158, 0, 0, 40), () => b.box(0, 0, 0, 0.04, 0.03, 0.014, 0.006));
  // 暗紫宽帛带 + 一道队伍色
  b.bone(J.spine).paint(C.sash, { c2: C.sashDark, mat: MAT.cloth });
  b.lathe([[0.9, 0.18, 0.146], [0.92, 0.186, 0.15], [1.02, 0.158, 0.124], [1.04, 0.15, 0.118]], { seg: 12 });
  b.paint(0xffffff, { team: 1, mat: MAT.cloth });
  b.lathe([[0.955, 0.183, 0.148], [0.965, 0.186, 0.151], [0.985, 0.17, 0.138]], { seg: 12, cap0: false, cap1: false });
  b.bind(chainBind(sash, sashPts, J.hips)).paint(C.sash, { c2: C.sashDark, mat: MAT.cloth });
  strip(b, sashPts, { width: (v) => lerp(0.05, 0.072, v), axis: [0.3, 0, 1], bow: [-0.015, 0, 0], nu: 2, nv: 6, tail: 'swallow', tailLen: 0.1, wave: 0.4 });
  // 后腰别着的三把小飞匕
  b.bone(J.hips);
  for (let i = 0; i < 3; i++) {
    b.g(X(-0.06 + i * 0.06, 0.97, -0.16, 0, 0, 180 + (i - 1) * 14), () => {
      b.paint(C.leather, { mat: MAT.leather });
      b.tube([[0, -0.02, 0, 0.012], [0, 0.06, 0, 0.012]], { seg: 4 });
      b.paint(C.plain, { c2: C.steelDark, gloss: 1, mat: MAT.metal });
      b.tube([[0, 0.06, 0, 0.004, 0.022], [0, 0.11, 0, 0.004, 0.02], [0, 0.17, 0, 0.002, 0.003]], { seg: 4, up: [1, 0, 0], crease: 0 });
    });
  }

  // ── 手臂：窄袖 + 皮束腕(队伍色系带) ──
  b.sym((s) => {
    const x = d.shoulderX;
    b.bone(s > 0 ? J.armL : J.armR).paint(C.suit, { c2: C.suitHi, ao: 0.9, ao2: 1, mat: MAT.cloth });
    b.ball(x, d.shoulderY, 0, 0.078, 0.078, 0.078, 1);
    b.limb([x, d.shoulderY, 0], [x, d.elbowY, 0], 0.072, 0.06, { seg: 8 });
    b.bone(s > 0 ? J.foreL : J.foreR).paint(C.suit, { c2: C.suitHi, mat: MAT.cloth });
    b.ball(x, d.elbowY, 0, 0.062, 0.062, 0.062, 1);
    b.limb([x, d.elbowY, 0], [x, d.wristY, 0], 0.058, 0.05, { seg: 8 });
    b.paint(C.leather, { c2: C.leatherLight, gloss: 0.3, mat: MAT.leather });
    b.lathe([[d.wristY - 0.01, 0.058, 0.058, x, 0], [d.wristY + 0.02, 0.066, 0.066, x, 0], [d.wristY + 0.16, 0.07, 0.07, x, 0], [d.wristY + 0.175, 0.06, 0.06, x, 0]], { seg: 8 });
    b.paint(0xffffff, { team: 1, mat: MAT.cloth });
    trim(b, x, d.wristY + 0.09, 0, 0.07, 0.07, 0.009, 0.022, 8);
  });
  b.paint(C.skin, { glow: 0.06, ao: 0.9, mat: MAT.skin });
  hand(b, h, 1, 0.054);
  hand(b, h, -1, 0.054);

  // ── 背上斜挎的图卷筒：漆木圆筒，两端铜箍，队伍色系带(从右肩斜到左腰后) ──
  b.bone(J.chest);
  b.g(X(0.0, 1.18, -0.23, 0, 0, -52), () => {
    b.paint(C.tube, { c2: C.tubeDark, gloss: 0.55, mat: MAT.leather });
    b.tube([[0, -0.34, 0, 0.05], [0, 0.34, 0, 0.05]], { seg: 8 });
    b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
    for (const y of [-0.34, 0.34]) b.tube([[0, y - 0.03, 0, 0.056], [0, y + 0.03, 0, 0.056]], { seg: 8, crease: 30 });
    b.tube([[0, 0.37, 0, 0.03], [0, 0.4, 0, 0.012]], { seg: 6 });
    b.paint(0xffffff, { team: 1, mat: MAT.cloth });
    for (const y of [-0.14, 0.14]) b.tube([[0, y - 0.012, 0, 0.054], [0, y + 0.012, 0, 0.054]], { seg: 8, cap0: false, cap1: false });
  });

  // ── 头：束发露面，剑眉细长眼、薄唇、无须；偏后的椎髻 + 白色束发带(两条短尾)，额前几绺散发 ──
  const hd = head(b, h, C.skin, hs, 0.25, 0.98);
  const cy = hd.cy;
  face(b, h, hd, {
    iris: 0x1e1612, irisGlow: 0.04, irisSize: 0.6, brow: C.hair, browTilt: 16, browH: 0.02, browLen: 1.12, eyeW: 0.05, eyeH: 0.034, slant: 8, lash: 0.017,
    lip: 0x9a6050, skin: C.skin, nose: 0.85, ears: true, mouthW: 0.8, smile: -0.2, lite: true,
  });
  hairCap(b, h, hd, {
    c: C.hair,
    c2: C.hairHi,
    thick: 0.026,
    gloss: 0.3,
    line: (phi) => (phi < 0.8 ? 0.15 : phi < 1.35 ? lerp(0.15, -0.08, (phi - 0.8) / 0.55) : -0.3),
  });
  b.bone(J.head).paint(C.hair, { c2: C.hairHi, gloss: 0.3, mat: MAT.fur });
  // 椎髻：脑后偏上
  b.ball(0, cy + 0.2, -0.17, 0.08, 0.075, 0.08, 1);
  b.ball(0, cy + 0.25, -0.21, 0.055, 0.05, 0.055, 1);
  // 额前与鬓边的散发
  for (const [x, len, cx] of [[0.12, 0.15, 0.03], [-0.13, 0.12, -0.03], [0.19, 0.22, 0.01], [-0.19, 0.2, -0.01]] as const) {
    const y = cy + 0.15;
    lock(b, [x, y, hd.surf(x, y) - 0.01], [x * 0.3, -1, 0.3], len, 0.03, { curl: [cx, 0.02, 0.08], n: 3, seg: 4, flat: 0.45, up: [1, 0, 0], tip: 0.15 });
  }
  // 白色束发带：箍住发髻根，脑后垂两条短尾
  b.paint(C.scarf, { c2: C.scarfShade, mat: MAT.cloth });
  b.g(X(0, cy + 0.2, -0.15, 50, 0, 0), () => b.torus(0.074, 0.016, 0.02, 10, 3));
  b.tube([[0.02, cy + 0.19, -0.24, 0.024, 0.006], [0.05, cy + 0.08, -0.29, 0.03, 0.006], [0.08, cy - 0.04, -0.3, 0.034, 0.005]], { seg: 4, up: [1, 0, 0] });
  b.tube([[-0.02, cy + 0.19, -0.24, 0.024, 0.006], [-0.06, cy + 0.1, -0.3, 0.03, 0.006], [-0.11, cy + 0.01, -0.31, 0.034, 0.005]], { seg: 4, up: [1, 0, 0] });

  // ── 素白长巾：绕颈一圈 + 两条长尾，末端渐变成墨色 ──
  b.bone(J.chest).paint(C.scarf, { c2: C.scarfShade, mat: MAT.cloth });
  b.g(X(0, 1.455, 0.0, 8, 0, 0, 1, 1, 0.92), () => b.torus(0.13, 0.05, 0.05, 12, 5));
  const tailWidth = (v: number): number => (0.1 + 0.06 * Math.sin(v * Math.PI * 0.7)) * (1 - 0.4 * Math.pow(v, 3));
  const inky = (_x: number, y: number): number => Math.pow(sat((1.0 - y) / 0.55), 1.3);
  b.bind(chainBind(scarf, scarfPts, J.chest)).paint(C.scarf, { c2: C.ink, mat: MAT.cloth, by: inky });
  strip(b, scarfPts, { width: tailWidth, bow: [0, 0.03, 0], wave: 0.4, nu: 4, nv: 14, tail: 'swallow', tailLen: 0.26 });
  b.bind(chainBind(scarf2, scarf2Pts, J.chest)).paint(C.scarf, { c2: C.ink, mat: MAT.cloth, by: (x, y) => inky(x, y + 0.2) });
  strip(b, scarf2Pts, { width: (v) => 0.08 * (1 - 0.4 * v), bow: [0, 0.02, 0], wave: 0.35, nu: 3, nv: 8, tail: 'swallow', tailLen: 0.18 });

  // ── 匕首：握把在手心，刃沿 −Z(反握)。右手主匕：柳叶青钢刃、刃口寒光、青铜环首；左手副匕：更小的素钢刃 ──
  const dagger = (bone: number, x: number, len: number, wid: number, main: boolean): void => {
    b.bone(bone);
    b.g(X(x, d.handY, 0), () => {
      b.paint(C.leather, { c2: C.suitDark, mat: MAT.leather });
      b.tube([[0, 0, -0.06, 0.02], [0, 0, 0.1, 0.019]], { seg: 6 });
      b.paint(C.bronze, { c2: C.bronzeDark, gloss: 1, mat: MAT.metal });
      // 镡(护手)与环首
      b.tube([[0, 0, -0.06, 0.026, 0.05], [0, 0, -0.08, 0.026, 0.05]], { seg: 6, crease: 30 });
      if (main) b.g(X(0, 0, 0.14, 0, 90, 0), () => b.torus(0.036, 0.009, 0.01, 8, 3, { crease: 30 }));
      else b.ball(0, 0, 0.115, 0.022, 0.022, 0.024, 0);
      // 刃：柳叶形，中脊微起
      b.paint(main ? C.steel : C.plain, { c2: main ? C.steelDark : C.steelDark, gloss: 1, mat: MAT.metal });
      const path: number[][] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const w = wid * 0.5 * Math.pow(Math.sin(Math.PI * (0.22 + t * 0.78)), 0.7);
        path.push([0, 0, -0.08 - t * len, 0.012 * (1 - t * 0.6), Math.max(0.004, w)]);
      }
      b.tube(path, { seg: 4, up: [0, 1, 0], crease: 0 });
      if (main) {
        // 刃口一线寒光(淬药)：技能时由自发光倍率提亮
        b.paint(C.edge, { glow: 0.25, gloss: 1, mat: MAT.metal, line: 0 });
        b.tube(path.slice(1).map((p) => [p[0], p[1] - p[4] * 0.92, p[2], 0.004, 0.006]), { seg: 3, up: [0, 1, 0], crease: 0 });
      }
    });
  };
  dagger(J.propR, -d.shoulderX, 0.42, 0.09, true);
  dagger(J.propL, d.shoulderX, 0.28, 0.06, false);

  // ── 帛卷(大招)：左手捏着卷轴，米白帛面向前下方垂开，卷面几笔淡墨山川 ──
  b.bone(furl);
  const rowJoint = (i: number): number => (i <= 0 ? furl : furlRows[Math.min(FURL_N, i) - 1]);
  // 帛面上的点按沿长度的位置 v(由模型空间的 y 反推)跟相邻两排的关节
  const silkBind: SoftBind = (_x, y) => {
    const f = sat((d.handY - 0.02 - y) / FURL_LEN) * FURL_N;
    const i0 = Math.min(FURL_N - 1, Math.floor(f + 1e-4));
    return [rowJoint(i0), rowJoint(i0 + 1), sat(1 - (f - i0))];
  };
  b.g(X(d.shoulderX, d.handY - 0.02, 0.0), () => {
    b.paint(C.tube, { c2: C.tubeDark, gloss: 0.5, mat: MAT.leather });
    b.tube([[-0.22, 0, 0.03, 0.02], [0.22, 0, 0.03, 0.02]], { seg: 5 });
    const silk = (u: number, v: number, lift = 0): number[] => [lerp(-0.2, 0.2, u), -v * FURL_LEN, 0.05 + 0.3 * Math.sin(v * Math.PI * 0.55) + lift];
    b.bind(silkBind).paint(C.silk, { c2: C.silkShade, mat: MAT.cloth, by: (_x, y) => sat((d.handY - 0.02 - y) / FURL_LEN) });
    b.sheet(2, FURL_N, (u, v) => silk(u, v));
    // 淡墨山川：两道起伏的山脊线
    b.paint(C.ink, { mat: MAT.cloth, line: 0 });
    for (const [v0, amp] of [[0.3, 0.06], [0.55, 0.04]] as const) {
      const pts: number[][] = [];
      for (let i = 0; i <= 6; i++) {
        const u = 0.1 + (i / 6) * 0.8;
        const v = v0 - amp * Math.abs(Math.sin(i * 1.7));
        const p = silk(u, v, 0.006);
        pts.push([p[0], p[1], p[2], 0.006, 0.003]);
      }
      b.tube(pts, { seg: 3, up: [0, 0, 1] });
    }
    // 卷尾：卷起的一截木轴，裹着还没放出来的帛(比手里的轴粗一圈)
    b.bone(furlRows[FURL_N - 1]).paint(C.tube, { c2: C.tubeDark, gloss: 0.5, mat: MAT.leather });
    const e = silk(0.5, 1);
    b.tube([[-0.21, e[1], e[2], 0.024], [0.21, e[1], e[2], 0.024]], { seg: 5 });
    b.paint(C.silkShade, { c2: C.silk, mat: MAT.cloth });
    b.tube([[-0.19, e[1], e[2], 0.034], [0.19, e[1], e[2], 0.034]], { seg: 6 });
  });

  b.bakeGrounding(2.05, 0.72, 0.88);
  return { h, b, extra: { furl, furlRows, furlPts } };
}

// ───────────────────────────── 动画 ─────────────────────────────

const RUN: RunStyle = { ...RUN_DEFAULT, stride: 3.0, stance: 0.3, lift: 0.3, bob: 0.04, drop: 0.12, lean: 24, twist: 8, width: 0.1, arm: 0 };

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
  // 站姿：微侧身、重心低；右手把匕首藏在前臂后，左手副匕垂在身侧，整个人很静
  const stance = kp(h, null, {
    hipsPos: [0, -0.1, 0],
    hips: [6, -20, 0],
    spine: [5, 6, 0],
    chest: [4, 10, 0],
    neck: [-6, 0, 0],
    head: [-6, 8, 0],
    footL: [0.17, 0.09, 0.16, 0, 14],
    footR: [-0.19, 0.09, -0.16, 6, -34],
    armL: [-14, 0, 14],
    foreL: [-40, -10, 0],
    propL: [10, 0, 0],
    armR: [-6, 0, -18],
    foreR: [-70, 30, 0],
    propR: [6, 0, 0],
  });
  // 普攻 A：右手反握主匕自外向内横抹
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
  // 普攻 B：左手副匕前刺
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
  // 二技能·引匕一掷：左手探到后腰抹出飞匕，向前扇形甩出
  const s2Wind = kp(h, stance, { hips: [8, -26, 0], chest: [4, -30, 0], head: [-8, 40, 0], armL: [40, -30, 30], foreL: [-90, 0, 0], propL: [30, 0, 0] });
  const s2Hit = kp(h, stance, { hipsPos: [0, -0.16, 0.1], hips: [12, 24, 0], chest: [8, 30, 0], head: [-10, -40, 0], armL: [-84, -50, 40], foreL: [-6, 0, 0], propL: [-30, 0, 0], armR: [20, 0, -40], foreR: [-80, 30, 0] });
  const s2 = track([
    [0, stance],
    [0.3, s2Wind, E.out],
    [0.5, s2Hit, E.in3],
    [1, s2Hit, E.lin],
  ]);
  // 大招·卷尽匕现：左手持轴向前抖开图卷，右手匕首从卷尾翻出，随即俯身收束
  const unroll = kp(h, stance, { hipsPos: [0, -0.1, 0.04], hips: [6, -10, 0], chest: [4, -6, 0], head: [6, 6, 0], armL: [-80, 0, 10], foreL: [-10, 0, 0], propL: [0, 0, 0], armR: [-60, 0, -20], foreR: [-60, 20, 0], propR: [-40, 0, 0] });
  const sink = kp(h, stance, { hipsPos: [0, -0.34, 0], hips: [24, 0, 0], spine: [14, 0, 0], chest: [10, 0, 0], head: [10, 0, 0], armL: [-30, 0, 50], foreL: [-100, -30, 0], armR: [-30, 0, -50], foreR: [-100, 30, 0] });
  const vanish = track([
    [0, stance],
    [0.3, unroll, E.out],
    [0.5, unroll, E.lin],
    [0.75, sink, E.io],
    [1, sink, E.lin],
  ]);
  // 奔跑：上身前倾，右手护匕贴身、左手前探
  const runArms = kp(h, null, { armL: [-34, 0, 18], foreL: [-30, 0, 0], propL: [10, 0, 0], armR: [10, 0, -16], foreR: [-90, 30, 0], propR: [10, 0, 0] });
  // 风萧易水：整个人拉成一条线，右匕前递
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
  // 回城引导：抱臂垂首，匕首倒提
  const channel = kp(h, stance, { hipsPos: [0, -0.04, 0], hips: [2, -10, 0], spine: [4, 0, 0], chest: [4, 4, 0], neck: [10, 0, 0], head: [18, 0, 0], armL: [-30, -30, 26], foreL: [-110, -10, 0], propL: [40, 0, 0], armR: [-30, 30, -26], foreR: [-110, 10, 0], propR: [40, 0, 0] });
  const common = makeCommon(h, stance, { limp: { propL: [20, 0, 0], propR: [20, 0, 0] } });
  return { stance, tmp: emptyCKP(h), atkA, atkB, s2, vanish, runArms, dash, channel, common };
}

export function createYeque(): ModelDef {
  const { h, b, extra } = build();
  const A = makeAnims(h);
  const J = h.J;
  const k = A.tmp;
  const geometry = b.build();

  /**
   * 帛卷展开到 u(0 = 全卷在手边的轴上，1 = 全部放开)：放出来的几排留在原位，还没放出来的各排连同卷尾的木轴
   * 都收在「展开前沿」上——前沿沿着帛面的走向从手边滚到远端。所以看到的是卷尾由近及远滚出去、帛面跟着铺开，而不是整幅由小变大。
   */
  const unfurl = (pose: Pose, u: number): void => {
    const P = extra.furlPts;
    const f = Math.min(FURL_N, Math.max(0, u * FURL_N));
    const i0 = Math.min(FURL_N - 1, Math.floor(f));
    const w = f - i0;
    const fx = P[i0][0] + (P[i0 + 1][0] - P[i0][0]) * w;
    const fy = P[i0][1] + (P[i0 + 1][1] - P[i0][1]) * w;
    const fz = P[i0][2] + (P[i0 + 1][2] - P[i0][2]) * w;
    for (let i = 1; i <= FURL_N; i++) {
      if (i <= f) continue;
      pose.pos(extra.furlRows[i - 1], fx - P[i][0], fy - P[i][1], fz - P[i][2]);
    }
  };

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    pose.scale(extra.furl, 0);
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
          pose.add(J.armL, sw * 16, 0, 0);
          pose.add(J.armR, -sw * 5, 0, 0);
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
        applyCKP(h, pose, k, () => pose.rot(J.root, 0, -seg(a.p, 0.5, 1) * 120, 0));
        // 图卷：卷轴先出现在左手，帛面随即由手边向远端一排排抖开(0.08~0.3)，0.55 之后随身形收束从远端卷回来，卷完才收掉
        pose.scale(extra.furl, Math.min(seg(a.p, 0.03, 0.09), 1 - seg(a.p, 0.76, 0.82)));
        const open = Math.min(seg(a.p, 0.07, 0.3), 1 - seg(a.p, 0.55, 0.77));
        unfurl(pose, open * (2 - open));
        out.glow = 1 + 2.4 * a.p;
        break;
      }
      case 'spin':
      case 'channel': {
        applyCKP(h, pose, A.channel, () => breathe(h, pose, a.time, a.seed, 0.6));
        out.glow = 1 + 0.4 * (0.5 + 0.5 * Math.sin(a.time * 5));
        break;
      }
      default: {
        applyCKP(h, pose, A.stance, () => {
          breathe(h, pose, a.time * 0.9, a.seed, 0.6);
          pose.move(J.hips, Math.sin(a.time * 1.1 + a.seed * 5) * 0.006, 0, 0);
        });
        out.glow = 1 + 0.12 * Math.sin(a.time * 2.4);
      }
    }
  };

  return {
    key: 'hero:yeque',
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
      weapon: { joint: J.propR, x: 0, y: 0, z: -0.46 },
      muzzle: { joint: J.propR, x: 0, y: 0, z: 0 },
    },
    blend: (from, to) => (to === 'attack' || to === 'dash' ? 0.06 : to === 'dead' ? 0.05 : from === 'dash' ? 0.14 : 0.12),
    animate,
  };
}
