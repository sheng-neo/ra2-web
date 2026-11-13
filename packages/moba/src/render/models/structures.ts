/**
 * 建筑：防御塔(三档 × 两队)、塔的废墟、基地水晶。
 * 蓝方：白石 + 湛蓝水晶 + 金饰，线条挺拔；红方：玄武黑岩 + 绯红水晶 + 余烬金，多尖刺。
 *
 * 塔 = 两级八角台基(四角小灯柱) + 分层砌筑、向上收分的塔身(嵌发光窗缝) + 托举核心的爪冠 + 悬浮的核心 / 符环 / 顶晶。
 *   三档拉开：一塔单环；二塔双环 + 塔身两侧一对护翼；高地塔三环 + 大冠 + 队旗，塔身粗一成半。
 *   攻击：核心蓄光 → 环加速 → 出弹瞬间环张开一下；锁定英雄时顶晶外亮起一圈警戒晶(AnimInput.mode bit1)。
 *   受损三段(生命 75 / 50 / 25%)：外挂石板逐块脱落、塔身出现发光裂纹、环倾斜、光不稳。
 *   无敌态(mode bit0)：塔身外罩一圈缓慢转动的六边护罩纹。被毁：核心内爆 → 上半截折断倒下 → 沉入废墟。
 * 水晶 = 三级八角台基 + 四支弧形托臂 + 巨大的星核晶体 + 双层浑仪环(与星陨巨灵同源的造型语言)。
 */
import { PALETTE } from '../materials';
import { MAT, ModelBuilder, PATTERN, type RGB, X, lerp, shade } from './kit';
import { type Pose, Rig, bump, easeOut, seg } from './rig';
import type { AnimInput, AnimOutput, ModelDef } from './types';

interface Look {
  stone: number;
  stoneDark: number;
  stoneLight: number;
  trim: number;
  crystal: number;
  /** 大块晶体(核心/星核)的亮面色：比主色稍亮，但不发白 */
  crystalMid: number;
  crystalHot: number;
  /**
   * 大块晶面(塔的核心、水晶的星核与内核)自发光的倍率。红晶的红通道本来就顶满，自发光再往上推，
   * 色调映射与泛光会把绿、蓝通道一起抬起来——红就发成了肉粉色；所以红方压得比蓝方低。
   */
  glowK: number;
  /** 红方的造型更尖锐 */
  spiky: boolean;
}

// 蓝方 stoneLight 取 #c9d3e6：再浅的话塔身受光面在 low 档(没有阴影贴图、不过色调映射的后期)会顶成一片白，砌缝全丢。
// 红方晶体三阶：深绯红 → 朱红 → 余烬橙(白热端往橙走，不往粉走)。反照率比色表的红方晶 #ff5a36 暗一截、偏橙一点：
// 受光 + 自发光之后红通道会顶满，色调映射把高亮的红压向粉白并吃掉色相里的橙，留出这段余量显示出来才是 #ff5a36 上下。
const LOOKS: [Look, Look] = [
  { stone: PALETTE.blue.stone, stoneDark: PALETTE.blue.stoneDark, stoneLight: 0xc9d3e6, trim: PALETTE.blue.trim, crystal: 0x1668e8, crystalMid: 0x38a0ff, crystalHot: 0x8cd0ff, glowK: 0.85, spiky: false },
  { stone: PALETTE.red.stone, stoneDark: PALETTE.red.stoneDark, stoneLight: 0x7c6a70, trim: PALETTE.red.trim, crystal: 0xd63a16, crystalMid: 0xf25a26, crystalHot: 0xff8a30, glowK: 0.35, spiky: true },
];
const ALERT = 0xfff0b0;

const TAU = Math.PI * 2;
const hash = (i: number, s: number): number => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const stoneMat = { mat: MAT.rock, pattern: PATTERN.strata, patternScale: 3, patternAmt: 0.3, grain: 0.05 } as const;
const trimMat = { gloss: 1, mat: MAT.metal } as const;
const crystalMat = { gloss: 1, mat: MAT.crystal, line: 1 } as const;

/** 八角阶梯台基(塔与废墟共用)：两级，总高 0.35 米，落在碰撞半径以内 */
function plinth(b: ModelBuilder, L: Look, r: number): void {
  b.paint(L.stoneDark, { c2: L.stone, ...stoneMat });
  b.lathe([[0, r], [0.16, r], [0.18, r * 0.97], [0.18, r * 0.84], [0.33, r * 0.84], [0.35, r * 0.81]], { seg: 8, phase: 22.5, crease: 30 });
  b.paint(L.trim, { ...trimMat });
  b.lathe([[0.14, r * 1.012], [0.19, r * 1.012]], { seg: 8, phase: 22.5, crease: 30, cap0: false, cap1: false });
}

/**
 * 分层砌筑的八角塔身：n 层石块，层与层之间一道内凹的砌缝。rOf(y) 给出收分后的半径。
 * 砌缝里再嵌一圈压暗的灰缝(seam 色)：缝的明暗不只靠阴影——low 档没有阴影贴图，浅色的蓝方塔身受光面上缝会淡到看不见。
 * 调用前先 paint 好石块的颜色；灰缝画完后画笔停在 seam 色上，调用方接着画别的要重新 paint。
 * 返回各层的中点高度(往上贴窗缝、石板用)。
 */
function courses(b: ModelBuilder, y0: number, y1: number, n: number, rOf: (y: number) => number, capTop: boolean, seam: RGB): number[] {
  const prof: number[][] = [];
  const mids: number[] = [];
  const h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const a = y0 + i * h;
    const c = a + h;
    // 每层自己略带一点侧脚(下大上小)，砌缝收进 3.5 厘米
    prof.push([a, rOf(a) * (i % 2 ? 0.985 : 1)], [c - 0.05, rOf(c - 0.05) * (i % 2 ? 0.985 : 1)]);
    if (i < n - 1) prof.push([c - 0.05, rOf(c) - 0.045], [c, rOf(c) - 0.045]);
    mids.push(a + h / 2);
  }
  b.lathe(prof, { seg: 8, phase: 22.5, crease: 30, cap0: false, cap1: capTop });
  b.paint(seam, { mat: MAT.rock, line: 0 });
  for (let i = 0; i < n - 1; i++) {
    const c = y0 + (i + 1) * h;
    b.lathe([[c - 0.047, rOf(c) - 0.04], [c - 0.003, rOf(c) - 0.04]], { seg: 8, phase: 22.5, crease: 30, cap0: false, cap1: false });
  }
  return mids;
}

/** 六边护罩纹：围着半径 R 的圆柱面排一圈六边形线框(细发光条) */
function hexCage(b: ModelBuilder, R: number, yc: number, size: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const P = (k: number): number[] => {
      const th = (k / 6) * TAU + Math.PI / 6;
      const a = a0 + (Math.cos(th) * size) / R;
      return [Math.cos(a) * R, yc + Math.sin(th) * size * 1.25, Math.sin(a) * R];
    };
    for (let k = 0; k < 6; k++) b.limb(P(k), P(k + 1), 0.024, 0.024, { seg: 3, cap0: false, cap1: false });
  }
}

/** 塔身 / 晶体上的发光裂纹：一条贴着圆柱面爬的折线 */
function crackLine(b: ModelBuilder, rOf: (y: number) => number, a0: number, y0: number, y1: number, seed: number, out = 1.012): void {
  const n = 4;
  const pts: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const y = lerp(y0, y1, u);
    const a = a0 + (hash(i, seed) - 0.5) * 0.5 * (i > 0 && i < n ? 1 : 0.2);
    const r = rOf(y) * out;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r, 0.035 * (1 - Math.abs(u - 0.5) * 1.3), 0.02]);
  }
  b.tube(pts, { seg: 3, cap0: false, cap1: false });
}

function createTower(tier: 1 | 2 | 3, team: 0 | 1): ModelDef {
  const L = LOOKS[team];
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const W = tier === 3 ? 1.15 : 1;
  const H = 4.1 + tier * 0.4;
  const MID = 2.5;
  const coreY = H + 1.35;
  const lower = rig.add('lower', root, 0, 0.35, 0);
  const upper = rig.add('upper', lower, 0, MID, 0);
  const core = rig.add('core', root, 0, coreY, 0);
  const rings = Array.from({ length: tier }, (_, i) => rig.add(`ring${i}`, root, 0, coreY - 0.15 + i * 0.2, 0));
  const tip = rig.add('tip', root, 0, coreY + 1.5, 0);
  const alert = rig.add('alert', tip, 0, coreY + 1.9, 0);
  const shield = rig.add('shield', root, 0, 2.4, 0);
  const chunks = [0, 1, 2, 3].map((i) => rig.add(`chunk${i}`, i < 2 ? lower : upper, 0, i < 2 ? 1.7 : 3.2, 0));
  const cracks = [0, 1, 2].map((i) => rig.add(`crack${i}`, i === 0 ? upper : lower, 0, i === 0 ? 3.2 : 1.6, 0));
  const flag = tier === 3 ? rig.add('flag', upper, 0, H - 0.5, 0) : -1;
  const b = new ModelBuilder();
  b.crease = 30;

  const colR = (y: number): number => lerp(0.96, 0.62, (y - 0.35) / (H - 0.35)) * W;

  // ── 台基 + 四角小灯柱 ──
  b.bone(root);
  plinth(b, L, 1.58);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const x = Math.cos(a) * 1.36;
    const z = Math.sin(a) * 1.36;
    b.paint(L.stoneDark, { c2: L.stone, ...stoneMat });
    b.lathe([[0.16, 0.13, 0.13, x, z], [0.56, 0.09, 0.09, x, z], [0.6, 0.13, 0.13, x, z]], { seg: 6 });
    b.paint(L.crystal, { c2: L.crystalHot, glow: 0.5, glow2: 0.8, ...crystalMat, line: 0 });
    b.g(X(x, 0.6, z), () => b.crystal(0.085, 0.3 + (tier - 1) * 0.08, 4, 0.6, 0.25));
  }

  // ── 塔身：下半段 / 上半段各自分层砌筑，中间一道腰箍 ──
  b.bone(lower).paint(L.stoneDark, { c2: L.stone, by: (_x, y) => (y - 0.35) / (MID - 0.35), ...stoneMat });
  b.lathe([[0.35, colR(0.35) * 1.16], [0.5, colR(0.5) * 1.16], [0.56, colR(0.56) * 1.04]], { seg: 8, phase: 22.5, crease: 30, cap0: false, cap1: false });
  const seam = shade(L.stoneDark, 0.62);
  courses(b, 0.56, MID, 4, colR, true, seam);
  b.bone(upper).paint(L.stone, { c2: L.stoneLight, by: (_x, y) => (y - MID) / (H - MID), ...stoneMat });
  courses(b, MID, H - 0.3, 3 + (tier > 1 ? 1 : 0), colR, false, seam);
  b.paint(L.stone, { c2: L.stoneLight, by: (_x, y) => (y - MID) / (H - MID), ...stoneMat });
  b.lathe([[H - 0.3, colR(H - 0.3)], [H - 0.1, colR(H) * 1.5], [H + 0.12, colR(H) * 1.62], [H + 0.2, colR(H) * 1.2]], { seg: 8, phase: 22.5, cap0: false });
  b.paint(L.trim, { ...trimMat });
  b.lathe([[H - 0.12, colR(H) * 1.56], [H + 0.14, colR(H) * 1.68], [H + 0.16, colR(H) * 1.5]], { seg: 8, phase: 22.5, cap0: false, cap1: false });
  b.lathe([[MID - 0.07, colR(MID) * 1.07], [MID + 0.07, colR(MID) * 1.07]], { seg: 8, phase: 22.5 });
  // 四面的发光窗缝：上段一条长缝，下段一条短缝
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    for (const [bone, y0, y1] of [[lower, 1.25, 2.2], [upper, MID + 0.3, H - 0.55]] as [number, number, number][]) {
      b.bone(bone).paint(L.crystal, { c2: L.crystalHot, glow: 0.35, glow2: 0.6, ...crystalMat, line: 0 });
      const ym = (y0 + y1) / 2;
      const hh = (y1 - y0) / 2;
      b.g(X(Math.cos(a) * (colR(ym) * 0.925 + 0.015), ym, Math.sin(a) * (colR(ym) * 0.925 + 0.015), 0, 90 - (a * 180) / Math.PI, 0), () =>
        b.g(X(0, 0, 0, -((0.34 * W) / (H - 0.35)) * (180 / Math.PI), 0, 0), () => b.extrude([[-0.06, -hh], [0.06, -hh], [0.09, 0], [0.06, hh], [0, hh + 0.12], [-0.06, hh], [-0.09, 0]], 0.07, 0)));
    }
  }
  // 会随受损脱落的外挂石板(斜面上，贴着塔身)
  chunks.forEach((c, i) => {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const y = i < 2 ? 1.5 + i * 0.5 : MID + 0.55 + (i - 2) * 0.6;
    b.bone(c).paint(L.stone, { c2: L.stoneLight, ...stoneMat });
    b.g(X(Math.cos(a) * colR(y) * 0.99, y, Math.sin(a) * colR(y) * 0.99, 0, 90 - (a * 180) / Math.PI, 0), () => {
      b.box(0, 0, 0, 0.5 * W, 0.6, 0.16, 0.05);
      b.paint(L.trim, { ...trimMat });
      b.box(0, 0, 0.085, 0.1, 0.1, 0.03);
    });
  });
  // 受损的发光裂纹：三组，按生命 75 / 50 / 25% 依次出现
  cracks.forEach((c, i) => {
    b.bone(c).paint(L.crystalHot, { c2: L.crystal, glow: 0.8, ...crystalMat, line: 0 });
    const y0 = i === 0 ? MID + 0.2 : 0.7 + (i - 1) * 0.5;
    const y1 = i === 0 ? H - 0.5 : MID - 0.1;
    crackLine(b, colR, 0.5 + i * 2.2, y0, y1, 3 + i);
    crackLine(b, colR, 2.3 + i * 2.2, y0 + 0.3, y1 - 0.4, 9 + i);
  });

  // ── 爪冠：四支向上环抱核心的石爪(红方更尖、带倒刺；档位越高越长) ──
  const clawH = 1.9 + tier * 0.2;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    b.bone(upper);
    b.g(X(0, H + 0.1, 0, 0, -(a * 180) / Math.PI + 90, 0), () => {
      b.paint(L.stone, { c2: L.stoneLight, ...stoneMat });
      const out = (L.spiky ? 1.22 : 1.1) * W;
      b.tube([[0, 0, 0.7 * W, 0.2, 0.16], [0, clawH * 0.3, out, 0.19, 0.14], [0, clawH * 0.62, out + 0.08, 0.15, 0.11], [0, clawH * 0.88, out - 0.2, 0.09, 0.07], [0, clawH, out - 0.52, 0.01, 0.01]], { seg: 5, up: [1, 0, 0] });
      b.paint(L.trim, { ...trimMat });
      b.g(X(0, clawH * 0.3, out + 0.02, 12, 0, 0), () => b.box(0, 0, 0, 0.44, 0.12, 0.34, 0.03));
      if (L.spiky) {
        b.paint(L.stoneDark, { c2: L.stone, ...stoneMat });
        b.g(X(0, clawH * 0.5, out + 0.18, 70, 0, 0), () => b.crystal(0.09, 0.5, 4, 0.8, 0.1));
      }
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.35, ...crystalMat });
      b.g(X(0, clawH * 0.62, out + 0.2, 60, 0, 0), () => b.crystal(0.07, 0.24, 4, 0.6, 0.3));
    });
  }
  if (tier >= 2) {
    // 二塔 / 高地塔：塔身两侧一对护翼
    b.bone(upper);
    b.sym(() => {
      b.paint(L.stone, { c2: L.stoneLight, ...stoneMat });
      b.g(X(colR(3.2) * 0.9, 3.2, 0), () => b.extrude([[0, -0.9], [0.46, -0.3], [0.78 + (tier - 2) * 0.16, 1.0 + (tier - 2) * 0.3], [0.34, 0.56], [0, 0.8]], 0.16, 0.05));
      b.paint(L.trim, { ...trimMat });
      b.g(X(colR(3.2) * 0.9 + 0.3, 3.3, 0), () => b.box(0, 0, 0, 0.08, 0.6, 0.2, 0.02));
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.35, glow2: 0.6, ...crystalMat });
      b.g(X(colR(3.2) * 0.9 + 0.62 + (tier - 2) * 0.14, 3.9 + (tier - 2) * 0.3, 0, 0, 0, -22), () => b.crystal(0.09, 0.5, 4, 0.7, 0.2));
    });
  }
  if (tier === 3) {
    // 高地塔：大冠(爪间再起四支冠刺) + 前后两面队旗
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      b.bone(upper).paint(L.trim, { ...trimMat });
      b.g(X(Math.cos(a) * colR(H) * 1.5, H + 0.14, Math.sin(a) * colR(H) * 1.5, 0, -(a * 180) / Math.PI, 0), () => b.g(X(0, 0, 0, 0, 0, -24), () => b.crystal(0.11, 1.0, 4, 0.8, 0.12)));
    }
    b.bone(flag).paint(0x0c1830, { team: 0.85, mat: MAT.cloth, pattern: PATTERN.weave, patternScale: 8, patternAmt: 0.35 });
    for (const sz of [1, -1]) {
      b.sheet(2, 3, (u, v) => [(u - 0.5) * 0.62 * (1 - v * 0.2), H - 0.5 - v * 1.5 + (v > 0.9 ? Math.abs(u - 0.5) * 0.3 : 0), sz * (colR(H - 0.5 - v * 1.5) * 0.93 + 0.06 + 0.05 * Math.sin(v * 3))]);
    }
    b.bone(upper).paint(L.trim, { ...trimMat });
    for (const sz of [1, -1]) b.box(0, H - 0.47, sz * (colR(H - 0.5) * 0.93 + 0.07), 0.72, 0.07, 0.07, 0.02);
  }

  // ── 核心：悬浮的大晶体 + 更亮的内核 ──
  b.bone(core).paint(L.crystal, { c2: L.crystalMid, glow: 0.24 * L.glowK, glow2: 0.42 * L.glowK, ...crystalMat, gloss: 0.8 });
  const cr = 0.5 + tier * 0.05;
  b.g(X(0, coreY - 0.85, 0), () => b.crystal(cr, 1.7, 6, 0.5, 0.5, 1));
  b.paint(L.crystalHot, { glow: 0.65 * L.glowK, mat: MAT.crystal, line: 0 });
  b.g(X(0, coreY - 0.45, 0), () => b.crystal(cr * 0.45, 0.9, 4, 0.5, 0.5, 1));
  // 符环：扁金环 + 发光晶钉
  rings.forEach((r, i) => {
    const R = 1.05 + i * 0.28;
    b.bone(r).paint(L.trim, { ...trimMat });
    b.g(X(0, coreY - 0.15 + i * 0.2, 0), () => {
      b.torus(R, 0.09, 0.035, 20, 4, { crease: 30 });
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.5, mat: MAT.crystal, line: 0 });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + i * 0.6;
        b.g(X(Math.cos(a) * R, 0, Math.sin(a) * R, 0, -(a * 180) / Math.PI, 0), () => b.box(0, 0, 0, 0.12, 0.09, 0.22));
      }
    });
  });
  // 顶晶 + 环绕的碎晶；锁定英雄时外圈亮起四枚警戒晶
  b.bone(tip).paint(L.crystal, { c2: L.crystalHot, glow: 0.3, glow2: 0.6, ...crystalMat });
  b.g(X(0, coreY + 1.2, 0), () => b.crystal(0.16, 1.0 + tier * 0.25, 4, 0.75, 0.15));
  const shardN = 2 + tier;
  for (let k = 0; k < shardN; k++) {
    const a = (k / shardN) * TAU;
    b.g(X(Math.cos(a) * 0.58, coreY + 1.3 + (k % 2) * 0.16, Math.sin(a) * 0.58), () => b.g(X(0, -0.14, 0, hash(k, 1) * 20 - 10, 0, hash(k, 2) * 20 - 10), () => b.crystal(0.085, 0.3 + hash(k, 3) * 0.14, 4, 0.5, 0.4)));
  }
  b.bone(alert).paint(ALERT, { c2: 0xffffff, glow: 0.95, mat: MAT.crystal, line: 0 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    b.g(X(Math.cos(a) * 0.44, coreY + 1.9, Math.sin(a) * 0.44, 0, -(a * 180) / Math.PI, 0), () => b.g(X(0, 0, 0, 0, 0, -90), () => b.crystal(0.07, 0.36, 4, 0.8, 0.2)));
  }
  // 无敌态的六边护罩纹
  b.bone(shield).paint(0xffffff, { team: 1, glow: 0.6, mat: MAT.crystal, line: 0 });
  hexCage(b, 1.72 * W, 2.4, 0.74, 6);
  b.bakeGrounding(8, 0.75, 0.9);
  const height = coreY + 2.2 + tier * 0.25;

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 10;
    // 受损：石板逐块脱落(每 25% 掉一批)、裂纹出现、环倾斜、光变弱
    const dmg = 1 - a.hp;
    chunks.forEach((c, i) => {
      const at = i < 2 ? 0.25 : i === 2 ? 0.5 : 0.75;
      const gone = seg(dmg, at - 0.01 + i * 0.03, at + 0.05 + i * 0.03);
      if (gone > 0) {
        pose.scale(c, Math.max(0.001, 1 - gone));
        pose.pos(c, 0, -gone * 1.2, 0);
      }
    });
    cracks.forEach((c, i) => pose.scale(c, Math.max(0.001, seg(dmg, 0.25 * (i + 1) - 0.02, 0.25 * (i + 1) + 0.04))));
    const weak = seg(dmg, 0.45, 0.85);
    const locked = (a.mode & 2) !== 0;
    let charge = 0;
    let spin = 1;
    let pop = 0;
    if (a.anim === 'attack') {
      // 蓄光 → 出手瞬间释放(环张开一下)
      const w = a.windup;
      charge = a.p < w ? a.p / w : Math.max(0, 1 - (a.p - w) / 0.25);
      pop = bump(a.p, w + 0.04, 0.09);
      spin = 1 + 3 * charge;
      if (a.p >= w) out.glow = 1 + 1.6 * charge;
      else out.glow = 1 + 1.0 * charge * charge;
    } else out.glow = 1 + 0.12 * Math.sin(t * 2);
    out.glow *= 1 - weak * (0.35 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3));
    pose.pos(core, 0, Math.sin(t * 1.3) * 0.12 - weak * 0.25, 0);
    pose.rot(core, 0, t * 26 * spin, weak * 8 * Math.sin(t * 3));
    pose.scale(core, 1 + 0.25 * charge + 0.03 * Math.sin(t * 2.6));
    rings.forEach((r, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      pose.rot(r, 16 + i * 14 + weak * 16 * Math.sin(t * 2 + i), dir * t * (34 + i * 12) * spin, 10 - i * 16 + weak * 12 * Math.cos(t * 1.7 + i) + dmg * 14);
      pose.pos(r, 0, Math.sin(t * 1.1 + i * 2) * 0.08 - weak * 0.2 * i, 0);
      pose.scale(r, 1 + 0.08 * charge + 0.28 * pop);
    });
    pose.pos(tip, 0, Math.sin(t * 1.3 + 1) * 0.14, 0);
    pose.rot(tip, 0, t * (locked ? 160 : 50), 0);
    pose.scale(alert, locked ? 1 + 0.2 * Math.sin(t * 12) : 0.001);
    pose.rot(alert, 0, locked ? t * 220 : 0, 0);
    // 无敌护罩：缓慢转动、上下浮动
    pose.scale(shield, a.mode & 1 ? 1 + 0.015 * Math.sin(t * 2.4) : 0.001);
    pose.rot(shield, 0, t * 14, 0);
    pose.pos(shield, 0, Math.sin(t * 0.8) * 0.18, 0);
    if (flag >= 0) pose.rot(flag, Math.sin(t * 1.4) * 1.5, 0, Math.sin(t * 1.1) * 2);

    if (a.deathT >= 0) {
      // 被毁：核心内爆 → 上半截折断倒向一侧 → 整体沉入废墟
      const d = a.deathT;
      const implode = seg(d, 0, 0.35);
      const fall = seg(d, 0.2, 1.3);
      const sink = seg(d, 0.9, 2.2);
      const side = a.seed > 0.5 ? 1 : -1;
      pose.scale(core, Math.max(0.001, (1 + implode * 0.5) * (1 - seg(d, 0.25, 0.45))));
      rings.forEach((r, i) => {
        const fly = seg(d, 0.1, 0.9);
        pose.scale(r, Math.max(0.001, (1 + fly * 0.8) * (1 - seg(d, 0.6, 1.0))));
        pose.pos(r, side * fly * (0.5 + i * 0.4), -fly * fly * 3.5, fly * (i - 0.5) * 0.8);
        pose.rot(r, 16 + fly * 120, 0, 10 + fly * 80 * side);
      });
      pose.pos(tip, side * fall * 2, -fall * fall * (coreY + 1), 0);
      pose.rot(tip, 0, 0, -side * fall * 140);
      pose.scale(tip, Math.max(0.001, 1 - seg(d, 1.0, 1.5)));
      pose.scale(shield, 0.001);
      cracks.forEach((c) => pose.scale(c, 1));
      const e = fall * fall;
      pose.rot(upper, 0, 0, -side * e * 84);
      pose.pos(upper, side * e * 0.3, -e * 0.9 - sink * 1.2, 0);
      pose.scale(upper, Math.max(0.001, 1 - sink));
      pose.pos(lower, 0, -sink * 1.4, 0);
      pose.scale(lower, 1 - sink * 0.9);
      pose.scale(root, 1 - seg(d, 1.9, 2.4) * 0.999);
      pose.rot(root, 0, 0, Math.sin(d * 50) * 0.6 * (1 - sink));
      out.glow = (1 + 3 * bump(d, 0.3, 0.2)) * (1 - seg(d, 0.4, 1.0));
    }
  };

  return {
    key: `tower:${tier}:${team}`,
    geometry: b.build(),
    rig,
    height,
    radius: 1.7,
    scale: 1,
    stride: 1,
    triangles: b.triangleCount,
    deathDur: 2.4,
    attach: { core: { joint: core, x: 0, y: 0, z: 0 }, muzzle: { joint: core, x: 0, y: 0, z: 0 }, chest: { joint: root, x: 0, y: 2.6, z: 0 }, head: { joint: tip, x: 0, y: 1, z: 0 } },
    blend: () => 0,
    animate,
  };
}

function createRuin(team: 0 | 1): ModelDef {
  const L = LOOKS[team];
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const stump = rig.add('stump', root, 0, 0.35, 0);
  const b = new ModelBuilder();
  b.crease = 28;
  // 地面的焦痕：贴地的不规则暗斑(永久留在原地)
  b.bone(root).paint(0x1a1614, { c2: 0x3a302a, mat: MAT.rock, by: (x, _y, z) => Math.hypot(x, z) / 2.9, line: 0 });
  b.lathe([[0.04, 2.9], [0.05, 0.02]], { seg: 12, cap0: false, cap1: false, shape: (th) => 0.78 + 0.22 * Math.sin(th * 3 + 1) * Math.sin(th * 5) });
  b.rough = 0.03;
  plinth(b, L, 1.58);
  // 断柱：参差的断口
  b.bone(stump).paint(L.stoneDark, { c2: L.stone, ...stoneMat });
  b.lathe([[0.35, 0.98], [1.0, 0.9], [1.5, 0.86]], { seg: 8, phase: 22.5, cap1: false, shape: (a, k) => (k === 2 ? 0.75 + 0.3 * hash(Math.round(a * 3), 5) : 1) });
  b.lathe([[1.02, 0.02], [1.06, 0.84]], { seg: 8, phase: 22.5, cap0: false, cap1: false });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.3;
    b.g(X(Math.cos(a) * 0.55, 1.0, Math.sin(a) * 0.55, hash(i, 1) * 30 - 15, i * 80, hash(i, 2) * 30 - 15), () => b.crystal(0.22, 0.7 + hash(i, 3) * 0.6, 4, 0.5, 0.05));
  }
  // 散落的石块、黯淡的碎晶、还在发红的余烬
  b.bone(root);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4 + 0.5;
    const r = 1.1 + hash(i, 7) * 1.5;
    const s = 0.22 + hash(i, 8) * 0.4;
    b.paint(i % 3 === 0 ? L.stoneLight : L.stone, { c2: L.stoneDark, ...stoneMat });
    b.g(X(Math.cos(a) * r, s * 0.35 + (r < 1.5 ? 0.3 : 0), Math.sin(a) * r, hash(i, 9) * 60, hash(i, 10) * 180, hash(i, 11) * 60), () => b.box(0, 0, 0, s * 1.4, s, s * 1.1, s * 0.2));
  }
  b.rough = 0;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 1.1;
    const r = 0.9 + hash(i, 13) * 1.3;
    b.paint(shade(L.crystal, 0.55), { c2: L.crystal, glow: 0.12, ...crystalMat });
    b.g(X(Math.cos(a) * r, 0.1 + (r < 1.5 ? 0.32 : 0), Math.sin(a) * r, 60 + hash(i, 14) * 40, i * 77, hash(i, 15) * 60), () => b.crystal(0.14, 0.5 + hash(i, 16) * 0.5, 5, 0.5, 0.2));
  }
  for (let i = 0; i < 9; i++) {
    const a = i * 2.1 + 0.9;
    const r = 0.5 + hash(i, 21) * 2.0;
    b.paint(0xff7a2c, { c2: 0xffd27a, glow: 0.7, mat: MAT.crystal, line: 0 });
    b.ball(Math.cos(a) * r, 0.08 + (r < 1.5 ? 0.34 : 0), Math.sin(a) * r, 0.07, 0.035, 0.06, 0);
  }
  // 残旗：一根歪斜的断杆，挂着撕破的队旗
  b.paint(0x6a5a4c, { mat: MAT.leather });
  b.limb([1.05, 0.3, 0.5], [1.5, 1.9, 0.26], 0.04, 0.03, { seg: 5 });
  b.paint(0x0c1830, { team: 0.8, mat: MAT.cloth, pattern: PATTERN.weave, patternScale: 8, patternAmt: 0.35 });
  b.sheet(3, 2, (u, v) => {
    const torn = v > 0.6 ? 0.16 * Math.abs(Math.sin(u * 9)) : 0;
    return [lerp(1.5, 1.24, v) + u * 0.5, 1.9 - v * 0.9 - u * 0.2 + torn * 0.3 - torn * 0.5, 0.26 + lerp(0, 0.14, v) + u * 0.18];
  });
  b.bakeGrounding(2.4, 0.7, 0.85);
  return {
    key: `ruin:${team}`,
    geometry: b.build(),
    rig,
    height: 2.2,
    radius: 2.9,
    scale: 1,
    stride: 1,
    triangles: b.triangleCount,
    attach: {},
    blend: () => 0,
    animate(pose, a, out) {
      // 废墟随坍塌从地里升起
      const g = a.p;
      pose.scale(root, 0.3 + 0.7 * g);
      pose.pos(root, 0, -0.3 * (1 - g), 0);
      pose.scale(stump, 0.4 + 0.6 * g * g);
      // 余烬：明灭(坍塌后前十来秒更亮)
      out.glow = (0.6 + 0.4 * Math.sin(a.time * 1.3 + a.seed * 6)) * (1 + 1.2 * Math.max(0, 1 - a.t / 12));
    },
  };
}

function createCore(team: 0 | 1): ModelDef {
  const L = LOOKS[team];
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const coreY = 3.95;
  const star = rig.add('star', root, 0, coreY, 0);
  const inner = rig.add('inner', star, 0, coreY, 0);
  const ringA = rig.add('ringA', root, 0, coreY, 0);
  const ringB = rig.add('ringB', root, 0, coreY, 0);
  const orbit = rig.add('orbit', root, 0, coreY, 0);
  const shield = rig.add('shield', root, 0, coreY, 0);
  const cracks = [0, 1, 2].map((i) => rig.add(`crack${i}`, star, 0, coreY, 0));
  const pylons = [0, 1, 2, 3].map((i) => rig.add(`pylon${i}`, root, Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 2.2, 0.9, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 2.2));
  const b = new ModelBuilder();
  b.crease = 30;

  // ── 三级八角台基：深色的底(把晶体从浅色地面上托出来) + 包边 ──
  b.bone(root).paint(shade(L.stoneDark, 0.8), { c2: L.stone, ...stoneMat });
  b.lathe([[0, 2.78], [0.28, 2.78], [0.3, 2.72], [0.3, 2.42], [0.6, 2.42], [0.62, 2.36], [0.62, 2.02], [0.92, 2.02], [0.95, 1.92]], { seg: 8, phase: 22.5 });
  b.paint(L.trim, { ...trimMat });
  b.lathe([[0.25, 2.81], [0.32, 2.81], [0.325, 2.46]], { seg: 8, phase: 22.5, cap0: false, cap1: false });
  b.lathe([[0.57, 2.45], [0.64, 2.45], [0.645, 2.06]], { seg: 8, phase: 22.5, cap0: false, cap1: false });
  // 台面的星纹嵌线与中央聚能井
  b.paint(L.crystal, { c2: L.crystalHot, glow: 0.4 * (0.5 + 0.5 * L.glowK), mat: MAT.crystal, line: 0 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.g(X(Math.cos(a) * 1.5, 0.96, Math.sin(a) * 1.5, 0, -(a * 180) / Math.PI, 0), () => b.box(0, 0, 0, 0.76, 0.04, i % 2 ? 0.05 : 0.09));
  }
  b.lathe([[0.95, 1.0], [0.97, 0.94], [1.02, 0.5], [1.03, 0.02]], { seg: 8, phase: 22.5, cap0: false });
  b.paint(L.trim, { ...trimMat });
  b.g(X(0, 0.97, 0), () => b.torus(1.08, 0.08, 0.05, 16, 4, { crease: 30 }));
  // ── 四支弧形托臂：分节砌筑，臂弯嵌金箍，臂尖各托一枚晶体 ──
  pylons.forEach((p, i) => {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    b.bone(p);
    b.g(X(Math.cos(a) * 2.2, 0.9, Math.sin(a) * 2.2, 0, -(a * 180) / Math.PI - 90, 0), () => {
      b.paint(L.stoneDark, { c2: L.stoneLight, ...stoneMat });
      b.tube(
        [
          [0, -0.3, 0, 0.42, 0.36],
          [0, 0.5, -0.2, 0.39, 0.31],
          [0, 0.52, -0.2, 0.35, 0.28],
          [0, 1.3, -0.22, 0.32, 0.25],
          [0, 1.32, -0.22, 0.29, 0.23],
          [0, 2.1, -0.04, 0.25, 0.2],
          [0, 2.12, -0.04, 0.22, 0.18],
          [0, 2.9, 0.42, 0.16, 0.14],
          [0, 3.42, 0.94, 0.04, 0.04],
        ],
        { seg: 6, up: [1, 0, 0], crease: 30 },
      );
      b.paint(L.trim, { ...trimMat });
      b.g(X(0, 0.5, -0.16, -8, 0, 0), () => b.box(0, 0, 0, 0.9, 0.14, 0.78));
      b.g(X(0, 2.1, -0.04, 12, 0, 0), () => b.box(0, 0, 0, 0.58, 0.1, 0.48));
      // 臂背上的发光嵌线
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.4, mat: MAT.crystal, line: 0 });
      b.g(X(0, 1.3, -0.5, 0, 0, 0), () => b.box(0, 0, 0, 0.08, 1.1, 0.05));
      if (L.spiky) {
        b.paint(L.stoneDark, { c2: L.stone, ...stoneMat });
        b.g(X(0, 1.3, -0.36, -70, 0, 0), () => b.crystal(0.14, 0.8, 4, 0.8, 0.1));
        b.g(X(0, 2.3, -0.2, -60, 0, 0), () => b.crystal(0.1, 0.6, 4, 0.8, 0.1));
      }
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.35, ...crystalMat });
      b.g(X(0, 3.3, 0.9, 40, 0, 0), () => b.crystal(0.17, 0.66, 5, 0.6, 0.3));
    });
  });
  // ── 星核：放大的多面晶体，向六个方向伸出星芒；内核更亮 ──
  b.bone(star).paint(L.crystal, { c2: L.crystalMid, glow: 0.16 * L.glowK, glow2: 0.32 * L.glowK, ...crystalMat, gloss: 0.8 });
  b.g(X(0, coreY - 1.8, 0), () => b.crystal(1.25, 3.6, 6, 0.5, 0.5, 1));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    b.g(X(0, coreY, 0, 0, -(a * 180) / Math.PI, 0), () => b.g(X(0.9, 0, 0, 0, 0, -90), () => b.crystal(0.36, 1.5, 4, 0.8, 0.05)));
  }
  b.bone(inner).paint(L.crystalHot, { glow: 0.5 * L.glowK, mat: MAT.crystal, line: 0 });
  b.g(X(0, coreY - 0.85, 0), () => b.crystal(0.56, 1.7, 4, 0.5, 0.5, 1));
  // 受损的裂纹：贴着晶体表面的白热折线，三组
  const crR = (y: number): number => 1.25 * (1 - Math.abs(y - coreY) / 1.85) * 0.98 + 0.06;
  cracks.forEach((c, i) => {
    b.bone(c).paint(0xffffff, { c2: L.crystalHot, glow: 0.95, mat: MAT.crystal, line: 0 });
    crackLine(b, crR, 0.4 + i * 2.1, coreY - 1.1, coreY + 1.0, 30 + i, 1.03);
    crackLine(b, crR, 1.5 + i * 2.1, coreY - 0.5, coreY + 1.3, 40 + i, 1.03);
  });
  // ── 双层浑仪环：带刻度齿的金环 ──
  for (const [r, R] of [[ringA, 2.3], [ringB, 2.68]] as [number, number][]) {
    b.bone(r).paint(L.trim, { ...trimMat, glow: 0.08 });
    b.g(X(0, coreY, 0), () => {
      b.torus(R, 0.09, 0.13, 32, 4, { crease: 30, phase: 45 });
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        const big = k % 3 === 0;
        if (big) b.paint(L.crystal, { c2: L.crystalHot, glow: 0.55, mat: MAT.crystal, line: 0 });
        else b.paint(L.trim, { ...trimMat });
        b.g(X(Math.cos(a) * (R - 0.12), 0, Math.sin(a) * (R - 0.12), 0, -(a * 180) / Math.PI, 0), () => b.box(0, 0, 0, big ? 0.34 : 0.16, big ? 0.18 : 0.22, big ? 0.2 : 0.07));
      }
    });
  }
  // 绕转的碎晶
  b.bone(orbit).paint(L.crystal, { c2: L.crystalHot, glow: 0.3, ...crystalMat });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    const y = coreY + (hash(k, 3) - 0.5) * 2.6;
    b.g(X(Math.cos(a) * 1.8, y, Math.sin(a) * 1.8, hash(k, 4) * 40 - 20, 0, hash(k, 5) * 40 - 20), () => b.g(X(0, -0.2, 0), () => b.crystal(0.12, 0.44 + hash(k, 6) * 0.3, 4, 0.5, 0.4)));
  }
  // 无敌态的六边护罩纹(两圈)
  b.bone(shield).paint(0xffffff, { team: 1, glow: 0.6, mat: MAT.crystal, line: 0 });
  hexCage(b, 3.0, coreY - 0.9, 0.9, 9);
  hexCage(b, 3.0, coreY + 0.95, 0.9, 9);
  b.bakeGrounding(6, 0.75, 0.9);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 10;
    const dmg = 1 - a.hp;
    const weak = seg(dmg, 0.5, 0.9);
    const critical = a.hp < 0.25 && a.deathT < 0;
    let charge = 0;
    if (a.anim === 'attack') {
      const w = a.windup;
      charge = a.p < w ? a.p / w : Math.max(0, 1 - (a.p - w) / 0.25);
      out.glow = 1 + 1.2 * charge;
    } else out.glow = 1 + 0.14 * Math.sin(t * 1.8);
    // 生命越低越偏白热；低于 25% 警报式脉冲
    out.glow *= 1 + 0.5 * dmg - weak * (0.3 + 0.3 * Math.sin(t * 19) * Math.sin(t * 6.1));
    if (critical) out.glow *= 1 + 0.5 * Math.max(0, Math.sin(t * 7));
    cracks.forEach((c, i) => pose.scale(c, Math.max(0.001, seg(dmg, 0.25 * (i + 1) - 0.02, 0.25 * (i + 1) + 0.04))));
    pose.pos(star, 0, Math.sin(t * 0.9) * 0.16, 0);
    pose.rot(star, weak * 6 * Math.sin(t * 2.3), t * 14 * (1 + 2 * charge), weak * 6 * Math.cos(t * 1.9));
    pose.scale(star, 1 + 0.1 * charge + 0.02 * Math.sin(t * 2.2));
    pose.rot(inner, t * 40, t * -60, 0);
    pose.scale(inner, 1 + 0.2 * Math.sin(t * 3) + 0.5 * charge);
    // 环：生命越低转得越不稳(忽快忽慢、倾角乱晃)
    const wob = 1 + dmg * 0.8 * Math.sin(t * 3.1) + weak * 0.8 * Math.sin(t * 7.7);
    pose.rot(ringA, 24 + weak * 18 * Math.sin(t * 1.4), t * 30 * wob, 12 + weak * 16 * Math.cos(t));
    pose.rot(ringB, -30 + weak * 18 * Math.cos(t * 1.2), -t * 22 * wob, -18 + dmg * 10 * Math.sin(t * 0.9));
    pose.rot(orbit, 0, -t * 18, 0);
    pose.scale(orbit, 1 - weak * 0.3);
    pose.scale(shield, a.mode & 1 ? 1 + 0.012 * Math.sin(t * 2.4) : 0.001);
    pose.rot(shield, 0, t * 10, 0);
    if (a.deathT >= 0) {
      // 爆炸：星核膨胀闪光后碎裂，环与碎晶四散，托臂向外倒塌
      const d = a.deathT;
      const swell = seg(d, 0, 0.6);
      const burst = seg(d, 0.6, 0.9);
      const fall = seg(d, 0.7, 2.2);
      pose.scale(star, Math.max(0.001, (1 + swell * 0.45 + Math.sin(d * 60) * 0.03 * swell) * (1 - burst)));
      pose.scale(inner, (1 + swell * 1.6) * (1 - burst));
      pose.scale(ringA, Math.max(0.001, (1 + burst * 2.2) * (1 - seg(d, 1.0, 1.5))));
      pose.scale(ringB, Math.max(0.001, (1 + burst * 2.8) * (1 - seg(d, 1.0, 1.5))));
      pose.pos(ringA, 0, -fall * 2.5, 0);
      pose.pos(ringB, 0, -fall * 2.8, 0);
      pose.scale(orbit, Math.max(0.001, (1 + burst * 3) * (1 - seg(d, 0.9, 1.4))));
      pose.scale(shield, 0.001);
      pylons.forEach((p, i) => {
        const ang = (i * Math.PI) / 2 + Math.PI / 4;
        const e = easeOut(fall) * fall;
        // 朝外倒：绕切向轴转
        pose.rot(p, Math.sin(ang) * e * 66 * (0.8 + hash(i, 2) * 0.4), 0, -Math.cos(ang) * e * 66 * (0.8 + hash(i, 3) * 0.4));
        pose.pos(p, 0, -e * 0.3, 0);
      });
      pose.rot(root, 0, 0, Math.sin(d * 46) * 0.5 * (1 - fall));
      out.glow = (1 + 4 * swell) * (1 - seg(d, 0.75, 1.3)) + 0.05;
    }
  };

  return {
    key: `core:${team}`,
    geometry: b.build(),
    rig,
    height: 6.9,
    radius: 2.9,
    scale: 1,
    stride: 1,
    triangles: b.triangleCount,
    attach: { core: { joint: star, x: 0, y: 0, z: 0 }, muzzle: { joint: star, x: 0, y: 0, z: 0 }, chest: { joint: root, x: 0, y: 3.2, z: 0 }, head: { joint: star, x: 0, y: 1.8, z: 0 } },
    blend: () => 0,
    animate,
  };
}

export const structureFactories: Record<string, () => ModelDef> = {
  'tower:1:0': () => createTower(1, 0),
  'tower:2:0': () => createTower(2, 0),
  'tower:3:0': () => createTower(3, 0),
  'tower:1:1': () => createTower(1, 1),
  'tower:2:1': () => createTower(2, 1),
  'tower:3:1': () => createTower(3, 1),
  'core:0': () => createCore(0),
  'core:1': () => createCore(1),
  'ruin:0': () => createRuin(0),
  'ruin:1': () => createRuin(1),
};
