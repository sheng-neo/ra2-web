// ===== sim/transport/bridge.ts =====（spec:transport §2.6 桥梁；WORKPLAN WP6 桥 v1 子集）
// bridgeOptions / bridgePieces 为纯函数（不消费 PRNG、不读层）：道路长度表（n<5 仅堤道；5–6 +开启桥；7–12 三种；>12 堤道+吊桥）整表落 tuning，
// 再按"已实现集合"过滤；v1 只有堤道（0x58/0x57 交替，以桥面起）、铁路桥（0x5B/0x5A 交替）、高架电线（0x5C × n）。
// 片段序列沿行进方向给出；翻转位（XBit.Flipped，行进轴 L–R 时置位）由 placement 按行进轴写（model.BRIDGE_UNFLIPPED_AXIS = T–B）。
import { BridgeKind, isBridge, isHighway } from '../../contracts/net';
import type { NetFamily } from '../../contracts/net';
import type { TransportTuning } from './tuning';

const EMPTY: readonly BridgeKind[] = Object.freeze([]);

/** 长度表允许的全部桥型（未过滤"已实现"）。 */
export function bridgeKindsByLength(tune: TransportTuning, family: NetFamily | 'highway', n: number): readonly BridgeKind[] {
  if (n <= 0) return EMPTY;
  switch (family) {
    case 'road': {
      const out: BridgeKind[] = [BridgeKind.Causeway];
      if (n >= tune.raisingBridgeLen.min && n <= tune.raisingBridgeLen.max) out.push(BridgeKind.Raising);
      if (n >= tune.suspensionMinLen) out.push(BridgeKind.Suspension);
      return out;
    }
    case 'rail': return [BridgeKind.Rail];
    case 'power': return [BridgeKind.Wire];
    case 'highway': return [BridgeKind.HighwayLow, BridgeKind.HighwayReinforced];
    default: return EMPTY;                                   // 地铁 / 管线没有桥
  }
}
/** TransportQuery.bridgeOptions = 长度表允许 ∩ 已实现。 */
export function bridgeOptions(tune: TransportTuning, family: NetFamily | 'highway', n: number): readonly BridgeKind[] {
  const allowed = bridgeKindsByLength(tune, family, n);
  if (allowed.length === 0) return EMPTY;
  const out = allowed.filter((k) => tune.implementedBridges.includes(k));
  return out.length === 0 ? EMPTY : out;
}
/** TransportQuery.bridgePieces：kind 必须在该族该长度的 options 内，否则 null（含 v2 桥型与族不匹配的桥型）。 */
export function bridgePieces(tune: TransportTuning, kind: BridgeKind, family: NetFamily | 'highway', n: number): readonly number[] | null {
  if (n <= 0 || !bridgeOptions(tune, family, n).includes(kind)) return null;
  const out = new Array<number>(n);
  switch (kind) {
    case BridgeKind.Causeway: for (let k = 0; k < n; k++) out[k] = k % 2 === 0 ? 0x58 : 0x57; return out;
    case BridgeKind.Rail: for (let k = 0; k < n; k++) out[k] = k % 2 === 0 ? 0x5b : 0x5a; return out;
    case BridgeKind.Wire: out.fill(0x5c); return out;
    default: return null;
  }
}
/** 通航：堤道（0x57 / 0x58）与落在水块上的低架高速段切断航道；吊桥 / 开启桥 / 铁路桥 / 加固桥 / 高架电线不切断（§2.6）。 */
export function bridgeBlocksShips(id: number, onWater: boolean): boolean {
  if (id === 0x57 || id === 0x58) return true;
  if (isHighway(id) && !isBridge(id) && onWater) return true;
  return false;
}
