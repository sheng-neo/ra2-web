// ===== io/snapshot/index.ts =====（CONTRACTS §V：SnapshotEntry = { snapshotCodec }；由 app/wire.ts 与 testkit 注入 createSim）
import type { SnapshotEntry } from '../../contracts/entrypoints';
import { snapshotCodec } from './codec';

export { snapshotCodec, encodeSnapshot, decodeSnapshot, hashSnapshot, validatePriv, privEncodedSize, utf8Encode, utf8Decode } from './codec';

// 与 contracts/entrypoints.ts 的 SnapshotEntry 对账（类型层）。
({ snapshotCodec }) satisfies SnapshotEntry;
