/**
 * 池化 GPU 粒子：一个实例化四边形网格、一个 draw call，运动全部在顶点着色器里按出生参数解析求值，
 * CPU 只在「出生」时往环形缓冲区写一次(之后零开销)，缓冲区写满后覆盖最老的粒子。
 *
 * 支持：朝向相机的公告板 / 沿速度拉伸 / 贴地平铺；弹道运动(重力 + 阻尼) / 环绕运动(绕竖直轴螺旋)；
 * 颜色、尺寸、透明度随生命变化；每个粒子自带「叠加比例」，叠加光效与遮挡型烟尘可以混在同一个 draw call 里。
 * 出生时间可以在未来(delay)，用来做不靠 CPU 定时器的分批喷发。
 */
import * as THREE from 'three';
import { GLSL_ADDITIVE } from '../materials';
import { ATLAS_COLS, ATLAS_ROWS, GLSL_FX_OUT, applyFxBlending } from './textures';
import { Rand } from './util';

const STRIDE = 28;
export const MAX_PARTICLES = 6144;

export const ORIENT = { billboard: 0, stretch: 1, flat: 2 } as const;

export interface ParticleStyleInput {
  sprite: number;
  /** 随机换用的第二种图形(烟团变体等) */
  sprite2?: number;
  /** 叠加比例：1 = 纯加色发光，0 = 普通透明(遮挡背景)。默认 1 */
  add?: number;
  /** 起止颜色(sRGB 十六进制)与 HDR 亮度倍率 */
  color?: number;
  color2?: number;
  intensity?: number;
  intensity2?: number;
  /** 起止透明度 */
  alpha?: number;
  alpha2?: number;
  /** 淡入所占生命比例 / 从生命的哪个比例开始淡出 */
  fadeIn?: number;
  fadeOut?: number;
  /** 重力加速度(正值向下，负值上浮) */
  gravity?: number;
  /** 线性阻尼(1/秒) */
  drag?: number;
  orient?: number;
  /** 拉伸模式下每 1 米/秒速度增加的长度(秒) */
  stretch?: number;
  /** 随机自转角速度上限(弧度/秒) */
  spin?: number;
  /** 固定初始角度；缺省 = 随机 */
  rot?: number;
  /** 亮度随机抖动 0..1 */
  vary?: number;
}

export interface ParticleStyle {
  sprite: number;
  sprite2: number;
  add: number;
  c0: THREE.Color;
  c1: THREE.Color;
  i0: number;
  i1: number;
  a0: number;
  a1: number;
  fadeIn: number;
  fadeOut: number;
  gravity: number;
  drag: number;
  orient: number;
  stretch: number;
  spin: number;
  rot: number;
  vary: number;
}

/** 预先定义粒子样式(模块级常量)，运行时不再分配 */
export function particleStyle(o: ParticleStyleInput): ParticleStyle {
  const i0 = o.intensity ?? 1;
  return {
    sprite: o.sprite,
    sprite2: o.sprite2 ?? o.sprite,
    add: o.add ?? 1,
    c0: new THREE.Color(o.color ?? 0xffffff),
    c1: new THREE.Color(o.color2 ?? o.color ?? 0xffffff),
    i0,
    i1: o.intensity2 ?? i0,
    a0: o.alpha ?? 1,
    a1: o.alpha2 ?? o.alpha ?? 1,
    fadeIn: o.fadeIn ?? 0.06,
    fadeOut: o.fadeOut ?? 0.45,
    gravity: o.gravity ?? 0,
    drag: o.drag ?? 0,
    orient: o.orient ?? ORIENT.billboard,
    stretch: o.stretch ?? 0,
    spin: o.spin ?? 0,
    rot: o.rot ?? NaN,
    vary: o.vary ?? 0,
  };
}

const VERTEX = /* glsl */ `
uniform float uNow;
uniform vec2 uAtlas;
attribute vec4 aP;
attribute vec4 aV;
attribute vec4 aM;
attribute vec4 aS;
attribute vec4 aC0;
attribute vec4 aC1;
attribute vec4 aX;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vMix;
void main() {
  float age = uNow - aP.w;
  float life = aV.w;
  float t = life > 0.0 ? age / life : 2.0;
  if (age < 0.0 || t >= 1.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  float motion = step(3.5, aS.w);
  float orient = aS.w - motion * 4.0;
  vec3 pos;
  vec3 vel;
  float rot;
  if (motion < 0.5) {
    // 弹道：线性阻尼 + 重力(有阻尼时趋向终端速度)
    float k = aM.y;
    float g = aM.x;
    if (k > 0.001) {
      float e = exp(-k * age);
      float f = (1.0 - e) / k;
      pos = aP.xyz + aV.xyz * f;
      vel = aV.xyz * e;
      pos.y -= g * (age - f) / k;
      vel.y -= g * (1.0 - e) / k;
    } else {
      pos = aP.xyz + aV.xyz * age;
      vel = aV.xyz;
      pos.y -= 0.5 * g * age * age;
      vel.y -= g * age;
    }
    // 受重力的碎屑落到地面就停住
    if (g > 0.0) pos.y = max(pos.y, 0.05);
    rot = aM.z + aM.w * age;
  } else {
    // 环绕：半径 r0→r1，角度 θ0 + ω·age，竖直匀速(可带重力)
    float r = mix(aV.x, aV.z, t);
    float th = aM.z + aM.w * age;
    float cs = cos(th);
    float sn = sin(th);
    pos = aP.xyz + vec3(cs * r, aV.y * age - 0.5 * aM.x * age * age, sn * r);
    vel = vec3(-sn * r * aM.w + cs * (aV.z - aV.x) / life, aV.y - aM.x * age, cs * r * aM.w + sn * (aV.z - aV.x) / life);
    rot = -th;
  }
  float grow = 1.0 - (1.0 - t) * (1.0 - t);
  float size = mix(aS.x, aS.y, grow);
  float alpha = mix(aC0.a, aC1.a, t) * smoothstep(0.0, max(aX.z, 1e-4), t) * (1.0 - smoothstep(aX.w, 1.0, t));
  vec3 color = mix(aC0.rgb, aC1.rgb, t);
  vec2 corner = position.xy;
  vec4 mv;
  if (orient < 0.5) {
    float cr = cos(rot);
    float sr = sin(rot);
    mv = viewMatrix * vec4(pos, 1.0);
    mv.xy += vec2(corner.x * cr - corner.y * sr, corner.x * sr + corner.y * cr) * size;
    // 朝相机拉近半个身位：贴近地面的公告板下半截不会被地面裁掉
    mv.z += size * 0.5;
  } else if (orient < 1.5) {
    mv = viewMatrix * vec4(pos, 1.0);
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    float sp = length(vv.xy);
    vec2 d = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
    float len = size + aS.z * length(vel);
    mv.xy += d * (corner.x * len) + vec2(-d.y, d.x) * (corner.y * size);
    mv.z += size * 0.5;
  } else {
    float cr = cos(rot);
    float sr = sin(rot);
    vec2 q = vec2(corner.x * cr - corner.y * sr, corner.x * sr + corner.y * cr) * size;
    mv = viewMatrix * vec4(pos + vec3(q.x, 0.0, q.y), 1.0);
  }
  gl_Position = projectionMatrix * mv;
  float cell = aX.x;
  float cx = mod(cell, ${ATLAS_COLS}.0);
  float cy = floor(cell / ${ATLAS_COLS}.0);
  vUv = (vec2(cx, cy) + vec2(corner.x + 0.5, 0.5 - corner.y)) * uAtlas;
  vColor = vec4(color, alpha);
  vMix = vec2(aX.y, max(color.r, max(color.g, color.b)) * 0.85);
}
`;

/** 图集精灵的片元着色器(立即模式精灵批也用它) */
export const SPRITE_FRAGMENT = /* glsl */ `
uniform sampler2D tAtlas;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vMix;
${GLSL_ADDITIVE}
void main() {
  vec4 tx = texture2D(tAtlas, vUv);
  float fxA = min(1.0, tx.r * vColor.a);
  if (fxA < 0.004) discard;
  float fxAdd = vMix.x;
  // 亮核主要是把本色提亮，只掺一点白：大量粒子叠在一起时颜色不至于被冲成纯白
  vec3 fxC = vColor.rgb * (tx.g + tx.b * 0.6) + vec3(tx.b * vMix.y * 0.3);
  ${GLSL_FX_OUT}
}
`;

export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  /** 特效时钟(秒)，由 FxKit 推进 */
  now = 0;
  /** 累计出生数(统计/测试用) */
  spawned = 0;

  private data: Float32Array;
  private buffer: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private cap: number;
  private cursor = 0;
  private dirtyStart = 0;
  private dirtyCount = 0;
  private rangeA = { start: 0, count: 0 };
  private rangeB = { start: 0, count: 0 };
  private rnd = new Rand(0x51f15e);

  // 当前样式(use() 设置，spawn() 读取)
  private st: ParticleStyle = particleStyle({ sprite: 0 });
  private r0 = 1;
  private g0 = 1;
  private b0 = 1;
  private r1 = 1;
  private g1 = 1;
  private b1 = 1;

  constructor(atlas: THREE.Texture, capacity: number) {
    this.cap = Math.min(MAX_PARTICLES, capacity);
    this.data = new Float32Array(MAX_PARTICLES * STRIDE);
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    // 「待上传」区间一直累积到 three 真正上传为止：两次绘制之间可能 flush 多次(快进、掉帧补帧)
    buf.onUpload(() => {
      this.dirtyCount = 0;
    });
    const names = ['aP', 'aV', 'aM', 'aS', 'aC0', 'aC1', 'aX'];
    names.forEach((n, i) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
    geo.instanceCount = this.cap;
    this.buffer = buf;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uNow: { value: 0 }, uAtlas: { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) }, tAtlas: { value: atlas } },
      vertexShader: VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
      depthTest: true,
    });
    applyFxBlending(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fx.particles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  /** 画质切换：容量变小后只用缓冲区的前一段 */
  setCapacity(n: number): void {
    this.cap = Math.max(256, Math.min(MAX_PARTICLES, n));
    if (this.cursor >= this.cap) this.cursor = 0;
    this.geo.instanceCount = this.cap;
  }

  get capacity(): number {
    return this.cap;
  }

  /** 选择样式(之后的 spawn/orbit 都用它)，颜色取样式自带的 */
  use(st: ParticleStyle): this {
    this.st = st;
    this.r0 = st.c0.r * st.i0;
    this.g0 = st.c0.g * st.i0;
    this.b0 = st.c0.b * st.i0;
    this.r1 = st.c1.r * st.i1;
    this.g1 = st.c1.g * st.i1;
    this.b1 = st.c1.b * st.i1;
    return this;
  }

  /** 覆盖当前样式的颜色(保留样式的亮度倍率)：队伍色/主题色复用同一套样式 */
  tint(c0: THREE.Color, c1: THREE.Color = c0): this {
    const st = this.st;
    this.r0 = c0.r * st.i0;
    this.g0 = c0.g * st.i0;
    this.b0 = c0.b * st.i0;
    this.r1 = c1.r * st.i1;
    this.g1 = c1.g * st.i1;
    this.b1 = c1.b * st.i1;
    return this;
  }

  private write(flags: number, rot: number, spin: number, life: number, s0: number, s1: number, delay: number): number {
    const st = this.st;
    const d = this.data;
    const i = this.cursor;
    const o = i * STRIDE;
    const k = st.vary > 0 ? 1 - st.vary * this.rnd.next() : 1;
    d[o + 3] = this.now + delay;
    d[o + 7] = life;
    d[o + 8] = st.gravity;
    d[o + 9] = st.drag;
    d[o + 10] = rot;
    d[o + 11] = spin;
    d[o + 12] = s0;
    d[o + 13] = s1;
    d[o + 14] = st.stretch;
    d[o + 15] = flags;
    d[o + 16] = this.r0 * k;
    d[o + 17] = this.g0 * k;
    d[o + 18] = this.b0 * k;
    d[o + 19] = st.a0;
    d[o + 20] = this.r1 * k;
    d[o + 21] = this.g1 * k;
    d[o + 22] = this.b1 * k;
    d[o + 23] = st.a1;
    d[o + 24] = st.sprite2 !== st.sprite && this.rnd.next() < 0.5 ? st.sprite2 : st.sprite;
    d[o + 25] = st.add;
    d[o + 26] = st.fadeIn;
    d[o + 27] = st.fadeOut;
    if (this.dirtyCount === 0) this.dirtyStart = i;
    if (this.dirtyCount < this.cap) this.dirtyCount++;
    this.cursor = i + 1 >= this.cap ? 0 : i + 1;
    this.spawned++;
    return o;
  }

  /** 弹道粒子：位置、速度、寿命、起止尺寸(米，直径)、延迟出生 */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size0: number, size1: number, delay = 0): void {
    const st = this.st;
    const rot = Number.isNaN(st.rot) ? this.rnd.next() * 6.2831853 : st.rot;
    const spin = st.spin !== 0 ? st.spin * this.rnd.signed() : 0;
    const o = this.write(st.orient, rot, spin, life, size0, size1, delay);
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 4] = vx;
    d[o + 5] = vy;
    d[o + 6] = vz;
  }

  /** 环绕粒子：绕 (cx,cy,cz) 的竖直轴，半径 r0→r1，初始角 theta，角速度 omega，竖直速度 vy */
  orbit(cx: number, cy: number, cz: number, r0: number, r1: number, theta: number, omega: number, vy: number, life: number, size0: number, size1: number, delay = 0): void {
    const o = this.write(this.st.orient + 4, theta, omega, life, size0, size1, delay);
    const d = this.data;
    d[o] = cx;
    d[o + 1] = cy;
    d[o + 2] = cz;
    d[o + 4] = r0;
    d[o + 5] = vy;
    d[o + 6] = r1;
  }

  /** 每帧一次：同步时钟，并把上次上传以来新出生的粒子标记为待上传 */
  flush(): void {
    this.mat.uniforms.uNow.value = this.now;
    const n = this.dirtyCount;
    if (n === 0) return;
    const buf = this.buffer;
    buf.updateRanges.length = 0;
    if (n < this.cap) {
      const end = this.dirtyStart + n;
      if (end <= this.cap) {
        this.rangeA.start = this.dirtyStart * STRIDE;
        this.rangeA.count = n * STRIDE;
        buf.updateRanges.push(this.rangeA);
      } else {
        this.rangeA.start = this.dirtyStart * STRIDE;
        this.rangeA.count = (this.cap - this.dirtyStart) * STRIDE;
        this.rangeB.start = 0;
        this.rangeB.count = (end - this.cap) * STRIDE;
        buf.updateRanges.push(this.rangeA, this.rangeB);
      }
    }
    buf.needsUpdate = true;
  }

  /** 立刻清空所有粒子(画廊页切换效果时用) */
  clear(): void {
    const d = this.data;
    for (let i = 0; i < MAX_PARTICLES; i++) d[i * STRIDE + 7] = 0;
    this.cursor = 0;
    this.dirtyStart = 0;
    this.dirtyCount = this.cap;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
