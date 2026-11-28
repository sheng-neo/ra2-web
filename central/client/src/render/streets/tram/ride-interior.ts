/**
 * 搭電車的上层车厢内景（R4 STREET S-P1-3，取代 R2 只有车头墙的 rideFrameGeometry）：相机为原点，电车局部轴 x 向前、y 向上、z 向右。
 * 上层地板在眼下 1.4 m（眼离轨顶 3.8 m，地板离轨顶约 2.4 m）；车头墙在前 1.1 m（R2 的造型：窗下台面、两根中窗柱、角柱、窗顶横梁）；
 * 两侧墙在 ±1.15 m：窗台在眼下 0.55 m（离地板约 0.85 m）、窗顶在眼上 0.2 m、再上是一条顶窗，窗柱黑色（#232429）每 1 m 一根、6 cm 宽，
 * 窗洞不封玻璃（侧看时街景不被挡）；窗下是铝板墙（#c9d4d8，车厢灯照着，压暗到不抢窗外街景）、天花两条冷白灯带、深色地板、柚木色条形座椅（#451410）
 * 一排排往后。整体在 trams.ts 里按 RIDE_FRAME_SCALE 绕相机放大（透视不变，留出近裁面余量）。约 330 个三角形，1 个 draw call。
 */
import type { BufferGeometry } from 'three';
import { lightV3 } from '../vehicles';
import { PropBuilder, linearRGB, type FaceStyle, type V3 } from '../prop-geometry';

const ALU = linearRGB('#c9d4d8');
const FRAME = linearRGB('#232429');
const TEAK = linearRGB('#451410');
/** 车厢灯背光的面（窗台、天花斜面）：深灰铝。 */
const SHADE = linearRGB('#5a6064');

/** 面朝相机（原点）的四边形：自动调绕向。 */
function inward(b: PropBuilder, a: V3, c: V3, d: V3, e: V3, st: FaceStyle): void {
  const ux = c[0] - a[0];
  const uy = c[1] - a[1];
  const uz = c[2] - a[2];
  const vx = e[0] - a[0];
  const vy = e[1] - a[1];
  const vz = e[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const cx = (a[0] + c[0] + d[0] + e[0]) / 4;
  const cy = (a[1] + c[1] + d[1] + e[1]) / 4;
  const cz = (a[2] + c[2] + d[2] + e[2]) / 4;
  if (nx * cx + ny * cy + nz * cz > 0) b.quad(e, d, c, a, st);
  else b.quad(a, c, d, e, st);
}

/** 两面都画（座椅靠背：前后都看得到）。 */
function both(b: PropBuilder, a: V3, c: V3, d: V3, e: V3, st: FaceStyle): void {
  b.quad(a, c, d, e, st);
  b.quad(e, d, c, a, st);
}

export const INTERIOR = {
  front: 1.1,
  back: -8.6,
  side: 1.15,
  floor: -1.4,
  ceil: 0.36,
  sill: -0.62,
  winTop: 0.2,
  topLight: 0.32,
} as const;

export function rideInteriorGeometry(): BufferGeometry {
  const b = new PropBuilder();
  const I = INTERIOR;
  const lit = (k: number, alb: V3 = [0.03, 0.03, 0.032]): FaceStyle => ({ alb, em: lightV3('tubeCool', k) });
  // 车厢灯照着的面：自身颜色 × 照度（冷白 LED 下铝板仍是灰、柚木仍是红褐，不被冷白发光冲成一片灰）
  const self = (alb: V3, k: number): FaceStyle => ({ alb, em: [alb[0] * k, alb[1] * k, alb[2] * k] });
  const frame = self(FRAME, 0.5);
  const panel = { ...self(ALU, 0.05), emGrad: [0.55, 1.1] as const };
  // ---- 车头墙（R2 造型）----
  const fx = I.front;
  const y0 = -0.5;
  const y1 = 0.22;
  const wall = (z0: number, z1: number, ya: number, yb: number, st: FaceStyle) => inward(b, [fx, ya, z0], [fx, ya, z1], [fx, yb, z1], [fx, yb, z0], st);
  wall(-I.side, I.side, I.floor, y0, lit(0.02, [0.02, 0.02, 0.022]));
  wall(-I.side, I.side, y1, I.ceil, lit(0.04));
  inward(b, [fx - 0.25, y0, -I.side], [fx - 0.25, y0, I.side], [fx, y0, I.side], [fx, y0, -I.side], lit(0.02));
  inward(b, [fx - 0.27, y0 - 0.03, -I.side], [fx - 0.27, y0 - 0.03, I.side], [fx - 0.25, y0, I.side], [fx - 0.25, y0, -I.side], lit(0.12));
  for (const [za, zb] of [
    [-I.side, -1.0],
    [-0.45, -0.36],
    [0.36, 0.45],
    [1.0, I.side],
  ] as const)
    wall(za, zb, y0, y1, frame);
  // ---- 两侧墙：窗下铝板、窗台、窗柱、窗顶横梁与顶窗框、顶窗上沿 ----
  for (const s of [-1, 1]) {
    const z = s * I.side;
    const side = (xa: number, xb: number, ya: number, yb: number, st: FaceStyle) => inward(b, [xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z], st);
    side(I.back, fx, I.floor, I.sill, panel);
    // 窗台面（向车内伸 0.1 m）+ 一道亮边
    // 复审修正：窗台、天花斜面、顶窗上沿压暗（原来是大片浅灰的平面，占了画面三成）；窗柱 4 cm、角柱 6 cm
    inward(b, [I.back, I.sill, z], [fx, I.sill, z], [fx, I.sill, z - s * 0.08], [I.back, I.sill, z - s * 0.08], self(SHADE, 0.05));
    // 窗柱：每 1 m 一根（窗中心在 x = 0.05、−0.95 …，侧看正中不是窗柱）
    for (let x = 0.55; x > I.back; x -= 1.0) side(x - 0.02, x + 0.02, I.sill, I.topLight, frame);
    side(fx - 0.06, fx, I.sill, I.topLight, frame);
    // 窗顶横梁（3 cm）、顶窗上沿到天花
    side(I.back, fx, I.winTop, I.winTop + 0.03, frame);
    side(I.back, fx, I.topLight, I.ceil, self(SHADE, 0.04));
    // 天花与侧墙之间的圆角（斜面）
    inward(b, [I.back, I.ceil, z], [fx, I.ceil, z], [fx, I.ceil + 0.06, z - s * 0.2], [I.back, I.ceil + 0.06, z - s * 0.2], self(SHADE, 0.05));
  }
  // ---- 天花（略拱）与两条冷白灯带 ----
  inward(b, [I.back, I.ceil + 0.06, -I.side + 0.2], [fx, I.ceil + 0.06, -I.side + 0.2], [fx, I.ceil + 0.06, I.side - 0.2], [I.back, I.ceil + 0.06, I.side - 0.2], lit(0.05, [0.12, 0.12, 0.12]));
  for (const zc of [-0.5, 0.5]) inward(b, [I.back, I.ceil + 0.055, zc - 0.03], [fx - 0.02, I.ceil + 0.055, zc - 0.03], [fx - 0.02, I.ceil + 0.055, zc + 0.03], [I.back, I.ceil + 0.055, zc + 0.03], lit(1.1, [0.6, 0.6, 0.6]));
  // ---- 地板、后墙 ----
  inward(b, [I.back, I.floor, -I.side], [fx, I.floor, -I.side], [fx, I.floor, I.side], [I.back, I.floor, I.side], lit(0.012, [0.02, 0.02, 0.02]));
  inward(b, [I.back, I.floor, -I.side], [I.back, I.floor, I.side], [I.back, I.ceil + 0.06, I.side], [I.back, I.ceil + 0.06, -I.side], panel);
  // ---- 座椅：每排两侧各一张柚木条形椅（坐垫 + 靠背），一排排往后 ----
  const seat = self(TEAK, 0.3);
  const seatTop = I.floor + 0.45;
  for (let row = 0; row < 10; row++) {
    const x = -0.15 - row * 0.8;
    for (const s of [-1, 1]) {
      const za = s * 0.32;
      const zb = s * (I.side - 0.06);
      inward(b, [x - 0.2, seatTop, za], [x + 0.22, seatTop, za], [x + 0.22, seatTop, zb], [x - 0.2, seatTop, zb], seat);
      both(b, [x - 0.2, seatTop, za], [x - 0.2, seatTop, zb], [x - 0.26, seatTop + 0.42, zb], [x - 0.26, seatTop + 0.42, za], seat);
    }
  }
  return b.build();
}
