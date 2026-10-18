// ===== ui/tools/toolController.ts =====（spec:ui-art §2.8 十模式 + 附加鼠标约定 + 键盘表；§3.11 触控子集；ARCHITECTURE §7.2）
// 工具状态机：统一 PointerEvent 多指追踪（touch-action: none 由视图元素保证）。
//  - 鼠标：左键 = 工具；右 / 中键拖 = 平移；右键单击 = Query；滚轮 = 以光标为锚缩放一档。
//  - 触控 v1 子集：单指点按 = 工具；单指拖动在 Click / Place / Query 等模式下 = 平移，在 Paint / Line / Rect 下 = 工具拖；
//    双指 = 平移 + 捏合（累计比例跨 1.5 进一档 / 0.67 退一档，10% 滞回，松手吸附整数档）；长按 500 ms = Query；双击 = 放大一档并居中。
//  - 预览只调 q.placement.preview（纯函数、不消费 PRNG）；命令经 deps.dispatch（外壳统一处理音效 / 状态栏 / 命令结果型模态）。
//  - 选中 undergroundView 工具（管线 / 地铁）自动进入地下视图，切到其他工具时退出（手动切换地下视图不受影响）。
import type { SimHost } from '../../contracts/host';
import type { RendererApi } from '../../contracts/rendererApi';
import type { Strings } from '../../contracts/strings';
import type { ToolDef, ToolGroup, ToolId } from '../../contracts/catalogue';
import type { Command, CommandResult, PlacementPreview, RejectReason, ToolMode } from '../../contracts/commands';
import type { ViewState, ZoomLevel } from '../../contracts/render';
import type { WindowId } from '../../contracts/shell';
import type { Speed } from '../../contracts/state';
import { inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { ZOOM_TABLE } from '../../contracts/render';
import { rejectKey } from '../../contracts/strings';
import { clamp, fmtMoney } from '../dom';
import { tr } from '../theme';
import { GESTURE, createPinchTracker, dist, mid, panDelta } from './gestures';
import type { PinchTracker } from './gestures';
import { isTypingTarget, resolveKey } from './keymap';
import { HELP_TOOL, PAN_ON_DRAG_MODES, anchorOffset, buildingIdOf, footprintOf, modeOf, networkKindOf, terrainToolOf } from './modes';

/** v1 必做显示档 S / M / L（spec:ui-art §2.7）；XS / XL 由 v2 开放。 */
export const ZOOM_MIN: ZoomLevel = 1, ZOOM_MAX: ZoomLevel = 3;
export const DEFAULT_RUN_SPEED: Speed = 3;

export interface StatusMessage { text: string; level: 'hint' | 'reject' | 'alert'; ttlMs?: number }
export interface ToolControllerDeps {
  host: SimHost; renderer: RendererApi; strings: Strings;
  /** 指针事件绑定的元素（城市视图容器，内含渲染器 canvas）。 */
  target: HTMLElement;
  dispatch(cmd: Command): CommandResult;
  onMessage(m: StatusMessage): void;
  onTilePicked(x: number, y: number): void;
  openWindow(id: WindowId): void;
  onToolChanged?(tool: ToolId | null, mode: ToolMode | null): void;
  /** Esc 语义栈的外层（收起子工具条 / 关闭顶层窗口）；返回是否处理。 */
  onEscape?(): boolean;
  onGroupKey?(group: ToolGroup): void;
  onNextSubtool?(): void;
  onSave?(): void;
  onViewChanged?(v: ViewState): void;
  /** 帮助模式下点击地图：外壳弹帮助气泡；默认用状态栏提示建筑名。 */
  onHelpTile?(x: number, y: number, px: number, py: number): void;
  promptText?(label: string): string | null;
  now?(): number;
}
export interface ToolController {
  setTool(id: ToolId | null): void; getTool(): ToolId | null; getMode(): ToolMode | null;
  isDragging(): boolean;
  /** 取消进行中的拖动（Esc 语义栈第一层）；返回是否有拖动被取消。 */
  cancelDrag(): boolean;
  handleKey(e: KeyboardEvent): boolean;
  zoomBy(delta: number, anchor?: { px: number; py: number }): void;
  setZoom(z: number, anchor?: { px: number; py: number }): void;
  rotateBy(delta: number): void;
  panTiles(dx: number, dy: number): void;
  centerOn(x: number, y: number, smooth?: boolean): void;
  centerHome(): void;
  setUnderground(on: boolean): void;
  toggleShow(key: keyof ViewState['show']): void;
  /** 任意工具下的"查询某格"（长按 / 右键 / Query 工具共用）。 */
  pickQuery(x: number, y: number): void;
  togglePause(): void;
  destroy(): void;
}

interface Tile { x: number; y: number }
interface Ptr { id: number; type: string; x: number; y: number; x0: number; y0: number; t0: number; button: number; dead: boolean; moved: boolean }
type Drag =
  | { kind: 'pan'; id: number; x: number; y: number; rightClick: boolean }
  | { kind: 'line'; id: number; from: Tile; to: Tile }
  | { kind: 'rect'; id: number; from: Tile; to: Tile }
  | { kind: 'paint'; id: number; visited: Set<number> }
  | { kind: 'pinch'; a: number; b: number; tracker: PinchTracker; cx: number; cy: number; baseZoom: ZoomLevel }
  | { kind: 'pending'; id: number; timer: ReturnType<typeof setTimeout> | null }     // 触控单指：尚未分类（点按 / 长按 / 拖动）
  | { kind: 'press'; id: number };                                                     // 鼠标左键按住（Click / Place 等：松开且未移动才提交）

const sameTile = (a: Tile | null, b: Tile | null): boolean => !!a && !!b && a.x === b.x && a.y === b.y;
const idx = (t: Tile): number => tileIndex(t.x, t.y);

export function createToolController(deps: ToolControllerDeps): ToolController {
  const { host, renderer, strings, target } = deps;
  const cat = host.catalogue;
  const t = (k: string, args?: Record<string, string | number>): string => strings.t(k, args);
  const now = deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  let tool: ToolId | null = null;
  let def: ToolDef | undefined;
  let mode: ToolMode | null = null;
  let undergroundByTool = false;
  let lastRunSpeed: Speed = DEFAULT_RUN_SPEED;
  const pointers = new Map<number, Ptr>();
  let drag: Drag | null = null;
  let hoverKey = -1;                      // 上次悬停预览的锚格索引（避免每次 move 都算预览）
  let lastTap: { t: number; x: number; y: number } | null = null;

  // ---------------- 视图 ----------------
  const view = (): ViewState => renderer.getView();
  const applyView = (v: ViewState): void => { renderer.setView(v); deps.onViewChanged?.(v); };
  const viewportSize = (): [number, number] => {
    const r = target.getBoundingClientRect();
    return [target.clientWidth || r.width || 800, target.clientHeight || r.height || 600];
  };
  const local = (clientX: number, clientY: number): [number, number] => {
    const r = target.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  };
  const tileAtLocal = (px: number, py: number): Tile | null => {
    const p = renderer.pick(px, py);
    return p && inMap(p.x, p.y) ? { x: p.x, y: p.y } : null;
  };
  /** 只接受 client 坐标（PointerEvent.clientX/Y）；Ptr / lx,ly 已是局部坐标，必须用 tileAtLocal——否则视图不在 (0,0)（菜单栏下方）时会把 rect 偏移减两次（INT-B 修复：点击落点偏移 1–2 格）。 */
  const tileAt = (clientX: number, clientY: number): Tile | null => { const [px, py] = local(clientX, clientY); return tileAtLocal(px, py); };
  /** 以 (px,py) 为锚换档：锚点下的世界点在换档后仍在锚点下（只按平面几何，忽略海拔）。 */
  function setZoom(z: number, anchor?: { px: number; py: number }): void {
    const v = view();
    const nz = clamp(Math.round(z), ZOOM_MIN, ZOOM_MAX) as ZoomLevel;
    if (nz === v.zoom) return;
    if (anchor) {
      const [w, hgt] = viewportSize();
      const dx = anchor.px - w / 2, dy = anchor.py - hgt / 2;
      const [ox, oy] = panDelta(v, dx, dy);
      const wx = v.centerX + ox, wy = v.centerY + oy;
      const [nx, ny] = panDelta({ zoom: nz, rotation: v.rotation }, dx, dy);
      v.centerX = clamp(wx - nx, 0, 127); v.centerY = clamp(wy - ny, 0, 127);
    }
    v.zoom = nz;
    applyView(v);
  }
  const zoomBy = (delta: number, anchor?: { px: number; py: number }): void => setZoom(view().zoom + delta, anchor);
  const rotateBy = (delta: number): void => {
    const v = view();
    v.rotation = (((v.rotation + delta) % 4) + 4) % 4 as ViewState['rotation'];
    applyView(v);
    host.dispatch({ type: 'setView', x: Math.round(v.centerX), y: Math.round(v.centerY), zoom: v.zoom, rotation: v.rotation });
  };
  const panPixels = (dx: number, dy: number): void => {
    const v = view();
    const [vx, vy] = panDelta(v, dx, dy);
    v.centerX = clamp(v.centerX - vx, 0, 127); v.centerY = clamp(v.centerY - vy, 0, 127);
    applyView(v);
  };
  /** 方向键：按屏幕轴移动 dx / dy 格（换算成像素再走 panPixels，使"左键 = 视图向左"在任何旋转下成立）。 */
  const panTiles = (dx: number, dy: number): void => { const z = ZOOM_TABLE[view().zoom]; panPixels(-dx * z.tileW, -dy * z.tileH); };
  const centerOn = (x: number, y: number, smooth = false): void => { renderer.goto(clamp(x, 0, 127), clamp(y, 0, 127), smooth); deps.onViewChanged?.(view()); };
  const centerHome = (): void => { const c = host.q.services.cityCenter(); centerOn(c.x, c.y, true); };
  const setUnderground = (on: boolean): void => { const v = view(); if (v.underground !== on) { v.underground = on; applyView(v); } };
  const toggleShow = (key: keyof ViewState['show']): void => { const v = view(); v.show[key] = !v.show[key]; applyView(v); };

  // ---------------- 状态栏提示 / 预览 ----------------
  const toolName = (): string => (tool === HELP_TOOL ? tr(strings, 'ui.help') : def ? t(def.label) : '');
  const hint = (text: string): void => deps.onMessage({ text, level: 'hint' });
  const costText = (cost: number): string => (cost > 0 ? fmtMoney(cost) : '');
  const toolHint = (cost: number, reason?: RejectReason): void => {
    if (!tool) { hint(''); return; }
    let s = t('ui.status.toolHint', { name: toolName(), cost: costText(cost) }).trim();
    if (reason) s += ` — ${t(rejectKey(reason))}`;
    hint(s);
  };
  const setPreview = (p: PlacementPreview | null): void => { renderer.setPreview(p); };
  const clearHover = (): void => { if (hoverKey !== -1) { hoverKey = -1; setPreview(null); if (tool) toolHint(baseCost()); } };
  const baseCost = (): number => (def ? host.q.economy.costOf(def.id, 1) : 0);
  const synthTiles = (list: number[], ok: boolean): PlacementPreview['tiles'] => list.map((i) => ({ i, ok }));

  /** Click / Place 的放置命令（指针格 → 锚格）。 */
  const placeCmd = (tile: Tile): Command | null => {
    if (!def) return null;
    const tt = terrainToolOf(def);
    if (tt) return { type: 'terrainTool', tool: tt, path: [idx(tile)] };
    if (def.id === 'roads.tunnel') return { type: 'tunnel', at: idx(tile) };
    const id = buildingIdOf(def);
    if (id < 0) return null;
    const off = anchorOffset(footprintOf(def));
    return { type: 'placeBuilding', id, x: tile.x - off, y: tile.y - off };
  };
  /** 悬停预览（Click / Place）：只在锚格变化时重算；q.placement.preview 为纯函数。 */
  const updateHover = (tile: Tile | null): void => {
    if (!tile || !(mode === 'Click' || mode === 'Place')) { clearHover(); return; }
    const cmd = placeCmd(tile);
    if (!cmd) { clearHover(); return; }
    const key = idx(tile);
    if (key === hoverKey) return;
    hoverKey = key;
    if (cmd.type === 'placeBuilding') {
      const p = host.q.placement.preview(cmd);
      setPreview(p);
      toolHint(p.cost, p.ok ? undefined : p.reason);
    } else {
      setPreview({ ok: true, cost: baseCost(), tiles: synthTiles([key], true) });
      toolHint(baseCost());
    }
  };

  // ---------------- Line / Rect ----------------
  /** 端点取位移大的轴（拖动中实时切换；spec:ui-art §4 第 8 条）。 */
  const constrainLine = (from: Tile, to: Tile): Tile => (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y });
  const lineTiles = (from: Tile, to: Tile): number[] => {
    const out: number[] = [];
    if (from.x === to.x) { const s = Math.sign(to.y - from.y) || 1; for (let y = from.y; ; y += s) { out.push(tileIndex(from.x, y)); if (y === to.y) break; } }
    else { const s = Math.sign(to.x - from.x) || 1; for (let x = from.x; ; x += s) { out.push(tileIndex(x, from.y)); if (x === to.x) break; } }
    return out;
  };
  const rectTiles = (a: Tile, b: Tile): number[] => {
    const out: number[] = [];
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) out.push(tileIndex(x, y));
    return out;
  };
  const lineCmd = (from: Tile, to: Tile): Command | null => {
    if (!def) return null;
    const kind = networkKindOf(def);
    if (!kind) return null;
    const end = constrainLine(from, to);
    return { type: 'network', kind, from: idx(from), to: idx(end) };
  };
  const rectCmd = (a: Tile, b: Tile): Command | null => {
    if (!def) return null;
    if (def.id === 'bulldozer.dezone') return { type: 'dezone', tiles: rectTiles(a, b) };
    if (def.zoneCode === undefined) return null;
    return { type: 'zoneRect', zone: def.zoneCode, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  };
  /** 拖动预览：优先用 placement 的 preview；桩 / 未实现返回空 tiles 时按几何合成并用 costOf 估价，保证 UI 在任何系统组合下可用。 */
  const previewDrag = (cmd: Command, tiles: number[]): void => {
    let p = host.q.placement.preview(cmd);
    if (p.tiles.length === 0 && def) p = { ...p, tiles: synthTiles(tiles, p.ok), cost: p.cost || host.q.economy.costOf(def.id, tiles.length) };
    setPreview(p);
    toolHint(p.cost, p.ok ? undefined : p.reason);
  };
  const updateLine = (d: Extract<Drag, { kind: 'line' }>): void => {
    const cmd = lineCmd(d.from, d.to); if (!cmd) return;
    previewDrag(cmd, lineTiles(d.from, constrainLine(d.from, d.to)));
  };
  const updateRect = (d: Extract<Drag, { kind: 'rect' }>): void => {
    const cmd = rectCmd(d.from, d.to); if (!cmd) return;
    previewDrag(cmd, rectTiles(d.from, d.to));
  };
  const commit = (cmd: Command | null): CommandResult | null => {
    if (!cmd) return null;
    const r = deps.dispatch(cmd);
    hoverKey = -1;
    setPreview(null);
    return r;
  };

  // ---------------- Paint ----------------
  const paintCmd = (tile: Tile): Command | null => {
    if (!def) return null;
    const i = idx(tile);
    if (def.id === 'bulldozer.demolish') return { type: 'bulldoze', tiles: [i] };
    if (def.id === 'dispatch.police') return { type: 'dispatch', kind: 0, x: tile.x, y: tile.y };
    if (def.id === 'dispatch.fire') return { type: 'dispatch', kind: 1, x: tile.x, y: tile.y };
    const tt = terrainToolOf(def);
    if (tt) return { type: 'terrainTool', tool: tt, path: [i] };
    return null;
  };
  const paintAt = (d: Extract<Drag, { kind: 'paint' }>, tile: Tile | null): void => {
    if (!tile) return;
    const i = idx(tile);
    if (d.visited.has(i)) return;
    d.visited.add(i);
    setPreview({ ok: true, cost: baseCost(), tiles: synthTiles([i], true) });
    deps.dispatch(paintCmd(tile)!);
  };

  // ---------------- 点按动作（按模式） ----------------
  const pickQuery = (x: number, y: number): void => { deps.openWindow('query'); deps.onTilePicked(x, y); };
  function tapAt(tile: Tile | null, px: number, py: number): void {
    if (!tile) return;
    switch (mode) {
      case 'Click': case 'Place': commit(placeCmd(tile)); break;
      case 'Query': pickQuery(tile.x, tile.y); break;
      case 'Center': centerOn(tile.x, tile.y, true); deps.onTilePicked(tile.x, tile.y); break;
      case 'Sign': {
        const text = (deps.promptText ?? defaultPrompt)(t('ui.sign.prompt'));
        if (text !== null) commit({ type: 'sign', at: idx(tile), text: text.trim().slice(0, 23) || null });
        break;
      }
      case 'Dispatch': commit({ type: 'dispatch', kind: 2, x: tile.x, y: tile.y }); break;
      case 'Paint': { const d: Extract<Drag, { kind: 'paint' }> = { kind: 'paint', id: -1, visited: new Set() }; paintAt(d, tile); setPreview(null); break; }
      case 'Line': commit(lineCmd(tile, tile)); break;
      case 'Rect': commit(rectCmd(tile, tile)); break;
      case 'Help': {
        if (deps.onHelpTile) deps.onHelpTile(tile.x, tile.y, px, py);
        else { const id = host.state.layers.xbld[idx(tile)] ?? 0; hint(t(`bld.0x${id.toString(16).toUpperCase().padStart(2, '0')}`)); }
        break;
      }
      default: break;
    }
  }
  const defaultPrompt = (label: string): string | null => (typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(label) : null);
  const doubleTap = (tile: Tile | null): void => {
    if (!tile) return;
    const v = view();
    v.centerX = tile.x; v.centerY = tile.y;
    v.zoom = clamp(v.zoom + 1, ZOOM_MIN, ZOOM_MAX) as ZoomLevel;
    applyView(v);
  };

  // ---------------- 工具选择 ----------------
  function setTool(id: ToolId | null): void {
    if (id === tool) return;
    cancelDrag();
    clearHover();
    tool = id;
    def = id && id !== HELP_TOOL ? cat.toolById(id) : undefined;
    if (id && id !== HELP_TOOL && !def) { tool = null; }
    mode = modeOf(def, tool);
    // 管线 / 地铁：自动地下视图；切到其他工具时退出（只退出由工具进入的那次）
    if (def?.undergroundView) { setUnderground(true); undergroundByTool = true; }
    else if (undergroundByTool) { setUnderground(false); undergroundByTool = false; }
    target.classList.toggle('help', mode === 'Help');
    toolHint(baseCost());
    deps.onToolChanged?.(tool, mode);
  }

  // ---------------- 指针事件 ----------------
  const ptrOf = (e: PointerEvent): Ptr | undefined => pointers.get(e.pointerId);
  const movedFar = (p: Ptr): boolean => dist(p.x0, p.y0, p.x, p.y) > GESTURE.tapMaxPx;
  const capture = (e: PointerEvent): void => { try { target.setPointerCapture?.(e.pointerId); } catch { /* 合成事件 / 不支持 */ } };
  const clearTimer = (d: Drag | null): void => { if (d && d.kind === 'pending' && d.timer !== null) { clearTimeout(d.timer); d.timer = null; } };
  const dragOwns = (d: Drag, id: number): boolean => (d.kind === 'pinch' ? d.a === id || d.b === id : d.id === id);
  /** 中止当前拖动（不提交）；返回是否有拖动。 */
  function cancelDrag(): boolean {
    if (!drag) return false;
    clearTimer(drag);
    drag = null;
    hoverKey = -1;
    setPreview(null);
    target.classList.remove('panning');
    if (tool) toolHint(baseCost());
    return true;
  }
  const startPan = (p: Ptr, rightClick: boolean): void => { drag = { kind: 'pan', id: p.id, x: p.x, y: p.y, rightClick }; target.classList.add('panning'); };
  /** 从（起点，当前点）开始工具拖动：Line / Rect 以起点格为 from，Paint 刷起点与当前格。 */
  const startToolDrag = (p: Ptr): void => {
    const from = tileAtLocal(p.x0, p.y0), cur = tileAtLocal(p.x, p.y);     // Ptr 坐标已是视图局部坐标
    if (mode === 'Line' && from) { drag = { kind: 'line', id: p.id, from, to: cur ?? from }; updateLine(drag); }
    else if (mode === 'Rect' && from) { drag = { kind: 'rect', id: p.id, from, to: cur ?? from }; updateRect(drag); }
    else if (mode === 'Paint') { const d: Extract<Drag, { kind: 'paint' }> = { kind: 'paint', id: p.id, visited: new Set() }; drag = d; paintAt(d, from); paintAt(d, cur); }
    else drag = null;
  };
  const startPinch = (): void => {
    const [a, b] = [...pointers.values()].filter((p) => !p.dead).slice(0, 2);
    if (!a || !b) return;
    const [cx, cy] = mid(a.x, a.y, b.x, b.y);
    drag = { kind: 'pinch', a: a.id, b: b.id, tracker: createPinchTracker(dist(a.x, a.y, b.x, b.y)), cx, cy, baseZoom: view().zoom };
    target.classList.add('panning');
  };
  const longPress = (id: number): void => {
    const p = pointers.get(id);
    if (!drag || drag.kind !== 'pending' || drag.id !== id || !p || movedFar(p)) return;
    drag.timer = null; drag = null;
    p.dead = true;
    const tile = tileAtLocal(p.x, p.y);
    if (tile) pickQuery(tile.x, tile.y);
  };

  function onDown(e: PointerEvent): void {
    if (pointers.size >= 3) return;
    const [lx, ly] = local(e.clientX, e.clientY);
    const p: Ptr = { id: e.pointerId, type: e.pointerType || 'mouse', x: lx, y: ly, x0: lx, y0: ly, t0: now(), button: e.button, dead: false, moved: false };
    pointers.set(p.id, p);
    capture(e);
    if (e.button === 1) e.preventDefault();
    if (p.type === 'touch') {
      const live = [...pointers.values()].filter((q) => !q.dead).length;
      if (live === 1 && !drag) {
        drag = { kind: 'pending', id: p.id, timer: setTimeout(() => longPress(p.id), GESTURE.longPressMs) };
      } else if (live === 2) {
        cancelDrag();                        // 第二指落下：放弃单指的工具 / 点按，进入双指
        startPinch();
      }
      return;
    }
    // 鼠标 / 笔
    if (drag) return;                        // 已有拖动（例如右键平移中按左键）：忽略
    if (e.button === 1 || e.button === 2) { startPan(p, e.button === 2); return; }
    if (e.button !== 0) return;
    const tile = tileAt(e.clientX, e.clientY);
    if (mode === 'Line' || mode === 'Rect' || mode === 'Paint') { if (tile || mode === 'Paint') startToolDrag(p); }
    else drag = { kind: 'press', id: p.id };
  }
  function onMove(e: PointerEvent): void {
    const p = ptrOf(e);
    const [lx, ly] = local(e.clientX, e.clientY);
    if (!p) { if (!drag) updateHover(tileAtLocal(lx, ly)); return; }
    const dx = lx - p.x, dy = ly - p.y;
    p.x = lx; p.y = ly;
    if (movedFar(p)) p.moved = true;
    if (p.dead) return;
    if (!drag) { updateHover(tileAtLocal(lx, ly)); return; }
    if (!dragOwns(drag, p.id)) return;
    switch (drag.kind) {
      case 'pending':
        if (!p.moved) return;
        clearTimer(drag);
        if (mode && !PAN_ON_DRAG_MODES.has(mode)) startToolDrag(p);
        else { startPan(p, false); panPixels(lx - p.x0, ly - p.y0); }
        return;
      case 'pan': panPixels(dx, dy); drag.x = lx; drag.y = ly; return;
      case 'line': { const tile = tileAtLocal(lx, ly); if (tile && !sameTile(tile, drag.to)) { drag.to = tile; updateLine(drag); } return; }
      case 'rect': { const tile = tileAtLocal(lx, ly); if (tile && !sameTile(tile, drag.to)) { drag.to = tile; updateRect(drag); } return; }
      case 'paint': paintAt(drag, tileAtLocal(lx, ly)); return;
      case 'press': if (mode === 'Click' || mode === 'Place') updateHover(tileAtLocal(lx, ly)); return;
      case 'pinch': {
        const a = pointers.get(drag.a), b = pointers.get(drag.b);
        if (!a || !b) return;
        const [cx, cy] = mid(a.x, a.y, b.x, b.y);
        panPixels(cx - drag.cx, cy - drag.cy);
        drag.cx = cx; drag.cy = cy;
        drag.tracker.update(dist(a.x, a.y, b.x, b.y));
        const want = clamp(drag.baseZoom + drag.tracker.level(), ZOOM_MIN, ZOOM_MAX);
        if (want !== view().zoom) setZoom(want, { px: cx, py: cy });
        return;
      }
    }
  }
  function onUp(e: PointerEvent, cancelled: boolean): void {
    const p = ptrOf(e);
    if (!p) return;
    const [lx, ly] = local(e.clientX, e.clientY);
    p.x = lx; p.y = ly;
    pointers.delete(p.id);
    if (p.dead) { if (pointers.size === 0) cancelDrag(); return; }
    if (!drag || !dragOwns(drag, p.id)) return;
    const d = drag;
    switch (d.kind) {
      case 'pending': {
        clearTimer(d); drag = null;
        if (cancelled || p.moved) return;
        const tile = tileAtLocal(lx, ly);
        const tnow = now();
        if (lastTap && tnow - lastTap.t <= GESTURE.doubleTapMs && dist(lastTap.x, lastTap.y, lx, ly) <= GESTURE.doubleTapPx) { lastTap = null; doubleTap(tile); return; }
        lastTap = { t: tnow, x: lx, y: ly };
        tapAt(tile, lx, ly);
        return;
      }
      case 'press': { drag = null; if (!cancelled && !p.moved) tapAt(tileAtLocal(lx, ly), lx, ly); else updateHover(tileAtLocal(lx, ly)); return; }
      case 'pan': {
        drag = null; target.classList.remove('panning');
        if (!cancelled && d.rightClick && !p.moved) { const tile = tileAtLocal(lx, ly); if (tile) pickQuery(tile.x, tile.y); }
        return;
      }
      case 'line': { drag = null; if (cancelled) { setPreview(null); toolHint(baseCost()); } else commit(lineCmd(d.from, d.to)); return; }
      case 'rect': { drag = null; if (cancelled) { setPreview(null); toolHint(baseCost()); } else commit(rectCmd(d.from, d.to)); return; }
      case 'paint': { drag = null; setPreview(null); toolHint(baseCost()); return; }
      case 'pinch': {
        // 松手：档位已是整数（吸附完成）；另一指标记为 dead，直到抬起前不触发任何工具
        const other = pointers.get(d.a === p.id ? d.b : d.a);
        if (other) other.dead = true;
        drag = null; target.classList.remove('panning');
        return;
      }
    }
  }
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (e.deltaY === 0) return;
    const [px, py] = local(e.clientX, e.clientY);
    zoomBy(e.deltaY < 0 ? 1 : -1, { px, py });
  };
  const onLeave = (): void => { if (!drag) clearHover(); };
  const onContext = (e: Event): void => { e.preventDefault(); };
  const downL = (e: PointerEvent): void => onDown(e);
  const moveL = (e: PointerEvent): void => onMove(e);
  const upL = (e: PointerEvent): void => onUp(e, false);
  const cancelL = (e: PointerEvent): void => onUp(e, true);
  target.addEventListener('pointerdown', downL);
  target.addEventListener('pointermove', moveL);
  target.addEventListener('pointerup', upL);
  target.addEventListener('pointercancel', cancelL);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('contextmenu', onContext);

  // ---------------- 键盘 ----------------
  const togglePause = (): void => {
    const s = host.state.clock.speed;
    if (s === 1) host.dispatch({ type: 'setSpeed', speed: lastRunSpeed });
    else { lastRunSpeed = s; host.dispatch({ type: 'setSpeed', speed: 1 }); }
  };
  function handleKey(e: KeyboardEvent): boolean {
    if (isTypingTarget(e.target)) return false;
    const a = resolveKey(e);
    if (!a) return false;
    switch (a.kind) {
      case 'pauseToggle': togglePause(); break;
      case 'speed': if (a.speed !== 1) lastRunSpeed = a.speed; host.dispatch({ type: 'setSpeed', speed: a.speed }); break;
      case 'zoom': zoomBy(a.delta); break;
      case 'rotate': rotateBy(a.delta); break;
      case 'pan': panTiles(a.dx, a.dy); break;
      case 'home': centerHome(); break;
      case 'underground': undergroundByTool = false; setUnderground(!view().underground); break;
      case 'show': toggleShow(a.key); break;
      case 'group': if (deps.onGroupKey) deps.onGroupKey(a.group); else return false; break;
      case 'nextSubtool': if (deps.onNextSubtool) deps.onNextSubtool(); else return false; break;
      case 'window': deps.openWindow(a.id); break;
      case 'escape': if (!cancelDrag() && !(deps.onEscape?.() ?? false)) return false; break;
      case 'save': if (deps.onSave) deps.onSave(); else return false; break;
    }
    e.preventDefault();
    return true;
  }

  return {
    setTool, getTool: () => tool, getMode: () => mode,
    isDragging: () => drag !== null && drag.kind !== 'pending' && drag.kind !== 'press',
    cancelDrag, handleKey, zoomBy, setZoom, rotateBy, panTiles, centerOn, centerHome, setUnderground, toggleShow, pickQuery, togglePause,
    destroy() {
      cancelDrag();
      pointers.clear();
      target.removeEventListener('pointerdown', downL);
      target.removeEventListener('pointermove', moveL);
      target.removeEventListener('pointerup', upL);
      target.removeEventListener('pointercancel', cancelL);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('contextmenu', onContext);
      target.classList.remove('help', 'panning');
    },
  };
}
/** 便于外壳 / 测试：某格的世界坐标。 */
export const tileXY = (i: number): Tile => ({ x: tileX(i), y: tileY(i) });
