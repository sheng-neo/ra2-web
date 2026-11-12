/**
 * 野怪(兽类)：
 *   mossback    苔背兽   —— 背着一整块长草长蘑菇的岩壳的矮胖四足兽
 *   glimwing    荧翼蜥   —— 扑着发光翼膜悬停的细长飞蜥
 *   abyss_drake 深渊鳞兽 —— 河道史诗野怪：长颈、双角、背生紫晶棘的巨兽，体型压人
 */
import { bump, seg, strikeWarp } from '../humanoid';
import { ModelBuilder, X, lerp } from '../kit';
import { type Pose, Rig } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const TAU = Math.PI * 2;

// ───────────────────────────── 苔背兽 ─────────────────────────────

export function createMossback(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 0.62, 0);
  const head = rig.add('head', body, 0, 0.62, 0.72);
  const tail = rig.add('tail', body, 0, 0.6, -0.8);
  const legPos: [number, number][] = [[0.42, 0.45], [-0.42, 0.45], [0.42, -0.45], [-0.42, -0.45]];
  const legs = legPos.map(([x, z], i) => rig.add(`leg${i}`, body, x, 0.42, z));
  const b = new ModelBuilder();
  b.crease = 36;

  // 四条短腿 + 石爪
  legs.forEach((leg, i) => {
    const [x, z] = legPos[i];
    b.bone(leg).paint(0x8a6f4e, { c2: 0x6a543a });
    b.lathe([[0.04, 0.15, 0.17, x, z + 0.02], [0.2, 0.14, 0.15, x, z], [0.46, 0.19, 0.2, x, z]], { seg: 6 });
    b.paint(0xd8d2c0, { gloss: 0.5 });
    for (const dx of [-0.08, 0, 0.08]) b.g(X(x + dx, 0.05, z + 0.17, 80, 0, 0), () => b.crystal(0.035, 0.12, 4, 0.8, 0.1));
  });
  // 身体：皮色背深腹浅
  b.bone(body).paint(0xc8ae7e, { c2: 0x8a6f4e });
  b.tube([[0, 0.56, -0.86, 0.2, 0.18], [0, 0.6, -0.6, 0.5, 0.36], [0, 0.64, 0, 0.62, 0.44], [0, 0.62, 0.5, 0.52, 0.38], [0, 0.6, 0.78, 0.3, 0.26]], { seg: 8, up: [1, 0, 0] });
  // 岩壳：粗糙的切面岩 + 苔顶
  b.rough = 0.035;
  b.paint(0x6c7468, { c2: 0x8f9a82 });
  b.lathe([[0.78, 0.66, 0.84, 0, -0.04], [0.92, 0.62, 0.8, 0, -0.04], [1.14, 0.46, 0.6, 0, -0.06], [1.3, 0.22, 0.3, 0, -0.08]], { seg: 7, crease: 26, cap0: false });
  b.paint(0x4f9a4a, { c2: 0x8fd060 });
  b.lathe([[1.1, 0.5, 0.64, 0, -0.06], [1.28, 0.3, 0.4, 0, -0.08], [1.37, 0.06, 0.08, 0, -0.08]], { seg: 7, crease: 26, cap0: false });
  b.rough = 0;
  // 壳上的小东西：草丛、发光蘑菇、一簇水晶
  b.paint(0x7fc850, { c2: 0xc8e870 });
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1 + 0.3;
    const r = 0.14 + (i % 3) * 0.12;
    b.g(X(Math.cos(a) * r, 1.3 - r * 0.25, Math.sin(a) * r * 1.3 - 0.08, Math.sin(a) * 20, 0, -Math.cos(a) * 20), () => b.crystal(0.03, 0.24, 3, 0.9, 0.05));
  }
  for (const [x, z, s] of [[0.34, 0.2, 1], [-0.3, -0.36, 0.8], [-0.36, 0.3, 0.6]]) {
    b.paint(0xf0e6cc);
    b.tube([[x, 1.02, z, 0.03 * s], [x * 1.1, 1.2 * (0.92 + s * 0.08), z * 1.1, 0.025 * s]], { seg: 5 });
    b.paint(0xffc850, { c2: 0xfff0a0, glow: 0.45 });
    b.g(X(x * 1.1, 1.2 * (0.92 + s * 0.08), z * 1.1), () => b.lathe([[0, 0.1 * s], [0.04 * s, 0.09 * s], [0.09 * s, 0.03 * s]], { seg: 6 }));
  }
  b.paint(0x58d8c8, { c2: 0xc8fff0, glow: 0.4, gloss: 1, line: 1 });
  b.g(X(0.12, 1.2, -0.5, -30, 0, 10), () => b.crystal(0.07, 0.3, 5, 0.5, 0.1));
  b.g(X(-0.02, 1.2, -0.56, -40, 0, -14), () => b.crystal(0.05, 0.22, 5, 0.5, 0.1));
  // 头：钝吻、獠牙、发光的小眼
  b.bone(head).paint(0xc8ae7e, { c2: 0x8a6f4e });
  b.tube([[0, 0.62, 0.7, 0.3, 0.26], [0, 0.6, 1.0, 0.27, 0.23], [0, 0.54, 1.26, 0.2, 0.15], [0, 0.5, 1.36, 0.1, 0.08]], { seg: 7, up: [1, 0, 0] });
  b.paint(0x6c7468, { c2: 0x8f9a82 });
  b.g(X(0, 0.84, 0.96, 20, 0, 0), () => b.box(0, 0, 0, 0.44, 0.1, 0.34, 0.04));
  b.sym(() => {
    b.paint(0xfff0d8, { gloss: 0.6 });
    b.tube([[0.16, 0.46, 1.2, 0.045], [0.24, 0.5, 1.34, 0.035], [0.26, 0.64, 1.42, 0.006]], { seg: 5 });
    b.paint(0xffe070, { glow: 0.8 });
    b.ball(0.21, 0.68, 1.08, 0.04, 0.045, 0.03, 0);
  });
  b.bone(tail).paint(0x8a6f4e);
  b.tube([[0, 0.56, -0.82, 0.12], [0, 0.5, -1.04, 0.07], [0, 0.52, -1.2, 0.01]], { seg: 5 });
  b.bakeGrounding(1.4);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 1.6 + a.seed * 6;
    switch (a.anim) {
      case 'dead': {
        const e = seg(a.t, 0.05, 0.6);
        const k = e * e;
        pose.rot(root, 0, 0, 96 * k);
        pose.pos(root, 0.5 * k, 0.2 * k + Math.sin(e * Math.PI) * 0.2, 0);
        legs.forEach((leg, i) => pose.rot(leg, (i < 2 ? -30 : 30) * k, 0, 0));
        pose.rot(head, 20 * k, 0, 0);
        out.glow = 1 - e;
        break;
      }
      case 'move': {
        const s = Math.sin(a.stride * TAU);
        pose.rot(legs[0], s * 34, 0, 0);
        pose.rot(legs[3], s * 34, 0, 0);
        pose.rot(legs[1], -s * 34, 0, 0);
        pose.rot(legs[2], -s * 34, 0, 0);
        pose.pos(body, 0, Math.abs(Math.cos(a.stride * TAU)) * 0.05, 0);
        pose.rot(body, 0, 0, s * 4);
        pose.rot(head, Math.cos(a.stride * TAU * 2) * 5, -s * 6, 0);
        pose.rot(tail, 0, s * 30, 0);
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = seg(p, 0, 0.26);
        const hit = seg(p, 0.26, 0.36);
        const rec = seg(p, 0.5, 1);
        const back = wind * (1 - hit);
        const fwd = hit * (1 - rec);
        pose.pos(body, 0, 0.1 * back - 0.06 * fwd, -0.3 * back + 0.55 * fwd);
        pose.rot(body, -14 * back + 10 * fwd, 0, 0);
        pose.rot(head, -30 * back + 26 * fwd, 0, 0);
        legs.forEach((leg, i) => pose.rot(leg, (i < 2 ? -24 : 20) * back + (i < 2 ? 30 : -26) * fwd, 0, 0));
        break;
      }
      case 'stunned': {
        pose.rot(body, 0, 0, Math.sin(t * 3) * 6);
        pose.rot(head, 16, Math.sin(t * 3) * 22, 0);
        break;
      }
      case 'airborne': {
        pose.rot(root, -20 * Math.sin(a.p * Math.PI), 0, 14);
        legs.forEach((leg, i) => pose.rot(leg, i < 2 ? -40 : 40, 0, 0));
        break;
      }
      default: {
        pose.pos(body, 0, Math.sin(t) * 0.02, 0);
        pose.rot(head, Math.sin(t * 0.8) * 4, Math.sin(t * 0.37) * 16, 0);
        pose.rot(tail, 0, Math.sin(t * 1.9) * 24, 0);
      }
    }
  };
  return {
    key: 'monster:mossback', geometry: b.build(), rig, height: 1.5, radius: 0.95, scale: 1, stride: 1.7, triangles: b.triangleCount,
    attach: { chest: { joint: body, x: 0, y: 0.2, z: 0 }, head: { joint: head, x: 0, y: 0.1, z: 0.4 }, muzzle: { joint: head, x: 0, y: -0.05, z: 0.7 }, weapon: { joint: head, x: 0, y: -0.05, z: 0.7 } },
    blend: () => 0.14,
    animate,
  };
}

// ───────────────────────────── 荧翼蜥 ─────────────────────────────

export function createGlimwing(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 1.25, 0);
  const neck = rig.add('neck', body, 0, 1.3, 0.3);
  const head = rig.add('head', neck, 0, 1.4, 0.56);
  const tail1 = rig.add('tail1', body, 0, 1.2, -0.34);
  const tail2 = rig.add('tail2', tail1, 0, 1.12, -0.74);
  const wing = (s: number): [number, number] => {
    const a = rig.add(`wing${s > 0 ? 'L' : 'R'}`, body, s * 0.14, 1.36, 0.08);
    const o = rig.add(`wingTip${s > 0 ? 'L' : 'R'}`, a, s * 0.72, 1.44, 0.04);
    return [a, o];
  };
  const [wL, wLo] = wing(1);
  const [wR, wRo] = wing(-1);
  const b = new ModelBuilder();
  b.crease = 40;

  // 身体：背部青黑，腹部浅色
  b.bone(body).paint(0xbfe8d8, { c2: 0x2c6c78 });
  b.tube([[0, 1.2, -0.36, 0.1, 0.09], [0, 1.24, -0.1, 0.17, 0.16], [0, 1.28, 0.16, 0.16, 0.15], [0, 1.31, 0.32, 0.1, 0.1]], { seg: 7, up: [1, 0, 0] });
  // 蜷着的小爪
  b.paint(0x2c6c78);
  b.sym(() => {
    b.tube([[0.1, 1.16, 0.14, 0.04], [0.14, 1.02, 0.2, 0.03], [0.13, 0.95, 0.3, 0.008]], { seg: 4 });
    b.tube([[0.1, 1.12, -0.2, 0.045], [0.15, 0.96, -0.24, 0.03], [0.14, 0.88, -0.14, 0.008]], { seg: 4 });
  });
  b.bone(neck).paint(0xbfe8d8, { c2: 0x2c6c78 });
  b.tube([[0, 1.3, 0.28, 0.1, 0.1], [0, 1.36, 0.44, 0.08, 0.08], [0, 1.4, 0.58, 0.075, 0.075]], { seg: 6, up: [1, 0, 0] });
  // 头：尖吻 + 颈后发光的棘冠 + 亮眼
  b.bone(head).paint(0x3a8a92, { c2: 0x2c6c78 });
  b.tube([[0, 1.41, 0.52, 0.1, 0.09], [0, 1.42, 0.68, 0.11, 0.085], [0, 1.39, 0.86, 0.06, 0.045], [0, 1.37, 0.96, 0.02, 0.02]], { seg: 6, up: [1, 0, 0] });
  b.paint(0x8ff0e0, { c2: 0xe0fff8, glow: 0.4, glow2: 0.7, line: 1 });
  for (const [x, rz] of [[0, 0], [0.07, -34], [-0.07, 34]]) b.g(X(x, 1.47, 0.58, -50, 0, rz), () => b.extrude([[-0.03, 0], [0.03, 0], [0, 0.24]], 0.014, 0));
  b.paint(0xfff4b0, { glow: 0.9 });
  b.sym(() => b.ball(0.085, 1.45, 0.7, 0.028, 0.03, 0.03, 0));
  // 尾：两节，末端一枚发光的叶状尾鳍
  b.bone(tail1).paint(0x9ad4c8, { c2: 0x2c6c78 });
  b.tube([[0, 1.2, -0.32, 0.1, 0.09], [0, 1.14, -0.56, 0.065, 0.06], [0, 1.12, -0.76, 0.045, 0.04]], { seg: 6, up: [1, 0, 0] });
  b.bone(tail2).paint(0x2c6c78, { c2: 0x3a8a92 });
  b.tube([[0, 1.12, -0.74, 0.045, 0.04], [0, 1.14, -1.0, 0.03, 0.028], [0, 1.2, -1.2, 0.015, 0.015]], { seg: 5, up: [1, 0, 0] });
  b.paint(0x5fe0d0, { c2: 0xd8fff4, glow: 0.4, glow2: 0.75, line: 1 });
  b.g(X(0, 1.2, -1.2, -70, 0, 0), () => b.extrude([[0, 0], [0.09, 0.14], [0, 0.4], [-0.09, 0.14]], 0.016, 0.004));
  // 翼：内外两段的翼膜(发光，由根部向翼梢渐亮)
  const membrane = (inner: number, outer: number, s: number): void => {
    b.bone(inner).paint(0x2c8a8c, { c2: 0x58e0d0, glow: 0.1, glow2: 0.4 });
    b.sheet(3, 2, (u, v) => [s * (0.14 + u * 0.58), 1.36 + u * 0.08 + 0.03 * Math.sin(u * 3), 0.16 - v * (0.46 + u * 0.1) - u * 0.04]);
    b.paint(0x2c6c78);
    b.tube([[s * 0.14, 1.37, 0.16, 0.035], [s * 0.72, 1.45, 0.12, 0.022]], { seg: 4 });
    b.bone(outer).paint(0x58e0d0, { c2: 0xc8fff0, glow: 0.4, glow2: 0.75 });
    b.sheet(3, 2, (u, v) => [s * (0.72 + u * 0.62), 1.44 - u * 0.1, 0.12 - u * 0.2 - v * (0.56 - u * 0.5)]);
    b.paint(0x2c6c78);
    b.tube([[s * 0.72, 1.45, 0.12, 0.022], [s * 1.34, 1.34, -0.08, 0.006]], { seg: 4 });
  };
  membrane(wL, wLo, 1);
  membrane(wR, wRo, -1);
  b.bakeGrounding(1.6, 0.8, 1);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 6;
    const flapHz = a.anim === 'move' ? 4.4 : 3.2;
    let flap = Math.sin(t * flapHz * TAU);
    let flap2 = Math.sin(t * flapHz * TAU - 0.9);
    let hover = Math.sin(t * 2.2) * 0.1;
    let amp = 1;
    switch (a.anim) {
      case 'dead': {
        const e = seg(a.t, 0, 0.55);
        const k = e * e;
        pose.pos(root, 0, -1.05 * k, 0);
        pose.rot(root, 20 * k, 0, 70 * k);
        pose.rot(neck, 30 * k, 0, 0);
        pose.rot(tail1, -20 * k, 0, 0);
        amp = 1 - e;
        flap = flap * amp - 0.7 * e;
        flap2 = flap2 * amp - 0.5 * e;
        hover *= amp;
        out.glow = 1 - e;
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = seg(p, 0, 0.28);
        const hit = seg(p, 0.28, 0.36);
        const rec = seg(p, 0.5, 1);
        const back = wind * (1 - hit);
        const fwd = hit * (1 - rec);
        pose.rot(body, -24 * back + 14 * fwd, 0, 0);
        pose.rot(neck, -40 * back + 30 * fwd, 0, 0);
        pose.rot(head, 30 * back - 10 * fwd, 0, 0);
        pose.pos(root, 0, 0.16 * back, -0.2 * back + 0.3 * fwd);
        flap = flap * 0.4 + 0.8 * back - 0.6 * fwd;
        flap2 = flap;
        out.glow = 1 + 1.8 * bump(p, 0.3, 0.2);
        break;
      }
      case 'stunned': {
        pose.rot(root, 0, 0, Math.sin(t * 9) * 10);
        pose.rot(head, 20, Math.sin(t * 7) * 20, 0);
        hover -= 0.3;
        break;
      }
      case 'move': {
        pose.rot(body, 14, 0, 0);
        break;
      }
      default:
    }
    pose.move(root, 0, hover, 0);
    pose.rot(wL, 0, 0, -8 + flap * 42);
    pose.rot(wR, 0, 0, 8 - flap * 42);
    pose.rot(wLo, 0, 0, flap2 * 34);
    pose.rot(wRo, 0, 0, -flap2 * 34);
    pose.add(body, -flap * 3, 0, 0);
    pose.add(tail1, Math.sin(t * 2.2 + 1) * 8 * amp, Math.sin(t * 1.7) * 14 * amp, 0);
    pose.add(tail2, Math.sin(t * 2.2 + 0.4) * 10 * amp, Math.sin(t * 1.7 - 0.8) * 20 * amp, 0);
    if (a.anim === 'idle') pose.rot(head, Math.sin(t * 1.1) * 6, Math.sin(t * 0.6) * 16, 0);
  };
  return {
    key: 'monster:glimwing', geometry: b.build(), rig, height: 1.85, radius: 0.6, scale: 1, stride: 1.5, triangles: b.triangleCount,
    attach: { chest: { joint: body, x: 0, y: 0, z: 0 }, head: { joint: head, x: 0, y: 0.05, z: 0.2 }, muzzle: { joint: head, x: 0, y: -0.02, z: 0.42 }, weapon: { joint: head, x: 0, y: -0.02, z: 0.42 } },
    blend: () => 0.12,
    animate,
  };
}

// ───────────────────────────── 深渊鳞兽(史诗) ─────────────────────────────

export function createAbyssDrake(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 1.55, 0);
  const neckPts = [[0, 1.9, 1.3], [0, 2.6, 1.9], [0, 3.3, 2.3]];
  const neck: number[] = [];
  neckPts.forEach((p, i) => neck.push(rig.add(`neck${i}`, i === 0 ? body : neck[i - 1], p[0], p[1], p[2])));
  const head = rig.add('head', neck[2], 0, 3.72, 2.62);
  const jaw = rig.add('jaw', head, 0, 3.56, 2.72);
  const tailPts = [[0, 1.5, -1.5], [0, 1.2, -2.5], [0, 0.95, -3.4], [0, 0.85, -4.2]];
  const tail: number[] = [];
  tailPts.forEach((p, i) => tail.push(rig.add(`tail${i}`, i === 0 ? body : tail[i - 1], p[0], p[1], p[2])));
  const legPos: [number, number, number][] = [[0.95, 1.3, 0.9], [-0.95, 1.3, 0.9], [0.9, 1.3, -1.0], [-0.9, 1.3, -1.0]];
  const legs = legPos.map(([x, y, z], i) => rig.add(`leg${i}`, body, x, y, z));
  const fins = [1, -1].map((s) => rig.add(`fin${s}`, body, s * 0.7, 2.2, 0.3));
  const b = new ModelBuilder();
  b.crease = 38;
  const SCALE_C = 0x33407c;
  const SCALE_D = 0x1e2550;
  const BELLY = 0x7f92cc;
  const GLOW = 0xa070ff;
  const GLOW_HOT = 0xe0c8ff;

  // 腿：粗壮，带三趾利爪
  legs.forEach((leg, i) => {
    const [x, y, z] = legPos[i];
    const front = i < 2;
    b.bone(leg).paint(SCALE_C, { c2: SCALE_D });
    b.tube([[x * 0.9, y + 0.2, z, 0.42, 0.5], [x * 1.08, y - 0.5, z + (front ? 0.14 : -0.1), 0.32, 0.36], [x * 1.1, 0.5, z + (front ? 0 : 0.14), 0.24, 0.26], [x * 1.1, 0.12, z + 0.1, 0.3, 0.36]], { seg: 7, up: [1, 0, 0] });
    b.paint(0xd8d2e8, { gloss: 0.7 });
    for (const dx of [-0.17, 0, 0.17]) b.g(X(x * 1.1 + dx, 0.12, z + 0.42, 78, dx * 80, 0), () => b.crystal(0.075, 0.34, 4, 0.8, 0.1));
  });
  // 躯干：背深腹浅的桶身
  b.bone(body).paint(BELLY, { c2: SCALE_C });
  b.tube([[0, 1.5, -1.6, 0.5, 0.46], [0, 1.6, -0.9, 0.95, 0.8], [0, 1.7, 0, 1.08, 0.92], [0, 1.74, 0.8, 0.95, 0.84], [0, 1.86, 1.36, 0.6, 0.56]], { seg: 10, up: [1, 0, 0] });
  // 背甲鳞片(三排重叠的甲片) 与背棘(发光紫晶)
  b.paint(SCALE_D, { c2: SCALE_C, gloss: 0.5 });
  for (let i = 0; i < 6; i++) {
    const z = -1.2 + i * 0.46;
    const w = 0.9 - Math.abs(i - 2.6) * 0.14;
    const y = 2.44 + (1 - Math.abs(i - 2.6) / 3) * 0.14;
    b.g(X(0, y, z, -16, 0, 0), () => b.extrude([[-w, -0.1], [-w * 0.6, 0.12], [w * 0.6, 0.12], [w, -0.1], [w * 0.5, -0.3], [-w * 0.5, -0.3]], 0.5, 0.06));
  }
  for (let i = 0; i < 7; i++) {
    const z = -1.4 + i * 0.44;
    const hgt = 0.5 + (1 - Math.abs(i - 3) / 3.5) * 0.75;
    b.paint(0x6a48c8, { c2: GLOW_HOT, glow: 0.18, glow2: 0.55, gloss: 1, line: 1 });
    b.g(X(0, 2.46 + (1 - Math.abs(i - 3) / 3.5) * 0.14, z, -22, 0, 0), () => b.crystal(0.13, hgt, 4, 0.7, 0.08));
  }
  // 体侧的发光纹
  b.sym(() => {
    b.paint(GLOW, { c2: GLOW_HOT, glow: 0.55 });
    for (let i = 0; i < 4; i++) b.g(X(1.02 - Math.abs(i - 1.5) * 0.06, 1.75, -0.7 + i * 0.5, 0, 90, 30), () => b.extrude([[-0.12, -0.03], [0.12, -0.03], [0.16, 0.03], [-0.08, 0.03]], 0.05, 0));
  });
  // 颈：三节
  const neckR = [0.56, 0.44, 0.36, 0.3];
  const neckAll = [[0, 1.86, 1.3], ...neckPts.slice(1), [0, 3.72, 2.62]];
  for (let i = 0; i < 3; i++) {
    const p0 = i === 0 ? [0, 1.86, 1.25] : neckAll[i];
    const p1 = neckAll[i + 1];
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    b.bone(neck[i]).paint(BELLY, { c2: SCALE_C });
    b.tube([[p0[0], p0[1], p0[2], neckR[i], neckR[i] * 0.95], [mid[0], mid[1], mid[2], (neckR[i] + neckR[i + 1]) / 2 * 1.05, (neckR[i] + neckR[i + 1]) / 2], [p1[0], p1[1], p1[2], neckR[i + 1], neckR[i + 1] * 0.95]], { seg: 8, up: [1, 0, 0] });
    b.paint(0x6a48c8, { c2: GLOW_HOT, glow: 0.18, glow2: 0.5, gloss: 1, line: 1 });
    b.g(X(mid[0], mid[1] + neckR[i] * 0.55, mid[2] - neckR[i] * 0.6, -60, 0, 0), () => b.crystal(0.09, 0.44, 4, 0.7, 0.08));
  }
  // 头：楔形的头骨 + 一对后掠的大角 + 小角 + 发光的眼
  b.bone(head).paint(SCALE_C, { c2: SCALE_D });
  b.tube([[0, 3.74, 2.5, 0.36, 0.3], [0, 3.78, 2.86, 0.4, 0.3], [0, 3.7, 3.3, 0.28, 0.2], [0, 3.62, 3.64, 0.16, 0.11]], { seg: 8, up: [1, 0, 0] });
  b.paint(SCALE_D, { c2: SCALE_C, gloss: 0.5 });
  b.g(X(0, 4.02, 2.84, 14, 0, 0), () => b.extrude([[-0.34, -0.2], [0.34, -0.2], [0.2, 0.3], [0, 0.42], [-0.2, 0.3]], 0.12, 0.04));
  b.sym(() => {
    b.paint(0xcfc8e8, { c2: 0x8a80b8, gloss: 0.6 });
    b.tube([[0.26, 3.98, 2.6, 0.13], [0.5, 4.36, 2.2, 0.1], [0.62, 4.84, 1.9, 0.06], [0.58, 5.2, 1.86, 0.01]], { seg: 6 });
    b.tube([[0.34, 3.8, 2.56, 0.08], [0.6, 3.86, 2.3, 0.05], [0.74, 4.04, 2.14, 0.008]], { seg: 5 });
    b.paint(GLOW_HOT, { glow: 0.95 });
    b.g(X(0.3, 3.9, 3.0, 0, 30, 20), () => b.extrude([[-0.1, -0.03], [0.08, -0.05], [0.11, 0.04], [-0.07, 0.03]], 0.05, 0));
    b.paint(0xf4f0ff, { gloss: 0.6 });
    for (let i = 0; i < 3; i++) b.g(X(0.2 - i * 0.04, 3.56, 3.1 + i * 0.18, 180, 0, 0), () => b.crystal(0.04, 0.16, 4, 0.9, 0.05));
  });
  // 下颌
  b.bone(jaw).paint(BELLY, { c2: SCALE_C });
  b.tube([[0, 3.52, 2.6, 0.3, 0.12], [0, 3.46, 3.1, 0.24, 0.09], [0, 3.46, 3.56, 0.12, 0.05]], { seg: 6, up: [1, 0, 0] });
  b.paint(GLOW, { glow: 0.6 });
  b.tube([[0, 3.53, 2.7, 0.2, 0.03], [0, 3.5, 3.3, 0.12, 0.03]], { seg: 4, up: [1, 0, 0] });
  // 尾：四节，末端一柄晶刃
  const tailR = [0.5, 0.36, 0.25, 0.16, 0.08];
  const tailAll = [...tailPts, [0, 0.9, -5.0]];
  for (let i = 0; i < 4; i++) {
    b.bone(tail[i]).paint(BELLY, { c2: SCALE_C });
    b.tube([[tailAll[i][0], tailAll[i][1], tailAll[i][2], tailR[i], tailR[i] * 0.9], [tailAll[i + 1][0], tailAll[i + 1][1], tailAll[i + 1][2], tailR[i + 1], tailR[i + 1] * 0.9]], { seg: 7, up: [1, 0, 0] });
    b.paint(0x6a48c8, { c2: GLOW_HOT, glow: 0.18, glow2: 0.5, gloss: 1, line: 1 });
    b.g(X(0, tailAll[i][1] + tailR[i] * 0.7, tailAll[i][2] - 0.4, -30, 0, 0), () => b.crystal(0.08, 0.4 - i * 0.05, 4, 0.7, 0.08));
  }
  b.bone(tail[3]).paint(GLOW, { c2: GLOW_HOT, glow: 0.4, glow2: 0.75, gloss: 1, line: 1 });
  b.g(X(0, 0.9, -4.95, -96, 0, 0), () => b.extrude([[0, -0.1], [0.34, 0.24], [0.2, 0.7], [0, 1.2], [-0.2, 0.7], [-0.34, 0.24]], 0.1, 0.04));
  // 退化的翼鳍：发光的紫膜
  fins.forEach((f, i) => {
    const s = i === 0 ? 1 : -1;
    b.bone(f).paint(SCALE_D);
    b.tube([[s * 0.7, 2.2, 0.3, 0.1], [s * 1.5, 3.0, -0.1, 0.06], [s * 1.9, 3.5, -0.8, 0.02]], { seg: 5 });
    b.paint(0x5a3ab8, { c2: GLOW, glow: 0.1, glow2: 0.45 });
    b.sheet(3, 2, (u, v) => {
      const top = [lerp(0.7, 1.9, u), lerp(2.2, 3.5, Math.pow(u, 0.8)), lerp(0.3, -0.8, u * u)];
      const bot = [lerp(0.7, 1.4, u), lerp(2.0, 2.3, u), lerp(-0.3, -1.5, u)];
      return [s * lerp(top[0], bot[0], v), lerp(top[1], bot[1], v), lerp(top[2], bot[2], v)];
    });
  });
  b.bakeGrounding(4.5, 0.72, 0.88);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 6;
    const br = Math.sin(t * 1.3);
    // 待机底层：呼吸、长颈缓慢游摆、尾巴甩动
    pose.pos(body, 0, br * 0.05, 0);
    pose.rot(neck[0], br * 3, Math.sin(t * 0.5) * 10, 0);
    pose.rot(neck[1], -br * 2, Math.sin(t * 0.5 + 0.8) * 10, 0);
    pose.rot(neck[2], 0, Math.sin(t * 0.5 + 1.6) * 8, 0);
    pose.rot(head, Math.sin(t * 0.9) * 5, Math.sin(t * 0.5 + 2.2) * 8, 0);
    pose.rot(jaw, 4 + br * 3, 0, 0);
    tail.forEach((tj, i) => pose.rot(tj, Math.sin(t * 1.1 - i * 0.6) * 3, Math.sin(t * 0.8 - i * 0.7) * (8 + i * 4), 0));
    fins.forEach((f, i) => pose.rot(f, 0, 0, (i === 0 ? 1 : -1) * (Math.sin(t * 1.3 + 1) * 8 - 4)));
    out.glow = 1 + 0.18 * br;
    switch (a.anim) {
      case 'dead': {
        const e = seg(a.t, 0.1, 1.3);
        const k = e * e * (3 - 2 * e);
        const late = seg(a.t, 0.5, 1.6);
        pose.pos(body, 0.2 * k, -0.85 * k, 0);
        pose.rot(body, 4 * k, 0, 12 * k);
        legs.forEach((leg, i) => pose.rot(leg, (i < 2 ? -50 : 46) * k, 0, (i % 2 === 0 ? 30 : -30) * k));
        pose.rot(neck[0], 30 * late + 16 * Math.sin(k * Math.PI), 14 * k, 0);
        pose.rot(neck[1], 34 * late, 10 * k, 0);
        pose.rot(neck[2], 22 * late, 0, 0);
        pose.rot(head, -6 * late, 0, 30 * late);
        pose.rot(jaw, 24 * k, 0, 0);
        tail.forEach((tj, i) => pose.rot(tj, 5 * k, (i % 2 ? 14 : -8) * k, 0));
        fins.forEach((f, i) => pose.rot(f, 0, 0, (i === 0 ? -1 : 1) * 46 * k));
        out.glow = Math.max(0.05, 1 - a.t / 1.6);
        break;
      }
      case 'move': {
        const s = Math.sin(a.stride * TAU);
        pose.rot(legs[0], s * 26, 0, 0);
        pose.rot(legs[3], s * 26, 0, 0);
        pose.rot(legs[1], -s * 26, 0, 0);
        pose.rot(legs[2], -s * 26, 0, 0);
        pose.move(body, 0, Math.abs(Math.cos(a.stride * TAU)) * 0.08, 0);
        pose.add(body, 0, s * 3, s * 2);
        break;
      }
      case 'attack': {
        // 噬咬：长颈后缩蓄力 → 猛地向前下方探出，张口咬合
        const p = strikeWarp(a.p, a.windup);
        const wind = seg(p, 0, 0.27);
        const hit = seg(p, 0.27, 0.36);
        const rec = seg(p, 0.55, 1);
        const back = wind * (1 - hit);
        const fwd = hit * (1 - rec);
        pose.rot(neck[0], -30 * back + 44 * fwd, 0, 0);
        pose.rot(neck[1], -26 * back + 30 * fwd, 0, 0);
        pose.rot(neck[2], 20 * back + 6 * fwd, 0, 0);
        pose.rot(head, 30 * back - 26 * fwd, 0, 0);
        pose.rot(jaw, 4 + 40 * back + 30 * hit * (1 - seg(p, 0.36, 0.42)), 0, 0);
        pose.move(body, 0, 0.1 * back - 0.16 * fwd, -0.3 * back + 0.5 * fwd);
        pose.add(body, -6 * back + 8 * fwd, 0, 0);
        pose.rot(legs[0], -16 * fwd, 0, 0);
        pose.rot(legs[1], -16 * fwd, 0, 0);
        fins.forEach((f, i) => pose.rot(f, 0, 0, (i === 0 ? 1 : -1) * (30 * back - 14 * fwd)));
        out.glow = 1 + 1.6 * back + 2 * bump(p, 0.36, 0.14);
        break;
      }
      case 'stunned': {
        pose.rot(neck[0], 20, Math.sin(t * 4) * 16, 0);
        pose.rot(head, 20, 0, Math.sin(t * 4) * 16);
        break;
      }
      default:
    }
  };
  return {
    key: 'monster:abyss_drake', geometry: b.build(), rig, height: 4.6, radius: 2.1, scale: 1.0, stride: 3.4, triangles: b.triangleCount,
    attach: { chest: { joint: body, x: 0, y: 0.3, z: 0 }, head: { joint: head, x: 0, y: 0.4, z: 0.4 }, muzzle: { joint: head, x: 0, y: -0.1, z: 1 }, weapon: { joint: head, x: 0, y: -0.1, z: 1 } },
    blend: () => 0.2,
    animate,
  };
}
