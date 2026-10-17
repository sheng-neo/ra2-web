// ===== sim/terrain/generate.ts =====（spec:terrain §2.7 / §3.6；随机只用独立 terrain 流 createPrng(terrainSeed) 与无状态 hashNoise）
// 生成器：fBm 高度场 → 海平面 / 起伏 / 湖泊偏置 → 海岸（一侧或两侧，边缘最深）→ 河流（噪声蜿蜒）→ ≤1 级松弛（Chebyshev 两趟扫描）
//        → 写回地块与海相连水 → 咸水泛洪（河流屏蔽）→ 溪流 → 成簇树木。直接写层（init 期，core 随后 recountFromLayers + markBulk('all')）。
import { CORNER_SIZE, MAP, TILES, XBit, inMap, neighbor, tileIndex } from '../../contracts/grid';
import type { Dir } from '../../contracts/grid';
import { createPrng, hash32 } from '../../contracts/prng';
import type { NewCityParams, SimContext } from '../../contracts/system';
import { ChangeSet } from './changes';
import { seaXter } from './field';
import type { TerrainField } from './field';
import { clamp01, fbm1, fbm2, powApprox115 } from './noise';
import { cornerIndex, isTreeXbld, slopeCodeOf, tileFromCorners, treeXbldOf, BEDROCK_SLOPE } from './slope';
import type { TerrainTuning } from './tuning';
import { carveStream } from './water';

export type GenParams = NewCityParams['terrain'];
const CORNERS = CORNER_SIZE * CORNER_SIZE;
const SLIDER_MAX = 47;
const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 滑块 → 海平面 W（water=5 ⇒ 4）。 */
export const seaLevelFor = (water: number, T: TerrainTuning): number => clampInt(T.seaLevelBase + Math.floor(water / T.seaLevelDiv), 1, T.seaLevelMax);
export const hillsRangeFor = (hills: number, T: TerrainTuning): number => T.hillsRangeBase + Math.floor(clampInt(hills, 0, SLIDER_MAX) * T.hillsRangeSpan / SLIDER_MAX);
/** 湖泊目标占比（角点分位数；与 Hills 无关）：water=0 ⇒ 0，否则在 [min, max] 间线性。 */
export const lakeFractionFor = (water: number, T: TerrainTuning): number =>
  (water > 0 ? T.lakeFractionMin + (T.lakeFractionMax - T.lakeFractionMin) * clampInt(water, 0, SLIDER_MAX) / SLIDER_MAX : 0);
export const streamCountFor = (water: number, T: TerrainTuning): number => Math.floor((clampInt(water, 0, SLIDER_MAX) + T.streamCountAdd) / T.streamCountDiv);

/** ≤1 级松弛：Chebyshev 距离变换的两趟扫描（正向 / 反向），循环到稳定。只降不升，已雕的水道保持。 */
export function relaxCorners(h: Uint8Array): number {
  let rounds = 0;
  for (; rounds < 64; rounds++) {
    let changed = false;
    for (let cx = 0; cx < CORNER_SIZE; cx++) for (let cy = 0; cy < CORNER_SIZE; cy++) {
      const c = cx * CORNER_SIZE + cy;
      let m = h[c]!;
      if (cx > 0) { const b = cx * CORNER_SIZE - CORNER_SIZE + cy; if (h[b]! + 1 < m) m = h[b]! + 1; if (cy > 0 && h[b - 1]! + 1 < m) m = h[b - 1]! + 1; if (cy + 1 < CORNER_SIZE && h[b + 1]! + 1 < m) m = h[b + 1]! + 1; }
      if (cy > 0 && h[c - 1]! + 1 < m) m = h[c - 1]! + 1;
      if (m !== h[c]) { h[c] = m; changed = true; }
    }
    for (let cx = CORNER_SIZE - 1; cx >= 0; cx--) for (let cy = CORNER_SIZE - 1; cy >= 0; cy--) {
      const c = cx * CORNER_SIZE + cy;
      let m = h[c]!;
      if (cx + 1 < CORNER_SIZE) { const b = c + CORNER_SIZE; if (h[b]! + 1 < m) m = h[b]! + 1; if (cy > 0 && h[b - 1]! + 1 < m) m = h[b - 1]! + 1; if (cy + 1 < CORNER_SIZE && h[b + 1]! + 1 < m) m = h[b + 1]! + 1; }
      if (cy + 1 < CORNER_SIZE && h[c + 1]! + 1 < m) m = h[c + 1]! + 1;
      if (m !== h[c]) { h[c] = m; changed = true; }
    }
    if (!changed) break;
  }
  return rounds;
}

/** 角点 8 邻高度和。 */
function neighborSum(h: Uint8Array, cx: number, cy: number): number {
  let s = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (dx === 0 && dy === 0) continue;
    const nx = cx + dx, ny = cy + dy;
    if (nx >= 0 && nx < CORNER_SIZE && ny >= 0 && ny < CORNER_SIZE) s += h[nx * CORNER_SIZE + ny]!;
  }
  return s;
}
/**
 * 鞍点消解（生成期）：两对角高、两对角低的地块没有坡面码。把其中邻居更低的那个高角降到低角（只降不升，不会填掉水道），再松弛；
 * 循环到没有鞍点。高度单调下降，必然终止。返回轮数。
 */
export function removeSaddles(h: Uint8Array): number {
  let rounds = 0;
  for (; rounds < 64; rounds++) {
    let n = 0;
    for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
      const c00 = cornerIndex(x, y), c10 = c00 + CORNER_SIZE, c01 = c00 + 1, c11 = c10 + 1;
      const a = h[c00]!, b = h[c10]!, c = h[c01]!, d = h[c11]!;
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      if (hi - lo !== 1) continue;
      const bits = ((a - lo) << 3) | ((b - lo) << 2) | ((c - lo) << 1) | (d - lo);
      if (bits === 0b1001) { h[neighborSum(h, x + 1, y + 1) < neighborSum(h, x, y) ? c11 : c00] = lo; n++; }
      else if (bits === 0b0110) { h[neighborSum(h, x, y + 1) < neighborSum(h, x + 1, y) ? c01 : c10] = lo; n++; }
    }
    if (n === 0) break;
    relaxCorners(h);
  }
  return rounds;
}

/**
 * 生成地形并写入 ctx.state.layers / terrain 元数据 / field。seed 为 terrainSeed（与 sim 流无关）。
 */
export function generateTerrain(ctx: SimContext, field: TerrainField, seed: number, p: GenParams, T: TerrainTuning): void {
  const s = ctx.state, L = s.layers;
  const prng = createPrng(seed);
  const hills = clampInt(p.hills | 0, 0, SLIDER_MAX), water = clampInt(p.water | 0, 0, SLIDER_MAX), trees = clampInt(p.trees | 0, 0, SLIDER_MAX);
  const W = seaLevelFor(water, T);
  const range = hillsRangeFor(hills, T);
  const lakeFraction = lakeFractionFor(water, T);
  const h = new Uint8Array(CORNERS);

  // ---- 1–2. 基础噪声 → 按本图 min/max 归一（最低倍频只有 ~2.7 个格点，不归一会让每个 seed 的水 / 山比例漂移）→ 高度
  const hSeed = hash32(seed, 'height');
  const fbmP = { octaves: T.fbmOctaves, baseFreq: T.fbmBaseFreq, gain: T.fbmGain, lacunarity: T.fbmLacunarity };
  const noise = new Float64Array(CORNERS);
  let nMin = 1, nMax = 0;
  for (let cx = 0; cx < CORNER_SIZE; cx++) for (let cy = 0; cy < CORNER_SIZE; cy++) {
    const n = fbm2(hSeed, cx, cy, fbmP);
    noise[cornerIndex(cx, cy)] = n;
    if (n < nMin) nMin = n; if (n > nMax) nMax = n;
  }
  // 湖泊按分位数：最低 lakeFraction 的角点落到 W−1 / W−2（湖心更深），其余按剩余区间映射到 [W, W+range]（陆地最低处即海平面）
  let tq = nMin - 1;
  if (lakeFraction > 0) {
    const sorted = Float64Array.from(noise).sort();
    tq = sorted[Math.min(CORNERS - 1, Math.floor(lakeFraction * CORNERS))]!;
  }
  const landSpan = nMax > tq ? nMax - tq : 1, lakeSpan = tq > nMin ? tq - nMin : 1;
  for (let c = 0; c < CORNERS; c++) {
    const n = noise[c]!;
    if (n < tq) h[c] = clampInt(W - 1 - ((tq - n) / lakeSpan > 0.5 ? 1 : 0), 0, 31);
    else {
      const u = clamp01(((n - tq) / landSpan - 0.5) * T.fbmStretch + 0.5);
      h[c] = clampInt(W + Math.round(powApprox115(u) * range), 0, 31);
    }
  }
  // ---- 3. 海岸：一侧（可能两侧）边缘为海，海带宽随边噪声起伏，边缘最深
  const sides: number[] = [];
  if (p.coast) {
    const side = prng.int(4);
    sides.push(side);
    if (prng.int(256) < T.coastSecondSidePer256) sides.push((side + 1 + prng.int(3)) & 3);
    const cSeed = hash32(seed, 'coast');
    for (const sd of sides) {
      for (let cx = 0; cx < CORNER_SIZE; cx++) for (let cy = 0; cy < CORNER_SIZE; cy++) {
        const dist = sd === 0 ? cy : sd === 1 ? MAP - cx : sd === 2 ? MAP - cy : cx;      // T R B L
        const along = sd === 0 || sd === 2 ? cx : cy;
        const shore = T.coastShoreMin + T.coastShoreNoise * fbm1(hash32(cSeed, sd), along, 2, 1 / 16);
        if (dist < shore) {
          const depthT = (shore - dist) / shore;
          const cap = clampInt(W - 1 - Math.floor(depthT * T.coastEdgeDepthExtra), 0, 31);
          const c = cornerIndex(cx, cy);
          if (h[c]! > cap) h[c] = cap;
        }
      }
    }
  }
  // ---- 4. 河流：从一边到对边，中线用一维 fBm 蜿蜒；床深 W−1..W−2；记录屏蔽掩码（不并入咸水）
  const riverMask = new Uint8Array(TILES);
  if (p.river) {
    const alongX = prng.bit();
    const mid = 40 + prng.int(49);
    const amp = T.riverMeanderMin + prng.int(T.riverMeanderMax - T.riverMeanderMin + 1);
    const width = T.riverWidthMin + prng.int(T.riverWidthMax - T.riverWidthMin + 1);
    const rSeed = hash32(seed, 'river');
    const center = (t: number): number => mid + amp * (fbm1(rSeed, t, 2, 1 / T.riverNoisePeriod) - 0.5) * 2;
    const half = width / 2;
    for (let t = 0; t < CORNER_SIZE; t++) {
      const c = center(t);
      for (let k = 0; k < CORNER_SIZE; k++) {
        const dist = Math.abs(k - c);
        if (dist > half) continue;
        const cap = clampInt(W - 1 - (dist < 1 ? 1 : 0), 0, 31);
        const ci = alongX ? cornerIndex(t, k) : cornerIndex(k, t);
        if (h[ci]! > cap) h[ci] = cap;
      }
    }
    for (let t = 0; t < MAP; t++) {
      const c = (center(t) + center(t + 1)) / 2;
      for (let k = 0; k < MAP; k++) if (Math.abs(k + 0.5 - c) <= half + 0.5) riverMask[alongX ? tileIndex(t, k) : tileIndex(k, t)] = 1;
    }
  }
  // ---- 5. 约束松弛 + 鞍点消解
  relaxCorners(h);
  removeSaddles(h);
  // ---- 6. 写回地块 + 海相连水
  for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
    const i = tileIndex(x, y);
    const g = tileFromCorners(h, x, y)!;
    const isWater = g.min < W;
    L.alt[i] = g.alt; L.tunnelLevels[i] = 0;
    L.xter[i] = isWater ? seaXter(g.slope, g.alt, W) : g.slope;
    L.waterLevel[i] = isWater ? W : g.alt;
    L.xbit[i] = (L.xbit[i]! & ~(XBit.Water | XBit.SaltWater)) | (isWater ? XBit.Water : 0);
  }
  field.h.set(h);
  // ---- 6b. 咸水：从边缘海水 4 邻泛洪（河流屏蔽；湖泊不相连自然为淡水）
  if (p.coast) {
    const mark = new Uint8Array(TILES);
    const queue: number[] = [];
    const sea = (i: number): boolean => (L.xbit[i]! & XBit.Water) !== 0 && riverMask[i] === 0;
    for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
      if (x !== 0 && y !== 0 && x !== MAP - 1 && y !== MAP - 1) continue;
      const i = tileIndex(x, y);
      if (sea(i) && mark[i] === 0) { mark[i] = 1; queue.push(i); }
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      L.xbit[i] = L.xbit[i]! | XBit.SaltWater;
      for (let d = 0; d < 4; d++) { const n = neighbor(i, d as Dir); if (n >= 0 && mark[n] === 0 && sea(n)) { mark[n] = 1; queue.push(n); } }
    }
  }
  s.terrain.seaLevel = W; s.terrain.coast = p.coast; s.terrain.river = p.river;
  // ---- 7. 溪流：自高处干平地起沿最陡下降（经 TileWriter 写入）
  const streams = streamCountFor(water, T);
  const cs = new ChangeSet();
  for (let k = 0; k < streams; k++) {
    for (let attempt = 0; attempt < T.streamPlaceTries; attempt++) {
      const x = prng.int(MAP), y = prng.int(MAP), i = tileIndex(x, y);
      const minAbove = attempt < T.streamPlaceTries / 2 ? T.streamStartAboveSea : 1;
      if ((L.xbit[i]! & XBit.Water) !== 0 || slopeCodeOf(L.xter[i]!) !== 0 || L.alt[i]! < W + minAbove || L.xbld[i] !== 0) continue;
      if (carveStream(ctx, field, x, y, T.streamMaxSteps, cs, T.streamPlateauMax)) break;
    }
  }
  cs.take();
  // ---- 8. 树木：成簇（噪声 + 少量随机），簇心密度高、边缘稀；不在水面 / 瀑布 / bedrock 上
  const tSeed = hash32(seed, 'trees');
  const pTree = trees / SLIDER_MAX;
  const threshold = pTree * T.treeThresholdScale;
  const tp = { octaves: T.treeNoiseOctaves, baseFreq: T.treeNoiseFreq, gain: 0.5, lacunarity: 2 };
  const treeNoise = new Float64Array(TILES);
  let tMin = 1, tMax = 0;
  for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
    const n = fbm2(tSeed, x + 0.5, y + 0.5, tp);
    treeNoise[tileIndex(x, y)] = n;
    if (n < tMin) tMin = n; if (n > tMax) tMax = n;
  }
  const tSpan = tMax > tMin ? tMax - tMin : 1;
  for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
    const r = prng.int(1024);                                    // 每格恒消费一次，保证确定性
    if (trees === 0) continue;
    const i = tileIndex(x, y);
    if ((L.xbit[i]! & XBit.Water) !== 0 || L.xbld[i] !== 0 || slopeCodeOf(L.xter[i]!) === BEDROCK_SLOPE) continue;
    const v = ((treeNoise[i]! - tMin) / tSpan) * T.treeNoiseMix + (r / 1024) * (1 - T.treeNoiseMix);
    if (v >= threshold) continue;
    const density = clampInt(1 + Math.floor((1 - v / threshold) * 7), 1, 7);
    L.xbld[i] = treeXbldOf(density);
  }
}

/** 测试 / 调试：统计一张图的水 / 树 / 咸水格数与海拔范围。 */
export function describeTerrain(L: { alt: Uint8Array; xbit: Uint8Array; xbld: Uint8Array }): { water: number; salt: number; trees: number; minAlt: number; maxAlt: number } {
  let water = 0, salt = 0, trees = 0, minAlt = 31, maxAlt = 0;
  for (let i = 0; i < TILES; i++) {
    if ((L.xbit[i]! & XBit.Water) !== 0) water++;
    if ((L.xbit[i]! & XBit.SaltWater) !== 0) salt++;
    if (isTreeXbld(L.xbld[i]!)) trees++;
    const a = L.alt[i]!; if (a < minAlt) minAlt = a; if (a > maxAlt) maxAlt = a;
  }
  return { water, salt, trees, minAlt, maxAlt };
}
export const inMapXY = inMap;
