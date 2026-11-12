/**
 * 模型画廊页：检查全部单位模型与动画。
 * URL 参数：
 *   ?show=heroes|minions|structures|monsters|all   成排展示一类模型(默认 heroes)
 *   ?hero=<id> 或 ?model=<键>                       只看一个模型(键见 render/models/index.ts)
 *   ?anim=<UnitAnim>&t=<进度 0..1>                  定格某个动作的某一帧；不给 t 则循环播放
 *   ?sheet=<N>                                      把该动作从头到尾均匀取 N 帧排成一排(看动作节奏)
 *   ?variant=<n>                                    出手序号(左右手交替等)
 *   ?team=0|1                                       队伍色
 *   ?view=game                                      用对局镜头的俯角与距离看(检查实际观感)
 *   ?pitch=&yaw=&dist=&fov=&h=                      自定义镜头(h 为注视高度)
 *   ?bg=map&x=&y=                                   放到真实地图上看(默认是中性影棚地面)
 *   ?spin=1                                         模型缓慢自转
 *   ?hp=0..1 / ?death=<秒>                          建筑受损程度 / 被毁演出的时间点
 *   ?mode=game[&x=&y=]                              用假对局状态 + 正式的单位视图模块渲染(集成观感/性能)；?run=1 让单位动起来
 *   ?quality=low|medium|high   ?hud=0
 */
import * as THREE from 'three';
import { createMockState } from '../core/mock';
import type { HeroId, UnitAnim } from '../core/types';
import type { Quality } from '../render/api';
import type { RenderModule, RenderModuleFactory } from '../render/engine/context';
import { createRendererCore } from '../render/engine/core';
import { PALETTE, createToonMaterial } from '../render/materials';
import { type InstanceLook, type ModelDef, Puppet, RigBatch, allModelKeys, createInstanceLook, getModel, hasModel } from '../render/models';
import { createTerrainModule } from '../render/terrain';
import { createUnitsModule } from '../render/units';

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
const quality: Quality = qp === 'low' || qp === 'medium' || qp === 'high' ? qp : 'high';
const team = (num('team') ?? 0) as 0 | 1;
const gameView = params.get('view') === 'game';
const onMap = params.get('bg') === 'map';

interface Slot {
  key: string;
  def: ModelDef;
  puppet: Puppet;
  look: InstanceLook;
  x: number;
  z: number;
  yaw: number;
  anim: UnitAnim;
  /** 定格进度；null = 循环播放 */
  p: number | null;
  team: 0 | 1 | 2;
}

const ANIMS: UnitAnim[] = ['idle', 'move', 'attack', 'cast_s1', 'cast_s2', 'cast_ult', 'dash', 'leap', 'spin', 'channel', 'stunned', 'airborne', 'dead'];
const animParam = params.get('anim') as UnitAnim | null;
const anim: UnitAnim = animParam && ANIMS.includes(animParam) ? animParam : 'idle';
const fixedP = num('t');
const sheet = num('sheet');
const variant = num('variant') ?? 0;

function keysFor(show: string): string[] {
  const all = allModelKeys();
  const pick = (prefix: string): string[] => all.filter((k) => k.startsWith(prefix));
  switch (show) {
    case 'minions':
      return pick('minion:');
    case 'structures':
      return [...pick('tower:'), ...pick('core:')];
    case 'monsters':
      return pick('monster:');
    case 'all':
      return all;
    default:
      return pick('hero:');
  }
}

const base = { x: num('x') ?? 0, y: num('y') ?? 0 };
const slots: Slot[] = [];
const single = params.get('model') ?? (params.get('hero') ? `hero:${params.get('hero')}` : null);
const teamColor = new THREE.Color(team === 0 ? PALETTE.blue.main : PALETTE.red.main);

function addSlot(key: string, x: number, z: number, p: number | null, a: UnitAnim, t: 0 | 1 | 2, seed: number): void {
  const def = getModel(key);
  const puppet = new Puppet(def, seed);
  const look = createInstanceLook();
  look.team.copy(t === 0 ? new THREE.Color(PALETTE.blue.main) : t === 1 ? new THREE.Color(PALETTE.red.main) : new THREE.Color(PALETTE.neutral.main));
  slots.push({ key, def, puppet, look, x, z, yaw: ((num('face') ?? 0) * Math.PI) / 180, anim: a, p, team: t });
}

if (single && hasModel(single)) {
  const def = getModel(single);
  const n = sheet ?? 1;
  const gap = Math.max(1.6, def.radius * 2.6 * def.scale) * (num('gap') ?? 1);
  for (let i = 0; i < n; i++) {
    const p = n > 1 ? (num('from') ?? 0) + ((num('to') ?? 1) - (num('from') ?? 0)) * (i / (n - 1)) : fixedP;
    addSlot(single, base.x + (i - (n - 1) / 2) * gap, base.y, p, anim, team, 0.37);
  }
} else {
  const keys = keysFor(params.get('show') ?? 'heroes');
  let x = 0;
  const xs: number[] = [];
  for (const k of keys) {
    const def = getModel(k);
    const w = Math.max(1.5, def.radius * def.scale * 2.4);
    xs.push(x + w / 2);
    x += w;
  }
  keys.forEach((k, i) => {
    const t: 0 | 1 | 2 = k.startsWith('monster:') ? 2 : k.startsWith('tower:') || k.startsWith('core:') ? (Number(k.split(':').pop()) as 0 | 1) : team;
    addSlot(k, base.x + xs[i] - x / 2, base.y, fixedP, anim, t, 0.13 + i * 0.21);
  });
}
void teamColor;

// ── 镜头 ──
let minX = Infinity;
let maxX = -Infinity;
let maxH = 0;
for (const s of slots) {
  const r = s.def.radius * s.def.scale;
  minX = Math.min(minX, s.x - r);
  maxX = Math.max(maxX, s.x + r);
  maxH = Math.max(maxH, s.def.height * s.def.scale);
}
if (slots.length === 0) {
  minX = -1;
  maxX = 1;
  maxH = 2;
}
const cam = {
  pitch: num('pitch') ?? (gameView ? 52 : 14),
  yaw: num('yaw') ?? (gameView ? 0 : 18),
  fov: num('fov') ?? (gameView ? 35 : 28),
  dist: num('dist') ?? 0,
  h: num('h') ?? (gameView ? 0 : maxH * 0.5),
  cx: (minX + maxX) / 2,
  cz: base.y,
};

const gameMode = params.get('mode') === 'game';
const state = createMockState((params.get('hero') as HeroId | null) ?? 'chijin');
if (!gameMode) {
  state.units.length = 0;
  state.heroes.length = 0;
}
state.projectiles.length = 0;
state.areas.length = 0;

const spin = params.get('spin') === '1';
const hp = num('hp') ?? 1;
const deathT = num('death');

const createStudio: RenderModuleFactory = (ctx): RenderModule => {
  const root = new THREE.Group();
  ctx.layers.units.add(root);
  if (!onMap) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), createToonMaterial({ color: 0x8f9a94, steps: 1, rim: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);
  }
  const batches = new Map<string, RigBatch>();
  for (const s of slots) {
    if (!batches.has(s.key)) {
      const b = new RigBatch(s.def.geometry, s.def.rig.count, 4, { outline: num('outline') ?? 1.5 }, s.key);
      batches.set(s.key, b);
      b.addTo(root);
    }
  }
  let time = 0;
  let first = true;
  return {
    name: 'studio',
    update(frame) {
      time += frame.dt;
      const camera = ctx.camera;
      // 自定义镜头：绕注视点的轨道相机
      const aspect = ctx.viewport.width / Math.max(1, ctx.viewport.height);
      const tanH = Math.tan((cam.fov * Math.PI) / 360);
      const fitW = ((maxX - minX) / 2 + 0.6) / (tanH * aspect);
      const fitH = (maxH * 0.62 + 0.5) / tanH;
      const dist = cam.dist > 0 ? cam.dist : gameView ? 33 : Math.max(fitW, fitH);
      const pr = (cam.pitch * Math.PI) / 180;
      const yr = (cam.yaw * Math.PI) / 180;
      camera.fov = cam.fov;
      camera.near = 0.3;
      camera.far = 900;
      camera.updateProjectionMatrix();
      camera.position.set(cam.cx + Math.sin(yr) * Math.cos(pr) * dist, cam.h + Math.sin(pr) * dist, cam.cz + Math.cos(yr) * Math.cos(pr) * dist);
      camera.lookAt(cam.cx, cam.h, cam.cz);
      camera.updateMatrixWorld();

      for (const b of batches.values()) b.begin();
      for (const s of slots) {
        const a = s.puppet.input;
        a.anim = s.anim;
        a.time = time;
        a.variant = variant;
        a.hp = hp;
        a.deathT = deathT ?? -1;
        a.windup = 0.35;
        const dur = num('dur') ?? (s.anim === 'attack' ? 0.8 : s.anim === 'dead' ? 2.2 : 1.0);
        if (s.p !== null) {
          a.p = Math.min(1, Math.max(0, s.p));
          a.t = s.p * dur;
          a.stride = s.p;
        } else {
          const loop = (time % (dur + 0.5)) / dur;
          a.p = Math.min(1, loop);
          a.t = s.anim === 'spin' || s.anim === 'channel' || s.anim === 'stunned' ? time : Math.min(dur, loop * dur);
          a.stride = (time * 5.6) / s.def.stride;
        }
        a.speed = s.anim === 'move' ? 5.6 : 0;
        const yaw = s.yaw + (spin ? time * 0.7 : 0);
        const ty = onMap ? ctx.terrain.heightAt(s.x, s.z) * 0.6 : 0;
        s.puppet.update(a.anim === 'attack' ? variant : 0, frame.dt, s.x, ty, s.z, yaw, 1);
        if (first || s.p !== null) s.puppet.settle();
        s.look.glow = s.puppet.output.glow;
        const batch = batches.get(s.key);
        if (batch) batch.push(s.puppet.skeleton, s.look);
      }
      first = false;
      for (const b of batches.values()) b.end();
    },
    dispose() {
      ctx.layers.units.remove(root);
      for (const b of batches.values()) b.dispose();
    },
  };
};

const modules: RenderModuleFactory[] = [];
if (onMap || gameMode) modules.push(createTerrainModule);
modules.push(gameMode ? createUnitsModule : createStudio);
const renderer = createRendererCore(app, state, { quality }, modules);
const engine = renderer.engine;
if (gameMode) {
  if (num('x') !== null || num('y') !== null) {
    renderer.setCameraPeek({ x: base.x, y: base.y });
    renderer.snapCamera();
  }
  if (params.get('top') === '1') engine.rig.setTopView(true, state.map.half + 14);
  if (num('pitch') !== null) engine.rig.setOverride({ pitch: cam.pitch, distance: num('dist') ?? 33, yaw: cam.yaw, fov: cam.fov });
} else {
  // 标记为调试视角：关闭镜头夹取并把雾推远(镜头本身由 studio 模块每帧覆盖)
  engine.rig.setOverride({ pitch: cam.pitch, distance: 33 });
  renderer.setCameraPeek({ x: cam.cx, y: cam.cz });
  renderer.snapCamera();
}

if (params.get('hud') === '0') {
  hud.style.display = 'none';
  help.style.display = 'none';
}
help.textContent = '?show=heroes|minions|structures|monsters|all  ?hero=&anim=&t=  ?sheet=8  ?view=game  ?team=1\n拖动旋转 · 滚轮缩放';

let dragX: number | null = null;
let dragY = 0;
app.addEventListener('pointerdown', (e) => {
  dragX = e.clientX;
  dragY = e.clientY;
});
addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  cam.yaw -= (e.clientX - dragX) * 0.4;
  cam.pitch = Math.min(88, Math.max(-5, cam.pitch + (e.clientY - dragY) * 0.3));
  dragX = e.clientX;
  dragY = e.clientY;
});
addEventListener('pointerup', () => (dragX = null));
addEventListener(
  'wheel',
  (e) => {
    if (cam.dist <= 0) cam.dist = 12;
    cam.dist = Math.min(80, Math.max(1.5, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
  },
  { passive: true },
);
addEventListener('resize', () => renderer.resize());

let last = performance.now();
let hudTimer = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  renderer.render(state, 1, dt);
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    const s = renderer.getStats();
    const tris = slots.reduce((acc, sl) => acc + sl.def.triangles, 0);
    hud.textContent =
      `画质 ${engine.quality}  FPS ${s.fps}  draw calls ${s.drawCalls}  三角形 ${s.triangles.toLocaleString()}\n` +
      slots
        .filter((sl, i) => slots.findIndex((o) => o.key === sl.key) === i)
        .map((sl) => `${sl.key}: ${sl.def.triangles} 三角 / ${sl.def.rig.count} 骨`)
        .join('\n') +
      `\n合计 ${tris.toLocaleString()} 三角`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __renderer: typeof renderer;
    __slots: typeof slots;
  }
}
window.__renderer = renderer;
window.__slots = slots;
