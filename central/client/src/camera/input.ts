/**
 * 相机输入：
 * - 鼠标：左键拖动旋转，右键（或 Shift/Ctrl + 左键、中键）拖动平移，滚轮缩放；
 * - 触屏：单指旋转，双指捏合缩放 + 平移 + 扭转；
 * - 键盘：WASD / 方向键平移，Q/E 旋转，R/F 或 +/− 缩放。
 */
import type { OrbitRig } from './rig';

interface Ptr {
  x: number;
  y: number;
  pan: boolean;
}

export interface CameraInput {
  tick(dt: number): void;
  dispose(): void;
}

export function attachCameraInput(el: HTMLElement, rig: OrbitRig, fov: () => number): CameraInput {
  const ptrs = new Map<number, Ptr>();
  let pinch: { d: number; a: number; cx: number; cy: number } | null = null;
  const keys = new Set<string>();

  const panPx = (dx: number, dy: number) => {
    const m = rig.metresPerPixel(fov(), el.clientHeight);
    rig.pan(-dx * m, dy * m);
  };
  const rotatePx = (dx: number, dy: number) => {
    const h = Math.max(el.clientHeight, 1);
    rig.rotate((-dx / h) * Math.PI * 0.9, (dy / h) * Math.PI * 0.6);
  };
  const twoFinger = () => {
    const [a, b] = [...ptrs.values()] as [Ptr, Ptr];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  const down = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    const pan = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || e.shiftKey || e.ctrlKey);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, pan });
    pinch = ptrs.size === 2 ? twoFinger() : null;
  };
  const move = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptrs.size === 1) {
      if (p.pan) panPx(dx, dy);
      else rotatePx(dx, dy);
    } else if (ptrs.size === 2 && pinch) {
      const now = twoFinger();
      if (now.d > 1 && pinch.d > 1) rig.zoom(pinch.d / now.d);
      panPx(now.cx - pinch.cx, now.cy - pinch.cy);
      const da = Math.atan2(Math.sin(now.a - pinch.a), Math.cos(now.a - pinch.a));
      rig.rotate(-da, 0);
      pinch = now;
    }
  };
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    pinch = ptrs.size === 2 ? twoFinger() : null;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    rig.zoom(Math.exp(Math.max(Math.min(dy, 200), -200) * 0.0015));
  };
  const noMenu = (e: Event) => e.preventDefault();
  const keyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.key.toLowerCase());
  };
  const keyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const blur = () => keys.clear();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', noMenu);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);

  const held = (...ks: string[]) => ks.some((k) => keys.has(k));
  return {
    tick(dt) {
      if (keys.size === 0) return;
      const step = rig.current.distance * 0.9 * dt;
      const r = (held('d', 'arrowright') ? 1 : 0) - (held('a', 'arrowleft') ? 1 : 0);
      const f = (held('w', 'arrowup') ? 1 : 0) - (held('s', 'arrowdown') ? 1 : 0);
      if (r || f) rig.pan(r * step, f * step);
      const turn = (held('q') ? 1 : 0) - (held('e') ? 1 : 0);
      if (turn) rig.rotate(turn * 1.2 * dt, 0);
      const z = (held('f', '-') ? 1 : 0) - (held('r', '+', '=') ? 1 : 0);
      if (z) rig.zoom(Math.exp(z * 1.5 * dt));
    },
    dispose() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    },
  };
}
