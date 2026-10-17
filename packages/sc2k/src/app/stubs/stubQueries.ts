// ===== app/stubs/stubQueries.ts =====（CONTRACTS §U / ARCHITECTURE §10.3 桩矩阵）
// 三套 Queries 桩：缺席 / 桩系统时由 nullSystem 挂到 ctx.q；testkit 直接 re-export 给各 WP 的 describe.each 双桩验收。
//  - optimistic：hasPower / hasAccess / invented → true，runTrip → ok，landValue → 128，canAfford → true，天气恒 Clear。
//  - pessimistic：全部 false / fail / 0，canAfford → false。
//  - realistic（app 的 nullSystem 默认）：invented = year ≥ TECH_BASE_YEAR + 10；hasAccess 按 ACCESS_OFFSETS 查 ROAD_SET / 车站格；
//    hasPower 查 XBIT.POWERED 自身或 4 邻；runTrip = hasAccess；pieceFor = NET_BASE + pieceIndexFor(四邻同族掩码)。
//  三套共同：news.currentPaper → null、stories → []；bridgeOptions → v1 集合（Causeway / Rail / Wire）；bridgePieces 只给三者；disasters.markers → 全零。
// 全部纯函数、同步、不消费 PRNG（realistic 的 runTrip 也不消费——桩没有交通模型）；只读 state，不写任何字段。
import type { CityState } from '../../contracts/state';
import { dateOf } from '../../contracts/state';
import type { CatalogueApi, TechKey, ToolId } from '../../contracts/catalogue';
import type { Command, PlacementPreview, RejectReason } from '../../contracts/commands';
import type {
  Queries, TerrainQuery, UtilityQuery, TransportQuery, ZonesQuery, ServicesQuery, EconomyQuery, TechQuery, DisasterQuery, NewsQuery, PlacementQuery,
  TripResult, PlaceCheck, Availability, BudgetView, BondView,
} from '../../contracts/queries';
import type { StubProfile } from '../../contracts/testkit';
import { DX, DY, TILES, XBit, XterClass, ZONE_MASK, halfOfTile, inMap, tileIndex, tileX, tileY, xterClassOf } from '../../contracts/grid';
import { ACCESS_OFFSETS, BridgeKind, NET_BASE, isBridge, isHighway, isPowerCarrier, isPipeUnd, isRail, isRoad, isStationTile, isSubwayUnd, pieceIndexFor } from '../../contracts/net';
import type { NetFamily } from '../../contracts/net';
import { SLOPE_CORNERS } from '../../contracts/rotation';
import { FOOTPRINT } from '../../contracts/footprint';

/** 桩里"科技发明年 = 基准年 + 10"的固定延迟（真 events 用 base + rng % 20）。 */
export const STUB_TECH_DELAY_YEARS = 10;
/** 乐观桩的地价常量。 */
export const STUB_OPTIMISTIC_LAND_VALUE = 128;

const ZERO_MARKERS: Readonly<Uint8Array> = new Uint8Array(TILES);
const EMPTY: readonly never[] = Object.freeze([]) as readonly never[];

/** xter → 坡面码：0x0X/0x1X/0x2X 低 nibble；0x3E 瀑布 → 13；0x3X 浅水按低 nibble；0x4X 溪流 → 0。 */
/** 与 sim/terrain 的 slopeCodeOf 同口径（contract-rfc WP2-2）：0x3E 瀑布 → 13；0x3X 浅水 / 0x4X 水下（低 nibble 是形状码）→ 0；其余 xter & 0x0F（> 13 视为 0）。 */
const slopeOf = (xter: number): number => (xter === 0x3e ? 13 : xter >= 0x30 ? 0 : (xter & 0x0f) <= 13 ? xter & 0x0f : 0);

const isWaterTile = (s: CityState, i: number): boolean => {
  const xter = s.layers.xter[i]!;
  if ((s.layers.xbit[i]! & XBit.Water) !== 0) return true;
  const c = xterClassOf(xter);
  return c === XterClass.Submerged || c === XterClass.Surface || c === XterClass.Waterfall;
};

/** Chebyshev 距离 ≤ limit 内是否存在满足 pred 的格；返回距离（0 = 自身），找不到返回 limit + 1。 */
function chebyshevTo(x: number, y: number, limit: number, pred: (i: number) => boolean): number {
  if (pred(tileIndex(x, y))) return 0;
  for (let d = 1; d <= limit; d++) {
    for (let dx = -d; dx <= d; dx++) {
      const edge = Math.abs(dx) === d;
      for (let dy = -d; dy <= d; dy += edge ? 1 : 2 * d) {
        const nx = x + dx, ny = y + dy;
        if (inMap(nx, ny) && pred(tileIndex(nx, ny))) return d;
      }
    }
  }
  return limit + 1;
}

/** 四邻掩码（bit0=T bit1=R bit2=B bit3=L），pred 对邻格索引判断。 */
function neighborMask(i: number, pred: (j: number) => boolean): number {
  const x = tileX(i), y = tileY(i);
  let m = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d]!, ny = y + DY[d]!;
    if (inMap(nx, ny) && pred(tileIndex(nx, ny))) m |= 1 << d;
  }
  return m;
}

function makeTerrain(s: CityState): TerrainQuery {
  const L = s.layers;
  return {
    alt: (i) => L.alt[i]!,
    slope: (i) => slopeOf(L.xter[i]!),
    xterClass: (i) => xterClassOf(L.xter[i]!),
    isWater: (i) => isWaterTile(s, i),
    isSalt: (i) => (L.xbit[i]! & XBit.SaltWater) !== 0,
    isFlatDry: (i) => slopeOf(L.xter[i]!) === 0 && !isWaterTile(s, i),
    waterDepth: (i) => (isWaterTile(s, i) ? Math.max(0, L.waterLevel[i]! - L.alt[i]!) : 0),
    treeDensity: (i) => { const b = L.xbld[i]!; return b >= 0x06 && b <= 0x0c ? b - 0x05 : 0; },
    cornerHeights: (i) => {
      const base = L.alt[i]!, bits = SLOPE_CORNERS[slopeOf(L.xter[i]!)] ?? 0;
      // bit3 = c00(a) bit2 = c10(b) bit1 = c01(x) bit0 = c11(y)
      return [base + ((bits >> 3) & 1), base + ((bits >> 2) & 1), base + ((bits >> 1) & 1), base + (bits & 1)];
    },
    distanceToWater: (i) => Math.min(8, chebyshevTo(tileX(i), tileY(i), 8, (j) => isWaterTile(s, j))),
    altitudeFeet: (i) => L.alt[i]! * 100 + 50,
  };
}

function makeUtilities(profile: StubProfile, s: CityState): UtilityQuery {
  const L = s.layers;
  const poweredSelf = (i: number): boolean => (L.xbit[i]! & XBit.Powered) !== 0;
  const hasPowerReal = (i: number): boolean => {
    if (poweredSelf(i)) return true;
    const x = tileX(i), y = tileY(i);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!, ny = y + DY[d]!;
      if (inMap(nx, ny) && poweredSelf(tileIndex(nx, ny))) return true;
    }
    return false;
  };
  return {
    poweredSelf: profile === 'optimistic' ? () => true : profile === 'pessimistic' ? () => false : poweredSelf,
    hasPower: profile === 'optimistic' ? () => true : profile === 'pessimistic' ? () => false : hasPowerReal,
    watered: profile === 'optimistic' ? () => true : profile === 'pessimistic' ? () => false : (i) => (L.xbit[i]! & XBit.Watered) !== 0,
    piped: profile === 'optimistic' ? () => true : profile === 'pessimistic' ? () => false : (i) => (L.xbit[i]! & XBit.Piped) !== 0,
    plantAt: () => null,
    lastPower: () => s.utilities.power,
    lastWater: () => s.utilities.water,
  };
}

/** v1 已实现的桥型片段序列（spec:transport §2.6）：堤道 0x58/0x57 交替、铁路桥 0x5B/0x5A 交替、高架电线 0x5C。 */
export function stubBridgePieces(kind: BridgeKind, n: number): readonly number[] | null {
  if (n <= 0) return null;
  const out = new Array<number>(n);
  switch (kind) {
    case BridgeKind.Causeway: for (let k = 0; k < n; k++) out[k] = k % 2 === 0 ? 0x58 : 0x57; return out;
    case BridgeKind.Rail: for (let k = 0; k < n; k++) out[k] = k % 2 === 0 ? 0x5b : 0x5a; return out;
    case BridgeKind.Wire: out.fill(0x5c); return out;
    default: return null;
  }
}
/** v1 桥型菜单：道路任何长度只有堤道（开启桥 / 吊桥 v2）；铁路 [Rail]；电线 [Wire]；高速两种 v2 → []；地铁 / 管线无桥。 */
export function stubBridgeOptions(family: NetFamily | 'highway', n: number): readonly BridgeKind[] {
  if (n <= 0) return EMPTY;
  switch (family) {
    case 'road': return [BridgeKind.Causeway];
    case 'rail': return [BridgeKind.Rail];
    case 'power': return [BridgeKind.Wire];
    default: return EMPTY;
  }
}

function makeTransport(profile: StubProfile, s: CityState): TransportQuery {
  const L = s.layers;
  const isAccessTile = (j: number): boolean => { const b = L.xbld[j]!; return isRoad(b) || isStationTile(b); };
  const hasAccessReal = (x: number, y: number): boolean => {
    for (const [dx, dy] of ACCESS_OFFSETS) {
      const nx = x + dx, ny = y + dy;
      if (inMap(nx, ny) && isAccessTile(tileIndex(nx, ny))) return true;
    }
    return false;
  };
  const hasAccess: TransportQuery['hasAccess'] = profile === 'optimistic' ? () => true : profile === 'pessimistic' ? () => false : hasAccessReal;
  const trip = (ok: boolean): TripResult => ({ ok, usedBus: false, usedRail: false, usedSubway: false, steps: 0 });
  const sameFamily = (family: NetFamily): ((j: number) => boolean) => {
    switch (family) {
      case 'power': return (j) => isPowerCarrier(L.xbld[j]!);
      case 'road': return (j) => isRoad(L.xbld[j]!);
      case 'rail': return (j) => isRail(L.xbld[j]!);
      case 'subway': return (j) => isSubwayUnd(L.xund[j]!);
      case 'pipe': return (j) => isPipeUnd(L.xund[j]!);
    }
  };
  return {
    hasAccess,
    runTrip: (i) => trip(hasAccess(tileX(i), tileY(i))),
    pieceFor: (family, i) => NET_BASE[family] + pieceIndexFor(neighborMask(i, sameFamily(family)), family),
    roadDistance: (x, y) => Math.min(4, chebyshevTo(x, y, 3, (j) => isRoad(L.xbld[j]!))),
    roadTileCounts: () => {
      let roadTiles = 0, highwayTiles = 0, bridgeTiles = 0;
      for (let i = 0; i < TILES; i++) {
        const b = L.xbld[i]!;
        if (isRoad(b)) roadTiles++;
        if (isHighway(b)) highwayTiles++;
        if (isBridge(b)) bridgeTiles++;
      }
      return { roadTiles, highwayTiles, bridgeTiles };
    },
    connections: () => ({ commerce: 0, industry: 0, total: 0 }),
    stationAt: () => null,
    bridgeBlocksShips: () => false,
    bridgeOptions: stubBridgeOptions,
    bridgePieces: (kind, _family, n) => stubBridgePieces(kind, n),
    railMask: (i) => neighborMask(i, (j) => isRail(L.xbld[j]!)),
    subwayMask: (i) => neighborMask(i, (j) => isSubwayUnd(L.xund[j]!)),
    trafficAt: (x, y) => s.maps.xtrf[halfOfTile(tileIndex(x, y))]!,
  };
}

const makeZones = (): ZonesQuery => ({
  lotAt: () => null,
  recreation: () => ({ smallPark: 0, bigPark: 0, marina: 0, zoo: 0, stadium: 0 }),
});

function makeServices(profile: StubProfile, s: CityState): ServicesQuery {
  const half = (map: Uint8Array) => (i: number): number => map[halfOfTile(i)]!;
  const landValue: ServicesQuery['landValue'] =
    profile === 'optimistic' ? () => STUB_OPTIMISTIC_LAND_VALUE : profile === 'pessimistic' ? () => 0 : half(s.maps.xval);
  return {
    structureCounts: () => ({ police: 0, prison: 0, fire: 0, hospital: 0, school: 0, college: 0, busDepot: 0 }),
    graphCurrent: (which) => (which === 'pollution' ? s.totals.pollution : which === 'landValue' ? s.totals.landValue : s.totals.crime),
    cityCenter: () => ({ x: s.totals.centerX || 64, y: s.totals.centerY || 64 }),
    landValue,
    pollution: profile === 'optimistic' ? () => 0 : half(s.maps.xplt),
    crime: profile === 'optimistic' ? () => 0 : half(s.maps.xcrm),
    microsimOf: () => null,
    queryStats: () => EMPTY,
    seaportCranes: () => 0,
    airportRunwayGroups: () => 0,
    airportTiles: () => 0,
    trafficReport: () => s.traffic,
  };
}

function makeEconomy(profile: StubProfile, s: CityState, cat: CatalogueApi): EconomyQuery {
  const e = s.economy;
  const canAfford: EconomyQuery['canAfford'] =
    profile === 'optimistic' ? () => true : profile === 'pessimistic' ? () => false : (cost) => cost <= 0 || e.funds >= cost;
  const budgetView = (): BudgetView => ({
    rows: [], taxRate: { ...e.taxRate }, funding: e.funding, autoBudget: e.autoBudget,
    funds: e.funds, openingFunds: e.yearOpeningFunds, endOfYearFunds: e.funds, advisors: EMPTY,
  });
  const bondView = (): BondView => {
    const bonds = e.bonds.map((b) => ({ ...b, ratePctFloor: Math.floor(b.rateRaw / 10000), annual: 0 }));
    const sum = bonds.reduce((acc, b) => acc + b.ratePctFloor, 0);
    return {
      bonds, count: bonds.length, avgRatePctFloor: bonds.length ? Math.floor(sum / bonds.length) : 0, sumRatePctFloor: sum,
      nextRatePctFloor: null, rating: '', cityValueDollars: 0, canIssue: false, canRepay: false,
    };
  };
  return {
    canAfford,
    funding: (line) => e.funding[line] ?? 0,
    ordinance: (id) => ((e.ordinances >>> id) & 1) === 1,
    year: () => dateOf(s.clock).year,
    budgetView,
    bondView,
    costOf: (tool, units) => {
      const def = cat.toolById(tool);
      if (!def || def.costUnit === 'none') return 0;
      return def.costUnit === 'building' || def.costUnit === 'click' ? def.cost : def.cost * Math.max(0, units);
    },
  };
}

function makeTech(profile: StubProfile, s: CityState, cat: CatalogueApi): TechQuery {
  if (profile === 'optimistic') return { invented: () => true };
  if (profile === 'pessimistic') return { invented: () => false };
  return { invented: (key: TechKey) => dateOf(s.clock).year >= cat.TECH_BASE_YEAR[key] + STUB_TECH_DELAY_YEARS };
}

const makeDisasters = (): DisasterQuery => ({
  marker: () => 0,
  markers: () => ZERO_MARKERS,
  focusPoints: () => EMPTY,
  thingsAt: () => EMPTY,
  things: () => EMPTY,
  dispatchAvailable: () => 0,
});

const makeNews = (): NewsQuery => ({ currentPaper: () => null, stories: () => EMPTY });

function makePlacement(profile: StubProfile, s: CityState, cat: CatalogueApi, economy: EconomyQuery, tech: TechQuery): PlacementQuery {
  const L = s.layers;
  const costOfBuilding = (id: number): number => cat.BUILDINGS[id]?.cost ?? 0;
  const canPlaceReal = (id: number, x: number, y: number): PlaceCheck => {
    const n = FOOTPRINT[id] ?? 1, cost = costOfBuilding(id);
    let reason: RejectReason | undefined;
    for (let dx = 0; dx < n && !reason; dx++) for (let dy = 0; dy < n && !reason; dy++) {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny)) { reason = 'outOfBounds'; break; }
      const i = tileIndex(nx, ny);
      if (isWaterTile(s, i)) reason = 'water';
      else if (slopeOf(L.xter[i]!) !== 0) reason = 'slope';
      else if (L.xbld[i]! !== 0) reason = 'occupied';
    }
    if (!reason && !economy.canAfford(cost)) reason = 'funds';
    return reason ? { ok: false, reason, cost } : { ok: true, cost };
  };
  const canPlace: PlacementQuery['canPlace'] =
    profile === 'optimistic' ? (id) => ({ ok: true, cost: costOfBuilding(id) })
    : profile === 'pessimistic' ? (id) => ({ ok: false, reason: 'occupied', cost: costOfBuilding(id) })
    : canPlaceReal;
  /** 顺序：notImplemented → notInvented → ordinance → locked → funds（桩不认识 v1 白名单与法令，只做前后两项 + 科技）。 */
  const availability = (toolId: ToolId): Availability => {
    const def = cat.toolById(toolId);
    if (!def) return { enabled: false, reason: 'notImplemented' };
    if (profile === 'pessimistic') return { enabled: false, reason: 'funds' };
    if (def.tech && !tech.invented(def.tech)) return { enabled: false, reason: 'notInvented' };
    if (def.unlock && ((s.rewards.grantedMask >>> def.unlock.rewardBit) & 1) === 0) return { enabled: false, reason: 'locked' };
    if (def.costUnit !== 'none' && !economy.canAfford(def.cost)) return { enabled: false, reason: 'funds' };
    return { enabled: true };
  };
  const preview = (cmd: Command): PlacementPreview => {
    switch (cmd.type) {
      case 'placeBuilding': {
        const n = FOOTPRINT[cmd.id] ?? 1, check = canPlace(cmd.id, cmd.x, cmd.y);
        const tiles: { i: number; ok: boolean; reason?: RejectReason }[] = [];
        for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) {
          if (inMap(cmd.x + dx, cmd.y + dy)) tiles.push({ i: tileIndex(cmd.x + dx, cmd.y + dy), ok: check.ok, reason: check.reason });
        }
        return { ok: check.ok, cost: check.cost, tiles, footprint: { x0: cmd.x, y0: cmd.y, size: n }, reason: check.reason };
      }
      case 'zoneRect': {
        const tiles: { i: number; ok: boolean; reason?: RejectReason }[] = [];
        const x0 = Math.min(cmd.x0, cmd.x1), x1 = Math.max(cmd.x0, cmd.x1), y0 = Math.min(cmd.y0, cmd.y1), y1 = Math.max(cmd.y0, cmd.y1);
        let okCount = 0;
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          if (!inMap(x, y)) continue;
          const i = tileIndex(x, y);
          const ok = profile === 'optimistic' ? true : profile === 'pessimistic' ? false : L.xbld[i]! === 0 && !isWaterTile(s, i) && (L.xzon[i]! & ZONE_MASK) === 0;
          if (ok) okCount++;
          tiles.push(ok ? { i, ok } : { i, ok, reason: profile === 'pessimistic' ? 'occupied' : (L.xzon[i]! & ZONE_MASK) !== 0 ? 'zoned' : isWaterTile(s, i) ? 'water' : 'occupied' });
        }
        const perTile = cat.TOOLS.find((t) => t.zoneCode === cmd.zone)?.cost ?? 0;
        return { ok: okCount > 0, cost: okCount * perTile, tiles, reason: okCount > 0 ? undefined : 'occupied' };
      }
      default:
        return { ok: true, cost: 0, tiles: EMPTY };
    }
  };
  return { canPlace, availability, preview };
}

/**
 * 构造一整套 Queries 桩（三套 profile）。返回对象的每个子对象都是独立的普通对象（nullSystem 按 owner 挑选自己的键挂到 System.queries）。
 * state / catalogue 以引用持有：state 被读档整体替换内容（decode into）不影响；若 host 换了 state 对象，调用方需重新构造。
 */
export function stubQueries(profile: StubProfile, state: CityState, catalogue: CatalogueApi): Queries {
  const economy = makeEconomy(profile, state, catalogue);
  const tech = makeTech(profile, state, catalogue);
  return {
    terrain: makeTerrain(state),
    utilities: makeUtilities(profile, state),
    transport: makeTransport(profile, state),
    zones: makeZones(),
    services: makeServices(profile, state),
    economy,
    tech,
    disasters: makeDisasters(),
    news: makeNews(),
    placement: makePlacement(profile, state, catalogue, economy, tech),
  };
}
