/**
 * 04-roads：Overture road 段 → Road[]（原始路网，不建车道图）。
 *
 * 单行语义（用皇后大道中/荷李活道/雲咸街/花園道的真实数据验证，见 build.test.ts）：
 * access_restrictions 里 access_type='denied' 且 when.heading='backward' 表示禁止逆几何方向行驶
 * → oneway = 1；heading='forward' 被禁 → oneway = -1。只看对私家车生效的规则：
 * 带 mode 时须含 vehicle/motor_vehicle/car；带时段、用途、身份、车型尺寸条件的规则忽略。
 *
 * 桥、隧道、层级、单行、限速可能只覆盖段的一部分（between），此时在区间端点把段切开。
 */
import type { Road, RoadClass, SourceRef } from '@central/data';
import { shortId } from '../geo/hash';
import { clipAndSimplify, slicePolyline, type Rect } from '../geo/polyline';
import { blacklistHit, buildingLikeName } from '../redlines';
import { linesOf, type Between, type OvtSegment, type OvtWhen } from '../sources/overture';
import { REF_OSM, REF_TOMTOM } from '../sources/refs';
import { projectCoords } from './project';

const SIMPLIFY_DM = 3;

const CLASS_MAP: Record<string, RoadClass> = {
  motorway: 'motorway',
  trunk: 'trunk',
  primary: 'primary',
  secondary: 'secondary',
  tertiary: 'tertiary',
  residential: 'residential',
  unclassified: 'unclassified',
  living_street: 'living_street',
  service: 'service',
  pedestrian: 'pedestrian',
  footway: 'footway',
  steps: 'steps',
  path: 'path',
  track: 'path',
  bridleway: 'path',
  cycleway: 'cycleway',
  unknown: 'unknown',
};

/** 源数据没有车道数，按等级给默认值；行人类为 0。 */
const DEFAULT_LANES: Record<RoadClass, number> = {
  motorway: 3,
  trunk: 3,
  primary: 2,
  secondary: 2,
  tertiary: 2,
  residential: 1,
  unclassified: 1,
  living_street: 1,
  service: 1,
  unknown: 1,
  pedestrian: 0,
  footway: 0,
  steps: 0,
  path: 0,
  cycleway: 0,
};

const CAR_MODES = new Set(['vehicle', 'motor_vehicle', 'car']);

const PEDESTRIAN: ReadonlySet<RoadClass> = new Set(['pedestrian', 'footway', 'steps', 'path', 'cycleway']);

/** Overture 路段 sources[].dataset → 署名。出现未登记的数据集就报错，先补署名再发布。 */
const ROAD_DATASETS: Readonly<Record<string, SourceRef>> = { OpenStreetMap: REF_OSM, TomTom: REF_TOMTOM };

function covers(between: Between, m: number): boolean {
  return !between || (m >= between[0]! && m <= between[1]!);
}

/** 规则是否对普通私家车无条件生效（不含时段/用途/身份/尺寸条件）。 */
function appliesToCars(w: OvtWhen): boolean {
  if (w.during || w.using?.length || w.recognized?.length || w.vehicle?.length) return false;
  return !w.mode?.length || w.mode.some((m) => CAR_MODES.has(m));
}

/** 位置 m（0–1）处的通行方向。 */
export function onewayAt(seg: OvtSegment, m: number): 0 | 1 | -1 {
  let fwdDenied = false;
  let bwdDenied = false;
  for (const a of seg.access_restrictions ?? []) {
    const w = a.when;
    if (a.access_type !== 'denied' || !w?.heading || !appliesToCars(w) || !covers(a.between, m)) continue;
    if (w.heading === 'forward') fwdDenied = true;
    else if (w.heading === 'backward') bwdDenied = true;
  }
  if (fwdDenied === bwdDenied) return 0;
  return bwdDenied ? 1 : -1;
}

function flagAt(seg: OvtSegment, flag: string, m: number): boolean {
  return (seg.road_flags ?? []).some((f) => covers(f.between, m) && (f.values ?? []).includes(flag));
}

function levelAt(seg: OvtSegment, m: number): number {
  const rule = (seg.level_rules ?? []).find((r) => covers(r.between, m) && r.value != null);
  return rule?.value ?? 0;
}

function speedAt(seg: OvtSegment, m: number): number | undefined {
  const rule = (seg.speed_limits ?? []).find((s) => !s.when && covers(s.between, m) && s.max_speed?.value);
  const v = rule?.max_speed;
  if (!v?.value) return undefined;
  return v.unit === 'mph' ? Math.round(v.value * 1.609344) : v.value;
}

/** 所有影响上述属性的区间端点（含 0 和 1），升序去重。 */
function breakpoints(seg: OvtSegment): number[] {
  const set = new Set<number>([0, 1]);
  const add = (b: Between): void => {
    if (!b) return;
    for (const v of b) if (v > 0 && v < 1) set.add(v);
  };
  for (const f of seg.road_flags ?? []) add(f.between);
  for (const l of seg.level_rules ?? []) add(l.between);
  for (const a of seg.access_restrictions ?? []) if (a.when?.heading) add(a.between);
  for (const s of seg.speed_limits ?? []) add(s.between);
  return [...set].sort((a, b) => a - b);
}

const CJK = /[㐀-鿿豈-﫿]/;

/**
 * 街道名：优先 names.common 的 zh / en，否则把「中文 English」形式的 primary 拆开。
 * 命中红线词则整名丢弃；行人通道（天桥、连廊常借楼名命名）的名称像楼宇名时也丢弃。
 */
export function roadName(seg: OvtSegment): { zh?: string; en?: string } | undefined {
  const common = seg.names?.common ?? {};
  let zh = common['zh-Hant'] ?? common.zh;
  let en = common.en;
  const primary = seg.names?.primary?.trim();
  if (primary && (!zh || !en)) {
    const m = /^([^A-Za-z]*[㐀-鿿][^A-Za-z]*?)\s+([A-Za-z].*)$/.exec(primary);
    if (m) {
      zh ??= m[1]!.trim();
      en ??= m[2]!.trim();
    } else if (CJK.test(primary)) zh ??= primary;
    else en ??= primary;
  }
  if (!zh && !en) return undefined;
  const rejected = (s: string | undefined): boolean =>
    !!s && (!!blacklistHit(s) || (PEDESTRIAN.has(CLASS_MAP[seg.class ?? 'unknown'] ?? 'unknown') && buildingLikeName(s)));
  if (rejected(zh) || rejected(en)) return undefined;
  const name: { zh?: string; en?: string } = {};
  if (zh) name.zh = zh;
  if (en) name.en = en;
  return name;
}

interface SpanAttr {
  oneway: 0 | 1 | -1;
  bridge: boolean;
  tunnel: boolean;
  level: number;
  speed: number | undefined;
}

/** 按属性区间切分段（0–1 比例）；相邻区间属性相同就合并，只在属性真正变化处切开。 */
function spansOf(seg: OvtSegment): { f0: number; f1: number; a: SpanAttr }[] {
  const bps = breakpoints(seg);
  const spans: { f0: number; f1: number; a: SpanAttr }[] = [];
  for (let i = 1; i < bps.length; i++) {
    const m = (bps[i - 1]! + bps[i]!) / 2;
    const a: SpanAttr = {
      oneway: onewayAt(seg, m),
      bridge: flagAt(seg, 'is_bridge', m),
      tunnel: flagAt(seg, 'is_tunnel', m),
      level: levelAt(seg, m),
      speed: speedAt(seg, m),
    };
    const last = spans[spans.length - 1];
    if (last && JSON.stringify(last.a) === JSON.stringify(a)) last.f1 = bps[i]!;
    else spans.push({ f0: bps[i - 1]!, f1: bps[i]!, a });
  }
  return spans;
}

/** 一个 Overture 段 → 0..n 条 Road（按属性区间切开、裁到 extent、简化）。 */
export function segmentToRoads(seg: OvtSegment, extent: Rect): Road[] {
  const cls = CLASS_MAP[seg.class ?? 'unknown'] ?? 'unknown';
  const name = roadName(seg);
  const spans = spansOf(seg);
  const roads: Road[] = [];
  let k = 0;
  for (const coords of linesOf(seg.geometry)) {
    const pts = projectCoords(coords);
    for (const { f0, f1, a } of spans) {
      const sub = f0 === 0 && f1 === 1 ? pts : slicePolyline(pts, f0, f1);
      for (const piece of clipAndSimplify(sub, extent, SIMPLIFY_DM)) {
        const road: Road = {
          id: shortId(`seg:${seg.id}:${k++}`),
          cls,
          pts: piece,
          oneway: a.oneway,
          lanes: DEFAULT_LANES[cls],
        };
        if (a.bridge) road.bridge = true;
        if (a.tunnel) road.tunnel = true;
        if (a.level !== 0) road.level = a.level;
        if (a.speed !== undefined) road.speedKmh = a.speed;
        if (name) road.name = { ...name };
        roads.push(road);
      }
    }
  }
  return roads;
}

/** 路段的署名（按 sources[].dataset）。许可不是 ODbL-1.0 或数据集未登记时报错。 */
function segmentRefs(seg: OvtSegment): SourceRef[] {
  return (seg.sources ?? []).map((s) => {
    const ref = s.dataset ? ROAD_DATASETS[s.dataset] : undefined;
    if (!ref || s.license !== ref.license) {
      throw new Error(`路段 ${seg.id} 的来源 ${String(s.dataset)}（${String(s.license)}）未登记署名`);
    }
    return ref;
  });
}

/** 道路与实际用到的署名（只列确有路段进入产物的数据集，按 id 排序）。 */
export function buildRoads(segments: readonly OvtSegment[], extent: Rect): { roads: Road[]; refs: SourceRef[] } {
  const refs = new Map<string, SourceRef>();
  const roads = segments
    .filter((s) => s.subtype === 'road')
    .flatMap((s) => {
      const out = segmentToRoads(s, extent);
      if (out.length > 0) for (const ref of segmentRefs(s)) refs.set(ref.id, ref);
      return out;
    });
  roads.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 1; i < roads.length; i++) {
    if (roads[i]!.id === roads[i - 1]!.id) throw new Error(`道路 ID 碰撞：${roads[i]!.id}`);
  }
  return { roads, refs: [...refs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
}
