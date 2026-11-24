import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CityFile } from '@central/data';
import { inSensitive } from './buildings';
import { classify, coreWeight, F2F_RANGE, floorAreaShare, floorToFloor, typologyInput, type Typology, type TypologyInput } from './typology';

const city = JSON.parse(readFileSync(new URL('../../public/city/central.json', import.meta.url)).toString('utf8')) as CityFile;
const rows = city.buildings.map((b) => {
  const i = typologyInput(b, b.base, inSensitive(city.zones.sensitive, ...(centroid(b) as [number, number])));
  return { ...i, typology: classify(i) };
});

function centroid(b: CityFile['buildings'][number]): [number, number] {
  const o = b.footprint.outer;
  let x = 0;
  let y = 0;
  for (let i = 0; i < o.length; i += 2) {
    x += o[i]!;
    y += o[i + 1]!;
  }
  return [(x * 2) / o.length, (y * 2) / o.length];
}

/** MVP 可玩区（114.155–114.1612, 22.2785–22.2875）投影到模拟坐标（米）：citymap projectRectBounds(MVP_RECT) 的结果。 */
const MVP_M = [13.6, -485, 652.8, 511.8] as const;

const base: TypologyInput = { kind: 'tower', heightM: 120, storeys: 30, areaM2: 1500, baseM: 5, x: 450, y: 0, sensitive: false };

describe('classify（规则）', () => {
  it('敏感区优先，裙楼单列', () => {
    expect(classify({ ...base, sensitive: true })).toBe('sensitive');
    expect(classify({ ...base, kind: 'podium' })).toBe('podium');
    expect(classify({ ...base, kind: 'civic' })).toBe('civic');
  });

  it('平地：层高 ≥ 3.6 m 是写字楼，≤ 3.3 m 且 ≥ 30 m 高是住宅；核心区门槛降到 3.25 m', () => {
    expect(classify({ ...base, storeys: 30 })).toBe('office'); // 4.0 m
    expect(classify({ ...base, x: -600, storeys: 40 })).toBe('residential'); // 3.0 m，上环
    expect(classify({ ...base, x: -600, storeys: 36 })).toBe('residential'); // 3.33 m，上环外围
    expect(classify({ ...base, x: 450, storeys: 36 })).toBe('office'); // 3.33 m，中环核心
  });

  it('矮楼：平地上 < 30 m 且层高不高的是唐楼', () => {
    expect(classify({ ...base, x: -600, heightM: 20, storeys: 6, areaM2: 120 })).toBe('tenement');
    expect(classify({ ...base, x: -600, heightM: 20, storeys: undefined, areaM2: 120 })).toBe('tenement');
  });

  it('半山（楼底 ≥ 35 mPD）一律住宅，豪宅层高 3.8 m 也是；只有又大又高层高的才算写字楼', () => {
    expect(classify({ ...base, baseM: 120, storeys: 30, areaM2: 500 })).toBe('residential'); // 4.0 m
    expect(classify({ ...base, baseM: 120, heightM: 12, storeys: 3, areaM2: 200 })).toBe('residential');
    expect(classify({ ...base, baseM: 60, heightM: 90, storeys: 20, areaM2: 2000 })).toBe('office'); // 4.5 m、大
  });

  it('没有层数：平地大高楼按写字楼', () => {
    expect(classify({ ...base, storeys: undefined, areaM2: 1200, heightM: 60, x: -600 })).toBe('office');
    expect(classify({ ...base, storeys: undefined, areaM2: 300, heightM: 60, x: -600 })).toBe('residential');
  });

  it('coreWeight：中环核心 1，上环西部、远东 0', () => {
    expect(coreWeight(450, 0)).toBe(1);
    expect(coreWeight(-600, 0)).toBe(0);
    expect(coreWeight(1700, 0)).toBe(0);
    expect(coreWeight(450, -1000)).toBe(0);
  });
});

describe('floorToFloor', () => {
  it('有层数时取高 ÷ 层数，夹到类型范围并凑整层；没有时用缺省 4.0 / 2.9', () => {
    expect(floorToFloor('office', 120, 30)).toBeCloseTo(4.0);
    expect(floorToFloor('office', 120)).toBeCloseTo(4.0);
    expect(floorToFloor('residential', 87)).toBeCloseTo(2.9);
    expect(floorToFloor('residential', 90, 30)).toBeCloseTo(3.0);
    // 层高 2.0 m 不合理 → 夹到 2.75 后凑整层
    const f = floorToFloor('residential', 60, 30);
    expect(f).toBeGreaterThanOrEqual(2.75 * 0.95);
    expect(Math.abs(60 / f - Math.round(60 / f))).toBeLessThan(1e-9);
    for (const t of Object.keys(F2F_RANGE) as Typology[]) {
      const [lo, hi] = F2F_RANGE[t];
      for (const h of [5, 33, 77, 150, 300]) {
        for (const s of [undefined, 1, 10, 40, 90]) {
          const v = floorToFloor(t, h, s);
          expect(v).toBeGreaterThanOrEqual(Math.min(lo * 0.95, h));
          expect(v).toBeLessThanOrEqual(hi * 1.05);
        }
      }
    }
  });
});

describe('classify（真实数据，规格 B2 验收）', () => {
  it('MVP 矩形里 ≥ 70 % 的塔楼楼面面积是写字楼', () => {
    const share = floorAreaShare(rows, MVP_M);
    expect(share.get('office') ?? 0).toBeGreaterThanOrEqual(0.7);
  });

  it('楼底 ≥ 40 mPD 的塔楼 ≥ 80 % 是住宅', () => {
    const hill = rows.filter((r) => r.kind === 'tower' && r.baseM >= 40);
    expect(hill.length).toBeGreaterThan(500);
    expect(hill.filter((r) => r.typology === 'residential').length / hill.length).toBeGreaterThanOrEqual(0.8);
  });

  it('各类型都有，敏感区内的楼全是 sensitive', () => {
    const kinds = new Set(rows.map((r) => r.typology));
    for (const t of ['office', 'residential', 'tenement', 'podium', 'sensitive'] as Typology[]) expect(kinds.has(t)).toBe(true);
    for (const r of rows) expect(r.sensitive === (r.typology === 'sensitive')).toBe(true);
  });
});
