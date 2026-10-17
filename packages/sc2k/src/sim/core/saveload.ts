// ===== sim/core/saveload.ts =====
// 读档 / 存档编排（ARCHITECTURE §4.3–§4.5、CONTRACTS §R）：
//  - importCity(doc)：就地重置 → 按 IMPORT_ORDER 调 importFrom → counts 全量对账 → 按 POSTLOAD_ORDER 调 postLoad('sc2')；诊断只记录、不拒绝。
//  - exportCity(opts)：phaseCursor > 0 抛错 → counts 对账 → 按 EXPORT_ORDER 调 exportTo → compat 时清零 MISC 零区（不写 PRNG 标志 / 侧表）。
//  - loadSnapshotInto(bytes)：经注入的 SnapshotCodec 就地解码 → 挂起态归一（phaseCursor > 0 ⇒ modalPause = 1，否则 0；accumMs 清零）→ postLoad('snapshot')。
//  - saveSnapshotOf()：编码当前状态（挂起态允许，phaseCursor 一并编码）。
// 本文件不 import io/**：编解码器来自 CreateSimOptions.snapshot。
import type { CatalogueApi } from '../../contracts/catalogue';
import { EXPORT_ORDER, IMPORT_ORDER, POSTLOAD_ORDER } from '../../contracts/clock';
import type { Sc2Document, Sc2ExportOptions } from '../../contracts/io';
import { MISC_ZERO_RANGES } from '../../contracts/io';
import type { SnapshotCodec } from '../../contracts/snapshot';
import type { CityState } from '../../contracts/state';
import type { Diagnostic, PostLoadSource, SimContext, System, SystemId } from '../../contracts/system';
import { blankSc2Document, recountFromLayers, resetCityStateInPlace } from './stateOps';

/** createSim 内部句柄：saveload 需要的最小面。 */
export interface SaveLoadDeps {
  readonly state: CityState;
  readonly ctx: SimContext;
  readonly byId: ReadonlyMap<SystemId, System>;
  readonly codec: SnapshotCodec;
  readonly catalogue: CatalogueApi;
  /** 以"sim 内执行"包裹（设置 ctx.day、禁止重入、结束后扇出 tile 变更）。 */
  inside<T>(day: number, fn: () => T): T;
  /** 丢弃运行期缓冲：TileWriter 本批、dirty、events、commandLog、tick 余量。 */
  resetRuntime(): void;
  /** 读档后整图重绘。 */
  markAllDirty(): void;
}

/** counts.tile / counts.zone 与 xbld 全量对账；不一致 → 重算并记 warn（ARCHITECTURE §3.5"导出前再做一次全量对账断言"）。返回是否原本一致。 */
export function reconcileCounts(state: CityState, catalogue: CatalogueApi, diag: Diagnostic[], at: string): boolean {
  const tile = Int32Array.from(state.counts.tile), zone = Int32Array.from(state.counts.zone);
  recountFromLayers(state, catalogue);
  let same = true;
  for (let k = 0; k < tile.length && same; k++) if (tile[k] !== state.counts.tile[k]) same = false;
  for (let k = 0; k < zone.length && same; k++) if (zone[k] !== state.counts.zone[k]) same = false;
  if (!same) diag.push({ level: 'warn', code: 'core.countsMismatch', message: `counts 与 xbld 全量重数不一致，已重算（${at}）`, at });
  return same;
}

/** 按 POSTLOAD_ORDER 调用各系统 postLoad（缺席 / 未实现跳过）。 */
export function postLoadAll(deps: SaveLoadDeps, source: PostLoadSource): void {
  for (const id of POSTLOAD_ORDER) {
    const s = deps.byId.get(id);
    if (s && typeof s.postLoad === 'function') deps.inside(-1, () => s.postLoad!(deps.ctx, source));
  }
  deps.markAllDirty();
}

/** .SC2 → CityState（spec:file-formats §3.4.2 第 2–9b 步由各系统 importFrom 按 IMPORT_ORDER 完成）。 */
export function importCity(deps: SaveLoadDeps, doc: Sc2Document): Diagnostic[] {
  const diag: Diagnostic[] = [];
  resetCityStateInPlace(deps.state);
  deps.resetRuntime();
  for (const id of IMPORT_ORDER) {
    const s = deps.byId.get(id);
    if (s && typeof s.importFrom === 'function') deps.inside(-1, () => s.importFrom!(deps.ctx, doc, diag));
  }
  // 导入后 counts 必须与 xbld 一致（各系统 importFrom 可能直接写层，例如角标重建 / 瓦砾清理）
  reconcileCounts(deps.state, deps.catalogue, diag, 'importCity');
  const c = deps.state.clock;
  c.phaseCursor = 0; c.modalPause = 0; c.accumMs = 0;   // .SC2 永远是两天之间的完整状态
  postLoadAll(deps, 'sc2');
  return diag;
}

/** 零区清零（compat 导出）：不写 PRNG 标志 / 状态 / 版本 / 侧表。 */
export function applyCompat(doc: Sc2Document): void {
  for (const [lo, hi] of MISC_ZERO_RANGES) doc.misc.fill(0, lo >> 2, hi >> 2);
}

/** CityState → .SC2 文档（各系统 exportTo 按 EXPORT_ORDER；events 最后合成 XTXT / 写 XTHG）。 */
export function exportCity(deps: SaveLoadDeps, opts?: Sc2ExportOptions): Sc2Document {
  const c = deps.state.clock;
  if (c.phaseCursor > 0) throw new Error('exportSc2: 阶段挂起中（phaseCursor > 0）不允许导出 .SC2');
  reconcileCounts(deps.state, deps.catalogue, deps.ctx.diag, 'exportCity');
  const doc = blankSc2Document();
  for (const id of EXPORT_ORDER) {
    const s = deps.byId.get(id);
    if (s && typeof s.exportTo === 'function') deps.inside(-1, () => s.exportTo!(deps.ctx, doc));
  }
  if (opts?.compat) applyCompat(doc);
  return doc;
}

/** 快照 → CityState（就地解码）；挂起态归一后 postLoad('snapshot')（不得重扫、不得消费 PRNG）。 */
export function loadSnapshotInto(deps: SaveLoadDeps, bytes: Uint8Array): Diagnostic[] {
  deps.resetRuntime();
  const diag = deps.codec.decode(bytes, deps.state);
  const c = deps.state.clock;
  c.accumMs = 0;
  if (c.phaseCursor > 0) {
    // 挂起态存档：载入后处于同一挂起态，等待 UI 调 modalClosed()（恰好一层；原模态的 payload 不在快照里，UI 需按 phaseCursor 自行决定是否重开）
    if (c.modalPause !== 1) { c.modalPause = 1; }
    diag.push({ level: 'info', code: 'snapshot.suspended', message: `快照处于挂起态（age ${c.age}，phaseCursor ${c.phaseCursor}）：调用 host.modalClosed() 续跑当天剩余阶段` });
  } else c.modalPause = 0;
  // counts 以快照为准，但仍对账一次（旧快照 / 手改快照）
  reconcileCounts(deps.state, deps.catalogue, diag, 'loadSnapshot');
  postLoadAll(deps, 'snapshot');
  return diag;
}

export function saveSnapshotOf(deps: SaveLoadDeps): Uint8Array {
  return deps.codec.encode(deps.state);
}
