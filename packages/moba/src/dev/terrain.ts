/**
 * 地形画廊页：用假对局状态渲染整张地图，供截图自查。
 * URL 参数：
 *   ?x=&y=            镜头看向指定地面坐标(模拟坐标)
 *   ?quality=low|medium|high
 *   ?top=1            俯瞰全图的调试相机
 *   ?pitch=&dist=&yaw=&fov=   自由调试视角
 *   ?hud=0            隐藏统计面板(截图用)
 *   ?units=0          不画占位单位
 *   ?t=秒             把动画时间固定推进到指定值后暂停(对比截图用)
 * 键盘：WASD/方向键 平移镜头，1/2/3 切画质，T 切俯瞰。拖动鼠标也可平移。
 */
import { createMockState } from '../core/mock';
import type { Quality } from '../render/api';
import type { RenderModuleFactory } from '../render/engine/context';
import { createRendererCore } from '../render/engine/core';
import { createPlaceholderUnits } from '../render/engine/placeholders';
import { SHARED } from '../render/materials';
import { createTerrainModule } from '../render/terrain';

const params = new URLSearchParams(location.search);
const num = (k: string): number | null => {
  const v = params.get(k);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const app = document.getElementById('app') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const help = document.getElementById('help') as HTMLElement;

const qp = params.get('quality');
let quality: Quality = qp === 'low' || qp === 'medium' || qp === 'high' ? qp : 'high';
const state = createMockState();
const modules: RenderModuleFactory[] = [createTerrainModule];
if (params.get('units') !== '0') modules.push(createPlaceholderUnits);
const renderer = createRendererCore(app, state, { quality }, modules);
const engine = renderer.engine;

const player = state.heroes.find((h) => h.id === state.playerId);
const look = { x: num('x') ?? player?.pos.x ?? 0, y: num('y') ?? player?.pos.y ?? 0 };
const hasLook = num('x') !== null || num('y') !== null;
if (hasLook) renderer.setCameraPeek(look);
if (params.get('top') === '1') engine.rig.setTopView(true, state.map.half + 14);
const pitch = num('pitch');
if (pitch !== null) engine.rig.setOverride({ pitch, distance: num('dist') ?? 33, yaw: num('yaw') ?? 0, fov: num('fov') ?? 35 });
if (params.get('hud') === '0') {
  hud.style.display = 'none';
  help.style.display = 'none';
}
help.textContent = 'WASD/拖动 平移 · 1/2/3 画质 · T 俯瞰\n?x=&y= ?quality= ?top=1 ?pitch=&dist=&yaw=';

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    quality = e.code === 'Digit1' ? 'low' : e.code === 'Digit2' ? 'medium' : 'high';
    renderer.setQuality(quality);
  }
  if (e.code === 'KeyT') engine.rig.setTopView(!engine.rig.isTopView, state.map.half + 14);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('resize', () => renderer.resize());

let drag: { x: number; y: number } | null = null;
app.addEventListener('pointerdown', (e) => {
  const g = renderer.screenToGround(e.clientX, e.clientY);
  if (g) drag = g;
});
app.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const g = renderer.screenToGround(e.clientX, e.clientY);
  if (!g) return;
  look.x += drag.x - g.x;
  look.y += drag.y - g.y;
  renderer.setCameraPeek(look);
});
addEventListener('pointerup', () => (drag = null));

const fixedT = num('t');
let last = performance.now();
let hudTimer = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const sp = (keys.has('ShiftLeft') ? 60 : 24) * dt;
  let moved = false;
  if (keys.has('KeyW') || keys.has('ArrowUp')) { look.y -= sp; moved = true; }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { look.y += sp; moved = true; }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) { look.x -= sp; moved = true; }
  if (keys.has('KeyD') || keys.has('ArrowRight')) { look.x += sp; moved = true; }
  if (moved) renderer.setCameraPeek(look);
  if (fixedT !== null) SHARED.uTime.value = fixedT;
  renderer.render(state, 1, fixedT !== null ? 0 : dt);
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    const s = renderer.getStats();
    const vp = engine.viewport;
    hud.textContent =
      `画质 ${engine.quality}  ${vp.width}×${vp.height} @${vp.dpr.toFixed(2)}x  FPS ${s.fps}\n` +
      `draw calls ${s.drawCalls}   三角形 ${s.triangles.toLocaleString()}\n` +
      `镜头 (${look.x.toFixed(1)}, ${look.y.toFixed(1)})`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __renderer: typeof renderer;
    __engine: typeof engine;
    __state: typeof state;
  }
}
window.__renderer = renderer;
window.__engine = engine;
window.__state = state;
