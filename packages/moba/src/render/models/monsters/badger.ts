/**
 * 小野怪 · 苔背獾(mossback)：低矮、前窄后宽的楔形四足兽。从鼻尖经头顶到后颈一道宽白纹；
 * 背上一整块叠瓦状的树皮背甲，甲上长着苔、蕨叶和一大一小两朵蘑菇；前爪特别大。
 */
import { MAT, ModelBuilder, PATTERN, X, lerp, smooth } from '../kit';
import { type Quad, gait, hitPulse, plantLeg, quadRig, rearUp, standLegs } from '../quadruped';
import { type Pose, bump, chainSkin, easeIO, easeOut, seg, strikeWarp } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const FUR = 0x8a6e50;
const FUR_DARK = 0x54402f;
const BELLY = 0xcdb890;
const STRIPE = 0xf2ead8;
const BARK = 0x6a5642;
const BARK_LIGHT = 0x8a765a;
const MOSS = 0x5f9a4a;
const MOSS_LIGHT = 0x9ccf5a;
const CAP = 0xd8683a;
const SPOT = 0xfff0c8;
const EYE = 0xffd870;
const CLAW = 0xe8dcc0;

const hash = (i: number, s: number): number => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function createMossBadger(): ModelDef {
  const Q: Quad = quadRig({
    pelvis: [0.62, -0.6],
    chest: [0.6, 0.42],
    neck: [],
    head: [0.64, 0.84],
    tail: [[0.6, -1.06]],
    front: [[0.4, 0.56, 0.46], [0.52, 0.32, 0.34], [0.54, 0.08, 0.58]],
    hind: [[0.44, 0.56, -0.6], [0.56, 0.34, -0.44], [0.56, 0.08, -0.72]],
    bendFront: -1,
    bendHind: 1,
  });
  const rig = Q.rig;
  const shell = rig.add('shell', Q.pelvis, 0, 0.9, -0.1);
  const flora = rig.add('flora', shell, 0, 1.1, -0.15);
  const b = new ModelBuilder();
  b.crease = 60;

  const furOpts = { mat: MAT.fur, pattern: PATTERN.fur, patternScale: 9, patternAmt: 0.45, grain: 0.08 } as const;
  const belly = (_x: number, _y: number, _z: number, _g: number, _nx: number, ny: number): number => smooth(0.0, -0.8, ny);

  // ── 四肢：短粗；前掌大而扁，四枚长爪 ──
  Q.legs.forEach((l) => {
    const s = l.side;
    const skin = chainSkin(rig, [l.upper, l.lower, l.foot], 0.5);
    b.bind(skin).paint(FUR_DARK, { c2: 0x3a2c22, by: (_x, y) => smooth(0.5, 0.1, y), ...furOpts });
    if (l.front) b.tube([[s * 0.4, 0.62, 0.46, 0.17, 0.2], [s * 0.5, 0.34, 0.36, 0.14, 0.15], [s * 0.54, 0.13, 0.54, 0.14, 0.16]], { seg: 7, cap0: false });
    else b.tube([[s * 0.42, 0.64, -0.6, 0.19, 0.25], [s * 0.55, 0.36, -0.46, 0.15, 0.17], [s * 0.56, 0.13, -0.68, 0.13, 0.15]], { seg: 7, cap0: false });
    b.bone(l.foot).paint(0x3a2c22, { ...furOpts });
    const pw = l.front ? 0.19 : 0.15;
    b.ball(l.rx, 0.08, l.rz + 0.06, pw, 0.09, l.front ? 0.22 : 0.19, 1);
    const nClaw = l.front ? 4 : 3;
    for (let k = 0; k < nClaw; k++) {
      const u = k / (nClaw - 1) - 0.5;
      b.paint(CLAW, { c2: 0xfff8e8, gloss: 0.6, mat: MAT.leather });
      b.g(X(l.rx + u * pw * 1.5, 0.07, l.rz + 0.22 - Math.abs(u) * 0.06, 78, u * 26 * s, 0), () => b.crystal(l.front ? 0.036 : 0.026, l.front ? 0.24 : 0.13, 4, 0.8, 0.1));
    }
  });

  // ── 躯干：前窄后宽 ──
  const rings: number[][] = [
    [0, 0.56, -1.08, 0.12, 0.12],
    [0, 0.6, -0.88, 0.5, 0.4],
    [0, 0.62, -0.42, 0.64, 0.47],
    [0, 0.6, 0.16, 0.56, 0.43],
    [0, 0.6, 0.6, 0.42, 0.37],
    [0, 0.63, 0.86, 0.31, 0.3],
  ];
  const bodyAt = (z: number): number[] => {
    let i = 0;
    while (i < rings.length - 2 && rings[i + 1][2] < z) i++;
    const u = Math.min(1, Math.max(0, (z - rings[i][2]) / (rings[i + 1][2] - rings[i][2])));
    return [lerp(rings[i][1], rings[i + 1][1], u), lerp(rings[i][3], rings[i + 1][3], u), lerp(rings[i][4], rings[i + 1][4], u)];
  };
  const bodySkin = chainSkin(rig, [Q.pelvis, Q.chest], 1.2);
  b.bind(bodySkin).paint(FUR, { c2: BELLY, by: belly, ...furOpts });
  b.tube(rings, { seg: 10, up: [1, 0, 0] });
  b.bone(Q.tail[0]).paint(FUR_DARK, { c2: STRIPE, ...furOpts });
  b.tube([[0, 0.58, -1.02, 0.11, 0.1], [0, 0.56, -1.22, 0.09, 0.08], [0, 0.6, -1.4, 0.02, 0.02]], { seg: 6, up: [1, 0, 0] });

  // ── 树皮背甲：五片叠瓦(后缘翘起)，顶上一层苔 ──
  b.bone(shell);
  for (let k = 0; k < 5; k++) {
    const zf = 0.5 - k * 0.3;
    const zb = zf - 0.4;
    const arc = (a0: number, a1: number, off0: number, off1: number): ((u: number, v: number) => number[]) => (u, v) => {
      const z = lerp(zf, zb, v);
      const [cy, rx, ry] = bodyAt(z);
      const th = lerp(a0, a1, u) * DEG;
      const off = lerp(off0, off1, v) + 0.025 * Math.sin(u * Math.PI);
      // 边缘略带缺刻：树皮不是规整的弧
      const nick = 1 - 0.05 * (hash(Math.round(u * 6) + k * 7, 3) > 0.5 ? 1 : 0) * v;
      return [Math.cos(th) * (rx + off) * nick, cy + Math.sin(th) * (ry + off), z];
    };
    b.paint(k % 2 ? BARK : BARK_LIGHT, { c2: FUR_DARK, by: (_x, _y, _z, g) => g * g * 0.6, mat: MAT.rock, pattern: PATTERN.bark, patternScale: 7, patternAmt: 0.6, grain: 0.1 });
    b.sheet(6, 2, arc(168, 12, 0.035, 0.13), true, 50);
    b.paint(MOSS, { c2: MOSS_LIGHT, by: (_x, _y, _z, _g, _nx, ny) => smooth(0.6, 1, ny), mat: MAT.cloth, grain: 0.12 });
    b.sheet(4, 2, arc(128, 52, 0.055, 0.15), false, 50);
  }

  // ── 背上的蕨叶与蘑菇(同一根骨骼，随呼吸与动作轻颤) ──
  b.bone(flora);
  const frond = (x: number, z: number, yaw: number, len: number, lift: number): void => {
    const [cy, , ry] = bodyAt(z);
    const y0 = cy + ry + 0.08;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const pts: number[][] = [];
    for (let i = 0; i <= 3; i++) {
      const u = i / 3;
      const out = u * len;
      const up = lift * Math.sin(u * 2.2) * len;
      pts.push([x + sn * out, y0 + up, z + cs * out, 0.15 * Math.sin(Math.min(1, u * 1.3 + 0.25) * Math.PI) + 0.01, 0.014]);
    }
    b.paint(MOSS, { c2: MOSS_LIGHT, mat: MAT.cloth, pattern: PATTERN.vein, patternScale: 10, patternAmt: 0.4 });
    b.tube(pts, { seg: 4, up: [cs, 0, -sn], cap0: false });
  };
  frond(0.22, 0.2, 0.9, 0.5, 0.55);
  frond(-0.24, 0.24, -1.0, 0.46, 0.6);
  frond(0.36, -0.3, 1.5, 0.54, 0.5);
  frond(-0.38, -0.36, -1.7, 0.5, 0.52);
  frond(0.2, -0.78, 2.6, 0.5, 0.5);
  frond(-0.16, -0.8, -2.7, 0.46, 0.55);
  const mushroom = (x: number, z: number, r: number, h: number, tilt: number): void => {
    const [cy, , ry] = bodyAt(z);
    const y0 = cy + ry + 0.06;
    b.g(X(x, y0, z, tilt, 0, tilt * 0.6), () => {
      b.paint(SPOT, { c2: 0xd8c8a0, mat: MAT.cloth });
      b.tube([[0, 0, 0, r * 0.3], [0.01, h * 0.6, 0, r * 0.22], [0, h, 0, r * 0.26]], { seg: 6 });
      b.paint(CAP, { c2: 0xf08a4a, gloss: 0.35, mat: MAT.leather });
      b.lathe([[h - r * 0.12, r * 0.96], [h, r], [h + r * 0.34, r * 0.74], [h + r * 0.56, r * 0.36], [h + r * 0.62, 0.01]], { seg: 9, crease: 70 });
      b.paint(SPOT, { glow: 0.12, mat: MAT.cloth, line: 0 });
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + 0.4;
        const rr = r * (i === 0 ? 0.0 : 0.6);
        b.ball(Math.cos(a) * rr, h + r * (i === 0 ? 0.6 : 0.36), Math.sin(a) * rr, r * 0.17, r * 0.07, r * 0.17, 0);
      }
    });
  };
  mushroom(0.1, -0.34, 0.3, 0.3, 6);
  mushroom(-0.24, 0.06, 0.17, 0.2, -10);

  // ── 头：钝吻、宽白纹、黑眼罩、小圆耳 ──
  const stripe = (x: number, _y: number, _z: number, _g: number, _nx: number, ny: number): number => smooth(0.19, 0.07, Math.abs(x)) * smooth(-0.1, 0.5, ny);
  b.bone(Q.head).paint(FUR_DARK, { c2: STRIPE, by: stripe, ...furOpts });
  b.tube(
    [
      [0, 0.63, 0.74, 0.3, 0.29],
      [0, 0.65, 0.98, 0.31, 0.27],
      [0, 0.62, 1.2, 0.22, 0.19],
      [0, 0.58, 1.38, 0.14, 0.12],
      [0, 0.56, 1.48, 0.08, 0.07],
    ],
    { seg: 12, up: [1, 0, 0] },
  );
  // 下颌与两颊的浅色
  b.paint(BELLY, { ...furOpts });
  b.tube([[0, 0.5, 0.86, 0.24, 0.1], [0, 0.49, 1.18, 0.16, 0.08], [0, 0.5, 1.4, 0.08, 0.05]], { seg: 6, up: [1, 0, 0] });
  b.paint(0x1c1612, { gloss: 0.6, mat: MAT.leather });
  b.ball(0, 0.585, 1.5, 0.07, 0.055, 0.05, 1);
  b.sym(() => {
    b.paint(FUR_DARK, { c2: FUR, ...furOpts });
    b.ball(0.26, 0.9, 0.86, 0.09, 0.09, 0.05, 0);
    b.paint(EYE, { glow: 0.5, mat: MAT.crystal });
    b.ball(0.2, 0.72, 1.14, 0.04, 0.045, 0.03, 0);
  });
  b.bakeGrounding(1.2, 0.72, 0.9);

  const STRIDE = 1.9;

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 1.3 + a.seed * 7;
    const br = Math.sin(t * 2.2);
    const alert = (a.mode & 2) !== 0;
    let planted = true;
    pose.pos(Q.pelvis, 0, br * 0.012, 0);
    pose.rot(flora, br * 2.5, 0, Math.sin(t * 1.7) * 2.5);
    pose.rot(Q.tail[0], 0, Math.sin(t * 3.1) * 16, 0);

    switch (a.anim) {
      case 'dead': {
        // 侧翻四脚朝天，蹬两下
        const d = a.t;
        const roll = easeIO(seg(d, 0.02, 0.45));
        const side = a.seed > 0.5 ? 1 : -1;
        pose.rot(Q.root, 0, 0, side * 172 * roll);
        pose.pos(Q.root, side * 0.3 * roll, 1.24 * roll + 0.25 * Math.sin(roll * Math.PI), 0);
        const kick = (bump(d, 0.62, 0.1) + bump(d, 0.86, 0.1)) * (1 - seg(d, 1.0, 1.1));
        Q.legs.forEach((l, i) => plantLeg(Q, pose, i, l.rx, l.ry + 0.16 * roll - 0.14 * kick * (i % 2 ? 1 : 0.6), l.rz + (l.front ? 0.14 : -0.14) * kick, 30 * roll));
        planted = false;
        pose.rot(Q.head, -16 * roll, 0, side * 12 * roll);
        pose.scale(flora, 1 - 0.5 * seg(d, 0.7, 1.3));
        out.glow = 1 - seg(d, 0.5, 1.0);
        break;
      }
      case 'move': {
        const c = a.stride * TAU;
        pose.rot(Q.head, Math.sin(c * 2) * 4 + 4, 0, 0);
        gait(Q, pose, a.stride, { style: 'trot', stride: STRIDE, lift: 0.16, bob: 0.03, pitch: 2, sway: 5, roll: 3, curl: 20 });
        pose.add(flora, 0, 0, Math.sin(c * 2) * 4);
        planted = false;
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.27));
        const hit = seg(p, 0.27, 0.36);
        const rec = easeIO(seg(p, 0.5, 1));
        const back = wind * (1 - hit);
        const fwd = hit * (1 - rec);
        if (a.mode & 1) {
          // 第三击：人立下砸
          pose.move(Q.pelvis, 0, -0.06 * fwd, 0.24 * fwd);
          pose.add(Q.pelvis, 8 * fwd, 0, 0);
          rearUp(Q, pose, back, 50, 0.16);
          pose.add(Q.head, 26 * back, 0, 0);
          for (let i = 0; i < 2; i++) {
            const l = Q.legs[i];
            plantLeg(Q, pose, i, l.rx + l.side * 0.08 * back, l.ry + 0.95 * back, l.rz - 0.1 * back + 0.2 * fwd, 40 * back);
          }
          standLegs(Q, pose, 0, 0, 12);
        } else {
          // 前扑，双爪扒击
          pose.move(Q.pelvis, 0, 0.08 * back - 0.05 * fwd, -0.24 * back + 0.5 * fwd);
          pose.add(Q.pelvis, -10 * back + 8 * fwd, 0, 0);
          pose.add(Q.head, -14 * back + 12 * fwd, 0, 0);
          standLegs(Q, pose, 0, 0, 12);
          for (let i = 0; i < 2; i++) {
            const l = Q.legs[i];
            const lag = i === a.variant % 2 ? 1 : 0.8;
            plantLeg(Q, pose, i, l.rx - l.side * 0.12 * fwd, l.ry + 0.42 * back * lag + 0.14 * fwd * (1 - fwd), l.rz - 0.1 * back + 0.62 * fwd, 30 * back - 16 * fwd);
          }
        }
        planted = false;
        break;
      }
      case 'stunned': {
        pose.rot(Q.head, 14, Math.sin(t * 4) * 20, Math.cos(t * 4) * 10);
        pose.add(Q.pelvis, 0, 0, Math.sin(t * 2) * 4);
        break;
      }
      case 'airborne': {
        pose.rot(Q.root, -18 * Math.sin(a.p * Math.PI), 0, 14);
        Q.legs.forEach((l, i) => plantLeg(Q, pose, i, l.rx + l.side * 0.1, l.ry + 0.12, l.rz + (l.front ? 0.16 : -0.16), 30));
        planted = false;
        break;
      }
      default: {
        if (a.spawnT >= 0) {
          // 出生：从地洞里探头张望，再整个爬出来
          const s = a.spawnT / 1.0;
          const peek = easeOut(seg(s, 0, 0.25));
          const climb = easeIO(seg(s, 0.45, 0.9));
          pose.pos(Q.root, 0, -1.25 + 0.5 * peek + 0.75 * climb, -0.4 * (1 - climb));
          pose.rot(Q.root, -34 * (1 - climb), 0, 0);
          pose.rot(Q.head, 20 * (1 - climb), Math.sin(s * 22) * 24 * peek * (1 - climb), 0);
        } else if (alert) {
          // 警戒：背甲抬起，前爪刨地
          pose.rot(shell, -8, 0, 0);
          pose.move(Q.pelvis, 0, -0.03, -0.04);
          pose.rot(Q.head, 8, 0, 0);
          const paw = (t * 0.8) % 1;
          const k = bump(paw, 0.3, 0.14) + bump(paw, 0.58, 0.14);
          const l = Q.legs[0];
          standLegs(Q, pose, 0, 0, 14);
          plantLeg(Q, pose, 0, l.rx, l.ry + 0.12 * k, l.rz + 0.1 - 0.2 * k, 20 * k);
          planted = false;
        } else {
          // 待机：嗅地，偶尔甩甩头
          const cyc = (t / 5) % 1;
          const act = easeIO(seg(cyc, 0.6, 0.68)) * (1 - easeIO(seg(cyc, 0.86, 0.95)));
          pose.rot(Q.head, 6 + Math.sin(t * 5) * 2 + 10 * act, Math.sin(t * 0.5) * 14 * (1 - act), Math.sin(t * 16) * 12 * act);
          pose.add(Q.chest, 4 * act, 0, 0);
        }
      }
    }
    // 受击：缩头耸肩
    const hk = hitPulse(a.hitT);
    if (hk > 0 && a.anim !== 'dead') {
      pose.add(Q.head, 16 * hk, 0, (a.seed > 0.5 ? 1 : -1) * 10 * hk);
      pose.move(Q.pelvis, 0, -0.05 * hk, -0.05 * hk);
      pose.add(shell, -6 * hk, 0, 0);
    }
    if (planted) standLegs(Q, pose);
  };

  return {
    key: 'monster:mossback',
    geometry: b.build(),
    rig,
    height: 1.6,
    radius: 1.0,
    scale: 1,
    stride: STRIDE,
    triangles: b.triangleCount,
    deathDur: 1.4,
    spawnDur: 1.0,
    outline: 1.4,
    attach: {
      chest: { joint: Q.chest, x: 0, y: 0.1, z: 0 },
      head: { joint: Q.head, x: 0, y: 0.1, z: 0.3 },
      muzzle: { joint: Q.head, x: 0, y: -0.05, z: 0.66 },
      weapon: { joint: Q.legs[1].foot, x: 0, y: 0, z: 0.25 },
      tail: { joint: Q.tail[0], x: 0, y: 0, z: -0.3 },
    },
    blend: (_f, to) => (to === 'attack' ? 0.08 : 0.16),
    animate,
  };
}
