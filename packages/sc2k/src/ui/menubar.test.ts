// @vitest-environment happy-dom
// ===== ui/menubar.test.ts =====（INT-B：节流 refresh 不得重建未变化的菜单行——否则点击会落在已脱离 DOM 的节点上）
import { afterEach, describe, expect, it } from 'vitest';
import { createMenuBar, isChecked } from './menubar';
import type { MenuBar } from './menubar';

describe('menubar refresh', () => {
  let bar: MenuBar | null = null;
  afterEach(() => { bar?.destroy(); bar = null; document.body.replaceChildren(); });

  it('打开的菜单：签名不变时 refresh 保留行节点；勾选状态变化时才重建并更新 aria-checked', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let on = false;
    let clicks = 0;
    bar = createMenuBar({
      root,
      menus: [{ id: 'm', title: 'M', items: () => [
        { label: 'Toggle', kind: 'check', checked: on, onSelect: () => { on = !on; }, testid: 'item-toggle' },
        { label: 'Act', onSelect: () => { clicks++; }, testid: 'item-act' },
      ] }],
      right: () => 'City',
    });
    const title = root.querySelector<HTMLElement>('[data-testid="menu-m"]')!;
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(bar.isOpen()).toBe(true);
    const row = root.querySelector<HTMLElement>('[data-testid="item-toggle"]')!;
    expect(isChecked(row)).toBe(false);
    for (let k = 0; k < 5; k++) bar.refresh();                       // 每 100 ms 的节流刷新
    expect(root.querySelector('[data-testid="item-toggle"]')).toBe(row);   // 同一节点，没有被 replaceChildren 换掉
    row.click();                                                     // 选中 → 关闭菜单并切换状态
    expect(on).toBe(true);
    expect(bar.isOpen()).toBe(false);
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    const row2 = root.querySelector<HTMLElement>('[data-testid="item-toggle"]')!;
    expect(isChecked(row2)).toBe(true);
    on = false;                                                      // 外部状态变化（例如 host.state 被命令改了）→ refresh 必须重建以反映
    bar.refresh();
    const row3 = root.querySelector<HTMLElement>('[data-testid="item-toggle"]')!;
    expect(row3).not.toBe(row2);
    expect(isChecked(row3)).toBe(false);
    root.querySelector<HTMLElement>('[data-testid="item-act"]')!.click();
    expect(clicks).toBe(1);
    expect(root.querySelector('.sc2k-menubar-right')!.textContent).toBe('City');
  });
});
