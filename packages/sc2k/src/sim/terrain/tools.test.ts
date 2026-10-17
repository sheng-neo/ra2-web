// sim/terrain/tools.test.ts —— terrainTool：费用与拒绝原因、城市 / 编辑模式、refloodAll 幂等、结构物拒绝、查询、外部写入收编、随机操作不变量（WORKPLAN WP2）。
import { describe, expect, it } from 'vitest';
import type { Command, CommandResult } from '../../contracts/commands';
import { CityMode, TILES, XBit, XterClass, tileIndex, xterClassOf } from '../../contracts/grid';
import type { SimHost } from '../../contracts/host';
import { createPrng } from '../../contracts/prng';
import type { StubProfile } from '../../contracts/testkit';
import { createTestContext, hashOf } from '../../testkit';
import { createTerrainSystem, DEFAULT_TERRAIN_TUNING } from './index';
import { terrainViolations, totalViolations } from './invariants';

type ToolName = Extract<Command, { type: 'terrainTool' }>['tool'];
const T = DEFAULT_TERRAIN_TUNING;
/** water=5 ⇒ 海平面 4 = 平地海拔 4：全图干地但一挖就见水。 */
const FLAT_SEA_PARAMS = { terrain: { coast: false, river: false, hills: 0, water: 5, trees: 0 } };
const FUNDS = 100000;
const i = tileIndex;

function setup(profile: StubProfile = 'realistic', extra: Parameters<typeof createTestContext>[0] = {}) {
  const t = createTestContext({ profile, systems: [createTerrainSystem()], params: FLAT_SEA_PARAMS, ...extra });
  t.state.economy.funds = FUNDS;
  t.host.drainEvents();
  return t;
}
const tool = (host: SimHost, name: ToolName, path: number[], arg?: number): CommandResult =>
  host.dispatch({ type: 'terrainTool', tool: name, path, ...(arg !== undefined ? { arg } : {}) });
const editor = (t: ReturnType<typeof setup>): void => { t.state.clock.mode = CityMode.TerrainEdit; };
const healthy = (t: ReturnType<typeof setup>): void => { const v = terrainViolations(t.state); expect(v, JSON.stringify(v)).toSatisfy((x: typeof v) => totalViolations(x) === 0); };
const isWater = (t: ReturnType<typeof setup>, idx: number): boolean => (t.state.layers.xbit[idx]! & XBit.Water) !== 0;

describe.each(['optimistic', 'pessimistic'] as const)('terrain tools（%s 桩）', (profile) => {
  it('raise：$25 × 改变格（平地单击 = 9 格），中心 +1 平地、四周坡面；commandLog 记一条；不变量成立', () => {
    const t = setup(profile);
    const r = tool(t.host, 'raise', [i(10, 10)]);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(T.costRaise * 9);
    expect(t.state.economy.funds).toBe(FUNDS - T.costRaise * 9);
    expect(r.changed.length).toBeGreaterThanOrEqual(9);
    const L = t.state.layers;
    expect(L.alt[i(10, 10)]).toBe(5); expect(L.xter[i(10, 10)]).toBe(0);
    expect(L.alt[i(9, 10)]).toBe(4); expect(L.xter[i(9, 10)]).toBe(0x02);   // R 边高
    expect(L.alt[i(11, 10)]).toBe(4); expect(L.xter[i(11, 10)]).toBe(0x04); // L 边高
    expect(L.alt[i(10, 9)]).toBe(4); expect(L.xter[i(10, 9)]).toBe(0x03);   // B 边高
    expect(L.xter[i(9, 9)]).toBe(0x0a);                                        // 单角 c11 高
    expect(t.host.commandLog()).toHaveLength(1);
    expect(t.ctx.prng.state()).toBe(12345 >>> 0);                              // 地形工具不消费 sim 流
    healthy(t);
    // 再抬一次：中心 6，坡面向外扩一圈（5×5 = 25 格改变）
    const r2 = tool(t.host, 'raise', [i(10, 10)]);
    expect(r2.ok).toBe(true); expect(r2.cost).toBe(T.costRaise * 25);
    expect(L.alt[i(10, 10)]).toBe(6);
    healthy(t);
  });
  it('资金不足：reason funds，分文不动、地形不变、不入日志', () => {
    const t = setup(profile);
    t.state.economy.funds = 100;
    const before = hashOf(t.state);
    const r = tool(t.host, 'raise', [i(10, 10)]);
    expect(r).toMatchObject({ ok: false, reason: 'funds', cost: 0 });
    expect(r.changed).toEqual([]);
    expect(t.state.economy.funds).toBe(100);
    expect(hashOf(t.state)).toBe(before);
    expect(t.host.commandLog()).toHaveLength(0);
  });
  it('城市模式触及结构物 / 隧道格 → obstructed，无改动；编辑模式不受限且免费', () => {
    const t = setup(profile);
    t.ctx.act.setXbld(i(11, 10), 0x70);
    editor(t);
    const r = tool(t.host, 'raise', [i(10, 10)]);                                // 编辑模式：结构物不阻挡、免费
    expect(r.ok).toBe(true); expect(r.cost).toBe(0);
    expect(t.state.economy.funds).toBe(FUNDS);
    expect(t.state.layers.alt[i(10, 10)]).toBe(5);
    healthy(t);
    t.state.clock.mode = CityMode.City;
    const before = hashOf(t.state);
    expect(tool(t.host, 'raise', [i(10, 10)])).toMatchObject({ ok: false, reason: 'obstructed' });
    expect(tool(t.host, 'lower', [i(10, 10)])).toMatchObject({ ok: false, reason: 'obstructed' });
    expect(tool(t.host, 'level', [i(20, 20), i(10, 10)])).toMatchObject({ ok: false, reason: 'obstructed' });
    expect(hashOf(t.state)).toBe(before);
    expect(t.state.economy.funds).toBe(FUNDS);
    t.state.layers.tunnelLevels[i(30, 31)] = 2;
    expect(tool(t.host, 'raise', [i(30, 30)])).toMatchObject({ ok: false, reason: 'obstructed' });
  });
  it('tooHigh / tooLow：31 级不可再抬、0 级不可再降', () => {
    const t = setup(profile); editor(t);
    const L = t.state.layers;
    L.alt.fill(31); L.waterLevel.fill(31);
    for (const s of t.host.systems) s.postLoad?.(t.ctx, 'snapshot');
    expect(tool(t.host, 'raise', [i(5, 5)])).toMatchObject({ ok: false, reason: 'tooHigh' });
    L.alt.fill(0); L.waterLevel.fill(0); t.state.terrain.seaLevel = 0;
    for (const s of t.host.systems) s.postLoad?.(t.ctx, 'snapshot');
    expect(tool(t.host, 'lower', [i(5, 5)])).toMatchObject({ ok: false, reason: 'tooLow' });
    expect(tool(t.host, 'raise', [i(5, 5)]).ok).toBe(true);
    healthy(t);
  });
  it('level：以首格海拔为基准推平路径并清树，费用按改变格计；对已平地块零费用', () => {
    const t = setup(profile);
    editor(t);
    tool(t.host, 'raise', [i(20, 20)]); tool(t.host, 'raise', [i(20, 20)]);
    tool(t.host, 'trees', [i(21, 21)]);                                        // 坡面上的树
    expect(t.state.layers.xbld[i(21, 21)]).toBe(0x06);
    t.state.clock.mode = CityMode.City;
    const r = tool(t.host, 'level', [i(25, 25), i(20, 20), i(21, 21)]);
    expect(r.ok).toBe(true);
    // 只推平拖过的格：7 个角点回到 4，周围一圈仍为 5（最小改动），共 14 个地块改变
    expect(r.cost).toBe(T.costLevel * 14);
    for (const idx of [i(20, 20), i(21, 21), i(25, 25)]) { expect(t.state.layers.alt[idx]).toBe(4); expect(t.state.layers.xter[idx]).toBe(0); }
    expect(t.state.layers.xter[i(19, 19)]).not.toBe(0);
    expect(t.state.layers.xbld[i(21, 21)]).toBe(0);
    // 再把整个 5×5 区域拖平：全部回到 4
    const path: number[] = [i(25, 25)];
    for (let x = 17; x <= 23; x++) for (let y = 17; y <= 23; y++) path.push(i(x, y));
    expect(tool(t.host, 'level', path).ok).toBe(true);
    for (let x = 17; x <= 23; x++) for (let y = 17; y <= 23; y++) { expect(t.state.layers.alt[i(x, y)]).toBe(4); expect(t.state.layers.xter[i(x, y)]).toBe(0); }
    expect(tool(t.host, 'level', [i(40, 40), i(41, 40)])).toMatchObject({ ok: true, cost: 0, changed: [] });
    healthy(t);
  });
  it('lower：低于海平面成水（水下 0x10 / 岸边 0x2X、水位 = 海平面、淡水）；新水块继承相邻咸水', () => {
    const t = setup(profile);
    const L = t.state.layers;
    const r = tool(t.host, 'lower', [i(30, 30)]);
    expect(r.ok).toBe(true); expect(r.cost).toBe(T.costLower * 9);
    expect(L.alt[i(30, 30)]).toBe(3); expect(L.xter[i(30, 30)]).toBe(0x10); expect(L.waterLevel[i(30, 30)]).toBe(4);
    expect(isWater(t, i(30, 30))).toBe(true); expect(t.host.q.terrain.isSalt(i(30, 30))).toBe(false);
    expect(xterClassOf(L.xter[i(29, 30)]!)).toBe(XterClass.Shore); expect(L.xter[i(29, 30)]).toBe(0x24);   // L 边高
    expect(t.host.q.terrain.waterDepth(i(30, 30))).toBe(1); expect(t.host.q.terrain.waterDepth(i(29, 30))).toBe(1);
    healthy(t);
    // (31,30) 是岸边水块；把它标咸后挖 (32,30)：新水块 (32,30) 继承，再外一圈的新岸边格 (33,30) 经迭代也继承
    t.ctx.act.setXbit(i(31, 30), XBit.SaltWater, true);
    expect(isWater(t, i(32, 30))).toBe(false);
    tool(t.host, 'lower', [i(32, 30)]);
    expect(isWater(t, i(32, 30))).toBe(true); expect(t.host.q.terrain.isSalt(i(32, 30))).toBe(true);
    expect(isWater(t, i(33, 30))).toBe(true); expect(t.host.q.terrain.isSalt(i(33, 30))).toBe(true);
    expect(t.host.q.terrain.isSalt(i(30, 30))).toBe(false);                      // 既有水块不回溯
    healthy(t);
    // 抬回去：水排干、盐位清除
    tool(t.host, 'raise', [i(31, 30)]); tool(t.host, 'raise', [i(32, 30)]);
    expect(isWater(t, i(31, 30))).toBe(false); expect(t.host.q.terrain.isSalt(i(31, 30))).toBe(false);
    expect(isWater(t, i(32, 30))).toBe(false); expect(t.host.q.terrain.isSalt(i(32, 30))).toBe(false);
    healthy(t);
  });
  it('water：平地 → 孤立池塘 0x3D（$100）；相邻第二池塘后两者形状更新；坡面 → 瀑布 0x3E；水上 / 建筑 / bedrock 拒绝', () => {
    const t = setup(profile);
    const L = t.state.layers;
    const r = tool(t.host, 'water', [i(50, 50)]);
    expect(r).toMatchObject({ ok: true, cost: T.costWater });
    expect(L.xter[i(50, 50)]).toBe(0x3d); expect(isWater(t, i(50, 50))).toBe(true); expect(L.waterLevel[i(50, 50)]).toBe(4);
    expect(t.host.q.terrain.xterClass(i(50, 50))).toBe(XterClass.Surface); expect(t.host.q.terrain.waterDepth(i(50, 50))).toBe(0);
    // 相邻单格池塘：共享角仍挨着干地 ⇒ 两者都保持"孤立"（spec §2.6.3 角位规则）；凑成 2×2 后中心角成水，四格为四个内凹码
    tool(t.host, 'water', [i(51, 50)]);
    expect(L.xter[i(50, 50)]).toBe(0x3d); expect(L.xter[i(51, 50)]).toBe(0x3d);
    expect(tool(t.host, 'water', [i(50, 51), i(51, 51)])).toMatchObject({ ok: true, cost: T.costWater * 2 });
    expect(L.xter[i(50, 50)]).toBe(0x38); expect(L.xter[i(51, 50)]).toBe(0x35);
    expect(L.xter[i(50, 51)]).toBe(0x37); expect(L.xter[i(51, 51)]).toBe(0x36);
    expect(tool(t.host, 'water', [i(50, 50)])).toMatchObject({ ok: false, reason: 'water' });
    t.ctx.act.setXbld(i(60, 60), 0x70);
    expect(tool(t.host, 'water', [i(60, 60)])).toMatchObject({ ok: false, reason: 'occupied' });
    L.xter[i(61, 61)] = 0x0d;
    expect(tool(t.host, 'water', [i(61, 61)])).toMatchObject({ ok: false, reason: 'terrain' });
    L.xter[i(61, 61)] = 0;
    // 混合路径：合格格应用并计费，不合格格跳过
    const mixed = tool(t.host, 'water', [i(50, 50), i(52, 50)]);
    expect(mixed).toMatchObject({ ok: true, cost: T.costWater });
    editor(t); tool(t.host, 'raise', [i(70, 70)]); t.state.clock.mode = CityMode.City;
    const fall = tool(t.host, 'water', [i(69, 70)]);
    expect(fall).toMatchObject({ ok: true, cost: T.costWater });
    expect(L.xter[i(69, 70)]).toBe(0x3e); expect(L.waterLevel[i(69, 70)]).toBe(L.alt[i(69, 70)]! + 1);
    expect(t.host.q.terrain.slope(i(69, 70))).toBe(13); expect(t.host.q.terrain.cornerHeights(i(69, 70))).toEqual([5, 5, 5, 5]);
    healthy(t);
    // 池塘旁再抬地：装饰水被排干
    tool(t.host, 'raise', [i(50, 50)]);
    expect(isWater(t, i(50, 50))).toBe(false); expect(isWater(t, i(51, 50))).toBe(false);
    healthy(t);
  });
  it('trees：每次 +1 档 $3，满档仍收费；arg<0 移除免费；水上 / 建筑拒绝；路径多格各计一次', () => {
    const t = setup(profile);
    const L = t.state.layers;
    expect(tool(t.host, 'trees', [i(40, 40)])).toMatchObject({ ok: true, cost: T.costTrees });
    expect(L.xbld[i(40, 40)]).toBe(0x06); expect(t.host.q.terrain.treeDensity(i(40, 40))).toBe(1);
    for (let k = 0; k < 6; k++) tool(t.host, 'trees', [i(40, 40)]);
    expect(L.xbld[i(40, 40)]).toBe(0x0c);
    const funds = t.state.economy.funds;
    expect(tool(t.host, 'trees', [i(40, 40)])).toMatchObject({ ok: true, cost: T.costTrees, changed: [] });
    expect(t.state.economy.funds).toBe(funds - T.costTrees);
    expect(tool(t.host, 'trees', [i(40, 40)], -1)).toMatchObject({ ok: true, cost: 0 });
    expect(L.xbld[i(40, 40)]).toBe(0x0b);
    expect(tool(t.host, 'trees', [i(41, 40)], -1)).toMatchObject({ ok: false, reason: 'noTarget' });
    tool(t.host, 'water', [i(42, 40)]);
    expect(tool(t.host, 'trees', [i(42, 40)])).toMatchObject({ ok: false, reason: 'water' });
    t.ctx.act.setXbld(i(43, 40), 0x70);
    expect(tool(t.host, 'trees', [i(43, 40)])).toMatchObject({ ok: false, reason: 'occupied' });
    expect(tool(t.host, 'trees', [i(44, 40), i(45, 40), i(42, 40)])).toMatchObject({ ok: true, cost: T.costTrees * 2 });
  });
  it('编辑模式专用工具（forest / stream / stretch / seaLevel）在城市模式 → mode；非法路径 → outOfBounds', () => {
    const t = setup(profile);
    for (const name of ['forest', 'stream', 'stretch', 'seaLevel'] as const) expect(tool(t.host, name, [i(5, 5)])).toMatchObject({ ok: false, reason: 'mode' });
    expect(tool(t.host, 'raise', [])).toMatchObject({ ok: false, reason: 'outOfBounds' });
    expect(tool(t.host, 'raise', [-1, TILES, 1.5])).toMatchObject({ ok: false, reason: 'outOfBounds' });
  });
});

describe('terrain tools：编辑模式工具', () => {
  it('seaLevel ±1：全图重灌；arg=0 的 refloodAll 幂等（changed 为空、哈希不变）；升降往返恢复原哈希', () => {
    const t = setup(); editor(t);
    const h0 = hashOf(t.state);
    const up = tool(t.host, 'seaLevel', [i(0, 0)], 1);
    expect(up.ok).toBe(true); expect(t.state.terrain.seaLevel).toBe(5);
    expect(up.changed.length).toBe(TILES);                                       // 平地 4 全部没入 5 级海面
    expect(isWater(t, i(64, 64))).toBe(true); expect(t.state.layers.xter[i(64, 64)]).toBe(0x10);
    healthy(t);
    const h1 = hashOf(t.state);
    const again = tool(t.host, 'seaLevel', [i(0, 0)], 0);
    expect(again).toMatchObject({ ok: true, cost: 0, changed: [] });
    expect(hashOf(t.state)).toBe(h1);
    const down = tool(t.host, 'seaLevel', [i(0, 0)], -1);
    expect(down.ok).toBe(true); expect(t.state.terrain.seaLevel).toBe(4);
    expect(hashOf(t.state)).toBe(h0);
    expect(tool(t.host, 'seaLevel', [i(0, 0)], 40)).toMatchObject({ ok: false, reason: 'tooHigh' });
    expect(tool(t.host, 'seaLevel', [i(0, 0)], -40)).toMatchObject({ ok: false, reason: 'tooLow' });
  });
  it('seaLevel 上升保留高于海面的池塘，淹没者并入海水；Coast 图重灌后边缘海水重新标咸', () => {
    const t = setup(); editor(t);
    tool(t.host, 'water', [i(10, 10)]);                                          // 池塘 alt 4
    tool(t.host, 'raise', [i(40, 40)]); tool(t.host, 'raise', [i(40, 40)]);
    tool(t.host, 'water', [i(40, 40)]);                                          // 池塘 alt 6
    t.state.terrain.coast = true;
    tool(t.host, 'seaLevel', [i(0, 0)], 1);                                      // W = 5
    expect(t.state.layers.xter[i(10, 10)]).toBe(0x10);                           // 低池塘并入海水
    expect(t.state.layers.xter[i(40, 40)]).toBe(0x3d);                           // 高池塘保留
    expect(t.host.q.terrain.isSalt(i(0, 0))).toBe(true); expect(t.host.q.terrain.isSalt(i(10, 10))).toBe(true);
    expect(t.host.q.terrain.isSalt(i(40, 40))).toBe(false);
    healthy(t);
  });
  it('stretch：arg=+3 等于三次 raise，arg=−2 两次 lower', () => {
    const t = setup(); editor(t);
    expect(tool(t.host, 'stretch', [i(80, 80)], 3).ok).toBe(true);
    expect(t.state.layers.alt[i(80, 80)]).toBe(7);
    expect(tool(t.host, 'stretch', [i(80, 80)], -2).ok).toBe(true);
    expect(t.state.layers.alt[i(80, 80)]).toBe(5);
    expect(tool(t.host, 'stretch', [i(80, 80)], 0)).toMatchObject({ ok: true, changed: [] });
    healthy(t);
  });
  it('forest：半径内植树、半径外不动、水面不植；同状态两次结果确定', () => {
    const a = setup(); editor(a);
    tool(a.host, 'water', [i(90, 92)]);
    const r = tool(a.host, 'forest', [i(90, 90)], 3);
    expect(r.ok).toBe(true); expect(r.changed.length).toBeGreaterThan(5);
    let outside = 0;
    for (let x = 0; x < 128; x++) for (let y = 0; y < 128; y++) if ((Math.abs(x - 90) > 3 || Math.abs(y - 90) > 3) && a.state.layers.xbld[i(x, y)] !== 0) outside++;
    expect(outside).toBe(0);
    expect(a.state.layers.xbld[i(90, 92)]).toBe(0);
    expect(a.state.layers.xbld[i(90, 90)]).toBeGreaterThanOrEqual(0x06);        // 中心必植（p = 1）
    const b = setup(); editor(b);
    tool(b.host, 'water', [i(90, 92)]);
    tool(b.host, 'forest', [i(90, 90)], 3);
    expect(hashOf(b.state)).toBe(hashOf(a.state));
    expect(tool(a.host, 'forest', [i(90, 90)], -3).ok).toBe(true);
    expect(a.state.layers.xbld[i(90, 90)]).toBe(0);
  });
  it('stream：从高处干平地起雕刻溪流（平地 0x40/0x41、坡面瀑布、末端水湾 / 池塘）；水上起点拒绝', () => {
    const t = createTestContext({ systems: [createTerrainSystem()], flat: false, params: { terrainSeed: 99, terrain: { coast: false, river: false, hills: 25, water: 10, trees: 0 } } });
    editor(t);
    const L = t.state.layers, W = t.state.terrain.seaLevel;
    let start = -1;
    for (let k = 0; k < TILES && start < 0; k++) if ((L.xbit[k]! & XBit.Water) === 0 && L.xter[k] === 0 && L.alt[k]! >= W + 2) start = k;
    expect(start).toBeGreaterThanOrEqual(0);
    const r = tool(t.host, 'stream', [start]);
    expect(r.ok).toBe(true); expect(r.changed.length).toBeGreaterThanOrEqual(1);
    expect(isWater(t, start)).toBe(true);
    expect([0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x3e, 0x3d]).toContain(L.xter[start]);
    expect(tool(t.host, 'stream', [start])).toMatchObject({ ok: false, reason: 'water' });
    healthy(t);
  });
});

describe('terrain tools：查询、外部写入、随机操作', () => {
  it('TerrainQuery：alt / slope / isFlatDry / cornerHeights / distanceToWater / altitudeFeet', () => {
    const t = setup();
    const q = t.host.q.terrain;
    expect(q.alt(i(10, 10))).toBe(4); expect(q.isFlatDry(i(10, 10))).toBe(true); expect(q.altitudeFeet(i(10, 10))).toBe(450);
    expect(q.cornerHeights(i(10, 10))).toEqual([4, 4, 4, 4]); expect(q.distanceToWater(i(10, 10))).toBe(8);
    tool(t.host, 'lower', [i(30, 30)]);
    expect(q.isWater(i(30, 30))).toBe(true); expect(q.isFlatDry(i(29, 30))).toBe(false); expect(q.slope(i(29, 30))).toBe(4);
    expect(q.cornerHeights(i(29, 30))).toEqual([4, 3, 4, 3]);
    expect(q.distanceToWater(i(34, 30))).toBe(3); expect(q.distanceToWater(i(30, 30))).toBe(0);
    expect(q.distanceToWater(i(45, 30))).toBe(8);
  });
  it('系统外形：id / commands / queries 键集合，无阶段、无 priv、无 stub', () => {
    const s = createTerrainSystem();
    expect(s.id).toBe('terrain'); expect(s.stub).toBeUndefined(); expect(s.phases).toBeUndefined(); expect(s.privVersion).toBeUndefined();
    expect(Object.keys(s.commands ?? {})).toEqual(['terrainTool']); expect(Object.keys(s.queries ?? {})).toEqual(['terrain']);
    expect(typeof s.importFrom).toBe('function'); expect(typeof s.exportTo).toBe('function'); expect(typeof s.postLoad).toBe('function');
    expect(s.queries!.terrain!.alt(0)).toBe(0);                                  // 绑定前回退到空城作答，不抛错
  });
  it('onTilesChanged：外部 setTerrain 改几何被收编为角点；外部只改水体时邻居池塘形状仍被修正', () => {
    const t = setup();
    tool(t.host, 'water', [i(100, 100)]);
    expect(t.state.layers.xter[i(100, 100)]).toBe(0x3d);
    // 外部系统把另外三格改成池塘（只改水位 / 类别，不改几何），再派发任意命令触发扇出：本模块修正 8 邻形状
    for (const idx of [i(101, 100), i(100, 101), i(101, 101)]) { t.ctx.act.setXbit(idx, XBit.Water, true); t.ctx.act.setTerrain(idx, 4, 0x30, 4); }
    t.host.dispatch({ type: 'setSpeed', speed: 2 });
    expect(t.state.layers.xter[i(100, 100)]).toBe(0x38);
    expect(t.state.layers.xter[i(101, 100)]).toBe(0x35);
    expect(t.state.layers.xter[i(100, 101)]).toBe(0x37);
    expect(t.state.layers.xter[i(101, 101)]).toBe(0x36);
    // 外部系统把 (110,110) 整格抬成 1 级平台（桥头式写法）：角点被收编，之后 raise 旁边仍以其为准
    t.ctx.act.setTerrain(i(110, 110), 5, 0, 5);
    t.host.dispatch({ type: 'setSpeed', speed: 2 });
    editor(t);
    expect(tool(t.host, 'raise', [i(110, 110)]).ok).toBe(true);
    expect(t.state.layers.alt[i(110, 110)]).toBe(6);
  });
  it('随机 raise / lower / level / water / trees 120 次后不变量全部成立', () => {
    const t = createTestContext({ systems: [createTerrainSystem()], flat: false, params: { terrainSeed: 31337, terrain: { coast: true, river: true, hills: 20, water: 12, trees: 10 } } });
    editor(t);
    const prng = createPrng(7);
    const names: ToolName[] = ['raise', 'lower', 'level', 'water', 'trees', 'raise', 'lower'];
    let okCount = 0;
    for (let k = 0; k < 120; k++) {
      const name = names[prng.int(names.length)]!;
      const a = prng.int(TILES), b = prng.int(TILES);
      const path = name === 'level' ? [a, b, (a + b) >> 1] : [a];
      if (tool(t.host, name, path).ok) okCount++;
      if (k % 30 === 29) healthy(t);
    }
    expect(okCount).toBeGreaterThan(60);
    healthy(t);
  });
});
