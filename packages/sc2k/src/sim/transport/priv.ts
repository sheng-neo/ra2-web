// ===== sim/transport/priv.ts =====（spec:transport §2.9 乘客计数；ARCHITECTURE §3.4 priv 只放不可重建者）
// transport 的持久私有态只有三个城市级乘客累计（公交 / 铁路 / 地铁；成功出行按 popLevel 累加）。
// net / conn / stationOf / 可达缓存 / 连接计数全部可由真源层重建，放闭包（runtime.ts），不进 priv。
import type { CityState, PrivState } from '../../contracts/state';

export const TRANSPORT_PRIV_VERSION = 1;
export interface TransportPriv extends PrivState { v: number; bus: number; rail: number; subway: number }

export const freshPriv = (): TransportPriv => ({ v: TRANSPORT_PRIV_VERSION, bus: 0, rail: 0, subway: 0 });

const asInt = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);

/** 读档后：版本不符 / 缺失 / 类型异常 → 重建为全零（乘客累计是统计量，丢失不影响模拟）。 */
export function migratePriv(state: CityState): TransportPriv {
  const p = state.priv.transport as Partial<TransportPriv> | undefined;
  if (!p || p.v !== TRANSPORT_PRIV_VERSION) { const f = freshPriv(); state.priv.transport = f; return f; }
  const fixed: TransportPriv = { v: TRANSPORT_PRIV_VERSION, bus: asInt(p.bus), rail: asInt(p.rail), subway: asInt(p.subway) };
  state.priv.transport = fixed;
  return fixed;
}
export function privOf(state: CityState): TransportPriv {
  const p = state.priv.transport as TransportPriv | undefined;
  return p && p.v === TRANSPORT_PRIV_VERSION ? p : migratePriv(state);
}
