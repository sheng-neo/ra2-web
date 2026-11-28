/**
 * 用仓库里的真实产物检查 R4 电车走廊高清街面层的不变量：
 * - 敏感区里的楼、地标替换掉的楼没有高清层与雨篷；雨篷四角都不在敏感区里；
 * - 页文件都在、是 WebP、尺寸 page × (page + aux)；字节数与 meta.hires.bytes 一致；
 * - 每段的每片：纹理坐标（片的四角）落在本片在页里的矩形内、矩形在颜色区（不越到下面的辅助图）；
 * - 段引用的 (part, ring, edge) 在楼的几何里存在（边序号小于环的顶点数）。
 */
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CityFile } from '@central/data';
import { normalizeRing, pointInRing, ringCentroid } from '../../geom/ring';
import { hiresAttr, parseHires } from './hires-layout';
import { isWebp } from './streamer';

const root = new URL('../../../public/city/', import.meta.url);
const city = JSON.parse(readFileSync(new URL('central.json', root), 'utf8')) as CityFile;
const meta = city.meta.hires;

function webpSize(b: Uint8Array): [number, number] {
  const tag = String.fromCharCode(...b.subarray(12, 16));
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (tag === 'VP8X') return [1 + (dv.getUint32(24, true) & 0xffffff), 1 + (dv.getUint32(27, true) & 0xffffff)];
  if (tag === 'VP8L') {
    const v = dv.getUint32(21, true);
    return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)];
  }
  return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
}

describe.skipIf(!meta)('高清街面层（真实数据）', () => {
  it('敏感区、地标替换掉的楼没有高清层；雨篷不碰敏感区', () => {
    const replaced = new Set(city.landmarks.flatMap((l) => l.replaces ?? []));
    let n = 0;
    for (const b of city.buildings) {
      if (!b.hires) continue;
      n++;
      expect(replaced.has(b.id)).toBe(false);
      const ring = normalizeRing(b.footprint);
      if (!ring) continue;
      const [cx, cy] = ringCentroid(ring.outer);
      for (const z of city.zones.sensitive) expect(pointInRing(z.area, cx, cy)).toBe(false);
      for (const c of b.hires.c ?? []) {
        const [x0, y0, x1, y1, d] = c as [number, number, number, number, number];
        const L = Math.hypot(x1 - x0, y1 - y0);
        const nx = (y1 - y0) / L;
        const ny = -(x1 - x0) / L;
        for (const [x, y] of [[x0, y0], [x1, y1], [x1 + nx * d, y1 + ny * d], [x0 + nx * d, y0 + ny * d]] as const) {
          for (const z of city.zones.sensitive) expect(pointInRing(z.area, x, y)).toBe(false);
        }
      }
    }
    expect(n).toBeGreaterThan(0);
  }, 120_000);

  it('页文件都在、是 WebP、尺寸 page × (page + aux)；字节数一致', () => {
    let bytes = 0;
    for (const f of meta!.pages) {
      const url = new URL(`${meta!.dir}/${f}`, root);
      const b = readFileSync(url);
      bytes += statSync(url).size;
      expect(isWebp(b.subarray(0, 12))).toBe(true);
      expect(webpSize(b)).toEqual([meta!.page, meta!.page + meta!.aux]);
    }
    expect(bytes).toBe(meta!.bytes);
    expect(meta!.aux * 2).toBe(meta!.page);
  }, 120_000);

  it('每片的纹理坐标落在本片矩形里、矩形在颜色区；面引用的边存在', () => {
    const P = meta!.page;
    for (const b of city.buildings) {
      if (!b.hires) continue;
      const faces = parseHires(b.hires, meta!.densityQ);
      const ring0 = normalizeRing(b.footprint)!;
      for (const [key, secs] of faces) {
        const edge = key % 65536;
        const ringIdx = Math.floor(key / 65536) % 64;
        const part = Math.floor(key / 65536 / 64);
        if (part === 0) {
          const r = ringIdx === 0 ? ring0.outer : ring0.holes[ringIdx - 1];
          expect(r).toBeDefined();
          expect(edge).toBeLessThan(r!.length / 2);
        } else {
          expect(part).toBeLessThan(b.parts?.length ?? 0);
        }
        for (const sec of secs) {
          for (const pc of sec.pieces) {
            expect(pc.page).toBeLessThan(meta!.pages.length);
            expect(pc.x + pc.w).toBeLessThanOrEqual(P);
            expect(pc.y + pc.h).toBeLessThanOrEqual(P);
            // 片四角（s 米、z dm）
            const s0 = pc.c0 / sec.d;
            const s1 = (pc.c0 + pc.w) / sec.d;
            const zt = sec.zTop - (pc.r0 / sec.d) * 10;
            const zb = sec.zTop - ((pc.r0 + pc.h) / sec.d) * 10;
            for (const [s, z] of [[s0, zt], [s1, zb]] as const) {
              const [u, v, page] = hiresAttr({ sec, pc }, s, z, P);
              expect(page).toBe(pc.page);
              expect(u * P).toBeGreaterThanOrEqual(pc.x - 1e-3);
              expect(u * P).toBeLessThanOrEqual(pc.x + pc.w + 1e-3);
              expect(v * P).toBeGreaterThanOrEqual(pc.y - 1e-3);
              expect(v * P).toBeLessThanOrEqual(pc.y + pc.h + 1e-3);
            }
          }
        }
      }
    }
  }, 120_000);
});
