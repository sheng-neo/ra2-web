// ===== sim/core/registry.test.ts =====（ARCHITECTURE §10.1 / §10.2 契约一致；WP1 维护）
// 对"已接线的真系统"做严格检查（commands 键集合 == COMMAND_OWNER 归自己者、phases / actions / queries 只填自己的键、声明 priv 必有 postLoad、
// endOfDay 只在 END_OF_DAY_IO 的键上），对桩系统宽松（只要求 stub 标记、无命令、queries 键 == 归自己者）；
// 另断言 COMMAND_OWNER / MODAL_OWNER 全覆盖、SYSTEM_ORDER 排序与传入顺序无关（哈希一致）、PRIV_BUDGET_BYTES。
import { describe, expect, it } from 'vitest';
import { ACTION_OWNER } from '../../contracts/actions';
import type { Actions } from '../../contracts/actions';
import { END_OF_DAY_IO, PHASE_OWNER, SYSTEM_ORDER } from '../../contracts/clock';
import type { PhaseId } from '../../contracts/clock';
import { COMMAND_OWNER, MODAL_OWNER } from '../../contracts/commands';
import type { Command, ModalId } from '../../contracts/commands';
import { QUERY_OWNER } from '../../contracts/queries';
import type { Queries } from '../../contracts/queries';
import { PRIV_BUDGET_BYTES, PRIV_BUDGET_TOTAL_MAX } from '../../contracts/snapshot';
import type { System, SystemId } from '../../contracts/system';
import { WIRE_STUB_ALLOWLIST, createWiredHost } from '../../app/wire';
import { CATALOGUE } from '../../data';
import { snapshotCodec } from '../../io/snapshot';
import { createTestContext, nullSystem, runDays } from '../../testkit';
import { createCoreSystem } from './coreSystem';
import { createSim } from './createSim';

// 编译期全覆盖：少 / 多一个成员都报错
const ALL_COMMAND_TYPES: Record<Command['type'], true> = {
  placeBuilding: true, zoneRect: true, dezone: true, bulldoze: true, terrainTool: true, network: true, tunnel: true, neighborConnection: true,
  setTax: true, setIndustryTax: true, setFunding: true, setOrdinance: true, issueBond: true, repayBond: true, setSpeed: true, setOption: true,
  requestDisaster: true, dispatch: true, sign: true, rename: true, cheat: true, terrainDone: true, setView: true, modalAnswer: true };
const ALL_MODAL_IDS: Record<ModalId, true> = {
  budget: true, militaryOffer: true, disasterAlert: true, scenarioBrief: true, scenarioResult: true, gameOver: true, newspaper: true, extraPaper: true, rewardOffer: true,
  bridgeType: true, teamPick: true, neighborConnect: true, importAssets: true };

const ownedBy = <K extends string>(table: Readonly<Record<K, SystemId>>, owner: SystemId): K[] => (Object.keys(table) as K[]).filter((k) => table[k] === owner).sort();
const keysOf = (o: object | undefined): string[] => Object.keys(o ?? {}).sort();

describe('registry: 契约表全覆盖', () => {
  it('COMMAND_OWNER 覆盖全部 Command.type；MODAL_OWNER 覆盖全部 ModalId；值 ∈ SYSTEM_ORDER', () => {
    expect(keysOf(COMMAND_OWNER)).toEqual(keysOf(ALL_COMMAND_TYPES));
    expect(keysOf(MODAL_OWNER)).toEqual(keysOf(ALL_MODAL_IDS));
    for (const v of Object.values(COMMAND_OWNER)) expect(SYSTEM_ORDER).toContain(v);
    for (const v of Object.values(MODAL_OWNER)) expect(SYSTEM_ORDER).toContain(v);
    for (const v of Object.values(ACTION_OWNER)) expect(SYSTEM_ORDER).toContain(v);
    for (const v of Object.values(QUERY_OWNER)) expect(SYSTEM_ORDER).toContain(v);
    for (const v of Object.values(PHASE_OWNER)) expect(SYSTEM_ORDER).toContain(v);
  });
  it('PRIV_BUDGET_BYTES：键 == 非 core 系统，总和 ≤ PRIV_BUDGET_TOTAL_MAX', () => {
    expect(keysOf(PRIV_BUDGET_BYTES)).toEqual(SYSTEM_ORDER.filter((id) => id !== 'core').sort());
    expect(Object.values(PRIV_BUDGET_BYTES).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(PRIV_BUDGET_TOTAL_MAX);
  });
  it('法令表 20 条、id 0..19、demand 乘数为有限数（zones 乘数表合入后在此对账）', () => {
    expect(CATALOGUE.ORDINANCES).toHaveLength(20);
    expect(CATALOGUE.ORDINANCES.map((o) => o.id).sort((a, b) => a - b)).toEqual([...Array(20).keys()]);
    for (const o of CATALOGUE.ORDINANCES) for (const v of Object.values(o.demand)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('registry: 已接线系统的契约一致', () => {
  const host = createWiredHost();
  const systems = host.systems;
  it('9 个系统按 SYSTEM_ORDER；桩都在 WIRE_STUB_ALLOWLIST 内', () => {
    expect(systems.map((s) => s.id)).toEqual(SYSTEM_ORDER);
    for (const s of systems) if (s.stub) expect(WIRE_STUB_ALLOWLIST).toContain(s.id);
  });
  /** WORKPLAN 标为 [v2] 而第一波合入时允许暂缺的阶段（按系统）。合入对应 v2 切片时从这里删除。 */
  const DEFERRED_PHASES: Partial<Record<SystemId, readonly PhaseId[]>> = {
    services: ['approvalSurvey'],
  };
  for (const s of systems) {
    const owned = {
      commands: ownedBy(COMMAND_OWNER, s.id), phases: ownedBy(PHASE_OWNER, s.id), actions: s.id === 'core' ? [] : ownedBy(ACTION_OWNER, s.id),
      queries: ownedBy(QUERY_OWNER, s.id),
    };
    if (s.stub) {
      it(`${s.id}（桩）：无阶段 / 无命令 / 无 priv；queries 键 == 归自己者；actions 键 ⊆ 归自己者`, () => {
        expect(keysOf(s.phases)).toEqual([]);
        expect(keysOf(s.commands)).toEqual([]);
        expect(s.privVersion).toBeUndefined();
        expect(keysOf(s.queries)).toEqual(owned.queries);
        for (const k of keysOf(s.actions)) expect(ACTION_OWNER[k as keyof Actions]).toBe(s.id);
        expect(typeof s.endOfDay === 'function' && END_OF_DAY_IO[s.id] === undefined).toBe(false);
      });
    } else {
      it(`${s.id}（真系统）：commands 键集合 == COMMAND_OWNER 归自己者；phases / actions / queries 只填自己的键且 queries 齐全`, () => {
        expect(keysOf(s.commands)).toEqual(owned.commands);
        for (const k of keysOf(s.phases)) expect(PHASE_OWNER[k as PhaseId]).toBe(s.id);
        for (const k of keysOf(s.actions)) expect(ACTION_OWNER[k as keyof Actions]).toBe(s.id);
        expect(keysOf(s.queries)).toEqual(owned.queries);
        // 真系统应实现归自己的全部阶段；WORKPLAN 明确标为 [v2] 的阶段允许暂缺，但必须登记在 DEFERRED_PHASES（打标 v1-playable 后逐项清空）
        const deferred = DEFERRED_PHASES[s.id] ?? [];
        expect(keysOf(s.phases)).toEqual(owned.phases.filter((p) => !deferred.includes(p)));
        // 真系统应提供归自己的全部 actions（core 的 7 个由 TileWriter 提供，不在 System.actions）
        if (s.id !== 'core') expect(keysOf(s.actions)).toEqual(owned.actions);
      });
      it(`${s.id}（真系统）：声明 priv ⇒ 实现 postLoad；endOfDay 只在 END_OF_DAY_IO 的键上`, () => {
        if (s.privVersion !== undefined) { expect(Number.isInteger(s.privVersion) && s.privVersion >= 1).toBe(true); expect(typeof s.postLoad).toBe('function'); }
        if (typeof s.endOfDay === 'function') expect(END_OF_DAY_IO[s.id]).toBeDefined();
        if (END_OF_DAY_IO[s.id] !== undefined) expect(typeof s.endOfDay).toBe('function');
      });
    }
  }
  it('core：phases 恰为 growthScan / uiRefresh，commands 恰为四条，无 priv、无 stub', () => {
    const core = systems[0]!;
    expect(core.id).toBe('core'); expect(core.stub).toBeUndefined(); expect(core.privVersion).toBeUndefined();
    expect(keysOf(core.phases)).toEqual(['growthScan', 'uiRefresh']);
    expect(keysOf(core.commands)).toEqual(['modalAnswer', 'setSpeed', 'setView', 'terrainDone']);
    expect(core.queries).toBeUndefined(); expect(core.actions).toBeUndefined();
  });
  it('跑 25 天后 priv 通过 validatePriv（类型白名单 + 预算），且 priv 键 ⊆ 声明了 privVersion 的系统', () => {
    host.newCity({ name: 'Registry', difficulty: 1, startYear: 1950, seed: 1, terrainSeed: 1, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } });
    runDays(host, 25);
    expect(snapshotCodec.validatePriv(host.state).filter((d) => d.level === 'error')).toEqual([]);
    const declared = new Set(systems.filter((s) => s.privVersion !== undefined).map((s) => s.id));
    for (const k of Object.keys(host.state.priv)) expect(declared.has(k as SystemId), `priv.${k} 的系统未声明 privVersion`).toBe(true);
  });
});

describe('registry: 注册顺序与校验', () => {
  const ALL_STUBS = SYSTEM_ORDER.filter((id) => id !== 'core');
  const params = { name: 'Shuffle', difficulty: 1 as const, startYear: 1950 as const, seed: 77, terrainSeed: 3, terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 } };
  it('任意洗牌顺序传入：systems 按 SYSTEM_ORDER，25 天后哈希一致', () => {
    const make = (order: SystemId[]) => createSim({ systems: order.map((id) => (id === 'core' ? createCoreSystem() : nullSystem(id))), catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: ALL_STUBS });
    const orders: SystemId[][] = [[...SYSTEM_ORDER], [...SYSTEM_ORDER].reverse(), ['zones', 'core', 'events', 'terrain', 'economy', 'placement', 'services', 'utilities', 'transport']];
    const hashes = orders.map((o) => { const h = make(o); expect(h.systems.map((s) => s.id)).toEqual(SYSTEM_ORDER); h.newCity(params); runDays(h, 25); return h.hash('full'); });
    expect(new Set(hashes).size).toBe(1);
  });
  it('声明 privVersion 但无 postLoad 抛错；core 声明 priv 抛错；privVersion 非正整数抛错', () => {
    const base = (): System[] => [createCoreSystem(), ...ALL_STUBS.filter((id) => id !== 'zones').map((id) => nullSystem(id))];
    const mk = (extra: System) => createSim({ systems: [...base(), extra], catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: ALL_STUBS });
    const zonesQ = nullSystem('zones').queries as Partial<Queries>;
    expect(() => mk({ id: 'zones', init() {}, queries: zonesQ, privVersion: 1 })).toThrow(/zones.*postLoad/);
    expect(() => mk({ id: 'zones', init() {}, queries: zonesQ, privVersion: 0, postLoad() {} })).toThrow(/privVersion/);
    expect(() => mk({ id: 'zones', init() {}, queries: zonesQ, privVersion: 2, postLoad() {} })).not.toThrow();
    const badCore: System = { ...createCoreSystem(), privVersion: 1, postLoad() {} };
    expect(() => createSim({ systems: [badCore, ...ALL_STUBS.map((id) => nullSystem(id))], catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: ALL_STUBS })).toThrow(/core 不得声明 priv/);
  });
  it('SimHost.catalogue 与 SimContext.catalogue 是同一对象；q 合并后每键来自 owner', () => {
    const { host, ctx } = createTestContext();
    expect(host.catalogue).toBe(ctx.catalogue); expect(host.catalogue).toBe(CATALOGUE);
    for (const key of Object.keys(QUERY_OWNER) as (keyof Queries)[]) {
      const owner = host.systems.find((s) => s.id === QUERY_OWNER[key])!;
      expect(host.q[key]).toBe(owner.queries![key]);
    }
    expect(host.q).toBe(ctx.q);
  });
});
