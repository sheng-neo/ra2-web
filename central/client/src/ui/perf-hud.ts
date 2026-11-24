/**
 * ?perf=1 性能面板：fps、帧时间、draw call、三角形、几何体/贴图/着色器数。每 0.5 s 刷新一次，避免拖慢帧。
 */
import type { RenderStats } from '../render/city-renderer';
import { h } from './dom';

export class PerfHud {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;
  private worst = 0;

  constructor(
    parent: HTMLElement,
    private readonly stats: () => RenderStats,
    private readonly extra: () => string,
  ) {
    this.el = h('div', { class: 'perf' });
    parent.append(this.el);
  }

  tick(dt: number): void {
    this.frames++;
    this.elapsed += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.elapsed < 0.5) return;
    const s = this.stats();
    const fps = this.frames / this.elapsed;
    this.el.textContent = [
      `fps ${fps.toFixed(1)}  ${((this.elapsed / this.frames) * 1000).toFixed(1)} ms (max ${(this.worst * 1000).toFixed(0)})`,
      `calls ${s.calls}  tris ${(s.triangles / 1000).toFixed(1)}k`,
      `geo ${s.geometries}  tex ${s.textures}  prog ${s.programs}`,
      this.extra(),
    ].join('\n');
    this.frames = 0;
    this.elapsed = 0;
    this.worst = 0;
  }
}
