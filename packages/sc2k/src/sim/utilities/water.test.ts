// ===== sim/utilities/water.test.ts =====（spec:power-water §2.8 / §2.9 / §3.8 T7：供水两遍 BFS、水源顺序、交叉口、水塔、净水厂、淡化、幽灵水泵）
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, runDays } from '../../testkit';
import { bulldoze, fakePlacementSystem, line, paintLot, paintWater, paintXund, place } from './fixtures';
import { createUtilitiesSystem } from './index';
import { createScratch, runWaterScan } from './scan';
import type { WaterScanInput } from './scan';
import { DEFAULT_UTILITIES_TUNING } from './tuning';

const PROFILES = ['optimistic', 'pessimistic'] as const;
const mk = (profile: StubProfile = 'realistic') => createTestContext({ profile, systems: [createUtilitiesSystem(), fakePlacementSystem()] });
const HOUSE = 0x70, COAL = 0xcf, PUMP = 0xdc, TOWER = 0xeb, TREATMENT = 0xf4, DESAL = 0xfa;
const watered = (xbit: Uint8Array, x: number, y: number): boolean => (xbit[tileIndex(x, y)]! & XBit.Watered) !== 0;
const scanInput = (state: ReturnType<typeof mk>['state'], over: Partial<WaterScanInput> = {}): WaterScanInput => ({
  xbld: state.layers.xbld, xbit: state.layers.xbit, treatmentCells: state.counts.tile[TREATMENT]!, humid: state.weather.humid, waterLevel: state.terrain.seaLevel,
  tune: DEFAULT_UTILITIES_TUNING, scratch: createScratch(), ...over,
});
/** 煤电 (10,10) + 电线到 (20,19)；湿度 14、水位 4 → 水泵基值 27。水泵由调用方放在 (20,20)。 */
function poweredTown(profile: StubProfile) {
  const t = mk(profile);
  t.state.weather.humid = 14; t.state.terrain.seaLevel = 4;
  place(t.host, COAL, 10, 10);
  line(t.host, 'power', 14, 10, 20, 10); line(t.host, 'power', 20, 11, 20, 19);
  return t;
}
const settle = (host: ReturnType<typeof mk>['host']): void => runDays(host, 21);   // 第 1 天电、第 20 天水

describe.each(PROFILES)('供水扫描（%s 桩）', (profile) => {
  it('水泵要有电：无电水泵不启动网络；有电后 base + 10 × 淡水格', () => {
    const t = mk(profile);
    t.state.weather.humid = 14; t.state.terrain.seaLevel = 4;
    place(t.host, PUMP, 20, 20); place(t.host, HOUSE, 20, 21);
    settle(t.host);
    expect(t.state.utilities.water).toMatchObject({ supply: 0, consumers: 0, watered: 0, usagePct: 100, unwateredBuildingTiles: 2 });
    expect(watered(t.state.layers.xbit, 20, 21)).toBe(false);
    const u = poweredTown(profile);
    place(u.host, PUMP, 20, 20); place(u.host, HOUSE, 20, 21);
    settle(u.host);
    expect(u.state.utilities.water).toMatchObject({ supply: 27, consumers: 1, watered: 1, usagePct: 3, unwateredBuildingTiles: 16 });
    expect(watered(u.state.layers.xbit, 20, 21)).toBe(true); expect(watered(u.state.layers.xbit, 20, 20)).toBe(true);
    expect(u.ctx.q.utilities.watered(tileIndex(20, 21))).toBe(true);
    paintWater(u.state, 19, 19); paintWater(u.state, 21, 19); paintWater(u.state, 19, 21); paintWater(u.state, 21, 21);   // dfloer 例：4 格淡水 → 67
    expect(runWaterScan(scanInput(u.state)).report.supply).toBe(67);
    paintWater(u.state, 19, 20, true);                                                                                     // 咸水不算
    expect(runWaterScan(scanInput(u.state)).report.supply).toBe(67);
  });
  it('管线连通：管线 / 管线下的道路 / 建筑隐式管线导水；缺一格或地铁直线阻断；0x1F / 0x20 十字口直通', () => {
    const t = poweredTown(profile);
    place(t.host, PUMP, 20, 20);
    line(t.host, 'pipe', 20, 21, 20, 25); line(t.host, 'road', 20, 24, 20, 24); place(t.host, HOUSE, 20, 26); place(t.host, HOUSE, 20, 28);
    line(t.host, 'pipe', 21, 20, 25, 20); paintXund(t.state, 23, 20, 0x01); place(t.host, HOUSE, 26, 20);
    settle(t.host);
    const xbit = t.state.layers.xbit;
    expect(watered(xbit, 20, 26)).toBe(true); expect(watered(xbit, 20, 24)).toBe(true); expect(watered(xbit, 20, 28)).toBe(false);
    expect(watered(xbit, 26, 20)).toBe(false); expect(watered(xbit, 22, 20)).toBe(true);
    expect(xbit[tileIndex(20, 24)]! & XBit.Piped).toBe(XBit.Piped); expect(xbit[tileIndex(20, 24)]! & XBit.Powerable).toBe(0);
    paintXund(t.state, 23, 20, 0x1f); runWaterScan(scanInput(t.state));
    expect(watered(t.state.layers.xbit, 26, 20)).toBe(true);
    paintXund(t.state, 23, 20, 0x20); runWaterScan(scanInput(t.state));
    expect(watered(t.state.layers.xbit, 26, 20)).toBe(true);
  });
  it('水泵自动管线：拆除水泵后 XUND 保留、PIPED 保留；拆除无管线建筑则清 PIPED', () => {
    const t = poweredTown(profile);
    place(t.host, PUMP, 20, 20); place(t.host, HOUSE, 30, 30);
    const pump = tileIndex(20, 20), house = tileIndex(30, 30);
    expect(t.state.layers.xund[pump]).toBe(0x10);
    bulldoze(t.host, pump, house);
    expect(t.state.layers.xbld[pump]).toBe(0); expect(t.state.layers.xund[pump]).toBe(0x10);
    expect(t.state.layers.xbit[pump]! & XBit.Piped).toBe(XBit.Piped); expect(t.state.layers.xbit[pump]! & XBit.Powerable).toBe(0);
    expect(t.state.layers.xbit[house]! & XBit.Piped).toBe(0);
  });
  it('幽灵水泵：有电但不连建筑 → 利用率 0、不发 waterShortage；unwateredBuildingTiles 仍计未接管的建筑', () => {
    const t = poweredTown(profile);
    place(t.host, PUMP, 20, 20); place(t.host, HOUSE, 40, 40); place(t.host, HOUSE, 41, 40);
    settle(t.host);
    expect(t.state.utilities.water).toMatchObject({ supply: 27, consumers: 0, watered: 0, usagePct: 0, unwateredBuildingTiles: 18 });
    const ev = t.host.drainEvents();
    expect(ev.some((e) => e.type === 'waterShortage')).toBe(false); expect(ev.some((e) => e.type === 'needWater')).toBe(false);
  });
  it('缺水按 BFS 序切尾、waterShortage / needWater 事件', () => {
    const t = poweredTown(profile);
    place(t.host, PUMP, 20, 20);                                            // 27 单位
    for (let y = 21; y <= 50; y++) place(t.host, HOUSE, 20, y);              // 30 座房子，顺序 y 递增
    settle(t.host);
    for (let y = 21; y <= 50; y++) expect(watered(t.state.layers.xbit, 20, y), `y=${y}`).toBe(y <= 47);
    expect(t.state.utilities.water).toMatchObject({ supply: 27, consumers: 30, watered: 27, usagePct: 100 });
    const ev = t.host.drainEvents();
    expect(ev.filter((e) => e.type === 'waterShortage')).toEqual([{ type: 'waterShortage', unwatered: 3 + 16 }]);
    expect(ev.filter((e) => e.type === 'needWater')).toHaveLength(1);
  });
  it('水塔：富余 ≥ 50 蓄一格（二值）、下月放出 100 并蓄两格；无电水塔不蓄；水塔不是水源', () => {
    const t = poweredTown(profile);
    place(t.host, PUMP, 20, 20); place(t.host, TOWER, 21, 20); place(t.host, HOUSE, 23, 20);
    paintWater(t.state, 19, 19); paintWater(t.state, 19, 21); paintWater(t.state, 21, 19); paintWater(t.state, 20, 19);   // 4 格淡水 → 67
    runDays(t.host, 1);                                                                                              // 第 0 天日末 flush：第一次供水扫描
    expect(t.state.utilities.water).toMatchObject({ supply: 67, consumers: 1, watered: 1, towerCapacity: 400, towerCharged: 1 });
    const cells = [tileIndex(21, 20), tileIndex(21, 21), tileIndex(22, 20), tileIndex(22, 21)];
    expect(cells.map((i) => (t.state.layers.xbit[i]! & XBit.Watered) !== 0)).toEqual([true, false, false, false]);
    runDays(t.host, 20);                                                                                             // 第 20 天月度扫描：放出 100、蓄两格
    expect(t.state.utilities.water).toMatchObject({ supply: 167, towerCharged: 2 });
    expect(cells.filter((i) => (t.state.layers.xbit[i]! & XBit.Watered) !== 0)).toHaveLength(2);
    // 无电水塔：只经管线相连、不与任何导电物相邻 → 不蓄；且孤立无泵管网上的水塔永远不被遍历
    const u = poweredTown(profile);
    place(u.host, PUMP, 20, 20); line(u.host, 'pipe', 21, 20, 23, 20); place(u.host, TOWER, 24, 20);
    paintWater(u.state, 19, 19); paintWater(u.state, 19, 21); paintWater(u.state, 21, 19); paintWater(u.state, 20, 19);
    place(u.host, TOWER, 60, 60); u.state.layers.xbit[tileIndex(60, 60)] = u.state.layers.xbit[tileIndex(60, 60)]! | XBit.Watered;
    settle(u.host);
    expect(u.state.utilities.water).toMatchObject({ supply: 67, towerCapacity: 400, towerCharged: 0 });
    expect(u.state.layers.xbit[tileIndex(60, 60)]! & XBit.Watered).toBe(XBit.Watered);
  });
  it('净水厂：不耗水不产水、有电时自身 WATERED；容量 floor(格数 / 4) × 2000 与充足标志', () => {
    const t = poweredTown(profile);
    place(t.host, PUMP, 20, 20); place(t.host, TREATMENT, 21, 20); place(t.host, HOUSE, 23, 20);
    settle(t.host);
    expect(t.state.utilities.water).toMatchObject({ consumers: 1, watered: 1, treatmentCapacity: 2000, treatmentSufficient: true });
    expect(watered(t.state.layers.xbit, 22, 21)).toBe(true);
    place(t.host, TREATMENT, 50, 50);                                                                                 // 无电的第二座
    runDays(t.host, 1);
    expect(t.state.utilities.water.treatmentCapacity).toBe(4000);
    expect(watered(t.state.layers.xbit, 50, 50)).toBe(false);
    expect(runWaterScan(scanInput(t.state, { treatmentCells: 7 })).report.treatmentCapacity).toBe(2000);
  });
});

describe('T7 水源顺序、淡化与扫描前清位（直接驱动扫描器）', () => {
  it('两座互不连通的水泵：先处理 (3,100)（索引 484）再处理 (4,2)（索引 514）', () => {
    const { state } = mk();
    const a = paintLot(state, PUMP, 3, 100), b = paintLot(state, PUMP, 4, 2);
    paintLot(state, HOUSE, 3, 101); paintLot(state, HOUSE, 4, 3);
    state.layers.xbit[a] = state.layers.xbit[a]! | XBit.Powered; state.layers.xbit[b] = state.layers.xbit[b]! | XBit.Powered;
    expect(a).toBe(484); expect(b).toBe(514);
    const r = runWaterScan(scanInput(state, { humid: 14, waterLevel: 4 }));
    expect(r.networks.map((n) => n.start)).toEqual([484, 514]);
    expect(r.networks.map((n) => n.tiles)).toEqual([2, 2]);
    expect(r.report).toMatchObject({ supply: 54, consumers: 2, watered: 2 });
  });
  it('海水淡化：四面环海 3×3 → 640；一侧中点被占 → 580；淡水湖旁 → 0', () => {
    const { state } = mk();
    const anchor = paintLot(state, DESAL, 30, 30);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) { const i = tileIndex(30 + dx, 30 + dy); state.layers.xbit[i] = state.layers.xbit[i]! | XBit.Powered; }
    for (let x = 29; x <= 33; x++) for (let y = 29; y <= 33; y++) if (x === 29 || x === 33 || y === 29 || y === 33) paintWater(state, x, y, true);
    expect(runWaterScan(scanInput(state)).report.supply).toBe(640);
    expect(runWaterScan(scanInput(state)).networks[0]!.start).toBe(anchor);
    state.layers.xbit[tileIndex(29, 31)] = state.layers.xbit[tileIndex(29, 31)]! & ~(XBit.Water | XBit.SaltWater);
    expect(runWaterScan(scanInput(state)).report.supply).toBe(580);
    for (let x = 29; x <= 33; x++) for (let y = 29; y <= 33; y++) state.layers.xbit[tileIndex(x, y)] = state.layers.xbit[tileIndex(x, y)]! & ~XBit.SaltWater;
    expect(runWaterScan(scanInput(state)).report.supply).toBe(0);
  });
  it('扫描开始：非水塔格清 WATERED，水塔格保留；无水源时利用率 100%、净水厂 0 座视为充足', () => {
    const { state } = mk();
    const tower = paintLot(state, TOWER, 40, 40);
    const stray = tileIndex(5, 5);
    state.layers.xbit[tower] = state.layers.xbit[tower]! | XBit.Watered; state.layers.xbit[stray] = state.layers.xbit[stray]! | XBit.Watered;
    const r = runWaterScan(scanInput(state));
    expect(state.layers.xbit[tower]! & XBit.Watered).toBe(XBit.Watered); expect(state.layers.xbit[stray]! & XBit.Watered).toBe(0);
    expect(r.report).toEqual({ supply: 0, consumers: 0, watered: 0, usagePct: 100, towerCapacity: 0, towerCharged: 0, treatmentCapacity: 0, treatmentSufficient: true, unwateredBuildingTiles: 3 });
  });
});
