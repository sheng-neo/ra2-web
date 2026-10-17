// ===== sim/placement/network.ts =====
// 线性网络铺设（spec:transport §3.4 placeLine / placeHighway / placeSubway、§2.6 桥梁、§2.13 邻城连接；spec:terrain §2.11.3 坡面 / §2.11.4 桥头；
// spec:power-water §2.11 地下管线）。planNetwork 纯读（preview 与 network 命令共用，不消费 PRNG、不写状态）；applyNetworkPlan 才写层。
//  - from / to 沿位移大的轴约束成直线；高速先吸附到偶数 2×2 块再按块步进。
//  - 同族已有格免费；障碍格跳过并继续（spec:transport Q14）；坡面只接受沿轴单级坡（道路 / 电线可连续，铁路不可且坡脚写半高件）。
//  - 遇水：n = 连续水面格数 → q.transport.bridgeOptions；空 → 'water'（绝不弹出无法完成的模态）；两岸不合格 → 'terrain'；
//    未给 bridge → { reason:'needsBridge', modal bridgeType }；给了 → bridgePieces 整段写入、按 n × 单价计费、翻转族按行进轴置 Flipped。
//  - 道路 / 铁路 / 高速的新直线格落在边缘且垂直于边 → 返回 modal neighborConnect（UI 再派发 neighborConnection）。
import type { Command, CommandResult, RejectReason } from '../../contracts/commands';
import { FOOTPRINT, cornerBits } from '../../contracts/footprint';
import { CityMode, Corner, TILES, XBit, neighbor, opposite, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { BridgeKind } from '../../contracts/net';
import { NET_BASE, SLOPE_PIECE } from '../../contracts/net';
import type { SimContext } from '../../contracts/system';
import {
  AXIS_LR, AXIS_TB, HIGHWAY_STRAIGHT, NET_TOOL, RAIL_HALF_OF_SLOPE, RAIL_SLOPE_OF_HALF, SLOPE_LOW_DIR, XTXT_CONNECTION,
  bridgeOf, crossingPiece, edgeAxesOf, flatStraightOf, forEachNeighbor, highwayAxisOf, isCoverable, isUndFamily, perpendicular, pieceAxis, plainIndex,
  slopeAxis, slopePiece, straightPiece, surfaceHas, undCrossingPiece, undHas,
} from './pieces';
import type { Axis, NetKind, SurfaceFamily, UndFamily } from './pieces';
import type { PlacementTuning } from './tuning';

export type NetworkCmd = Extract<Command, { type: 'network' }>;
export type NetOp =
  | { op: 'new'; i: number; piece: number; cost: number }
  | { op: 'existing'; i: number }
  | { op: 'crossing'; i: number; piece: number; cost: number }
  | { op: 'bridge'; i: number; piece: number; flip: boolean; cost: number }
  | { op: 'skip'; i: number; reason: RejectReason };
export interface NetworkPlan {
  ok: boolean; reason?: RejectReason; cost: number; kind: NetKind; axis: Axis; ops: NetOp[];
  modal?: CommandResult['modal'];
  /** 邻城连接候选格（−1 = 无）。 */
  edgeOffer: number;
}
type RunResult = { ops: NetOp[] } | { reason: RejectReason; modal?: CommandResult['modal'] };

const validTile = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < TILES;

/** from → to 沿主轴的直线格序列（|dx| ≥ |dy| 取 x 轴）。 */
export function straightPath(from: number, to: number): { tiles: number[]; axis: Axis; point: boolean } {
  const x0 = tileX(from), y0 = tileY(from), x1 = tileX(to), y1 = tileY(to);
  const dx = x1 - x0, dy = y1 - y0;
  const axis: Axis = Math.abs(dx) >= Math.abs(dy) ? AXIS_LR : AXIS_TB;
  const tiles: number[] = [];
  if (axis === AXIS_LR) { const step = dx >= 0 ? 1 : -1; for (let x = x0; ; x += step) { tiles.push(tileIndex(x, y0)); if (x === x1) break; } }
  else { const step = dy >= 0 ? 1 : -1; for (let y = y0; ; y += step) { tiles.push(tileIndex(x0, y)); if (y === y1) break; } }
  return { tiles, axis, point: tiles.length === 1 };
}

function finish(kind: NetKind, axis: Axis, ops: NetOp[], edgeOffer: number): NetworkPlan {
  let cost = 0, effective = false, firstSkip: RejectReason | undefined;
  for (const o of ops) {
    if (o.op === 'skip') { firstSkip ??= o.reason; continue; }
    effective = true;
    if (o.op !== 'existing') cost += o.cost;
  }
  if (!effective) return { ok: false, reason: firstSkip ?? 'noTarget', cost: 0, kind, axis, ops, edgeOffer: -1 };
  return { ok: true, cost, kind, axis, ops, edgeOffer };
}
const wholeReject = (kind: NetKind, axis: Axis, ops: NetOp[], reason: RejectReason, modal?: CommandResult['modal']): NetworkPlan =>
  ({ ok: false, reason, cost: 0, kind, axis, ops, edgeOffer: -1, ...(modal ? { modal } : {}) });

/**
 * 规划一次 network 命令。opts.checkFunds：预览用，费用超出 canAfford 时标 'funds'（命令路径改由 act.charge 把关）。
 */
export function planNetwork(ctx: SimContext, tuning: PlacementTuning, cmd: NetworkCmd, opts: { checkFunds?: boolean } = {}): NetworkPlan {
  const kind = cmd.kind;
  if (!validTile(cmd.from) || !validTile(cmd.to)) return wholeReject(kind, AXIS_LR, [], 'outOfBounds');
  if (ctx.state.clock.mode !== CityMode.City) return wholeReject(kind, AXIS_LR, [], 'mode');
  const tool = ctx.catalogue.toolById(NET_TOOL[kind]);
  if (tool?.tech && !ctx.q.tech.invented(tool.tech)) return wholeReject(kind, AXIS_LR, [], 'notInvented');
  const unit = tool?.cost ?? 0;
  const plan = kind === 'highway' ? planHighway(ctx, tuning, cmd, unit)
    : isUndFamily(kind) ? planUnderground(ctx, tuning, kind, cmd, unit)
    : planSurface(ctx, tuning, kind, cmd, unit);
  if (plan.ok && opts.checkFunds && plan.cost > 0 && !ctx.q.economy.canAfford(plan.cost)) { plan.ok = false; plan.reason = 'funds'; }
  return plan;
}

/** 翻转族按行进轴置位：精灵默认轴向在 tuning.bridgeSpriteAxis。 */
const flipFor = (tuning: PlacementTuning, axis: Axis): boolean => axis !== (tuning.bridgeSpriteAxis === 'LR' ? AXIS_LR : AXIS_TB);

// ---------------------------------------------------------------- 地表族（电线 / 道路 / 铁路）
function planSurface(ctx: SimContext, tuning: PlacementTuning, kind: SurfaceFamily, cmd: NetworkCmd, unit: number): NetworkPlan {
  const { tiles: path, axis, point } = straightPath(cmd.from, cmd.to);
  const L = ctx.state.layers, T = ctx.q.terrain;
  const n = path.length;
  const ops: NetOp[] = [];
  const waterAt = (k: number): boolean => k >= 0 && k < n && T.isWater(path[k]!);

  const classifyLand = (k: number): NetOp => {
    const i = path[k]!, v = L.xbld[i]!, s = T.slope(i);
    if (surfaceHas(kind, v)) return { op: 'existing', i };
    if (isCoverable(v)) {
      if (s === 0) return { op: 'new', i, piece: straightPiece(kind, axis), cost: unit };
      const sa = slopeAxis(s);
      if (sa === -1 || (!point && sa !== axis)) return { op: 'skip', i, reason: 'slope' };
      if (kind === 'rail') {                                     // 铁路不允许连续坡面（spec:terrain §2.11.3）
        const slopeAt = (kk: number): boolean => kk >= 0 && kk < n && !waterAt(kk) && T.slope(path[kk]!) !== 0;
        if (slopeAt(k - 1) || slopeAt(k + 1)) return { op: 'skip', i, reason: 'slope' };
      }
      return { op: 'new', i, piece: slopePiece(kind, s), cost: unit };
    }
    if (s === 0) {
      const other = flatStraightOf(v);
      if (other) {
        const p = crossingPiece(kind, point ? perpendicular(other.axis) : axis, other.kind, other.axis);
        if (p >= 0) return { op: 'crossing', i, piece: p, cost: unit };
      }
    }
    return { op: 'skip', i, reason: 'obstructed' };
  };

  /** 岸格：陆地、平地或沿桥向坡面、最高点不低于水面（v1 不自动改地形）。 */
  const shoreOk = (shore: number, water: number): boolean => {
    if (T.isWater(shore)) return false;
    const s = T.slope(shore);
    if (s !== 0 && slopeAxis(s) !== axis) return false;
    return T.alt(shore) + (s !== 0 ? 1 : 0) >= L.waterLevel[water]!;
  };

  const planWaterRun = (k: number, e: number): RunResult => {
    const len = e - k;
    const run = path.slice(k, e);
    if (run.every((i) => bridgeOf(kind, L.xbld[i]!))) return { ops: run.map((i) => ({ op: 'existing', i })) };
    if (k === 0 || e === n) return { reason: 'water' };                                                 // 桥必须两端着陆
    if (run.some((i) => L.xbld[i]! !== 0 && !bridgeOf(kind, L.xbld[i]!))) return { reason: 'water' };  // 水面上有别族桥 / 物件
    const options = ctx.q.transport.bridgeOptions(kind, len);
    if (options.length === 0) return { reason: 'water' };
    if (!shoreOk(path[k - 1]!, path[k]!) || !shoreOk(path[e]!, path[e - 1]!)) return { reason: 'terrain' };
    if (cmd.bridge === undefined) return { reason: 'needsBridge', modal: { id: 'bridgeType', payload: { from: cmd.from, to: cmd.to, length: len, options: [...options] } } };
    const bridge = cmd.bridge as BridgeKind;
    if (!options.includes(bridge)) return { reason: 'water' };
    const pieces = ctx.q.transport.bridgePieces(bridge, kind, len);
    if (!pieces || pieces.length !== len) return { reason: 'water' };
    const per = tuning.bridgeCostPerTile[bridge] ?? 0, flip = flipFor(tuning, axis);
    return { ops: pieces.map((p, j) => ({ op: 'bridge', i: path[k + j]!, piece: p, flip, cost: per })) };
  };

  let k = 0;
  while (k < n) {
    if (!waterAt(k)) { ops.push(classifyLand(k)); k++; continue; }
    let e = k;
    while (waterAt(e)) e++;
    const run = planWaterRun(k, e);
    if ('reason' in run) return wholeReject(kind, axis, ops, run.reason, run.modal);
    for (const o of run.ops) ops.push(o);
    k = e;
  }
  let edgeOffer = -1;
  if (kind === 'road' || kind === 'rail') {
    for (const o of ops) {
      if (o.op !== 'new' || L.xtxt[o.i] === XTXT_CONNECTION) continue;
      if (pieceAxis(plainIndex(kind, o.piece)) !== axis || !edgeAxesOf(o.i).includes(axis)) continue;
      edgeOffer = o.i; break;
    }
  }
  return finish(kind, axis, ops, edgeOffer);
}

// ---------------------------------------------------------------- 地下族（管线 / 地铁）
function planUnderground(ctx: SimContext, tuning: PlacementTuning, kind: UndFamily, cmd: NetworkCmd, unit: number): NetworkPlan {
  const { tiles: path, axis, point } = straightPath(cmd.from, cmd.to);
  const L = ctx.state.layers, T = ctx.q.terrain;
  const ops: NetOp[] = path.map((i): NetOp => {
    const u = L.xund[i]!;
    if (!tuning.undergroundUnderWater && T.isWater(i)) return { op: 'skip', i, reason: 'water' };
    if (undHas(kind, u)) return { op: 'existing', i };
    if (u === 0) {
      const s = T.slope(i), sa = slopeAxis(s);
      const piece = kind === 'pipe' && sa !== -1 && (point || sa === axis) ? slopePiece('pipe', s) : straightPiece(kind, axis);
      return { op: 'new', i, piece, cost: unit };
    }
    let p = undCrossingPiece(kind, axis, u);
    if (p < 0 && point) p = undCrossingPiece(kind, perpendicular(axis), u);
    if (p >= 0) return { op: 'crossing', i, piece: p, cost: unit };
    return { op: 'skip', i, reason: 'obstructed' };                               // 0x22 / 0x23 / 非直线地下物件
  });
  return finish(kind, axis, ops, -1);
}

// ---------------------------------------------------------------- 高速（2×2 块）
function planHighway(ctx: SimContext, tuning: PlacementTuning, cmd: NetworkCmd, unit: number): NetworkPlan {
  const kind: NetKind = 'highway';
  const fx = tileX(cmd.from) & ~1, fy = tileY(cmd.from) & ~1, tx = tileX(cmd.to) & ~1, ty = tileY(cmd.to) & ~1;
  const axis: Axis = Math.abs(tx - fx) >= Math.abs(ty - fy) ? AXIS_LR : AXIS_TB;
  const blockAt = (bx: number, by: number): number[] => [tileIndex(bx, by), tileIndex(bx, by + 1), tileIndex(bx + 1, by), tileIndex(bx + 1, by + 1)];
  const blocks: number[][] = [];
  if (axis === AXIS_LR) { const step = tx >= fx ? 2 : -2; for (let bx = fx; ; bx += step) { blocks.push(blockAt(bx, fy)); if (bx === tx) break; } }
  else { const step = ty >= fy ? 2 : -2; for (let by = fy; ; by += step) { blocks.push(blockAt(fx, by)); if (by === ty) break; } }
  const piece = HIGHWAY_STRAIGHT[axis];
  const L = ctx.state.layers, T = ctx.q.terrain;

  type BlockClass = { water: true } | { water: false; ops: NetOp[] };
  const skipAll = (tiles: number[], reason: RejectReason): BlockClass => ({ water: false, ops: tiles.map((i) => ({ op: 'skip', i, reason })) });
  const classifyBlock = (tiles: number[]): BlockClass => {
    if (tiles.some((i) => T.isWater(i))) return { water: true };
    const out: NetOp[] = [];
    let charged = false;
    for (const i of tiles) {
      const v = L.xbld[i]!;
      if (highwayAxisOf(v) === axis) { out.push({ op: 'existing', i }); continue; }
      if (T.slope(i) !== 0) return skipAll(tiles, 'slope');                     // 高速坡面块 v2
      if (isCoverable(v)) { out.push({ op: 'new', i, piece, cost: charged ? 0 : unit }); charged = true; continue; }
      const other = flatStraightOf(v);
      const p = other ? crossingPiece('highway', axis, other.kind, other.axis) : -1;
      if (p >= 0) { out.push({ op: 'crossing', i, piece: p, cost: charged ? 0 : unit }); charged = true; continue; }
      return skipAll(tiles, 'obstructed');                                        // 垂直高速 → 立交 0x69（v2）
    }
    return { water: false, ops: out };
  };
  const edgeOfferOf = (tiles: number[], bops: NetOp[]): number => {
    if (!bops.some((o) => o.op === 'new' || o.op === 'crossing')) return -1;
    const bx = tileX(tiles[0]!), by = tileY(tiles[0]!);
    let at = -1;
    if (axis === AXIS_LR) { if (bx === 0) at = tileIndex(0, by); else if (bx === 126) at = tileIndex(127, by); }
    else if (by === 0) at = tileIndex(bx, 0); else if (by === 126) at = tileIndex(bx, 127);
    return at >= 0 && L.xtxt[at] !== XTXT_CONNECTION ? at : -1;
  };
  const blockShoreOk = (tiles: number[]): boolean => tiles.every((i) => !T.isWater(i) && T.slope(i) === 0);

  const classes = blocks.map(classifyBlock);
  const ops: NetOp[] = [];
  let edgeOffer = -1;
  let k = 0;
  while (k < blocks.length) {
    const c = classes[k]!;
    if (!c.water) {
      for (const o of c.ops) ops.push(o);
      if (edgeOffer < 0) edgeOffer = edgeOfferOf(blocks[k]!, c.ops);
      k++; continue;
    }
    let e = k;
    while (e < blocks.length && classes[e]!.water) e++;
    const len = e - k;
    if (k === 0 || e === blocks.length) return wholeReject(kind, axis, ops, 'water');
    const options = ctx.q.transport.bridgeOptions('highway', len);
    if (options.length === 0) return wholeReject(kind, axis, ops, 'water');       // v1：高速无桥 → 'water'，不弹模态
    if (!blockShoreOk(blocks[k - 1]!) || !blockShoreOk(blocks[e]!)) return wholeReject(kind, axis, ops, 'terrain');
    if (cmd.bridge === undefined) return wholeReject(kind, axis, ops, 'needsBridge', { id: 'bridgeType', payload: { from: cmd.from, to: cmd.to, length: len, options: [...options] } });
    const bridge = cmd.bridge as BridgeKind;
    if (!options.includes(bridge)) return wholeReject(kind, axis, ops, 'water');
    const pieces = ctx.q.transport.bridgePieces(bridge, 'highway', len);
    if (!pieces || pieces.length !== len) return wholeReject(kind, axis, ops, 'water');
    const per = tuning.bridgeCostPerTile[bridge] ?? 0, flip = flipFor(tuning, axis);
    for (let j = 0; j < len; j++) blocks[k + j]!.forEach((i, t) => ops.push({ op: 'bridge', i, piece: pieces[j]!, flip, cost: t === 0 ? per : 0 }));
    k = e;
  }
  return finish(kind, axis, ops, edgeOffer);
}

// ---------------------------------------------------------------- 写入与选形刷新
/** 按计划写层；返回实际改动的格（含选形刷新波及的邻格）。调用方已完成扣费。 */
export function applyNetworkPlan(ctx: SimContext, kind: NetKind, plan: NetworkPlan): number[] {
  const act = ctx.act, L = ctx.state.layers;
  const changed: number[] = [];
  const und = isUndFamily(kind);
  for (const o of plan.ops) {
    if (o.op === 'skip' || o.op === 'existing') continue;
    if (und) {
      act.setXund(o.i, o.piece);
      if (kind === 'pipe' || o.op === 'crossing') act.setXbit(o.i, XBit.Piped, true);
    } else {
      act.setXbld(o.i, o.piece);
      const sz = FOOTPRINT[o.piece]!;
      act.setXzon(o.i, sz > 1 ? cornerBits(sz, tileX(o.i) & 1, tileY(o.i) & 1) : Corner.All);   // 网络件：分区码清 0、角标全置
      const flipped = o.op === 'bridge' && o.flip;
      if (((L.xbit[o.i]! & XBit.Flipped) !== 0) !== flipped) act.setXbit(o.i, XBit.Flipped, flipped);
    }
    changed.push(o.i);
  }
  if (changed.length === 0) return changed;
  const seeds = changed.slice();
  if (und) refreshUnderground(ctx, kind, seeds, changed);
  else if (kind !== 'highway') refreshSurface(ctx, kind, seeds, changed);
  if (kind === 'power') act.requestRescan('power');
  if (kind === 'pipe') act.requestRescan('water');
  if (kind === 'road' || kind === 'highway') act.markAccessDirty(changed);
  return changed;
}

function railHalfPartnerPresent(L: { xbld: Uint8Array }, t: number, half: number): boolean {
  const slopeId = RAIL_SLOPE_OF_HALF[half]!;
  const s = slopeId - NET_BASE.rail - 1;                               // 坡面件 k=2..5 ↔ 坡面码 1..4
  const partner = neighbor(t, opposite(SLOPE_LOW_DIR[s]!));
  return partner >= 0 && L.xbld[partner] === slopeId;
}

/**
 * 地表族选形刷新：seeds 及其四邻中本族的平直片段（坡面件由地形决定；平地交给 q.transport.pieceFor，只接受本族平直片段的返回值）；
 * 桥 / 交叉件 / 匝道 / 车站不动。铁路另做坡脚半高件配对。改动的格追加到 out。
 */
export function refreshSurface(ctx: SimContext, family: SurfaceFamily, seeds: readonly number[], out: number[]): void {
  const L = ctx.state.layers, T = ctx.q.terrain, act = ctx.act;
  const cand = new Set<number>();
  for (const i of seeds) { cand.add(i); forEachNeighbor(i, (j) => cand.add(j)); }
  const base = NET_BASE[family];
  for (const t of cand) {
    const v = L.xbld[t]!;
    let k = plainIndex(family, v);
    if (family === 'rail' && RAIL_SLOPE_OF_HALF[v] !== undefined) {
      if (railHalfPartnerPresent(L, t, v)) continue;
      k = pieceAxis(RAIL_SLOPE_OF_HALF[v]! - base);                   // 伙伴坡面件已不在：退化为同轴直线再重选
    }
    if (k < 0) continue;
    const s = T.slope(t);
    let want: number;
    if (SLOPE_PIECE[s] !== undefined) want = base + SLOPE_PIECE[s]!;
    else if (s !== 0) continue;
    else { const p = ctx.q.transport.pieceFor(family, t); want = plainIndex(family, p) >= 0 ? p : base + k; }
    if (want !== v) { act.setXbld(t, want); out.push(t); }
  }
  if (family !== 'rail') return;
  for (const t of cand) {
    const v = L.xbld[t]!, half = RAIL_HALF_OF_SLOPE[v];
    if (half === undefined) continue;
    const s = v - base - 1;
    const low = neighbor(t, SLOPE_LOW_DIR[s]!);
    if (low < 0 || T.slope(low) !== 0) continue;
    const lk = plainIndex('rail', L.xbld[low]!);
    if ((lk === 0 || lk === 1) && lk === slopeAxis(s)) { act.setXbld(low, half); out.push(low); }
  }
}

/** 地下族选形刷新：平直片段经 q.transport.pieceFor；管线在沿轴单级坡上用 H 变体 0x12–0x15；十字口 / 0x22 / 0x23 不动。 */
export function refreshUnderground(ctx: SimContext, family: UndFamily, seeds: readonly number[], out: number[]): void {
  const L = ctx.state.layers, T = ctx.q.terrain, act = ctx.act;
  const cand = new Set<number>();
  for (const i of seeds) { cand.add(i); forEachNeighbor(i, (j) => cand.add(j)); }
  for (const t of cand) {
    const u = L.xund[t]!;
    if (plainIndex(family, u) < 0) continue;
    const p = ctx.q.transport.pieceFor(family, t);
    let want = plainIndex(family, p) >= 0 ? p : u;
    if (family === 'pipe') {
      const s = T.slope(t), sa = slopeAxis(s), wk = plainIndex('pipe', want);
      if (sa !== -1 && (wk === 0 || wk === 1) && wk === sa) want = slopePiece('pipe', s);
    }
    if (want !== u) { act.setXund(t, want); out.push(t); }
  }
}
