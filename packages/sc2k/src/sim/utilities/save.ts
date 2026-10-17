// ===== sim/utilities/save.ts =====（spec:power-water §3.7 存档映射；ARCHITECTURE §4.3–§4.5）
//  importFrom（IMPORT_ORDER 第 7 位）：剥 XBIT.MARK 脏位；从 XBLD 锚点重建电厂表，年龄 / 负载按 XTXT 标签 → XMIC 记录（+1 / +4..5）恢复，无链接者归 0。
//  exportTo（EXPORT_ORDER 第 6 位）：导出 XBIT 不带 MARK；电厂年龄 / 负载写回已链接的 XMIC 记录。MISC 0x104C（净水厂充足标志 / "Go Disaster"，spec Q5 未定）按 open-questions #2 透传不写。
//  postLoad('sc2')：按 §2.2 规则重算整层 POWERABLE / PIPED，再跑一次不消费 PRNG 的电 / 水重扫（风 / 太阳能取分布中值）；
//  postLoad('snapshot')：位与 priv 已完整，只重绑闭包、校验 priv（版本不符 → 丢弃重建），不重扫、不消费 PRNG、不改层。
import { XBit } from '../../contracts/grid';
import type { Sc2Document } from '../../contracts/io';
import type { Diagnostic, PostLoadSource, SimContext } from '../../contracts/system';
import { applyRuleToLayer } from './bits';
import type { PlantRec } from './priv';
import { freshPriv, isUtilitiesPriv, scanPlantAnchors, writePlants } from './priv';
import type { Runtime } from './runtime';
import { privOf, scanPowerNow, scanWaterNow, syncPlants, tuningOf } from './runtime';

/** XMIC：150 条 × 8 B；记录 r 对应 XTXT 标签 0x33 + r（r = 1..9 共享、10..149 独立）。 */
export const XMIC_RECORD_BYTES = 8, XMIC_RECORDS = 150, XMIC_LABEL_BASE = 0x33;
/** XTXT 标签 → XMIC 记录号；不是微模拟标签返回 −1。 */
export function xmicRecordOf(label: number): number {
  const r = label - XMIC_LABEL_BASE;
  return r >= 1 && r < XMIC_RECORDS ? r : -1;
}
/** 电厂锚点 a 链接到的 XMIC 记录字节偏移（记录 tileId 必须等于该电厂的 XBLD），否则 −1。 */
export function linkedRecordOffset(xtxt: Uint8Array, xmic: Uint8Array, anchor: number, xbld: number): number {
  const r = xmicRecordOf(xtxt[anchor]!);
  if (r < 0) return -1;
  const off = r * XMIC_RECORD_BYTES;
  return xmic[off] === xbld ? off : -1;
}

function stripMark(xbit: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < xbit.length; i++) if ((xbit[i]! & XBit.Mark) !== 0) { xbit[i] = xbit[i]! & ~XBit.Mark; n++; }
  return n;
}

export function importFromDoc(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[], rt: Runtime): void {
  rt.ctx = ctx;
  const L = ctx.state.layers;
  const marks = stripMark(L.xbit);
  if (marks > 0) diag.push({ level: 'info', code: 'utilities.markStripped', message: `清除了 ${marks} 个 XBIT.MARK 扫描脏位` });
  const anchors = scanPlantAnchors(L);
  const max = tuningOf(ctx).maxTrackedPlants;
  const recs: PlantRec[] = [];
  let linked = 0;
  for (const a of anchors) {
    if (recs.length >= max) { diag.push({ level: 'warn', code: 'utilities.plantsTruncated', message: `到期型电厂超过 ${max} 座，其余不跟踪年龄` }); break; }
    const off = linkedRecordOffset(doc.xtxt, doc.xmic, a, L.xbld[a]!);
    if (off >= 0) { linked++; recs.push({ anchor: a, age: doc.xmic[off + 1]!, load: Math.min(255, ((doc.xmic[off + 4]! << 8) | doc.xmic[off + 5]!)) }); }
    else recs.push({ anchor: a, age: 0, load: 0 });
  }
  const p = freshPriv();
  writePlants(p, recs);
  ctx.state.priv.utilities = p;
  if (anchors.length > 0) diag.push({ level: 'info', code: 'utilities.plantsImported', message: `重建 ${recs.length} 座电厂记录（${linked} 座从 XMIC 恢复年龄）` });
}

/** 把电厂表的年龄 / 负载写进 xmic 已链接记录（+1 / +4..5）；返回是否改写了任何字节。 */
function writePlantRecords(L: { xtxt: Uint8Array; xbld: Uint8Array }, xmic: Uint8Array, p: { plantAnchors: Int32Array; plantAges: Uint8Array; plantLoads: Uint8Array }): boolean {
  let changed = false;
  const put = (o: number, v: number): void => { if (xmic[o] !== v) { xmic[o] = v; changed = true; } };
  for (let k = 0; k < p.plantAnchors.length; k++) {
    const a = p.plantAnchors[k]!;
    const off = linkedRecordOffset(L.xtxt, xmic, a, L.xbld[a]!);
    if (off < 0) continue;
    put(off + 1, p.plantAges[k]!);
    const load = p.plantLoads[k]!;
    put(off + 4, (load >> 8) & 0xff); put(off + 5, load & 0xff);
  }
  return changed;
}

/**
 * 年度更新后把电厂年龄 / 负载同步进活状态的 XMIC 记录（与 exportTo 写进 doc.xmic 的字节相同）。
 * 否则活状态 xmic 的这几个字节恒 0、导出文档里却是年龄 / 负载，`.SC2` 往返后 layers.xmic 不等 → hash('sc2') 不变量失败（INT-A 金城 3 年往返实测）。
 * 改写了字节时 layerChanged('xmic')；不消费 PRNG。
 */
export function syncPlantRecords(ctx: SimContext): void {
  const p = ctx.state.priv.utilities;
  if (!isUtilitiesPriv(p)) return;
  if (writePlantRecords(ctx.state.layers, ctx.state.layers.xmic, p)) ctx.act.layerChanged('xmic');
}

export function exportToDoc(ctx: SimContext, doc: Sc2Document, rt: Runtime): void {
  rt.ctx = ctx;
  stripMark(doc.xbit);
  const p = ctx.state.priv.utilities;
  if (!isUtilitiesPriv(p)) return;
  writePlantRecords(ctx.state.layers, doc.xmic, p);
}

export function postLoadRt(ctx: SimContext, source: PostLoadSource, rt: Runtime): void {
  rt.ctx = ctx;
  rt.selfBits.fill(0);
  rt.powerNetworks = []; rt.waterNetworks = [];
  const p = privOf(ctx);                       // 版本不符 → 丢弃并从 XBLD 重建
  syncPlants(ctx, p);                          // 快照路径下幂等（priv 已与层一致）
  if (source !== 'sc2') return;
  const L = ctx.state.layers;
  applyRuleToLayer(L.xbld, L.xund, L.xbit);
  stripMark(L.xbit);
  scanPowerNow(ctx, rt, false);
  scanWaterNow(ctx, rt);
  p.dirtyPower = false; p.dirtyWater = false;
  ctx.act.layerChanged('xbit');
}
