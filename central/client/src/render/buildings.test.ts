import { describe, expect, it } from 'vitest';
import { makeFixtureCity } from '../dev/fixture';
import { flatGround } from '../data/terrain';
import { normalizeRing, ringCentroid } from '../geom/ring';
import { buildBuildingChunks, inSensitive } from './buildings';
import { buildingChunk, chunkKey } from './chunks';
import { FacadeMode } from './facade';
import { buildRoadChunks } from './roads';

describe('buildings / roads on the fixture city', () => {
  const city = makeFixtureCity();
  const zones = city.zones.sensitive;

  it('fixture 本身合法：外环逆时针可归一、ID 唯一、地标在数据范围内', () => {
    expect(new Set(city.buildings.map((b) => b.id)).size).toBe(city.buildings.length);
    for (const b of city.buildings) expect(normalizeRing(b.footprint)).not.toBeNull();
    const [x0, y0, x1, y1] = city.meta.bbox;
    for (const l of city.landmarks) {
      expect(l.x).toBeGreaterThan(x0);
      expect(l.x).toBeLessThan(x1);
      expect(l.y).toBeGreaterThan(y0);
      expect(l.y).toBeLessThan(y1);
    }
  });

  it('每栋楼只进一块；每栋至少 10 个三角形（4 墙 + 屋顶）', () => {
    const chunks = buildBuildingChunks(city.buildings, flatGround, zones);
    const expectedKeys = new Set(city.buildings.map((b) => chunkKey(buildingChunk(b))));
    expect(new Set(chunks.keys())).toEqual(expectedKeys);
    let tris = 0;
    for (const c of chunks.values()) tris += c.arrays.triangleCount;
    // 矩形楼：8 墙三角形 + 2 屋顶；带洞的更多
    expect(tris).toBeGreaterThanOrEqual(city.buildings.length * 10);
  });

  it('敏感区内的楼是无窗灰体（mode = Plain），区外不是', () => {
    const chunks = buildBuildingChunks(city.buildings, flatGround, zones);
    const plain = new Set<string>();
    for (const b of city.buildings) {
      const [x, y] = ringCentroid(b.footprint.outer);
      if (inSensitive(zones, x, y)) plain.add(chunkKey(buildingChunk(b)));
    }
    expect(plain.size).toBeGreaterThan(0);
    let plainVerts = 0;
    for (const [key, c] of chunks) {
      const styles = c.arrays.data[2]!.filter((_, i) => i % 4 === 3);
      const modes = styles.map((s) => Math.floor(s / 256));
      if (!plain.has(key)) expect(modes.every((m) => m === FacadeMode.Windows)).toBe(true);
      plainVerts += modes.filter((m) => m === FacadeMode.Plain).length;
    }
    expect(plainVerts).toBeGreaterThan(0);
  });

  it('道路：人行道等不画，可驾驶路与行人街进块；高架有桥面侧板', () => {
    const chunks = buildRoadChunks(city.roads, flatGround);
    let maxY = 0;
    for (const c of chunks.values()) maxY = Math.max(maxY, ...c.arrays.data[0]!.filter((_, i) => i % 3 === 1));
    // 高架 level 1 → 6 m
    expect(maxY).toBeGreaterThan(5.9);
    expect(maxY).toBeLessThan(6.3);
  });
});
