/**
 * 铺面溢光场（R4 STREET S-P0-2）：把 FrontageLight 清单（接口 I-1）摊进一张 8 m 格的空间索引，
 * 路面 / 地形材质在片元里逐格取出附近几个亮铺位，算地面上的光斑；行人在 CPU 上按同一公式取照度与方向。
 *
 * - 光斑（地面照度，线性，乘反照率 = 出射亮度）：离玻璃线 s 米处 E = K·I·exp(−s / 1.5)（s < 0 即墙里为 0），
 *   沿铺位方向两端软边（越远越宽）；有雨篷时雨篷下再加一条亮带（雨篷底亮度 × KC，到雨篷外沿后 0.6 m 内消失）。
 *   K 按规格标定（S-P0-2：亮铺门前 Y 0.15–0.30、2–3 m 内衰减）：玻璃 Y 0.4 的铺位，门前 0.3 m 的照度 ≈ 3（陶土砖反照率约 0.09 → Y ≈ 0.27），
 *   1.5 m 处 ≈ 1.3（Y ≈ 0.12），3 m 处 ≈ 0.5；落闸 / 熄灯铺门前只有路灯与环境光（Y ≈ 0.03–0.06）。
 * - 敏感区（及 3 m 内）的光源一律丢掉（S-P0-4）；关门时刻后的光源按 frontageIntensityAt 变暗，太暗的不进索引。
 * - GPU：格索引 R32F（值 = 起点 × 16 + 个数，个数 ≤ 15）+ 条目表 RGBA16F（每条 2 个纹素：线段起点相对格原点、线段向量；
 *   预乘的颜色 × 强度、雨篷深度与亮度编码）。全部登记进显存账本（键 'streets:frontage'）。
 * - 共享 uniform 按引用挂进材质（FRONTAGE_UNIFORMS），setFrontageLights 之后已建好的材质也立刻用上新数据。
 */
import { DataTexture, DataUtils, FloatType, HalfFloatType, NearestFilter, RedFormat, RGBAFormat, Vector4, type IUniform } from 'three';
import type { SensitiveZone } from '@central/data';
import { registerTextureBytes } from '../materials/lighting';
import { zoneDistance } from '../stations/rules';
import { ZONE_CLEAR_M, frontageIntensityAt, type FrontageLight } from './frontage-stub';

/** 格边长（米）。 */
export const FRONT_CELL_M = 8;
/** 光斑在玻璃线外的影响范围（米），用来决定一条光源进哪些格。 */
export const FRONT_REACH_M = 4.5;
/** 一格最多几条（多了留最亮、最近的）。 */
export const FRONT_MAX_PER_CELL = 8;
/** 条目表纹理宽（纹素）。 */
export const FRONT_LIST_W = 1024;
/** 照度标定：E = K × 玻璃亮度 × 衰减。 */
export const FRONT_K = 9.0;
/** 雨篷底亮带：E = KC × 雨篷底亮度。 */
export const FRONT_KC = 6.5;
/** 离玻璃线的衰减长度（米）。 */
export const FRONT_DECAY_M = 1.5;

/** 一条已摊好的光源（模拟米）：起点、单位方向、长度、外法线、预乘颜色（亮度归一 × K × I）、雨篷。 */
export interface FieldLight {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  len: number;
  nx: number;
  ny: number;
  rgb: [number, number, number];
  depth: number;
  soffit: number;
}

/** 单条光源对地面点的照度权重（与 GLSL 版逐项相同）：返回 [光斑权重, 雨篷带权重]。out 给了就写进去（每帧调用时不分配）。 */
export function poolWeights(along: number, s: number, len: number, depth: number, out: [number, number] = [0, 0]): [number, number] {
  const spread = 0.5 + 0.45 * Math.max(s, 0);
  const wA = smoothstep(-spread, spread * 0.6, along) * smoothstep(-spread, spread * 0.6, len - along);
  const wall = smoothstep(-0.35, 0.1, s);
  const wS = wall * Math.exp(-Math.max(s, 0) / FRONT_DECAY_M);
  const wC = depth > 0 ? wall * (1 - smoothstep(depth - 0.2, depth + 0.6, s)) : 0;
  out[0] = wS * wA;
  out[1] = wC * wA;
  return out;
}
const PW: [number, number] = [0, 0];

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** 亮度（Y）归一的颜色。 */
function yNorm(c: readonly number[]): [number, number, number] {
  const y = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  return y > 1e-6 ? [c[0]! / y, c[1]! / y, c[2]! / y] : [1, 1, 1];
}

/** 光源 → 摊好的 FieldLight（法线与线段方向对齐：外法线 = (dy, −dx)，不符就交换端点）。太暗返回 null。 */
export function toFieldLight(l: FrontageLight, clock: number): FieldLight | null {
  const I = frontageIntensityAt(l, clock);
  const soffit = l.canopy && clock < (l.closeHour ?? 99) + 1 ? l.canopy.soffitY : 0;
  if (I < 0.02 && soffit <= 0) return null;
  let ax = l.x0;
  let ay = l.y0;
  let bx = l.x1;
  let by = l.y1;
  let len = Math.hypot(bx - ax, by - ay);
  if (len < 0.2) return null;
  let dx = (bx - ax) / len;
  let dy = (by - ay) / len;
  if (dy * l.nx - dx * l.ny < 0) {
    [ax, ay, bx, by] = [bx, by, ax, ay];
    dx = -dx;
    dy = -dy;
  }
  len = Math.hypot(bx - ax, by - ay);
  const c = yNorm(l.color);
  return {
    x0: ax,
    y0: ay,
    dx,
    dy,
    len,
    nx: dy,
    ny: -dx,
    rgb: [c[0] * FRONT_K * I, c[1] * FRONT_K * I, c[2] * FRONT_K * I],
    depth: l.canopy ? Math.min(Math.max(l.canopy.depth, 0), 4.5) : 0,
    soffit,
  };
}

/** 照度查询结果：线性 RGB 照度与「光从哪边来」的水平方向（指向光源，模拟坐标，未归一；无光为 0）。 */
export interface FrontageSample {
  r: number;
  g: number;
  b: number;
  dirX: number;
  dirY: number;
}

/** 摊好的溢光场（CPU 端；GPU 纹理由 uploadFrontageField 生成）。 */
export class FrontageField {
  readonly lights: FieldLight[];
  /** 格原点（模拟米）与格数。 */
  readonly minX: number;
  readonly minY: number;
  readonly cols: number;
  readonly rows: number;
  /** 每格的条目（lights 下标）。 */
  readonly cells: Int32Array[];

  constructor(list: readonly FrontageLight[], zones: readonly SensitiveZone[], clock: number) {
    const lights: FieldLight[] = [];
    for (const l of list) {
      const f = toFieldLight(l, clock);
      if (!f) continue;
      if (zones.length) {
        const mx = f.x0 + f.dx * f.len * 0.5;
        const my = f.y0 + f.dy * f.len * 0.5;
        const ex = f.x0 + f.dx * f.len;
        const ey = f.y0 + f.dy * f.len;
        const reach = 2 + f.depth;
        const near = Math.min(
          zoneDistance(zones, f.x0, f.y0),
          zoneDistance(zones, ex, ey),
          zoneDistance(zones, mx, my),
          zoneDistance(zones, mx + f.nx * reach, my + f.ny * reach),
        );
        if (near < ZONE_CLEAR_M) continue;
      }
      lights.push(f);
    }
    this.lights = lights;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const R = FRONT_REACH_M;
    for (const f of lights) {
      const ex = f.x0 + f.dx * f.len;
      const ey = f.y0 + f.dy * f.len;
      x0 = Math.min(x0, f.x0, ex) - 0;
      y0 = Math.min(y0, f.y0, ey);
      x1 = Math.max(x1, f.x0, ex);
      y1 = Math.max(y1, f.y0, ey);
    }
    const C = FRONT_CELL_M;
    if (!lights.length) {
      this.minX = 0;
      this.minY = 0;
      this.cols = 0;
      this.rows = 0;
      this.cells = [];
      return;
    }
    this.minX = Math.floor((x0 - R - 2) / C) * C;
    this.minY = Math.floor((y0 - R - 2) / C) * C;
    this.cols = Math.ceil((x1 + R + 2 - this.minX) / C) + 1;
    this.rows = Math.ceil((y1 + R + 2 - this.minY) / C) + 1;
    const lists: number[][] = Array.from({ length: this.cols * this.rows }, () => []);
    lights.forEach((f, k) => {
      // 影响范围：线段两端外 1.5 m、墙里 0.5 m、墙外 R + 雨篷深度
      const reach = R + f.depth;
      const pts: [number, number][] = [];
      for (const [a, s] of [
        [-1.5, -0.5],
        [f.len + 1.5, -0.5],
        [-1.5, reach],
        [f.len + 1.5, reach],
      ] as const) pts.push([f.x0 + f.dx * a + f.nx * s, f.y0 + f.dy * a + f.ny * s]);
      const gx0 = Math.floor((Math.min(...pts.map((p) => p[0])) - this.minX) / C);
      const gx1 = Math.floor((Math.max(...pts.map((p) => p[0])) - this.minX) / C);
      const gy0 = Math.floor((Math.min(...pts.map((p) => p[1])) - this.minY) / C);
      const gy1 = Math.floor((Math.max(...pts.map((p) => p[1])) - this.minY) / C);
      for (let gy = Math.max(gy0, 0); gy <= Math.min(gy1, this.rows - 1); gy++) {
        for (let gx = Math.max(gx0, 0); gx <= Math.min(gx1, this.cols - 1); gx++) {
          // 格与光斑矩形是否真的相交（格中心到线段的距离 ≤ 格半对角 + 范围）
          const cx = this.minX + (gx + 0.5) * C;
          const cy = this.minY + (gy + 0.5) * C;
          if (segDistance(f, cx, cy) > C * 0.71 + reach + 1.5) continue;
          lists[gy * this.cols + gx]!.push(k);
        }
      }
    });
    // 一格超过上限：按「亮度 / (1 + 到格中心距离)」留前几条
    this.cells = lists.map((l, i) => {
      if (l.length <= FRONT_MAX_PER_CELL) return Int32Array.from(l);
      const cx = this.minX + ((i % this.cols) + 0.5) * C;
      const cy = this.minY + (Math.floor(i / this.cols) + 0.5) * C;
      const score = (k: number) => {
        const f = lights[k]!;
        const e = f.rgb[0] * 0.2126 + f.rgb[1] * 0.7152 + f.rgb[2] * 0.0722 + f.soffit * FRONT_KC;
        return e / (1 + segDistance(f, cx, cy));
      };
      return Int32Array.from([...l].sort((a, b) => score(b) - score(a)).slice(0, FRONT_MAX_PER_CELL));
    });
  }

  /** 点 (x, y)（模拟米）的地面照度与来光方向（写进 out，返回 out）。与 GLSL frontageSpill 逐项相同。 */
  sample(x: number, y: number, out: FrontageSample): FrontageSample {
    out.r = 0;
    out.g = 0;
    out.b = 0;
    out.dirX = 0;
    out.dirY = 0;
    if (!this.cols) return out;
    const gx = Math.floor((x - this.minX) / FRONT_CELL_M);
    const gy = Math.floor((y - this.minY) / FRONT_CELL_M);
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return out;
    for (const k of this.cells[gy * this.cols + gx]!) {
      const f = this.lights[k]!;
      const qx = x - f.x0;
      const qy = y - f.y0;
      const along = qx * f.dx + qy * f.dy;
      const s = qx * f.nx + qy * f.ny;
      poolWeights(along, s, f.len, f.depth, PW);
      const w = PW[0];
      const wc = PW[1];
      if (w <= 0 && wc <= 0) continue;
      const c = wc * f.soffit * FRONT_KC;
      const yk = 0.2126 * f.rgb[0] + 0.7152 * f.rgb[1] + 0.0722 * f.rgb[2];
      const cr = f.rgb[0] * w + (yk > 0 ? (f.rgb[0] / yk) * c : c);
      const cg = f.rgb[1] * w + (yk > 0 ? (f.rgb[1] / yk) * c : c);
      const cb = f.rgb[2] * w + (yk > 0 ? (f.rgb[2] / yk) * c : c);
      out.r += cr;
      out.g += cg;
      out.b += cb;
      const e = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      out.dirX -= f.nx * e;
      out.dirY -= f.ny * e;
    }
    return out;
  }

  /** 每格条目数之和（GPU 条目表的条数）。 */
  get entries(): number {
    let n = 0;
    for (const c of this.cells) n += c.length;
    return n;
  }
}

function segDistance(f: FieldLight, x: number, y: number): number {
  const qx = x - f.x0;
  const qy = y - f.y0;
  const t = Math.min(Math.max(qx * f.dx + qy * f.dy, 0), f.len);
  return Math.hypot(qx - f.dx * t, qy - f.dy * t);
}

/** 雨篷编码：a = 深度（1/8 m 一档）+ 雨篷底亮度 / 0.5 × 0.12（在 1/8 档内）。GLSL 解码见 GLSL_FRONTAGE。 */
export function encodeCanopy(depth: number, soffit: number): number {
  const d = Math.round(Math.min(Math.max(depth, 0), 4.5) * 8) / 8;
  return d + (Math.min(Math.max(soffit, 0), 0.5) / 0.5) * 0.12;
}

export function decodeCanopy(a: number): [number, number] {
  const d = Math.floor(a * 8 + 1e-3) / 8;
  return [d, (Math.max(a - d, 0) / 0.12) * 0.5];
}

/** 共享 uniform（按引用挂进路面 / 地形材质；没有数据时 uFrontOn = 0，材质退回旧的程序溢光）。 */
const placeholder = (format: typeof RedFormat | typeof RGBAFormat, type: typeof FloatType | typeof HalfFloatType) => {
  const data = type === FloatType ? new Float32Array(format === RedFormat ? 1 : 4) : new Uint16Array(4);
  const t = new DataTexture(data, 1, 1, format, type);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
};

export const FRONTAGE_UNIFORMS = {
  uFrontGrid: { value: placeholder(RedFormat, FloatType) } as IUniform<DataTexture>,
  uFrontList: { value: placeholder(RGBAFormat, HalfFloatType) } as IUniform<DataTexture>,
  /** 格原点 (minX, minY)、格边长、格列数。 */
  uFrontRect: { value: new Vector4(0, 0, FRONT_CELL_M, 0) } as IUniform<Vector4>,
  /** 格行数（.x）；> 0 才算有数据。 */
  uFrontRows: { value: 0 } as IUniform<number>,
};

let current: FrontageField | null = null;

/** 当前的溢光场（行人取照度用；没有时为 null）。 */
export function frontageField(): FrontageField | null {
  return current;
}

/**
 * 换上新的铺面光源清单（I-1）：重建空间索引与 GPU 纹理，登记显存。clock：钟点（18–26），过了关门时刻的铺子变暗。
 * 返回摊好的场（测试 / 调试用）。
 */
export function setFrontageLights(list: readonly FrontageLight[], zones: readonly SensitiveZone[], clock: number): FrontageField {
  const field = new FrontageField(list, zones, clock);
  current = field;
  const U = FRONTAGE_UNIFORMS;
  if (!field.cols) {
    U.uFrontRows.value = 0;
    registerTextureBytes('streets:frontage', 0);
    return field;
  }
  const grid = new Float32Array(field.cols * field.rows);
  const n = field.entries;
  const rowsL = Math.max(1, Math.ceil((n * 2) / FRONT_LIST_W));
  const list16 = new Uint16Array(FRONT_LIST_W * rowsL * 4);
  let e = 0;
  const h = DataUtils.toHalfFloat;
  field.cells.forEach((cell, i) => {
    grid[i] = e * 16 + cell.length;
    const ox = field.minX + (i % field.cols) * FRONT_CELL_M;
    const oy = field.minY + Math.floor(i / field.cols) * FRONT_CELL_M;
    for (const k of cell) {
      const f = field.lights[k]!;
      const o = e * 8;
      list16[o] = h(f.x0 - ox);
      list16[o + 1] = h(f.y0 - oy);
      list16[o + 2] = h(f.dx * f.len);
      list16[o + 3] = h(f.dy * f.len);
      list16[o + 4] = h(f.rgb[0]);
      list16[o + 5] = h(f.rgb[1]);
      list16[o + 6] = h(f.rgb[2]);
      list16[o + 7] = h(encodeCanopy(f.depth, f.soffit));
      e++;
    }
  });
  const gridTex = new DataTexture(grid, field.cols, field.rows, RedFormat, FloatType);
  const listTex = new DataTexture(list16, FRONT_LIST_W, rowsL, RGBAFormat, HalfFloatType);
  for (const t of [gridTex, listTex]) {
    t.minFilter = NearestFilter;
    t.magFilter = NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
  }
  U.uFrontGrid.value.dispose();
  U.uFrontList.value.dispose();
  U.uFrontGrid.value = gridTex;
  U.uFrontList.value = listTex;
  U.uFrontRect.value.set(field.minX, field.minY, FRONT_CELL_M, field.cols);
  U.uFrontRows.value = field.rows;
  registerTextureBytes('streets:frontage', grid.byteLength + list16.byteLength);
  return field;
}

/**
 * GLSL：铺面溢光（地面照度，线性 RGB）。sim = 模拟坐标米（vec2(vWorld.x, −vWorld.z)）。
 * 需要 FRONTAGE_UNIFORMS；FRONT_MAX（define，缺省 8）是一格最多取几条（LOW 档可设小）。
 */
export const GLSL_FRONTAGE = /* glsl */ `
uniform sampler2D uFrontGrid;
uniform sampler2D uFrontList;
uniform vec4 uFrontRect;
uniform float uFrontRows;
#ifndef FRONT_MAX
#define FRONT_MAX ${FRONT_MAX_PER_CELL}
#endif
bool frontageOn() { return uFrontRows > 0.5; }
vec3 frontageSpill(vec2 sim) {
if (uFrontRows < 0.5) return vec3(0.0);
vec2 g = (sim - uFrontRect.xy) / uFrontRect.z;
if (g.x < 0.0 || g.y < 0.0 || g.x >= uFrontRect.w || g.y >= uFrontRows) return vec3(0.0);
ivec2 gi = ivec2(floor(g));
float packed = texelFetch(uFrontGrid, gi, 0).r;
int cnt = int(packed - 16.0 * floor(packed / 16.0) + 0.5);
int start = int(floor(packed / 16.0) + 0.5);
vec2 local = sim - (uFrontRect.xy + vec2(gi) * uFrontRect.z);
vec3 E = vec3(0.0);
for (int k = 0; k < FRONT_MAX; k++) {
if (k >= cnt) break;
int e = (start + k) * 2;
vec4 a = texelFetch(uFrontList, ivec2(e % ${FRONT_LIST_W}, e / ${FRONT_LIST_W}), 0);
vec4 b = texelFetch(uFrontList, ivec2((e + 1) % ${FRONT_LIST_W}, (e + 1) / ${FRONT_LIST_W}), 0);
float L = max(length(a.zw), 1e-3);
vec2 dir = a.zw / L;
vec2 q = local - a.xy;
float along = dot(q, dir);
float s = dot(q, vec2(dir.y, -dir.x));
float spread = 0.5 + 0.45 * max(s, 0.0);
float wA = smoothstep(-spread, spread * 0.6, along) * smoothstep(-spread, spread * 0.6, L - along);
float wall = smoothstep(-0.35, 0.1, s);
float w = wall * exp(-max(s, 0.0) / ${FRONT_DECAY_M.toFixed(2)}) * wA;
float depth = floor(b.a * 8.0 + 1e-3) / 8.0;
float soffit = max(b.a - depth, 0.0) / 0.12 * 0.5;
float wc = depth > 0.0 ? wall * (1.0 - smoothstep(depth - 0.2, depth + 0.6, s)) * wA : 0.0;
float yk = max(dot(b.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
E += b.rgb * w + b.rgb / yk * (wc * soffit * ${FRONT_KC.toFixed(2)});
}
return E;
}
`;
