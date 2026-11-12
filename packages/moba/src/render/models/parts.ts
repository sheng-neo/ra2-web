/**
 * 英雄建模的通用部件与蒙皮辅助：躯干的分段混合绑定、沿弹簧链的混合绑定、头/脸/发盖/手/靴/布条等常用零件。
 * 只放「多个英雄都会用到」的东西；各英雄的服饰与武器在各自文件里。
 */
import type { Human } from './humanoid';
import { type Col, type ModelBuilder, type SoftBind, X, lerp, sat } from './kit';

/** 躯干沿高度在 髋→腰→胸 之间线性混合：弯腰/扭身时腰线不折断 */
export function torsoBind(h: Human): SoftBind {
  const J = h.J;
  const d = h.d;
  const knots: [number, number][] = [
    [d.pelvisY + 0.02, J.hips],
    [d.spineY + 0.04, J.spine],
    [d.chestY + 0.02, J.chest],
  ];
  return (_x, y) => {
    if (y <= knots[0][0]) return [J.hips, J.hips, 1];
    for (let i = 1; i < knots.length; i++) {
      if (y <= knots[i][0]) {
        const t = (y - knots[i - 1][0]) / (knots[i][0] - knots[i - 1][0]);
        return [knots[i - 1][1], knots[i][1], 1 - t];
      }
    }
    return [J.chest, J.chest, 1];
  };
}

/**
 * 沿一条弹簧链做混合绑定。points = 链上各关节的绑定位置 + 末端点(比 joints 多一个)。
 * 顶点投影到折线上：骨段中部完全跟随该段，靠近关节处与相邻段各占一半。
 * anchor 给出时，第一段的前半部分与锚点关节混合(布料根部贴身)。
 */
export function chainBind(joints: number[], points: number[][], anchor = -1): SoftBind {
  const m = joints.length;
  return (x, y, z) => {
    let best = 0;
    let bestT = 0;
    let bestD = Infinity;
    for (let k = 0; k < m; k++) {
      const a = points[k];
      const b = points[k + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const l2 = dx * dx + dy * dy + dz * dz || 1e-6;
      const raw = ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2;
      const t = sat(raw);
      const px = a[0] + dx * t - x;
      const py = a[1] + dy * t - y;
      const pz = a[2] + dz * t - z;
      // 落在线段延长线之外的点略作惩罚，避免被相邻但不相连的段抢走
      const dist = px * px + py * py + pz * pz + (raw < 0 || raw > 1 ? 1e-4 : 0);
      if (dist < bestD) {
        bestD = dist;
        best = k;
        bestT = t;
      }
    }
    if (bestT >= 0.5) {
      if (best === m - 1) return [joints[best], joints[best], 1];
      return [joints[best], joints[best + 1], 1 - (bestT - 0.5)];
    }
    if (best === 0) {
      if (anchor < 0) return [joints[0], joints[0], 1];
      return [joints[0], anchor, 0.5 + bestT];
    }
    return [joints[best], joints[best - 1], 0.5 + bestT];
  };
}

/** 折线上按总参数 v∈[0,1](各段等权)取点 */
export function polyAt(pts: number[][], v: number): number[] {
  const k = pts.length - 1;
  const f = sat(v) * k;
  const i = Math.min(k - 1, Math.floor(f));
  const t = f - i;
  return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t), lerp(pts[i][2], pts[i + 1][2], t)];
}

export interface StripOpts {
  /** 半宽随 v 的变化 */
  width: (v: number) => number;
  /** 宽度方向(单位向量)。默认 +X */
  axis?: [number, number, number];
  /** 垂直于布面的鼓起方向与幅度：中线向该方向拱出 */
  bow?: [number, number, number];
  nu?: number;
  nv?: number;
  /** 末端造型：swallow = 燕尾(中间短两边长)，point = 收尖，flat = 平齐 */
  tail?: 'swallow' | 'point' | 'flat';
  /** 末端造型的强度(沿折线方向的位移，米) */
  tailLen?: number;
  /** 布面波纹幅度(沿 bow 方向) */
  wave?: number;
}

/** 沿折线铺一条双面布带(披巾/下摆/飘带)。调用前先设置绑定与颜色 */
export function strip(b: ModelBuilder, pts: number[][], o: StripOpts): void {
  const ax = o.axis ?? [1, 0, 0];
  const bow = o.bow ?? [0, 0, 0];
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  let dx = last[0] - prev[0];
  let dy = last[1] - prev[1];
  let dz = last[2] - prev[2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;
  const tl = o.tailLen ?? 0.12;
  b.sheet(o.nu ?? 4, o.nv ?? 8, (u, v) => {
    const p = polyAt(pts, v);
    const uu = (u - 0.5) * 2;
    const w = o.width(v);
    const arch = 1 - uu * uu;
    const wv = (o.wave ?? 0) * Math.sin(v * 9 + uu * 1.7);
    let tail = 0;
    if (v > 0.8 && o.tail && o.tail !== 'flat') {
      const k = (v - 0.8) / 0.2;
      tail = o.tail === 'swallow' ? -k * (1 - Math.abs(uu)) * tl : -k * Math.abs(uu) * tl;
    }
    return [
      p[0] + ax[0] * uu * w + bow[0] * (arch + wv) + dx * tail,
      p[1] + ax[1] * uu * w + bow[1] * (arch + wv) + dy * tail,
      p[2] + ax[2] * uu * w + bow[2] * (arch + wv) + dz * tail,
    ];
  });
}

// ───────────── 头 ─────────────

/** 头部轮廓(相对头部中心)：[dy, rx, rz, oz]，上宽下窄，下巴略前探 */
const HEAD_PROFILE: number[][] = [
  [-0.25, 0.035, 0.035, 0.075],
  [-0.215, 0.1, 0.095, 0.052],
  [-0.15, 0.168, 0.162, 0.026],
  [-0.06, 0.214, 0.208, 0.008],
  [0.03, 0.236, 0.232, 0],
  [0.12, 0.23, 0.234, -0.008],
  [0.19, 0.192, 0.202, -0.014],
  [0.235, 0.12, 0.13, -0.018],
  [0.256, 0.02, 0.02, -0.02],
];

export interface HeadShape {
  /** 头部中心高度(模型空间) */
  cy: number;
  /** 尺寸倍率 */
  s: number;
  /** 某高度(相对中心的 dy)处的截面 [rx, rz, oz] */
  ring(dy: number): [number, number, number];
  /** 头表面在 (x, y) 处朝前的 z */
  surf(x: number, y: number): number;
}

/** 头：一体的回转体(带下颌收窄)。调用后可用返回的 HeadShape 摆五官与头发 */
export function head(b: ModelBuilder, h: Human, skin: Col, s = 1, cyOff = 0.25): HeadShape {
  const cy = h.d.headY + cyOff * s;
  // 皮肤带一点自发光：脸不随朝向忽明忽暗，俯视角下也总是亮的(二次元式的平光脸)
  b.bone(h.J.head).paint(skin, { ao: 0.82, ao2: 1, glow: 0.07 });
  b.lathe(HEAD_PROFILE.map((r) => [cy + r[0] * s, r[1] * s, r[2] * s, 0, r[3] * s]), { seg: 14, crease: 180 });
  const ring = (dy: number): [number, number, number] => {
    const y = dy / s;
    const P = HEAD_PROFILE;
    if (y <= P[0][0]) return [P[0][1] * s, P[0][2] * s, P[0][3] * s];
    for (let i = 1; i < P.length; i++) {
      if (y <= P[i][0]) {
        const t = (y - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
        return [lerp(P[i - 1][1], P[i][1], t) * s, lerp(P[i - 1][2], P[i][2], t) * s, lerp(P[i - 1][3], P[i][3], t) * s];
      }
    }
    const l = P[P.length - 1];
    return [l[1] * s, l[2] * s, l[3] * s];
  };
  const surf = (x: number, y: number): number => {
    const r = ring(y - cy);
    return r[2] + r[1] * Math.sqrt(Math.max(0, 1 - (x / r[0]) ** 2));
  };
  return { cy, s, ring, surf };
}

export interface HairOpts {
  c: Col;
  c2?: Col;
  /** 发层厚度 */
  thick?: number;
  /** 发际线：给定「与正前方的夹角 φ∈[0,π]」返回该方向上头发覆盖到的最低高度(相对头中心的 dy，按未缩放头部计) */
  line: (phi: number) => number;
  gloss?: number;
}

/**
 * 贴头的发盖：与头同形、略大一圈的回转体；发际线以下的部分缩进头里(不可见)，
 * 所以发际线的形状完全由 line(φ) 决定(美人尖/鬓角/后颈)。
 */
export function hairCap(b: ModelBuilder, h: Human, hd: HeadShape, o: HairOpts): void {
  const s = hd.s;
  const th = (o.thick ?? 0.022) * s;
  b.bone(h.J.head).paint(o.c, { c2: o.c2, gloss: o.gloss ?? 0.25, ao: 0.85, ao2: 1 });
  const ys = [-0.2, -0.13, -0.06, 0.0, 0.06, 0.12, 0.17, 0.215, 0.245, 0.262];
  const prof = ys.map((dy) => {
    const r = hd.ring(dy * s);
    const top = dy > 0.25 ? 0.2 : 1;
    return [hd.cy + dy * s + (dy > 0.2 ? th * 0.6 : 0), r[0] + th * top, r[1] + th * top, 0, r[2] - th * 0.2];
  });
  b.lathe(prof, {
    seg: 14,
    crease: 180,
    cap0: false,
    shape: (a, k) => {
      // 回转体的 0 角在 +X，正前方(+Z)是 90°
      let phi = Math.abs(a - Math.PI / 2);
      if (phi > Math.PI) phi = Math.PI * 2 - phi;
      return ys[k] >= o.line(phi) ? 1 : 0.8;
    },
  });
}

export interface FaceOpts {
  iris: Col;
  irisGlow?: number;
  brow: Col;
  /** 眉毛内端下压的角度(度)：越大越凌厉 */
  browTilt?: number;
  /** 眼睛半宽 / 半高 */
  eyeW?: number;
  eyeH?: number;
  /** 外眼角上挑(度) */
  slant?: number;
  /** 睫毛/上眼线厚度 */
  lash?: number;
  lip?: Col;
  /** 两眼间距系数 */
  spread?: number;
}

/** 五官：眼(眼白+虹膜+瞳孔+高光+上眼线)、眉、嘴。全部贴着头表面，不参与描边 */
export function face(b: ModelBuilder, h: Human, hd: HeadShape, o: FaceOpts): void {
  const s = hd.s;
  const ey = hd.cy - 0.025 * s;
  const ex = 0.098 * s * (o.spread ?? 1);
  const ew = (o.eyeW ?? 0.05) * s;
  const eh = (o.eyeH ?? 0.045) * s;
  const r = hd.ring(ey - hd.cy);
  // 表面法线的偏航：让眼睛贴着脸的弧度
  const zOn = r[1] * Math.sqrt(Math.max(0, 1 - (ex / r[0]) ** 2));
  const yaw = (Math.atan2(ex / (r[0] * r[0]), zOn / (r[1] * r[1])) * 180) / Math.PI;
  b.bone(h.J.head);
  b.sym(() => {
    b.g(X(ex, ey, r[2] + zOn - 0.004 * s, 0, yaw * 0.8, o.slant ?? 4), () => {
      b.paint(0xfbf4ec, { line: 0 });
      b.ball(0, 0, 0, ew, eh, 0.012 * s, 1);
      b.paint(o.iris, { glow: o.irisGlow ?? 0.2, line: 0 });
      b.ball(-ew * 0.1, -eh * 0.04, 0.006 * s, ew * 0.68, eh * 0.9, 0.009 * s, 1);
      b.paint(0x140d12, { line: 0 });
      b.ball(-ew * 0.1, -eh * 0.08, 0.01 * s, ew * 0.32, eh * 0.48, 0.007 * s, 1);
      b.paint(0xffffff, { glow: 0.5, line: 0 });
      b.ball(ew * 0.16, eh * 0.36, 0.014 * s, ew * 0.24, eh * 0.24, 0.004 * s, 0);
      // 上眼线：压住眼白上缘，眼神才有力
      b.paint(o.brow, { line: 0 });
      const lash = (o.lash ?? 0.014) * s;
      b.box(0, eh * 0.9, 0.008 * s, ew * 2.25, lash, 0.016 * s, lash * 0.3);
      b.g(X(ew * 1.05, eh * 0.75, 0.006 * s, 0, 0, 38), () => b.box(0, 0, 0, ew * 0.5, lash * 0.9, 0.014 * s, lash * 0.3));
    });
    // 眉
    const by = ey + eh + 0.04 * s;
    b.paint(o.brow, { line: 0 });
    b.g(X(ex + 0.006 * s, by, hd.surf(ex, by) + 0.003 * s, -14, yaw * 0.7, o.browTilt ?? 10), () => b.box(0, 0, 0, ew * 2.3, 0.018 * s, 0.016 * s, 0.006 * s));
  });
  if (o.lip !== undefined) {
    const my = hd.cy - 0.145 * s;
    b.paint(o.lip, { line: 0 });
    b.g(X(0, my, hd.surf(0, my) + 0.001, -8, 0, 0), () => b.box(0, 0, 0, 0.06 * s, 0.012 * s, 0.012 * s, 0.004 * s));
  }
}

/** 握拳的手(手套)：绑定到手关节 */
export function fist(b: ModelBuilder, h: Human, side: 1 | -1, r = 0.07): void {
  const d = h.d;
  b.bone(side > 0 ? h.J.handL : h.J.handR);
  b.g(X(side * d.shoulderX, d.handY + 0.01, 0.005), () => b.box(0, 0, 0, r * 1.75, r * 2.0, r * 2.15, r * 0.6, 60));
}

export interface BootOpts {
  /** 靴筒顶部高度 */
  top: number;
  rTop: number;
  rAnkle: number;
  /** 脚掌长度(脚踝向前) */
  len: number;
  seg?: number;
  /** 脚尖上翘 */
  toe?: number;
}

/** 靴：靴筒(绑小腿) + 脚掌(绑脚)。调用前先 paint 靴子颜色 */
export function boot(b: ModelBuilder, h: Human, side: 1 | -1, o: BootOpts): void {
  const d = h.d;
  const J = h.J;
  const x = side * d.hipX;
  b.bone(side > 0 ? J.shinL : J.shinR);
  b.lathe(
    [
      [d.ankleY - 0.03, o.rAnkle * 1.05, o.rAnkle * 1.12, x, 0],
      [d.ankleY + 0.07, o.rAnkle, o.rAnkle * 1.05, x, 0],
      [lerp(d.ankleY, o.top, 0.62), lerp(o.rAnkle, o.rTop, 0.7), lerp(o.rAnkle, o.rTop, 0.7), x, 0],
      [o.top, o.rTop, o.rTop, x, 0],
      [o.top + 0.005, o.rTop * 0.8, o.rTop * 0.8, x, 0],
    ],
    { seg: o.seg ?? 8 },
  );
  b.bone(side > 0 ? J.footL : J.footR);
  // 脚掌：从脚跟到脚尖的扁管
  const r = o.rAnkle;
  const toe = o.toe ?? 0.02;
  b.tube(
    [
      [x, 0.055, -r * 1.3, r * 0.8, 0.05],
      [x, 0.07, -r * 0.4, r * 1.08, 0.07],
      [x, 0.065, o.len * 0.45, r * 1.2, 0.065],
      [x, 0.055 + toe * 0.4, o.len * 0.85, r * 1.05, 0.052],
      [x, 0.05 + toe, o.len, r * 0.6, 0.034],
    ],
    { seg: 8, up: [1, 0, 0] },
  );
}

/** 一圈金属饰环(绕 Y 轴)。截面为菱形，省面数又有硬朗的高光 */
export function trim(b: ModelBuilder, x: number, y: number, z: number, rx: number, rz: number, w = 0.014, hgt = 0.02, seg = 10): void {
  b.g(X(x, y, z, 0, 0, 0, 1, 1, rz / rx), () => b.torus(rx, w, hgt, seg, 4, { crease: 30 }));
}
