// ===== ui/windows/query.ts =====（WP12b：Query 对话框，spec:ui-art §2.5.2）
// 外壳经 WindowDeps.onTilePicked 把点选的格交给本窗口；anchorOf 找整栋（锚格），字段：名称 / 占地 / 地形 / 海拔 / 分区 /
// 地价·犯罪·污染·交通（五档）/ 电·水（按 XBIT Powerable / Piped 决定 N/A）+ lotAt / plantAt / stationAt + q.services.queryStats(anchor)。
import { FOOTPRINT, anchorOf } from '../../contracts/footprint';
import { XBit, XterClass, ZONE_MASK, tileIndex, tileX, tileY, xterClassOf } from '../../contracts/grid';
import type { WindowDeps, WindowFactory } from '../windowTypes';
import { levelKey } from './format';
import { bindText } from './text';
import { h, replace } from './wdom';

const TERRAIN_KEY: Readonly<Record<number, string>> = {
  [XterClass.Dry]: 'query.terrain.land', [XterClass.Submerged]: 'query.terrain.submerged', [XterClass.Shore]: 'query.terrain.shore',
  [XterClass.Surface]: 'query.terrain.water', [XterClass.Waterfall]: 'query.terrain.waterfall', [XterClass.Stream]: 'query.terrain.stream',
};
const TREE_FIRST = 0x06, TREE_LAST = 0x0c, SMALL_PARK = 0x0d, RUBBLE_FIRST = 0x01, RUBBLE_LAST = 0x04, RADIOACTIVE = 0x05, BUILDING_FIRST = 0x0e;

export type QueryRow = readonly [label: string, value: string];

/** 纯函数：一格的全部查询行（测试与窗口共用）。 */
export function queryRows(deps: WindowDeps, x: number, y: number): QueryRow[] {
  const t = bindText(deps.strings);
  const { state, q, catalogue } = deps.host;
  const L = state.layers;
  const i = tileIndex(x, y);
  const id = L.xbld[i]!;
  const rows: QueryRow[] = [[t('ui.query.tile'), `(${x}, ${y})`]];

  let anchor = i;
  if (id >= BUILDING_FIRST) {
    const a = anchorOf(L, i);
    if (a >= 0) anchor = a;
    const aid = L.xbld[anchor]!;
    const def = catalogue.BUILDINGS[aid];
    rows.push([t('query.name'), def ? t(def.name) : `#${aid}`]);
    const size = FOOTPRINT[aid]!;
    if (size > 1) rows.push([t('ui.query.size'), `${size}×${size}`]);
    if (def && def.residents > 0) rows.push([t('query.residents'), String(def.residents)]);
    if (def && def.jobs > 0) rows.push([t('query.jobs'), String(def.jobs)]);
  } else if (id >= TREE_FIRST && id <= TREE_LAST) rows.push([t('query.name'), t('category.tree')]);
  else if (id === SMALL_PARK) rows.push([t('query.name'), t(catalogue.BUILDINGS[SMALL_PARK]?.name ?? 'category.park')]);
  else if (id >= RUBBLE_FIRST && id <= RUBBLE_LAST) rows.push([t('query.name'), t('category.rubble')]);
  else if (id === RADIOACTIVE) rows.push([t('query.name'), t('category.radioactive')]);
  else rows.push([t('query.name'), t('ui.query.empty')]);

  rows.push([t('query.terrain'), t(TERRAIN_KEY[xterClassOf(L.xter[i]!)] ?? 'query.terrain.land')]);
  rows.push([t('query.altitude'), t('query.feet', { value: q.terrain.altitudeFeet(i) })]);
  rows.push([t('query.zone'), t(`zone.${L.xzon[i]! & ZONE_MASK}`)]);
  rows.push([t('query.landValue'), t(levelKey(q.services.landValue(i)))]);
  rows.push([t('query.crime'), t(levelKey(q.services.crime(i)))]);
  rows.push([t('query.pollution'), t(levelKey(q.services.pollution(i)))]);
  rows.push([t('query.traffic'), t(levelKey(q.transport.trafficAt(x, y)))]);
  const bits = L.xbit[i]!;
  rows.push([t('query.power'), (bits & XBit.Powerable) === 0 ? t('query.na') : q.utilities.hasPower(i) ? t('query.powered') : t('query.noPower')]);
  rows.push([t('query.water'), (bits & XBit.Piped) === 0 ? t('query.na') : q.utilities.watered(i) ? t('query.watered') : t('query.noWater')]);

  const lot = q.zones.lotAt(anchor);
  if (lot) {
    rows.push([t('query.density'), String(lot.level)]);
    rows.push([t('query.tier'), String(lot.tier + 1)]);
    rows.push([t('query.phase'), t(`query.phase.${lot.phase}`)]);
  }
  const plant = q.utilities.plantAt(anchor);
  if (plant) {
    rows.push([t('query.mw'), String(plant.nominalMW)]);
    rows.push([t('query.loadPct'), `${plant.loadPct}%`]);
    rows.push([t('query.ageYears'), String(plant.ageYears)]);
    rows.push([t('query.expires'), plant.expires ? t('ui.yes') : t('ui.no')]);
  }
  const station = q.transport.stationAt(anchor);
  if (station) {
    rows.push([t('ui.query.station'), t(`ui.station.${station.kind}`)]);
    rows.push([t('ui.query.platforms'), String(station.n)]);
  }
  for (const s of q.services.queryStats(anchor)) rows.push([t(s.key), String(s.value)]);
  return rows;
}

export const queryWindow: WindowFactory = (deps) => {
  const t = bindText(deps.strings);
  let tile: { x: number; y: number } | null = null;
  const body = h('div', { cls: 'sc2k-win-queryrows', testid: 'query-rows' });
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-query' }, body);

  function refresh(): void {
    if (!tile) { replace(body, h('div', { cls: 'sc2k-win-muted', text: t('ui.query.hint'), testid: 'query-hint' })); return; }
    const rows = queryRows(deps, tile.x, tile.y);
    replace(body, h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
  }
  const off = deps.onTilePicked((x, y) => {
    if (x < 0 || y < 0 || x > 127 || y > 127) return;
    tile = { x, y };
    el.dataset['tile'] = String(tileIndex(x, y));
    refresh();
  });
  refresh();
  return {
    id: 'query', title: t('window.query'), el, width: 300, refresh,
    destroy: () => { off(); },
  };
};

export { tileX, tileY };
