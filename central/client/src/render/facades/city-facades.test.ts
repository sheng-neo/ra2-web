/**
 * 用仓库里的真实产物（public/city/central.json + public/city/facades/）检查 R3 真实贴面的不变量：
 * - 敏感区里的楼（质心在区内或与区相交）、地标替换掉的楼一律没有照片（导演规格 F-P0-8）；
 * - 每条记录都能解析，页号在范围内、外包框在页里；贴图文件都在、文件头是 WebP、尺寸与清单一致；
 * - 墙片与屋顶的纹理坐标落在本片外包框里（不会取到邻片的照片）。
 */
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CityFile } from '@central/data';
import { normalizeRing, pointInRing, ringCentroid } from '../../geom/ring';
import { buildingPhoto, parseRecord, wallPhotoAttr, wallSegments } from './layout';
import { isWebp } from './streamer';

const root = new URL('../../../public/city/', import.meta.url);
const city = JSON.parse(readFileSync(new URL('central.json', root), 'utf8')) as CityFile;
const meta = city.meta.facades;

/** WebP（VP8 / VP8L / VP8X）文件头里的宽高。 */
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

describe.skipIf(!meta)('真实贴面（真实数据）', () => {
  it('敏感区与地标替换掉的楼没有照片', () => {
    const replaced = new Set(city.landmarks.flatMap((l) => l.replaces ?? []));
    let textured = 0;
    for (const b of city.buildings) {
      if (!b.facade) continue;
      textured++;
      expect(replaced.has(b.id)).toBe(false);
      const ring = normalizeRing(b.footprint);
      if (!ring) continue;
      const [cx, cy] = ringCentroid(ring.outer);
      for (const z of city.zones.sensitive) {
        expect(pointInRing(z.area, cx, cy)).toBe(false);
        for (let i = 0; i < ring.outer.length; i += 2) expect(pointInRing(z.area, ring.outer[i]!, ring.outer[i + 1]!)).toBe(false);
      }
    }
    expect(textured).toBeGreaterThan(0);
  }, 120_000);

  it('贴图文件都在、是 WebP、尺寸对；字节数与 meta.bytes 一致', () => {
    const files = [...meta!.pages, meta!.far.file, meta!.far.low];
    let bytes = 0;
    for (const [i, f] of files.entries()) {
      const b = readFileSync(new URL(`${meta!.dir}/${f}`, root));
      bytes += statSync(new URL(`${meta!.dir}/${f}`, root)).size;
      expect(isWebp(b.subarray(0, 12))).toBe(true);
      const k = i === files.length - 1 ? 2 : 1;
      const want: [number, number] =
        i < meta!.pages.length ? [meta!.page, meta!.page] : [(meta!.far.cols * meta!.far.cell) / k, (meta!.far.rows * meta!.far.cell) / k];
      expect(webpSize(b)).toEqual(want);
    }
    expect(bytes).toBe(meta!.bytes);
    expect(meta!.far.cols * meta!.far.rows).toBeGreaterThanOrEqual(meta!.pages.length);
  }, 120_000);

  it('记录可解析；墙片纹理坐标落在本片外包框里', () => {
    const P = meta!.page;
    for (const b of city.buildings) {
      if (!b.facade) continue;
      const bp = buildingPhoto(b, meta)!;
      for (const raw of b.facade.p) {
        if (raw.length === 0) continue;
        const rec = parseRecord(raw, meta!.densityQ);
        expect(rec).not.toBeNull();
        if (rec!.roof.page >= 0) expect(rec!.roof.page).toBeLessThan(meta!.pages.length);
        const wall = { rec: rec!, top: 1000, zMax: Infinity, page: P, tile: meta!.tile, phase: bp.phase };
        for (const [ri, ring] of rec!.rings.entries()) {
          const len = (ring.length * meta!.tile) / rec!.d;
          for (const seg of wallSegments(wall, ri, 0, len)) {
            if (!seg.piece) continue;
            const pc = seg.piece;
            expect(pc.page).toBeLessThan(meta!.pages.length);
            for (const [pp, z] of [[seg.p0, seg.zHi], [seg.p1, seg.zLo]] as const) {
              const [s, t] = wallPhotoAttr(wall, pc, seg.k, pp, z);
              expect(s * P).toBeGreaterThanOrEqual(pc.x - 1e-3);
              expect(s * P).toBeLessThanOrEqual(pc.x + pc.w + 1e-3);
              expect(t * P).toBeGreaterThanOrEqual(pc.y - 1e-3);
              expect(t * P).toBeLessThanOrEqual(pc.y + pc.h + 1e-3);
            }
          }
        }
      }
    }
  }, 120_000);
});
