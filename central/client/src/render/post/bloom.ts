/**
 * 半分辨率 bloom（dual filter，CoD:AW 式）：
 *   预滤（阈值 1.0 线性亮度、软膝 0.5，全分辨率 → 1/2）→ 4 级 13 点降采样（1/4 … 1/32）
 *   → 3 级 3×3 帐篷升采样逐级叠加回 1/4。最后一级（1/4 → 1/2 → 全分辨率）在输出 pass 里做，省一个半分辨率目标。
 * alpha 通道另带「不过阈值的亮度」（上限 VEIL_CLAMP）：同一条降 / 升采样链顺带把它模糊成大半径的局部平均，
 * 输出 pass 用它给亮楼群加一层薄薄的雾中散射光幕（照片 01：亮着的楼群包在一层泛光的雾里），不加 pass、不加目标。
 * 共 8 个 draw call；全部目标 RGBA16F、无深度，登记到贴图内存账本。
 */
import { HalfFloatType, LinearFilter, ShaderMaterial, Vector2, WebGLRenderTarget, type Texture, type WebGLRenderer } from 'three';
import { BLOOM_THRESHOLD, registerTextureBytes } from '../materials/lighting';
import { FULLSCREEN_VERT, FullScreenPass } from './fullscreen';

/** 降采样级数（含预滤那一级）：1/2、1/4、1/8、1/16、1/32。 */
export const BLOOM_LEVELS = 5;
const KNEE = 0.5;
/** 光幕亮度的上限（线性 Y）：灯芯不至于在光幕里占大头（它们已经有 bloom）。 */
export const VEIL_CLAMP = 1.5;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;     // 源纹理一个像素（uv）
uniform float uThreshold;
uniform float uKnee;
uniform float uVeilClamp;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// 软阈值：亮度低于阈值 − 膝宽的完全不进 bloom，膝内二次过渡
vec3 thresh(vec3 c) {
  float br = lum(c);
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  rq = rq * rq / (4.0 * uKnee + 1e-4);
  float w = max(rq, br - uThreshold) / max(br, 1e-4);
  return c * w;
}
// Karis 加权：按亮度倒数加权平均，压住单像素「萤火虫」闪烁
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) {
  float wa = 1.0 / (1.0 + lum(a));
  float wb = 1.0 / (1.0 + lum(b));
  float wc = 1.0 / (1.0 + lum(c));
  float wd = 1.0 / (1.0 + lum(d));
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + t * vec2(1.0, -1.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(1.0, 1.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 col = mix(karis(thresh(a), thresh(b), thresh(c), thresh(d)), thresh(e), 0.25);
  // alpha：不过阈值的亮度（光幕），四点平均后封顶
  float veil = min(0.25 * (lum(a) + lum(b) + lum(c) + lum(d)), uVeilClamp);
  gl_FragColor = vec4(min(col, vec3(256.0)), veil);
}
`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
vec4 s(vec2 o) { return texture2D(tSrc, vUv + uTexel * o); }
void main() {
  // 13 点：中心 2×2 块权重 0.5，四角四块各 0.125（alpha 的光幕一起降采样）
  vec4 a = s(vec2(-2.0, -2.0)), b = s(vec2(0.0, -2.0)), c = s(vec2(2.0, -2.0));
  vec4 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
  vec4 g = s(vec2(-2.0, 2.0)), h = s(vec2(0.0, 2.0)), i = s(vec2(2.0, 2.0));
  vec4 j = s(vec2(-1.0, -1.0)), k = s(vec2(1.0, -1.0)), l = s(vec2(-1.0, 1.0)), m = s(vec2(1.0, 1.0));
  gl_FragColor = (j + k + l + m) * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + e * 0.125;
}
`;

/** 3×3 帐篷滤波升采样（GLSL 片段，输出 pass 也用；alpha 为光幕）。 */
export const GLSL_TENT = /* glsl */ `
vec4 tent(sampler2D tex, vec2 uv, vec2 t) {
  vec4 c = texture2D(tex, uv) * 4.0;
  c += (texture2D(tex, uv + vec2(-t.x, 0.0)) + texture2D(tex, uv + vec2(t.x, 0.0))
      + texture2D(tex, uv + vec2(0.0, -t.y)) + texture2D(tex, uv + vec2(0.0, t.y))) * 2.0;
  c += texture2D(tex, uv + vec2(-t.x, -t.y)) + texture2D(tex, uv + vec2(t.x, -t.y))
     + texture2D(tex, uv + vec2(-t.x, t.y)) + texture2D(tex, uv + vec2(t.x, t.y));
  return c / 16.0;
}
`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tLow;   // 上一级（更小）的升采样结果
uniform sampler2D tCur;   // 本级降采样结果
uniform vec2 uTexel;      // tLow 一个像素
varying vec2 vUv;
${GLSL_TENT}
void main() {
  gl_FragColor = texture2D(tCur, vUv) + tent(tLow, vUv, uTexel);
}
`;

function target(name: string): WebGLRenderTarget {
  const t = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  t.texture.name = name;
  return t;
}

export class Bloom {
  /** down[0] = 1/2（预滤结果）… down[4] = 1/32。 */
  readonly down: WebGLRenderTarget[] = [];
  /** up[k]：第 k 级（k = 1…3）叠加了更小各级的结果；up[0] 不用。 */
  readonly up: WebGLRenderTarget[] = [];
  private readonly prefilter: FullScreenPass;
  private readonly downPass: FullScreenPass;
  private readonly upPass: FullScreenPass;

  constructor() {
    for (let i = 0; i < BLOOM_LEVELS; i++) this.down.push(target(`bloom-down-${i}`));
    for (let i = 0; i < BLOOM_LEVELS - 1; i++) this.up.push(target(`bloom-up-${i}`));
    const mat = (frag: string, uniforms: Record<string, { value: unknown }>) =>
      new ShaderMaterial({ uniforms, vertexShader: FULLSCREEN_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.prefilter = new FullScreenPass(
      mat(PREFILTER_FRAG, {
        tSrc: { value: null },
        uTexel: { value: new Vector2() },
        uThreshold: { value: BLOOM_THRESHOLD },
        uKnee: { value: KNEE },
        uVeilClamp: { value: VEIL_CLAMP },
      }),
    );
    this.downPass = new FullScreenPass(mat(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new Vector2() } }));
    this.upPass = new FullScreenPass(mat(UP_FRAG, { tLow: { value: null }, tCur: { value: null }, uTexel: { value: new Vector2() } }));
  }

  /** w, h：全分辨率 drawing buffer 像素。 */
  setSize(w: number, h: number): void {
    let bytes = 0;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const s = 2 ** (i + 1);
      const tw = Math.max(1, Math.ceil(w / s));
      const th = Math.max(1, Math.ceil(h / s));
      this.down[i]!.setSize(tw, th);
      bytes += tw * th * 8;
      if (i >= 1 && i < BLOOM_LEVELS - 1) {
        this.up[i]!.setSize(tw, th);
        bytes += tw * th * 8;
      }
    }
    registerTextureBytes('atmosphere:bloom', bytes);
  }

  /** 从 HDR 场景纹理生成 bloom 链；返回给输出 pass 用的 (1/2 级, 1/4 级累加) 两张纹理。 */
  render(renderer: WebGLRenderer, scene: Texture, sceneW: number, sceneH: number): { half: Texture; quarter: Texture; quarterTexel: Vector2 } {
    const u = (p: FullScreenPass) => (p.material as ShaderMaterial).uniforms;
    // 预滤：全分辨率 → 1/2；四个采样点各落在 2×2 块中心
    const pu = u(this.prefilter);
    pu.tSrc!.value = scene;
    (pu.uTexel!.value as Vector2).set(1 / sceneW, 1 / sceneH);
    this.prefilter.render(renderer, this.down[0]!);
    // 降采样
    const du = u(this.downPass);
    for (let i = 1; i < BLOOM_LEVELS; i++) {
      const src = this.down[i - 1]!;
      du.tSrc!.value = src.texture;
      (du.uTexel!.value as Vector2).set(1 / src.width, 1 / src.height);
      this.downPass.render(renderer, this.down[i]!);
    }
    // 升采样叠加：1/32 → 1/16 → 1/8 → 1/4
    const uu = u(this.upPass);
    let low = this.down[BLOOM_LEVELS - 1]!;
    for (let i = BLOOM_LEVELS - 2; i >= 1; i--) {
      uu.tLow!.value = low.texture;
      uu.tCur!.value = this.down[i]!.texture;
      (uu.uTexel!.value as Vector2).set(1 / low.width, 1 / low.height);
      this.upPass.render(renderer, this.up[i]!);
      low = this.up[i]!;
    }
    return { half: this.down[0]!.texture, quarter: low.texture, quarterTexel: new Vector2(1 / low.width, 1 / low.height) };
  }

  dispose(): void {
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.prefilter.dispose();
    this.downPass.dispose();
    this.upPass.dispose();
    registerTextureBytes('atmosphere:bloom', 0);
  }
}
