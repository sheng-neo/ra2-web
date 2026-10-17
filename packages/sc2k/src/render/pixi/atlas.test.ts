// ===== render/pixi/atlas.test.ts =====（WORKPLAN WP11 验收：页打包不重叠、句柄对 (key, scale) 稳定、回退链顺序；无 WebGL，Pixi 对象在 Node 下构造）
import { describe, expect, it } from 'vitest';
import type { SpriteKey } from '../../contracts/render';
import { createAtlas } from './atlas';
import type { AtlasRect } from './atlas';
import { bakeRgba, nearestUpscale, placeholderBitmap, resolveBitmap, sampleDownscale } from './resolve';
import { createFakeProvider, makePalette } from './fixtures';

const overlaps = (a: AtlasRect, b: AtlasRect): boolean => a.page === b.page && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const key = (id: number, kind: SpriteKey['kind'] = 'xbld'): SpriteKey => ({ kind, id });

describe('atlas：shelf 打包', () => {
  it('多页打包：矩形两两不重叠、不越界、Texture.frame 与登记矩形一致', () => {
    const atlas = createAtlas({ pageSize: 256, maxPages: 64, padding: 1 });
    atlas.setProviders(createFakeProvider({ scales: ['S', 'M', 'L'] }), null);
    const entries = [];
    for (let id = 1; id < 200; id++) entries.push(atlas.get(key(id), 'M'));
    for (let id = 0; id < 14; id++) entries.push(atlas.get(key(id, 'terrain'), 'M'));
    const rects = atlas.pages().flatMap((p) => p.rects);
    expect(rects.length).toBe(entries.length);
    expect(atlas.pageCount).toBeGreaterThan(1);
    for (const p of atlas.pages()) for (const r of p.rects) { expect(r.x + r.w).toBeLessThanOrEqual(p.size); expect(r.y + r.h).toBeLessThanOrEqual(p.size); }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!), `rect ${i} vs ${j}`).toBe(false);
    for (const e of entries) {
      const f = e.texture.frame;
      expect([f.width, f.height]).toEqual([e.w, e.h]);
      const r = rects.find((q) => q.page === e.page && q.x === f.x && q.y === f.y);
      expect(r).toBeDefined();
    }
    // 每页只放同一档
    for (const p of atlas.pages()) expect(p.scale).toBe('M');
    expect(atlas.vramBytes).toBe(atlas.pageCount * 256 * 256 * 4);
  });
  it('超过页尺寸的精灵得到一张专属页；flush 只上传脏页一次', () => {
    const atlas = createAtlas({ pageSize: 64, maxPages: 8 });
    atlas.setProviders(createFakeProvider({ sizeOf: () => [100, 30] }), null);
    const e = atlas.get(key(1), 'M');
    expect([e.w, e.h]).toEqual([100, 30]);
    const page = atlas.pages().find((p) => p.id === e.page)!;
    expect(page.size).toBeGreaterThanOrEqual(101);
    expect(atlas.flush()).toBe(1);
    expect(atlas.flush()).toBe(0);
    atlas.get(key(2), 'M');
    expect(atlas.flush()).toBe(1);
    expect(atlas.stats().uploads).toBe(2);
  });
});

describe('atlas：句柄缓存', () => {
  it('同 (key, scale) 恒返回同一 Entry / Texture；不同 scale 或不同 key 不同', () => {
    const atlas = createAtlas();
    const prov = createFakeProvider();
    atlas.setProviders(prov, null);
    const a = atlas.get(key(0x70), 'M'), b = atlas.get(key(0x70), 'M');
    expect(a).toBe(b);
    expect(a.texture).toBe(b.texture);
    expect(atlas.get(key(0x70), 'L')).not.toBe(a);
    expect(atlas.get(key(0x71), 'M')).not.toBe(a);
    expect(atlas.get({ kind: 'xbld', id: 0x70, variant: 1 }, 'M')).not.toBe(a);
    expect(atlas.peek(key(0x70), 'M')).toBe(a);
    expect(atlas.peek(key(0x99), 'M')).toBeUndefined();
    expect(prov.calls).toBe(4);           // 缓存命中不再调用 provider
    expect(atlas.isValid(a)).toBe(true);
    expect(atlas.entryCount).toBe(4);
  });
  it('release 后旧句柄失效（source 已销毁、generation 变化），再次 get 得到新句柄', () => {
    const atlas = createAtlas();
    atlas.setProviders(createFakeProvider(), null);
    const a = atlas.get(key(1), 'M');
    const gen = atlas.generation;
    atlas.release();
    expect(atlas.generation).toBe(gen + 1);
    expect(atlas.isValid(a)).toBe(false);
    expect(a.texture.source.destroyed).toBe(true);
    expect(atlas.vramBytes).toBe(0);
    const b = atlas.get(key(1), 'M');
    expect(b).not.toBe(a);
    expect(atlas.isValid(b)).toBe(true);
  });
  it('页数达到上限时驱逐其它档的页（当前档句柄不受影响）', () => {
    const atlas = createAtlas({ pageSize: 64, maxPages: 2 });
    atlas.setProviders(createFakeProvider({ sizeOf: () => [30, 30] }), null);
    const m: ReturnType<typeof atlas.get>[] = [];
    for (let id = 1; id <= 8; id++) m.push(atlas.get(key(id), 'M'));   // 每页 4 张 → 2 页 M
    expect(atlas.pageCount).toBe(2);
    const s = atlas.get(key(1), 'S');                                   // 需要新页 → 驱逐 M 页
    expect(atlas.stats().evictions).toBe(2);
    expect(atlas.pageCount).toBe(1);
    expect(m.every((e) => !atlas.isValid(e))).toBe(true);
    expect(atlas.isValid(s)).toBe(true);
    expect(atlas.vramBytes).toBe(64 * 64 * 4);
    expect(atlas.get(key(1), 'S')).toBe(s);
    expect(atlas.maxSpriteHeight('M')).toBe(0);
    expect(atlas.maxSpriteHeight('S')).toBe(30);
  });
});

describe('atlas：回退链（spec:ui-art §3.4）', () => {
  const dat = createFakeProvider({ name: 'dat', scales: ['XS', 'S', 'M'], has: (k) => k.id === 1 });
  const proc = createFakeProvider({ name: 'procedural', scales: ['S', 'M', 'L'] });
  it('primary 原生 → primary 整数放大 → fallback（受 M 上限）→ 占位', () => {
    const atlas = createAtlas();
    atlas.setProviders(dat, proc);
    const nativeM = atlas.get(key(1), 'M');
    expect(nativeM.source).toBe('primary');
    expect([nativeM.w, nativeM.h]).toEqual([32 + 5, 16 + 11]);
    const upL = atlas.get(key(1), 'L');                                 // DAT 无 L：M ×2，不去 procedural 拿原生 L
    expect(upL.source).toBe('primary');
    expect([upL.w, upL.h]).toEqual([(32 + 5) * 2, (16 + 11) * 2]);
    expect([upL.anchorX, upL.anchorY]).toEqual([nativeM.anchorX * 2, nativeM.anchorY * 2]);
    const fbL = atlas.get(key(2), 'L');                                 // DAT 没有 → procedural，但取 M ×2（同屏像素密度）
    expect(fbL.source).toBe('fallback');
    const procM = proc.bitmap(key(2), 'M')!;
    expect([fbL.w, fbL.h]).toEqual([procM.w * 2, procM.h * 2]);
    const fbXS = atlas.get(key(2), 'XS');                               // procedural 无 XS：S ÷2 取样
    expect(fbXS.source).toBe('fallback');
    const procS = proc.bitmap(key(2), 'S')!;
    expect([fbXS.w, fbXS.h]).toEqual([procS.w >> 1, procS.h >> 1]);
    const none = createAtlas();
    none.setProviders(createFakeProvider({ has: () => false }), createFakeProvider({ has: () => false }));
    const ph = none.get(key(3), 'M');
    expect(ph.source).toBe('placeholder');
    expect([ph.w, ph.h]).toEqual([32, 16]);
    expect(none.stats().placeholders).toBe(1);
  });
  it('mixedDensity=true 时 fallback 取原生 L；primary 为 procedural 时无上限', () => {
    const mixed = createAtlas({ mixedDensity: true });
    mixed.setProviders(dat, proc);
    const e = mixed.get(key(2), 'L');
    const procL = proc.bitmap(key(2), 'L')!;
    expect([e.w, e.h]).toEqual([procL.w, procL.h]);
    const r = resolveBitmap(proc, dat, key(2), 'L');
    expect(r.source).toBe('primary');
    expect(r.bmp).toBe(procL);
  });
  it('没有 primary 时直接走 fallback；两者皆无 → 占位菱形（锚点 (W/2, H)）', () => {
    expect(resolveBitmap(null, proc, key(5), 'M').source).toBe('fallback');
    const ph = resolveBitmap(null, null, key(5), 'S');
    expect(ph.source).toBe('placeholder');
    expect(ph.bmp).toBe(placeholderBitmap('S'));
    expect([ph.bmp.anchorX, ph.bmp.anchorY]).toEqual([8, 8]);
  });
  it('nearestUpscale / sampleDownscale 的像素与锚点规则；opaque 掩码同步', () => {
    const src = { w: 2, h: 2, data: new Uint8Array([1, 2, 3, 4]), anchorX: 1, anchorY: 2, cycling: false, opaque: new Uint8Array([1, 0, 1, 1]) };
    const up = nearestUpscale(src, 2);
    expect(Array.from(up.data)).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4]);
    expect(Array.from(up.opaque!)).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect([up.anchorX, up.anchorY]).toEqual([2, 4]);
    const down = sampleDownscale(up, 2);
    expect(Array.from(down.data)).toEqual([1, 2, 3, 4]);
    expect([down.anchorX, down.anchorY]).toEqual([1, 2]);
  });
  it('调色板 LUT 烘焙：索引 0 透明（procedural）/ opaque 掩码优先（DAT 索引 0 = 合法黑）', () => {
    const pal = makePalette();
    const dst = new Uint8Array(4 * 4 * 4);
    bakeRgba({ w: 2, h: 1, data: new Uint8Array([0, 9]), anchorX: 0, anchorY: 0, cycling: false }, pal, dst, 4, 1, 1);
    const at = (x: number, y: number): number[] => Array.from(dst.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
    expect(at(1, 1)).toEqual([0, 0, 0, 0]);
    expect(at(2, 1)).toEqual([pal.rgba[36]!, pal.rgba[37]!, pal.rgba[38]!, 255]);
    bakeRgba({ w: 2, h: 1, data: new Uint8Array([0, 9]), anchorX: 0, anchorY: 0, cycling: false, opaque: new Uint8Array([1, 0]) }, pal, dst, 4, 1, 2);
    expect(at(1, 2)).toEqual([pal.rgba[0]!, pal.rgba[1]!, pal.rgba[2]!, pal.rgba[3]!]);
    expect(at(2, 2)).toEqual([0, 0, 0, 0]);
  });
});
