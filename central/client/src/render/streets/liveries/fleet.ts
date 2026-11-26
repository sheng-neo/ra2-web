/**
 * 巴士、小巴、的士的营运商与路线分配（R3 LIVERIES，纯函数，按车辆下标确定性）。
 *
 * - 双层巴士（surfaces-facts §2–§4）：中环走廊城巴 60 %、九巴 40 %；九巴红色 2018 涂装为主，香槟金只在 101 / 104 / 111 上（约四分之一）。
 *   每辆车一生只挂一条真实路线（transit-data.ts ROUTES；联营路线 JOINT_ROUTES 两家都能挂），显示屏显示该线一端的真实目的地；
 *   开场就停在站上的那辆车（traffic.ts initialDwellers）从该站真实停靠的路线里挑（P1：车站与车上路线一致）。
 *   约 35 % 车身侧面有虚构广告（只用招牌白名单行业通称或不写字）。城巴车队编号 5 位、九巴 4 位，每车唯一。
 * - 小巴（§5）：绿色专线小巴 65 %（ROUTES 里的 gmb 路线：路线号 + 目的地），红色小巴 35 %（RED_MINIBUS_PLACES 地名）。
 * - 的士（§6）：市区红色的士（红车身、银色车顶车柱、TAXI 顶灯）。私家车不挂任何牌子。
 */
import { lanePose, type Lane } from '../lanes';
import { threeToSim } from '../../../coords';
import { BUS_STOPS, JOINT_ROUTES, RED_MINIBUS_PLACES, ROUTES, type RouteInfo } from '../transit-data';
import { AD_WORDS, KMB_CLASSES, busDestIndex, routeIndex } from './atlas';

/** 着色器里的涂装方案代码（vehicles.ts iTxt.w）。 */
export const Scheme = { Car: 0, Taxi: 1, Citybus: 2, KmbRed: 3, KmbGold: 4, Gmb: 5, Rmb: 6 } as const;
export type Scheme = (typeof Scheme)[keyof typeof Scheme];

export type FleetOperator = 'citybus' | 'kmb' | 'gmb' | 'rmb' | 'urban-taxi';

/** 规格 L-B1 / L-M1 的比例。 */
export const CITYBUS_SHARE = 0.6;
export const KMB_GOLD_ROUTES: readonly string[] = ['101', '104', '111'];
export const KMB_GOLD_ON_ROUTE = 0.85;
export const BUS_AD_SHARE = 0.35;
export const GMB_SHARE = 0.65;

/** 车身广告配色（sRGB，自拟，不对应任何品牌）：[底色, 图形色]。 */
export const BUS_AD_COLOURS: readonly (readonly [string, string])[] = [
  ['#1f4fb4', '#f2c230'],
  ['#e8e4da', '#d43d2f'],
  ['#202226', '#e03a32'],
  ['#2f9a3e', '#f7e36a'],
  ['#6a3d9a', '#f07ab8'],
  ['#f5f5f2', '#127a80'],
  ['#d8326e', '#ffe36e'],
  ['#0f6e7a', '#e8eef0'],
];

export interface FleetLook {
  scheme: Scheme;
  operator?: FleetOperator;
  /** 路线号（巴士、绿色小巴）。 */
  route?: string;
  /** 显示屏目的地（atlas BUS_DESTS 下标，−1 = 无）；via = 「經」字幕下标。 */
  dest: number;
  via: number;
  /** 路线号格（atlas ROUTE_NUMBERS 下标，−1 = 无）。 */
  routeCell: number;
  /** 车队编号（0 = 不显示）。 */
  fleet: number;
  /** 九巴车型前缀（KMB_CLASSES 下标，−1 = 无）。 */
  fleetClass: number;
  /** 车身广告：0 = 无，否则 0.05–1 的图案种子；word = AD_WORDS 下标（−1 = 无字）。 */
  ad: number;
  word: number;
  adColours: readonly [string, string];
}

/** 车站提示：开场停在某站的车，该站的营运商与路线。 */
export interface StopHint {
  op: string;
  routes: readonly string[];
}

const u01 = (i: number, k: number): number => {
  let h = (i * 2654435761 + k * 40503 + 0x9e3779b1) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const BUS_ROUTES = ROUTES.filter((r) => r.op === 'citybus' || r.op === 'kmb');
const JOINT = new Set(JOINT_ROUTES);

/** 某营运商能挂的路线：本公司的路线 + 对方公司的联营路线（后者权重低）。 */
export function routesFor(op: 'citybus' | 'kmb'): { own: RouteInfo[]; joint: RouteInfo[] } {
  return { own: BUS_ROUTES.filter((r) => r.op === op), joint: BUS_ROUTES.filter((r) => r.op !== op && JOINT.has(r.route)) };
}

const CITYBUS = routesFor('citybus');
const KMB = routesFor('kmb');

/** 城巴 5 位、九巴 4 位车队编号（按下标置换，每车唯一）。 */
export function busFleetNumber(i: number, op: 'citybus' | 'kmb'): number {
  return op === 'citybus' ? 50001 + ((i * 7919 + 1234) % 9999) : 1001 + ((i * 7919 + 77) % 8999);
}

/** 九巴车队编号：车型前缀 + 号码（ATENU 4 位；V6X / E6X 3 位）。车辆下标 < 900（车流上限）内每车唯一。 */
export function kmbFleetCode(i: number): { cls: number; num: number; text: string } {
  const cls = Math.floor(u01(i, 41) * KMB_CLASSES.length);
  const num = cls === 0 ? busFleetNumber(i, 'kmb') : 100 + ((i * 7919 + 77) % 900);
  return { cls, num, text: `${KMB_CLASSES[cls]}${num}` };
}

function busAd(i: number): Pick<FleetLook, 'ad' | 'word' | 'adColours'> {
  if (u01(i, 31) >= BUS_AD_SHARE) return { ad: 0, word: -1, adColours: ['#000000', '#000000'] };
  const pal = BUS_AD_COLOURS[Math.floor(u01(i, 32) * BUS_AD_COLOURS.length)]!;
  const word = u01(i, 33) < 0.5 ? Math.floor(u01(i, 34) * AD_WORDS.length) : -1;
  return { ad: 0.05 + 0.95 * u01(i, 35), word, adColours: pal };
}

/** 第 i 辆双层巴士（hint：开场停靠的车站）。 */
export function busLook(i: number, hint?: StopHint): FleetLook {
  let op: 'citybus' | 'kmb' = u01(i, 1) < CITYBUS_SHARE ? 'citybus' : 'kmb';
  let route: RouteInfo | undefined;
  if (hint) {
    // 该站真实停靠、而且表里有目的地的路线（优先本站营运商）
    const cands = BUS_ROUTES.filter((r) => hint.routes.includes(r.route));
    if (cands.length) {
      route = cands[Math.floor(u01(i, 2) * cands.length)]!;
      op = route.op === 'kmb' ? 'kmb' : 'citybus';
      if (JOINT.has(route.route) && (hint.op === 'kmb' || hint.op === 'citybus')) op = hint.op;
    }
  }
  if (!route) {
    const pool = op === 'citybus' ? CITYBUS : KMB;
    const list = u01(i, 3) < 0.8 || pool.joint.length === 0 ? pool.own : pool.joint;
    route = list[Math.floor(u01(i, 4) * list.length)]!;
  }
  const scheme: Scheme =
    op === 'citybus' ? Scheme.Citybus : KMB_GOLD_ROUTES.includes(route.route) && u01(i, 5) < KMB_GOLD_ON_ROUTE ? Scheme.KmbGold : Scheme.KmbRed;
  const end = u01(i, 6) < 0.5 ? route.a : route.b;
  return {
    scheme,
    operator: op,
    route: route.route,
    dest: busDestIndex(end.zh),
    via: route.via ? busDestIndex(route.via.zh) : -1,
    routeCell: routeIndex(route.route),
    fleet: op === 'kmb' ? kmbFleetCode(i).num : busFleetNumber(i, op),
    fleetClass: op === 'kmb' ? kmbFleetCode(i).cls : -1,
    ...busAd(i),
  };
}

/** 第 i 辆小巴：绿色（路线号 + 目的地）或红色（只有地名）。 */
export function minibusLook(i: number): FleetLook {
  const none = { ad: 0, word: -1, adColours: ['#000000', '#000000'] as const, fleet: 0, fleetClass: -1, via: -1 };
  if (u01(i, 11) < GMB_SHARE) {
    const gmb = ROUTES.filter((r) => r.op === 'gmb');
    const r = gmb[Math.floor(u01(i, 12) * gmb.length)]!;
    const end = u01(i, 13) < 0.5 ? r.a : r.b;
    return { scheme: Scheme.Gmb, operator: 'gmb', route: r.route, dest: busDestIndex(end.zh), routeCell: routeIndex(r.route), ...none };
  }
  const p = RED_MINIBUS_PLACES[Math.floor(u01(i, 14) * RED_MINIBUS_PLACES.length)]!;
  return { scheme: Scheme.Rmb, operator: 'rmb', dest: busDestIndex(p.zh), routeCell: -1, ...none };
}

/** 市区的士。 */
export function taxiLook(): FleetLook {
  return { scheme: Scheme.Taxi, operator: 'urban-taxi', dest: -1, via: -1, routeCell: -1, fleet: 0, fleetClass: -1, ad: 0, word: -1, adColours: ['#000000', '#000000'] };
}

/** 离 (x, y)（模拟米）最近、30 m 内的巴士站（transit-data BUS_STOPS）。 */
export function nearestBusStop(x: number, y: number, maxM = 30): (typeof BUS_STOPS)[number] | null {
  let best: (typeof BUS_STOPS)[number] | null = null;
  let bd = maxM;
  for (const s of BUS_STOPS) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd && s.routes.length > 0) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/**
 * 开场停在站上的巴士 → 该站的营运商与路线（traffic.ts initialDwellers：车道 + 车头停靠位置）。
 * 返回 车辆下标 → 提示。
 */
export function busStopHints(dwellers: readonly { i: number; lane: number; s: number }[], lanes: readonly Lane[]): Map<number, StopHint> {
  const out = new Map<number, StopHint>();
  const pose = { x: 0, y: 0, z: 0, hx: 1, hz: 0 };
  for (const d of dwellers) {
    const lane = lanes[d.lane];
    if (!lane) continue;
    lanePose(lane, d.s, pose);
    const [x, y] = threeToSim(pose.x, pose.y, pose.z);
    const stop = nearestBusStop(x / 10, y / 10);
    if (stop) out.set(d.i, { op: stop.op, routes: stop.routes });
  }
  return out;
}
