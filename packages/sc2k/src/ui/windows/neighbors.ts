// ===== ui/windows/neighbors.ts =====（WP12b：邻城窗口，spec:ui-art §2.5 Neighbors 行；只读）
// 3×3 格：中央本城（名 + 人口），四角四个 state.neighbors（按 edge：0 T → 左上，1 R → 右上，2 B → 右下，3 L → 左下），
// 四条边中格显示对应邻城的 connections（道路 / 铁路 / 高速）计数。
import type { NeighborCity } from '../../contracts/state';
import type { WindowFactory } from '../windowTypes';
import { thousands } from './format';
import { bindText } from './text';
import { h, replace } from './wdom';

/** edge → CSS grid 区域（角）与连接数所在边中格。 */
const CORNER_AREA: Readonly<Record<0 | 1 | 2 | 3, string>> = { 0: 'tl', 1: 'tr', 2: 'br', 3: 'bl' };
const EDGE_AREA: Readonly<Record<0 | 1 | 2 | 3, string>> = { 0: 't', 1: 'r', 2: 'b', 3: 'l' };

export const neighborsWindow: WindowFactory = (deps) => {
  const t = bindText(deps.strings);
  const grid = h('div', { cls: 'sc2k-win-neighbors-grid', testid: 'neighbors-grid' });
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-neighbors' }, grid);

  const neighborAt = (edge: 0 | 1 | 2 | 3): NeighborCity | undefined => deps.host.state.neighbors.find((n) => n.edge === edge) ?? deps.host.state.neighbors[edge];
  /** 邻城名：已初始化（name 非空）时优先取本地化键 neighbor.name.<index>（contract-rfc WP5-4），否则用 state 里的原创英文名。 */
  const nameOf = (n: NeighborCity | undefined): string => {
    if (!n || !n.name) return t('ui.neighbors.unnamed');
    const key = `neighbor.name.${n.index}`;
    return deps.strings.has(key) ? t(key) : n.name;
  };

  function refresh(): void {
    const s = deps.host.state;
    const cells: HTMLElement[] = [];
    for (const edge of [0, 1, 2, 3] as const) {
      const n = neighborAt(edge);
      cells.push(h('div', { cls: `sc2k-win-cell sc2k-win-corner sc2k-win-area-${CORNER_AREA[edge]}`, testid: `neighbor-${edge}` },
        h('div', { cls: 'sc2k-win-cityname', text: nameOf(n) }),
        h('div', { cls: 'sc2k-win-muted', text: `${t('ui.population')} ${thousands(n?.population ?? 0)}` })));
      const c = n?.connections ?? { road: 0, rail: 0, highway: 0 };
      cells.push(h('div', { cls: `sc2k-win-cell sc2k-win-edge sc2k-win-area-${EDGE_AREA[edge]}`, testid: `neighbor-conn-${edge}` },
        h('div', { cls: 'sc2k-win-muted', text: t('ui.neighbors.connections') }),
        h('div', { text: `${t('ui.neighbors.road')} ${c.road} · ${t('ui.neighbors.rail')} ${c.rail} · ${t('ui.neighbors.highway')} ${c.highway}` })));
    }
    cells.push(h('div', { cls: 'sc2k-win-cell sc2k-win-center sc2k-win-area-c', testid: 'neighbor-center' },
      h('div', { cls: 'sc2k-win-muted', text: t('ui.neighbors.thisCity') }),
      h('div', { cls: 'sc2k-win-cityname', text: s.cityName || t('ui.neighbors.unnamed') }),
      h('div', { text: `${t('ui.population')} ${thousands(s.census.citySize)}` })));
    replace(grid, ...cells);
  }
  refresh();
  return { id: 'neighbors', title: t('window.neighbors'), el, width: 480, refresh };
};
