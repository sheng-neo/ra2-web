import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CityFile } from '@central/data';
import { facadeKey } from '../facade';
import { hash3 } from '../windows';
import { CANOPY_SOFFIT_Y, SHOP_Y_MAX, SHOP_Y_MIN, canopyLights, dropOnHiresFaces, frontageLights, hiresStreetWalls, shopCloseHour, shopLitTarget, type FrontagePlan } from './frontage';
import { buildingHires, hiresFaceKey, type HiresSection } from './hires-layout';

// 20 m × 10 m 的楼（dm，外环逆时针）：边 0 是南墙 (0,0)→(200,0)，外法线朝 −y
const RING = [0, 0, 200, 0, 200, 100, 0, 100];
const SEC: HiresSection = { kind: 0, d: 24, zTop: 200, zBot: 40, pieces: [{ page: 0, x: 0, y: 0, c0: 0, r0: 0, w: 480, h: 384 }] };

function plan(bays: number[][], style = 3.25): FrontagePlan {
  return {
    p: { rings: [RING], parts: null, b: {} },
    style,
    groundM: 4,
    hires: { faces: new Map([[hiresFaceKey(0, 0, 0), [SEC]]]), bays },
  };
}

/** 找一个在 20:00 亮着（h1 < 0.9）与一个整夜落闸（h1 ≥ 0.9）的种子。 */
function seeds(style: number): { lit: number; shut: number } {
  const key = facadeKey(style);
  let lit = 0;
  let shut = 0;
  for (let s = 1; s < 256 && (!lit || !shut); s++) {
    const h = hash3(key, 7000 + s, 71);
    if (h < 0.1 && !lit) lit = s;
    if (h >= 0.9 && !shut) shut = s;
  }
  return { lit, shut };
}

describe('shopLitTarget / shopCloseHour（与着色器 hiresNight 相同）', () => {
  it('20:00 按路段：上环 0.65、中环西 0.45、中环东 0.30、金钟道 0.6；23:00 约收一半；关门时刻是门槛的反函数', () => {
    expect(shopLitTarget(20, -200)).toBeCloseTo(0.65, 2);
    expect(shopLitTarget(20, 200)).toBeCloseTo(0.45, 2);
    expect(shopLitTarget(20, 500)).toBeCloseTo(0.3, 2);
    expect(shopLitTarget(20, 1000)).toBeCloseTo(0.6, 2);
    expect(shopLitTarget(23, 200) / shopLitTarget(20, 200)).toBeLessThan(0.5);
    expect(shopLitTarget(1.5, 200)).toBeCloseTo(shopLitTarget(25.5, 200), 6);
    expect(shopCloseHour(0.95, 200)).toBeNull();
    expect(shopCloseHour(0.05, 200)).toBeUndefined();
    for (const h of [0.12, 0.2, 0.3, 0.4]) {
      const t = shopCloseHour(h, 200)!;
      expect(t).toBeGreaterThan(18);
      expect(t).toBeLessThan(26);
      expect(shopLitTarget(t, 200)).toBeCloseTo(h, 5);
      // 关门之前亮、之后不亮
      expect(h < shopLitTarget(t - 0.05, 200)).toBe(true);
      expect(h < shopLitTarget(t + 0.05, 200)).toBe(false);
    }
  });
});

describe('frontageLights', () => {
  it('亮着的铺位出一条光源（沿墙的位置、外法线、亮度区间、色温三选一）；整夜落闸的不出', () => {
    const { lit, shut } = seeds(3.25);
    expect(lit).toBeGreaterThan(0);
    expect(shut).toBeGreaterThan(0);
    const out = frontageLights([plan([[0, 0, 0, 100, 725, lit, 90, 40, 30], [0, 0, 0, 900, 1500, shut, 90, 40, 30]])]);
    expect(out).toHaveLength(1);
    const l = out[0]!;
    expect([l.x0, l.y0, l.x1, l.y1]).toEqual([1, 0, 7.25, 0]);
    expect(l.nx).toBeCloseTo(0, 9);
    expect(l.ny).toBe(-1);
    expect(l.z).toBe(4);
    expect(l.top).toBeCloseTo(4.5, 6); // 开口顶 9 m − 地面 4 m = 5 m，夹到 4.5
    expect(l.intensity).toBeGreaterThanOrEqual(SHOP_Y_MIN);
    expect(l.intensity).toBeLessThanOrEqual(SHOP_Y_MAX);
    expect(Math.max(...l.color)).toBeCloseTo(1, 6);
    expect(l.closeHour).toBeUndefined(); // h1 < 0.1：整夜亮
  });
  it('没有高清街面段的面、LOW 档（分层楼画成平顶）不出；雨篷出一条只有雨篷灯的光源', () => {
    const { lit } = seeds(3.25);
    const p = plan([[0, 0, 1, 100, 725, lit, 90, 40, 30]]);
    expect(frontageLights([p])).toHaveLength(0);
    const low: FrontagePlan = { ...plan([[0, 0, 0, 100, 725, lit, 90, 40, 30]]), p: { rings: [RING], parts: null, b: { parts: [{}] } } };
    expect(frontageLights([low])).toHaveLength(0);
    // 雨篷灯：沿南墙 x 2–18 m，伸出 25 dm，顶 86 dm、厚 30 cm → 底离地 8.3 − 4 = 4.3 m；外法线 = 贴墙边的右手侧
    const can = [20, 0, 180, 0, 25, 86, 30, 0x808080, 0x404040, 0xc0c0c0];
    const c = canopyLights([{ rec: can, groundM: 4 }]);
    expect(c).toHaveLength(1);
    expect(c[0]!.intensity).toBe(0);
    expect(c[0]!.closeHour).toBeUndefined();
    expect(c[0]!.canopy).toEqual({ under: expect.closeTo(4.3, 6), depth: 2.5, soffitY: CANOPY_SOFFIT_Y });
    expect([c[0]!.x0, c[0]!.x1, c[0]!.nx, c[0]!.ny]).toEqual([2, 18, 0, -1]);
    expect(canopyLights([{ rec: can.slice(0, 9) }])).toHaveLength(0);
  });
  it('真实数据：buildingHires 带上铺位；20:00 亮着的铺位比例落在路段份额里（0.3–0.65）', () => {
    const city = JSON.parse(readFileSync(new URL('../../../public/city/central.json', import.meta.url), 'utf8')) as CityFile;
    if (!city.meta.hires) return;
    let bays = 0;
    let lit = 0;
    for (const b of city.buildings) {
      const h = buildingHires(b.hires, city.meta.hires);
      if (!h) continue;
      bays += h.bays.length;
      const key = facadeKey(b.style);
      const x = b.footprint.outer[0]! / 10;
      for (const r of h.bays) if (hash3(key, 7000 + r[5]!, 71) < shopLitTarget(20, x)) lit++;
    }
    expect(bays).toBeGreaterThan(500);
    expect(lit / bays).toBeGreaterThan(0.3);
    expect(lit / bays).toBeLessThan(0.7);
  }, 60_000);
});

describe('dropOnHiresFaces', () => {
  it('去掉落在有高清街面段的墙上的占位光源（平行、离墙 ≤ 1.2 m），别的墙上的留下', () => {
    const walls = hiresStreetWalls([plan([])]);
    expect(walls).toEqual([[0, 0, 20, 0]]);
    const on = { x0: 2, y0: 0.3, x1: 6, y1: 0.3 };
    const off = { x0: 2, y0: 5, x1: 6, y1: 5 };
    const across = { x0: 3, y0: -2, x1: 3, y1: 2 };
    const beyond = { x0: 25, y0: 0, x1: 29, y1: 0 };
    expect(dropOnHiresFaces([on, off, across, beyond], walls)).toEqual([off, across, beyond]);
    expect(dropOnHiresFaces([on], [])).toEqual([on]);
  });
});
