// ===== sim/terrain/water.ts =====（spec:terrain §2.6 / §2.10 / §3.4.3 / §3.5 / §3.6.5）
// 水体操作：Water 工具（平地 → 零深度池塘、坡面 → 瀑布）、溪流雕刻、海平面重灌（refloodAll）、咸淡重算（recomputeSalt）。
import { DX, DY, Dir, MAP, TILES, XBit, XterClass, inMap, neighbor, tileIndex, tileX, tileY, xterClassOf } from '../../contracts/grid';
import type { RejectReason } from '../../contracts/commands';
import type { SimContext } from '../../contracts/system';
import type { ChangeSet } from './changes';
import { clearTrees, hasSaltNeighbor, isSaltAt, isSeaLikeAt, isWaterAt, reshapeAround, seaXter, surfaceShape } from './field';
import type { TerrainField } from './field';
import { BEDROCK_SLOPE, XTER_BAY_B, XTER_BAY_L, XTER_BAY_R, XTER_BAY_T, XTER_STREAM_LR, XTER_STREAM_TB, XTER_WATERFALL, isTreeXbld, slopeCodeOf } from './slope';

/** 溪流在等高平地上连续行走的步数上限（超过即以池塘收尾，避免长直线横穿高原）。 */
export const STREAM_PLATEAU_MAX = 12;
/** 结构物 / 瓦砾 / 辐射 / 小公园：地表被占用（树木不算）。 */
export const isGroundOccupied = (xbld: number): boolean => xbld !== 0 && !isTreeXbld(xbld);

/** Water 工具的合格判定；undefined = 可放置。 */
export function waterPlaceCheck(ctx: SimContext, i: number): RejectReason | undefined {
  const L = ctx.state.layers;
  if (isGroundOccupied(L.xbld[i]!)) return 'occupied';
  if (isWaterAt(L, i)) return 'water';
  if (slopeCodeOf(L.xter[i]!) === BEDROCK_SLOPE) return 'terrain';
  return undefined;
}
/** Water 工具（已通过 waterPlaceCheck）：干平地 → 0x3X 池塘（咸淡继承 4 邻）；干坡面 → 0x3E 瀑布（水位 alt+1）。 */
export function placeWater(ctx: SimContext, field: TerrainField, i: number, cs: ChangeSet): void {
  const L = ctx.state.layers, alt = L.alt[i]!, code = slopeCodeOf(L.xter[i]!);
  clearTrees(ctx, i);
  ctx.act.setXbit(i, XBit.Water, true);
  if (code === 0) {
    if (hasSaltNeighbor(L, i)) ctx.act.setXbit(i, XBit.SaltWater, true);
    field.write(ctx, i, alt, 0x30 | surfaceShape(L, i), alt);
    cs.add(i);
    const out: number[] = [];
    reshapeAround(ctx, field, [i], out, cs.mark);
    for (const j of out) cs.mark[j] = 0;
    cs.addAll(out);
  } else {
    field.write(ctx, i, alt, XTER_WATERFALL, alt + 1);
    cs.add(i);
  }
}

const BAY_FOR_DIR: readonly number[] = [XTER_BAY_T, XTER_BAY_R, XTER_BAY_B, XTER_BAY_L];   // 下标 = 流向（水触及朝向下一格的那条边）
/** 边坡码 1..4 的下坡方向：T 高 → B，R 高 → L，B 高 → T，L 高 → R。 */
const FLOW_OF_EDGE_SLOPE: Readonly<Record<number, Dir>> = { 1: Dir.B, 2: Dir.L, 3: Dir.T, 4: Dir.R };

/**
 * 溪流（spec §3.6.5）：从 (x0, y0) 沿最陡下降前进；平地写 0x40 / 0x41（水位 = alt），边坡写瀑布 0x3E，遇水体 / 地图边缘时把上一格改为朝向它的水湾，
 * 无路可走时以孤立池塘收尾。返回是否至少雕出一格。不消费 PRNG（选向按 T R B L 固定顺序取最低）。
 */
export function carveStream(ctx: SimContext, field: TerrainField, x0: number, y0: number, maxSteps: number, cs: ChangeSet, plateauMax = STREAM_PLATEAU_MAX): boolean {
  const L = ctx.state.layers;
  const visited = new Set<number>();
  let x = x0, y = y0, prev = -1, prevDir: Dir = Dir.B, carved = 0, flatRun = 0;
  const endWithBay = (): void => {
    if (prev >= 0 && (L.xter[prev] === XTER_STREAM_LR || L.xter[prev] === XTER_STREAM_TB)) {
      field.write(ctx, prev, L.alt[prev]!, BAY_FOR_DIR[prevDir]!, L.waterLevel[prev]!);
      cs.add(prev);
    }
  };
  for (let step = 0; step < maxSteps; step++) {
    if (!inMap(x, y)) { endWithBay(); return carved > 0; }
    const i = tileIndex(x, y);
    if (isWaterAt(L, i)) { endWithBay(); return carved > 0; }
    if (isGroundOccupied(L.xbld[i]!) || visited.has(i)) return carved > 0;
    visited.add(i);
    const s = slopeCodeOf(L.xter[i]!), alt = L.alt[i]!;
    if (s === 0) {
      // 选向：最低的邻格优先（水体视为最低）；同高时优先延续上一方向（少拐弯），再按 T R B L；平地连续走太久则以池塘收尾
      let best = -1, bestH = alt + 1, exit = -1;
      for (let k = 0; k < 4; k++) {
        const d = ((prev >= 0 ? prevDir : 0) + k) & 3;
        const n = neighbor(i, d as Dir);
        if (n < 0) { if (exit < 0) exit = d; continue; }
        if (visited.has(n) || isGroundOccupied(L.xbld[n]!)) continue;
        const hN = isWaterAt(L, n) ? -1 : field.minCorner(n);
        if (hN < bestH) { bestH = hN; best = d; }
      }
      if (best >= 0 && bestH === alt) { if (++flatRun > plateauMax) best = -1; } else flatRun = 0;
      if (best < 0 && flatRun <= plateauMax) best = exit;
      clearTrees(ctx, i);
      ctx.act.setXbit(i, XBit.Water, true);
      if (best < 0) {                                              // 洼地 / 高原尽头：孤立池塘
        field.write(ctx, i, alt, 0x30 | surfaceShape(L, i), alt);
        cs.add(i); carved++;
        const out: number[] = []; reshapeAround(ctx, field, [i], out, cs.mark); for (const j of out) cs.mark[j] = 0; cs.addAll(out);
        return true;
      }
      const vertical = best === Dir.T || best === Dir.B;
      field.write(ctx, i, alt, vertical ? XTER_STREAM_TB : XTER_STREAM_LR, alt);
      cs.add(i); carved++;
      prev = i; prevDir = best as Dir; x += DX[best]!; y += DY[best]!;
    } else if (s >= 1 && s <= 4) {
      const flow = FLOW_OF_EDGE_SLOPE[s]!;
      clearTrees(ctx, i);
      ctx.act.setXbit(i, XBit.Water, true);
      field.write(ctx, i, alt, XTER_WATERFALL, alt + 1);
      cs.add(i); carved++;
      prev = i; prevDir = flow; x += DX[flow]!; y += DY[flow]!;
    } else return carved > 0;                                      // 角坡 / bedrock：流向不明，止于此
  }
  return carved > 0;
}

/**
 * 海平面重灌（spec §3.4.3）：对全图地块按 minCorner < W 重判海相连水；池塘 / 溪流 / 瀑布只在被淹没时并入海水，否则保留；最后重算咸淡。幂等。
 */
export function refloodAll(ctx: SimContext, field: TerrainField, cs: ChangeSet): void {
  const s = ctx.state, L = s.layers, W = s.terrain.seaLevel;
  for (let i = 0; i < TILES; i++) {
    const g = field.geometry(i);
    if (!g) continue;
    const wasWater = isWaterAt(L, i);
    const decorative = wasWater && !isSeaLikeAt(L, i);
    const should = g.min < W;
    if (decorative && !should) continue;
    const xter = should ? seaXter(g.slope, g.alt, W) : g.slope;
    const wl = should ? W : g.alt;
    let changed = false;
    if (L.alt[i] !== g.alt || L.xter[i] !== xter || L.waterLevel[i] !== wl) { field.write(ctx, i, g.alt, xter, wl); changed = true; }
    if (should !== wasWater) { ctx.act.setXbit(i, XBit.Water, should); changed = true; }
    if (!should && isSaltAt(L, i)) { ctx.act.setXbit(i, XBit.SaltWater, false); changed = true; }
    if (should && isTreeXbld(L.xbld[i]!)) { ctx.act.setXbld(i, 0); changed = true; }
    if (changed) cs.add(i);
  }
  recomputeSalt(ctx, cs);
}

/** 咸淡重算（spec §3.5）：清全部 SALT；勾选 Coast 时从边缘的海相连水块（水位 = 海平面）4 邻泛洪标咸。 */
export function recomputeSalt(ctx: SimContext, cs: ChangeSet): void {
  const s = ctx.state, L = s.layers, W = s.terrain.seaLevel;
  const want = new Uint8Array(TILES);
  if (s.terrain.coast) {
    const queue: number[] = [];
    const seaAtW = (i: number): boolean => isSeaLikeAt(L, i) && L.waterLevel[i] === W;
    for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
      if (x !== 0 && y !== 0 && x !== MAP - 1 && y !== MAP - 1) continue;
      const i = tileIndex(x, y);
      if (seaAtW(i) && want[i] === 0) { want[i] = 1; queue.push(i); }
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      for (let d = 0; d < 4; d++) {
        const n = neighbor(i, d as Dir);
        if (n >= 0 && want[n] === 0 && seaAtW(n)) { want[n] = 1; queue.push(n); }
      }
    }
  }
  for (let i = 0; i < TILES; i++) {
    const has = isSaltAt(L, i);
    if (has !== (want[i] === 1)) { ctx.act.setXbit(i, XBit.SaltWater, want[i] === 1); cs.add(i); }
  }
}

/** 调试 / 测试辅助：某格是否为溪流 / 水湾 / 瀑布 / 池塘（装饰水）。 */
export const isDecorativeWaterAt = (ctx: SimContext, i: number): boolean => {
  const c = xterClassOf(ctx.state.layers.xter[i]!);
  return isWaterAt(ctx.state.layers, i) && (c === XterClass.Surface || c === XterClass.Stream || c === XterClass.Waterfall);
};
export const tileXY = (i: number): [number, number] => [tileX(i), tileY(i)];
