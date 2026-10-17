// ===== app/stubs/stubRenderer.ts =====（CONTRACTS §V RenderEntry.createRenderer 的 WP0 桩；WP11 的 render/pixi 接手）
// RendererApi 的最小实现：attach 创建 <canvas>（2D 上下文），frame 时用 stubScene + stubCompositor 对当前视口做全量 CPU 合成并 putImageData。
// 只在"有脏格 / 整层标志 / 视图或来源变化 / 尺寸变化"时重绘；其余方法最小实现；stats() 返回零（桩不做性能门禁）。
// 相机约定（contracts/render.ts）：screenOf = worldToScreen(x,y,alt) + 相机偏移；pick 先减同一偏移再交给 SceneCompiler.pick。
import type { RendererApi } from '../../contracts/rendererApi';
import type { ActorSprite, ArtScale, MapLayerMode, RenderSnapshot, RenderSource, RendererStats, SpriteProvider, ViewState } from '../../contracts/render';
import { ZOOM_TABLE, mapCanvasSize } from '../../contracts/render';
import type { PlacementPreview } from '../../contracts/commands';
import { XBit, tileIndex } from '../../contracts/grid';
import { stubSceneCompiler } from './stubScene';
import { stubCpuCompositor } from './stubCompositor';
import { createStubProvider } from './stubProvider';

/** 画布底色（索引 0 透明处的填充），原创取值：深蓝灰。 */
const BG: readonly [number, number, number] = [16, 24, 32];
const DEFAULT_VIEW: ViewState = {
  zoom: 2, rotation: 0, centerX: 64, centerY: 64, underground: false,
  show: { buildings: true, signs: true, infrastructure: true, zones: true }, mapLayer: null,
};
const cloneView = (v: ViewState): ViewState => ({ ...v, show: { ...v.show } });

export function createStubRenderer(): RendererApi {
  let hostEl: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx2d: CanvasRenderingContext2D | null = null;
  let source: RenderSource | null = null;
  let primary: SpriteProvider = createStubProvider();
  let fallback: SpriteProvider | null = null;
  let view: ViewState = cloneView(DEFAULT_VIEW);
  let needsRedraw = true;
  let camX = 0, camY = 0;            // 相机偏移：屏幕像素 = 地图像素 + (camX, camY)
  let lastSnap: RenderSnapshot | null = null;
  /** 桩只保存、不绘制：预览 / 角色 / 热力层（真渲染器消费）。 */
  const extras: { preview: PlacementPreview | null; actors: readonly ActorSprite[]; heat: MapLayerMode | null } = { preview: null, actors: [], heat: null };
  const onResize = (): void => { resize(); };

  /** 两级回退：primary 原生档 → fallback 原生档；都没有则 primary（返回 null 时合成器跳过）。 */
  const providerFor = (scale: ArtScale): SpriteProvider =>
    primary.nativeScales.has(scale) ? primary : fallback && fallback.nativeScales.has(scale) ? fallback : primary;

  const snapshot = (): RenderSnapshot | null => {
    if (!source) return null;
    const s = source.state;
    return {
      layers: s.layers, maps: s.maps, markers: source.q.disasters.markers(), view, seaLevel: s.terrain.seaLevel,
      artScale: ZOOM_TABLE[view.zoom].scale, trafficLight: 48, trafficHeavy: 160,
    };
  };

  /** 相机：让 (centerX, centerY) 处地块（基准海拔）的顶点落在画布中心。 */
  const updateCamera = (snap: RenderSnapshot, cw: number, ch: number): void => {
    const cx = Math.max(0, Math.min(127, Math.floor(view.centerX))), cy = Math.max(0, Math.min(127, Math.floor(view.centerY)));
    const h = snap.layers.alt[tileIndex(cx, cy)] ?? 0;
    const [sx, sy] = stubSceneCompiler.worldToScreen(snap, view.centerX, view.centerY, h);
    camX = Math.round(cw / 2 - sx);
    camY = Math.round(ch / 2 - sy);
  };

  const draw = (): void => {
    if (!canvas || !ctx2d) return;
    const snap = snapshot();
    lastSnap = snap;
    const cw = canvas.width, ch = canvas.height;
    if (!snap || cw === 0 || ch === 0) return;
    updateCamera(snap, cw, ch);
    const items = stubSceneCompiler.compileAll(snap);
    const prov = providerFor(snap.artScale);
    const bmp = stubCpuCompositor.render(items, prov, snap.artScale, { x: -camX, y: -camY, w: cw, h: ch });
    const rgba = stubCpuCompositor.toRgba(bmp, prov.palette);
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] === 0) { rgba[i] = BG[0]; rgba[i + 1] = BG[1]; rgba[i + 2] = BG[2]; rgba[i + 3] = 255; }
    }
    const img = ctx2d.createImageData(cw, ch);
    img.data.set(rgba);
    ctx2d.putImageData(img, 0, 0);
  };

  function resize(): void {
    if (!hostEl || !canvas) return;
    const w = Math.max(1, hostEl.clientWidth || 800), h = Math.max(1, hostEl.clientHeight || 600);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    needsRedraw = true;
  }

  const api: RendererApi = {
    attach: async (host) => {
      hostEl = host;
      canvas = document.createElement('canvas');
      canvas.dataset['sc2k'] = 'stub-renderer';
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      host.appendChild(canvas);
      ctx2d = canvas.getContext('2d');
      window.addEventListener('resize', onResize);
      resize();
    },
    destroy: () => {
      window.removeEventListener('resize', onResize);
      canvas?.remove();
      canvas = null; ctx2d = null; hostEl = null; source = null; lastSnap = null;
    },
    resize,
    setSource: (src) => { source = src; needsRedraw = true; },
    setProvider: (p, f) => { primary = p; fallback = f; needsRedraw = true; },
    setView: (v) => { view = cloneView(v); needsRedraw = true; },
    getView: () => cloneView(view),
    goto: (x, y) => { view.centerX = x; view.centerY = y; needsRedraw = true; },
    frame: () => {
      if (!source) return;
      const changes = source.takeChanges();
      if (changes.tiles.length > 0 || changes.bulk.all || changes.bulk.xbit || changes.bulk.maps || changes.bulk.xtxt || changes.bulk.xthg || changes.bulk.xmic) needsRedraw = true;
      if (!needsRedraw) return;
      draw();
      needsRedraw = false;
    },
    setPreview: (p) => { extras.preview = p; },
    setActors: (a) => { extras.actors = a; },
    setHeatLayer: (layer) => { extras.heat = layer; },
    pick: (px, py) => {
      const snap = lastSnap ?? snapshot();
      if (!snap) return null;
      const i = stubSceneCompiler.pick(snap, px - camX, py - camY);
      return i === null ? null : { x: i >> 7, y: i & 127 };
    },
    screenOf: (x, y) => {
      const snap = lastSnap ?? snapshot();
      if (!snap) return [0, 0];
      const h = snap.layers.alt[tileIndex(x, y)] ?? 0;
      const [sx, sy] = stubSceneCompiler.worldToScreen(snap, x, y, h);
      return [sx + camX, sy + camY];
    },
    minimap: (_mode, out) => {
      const s = source?.state;
      if (!s) { out.fill(0); return; }
      for (let x = 0; x < 128; x++) for (let y = 0; y < 128; y++) {
        const i = tileIndex(x, y), o = (y * 128 + x) * 4;
        const water = (s.layers.xbit[i]! & XBit.Water) !== 0;
        const v = 64 + s.layers.alt[i]! * 6;
        const built = s.layers.xbld[i]! >= 0x70;
        out[o] = water ? 24 : built ? 220 : v; out[o + 1] = water ? 64 : built ? 220 : v + 16; out[o + 2] = water ? 160 : built ? 200 : v - 16; out[o + 3] = 255;
      }
    },
    thumbnail: async (w, h) => {
      const snap = snapshot();
      if (!snap) return stubCpuCompositor.encodePng(new Uint8ClampedArray(w * h * 4), w, h);
      // 走 S 档全图（桩 provider 没有 XS）→ 盒式降采样到 w×h
      const small: RenderSnapshot = { ...snap, view: { ...view, zoom: 1 }, artScale: 'S' };
      const size = mapCanvasSize(1);
      const prov = providerFor('S');
      const bmp = stubCpuCompositor.render(stubSceneCompiler.compileAll(small), prov, 'S', { x: 0, y: 0, w: size.w, h: size.h });
      const rgba = stubCpuCompositor.toRgba(bmp, prov.palette);
      const out = new Uint8ClampedArray(w * h * 4);
      for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) {
        const x0 = Math.floor((ox * size.w) / w), x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * size.w) / w));
        const y0 = Math.floor((oy * size.h) / h), y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * size.h) / h));
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = (y * size.w + x) * 4; r += rgba[p]!; g += rgba[p + 1]!; b += rgba[p + 2]!; a += rgba[p + 3]!; n++; }
        const o = (oy * w + ox) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
      }
      return stubCpuCompositor.encodePng(out, w, h);
    },
    stats: (): RendererStats => ({ sprites: 0, drawCalls: 0, bandRebuilds: 0, frameMs: 0, vramBytes: 0 }),
  };
  return api;
}
