// ===== render/pixi/backend.ts =====（ARCHITECTURE §6.5–§6.9；CONTRACTS §Q RendererApi）
// PixiJS v8 深度带后端：Application(PIXI_INIT_OPTIONS) + 整数 backingScale + stage.eventMode='none'；
// worldRoot(整数相机位置) → groundRoot(16 带) / undergroundRoot(16 带，首次切换懒构建) → previewLayer → airLayer；DOM 标牌层在 host 内。
// 每帧：takeChanges → 脏更新 / 整层扫描 / 全量重建 → 断电图标 1 Hz 闪烁 → 相机 → 16 次带可见区间 → 标牌重排 → 图集上传 → render → stats。
// headless 选项：不创建 Application（Node 单元测试走同一套场景逻辑；attach 只记录 host）。
import { Application, Container } from 'pixi.js';
import type { WebGLRenderer } from 'pixi.js';
import type { RendererApi } from '../../contracts/rendererApi';
import type { ActorSprite, CpuCompositor, MapLayerMode, RenderSnapshot, RenderSource, RendererStats, SceneCompiler, SpriteProvider, ViewState } from '../../contracts/render';
import { PIXI_INIT_OPTIONS, ZOOM_TABLE, backingScaleFor, mapCanvasSize, mapOrigin } from '../../contracts/render';
import type { PlacementPreview } from '../../contracts/commands';
import { tileIndex } from '../../contracts/grid';
import { createAtlas } from './atlas';
import type { Atlas } from './atlas';
import { createBandSet } from './bands';
import type { BandSet } from './bands';
import { createSceneTree } from './tree';
import type { SceneTree } from './tree';
import { createLabelLayer, labelTextOf } from './labels';
import type { LabelLayer } from './labels';
import { createPreviewLayer } from './preview';
import type { PreviewLayer } from './preview';
import { createActorLayer } from './actors';
import type { ActorEntry, ActorLayer } from './actors';
import { paintMinimap } from './minimap';

export interface RendererDeps { sceneCompiler: SceneCompiler; cpuCompositor: CpuCompositor }
export interface PixiRendererOptions {
  headless?: boolean;                        // 不创建 Application / DOM（Node 测试）
  viewport?: { w: number; h: number };       // headless 下的视口尺寸（默认 800×600）
  trafficLight?: number; trafficHeavy?: number;
  background?: number;
}
/** 测试与调试用内部视图（render/index.ts 对外只暴露 RendererApi）。 */
export interface RendererInternals {
  readonly atlas: Atlas; readonly ground: SceneTree; readonly underground: SceneTree;
  readonly groundBands: BandSet; readonly undergroundBands: BandSet;
  readonly worldRoot: Container; readonly airLayer: Container; readonly previewLayer: PreviewLayer; readonly actors: ActorLayer;
  camera(): { x: number; y: number }; viewport(): { w: number; h: number; backingScale: number };
  lastTouchedBands(): number; rebuilds(): number; fullRebuildMs(): number; visibleBands(): number;
  actorOf(slot: number): ActorEntry | undefined; labels(): LabelLayer | null; app(): Application | null;
}
export interface PixiRenderer extends RendererApi { readonly internals: RendererInternals }

/** 画布底色（原创取值：深蓝灰，与 index.html 的 --bg 同调）。 */
export const PIXI_BACKGROUND = 0x101820;
export const BLINK_PERIOD_MS = 1000;        // 断电图标 1 fps：亮 500 ms / 灭 500 ms
export const DEFAULT_TRAFFIC_LIGHT = 48, DEFAULT_TRAFFIC_HEAVY = 160;
const DEFAULT_VIEW: ViewState = {
  zoom: 2, rotation: 0, centerX: 64, centerY: 64, underground: false,
  show: { buildings: true, signs: true, infrastructure: true, zones: true }, mapLayer: null,
};
const cloneView = (v: ViewState): ViewState => ({ ...v, show: { ...v.show } });
const showChanged = (a: ViewState['show'], b: ViewState['show']): boolean => a.buildings !== b.buildings || a.signs !== b.signs || a.infrastructure !== b.infrastructure || a.zones !== b.zones;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

type DrawFn = 'drawElements' | 'drawArrays' | 'drawElementsInstanced' | 'drawArraysInstanced';
const DRAW_FNS: readonly DrawFn[] = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'];

/** 盒式降采样（RGBA）。 */
export function boxDownsample(src: Uint8ClampedArray, sw: number, sh: number, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) {
    const x0 = Math.floor((ox * sw) / w), x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * sw) / w));
    const y0 = Math.floor((oy * sh) / h), y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * sh) / h));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = (y * sw + x) * 4; r += src[p]!; g += src[p + 1]!; b += src[p + 2]!; a += src[p + 3]!; n++; }
    const o = (oy * w + ox) * 4;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
  }
  return out;
}

export function createPixiRenderer(deps: RendererDeps, opts: PixiRendererOptions = {}): PixiRenderer {
  const compiler = deps.sceneCompiler, cpu = deps.cpuCompositor;
  const trafficLight = opts.trafficLight ?? DEFAULT_TRAFFIC_LIGHT, trafficHeavy = opts.trafficHeavy ?? DEFAULT_TRAFFIC_HEAVY;

  // ---- 场景图 ----
  const atlas = createAtlas();
  const worldRoot = new Container({ label: 'world' });
  const groundBands = createBandSet('ground'), undergroundBands = createBandSet('underground');
  const ground = createSceneTree({ compiler, atlas, bands: groundBands, underground: false });
  const underground = createSceneTree({ compiler, atlas, bands: undergroundBands, underground: true });
  const previewLayer = createPreviewLayer();
  const actorLayer = createActorLayer();
  worldRoot.addChild(groundBands.root, undergroundBands.root, previewLayer.layer, actorLayer.airLayer);
  undergroundBands.root.visible = false;
  const headlessStage = new Container({ label: 'stage' });
  headlessStage.addChild(worldRoot);

  // ---- 状态 ----
  let hostEl: HTMLElement | null = null, app: Application | null = null, canvas: HTMLCanvasElement | null = null, labels: LabelLayer | null = null;
  let source: RenderSource | null = null;
  let view = cloneView(DEFAULT_VIEW);
  let vw = opts.viewport?.w ?? 800, vh = opts.viewport?.h ?? 600, backingScale = 1;
  let camX = 0, camY = 0;
  let needFull = true, previewDirty = false, actorsDirty = false;
  let blinkMs = 0, blinkOn = true;
  let frameMs = 0, drawCalls = 0, glDraws = 0, lastTouched = 0, rebuilds = 0, fullRebuildMs = 0, visibleBands = 0;
  let heat: MapLayerMode | null = null;
  let preview: PlacementPreview | null = null;
  let actors: readonly ActorSprite[] = [];
  const onResize = (): void => { resize(); };

  const snapshotFor = (undergroundView: boolean): RenderSnapshot | null => {
    if (!source) return null;
    const s = source.state;
    return {
      layers: s.layers, maps: s.maps, markers: source.q.disasters.markers(),
      view: { ...view, show: { ...view.show }, underground: undergroundView },
      seaLevel: s.terrain.seaLevel, artScale: ZOOM_TABLE[view.zoom].scale, trafficLight, trafficHeavy,
    };
  };
  const visibleTree = (): SceneTree => (view.underground ? underground : ground);
  const hiddenTree = (): SceneTree => (view.underground ? ground : underground);

  /** 相机：(centerX, centerY) 处地块（其海拔）的顶点落在视口中心；worldRoot 取整数位置。 */
  const updateCamera = (snap: RenderSnapshot): void => {
    const cx = Math.max(0, Math.min(127, Math.floor(view.centerX))), cy = Math.max(0, Math.min(127, Math.floor(view.centerY)));
    const h = snap.layers.alt[tileIndex(cx, cy)] ?? 0;
    const [sx, sy] = compiler.worldToScreen(snap, view.centerX, view.centerY, h);
    camX = Math.round(vw / 2 - sx);
    camY = Math.round(vh / 2 - sy);
    worldRoot.position.set(camX, camY);
  };
  const updateBands = (snap: RenderSnapshot): void => {
    const z = ZOOM_TABLE[snap.view.zoom];
    const g = { oy: mapOrigin(snap.view.zoom).y, S: z.tileW / 2, tileH: z.tileH, levelPx: z.levelPx, maxSpriteH: atlas.maxSpriteHeight(snap.artScale) };
    const top = -camY, bottom = -camY + vh;
    visibleBands = (view.underground ? undergroundBands : groundBands).updateVisibility(top, bottom, g);
  };
  const updateLabels = (snap: RenderSnapshot): void => {
    if (!labels) return;
    if (ground.labelsDirty) {
      const layers = snap.layers;
      labels.set(ground.labels(), (spec) => labelTextOf(layers, spec.tile));
      ground.labelsDirty = false;
    }
    labels.reposition(camX, camY, ZOOM_TABLE[snap.view.zoom].tileH);
    labels.setVisible(!view.underground && view.show.signs);
  };
  const hookDrawCounter = (renderer: unknown): void => {
    const gl = (renderer as Partial<WebGLRenderer>).gl as (WebGL2RenderingContext & Record<DrawFn, (...a: unknown[]) => void>) | undefined;
    if (!gl) return;
    for (const name of DRAW_FNS) {
      const orig = gl[name];
      if (typeof orig !== 'function') continue;
      gl[name] = (...args: unknown[]): void => { glDraws++; orig.apply(gl, args); };
    }
  };

  function resize(): void {
    if (!hostEl) return;
    const w = Math.max(1, hostEl.clientWidth || vw), h = Math.max(1, hostEl.clientHeight || vh);
    const bs = backingScaleFor(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    if (w === vw && h === vh && bs === backingScale && app) return;
    vw = w; vh = h; backingScale = bs;
    if (app && canvas) {
      app.renderer.resize(w * bs, h * bs);
      app.stage.scale.set(bs, bs);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  }

  const frame = (dtMs: number): void => {
    if (!source) return;
    const t0 = now();
    groundBands.beginFrame(); undergroundBands.beginFrame();
    const snapV = snapshotFor(view.underground)!;
    const vis = visibleTree(), hid = hiddenTree();
    const changes = source.takeChanges();
    const tiles = changes.tiles, bulk = changes.bulk;
    const anyBulk = bulk.xbit || bulk.maps || bulk.xtxt;
    if (needFull || bulk.all) {
      const r0 = now();
      if (vis === ground) actorLayer.detachGround();      // 地面角色与地面树同带：整批重建前先摘下，稍后 setActors 路径重新插入
      vis.rebuild(snapV);
      fullRebuildMs = now() - r0; rebuilds++;
      hid.invalidate();
      needFull = false; previewDirty = true; actorsDirty = true;
    } else {
      if (!vis.built) { if (vis === ground) actorLayer.detachGround(); vis.ensureFresh(snapV); rebuilds++; previewDirty = true; actorsDirty = true; } else vis.ensureFresh(snapV);
      if (tiles.length > 0) vis.updateTiles(snapV, tiles, tiles.length);
      if (anyBulk) vis.applyBulk(snapV, bulk);
      if (tiles.length > 0 || anyBulk) hid.defer(tiles, tiles.length, bulk);
    }
    // 断电图标闪烁（visible 切换，1 fps）
    blinkMs = (blinkMs + Math.max(0, dtMs)) % BLINK_PERIOD_MS;
    const on = blinkMs < BLINK_PERIOD_MS / 2;
    if (on !== blinkOn) { blinkOn = on; ground.setBlink(on); underground.setBlink(on); }
    // 角色 / 预览
    if (actorsDirty) { actorLayer.set(actors, snapshotFor(false)!, compiler, atlas, groundBands); actorsDirty = false; }
    if (previewDirty) { previewLayer.set(preview, snapV, compiler, atlas); previewDirty = false; }
    // 相机 / 带可见 / 标牌 / 图集上传
    updateCamera(snapV);
    updateBands(snapV);
    updateLabels(snapV);
    atlas.flush();
    if (app) { glDraws = 0; app.render(); drawCalls = glDraws; }
    lastTouched = groundBands.touched.size + undergroundBands.touched.size;
    frameMs = now() - t0;
  };

  const api: PixiRenderer = {
    async attach(host) {
      hostEl = host;
      if (typeof getComputedStyle === 'function' && getComputedStyle(host).position === 'static') host.style.position = 'relative';
      if (opts.headless) { resize(); return; }
      const a = new Application();
      vw = Math.max(1, host.clientWidth || vw); vh = Math.max(1, host.clientHeight || vh);
      backingScale = backingScaleFor(window.devicePixelRatio || 1);
      // 图集页 autoGarbageCollect=false，故不必再关 Pixi 的纹理 GC（v8.15 起 textureGCActive 走弃用路径会告警）。
      await a.init({
        ...PIXI_INIT_OPTIONS, autoStart: false, sharedTicker: false, width: vw * backingScale, height: vh * backingScale,
        background: opts.background ?? PIXI_BACKGROUND,
        eventFeatures: { move: false, click: false, wheel: false, globalMove: false },
      });
      app = a;
      a.stage.eventMode = 'none';
      a.stage.interactiveChildren = false;
      a.stage.scale.set(backingScale, backingScale);
      a.stage.addChild(worldRoot);
      canvas = a.canvas;
      canvas.dataset['sc2k'] = 'pixi-renderer';
      canvas.style.display = 'block';
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      host.appendChild(canvas);
      labels = createLabelLayer(host);
      hookDrawCounter(a.renderer);
      window.addEventListener('resize', onResize);
    },
    destroy() {
      if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
      actorLayer.clear(groundBands);
      previewLayer.clear();
      ground.clear(); underground.clear();
      labels?.destroy(); labels = null;
      if (app) { worldRoot.removeFromParent(); app.destroy(true, { children: true }); app = null; }
      canvas = null; hostEl = null; source = null;
      atlas.destroy();
    },
    resize,
    setSource(src) { source = src; needFull = true; underground.invalidate(); blinkMs = 0; },
    setProvider(p: SpriteProvider, f: SpriteProvider | null) { atlas.setProviders(p, f); needFull = true; underground.invalidate(); ground.invalidate(); },
    setView(v) {
      const prev = view;
      view = cloneView(v);
      if (prev.zoom !== v.zoom || prev.rotation !== v.rotation || showChanged(prev.show, v.show)) needFull = true;
      if (prev.underground !== v.underground) {
        groundBands.root.visible = !v.underground;
        undergroundBands.root.visible = v.underground;
        previewDirty = true;
      }
    },
    getView: () => cloneView(view),
    goto(x, y) { view.centerX = x; view.centerY = y; },   // smooth（400 ms ease-out）为 v2；v1 瞬移
    frame,
    setPreview(p) { preview = p; previewDirty = true; },
    setActors(a) { actors = a; actorsDirty = true; },
    setHeatLayer(layer) { heat = layer; },                  // heatOverlay 为 v2：v1 只记录
    pick(px, py) {
      const snap = snapshotFor(view.underground);
      if (!snap) return null;
      const i = compiler.pick(snap, px - camX, py - camY);
      return i === null ? null : { x: i >> 7, y: i & 127 };
    },
    screenOf(x, y) {
      const snap = snapshotFor(view.underground);
      if (!snap) return [0, 0];
      const h = snap.layers.alt[tileIndex(x, y)] ?? 0;
      const [sx, sy] = compiler.worldToScreen(snap, x, y, h);
      return [sx + camX, sy + camY];
    },
    minimap(mode, out) {
      if (!source) { out.fill(0); return; }
      paintMinimap(source.state, mode, out);
    },
    async thumbnail(w, h) {
      const base = snapshotFor(false);
      if (!base) return cpu.encodePng(new Uint8ClampedArray(w * h * 4), w, h);
      const snap: RenderSnapshot = { ...base, view: { ...base.view, zoom: 0, underground: false }, artScale: 'XS' };
      const size = mapCanvasSize(0);
      const prov = atlas.facade();
      const bmp = cpu.render(compiler.compileAll(snap), prov, 'XS', { x: 0, y: 0, w: size.w, h: size.h });
      const rgba = cpu.toRgba(bmp, prov.palette);
      return cpu.encodePng(boxDownsample(rgba, size.w, size.h, w, h), w, h);
    },
    stats: (): RendererStats => ({
      sprites: groundBands.count + undergroundBands.count + actorLayer.airLayer.children.length + previewLayer.count,
      drawCalls, bandRebuilds: groundBands.bandRebuilds + undergroundBands.bandRebuilds, frameMs, vramBytes: atlas.vramBytes,
    }),
    internals: {
      atlas, ground, underground, groundBands, undergroundBands, worldRoot, airLayer: actorLayer.airLayer, previewLayer, actors: actorLayer,
      camera: () => ({ x: camX, y: camY }), viewport: () => ({ w: vw, h: vh, backingScale }),
      lastTouchedBands: () => lastTouched, rebuilds: () => rebuilds, fullRebuildMs: () => fullRebuildMs, visibleBands: () => visibleBands,
      actorOf: (slot) => actorLayer.of(slot), labels: () => labels, app: () => app,
    },
  };
  void heat; void headlessStage;
  return api;
}
