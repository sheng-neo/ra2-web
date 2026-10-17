// ===== sim/utilities/index.ts =====（CONTRACTS §V SimEntries.createUtilitiesSystem；WORKPLAN WP4）
// 电力与供水网络系统：阶段 powerScan / waterScan / utilitiesAnnual、查询 utilities、动作 requestRescan、
// 日末 flush（END_OF_DAY_IO.utilities）、onTilesChanged 置脏与 POWERABLE / PIPED 规则维护、.SC2 导入导出与两条读档路径的 postLoad。
import type { SimEntries } from '../../contracts/entrypoints';
import type { SimContext, System } from '../../contracts/system';
import { RULE_MASK, ruleBits } from './bits';
import { makePhases } from './phases';
import { PRIV_VERSION, freshPriv } from './priv';
import { makeUtilityQueries } from './queries';
import type { Runtime } from './runtime';
import { EMPTY_POWER_REPORT, EMPTY_WATER_REPORT, createRuntime, flushRescan, privOf, syncPlants } from './runtime';
import { exportToDoc, importFromDoc, postLoadRt } from './save';

export { DEFAULT_UTILITIES_TUNING } from './tuning';
export type { UtilitiesTuning } from './tuning';
export { POWER_PLANT_DEFS, WATER_FACILITY_DEFS } from './defs';
export type { PowerPlantKind, PowerPlantDef, WaterFacilityKind, WaterFacilityDef } from './defs';
export { PRIV_VERSION } from './priv';
export type { UtilitiesPriv } from './priv';

/** 按 §2.2 规则修正格 i 的 POWERABLE / PIPED（经 TileWriter，记入自写回声表）。 */
function applyRuleAt(ctx: SimContext, rt: Runtime, i: number): void {
  const L = ctx.state.layers;
  const want = ruleBits(L.xbld[i]!, L.xund[i]!);
  const cur = L.xbit[i]! & RULE_MASK;
  if (want === cur) return;
  const on = want & ~cur, off = cur & ~want;
  rt.selfBits[i] = 1;
  if (on !== 0) ctx.act.setXbit(i, on, true);
  if (off !== 0) ctx.act.setXbit(i, off, false);
}

export function createUtilitiesSystem(): System {
  const rt = createRuntime();
  const phases = makePhases(rt);
  return {
    id: 'utilities',
    privVersion: PRIV_VERSION,
    phases: { powerScan: phases.powerScan, waterScan: phases.waterScan, utilitiesAnnual: phases.utilitiesAnnual },
    queries: { utilities: makeUtilityQueries(rt) },
    actions: {
      /** 只置脏标志（进 priv）；日末 endOfDay 统一重扫。绑定前调用忽略。 */
      requestRescan(kind) {
        const ctx = rt.ctx;
        if (!ctx) return;
        const p = privOf(ctx);
        if (kind === 'power') p.dirtyPower = true; else p.dirtyWater = true;
      },
    },
    /** 新城：空报告（利用率 100%）、空电厂表、无脏标志。位规则对空图无事可做。 */
    init(ctx) {
      rt.ctx = ctx;
      rt.selfBits.fill(0); rt.powerNetworks = []; rt.waterNetworks = [];
      ctx.state.priv.utilities = freshPriv();
      Object.assign(ctx.state.utilities.power, EMPTY_POWER_REPORT);
      Object.assign(ctx.state.utilities.water, EMPTY_WATER_REPORT);
    },
    importFrom(ctx, doc, diag) { importFromDoc(ctx, doc, diag, rt); },
    exportTo(ctx, doc) { exportToDoc(ctx, doc, rt); },
    postLoad(ctx, source) { postLoadRt(ctx, source, rt); },
    /** 日末：脏则立即重扫电 / 水（消费 PRNG）并 layerChanged('xbit')；无脏标志时零 PRNG 消费。 */
    endOfDay(ctx) { flushRescan(ctx, rt); },
    /**
     * 扇出：建筑 / 地下变化 → 按规则修正 POWERABLE / PIPED 并置脏（建筑 → 电 + 水、同步电厂表；管线 → 水）；
     * 地形变化 → 电 + 水（海拔影响风电、水面影响水源）；他人改位 → 电 + 水；分区码变化与自写回声忽略。
     */
    onTilesChanged(ctx, tiles, kind) {
      rt.ctx = ctx;
      const p = privOf(ctx);
      switch (kind) {
        case 'building':
          for (const i of tiles) applyRuleAt(ctx, rt, i);
          p.dirtyPower = true; p.dirtyWater = true;
          syncPlants(ctx, p);
          break;
        case 'underground':
          for (const i of tiles) applyRuleAt(ctx, rt, i);
          p.dirtyWater = true;
          break;
        case 'terrain':
          p.dirtyPower = true; p.dirtyWater = true;
          break;
        case 'bit': {
          let external = false;
          for (const i of tiles) { if (rt.selfBits[i] !== 0) rt.selfBits[i] = 0; else external = true; }
          if (external) { p.dirtyPower = true; p.dirtyWater = true; }
          break;
        }
        default:
          break;
      }
    },
  };
}
createUtilitiesSystem satisfies SimEntries['createUtilitiesSystem'];
