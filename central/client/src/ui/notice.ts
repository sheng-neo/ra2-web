/**
 * 常驻提示条：运行期状态（如 WebGL 上下文被系统回收）。不依附加载画面——加载画面在首帧后就移除了。
 */
import { h } from './dom';

export class Notice {
  private readonly el: HTMLButtonElement;
  private onTap: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = h('button', { class: 'notice', type: 'button', role: 'status', hidden: '' });
    this.el.addEventListener('click', () => this.onTap?.());
    parent.append(this.el);
  }

  /** onTap 给定时提示条可点（例如点一下重新整理）。 */
  show(text: string, onTap: (() => void) | null = null): void {
    this.el.textContent = text;
    this.onTap = onTap;
    this.el.classList.toggle('tappable', onTap !== null);
    this.el.removeAttribute('hidden');
  }

  hide(): void {
    this.el.setAttribute('hidden', '');
    this.onTap = null;
  }
}
