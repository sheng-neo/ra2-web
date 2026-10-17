// ===== sim/terrain/field.ts =====（spec:terrain §3.2 / §3.3 / §3.4.1）
// 角点高度场（129×129 运行缓存，任一读档后由 postLoad 重建）+ 约束传播 + "几何变化后写回地块"（recomputeTerrainTile 的批量形式）。
// 规则：地块数据为真源、角点场为派生缓存（h[c] = 周围地块给出的最大值；bedrock / 瀑布按平地 alt，不向邻居传播高台）。
// 几何变化的水体口径：海相连水（0x1X/0x2X，水位 = 海平面）按 minCorner < W 重判；装饰水（0x3X 池塘 / 0x4X 溪流 / 0x3E 瀑布）一经改动即排干。
import { CORNER_SIZE, MAP, TILES, XBit, XterClass, inMap, neighbor, tileIndex, tileX, tileY, xterClassOf } from '../../contracts/grid';
import type { Dir } from '../../contracts/grid';
import type { TileLayers } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { BEDROCK_SLOPE, cornerIndex, cornersOf, isDecorativeWaterClass, isTreeXbld, shapeFromLandBits, slopeCodeOf, tileFromCorners } from './slope';
import type { TileGeometry } from './slope';

const CORNERS = CORNER_SIZE * CORNER_SIZE;

export class TerrainField {
  /** 角点高度 0..31。 */
  readonly h = new Uint8Array(CORNERS);
  /** 上次 rebuild 时与角点场不一致的地块数（第三方存档诊断）。 */
  inconsistent = 0;
  /** 本模块自己经 act.setTerrain 写过、尚未在 onTilesChanged 扇出中被消费的格（区分"外部系统写地形"）。 */
  readonly selfWritten = new Uint8Array(TILES);
  /** 本模块写地形的唯一入口：标记自写，再经 TileWriter 写入。 */
  write(ctx: SimContext, i: number, alt: number, xter: number, waterLevel: number): void {
    this.selfWritten[i] = 1;
    ctx.act.setTerrain(i, alt, xter, waterLevel);
  }
  private readonly cornerMark = new Uint8Array(CORNERS);
  private readonly tileMark = new Uint8Array(TILES);
  private touched: number[] = [];
  private undoLog: number[] = [];
  private qc: number[] = [];
  private qt: number[] = [];

  /** 从层全量重建：h[c] = 周围地块角高的最大值；码 13 按平地。 */
  rebuild(L: TileLayers): void {
    const h = this.h;
    h.fill(0);
    for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
      const i = tileIndex(x, y);
      const [a, b, c, d] = cornersOf(L.alt[i]!, L.xter[i]!, 'flat');
      const c00 = cornerIndex(x, y), c10 = c00 + CORNER_SIZE, c01 = c00 + 1, c11 = c10 + 1;
      if (a > h[c00]!) h[c00] = a; if (b > h[c10]!) h[c10] = b; if (c > h[c01]!) h[c01] = c; if (d > h[c11]!) h[c11] = d;
    }
    let bad = 0;
    for (let i = 0; i < TILES; i++) if (!this.tileMatches(L, i)) bad++;
    this.inconsistent = bad;
  }
  /** 地块自身数据给出的角高是否与场一致（码 13 地块不参与，恒视为一致）。 */
  tileMatches(L: TileLayers, i: number): boolean {
    if (slopeCodeOf(L.xter[i]!) === BEDROCK_SLOPE) return true;
    const x = tileX(i), y = tileY(i);
    const [a, b, c, d] = cornersOf(L.alt[i]!, L.xter[i]!, 'flat');
    const c00 = cornerIndex(x, y), c10 = c00 + CORNER_SIZE;
    const h = this.h;
    return h[c00] === a && h[c10] === b && h[c00 + 1] === c && h[c10 + 1] === d;
  }
  /** 外部（非本模块）直接改了地块几何：以该地块为准覆写它的 4 个角点。 */
  adoptTile(L: TileLayers, i: number): void {
    if (slopeCodeOf(L.xter[i]!) === BEDROCK_SLOPE) return;
    const x = tileX(i), y = tileY(i);
    const [a, b, c, d] = cornersOf(L.alt[i]!, L.xter[i]!, 'flat');
    const c00 = cornerIndex(x, y), c10 = c00 + CORNER_SIZE;
    this.h[c00] = a; this.h[c10] = b; this.h[c00 + 1] = c; this.h[c10 + 1] = d;
  }
  geometry(i: number): TileGeometry | null { return tileFromCorners(this.h, tileX(i), tileY(i)); }
  minCorner(i: number): number {
    const x = tileX(i), y = tileY(i), h = this.h;
    const c00 = cornerIndex(x, y), c10 = c00 + CORNER_SIZE;
    return Math.min(h[c00]!, h[c10]!, h[c00 + 1]!, h[c10 + 1]!);
  }
  maxCorner(i: number): number {
    const x = tileX(i), y = tileY(i), h = this.h;
    const c00 = cornerIndex(x, y), c10 = c00 + CORNER_SIZE;
    return Math.max(h[c00]!, h[c10]!, h[c00 + 1]!, h[c10 + 1]!);
  }
  tileCorners(i: number): [number, number, number, number] {
    const x = tileX(i), y = tileY(i);
    const c00 = cornerIndex(x, y), c10 = c00 + CORNER_SIZE;
    return [c00, c10, c00 + 1, c10 + 1];
  }

  // ---------------------------------------------------------------- 一次工具操作：传播 → 取触及地块 → 提交 / 回滚
  /** 开始一次操作（清空触及集合与撤销日志）。 */
  begin(): void {
    for (const c of this.touched) this.cornerMark[c] = 0;
    this.touched.length = 0; this.undoLog.length = 0;
  }
  /**
   * 约束传播（spec §3.4.1）：把角点 c0 设为 target，并沿 8 邻以 Chebyshev 距离 d 把角点约束到 target ∓ d（dir = +1 抬高 / −1 降低）。
   * 调用方保证 target ∈ [0, 31]。
   */
  propagate(c0: number, target: number, dir: 1 | -1): void {
    const h = this.h, qc = this.qc, qt = this.qt;
    qc.length = 0; qt.length = 0;
    qc.push(c0); qt.push(target);
    let head = 0;
    while (head < qc.length) {
      const c = qc[head]!, t = qt[head]!; head++;
      const cur = h[c]!;
      if (dir > 0 ? cur >= t : cur <= t) continue;
      if (this.cornerMark[c] === 0) { this.cornerMark[c] = 1; this.touched.push(c); this.undoLog.push(c, cur); }
      h[c] = t;
      const cx = (c / CORNER_SIZE) | 0, cy = c - cx * CORNER_SIZE;
      const nt = t - dir;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= CORNER_SIZE) continue;
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const ny = cy + dy;
          if (ny < 0 || ny >= CORNER_SIZE) continue;
          const n = nx * CORNER_SIZE + ny;
          if (dir > 0 ? h[n]! < nt : h[n]! > nt) { qc.push(n); qt.push(nt); }
        }
      }
    }
  }
  /** 角点 8 邻高度和（鞍点消解的择优依据）。 */
  private neighborSum(c: number): number {
    const cx = (c / CORNER_SIZE) | 0, cy = c - cx * CORNER_SIZE, h = this.h;
    let s = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < CORNER_SIZE && ny >= 0 && ny < CORNER_SIZE) s += h[nx * CORNER_SIZE + ny]!;
    }
    return s;
  }
  /**
   * 鞍点消解：两对角高、两对角低的地块（0b1001 / 0b0110）没有坡面码。传播后对触及地块检查：抬高操作把一个低角抬到高角（取邻居更高者），
   * 降低操作把一个高角降到低角（取邻居更低者），都经 propagate 保持 ≤1 级并记入触及 / 撤销；新触及的地块再查，直到没有鞍点。
   */
  fixSaddles(dir: 1 | -1): void {
    const h = this.h;
    for (let round = 0; round < 64; round++) {
      let fixed = false;
      for (const i of this.touchedTiles()) {
        const [c00, c10, c01, c11] = this.tileCorners(i);
        const a = h[c00]!, b = h[c10]!, c = h[c01]!, d = h[c11]!;
        const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        if (hi - lo !== 1) continue;
        const bits = ((a - lo) << 3) | ((b - lo) << 2) | ((c - lo) << 1) | (d - lo);
        if (bits !== 0b1001 && bits !== 0b0110) continue;
        const pair: [number, number] = dir > 0 ? (bits === 0b1001 ? [c10, c01] : [c00, c11]) : (bits === 0b1001 ? [c00, c11] : [c10, c01]);
        const s0 = this.neighborSum(pair[0]), s1 = this.neighborSum(pair[1]);
        const pick = dir > 0 ? (s1 > s0 ? pair[1] : pair[0]) : (s1 < s0 ? pair[1] : pair[0]);
        this.propagate(pick, dir > 0 ? hi : lo, dir);
        fixed = true;
      }
      if (!fixed) return;
    }
  }
  /** 撤销本次操作的全部角点改动。 */
  rollback(): void {
    const u = this.undoLog;
    for (let k = u.length - 2; k >= 0; k -= 2) this.h[u[k]!] = u[k + 1]!;
    this.begin();
  }
  /** 本次操作触及的角点所影响的地块（去重，按首次出现序）。 */
  touchedTiles(): number[] {
    const out: number[] = [];
    for (const c of this.touched) {
      const cx = (c / CORNER_SIZE) | 0, cy = c - cx * CORNER_SIZE;
      for (let tx = cx - 1; tx <= cx; tx++) for (let ty = cy - 1; ty <= cy; ty++) {
        if (!inMap(tx, ty)) continue;
        const i = tileIndex(tx, ty);
        if (this.tileMark[i] === 0) { this.tileMark[i] = 1; out.push(i); }
      }
    }
    for (const i of out) this.tileMark[i] = 0;
    return out;
  }
  get touchedCornerCount(): number { return this.touched.length; }
}

// ---------------------------------------------------------------- 水体 / 形状辅助（读层）
export const isWaterAt = (L: TileLayers, i: number): boolean => (L.xbit[i]! & XBit.Water) !== 0;
export const isSaltAt = (L: TileLayers, i: number): boolean => (L.xbit[i]! & XBit.SaltWater) !== 0;
/** 海相连水（0x1X / 0x2X 且有水位）：与装饰水相对。 */
export const isSeaLikeAt = (L: TileLayers, i: number): boolean => isWaterAt(L, i) && !isDecorativeWaterClass(xterClassOf(L.xter[i]!));
/** 角点 (cx, cy) 周围 4 个地块是否存在陆地（越界视为水）。 */
function cornerIsLand(L: TileLayers, cx: number, cy: number): boolean {
  for (let tx = cx - 1; tx <= cx; tx++) for (let ty = cy - 1; ty <= cy; ty++) {
    if (inMap(tx, ty) && !isWaterAt(L, tileIndex(tx, ty))) return true;
  }
  return false;
}
/** 浅水形状 nibble（spec §2.6.3）：1 = 陆地角。 */
export function surfaceShape(L: TileLayers, i: number): number {
  const x = tileX(i), y = tileY(i);
  const bits = (cornerIsLand(L, x, y) ? 8 : 0) | (cornerIsLand(L, x + 1, y) ? 4 : 0) | (cornerIsLand(L, x, y + 1) ? 2 : 0) | (cornerIsLand(L, x + 1, y + 1) ? 1 : 0);
  return shapeFromLandBits(bits);
}
/** 海相连水的 XTER（W > alt 时调用）。 */
export const seaXter = (slope: number, alt: number, W: number): number => (slope === 0 ? 0x10 : W === alt + 1 ? 0x20 | slope : 0x10 | slope);
/** 4 邻中是否有咸水。 */
export function hasSaltNeighbor(L: TileLayers, i: number): boolean {
  for (let d = 0; d < 4; d++) { const n = neighbor(i, d as Dir); if (n >= 0 && isWaterAt(L, n) && isSaltAt(L, n)) return true; }
  return false;
}
export function clearTrees(ctx: SimContext, i: number): void {
  if (isTreeXbld(ctx.state.layers.xbld[i]!)) ctx.act.setXbld(i, 0);
}
/** 新水块的咸淡继承（spec §2.6.4）：与任一咸水块 4 邻接即咸；在新水块集合内迭代到稳定。 */
export function inheritSalt(ctx: SimContext, tiles: readonly number[]): void {
  const L = ctx.state.layers;
  let changed = true;
  for (let pass = 0; pass < 8 && changed; pass++) {
    changed = false;
    for (const i of tiles) {
      if (!isWaterAt(L, i) || isSaltAt(L, i)) continue;
      if (hasSaltNeighbor(L, i)) { ctx.act.setXbit(i, XBit.SaltWater, true); changed = true; }
    }
  }
}
/** 浅水形状依赖邻居：对 tiles 及其 8 邻中的 0x3X 水块重算形状码（只改形状，不改几何）。 */
export function reshapeAround(ctx: SimContext, field: TerrainField, tiles: readonly number[], out: number[], outMark: Uint8Array): void {
  const L = ctx.state.layers;
  for (const i of tiles) {
    const x = tileX(i), y = tileY(i);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const j = tileIndex(nx, ny);
      if (!isWaterAt(L, j) || xterClassOf(L.xter[j]!) !== XterClass.Surface) continue;
      const want = 0x30 | surfaceShape(L, j);
      if (L.xter[j] !== want) {
        field.write(ctx, j, L.alt[j]!, want, L.waterLevel[j]!);
        if (outMark[j] === 0) { outMark[j] = 1; out.push(j); }
      }
    }
  }
}

/**
 * 几何变化后的批量写回（spec §3.3 recomputeTerrainTile 的集合版）：tiles 中每格至少一个角点已改。
 * 返回实际写过的地块（含被重算形状的邻居），调用方据此构造 CommandResult.changed。
 */
export function applyGeometry(ctx: SimContext, field: TerrainField, tiles: readonly number[], outMark: Uint8Array): number[] {
  const s = ctx.state, L = s.layers, W0 = s.terrain.seaLevel;
  const out: number[] = [];
  const newWater: number[] = [];
  for (const i of tiles) {
    const g = field.geometry(i);
    if (!g) continue;                                            // 不可能（传播保证不变量）；防御
    const xbit = L.xbit[i]!, wasWater = (xbit & XBit.Water) !== 0;
    const seaLike = wasWater && !isDecorativeWaterClass(xterClassOf(L.xter[i]!));
    let water = false, W = 0;
    if (!wasWater || seaLike) { W = seaLike ? L.waterLevel[i]! : W0; water = g.min < W; }
    const xter = water ? seaXter(g.slope, g.alt, W) : g.slope;
    const wl = water ? W : g.alt;
    if (L.alt[i] !== g.alt || L.xter[i] !== xter || L.waterLevel[i] !== wl) field.write(ctx, i, g.alt, xter, wl);
    if (water !== wasWater) {
      ctx.act.setXbit(i, XBit.Water, water);
      if (!water && (xbit & XBit.SaltWater) !== 0) ctx.act.setXbit(i, XBit.SaltWater, false);
      if (water) newWater.push(i);
    }
    clearTrees(ctx, i);
    if (outMark[i] === 0) { outMark[i] = 1; out.push(i); }
  }
  inheritSalt(ctx, newWater);
  reshapeAround(ctx, field, tiles, out, outMark);
  for (const i of out) outMark[i] = 0;
  return out;
}
