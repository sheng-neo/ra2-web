// ===== sim/transport/bridge.test.ts =====（WORKPLAN WP6 验收：堤道 / 铁路桥 / 高架电线序列、v1 bridgeOptions 四族、v2 桥型 null、不消费 PRNG、通航）
import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../contracts/grid';
import { BridgeKind } from '../../contracts/net';
import { createTestContext } from '../../testkit';
import { bridgeKindsByLength } from './bridge';
import { flush, lay, setWater } from './fixtures';
import { createTransportSystem } from './index';
import { DEFAULT_TRANSPORT_TUNING } from './tuning';

describe('bridgeOptions / bridgePieces', () => {
  const { ctx } = createTestContext({ systems: [createTransportSystem()] });
  const T = ctx.q.transport;
  it('堤道 n = 1..12 以 0x58 起严格交替；铁路桥 0x5B/0x5A；高架电线 0x5C × n', () => {
    for (let n = 1; n <= 12; n++) {
      const p = T.bridgePieces(BridgeKind.Causeway, 'road', n)!;
      expect(p).toHaveLength(n);
      for (let k = 0; k < n; k++) expect(p[k], `n=${n} k=${k}`).toBe(k % 2 === 0 ? 0x58 : 0x57);
      const r = T.bridgePieces(BridgeKind.Rail, 'rail', n)!;
      for (let k = 0; k < n; k++) expect(r[k]).toBe(k % 2 === 0 ? 0x5b : 0x5a);
      expect(T.bridgePieces(BridgeKind.Wire, 'power', n)).toEqual(new Array<number>(n).fill(0x5c));
    }
    expect(T.bridgePieces(BridgeKind.Causeway, 'road', 40)).toHaveLength(40);
  });
  it('v1 四族 options：road → [Causeway]（任意 n）、rail → [Rail]、power → [Wire]、highway → []；地铁 / 管线 / n ≤ 0 → []', () => {
    for (const n of [1, 4, 5, 6, 7, 12, 13, 50]) {
      expect(T.bridgeOptions('road', n)).toEqual([BridgeKind.Causeway]);
      expect(T.bridgeOptions('rail', n)).toEqual([BridgeKind.Rail]);
      expect(T.bridgeOptions('power', n)).toEqual([BridgeKind.Wire]);
      expect(T.bridgeOptions('highway', n)).toEqual([]);
      expect(T.bridgeOptions('subway', n)).toEqual([]);
      expect(T.bridgeOptions('pipe', n)).toEqual([]);
    }
    expect(T.bridgeOptions('road', 0)).toEqual([]);
    expect(T.bridgeOptions('road', -3)).toEqual([]);
  });
  it('v2 桥型与族不匹配 → null；n ≤ 0 → null', () => {
    expect(T.bridgePieces(BridgeKind.Raising, 'road', 6)).toBeNull();
    expect(T.bridgePieces(BridgeKind.Suspension, 'road', 9)).toBeNull();
    expect(T.bridgePieces(BridgeKind.HighwayLow, 'highway', 4)).toBeNull();
    expect(T.bridgePieces(BridgeKind.HighwayReinforced, 'highway', 4)).toBeNull();
    expect(T.bridgePieces(BridgeKind.Causeway, 'rail', 3)).toBeNull();
    expect(T.bridgePieces(BridgeKind.Rail, 'road', 3)).toBeNull();
    expect(T.bridgePieces(BridgeKind.Wire, 'subway', 3)).toBeNull();
    expect(T.bridgePieces(BridgeKind.Causeway, 'road', 0)).toBeNull();
  });
  it('长度表整表在 tuning：n<5 仅堤道；5–6 +开启桥；7–12 三种；>12 堤道+吊桥；高速两种', () => {
    const t = DEFAULT_TRANSPORT_TUNING;
    expect(bridgeKindsByLength(t, 'road', 4)).toEqual([BridgeKind.Causeway]);
    expect(bridgeKindsByLength(t, 'road', 5)).toEqual([BridgeKind.Causeway, BridgeKind.Raising]);
    expect(bridgeKindsByLength(t, 'road', 6)).toEqual([BridgeKind.Causeway, BridgeKind.Raising]);
    expect(bridgeKindsByLength(t, 'road', 7)).toEqual([BridgeKind.Causeway, BridgeKind.Raising, BridgeKind.Suspension]);
    expect(bridgeKindsByLength(t, 'road', 12)).toEqual([BridgeKind.Causeway, BridgeKind.Raising, BridgeKind.Suspension]);
    expect(bridgeKindsByLength(t, 'road', 13)).toEqual([BridgeKind.Causeway, BridgeKind.Suspension]);
    expect(bridgeKindsByLength(t, 'highway', 2)).toEqual([BridgeKind.HighwayLow, BridgeKind.HighwayReinforced]);
    // 把开启桥列入"已实现"后 options 会列出它，但 pieces 仍无序列（v2）
    const wide = createTestContext({ systems: [createTransportSystem()], tuning: { transport: { implementedBridges: [BridgeKind.Causeway, BridgeKind.Raising] } } });
    expect(wide.ctx.q.transport.bridgeOptions('road', 6)).toEqual([BridgeKind.Causeway, BridgeKind.Raising]);
    expect(wide.ctx.q.transport.bridgeOptions('road', 4)).toEqual([BridgeKind.Causeway]);
    expect(wide.ctx.q.transport.bridgePieces(BridgeKind.Raising, 'road', 6)).toBeNull();
  });
  it('两函数都不改 prng.state()，也不改哈希', () => {
    const { ctx: c2, host } = createTestContext({ systems: [createTransportSystem()] });
    const s = c2.prng.state(), h = host.hash('full');
    for (let n = 0; n < 20; n++) { c2.q.transport.bridgeOptions('road', n); c2.q.transport.bridgePieces(BridgeKind.Causeway, 'road', n); c2.q.transport.bridgePieces(BridgeKind.Rail, 'rail', n); }
    expect(c2.prng.state()).toBe(s); expect(host.hash('full')).toBe(h);
  });
});

describe('bridgeBlocksShips', () => {
  it('堤道段切断航道；铁路桥 / 高架电线 / 加固桥不切断；低架高速段只在水上切断', () => {
    const { ctx, host, state } = createTestContext({ systems: [createTransportSystem()] });
    const T = ctx.q.transport;
    lay(ctx, 10, 10, 0x58); lay(ctx, 11, 10, 0x57); lay(ctx, 12, 10, 0x5b); lay(ctx, 13, 10, 0x5c); lay(ctx, 14, 10, 0x6a); lay(ctx, 15, 10, 0x49); lay(ctx, 16, 10, 0x49);
    flush(host);
    for (let x = 10; x <= 15; x++) setWater(state, x, 10, true);
    expect(T.bridgeBlocksShips(tileIndex(10, 10))).toBe(true);
    expect(T.bridgeBlocksShips(tileIndex(11, 10))).toBe(true);
    expect(T.bridgeBlocksShips(tileIndex(12, 10))).toBe(false);
    expect(T.bridgeBlocksShips(tileIndex(13, 10))).toBe(false);
    expect(T.bridgeBlocksShips(tileIndex(14, 10))).toBe(false);
    expect(T.bridgeBlocksShips(tileIndex(15, 10))).toBe(true);
    expect(T.bridgeBlocksShips(tileIndex(16, 10))).toBe(false);
    expect(T.bridgeBlocksShips(-1)).toBe(false);
  });
});
