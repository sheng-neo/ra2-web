// ===== io/assets/import/panel.ts =====（spec:file-formats §3.9.1 / §3.9.6；ARCHITECTURE §9.3；CONTRACTS §S AssetImporter）
// 最小导入面板（v1）：<input type="file" multiple> → identify → 原始字节入 IndexedDB → Worker 解码（缓存命中则跳过）→ DatSpriteProvider
// → onProviderReady(provider | null)。含"使用原版美术"开关（prefs.useOriginalArt）、识别结果 / 诊断列表、"清除本地缓存"。
// .SC2 / .SCN 经 Sc2Codec 校验后写入 saves（kind 'sc2'）。挂载由外壳决定（ShellOptions.importer：Title 页 / File 菜单 / importAssets 窗口）。
// 隐私：字节只经 File → ArrayBuffer → IndexedDB / Worker；本文件不含任何网络 I/O。
import type { AssetImporter, AssetKind, AssetStore, IdentifiedFile } from '../../../contracts/assets';
import type { Sc2Codec } from '../../../contracts/io';
import { MISC, miscGet } from '../../../contracts/io';
import type { Palette, SpriteProvider } from '../../../contracts/render';
import type { Strings } from '../../../contracts/strings';
import type { Diagnostic } from '../../../contracts/system';
import { identifyFile } from './identify';
import { baseNameOf } from './identify';
import type { SpawnWorker } from './decodeClient';
import { createDecodeClient, defaultSpawnWorker } from './decodeClient';
import { AssetStoreError, bundleToDecodedAssets, decodedAssetsToSource, decodedCacheKey } from './store';
import { makeLabels } from './labels';
import type { LabelFn } from './labels';
import { createDatSpriteProvider } from '../sprites/provider';
import type { DatProviderSource } from '../sprites/provider';
import { readPaletteBmp } from '../palette/bmp';
import { AssetFormatError } from '../sprites/bytes';

export const SPRITE_FILE_KINDS: readonly AssetKind[] = ['LARGE', 'SMALLMED', 'SPECIAL'];
export const PALETTE_FILE_KINDS: readonly AssetKind[] = ['PAL_MSTR', 'PAL_STTC', 'PAL_MAC'];
export const TEXT_FILE_KINDS: readonly AssetKind[] = ['DATA_USA_DAT', 'DATA_USA_IDX', 'TEXT_USA_DAT', 'TEXT_USA_IDX'];
/** 会写入 files store 的种类（其余：SC2 / SCN 进 saves；MIF / UNKNOWN 拒绝）。 */
export const STORED_KINDS: readonly AssetKind[] = [...SPRITE_FILE_KINDS, ...PALETTE_FILE_KINDS, ...TEXT_FILE_KINDS];
const CITY_KINDS: readonly AssetKind[] = ['SC2', 'SCN'];
const DAYS_PER_YEAR = 300;

export type ArtStatus = 'enabled' | 'partial' | 'disabled';
export interface ImportRow { name: string; kind: AssetKind; status: 'stored' | 'saved' | 'rejected'; codes: string[] }
export interface StoredFile { kind: AssetKind; sha256: string; size: number }
export interface ImporterState {
  rows: ImportRow[];
  stored: Partial<Record<AssetKind, StoredFile>>;
  useOriginalArt: boolean;
  art: ArtStatus;
  missing: AssetKind[];
  busy: boolean;
  diagnostics: Diagnostic[];
  provider: SpriteProvider | null;
  notice: string | null;
}
export interface ImporterOptions { strings?: Strings; spawnWorker?: SpawnWorker; now?: () => number }
export interface AssetImporterExt extends AssetImporter {
  /** 程序化导入（测试 / 拖放等入口复用）：等价于玩家在文件选择器里选中这些文件。 */
  importFiles(files: Iterable<File>): Promise<ImporterState>;
  setUseOriginalArt(on: boolean): Promise<void>;
  /** 重新从 store 读取文件与偏好并重建 provider。 */
  refresh(): Promise<ImporterState>;
  clearCache(): Promise<void>;
  getState(): ImporterState;
  /** 首次 mount 触发的启动序列（§3.9.6）完成。 */
  readonly ready: Promise<void>;
  dispose(): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('data-')) e.dataset[k.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v; else e.setAttribute(k, v); }
  e.append(...children);
  return e;
};

export function createAssetImporter(store: AssetStore, sc2: Sc2Codec, opts: ImporterOptions = {}): AssetImporterExt {
  const L: LabelFn = makeLabels(opts.strings);
  const now = opts.now ?? (() => Date.now());
  const client = createDecodeClient(opts.spawnWorker ?? defaultSpawnWorker);
  const listeners = new Set<(p: SpriteProvider | null) => void>();
  const state: ImporterState = { rows: [], stored: {}, useOriginalArt: false, art: 'disabled', missing: [], busy: false, diagnostics: [], provider: null, notice: null };
  let emitted: SpriteProvider | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let booted = false;
  let readyResolve: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => { readyResolve = resolve; });
  let dom: { root: HTMLElement; input: HTMLInputElement; toggle: HTMLInputElement; status: HTMLElement; files: HTMLElement; rows: HTMLElement; diag: HTMLElement; diagSummary: HTMLElement; notice: HTMLElement } | null = null;

  /** 串行化所有异步操作（导入 / 刷新 / 开关），避免并发重建。 */
  const enqueue = <T>(op: () => Promise<T>): Promise<T> => { const p = chain.then(op, op); chain = p.catch(() => undefined); return p; };

  const emit = (): void => {
    const next = state.useOriginalArt ? state.provider : null;
    if (next === emitted) return;
    emitted = next;
    for (const fn of listeners) fn(next);
  };

  const render = (): void => {
    if (!dom) return;
    dom.toggle.checked = state.useOriginalArt;
    dom.status.textContent = state.busy ? L('assets.busy') : state.art === 'enabled' ? L('assets.art.enabled') : state.art === 'partial' ? L('assets.art.partial', { missing: state.missing.join(', ') }) : L('assets.art.disabled');
    dom.status.dataset['art'] = state.art;
    dom.files.replaceChildren(...(Object.keys(state.stored).length === 0 ? [h('li', { class: 'sc2k-assets-empty' }, L('assets.none'))]
      : (Object.values(state.stored) as StoredFile[]).map((f) => h('li', { 'data-kind': f.kind }, `${f.kind} · ${f.size} B · ${f.sha256.slice(0, 12)}`))));
    dom.rows.replaceChildren(...(state.rows.length === 0 ? [h('li', { class: 'sc2k-assets-empty' }, L('assets.none'))]
      : state.rows.map((r) => h('li', { 'data-status': r.status, 'data-kind': r.kind }, `${r.name} → ${r.kind} · ${L(`assets.status.${r.status}`)}${r.codes.length ? ' · ' + r.codes.map((c) => L(`assets.err.${c}`)).join('；') : ''}`))));
    dom.diagSummary.textContent = `${L('assets.diagnostics')} (${state.diagnostics.length})`;
    dom.diag.replaceChildren(...state.diagnostics.map((d) => h('li', { 'data-level': d.level, 'data-code': d.code }, `[${d.level}] ${d.code}${d.at ? ` @ ${d.at}` : ''}：${d.message}`)));
    dom.notice.textContent = state.notice ?? '';
    dom.notice.style.display = state.notice ? '' : 'none';
  };

  const loadStored = async (): Promise<void> => {
    const stored: Partial<Record<AssetKind, StoredFile>> = {};
    for (const kind of STORED_KINDS) {
      const f = await store.getFile(kind);
      if (f) stored[kind] = { kind, sha256: f.sha256, size: f.bytes.byteLength };
    }
    state.stored = stored;
  };

  /** §3.9.6：按已存文件重建 provider（缓存命中 → 直接取；否则 Worker 解码并写缓存）。 */
  const rebuild = async (): Promise<void> => {
    const diagnostics: Diagnostic[] = [];
    const get = (kind: AssetKind) => store.getFile(kind);
    const [large, smallmed, special] = await Promise.all([get('LARGE'), get('SMALLMED'), get('SPECIAL')]);
    let palKind: AssetKind | null = null, pal: { bytes: ArrayBuffer; sha256: string } | undefined;
    for (const k of PALETTE_FILE_KINDS) { pal = await get(k); if (pal) { palKind = k; break; } }
    state.missing = [];
    if (!large) state.missing.push('LARGE');
    if (!smallmed) state.missing.push('SMALLMED');
    if (!pal || palKind !== 'PAL_MSTR') state.missing.push('PAL_MSTR');
    if ((!large && !smallmed) || !pal || !palKind) {
      state.art = 'disabled'; state.provider = null;
      if ((large || smallmed) && !pal) diagnostics.push({ level: 'warn', code: 'PALETTE_MISSING', message: L('assets.err.PALETTE_MISSING'), at: 'PAL_MSTR' });
      state.diagnostics = diagnostics;
      return;
    }
    if (palKind !== 'PAL_MSTR') diagnostics.push({ level: 'info', code: 'PALETTE_FALLBACK', message: L('assets.err.PALETTE_FALLBACK'), at: palKind });
    let palette: Palette;
    try { const r = readPaletteBmp(pal.bytes); palette = r.value; diagnostics.push(...r.diagnostics); }
    catch (e) {
      diagnostics.push({ level: 'error', code: e instanceof AssetFormatError ? e.code : 'PALETTE_FORMAT', message: e instanceof Error ? e.message : String(e), at: palKind });
      state.art = 'disabled'; state.provider = null; state.diagnostics = diagnostics; return;
    }
    const parts: { kind: AssetKind; sha256: string }[] = [];
    if (large) parts.push({ kind: 'LARGE', sha256: large.sha256 });
    if (smallmed) parts.push({ kind: 'SMALLMED', sha256: smallmed.sha256 });
    if (special) parts.push({ kind: 'SPECIAL', sha256: special.sha256 });
    parts.push({ kind: palKind, sha256: pal.sha256 });
    const key = decodedCacheKey(parts);
    let source: DatProviderSource;
    const cached = await store.getDecoded(key).catch(() => undefined);
    if (cached) {
      source = await decodedAssetsToSource(cached);
      diagnostics.push(...cached.diagnostics);
    } else {
      state.busy = true; render();
      try {
        const bundle = await client.decode({
          ...(large ? { large: large.bytes } : {}), ...(smallmed ? { smallmed: smallmed.bytes } : {}), ...(special ? { special: special.bytes } : {}), palette: pal.bytes,
        });
        source = bundle;
        diagnostics.push(...bundle.diagnostics.filter((d) => d.code !== 'PALETTE_MISSING'));
        try { await store.putDecoded(key, bundleToDecodedAssets(bundle)); }
        catch (e) { diagnostics.push({ level: 'warn', code: e instanceof AssetStoreError ? e.code : 'IDB', message: L('assets.err.QUOTA'), at: 'decoded' }); }
      } catch (e) {
        diagnostics.push({ level: 'error', code: 'DECODE_FAILED', message: e instanceof Error ? e.message : String(e) });
        state.art = 'disabled'; state.provider = null; state.diagnostics = diagnostics; state.busy = false; return;
      } finally { state.busy = false; }
    }
    state.provider = createDatSpriteProvider(source, palette);
    state.art = large && smallmed && palKind === 'PAL_MSTR' ? 'enabled' : 'partial';
    state.diagnostics = diagnostics;
  };

  const refreshInner = async (): Promise<ImporterState> => {
    const prefs = await store.getPrefs();
    state.useOriginalArt = prefs.useOriginalArt;
    await loadStored();
    await rebuild();
    emit(); render();
    return state;
  };

  const importOne = async (file: File): Promise<ImportRow> => {
    const { identified, result } = await identifyFile(file);
    const codes = result.diagnostics.map((d) => d.code);
    const kind = identified.kind;
    if (STORED_KINDS.includes(kind)) {
      try { await store.putFile(identified, await file.arrayBuffer()); return { name: file.name, kind, status: 'stored', codes }; }
      catch (e) { return { name: file.name, kind, status: 'rejected', codes: [...codes, e instanceof AssetStoreError ? e.code : 'IDB'] }; }
    }
    if (CITY_KINDS.includes(kind)) return importCity(file, identified, codes);
    return { name: file.name, kind, status: 'rejected', codes: codes.length ? codes : ['UNSUPPORTED'] };
  };

  const importCity = async (file: File, identified: IdentifiedFile, codes: string[]): Promise<ImportRow> => {
    const bytes = await file.arrayBuffer();
    try {
      const r = sc2.readSc2(bytes, file.name);
      const doc = r.value;
      const misc = doc.misc;
      const year = miscGet(misc, MISC.yearFounded) + Math.floor(miscGet(misc, MISC.cityAge) / DAYS_PER_YEAR);
      const population = miscGet(misc, MISC.normalPop) + miscGet(misc, MISC.arcoPop) || miscGet(misc, MISC.residentialPop);
      const cityName = doc.cityName || baseNameOf(file.name).replace(/\.[^.]+$/, '');
      await store.putSave({ kind: 'sc2', name: baseNameOf(file.name), cityName, year, population, savedAt: now(), thumbnail: null, bytes });
      return { name: file.name, kind: identified.kind, status: 'saved', codes: [...codes, ...r.diagnostics.filter((d) => d.level !== 'info').map((d) => d.code)] };
    } catch (e) {
      const code = e instanceof AssetStoreError || e instanceof AssetFormatError ? e.code : 'SC2_READ_FAILED';
      return { name: file.name, kind: identified.kind, status: 'rejected', codes: [...codes, code] };
    }
  };

  const importInner = async (files: Iterable<File>): Promise<ImporterState> => {
    const list = [...files];
    const rows: ImportRow[] = [];
    state.notice = null;
    for (const f of list) rows.push(await importOne(f));
    state.rows = rows;
    render();
    if (rows.some((r) => r.status === 'stored')) { await loadStored(); await rebuild(); }
    emit(); render();
    return state;
  };

  const boot = (): void => {
    if (booted) return;
    booted = true;
    void enqueue(refreshInner).catch(() => undefined).finally(() => readyResolve());
  };

  const importer: AssetImporterExt = {
    mount(el) {
      if (dom) { if (dom.root.parentElement !== el) el.appendChild(dom.root); render(); boot(); return; }
      const input = h('input', { type: 'file', multiple: '', accept: '.dat,.bmp,.sc2,.scn,.idx,.DAT,.BMP,.SC2,.SCN,.IDX', 'data-testid': 'assets-file-input' });
      const toggle = h('input', { type: 'checkbox', 'data-testid': 'assets-use-original' });
      const status = h('div', { class: 'sc2k-assets-status', 'data-testid': 'assets-status' });
      const files = h('ul', { class: 'sc2k-assets-files', 'data-testid': 'assets-files' });
      const rows = h('ul', { class: 'sc2k-assets-rows', 'data-testid': 'assets-rows' });
      const diag = h('ul', { class: 'sc2k-assets-diag', 'data-testid': 'assets-diagnostics' });
      const diagSummary = h('summary', {});
      const notice = h('div', { class: 'sc2k-assets-notice', 'data-testid': 'assets-notice' });
      const clear = h('button', { type: 'button', 'data-testid': 'assets-clear' }, L('assets.clear'));
      const root = h('div', { class: 'sc2k-assets', 'data-testid': 'assets-panel' },
        h('p', { class: 'sc2k-assets-hint' }, L('assets.hint')),
        h('label', { class: 'sc2k-assets-pick' }, input, ' ', L('assets.pick')),
        h('label', { class: 'sc2k-assets-toggle' }, toggle, ' ', L('assets.useOriginal')),
        status, notice,
        h('h4', {}, L('assets.files')), files,
        h('h4', {}, L('assets.rows')), rows,
        h('details', { class: 'sc2k-assets-details' }, diagSummary, diag),
        clear,
        h('p', { class: 'sc2k-assets-privacy' }, L('assets.privacy')),
      );
      input.addEventListener('change', () => { const picked = input.files ? [...input.files] : []; input.value = ''; if (picked.length) void importer.importFiles(picked); });
      toggle.addEventListener('change', () => { void importer.setUseOriginalArt(toggle.checked); });
      clear.addEventListener('click', () => { void importer.clearCache(); });
      dom = { root, input, toggle, status, files, rows, diag, diagSummary, notice };
      el.appendChild(root);
      render();
      boot();
    },
    unmount() { if (dom) { dom.root.remove(); dom = null; } },
    onProviderReady(fn) {
      listeners.add(fn);
      if (emitted) fn(emitted);
      return () => { listeners.delete(fn); };
    },
    importFiles: (files) => enqueue(() => importInner(files)),
    setUseOriginalArt: (on) => enqueue(async () => {
      await store.setPrefs({ useOriginalArt: on });
      state.useOriginalArt = on;
      if (on && !state.provider) { await loadStored(); await rebuild(); }
      emit(); render();
    }),
    refresh: () => enqueue(refreshInner),
    clearCache: () => enqueue(async () => {
      await store.clearAll();
      state.rows = []; state.stored = {}; state.provider = null; state.art = 'disabled'; state.missing = []; state.diagnostics = [];
      state.useOriginalArt = (await store.getPrefs()).useOriginalArt;
      state.notice = L('assets.cleared');
      emit(); render();
    }),
    getState: () => state,
    ready,
    dispose() { importer.unmount(); listeners.clear(); client.dispose(); },
  };
  return importer;
}
