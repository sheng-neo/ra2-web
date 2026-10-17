// ===== sim/placement/check.ts =====
// 建筑放置校验（spec:building-catalogue §3.4 `canPlace` 的检查顺序；spec:terrain §2.11.1 地形限制）。
// 纯读：不写状态、不消费 PRNG。canPlace 查询、preview 与 placeBuilding 命令共用同一份判定。
import type { BuildingDef } from '../../contracts/catalogue';
import type { RejectReason } from '../../contracts/commands';
import { FOOTPRINT } from '../../contracts/footprint';
import { CityMode, DEVELOPED_FIRST, MAP, XterClass, ZONE_MASK, inMap, tileIndex } from '../../contracts/grid';
import { isRail, isRoad } from '../../contracts/net';
import { OrdinanceId } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { RADIOACTIVE, SMALL_PARK, forEachNeighbor } from './pieces';
import type { PlacementTuning } from './tuning';

export interface TileVerdict { i: number; ok: boolean; reason?: RejectReason }
export interface PlacementVerdict { ok: boolean; reason?: RejectReason; cost: number; id: number; size: number; tiles: TileVerdict[] }

const NUCLEAR_PLANT = 0xcb;
const HYDRO_A = 0xc6, HYDRO_B = 0xc7;

/**
 * placeBuilding 接受的 id：小公园 0x0D 与 ≥ 0x70 的可放置建筑。
 * 网络件 / 匝道 / 隧道口 / 地铁转换件走 network / tunnel 命令（后两者 v2），树木走 terrain 的 terrainTool → notImplemented；
 * 不可放置（分区生长建筑、港口 / 军事部件…）→ noTarget。
 */
export function placeableDef(ctx: SimContext, id: number): { def: BuildingDef } | { reason: RejectReason } {
  const def = ctx.catalogue.BUILDINGS[id];
  if (!def || !def.placeable) return { reason: 'noTarget' };
  if (id !== SMALL_PARK && id < DEVELOPED_FIRST) return { reason: 'notImplemented' };
  return { def };
}

/** 占地外沿环（正交邻接且不在占地内）是否有满足 pred 的格。 */
function ringHas(x0: number, y0: number, s: number, pred: (j: number) => boolean): boolean {
  const inside = (j: number): boolean => { const jx = j >> 7, jy = j & 127; return jx >= x0 && jx < x0 + s && jy >= y0 && jy < y0 + s; };
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) {
    let hit = false;
    forEachNeighbor(tileIndex(x0 + dx, y0 + dy), (j) => { if (!hit && !inside(j) && pred(j)) hit = true; });
    if (hit) return true;
  }
  return false;
}

/**
 * 按 spec §3.4 顺序：noTarget / notImplemented → mode → outOfBounds → notInvented → locked → alreadyBuilt → ordinance
 *  → 逐格（slope / needWaterfall / occupied / zoned，水格计数）→ waterCells / water → adjacency → funds。
 * microsimFull 只能在命令路径（allocMicrosim）判定，查询不产生。opts.skipFunds：命令路径由 act.charge 把关，不查 canAfford。
 */
export function checkPlacement(ctx: SimContext, tuning: PlacementTuning, id: number, x: number, y: number, opts: { skipFunds?: boolean } = {}): PlacementVerdict {
  const s = FOOTPRINT[id & 0xff] ?? 1;
  const tiles: TileVerdict[] = [];
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) if (inMap(x + dx, y + dy)) tiles.push({ i: tileIndex(x + dx, y + dy), ok: true });
  const res = placeableDef(ctx, id);
  const cost = 'def' in res ? res.def.cost : 0;
  const allFail = (reason: RejectReason): PlacementVerdict => {
    for (const t of tiles) { t.ok = false; t.reason = reason; }
    return { ok: false, reason, cost, id, size: s, tiles };
  };
  const tileFail = (t: TileVerdict, reason: RejectReason): PlacementVerdict => {
    t.ok = false; t.reason = reason;
    return { ok: false, reason, cost, id, size: s, tiles };
  };
  if ('reason' in res) return allFail(res.reason);
  const def = res.def;
  if (ctx.state.clock.mode !== CityMode.City) return allFail('mode');
  if (x < 0 || y < 0 || x + s > MAP || y + s > MAP) return allFail('outOfBounds');
  if (def.tech && !ctx.q.tech.invented(def.tech)) return allFail('notInvented');
  if (def.unlock && ((ctx.state.rewards.grantedMask >>> def.unlock.rewardBit) & 1) === 0) return allFail('locked');
  if (def.unlock?.once && ctx.state.counts.tile[id]! > 0) return allFail('alreadyBuilt');
  if (id === NUCLEAR_PLANT && ctx.q.economy.ordinance(OrdinanceId.NuclearFreeZone)) return allFail('ordinance');

  const L = ctx.state.layers, T = ctx.q.terrain;
  const terrainMode = def.placement?.terrain ?? 'flat';
  let waterCells = 0;
  for (const t of tiles) {
    const i = t.i;
    const water = T.isWater(i);
    if (water) waterCells++;
    if (terrainMode === 'waterfall') { if (T.xterClass(i) !== XterClass.Waterfall) return tileFail(t, 'needWaterfall'); }
    else if (terrainMode === 'flat' && !water && T.slope(i) !== 0) return tileFail(t, 'slope');
    const v = L.xbld[i]!;
    if (v >= 0x0e || v === RADIOACTIVE || v === SMALL_PARK) return tileFail(t, 'occupied');
    if ((L.xzon[i]! & ZONE_MASK) !== 0 && !def.zone) return tileFail(t, 'zoned');
  }
  const range = def.placement?.waterCellsInFootprint;
  if (range) { if (waterCells < range[0] || waterCells > range[1]) return allFail('waterCells'); }
  else if (waterCells > 0 && terrainMode !== 'waterfall') return allFail('water');
  const adj = def.placement?.needsAdjacent;
  if (adj && tuning.requireAdjacency) {
    const roadOk = adj === 'rail' || ringHas(x, y, s, (j) => isRoad(L.xbld[j]!));
    const railOk = adj !== 'rail' || ringHas(x, y, s, (j) => isRail(L.xbld[j]!));
    const hwyOk = adj !== 'highway+road' || ringHas(x, y, s, (j) => { const b = L.xbld[j]!; return b === 0x49 || b === 0x4a; });
    if (!(roadOk && railOk && hwyOk)) return allFail('adjacency');
  }
  if (!opts.skipFunds && cost > 0 && !ctx.q.economy.canAfford(cost)) return allFail('funds');
  return { ok: true, cost, id, size: s, tiles };
}

/**
 * 水电站两种朝向（spec:building-catalogue §4.2 第 4 条：按"哪侧邻格更高"选 0xC6 / 0xC7）：
 * T/B 邻格更高（水沿 T–B 流）→ 0xC6（hydroA），否则 0xC7。工具只给一个 id，命令据此改写。
 */
export function resolveHydroId(ctx: SimContext, id: number, x: number, y: number): number {
  if (id !== HYDRO_A && id !== HYDRO_B) return id;
  const alt = (nx: number, ny: number): number => (inMap(nx, ny) ? ctx.q.terrain.alt(tileIndex(nx, ny)) : -1);
  const tb = Math.max(alt(x, y - 1), alt(x, y + 1)), lr = Math.max(alt(x - 1, y), alt(x + 1, y));
  return tb >= lr ? HYDRO_A : HYDRO_B;
}
