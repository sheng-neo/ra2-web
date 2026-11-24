/**
 * 海面图层（ATMOSPHERE A5）：新水面网格画在旧 0 mPD 平面之上（polygonOffset −1/−1，旧平面 +2/+2），
 * 旧平面只剩「陆地底色」的作用；对岸以北由远景的九龙地台盖住。
 * - HIGH：每帧（水面在视野内时）渲染平面反射到 ≤ 半分辨率目标；
 * - LOW / 降档：方位角发光条，相机移动 > 50 m 或转向 > 5° 时重算。
 * 一个 draw call（反射 pass 另计，≤ 20 call）。
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  Vector3,
  type Matrix4,
  type PerspectiveCamera,
  type Scene,
  type ShaderMaterial,
  type Vector4,
  type WebGLRenderer,
} from 'three';
import type { CityFile } from '@central/data';
import { simMetresToThree } from '../../coords';
import { LIGHT_HEX, lightColour, registerTextureBytes, type Quality } from '../materials/lighting';
import { buildWaterField, encodeSdf, isWaterAt } from './mask';
import { createWaterMaterial, MAX_WAKES } from './material';
import { PlanarReflection } from './reflection';
import { STRIP_BINS, splatStrip, type Emitter } from './strip';

export { REFLECT_LAYER } from './reflection';

/** 水面网格范围（模拟米）：足够大，远端没入雾里。 */
const EXTENT = { x0: -9500, x1: 10500, y0: -3000, y1: 9500 } as const;

export interface WakeSource {
  /** 模拟米与航向（弧度，东 = 0，逆时针）。 */
  x: number;
  y: number;
  heading: number;
  strength: number;
}

function maskTexture(data: Uint8Array, w: number, h: number, key: string): DataTexture {
  const t = new DataTexture(data, w, h, RedFormat, UnsignedByteType);
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  registerTextureBytes(`atmosphere:${key}`, w * h);
  return t;
}

/** 城市楼宇 → 倒影发光条的光源（楼面平均亮度 + 底部铺面带 + 地标冠顶）。 */
export function cityEmitters(city: CityFile): Emitter[] {
  const out: Emitter[] = [];
  const office = lightColour(LIGHT_HEX.officeNeutral);
  const shop = lightColour(LIGHT_HEX.shopWarm);
  const crown = lightColour(LIGHT_HEX.crownWhite);
  for (const b of city.buildings) {
    const r = b.footprint.outer;
    let cx = 0;
    let cy = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const x = r[i * 2]! * 0.1;
      const y = r[i * 2 + 1]! * 0.1;
      cx += x;
      cy += y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    cx /= n;
    cy /= n;
    const base = b.base * 0.1;
    const top = base + b.height * 0.1;
    const halfWidth = 0.5 * Math.max(maxX - minX, maxY - minY);
    // 复审后整体压低：每栋楼都给一条宽光源，发光条在所有方位都亮，LOW 档水面成了一整片褐色的「泥水」；
    // 照片里水面是黑底上一条条光柱——光柱只来自真正亮的东西（灯箱、冠顶、灯），楼面与铺面只给很淡的底
    if (b.height > 300) {
      out.push({ x: cx, y: cy, z0: base + 8, z1: top, halfWidth, r: office.r * 0.05, g: office.g * 0.05, b: office.b * 0.05 });
    }
    // 底部铺面 / 平台：暖光带
    out.push({ x: cx, y: cy, z0: base, z1: base + Math.min(8, b.height * 0.1), halfWidth, r: shop.r * 0.12, g: shop.g * 0.12, b: shop.b * 0.12 });
  }
  for (const l of city.landmarks) {
    const base = l.base * 0.1;
    const top = base + l.height * 0.1;
    out.push({ x: l.x * 0.1, y: l.y * 0.1, z0: top - 0.12 * (top - base), z1: top, halfWidth: 14, r: crown.r * 1.2, g: crown.g * 1.2, b: crown.b * 1.2 });
    out.push({ x: l.x * 0.1, y: l.y * 0.1, z0: base + 8, z1: top, halfWidth: 18, r: office.r * 0.14, g: office.g * 0.14, b: office.b * 0.14 });
  }
  return out;
}

export class WaterLayer {
  readonly mesh: Mesh;
  reflection: PlanarReflection | null;
  private readonly material: ShaderMaterial;
  private readonly strip: DataTexture;
  private readonly stripF = new Float32Array(STRIP_BINS * 4);
  private readonly stripH: Uint16Array;
  private readonly emitters: Emitter[];
  private readonly field: ReturnType<typeof buildWaterField>;
  private readonly lastPos = new Vector3(Infinity, 0, 0);
  private readonly lastDir = new Vector3();
  private readonly tmpDir = new Vector3();
  /** 水面可见性检测用的粗采样点（three 坐标 x, z）。 */
  private readonly samples: Float32Array;
  private visible = true;
  /** 遮挡查询：上一帧主场景里水面有没有任何片元通过深度测试（被楼完全挡住就不画反射）。 */
  private gl: WebGL2RenderingContext | null = null;
  private query: WebGLQuery | null = null;
  private queryOpen = false;
  private seen = true;
  /** 上一帧反射 pass 的 draw call 与三角形数（stats 用）。 */
  reflCalls = 0;
  reflTriangles = 0;
  private readonly visPos = new Vector3(Infinity, 0, 0);
  private readonly visDir = new Vector3();

  constructor(city: CityFile, quality: Quality, extraEmitters: readonly Emitter[] = []) {
    const field = buildWaterField(city.water, city.meta.bbox);
    this.field = field;
    const f = field.fine;
    const c = field.coarse;
    const fine = new Uint8Array(f.data.length);
    for (let k = 0; k < fine.length; k++) fine[k] = f.data[k]! * 255;
    const mask = maskTexture(fine, f.w, f.h, 'water-mask');
    const sdf = maskTexture(encodeSdf(c.sdf), c.w, c.h, 'water-sdf');

    this.stripH = new Uint16Array(STRIP_BINS * 4);
    this.strip = new DataTexture(this.stripH, STRIP_BINS, 1, RGBAFormat, HalfFloatType);
    this.strip.wrapS = RepeatWrapping;
    this.strip.wrapT = ClampToEdgeWrapping;
    this.strip.magFilter = LinearFilter;
    this.strip.minFilter = LinearFilter;
    this.strip.generateMipmaps = false;
    this.strip.needsUpdate = true;
    registerTextureBytes('atmosphere:water-strip', STRIP_BINS * 8);
    this.emitters = [...cityEmitters(city), ...extraEmitters];

    this.reflection = quality.reflection ? new PlanarReflection() : null;
    this.material = createWaterMaterial({
      mask,
      maskRect: [f.x0, f.y0, f.w * f.cx, f.h * f.cy],
      sdf,
      sdfRect: [c.x0, c.y0, c.w * c.cell, c.h * c.cell],
      strip: this.strip,
      reflection: this.reflection?.target.texture ?? null,
    });
    const g = new PlaneGeometry(EXTENT.x1 - EXTENT.x0, EXTENT.y1 - EXTENT.y0);
    g.rotateX(-Math.PI / 2);
    const [tx, , tz] = simMetresToThree((EXTENT.x0 + EXTENT.x1) / 2, (EXTENT.y0 + EXTENT.y1) / 2, 0);
    g.translate(tx, 0, tz);
    this.mesh = new Mesh(g, this.material);
    this.mesh.name = 'water';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    // 在城市不透明物之后画：被楼挡住的水面片元靠 early-z 直接剔掉
    this.mesh.renderOrder = 5;
    this.mesh.onBeforeRender = (renderer) => this.beginQuery(renderer);
    this.mesh.onAfterRender = () => this.endQuery();

    // 可见性采样点：粗网格上每 100 m 取一个水点
    const pts: number[] = [];
    const step = Math.max(1, Math.round(100 / c.cell));
    for (let j = 0; j < c.h; j += step) {
      for (let i = 0; i < c.w; i += step) {
        if (c.water[j * c.w + i] !== 1) continue;
        const [x, , z] = simMetresToThree(c.x0 + (i + 0.5) * c.cell, c.y0 + (j + 0.5) * c.cell, 0);
        pts.push(x, z);
      }
    }
    this.samples = new Float32Array(pts);
  }

  /** 调试摘要：倒影代理个数、远景三角形数。 */
  summary(): string {
    let backdrop = 0;
    this.mesh.parent?.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && o.name.startsWith('backdrop') && m.geometry.index) backdrop += m.geometry.index.count / 3;
    });
    return `倒影代理 ${this.reflection?.proxies.children.length ?? 0} · 遠景 ${(backdrop / 1000).toFixed(1)}k△`;
  }

  /** 模拟米坐标处是否为水面（细遮罩 + 九龙岸线；与着色器同一规则）。 */
  isWater(x: number, y: number): boolean {
    return isWaterAt(this.field.fine, x, y);
  }

  /** 追加倒影发光条的光源（远景楼宇等）。 */
  addEmitters(list: readonly Emitter[]): void {
    for (const e of list) this.emitters.push(e);
    this.lastPos.set(Infinity, 0, 0);
  }

  /** 反射是否开着（HIGH 且未降档）。 */
  get reflectionOn(): boolean {
    return this.reflection !== null && (this.material.uniforms.uReflMode!.value as number) > 0.5;
  }

  /** A11 降档：关掉平面反射，改用发光条。 */
  disableReflection(): void {
    this.material.uniforms.uReflMode!.value = 0;
    this.material.uniforms.uRefl!.value = null;
    this.lastPos.set(Infinity, 0, 0);
    // 降档后不再回升：释放反射目标（显存账本同步清零）
    this.reflection?.dispose();
    this.reflection = null;
  }

  setSize(w: number, h: number): void {
    this.reflection?.setSize(w, h);
    if (this.reflection) (this.material.uniforms.uReflTexel!.value as Vector2).set(1 / this.reflection.target.width, 1 / this.reflection.target.height);
  }

  /** 建场景完成后调用：收集反射代理。 */
  collect(scene: Scene): void {
    this.reflection?.collect(scene);
  }

  setWakes(list: readonly WakeSource[]): void {
    const arr = this.material.uniforms.uWakes!.value as Vector4[];
    for (let i = 0; i < MAX_WAKES; i++) {
      const w = list[i];
      if (!w) {
        arr[i]!.set(0, 0, 0, 0);
        continue;
      }
      const [x, , z] = simMetresToThree(w.x, w.y, 0);
      arr[i]!.set(x, z, w.heading, w.strength);
    }
  }

  private beginQuery(renderer: WebGLRenderer): void {
    if (this.query || !this.reflection) return;
    const gl = renderer.getContext();
    if (!(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) return;
    this.gl = gl;
    this.query = gl.createQuery();
    if (!this.query) return;
    gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, this.query);
    this.queryOpen = true;
  }

  private endQuery(): void {
    if (!this.queryOpen || !this.gl) return;
    this.gl.endQuery(this.gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
    this.queryOpen = false;
  }

  /** 取回已完成的遮挡查询结果（异步，通常晚 1–2 帧）。 */
  private pollQuery(): void {
    const gl = this.gl;
    if (!gl || !this.query || this.queryOpen) return;
    // 上下文丢失 / 恢复后旧查询对象作废：丢掉，当作「看得见」重新开始
    if (gl.isContextLost() || !gl.isQuery(this.query)) {
      this.query = null;
      this.seen = true;
      return;
    }
    if (!gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) return;
    this.seen = (gl.getQueryParameter(this.query, gl.QUERY_RESULT) as number) > 0;
    gl.deleteQuery(this.query);
    this.query = null;
  }

  /** 粗略判断水面是否在视野里（水平视角 ± 12° 内、9 km 内有水点）。 */
  private waterInView(camera: PerspectiveCamera, pos: Vector3, dir: Vector3): boolean {
    if (pos.distanceTo(this.visPos) < 5 && dir.dot(this.visDir) > Math.cos((2 * Math.PI) / 180)) return this.visible;
    this.visPos.copy(pos);
    this.visDir.copy(dir);
    const hlen = Math.hypot(dir.x, dir.z);
    if (hlen < 0.05) return (this.visible = true); // 几乎垂直向下：看得到就算
    const fx = dir.x / hlen;
    const fz = dir.z / hlen;
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect) + (12 * Math.PI) / 180;
    const cosH = Math.cos(Math.min(hHalf, Math.PI));
    const s = this.samples;
    for (let i = 0; i < s.length; i += 2) {
      const dx = s[i]! - pos.x;
      const dz = s[i + 1]! - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 9000) continue;
      if (d < 150 || (dx * fx + dz * fz) / d > cosH) return (this.visible = true);
    }
    return (this.visible = false);
  }

  /** 每帧：渲染平面反射（或按需重算发光条）。须在主场景渲染之前调用。 */
  update(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    camera.getWorldDirection(this.tmpDir);
    const pos = camera.position;
    if (this.reflectionOn && this.reflection) {
      this.reflCalls = 0;
      this.reflTriangles = 0;
      this.pollQuery();
      if (this.seen && this.waterInView(camera, pos, this.tmpDir)) {
        const c0 = renderer.info.render.calls;
        const t0 = renderer.info.render.triangles;
        this.reflection.render(renderer, scene, camera);
        this.reflCalls = renderer.info.render.calls - c0;
        this.reflTriangles = renderer.info.render.triangles - t0;
        (this.material.uniforms.uReflViewProj!.value as Matrix4).copy(this.reflection.viewProj);
      }
      return;
    }
    if (pos.distanceTo(this.lastPos) < 50 && this.tmpDir.dot(this.lastDir) > Math.cos((5 * Math.PI) / 180)) return;
    this.lastPos.copy(pos);
    this.lastDir.copy(this.tmpDir);
    splatStrip(this.stripF, this.emitters, pos.x, -pos.z, pos.y);
    for (let k = 0; k < this.stripF.length; k++) this.stripH[k] = DataUtils.toHalfFloat(Math.min(this.stripF[k]!, 60000));
    this.strip.needsUpdate = true;
  }
}
