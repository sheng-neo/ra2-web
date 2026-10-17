// ===== art/buildings.test.ts =====（WORKPLAN WP9 验收：同 (zone, level) 候选 (ramp, silhouette) 两两不同；tier i0 单调；组间亮度差；画布尺寸 / 锚点）
import { describe, expect, it } from 'vitest';
import { FOOTPRINT } from '../contracts/footprint';
import { BUILDINGS } from '../data/buildings.generated';
import { BUILDING_RECIPES, RECIPE_IDS, genBuilding, recipeSignature } from './buildings';
import { OBJECT_CANVAS_H_L } from './iso';
import { Ramp, luma, rampRgb } from './palette';
import { SCALES, bitmapHash, isBlank } from './raster';

const TRANSITION = new Set([0x88, 0x89, 0x8a, 0x8b, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xad, 0xc2, 0xc3, 0xc4, 0xc5]);

describe('art: 建筑配方表', () => {
  it('覆盖 0x70–0xFF 全部非施工 / 废弃 ID；size 与 FOOTPRINT 一致；zone 字段与 catalogue 一致', () => {
    for (let id = 0x70; id <= 0xff; id++) {
      if (TRANSITION.has(id)) { expect(BUILDING_RECIPES.has(id)).toBe(false); continue; }
      const r = BUILDING_RECIPES.get(id);
      expect(r, `0x${id.toString(16)} 缺配方`).toBeDefined();
      expect(r!.size).toBe(FOOTPRINT[id]);
      const b = BUILDINGS[id]!;
      if (b.zone) { expect(r!.zone).toEqual({ type: b.zone.type, tier: b.zone.tier, level: b.zone.level }); } else expect(r!.zone).toBeUndefined();
      expect(r!.i0).toBeGreaterThanOrEqual(2); expect(r!.i0).toBeLessThanOrEqual(7);
    }
    expect(RECIPE_IDS.length).toBe(0x90 - TRANSITION.size);
  });
  it('同 (zone, level) 的候选 ID 两两 (ramp, silhouette) 不同', () => {
    const groups = new Map<string, Array<{ id: number; sig: string }>>();
    for (const r of BUILDING_RECIPES.values()) if (r.zone) { const k = `${r.zone.type}${r.zone.level}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push({ id: r.id, sig: recipeSignature(r) }); }
    expect(groups.size).toBe(12);
    for (const [k, list] of groups) {
      const sigs = list.map((x) => x.sig);
      expect(new Set(sigs).size, `${k}: ${list.map((x) => `0x${x.id.toString(16)}=${x.sig}`).join(' ')}`).toBe(sigs.length);
    }
  });
  it('tier 0/1/2 的 i0 单调递增（i0 = 3 + tier），组间平均亮度差 ≥ 0.04', () => {
    for (const type of ['R', 'C', 'I'] as const) {
      const byTier: number[][] = [[], [], []];
      for (const r of BUILDING_RECIPES.values()) if (r.zone?.type === type) { expect(r.i0).toBe(3 + r.zone.tier); byTier[r.zone.tier]!.push(luma(...rampRgb(r.ramp, r.i0))); }
      const mean = byTier.map((a) => a.reduce((s, x) => s + x, 0) / a.length);
      expect(mean[1]! - mean[0]!).toBeGreaterThanOrEqual(0.04);
      expect(mean[2]! - mean[1]!).toBeGreaterThanOrEqual(0.04);
      // 每个 tier 的最小 i0 大于前一 tier 的最大 i0
      const i0s = [0, 1, 2].map((t) => [...BUILDING_RECIPES.values()].filter((r) => r.zone?.type === type && r.zone.tier === t).map((r) => r.i0));
      expect(Math.min(...i0s[1]!)).toBeGreaterThan(Math.max(...i0s[0]!));
      expect(Math.min(...i0s[2]!)).toBeGreaterThan(Math.max(...i0s[1]!));
    }
  });
  it('ramp 取值合法', () => {
    for (const r of BUILDING_RECIPES.values()) { expect(r.ramp).toBeGreaterThanOrEqual(Ramp.Neutral); expect(r.ramp).toBeLessThanOrEqual(Ramp.Olive); }
  });
});

describe('art: genBuilding 画布与锚点（spec:ui-art §3.2.3）', () => {
  it.each(['S', 'M', 'L'] as const)('%s 档：宽 = N·W，高 = 表值 × k，锚点 = (W/2, H)，非空且像素索引合法', (scale) => {
    const sp = SCALES[scale];
    for (let id = 0x70; id <= 0xff; id++) {
      if (TRANSITION.has(id)) continue;
      const n = FOOTPRINT[id]! as 1 | 2 | 3 | 4;
      const b = genBuilding(id, sp);
      expect([b.w, b.h], `0x${id.toString(16)}`).toEqual([n * sp.W, Math.round(OBJECT_CANVAS_H_L[n] * sp.k)]);
      expect([b.anchorX, b.anchorY]).toEqual([b.w >> 1, b.h]);
      expect(b.data.length).toBe(b.w * b.h);
      expect(isBlank(b)).toBe(false);
      // 结构不越出画布顶部：最上一行应为透明（高度上限留白）
      let topUsed = false; for (let x = 0; x < b.w; x++) if (b.data[x]) topUsed = true;
      expect(topUsed, `0x${id.toString(16)} 顶行被占用`).toBe(false);
    }
  });
  it('确定性：同 id 两次生成哈希相同；不同 id 的位图不同', () => {
    const sp = SCALES.M;
    expect(bitmapHash(genBuilding(0x70, sp))).toBe(bitmapHash(genBuilding(0x70, sp)));
    const hashes = new Set<number>();
    for (let id = 0x70; id <= 0x7b; id++) hashes.add(bitmapHash(genBuilding(id, sp)));
    expect(hashes.size).toBe(12);
  });
});
