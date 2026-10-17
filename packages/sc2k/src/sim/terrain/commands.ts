// ===== sim/terrain/commands.ts =====（CONTRACTS §K terrainTool；spec:terrain §2.8 / §2.9 / §2.10 / §3.4.2）
// terrainTool 唯一处理者：Raise / Lower / Level / Stretch（角点传播 + 城市模式合法性 + 每改变格计费）、Water（池塘 / 瀑布）、Trees（±1 档）、
// Forest / Stream / SeaLevel（仅地形编辑模式）。费用先 charge 后应用（资金不足整次拒绝，不做部分应用）；编辑模式一律免费。
import type { Command, CommandResult, RejectReason } from '../../contracts/commands';
import { CityMode, MAX_ALT, TILES, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { createPrng, hash32 } from '../../contracts/prng';
import type { SimContext } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { ChangeSet } from './changes';
import { applyGeometry, isSeaLikeAt, isWaterAt } from './field';
import type { TerrainField } from './field';
import { BEDROCK_SLOPE, TREE_FIRST, TREE_LAST, TREE_MAX_DENSITY, isTreeXbld, slopeCodeOf, treeDensityOf, treeXbldOf } from './slope';
import { DEFAULT_TERRAIN_TUNING } from './tuning';
import type { TerrainTuning } from './tuning';
import { carveStream, isGroundOccupied, placeWater, refloodAll, waterPlaceCheck } from './water';

export type TerrainToolCommand = Extract<Command, { type: 'terrainTool' }>;
export interface TerrainRuntime { field: TerrainField; changes: ChangeSet }

const reject = (reason: RejectReason): CommandResult => ({ ok: false, cost: 0, reason, changed: [] });
const ok = (cost: number, changed: readonly number[]): CommandResult => ({ ok: true, cost, changed });
const validTile = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < TILES;
const dedupe = (path: readonly number[]): number[] => { const seen = new Set<number>(); const out: number[] = []; for (const i of path) if (validTile(i) && !seen.has(i)) { seen.add(i); out.push(i); } return out; };
const isCityMode = (ctx: SimContext): boolean => ctx.state.clock.mode !== CityMode.TerrainEdit;

/** 树木可放置性（spec §2.10 Trees / §2.12）：干地（含坡面）、无结构物 / 瓦砾、非 bedrock。 */
function treeCheck(ctx: SimContext, i: number): RejectReason | undefined {
  const L = ctx.state.layers;
  if (isWaterAt(L, i)) return 'water';
  if (isGroundOccupied(L.xbld[i]!)) return 'occupied';
  if (slopeCodeOf(L.xter[i]!) === BEDROCK_SLOPE) return 'terrain';
  return undefined;
}

type GeoOp = 'raise' | 'lower' | 'level';
/** Raise / Lower / Level 共同骨架：传播 → 触及地块 → 城市模式合法性 → 计费 → 写回。 */
function geometryOp(ctx: SimContext, rt: TerrainRuntime, op: GeoOp, path: readonly number[], T: TerrainTuning): CommandResult {
  const L = ctx.state.layers, field = rt.field, city = isCityMode(ctx);
  field.begin();
  if (op === 'level') {
    const ref = L.alt[path[0]!]!;
    for (const i of path) for (const c of field.tileCorners(i)) { field.propagate(c, ref, 1); field.propagate(c, ref, -1); }
  } else {
    const i = path[0]!;
    if (op === 'raise') {
      const top = field.maxCorner(i);
      if (top >= MAX_ALT) return reject('tooHigh');
      for (const c of field.tileCorners(i)) field.propagate(c, top + 1, 1);
    } else {
      const bottom = field.minCorner(i);
      if (bottom <= 0) return reject('tooLow');
      for (const c of field.tileCorners(i)) field.propagate(c, bottom - 1, -1);
    }
  }
  field.fixSaddles(op === 'lower' ? -1 : 1);
  const tiles = field.touchedTiles();
  if (tiles.length === 0) { field.begin(); return ok(0, []); }
  if (city) {
    for (const t of tiles) {
      if (L.xbld[t]! >= 0x0e || L.tunnelLevels[t]! > 0) { field.rollback(); return reject('obstructed'); }
      if (T.cityRejectsWaterForLowerLevel && op !== 'raise' && isSeaLikeAt(L, t)) { field.rollback(); return reject('water'); }
    }
  }
  const unit = op === 'raise' ? T.costRaise : op === 'lower' ? T.costLower : T.costLevel;
  const cost = city ? unit * tiles.length : 0;
  if (cost > 0 && !ctx.act.charge(cost)) { field.rollback(); return reject('funds'); }
  const changed = applyGeometry(ctx, field, tiles, rt.changes.mark);
  field.begin();
  return ok(cost, changed);
}

function waterTool(ctx: SimContext, rt: TerrainRuntime, path: readonly number[], T: TerrainTuning): CommandResult {
  const eligible: number[] = [];
  let first: RejectReason | undefined;
  for (const i of path) { const r = waterPlaceCheck(ctx, i); if (r) first ??= r; else eligible.push(i); }
  if (eligible.length === 0) return reject(first ?? 'noTarget');
  const cost = isCityMode(ctx) ? T.costWater * eligible.length : 0;
  if (cost > 0 && !ctx.act.charge(cost)) return reject('funds');
  for (const i of eligible) placeWater(ctx, rt.field, i, rt.changes);
  return ok(cost, rt.changes.take());
}

function treesTool(ctx: SimContext, rt: TerrainRuntime, path: readonly number[], remove: boolean, T: TerrainTuning): CommandResult {
  const L = ctx.state.layers;
  const plan: number[] = [], next: number[] = [];
  let first: RejectReason | undefined;
  for (const i of path) {
    const r = treeCheck(ctx, i);
    if (r) { first ??= r; continue; }
    const b = L.xbld[i]!;
    if (remove) { if (!isTreeXbld(b)) { first ??= 'noTarget'; continue; } plan.push(i); next.push(b === TREE_FIRST ? 0 : b - 1); }
    else { plan.push(i); next.push(b === 0 ? TREE_FIRST : Math.min(TREE_LAST, b + 1)); }   // 满密度再点仍收费
  }
  if (plan.length === 0) return reject(first ?? 'noTarget');
  const cost = isCityMode(ctx) && !remove ? T.costTrees * plan.length : 0;
  if (cost > 0 && !ctx.act.charge(cost)) return reject('funds');
  for (let k = 0; k < plan.length; k++) {
    const i = plan[k]!, v = next[k]!;
    if (L.xbld[i] !== v) { ctx.act.setXbld(i, v); rt.changes.add(i); }
  }
  return ok(cost, rt.changes.take());
}

/** Forest 刷子（编辑模式）：半径 r 内每格以 p = 1 − d/(r+1) 植树，密度 1..4 叠加；brush 流 = hash32(prng.state(), age, center)（只读 state()）。 */
function forestTool(ctx: SimContext, rt: TerrainRuntime, path: readonly number[], arg: number | undefined, T: TerrainTuning): CommandResult {
  const L = ctx.state.layers;
  const remove = (arg ?? 0) < 0;
  const r = Math.max(1, Math.min(8, Math.abs(arg ?? 0) || T.forestRadius));
  for (const center of path) {
    const cx = tileX(center), cy = tileY(center);
    const brush = createPrng(hash32(ctx.prng.state(), ctx.state.clock.age, center, 'forest'));
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const roll = brush.int(1024), density = 1 + brush.int(4);           // 每格恒消费两次
      const x = cx + dx, y = cy + dy;
      if (!inMap(x, y)) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (roll >= (1 - d / (r + 1)) * 1024) continue;
      const i = tileIndex(x, y);
      if (treeCheck(ctx, i) !== undefined) continue;
      const cur = L.xbld[i]!;
      const v = remove ? 0 : treeXbldOf(Math.min(TREE_MAX_DENSITY, treeDensityOf(cur) + density));
      if (cur !== v) { ctx.act.setXbld(i, v); rt.changes.add(i); }
    }
  }
  return ok(0, rt.changes.take());
}

function streamTool(ctx: SimContext, rt: TerrainRuntime, i: number, T: TerrainTuning): CommandResult {
  const L = ctx.state.layers;
  if (isWaterAt(L, i)) return reject('water');
  if (isGroundOccupied(L.xbld[i]!)) return reject('occupied');
  const carved = carveStream(ctx, rt.field, tileX(i), tileY(i), T.streamMaxSteps, rt.changes, T.streamPlateauMax);
  if (!carved) { rt.changes.take(); return reject('terrain'); }
  return ok(0, rt.changes.take());
}

function seaLevelTool(ctx: SimContext, rt: TerrainRuntime, arg: number | undefined): CommandResult {
  const s = ctx.state;
  const delta = arg === undefined ? 1 : arg | 0;
  const next = s.terrain.seaLevel + delta;
  if (next > MAX_ALT) return reject('tooHigh');
  if (next < 0) return reject('tooLow');
  s.terrain.seaLevel = next;
  refloodAll(ctx, rt.field, rt.changes);
  return ok(0, rt.changes.take());
}

/** Stretch（编辑模式）：对同一地块重复 Raise / Lower |levels| 次；任一步失败即止（已应用的保留）。 */
function stretchTool(ctx: SimContext, rt: TerrainRuntime, i: number, arg: number | undefined, T: TerrainTuning): CommandResult {
  const levels = arg === undefined ? 1 : arg | 0;
  if (levels === 0) return ok(0, []);
  const op: GeoOp = levels > 0 ? 'raise' : 'lower';
  let applied = 0;
  for (let k = 0; k < Math.abs(levels); k++) {
    const r = geometryOp(ctx, rt, op, [i], T);
    if (!r.ok) { if (applied === 0) { rt.changes.take(); return r; } break; }
    rt.changes.addAll(r.changed); applied++;
  }
  return ok(0, rt.changes.take());
}

export function handleTerrainTool(ctx: SimContext, cmd: TerrainToolCommand, rt: TerrainRuntime): CommandResult {
  const T = getTuning(ctx, 'terrain', DEFAULT_TERRAIN_TUNING);
  const path = dedupe(cmd.path);
  if (path.length === 0) return reject('outOfBounds');
  const city = isCityMode(ctx);
  switch (cmd.tool) {
    case 'raise': return geometryOp(ctx, rt, 'raise', [path[0]!], T);
    case 'lower': return geometryOp(ctx, rt, 'lower', [path[0]!], T);
    case 'level': return geometryOp(ctx, rt, 'level', path, T);
    case 'water': return waterTool(ctx, rt, path, T);
    case 'trees': return treesTool(ctx, rt, path, (cmd.arg ?? 0) < 0, T);
    case 'forest': return city ? reject('mode') : forestTool(ctx, rt, path, cmd.arg, T);
    case 'stream': return city ? reject('mode') : streamTool(ctx, rt, path[0]!, T);
    case 'stretch': return city ? reject('mode') : stretchTool(ctx, rt, path[0]!, cmd.arg, T);
    case 'seaLevel': return city ? reject('mode') : seaLevelTool(ctx, rt, cmd.arg);
    default: return reject('notImplemented');
  }
}
