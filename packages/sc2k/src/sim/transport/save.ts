// ===== sim/transport/save.ts =====（spec:transport §3.2 读档重建、§2.13 存档怪癖、§3.7；CONTRACTS §H importFrom / exportTo / postLoad / onTilesChanged）
// 读档：真源层由 core 拷贝，本模块只重建缓存（postLoad）并在 .SC2 导入时清掉不再落在网络格上的陈旧 0xFA（§4.19 的温和版：不信任也不重写；
// 唯一例外：无侧表的灾害中存档里被灾害标记覆盖的边缘连接格，按几何补回，见 importFrom）。
// 写档：MISC 0x1024 连接格数（Σ tiles）、MISC 0x0FE8 地铁格数。交通六线预算块（27 × i32）归 economy，本模块不碰。
// onTilesChanged：以影子层 diff 出 old → new，增量维护 roadTileCounts、24 偏移可达缓存、车站登记表脏标志、边缘格陈旧 0xFA。
import { tileX, tileY } from '../../contracts/grid';
import { MISC, miscGet, miscSet } from '../../contracts/io';
import type { Sc2Document } from '../../contracts/io';
import { isStationTile } from '../../contracts/net';
import type { Diagnostic, PostLoadSource, SimContext, TileChangeKind } from '../../contracts/system';
import { clearStaleMark, connectionSummary, isEdgeTile, restoreCoveredConnections, subwayTileCount } from './connections';
import { migratePriv } from './priv';
import { bind, bumpCounts, invalidateAccessAround, isAccessTile, rebuildAll } from './runtime';
import type { Runtime } from './runtime';

export function postLoad(rt: Runtime, ctx: SimContext, _source: PostLoadSource): void {
  bind(rt, ctx);
  rebuildAll(rt);
  migratePriv(ctx.state);
}

/**
 * .SC2 导入（IMPORT_ORDER 在 core、events 之后）：清理非网络格上的 0xFA；无侧表的存档（第三方 / compat，MISC 0x1054 = 0）里被灾害标记覆盖的
 * 边缘连接格按几何补回 0xFA（上限 = 存档 MISC 0x1024 连接格数 − 现有）；本项目存档的 0xFA 由 events 的侧表精确恢复。缓存由随后的 postLoad('sc2') 重建。
 */
export function importFrom(rt: Runtime, ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void {
  bind(rt, ctx);
  const L = ctx.state.layers;
  let cleared = 0;
  for (let i = 0; i < L.xtxt.length; i++) if (clearStaleMark(ctx.state, i)) cleared++;
  if (cleared > 0) diag.push({ level: 'info', code: 'transport.staleConnectionMark', message: `清除了 ${cleared} 个不在网络格上的邻城连接标记（XTXT 0xFA）` });
  let restored = 0;
  if (miscGet(doc.misc, MISC.prngMarker) === 0) {
    const budget = miscGet(doc.misc, MISC.connectionTiles) - connectionSummary(ctx.state).total;
    if (budget > 0) restored = restoreCoveredConnections(ctx.state, (i) => ctx.q.disasters.marker(i) !== 0, budget);
    if (restored > 0) diag.push({ level: 'info', code: 'transport.connectionRestored', message: `按地图边缘几何补回 ${restored} 个被灾害标记覆盖的邻城连接标记（XTXT 0xFA）` });
  }
  if (cleared > 0 || restored > 0) ctx.act.layerChanged('xtxt');
  migratePriv(ctx.state);
}

export function exportTo(rt: Runtime, ctx: SimContext, doc: Sc2Document): void {
  bind(rt, ctx);
  miscSet(doc.misc, MISC.connectionTiles, connectionSummary(ctx.state).total);
  miscSet(doc.misc, MISC.subwayCount, subwayTileCount(ctx.state));
}

/** 阶段 / 命令末的批量扇出。 */
export function onTilesChanged(rt: Runtime, ctx: SimContext, tiles: ReadonlyArray<number>, kind: TileChangeKind): void {
  bind(rt, ctx);
  const L = ctx.state.layers;
  if (kind === 'building') {
    let xtxtTouched = false;
    for (const i of tiles) {
      const old = rt.shadow[i]!, nw = L.xbld[i]!;
      if (old === nw) continue;
      rt.shadow[i] = nw;
      bumpCounts(rt, old, nw);
      if (isAccessTile(old) !== isAccessTile(nw)) invalidateAccessAround(rt, i);
      if (isStationTile(old) || isStationTile(nw)) rt.stationsDirty = true;
      const x = tileX(i), y = tileY(i);
      if (isEdgeTile(x, y) && clearStaleMark(ctx.state, i)) xtxtTouched = true;
    }
    if (xtxtTouched) ctx.act.layerChanged('xtxt');
  } else if (kind === 'zone') {
    // 角标变化可能改变 2×2 车站的归并（§2.9.1）
    for (const i of tiles) {
      if (rt.station[i] !== 0 || isStationTile(L.xbld[i]!)) { rt.stationsDirty = true; break; }
    }
  }
}
