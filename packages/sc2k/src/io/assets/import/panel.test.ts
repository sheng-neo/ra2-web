// @vitest-environment happy-dom
// 最小导入面板：mount / unmount、文件导入 → 入库 → 解码 → "使用原版美术"开关 → onProviderReady；启动序列缓存命中；
// 部分启用；.SC2 入存档库；拒绝项；清除缓存。Sc2Codec 用假实现（WP2 的真 codec 在本分支为抛错桩）。
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Sc2Codec, Sc2Document } from '../../../contracts/io';
import { MISC, miscSet } from '../../../contracts/io';
import type { SpriteProvider } from '../../../contracts/render';
import { createIndexedDbAssetStore } from './store';
import { createAssetImporter } from './panel';
import { newDocument } from '../../sc2';
import { synthSpriteSet } from '../sprites/__fixtures__/synth';

const synth = synthSpriteSet();
const fileOf = (buf: ArrayBuffer | Uint8Array, name: string): File => new File([(buf instanceof Uint8Array ? buf.slice() : new Uint8Array(buf)) as BlobPart], name, { lastModified: 7 });
const FULL = (): File[] => [fileOf(synth.large, 'LARGE.DAT'), fileOf(synth.smallmed, 'SMALLMED.DAT'), fileOf(synth.special, 'SPECIAL.DAT'), fileOf(synth.palette, 'PAL_MSTR.BMP')];
const okCodec: Sc2Codec = {
  readSc2: (_buf, _name) => {
    const doc: Sc2Document = { ...newDocument(), cityName: 'Riverbend' };
    miscSet(doc.misc, MISC.yearFounded, 1950); miscSet(doc.misc, MISC.cityAge, 601); miscSet(doc.misc, MISC.normalPop, 1234); miscSet(doc.misc, MISC.arcoPop, 6);
    return { value: doc, diagnostics: [] };
  },
  writeSc2: () => new ArrayBuffer(0),
  newDocument,
};
const failCodec: Sc2Codec = { readSc2: () => { throw new Error('notImplemented'); }, writeSc2: () => new ArrayBuffer(0), newDocument };
const sc2File = (): File => { const b = new Uint8Array(64); b.set([70, 79, 82, 77], 0); b.set([83, 67, 68, 72], 8); return fileOf(b, 'town.sc2'); };
const noWorker = () => null;

describe('createAssetImporter（最小面板）', () => {
  it('mount 渲染面板元素，unmount 移除；再次 mount 复用', async () => {
    const store = createIndexedDbAssetStore({ factory: new IDBFactory() });
    const imp = createAssetImporter(store, failCodec, { spawnWorker: noWorker });
    const el = document.createElement('div');
    imp.mount(el);
    await imp.ready;
    const q = (id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);
    expect(q('assets-panel')).not.toBeNull();
    expect((q('assets-file-input') as HTMLInputElement).multiple).toBe(true);
    expect((q('assets-use-original') as HTMLInputElement).checked).toBe(false);
    expect(q('assets-status')!.textContent).toContain('未启用');
    expect(q('assets-clear')).not.toBeNull();
    expect(el.textContent).toContain('不会上传');
    imp.unmount();
    expect(q('assets-panel')).toBeNull();
    imp.mount(el);
    expect(q('assets-panel')).not.toBeNull();
    imp.dispose();
  });

  it('导入四个文件 → 入库 → 解码 → 开关打开后 onProviderReady 收到 dat provider；关闭收到 null；迟到的订阅立即收到当前 provider', async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbAssetStore({ factory });
    const imp = createAssetImporter(store, failCodec, { spawnWorker: noWorker });
    const got: (SpriteProvider | null)[] = [];
    const off = imp.onProviderReady((p) => got.push(p));
    const el = document.createElement('div');
    imp.mount(el);
    await imp.ready;
    const st = await imp.importFiles(FULL());
    expect(st.rows.map((r) => [r.kind, r.status])).toEqual([['LARGE', 'stored'], ['SMALLMED', 'stored'], ['SPECIAL', 'stored'], ['PAL_MSTR', 'stored']]);
    expect(st.art).toBe('enabled');
    expect(st.missing).toEqual([]);
    expect(st.provider?.name).toBe('dat');
    expect(got).toEqual([]);                                           // 开关未打开：不切换
    expect(el.querySelector('[data-testid="assets-status"]')!.textContent).toContain('已启用');
    expect(el.querySelectorAll('[data-testid="assets-files"] li[data-kind]').length).toBe(4);
    expect((await store.getFile('LARGE'))!.bytes.byteLength).toBe(synth.large.byteLength);

    await imp.setUseOriginalArt(true);
    expect(got.length).toBe(1);
    expect(got[0]!.name).toBe('dat');
    expect(got[0]!.has({ kind: 'xbld', id: 0x70 }, 'M')).toBe(true);
    expect((await store.getPrefs()).useOriginalArt).toBe(true);
    expect((el.querySelector('[data-testid="assets-use-original"]') as HTMLInputElement).checked).toBe(true);
    const late: (SpriteProvider | null)[] = [];
    imp.onProviderReady((p) => late.push(p));
    expect(late).toEqual([got[0]]);
    await imp.setUseOriginalArt(false);
    expect(got[1]).toBeNull();
    off();
    await imp.setUseOriginalArt(true);
    expect(got.length).toBe(2);                                        // 已退订
    imp.dispose();
  });

  it('启动序列（§3.9.6）：prefs 为真且文件已在库 → mount 后直接从 decoded 缓存重建并回调，不再解码', async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbAssetStore({ factory });
    const first = createAssetImporter(store, failCodec, { spawnWorker: noWorker });
    first.mount(document.createElement('div'));
    await first.ready;
    await first.importFiles(FULL());
    await first.setUseOriginalArt(true);
    first.dispose();

    let decodedReads = 0, decodedWrites = 0;
    const spied = { ...store, getDecoded: (k: string) => { decodedReads++; return store.getDecoded(k); }, putDecoded: (k: string, v: Parameters<typeof store.putDecoded>[1]) => { decodedWrites++; return store.putDecoded(k, v); } };
    const second = createAssetImporter(spied, failCodec, { spawnWorker: () => { throw new Error('不应解码'); } });
    const got: (SpriteProvider | null)[] = [];
    second.onProviderReady((p) => got.push(p));
    second.mount(document.createElement('div'));
    await second.ready;
    expect(decodedReads).toBe(1);
    expect(decodedWrites).toBe(0);
    expect(got.length).toBe(1);
    expect(got[0]!.name).toBe('dat');
    expect(got[0]!.bitmap({ kind: 'terrain', id: 0 }, 'XS')!.h).toBe(5);
    expect(second.getState().art).toBe('enabled');
    second.dispose();
  });

  it('部分启用：只有 LARGE + PAL_MSTR → art partial、missing 含 SMALLMED；provider 只有 M 档', async () => {
    const store = createIndexedDbAssetStore({ factory: new IDBFactory() });
    const imp = createAssetImporter(store, failCodec, { spawnWorker: noWorker });
    const got: (SpriteProvider | null)[] = [];
    imp.onProviderReady((p) => got.push(p));
    imp.mount(document.createElement('div'));
    await imp.ready;
    await imp.setUseOriginalArt(true);
    expect(got).toEqual([]);                                           // 没文件：没有 provider 可给
    const st = await imp.importFiles([fileOf(synth.large, 'LARGE.DAT'), fileOf(synth.palette, 'PAL_MSTR.BMP')]);
    expect(st.art).toBe('partial');
    expect(st.missing).toEqual(['SMALLMED']);
    expect(got.length).toBe(1);
    expect(got[0]!.has({ kind: 'xbld', id: 0x70 }, 'M')).toBe(true);
    expect(got[0]!.has({ kind: 'xbld', id: 0x70 }, 'S')).toBe(false);
    // 再补 SMALLMED → 重建、再次回调新 provider
    await imp.importFiles([fileOf(synth.smallmed, 'SMALLMED.DAT')]);
    expect(got.length).toBe(2);
    expect(got[1]!.has({ kind: 'xbld', id: 0x70 }, 'S')).toBe(true);
    expect(imp.getState().art).toBe('enabled');
    imp.dispose();
  });

  it('只有精灵没有调色板 → 未启用并给出 PALETTE_MISSING 诊断；PAL_STTC 可作回退（partial + PALETTE_FALLBACK）', async () => {
    const store = createIndexedDbAssetStore({ factory: new IDBFactory() });
    const imp = createAssetImporter(store, failCodec, { spawnWorker: noWorker });
    const el = document.createElement('div');
    imp.mount(el);
    await imp.ready;
    const st = await imp.importFiles([fileOf(synth.large, 'LARGE.DAT'), fileOf(synth.smallmed, 'SMALLMED.DAT')]);
    expect(st.art).toBe('disabled');
    expect(st.diagnostics.map((d) => d.code)).toContain('PALETTE_MISSING');
    expect(el.querySelector('[data-testid="assets-diagnostics"] li[data-code="PALETTE_MISSING"]')).not.toBeNull();
    const st2 = await imp.importFiles([fileOf(synth.palette, 'PAL_STTC.BMP')]);
    expect(st2.art).toBe('partial');
    expect(st2.missing).toEqual(['PAL_MSTR']);
    expect(st2.diagnostics.map((d) => d.code)).toContain('PALETTE_FALLBACK');
    imp.dispose();
  });

  it('.SC2 经 Sc2Codec 校验后进 saves（kind sc2、城市名 / 年份 / 人口）；codec 失败 → rejected SC2_READ_FAILED', async () => {
    const store = createIndexedDbAssetStore({ factory: new IDBFactory() });
    const imp = createAssetImporter(store, okCodec, { spawnWorker: noWorker, now: () => 5555 });
    imp.mount(document.createElement('div'));
    await imp.ready;
    const st = await imp.importFiles([sc2File()]);
    expect(st.rows[0]).toMatchObject({ kind: 'SC2', status: 'saved', codes: [] });
    const saves = await store.listSaves();
    expect(saves.length).toBe(1);
    expect(saves[0]).toMatchObject({ kind: 'sc2', name: 'town.sc2', cityName: 'Riverbend', year: 1952, population: 1240, savedAt: 5555, thumbnail: null });
    expect((await store.getSave(saves[0]!.id))!.bytes.byteLength).toBe(64);
    imp.dispose();
    const imp2 = createAssetImporter(store, failCodec, { spawnWorker: noWorker });
    const st2 = await imp2.importFiles([sc2File()]);
    expect(st2.rows[0]).toMatchObject({ kind: 'SC2', status: 'rejected' });
    expect(st2.rows[0]!.codes).toContain('SC2_READ_FAILED');
    expect((await store.listSaves()).length).toBe(1);
    imp2.dispose();
  });

  it('无法识别的文件与名实不符的文件：rejected 并带错误码；面板列出状态', async () => {
    const store = createIndexedDbAssetStore({ factory: new IDBFactory() });
    const imp = createAssetImporter(store, failCodec, { spawnWorker: noWorker });
    const el = document.createElement('div');
    imp.mount(el);
    await imp.ready;
    const junk = new TextEncoder().encode('definitely not a sprite file, just some text .................');
    const st = await imp.importFiles([fileOf(junk, 'LARGE.DAT'), fileOf(junk, 'notes.txt'), fileOf(synth.smallmed, 'renamed.bin')]);
    expect(st.rows.map((r) => [r.kind, r.status, r.codes[0]])).toEqual([['UNKNOWN', 'rejected', 'BAD_MAGIC'], ['UNKNOWN', 'rejected', 'UNKNOWN_FILE'], ['SMALLMED', 'stored', 'IDENTIFIED_BY_MAGIC']]);
    expect(await store.getFile('LARGE')).toBeUndefined();
    expect(await store.getFile('SMALLMED')).toBeDefined();
    const lis = [...el.querySelectorAll('[data-testid="assets-rows"] li')];
    expect(lis.map((li) => li.getAttribute('data-status'))).toEqual(['rejected', 'rejected', 'stored']);
    expect(lis[0]!.textContent).toContain('内容不是对应的格式');
    imp.dispose();
  });

  it('清除本地缓存：文件 / 解码缓存 / 偏好清空、回调 null、存档保留', async () => {
    const store = createIndexedDbAssetStore({ factory: new IDBFactory() });
    const imp = createAssetImporter(store, okCodec, { spawnWorker: noWorker });
    const got: (SpriteProvider | null)[] = [];
    imp.onProviderReady((p) => got.push(p));
    const el = document.createElement('div');
    imp.mount(el);
    await imp.ready;
    await imp.importFiles([...FULL(), sc2File()]);
    await imp.setUseOriginalArt(true);
    expect(got.length).toBe(1);
    (el.querySelector('[data-testid="assets-clear"]') as HTMLButtonElement).click();
    await imp.refresh();                                               // 排队在 clearCache 之后
    expect(got[1]).toBeNull();
    expect(imp.getState().art).toBe('disabled');
    expect(await store.getFile('LARGE')).toBeUndefined();
    expect((await store.listSaves()).length).toBe(1);
    expect(el.querySelector('[data-testid="assets-status"]')!.textContent).toContain('未启用');
    imp.dispose();
  });

  it('文案可由 Strings 覆盖（有键用表、缺键回退本地）', async () => {
    const store = createIndexedDbAssetStore({ factory: new IDBFactory() });
    const strings = { lang: 'en' as const, has: (k: string) => k === 'assets.useOriginal', t: (k: string) => (k === 'assets.useOriginal' ? 'Use my files' : k) };
    const imp = createAssetImporter(store, failCodec, { spawnWorker: noWorker, strings });
    const el = document.createElement('div');
    imp.mount(el);
    await imp.ready;
    expect(el.textContent).toContain('Use my files');
    expect(el.textContent).toContain('Original artwork: not enabled');
    imp.dispose();
  });
});
