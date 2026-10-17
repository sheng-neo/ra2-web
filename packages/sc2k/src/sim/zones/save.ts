// ===== sim/zones/save.ts =====
// .SC2 往返（spec:zones §3.6）与读档后重建：MISC 的需求 / 邻城 / 国家经济 / 产业 / 人口计数 + 角标修复（IMPORT_ORDER 的 zones 步）。
// hash:'sc2' 但 MISC 表无落点的派生标量（census.com/ind/citySize/taxable*/workforce/jobs/unemploymentPct/tiles.*、caps.*、邻城 connections）
// 写入 MISC 零区 0x1064–0x10B7（21 × i32，含魔数；compat 导出会清零，原版存档没有 → postLoad('sc2') 由真源层重算）。该偏移待 Lead 登记（contract-rfc）。
import { Corner, MAP, TILES, ZONE_MASK, tileIndex } from '../../contracts/grid';
import { lotIsUniform, cornerBits } from '../../contracts/footprint';
import { MISC, miscGet, miscSet } from '../../contracts/io';
import type { Sc2Document } from '../../contracts/io';
import type { Diagnostic, SimContext } from '../../contracts/system';
import { LotClass } from './buildings';
import type { ZonesCtx } from './lots';
import { INDUSTRY_COUNT, clampInt } from './tuning';
import { DEMAND_MAX, DEMAND_MIN } from './demand';

/** zones 扩展块：MISC 零区内 21 个 i32（0x1064..0x10B7）。 */
export const ZONES_MISC_EXT = 0x1064, ZONES_MISC_EXT_MAGIC = 0x5a4e5331, ZONES_MISC_EXT_INTS = 21;
const EXT_END = ZONES_MISC_EXT + ZONES_MISC_EXT_INTS * 4;
/** 产业块内三组的字节偏移（ratio[11] / tax[11]（economy）/ demand[11]）。 */
const IND_RATIO = 0, IND_DEMAND = 2 * INDUSTRY_COUNT * 4;
const NEIGHBOR_STRIDE = 16;
const CONN_MASK = 0xff;

const ext = (k: number): number => ZONES_MISC_EXT + k * 4;
const packConn = (c: { road: number; rail: number; highway: number }): number => (c.road & CONN_MASK) | ((c.rail & CONN_MASK) << 8) | ((c.highway & CONN_MASK) << 16);

export function exportZones(ctx: SimContext, doc: Sc2Document): void {
  const s = ctx.state, m = doc.misc, c = s.census;
  miscSet(m, MISC.rciDemand, s.demand.r); miscSet(m, MISC.rciDemand + 4, s.demand.c); miscSet(m, MISC.rciDemand + 8, s.demand.i);
  miscSet(m, MISC.nationalPop, s.national.population); miscSet(m, MISC.nationalValue, s.national.value);
  miscSet(m, MISC.nationalTax, s.national.tax); miscSet(m, MISC.nationalTrend, s.national.trend);
  for (let k = 0; k < 4; k++) {
    const nb = s.neighbors[k]; if (!nb) continue;
    const o = MISC.neighbors + k * NEIGHBOR_STRIDE;
    miscSet(m, o, nb.index); miscSet(m, o + 4, nb.population); miscSet(m, o + 8, nb.value); miscSet(m, o + 12, nb.fame);
  }
  for (let k = 0; k < INDUSTRY_COUNT; k++) {
    miscSet(m, MISC.industryGraph + IND_RATIO + k * 4, s.industry.ratio[k]!);
    miscSet(m, MISC.industryGraph + IND_DEMAND + k * 4, s.industry.demand[k]!);
  }
  miscSet(m, MISC.pollutionBonus, s.industry.pollutionBonus & 0xffff);
  miscSet(m, MISC.residentialPop, c.res); miscSet(m, MISC.normalPop, c.normalPop); miscSet(m, MISC.unemployed, c.unemployedN); miscSet(m, MISC.arcoPop, c.arcoPop);
  const vals = [ZONES_MISC_EXT_MAGIC, c.com, c.ind, c.citySize, c.taxableRes, c.taxableCom, c.taxableInd, c.workforce, c.jobs, c.unemploymentPct,
    c.tiles.res, c.tiles.com, c.tiles.ind, c.tiles.total, s.caps.r, s.caps.c, s.caps.i,
    ...s.neighbors.slice(0, 4).map((nb) => packConn(nb.connections))];
  for (let k = 0; k < ZONES_MISC_EXT_INTS; k++) miscSet(m, ext(k), vals[k] ?? 0);
}

/** 读 MISC（层已由 core 拷贝）；返回是否带本项目扩展块（决定 postLoad('sc2') 是否需要从真源层重算 census / 连接）。 */
export function importZones(ctx: SimContext, Z: ZonesCtx, doc: Sc2Document, diag: Diagnostic[]): boolean {
  const s = ctx.state, m = doc.misc, T = Z.T, c = s.census;
  const dem = (o: number): number => clampInt(miscGet(m, o) | 0, DEMAND_MIN, DEMAND_MAX);
  s.demand.r = dem(MISC.rciDemand); s.demand.c = dem(MISC.rciDemand + 4); s.demand.i = dem(MISC.rciDemand + 8);
  s.national.population = Math.max(0, miscGet(m, MISC.nationalPop) | 0); s.national.value = Math.max(0, miscGet(m, MISC.nationalValue) | 0);
  s.national.tax = miscGet(m, MISC.nationalTax) | 0; s.national.trend = clampInt(miscGet(m, MISC.nationalTrend) | 0, 0, 2) as 0 | 1 | 2;
  for (let k = 0; k < 4; k++) {
    const nb = s.neighbors[k]; if (!nb) continue;
    const o = MISC.neighbors + k * NEIGHBOR_STRIDE;
    nb.index = miscGet(m, o) | 0; nb.population = Math.max(0, miscGet(m, o + 4) | 0); nb.value = Math.max(0, miscGet(m, o + 8) | 0); nb.fame = miscGet(m, o + 12) | 0;
    nb.edge = k as 0 | 1 | 2 | 3;
    nb.name = T.neighborNames[nb.index] ?? '';
  }
  for (let k = 0; k < INDUSTRY_COUNT; k++) {
    s.industry.ratio[k] = clampInt(miscGet(m, MISC.industryGraph + IND_RATIO + k * 4) | 0, 0, 100);
    s.industry.demand[k] = clampInt(miscGet(m, MISC.industryGraph + IND_DEMAND + k * 4) | 0, DEMAND_MIN, DEMAND_MAX);
  }
  s.industry.pollutionBonus = clampInt((miscGet(m, MISC.pollutionBonus) << 16) >> 16, -1, 2);
  c.res = Math.max(0, miscGet(m, MISC.residentialPop) | 0); c.normalPop = Math.max(0, miscGet(m, MISC.normalPop) | 0);
  c.unemployedN = Math.max(0, miscGet(m, MISC.unemployed) | 0); c.arcoPop = Math.max(0, miscGet(m, MISC.arcoPop) | 0);
  const hasExt = miscGet(m, ext(0)) === ZONES_MISC_EXT_MAGIC;
  if (hasExt) {
    const v = (k: number): number => miscGet(m, ext(k)) | 0;
    c.com = v(1); c.ind = v(2); c.citySize = v(3); c.taxableRes = v(4); c.taxableCom = v(5); c.taxableInd = v(6);
    c.workforce = v(7); c.jobs = v(8); c.unemploymentPct = v(9);
    c.tiles.res = v(10); c.tiles.com = v(11); c.tiles.ind = v(12); c.tiles.total = v(13);
    s.caps.r = v(14); s.caps.c = v(15); s.caps.i = v(16);
    for (let k = 0; k < 4; k++) {
      const nb = s.neighbors[k]; if (!nb) continue;
      const p = v(17 + k);
      nb.connections.road = p & CONN_MASK; nb.connections.rail = (p >> 8) & CONN_MASK; nb.connections.highway = (p >> 16) & CONN_MASK;
    }
  } else {
    diag.push({ level: 'info', code: 'zones.noExt', message: `MISC 0x${ZONES_MISC_EXT.toString(16)} 无 zones 扩展块（原版 / compat 存档）：人口派生量与邻城连接将由图层重算` });
  }
  const repaired = repairCornerBits(ctx, Z);
  if (repaired > 0) diag.push({ level: 'info', code: 'zones.cornerRepair', message: `按 XBLD 连通块重建了 ${repaired} 栋多格分区建筑的 XZON 角标` });
  return hasExt;
}

/**
 * 角标修复（spec:file-formats §3.4.2 第 4 步、spec:zones §4.1）：对多格分区 / 过渡瓦片，若找不到带 TL 位且占地一致的锚点，
 * 按扫描序（x 主序，TL 必先被遇到）以第一个未分配、占地一致的格为锚点重写该栋的角标。直接写层（导入期，不经 TileWriter）。
 */
export function repairCornerBits(ctx: SimContext, Z: ZonesCtx): number {
  const L = ctx.state.layers, tbl = Z.tbl;
  const assigned = new Uint8Array(TILES);
  let repaired = 0;
  for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) {
    const i = tileIndex(x, y);
    if (assigned[i]) continue;
    const b = L.xbld[i]!;
    if (tbl.cls[b] === LotClass.None) continue;
    const n = tbl.size[b]!;
    if (n === 1) { if ((L.xzon[i]! & Corner.TL) === 0) { L.xzon[i] = (L.xzon[i]! & ZONE_MASK) | Corner.All; repaired++; } continue; }
    if (x + n > MAP || y + n > MAP || !lotIsUniform(L, x, y, n, b)) continue;
    let intact = (L.xzon[i]! & Corner.TL) !== 0;
    if (intact) for (let dx = 0; dx < n && intact; dx++) for (let dy = 0; dy < n; dy++) {
      const j = tileIndex(x + dx, y + dy);
      if ((L.xzon[j]! & 0xf0) !== cornerBits(n, dx, dy)) { intact = false; break; }
    }
    for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) {
      const j = tileIndex(x + dx, y + dy);
      assigned[j] = 1;
      if (!intact) L.xzon[j] = (L.xzon[j]! & ZONE_MASK) | cornerBits(n, dx, dy);
    }
    if (!intact) repaired++;
  }
  return repaired;
}

export const zonesExtRange = (): readonly [number, number] => [ZONES_MISC_EXT, EXT_END];
