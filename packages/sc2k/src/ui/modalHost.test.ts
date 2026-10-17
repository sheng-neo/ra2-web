// @vitest-environment happy-dom
// ===== ui/modalHost.test.ts =====（WORKPLAN WP12 验收：两条路径的 modalOpened/Closed 计数；挂起型模态关闭后时钟恢复）
import { describe, expect, it, vi } from 'vitest';
import type { SimHost } from '../contracts/host';
import type { ModalId } from '../contracts/commands';
import { MODAL_OWNER } from '../contracts/commands';
import { createStrings } from '../data';
import { createTestContext } from '../testkit';
import { createModalHost, PHASE_MODALS, RESULT_MODALS, describePayload } from './modalHost';
import type { ModalFactories, WindowDeps } from './windowTypes';
import { h } from './dom';

const strings = createStrings('zh');
function fakeHost(): Pick<SimHost, 'dispatch' | 'modalOpened' | 'modalClosed'> & { opened: number; closed: number; cmds: unknown[] } {
  const f = {
    opened: 0, closed: 0, cmds: [] as unknown[],
    dispatch: vi.fn((cmd: unknown) => { f.cmds.push(cmd); return { ok: true, cost: 0, changed: [] as number[] }; }),
    modalOpened: () => { f.opened++; },
    modalClosed: () => { f.closed++; },
  };
  return f;
}
function rig(factories: ModalFactories = {}, host = fakeHost()) {
  const layer = document.createElement('div');
  document.body.appendChild(layer);
  const deps = { host, strings } as unknown as WindowDeps;
  const mh = createModalHost({ layer, host, strings, deps, factories });
  const click = (testid: string): void => { const el = layer.querySelector<HTMLElement>(`[data-testid="${testid}"]`); expect(el, testid).not.toBeNull(); el!.click(); };
  return { layer, host, mh, click, destroy: () => { mh.destroy(); layer.remove(); } };
}

describe('ModalHost：两条模态路径', () => {
  it('ModalId 全集 = 阶段挂起型 ∪ 命令结果型 ∪ {importAssets}', () => {
    const all = Object.keys(MODAL_OWNER) as ModalId[];
    const covered = new Set<ModalId>([...PHASE_MODALS, ...RESULT_MODALS, 'importAssets']);
    expect([...covered].sort()).toEqual(all.sort());
    for (const id of PHASE_MODALS) expect(RESULT_MODALS.has(id)).toBe(false);
  });

  it('SimEvent 路径（阶段挂起型）：打开不计数；作答 → modalAnswer + modalClosed 各一次；重复作答无效', () => {
    const R = rig();
    R.mh.openFromEvent('budget', { year: 1950 });
    expect(R.host.opened).toBe(0);
    expect(R.mh.depth()).toBe(1);
    expect(R.layer.querySelector('[data-testid="modal-budget"]')).not.toBeNull();
    R.click('modal-ok');
    expect(R.host.cmds).toEqual([{ type: 'modalAnswer', dialog: 'budget', answer: 0 }]);
    expect(R.host.closed).toBe(1);
    expect(R.mh.depth()).toBe(0);
    expect(R.layer.querySelector('[data-testid="modal-budget"]')).toBeNull();
    expect(R.mh.closeTop()).toBe(false);
    expect(R.host.closed).toBe(1);
    R.destroy();
  });

  it('CommandResult 路径（命令结果型）：打开 modalOpened 一次；作答 modalClosed 一次 + 回调；不发 modalAnswer', () => {
    const R = rig();
    const answers: number[] = [];
    R.mh.openFromResult({ id: 'bridgeType', payload: { from: 1, to: 5, length: 3, options: [0, 3] } }, (n) => answers.push(n));
    expect(R.host.opened).toBe(1);
    expect(R.host.closed).toBe(0);
    R.click('modal-bridge-1');
    expect(answers).toEqual([1]);
    expect(R.host.closed).toBe(1);
    expect(R.host.cmds).toEqual([]);
    // × 对命令结果型 = 取消（−1）
    R.mh.openFromResult({ id: 'bridgeType', payload: { options: [0] } }, (n) => answers.push(n));
    R.click('modal-close-bridgeType');
    expect(answers).toEqual([1, -1]);
    expect(R.host.opened).toBe(2); expect(R.host.closed).toBe(2);
    R.destroy();
  });

  it('通用对话框：neighborConnect 是 / 否、teamPick 五队、其余单个确定；× 对事件型 = 确定(0)', () => {
    const R = rig();
    const got: number[] = [];
    R.mh.openFromResult({ id: 'neighborConnect', payload: { at: 127, cost: 1000 } }, (n) => got.push(n));
    expect(R.layer.textContent).toContain('1000');
    R.click('modal-yes');
    R.mh.openFromResult({ id: 'neighborConnect', payload: { at: 127 } }, (n) => got.push(n));
    R.click('modal-no');
    R.mh.openFromResult({ id: 'teamPick', payload: null }, (n) => got.push(n));
    R.click('modal-team-3');
    expect(got).toEqual([1, 0, 3]);
    R.mh.openFromEvent('disasterAlert', { kind: 1 });
    R.click('modal-close-disasterAlert');
    expect(R.host.cmds.at(-1)).toEqual({ type: 'modalAnswer', dialog: 'disasterAlert', answer: 0 });
    expect(R.host.opened).toBe(3); expect(R.host.closed).toBe(4);
    R.destroy();
  });

  it('MODAL_FACTORIES 中的工厂优先于通用对话框；工厂抛错回退通用对话框', () => {
    const factories: ModalFactories = {
      disasterAlert: (_deps, payload, answer) => ({ title: 'alert', el: h('button', { dataset: { testid: 'go' }, text: String((payload as { kind: number }).kind), on: { click: () => answer(1) } }) }),
      gameOver: () => { throw new Error('boom'); },
    };
    const R = rig(factories);
    R.mh.openFromEvent('disasterAlert', { kind: 7 });
    expect(R.layer.querySelector('[data-testid="modal-generic-disasterAlert"]')).toBeNull();
    R.click('go');
    expect(R.host.cmds).toEqual([{ type: 'modalAnswer', dialog: 'disasterAlert', answer: 1 }]);
    R.mh.openFromEvent('gameOver', null);
    expect(R.layer.querySelector('[data-testid="modal-generic-gameOver"]')).not.toBeNull();
    R.click('modal-ok');
    expect(R.host.closed).toBe(2);
    R.destroy();
  });

  it('栈：两层按后进先出关闭；closeTop(n) 带答案；纯 UI 模态不触碰 host', () => {
    const R = rig();
    const uiAnswers: number[] = [];
    R.mh.openFromEvent('newspaper', null);
    R.mh.openUi('importAssets', null, (n) => uiAnswers.push(n));
    expect(R.mh.depth()).toBe(2);
    expect(R.mh.isOpen('importAssets')).toBe(true);
    expect(R.mh.closeTop(5)).toBe(true);
    expect(uiAnswers).toEqual([5]);
    expect(R.host.opened).toBe(0); expect(R.host.closed).toBe(0);
    expect(R.mh.closeTop(2)).toBe(true);
    expect(R.host.cmds).toEqual([{ type: 'modalAnswer', dialog: 'newspaper', answer: 2 }]);
    expect(R.host.closed).toBe(1);
    let destroyed = 0;
    R.mh.openCustom('about', { title: 'x', el: h('div'), destroy: () => { destroyed++; } });
    R.mh.closeTop();
    expect(destroyed).toBe(1);
    expect(describePayload({ a: 1 })).toContain('"a"');
    R.destroy();
  });

  it('挂起型模态关闭后时钟恢复（真 host：core 挂起 → 作答 → modalPause 归零 → advance 继续推进）', () => {
    const { host } = createTestContext();
    host.dispatch({ type: 'setSpeed', speed: 5 });
    host.modalOpened();                                             // 模拟阶段挂起（modalPause++）
    expect(host.advance(16, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 3 })).toEqual({ daysRun: 0, suspended: true });
    const R = rig({}, host as unknown as ReturnType<typeof fakeHost>);
    const mh = createModalHost({ layer: R.layer, host, strings, deps: { host, strings } as unknown as WindowDeps, factories: {} });
    mh.openFromEvent('newspaper', null);
    expect(host.state.clock.modalPause).toBe(1);
    expect(mh.closeTop(0)).toBe(true);
    expect(host.state.clock.modalPause).toBe(0);
    const age0 = host.state.clock.age;
    const r = host.advance(16, () => 0, { budgetMs: Infinity, maxDaysPerFrame: 3 });
    expect(r.suspended).toBe(false);
    expect(host.state.clock.age).toBe(age0 + r.daysRun);
    expect(r.daysRun).toBeGreaterThan(0);
    mh.destroy(); R.destroy();
  });
});
