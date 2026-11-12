/**
 * 英雄展示(选人界面的 3D 立绘)与头像。
 *
 * 两者都不依赖主渲染器：各自建一个很小的独立场景(暖色主光 + 冷色环境光 + 英雄辉光色的背光)，
 * 用与对局内完全相同的模型、动画与着色。
 *   createHeroPreview(canvas, heroId)  —— 透明底：展台 + 缓慢转动的英雄，可播放出招动作
 *   getHeroPortrait(heroId)            —— 离屏渲染胸像并合成到主题色底图上，返回 data URL(要哪位画哪位并缓存，其余在空闲时逐张补齐)
 * WebGL 不可用时退回到 2D 的剪影占位，界面不会因此出错。
 */
import * as THREE from 'three';
import { HEROES, HERO_IDS } from '../core/data/heroes';
import type { HeroId, UnitAnim } from '../core/types';
import type { HeroPreview } from './api';
import { PALETTE, createToonMaterial } from './materials';
import { type ModelDef, Puppet, RigBatch, createInstanceLook, getModel, heroKey } from './models';
import { ModelBuilder, X } from './models/kit';

type PlayAnim = 'attack' | 'cast_s1' | 'cast_s2' | 'cast_ult';

/** 展示时各出招实际播放的动作与时长(位移/旋转/跃击类技能在对局里走的是 dash/spin/leap) */
const PLAY: Record<HeroId, Partial<Record<PlayAnim, [UnitAnim, number]>>> = {
  panyue: { cast_s1: ['dash', 0.7], cast_s2: ['cast_s2', 1.1], cast_ult: ['leap', 1.0] },
  chijin: { cast_s1: ['cast_s1', 0.9], cast_s2: ['dash', 0.55], cast_ult: ['spin', 1.7] },
  xingli: { cast_s1: ['cast_s1', 0.9], cast_s2: ['cast_s2', 1.0], cast_ult: ['cast_ult', 1.5] },
  fengling: { cast_s1: ['cast_s1', 1.0], cast_s2: ['dash', 0.5], cast_ult: ['cast_ult', 1.2] },
  yeque: { cast_s1: ['dash', 0.45], cast_s2: ['cast_s2', 0.8], cast_ult: ['cast_ult', 1.0] },
};

/** 取景：模型含武器的大致高度/宽度(已含缩放) */
const FRAME: Record<HeroId, { h: number; w: number }> = {
  panyue: { h: 3.5, w: 3.4 },
  chijin: { h: 2.6, w: 2.6 },
  xingli: { h: 2.85, w: 2.4 },
  fengling: { h: 2.6, w: 2.2 },
  yeque: { h: 2.55, w: 2.3 },
};

/** 头像取景：注视高度(占身高比例)、镜头距离、英雄偏转角(度)、横向偏移；anim 为拍照时摆的姿势(默认待机) */
const BUST: Record<HeroId, { y: number; dist: number; yaw: number; x: number; anim?: UnitAnim }> = {
  // 磐岳待机时塔盾挡在胸前、头又埋在双肩之间：拍头像时让他放下盾
  panyue: { y: 0.84, dist: 4.9, yaw: -10, x: 0.0, anim: 'channel' },
  chijin: { y: 0.84, dist: 3.5, yaw: -16, x: 0.02 },
  xingli: { y: 0.83, dist: 3.5, yaw: -14, x: -0.04 },
  fengling: { y: 0.84, dist: 3.4, yaw: 14, x: 0.04 },
  yeque: { y: 0.84, dist: 3.4, yaw: -16, x: 0.0 },
};

interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  key: THREE.DirectionalLight;
  rim: THREE.PointLight;
}

function createStage(shadows: boolean): Stage {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.3, 80);
  // 主光：左前上方的暖光；环境：偏冷的天光；背光：英雄辉光色，勾出轮廓
  const key = new THREE.DirectionalLight(PALETTE.env.sun, 2.9);
  key.position.set(-3.2, 6.5, 5.5);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const c = key.shadow.camera;
    c.left = c.bottom = -4.5;
    c.right = c.top = 4.5;
    c.near = 1;
    c.far = 24;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.04;
  }
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x6d6880, 1.9));
  const rim = new THREE.PointLight(0xffffff, 26, 14, 1.4);
  rim.position.set(2.6, 3.4, -3.4);
  scene.add(rim);
  return { scene, camera, key, rim };
}

function setupRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x000000, 0);
}

/** 展台：深海军蓝石台 + 金边 + 英雄辉光色的光槽与星纹 */
function buildPedestal(glow: THREE.Color, radius: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.crease = 30;
  b.paint(0x141c3a, { c2: 0x2c3a70 });
  b.lathe([[-0.36, radius * 0.84], [-0.16, radius * 1.0], [-0.08, radius * 1.0], [-0.06, radius * 0.95], [0, radius * 0.93]], { seg: 24 });
  b.paint(0xd8a848, { gloss: 1 });
  b.lathe([[-0.125, radius * 1.015], [-0.085, radius * 1.015], [-0.08, radius * 0.97]], { seg: 24, cap0: false, cap1: false });
  b.g(X(0, 0.002, 0), () => b.torus(radius * 0.66, 0.018, 0.01, 32, 4, { crease: 30 }));
  const g: [number, number, number] = [glow.r, glow.g, glow.b];
  b.paint(g, { glow: 0.5 });
  b.g(X(0, 0.004, 0), () => b.torus(radius * 0.8, 0.03, 0.01, 40, 4, { crease: 30 }));
  // 台面的八角星纹
  const star: number[][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = (i % 2 === 0 ? 0.56 : 0.3) * radius;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  b.paint([g[0] * 0.5, g[1] * 0.5, g[2] * 0.5], { glow: 0.12 });
  b.g(X(0, 0.004, 0, -90, 0, 0), () => b.extrude(star, 0.006, 0));
  return b.build();
}

// ───────────── 2D 占位(WebGL 不可用时) ─────────────

function drawFallback(ctx: CanvasRenderingContext2D, w: number, h: number, heroId: HeroId, portrait: boolean): void {
  const def = HEROES[heroId];
  if (portrait) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, def.palette.secondary);
    g.addColorStop(1, '#0b1020');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const s = Math.min(w, h);
  ctx.fillStyle = def.palette.primary;
  ctx.beginPath();
  ctx.ellipse(cx, h * (portrait ? 0.98 : 0.9), s * 0.36, s * 0.34, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = def.palette.accent;
  ctx.beginPath();
  ctx.arc(cx, h * (portrait ? 0.46 : 0.42), s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = def.palette.glow;
  ctx.font = `bold ${Math.round(s * 0.2)}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.name.slice(0, 1), cx, h * (portrait ? 0.47 : 0.43));
}

function fallbackPreview(canvas: HTMLCanvasElement, heroId: HeroId): HeroPreview {
  let current = heroId;
  const draw = (): void => {
    const w = Math.max(1, canvas.clientWidth || canvas.width);
    const h = Math.max(1, canvas.clientHeight || canvas.height);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) drawFallback(ctx, w, h, current, false);
  };
  draw();
  return {
    setHero(id) {
      current = id;
      draw();
    },
    play() {
      /* 占位没有动作 */
    },
    resize: draw,
    dispose() {
      /* 占位没有资源 */
    },
  };
}

// ───────────── 英雄展示 ─────────────

export function createHeroPreview(canvas: HTMLCanvasElement, heroId: HeroId): HeroPreview {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  } catch {
    return fallbackPreview(canvas, heroId);
  }
  setupRenderer(renderer);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const stage = createStage(true);
  const pedestalMat = createToonMaterial({ vertexColors: true, steps: 2, rim: 0.2, specular: 0.7, gloss: 40, fog: false });
  let pedestal: THREE.Mesh | null = null;
  let def: ModelDef;
  let puppet: Puppet;
  let batch: RigBatch | null = null;
  const look = createInstanceLook();
  look.team.set(PALETTE.blue.main);
  let current = heroId;
  let anim: UnitAnim = 'idle';
  let animT = 0;
  let animDur = 0;
  let variant = 0;
  let time = 0;
  let yaw = 0.3;
  let disposed = false;
  let raf = 0;
  let last = performance.now();

  const load = (id: HeroId): void => {
    current = id;
    def = getModel(heroKey(id));
    puppet = new Puppet(def, 0.37);
    if (batch) {
      batch.removeFrom(stage.scene);
      batch.dispose();
    }
    batch = new RigBatch(def.geometry, def.rig.count, 1, { outline: 1.6 }, `preview:${id}`);
    batch.addTo(stage.scene);
    const glow = new THREE.Color(HEROES[id].palette.glow);
    stage.rim.color.copy(glow).lerp(new THREE.Color(1, 1, 1), 0.35);
    if (pedestal) {
      stage.scene.remove(pedestal);
      pedestal.geometry.dispose();
    }
    pedestal = new THREE.Mesh(buildPedestal(glow, id === 'panyue' ? 1.5 : 1.12), pedestalMat);
    pedestal.receiveShadow = true;
    stage.scene.add(pedestal);
    anim = 'idle';
    animT = 0;
    puppet.snap();
    frame();
  };

  const frame = (): void => {
    const aspect = renderer.domElement.width / Math.max(1, renderer.domElement.height);
    const f = FRAME[current];
    const cam = stage.camera;
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    // 既要装下全身(含展台)，窄画布时也要装下武器的横向展开
    const dist = Math.max((f.h * 0.5 + 0.32) / tanH, (f.w * 0.5 + 0.1) / (tanH * aspect));
    const lookY = f.h * 0.5 - 0.2;
    cam.aspect = aspect;
    cam.position.set(0, lookY + dist * 0.12, dist);
    cam.lookAt(0, lookY, 0);
    cam.updateProjectionMatrix();
  };

  const resize = (): void => {
    if (disposed) return;
    const w = Math.max(1, canvas.clientWidth || canvas.width);
    const h = Math.max(1, canvas.clientHeight || canvas.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    frame();
  };

  const tick = (now: number): void => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (!canvas.isConnected || document.hidden || !batch) return;
    time += dt;
    // 缓慢地左右转动：始终以正面与两个四分之三侧面示人
    yaw = 0.25 + Math.sin(time * 0.5) * 0.8;
    const a = puppet.input;
    if (anim !== 'idle') {
      animT += dt;
      if (animT >= animDur) {
        anim = 'idle';
        animT = 0;
      }
    }
    a.anim = anim;
    a.time = time;
    a.t = anim === 'idle' ? time : animT;
    a.p = anim === 'idle' ? 0 : Math.min(1, animT / animDur);
    a.variant = variant;
    a.windup = 0.35;
    a.stride = 0;
    a.speed = 0;
    const lift = anim === 'leap' ? 4 * 1.5 * a.p * (1 - a.p) : 0;
    puppet.update(variant * 10 + (anim === 'idle' ? 0 : 1), dt, 0, lift, 0, yaw, 1);
    look.glow = puppet.output.glow;
    batch.begin();
    batch.push(puppet.skeleton, look);
    batch.end();
    renderer.render(stage.scene, stage.camera);
  };

  load(heroId);
  resize();
  raf = requestAnimationFrame(tick);

  return {
    setHero(id) {
      if (disposed || id === current) return;
      load(id);
    },
    play(which) {
      if (disposed) return;
      const m = PLAY[current][which] ?? [which, 0.9];
      anim = m[0];
      animDur = m[1];
      animT = 0;
      if (which === 'attack') variant++;
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      batch?.dispose();
      pedestal?.geometry.dispose();
      pedestalMat.dispose();
      stage.key.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// ───────────── 头像 ─────────────

const PORTRAIT_SIZE = 192;
const portraitCache = new Map<HeroId, string>();

function composePortrait(heroId: HeroId, layer: HTMLCanvasElement | null): string {
  const def = HEROES[heroId];
  const c = document.createElement('canvas');
  c.width = c.height = PORTRAIT_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  if (!layer) {
    drawFallback(ctx, PORTRAIT_SIZE, PORTRAIT_SIZE, heroId, true);
    return c.toDataURL('image/png');
  }
  const S = PORTRAIT_SIZE;
  // 底图：自上而下由英雄辉光色过渡到深海军蓝，中间一团柔光托住人物
  const dark = new THREE.Color(def.palette.primary).lerp(new THREE.Color(0x0a1026), 0.72);
  const mid = new THREE.Color(def.palette.primary).lerp(new THREE.Color(0x101a3c), 0.35);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, `#${mid.getHexString()}`);
  g.addColorStop(1, `#${dark.getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const glow = new THREE.Color(def.palette.glow);
  const rg = ctx.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.46, S * 0.62);
  rg.addColorStop(0, `rgba(${Math.round(glow.r * 255)},${Math.round(glow.g * 255)},${Math.round(glow.b * 255)},0.55)`);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, S, S);
  // 几道星轨斜线
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-20 + i * 52, S);
    ctx.lineTo(60 + i * 52, 0);
    ctx.stroke();
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(layer, 0, 0, S, S);
  // 底部压暗一点，头像叠在界面上时与边框融合
  const vg = ctx.createLinearGradient(0, S * 0.7, 0, S);
  vg.addColorStop(0, 'rgba(6,10,26,0)');
  vg.addColorStop(1, 'rgba(6,10,26,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, S, S);
  return c.toDataURL('image/png');
}

/** 头像用的离屏渲染器：按需建，五张都画完(或失败)就释放 */
interface PortraitRig {
  renderer: THREE.WebGLRenderer;
  stage: Stage;
}
let portraitRig: PortraitRig | null = null;
/** WebGL 不可用：之后一律用 2D 占位 */
let portraitGlFailed = false;
let portraitTimer = false;

function releasePortraitRig(): void {
  const rig = portraitRig;
  portraitRig = null;
  if (!rig) return;
  rig.renderer.dispose();
  rig.renderer.forceContextLoss();
}

/** 画一位英雄的头像并写入缓存。WebGL 不可用或出错时用 2D 占位 */
function renderPortrait(id: HeroId): string {
  let url = '';
  if (!portraitGlFailed) {
    try {
      if (!portraitRig) {
        const size = PORTRAIT_SIZE * 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
        setupRenderer(renderer);
        renderer.setPixelRatio(1);
        renderer.setSize(size, size, false);
        portraitRig = { renderer, stage: createStage(false) };
      }
      const { renderer, stage } = portraitRig;
      const def = getModel(heroKey(id));
      const puppet = new Puppet(def, 0.37);
      const batch = new RigBatch(def.geometry, def.rig.count, 1, { outline: 2.2 }, `portrait:${id}`);
      batch.setShadows(false);
      batch.addTo(stage.scene);
      try {
        const glow = new THREE.Color(HEROES[id].palette.glow);
        stage.rim.color.copy(glow).lerp(new THREE.Color(1, 1, 1), 0.3);
        const bust = BUST[id];
        const a = puppet.input;
        a.anim = bust.anim ?? 'idle';
        a.time = 1.3;
        puppet.update(0, 0, 0, 0, 0, (bust.yaw * Math.PI) / 180, 1);
        puppet.settle();
        const look = createInstanceLook();
        look.team.set(PALETTE.blue.main);
        look.glow = puppet.output.glow;
        batch.begin();
        batch.push(puppet.skeleton, look);
        batch.end();
        const cam = stage.camera;
        const y = def.height * def.scale * bust.y;
        cam.aspect = 1;
        cam.fov = 24;
        cam.position.set(bust.x, y + 0.12, bust.dist);
        cam.lookAt(bust.x, y, 0);
        cam.updateProjectionMatrix();
        renderer.clear();
        renderer.render(stage.scene, cam);
        url = composePortrait(id, renderer.domElement);
      } finally {
        batch.removeFrom(stage.scene);
        batch.dispose();
      }
    } catch {
      // WebGL 不可用：这张和之后的都用 2D 占位
      portraitGlFailed = true;
      releasePortraitRig();
    }
  }
  if (!url) url = composePortrait(id, null);
  portraitCache.set(id, url);
  return url;
}

/** 剩下没画的头像放到空闲时一张一张画(每次只占主线程一小段)，画完释放离屏渲染器 */
function schedulePortraits(): void {
  if (portraitTimer) return;
  const next = HERO_IDS.find((id) => !portraitCache.has(id));
  if (next === undefined) {
    releasePortraitRig();
    return;
  }
  portraitTimer = true;
  const run = (): void => {
    portraitTimer = false;
    const id = HERO_IDS.find((h) => !portraitCache.has(h));
    if (id !== undefined) renderPortrait(id);
    schedulePortraits();
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 400 });
  else window.setTimeout(run, 60);
}

/**
 * 英雄头像(data URL，已缓存)。第一次要某位英雄时只同步画这一张(建模 + 一次离屏渲染)，
 * 其余几位随后在空闲时逐张补齐——不再像以前那样第一次调用就一口气画完五张卡住主线程。
 */
export function getHeroPortrait(heroId: HeroId): string {
  const cached = portraitCache.get(heroId);
  if (cached !== undefined) return cached;
  const url = renderPortrait(heroId);
  schedulePortraits();
  return url;
}
