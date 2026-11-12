/**
 * 建筑：防御塔(三档 × 两队)、塔的废墟、基地水晶。
 * 蓝方：白石 + 湛蓝水晶 + 金饰，线条挺拔；红方：玄武黑岩 + 绯红水晶 + 余烬金，多尖刺。
 * 塔 = 阶梯基座 + 收分的石柱(嵌发光晶槽) + 托举核心的爪冠 + 悬浮的核心/符环/碎晶；
 * 攻击时核心蓄光膨胀，生命越低掉落的石块越多、光越不稳，被毁时上半截折断倒下并沉入废墟。
 */
import { PALETTE } from '../materials';
import { bump, seg } from './humanoid';
import { ModelBuilder, X, lerp, mixCol, shade } from './kit';
import { trim } from './parts';
import { type Pose, Rig } from './rig';
import type { AnimInput, AnimOutput, ModelDef } from './types';

interface Look {
  stone: number;
  stoneDark: number;
  stoneLight: number;
  trim: number;
  crystal: number;
  crystalHot: number;
  /** 红方的造型更尖锐 */
  spiky: boolean;
}

const LOOKS: [Look, Look] = [
  { stone: PALETTE.blue.stone, stoneDark: PALETTE.blue.stoneDark, stoneLight: 0xf2f5fb, trim: PALETTE.blue.trim, crystal: 0x2f9cff, crystalHot: 0xa8dcff, spiky: false },
  { stone: 0x5e5059, stoneDark: 0x352b33, stoneLight: 0x7c6c76, trim: PALETTE.red.trim, crystal: 0xff4a30, crystalHot: 0xffb08a, spiky: true },
];

const hash = (i: number, s: number): number => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 八角阶梯基座(塔与废墟共用) */
function plinth(b: ModelBuilder, L: Look, r: number): void {
  b.paint(L.stoneDark, { c2: L.stone });
  b.lathe([[0, r * 1.05], [0.28, r * 1.05], [0.3, r * 0.92], [0.62, r * 0.92], [0.64, r * 0.78], [0.95, r * 0.74]], { seg: 8, phase: 22.5, crease: 30 });
  b.paint(L.trim, { gloss: 1 });
  b.lathe([[0.26, r * 1.07], [0.32, r * 1.07], [0.325, r * 0.95]], { seg: 8, phase: 22.5, crease: 30, cap0: false, cap1: false });
  b.lathe([[0.6, r * 0.94], [0.66, r * 0.94], [0.665, r * 0.8]], { seg: 8, phase: 22.5, crease: 30, cap0: false, cap1: false });
}

function createTower(tier: 1 | 2 | 3, team: 0 | 1): ModelDef {
  const L = LOOKS[team];
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const H = 4.0 + tier * 0.45;
  const coreY = H + 1.35;
  const lower = rig.add('lower', root, 0, 0.95, 0);
  const upper = rig.add('upper', lower, 0, 2.5, 0);
  const core = rig.add('core', root, 0, coreY, 0);
  const ringCount = tier;
  const rings = Array.from({ length: ringCount }, (_, i) => rig.add(`ring${i}`, root, 0, coreY - 0.15 + i * 0.2, 0));
  const orbit = rig.add('orbit', root, 0, coreY + 1.3, 0);
  const tip = rig.add('tip', root, 0, coreY + 1.55, 0);
  const chunks = [0, 1, 2, 3].map((i) => rig.add(`chunk${i}`, i < 2 ? lower : upper, 0, i < 2 ? 1.7 : 3.2, 0));
  const b = new ModelBuilder();
  b.crease = 30;

  b.bone(root);
  plinth(b, L, 1.55);
  // 二/三档：基座四角的护晶
  if (tier >= 2) {
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.3, glow2: 0.55, gloss: 1, line: 1 });
      b.g(X(Math.cos(a) * 1.3, 0.55, Math.sin(a) * 1.3, 0, 0, 0), () => b.g(X(0, 0, 0, Math.sin(a) * 14, 0, -Math.cos(a) * 14), () => b.crystal(0.2, 0.9 + (tier - 2) * 0.3, 5, 0.5, 0.1)));
    }
  }
  // 石柱下半段
  const colR = (y: number): number => lerp(0.98, 0.62, (y - 0.95) / (H - 0.95));
  b.bone(lower).paint(L.stoneDark, { c2: L.stone });
  b.lathe([[0.95, colR(0.95)], [1.15, colR(1.15) * 1.08], [1.3, colR(1.3)], [2.5, colR(2.5)]], { seg: 8, phase: 22.5 });
  b.paint(L.trim, { gloss: 1 });
  b.lathe([[1.12, colR(1.15) * 1.11], [1.2, colR(1.15) * 1.11]], { seg: 8, phase: 22.5, cap0: true, cap1: true });
  // 石柱上半段 + 爪冠
  b.bone(upper).paint(L.stone, { c2: L.stoneLight });
  b.lathe([[2.5, colR(2.5)], [H - 0.3, colR(H - 0.3)], [H - 0.1, colR(H) * 1.5], [H + 0.12, colR(H) * 1.62], [H + 0.2, colR(H) * 1.2]], { seg: 8, phase: 22.5 });
  b.paint(L.trim, { gloss: 1 });
  b.lathe([[H - 0.12, colR(H) * 1.56], [H + 0.14, colR(H) * 1.68], [H + 0.16, colR(H) * 1.5]], { seg: 8, phase: 22.5, cap0: false, cap1: false });
  b.lathe([[2.44, colR(2.5) * 1.08], [2.56, colR(2.5) * 1.08]], { seg: 8, phase: 22.5 });
  // 柱身四面的发光晶槽(上下两段各一条)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    for (const [bone, y0, y1] of [[lower, 1.4, 2.36], [upper, 2.7, H - 0.5]] as [number, number, number][]) {
      b.bone(bone).paint(L.crystal, { c2: L.crystalHot, glow: 0.5, glow2: 0.8 });
      const ym = (y0 + y1) / 2;
      b.g(X(Math.cos(a) * (colR(ym) * 0.925 + 0.02), ym, Math.sin(a) * (colR(ym) * 0.925 + 0.02), 0, 90 - (a * 180) / Math.PI, 0), () =>
        b.g(X(0, 0, 0, -((0.36 / (H - 0.95)) * 180) / Math.PI, 0, 0), () => b.extrude([[-0.07, -(y1 - y0) / 2], [0.07, -(y1 - y0) / 2], [0.1, 0], [0.07, (y1 - y0) / 2], [-0.07, (y1 - y0) / 2], [-0.1, 0]], 0.06, 0.02)));
    }
  }
  // 会随受损脱落的外挂石板
  chunks.forEach((c, i) => {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const y = i < 2 ? 1.75 + i * 0.3 : 3.0 + (i - 2) * 0.45;
    b.bone(c).paint(L.stone, { c2: L.stoneLight });
    b.g(X(Math.cos(a) * colR(y) * 1.0, y, Math.sin(a) * colR(y) * 1.0, 0, 90 - (a * 180) / Math.PI, 0), () => b.box(0, 0, 0, 0.5, 0.62, 0.16, 0.05));
  });
  // 爪冠：四支向上环抱核心的石爪(红方更尖、带倒刺)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    b.bone(upper);
    b.g(X(0, H + 0.1, 0, 0, -(a * 180) / Math.PI + 90, 0), () => {
      b.paint(L.stone, { c2: L.stoneLight });
      const out = L.spiky ? 1.25 : 1.12;
      b.tube([[0, 0, 0.72, 0.2, 0.16], [0, 0.6, out, 0.19, 0.14], [0, 1.3, out + 0.08, 0.15, 0.11], [0, 1.95, out - 0.22, 0.09, 0.07], [0, 2.3, out - 0.55, 0.01, 0.01]], { seg: 5, up: [1, 0, 0] });
      b.paint(L.trim, { gloss: 1 });
      b.g(X(0, 0.62, out + 0.02, 12, 0, 0), () => b.box(0, 0, 0, 0.44, 0.12, 0.34, 0.03));
      if (L.spiky) {
        b.paint(L.stoneDark, { c2: L.stone });
        b.g(X(0, 1.0, out + 0.18, 70, 0, 0), () => b.crystal(0.09, 0.5, 4, 0.8, 0.1));
      }
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.45, gloss: 1, line: 1 });
      b.g(X(0, 1.25, out + 0.2, 60, 0, 0), () => b.crystal(0.07, 0.24, 4, 0.6, 0.3));
    });
  }
  // 核心：悬浮的大晶体 + 更亮的内核
  b.bone(core).paint(L.crystal, { c2: L.crystalHot, glow: 0.42, glow2: 0.7, gloss: 1, line: 1 });
  const cr = 0.5 + tier * 0.05;
  b.g(X(0, coreY - 0.85, 0), () => b.crystal(cr, 1.7, 6, 0.5, 0.5, 1));
  b.paint(L.crystalHot, { glow: 0.9 });
  b.g(X(0, coreY - 0.45, 0), () => b.crystal(cr * 0.45, 0.9, 4, 0.5, 0.5, 1));
  // 符环：扁金环 + 发光晶钉
  rings.forEach((r, i) => {
    const R = 1.05 + i * 0.28;
    b.bone(r).paint(L.trim, { gloss: 1 });
    b.g(X(0, coreY - 0.15 + i * 0.2, 0), () => {
      b.torus(R, 0.09, 0.035, 20, 4, { crease: 30 });
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.7 });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + i * 0.6;
        b.g(X(Math.cos(a) * R, 0, Math.sin(a) * R, 0, -(a * 180) / Math.PI, 0), () => b.box(0, 0, 0, 0.12, 0.09, 0.22, 0.03));
      }
    });
  });
  // 冠顶：一圈绕转的碎晶 + 尖顶
  b.bone(orbit).paint(L.crystal, { c2: L.crystalHot, glow: 0.5, gloss: 1, line: 1 });
  const shardN = 3 + tier;
  for (let k = 0; k < shardN; k++) {
    const a = (k / shardN) * Math.PI * 2;
    b.g(X(Math.cos(a) * 0.62, coreY + 1.3 + (k % 2) * 0.16, Math.sin(a) * 0.62, 0, 0, 0), () => b.g(X(0, -0.14, 0, hash(k, 1) * 20 - 10, 0, hash(k, 2) * 20 - 10), () => b.crystal(0.09, 0.3 + hash(k, 3) * 0.14, 4, 0.5, 0.4)));
  }
  b.bone(tip).paint(L.crystal, { c2: L.crystalHot, glow: 0.5, glow2: 0.85, gloss: 1, line: 1 });
  b.g(X(0, coreY + 1.2, 0), () => b.crystal(0.16, 1.0 + tier * 0.25, 4, 0.75, 0.15));
  if (tier === 3) {
    // 高地塔：柱身两侧的翼形石鳍
    b.bone(upper).paint(L.stone, { c2: L.stoneLight });
    b.sym(() => b.g(X(0.6, 3.1, 0, 0, 0, 0), () => b.extrude([[0, -0.7], [0.5, -0.1], [0.75, 0.9], [0.3, 0.5], [0, 0.7]], 0.14, 0.04)));
    b.paint(L.trim, { gloss: 1 });
    b.sym(() => b.g(X(0.86, 3.24, 0), () => b.box(0, 0, 0, 0.08, 0.5, 0.18, 0.02)));
  }
  b.bakeGrounding(8, 0.75, 0.9);
  const height = coreY + 2.2 + tier * 0.25;

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 10;
    // 受损：石板逐块脱落，碎晶减少，光变弱
    const dmg = 1 - a.hp;
    chunks.forEach((c, i) => {
      const gone = seg(dmg, 0.2 + i * 0.16, 0.26 + i * 0.16);
      if (gone > 0) {
        pose.scale(c, 1 - gone);
        pose.pos(c, 0, -gone * 1.2, 0);
      }
    });
    const weak = seg(dmg, 0.45, 0.85);
    let charge = 0;
    let spin = 1;
    if (a.anim === 'attack') {
      // 蓄光 → 出手瞬间释放
      const w = a.windup;
      charge = a.p < w ? a.p / w : Math.max(0, 1 - (a.p - w) / 0.25);
      spin = 1 + 3 * charge;
      if (a.p >= w) out.glow = 1 + 2.5 * charge;
      else out.glow = 1 + 1.6 * charge * charge;
    } else out.glow = 1 + 0.12 * Math.sin(t * 2);
    out.glow *= 1 - weak * (0.35 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3));
    pose.pos(core, 0, Math.sin(t * 1.3) * 0.12 - weak * 0.25, 0);
    pose.rot(core, 0, t * 26 * spin, weak * 8 * Math.sin(t * 3));
    pose.scale(core, 1 + 0.25 * charge + 0.03 * Math.sin(t * 2.6));
    rings.forEach((r, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      pose.rot(r, 16 + i * 14 + weak * 14 * Math.sin(t * 2 + i), dir * t * (34 + i * 12) * spin, 10 - i * 16 + weak * 10 * Math.cos(t * 1.7 + i));
      pose.pos(r, 0, Math.sin(t * 1.1 + i * 2) * 0.08, 0);
      pose.scale(r, 1 + 0.08 * charge);
    });
    pose.rot(orbit, 0, -t * 40, 0);
    pose.pos(orbit, 0, Math.sin(t * 0.9) * 0.1, 0);
    pose.scale(orbit, 1 - weak * 0.4);
    pose.pos(tip, 0, Math.sin(t * 1.3 + 1) * 0.14, 0);
    pose.rot(tip, 0, t * 50, 0);

    if (a.deathT >= 0) {
      // 被毁：核心内爆 → 上半截折断倒向一侧 → 整体沉入废墟
      const d = a.deathT;
      const implode = seg(d, 0, 0.35);
      const fall = seg(d, 0.2, 1.3);
      const sink = seg(d, 0.9, 2.2);
      const side = a.seed > 0.5 ? 1 : -1;
      pose.scale(core, (1 + implode * 0.5) * (1 - seg(d, 0.25, 0.45)));
      rings.forEach((r, i) => {
        const fly = seg(d, 0.1, 0.9);
        pose.scale(r, (1 + fly * 0.8) * (1 - seg(d, 0.6, 1.0)));
        pose.pos(r, side * fly * (0.5 + i * 0.4), -fly * fly * 3.5, fly * (i - 0.5) * 0.8);
        pose.rot(r, 16 + fly * 120, 0, 10 + fly * 80 * side);
      });
      pose.scale(orbit, 1 - seg(d, 0.1, 0.5));
      pose.pos(tip, side * fall * 2, -fall * fall * (coreY + 1), 0);
      pose.rot(tip, 0, 0, -side * fall * 140);
      pose.scale(tip, 1 - seg(d, 1.0, 1.5));
      const e = fall * fall;
      pose.rot(upper, 0, 0, -side * e * 84);
      pose.pos(upper, side * e * 0.3, -e * 0.9 - sink * 1.2, 0);
      pose.scale(upper, 1 - sink);
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
    attach: { core: { joint: core, x: 0, y: 0, z: 0 }, muzzle: { joint: core, x: 0, y: 0, z: 0 }, chest: { joint: root, x: 0, y: 2.6, z: 0 }, head: { joint: tip, x: 0, y: 1, z: 0 } },
    blend: () => 0,
    animate,
  };
}

function createRuin(team: 0 | 1): ModelDef {
  const L = LOOKS[team];
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const stump = rig.add('stump', root, 0, 0.9, 0);
  const b = new ModelBuilder();
  b.crease = 28;
  b.rough = 0.03;
  b.bone(root);
  plinth(b, L, 1.55);
  // 断柱：参差的断口
  b.bone(stump).paint(L.stoneDark, { c2: L.stone });
  b.lathe([[0.9, 0.98], [1.5, 0.9], [1.9, 0.86]], { seg: 8, phase: 22.5, cap1: false, shape: (a, k) => (k === 2 ? 0.75 + 0.3 * hash(Math.round(a * 3), 5) : 1) });
  b.lathe([[1.46, 0.02], [1.5, 0.84]], { seg: 8, phase: 22.5, cap0: false, cap1: false });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.3;
    b.g(X(Math.cos(a) * 0.55, 1.5, Math.sin(a) * 0.55, hash(i, 1) * 30 - 15, i * 80, hash(i, 2) * 30 - 15), () => b.crystal(0.22, 0.7 + hash(i, 3) * 0.6, 4, 0.5, 0.05));
  }
  // 散落的石块与黯淡的碎晶
  b.bone(root);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4 + 0.5;
    const r = 1.1 + hash(i, 7) * 1.5;
    const s = 0.22 + hash(i, 8) * 0.4;
    b.paint(i % 3 === 0 ? L.stoneLight : L.stone, { c2: L.stoneDark });
    b.g(X(Math.cos(a) * r, s * 0.35 + (r < 1.7 ? 0.6 : 0), Math.sin(a) * r, hash(i, 9) * 60, hash(i, 10) * 180, hash(i, 11) * 60), () => b.box(0, 0, 0, s * 1.4, s, s * 1.1, s * 0.2));
  }
  b.rough = 0;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 1.1;
    const r = 0.9 + hash(i, 13) * 1.3;
    b.paint(shade(L.crystal, 0.55), { c2: L.crystal, glow: 0.12, gloss: 1, line: 1 });
    b.g(X(Math.cos(a) * r, 0.1 + (r < 1.7 ? 0.62 : 0), Math.sin(a) * r, 60 + hash(i, 14) * 40, i * 77, hash(i, 15) * 60), () => b.crystal(0.14, 0.5 + hash(i, 16) * 0.5, 5, 0.5, 0.2));
  }
  b.bakeGrounding(2.4, 0.7, 0.85);
  return {
    key: `ruin:${team}`,
    geometry: b.build(),
    rig,
    height: 2.2,
    radius: 2.4,
    scale: 1,
    stride: 1,
    triangles: b.triangleCount,
    attach: {},
    blend: () => 0,
    animate(pose, a, out) {
      // 废墟随坍塌从地里升起
      const g = a.p;
      pose.scale(root, 0.3 + 0.7 * g);
      pose.pos(root, 0, -0.5 * (1 - g), 0);
      pose.scale(stump, 0.4 + 0.6 * g * g);
      out.glow = 0.7 + 0.3 * Math.sin(a.time * 1.3 + a.seed * 6);
    },
  };
}

function createCore(team: 0 | 1): ModelDef {
  const L = LOOKS[team];
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const coreY = 3.7;
  const star = rig.add('star', root, 0, coreY, 0);
  const inner = rig.add('inner', star, 0, coreY, 0);
  const ringA = rig.add('ringA', root, 0, coreY, 0);
  const ringB = rig.add('ringB', root, 0, coreY, 0);
  const orbit = rig.add('orbit', root, 0, coreY, 0);
  const pylons = [0, 1, 2, 3].map((i) => rig.add(`pylon${i}`, root, Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 2.2, 0.9, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 2.2));
  const b = new ModelBuilder();
  b.crease = 30;

  // 三层八角基台
  b.bone(root).paint(L.stoneDark, { c2: L.stone });
  b.lathe([[0, 2.75], [0.3, 2.75], [0.32, 2.4], [0.62, 2.4], [0.64, 2.0], [0.94, 1.92]], { seg: 8, phase: 22.5 });
  b.paint(L.trim, { gloss: 1 });
  b.lathe([[0.27, 2.78], [0.34, 2.78], [0.345, 2.45]], { seg: 8, phase: 22.5, cap0: false, cap1: false });
  b.lathe([[0.59, 2.43], [0.66, 2.43], [0.665, 2.05]], { seg: 8, phase: 22.5, cap0: false, cap1: false });
  // 台面中央的聚能井(发光)
  b.paint(L.crystal, { c2: L.crystalHot, glow: 0.5 });
  b.lathe([[0.95, 1.0], [0.97, 0.94], [1.02, 0.5], [1.03, 0.02]], { seg: 8, phase: 22.5, cap0: false });
  b.paint(L.trim, { gloss: 1 });
  b.g(X(0, 0.97, 0), () => b.torus(1.08, 0.08, 0.05, 16, 4, { crease: 30 }));
  // 四支弧形的拱卫石爪，爪尖各托一枚晶体
  pylons.forEach((p, i) => {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    b.bone(p);
    b.g(X(Math.cos(a) * 2.2, 0.9, Math.sin(a) * 2.2, 0, -(a * 180) / Math.PI - 90, 0), () => {
      b.paint(L.stoneDark, { c2: L.stoneLight });
      b.tube([[0, -0.3, 0, 0.4, 0.34], [0, 0.9, -0.22, 0.36, 0.28], [0, 1.9, -0.1, 0.28, 0.22], [0, 2.8, 0.36, 0.18, 0.15], [0, 3.3, 0.86, 0.04, 0.04]], { seg: 6, up: [1, 0, 0] });
      b.paint(L.trim, { gloss: 1 });
      b.g(X(0, 0.5, -0.14, -8, 0, 0), () => b.box(0, 0, 0, 0.88, 0.14, 0.76, 0.04));
      b.g(X(0, 1.9, -0.1, 6, 0, 0), () => b.box(0, 0, 0, 0.64, 0.1, 0.52, 0.03));
      if (L.spiky) {
        b.paint(L.stoneDark, { c2: L.stone });
        b.g(X(0, 1.3, -0.34, -70, 0, 0), () => b.crystal(0.14, 0.8, 4, 0.8, 0.1));
        b.g(X(0, 2.3, -0.2, -60, 0, 0), () => b.crystal(0.1, 0.6, 4, 0.8, 0.1));
      }
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.45, gloss: 1, line: 1 });
      b.g(X(0, 3.2, 0.82, 40, 0, 0), () => b.crystal(0.16, 0.6, 5, 0.6, 0.3));
    });
  });
  // 星核：巨大的多面晶体，向六个方向伸出星芒
  b.bone(star).paint(L.crystal, { c2: L.crystalHot, glow: 0.4, glow2: 0.7, gloss: 1, line: 1 });
  b.g(X(0, coreY - 1.45, 0), () => b.crystal(1.0, 2.9, 6, 0.5, 0.5, 1));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.g(X(0, coreY, 0, 0, -(a * 180) / Math.PI, 0), () => b.g(X(0.72, 0, 0, 0, 0, -90), () => b.crystal(0.3, 1.25, 4, 0.8, 0.05)));
  }
  b.bone(inner).paint(L.crystalHot, { glow: 0.95 });
  b.g(X(0, coreY - 0.7, 0), () => b.crystal(0.46, 1.4, 4, 0.5, 0.5, 1));
  // 两道陀螺环
  for (const [r, R] of [[ringA, 1.95], [ringB, 2.3]] as [number, number][]) {
    b.bone(r).paint(L.trim, { gloss: 1 });
    b.g(X(0, coreY, 0), () => {
      b.torus(R, 0.11, 0.045, 28, 4, { crease: 30 });
      b.paint(L.crystal, { c2: L.crystalHot, glow: 0.7 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.g(X(Math.cos(a) * R, 0, Math.sin(a) * R, 0, -(a * 180) / Math.PI, 0), () => b.box(0, 0, 0, 0.14, 0.12, 0.3, 0.04));
      }
    });
  }
  // 绕转的碎晶
  b.bone(orbit).paint(L.crystal, { c2: L.crystalHot, glow: 0.5, gloss: 1, line: 1 });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const y = coreY + (hash(k, 3) - 0.5) * 2.4;
    b.g(X(Math.cos(a) * 1.5, y, Math.sin(a) * 1.5, hash(k, 4) * 40 - 20, 0, hash(k, 5) * 40 - 20), () => b.g(X(0, -0.2, 0), () => b.crystal(0.12, 0.44 + hash(k, 6) * 0.3, 4, 0.5, 0.4)));
  }
  b.bakeGrounding(6, 0.75, 0.9);
  void mixCol;

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 10;
    const dmg = 1 - a.hp;
    const weak = seg(dmg, 0.5, 0.9);
    let charge = 0;
    if (a.anim === 'attack') {
      const w = a.windup;
      charge = a.p < w ? a.p / w : Math.max(0, 1 - (a.p - w) / 0.25);
      out.glow = 1 + 2 * charge;
    } else out.glow = 1 + 0.14 * Math.sin(t * 1.8);
    out.glow *= 1 - weak * (0.3 + 0.3 * Math.sin(t * 19) * Math.sin(t * 6.1));
    pose.pos(star, 0, Math.sin(t * 0.9) * 0.16, 0);
    pose.rot(star, weak * 6 * Math.sin(t * 2.3), t * 14 * (1 + 2 * charge), weak * 6 * Math.cos(t * 1.9));
    pose.scale(star, 1 + 0.12 * charge + 0.02 * Math.sin(t * 2.2));
    pose.rot(inner, t * 40, t * -60, 0);
    pose.scale(inner, 1 + 0.2 * Math.sin(t * 3) + 0.5 * charge);
    pose.rot(ringA, 24 + weak * 16 * Math.sin(t * 1.4), t * 30, 12 + weak * 14 * Math.cos(t));
    pose.rot(ringB, -30 + weak * 16 * Math.cos(t * 1.2), -t * 22, -18);
    pose.rot(orbit, 0, -t * 18, 0);
    pose.scale(orbit, 1 - weak * 0.3);
    if (a.deathT >= 0) {
      // 爆炸：星核膨胀闪光后碎裂，环与碎晶四散，石爪向外倒塌
      const d = a.deathT;
      const swell = seg(d, 0, 0.6);
      const burst = seg(d, 0.6, 0.9);
      const fall = seg(d, 0.7, 2.2);
      pose.scale(star, (1 + swell * 0.45 + Math.sin(d * 60) * 0.03 * swell) * (1 - burst));
      pose.scale(inner, (1 + swell * 1.6) * (1 - burst));
      pose.scale(ringA, (1 + burst * 2.2) * (1 - seg(d, 1.0, 1.5)));
      pose.scale(ringB, (1 + burst * 2.8) * (1 - seg(d, 1.0, 1.5)));
      pose.pos(ringA, 0, -fall * 2.5, 0);
      pose.pos(ringB, 0, -fall * 2.8, 0);
      pose.scale(orbit, (1 + burst * 3) * (1 - seg(d, 0.9, 1.4)));
      pylons.forEach((p, i) => {
        const ang = (i * Math.PI) / 2 + Math.PI / 4;
        const e = fall * fall;
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
    height: 6.3,
    radius: 2.8,
    scale: 1,
    stride: 1,
    triangles: b.triangleCount,
    attach: { core: { joint: star, x: 0, y: 0, z: 0 }, muzzle: { joint: star, x: 0, y: 0, z: 0 }, chest: { joint: root, x: 0, y: 3.2, z: 0 }, head: { joint: star, x: 0, y: 1.5, z: 0 } },
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
