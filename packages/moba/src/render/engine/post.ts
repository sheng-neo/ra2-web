/**
 * 后期管线(EffectComposer)：场景 → HDR(半浮点 + MSAA) → bloom(只取高亮/自发光) → 色调映射 + 调色 + 远景薄霾 + 暗角 → 屏幕。
 * bloom 用降采样/升采样金字塔(dual filter)，比逐级高斯省一半以上的全屏绘制，适合手机；升采样时越粗的层权重越低，
 * 光晕收在发光体周围(通透)，不会糊成一大片雾。
 * 色调映射用 materials.ts 装好的统一曲线(Khronos Neutral 的高光段、暗部线性)：中间调不偏色、不压饱和，只在高光处收拢——
 * 石板、白石与青白色特效不再被压成白色。
 * 全屏通道数固定(场景 + bloom 金字塔 + 合成)，不要再往里加全屏 Pass；调色参数在 `post.grade` 上直接改。
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { QualitySettings } from './quality';

const FS_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** 亮度阈值提取 + 2×降采样 */
const PREFILTER_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform vec2 uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture2D(tDiffuse, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb
         + texture2D(tDiffuse, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  // 钳位：个别极亮的像素(高光/特效核心)不至于在降采样后炸成一大团
  c = min(c, vec3(12.0));
  float br = max(c.r, max(c.g, c.b));
  // 软拐点：阈值附近平滑过渡，避免高亮边缘闪烁
  float knee = uThreshold.y;
  float soft = clamp(br - uThreshold.x + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - uThreshold.x) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

const DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 4.0;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c * 0.125, 1.0);
}
`;

/** 帐篷滤波升采样，并与同级降采样结果按权重相加(uWeight.x = 上一级的权重，uWeight.y = 本级的权重) */
const UP_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBase;
uniform vec2 uTexel;
uniform float uSpread;
uniform vec2 uWeight;
varying vec2 vUv;
void main() {
  vec2 d = uTexel * uSpread;
  vec3 c = texture2D(tDiffuse, vUv + vec2(-d.x * 2.0, 0.0)).rgb;
  c += texture2D(tDiffuse, vUv + vec2(d.x * 2.0, 0.0)).rgb;
  c += texture2D(tDiffuse, vUv + vec2(0.0, -d.y * 2.0)).rgb;
  c += texture2D(tDiffuse, vUv + vec2(0.0, d.y * 2.0)).rgb;
  c += texture2D(tDiffuse, vUv + vec2(-d.x, d.y)).rgb * 2.0;
  c += texture2D(tDiffuse, vUv + vec2(d.x, d.y)).rgb * 2.0;
  c += texture2D(tDiffuse, vUv + vec2(-d.x, -d.y)).rgb * 2.0;
  c += texture2D(tDiffuse, vUv + vec2(d.x, -d.y)).rgb * 2.0;
  gl_FragColor = vec4(c * (uWeight.x / 12.0) + texture2D(tBase, vUv).rgb * uWeight.y, 1.0);
}
`;

const MAX_LEVELS = 6;
/** 各级(由细到粗)在合成里的权重：细的层贴着发光体，粗的层只留一点点氛围 */
const LEVEL_WEIGHTS = [1.0, 0.85, 0.6, 0.4, 0.25, 0.15];

/** 计算 bloom 贴图(不改动读缓冲)，结果在 `texture` 上，由 FinalPass 合成 */
export class BloomPyramidPass extends Pass {
  /** x = 阈值(线性 HDR 亮度)，y = 软拐点宽度。受光的白石/石板不得越过阈值；发光件的 HDR 亮度定在 1.6~3.0 */
  readonly threshold = new THREE.Vector2(1.35, 0.25);
  levels = 5;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private quad = new FullScreenQuad();
  private prefilter: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private black: THREE.DataTexture;

  constructor() {
    super();
    this.needsSwap = false;
    const mk = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({ vertexShader: FS_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.prefilter = mk(PREFILTER_FRAGMENT, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: this.threshold } });
    this.downMat = mk(DOWN_FRAGMENT, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mk(UP_FRAGMENT, { tDiffuse: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 1 }, uWeight: { value: new THREE.Vector2(1, 1) } });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    for (let i = 0; i < MAX_LEVELS; i++) {
      this.down.push(this.makeTarget());
      this.up.push(this.makeTarget());
    }
  }

  private makeTarget(): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    rt.texture.generateMipmaps = false;
    return rt;
  }

  /** bloom 结果(半分辨率)。未启用时为 1×1 黑图 */
  get texture(): THREE.Texture {
    return this.enabled ? this.up[0].texture : this.black;
  }

  override setSize(width: number, height: number): void {
    let w = Math.max(2, Math.round(width / 2));
    let h = Math.max(2, Math.round(height / 2));
    for (let i = 0; i < MAX_LEVELS; i++) {
      this.down[i].setSize(w, h);
      this.up[i].setSize(w, h);
      w = Math.max(2, Math.round(w / 2));
      h = Math.max(2, Math.round(h / 2));
    }
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const n = Math.min(MAX_LEVELS, Math.max(2, this.levels));
    const quad = this.quad;
    // 提取高亮 → 第 0 级
    quad.material = this.prefilter;
    this.prefilter.uniforms.tDiffuse.value = read.texture;
    (this.prefilter.uniforms.uTexel.value as THREE.Vector2).set(0.5 / read.width, 0.5 / read.height);
    renderer.setRenderTarget(this.down[0]);
    quad.render(renderer);
    // 逐级降采样
    quad.material = this.downMat;
    for (let i = 1; i < n; i++) {
      const src = this.down[i - 1];
      this.downMat.uniforms.tDiffuse.value = src.texture;
      (this.downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
      renderer.setRenderTarget(this.down[i]);
      quad.render(renderer);
    }
    // 逐级升采样并累加
    quad.material = this.upMat;
    let prev = this.down[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      this.upMat.uniforms.tDiffuse.value = prev.texture;
      this.upMat.uniforms.tBase.value = this.down[i].texture;
      (this.upMat.uniforms.uTexel.value as THREE.Vector2).set(0.5 / prev.width, 0.5 / prev.height);
      // 最粗的一级第一次被读到时乘上它自己的权重；之后的累加结果已含权重，原样带上去
      (this.upMat.uniforms.uWeight.value as THREE.Vector2).set(i === n - 2 ? LEVEL_WEIGHTS[n - 1] : 1, LEVEL_WEIGHTS[i]);
      renderer.setRenderTarget(this.up[i]);
      quad.render(renderer);
      prev = this.up[i];
    }
    renderer.setRenderTarget(null);
  }

  override dispose(): void {
    for (const rt of this.down) rt.dispose();
    for (const rt of this.up) rt.dispose();
    this.prefilter.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.black.dispose();
    this.quad.dispose();
  }
}

/** 调色参数(运行时可改) */
export interface GradeParams {
  /** 曝光倍率(色调映射前) */
  exposure: number;
  bloomStrength: number;
  /** 整体饱和度倍率 */
  saturation: number;
  /** 自然饱和：只给本来不太艳的颜色加饱和(已经很艳的不再加)，0 = 关 */
  vibrance: number;
  /**
   * 对比度与支点。幂函数式对比：c = p · (c / p)^contrast，纯黑保持纯黑、支点 p 处亮度不变——
   * 不会像「(c - 0.5)·k + 0.5」那样把暗部整体减掉一截(阴影里的细节会被压成死黑)。
   * pivot 按显示值(sRGB 编码后的 0..1)给，0.42 约等于受光草地的亮度。
   */
  contrast: number;
  pivot: number;
  /** 暗角强度 0..1 */
  vignette: number;
  /** 暗部/亮部分离调色(线性 RGB 偏移，围绕 0) */
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  /** 远景薄霾：屏幕上沿(远处)向 hazeColor 混合的最大比例，0 = 关 */
  haze: number;
  hazeColor: THREE.Color;
  /** 去色 0..1(阵亡灰屏)。low 档没有后期，界面层可改用 CSS filter */
  desaturate: number;
  /** 画面整体压暗 0..1(暂停/过场) */
  dim: number;
}

const FINAL_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uSaturation;
uniform float uVibrance;
uniform vec2 uContrast;
uniform float uVignette;
uniform float uAspect;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uHaze;
uniform vec3 uHazeColor;
uniform float uDesaturate;
uniform float uDim;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c = CustomToneMapping(c);
  #ifdef GRADE
  // 对比：幂函数式，围绕支点(线性值)拉开；纯黑不动，暗部不会被整体减掉一截
  c = uContrast.y * pow(max(c, 0.0) / uContrast.y, vec3(uContrast.x));
  // 饱和 + 自然饱和
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / max(mx, 1e-4);
  c = max(mix(vec3(l), c, uSaturation + uVibrance * (1.0 - sat)), 0.0);
  // 色彩分离：暗部偏青紫、亮部偏暖
  float lc = clamp(l, 0.0, 1.0);
  c += uShadowTint * (1.0 - lc) * (1.0 - lc) + uHighlightTint * lc * lc;
  // 远景薄霾：屏幕上沿就是远处，给一点冷亮的空气感
  float hz = smoothstep(0.55, 1.0, vUv.y);
  c = mix(c, uHazeColor, uHaze * hz * sqrt(hz));
  vec2 q = (vUv - 0.5) * vec2(min(uAspect, 1.8) / 1.8, 1.0);
  float v = smoothstep(0.38, 0.95, length(q));
  c *= 1.0 - uVignette * v * v;
  #endif
  float g = dot(max(c, 0.0), vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(g) * vec3(0.92, 0.97, 1.08), uDesaturate);
  c *= 1.0 - uDim;
  gl_FragColor = sRGBTransferOETF(vec4(clamp(c, 0.0, 1.0), 1.0));
  // 抖动：消除大面积渐变(雾/暗角/云海)的色带
  gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;

/** 合成 bloom + 色调映射 + 调色/薄霾/暗角 + sRGB 输出 */
export class FinalPass extends Pass {
  readonly material: THREE.RawShaderMaterial;
  private quad: FullScreenQuad;
  private bloom: BloomPyramidPass;
  readonly grade: GradeParams;
  private gradeOn = true;

  constructor(bloom: BloomPyramidPass, grade: GradeParams) {
    super();
    this.bloom = bloom;
    this.grade = grade;
    this.material = new THREE.RawShaderMaterial({
      vertexShader: /* glsl */ `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: FINAL_FRAGMENT,
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        toneMappingExposure: { value: 1 },
        uBloom: { value: 0 },
        uSaturation: { value: 1 },
        uVibrance: { value: 0 },
        uContrast: { value: new THREE.Vector2(1, 0.148) },
        uVignette: { value: 0 },
        uAspect: { value: 1 },
        uShadowTint: { value: grade.shadowTint },
        uHighlightTint: { value: grade.highlightTint },
        uHaze: { value: 0 },
        uHazeColor: { value: grade.hazeColor },
        uDesaturate: { value: 0 },
        uDim: { value: 0 },
      },
      defines: { GRADE: '' },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setGradeEnabled(on: boolean): void {
    if (on === this.gradeOn) return;
    this.gradeOn = on;
    if (on) this.material.defines.GRADE = '';
    else delete this.material.defines.GRADE;
    this.material.needsUpdate = true;
  }

  override render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    const g = this.grade;
    u.tDiffuse.value = read.texture;
    u.tBloom.value = this.bloom.texture;
    u.toneMappingExposure.value = g.exposure;
    u.uBloom.value = this.bloom.enabled ? g.bloomStrength : 0;
    u.uSaturation.value = g.saturation;
    u.uVibrance.value = g.vibrance;
    // 支点从显示值换算成线性值
    (u.uContrast.value as THREE.Vector2).set(g.contrast, Math.pow(Math.max(0.02, g.pivot), 2.2));
    u.uVignette.value = g.vignette;
    u.uAspect.value = read.width / Math.max(1, read.height);
    u.uHaze.value = g.haze;
    u.uDesaturate.value = g.desaturate;
    u.uDim.value = g.dim;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}

export class PostPipeline {
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly bloomPass: BloomPyramidPass;
  readonly finalPass: FinalPass;
  readonly grade: GradeParams;
  private target: THREE.WebGLRenderTarget;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, grade: GradeParams, q: QualitySettings) {
    this.grade = grade;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.msaa, depthBuffer: true, stencilBuffer: false });
    this.target.texture.name = 'moba.scene';
    this.composer = new EffectComposer(renderer, this.target);
    this.renderPass = new RenderPass(scene, camera);
    this.bloomPass = new BloomPyramidPass();
    this.finalPass = new FinalPass(this.bloomPass, grade);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.finalPass);
    this.applyQuality(q);
  }

  applyQuality(q: QualitySettings): void {
    this.bloomPass.enabled = q.bloom > 0;
    this.bloomPass.levels = q.bloomLevels;
    this.bloomPass.threshold.x = q.bloomThreshold;
    this.finalPass.setGradeEnabled(q.grade);
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== q.msaa) {
        rt.samples = q.msaa;
        rt.dispose();
      }
    }
  }

  setSize(width: number, height: number, dpr: number): void {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.bloomPass.dispose();
    this.finalPass.dispose();
    this.composer.dispose();
    this.target.dispose();
  }
}

/** 是否支持渲染到半浮点目标(HDR 后期的前提) */
export function supportsHdrTargets(renderer: THREE.WebGLRenderer): boolean {
  return renderer.capabilities.isWebGL2 !== false && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
}
