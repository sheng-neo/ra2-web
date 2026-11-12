/**
 * 小野怪 · 荧翅蛾(glimwing，一组两只，远程)：悬停在一米多高的大蛾。两对翅——前翅三角形，后翅带飘带状尾突——
 * 每片翅上一枚发光眼斑；纺锤形的绒毛身体，两根羽状触角。俯视是一个展开的蝴蝶结。
 */
import { MAT, ModelBuilder, PATTERN, X, lerp, smooth } from '../kit';
import { hitPulse } from '../quadruped';
import { type Pose, Rig, bump, chainSkin, easeIO, easeOut, seg, strikeWarp } from '../rig';
import type { AnimInput, AnimOutput, ModelDef } from '../types';

const TAU = Math.PI * 2;

const WING = 0x1f5a66;
const WING_EDGE = 0x6fe8d8;
const SPOT = 0xffd870;
const SPOT_RING = 0xff8a5a;
const BODY = 0xe8e0c8;
const BAND = 0x6a5a7a;
const ANTENNA = 0xc8fff0;
const EYE = 0x1a2a3a;

export function createGlimMoth(): ModelDef {
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, 1.15, 0.08);
  const abd1 = rig.add('abd1', body, 0, 1.12, -0.14);
  const abd2 = rig.add('abd2', abd1, 0, 1.08, -0.38);
  const head = rig.add('head', body, 0, 1.2, 0.3);
  const ant = [1, -1].map((s) => rig.add(`ant${s}`, head, s * 0.07, 1.3, 0.4));
  const fw = [1, -1].map((s) => rig.add(`fw${s}`, body, s * 0.1, 1.22, 0.14));
  const hw = [1, -1].map((s) => rig.add(`hw${s}`, body, s * 0.1, 1.18, -0.04));
  const tails = [1, -1].map((s) => {
    const t0 = rig.add(`tail${s}a`, hw[s > 0 ? 0 : 1], s * 0.6, 1.14, -0.84);
    const t1 = rig.add(`tail${s}b`, t0, s * 0.66, 1.1, -1.14);
    rig.chain({ joints: [t0, t1], tip: [s * 0.04, -0.04, -0.3], stiffness: 9, drag: 0.9, gravity: 4, maxAngle: 70, wind: 2 });
    return [t0, t1];
  });
  const b = new ModelBuilder();
  b.crease = 60;

  // ── 身体：绒毛胸 + 带环纹的腹 ──
  const fuzz = { mat: MAT.fur, pattern: PATTERN.fur, patternScale: 14, patternAmt: 0.5, grain: 0.06 } as const;
  b.bone(body).paint(BODY, { c2: 0xfff8e4, by: (_x, _y, _z, _g, _nx, ny) => smooth(-0.2, 0.8, ny), ...fuzz });
  b.ball(0, 1.16, 0.1, 0.17, 0.16, 0.23, 1);
  // 颈毛：一圈外翻的绒
  b.paint(0xfff8e4, { ...fuzz });
  b.g(X(0, 1.19, 0.2, 90, 0, 0), () => b.lathe([[0, 0.15], [0.07, 0.23], [0.1, 0.11]], { seg: 9, shape: (th) => 1 + 0.14 * Math.sin(th * 9) }));
  const abdSkin = chainSkin(rig, [body, abd1, abd2], 0.8, [0, 1.04, -0.62]);
  const bands = (_x: number, _y: number, z: number): number => (Math.sin((z + 0.02) * 30) > 0.25 ? 1 : 0);
  b.bind(abdSkin).paint(BODY, { c2: BAND, by: bands, ...fuzz });
  b.tube(
    [
      [0, 1.14, -0.04, 0.17, 0.16],
      [0, 1.12, -0.12, 0.165, 0.16],
      [0, 1.115, -0.2, 0.16, 0.155],
      [0, 1.105, -0.28, 0.15, 0.145],
      [0, 1.095, -0.36, 0.135, 0.13],
      [0, 1.08, -0.44, 0.115, 0.11],
      [0, 1.065, -0.52, 0.085, 0.08],
      [0, 1.045, -0.62, 0.02, 0.02],
    ],
    { seg: 8, up: [1, 0, 0], cap0: false },
  );
  // 收拢的细足
  b.bone(body).paint(BAND, { mat: MAT.leather });
  b.sym(() => {
    for (let i = 0; i < 3; i++) b.tube([[0.1, 1.04, 0.2 - i * 0.12, 0.02], [0.17, 0.92, 0.26 - i * 0.13, 0.014], [0.13, 0.84, 0.3 - i * 0.1, 0.004]], { seg: 3 });
  });
  // ── 头：复眼与羽状触角 ──
  b.bone(head).paint(BODY, { ...fuzz });
  b.ball(0, 1.2, 0.34, 0.12, 0.115, 0.12, 1);
  b.sym((s) => {
    b.paint(EYE, { c2: 0x3a6a8a, gloss: 1, mat: MAT.crystal });
    b.ball(0.08, 1.215, 0.4, 0.048, 0.052, 0.045, 1);
    b.bone(ant[s > 0 ? 0 : 1]).paint(ANTENNA, { c2: 0xf0fff8, glow: 0.15, glow2: 0.45, mat: MAT.cloth, line: 1 });
    // 羽状：中轴 + 两侧的羽枝，做成一片叶形薄板
    b.tube([[0.07, 1.3, 0.4, 0.012], [0.16, 1.48, 0.56, 0.01], [0.3, 1.56, 0.78, 0.004]], { seg: 3 });
    b.sheet(4, 1, (u, v) => {
      const c = [lerp(0.08, 0.3, u), lerp(1.32, 1.56, Math.sin(u * 1.4)), lerp(0.42, 0.78, u)];
      const w = 0.085 * Math.sin(Math.min(1, u * 1.15) * Math.PI) * (1 + 0.2 * Math.sin(u * 30));
      return [c[0] + (v - 0.5) * 2 * w * 0.8, c[1] + (v - 0.5) * 2 * w * 0.2, c[2] - (v - 0.5) * 2 * w * 0.5];
    });
    b.bone(head);
  });

  // ── 翅：双面薄片，翅根深、翅缘亮；每片一枚发光眼斑 ──
  const wingPaint = (): void => {
    b.paint(WING, { c2: WING_EDGE, glow: 0.03, glow2: 0.3, mat: MAT.cloth, pattern: PATTERN.vein, patternScale: 8, patternAmt: 0.6, by: (x, _y, _z, g) => Math.max(g * g, smooth(0.75, 1.3, Math.abs(x))) });
  };
  const eyeSpot = (x: number, y: number, z: number, r: number): void => {
    // 薄圆片略厚于翅面，正反两面都看得到
    b.paint(SPOT_RING, { glow: 0.45, mat: MAT.crystal, line: 0 });
    b.g(X(x, y, z), () => b.lathe([[-0.012, r], [0.012, r]], { seg: 8 }));
    b.paint(SPOT, { glow: 0.8, mat: MAT.crystal, line: 0 });
    b.g(X(x, y, z), () => b.lathe([[-0.02, r * 0.6], [0.02, r * 0.6]], { seg: 8 }));
    b.paint(EYE, { mat: MAT.crystal, line: 0 });
    b.g(X(x, y, z), () => b.lathe([[-0.026, r * 0.24], [0.026, r * 0.24]], { seg: 6 }));
  };
  b.sym((s) => {
    const i = s > 0 ? 0 : 1;
    // 前翅：三角形，前缘微弓
    b.bone(fw[i]);
    wingPaint();
    b.sheet(5, 3, (u, v) => {
      // u：翅根 → 翅尖；v：前缘 → 后缘
      const lead = [lerp(0.1, 1.36, u), 1.22 + 0.1 * Math.sin(u * Math.PI) + 0.05 * u, lerp(0.2, 0.7, Math.pow(u, 0.7))];
      const trail = [lerp(0.1, 1.02, u), 1.2 + 0.03 * u, lerp(0.02, -0.3, u) + 0.08 * Math.sin(u * Math.PI * 2.5) * u];
      return [lerp(lead[0], trail[0], v), lerp(lead[1], trail[1], v) - 0.04 * Math.sin(v * Math.PI), lerp(lead[2], trail[2], v)];
    });
    // 前缘的翅脉
    b.paint(WING, { c2: WING_EDGE, mat: MAT.leather });
    b.tube([[0.1, 1.23, 0.2, 0.022], [0.76, 1.33, 0.54, 0.016], [1.36, 1.275, 0.7, 0.005]], { seg: 4 });
    eyeSpot(0.84, 1.275, 0.24, 0.15);
    // 后翅：圆润，外后角拖出尾突
    b.bone(hw[i]);
    wingPaint();
    b.sheet(4, 3, (u, v) => {
      const lead = [lerp(0.1, 1.0, u), 1.19 + 0.03 * u, lerp(-0.02, -0.34, u)];
      const trail = [lerp(0.08, 0.6, u), 1.15, lerp(-0.2, -0.86, Math.sin((u * Math.PI) / 2))];
      return [lerp(lead[0], trail[0], v) + 0.08 * Math.sin(v * Math.PI) * u, lerp(lead[1], trail[1], v) - 0.03 * Math.sin(v * Math.PI), lerp(lead[2], trail[2], v)];
    });
    eyeSpot(0.6, 1.178, -0.42, 0.11);
    // 尾突：两节飘带(弹簧链)
    b.bind(chainSkin(rig, tails[i], 0.8, [s * 0.7, 1.06, -1.44]));
    b.paint(WING_EDGE, { c2: 0xe8fff8, glow: 0.3, glow2: 0.6, mat: MAT.cloth, line: 1 });
    b.sheet(1, 4, (u, v) => {
      const w = 0.06 * (1 - v * 0.75) + (v > 0.8 ? 0.05 * (v - 0.8) * 5 : 0);
      return [0.6 + 0.1 * v + (u - 0.5) * 2 * w, 1.14 - 0.08 * v, -0.84 - 0.6 * v];
    });
  });
  b.bakeGrounding(1.6, 0.85, 1);

  const animate = (pose: Pose, a: AnimInput, out: AnimOutput): void => {
    const t = a.time + a.seed * 6.3;
    const alert = (a.mode & 2) !== 0;
    let hz = alert ? 7 : 4;
    let amp = 1;
    let fold = 0;
    let hover = Math.sin((t * TAU) / 1.6) * 0.12;
    let glow = 1 + 0.15 * Math.sin(t * 3) + (alert ? 0.3 : 0);
    // 两只个体的色相一冷一暖
    out.tint = 0.1;
    out.tintColor = a.seed > 0.5 ? 0x9fe8ff : 0xc8ffb0;

    switch (a.anim) {
      case 'dead': {
        // 停扑，像落叶一样旋转飘落 → 翅膀平摊 → 眼斑熄灭
        const d = a.t;
        const fall = easeIO(seg(d, 0.05, 0.8));
        amp = 1 - seg(d, 0, 0.25);
        hover *= amp;
        fold = -0.25 * fall;
        pose.pos(root, Math.sin(fall * 7) * 0.3 * (1 - fall), -1.05 * fall, 0);
        pose.rot(root, 12 * Math.sin(fall * 9) * (1 - fall), fall * 300, 18 * Math.sin(fall * 8 + 1) * (1 - fall));
        pose.rot(abd1, 14 * fall, 0, 0);
        glow = Math.max(0.03, 1 - seg(d, 0.5, 1.0));
        out.tint = 0.1 + 0.4 * seg(d, 0.6, 1.1);
        out.tintColor = 0x8890a0;
        break;
      }
      case 'attack': {
        // 后仰收翅 → 猛扇前翅，抖出一团磷粉弹
        const p = strikeWarp(a.p, a.windup);
        const wind = easeOut(seg(p, 0, 0.3));
        const hit = seg(p, 0.3, 0.38);
        const rec = easeIO(seg(p, 0.5, 1));
        const back = wind * (1 - hit);
        const fan = hit * (1 - rec);
        pose.rot(body, -26 * back + 18 * fan, 0, 0);
        pose.pos(root, 0, 0.14 * back, -0.2 * back + 0.26 * fan);
        amp = 1 - 0.85 * Math.max(back, fan);
        fold = 0.75 * back - 0.5 * fan;
        glow += 0.4 * back + 0.8 * bump(p, 0.36, 0.14);
        break;
      }
      case 'move': {
        pose.rot(body, 20, 0, 0);
        hz = 5.5;
        break;
      }
      case 'stunned': {
        pose.rot(root, 0, 0, Math.sin(t * 8) * 12);
        pose.rot(head, 20, Math.sin(t * 7) * 20, 0);
        hover -= 0.3;
        amp = 0.5;
        break;
      }
      case 'airborne': {
        pose.rot(root, -30 * Math.sin(a.p * Math.PI), 0, 20);
        fold = 0.4;
        break;
      }
      default: {
        if (a.spawnT >= 0) {
          // 出生：从崖壁上的灯花里飞出，沿螺旋线落到位
          const s = a.spawnT / 1.0;
          const k = 1 - easeOut(seg(s, 0, 0.9));
          const ang = k * 5.5 + a.seed * 3;
          pose.pos(root, Math.sin(ang) * 1.6 * k, 1.9 * k, Math.cos(ang) * 1.6 * k - 0.8 * k);
          pose.rot(root, 0, (-ang * 180) / Math.PI + 90 * k, -28 * k);
          hz = 7;
          glow += 0.6 * k;
        } else {
          pose.rot(body, Math.sin(t * 0.9) * 4, Math.sin(t * 0.5) * 8, 0);
          pose.rot(head, 0, Math.sin(t * 0.7 + 1) * 14, 0);
        }
      }
    }
    // 受击：被掀退半个身位，翻半圈再稳住
    const hk = hitPulse(a.hitT, 0.3);
    if (hk > 0 && a.anim !== 'dead') {
      pose.move(root, 0, 0.1 * hk, -0.4 * hk);
      pose.add(root, -50 * hk, 0, (a.seed > 0.5 ? 1 : -1) * 40 * hk);
    }
    pose.move(root, 0, hover, 0);
    // 扑翅：前后翅错相；fold > 0 收拢上举，< 0 平摊下垂
    const ph = t * hz * TAU;
    const f1 = Math.sin(ph) * amp;
    const f2 = Math.sin(ph - 0.8) * amp;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      pose.rot(fw[i], 0, s * -12 * fold, s * (10 + f1 * 40 + fold * 60));
      pose.rot(hw[i], 0, s * 10 * fold, s * (4 + f2 * 32 + fold * 50));
      pose.rot(ant[i], Math.sin(t * 2.3 + i) * 8 - 10 * fold, s * Math.sin(t * 1.7 + i * 2) * 8, 0);
    }
    pose.add(body, -f1 * 3, 0, 0);
    pose.add(abd1, 6 + Math.sin(t * 2.1) * 5 + f1 * 3, 0, 0);
    pose.add(abd2, 8 + Math.sin(t * 2.1 - 0.7) * 6, 0, 0);
    out.glow = glow;
  };

  return {
    key: 'monster:glimwing',
    geometry: b.build(),
    rig,
    height: 1.9,
    radius: 1.05,
    scale: 0.86,
    stride: 1.5,
    triangles: b.triangleCount,
    deathDur: 1.2,
    spawnDur: 1.0,
    outline: 1.3,
    attach: {
      chest: { joint: body, x: 0, y: 0, z: 0 },
      head: { joint: head, x: 0, y: 0.08, z: 0.1 },
      muzzle: { joint: head, x: 0, y: -0.04, z: 0.26 },
      weapon: { joint: head, x: 0, y: -0.04, z: 0.26 },
      wingL: { joint: fw[0], x: 1.2, y: 0.05, z: 0.5 },
      wingR: { joint: fw[1], x: -1.2, y: 0.05, z: 0.5 },
      tail: { joint: abd2, x: 0, y: -0.04, z: -0.24 },
    },
    blend: (_f, to) => (to === 'attack' ? 0.08 : 0.14),
    animate,
  };
}
