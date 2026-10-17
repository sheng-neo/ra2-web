// ===== app/stubs/null.ts =====（裁定 1：nullSystem 的实现放这里，contracts/system.ts 只留注释）
// 桩系统：stub: true、无阶段、无命令（因此对其命令 host.dispatch 返回 NOT_IMPLEMENTED_RESULT）、无 priv。
//  - queries 只填自己 id 对应的键（events 同时拥有 tech / disasters / news），actions 只填 ACTION_OWNER 归自己的键；两者取自 stubQueries / stubActions。
//  - 桩在 init(ctx) / postLoad(ctx) 时绑定 ctx，查询读 ctx.state；绑定前（例如 app 在玩家点"新城"之前就开始渲染空地图）回退到一份
//    私有的空城 createCityState() 上作答（markers 全零、hasPower false …），不抛错、不写任何外部状态。
//    子对象在构造期就必须存在（createSim 注册时校验键集合），因此用转发壳：每个方法在调用时才解析到当前绑定的桩实现。
import type { System, SystemId, SimContext } from '../../contracts/system';
import type { Queries } from '../../contracts/queries';
import { QUERY_OWNER } from '../../contracts/queries';
import type { Actions } from '../../contracts/actions';
import { ACTION_OWNER } from '../../contracts/actions';
import type { StubProfile, StubActions } from '../../contracts/testkit';
import { stubQueries } from './stubQueries';
import { stubActions } from './stubActions';

const QUERY_KEYS = Object.keys(QUERY_OWNER) as ReadonlyArray<keyof Queries>;
const ACTION_KEYS = Object.keys(ACTION_OWNER) as ReadonlyArray<keyof Actions>;

/** 方法名表：转发壳需要在绑定前就把全部方法挂好（用一份"干跑"的桩对象取方法名，避免手写清单漂移）。 */
function methodNames<T extends object>(o: T): ReadonlyArray<keyof T & string> {
  return Object.keys(o).filter((k) => typeof (o as Record<string, unknown>)[k] === 'function') as Array<keyof T & string>;
}

export function nullSystem(id: SystemId, profile: StubProfile = 'realistic'): System {
  let boundQ: Queries | null = null;
  let boundA: StubActions | null = null;
  /** 绑定前的回退：本桩私有的空城（惰性创建；只在 init 之前被读到）。 */
  let fallbackState: ReturnType<typeof createCityState> | null = null;
  let fallbackQ: Queries | null = null;
  let fallbackA: StubActions | null = null;
  const currentQ = (): Queries => boundQ ?? (fallbackQ ??= stubQueries(profile, (fallbackState ??= createCityState()), probeCatalogue()));
  const currentA = (): StubActions => boundA ?? (fallbackA ??= stubActions((fallbackState ??= createCityState())));

  // 干跑一次取方法名（用空城 state 的占位实现；只用于枚举键，不保留引用）
  const probe = stubQueries(profile, probeState(), probeCatalogue());
  const queries: Partial<Queries> = {};
  for (const key of QUERY_KEYS) {
    if (QUERY_OWNER[key] !== id) continue;
    const shell: Record<string, (...args: unknown[]) => unknown> = {};
    for (const m of methodNames(probe[key] as object)) {
      shell[m] = (...args: unknown[]) => {
        const sub = currentQ()[key] as unknown as Record<string, (...a: unknown[]) => unknown>;
        return sub[m]!(...args);
      };
    }
    (queries as Record<string, unknown>)[key] = shell;
  }

  const actionProbe = stubActions(probeState());
  const actions: Partial<Actions> = {};
  for (const key of ACTION_KEYS) {
    if (ACTION_OWNER[key] !== id) continue;
    if (!(key in actionProbe)) continue;   // core 的 set* / emit 不在桩里
    (actions as Record<string, unknown>)[key] = (...args: unknown[]) =>
      (currentA() as unknown as Record<string, (...x: unknown[]) => unknown>)[key]!(...args);
  }

  const bind = (ctx: SimContext): void => {
    boundQ = stubQueries(profile, ctx.state, ctx.catalogue);
    boundA = stubActions(ctx.state);
  };

  const sys: System = {
    id,
    stub: true,
    // economy 桩：开局经费率 100%（contract-rfc WP6-1：桩下 funding 全零等于"交通预算 0%"，transport 的衰败会在一个月内把路网全变废墟）。
    // 三档桩都在 init 写 100、查询读原值（transport/decay.test 在各档下都要求 setFunding 的值原样可读），不在读取时改写；
    // .SC2 路径桩无经费率落点（真 economy 才读写 MISC），postLoad('sc2') 同样回到 100 以保 hash('sc2') 往返；快照路径沿用快照值。
    init: (ctx) => { bind(ctx); if (id === 'economy') ctx.state.economy.funding.fill(100); },
    postLoad: (ctx, source) => { bind(ctx); if (id === 'economy' && source === 'sc2') ctx.state.economy.funding.fill(100); },   // 任一读档路径后重新绑定（state 对象可能被替换）；不消费 PRNG、不改图层
  };
  if (Object.keys(queries).length > 0) (sys as { queries?: Partial<Queries> }).queries = queries;
  if (Object.keys(actions).length > 0) (sys as { actions?: Partial<Actions> }).actions = actions;
  return sys;
}

// ---- 干跑用的最小占位（只为枚举方法名；不触碰 createCityState 之外的任何上层模块） ----
import { createCityState } from '../../contracts/state';
import type { CatalogueApi } from '../../contracts/catalogue';
import { FOOTPRINT } from '../../contracts/footprint';
let probeStateCache: ReturnType<typeof createCityState> | null = null;
const probeState = (): ReturnType<typeof createCityState> => (probeStateCache ??= createCityState());
const PROBE_CATALOGUE: CatalogueApi = {
  BUILDINGS: [], TOOLS: [], FOOTPRINT, CATEGORY: [],
  TECH_BASE_YEAR: { gas: 0, nuclear: 0, solar: 0, wind: 0, microwave: 0, fusion: 0, airport: 0, highways: 0, buses: 0, subways: 0, waterTreatment: 0, desalinization: 0, arcoPioneer: 0, arcoCanopy: 0, arcoDusk: 0, arcoSkyward: 0 },
  ORDINANCES: [],
  toolById: () => undefined, buildingByKey: () => undefined,
};
const probeCatalogue = (): CatalogueApi => PROBE_CATALOGUE;
