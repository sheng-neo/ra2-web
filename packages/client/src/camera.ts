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

  constructor(
    private readonly app: Application,
    private readonly world: Container,
  ) {}

  apply(): void {
    const { width, height } = this.app.screen;
    this.world.scale.set(this.zoom);
    this.world.position.set(width / 2 - this.x * this.zoom, height / 2 - this.y * this.zoom);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.world.position.x) / this.zoom,
      y: (sy - this.world.position.y) / this.zoom,
    };
  }

  /** 绑定鼠标交互；返回解绑函数。 */
  attach(canvas: HTMLCanvasElement): () => void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent): void => {
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
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = this.screenToWorld(sx, sy);
      const factor = Math.exp(-e.deltaY * 0.0012);
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
      // 保持光标下的世界点不动
      this.x = before.x - (sx - this.app.screen.width / 2) / this.zoom;
      this.y = before.y - (sy - this.app.screen.height / 2) / this.zoom;
      this.apply();
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
