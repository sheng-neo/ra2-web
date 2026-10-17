// WP10 验收：minimap —— 15 种模式输出 128²×4、非全零、alpha 255；各模式的关键着色规则。
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import { MAP_LAYER_MODES } from '../../contracts/render';
import { MINIMAP_BYTES, MINIMAP_COLORS, MINIMAP_SIZE, coverageField, minimapRgba, renderMinimap } from './minimap';
import { denseState, flatState, placeLot } from './testFixtures';

const px = (out: Uint8ClampedArray, x: number, y: number): [number, number, number, number] => { const o = (y * 128 + x) * 4; return [out[o]!, out[o + 1]!, out[o + 2]!, out[o + 3]!]; };
const rgb = (c: readonly [number, number, number]): [number, number, number] => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

describe('minimap: 15 种图层', () => {
  it('每种模式：尺寸 128²、全部 alpha 255、非全零、两次调用一致', () => {
    const s = denseState();
    expect(MAP_LAYER_MODES).toHaveLength(15);
    expect(MINIMAP_SIZE).toBe(128);
    for (const mode of MAP_LAYER_MODES) {
      const out = minimapRgba(s, mode);
      expect(out.length).toBe(MINIMAP_BYTES);
      let nonZero = 0, opaque = 0;
      for (let i = 0; i < out.length; i += 4) { if (out[i + 3] === 255) opaque++; if (out[i]! + out[i + 1]! + out[i + 2]! > 0) nonZero++; }
      expect(opaque).toBe(MINIMAP_SIZE * MINIMAP_SIZE);
      expect(nonZero).toBeGreaterThan(0);
      const again = new Uint8ClampedArray(MINIMAP_BYTES);
      renderMinimap(s, mode, again);
      expect(again).toEqual(out);
    }
  });
  it('structures：水蓝 / 陆地按海拔 / 树 / R C I / 电厂 / 路网', () => {
    const s = denseState();
    const out = minimapRgba(s, 'structures');
    expect(px(out, 102, 102).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.water[2]!));
    expect(px(out, 75, 75).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.tree));
    expect(px(out, 11, 11).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.zoneR[1]!));
    expect(px(out, 21, 12).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.zoneC[1]!));
    expect(px(out, 27, 13).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.zoneI[1]!));
    expect(px(out, 41, 41).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.powerPlant));
    expect(px(out, 50, 40).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.civic));
    expect(px(out, 10, 22).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.network));
    expect(px(out, 2, 2).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.land[0]!));
    expect(px(out, 124, 124).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.land[1]!));
  });
  it('zones：九种分区码各自着色，无分区为暗底', () => {
    const s = flatState();
    for (let z = 1; z <= 9; z++) s.layers.xzon[tileIndex(z, 1)] = z;
    const out = minimapRgba(s, 'zones');
    const expected = [MINIMAP_COLORS.zoneR[0]!, MINIMAP_COLORS.zoneR[1]!, MINIMAP_COLORS.zoneC[0]!, MINIMAP_COLORS.zoneC[1]!, MINIMAP_COLORS.zoneI[0]!, MINIMAP_COLORS.zoneI[1]!, MINIMAP_COLORS.zoneMilitary, MINIMAP_COLORS.zoneAirport, MINIMAP_COLORS.zoneSeaport];
    for (let z = 1; z <= 9; z++) expect(px(out, z, 1).slice(0, 3)).toEqual(rgb(expected[z - 1]!));
    const dimLand = px(out, 50, 50);
    expect(dimLand[0]! + dimLand[1]! + dimLand[2]!).toBeLessThan(MINIMAP_COLORS.land[0]![0] + MINIMAP_COLORS.land[0]![1] + MINIMAP_COLORS.land[0]![2]);
  });
  it('transport：道路灰 / 铁路褐 / 高速橙；power：供电黄 / 断电红 / 电线；water：有水蓝 / 缺水红 / 管线', () => {
    const s = flatState();
    s.layers.xbld[tileIndex(1, 1)] = 0x1d; s.layers.xbld[tileIndex(2, 2)] = 0x2c; s.layers.xbld[tileIndex(3, 3)] = 0x49; s.layers.xbld[tileIndex(4, 4)] = 0x0e;
    placeLot(s, 0x70, 10, 10, XBit.Powerable | XBit.Powered | XBit.Piped | XBit.Watered);
    placeLot(s, 0x71, 12, 12, XBit.Powerable | XBit.Piped);
    s.layers.xund[tileIndex(20, 20)] = 0x10;
    const tr = minimapRgba(s, 'transport'), pw = minimapRgba(s, 'power'), wt = minimapRgba(s, 'water');
    expect(px(tr, 1, 1).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.road)); expect(px(tr, 2, 2).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.rail)); expect(px(tr, 3, 3).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.highway));
    expect(px(pw, 10, 10).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.powered)); expect(px(pw, 12, 12).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.unpowered)); expect(px(pw, 4, 4).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.powerLine));
    expect(px(wt, 10, 10).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.watered)); expect(px(wt, 12, 12).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.unwatered)); expect(px(wt, 20, 20).slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.pipe));
  });
  it('热力层 16 阶：值越大越接近色相；growth 上绿下红中性灰；health / education 覆盖场随距离衰减', () => {
    const s = flatState();
    s.maps.xplt[(10 >> 1) * 64 + (10 >> 1)] = 255; s.maps.xplt[(20 >> 1) * 64 + (20 >> 1)] = 64;
    s.maps.xrog[(10 >> 2) * 32 + (10 >> 2)] = 0xf0; s.maps.xrog[(20 >> 2) * 32 + (20 >> 2)] = 0x10; s.maps.xrog[(30 >> 2) * 32 + (30 >> 2)] = 0x7f;
    const pol = minimapRgba(s, 'pollution');
    const hot = px(pol, 10, 10), warm = px(pol, 20, 20), cold = px(pol, 40, 40);
    expect(hot.slice(0, 3)).toEqual(rgb(MINIMAP_COLORS.heat.pollution));
    const dist = (a: number[], b: readonly number[]): number => Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!);
    expect(dist(warm, MINIMAP_COLORS.heat.pollution)).toBeLessThan(dist(cold, MINIMAP_COLORS.heat.pollution));
    const gr = minimapRgba(s, 'growth');
    expect(px(gr, 10, 10)[1]).toBeGreaterThan(px(gr, 10, 10)[0]!);
    expect(px(gr, 20, 20)[0]).toBeGreaterThan(px(gr, 20, 20)[1]!);
    const neutral = px(gr, 30, 30); expect(Math.abs(neutral[0]! - neutral[1]!)).toBeLessThan(40);
    placeLot(s, 0xd1, 60, 60, XBit.Powerable | XBit.Powered);
    const field = coverageField(s, new Set([0xd1]), 12);
    expect(field[tileIndex(61, 61)]).toBe(255);
    expect(field[tileIndex(66, 61)]).toBeGreaterThan(0);
    expect(field[tileIndex(66, 61)]).toBeLessThan(255);
    expect(field[tileIndex(90, 90)]).toBe(0);
    const he = minimapRgba(s, 'health');
    expect(dist([...px(he, 61, 61)], MINIMAP_COLORS.heat.health)).toBeLessThan(dist([...px(he, 90, 90)], MINIMAP_COLORS.heat.health));
    const ed = minimapRgba(s, 'education');
    expect(px(ed, 61, 61)).toEqual(px(ed, 90, 90));   // 医院不算教育
  });
});
