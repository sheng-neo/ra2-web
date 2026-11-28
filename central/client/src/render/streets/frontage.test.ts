import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CityFile, SensitiveZone } from '@central/data';
import { planBuildings } from '../buildings';
import { zoneDistance } from '../stations/rules';
import { FRONT_CELL_M, FRONT_K, FrontageField, decodeCanopy, encodeCanopy, poolWeights, setFrontageLights, toFieldLight, FRONTAGE_UNIFORMS } from './frontage-field';
import { frontageIntensityAt, stubFrontageLights, type FrontageLight } from './frontage-stub';
import { textureLedgerEntries } from '../materials/lighting';

const light = (o: Partial<FrontageLight> = {}): FrontageLight => ({
  x0: 0,
  y0: 0,
  x1: 6,
  y1: 0,
  z: 4,
  nx: 0,
  ny: -1,
  top: 3.3,
  color: [1, 0.85, 0.6],
  intensity: 0.4,
  ...o,
});

const Y = (s: { r: number; g: number; b: number }) => 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b;

describe('铺面溢光（纯函数）', () => {
  it('光斑：门前最亮、2–3 m 外衰减到三分之一以下、墙里为 0、两端软边', () => {
    const [near] = poolWeights(3, 0.3, 6, 0);
    const [m25] = poolWeights(3, 2.5, 6, 0);
    const [inside] = poolWeights(3, -1, 6, 0);
    const [beyond] = poolWeights(-3, 0.5, 6, 0);
    expect(near).toBeGreaterThan(0.75);
    expect(m25 / near).toBeLessThan(0.33);
    expect(inside).toBe(0);
    expect(beyond).toBe(0);
    // 雨篷下有亮带，雨篷外沿 0.6 m 后消失
    expect(poolWeights(3, 1, 6, 2)[1]).toBeGreaterThan(0.9);
    expect(poolWeights(3, 2.7, 6, 2)[1]).toBe(0);
  });

  it('法线与线段方向对齐（外法线 = (dy, −dx)），不符就交换端点', () => {
    const f = toFieldLight(light({ nx: 0, ny: -1 }), 20)!;
    expect(f.nx).toBeCloseTo(0);
    expect(f.ny).toBeCloseTo(-1);
    const g = toFieldLight(light({ nx: 0, ny: 1 }), 20)!;
    expect(g.ny).toBeCloseTo(1);
    expect(g.x0).toBeCloseTo(6);
  });

  it('关门后变暗（5 % 留灯）；太暗的不进场', () => {
    expect(frontageIntensityAt({ intensity: 0.4, closeHour: 21 }, 20)).toBe(0.4);
    expect(frontageIntensityAt({ intensity: 0.4, closeHour: 21 }, 22)).toBeCloseTo(0.02);
    expect(toFieldLight(light({ intensity: 0.3, closeHour: 21 }), 23)).toBeNull();
  });

  it('雨篷编码往返', () => {
    for (const [d, s] of [
      [2, 0.28],
      [0, 0],
      [3.5, 0.31],
      [1.25, 0.1],
    ] as const) {
      const [dd, ss] = decodeCanopy(encodeCanopy(d, s));
      expect(dd).toBeCloseTo(d, 2);
      expect(ss).toBeCloseTo(s, 2);
    }
  });

  it('门前照度按规格标定：玻璃 Y 0.4 → 门前 0.3 m 照度约 3（反照率 0.09 时 Y ≈ 0.27）；格子与逐条求和一致', () => {
    const lights = [light(), light({ x0: 8, x1: 14, intensity: 0.2 }), light({ x0: 30, x1: 35, intensity: 0.5, canopy: { under: 4, depth: 2, soffitY: 0.28 } })];
    const field = new FrontageField(lights, [], 20);
    const out = { r: 0, g: 0, b: 0, dirX: 0, dirY: 0 };
    field.sample(3, -0.3, out);
    expect(Y(out)).toBeGreaterThan(2.4);
    expect(Y(out)).toBeLessThan(3.4);
    // 光从墙那边来（指向 +y）
    expect(out.dirY).toBeGreaterThan(0);
    // 雨篷下（离墙 1.5 m）比没有雨篷的同距离亮
    const a = Y(field.sample(32.5, -1.5, out));
    const b = Y(field.sample(3, -1.5, out));
    expect(a).toBeGreaterThan(b * 1.5);
    // 暴力求和对照：每个采样点 = 全部光源之和
    for (let i = 0; i < 200; i++) {
      const x = -5 + ((i * 37) % 450) / 10;
      const y = -6 + ((i * 13) % 70) / 10;
      let want = 0;
      for (const l of lights) {
        const one = new FrontageField([l], [], 20);
        want += Y(one.sample(x, y, out));
      }
      expect(Y(field.sample(x, y, out))).toBeCloseTo(want, 4);
    }
    expect(FRONT_K).toBeGreaterThan(0);
  });

  it('敏感区（及 3 m 内）不出光源', () => {
    const zone: SensitiveZone = { id: 'z', kind: 'government', area: { outer: [100, 0, 300, 0, 300, -200, 100, -200].map((v) => v) } } as unknown as SensitiveZone;
    // 区在 x 10–30 m、y −20–0 m（dm）
    const inZone = light({ x0: 12, x1: 18, y0: -5, y1: -5 });
    const near = light({ x0: 31, x1: 36, y0: 0, y1: 0 });
    const far = light({ x0: 50, x1: 56, y0: 0, y1: 0 });
    const field = new FrontageField([inZone, near, far], [zone], 20);
    expect(field.lights.length).toBe(1);
    expect(field.lights[0]!.x0).toBeGreaterThanOrEqual(50);
  });

  it('上 GPU：格索引 + 条目表登记进显存账本；空清单时关掉', () => {
    const f = setFrontageLights([light(), light({ x0: 20, x1: 25 })], [], 20);
    expect(FRONTAGE_UNIFORMS.uFrontRows.value).toBe(f.rows);
    expect(FRONTAGE_UNIFORMS.uFrontRect.value.z).toBe(FRONT_CELL_M);
    expect(textureLedgerEntries().find(([k]) => k === 'streets:frontage')?.[1]).toBeGreaterThan(0);
    setFrontageLights([], [], 20);
    expect(FRONTAGE_UNIFORMS.uFrontRows.value).toBe(0);
  });
});

describe('占位铺面光源（真实城市数据）', () => {
  const city = JSON.parse(readFileSync(new URL('../../../public/city/central.json', import.meta.url), 'utf8')) as CityFile;
  it('德辅道中两旁的铺位都有光源；敏感区 3 m 内一个都没有；GPU 数据 < 2 MB', { timeout: 120000 }, () => {
    const { plans } = planBuildings(city.buildings, () => 0, city.zones.sensitive, {});
    const lights = stubFrontageLights(plans, city.roads);
    expect(lights.length).toBeGreaterThan(3000);
    for (const l of lights) {
      expect(l.intensity).toBeGreaterThan(0);
      expect(Math.hypot(l.nx, l.ny)).toBeCloseTo(1, 5);
    }
    const field = new FrontageField(lights, city.zones.sensitive, 20);
    expect(field.lights.length).toBeLessThan(lights.length);
    for (const f of field.lights) expect(zoneDistance(city.zones.sensitive, f.x0 + f.dx * f.len * 0.5, f.y0 + f.dy * f.len * 0.5)).toBeGreaterThanOrEqual(3);
    const out = { r: 0, g: 0, b: 0, dirX: 0, dirY: 0 };
    // 上环（Hillier 街口北行人路）、中环（女皇像街口南行人路）：附近 6 m 内有亮铺光斑
    for (const [x, y] of [
      [-332.78, 427.91],
      [115, 135],
    ] as const) {
      let best = 0;
      for (let dx = -6; dx <= 6; dx += 0.5) for (let dy = -6; dy <= 6; dy += 0.5) best = Math.max(best, Y(field.sample(x + dx, y + dy, out)));
      expect(best).toBeGreaterThan(1);
    }
    const bytes = field.cols * field.rows * 4 + Math.ceil((field.entries * 2) / 1024) * 1024 * 8;
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });
});
