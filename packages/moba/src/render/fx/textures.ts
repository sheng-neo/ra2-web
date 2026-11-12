/**
 * 特效贴图：全部程序化生成的粒子图集(一张 DataTexture，8×5 格)。
 * 第 5 行(下标 32~39)：32~34 是英雄特效包的(雁 / 音波弧 / 墨溅)，35~39 是通用特效(鳞片 / 吐息雾团 / 阔叶 / 水花环 / 八芒星)。
 * 通道约定(线性数据，不用 alpha 通道存数据)：R = 形状/透明度蒙版，G = 明暗细节(乘到颜色上)，B = 亮核(把颜色推向白热)。
 * 图形一律画在格子中央 ~86% 的范围内，四周留黑边，mipmap 不会串格。
 */
import * as THREE from 'three';
import { Rng, fbm2 } from '../materials';

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 5;
const CELL = 128;

/** 图集里各图形的下标 */
export const SPRITE = {
  dot: 0, // 柔光点
  glow: 1, // 带白热核心的光晕
  spark: 2, // 四芒星闪光
  star: 3, // 实心五角星
  smoke: 4, // 烟团
  streak: 5, // 拉长的火花(头在 +x)
  shard: 6, // 岩石碎片(带切面明暗)
  feather: 7, // 羽毛(尖在 +x)
  rune1: 8,
  rune2: 9,
  rune3: 10,
  ring: 11, // 细圆环
  flame: 12, // 火舌(尖朝上)
  leaf: 13, // 风叶
  crescent: 14, // 月牙斩痕
  hex: 15, // 六边形框
  diamond: 16, // 菱形晶片
  coin: 17, // 金币
  plus: 18, // 治疗十字
  wisp: 19, // 烟缕
  arrow: 20, // 箭(尖在 +x)
  lock: 21, // 锁定准星
  swirl: 22, // 旋涡臂
  burst: 23, // 放射状爆闪
  bubble: 24, // 空心泡
  chevron: 25, // 尖角(指向 +x)
  ember: 26, // 不规则余烬
  frost: 27, // 六角冰晶
  smoke2: 28, // 烟团变体
  bolt: 29, // 眩晕用的折线闪电
  drop: 30, // 水滴/黏液
  soft: 31, // 极柔的大光斑
  goose: 32, // 飞雁的俯视剪影(头颈朝 +x，双翼后掠成「人」字)
  wave: 33, // 一段音波弧(弧顶朝 +x，后面跟一道更短更淡的回声)
  ink: 34, // 墨溅(不规则墨团 + 几道甩出去的尖 + 零星墨点)
  scale: 35, // 一片龙鳞(圆头菱形，带脊线；尖朝 +x)
  puff: 36, // 吐息雾团(边缘被噪声侵蚀的卷云团，带内部涡纹)
  broadleaf: 37, // 阔叶(带主脉与侧脉，尖朝 +x)
  splash: 38, // 水花环(俯视的一圈溅起水珠，中心空)
  star8: 39, // 八芒星(长短芒相间)
} as const;

type PixFn = (x: number, y: number, o: Float32Array) => void;
type PathFn = (m: CanvasRenderingContext2D, s: CanvasRenderingContext2D) => void;
interface SpriteDef {
  /** 逐像素函数：x,y ∈ [-1,1]，y 向上；写 o[0]=蒙版 o[1]=明暗 o[2]=亮核 */
  pix?: PixFn;
  /** 路径绘制：m 上画白色形状，s 上画明暗(默认全白)。坐标系同上 */
  path?: PathFn;
  /** 路径图形的亮核系数(乘在蒙版平方上) */
  core?: number;
}

const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

function smokePix(seed: number): PixFn {
  return (x, y, o) => {
    const r = Math.hypot(x, y);
    const n = fbm2(x * 1.7 + 5.3, y * 1.7 + 2.1, 3, seed) - 0.5;
    const n2 = fbm2(x * 4.1 + 1.3, y * 4.1 + 8.7, 2, seed + 9) - 0.5;
    const d = r + n * 0.7 + n2 * 0.22;
    o[0] = sstep(0.92, 0.28, d) * sstep(1.0, 0.82, r);
    // 上亮下暗的体积感 + 团块明暗
    o[1] = sat(0.72 + y * 0.16 + n * 0.5 + n2 * 0.25);
    o[2] = 0;
  };
}

function star(ctx: CanvasRenderingContext2D, n: number, r0: number, r1: number, rot = Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 === 0 ? r0 : r1;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function glowStroke(m: CanvasRenderingContext2D, width: number, draw: () => void): void {
  // 先画一层宽而淡的辉光，再画实线
  m.lineCap = 'round';
  m.lineJoin = 'round';
  m.strokeStyle = 'rgba(255,255,255,0.28)';
  m.lineWidth = width * 2.6;
  draw();
  m.stroke();
  m.strokeStyle = '#fff';
  m.lineWidth = width;
  draw();
  m.stroke();
}

function rune(seed: number): PathFn {
  return (m) => {
    const rng = new Rng(seed);
    // 骨架：一根主干 + 若干折划/弧/点，像一个陌生的字符
    glowStroke(m, 0.15, () => {
      m.beginPath();
      m.moveTo(0, -0.62);
      m.lineTo(0, 0.62);
      const k = 2 + rng.int(2);
      for (let i = 0; i < k; i++) {
        const y0 = rng.range(-0.5, 0.5);
        const side = rng.chance(0.5) ? 1 : -1;
        const len = rng.range(0.28, 0.5);
        m.moveTo(0, y0);
        m.lineTo(side * len, y0 + rng.range(-0.3, 0.3));
        if (rng.chance(0.5)) m.lineTo(side * len, y0 + rng.range(-0.45, 0.45));
      }
      if (rng.chance(0.7)) {
        m.moveTo(0.42, 0.5);
        m.arc(0, 0.5, 0.42, 0, Math.PI * rng.range(0.5, 1));
      }
    });
    m.fillStyle = '#fff';
    for (let i = 0; i < 2; i++) {
      m.beginPath();
      m.arc(rng.range(-0.5, 0.5), rng.range(-0.6, 0.6), 0.1, 0, TAU);
      m.fill();
    }
  };
}

const DEFS: Record<number, SpriteDef> = {
  [SPRITE.dot]: {
    pix: (x, y, o) => {
      const r = Math.hypot(x, y);
      const f = sat(1 - r);
      o[0] = f * f;
      o[1] = 1;
      o[2] = 0;
    },
  },
  [SPRITE.glow]: {
    pix: (x, y, o) => {
      const r2 = x * x + y * y;
      const r = Math.sqrt(r2);
      o[0] = sat(Math.exp(-r2 * 4.5) * 0.85 + Math.exp(-r2 * 30) * 0.5) * sstep(1, 0.75, r);
      o[1] = 1;
      o[2] = Math.exp(-r2 * 34);
    },
  },
  [SPRITE.spark]: {
    pix: (x, y, o) => {
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      const fx = Math.exp(-y * y * 110) * Math.pow(sat(1 - ax), 1.8);
      const fy = Math.exp(-x * x * 110) * Math.pow(sat(1 - ay), 1.8);
      // 对角的短芒
      const u = (x + y) * 0.7071;
      const v = (x - y) * 0.7071;
      const fd = (Math.exp(-v * v * 200) * Math.pow(sat(1 - Math.abs(u) * 2.0), 2) + Math.exp(-u * u * 200) * Math.pow(sat(1 - Math.abs(v) * 2.0), 2)) * 0.7;
      const g = Math.exp(-(x * x + y * y) * 11);
      o[0] = sat(Math.max(fx, fy) + fd + g * 0.9);
      o[1] = 1;
      o[2] = sat(g * 1.2 + Math.max(fx, fy) * 0.5);
    },
  },
  [SPRITE.star]: {
    core: 0.25,
    path: (m, s) => {
      m.fillStyle = '#fff';
      m.shadowColor = '#fff';
      m.shadowBlur = 5;
      star(m, 5, 0.9, 0.42);
      m.fill();
      const g = s.createRadialGradient(0, 0.1, 0, 0, 0, 0.95);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, '#b0b0b0');
      s.fillStyle = g;
      s.fillRect(-1.2, -1.2, 2.4, 2.4);
    },
  },
  [SPRITE.smoke]: { pix: smokePix(11) },
  [SPRITE.smoke2]: { pix: smokePix(47) },
  [SPRITE.streak]: {
    pix: (x, y, o) => {
      // 头部(+x)粗亮，尾部细淡
      const k = (x + 1) * 0.5;
      const w = 0.1 + 0.42 * k * k;
      const body = Math.exp(-(y * y) / (w * w)) * sstep(-1, -0.7, x) * sstep(1, 0.72, x);
      o[0] = sat(body * (0.25 + 0.75 * k));
      o[1] = 1;
      o[2] = sat(body * k * k * 0.9);
    },
  },
  [SPRITE.shard]: {
    path: (m, s) => {
      const pts: [number, number][] = [[-0.55, -0.5], [0.3, -0.75], [0.8, -0.1], [0.45, 0.62], [-0.3, 0.8], [-0.82, 0.15]];
      const poly = (c: CanvasRenderingContext2D, idx: number[]): void => {
        c.beginPath();
        idx.forEach((i, k) => (k === 0 ? c.moveTo(pts[i][0], pts[i][1]) : c.lineTo(pts[i][0], pts[i][1])));
        c.closePath();
        c.fill();
      };
      m.fillStyle = '#fff';
      poly(m, [0, 1, 2, 3, 4, 5]);
      // 三个切面：亮 / 中 / 暗
      s.fillStyle = '#8c8c8c';
      s.fillRect(-1.2, -1.2, 2.4, 2.4);
      s.fillStyle = '#ffffff';
      s.beginPath();
      s.moveTo(-0.3, 0.8);
      s.lineTo(0.45, 0.62);
      s.lineTo(0.05, 0.05);
      s.lineTo(-0.82, 0.15);
      s.closePath();
      s.fill();
      s.fillStyle = '#5a5a5a';
      s.beginPath();
      s.moveTo(-0.55, -0.5);
      s.lineTo(0.3, -0.75);
      s.lineTo(0.05, 0.05);
      s.closePath();
      s.fill();
    },
  },
  [SPRITE.feather]: {
    core: 0.15,
    path: (m, s) => {
      m.fillStyle = '#fff';
      m.beginPath();
      m.moveTo(0.92, 0);
      m.quadraticCurveTo(0.35, 0.42, -0.5, 0.26);
      m.lineTo(-0.34, 0.08);
      m.lineTo(-0.62, 0.02);
      m.lineTo(-0.36, -0.1);
      m.quadraticCurveTo(-0.2, -0.36, -0.52, -0.24);
      m.quadraticCurveTo(0.35, -0.42, 0.92, 0);
      m.closePath();
      m.fill();
      m.strokeStyle = '#fff';
      m.lineWidth = 0.08;
      m.beginPath();
      m.moveTo(-0.92, 0);
      m.lineTo(0.8, 0);
      m.stroke();
      const g = s.createLinearGradient(-1, 0, 1, 0);
      g.addColorStop(0, '#9a9a9a');
      g.addColorStop(1, '#ffffff');
      s.fillStyle = g;
      s.fillRect(-1.2, -1.2, 2.4, 2.4);
      // 羽枝纹
      s.strokeStyle = 'rgba(90,90,90,0.55)';
      s.lineWidth = 0.025;
      for (let i = -4; i <= 6; i++) {
        const x = i * 0.13;
        s.beginPath();
        s.moveTo(x, 0);
        s.lineTo(x - 0.16, 0.4);
        s.moveTo(x, 0);
        s.lineTo(x - 0.16, -0.4);
        s.stroke();
      }
      s.strokeStyle = '#fff';
      s.lineWidth = 0.04;
      s.beginPath();
      s.moveTo(-0.92, 0);
      s.lineTo(0.8, 0);
      s.stroke();
    },
  },
  [SPRITE.rune1]: { core: 0.6, path: rune(3) },
  [SPRITE.rune2]: { core: 0.6, path: rune(18) },
  [SPRITE.rune3]: { core: 0.6, path: rune(77) },
  [SPRITE.ring]: {
    pix: (x, y, o) => {
      const r = Math.hypot(x, y);
      const d = Math.abs(r - 0.76);
      o[0] = sat(sstep(0.12, 0.04, d) + Math.exp(-d * d * 40) * 0.3) * sstep(1, 0.93, r);
      o[1] = 1;
      o[2] = sstep(0.05, 0.0, d) * 0.6;
    },
  },
  [SPRITE.flame]: {
    pix: (x, y, o) => {
      const v = sat((y + 0.92) / 1.84);
      const wob = (fbm2(x * 2.2 + 3.1, y * 2.6 + 1.7, 3, 5) - 0.5) * 0.5 * v;
      const h = 0.6 * Math.sin(Math.PI * Math.pow(v, 0.55)) * (1 - v * 0.25) + 0.02;
      const ax = Math.abs(x + wob);
      const m = sstep(h, h * 0.25, ax) * sstep(0, 0.06, v) * sstep(1, 0.9, v);
      o[0] = m;
      o[1] = sat(0.55 + (1 - v) * 0.5);
      o[2] = sstep(h * 0.55, 0, ax) * sat(1 - v * 1.5) * m;
    },
  },
  [SPRITE.leaf]: {
    core: 0.1,
    path: (m, s) => {
      m.fillStyle = '#fff';
      m.beginPath();
      m.moveTo(-0.85, -0.1);
      m.quadraticCurveTo(-0.1, 0.62, 0.88, 0.12);
      m.quadraticCurveTo(0.0, -0.18, -0.85, -0.1);
      m.closePath();
      m.fill();
      const g = s.createLinearGradient(0, -0.3, 0, 0.5);
      g.addColorStop(0, '#8a8a8a');
      g.addColorStop(1, '#fff');
      s.fillStyle = g;
      s.fillRect(-1.2, -1.2, 2.4, 2.4);
    },
  },
  [SPRITE.crescent]: {
    pix: (x, y, o) => {
      // 大圆减去偏心小圆 → 月牙，弧背朝 -x
      const a = Math.hypot(x, y);
      const b = Math.hypot(x - 0.42, y);
      const outer = sstep(0.93, 0.86, a);
      const inner = sstep(0.8, 0.9, b);
      const m = outer * inner;
      o[0] = m;
      o[1] = 1;
      // 弧背亮
      o[2] = m * sstep(0.6, 0.9, a) * 0.8;
    },
  },
  [SPRITE.hex]: {
    core: 0.4,
    path: (m) => {
      m.fillStyle = 'rgba(255,255,255,0.16)';
      star(m, 3, 0.86, 0.86, Math.PI / 2);
      m.fill();
      glowStroke(m, 0.14, () => star(m, 3, 0.78, 0.78, Math.PI / 2));
    },
  },
  [SPRITE.diamond]: {
    pix: (x, y, o) => {
      const d = Math.abs(x) / 0.5 + Math.abs(y) / 0.92;
      const m = sstep(1, 0.9, d);
      o[0] = m;
      // 四个切面明暗不同
      o[1] = x < 0 ? (y > 0 ? 1 : 0.62) : y > 0 ? 0.8 : 0.45;
      o[2] = sstep(0.5, 0, d) * 0.5;
    },
  },
  [SPRITE.coin]: {
    path: (m, s) => {
      m.fillStyle = '#fff';
      m.beginPath();
      m.arc(0, 0, 0.8, 0, TAU);
      m.fill();
      s.fillStyle = '#c8c8c8';
      s.fillRect(-1.2, -1.2, 2.4, 2.4);
      s.fillStyle = '#8a8a8a';
      s.beginPath();
      s.arc(0, 0, 0.6, 0, TAU);
      s.fill();
      s.fillStyle = '#ffffff';
      star(s, 4, 0.46, 0.17);
      s.fill();
      // 左上高光弧
      s.strokeStyle = '#fff';
      s.lineWidth = 0.09;
      s.beginPath();
      s.arc(0, 0, 0.7, Math.PI * 0.55, Math.PI * 1.0);
      s.stroke();
    },
  },
  [SPRITE.plus]: {
    core: 0.5,
    path: (m) => {
      m.fillStyle = '#fff';
      m.shadowColor = '#fff';
      m.shadowBlur = 8;
      const r = 0.22;
      // 不用 roundRect：旧版移动浏览器没有
      m.fillRect(-r, -0.78, r * 2, 1.56);
      m.fillRect(-0.78, -r, 1.56, r * 2);
    },
  },
  [SPRITE.wisp]: {
    pix: (x, y, o) => {
      const cx = 0.34 * Math.sin(y * 2.6 + 0.4);
      const env = Math.pow(sat(1 - Math.abs(y) / 0.92), 0.8);
      const w = 0.07 + 0.2 * env * (0.6 + 0.4 * fbm2(y * 2 + 3, 0.5, 2, 21));
      const d = x - cx;
      o[0] = sat(Math.exp(-(d * d) / (w * w)) * env);
      o[1] = sat(0.7 + y * 0.25);
      o[2] = 0;
    },
  },
  [SPRITE.arrow]: {
    core: 0.5,
    path: (m) => {
      m.strokeStyle = '#fff';
      m.fillStyle = '#fff';
      m.lineCap = 'round';
      m.lineWidth = 0.17;
      m.beginPath();
      m.moveTo(-0.8, 0);
      m.lineTo(0.5, 0);
      m.stroke();
      m.beginPath();
      m.moveTo(0.94, 0);
      m.lineTo(0.3, 0.36);
      m.lineTo(0.46, 0);
      m.lineTo(0.3, -0.36);
      m.closePath();
      m.fill();
      m.lineWidth = 0.13;
      m.beginPath();
      for (const x of [-0.72, -0.48]) {
        m.moveTo(x, 0);
        m.lineTo(x - 0.16, 0.3);
        m.moveTo(x, 0);
        m.lineTo(x - 0.16, -0.3);
      }
      m.stroke();
    },
  },
  [SPRITE.lock]: {
    core: 0.5,
    path: (m) => {
      glowStroke(m, 0.14, () => {
        m.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          m.moveTo(Math.cos(a - 0.5) * 0.66, Math.sin(a - 0.5) * 0.66);
          m.arc(0, 0, 0.66, a - 0.5, a + 0.5);
          const b = (i * Math.PI) / 2;
          m.moveTo(Math.cos(b) * 0.9, Math.sin(b) * 0.9);
          m.lineTo(Math.cos(b) * 0.5, Math.sin(b) * 0.5);
        }
      });
      m.fillStyle = '#fff';
      m.beginPath();
      m.arc(0, 0, 0.13, 0, TAU);
      m.fill();
    },
  },
  [SPRITE.swirl]: {
    pix: (x, y, o) => {
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x) / TAU + 0.5;
      // 两条对数螺旋臂，越向外越细
      const s = (((a * 2 + r * 1.9) % 1) + 1) % 1;
      const band = sstep(0.24, 0.02, Math.abs(s - 0.5));
      const env = sstep(0.06, 0.3, r) * sstep(0.96, 0.6, r);
      o[0] = sat(band * env);
      o[1] = 1;
      o[2] = sat(band * band * env * 0.5);
    },
  },
  [SPRITE.burst]: {
    pix: (x, y, o) => {
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      // 长短不一的放射芒
      const k = Math.floor(((a + Math.PI) / TAU) * 12 + 0.5) % 12;
      const len = 0.55 + 0.4 * (((k * 7919) % 13) / 13);
      const ray = Math.pow(Math.abs(Math.cos(a * 6)), 26) * sstep(len, len * 0.2, r);
      const g = Math.exp(-r * r * 14);
      o[0] = sat(ray * 0.9 + g) * sstep(1, 0.9, r);
      o[1] = 1;
      o[2] = sat(g * 1.1 + ray * 0.3);
    },
  },
  [SPRITE.bubble]: {
    pix: (x, y, o) => {
      const r = Math.hypot(x, y);
      const rim = sstep(0.11, 0.02, Math.abs(r - 0.78));
      const fill = sstep(0.82, 0.3, r) * 0.12;
      const hl = Math.exp(-((x + 0.38) * (x + 0.38) + (y - 0.42) * (y - 0.42)) * 28) * 0.9;
      o[0] = sat(rim * 0.85 + fill + hl) * sstep(1, 0.9, r);
      o[1] = 1;
      o[2] = hl;
    },
  },
  [SPRITE.chevron]: {
    core: 0.5,
    path: (m) => {
      glowStroke(m, 0.22, () => {
        m.beginPath();
        m.moveTo(-0.4, 0.62);
        m.lineTo(0.42, 0);
        m.lineTo(-0.4, -0.62);
      });
    },
  },
  [SPRITE.ember]: {
    pix: (x, y, o) => {
      const r = Math.hypot(x, y);
      const n = fbm2(x * 2.4 + 9.1, y * 2.4 + 4.4, 2, 31) - 0.5;
      const m = sstep(0.8, 0.25, r + n * 0.6);
      o[0] = m;
      o[1] = 1;
      o[2] = sstep(0.45, 0, r + n * 0.4);
    },
  },
  [SPRITE.frost]: {
    core: 0.5,
    path: (m) => {
      glowStroke(m, 0.11, () => {
        m.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const c = Math.cos(a);
          const s = Math.sin(a);
          m.moveTo(0, 0);
          m.lineTo(c * 0.84, s * 0.84);
          for (const t of [0.46, 0.66]) {
            for (const side of [-1, 1]) {
              const b = a + side * 0.9;
              m.moveTo(c * t, s * t);
              m.lineTo(c * t + Math.cos(b) * 0.2, s * t + Math.sin(b) * 0.2);
            }
          }
        }
      });
    },
  },
  [SPRITE.bolt]: {
    core: 0.6,
    path: (m) => {
      glowStroke(m, 0.17, () => {
        m.beginPath();
        m.moveTo(0.3, 0.86);
        m.lineTo(-0.3, 0.12);
        m.lineTo(0.18, 0.02);
        m.lineTo(-0.34, -0.86);
      });
    },
  },
  [SPRITE.drop]: {
    pix: (x, y, o) => {
      // 上尖下圆的水滴
      const v = sat((y + 0.85) / 1.7);
      const h = 0.52 * Math.sqrt(sat(1 - v)) * sstep(0, 0.22, v) + 0.01;
      const m = sstep(h, h * 0.6, Math.abs(x)) * sstep(1, 0.92, v);
      o[0] = m;
      o[1] = sat(0.7 + (x < 0 ? 0.3 : 0) * sstep(0.3, 0.1, v));
      o[2] = Math.exp(-((x + 0.14) * (x + 0.14) + (y + 0.4) * (y + 0.4)) * 40) * 0.8;
    },
  },
  [SPRITE.soft]: {
    pix: (x, y, o) => {
      const r2 = x * x + y * y;
      o[0] = Math.exp(-r2 * 3.2) * sstep(1, 0.7, Math.sqrt(r2));
      o[1] = 1;
      o[2] = 0;
    },
  },
  [SPRITE.goose]: {
    core: 0.22,
    path: (m, s) => {
      // 飞雁的俯视剪影：长颈前伸、身体丰圆、短尾；双翼向两侧平展，外半段才后掠收尖(「M」形前缘)。
      // 翼展约为身长的 1.2 倍——对局镜头下第一眼要读成「雁」，而不是燕子或箭头
      m.fillStyle = '#fff';
      for (const side of [1, -1]) {
        m.beginPath();
        m.moveTo(0.2, 0.1 * side);
        m.quadraticCurveTo(0.34, 0.36 * side, 0.2, 0.56 * side);
        m.quadraticCurveTo(0.08, 0.8 * side, -0.26, 0.95 * side);
        m.quadraticCurveTo(-0.1, 0.72 * side, -0.16, 0.56 * side);
        m.quadraticCurveTo(-0.26, 0.4 * side, -0.2, 0.3 * side);
        m.quadraticCurveTo(-0.3, 0.22 * side, -0.28, 0.1 * side);
        m.closePath();
        m.fill();
      }
      // 身体 + 扇形短尾
      m.beginPath();
      m.ellipse(-0.06, 0, 0.36, 0.15, 0, 0, TAU);
      m.fill();
      m.beginPath();
      m.moveTo(-0.32, 0.1);
      m.lineTo(-0.62, 0.11);
      m.lineTo(-0.56, 0);
      m.lineTo(-0.62, -0.11);
      m.lineTo(-0.32, -0.1);
      m.closePath();
      m.fill();
      // 颈与头(喙尖到 0.98)
      m.beginPath();
      m.moveTo(0.24, 0.1);
      m.quadraticCurveTo(0.5, 0.045, 0.78, 0.04);
      m.quadraticCurveTo(0.87, 0.085, 0.92, 0.03);
      m.lineTo(0.98, 0);
      m.lineTo(0.92, -0.03);
      m.quadraticCurveTo(0.87, -0.085, 0.78, -0.04);
      m.quadraticCurveTo(0.5, -0.045, 0.24, -0.1);
      m.closePath();
      m.fill();
      // 明暗：身体与翼根亮，翼尖(飞羽)压暗；翼与身体之间、翼的后半各有一道暗线分出层次
      const g = s.createRadialGradient(0, 0, 0.1, 0, 0, 1);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#e8e8e8');
      g.addColorStop(1, '#808080');
      s.fillStyle = g;
      s.fillRect(-1.2, -1.2, 2.4, 2.4);
      s.lineCap = 'round';
      for (const side of [1, -1]) {
        s.strokeStyle = 'rgba(60,60,60,0.55)';
        s.lineWidth = 0.035;
        s.beginPath();
        s.moveTo(0.2, 0.16 * side);
        s.quadraticCurveTo(-0.05, 0.2 * side, -0.28, 0.14 * side);
        s.stroke();
        s.strokeStyle = 'rgba(70,70,70,0.5)';
        s.lineWidth = 0.022;
        for (let i = 0; i < 4; i++) {
          const t = i / 3;
          s.beginPath();
          s.moveTo(0.08 - t * 0.12, (0.42 + t * 0.2) * side);
          s.lineTo(-0.18 - t * 0.06, (0.44 + t * 0.4) * side);
          s.stroke();
        }
      }
    },
  },
  [SPRITE.wave]: {
    pix: (x, y, o) => {
      // 音波弧：圆心在左侧画面外，弧顶朝 +x，两端收尖；后面再跟一道更短更淡的回声
      const arc = (cx: number, rad: number, span: number, w: number): number => {
        const dx = x - cx;
        const a = Math.atan2(y, dx);
        if (Math.abs(a) >= span) return 0;
        const taper = Math.pow(Math.cos((a / span) * Math.PI * 0.5), 0.7);
        const d = Math.abs(Math.hypot(dx, y) - rad) / (w * taper + 1e-4);
        return sstep(1, 0.45, d) * taper;
      };
      const main = arc(-0.55, 1.36, 0.66, 0.09);
      const echo = arc(-0.62, 1.06, 0.5, 0.06);
      o[0] = sat(main + echo * 0.55);
      o[1] = 1;
      o[2] = sat(main * main * 0.7);
    },
  },
  [SPRITE.ink]: {
    pix: (x, y, o) => {
      // 墨溅：边缘凹凸的墨团 + 五道粗短不一的甩尖(尖端带一滴) + 外圈零星墨点；G 通道给一点浓淡
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      const n = fbm2(x * 2.3 + 1.7, y * 2.3 + 5.1, 3, 61) - 0.5;
      let edge = 0.4 + n * 0.26 + 0.05 * Math.sin(a * 5 + 1.3);
      let m = 0;
      for (let i = 0; i < 5; i++) {
        const ai = (i / 5) * TAU + Math.sin(i * 5.3) * 0.4 + 0.3;
        const len = 0.14 + 0.26 * (0.5 + 0.5 * Math.sin(i * 3.1 + 1));
        let da = a - ai;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        edge += len * Math.exp(-da * da * 34);
        // 甩尖顶端的墨滴
        const tr = 0.52 + len * 0.95;
        const ts = 0.045 + 0.03 * Math.sin(i * 2.7 + 0.5);
        m = Math.max(m, sstep(ts, ts * 0.6, Math.hypot(x - Math.cos(ai) * tr, y - Math.sin(ai) * tr)));
      }
      m = Math.max(m, sstep(edge, edge - 0.08, r));
      for (let i = 0; i < 8; i++) {
        const ai = (i / 8) * TAU + Math.sin(i * 7.7) * 0.3 + 0.9;
        const ri = 0.7 + 0.18 * Math.sin(i * 4.3 + 2);
        const si = 0.025 + 0.035 * (0.5 + 0.5 * Math.sin(i * 6.1));
        m = Math.max(m, sstep(si, si * 0.6, Math.hypot(x - Math.cos(ai) * ri, y - Math.sin(ai) * ri)));
      }
      o[0] = m * sstep(1, 0.94, r);
      o[1] = sat(0.78 + n * 0.5);
      o[2] = 0;
    },
  },
  [SPRITE.scale]: {
    pix: (x, y, o) => {
      // 圆头菱形鳞片：后端圆、前端收尖；中脊亮、两侧压暗，片缘一圈细亮边
      const u = (x + 1) * 0.5;
      const w = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.75) * (1 - 0.3 * u) + 0.001;
      const d = Math.abs(y) / w;
      const m = sstep(1.0, 0.86, d) * sstep(-0.98, -0.9, x) * sstep(0.99, 0.9, x);
      o[0] = m;
      o[1] = sat(0.55 + 0.45 * (1 - d) - 0.12 * u + 0.25 * sstep(0.8, 0.95, d));
      o[2] = sat(Math.exp(-d * d * 30) * sstep(-0.6, 0.2, x) * 0.55 + sstep(0.82, 0.95, d) * m * 0.3);
    },
  },
  [SPRITE.puff]: {
    pix: (x, y, o) => {
      // 卷云团：外缘被两层噪声侵蚀，内部有一道绕心的涡纹(明暗)
      const r = Math.hypot(x, y);
      const n = fbm2(x * 2.1 + 3.1, y * 2.1 + 7.7, 3, 91) - 0.5;
      const n2 = fbm2(x * 5.3 + 1.9, y * 5.3 + 4.4, 2, 23) - 0.5;
      const d = r + n * 0.8 + n2 * 0.3;
      const a = Math.atan2(y, x);
      const curl = 0.5 + 0.5 * Math.sin(a * 2 + r * 9 + n * 6);
      o[0] = sstep(0.95, 0.25, d) * sstep(1.0, 0.85, r);
      o[1] = sat(0.62 + y * 0.12 + curl * 0.3 + n2 * 0.3);
      o[2] = sat(Math.exp(-r * r * 9) * 0.35);
    },
  },
  [SPRITE.broadleaf]: {
    pix: (x, y, o) => {
      // 阔叶：叶身宽在中前部，主脉 + 斜向侧脉压暗；叶柄从 -x 端伸出
      const u = (x + 0.82) / 1.74;
      const w = 0.46 * Math.pow(sat(Math.sin(Math.PI * sat(u))), 0.85) * (1 + 0.15 * (0.5 - Math.abs(u - 0.55))) + 0.001;
      const body = sstep(1.0, 0.9, Math.abs(y) / w) * sstep(-0.86, -0.8, x) * sstep(0.95, 0.9, x);
      const stem = Math.exp(-y * y * 900) * sstep(-0.98, -0.92, x) * sstep(-0.74, -0.8, x);
      const vein = Math.exp(-y * y * 600);
      const side = Math.abs(((x * 2.6 - Math.abs(y) * 2.2) % 1 + 1) % 1 - 0.5);
      const sideVein = sstep(0.06, 0.0, side) * sstep(0.95, 0.4, Math.abs(y) / w);
      o[0] = sat(Math.max(body, stem));
      o[1] = sat(0.82 + 0.18 * (y > 0 ? 1 : 0.6) - vein * 0.35 - sideVein * 0.22 - (1 - Math.abs(y) / w) * 0.05);
      o[2] = 0;
    },
  },
  [SPRITE.splash]: {
    pix: (x, y, o) => {
      // 俯视的一圈水花：断续的细水环 + 外圈一串大小不一的水珠，中心空
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      const gap = 0.5 + 0.5 * Math.sin(a * 7 + 1.3) * Math.sin(a * 3 - 0.4);
      const ring = Math.exp(-((r - 0.62) * (r - 0.62)) * 600) * sstep(0.2, 0.55, gap);
      let drop = 0;
      let core = 0;
      for (let i = 0; i < 15; i++) {
        const ai = (i / 15) * TAU + Math.sin(i * 7.31) * 0.18;
        const ri = 0.76 + 0.12 * Math.sin(i * 3.7 + 0.5);
        const si = 0.055 + 0.04 * (0.5 + 0.5 * Math.sin(i * 5.13));
        const dx = x - Math.cos(ai) * ri;
        const dy = y - Math.sin(ai) * ri;
        const dd = Math.hypot(dx, dy) / si;
        drop = Math.max(drop, sstep(1, 0.75, dd));
        core = Math.max(core, Math.exp(-(dx + si * 0.3) * (dx + si * 0.3) / (si * si * 0.08) - (dy - si * 0.3) * (dy - si * 0.3) / (si * si * 0.08)));
      }
      o[0] = sat(Math.max(ring * 0.75, drop));
      o[1] = sat(0.8 + 0.2 * (y > 0 ? 1 : 0.7));
      o[2] = sat(core * 0.8 + ring * 0.2);
    },
  },
  [SPRITE.star8]: {
    pix: (x, y, o) => {
      // 八芒星：四长四短的芒相间，中心一团亮核
      const r = Math.hypot(x, y);
      let ray = 0;
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 + Math.PI / 2;
        const len = i % 2 === 0 ? 0.96 : 0.56;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const along = x * c + y * sn;
        if (along <= 0) continue;
        const perp = Math.abs(-x * sn + y * c);
        const w = 0.16 * sat(1 - along / len) + 0.004;
        ray = Math.max(ray, sstep(w, w * 0.35, perp) * sstep(len, len * 0.9, along));
      }
      const g = Math.exp(-r * r * 26);
      o[0] = sat(ray + g * 0.85);
      o[1] = 1;
      o[2] = sat(g * 1.1 + ray * 0.35 * sstep(0.5, 0.0, r));
    },
  },
};

/** 生成粒子图集。调用方负责 dispose */
export function createFxAtlas(): THREE.DataTexture {
  const W = ATLAS_COLS * CELL;
  const H = ATLAS_ROWS * CELL;
  const mk = (fill: string): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas 不可用');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
    return [c, ctx];
  };
  const [, mctx] = mk('#000');
  const [, sctx] = mk('#fff');
  const data = new Uint8Array(W * H * 4);
  const cores = new Float32Array(ATLAS_COLS * ATLAS_ROWS);
  const pixCells: number[] = [];
  const scale = (CELL / 2) * 0.86;

  for (let i = 0; i < ATLAS_COLS * ATLAS_ROWS; i++) {
    const def = DEFS[i];
    if (!def) continue;
    const cx = (i % ATLAS_COLS) * CELL;
    const cy = Math.floor(i / ATLAS_COLS) * CELL;
    if (def.path) {
      for (const c of [mctx, sctx]) {
        c.save();
        c.beginPath();
        c.rect(cx, cy, CELL, CELL);
        c.clip();
        c.setTransform(scale, 0, 0, -scale, cx + CELL / 2, cy + CELL / 2);
      }
      def.path(mctx, sctx);
      mctx.restore();
      sctx.restore();
      cores[i] = def.core ?? 0;
    } else if (def.pix) pixCells.push(i);
  }

  // 路径图形：从两张画布读回
  const mimg = mctx.getImageData(0, 0, W, H).data;
  const simg = sctx.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const cell = Math.floor(y / CELL) * ATLAS_COLS + Math.floor(x / CELL);
      const m = mimg[o];
      data[o] = m;
      data[o + 1] = simg[o];
      data[o + 2] = Math.min(255, ((m * m) / 255) * cores[cell]);
      data[o + 3] = 255;
    }
  }
  // 逐像素图形：直接写数据
  const out = new Float32Array(3);
  for (const i of pixCells) {
    const fn = DEFS[i].pix as PixFn;
    const cx = (i % ATLAS_COLS) * CELL;
    const cy = Math.floor(i / ATLAS_COLS) * CELL;
    for (let py = 0; py < CELL; py++) {
      for (let px = 0; px < CELL; px++) {
        const x = (px + 0.5 - CELL / 2) / scale;
        const y = -(py + 0.5 - CELL / 2) / scale;
        const o = ((cy + py) * W + cx + px) * 4;
        if (Math.abs(x) >= 1 || Math.abs(y) >= 1) {
          data[o] = 0;
          data[o + 1] = 255;
          data[o + 2] = 0;
          data[o + 3] = 255;
          continue;
        }
        fn(x, y, out);
        data[o] = sat(out[0]) * 255;
        data[o + 1] = sat(out[1]) * 255;
        data[o + 2] = sat(out[2]) * 255;
        data[o + 3] = 255;
      }
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 2;
  tex.needsUpdate = true;
  tex.name = 'fx.atlas';
  return tex;
}

/**
 * 预乘混合输出片段：要求 main 里已有 `vec3 fxC`(HDR 颜色)、`float fxA`(覆盖率)、`float fxAdd`(1 = 纯叠加，0 = 普通透明)。
 * 材质用 CustomBlending(ONE, ONE_MINUS_SRC_ALPHA)，这样同一个 draw call 里可以混排叠加与遮挡两种粒子。
 * low 档直出屏幕时(TONE_MAPPING 已定义)：遮挡部分先对未预乘的颜色做色调映射再预乘；叠加部分用 kitAdditive 压到等效观感。
 */
export const GLSL_FX_OUT = /* glsl */ `
  #ifdef TONE_MAPPING
  // 遮挡部分(权重 1 - fxAdd)与叠加部分(权重 fxAdd)分别映射再合成。两部分不能先混色再统一乘系数：
  // 半叠加的粒子(0 < fxAdd < 1)那样算，覆盖率趋近 0 的外圈也会带着半份亮度，叠出一块边缘生硬的死白。
  gl_FragColor = vec4(fxC, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 fxOver = gl_FragColor.rgb * (fxA * (1.0 - fxAdd));
  gl_FragColor = vec4(kitAdditive(fxC * (fxA * fxAdd)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(fxOver + gl_FragColor.rgb, fxA * (1.0 - fxAdd));
  #else
  // HDR 路径的软上限(§7.1)：亮度 2.0 以下原样，以上平滑压向 3.2——只有小核心能明显越过 bloom 阈值 1.35，
  // 几层亮光叠在同一处也不会冲成一大团白
  float fxM = max(fxC.r, max(fxC.g, fxC.b));
  if (fxM > 2.0) fxC *= (2.0 + (fxM - 2.0) / (1.0 + (fxM - 2.0) / 1.2)) / fxM;
  gl_FragColor = vec4(fxC * fxA, fxA * (1.0 - fxAdd));
  #endif
`;

/** 与 GLSL_FX_OUT 配套的材质混合设置 */
export function applyFxBlending(mat: THREE.Material): void {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor;
  mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  mat.premultipliedAlpha = true;
}
