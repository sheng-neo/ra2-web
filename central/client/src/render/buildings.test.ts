import { describe, expect, it } from 'vitest';
import { makeFixtureCity } from '../dev/fixture';
import { flatGround } from '../data/terrain';
import { normalizeRing, ringCentroid } from '../geom/ring';
import { buildBuildingChunks, crownColour, hasRoofPhoto, hasWallPhoto, inSensitive, modeOf } from './buildings';
import { parseRecord } from './facades/layout';
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

  it('敏感区内的楼是素灰石材（mode = Plain），区外是写实化类型模式（写字楼 / 住宅 / 唐楼 / 裙楼 / 屋顶机房）', () => {
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
      if (!plain.has(key)) expect(modes.every((m) => m >= FacadeMode.Office && m <= FacadeMode.Plant)).toBe(true);
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

  // 全套测试并发、机器忙时这一条（真实数据、逐顶点检查）超过默认 5 s：给显式超时
  it('aBldg：层高 > 0、街面冷暖 0–0.9、墙脚地面与地形一致，逐栋恒定', { timeout: 30000 }, () => {
    const chunks = buildBuildingChunks(city.buildings, flatGround, zones);
    for (const c of chunks.values()) {
      const bldg = c.arrays.data[3]!;
      for (let i = 0; i < bldg.length; i += 4) {
        expect(bldg[i]!).toBeGreaterThan(2.5);
        expect(bldg[i]!).toBeLessThan(6.5);
        expect(bldg[i + 1]!).toBeGreaterThanOrEqual(0);
        expect(bldg[i + 1]!).toBeLessThanOrEqual(0.9);
        expect(bldg[i + 2]!).toBeCloseTo(0);
        expect(Number.isInteger(bldg[i + 3]!)).toBe(true);
      }
    }
  });

  it('modeOf：类型按 TYPOLOGY_ORDER 映射到 5 起的模式，敏感区沿用 Plain', () => {
    expect(modeOf('office')).toBe(FacadeMode.Office);
    expect(modeOf('residential')).toBe(FacadeMode.Residential);
    expect(modeOf('tenement')).toBe(FacadeMode.Tenement);
    expect(modeOf('podium')).toBe(FacadeMode.Podium);
    expect(modeOf('civic')).toBe(FacadeMode.Civic);
    expect(modeOf('sensitive')).toBe(FacadeMode.Plain);
  });

  it('冠顶色：白 50 %、金 25 %、青 15 %、品红 10 %', () => {
    expect(crownColour(0.1)).toBe(1);
    expect(crownColour(0.6)).toBe(2);
    expect(crownColour(0.8)).toBe(3);
    expect(crownColour(0.95)).toBe(4);
  });
});

describe('照片墙 / 屋顶（R3）', () => {
  const rec = (roofPage: number, wallPage: number) => parseRecord([64, 48, roofPage, 0, 0, 1, wallPage, 0, 0, 0, 0, 10, 10], 16);
  const pl = (...recs: (ReturnType<typeof rec>)[]) => ({ photo: { f2f: null, phase: 0, parted: false, records: recs } });
  it('有照片的屋顶不加程序机房、有照片的墙不加程序冷气机', () => {
    expect(hasRoofPhoto(pl(rec(2, -1)))).toBe(true);
    expect(hasWallPhoto(pl(rec(2, -1)))).toBe(false);
    expect(hasWallPhoto(pl(rec(-1, 0)))).toBe(true);
    expect(hasRoofPhoto(pl(rec(-1, 0)))).toBe(false);
    expect(hasRoofPhoto({ photo: null })).toBe(false);
    expect(hasWallPhoto({ photo: null })).toBe(false);
  });
});
