/**
 * 材质与光照对色画廊(A 包：引擎·光照·后期·材质)。不加载地形与对局模型——只有引擎、灯光、后期和几排样例，
 * 用来核对三个明度面、投影软硬、冷暖边缘光、材质类别与纹样，并给其它包对色(亮度色卡)。
 *
 * 场景(由北到南，镜头朝北)：
 *   灰模：八棱岩柱(50% 灰 / 岩色，三阶明暗)、圆柱、球(两阶)、锥形树(一阶)——看亮 / 灰 / 暗三个面与投影
 *   纹样球：8 种程序纹样(单位着色器)
 *   材质球：7 个材质类别 + 两颗自发光球(HDR 1.6 / 3.0，看 bloom 阈值)
 *   假人：彩色与 50% 灰各一个(单位着色器 + 描边)，看受光侧暖边与背光侧冷边
 *   亮度色卡：各种地表 / 岩石 / 建筑的标准反照率，一排受光、一排在投影里；面板里实时读出 CIE L* 并对照目标范围
 *
 * URL 参数：
 *   ?quality=low|medium|high      画质档(默认 high)
 *   ?tint=1                       在场景里盖几块环境染色(红方基地 / 青色河道 / 琥珀灯)和一块天光遮蔽，验证环境染色贴图
 *   ?x=&y=                        镜头看向的地面点(默认 0, 0.5)
 *   ?pitch=&dist=&yaw=&fov=       自由视角(默认用对局镜头)
 *   ?hud=0                        隐藏面板与标签(截图用)
 *   ?t=秒                          把动画时间固定在指定值
 *   ?frames=N                     画满 N 帧后停止重绘(软件渲染下截图用：不停重绘时截图会超时)
 *   ?labels=0                     隐藏样例下方的文字标签
 *   ?post=1                       保留远景薄霾与暗角(默认关掉：它们随屏幕位置改变亮度，会干扰取样读数)
 *   试光(只在本页生效，不改工程常量)：?sun=强度 &sunc=十六进制色 &hemi=强度 &sky=十六进制色 &bounce=地面反光增益
 *                                   &exp=曝光 &shadeg=r,g,b(地表暗部乘色，线性) &shadeu=十六进制色(单位暗部乘色)
 * 鼠标悬停读出指针下 5×5 像素的平均颜色与 L*；键盘 1 / 2 / 3 切画质。
 * 调试钩子：window.__lookdev = { renderer, engine, sample(clientX, clientY), chart() }。
 */
import * as THREE from 'three';
import { createMockState } from '../core/mock';
import type { Quality } from '../render/api';
import type { RenderContext, RenderModule, RenderModuleFactory } from '../render/engine/context';
import { createRendererCore } from '../render/engine/core';
import { BOUNCE_GAIN, HEMI_INTENSITY, SUN_DIR, SUN_INTENSITY, SUN_SHADOW_DIR, SUN_SHADOW_LENGTH } from '../render/engine/lighting';
import { PALETTE, SHARED, createToonMaterial, makeNoiseTexture } from '../render/materials';
import { RigBatch, UNIT_MAT, UNIT_PATTERN, createInstanceLook } from '../render/models/shading';
import type { Skeleton } from '../render/models/rig';

const params = new URLSearchParams(location.search);
const num = (k: string): number | null => {
  const v = params.get(k);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const app = document.getElementById('app') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const probe = document.getElementById('probe') as HTMLElement;
const help = document.getElementById('help') as HTMLElement;
const showHud = params.get('hud') !== '0';
const showLabels = params.get('labels') !== '0';

// ───────────────────────────── 单位着色器用的简易几何 ─────────────────────────────

interface Paint {
  color: number;
  cat?: number;
  pattern?: number;
  /** 纹样每米格数 */
  cells?: number;
  amount?: number;
  glow?: number;
  gloss?: number;
  ao?: number;
}

/** 手工拼装一份带全套单位顶点属性的几何(一根骨头，绑定在原点) */
class UnitGeo {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private fx: number[] = [];
  private mat: number[] = [];
  private outl: number[] = [];
  private idx: number[] = [];
  private c = new THREE.Color();

  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, ox: number, oy: number, oz: number, p: Paint): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.c.set(p.color);
    this.col.push(this.c.r, this.c.g, this.c.b);
    this.fx.push((p.gloss ?? 0) * 255, (p.glow ?? 0) * 255, 0, (p.ao ?? 1) * 255);
    this.mat.push(Math.round(((p.pattern ?? 0) / 8) * 255), Math.round((Math.min(32, p.cells ?? 0) / 32) * 255), Math.round((p.amount ?? 0) * 255), Math.round(((p.cat ?? 0) / 8) * 255));
    this.outl.push(ox, oy, oz, 1);
    return i;
  }

  /** 椭球(sx/sy/sz 为三轴半径) */
  ellipsoid(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, p: Paint, seg = 28, rings = 18): void {
    const base = this.pos.length / 3;
    for (let j = 0; j <= rings; j++) {
      const v = (j / rings) * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const u = (i / seg) * Math.PI * 2;
        const dx = Math.sin(v) * Math.cos(u);
        const dy = Math.cos(v);
        const dz = Math.sin(v) * Math.sin(u);
        // 椭球法线 = 归一化(方向 / 半径)
        const nl = Math.hypot(dx / sx, dy / sy, dz / sz) || 1;
        const nx = dx / sx / nl;
        const ny = dy / sy / nl;
        const nz = dz / sz / nl;
        this.vert(cx + dx * sx, cy + dy * sy, cz + dz * sz, nx, ny, nz, nx, ny, nz, p);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i;
        const b = a + seg + 1;
        this.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  /** 长方体(按面法线着色；描边法线用到中心的方向) */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, p: Paint): void {
    const faces: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [nx, ny, nz] of faces) {
      // 面内的两个切向(与法线各占一个坐标轴)
      const tu: [number, number, number] = nx !== 0 ? [0, 1, 0] : [1, 0, 0];
      const tv: [number, number, number] = nz !== 0 ? [0, 1, 0] : [0, 0, 1];
      const ids: number[] = [];
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const x = cx + (nx + tu[0] * su + tv[0] * sv) * hx;
        const y = cy + (ny + tu[1] * su + tv[1] * sv) * hy;
        const z = cz + (nz + tu[2] * su + tv[2] * sv) * hz;
        const ol = Math.hypot(x - cx, y - cy, z - cz) || 1;
        ids.push(this.vert(x, y, z, nx, ny, nz, (x - cx) / ol, (y - cy) / ol, (z - cz) / ol, p));
      }
      // 让三角形的绕向朝外(叉积与法线同向)
      const ax = this.pos[ids[1] * 3] - this.pos[ids[0] * 3];
      const ay = this.pos[ids[1] * 3 + 1] - this.pos[ids[0] * 3 + 1];
      const az = this.pos[ids[1] * 3 + 2] - this.pos[ids[0] * 3 + 2];
      const bx = this.pos[ids[2] * 3] - this.pos[ids[0] * 3];
      const by = this.pos[ids[2] * 3 + 1] - this.pos[ids[0] * 3 + 1];
      const bz = this.pos[ids[2] * 3 + 2] - this.pos[ids[0] * 3 + 2];
      const facing = (ay * bz - az * by) * nx + (az * bx - ax * bz) * ny + (ax * by - ay * bx) * nz;
      if (facing > 0) this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
      else this.idx.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.pos.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFx', new THREE.BufferAttribute(new Uint8Array(this.fx), 4, true));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Uint8Array(this.mat), 4, true));
    g.setAttribute('aOutline', new THREE.Float32BufferAttribute(this.outl, 4));
    // 骨骼 0，权重 1
    const skin = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) skin[i * 3 + 2] = 1;
    g.setAttribute('aSkin', new THREE.BufferAttribute(skin, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** 一根不动的骨头(单位矩阵)，冒充骨架交给 RigBatch */
const STATIC_SKELETON = {
  pack(out: Float32Array, offset: number): void {
    out[offset] = 0;
    out[offset + 1] = 0;
    out[offset + 2] = 0;
    out[offset + 3] = 1;
    out[offset + 4] = 0;
    out[offset + 5] = 0;
    out[offset + 6] = 0;
    out[offset + 7] = 1;
  },
} as unknown as Skeleton;

// ───────────────────────────── 样例表 ─────────────────────────────

const MATERIAL_BALLS: { name: string; paint: Paint }[] = [
  { name: '布', paint: { color: 0xb8443a, cat: UNIT_MAT.cloth } },
  { name: '皮肤', paint: { color: 0xe6b494, cat: UNIT_MAT.skin } },
  { name: '皮革·木', paint: { color: 0x7a5236, cat: UNIT_MAT.leather } },
  { name: '金属', paint: { color: 0xb9c2d0, cat: UNIT_MAT.metal } },
  { name: '晶体', paint: { color: 0x58c0ff, cat: UNIT_MAT.crystal, glow: 0.12 } },
  { name: '毛', paint: { color: 0x7a6248, cat: UNIT_MAT.fur } },
  { name: '岩', paint: { color: 0x7f7c86, cat: UNIT_MAT.rock } },
  { name: '发光 1.6', paint: { color: 0x9fe6ff, cat: UNIT_MAT.crystal, glow: 0.62 } },
  { name: '发光 3.0', paint: { color: 0xffcf60, cat: UNIT_MAT.crystal, glow: 1 } },
];

const PATTERN_BALLS: { name: string; paint: Paint }[] = [
  { name: '1 鳞·甲片', paint: { color: 0x4a58a8, cat: UNIT_MAT.leather, pattern: UNIT_PATTERN.scales, cells: 4.5, amount: 1 } },
  { name: '2 岩层', paint: { color: 0x7f7c86, cat: UNIT_MAT.rock, pattern: UNIT_PATTERN.strata, cells: 3, amount: 1 } },
  { name: '3 毛笔触', paint: { color: 0x7a4a38, cat: UNIT_MAT.fur, pattern: UNIT_PATTERN.fur, cells: 4, amount: 1 } },
  { name: '4 织纹', paint: { color: 0xc8342c, cat: UNIT_MAT.cloth, pattern: UNIT_PATTERN.weave, cells: 9, amount: 1 } },
  { name: '5 树皮', paint: { color: 0x7a6a50, cat: UNIT_MAT.leather, pattern: UNIT_PATTERN.bark, cells: 3.5, amount: 1 } },
  { name: '6 熔纹', paint: { color: 0xff6a24, cat: UNIT_MAT.rock, pattern: UNIT_PATTERN.magma, cells: 3, amount: 1, glow: 0.8 } },
  { name: '7 翼脉·叶脉', paint: { color: 0x6a4ad0, cat: UNIT_MAT.crystal, pattern: UNIT_PATTERN.veins, cells: 3, amount: 1 } },
  { name: '8 陨铁交叉纹', paint: { color: 0x6a72a8, cat: UNIT_MAT.metal, pattern: UNIT_PATTERN.meteoric, cells: 5, amount: 1 } },
];

/** 亮度色卡：标准反照率 + 目标 L*(受光 / 阴影；null = 没有指定) */
const CHART: { name: string; color: number; lit: [number, number] | null; shade: [number, number] | null }[] = [
  { name: '兵线石', color: PALETTE.env.lane, lit: [66, 72], shade: [40, 46] },
  { name: '草', color: PALETTE.env.grass, lit: [55, 60], shade: null },
  { name: '崖顶草', color: PALETTE.env.cliffGrass, lit: [50, 55], shade: null },
  { name: '野区土', color: PALETTE.env.dirt, lit: null, shade: null },
  { name: '岩·亮', color: PALETTE.env.rockLight, lit: [62, 68], shade: null },
  { name: '岩·中', color: PALETTE.env.rock, lit: null, shade: null },
  { name: '岩·暗', color: PALETTE.env.rockDark, lit: null, shade: null },
  { name: '蓝方地台', color: PALETTE.blue.plaza, lit: null, shade: null },
  { name: '蓝方白石', color: PALETTE.blue.stone, lit: null, shade: null },
  { name: '红方玄武', color: PALETTE.red.stone, lit: null, shade: null },
  { name: '白甲', color: 0xe9e9e9, lit: [85, 92], shade: null },
  { name: '18% 灰', color: 0x777777, lit: null, shade: null },
];

interface ProbePoint {
  x: number;
  h: number;
  z: number;
}

interface LookdevModule extends RenderModule {
  tags: { el: HTMLElement; x: number; h: number; z: number }[];
  chartLit: ProbePoint[];
  chartShade: ProbePoint[];
  /** 岩柱三个面(亮 / 灰 / 暗)的取样点：[50% 灰柱, 岩色柱] */
  prismFaces: ProbePoint[][];
}

const GRAY = 0x808080;

const createLookdev: RenderModuleFactory = (ctx: RenderContext): LookdevModule => {
  const root = new THREE.Group();
  root.name = 'lookdev';
  ctx.layers.terrain.add(root);
  const disposables: { dispose(): void }[] = [];
  const tags: LookdevModule['tags'] = [];
  const tag = (text: string, x: number, h: number, z: number): void => {
    if (!showLabels) return;
    const el = document.createElement('div');
    el.className = 'tag';
    el.textContent = text;
    ctx.overlayRoot.appendChild(el);
    tags.push({ el, x, h, z });
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    root.add(m);
    disposables.push(geo, mat);
    return m;
  };

  // 地面：50% 灰，按地表的算法受光(平滑兰伯特 + 地表的暗部乘色)
  const groundShade = SHARED.uShadeTintGround.value;
  add(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), createToonMaterial({ color: GRAY, steps: 1, rim: 0, shadeTint: groundShade, fx: false }), 0, 0, 0, false);

  // ── 灰模(最北一排) ──
  const zForms = -9.4;
  const rockMat = (color: number): THREE.Material => createToonMaterial({ color, ramp: [0.05, 0.42, 0.55], softness: 0.1, shadeTint: PALETTE.env.shadeRock, rim: 0.08, kicker: 0.1, fx: false });
  const prismFaces: ProbePoint[][] = [];
  const prism = (x: number, color: number, label: string): void => {
    const r = 1.5;
    const h = 3;
    // 八棱柱转 22.5°：三个朝镜头的面正好朝 西南 / 正南 / 东南 = 亮 / 灰 / 暗
    const geo = new THREE.CylinderGeometry(r, r * 1.08, h, 8).rotateY(-Math.PI / 8).toNonIndexed();
    geo.computeVertexNormals();
    add(geo, rockMat(color), x, h / 2, zForms);
    const ap = r * 1.04 * Math.cos(Math.PI / 8) + 0.02;
    const face = (deg: number): ProbePoint => ({ x: x + Math.sin((deg * Math.PI) / 180) * ap, h: h * 0.5, z: zForms + Math.cos((deg * Math.PI) / 180) * ap });
    prismFaces.push([face(-45), face(0), face(45)]);
    tag(label, x, 0, zForms + r + 0.3);
  };
  prism(-9.2, GRAY, '岩柱 50% 灰(三阶)');
  prism(-5.4, PALETTE.env.rock, '岩柱 岩色');
  add(new THREE.CylinderGeometry(0.5, 0.56, 3.4, 24), createToonMaterial({ color: GRAY, ramp: [0.05, 0.42, 0.55], softness: 0.1, kicker: 0.3, fx: false }), -1.8, 1.7, zForms);
  tag('石柱(冷边 0.3)', -1.8, 0, zForms + 1.0);
  add(new THREE.SphereGeometry(1.2, 40, 24), createToonMaterial({ color: GRAY, steps: 2, fx: false }), 1.6, 1.2, zForms);
  tag('球 两阶', 1.6, 0, zForms + 1.7);
  add(new THREE.SphereGeometry(1.2, 40, 24), createToonMaterial({ color: GRAY, steps: 3, softness: 0.34, fx: false }), 4.8, 1.2, zForms);
  tag('球 三阶·软', 4.8, 0, zForms + 1.7);
  // 石台：顶面贴图(mapTop)。这里拿噪声图当顶面贴图的替身，只为看「朝上的面叠贴图与色斑、立面不受影响」
  const noise = makeNoiseTexture(128, 11);
  disposables.push(noise);
  const slabMat = createToonMaterial({ color: PALETTE.env.cliffGrass, ramp: [0.05, 0.42, 0.55], softness: 0.1, shadeTint: PALETTE.env.shadeRock, rim: 0.08, kicker: 0.1, fx: false, mapTop: noise, mapTopScale: 0.35, mapTopGain: 2, mapTopNoise: noise });
  add(new THREE.BoxGeometry(3.2, 1.1, 2.2), slabMat, 12.2, 0.55, zForms);
  tag('石台 顶面贴图', 12.2, 0, zForms + 1.6);
  const treeMat = createToonMaterial({ color: GRAY, steps: 1, rim: 0, fx: false });
  add(new THREE.ConeGeometry(1.3, 2.6, 20), treeMat, 8.2, 2.5, zForms);
  add(new THREE.CylinderGeometry(0.22, 0.3, 1.3, 10), treeMat, 8.2, 0.65, zForms);
  tag('树 一阶(植被)', 8.2, 0, zForms + 1.7);

  // ── 单位着色器的样例：纹样球 / 材质球 / 假人，合成一份几何一次画完 ──
  const ug = new UnitGeo();
  const zPat = -5.0;
  PATTERN_BALLS.forEach((b, i) => {
    const x = (i - (PATTERN_BALLS.length - 1) / 2) * 2.05;
    ug.ellipsoid(x, 0.86, zPat, 0.8, 0.8, 0.8, b.paint, 40, 26);
    tag(b.name, x, 0, zPat + 1.0);
  });
  const zMat = -1.9;
  MATERIAL_BALLS.forEach((b, i) => {
    const x = (i - (MATERIAL_BALLS.length - 1) / 2) * 1.85;
    const r = b.paint.glow && b.paint.glow > 0.5 ? 0.42 : 0.74;
    ug.ellipsoid(x, r + 0.06, zMat, r, r, r, b.paint, 36, 24);
    tag(b.name, x, 0, zMat + 0.95);
  });
  // 假人：头(皮肤) + 躯干(布) + 肩甲(金属) + 腰带(皮革) + 毛领(毛) + 腿(布)；右边是同形的 50% 灰模
  const dummy = (x: number, z: number, gray: boolean): void => {
    const c = (hex: number): number => (gray ? GRAY : hex);
    ug.ellipsoid(x, 1.2, z, 0.42, 0.62, 0.3, { color: c(0x2f5fc0), cat: UNIT_MAT.cloth, pattern: gray ? 0 : UNIT_PATTERN.weave, cells: 10, amount: 0.7 });
    ug.ellipsoid(x - 0.16, 0.42, z, 0.15, 0.44, 0.16, { color: c(0x3a3f55), cat: UNIT_MAT.cloth, ao: 0.8 });
    ug.ellipsoid(x + 0.16, 0.42, z, 0.15, 0.44, 0.16, { color: c(0x3a3f55), cat: UNIT_MAT.cloth, ao: 0.8 });
    ug.ellipsoid(x, 0.86, z, 0.4, 0.1, 0.3, { color: c(0x7a5236), cat: UNIT_MAT.leather });
    ug.ellipsoid(x, 1.72, z, 0.36, 0.14, 0.3, { color: c(0xe8dcc8), cat: UNIT_MAT.fur, pattern: gray ? 0 : UNIT_PATTERN.fur, cells: 6, amount: 0.8 });
    ug.ellipsoid(x, 2.08, z, 0.27, 0.3, 0.27, { color: c(0xe6b494), cat: UNIT_MAT.skin });
    ug.ellipsoid(x - 0.52, 1.6, z, 0.24, 0.17, 0.24, { color: c(0xb9c2d0), cat: UNIT_MAT.metal });
    ug.ellipsoid(x + 0.52, 1.6, z, 0.24, 0.17, 0.24, { color: c(0xb9c2d0), cat: UNIT_MAT.metal });
    ug.box(x + 0.72, 1.0, z + 0.1, 0.06, 0.62, 0.34, { color: c(0xb9c2d0), cat: UNIT_MAT.metal, pattern: gray ? 0 : UNIT_PATTERN.meteoric, cells: 7, amount: 0.8 });
  };
  const zDummy = 1.6;
  dummy(-3.2, zDummy, false);
  tag('假人(布/皮肤/皮革/金属/毛)', -3.2, 0, zDummy + 0.6);
  dummy(-0.4, zDummy, true);
  tag('假人 50% 灰', -0.4, 0, zDummy + 0.6);
  // 浅色假人：最亮的甲片应落在 L* 85~92
  ug.ellipsoid(2.6, 1.15, zDummy, 0.5, 1.1, 0.42, { color: 0xe9e9e9, cat: UNIT_MAT.metal });
  ug.ellipsoid(2.6, 2.3, zDummy, 0.3, 0.3, 0.3, { color: 0xe9e9e9, cat: UNIT_MAT.metal });
  tag('白甲', 2.6, 0, zDummy + 0.6);
  // 深色假人：背光侧靠冷边从地面上分出来
  ug.ellipsoid(5.4, 1.15, zDummy, 0.5, 1.1, 0.42, { color: 0x2a2630, cat: UNIT_MAT.cloth });
  ug.ellipsoid(5.4, 2.3, zDummy, 0.3, 0.3, 0.3, { color: 0x2a2630, cat: UNIT_MAT.leather });
  tag('深色衣', 5.4, 0, zDummy + 0.6);
  const unitGeo = ug.build();
  const batch = new RigBatch(unitGeo, 1, 1, { outline: 1.5 }, 'hero:lookdev');
  batch.addTo(ctx.layers.units);
  const look = createInstanceLook();
  disposables.push(unitGeo);

  // ── 亮度色卡：南边两排。近的一排受光，远的一排在一块看不见的挡板的投影里 ──
  const zLit = 6.9;
  const zShade = 5.0;
  const chartLit: ProbePoint[] = [];
  const chartShade: ProbePoint[] = [];
  const step = 1.55;
  const tileGeo = new THREE.BoxGeometry(1.3, 0.04, 1.3);
  disposables.push(tileGeo);
  CHART.forEach((c, i) => {
    const x = (i - (CHART.length - 1) / 2) * step;
    for (const z of [zLit, zShade]) {
      const mat = createToonMaterial({ color: c.color, steps: 1, rim: 0, shadeTint: groundShade, fx: false });
      const m = new THREE.Mesh(tileGeo, mat);
      m.position.set(x, 0.02, z);
      m.receiveShadow = true;
      m.updateMatrix();
      m.matrixAutoUpdate = false;
      root.add(m);
      disposables.push(mat);
    }
    chartLit.push({ x, h: 0.05, z: zLit });
    chartShade.push({ x, h: 0.05, z: zShade });
    tag(c.name, x, 0, zLit + 0.85);
  });
  // 挡板：只进阴影通道(主通道不写颜色也不写深度)。位置按太阳方向反推，让投影正好盖住远的那排
  const slabH = 2.4;
  const off = SUN_SHADOW_LENGTH * slabH;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(CHART.length * step + 3, 0.1, 2.3), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  slab.position.set(-SUN_SHADOW_DIR.x * off, slabH, zShade - SUN_SHADOW_DIR.y * off);
  slab.castShadow = true;
  slab.updateMatrix();
  slab.matrixAutoUpdate = false;
  root.add(slab);
  disposables.push(slab.geometry, slab.material as THREE.Material);

  // ── 环境染色试验 ──
  if (params.get('tint') === '1') {
    const lt = ctx.lightTint;
    lt.stamp(-3.2, zDummy, 4, PALETTE.red.main, 0.35);
    lt.stamp(4, zMat, 5, PALETTE.env.water, 0.3);
    lt.stamp(-9.2, zForms + 2, 3, PALETTE.env.amber, 0.35);
    lt.occlude(4.8, zForms + 1, 4, 0.5);
    lt.bake();
  }

  return {
    name: 'lookdev',
    tags,
    chartLit,
    chartShade,
    prismFaces,
    update() {
      batch.begin();
      batch.push(STATIC_SKELETON, look);
      batch.end();
    },
    prewarm() {
      batch.begin();
      batch.push(STATIC_SKELETON, look);
      batch.end();
    },
    dispose() {
      ctx.layers.terrain.remove(root);
      batch.removeFrom(ctx.layers.units);
      batch.dispose();
      for (const d of disposables) d.dispose();
      for (const t of tags) t.el.remove();
    },
  };
};

// ───────────────────────────── 启动 ─────────────────────────────

const qp = params.get('quality');
let quality: Quality = qp === 'low' || qp === 'medium' || qp === 'high' ? qp : 'high';
const state = createMockState();
const renderer = createRendererCore(app, state, { quality }, [createLookdev]);
const engine = renderer.engine;
const mod = renderer.context.getModule<LookdevModule>('lookdev') as LookdevModule;

renderer.setCameraPeek({ x: num('x') ?? 0, y: num('y') ?? 0 });
renderer.snapCamera();
const pitch = num('pitch');
if (pitch !== null) engine.rig.setOverride({ pitch, distance: num('dist') ?? 27.5, yaw: num('yaw') ?? 0, fov: num('fov') ?? 32 });
if (!showHud) {
  hud.style.display = 'none';
  probe.style.display = 'none';
  help.style.display = 'none';
}

// 取样页默认关掉随屏幕位置变化的后期项(薄霾抬亮屏幕上沿的暗部、暗角压暗四角)，读数才等于「光照 + 色调映射 + 基础调色」
const flattenPost = (): void => {
  if (params.get('post') === '1') return;
  engine.grade.haze = 0;
  engine.grade.vignette = 0;
};
flattenPost();

// ── 试光：只改本页的灯光与调色，用来在动工程常量之前比较几组取值 ──
{
  const li = engine.lights;
  const hexOf = (k: string): number | null => {
    const v = params.get(k);
    return v && /^[0-9a-fA-F]{6}$/.test(v) ? parseInt(v, 16) : null;
  };
  const sun = num('sun');
  if (sun !== null) li.sun.intensity = sun;
  const sunc = hexOf('sunc');
  if (sunc !== null) li.sun.color.set(sunc);
  const hemi = num('hemi');
  if (hemi !== null) li.hemi.intensity = hemi;
  const sky = hexOf('sky');
  if (sky !== null) li.hemi.color.set(sky);
  const bounce = num('bounce');
  if (bounce !== null) li.hemi.groundColor.set(PALETTE.env.bounce).multiplyScalar(bounce);
  const exp = num('exp');
  if (exp !== null) {
    engine.grade.exposure = exp;
    engine.renderer.toneMappingExposure = exp;
  }
  const sg = params.get('shadeg')?.split(',').map(Number);
  if (sg && sg.length === 3 && sg.every(Number.isFinite)) SHARED.uShadeTintGround.value.setRGB(sg[0], sg[1], sg[2]);
  const su = hexOf('shadeu');
  if (su !== null) SHARED.uShadeTint.value.set(su);
}
help.textContent = '悬停读色 · 1/2/3 画质\n?quality= ?tint=1 ?x=&y= ?pitch=&dist=&yaw=&fov= ?hud=0 ?t=';

// ── 取色 ──
const gl = engine.renderer.getContext() as WebGL2RenderingContext;
const px = new Uint8Array(5 * 5 * 4);

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lstar(y: number): number {
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

interface Sample {
  r: number;
  g: number;
  b: number;
  hex: string;
  L: number;
}

/** 读 canvas 上 (clientX, clientY) 周围 5×5 像素的平均值。必须紧跟在一次绘制之后调用(同一个任务里，缓冲还没被合成器收走) */
function sample(clientX: number, clientY: number): Sample | null {
  const rect = engine.canvas.getBoundingClientRect();
  const sx = Math.round(((clientX - rect.left) / rect.width) * engine.canvas.width);
  const sy = Math.round((1 - (clientY - rect.top) / rect.height) * engine.canvas.height);
  if (sx < 2 || sy < 2 || sx >= engine.canvas.width - 2 || sy >= engine.canvas.height - 2) return null;
  engine.renderer.setRenderTarget(null);
  gl.readPixels(sx - 2, sy - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let r = 0;
  let g = 0;
  let b = 0;
  let y = 0;
  for (let i = 0; i < 25; i++) {
    r += px[i * 4];
    g += px[i * 4 + 1];
    b += px[i * 4 + 2];
    y += 0.2126 * srgbToLinear(px[i * 4]) + 0.7152 * srgbToLinear(px[i * 4 + 1]) + 0.0722 * srgbToLinear(px[i * 4 + 2]);
  }
  r /= 25;
  g /= 25;
  b /= 25;
  const h = (v: number): string => Math.round(v).toString(16).padStart(2, '0');
  return { r, g, b, hex: `#${h(r)}${h(g)}${h(b)}`, L: lstar(y / 25) };
}

const scr = { x: 0, y: 0, visible: false };
function sampleWorld(p: ProbePoint): Sample | null {
  renderer.context.worldToScreen(p.x, p.h, p.z, scr);
  return scr.visible ? sample(scr.x, scr.y) : null;
}

interface ChartRow {
  name: string;
  hex: string;
  lit: number | null;
  shade: number | null;
  targetLit: [number, number] | null;
  targetShade: [number, number] | null;
}

function chart(): { tiles: ChartRow[]; prisms: (number | null)[][] } {
  const tiles = CHART.map((c, i) => ({
    name: c.name,
    hex: `#${c.color.toString(16).padStart(6, '0')}`,
    lit: sampleWorld(mod.chartLit[i])?.L ?? null,
    shade: sampleWorld(mod.chartShade[i])?.L ?? null,
    targetLit: c.lit,
    targetShade: c.shade,
  }));
  const prisms = mod.prismFaces.map((faces) => faces.map((f) => sampleWorld(f)?.L ?? null));
  return { tiles, prisms };
}

const fmt = (v: number | null): string => (v === null ? '  —  ' : v.toFixed(1).padStart(5));
const range = (r: [number, number] | null): string => (r ? `${r[0]}~${r[1]}` : '');
const mark = (v: number | null, r: [number, number] | null): string => (v === null || !r ? ' ' : v < r[0] - 0.5 ? '↓' : v > r[1] + 0.5 ? '↑' : '✓');

function refreshHud(): void {
  const s = renderer.getStats();
  const c = chart();
  const g = engine.grade;
  const sunHex = `#${engine.lights.sun.color.getHexString()}`;
  const lines = [
    `画质 ${quality} · draw ${s.drawCalls} · 三角 ${(s.triangles / 1000).toFixed(1)}k · ${s.fps}fps`,
    `主光 ${engine.lights.sun.intensity} ${sunHex} 方向(${SUN_DIR.x.toFixed(2)}, ${SUN_DIR.y.toFixed(2)}, ${SUN_DIR.z.toFixed(2)})  [工程值 ${SUN_INTENSITY}]`,
    `天光 ${engine.lights.hemi.intensity} #${engine.lights.hemi.color.getHexString()}  [工程值 ${HEMI_INTENSITY}，地面反光 ×${BOUNCE_GAIN}]`,
    `曝光 ${g.exposure} · 对比 ${g.contrast} · 饱和 ${g.saturation}+${g.vibrance}`,
    '',
    '亮度色卡      反照率    受光 L*        阴影 L*',
  ];
  for (const t of c.tiles) {
    lines.push(`${t.name.padEnd(6, '　')} ${t.hex}  ${fmt(t.lit)} ${mark(t.lit, t.targetLit)} ${range(t.targetLit).padEnd(6)} ${fmt(t.shade)} ${mark(t.shade, t.targetShade)} ${range(t.targetShade)}`);
  }
  lines.push('', '岩柱三面      亮       灰       暗');
  const names = ['50% 灰', '岩色　'];
  c.prisms.forEach((p, i) => lines.push(`${names[i]}      ${fmt(p[0])}    ${fmt(p[1])}    ${fmt(p[2])}${i === 1 ? '   目标 亮 62~68 / 暗 35~40' : ''}`));
  hud.textContent = lines.join('\n');
}

let mouse: { x: number; y: number } | null = null;
addEventListener('pointermove', (e) => {
  mouse = { x: e.clientX, y: e.clientY };
});
addEventListener('keydown', (e) => {
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    quality = e.code === 'Digit1' ? 'low' : e.code === 'Digit2' ? 'medium' : 'high';
    renderer.setQuality(quality);
    flattenPost();
  }
});
addEventListener('resize', () => renderer.resize());

const fixedT = num('t');
const maxFrames = num('frames');
let last = performance.now();
let frames = 0;
function frame(now: number): void {
  const dt = fixedT !== null ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  if (fixedT !== null) SHARED.uTime.value = fixedT;
  renderer.render(state, 1, dt);
  if (showHud) {
    for (const t of mod.tags) {
      renderer.context.worldToScreen(t.x, t.h, t.z, scr);
      t.el.style.display = scr.visible ? '' : 'none';
      t.el.style.left = `${scr.x}px`;
      t.el.style.top = `${scr.y}px`;
    }
    if (frames % 20 === 2 || (maxFrames !== null && frames + 1 >= maxFrames)) refreshHud();
    if (mouse) {
      const s = sample(mouse.x, mouse.y);
      probe.textContent = s ? `指针 ${s.hex}  L* ${s.L.toFixed(1)}\nrgb ${s.r.toFixed(0)}, ${s.g.toFixed(0)}, ${s.b.toFixed(0)}` : '';
    }
  }
  frames++;
  if (maxFrames === null || frames < maxFrames) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, {
  __lookdev: {
    renderer,
    engine,
    state,
    /** 画一帧并读出色卡(不依赖面板是否显示) */
    chart: () => {
      renderer.render(state, 1, 0);
      return chart();
    },
    sample: (x: number, y: number) => {
      renderer.render(state, 1, 0);
      return sample(x, y);
    },
    get frames() {
      return frames;
    },
  },
});
