/**
 * 红buff · 炽焰巨熊(ember_golem)：肩背高高隆起的巨熊，背上驮一座「小火山」——一圈黑曜岩甲片围成的火口，
 * 口内是亮橙的熔核与火舌(增益标记，挂点 crest / vent)；肩颈一圈火焰状的鬃，前臂覆岩甲，爪是发红的黑曜石。
 * 俯视剪影 = 前宽后窄的深色宽椭圆，正中一个发光的橙色火口。
 */
import { MAT, ModelBuilder, PATTERN, X, lerp, smooth } from '../kit';
import { type Quad, gait, hitPulse, plantLeg, quadRig, rearUp, standLegs } from '../quadruped';
import { type Pose, bump, chainSkin, easeIO, easeIn, easeOut, seg, strikeWarp } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const TAU = Math.PI * 2;

const FUR = 0x7a3a2a;
const FUR_LIGHT = 0xa8643f;
const FUR_DARK = 0x5a2a22;
const BELLY = 0xb07a50;
const OBSIDIAN = 0x2a1d20;
const OBS_EDGE = 0x6a443a;
const LAVA = 0xff5a1c;
const LAVA_HOT = 0xffd27a;
const MANE = 0xf0421a;
const MANE_TIP = 0xffc050;
const CLAW = 0x2a1a1a;
const CLAW_TIP = 0xff5a36;
const EYE = 0xffb040;

const hash = (i: number, s: number): number => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function createEmberBear(): ModelDef {
  const Q: Quad = quadRig({
    pelvis: [1.3, -1.0],
    chest: [1.42, 0.5],
    neck: [[1.6, 1.12]],
    head: [1.66, 1.5],
    jaw: [1.52, 1.6],
    tail: [[1.42, -1.72]],
    front: [[0.7, 1.4, 0.62], [0.8, 0.78, 0.48], [0.82, 0.13, 0.7]],
    hind: [[0.6, 1.26, -1.05], [0.68, 0.7, -0.78], [0.66, 0.13, -1.1]],
    bendFront: -1,
    bendHind: 1,
  });
  const rig = Q.rig;
  const crater = rig.add('crater', Q.chest, 0, 2.02, 0.1);
  const core = rig.add('core', crater, 0, 2.12, 0.1);
  const flames = [0, 1, 2].map((i) => rig.add(`flame${i}`, crater, 0, 2.16, 0.1));
  const manes = [0, 1, 2, 3].map((i) => rig.add(`mane${i}`, Q.chest, 0, 1.75, 0.95));
  const b = new ModelBuilder();
  b.crease = 62;

  const furOpts = { mat: MAT.fur, pattern: PATTERN.fur, patternScale: 5, patternAmt: 0.5, grain: 0.08 } as const;
  const belly = (_x: number, _y: number, _z: number, _g: number, _nx: number, ny: number): number => smooth(0.05, -0.8, ny);
  const obsidian = { gloss: 0.85, mat: MAT.rock, pattern: PATTERN.strata, patternScale: 5, patternAmt: 0.35 } as const;

  // ── 四肢：粗壮的熊腿，前掌特大 ──
  Q.legs.forEach((l) => {
    const s = l.side;
    const skin = chainSkin(rig, [l.upper, l.lower, l.foot], 0.5);
    b.bind(skin).paint(FUR, { c2: FUR_DARK, by: (_x, y) => smooth(1.1, 0.2, y), ...furOpts });
    if (l.front) {
      b.tube(
        [
          [s * 0.66, 1.66, 0.6, 0.36, 0.5],
          [s * 0.76, 1.2, 0.56, 0.33, 0.4],
          [s * 0.8, 0.8, 0.5, 0.27, 0.31],
          [s * 0.81, 0.46, 0.58, 0.25, 0.27],
          [s * 0.82, 0.2, 0.68, 0.28, 0.32],
        ],
        { seg: 9, cap0: false },
      );
    } else {
      b.tube(
        [
          [s * 0.52, 1.52, -1.08, 0.38, 0.56],
          [s * 0.64, 1.06, -0.94, 0.34, 0.46],
          [s * 0.68, 0.72, -0.82, 0.25, 0.3],
          [s * 0.67, 0.42, -0.98, 0.21, 0.24],
          [s * 0.66, 0.2, -1.08, 0.24, 0.28],
        ],
        { seg: 9, cap0: false },
      );
    }
    // 掌与爪
    const pz = l.rz + (l.front ? 0.12 : 0.1);
    const pw = l.front ? 0.31 : 0.26;
    b.bone(l.foot).paint(FUR_DARK, { c2: FUR, ...furOpts });
    b.ball(l.rx, 0.13, pz, pw, 0.15, l.front ? 0.4 : 0.36, 1);
    for (let k = 0; k < 4; k++) {
      const dx = (k - 1.5) * pw * 0.48;
      b.paint(CLAW, { c2: CLAW_TIP, gloss: 0.9, glow: 0, glow2: 0.55, mat: MAT.rock, line: 1 });
      b.g(X(l.rx + dx, 0.12, pz + (l.front ? 0.32 : 0.28) - Math.abs(k - 1.5) * 0.04, 76, (k - 1.5) * 9 * s, 0), () => b.crystal(l.front ? 0.055 : 0.045, l.front ? 0.3 : 0.22, 4, 0.75, 0.1));
    }
    if (l.front) {
      // 前臂的黑曜岩护甲：两片叠瓦
      b.bone(l.lower);
      for (let k = 0; k < 2; k++) {
        b.paint(OBSIDIAN, { c2: OBS_EDGE, ...obsidian });
        b.g(X(l.rx + s * 0.2, 0.66 - k * 0.24, 0.5 + k * 0.07, 6 + k * 8, s * 78, s * -6), () => b.extrude([[-0.24, -0.16], [0.24, -0.16], [0.28, 0.06], [0.08, 0.2], [-0.2, 0.16]], 0.1, 0.035));
      }
      b.paint(LAVA, { c2: LAVA_HOT, glow: 0.6, mat: MAT.crystal, pattern: PATTERN.lava, patternScale: 6, patternAmt: 0.7 });
      b.g(X(l.rx + s * 0.265, 0.56, 0.54, 10, s * 78, 0), () => b.box(0, 0, 0, 0.36, 0.035, 0.03));
    }
  });

  // ── 躯干：臀窄、肩背隆起 ──
  const bodySkin = chainSkin(rig, [Q.pelvis, Q.chest], 1.2);
  const rings: number[][] = [
    [0, 1.3, -1.78, 0.2, 0.24],
    [0, 1.32, -1.52, 0.6, 0.6],
    [0, 1.3, -1.0, 0.8, 0.72],
    [0, 1.26, -0.32, 0.84, 0.7],
    [0, 1.34, 0.36, 0.98, 0.78],
    [0, 1.42, 0.92, 0.72, 0.64],
    [0, 1.52, 1.26, 0.5, 0.48],
  ];
  b.bind(bodySkin).paint(FUR, { c2: BELLY, by: belly, ...furOpts });
  b.tube(rings, { seg: 12, up: [1, 0, 0] });
  // 肩峰：背上再垫一块隆起，火口坐在上面
  b.paint(FUR_DARK, { c2: FUR, ...furOpts });
  b.ball(0, 1.74, 0.18, 0.8, 0.44, 0.78, 2);
  /** 躯干表面上的一点：z 处截面、角度 th(0 = 正左，90° = 正上) */
  const surf = (z: number, th: number, out = 1.02): number[] => {
    let i = 0;
    while (i < rings.length - 2 && rings[i + 1][2] < z) i++;
    const u = Math.min(1, Math.max(0, (z - rings[i][2]) / (rings[i + 1][2] - rings[i][2])));
    const cy = lerp(rings[i][1], rings[i + 1][1], u);
    const rx = lerp(rings[i][3], rings[i + 1][3], u);
    const ry = lerp(rings[i][4], rings[i + 1][4], u);
    return [Math.cos(th) * rx * out, cy + Math.sin(th) * ry * out, z];
  };
  // 背部熔纹：从火口向肩、腰两侧爬下去的发光裂纹(折线)
  const crack = (z0: number, th0: number, z1: number, th1: number, n: number, w: number, seed: number): void => {
    const pts: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const jz = i > 0 && i < n ? (hash(i, seed) - 0.5) * 0.22 : 0;
      const p = surf(lerp(z0, z1, u) + jz, lerp(th0, th1, u) + (i % 2 ? 0.07 : -0.05), 1.015);
      pts.push([p[0], p[1], p[2], w * (1 - u * 0.6), w * 0.5]);
    }
    b.bind(bodySkin).paint(LAVA_HOT, { c2: LAVA, glow: 0.75, glow2: 0.4, mat: MAT.crystal, pattern: PATTERN.lava, patternScale: 6, patternAmt: 0.7 });
    b.tube(pts, { seg: 4, up: [0, 0, 1] });
  };
  for (const s of [1, -1]) {
    const m = (th: number): number => (s > 0 ? th : Math.PI - th);
    crack(0.5, m(1.0), 0.95, m(0.35), 4, 0.05, 1);
    crack(0.0, m(0.95), 0.1, m(0.1), 4, 0.055, 2);
    crack(-0.4, m(1.2), -0.95, m(0.45), 4, 0.05, 3);
    crack(-0.9, m(1.4), -1.4, m(0.9), 3, 0.04, 4);
  }
  // 短尾
  b.bone(Q.tail[0]).paint(FUR_DARK, { ...furOpts });
  b.ball(0, 1.4, -1.8, 0.16, 0.14, 0.14, 1);

  // ── 火口背甲：六片外倾的黑曜岩板围成一圈，内里是熔核 ──
  b.bone(crater);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.26;
    const R = 0.5;
    const tall = 0.62 + 0.2 * hash(i, 11) + (i === 1 || i === 4 ? 0.14 : 0);
    b.paint(OBSIDIAN, { c2: OBS_EDGE, ...obsidian });
    b.g(X(Math.sin(a) * R, 1.86, 0.1 + Math.cos(a) * R * 0.92, 0, (a * 180) / Math.PI, 0), () =>
      b.g(X(0, 0, 0, 24, 0, (hash(i, 12) - 0.5) * 14), () => {
        b.extrude([[-0.3, 0], [0.3, 0], [0.34, tall * 0.5], [0.14, tall], [-0.06, tall * 0.9], [-0.32, tall * 0.55]], 0.16, 0.05);
        // 板内侧被烤红的棱
        b.paint(LAVA, { c2: LAVA_HOT, glow: 0.55, mat: MAT.crystal });
        b.g(X(0, tall * 0.34, -0.085), () => b.box(0, 0, 0, 0.3, 0.05, 0.03));
        b.paint(OBSIDIAN, { c2: OBS_EDGE, ...obsidian });
      }));
  }
  b.bone(core).paint(LAVA_HOT, { c2: LAVA, glow: 0.95, glow2: 0.7, mat: MAT.crystal, pattern: PATTERN.lava, patternScale: 5, patternAmt: 0.8 });
  b.lathe([[2.04, 0.5, 0.48, 0, 0.1], [2.14, 0.4, 0.38, 0, 0.1], [2.2, 0.2, 0.2, 0, 0.1], [2.22, 0.02, 0.02, 0, 0.1]], { seg: 8, cap0: false });
  // 火舌：三簇，各自一根骨骼(明灭、摇摆)
  flames.forEach((f, i) => {
    b.bone(f).paint(LAVA, { c2: MANE_TIP, glow: 0.8, glow2: 0.95, mat: MAT.crystal });
    const a = (i / 3) * TAU + 0.5;
    const fx = Math.sin(a) * 0.17;
    const fz = 0.1 + Math.cos(a) * 0.17;
    const hgt = 0.5 + 0.16 * (i % 2);
    b.tube(
      [
        [fx, 2.14, fz, 0.13, 0.13],
        [fx * 1.2, 2.14 + hgt * 0.4, fz + 0.03, 0.1, 0.1],
        [fx * 0.7, 2.14 + hgt * 0.75, fz - 0.04, 0.05, 0.05],
        [fx * 0.9, 2.14 + hgt, fz, 0.008, 0.008],
      ],
      { seg: 5, cap0: false },
    );
  });

  // ── 颈与头：头宽吻短 ──
  const neckSkin = chainSkin(rig, [Q.chest, Q.neck[0], Q.head], 0.9);
  b.bind(neckSkin).paint(FUR, { c2: BELLY, by: belly, ...furOpts });
  b.tube([[0, 1.48, 1.0, 0.62, 0.58], [0, 1.58, 1.26, 0.5, 0.48], [0, 1.66, 1.5, 0.44, 0.42]], { seg: 10, up: [1, 0, 0], cap0: false });
  b.bone(Q.head).paint(FUR, { c2: FUR_LIGHT, by: (_x, _y, z) => smooth(1.75, 2.2, z), ...furOpts });
  b.tube(
    [
      [0, 1.68, 1.36, 0.4, 0.38],
      [0, 1.74, 1.6, 0.45, 0.42],
      [0, 1.72, 1.82, 0.4, 0.34],
      [0, 1.64, 2.02, 0.26, 0.2],
      [0, 1.6, 2.2, 0.2, 0.15],
      [0, 1.58, 2.3, 0.13, 0.1],
    ],
    { seg: 10, up: [1, 0, 0] },
  );
  b.paint(CLAW, { gloss: 0.6, mat: MAT.leather });
  b.ball(0, 1.62, 2.33, 0.1, 0.07, 0.06, 1);
  // 额心的黑曜岩甲片(菱形，尖朝鼻梁)
  b.paint(OBSIDIAN, { c2: OBS_EDGE, ...obsidian });
  b.g(X(0, 2.1, 1.66, 74, 0, 0), () => b.extrude([[0, -0.3], [0.2, -0.02], [0.13, 0.2], [-0.13, 0.2], [-0.2, -0.02]], 0.08, 0.03));
  b.sym(() => {
    // 圆耳
    b.paint(FUR_DARK, { c2: FUR, ...furOpts });
    b.ball(0.36, 2.06, 1.5, 0.15, 0.15, 0.08, 1);
    // 眼：斜吊的发光缝
    b.paint(EYE, { glow: 0.95, mat: MAT.crystal });
    b.g(X(0.26, 1.88, 1.93, -10, 36, 22), () => b.extrude([[-0.09, 0], [0, 0.035], [0.09, 0.02], [0.01, -0.03]], 0.05, 0));
    b.paint(FUR_DARK, { ...furOpts });
    b.g(X(0.27, 1.95, 1.9, -14, 34, 26), () => b.box(0, 0, 0, 0.24, 0.05, 0.08, 0.02));
    // 上犬齿
    b.paint(0xf4e8d0, { gloss: 0.6, mat: MAT.leather });
    b.g(X(0.12, 1.52, 2.2, 180, 0, 0), () => b.crystal(0.035, 0.14, 4, 0.9, 0.05));
  });
  // 下颌：张开时露出发光的口腔
  b.bone(Q.jaw).paint(FUR_DARK, { c2: FUR, ...furOpts });
  b.tube([[0, 1.5, 1.56, 0.34, 0.14], [0, 1.46, 1.92, 0.24, 0.1], [0, 1.47, 2.22, 0.14, 0.07]], { seg: 8, up: [1, 0, 0] });
  b.paint(LAVA, { c2: LAVA_HOT, glow: 0.75, mat: MAT.crystal });
  b.tube([[0, 1.535, 1.66, 0.24, 0.03], [0, 1.5, 2.12, 0.11, 0.03]], { seg: 4, up: [1, 0, 0] });
  b.paint(0xf4e8d0, { gloss: 0.6, mat: MAT.leather });
  b.sym(() => b.g(X(0.1, 1.5, 2.14), () => b.crystal(0.03, 0.12, 4, 0.9, 0.05)));

  // ── 火鬃：肩颈一圈火舌形的片(分到四根骨骼上，各自明灭摇摆) ──
  const N = 10;
  for (let i = 0; i < N; i++) {
    // 只铺上半圈(从一侧肩到另一侧肩)
    const th = lerp(-0.15, Math.PI + 0.15, i / (N - 1));
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    const root = [cs * 0.56, 1.5 + sn * 0.52, 1.08];
    const len = 0.62 + 0.3 * sn + 0.14 * hash(i, 21);
    const tip = [cs * (0.56 + len * 0.62), 1.5 + sn * (0.52 + len * 0.7) + 0.1, 1.08 - len * 0.62];
    const mid = [lerp(root[0], tip[0], 0.5) + cs * 0.1, lerp(root[1], tip[1], 0.5) + 0.1, lerp(root[2], tip[2], 0.5) + 0.06];
    b.bone(manes[i % 4]).paint(MANE, { c2: MANE_TIP, glow: 0.22, glow2: 0.6, mat: MAT.fur, line: 1 });
    b.tube(
      [
        [root[0], root[1], root[2], 0.2, 0.09],
        [mid[0], mid[1], mid[2], 0.16, 0.07],
        [tip[0], tip[1], tip[2], 0.012, 0.012],
      ],
      { seg: 5, up: [-sn, cs, 0], cap0: false },
    );
  }
  b.bakeGrounding(2.6, 0.72, 0.9);

  const STRIDE = 3.6;

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 7;
    const br = Math.sin(t * 1.9);
    const alert = (a.mode & 2) !== 0;
    let roar = 0;
    let fire = 1 + 0.18 * br;
    let planted = true;
    // 通用底层：沉重的喘息、火口涨落、火鬃摇曳
    pose.pos(Q.pelvis, 0, br * 0.02 - 0.03, 0);
    pose.rot(Q.chest, br * 1.2, 0, 0);
    pose.rot(Q.neck[0], 10 - br * 1.5, 0, 0);
    pose.rot(Q.head, 6, 0, 0);
    pose.rot(Q.tail[0], 0, Math.sin(t * 3) * 10, 0);

    switch (a.anim) {
      case 'dead': {
        // 人立长嚎、火口大喷发 → 熔核熄灭 → 前扑趴倒
        const d = a.t;
        const up = easeOut(seg(d, 0, 0.35)) * (1 - easeIn(seg(d, 0.55, 0.95)));
        const flop = easeIn(seg(d, 0.6, 1.25));
        const settle = bump(seg(d, 1.25, 1.6), 0.3, 0.3);
        roar = Math.max(up, 0.4 * flop);
        pose.move(Q.pelvis, 0, -0.62 * flop + 0.05 * settle, 0.5 * flop);
        pose.add(Q.pelvis, 4 * flop, 0, 5 * flop);
        rearUp(Q, pose, up, 50, 0.35);
        pose.add(Q.chest, 6 * flop, 0, 0);
        pose.add(Q.neck[0], 34 * up + 16 * flop, 0, 0);
        pose.add(Q.head, -30 * up + 6 * flop, 0, 12 * flop);
        // 前掌：人立时举起，趴倒后向前摊开；后腿向后蹬直
        for (let i = 0; i < 2; i++) {
          const l = Q.legs[i];
          plantLeg(Q, pose, i, l.rx + l.side * 0.25 * (up + flop), l.ry + 2.6 * up, l.rz - 0.5 * up + 0.75 * flop, 40 * up - 20 * flop);
        }
        for (let i = 2; i < 4; i++) {
          const l = Q.legs[i];
          plantLeg(Q, pose, i, l.rx + l.side * 0.2 * flop, l.ry, l.rz - 0.5 * flop, 50 * flop);
        }
        planted = false;
        const dim = seg(d, 0.5, 1.1);
        fire = (1 + 2.6 * bump(d, 0.3, 0.3)) * (1 - dim);
        pose.scale(core, 1 - 0.5 * dim);
        flames.forEach((f) => pose.scale(f, Math.max(0, (1 + 1.5 * bump(d, 0.3, 0.28)) * (1 - seg(d, 0.45, 0.8)))));
        manes.forEach((m) => pose.scale(m, 1 - 0.75 * seg(d, 0.6, 1.3)));
        pose.add(crater, 0, 0, 4 * settle);
        out.tint = 0.55 * seg(d, 0.7, 1.5);
        out.tintColor = 0x77707a;
        break;
      }
      case 'move': {
        const c = a.stride * TAU;
        pose.add(Q.neck[0], 6 + Math.sin(c + 1.4) * 8, 0, 0);
        pose.add(Q.head, -Math.sin(c + 1.0) * 7, 0, 0);
        gait(Q, pose, a.stride, { style: 'bound', stride: STRIDE, lift: 0.5, bob: 0.13, pitch: 7, curl: 36 });
        planted = false;
        fire += 0.2;
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.27));
        const hit = seg(p, 0.27, 0.36);
        const rec = easeIO(seg(p, 0.5, 1));
        if (a.mode & 1) {
          // 第三击：人立，双掌下砸，火口喷发
          const up = wind * (1 - hit);
          const slam = hit * (1 - rec);
          pose.move(Q.pelvis, 0, -0.14 * slam, 0.3 * slam);
          pose.add(Q.pelvis, 8 * slam, 0, 0);
          rearUp(Q, pose, up, 56, 0.4);
          pose.add(Q.neck[0], 36 * up + 10 * slam, 0, 0);
          pose.add(Q.head, -10 * up, 0, 0);
          roar = up + 0.5 * slam;
          for (let i = 0; i < 2; i++) {
            const l = Q.legs[i];
            plantLeg(Q, pose, i, l.rx + l.side * 0.2 * up, l.ry + 3.2 * up, l.rz - 0.55 * up + 0.3 * slam, 30 * up);
          }
          standLegs(Q, pose, 0, 0, 12);
          planted = false;
          fire += 1.2 * up + 3 * bump(p, 0.37, 0.16);
          flames.forEach((f) => pose.scale(f, 1 + 1.6 * bump(p, 0.4, 0.2)));
        } else {
          // 左右掌交替横拍：收掌蓄力 → 上步横扫
          const s = a.variant % 2 === 0 ? -1 : 1;
          const li = s > 0 ? 0 : 1;
          const back = wind * (1 - hit);
          const swipe = hit * (1 - rec);
          pose.move(Q.pelvis, 0, 0.06 * back - 0.08 * swipe, -0.16 * back + 0.4 * swipe);
          pose.add(Q.pelvis, -5 * back + 6 * swipe, 0, 0);
          pose.add(Q.chest, 0, s * (16 * back - 24 * swipe), s * (-6 * back + 8 * swipe));
          pose.add(Q.neck[0], -8 * back + 10 * swipe, s * (-10 * back + 16 * swipe), 0);
          roar = 0.5 * back + 0.8 * swipe;
          const l = Q.legs[li];
          standLegs(Q, pose, 0, 0, 15 & ~(1 << li));
          plantLeg(Q, pose, li, l.rx + s * (0.35 * back - 0.75 * swipe), l.ry + 1.0 * back + 0.5 * swipe * (1 - swipe), l.rz - 0.25 * back + 0.95 * swipe, 30 * back - 20 * swipe);
          planted = false;
          fire += 0.5 * back + 1.4 * bump(p, 0.36, 0.14);
        }
        break;
      }
      case 'stunned': {
        pose.add(Q.neck[0], 22, Math.sin(t * 5) * 14, 0);
        pose.add(Q.head, 10, 0, Math.sin(t * 5 + 1) * 16);
        pose.add(Q.pelvis, 0, 0, Math.sin(t * 2.5) * 3);
        fire *= 0.6;
        break;
      }
      case 'airborne': {
        pose.rot(Q.root, -14 * Math.sin(a.p * Math.PI), 0, 8);
        Q.legs.forEach((l, i) => plantLeg(Q, pose, i, l.rx + l.side * 0.2, l.ry + 0.3, l.rz + (l.front ? 0.3 : -0.3), 30));
        planted = false;
        break;
      }
      default: {
        if (a.spawnT >= 0) {
          // 出生：从地下拱出，抖落碎石，仰头咆哮
          const s = a.spawnT / 1.2;
          const rise = easeOut(seg(s, 0, 0.5));
          const shake = bump(s, 0.55, 0.16);
          const cry = bump(s, 0.82, 0.18);
          pose.pos(Q.root, Math.sin(s * 70) * 0.05 * shake, -2.3 * (1 - rise), 0);
          pose.add(Q.pelvis, -10 * (1 - rise), 0, Math.sin(s * 60) * 5 * shake);
          pose.add(Q.neck[0], -26 * cry, 0, 0);
          pose.add(Q.head, -24 * cry, 0, 0);
          roar = cry;
          fire = 0.4 + 0.6 * rise + 1.6 * cry;
          flames.forEach((f) => pose.scale(f, rise * (1 + 1.2 * cry)));
        } else if (alert) {
          // 警戒：压低前身低吼，间或昂头咆哮
          const cyc = (t * 0.3) % 1;
          const cry = bump(cyc, 0.5, 0.12);
          pose.move(Q.pelvis, 0, -0.08, -0.06);
          pose.add(Q.pelvis, 4, 0, 0);
          pose.add(Q.neck[0], 8 - 30 * cry, Math.sin(t * 9) * 1.5, 0);
          pose.add(Q.head, -18 * cry, 0, 0);
          roar = 0.25 + 0.75 * cry;
          fire += 0.4 + 0.8 * cry;
        } else {
          // 待机：伏低喘息；每隔几秒打个哈欠或挠一下地
          const cyc = (t / 6.5) % 1;
          const which = Math.floor(t / 6.5) % 2;
          const act = easeIO(seg(cyc, 0.6, 0.68)) * (1 - easeIO(seg(cyc, 0.88, 0.97)));
          pose.add(Q.neck[0], 0, Math.sin(t * 0.33) * 9 * (1 - act), 0);
          pose.add(Q.head, Math.sin(t * 0.8) * 2, Math.sin(t * 0.33 + 0.6) * 10 * (1 - act), 0);
          if (which === 0) {
            pose.add(Q.neck[0], -18 * act, 0, 0);
            pose.add(Q.head, -14 * act, 0, 8 * act);
            roar = act;
            fire += 0.3 * act;
          } else if (act > 0) {
            const k = act * Math.max(0, Math.sin(cyc * TAU * 8));
            const l = Q.legs[0];
            standLegs(Q, pose, 0, 0, 14);
            plantLeg(Q, pose, 0, l.rx, l.ry + 0.22 * k, l.rz + 0.3 - 0.4 * k, 20 * k);
            planted = false;
            pose.add(Q.neck[0], 14 * act, 10 * act, 0);
          }
        }
      }
    }
    // 受击：缩颈甩头，火口闪亮
    const hk = hitPulse(a.hitT);
    if (hk > 0 && a.anim !== 'dead') {
      const sgn = a.seed > 0.5 ? 1 : -1;
      pose.add(Q.neck[0], 10 * hk, sgn * 16 * hk, 0);
      pose.add(Q.head, 8 * hk, 0, sgn * 14 * hk);
      pose.move(Q.pelvis, 0, -0.06 * hk, -0.08 * hk);
      fire += 1.2 * hk;
    }
    pose.rot(Q.jaw, 4 + 30 * roar, 0, 0);
    // 火舌与火鬃：各带相位地伸缩摇摆
    flames.forEach((f, i) => {
      const k = 0.85 + 0.3 * Math.sin(t * 9 + i * 2.1) + 0.15 * Math.sin(t * 17 + i);
      pose.scale(f, pose.s[f] * k);
      pose.rot(f, Math.sin(t * 6 + i * 1.7) * 10, t * 40 * (i % 2 ? 1 : -1), Math.cos(t * 5 + i) * 10);
    });
    manes.forEach((m, i) => {
      pose.scale(m, pose.s[m] * (1 + 0.06 * Math.sin(t * 7 + i * 1.6)));
      pose.rot(m, Math.sin(t * 4.3 + i * 1.9) * 4 - (a.anim === 'move' ? 8 : 0), 0, Math.sin(t * 5.1 + i * 2.3) * 3);
    });
    pose.scale(core, pose.s[core] * (1 + 0.06 * br));
    out.glow = Math.max(0.03, fire);
    if (planted) standLegs(Q, pose);
  };

  return {
    key: 'monster:ember_golem',
    geometry: b.build(),
    rig,
    height: 2.95,
    radius: 1.6,
    scale: 1,
    stride: STRIDE,
    triangles: b.triangleCount,
    deathDur: 2.2,
    spawnDur: 1.2,
    outline: 1.6,
    attach: {
      chest: { joint: Q.chest, x: 0, y: 0, z: 0.2 },
      head: { joint: Q.head, x: 0, y: 0.2, z: 0.3 },
      muzzle: { joint: Q.head, x: 0, y: -0.12, z: 0.8 },
      weapon: { joint: Q.legs[1].foot, x: 0, y: 0, z: 0.3 },
      handL: { joint: Q.legs[0].foot, x: 0, y: 0, z: 0.3 },
      handR: { joint: Q.legs[1].foot, x: 0, y: 0, z: 0.3 },
      crest: { joint: crater, x: 0, y: 0.3, z: 0 },
      vent: { joint: crater, x: 0, y: 0.55, z: 0 },
      tail: { joint: Q.tail[0], x: 0, y: 0, z: -0.2 },
    },
    blend: (_f, to) => (to === 'attack' ? 0.1 : 0.2),
    animate,
  };
}
