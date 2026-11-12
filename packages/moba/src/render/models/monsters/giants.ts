/**
 * 野怪(巨像类)：
 *   frost_golem   霜晶魔像 —— 蓝灰岩体，肩背生满冰晶
 *   ember_golem   炽焰魔像 —— 玄武岩体，裂缝里透出熔岩光，背生焰晶
 *   star_colossus 星陨巨灵 —— 河道史诗野怪：由金色星能维系的悬浮巨石之躯，没有腿，五米多高
 */
import { bump, seg, strikeWarp } from '../humanoid';
import { ModelBuilder, X } from '../kit';
import { type Pose, Rig } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const TAU = Math.PI * 2;
const hash = (i: number, s: number): number => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

interface GolemLook {
  key: string;
  rock: number;
  rockLight: number;
  rockDark: number;
  crystal: number;
  crystalHot: number;
  /** 晶体的形态：冰晶修长规整，焰晶短粗外张 */
  flame: boolean;
}

function createGolem(L: GolemLook): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const hips = rig.add('hips', root, 0, 1.05, 0);
  const chest = rig.add('chest', hips, 0, 1.6, 0);
  const head = rig.add('head', chest, 0, 2.45, 0.2);
  const arm = (s: number): [number, number] => {
    const a = rig.add(`arm${s}`, chest, s * 1.0, 2.25, 0);
    const f = rig.add(`fore${s}`, a, s * 1.2, 1.45, 0.1);
    return [a, f];
  };
  const [armL, foreL] = arm(1);
  const [armR, foreR] = arm(-1);
  const legL = rig.add('legL', hips, 0.45, 1.0, 0);
  const legR = rig.add('legR', hips, -0.45, 1.0, 0);
  const b = new ModelBuilder();
  b.crease = 28;

  const crystal = (x: number, y: number, z: number, rx: number, rz: number, r: number, hgt: number): void => {
    b.paint(L.crystal, { c2: L.crystalHot, glow: L.flame ? 0.16 : 0.1, glow2: L.flame ? 0.42 : 0.28, gloss: 1, line: 1 });
    b.g(X(x, y, z, rx, 0, rz), () => b.crystal(r, hgt, L.flame ? 4 : 6, L.flame ? 0.8 : 0.4, 0.1, L.flame ? 0.5 : 0.85));
  };

  // 腿：短粗的石墩
  b.sym((s) => {
    b.rough = 0.03;
    b.bone(s > 0 ? legL : legR).paint(L.rockDark, { c2: L.rock });
    b.lathe([[0, 0.34, 0.4, 0.45, 0.04], [0.3, 0.3, 0.32, 0.45, 0], [0.7, 0.27, 0.28, 0.45, 0], [1.05, 0.36, 0.34, 0.45, 0]], { seg: 6 });
    b.rough = 0;
  });
  // 躯干：下窄上宽的巨石，胸口嵌一枚发光的晶核
  b.rough = 0.04;
  b.bone(hips).paint(L.rockDark, { c2: L.rock });
  b.lathe([[0.8, 0.4, 0.34], [1.0, 0.62, 0.5], [1.3, 0.6, 0.5], [1.5, 0.52, 0.44]], { seg: 7, phase: 12 });
  b.bone(chest).paint(L.rock, { c2: L.rockLight });
  b.lathe([[1.4, 0.56, 0.48], [1.7, 0.92, 0.7], [2.2, 1.1, 0.78], [2.55, 0.92, 0.66], [2.75, 0.5, 0.42]], { seg: 7, phase: 40 });
  b.rough = 0;
  b.paint(L.crystalHot, { glow: 0.75 });
  b.g(X(0, 1.86, 0.7, 0, 0, 0, 1, 1, 0.6), () => b.crystal(0.2, 0.5, 4, 0.5, 0.5, 1));
  // 岩缝里的光(炽焰魔像更多、更亮)
  b.paint(L.crystal, { c2: L.crystalHot, glow: L.flame ? 0.6 : 0.35 });
  for (let i = 0; i < (L.flame ? 7 : 4); i++) {
    const a = hash(i, 1) * 2.4 - 1.2 + Math.PI / 2;
    const y = 1.55 + hash(i, 2) * 0.9;
    const r = 0.86 + (y - 1.5) * 0.14;
    b.g(X(Math.cos(a) * r, y, Math.sin(a) * r * 0.72 + 0.02, 0, 90 - (a * 180) / Math.PI, hash(i, 3) * 80 - 40), () => b.box(0, 0, 0, 0.05, 0.36 + hash(i, 4) * 0.2, 0.06));
  }
  // 头：缩在双肩之间的小石块，双眼发光
  b.rough = 0.02;
  b.bone(head).paint(L.rockDark, { c2: L.rock });
  b.lathe([[2.4, 0.26, 0.26, 0, 0.26], [2.6, 0.32, 0.32, 0, 0.3], [2.82, 0.26, 0.27, 0, 0.26], [2.9, 0.1, 0.1, 0, 0.22]], { seg: 6, phase: 90 });
  b.rough = 0;
  b.paint(L.crystalHot, { glow: 0.9 });
  b.sym(() => b.g(X(0.13, 2.66, 0.6, 0, 16, 12), () => b.box(0, 0, 0, 0.13, 0.05, 0.05, 0.012)));
  // 双臂：上臂短，前臂与拳头巨大，垂到膝下
  b.sym((s) => {
    b.rough = 0.035;
    b.bone(s > 0 ? armL : armR).paint(L.rock, { c2: L.rockDark });
    b.ball(1.0, 2.25, 0, 0.42, 0.4, 0.42, 1, 28);
    b.limb([1.02, 2.2, 0], [1.2, 1.5, 0.08], 0.33, 0.3, { seg: 6 });
    b.bone(s > 0 ? foreL : foreR).paint(L.rockDark, { c2: L.rockLight });
    b.ball(1.2, 1.45, 0.1, 0.32, 0.32, 0.32, 1, 28);
    b.limb([1.2, 1.45, 0.1], [1.26, 0.74, 0.2], 0.3, 0.42, { seg: 6 });
    b.box(1.27, 0.5, 0.22, 0.72, 0.62, 0.74, 0.16);
    b.rough = 0;
    b.paint(L.crystal, { c2: L.crystalHot, glow: 0.5 });
    b.g(X(1.27, 0.84, 0.22), () => b.torus(0.4, 0.04, 0.06, 8, 4, { crease: 30 }));
  });
  // 肩背上的晶簇
  b.bone(chest);
  const N = L.flame ? 9 : 8;
  for (let i = 0; i < N; i++) {
    const a = Math.PI * (1.02 + (i / (N - 1)) * 0.96);
    const r = 0.5 + hash(i, 5) * 0.4;
    const lean = L.flame ? 34 : 18;
    crystal(Math.cos(a) * r * 1.5, 2.5 + hash(i, 6) * 0.14, Math.sin(a) * r * 0.5 - 0.1, -lean * 0.6 - hash(i, 7) * 16, Math.cos(a) * -lean * 1.4, 0.14 + hash(i, 8) * 0.1, (L.flame ? 0.6 : 0.9) + hash(i, 9) * 0.6);
  }
  b.sym(() => {
    b.bone(armL);
    crystal(1.05, 2.56, 0, 0, -20, 0.17, L.flame ? 0.6 : 0.9);
    crystal(1.26, 2.46, 0.1, 14, -44, 0.12, L.flame ? 0.44 : 0.62);
    crystal(1.2, 2.48, -0.16, -20, -38, 0.12, L.flame ? 0.48 : 0.66);
  });
  // 霜晶魔像：石顶覆雪
  if (!L.flame) {
    b.bone(chest).paint(0xf2f8ff, { c2: 0xd0e4f8 });
    b.lathe([[2.56, 0.9, 0.64], [2.7, 0.62, 0.5], [2.79, 0.3, 0.26]], { seg: 7, phase: 40, cap0: false });
  }
  b.bakeGrounding(3.2, 0.7, 0.86);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 1.2 + a.seed * 6;
    const br = Math.sin(t);
    // 站姿：前倾，双拳垂在身前
    pose.rot(chest, 10 + br * 1.5, 0, 0);
    pose.rot(armL, -14, 0, 8);
    pose.rot(armR, -14, 0, -8);
    pose.rot(foreL, -16, 0, 0);
    pose.rot(foreR, -16, 0, 0);
    pose.pos(hips, 0, br * 0.02, 0);
    out.glow = 1 + 0.2 * Math.sin(t * 1.7);
    switch (a.anim) {
      case 'dead': {
        // 崩解：晶核熄灭，上身垮下，双臂脱落
        const e = seg(a.t, 0.05, 0.9);
        const k = e * e;
        pose.pos(hips, 0, -0.5 * k, -0.1 * k);
        pose.rot(hips, -10 * k, 0, 6 * k);
        pose.rot(chest, 10 + 34 * k, 0, -10 * k);
        pose.pos(chest, 0, -0.3 * k, 0.1 * k);
        pose.rot(head, 30 * k, 0, 20 * k);
        pose.rot(armL, -14 - 20 * k, 0, 8 + 50 * k);
        pose.pos(armL, 0.2 * k, -0.9 * k, 0);
        pose.rot(armR, -14 + 30 * k, 0, -8 - 60 * k);
        pose.pos(armR, -0.3 * k, -1.0 * k, 0);
        pose.rot(legL, 0, 0, 20 * k);
        pose.rot(legR, 0, 0, -16 * k);
        out.glow = Math.max(0.04, 1 - a.t * 1.3);
        break;
      }
      case 'move': {
        const s = Math.sin(a.stride * TAU);
        pose.rot(legL, s * 26, 0, 0);
        pose.rot(legR, -s * 26, 0, 0);
        pose.pos(hips, 0, Math.abs(Math.cos(a.stride * TAU)) * 0.08, 0);
        pose.rot(hips, 4, -s * 6, s * 4);
        pose.rot(chest, 12, s * 9, -s * 3);
        pose.rot(armL, -14 - s * 22, 0, 8);
        pose.rot(armR, -14 + s * 22, 0, -8);
        break;
      }
      case 'attack': {
        // 双拳举过头顶 → 砸地
        const p = strikeWarp(a.p, a.windup);
        const wind = seg(p, 0, 0.27);
        const hit = seg(p, 0.27, 0.36);
        const rec = seg(p, 0.6, 1);
        const up = wind * (1 - hit);
        const down = hit * (1 - rec);
        pose.rot(chest, 10 - 26 * up + 30 * down, 0, 0);
        pose.rot(hips, -6 * up + 10 * down, 0, 0);
        pose.pos(hips, 0, 0.06 * up - 0.2 * down, 0.2 * down);
        for (const [arm, fore, s] of [[armL, foreL, 1], [armR, foreR, -1]] as [number, number, number][]) {
          pose.rot(arm, -14 - 150 * up - 50 * down, 0, s * (8 + 10 * up));
          pose.rot(fore, -16 - 30 * up + 10 * down, 0, 0);
        }
        pose.rot(head, -20 * up + 16 * down, 0, 0);
        pose.rot(legL, -14 * down, 0, 0);
        pose.rot(legR, -14 * down, 0, 0);
        out.glow = 1 + 1.4 * up + 1.8 * bump(p, 0.36, 0.14);
        break;
      }
      case 'stunned': {
        pose.rot(chest, 16 + Math.sin(t * 4) * 5, 0, Math.cos(t * 4) * 7);
        pose.rot(head, 14, Math.sin(t * 4) * 20, 0);
        break;
      }
      case 'airborne': {
        pose.rot(root, -14 * Math.sin(a.p * Math.PI), 0, 0);
        pose.rot(armL, -60, 0, 50);
        pose.rot(armR, -60, 0, -50);
        break;
      }
      default: {
        pose.rot(head, Math.sin(t * 0.7) * 4, Math.sin(t * 0.4) * 14, 0);
        pose.add(armL, br * 2, 0, 0);
        pose.add(armR, -br * 2, 0, 0);
      }
    }
  };
  return {
    key: L.key, geometry: b.build(), rig, height: 3.25, radius: 1.35, scale: 0.94, stride: 2.6, triangles: b.triangleCount,
    attach: { chest: { joint: chest, x: 0, y: 0.5, z: 0.3 }, head: { joint: head, x: 0, y: 0.3, z: 0.2 }, weapon: { joint: foreR, x: -0.06, y: -0.9, z: 0.2 }, muzzle: { joint: chest, x: 0, y: 0.3, z: 0.8 } },
    blend: () => 0.18,
    animate,
  };
}

export const createFrostGolem = (): ModelDef => createGolem({ key: 'monster:frost_golem', rock: 0x7f95b0, rockLight: 0xb4c8dc, rockDark: 0x556a88, crystal: 0x58c0ff, crystalHot: 0xd8f4ff, flame: false });
export const createEmberGolem = (): ModelDef => createGolem({ key: 'monster:ember_golem', rock: 0x5c4a48, rockLight: 0x86706a, rockDark: 0x362a2c, crystal: 0xff6a24, crystalHot: 0xffd27a, flame: true });

// ───────────────────────────── 星陨巨灵(史诗) ─────────────────────────────

export function createStarColossus(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const torso = rig.add('torso', root, 0, 3.1, 0);
  const core = rig.add('core', torso, 0, 3.2, 0.1);
  const head = rig.add('head', torso, 0, 4.5, 0.2);
  const halo = rig.add('halo', head, 0, 4.9, -0.3);
  const shoulders = [1, -1].map((s) => rig.add(`shoulder${s}`, torso, s * 1.7, 4.0, 0));
  const fists = [1, -1].map((s) => rig.add(`fist${s}`, root, s * 2.2, 2.0, 0.7));
  const shardY = [2.1, 1.55, 1.05, 0.6];
  const shards = shardY.map((y, i) => rig.add(`shard${i}`, root, 0, y, 0));
  const b = new ModelBuilder();
  b.crease = 28;
  // 靛青的星铸岩：既与地图上暖灰的山石区分开，金色星能在上面也更醒目
  const ROCK = 0x565c88;
  const ROCK_L = 0x858cb6;
  const ROCK_D = 0x363a62;
  const GOLD = 0xffcf60;
  const HOT = 0xfff0b8;

  const rune = (x: number, y: number, z: number, ry: number, rz: number, w: number, h: number): void => {
    b.paint(GOLD, { c2: HOT, glow: 0.5 });
    b.g(X(x, y, z, 0, ry, rz), () => b.box(0, 0, 0, w, h, 0.06));
  };

  // 躯干：一圈裂开的巨岩，中间露出星核
  b.rough = 0.05;
  b.bone(torso);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.5 + 0.4 * (i - 2));
    const back = i === 0 || i === 4;
    b.paint(i % 2 ? ROCK : ROCK_D, { c2: ROCK_L });
    b.g(X(Math.cos(a) * 0.9, 3.1, Math.sin(a) * 0.7 - (back ? 0.5 : 0), 0, 90 - (a * 180) / Math.PI, (i - 2) * 6), () =>
      b.lathe([[-1.0, 0.3, 0.26], [-0.5, 0.62, 0.42], [0.4, 0.78, 0.5], [0.95, 0.6, 0.42], [1.25, 0.22, 0.2]], { seg: 6, phase: 30 }));
  }
  b.paint(ROCK_D, { c2: ROCK });
  b.g(X(0, 3.3, -0.75), () => b.lathe([[-1.1, 0.5, 0.36], [0, 1.25, 0.56], [1.0, 1.4, 0.6], [1.4, 0.8, 0.44]], { seg: 7 }));
  b.rough = 0;
  rune(-0.86, 3.5, 0.62, -30, 14, 0.07, 0.7);
  rune(0.86, 3.5, 0.62, 30, -14, 0.07, 0.7);
  rune(-0.6, 2.5, 0.52, -24, -20, 0.06, 0.44);
  rune(0.6, 2.5, 0.52, 24, 20, 0.06, 0.44);
  // 星核：多面金晶 + 外圈星芒
  b.bone(core).paint(GOLD, { c2: HOT, glow: 0.35, glow2: 0.6, gloss: 1, line: 1 });
  b.g(X(0, 2.62, 0.1), () => b.crystal(0.5, 1.16, 6, 0.5, 0.5, 1));
  b.paint(HOT, { glow: 0.9 });
  for (let k = 0; k < 4; k++) b.g(X(0, 3.2, 0.1, 0, 0, k * 90 + 45), () => b.g(X(0, 0.36, 0), () => b.crystal(0.11, 0.56, 4, 0.85, 0.05)));
  // 头：棱角分明的石面具，金色眼缝；脑后一圈晶冠 + 悬浮的光环
  b.rough = 0.03;
  b.bone(head).paint(ROCK, { c2: ROCK_L });
  b.lathe([[4.3, 0.2, 0.24, 0, 0.26], [4.5, 0.42, 0.4, 0, 0.24], [4.9, 0.5, 0.44, 0, 0.2], [5.2, 0.36, 0.34, 0, 0.14], [5.34, 0.1, 0.1, 0, 0.1]], { seg: 6, phase: 90 });
  b.rough = 0;
  b.paint(ROCK_D, { c2: ROCK });
  b.g(X(0, 4.98, 0.6, 14, 0, 0), () => b.box(0, 0, 0, 0.84, 0.16, 0.26, 0.05));
  b.paint(HOT, { glow: 0.95 });
  b.sym(() => b.g(X(0.2, 4.84, 0.63, 0, 14, 10), () => b.box(0, 0, 0, 0.22, 0.07, 0.06, 0.015)));
  b.paint(GOLD, { c2: HOT, glow: 0.45 });
  b.g(X(0, 4.58, 0.6), () => b.extrude([[-0.03, 0.14], [0.03, 0.14], [0.05, 0], [0, -0.16], [-0.05, 0]], 0.06, 0));
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.18 + 0.16 * i);
    b.paint(GOLD, { c2: HOT, glow: 0.16, glow2: 0.4, gloss: 1, line: 1 });
    b.g(X(Math.cos(a) * 0.5, 5.0 + Math.sin(a) * 0.26, -0.12, -24, 0, 90 - (a * 180) / Math.PI), () => b.crystal(0.1, 0.7 + (i === 2 ? 0.4 : 0.1 * (i % 2)), 4, 0.8, 0.08));
  }
  b.bone(halo).paint(GOLD, { gloss: 1, glow: 0.4 });
  b.g(X(0, 4.9, -0.3, 76, 0, 0), () => {
    b.torus(1.05, 0.07, 0.035, 24, 4, { crease: 30 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      b.g(X(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05, 0, -(a * 180) / Math.PI, 0), () => b.g(X(0.12, 0, 0, 0, 0, -90), () => b.crystal(0.06, k % 2 ? 0.26 : 0.44, 4, 0.8, 0.1)));
    }
  });
  // 悬浮的肩石
  shoulders.forEach((sh, i) => {
    const s = i === 0 ? 1 : -1;
    b.rough = 0.05;
    b.bone(sh).paint(ROCK_D, { c2: ROCK_L });
    b.g(X(s * 1.7, 4.0, 0, 0, 0, s * -14), () => b.lathe([[-0.5, 0.3, 0.3], [-0.2, 0.7, 0.62], [0.2, 0.74, 0.66], [0.5, 0.4, 0.4]], { seg: 6, phase: 20 }));
    b.rough = 0;
    b.paint(GOLD, { c2: HOT, glow: 0.16, glow2: 0.4, gloss: 1, line: 1 });
    b.g(X(s * 1.74, 4.4, 0, 0, 0, s * -12), () => b.crystal(0.17, 0.9, 5, 0.6, 0.1));
    b.g(X(s * 2.04, 4.3, 0.1, 10, 0, s * -36), () => b.crystal(0.12, 0.6, 5, 0.6, 0.1));
    rune(s * 1.72, 3.96, 0.64, 0, 0, 0.5, 0.07);
  });
  // 悬浮的巨拳：前臂石柱 + 石拳 + 金色指箍
  fists.forEach((f, i) => {
    const s = i === 0 ? 1 : -1;
    b.rough = 0.05;
    b.bone(f).paint(ROCK, { c2: ROCK_D });
    b.g(X(s * 2.2, 2.0, 0.7), () => {
      b.lathe([[0.1, 0.5, 0.48], [0.6, 0.42, 0.42], [1.1, 0.34, 0.36], [1.3, 0.16, 0.18]], { seg: 6, phase: 15 });
      b.paint(ROCK_D, { c2: ROCK_L });
      b.box(0, -0.2, 0.06, 0.98, 0.84, 1.04, 0.22);
    });
    b.rough = 0;
    b.paint(GOLD, { gloss: 1, glow: 0.3 });
    b.g(X(s * 2.2, 2.12, 0.7), () => b.torus(0.52, 0.06, 0.08, 8, 4, { crease: 30 }));
    b.paint(GOLD, { c2: HOT, glow: 0.5 });
    for (const dx of [-0.3, 0, 0.3]) b.g(X(s * 2.2 + dx, 1.66, 1.24, 0, 0, 0), () => b.box(0, 0, 0, 0.16, 0.16, 0.06, 0.03));
  });
  // 下半身：一串越来越小的悬浮碎岩，收成一个尖
  shards.forEach((sh, i) => {
    const r = 0.74 - i * 0.16;
    b.rough = 0.05;
    b.bone(sh).paint(i % 2 ? ROCK : ROCK_D, { c2: ROCK_L });
    b.g(X(0, shardY[i], 0, hash(i, 1) * 16 - 8, i * 50, hash(i, 2) * 16 - 8), () => b.lathe([[-0.34, r * 0.3, r * 0.3], [-0.06, r, r * 0.9], [0.16, r * 0.92, r * 0.84], [0.3, r * 0.4, r * 0.4]], { seg: 6 }));
    b.rough = 0;
    b.paint(GOLD, { c2: HOT, glow: 0.5 });
    b.g(X(0, shardY[i] + 0.02, 0, 0, i * 50, 0), () => b.torus(r * 0.98, 0.03, 0.05, 6, 4, { crease: 30 }));
  });
  b.bakeGrounding(5.4, 0.72, 0.9);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 0.9 + a.seed * 6;
    const bob = Math.sin(t * 1.2);
    // 所有部件各自带相位地漂浮
    pose.pos(torso, 0, bob * 0.14, 0);
    pose.rot(torso, 4 + bob * 1.2, Math.sin(t * 0.4) * 5, 0);
    pose.rot(core, 0, t * 50, 0);
    pose.scale(core, 1 + 0.06 * Math.sin(t * 3));
    pose.rot(head, Math.sin(t * 0.8) * 3, Math.sin(t * 0.35) * 10, 0);
    pose.pos(head, 0, Math.sin(t * 1.2 + 0.6) * 0.06, 0);
    pose.rot(halo, 0, 0, t * 28);
    shoulders.forEach((sh, i) => {
      pose.pos(sh, 0, Math.sin(t * 1.2 + 1 + i * 1.4) * 0.1, 0);
      pose.rot(sh, 0, 0, Math.sin(t * 0.9 + i * 2) * 4);
    });
    fists.forEach((f, i) => {
      const s = i === 0 ? 1 : -1;
      pose.pos(f, s * Math.sin(t * 0.8 + i) * 0.08, Math.sin(t * 1.2 + 2 + i * 1.7) * 0.16, Math.cos(t * 0.7 + i) * 0.08);
      pose.rot(f, -10 + Math.sin(t + i) * 4, s * -8, s * Math.sin(t * 0.9 + i * 2) * 4);
    });
    shards.forEach((sh, i) => {
      pose.pos(sh, Math.sin(t * 0.9 + i * 1.3) * 0.06, Math.sin(t * 1.2 - i * 0.7) * 0.1, Math.cos(t * 0.8 + i * 1.1) * 0.06);
      pose.rot(sh, 0, t * (14 + i * 9) * (i % 2 ? -1 : 1), 0);
    });
    out.glow = 1 + 0.2 * Math.sin(t * 2);
    switch (a.anim) {
      case 'dead': {
        // 星能熄灭：星核闪一下后缩灭，各块岩石依次坠地
        const d = a.t;
        const flare = bump(d, 0.25, 0.25);
        pose.scale(core, (1 + flare * 0.8) * (1 - seg(d, 0.4, 0.8)));
        const drop = (j: number, bindY: number, delay: number, sx: number, rz: number): void => {
          const e = seg(d, delay, delay + 0.7);
          const k = e * e;
          pose.move(j, sx * k, -(bindY - 0.4) * k, 0);
          pose.add(j, 30 * k, 0, rz * k);
        };
        drop(torso, 3.1 - 1.2, 0.5, 0, 14);
        drop(head, 0.9, 0.7, 0.6, 50);
        pose.scale(halo, 1 - seg(d, 0.3, 0.9));
        shoulders.forEach((sh, i) => drop(sh, 1.3, 0.45 + i * 0.2, (i === 0 ? 1 : -1) * 0.8, (i === 0 ? -1 : 1) * 60));
        fists.forEach((f, i) => drop(f, 2.0 - 0.1, 0.2 + i * 0.25, (i === 0 ? 1 : -1) * 0.3, (i === 0 ? -1 : 1) * 30));
        shards.forEach((sh, i) => drop(sh, shardY[i] + 0.1, 0.3 + i * 0.12, (hash(i, 5) - 0.5) * 1.6, hash(i, 6) * 80 - 40));
        out.glow = Math.max(0.03, (1 + 3 * flare) * (1 - seg(d, 0.35, 0.9)));
        break;
      }
      case 'move': {
        pose.add(torso, 10, 0, 0);
        fists.forEach((f) => pose.move(f, 0, 0, -0.4));
        shards.forEach((sh, i) => pose.move(sh, 0, 0, -0.14 * (i + 1)));
        break;
      }
      case 'attack': {
        // 双拳高举 → 轰然砸落
        const p = strikeWarp(a.p, a.windup);
        const wind = seg(p, 0, 0.27);
        const hit = seg(p, 0.27, 0.36);
        const rec = seg(p, 0.6, 1);
        const up = wind * (1 - hit);
        const down = hit * (1 - rec);
        pose.add(torso, -14 * up + 20 * down, 0, 0);
        pose.move(torso, 0, 0.2 * up - 0.3 * down, 0.3 * down);
        fists.forEach((f, i) => {
          const s = i === 0 ? 1 : -1;
          pose.move(f, -s * 0.5 * (up + down), 2.6 * up - 1.4 * down, -0.4 * up + 1.3 * down);
          pose.add(f, -100 * up + 30 * down, 0, 0);
        });
        pose.add(head, -16 * up + 14 * down, 0, 0);
        pose.scale(core, 1 + 0.5 * up);
        out.glow = 1 + 1.6 * up + 2.2 * bump(p, 0.36, 0.14);
        break;
      }
      case 'stunned': {
        pose.add(torso, 10, 0, Math.sin(t * 5) * 6);
        pose.add(head, 16, Math.sin(t * 5) * 20, 0);
        break;
      }
      default:
    }
  };
  return {
    key: 'monster:star_colossus', geometry: b.build(), rig, height: 5.6, radius: 2.5, scale: 1.08, stride: 3, triangles: b.triangleCount,
    attach: { chest: { joint: core, x: 0, y: 0, z: 0.3 }, core: { joint: core, x: 0, y: 0, z: 0 }, head: { joint: head, x: 0, y: 0.6, z: 0.2 }, weapon: { joint: fists[1], x: 0, y: -0.4, z: 0.4 }, muzzle: { joint: core, x: 0, y: 0, z: 0.5 } },
    blend: () => 0.22,
    animate,
  };
}
