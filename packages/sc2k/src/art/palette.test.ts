// ===== art/palette.test.ts =====（WORKPLAN WP9 验收：256 项、循环组区间、分区 5/6/7 纯色）
import { describe, expect, it } from 'vitest';
import { IDX, RAMP_COUNT, RAMP_STEPS, Ramp, buildPalette, ci, luma, misc, rampRgb } from './palette';

describe('art: buildPalette', () => {
  const pal = buildPalette();
  const rgb = (k: number): [number, number, number, number] => [pal.rgba[k * 4]!, pal.rgba[k * 4 + 1]!, pal.rgba[k * 4 + 2]!, pal.rgba[k * 4 + 3]!];
  it('256 项 RGBA；只有索引 0 透明', () => {
    expect(pal.rgba.length).toBe(256 * 4);
    expect(rgb(0)[3]).toBe(0);
    for (let k = 1; k < 256; k++) expect(rgb(k)[3]).toBe(255);
  });
  it('分区纯色 5/6/7 = R 绿 (60,170,70) / C 蓝 (70,110,210) / I 黄 (210,180,60)', () => {
    expect(rgb(IDX.ZoneR).slice(0, 3)).toEqual([60, 170, 70]);
    expect(rgb(IDX.ZoneC).slice(0, 3)).toEqual([70, 110, 210]);
    expect(rgb(IDX.ZoneI).slice(0, 3)).toEqual([210, 180, 60]);
    expect(rgb(IDX.Black)[0]).toBeLessThan(32); expect(rgb(IDX.White)[1]).toBeGreaterThan(230);
  });
  it('循环组：A 160..175 (1200 ms)、B 176..183 (800 ms)、C 184..191 (600 ms)，互不重叠且 ≥ 160', () => {
    expect(pal.cycles.map((c) => [c.start, c.length, c.periodMs])).toEqual([[160, 16, 1200], [176, 8, 800], [184, 8, 600]]);
    for (const c of pal.cycles) { expect(c.start).toBeGreaterThanOrEqual(160); expect(c.start + c.length).toBeLessThanOrEqual(192); expect([1, -1]).toContain(c.dir); }
    const covered = new Set<number>();
    for (const c of pal.cycles) for (let k = 0; k < c.length; k++) { expect(covered.has(c.start + k)).toBe(false); covered.add(c.start + k); }
  });
  it('16 色带 × 8 阶：索引 16..143，每带亮度随阶单调递增，带间色相不同', () => {
    expect(RAMP_COUNT * RAMP_STEPS).toBe(128);
    expect(ci(Ramp.Neutral, 0)).toBe(16); expect(ci(Ramp.Olive, 7)).toBe(143);
    for (let r = 0; r < RAMP_COUNT; r++) {
      let prev = -1;
      for (let i = 0; i < RAMP_STEPS; i++) { const [R, G, B] = rgb(ci(r as Ramp, i)); const l = luma(R, G, B); expect(l).toBeGreaterThan(prev); prev = l; }
      expect(rgb(ci(r as Ramp, 4)).slice(0, 3)).toEqual(rampRgb(r as Ramp, 4));
    }
    // 常用阶两两不同（排除灰阶重叠）
    const mids = new Set([Ramp.Grass, Ramp.Water, Ramp.Brick, Ramp.Rust, Ramp.Amber, Ramp.Signal, Ramp.Teal, Ramp.Violet, Ramp.Forest].map((r) => rgb(ci(r, 4)).slice(0, 3).join(',')));
    expect(mids.size).toBe(9);
    expect(ci(Ramp.Grass, -5)).toBe(ci(Ramp.Grass, 0)); expect(ci(Ramp.Grass, 99)).toBe(ci(Ramp.Grass, 7));
  });
  it('火焰 144..151 偏红橙且渐亮；烟 152..159 为灰阶；杂色立方 192..255', () => {
    for (let k = 0; k < 8; k++) { const [R, G, B] = rgb(IDX.FireBase + k); expect(R).toBeGreaterThan(B); if (k) expect(luma(R, G, B)).toBeGreaterThan(luma(...(rgb(IDX.FireBase + k - 1).slice(0, 3) as [number, number, number]))); }
    for (let k = 0; k < 8; k++) { const [R, G, B] = rgb(IDX.SmokeBase + k); expect(Math.abs(R - G)).toBeLessThanOrEqual(4); expect(Math.abs(G - B)).toBeLessThanOrEqual(6); }
    expect(misc(0, 0, 0)).toBe(192); expect(misc(3, 3, 3)).toBe(255);
    expect(rgb(misc(3, 0, 0))[0]).toBeGreaterThan(rgb(misc(0, 0, 0))[0]);
  });
  it('确定性：两次构建逐字节相同', () => {
    expect(Array.from(buildPalette().rgba)).toEqual(Array.from(pal.rgba));
  });
});
