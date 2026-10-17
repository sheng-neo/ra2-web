// ===== testkit/hash.ts =====（CONTRACTS §U：hashOf = snapshotCodec.hash，与 wire.ts / createTestContext 同一注入的编解码器）
import type { HashOfFn } from '../contracts/testkit';
import { snapshotCodec } from '../io/snapshot';

export const hashOf: HashOfFn = (state, scope = 'full') => snapshotCodec.hash(state, scope);
