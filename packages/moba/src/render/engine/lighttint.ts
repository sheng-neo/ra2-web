/**
 * 环境染色贴图(art-v2 §4 L6)：一张覆盖整张地图的低分辨率贴图，让发光体与大色块「染」到周围的地面、岩壁与单位身上。
 *
 *   128² RGBA8，覆盖世界 ±64 米(1 米 / texel，世界 xz → uv = xz / 128 + 0.5)。
 *   RGB = 附加的彩色环境光(线性值；着色器里乘 LIGHT_TINT_GAIN 加到辐照度上)，A = 天空光遮蔽(1 = 不遮)。
 *
 * 写入方(地形包，在场景构建时)：
 *   ctx.lightTint.stamp(x, z, radius, color, strength)   盖一个柔边色斑。strength 是色斑中心的峰值，同色斑重叠取最大值不累加
 *                                                        (沿河道每隔几米盖一个，得到的是一条等强度的色带)。
 *   ctx.lightTint.occlude(x, z, radius, amount)          盖一个天空光遮蔽斑(树冠下、高崖背光侧)。amount 0..1，同样取最大值。
 *   ctx.lightTint.bake()                                 两次高斯模糊后上传。之后再 stamp / occlude 需要重新 bake。
 *
 * 读取方(所有受光着色器)：拼入 materials.ts 的 GLSL_LIGHT_TINT，调用 `vec4 lt = kitLightTint(worldXZ)`，然后
 *   irradiance = kitAmbient(N) * lt.a + lt.rgb * KIT_LIGHT_TINT_GAIN      (或直接 kitTintAmbient(kitAmbient(N), lt))
 * uniform `tLightTint` 由 litUniforms() 自动带上(指向 SHARED.tLightTint)，不用自己声明绑定。
 *
 * 贴图只在主引擎绘制期间挂到 SHARED.tLightTint 上(见 RenderEngine.render)：选人界面的立绘、头像这些独立小场景
 * 采到的是 1×1 的中性贴图，不会被对局地图的染色影响。
 */
import * as THREE from 'three';
import { LIGHT_TINT_EXTENT, SHARED, setSharedLightTint } from '../materials';

/** 贴图边长(texel)。1 米一个 texel */
export const LIGHT_TINT_SIZE = 128;
export { LIGHT_TINT_EXTENT, GLSL_LIGHT_TINT, LIGHT_TINT_GAIN } from '../materials';

const _c = new THREE.Color();

/** 3×3 的 1-2-1 可分离模糊(一次)，边界钳制。src → dst，tmp 为同尺寸的暂存 */
function blur121(src: Float32Array, dst: Float32Array, tmp: Float32Array, size: number, stride: number): void {
  const last = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = x > 0 ? x - 1 : 0;
      const xr = x < last ? x + 1 : last;
      for (let k = 0; k < stride; k++) {
        tmp[(y * size + x) * stride + k] = (src[(y * size + xl) * stride + k] + src[(y * size + x) * stride + k] * 2 + src[(y * size + xr) * stride + k]) * 0.25;
      }
    }
  }
  for (let y = 0; y < size; y++) {
    const yu = y > 0 ? y - 1 : 0;
    const yd = y < last ? y + 1 : last;
    for (let x = 0; x < size; x++) {
      for (let k = 0; k < stride; k++) {
        dst[(y * size + x) * stride + k] = (tmp[(yu * size + x) * stride + k] + tmp[(y * size + x) * stride + k] * 2 + tmp[(yd * size + x) * stride + k]) * 0.25;
      }
    }
  }
}

export class LightTint {
  readonly texture: THREE.DataTexture;
  readonly size = LIGHT_TINT_SIZE;
  /** 累积的彩色环境光(线性 RGB，未模糊) */
  private rgb: Float32Array;
  /** 累积的天空光遮蔽量 0..1(未模糊) */
  private occ: Float32Array;
  /** 最近一次 bake 的结果(模糊后)，供 CPU 端 sample() 读取 */
  private bakedRgb: Float32Array;
  private bakedOcc: Float32Array;
  private bytes: Uint8Array;
  private stamps = 0;

  constructor() {
    const n = LIGHT_TINT_SIZE * LIGHT_TINT_SIZE;
    this.rgb = new Float32Array(n * 3);
    this.occ = new Float32Array(n);
    this.bakedRgb = new Float32Array(n * 3);
    this.bakedOcc = new Float32Array(n);
    this.bytes = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) this.bytes[i * 4 + 3] = 255;
    const tex = new THREE.DataTexture(this.bytes, LIGHT_TINT_SIZE, LIGHT_TINT_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.name = 'moba.lightTint';
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.texture = tex;
  }

  /** 已盖印的次数(调试/报告用) */
  get count(): number {
    return this.stamps;
  }

  /** 遍历以 (x, z) 为中心、半径 radius 的圆覆盖到的 texel；w = 柔边权重 (1 - (d/r)²)² */
  private splat(x: number, z: number, radius: number, fn: (index: number, w: number) => void): void {
    const size = LIGHT_TINT_SIZE;
    const scale = size / (LIGHT_TINT_EXTENT * 2);
    const r = Math.max(0.75, radius);
    // texel 中心在 (i + 0.5) / scale - EXTENT
    const cx = (x + LIGHT_TINT_EXTENT) * scale - 0.5;
    const cz = (z + LIGHT_TINT_EXTENT) * scale - 0.5;
    const rt = r * scale;
    const x0 = Math.max(0, Math.floor(cx - rt));
    const x1 = Math.min(size - 1, Math.ceil(cx + rt));
    const z0 = Math.max(0, Math.floor(cz - rt));
    const z1 = Math.min(size - 1, Math.ceil(cz + rt));
    const inv = 1 / (rt * rt);
    for (let j = z0; j <= z1; j++) {
      for (let i = x0; i <= x1; i++) {
        const d2 = ((i - cx) * (i - cx) + (j - cz) * (j - cz)) * inv;
        if (d2 >= 1) continue;
        const w = (1 - d2) * (1 - d2);
        fn(j * size + i, w);
      }
    }
  }

  /**
   * 盖一个彩色环境光斑。color 按 sRGB 十六进制/THREE.Color 给(内部转线性)，strength 为中心处写入贴图的峰值(0..1)：
   * 着色器里附加辐照度 = 颜色 × strength × LIGHT_TINT_GAIN(1.6)。参考量级：主光约 3、天光约 1。
   * 基地 0.18、塔 0.2、营地 0.25、灯与水晶 0.3、泉水 0.35、河道 0.12、草丛内 0.1。
   */
  stamp(x: number, z: number, radius: number, color: THREE.ColorRepresentation, strength: number): void {
    _c.set(color);
    const cr = _c.r * strength;
    const cg = _c.g * strength;
    const cb = _c.b * strength;
    const rgb = this.rgb;
    this.splat(x, z, radius, (o, w) => {
      const k = o * 3;
      if (cr * w > rgb[k]) rgb[k] = cr * w;
      if (cg * w > rgb[k + 1]) rgb[k + 1] = cg * w;
      if (cb * w > rgb[k + 2]) rgb[k + 2] = cb * w;
    });
    this.stamps++;
  }

  /** 盖一个天空光遮蔽斑：中心处环境光乘 (1 - amount)。树冠下 / 高崖背光侧取 0.25 左右 */
  occlude(x: number, z: number, radius: number, amount: number): void {
    const a = Math.min(1, Math.max(0, amount));
    const occ = this.occ;
    this.splat(x, z, radius, (o, w) => {
      if (a * w > occ[o]) occ[o] = a * w;
    });
    this.stamps++;
  }

  /** 清空(换地图/重建场景时) */
  clear(): void {
    this.rgb.fill(0);
    this.occ.fill(0);
    this.stamps = 0;
    this.bake();
  }

  /** 两次高斯模糊后量化上传。最外一圈 texel 强制为中性值：图外(钳制采样)不带任何染色 */
  bake(): void {
    const size = LIGHT_TINT_SIZE;
    const n = size * size;
    const tmp = new Float32Array(n * 3);
    blur121(this.rgb, this.bakedRgb, tmp, size, 3);
    blur121(this.bakedRgb, this.bakedRgb, tmp, size, 3);
    blur121(this.occ, this.bakedOcc, tmp, size, 1);
    blur121(this.bakedOcc, this.bakedOcc, tmp, size, 1);
    const out = this.bytes;
    const last = size - 1;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const o = j * size + i;
        if (i === 0 || j === 0 || i === last || j === last) {
          this.bakedRgb[o * 3] = this.bakedRgb[o * 3 + 1] = this.bakedRgb[o * 3 + 2] = 0;
          this.bakedOcc[o] = 0;
        }
        out[o * 4] = Math.min(255, Math.round(this.bakedRgb[o * 3] * 255));
        out[o * 4 + 1] = Math.min(255, Math.round(this.bakedRgb[o * 3 + 1] * 255));
        out[o * 4 + 2] = Math.min(255, Math.round(this.bakedRgb[o * 3 + 2] * 255));
        out[o * 4 + 3] = Math.min(255, Math.round((1 - this.bakedOcc[o]) * 255));
      }
    }
    this.texture.needsUpdate = true;
  }

  /**
   * CPU 端读取烘焙结果(最近邻)：把 (x, z) 处的附加环境光颜色(线性，未乘增益)写入 out，返回天空光可见度(1 = 不遮)。
   * 给「合并前按顶点预染色」之类的离线用途；每帧热路径请在着色器里采样。
   */
  sample(x: number, z: number, out?: THREE.Color): number {
    const size = LIGHT_TINT_SIZE;
    const scale = size / (LIGHT_TINT_EXTENT * 2);
    const i = Math.min(size - 1, Math.max(0, Math.floor((x + LIGHT_TINT_EXTENT) * scale)));
    const j = Math.min(size - 1, Math.max(0, Math.floor((z + LIGHT_TINT_EXTENT) * scale)));
    const o = j * size + i;
    if (out) out.setRGB(this.bakedRgb[o * 3], this.bakedRgb[o * 3 + 1], this.bakedRgb[o * 3 + 2]);
    return 1 - this.bakedOcc[o];
  }

  /** 把本贴图挂到 / 摘下共享 uniform(引擎在每次绘制前后调用) */
  bind(on: boolean): void {
    setSharedLightTint(on ? this.texture : null);
  }

  dispose(): void {
    if (SHARED.tLightTint.value === this.texture) setSharedLightTint(null);
    this.texture.dispose();
  }
}
