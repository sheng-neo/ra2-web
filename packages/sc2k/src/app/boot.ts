// ===== app/boot.ts =====（ARCHITECTURE §7.3 消息流、§5.9 接线；spec:ui-art §3.11 <TitleScreen>）
// 标题页（新城表单 / 载入文件 / 导入素材 / 关于）→ wire 装配 → renderer.attach → mountShell → session → EventBus 扇出（goto → renderer.goto、sound → AudioSink；
// modal / toolbar / paper / disasterStarted 等由外壳订阅）→ RAF 主循环（每帧 renderer.setActors(q.disasters.things())）。
// DEV 或 ?debug 时挂 window.__sc2k = { host, renderer, shell, version }（e2e 读取）。文案全部经 strings 表。
import type { Sc2kDebugHandle } from '../contracts/shell';
import type { NewCityParams } from '../contracts/system';
import type { RenderSource } from '../contracts/render';
import type { SimHost } from '../contracts/host';
import type { Strings } from '../contracts/strings';
import { V1_TOOL_IDS } from './v1Tools';
import { createWiredAssets, createWiredAudio, createWiredHost, createWiredProvider, createWiredRenderer, createWiredStrings, mountWiredShell, sc2Codec } from './wire';
import { SHOW_TITLE_EVENT, shellControlsOf } from '../ui';
import { h } from '../ui/dom';
import { tr } from '../ui/theme';
import { actorsOf, createLoop } from './loop';
import { createSession } from './session';
import type { Session } from './session';

declare global {
  interface Window { __sc2k?: Sc2kDebugHandle }
}

export const APP_VERSION = '0.1.0-wp12a';
const START_YEARS = [1900, 1950, 2000, 2050] as const;
const DEFAULT_CITY_NAME = 'Newtown';

/** 渲染输入：以 getter 读取 host 的当前 state / q（newCity / 读档后即使 host 换了对象也不需要重新 setSource）。 */
export function renderSourceOf(host: SimHost): RenderSource & { bump(): void } {
  let animTick = 0;
  return {
    get state() { return host.state; },
    get q() { return host.q; },
    takeChanges: () => host.dirty.take(),
    get animTick() { return animTick; },
    bump() { animTick++; },
  };
}

interface TitleDeps { strings: Strings; onStart(p: NewCityParams): void; onFile(file: File): void; importerMount?: ((el: HTMLElement) => void) | null; version: string }
/** 标题页：新城表单（city-name / difficulty / start-year / 地形参数）+ 载入文件 + 导入素材入口。测试 id 与 e2e/boot.spec 一致。 */
export function buildTitle(root: HTMLElement, d: TitleDeps): { show(): void; hide(): void; el: HTMLElement } {
  const t = (k: string): string => d.strings.t(k);
  const overlay = h('div', { class: 'sc2k-title', dataset: { testid: 'title' } });
  const panel = h('form', { class: 'sc2k-title-panel sc2k-out' });
  const row = (label: string, input: HTMLElement): void => { panel.append(h('label', { text: label }), input); };
  const name = h('input', { type: 'text', value: DEFAULT_CITY_NAME, maxLength: 23, class: 'sc2k-sunken-white', dataset: { testid: 'city-name' } });
  const difficulty = h('select', { dataset: { testid: 'difficulty' } }, ...([1, 2, 3] as const).map((k) => h('option', { value: String(k), text: t(`ui.difficulty.${k}`) })));
  const startYear = h('select', { dataset: { testid: 'start-year' } }, ...START_YEARS.map((y) => h('option', { value: String(y), text: String(y) })));
  const coast = h('input', { type: 'checkbox' });
  const river = h('input', { type: 'checkbox', checked: true });
  const slider = (v: number, testid: string): HTMLInputElement => h('input', { type: 'range', min: '0', max: '47', value: String(v), dataset: { testid } });
  const hills = slider(16, 'hills'), water = slider(16, 'water'), trees = slider(24, 'trees');
  panel.append(h('h1', { text: 'sc2k' }), h('div', { class: 'tagline', text: `${t('ui.title.tagline')} · ${d.version}` }));
  row(t('ui.cityName'), name); row(t('ui.difficulty'), difficulty); row(t('ui.startYear'), startYear);
  row(t('ui.coast'), coast); row(t('ui.river'), river); row(t('ui.hills'), hills); row(t('ui.waterAmount'), water); row(t('ui.treeAmount'), trees);
  const fileInput = h('input', { type: 'file', accept: '.sc2,.scn,.sc2kweb', style: { display: 'none' }, dataset: { testid: 'load-file' }, on: { change: () => { const f = fileInput.files?.[0]; if (f) d.onFile(f); fileInput.value = ''; } } });
  const start = h('button', { class: 'sc2k-btn primary', type: 'submit', text: t('ui.newCity'), dataset: { testid: 'new-city' } });
  const load = h('button', { class: 'sc2k-btn', type: 'button', text: `${t('ui.load')}…`, dataset: { testid: 'title-load' }, on: { click: () => fileInput.click() } });
  const actions = h('div', { class: 'actions' }, start, load, fileInput);
  panel.append(actions);
  if (d.importerMount) {
    const box = h('div', { class: 'sc2k-title-import sc2k-in', dataset: { testid: 'title-import' } }, h('div', { text: tr(d.strings, 'menu.file.importAssets') }));
    const mount = h('div');
    box.appendChild(mount);
    panel.append(box);
    d.importerMount(mount);
  }
  panel.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const rnd = (): number => (Math.random() * 0x100000000) >>> 0;   // UI 装饰级随机：只用于生成种子，模拟流从 seed 起确定
    d.onStart({
      name: name.value.trim().slice(0, 23) || DEFAULT_CITY_NAME,
      difficulty: Number(difficulty.value) as 1 | 2 | 3,
      startYear: Number(startYear.value) as NewCityParams['startYear'],
      seed: rnd(), terrainSeed: rnd(),
      terrain: { coast: coast.checked, river: river.checked, hills: Number(hills.value), water: Number(water.value), trees: Number(trees.value) },
    });
  });
  overlay.appendChild(panel);
  return {
    el: overlay,
    show: () => { if (!overlay.isConnected) root.appendChild(overlay); },
    hide: () => { overlay.remove(); },
  };
}

/** 文件选择（File 菜单"载入城市…"）。 */
function pickFile(accept: string, onFile: (f: File) => void): void {
  const input = h('input', { type: 'file', accept, style: { display: 'none' }, on: { change: () => { const f = input.files?.[0]; if (f) onFile(f); input.remove(); } } });
  document.body.appendChild(input);
  input.click();
}

export async function boot(root: HTMLElement): Promise<Sc2kDebugHandle> {
  const strings = createWiredStrings('zh');
  const host = createWiredHost();
  const renderer = createWiredRenderer();
  const audio = createWiredAudio();
  const { store, importer } = createWiredAssets(strings);
  const procedural = createWiredProvider();

  // 视图容器先于外壳创建并 attach（外壳采用同一元素）
  const viewEl = h('div', { class: 'sc2k-view', dataset: { testid: 'view' } });
  root.appendChild(viewEl);
  renderer.setProvider(procedural, null);
  await renderer.attach(viewEl);
  const source = renderSourceOf(host);
  renderer.setSource(source);

  const shell = mountWiredShell({ root, host, renderer, strings, audio, saves: store, v1Tools: V1_TOOL_IDS, importer });
  const controls = shellControlsOf(shell);
  controls.version = APP_VERSION;
  const session: Session = createSession({ host, renderer, store, sc2: sc2Codec, procedural, importer, bus: controls.bus });

  const reportDiag = (diag: ReadonlyArray<{ level: string; message: string }>): void => {
    const bad = diag.filter((x) => x.level !== 'info');
    if (bad.length) controls.message(bad.map((x) => x.message).join('；'), 'reject');
  };
  const loadFile = async (file: File): Promise<void> => {
    try { const r = await session.openFile(file); reportDiag(r.diagnostics); titlePage.hide(); audio.startMusic('city'); }
    catch (err) { controls.message(String(err instanceof Error ? err.message : err), 'reject'); }
  };
  const titlePage = buildTitle(root, {
    strings, version: APP_VERSION,
    onStart: (params) => { session.newCity(params); titlePage.hide(); audio.startMusic('city'); controls.refreshAll(); },
    onFile: (f) => { void loadFile(f); },
    importerMount: importer ? (el) => importer.mount(el) : null,
  });
  controls.fileActions = {
    newCity: () => { host.dispatch({ type: 'setSpeed', speed: 1 }); titlePage.show(); },
    exit: () => { host.dispatch({ type: 'setSpeed', speed: 1 }); audio.stopMusic(); titlePage.show(); },
    loadCity: () => pickFile('.sc2,.scn,.sc2kweb', (f) => { void loadFile(f); }),
    saveCity: () => { void session.saveToStore().then(() => controls.message(tr(strings, 'ui.saved', 'ui.save'))).catch((e: unknown) => controls.message(String(e), 'reject')); },
    saveCityAs: () => { try { const ext = session.downloadCity('sc2'); controls.message(`${tr(strings, 'ui.download')} ${ext}`); } catch (e) { controls.message(String(e), 'reject'); } },
  };
  root.addEventListener(SHOW_TITLE_EVENT, () => controls.fileActions.exit?.());
  titlePage.show();

  // ---- EventBus 扇出：goto → renderer；sound → AudioSink（其余由外壳订阅） ----
  controls.bus.on('goto', (e) => renderer.goto(e.x, e.y, e.smooth));
  controls.bus.on('sound', (e) => audio.play(e.id));

  // ---- 主循环 ----
  const loop = createLoop({
    host, renderer, bus: controls.bus, source,
    beforeFrame: () => renderer.setActors(actorsOf(host.q.disasters.things())),
    uiRefresh: (acc) => controls.tick(acc),
  });
  loop.start();
  window.addEventListener('resize', () => renderer.resize());

  const debug: Sc2kDebugHandle = { host, renderer, shell, version: APP_VERSION };
  if (import.meta.env.DEV || location.search.includes('debug')) window.__sc2k = debug;
  return debug;
}

const rootEl = typeof document !== 'undefined' ? document.getElementById('app') : null;
if (rootEl) void boot(rootEl);
