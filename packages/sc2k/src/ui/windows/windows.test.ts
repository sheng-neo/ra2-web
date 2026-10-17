// @vitest-environment happy-dom
// ===== ui/windows/windows.test.ts =====（WP12b 验收：WORKPLAN WP12 "windows.test.ts"）
// Graphs 对 xgrp 画 12 / 20 / 20 点；Ordinances 勾选派发 setOrdinance；Bonds 发行派发 issueBond；Newspaper 渲染 currentPaper()；
// Neighbors 四角与连接数；另：Budget / Map / Query / SaveLoad / NewCity / 各模态 / 工厂表完整性（双桩）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioSink } from '../../contracts/audio';
import type { Command } from '../../contracts/commands';
import { Corner, tileIndex } from '../../contracts/grid';
import type { SimHost } from '../../contracts/host';
import type { PaperView } from '../../contracts/queries';
import type { CityState } from '../../contracts/state';
import type { Diagnostic } from '../../contracts/system';
import type { ViewState } from '../../contracts/render';
import type { RendererApi } from '../../contracts/rendererApi';
import type { StubProfile } from '../../contracts/testkit';
import { createStrings } from '../../data';
import { createMemorySaveStore } from '../../app/savesLite';
import { createTestContext } from '../../testkit';
import type { WindowDeps } from '../windowTypes';
import { MODAL_FACTORIES, WINDOW_FACTORIES } from './index';
import { GRAPH_RANGES, GRAPH_SERIES, graphSeries, polylinePoints } from './graphs';
import { MAP_LAYER_MODES } from '../../contracts/render';
import { queryRows } from './query';
import { detectSaveKind } from './saveLoad';
import { levelKey, money, thousands } from './format';
import { tx } from './text';

const silentAudio: AudioSink = { play() {}, loop() {}, setEnabled() {}, startMusic() {}, stopMusic() {} };

function fakeRenderer(): RendererApi & { calls: string[] } {
  let view: ViewState = { zoom: 2, rotation: 0, centerX: 64, centerY: 64, underground: false, show: { buildings: true, signs: true, infrastructure: true, zones: true }, mapLayer: null };
  const calls: string[] = [];
  return {
    calls,
    attach: async () => undefined, destroy() {}, resize() {}, setSource() {}, setProvider() {},
    setView(v) { view = { ...v, show: { ...v.show } }; }, getView: () => ({ ...view, show: { ...view.show } }),
    goto(x, y) { calls.push(`goto:${x},${y}`); view.centerX = x; view.centerY = y; },
    frame() {}, setPreview() {}, setActors() {}, setHeatLayer() {}, pick: () => null, screenOf: () => [0, 0],
    minimap(mode, out) { calls.push(`minimap:${mode}`); out.fill(9); },
    thumbnail: async () => new Uint8Array([137, 80, 78, 71]),
    stats: () => ({ sprites: 0, drawCalls: 0, bandRebuilds: 0, frameMs: 0, vramBytes: 0 }),
  };
}

interface Harness { deps: WindowDeps; host: SimHost; state: CityState; dispatched: Command[]; opened: string[]; closed: string[]; renderer: ReturnType<typeof fakeRenderer>; pick(x: number, y: number): void }
function makeDeps(opts: { profile?: StubProfile; host?: Partial<SimHost>; dispatch?: (cmd: Command) => ReturnType<SimHost['dispatch']> } = {}): Harness {
  const tc = createTestContext({ profile: opts.profile ?? 'realistic' });
  const host: SimHost = opts.host ? { ...tc.host, ...opts.host } : tc.host;
  const dispatched: Command[] = [], opened: string[] = [], closed: string[] = [];
  const pickers = new Set<(x: number, y: number) => void>();
  const renderer = fakeRenderer();
  const deps: WindowDeps = {
    host, renderer, strings: createStrings('en'), audio: silentAudio, saves: createMemorySaveStore(), v1Tools: new Set(['power.coal']), importer: null,
    dispatch: (cmd) => { dispatched.push(cmd); return opts.dispatch ? opts.dispatch(cmd) : host.dispatch(cmd); },
    openWindow: (id) => { opened.push(id); }, closeWindow: (id) => { closed.push(id); },
    onTilePicked: (fn) => { pickers.add(fn); return () => { pickers.delete(fn); }; },
  };
  return { deps, host, state: tc.state, dispatched, opened, closed, renderer, pick: (x, y) => { for (const f of pickers) f(x, y); } };
}
const $ = <T extends HTMLElement = HTMLElement>(root: HTMLElement, testid: string): T => {
  const el = root.querySelector<T>(`[data-testid="${testid}"]`);
  if (!el) throw new Error(`缺少 data-testid=${testid}`);
  return el;
};
const $$ = (root: HTMLElement, testid: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)];
const fire = (el: HTMLElement, type: string): void => { el.dispatchEvent(new Event(type, { bubbles: true })); };
const setRange = (input: HTMLInputElement, v: number): void => { input.value = String(v); fire(input, 'input'); fire(input, 'change'); };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const flush = async (n = 6): Promise<void> => { for (let k = 0; k < n; k++) await tick(); };
const OK = { ok: true, cost: 0, changed: [] as readonly number[] };

afterEach(() => { document.body.innerHTML = ''; });

describe('工厂表', () => {
  it('WINDOW_FACTORIES / MODAL_FACTORIES 覆盖 v1 清单', () => {
    expect(Object.keys(WINDOW_FACTORIES).sort()).toEqual(['bonds', 'budget', 'graphs', 'importAssets', 'map', 'neighbors', 'newCity', 'newspaper', 'ordinances', 'query', 'saveLoad']);
    expect(Object.keys(MODAL_FACTORIES).sort()).toEqual(['bridgeType', 'budget', 'disasterAlert', 'extraPaper', 'gameOver', 'importAssets', 'neighborConnect', 'newspaper', 'teamPick']);
  });
  describe.each(['optimistic', 'pessimistic'] as const)('在 %s 桩下全部工厂可创建', (profile) => {
    it('windows', () => {
      const { deps } = makeDeps({ profile });
      for (const [id, f] of Object.entries(WINDOW_FACTORIES)) {
        const w = f!(deps);
        expect(w.id).toBe(id);
        expect(w.title.length).toBeGreaterThan(0);
        expect(w.el).toBeInstanceOf(HTMLElement);
        w.refresh?.(); w.onShow?.(); w.onHide?.(); w.destroy?.();
      }
    });
    it('modals', () => {
      const { deps } = makeDeps({ profile });
      for (const f of Object.values(MODAL_FACTORIES)) {
        const m = f!(deps, { kind: 1, x: 1, y: 2, options: [0], length: 3, slot: 1 }, () => undefined);
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.el).toBeInstanceOf(HTMLElement);
        m.refresh?.(); m.destroy?.();
      }
    });
  });
});

describe('Graphs', () => {
  it('graphSeries 按 16×52 布局取 12 / 20 / 20 点', () => {
    const xgrp = new Int32Array(832);
    for (let k = 0; k < 832; k++) xgrp[k] = k;
    expect(graphSeries(xgrp, 1, 0)).toEqual(Array.from({ length: 12 }, (_, k) => 52 + k));
    expect(graphSeries(xgrp, 1, 1)).toHaveLength(20);
    expect(graphSeries(xgrp, 1, 1)[0]).toBe(52 + 12);
    expect(graphSeries(xgrp, 15, 2)).toHaveLength(20);
    expect(graphSeries(xgrp, 15, 2)[19]).toBe(831);
    expect(GRAPH_SERIES).toHaveLength(16);
    expect(GRAPH_RANGES.map((r) => r.count)).toEqual([12, 20, 20]);
  });
  it('polylinePoints：点数 = 值数，y 按自身最大值归一', () => {
    const pts = polylinePoints([0, 5, 10], 100, 50, 10);
    expect(pts).toHaveLength(3);
    expect(pts[0]![0]).toBe(10); expect(pts[2]![0]).toBe(90);
    expect(pts[2]![1]).toBe(10);               // 最大值贴顶
    expect(pts[0]![1]).toBe(40);               // 0 贴底
    expect(polylinePoints([])).toEqual([]);
  });
  it('窗口按三档画 12 / 20 / 20 点、勾选序列数反映在 data-series', () => {
    const { deps, host } = makeDeps();
    host.state.xgrp.fill(3);
    const w = WINDOW_FACTORIES.graphs!(deps);
    document.body.appendChild(w.el);
    const canvas = $<HTMLCanvasElement>(w.el, 'graphs-canvas');
    expect(canvas.dataset['points']).toBe('12');
    expect(canvas.dataset['series']).toBe('4');
    const r1 = $<HTMLInputElement>(w.el, 'graphs-range-1'); r1.checked = true; fire(r1, 'change');
    expect(canvas.dataset['points']).toBe('20');
    const r2 = $<HTMLInputElement>(w.el, 'graphs-range-2'); r2.checked = true; fire(r2, 'change');
    expect(canvas.dataset['points']).toBe('20');
    const s7 = $<HTMLInputElement>(w.el, 'graphs-series-7'); s7.checked = true; fire(s7, 'change');
    expect(canvas.dataset['series']).toBe('5');
    expect($$(w.el, 'graphs-series-0').length + w.el.querySelectorAll('[data-testid^="graphs-series-"]').length).toBe(17);
  });
});

describe('Ordinances', () => {
  it('20 个复选框分 5 组；勾选派发 setOrdinance；被拒时回弹', () => {
    const { deps, dispatched } = makeDeps();
    const w = WINDOW_FACTORIES.ordinances!(deps);
    document.body.appendChild(w.el);
    expect(w.el.querySelectorAll('fieldset').length).toBe(5);
    expect(w.el.querySelectorAll('input[type=checkbox]').length).toBe(20);
    const box = $<HTMLInputElement>(w.el, 'ordinance-salesTax');
    box.checked = true; fire(box, 'change');
    expect(dispatched).toContainEqual({ type: 'setOrdinance', id: 0, on: true });
    expect(box.checked).toBe(false);           // 桩 economy → notImplemented → 回弹到真源（未启用）
    expect($(w.el, 'ordinances-footer').textContent).toContain('0 of 20');
  });
  it('命令被接受且真源置位后保持勾选', () => {
    const h = makeDeps({ dispatch: (cmd) => { if (cmd.type === 'setOrdinance') h.host.state.economy.ordinances |= 1 << cmd.id; return OK; } });
    const w = WINDOW_FACTORIES.ordinances!(h.deps);
    const box = $<HTMLInputElement>(w.el, 'ordinance-smokingBan');
    box.checked = true; fire(box, 'change');
    w.refresh!();
    expect(box.checked).toBe(true);
    expect($(w.el, 'ordinances-footer').textContent).toContain('1 of 20');
  });
});

describe('Bonds', () => {
  it('列表 / 计数来自 bondView；发行派发 issueBond、偿还派发 repayBond', () => {
    const base = makeDeps();
    base.host.state.economy.bonds.push({ rateRaw: 45000, issuedYear: 1903, issuedMonth: 4 });
    const real = base.host.q.economy;
    const h = makeDeps({ host: { ...base.host, q: { ...base.host.q, economy: { ...real, bondView: () => ({ ...real.bondView(), canIssue: true, canRepay: true, rating: 'AA', nextRatePctFloor: 5 }) } } } });
    const w = WINDOW_FACTORIES.bonds!(h.deps);
    document.body.appendChild(w.el);
    expect($(w.el, 'bonds-count').textContent).toBe('1');
    expect($(w.el, 'bonds-table').textContent).toContain('4%');
    expect($(w.el, 'bonds-table').textContent).toContain('May 1903');
    expect($(w.el, 'bonds-rating').textContent).toBe('AA');
    expect($(w.el, 'bonds-next').textContent).toBe('5%');
    $(w.el, 'bonds-issue').click();
    expect(h.dispatched).toContainEqual({ type: 'issueBond' });
    $(w.el, 'bonds-repay').click();
    expect(h.dispatched).toContainEqual({ type: 'repayBond' });
  });
  it('桩下不可发行时按钮禁用', () => {
    const { deps } = makeDeps();
    const w = WINDOW_FACTORIES.bonds!(deps);
    expect($<HTMLButtonElement>(w.el, 'bonds-issue').disabled).toBe(true);
    expect(w.el.textContent).toContain('No bonds outstanding');
  });
});

describe('Newspaper', () => {
  const paperOf = (extra: boolean): PaperView => ({
    year: 1905, month: 3, extra,
    headline: { type: 2, value: 0, power: 100, monthIndex: 0 },
    stories: [{ type: 2, value: 0, power: 100, monthIndex: 0 }, { type: 3, value: 1200, power: 90, monthIndex: 1 }, { type: 16, value: 7, power: 50, monthIndex: 2 }, { type: 4, value: 1, power: 40, monthIndex: 2 }],
    weather: { heat: 172, wind: 10, humid: 2, trend: 1, season: 1 },
  });
  const withPaper = (paper: PaperView | null): Harness => {
    const base = makeDeps();
    base.state.cityName = 'Riverbend';
    return makeDeps({ host: { ...base.host, q: { ...base.host.q, news: { currentPaper: () => paper, stories: () => paper?.stories ?? [] } } } });
  };
  it('渲染 currentPaper()：报头 / 日期 / 头条 / 2 条正文 / 天气栏', () => {
    const { deps } = withPaper(paperOf(false));
    const w = WINDOW_FACTORIES.newspaper!(deps);
    document.body.appendChild(w.el);
    expect($(w.el, 'paper-masthead').textContent).toBe('The Morning Ledger');
    expect($(w.el, 'paper-date').textContent).toBe('Apr 1905');
    expect($(w.el, 'paper-headline').querySelector('h2')!.textContent).toBe('Riverbend officially founded');
    expect($(w.el, 'paper-stories').querySelectorAll('.sc2k-win-story').length).toBe(2);
    expect($(w.el, 'paper-stories').textContent).toContain('Riverbend passes 1200 residents');
    expect($(w.el, 'paper-weather').textContent).toContain('Clear');
    expect($(w.el, 'paper-weather').textContent).toContain('72°F');
    expect(w.el.querySelector('[data-testid="paper-extra"]')).toBeNull();
  });
  it('号外横幅；无报纸时占位；模态 OK → answer(0)', () => {
    const { deps } = withPaper(paperOf(true));
    const answer = vi.fn();
    const m = MODAL_FACTORIES.extraPaper!(deps, null, answer);
    expect($(m.el, 'paper-extra').textContent).toBe('Special edition');
    $(m.el, 'paper-ok').click();
    expect(answer).toHaveBeenCalledWith(0);
    const none = withPaper(null);
    const w = WINDOW_FACTORIES.newspaper!(none.deps);
    expect($(w.el, 'paper-empty').textContent.length).toBeGreaterThan(0);
  });
  it('缺文案的故事类型回退到通用模板', () => {
    const p = paperOf(false);
    const { deps } = withPaper({ ...p, headline: { type: 66, value: 0, power: 1, monthIndex: 0 }, stories: [] });
    const w = WINDOW_FACTORIES.newspaper!(deps);
    expect($(w.el, 'paper-headline').textContent).toContain('Around the city');
  });
});

describe('Neighbors', () => {
  it('四角邻城名 / 人口与各边连接数、中央本城', () => {
    const { deps, state: s } = makeDeps();
    s.cityName = 'Harborlight'; s.census.citySize = 4321;
    const names = ['Northfield', 'Eastmere', 'Southgate', 'Westbrook'];
    for (let k = 0; k < 4; k++) { const n = s.neighbors[k]!; n.name = names[k]!; n.population = 1000 * (k + 1); n.connections = { road: k, rail: 1, highway: 0 }; }
    const w = WINDOW_FACTORIES.neighbors!(deps);
    document.body.appendChild(w.el);
    for (let k = 0; k < 4; k++) {
      expect($(w.el, `neighbor-${k}`).textContent).toContain(names[k]);
      expect($(w.el, `neighbor-${k}`).textContent).toContain(thousands(1000 * (k + 1)));
      expect($(w.el, `neighbor-conn-${k}`).textContent).toContain(`Road ${k}`);
    }
    expect($(w.el, 'neighbor-center').textContent).toContain('Harborlight');
    expect($(w.el, 'neighbor-center').textContent).toContain('4,321');
    expect(w.el.querySelectorAll('.sc2k-win-corner').length).toBe(4);
  });
});

describe('Budget', () => {
  it('税率滑块 → setTax 三值；资金滑块 → setFunding；自动预算 → setOption；明细按钮打开窗口', () => {
    const h = makeDeps({ dispatch: () => OK });
    const w = WINDOW_FACTORIES.budget!(h.deps);
    document.body.appendChild(w.el);
    setRange($<HTMLInputElement>(w.el, 'budget-tax'), 9);
    expect(h.dispatched).toContainEqual({ type: 'setTax', rates: { r: 9, c: 9, i: 9 } });
    setRange($<HTMLInputElement>(w.el, 'budget-funding-police'), 50);
    expect(h.dispatched).toContainEqual({ type: 'setFunding', line: 0, pct: 50 });
    setRange($<HTMLInputElement>(w.el, 'budget-funding-tunnel'), 80);
    expect(h.dispatched).toContainEqual({ type: 'setFunding', line: 10, pct: 80 });
    const auto = $<HTMLInputElement>(w.el, 'budget-auto'); auto.checked = true; fire(auto, 'change');
    expect(h.dispatched).toContainEqual({ type: 'setOption', key: 'autoBudget', value: true });
    $(w.el, 'budget-open-ordinances').click(); $(w.el, 'budget-open-bonds').click();
    expect(h.opened).toEqual(['ordinances', 'bonds']);
    expect(w.el.querySelectorAll('input[type=range]').length).toBe(12);
  });
  it('refresh 读真源：资金 / 期初资金；模态 OK → answer(0)', () => {
    const { deps, host } = makeDeps();
    host.state.economy.funds = 12345; host.state.economy.yearOpeningFunds = 20000;
    const answer = vi.fn();
    const m = MODAL_FACTORIES.budget!(deps, null, answer);
    expect($(m.el, 'budget-funds').textContent).toBe('$12,345');
    expect($(m.el, 'budget-opening').textContent).toBe('$20,000');
    host.state.economy.funds = -500; m.refresh!();
    expect($(m.el, 'budget-funds').textContent).toBe('-$500');
    $(m.el, 'budget-ok').click();
    expect(answer).toHaveBeenCalledWith(0);
  });
});

describe('Map', () => {
  it('15 个图层按钮；选图层调用 renderer.minimap(mode)；点击小地图 goto', () => {
    const h = makeDeps();
    const w = WINDOW_FACTORIES.map!(h.deps);
    document.body.appendChild(w.el);
    expect(w.el.querySelectorAll('[data-testid^="map-layer-"]').length).toBe(MAP_LAYER_MODES.length);
    $(w.el, 'map-layer-power').click();
    expect(h.renderer.calls).toContain('minimap:power');
    const canvas = $<HTMLCanvasElement>(w.el, 'map-canvas');
    expect(canvas.dataset['layer']).toBe('power');
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }));
    expect(h.renderer.calls.some((c) => c.startsWith('goto:'))).toBe(true);
  });
});

describe('Query', () => {
  it('点选空地显示坐标 / 地形 / 分区；整栋建筑经 anchorOf 找到名字与占地', () => {
    const h = makeDeps();
    const L = h.host.state.layers;
    const ax = 20, ay = 20, anchor = tileIndex(ax, ay);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) L.xbld[tileIndex(ax + dx, ay + dy)] = 0xd1;
    L.xzon[anchor] = Corner.TL;
    const w = WINDOW_FACTORIES.query!(h.deps);
    document.body.appendChild(w.el);
    expect(w.el.querySelector('[data-testid="query-hint"]')).not.toBeNull();
    h.pick(10, 12);
    expect(w.el.textContent).toContain('(10, 12)');
    expect(w.el.textContent).toContain('Open land');
    expect(w.el.textContent).toContain('Land');
    expect(w.el.textContent).toContain('No zone');
    h.pick(ax + 2, ay + 1);                        // 非锚格
    const rows = queryRows(h.deps, ax + 2, ay + 1);
    expect(rows.find((r) => r[0] === 'Name')![1]).toBe(h.deps.strings.t('bld.0xD1'));
    expect(rows.find((r) => r[0] === 'Footprint')![1]).toBe('3×3');
    expect(w.el.textContent).toContain('3×3');
    expect(w.el.dataset['tile']).toBe(String(tileIndex(ax + 2, ay + 1)));
    w.destroy!();
    h.pick(1, 1);                                  // 注销后不再更新
    expect(w.el.textContent).toContain('3×3');
  });
  it('电 / 水按 Powerable / Piped 位给 N/A', () => {
    const h = makeDeps({ profile: 'optimistic' });
    const rows = queryRows(h.deps, 5, 5);
    expect(rows.find((r) => r[0] === 'Power')![1]).toBe('N/A');
    h.host.state.layers.xbit[tileIndex(5, 5)] = 0x80 | 0x20;
    const rows2 = queryRows(h.deps, 5, 5);
    expect(rows2.find((r) => r[0] === 'Power')![1]).toBe('Powered');
    expect(rows2.find((r) => r[0] === 'Water')![1]).toBe('Watered');
  });
});

describe('SaveLoad', () => {
  it('保存 .sc2kweb → 列表 → 读取（loadSnapshot）→ 删除', async () => {
    const loadSnapshot = vi.fn((_bytes: Uint8Array): Diagnostic[] => []);
    const base = makeDeps();
    base.state.cityName = 'Harborlight';
    const h = makeDeps({ host: { ...base.host, loadSnapshot } });
    (window as unknown as { confirm: () => boolean }).confirm = () => true;
    const w = WINDOW_FACTORIES.saveLoad!(h.deps);
    document.body.appendChild(w.el);
    w.onShow!();
    await flush();
    expect(w.el.querySelector('[data-testid="saves-empty"]')).not.toBeNull();
    $<HTMLSelectElement>(w.el, 'saves-kind').value = 'sc2kweb';
    $<HTMLInputElement>(w.el, 'saves-name').value = 'first';
    $(w.el, 'saves-save').click();
    await vi.waitFor(() => expect($$(w.el, 'saves-row')).toHaveLength(1));
    expect((await h.deps.saves.listSaves())[0]).toMatchObject({ name: 'first', kind: 'sc2kweb', cityName: 'Harborlight' });
    expect($(w.el, 'saves-note').textContent).toContain('Saved "first"');
    $(w.el, 'saves-load').click();
    await vi.waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(1));
    expect(loadSnapshot.mock.calls[0]![0]).toBeInstanceOf(Uint8Array);
    $(w.el, 'saves-delete').click();
    await vi.waitFor(() => expect(w.el.querySelector('[data-testid="saves-empty"]')).not.toBeNull());
  });
  it('.sc2 在 WP0 桩 codec 下优雅失败（显示拒绝文案，不抛）', async () => {
    const h = makeDeps();
    const w = WINDOW_FACTORIES.saveLoad!(h.deps);
    document.body.appendChild(w.el);
    $<HTMLSelectElement>(w.el, 'saves-kind').value = 'sc2';
    $(w.el, 'saves-save').click();
    await vi.waitFor(() => expect($(w.el, 'saves-note').dataset['level']).toBe('error'));
    expect($(w.el, 'saves-note').textContent).toContain('Not implemented yet');
    expect(await h.deps.saves.listSaves()).toHaveLength(0);
  });
  it('detectSaveKind：扩展名 > 魔数 > 默认 .sc2', () => {
    const magic = new TextEncoder().encode('SC2KWEBS....').buffer;
    expect(detectSaveKind('x.sc2kweb', new ArrayBuffer(4))).toBe('sc2kweb');
    expect(detectSaveKind('x.SC2', magic)).toBe('sc2');
    expect(detectSaveKind('blob', magic)).toBe('sc2kweb');
    expect(detectSaveKind('blob', new ArrayBuffer(4))).toBe('sc2');
  });
});

describe('NewCity', () => {
  it('完成：host.newCity(params) → terrainDone → setSpeed 3 → 关闭窗口', () => {
    const newCity = vi.fn();
    const base = makeDeps();
    const h = makeDeps({ host: { ...base.host, newCity }, dispatch: () => OK });
    const w = WINDOW_FACTORIES.newCity!(h.deps);
    document.body.appendChild(w.el);
    $<HTMLInputElement>(w.el, 'newcity-name').value = 'Harborlight';
    $<HTMLSelectElement>(w.el, 'newcity-year').value = '1950';
    $<HTMLSelectElement>(w.el, 'newcity-difficulty').value = '3';
    const hills = $<HTMLInputElement>(w.el, 'newcity-hills'); hills.value = '30'; fire(hills, 'input');
    const events: string[] = [];
    w.el.addEventListener('sc2k:newCity', (e) => events.push((e as CustomEvent<{ phase: string }>).detail.phase));
    $(w.el, 'newcity-done').click();
    expect(newCity).toHaveBeenCalledTimes(1);
    expect(newCity.mock.calls[0]![0]).toMatchObject({ name: 'Harborlight', startYear: 1950, difficulty: 3, terrain: { hills: 30, water: 5, trees: 15, river: true, coast: false } });
    expect(h.dispatched).toEqual([{ type: 'terrainDone' }, { type: 'setSpeed', speed: 3 }]);
    expect(h.closed).toEqual(['newCity']);
    expect(events).toEqual(['done']);
  });
  it('生成后再完成不会重复 newCity；城市名截断到 23 字符', () => {
    const newCity = vi.fn();
    const base = makeDeps();
    const h = makeDeps({ host: { ...base.host, newCity }, dispatch: () => OK });
    const w = WINDOW_FACTORIES.newCity!(h.deps);
    $<HTMLInputElement>(w.el, 'newcity-name').value = 'A'.repeat(40);
    $(w.el, 'newcity-make').click();
    expect(newCity).toHaveBeenCalledTimes(1);
    expect((newCity.mock.calls[0]![0] as { name: string }).name).toHaveLength(23);
    expect($(w.el, 'newcity-note').textContent!.length).toBeGreaterThan(0);
    $(w.el, 'newcity-done').click();
    expect(newCity).toHaveBeenCalledTimes(1);
    expect(h.dispatched[0]).toEqual({ type: 'terrainDone' });
  });
});

describe('模态', () => {
  it('disasterAlert：灾害名 + Go To → renderer.goto 与 answer(1)；OK → answer(0)', () => {
    const h = makeDeps();
    const answer = vi.fn();
    const m = MODAL_FACTORIES.disasterAlert!(h.deps, { kind: 1, x: 5, y: 6 }, answer);
    expect($(m.el, 'alert-text').textContent).toContain('Fire');
    $(m.el, 'alert-goto').click();
    expect(h.renderer.calls).toContain('goto:5,6');
    expect(answer).toHaveBeenLastCalledWith(1);
    $(m.el, 'alert-ok').click();
    expect(answer).toHaveBeenLastCalledWith(0);
    const noPos = MODAL_FACTORIES.disasterAlert!(h.deps, { kind: 7 }, answer);
    expect(noPos.el.querySelector('[data-testid="alert-goto"]')).toBeNull();
    expect($(noPos.el, 'alert-text').textContent).toContain('Tornado');
  });
  it('teamPick：answer(运动下标)，队名经 rename{slot}', () => {
    const h = makeDeps({ dispatch: () => OK });
    const answer = vi.fn();
    const m = MODAL_FACTORIES.teamPick!(h.deps, { slot: 4 }, answer);
    expect(m.el.querySelectorAll('input[type=radio]').length).toBe(5);
    const r3 = $<HTMLInputElement>(m.el, 'team-3'); r3.checked = true; fire(r3, 'change');
    $<HTMLInputElement>(m.el, 'team-name').value = 'Otters';
    $(m.el, 'team-ok').click();
    expect(h.dispatched).toContainEqual({ type: 'rename', slot: 4, text: 'Otters' });
    expect(answer).toHaveBeenCalledWith(3);
  });
  it('bridgeType：按 payload.options 列按钮，answer(BridgeKind)；取消 → -1', () => {
    const h = makeDeps();
    const answer = vi.fn();
    const m = MODAL_FACTORIES.bridgeType!(h.deps, { from: 1, to: 9, length: 6, options: [0, 3], costs: [600, 1200] }, answer);
    expect(m.el.textContent).toContain('Span: 6 tiles');
    expect($(m.el, 'bridge-3').textContent).toContain('Rail bridge');
    expect($(m.el, 'bridge-3').textContent).toContain('$1,200');
    $(m.el, 'bridge-3').click();
    expect(answer).toHaveBeenLastCalledWith(3);
    $(m.el, 'bridge-cancel').click();
    expect(answer).toHaveBeenLastCalledWith(-1);
  });
  it('neighborConnect：费用文案；是 → 1，否 → 0', () => {
    const h = makeDeps();
    const answer = vi.fn();
    const m = MODAL_FACTORIES.neighborConnect!(h.deps, { at: 5 }, answer);
    expect($(m.el, 'connect-text').textContent).toContain('$1,000');
    $(m.el, 'connect-yes').click(); expect(answer).toHaveBeenLastCalledWith(1);
    $(m.el, 'connect-no').click(); expect(answer).toHaveBeenLastCalledWith(0);
  });
  it('gameOver：继续观看 → 0，回主菜单 → 1', () => {
    const h = makeDeps();
    const answer = vi.fn();
    const m = MODAL_FACTORIES.gameOver!(h.deps, { funds: -60000 }, answer);
    expect(m.el.textContent).toContain('-$60,000');
    $(m.el, 'gameover-watch').click(); expect(answer).toHaveBeenLastCalledWith(0);
    $(m.el, 'gameover-menu').click(); expect(answer).toHaveBeenLastCalledWith(1);
  });
  it('importAssets：挂载 / 卸载 importer；无 importer 时提示', () => {
    const h = makeDeps();
    const importer = { mount: vi.fn(), unmount: vi.fn(), onProviderReady: () => () => undefined };
    const deps = { ...h.deps, importer };
    const w = WINDOW_FACTORIES.importAssets!(deps);
    expect(importer.mount).toHaveBeenCalledWith($(w.el, 'import-mount'));
    w.destroy!();
    expect(importer.unmount).toHaveBeenCalledTimes(1);
    const answer = vi.fn();
    const m = MODAL_FACTORIES.importAssets!(h.deps, null, answer);
    expect(m.el.querySelector('[data-testid="import-none"]')).not.toBeNull();
    $(m.el, 'import-close').click();
    expect(answer).toHaveBeenCalledWith(0);
  });
});

describe('辅助', () => {
  it('money / thousands / levelKey', () => {
    expect(money(0)).toBe('$0'); expect(money(1234567)).toBe('$1,234,567'); expect(money(-999)).toBe('-$999'); expect(thousands(1000)).toBe('1,000');
    expect([0, 1, 63, 64, 127, 128, 191, 192, 255].map(levelKey)).toEqual(['level.none', 'level.low', 'level.low', 'level.medium', 'level.medium', 'level.high', 'level.high', 'level.veryHigh', 'level.veryHigh']);
  });
  it('tx：有键用表，缺键按语言回退，再缺返回键名', () => {
    const en = createStrings('en'), zh = createStrings('zh');
    expect(tx(en, 'ui.ok')).toBe('OK');
    expect(tx(en, 'graph.citySize')).toBe('City size');
    expect(tx(zh, 'graph.citySize')).toBe('城市规模');
    expect(tx(en, 'ui.saves.saved', { name: 'x' })).toBe('Saved "x"');
    expect(tx(en, 'no.such.key')).toBe('no.such.key');
  });
});
