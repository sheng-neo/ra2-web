/**
 * 基地与高地的建筑构件原型(队伍风格：蓝方 = 白石 + 蓝晶 + 金箍；红方 = 玄武岩 + 绯晶 + 余烬金)：
 *   门阙     紧邻基地的山体转角处的高方柱，柱顶托一枚队伍色晶体；
 *   垛口     城垣顶上的一排方垛；      扶壁   贴着城垣内壁的斜撑；
 *   队徽浮雕 城垣内壁上的圆形徽记(蓝 = 八芒星套环，红 = 三焰套环)；
 *   矮灯台   泉水池边的小灯(≤ 0.4 米)。
 * 地面高度不能动(玩法是平的)，「高地感」靠这些门与边界构件给出。全部并进景物分块网格。
 */
import * as THREE from 'three';
import { PALETTE } from '../materials';
import { MeshBuilder, type RGB, mixRgb, rgb, scaleRgb } from './geo';
import { addSlab } from './lanes';
import { addBlob, addCrystal, addTube } from './models';

const TAU = Math.PI * 2;

export interface TeamLook {
  /** 建筑石：亮面 / 暗面 */
  stone: RGB;
  stoneDark: RGB;
  /** 金属饰件 */
  trim: RGB;
  /** 晶体 / 发光 */
  glow: RGB;
  /** 旗面 */
  cloth: RGB;
}

export const TEAM_LOOKS: [TeamLook, TeamLook] = [
  { stone: rgb(PALETTE.blue.stone), stoneDark: rgb(PALETTE.blue.stoneDark), trim: rgb(PALETTE.blue.trim), glow: rgb(PALETTE.blue.glow), cloth: rgb(0x2f6fe0) },
  { stone: rgb(0x6a5a62), stoneDark: rgb(PALETTE.red.stoneDark), trim: rgb(PALETTE.red.trim), glow: rgb(PALETTE.red.glow), cloth: rgb(0xd8352c) },
];

const _m = new THREE.Matrix4();

/** 门阙：局部原点在地面，总高 4 米(用 y 向缩放调)。柱顶的晶体单独一个原型(整体发光) */
function makeGatePillar(look: TeamLook): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const dark = look.stoneDark;
  const stone = look.stone;
  // 柱础(两级) → 收分柱身 → 柱头外挑
  addTube(
    b,
    [
      [0, -0.2, 0, 0.92],
      [0, 0.45, 0, 0.92],
      [0, 0.55, 0, 0.78],
      [0, 0.8, 0, 0.78],
      [0, 0.9, 0, 0.62],
      [0, 3.1, 0, 0.54],
      [0, 3.22, 0, 0.72],
      [0, 3.5, 0, 0.76],
      [0, 3.6, 0, 0.6],
    ],
    { sides: 4, c0: dark, c1: stone, cap: true, flat: true },
  );
  // 两道金箍
  for (const y of [1.25, 2.75]) addTube(b, [[0, y, 0, 0.64], [0, y + 0.14, 0, 0.63]], { sides: 4, c0: look.trim, c1: scaleRgb(look.trim, 1.15), flat: true });
  // 柱身正面与侧面的竖向刻槽(队伍色，微光)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const d = 0.415;
    const w = 0.05;
    const tx = -nz * w;
    const tz = nx * w;
    const c = look.glow;
    const v0 = b.vertex(nx * d - tx, 1.55, nz * d - tz, c, nx, 0, nz, 0, 0.35);
    const v1 = b.vertex(nx * d + tx, 1.55, nz * d + tz, c, nx, 0, nz, 0, 0.35);
    const v2 = b.vertex(nx * (d - 0.02) + tx, 2.6, nz * (d - 0.02) + tz, c, nx, 0, nz, 0, 0.35);
    const v3 = b.vertex(nx * (d - 0.02) - tx, 2.6, nz * (d - 0.02) - tz, c, nx, 0, nz, 0, 0.35);
    b.quad(v0, v1, v2, v3);
  }
  // 柱顶四角的小尖
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    addCrystal(b, Math.cos(a) * 0.5, 3.55, Math.sin(a) * 0.5, 0.38, 0.09, 0, 0, look.trim, scaleRgb(look.trim, 1.2), 0.1, i);
  }
  return b.build();
}

/** 门阙顶上悬着的队伍色晶体(发光) */
function makeGateCrystal(look: TeamLook): THREE.BufferGeometry {
  const b = new MeshBuilder();
  addCrystal(b, 0, 4.0, 0, 1.15, 0.26, 0, 0, scaleRgb(look.glow, 0.7), mixRgb(look.glow, [1, 1, 1], 0.35), 1, 3);
  addCrystal(b, 0, 4.05, 0, 0.5, 0.26, Math.PI, 0, scaleRgb(look.glow, 0.7), look.glow, 1, 4);
  return b.build();
}

/** 垛口：一块带压顶的方垛(局部 x 沿城墙走向) */
function makeMerlon(look: TeamLook): THREE.BufferGeometry {
  const b = new MeshBuilder();
  _m.identity();
  addSlab(b, _m, 0.95, 0.6, 0.62, 0.02, look.stone, mixRgb(look.stoneDark, look.stone, 0.5));
  _m.makeTranslation(0, 0.62, 0);
  addSlab(b, _m, 1.05, 0.7, 0.12, 0.03, mixRgb(look.stone, [1, 1, 1], 0.12), look.stone);
  return b.build();
}

/** 扶壁：贴着城垣内壁的斜撑。局部 +x 朝外(离开墙面)，原点在墙脚，高 2.4 米 */
function makeButtress(look: TeamLook): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const hw = 0.42;
  const dark = look.stoneDark;
  const stone = look.stone;
  // 侧面轮廓(x, y)：下宽上窄，中间一道腰线
  const prof: [number, number][] = [
    [0.5, -0.1],
    [0.5, 0.35],
    [0.38, 0.5],
    [0.3, 1.5],
    [0.18, 1.65],
    [0.1, 2.3],
    [0, 2.4],
  ];
  const quad = (p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number], c0: RGB, c1: RGB): void => {
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p3[0] - p0[0];
    const vy = p3[1] - p0[1];
    const vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i0 = b.vertex(p0[0], p0[1], p0[2], c0, nx, ny, nz);
    const i1 = b.vertex(p1[0], p1[1], p1[2], c0, nx, ny, nz);
    const i2 = b.vertex(p2[0], p2[1], p2[2], c1, nx, ny, nz);
    const i3 = b.vertex(p3[0], p3[1], p3[2], c1, nx, ny, nz);
    b.quad(i0, i1, i2, i3);
  };
  for (let i = 0; i < prof.length - 1; i++) {
    const [x0, y0] = prof[i];
    const [x1, y1] = prof[i + 1];
    const t0 = i / (prof.length - 1);
    const t1 = (i + 1) / (prof.length - 1);
    const c0 = mixRgb(dark, stone, t0);
    const c1 = mixRgb(dark, stone, t1);
    // 正面
    quad([x0, y0, hw], [x0, y0, -hw], [x1, y1, -hw], [x1, y1, hw], c0, c1);
    // 两个侧面
    quad([-0.1, y0, hw], [x0, y0, hw], [x1, y1, hw], [-0.1, y1, hw], scaleRgb(c0, 0.9), scaleRgb(c1, 0.9));
    quad([x0, y0, -hw], [-0.1, y0, -hw], [-0.1, y1, -hw], [x1, y1, -hw], scaleRgb(c0, 0.9), scaleRgb(c1, 0.9));
  }
  // 腰线上一道金线
  quad([0.39, 0.5, hw + 0.005], [0.39, 0.5, -hw - 0.005], [0.385, 0.58, -hw - 0.005], [0.385, 0.58, hw + 0.005], look.trim, look.trim);
  return b.build();
}

/**
 * 队徽浮雕：圆形石盘(直径 1.7 米)，局部 +x 朝外。蓝 = 八芒星套环，红 = 三焰套环；徽记微微发光。
 */
function makeEmblem(look: TeamLook, flames: boolean): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const R = 0.85;
  const segs = 16;
  // 石盘：正面 + 一圈倒角
  const c = b.vertex(0.1, 0, 0, look.stone, 1, 0, 0);
  const inner: number[] = [];
  const outer: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU;
    inner.push(b.vertex(0.1, Math.sin(a) * R * 0.9, Math.cos(a) * R * 0.9, mixRgb(look.stoneDark, look.stone, 0.7), 1, 0, 0));
    outer.push(b.vertex(0, Math.sin(a) * R, Math.cos(a) * R, look.stoneDark, 0.5, Math.sin(a) * 0.86, Math.cos(a) * 0.86));
  }
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    b.tri(c, inner[i], inner[j]);
    b.quad(inner[i], outer[i], outer[j], inner[j]);
  }
  // 徽记：贴在盘面上的发光薄片
  const col = mixRgb(look.glow, look.trim, 0.25);
  const lift = 0.115;
  const strip = (pts: [number, number][], w: number, closed: boolean): void => {
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const [y0, z0] = pts[i];
      const [y1, z1] = pts[(i + 1) % n];
      const dy = y1 - y0;
      const dz = z1 - z0;
      const l = Math.hypot(dy, dz) || 1;
      const oy = (-dz / l) * w;
      const oz = (dy / l) * w;
      const v0 = b.vertex(lift, y0 - oy, z0 - oz, col, 1, 0, 0, 0, 0.4);
      const v1 = b.vertex(lift, y0 + oy, z0 + oz, col, 1, 0, 0, 0, 0.4);
      const v2 = b.vertex(lift, y1 + oy, z1 + oz, col, 1, 0, 0, 0, 0.4);
      const v3 = b.vertex(lift, y1 - oy, z1 - oz, col, 1, 0, 0, 0, 0.4);
      b.quad(v0, v1, v2, v3);
      b.quad(v3, v2, v1, v0);
    }
  };
  // 外环
  const ring: [number, number][] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    ring.push([Math.sin(a) * R * 0.72, Math.cos(a) * R * 0.72]);
  }
  strip(ring, 0.03, true);
  if (!flames) {
    // 八芒星
    const star: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const r = R * (i % 2 === 0 ? 0.6 : 0.27);
      star.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    strip(star, 0.03, true);
  } else {
    // 三焰：三道由下向上收尖的火舌(中间高、两侧矮)
    for (const k of [-1, 0, 1]) {
      const h = k === 0 ? 0.56 : 0.4;
      const z = k * 0.26;
      const base = -0.34;
      strip(
        [
          [base, z - 0.13],
          [base + h * 0.45, z - 0.15 + k * 0.03],
          [base + h, z + k * 0.06],
          [base + h * 0.5, z + 0.13 + k * 0.03],
          [base, z + 0.13],
        ],
        0.028,
        true,
      );
    }
  }
  return b.build();
}

/** 矮灯台(≤ 0.4 米)：八角小座托着一粒发光晶体 */
function makeLowLamp(look: TeamLook): THREE.BufferGeometry {
  const b = new MeshBuilder();
  addTube(b, [[0, -0.05, 0, 0.2], [0, 0.1, 0, 0.2], [0, 0.14, 0, 0.13], [0, 0.22, 0, 0.11], [0, 0.26, 0, 0.16]], { sides: 8, c0: look.stoneDark, c1: look.stone, cap: true, flat: true });
  addBlob(b, 0, 0.32, 0, 0.075, 0.09, 0.075, { detail: 0, seed: 5, bottom: look.glow, top: mixRgb(look.glow, [1, 1, 1], 0.5), glow: 1 });
  return b.build();
}

export interface ArchitectureKit {
  gatePillar: THREE.BufferGeometry;
  gateCrystal: THREE.BufferGeometry;
  merlon: THREE.BufferGeometry;
  buttress: THREE.BufferGeometry;
  emblem: THREE.BufferGeometry;
  lowLamp: THREE.BufferGeometry;
  dispose(): void;
}

export function createArchitectureKit(team: 0 | 1): ArchitectureKit {
  const look = TEAM_LOOKS[team];
  const kit = {
    gatePillar: makeGatePillar(look),
    gateCrystal: makeGateCrystal(look),
    merlon: makeMerlon(look),
    buttress: makeButtress(look),
    emblem: makeEmblem(look, team === 1),
    lowLamp: makeLowLamp(look),
  };
  return { ...kit, dispose: () => Object.values(kit).forEach((g) => g.dispose()) };
}
