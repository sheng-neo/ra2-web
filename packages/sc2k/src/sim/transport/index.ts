// ===== sim/transport/index.ts =====（CONTRACTS §V SimEntries.createTransportSystem；WORKPLAN WP6）
// 交通系统真实现：Queries.transport（可达 / 出行 / 选片 / 计数 / 连接 / 车站 / 桥 / 交通半格）、Actions.markAccessDirty、
// growthVisit 预算衰败、importFrom / exportTo / postLoad / onTilesChanged。无阶段、无命令、无 endOfDay（均不归 transport）。
// 持久私有态只有乘客累计（priv.ts）；其余全部是闭包缓存（runtime.ts），任一读档路径后由 postLoad 重建。
import type { SimEntries } from '../../contracts/entrypoints';
import { inMap, tileX, tileY } from '../../contracts/grid';
import type { System } from '../../contracts/system';
import { growthVisit } from './decay';
import { TRANSPORT_PRIV_VERSION, freshPriv } from './priv';
import { createTransportQuery } from './queries';
import { bind, createRuntime, invalidateAccessAround, rebuildAll } from './runtime';
import { exportTo, importFrom, onTilesChanged, postLoad } from './save';
import { createTripEngine } from './trip';

export { DEFAULT_TRANSPORT_TUNING } from './tuning';
export type { TransportTuning } from './tuning';

export const createTransportSystem = ((): System => {
  const rt = createRuntime();
  const trip = createTripEngine(rt);
  const transport = createTransportQuery(rt, trip);
  return {
    id: 'transport',
    privVersion: TRANSPORT_PRIV_VERSION,
    queries: { transport },
    actions: {
      /** placement 在放置 / 拆除车站等不经 setXbld 也会改变可达性的场合调用；越界索引忽略。 */
      markAccessDirty(tiles) {
        for (const t of tiles) if (inMap(tileX(t), tileY(t))) invalidateAccessAround(rt, t);
      },
    },
    init(ctx) {
      bind(rt, ctx);
      rebuildAll(rt);
      ctx.state.priv.transport = freshPriv();
    },
    importFrom(ctx, doc, diag) { importFrom(rt, ctx, doc, diag); },
    exportTo(ctx, doc) { exportTo(rt, ctx, doc); },
    postLoad(ctx, source) { postLoad(rt, ctx, source); },
    onTilesChanged(ctx, tiles, kind) { onTilesChanged(rt, ctx, tiles, kind); },
    growthVisit(ctx, x, y) { bind(rt, ctx); growthVisit(rt, x, y); },
  };
}) satisfies SimEntries['createTransportSystem'];
