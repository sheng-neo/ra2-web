// ===== sim/events/priv.ts =====（ARCHITECTURE §3.3；spec:disasters §2.5.1 marker 层、§3.1 DisasterState / NewsState）
// events 的持久私有态：只放不可由真源层重建的运行态——灾害标记 marker / 燃料 fuel、灾害计时器、灾害物件与调度单位、报纸故事池。
// 运行缓存（绑定的 ctx、物件视图）放在系统闭包（runtime.ts），postLoad 重建。
import { TILES } from '../../contracts/grid';
import type { PrivState } from '../../contracts/state';

export const PRIV_VERSION = 1;

/** 灾害主物件类型（priv 内部编号；对外经 things() 映射为 ActorId）。 */
export const enum ActorKind { Tornado = 1, Monster = 2 }
/** 调度单位类型 = DispatchKind（0 警 1 消；军队 v2）。 */
export const enum UnitKind { Police = 0, Fire = 1 }
/** 洪水阶段（spec §2.6.2）。 */
export const enum FloodPhase { None = 0, Grow = 1, Hold = 2, Recede = 3 }

/** 龙卷风 / 怪兽：flag 对怪兽 = 已到达城市中心（之后纯随机游走）。类型别名（非 interface）以便隐式索引签名满足 PrivValue。 */
export type ActorRec = { kind: number; x: number; y: number; dir: number; life: number; flag: number };
export type UnitRec = { kind: number; x: number; y: number; order: number };
export type StoryRec = { type: number; value: number; score: number; day: number };
export type PaperRec = { year: number; month: number; extra: boolean; headline: StoryRec[]; stories: StoryRec[]; heat: number; wind: number; humid: number; trend: number; season: number };

export interface EventsPriv extends PrivState {
  v: number;
  marker: Uint8Array;            // 16384，TileMarker；运行时唯一的灾害标记来源
  fuel: Uint8Array;              // 16384，marker[i]==Fire 时有效
  idleTicks: number; deaths: number; destroyedTiles: number;
  pendingAt: number;             // requestDisaster 指定的原点格索引（−1 = 由系统选择）
  quakeShake: number; quakeMag10: number;
  floodPhase: number; floodTicks: number; floodAlt: number; floodMax: number; floodOx: number; floodOy: number;
  actors: ActorRec[];            // 灾害主物件（v1：至多 1 个龙卷风或怪兽）
  units: UnitRec[]; unitSeq: number;
  pool: StoryRec[];              // 报纸故事池
  lastIssued: Int32Array;        // 67，上次入池日（−1 = 从未）
  paper: PaperRec[];             // 0 或 1 份：最近一次组版
}

export function createEventsPriv(): EventsPriv {
  return {
    v: PRIV_VERSION,
    marker: new Uint8Array(TILES), fuel: new Uint8Array(TILES),
    idleTicks: 0, deaths: 0, destroyedTiles: 0, pendingAt: -1,
    quakeShake: 0, quakeMag10: 0,
    floodPhase: FloodPhase.None, floodTicks: 0, floodAlt: 0, floodMax: 0, floodOx: 0, floodOy: 0,
    actors: [], units: [], unitSeq: 0,
    pool: [], lastIssued: new Int32Array(67).fill(-1), paper: [],
  };
}

/** 形状校验（快照解码后 / 版本迁移前）：版本号与两张 16384 位图必须在场；其余字段缺失由 normalize 补默认。 */
export function isEventsPriv(p: unknown): p is EventsPriv {
  if (p === null || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return o.v === PRIV_VERSION && o.marker instanceof Uint8Array && o.marker.length === TILES && o.fuel instanceof Uint8Array && o.fuel.length === TILES;
}

/** 补齐缺失字段（旧快照 / 手工夹具），不改已有值。 */
export function normalizeEventsPriv(p: EventsPriv): EventsPriv {
  const d = createEventsPriv();
  for (const k of Object.keys(d) as (keyof EventsPriv)[]) if (p[k] === undefined) (p as Record<string, unknown>)[k] = d[k];
  if (!(p.lastIssued instanceof Int32Array) || p.lastIssued.length !== 67) p.lastIssued = d.lastIssued;
  return p;
}
