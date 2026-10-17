// WP14 验收：DatSpriteProvider 锚点 (w/2, h−1)、has 只回答 XS/S/M、缺 key 回 null、idLayout 对 overlay:Fire 等有映射、
// 合成夹具 DAT 解码后 bitmap 非空；另含 decodeBundle（跨文件 SPECIAL 覆盖、缺调色板）、buildIdLayout 的段剔除、图集装箱 / 页编码往返。
import { describe, expect, it } from 'vitest';
import { ActorId, OverlayId, XUND_PIPE_STUB } from '../../../contracts/render';
import type { ArtScale, SpriteKey } from '../../../contracts/render';
import { decodeBundle } from './bundle';
import { createDatSpriteProvider, DAT_NATIVE_SCALES } from './provider';
import { DAT_TILE, REL, ZOOM_BASE, buildIdLayout, layoutKey } from './ids';
import type { Diagnostic } from '../../../contracts/system';
import { decodeAtlasPage, encodeAtlasPage, extractFrame, packSprites, ATLAS_PAGE_W } from './atlas';
import { compareGrid, synthPaletteRgb, synthSpriteSet, gridOf } from './__fixtures__/synth';

const synth = synthSpriteSet();
const bundle = decodeBundle({ large: synth.large, smallmed: synth.smallmed, special: synth.special, palette: synth.palette });
const provider = createDatSpriteProvider(bundle, bundle.palette!);
const key = (kind: SpriteKey['kind'], id: number, extra: Partial<SpriteKey> = {}): SpriteKey => ({ kind, id, ...extra });

describe('decodeBundle（合成三档集）', () => {
  it('三个文件 + 调色板：精灵数、文件顺序、SPECIAL 覆盖诊断、无 error、无 LARGE_SANITY / DAT_ALIGN_SUSPECT', () => {
    expect(bundle.files).toEqual(['SMALLMED', 'SPECIAL', 'LARGE']);
    expect(bundle.spriteCount).toBe(synth.grids.size);
    expect(bundle.palette).not.toBeNull();
    const codes = bundle.diagnostics.map((d) => d.code);
    expect(codes).toContain('SPECIAL_OVERRIDE');
    expect(codes).not.toContain('LARGE_SANITY');
    expect(codes).not.toContain('DAT_ALIGN_SUSPECT');
    expect(bundle.diagnostics.filter((d) => d.level === 'error')).toEqual([]);
    expect(bundle.frames.size).toBe(synth.grids.size);
  });
  it('只有 LARGE 且无调色板：PALETTE_MISSING warn、palette null', () => {
    const b = decodeBundle({ large: synth.large });
    expect(b.palette).toBeNull();
    expect(b.diagnostics.some((d) => d.code === 'PALETTE_MISSING' && d.level === 'warn')).toBe(true);
    expect(b.files).toEqual(['LARGE']);
  });
  it('坏的精灵文件只产生 error 诊断、不抛错；坏调色板产生 PALETTE_FORMAT', () => {
    const b = decodeBundle({ large: new Uint8Array([0, 9, 1, 2, 3]).buffer, palette: new Uint8Array([1, 2, 3, 4]).buffer });
    expect(b.spriteCount).toBe(0);
    expect(b.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(['SPRITE_HEADER_TRUNCATED', 'PALETTE_FORMAT']));
  });
});

describe('DatSpriteProvider', () => {
  it('name dat、nativeScales = {XS,S,M}、frameCount 1、fps 0、调色板来自 BMP（alpha 255）', () => {
    expect(provider.name).toBe('dat');
    expect([...provider.nativeScales].sort()).toEqual(['M', 'S', 'XS']);
    expect(provider.nativeScales).toBe(DAT_NATIVE_SCALES);
    expect(provider.frameCount(key('xbld', 0x70))).toBe(1);
    expect(provider.fps(key('xbld', 0x70))).toBe(0);
    const rgb = synthPaletteRgb();
    for (const i of [0, 1, 77, 255]) {
      expect(Array.from(provider.palette.rgba.subarray(i * 4, i * 4 + 4))).toEqual([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255]);
    }
    expect(provider.palette.cycles).toEqual([]);
  });

  it('锚点 (w/2, h−1)：1×1 地块三档与多格建筑', () => {
    for (const [scale, zoom] of [['XS', 'small'], ['S', 'medium'], ['M', 'large']] as const) {
      const b = provider.bitmap(key('terrain', 0), scale)!;
      expect([b.w, b.h]).toEqual([DAT_TILE[zoom].w, DAT_TILE[zoom].h]);
      expect([b.anchorX, b.anchorY]).toEqual([b.w / 2, b.h - 1]);
    }
    const big = provider.bitmap(key('xbld', 0xfb), 'M')!;                 // 4 格宽建筑
    expect(big.w).toBe(32 * 4);
    expect([big.anchorX, big.anchorY]).toEqual([big.w / 2, big.h - 1]);
    expect(big.cycling).toBe(false);
  });

  it('has 只回答 XS/S/M；L / XL 恒 false 且 bitmap 为 null', () => {
    for (const s of ['XS', 'S', 'M'] as ArtScale[]) expect(provider.has(key('xbld', 0x70), s)).toBe(true);
    for (const s of ['L', 'XL'] as ArtScale[]) { expect(provider.has(key('xbld', 0x70), s)).toBe(false); expect(provider.bitmap(key('xbld', 0x70), s)).toBeNull(); }
  });

  it('缺 key 回 null：不在夹具里的 xbld、未映射的 overlay、ui 族、某档缺失', () => {
    expect(provider.has(key('xbld', 0x33), 'M')).toBe(false);
    expect(provider.bitmap(key('xbld', 0x33), 'M')).toBeNull();
    expect(provider.has(key('overlay', OverlayId.Flood), 'M')).toBe(false);
    expect(provider.has(key('overlay', OverlayId.Toxic), 'S')).toBe(false);
    expect(provider.has(key('ui', 0), 'M')).toBe(false);
    // SPECIAL 独有的 medium 精灵：S 有、M / XS 没有
    expect(provider.has(key('xbld', 0x71), 'S')).toBe(true);
    expect(provider.has(key('xbld', 0x71), 'M')).toBe(false);
    expect(provider.has(key('xbld', 0x71), 'XS')).toBe(false);
    expect(provider.absoluteId(key('xbld', 0x71), 'S')).toBe(synth.specialUniqueId);
  });

  it('idLayout：overlay:Fire / NoPower / Zone* / Preview*、actor:Plane / Explosion / Deploy*、terrain / water / xund 的相对号', () => {
    const L = bundle.idLayout;
    expect(L[layoutKey('overlay', OverlayId.Fire)]).toBe(REL.fireBase);
    expect(L[layoutKey('overlay', OverlayId.NoPower)]).toBe(REL.noPower);
    expect(L[layoutKey('overlay', OverlayId.ZoneRLight)]).toBe(REL.zoneTintBase);
    expect(L[layoutKey('overlay', OverlayId.ZoneSeaport)]).toBe(REL.zoneTintBase + 8);
    expect(L[layoutKey('overlay', OverlayId.PreviewOk)]).toBe(REL.tintBase);
    expect(L[layoutKey('overlay', OverlayId.PreviewBad)]).toBe(REL.tintBase + 3);
    expect(L[layoutKey('actor', ActorId.Plane)]).toBe(REL.planeBase);
    expect(L[layoutKey('actor', ActorId.Explosion)]).toBe(REL.explosionBase);
    expect(L[layoutKey('actor', ActorId.DeployFire)]).toBe(REL.deployFire);
    expect(L[layoutKey('actor', ActorId.Nessie)]).toBe(REL.nessie);
    expect(L[layoutKey('terrain', 13)]).toBe(REL.terrainBase + 13);
    expect(L[layoutKey('water', 20)]).toBe(REL.waterBase + 20);
    expect(L[layoutKey('xbld', 0x9d)]).toBe(0x9d);
    // 夹具里没有地下精灵 → 整段未对齐，不出现在布局里
    expect(L[layoutKey('xund', 0x10)]).toBeUndefined();
    expect(L[layoutKey('xund', XUND_PIPE_STUB)]).toBeUndefined();
    expect(L[layoutKey('overlay', OverlayId.Flood)]).toBeUndefined();
    const unresolved = bundle.diagnostics.filter((d) => d.code === 'ID_LAYOUT_UNRESOLVED').map((d) => d.at);
    expect(unresolved).toEqual(expect.arrayContaining(['xund.subway', 'xund.pipe', 'actor.helicopter', 'actor.ship', 'actor.train']));
    expect(unresolved).not.toContain('actor.plane');
    expect(unresolved).not.toContain('overlay.zone');
    expect(L[layoutKey('actor', ActorId.Helicopter)]).toBeUndefined();
    expect(L[layoutKey('actor', ActorId.Sailboat)]).toBe(REL.sailboatBase);
  });

  it('bitmap 非空且与合成网格逐像素一致（含索引 0 合法像素的 opaque 掩码）；SPECIAL 覆盖 SMALLMED 同号', () => {
    const checks: [SpriteKey, ArtScale, number][] = [
      [key('terrain', 0), 'M', ZOOM_BASE.large + REL.terrainBase], [key('water', 3), 'XS', ZOOM_BASE.small + REL.waterBase + 3],
      [key('overlay', OverlayId.Fire), 'S', ZOOM_BASE.medium + REL.fireBase], [key('xbld', 0x70), 'S', synth.specialOverrideId],
      [key('xbld', 0x71), 'S', synth.specialUniqueId], [key('actor', ActorId.Plane, { variant: 3 }), 'M', ZOOM_BASE.large + REL.planeBase],
      [key('terrain', 5, { variant: 9 }), 'M', ZOOM_BASE.large + REL.terrainBase + 5],
    ];
    for (const [k, scale, abs] of checks) {
      expect(provider.absoluteId(k, scale), JSON.stringify(k)).toBe(abs);
      const b = provider.bitmap(k, scale)!;
      expect(b).not.toBeNull();
      expect(b.opaque).toBeDefined();
      expect(b.opaque!.some((v) => v === 1)).toBe(true);
      expect(compareGrid(synth.grids.get(abs)!, b.data, b.opaque!), JSON.stringify(k)).toBeNull();
      expect(provider.bitmap(k, scale)).toBe(b);                          // 缓存同一对象
    }
  });
});

describe('buildIdLayout 的段校验', () => {
  const sizes = new Map<number, { w: number; h: number }>();
  for (const [abs, g] of synth.grids) sizes.set(abs, { w: g.w, h: g.h });
  const present = (abs: number): boolean => sizes.has(abs);
  const sizeOf = (abs: number) => sizes.get(abs);
  it('名义段全部存在时映射齐全', () => {
    const diag: Diagnostic[] = [];
    const L = buildIdLayout(present, sizeOf, diag);
    expect(L[layoutKey('overlay', OverlayId.ZoneCDense)]).toBe(REL.zoneTintBase + 3);
    expect(diag.filter((d) => d.at === 'overlay.zone')).toEqual([]);
  });
  it('M 段缺一个相对号 → 整段剔除并记 ID_LAYOUT_UNRESOLVED；H 段逐键保留', () => {
    const diag: Diagnostic[] = [];
    const missing = ZOOM_BASE.large + REL.zoneTintBase + 4;
    const L = buildIdLayout((abs) => abs !== missing && abs !== missing - ZOOM_BASE.large && abs !== missing - ZOOM_BASE.large + ZOOM_BASE.medium && abs !== ZOOM_BASE.large + REL.terrainBase + 2 && present(abs), sizeOf, diag);
    for (let k = 0; k < REL.zoneTintCount; k++) expect(L[layoutKey('overlay', OverlayId.ZoneRLight + k)]).toBeUndefined();
    expect(diag.find((d) => d.at === 'overlay.zone')?.code).toBe('ID_LAYOUT_UNRESOLVED');
    expect(L[layoutKey('terrain', 2)]).toBe(REL.terrainBase + 2);           // 其它档还有
    expect(L[layoutKey('terrain', 3)]).toBe(REL.terrainBase + 3);
  });
  it('M 段尺寸启发式不通过（分区底色不是 32×17）→ 剔除', () => {
    const diag: Diagnostic[] = [];
    const L = buildIdLayout(present, (abs) => (abs === ZOOM_BASE.large + REL.zoneTintBase ? { w: 16, h: 17 } : sizeOf(abs)), diag);
    expect(L[layoutKey('overlay', OverlayId.ZoneRLight)]).toBeUndefined();
    expect(diag.find((d) => d.at === 'overlay.zone')?.message).toContain('32×17');
    expect(L[layoutKey('overlay', OverlayId.PreviewOk)]).toBe(REL.tintBase);  // 其它段不受影响
  });
});

describe('图集装箱与页编码', () => {
  it('装箱确定、帧可取回；超宽精灵独占一页；页编码往返', () => {
    const sprites = [...synth.grids].slice(0, 40).map(([id, g]) => {
      const index = new Uint8Array(g.w * g.h), opaque = new Uint8Array(g.w * g.h);
      for (let i = 0; i < g.px.length; i++) { if (g.px[i]! >= 0) { index[i] = g.px[i]!; opaque[i] = 1; } }
      return { id, w: g.w, h: g.h, index, opaque };
    });
    const wide = gridOf(ATLAS_PAGE_W + 100, 3, (x) => (x & 1 ? 5 : -1));
    const wideIndex = new Uint8Array(wide.w * wide.h), wideOpaque = new Uint8Array(wide.w * wide.h);
    for (let i = 0; i < wide.px.length; i++) if (wide.px[i]! >= 0) { wideIndex[i] = 5; wideOpaque[i] = 1; }
    sprites.push({ id: 9999, w: wide.w, h: wide.h, index: wideIndex, opaque: wideOpaque });
    const a = packSprites(sprites), b = packSprites(sprites.slice().reverse());
    expect([...a.frames]).toEqual([...b.frames]);
    expect(a.pages.length).toBeGreaterThanOrEqual(2);
    const wf = a.frames.get(9999)!;
    expect(a.pages[wf.page]!.w).toBe(wide.w);
    for (const s of sprites) {
      const f = a.frames.get(s.id)!;
      expect([f.anchorX, f.anchorY]).toEqual([s.w >> 1, s.h - 1]);
      const px = extractFrame(a.pages, f);
      expect(Array.from(px.index)).toEqual(Array.from(s.index));
      expect(Array.from(px.opaque)).toEqual(Array.from(s.opaque));
    }
    for (const p of a.pages) {
      const back = decodeAtlasPage(encodeAtlasPage(p));
      expect([back.w, back.h]).toEqual([p.w, p.h]);
      expect(back.data).toEqual(p.data);
    }
  });
});
