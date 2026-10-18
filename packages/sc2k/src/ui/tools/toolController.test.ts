// @vitest-environment happy-dom
// ===== ui/tools/toolController.test.ts =====（WORKPLAN WP12 验收：十模式转移、Line 轴向实时切换、Rect 预览、Esc 语义栈、费用预览不消费 PRNG、
// 双指捏合 1.6 → 升一档并吸附整数档、单指拖动在 Place 工具下平移、长按 500 ms = Query、管线工具自动地下视图且切回道路退出）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RendererApi } from '../../contracts/rendererApi';
import type { ViewState } from '../../contracts/render';
import type { Command, CommandResult, PlacementPreview, ToolMode } from '../../contracts/commands';
import type { WindowId } from '../../contracts/shell';
import type { SimHost } from '../../contracts/host';
import { tileIndex } from '../../contracts/grid';
import { CATALOGUE, createStrings } from '../../data';
import { createTestContext } from '../../testkit';
import { createToolController, ZOOM_MAX, ZOOM_MIN } from './toolController';
import type { ToolController } from './toolController';
import { HELP_TOOL, modeOf } from './modes';
import { GESTURE, createPinchTracker, panDelta } from './gestures';
import { resolveKey } from './keymap';

const TILE_PX = 10;   // 假渲染器：屏幕 10 px = 1 格（pick / screenOf 互逆）
interface FakeRenderer extends RendererApi { previews: (PlacementPreview | null)[]; gotos: [number, number][] }
function fakeRenderer(): FakeRenderer {
  let view: ViewState = { zoom: 2, rotation: 0, centerX: 64, centerY: 64, underground: false, show: { buildings: true, signs: true, infrastructure: true, zones: true }, mapLayer: null };
  const clone = (v: ViewState): ViewState => ({ ...v, show: { ...v.show } });
  const r: FakeRenderer = {
    previews: [], gotos: [],
    attach: async () => undefined, destroy: () => undefined, resize: () => undefined, setSource: () => undefined, setProvider: () => undefined,
    setView: (v) => { view = clone(v); }, getView: () => clone(view),
    goto: (x, y) => { view.centerX = x; view.centerY = y; r.gotos.push([x, y]); },
    frame: () => undefined, setPreview: (p) => { r.previews.push(p); }, setActors: () => undefined, setHeatLayer: () => undefined,
    pick: (px, py) => { const x = Math.floor(px / TILE_PX), y = Math.floor(py / TILE_PX); return x >= 0 && y >= 0 && x < 128 && y < 128 ? { x, y } : null; },
    screenOf: (x, y) => [x * TILE_PX + TILE_PX / 2, y * TILE_PX + TILE_PX / 2],
    minimap: () => undefined, thumbnail: async () => new Uint8Array(0), stats: () => ({ sprites: 0, drawCalls: 0, bandRebuilds: 0, frameMs: 0, vramBytes: 0 }),
  };
  return r;
}
/** 构造 PointerEvent（happy-dom 若不支持 pointerId / pointerType 初始化则补定义）。 */
function ptr(type: string, o: { id?: number; kind?: 'mouse' | 'touch'; x: number; y: number; button?: number }): PointerEvent {
  const init = { pointerId: o.id ?? 1, pointerType: o.kind ?? 'mouse', clientX: o.x, clientY: o.y, button: o.button ?? 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true };
  const e = new PointerEvent(type, init);
  if ((e as { pointerId?: number }).pointerId !== init.pointerId) Object.defineProperty(e, 'pointerId', { value: init.pointerId });
  if ((e as { pointerType?: string }).pointerType !== init.pointerType) Object.defineProperty(e, 'pointerType', { value: init.pointerType });
  if (e.clientX !== o.x) { Object.defineProperty(e, 'clientX', { value: o.x }); Object.defineProperty(e, 'clientY', { value: o.y }); }
  if (e.button !== init.button) Object.defineProperty(e, 'button', { value: init.button });
  return e;
}
const key = (k: string, mods: Partial<Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey'>> = {}): KeyboardEvent => new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });

interface Rig {
  host: SimHost; renderer: FakeRenderer; target: HTMLElement; ctl: ToolController;
  cmds: Command[]; picked: [number, number][]; opened: WindowId[]; escapes: number; now: { t: number };
  down(x: number, y: number, o?: { id?: number; kind?: 'mouse' | 'touch'; button?: number }): void;
  move(x: number, y: number, o?: { id?: number; kind?: 'mouse' | 'touch' }): void;
  up(x: number, y: number, o?: { id?: number; kind?: 'mouse' | 'touch'; button?: number }): void;
  lastPreview(): PlacementPreview | null;
}
function rig(): Rig {
  const { host } = createTestContext();
  const renderer = fakeRenderer();
  const target = document.createElement('div');
  document.body.appendChild(target);
  const strings = createStrings('zh');
  const cmds: Command[] = [];
  const picked: [number, number][] = [];
  const opened: WindowId[] = [];
  const now = { t: 1000 };
  const r: Rig = {
    host, renderer, target, cmds, picked, opened, escapes: 0, now,
    ctl: createToolController({
      host, renderer, strings, target,
      dispatch: (cmd: Command): CommandResult => { cmds.push(cmd); return host.dispatch(cmd); },
      onMessage: () => undefined,
      onTilePicked: (x, y) => { picked.push([x, y]); },
      openWindow: (id) => { opened.push(id); },
      onEscape: () => { r.escapes++; return true; },
      now: () => now.t,
    }),
    down: (x, y, o = {}) => { target.dispatchEvent(ptr('pointerdown', { x, y, ...o })); },
    move: (x, y, o = {}) => { target.dispatchEvent(ptr('pointermove', { x, y, ...o })); },
    up: (x, y, o = {}) => { target.dispatchEvent(ptr('pointerup', { x, y, ...o })); },
    lastPreview: () => renderer.previews[renderer.previews.length - 1] ?? null,
  };
  return r;
}
const T = (x: number, y: number): number => tileIndex(x, y);

describe('视图元素不在页面 (0,0)（菜单栏下方）时的落格（INT-B 回归：局部坐标不得再减一次 rect）', () => {
  const OFF = { left: 10, top: 24 };
  let R: Rig;
  beforeEach(() => {
    R = rig();
    R.target.getBoundingClientRect = () => ({ left: OFF.left, top: OFF.top, x: OFF.left, y: OFF.top, width: 800, height: 600, right: OFF.left + 800, bottom: OFF.top + 600, toJSON: () => ({}) });
  });
  afterEach(() => { R.ctl.destroy(); R.target.remove(); });
  const client = (tx: number, ty: number): [number, number] => [OFF.left + tx * TILE_PX + 5, OFF.top + ty * TILE_PX + 5];
  it('Query 点按 / 右键查询 / 长按 命中指针所在格', () => {
    R.ctl.setTool('query');
    R.down(...client(5, 3)); R.up(...client(5, 3));
    expect(R.picked.at(-1)).toEqual([5, 3]);
    R.ctl.setTool('roads.road');
    R.down(...client(7, 9), { button: 2 }); R.up(...client(7, 9), { button: 2 });
    expect(R.picked.at(-1)).toEqual([7, 9]);
    vi.useFakeTimers();
    try {
      R.down(...client(2, 6), { kind: 'touch' }); vi.advanceTimersByTime(GESTURE.longPressMs + 10);
      expect(R.picked.at(-1)).toEqual([2, 6]);
      R.up(...client(2, 6), { kind: 'touch' });
    } finally { vi.useRealTimers(); }
  });
  it('Line 的起点 / Paint 的首格 = 按下时的指针格', () => {
    R.ctl.setTool('roads.road');
    R.down(...client(4, 4)); R.move(...client(9, 4)); R.up(...client(9, 4));
    const net = R.cmds.find((c) => c.type === 'network');
    expect(net && net.type === 'network' ? [net.from, net.to] : null).toEqual([tileIndex(4, 4), tileIndex(9, 4)]);
    R.ctl.setTool('bulldozer.demolish');
    R.cmds.length = 0;
    R.down(...client(6, 2)); R.up(...client(6, 2));
    const bd = R.cmds.find((c) => c.type === 'bulldoze');
    expect(bd && bd.type === 'bulldoze' ? bd.tiles : null).toEqual([tileIndex(6, 2)]);
  });
});

describe('modeOf：十种操作模式各有代表工具（spec:ui-art §2.8）', () => {
  const cases: Array<[string, ToolMode]> = [
    ['power.wind', 'Click'], ['bulldozer.raise', 'Click'], ['parks.small', 'Click'], ['water.pump', 'Click'],
    ['bulldozer.demolish', 'Paint'], ['nature.trees', 'Paint'], ['dispatch.police', 'Paint'],
    ['roads.road', 'Line'], ['power.wires', 'Line'], ['water.pipes', 'Line'],
    ['zone.rLight', 'Rect'], ['bulldozer.dezone', 'Rect'],
    ['power.coal', 'Place'], ['water.tower', 'Place'], ['rail.depot', 'Place'], ['services.hospital', 'Place'],
    ['query', 'Query'], ['signs.place', 'Sign'], ['center', 'Center'], ['dispatch.military', 'Dispatch'],
  ];
  it.each(cases)('%s → %s', (id, mode) => { expect(modeOf(CATALOGUE.toolById(id), id)).toBe(mode); });
  it('帮助伪工具 → Help；未知 id → null', () => { expect(modeOf(undefined, HELP_TOOL)).toBe('Help'); expect(modeOf(undefined, 'nope')).toBe(null); });
  it('每个目录工具都落在十模式之一（目录覆盖 Help 之外的九种；Help 为工具栏伪工具）', () => {
    const modes = new Set<ToolMode>();
    for (const d of CATALOGUE.TOOLS) { const m = modeOf(d, d.id); expect(m, d.id).not.toBeNull(); modes.add(m!); }
    expect([...modes].sort()).toEqual(['Center', 'Click', 'Dispatch', 'Line', 'Paint', 'Place', 'Query', 'Rect', 'Sign'].sort());
  });
});

describe('ToolController（happy-dom）', () => {
  let R: Rig;
  beforeEach(() => { R = rig(); });
  afterEach(() => { R.ctl.destroy(); R.target.remove(); vi.useRealTimers(); });

  it('setTool：十模式转移 + 工具提示；未知工具视为 null', () => {
    const seq: Array<[string | null, ToolMode | null]> = [['power.wind', 'Click'], ['bulldozer.demolish', 'Paint'], ['roads.road', 'Line'], ['zone.rLight', 'Rect'], ['power.coal', 'Place'], ['query', 'Query'], ['signs.place', 'Sign'], ['center', 'Center'], ['dispatch.military', 'Dispatch'], [HELP_TOOL, 'Help'], ['not.a.tool', null], [null, null]];
    for (const [id, mode] of seq) { R.ctl.setTool(id); expect(R.ctl.getMode(), String(id)).toBe(mode); }
    R.ctl.setTool('query'); expect(R.ctl.getTool()).toBe('query');
  });

  it('Line：拖动中端点取位移大的轴并实时切换；松开整段原子提交', () => {
    R.ctl.setTool('roads.road');
    R.down(25, 25);                       // 格 (2,2)
    R.move(65, 35);                       // 格 (6,3)：|dx| ≥ |dy| → 水平线 y=2
    let p = R.lastPreview()!;
    expect(p.tiles.map((t) => t.i)).toEqual([T(2, 2), T(3, 2), T(4, 2), T(5, 2), T(6, 2)]);
    expect(p.cost).toBe(5 * 10);          // 桩 preview 无 tiles → 几何合成 + costOf(road, 5)
    R.move(35, 75);                       // 格 (3,7)：|dy| > |dx| → 竖线 x=2
    p = R.lastPreview()!;
    expect(p.tiles.map((t) => t.i)).toEqual([T(2, 2), T(2, 3), T(2, 4), T(2, 5), T(2, 6), T(2, 7)]);
    expect(R.cmds).toHaveLength(0);       // 拖动中不派发
    expect(R.ctl.isDragging()).toBe(true);
    R.up(35, 75);
    expect(R.cmds).toEqual([{ type: 'network', kind: 'road', from: T(2, 2), to: T(2, 7) }]);
    expect(R.lastPreview()).toBeNull();
    expect(R.ctl.isDragging()).toBe(false);
  });

  it('Rect：预览矩形内每格 + 总价；松开派发 zoneRect', () => {
    R.ctl.setTool('zone.rLight');
    R.down(25, 25); R.move(55, 45);       // (2,2) → (5,4)：4×3
    const p = R.lastPreview()!;
    expect(p.tiles).toHaveLength(12);
    expect(p.tiles.every((t) => t.ok)).toBe(true);
    expect(p.cost).toBe(12 * 5);
    R.up(55, 45);
    expect(R.cmds).toEqual([{ type: 'zoneRect', zone: 1, x0: 2, y0: 2, x1: 5, y1: 4 }]);
  });

  it('Esc 语义栈：拖动中 → 取消拖动（不派发、清预览）；无拖动 → 交给外层', () => {
    R.ctl.setTool('roads.road');
    R.down(25, 25); R.move(85, 25);
    expect(R.ctl.handleKey(key('Escape'))).toBe(true);
    expect(R.ctl.isDragging()).toBe(false);
    expect(R.lastPreview()).toBeNull();
    expect(R.escapes).toBe(0);
    R.up(85, 25);
    expect(R.cmds).toHaveLength(0);
    expect(R.ctl.handleKey(key('Escape'))).toBe(true);
    expect(R.escapes).toBe(1);
  });

  it('费用预览不消费 PRNG：Place 悬停预览给出整块占地与总价，prng.state() 前后相等', () => {
    R.ctl.setTool('power.coal');          // 4×4
    const before = R.host.state.clock.prngState;
    R.move(305, 305);                     // 指针格 (30,30) → 锚格 (29,29)
    const p = R.lastPreview()!;
    expect(p.footprint).toEqual({ x0: 29, y0: 29, size: 4 });
    expect(p.tiles).toHaveLength(16);
    expect(p.cost).toBe(CATALOGUE.BUILDINGS[0xcf]!.cost);
    R.move(306, 306);                     // 同格：不重算
    const n = R.renderer.previews.length;
    R.move(307, 304);
    expect(R.renderer.previews.length).toBe(n);
    expect(R.host.state.clock.prngState).toBe(before);
    expect(R.cmds).toHaveLength(0);
  });

  it('Click 工具：松开且未移动时提交 placeBuilding（1×1 锚格 = 指针格）', () => {
    R.ctl.setTool('power.wind');
    R.down(45, 65); R.up(46, 66);
    expect(R.cmds).toEqual([{ type: 'placeBuilding', id: 0xc8, x: 4, y: 6 }]);
    R.down(45, 65); R.move(95, 65); R.up(95, 65);   // 移动超过阈值：不提交
    expect(R.cmds).toHaveLength(1);
  });

  it('Paint：按下即生效，拖动沿途每格各一次，同格不重复', () => {
    R.ctl.setTool('bulldozer.demolish');
    R.down(15, 15); R.move(16, 16); R.move(25, 15); R.move(15, 15); R.up(15, 15);
    expect(R.cmds).toEqual([{ type: 'bulldoze', tiles: [T(1, 1)] }, { type: 'bulldoze', tiles: [T(2, 1)] }]);
  });

  it('双指捏合：累计 1.6 → 升一档；松手吸附整数档；滞回内回落不退档', () => {
    R.ctl.setTool('power.coal');
    const z0 = R.renderer.getView().zoom;
    R.down(100, 100, { id: 1, kind: 'touch' });
    R.down(200, 100, { id: 2, kind: 'touch' });          // 距离 100
    R.move(230, 100, { id: 2, kind: 'touch' });          // 1.3：未到 1.5
    expect(R.renderer.getView().zoom).toBe(z0);
    R.move(260, 100, { id: 2, kind: 'touch' });          // 1.6 → +1
    expect(R.renderer.getView().zoom).toBe(z0 + 1);
    R.move(240, 100, { id: 2, kind: 'touch' });          // 1.4：在 1.5 × 0.9 = 1.35 之上 → 保持
    expect(R.renderer.getView().zoom).toBe(z0 + 1);
    R.up(240, 100, { id: 2, kind: 'touch' });
    R.up(100, 100, { id: 1, kind: 'touch' });
    const z = R.renderer.getView().zoom;
    expect(Number.isInteger(z)).toBe(true);
    expect(z).toBe(z0 + 1);
    expect(R.cmds).toHaveLength(0);                      // 双指不触发放置
  });

  it('捏合追踪器：1.5 / 0.67 阈值与 10% 滞回', () => {
    const p = createPinchTracker(100);
    expect(p.update(160)).toBe(1); expect(p.level()).toBe(1);
    expect(p.update(140)).toBe(0); expect(p.level()).toBe(1);
    expect(p.update(130)).toBe(-1); expect(p.level()).toBe(0);
    expect(p.update(67)).toBe(-1); expect(p.level()).toBe(-1);
    expect(p.update(72)).toBe(0); expect(p.level()).toBe(-1);   // 0.72 < 0.67 × 1.1 = 0.737
    expect(p.update(75)).toBe(1); expect(p.level()).toBe(0);
    expect(p.update(240)).toBe(2); expect(p.level()).toBe(2);   // 2.4 ≥ 2.25
    expect(GESTURE.pinchIn).toBe(1.5);
  });

  it('单指拖动：Place 工具下 = 平移而非放置；Line 工具下 = 工具拖', () => {
    R.ctl.setTool('power.coal');
    const v0 = R.renderer.getView();
    R.down(100, 100, { kind: 'touch' }); R.move(140, 130, { kind: 'touch' }); R.up(140, 130, { kind: 'touch' });
    const v1 = R.renderer.getView();
    const [ex, ey] = panDelta(v0, 40, 30);
    expect(v1.centerX).toBeCloseTo(v0.centerX - ex, 5);
    expect(v1.centerY).toBeCloseTo(v0.centerY - ey, 5);
    expect(R.cmds).toHaveLength(0);
    R.ctl.setTool('roads.road');
    R.down(25, 25, { kind: 'touch' }); R.move(85, 25, { kind: 'touch' }); R.up(85, 25, { kind: 'touch' });
    expect(R.cmds).toEqual([{ type: 'network', kind: 'road', from: T(2, 2), to: T(8, 2) }]);
    expect(R.renderer.getView().centerX).toBeCloseTo(v1.centerX, 5);
  });

  it('长按 500 ms → Query（任何工具下），松手不再放置', () => {
    vi.useFakeTimers();
    R.ctl.setTool('power.wind');
    R.down(45, 65, { kind: 'touch' });
    vi.advanceTimersByTime(GESTURE.longPressMs - 1);
    expect(R.opened).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(R.opened).toEqual(['query']);
    expect(R.picked).toEqual([[4, 6]]);
    R.up(45, 65, { kind: 'touch' });
    expect(R.cmds).toHaveLength(0);
  });

  it('触控点按 = 工具；双击 = 放大一档并居中', () => {
    R.ctl.setTool('query');
    R.now.t = 1000;
    R.down(45, 65, { kind: 'touch' }); R.up(45, 65, { kind: 'touch' });
    expect(R.opened).toEqual(['query']);
    R.now.t = 1200;
    const z0 = R.renderer.getView().zoom;
    R.down(46, 66, { kind: 'touch' }); R.up(46, 66, { kind: 'touch' });
    const v = R.renderer.getView();
    expect(v.zoom).toBe(z0 + 1);
    expect([v.centerX, v.centerY]).toEqual([4, 6]);
  });

  it('选中管线工具自动进入地下视图；切回道路工具退出；手动 U 切换不受工具影响', () => {
    R.ctl.setTool('water.pipes');
    expect(R.renderer.getView().underground).toBe(true);
    R.ctl.setTool('roads.road');
    expect(R.renderer.getView().underground).toBe(false);
    expect(R.ctl.handleKey(key('u'))).toBe(true);
    expect(R.renderer.getView().underground).toBe(true);
    R.ctl.setTool('power.wires');                      // 非地下工具：不改手动开启的地下视图
    expect(R.renderer.getView().underground).toBe(true);
  });

  it('鼠标：右键单击 = Query，右键拖 = 平移；滚轮 = 缩放一档', () => {
    R.ctl.setTool('power.coal');
    R.down(45, 65, { button: 2 }); R.up(45, 65, { button: 2 });
    expect(R.opened).toEqual(['query']); expect(R.picked).toEqual([[4, 6]]);
    const v0 = R.renderer.getView();
    R.down(100, 100, { button: 2 }); R.move(160, 100); R.up(160, 100, { button: 2 });
    expect(R.renderer.getView().centerX).not.toBe(v0.centerX);
    expect(R.opened).toHaveLength(1);
    const z = R.renderer.getView().zoom;
    R.target.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 50, clientY: 50, bubbles: true, cancelable: true }));
    expect(R.renderer.getView().zoom).toBe(Math.min(ZOOM_MAX, z + 1));
    R.target.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 50, clientY: 50, bubbles: true, cancelable: true }));
    expect(R.renderer.getView().zoom).toBe(z);
    for (let k = 0; k < 6; k++) R.ctl.zoomBy(-1);
    expect(R.renderer.getView().zoom).toBe(ZOOM_MIN);
  });

  it('键盘表：Space 暂停 / 恢复、1–4 速度、[ ] 旋转、Shift+B 窗口、Ctrl+S 交给 onSave', () => {
    expect(R.ctl.handleKey(key('3'))).toBe(true);
    expect(R.host.state.clock.speed).toBe(4);           // '3' = 第三档运行速度 = Speed 4
    R.ctl.handleKey(key(' '));
    expect(R.host.state.clock.speed).toBe(1);
    R.ctl.handleKey(key(' '));
    expect(R.host.state.clock.speed).toBe(4);
    R.ctl.handleKey(key('['));
    expect(R.renderer.getView().rotation).toBe(1);
    R.ctl.handleKey(key(']'));
    expect(R.renderer.getView().rotation).toBe(0);
    R.ctl.handleKey(key('B', { shiftKey: true }));
    expect(R.opened).toEqual(['budget']);
    const e = key('s', { ctrlKey: true });
    expect(R.ctl.handleKey(e)).toBe(false);             // 未注入 onSave → 不处理（不 preventDefault）
    expect(resolveKey({ key: 's', code: 'KeyS', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toEqual({ kind: 'save' });
    const input = document.createElement('input'); document.body.appendChild(input);
    const typed = new KeyboardEvent('keydown', { key: ' ', bubbles: true }); Object.defineProperty(typed, 'target', { value: input });
    expect(R.ctl.handleKey(typed)).toBe(false);          // 输入框内不响应
    input.remove();
  });
});
