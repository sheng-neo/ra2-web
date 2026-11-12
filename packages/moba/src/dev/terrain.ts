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
 *   ?kit=1            在镜头前摆一排着色套件样例(阶梯明暗/描边/闪白/淡出/队伍色/发光/实例化/点光)，验证 materials.ts
 * 键盘：WASD/方向键 平移镜头，1/2/3 切画质，T 切俯瞰。拖动鼠标也可平移。
 */
import { createMockState } from '../core/mock';
import type { Quality } from '../render/api';
import type { RenderModuleFactory } from '../render/engine/context';
import { createRendererCore } from '../render/engine/core';
import { createPlaceholderUnits } from '../render/engine/placeholders';
import * as THREE from 'three';
import { PALETTE, SHARED, bindToonParams, createGlowMaterial, createOutlineMaterial, createToonMaterial, createToonParams, setFxAttribute } from '../render/materials';
import { createTerrainModule, type TerrainModule } from '../render/terrain';

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
const buildStart = performance.now();
const renderer = createRendererCore(app, state, { quality }, modules);
const buildMs = Math.round(performance.now() - buildStart);
const engine = renderer.engine;
const terrainTimings = renderer.context.getModule<TerrainModule>('terrain')?.timings ?? {};

const player = state.heroes.find((h) => h.id === state.playerId);
const look = { x: num('x') ?? player?.pos.x ?? 0, y: num('y') ?? player?.pos.y ?? 0 };
const hasLook = num('x') !== null || num('y') !== null;
if (hasLook) {
  renderer.setCameraPeek(look);
  renderer.snapCamera();
}
if (params.get('top') === '1') engine.rig.setTopView(true, state.map.half + 14);
const pitch = num('pitch');
if (pitch !== null) engine.rig.setOverride({ pitch, distance: num('dist') ?? 33, yaw: num('yaw') ?? 0, fov: num('fov') ?? 35 });
if (params.get('hud') === '0') {
  hud.style.display = 'none';
  help.style.display = 'none';
}
help.textContent = 'WASD/拖动 平移 · 1/2/3 画质 · T 俯瞰\n?x=&y= ?quality= ?top=1 ?pitch=&dist=&yaw=';

// ── 着色套件样例 ──
let kitTick: ((t: number) => void) | null = null;
if (params.get('kit') === '1') {
  const root = new THREE.Group();
  root.position.set(look.x - 7.5, 0, look.y + 3.5);
  engine.scene.add(root);
  const geo = new THREE.SphereGeometry(0.8, 24, 16);
  setFxAttribute(geo, { team: 0 });
  const teamGeo = new THREE.TorusKnotGeometry(0.5, 0.2, 80, 12);
  setFxAttribute(teamGeo, { team: 1 });
  // 1~3：同一个材质，三个对象各自绑定参数(原样 / 闪白 / 淡出)
  const shared = createToonMaterial({ color: 0x6f7f8f, steps: 3, rim: 0.5, specular: 0.6, gloss: 60 });
  const outline = createOutlineMaterial({ thickness: 0.04 });
  const flashParams = createToonParams();
  const fadeParams = createToonParams();
  fadeParams.opacity = 0.45;
  [null, flashParams, fadeParams].forEach((p, i) => {
    const g = new THREE.Group();
    g.position.set(i * 2.2, 0.9, 0);
    const m = new THREE.Mesh(geo, shared);
    m.castShadow = m.receiveShadow = true;
    g.add(m, new THREE.Mesh(geo, outline));
    if (p) bindToonParams(g, p);
    root.add(g);
  });
  // 4~5：队伍色蒙版(同一材质，绑定不同队伍色)
  const teamMat = createToonMaterial({ color: 0xffffff, steps: 2, rim: 0.4 });
  [PALETTE.blue.main, PALETTE.red.main].forEach((c, i) => {
    const m = new THREE.Mesh(teamGeo, teamMat);
    m.position.set(6.6 + i * 2.2, 1.0, 0);
    m.castShadow = true;
    const p = createToonParams();
    p.teamColor.set(c);
    bindToonParams(m, p);
    root.add(m);
  });
  // 6：自发光(触发 bloom)  7：纯发光光壳  8：实例化 + 实例色
  const emissive = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), createToonMaterial({ color: 0x223355, flat: true, emissive: PALETTE.env.crystal, emissiveIntensity: 2.2 }));
  emissive.position.set(11, 1, 0);
  root.add(emissive);
  const shell = new THREE.Mesh(geo, createGlowMaterial({ color: PALETTE.env.starGold, intensity: 3, fresnel: 2.5, additive: true }));
  shell.position.set(13.2, 0.9, 0);
  root.add(shell);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), createToonMaterial({ steps: 2, fx: false }), 5);
  const mat4 = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) {
    inst.setMatrixAt(i, mat4.makeTranslation(15 + (i % 3) * 0.7, 0.45, (i > 2 ? 0.8 : 0) - 0.4));
    inst.setColorAt(i, new THREE.Color().setHSL(i / 5, 0.7, 0.55));
  }
  inst.castShadow = true;
  root.add(inst);
  kitTick = (t) => {
    flashParams.flash = Math.max(0, Math.sin(t * 4));
    if (Math.floor(t * 0.5) !== Math.floor((t - 0.02) * 0.5)) engine.lights.pulse(root.position.x + 9, root.position.z + 2, 1.6, PALETTE.env.ember, 10, 8, 0.9);
  };
  // 截图时保证有一盏点光亮着、闪白处于峰值
  flashParams.flash = 0.8;
  engine.lights.pulse(root.position.x + 9, root.position.z + 2, 1.6, PALETTE.env.ember, 10, 8, 600);
}

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
  else kitTick?.(now / 1000);
  renderer.render(state, 1, fixedT !== null ? 0 : dt);
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    const s = renderer.getStats();
    const vp = engine.viewport;
    hud.textContent =
      `画质 ${engine.quality}  ${vp.width}×${vp.height} @${vp.dpr.toFixed(2)}x  FPS ${s.fps}\n` +
      `draw calls ${s.drawCalls}   三角形 ${s.triangles.toLocaleString()}\n` +
      `镜头 (${look.x.toFixed(1)}, ${look.y.toFixed(1)})   场景构建 ${buildMs}ms`;
    if (params.get('timings') === '1') hud.textContent += '\n' + Object.entries(terrainTimings).map(([k, v]) => `${k} ${v}`).join('  ');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __timings: typeof terrainTimings;
    __renderer: typeof renderer;
    __engine: typeof engine;
    __state: typeof state;
  }
}
window.__timings = terrainTimings;
window.__renderer = renderer;
window.__engine = engine;
window.__state = state;
