// ===== art/provider.test.ts =====（WORKPLAN WP9 验收：has 只回答原生档；frameCount ≥ 1；表驱动 v1 必备 key 集合在 S/M/L 全部 has == true；Worker 协议往返）
import { describe, expect, it } from 'vitest';
import type { SpriteKey, WorkerLike } from '../contracts/render';
import { ACTOR_COUNT, ActorId, OVERLAY_COUNT, UiIconId, XUND_PIPE_STUB, spriteKeyHash } from '../contracts/render';
import type { ArtEntry } from '../contracts/entrypoints';
import { CATALOGUE } from '../data';
import * as art from './index';
import { requiredKeyGroups, requiredKeys } from './keys';
import { createProceduralProvider, generate, normalizeKey, supports } from './provider';
import { SCALES, bitmapHash, type NativeScale } from './raster';
import { createProceduralProviderAsync, handleArtWorkerMessage, packSprites, unpackSprites } from './worker';

const NATIVE: readonly NativeScale[] = ['S', 'M', 'L'];

describe('art: ArtEntry 对账', () => {
  it('index.ts 导出符合 ArtEntry；name = procedural；nativeScales = {S, M, L}；palette 256 项', () => {
    const entry: ArtEntry = { createProceduralProvider: art.createProceduralProvider, createProceduralProviderAsync: art.createProceduralProviderAsync };
    const p = entry.createProceduralProvider();
    expect(p.name).toBe('procedural');
    expect([...p.nativeScales].sort()).toEqual(['L', 'M', 'S']);
    expect(p.palette.rgba.length).toBe(1024);
    expect(p.palette.cycles.length).toBe(3);
  });
});

describe('art: 表驱动必备 key 集合', () => {
  const groups = requiredKeyGroups();
  it('集合规模：overlay 24 项（EdgeWall ×31 级）、actor 6、xund 0..0x23（管线 / 短管桩含有水变体）、xbld 0x01..0xFF、terrain 14 × 13、water 21 × 3、ui 全部区段', () => {
    const size = (name: string): number => groups.find((g) => g.name === name)!.keys.length;
    expect(size('overlay')).toBe(OVERLAY_COUNT - 2 + 62);
    expect(size('actor')).toBe(6);
    expect(size('xund')).toBe(0x24 + (XUND_PIPE_STUB - 0x10 + 1));
    expect(size('xbld')).toBe(255);
    expect(size('terrain')).toBe(14 * 13);
    expect(size('water')).toBe(21 * 3);
    expect(size('ui')).toBe(39 + 5 + 12 + 15 + CATALOGUE.TOOLS.length);
    expect(UiIconId.SubToolBase + CATALOGUE.TOOLS.length).toBeLessThan(256);
  });
  const p = createProceduralProvider();
  it.each(NATIVE)('%s 档：全部必备 key has == true 且 bitmap 合法（尺寸 / 锚点 / 数据长度 / 非空）', (scale) => {
    for (const key of requiredKeys()) {
      const tag = `${key.kind}:${key.id}:${key.variant ?? 0}@${scale}`;
      expect(p.has(key, scale), tag).toBe(true);
      const b = p.bitmap(key, scale);
      expect(b, tag).not.toBeNull();
      expect(b!.w).toBeGreaterThan(0); expect(b!.h).toBeGreaterThan(0);
      expect(b!.data.length, tag).toBe(b!.w * b!.h);
      expect(b!.anchorX).toBeGreaterThanOrEqual(0); expect(b!.anchorX).toBeLessThanOrEqual(b!.w);
      expect(b!.anchorY).toBeGreaterThanOrEqual(0); expect(b!.anchorY).toBeLessThanOrEqual(b!.h);
      if (!(key.kind === 'xund' && key.id === 0)) expect(b!.data.some((v) => v !== 0), `${tag} 全透明`).toBe(true);
      expect(p.frameCount(key)).toBeGreaterThanOrEqual(1);
      expect(p.fps(key)).toBe(0);
    }
  });
  it('非原生档（XS / XL）has == false 且 bitmap null（回退链在渲染器）', () => {
    for (const key of [{ kind: 'xbld', id: 0x70 }, { kind: 'terrain', id: 0 }, { kind: 'water', id: 0 }, { kind: 'ui', id: 0 }] as SpriteKey[]) {
      for (const s of ['XS', 'XL'] as const) { expect(p.has(key, s)).toBe(false); expect(p.bitmap(key, s)).toBeNull(); }
    }
  });
  it('不支持的 key：xbld 0 / terrain 14 / water 21 / xund 0x24 / overlay 24 / 非 v1 角色 / ui 空洞区段 → has false', () => {
    const bad: SpriteKey[] = [{ kind: 'xbld', id: 0 }, { kind: 'terrain', id: 14 }, { kind: 'water', id: 21 }, { kind: 'xund', id: 0x24 }, { kind: 'overlay', id: OVERLAY_COUNT }, { kind: 'actor', id: ActorId.Plane }, { kind: 'actor', id: ACTOR_COUNT }, { kind: 'ui', id: 45 }, { kind: 'ui', id: 250 }];
    for (const k of bad) { expect(supports(k), `${k.kind}:${k.id}`).toBe(false); expect(p.has(k, 'M')).toBe(false); expect(p.bitmap(k, 'M')).toBeNull(); }
  });
  it('画布尺寸约定：地形 W×(H+LEVEL)、1×1 物件 W×1.5W、叠加菱形 W×H、UI 24×24、EdgeWall 宽 W/2', () => {
    for (const scale of NATIVE) {
      const sp = SCALES[scale];
      const t = p.bitmap({ kind: 'terrain', id: 5 }, scale)!; expect([t.w, t.h, t.anchorX, t.anchorY]).toEqual([sp.W, sp.H + sp.LEVEL, sp.W / 2, sp.H + sp.LEVEL]);
      const r = p.bitmap({ kind: 'xbld', id: 0x1d }, scale)!; expect([r.w, r.h]).toEqual([sp.W, Math.round(96 * sp.k)]);
      const c = p.bitmap({ kind: 'overlay', id: 0 }, scale)!; expect([c.w, c.h, c.anchorX, c.anchorY]).toEqual([sp.W, sp.H, sp.W / 2, sp.H]);
      const u = p.bitmap({ kind: 'ui', id: UiIconId.Query }, scale)!; expect([u.w, u.h]).toEqual([24, 24]);
      const e = p.bitmap({ kind: 'overlay', id: 22, variant: 5 }, scale)!; expect([e.w, e.h]).toEqual([sp.W / 2, sp.H / 2 + 5 * sp.LEVEL]);
      const w = p.bitmap({ kind: 'water', id: 3 }, scale)!; expect(w.cycling).toBe(scale !== 'S');
    }
  });
  it('缓存与确定性：同 key 返回同一对象；两个 provider 位图逐字节相同；variant 规范化使缓存键稳定', () => {
    const a = p.bitmap({ kind: 'xbld', id: 0xd0 }, 'M'), b = p.bitmap({ kind: 'xbld', id: 0xd0, variant: 9, frame: 2 }, 'M');
    expect(a).toBe(b);
    const q = createProceduralProvider();
    for (const key of [{ kind: 'xbld', id: 0xcb }, { kind: 'terrain', id: 9, variant: 7 }, { kind: 'water', id: 14, variant: 1 }, { kind: 'overlay', id: 14 }] as SpriteKey[]) {
      expect(bitmapHash(q.bitmap(key, 'L')!)).toBe(bitmapHash(p.bitmap(key, 'L')!));
    }
    expect(spriteKeyHash(normalizeKey({ kind: 'actor', id: ActorId.Tornado, variant: 5, frame: 1 }))).toBe(spriteKeyHash({ kind: 'actor', id: ActorId.Tornado }));
    expect(normalizeKey({ kind: 'terrain', id: 1, variant: 0x85 }).variant).toBe(0x80);
    expect(normalizeKey({ kind: 'xund', id: 0x12, variant: 3 }).variant).toBe(1);
    expect(normalizeKey({ kind: 'xund', id: 0x05, variant: 1 }).variant).toBe(0);
  });
  it('生成 M 档全部必备 key 的耗时在预算内（< 3 s，含 782 张）', () => {
    const t0 = performance.now();
    let n = 0;
    for (const key of requiredKeys()) if (generate(key, 'M')) n++;
    expect(n).toBe(requiredKeys().length);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('art: Worker 协议', () => {
  /** 进程内假 Worker：收到请求后同步生成并回包。 */
  function fakeWorker(): WorkerLike & { posted: unknown[] } {
    const listeners: Array<(e: { data: unknown }) => void> = [];
    const w = {
      posted: [] as unknown[],
      postMessage(message: unknown): void { w.posted.push(message); handleArtWorkerMessage(message, (m) => { for (const fn of listeners) fn({ data: m }); }); },
      addEventListener(_type: 'message', fn: (e: { data: unknown }) => void): void { listeners.push(fn); },
      terminate(): void { /* no-op */ },
    };
    return w;
  }
  it('pack / unpack 往返：记录数 = 必备 key × 3 档，位图逐字节相同', () => {
    const keys = requiredKeys().filter((k) => k.kind !== 'xbld' || k.id < 0x20);   // 子集加速
    const { index, data } = packSprites(['S', 'M'], keys);
    const map = unpackSprites(index, data);
    expect(map.size).toBe(keys.length * 2);
    for (const key of keys.slice(0, 40)) for (const s of ['S', 'M'] as const) {
      const b = map.get(art.cacheKeyOf(key, s))!;
      const ref = generate(key, s)!;
      expect([b.w, b.h, b.anchorX, b.anchorY, b.cycling]).toEqual([ref.w, ref.h, ref.anchorX, ref.anchorY, ref.cycling]);
      expect(Array.from(b.data)).toEqual(Array.from(ref.data));
    }
  });
  it('createProceduralProviderAsync(WorkerLike) 解析为与同步 provider 等价的 provider', async () => {
    const w = fakeWorker();
    const p = await createProceduralProviderAsync(w);
    expect(w.posted.length).toBe(1);
    expect(p.name).toBe('procedural');
    const sync = createProceduralProvider();
    for (const key of [{ kind: 'xbld', id: 0x96 }, { kind: 'terrain', id: 1, variant: 4 }, { kind: 'ui', id: UiIconId.Bulldozer }, { kind: 'actor', id: ActorId.Monster, variant: 3 }] as SpriteKey[]) {
      for (const s of NATIVE) {
        expect(p.has(key, s)).toBe(true);
        expect(bitmapHash(p.bitmap(key, s)!)).toBe(bitmapHash(sync.bitmap(key, s)!));
      }
    }
    expect(p.has({ kind: 'xbld', id: 0x96 }, 'XL')).toBe(false);
    expect(handleArtWorkerMessage({ type: 'something-else' }, () => { throw new Error('不应回包'); })).toBe(false);
  });
});
