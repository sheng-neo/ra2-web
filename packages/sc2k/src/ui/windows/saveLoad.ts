// ===== ui/windows/saveLoad.ts =====（WP12b：Save & Load 窗口，ARCHITECTURE §7.4 / §9.3）
// SaveStore 列表（名 / 城市 / 年份 / 人口 / 时间 / 格式 / 缩略图）+ 保存（名字 + 格式：.sc2 经 host.exportSc2 → sc2Codec.writeSc2；.sc2kweb = host.saveSnapshot）
// + 读取（sc2kweb → host.loadSnapshot；sc2 → sc2Codec.readSc2 → host.importSc2）+ 删除 + 下载到文件 + 打开本地文件（按扩展名 / 魔数识别）。
// sc2Codec 不在 WindowDeps 内（RFC 已提），ui/** 允许 import io/**：直接取 io/sc2 入口。WP0 桩的 writeSc2/readSc2 抛 notImplemented → 窗口显示拒绝文案，不崩。
import type { SaveKind, SaveMeta } from '../../contracts/assets';
import { DEFAULT_SAVE_KIND } from '../../contracts/assets';
import { SNAPSHOT_MAGIC } from '../../contracts/snapshot';
import { dateOf } from '../../contracts/state';
import type { Diagnostic } from '../../contracts/system';
import type { Sc2Codec } from '../../contracts/io';
import { sc2Codec as sc2Entry } from '../../io/sc2';
import type { WindowDeps, WindowFactory } from '../windowTypes';

/** 按契约类型使用入口（WP0 桩的推断类型比 Sc2Codec 窄：readSc2/writeSc2 为 () => never）。 */
const sc2Codec: Sc2Codec = sc2Entry;
import { thousands, timestampLabel } from './format';
import { bindText } from './text';
import { btn, downloadBytes, field, h, noteLine, replace } from './wdom';

export const CITY_LOADED_EVENT = 'sc2k:cityLoaded';
export const CITY_SAVED_EVENT = 'sc2k:citySaved';
export const THUMB_W = 96, THUMB_H = 72;
const EXT: Readonly<Record<SaveKind, string>> = { sc2: '.sc2', sc2kweb: '.sc2kweb' };

/** 识别文件格式：扩展名优先，其次快照魔数，否则按 .SC2。 */
export function detectSaveKind(name: string, bytes: ArrayBuffer): SaveKind {
  const lower = name.toLowerCase();
  if (lower.endsWith('.sc2kweb')) return 'sc2kweb';
  if (lower.endsWith('.sc2') || lower.endsWith('.scn')) return 'sc2';
  const head = new Uint8Array(bytes, 0, Math.min(SNAPSHOT_MAGIC.length, bytes.byteLength));
  let magic = '';
  for (const b of head) magic += String.fromCharCode(b);
  return magic === SNAPSHOT_MAGIC ? 'sc2kweb' : 'sc2';
}

/** 按格式产出字节（.sc2 可能抛错：桩 codec / 挂起态）。 */
export function encodeCity(deps: WindowDeps, kind: SaveKind): Uint8Array {
  if (kind === 'sc2kweb') return deps.host.saveSnapshot();
  const doc = deps.host.exportSc2();
  return new Uint8Array(sc2Codec.writeSc2(doc));
}

/** 按格式载入（返回诊断）。 */
export function decodeCity(deps: WindowDeps, kind: SaveKind, bytes: ArrayBuffer, fileName: string): Diagnostic[] {
  if (kind === 'sc2kweb') return deps.host.loadSnapshot(new Uint8Array(bytes));
  const r = sc2Codec.readSc2(bytes, fileName);
  const d = deps.host.importSc2(r.value);
  return [...r.diagnostics, ...d];
}

export const saveLoadWindow: WindowFactory = (deps) => {
  const t = bindText(deps.strings);
  const note = noteLine('saves-note');
  const list = h('div', { cls: 'sc2k-win-ledger', testid: 'saves-list' });
  const nameInput = h('input', { type: 'text', cls: 'sc2k-win-input', testid: 'saves-name' });
  const kindSelect = h('select', { cls: 'sc2k-win-input', testid: 'saves-kind' },
    ...(['sc2', 'sc2kweb'] as const).map((k) => h('option', { value: k, text: t(`ui.saves.kind.${k}`), selected: k === DEFAULT_SAVE_KIND })));
  const fileInput = h('input', { type: 'file', accept: '.sc2,.scn,.sc2kweb', testid: 'saves-file', style: { display: 'none' } });
  let urls: string[] = [];
  let busy = false;

  const defaultName = (): string => `${deps.host.state.cityName || 'city'} ${dateOf(deps.host.state.clock).year}`;
  const fail = (e: unknown): void => {
    const msg = e instanceof Error ? e.message : String(e);
    note.say(t('ui.saves.failed', { reason: msg === 'notImplemented' ? t('reject.notImplemented') : msg }), 'error');
  };
  const emit = (type: string, detail: unknown): void => { el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true })); };

  async function thumbnail(): Promise<Blob | null> {
    try {
      const png = await deps.renderer.thumbnail(THUMB_W, THUMB_H);
      return png.length > 0 ? new Blob([new Uint8Array(png)], { type: 'image/png' }) : null;
    } catch { return null; }
  }

  async function save(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const kind = kindSelect.value as SaveKind;
      const bytes = encodeCity(deps, kind);
      const s = deps.host.state;
      const name = nameInput.value.trim() || defaultName();
      const id = await deps.saves.putSave({
        kind, name, cityName: s.cityName, year: dateOf(s.clock).year, population: s.census.citySize, savedAt: Date.now(),
        thumbnail: await thumbnail(), bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      });
      note.say(t('ui.saves.saved', { name }));
      emit(CITY_SAVED_EVENT, { id, kind, name });
      await refreshList();
    } catch (e) { fail(e); } finally { busy = false; }
  }

  async function load(meta: SaveMeta): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const rec = await deps.saves.getSave(meta.id);
      if (!rec) throw new Error('missing');
      const diag = decodeCity(deps, rec.kind, rec.bytes, rec.name + EXT[rec.kind]);
      note.say(diag.length ? `${t('ui.saves.loaded', { name: rec.name })} · ${t('ui.saves.diagnostics', { value: diag.length })}` : t('ui.saves.loaded', { name: rec.name }));
      emit(CITY_LOADED_EVENT, { id: meta.id, kind: rec.kind, name: rec.name, diagnostics: diag });
    } catch (e) { fail(e); } finally { busy = false; }
  }

  async function remove(meta: SaveMeta): Promise<void> {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('ui.saves.confirmDelete'))) return;
    try { await deps.saves.deleteSave(meta.id); await refreshList(); } catch (e) { fail(e); }
  }

  async function download(meta: SaveMeta): Promise<void> {
    try {
      const rec = await deps.saves.getSave(meta.id);
      if (!rec) throw new Error('missing');
      downloadBytes(rec.bytes, `${rec.name}${EXT[rec.kind]}`);
    } catch (e) { fail(e); }
  }

  async function openFile(file: File): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const bytes = await file.arrayBuffer();
      const kind = detectSaveKind(file.name, bytes);
      const diag = decodeCity(deps, kind, bytes, file.name);
      const s = deps.host.state;
      const name = file.name.replace(/\.(sc2|scn|sc2kweb)$/i, '');
      await deps.saves.putSave({ kind, name, cityName: s.cityName, year: dateOf(s.clock).year, population: s.census.citySize, savedAt: Date.now(), thumbnail: null, bytes });
      note.say(diag.length ? `${t('ui.saves.loaded', { name })} · ${t('ui.saves.diagnostics', { value: diag.length })}` : t('ui.saves.loaded', { name }));
      emit(CITY_LOADED_EVENT, { kind, name, diagnostics: diag });
      await refreshList();
    } catch (e) { fail(e); } finally { busy = false; }
  }
  fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) void openFile(f); fileInput.value = ''; });

  async function refreshList(): Promise<void> {
    for (const u of urls) { try { URL.revokeObjectURL(u); } catch { /* 忽略 */ } }
    urls = [];
    let metas: SaveMeta[] = [];
    try { metas = await deps.saves.listSaves(); } catch (e) { fail(e); }
    if (metas.length === 0) { replace(list, h('div', { cls: 'sc2k-win-muted', text: t('ui.saves.empty'), testid: 'saves-empty' })); return; }
    const canUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    replace(list, ...metas.map((m) => {
      let thumb: HTMLElement | null = null;
      if (m.thumbnail && canUrl) { const u = URL.createObjectURL(m.thumbnail); urls.push(u); thumb = h('img', { cls: 'sc2k-win-thumb', attrs: { src: u, alt: '' } }); }
      return h('div', { cls: 'sc2k-win-saverow', testid: 'saves-row', attrs: { 'data-id': String(m.id) } },
        thumb ?? h('div', { cls: 'sc2k-win-thumb sc2k-win-thumb-empty' }),
        h('div', { cls: 'sc2k-win-savemeta' },
          h('div', { cls: 'sc2k-win-cityname', text: m.name }),
          h('div', { cls: 'sc2k-win-muted', text: `${m.cityName} · ${m.year} · ${t('ui.population')} ${thousands(m.population)} · ${t(`ui.saves.kind.${m.kind}`)}` }),
          h('div', { cls: 'sc2k-win-muted', text: `${t('ui.saves.savedAt')} ${timestampLabel(m.savedAt)}` })),
        h('div', { cls: 'sc2k-win-buttons sc2k-win-vertical' },
          btn(t('ui.load'), () => void load(m), { testid: 'saves-load' }),
          btn(t('ui.download'), () => void download(m), { testid: 'saves-download' }),
          btn(t('ui.delete'), () => void remove(m), { testid: 'saves-delete' })));
    }));
  }

  const el = h('div', { cls: 'sc2k-win-body sc2k-win-saves' },
    h('div', { cls: 'sc2k-win-saveform' },
      field(t('ui.saves.name'), nameInput), field(t('ui.saves.kind'), kindSelect),
      h('div', { cls: 'sc2k-win-buttons' },
        btn(t('ui.save'), () => void save(), { testid: 'saves-save', cls: 'sc2k-win-primary' }),
        btn(t('ui.openFile'), () => fileInput.click(), { testid: 'saves-open', title: t('ui.saves.import') }),
        fileInput)),
    note,
    h('div', { cls: 'sc2k-win-subtitle', text: t('ui.saves.title') }),
    list);
  void refreshList();
  return {
    id: 'saveLoad', title: t('window.saveLoad'), el, width: 460,
    onShow: () => { nameInput.value = defaultName(); void refreshList(); },
    destroy: () => { for (const u of urls) { try { URL.revokeObjectURL(u); } catch { /* 忽略 */ } } },
  };
};
