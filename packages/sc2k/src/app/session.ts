// ===== app/session.ts =====（ARCHITECTURE §4.5 两条读档路径、§9.3 saves；spec:ui-art §2.2 File 菜单）
// 会话：新城 / 读档（.sc2 经 sc2Codec.readSc2 → host.importSc2；.sc2kweb 经 host.loadSnapshot）/ 存档到 SaveStore（缩略图经 renderer.thumbnail）
// / 导出 .SC2 或 .sc2kweb 文件下载 / 每游戏年自动存档（.sc2kweb 无损，单条覆盖）/ 接入 AssetImporter.onProviderReady → renderer.setProvider(dat, procedural)。
import type { SimHost } from '../contracts/host';
import type { RendererApi } from '../contracts/rendererApi';
import type { AssetImporter, SaveKind, SaveMeta, SaveStore } from '../contracts/assets';
import type { Sc2Codec } from '../contracts/io';
import type { SpriteProvider } from '../contracts/render';
import type { Diagnostic, NewCityParams } from '../contracts/system';
import type { EventBus } from '../contracts/events';
import { CityMode } from '../contracts/grid';
import { dateOf } from '../contracts/state';

export const AUTOSAVE_NAME = 'autosave';
export const SC2_EXT = '.sc2', SNAPSHOT_EXT = '.sc2kweb';
export const DEFAULT_PLAY_SPEED = 3;
export const THUMB_W = 64, THUMB_H = 48;
const SC2_MAGIC = 'FORM';

export interface SessionDeps {
  host: SimHost; renderer: RendererApi; store: SaveStore; sc2: Sc2Codec; procedural: SpriteProvider;
  importer?: AssetImporter | null; bus?: EventBus;
  /** 文件下载实现（默认 <a download>）；测试注入。 */
  download?(name: string, bytes: Uint8Array, mime: string): void;
  now?(): number;
}
export interface LoadResult { diagnostics: Diagnostic[]; kind: SaveKind }
export interface Session {
  newCity(p: NewCityParams): void;
  importSc2Bytes(buf: ArrayBuffer, fileName?: string): Diagnostic[];
  loadSnapshotBytes(bytes: Uint8Array): Diagnostic[];
  /** 按扩展名 / 魔数识别 .sc2 与 .sc2kweb。 */
  loadBytes(buf: ArrayBuffer, fileName: string): LoadResult;
  openFile(file: File): Promise<LoadResult>;
  exportSc2Bytes(opts?: { compat?: boolean }): Uint8Array;
  snapshotBytes(): Uint8Array;
  /** 存入 SaveStore（默认 kind 'sc2'；编解码器未实现时回退 'sc2kweb'）；返回记录 id。 */
  saveToStore(kind?: SaveKind, name?: string): Promise<number>;
  loadFromStore(id: number): Promise<LoadResult>;
  listSaves(): Promise<SaveMeta[]>;
  deleteSave(id: number): Promise<void>;
  /** 浏览器下载（返回实际使用的扩展名）。 */
  downloadCity(kind?: SaveKind): string;
  /** 每游戏年：写单条自动存档（.sc2kweb）。 */
  autosave(): Promise<void>;
  /** 读档 / 新城后视图复位（居中 + 默认档）。 */
  resetView(): void;
  destroy(): void;
}

const fileBase = (host: SimHost): string => (host.state.cityName || 'city').replace(/[^\w㐀-鿿-]+/g, '_');
const bytesOf = (buf: ArrayBuffer): Uint8Array => new Uint8Array(buf);
const isSc2 = (buf: ArrayBuffer, fileName: string): boolean => {
  const head = String.fromCharCode(...bytesOf(buf).subarray(0, 4));
  return head === SC2_MAGIC || /\.(sc2|scn)$/i.test(fileName);
};

/** 默认下载：Blob + <a download>（无 URL.createObjectURL 的环境静默跳过）。 */
export function browserDownload(name: string, bytes: Uint8Array, mime: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createSession(d: SessionDeps): Session {
  const { host, renderer, store, sc2 } = d;
  const now = d.now ?? (() => Date.now());
  const download = d.download ?? browserDownload;
  const offs: Array<() => void> = [];

  // 导入的原版美术就绪 → 热切换（null = 回到程序化）
  if (d.importer) offs.push(d.importer.onProviderReady((p) => { if (p) renderer.setProvider(p, d.procedural); else renderer.setProvider(d.procedural, null); }));
  if (d.bus) offs.push(d.bus.on('yearClosed', () => { void autosave(); }));

  const resetView = (): void => {
    const v = renderer.getView();
    const s = host.state;
    v.centerX = s.view.x > 0 && s.view.x < 128 ? s.view.x : 64;
    v.centerY = s.view.y > 0 && s.view.y < 128 ? s.view.y : 64;
    v.rotation = s.terrain.rotation;
    v.underground = false;
    renderer.setView(v);
  };
  const afterLoad = (): void => { resetView(); };

  function newCity(p: NewCityParams): void {
    host.newCity(p);
    host.dispatch({ type: 'terrainDone' });                       // 标题页直接进入城市模式（地形编辑器 v2）
    host.dispatch({ type: 'setSpeed', speed: DEFAULT_PLAY_SPEED });
    afterLoad();
  }
  function importSc2Bytes(buf: ArrayBuffer, fileName?: string): Diagnostic[] {
    const r = sc2.readSc2(buf, fileName);
    const diag = [...r.diagnostics, ...host.importSc2(r.value)];
    if (host.state.clock.mode === CityMode.TerrainEdit) host.dispatch({ type: 'terrainDone' });
    afterLoad();
    return diag;
  }
  function loadSnapshotBytes(bytes: Uint8Array): Diagnostic[] {
    const diag = host.loadSnapshot(bytes);
    afterLoad();
    return diag;
  }
  function loadBytes(buf: ArrayBuffer, fileName: string): LoadResult {
    if (isSc2(buf, fileName)) return { kind: 'sc2', diagnostics: importSc2Bytes(buf, fileName) };
    return { kind: 'sc2kweb', diagnostics: loadSnapshotBytes(bytesOf(buf)) };
  }
  const exportSc2Bytes = (opts?: { compat?: boolean }): Uint8Array => bytesOf(sc2.writeSc2(host.exportSc2(opts)));
  const snapshotBytes = (): Uint8Array => host.saveSnapshot();
  /** 优先 .SC2；编解码器 / 系统尚未实现时回退无损快照。 */
  const encode = (kind: SaveKind): { kind: SaveKind; bytes: Uint8Array } => {
    if (kind === 'sc2') { try { return { kind: 'sc2', bytes: exportSc2Bytes({ compat: true }) }; } catch { /* 回退 */ } }
    return { kind: 'sc2kweb', bytes: snapshotBytes() };
  };
  const thumbnail = async (): Promise<Blob | null> => {
    try { const png = await renderer.thumbnail(THUMB_W, THUMB_H); return typeof Blob === 'undefined' ? null : new Blob([png.slice().buffer], { type: 'image/png' }); } catch { return null; }
  };
  const meta = (): { cityName: string; year: number; population: number } => ({ cityName: host.state.cityName, year: dateOf(host.state.clock).year, population: host.state.census.citySize });
  async function saveToStore(kind: SaveKind = 'sc2', name?: string): Promise<number> {
    const enc = encode(kind);
    return store.putSave({ kind: enc.kind, name: name ?? host.state.cityName, ...meta(), savedAt: now(), thumbnail: await thumbnail(), bytes: enc.bytes.slice().buffer });
  }
  async function loadFromStore(id: number): Promise<LoadResult> {
    const rec = await store.getSave(id);
    if (!rec) throw new Error(`session: 存档 ${id} 不存在`);
    return loadBytes(rec.bytes, rec.kind === 'sc2' ? `${rec.name}${SC2_EXT}` : `${rec.name}${SNAPSHOT_EXT}`);
  }
  function downloadCity(kind: SaveKind = 'sc2'): string {
    const enc = encode(kind);
    const ext = enc.kind === 'sc2' ? SC2_EXT : SNAPSHOT_EXT;
    download(`${fileBase(host)}${ext}`, enc.bytes, 'application/octet-stream');
    return ext;
  }
  async function autosave(): Promise<void> {
    try {
      const list = await store.listSaves();
      const prev = list.find((m) => m.name === AUTOSAVE_NAME && m.kind === 'sc2kweb');
      await store.putSave({ ...(prev ? { id: prev.id } : {}), kind: 'sc2kweb', name: AUTOSAVE_NAME, ...meta(), savedAt: now(), thumbnail: null, bytes: snapshotBytes().slice().buffer });
    } catch (err) { console.warn('[sc2k] autosave failed', err); }
  }
  return {
    newCity, importSc2Bytes, loadSnapshotBytes, loadBytes,
    openFile: async (file) => loadBytes(await file.arrayBuffer(), file.name),
    exportSc2Bytes, snapshotBytes, saveToStore, loadFromStore,
    listSaves: () => store.listSaves(), deleteSave: (id) => store.deleteSave(id),
    downloadCity, autosave, resetView,
    destroy: () => { for (const off of offs) off(); },
  };
}
