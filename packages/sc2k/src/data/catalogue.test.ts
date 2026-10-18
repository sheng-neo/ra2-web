// ===== data/catalogue.test.ts =====
// spec:building-catalogue §3.2 全部不变量 + 造价表与 spec:economy-budget §2.9 逐项一致 + size 列与 FOOTPRINT 一致
// + ARCHITECTURE §7.6 的 54 个 v1 工具 id + zh/en 键集合相同 + 每个 BuildingDef.name / ToolDef.label 在 strings 中有键。
import { describe, expect, it } from 'vitest';
import type { BuildingDef, ToolId } from '../contracts/catalogue';
import type { ModalId, RejectReason } from '../contracts/commands';
import { FOOTPRINT, FOOTPRINT_RANGES } from '../contracts/footprint';
import { UiIconId } from '../contracts/render';
import { OrdinanceId } from '../contracts/state';
import { BUILDINGS, CATALOGUE, CATEGORY, ORDINANCES, STRINGS_EN, STRINGS_ZH, TECH_BASE_YEAR, TOOLS, createStrings, isTerminal, isZoneBuilding } from './index';

const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
const idsOfSize = (s: number): number[] => BUILDINGS.filter((b) => b.size === s).map((b) => b.id);
const hex = (id: number): string => `0x${id.toString(16).toUpperCase().padStart(2, '0')}`;

describe('BUILDINGS 基本不变量（spec §3.2）', () => {
  it('恰好 256 条、按 id 升序、key 唯一、name 为 bld.0xNN', () => {
    expect(BUILDINGS.length).toBe(256);
    expect(BUILDINGS.every((b, i) => b.id === i)).toBe(true);
    expect(new Set(BUILDINGS.map((b) => b.key)).size).toBe(256);
    for (const b of BUILDINGS) expect(b.name).toBe(`bld.${hex(b.id)}`);
    expect(CATEGORY.length).toBe(256);
    expect(CATALOGUE.CATEGORY[0xd2]).toBe('civic');
  });

  it('CATALOGUE.FOOTPRINT 就是 contracts 的 FOOTPRINT，size 列与之逐项一致', () => {
    expect(CATALOGUE.FOOTPRINT).toBe(FOOTPRINT);
    for (const b of BUILDINGS) expect(b.size, hex(b.id)).toBe(FOOTPRINT[b.id]);
  });

  it('2x2 / 3x3 / 4x4 集合与 spec §3.2 完全一致', () => {
    const two = [...range(0x61, 0x6b), ...range(0x8c, 0xad), 0xeb, 0xec, 0xed, 0xee, 0xef, 0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7];
    const three = [...range(0xae, 0xc5), ...range(0xd0, 0xd6), 0xf8, 0xf9, 0xfa];
    const four = [...range(0xc9, 0xcf), 0xd7, 0xd8, 0xd9, 0xda, ...range(0xfb, 0xff)];
    expect(idsOfSize(2)).toEqual(two);
    expect(idsOfSize(3)).toEqual(three);
    expect(idsOfSize(4)).toEqual(four);
    expect(idsOfSize(1).length).toBe(256 - two.length - three.length - four.length);
    // 与 contracts 的区间定义同源
    const fromRanges = (s: 2 | 3 | 4): number[] => FOOTPRINT_RANGES[s].flatMap(([lo, hi]) => range(lo, hi));
    expect(fromRanges(2)).toEqual(two); expect(fromRanges(3)).toEqual(three); expect(fromRanges(4)).toEqual(four);
    expect(FOOTPRINT[0x49]).toBe(1); expect(FOOTPRINT[0x4a]).toBe(1);        // 高速直线段按 1x1 计
  });

  it('每个 placeable 建筑都有 tool，且该工具的 buildingIds 含此 id；tool 字段总是指向真实工具', () => {
    for (const b of BUILDINGS) {
      if (b.tool !== undefined) {
        const t = CATALOGUE.toolById(b.tool);
        expect(t, `${hex(b.id)} tool=${b.tool}`).toBeDefined();
        expect(t!.buildingIds ?? []).toContain(b.id);
      }
      if (b.placeable) expect(b.tool, `${hex(b.id)} 可放置但无 tool`).toBeDefined();
    }
  });

  it('电 / 水消费口径：id >= 0x70 皆耗电；不耗水 == 四种水设施 ∪ id < 0x70；不受电的建筑格 == {0xD5, 0xDB}', () => {
    for (const b of BUILDINGS) {
      expect(b.consumesPower, hex(b.id)).toBe(b.id >= 0x70);
      const noWater = b.id < 0x70 || [0xdc, 0xeb, 0xf4, 0xfa].includes(b.id);
      expect(b.consumesWater, hex(b.id)).toBe(!noWater);
    }
    const unpowerable = BUILDINGS.filter((b) => b.id >= 0x70 && !b.powerable).map((b) => b.id);
    expect(unpowerable).toEqual([0xd5, 0xdb]);
    expect(BUILDINGS.filter((b) => b.id >= 0x70 && !b.piped)).toEqual([]);  // 雕像 / 大公园仍 PIPED
    expect(BUILDINGS[0x0d]!.piped).toBe(true);                               // 小公园导水
    expect(BUILDINGS.filter((b) => b.id < 0x70 && b.id !== 0x0d && b.piped)).toEqual([]);
  });

  it('分区建筑：zone 字段、level == popWeight、tier 0..2、category 与类型一致；过渡态 ID 段正确', () => {
    const zoned = BUILDINGS.filter((b) => b.zone);
    expect(zoned.map((b) => b.id)).toEqual([...range(0x70, 0x87), ...range(0x8c, 0xa5), ...range(0xae, 0xc1)]);
    for (const b of zoned) {
      const z = b.zone!;
      expect(z.level, hex(b.id)).toBe(b.popWeight);
      expect([0, 1, 2]).toContain(z.tier);
      expect(z.weight).toBeGreaterThan(0);
      expect(b.category).toBe(`zone${z.type}`);
      expect(z.type === 'R' ? b.residents : b.jobs, hex(b.id)).toBeGreaterThan(0);
      expect(z.type === 'R' ? b.jobs : b.residents).toBe(0);
      expect(isZoneBuilding(b.id)).toBe(true);
    }
    const construction = BUILDINGS.filter((b) => b.transition === 'construction').map((b) => b.id);
    const abandoned = BUILDINGS.filter((b) => b.transition === 'abandoned').map((b) => b.id);
    expect(construction).toEqual([0x88, 0x89, 0xa6, 0xa7, 0xa8, 0xa9, 0xc2, 0xc3]);
    expect(abandoned).toEqual([0x8a, 0x8b, 0xaa, 0xab, 0xac, 0xad, 0xc4, 0xc5]);
    for (const id of abandoned) expect(BUILDINGS[id]!.popWeight).toBe(0);
    expect(BUILDINGS.filter((b) => b.id >= 0x70 && b.id <= 0xc5 && !b.zone && !b.transition)).toEqual([]);
    expect(isZoneBuilding(0x88)).toBe(false);
    expect(isTerminal(0xfb)).toBe(true); expect(isTerminal(0xff)).toBe(true); expect(isTerminal(0xfa)).toBe(false);
  });

  it('人口权重：0x70–0x89 为 1、2x2 低 / 高档 2 / 3、3x3 为 4、≥0xC6 为 2（拱城 12）、地表覆盖 0（services §2.3.5）', () => {
    for (const id of range(0x70, 0x89)) expect(BUILDINGS[id]!.popWeight, hex(id)).toBe(1);
    for (const id of [...range(0x8c, 0x8f), ...range(0x94, 0x98), ...range(0x9e, 0xa1), 0xa6, 0xa7]) expect(BUILDINGS[id]!.popWeight, hex(id)).toBe(2);
    for (const id of [...range(0x90, 0x93), ...range(0x99, 0x9d), ...range(0xa2, 0xa5), 0xa8, 0xa9]) expect(BUILDINGS[id]!.popWeight, hex(id)).toBe(3);
    for (const id of range(0xae, 0xc3)) expect(BUILDINGS[id]!.popWeight, hex(id)).toBe(4);
    for (const id of range(0xc6, 0xff)) expect(BUILDINGS[id]!.popWeight, hex(id)).toBe(id >= 0xfb && id <= 0xfe ? 12 : 2);
    for (const id of range(0x00, 0x6f)) expect(BUILDINGS[id]!.popWeight, hex(id)).toBe(0);
  });

  it('污染源表与 services §2.3.1 一致（非零项）', () => {
    const expected = new Map<number, number>();
    const set = (ids: number[], v: number): void => { for (const id of ids) expected.set(id, v); };
    set(range(0x84, 0x87), 6); set(range(0x9e, 0xa1), 12); set(range(0xa2, 0xa5), 18); set(range(0xbc, 0xc1), 24);
    set([0xc9], 10); set([0xca], 25); set([0xcb], 2); set([0xce], 2); set([0xcf], 50); set([0xd7], 4); set([0xd8], 10); set([0xdc], 2);
    set([0xdd, 0xde, 0xdf], 10); set([0xe0, 0xe3, 0xe4, 0xe5], 5); set([0xe6, 0xe7], 10); set([0xe9], 5); set([0xec], 3); set([0xed], 4);
    set([0xee, 0xef, 0xf0, 0xf1], 2); set([0xf2, 0xf4], 10); set([0xf6], 5); set([0xfb], 25); set([0xfc], 10); set([0xfd], 12); set([0xfe], 15); set([0x05], 200);
    for (const b of BUILDINGS) expect(b.pollutionPerTile, hex(b.id)).toBe(expected.get(b.id) ?? 0);
  });

  it('朝向、NIMBY、覆盖、微模拟、产量等派生字段抽查', () => {
    const b = (id: number): BuildingDef => BUILDINGS[id]!;
    expect(BUILDINGS.filter((x) => x.nimby).map((x) => x.id).sort((p, q) => p - q)).toEqual([0xc9, 0xca, 0xcb, 0xcf, 0xd8, 0xf4]);
    expect(b(0xd2).coverage).toEqual({ layer: 'XPLC', strengthAt100: 250 });
    expect(b(0xd3).coverage).toEqual({ layer: 'XFIR', strengthAt100: 250 });
    expect(BUILDINGS.filter((x) => x.coverage).length).toBe(2);
    for (const id of range(0x0e, 0x4a)) expect(b(id).orient, hex(id)).toBe('byId');
    for (const id of [...range(0x51, 0x5c), 0x6a, 0x6b, 0xdd, 0xdf, 0xe0]) expect(b(id).orient, hex(id)).toBe('flipBit');
    for (const id of range(0x5d, 0x60)) expect(b(id).orient).toBe('byIdAndFlip');
    expect(b(0x69).orient).toBe('none'); expect(b(0xc6).orient).toBe('byId'); expect(b(0xc7).orient).toBe('byId');
    for (const id of range(0x70, 0xff)) if (id !== 0xc6 && id !== 0xc7 && id !== 0xdd && id !== 0xdf && id !== 0xe0) expect(b(id).orient, hex(id)).toBe('none');
    expect(b(0xcf).powerOutput).toEqual({ kind: 'fixed', tiles: 704 });
    expect(b(0xcb).powerOutput).toEqual({ kind: 'fixed', tiles: 1776 });
    expect(b(0xce).powerOutput).toEqual({ kind: 'fixed', tiles: 8880 });
    expect(b(0xc8).powerOutput).toEqual({ kind: 'wind' }); expect(b(0xcc).powerOutput).toEqual({ kind: 'solar' }); expect(b(0xc6).powerOutput).toEqual({ kind: 'hydro' });
    expect(b(0xeb).waterOutput).toEqual({ kind: 'tower', unitsPerCell: 100 });
    expect(b(0xf4).waterOutput).toEqual({ kind: 'treatment', tilesPerPlant: 2000 });
    expect(b(0xdc).waterOutput).toEqual({ kind: 'pump' }); expect(b(0xfa).waterOutput).toEqual({ kind: 'desal' });
    for (const id of range(0xc9, 0xcf)) expect(b(id).lifetimeYears).toBe(50);
    for (const id of [0xc6, 0xc7, 0xc8]) expect(b(id).lifetimeYears).toBeUndefined();
    expect(b(0xc8).microsim).toEqual({ type: 20, shared: false }); expect(b(0xc6).microsim).toEqual({ type: 21, shared: false });
    expect(b(0xd5).microsim).toEqual({ type: 22, shared: true }); expect(b(0xf5).microsim).toEqual({ type: 24, shared: true });
    expect(b(0xfb).residents).toBe(55000); expect(b(0xfe).residents).toBe(65000);
    expect(b(0xf8).placement).toEqual({ terrain: 'any', waterCellsInFootprint: [1, 8] });
    expect(b(0xc6).placement?.terrain).toBe('waterfall'); expect(b(0xc7).placement?.terrain).toBe('waterfall');
    expect(b(0xec).placement?.needsAdjacent).toBe('road'); expect(b(0xed).placement?.needsAdjacent).toBe('rail'); expect(b(0x6c).placement?.needsAdjacent).toBe('rail');
    expect(b(0xf7).placeable).toBe(false); expect(b(0xf7).residents).toBe(0);
    expect(b(0xf3).unlock).toEqual({ rewardBit: 0, popOver: 2000, once: true });
    expect(b(0xd0).unlock).toEqual({ rewardBit: 1, popOver: 10000, once: true });
    expect(b(0xdb).unlock).toEqual({ rewardBit: 2, popOver: 30000, once: true });
    expect(b(0xff).unlock).toEqual({ rewardBit: 3, popOver: 90000, once: true });
    for (const id of range(0xfb, 0xfe)) expect(b(id).unlock).toEqual({ rewardBit: 4, popOver: 120000, once: false });
    expect(b(0xcb).tech).toBe('nuclear'); expect(b(0xe9).tech).toBe('subways'); expect(b(0x49).tech).toBe('highways'); expect(b(0xfd).tech).toBe('arcoDusk');
    expect(b(0xd2).upkeepPerYear).toBe(100); expect(b(0xd3).upkeepPerYear).toBe(100); expect(b(0xd1).upkeepPerYear).toBe(50);
    expect(b(0xd6).upkeepPerYear).toBe(25); expect(b(0xd9).upkeepPerYear).toBe(100); expect(b(0xd8).upkeepPerYear).toBe(100);
    expect(b(0xd2).budgetLine).toBe('police'); expect(b(0xd8).budgetLine).toBe('police'); expect(b(0xd6).budgetLine).toBe('schools'); expect(b(0xd9).budgetLine).toBe('colleges');
    expect(b(0xec).budgetLine).toBe('busFixed'); expect(b(0xec).upkeepPerYear).toBe(25);
    expect(b(0x1d).upkeepPerYear).toBeCloseTo(0.1); expect(b(0x2c).upkeepPerYear).toBeCloseTo(0.4); expect(b(0x3f).upkeepPerYear).toBeCloseTo(0.2);
    expect(b(0x49).upkeepPerYear).toBeCloseTo(0.8); expect(b(0x57).upkeepPerYear).toBeCloseTo(0.25); expect(b(0x6a).upkeepPerYear).toBeCloseTo(1.8);
  });
});

describe('造价表与 spec:economy-budget §2.9 逐项一致', () => {
  const TOOL_COST: Record<ToolId, number> = {
    'bulldozer.demolish': 1, 'bulldozer.level': 25, 'bulldozer.raise': 25, 'bulldozer.lower': 25, 'bulldozer.dezone': 1,
    'nature.trees': 3, 'nature.water': 100,
    'dispatch.police': 0, 'dispatch.fire': 0, 'dispatch.military': 0,
    'roads.road': 10, 'roads.highway': 100, 'roads.onramp': 25, 'roads.tunnel': 150, 'roads.busDepot': 250,
    'rail.rail': 25, 'rail.depot': 500, 'rail.subway': 100, 'rail.subStation': 250, 'rail.subToRail': 250,
    'ports.seaport': 150, 'ports.airport': 250,
    'power.wires': 2, 'power.coal': 4000, 'power.hydro': 400, 'power.oil': 6600, 'power.gas': 2000, 'power.nuclear': 15000, 'power.wind': 100, 'power.solar': 1300, 'power.microwave': 28000, 'power.fusion': 40000,
    'water.pipes': 3, 'water.pump': 100, 'water.tower': 250, 'water.treatment': 500, 'water.desalination': 1000,
    'zone.rLight': 5, 'zone.cLight': 5, 'zone.iLight': 5, 'zone.rDense': 10, 'zone.cDense': 10, 'zone.iDense': 10,
    'education.school': 250, 'education.college': 1000, 'education.library': 500, 'education.museum': 1000,
    'services.police': 500, 'services.fire': 500, 'services.hospital': 500, 'services.prison': 3000,
    'parks.small': 20, 'parks.big': 150, 'parks.zoo': 3000, 'parks.stadium': 5000, 'parks.marina': 1000,
    'rewards.mayorsHouse': 0, 'rewards.cityHall': 0, 'rewards.statue': 0, 'rewards.greatDome': 0,
    'rewards.arcoPioneer': 100000, 'rewards.arcoCanopy': 120000, 'rewards.arcoDusk': 150000, 'rewards.arcoSkyward': 200000,
    'signs.place': 0, 'query': 0, 'center': 0,
  };
  it('工具单价逐项一致，且工具表没有表外工具', () => {
    for (const t of TOOLS) expect(TOOL_COST[t.id], t.id).toBe(t.cost);
    expect(Object.keys(TOOL_COST).sort()).toEqual(TOOLS.map((t) => t.id).sort());
  });
  it('建筑造价逐项一致（含网络族与桥型单价）', () => {
    const BLD_COST = new Map<number, number>();
    const set = (ids: number[], v: number): void => { for (const id of ids) BLD_COST.set(id, v); };
    set(range(0x06, 0x0c), 3); set([0x0d], 20);
    set(range(0x0e, 0x1c), 2); set([0x5c], 10); set(range(0x1d, 0x2b), 10); set(range(0x3f, 0x42), 150); set(range(0x2c, 0x3a), 25);
    set([0x49, 0x4a], 100); set(range(0x5d, 0x60), 25);
    set([0x57, 0x58], 25); set([0x56], 50); set(range(0x51, 0x55), 75); set([0x5a, 0x5b], 75); set([0x6a, 0x6b], 200); set(range(0x6c, 0x6f), 250);
    set([0xcf], 4000); set([0xc6, 0xc7], 400); set([0xca], 6600); set([0xc9], 2000); set([0xcb], 15000); set([0xc8], 100); set([0xcc], 1300); set([0xcd], 28000); set([0xce], 40000);
    set([0xdc], 100); set([0xeb], 250); set([0xf4], 500); set([0xfa], 1000);
    set([0xd6], 250); set([0xd9], 1000); set([0xf5], 500); set([0xd4], 1000);
    set([0xd2], 500); set([0xd3], 500); set([0xd1], 500); set([0xd8], 3000);
    set([0xd5], 150); set([0xda], 3000); set([0xd7], 5000); set([0xf8], 1000);
    set([0xf3, 0xd0, 0xdb, 0xff], 0); set([0xfb], 100000); set([0xfc], 120000); set([0xfd], 150000); set([0xfe], 200000);
    set([0xec], 250); set([0xed], 500); set([0xe9], 250);
    for (const b of BUILDINGS) expect(b.cost, hex(b.id)).toBe(BLD_COST.get(b.id) ?? 0);
    // 不可放置者造价为 0
    for (const b of BUILDINGS) if (!b.placeable) expect(b.cost, hex(b.id)).toBe(0);
  });
});

describe('TOOLS', () => {
  const V1_TOOL_IDS: readonly ToolId[] = [
    'bulldozer.demolish', 'bulldozer.level', 'bulldozer.raise', 'bulldozer.lower', 'bulldozer.dezone',
    'nature.trees', 'nature.water',
    'dispatch.police', 'dispatch.fire',
    'power.wires', 'power.coal', 'power.hydro', 'power.oil', 'power.gas', 'power.nuclear', 'power.wind', 'power.solar', 'power.microwave', 'power.fusion',
    'water.pipes', 'water.pump', 'water.tower', 'water.treatment', 'water.desalination',
    'rewards.mayorsHouse', 'rewards.cityHall', 'rewards.statue', 'rewards.greatDome',
    'roads.road', 'roads.busDepot',
    'rail.rail', 'rail.depot',
    'zone.rLight', 'zone.rDense', 'zone.cLight', 'zone.cDense', 'zone.iLight', 'zone.iDense',
    'education.school', 'education.college', 'education.library', 'education.museum',
    'services.police', 'services.fire', 'services.hospital', 'services.prison',
    'parks.small', 'parks.big', 'parks.zoo', 'parks.stadium', 'parks.marina',
    'signs.place', 'query', 'center',
  ];
  it('UiIconId 子工具区段容纳全部工具：SubToolBase + TOOLS.length < 256（spriteKeyHash 的 8 位 id）', () => {
    expect(TOOLS.length).toBe(67);
    expect(UiIconId.SubToolBase + TOOLS.length).toBeLessThan(256);
  });
  it('ARCHITECTURE §7.6 的 54 个 v1 工具 id 全部存在且逐字一致', () => {
    expect(V1_TOOL_IDS.length).toBe(54);
    for (const id of V1_TOOL_IDS) expect(CATALOGUE.toolById(id)?.id, id).toBe(id);
  });
  it('id 唯一、label 为 tool.<id>、cursor 与 buildingIds 尺寸一致、分区工具带 zoneCode、科技 / 解锁门控齐全', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    expect(TOOLS.length).toBe(67);
    for (const t of TOOLS) {
      expect(t.label).toBe(`tool.${t.id}`);
      if (t.placeMode === 'point' && typeof t.cursor === 'number' && t.buildingIds && t.costUnit === 'building') {
        for (const id of t.buildingIds) expect(FOOTPRINT[id], `${t.id} ${hex(id)}`).toBe(t.cursor);
      }
      if (t.id.startsWith('zone.') || t.id.startsWith('ports.')) expect(t.zoneCode).toBeGreaterThan(0); else expect(t.zoneCode).toBeUndefined();
      for (const id of t.buildingIds ?? []) expect(BUILDINGS[id], `${t.id} ${hex(id)}`).toBeDefined();
    }
    expect(CATALOGUE.toolById('water.pipes')?.undergroundView).toBe(true);
    expect(CATALOGUE.toolById('rail.subway')?.undergroundView).toBe(true);
    expect(CATALOGUE.toolById('power.nuclear')?.tech).toBe('nuclear');
    expect(CATALOGUE.toolById('ports.airport')?.tech).toBe('airport');
    expect(CATALOGUE.toolById('rewards.greatDome')?.unlock).toEqual({ rewardBit: 3, popOver: 90000, once: true });
    expect(CATALOGUE.toolById('dispatch.military')?.requires).toBe('militaryBase');
    expect(CATALOGUE.toolById('nope')).toBeUndefined();
    expect(CATALOGUE.buildingByKey('coalPlant')?.id).toBe(0xcf);
    expect(CATALOGUE.buildingByKey('nope')).toBeUndefined();
  });
});

describe('TECH_BASE_YEAR / ORDINANCES', () => {
  it('16 个科技键齐全；基准年与 spec:disasters §2.9 一致（机场按 catalogue §4.1 取 1927）', () => {
    expect(TECH_BASE_YEAR).toEqual({
      gas: 1950, nuclear: 1955, solar: 1990, wind: 1980, microwave: 2020, fusion: 2050, airport: 1927, highways: 1930, buses: 1920, subways: 1910,
      waterTreatment: 1935, desalinization: 1990, arcoPioneer: 2000, arcoCanopy: 2050, arcoDusk: 2100, arcoSkyward: 2150 });
    expect(CATALOGUE.TECH_BASE_YEAR).toBe(TECH_BASE_YEAR);
  });
  it('20 条法令：id == 下标 == OrdinanceId 位序，key 唯一，demand 与 zones §2.8.4 逐项一致', () => {
    expect(ORDINANCES.length).toBe(20);
    expect(ORDINANCES.every((o, i) => o.id === i)).toBe(true);
    expect(ORDINANCES[OrdinanceId.NuclearFreeZone]!.forbidNuclear).toBe(true);
    expect(ORDINANCES[OrdinanceId.NuclearFreeZone]!.money).toBeNull();
    expect(new Set(ORDINANCES.map((o) => o.key)).size).toBe(20);
    const demand: Record<number, Partial<Record<'r' | 'c' | 'i', number>>> = {
      [OrdinanceId.SalesTax]: { c: 0.99 }, [OrdinanceId.IncomeTax]: { r: 0.99 }, [OrdinanceId.HomelessShelter]: { c: 1.01 }, [OrdinanceId.PollutionControls]: { i: 0.99 },
      [OrdinanceId.TouristAdvertising]: { c: 1.01 }, [OrdinanceId.BusinessAdvertising]: { i: 1.01 }, [OrdinanceId.CityBeautification]: { r: 1.01 }, [OrdinanceId.AnnualCarnival]: { c: 1.01 } };
    for (const o of ORDINANCES) expect(o.demand, o.key).toEqual(demand[o.id] ?? {});
    expect(ORDINANCES.filter((o) => o.advertising).map((o) => o.id)).toEqual([OrdinanceId.TouristAdvertising, OrdinanceId.BusinessAdvertising]);
    for (const o of ORDINANCES) if (o.money) expect(o.money.pct.num / o.money.pct.den).toBeLessThanOrEqual(2);
  });
});

describe('strings', () => {
  // Record<X, 0> 让 TS 在成员增删时报错，保证下面的键列表与契约枚举同步。
  const REJECT: Record<RejectReason, 0> = { funds: 0, occupied: 0, slope: 0, water: 0, needWaterfall: 0, outOfBounds: 0, zoned: 0, notInvented: 0, locked: 0, alreadyBuilt: 0,
    ordinance: 0, adjacency: 0, nimby: 0, microsimFull: 0, waterCells: 0, terrain: 0, obstructed: 0, mode: 0, limit: 0, noTarget: 0, needsBridge: 0, tooHigh: 0, tooLow: 0, tooLong: 0, notImplemented: 0, cancelled: 0 };
  const MODALS: Record<ModalId, 0> = { budget: 0, militaryOffer: 0, disasterAlert: 0, scenarioBrief: 0, scenarioResult: 0, gameOver: 0, newspaper: 0, extraPaper: 0, rewardOffer: 0, bridgeType: 0, teamPick: 0, neighborConnect: 0, importAssets: 0 };

  it('zh / en 键集合相同，值非空', () => {
    const zh = Object.keys(STRINGS_ZH), en = Object.keys(STRINGS_EN);
    expect(en.sort()).toEqual(zh.sort());
    for (const k of zh) { expect(STRINGS_ZH[k as keyof typeof STRINGS_ZH].length).toBeGreaterThan(0); expect(STRINGS_EN[k as keyof typeof STRINGS_EN].length).toBeGreaterThan(0); }
  });
  it('每个 BuildingDef.name / ToolDef.label、全部 RejectReason / ModalId、法令、科技键都有文案', () => {
    const zh = createStrings('zh'), en = createStrings('en');
    for (const b of BUILDINGS) { expect(zh.has(b.name), b.name).toBe(true); expect(en.has(b.name), b.name).toBe(true); }
    for (const t of TOOLS) { expect(zh.has(t.label), t.label).toBe(true); expect(en.has(t.label), t.label).toBe(true); }
    for (const r of Object.keys(REJECT)) expect(zh.has(`reject.${r}`), r).toBe(true);
    for (const m of Object.keys(MODALS)) expect(zh.has(`modal.${m}`), m).toBe(true);
    for (const o of ORDINANCES) expect(zh.has(`ordinance.${o.key}`), o.key).toBe(true);
    for (const k of Object.keys(TECH_BASE_YEAR)) expect(zh.has(`tech.${k}`), k).toBe(true);
    for (const g of new Set(TOOLS.map((t) => t.group))) expect(zh.has(`group.${g}`), g).toBe(true);
    for (const c of new Set(CATEGORY)) expect(zh.has(`category.${c}`), c).toBe(true);
  });
  it('报纸骨架不超过 NewsType 总数（67）且 headline / body 成对', () => {
    // WP0 预置 ≤ 20 条；INT-B 按 contract-rfc（WP13）补齐月检 / 需求 / 全部灾害号外后为 37 条，上限改为 NEWS_TYPE_COUNT
    const heads = Object.keys(STRINGS_ZH).filter((k) => /^news\.\d+\.headline$/.test(k));
    expect(heads.length).toBeGreaterThan(0); expect(heads.length).toBeLessThanOrEqual(67);
    for (const h of heads) expect(Number(h.split('.')[1])).toBeLessThan(67);
    for (const h of heads) expect(STRINGS_ZH[h.replace('.headline', '.body') as keyof typeof STRINGS_ZH]).toBeDefined();
  });
  it('createStrings：占位替换、缺键回退键名、has()、lang', () => {
    const s = createStrings('en');
    expect(s.lang).toBe('en');
    expect(s.t('message.cityFounded', { city: 'Riverbend', year: 1950 })).toBe('Riverbend founded in 1950');
    expect(s.t('message.cityFounded', { city: 'Riverbend' })).toBe('Riverbend founded in {year}');
    expect(s.t('no.such.key')).toBe('no.such.key');
    expect(s.t('no.such.key', { x: 1 })).toBe('no.such.key');
    expect(s.has('tool.roads.road')).toBe(true); expect(s.has('toString')).toBe(false);
    expect(createStrings('zh').t('reject.funds')).toBe('资金不足');
  });
});
