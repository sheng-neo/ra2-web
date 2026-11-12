/**
 * 墙体 → 断崖石台。每个 walls 多边形从地面轮廓(与碰撞边界严格重合，凸角略切圆)逐环内缩、升高挤出。
 *
 * 读成「垒起来的岩块」而不是一条挤出带：
 *   - 轮廓点每 2~4 个编成一「柱」，同柱共用进深、崖沿高度与石台高度；柱与柱之间插一道内凹的竖缝(顶点 AO 压暗)；
 *   - 每柱分上下两块：下块 → 一级小石台(朝上的面接高光、长苔) → 上块 → 圆角崖沿；
 *   - 三种剖面：阶地型(石台宽、上块后退)、陡壁型(近乎直立)、石脊型(窄墙体：更矮、错落更大的一道矮岩墙，顶上只长灌木与矮树)；
 *   - 崖沿不再是一圈亮边：只有约三成的柱露出暖石沿，其余由苔与草盖过来；
 *   - 顶面多环细分，顶点色按世界坐标的噪声做草色斑(细节纹理由材质的顶面贴图给)。
 * 内缩量被钳制在多边形中轴线上，所以任意凸/近凸多边形都不会自相交。崖脚轮廓始终与碰撞多边形重合。
 */
import { fbm2, hash2, PALETTE, Rng } from '../materials';
import type { Polygon, Vec2 } from '../../core/types';
import { polygonSignedDist } from './field';
import { type MeshBuilder, type OutlinePoint, type RGB, denseOutline, extrudeRings, lerp, mixRgb, outlineNormals, rgb, scaleRgb, smoothstep } from './geo';

export type CliffKind = 'terrace' | 'steep' | 'ridge';

/** 崖沿一圈上的一个采样点(挂草帘/藤蔓、摆崖脚碎石用) */
export interface CliffRimPoint {
  /** 崖脚(碰撞轮廓)上的位置 */
  x: number;
  z: number;
  /** 朝外(离开山体)的水平单位方向 */
  ox: number;
  oz: number;
  /** 崖沿高度，以及崖沿相对崖脚向里收了多少 */
  y: number;
  inset: number;
  /** 这一柱露出暖石沿(不挂草帘) */
  bare: boolean;
}

/** 壁龛：崖脚上加宽的一级石台，上面可以立高的装饰构件 */
export interface CliffNiche {
  /** 台面中心(世界坐标)与台面高度 */
  x: number;
  z: number;
  y: number;
  /** 朝外的水平单位方向(构件面朝它) */
  ox: number;
  oz: number;
}

export interface CliffInfo {
  poly: Polygon;
  kind: CliffKind;
  /** 崖沿基准高度 */
  height: number;
  /** 多边形内最大的内切距离 */
  inradius: number;
  /** 顶面在「距边界 d 米」处的高度 */
  topY(d: number): number;
  rim: CliffRimPoint[];
  niches: CliffNiche[];
}

export interface CliffOptions {
  /** 在这些位置附近的崖脚开壁龛(取离它最近的轮廓点) */
  niches?: Vec2[];
}

/** 顶面草地写进 aFx.z 的岩石肌理权重(见上) */
export const TOP_TEX = 0.4;
/** 顶面各环到崖脚的距离(第一环 = 崖沿) */
const RIM_D = 0.8;
const TOP_D = [RIM_D, 1.3, 1.95, 2.8, 3.9, 5.3, 7.2, 30];

/** 顶面剖面(内缩距离 → 相对崖沿的高度)：微微隆起 */
const TOP_PROFILE: [number, number][] = [
  [RIM_D, 0],
  [1.5, 0.08],
  [2.6, 0.22],
  [4.2, 0.36],
  [7, 0.46],
  [30, 0.48],
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

const E = PALETTE.env;
const ROCK_DARK = rgb(E.rockDark);
const ROCK = rgb(E.rock);
const ROCK_LIGHT = rgb(E.rockLight);
const ROCK_WARM = rgb(E.rockWarm);
const MOSS = rgb(E.moss);
const TOP_GRASS = rgb(E.cliffGrass);
const TOP_GRASS_LIGHT = rgb(E.cliffGrassLight);
const TOP_GRASS_DRY = rgb(0x8f9a52);
const TOP_SOIL = rgb(0x6b6146);

/** 一「柱」岩块的参数 */
interface Column {
  /** 上块相对下块再往里收多少 */
  inset: number;
  /** 崖沿相对基准高度的偏移 */
  rimDy: number;
  /** 一级石台的高度与宽度 */
  ledgeY: number;
  shelf: number;
  /** 明度 */
  tone: number;
  /** 露出暖石沿 */
  bare: boolean;
  /** 石台上的苔量 */
  moss: number;
  /** 上块前脸的收分(顶部比底部再往里收多少) */
  batter: number;
  /** 这一柱右侧竖缝的进深 */
  groove: number;
}

interface ColPoint {
  col: number;
  /** 1 = 柱间竖缝的谷底 */
  groove: number;
  /** 壁龛权重 0..1 */
  niche: number;
}

/** 竖缝的半宽(米)；进深每柱各不相同 */
const GROOVE_HALF = 0.12;
/** 壁龛：台面高度与进深 */
const NICHE_Y = 0.85;
const NICHE_DEPTH = 1.0;

/** 把一个墙体多边形挤出进 builder，返回供植被/点缀摆放用的信息 */
export function buildCliff(b: MeshBuilder, poly: Polygon, seed: number, opts: CliffOptions = {}): CliffInfo {
  const base = denseOutline(poly, 1.1, 0.85, (i) => hash2(i, seed, 3));
  const rng = new Rng(seed * 7919 + 13);

  // ── 分柱：每 2~4 个轮廓点一柱，柱界处把该点换成「左沿 / 缝底 / 右沿」三个点 ──
  const nb = base.length;
  const pts: Vec2[] = [];
  const meta: ColPoint[] = [];
  let col = 0;
  let left = 1 + rng.int(4);
  for (let i = 0; i < nb; i++) {
    const p = base[i];
    left--;
    // 最后一柱至少留两个点，免得首尾接成一根细条
    if (left <= 0 && i > 0 && i < nb - 1) {
      const prev = base[i - 1];
      const next = base[i + 1];
      const lp = Math.hypot(p.x - prev.x, p.z - prev.z) || 1;
      const ln = Math.hypot(next.x - p.x, next.z - p.z) || 1;
      const hp = Math.min(GROOVE_HALF, lp * 0.3);
      const hn = Math.min(GROOVE_HALF, ln * 0.3);
      pts.push({ x: p.x + ((prev.x - p.x) / lp) * hp, y: p.z + ((prev.z - p.z) / lp) * hp });
      meta.push({ col, groove: 0, niche: 0 });
      pts.push({ x: p.x, y: p.z });
      meta.push({ col, groove: 1, niche: 0 });
      col++;
      pts.push({ x: p.x + ((next.x - p.x) / ln) * hn, y: p.z + ((next.z - p.z) / ln) * hn });
      meta.push({ col, groove: 0, niche: 0 });
      left = 1 + rng.int(4);
    } else {
      pts.push({ x: p.x, y: p.z });
      meta.push({ col, groove: 0, niche: 0 });
    }
  }
  const colCount = col + 1;
  // denseOutline 已经把点序统一成「左手侧 = 多边形内侧」，这里直接按同一约定求法线
  const outline = outlineNormals(pts, true);
  const n = outline.length;
  const reach = outline.map((p) => measureReach(poly, p));
  let inradius = 0;
  for (const r of reach) inradius = Math.max(inradius, r.maxD);

  // ── 剖面类型与高度：窄墙体做成低矮的石脊；其余在阶地 / 陡壁之间按种子选 ──
  const kind: CliffKind = inradius < 2.62 ? 'ridge' : hash2(seed, 11, 5) < 0.5 ? 'terrace' : 'steep';
  const H = kind === 'ridge' ? 1.75 + hash2(seed, 7, 1) * 0.35 : 2.3 + Math.min(0.7, inradius * 0.13) + hash2(seed, 7, 1) * 0.35;

  // ── 壁龛：离给定位置最近的轮廓点及其两侧 ──
  const nicheAt: number[] = [];
  for (const q of opts.niches ?? []) {
    let best = -1;
    let bd = 2.5;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(outline[i].x - q.x, outline[i].z - q.y);
      if (d < bd && reach[i].maxD > NICHE_DEPTH + 0.9) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) continue;
    nicheAt.push(best);
    for (let k = -3; k <= 3; k++) {
      const j = (best + k + n) % n;
      const w = Math.abs(k) <= 1 ? 1 : Math.abs(k) === 2 ? 0.65 : 0.2;
      meta[j].niche = Math.max(meta[j].niche, w);
    }
  }

  // ── 每柱参数：相邻两柱的石台高度、进深、收分都明显不同，才像垒起来的岩块而不是一道挡土墙 ──
  const cols: Column[] = [];
  for (let c = 0; c < colCount; c++) {
    const terrace = kind === 'terrace';
    // 三成的柱是一整块直立的岩面(几乎没有石台)，其余分上下两块
    const slab = rng.chance(terrace ? 0.15 : 0.35);
    cols.push({
      inset: rng.range(0, terrace ? 0.34 : 0.22),
      rimDy: (rng.next() - 0.5) * (kind === 'ridge' ? 0.9 : 0.7),
      ledgeY: slab ? rng.range(0.35, 0.6) : lerp(0.55, H * 0.68, rng.next()),
      shelf: slab ? rng.range(0.02, 0.06) : terrace ? rng.range(0.25, 0.6) : rng.range(0.1, 0.3),
      tone: rng.range(0.86, 1.12),
      bare: rng.chance(0.28),
      moss: rng.next(),
      batter: rng.range(0, 0.16),
      groove: rng.range(0.08, 0.3),
    });
  }
  // 崖沿的低频起伏(沿弧长)叠在每柱的错落上
  const rimAt = (i: number): number => {
    const m = meta[i];
    const c = cols[m.col];
    const wave = (fbm2(outline[i].s * 0.16, seed * 0.37, 2, seed) - 0.5) * 0.5;
    return H + c.rimDy + wave - m.groove * 0.14;
  };

  // 顶面的环数按体量取：窄墙体里靠内的几环全塌在中轴线上，是白画的零面积三角
  const topD = TOP_D.filter((d, i) => i < 3 || d < inradius - 0.25 || i === TOP_D.length - 1);
  const RINGS = 7 + topD.length;
  const rimInfo: CliffRimPoint[] = [];
  extrudeRings(b, outline, true, RINGS, (p, i, k) => {
    const r = reach[i];
    const m = meta[i];
    const c = cols[m.col];
    const g = m.groove;
    const nk = m.niche;
    // 逐顶点的小错位：岩面不是一张平板，带一点凿出来的切面
    const j = (hash2(i * 7 + k, seed, 41) - 0.5) * 0.13 * (1 - nk);
    const jy = (hash2(i * 5 + k, seed, 43) - 0.5) * 0.16 * (1 - nk);
    const GROOVE_DEPTH = c.groove;
    const rim = rimAt(i);
    const ledgeY = lerp(c.ledgeY, NICHE_Y, nk);
    const shelf = lerp(c.shelf, NICHE_DEPTH, nk);
    // 上块前脸到崖脚的进深
    const upper = 0.1 + shelf + c.inset * (1 - nk) + g * GROOVE_DEPTH;
    const rimD = Math.max(RIM_D, upper + 0.3 + c.batter);
    let d: number;
    let y: number;
    let color: RGB;
    let ao = 1;
    let tex = 1;
    switch (k) {
      case 0: // 崖脚：与碰撞轮廓重合
        d = 0;
        y = -0.05;
        color = mixRgb(ROCK_DARK, ROCK, 0.25);
        ao = 0.62;
        break;
      case 1: // 下块前脸
        d = 0.05 + Math.max(0, j) + g * GROOVE_DEPTH;
        y = ledgeY - 0.13 + jy * 0.5;
        color = mixRgb(ROCK_DARK, ROCK_LIGHT, 0.42);
        ao = 0.92 - g * 0.3;
        break;
      case 2: // 下块顶沿(小圆角)
        d = 0.1 + g * GROOVE_DEPTH;
        y = ledgeY;
        color = mixRgb(ROCK, ROCK_LIGHT, 0.6);
        ao = 1 - g * 0.35;
        break;
      case 3: // 一级石台的里沿(朝上的面：接高光、长苔；壁龛处是干净的石面)
        d = upper - 0.03;
        y = ledgeY + 0.04;
        color = mixRgb(mixRgb(ROCK, ROCK_LIGHT, 0.45), MOSS, smoothstep(0.35, 0.8, c.moss) * 0.6 * (1 - nk));
        ao = 0.72 - g * 0.15;
        tex = 0.75;
        break;
      case 4: // 上块前脸中段
        d = upper + 0.03 + j + c.batter * 0.5;
        y = lerp(ledgeY, rim, 0.5) + jy;
        color = mixRgb(ROCK, ROCK_LIGHT, 0.3);
        ao = 0.95 - g * 0.35;
        break;
      case 5: // 上块顶沿下方
        d = upper + 0.07 + j * 0.6 + c.batter;
        y = rim - 0.2;
        color = mixRgb(ROCK, ROCK_LIGHT, c.bare ? 0.7 : 0.45);
        ao = 1 - g * 0.4;
        break;
      case 6: // 崖沿圆角：三成的柱是暖石沿，其余被苔盖住
        d = upper + 0.2 + c.batter;
        y = rim - 0.03;
        color = c.bare ? mixRgb(ROCK_LIGHT, ROCK_WARM, 0.7) : mixRgb(MOSS, TOP_GRASS, 0.45);
        ao = 1 - g * 0.4;
        tex = c.bare ? 1 : 0.35;
        break;
      default: {
        const ti = k - 7;
        d = ti === 0 ? rimD : Math.max(topD[ti], rimD + ti * 0.12);
        const de = Math.min(d, r.maxD);
        const px = p.x + p.nx * de * r.k;
        const pz = p.z + p.nz * de * r.k;
        // 崖沿处跟着各柱的错落，往里很快并到只由位置决定的高度(中轴线两侧在那里接缝，不能各算各的)
        const blend = smoothstep(0, 1, (de - RIM_D) / Math.max(0.25, Math.min(1.8, r.maxD - RIM_D)));
        {
          y = lerp(rim, H, blend) + profileY(de);
          // 草色斑：亮 / 暗 / 发黄，偶尔露一块土
          const n1 = fbm2(px * 0.22, pz * 0.22, 2, seed);
          const n2 = fbm2(px * 0.5 + 7.1, pz * 0.5 + 1.3, 2, seed + 3);
          let gcol = mixRgb(TOP_GRASS, TOP_GRASS_LIGHT, smoothstep(0.3, 0.7, n1));
          gcol = mixRgb(gcol, TOP_GRASS_DRY, smoothstep(0.58, 0.8, n2) * 0.6);
          gcol = mixRgb(gcol, TOP_SOIL, smoothstep(0.7, 0.85, 1 - n2) * smoothstep(0.5, 0.7, n1) * 0.55);
          const edgeK = Math.min(1, (de - RIM_D) / 0.7);
          color = c.bare ? mixRgb(mixRgb(ROCK_LIGHT, ROCK_WARM, 0.5), gcol, 0.45 + 0.55 * edgeK) : mixRgb(mixRgb(MOSS, TOP_GRASS, 0.6), gcol, edgeK);
          // 顶面留四成岩石肌理权重：材质的顶面草贴图只按 (1 - tex) 生效，草叶笔触的对比因此收掉四成
          tex = c.bare ? TOP_TEX + (1 - edgeK) * 0.4 : TOP_TEX;
        }
        ao = ti === 0 ? 1 - g * 0.3 : 1;
        return { t: de * r.k, y, color: ti === 0 ? scaleRgb(color, c.tone) : color, ao, tex };
      }
    }
    // 岩面：竖缝里压暗
    const de = Math.min(d, r.maxD);
    return { t: de * r.k, y, color: scaleRgb(color, c.tone * (1 - g * 0.22)), ao, tex };
  });

  for (let i = 0; i < n; i++) {
    const m = meta[i];
    if (m.groove) continue;
    const c = cols[m.col];
    const p = outline[i];
    const upper = 0.1 + lerp(c.shelf, NICHE_DEPTH, m.niche) + c.inset * (1 - m.niche) + c.batter;
    rimInfo.push({ x: p.x, z: p.z, ox: -p.nx, oz: -p.nz, y: rimAt(i), inset: (upper + 0.2) * reach[i].k, bare: c.bare || m.niche > 0.1 });
  }
  const niches: CliffNiche[] = nicheAt.map((i) => {
    const p = outline[i];
    const dIn = (0.1 + NICHE_DEPTH * 0.5) * reach[i].k;
    return { x: p.x + p.nx * dIn, z: p.z + p.nz * dIn, y: NICHE_Y + 0.04, ox: -p.nx, oz: -p.nz };
  });

  return {
    poly,
    kind,
    height: H,
    inradius,
    topY: (d: number) => H + profileY(d),
    rim: rimInfo,
    niches,
  };
}
