// ===== sim/placement/demolish.ts =====
// 拆除 / 去分区 / 划分区（spec:economy §3.6 与 Q9 整栋 $1×size²；spec:zones §2.2 工具表：推建筑留瓦砾且分区码保留、去分区建筑变瓦砾且码归 0、
// 改划异类按新价收费且建筑变瓦砾；spec:terrain §2.11.1 坡面上拆除直接变空地、§2.11.2 分区只画在干地；spec:power-water §2.11 推土后 PIPED 与地下管线；
// spec:services §3.4 拆除清 XTXT 标签并释放独占微模拟记录）。plan* 纯读（preview 共用），apply* 写层。
import type { Command, RejectReason } from '../../contracts/commands';
import { FOOTPRINT, anchorOf, forEachLotTile } from '../../contracts/footprint';
import { CityMode, Corner, DEVELOPED_FIRST, TILES, XBit, XterClass, ZONE_MASK, tileIndex, tileX, tileY } from '../../contracts/grid';
import { isBridge, isPipeUnd, isPowerCarrier } from '../../contracts/net';
import type { SimContext } from '../../contracts/system';
import type { TileVerdict } from './check';
import { refreshSurface, refreshUnderground } from './network';
import { ELEVATED_WIRE, RADIOACTIVE, SMALL_PARK, XTXT_CONNECTION } from './pieces';
import type { PlacementTuning } from './tuning';

const DEMOLISH_TOOL = 'bulldozer.demolish', DEZONE_TOOL = 'bulldozer.dezone';
/** 独占微模拟记录的 XTXT 标签区间（spec:services §2.6.1：记录 r → 0x33 + r，独占 r = 10..149）。 */
const MICROSIM_LABEL_LO = 0x3d, MICROSIM_LABEL_HI = 0xc8, MICROSIM_LABEL_BASE = 0x33;
const SUBWAY_STATION = 0xe9, SUBRAIL_LO = 0x6c, SUBRAIL_HI = 0x6f, MISSILE_SILO = 0xf9;
const CLEAR_BITS = XBit.Powerable | XBit.Powered | XBit.Watered | XBit.Flipped;

const toolCost = (ctx: SimContext, id: string): number => ctx.catalogue.toolById(id)?.cost ?? 0;
const validTile = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < TILES;

/** 分区地上的建筑（R/C/I 生长建筑、施工 / 废弃过渡、教堂）：改划 / 去分区时随地块一起变瓦砾。 */
export function isZoneStructure(ctx: SimContext, v: number): boolean {
  const def = ctx.catalogue.BUILDINGS[v];
  if (!def || v < 0x0e) return false;
  const c = def.category;
  return def.zone !== undefined || def.transition !== undefined || c === 'zoneR' || c === 'zoneC' || c === 'zoneI' || c === 'construction' || c === 'abandoned' || c === 'church';
}

/**
 * 整栋拆除：占地每格 → 瓦砾（平地且 ≥ 0x70 且 rubble）或空地；角标：瓦砾按 zones 口径每格独立 1×1（0xF0），空地清 0；分区码按 dezone 决定保留 / 归 0；
 * 位：清 POWERABLE / POWERED / WATERED / FLIPPED，PIPED 仅当地下仍有管线时保留；XTXT 标签清 0 并释放独占微模拟记录；地铁站 / 转换件清 XUND 0x23，导弹井清 0x22。
 */
export function demolishLot(ctx: SimContext, tuning: PlacementTuning, anchor: number, id: number, size: number, opts: { rubble: boolean; dezone: boolean }, out: number[]): void {
  const L = ctx.state.layers, T = ctx.q.terrain, act = ctx.act;
  const label = L.xtxt[anchor]!;
  let xtxtTouched = false;
  forEachLotTile(anchor, size, (i, dx, dy) => {
    if (!validTile(i) || tileX(i) !== tileX(anchor) + dx || tileY(i) !== tileY(anchor) + dy) return;   // 贴边损坏占地保护
    const flat = T.slope(i) === 0 && !T.isWater(i);
    const rubble = opts.rubble && tuning.rubbleOnDemolish && id >= DEVELOPED_FIRST && flat;
    act.setXbld(i, rubble ? 0x01 + ((dx + dy) & 3) : 0);
    const zone = opts.dezone ? 0 : L.xzon[i]! & ZONE_MASK;
    act.setXzon(i, zone | (rubble ? Corner.All : 0));
    const keepPiped = isPipeUnd(L.xund[i]!);
    act.setXbit(i, keepPiped ? CLEAR_BITS : CLEAR_BITS | XBit.Piped, false);
    if (L.xtxt[i] !== 0) { L.xtxt[i] = 0; xtxtTouched = true; }
    if ((id === SUBWAY_STATION || (id >= SUBRAIL_LO && id <= SUBRAIL_HI)) && L.xund[i] === 0x23) act.setXund(i, 0);
    if (id === MISSILE_SILO && L.xund[i] === 0x22) act.setXund(i, 0);
    out.push(i);
  });
  if (label >= MICROSIM_LABEL_LO && label <= MICROSIM_LABEL_HI) act.freeMicrosim(label - MICROSIM_LABEL_BASE);
  if (xtxtTouched) act.layerChanged('xtxt');
}

/** 格 i 所属建筑的锚点与尺寸（角标损坏 → 按 1×1）。 */
function lotOf(ctx: SimContext, i: number): { anchor: number; size: number } {
  const L = ctx.state.layers, id = L.xbld[i]!, size = FOOTPRINT[id] ?? 1;
  if (size === 1) return { anchor: i, size: 1 };
  const a = anchorOf(L, i);
  if (a < 0) { ctx.diag.push({ level: 'warn', code: 'placement.brokenLot', message: `格 ${i} 的 ${size}×${size} 建筑 0x${id.toString(16)} 找不到锚点，按 1×1 处理` }); return { anchor: i, size: 1 }; }
  return { anchor: a, size };
}

// ---------------------------------------------------------------- bulldoze
export type BulldozeOp =
  | { op: 'lot'; anchor: number; id: number; size: number; cost: number }
  | { op: 'surface'; i: number; cost: number }
  | { op: 'bridge'; tiles: number[]; cost: number }
  | { op: 'und'; i: number; to: number; cost: number };
export interface BulldozePlan { ok: boolean; reason?: RejectReason; cost: number; ops: BulldozeOp[]; tiles: TileVerdict[] }

/** 同一座桥沿其轴向的连续桥件（含高架电线）。 */
function bridgeRun(ctx: SimContext, i: number): number[] {
  const L = ctx.state.layers;
  const isB = (j: number): boolean => j >= 0 && (isBridge(L.xbld[j]!) || L.xbld[j] === ELEVATED_WIRE);
  const x = tileX(i), y = tileY(i);
  const lr = (x > 0 && isB(tileIndex(x - 1, y))) || (x < 127 && isB(tileIndex(x + 1, y)));
  const run = [i];
  for (const step of [-1, 1]) {
    for (let d = 1; ; d++) {
      const nx = lr ? x + d * step : x, ny = lr ? y : y + d * step;
      if (nx < 0 || ny < 0 || nx > 127 || ny > 127) break;
      const j = tileIndex(nx, ny);
      if (!isB(j)) break;
      run.push(j);
    }
  }
  return run;
}

export function planBulldoze(ctx: SimContext, tuning: PlacementTuning, tiles: readonly number[]): BulldozePlan {
  const L = ctx.state.layers;
  const unit = toolCost(ctx, DEMOLISH_TOOL);
  const ops: BulldozeOp[] = [];
  const verdicts: TileVerdict[] = [];
  const covered = new Set<number>();
  const anchors = new Set<number>();
  let firstReason: RejectReason | undefined;
  if (ctx.state.clock.mode !== CityMode.City) return { ok: false, reason: 'mode', cost: 0, ops, tiles: tiles.map((i) => ({ i, ok: false, reason: 'mode' })) };
  for (const i of tiles) {
    if (!validTile(i)) { firstReason ??= 'outOfBounds'; continue; }
    if (covered.has(i)) continue;
    const v = L.xbld[i]!;
    const skip = (reason: RejectReason): void => { verdicts.push({ i, ok: false, reason }); firstReason ??= reason; covered.add(i); };
    if (v >= DEVELOPED_FIRST || v === SMALL_PARK) {
      const { anchor, size } = lotOf(ctx, i);
      if (anchors.has(anchor)) continue;
      anchors.add(anchor);
      const cost = unit * (tuning.demolishWholeStructure ? size * size : 1);
      ops.push({ op: 'lot', anchor, id: v, size, cost });
      forEachLotTile(anchor, size, (j) => { covered.add(j); verdicts.push({ i: j, ok: true }); });
    } else if (v >= 0x0e) {
      if (isBridge(v) || v === ELEVATED_WIRE) {
        const run = bridgeRun(ctx, i).filter((j) => !covered.has(j));
        for (const j of run) { covered.add(j); verdicts.push({ i: j, ok: true }); }
        ops.push({ op: 'bridge', tiles: run, cost: unit * run.length });
      } else { covered.add(i); verdicts.push({ i, ok: true }); ops.push({ op: 'surface', i, cost: unit }); }
    } else if (v === RADIOACTIVE) skip('obstructed');
    else if (v !== 0) { covered.add(i); verdicts.push({ i, ok: true }); ops.push({ op: 'surface', i, cost: unit }); }
    else {
      const u = L.xund[i]!;
      const to = u === 0x1f ? 0x01 : u === 0x20 ? 0x02 : (u >= 0x01 && u <= 0x1e) ? 0 : -1;   // 十字口先去管线；0x22 / 0x23 随建筑走
      if (to < 0) skip('noTarget');
      else { covered.add(i); verdicts.push({ i, ok: true }); ops.push({ op: 'und', i, to, cost: unit }); }
    }
  }
  const cost = ops.reduce((a, o) => a + o.cost, 0);
  if (ops.length === 0) return { ok: false, reason: firstReason ?? 'noTarget', cost: 0, ops, tiles: verdicts };
  return { ok: true, cost, ops, tiles: verdicts };
}

/** 执行拆除（调用方已扣费）；返回改动格。 */
export function applyBulldoze(ctx: SimContext, tuning: PlacementTuning, plan: BulldozePlan): number[] {
  const L = ctx.state.layers, act = ctx.act;
  const changed: number[] = [];
  const surfaceSeeds: number[] = [], undSeeds: number[] = [];
  let xtxtTouched = false, power = false, water = false;
  const clearSurface = (i: number): void => {
    const v = L.xbld[i]!;
    act.setXbld(i, 0);
    act.setXzon(i, L.xzon[i]! & ZONE_MASK);
    if ((L.xbit[i]! & CLEAR_BITS) !== 0) act.setXbit(i, CLEAR_BITS, false);
    if (!isPipeUnd(L.xund[i]!) && (L.xbit[i]! & XBit.Piped) !== 0 && v < 0x0e) act.setXbit(i, XBit.Piped, false);
    if (L.xtxt[i] === XTXT_CONNECTION) { L.xtxt[i] = 0; xtxtTouched = true; }
    changed.push(i); surfaceSeeds.push(i);
    if (isPowerCarrier(v) || v >= DEVELOPED_FIRST) power = true;
    if (v === SMALL_PARK) water = true;
  };
  for (const o of plan.ops) {
    switch (o.op) {
      case 'lot': demolishLot(ctx, tuning, o.anchor, o.id, o.size, { rubble: true, dezone: false }, changed); power = true; water = true; forEachLotTile(o.anchor, o.size, (j) => surfaceSeeds.push(j)); break;
      case 'surface': clearSurface(o.i); break;
      case 'bridge': for (const j of o.tiles) clearSurface(j); break;
      case 'und': {
        act.setXund(o.i, o.to);
        if (!isPipeUnd(o.to) && (L.xbit[o.i]! & XBit.Piped) !== 0 && L.xbld[o.i]! < DEVELOPED_FIRST) act.setXbit(o.i, XBit.Piped, false);
        changed.push(o.i); undSeeds.push(o.i); water = true; break;
      }
    }
  }
  if (surfaceSeeds.length > 0) for (const f of ['power', 'road', 'rail'] as const) refreshSurface(ctx, f, surfaceSeeds, changed);
  if (undSeeds.length > 0) for (const f of ['pipe', 'subway'] as const) refreshUnderground(ctx, f, undSeeds, changed);
  if (xtxtTouched) act.layerChanged('xtxt');
  if (power) act.requestRescan('power');
  if (water || power) act.requestRescan('water');
  act.markAccessDirty(changed);
  return changed;
}

// ---------------------------------------------------------------- dezone
export interface DezonePlan { ok: boolean; reason?: RejectReason; cost: number; writes: number[]; lots: { anchor: number; id: number; size: number }[]; tiles: TileVerdict[] }

export function planDezone(ctx: SimContext, tiles: readonly number[]): DezonePlan {
  const L = ctx.state.layers;
  const unit = toolCost(ctx, DEZONE_TOOL);
  const writes: number[] = [], lots: DezonePlan['lots'] = [], verdicts: TileVerdict[] = [];
  const seen = new Set<number>(), anchors = new Set<number>();
  if (ctx.state.clock.mode !== CityMode.City) return { ok: false, reason: 'mode', cost: 0, writes, lots, tiles: tiles.map((i) => ({ i, ok: false, reason: 'mode' })) };
  for (const i of tiles) {
    if (!validTile(i) || seen.has(i)) continue;
    seen.add(i);
    if ((L.xzon[i]! & ZONE_MASK) === 0) { verdicts.push({ i, ok: false, reason: 'noTarget' }); continue; }
    verdicts.push({ i, ok: true });
    writes.push(i);
    const v = L.xbld[i]!;
    if (isZoneStructure(ctx, v)) { const { anchor, size } = lotOf(ctx, i); if (!anchors.has(anchor)) { anchors.add(anchor); lots.push({ anchor, id: v, size }); } }
  }
  if (writes.length === 0) return { ok: false, reason: 'noTarget', cost: 0, writes, lots, tiles: verdicts };
  return { ok: true, cost: unit * writes.length, writes, lots, tiles: verdicts };
}

export function applyDezone(ctx: SimContext, tuning: PlacementTuning, plan: DezonePlan): number[] {
  const L = ctx.state.layers, act = ctx.act;
  const changed: number[] = [];
  for (const lot of plan.lots) demolishLot(ctx, tuning, lot.anchor, lot.id, lot.size, { rubble: true, dezone: true }, changed);
  for (const i of plan.writes) { if ((L.xzon[i]! & ZONE_MASK) !== 0) { act.setXzon(i, L.xzon[i]! & ~ZONE_MASK); changed.push(i); } }
  if (plan.lots.length > 0) { act.requestRescan('power'); act.requestRescan('water'); }
  return changed;
}

// ---------------------------------------------------------------- zoneRect
export type ZoneRectCmd = Extract<Command, { type: 'zoneRect' }>;
export interface ZonePlan { ok: boolean; reason?: RejectReason; cost: number; zone: number; writes: number[]; lots: { anchor: number; id: number; size: number }[]; tiles: TileVerdict[] }

/**
 * 分区矩形：不合格格跳过并按实际格数计费。可划：干地（含坡面 1..12）、空地 / 瓦砾 / 树木、或分区建筑所在格（改划异类 → 整栋变瓦砾）；
 * 同码已划区格免费跳过；水面 / 瀑布 / bedrock → water / terrain；公共建筑 / 网络 / 小公园 / 放射性 → occupied。
 */
export function planZoneRect(ctx: SimContext, cmd: ZoneRectCmd, opts: { checkFunds?: boolean } = {}): ZonePlan {
  const L = ctx.state.layers, T = ctx.q.terrain;
  const zone = cmd.zone & ZONE_MASK;
  const tool = ctx.catalogue.TOOLS.find((t) => t.zoneCode === zone);
  const empty = (reason: RejectReason): ZonePlan => ({ ok: false, reason, cost: 0, zone, writes: [], lots: [], tiles: [] });
  if (!tool) return empty('noTarget');
  if (ctx.state.clock.mode !== CityMode.City) return empty('mode');
  if (tool.tech && !ctx.q.tech.invented(tool.tech)) return empty('notInvented');
  const x0 = Math.max(0, Math.min(cmd.x0, cmd.x1) | 0), x1 = Math.min(127, Math.max(cmd.x0, cmd.x1) | 0);
  const y0 = Math.max(0, Math.min(cmd.y0, cmd.y1) | 0), y1 = Math.min(127, Math.max(cmd.y0, cmd.y1) | 0);
  const writes: number[] = [], lots: ZonePlan['lots'] = [], tiles: TileVerdict[] = [];
  const anchors = new Set<number>();
  let firstReason: RejectReason | undefined;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const i = tileIndex(x, y), v = L.xbld[i]!, z = L.xzon[i]! & ZONE_MASK;
    let reason: RejectReason | undefined;
    if (T.isWater(i)) reason = 'water';
    else if (T.slope(i) === 13 || T.xterClass(i) === XterClass.Waterfall) reason = 'terrain';
    else if (v === RADIOACTIVE || v === SMALL_PARK) reason = 'occupied';
    else if (v >= 0x0e && !isZoneStructure(ctx, v)) reason = 'occupied';
    if (reason) { tiles.push({ i, ok: false, reason }); firstReason ??= reason; continue; }
    if (z === zone) { tiles.push({ i, ok: true }); continue; }                       // 同码：免费、不改
    tiles.push({ i, ok: true });
    writes.push(i);
    if (v >= 0x0e) { const { anchor, size } = lotOf(ctx, i); if (!anchors.has(anchor)) { anchors.add(anchor); lots.push({ anchor, id: v, size }); } }
  }
  if (writes.length === 0) return { ok: false, reason: firstReason ?? 'zoned', cost: 0, zone, writes, lots, tiles };
  const cost = tool.cost * writes.length;
  if (opts.checkFunds && cost > 0 && !ctx.q.economy.canAfford(cost)) return { ok: false, reason: 'funds', cost, zone, writes, lots, tiles };
  return { ok: true, cost, zone, writes, lots, tiles };
}

export function applyZoneRect(ctx: SimContext, tuning: PlacementTuning, plan: ZonePlan): number[] {
  const L = ctx.state.layers, act = ctx.act;
  const changed: number[] = [];
  for (const lot of plan.lots) demolishLot(ctx, tuning, lot.anchor, lot.id, lot.size, { rubble: true, dezone: false }, changed);
  for (const i of plan.writes) { act.setXzon(i, (L.xzon[i]! & ~ZONE_MASK) | plan.zone); changed.push(i); }
  if (plan.lots.length > 0) { act.requestRescan('power'); act.requestRescan('water'); }
  return changed;
}
