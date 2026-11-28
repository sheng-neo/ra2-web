import { describe, expect, it } from 'vitest';
import type { Building, LandmarkPlacement } from '@central/data';
import { sha256Hex } from '../geo/hash';
import { pointInRing, ringArea, ringSimple, signedArea2 } from '../geo/ring';
import { blacklistHit } from '../redlines';
import {
  CANOPY_LANDMARK_CLEAR_DM,
  attachLandmarkMeshes,
  clearCanopiesOfLandmarks,
  cutLandmarkFootprints,
  landmarkFiles,
  landmarkStreetSections,
  meshTriangles,
  verifyLandmarkFiles,
  type LandmarksDoc,
} from './landmark-meshes';

const bytesOf = (s: string) => new TextEncoder().encode(s);
const entry = (file: string, content: string) => ({ file, sha256: sha256Hex(bytesOf(content)), bytes: bytesOf(content).byteLength });

function doc(): { doc: LandmarksDoc; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const mk = (file: string) => {
    const content = `content of ${file}`;
    files.set(file, bytesOf(content));
    return entry(file, content);
  };
  const d: LandmarksDoc = {
    format: 'central-3dvm-landmarks',
    version: 1,
    params: { atlas: 2048 },
    files: {
      bc3: mk('lmt-bc3-00000001.bin'),
      bc3Half: mk('lmt-bc3h-00000002.bin'),
      etc2Half: mk('lmt-etch-00000003.bin'),
      bc3Quarter: mk('lmt-bc3q-00000008.bin'),
      etc2Quarter: mk('lmt-etcq-00000009.bin'),
      webpHalf: mk('lma-h-00000004.webp'),
      webpQuarter: mk('lma-q-00000005.webp'),
      low: mk('lml-00000006.bin'),
    },
    landmarks: {
      tower: { high: mk('lmh-tower-00000007.bin'), tris: [1000, 200], floors: [420, 23], bbox: [0, 0, 0, 500, 500, 3000], aviation: [250, 250, 3010], models: ['B0'] },
    },
  };
  return { doc: d, files };
}

const square = (x0: number, y0: number, s: number) => [x0, y0, x0 + s, y0, x0 + s, y0 + s, x0, y0 + s];

function placement(id: string, outer: number[]): LandmarkPlacement {
  return { id, name: { zh: '測試', en: 'Test' }, x: outer[0]! + 10, y: outer[1]! + 10, rot: 0, base: 50, height: 3000, footprint: { outer }, replaces: [] };
}

describe('地标真实网格清单（R5）', () => {
  it('文件齐、sha256 与字节数都对时通过；任何一项不符就报错', () => {
    const { doc: d, files } = doc();
    expect(landmarkFiles(d)).toHaveLength(9);
    expect(() => verifyLandmarkFiles(d, (n) => files.get(n) ?? null)).not.toThrow();
    expect(() => verifyLandmarkFiles(d, () => null)).toThrow(/缺少地标文件/);
    expect(() => verifyLandmarkFiles(d, (n) => (n.startsWith('lml') ? bytesOf('tampered') : (files.get(n) ?? null)))).toThrow(/不符/);
    const bad = doc();
    bad.doc.files.low = { ...bad.doc.files.low, file: '../evil.bin' };
    expect(() => verifyLandmarkFiles(bad.doc, (n) => bad.files.get(n) ?? null)).toThrow(/不合规/);
  });

  it('按 id 接到摆放上（名字不变）；敏感区里的、记录不合规的不接', () => {
    const { doc: d } = doc();
    const l = placement('tower', square(0, 0, 500));
    const r = attachLandmarkMeshes([l, placement('other', square(2000, 0, 300))], d, []);
    expect(r.landmarks[0]!.mesh).toEqual({ high: 'lmh-tower-00000007.bin', tris: [1000, 200], floors: [420, 23], bbox: [0, 0, 0, 500, 500, 3000], aviation: [250, 250, 3010] });
    expect(r.landmarks[0]!.name).toEqual(l.name);
    expect(r.landmarks[1]!.mesh).toBeUndefined();
    expect(r.meta?.dir).toBe('landmarks');
    expect(r.meta?.atlas.size).toBe(2048);
    expect(r.stats.attached).toEqual(['tower']);
    const zone = { id: 'z', kind: 'government' as const, area: { outer: square(-100, -100, 1000) } };
    expect(attachLandmarkMeshes([l], d, [zone]).meta).toBeNull();
    // 中心不在敏感区里、但轮廓伸进去（或敏感区整个落在轮廓里）也不接：网格不得伸进敏感区
    const edge = { id: 'e', kind: 'government' as const, area: { outer: square(450, 450, 300) } };
    expect(attachLandmarkMeshes([l], d, [edge]).meta).toBeNull();
    const inner = { id: 'i', kind: 'government' as const, area: { outer: square(300, 300, 50) } };
    expect(attachLandmarkMeshes([l], d, [inner]).meta).toBeNull();
    const away = { id: 'a', kind: 'government' as const, area: { outer: square(600, 600, 100) } };
    expect(attachLandmarkMeshes([l], d, [away]).stats.attached).toEqual(['tower']);
    const broken = doc();
    broken.doc.landmarks.tower!.floors = [4.2, 0.2] as unknown as [number, number];
    expect(attachLandmarkMeshes([l], broken.doc, []).meta).toBeNull();
  });

  it('清单里的字符串没有红线词（只有 id、文件名与地政总署模型号）', () => {
    const { doc: d } = doc();
    const strings = JSON.stringify(d).match(/"[^"]*"/g) ?? [];
    for (const s of strings) expect(blacklistHit(s)).toBeUndefined();
  });

  it('与地标轮廓重叠的楼：轮廓与分层体块都减去地标轮廓，结果是简单多边形、不再与地标重叠', () => {
    // 100 m × 100 m 的裙楼，地标 30 m × 30 m 贴着它的南边
    const podium: Building = {
      id: 'podium0001', src: 'landsd', footprint: { outer: square(0, 0, 1000) }, base: 50, height: 400, heightSource: 'landsd',
      kind: 'podium', style: 1,
      parts: [{ top: 150 }, { ring: square(100, 0, 600), top: 300 }, { ring: square(700, 700, 200), top: 450 }],
      facade: { p: [[]] },
      // R4 的高清街面层（按切之前的墙烘的页、雨篷、铺位）：切过的楼也要去掉（R4 + R5 整合）
      hires: { f: [[0, 0, 0, 0, 96, 150, 50, 1, 0, 0, 0, 0, 0, 24, 24]], c: [[0, 0, 100, 0, 15, 40, 20, 0, 0, 0]], b: [[0, 0, 0, 0, 500, 7, 40, 5, 80]] },
    };
    const far: Building = { ...podium, id: 'far0000001', footprint: { outer: square(5000, 5000, 200) }, parts: undefined, facade: undefined, hires: undefined };
    const lm = { ...placement('tower', square(400, 0, 300)), mesh: { high: 'x', tris: [1, 1] as [number, number], floors: [400, 0] as [number, number], bbox: [0, 0, 0, 1, 1, 1] as [number, number, number, number, number, number] } };
    const { buildings, cut } = cutLandmarkFootprints([podium, far], [lm]);
    expect(cut).toEqual(['podium0001']);
    expect(buildings[1]).toBe(far);
    const b = buildings[0]!;
    expect(b.facade).toBeUndefined();
    expect(b.hires).toBeUndefined();
    expect(ringSimple(b.footprint.outer)).toBe(true);
    // 面积 = 100² − 30²（m²，误差一格边）
    expect(Math.abs(ringArea(b.footprint.outer) - (1000 * 1000 - 300 * 300))).toBeLessThan(2000);
    // 地标中心不在切过的轮廓与体块里
    const inside = (r: number[], x: number, y: number) => {
      let c = false;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        if (r[i + 1]! > y !== r[j + 1]! > y && x < r[i]! + ((y - r[i + 1]!) * (r[j]! - r[i]!)) / (r[j + 1]! - r[i + 1]!)) c = !c;
      }
      return c;
    };
    expect(inside(b.footprint.outer, 550, 150)).toBe(false);
    expect(b.parts).toHaveLength(3);
    expect(inside(b.parts![1]!.ring!, 550, 150)).toBe(false);
    expect(b.parts![2]).toEqual(podium.parts![2]);
  });

  it('CLMK 网格的三角形换成管线坐标（x 东、y 北 = −three z、z = three y，dm）；坏文件报错', () => {
    // 两个顶点 + 一个三角形（索引 0 1 1），three 坐标 offset (10, 2, −30) m、span (4, 6, 8) m
    const nv = 2;
    const buf = new ArrayBuffer(48 + nv * 36 + 8);
    const dv = new DataView(buf);
    [0x43, 0x4c, 0x4d, 0x4b].forEach((c, i) => dv.setUint8(i, c));
    dv.setUint16(4, 1, true);
    dv.setUint32(8, nv, true);
    dv.setUint32(12, 3, true);
    [10, 2, -30, 4, 6, 8].forEach((v, i) => dv.setFloat32(16 + i * 4, v, true));
    // 顶点 0 = 原点，顶点 1 = 满量程
    for (let c = 0; c < 4; c++) dv.setUint16(48 + 8 + c * 2, 65535, true);
    [0, 1, 1].forEach((k, i) => dv.setUint16(48 + nv * 36 + i * 2, k, true));
    const tri = meshTriangles(new Uint8Array(buf));
    expect(tri).toHaveLength(9);
    expect([...tri.slice(0, 3)].map((v) => Math.round(v))).toEqual([100, 300, 20]);
    expect([...tri.slice(3, 6)].map((v) => Math.round(v))).toEqual([140, 220, 80]);
    expect(() => meshTriangles(new Uint8Array(40))).toThrow(/CLMK/);
  });

  it('R4 的雨篷让开地标网格：伸进网格的变浅（离网格留净距），浅到 1 m 以下的删掉，不挨着的不动', () => {
    // 地标网格：x = 500 dm 处一面竖墙（y 0–1000、z 0–400 dm）
    const wall = new Float64Array([500, 0, 0, 500, 1000, 0, 500, 1000, 400, 500, 0, 0, 500, 1000, 400, 500, 0, 400]);
    const lm = { ...placement('tower', square(500, 0, 1000)), mesh: { high: 'x', tris: [2, 2] as [number, number], floors: [400, 0] as [number, number], bbox: [500, 0, 0, 1500, 1000, 400] as [number, number, number, number, number, number] } };
    // 邻楼外墙在 x = 450，朝东（沿墙向北走，右手侧 = 东）
    const can = (out: number, top: number) => [450, 400, 450, 600, out, top, 30, 0, 0, 0];
    const b: Building = {
      id: 'nbr0000001', src: 'landsd', footprint: { outer: square(0, 0, 450) }, base: 0, height: 300, heightSource: 'landsd', kind: 'podium', style: 1,
      hires: { f: [], c: [can(40, 60), can(30, 60), can(55, 60), can(80, 600)] },
    };
    const meshes = new Map([['tower', wall]]);
    const r = clearCanopiesOfLandmarks([b], [lm], meshes);
    const c = r.buildings[0]!.hires!.c!;
    // 网格离墙 5 m：4 m、3 m 的不动；5.5 m 的变成 5 − 0.3 = 4.7 m；顶在 60 m 的（网格只到 40 m）不动
    expect(c.map((x) => x[4])).toEqual([40, 30, 50 - CANOPY_LANDMARK_CLEAR_DM, 80]);
    expect(r.trimmed).toBe(1);
    // 墙贴着网格（只剩 0.5 m）：整块删掉
    const tight = { ...b, footprint: { outer: square(45, 0, 450) }, hires: { f: [], c: [[495, 400, 495, 600, 40, 60, 30, 0, 0, 0]] } };
    const r2 = clearCanopiesOfLandmarks([tight], [lm], meshes);
    expect(r2.dropped).toBe(1);
    expect(r2.buildings[0]!.hires!.c).toBeUndefined();
    // 没有网格的地标、没有雨篷的楼：原样返回同一个对象
    const none = clearCanopiesOfLandmarks([b], [{ ...lm, mesh: undefined }], meshes);
    expect(none.buildings[0]).toBe(b);
    const bare: Building = { ...b, hires: undefined };
    expect(clearCanopiesOfLandmarks([bare], [lm], meshes).buildings[0]).toBe(bare);
  });

  it('行人高度的实心范围（R4 + R5 整合复审）：封闭的墙连里面一起算实心；只有两面墙的开敞广场只算墙，中间照旧能走', () => {
    // 竖直的长方形墙（dm）：a → b，z 从 −10 到 zTop
    const wallTris = (ax: number, ay: number, bx: number, by: number, zTop: number): number[] => [
      ax, ay, -10, bx, by, -10, bx, by, zTop,
      ax, ay, -10, bx, by, zTop, ax, ay, zTop,
    ];
    const box = [...wallTris(0, 0, 100, 0, 300), ...wallTris(100, 0, 100, 100, 300), ...wallTris(100, 100, 0, 100, 300), ...wallTris(0, 100, 0, 0, 300)];
    // 两面墙 + 13 m 高的水平底腹（不跨过行人高度）
    const slab = [0, 0, 130, 100, 0, 130, 100, 100, 130, 0, 0, 130, 100, 100, 130, 0, 100, 130];
    const arch = [...wallTris(0, 0, 0, 100, 300), ...wallTris(100, 100, 100, 0, 300), ...slab];
    const mk = (id: string): LandmarkPlacement => ({
      ...placement(id, square(0, 0, 100)),
      mesh: { high: `lmh-${id}.bin`, tris: [12, 2], floors: [400, 0], bbox: [0, 0, -10, 100, 100, 300] },
    });
    const meshes = new Map([['box', new Float64Array(box)], ['arch', new Float64Array(arch)]]);
    const r = landmarkStreetSections([mk('box'), mk('arch'), placement('none', square(500, 0, 50))], meshes, () => 0);
    const [b, a, none] = r.landmarks;
    expect(none!.mesh).toBeUndefined();
    // 封闭的盒子：一个外环，面积约 100 × 100 dm²（墙描线外扩一格，多出不到 0.6 m）
    expect(b!.mesh!.street).toHaveLength(1);
    const ring = b!.mesh!.street![0]!;
    expect(signedArea2(ring)).toBeGreaterThan(0);
    expect(ringSimple(ring)).toBe(true);
    expect(ringArea(ring)).toBeGreaterThanOrEqual(100 * 100);
    expect(ringArea(ring)).toBeLessThan(112 * 112);
    expect(pointInRing(50, 50, ring)).toBe(true);
    // 开敞的广场：两条墙带，中间不在任何环里
    expect(a!.mesh!.street).toHaveLength(2);
    expect(a!.mesh!.street!.some((q) => pointInRing(50, 50, q))).toBe(false);
    expect(a!.mesh!.street!.some((q) => pointInRing(0, 50, q))).toBe(true);
    expect(a!.mesh!.street!.every((q) => ringArea(q) < 10 * 112)).toBe(true);
    expect(r.rings).toBe(3);
    // 地面比墙顶还高（整面墙埋在地下）时不算
    expect(landmarkStreetSections([mk('box')], meshes, () => 400).landmarks[0]!.mesh!.street).toBeUndefined();
  });
});
