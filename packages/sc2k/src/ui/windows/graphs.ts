// ===== ui/windows/graphs.ts =====（WP12b：Graphs 窗口，spec:ui-art §2.5、spec:economy-budget §2.14、spec:file-formats §2.4.2）
// 直接读 state.xgrp（16 × 52 i32：每条 12 个月值 + 20 个半年值 + 20 个五年值）；16 条序列复选框 + 颜色图例 + 1 / 10 / 100 年三选一 + 2D canvas 折线。
// 每条序列按自身最大值归一（单位各异，共享纵轴无意义）。假定每段内下标升序 = 时间升序（最后一个 = 最新）；经济模块若相反，翻转 NEWEST_LAST 即可。
import type { WindowFactory } from '../windowTypes';
import { bindText } from './text';
import { checkbox, h } from './wdom';

export const XGRP_SERIES_COUNT = 16, XGRP_STRIDE = 52;
export const NEWEST_LAST = true;
/** 16 条序列（spec:economy §2.14 顺序）及原创图例色。 */
export const GRAPH_SERIES: ReadonlyArray<{ key: string; color: string }> = [
  { key: 'graph.citySize', color: '#f2f2f2' }, { key: 'graph.residents', color: '#59c35c' }, { key: 'graph.commerce', color: '#4f8df7' }, { key: 'graph.industry', color: '#f0c419' },
  { key: 'graph.traffic', color: '#ff8c42' }, { key: 'graph.pollution', color: '#9b6b3a' }, { key: 'graph.value', color: '#2fd3c6' }, { key: 'graph.crime', color: '#e5484d' },
  { key: 'graph.powerPct', color: '#ffe066' }, { key: 'graph.waterPct', color: '#6fb6ff' }, { key: 'graph.health', color: '#ff7eb6' }, { key: 'graph.education', color: '#b388ff' },
  { key: 'graph.unemployment', color: '#c0c0c0' }, { key: 'graph.gnp', color: '#8bd450' }, { key: 'graph.nationalPop', color: '#d4a373' }, { key: 'graph.fedRate', color: '#ff5fa2' },
];
/** 三档：段内偏移与点数（12 / 20 / 20）。 */
export const GRAPH_RANGES = [
  { key: 'ui.graphs.range1', offset: 0, count: 12 },
  { key: 'ui.graphs.range10', offset: 12, count: 20 },
  { key: 'ui.graphs.range100', offset: 32, count: 20 },
] as const;
export type GraphRange = 0 | 1 | 2;
export const GRAPH_W = 320, GRAPH_H = 160, GRAPH_PAD = 8;
const DEFAULT_SELECTED = [0, 1, 2, 3];

/** 序列 s 在档 r 下的点值（长度 12 / 20 / 20，时间升序）。 */
export function graphSeries(xgrp: ArrayLike<number>, series: number, range: GraphRange): number[] {
  const { offset, count } = GRAPH_RANGES[range];
  const base = series * XGRP_STRIDE + offset;
  const out = new Array<number>(count);
  for (let k = 0; k < count; k++) out[k] = xgrp[base + (NEWEST_LAST ? k : count - 1 - k)] ?? 0;
  return out;
}

/** 折线像素点：x 均分、y 按本序列最大值（≥ 1）归一到绘图区高度。 */
export function polylinePoints(values: readonly number[], w = GRAPH_W, h = GRAPH_H, pad = GRAPH_PAD): Array<[number, number]> {
  const n = values.length;
  if (n === 0) return [];
  let max = 1;
  for (const v of values) if (v > max) max = v;
  const innerW = w - 2 * pad, innerH = h - 2 * pad;
  return values.map((v, k) => [pad + (n === 1 ? 0 : (k * innerW) / (n - 1)), pad + innerH - (Math.max(0, v) / max) * innerH]);
}

/** 画网格 + 若干折线（纯绘制，无状态）。 */
export function drawGraph(ctx: CanvasRenderingContext2D, lines: ReadonlyArray<{ values: readonly number[]; color: string }>, w = GRAPH_W, h = GRAPH_H, pad = GRAPH_PAD): void {
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#30404c';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad + ((h - 2 * pad) * g) / 4 + 0.5;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }
  for (const line of lines) {
    const pts = polylinePoints(line.values, w, h, pad);
    if (pts.length === 0) continue;
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([x, y], k) => { if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
  }
}

export const graphsWindow: WindowFactory = (deps) => {
  const t = bindText(deps.strings);
  const selected = new Set<number>(DEFAULT_SELECTED);
  let range: GraphRange = 0;
  let visible = false;
  const canvas = h('canvas', { width: GRAPH_W, height: GRAPH_H, cls: 'sc2k-win-canvas sc2k-win-graph', testid: 'graphs-canvas' });

  const legend = h('div', { cls: 'sc2k-win-legend' }, ...GRAPH_SERIES.map((s, k) => {
    const box = checkbox(t(s.key), selected.has(k), (on) => { if (on) selected.add(k); else selected.delete(k); draw(); }, { testid: `graphs-series-${k}` });
    box.prepend(h('i', { cls: 'sc2k-win-swatch', style: { background: s.color } }));
    return box;
  }));
  const rangeBtns = GRAPH_RANGES.map((r, k) => {
    const input = h('input', { type: 'radio', name: 'sc2k-graph-range', checked: k === range, testid: `graphs-range-${k}` });
    input.addEventListener('change', () => { if (input.checked) { range = k as GraphRange; draw(); } });
    return h('label', { cls: 'sc2k-win-check' }, input, h('span', { text: t(r.key) }));
  });

  function draw(): void {
    const xgrp = deps.host.state.xgrp;
    const lines = [...selected].sort((a, b) => a - b).map((k) => ({ values: graphSeries(xgrp, k, range), color: GRAPH_SERIES[k]!.color }));
    canvas.dataset['points'] = String(GRAPH_RANGES[range].count);
    canvas.dataset['series'] = String(lines.length);
    canvas.dataset['range'] = String(range);
    const ctx = canvas.getContext('2d');
    if (ctx) drawGraph(ctx, lines);
  }

  const el = h('div', { cls: 'sc2k-win-body sc2k-win-graphs' },
    h('div', { cls: 'sc2k-win-row sc2k-win-ranges' }, ...rangeBtns),
    canvas,
    legend);
  draw();
  return {
    id: 'graphs', title: t('window.graphs'), el, width: 560,
    refresh: () => { if (visible) draw(); },
    onShow: () => { visible = true; draw(); },
    onHide: () => { visible = false; },
  };
};
