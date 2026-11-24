import { describe, expect, it } from 'vitest';
import type { OvtSegment } from '../sources/overture';
import { REF_OSM, REF_TOMTOM } from '../sources/refs';
import { buildRoads, onewayAt, roadName, segmentToRoads } from './roads';

const EXTENT = [-100000, -100000, 100000, 100000] as const;

/** 一条自西向东约 103 m 的直路。 */
function seg(partial: Partial<OvtSegment> = {}): OvtSegment {
  return {
    id: 's1',
    subtype: 'road',
    class: 'secondary',
    geometry: { type: 'LineString', coordinates: [[114.155, 22.28], [114.1555, 22.28], [114.156, 22.28]] },
    ...partial,
  };
}

describe('onewayAt（Overture access_restrictions 语义）', () => {
  it('禁止 backward → 只能沿几何方向（1）', () => {
    const s = seg({ access_restrictions: [{ access_type: 'denied', when: { heading: 'backward' } }] });
    expect(onewayAt(s, 0.5)).toBe(1);
  });

  it('对机动车禁止 forward → 只能逆几何方向（-1）', () => {
    const s = seg({
      access_restrictions: [
        { access_type: 'allowed', when: { heading: 'backward', mode: ['motor_vehicle'] } },
        { access_type: 'denied', when: { heading: 'forward', mode: ['motor_vehicle'] } },
        { access_type: 'allowed', when: { mode: ['bus'] } },
      ],
    });
    expect(onewayAt(s, 0.5)).toBe(-1);
  });

  it('只限行人、只限时段、只限车型尺寸的规则不影响私家车', () => {
    for (const when of [
      { heading: 'backward', mode: ['foot'] },
      { heading: 'backward', during: 'Mo-Fr 07:00-10:00' },
      { heading: 'backward', vehicle: [{ dimension: 'weight' }] },
    ]) {
      expect(onewayAt(seg({ access_restrictions: [{ access_type: 'denied', when }] }), 0.5)).toBe(0);
    }
  });

  it('between 只覆盖一部分时只在那部分生效', () => {
    const s = seg({ access_restrictions: [{ access_type: 'denied', when: { heading: 'backward' }, between: [0, 0.4] }] });
    expect(onewayAt(s, 0.2)).toBe(1);
    expect(onewayAt(s, 0.7)).toBe(0);
  });
});

describe('segmentToRoads', () => {
  it('整段属性一致时输出一条路，车道数按等级默认', () => {
    const roads = segmentToRoads(seg({ speed_limits: [{ max_speed: { value: 50, unit: 'km/h' } }] }), EXTENT);
    expect(roads).toHaveLength(1);
    expect(roads[0]).toMatchObject({ cls: 'secondary', oneway: 0, lanes: 2, speedKmh: 50 });
    expect(roads[0]!.pts.every(Number.isInteger)).toBe(true);
  });

  it('桥只覆盖后半段时在 0.5 处切开，两段首尾相接', () => {
    const roads = segmentToRoads(seg({ road_flags: [{ values: ['is_bridge'], between: [0.5, 1] }] }), EXTENT);
    expect(roads).toHaveLength(2);
    const [a, b] = roads;
    expect(a!.bridge).toBeUndefined();
    expect(b!.bridge).toBe(true);
    expect(a!.pts.slice(-2)).toEqual(b!.pts.slice(0, 2));
  });

  it('行人类道路车道数为 0，层级写入 level', () => {
    const [r] = segmentToRoads(seg({ class: 'footway', level_rules: [{ value: 1 }] }), EXTENT);
    expect(r).toMatchObject({ cls: 'footway', lanes: 0, level: 1 });
  });
});

describe('roadName', () => {
  it('优先 names.common，其次拆「中文 English」', () => {
    expect(roadName(seg({ names: { primary: 'x', common: { zh: '雪廠街', en: 'Ice House Street' } } }))).toEqual({
      zh: '雪廠街',
      en: 'Ice House Street',
    });
    expect(roadName(seg({ names: { primary: '德輔道中 Des Voeux Road Central' } }))).toEqual({
      zh: '德輔道中',
      en: 'Des Voeux Road Central',
    });
    expect(roadName(seg({ names: { primary: "Queen's Road Central" } }))).toEqual({ en: "Queen's Road Central" });
    expect(roadName(seg({ names: { primary: '己連拿利' } }))).toEqual({ zh: '己連拿利' });
  });

  it('以企业命名的路名整名丢弃（路本身保留）', () => {
    expect(roadName(seg({ names: { primary: '柏暉徑 Pacific Place Drive' } }))).toBeUndefined();
    expect(segmentToRoads(seg({ names: { primary: '合和食街 Hopewell Food Street' } }), EXTENT)).toHaveLength(1);
  });

  it('以楼宇命名的天桥、通道去名；带街道结尾的保留', () => {
    const foot = (primary: string) => roadName(seg({ class: 'footway', names: { primary } }));
    expect(foot('交易廣場行人天橋 Exchange Square Footbridge')).toBeUndefined();
    expect(foot('某某大廈行人天橋')).toBeUndefined();
    expect(foot('Harbour Centre Footbridge')).toBeUndefined();
    expect(foot('雪廠街 Ice House Street')).toEqual({ zh: '雪廠街', en: 'Ice House Street' });
    expect(foot('摩利臣街行人天橋 Morrison Street footbridge')).toEqual({
      zh: '摩利臣街行人天橋',
      en: 'Morrison Street footbridge',
    });
    // 楼宇标志词只对行人类生效；车行路上的街道名不受影响
    expect(roadName(seg({ names: { primary: 'Centre Street' } }))).toEqual({ en: 'Centre Street' });
  });
});

describe('buildRoads', () => {
  it('只列确有路段进入产物的数据集；未登记的来源报错', () => {
    const tomtom = seg({ id: 't1', sources: [{ dataset: 'TomTom', license: 'ODbL-1.0' }] });
    const osm = seg({ id: 'o1', sources: [{ dataset: 'OpenStreetMap', license: 'ODbL-1.0' }] });
    expect(buildRoads([osm], EXTENT).refs.map((r) => r.id)).toEqual([REF_OSM.id]);
    expect(buildRoads([osm, tomtom], EXTENT).refs.map((r) => r.id)).toEqual([REF_OSM.id, REF_TOMTOM.id].sort());
    // 范围外的 TomTom 路段不进产物，也不列署名
    expect(buildRoads([osm, tomtom], [0, 0, 1, 1]).refs).toEqual([]);
    expect(() => buildRoads([seg({ sources: [{ dataset: 'Acme', license: 'ODbL-1.0' }] })], EXTENT)).toThrow(/未登记/);
  });
});
