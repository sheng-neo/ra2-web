// ===== sim/zones/growth.ts =====
// 生长访问流程（spec:zones §2.5.2 visitZoneTile → §2.5.4 tryGrow / §2.5.6 findLot / §2.5.7 状态机 / §2.6 档次）。
// 只有本文件的 growthVisit 路径消费 PRNG（掷骰 → findLot 洗牌 → pickBuilding → 施工变体，顺序固定）；
// finishConstruction / declineOneStep 也被日末计时器调用，因此只用 hash32(age, anchor) 派生随机。
import { Corner, ZONE_MASK, isDenseZone, tileIndex, tileX, tileY, zoneTypeOf } from '../../contracts/grid';
import type { ZoneCode } from '../../contracts/grid';
import { anchorOf, forEachLotTile } from '../../contracts/footprint';
import { hash32 } from '../../contracts/prng';
import type { SimContext } from '../../contracts/system';
import { ABANDONED_IDS, CONSTRUCTION_IDS, LotClass, RADIOACTIVE_ID, RUBBLE_IDS, SIZE_OF_LEVEL, ZONE_TYPES, isRubble, isTree, pickBuilding, zoneIdxOf } from './buildings';
import { RUBBLE_CLEAR_BITS, lotAtAnchor, lotContaining, toRubble, writeLotTiles } from './lots';
import type { LotView, ZonesCtx } from './lots';
import { clearLotColumns } from './priv';
import type { ZonesTuning } from './tuning';
import { clampInt } from './tuning';

/** 掷骰范围与需求偏置（spec:transport §2.12.1 [H]："可用需求 = 需求 + 2000"，roll ∈ [0, 4000)）。 */
const PRESSURE_MAX = 4000, DEMAND_BIAS = 2000;
/** 1x1 可建的最大 XTER（非水、非陡坡：0x00–0x0D）。 */
const MAX_XTER_1X1 = 0x0d;
const DEMAND_KEY = ['r', 'c', 'i'] as const;
const MAX_U8 = 255;

/** 贫富档：base = min(2, lv >> wealthShift)；可选迟滞（spec:zones §2.6）。 */
export function wealthTier(T: ZonesTuning, lv: number, cur: number | null): number {
  const base = Math.min(2, lv >> T.wealthShift);
  if (T.tierHysteresis === 0 || cur === null) return base;
  const band = 1 << T.wealthShift, h = T.tierHysteresis;
  if (base > cur && lv < (cur + 1) * band + h) return cur;
  if (base < cur && lv >= cur * band - h) return cur;
  return base;
}

/** findLot 的结果：锚点 + 需要整栋拆除、只被部分覆盖的旧建筑（absorbPartial）。 */
export interface LotPick { anchor: number; partial: readonly LotView[] }

/**
 * 施工开始：预掷终态建筑（pendingId）与施工变体，清掉被覆盖 lot 的列，整栋写施工瓦片 + 角标。消费 PRNG 恰 2 次。
 * partial 中的旧建筑落在新地块外的格变瓦砾（hash32 变体，不消费 PRNG），保证不留半栋。
 */
export function startConstruction(ctx: SimContext, Z: ZonesCtx, anchor: number, size: number, zoneIdx: number, level: number, tier: number, partial: readonly LotView[] = []): boolean {
  const { tbl, priv, rt } = Z;
  const s = ctx.state, L = s.layers;
  const pendingId = pickBuilding(tbl, zoneIdx, level, tier, (n) => ctx.prng.int(n));
  if (pendingId === 0) return false;
  const cid = ctx.prng.pick(CONSTRUCTION_IDS[level - 1]!);
  const ax = tileX(anchor), ay = tileY(anchor);
  for (const old of partial) {
    forEachLotTile(old.anchor, old.size, (j) => {
      const x = tileX(j), y = tileY(j);
      clearLotColumns(priv, j);
      if (x >= ax && x < ax + size && y >= ay && y < ay + size) return;          // 新地块内的格随后被施工瓦片覆盖
      ctx.act.setXbld(j, RUBBLE_IDS[hash32(s.clock.age, j) & 3]!);
      ctx.act.setXzon(j, (L.xzon[j]! & ZONE_MASK) | Corner.All);
      if ((L.xbit[j]! & RUBBLE_CLEAR_BITS) !== 0) ctx.act.setXbit(j, RUBBLE_CLEAR_BITS, false);
    });
  }
  forEachLotTile(anchor, size, (j) => {
    if (tbl.cls[L.xbld[j]!] !== LotClass.None) { const a = anchorOf(L, j); if (a >= 0) clearLotColumns(priv, a); }
    clearLotColumns(priv, j);
  });
  writeLotTiles(ctx, anchor, size, cid, true);
  priv.pendingId[anchor] = pendingId;
  rt.growsToday++; rt.monthGrows++;
  return true;
}

/** 施工完成（日末，不消费 PRNG）：写 pendingId；pendingId 缺失 / 不符（例如 .SC2 导入的施工瓦片）时按当前地价档用 hash32 抽取。 */
export function finishConstruction(ctx: SimContext, Z: ZonesCtx, anchor: number, b: number): void {
  const { tbl, priv, T } = Z;
  const s = ctx.state, L = s.layers;
  const level = tbl.level[b]!, size = tbl.size[b]!;
  const zt = zoneTypeOf(L.xzon[anchor]! & ZONE_MASK);
  if (!zt) { toRubble(ctx, Z, anchor, size); return; }
  const zoneIdx = zoneIdxOf(zt);
  let id = priv.pendingId[anchor]!;
  if (!(tbl.cls[id] === LotClass.Built && tbl.level[id] === level && tbl.zoneIdx[id] === zoneIdx)) {
    const tier = wealthTier(T, ctx.q.services.landValue(anchor), null);
    const h = hash32(s.clock.age, anchor, 1);
    id = pickBuilding(tbl, zoneIdx, level, tier, (n) => h % n);
    if (id === 0) { toRubble(ctx, Z, anchor, size); return; }
  }
  writeLotTiles(ctx, anchor, size, id, false);
  priv.phaseDays[anchor] = 0; priv.unpoweredDays[anchor] = 0; priv.pendingId[anchor] = 0;
}

/** 衰退一级（不消费 PRNG）：已建 → 同尺寸废弃变体（hash32(age, anchor)）；废弃 → 瓦砾；瓦砾不再衰退。 */
export function declineOneStep(ctx: SimContext, Z: ZonesCtx, anchor: number, b: number): void {
  const { tbl, priv } = Z;
  const cls = tbl.cls[b]!, size = tbl.size[b]!;
  if (cls === LotClass.Built) {
    const aid = ABANDONED_IDS[tbl.level[b]! - 1]![hash32(ctx.state.clock.age, anchor, 2) & 1]!;
    writeLotTiles(ctx, anchor, size, aid, false);
    priv.phaseDays[anchor] = 0; priv.unpoweredDays[anchor] = 0;
  } else if (cls === LotClass.Abandoned) {
    toRubble(ctx, Z, anchor, size);
  }
}

/**
 * findLot（spec:zones §2.5.6）：使 s×s 地块包含格 i 的全部偏移按随机顺序尝试；每格须同分区码、可被覆盖（空地 / 树 / 瓦砾 /
 * 废弃建筑 / level < nextLevel 的同类建筑）、多格要求平地同海拔。被吞并的建筑须整栋落入新地块；
 * T.absorbPartial 时允许部分落入（整栋拆除，列入 partial）。返回 null 表示找不到。
 */
export function findLot(ctx: SimContext, Z: ZonesCtx, i: number, size: number, z: number, nextLevel: number): LotPick | null {
  const { tbl, T, priv } = Z;
  const L = ctx.state.layers;
  const zt = zoneTypeOf(z);
  if (!zt) return null;
  const zoneIdx = zoneIdxOf(zt);
  const x = tileX(i), y = tileY(i);
  const offsets: number[] = [];
  for (let k = 0; k < size * size; k++) offsets.push(k);
  if (offsets.length > 1) ctx.prng.shuffle(offsets);
  for (const o of offsets) {
    const ax = x - Math.floor(o / size), ay = y - (o % size);
    if (ax < 0 || ay < 0 || ax + size > 128 || ay + size > 128) continue;
    const anchor = tileIndex(ax, ay), alt0 = L.alt[anchor]!;
    const partial: LotView[] = [];
    let ok = true;
    for (let dx = 0; dx < size && ok; dx++) for (let dy = 0; dy < size; dy++) {
      const j = tileIndex(ax + dx, ay + dy);
      if ((L.xzon[j]! & ZONE_MASK) !== z) { ok = false; break; }
      const b = L.xbld[j]!;
      if (!(b === 0 || isTree(b) || isRubble(b))) {
        const c = tbl.cls[b]!;
        let coverable = false;
        if (c === LotClass.Abandoned || (c === LotClass.Built && T.allowAbsorb && tbl.zoneIdx[b] === zoneIdx && tbl.level[b]! < nextLevel)) {
          const old = lotContaining(L, tbl, priv, j);
          if (old) {
            const ox = tileX(old.anchor), oy = tileY(old.anchor);
            const inside = ox >= ax && oy >= ay && ox + old.size <= ax + size && oy + old.size <= ay + size;
            coverable = inside || T.absorbPartial;
            if (coverable && !inside && !partial.some((p) => p.anchor === old.anchor)) partial.push(old);
          }
        }
        if (!coverable) { ok = false; break; }
      }
      const xter = L.xter[j]!;
      if (size > 1 ? xter !== 0 || L.alt[j] !== alt0 : xter > MAX_XTER_1X1) { ok = false; break; }
    }
    if (ok) return { anchor, partial };
  }
  return null;
}

function tryGrow(ctx: SimContext, Z: ZonesCtx, i: number, z: number, zoneIdx: number, dense: boolean, lot: LotView | null): boolean {
  const { T, rt } = Z;
  if (rt.growsToday >= T.maxGrowsPerDay) return false;
  const lv = ctx.q.services.landValue(i);
  const tier = wealthTier(T, lv, lot ? lot.tier : null);
  const level = lot ? lot.level : 0, next = level + 1;
  const maxLevel = dense ? (ctx.q.utilities.watered(i) ? 4 : T.denseUnwateredMaxLevel) : 1;
  const gated = next >= 2 && T.densityGateZones.includes(ZONE_TYPES[zoneIdx]!);
  if (next <= maxLevel && (!gated || lv > T.densityLandValue[next - 2]!)) {
    const size = SIZE_OF_LEVEL[next]!;
    const pick = lot && size === lot.size ? { anchor: lot.anchor, partial: [] } : findLot(ctx, Z, i, size, z, next);
    if (pick) return startConstruction(ctx, Z, pick.anchor, size, zoneIdx, next, tier, pick.partial);
  }
  if (lot && lot.cls === LotClass.Built && tier > lot.tier) return startConstruction(ctx, Z, lot.anchor, lot.size, zoneIdx, lot.level, tier);
  return false;
}

function tryDecline(ctx: SimContext, Z: ZonesCtx, lot: LotView | null, tripOk: boolean): void {
  if (!lot || lot.cls !== LotClass.Built) return;
  if (!tripOk && Z.priv.tripFailMonths[lot.anchor]! <= Z.T.tripFailGraceMonths) return;
  if (Z.rt.declinesToday >= Z.T.maxDeclinesPerDay) return;
  Z.rt.declinesToday++; Z.rt.monthDeclines++;
  declineOneStep(ctx, Z, lot.anchor, ctx.state.layers.xbld[lot.anchor]!);
}

/** 原地降档（spec:zones §2.6）：连续 tierDowngradeMonths 次地价档低于建筑档 → 原地重建为低档变体。 */
function checkTierDrift(ctx: SimContext, Z: ZonesCtx, lot: LotView): void {
  const p = Z.priv, a = lot.anchor;
  const t = wealthTier(Z.T, ctx.q.services.landValue(a), lot.tier);
  if (t >= lot.tier) { p.tierMismatchMonths[a] = 0; return; }
  const m = Math.min(MAX_U8, p.tierMismatchMonths[a]! + 1);
  p.tierMismatchMonths[a] = m;
  if (m >= Z.T.tierDowngradeMonths) { p.tierMismatchMonths[a] = 0; startConstruction(ctx, Z, a, lot.size, lot.zoneIdx, lot.level, t); }
}

/** core 的 growthScan 每格回调（spec:zones §2.5.2）。 */
export function growthVisit(ctx: SimContext, Z: ZonesCtx, x: number, y: number): void {
  const s = ctx.state, L = s.layers, { tbl, T, rt, priv } = Z;
  const i = tileIndex(x, y);
  const z = L.xzon[i]! & ZONE_MASK;
  const zt = zoneTypeOf(z);
  if (!zt) return;
  const b = L.xbld[i]!;
  const cls = tbl.cls[b]! as LotClass;
  if (cls === LotClass.Construct || cls === LotClass.Abandoned || b === RADIOACTIVE_ID) return;
  if (cls === LotClass.None && b !== 0 && !isTree(b) && !isRubble(b)) return;        // 道路 / 电线 / 公共建筑 / 教堂等非分区建筑
  if (rt.quotaAge !== s.clock.age) { rt.quotaAge = s.clock.age; rt.growsToday = 0; rt.declinesToday = 0; }
  rt.monthVisits++;
  const zoneIdx = zoneIdxOf(zt), dense = isDenseZone(z);
  let lot: LotView | null = null;
  if (cls === LotClass.Built) {
    if (tbl.size[b] === 1 && (L.xzon[i]! & Corner.TL) === 0) ctx.act.setXzon(i, z | Corner.All);   // 1x1 角标自愈
    if (anchorOf(L, i) !== i) return;                                                            // 只在 TL 锚点处理
    lot = lotAtAnchor(L, tbl, priv, i);
    if (!lot) return;
    if (lot.zoneIdx !== zoneIdx) { toRubble(ctx, Z, lot.anchor, lot.size); return; }             // 改划异类：立即瓦砾
    if (!dense && lot.level > 1) { declineOneStep(ctx, Z, lot.anchor, b); return; }               // 密改轻：强制衰退
  }
  if (!lot && !ctx.q.transport.hasAccess(x, y)) return;
  if (!ctx.q.utilities.hasPower(i)) return;
  const level = (lot ? lot.level : 0) as 0 | 1 | 2 | 3 | 4;
  const trip = ctx.q.transport.runTrip(i, z as ZoneCode, level);
  if (lot) priv.tripFailMonths[i] = trip.ok ? 0 : Math.min(MAX_U8, priv.tripFailMonths[i]! + 1);
  const pressure = trip.ok ? clampInt(s.demand[DEMAND_KEY[zoneIdx]!] + DEMAND_BIAS, 0, PRESSURE_MAX) : 0;
  const roll = ctx.prng.int(PRESSURE_MAX);
  if (roll < pressure - T.growOffset) tryGrow(ctx, Z, i, z, zoneIdx, dense, lot);
  else if (roll >= pressure + T.declineOffset) tryDecline(ctx, Z, lot, trip.ok);
  else if (lot) checkTierDrift(ctx, Z, lot);
}
