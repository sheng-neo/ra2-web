/**
 * 墙体 → 断崖石台。每个 walls 多边形从地面轮廓(与碰撞边界严格重合，凸角略切圆)逐环内缩、升高挤出：
 * 崖脚 → 岩壁 → 窄石台 → 上段岩壁 → 亮色崖沿 → 微微隆起的苔草顶面。
 * 内缩量被钳制在多边形中轴线上，所以任意凸/近凸多边形都不会自相交。
 */
import { fbm2, hash2, PALETTE } from '../materials';
import type { Polygon } from '../../core/types';
import { polygonSignedDist } from './field';
import { type MeshBuilder, type OutlinePoint, type RGB, denseOutline, extrudeRings, lerp, mixRgb, rgb, scaleRgb } from './geo';

export interface CliffInfo {
  poly: Polygon;
  /** 崖沿高度 */
  height: number;
  /** 多边形内最大的内切距离 */
  inradius: number;
  /** 顶面在「距边界 d 米」处的高度 */
  topY(d: number): number;
}

/** 顶面剖面(内缩距离 → 相对崖沿的高度) */
const TOP_PROFILE: [number, number][] = [
  [0.85, 0],
  [1.5, 0.08],
  [2.6, 0.24],
  [4.2, 0.4],
  [7, 0.5],
  [30, 0.52],
];

function profileY(d: number): number {
  const P = TOP_PROFILE;
  if (d <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (d <= P[i][0]) return lerp(P[i - 1][1], P[i][1], (d - P[i - 1][0]) / (P[i][0] - P[i - 1][0]));
  }
  return P[P.length - 1][1];
}

interface Reach {
  /** 沿挤出方向能达到的最大「距边界距离」 */
  maxD: number;
  /** 距离 → 沿法线参数 的换算系数(拐角处 > 1) */
  k: number;
}

/** 沿内法线步进，找到距边界距离的峰值(中轴线) */
function measureReach(poly: Polygon, p: OutlinePoint): Reach {
  const q = { x: 0, y: 0 };
  let bestD = 0;
  let bestU = 0;
  const step = 0.12;
  for (let u = step; u < 16; u += step) {
    q.x = p.x + p.nx * u;
    q.y = p.z + p.nz * u;
    const d = -polygonSignedDist(q, poly);
    if (d > bestD) {
      bestD = d;
      bestU = u;
    } else if (d < bestD - 0.02) break;
  }
  return { maxD: Math.max(bestD, 0.05), k: bestU > 0 ? bestU / Math.max(bestD, 0.05) : 1 };
}

const ROCK_DARK = rgb(PALETTE.env.rockDark);
const ROCK = rgb(PALETTE.env.rock);
const ROCK_LIGHT = rgb(PALETTE.env.rockLight);
const ROCK_WARM = rgb(0xcdc7b6);
const MOSS = rgb(0x4d9259);
const TOP_GRASS = rgb(0x5fa456);
const TOP_GRASS_LIGHT = rgb(0x86bd58);

/** 把一个墙体多边形挤出进 builder，返回供植被/点缀摆放用的信息 */
export function buildCliff(b: MeshBuilder, poly: Polygon, seed: number): CliffInfo {
  const outline = denseOutline(poly, 1.1, 0.85, (i) => hash2(i, seed, 3));
  const reach = outline.map((p) => measureReach(poly, p));
  let inradius = 0;
  for (const r of reach) inradius = Math.max(inradius, r.maxD);
  // 体量越大的山体越高一点
  const H = 2.15 + Math.min(0.75, inradius * 0.14) + hash2(seed, 7, 1) * 0.3;
  const n = outline.length;
  // 每一列的随机量：崖沿起伏、石台高度、裂隙
  const rimY: number[] = [];
  const ledgeY: number[] = [];
  const crack: number[] = [];
  const tone: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = outline[i].s;
    rimY.push(H + (fbm2(s * 0.22, seed * 0.37, 3, seed) - 0.5) * 0.7);
    ledgeY.push(0.85 + (fbm2(s * 0.5 + 9.1, seed * 0.11, 2, seed + 5) - 0.5) * 0.9);
    crack.push(hash2(i, seed, 23) < 0.16 ? 1 : 0);
    tone.push(0.9 + hash2(i, seed, 31) * 0.2);
  }
  const RINGS = 11;
  extrudeRings(b, outline, true, RINGS, (p, i, k) => {
    const r = reach[i];
    const j = (hash2(i * 7 + k, seed, 41) - 0.5) * 0.1;
    const c = crack[i];
    let d: number;
    let y: number;
    let color: RGB;
    let ao = 1;
    const rim = rimY[i];
    switch (k) {
      case 0: // 崖脚：与碰撞轮廓重合
        d = 0;
        y = -0.05;
        color = scaleRgb(ROCK_DARK, 0.7);
        ao = 0.55;
        break;
      case 1:
        d = 0.07 + j * 0.6 + c * 0.14;
        y = ledgeY[i] - 0.1;
        color = mixRgb(ROCK_DARK, ROCK, 0.6 - c * 0.3);
        ao = 0.8;
        break;
      case 2: // 窄石台(朝上的小面，接住高光)
        d = 0.27 + j + c * 0.12;
        y = ledgeY[i] + 0.06;
        color = mixRgb(ROCK_LIGHT, MOSS, hash2(i, seed, 51) * 0.45);
        break;
      case 3:
        d = 0.34 + j + c * 0.2;
        y = lerp(ledgeY[i], rim, 0.55);
        color = mixRgb(ROCK, ROCK_DARK, c * 0.4);
        break;
      case 4:
        d = 0.5 + j + c * 0.16;
        y = rim - 0.12;
        color = mixRgb(ROCK, ROCK_LIGHT, 0.55);
        break;
      case 5: // 崖沿：暖亮的石边，勾出台地轮廓
        d = 0.85;
        y = rim;
        color = mixRgb(ROCK_LIGHT, ROCK_WARM, 0.6);
        break;
      default: {
        d = TOP_PROFILE[k - 5][0];
        const de = Math.min(d, r.maxD);
        // 越往里越接近统一高度，抹平崖沿的起伏
        const blend = Math.min(1, (de - 0.85) / 2.2);
        y = lerp(rim, H, blend) + profileY(de);
        const g = mixRgb(MOSS, mixRgb(TOP_GRASS, TOP_GRASS_LIGHT, fbm2(p.x * 0.3 + i * 0.01, p.z * 0.3, 2, seed)), Math.min(1, (de - 0.85) / 1.6));
        color = k === 6 ? mixRgb(mixRgb(ROCK_LIGHT, ROCK_WARM, 0.5), g, 0.7) : g;
      }
    }
    const de = Math.min(d, r.maxD);
    return { t: de * r.k, y, color: scaleRgb(color, tone[i]), ao };
  });
  return {
    poly,
    height: H,
    inradius,
    topY: (d: number) => H + profileY(d),
  };
}
