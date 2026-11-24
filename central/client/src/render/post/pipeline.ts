/**
 * 渲染管线（realism spec §iii.1、§v）：
 * - HIGH：场景 → RGBA16F 目标（MSAA 2 或 0，会话内固定；24 位深度）→ 半分辨率 bloom → 一个全分辨率输出 pass
 *   （bloom 合成 + 调色 + CustomToneMapping + sRGB）。three 渲染到 HDR 目标时自动跳过材质内 tone mapping。
 * - LOW（或 #post-0 调试）：直接画到画布，tone mapping 在各材质里做。
 * 目标在 resize 时重建（上下文恢复后由 three 按需重新初始化），并登记到贴图内存账本（'atmosphere:scene-rt' 等）。
 */
import { HalfFloatType, LinearFilter, Vector2, WebGLRenderTarget, type Camera, type Object3D, type ShaderMaterial, type WebGLRenderer } from 'three';
import { registerTextureBytes } from '../materials/lighting';
import { Bloom } from './bloom';
import { FullScreenPass } from './fullscreen';
import { BLOOM_STRENGTH, VEIL_GAIN, createOutputMaterial } from './output';

export interface PipelineOptions {
  /** true = HDR 目标 + 输出 pass（HIGH）；false = 直出画布（LOW）。 */
  hdr: boolean;
  bloom: boolean;
  /** 场景目标 MSAA 采样数（0 或 2）。 */
  samples: number;
}

export class PostPipeline {
  private sceneRT: WebGLRenderTarget | null = null;
  private bloomChain: Bloom | null = null;
  private output: FullScreenPass | null = null;
  private readonly size = new Vector2(1, 1);
  private bloom: boolean;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly opt: PipelineOptions,
  ) {
    this.bloom = opt.hdr && opt.bloom;
    if (opt.hdr) {
      this.output = new FullScreenPass(createOutputMaterial());
      if (this.bloom) this.bloomChain = new Bloom();
    }
    // 上下文恢复后 three 会按需重新初始化渲染目标（旧 GL 对象随上下文一起没了）；这里不能 rebuild()：
    // dispose 旧目标会让 three 去删已失效的 GL 对象（INVALID_OPERATION: object does not belong to this context）
  }

  get bloomOn(): boolean {
    return this.bloom && this.bloomChain !== null;
  }

  /** 运行中关掉 bloom（A11 自动降档）：释放 bloom 链的目标。 */
  disableBloom(): void {
    this.bloom = false;
    this.bloomChain?.dispose();
    this.bloomChain = null;
  }

  get hdr(): boolean {
    return this.opt.hdr;
  }

  get samples(): number {
    return this.opt.hdr ? this.opt.samples : 0;
  }

  /** 全分辨率后处理 pass 数（输出 pass；场景目标的 MSAA resolve 不算 pass）。 */
  get passesFull(): number {
    return this.opt.hdr ? 1 : 0;
  }

  /** w, h：drawing buffer 像素（含 DPR）。 */
  setSize(w: number, h: number): void {
    this.size.set(Math.max(1, w), Math.max(1, h));
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.opt.hdr) return;
    const [w, h] = [this.size.x, this.size.y];
    this.sceneRT?.dispose();
    this.sceneRT = new WebGLRenderTarget(w, h, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      samples: this.opt.samples,
    });
    this.sceneRT.texture.name = 'scene-hdr';
    const s = this.opt.samples;
    // 颜色 8 B/px（MSAA 时多重采样 renderbuffer × s + resolve 纹理）+ 深度 4 B/px × max(s, 1)
    registerTextureBytes('atmosphere:scene-rt', w * h * (8 * (s > 0 ? s + 1 : 1) + 4 * Math.max(s, 1)));
    this.bloomChain?.setSize(w, h);
  }

  /**
   * veilScale：雾中光幕的强度倍数（0–1）。光幕是相机与亮处之间的雾散射，看远处（维港、山顶）时满强度，
   * 街面上看近处的铺面时只留三成（否则近景也像隔着一层雾）。
   */
  render(scene: Object3D, camera: Camera, veilScale = 1): void {
    const r = this.renderer;
    if (!this.opt.hdr || !this.sceneRT || !this.output) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const u = (this.output.material as ShaderMaterial).uniforms;
    u.tScene!.value = this.sceneRT.texture;
    if (this.bloom && this.bloomChain) {
      const b = this.bloomChain.render(r, this.sceneRT.texture, this.size.x, this.size.y);
      u.tBloomHalf!.value = b.half;
      u.tBloomQuarter!.value = b.quarter;
      (u.uQuarterTexel!.value as Vector2).copy(b.quarterTexel);
      u.uBloom!.value = BLOOM_STRENGTH;
      u.uVeil!.value = VEIL_GAIN * veilScale;
    } else {
      u.uBloom!.value = 0;
    }
    (u.uResolution!.value as Vector2).copy(this.size);
    this.output.render(r, null);
  }

  dispose(): void {
    this.sceneRT?.dispose();
    this.bloomChain?.dispose();
    this.output?.dispose();
    registerTextureBytes('atmosphere:scene-rt', 0);
  }
}
