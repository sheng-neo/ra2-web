// ===== sim/utilities/phases.ts =====（spec:power-water §3.4：月度结算与年度结算）
// powerScan（第 1 天）/ waterScan（第 20 天）：扫描 → 写报告 → layerChanged('xbit') → 事件；
// utilitiesAnnual（1 月第 0 天）：电厂年龄 +1、负载显示值、老化提醒、到期爆炸或（禁用灾害且资金足够时）自动重建。
import { tileX, tileY } from '../../contracts/grid';
import type { PowerReport, WaterReport } from '../../contracts/state';
import type { PhaseRunner, SimContext } from '../../contracts/system';
import type { PlantRec } from './priv';
import { readPlants, writePlants } from './priv';
import type { Runtime } from './runtime';
import { privOf, scanPowerNow, scanWaterNow, syncPlants, tuningOf } from './runtime';
import { syncPlantRecords } from './save';
import type { UtilitiesTuning } from './tuning';

/** 电力事件：supplied < consumers → brownout；利用率 ≥ 阈值（无发电时改看 consumers > 0）→ needPower。报纸 / 顾问侧自行节流。 */
export function emitPowerEvents(ctx: SimContext, r: PowerReport, tune: UtilitiesTuning): void {
  if (r.supplied < r.consumers) ctx.act.emit({ type: 'brownout', unpowered: r.unpoweredBuildingTiles });
  if (r.generation > 0 ? r.usagePct >= tune.needThresholdPct : r.consumers > 0) ctx.act.emit({ type: 'needPower' });
}
export function emitWaterEvents(ctx: SimContext, r: WaterReport, tune: UtilitiesTuning): void {
  if (r.watered < r.consumers) ctx.act.emit({ type: 'waterShortage', unwatered: r.unwateredBuildingTiles });
  if (r.supply > 0 ? r.usagePct >= tune.needThresholdPct : r.consumers > 0) ctx.act.emit({ type: 'needWater' });
}

/**
 * 年度更新（spec §2.6）：对 priv 中每座到期型电厂按锚点升序：负载 = usagePct + int(0..7)、年龄 +1；
 * 年龄 > 48 → plantAging；年龄 > 50 → 禁用灾害且付得起造价 → 扣费重建（年龄 0），否则 destroyStructure(PLANT_EOL) 并移出表。
 * 建城当天（age 0）不算完整年，直接返回；无电厂时零 PRNG 消费。
 */
export function annualUpdate(ctx: SimContext, rt: Runtime): void {
  const s = ctx.state;
  if (s.clock.age === 0) return;
  const p = privOf(ctx);
  syncPlants(ctx, p);
  const recs = readPlants(p);
  if (recs.length === 0) return;
  const tune = tuningOf(ctx);
  const usage = s.utilities.power.usagePct;
  const keep: PlantRec[] = [];
  let expired = false;
  for (const r of recs) {
    r.load = Math.min(255, usage + ctx.prng.int(tune.loadJitter));
    r.age = Math.min(255, r.age + 1);
    if (r.age > tune.plantAgingWarnAfter) ctx.act.emit({ type: 'plantAging', anchor: r.anchor });
    if (r.age > tune.plantLifeYears) {
      const cost = ctx.catalogue.BUILDINGS[s.layers.xbld[r.anchor]!]?.cost ?? 0;
      if (s.disaster.noDisasters && ctx.q.economy.canAfford(cost) && ctx.act.charge(cost)) {
        r.age = 0;
        ctx.act.emit({ type: 'plantAutoRebuilt', anchor: r.anchor, cost });
      } else {
        const x = tileX(r.anchor), y = tileY(r.anchor);
        ctx.act.destroyStructure(x, y, 'PLANT_EOL');
        ctx.act.emit({ type: 'plantExpired', anchor: r.anchor });
        if (s.disaster.autoGoto) ctx.act.emit({ type: 'goto', x, y, smooth: true });
        expired = true;
        continue;
      }
    }
    keep.push(r);
  }
  writePlants(p, keep);
  syncPlantRecords(ctx);                       // 年龄 / 负载同步进活状态 XMIC（与 exportTo 写进文档的字节一致，保 .SC2 往返 hash('sc2')）
  if (expired) { p.dirtyPower = true; p.dirtyWater = true; }
  void rt;
}

export interface UtilityPhases { powerScan: PhaseRunner; waterScan: PhaseRunner; utilitiesAnnual: PhaseRunner }
export function makePhases(rt: Runtime): UtilityPhases {
  return {
    powerScan(ctx) {
      const p = privOf(ctx);
      syncPlants(ctx, p);
      const r = scanPowerNow(ctx, rt, true);
      p.dirtyPower = false;
      ctx.act.layerChanged('xbit');
      emitPowerEvents(ctx, r.report, tuningOf(ctx));
      return 'done';
    },
    waterScan(ctx) {
      const p = privOf(ctx);
      const r = scanWaterNow(ctx, rt);
      p.dirtyWater = false;
      ctx.act.layerChanged('xbit');
      emitWaterEvents(ctx, r.report, tuningOf(ctx));
      return 'done';
    },
    utilitiesAnnual(ctx) { annualUpdate(ctx, rt); return 'done'; },
  };
}
