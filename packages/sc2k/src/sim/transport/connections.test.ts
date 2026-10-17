// ===== sim/transport/connections.test.ts =====（WORKPLAN WP6 验收：边缘直线才算、高速两格一条、读档重算、0xFA 写入后重算、陈旧标记清理）
import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../contracts/grid';
import { MISC } from '../../contracts/io';
import { NET_BASE } from '../../contracts/net';
import { createTestContext } from '../../testkit';
import { flush, lay, layLine } from './fixtures';
import { createTransportSystem } from './index';

const mk = (profile: 'optimistic' | 'pessimistic' = 'optimistic') => createTestContext({ profile, systems: [createTransportSystem()] });
const mark = (state: { layers: { xtxt: Uint8Array } }, x: number, y: number, on = true): void => { state.layers.xtxt[tileIndex(x, y)] = on ? 0xfa : 0; };

describe.each(['optimistic', 'pessimistic'] as const)('connections（%s 桩）', (profile) => {
  it('只有带 0xFA 且轴向垂直于地图边的直线片段才算；平行 / 转弯 / 无标记不算；坡面件与交叉件按其轴', () => {
    const { ctx, host, state } = mk(profile);
    const T = ctx.q.transport;
    layLine(ctx, 'road', 10, 0, 10, 5); flush(host);                         // T 边 (10,0)：道路 TB 直线
    expect(T.connections()).toEqual({ commerce: 0, industry: 0, total: 0 }); // 未接受连接（无 0xFA）
    mark(state, 10, 0); flush(host);
    expect(T.connections()).toEqual({ commerce: 1, industry: 0, total: 1 });
    lay(ctx, 12, 0, NET_BASE.road + 0); mark(state, 12, 0); flush(host);     // 沿边平行铺设
    lay(ctx, 14, 0, NET_BASE.road + 6); mark(state, 14, 0);                  // 转弯
    lay(ctx, 16, 0, NET_BASE.road + 2); mark(state, 16, 0);                  // 坡面 HT-B（TB 轴）
    lay(ctx, 18, 0, 0x44); mark(state, 18, 0);                               // 电线 LR × 道路 TB
    lay(ctx, 20, 0, 0x45); mark(state, 20, 0);                               // 道路 LR × 铁路 TB → 铁路连接
    lay(ctx, 0, 30, NET_BASE.rail + 0); mark(state, 0, 30);                  // L 边：铁路 LR 直线
    lay(ctx, 0, 32, 0x3c); mark(state, 0, 32);                               // 半高件 L-HR（LR 轴）
    lay(ctx, 127, 40, NET_BASE.rail + 1); mark(state, 127, 40);              // R 边：铁路 TB 平行 → 不算
    lay(ctx, 50, 127, 0x1d + 1); mark(state, 50, 127);                       // B 边：道路 TB
    flush(host);
    expect(T.connections()).toEqual({ commerce: 4, industry: 3, total: 7 });
  });
  it('高速两格宽合并为一条（industry +1，total +2）；三格 = 两条', () => {
    const { ctx, host, state } = mk(profile);
    const T = ctx.q.transport;
    lay(ctx, 60, 0, 0x4a); lay(ctx, 61, 0, 0x4a); mark(state, 60, 0); mark(state, 61, 0); flush(host);
    expect(T.connections()).toEqual({ commerce: 0, industry: 1, total: 2 });
    lay(ctx, 62, 0, 0x4a); mark(state, 62, 0); flush(host);
    expect(T.connections()).toEqual({ commerce: 0, industry: 2, total: 3 });
    lay(ctx, 127, 70, 0x49); lay(ctx, 127, 71, 0x4d); mark(state, 127, 70); mark(state, 127, 71); flush(host);   // R 边：高速 LR 段 + 高速 LR × 铁路 TB
    expect(T.connections()).toEqual({ commerce: 0, industry: 3, total: 5 });
    lay(ctx, 127, 74, 0x4a); mark(state, 127, 74); flush(host);             // 高速 TB 段沿 R 边平行 → 不算
    expect(T.connections().total).toBe(5);
  });
  it('XTXT 0xFA 写入 / 拆除后重算；拆掉网络格时清理陈旧 0xFA 并 layerChanged(xtxt)', () => {
    const { ctx, host, state } = mk(profile);
    const T = ctx.q.transport;
    layLine(ctx, 'road', 0, 20, 4, 20); flush(host);
    mark(state, 0, 20); ctx.act.layerChanged('xtxt');
    expect(T.connections()).toEqual({ commerce: 1, industry: 0, total: 1 }); // 无需等待扇出
    host.dirty.take();
    lay(ctx, 0, 20, 0); flush(host);                                          // 推平边缘格
    expect(state.layers.xtxt[tileIndex(0, 20)]).toBe(0);
    expect(host.dirty.take().bulk.xtxt).toBe(true);
    expect(T.connections().total).toBe(0);
    lay(ctx, 0, 20, NET_BASE.road + 10); mark(state, 0, 20); flush(host);     // 变成三岔：不计数但保留标记（仍是网络格）
    expect(T.connections().total).toBe(0);
    expect(state.layers.xtxt[tileIndex(0, 20)]).toBe(0xfa);
  });
  it('读档重算：快照往返一致；exportSc2 写 MISC 0x1024 / 0x0FE8；importSc2 清掉不在网络格上的 0xFA', () => {
    const { ctx, host, state } = mk(profile);
    layLine(ctx, 'road', 100, 0, 100, 3); mark(state, 100, 0);
    lay(ctx, 0, 100, NET_BASE.rail); mark(state, 0, 100);
    ctx.act.setXund(tileIndex(5, 5), NET_BASE.subway); ctx.act.setXund(tileIndex(5, 6), 0x1f); ctx.act.setXund(tileIndex(5, 7), NET_BASE.pipe);
    flush(host);
    const before = ctx.q.transport.connections();
    expect(before).toEqual({ commerce: 1, industry: 1, total: 2 });
    const other = mk(profile);
    other.host.loadSnapshot(host.saveSnapshot());
    expect(other.ctx.q.transport.connections()).toEqual(before);
    const doc = host.exportSc2();
    expect(doc.misc[MISC.connectionTiles >> 2]).toBe(2);
    expect(doc.misc[MISC.subwayCount >> 2]).toBe(2);
    doc.xtxt[tileIndex(77, 77)] = 0xfa;                                       // 非网络格上的陈旧标记
    const third = mk(profile);
    const diag = third.host.importSc2(doc);
    expect(third.state.layers.xtxt[tileIndex(77, 77)]).toBe(0);
    expect(third.state.layers.xtxt[tileIndex(100, 0)]).toBe(0xfa);
    expect(diag.some((d) => d.code === 'transport.staleConnectionMark')).toBe(true);
    expect(third.ctx.q.transport.connections()).toEqual(before);
  });
});
