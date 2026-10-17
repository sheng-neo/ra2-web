// ===== sim/services/microsim.ts =====
// 微模拟记录（XMIC 150 × 8 B）：读写访问器、槽位分配 / 释放（Actions.allocMicrosim / freeMicrosim）、放置初值表
// （spec:services §2.6.1）、XTXT 标签绑定与失效清理（§3.4 拆除协议的安全网）。
// 协议：allocMicrosim(tileId) 只分配记录并写初值；占地格的 XTXT 标签（0x33 + slot）由放置者写，或由本模块在 onTilesChanged('building')
// 里对尚未标注的新建筑补写；拆除时放置者 / events 调用 freeMicrosim(slot)，若遗漏，本模块在 onTilesChanged 里发现"标签指向的记录与格上建筑不符"
// 且无其它格引用该记录时自动释放。返回值：独占 / 共享记录号 ≥ 1；该建筑不需要记录 → 0；独占记录用尽 → −1。
import { Corner, TILES, tileIndex, tileX, tileY } from '../../contracts/grid';
import { FOOTPRINT, anchorOf, forEachLotTile } from '../../contracts/footprint';
import { BudgetLine, dateOf } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';
import {
  MICROSIM_FIRST_EXCLUSIVE, MICROSIM_LABEL_BASE, MICROSIM_LABEL_LAST, MICROSIM_RECORDS, MICROSIM_RECORD_BYTES,
  MicrosimType, SHARED_LABEL_FIRST, SHARED_SLOT_BY_TYPE, Xbld, isArcology,
} from './tables';
import type { ServicesTuning } from './tuning';
import { idiv } from './runtime';
import type { ServicesRuntime } from './runtime';
import { writeLabel } from './xlab';

export interface MicrosimRecord { tileId: number; stat0: number; stat1: number; stat2: number; stat3: number }

// ---- 字节访问 ----
export const recTileId = (xmic: Uint8Array, r: number): number => xmic[r * MICROSIM_RECORD_BYTES]!;
export const recStat0 = (xmic: Uint8Array, r: number): number => xmic[r * MICROSIM_RECORD_BYTES + 1]!;
const u16 = (xmic: Uint8Array, o: number): number => (xmic[o]! << 8) | xmic[o + 1]!;
export const recStat = (xmic: Uint8Array, r: number, k: 1 | 2 | 3): number => u16(xmic, r * MICROSIM_RECORD_BYTES + k * 2);
export function readRecord(xmic: Uint8Array, r: number): MicrosimRecord {
  const o = r * MICROSIM_RECORD_BYTES;
  return { tileId: xmic[o]!, stat0: xmic[o + 1]!, stat1: u16(xmic, o + 2), stat2: u16(xmic, o + 4), stat3: u16(xmic, o + 6) };
}
export function setTileId(xmic: Uint8Array, r: number, v: number): void { xmic[r * MICROSIM_RECORD_BYTES] = v & 0xff; }
export function setStat0(xmic: Uint8Array, r: number, v: number): void { xmic[r * MICROSIM_RECORD_BYTES + 1] = Math.max(0, Math.min(255, v | 0)); }
export function setStat(xmic: Uint8Array, r: number, k: 1 | 2 | 3, v: number): void {
  const o = r * MICROSIM_RECORD_BYTES + k * 2;
  const c = Math.max(0, Math.min(0xffff, v | 0));
  xmic[o] = c >> 8; xmic[o + 1] = c & 0xff;
}
export function clearRecord(xmic: Uint8Array, r: number): void { xmic.fill(0, r * MICROSIM_RECORD_BYTES, (r + 1) * MICROSIM_RECORD_BYTES); }

/** 记录号是否为独占记录（10..149）。 */
export const isExclusiveSlot = (r: number): boolean => r >= MICROSIM_FIRST_EXCLUSIVE && r < MICROSIM_RECORDS;
export const isSharedSlot = (r: number): boolean => r >= 1 && r < MICROSIM_FIRST_EXCLUSIVE;
/** XTXT 标签 → 记录号（0x34..0xC8 → 1..149；其它 → −1）。 */
export const slotOfLabel = (label: number): number => (label >= SHARED_LABEL_FIRST && label <= MICROSIM_LABEL_LAST ? label - MICROSIM_LABEL_BASE : -1);
export const labelOfSlot = (r: number): number => MICROSIM_LABEL_BASE + r;

/** 微模拟类型号（catalogue）；无记录 → 0。 */
export function microsimTypeOf(ctx: SimContext, tileId: number): number {
  return ctx.catalogue.BUILDINGS[tileId]?.microsim?.type ?? 0;
}
/** 该建筑应落的记录：{ shared: 共享号 } / { exclusive } / null（无记录）。 */
export function recordKindOf(ctx: SimContext, tileId: number): { shared: number } | { exclusive: true } | null {
  const ms = ctx.catalogue.BUILDINGS[tileId]?.microsim;
  if (!ms) return null;
  if (ms.shared) { const s = SHARED_SLOT_BY_TYPE[ms.type]; return s ? { shared: s } : null; }
  return { exclusive: true };
}

/** 巨型住区座数（popCap 的 adj 用）。 */
export function arcoCount(ctx: SimContext): number {
  const tile = ctx.state.counts.tile;
  let n = 0;
  for (let id = Xbld.ArcoFirst; id <= Xbld.ArcoLast; id++) n += tile[id]!;
  return idiv(n, 16);
}
/** popCap(max, divisor) = min(int16(max), (arcoPop + normalPop + adj) / divisor)（spec:services §2.6.1）。 */
export function popCap(ctx: SimContext, t: ServicesTuning, max: number, divisor: number): number {
  const cap = t.legacyInt16Wrap ? ((max | 0) << 16) >> 16 : max | 0;
  const arcos = arcoCount(ctx);
  const adj = arcos >= t.arcoCountAdjThreshold ? arcos * t.arcoCountAdjMul - t.arcoCountAdjSub : 0;
  const pop = ctx.state.census.arcoPop + ctx.state.census.normalPop + adj;
  return Math.min(cap, idiv(pop, Math.max(1, divisor)));
}

/** 放置初值（§2.6.1 表；未列字段为 0）。共享记录只改累加 / 首次字段。 */
function initRecord(ctx: SimContext, t: ServicesTuning, r: number, tileId: number): void {
  const xmic = ctx.state.layers.xmic;
  const type = microsimTypeOf(ctx, tileId);
  const year = dateOf(ctx.state.clock).year;
  const fund = (line: BudgetLine): number => ctx.q.economy.funding(line);
  switch (type) {
    case MicrosimType.Hospital: case MicrosimType.School: case MicrosimType.College: setStat0(xmic, r, 6); break;
    case MicrosimType.Police: setStat(xmic, r, 1, popCap(ctx, t, 2 * fund(BudgetLine.Police), 90)); break;
    case MicrosimType.Fire: setStat(xmic, r, 1, popCap(ctx, t, idiv(fund(BudgetLine.Fire), 2), 70)); setStat(xmic, r, 2, 4); break;
    case MicrosimType.CityHall: setStat(xmic, r, 1, popCap(ctx, t, 200, 900)); setStat(xmic, r, 2, year); break;
    case MicrosimType.Museum: if (recStat0(xmic, r) === 0) setStat0(xmic, r, 100); break;
    case MicrosimType.Parks: setStat(xmic, r, 2, recStat(xmic, r, 2) + 9); break;
    case MicrosimType.Statue: setStat(xmic, r, 1, year); break;
    case MicrosimType.MayorHouse: setStat(xmic, r, 1, year); setStat(xmic, r, 2, ctx.prng.int(30) + 10); setStat(xmic, r, 3, ctx.prng.int(60)); break;
    case MicrosimType.Arcology: {
      const def = ctx.catalogue.BUILDINGS[tileId]!;
      setStat0(xmic, r, 5); setStat(xmic, r, 1, idiv(def.residents, 1000)); setStat(xmic, r, 3, year);
      break;
    }
    case MicrosimType.GreatDome: setStat(xmic, r, 3, ctx.prng.next15() & 0x3f); break;
    case MicrosimType.BusDepot: case MicrosimType.RailDepot: case MicrosimType.SubwayStation: setStat(xmic, r, 1, recStat(xmic, r, 1) + 1); break;
    default: break;
  }
}

/** Actions.allocMicrosim：见文件头协议。 */
export function allocMicrosim(ctx: SimContext, rt: ServicesRuntime, t: ServicesTuning, tileId: number): number {
  const kind = recordKindOf(ctx, tileId);
  if (!kind) return 0;
  const xmic = ctx.state.layers.xmic;
  if ('shared' in kind) {
    const r = kind.shared;
    if (recTileId(xmic, r) === 0) setTileId(xmic, r, tileId);
    initRecord(ctx, t, r, tileId);
    ctx.act.layerChanged('xmic');
    return r;
  }
  for (let r = MICROSIM_FIRST_EXCLUSIVE; r < MICROSIM_RECORDS; r++) {
    if (recTileId(xmic, r) !== 0) continue;
    clearRecord(xmic, r);
    setTileId(xmic, r, tileId);
    initRecord(ctx, t, r, tileId);
    writeLabel(ctx.state.layers.xlab, labelOfSlot(r), '');          // 默认名留空：查询窗口显示建筑名（strings 键 bld.0xNN），rename 命令可改
    rt.pending.push({ slot: r, tileId });
    if (rt.pending.length > 32) rt.pending.shift();
    ctx.act.layerChanged('xmic');
    return r;
  }
  return -1;
}

/** 清掉所有指向记录 r 的 XTXT 标签；返回清掉的格数。 */
function clearLabels(ctx: SimContext, r: number): number {
  const xtxt = ctx.state.layers.xtxt;
  const label = labelOfSlot(r);
  let n = 0;
  for (let i = 0; i < TILES; i++) if (xtxt[i] === label) { xtxt[i] = 0; n++; }
  return n;
}

/** Actions.freeMicrosim：独占记录清零 + 清 XLAB + 清 XTXT 标签；共享记录保留（无操作）。 */
export function freeMicrosim(ctx: SimContext, rt: ServicesRuntime, slot: number): void {
  if (!isExclusiveSlot(slot)) return;
  const xmic = ctx.state.layers.xmic;
  rt.pending = rt.pending.filter((p) => p.slot !== slot);
  if (recTileId(xmic, slot) === 0) return;
  clearRecord(xmic, slot);
  writeLabel(ctx.state.layers.xlab, labelOfSlot(slot), '');
  if (clearLabels(ctx, slot) > 0) ctx.act.layerChanged('xtxt');
  ctx.act.layerChanged('xmic');
}

/** 把标签写到建筑占地内所有尚未标注的格（锚点由 XZON 角标推出；损坏时只写本格）。返回是否写了任何格。 */
function labelFootprint(ctx: SimContext, i: number, label: number): boolean {
  const L = ctx.state.layers;
  const id = L.xbld[i]!;
  const n = FOOTPRINT[id] ?? 1;
  const anchor = n === 1 ? i : anchorOf(L, i);
  let wrote = false;
  const put = (j: number): void => { if (L.xtxt[j] === 0 && L.xbld[j] === id) { L.xtxt[j] = label; wrote = true; } };
  if (anchor < 0) put(i); else forEachLotTile(anchor, n, put);
  return wrote;
}

/**
 * onTilesChanged('building')：
 *  1) 新建筑且无标签：共享类型直接写共享标签；独占类型若在 pending 中有同 tileId 的记录则绑定并写标签；
 *  2) 已有标签但记录的 tileId 与格上建筑不符（拆除 / 被灾害变瓦砾 / 被覆盖）：清本格标签，若记录再无任何格引用则释放。
 */
export function onBuildingTilesChanged(ctx: SimContext, rt: ServicesRuntime, tiles: ReadonlyArray<number>): void {
  const L = ctx.state.layers;
  const xmic = L.xmic;
  let xtxtDirty = false;
  const staleSlots = new Set<number>();
  for (const i of tiles) {
    const b = L.xbld[i]!;
    const label = L.xtxt[i]!;
    const r = slotOfLabel(label);
    if (r >= 0) {
      const expected = recTileId(xmic, r);
      const ok = isSharedSlot(r) ? sharedMatches(ctx, r, b) : expected !== 0 && expected === b;
      if (!ok) { L.xtxt[i] = 0; xtxtDirty = true; if (isExclusiveSlot(r)) staleSlots.add(r); }
      continue;
    }
    if (label !== 0 || b < 0x0e) continue;
    const kind = recordKindOf(ctx, b);
    if (!kind) continue;
    if ('shared' in kind) { if (labelFootprint(ctx, i, labelOfSlot(kind.shared))) xtxtDirty = true; continue; }
    const k = rt.pending.findIndex((p) => p.tileId === b && recTileId(xmic, p.slot) === b);
    if (k < 0) continue;
    const slot = rt.pending[k]!.slot;
    if (labelFootprint(ctx, i, labelOfSlot(slot))) { xtxtDirty = true; rt.pending.splice(k, 1); }
  }
  for (const r of staleSlots) {
    const label = labelOfSlot(r);
    let referenced = false;
    for (let i = 0; i < TILES; i++) if (L.xtxt[i] === label) { referenced = true; break; }
    if (!referenced) { clearRecord(xmic, r); writeLabel(L.xlab, label, ''); ctx.act.layerChanged('xmic'); }
  }
  if (xtxtDirty) ctx.act.layerChanged('xtxt');
}

/** 共享标签 r 对格上建筑 b 是否仍成立（b 的共享记录号 == r）。 */
function sharedMatches(ctx: SimContext, r: number, b: number): boolean {
  const kind = recordKindOf(ctx, b);
  return kind !== null && 'shared' in kind && kind.shared === r;
}

/** 由 XTXT 标签反查格 i 的记录号（独占要求记录非空；共享要求格上建筑类型匹配）。 */
export function slotAtTile(ctx: SimContext, i: number): number {
  const L = ctx.state.layers;
  const r = slotOfLabel(L.xtxt[i]!);
  if (r < 0) return -1;
  if (isSharedSlot(r)) return sharedMatches(ctx, r, L.xbld[i]!) ? r : -1;
  return recTileId(L.xmic, r) !== 0 ? r : -1;
}

/** 测试 / 查询辅助：独占记录占用数。 */
export function exclusiveUsed(xmic: Uint8Array): number {
  let n = 0;
  for (let r = MICROSIM_FIRST_EXCLUSIVE; r < MICROSIM_RECORDS; r++) if (recTileId(xmic, r) !== 0) n++;
  return n;
}

/** 巨型住区每月状况（spec:services §2.8.3；growthVisit 访问到 TR 角位格时）。 */
export function updateArcoCondition(ctx: SimContext, x: number, y: number): void {
  const i = tileIndex(x, y);
  const L = ctx.state.layers;
  const b = L.xbld[i]!;
  if (!isArcology(b) || (L.xzon[i]! & Corner.TR) === 0) return;
  const anchor = anchorOf(L, i);
  if (anchor < 0) return;
  const r = slotAtTile(ctx, anchor);
  if (r < 0 || !isExclusiveSlot(r)) return;
  const M = ctx.state.maps;
  const h = (tileX(anchor) >> 1) * 64 + (tileY(anchor) >> 1);
  let cond = (M.xval[h]! >> 5) - (M.xcrm[h]! >> 5) - (M.xplt[h]! >> 5) + 12;
  if (!ctx.q.utilities.poweredSelf(anchor)) cond = idiv(cond, 2);
  if (!ctx.q.utilities.watered(anchor)) cond = idiv(cond, 2);
  setStat0(L.xmic, r, Math.max(0, Math.min(12, cond)));
  ctx.act.layerChanged('xmic');
}

