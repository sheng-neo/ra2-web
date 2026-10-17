import { describe, expect, it } from 'vitest';
import { COMMAND_OWNER } from '../../contracts/commands';
import { tileIndex } from '../../contracts/grid';
import { createTestContext } from '../../testkit';
import { createServicesSystem } from './index';
import { Xbld } from './tables';
import { build, flush } from './testFixtures';
import { readLabel, utf8Decode, utf8Encode, writeLabel } from './xlab';

describe('services.commands：sign / rename', () => {
  it('commands 键集合恰为 COMMAND_OWNER 归 services 者', () => {
    const own = Object.entries(COMMAND_OWNER).filter(([, o]) => o === 'services').map(([k]) => k).sort();
    expect(Object.keys(createServicesSystem().commands!).sort()).toEqual(own);
  });

  it('sign：写 XTXT 0x01.. 与 XLAB；更新同格只改文本；null / 空删除并回收标签；bulk xtxt 脏；写入命令日志', () => {
    const { host, state } = createTestContext({ systems: [createServicesSystem()] });
    const L = state.layers;
    const a = tileIndex(10, 10), b = tileIndex(20, 20);
    host.dirty.take();
    expect(host.dispatch({ type: 'sign', at: a, text: 'Old Mill Road' })).toEqual({ ok: true, cost: 0, changed: [a] });
    expect(L.xtxt[a]).toBe(1);
    expect(readLabel(L.xlab, 1)).toBe('Old Mill Road');
    expect(host.dirty.take().bulk.xtxt).toBe(true);
    expect(host.dispatch({ type: 'sign', at: b, text: 'Quarry Gate' }).ok).toBe(true);
    expect(L.xtxt[b]).toBe(2);
    expect(host.dispatch({ type: 'sign', at: a, text: 'New Mill Road' }).ok).toBe(true);
    expect(L.xtxt[a]).toBe(1);
    expect(readLabel(L.xlab, 1)).toBe('New Mill Road');
    expect(host.dispatch({ type: 'sign', at: a, text: null })).toEqual({ ok: true, cost: 0, changed: [a] });
    expect(L.xtxt[a]).toBe(0);
    expect(readLabel(L.xlab, 1)).toBe('');
    expect(host.dispatch({ type: 'sign', at: a, text: null })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(host.dispatch({ type: 'sign', at: tileIndex(30, 30), text: '  ' })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(host.dispatch({ type: 'sign', at: tileIndex(30, 30), text: 'Third' }).ok).toBe(true);
    expect(L.xtxt[tileIndex(30, 30)]).toBe(1);                 // 回收的标签 1 先被复用
    expect(host.commandLog().filter((c) => c.cmd.type === 'sign')).toHaveLength(5);
  });

  it('sign：上限 50 个 → limit；微模拟标签格 → occupied；越界 → outOfBounds', () => {
    const { ctx, host, state } = createTestContext({ systems: [createServicesSystem()] });
    for (let k = 0; k < 50; k++) expect(host.dispatch({ type: 'sign', at: tileIndex(k, 0), text: `S${k}` }).ok).toBe(true);
    expect(state.layers.xtxt[tileIndex(49, 0)]).toBe(0x32);
    expect(host.dispatch({ type: 'sign', at: tileIndex(50, 0), text: 'one more' })).toMatchObject({ ok: false, reason: 'limit' });
    expect(host.dispatch({ type: 'sign', at: tileIndex(3, 0), text: 'edit existing' }).ok).toBe(true);
    expect(host.dispatch({ type: 'sign', at: tileIndex(0, 0), text: null }).ok).toBe(true);
    expect(host.dispatch({ type: 'sign', at: tileIndex(50, 0), text: 'now fits' }).ok).toBe(true);
    expect(state.layers.xtxt[tileIndex(50, 0)]).toBe(1);
    ctx.act.allocMicrosim(Xbld.Hospital); build(ctx, Xbld.Hospital, 60, 60); flush(host);
    expect(host.dispatch({ type: 'sign', at: tileIndex(61, 61), text: 'no' })).toMatchObject({ ok: false, reason: 'occupied' });
    expect(host.dispatch({ type: 'sign', at: 16384, text: 'no' })).toMatchObject({ ok: false, reason: 'outOfBounds' });
    expect(host.dispatch({ type: 'sign', at: -1, text: 'no' })).toMatchObject({ ok: false, reason: 'outOfBounds' });
  });

  it('rename：独占记录 / 共享记录可改名；空槽 / 越界 → noTarget', () => {
    const { ctx, host, state } = createTestContext({ systems: [createServicesSystem()] });
    expect(host.dispatch({ type: 'rename', slot: 10, text: 'x' })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(host.dispatch({ type: 'rename', slot: 0, text: 'x' })).toMatchObject({ ok: false, reason: 'noTarget' });
    expect(host.dispatch({ type: 'rename', slot: 150, text: 'x' })).toMatchObject({ ok: false, reason: 'noTarget' });
    const slot = ctx.act.allocMicrosim(Xbld.Fire);
    expect(host.dispatch({ type: 'rename', slot, text: ' Station Seven ' }).ok).toBe(true);
    expect(readLabel(state.layers.xlab, 0x33 + slot)).toBe('Station Seven');
    expect(host.dispatch({ type: 'rename', slot: 8, text: 'City Libraries' }).ok).toBe(true);
    expect(readLabel(state.layers.xlab, 0x33 + 8)).toBe('City Libraries');
  });

  it('XLAB 编解码：UTF-8 ≤ 23 B 且不切码点；len 前缀；垃圾填充按 len 与 0x00 截断', () => {
    const xlab = new Uint8Array(6400);
    writeLabel(xlab, 5, '湖畔警察局第七分局总部');          // 11 个汉字 = 33 B → 截到 7 个（21 B）
    expect(xlab[5 * 25]).toBe(21);
    expect(readLabel(xlab, 5)).toBe('湖畔警察局第七');
    writeLabel(xlab, 6, 'abcdefghijklmnopqrstuvwxyz');
    expect(readLabel(xlab, 6)).toBe('abcdefghijklmnopqrstuvw');
    xlab.fill(0xee, 7 * 25, 8 * 25); xlab[7 * 25] = 3; xlab[7 * 25 + 1] = 0x41; xlab[7 * 25 + 2] = 0x42; xlab[7 * 25 + 3] = 0;
    expect(readLabel(xlab, 7)).toBe('AB');
    expect(utf8Decode(new Uint8Array(utf8Encode('héllo €', 99)), 0, 10)).toBe('héllo €');
    expect(utf8Decode(new Uint8Array([0xff, 0x41]), 0, 2)).toBe('�A');
  });
});
