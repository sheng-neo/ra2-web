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

/**
 * 立绘取景的边距：画布四边各留出的比例。底边多留一些：选人页的名牌与底栏压在画布下沿。
 * 取景框本身不再手填，而是按模型实际的包围盒(含武器，见 measureFrame)算出来。
 */
const MARGIN = { side: 0.07, top: 0.06, bottom: 0.12 };
/** 基准取景(米)：五位英雄共用，按最魁梧的樊哙(含发束)定 */
const REF = { top: 3.2, halfW: 1.2 };

/** 头像取景：注视点相对头心的下移(米，世界尺度)、镜头距离、英雄偏转角(度)、横向偏移；anim/p/variant 为拍照时摆的姿势(默认待机) */
const BUST: Record<HeroId, { drop: number; dist: number; yaw: number; x: number; anim?: UnitAnim; p?: number; variant?: number }> = {
  // 樊哙：3/4 侧脸，怒目与炸开的须发占上半，盾沿从左下切入(拍照时放下盾)
  panyue: { drop: 0.3, dist: 3.8, yaw: -14, x: 0.06, anim: 'channel' },
  // 程咬金：正面略仰，扛在右肩的斧柄与斧颈红缨从画面左上斜入
  chijin: { drop: 0.26, dist: 3.0, yaw: -12, x: -0.08 },
  // 王昭君：3/4 侧脸，白毛帽箍与毛领框住脸，琵琶琴头从一侧斜入
  xingli: { drop: 0.26, dist: 2.75, yaw: -18, x: 0.04 },
  // 李广：侧身回望，鹖冠双羽与短须，弓臂竖在脸侧(拍照时用拄弓而立的姿势：待机时弓斜垂在身侧，入不了画)
  fengling: { drop: 0.24, dist: 2.75, yaw: 26, x: 0.06, anim: 'channel' },
  // 荆轲：冷峻侧脸，反握的匕首举在脸前，白巾绕颈
  yeque: { drop: 0.24, dist: 2.7, yaw: -22, x: 0.0, anim: 'attack', p: 0.17, variant: 0 },
};

/** 包围盒(世界坐标，英雄站在原点、缩放已含) */
interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  maxZ: number;
}

const frameCache = new Map<HeroId, Box>();
const _bones = new Float32Array(8 * 64);

/** 用 CPU 蒙皮(隔几个顶点取一个)把当前骨架下的模型并入包围盒 */
function addSkinned(def: ModelDef, puppet: Puppet, box: Box): void {
  const n = def.rig.count;
  const bones = n * 8 <= _bones.length ? _bones : new Float32Array(n * 8);
  puppet.skeleton.pack(bones, 0);
  const pos = def.geometry.attributes.position;
  const skin = def.geometry.attributes.aSkin;
  const P = pos.array as ArrayLike<number>;
  const S = skin.array as ArrayLike<number>;
  const v = [0, 0, 0];
  const out = [0, 0, 0];
  const xf = (b: number, x: number, y: number, z: number, o: number[]): void => {
    const k = b * 8;
    const qx = bones[k + 4];
    const qy = bones[k + 5];
    const qz = bones[k + 6];
    const qw = bones[k + 7];
    // v + 2 q × (q × v + w v)
    const cx = qy * z - qz * y + qw * x;
    const cy = qz * x - qx * z + qw * y;
    const cz = qx * y - qy * x + qw * z;
    const s = bones[k + 3];
    o[0] = bones[k] + s * (x + 2 * (qy * cz - qz * cy));
    o[1] = bones[k + 1] + s * (y + 2 * (qz * cx - qx * cz));
    o[2] = bones[k + 2] + s * (z + 2 * (qx * cy - qy * cx));
  };
  for (let i = 0; i < pos.count; i += 3) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    xf(S[i * 3], x, y, z, out);
    const w = S[i * 3 + 2];
    if (w < 0.999) {
      xf(S[i * 3 + 1], x, y, z, v);
      out[0] = v[0] + (out[0] - v[0]) * w;
      out[1] = v[1] + (out[1] - v[1]) * w;
      out[2] = v[2] + (out[2] - v[2]) * w;
    }
    if (out[0] < box.minX) box.minX = out[0];
    if (out[0] > box.maxX) box.maxX = out[0];
    if (out[1] < box.minY) box.minY = out[1];
    if (out[1] > box.maxY) box.maxY = out[1];
    if (out[2] > box.maxZ) box.maxZ = out[2];
  }
}

/**
 * 立绘左右摆动的[中心, 幅度](弧度)：yaw = 中心 + sin(t)·幅度，正值 = 英雄向自己的左手边转。各英雄不同——
 * 标志物要始终有一面朝着镜头：樊哙的盾在左臂，向左转过 20° 盾就只剩一条窄边，所以整体偏向右转(盾面迎着镜头)；
 * 程咬金扛在右肩的宣花斧，斧面朝右上方，向左转过 30° 斧面就成了一条线、读成一根长杆，同样偏向右转。
 * 其余三位的标志物(琵琶、弓、匕首)在身前，沿用原来的范围。
 */
const SWAY: Record<HeroId, [number, number]> = {
  panyue: [-0.44, 0.44],
  chijin: [-0.38, 0.44],
  xingli: [0.25, 0.8],
  fengling: [0.25, 0.8],
  yeque: [0.25, 0.8],
};
/**
 * 选人页的名牌(英雄名 + 称号两行)压在立绘画布的左上角，高约 48 个 CSS 像素。画布矮的时候(手机横屏只有两百多像素高)
 * 6% 的上边距不够：樊哙的发束、程咬金的斧头会顶进名牌里。所以上边距至少留出名牌的高度，上限 24%。
 */
const PLATE_PX = 48;

/**
 * 量出立绘需要装下的范围：待机在整个左右摆动范围内的包围盒(必须完整入画)，
 * 再并上普攻两式出手前后几帧里武器挥得最开的部分——但最多比待机框外扩 25%，免得一次横扫就把人缩得很小(出招时允许稍微出画)。
 * 每位英雄只量一次(几毫秒)，结果缓存。
 */
function measureFrame(id: HeroId, def: ModelDef): Box {
  const cached = frameCache.get(id);
  if (cached) return cached;
  const idle: Box = { minX: Infinity, maxX: -Infinity, minY: 0, maxY: -Infinity, maxZ: -Infinity };
  const act: Box = { minX: Infinity, maxX: -Infinity, minY: 0, maxY: -Infinity, maxZ: -Infinity };
  const puppet = new Puppet(def, 0.37);
  const a = puppet.input;
  a.windup = 0.35;
  const pose = (anim: UnitAnim, p: number, variant: number, yaw: number, box: Box): void => {
    a.anim = anim;
    a.p = p;
    a.t = anim === 'idle' ? 1.3 : p * 0.8;
    a.time = 1.3;
    a.variant = variant;
    puppet.snap();
    puppet.update(0, 0, 0, 0, 0, yaw, 1);
    puppet.settle();
    addSkinned(def, puppet, box);
  };
  const [yaw0, yawAmp] = SWAY[id];
  for (let i = 0; i <= 8; i++) pose('idle', 0, 0, yaw0 + yawAmp * Math.sin(((i / 8) * 2 - 1) * Math.PI * 0.5), idle);
  for (const variant of [0, 1]) for (const p of [0.2, 0.35, 0.5]) for (const yaw of [yaw0 - yawAmp, yaw0, yaw0 + yawAmp]) pose('attack', p, variant, yaw, act);
  const grow = (idle.maxX - idle.minX) * 0.25;
  const box: Box = {
    minX: Math.min(idle.minX, Math.max(act.minX, idle.minX - grow)),
    maxX: Math.max(idle.maxX, Math.min(act.maxX, idle.maxX + grow)),
    minY: 0,
    maxY: Math.max(idle.maxY, Math.min(act.maxY, idle.maxY * 1.12)),
    maxZ: idle.maxZ,
  };
  frameCache.set(id, box);
  return box;
}

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
    const box = measureFrame(current, def);
    const cam = stage.camera;
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    const tanW = tanH * aspect;
    // 横向：以包围盒中线为准，左右各留边距；纵向：从展台底到头顶(含冠缨、斧头、弓梢)，下沿给名牌与底栏让位
    const cx = (box.minX + box.maxX) / 2;
    const halfW = (box.maxX - box.minX) / 2;
    const bottom = -0.36;
    const top = box.maxY;
    const spanH = top - bottom;
    // 靠近镜头的部分(前伸的武器)在透视下更大：把前伸量计入距离
    const near = Math.max(0, box.maxZ);
    // 上边距：不低于名牌的高度(见 PLATE_PX)
    const cssH = Math.max(1, canvas.clientHeight || renderer.domElement.height / renderer.getPixelRatio());
    const mTop = Math.min(0.24, Math.max(MARGIN.top, PLATE_PX / cssH + 0.015));
    const distW = halfW / (tanW * (1 - 2 * MARGIN.side)) + near * 0.6;
    const distH = spanH / (2 * tanH * (1 - mTop - MARGIN.bottom)) + near * 0.5;
    // 五位英雄共用一个基准距离(按最高大的樊哙定)：小个子就显得小，坦克最魁梧；只有装不下时才再退远
    const distRef = Math.max(REF.halfW / (tanW * (1 - 2 * MARGIN.side)), (REF.top - bottom) / (2 * tanH * (1 - mTop - MARGIN.bottom)));
    const dist = Math.max(distW, distH, distRef);
    // 注视点：展台底边落在画框下边距处(各英雄站在同一高度)，头顶自然在上边距以内
    const lookY = bottom + tanH * dist * (1 - 2 * MARGIN.bottom);
    cam.aspect = aspect;
    cam.position.set(cx, lookY + dist * 0.12, dist);
    cam.lookAt(cx, lookY, 0);
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
    // 缓慢地左右转动：始终以正面到四分之三侧面示人(各英雄的范围见 SWAY)
    yaw = SWAY[current][0] + Math.sin(time * 0.5) * SWAY[current][1];
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
        // 1.5 倍超采样(再缩到 192)：软件渲染下比 2 倍省约四成，128 像素显示时看不出差别
        const size = Math.round(PORTRAIT_SIZE * 1.5);
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
      const batch = new RigBatch(def.geometry, def.rig.count, 1, { outline: 1.7 }, `portrait:${id}`);
      batch.setShadows(false);
      batch.addTo(stage.scene);
      try {
        const glow = new THREE.Color(HEROES[id].palette.glow);
        stage.rim.color.copy(glow).lerp(new THREE.Color(1, 1, 1), 0.3);
        const bust = BUST[id];
        const a = puppet.input;
        a.anim = bust.anim ?? 'idle';
        a.time = 1.3;
        a.p = bust.p ?? 0;
        a.t = a.anim === 'idle' || a.anim === 'channel' ? 1.3 : a.p * 0.8;
        a.windup = 0.35;
        a.variant = bust.variant ?? 0;
        puppet.update(0, 0, 0, 0, 0, (bust.yaw * Math.PI) / 180, 1);
        puppet.settle();
        const look = createInstanceLook();
        look.team.set(PALETTE.blue.main);
        look.glow = puppet.output.glow;
        batch.begin();
        batch.push(puppet.skeleton, look);
        batch.end();
        // 以头心为准取景：脸在画面上方偏中，肩与武器/标志物在下半与一角
        const hp = { x: 0, y: 0, z: 0 };
        if (!puppet.attach('head', hp)) hp.y = def.height * def.scale * 0.86;
        const cam = stage.camera;
        const y = hp.y - bust.drop;
        cam.aspect = 1;
        cam.fov = 24;
        cam.position.set(hp.x + bust.x, y + 0.1, hp.z + bust.dist);
        cam.lookAt(hp.x + bust.x, y, hp.z);
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
