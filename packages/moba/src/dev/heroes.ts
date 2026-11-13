/**
 * 英雄模型画廊：专门给英雄建模用的检查页(多视角转面、面部近景、全部动作的关键帧分镜、对局镜头下的同屏对比)。
 *
 * URL 参数(手动看)：
 *   ?hero=<id>[,<id>…]        要看的英雄(默认樊哙、程咬金、王昭君)
 *   ?preset=turn|face|sheet|game|lineup   转面四视图 / 面部近景 / 动作分镜 / 对局镜头 / 并排站立(默认 lineup)
 *   ?anim=<UnitAnim>&n=8&variant=&mode=    分镜用：动作、帧数、出手序号、状态位
 *   ?team=0|1  ?bg=studio|stone|grass  ?quality=low|medium|high  ?hud=0
 *   ?lod=<米>                 只画「包围盒最大边不小于这个尺寸的描边形体」(对局里阴影 / 透视剪影通道的减面口径，见 units/index.ts 的 PASS_LOD)
 * 拖动旋转、滚轮缩放。
 *
 * 脚本接口(批量截图用，一次加载拍完所有镜头，不必反复刷新页面)：
 *   window.__gal.show({ slots: [...], cam: {...}, bg })   换一组摆放与镜头；返回后等 __gal.frames 增长 2 帧再截图
 *   window.__gal.info()                                   各英雄模型的三角形数、骨骼数、缩放、头顶高度
 *
 * 定格帧的做法：不是直接把动作摆到进度 p，而是从这段动作的开头按真实节奏「预滚」到 p——
 * 披风、盔缨、发束这些弹簧链因此带着该时刻应有的惯性，而不是垂直挂着。
 */
import * as THREE from 'three';
import { createMockState } from '../core/mock';
import type { HeroId, UnitAnim } from '../core/types';
import type { Quality } from '../render/api';
import type { RenderModule, RenderModuleFactory } from '../render/engine/context';
import { type GameRendererCore, createRendererCore } from '../render/engine/core';
import { PALETTE, createToonMaterial } from '../render/materials';
import { type InstanceLook, type ModelDef, Puppet, RigBatch, createInstanceLook, getModel, hasModel } from '../render/models';
import { lodIndexCount } from '../render/models/kit';
import { getHeroPortrait } from '../render/preview';
import { HEROES, HERO_IDS } from '../core/data/heroes';

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

const ANIMS: UnitAnim[] = ['idle', 'move', 'attack', 'cast_s1', 'cast_s2', 'cast_ult', 'dash', 'leap', 'spin', 'channel', 'stunned', 'airborne', 'dead'];
/** 循环动作：进度不由 p 决定，按时间一直播 */
const LOOPING = new Set<UnitAnim>(['idle', 'move', 'spin', 'channel', 'stunned']);
/** 各动作在画廊里的默认时长(秒)：尽量贴近对局里的真实时长 */
const DUR: Record<UnitAnim, number> = { idle: 2, move: 1, attack: 0.8, cast_s1: 0.5, cast_s2: 0.5, cast_ult: 0.7, dash: 0.4, leap: 0.65, spin: 1.2, channel: 2, stunned: 1.2, airborne: 0.9, dead: 2.2 };

export interface SlotCfg {
  /** 英雄 id 或完整模型键 */
  hero: string;
  anim?: UnitAnim;
  /** 定格进度 0..1；不给 = 循环播放 */
  p?: number | null;
  /** 朝向(度)：0 = 面朝镜头的初始方向(+Z) */
  yaw?: number;
  variant?: number;
  mode?: number;
  team?: 0 | 1;
  x?: number;
  z?: number;
  /** 动作时长(秒) */
  dur?: number;
  /** 沿朝向前进的速度(米/秒)：预滚时让弹簧链带上位移惯性。move 默认 5.6，dash 默认 20 */
  speed?: number;
  /** 离地高度(米)：跃起/击飞的定格 */
  lift?: number;
}

export interface CamCfg {
  pitch?: number;
  yaw?: number;
  /** 0 = 自动取景 */
  dist?: number;
  fov?: number;
  /** 注视高度 */
  h?: number;
  cx?: number;
  cz?: number;
}

export interface ShowCfg {
  slots: SlotCfg[];
  cam?: CamCfg;
  /** 地面：studio 中性灰 / stone 兵线石色 / grass 草色 */
  bg?: 'studio' | 'stone' | 'grass';
}

interface Slot {
  cfg: SlotCfg;
  key: string;
  def: ModelDef;
  puppet: Puppet;
  look: InstanceLook;
  x: number;
  z: number;
  yaw: number;
  anim: UnitAnim;
  p: number | null;
  dur: number;
  /** 定格帧是否已经预滚完成 */
  frozen: boolean;
}

const keyOf = (hero: string): string => (hero.includes(':') ? hero : `hero:${hero}`);

let slots: Slot[] = [];
const cam = { pitch: 12, yaw: 16, dist: 0, fov: 28, h: 1.2, cx: 0, cz: 0, auto: true };
let bg: 'studio' | 'stone' | 'grass' = 'studio';
let framesSinceShow = 0;
let dirty = true;

function buildSlots(cfg: ShowCfg): void {
  slots = [];
  cfg.slots.forEach((s, i) => {
    const key = keyOf(s.hero);
    if (!hasModel(key)) return;
    const def = getModel(key);
    const puppet = new Puppet(def, 0.17 + i * 0.23);
    const look = createInstanceLook();
    look.team.copy(new THREE.Color((s.team ?? 0) === 0 ? PALETTE.blue.main : PALETTE.red.main));
    const anim = s.anim ?? 'idle';
    slots.push({ cfg: s, key, def, puppet, look, x: s.x ?? 0, z: s.z ?? 0, yaw: ((s.yaw ?? 0) * Math.PI) / 180, anim, p: s.p ?? null, dur: s.dur ?? DUR[anim], frozen: false });
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let maxH = 0;
  for (const s of slots) {
    const r = s.def.radius * s.def.scale * 1.6;
    minX = Math.min(minX, s.x - r);
    maxX = Math.max(maxX, s.x + r);
    maxH = Math.max(maxH, s.def.height * s.def.scale);
  }
  if (slots.length === 0) {
    minX = -1;
    maxX = 1;
    maxH = 2;
  }
  const c = cfg.cam ?? {};
  cam.pitch = c.pitch ?? 12;
  cam.yaw = c.yaw ?? 16;
  cam.fov = c.fov ?? 28;
  cam.h = c.h ?? maxH * 0.5;
  cam.cx = c.cx ?? (minX + maxX) / 2;
  cam.cz = c.cz ?? 0;
  cam.dist = c.dist ?? 0;
  cam.auto = !(cam.dist > 0);
  if (cam.auto) {
    const aspect = innerWidth / Math.max(1, innerHeight);
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    cam.dist = Math.max(((maxX - minX) / 2 + 0.4) / (tanH * aspect), (maxH * 0.6 + 0.35) / tanH);
  }
  bg = cfg.bg ?? 'studio';
  framesSinceShow = 0;
  dirty = true;
}

/** 把一个定格槽位从动作开头预滚到进度 p */
function preroll(s: Slot, time: number): void {
  const a = s.puppet.input;
  const p = s.p ?? 0;
  const steps = 30;
  const dt = 1 / 30;
  const speed = s.cfg.speed ?? (s.anim === 'move' ? 5.6 : s.anim === 'dash' ? 20 : 0);
  const dirX = Math.sin(s.yaw);
  const dirZ = Math.cos(s.yaw);
  s.puppet.snap();
  for (let i = steps; i >= 0; i--) {
    // 倒推 i 帧之前的状态：循环动作按时间回退，有时长的动作按进度回退(不早于动作开头)
    const back = i * dt;
    fill(s, time - back, LOOPING.has(s.anim) ? p : Math.max(0, p - back / s.dur));
    const off = LOOPING.has(s.anim) || s.anim === 'dash' ? back * speed : 0;
    const lift = s.cfg.lift ?? (s.anim === 'leap' ? 4 * 3.4 * a.p * (1 - a.p) : 0);
    s.puppet.update(a.anim === 'attack' ? (s.cfg.variant ?? 0) : 0, i === steps ? 0 : dt, s.x - dirX * off, lift, s.z - dirZ * off, s.yaw, 1);
  }
  s.frozen = true;
}

function fill(s: Slot, time: number, p: number): void {
  const a = s.puppet.input;
  a.anim = s.anim;
  a.time = time;
  a.variant = s.cfg.variant ?? 0;
  a.mode = s.cfg.mode ?? 0;
  a.hp = 1;
  a.deathT = -1;
  a.windup = 0.35;
  a.p = Math.min(1, Math.max(0, p));
  a.t = LOOPING.has(s.anim) ? time : a.p * s.dur;
  a.stride = LOOPING.has(s.anim) && s.p !== null ? p : (time * 5.6) / s.def.stride;
  a.speed = s.anim === 'move' ? 5.6 : 0;
}

const state = createMockState('chijin');
state.units.length = 0;
state.heroes.length = 0;
state.projectiles.length = 0;
state.areas.length = 0;

const GROUND: Record<string, number> = { studio: 0x8f9a94, stone: 0xc0b08d, grass: 0x6f9d4a };

const createStudio: RenderModuleFactory = (ctx): RenderModule => {
  const root = new THREE.Group();
  ctx.layers.units.add(root);
  const groundMat = createToonMaterial({ color: GROUND.studio, steps: 1, rim: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  const batches = new Map<string, RigBatch>();
  let time = 0;
  let curBg = 'studio';
  return {
    name: 'hero-gallery',
    update(frame) {
      time += frame.dt;
      if (curBg !== bg) {
        curBg = bg;
        groundMat.color.set(GROUND[bg]);
      }
      const camera = ctx.camera;
      const pr = (cam.pitch * Math.PI) / 180;
      const yr = (cam.yaw * Math.PI) / 180;
      camera.fov = cam.fov;
      camera.near = 0.3;
      camera.far = 900;
      camera.updateProjectionMatrix();
      camera.position.set(cam.cx + Math.sin(yr) * Math.cos(pr) * cam.dist, cam.h + Math.sin(pr) * cam.dist, cam.cz + Math.cos(yr) * Math.cos(pr) * cam.dist);
      camera.lookAt(cam.cx, cam.h, cam.cz);
      camera.updateMatrixWorld();

      for (const s of slots) {
        if (!batches.has(s.key)) {
          const b = new RigBatch(s.def.geometry, s.def.rig.count, 8, { outline: num('outline') ?? 1.5 }, s.key);
          const lod = num('lod');
          if (lod !== null) {
            // 检查减面口径：本体与描边都只画够大的形体(看剪影里少了哪些件)
            const n = lodIndexCount(s.def.geometry, lod / s.def.scale);
            for (const m of [b.mesh, b.outline]) {
              if (!m) continue;
              m.onBeforeRender = (_r, _s, _c, geometry) => {
                geometry.setDrawRange(0, n);
              };
              m.onAfterRender = (_r, _s, _c, geometry) => {
                geometry.setDrawRange(0, Infinity);
              };
            }
          }
          batches.set(s.key, b);
          b.addTo(root);
        }
      }
      for (const b of batches.values()) b.begin();
      for (const s of slots) {
        const a = s.puppet.input;
        if (s.p !== null) {
          if (!s.frozen) preroll(s, time);
          else {
            // 定格：只按当前粒子位置重建朝向
            const lift = s.cfg.lift ?? (s.anim === 'leap' ? 4 * 3.4 * a.p * (1 - a.p) : 0);
            s.puppet.update(a.anim === 'attack' ? (s.cfg.variant ?? 0) : 0, 0, s.x, lift, s.z, s.yaw, 1);
          }
        } else {
          const loop = (time % (s.dur + 0.6)) / s.dur;
          fill(s, time, Math.min(1, loop));
          const lift = s.cfg.lift ?? (s.anim === 'leap' ? 4 * 3.4 * a.p * (1 - a.p) : 0);
          s.puppet.update(a.anim === 'attack' ? (s.cfg.variant ?? 0) + Math.floor(time / (s.dur + 0.6)) : Math.floor(time / (s.dur + 0.6)), frame.dt, s.x, lift, s.z, s.yaw, 1);
          if (dirty) s.puppet.settle();
        }
        s.look.glow = s.puppet.output.glow;
        const batch = batches.get(s.key);
        if (batch) batch.push(s.puppet.skeleton, s.look);
      }
      dirty = false;
      framesSinceShow++;
      for (const b of batches.values()) b.end();
    },
    dispose() {
      ctx.layers.units.remove(root);
      for (const b of batches.values()) b.dispose();
    },
  };
};

// ───────────── 预设 ─────────────

const heroList = (params.get('hero') ?? 'panyue,chijin,xingli').split(',').filter((h) => hasModel(keyOf(h)));
const team = (num('team') ?? 0) as 0 | 1;

function preset(name: string): ShowCfg {
  const hero = heroList[0] ?? 'panyue';
  const animParam = params.get('anim') as UnitAnim | null;
  const anim: UnitAnim = animParam && ANIMS.includes(animParam) ? animParam : 'idle';
  const b = (params.get('bg') as ShowCfg['bg']) ?? 'studio';
  switch (name) {
    case 'turn':
      return { slots: [0, 90, 180, -90].map((yaw, i) => ({ hero, yaw, x: (i - 1.5) * 3.2, team, anim: 'idle' as UnitAnim })), cam: { pitch: 8, yaw: 0 }, bg: b };
    case 'face': {
      const def = getModel(keyOf(hero));
      return { slots: [{ hero, yaw: 0, team }], cam: { pitch: 2, yaw: 14, dist: 3.2, h: def.height * def.scale * 0.86, fov: 24 }, bg: b };
    }
    case 'sheet': {
      const n = num('n') ?? 8;
      return {
        slots: Array.from({ length: n }, (_, i) => ({ hero, anim, p: i / (n - 1), x: (i - (n - 1) / 2) * 2.6, yaw: num('face') ?? 20, team, variant: num('variant') ?? 0, mode: num('mode') ?? 0 })),
        cam: { pitch: num('pitch') ?? 14, yaw: 0 },
        bg: b,
      };
    }
    case 'game':
      return {
        slots: heroList.flatMap((h, i) => [0, 180].map((yaw, k) => ({ hero: h, yaw: yaw + 25, x: (i - (heroList.length - 1) / 2) * 3.4, z: k * 3.6 - 1.8, team: (k as 0 | 1), anim }))),
        cam: { pitch: 46, yaw: 0, dist: 27.5, fov: 32, h: 0 },
        bg: b === 'studio' ? 'stone' : b,
      };
    default:
      return { slots: heroList.map((h, i) => ({ hero: h, x: (i - (heroList.length - 1) / 2) * 3.2, team, anim })), cam: { pitch: 10, yaw: 12 }, bg: b };
  }
}

function start(): void {
  buildSlots(preset(params.get('preset') ?? 'lineup'));
  const renderer = createRendererCore(app, state, { quality }, [createStudio]);
  const engine = renderer.engine;
  // 标记为调试视角：关闭镜头夹取并把雾推远(镜头本身由画廊模块每帧覆盖)
  engine.rig.setOverride({ pitch: cam.pitch, distance: 33 });
  renderer.setCameraPeek({ x: 0, y: 0 });
  renderer.snapCamera();

  if (params.get('hud') === '0') {
    hud.style.display = 'none';
    help.style.display = 'none';
  }
  help.textContent = '?hero=panyue,chijin,xingli  ?preset=turn|face|sheet|game|lineup  ?anim=&n=8  ?team=1  ?bg=stone|grass\n拖动旋转 · 滚轮缩放';

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
  addEventListener('wheel', (e) => (cam.dist = Math.min(80, Math.max(1.2, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9)))), { passive: true });
  addEventListener('resize', () => renderer.resize());

  let last = performance.now();
  let hudTimer = 0;
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    renderer.render(state, 1, dt);
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.3;
      const s = renderer.getStats();
      const seen = new Set<string>();
      const lines: string[] = [];
      for (const sl of slots) {
        if (seen.has(sl.key)) continue;
        seen.add(sl.key);
        lines.push(`${sl.key}: ${sl.def.triangles} 三角 / ${sl.def.rig.count} 骨 / 缩放 ${sl.def.scale} / 头顶 ${(sl.def.height * sl.def.scale).toFixed(2)}m`);
      }
      hud.textContent = `画质 ${engine.quality}  FPS ${s.fps}  draw calls ${s.drawCalls}  三角形 ${s.triangles.toLocaleString()}\n${lines.join('\n')}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__gal = {
    show(cfg) {
      buildSlots(cfg);
    },
    get frames() {
      return framesSinceShow;
    },
    info() {
      return ['panyue', 'chijin', 'xingli', 'fengling', 'yeque'].filter((h) => hasModel(keyOf(h))).map((h) => {
        const def = getModel(keyOf(h as HeroId));
        return { key: def.key, triangles: def.triangles, bones: def.rig.count, scale: def.scale, height: def.height, radius: def.radius, chains: def.rig.chains.length };
      });
    },
    stats() {
      return renderer.getStats();
    },
    renderer,
  };
}

/**
 * ?portraits=1：五位英雄的头像拼图(128 / 64 / 40 像素三种显示尺寸)，并逐张记录首次生成的同步耗时。
 * 第一张包含离屏渲染器的创建与着色器编译，后面几张只有建模(若未缓存)与一次渲染。
 */
function startPortraits(): void {
  hud.style.display = 'none';
  help.style.display = 'none';
  app.style.cssText = 'position:fixed;inset:0;padding:16px;background:#0b1226;color:#dfe8ff;font:13px sans-serif;overflow:auto';
  const times: { id: string; ms: number }[] = [];
  const urls = HERO_IDS.map((id) => {
    const t0 = performance.now();
    const url = getHeroPortrait(id);
    times.push({ id, ms: Math.round(performance.now() - t0) });
    return url;
  });
  const title = document.createElement('div');
  title.textContent = `头像首次生成(逐张同步耗时)：${times.map((t) => `${HEROES[t.id as HeroId].name} ${t.ms}ms`).join(' · ')}`;
  app.appendChild(title);
  for (const size of [128, 64, 40]) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:14px;margin:12px 0;align-items:flex-end';
    urls.forEach((u, i) => {
      const img = document.createElement('img');
      img.src = u;
      img.width = img.height = size;
      // 界面里头像多是圆形裁切：两种都给
      img.style.borderRadius = i % 2 === 0 || size !== 128 ? '50%' : '10px';
      img.style.boxShadow = '0 0 0 2px #d8b25a';
      row.appendChild(img);
    });
    app.appendChild(row);
  }
  window.__portraitTimes = times;
}

if (params.get('portraits') === '1') startPortraits();
else start();

declare global {
  interface Window {
    __portraitTimes?: { id: string; ms: number }[];
    __gal: {
      show(cfg: ShowCfg): void;
      readonly frames: number;
      info(): { key: string; triangles: number; bones: number; scale: number; height: number; radius: number; chains: number }[];
      stats(): { fps: number; drawCalls: number; triangles: number };
      renderer: GameRendererCore;
    };
  }
}
