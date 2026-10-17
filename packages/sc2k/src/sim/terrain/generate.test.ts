// sim/terrain/generate.test.ts —— 生成器：固定 seed 快照、确定性、≤1 级约束、水体与 seaLevel 一致、海岸 / 河流 / 湖泊 / 干图 / 树木参数生效、性能、不消费 sim 流。
import { describe, expect, it } from 'vitest';
import { MAP, TILES, XBit, XterClass, tileIndex, xterClassOf } from '../../contracts/grid';
import { FNV_OFFSET, fnv1aBytes } from '../../contracts/prng';
import type { NewCityParams } from '../../contracts/system';
import type { CityState } from '../../contracts/state';
import { createTestContext, hashOf } from '../../testkit';
import { DEFAULT_TERRAIN_TUNING, createTerrainSystem, describeTerrain, hillsRangeFor, lakeFractionFor, seaLevelFor, streamCountFor } from './index';
import { terrainViolations, totalViolations } from './invariants';

type Terrain = NewCityParams['terrain'];
const DEFAULT: Terrain = { coast: true, river: true, hills: 12, water: 5, trees: 15 };
const gen = (terrainSeed: number, terrain: Terrain) => createTestContext({ systems: [createTerrainSystem()], flat: false, params: { terrainSeed, terrain } });
/** 地形相关层的 FNV 哈希（固定 seed 快照）。 */
function layerHash(s: CityState): number {
  const L = s.layers;
  let h = FNV_OFFSET;
  for (const a of [L.alt, L.waterLevel, L.xter, L.xbit, L.xbld]) h = fnv1aBytes(h, a);
  return fnv1aBytes(h, [s.terrain.seaLevel, s.terrain.coast ? 1 : 0, s.terrain.river ? 1 : 0]);
}
const healthy = (s: CityState): void => { const v = terrainViolations(s); expect(v, JSON.stringify(v)).toSatisfy((x: typeof v) => totalViolations(x) === 0); };
/** 是否存在一片 4 连通的水体同时触及两条对边。 */
function waterSpansMap(s: CityState): boolean {
  const L = s.layers;
  const comp = new Int32Array(TILES).fill(-1);
  let n = 0;
  for (let seed = 0; seed < TILES; seed++) {
    if ((L.xbit[seed]! & XBit.Water) === 0 || comp[seed] !== -1) continue;
    const id = n++;
    const stack = [seed]; comp[seed] = id;
    let minX = 127, maxX = 0, minY = 127, maxY = 0;
    while (stack.length > 0) {
      const t = stack.pop()!;
      const x = t >> 7, y = t & 127;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
        const j = tileIndex(nx, ny);
        if ((L.xbit[j]! & XBit.Water) !== 0 && comp[j] === -1) { comp[j] = id; stack.push(j); }
      }
    }
    if ((minX === 0 && maxX === MAP - 1) || (minY === 0 && maxY === MAP - 1)) return true;
  }
  return false;
}

describe('terrain generate', () => {
  it('固定 seed 快照：seed 4242 + 默认参数的地形层哈希不变（改生成器须同步更新本常量）', () => {
    const { state } = gen(4242, DEFAULT);
    expect(layerHash(state).toString(16)).toBe('2d56d9d7');
  });
  it('确定性：同 seed 同参数两次生成逐字节相同；不同 seed 不同；生成不消费 sim 流', () => {
    const a = gen(4242, DEFAULT), b = gen(4242, DEFAULT), c = gen(4243, DEFAULT);
    expect(hashOf(a.state, 'sc2')).toBe(hashOf(b.state, 'sc2'));
    expect(layerHash(a.state)).not.toBe(layerHash(c.state));
    expect(a.ctx.prng.state()).toBe(12345 >>> 0);
  });
  it.each([[1, DEFAULT], [2, { coast: false, river: true, hills: 30, water: 20, trees: 30 }], [3, { coast: true, river: false, hills: 47, water: 47, trees: 47 }], [4, { coast: false, river: false, hills: 0, water: 0, trees: 0 }]] as const)(
    '约束与一致性（seed %i）：≤1 级、无未定义 XTER、水体 ⇔ minCorner < seaLevel、干地水位 = 海拔、水上无树；seaLevel = 映射值',
    (seed, terrain) => {
      const { state } = gen(seed, terrain);
      healthy(state);
      expect(state.terrain).toMatchObject({ seaLevel: seaLevelFor(terrain.water, DEFAULT_TERRAIN_TUNING), coast: terrain.coast, river: terrain.river });
      const d = describeTerrain(state.layers);
      expect(d.maxAlt).toBeLessThanOrEqual(31); expect(d.minAlt).toBeGreaterThanOrEqual(0);
    });
  it('Coast：边缘有咸水、咸水与边缘相连、内陆湖为淡水；无 Coast 时全图无咸水', () => {
    const { state } = gen(11, { coast: true, river: false, hills: 12, water: 5, trees: 0 });
    const L = state.layers;
    const d = describeTerrain(L);
    expect(d.salt).toBeGreaterThan(800); expect(d.water).toBeGreaterThanOrEqual(d.salt);
    let edgeSalt = 0;
    for (let k = 0; k < MAP; k++) for (const idx of [tileIndex(k, 0), tileIndex(k, MAP - 1), tileIndex(0, k), tileIndex(MAP - 1, k)]) if ((L.xbit[idx]! & XBit.SaltWater) !== 0) edgeSalt++;
    expect(edgeSalt).toBeGreaterThan(MAP / 2);
    const noCoast = gen(11, { coast: false, river: false, hills: 12, water: 20, trees: 0 });
    const d2 = describeTerrain(noCoast.state.layers);
    expect(d2.salt).toBe(0); expect(d2.water).toBeGreaterThan(300);                     // 内陆湖
  });
  it('River：一条 4 连通淡水水道从一边贯穿到对边；水下格水位 = 海平面', () => {
    for (const seed of [5, 6]) {
      const { state } = gen(seed, { coast: false, river: true, hills: 12, water: 5, trees: 0 });
      expect(waterSpansMap(state)).toBe(true);
      expect(describeTerrain(state.layers).salt).toBe(0);
      const L = state.layers;
      for (let k = 0; k < TILES; k++) if ((L.xbit[k]! & XBit.Water) !== 0 && xterClassOf(L.xter[k]!) === XterClass.Submerged) { expect(L.waterLevel[k]).toBe(state.terrain.seaLevel); break; }
    }
    const both = gen(5, { coast: true, river: true, hills: 12, water: 5, trees: 0 });
    expect(waterSpansMap(both.state)).toBe(true);
    const d = describeTerrain(both.state.layers);
    expect(d.water).toBeGreaterThan(d.salt);                                                 // 河流段保持淡水
  });
  it('Water=0 且无 Coast / River：全图无水；Hills=0：起伏 ≤ 3 级；Hills=47：起伏 ≥ 12 级', () => {
    const dry = gen(8, { coast: false, river: false, hills: 0, water: 0, trees: 0 });
    const d = describeTerrain(dry.state.layers);
    expect(d.water).toBe(0); expect(d.maxAlt - d.minAlt).toBeLessThanOrEqual(3);
    const mountains = gen(8, { coast: false, river: false, hills: 47, water: 5, trees: 0 });
    const m = describeTerrain(mountains.state.layers);
    expect(m.maxAlt - m.minAlt).toBeGreaterThanOrEqual(12);
  });
  it('Trees：0 → 无树；15 → 有树；47 → 更多；树不在水面 / 瀑布上；密度 1..7', () => {
    const t0 = describeTerrain(gen(9, { ...DEFAULT, trees: 0 }).state.layers).trees;
    const t15 = describeTerrain(gen(9, { ...DEFAULT, trees: 15 }).state.layers).trees;
    const t47 = gen(9, { ...DEFAULT, trees: 47 });
    const n47 = describeTerrain(t47.state.layers).trees;
    expect(t0).toBe(0); expect(t15).toBeGreaterThan(500); expect(n47).toBeGreaterThan(t15 * 2);
    const L = t47.state.layers;
    for (let k = 0; k < TILES; k++) {
      const b = L.xbld[k]!;
      if (b !== 0) { expect(b).toBeGreaterThanOrEqual(0x06); expect(b).toBeLessThanOrEqual(0x0c); expect(L.xbit[k]! & XBit.Water).toBe(0); }
    }
  });
  it('溪流：多水多山时出现 0x40–0x45 / 0x3E / 池塘；装饰水零深度（瀑布 alt+1）', () => {
    const { state } = gen(10, { coast: false, river: false, hills: 30, water: 30, trees: 0 });
    const L = state.layers;
    let stream = 0, bay = 0, fall = 0;
    for (let k = 0; k < TILES; k++) { const x = L.xter[k]!; if (x === 0x40 || x === 0x41) stream++; else if (x >= 0x42 && x <= 0x45) bay++; else if (x === 0x3e) fall++; }
    expect(stream + bay + fall).toBeGreaterThan(10);
    expect(streamCountFor(30, DEFAULT_TERRAIN_TUNING)).toBe(8);
    healthy(state);
  });
  it('滑块映射：seaLevelFor / hillsRangeFor / lakeBiasFor', () => {
    const T = DEFAULT_TERRAIN_TUNING;
    expect(seaLevelFor(5, T)).toBe(4); expect(seaLevelFor(0, T)).toBe(2); expect(seaLevelFor(47, T)).toBe(14);
    expect(hillsRangeFor(0, T)).toBe(2); expect(hillsRangeFor(12, T)).toBe(8); expect(hillsRangeFor(47, T)).toBe(28);
    expect(lakeFractionFor(0, T)).toBe(0); expect(lakeFractionFor(5, T)).toBeCloseTo(0.055, 2); expect(lakeFractionFor(47, T)).toBeCloseTo(T.lakeFractionMax, 6);
  });
  it('性能：一张默认图（含 testkit 装配）< 400 ms', () => {
    const t0 = performance.now();
    gen(4242, DEFAULT);
    expect(performance.now() - t0).toBeLessThan(400);
  });
  it('flat 夹具：createTestContext 默认铺平后角点场重建，工具立即可用', () => {
    const t = createTestContext({ systems: [createTerrainSystem()] });
    expect(describeTerrain(t.state.layers)).toMatchObject({ water: 0, trees: 0, minAlt: 4, maxAlt: 4 });
    t.state.clock.mode = 0;
    expect(t.host.dispatch({ type: 'terrainTool', tool: 'raise', path: [tileIndex(5, 5)] }).ok).toBe(true);
    healthy(t.state);
  });
});
