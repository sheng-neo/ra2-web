// ===== testkit/invariants.ts =====（ARCHITECTURE §10.4 无头长跑不变量；longrun.test 与 tools/headless.ts 共用）
// checkInvariants(state, catalogue) 返回违规描述列表（空 = 全部通过）：
//  不抛错 / 无 NaN（全部标量为有限整数）；counts.tile / counts.zone 与 xbld 全量重数一致；XBIT & 0x08（Mark）== 0；
//  XZON 角标与 XBLD 占地一致（anchorOf 对全部多格建筑格非 −1）；XTXT 无悬空指针（0x3D..0xC8 → XMIC 记录 tileId != 0；0xC9..0xEF → XTHG 槽存在）；
//  Σ XVAL == totals.landValue、Σ XCRM == totals.crime（MISC 0x0028 / 0x002C 的口径）；电 / 水利用率 ∈ [0,100]；funds > −10^6；债券 ≤ 50；时钟字段合法。
// 人口类断言（第 20 年 normalPop 区间、单月跳变、空城人口恒 0）另给 checkPopulation，由调用方决定是否启用（桩下无意义）。
import type { CatalogueApi } from '../contracts/catalogue';
import { FOOTPRINT, anchorOf } from '../contracts/footprint';
import { TILES, XBit } from '../contracts/grid';
import { BOND_SLOTS, SCALAR_FIELDS, parsePath } from '../contracts/snapshot';
import { createCityState } from '../contracts/state';
import type { CityState } from '../contracts/state';
import { recountFromLayers } from '../sim/core';

/** XTXT 指针区间（spec:disasters §2.5.1 / spec:services 微模拟；ARCHITECTURE §10.4）。 */
export const XTXT_MICROSIM_FIRST = 0x3d, XTXT_MICROSIM_LAST = 0xc8, XTXT_THING_FIRST = 0xc9, XTXT_THING_LAST = 0xef;
export const XMIC_RECORD_BYTES = 8, XTHG_RECORD_BYTES = 12;
export const MIN_FUNDS = -1_000_000;

function resolve(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of parsePath(path)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

export function checkInvariants(state: CityState, catalogue: CatalogueApi): string[] {
  const out: string[] = [];
  const L = state.layers, M = state.maps;
  // 1. 标量有限且为整数（bool 字段跳过；债券槽越界读 undefined 属正常）
  for (const f of SCALAR_FIELDS) {
    if (f.bool || f.path === 'economy.bondCount') continue;
    const v = resolve(state, f.path);
    if (v === undefined && f.path.startsWith('economy.bonds[')) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) out.push(`标量 ${f.path} 非有限整数：${String(v)}`);
  }
  // 2. counts 与 xbld 全量重数一致
  const scratch = createCityState();
  scratch.layers.xbld.set(L.xbld);
  recountFromLayers(scratch, catalogue);
  for (let k = 0; k < 256; k++) if (scratch.counts.tile[k] !== state.counts.tile[k]) { out.push(`counts.tile[0x${k.toString(16)}] = ${state.counts.tile[k]} ≠ 重数 ${scratch.counts.tile[k]}`); break; }
  for (let k = 0; k < 8; k++) if (scratch.counts.zone[k] !== state.counts.zone[k]) { out.push(`counts.zone[${k}] = ${state.counts.zone[k]} ≠ 重数 ${scratch.counts.zone[k]}`); break; }
  // 3. XBIT.Mark 必须为 0；4. 多格建筑角标一致；5. XTXT 指针
  let markBad = -1, anchorBad = -1, xtxtBad = -1;
  for (let i = 0; i < TILES; i++) {
    if (markBad < 0 && (L.xbit[i]! & XBit.Mark) !== 0) markBad = i;
    const id = L.xbld[i]!;
    if (anchorBad < 0 && id >= 0x0e && FOOTPRINT[id]! > 1 && anchorOf(L, i) < 0) anchorBad = i;
    const t = L.xtxt[i]!;
    if (xtxtBad < 0) {
      if (t >= XTXT_MICROSIM_FIRST && t <= XTXT_MICROSIM_LAST) { if (L.xmic[(t - XTXT_MICROSIM_FIRST) * XMIC_RECORD_BYTES] === 0) xtxtBad = i; }
      else if (t >= XTXT_THING_FIRST && t <= XTXT_THING_LAST) { if (L.xthg[(t - XTXT_THING_FIRST) * XTHG_RECORD_BYTES] === 0) xtxtBad = i; }
    }
  }
  if (markBad >= 0) out.push(`XBIT.Mark 残留于格 ${markBad}`);
  if (anchorBad >= 0) out.push(`多格建筑 0x${L.xbld[anchorBad]!.toString(16)} 在格 ${anchorBad} 找不到一致的 TL 锚点`);
  if (xtxtBad >= 0) out.push(`XTXT 悬空指针 0x${L.xtxt[xtxtBad]!.toString(16)} 于格 ${xtxtBad}`);
  // 6. 低分辨率图总和与 totals 一致
  let sumVal = 0, sumCrm = 0;
  for (let k = 0; k < M.xval.length; k++) { sumVal += M.xval[k]!; sumCrm += M.xcrm[k]!; }
  if (sumVal !== state.totals.landValue) out.push(`Σ XVAL = ${sumVal} ≠ totals.landValue ${state.totals.landValue}`);
  if (sumCrm !== state.totals.crime) out.push(`Σ XCRM = ${sumCrm} ≠ totals.crime ${state.totals.crime}`);
  // 7. 利用率 / 资金 / 债券 / 时钟
  const { power, water } = state.utilities;
  if (power.usagePct < 0 || power.usagePct > 100) out.push(`power.usagePct ${power.usagePct} ∉ [0,100]`);
  if (water.usagePct < 0 || water.usagePct > 100) out.push(`water.usagePct ${water.usagePct} ∉ [0,100]`);
  if (!(state.economy.funds > MIN_FUNDS)) out.push(`funds ${state.economy.funds} ≤ ${MIN_FUNDS}`);
  if (state.economy.bonds.length > BOND_SLOTS) out.push(`债券 ${state.economy.bonds.length} 条 > ${BOND_SLOTS}`);
  const c = state.clock;
  if (c.age < 0 || c.phaseCursor < 0 || c.phaseCursor > 11 || c.modalPause < 0) out.push(`时钟字段非法：age ${c.age} phaseCursor ${c.phaseCursor} modalPause ${c.modalPause}`);
  return out;
}

export interface PopulationSample { year: number; month: number; normalPop: number }
/** 人口类不变量：第 20 年（相对建城）normalPop ∈ [3000, 60000]；相邻月无 > 50% 跳变（基数 ≥ 1000 时）；emptyCity 时人口恒 0。 */
export function checkPopulation(samples: readonly PopulationSample[], opts: { emptyCity?: boolean; year20Range?: readonly [number, number] } = {}): string[] {
  const out: string[] = [];
  const [lo, hi] = opts.year20Range ?? [3000, 60000];
  for (let k = 0; k < samples.length; k++) {
    const s = samples[k]!;
    if (opts.emptyCity && s.normalPop !== 0) { out.push(`空城第 ${s.year} 年第 ${s.month} 月人口 ${s.normalPop} ≠ 0`); break; }
    if (k > 0) {
      const p = samples[k - 1]!;
      if (p.normalPop >= 1000 && Math.abs(s.normalPop - p.normalPop) * 2 > p.normalPop) out.push(`人口单月跳变 > 50%：${p.normalPop} → ${s.normalPop}（${s.year}/${s.month}）`);
    }
  }
  if (!opts.emptyCity) {
    const y20 = samples.find((s) => s.year === 20 && s.month === 0);
    if (y20 && (y20.normalPop < lo || y20.normalPop > hi)) out.push(`第 20 年人口 ${y20.normalPop} ∉ [${lo}, ${hi}]`);
  }
  return out;
}
