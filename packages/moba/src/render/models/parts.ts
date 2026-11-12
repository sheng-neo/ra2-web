/**
 * 英雄建模的通用部件与蒙皮辅助：躯干的分段混合绑定、沿弹簧链的混合绑定、头/脸/发盖/手/靴/布条等常用零件。
 * 只放「多个英雄都会用到」的东西；各英雄的服饰与武器在各自文件里。
 */
import type { Human } from './humanoid';
import { type Col, MAT, type ModelBuilder, type SoftBind, X, lerp, sat } from './kit';

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

/**
 * 头：一体的回转体(带下颌收窄)。调用后可用返回的 HeadShape 摆五官与头发。
 * jaw > 1 时下半张脸加宽(方下巴的武将；配合 beard() 使用时胡须的底盘也更宽)，默认 1 与旧模型一致。
 */
export function head(b: ModelBuilder, h: Human, skin: Col, s = 1, cyOff = 0.25, jaw = 1): HeadShape {
  const cy = h.d.headY + cyOff * s;
  const P = HEAD_PROFILE.map((r) => {
    // 眼睛以下逐渐加宽，到嘴的高度达到最大
    const t = sat(-r[0] / 0.17);
    const k = 1 + (jaw - 1) * t * t * (3 - 2 * t);
    return [r[0], r[1] * k, r[2] * (1 + (k - 1) * 0.6), r[3]];
  });
  // 皮肤带一点自发光：脸不随朝向忽明忽暗，俯视角下也总是亮的(二次元式的平光脸)
  b.bone(h.J.head).paint(skin, { ao: 0.82, ao2: 1, glow: 0.07, mat: MAT.skin });
  b.lathe(P.map((r) => [cy + r[0] * s, r[1] * s, r[2] * s, 0, r[3] * s]), { seg: 14, crease: 180 });
  const ring = (dy: number): [number, number, number] => {
    const y = dy / s;
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
  b.bone(h.J.head).paint(o.c, { c2: o.c2, gloss: o.gloss ?? 0.25, ao: 0.85, ao2: 1, mat: MAT.fur });
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
  /** 眉毛粗细(默认 0.018)与长度倍率(默认 1) */
  browH?: number;
  browLen?: number;
  /** 眼睛半宽 / 半高 */
  eyeW?: number;
  eyeH?: number;
  /** 虹膜占眼宽的比例(默认 0.68)：调小 = 眼白多，瞪眼 */
  irisSize?: number;
  /** 外眼角上挑(度) */
  slant?: number;
  /** 睫毛/上眼线厚度 */
  lash?: number;
  lip?: Col;
  /** 两眼间距系数 */
  spread?: number;
  /** 肤色：给了才能画鼻子与耳朵 */
  skin?: Col;
  /** 鼻子大小倍率(0 = 不画，默认 0；1 = 标准) */
  nose?: number;
  /** 画耳朵(需要 skin) */
  ears?: boolean;
  /** 嘴宽倍率(默认 1 = 0.06 米全宽) */
  mouthW?: number;
  /** 嘴角上翘 −1..1：正 = 笑，负 = 嘴角下撇。给了 smile / open 任意一个就改用曲线嘴型 */
  smile?: number;
  /** 张嘴程度 0..1：露出口腔与一排牙(咧嘴笑、怒喝) */
  open?: number;
  /** 省面的眼睛：眼白/虹膜/瞳孔用微凸的圆片而不是椭球(两只眼共省约 450 三角，外观几乎一样)。新模型建议开 */
  lite?: boolean;
}

/** 朝 +Z 的微凸圆片(中心比边缘高 depth)：眼白、虹膜这类贴在脸上的小圆面用它，一片只要 seg 个三角 */
function disc(b: ModelBuilder, x: number, y: number, z: number, rx: number, ry: number, depth: number, seg: number): void {
  const P: number[] = [x, y, z + depth];
  const T: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    P.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry, z);
    T.push(0, 1 + i, 1 + ((i + 1) % seg));
  }
  b.emit(P, T, null, 180);
}

/**
 * 五官：眼(眼白+虹膜+瞳孔+高光+上眼线)、眉、嘴，可选鼻与耳。全部贴着头表面，不参与描边。
 * 嘴型：不给 smile / open 时是一道短横线(旧模型的样子)；给了就沿脸的弧面画一条可弯的唇线，open > 0 时再加口腔与牙。
 */
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
  const iw = o.irisSize ?? 0.68;
  b.bone(h.J.head);
  b.sym(() => {
    b.g(X(ex, ey, r[2] + zOn - 0.004 * s, 0, yaw * 0.8, o.slant ?? 4), () => {
      const lash = (o.lash ?? 0.014) * s;
      if (o.lite) {
        b.paint(0xfbf4ec, { line: 0 });
        disc(b, 0, 0, 0.002 * s, ew, eh, 0.011 * s, 12);
        b.paint(o.iris, { glow: o.irisGlow ?? 0.2, line: 0 });
        disc(b, -ew * 0.1, -eh * 0.04, 0.0115 * s, ew * iw, eh * Math.min(0.9, iw * 1.32), 0.004 * s, 10);
        b.paint(0x140d12, { line: 0 });
        disc(b, -ew * 0.1, -eh * 0.08, 0.0145 * s, ew * iw * 0.47, eh * Math.min(0.48, iw * 0.7), 0.003 * s, 8);
        b.paint(0xffffff, { glow: 0.5, line: 0 });
        disc(b, ew * 0.16, eh * 0.36, 0.0165 * s, ew * 0.24, eh * 0.24, 0.002 * s, 6);
        b.paint(o.brow, { line: 0 });
        b.box(0, eh * 0.9, 0.01 * s, ew * 2.25, lash, 0.016 * s);
        b.g(X(ew * 1.05, eh * 0.75, 0.008 * s, 0, 0, 38), () => b.box(0, 0, 0, ew * 0.5, lash * 0.9, 0.014 * s));
        return;
      }
      b.paint(0xfbf4ec, { line: 0 });
      b.ball(0, 0, 0, ew, eh, 0.012 * s, 1);
      b.paint(o.iris, { glow: o.irisGlow ?? 0.2, line: 0 });
      b.ball(-ew * 0.1, -eh * 0.04, 0.006 * s, ew * iw, eh * Math.min(0.9, iw * 1.32), 0.009 * s, 1);
      b.paint(0x140d12, { line: 0 });
      b.ball(-ew * 0.1, -eh * 0.08, 0.01 * s, ew * iw * 0.47, eh * Math.min(0.48, iw * 0.7), 0.007 * s, 1);
      b.paint(0xffffff, { glow: 0.5, line: 0 });
      b.ball(ew * 0.16, eh * 0.36, 0.014 * s, ew * 0.24, eh * 0.24, 0.004 * s, 0);
      // 上眼线：压住眼白上缘，眼神才有力
      b.paint(o.brow, { line: 0 });
      b.box(0, eh * 0.9, 0.008 * s, ew * 2.25, lash, 0.016 * s, lash * 0.3);
      b.g(X(ew * 1.05, eh * 0.75, 0.006 * s, 0, 0, 38), () => b.box(0, 0, 0, ew * 0.5, lash * 0.9, 0.014 * s, lash * 0.3));
    });
    // 眉
    const by = ey + eh + 0.04 * s;
    const bh = (o.browH ?? 0.018) * s;
    b.paint(o.brow, { line: 0 });
    b.g(X(ex + 0.006 * s, by, hd.surf(ex, by) + 0.003 * s, -14, yaw * 0.7, o.browTilt ?? 10), () => b.box(0, 0, 0, ew * 2.3 * (o.browLen ?? 1), bh, 0.016 * s, Math.min(0.006 * s, bh * 0.4)));
  });
  const my = hd.cy - 0.145 * s;
  if (o.lip !== undefined) {
    if (o.smile === undefined && o.open === undefined) {
      b.paint(o.lip, { line: 0 });
      b.g(X(0, my, hd.surf(0, my) + 0.001, -8, 0, 0), () => b.box(0, 0, 0, 0.06 * s * (o.mouthW ?? 1), 0.012 * s, 0.012 * s, 0.004 * s));
    } else {
      const w = 0.03 * s * (o.mouthW ?? 1);
      const smile = o.smile ?? 0;
      const open = sat(o.open ?? 0);
      // 上唇线：嘴角按 smile 上翘/下撇
      const top = (x: number): number => my + smile * 0.02 * s * (x / w) ** 2 + open * 0.006 * s;
      const gap = (x: number): number => open * 0.034 * s * (1 - (x / w) ** 2);
      const lipH = 0.0075 * s;
      if (open > 0.02) {
        // 口腔(深色)与上排牙：都是贴着脸弧面的小曲面，略微浮出皮肤
        b.paint(0x4a1c1a, { line: 0 });
        b.sheet(6, 2, (u, v) => {
          const x = (u - 0.5) * 2 * w * 0.96;
          const y = lerp(top(x) - gap(x), top(x), v);
          return [x, y, hd.surf(x, y) + 0.0025 * s];
        }, false);
        b.paint(0xf6efe2, { line: 0 });
        b.sheet(6, 1, (u, v) => {
          const x = (u - 0.5) * 2 * w * 0.86;
          const y = lerp(top(x) - gap(x) * 0.5, top(x), v);
          return [x, y, hd.surf(x, y) + 0.004 * s];
        }, false);
      }
      b.paint(o.lip, { line: 0 });
      const lipPath = (yOf: (x: number) => number, rr: number): number[][] => {
        const pts: number[][] = [];
        for (let i = 0; i <= 6; i++) {
          const x = (i / 6 - 0.5) * 2 * w;
          const y = yOf(x);
          const k = 1 - 0.55 * Math.abs(i / 3 - 1) ** 2;
          pts.push([x, y, hd.surf(x, y) + 0.003 * s, rr * k, 0.006 * s]);
        }
        return pts;
      };
      b.tube(lipPath(top, lipH), { seg: 4, up: [0, 1, 0] });
      if (open > 0.02) b.tube(lipPath((x) => top(x) - gap(x) - lipH * 0.4, lipH * 0.85), { seg: 4, up: [0, 1, 0] });
    }
  }
  if (o.skin !== undefined) {
    const nose = o.nose ?? 0;
    if (nose > 0) {
      // 鼻：一个从眉心向下变宽的小楔形，鼻底略暗
      const ny = hd.cy - 0.092 * s;
      const nz = hd.surf(0, ny);
      b.paint(o.skin, { ao: 1, ao2: 0.72, glow: 0.07, line: 0, mat: MAT.skin });
      b.tube(
        [
          [0, ny - 0.012 * s * nose, nz - 0.004 * s, 0.03 * s * nose, 0.012 * s * nose],
          [0, ny + 0.004 * s, nz + 0.022 * s * nose, 0.024 * s * nose, 0.02 * s * nose],
          [0, ny + 0.05 * s, hd.surf(0, ny + 0.05 * s) + 0.004 * s, 0.014 * s * nose, 0.012 * s],
          [0, ny + 0.085 * s, hd.surf(0, ny + 0.085 * s) - 0.004 * s, 0.01 * s * nose, 0.006 * s],
        ],
        { seg: 5, up: [1, 0, 0], crease: 180 },
      );
    }
    if (o.ears) {
      const er = hd.ring(-0.04 * s);
      b.paint(o.skin, { ao: 0.8, glow: 0.07, mat: MAT.skin });
      b.sym(() => b.g(X(er[0] * 0.99, hd.cy - 0.04 * s, er[2] - 0.015 * s, 0, -18, 0), () => b.ball(0, 0, 0, 0.022 * s, 0.05 * s, 0.034 * s, 0, 180)));
    }
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

// ───────────── 第二阶段新增：须发、毛皮、圆润的手 ─────────────

export interface LockOpts {
  /** 末端弯曲的方向与幅度(相对长度的比例)：一绺头发/胡须不是直棍 */
  curl?: [number, number, number];
  /** 截面扁平度(另一方向半径 = r × flat)，默认 0.8 */
  flat?: number;
  seg?: number;
  /** 沿长度的分段数(默认 4) */
  n?: number;
  /** 截面宽方向的参考向量(默认 +X) */
  up?: [number, number, number];
  /** 尖端粗细占根部的比例(默认 0.08) */
  tip?: number;
}

/**
 * 一绺须发：从 root 沿 dir 伸出 len，根粗尖细，中段略鼓，末端按 curl 弯。调用前先设置绑定与颜色。
 * 发束、须束、盔缨的单股、兽毛簇都用它。
 */
export function lock(b: ModelBuilder, root: number[], dir: number[], len: number, r: number, o: LockOpts = {}): void {
  const n = o.n ?? 4;
  const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const c = o.curl ?? [0, 0, 0];
  const tip = o.tip ?? 0.08;
  const path: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = len * t;
    const q = len * t * t;
    const rr = r * (i === 0 ? 0.72 : lerp(1, tip, Math.pow(t, 1.4)) * (1 + 0.18 * Math.sin(Math.PI * Math.min(1, t * 1.6))));
    path.push([root[0] + (dir[0] / dl) * k + c[0] * q, root[1] + (dir[1] / dl) * k + c[1] * q, root[2] + (dir[2] / dl) * k + c[2] * q, rr, rr * (o.flat ?? 0.8)]);
  }
  b.tube(path, { seg: o.seg ?? 5, up: o.up ?? [1, 0, 0], crease: 180 });
}

export interface BeardOpts {
  /** 根部色 / 须梢色 */
  c: Col;
  c2?: Col;
  /** 连鬓底须向两侧延伸到的角度(弧度，自正前方起算；1.45 ≈ 到耳前)。0 = 不要底须(只留须束或八字胡) */
  spread?: number;
  /** 底须厚度(米) */
  thick?: number;
  /** 下巴处底须垂到下颌以下多少(米) */
  drop?: number;
  /** 须束数(沿下颌线均布)、长度、根部粗细 */
  tufts?: number;
  len?: number;
  tuftR?: number;
  /** 外翻程度 0..1：须束向外张开并在末端上卷 */
  puff?: number;
  /** 八字胡：单边长度(0 = 没有)、粗细、末端上翘高度(负值 = 下垂) */
  mustache?: number;
  mustacheR?: number;
  curl?: number;
  gloss?: number;
}

/**
 * 胡须：连鬓底须(贴着下半张脸的一片曲面，下巴处垂下) + 一圈须束 + 八字胡，都绑在头上。
 * 尺寸按未缩放的头给，内部乘头部倍率。络腮虬髯、短刷子髯、只有两撇小胡子都能用同一个函数配出来。
 */
export function beard(b: ModelBuilder, h: Human, hd: HeadShape, o: BeardOpts): void {
  const s = hd.s;
  const spread = o.spread ?? 1.45;
  const th = (o.thick ?? 0.03) * s;
  const drop = o.drop ?? 0.05;
  const puff = o.puff ?? 0.5;
  b.bone(h.J.head).paint(o.c, { c2: o.c2, gloss: o.gloss ?? 0.2, ao: 0.82, ao2: 1, mat: MAT.fur });
  // 上缘：绕过嘴(嘴角外上行)一直爬到鬓角；下缘：两侧贴下颌线，正中垂到下巴以下
  const topOf = (phi: number): number => {
    const a = Math.abs(phi);
    if (a < 0.34) return -0.182;
    if (a < 0.8) return lerp(-0.182, -0.085, (a - 0.34) / 0.46);
    return lerp(-0.085, 0.03, sat((a - 0.8) / Math.max(0.05, spread - 0.8)));
  };
  const botOf = (phi: number): number => lerp(-0.252 - drop, -0.13, Math.pow(sat(Math.abs(phi) / Math.max(0.2, spread)), 1.6));
  /** 下半张脸上 (phi, dy) 处向外浮出 out 的点；下巴以下没有头面，沿下颌环向下收拢 */
  const at = (phi: number, dy: number, out: number): number[] => {
    const dyc = Math.max(dy, -0.2);
    const r = hd.ring(dyc * s);
    const k = Math.max(0.25, 1 - (dyc - dy) * 3.2);
    return [(r[0] * k + out) * Math.sin(phi), hd.cy + dy * s, r[2] + (r[1] * k + out) * Math.cos(phi)];
  };
  if (spread > 0) {
    b.sheet(10, 3, (u, v) => {
      const phi = lerp(-spread, spread, u);
      const dy = lerp(botOf(phi), topOf(phi), v);
      // 上缘贴住皮肤，往下逐渐蓬出；两端(鬓角)收薄
      const edge = Math.sin(Math.PI * u);
      return at(phi, dy, th * (0.12 + 0.88 * Math.sin(Math.PI * Math.min(1, (1 - v) * 0.85 + 0.12))) * (0.35 + 0.65 * edge));
    });
  }
  const n = o.tufts ?? 5;
  const len = (o.len ?? 0.2) * s;
  const tr = (o.tuftR ?? 0.045) * s;
  const range = spread > 0 ? spread * 0.86 : 0.5;
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const phi = f * range;
    const mid = 1 - Math.abs(f);
    const dy = lerp(topOf(phi), botOf(phi), 0.62);
    const root = at(phi, dy, th * 0.55);
    // 中间的须束朝下朝前，两侧的朝外；外翻越大越向外张并在末端上卷
    const ox = Math.sin(phi);
    const oz = Math.cos(phi);
    const dir = [ox * (0.35 + puff * 0.8), -1, oz * (0.3 + puff * 0.55) * (0.5 + 0.5 * mid)];
    lock(b, root, dir, len * (0.78 + 0.22 * mid), tr * (0.85 + 0.25 * mid), { curl: [ox * puff * 0.5, puff * 0.55, oz * puff * 0.4], n: 3, seg: 5, up: [oz, 0, -ox], flat: 0.8, tip: 0.16 });
  }
  const ml = (o.mustache ?? 0) * s;
  if (ml > 0) {
    const mr = (o.mustacheR ?? 0.016) * s;
    const curl = (o.curl ?? 0.02) * s;
    b.sym(() => {
      const pts: number[][] = [];
      for (let i = 0; i <= 3; i++) {
        const t = i / 3;
        const x = 0.012 * s + ml * t;
        const y = hd.cy - 0.122 * s - 0.03 * s * Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.8 + curl * t * t * 1.6;
        const k = i === 0 ? 0.7 : lerp(1, 0.12, Math.pow(t, 1.5));
        pts.push([x, y, hd.surf(Math.min(x, hd.ring(y - hd.cy)[0] * 0.96), y) + mr * 0.5 + 0.02 * s * t * t, mr * k, mr * 0.75 * k]);
      }
      b.tube(pts, { seg: 4, up: [0, 1, 0], crease: 180 });
    });
  }
}

export interface FurOpts {
  /** 受光面的颜色 / 朝下一面的颜色(毛的阴影) */
  c: Col;
  c2?: Col;
  /** 沿长度方向的毛簇数(一鼓一收算一簇)与鼓起幅度 0..0.5 */
  tufts?: number;
  amp?: number;
  /** 截面一周的瓣数与起伏幅度：毛不是光滑的管子 */
  lobes?: number;
  lobeAmp?: number;
  /** 截面分段 */
  seg?: number;
  /** 逐顶点明度扰动 */
  grain?: number;
  team?: number;
}

/**
 * 沿路径的一条毛皮(滚边 / 袖口 / 毛领的一段)：path 每项 [x, y, z, r, r2?]，内部重采样成一鼓一收的毛簇。
 * 调用前先设置绑定；颜色由参数给(受光面 c、朝下一面 c2)。
 */
export function furTube(b: ModelBuilder, path: number[][], o: FurOpts & { closed?: boolean; up?: [number, number, number] }): void {
  const tufts = o.tufts ?? 8;
  const amp = o.amp ?? 0.22;
  const closed = o.closed ?? false;
  const n = tufts * 2;
  const m = path.length;
  const pts: number[][] = [];
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const f = closed ? (i / n) * m : (i / n) * (m - 1);
    const i0 = Math.floor(f) % m;
    const i1 = closed ? (i0 + 1) % m : Math.min(m - 1, i0 + 1);
    const t = f - Math.floor(f);
    const a = path[i0];
    const c = path[i1];
    const k = i % 2 === 0 ? 1 + amp : 1 - amp * 0.55;
    const r0 = lerp(a[3], c[3], t);
    const r1 = lerp(a[4] ?? a[3], c[4] ?? c[3], t);
    // 开口的毛条两端收小，不留平头
    const end = closed ? 1 : 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.min(i, n - i) / 1.5) * 0.5);
    pts.push([lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t), r0 * k * end, r1 * k * end]);
  }
  const lobes = o.lobes ?? 5;
  const la = o.lobeAmp ?? 0.1;
  b.paint(o.c, { c2: o.c2 ?? o.c, mat: MAT.fur, grain: o.grain ?? 0.05, team: o.team ?? 0, by: (_x, _y, _z, _g, _nx, ny) => 0.5 - 0.62 * ny });
  b.tube(pts, { seg: o.seg ?? 7, closed, up: o.up ?? [0, 1, 0], crease: 70, shape: (ang, k) => 1 + la * Math.cos(lobes * ang + k * 2.1) });
}

/**
 * 水平毛环(绕 Y 轴的椭圆)：毛领、帽箍。rx / rz 为环的左右 / 前后半径，r / ry 为毛条的径向 / 竖向半径。
 * 需要倾斜(前低后高的领子)时在外面套 b.g(X(...)) 即可。
 */
export function furRing(b: ModelBuilder, rx: number, rz: number, r: number, ry: number, o: FurOpts & { y?: number } = { c: 0xffffff }): void {
  const tufts = o.tufts ?? 9;
  const path: number[][] = [];
  const n = tufts * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    path.push([Math.cos(a) * rx, o.y ?? 0, Math.sin(a) * rz, ry, r]);
  }
  furTube(b, path, { ...o, tufts, closed: true, up: [0, 1, 0] });
}

/**
 * 圆润的拳头(裸手或手套)：比 fist() 的倒角盒柔和，立绘近景不像积木。绑定到手关节；调用前先 paint。
 * open = true 时是微屈的手掌(抚琴、按弦、叉腰)。
 */
export function hand(b: ModelBuilder, h: Human, side: 1 | -1, r = 0.07, open = false): void {
  const d = h.d;
  const x = side * d.shoulderX;
  const y = d.handY + 0.01;
  b.bone(side > 0 ? h.J.handL : h.J.handR);
  if (!open) {
    b.lathe(
      [
        [y - r * 1.05, r * 0.5, r * 0.6, x, 0.012],
        [y - r * 0.72, r * 0.86, r * 1.02, x, 0.012],
        [y, r * 0.94, r * 1.12, x, 0.008],
        [y + r * 0.72, r * 0.8, r * 0.9, x, 0],
        [y + r * 1.02, r * 0.5, r * 0.56, x, 0],
      ],
      { seg: 7, power: 2.5, crease: 180 },
    );
    // 拇指：压在拳面前侧的一小段
    b.g(X(x - side * r * 0.2, y + r * 0.1, r * 1.0, 0, 0, side * 24), () => b.ball(0, 0, 0, r * 0.34, r * 0.6, r * 0.34, 0, 180));
  } else {
    // 手掌 + 并拢微屈的四指(一整片) + 拇指
    b.tube(
      [
        [x, y + r * 1.0, 0, r * 0.3, r * 0.62],
        [x, y + r * 0.3, 0.004, r * 0.36, r * 0.86],
        [x, y - r * 0.5, 0.012, r * 0.32, r * 0.84],
        [x, y - r * 1.25, 0.04, r * 0.24, r * 0.7],
        [x, y - r * 1.8, 0.085, r * 0.14, r * 0.5],
      ],
      { seg: 6, up: [1, 0, 0], crease: 180 },
    );
    b.g(X(x, y - r * 0.2, r * 0.8, 40, 0, 0), () => b.ball(0, 0, 0, r * 0.24, r * 0.6, r * 0.26, 0, 180));
  }
}
