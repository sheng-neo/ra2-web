// ===== sim/placement/commands.ts =====
// placement 的七条命令（COMMAND_OWNER：placeBuilding / zoneRect / dezone / bulldoze / network / tunnel / neighborConnection）。
// 费用门控一律经 act.charge（spec:economy §3.6：拖动类先算整段再一次扣，不足整段拒绝）；放置效果按 spec:building-catalogue §3.4 `place`。
import type { Command, CommandResult, RejectReason } from '../../contracts/commands';
import { NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import { cornerBits, forEachLotTile } from '../../contracts/footprint';
import { TILES, XBit, ZONE_MASK, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { SimContext, System } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { checkPlacement, resolveHydroId } from './check';
import { applyBulldoze, applyDezone, applyZoneRect, planBulldoze, planDezone, planZoneRect } from './demolish';
import { applyNetworkPlan, planNetwork, refreshSurface } from './network';
import { HIGHWAY_STRAIGHT, NET_TOOL, XTXT_CONNECTION, edgeAxesOf, flatStraightOf, highwayAxisOf, pieceAxis, plainIndex } from './pieces';
import type { SurfaceFamily } from './pieces';
import { DEFAULT_PLACEMENT_TUNING } from './tuning';
import type { PlacementTuning } from './tuning';

type Handlers = NonNullable<System['commands']>;
const tuningOf = (ctx: SimContext): PlacementTuning => getTuning(ctx, 'placement', DEFAULT_PLACEMENT_TUNING);
const reject = (reason: RejectReason, cost = 0, changed: readonly number[] = [], modal?: CommandResult['modal']): CommandResult =>
  modal ? { ok: false, cost, reason, changed, modal } : { ok: false, cost, reason, changed };

const WATER_PUMP = 0xdc, SUBWAY_STATION = 0xe9, SUBRAIL_LO = 0x6c, SUBRAIL_HI = 0x6f, MISSILE_SILO = 0xf9, STADIUM = 0xd7;
const STATION_IDS: ReadonlySet<number> = new Set([0xe9, 0xec, 0xed]);
/** 独占微模拟记录的 XTXT 标签 = 0x33 + 记录号（spec:services §2.6.1）。 */
const MICROSIM_LABEL_BASE = 0x33, MICROSIM_LABEL_MAX = 0xc8;

/** 水泵自动管线（spec:power-water §2.11）：下方为空 → 0x10；地铁 LR 0x01 → 0x1F；地铁 TB 0x02 → 0x20；其他保持。 */
function ensurePipeUnder(ctx: SimContext, i: number): void {
  const u = ctx.state.layers.xund[i]!;
  const to = u === 0 ? 0x10 : u === 0x01 ? 0x1f : u === 0x02 ? 0x20 : -1;
  if (to >= 0) ctx.act.setXund(i, to);
}

function placeBuilding(ctx: SimContext, cmd: Extract<Command, { type: 'placeBuilding' }>): CommandResult {
  const tuning = tuningOf(ctx);
  const verdict = checkPlacement(ctx, tuning, cmd.id, cmd.x, cmd.y, { skipFunds: true });
  if (!verdict.ok) return reject(verdict.reason ?? 'noTarget', verdict.cost);
  const id = resolveHydroId(ctx, cmd.id, cmd.x, cmd.y);
  const def = ctx.catalogue.BUILDINGS[id]!;
  const n = verdict.size, anchor = tileIndex(cmd.x, cmd.y);
  const act = ctx.act, L = ctx.state.layers;
  // 微模拟记录（services 协议）：独占类型满员 → microsimFull（可调；桩恒 −1 故默认放行）
  let slot = -1;
  if (def.microsim) {
    slot = act.allocMicrosim(id);
    if (slot < 0 && !def.microsim.shared && tuning.microsimFullRejects) return reject('microsimFull', verdict.cost);
  }
  if (verdict.cost > 0 && !act.charge(verdict.cost)) {
    if (slot >= 0 && !def.microsim?.shared) act.freeMicrosim(slot);
    return reject('funds', verdict.cost);
  }
  const flags = (def.powerable ? XBit.Powerable | XBit.Powered : 0) | (def.piped ? XBit.Piped : 0);   // POWERED 为乐观预置，下次电力扫描修正
  const label = slot >= 0 && MICROSIM_LABEL_BASE + slot <= MICROSIM_LABEL_MAX ? MICROSIM_LABEL_BASE + slot : 0;
  const changed: number[] = [];
  forEachLotTile(anchor, n, (i, dx, dy) => {
    act.setXbld(i, id);
    act.setXzon(i, (L.xzon[i]! & ZONE_MASK) | cornerBits(n, dx, dy));
    act.setXbit(i, XBit.Powerable | XBit.Powered | XBit.Piped | XBit.Flipped, false);
    if (flags !== 0) act.setXbit(i, flags, true);
    if (label !== 0) L.xtxt[i] = label;
    if (id === MISSILE_SILO) act.setXund(i, 0x22);
    changed.push(i);
  });
  if (label !== 0) act.layerChanged('xtxt');
  if (id === WATER_PUMP) ensurePipeUnder(ctx, anchor);
  if (id === SUBWAY_STATION || (id >= SUBRAIL_LO && id <= SUBRAIL_HI)) { act.setXund(anchor, 0x23); act.setXbit(anchor, XBit.Piped, false); }
  if (def.powerable || def.powerOutput) act.requestRescan('power');
  if (def.piped || def.waterOutput) act.requestRescan('water');
  if (STATION_IDS.has(id)) act.markAccessDirty(changed);
  act.emit({ type: 'sound', id: 'place' });
  if (def.unlock?.once) act.emit({ type: 'toolbar', reason: 'reward' });
  const res: CommandResult = { ok: true, cost: verdict.cost, changed };
  if (id === STADIUM) res.modal = { id: 'teamPick', payload: { at: anchor } };
  return res;
}

function zoneRect(ctx: SimContext, cmd: Extract<Command, { type: 'zoneRect' }>): CommandResult {
  const tuning = tuningOf(ctx);
  const plan = planZoneRect(ctx, cmd);
  if (!plan.ok) return reject(plan.reason ?? 'noTarget', plan.cost);
  if (plan.cost > 0 && !ctx.act.charge(plan.cost)) return reject('funds', plan.cost);
  const changed = applyZoneRect(ctx, tuning, plan);
  ctx.act.emit({ type: 'sound', id: 'zone' });
  return { ok: true, cost: plan.cost, changed };
}

function dezone(ctx: SimContext, cmd: Extract<Command, { type: 'dezone' }>): CommandResult {
  const tuning = tuningOf(ctx);
  const plan = planDezone(ctx, cmd.tiles);
  if (!plan.ok) return reject(plan.reason ?? 'noTarget', plan.cost);
  if (plan.cost > 0 && !ctx.act.charge(plan.cost)) return reject('funds', plan.cost);
  const changed = applyDezone(ctx, tuning, plan);
  ctx.act.emit({ type: 'sound', id: 'bulldoze' });
  return { ok: true, cost: plan.cost, changed };
}

function bulldoze(ctx: SimContext, cmd: Extract<Command, { type: 'bulldoze' }>): CommandResult {
  const tuning = tuningOf(ctx);
  const plan = planBulldoze(ctx, tuning, cmd.tiles);
  if (!plan.ok) return reject(plan.reason ?? 'noTarget', plan.cost);
  if (plan.cost > 0 && !ctx.act.charge(plan.cost)) return reject('funds', plan.cost);
  const changed = applyBulldoze(ctx, tuning, plan);
  ctx.act.emit({ type: 'sound', id: 'bulldoze' });
  return { ok: true, cost: plan.cost, changed };
}

function network(ctx: SimContext, cmd: Extract<Command, { type: 'network' }>): CommandResult {
  const tuning = tuningOf(ctx);
  const plan = planNetwork(ctx, tuning, cmd);
  if (!plan.ok) return reject(plan.reason ?? 'noTarget', plan.cost, [], plan.modal);
  if (plan.cost > 0 && !ctx.act.charge(plan.cost)) return reject('funds', plan.cost);
  const changed = applyNetworkPlan(ctx, cmd.kind, plan);
  if (changed.length > 0) ctx.act.emit({ type: 'sound', id: 'place' });
  const res: CommandResult = { ok: true, cost: plan.cost, changed };
  if (plan.edgeOffer >= 0) res.modal = { id: 'neighborConnect', payload: { at: plan.edgeOffer, kind: cmd.kind, cost: tuning.neighborConnectionCost } };
  return res;
}

/** 边缘格上可构成邻城连接的直线片段：道路 / 铁路直线、高速直线段，轴向垂直于所在边。返回 (族, 铺设费) 或 null。 */
export function connectionPieceAt(ctx: SimContext, at: number): { family: 'road' | 'rail' | 'highway'; fee: number } | null {
  if (!Number.isInteger(at) || at < 0 || at >= TILES) return null;
  const v = ctx.state.layers.xbld[at]!;
  const edges = edgeAxesOf(at);
  if (edges.length === 0) return null;
  const hwy = highwayAxisOf(v);
  if (v === HIGHWAY_STRAIGHT[0] || v === HIGHWAY_STRAIGHT[1]) return hwy !== -1 && edges.includes(hwy) ? { family: 'highway', fee: ctx.catalogue.toolById(NET_TOOL.highway)?.cost ?? 0 } : null;
  const st = flatStraightOf(v);
  if (!st || (st.kind !== 'road' && st.kind !== 'rail')) {
    // 坡面直线也算（边缘坡面沿法线轴）
    for (const f of ['road', 'rail'] as const) { const k = plainIndex(f, v); const a = pieceAxis(k); if (k >= 2 && k <= 5 && a !== -1 && edges.includes(a)) return { family: f, fee: ctx.catalogue.toolById(NET_TOOL[f])?.cost ?? 0 }; }
    return null;
  }
  return edges.includes(st.axis) ? { family: st.kind, fee: ctx.catalogue.toolById(NET_TOOL[st.kind])?.cost ?? 0 } : null;
}

/** 回滚边缘格（拒绝连接 / 资金不足）：清片段、退还铺设费、刷新同族邻格选形。高速回滚整列（块内两格）。 */
function rollbackEdgeTile(ctx: SimContext, at: number, family: 'road' | 'rail' | 'highway', fee: number, changed: number[]): void {
  const act = ctx.act, L = ctx.state.layers;
  const tiles = [at];
  if (family === 'highway') {
    const x = tileX(at), y = tileY(at), axis = highwayAxisOf(L.xbld[at]!);
    const partner = axis === 0 ? tileIndex(x, y ^ 1) : tileIndex(x ^ 1, y);
    if (highwayAxisOf(L.xbld[partner]!) === axis) tiles.push(partner);
  }
  for (const i of tiles) {
    act.setXbld(i, 0);
    act.setXzon(i, L.xzon[i]! & ZONE_MASK);
    if ((L.xbit[i]! & XBit.Flipped) !== 0) act.setXbit(i, XBit.Flipped, false);
    changed.push(i);
  }
  if (family !== 'highway') refreshSurface(ctx, family as SurfaceFamily, tiles, changed);
  // 退费：契约没有 refund 动作、桩的 charge(≤0) 不改资金，故直接写 economy.funds（见 contract-rfc）
  if (fee > 0) ctx.state.economy.funds += fee;
  act.markAccessDirty(changed);
}

function neighborConnection(ctx: SimContext, cmd: Extract<Command, { type: 'neighborConnection' }>): CommandResult {
  const tuning = tuningOf(ctx);
  const piece = connectionPieceAt(ctx, cmd.at);
  if (!piece) return reject('noTarget');
  const L = ctx.state.layers, act = ctx.act;
  if (L.xtxt[cmd.at] === XTXT_CONNECTION) return reject('alreadyBuilt');
  const changed: number[] = [];
  if (!cmd.accept) {
    rollbackEdgeTile(ctx, cmd.at, piece.family, piece.fee, changed);
    return { ok: true, cost: 0, changed };
  }
  const cost = tuning.neighborConnectionCost;
  if (cost > 0 && !act.charge(cost)) {
    rollbackEdgeTile(ctx, cmd.at, piece.family, piece.fee, changed);
    return reject('funds', cost, changed);
  }
  L.xtxt[cmd.at] = XTXT_CONNECTION;
  act.layerChanged('xtxt');
  changed.push(cmd.at);
  act.markAccessDirty(changed);
  act.emit({ type: 'sound', id: 'cash' });
  return { ok: true, cost, changed };
}

export function makeCommands(): Handlers {
  return {
    placeBuilding, zoneRect, dezone, bulldoze, network, neighborConnection,
    tunnel: () => NOT_IMPLEMENTED_RESULT,   // v2（spec:transport §2.7）
  };
}
