// ===== ui/tools/keymap.ts =====（spec:ui-art §2.8 键盘表；WP0 既成事实 7：全局键由 UI 表定义，冲突时 UI 表优先）
// 把 KeyboardEvent 解析成外壳动作。F5 / F11 / F12 不绑定；Ctrl+S 拦截为保存（调用方 preventDefault）；Ctrl+O 不拦截。
import type { ToolGroup } from '../../contracts/catalogue';
import type { WindowId } from '../../contracts/shell';
import type { Speed } from '../../contracts/state';

export type KeyAction =
  | { kind: 'pauseToggle' } | { kind: 'speed'; speed: Speed }
  | { kind: 'zoom'; delta: 1 | -1 } | { kind: 'rotate'; delta: 1 | -1 }
  | { kind: 'pan'; dx: number; dy: number } | { kind: 'home' } | { kind: 'underground' }
  | { kind: 'show'; key: 'buildings' | 'signs' | 'infrastructure' | 'zones' }
  | { kind: 'group'; group: ToolGroup } | { kind: 'nextSubtool' }
  | { kind: 'window'; id: WindowId } | { kind: 'escape' } | { kind: 'save' };

/** 工具组键（无修饰）。 */
const GROUP_KEYS: Readonly<Record<string, ToolGroup>> = {
  b: 'bulldozer', t: 'nature', e: 'dispatch', r: 'roads', l: 'rail', w: 'power', a: 'water', h: 'ports',
  z: 'residential', c: 'commercial', i: 'industrial', d: 'education', s: 'services', k: 'parks', n: 'signs', q: 'query', m: 'rewards',
};
/** Shift + 字母 → 窗口。 */
const WINDOW_KEYS: Readonly<Record<string, WindowId>> = { b: 'budget', m: 'map', g: 'graphs', p: 'population', i: 'industries', n: 'neighbors', o: 'ordinances', w: 'newspaper' };
const PAN_STEP = 1, PAN_FAST = 8;

/** 焦点在文本输入控件内时不响应全局键。 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function resolveKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): KeyAction | null {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key;
  const lower = k.length === 1 ? k.toLowerCase() : k;
  if (e.altKey) return null;
  if (ctrl) {
    if (lower === 's') return { kind: 'save' };
    if (k >= '1' && k <= '4') return { kind: 'speed', speed: (Number(k) + 1) as Speed };   // Ctrl+1 = Turtle（原版）
    return null;
  }
  if (k === 'Escape') return { kind: 'escape' };
  if (k === ' ' || (lower === 'p' && !e.shiftKey)) return { kind: 'pauseToggle' };
  if (!e.shiftKey && k >= '1' && k <= '4') return { kind: 'speed', speed: (Number(k) + 1) as Speed };
  if (k === '+' || k === '=' || k === 'PageUp') return { kind: 'zoom', delta: 1 };
  if (k === '-' || k === '_' || k === 'PageDown') return { kind: 'zoom', delta: -1 };
  if (k === '[') return { kind: 'rotate', delta: 1 };
  if (k === ']') return { kind: 'rotate', delta: -1 };
  if (k === 'Home') return { kind: 'home' };
  if (k === 'Tab') return { kind: 'nextSubtool' };
  const step = e.shiftKey ? PAN_FAST : PAN_STEP;
  if (k === 'ArrowLeft') return { kind: 'pan', dx: -step, dy: 0 };
  if (k === 'ArrowRight') return { kind: 'pan', dx: step, dy: 0 };
  if (k === 'ArrowUp') return { kind: 'pan', dx: 0, dy: -step };
  if (k === 'ArrowDown') return { kind: 'pan', dx: 0, dy: step };
  if (k === 'F6') return { kind: 'show', key: 'buildings' };
  if (k === 'F7') return { kind: 'show', key: 'signs' };
  if (k === 'F8') return { kind: 'show', key: 'infrastructure' };
  if (k === 'F9') return { kind: 'show', key: 'zones' };
  if (k.length === 1) {
    if (e.shiftKey) { const w = WINDOW_KEYS[lower]; return w ? { kind: 'window', id: w } : null; }
    if (lower === 'u') return { kind: 'underground' };
    const g = GROUP_KEYS[lower];
    if (g) return { kind: 'group', group: g };
  }
  return null;
}
