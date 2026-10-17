// ===== sim/zones/priv.ts =====
// zones 的持久私有态（spec:zones §3.1 LotState 中不可由 XBLD/XZON 重建的部分）：按 TL 锚点格索引的列式 TypedArray。
// 可由真源层推断的列（size / level / tier / phase / zone）不入 priv，运行时由 lots.ts 按 XBLD 查表给出；
// 这样 priv 大小恒定（≈ 98 KB < PRIV_BUDGET_BYTES.zones = 128 KB），且不会出现"孤儿 LotState"——锚点不存在即无 lot。
import type { CityState, PrivState } from '../../contracts/state';
import { TILES } from '../../contracts/grid';
import type { Diagnostic } from '../../contracts/system';

export const ZONES_PRIV_VERSION = 1;
/** 市民诉求键（SimEvent citizenDemand.key，与 strings 的 complaint.* 键一致）；reqYear 按此下标记录上次提示年份。 */
export const REQUEST_KEYS = [
  'complaint.park', 'complaint.zoo', 'complaint.stadium', 'complaint.marina',
  'complaint.airport', 'complaint.seaport', 'complaint.connection',
  'complaint.school', 'complaint.fire', 'complaint.hospital', 'complaint.road'] as const;
export type RequestKey = (typeof REQUEST_KEYS)[number];

export interface ZonesPriv extends PrivState {
  v: number;
  /** 进入当前 phase 的天数（施工 / 已建 / 废弃）。 */
  phaseDays: Uint16Array;
  /** 已建建筑自身 POWERED 为假的连续天数（饱和 255）。 */
  unpoweredDays: Uint8Array;
  /** 连续出行失败的月访问次数（饱和 255）。 */
  tripFailMonths: Uint8Array;
  /** 连续地价档低于建筑档的月访问次数。 */
  tierMismatchMonths: Uint8Array;
  /** 施工目标建筑 ID（startConstruction 时用 PRNG 预掷；finishConstruction 不消费 PRNG）。 */
  pendingId: Uint8Array;
  /** 每种市民诉求上次提示的年份（−1 = 从未）。 */
  reqYear: Int32Array;
}

export function createZonesPriv(): ZonesPriv {
  return {
    v: ZONES_PRIV_VERSION,
    phaseDays: new Uint16Array(TILES), unpoweredDays: new Uint8Array(TILES), tripFailMonths: new Uint8Array(TILES),
    tierMismatchMonths: new Uint8Array(TILES), pendingId: new Uint8Array(TILES),
    reqYear: new Int32Array(REQUEST_KEYS.length).fill(-1),
  };
}

const isU8 = (v: unknown): v is Uint8Array => v instanceof Uint8Array && v.length === TILES;
/** 形状校验：版本与各列类型 / 长度。 */
export function isValidZonesPriv(p: unknown): p is ZonesPriv {
  if (p === null || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return o.v === ZONES_PRIV_VERSION
    && o.phaseDays instanceof Uint16Array && o.phaseDays.length === TILES
    && isU8(o.unpoweredDays) && isU8(o.tripFailMonths) && isU8(o.tierMismatchMonths) && isU8(o.pendingId)
    && o.reqYear instanceof Int32Array && o.reqYear.length === REQUEST_KEYS.length;
}

/** 读取 state.priv.zones；缺失 / 版本不符 / 形状不对时重建（计时器归 0）并写回，可选记 diag。 */
export function ensureZonesPriv(state: CityState, diag?: Diagnostic[]): ZonesPriv {
  const cur = state.priv.zones;
  if (isValidZonesPriv(cur)) return cur;
  if (cur !== undefined && diag) diag.push({ level: 'warn', code: 'zones.privReset', message: `priv.zones 版本 / 形状不符（v=${String((cur as PrivState).v)}），已重建，计时器归 0` });
  const fresh = createZonesPriv();
  state.priv.zones = fresh;
  return fresh;
}

/** 清空一格的全部 lot 列（吞并 / 瓦砾 / 外部拆除后的孤儿清理）。 */
export function clearLotColumns(p: ZonesPriv, i: number): void {
  p.phaseDays[i] = 0; p.unpoweredDays[i] = 0; p.tripFailMonths[i] = 0; p.tierMismatchMonths[i] = 0; p.pendingId[i] = 0;
}
