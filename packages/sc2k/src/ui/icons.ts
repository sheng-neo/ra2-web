// ===== ui/icons.ts =====（spec:ui-art §3.9.2 UI 图标；INT-B：工具栏 / 子工具条 / 状态栏 / Map 图层按钮改用 WP9 的 UiIconId 位图）
// 位图来自程序化 provider（createProceduralProvider().bitmap({ kind: 'ui', id }, 'M')，24×24 索引色），经 <canvas> 转成 data URL 后作 <img> 使用；
// 每个 id 只转换一次（模块级缓存）。无 2D 上下文（happy-dom 测试）/ provider 无该 id / 任何异常 → 返回 null，调用方回退到字形占位。
import type { SpriteProvider } from '../contracts/render';
import { MAP_LAYER_MODES, UiIconId } from '../contracts/render';
import type { MapLayerMode } from '../contracts/render';
import type { CatalogueApi, ToolGroup, ToolId } from '../contracts/catalogue';
import type { WindowId } from '../contracts/shell';
import { createProceduralProvider } from '../art';
import { h } from './dom';

export const ICON_PX = 24;

/** 工具组 → 固定图标。 */
export const GROUP_ICON: Readonly<Record<ToolGroup, UiIconId>> = {
  bulldozer: UiIconId.Bulldozer, nature: UiIconId.Landscape, dispatch: UiIconId.Emergency, roads: UiIconId.Roads, power: UiIconId.Power, water: UiIconId.Water,
  rail: UiIconId.Rails, ports: UiIconId.Ports, residential: UiIconId.Residential, commercial: UiIconId.Commercial, industrial: UiIconId.Industrial,
  education: UiIconId.Education, services: UiIconId.Services, parks: UiIconId.Recreation, signs: UiIconId.Signs, query: UiIconId.Query, rewards: UiIconId.Rewards, center: UiIconId.Centering,
};
export const VIEW_ICON: Readonly<Record<'rotCcw' | 'rotCw' | 'zoomOut' | 'zoomIn' | 'help', UiIconId>> = {
  rotCcw: UiIconId.RotateCcw, rotCw: UiIconId.RotateCw, zoomOut: UiIconId.ZoomOut, zoomIn: UiIconId.ZoomIn, help: UiIconId.Help,
};
export const WINDOW_ICON: Readonly<Partial<Record<WindowId, UiIconId>>> = {
  map: UiIconId.MapWin, graphs: UiIconId.GraphsWin, population: UiIconId.PopulationWin, industries: UiIconId.IndustriesWin, neighbors: UiIconId.NeighborsWin, budget: UiIconId.BudgetWin,
};
export const TOGGLE_ICON: Readonly<Record<'buildings' | 'signs' | 'infrastructure' | 'zones' | 'underground', UiIconId>> = {
  buildings: UiIconId.ShowBuildings, signs: UiIconId.ShowSigns, infrastructure: UiIconId.ShowInfra, zones: UiIconId.ShowZones, underground: UiIconId.ShowUnderground,
};
export const weatherIconId = (trend: number): number => UiIconId.WeatherBase + (((trend | 0) % 12) + 12) % 12;
export const speedIconId = (speed: number): number => UiIconId.SpeedBase + Math.max(0, Math.min(4, (speed | 0) - 1));
export const mapLayerIconId = (mode: MapLayerMode): number | null => { const k = MAP_LAYER_MODES.indexOf(mode); return k < 0 ? null : UiIconId.MapLayerBase + k; };
/** 子工具图标：按目录表 TOOLS 下标（WP9 约定 SubToolBase + index）。 */
export const subToolIconId = (cat: Pick<CatalogueApi, 'TOOLS'>, id: ToolId): number | null => { const k = cat.TOOLS.findIndex((d) => d.id === id); return k < 0 ? null : UiIconId.SubToolBase + k; };

let provider: SpriteProvider | null = null;
const cache = new Map<number, string | null>();
let disabledAll = false;

/** 测试 / 热切换用：清空缓存（并可整体关闭位图图标以验证字形回退）。 */
export function resetIconCache(opts: { disable?: boolean } = {}): void { cache.clear(); provider = null; disabledAll = !!opts.disable; }

/** 图标的 data URL（24×24 PNG）；不可用时 null。 */
export function iconDataUrl(id: number): string | null {
  if (disabledAll) return null;
  if (cache.has(id)) return cache.get(id) ?? null;
  let url: string | null = null;
  try {
    provider ??= createProceduralProvider();
    const bmp = provider.bitmap({ kind: 'ui', id }, 'M');
    if (bmp && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = bmp.w; canvas.height = bmp.h;
      const ctx = canvas.getContext('2d');
      if (ctx && typeof ImageData !== 'undefined') {
        const pal = provider.palette.rgba;
        const rgba = new Uint8ClampedArray(bmp.w * bmp.h * 4);
        for (let k = 0; k < bmp.data.length; k++) {
          const v = bmp.data[k]!;
          const on = bmp.opaque ? bmp.opaque[k] !== 0 : v !== 0;
          if (!on) continue;
          rgba[k * 4] = pal[v * 4]!; rgba[k * 4 + 1] = pal[v * 4 + 1]!; rgba[k * 4 + 2] = pal[v * 4 + 2]!; rgba[k * 4 + 3] = 255;
        }
        ctx.putImageData(new ImageData(rgba, bmp.w, bmp.h), 0, 0);
        const s = canvas.toDataURL('image/png');
        if (typeof s === 'string' && s.startsWith('data:image')) url = s;
      }
    }
  } catch { url = null; }
  cache.set(id, url);
  return url;
}

/** <img class="sc2k-ico">；不可用时 null（调用方回退字形）。 */
export function iconEl(id: number | null, size = ICON_PX, cls = ''): HTMLImageElement | null {
  if (id === null) return null;
  const url = iconDataUrl(id);
  if (!url) return null;
  const img = h('img', { class: `sc2k-ico${cls ? ' ' + cls : ''}`, attrs: { src: url, alt: '', draggable: 'false', 'aria-hidden': 'true' } });
  img.width = size; img.height = size;
  return img;
}
/** 位图优先，否则字形占位。 */
export const iconOrGlyph = (id: number | null, glyph: () => HTMLElement, size = ICON_PX, cls = ''): HTMLElement => iconEl(id, size, cls) ?? glyph();
