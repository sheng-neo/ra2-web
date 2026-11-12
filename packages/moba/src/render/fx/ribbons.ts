/**
 * 带状拖尾：固定数量的拖尾槽位共用一个动态网格(一个 draw call)。
 * 每条拖尾是一串带出生时间的路径点，顶点着色器把它展开成朝向相机(或贴地)的带子；
 * 颜色/宽度/透明度按点的年龄从头到尾渐变。也提供「本帧直线」(塔的警示连线、锁定连线)。
 */
import * as THREE from 'three';
import { GLSL_ADDITIVE, GLSL_NOISE } from '../materials';
import { GLSL_FX_OUT, applyFxBlending } from './textures';

const RIBBONS = 56;
const POINTS = 16;
const STRIDE = 16;

export interface RibbonStyleInput {
  /** 头部全宽(米) */
  width: number;
  /** 尾迹存活时间(秒) */
  life: number;
  color: number;
  color2?: number;
  intensity?: number;
  intensity2?: number;
  add?: number;
  /** 尾端宽度比例(0 = 收成尖) */
  taper?: number;
  /** 火焰/烟雾状的噪声侵蚀 0..1 */
  noise?: number;
  /** 贴地(否则朝向相机) */
  flat?: boolean;
  /** 中线白热程度 */
  core?: number;
  alpha?: number;
  /** 相邻路径点的最小间距(米) */
  step?: number;
}

export interface RibbonStyle {
  width: number;
  life: number;
  c0: THREE.Color;
  c1: THREE.Color;
  i0: number;
  i1: number;
  add: number;
  taper: number;
  noise: number;
  flat: number;
  core: number;
  alpha: number;
  step: number;
}

export function ribbonStyle(o: RibbonStyleInput): RibbonStyle {
  const i0 = o.intensity ?? 1;
  return {
    width: o.width,
    life: o.life,
    c0: new THREE.Color(o.color),
    c1: new THREE.Color(o.color2 ?? o.color),
    i0,
    i1: o.intensity2 ?? i0,
    add: o.add ?? 1,
    taper: o.taper ?? 0,
    noise: o.noise ?? 0,
    flat: o.flat ? 1 : 0,
    core: o.core ?? 0.5,
    alpha: o.alpha ?? 1,
    step: o.step ?? 0.25,
  };
}

class Ribbon {
  active = false;
  emitting = false;
  /** 只画一帧的直线 */
  once = false;
  /** 释放后需要把顶点清零一次 */
  stale = false;
  gen = 0;
  style: RibbonStyle = ribbonStyle({ width: 0.1, life: 0.1, color: 0xffffff });
  c0 = new THREE.Color();
  c1 = new THREE.Color();
  widthScale = 1;
  // 路径点环形缓冲：最新的在 head
  px = new Float32Array(POINTS);
  py = new Float32Array(POINTS);
  pz = new Float32Array(POINTS);
  birth = new Float32Array(POINTS);
  head = -1;
  count = 0;
  // 实时头部(每帧跟随发射者)
  hx = 0;
  hy = 0;
  hz = 0;
  endTime = 0;
}

const VERTEX = /* glsl */ `
attribute vec3 aTan;
attribute vec4 aRib;
attribute vec4 aCol;
attribute vec2 aFx;
varying vec4 vCol;
varying vec4 vRib;
varying vec2 vFx;
void main() {
  float side = uv.x;
  float hw = aRib.x;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  if (aRib.w > 0.5) {
    vec2 t = aTan.xz;
    float l = length(t);
    t = l > 1e-5 ? t / l : vec2(1.0, 0.0);
    mv = viewMatrix * vec4(position + vec3(-t.y, 0.0, t.x) * (side * hw), 1.0);
  } else {
    vec3 tv = (viewMatrix * vec4(aTan, 0.0)).xyz;
    vec3 nv = cross(tv, mv.xyz);
    float l = length(nv);
    nv = l > 1e-6 ? nv / l : vec3(0.0, 1.0, 0.0);
    mv.xyz += nv * (side * hw);
  }
  gl_Position = projectionMatrix * mv;
  vCol = aCol;
  vRib = vec4(side, aRib.y, aRib.z, uv.y);
  vFx = aFx;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uNow;
varying vec4 vCol;
varying vec4 vRib;
varying vec2 vFx;
${GLSL_NOISE}
${GLSL_ADDITIVE}
void main() {
  float v = vRib.x;
  float prof = max(0.0, 1.0 - v * v);
  float a = prof * sqrt(prof);
  if (vFx.x > 0.0) {
    // 噪声顺着带子向尾部流动，把边缘侵蚀成火舌/烟缕
    float n = fbm(vec2(vRib.y * 5.0 + vRib.w * 3.0 - uNow * 2.6, v * 1.6 + vRib.w * 7.0));
    a *= mix(1.0, smoothstep(0.25, 0.75, n + prof * 0.45 - vRib.y * 0.35), vFx.x);
  }
  float fxA = min(1.0, a * vRib.z);
  if (fxA < 0.004) discard;
  float fxAdd = vCol.a;
  float m = max(vCol.r, max(vCol.g, vCol.b));
  float core = vFx.y * prof * prof * prof;
  vec3 fxC = vCol.rgb * (1.0 + core * 0.6) + vec3(m * core * 0.3);
  ${GLSL_FX_OUT}
}
`;

export class RibbonSystem {
  readonly mesh: THREE.Mesh;
  now = 0;
  private ribbons: Ribbon[] = [];
  private data: Float32Array;
  private buffer: THREE.InterleavedBuffer;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private range = { start: 0, count: 0 };
  private lastHi = 0;

  constructor() {
    const verts = RIBBONS * POINTS * 2;
    this.data = new Float32Array(verts * STRIDE);
    for (let i = 0; i < RIBBONS; i++) this.ribbons.push(new Ribbon());
    const geo = new THREE.BufferGeometry();
    const buf = new THREE.InterleavedBuffer(this.data, STRIDE);
    buf.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(buf, 3, 0));
    geo.setAttribute('aTan', new THREE.InterleavedBufferAttribute(buf, 3, 3));
    geo.setAttribute('aRib', new THREE.InterleavedBufferAttribute(buf, 4, 6));
    geo.setAttribute('aCol', new THREE.InterleavedBufferAttribute(buf, 4, 10));
    geo.setAttribute('aFx', new THREE.InterleavedBufferAttribute(buf, 2, 14));
    // 静态 uv：x = 左右侧(±1)，y = 槽位随机数(噪声相位)
    const uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let r = 0; r < RIBBONS; r++) {
      const seed = (r * 0.6180339) % 1;
      for (let k = 0; k < POINTS; k++) {
        const v = (r * POINTS + k) * 2;
        uv[v * 2] = -1;
        uv[v * 2 + 1] = seed;
        uv[v * 2 + 2] = 1;
        uv[v * 2 + 3] = seed;
        if (k < POINTS - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.buffer = buf;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uNow: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.DoubleSide,
    });
    applyFxBlending(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fx.ribbons';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  private alloc(): Ribbon | null {
    for (const r of this.ribbons) {
      if (!r.active) {
        r.active = true;
        r.stale = false;
        r.once = false;
        r.emitting = true;
        r.count = 0;
        r.head = -1;
        r.widthScale = 1;
        r.gen = (r.gen + 1) & 0xffff;
        return r;
      }
    }
    return null;
  }

  private pushPoint(r: Ribbon, x: number, y: number, z: number, t: number): void {
    r.head = (r.head + 1) % POINTS;
    r.px[r.head] = x;
    r.py[r.head] = y;
    r.pz[r.head] = z;
    r.birth[r.head] = t;
    // 留一个位置给实时头部
    if (r.count < POINTS - 1) r.count++;
  }

  /** 开始一条拖尾，返回句柄(池满返回 -1)。tint 覆盖样式颜色 */
  start(style: RibbonStyle, x: number, y: number, z: number, tint?: THREE.Color, tint2?: THREE.Color): number {
    const r = this.alloc();
    if (!r) return -1;
    r.style = style;
    r.c0.copy(tint ?? style.c0);
    r.c1.copy(tint2 ?? tint ?? style.c1);
    r.hx = x;
    r.hy = y;
    r.hz = z;
    this.pushPoint(r, x, y, z, this.now);
    return this.ribbons.indexOf(r) | (r.gen << 8);
  }

  private get(h: number): Ribbon | null {
    if (h < 0) return null;
    const r = this.ribbons[h & 0xff];
    return r && r.active && r.gen === h >> 8 ? r : null;
  }

  /** 每帧把拖尾头部移到新位置 */
  move(h: number, x: number, y: number, z: number): void {
    const r = this.get(h);
    if (!r || !r.emitting) return;
    r.hx = x;
    r.hy = y;
    r.hz = z;
    const i = r.head;
    const dx = x - r.px[i];
    const dy = y - r.py[i];
    const dz = z - r.pz[i];
    const st = r.style;
    // 走远了，或者上一个固定点已经太老：落一个新的固定点
    if (dx * dx + dy * dy + dz * dz > st.step * st.step || this.now - r.birth[i] > st.life / (POINTS - 3)) this.pushPoint(r, x, y, z, this.now);
  }

  /** 调整一条拖尾的宽度倍率(蓄力/收束) */
  setWidth(h: number, scale: number): void {
    const r = this.get(h);
    if (r) r.widthScale = scale;
  }

  /** 停止发射：尾迹自然消散后槽位自动回收 */
  end(h: number): void {
    const r = this.get(h);
    if (!r || !r.emitting) return;
    r.emitting = false;
    r.endTime = this.now;
    this.pushPoint(r, r.hx, r.hy, r.hz, this.now);
  }

  /**
   * 一次性铺一条从 a 到 b 的拖尾，就像有东西从现在起 duration 秒内飞过(沿途依次亮起，随后按样式寿命消散)。
   * 用于瞬移/斩击这类「事件发生时路径已知」的效果。arc 为中段抬高的高度。
   */
  trace(style: RibbonStyle, ax: number, ay: number, az: number, bx: number, by: number, bz: number, duration: number, tint?: THREE.Color, tint2?: THREE.Color, arc = 0): void {
    const r = this.alloc();
    if (!r) return;
    r.style = style;
    r.c0.copy(tint ?? style.c0);
    r.c1.copy(tint2 ?? tint ?? style.c1);
    const n = POINTS - 2;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      // 出生时间沿路径递增：还没「飞到」的点暂不显示
      this.pushPoint(r, ax + (bx - ax) * k, ay + (by - ay) * k + Math.sin(k * Math.PI) * arc, az + (bz - az) * k, this.now + duration * k);
    }
    r.count = POINTS - 1;
    r.hx = bx;
    r.hy = by;
    r.hz = bz;
    r.emitting = false;
    r.endTime = this.now;
  }

  /** 本帧画一条直线(下一帧自动消失)。width 为全宽 */
  line(style: RibbonStyle, ax: number, ay: number, az: number, bx: number, by: number, bz: number, tint?: THREE.Color, alpha = 1): void {
    const r = this.alloc();
    if (!r) return;
    r.style = style;
    r.c0.copy(tint ?? style.c0);
    r.c1.copy(tint ?? style.c1);
    r.once = true;
    r.widthScale = alpha;
    // 多放几个中间点：带子按透视正确展开，也让流动噪声有分辨率
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      this.pushPoint(r, ax + (bx - ax) * k, ay + (by - ay) * k, az + (bz - az) * k, this.now);
    }
    r.hx = bx;
    r.hy = by;
    r.hz = bz;
    r.emitting = false;
  }

  /** 每帧一次：重建活动拖尾的顶点并上传 */
  flush(): void {
    this.mat.uniforms.uNow.value = this.now;
    const now = this.now;
    const d = this.data;
    let hi = 0;
    for (let ri = 0; ri < RIBBONS; ri++) {
      const r = this.ribbons[ri];
      const base = ri * POINTS * 2 * STRIDE;
      if (!r.active) {
        if (r.stale) {
          d.fill(0, base, base + POINTS * 2 * STRIDE);
          r.stale = false;
          hi = ri + 1;
        }
        continue;
      }
      hi = ri + 1;
      const st = r.style;
      const life = st.life;
      // 依次写：实时头部(仅发射中) → 固定点(新 → 旧)
      let k = 0;
      let lastX = 0;
      let lastY = 0;
      let lastZ = 0;
      let alive = false;
      const total = r.count + (r.emitting ? 1 : 0);
      for (let s = 0; s < POINTS; s++) {
        let x: number;
        let y: number;
        let z: number;
        let u: number;
        if (s < total) {
          if (r.emitting && s === 0) {
            x = r.hx;
            y = r.hy;
            z = r.hz;
            u = 0;
          } else {
            const j = (r.head - (r.emitting ? s - 1 : s) + POINTS * 2) % POINTS;
            x = r.px[j];
            y = r.py[j];
            z = r.pz[j];
            u = r.once ? s / (total - 1) : (now - r.birth[j]) / life;
          }
          if (u < 1) alive = true;
          lastX = x;
          lastY = y;
          lastZ = z;
        } else {
          // 用最后一个点补齐(宽度 0 的退化三角形)
          x = lastX;
          y = lastY;
          z = lastZ;
          u = 2;
        }
        const o = base + k * 2 * STRIDE;
        d[o] = x;
        d[o + 1] = y;
        d[o + 2] = z;
        d[o + 7] = u;
        k++;
      }
      if (r.once) {
        // 直线：两端收尖一点，颜色不随长度变
        for (let s = 0; s < POINTS; s++) {
          const o = base + s * 2 * STRIDE;
          const u = d[o + 7];
          const on = u <= 1 ? 1 : 0;
          const edge = on * Math.min(1, Math.min(u, 1 - u) * 5 + 0.25);
          this.writePoint(o, r, st, s, st.width * 0.5 * edge, on * st.alpha * r.widthScale, 0, u);
        }
        r.active = false;
        r.stale = true;
        continue;
      }
      if (!alive && !r.emitting) {
        r.active = false;
        d.fill(0, base, base + POINTS * 2 * STRIDE);
        continue;
      }
      for (let s = 0; s < POINTS; s++) {
        const o = base + s * 2 * STRIDE;
        const u = d[o + 7];
        if (u >= 1) {
          this.writePoint(o, r, st, s, 0, 0, 1, 1);
          continue;
        }
        const uc = u < 0 ? 0 : u;
        const w = st.width * 0.5 * r.widthScale * (1 + (st.taper - 1) * uc);
        // 尚未「飞到」的点(trace 里出生时间在未来)不显示
        const a = u < 0 ? 0 : st.alpha * (1 - uc) * (1 - uc * uc);
        this.writePoint(o, r, st, s, w, a, uc, uc);
      }
    }
    const top = Math.max(hi, this.lastHi);
    this.lastHi = hi;
    this.geo.setDrawRange(0, hi * (POINTS - 1) * 6);
    if (top > 0) {
      this.range.start = 0;
      this.range.count = top * POINTS * 2 * STRIDE;
      this.buffer.updateRanges.length = 0;
      this.buffer.updateRanges.push(this.range);
      this.buffer.needsUpdate = true;
    }
    this.mesh.visible = hi > 0;
  }

  /** 写一个路径点的两个顶点(位置已经在 o 处)：切线取相邻点差分 */
  private writePoint(o: number, r: Ribbon, st: RibbonStyle, s: number, halfW: number, alpha: number, colorT: number, u: number): void {
    const d = this.data;
    const step = 2 * STRIDE;
    const prev = s > 0 ? o - step : o;
    const next = s < POINTS - 1 ? o + step : o;
    let tx = d[prev] - d[next];
    let ty = d[prev + 1] - d[next + 1];
    let tz = d[prev + 2] - d[next + 2];
    if (tx * tx + ty * ty + tz * tz < 1e-10) {
      // 与补齐点重合：沿用上一个点的切线
      if (s > 0) {
        tx = d[prev + 3];
        ty = d[prev + 4];
        tz = d[prev + 5];
      } else tx = 1;
    }
    const cr = (r.c0.r + (r.c1.r - r.c0.r) * colorT) * (st.i0 + (st.i1 - st.i0) * colorT);
    const cg = (r.c0.g + (r.c1.g - r.c0.g) * colorT) * (st.i0 + (st.i1 - st.i0) * colorT);
    const cb = (r.c0.b + (r.c1.b - r.c0.b) * colorT) * (st.i0 + (st.i1 - st.i0) * colorT);
    const x = d[o];
    const y = d[o + 1];
    const z = d[o + 2];
    for (let v = 0; v < 2; v++) {
      const q = o + v * STRIDE;
      d[q] = x;
      d[q + 1] = y;
      d[q + 2] = z;
      d[q + 3] = tx;
      d[q + 4] = ty;
      d[q + 5] = tz;
      d[q + 6] = halfW;
      d[q + 7] = u;
      d[q + 8] = alpha;
      d[q + 9] = st.flat;
      d[q + 10] = cr;
      d[q + 11] = cg;
      d[q + 12] = cb;
      d[q + 13] = st.add;
      d[q + 14] = st.noise;
      d[q + 15] = st.core;
    }
  }

  clear(): void {
    for (const r of this.ribbons) {
      if (r.active) r.stale = true;
      r.active = false;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
