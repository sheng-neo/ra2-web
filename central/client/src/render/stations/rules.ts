/**
 * 车站与街面的纯规则（R3 STATIONS，可测）：站名查找、站牌内容、过路处「望右 / 望左」朝向、灯控过路处判定、离敏感区距离。
 * 全部用模拟坐标「米」（x 东、y 北）。站名、路线号只取 transit-data.ts（OpenStreetMap 经 Overture 快照派生，鸣谢页已署名）。
 */
import type { SensitiveZone } from '@central/data';
import { BUS_STOPS, TRAM_STOPS, type BusStopInfo, type TramStopInfo } from '../streets/transit-data';

/** 巴士站点找站名的最远距离（m）：规格 S-B1。 */
export const BUS_NAME_REACH_M = 15;
/** 站牌上最多列几条路线。 */
export const FLAG_MAX_ROUTES = 8;
/** 灯控过路处：过路处中心离交通灯点 ≤ 这个距离（m）就画路钉 + 停车线，不画斑马线（与行人灯杆 SIGNAL_NEAR_M 一致）。 */
export const STUD_SIGNAL_M = 20;

export type FlagKind = 'citybus' | 'kmb' | 'gmb';

export interface FlagSpec {
  kind: FlagKind;
  zh: string;
  en: string;
  routes: string[];
}

/**
 * 巴士站点（模拟米）附近 BUS_NAME_REACH_M 内的站：返回最近一个有站名的，并把 15 m 内同名各站的路线合并（同一个站常有几支站牌）。
 * 没有就返回 null（站牌只画营运商色块，不写字）。
 */
export function busStopInfoNear(x: number, y: number, stops: readonly BusStopInfo[] = BUS_STOPS, reach = BUS_NAME_REACH_M): BusStopInfo | null {
  let best: BusStopInfo | null = null;
  let bestD = reach;
  for (const s of stops) {
    if (Math.abs(s.x - x) > reach || Math.abs(s.y - y) > reach) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD && s.zh) {
      best = s;
      bestD = d;
    }
  }
  if (!best) return null;
  const routes: string[] = [];
  for (const s of stops) {
    if (s.zh !== best.zh || Math.hypot(s.x - x, s.y - y) > reach) continue;
    for (const r of s.routes) if (!routes.includes(r)) routes.push(r);
  }
  return { ...best, routes };
}

/** 路线号排序：先按数字部分，再按字母（6、6A、6X、12、621、N...）；夜车 N 字头放最后。 */
export function sortRoutes(routes: readonly string[]): string[] {
  const key = (r: string): [number, number, string] => {
    const night = /^N/.test(r) ? 1 : 0;
    const m = /(\d+)/.exec(r);
    return [night, m ? Number(m[1]) : 9999, r];
  };
  return [...routes].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0);
  });
}

/** 站牌款式：小巴站（op gmb，或路线全是小巴号 22 字头）用小巴牌；只有九巴的用九巴红牌；其余城巴橙牌。 */
export function flagKind(info: Pick<BusStopInfo, 'op' | 'routes'> | null): FlagKind {
  if (!info) return 'citybus';
  if (info.op === 'gmb' || (info.routes.length > 0 && info.routes.every((r) => /^22/.test(r)))) return 'gmb';
  if (info.op === 'kmb') return 'kmb';
  return 'citybus';
}

/**
 * 站名（复审修正）：红线词表（citymap/src/redlines.ts：真实企业 / 楼宇名）与敏感地点名不进产物的任何字符串，
 * 所以在数据源（transit-data.ts）里就已换好——六座地标原型楼命名的站用游戏里的虚构地标名（与 citymap/src/overrides/landmarks.ts 一致），
 * 其余以楼 / 敏感地点命名的站用最近的街名。这里不再保留真名的对照表（原来的正则把真名带进了打包后的 JS）。
 */
export function stopDisplayName(zh: string, en: string): { zh: string; en: string } {
  return { zh, en };
}

/** 站牌内容（站名 + 最多 8 条路线）。 */
export function flagSpec(info: BusStopInfo | null): FlagSpec {
  const name = stopDisplayName(info?.zh ?? '', info?.en ?? '');
  return {
    kind: flagKind(info),
    zh: name.zh,
    en: name.en,
    routes: sortRoutes(info?.routes ?? []).slice(0, FLAG_MAX_ROUTES),
  };
}

/**
 * 电车站岛的站名牌：同方向（站号 W 西行 / E 东行）最近的电车站。westbound 由站岛轴向（行驶方向）定。
 */
export function tramStopFor(x: number, y: number, westbound: boolean, stops: readonly TramStopInfo[] = TRAM_STOPS): TramStopInfo | null {
  let best: TramStopInfo | null = null;
  let bestD = Infinity;
  for (const s of stops) {
    if (s.ref.endsWith('W') !== westbound) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

export type LookSide = 'right' | 'left';

/**
 * 过路处路缘上的「望右 / 望左」（靠左行驶）：写的是离这侧路缘最近那条车道的来车方向。
 * oneway：0 双向，+1 只沿道路方向 +t，−1 只逆 +t；kerbSide：+1 = 道路左侧（+n）路缘，−1 = 右侧。
 * 双向路两侧都是望右；单行路在来车从行人左边来的那侧是望左（加箭头）。
 */
export function lookSide(oneway: 0 | 1 | -1, kerbSide: 1 | -1): LookSide {
  // 近侧车道的行驶方向（沿 +t 为 +1）：双向路靠左行，+n 侧车道沿 +t、−n 侧沿 −t
  const flow = oneway === 0 ? kerbSide : oneway;
  // 站在 +n 路缘面向马路时，右手是 −t；站在 −n 路缘时右手是 +t。车从「右手」来 ⇔ 车流方向 = −右手
  const right = -kerbSide;
  return flow === -right ? 'right' : 'left';
}

/** 过路处是否按灯控画（两行路钉 + 停车线）：中心 STUD_SIGNAL_M 内有交通灯点。signals：模拟 dm 扁平坐标。 */
export function studdedCrossing(xDm: number, yDm: number, signals: readonly number[], reachM = STUD_SIGNAL_M): boolean {
  const r = reachM * 10;
  for (let k = 0; k + 1 < signals.length; k += 2) {
    const dx = signals[k]! - xDm;
    const dy = signals[k + 1]! - yDm;
    if (Math.abs(dx) <= r && Math.abs(dy) <= r && dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/** 点（模拟米）到敏感区的距离（m）：在区内为 0。 */
export function zoneDistance(zones: readonly SensitiveZone[], x: number, y: number): number {
  let best = Infinity;
  const px = x * 10;
  const py = y * 10;
  for (const z of zones) {
    for (const ring of [z.area.outer, ...(z.area.holes ?? [])]) {
      const n = ring.length >> 1;
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = ring[i * 2]!;
        const ay = ring[i * 2 + 1]!;
        const bx = ring[j * 2]!;
        const by = ring[j * 2 + 1]!;
        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay || 1e-9) + ax) inside = !inside;
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / l2, 0), 1) : 0;
        best = Math.min(best, Math.hypot(ax + t * dx - px, ay + t * dy - py) / 10);
      }
      if (inside && ring === z.area.outer) return 0;
    }
  }
  return best;
}

/** 道具离敏感区至少这么远（m）：规格「区内与区外 3 m 内都不放」。 */
export const ZONE_CLEAR_M = 3;

/** 点（模拟米）离所有敏感区 ≥ ZONE_CLEAR_M。 */
export function clearOfZones(zones: readonly SensitiveZone[], x: number, y: number, margin = ZONE_CLEAR_M): boolean {
  return zoneDistance(zones, x, y) >= margin;
}
