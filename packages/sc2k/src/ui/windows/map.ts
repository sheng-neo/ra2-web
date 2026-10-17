// ===== ui/windows/map.ts =====（WP12b：Map 窗口，spec:ui-art §2.5 / §2.5.1）
// 左侧 15 个图层按钮（MAP_LAYER_MODES）+ 128×128 小地图（CSS 放大 2× = 256×256，image-rendering: pixelated）+ 视口矩形；
// 像素由 renderer.minimap(mode, out) 填充（着色归渲染器），本窗口只 putImageData；点击把视图居中到该格（renderer.goto）。
// 缺 2D 上下文（测试环境）时不画，但仍调用 minimap 并在 canvas 上记录 data-layer。
import { MAP_LAYER_MODES } from '../../contracts/render';
import type { MapLayerMode } from '../../contracts/render';
import type { WindowFactory } from '../windowTypes';
import { bindText } from './text';
import { btn, h } from './wdom';

export const MINIMAP_SIZE = 128, MINIMAP_SCALE = 2;
/** 视口矩形的半边长（格），按缩放档近似（渲染器 API 不暴露视口像素尺寸）。 */
export const VIEW_HALF_TILES: readonly number[] = [40, 24, 14, 8, 5];

export const mapWindow: WindowFactory = (deps) => {
  const t = bindText(deps.strings);
  let mode: MapLayerMode = 'structures';
  let visible = false;
  const buf = new Uint8ClampedArray(MINIMAP_SIZE * MINIMAP_SIZE * 4);
  const canvas = h('canvas', {
    width: MINIMAP_SIZE, height: MINIMAP_SIZE, cls: 'sc2k-win-canvas sc2k-win-minimap', testid: 'map-canvas', title: t('ui.map.clickHint'),
    style: { width: `${MINIMAP_SIZE * MINIMAP_SCALE}px`, height: `${MINIMAP_SIZE * MINIMAP_SCALE}px`, imageRendering: 'pixelated' },
  });
  const buttons = new Map<MapLayerMode, HTMLButtonElement>();
  const column = h('div', { cls: 'sc2k-win-layers' }, ...MAP_LAYER_MODES.map((m) => {
    const b = btn(t(`layer.${m}`), () => { mode = m; draw(); }, { testid: `map-layer-${m}` });
    buttons.set(m, b);
    return b;
  }));

  function draw(): void {
    deps.renderer.minimap(mode, buf);
    canvas.dataset['layer'] = mode;
    for (const [m, b] of buttons) b.classList.toggle('sc2k-win-active', m === mode);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(buf, MINIMAP_SIZE, MINIMAP_SIZE), 0, 0);
    const v = deps.renderer.getView();
    const half = VIEW_HALF_TILES[v.zoom] ?? 8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(v.centerX - half) + 0.5, Math.round(v.centerY - half) + 0.5, half * 2, half * 2);
  }

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const w = r.width || MINIMAP_SIZE * MINIMAP_SCALE, hgt = r.height || MINIMAP_SIZE * MINIMAP_SCALE;
    const x = Math.max(0, Math.min(MINIMAP_SIZE - 1, Math.floor(((e.clientX - r.left) / w) * MINIMAP_SIZE)));
    const y = Math.max(0, Math.min(MINIMAP_SIZE - 1, Math.floor(((e.clientY - r.top) / hgt) * MINIMAP_SIZE)));
    deps.renderer.goto(x, y, false);
    draw();
  });

  const el = h('div', { cls: 'sc2k-win-body sc2k-win-map' }, column, h('div', { cls: 'sc2k-win-mapwrap' }, canvas));
  draw();
  return {
    id: 'map', title: t('window.map'), el, width: 420,
    refresh: () => { if (visible) draw(); },
    onShow: () => { visible = true; draw(); },
    onHide: () => { visible = false; },
  };
};
