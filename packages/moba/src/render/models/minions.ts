/**
 * 小兵：四种星卫傀儡。数量多，所以骨架只有十来根、每个几百三角形；队伍色与发光件都走队伍色蒙版，
 * 两队共用同一份几何，靠逐实例的队伍色区分。
 *   melee  星卫      —— 圆墩墩的持盾小卫兵
 *   ranged 星术兵    —— 悬浮的尖帽小术士，手持晶杖
 *   siege  攻城兽    —— 四足的石质机关兽，背负晶炮
 *   super  星陨巨卫  —— 披重甲的大号傀儡，双手抡晶锤
 */
import { bump, seg, strikeWarp } from './humanoid';
import { ModelBuilder, X } from './kit';
import { trim } from './parts';
import { type Pose, Rig } from './rig';
import type { AnimInput, AnimOutput, ModelDef } from './types';

const C = {
  steel: 0xa9b3c4,
  steelDark: 0x5f6a7e,
  joint: 0x3d4558,
  gold: 0xf0c050,
  stone: 0xb9bcc6,
  stoneDark: 0x7d8494,
  cloth: 0xe8e4d8,
};

const TAU = Math.PI * 2;

/** 倒地散架：向后仰倒 + 轻微弹跳，返回 0..1 的倒地进度 */
function collapse(pose: Pose, root: number, t: number, lieY: number): number {
  const k = seg(t, 0.05, 0.45);
  const e = k * k;
  const bounce = t > 0.45 ? Math.max(0, Math.sin((t - 0.45) * 14)) * 0.05 * Math.exp(-(t - 0.45) * 6) : 0;
  pose.rot(root, -86 * e, 0, 0);
  pose.pos(root, 0, lieY * e + bounce, -0.25 * e);
  return e;
}

// ───────────────────────────── 星卫(近战) ─────────────────────────────

export function createMeleeMinion(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 0.5, 0);
  const head = rig.add('head', body, 0, 0.86, 0);
  const armL = rig.add('armL', body, 0.3, 0.74, 0);
  const armR = rig.add('armR', body, -0.3, 0.74, 0);
  const legL = rig.add('legL', root, 0.14, 0.36, 0);
  const legR = rig.add('legR', root, -0.14, 0.36, 0);
  const b = new ModelBuilder();
  b.crease = 36;

  // 腿：短粗的甲靴
  b.sym((s) => {
    b.bone(s > 0 ? legL : legR).paint(C.steelDark, { c2: C.steel, gloss: 0.6 });
    b.lathe([[0.02, 0.105, 0.13, 0.14, 0.03], [0.12, 0.1, 0.11, 0.14, 0.01], [0.36, 0.085, 0.085, 0.14, 0]], { seg: 6 });
  });
  // 身体：圆桶甲 + 队伍色战裙
  b.bone(body).paint(C.steelDark, { c2: C.steel, gloss: 0.7 });
  b.lathe([[0.3, 0.2, 0.17], [0.42, 0.27, 0.22], [0.66, 0.31, 0.25], [0.8, 0.26, 0.22], [0.86, 0.14, 0.13]], { seg: 8 });
  b.paint(0xffffff, { team: 1 });
  b.lathe([[0.24, 0.3, 0.26], [0.3, 0.29, 0.24], [0.46, 0.265, 0.215], [0.47, 0.24, 0.2]], { seg: 8, cap0: false, shape: (a) => 1 + 0.06 * Math.sin(a * 8) });
  b.paint(C.gold, { gloss: 1 });
  trim(b, 0, 0.47, 0, 0.275, 0.225, 0.014, 0.022, 8);
  // 胸口星徽
  b.g(X(0, 0.64, 0.25), () => b.box(0, 0, 0, 0.09, 0.09, 0.03, 0.012));
  // 头盔：大圆盔 + 队伍色发光的眼缝 + 盔缨
  b.bone(head).paint(C.steel, { c2: 0xd4dbe8, gloss: 0.8 });
  b.lathe([[0.84, 0.17, 0.17], [0.92, 0.23, 0.23], [1.06, 0.235, 0.235], [1.17, 0.17, 0.17], [1.22, 0.04, 0.04]], { seg: 8 });
  b.paint(0xffffff, { team: 1, glow: 0.7 });
  b.box(0, 1.0, 0.215, 0.26, 0.05, 0.06, 0.012);
  b.paint(C.gold, { gloss: 1 });
  trim(b, 0, 0.93, 0, 0.235, 0.235, 0.012, 0.02, 8);
  b.paint(0xffffff, { team: 1 });
  b.g(X(0, 1.2, -0.02), () => b.extrude([[-0.03, 0], [0.03, 0], [0.05, 0.14], [0, 0.22], [-0.05, 0.14]], 0.2, 0.02));
  // 左臂 + 圆盾
  b.bone(armL).paint(C.steelDark, { c2: C.steel, gloss: 0.6 });
  b.ball(0.31, 0.74, 0, 0.1, 0.1, 0.1, 0, 60);
  b.limb([0.33, 0.74, 0], [0.36, 0.44, 0.04], 0.07, 0.085, { seg: 6 });
  b.g(X(0.44, 0.52, 0.08, 0, 70, 0), () => {
    b.paint(C.gold, { gloss: 1 });
    b.tube([[0, 0, -0.02, 0.26], [0, 0, 0.02, 0.26]], { seg: 8, crease: 30 });
    b.paint(0xffffff, { team: 1 });
    b.tube([[0, 0, 0.02, 0.215], [0, 0, 0.05, 0.19]], { seg: 8, crease: 30 });
    b.paint(C.gold, { gloss: 1 });
    b.g(X(0, 0, 0.055, 0, 0, 45), () => b.box(0, 0, 0, 0.1, 0.1, 0.03, 0.012));
  });
  // 右臂 + 短剑
  b.bone(armR).paint(C.steelDark, { c2: C.steel, gloss: 0.6 });
  b.ball(-0.31, 0.74, 0, 0.1, 0.1, 0.1, 0, 60);
  b.limb([-0.33, 0.74, 0], [-0.36, 0.44, 0.02], 0.07, 0.085, { seg: 6 });
  b.g(X(-0.36, 0.42, 0.04), () => {
    b.paint(C.gold, { gloss: 1 });
    b.box(0, 0, 0.08, 0.16, 0.04, 0.04, 0.012);
    b.paint(0xe6edf8, { c2: 0xffffff, gloss: 1 });
    b.tube([[0, 0, 0.1, 0.014, 0.05], [0, 0, 0.52, 0.012, 0.045], [0, 0, 0.66, 0.004, 0.006]], { seg: 4, crease: 0 });
  });
  b.bakeGrounding(1.3);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 2.4 + a.seed * 6;
    switch (a.anim) {
      case 'dead': {
        const e = collapse(pose, root, a.t, 0.16);
        pose.rot(armL, -40 * e, 0, 60 * e);
        pose.rot(armR, -30 * e, 0, -70 * e);
        pose.rot(head, 20 * e, 30 * e, 0);
        out.glow = 1 - e;
        break;
      }
      case 'move': {
        const s = Math.sin(a.stride * TAU);
        pose.rot(legL, s * 38, 0, 0);
        pose.rot(legR, -s * 38, 0, 0);
        pose.pos(body, 0, Math.abs(Math.cos(a.stride * TAU)) * 0.035, 0);
        pose.rot(body, 8, -s * 7, 0);
        pose.rot(armR, s * 26 - 10, 0, 0);
        pose.rot(armL, -s * 14 - 20, 0, 0);
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = seg(p, 0, 0.24);
        const hit = seg(p, 0.24, 0.36);
        const rec = seg(p, 0.5, 1);
        const arm = -150 * wind * (1 - hit) - 70 * hit * (1 - rec);
        pose.rot(armR, arm, 0, -20 * wind * (1 - rec));
        pose.rot(body, -10 * wind * (1 - hit) + 16 * hit * (1 - rec), 26 * wind * (1 - hit) - 18 * hit * (1 - rec), 0);
        pose.pos(body, 0, -0.03 * hit * (1 - rec), 0.1 * hit * (1 - rec));
        pose.rot(legL, -14 * hit * (1 - rec), 0, 0);
        pose.rot(armL, -30, 0, 0);
        out.glow = 1 + bump(p, 0.35, 0.15);
        break;
      }
      case 'stunned': {
        pose.rot(body, 8 + Math.sin(t * 2.2) * 6, 0, Math.cos(t * 2.2) * 8);
        pose.rot(head, 14, Math.sin(t * 2.2) * 20, 0);
        break;
      }
      case 'airborne': {
        pose.rot(root, -20 * Math.sin(a.p * Math.PI), 0, 0);
        pose.rot(armL, -60, 0, 70);
        pose.rot(armR, -60, 0, -70);
        pose.rot(legL, -30, 0, 14);
        pose.rot(legR, 20, 0, -14);
        break;
      }
      default: {
        pose.pos(body, 0, Math.sin(t) * 0.012, 0);
        pose.rot(head, 0, Math.sin(t * 0.4) * 8, 0);
        pose.rot(armL, -20 + Math.sin(t) * 2, 0, 0);
        pose.rot(armR, Math.sin(t + 1) * 3, 0, 0);
      }
    }
  };

  return {
    key: 'minion:melee', geometry: b.build(), rig, height: 1.36, radius: 0.5, scale: 1, stride: 1.5, triangles: b.triangleCount,
    attach: { chest: { joint: body, x: 0, y: 0.15, z: 0 }, head: { joint: head, x: 0, y: 0.2, z: 0 }, weapon: { joint: armR, x: -0.06, y: -0.3, z: 0.6 }, muzzle: { joint: armR, x: -0.06, y: -0.3, z: 0.6 } },
    blend: (_f, to) => (to === 'attack' ? 0.07 : 0.12),
    animate,
  };
}

// ───────────────────────────── 星术兵(远程) ─────────────────────────────

export function createRangedMinion(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 0.5, 0);
  const head = rig.add('head', body, 0, 0.9, 0);
  const armL = rig.add('armL', body, 0.24, 0.78, 0.04);
  const armR = rig.add('armR', body, -0.24, 0.78, 0.04);
  const staff = rig.add('staff', armR, -0.3, 0.62, 0.22);
  const gem = rig.add('gem', staff, -0.3, 1.28, 0.22);
  const b = new ModelBuilder();
  b.crease = 36;

  // 袍身：悬浮的钟形，下缘不着地
  b.bone(body).paint(0xffffff, { team: 1 });
  b.lathe([[0.12, 0.3, 0.3], [0.2, 0.31, 0.31], [0.5, 0.24, 0.22], [0.8, 0.19, 0.16], [0.9, 0.1, 0.1]], { seg: 8, shape: (a, k) => (k < 2 ? 1 + 0.08 * Math.sin(a * 8) : 1) });
  b.paint(C.cloth, { c2: 0xbcb6a4 });
  b.lathe([[0.1, 0.02, 0.02], [0.1, 0.29, 0.29]], { seg: 8, cap0: false, cap1: false });
  b.g(X(0, 0, 0.012), () => b.sheet(2, 3, (u, v) => {
    const y = 0.86 - v * 0.7;
    const r = (y > 0.5 ? 0.19 + (0.8 - y) * 0.17 : 0.24 + (0.5 - y) * 0.23) * (y > 0.8 ? 0.6 : 1);
    const ang = Math.PI / 2 + (u - 0.5) * 0.7;
    return [Math.cos(ang) * r, y, Math.sin(ang) * r * 0.95];
  }, false));
  b.paint(C.gold, { gloss: 1 });
  trim(b, 0, 0.62, 0, 0.225, 0.2, 0.012, 0.03, 8);
  b.g(X(0, 0.62, 0.21, 0, 0, 45), () => b.box(0, 0, 0, 0.07, 0.07, 0.03, 0.01));
  // 头：圆脸罩 + 队伍色发光的双眼 + 弯尖帽
  b.bone(head).paint(C.joint, { c2: C.steelDark });
  b.ball(0, 0.98, 0.02, 0.15, 0.15, 0.15, 1);
  b.paint(0xffffff, { team: 1, glow: 0.8 });
  b.sym(() => b.ball(0.06, 0.99, 0.15, 0.03, 0.04, 0.02, 0));
  b.paint(0xffffff, { team: 1 });
  b.tube([[0, 1.04, 0, 0.3, 0.3], [0, 1.08, 0, 0.19, 0.19], [0, 1.26, -0.03, 0.12, 0.12], [0, 1.42, -0.1, 0.06, 0.06], [0, 1.5, -0.2, 0.01, 0.01]], { seg: 8, up: [1, 0, 0] });
  b.paint(C.gold, { gloss: 1 });
  trim(b, 0, 1.085, 0, 0.195, 0.195, 0.012, 0.024, 8);
  // 双臂(袖筒)
  b.sym((s) => {
    b.bone(s > 0 ? armL : armR).paint(0xffffff, { team: 1 });
    b.limb([0.24, 0.78, 0.04], [0.3, 0.62, 0.2], 0.07, 0.095, { seg: 6 });
    b.paint(C.cloth);
    b.ball(0.31, 0.6, 0.22, 0.06, 0.06, 0.06, 0);
  });
  // 晶杖
  b.bone(staff).paint(C.steelDark, { c2: C.steel, gloss: 0.6 });
  b.tube([[-0.3, 0.2, 0.22, 0.02], [-0.3, 1.16, 0.22, 0.024]], { seg: 5 });
  b.paint(C.gold, { gloss: 1 });
  b.sym(() => b.g(X(-0.3, 1.14, 0.22), () => b.tube([[0, 0, 0, 0.02, 0.014], [0.1, 0.08, 0, 0.02, 0.014], [0.1, 0.22, 0, 0.012, 0.01]], { seg: 4, up: [0, 0, 1] })));
  b.bone(gem).paint(0xffffff, { team: 1, glow: 0.8 });
  b.g(X(-0.3, 1.19, 0.22), () => b.crystal(0.065, 0.2, 5, 0.5, 0.5, 1));
  b.bakeGrounding(1.5, 0.78, 0.95);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 2 + a.seed * 6;
    pose.rot(gem, 0, a.time * 120, 0);
    const hover = 0.05 + Math.sin(t) * 0.035;
    switch (a.anim) {
      case 'dead': {
        const e = seg(a.t, 0.05, 0.5);
        pose.pos(root, 0, -0.08 * e, 0);
        pose.pos(body, 0, -0.26 * e * e, 0);
        pose.rot(body, 30 * e, 0, 50 * e * e);
        pose.rot(head, 30 * e, 0, 0);
        pose.rot(staff, 0, 0, -80 * e * e);
        pose.pos(staff, 0, -0.3 * e * e, 0);
        pose.scale(gem, 1 - e);
        out.glow = 1 - e;
        break;
      }
      case 'move': {
        pose.pos(root, 0, hover, 0);
        pose.rot(body, 12, 0, Math.sin(a.stride * TAU) * 5);
        pose.rot(armL, Math.sin(a.stride * TAU) * 14, 0, 0);
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = seg(p, 0, 0.26);
        const hit = seg(p, 0.26, 0.36);
        const rec = seg(p, 0.5, 1);
        pose.pos(root, 0, hover + 0.08 * wind * (1 - rec), 0);
        pose.rot(body, -14 * wind * (1 - hit) + 14 * hit * (1 - rec), 0, 0);
        pose.rot(armR, -50 * wind * (1 - hit) - 30 * hit * (1 - rec), 0, 0);
        pose.rot(staff, 20 * wind * (1 - hit) + 46 * hit * (1 - rec), 0, 0);
        pose.rot(armL, -40 * wind * (1 - rec), 0, 30 * wind * (1 - rec));
        pose.scale(gem, 1 + 0.6 * wind * (1 - hit));
        out.glow = 1 + 2 * wind * (1 - rec * 0.5) * (1 - rec);
        break;
      }
      case 'stunned': {
        pose.pos(root, 0, 0.02, 0);
        pose.rot(body, 10 + Math.sin(t * 2.4) * 6, 0, Math.cos(t * 2.4) * 10);
        pose.rot(head, 0, Math.sin(t * 2.4) * 25, 0);
        break;
      }
      case 'airborne': {
        pose.rot(root, -24 * Math.sin(a.p * Math.PI), 0, 12);
        pose.rot(armL, -80, 0, 50);
        pose.rot(armR, -40, 0, -30);
        break;
      }
      default: {
        pose.pos(root, 0, hover, 0);
        pose.rot(head, 0, Math.sin(t * 0.45) * 10, 0);
        pose.rot(body, 0, 0, Math.sin(t * 0.5) * 2);
      }
    }
  };

  return {
    key: 'minion:ranged', geometry: b.build(), rig, height: 1.62, radius: 0.45, scale: 1, stride: 1.4, triangles: b.triangleCount,
    attach: { chest: { joint: body, x: 0, y: 0.15, z: 0 }, head: { joint: head, x: 0, y: 0.2, z: 0 }, weapon: { joint: gem, x: 0, y: 0, z: 0 }, muzzle: { joint: gem, x: 0, y: 0, z: 0 } },
    blend: (_f, to) => (to === 'attack' ? 0.07 : 0.14),
    animate,
  };
}

// ───────────────────────────── 攻城兽(四足晶炮) ─────────────────────────────

export function createSiegeMinion(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 0.72, 0);
  const head = rig.add('head', body, 0, 0.8, 0.62);
  const cannon = rig.add('cannon', body, 0, 1.22, -0.1);
  const barrel = rig.add('barrel', cannon, 0, 1.3, 0.2);
  const legs = [
    rig.add('legFL', body, 0.4, 0.62, 0.45),
    rig.add('legFR', body, -0.4, 0.62, 0.45),
    rig.add('legBL', body, 0.4, 0.62, -0.5),
    rig.add('legBR', body, -0.4, 0.62, -0.5),
  ];
  const b = new ModelBuilder();
  b.crease = 34;

  // 四条石柱腿 + 金属蹄
  const legAt: [number, number][] = [[0.4, 0.45], [-0.4, 0.45], [0.4, -0.5], [-0.4, -0.5]];
  legs.forEach((leg, i) => {
    const [x, z] = legAt[i];
    b.bone(leg).paint(C.stoneDark, { c2: C.stone });
    b.lathe([[0.1, 0.13, 0.15, x, z], [0.4, 0.12, 0.13, x, z], [0.7, 0.17, 0.19, x, z]], { seg: 6 });
    b.paint(C.steelDark, { c2: C.steel, gloss: 0.7 });
    b.lathe([[0, 0.17, 0.2, x, z + 0.02], [0.12, 0.15, 0.17, x, z], [0.14, 0.12, 0.13, x, z]], { seg: 6 });
  });
  // 躯干：宽厚的石质壳体，两侧挂队伍色甲幔
  b.bone(body).paint(C.stoneDark, { c2: C.stone });
  b.tube([[0, 0.7, -0.82, 0.3, 0.2], [0, 0.78, -0.6, 0.5, 0.36], [0, 0.82, 0, 0.56, 0.42], [0, 0.8, 0.5, 0.48, 0.36], [0, 0.76, 0.72, 0.3, 0.24]], { seg: 8, up: [1, 0, 0], power: 2.6 });
  b.sym(() => {
    b.paint(0xffffff, { team: 1 });
    b.g(X(0.535, 0.74, -0.02, 0, 90, -8), () => b.extrude([[-0.5, 0.2], [0.5, 0.2], [0.42, -0.14], [0.14, -0.3], [-0.14, -0.3], [-0.42, -0.14]], 0.04, 0.014));
    b.paint(C.gold, { gloss: 1 });
    b.g(X(0.562, 0.76, -0.02, 0, 90, -8), () => b.extrude([[0, 0.12], [0.1, 0], [0, -0.12], [-0.1, 0]], 0.03, 0.01));
  });
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 0.82, 0), () => b.tube([[0, 0.02, -0.5, 0.57, 0.43], [0, 0.02, -0.44, 0.57, 0.43]], { seg: 8, up: [1, 0, 0], power: 2.6, crease: 30 }));
  // 头：低伏的兽首，队伍色发光的独眼
  b.bone(head).paint(C.steelDark, { c2: C.steel, gloss: 0.7 });
  b.tube([[0, 0.8, 0.6, 0.26, 0.22], [0, 0.76, 0.86, 0.24, 0.2], [0, 0.7, 1.06, 0.15, 0.12]], { seg: 6, up: [1, 0, 0] });
  b.paint(0xffffff, { team: 1, glow: 0.8 });
  b.g(X(0, 0.8, 1.0, -30, 0, 0), () => b.box(0, 0, 0, 0.2, 0.05, 0.06, 0.014));
  b.paint(C.stone, { c2: 0xdfe2ea });
  b.sym(() => b.g(X(0.2, 0.9, 0.74, -30, 0, -30), () => b.crystal(0.05, 0.24, 4, 0.7, 0.1)));
  // 背上的晶炮：炮座 + 可后坐的炮管 + 炮口水晶
  b.bone(cannon).paint(C.steelDark, { c2: C.steel, gloss: 0.7 });
  b.lathe([[1.1, 0.3, 0.34, 0, -0.1], [1.22, 0.26, 0.3, 0, -0.1], [1.3, 0.16, 0.2, 0, -0.1]], { seg: 8 });
  b.bone(barrel).paint(C.steel, { c2: 0xd4dbe8, gloss: 0.8 });
  b.g(X(0, 1.34, -0.1, -14, 0, 0), () => {
    b.tube([[0, 0, -0.3, 0.17], [0, 0, 0.1, 0.19], [0, 0, 0.7, 0.14], [0, 0, 0.74, 0.17], [0, 0, 0.84, 0.17]], { seg: 8, crease: 30 });
    b.paint(C.gold, { gloss: 1 });
    b.tube([[0, 0, 0.08, 0.2], [0, 0, 0.16, 0.2]], { seg: 8, crease: 30 });
    b.paint(0xffffff, { team: 1, glow: 0.8 });
    b.g(X(0, 0, 0.8, 90, 0, 0), () => b.crystal(0.12, 0.3, 6, 0.6, 0.3, 1));
    b.g(X(0, 0, -0.3, -90, 0, 0), () => b.crystal(0.1, 0.16, 6, 0.8, 0.1));
  });
  b.bakeGrounding(1.6);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 1.8 + a.seed * 6;
    switch (a.anim) {
      case 'dead': {
        const e = seg(a.t, 0.05, 0.55);
        const k = e * e;
        pose.pos(body, 0, -0.42 * k, 0);
        pose.rot(body, 6 * k, 0, 10 * k);
        legs.forEach((leg, i) => pose.rot(leg, (i < 2 ? -60 : 60) * k, 0, (i % 2 === 0 ? 46 : -46) * k));
        pose.rot(cannon, 0, 0, 18 * k);
        pose.rot(barrel, 24 * k, 0, 0);
        pose.rot(head, 30 * k, 0, 0);
        out.glow = 1 - e;
        break;
      }
      case 'move': {
        const s = Math.sin(a.stride * TAU);
        // 对角步：左前 + 右后同相
        pose.rot(legs[0], s * 30, 0, 0);
        pose.rot(legs[3], s * 30, 0, 0);
        pose.rot(legs[1], -s * 30, 0, 0);
        pose.rot(legs[2], -s * 30, 0, 0);
        pose.pos(body, 0, Math.abs(Math.cos(a.stride * TAU)) * 0.04, 0);
        pose.rot(body, 0, 0, s * 3);
        pose.rot(head, Math.cos(a.stride * TAU * 2) * 4, 0, 0);
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const charge = seg(p, 0, 0.33);
        const fire = seg(p, 0.33, 0.4);
        const rec = seg(p, 0.4, 1);
        const kick = fire * (1 - rec) * (1 - rec);
        pose.rot(barrel, -16 * charge * (1 - rec) - 10 * kick, 0, 0);
        pose.pos(barrel, 0, 0, -0.3 * kick);
        pose.rot(body, -5 * kick, 0, 0);
        pose.pos(body, 0, -0.05 * charge * (1 - fire) - 0.03 * kick, -0.1 * kick);
        legs.forEach((leg, i) => pose.rot(leg, (i < 2 ? 1 : -1) * 8 * kick, 0, 0));
        out.glow = 1 + 2.4 * charge * (1 - fire) + 1.5 * kick;
        break;
      }
      case 'stunned': {
        pose.rot(body, Math.sin(t * 2.6) * 4, 0, Math.cos(t * 2.6) * 6);
        pose.rot(head, 14, Math.sin(t * 2.6) * 18, 0);
        break;
      }
      case 'airborne': {
        pose.rot(root, -16 * Math.sin(a.p * Math.PI), 0, 8);
        legs.forEach((leg, i) => pose.rot(leg, i < 2 ? -40 : 40, 0, 0));
        break;
      }
      default: {
        pose.pos(body, 0, Math.sin(t) * 0.015, 0);
        pose.rot(head, Math.sin(t * 0.7) * 4, Math.sin(t * 0.33) * 12, 0);
        pose.rot(barrel, Math.sin(t * 0.5) * 2, 0, 0);
      }
    }
  };

  return {
    key: 'minion:siege', geometry: b.build(), rig, height: 1.78, radius: 0.8, scale: 1, stride: 1.9, triangles: b.triangleCount,
    attach: { chest: { joint: body, x: 0, y: 0.1, z: 0 }, head: { joint: head, x: 0, y: 0.1, z: 0.2 }, weapon: { joint: barrel, x: 0, y: 0.26, z: 0.72 }, muzzle: { joint: barrel, x: 0, y: 0.26, z: 0.72 } },
    blend: () => 0.14,
    animate,
  };
}

// ───────────────────────────── 星陨巨卫(超级兵) ─────────────────────────────

export function createSuperMinion(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const hips = rig.add('hips', root, 0, 0.78, 0);
  const chest = rig.add('chest', hips, 0, 1.2, 0);
  const head = rig.add('head', chest, 0, 1.7, 0.04);
  const armL = rig.add('armL', chest, 0.56, 1.52, 0);
  const armR = rig.add('armR', chest, -0.56, 1.52, 0);
  const foreL = rig.add('foreL', armL, 0.6, 1.1, 0);
  const foreR = rig.add('foreR', armR, -0.6, 1.1, 0);
  const mace = rig.add('mace', foreR, -0.6, 0.74, 0.02);
  const legL = rig.add('legL', hips, 0.22, 0.74, 0);
  const legR = rig.add('legR', hips, -0.22, 0.74, 0);
  const b = new ModelBuilder();
  b.crease = 34;

  b.sym((s) => {
    b.bone(s > 0 ? legL : legR).paint(C.steelDark, { c2: C.steel, gloss: 0.7 });
    b.lathe([[0, 0.2, 0.26, 0.22, 0.05], [0.14, 0.17, 0.2, 0.22, 0.02], [0.44, 0.15, 0.16, 0.22, 0], [0.78, 0.19, 0.19, 0.22, 0]], { seg: 6 });
    b.paint(C.gold, { gloss: 1 });
    b.ball(0.22, 0.46, 0.14, 0.09, 0.1, 0.07, 0, 50);
  });
  // 躯干：倒梯形重甲 + 队伍色战裙与胸核
  b.bone(hips).paint(C.steelDark, { c2: C.steel, gloss: 0.7 });
  b.lathe([[0.64, 0.24, 0.2], [0.76, 0.36, 0.28], [0.94, 0.34, 0.27], [1.04, 0.3, 0.24]], { seg: 8, power: 2.4, phase: 22.5 });
  b.paint(0xffffff, { team: 1 });
  b.lathe([[0.5, 0.4, 0.33], [0.56, 0.39, 0.31], [0.82, 0.36, 0.285], [0.83, 0.3, 0.24]], { seg: 8, cap0: false, shape: (a) => 1 + 0.07 * Math.sin(a * 8), power: 2.4, phase: 22.5 });
  b.paint(C.gold, { gloss: 1 });
  trim(b, 0, 0.84, 0, 0.375, 0.3, 0.02, 0.03, 8);
  b.bone(chest).paint(C.steel, { c2: 0xd4dbe8, gloss: 0.8 });
  b.lathe([[1.0, 0.32, 0.26], [1.16, 0.5, 0.36], [1.42, 0.6, 0.4], [1.6, 0.54, 0.36], [1.7, 0.3, 0.26]], { seg: 8, power: 2.4, phase: 22.5 });
  b.paint(C.gold, { gloss: 1 });
  b.g(X(0, 1.36, 0.385, -8, 0, 0), () => b.torus(0.15, 0.03, 0.03, 8, 4, { crease: 30 }));
  b.g(X(0, 1.36, 0.38, 82, 0, 0), () => b.torus(0.15, 0.03, 0.026, 8, 4, { crease: 30 }));
  b.paint(0xffffff, { team: 1, glow: 0.85 });
  b.g(X(0, 1.27, 0.4, 0, 0, 0, 1, 1, 0.7), () => b.crystal(0.1, 0.2, 4, 0.5, 0.5, 1));
  // 头：带角的盔
  b.bone(head).paint(C.steelDark, { c2: C.steel, gloss: 0.8 });
  b.lathe([[1.66, 0.16, 0.17, 0, 0.04], [1.76, 0.21, 0.22, 0, 0.05], [1.9, 0.2, 0.21, 0, 0.04], [2.0, 0.1, 0.11, 0, 0.02]], { seg: 6, phase: 90 });
  b.paint(0xffffff, { team: 1, glow: 0.85 });
  b.g(X(0, 1.82, 0.25, 0, 0, 0), () => b.box(0, 0, 0, 0.26, 0.05, 0.06, 0.014));
  b.paint(C.gold, { gloss: 1 });
  b.sym(() => b.tube([[0.18, 1.9, 0.04, 0.05, 0.05], [0.32, 2.0, 0.02, 0.04, 0.04], [0.36, 2.16, 0.02, 0.008, 0.008]], { seg: 5 }));
  // 肩甲(队伍色晶刺) + 双臂
  b.sym((s) => {
    const arm = s > 0 ? armL : armR;
    b.bone(arm).paint(C.steel, { c2: 0xd4dbe8, gloss: 0.8 });
    b.g(X(0.64, 1.6, 0, 0, 0, -16), () => {
      b.lathe([[-0.1, 0.3, 0.28], [0, 0.3, 0.28], [0.12, 0.22, 0.2], [0.18, 0.06, 0.06]], { seg: 8, crease: 34 });
      b.paint(C.gold, { gloss: 1 });
      trim(b, 0, -0.09, 0, 0.305, 0.285, 0.02, 0.026, 8);
      b.paint(0xffffff, { team: 1, glow: 0.6 });
      b.g(X(0.04, 0.1, 0, 0, 0, -10), () => b.crystal(0.075, 0.36, 5, 0.5, 0.1));
      b.g(X(0.16, 0.06, 0, 0, 0, -40), () => b.crystal(0.055, 0.24, 5, 0.5, 0.1));
    });
    b.paint(C.steelDark, { c2: C.steel, gloss: 0.6 });
    b.limb([0.6, 1.5, 0], [0.6, 1.12, 0], 0.15, 0.13, { seg: 6 });
    b.bone(s > 0 ? foreL : foreR).paint(C.steel, { c2: 0xd4dbe8, gloss: 0.7 });
    b.ball(0.6, 1.1, 0, 0.14, 0.14, 0.14, 0, 60);
    b.limb([0.6, 1.1, 0], [0.6, 0.78, 0], 0.13, 0.17, { seg: 6 });
    b.box(0.6, 0.68, 0.01, 0.24, 0.24, 0.26, 0.06);
  });
  // 晶锤(右手)：长柄 + 队伍色发光的晶簇锤头
  b.bone(mace);
  b.g(X(-0.6, 0.7, 0.02), () => {
    b.paint(C.steelDark, { c2: C.steel, gloss: 0.7 });
    b.tube([[0, 0, -0.4, 0.04], [0, 0, 1.0, 0.045]], { seg: 6 });
    b.paint(C.gold, { gloss: 1 });
    b.tube([[0, 0, 0.9, 0.16], [0, 0, 1.0, 0.2], [0, 0, 1.32, 0.2], [0, 0, 1.4, 0.14]], { seg: 6, crease: 30 });
    b.paint(0xffffff, { team: 1, glow: 0.75 });
    b.g(X(0, 0, 1.38, 90, 0, 0), () => b.crystal(0.11, 0.34, 5, 0.6, 0.15));
    for (let i = 0; i < 4; i++) b.g(X(0, 0, 1.16, 0, 0, i * 90 + 45), () => b.g(X(0, 0.16, 0), () => b.crystal(0.08, 0.26, 4, 0.6, 0.1)));
  });
  b.bakeGrounding(2.2);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 1.6 + a.seed * 6;
    // 站姿：晶锤扛在肩上
    pose.rot(armR, -20, 0, -10);
    pose.rot(foreR, -100, 0, 0);
    pose.rot(armL, 6, 0, 10);
    pose.rot(foreL, -20, 0, 0);
    switch (a.anim) {
      case 'dead': {
        const e = collapse(pose, root, a.t * 0.8, 0.3);
        pose.rot(armL, -30 * e, 0, 60 * e);
        pose.rot(armR, -20 + 10 * e, 0, -10 - 60 * e);
        pose.rot(foreR, -100 + 80 * e, 0, 0);
        pose.rot(head, 20 * e, 20 * e, 0);
        out.glow = 1 - e;
        break;
      }
      case 'move': {
        const s = Math.sin(a.stride * TAU);
        pose.rot(legL, s * 30, 0, 0);
        pose.rot(legR, -s * 30, 0, 0);
        pose.pos(hips, 0, Math.abs(Math.cos(a.stride * TAU)) * 0.05 - 0.02, 0);
        pose.rot(hips, 6, -s * 6, s * 2);
        pose.rot(chest, 2, s * 8, 0);
        pose.rot(armL, 6 - s * 22, 0, 10);
        break;
      }
      case 'attack': {
        const p = strikeWarp(a.p, a.windup);
        const wind = seg(p, 0, 0.26);
        const hit = seg(p, 0.26, 0.36);
        const rec = seg(p, 0.55, 1);
        const up = wind * (1 - hit);
        const down = hit * (1 - rec);
        pose.rot(armR, -20 - 140 * up - 40 * down, 0, -10 - 10 * up);
        pose.rot(foreR, -100 + 50 * up + 80 * down, 0, 0);
        pose.rot(mace, -30 * up + 30 * down, 0, 0);
        pose.rot(chest, -12 * up + 22 * down, 14 * up - 10 * down, 0);
        pose.rot(hips, 10 * down, 0, 0);
        pose.pos(hips, 0, -0.1 * down, 0.12 * down);
        pose.rot(legL, -20 * down, 0, 0);
        pose.rot(legR, 14 * down, 0, 0);
        out.glow = 1 + 1.5 * bump(p, 0.35, 0.18);
        break;
      }
      case 'stunned': {
        pose.rot(hips, 6 + Math.sin(t * 2.6) * 4, 0, Math.cos(t * 2.6) * 6);
        pose.rot(head, 16, Math.sin(t * 2.6) * 20, 0);
        break;
      }
      case 'airborne': {
        pose.rot(root, -18 * Math.sin(a.p * Math.PI), 0, 0);
        pose.rot(legL, -30, 0, 10);
        pose.rot(legR, 16, 0, -10);
        pose.rot(armL, -50, 0, 60);
        break;
      }
      default: {
        pose.pos(hips, 0, Math.sin(t) * 0.014, 0);
        pose.rot(chest, Math.sin(t) * 1.6, 0, 0);
        pose.rot(head, 0, Math.sin(t * 0.4) * 9, 0);
        out.glow = 1 + 0.15 * Math.sin(t * 2);
      }
    }
  };

  return {
    key: 'minion:super', geometry: b.build(), rig, height: 2.3, radius: 0.9, scale: 1, stride: 2.4, triangles: b.triangleCount,
    attach: { chest: { joint: chest, x: 0, y: 0.15, z: 0 }, head: { joint: head, x: 0, y: 0.2, z: 0 }, weapon: { joint: mace, x: 0, y: 0, z: 1.3 }, muzzle: { joint: mace, x: 0, y: 0, z: 1.3 } },
    blend: (_f, to) => (to === 'attack' ? 0.08 : 0.15),
    animate,
  };
}
