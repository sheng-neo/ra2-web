// ===== render/pixi/provider.test.ts =====（WORKPLAN WP11 验收：setProvider 后旧句柄全部失效、vramBytes 先回落再上升、has 为 false 的 key 走回退链到 procedural）
import { describe, expect, it } from 'vitest';
import type { RenderSource } from '../../contracts/render';
import { RENDER_BUDGET } from '../../contracts/render';
import { TILES, tileIndex } from '../../contracts/grid';
import { CATALOGUE } from '../../data';
import { stubQueries } from '../../testkit';
import { createPixiRenderer } from './backend';
import { createFakeProvider, createFixtureSource, createOverlayCompiler, createTerrainOnlyCompiler } from './fixtures';

const cpuStub = { render: () => ({ w: 0, h: 0, data: new Uint8Array(0), anchorX: 0, anchorY: 0, cycling: false }), toRgba: () => new Uint8ClampedArray(0), encodePng: () => new Uint8Array(0) };
const compiler = createOverlayCompiler(createTerrainOnlyCompiler());

describe('setProvider 热切换', () => {
  it('旧句柄全部失效、vramBytes 先回落到 0 再上升、全量重建一次、精灵数不变', () => {
    const r = createPixiRenderer({ sceneCompiler: compiler, cpuCompositor: cpuStub }, { headless: true });
    const proc = createFakeProvider({ name: 'procedural' });
    r.setProvider(proc, null);
    const src = createFixtureSource();
    r.setSource(src);
    r.frame(16);
    const i = r.internals;
    const before = r.stats().vramBytes;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThanOrEqual(RENDER_BUDGET.maxVramBytes);
    const t = tileIndex(12, 34);
    const oldEntry = i.ground.handlesOf(t)![0]!.entry!;
    const oldTexture = oldEntry.texture;
    const oldEntries = [0, 1000, 5000, 16383].map((k) => i.ground.handlesOf(k)![0]!.entry!);
    const dat = createFakeProvider({ name: 'dat', scales: ['XS', 'S', 'M'] });
    r.setProvider(dat, proc);
    expect(r.stats().vramBytes).toBe(0);                            // 释放页
    expect(i.atlas.pageCount).toBe(0);
    expect(oldEntries.every((e) => !i.atlas.isValid(e))).toBe(true);
    expect(oldTexture.source.destroyed).toBe(true);
    const rebuilds = i.rebuilds();
    r.frame(16);
    expect(i.rebuilds()).toBe(rebuilds + 1);
    expect(r.stats().vramBytes).toBeGreaterThan(0);                 // 再上升
    expect(r.stats().sprites).toBe(TILES);
    const h = i.ground.handlesOf(t)![0]!;
    expect(h.entry).not.toBe(oldEntry);
    expect(h.sprite.texture).toBe(h.entry!.texture);
    expect(h.entry!.source).toBe('primary');
    expect(i.atlas.primary).toBe(dat);
    expect(i.atlas.fallback).toBe(proc);
    expect(i.ground.handlesOf(t)![0]!.sprite.texture).not.toBe(oldTexture);
  });
  it('has 为 false 的 key 走回退链到 procedural；全部命中的 key 用 DAT', () => {
    const r = createPixiRenderer({ sceneCompiler: compiler, cpuCompositor: cpuStub }, { headless: true });
    const proc = createFakeProvider({ name: 'procedural' });
    const dat = createFakeProvider({ name: 'dat', scales: ['XS', 'S', 'M'], has: (k) => !(k.kind === 'terrain' && k.id === 0) });
    r.setProvider(dat, proc);
    const src = createFixtureSource();
    const L = src.stateMut.layers;
    const slopeTile = tileIndex(7, 7);
    L.xter[slopeTile] = 0x03;
    r.setSource(src);
    r.frame(16);
    const i = r.internals;
    const flat = i.ground.handlesOf(tileIndex(1, 1))![0]!.entry!;
    const slope = i.ground.handlesOf(slopeTile)![0]!.entry!;
    expect(flat.source).toBe('fallback');
    expect(slope.source).toBe('primary');
    expect(flat.texture).not.toBe(slope.texture);
    // 缩放到 L：DAT 没有 L → M ×2（primary），procedural 回退项也取 M ×2
    r.setView({ ...r.getView(), zoom: 3 });
    r.frame(16);
    const flatL = i.ground.handlesOf(tileIndex(1, 1))![0]!.entry!;
    const slopeL = i.ground.handlesOf(slopeTile)![0]!.entry!;
    expect(slopeL.source).toBe('primary');
    expect([slopeL.w, slopeL.h]).toEqual([64, 32]);
    expect(flatL.source).toBe('fallback');
    expect([flatL.w, flatL.h]).toEqual([64, 32]);
    expect(dat.calls).toBeGreaterThan(0);
    expect(proc.calls).toBeGreaterThan(0);
  });
  it('setProvider 在 attach / setSource 之前调用也可用；未设 provider 时用占位', () => {
    const r = createPixiRenderer({ sceneCompiler: compiler, cpuCompositor: cpuStub }, { headless: true });
    const src = createFixtureSource();
    r.setSource(src);
    r.frame(16);
    expect(r.internals.ground.handlesOf(0)![0]!.entry!.source).toBe('placeholder');
    r.setProvider(createFakeProvider(), null);
    r.frame(16);
    expect(r.internals.ground.handlesOf(0)![0]!.entry!.source).toBe('primary');
    expect(r.stats().drawCalls).toBe(0);                            // headless 无 GL
    r.destroy();
    expect(r.stats().sprites).toBe(0);
    expect(r.stats().vramBytes).toBe(0);
  });
});

describe.each(['optimistic', 'pessimistic'] as const)('RenderSource 用 %s 桩的 Queries（渲染器只读 disasters.markers）', (profile) => {
  it('attach(headless) → setSource → frame 跑通；markers 全零；stats 字段齐全', async () => {
    const fx = createFixtureSource();
    const q = stubQueries(profile, fx.stateMut, CATALOGUE);
    const src: RenderSource = { state: fx.stateMut, q, takeChanges: fx.takeChanges, animTick: 0 };
    const r = createPixiRenderer({ sceneCompiler: compiler, cpuCompositor: cpuStub }, { headless: true, viewport: { w: 320, h: 200 } });
    r.setProvider(createFakeProvider(), null);
    const host = { clientWidth: 300, clientHeight: 150, style: {}, appendChild: () => undefined } as unknown as HTMLElement;
    await r.attach(host);
    expect(r.internals.viewport()).toEqual({ w: 300, h: 150, backingScale: 1 });
    r.setSource(src);
    r.frame(16);
    expect(q.disasters.markers().every((v) => v === 0)).toBe(true);
    const s = r.stats();
    expect(Object.keys(s).sort()).toEqual(['bandRebuilds', 'drawCalls', 'frameMs', 'sprites', 'vramBytes']);
    expect(s.sprites).toBe(TILES);
    expect(s.frameMs).toBeGreaterThanOrEqual(0);
    r.destroy();
  });
});
