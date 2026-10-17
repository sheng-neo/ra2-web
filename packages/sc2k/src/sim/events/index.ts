// ===== sim/events/index.ts =====（CONTRACTS §V SimEntries.createEventsSystem；WORKPLAN WP13 [v1]）
// 事件系统：天气、五种灾害与状态机、建筑毁损、警 / 消调度、科技发明、报纸最小版、XTXT 标记合成 / 剥离。
// 阶段 techCheck / weatherAndDisaster / news；tick disasterTick / thingsTick；命令 requestDisaster / dispatch；
// 查询 tech / disasters / news；Actions destroyStructure / news；模态 disasterAlert / newspaper / extraPaper。
import type { SimEntries } from '../../contracts/entrypoints';
import { TileMarker } from '../../contracts/grid';
import type { System } from '../../contracts/system';
import { TileClass, classOf, peekPriv, tuningOf } from './common';
import type { EventsRuntime } from './common';
import { dispatch, onModalAnswer, requestDisaster } from './commands';
import { destroyStructure } from './destroy';
import { consumePending, disasterTick } from './machine';
import { pushStory } from './news';
import { news, techCheck, weatherAndDisaster } from './phases';
import { PRIV_VERSION } from './priv';
import { makeQueries } from './queries';
import { exportEvents, importEvents, initEvents, postLoadEvents } from './save';

export { DEFAULT_EVENTS_TUNING } from './tuning';
export type { EventsTuning } from './tuning';
export { PRIV_VERSION as EVENTS_PRIV_VERSION } from './priv';

export const createEventsSystem = ((): System => {
  const rt: EventsRuntime = { ctx: null };
  return {
    id: 'events',
    privVersion: PRIV_VERSION,
    phases: { techCheck, weatherAndDisaster, news },
    disasterTick(ctx) { rt.ctx = ctx; disasterTick(ctx, tuningOf(ctx)); },
    thingsTick(ctx) { rt.ctx = ctx; consumePending(ctx, tuningOf(ctx)); },
    onModalAnswer,
    commands: {
      requestDisaster: (ctx, cmd) => requestDisaster(ctx, cmd),
      dispatch: (ctx, cmd) => dispatch(ctx, tuningOf(ctx), cmd),
    },
    queries: makeQueries(rt),
    actions: {
      // 绑定前（init / postLoad 之前）调用是编程错误；按空操作处理而不抛错，与桩一致。
      destroyStructure: (x, y, cause) => { const ctx = rt.ctx; if (ctx) destroyStructure(ctx, tuningOf(ctx), x, y, cause); },
      news: (type, value) => { const ctx = rt.ctx; if (ctx) pushStory(ctx, tuningOf(ctx).news, type, value); },
    },
    init: (ctx, p) => initEvents(rt, ctx, p),
    importFrom: (ctx, doc, diag) => importEvents(rt, ctx, doc, diag),
    exportTo: (ctx, doc) => exportEvents(ctx, doc),
    postLoad: (ctx, source) => postLoadEvents(rt, ctx, source),
    /** 别的系统推平了正在烧的格（推土开防火带）：立即熄灭该格，渲染不残留火焰。 */
    onTilesChanged(ctx, tiles, kind) {
      if (kind !== 'building') return;
      const P = peekPriv(ctx.state);
      if (!P) return;
      const xbld = ctx.state.layers.xbld;
      for (const i of tiles) if (P.marker[i] === TileMarker.Fire && classOf(xbld[i]!) === TileClass.Empty) { P.marker[i] = 0; P.fuel[i] = 0; }
    },
  };
}) satisfies SimEntries['createEventsSystem'];
