/**
 * 星陨巨灵(star_colossus，终局首领)：悬浮的无腿巨灵，一件有结构的造物。
 *   上身像一座倒置的山：宽阔的陨铁肩台，四片胸甲围成中空的胸腔，里面悬着星核，星核外套三道缓慢转动的金色浑仪环；
 *   头是一张没有嘴的陨铁面具，额上竖一道星形裂隙；背后一轮带八芒的光轮(增益标记，挂点 crest)；
 *   两只比头还大的悬浮巨拳，与身体不相连；下身是由大到小六块环绕飘浮的陨石，收成锥尖，离地半米多。
 * 俯视剪影 = 一个大圆环(光轮 + 浑仪)加两侧两只方拳。
 */
import { MAT, ModelBuilder, PATTERN, X, lerp } from '../kit';
import { hitPulse } from '../quadruped';
import { type Pose, Rig, bump, easeIO, easeIn, easeOut, seg, strikeWarp } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const IRON = 0x444a78;
const IRON_LIGHT = 0x7880b8;
const IRON_DARK = 0x272b4c;
const SCORCH = 0x8a6a4a;
const GOLD = 0xffcf60;
const GOLD_HOT = 0xfff0b8;
const CORE = 0xfff4cc;
const FLAME = 0xffb040;
const RIFT = 0xfffbe0;

const hash = (i: number, s: number): number => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function createStarColossus(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const CY = 4.0;
  const torso = rig.add('torso', root, 0, CY, 0);
  const core = rig.add('core', torso, 0, CY, 0.1);
  const rings = [0, 1, 2].map((i) => rig.add(`ring${i}`, torso, 0, CY, 0.1));
  const head = rig.add('head', torso, 0, 5.5, 0.3);
  const halo = rig.add('halo', torso, 0, 5.35, -1.0);
  const shoulders = [1, -1].map((s) => rig.add(`shoulder${s}`, torso, s * 2.05, 5.05, 0));
  const plates = [0, 1, 2, 3].map((i) => rig.add(`plate${i}`, torso, (i % 2 ? -1 : 1) * 0.9, CY, i < 2 ? 0.75 : -0.75));
  const fists = [1, -1].map((s) => rig.add(`fist${s}`, root, s * 2.95, 2.9, 0.9));
  const WAIST_Y = [2.85, 2.4, 1.98, 1.6, 1.24, 0.9];
  const WAIST_R = [1.1, 0.9, 0.72, 0.56, 0.42, 0.28];
  const waist = WAIST_Y.map((y, i) => rig.add(`waist${i}`, root, Math.cos(i * 2.4) * (0.34 - i * 0.05), y, Math.sin(i * 2.4) * (0.34 - i * 0.05)));
  const b = new ModelBuilder();
  b.crease = 32;

  const iron = { gloss: 0.55, mat: MAT.metal, pattern: PATTERN.meteor, patternScale: 3, patternAmt: 0.5, grain: 0.06 } as const;
  const gold = { gloss: 1, mat: MAT.metal } as const;
  const rune = (x: number, y: number, z: number, rx: number, ry: number, rz: number, w: number, h: number): void => {
    b.paint(GOLD, { c2: GOLD_HOT, glow: 0.55, mat: MAT.crystal, line: 0 });
    b.g(X(x, y, z, rx, ry, rz), () => b.box(0, 0, 0, w, h, 0.07));
  };
  /** 八芒星纹(贴在平面上的发光薄片)：r 外径 */
  const star8 = (r: number, depth = 0.06): void => {
    const pts: number[][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const rr = i % 2 === 0 ? r * (i % 4 === 0 ? 1 : 0.72) : r * 0.34;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    b.extrude(pts, depth, 0);
  };

  // ── 下身：六块由大到小、螺旋环绕的陨石，收成锥尖 ──
  waist.forEach((w, i) => {
    const r = WAIST_R[i];
    const x = rig.bx(w);
    const z = rig.bz(w);
    b.rough = 0.04;
    b.bone(w).paint(i % 2 ? IRON : IRON_DARK, { c2: IRON_LIGHT, ...iron });
    b.g(X(x, WAIST_Y[i], z, hash(i, 1) * 20 - 10, i * 57, hash(i, 2) * 20 - 10), () =>
      b.lathe([[-r * 0.62, r * 0.18], [-r * 0.3, r * 0.78], [r * 0.08, r], [r * 0.36, r * 0.8], [r * 0.52, r * 0.3]], { seg: 6, phase: 15 }));
    b.rough = 0;
    // 熔蚀的断口：朝上的一面嵌一圈金线
    b.paint(GOLD, { c2: GOLD_HOT, glow: 0.5, mat: MAT.crystal, line: 0 });
    b.g(X(x, WAIST_Y[i] + r * 0.1, z, 0, i * 57, 0), () => b.torus(r * 1.0, 0.035, 0.05, 6, 4, { crease: 30, phase: 0 }));
  });
  b.bone(waist[5]).paint(GOLD, { c2: GOLD_HOT, glow: 0.3, glow2: 0.7, ...gold, mat: MAT.crystal, line: 1 });
  b.g(X(rig.bx(waist[5]), 0.92, rig.bz(waist[5]), 180, 0, 0), () => b.crystal(0.12, 0.46, 4, 0.2, 0.75));

  // ── 胸甲：四片弧形的厚甲，前后各两片，分开露出胸腔里的星核 ──
  const plateDefs: [number, number][] = [[18, 78], [102, 162], [-78, -18], [-162, -102]];
  plateDefs.forEach(([a0, a1], i) => {
    // 角度 0 = +X，90 = +Z(前)
    const R = (y: number): number => lerp(0.86, 1.62, Math.pow((y - 2.95) / 2.0, 1.2));
    const TH = 0.34;
    const y0 = 2.95 + (i < 2 ? 0.25 : 0);
    const y1 = 4.95;
    const P = (a: number, y: number, inner: boolean): number[] => {
      const rr = R(y) - (inner ? TH : 0);
      return [Math.cos(a * DEG) * rr, y, Math.sin(a * DEG) * rr * 0.86 + 0.05];
    };
    b.rough = 0.03;
    b.bone(plates[i]).paint(IRON, { c2: IRON_LIGHT, ...iron });
    b.sheet(4, 4, (u, v) => P(lerp(a1, a0, u), lerp(y0, y1, v), false), false, 30);
    b.paint(IRON_DARK, { c2: SCORCH, ...iron });
    b.sheet(3, 3, (u, v) => P(lerp(a0, a1, u), lerp(y0, y1, v), true), false, 30);
    // 四条棱边
    b.paint(IRON_DARK, { c2: IRON, ...iron });
    b.sheet(1, 4, (u, v) => P(a0, lerp(y0, y1, v), u > 0.5), true, 30);
    b.sheet(1, 4, (u, v) => P(a1, lerp(y0, y1, v), u < 0.5), true, 30);
    b.sheet(4, 1, (u, v) => P(lerp(a0, a1, u), y1, v < 0.5), true, 30);
    b.sheet(4, 1, (u, v) => P(lerp(a0, a1, u), y0, v > 0.5), true, 30);
    b.rough = 0;
    // 甲面：一道竖向的金色刻线 + 上沿的金箍
    const am = (a0 + a1) / 2;
    const pm = P(am, 4.0, false);
    rune(pm[0] * 1.03, 4.0, pm[2] * 1.03, 0, 90 - am, 0, 0.09, 1.1);
    b.paint(GOLD, { ...gold });
    b.sheet(4, 1, (u, v) => {
      const p = P(lerp(a1, a0, u), lerp(4.72, 4.9, v), false);
      return [p[0] * 1.035, p[1], p[2] * 1.035];
    }, false, 30);
  });

  // ── 星核：十二面晶 + 内焰；外套三道带刻度齿的浑仪环 ──
  b.bone(core).paint(FLAME, { c2: CORE, glow: 0.35, glow2: 0.6, gloss: 1, mat: MAT.crystal, line: 1 });
  b.ball(0, CY, 0.1, 0.56, 0.62, 0.56, 0, 0);
  b.paint(GOLD_HOT, { glow: 0.7, mat: MAT.crystal, line: 0 });
  for (let k = 0; k < 6; k++) b.g(X(0, CY, 0.1, k === 5 ? 180 : 0, k * 90, k < 4 ? 90 : 0), () => b.g(X(0, 0.4, 0), () => b.crystal(0.12, 0.5, 4, 0.8, 0.1)));
  const RING_R = [1.5, 1.7, 1.9];
  rings.forEach((r, i) => {
    const R = RING_R[i];
    b.bone(r).paint(GOLD, { c2: GOLD_HOT, glow: 0.14, ...gold, line: 1 });
    b.g(X(0, CY, 0.1), () => {
      b.torus(R, 0.075, 0.11, 32, 4, { crease: 30, phase: 45 });
      // 刻度齿：内圈一周小齿，四个正位上是发光的大齿
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        const big = k % 4 === 0;
        b.paint(big ? GOLD_HOT : GOLD, { glow: big ? 0.7 : 0.14, ...gold, mat: big ? MAT.crystal : MAT.metal, line: 0 });
        b.g(X(Math.cos(a) * (R - 0.1), 0, Math.sin(a) * (R - 0.1), 0, -(a * 180) / Math.PI, 0), () => b.box(0, 0, 0, big ? 0.3 : 0.14, big ? 0.16 : 0.2, big ? 0.16 : 0.06));
      }
    });
  });

  // ── 肩台：倒梯形的陨铁巨块，外沿一排熔蚀的齿 ──
  shoulders.forEach((sh, i) => {
    const s = i === 0 ? 1 : -1;
    b.rough = 0.045;
    b.bone(sh).paint(IRON_DARK, { c2: IRON_LIGHT, ...iron });
    b.g(X(s * 2.05, 5.05, 0, 0, 0, s * -9), () => {
      b.lathe([[-0.62, 0.3, 0.34], [-0.3, 0.74, 0.7], [0.2, 0.98, 0.9], [0.42, 0.92, 0.84], [0.52, 0.5, 0.5]], { seg: 6, phase: 30, power: 2.6 });
      b.rough = 0;
      b.paint(GOLD, { ...gold });
      b.lathe([[0.18, 1.0, 0.92], [0.3, 1.0, 0.92], [0.31, 0.95, 0.87]], { seg: 6, phase: 30, power: 2.6, cap0: false, cap1: false });
      // 肩上的晶柱
      b.paint(GOLD, { c2: GOLD_HOT, glow: 0.2, glow2: 0.6, gloss: 1, mat: MAT.crystal, line: 1 });
      b.g(X(s * 0.1, 0.42, 0, 0, 0, s * -8), () => b.crystal(0.2, 1.0, 5, 0.55, 0.1));
      b.g(X(s * 0.5, 0.36, 0.14, 12, 0, s * -30), () => b.crystal(0.14, 0.66, 5, 0.55, 0.1));
      b.g(X(s * 0.42, 0.36, -0.2, -16, 0, s * -24), () => b.crystal(0.13, 0.58, 5, 0.55, 0.1));
    });
    rune(s * 2.0, 5.0, 0.86, 0, 0, 0, 0.7, 0.08);
    rune(s * 2.0, 4.8, 0.78, 0, 0, 0, 0.36, 0.06);
  });
  // 连接两肩的后背脊梁(挡住胸腔的背面，光轮挂在它后面)
  b.rough = 0.04;
  b.bone(torso).paint(IRON_DARK, { c2: IRON, ...iron });
  b.g(X(0, 5.02, -0.3), () => b.lathe([[-0.34, 0.5, 0.36], [0, 1.3, 0.5], [0.3, 1.26, 0.46], [0.42, 0.6, 0.3]], { seg: 6, power: 2.6 }));
  b.rough = 0;

  // ── 头：没有嘴的陨铁面具，额上一道星形裂隙；脑后五枚冠晶 ──
  b.bone(head);
  b.rough = 0.02;
  b.paint(IRON_DARK, { c2: IRON, ...iron });
  b.lathe([[5.3, 0.24, 0.26, 0, 0.16], [5.6, 0.44, 0.4, 0, 0.14], [6.1, 0.48, 0.42, 0, 0.1], [6.32, 0.3, 0.3, 0, 0.06]], { seg: 6, phase: 90 });
  b.rough = 0;
  b.paint(IRON, { c2: IRON_LIGHT, ...iron });
  b.g(X(0, 5.86, 0.5, -6, 0, 0), () => b.extrude([[0, -0.66], [0.34, -0.36], [0.48, 0.2], [0.34, 0.52], [0, 0.62], [-0.34, 0.52], [-0.48, 0.2], [-0.34, -0.36]], 0.16, 0.05));
  b.paint(GOLD, { ...gold });
  b.g(X(0, 5.86, 0.56, -6, 0, 0), () => b.extrude([[0, -0.7], [0.06, -0.6], [0.06, -0.46], [0, -0.42], [-0.06, -0.46], [-0.06, -0.6]], 0.08, 0.01));
  // 眼缝与星隙
  b.paint(RIFT, { glow: 0.95, mat: MAT.crystal, line: 0 });
  b.sym(() => b.g(X(0.2, 5.82, 0.59, -6, 0, 12), () => b.box(0, 0, 0, 0.24, 0.06, 0.06, 0.015)));
  b.g(X(0, 6.12, 0.585, -6, 0, 0), () => b.extrude([[0, 0.3], [0.035, 0.05], [0.13, 0], [0.035, -0.05], [0, -0.26], [-0.035, -0.05], [-0.13, 0], [-0.035, 0.05]], 0.06, 0));
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.2 + 0.15 * i);
    b.paint(GOLD, { c2: GOLD_HOT, glow: 0.18, glow2: 0.6, gloss: 1, mat: MAT.crystal, line: 1 });
    b.g(X(Math.cos(a) * 0.5, 6.06 + Math.sin(a) * 0.24, 0.0, -18, 0, 90 - (a * 180) / Math.PI), () => b.crystal(0.1, 0.56 + (i === 2 ? 0.4 : 0.14 * (i % 2)), 4, 0.8, 0.08));
  }

  // ── 光轮：竖立的金环 + 八芒 ──
  b.bone(halo).paint(GOLD, { c2: GOLD_HOT, glow: 0.3, ...gold, line: 1 });
  b.g(X(0, 5.35, -1.0, 90, 0, 0), () => {
    b.torus(1.5, 0.09, 0.05, 32, 4, { crease: 30 });
    b.torus(1.16, 0.04, 0.03, 24, 4, { crease: 30 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      b.paint(GOLD_HOT, { c2: GOLD, glow: 0.7, glow2: 0.3, gloss: 1, mat: MAT.crystal, line: 1 });
      b.g(X(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5, 0, -(a * 180) / Math.PI, 0), () => b.g(X(0.06, 0, 0, 0, 0, -90), () => b.crystal(0.1, k % 2 ? 0.44 : 0.74, 4, 0.82, 0.12)));
      b.paint(GOLD, { glow: 0.2, ...gold, line: 0 });
      b.g(X(Math.cos(a) * 1.33, 0, Math.sin(a) * 1.33, 0, -(a * 180) / Math.PI, 0), () => b.box(0, 0, 0, 0.34, 0.035, 0.05));
    }
  });

  // ── 巨拳：前臂柱 + 方拳 + 指箍 + 拳面星纹 ──
  fists.forEach((f, i) => {
    const s = i === 0 ? 1 : -1;
    b.bone(f);
    b.g(X(s * 2.95, 2.9, 0.9), () => {
      b.rough = 0.045;
      b.paint(IRON, { c2: IRON_DARK, ...iron });
      b.lathe([[0.5, 0.56, 0.52], [1.0, 0.46, 0.44], [1.5, 0.36, 0.36], [1.72, 0.16, 0.18]], { seg: 6, phase: 15 });
      b.paint(IRON_DARK, { c2: IRON_LIGHT, ...iron });
      b.box(0, -0.08, 0.06, 1.28, 1.14, 1.32, 0.26);
      b.rough = 0;
      // 指节：拳面下沿三道凸棱
      b.paint(IRON, { c2: IRON_LIGHT, ...iron });
      for (const dx of [-0.4, 0, 0.4]) b.box(dx, -0.52, 0.52, 0.34, 0.3, 0.4, 0.09);
      b.paint(GOLD, { ...gold });
      b.g(X(0, 0.52, 0.04), () => b.torus(0.6, 0.07, 0.1, 8, 4, { crease: 30, phase: 22.5 }));
      b.g(X(0, 1.02, 0), () => b.torus(0.47, 0.05, 0.07, 6, 4, { crease: 30 }));
      // 拳面星纹
      b.paint(GOLD_HOT, { glow: 0.7, mat: MAT.crystal, line: 0 });
      b.g(X(0, -0.02, 0.73), () => star8(0.34));
      b.g(X(s * 0.655, -0.04, 0.06, 0, 90, 0), () => star8(0.24));
    });
  });
  b.bakeGrounding(6.2, 0.72, 0.92);

  /** 各部件散落在水里的位姿(出生时从这里组装起来，死亡时坠回去) */
  const scatter = (pose: Pose, j: number, k: number, idx: number, bindY: number, spread: number): void => {
    if (k <= 0) return;
    const a = hash(idx, 31) * TAU;
    pose.move(j, Math.cos(a) * spread * k, -(bindY - 0.3) * k, Math.sin(a) * spread * k);
    pose.add(j, (hash(idx, 32) * 160 - 80) * k, (hash(idx, 33) * 200 - 100) * k, (hash(idx, 34) * 160 - 80) * k);
  };

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 0.9 + a.seed * 6;
    const bob = Math.sin(t * 1.2);
    const alert = (a.mode & 2) !== 0;
    let spin = 1;
    const haloSpin = alert ? 2 : 1;
    let glow = 1 + 0.16 * Math.sin(t * 2) + (alert ? 0.35 : 0);
    let ringsOn = 1;
    // 通用底层：各部件带相位地漂浮
    pose.pos(torso, 0, bob * 0.14, 0);
    pose.rot(torso, 3 + bob * 1.0, Math.sin(t * 0.4) * 4, 0);
    pose.rot(core, t * 30, t * 46, 0);
    pose.scale(core, 1 + 0.05 * Math.sin(t * 3));
    pose.rot(head, Math.sin(t * 0.8) * 3, Math.sin(t * 0.35) * 9, 0);
    pose.pos(head, 0, Math.sin(t * 1.2 + 0.6) * 0.06, 0);
    shoulders.forEach((sh, i) => {
      pose.pos(sh, 0, Math.sin(t * 1.2 + 1 + i * 1.4) * 0.1, 0);
      pose.rot(sh, 0, 0, Math.sin(t * 0.9 + i * 2) * 3);
    });
    plates.forEach((p, i) => pose.pos(p, 0, Math.sin(t * 1.2 + i * 1.1) * 0.05, 0));
    fists.forEach((f, i) => {
      const s = i === 0 ? 1 : -1;
      pose.pos(f, s * Math.sin(t * 0.8 + i) * 0.08, Math.sin(t * 1.2 + 2 + i * 1.7) * 0.16, Math.cos(t * 0.7 + i) * 0.08);
      pose.rot(f, -8 + Math.sin(t + i) * 4, s * -10, s * Math.sin(t * 0.9 + i * 2) * 4);
    });
    waist.forEach((w, i) => {
      pose.pos(w, Math.sin(t * 0.9 + i * 1.3) * 0.07, Math.sin(t * 1.2 - i * 0.7) * 0.1, Math.cos(t * 0.8 + i * 1.1) * 0.07);
      pose.rot(w, 0, t * (12 + i * 8) * (i % 2 ? -1 : 1), 0);
    });

    switch (a.anim) {
      case 'dead': {
        // 浑仪环一道道崩断飞出 → 星核失稳 → 双拳先坠 → 肩台、胸甲坠落成石冢 → 星核升空爆散
        const d = a.t;
        rings.forEach((r, i) => {
          const fly = easeOut(seg(d, i * 0.3, i * 0.3 + 0.7));
          const ang = i * 2.1 + 0.6;
          pose.move(r, Math.cos(ang) * 4.5 * fly, 1.2 * Math.sin(fly * Math.PI) - 2.4 * fly * fly, Math.sin(ang) * 4.5 * fly);
          pose.scale(r, 1 - seg(d, i * 0.3 + 0.45, i * 0.3 + 0.8));
        });
        ringsOn = 0;
        spin = 1 + 4 * seg(d, 0, 0.6);
        const fall = (j: number, idx: number, bindY: number, t0: number, spread: number): void => {
          const k = easeIn(seg(d, t0, t0 + 0.55));
          scatter(pose, j, k, idx, bindY, spread);
          if (k >= 1) pose.move(j, 0, 0.06 * bump(d, t0 + 0.62, 0.08), 0);
        };
        fists.forEach((f, i) => fall(f, 40 + i, 2.9, 1.0 + i * 0.16, 0.6));
        shoulders.forEach((sh, i) => fall(sh, 50 + i, 5.05, 1.6 + i * 0.2, 1.3));
        plates.forEach((p, i) => fall(p, 60 + i, 3.4, 1.7 + i * 0.14, 1.5));
        waist.forEach((w, i) => fall(w, 70 + i, WAIST_Y[i], 1.5 + i * 0.1, 1.1));
        fall(head, 80, 5.6, 2.0, 0.9);
        pose.scale(halo, 1 - seg(d, 0.9, 1.5));
        // 星核：失稳闪烁 → 升空 → 爆散
        const rise = easeIO(seg(d, 2.4, 3.0));
        pose.pos(core, 0, 1.6 * rise, 0);
        pose.scale(core, (1 + 0.25 * Math.sin(d * 40) * seg(d, 0.6, 2.4) + 0.9 * bump(d, 3.1, 0.2)) * (1 - seg(d, 3.15, 3.4)));
        glow = (1 + 0.5 * Math.sin(d * 34) * seg(d, 0.5, 2.4)) * (1 - 0.6 * seg(d, 1.0, 2.4)) + 1.6 * bump(d, 3.1, 0.25);
        out.tint = 0.4 * seg(d, 1.6, 2.6);
        out.tintColor = 0x6a6e86;
        break;
      }
      case 'move': {
        pose.add(torso, 10, 0, 0);
        fists.forEach((f) => pose.move(f, 0, 0.1, -0.5));
        waist.forEach((w, i) => pose.move(w, 0, 0, -0.16 * (i + 1)));
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.27));
        const hit = seg(p, 0.27, 0.36);
        const rec = easeIO(seg(p, 0.55, 1));
        const back = wind * (1 - hit);
        const fwd = hit * (1 - rec);
        if (a.variant % 2 === 0) {
          // 右拳直捶：拳后拉、躯干拧转 → 直线捶出
          pose.add(torso, -4 * back + 8 * fwd, 22 * back - 26 * fwd, 0);
          pose.move(fists[1], 0.9 * back - 1.5 * fwd, 1.2 * back - 0.2 * fwd, -1.5 * back + 2.6 * fwd);
          pose.add(fists[1], -70 * back - 86 * fwd, 0, 0);
          pose.move(fists[0], 0, 0.3 * back, 0.2 * back - 0.4 * fwd);
          pose.add(head, 0, -10 * back + 8 * fwd, 0);
        } else {
          // 双拳合砸：高举过头 → 轰然砸落(过冲后回弹)
          pose.add(torso, -16 * back + 22 * fwd, 0, 0);
          pose.move(torso, 0, 0.25 * back - 0.35 * fwd, 0.3 * fwd);
          fists.forEach((f, i) => {
            const s = i === 0 ? 1 : -1;
            pose.move(f, -s * 1.5 * (back + fwd), 3.6 * back - 1.7 * fwd, -0.6 * back + 1.5 * fwd);
            pose.add(f, -110 * back + 24 * fwd, 0, 0);
          });
          pose.add(head, -18 * back + 14 * fwd, 0, 0);
        }
        pose.scale(core, 1 + 0.4 * back);
        spin = 1 + 3 * back;
        glow += 0.25 * back + 0.6 * bump(p, 0.36, 0.14);
        break;
      }
      case 'stunned': {
        pose.add(torso, 10, 0, Math.sin(t * 5) * 5);
        pose.add(head, 14, Math.sin(t * 5) * 18, 20);
        spin = 0;
        rings.forEach((r, i) => pose.move(r, (i - 1) * 0.3, -0.2 * i, 0));
        glow *= 0.7;
        break;
      }
      default: {
        if (a.spawnT >= 0) {
          // 出生：碎石从水里浮起，围着星核组装成形 → 浑仪点亮旋转，光轮展开
          const s = a.spawnT;
          const part = (j: number, idx: number, bindY: number, order: number, spread: number): void => {
            const k = 1 - easeIO(seg(s, 1.0 + order * 0.1, 1.9 + order * 0.1));
            scatter(pose, j, k, idx, bindY, spread);
            pose.scale(j, pose.s[j] * Math.min(1, seg(s, 0.9, 1.1) + 0.001));
          };
          waist.forEach((w, i) => part(w, 70 + i, WAIST_Y[i], 5 - i, 1.6));
          plates.forEach((p, i) => part(p, 60 + i, 3.4, 3 + i, 2.2));
          shoulders.forEach((sh, i) => part(sh, 50 + i, 5.05, 5 + i, 2.6));
          fists.forEach((f, i) => part(f, 40 + i, 2.9, 6 + i, 1.2));
          part(head, 80, 5.6, 7, 1.4);
          const coreUp = easeOut(seg(s, 0.9, 1.5));
          pose.pos(core, 0, -3.4 * (1 - coreUp), 0);
          pose.scale(core, Math.max(0.001, coreUp));
          ringsOn = easeOut(seg(s, 2.2, 2.7));
          pose.scale(halo, Math.max(0.001, easeOut(seg(s, 2.4, 2.9)) * (1 + 0.25 * bump(s, 2.8, 0.15))));
          spin = 1 + 5 * (1 - seg(s, 2.2, 3.0));
          glow = 0.5 + 0.8 * bump(s, 1.2, 0.4) + 0.9 * bump(s, 2.7, 0.3) + 0.5 * seg(s, 2.6, 3.0);
        } else if (alert) {
          // 警戒：双拳握紧提到胸前
          fists.forEach((f, i) => {
            const s = i === 0 ? 1 : -1;
            pose.move(f, -s * 0.9, 1.3, 0.7);
            pose.add(f, -50, 0, 0);
          });
          pose.add(torso, 4, 0, 0);
        } else {
          // 待机：双拳缓慢开合(一前一后地翻转)
          fists.forEach((f, i) => pose.add(f, Math.sin(t * 0.6 + i * Math.PI) * 14, 0, 0));
        }
      }
    }
    // 受击：星核一闪，各部件外推后弹回
    const hk = hitPulse(a.hitT);
    if (hk > 0 && a.anim !== 'dead') {
      plates.forEach((p, i) => pose.move(p, (i % 2 ? -1 : 1) * 0.16 * hk, 0, (i < 2 ? 1 : -1) * 0.16 * hk));
      shoulders.forEach((sh, i) => pose.move(sh, (i === 0 ? 1 : -1) * 0.2 * hk, 0.08 * hk, 0));
      pose.add(head, -8 * hk, 0, 0);
      pose.scale(core, pose.s[core] * (1 + 0.3 * hk));
      glow += 0.5 * hk;
    }
    // 浑仪三环：各自倾斜，绕竖轴以不同速度进动(20 / 33 / -14 度每秒)
    const RATE = [20, 33, -14];
    const TILT = [16, 34, -27];
    rings.forEach((r, i) => {
      pose.rot(r, 0, a.time * RATE[i] * spin + i * 70, 0);
      pose.add(r, TILT[i], 0, 0);
      pose.scale(r, pose.s[r] * Math.max(0.001, ringsOn));
    });
    pose.rot(halo, 0, 0, a.time * 24 * haloSpin);
    out.glow = Math.max(0.04, glow);
  };

  return {
    key: 'monster:star_colossus',
    geometry: b.build(),
    rig,
    height: 7.0,
    radius: 3.0,
    scale: 1,
    stride: 3,
    triangles: b.triangleCount,
    deathDur: 3.6,
    spawnDur: 3.0,
    outline: 1.8,
    attach: {
      chest: { joint: core, x: 0, y: 0, z: 0.3 },
      core: { joint: core, x: 0, y: 0, z: 0 },
      head: { joint: head, x: 0, y: 0.5, z: 0.2 },
      weapon: { joint: fists[1], x: 0, y: -0.4, z: 0.5 },
      handL: { joint: fists[0], x: 0, y: -0.2, z: 0.4 },
      handR: { joint: fists[1], x: 0, y: -0.2, z: 0.4 },
      muzzle: { joint: core, x: 0, y: 0, z: 0.6 },
      crest: { joint: halo, x: 0, y: 0, z: 0 },
    },
    blend: () => 0.24,
    animate,
  };
}
