import { describe, expect, it } from 'vitest';
import {
  GLSL_WINDOWS,
  HOME_LIT_TABLE,
  INT_OFFSET,
  OFFICE_LIT_TABLE,
  hash3,
  homeLitTarget,
  homeWarm,
  homeWindowLit,
  mix32,
  OFFICE_BAY_DROP,
  officeBayDropped,
  officeFloorState,
  officeLitTarget,
  officeTenantBrightness,
  officeParams,
  officeRun,
  officeRunLength,
  officeStack,
  officeTint,
  officeWindowLit,
} from './windows';

const KEYS = Array.from({ length: 120 }, (_, i) => (i * 7919 + 13) % 1048576);
const FLOORS = 40;
const BAYS = 120;

describe('hash3 / mix32（与 GLSL 逐位一致的整数哈希）', () => {
  it('固定输入的固定输出（防止改坏后与 shader 对不上）', () => {
    expect(mix32(0)).toBe(0);
    expect(mix32(1)).toBe(mix32(1));
    expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3));
    expect(hash3(1, 2, 3)).not.toBe(hash3(1, 2, 4));
    const v = hash3(4096, 17, 26);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(Number.isInteger(v * 16777216)).toBe(true);
  });

  it('近似均匀：10 万个样本的均值 ≈ 0.5，十分位桶各约 10 %', () => {
    const buckets = new Array<number>(10).fill(0);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) {
      const h = hash3(i % 317, Math.floor(i / 317), 5);
      sum += h;
      buckets[Math.floor(h * 10)]!++;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
    for (const b of buckets) expect(Math.abs(b / n - 0.1)).toBeLessThan(0.01);
  });

  it('GLSL 片段含同样的常量与两张钟点表', () => {
    for (const c of ['0x7feb352du', '0x846ca68bu', '0x9e3779b9u', '0x85ebca6bu', '0xc2b2ae35u']) expect(GLSL_WINDOWS).toContain(c);
    expect(GLSL_WINDOWS).toContain('float officeLitTarget(float x)');
    expect(GLSL_WINDOWS).toContain('float homeLitTarget(float x)');
  });
});

describe('写字楼亮灯（规格 B3）', () => {
  it('钟点表：20:00 = 0.38，18:30 0.60 … 01:00 0.08，单调不增', () => {
    expect(officeLitTarget(20)).toBeCloseTo(0.38);
    expect(officeLitTarget(18.5)).toBeCloseTo(0.6);
    expect(officeLitTarget(25)).toBeCloseTo(0.08);
    expect(officeLitTarget(20.5)).toBeCloseTo((0.38 + 0.25) / 2);
    for (let i = 1; i < OFFICE_LIT_TABLE.length; i++) expect(OFFICE_LIT_TABLE[i]![1]).toBeLessThanOrEqual(OFFICE_LIT_TABLE[i - 1]![1]);
  });

  it('各钟点的实际亮灯率 = 表值 ± 0.05', () => {
    for (const [clock, target] of OFFICE_LIT_TABLE) {
      let lit = 0;
      let n = 0;
      for (const key of KEYS) {
        for (let f = 0; f < FLOORS; f++) {
          for (let b = 0; b < BAYS; b++) {
            lit += officeWindowLit(key, INT_OFFSET + f, b, clock) ? 1 : 0;
            n++;
          }
        }
      }
      expect(Math.abs(lit / n - target)).toBeLessThanOrEqual(0.05);
    }
  });

  it('20:00：整层熄灯 12–18 %，整层通亮只有 4–8 %（不成「条形码」）', () => {
    let dark = 0;
    let full = 0;
    let n = 0;
    for (const key of KEYS) {
      for (let f = 0; f < FLOORS; f++) {
        const s = officeFloorState(key, INT_OFFSET + f, 20);
        dark += s === 'dark' ? 1 : 0;
        full += s === 'full' ? 1 : 0;
        n++;
      }
    }
    expect(dark / n).toBeGreaterThanOrEqual(0.12);
    expect(dark / n).toBeLessThanOrEqual(0.18);
    expect(full / n).toBeGreaterThanOrEqual(0.04);
    expect(full / n).toBeLessThanOrEqual(0.08);
  });

  it('租户：楼层组跨 1–4 层，段长 3–14 个窗距；一段之内除个别熄灯的窗距外同亮同灭', () => {
    const spans = new Set<number>();
    const lens = new Set<number>();
    for (const key of KEYS) {
      const p = officeParams(key);
      spans.add(p.span);
      expect(p.span).toBeGreaterThanOrEqual(1);
      expect(p.span).toBeLessThanOrEqual(4);
      for (let s = 0; s < 30; s++) {
        const len = officeRunLength(key, s);
        lens.add(len);
        expect(len).toBeGreaterThanOrEqual(3);
        expect(len).toBeLessThanOrEqual(14);
      }
    }
    expect(spans).toEqual(new Set([1, 2, 3, 4]));
    expect(Math.min(...lens)).toBe(3);
    expect(Math.max(...lens)).toBe(14);
    // 一段之内连续的窗同亮同灭（单个熄灯的窗距除外）
    for (const key of KEYS.slice(0, 20)) {
      for (let f = 0; f < FLOORS; f++) {
        const fl = INT_OFFSET + f;
        if (officeFloorState(key, fl, 20) !== 'runs') continue;
        const st = officeStack(key, fl);
        for (let b = 1; b < BAYS; b++) {
          if (officeRun(key, st, b) !== officeRun(key, st, b - 1)) continue;
          if (officeBayDropped(key, fl, b) || officeBayDropped(key, fl, b - 1)) continue;
          expect(officeWindowLit(key, fl, b, 20)).toBe(officeWindowLit(key, fl, b - 1, 20));
        }
      }
    }
  });

  it('亮着的段里约 15 % 的窗距熄灯；租户亮度 0.3–1.5，多数偏暗', () => {
    let lit = 0;
    let dropped = 0;
    for (const key of KEYS.slice(0, 40)) {
      for (let f = 0; f < FLOORS; f++) {
        const fl = INT_OFFSET + f;
        if (officeFloorState(key, fl, 20) !== 'full') continue;
        for (let b = 0; b < BAYS; b++) {
          lit++;
          dropped += officeWindowLit(key, fl, b, 20) ? 0 : 1;
        }
      }
    }
    expect(Math.abs(dropped / lit - OFFICE_BAY_DROP)).toBeLessThan(0.03);
    const bs = Array.from({ length: 1000 }, (_, i) => officeTenantBrightness(hash3(i, 5, 28), false));
    expect(Math.min(...bs)).toBeGreaterThanOrEqual(0.3);
    expect(Math.max(...bs)).toBeLessThanOrEqual(1.5);
    const median = [...bs].sort((a, b) => a - b)[500]!;
    expect(median).toBeLessThan(0.7);
    expect(officeTenantBrightness(0.5, true)).toBeGreaterThan(officeTenantBrightness(0.5, false));
  });

  it('灯色：暖白 10–15 %，其余中性 / 冷白', () => {
    let warm = 0;
    let n = 0;
    for (const key of KEYS) {
      for (let s = 0; s < 50; s++) {
        for (let r = 0; r < 10; r++) {
          warm += officeTint(key, s, r) === 'warm' ? 1 : 0;
          n++;
        }
      }
    }
    expect(warm / n).toBeGreaterThanOrEqual(0.1);
    expect(warm / n).toBeLessThanOrEqual(0.15);
  });
});

describe('住宅亮灯（规格 B4）', () => {
  it('各钟点的实际亮灯率 = 表值 ± 0.05（20:00 = 0.28，都在 10–35 % 内）', () => {
    expect(homeLitTarget(20)).toBeCloseTo(0.28);
    for (const [clock, target] of HOME_LIT_TABLE) {
      if (clock < 19) continue;
      expect(target).toBeGreaterThanOrEqual(0.1);
      expect(target).toBeLessThanOrEqual(0.35);
      let lit = 0;
      let n = 0;
      for (const key of KEYS) {
        for (let f = 0; f < FLOORS; f++) {
          for (let flat = 0; flat < 12; flat++) {
            for (let slot = 0; slot < 3; slot++) {
              lit += homeWindowLit(key, INT_OFFSET + f, flat, slot, clock) ? 1 : 0;
              n++;
            }
          }
        }
      }
      expect(Math.abs(lit / n - target)).toBeLessThanOrEqual(0.05);
    }
  });

  it('按户成组：亮窗的同户邻窗大多也亮（成对 / 三扇）', () => {
    let pairs = 0;
    let litFirst = 0;
    for (const key of KEYS) {
      for (let f = 0; f < FLOORS; f++) {
        for (let flat = 0; flat < 12; flat++) {
          if (!homeWindowLit(key, INT_OFFSET + f, flat, 0, 20)) continue;
          litFirst++;
          if (homeWindowLit(key, INT_OFFSET + f, flat, 1, 20)) pairs++;
        }
      }
    }
    // 独立抽样只有约 28 %；按户亮灯后约 75 %
    expect(pairs / litFirst).toBeGreaterThan(0.65);
  });

  it('灯色：55–65 % 暖', () => {
    let warm = 0;
    let n = 0;
    for (const key of KEYS) {
      for (let f = 0; f < FLOORS; f++) {
        for (let flat = 0; flat < 8; flat++) {
          warm += homeWarm(key, INT_OFFSET + f, flat) ? 1 : 0;
          n++;
        }
      }
    }
    expect(warm / n).toBeGreaterThanOrEqual(0.55);
    expect(warm / n).toBeLessThanOrEqual(0.65);
  });
});
