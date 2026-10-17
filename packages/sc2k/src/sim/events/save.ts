// ===== sim/events/save.ts =====（spec:disasters §2.5.1 XTXT 合成 / 剥离与侧表 xtxtShadow、§3.10 存档映射）
// exportTo：天气 / 灾害 / 发明年写 MISC；marker 合成进 doc.xtxt，被覆盖的微模拟标签 / 标牌进 MISC 0x10BC..0x12BB 的侧表（'XSHD' v1，≤ 168 条）。
// importFrom：XTXT ≥ 0xFB → marker、0xC9..0xEF 指针清 0；侧表 → 占地补全 → 共享标签按类型 → XMIC 反查；MISC 恢复状态机；运行时计时器按默认值重建。
// postLoad：绑定 ctx、校验 priv 版本、对齐模式。运行时从不写 XTXT（唯一例外是建筑被毁时清掉它自己的标签，见 destroy.ts）。
import { FOOTPRINT, forEachLotTile, isAnchorTile } from '../../contracts/footprint';
import { CityMode, DisasterKind, TILES, TileMarker, tileIndex, tileX, tileY } from '../../contracts/grid';
import { MISC, miscGet, miscSet } from '../../contracts/io';
import type { Sc2Document } from '../../contracts/io';
import type { CityState } from '../../contracts/state';
import type { Diagnostic, NewCityParams, PostLoadSource, SimContext } from '../../contracts/system';
import { fuelFor, privOf, tuningOf } from './common';
import type { EventsRuntime } from './common';
import { anyMarker, centroidOf } from './marker';
import { reconcile } from './machine';
import { EXTRA_PAPER_OFF, PAPER_DELIVERY_OFF, pushStory } from './news';
import { NewsType } from '../../contracts/events';
import { createEventsPriv, FloodPhase } from './priv';
import { TECH_ACTIVE_SLOTS, rollInventions, silentCatchUp } from './tech';
import { TREND_COUNT } from './tuning';
import { generateWeather } from './weather';

// ---------- MISC 字节访问（Int32Array 内按大端排布 4 字节，使 codec 的大端 i32 写出后字节顺序即侧表顺序） ----------
const getByte = (m: Int32Array, off: number): number => (m[off >> 2]! >>> ((3 - (off & 3)) * 8)) & 0xff;
function setByte(m: Int32Array, off: number, b: number): void {
  const shift = (3 - (off & 3)) * 8, k = off >> 2;
  m[k] = ((m[k]! & ~(0xff << shift)) | ((b & 0xff) << shift)) | 0;
}

/** 侧表布局（spec §2.5.1 第 3 条）。 */
const SHADOW_BASE = MISC.xtxtShadow, SHADOW_BYTES = 512, SHADOW_HEADER = 8, SHADOW_ENTRY = 3;
export const SHADOW_CAPACITY = Math.floor((SHADOW_BYTES - SHADOW_HEADER) / SHADOW_ENTRY);   // 168
const SHADOW_MAGIC = [0x58, 0x53, 0x48, 0x44] as const;   // 'X' 'S' 'H' 'D'
const SHADOW_VERSION = 1;
const isSign = (l: number): boolean => l >= 0x01 && l <= 0x32;
const isIndepLabel = (l: number): boolean => l >= 0x3d && l <= 0xc8;
const isSharedLabel = (l: number): boolean => l >= 0x34 && l <= 0x3c;
const isPointer = (l: number): boolean => l >= 0xc9 && l <= 0xef;
const LABEL_BASE = 0x33, XMIC_STRIDE = 8, XMIC_RECORDS = 150, FIRST_INDEP_RECORD = 10;

export interface ShadowEntry { tile: number; label: number }

/** 把 marker 合成进 out（= xtxt 拷贝），返回需要侧表的条目（微模拟在前、标牌在后，同类按 tile 升序）。 */
export function composeXtxt(xtxt: Uint8Array, marker: Uint8Array, out: Uint8Array): ShadowEntry[] {
  const micro: ShadowEntry[] = [], signs: ShadowEntry[] = [];
  for (let i = 0; i < TILES; i++) {
    const m = marker[i]!;
    if (m === 0) continue;
    const l = xtxt[i]!;
    if (isIndepLabel(l)) micro.push({ tile: i, label: l });
    else if (isSign(l)) signs.push({ tile: i, label: l });
    out[i] = m;
  }
  return micro.concat(signs);
}
export function writeShadow(m: Int32Array, entries: readonly ShadowEntry[]): boolean {
  for (let k = 0; k < SHADOW_BYTES; k++) setByte(m, SHADOW_BASE + k, 0);
  if (entries.length === 0) return false;
  const truncated = entries.length > SHADOW_CAPACITY;
  const n = Math.min(entries.length, SHADOW_CAPACITY);
  SHADOW_MAGIC.forEach((b, k) => setByte(m, SHADOW_BASE + k, b));
  setByte(m, SHADOW_BASE + 4, SHADOW_VERSION);
  setByte(m, SHADOW_BASE + 5, truncated ? 1 : 0);
  setByte(m, SHADOW_BASE + 6, n >> 8); setByte(m, SHADOW_BASE + 7, n & 0xff);
  for (let k = 0; k < n; k++) {
    const e = entries[k]!, off = SHADOW_BASE + SHADOW_HEADER + k * SHADOW_ENTRY;
    setByte(m, off, e.tile >> 8); setByte(m, off + 1, e.tile & 0xff); setByte(m, off + 2, e.label);
  }
  return truncated;
}
export function readShadow(m: Int32Array): { entries: ShadowEntry[]; truncated: boolean } | null {
  for (let k = 0; k < 4; k++) if (getByte(m, SHADOW_BASE + k) !== SHADOW_MAGIC[k]) return null;
  if (getByte(m, SHADOW_BASE + 4) !== SHADOW_VERSION) return null;
  const truncated = (getByte(m, SHADOW_BASE + 5) & 1) === 1;
  const n = Math.min(SHADOW_CAPACITY, (getByte(m, SHADOW_BASE + 6) << 8) | getByte(m, SHADOW_BASE + 7));
  const entries: ShadowEntry[] = [];
  for (let k = 0; k < n; k++) {
    const off = SHADOW_BASE + SHADOW_HEADER + k * SHADOW_ENTRY;
    const tile = (getByte(m, off) << 8) | getByte(m, off + 1), label = getByte(m, off + 2);
    if (tile < TILES) entries.push({ tile, label });
  }
  return { entries, truncated };
}

// ---------- 读档恢复的三步兜底（spec §2.5.1 第 4 条） ----------
/** 部分格被覆盖的多格建筑：占地内已有标签 L ⇒ 其余 marker≠0 且 xtxt==0 的格补 L。 */
export function fillFootprintLabels(L: CityState['layers'], marker: Uint8Array): number {
  let filled = 0;
  for (let i = 0; i < TILES; i++) {
    const id = L.xbld[i]!;
    if (id < 0x0e || !isAnchorTile(L, i)) continue;
    const n = FOOTPRINT[id]!;
    if (n === 1) continue;
    if (tileX(i) + n > 128 || tileY(i) + n > 128) continue;
    let label = 0;
    forEachLotTile(i, n, (j) => { const l = L.xtxt[j]!; if (label === 0 && (isIndepLabel(l) || isSharedLabel(l))) label = l; });
    if (label === 0) continue;
    forEachLotTile(i, n, (j) => { if (marker[j] !== 0 && L.xtxt[j] === 0) { L.xtxt[j] = label; filled++; } });
  }
  return filled;
}
/** 共享标签（0x34..0x3C）按建筑类型补全：只对 catalogue 标 microsim.shared 的建筑，记录号按 services 规格 r = 1..9。 */
const SHARED_RECORD: Readonly<Record<number, number>> = { 0xec: 1, 0xed: 2, 0xe9: 3, 0xc8: 4, 0xc6: 5, 0xc7: 5, 0xd5: 6, 0xd4: 7, 0xf5: 8, 0xf8: 9 };
export function restoreSharedLabels(ctx: SimContext, marker: Uint8Array): number {
  const L = ctx.state.layers;
  let filled = 0;
  for (let i = 0; i < TILES; i++) {
    const id = L.xbld[i]!;
    if (marker[i] === 0 || L.xtxt[i] !== 0) continue;
    const r = SHARED_RECORD[id];
    if (r === undefined || ctx.catalogue.BUILDINGS[id]?.microsim?.shared !== true) continue;
    L.xtxt[i] = LABEL_BASE + r; filled++;
  }
  return filled;
}
/** XMIC 反查：记录 r（10..149）有 tileId 但地图上无 0x33+r 标签 → 在"占地全空且至少一格有标记"的同类建筑中绑定。 */
export function restoreByXmic(ctx: SimContext, marker: Uint8Array, diag: Diagnostic[]): number {
  const L = ctx.state.layers, xmic = L.xmic;
  const present = new Uint8Array(256);
  for (let i = 0; i < TILES; i++) present[L.xtxt[i]!] = 1;
  const taken = new Uint8Array(TILES);
  let bound = 0;
  for (let r = FIRST_INDEP_RECORD; r < XMIC_RECORDS; r++) {
    const tileId = xmic[r * XMIC_STRIDE]!;
    const label = LABEL_BASE + r;
    if (tileId === 0 || present[label] === 1) continue;
    const cands: number[] = [];
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const a = tileIndex(x, y);
      if (L.xbld[a] !== tileId || !isAnchorTile(L, a) || taken[a] === 1) continue;
      const n = FOOTPRINT[tileId]!;
      if (x + n > 128 || y + n > 128) continue;
      let allEmpty = true, anyMark = false;
      forEachLotTile(a, n, (j) => { if (L.xtxt[j] !== 0) allEmpty = false; if (marker[j] !== 0) anyMark = true; });
      if (allEmpty && anyMark) cands.push(a);
    }
    if (cands.length === 0) { diag.push({ level: 'info', code: 'events.xmicOrphan', message: `XMIC 记录 ${r}（XBLD 0x${tileId.toString(16)}）找不到可绑定的建筑`, at: `xmic[${r}]` }); continue; }
    if (cands.length > 1) diag.push({ level: 'info', code: 'events.xtxtRestoreAmbiguous', message: `XMIC 记录 ${r} 有 ${cands.length} 个候选建筑，取第一个（名字可能错配）`, at: `xmic[${r}]` });
    const a = cands[0]!;
    taken[a] = 1; present[label] = 1;
    forEachLotTile(a, FOOTPRINT[tileId]!, (j) => { L.xtxt[j] = label; });
    bound++;
  }
  return bound;
}

// ---------- System 钩子 ----------
const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v | 0);

export function initEvents(rt: EventsRuntime, ctx: SimContext, p: NewCityParams): void {
  rt.ctx = ctx;
  const s = ctx.state, T = tuningOf(ctx);
  s.priv.events = createEventsPriv();
  rollInventions(ctx, p.startYear);
  const w = generateWeather(T.weather, ctx.prng, 0, p.terrain.coast);
  s.weather.heat = w.heat; s.weather.wind = w.wind; s.weather.humid = w.humid; s.weather.trend = w.trend; s.weather.season = w.season;
  const D = s.disaster;
  D.pending = DisasterKind.None; D.current = DisasterKind.None; D.active = false; D.pointX = 64; D.pointY = 64; D.noDisasters = false; D.autoGoto = true; D.windOverride = -1;
  // 报纸选项默认开（暂以 rawMisc 为真源，见 contract-rfc.md）
  s.rawMisc[PAPER_DELIVERY_OFF] = 1; s.rawMisc[EXTRA_PAPER_OFF] = 1;
  pushStory(ctx, T.news, NewsType.Founding, 0);
}

export function exportEvents(ctx: SimContext, doc: Sc2Document): void {
  const s = ctx.state, m = doc.misc, P = privOf(s), w = s.weather, D = s.disaster;
  miscSet(m, MISC.heat, w.heat); miscSet(m, MISC.wind, w.wind); miscSet(m, MISC.humidity, w.humid); miscSet(m, MISC.weather, w.trend);
  miscSet(m, MISC.disaster, D.current); miscSet(m, MISC.pendingDisaster, D.pending); miscSet(m, MISC.disasterActive, D.active ? 1 : 0);
  miscSet(m, MISC.noDisasters, D.noDisasters ? 1 : 0); miscSet(m, MISC.autoGoto, D.autoGoto ? 1 : 0);
  for (let i = 0; i <= TECH_ACTIVE_SLOTS; i++) miscSet(m, MISC.techYears + i * 4, s.tech.announced[i] !== 0 && i < TECH_ACTIVE_SLOTS ? 0 : s.tech.invented[i]!);
  const entries = composeXtxt(s.layers.xtxt, P.marker, doc.xtxt);
  if (writeShadow(m, entries)) ctx.diag.push({ level: 'warn', code: 'events.xtxtShadowTruncated', message: `侧表容量 ${SHADOW_CAPACITY}，${entries.length - SHADOW_CAPACITY} 条标签未能记录（读档时靠 XMIC 反查）` });
}

export function importEvents(rt: EventsRuntime, ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void {
  rt.ctx = ctx;
  const s = ctx.state, L = s.layers, m = doc.misc, T = tuningOf(ctx);
  const P = createEventsPriv();
  s.priv.events = P;
  // 1. 剥离标记与物件指针（物件 v2 由 XTHG 重建）
  for (let i = 0; i < TILES; i++) {
    const v = L.xtxt[i]!;
    if (v >= 0xfb) { P.marker[i] = v; L.xtxt[i] = 0; } else if (isPointer(v)) L.xtxt[i] = 0;
  }
  // 2. 侧表 → 3. 占地补全 → 4. 共享标签 → 5. XMIC 反查
  const shadow = readShadow(m);
  if (shadow) {
    let restored = 0;
    for (const e of shadow.entries) if (P.marker[e.tile] !== 0 && L.xtxt[e.tile] === 0) { L.xtxt[e.tile] = e.label; restored++; }
    if (shadow.truncated) diag.push({ level: 'info', code: 'events.xtxtShadowTruncated', message: `侧表曾被截断（已恢复 ${restored} 条），其余靠占地补全 / XMIC 反查` });
  }
  for (let k = 0; k < SHADOW_BYTES >> 2; k++) s.rawMisc[(SHADOW_BASE >> 2) + k] = 0;   // 侧表只在写档时重新生成
  if (anyMarker(P)) {
    fillFootprintLabels(L, P.marker);
    restoreSharedLabels(ctx, P.marker);
    restoreByXmic(ctx, P.marker, diag);
    if (!shadow) diag.push({ level: 'info', code: 'events.signLost', message: '第三方灾害中存档：被标记覆盖的标牌索引无法恢复（文本仍在 XLAB）' });
  }
  ctx.act.layerChanged('xtxt');
  // 6. MISC 标量
  const w = s.weather;
  w.heat = clampInt(miscGet(m, MISC.heat), 0, 255); w.wind = clampInt(miscGet(m, MISC.wind), 0, 255); w.humid = clampInt(miscGet(m, MISC.humidity), 0, 255);
  w.trend = clampInt(miscGet(m, MISC.weather), 0, TREND_COUNT - 1);
  w.season = (T.weather.seasonOfMonth[Math.floor((s.clock.age % 300) / 25)] ?? 0) as 0 | 1 | 2 | 3;
  const D = s.disaster;
  const cur = miscGet(m, MISC.disaster), pend = miscGet(m, MISC.pendingDisaster);
  D.current = cur >= 0 && cur <= DisasterKind.PlaneCrash ? cur : DisasterKind.None;
  D.pending = pend >= 0 && pend <= DisasterKind.PlaneCrash ? pend : DisasterKind.None;
  D.active = miscGet(m, MISC.disasterActive) !== 0;
  D.noDisasters = miscGet(m, MISC.noDisasters) !== 0; D.autoGoto = miscGet(m, MISC.autoGoto) !== 0;
  D.windOverride = -1;
  const focus = centroidOf(P, TileMarker.Fire) ?? centroidOf(P, TileMarker.Flood) ?? { x: 64, y: 64 };
  D.pointX = focus.x; D.pointY = focus.y;
  for (let i = 0; i <= TECH_ACTIVE_SLOTS; i++) s.tech.invented[i] = miscGet(m, MISC.techYears + i * 4) | 0;
  silentCatchUp(s);
  // 7. 运行时计时器按类型默认值重建（spec §2.8 第 4 条）
  let floodAlt = -1, floodN = 0;
  for (let i = 0; i < TILES; i++) {
    const mk = P.marker[i]!;
    if (mk === TileMarker.Fire) P.fuel[i] = fuelFor(T.fire, L.xbld[i]!);
    else if (mk === TileMarker.Flood) { floodN++; floodAlt = Math.max(floodAlt, ctx.q.terrain.alt(i)); }
    else if (mk !== 0) { P.marker[i] = 0; diag.push({ level: 'info', code: 'events.markerUnsupported', message: `XTXT 标记 0x${mk.toString(16)}（暴乱 / 毒云）v1 不支持，已清除`, at: `tile ${i}` }); }
  }
  if (floodN > 0) {
    const c = centroidOf(P, TileMarker.Flood)!;
    P.floodPhase = FloodPhase.Hold; P.floodTicks = 0; P.floodAlt = floodAlt; P.floodMax = floodN; P.floodOx = c.x; P.floodOy = c.y;
  }
  // 报纸：故事池重置（spec §3.10 "无法解析则重置故事池"）；选项值随 rawMisc 透传
}

export function postLoadEvents(rt: EventsRuntime, ctx: SimContext, source: PostLoadSource): void {
  rt.ctx = ctx;
  const s = ctx.state;
  const had = s.priv.events;
  const P = privOf(s);                                      // 缺失 / 版本不符 → 重建为空（不崩溃）
  if (P !== had && source === 'snapshot') ctx.diag.push({ level: 'warn', code: 'events.privRebuilt', message: '快照中 priv.events 缺失或版本不符，已重建为空（灾害标记丢失）' });
  if (s.clock.mode === CityMode.Disaster) reconcile(ctx);
}
