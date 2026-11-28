import { describe, expect, it } from 'vitest';
import { NO_HIRES, buildingHires, hiresAttr, hiresCutsS, hiresCutsZ, hiresFaceKey, hiresPieceAt, noPhotoFaces, parseHires, sectionPages } from './hires-layout';

// 一个面：街面段 d = 24 px/m，zTop 150 dm、zBot 0；一片 (页 3, x 100, y 200, c0 48, r0 24, w 240, h 300)
const rec = [0, 0, 5, 0, 24 * 16, 150, 0, 1, 3, 100, 200, 48, 24, 240, 300];
// 同一面的上段 d = 12 px/m，zTop 450、zBot 150；两片（按 tile 切开）
const recU = [0, 0, 5, 1, 12 * 16, 450, 150, 2, 7, 0, 0, 0, 0, 100, 360, 8, 10, 10, 100, 0, 50, 360];

describe('parseHires', () => {
  it('按 (part, ring, edge) 分面，段按 zTop 降序；密度 = dq / densityQ', () => {
    const m = parseHires({ f: [rec, recU] }, 16);
    const secs = m.get(hiresFaceKey(0, 0, 5))!;
    expect(secs.map((s) => [s.kind, s.d, s.zTop, s.zBot])).toEqual([
      [1, 12, 450, 150],
      [0, 24, 150, 0],
    ]);
    expect(secs[1]!.pieces[0]).toEqual({ page: 3, x: 100, y: 200, c0: 48, r0: 24, w: 240, h: 300 });
    expect(sectionPages(secs).sort()).toEqual([3, 7, 8]);
  });
  it('长度不对、密度 ≤ 0、zTop ≤ zBot 的记录跳过', () => {
    expect(parseHires({ f: [rec.slice(0, 12), [0, 0, 1, 0, 0, 150, 0, 0], [0, 0, 1, 0, 16, 10, 20, 0]] }, 16).size).toBe(0);
    expect(buildingHires(undefined, undefined)).toBeNull();
  });
});

describe('hiresPieceAt / hiresAttr', () => {
  const secs = parseHires({ f: [rec, recU] }, 16).get(hiresFaceKey(0, 0, 5))!;
  it('片内的点给片，片外（列 < c0 或行超出）给 null', () => {
    // s = 5 m → c = 120；z = 100 dm → r = (150 − 100) / 10 × 24 = 120
    expect(hiresPieceAt(secs, 5, 100)?.pc.page).toBe(3);
    expect(hiresPieceAt(secs, 1, 100)).toBeNull(); // c = 24 < c0 48
    expect(hiresPieceAt(secs, 5, 0)).toBeNull(); // r = 360 > r0 + h = 324
    // 上段：s = 2 m → c = 24（第 1 片 c0 0..100）；s = 9 m → c = 108（第 2 片 c0 100..150）
    expect(hiresPieceAt(secs, 2, 300)?.pc.page).toBe(7);
    expect(hiresPieceAt(secs, 9, 300)?.pc.page).toBe(8);
  });
  it('纹理坐标 = (x + c − c0, y + r − r0) / 页边长，第 4 分量是密度', () => {
    const hit = hiresPieceAt(secs, 5, 100);
    const a = hiresAttr(hit, 5, 100, 1024);
    expect(a[0]).toBeCloseTo((100 + 120 - 48) / 1024, 9);
    expect(a[1]).toBeCloseTo((200 + 120 - 24) / 1024, 9);
    expect(a[2]).toBe(3);
    expect(a[3]).toBe(24);
    expect(hiresAttr(null, 5, 100, 1024)).toEqual(NO_HIRES);
  });
  it('切点：片的左右边（米）、段与片的上下沿（dm），不含端点', () => {
    // 街面片 48 / 24 = 2 m、288 / 24 = 12 m；上段两片 100 / 12 ≈ 8.3333 m、150 / 12 = 12.5 m
    expect(hiresCutsS(secs, 0, 20)).toEqual([2, 8.3333, 12, 12.5]);
    expect(hiresCutsS(secs, 2, 12)).toEqual([8.3333]);
    expect(hiresCutsZ(secs, 0, 500)).toEqual([15, 140, 150, 450]);
  });
});

describe('noPhotoFaces（R4 整合，红线）', () => {
  it('x → 面键集合；空 / 不合规的项忽略', () => {
    expect(noPhotoFaces(undefined)).toBeNull();
    expect(noPhotoFaces({ f: [] })).toBeNull();
    expect(noPhotoFaces({ f: [], x: [[0, 0, 3], [1, 0, 2], [0, 0, -1], [0, 1]] })).toEqual(new Set([hiresFaceKey(0, 0, 3), hiresFaceKey(1, 0, 2)]));
  });
});
