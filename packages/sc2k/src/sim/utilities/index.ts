// ===== sim/utilities/index.ts =====（CONTRACTS §V SimEntries.createUtilitiesSystem；WORKPLAN WP4）
// 电力与供水网络系统：阶段 powerScan / waterScan / utilitiesAnnual、查询 utilities、动作 requestRescan、
// 日末 flush（END_OF_DAY_IO.utilities）、onTilesChanged 置脏与 POWERABLE / PIPED 规则维护、.SC2 导入导出与两条读档路径的 postLoad。
import type { SimEntries } from '../../contracts/entrypoints';
import { XBit } from '../../contracts/grid';
import type { SimContext, System } from '../../contracts/system';
import { RULE_MASK, ruleBits } from './bits';
import { CLS_CONSUMER, CLS_EXPIRES, CLS_PLANT, CLS_WATER, UTIL_CLASS } from './defs';
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

/** 按 §2.2 规则修正格 i 的 POWERABLE / PIPED（经 TileWriter，记入自写回声表）；返回改动了的规则位（0 = 未变）。 */
function applyRuleAt(ctx: SimContext, rt: Runtime, i: number): number {
  const L = ctx.state.layers;
  const want = ruleBits(L.xbld[i]!, L.xund[i]!);
  const cur = L.xbit[i]! & RULE_MASK;
  if (want === cur) return 0;
  const on = want & ~cur, off = cur & ~want;
  rt.selfBits[i] = 1;
  if (on !== 0) ctx.act.setXbit(i, on, true);
  if (off !== 0) ctx.act.setXbit(i, off, false);
  return on | off;
}

/**
 * 'building' 扇出：只有会改变扫描结果的变化才置脏（spec §3.4"玩家改动 → 重扫"；分区施工 → 完工这类建筑换建筑不改网络）：
 *  电：POWERABLE 规则位变化、消费者口径（≥ 0x70）变化、涉及发电格；水：PIPED 规则位变化、消费者口径变化、涉及水设施（电重扫本身也会连带水）。
 * 电厂表只在涉及到期型电厂格时整图同步（原先每次建筑扇出都扫 16384 格）。old 值来自影子层。
 */
function onBuildingTiles(ctx: SimContext, rt: Runtime, tiles: ReadonlyArray<number>): void {
  const xbld = ctx.state.layers.xbld, shadow = rt.shadow;
  let power = false, water = false, plants = false;
  for (const i of tiles) {
    const d = applyRuleAt(ctx, rt, i);
    if ((d & XBit.Powerable) !== 0) power = true;
    if ((d & XBit.Piped) !== 0) water = true;
    const old = shadow[i]!, nw = xbld[i]!;
    if (old === nw) continue;
    shadow[i] = nw;
    const co = UTIL_CLASS[old]!, cn = UTIL_CLASS[nw]!, any = co | cn;
    if (((co ^ cn) & CLS_CONSUMER) !== 0) { power = true; water = true; }
    if ((any & CLS_PLANT) !== 0) power = true;
    if ((any & CLS_WATER) !== 0) water = true;
    if ((any & CLS_EXPIRES) !== 0) plants = true;
  }
  const p = privOf(ctx);
  if (power) { p.dirtyPower = true; p.dirtyWater = true; }     // 电变连带水（水泵依赖 POWERED；第 1 天月度 powerScan 会先清掉 dirtyPower）
  if (water) p.dirtyWater = true;
  if (plants) syncPlants(ctx, p);
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
      rt.selfBits.fill(0); rt.shadow.set(ctx.state.layers.xbld); rt.powerNetworks = []; rt.waterNetworks = [];
      ctx.state.priv.utilities = freshPriv();
      Object.assign(ctx.state.utilities.power, EMPTY_POWER_REPORT);
      Object.assign(ctx.state.utilities.water, EMPTY_WATER_REPORT);
    },
    importFrom(ctx, doc, diag) { importFromDoc(ctx, doc, diag, rt); },
    exportTo(ctx, doc) { exportToDoc(ctx, doc, rt); },
    postLoad(ctx, source) { postLoadRt(ctx, source, rt); },
    /** 日末：脏则立即重扫电 / 水（复用本月风 / 太阳能种子，不消费 PRNG）并 layerChanged('xbit')。 */
    endOfDay(ctx) { flushRescan(ctx, rt); },
    /**
     * 扇出：建筑变化 → 按规则修正 POWERABLE / PIPED，只在会改变扫描结果时置脏（见 onBuildingTiles）；
     * 地下变化 → 修正 PIPED，变了才置水脏；地形变化 → 电 + 水（海拔影响风电、水面影响水源）；他人改位 → 电 + 水；分区码变化与自写回声忽略。
     */
    onTilesChanged(ctx, tiles, kind) {
      rt.ctx = ctx;
      const p = privOf(ctx);
      switch (kind) {
        case 'building':
          onBuildingTiles(ctx, rt, tiles);
          break;
        case 'underground': {
          let piped = false;
          for (const i of tiles) if ((applyRuleAt(ctx, rt, i) & XBit.Piped) !== 0) piped = true;
          if (piped) p.dirtyWater = true;
          break;
        }
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
