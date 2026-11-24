import type { CityFile } from '@central/data';
import { describe, expect, it } from 'vitest';
import { REF_OSM } from '../sources/refs';
import { serializeCity } from './pack';

function city(): CityFile {
  return {
    format: 'central-city',
    version: 1,
    meta: {
      origin: { e: 834000, n: 816000, lon: 114.1548669, lat: 22.2828788 },
      crs: 'EPSG:2326',
      unit: 'dm',
      bbox: [0, 0, 10, 10],
      sources: [REF_OSM],
      build: { pipelineVersion: '0', inputsDigest: 'x' },
    },
    buildings: [
      {
        id: 'a',
        src: 'ovt',
        footprint: { outer: [0, 0, 1, 0, 1, 1] },
        base: 0,
        height: 10,
        heightSource: 'tag',
        kind: 'other',
        style: 1,
      },
    ],
    roads: [],
    rails: [],
    water: [],
    zones: { playable: [], sensitive: [] },
    props: { signals: [], crossings: [], busStops: [], streetLamps: [], trees: [] },
    landmarks: [],
  };
}

describe('serializeCity', () => {
  it('键序由 schema 决定，与对象构造顺序无关', () => {
    const a = city();
    const b = city();
    const bld = b.buildings[0]!;
    b.buildings[0] = {
      style: bld.style, kind: bld.kind, heightSource: bld.heightSource, height: bld.height,
      base: bld.base, footprint: bld.footprint, src: bld.src, id: bld.id,
    };
    expect(serializeCity(b)).toBe(serializeCity(a));
    expect(serializeCity(a)).toContain('{"id":"a","src":"ovt","footprint"');
  });

  it('非整数坐标、多余键、红线词都会让构建失败', () => {
    const c1 = city();
    c1.buildings[0]!.footprint.outer[0] = 0.5;
    expect(() => serializeCity(c1)).toThrow(/整数/);
    const hole = city();
    hole.buildings[0]!.footprint.holes = [[0, 0, 0.5, 0, 0, 1]];
    expect(() => serializeCity(hole)).toThrow(/整数/);
    const c2 = city();
    (c2.buildings[0] as unknown as Record<string, unknown>).name = 'x';
    expect(() => serializeCity(c2)).toThrow(/不该有键/);
    const c3 = city();
    c3.roads.push({ id: 'r', cls: 'primary', pts: [0, 0, 1, 1], oneway: 0, lanes: 2, name: { en: 'HSBC Lane' } });
    expect(() => serializeCity(c3)).toThrow(/红线/);
  });

  it('每个要素一行，以换行结尾', () => {
    const lines = serializeCity(city()).split('\n');
    expect(lines.filter((l) => l.startsWith('{"id":"a"'))).toHaveLength(1);
    expect(lines[lines.length - 1]).toBe('');
  });
});
