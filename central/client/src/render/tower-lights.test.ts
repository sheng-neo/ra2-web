import { describe, expect, it } from 'vitest';
import type { LandmarkPlacement } from '@central/data';
import {
  AVIATION_ANY_M,
  AVIATION_MAX_HOSTS,
  AVIATION_MIN_M,
  extremeCorners,
  lightBoxEmitters,
  northEdge,
  planAviation,
  planEdgeLeds,
  planLightBoxes,
  wantsAviation,
  type LightBoxHost,
  type TowerHost,
} from './tower-lights';

/** 40 m × 30 m 的矩形塔楼（dm，逆时针）。 */
function host(id: string, typology: string, tallM: number, feature = 0, edgeLed = false): TowerHost {
  return { p: { b: { id }, ring: { outer: [0, 0, 400, 0, 400, 300, 0, 300] }, top: tallM * 10 }, typology, tallM, feature, edgeLed };
}

describe('航空障碍灯', () => {
  it('写字楼 ≥ 180 m、任何塔楼 ≥ 200 m 才够格；敏感区与矮楼没有', () => {
    expect(wantsAviation(host('a', 'office', AVIATION_MIN_M))).toBe(true);
    expect(wantsAviation(host('a', 'office', AVIATION_MIN_M - 1))).toBe(false);
    expect(wantsAviation(host('a', 'residential', 190))).toBe(false);
    expect(wantsAviation(host('a', 'residential', AVIATION_ANY_M))).toBe(true);
    expect(wantsAviation(host('a', 'sensitive', 300))).toBe(false);
  });

  it('全城只取最高的 15 栋；300 m 以下一栋一盏、以上四角；高度在楼顶之上', () => {
    expect(extremeCorners([0, 0, 400, 0, 400, 300, 0, 300])).toHaveLength(4);
    expect(planAviation([host('t', 'office', 320)])).toHaveLength(4);
    const one = planAviation([host('t', 'office', 220)]);
    expect(one).toHaveLength(1);
    expect(one[0]!.z).toBeGreaterThan(220);
    const many = Array.from({ length: 60 }, (_, i) => host(`b${i}`, 'office', 200 + i));
    const lights = planAviation(many);
    expect(lights).toHaveLength(AVIATION_MAX_HOSTS);
    for (const l of lights) expect(l.z).toBeGreaterThanOrEqual(200 + 60 - AVIATION_MAX_HOSTS);
  });

  it('约 60 % 慢闪 0.5–1.0 Hz（峰值 2.5），其余常亮 1.8：远处是 1–3 px 的小红点，不是红色光团', () => {
    const hosts = Array.from({ length: 400 }, (_, i) => host(`b${i}`, 'office', 320));
    const lights = planAviation(hosts);
    expect(lights).toHaveLength(AVIATION_MAX_HOSTS * 4);
    for (const l of lights) {
      if (l.blinkHz > 0) {
        expect(l.blinkHz).toBeGreaterThanOrEqual(0.5);
        expect(l.blinkHz).toBeLessThanOrEqual(1);
        expect(l.intensity).toBe(2.5);
      } else expect(l.intensity).toBe(1.8);
    }
    for (let i = 0; i < lights.length; i += 4) for (let k = 1; k < 4; k++) expect(lights[i + k]!.phase).toBe(lights[i]!.phase);
  });

  it('地标顶点一盏；敏感区内的地标没有', () => {
    const lm = (id: string, x: number): LandmarkPlacement => ({
      id,
      name: { zh: '測試', en: 'Test' },
      x,
      y: 0,
      rot: 0,
      base: 50,
      height: 3000,
      footprint: { outer: [x - 100, -100, x + 100, -100, x + 100, 100, x - 100, 100] },
      replaces: [],
    });
    const zone = { id: 'z', kind: 'military' as const, area: { outer: [5000, -1000, 7000, -1000, 7000, 1000, 5000, 1000] } };
    const lights = planAviation([], [lm('a', 0), lm('b', 6000), { ...lm('c', -3000), height: 2000 }], [zone]);
    expect(lights).toHaveLength(1);
    expect(lights[0]!.z).toBeCloseTo(305.5);
  });
});

describe('边缘 LED', () => {
  it('只给有冠顶色且抽中边缘灯的楼；矩形四个凸角各一条，上部 40 % 楼高', () => {
    expect(planEdgeLeds([host('a', 'office', 200, 1, false)])).toHaveLength(0);
    expect(planEdgeLeds([host('a', 'office', 200, 0, true)])).toHaveLength(0);
    expect(planEdgeLeds([host('a', 'sensitive', 200, 1, true)])).toHaveLength(0);
    const leds = planEdgeLeds([host('a', 'office', 200, 2, true)]);
    expect(leds).toHaveLength(4);
    for (const l of leds) {
      expect(l.b[2] - l.a[2]).toBeCloseTo(800);
      // 发光亮度（线性 Y）≈ 2.6，契约 edgeLed 2–4
      const y = 0.2126 * l.emit[0] + 0.7152 * l.emit[1] + 0.0722 * l.emit[2];
      expect(y).toBeGreaterThanOrEqual(2);
      expect(y).toBeLessThanOrEqual(4);
    }
  });

  it('凹角（L 形楼的内角）不加', () => {
    // L 形（逆时针）：6 个角里 5 个凸、1 个凹
    const L: TowerHost = {
      p: { b: { id: 'L' }, ring: { outer: [0, 0, 600, 0, 600, 300, 300, 300, 300, 600, 0, 600] }, top: 2000 },
      typology: 'office',
      tallM: 200,
      feature: 1,
      edgeLed: true,
    };
    expect(planEdgeLeds([L])).toHaveLength(5);
  });
});

/** 海旁的楼（矩形 60 m × 30 m，北边朝海）。 */
function shoreHost(id: string, typology: string, tallM: number, x = 0): LightBoxHost {
  return {
    p: { b: { id }, ring: { outer: [x, 0, x + 600, 0, x + 600, 300, x, 300] }, top: tallM * 10, cx: x + 300, cy: 150 },
    typology,
    tallM,
    feature: 0,
    edgeLed: false,
    groundM: 0,
  };
}

describe('天台灯箱、LED 幕墙、裙楼灯带', () => {
  it('northEdge：逆时针矩形的北边（外法线 +y）', () => {
    const e = northEdge([0, 0, 600, 0, 600, 300, 0, 300])!;
    expect(e.ny).toBeCloseTo(1);
    expect(e.ay).toBe(300);
    expect(e.by).toBe(300);
    expect(northEdge([0, 0, 50, 0, 50, 50, 0, 50])).toBeNull();
  });

  it('只在离海近的 60 m 以上塔楼，约 1/4 有；朝北、在楼顶之上、空白单色、亮度 1.0–1.6（过曝）', () => {
    const hosts = Array.from({ length: 400 }, (_, i) => shoreHost(`t${i}`, 'office', 90, i * 1000));
    expect(planLightBoxes(hosts, () => false)).toHaveLength(0);
    const boxes = planLightBoxes(hosts, () => true).filter((p) => p.kind === 'box');
    expect(boxes.length / hosts.length).toBeGreaterThan(0.18);
    expect(boxes.length / hosts.length).toBeLessThan(0.32);
    const colours = new Set<string>();
    for (const b of boxes) {
      expect(b.ny).toBeCloseTo(1);
      expect(b.a[2]).toBeGreaterThan(900);
      expect(b.d[2] - b.a[2]).toBeGreaterThanOrEqual(40);
      expect(b.d[2] - b.a[2]).toBeLessThanOrEqual(100);
      const y = 0.2126 * b.emit[0] + 0.7152 * b.emit[1] + 0.0722 * b.emit[2];
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(1.6 + 1e-6);
      colours.add(b.emit.map((v) => (v / y).toFixed(2)).join(','));
    }
    expect(colours.size).toBe(5);
    // 矮楼、敏感区没有
    expect(planLightBoxes([shoreHost('x', 'office', 40)], () => true).filter((p) => p.kind === 'box')).toHaveLength(0);
    expect(planLightBoxes(hosts.map((h) => ({ ...h, typology: 'sensitive' })), () => true)).toHaveLength(0);
  });

  it('LED 幕墙最多两片、裙楼灯带最多四座；都进 LOW 档发光条光源', () => {
    const hosts = [
      ...Array.from({ length: 10 }, (_, i) => shoreHost(`f${i}`, 'office', 60, i * 500)),
      ...Array.from({ length: 10 }, (_, i) => shoreHost(`p${i}`, 'podium', 14, 5000 + i * 700)),
    ];
    const panels = planLightBoxes(hosts, () => true);
    expect(panels.filter((p) => p.kind === 'field')).toHaveLength(2);
    const stripHosts = new Set(panels.filter((p) => p.kind === 'strip').map((p) => Math.floor((p.a[0] - 5000) / 700)));
    expect(stripHosts.size).toBe(4);
    const em = lightBoxEmitters(panels);
    expect(em).toHaveLength(panels.length);
    for (const e of em) expect(e.z1).toBeGreaterThan(e.z0);
  });
});
