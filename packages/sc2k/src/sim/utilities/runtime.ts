// ===== sim/utilities/runtime.ts =====（系统闭包态 + 从 ctx 组装扫描输入 + 报告写回 + 电厂表同步）
// 闭包只放可重建的运行缓存（扫描临时区、网络汇总、自写位回声表）；持久态一律在 ctx.state.priv.utilities（priv.ts）。
import { TILES } from '../../contracts/grid';
import type { PowerReport, WaterReport } from '../../contracts/state';
import { OrdinanceId } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import { getTuning } from '../../contracts/system';
import { XBLD_TREATMENT } from './defs';
import type { PlantRec, UtilitiesPriv } from './priv';
import { freshPriv, isUtilitiesPriv, mergePlants, readPlants, scanPlantAnchors, writePlants } from './priv';
import type { PowerNetwork, PowerScanInput, PowerScanResult, ScanScratch, WaterNetwork, WaterScanInput, WaterScanResult } from './scan';
import { createScratch, runPowerScan, runWaterScan } from './scan';
import type { UtilitiesTuning } from './tuning';
import { DEFAULT_UTILITIES_TUNING } from './tuning';

export interface Runtime {
  ctx: SimContext | null;                 // init / postLoad / 任一回调时绑定
  scratch: ScanScratch;
  selfBits: Uint8Array;                   // onTilesChanged 里自己 setXbit 过的格：过滤 'bit' 扇出回声
  powerNetworks: PowerNetwork[];          // 最近一次电力扫描的网络汇总（查询 / 调试）
  waterNetworks: WaterNetwork[];
}
export const createRuntime = (): Runtime => ({ ctx: null, scratch: createScratch(), selfBits: new Uint8Array(TILES), powerNetworks: [], waterNetworks: [] });

/** 空城扫描的结果（spec §4 第 16 条：无电厂 / 水源时利用率定义为 100%；0 座净水厂且 watered == 0 视为充足）。 */
export const EMPTY_POWER_REPORT: Readonly<PowerReport> = Object.freeze({ generation: 0, consumers: 0, supplied: 0, usagePct: 100, unpoweredBuildingTiles: 0 });
export const EMPTY_WATER_REPORT: Readonly<WaterReport> = Object.freeze({
  supply: 0, consumers: 0, watered: 0, usagePct: 100, towerCapacity: 0, towerCharged: 0, treatmentCapacity: 0, treatmentSufficient: true, unwateredBuildingTiles: 0 });

export const tuningOf = (ctx: SimContext): UtilitiesTuning => getTuning(ctx, 'utilities', DEFAULT_UTILITIES_TUNING);

/** 同步电厂表与真源 XBLD（锚点增删；保留仍存在者的年龄 / 负载）。返回是否改写了 priv。 */
export function syncPlants(ctx: SimContext, p: UtilitiesPriv): boolean {
  const anchors = scanPlantAnchors(ctx.state.layers);
  const { recs, changed } = mergePlants(readPlants(p), anchors, tuningOf(ctx).maxTrackedPlants);
  if (changed) writePlants(p, recs);
  return changed;
}

/** priv 访问器：缺失 / 形状或版本不符 → 丢弃并换成新鲜 priv（电厂表从 XBLD 重建，年龄归 0），记 diag。 */
export function privOf(ctx: SimContext): UtilitiesPriv {
  const p = ctx.state.priv.utilities;
  if (isUtilitiesPriv(p)) return p;
  const fresh = freshPriv();
  ctx.state.priv.utilities = fresh;
  syncPlants(ctx, fresh);
  ctx.diag.push({ level: 'info', code: 'utilities.privRebuilt', message: `priv.utilities 缺失或版本不符（${String(p?.v)}），已从 XBLD 重建（电厂年龄归 0）` });
  return fresh;
}

export const plantsOf = (p: UtilitiesPriv): PlantRec[] => readPlants(p);

export function powerInput(ctx: SimContext, rt: Runtime, usePrng: boolean): PowerScanInput {
  const s = ctx.state;
  return {
    xbld: s.layers.xbld, xbit: s.layers.xbit, alt: s.layers.alt,
    wind: s.weather.wind, humid: s.weather.humid,
    energyConservation: ctx.q.economy.ordinance(OrdinanceId.EnergyConservation),
    rng: usePrng ? (n) => ctx.prng.int(n) : null,
    tune: tuningOf(ctx), scratch: rt.scratch,
  };
}
export function waterInput(ctx: SimContext, rt: Runtime): WaterScanInput {
  const s = ctx.state;
  return {
    xbld: s.layers.xbld, xbit: s.layers.xbit,
    treatmentCells: s.counts.tile[XBLD_TREATMENT]!,
    humid: s.weather.humid, waterLevel: s.terrain.seaLevel,
    tune: tuningOf(ctx), scratch: rt.scratch,
  };
}

/** 跑一次电力扫描并写回 state.utilities.power（对象引用不变）。usePrng=false 用于读档重扫。 */
export function scanPowerNow(ctx: SimContext, rt: Runtime, usePrng: boolean): PowerScanResult {
  const r = runPowerScan(powerInput(ctx, rt, usePrng));
  Object.assign(ctx.state.utilities.power, r.report);
  rt.powerNetworks = r.networks;
  return r;
}
/** 跑一次供水扫描并写回 state.utilities.water；不消费 PRNG。 */
export function scanWaterNow(ctx: SimContext, rt: Runtime): WaterScanResult {
  const r = runWaterScan(waterInput(ctx, rt));
  Object.assign(ctx.state.utilities.water, r.report);
  rt.waterNetworks = r.networks;
  return r;
}

/** 日末 flush（END_OF_DAY_IO.utilities）：脏则立即重扫；电网变化连带重扫水（水泵依赖 POWERED）；无脏标志时零 PRNG 消费、不写层。 */
export function flushRescan(ctx: SimContext, rt: Runtime): boolean {
  const p = privOf(ctx);
  if (!p.dirtyPower && !p.dirtyWater) return false;
  if (p.dirtyPower) { syncPlants(ctx, p); scanPowerNow(ctx, rt, true); p.dirtyPower = false; p.dirtyWater = true; }
  if (p.dirtyWater) { scanWaterNow(ctx, rt); p.dirtyWater = false; }
  ctx.act.layerChanged('xbit');
  return true;
}
