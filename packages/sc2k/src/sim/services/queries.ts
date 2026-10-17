// ===== sim/services/queries.ts =====
// Queries.services 实现（CONTRACTS §I ServicesQuery）：设施座数、图表当前值、城市中心、半格图层读值、微模拟记录、查询窗口字段、
// 海港 / 机场计数、交通报告。全部纯读；绑定 ctx 之前（app 在新城之前渲染空地图）回退到一份私有空城作答。
import { TILES, ZONE_MASK, ZoneCode, halfOfTile } from '../../contracts/grid';
import type { MicrosimInfo, QueryStat, ServicesQuery } from '../../contracts/queries';
import { createCityState } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { microsimTypeOf, readRecord, slotAtTile } from './microsim';
import { MicrosimType, Xbld, gradeOf } from './tables';
import type { ServicesTuning } from './tuning';
import { idiv } from './runtime';
import type { ServicesRuntime } from './runtime';
import { readLabel } from './xlab';

export interface StructureCounts { police: number; prison: number; fire: number; hospital: number; school: number; college: number; busDepot: number }
/** 设施座数 = 建筑格计数 / 占地格数（counts.tile 由 core 增量维护、读档全量重数，天然与 XBLD 一致）。 */
export function structureCounts(state: CityState): StructureCounts {
  const t = state.counts.tile;
  return {
    police: idiv(t[Xbld.Police]!, 9), prison: idiv(t[Xbld.Prison]!, 16), fire: idiv(t[Xbld.Fire]!, 9), hospital: idiv(t[Xbld.Hospital]!, 9),
    school: idiv(t[Xbld.School]!, 9), college: idiv(t[Xbld.College]!, 16), busDepot: idiv(t[Xbld.BusDepot]!, 4) };
}
export const seaportCranes = (state: CityState): number => state.counts.tile[Xbld.Crane]!;
export const airportRunwayGroups = (state: CityState): number => idiv(state.counts.tile[Xbld.Runway]! + state.counts.tile[Xbld.RunwayCross]!, 5);
/** 机场分区格数（XZON 低 4 位 == 8），缓存到下一次 onTilesChanged('zone')。 */
export function airportTiles(state: CityState, rt: ServicesRuntime): number {
  if (rt.airportTilesCache >= 0) return rt.airportTilesCache;
  const xzon = state.layers.xzon;
  let n = 0;
  for (let i = 0; i < TILES; i++) if ((xzon[i]! & ZONE_MASK) === ZoneCode.Airport) n++;
  rt.airportTilesCache = n;
  return n;
}
/** 图表当前值（spec:services §2.10.3）：total / (developedTiles / 4 + 1)。 */
export function graphCurrent(state: CityState, t: ServicesTuning, which: 'pollution' | 'landValue' | 'crime'): number {
  const total = which === 'pollution' ? state.totals.pollution : which === 'landValue' ? state.totals.landValue : state.totals.crime;
  return idiv(total, (state.totals.developedTiles >> t.graphDivisorShift) + 1);
}

/** 查询窗口字段（键为 strings 表 query.*）。 */
export function queryStats(ctx: SimContext, i: number): QueryStat[] {
  const s = ctx.state, L = s.layers, M = s.maps;
  const out: QueryStat[] = [];
  const label = L.xtxt[i]!;
  if (label >= 0x01 && label <= 0xc8) { const name = readLabel(L.xlab, label); if (name) out.push({ key: 'query.name', value: name }); }
  const h = halfOfTile(i);
  out.push({ key: 'query.landValue', value: M.xval[h]! }, { key: 'query.crime', value: M.xcrm[h]! }, { key: 'query.pollution', value: M.xplt[h]! }, { key: 'query.traffic', value: M.xtrf[h]! });
  const r = slotAtTile(ctx, i);
  if (r < 0) return out;
  const rec = readRecord(L.xmic, r);
  const push = (key: string, value: string | number): void => { out.push({ key, value }); };
  switch (microsimTypeOf(ctx, L.xbld[i]!)) {
    case MicrosimType.Police: push('query.officers', rec.stat1); push('query.crimesReported', rec.stat2); push('query.arrests', rec.stat3); push('query.funding', rec.stat0); break;
    case MicrosimType.Fire: push('query.firefighters', rec.stat1); push('query.engines', rec.stat2); push('query.responseMinutes', rec.stat3); push('query.funding', rec.stat0); break;
    case MicrosimType.Hospital: push('query.rating', gradeOf(rec.stat0)); push('query.patients', rec.stat1); push('query.doctors', rec.stat2); push('query.beds', 1000); push('query.funding', rec.stat3); break;
    case MicrosimType.School: push('query.rating', gradeOf(rec.stat0)); push('query.students', rec.stat1); push('query.teachers', rec.stat2); push('query.capacity', 1500); push('query.funding', rec.stat3); break;
    case MicrosimType.College: push('query.rating', gradeOf(rec.stat0)); push('query.students', rec.stat1); push('query.teachers', rec.stat2); push('query.capacity', 5000); push('query.funding', rec.stat3); break;
    case MicrosimType.Prison: push('query.inmates', rec.stat1); push('query.guards', rec.stat2); push('query.escapes', rec.stat0); push('query.capacity', 10000); break;
    case MicrosimType.Stadium: push('query.attendance', rec.stat1); push('query.record', `${rec.stat0}-${40 - rec.stat0}`); push('query.team', rec.stat2); push('query.capacity', 25000); break;
    case MicrosimType.Zoo: push('query.visitors', rec.stat1); break;
    case MicrosimType.Statue: push('query.pigeons', rec.stat2); push('query.builtYear', rec.stat1); break;
    case MicrosimType.CityHall: push('query.employees', rec.stat1); push('query.builtYear', rec.stat2); break;
    case MicrosimType.MayorHouse: push('query.approval', rec.stat2); push('query.builtYear', rec.stat1); break;
    case MicrosimType.Museum: push('query.visitors', rec.stat1); push('query.employees', rec.stat2); break;
    case MicrosimType.Library: push('query.rating', gradeOf(rec.stat0)); push('query.visitors', rec.stat1); push('query.books', rec.stat2); break;
    case MicrosimType.Parks: push('query.visitors', rec.stat1); push('query.area', rec.stat2); break;
    case MicrosimType.Marina: push('query.boats', rec.stat1); break;
    case MicrosimType.Arcology: push('query.condition', gradeOf(rec.stat0)); push('query.population', rec.stat2); push('query.capacity', rec.stat1 * 1000); push('query.builtYear', rec.stat3); break;
    case MicrosimType.GreatDome: push('query.visitors', rec.stat1); break;
    case MicrosimType.BusDepot: case MicrosimType.RailDepot: case MicrosimType.SubwayStation: push('query.passengers', rec.stat1); break;
    case MicrosimType.WaterTreatment: case MicrosimType.Desalination: push('query.usagePct', rec.stat0); push('query.employees', rec.stat2); break;
    default: break;
  }
  return out;
}

const EMPTY_STATS: readonly QueryStat[] = Object.freeze([]) as readonly QueryStat[];

export function createServicesQueries(rt: ServicesRuntime, tuningOf: (ctx: SimContext) => ServicesTuning): ServicesQuery {
  let fallback: CityState | null = null;
  const stateOf = (): CityState => rt.ctx?.state ?? (fallback ??= createCityState());
  const half = (pick: (s: CityState) => Uint8Array) => (i: number): number => pick(stateOf())[halfOfTile(i)]!;
  return {
    structureCounts: () => structureCounts(stateOf()),
    graphCurrent: (which) => (rt.ctx ? graphCurrent(rt.ctx.state, tuningOf(rt.ctx), which) : 0),
    cityCenter: () => { const s = stateOf(); return { x: s.totals.centerX, y: s.totals.centerY }; },
    landValue: half((s) => s.maps.xval),
    pollution: half((s) => s.maps.xplt),
    crime: half((s) => s.maps.xcrm),
    microsimOf: (i): MicrosimInfo | null => {
      const ctx = rt.ctx;
      if (!ctx || !(i >= 0 && i < TILES)) return null;
      const r = slotAtTile(ctx, i);
      if (r < 0) return null;
      return { slot: r, ...readRecord(ctx.state.layers.xmic, r) };
    },
    queryStats: (i) => (rt.ctx && i >= 0 && i < TILES ? queryStats(rt.ctx, i) : EMPTY_STATS),
    seaportCranes: () => seaportCranes(stateOf()),
    airportRunwayGroups: () => airportRunwayGroups(stateOf()),
    airportTiles: () => airportTiles(stateOf(), rt),
    trafficReport: () => stateOf().traffic,
  };
}
