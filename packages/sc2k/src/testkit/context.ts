// ===== testkit/context.ts =====（CONTRACTS §U：createTestContext / runDays）
// 空城 ctx：真实 TileWriter + DirtyTracker + 桩 Queries/Actions；opts.systems 给出的系统覆盖对应桩；
// 内部 createSim({ …, snapshot: opts.snapshot ?? snapshotCodec }) —— 与 app/wire.ts 同一注入点。
import { SYSTEM_ORDER } from '../contracts/clock';
import { CityMode, XBit } from '../contracts/grid';
import type { SimHost } from '../contracts/host';
import type { CityState } from '../contracts/state';
import type { NewCityParams, System, SystemId } from '../contracts/system';
import type { CreateTestContextFn, RunDaysFn, TestContext } from '../contracts/testkit';
import { CATALOGUE } from '../data';
import { snapshotCodec } from '../io/snapshot';
import { createCoreSystem, createSim, simContextOf } from '../sim/core';
import { nullSystem } from '../app/stubs/null';

/** 测试默认新城参数（名字为原创占位，不是原版文本）。 */
export const DEFAULT_TEST_PARAMS: NewCityParams = {
  name: 'Testopolis', mayor: 'Tester', difficulty: 1, startYear: 1900, seed: 12345, terrainSeed: 777,
  terrain: { coast: false, river: false, hills: 0, water: 0, trees: 0 },
};
/** 平地海拔（flat 选项）：alt = waterLevel = 4、xter = 0、无 WATER / SALT 位、无树。 */
export const FLAT_ALT = 4;

/** 全图平地：alt=4 无水（spec:terrain §3.7：干地 waterLevel = alt）。 */
export function flattenTerrain(state: CityState): void {
  const L = state.layers;
  L.alt.fill(FLAT_ALT); L.waterLevel.fill(FLAT_ALT); L.xter.fill(0); L.tunnelLevels.fill(0);
  for (let i = 0; i < L.xbit.length; i++) L.xbit[i] = L.xbit[i]! & ~(XBit.Water | XBit.SaltWater) & 0xff;
  for (let i = 0; i < L.xbld.length; i++) if (L.xbld[i]! >= 0x06 && L.xbld[i]! <= 0x0c) L.xbld[i] = 0;   // 清树（不经 TileWriter：这是夹具初始化，不是模拟写入）
  state.terrain.seaLevel = Math.min(state.terrain.seaLevel, FLAT_ALT);
}

export const createTestContext: CreateTestContextFn = (opts = {}): TestContext => {
  const profile = opts.profile ?? 'realistic';
  const given = new Map<SystemId, System>((opts.systems ?? []).map((s) => [s.id, s]));
  const systems: System[] = SYSTEM_ORDER.map((id) => given.get(id) ?? (id === 'core' ? createCoreSystem() : nullSystem(id, profile)));
  const host: SimHost = createSim({
    systems,
    catalogue: CATALOGUE,
    snapshot: opts.snapshot ?? snapshotCodec,
    tuning: opts.tuning,
    stubAllowlist: SYSTEM_ORDER.filter((id) => id !== 'core'),
  });
  const params: NewCityParams = { ...DEFAULT_TEST_PARAMS, ...(opts.seed !== undefined ? { seed: opts.seed } : {}), ...opts.params };
  host.newCity(params);
  const ctx = simContextOf(host);
  const state = ctx.state;
  if (opts.flat !== false) flattenTerrain(state);
  // 测试上下文直接处于城市模式（不经 terrainDone 命令，commandLog 保持为空）
  state.clock.mode = CityMode.City;
  // 若 state 被夹具改过，让桩 / 缓存重新绑定（nullSystem 的 postLoad 不消费 PRNG、不改图层）
  for (const s of host.systems) s.postLoad?.(ctx, 'snapshot');
  host.dirty.markBulk('all');
  host.drainEvents();
  return { ctx, host, state };
};

/** 无预算限制地推进 days 天（speed 临时设为 5，不经 dispatch，所以不写 commandLog；结束后恢复原速度）；遇挂起自动 modalClosed。 */
export const runDays: RunDaysFn = (host, days) => {
  const clock = host.state.clock;
  const target = clock.age + Math.max(0, days | 0);
  const prevSpeed = clock.speed;
  clock.speed = 5;
  let guard = 0;
  try {
    while (clock.age < target) {
      if (clock.modalPause > 0) { host.modalClosed(); }
      else {
        const r = host.advance(0, () => 0, { budgetMs: Infinity, maxDaysPerFrame: Math.min(10, target - clock.age) });
        if (r.suspended) host.modalClosed();
      }
      if (++guard > days * 64 + 1024) throw new Error(`runDays: 推进停滞（age ${clock.age}/${target}，mode ${clock.mode}，modalPause ${clock.modalPause}）`);
    }
  } finally { clock.speed = prevSpeed; }
};
