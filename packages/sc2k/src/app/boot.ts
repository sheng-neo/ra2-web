// ===== app/boot.ts =====（WP0 最小版 → WP12 接手重写为 boot / loop / session）
// 标题页（城市名 / 难度 / 起始年份 / 地形参数表单 → 新城）→ wire 装配 → renderer.attach → mountShell → 每帧 host.advance + drainEvents + renderer.frame。
// DEV 或 ?debug 时挂 window.__sc2k = { host, renderer, shell, version }（e2e 读取）。文案全部经 strings 表。
import type { Sc2kDebugHandle } from '../contracts/shell';
import type { NewCityParams } from '../contracts/system';
import type { RenderSource } from '../contracts/render';
import type { SimHost } from '../contracts/host';
import { V1_TOOL_IDS } from './v1Tools';
import { SHOW_TITLE_EVENT } from './stubs/stubShell';
import {
  createWiredAssets, createWiredAudio, createWiredHost, createWiredProvider, createWiredRenderer, createWiredStrings, mountWiredShell,
} from './wire';

declare global {
  interface Window { __sc2k?: Sc2kDebugHandle }
}

export const APP_VERSION = '0.0.1-wp0';
const START_YEARS = [1900, 1950, 2000, 2050] as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(e, rest);
  if (dataset) for (const [k, v] of Object.entries(dataset)) e.dataset[k] = v;
  e.append(...children);
  return e;
};

/** 渲染输入：以 getter 读取 host 的当前 state / q（newCity / 读档后即使 host 换了对象也不需要重新 setSource）。 */
function renderSourceOf(host: SimHost): RenderSource & { bump(): void } {
  let animTick = 0;
  const src = {
    get state() { return host.state; },
    get q() { return host.q; },
    takeChanges: () => host.dirty.take(),
    get animTick() { return animTick; },
    bump() { animTick++; },
  };
  return src;
}

/** 标题页表单 → NewCityParams（seed 用 UI 装饰级随机即可，sim 流从 seed 起确定）。 */
function buildTitle(root: HTMLElement, t: (k: string) => string, onStart: (p: NewCityParams) => void): { show(): void; hide(): void } {
  const overlay = el('div', { className: 'sc2k-title', dataset: { testid: 'title' } });
  Object.assign(overlay.style, {
    position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,24,32,0.92)', zIndex: '20',
  } as Partial<CSSStyleDeclaration>);
  const panel = el('form', { className: 'sc2k-title-panel' });
  Object.assign(panel.style, {
    background: 'var(--bevel-face)', color: '#000', padding: '16px 20px', minWidth: '320px', display: 'grid', gap: '8px', gridTemplateColumns: 'auto 1fr',
    border: '2px solid var(--bevel-light)', boxShadow: '2px 2px 0 var(--bevel-dark), inset -2px -2px 0 var(--bevel-shadow)', fontSize: '14px',
  } as Partial<CSSStyleDeclaration>);
  const title = el('h1', { textContent: 'sc2k' }); title.style.gridColumn = '1 / -1'; title.style.margin = '0 0 4px';
  const tagline = el('div', { textContent: t('ui.title.tagline') }); tagline.style.gridColumn = '1 / -1'; tagline.style.opacity = '0.7';
  const row = (label: string, input: HTMLElement): void => { panel.append(el('label', { textContent: label }), input); };

  const name = el('input', { value: 'Newtown', dataset: { testid: 'city-name' } });
  const difficulty = el('select', { dataset: { testid: 'difficulty' } });
  for (const d of [1, 2, 3] as const) difficulty.append(el('option', { value: String(d), textContent: t(`ui.difficulty.${d}`) }));
  const startYear = el('select', { dataset: { testid: 'start-year' } });
  for (const y of START_YEARS) startYear.append(el('option', { value: String(y), textContent: String(y) }));
  const coast = el('input', { type: 'checkbox' });
  const river = el('input', { type: 'checkbox', checked: true });
  const slider = (v: number): HTMLInputElement => el('input', { type: 'range', min: '0', max: '47', value: String(v) });
  const hills = slider(16), water = slider(16), trees = slider(24);
  panel.append(title, tagline);
  row(t('ui.cityName'), name); row(t('ui.difficulty'), difficulty); row(t('ui.startYear'), startYear);
  row(t('ui.coast'), coast); row(t('ui.river'), river); row(t('ui.hills'), hills); row(t('ui.waterAmount'), water); row(t('ui.treeAmount'), trees);
  const start = el('button', { type: 'submit', textContent: t('ui.newCity'), dataset: { testid: 'new-city' } });
  start.style.gridColumn = '1 / -1';
  panel.append(start);
  panel.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const rnd = (): number => (Math.random() * 0x100000000) >>> 0;   // UI 装饰级随机：只用于生成种子
    onStart({
      name: name.value.trim() || 'Newtown',
      difficulty: Number(difficulty.value) as 1 | 2 | 3,
      startYear: Number(startYear.value) as NewCityParams['startYear'],
      seed: rnd(), terrainSeed: rnd(),
      terrain: { coast: coast.checked, river: river.checked, hills: Number(hills.value), water: Number(water.value), trees: Number(trees.value) },
    });
  });
  overlay.appendChild(panel);
  return {
    show: () => { if (!overlay.isConnected) root.appendChild(overlay); },
    hide: () => { overlay.remove(); },
  };
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('缺少 #app 根元素');
  const strings = createWiredStrings('zh');
  const t = (k: string): string => strings.t(k);
  const host = createWiredHost();
  const renderer = createWiredRenderer();
  const audio = createWiredAudio();
  const { store, importer } = createWiredAssets();

  const viewEl = el('div', { className: 'sc2k-view', dataset: { testid: 'view' } });
  Object.assign(viewEl.style, { position: 'absolute', inset: '32px 0 0 0' } as Partial<CSSStyleDeclaration>);
  root.appendChild(viewEl);

  renderer.setProvider(createWiredProvider(), null);
  await renderer.attach(viewEl);
  const source = renderSourceOf(host);
  renderer.setSource(source);

  const shell = mountWiredShell({ root, host, renderer, strings, audio, saves: store, v1Tools: V1_TOOL_IDS, importer });

  const titlePage = buildTitle(root, t, (params) => {
    host.newCity(params);
    host.dispatch({ type: 'terrainDone' });     // 标题页直接进入城市模式（地形编辑器 v2）
    host.dispatch({ type: 'setSpeed', speed: 3 });
    renderer.setView({ ...renderer.getView(), centerX: 64, centerY: 64 });
    titlePage.hide();
  });
  root.addEventListener(SHOW_TITLE_EVENT, () => { host.dispatch({ type: 'setSpeed', speed: 1 }); titlePage.show(); });
  titlePage.show();

  // ---- 主循环：host.advance(dt, now, 预算) → drainEvents → renderer.frame ----
  let last = performance.now();
  const now = (): number => performance.now();
  const tick = (ts: number): void => {
    requestAnimationFrame(tick);          // 先排下一帧：某帧抛错（会作为 pageerror 暴露）也不会让主循环停摆
    const dt = Math.min(250, ts - last);
    last = ts;
    host.advance(dt, now);
    for (const ev of host.drainEvents()) {
      if (ev.type === 'goto') renderer.goto(ev.x, ev.y, ev.smooth);
      else if (ev.type === 'sound') audio.play(ev.id);
    }
    source.bump();
    renderer.frame(dt);
  };
  requestAnimationFrame(tick);

  if (import.meta.env.DEV || location.search.includes('debug')) {
    window.__sc2k = { host, renderer, shell, version: APP_VERSION };
  }
}

void boot();
