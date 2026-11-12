/**
 * 小兵：无面的石铁傀儡家族(和历史武将英雄拉开)。数量多，所以骨架只有十来根、每个约一千三角形；
 * 两队共用同一份几何：布件与发光缝走队伍色蒙版，石铁本体的冷暖由逐实例的本体乘色区分(蓝方钢蓝灰，红方玄铁)。
 *   melee  近战兵 —— 持盾短戈的矮壮傀儡，盾面是队徽浮雕(蓝 = 八芒星，红 = 三焰；按 AnimInput.team 切换)
 *   ranged 远程兵 —— 提灯傀儡：头是一盏八角灯，光弹从灯里打出去
 *   siege  攻城兵 —— 四足驮兽，背着一门朝向明确的弩炮
 *   super  超级兵 —— 加大一号的重甲傀儡，肩后一面队旗，双手抡长柄锤
 */
import { MAT, ModelBuilder, PATTERN, X } from './kit';
import { hitPulse } from './quadruped';
import { type Pose, Rig, bump, easeIO, easeOut, seg, strikeWarp } from './rig';
import type { AnimInput, AnimOutput, ModelDef } from './types';

const C = {
  stone: 0x8698ba,
  stoneLight: 0xa8b6d2,
  stoneDark: 0x5a6684,
  iron: 0x454d62,
  brass: 0xc9a45a,
  cloth: 0x0c1830,
  wood: 0x6a5a4c,
};

const TAU = Math.PI * 2;
const stone = { mat: MAT.rock, pattern: PATTERN.strata, patternScale: 6, patternAmt: 0.35, grain: 0.06 } as const;
const iron = { gloss: 0.6, mat: MAT.metal } as const;
const brass = { gloss: 0.9, mat: MAT.metal } as const;
/** 队伍色的布：底色压深一点，免得整片过亮 */
const cloth = { team: 0.82, mat: MAT.cloth, pattern: PATTERN.weave, patternScale: 12, patternAmt: 0.35 } as const;
/** 队伍色的发光件(关节缝、灯、核心) */
const lit = (glow: number): { team: number; glow: number; mat: 4; line: number } => ({ team: 1, glow, mat: MAT.crystal, line: 0 });

/** 八芒星 / 三焰的轮廓(队徽浮雕) */
function star8(r: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + Math.PI / 2;
    const rr = i % 2 === 0 ? r * (i % 4 === 0 ? 1 : 0.7) : r * 0.36;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}
function flame3(b: ModelBuilder, r: number, depth: number): void {
  const tongue = (dx: number, h: number, w: number): void => {
    b.g(X(dx, 0, 0), () => b.extrude([[0, -r * 0.7], [w, -r * 0.3], [w * 0.7, h * 0.3], [w * 0.2, h * 0.5], [0, h], [-w * 0.5, h * 0.4], [-w, -r * 0.3]], depth, 0));
  };
  tongue(0, r * 1.05, r * 0.36);
  tongue(-r * 0.55, r * 0.55, r * 0.27);
  tongue(r * 0.55, r * 0.6, r * 0.27);
}

/** 死亡两拍：先熄灭下沉(返回 slump)，再零件弹开(返回 burst)。t 为离场后的秒数 */
function deathBeats(t: number): { slump: number; burst: number; fall: number } {
  return { slump: easeOut(seg(t, 0, 0.22)), burst: easeOut(seg(t, 0.22, 0.6)), fall: seg(t, 0.3, 0.75) };
}
/** 弹开的零件：向外抛起再落地(抛物线) */
function fling(pose: Pose, j: number, k: number, fall: number, dx: number, dz: number, drop: number, rx: number, rz: number): void {
  pose.move(j, dx * k, 0.5 * Math.sin(Math.min(1, k) * Math.PI) * (1 - fall) - drop * fall * fall, dz * k);
  pose.add(j, rx * k, 0, rz * k);
}

// ───────────────────────────── 近战兵：持盾短戈 ─────────────────────────────

export function createMeleeMinion(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 0.5, 0);
  const head = rig.add('head', body, 0, 0.92, 0.02);
  const armL = rig.add('armL', body, 0.34, 0.8, 0);
  const armR = rig.add('armR', body, -0.34, 0.8, 0);
  const legL = rig.add('legL', root, 0.15, 0.36, 0);
  const legR = rig.add('legR', root, -0.15, 0.36, 0);
  const emblemB = rig.add('emblemB', armL, 0.5, 0.56, 0.2);
  const emblemR = rig.add('emblemR', armL, 0.5, 0.56, 0.2);
  const b = new ModelBuilder();
  b.crease = 38;

  // 腿：短粗的石墩，铁靴
  b.sym((s) => {
    b.bone(s > 0 ? legL : legR).paint(C.stoneDark, { c2: C.stone, ...stone });
    b.lathe([[0.1, 0.1, 0.11, 0.15, 0.0], [0.36, 0.115, 0.12, 0.15, 0], [0.42, 0.09, 0.09, 0.15, 0]], { seg: 6, phase: 30 });
    b.paint(C.iron, { ...iron });
    b.lathe([[0, 0.13, 0.17, 0.15, 0.035], [0.1, 0.125, 0.15, 0.15, 0.02], [0.14, 0.1, 0.11, 0.15, 0]], { seg: 6, phase: 30 });
  });
  // 躯干：上宽下窄的石块，腰间一道发光缝，前后垂下队伍色的布
  b.bone(body).paint(C.stoneDark, { c2: C.stoneLight, ...stone });
  b.lathe([[0.34, 0.2, 0.17], [0.46, 0.26, 0.2], [0.5, 0.25, 0.19]], { seg: 6, phase: 30, power: 2.4 });
  b.lathe([[0.53, 0.27, 0.2], [0.7, 0.36, 0.26], [0.88, 0.38, 0.27], [0.96, 0.24, 0.2]], { seg: 6, phase: 30, power: 2.4 });
  b.paint(0xffffff, lit(0.75));
  b.lathe([[0.49, 0.235, 0.18], [0.54, 0.25, 0.19]], { seg: 6, phase: 30, power: 2.4, cap0: false, cap1: false });
  b.paint(C.cloth, { ...cloth });
  b.g(X(0, 0.5, 0.205, 6, 0, 0), () => b.extrude([[-0.13, 0], [0.13, 0], [0.12, -0.26], [0, -0.34], [-0.12, -0.26]], 0.03, 0.008));
  b.g(X(0, 0.5, -0.2, -6, 0, 0), () => b.extrude([[-0.12, 0], [0.12, 0], [0.11, -0.2], [-0.11, -0.2]], 0.03, 0.008));
  b.paint(C.brass, { ...brass });
  b.g(X(0, 0.74, 0.265, -10, 0, 45), () => b.box(0, 0, 0, 0.1, 0.1, 0.03, 0.012));
  // 头：无面的石盔，正面一块光洁的铁面板，中间一道竖向发光缝
  b.bone(head).paint(C.stone, { c2: C.stoneLight, ...stone });
  b.lathe([[0.9, 0.15, 0.15, 0, 0.02], [0.98, 0.21, 0.2, 0, 0.02], [1.16, 0.2, 0.19, 0, 0.02], [1.26, 0.1, 0.1, 0, 0.0]], { seg: 6, phase: 90 });
  b.paint(C.iron, { ...iron });
  b.g(X(0, 1.07, 0.185, -4, 0, 0), () => b.extrude([[-0.12, -0.12], [0.12, -0.12], [0.14, 0.06], [0, 0.14], [-0.14, 0.06]], 0.05, 0.015));
  b.paint(0xffffff, lit(0.9));
  b.box(0, 1.06, 0.216, 0.03, 0.17, 0.02);
  b.paint(C.cloth, { ...cloth });
  b.g(X(0, 1.24, -0.04), () => b.extrude([[-0.025, 0], [0.025, 0], [0.04, 0.12], [0, 0.2], [-0.04, 0.12]], 0.22, 0.015));
  // 左臂 + 盾：上平下尖的塔形盾，盾面队徽浮雕
  b.bone(armL).paint(C.stoneDark, { c2: C.stone, ...stone });
  b.ball(0.36, 0.8, 0, 0.12, 0.12, 0.12, 0, 40);
  b.limb([0.38, 0.8, 0], [0.42, 0.5, 0.06], 0.085, 0.1, { seg: 6 });
  b.g(X(0.5, 0.56, 0.14, 0, 62, 0), () => {
    b.paint(C.iron, { ...iron });
    b.extrude([[-0.25, 0.26], [0.25, 0.26], [0.27, -0.06], [0, -0.38], [-0.27, -0.06]], 0.06, 0.02);
    b.paint(C.cloth, { ...cloth });
    b.g(X(0, 0, 0.034), () => b.extrude([[-0.2, 0.21], [0.2, 0.21], [0.215, -0.045], [0, -0.3], [-0.215, -0.045]], 0.02, 0.006));
    b.paint(C.brass, { ...brass });
    b.g(X(0, 0.285, 0.0), () => b.box(0, 0, 0, 0.54, 0.05, 0.08, 0.015));
  });
  b.bone(emblemB).paint(C.brass, { ...brass });
  b.g(X(0.5, 0.56, 0.14, 0, 62, 0), () => b.g(X(0, 0.0, 0.05), () => b.extrude(star8(0.15), 0.03, 0)));
  b.bone(emblemR).paint(C.brass, { ...brass });
  b.g(X(0.5, 0.56, 0.14, 0, 62, 0), () => b.g(X(0, 0.0, 0.05), () => flame3(b, 0.15, 0.03)));
  // 右臂 + 短戈：木柄，横出的戈刃
  b.bone(armR).paint(C.stoneDark, { c2: C.stone, ...stone });
  b.ball(-0.36, 0.8, 0, 0.12, 0.12, 0.12, 0, 40);
  b.limb([-0.38, 0.8, 0], [-0.4, 0.5, 0.04], 0.085, 0.1, { seg: 6 });
  b.g(X(-0.4, 0.46, 0.06), () => {
    b.paint(C.wood, { mat: MAT.leather, pattern: PATTERN.bark, patternScale: 10, patternAmt: 0.3 });
    b.tube([[0, 0, -0.26, 0.026], [0, 0, 0.74, 0.024]], { seg: 5 });
    b.paint(0xdfe6f2, { c2: 0xffffff, gloss: 1, mat: MAT.metal });
    // 戈头：前锋 + 横出的援(刃)
    b.tube([[0, 0, 0.7, 0.012, 0.04], [0, 0, 0.92, 0.004, 0.006]], { seg: 4, crease: 0 });
    b.g(X(0, 0, 0.6, 90, 0, 90), () => b.extrude([[-0.03, 0], [0.03, 0], [0.035, 0.1], [0.055, 0.17], [0, 0.36], [-0.055, 0.17], [-0.035, 0.1]], 0.03, 0.012));
    b.paint(C.brass, { ...brass });
    b.tube([[0, 0, 0.54, 0.04], [0, 0, 0.62, 0.04]], { seg: 6, crease: 30 });
  });
  b.bakeGrounding(1.3);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 2.4 + a.seed * 6;
    pose.scale(emblemB, a.team === 1 ? 0.001 : 1);
    pose.scale(emblemR, a.team === 1 ? 1 : 0.001);
    switch (a.anim) {
      case 'dead': {
        const d = deathBeats(a.t);
        pose.pos(body, 0, -0.1 * d.slump - 0.3 * d.fall * d.fall, 0);
        pose.rot(body, 14 * d.slump + 40 * d.burst, 0, 10 * d.burst);
        fling(pose, head, d.burst, d.fall, 0.1, -0.5, 0.7, -120, 40);
        fling(pose, armL, d.burst, d.fall, 0.5, 0.2, 0.5, 20, 80);
        fling(pose, armR, d.burst, d.fall, -0.45, 0.3, 0.5, -40, -90);
        pose.rot(legL, -30 * d.burst, 0, 30 * d.burst);
        pose.rot(legR, 20 * d.burst, 0, -34 * d.burst);
        out.glow = Math.max(0.02, 1 - d.slump * 1.2);
        break;
      }
      case 'move': {
        const c = a.stride * TAU;
        const s = Math.sin(c);
        pose.rot(legL, s * 36, 0, 0);
        pose.rot(legR, -s * 36, 0, 0);
        pose.pos(body, 0, Math.abs(Math.cos(c)) * 0.04, 0);
        pose.rot(body, 9 + Math.cos(c * 2) * 2, -s * 7, 0);
        pose.rot(head, -4 - Math.cos(c * 2 + 0.6) * 3, 0, 0);
        // 戈扛在身侧，随步子前后晃(滞后半拍)
        pose.rot(armR, -24 + Math.sin(c - 0.8) * 16, 0, -6);
        pose.rot(armL, -26 - s * 10, 0, 0);
        break;
      }
      case 'attack': {
        // 预备(戈后拉、盾前顶) → 上步横啄 → 过冲后收回
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.26));
        const hit = seg(p, 0.26, 0.36);
        const rec = easeIO(seg(p, 0.5, 1));
        const back = wind * (1 - hit);
        const fwd = hit * (1 - rec);
        const over = bump(p, 0.42, 0.1);
        pose.rot(armR, -130 * back - 74 * fwd + 14 * over, 0, -24 * back + 10 * fwd);
        pose.rot(body, -12 * back + 18 * fwd, 30 * back - 22 * fwd, 0);
        pose.pos(body, 0, 0.03 * back - 0.04 * fwd, -0.06 * back + 0.14 * fwd);
        pose.rot(legL, 10 * back - 18 * fwd, 0, 0);
        pose.rot(legR, -6 * back + 12 * fwd, 0, 0);
        pose.rot(armL, -34 - 10 * back, 0, 0);
        pose.rot(head, 6 * back - 6 * fwd, -14 * back + 8 * fwd, 0);
        out.glow = 1 + 0.3 * back + 0.7 * bump(p, 0.36, 0.14);
        break;
      }
      case 'stunned': {
        pose.rot(body, 8 + Math.sin(t * 2.2) * 6, 0, Math.cos(t * 2.2) * 8);
        pose.rot(head, 14, Math.sin(t * 2.2) * 20, 0);
        pose.rot(armL, -10, 0, 20);
        pose.rot(armR, 10, 0, -20);
        out.glow = 0.6;
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
        pose.rot(armL, -22 + Math.sin(t) * 2, 0, 0);
        pose.rot(armR, -8 + Math.sin(t + 1) * 3, 0, 0);
        out.glow = 1 + 0.12 * Math.sin(t * 1.3);
      }
    }
    const hk = hitPulse(a.hitT, 0.18);
    if (hk > 0 && a.anim !== 'dead') {
      pose.add(body, -10 * hk, 0, 0);
      pose.add(head, 12 * hk, 0, 0);
    }
  };

  return {
    key: 'minion:melee', geometry: b.build(), rig, height: 1.42, radius: 0.5, scale: 1, stride: 1.5, triangles: b.triangleCount, deathDur: 1.1, outline: 1.2,
    attach: { chest: { joint: body, x: 0, y: 0.2, z: 0 }, head: { joint: head, x: 0, y: 0.2, z: 0 }, weapon: { joint: armR, x: -0.06, y: -0.34, z: 0.9 }, muzzle: { joint: armR, x: -0.06, y: -0.34, z: 0.9 }, handL: { joint: armL, x: 0.16, y: -0.24, z: 0.14 }, handR: { joint: armR, x: -0.06, y: -0.34, z: 0.06 } },
    blend: (_f, to) => (to === 'attack' ? 0.07 : 0.12),
    animate,
  };
}

// ───────────────────────────── 远程兵：提灯傀儡 ─────────────────────────────

export function createRangedMinion(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 0.52, 0);
  const head = rig.add('head', body, 0, 1.02, 0.02);
  const flame = rig.add('flame', head, 0, 1.24, 0.02);
  const armL = rig.add('armL', body, 0.27, 0.9, 0.02);
  const armR = rig.add('armR', body, -0.27, 0.9, 0.02);
  const legL = rig.add('legL', root, 0.12, 0.4, 0);
  const legR = rig.add('legR', root, -0.12, 0.4, 0);
  const b = new ModelBuilder();
  b.crease = 38;

  // 腿：细长的石柱腿
  b.sym((s) => {
    b.bone(s > 0 ? legL : legR).paint(C.stoneDark, { c2: C.stone, ...stone });
    b.lathe([[0.08, 0.075, 0.08, 0.12, 0], [0.4, 0.09, 0.09, 0.12, 0], [0.46, 0.07, 0.07, 0.12, 0]], { seg: 6, phase: 30 });
    b.paint(C.iron, { ...iron });
    b.lathe([[0, 0.1, 0.14, 0.12, 0.03], [0.08, 0.095, 0.12, 0.12, 0.015], [0.11, 0.075, 0.08, 0.12, 0]], { seg: 6, phase: 30 });
  });
  // 躯干：瘦长，披一件队伍色的短披挂(前后两片 + 披肩)
  b.bone(body).paint(C.stoneDark, { c2: C.stoneLight, ...stone });
  b.lathe([[0.4, 0.15, 0.13], [0.56, 0.2, 0.16], [0.8, 0.24, 0.18], [0.98, 0.26, 0.19], [1.04, 0.14, 0.13]], { seg: 6, phase: 30, power: 2.3 });
  b.paint(C.cloth, { ...cloth });
  b.g(X(0, 0.92, 0.175, 8, 0, 0), () => b.extrude([[-0.15, 0.06], [0.15, 0.06], [0.13, -0.38], [0, -0.52], [-0.13, -0.38]], 0.03, 0.008));
  b.g(X(0, 0.92, -0.17, -8, 0, 0), () => b.extrude([[-0.15, 0.06], [0.15, 0.06], [0.12, -0.4], [-0.12, -0.4]], 0.03, 0.008));
  b.lathe([[0.92, 0.3, 0.23], [1.0, 0.27, 0.2], [1.045, 0.15, 0.14]], { seg: 6, phase: 30, power: 2.3, cap0: false });
  b.paint(C.brass, { ...brass });
  b.g(X(0, 0.8, 0.2, 8, 0, 45), () => b.box(0, 0, 0, 0.07, 0.07, 0.03, 0.01));
  b.paint(0xffffff, lit(0.7));
  b.lathe([[0.5, 0.165, 0.14], [0.535, 0.185, 0.15]], { seg: 6, phase: 30, power: 2.3, cap0: false, cap1: false });
  // 头：一盏八角灯——铁座、八根灯柱、发光的灯室、攒尖顶
  b.bone(head).paint(C.iron, { ...iron });
  b.lathe([[1.02, 0.07, 0.07, 0, 0.02], [1.08, 0.17, 0.17, 0, 0.02], [1.11, 0.17, 0.17, 0, 0.02]], { seg: 8, phase: 22.5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    b.box(Math.cos(a) * 0.15, 1.235, 0.02 + Math.sin(a) * 0.15, 0.024, 0.26, 0.024);
  }
  b.lathe([[1.36, 0.19, 0.19, 0, 0.02], [1.4, 0.2, 0.2, 0, 0.02], [1.5, 0.1, 0.1, 0, 0.02], [1.62, 0.015, 0.015, 0, 0.02]], { seg: 8, phase: 22.5 });
  b.paint(C.brass, { ...brass });
  b.ball(0, 1.64, 0.02, 0.03, 0.035, 0.03, 0);
  b.bone(flame).paint(0xffffff, lit(0.95));
  b.lathe([[1.115, 0.13, 0.13, 0, 0.02], [1.24, 0.145, 0.145, 0, 0.02], [1.355, 0.13, 0.13, 0, 0.02]], { seg: 8, phase: 22.5 });
  // 双臂：细长，左手虚托在灯下，右手垂着
  b.sym((s) => {
    b.bone(s > 0 ? armL : armR).paint(C.stoneDark, { c2: C.stone, ...stone });
    b.ball(0.28, 0.9, 0.02, 0.085, 0.085, 0.085, 0, 40);
    b.limb([0.3, 0.9, 0.02], [0.33, 0.6, 0.06], 0.06, 0.07, { seg: 6 });
    b.paint(C.iron, { ...iron });
    b.box(0.33, 0.55, 0.07, 0.11, 0.11, 0.12, 0.03);
    b.paint(0xffffff, lit(0.6));
    b.box(0.33, 0.615, 0.065, 0.13, 0.025, 0.13);
  });
  b.bakeGrounding(1.5, 0.78, 0.95);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 2 + a.seed * 6;
    const flick = 1 + 0.05 * Math.sin(t * 5.3) + 0.03 * Math.sin(t * 9.1);
    pose.scale(flame, flick);
    out.glow = 0.9 + 0.2 * Math.sin(t * 1.7);
    switch (a.anim) {
      case 'dead': {
        const d = deathBeats(a.t);
        pose.pos(body, 0, -0.1 * d.slump - 0.4 * d.fall * d.fall, 0);
        pose.rot(body, 10 * d.slump + 50 * d.burst, 0, -14 * d.burst);
        fling(pose, head, d.burst, d.fall, -0.2, 0.5, 0.9, 150, -50);
        pose.scale(flame, Math.max(0.001, 1 - d.slump));
        fling(pose, armL, d.burst, d.fall, 0.4, 0.1, 0.6, 30, 80);
        fling(pose, armR, d.burst, d.fall, -0.4, -0.1, 0.6, -30, -80);
        pose.rot(legL, -24 * d.burst, 0, 30 * d.burst);
        pose.rot(legR, 16 * d.burst, 0, -30 * d.burst);
        out.glow = Math.max(0.02, 1 - d.slump * 1.3);
        break;
      }
      case 'move': {
        const c = a.stride * TAU;
        const s = Math.sin(c);
        pose.rot(legL, s * 32, 0, 0);
        pose.rot(legR, -s * 32, 0, 0);
        pose.pos(body, 0, Math.abs(Math.cos(c)) * 0.035, 0);
        pose.rot(body, 10, -s * 6, 0);
        // 灯随步子前后摇(滞后)
        pose.rot(head, -6 + Math.sin(c * 2 - 0.9) * 6, 0, Math.sin(c - 0.6) * 5);
        pose.rot(armL, -s * 20 - 6, 0, 4);
        pose.rot(armR, s * 20 - 6, 0, -4);
        break;
      }
      case 'attack': {
        // 双手托灯后仰蓄光 → 前倾把光弹甩出去 → 回正
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.27));
        const hit = seg(p, 0.27, 0.36);
        const rec = easeIO(seg(p, 0.5, 1));
        const back = wind * (1 - hit);
        const fwd = hit * (1 - rec);
        pose.rot(body, -16 * back + 18 * fwd, 0, 0);
        pose.pos(body, 0, 0.04 * back - 0.03 * fwd, -0.05 * back + 0.08 * fwd);
        pose.rot(head, -18 * back + 24 * fwd - 8 * bump(p, 0.44, 0.1), 0, 0);
        pose.rot(armL, -100 * wind * (1 - rec) - 30 * fwd, 0, -26 * wind * (1 - rec));
        pose.rot(armR, -100 * wind * (1 - rec) - 30 * fwd, 0, 26 * wind * (1 - rec));
        pose.scale(flame, flick * (1 + 0.5 * back - 0.25 * fwd));
        out.glow = 1 + 0.7 * back + 0.8 * bump(p, 0.36, 0.12);
        break;
      }
      case 'stunned': {
        pose.rot(body, 10 + Math.sin(t * 2.4) * 6, 0, Math.cos(t * 2.4) * 10);
        pose.rot(head, 0, Math.sin(t * 2.4) * 25, 14);
        out.glow = 0.5;
        break;
      }
      case 'airborne': {
        pose.rot(root, -24 * Math.sin(a.p * Math.PI), 0, 12);
        pose.rot(armL, -80, 0, 50);
        pose.rot(armR, -40, 0, -30);
        pose.rot(legL, -26, 0, 10);
        pose.rot(legR, 18, 0, -10);
        break;
      }
      default: {
        pose.pos(body, 0, Math.sin(t) * 0.014, 0);
        pose.rot(head, Math.sin(t * 0.8) * 3, Math.sin(t * 0.45) * 10, 0);
        pose.rot(armL, -8 + Math.sin(t) * 3, 0, 3);
        pose.rot(armR, -8 - Math.sin(t) * 3, 0, -3);
      }
    }
    const hk = hitPulse(a.hitT, 0.18);
    if (hk > 0 && a.anim !== 'dead') {
      pose.add(body, -10 * hk, 0, 0);
      pose.add(head, 16 * hk, 0, 8 * hk);
    }
  };

  return {
    key: 'minion:ranged', geometry: b.build(), rig, height: 1.7, radius: 0.45, scale: 1, stride: 1.4, triangles: b.triangleCount, deathDur: 1.1, outline: 1.2,
    attach: { chest: { joint: body, x: 0, y: 0.25, z: 0 }, head: { joint: head, x: 0, y: 0.25, z: 0 }, weapon: { joint: flame, x: 0, y: 0, z: 0.16 }, muzzle: { joint: flame, x: 0, y: 0, z: 0.16 }, core: { joint: flame, x: 0, y: 0, z: 0 } },
    blend: (_f, to) => (to === 'attack' ? 0.07 : 0.14),
    animate,
  };
}

// ───────────────────────────── 攻城兵：驮着弩炮的四足驮兽 ─────────────────────────────

export function createSiegeMinion(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 0.74, 0);
  const head = rig.add('head', body, 0, 0.84, 0.66);
  const mount = rig.add('mount', body, 0, 1.2, -0.08);
  const slide = rig.add('slide', mount, 0, 1.36, -0.08);
  const bowL = rig.add('bowL', mount, 0.1, 1.36, 0.5);
  const bowR = rig.add('bowR', mount, -0.1, 1.36, 0.5);
  const legAt: [number, number][] = [[0.42, 0.46], [-0.42, 0.46], [0.42, -0.5], [-0.42, -0.5]];
  const legs = legAt.map(([x, z], i) => rig.add(`leg${i}`, body, x, 0.66, z));
  const b = new ModelBuilder();
  b.crease = 36;

  // 四条石柱腿 + 铁蹄，膝上一道发光缝
  legs.forEach((leg, i) => {
    const [x, z] = legAt[i];
    b.bone(leg).paint(C.stoneDark, { c2: C.stone, ...stone });
    b.lathe([[0.12, 0.13, 0.15, x, z], [0.4, 0.125, 0.135, x, z], [0.74, 0.19, 0.21, x, z]], { seg: 6, phase: 30, power: 2.3 });
    b.paint(C.iron, { ...iron });
    b.lathe([[0, 0.17, 0.2, x, z + 0.02], [0.12, 0.155, 0.175, x, z], [0.15, 0.125, 0.135, x, z]], { seg: 6, phase: 30 });
    b.paint(0xffffff, lit(0.6));
    b.lathe([[0.4, 0.13, 0.14, x, z], [0.44, 0.135, 0.145, x, z]], { seg: 6, phase: 30, power: 2.3, cap0: false, cap1: false });
  });
  // 躯干：宽厚的石壳，背上搭一张队伍色的鞍毯
  b.bone(body).paint(C.stoneDark, { c2: C.stoneLight, ...stone });
  b.tube([[0, 0.72, -0.84, 0.3, 0.2], [0, 0.8, -0.6, 0.52, 0.37], [0, 0.84, 0, 0.58, 0.43], [0, 0.82, 0.5, 0.5, 0.37], [0, 0.8, 0.74, 0.32, 0.26]], { seg: 8, up: [1, 0, 0], power: 2.6 });
  b.paint(C.cloth, { ...cloth });
  b.sheet(6, 2, (u, v) => {
    const th = Math.PI * (0.02 + 0.96 * u);
    const z = -0.46 + v * 0.8;
    const k = u < 0.12 || u > 0.88 ? 1.06 : 1.03;
    return [Math.cos(th) * 0.6 * k, 0.84 + Math.sin(th) * 0.45 * k - (u < 0.1 || u > 0.9 ? 0.1 : 0), z];
  }, true, 40);
  b.paint(C.brass, { ...brass });
  b.sym(() => b.g(X(0.6, 0.74, -0.06, 0, 90, 0), () => b.extrude(star8(0.11).filter((_p, i) => i % 2 === 0), 0.03, 0.008)));
  // 头：低伏的无面兽首，一道横向发光缝，两只短角
  b.bone(head).paint(C.stone, { c2: C.stoneLight, ...stone });
  b.tube([[0, 0.84, 0.62, 0.28, 0.24], [0, 0.8, 0.9, 0.26, 0.21], [0, 0.72, 1.1, 0.17, 0.13]], { seg: 6, up: [1, 0, 0], power: 2.4 });
  b.paint(C.iron, { ...iron });
  b.g(X(0, 0.86, 1.0, -62, 0, 0), () => b.extrude([[-0.17, -0.1], [0.17, -0.1], [0.2, 0.08], [0, 0.16], [-0.2, 0.08]], 0.05, 0.015));
  b.paint(0xffffff, lit(0.9));
  b.g(X(0, 0.875, 1.03, -62, 0, 0), () => b.box(0, 0, 0, 0.24, 0.035, 0.03));
  b.paint(C.stoneLight, { c2: 0xe6ebf5, ...stone });
  b.sym(() => b.g(X(0.22, 0.96, 0.74, -40, 0, -34), () => b.crystal(0.05, 0.22, 4, 0.7, 0.1)));
  // 背上的弩炮：转座 + 弩身滑槽 + 两片弓臂 + 上弦的重矢(队伍色发光的矢头)
  b.bone(mount).paint(C.iron, { ...iron });
  b.lathe([[1.14, 0.3, 0.32, 0, -0.08], [1.24, 0.24, 0.26, 0, -0.08], [1.3, 0.14, 0.16, 0, -0.08]], { seg: 8 });
  b.paint(C.wood, { mat: MAT.leather, pattern: PATTERN.bark, patternScale: 8, patternAmt: 0.3 });
  b.box(0, 1.34, 0.06, 0.2, 0.12, 1.3, 0.03);
  b.paint(C.brass, { ...brass });
  b.box(0, 1.36, 0.6, 0.26, 0.16, 0.14, 0.03);
  b.box(0, 1.36, -0.5, 0.24, 0.16, 0.12, 0.03);
  b.sym((s) => {
    b.bone(s > 0 ? bowL : bowR).paint(C.stoneLight, { c2: C.stone, gloss: 0.5, mat: MAT.leather });
    b.tube([[0.1, 1.36, 0.52, 0.045, 0.07], [0.42, 1.38, 0.44, 0.04, 0.06], [0.72, 1.4, 0.24, 0.03, 0.045], [0.86, 1.4, 0.02, 0.016, 0.02]], { seg: 5, up: [0, 1, 0] });
    b.paint(C.cloth, { ...cloth });
    b.box(0.5, 1.39, 0.42, 0.1, 0.1, 0.1, 0.02);
  });
  b.bone(slide).paint(C.wood, { mat: MAT.leather });
  b.tube([[0, 1.44, -0.4, 0.03], [0, 1.44, 0.7, 0.03]], { seg: 5 });
  b.paint(C.cloth, { ...cloth });
  for (const rz of [0, 90]) b.g(X(0, 1.44, -0.36, 0, 0, rz), () => b.extrude([[0, 0], [0.09, -0.06], [0.09, 0.1], [0, 0.16]], 0.012, 0));
  b.paint(0xffffff, lit(0.85));
  b.g(X(0, 1.44, 0.66, 90, 0, 0), () => b.crystal(0.075, 0.42, 4, 0.7, 0.2, 1));
  b.bakeGrounding(1.6);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 1.8 + a.seed * 6;
    /** 弓臂张力：1 = 上满弦(弓臂后弯)，0 = 放松 */
    let draw = 1;
    switch (a.anim) {
      case 'dead': {
        const d = deathBeats(a.t);
        const k = d.fall * d.fall;
        pose.pos(body, 0, -0.08 * d.slump - 0.38 * k, 0);
        pose.rot(body, 6 * k, 0, 12 * k);
        legs.forEach((leg, i) => pose.rot(leg, (i < 2 ? -60 : 60) * k, 0, (i % 2 === 0 ? 46 : -46) * k));
        fling(pose, mount, d.burst, d.fall, 0.3, -0.3, 0.6, -30, 50);
        pose.rot(head, 30 * k, 0, 0);
        draw = 1 - d.burst;
        out.glow = Math.max(0.02, 1 - d.slump * 1.3);
        break;
      }
      case 'move': {
        const c = a.stride * TAU;
        const s = Math.sin(c);
        pose.rot(legs[0], s * 30, 0, 0);
        pose.rot(legs[3], s * 30, 0, 0);
        pose.rot(legs[1], -s * 30, 0, 0);
        pose.rot(legs[2], -s * 30, 0, 0);
        pose.pos(body, 0, Math.abs(Math.cos(c)) * 0.04, 0);
        pose.rot(body, Math.cos(c * 2) * 1.5, 0, s * 3);
        pose.rot(head, Math.cos(c * 2) * 4 + 4, 0, 0);
        pose.rot(mount, Math.sin(c * 2 - 0.8) * 2.5, 0, -s * 2);
        break;
      }
      case 'attack': {
        // 压低蓄势 → 放弦(弓臂回弹、重矢射出、整只后坐) → 重新上弦
        const p = strikeWarp(a.p, a.windup);
        const charge = easeOut(seg(p, 0, 0.3));
        const fire = seg(p, 0.33, 0.38);
        const rec = seg(p, 0.42, 1);
        const kick = fire * (1 - rec) * (1 - rec);
        pose.rot(mount, -12 * charge * (1 - rec) - 6 * kick, 0, 0);
        pose.rot(body, -5 * kick + 3 * charge * (1 - fire), 0, 0);
        pose.pos(body, 0, -0.06 * charge * (1 - fire) - 0.03 * kick, -0.14 * kick);
        legs.forEach((leg, i) => pose.rot(leg, (i < 2 ? 1 : -1) * 9 * kick, 0, 0));
        draw = 1 + 0.3 * charge * (1 - fire) - 1.1 * fire * (1 - easeIO(seg(p, 0.6, 0.95)));
        // 矢：射出后缩没，上弦时重新出现
        pose.scale(slide, Math.max(0.001, 1 - fire + easeIO(seg(p, 0.7, 0.95))));
        pose.pos(slide, 0, 0, 0.5 * fire * (1 - seg(p, 0.4, 0.5)));
        out.glow = 1 + 0.7 * charge * (1 - fire) + 0.8 * kick;
        break;
      }
      case 'stunned': {
        pose.rot(body, Math.sin(t * 2.6) * 4, 0, Math.cos(t * 2.6) * 6);
        pose.rot(head, 14, Math.sin(t * 2.6) * 18, 0);
        out.glow = 0.6;
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
        pose.rot(mount, Math.sin(t * 0.5) * 2, 0, 0);
        out.glow = 1 + 0.12 * Math.sin(t * 1.4);
      }
    }
    pose.rot(bowL, 0, 22 * (draw - 1), 0);
    pose.rot(bowR, 0, -22 * (draw - 1), 0);
    const hk = hitPulse(a.hitT, 0.18);
    if (hk > 0 && a.anim !== 'dead') {
      pose.add(body, 0, 0, 5 * hk);
      pose.add(head, 12 * hk, 0, 0);
    }
  };

  return {
    key: 'minion:siege', geometry: b.build(), rig, height: 1.8, radius: 0.85, scale: 1, stride: 1.9, triangles: b.triangleCount, deathDur: 1.2, outline: 1.2,
    attach: { chest: { joint: body, x: 0, y: 0.1, z: 0 }, head: { joint: head, x: 0, y: 0.1, z: 0.2 }, weapon: { joint: mount, x: 0, y: 0.24, z: 1.1 }, muzzle: { joint: mount, x: 0, y: 0.24, z: 1.1 } },
    blend: () => 0.14,
    animate,
  };
}

// ───────────────────────────── 超级兵：肩后插旗的重甲傀儡 ─────────────────────────────

export function createSuperMinion(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const hips = rig.add('hips', root, 0, 0.8, 0);
  const chest = rig.add('chest', hips, 0, 1.22, 0);
  const head = rig.add('head', chest, 0, 1.76, 0.05);
  const armL = rig.add('armL', chest, 0.58, 1.56, 0);
  const armR = rig.add('armR', chest, -0.58, 1.56, 0);
  const foreL = rig.add('foreL', armL, 0.64, 1.12, 0);
  const foreR = rig.add('foreR', armR, -0.64, 1.12, 0);
  const maul = rig.add('maul', foreR, -0.64, 0.76, 0.04);
  const legL = rig.add('legL', hips, 0.23, 0.76, 0);
  const legR = rig.add('legR', hips, -0.23, 0.76, 0);
  const flag0 = rig.add('flag0', chest, 0.3, 2.56, -0.36);
  const flag1 = rig.add('flag1', flag0, 0.68, 2.52, -0.36);
  rig.chain({ joints: [flag0, flag1], tip: [0.36, -0.03, 0], stiffness: 10, drag: 0.88, gravity: 4, maxAngle: 60, wind: 4 });
  const emblemB = rig.add('emblemB', chest, 0, 1.42, 0.42);
  const emblemR = rig.add('emblemR', chest, 0, 1.42, 0.42);
  const b = new ModelBuilder();
  b.crease = 36;

  b.sym((s) => {
    b.bone(s > 0 ? legL : legR).paint(C.stoneDark, { c2: C.stone, ...stone });
    b.lathe([[0.14, 0.16, 0.18, 0.23, 0.01], [0.46, 0.17, 0.18, 0.23, 0], [0.8, 0.21, 0.2, 0.23, 0]], { seg: 6, phase: 30, power: 2.3 });
    b.paint(C.iron, { ...iron });
    b.lathe([[0, 0.21, 0.27, 0.23, 0.05], [0.14, 0.19, 0.22, 0.23, 0.02], [0.18, 0.16, 0.17, 0.23, 0]], { seg: 6, phase: 30 });
    b.paint(0xffffff, lit(0.6));
    b.lathe([[0.46, 0.175, 0.185, 0.23, 0], [0.5, 0.18, 0.19, 0.23, 0]], { seg: 6, phase: 30, power: 2.3, cap0: false, cap1: false });
  });
  // 躯干：倒梯形重甲，腰间布裙，胸口嵌队徽，肩后一面队旗
  b.bone(hips).paint(C.stoneDark, { c2: C.stone, ...stone });
  b.lathe([[0.66, 0.24, 0.2], [0.8, 0.36, 0.28], [0.98, 0.34, 0.27], [1.06, 0.3, 0.24]], { seg: 8, power: 2.4, phase: 22.5 });
  b.paint(C.cloth, { ...cloth });
  b.g(X(0, 0.84, 0.29, 6, 0, 0), () => b.extrude([[-0.2, 0], [0.2, 0], [0.18, -0.36], [0, -0.48], [-0.18, -0.36]], 0.035, 0.01));
  b.g(X(0, 0.84, -0.28, -6, 0, 0), () => b.extrude([[-0.2, 0], [0.2, 0], [0.17, -0.34], [-0.17, -0.34]], 0.035, 0.01));
  b.sym(() => b.g(X(0.36, 0.84, 0, 0, 90, -8), () => b.extrude([[-0.14, 0], [0.14, 0], [0.11, -0.26], [-0.11, -0.26]], 0.035, 0.01)));
  b.paint(0xffffff, lit(0.7));
  b.lathe([[1.03, 0.31, 0.25], [1.08, 0.33, 0.265]], { seg: 8, power: 2.4, phase: 22.5, cap0: false, cap1: false });
  b.bone(chest).paint(C.stone, { c2: C.stoneLight, ...stone });
  b.lathe([[1.06, 0.34, 0.27], [1.2, 0.52, 0.37], [1.46, 0.62, 0.41], [1.66, 0.56, 0.37], [1.76, 0.3, 0.26]], { seg: 8, power: 2.4, phase: 22.5 });
  b.paint(C.iron, { ...iron });
  b.g(X(0, 1.42, 0.38, -6, 0, 0), () => b.extrude([[0, -0.26], [0.22, -0.12], [0.24, 0.16], [0, 0.26], [-0.24, 0.16], [-0.22, -0.12]], 0.07, 0.02));
  b.bone(emblemB).paint(0xffffff, lit(0.7));
  b.g(X(0, 1.42, 0.425, -6, 0, 0), () => b.extrude(star8(0.17), 0.03, 0));
  b.bone(emblemR).paint(0xffffff, lit(0.7));
  b.g(X(0, 1.42, 0.425, -6, 0, 0), () => flame3(b, 0.16, 0.03));
  // 旗杆与旗(旗面两节，弹簧链)
  b.bone(chest).paint(C.wood, { mat: MAT.leather });
  b.limb([0.3, 1.5, -0.34], [0.3, 2.74, -0.36], 0.03, 0.026, { seg: 5 });
  b.paint(C.brass, { ...brass });
  b.g(X(0.3, 2.72, -0.36), () => b.crystal(0.05, 0.2, 4, 0.6, 0.3));
  // 旗面朝向镜头(展开在左右方向)，俯视与正视都看得见
  b.bind((x) => (x < 0.5 ? [flag0, flag0, 1] : [flag1, flag0, Math.min(1, (x - 0.5) / 0.3)]));
  b.paint(C.cloth, { ...cloth });
  b.sheet(4, 2, (u, v) => [0.32 + u * 0.74, 2.68 - v * 0.54 * (1 - u * 0.35) - u * 0.1, -0.36 + 0.04 * Math.sin(u * 6) * v]);
  // 头：带短角的无面盔
  b.bone(head).paint(C.stoneDark, { c2: C.stoneLight, ...stone });
  b.lathe([[1.72, 0.17, 0.18, 0, 0.05], [1.82, 0.23, 0.23, 0, 0.05], [1.98, 0.22, 0.22, 0, 0.04], [2.1, 0.1, 0.11, 0, 0.02]], { seg: 6, phase: 90 });
  b.paint(C.iron, { ...iron });
  b.g(X(0, 1.9, 0.25, -4, 0, 0), () => b.extrude([[-0.14, -0.13], [0.14, -0.13], [0.16, 0.07], [0, 0.16], [-0.16, 0.07]], 0.06, 0.018));
  b.paint(0xffffff, lit(0.9));
  b.box(0, 1.89, 0.288, 0.035, 0.2, 0.02);
  b.paint(C.brass, { ...brass });
  b.sym(() => b.tube([[0.2, 1.96, 0.04, 0.05, 0.05], [0.34, 2.06, 0.02, 0.04, 0.04], [0.38, 2.22, 0.02, 0.008, 0.008]], { seg: 5 }));
  // 肩甲 + 双臂
  b.sym((s) => {
    const arm = s > 0 ? armL : armR;
    b.bone(arm).paint(C.stone, { c2: C.stoneLight, ...stone });
    b.g(X(0.66, 1.64, 0, 0, 0, -16), () => {
      b.lathe([[-0.12, 0.3, 0.28], [0, 0.31, 0.29], [0.13, 0.23, 0.21], [0.19, 0.06, 0.06]], { seg: 6, crease: 34, power: 2.4 });
      b.paint(C.brass, { ...brass });
      b.lathe([[-0.13, 0.315, 0.295], [-0.07, 0.32, 0.3]], { seg: 6, power: 2.4, cap0: false, cap1: false });
      b.paint(C.cloth, { ...cloth });
      b.g(X(0.2, -0.1, 0, 0, 90, 14), () => b.extrude([[-0.2, 0], [0.2, 0], [0.16, -0.24], [0, -0.32], [-0.16, -0.24]], 0.03, 0.008));
    });
    b.paint(C.stoneDark, { c2: C.stone, ...stone });
    b.limb([0.62, 1.54, 0], [0.64, 1.14, 0], 0.15, 0.13, { seg: 6 });
    b.bone(s > 0 ? foreL : foreR).paint(C.stone, { c2: C.stoneLight, ...stone });
    b.ball(0.64, 1.12, 0, 0.14, 0.14, 0.14, 0, 60);
    b.limb([0.64, 1.12, 0], [0.64, 0.8, 0], 0.13, 0.17, { seg: 6 });
    b.paint(C.iron, { ...iron });
    b.box(0.64, 0.7, 0.01, 0.25, 0.24, 0.27, 0.06);
    b.paint(0xffffff, lit(0.6));
    b.box(0.64, 0.835, 0.0, 0.3, 0.03, 0.3);
  });
  // 长柄锤(右手)：铁箍木柄 + 方石锤头，锤面嵌发光的晶
  b.bone(maul);
  b.g(X(-0.64, 0.72, 0.04), () => {
    b.paint(C.wood, { mat: MAT.leather, pattern: PATTERN.bark, patternScale: 8, patternAmt: 0.3 });
    b.tube([[0, 0, -0.5, 0.04], [0, 0, 1.06, 0.045]], { seg: 6 });
    b.paint(C.stoneDark, { c2: C.stoneLight, ...stone });
    b.box(0, 0, 1.24, 0.46, 0.4, 0.44, 0.07);
    b.paint(C.brass, { ...brass });
    b.box(0, 0, 1.24, 0.5, 0.14, 0.48, 0.03);
    b.tube([[0, 0, -0.52, 0.06], [0, 0, -0.44, 0.06]], { seg: 6, crease: 30 });
    b.paint(0xffffff, lit(0.75));
    b.sym(() => b.g(X(0.23, 0, 1.24, 0, 0, -90), () => b.crystal(0.1, 0.16, 4, 0.9, 0.1)));
  });
  b.bakeGrounding(2.2);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time * 1.6 + a.seed * 6;
    pose.scale(emblemB, a.team === 1 ? 0.001 : 1);
    pose.scale(emblemR, a.team === 1 ? 1 : 0.001);
    // 站姿：长柄锤扛在右肩
    pose.rot(armR, -20, 0, -10);
    pose.rot(foreR, -100, 0, 0);
    pose.rot(armL, 6, 0, 10);
    pose.rot(foreL, -20, 0, 0);
    switch (a.anim) {
      case 'dead': {
        const d = deathBeats(a.t * 0.85);
        pose.pos(hips, 0, -0.14 * d.slump - 0.46 * d.fall * d.fall, 0);
        pose.rot(hips, 10 * d.slump + 30 * d.burst, 0, 8 * d.burst);
        pose.rot(chest, 20 * d.burst, 0, -10 * d.burst);
        fling(pose, head, d.burst, d.fall, 0.2, 0.6, 1.4, 140, 30);
        fling(pose, armL, d.burst, d.fall, 0.6, 0, 1.0, 20, 90);
        fling(pose, armR, d.burst, d.fall, -0.6, 0.2, 1.0, 40, -90);
        pose.rot(foreR, -100 + 90 * d.burst, 0, 0);
        pose.rot(legL, -20 * d.burst, 0, 24 * d.burst);
        pose.rot(legR, 14 * d.burst, 0, -26 * d.burst);
        out.glow = Math.max(0.02, 1 - d.slump * 1.3);
        break;
      }
      case 'move': {
        const c = a.stride * TAU;
        const s = Math.sin(c);
        pose.rot(legL, s * 30, 0, 0);
        pose.rot(legR, -s * 30, 0, 0);
        pose.pos(hips, 0, Math.abs(Math.cos(c)) * 0.06 - 0.02, 0);
        pose.rot(hips, 7, -s * 6, s * 2);
        pose.rot(chest, 2 + Math.cos(c * 2) * 2, s * 8, 0);
        pose.rot(armL, 6 - s * 22, 0, 10);
        pose.rot(maul, Math.sin(c * 2 - 1) * 4, 0, 0);
        break;
      }
      case 'attack': {
        // 双手举锤过顶(预备) → 砸落(过冲，身体跟上) → 拖回肩上
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.26));
        const hit = seg(p, 0.26, 0.36);
        const rec = easeIO(seg(p, 0.55, 1));
        const up = wind * (1 - hit);
        const down = hit * (1 - rec);
        const over = bump(p, 0.42, 0.1);
        pose.rot(armR, -20 - 140 * up - 44 * down + 10 * over, 0, -10 - 10 * up);
        pose.rot(foreR, -100 + 50 * up + 84 * down, 0, 0);
        pose.rot(armL, 6 - 120 * up - 40 * down, 0, 10 - 30 * up - 20 * down);
        pose.rot(foreL, -20 - 60 * up, 0, 0);
        pose.rot(maul, -30 * up + 34 * down, 0, 0);
        pose.rot(chest, -14 * up + 24 * down, 14 * up - 10 * down, 0);
        pose.rot(hips, -4 * up + 10 * down, 0, 0);
        pose.pos(hips, 0, 0.05 * up - 0.12 * down, 0.14 * down);
        pose.rot(legL, 8 * up - 20 * down, 0, 0);
        pose.rot(legR, -6 * up + 14 * down, 0, 0);
        out.glow = 1 + 0.3 * up + 0.8 * bump(p, 0.36, 0.16);
        break;
      }
      case 'stunned': {
        pose.rot(hips, 6 + Math.sin(t * 2.6) * 4, 0, Math.cos(t * 2.6) * 6);
        pose.rot(head, 16, Math.sin(t * 2.6) * 20, 0);
        out.glow = 0.6;
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
    const hk = hitPulse(a.hitT, 0.18);
    if (hk > 0 && a.anim !== 'dead') {
      pose.add(chest, -8 * hk, 0, 0);
      pose.add(head, 10 * hk, 0, 0);
    }
  };

  return {
    key: 'minion:super', geometry: b.build(), rig, height: 2.5, radius: 0.9, scale: 1, stride: 2.4, triangles: b.triangleCount, deathDur: 1.3, outline: 1.3,
    attach: { chest: { joint: chest, x: 0, y: 0.15, z: 0 }, head: { joint: head, x: 0, y: 0.2, z: 0 }, weapon: { joint: maul, x: 0, y: 0, z: 1.3 }, muzzle: { joint: maul, x: 0, y: 0, z: 1.3 }, handL: { joint: foreL, x: 0, y: -0.4, z: 0 }, handR: { joint: foreR, x: 0, y: -0.4, z: 0 } },
    blend: (_f, to) => (to === 'attack' ? 0.08 : 0.15),
    animate,
  };
}
