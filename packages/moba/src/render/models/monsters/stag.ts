/**
 * 蓝buff · 霜晶巨鹿(frost_golem)：四足站立的巨型雄鹿。一对向后上方展开、像冰裂纹一样分叉的冰晶巨角，
 * 两角之间悬着一枚缓慢自转的六棱「霜纹晶」(增益标记，挂点 crest)；颈胸一圈厚白鬃，背脊一列小冰晶，蹄腕有冰晶护踝。
 * 俯视剪影 = 一个树枝状的亮青色大角 + 深蓝的细长身体。
 */
import * as THREE from 'three';
import { MAT, ModelBuilder, PATTERN, type RGB, X, lerp, mixCol, smooth } from '../kit';
import { type Quad, gait, hitPulse, plantLeg, poseLeg, quadRig, rearUp, standLegs } from '../quadruped';
import { type Pose, bump, chainSkin, easeIO, easeIn, easeOut, seg, strikeWarp } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const TAU = Math.PI * 2;

const FUR = 0x36508e;
const FUR_DARK = 0x263a6c;
const SOCK = 0x7f9cc8;
const BELLY = 0x8aa8d4;
const MANE = 0xe8f2ff;
const MANE_SHADE = 0xa9c4e6;
const HORN_ROOT = 0x3a6aa8;
const HORN_MID = 0x58c0ff;
const HORN_TIP = 0xd8f4ff;
const CREST = 0x9fe6ff;
const HOOF = 0x1a2238;
const EYE = 0xc8f4ff;
const RUNE = 0x7fd4ff;

const hash = (i: number, s: number): number => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function createFrostStag(): ModelDef {
  const Q: Quad = quadRig({
    pelvis: [1.8, -0.95],
    chest: [1.8, 0.45],
    neck: [[2.1, 0.92], [2.5, 1.2]],
    head: [2.85, 1.4],
    tail: [[1.98, -1.6]],
    front: [[0.38, 1.6, 0.6], [0.38, 0.92, 0.68], [0.38, 0.13, 0.6]],
    hind: [[0.42, 1.65, -1.0], [0.42, 0.95, -1.36], [0.42, 0.13, -1.2]],
    bendFront: 1,
    bendHind: -1,
  });
  const rig = Q.rig;
  const earL = rig.add('earL', Q.head, 0.17, 3.04, 1.34);
  const earR = rig.add('earR', Q.head, -0.17, 3.04, 1.34);
  const antL = rig.add('antlerL', Q.head, 0.13, 3.06, 1.4);
  const antR = rig.add('antlerR', Q.head, -0.13, 3.06, 1.4);
  const crest = rig.add('crest', Q.head, 0, 3.62, 1.12);
  const b = new ModelBuilder();
  b.crease = 62;

  const furOpts = { mat: MAT.fur, pattern: PATTERN.fur, patternScale: 7, patternAmt: 0.45, grain: 0.07 } as const;
  /** 背深腹浅：按法线朝下的程度混到腹色 */
  const belly = (_x: number, _y: number, _z: number, _g: number, _nx: number, ny: number): number => smooth(0.1, -0.8, ny);

  // ── 四肢：修长，蹄腕处收细；后腿的大腿前后向更宽 ──
  Q.legs.forEach((l) => {
    const s = l.side;
    const skin = chainSkin(rig, [l.upper, l.lower, l.foot], 0.45);
    b.bind(skin).paint(FUR, { c2: SOCK, by: (_x, y) => smooth(0.95, 0.3, y), ...furOpts });
    if (l.front) {
      b.tube(
        [
          [s * 0.4, 1.86, 0.56, 0.2, 0.3],
          [s * 0.41, 1.5, 0.62, 0.17, 0.22],
          [s * 0.39, 1.16, 0.68, 0.115, 0.13],
          [s * 0.38, 0.92, 0.69, 0.1, 0.105],
          [s * 0.38, 0.6, 0.65, 0.07, 0.075],
          [s * 0.38, 0.3, 0.61, 0.066, 0.07],
          [s * 0.38, 0.2, 0.61, 0.088, 0.092],
        ],
        { seg: 7, cap0: false },
      );
    } else {
      b.tube(
        [
          [s * 0.36, 1.98, -0.98, 0.27, 0.42],
          [s * 0.42, 1.6, -1.04, 0.24, 0.36],
          [s * 0.43, 1.25, -1.2, 0.15, 0.22],
          [s * 0.42, 0.95, -1.35, 0.1, 0.115],
          [s * 0.42, 0.6, -1.29, 0.07, 0.078],
          [s * 0.42, 0.3, -1.22, 0.066, 0.07],
          [s * 0.42, 0.2, -1.21, 0.088, 0.092],
        ],
        { seg: 7, cap0: false },
      );
    }
    // 蹄
    b.bone(l.foot).paint(HOOF, { c2: 0x2c3654, gloss: 0.5, mat: MAT.leather });
    b.lathe(
      [
        [0, 0.11, 0.145, l.rx, l.rz + 0.035],
        [0.1, 0.105, 0.13, l.rx, l.rz + 0.025],
        [0.21, 0.085, 0.09, l.rx, l.rz + 0.005],
      ],
      { seg: 6, crease: 30 },
    );
    // 冰晶护踝：蹄腕后上方的三枚小晶
    b.bone(l.lower).paint(HORN_MID, { c2: HORN_TIP, glow: 0.12, glow2: 0.5, gloss: 1, mat: MAT.crystal, line: 1 });
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.9 + Math.PI;
      b.g(X(l.rx + Math.sin(a) * 0.06, 0.32, l.rz + Math.cos(a) * 0.07, -28 * Math.cos(a), 0, 28 * Math.sin(a)), () => b.crystal(0.045, 0.3 - Math.abs(k - 1) * 0.07, 4, 0.7, 0.12));
    }
  });

  // ── 躯干：臀 → 收腰 → 深胸 → 颈根 ──
  const bodySkin = chainSkin(rig, [Q.pelvis, Q.chest], 1.2);
  b.bind(bodySkin).paint(FUR, { c2: BELLY, by: belly, ...furOpts });
  b.tube(
    [
      [0, 1.86, -1.66, 0.12, 0.16],
      [0, 1.84, -1.46, 0.36, 0.38],
      [0, 1.74, -1.0, 0.49, 0.48],
      [0, 1.72, -0.35, 0.42, 0.39],
      [0, 1.66, 0.3, 0.5, 0.53],
      [0, 1.78, 0.72, 0.42, 0.47],
      [0, 1.95, 0.98, 0.3, 0.36],
    ],
    { seg: 12, up: [1, 0, 0] },
  );
  // 身侧的发光霜纹：三道斜向的冰裂纹
  b.sym(() => {
    b.paint(RUNE, { c2: HORN_TIP, glow: 0.5, mat: MAT.crystal });
    const marks: number[][] = [[-0.92, 1.86, 0.46, 34], [-0.58, 1.82, 0.43, 22], [-0.26, 1.78, 0.405, 10]];
    for (const [z, y, x, tilt] of marks) {
      b.g(X(x + 0.035, y, z, 0, 90, tilt), () => b.extrude([[-0.2, 0], [-0.04, 0.045], [0.24, 0.01], [0.02, -0.045]], 0.05, 0));
      b.g(X(x + 0.03, y - 0.16, z + 0.1, 0, 90, tilt - 46), () => b.extrude([[-0.1, 0], [0, 0.03], [0.14, 0], [0, -0.03]], 0.05, 0));
    }
  });
  // 背脊冰晶：由肩到臀渐小
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    const z = lerp(0.52, -1.34, u);
    const y = 2.2 + 0.03 * Math.sin(u * Math.PI) - 0.08 * u;
    const hgt = lerp(0.42, 0.2, u) * (i % 2 ? 0.8 : 1);
    b.bind(bodySkin).paint(HORN_MID, { c2: HORN_TIP, glow: 0.12, glow2: 0.55, gloss: 1, mat: MAT.crystal, line: 1 });
    b.g(X(0, y - 0.08, z, -24 - hash(i, 1) * 14, 0, (hash(i, 2) - 0.5) * 22), () => b.crystal(0.07 * (1 - u * 0.35), hgt, 5, 0.6, 0.15));
  }
  // 短尾：上深下白
  b.bone(Q.tail[0]).paint(FUR, { c2: MANE, by: belly, ...furOpts });
  b.tube([[0, 1.96, -1.58, 0.1, 0.09], [0, 1.88, -1.8, 0.11, 0.07], [0, 1.72, -1.98, 0.02, 0.02]], { seg: 6, up: [1, 0, 0] });

  // ── 颈 ──
  const neckSkin = chainSkin(rig, [Q.chest, Q.neck[0], Q.neck[1], Q.head], 0.9);
  b.bind(neckSkin).paint(FUR, { c2: BELLY, by: belly, ...furOpts });
  b.tube(
    [
      [0, 1.86, 0.78, 0.34, 0.44],
      [0, 2.14, 0.99, 0.26, 0.33],
      [0, 2.48, 1.19, 0.2, 0.25],
      [0, 2.8, 1.36, 0.17, 0.2],
    ],
    { seg: 10, up: [1, 0, 0], cap0: false },
  );

  // ── 鬃毛围脖：三圈毛片(根暗尖亮) ──
  const d = [0, 0.81, 0.585];
  const V = [0, -d[2], d[1]];
  const maneRing = (c: number[], rx: number, ry: number, n: number, len: number, w: number, bone: number, phase: number): void => {
    b.bone(bone);
    for (let i = 0; i < n; i++) {
      const th = phase + (i / n) * TAU;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      // 朝下 / 朝前的毛更长(胸前垂成一片)
      const long = 1 + 0.55 * Math.max(0, -sn);
      const root = [c[0] + cs * rx * 0.86, c[1] + V[1] * sn * ry * 0.86, c[2] + V[2] * sn * ry * 0.86];
      let dx = cs * 0.62;
      let dy = V[1] * sn * 0.62 - d[1] * 0.75 - 0.3;
      let dz = V[2] * sn * 0.62 - d[2] * 0.75;
      const dl = Math.hypot(dx, dy, dz);
      dx /= dl;
      dy /= dl;
      dz /= dl;
      const L = len * long * (0.85 + 0.3 * hash(i, n));
      const tip = [root[0] + dx * L, root[1] + dy * L, root[2] + dz * L];
      b.paint(MANE_SHADE, { c2: MANE, ao: 0.8, ao2: 1, mat: MAT.fur, pattern: PATTERN.fur, patternScale: 8, patternAmt: 0.35 });
      b.limb(root, tip, w, 0.014, { seg: 5, flat: 0.62, up: [-sn, V[1] * cs, V[2] * cs], bulge: 0.25, cap0: false });
    }
  };
  maneRing([0, 2.58, 1.25], 0.2, 0.25, 8, 0.34, 0.11, Q.neck[1], 0.2);
  maneRing([0, 2.32, 1.1], 0.27, 0.34, 9, 0.44, 0.14, Q.neck[0], 0.55);
  maneRing([0, 2.04, 0.9], 0.34, 0.44, 10, 0.52, 0.17, Q.chest, 0.1);

  // ── 头：长吻、双耳、发光双眼(整体比写实比例放大一成半，俯视时才认得出) ──
  const HS = 1.16;
  const headXf = new THREE.Matrix4().makeTranslation(0, 2.85, 1.4).multiply(new THREE.Matrix4().makeScale(HS, HS, HS)).multiply(new THREE.Matrix4().makeTranslation(0, -2.85, -1.4));
  b.g(headXf, () => {
  b.bone(Q.head).paint(FUR, { c2: BELLY, by: (_x, _y, z, _g, _nx, ny) => Math.max(smooth(0.1, -0.8, ny), smooth(1.85, 2.2, z) * 0.7), ...furOpts });
  b.tube(
    [
      [0, 2.9, 1.24, 0.15, 0.16],
      [0, 2.93, 1.4, 0.2, 0.21],
      [0, 2.92, 1.6, 0.185, 0.19],
      [0, 2.84, 1.84, 0.13, 0.135],
      [0, 2.76, 2.06, 0.1, 0.1],
      [0, 2.71, 2.2, 0.075, 0.07],
    ],
    { seg: 9, up: [1, 0, 0] },
  );
  // 额前白纹与鼻
  b.paint(MANE, { mat: MAT.fur });
  b.g(X(0, 3.05, 1.62, 72, 0, 0), () => b.extrude([[-0.035, -0.16], [0.035, -0.16], [0.07, 0.04], [0, 0.2], [-0.07, 0.04]], 0.07, 0.02));
  b.paint(HOOF, { gloss: 0.6, mat: MAT.leather });
  b.ball(0, 2.725, 2.235, 0.068, 0.055, 0.05, 1);
  b.sym((s) => {
    // 眼：发光的杏核形
    b.paint(EYE, { glow: 0.9, mat: MAT.crystal });
    b.g(X(0.168, 2.99, 1.6, 0, 62, 18), () => b.extrude([[-0.075, 0], [-0.01, 0.036], [0.075, 0.012], [0.01, -0.03]], 0.04, 0));
    b.paint(FUR_DARK, { mat: MAT.fur });
    b.g(X(0.165, 3.035, 1.58, 0, 60, 16), () => b.box(0, 0, 0, 0.19, 0.035, 0.05, 0.012));
    // 耳：叶形薄片，朝外后上方
    b.bone(s > 0 ? earL : earR).paint(FUR, { c2: MANE_SHADE, ...furOpts });
    b.limb([0.17, 3.02, 1.34], [0.5, 3.16, 1.14], 0.085, 0.012, { seg: 5, flat: 0.42, up: [0, 0.35, 1], bulge: 0.55 });
    b.bone(Q.head);
  });
  });

  // ── 鹿角：冰裂纹一样的折线晶枝(六棱、切面)，根深 → 中段湛蓝 → 尖端白热 ──
  const ramp = (t: number): RGB => (t < 0.5 ? mixCol(HORN_ROOT, HORN_MID, t / 0.5) : mixCol(HORN_MID, HORN_TIP, (t - 0.5) / 0.5));
  const glowAt = (t: number): number => lerp(0.06, 0.62, t * t);
  const shard = (a: number[], c: number[], r0: number, r1: number, t0: number, t1: number): void => {
    b.paint(ramp(t0), { c2: ramp(t1), glow: glowAt(t0), glow2: glowAt(t1), gloss: 1, mat: MAT.crystal, line: 1 });
    b.limb(a, c, r0, r1, { seg: 6, crease: 0 });
  };
  const beam: number[][] = [[0.13, 3.04, 1.4], [0.36, 3.3, 1.2], [0.74, 3.42, 0.84], [1.14, 3.6, 0.56], [1.5, 3.52, 0.16], [1.64, 3.68, -0.14]];
  const tines: [number, number[][]][] = [
    [1, [[0.44, 3.52, 1.46], [0.4, 3.72, 1.62]]],
    [2, [[0.86, 3.72, 0.98], [0.82, 3.94, 1.1]]],
    [3, [[1.24, 3.86, 0.68], [1.34, 4.02, 0.62]]],
    [4, [[1.7, 3.74, 0.3], [1.84, 3.82, 0.36]]],
    [2, [[0.66, 3.6, 0.58], [0.6, 3.74, 0.42]]],
  ];
  b.sym((s) => {
    b.bone(s > 0 ? antL : antR);
    for (let i = 0; i < beam.length - 1; i++) shard(beam[i], beam[i + 1], lerp(0.1, 0.035, i / 4), lerp(0.085, 0.012, (i + 1) / 5), i / 5, (i + 1) / 5);
    for (const [at, pts] of tines) {
      const t0 = at / 5;
      shard(beam[at], pts[0], 0.06, 0.04, t0, t0 + 0.25);
      shard(pts[0], pts[1], 0.042, 0.008, t0 + 0.25, Math.min(1, t0 + 0.55));
    }
  });
  // 霜纹晶：悬在两角之间的六棱晶 + 三枚伴晶
  b.bone(crest).paint(CREST, { c2: 0xf0fbff, glow: 0.55, glow2: 0.85, gloss: 1, mat: MAT.crystal, line: 1 });
  b.g(X(0, 3.62 - 0.3, 1.12), () => b.crystal(0.17, 0.6, 6, 0.42, 0.42, 1));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    b.g(X(Math.cos(a) * 0.34, 3.6 + (k - 1) * 0.07, 1.12 + Math.sin(a) * 0.34, 0, 0, 0), () => b.g(X(0, -0.09, 0, 14, k * 50, 10), () => b.crystal(0.045, 0.18, 4, 0.5, 0.5, 1)));
  }
  b.bakeGrounding(3.2, 0.72, 0.9);

  const STRIDE = 3.3;

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 7;
    const br = Math.sin(t * 1.5);
    const alert = (a.mode & 2) !== 0;
    /** 低头：k 0..1；aim = 把角对准前方(否则是嗅地) */
    const lower = (k: number, aim: boolean): void => {
      pose.add(Q.neck[0], (aim ? 40 : 52) * k, 0, 0);
      pose.add(Q.neck[1], (aim ? 30 : 34) * k, 0, 0);
      pose.add(Q.head, (aim ? 32 : -14) * k, 0, 0);
    };
    // 通用底层：呼吸、霜纹晶自转、耳与尾的小动作
    pose.pos(Q.pelvis, 0, br * 0.012, 0);
    pose.rot(Q.chest, br * 0.8, 0, 0);
    pose.rot(crest, 0, t * 40, 0);
    pose.pos(crest, 0, Math.sin(t * 1.3) * 0.05, 0);
    const flick = bump((t * 0.37) % 1, 0.5, 0.06);
    pose.rot(earL, 0, -26 * flick, 14 * flick);
    pose.rot(earR, 0, 20 * bump((t * 0.29 + 0.4) % 1, 0.5, 0.07), 0);
    pose.rot(Q.tail[0], -18 * bump((t * 0.23) % 1, 0.5, 0.1), Math.sin(t * 2.3) * 8, 0);
    out.glow = 1 + 0.1 * Math.sin(t * 2.1) + (alert ? 0.5 : 0);
    let planted = true;

    switch (a.anim) {
      case 'dead': {
        // 前膝跪地 → 侧倒 → 鹿角由尖向根碎裂 → 霜纹晶脱出
        const dT = a.t;
        const kneel = easeIO(seg(dT, 0, 0.5));
        const fall = easeIn(seg(dT, 0.5, 1.1));
        const settle = seg(dT, 1.1, 1.35);
        const side = a.seed > 0.5 ? 1 : -1;
        pose.pos(Q.pelvis, 0, -0.35 * kneel - 0.1 * fall, 0.22 * kneel);
        pose.rot(Q.pelvis, 24 * kneel * (1 - fall), 0, 0);
        pose.rot(Q.chest, 8 * kneel, 0, 0);
        lower(0.5 * kneel + 0.2 * fall, false);
        pose.add(Q.head, 0, 0, side * -30 * fall);
        pose.rot(Q.root, 0, 0, side * (86 * fall + 3 * Math.sin(settle * Math.PI)));
        pose.pos(Q.root, side * 0.7 * fall, 0.42 * fall, 0);
        // 跪下时四蹄踩在原地(腿自然折起)；倒下后腿随身体伸直、微蜷
        Q.legs.forEach((l, i) => plantLeg(Q, pose, i, l.rx, l.ry - 0.2 * fall, l.rz + (0.22 + (l.front ? -0.3 : 0.3)) * fall, 30 * fall));
        planted = false;
        const shatter = seg(dT, 1.0, 1.8);
        pose.scale(antL, 1 - shatter * (0.999 - 0.04 * Math.sin(dT * 40)));
        pose.scale(antR, 1 - seg(dT, 1.1, 1.8) * 0.999);
        const pop = seg(dT, 1.2, 2.0);
        pose.pos(crest, 0, 0.8 * easeOut(pop), 0);
        pose.scale(crest, (1 + 0.5 * bump(pop, 0.2, 0.2)) * (1 - seg(dT, 1.7, 2.1)));
        out.glow = (1 + 1.5 * bump(dT, 1.2, 0.3)) * (1 - 0.8 * seg(dT, 1.4, 2.1));
        out.tint = 0.5 * seg(dT, 1.2, 2.0);
        out.tintColor = 0x8ea4c8;
        break;
      }
      case 'move': {
        const c = a.stride * TAU;
        pose.add(Q.neck[0], 10 + Math.sin(c * 2 + 0.8) * 5, 0, 0);
        pose.add(Q.neck[1], -4 + Math.sin(c * 2 + 0.2) * 4, 0, 0);
        pose.add(Q.head, 4 - Math.sin(c * 2) * 5, 0, 0);
        gait(Q, pose, a.stride, { style: 'trot', stride: STRIDE, lift: 0.42, bob: 0.07, pitch: 2.5, sway: 2, roll: 1.5, curl: 50 });
        pose.add(Q.tail[0], -20, Math.sin(c) * 14, 0);
        planted = false;
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.27));
        const hit = seg(p, 0.27, 0.36);
        const rec = easeIO(seg(p, 0.5, 1));
        if (a.variant % 2 === 0) {
          // 角挑：低头蓄力 → 前冲半步，角自下而上挑起
          const back = wind * (1 - hit);
          const fwd = hit * (1 - rec);
          pose.move(Q.pelvis, 0, -0.14 * back - 0.05 * fwd, -0.3 * back + 0.62 * fwd);
          pose.add(Q.pelvis, 6 * back - 5 * fwd, 0, 0);
          lower(0.95 * back, true);
          pose.add(Q.neck[0], -34 * fwd, 0, 0);
          pose.add(Q.neck[1], -26 * fwd, 0, 0);
          pose.add(Q.head, -30 * fwd, 0, 0);
          out.glow += 0.8 * back + 1.6 * bump(p, 0.36, 0.14);
        } else {
          // 踏击：人立(前腿收在胸前) → 双前蹄踏地
          const up = wind * (1 - hit);
          const slam = hit * (1 - rec);
          pose.move(Q.pelvis, 0, -0.1 * slam, 0.26 * slam);
          pose.add(Q.pelvis, 7 * slam, 0, 0);
          rearUp(Q, pose, up, 44, 0.35);
          pose.add(Q.neck[0], 22 * up + 16 * slam, 0, 0);
          pose.add(Q.head, 18 * up, 0, 0);
          for (let i = 0; i < 2; i++) {
            const l = Q.legs[i];
            const k = i === 0 ? up : Math.min(1, up * 1.15);
            plantLeg(Q, pose, i, l.rx, l.ry + 1.5 * k, l.rz - 0.2 * k + 0.22 * slam, 60 * k);
          }
          planted = false;
          out.glow += 0.6 * up + 1.8 * bump(p, 0.36, 0.14);
        }
        break;
      }
      case 'stunned': {
        lower(0.55, false);
        pose.add(Q.neck[0], 0, Math.sin(t * 5) * 12, 0);
        pose.add(Q.head, 0, 0, Math.sin(t * 5 + 1) * 16);
        pose.add(Q.pelvis, 0, 0, Math.sin(t * 2.5) * 3);
        break;
      }
      case 'airborne': {
        pose.rot(Q.root, -16 * Math.sin(a.p * Math.PI), 0, 10);
        for (let i = 0; i < 4; i++) poseLeg(Q, pose, i, i < 2 ? -40 : 34, i < 2 ? 70 : -50, 20);
        planted = false;
        break;
      }
      default: {
        if (a.spawnT >= 0) {
          // 出生：冰雕解冻——低头不动 → 昂首长鸣
          const s = a.spawnT / 1.2;
          const thaw = easeIO(seg(s, 0.15, 0.7));
          const cry = bump(s, 0.84, 0.16);
          lower(1 - thaw, false);
          pose.add(Q.neck[0], -16 * cry, 0, 0);
          pose.add(Q.neck[1], -14 * cry, 0, 0);
          pose.add(Q.head, -22 * cry, 0, 0);
          pose.move(Q.pelvis, 0, -0.1 * (1 - thaw), 0);
          out.tint = 0.85 * (1 - seg(s, 0.1, 0.8));
          out.tintColor = 0x9fdcff;
          out.glow = 0.3 + 0.7 * thaw + 1.4 * cry;
        } else if (alert) {
          // 警戒：低头把角对准目标，前蹄刨地
          lower(0.7, true);
          pose.move(Q.pelvis, 0, -0.06, -0.08);
          const paw = (t * 0.9) % 1;
          const k = bump(paw, 0.3, 0.14) + bump(paw, 0.58, 0.14);
          standLegs(Q, pose, 0, 0, 14);
          const l = Q.legs[0];
          plantLeg(Q, pose, 0, l.rx, l.ry + 0.3 * k, l.rz + 0.1 - 0.3 * k * Math.sin(paw * TAU * 3.4), 40 * k);
          planted = false;
        } else {
          // 待机：昂首静立；每隔几秒低头嗅地或刨一下前蹄
          const cyc = (t / 7.5) % 1;
          const which = Math.floor(t / 7.5) % 2;
          const act = easeIO(seg(cyc, 0.62, 0.7)) * (1 - easeIO(seg(cyc, 0.9, 0.98)));
          pose.add(Q.neck[0], Math.sin(t * 0.7) * 2, Math.sin(t * 0.31) * 10 * (1 - act), 0);
          pose.add(Q.head, Math.sin(t * 0.9) * 2.5, Math.sin(t * 0.31 + 0.7) * 12 * (1 - act), 0);
          if (which === 0) {
            lower(act * 0.92, false);
            pose.add(Q.head, 0, Math.sin(t * 6) * 6 * act, 0);
          } else if (act > 0) {
            lower(act * 0.3, true);
            const k = act * Math.max(0, Math.sin(cyc * TAU * 9));
            standLegs(Q, pose, 0, 0, 13);
            const l = Q.legs[1];
            plantLeg(Q, pose, 1, l.rx, l.ry + 0.26 * k, l.rz + 0.12 - 0.3 * k, 36 * k);
            planted = false;
          }
        }
      }
    }
    // 受击：头颈侧甩(叠加)
    const hk = hitPulse(a.hitT);
    if (hk > 0 && a.anim !== 'dead') {
      const sgn = a.seed > 0.5 ? 1 : -1;
      pose.add(Q.neck[0], -8 * hk, sgn * 22 * hk, 0);
      pose.add(Q.head, 0, sgn * 16 * hk, sgn * 14 * hk);
      pose.move(Q.pelvis, 0, -0.05 * hk, -0.08 * hk);
    }
    if (planted) standLegs(Q, pose);
  };

  return {
    key: 'monster:frost_golem',
    geometry: b.build(),
    rig,
    height: 3.95,
    radius: 1.5,
    scale: 1,
    stride: STRIDE,
    triangles: b.triangleCount,
    deathDur: 2.2,
    spawnDur: 1.2,
    outline: 1.6,
    attach: {
      chest: { joint: Q.chest, x: 0, y: 0, z: 0.1 },
      head: { joint: Q.head, x: 0, y: 0.1, z: 0.3 },
      muzzle: { joint: Q.head, x: 0, y: -0.12, z: 0.85 },
      weapon: { joint: Q.head, x: 0, y: 0.6, z: 0.5 },
      crest: { joint: crest, x: 0, y: 0, z: 0 },
      tail: { joint: Q.tail[0], x: 0, y: -0.2, z: -0.35 },
    },
    blend: (_f, to) => (to === 'attack' ? 0.1 : 0.2),
    animate,
  };
}
