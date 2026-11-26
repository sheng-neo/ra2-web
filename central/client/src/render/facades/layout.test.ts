import { describe, expect, it } from 'vitest';
import type { Building, FacadeMeta } from '@central/data';
import { extrudePrism } from '../extrude';
import { newFacadeArrays } from '../facade';
import { buildingPhoto, parseRecord, prismPhoto, recordPages, ringBounds, roofPhotoAttr, splitByTiles, wallPhotoAttr, wallSegments } from './layout';

const META: FacadeMeta = {
  dir: 'facades',
  page: 1024,
  tile: 1016,
  densityQ: 16,
  pages: ['p0.webp', 'p1.webp', 'p2.webp'],
  far: { file: 'far.webp', low: 'far-low.webp', cols: 16, rows: 1, cell: 128 },
  bytes: 1,
};

// 密度 4 px/m（64/16）、屋顶 3 px/m（48/16）；屋顶在页 2 (10, 20)；外环两片（页 0 整片 1016 × 400、页 1 只有片内列 8..208、
// 行 40..140 有照片），一个洞一片（没有照片）
const REC = [64, 48, 2, 10, 20, 2, 0, 4, 4, 0, 0, 1016, 400, 1, 100, 200, 8, 40, 200, 100, 1, -1, 0, 0, 0, 0, 0, 0];
const P0 = { page: 0, x: 4, y: 4, c0: 0, r0: 0, w: 1016, h: 400 };
const P1 = { page: 1, x: 100, y: 200, c0: 8, r0: 40, w: 200, h: 100 };

describe('parseRecord', () => {
  it('解析密度、屋顶与各环切片', () => {
    const r = parseRecord(REC, 16)!;
    expect(r.d).toBe(4);
    expect(r.dr).toBe(3);
    expect(r.roof).toEqual({ page: 2, x: 10, y: 20, c0: 0, r0: 0, w: 0, h: 0 });
    expect(r.rings).toEqual([[P0, P1], [{ page: -1, x: 0, y: 0, c0: 0, r0: 0, w: 0, h: 0 }]]);
  });
  it('空数组与截断的记录返回 null', () => {
    expect(parseRecord([], 16)).toBeNull();
    expect(parseRecord([64, 48, 2, 10, 20, 3, 0, 4, 4, 0, 0, 10, 10], 16)).toBeNull();
  });
  it('外包框为空的片当作没有照片', () => {
    expect(parseRecord([64, 48, -1, 0, 0, 1, 0, 4, 4, 0, 0, 0, 10], 16)!.rings[0]![0]!.page).toBe(-1);
  });
});

describe('splitByTiles', () => {
  it('在 P = k·tile/d 处切开，各段标切片号', () => {
    // tile 1016 px、4 px/m → 每片 254 m
    expect(splitByTiles(4, 1016, 200, 300)).toEqual([
      { p0: 200, p1: 254, k: 0 },
      { p0: 254, p1: 300, k: 1 },
    ]);
    expect(splitByTiles(4, 1016, 10, 20)).toEqual([{ p0: 10, p1: 20, k: 0 }]);
    expect(splitByTiles(4, 1016, 254, 260)).toEqual([{ p0: 254, p1: 260, k: 1 }]);
  });
  it('长墙跨多片，首尾相接、覆盖整段', () => {
    const segs = splitByTiles(2.5, 1016, 0, 2000);
    expect(segs[0]!.p0).toBe(0);
    expect(segs.at(-1)!.p1).toBe(2000);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.p0).toBe(segs[i - 1]!.p1);
    expect(segs.map((s) => s.k)).toEqual(segs.map((_, i) => i));
  });
});

describe('wallPhotoAttr / roofPhotoAttr', () => {
  const rec = parseRecord(REC, 16)!;
  const wall = { rec, top: 1000, zMax: Infinity, page: 1024, tile: 1016, phase: 1.5 };
  it('墙：片内列 = P·d − k·tile − c0，行 = (顶 − z)·d − r0，加外包框在页里的位置', () => {
    // P = 10 m、z = 顶 − 2.5 m（dm 975）：列 40、行 10 → 页 0 的 (44, 14)
    expect(wallPhotoAttr(wall, P0, 0, 10, 975)).toEqual([44 / 1024, 14 / 1024, 0, 1.5]);
    // 第 1 片从 P = 254 m 起：P = 260 → 片内列 24 − c0 8 = 16；z = 顶 − 12.5 m → 行 50 − r0 40 = 10
    expect(wallPhotoAttr(wall, P1, 1, 260, 875)).toEqual([116 / 1024, 210 / 1024, 1, 1.5]);
  });
  it('没有照片的段退回「无照片」但保留相位', () => {
    expect(wallPhotoAttr(wall, null, 0, 3, 900)).toEqual([0, 0, -1, 1.5]);
  });
  it('wallSegments：按切片与外包框切开，框内给出照片的高程范围', () => {
    const segs = wallSegments(wall, 0, 200, 320);
    // 第 0 片整片有照片：200–254；第 1 片外包框列 8..208 → P 256..306：254–256 无、256–306 有、306–320 无
    expect(segs.map((s) => [s.p0, s.p1, s.k, s.piece?.page ?? -1])).toEqual([
      [200, 254, 0, 0],
      [254, 256, 1, -1],
      [256, 306, 1, 1],
      [306, 320, 1, -1],
    ]);
    expect(segs[0]!.zHi).toBe(1000);
    expect(segs[0]!.zLo).toBe(0);
    // 行 40..140 → 顶下 10–35 m
    expect(segs[2]!.zHi).toBe(900);
    expect(segs[2]!.zLo).toBe(650);
    // zMax 截住上边
    expect(wallSegments({ ...wall, zMax: 800 }, 0, 260, 270)[0]!.zHi).toBe(800);
    // 洞没有照片：一段 piece = null
    expect(wallSegments(wall, 1, 0, 10)).toEqual([{ p0: 0, p1: 10, k: 0, piece: null, zLo: 0, zHi: 0 }]);
  });
  it('屋顶：外包框左上角对齐 (x, y)，X 向右、Y 向下', () => {
    const roof = { rec, minX: 100, maxY: 500, page: 1024, phase: 0 };
    expect(roofPhotoAttr(roof, 100, 500)).toEqual([10 / 1024, 20 / 1024, 2, 0]);
    // X + 10 m、Y − 4 m → 屋顶 3 px/m：(+30, +12)
    expect(roofPhotoAttr(roof, 200, 460)).toEqual([40 / 1024, 32 / 1024, 2, 0]);
  });
});

describe('buildingPhoto / prismPhoto', () => {
  const box = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
  const b = (facade: Building['facade'], parts?: Building['parts']): Pick<Building, 'facade' | 'parts'> => ({ facade, parts });
  it('层高与相位（cm → m）；没有贴面或没有贴图集为 null', () => {
    const bp = buildingPhoto(b({ f: [390, 120], p: [REC] }), META)!;
    expect(bp.f2f).toBeCloseTo(3.9);
    expect(bp.phase).toBeCloseTo(1.2);
    expect(bp.parted).toBe(false);
    expect(buildingPhoto(b(undefined), META)).toBeNull();
    expect(buildingPhoto(b({ p: [REC] }), undefined)).toBeNull();
  });
  it('分层楼：按 parts 序号取；客户端整栋平顶时只用底座记录、管到底座顶、屋顶不用', () => {
    const parts = [{ top: 300 }, { ring: box(0, 0, 50, 50), top: 900 }];
    const bp = buildingPhoto(b({ p: [REC, []] }, parts), META)!;
    expect(bp.parted).toBe(true);
    const ring = { minX: 0, maxY: 100 };
    const p0 = prismPhoto(bp, META, 0, 300, ring, null);
    expect(p0.wall?.top).toBe(300);
    expect(p0.roof).not.toBeNull();
    expect(prismPhoto(bp, META, 1, 900, ring, null)).toEqual({ wall: null, roof: null });
    const flat = prismPhoto(bp, META, null, 900, ring, 300);
    expect(flat.wall?.top).toBe(300);
    expect(flat.wall?.zMax).toBe(300);
    expect(flat.roof).toBeNull();
  });
  it('整栋记录：客户端整栋平顶时直接用', () => {
    const bp = buildingPhoto(b({ p: [REC] }), META)!;
    const ph = prismPhoto(bp, META, null, 600, { minX: 0, maxY: 0 }, null);
    expect(ph.wall?.top).toBe(600);
    expect(ph.wall?.zMax).toBe(Infinity);
    expect(ph.roof?.rec.roof.page).toBe(2);
  });
  it('recordPages 去重、ringBounds 取外包框', () => {
    expect(recordPages(parseRecord(REC, 16)!).sort()).toEqual([0, 1, 2]);
    expect(recordPages(parseRecord(REC, 16)!, false).sort()).toEqual([0, 1]);
    expect(ringBounds(box(-5, 2, 7, 9))).toEqual({ minX: -5, minY: 2, maxX: 7, maxY: 9 });
  });
});

describe('extrudePrism 带照片', () => {
  it('跨切片边界的墙在边界处切开，每块墙面四个角的纹理坐标来自同一片', () => {
    // 密度 1 px/m、切片 100 px → 每片 100 m；外环 160 × 40 m，第一条边 160 m 跨两片
    const full = (pg: number) => [pg, 0, 0, 0, 0, 100, 10];
    const rec = parseRecord([16, 16, -1, 0, 0, 4, ...full(0), ...full(1), ...full(2), ...full(0)], 16)!;
    const m = newFacadeArrays();
    const outer = [0, 0, 1600, 0, 1600, 400, 0, 400];
    extrudePrism(m, {
      outer,
      holes: [],
      bottom: 0,
      base: 0,
      top: 100,
      style: 0,
      uOffset: 0,
      roof: false,
      wallPhoto: { rec, top: 100, zMax: Infinity, page: 1024, tile: 100, phase: 0.7 },
    });
    // 4 条边：160 m 那条切成 2 块，其余各 1 块（第三条 160 m 的边从 P = 200 m 起：跨第 2、3 片）
    expect(m.triangleCount).toBe(2 * 6);
    const photo = m.data[4]!;
    const pages = new Set<string>();
    for (let q = 0; q < m.vertexCount / 4; q++) {
      const pg = [0, 1, 2, 3].map((k) => photo[(q * 4 + k) * 4 + 2]);
      expect(new Set(pg).size).toBe(1);
      pages.add(String(pg[0]));
      for (let k = 0; k < 4; k++) expect(photo[(q * 4 + k) * 4 + 3]).toBeCloseTo(0.7);
    }
    expect([...pages].sort()).toEqual(['0', '1', '2']);
  });
});
