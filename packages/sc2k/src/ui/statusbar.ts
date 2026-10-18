// ===== ui/statusbar.ts =====（spec:ui-art §2.4 状态区字段；spec:disasters §2.2.3 goto 箭头）
// 两行：第一行 [天气图标（UiIconId.WeatherBase 位图，缺位图时字形）| 灾害模式红色 goto 箭头] [消息区] [日期] [资金] [速度]；第二行 [市民诉求]。
// 消息优先级：拒绝原因（2 s）> 事件横幅（5 s）> 当前工具提示。天气 / 诉求 / 灾害状态全部只读 host.state 与 q.disasters，UI 不自行判定。
import type { SimHost } from '../contracts/host';
import type { RendererApi } from '../contracts/rendererApi';
import type { Strings } from '../contracts/strings';
import { CityMode } from '../contracts/grid';
import { dateOf } from '../contracts/state';
import { classIf, fmtMoney, h, setText } from './dom';
import { tr } from './theme';
import { UiIconId } from '../contracts/render';
import { ICON_PX, iconEl, weatherIconId } from './icons';
import type { StatusMessage } from './tools/toolController';

/** 12 种天气的字形（spec:disasters §2.4.2 图标列的 ASCII / 通用符号替身；v2 换精灵）。 */
export const WEATHER_GLYPH: readonly string[] = ['❄', '☼', '♨', '≡', '✲', '☁', '❅', '☂', '≋', '❆', '◎', '↯'];
export const WEATHER_COLOR: readonly string[] = ['#3f7fd6', '#d9a400', '#d05020', '#8a8a8a', '#6fa0d6', '#7a7a7a', '#5a8ad0', '#2a6fc0', '#4a8a4a', '#2f5fa0', '#a03030', '#803080'];
export const REJECT_TTL_MS = 2000, ALERT_TTL_MS = 5000, FLASH_STEP_MS = 150, FLASH_TIMES = 3;

export interface StatusBarOptions { root: HTMLElement; host: SimHost; renderer: RendererApi; strings: Strings; now?: () => number }
export interface StatusBar {
  el: HTMLElement;
  setMessage(m: StatusMessage): void;
  setComplaint(key: string | null): void;
  flashFunds(): void;
  refresh(): void;
  destroy(): void;
}

export function createStatusBar(o: StatusBarOptions): StatusBar {
  const { root, host, renderer, strings } = o;
  const t = (k: string, args?: Record<string, string | number>): string => strings.t(k, args);
  const now = o.now ?? (() => Date.now());
  let reject: { text: string; until: number } | null = null;
  let alert: { text: string; until: number } | null = null;
  let hint = '';
  let complaint: string | null = null;
  let focusCursor = 0;
  const flashTimers: ReturnType<typeof setTimeout>[] = [];

  const weatherEl = h('span', { class: 'sc2k-weather sc2k-in', dataset: { testid: 'status-weather' } });
  const gotoEl = h('button', { class: 'sc2k-goto', type: 'button', title: tr(strings, 'ui.goto'), dataset: { testid: 'status-goto' }, on: { click: () => cycleFocus() } }, iconEl(UiIconId.GotoArrow, ICON_PX) ?? '➜');
  let weatherShown = -1;
  gotoEl.style.display = 'none';
  const messageEl = h('span', { class: 'sc2k-message sc2k-in', dataset: { testid: 'status-message' } });
  const dateEl = h('span', { class: 'sc2k-date sc2k-in', dataset: { testid: 'status-date' } });
  const fundsEl = h('span', { class: 'sc2k-funds sc2k-in', dataset: { testid: 'status-funds' } });
  const speedEl = h('span', { class: 'sc2k-speed', title: tr(strings, 'menu.speed') }, ...[1, 2, 3, 4, 5].map(() => h('i')));
  const complaintEl = h('span', { class: 'sc2k-complaint', dataset: { testid: 'status-complaint' } });
  const el = h('div', { class: 'sc2k-statusbar sc2k-out', dataset: { testid: 'statusbar' } },
    h('div', { class: 'sc2k-status-row' }, weatherEl, gotoEl, messageEl, dateEl, fundsEl, speedEl),
    h('div', { class: 'sc2k-status-row second' }, complaintEl));
  root.appendChild(el);

  /** 灾害模式：点击在多处灾害间循环并居中（spec:disasters §2.2.3）。 */
  function cycleFocus(): void {
    const pts = host.q.disasters.focusPoints();
    if (pts.length === 0) { const d = host.state.disaster; renderer.goto(d.pointX, d.pointY, true); return; }
    const p = pts[focusCursor % pts.length]!;
    focusCursor = (focusCursor + 1) % pts.length;
    renderer.goto(p.x, p.y, true);
  }
  function refresh(): void {
    const s = host.state;
    const tnow = now();
    // 天气 / goto
    const disasterMode = s.clock.mode === CityMode.Disaster || s.disaster.active;
    gotoEl.style.display = disasterMode ? '' : 'none';
    weatherEl.style.display = disasterMode ? 'none' : '';
    if (!disasterMode) {
      const w = ((s.weather.trend | 0) % 12 + 12) % 12;
      if (weatherShown !== w) {                                    // 位图图标（WP9 WeatherBase + w）优先；不可用时字形 + 配色
        weatherShown = w;
        const ico = iconEl(weatherIconId(w), ICON_PX);
        if (ico) { weatherEl.replaceChildren(ico); weatherEl.style.color = ''; }
        else { setText(weatherEl, WEATHER_GLYPH[w]!); weatherEl.style.color = WEATHER_COLOR[w]!; }
      }
      const title = `${t(`weather.${w}`)} ${s.weather.heat - 100}°F`;
      if (weatherEl.title !== title) weatherEl.title = title;
    }
    // 消息
    if (reject && reject.until <= tnow) reject = null;
    if (alert && alert.until <= tnow) alert = null;
    const m = reject ?? alert;
    setText(messageEl, m ? m.text : hint);
    classIf(messageEl, 'reject', !!reject);
    classIf(messageEl, 'alert', !reject && !!alert);
    // 日期 / 资金 / 速度
    const d = dateOf(s.clock);
    setText(dateEl, `${s.clock.speed === 1 ? '‖ ' : ''}${t(`month.${d.month}`)} ${d.year}`);
    setText(fundsEl, fmtMoney(s.economy.funds));
    classIf(fundsEl, 'negative', s.economy.funds < 0);
    classIf(speedEl, 'paused', s.clock.speed === 1);
    speedEl.childNodes.forEach((c, k) => { if (c instanceof HTMLElement) classIf(c, 'on', k < s.clock.speed); });
    setText(complaintEl, complaint ? t(complaint) : '');
  }
  refresh();
  return {
    el,
    setMessage(m) {
      if (m.level === 'reject') reject = { text: m.text, until: now() + (m.ttlMs ?? REJECT_TTL_MS) };
      else if (m.level === 'alert') alert = { text: m.text, until: now() + (m.ttlMs ?? ALERT_TTL_MS) };
      else hint = m.text;
      refresh();
    },
    setComplaint(key) { complaint = key; refresh(); },
    flashFunds() {
      for (const id of flashTimers) clearTimeout(id);
      flashTimers.length = 0;
      for (let k = 0; k < FLASH_TIMES * 2; k++) flashTimers.push(setTimeout(() => classIf(fundsEl, 'flash', k % 2 === 0), k * FLASH_STEP_MS));
    },
    refresh,
    destroy() { for (const id of flashTimers) clearTimeout(id); el.remove(); },
  };
}
