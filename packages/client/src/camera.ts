/**
 * 2D 相机：拖拽平移 + 滚轮缩放（以光标为锚点）。
 * 触控双指手势在 M8 接入同一接口。
 */
import type { Application, Container } from 'pixi.js';

export class Camera {
  /** 屏幕中心对应的世界坐标。 */
  x = 0;
  y = 0;
  zoom = 1;
  minZoom = 0.2;
  maxZoom = 3;
  /** 爆炸震屏幅度（像素，纯表现，会逐帧衰减）。 */
  private shakeAmp = 0;

  constructor(
    private readonly app: Application,
    private readonly world: Container,
  ) {}

  apply(): void {
    const { width, height } = this.app.screen;
    this.world.scale.set(this.zoom);
    // 震屏抖动（仅在 position 上叠加，不改 x/y，故不累积漂移）
    const jx = this.shakeAmp > 0 ? (Math.random() * 2 - 1) * this.shakeAmp : 0;
    const jy = this.shakeAmp > 0 ? (Math.random() * 2 - 1) * this.shakeAmp : 0;
    this.world.position.set(width / 2 - this.x * this.zoom + jx, height / 2 - this.y * this.zoom + jy);
  }

  /** 触发震屏（爆炸时调用）；幅度有上限，避免大乱战里抖到反胃。 */
  addShake(amp: number): void {
    this.shakeAmp = Math.min(12, this.shakeAmp + amp);
  }

  /** 每帧衰减震屏；返回 true 表示本帧仍需 apply（抖动或归零落定）。 */
  tickShake(): boolean {
    if (this.shakeAmp <= 0) return false;
    this.shakeAmp = Math.max(0, this.shakeAmp - 0.8);
    return true;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.world.position.x) / this.zoom,
      y: (sy - this.world.position.y) / this.zoom,
    };
  }

  /** 世界像素 → 屏幕像素（screenToWorld 的逆；音效空间化按屏幕位置算声像）。 */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: this.world.position.x + wx * this.zoom,
      y: this.world.position.y + wy * this.zoom,
    };
  }

  /** 按屏幕像素平移（触控双指拖动 / 鼠标拖动复用）。 */
  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.apply();
  }

  /** 以画布坐标 (sx,sy) 为锚点缩放（滚轮 / 触控捏合复用）。 */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    this.x = before.x - (sx - this.app.screen.width / 2) / this.zoom;
    this.y = before.y - (sy - this.app.screen.height / 2) / this.zoom;
    this.apply();
  }

  /**
   * 绑定鼠标交互；返回解绑函数。
   * panButtons：允许平移的鼠标键（0 左 / 1 中 / 2 右）。
   * 有框选交互的页面应只给中键，把左键留给选择。
   */
  attach(canvas: HTMLCanvasElement, panButtons: readonly number[] = [0]): () => void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return; // 触控由 MatchView 的手势处理
      if (!panButtons.includes(e.button)) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      if (!dragging) return;
      this.x -= (e.clientX - lastX) / this.zoom;
      this.y -= (e.clientY - lastY) / this.zoom;
      lastX = e.clientX;
      lastY = e.clientY;
      this.apply();
    };
    const onUp = (e: PointerEvent): void => {
      dragging = false;
      canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012));
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }
}
