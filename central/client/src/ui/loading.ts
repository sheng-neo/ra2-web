/**
 * 加载画面：标题、进度条（总量未知时为不定进度）、状态文字、数据署名。
 */
import { h } from './dom';

export const SHORT_ATTRIBUTION =
  '地圖數據 © OpenStreetMap contributors · Overture Maps Foundation · 建築與地形：香港特區政府地政總署、土木工程拓展署（CSDI）';

export class LoadingScreen {
  private readonly root: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly fill: HTMLElement;
  private readonly status: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.fill = h('i');
    this.bar = h('div', { class: 'bar' }, this.fill);
    this.status = h('div', { class: 'status', role: 'status' }, '準備中…');
    this.root = h(
      'div',
      { class: 'loading' },
      h('h1', {}, '中環急件', h('small', {}, 'CENTRAL RUSH')),
      this.bar,
      this.status,
      h('div', { class: 'attrib' }, SHORT_ATTRIBUTION),
    );
    parent.append(this.root);
  }

  /** fraction 为 null 表示总量未知。 */
  progress(fraction: number | null, label: string): void {
    this.bar.classList.toggle('indeterminate', fraction === null);
    if (fraction !== null) this.fill.style.width = `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`;
    this.status.textContent = label;
  }

  fail(message: string): void {
    this.bar.classList.remove('indeterminate');
    this.status.classList.add('error');
    this.status.textContent = message;
  }

  done(): void {
    this.root.classList.add('done');
    setTimeout(() => this.root.remove(), 700);
  }
}
