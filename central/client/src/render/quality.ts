/**
 * 画质档（realism spec §v）：能力探测、档位选择、起始 DPR、MSAA 决策、自适应 DPR。
 *
 * - 选择顺序：URL（?q= 或 #q-）→ 能力（HalfFloat 颜色目标不可渲染 → LOW；多重采样半浮点目标不可渲染 → HIGH 但 samples 0）→ HIGH。
 * - HIGH：场景 → RGBA16F 目标（起始 drawing buffer ≤ 1.2 Mpx 且支持时 MSAA 2，整个会话不变）→ 半分辨率 bloom → 输出 pass。
 * - LOW：直出画布（画布 MSAA），材质内 tone mapping，无 bloom、无平面反射。
 * 纯函数部分（选择、DPR、自适应）有单元测试；probeCaps 需要 DOM。
 */
import type { Quality, Tier } from './materials/lighting';

export interface Caps {
  webgl2: boolean;
  /** RGBA16F 颜色附件可渲染（EXT_color_buffer_half_float / EXT_color_buffer_float）。 */
  halfFloatRT: boolean;
  /** 2× 多重采样的 RGBA16F renderbuffer 可用。 */
  msaaHalfFloat: boolean;
}

export interface TierSpec {
  /** 起始 DPR 上限。 */
  dprMax: number;
  /** 自适应 DPR 阶梯（从高到低）。 */
  ladder: readonly number[];
  /** drawing buffer 像素上限（超出就沿阶梯降 DPR）。 */
  bufferCapPx: number;
  /** 画布自带 MSAA（只 LOW；HIGH 由场景目标决定）。 */
  canvasAntialias: boolean;
}

export const TIER_SPECS: Readonly<Record<Tier, TierSpec>> = {
  // HIGH 的阶梯降到 DPR 1 以下：1440p / 4K 桌面窗口的 CSS 尺寸本身就超过 buffer 上限，DPR 1 时场景 HDR 目标 + bloom +
  // 反射会超出 64 MB 显存预算；降到 0.5–0.95 后由浏览器放大画布（复审：2560×1440@1 原为 74 MB + 画布 28 MB）。
  // R4 + R5 整合后上限由 2.4 Mpx 降到 2.1 Mpx，并加 0.95 / 0.9 两级：起始 buffer 2.1–2.4 Mpx 的桌面窗口（如 1920×1200 @1，
  // 2.30 Mpx）原来账本 162.5 MB 超 160，现在 DPR 0.95（2.08 Mpx），与 1920×1080 @1 / 2560×1440 同一档 buffer
  high: { dprMax: 2, ladder: [2, 1.75, 1.5, 1.25, 1, 0.95, 0.9, 0.85, 0.75, 0.6, 0.5], bufferCapPx: 2.1e6, canvasAntialias: false },
  // LOW 画布自带 4× MSAA，每像素约 40 B：R3 整合把上限由 1.6 Mpx 降到 1.3 Mpx（画布 ≤ 52 MB），加上贴面远景、
  // 涂装与车站字图集约 12 MB 后守得住 64 MB（1280×720 @2 原来停在 DPR 1.25 = 1.44 Mpx，账本 68 MB）
  low: { dprMax: 1.5, ladder: [1.5, 1.25, 1, 0.85, 0.75, 0.6, 0.5], bufferCapPx: 1.3e6, canvasAntialias: true },
};

/**
 * 画布默认帧缓冲的显存（字节，登记进贴图账本）：颜色 RGBA8 前后两份；有深度再加 4 B/px；
 * 画布 MSAA（LOW）时多重采样颜色 + 深度各 × samples，另有一份 resolve。
 */
export function canvasBytes(px: number, depth: boolean, samples: number): number {
  if (samples > 0) return px * (4 * samples + (depth ? 4 * samples : 0) + 4 + 4);
  return px * (8 + (depth ? 4 : 0));
}

/** 起始 drawing buffer 不超过此像素数时 HIGH 档开 MSAA 2（桌面 1280×720@1、手机 DPR ≤ 1.75）。 */
export const MSAA_MAX_START_PX = 1.2e6;

/** 选档：URL 优先，其次能力；返回 Quality（bloom / 平面反射只在 HIGH）。 */
export function chooseQuality(url: Tier | null, caps: Caps): Quality {
  let tier: Tier = url ?? 'high';
  if (!caps.webgl2 || !caps.halfFloatRT) tier = 'low';
  const high = tier === 'high';
  return { tier, bloom: high, reflection: high };
}

/**
 * 起始 DPR：min(设备 DPR, 档位上限)，再沿阶梯往下，直到 drawing buffer ≤ 档位像素上限。
 * 设备 DPR 低于阶梯底时照用设备值。
 */
export function startDpr(tier: Tier, deviceDpr: number, cssW: number, cssH: number): number {
  const spec = TIER_SPECS[tier];
  const dev = deviceDpr > 0 ? deviceDpr : 1;
  const px = (d: number) => cssW * cssH * d * d;
  let dpr = Math.min(dev, spec.dprMax);
  if (px(dpr) <= spec.bufferCapPx) return dpr;
  for (const step of spec.ladder) {
    if (step >= dpr) continue;
    dpr = step;
    if (px(dpr) <= spec.bufferCapPx) return dpr;
  }
  return dpr;
}

/** HIGH 场景目标的 MSAA 采样数：支持且起始 buffer ≤ 1.2 Mpx 时 2，否则 0（会话内固定）。 */
export function msaaSamples(quality: Quality, caps: Caps, startBufferPx: number): number {
  if (quality.tier !== 'high') return 0;
  return caps.msaaHalfFloat && startBufferPx <= MSAA_MAX_START_PX ? 2 : 0;
}

/**
 * 自适应 DPR 用的阶梯：只用不低于 min(1, 起始 DPR) 的那几级——低于 1 的几级只为大屏显存上限而设（startDpr），
 * 不拿来换帧率（画面会糊）；起始已在 1 以下（4K 桌面）时就只有起始这一级。
 */
export function adaptiveLadder(tier: Tier, start: number): number[] {
  const floor = Math.min(1, start);
  return TIER_SPECS[tier].ladder.filter((d) => d >= floor - 1e-6 && d <= start + 1e-6);
}

export interface AdaptiveOptions {
  /** 帧时间 EMA 超过此值（ms）持续 downHoldMs 降一级。 */
  slowMs: number;
  downHoldMs: number;
  /** 低于此值持续 upHoldMs 升一级（不超过起始级）。 */
  fastMs: number;
  upHoldMs: number;
  /** 每次变化后的冷却（ms）。 */
  cooldownMs: number;
  /** EMA 系数（每帧）。 */
  alpha: number;
}

export const ADAPTIVE_DEFAULTS: AdaptiveOptions = {
  slowMs: 36,
  downHoldMs: 2000,
  fastMs: 28,
  upHoldMs: 5000,
  cooldownMs: 3000,
  alpha: 0.1,
};

/**
 * 自适应 DPR（PLAN §7.2）：帧时间 EMA；慢 2 s 降一级、快 5 s 升一级（不超过起始 DPR），变化后冷却 3 s。
 * 某一级每因太慢被放弃一次，升回它要等的时间翻倍（5 s、10 s、20 s……，上限 × 64）。
 * sample() 返回新的 DPR（有变化时）或 null。时间由调用方传入，便于测试。
 */
export class AdaptiveDpr {
  private ema = 0;
  private slowSince = -1;
  private fastSince = -1;
  private lastChange = -Infinity;
  /** 每一级「因为太慢被放弃」的次数：升回该级前要等 upHoldMs × 2^次数（指数退避，免得两级之间来回切、反复重建渲染目标）。 */
  private readonly abandoned: number[];
  private idx: number;
  private readonly startIdx: number;
  private readonly ladder: readonly number[];

  constructor(
    ladder: readonly number[],
    startDprValue: number,
    private readonly opt: AdaptiveOptions = ADAPTIVE_DEFAULTS,
  ) {
    // 起始 DPR 不在阶梯上时插到合适位置（例如设备 DPR 1.0 的 HIGH 档：阶梯 [1]）
    const below = ladder.filter((d) => d < startDprValue - 1e-6);
    this.ladder = [startDprValue, ...below];
    this.abandoned = this.ladder.map(() => 0);
    this.idx = 0;
    this.startIdx = 0;
  }

  get dpr(): number {
    return this.ladder[this.idx]!;
  }

  /** 已降到阶梯最底。 */
  get atBottom(): boolean {
    return this.idx === this.ladder.length - 1;
  }

  get frameMs(): number {
    return this.ema;
  }

  sample(frameMs: number, nowMs: number): number | null {
    this.ema = this.ema === 0 ? frameMs : this.ema + (frameMs - this.ema) * this.opt.alpha;
    if (nowMs - this.lastChange < this.opt.cooldownMs) {
      this.slowSince = this.fastSince = -1;
      return null;
    }
    if (this.ema > this.opt.slowMs) {
      this.fastSince = -1;
      if (this.slowSince < 0) this.slowSince = nowMs;
      if (nowMs - this.slowSince >= this.opt.downHoldMs && this.idx < this.ladder.length - 1) {
        this.abandoned[this.idx]!++;
        return this.change(this.idx + 1, nowMs);
      }
    } else if (this.ema < this.opt.fastMs) {
      this.slowSince = -1;
      if (this.fastSince < 0) this.fastSince = nowMs;
      const hold = this.opt.upHoldMs * 2 ** Math.min(this.abandoned[this.idx - 1] ?? 0, 6);
      if (nowMs - this.fastSince >= hold && this.idx > this.startIdx) return this.change(this.idx - 1, nowMs);
    } else {
      this.slowSince = this.fastSince = -1;
    }
    return null;
  }

  private change(i: number, nowMs: number): number {
    this.idx = i;
    this.lastChange = nowMs;
    this.slowSince = this.fastSince = -1;
    return this.dpr;
  }
}

/**
 * A11 自动降档监视：HIGH 档 DPR 已在阶梯底、帧时间中位数 > 40 ms 持续 4 s → 建议关掉 bloom 与平面反射（不回升）。
 */
export class DowngradeWatch {
  private readonly samples: number[] = [];
  private since = -1;
  fired = false;

  constructor(
    private readonly limitMs = 40,
    private readonly holdMs = 4000,
  ) {}

  sample(frameMs: number, nowMs: number, atBottom: boolean): boolean {
    if (this.fired) return false;
    this.samples.push(frameMs);
    if (this.samples.length > 60) this.samples.shift();
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p50 = sorted[sorted.length >> 1]!;
    if (!atBottom || p50 <= this.limitMs || this.samples.length < 30) {
      this.since = -1;
      return false;
    }
    if (this.since < 0) this.since = nowMs;
    if (nowMs - this.since < this.holdMs) return false;
    this.fired = true;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// 能力探测（DOM）：用一块 4×4 的临时 WebGL2 画布试建 RGBA16F 目标与 2× MSAA RGBA16F renderbuffer
// ---------------------------------------------------------------------------------------------

function tryTarget(gl: WebGL2RenderingContext, samples: number): boolean {
  const fb = gl.createFramebuffer();
  let tex: WebGLTexture | null = null;
  let rb: WebGLRenderbuffer | null = null;
  try {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    if (samples > 0) {
      if ((gl.getParameter(gl.MAX_SAMPLES) as number) < samples) return false;
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, 4, 4);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    } else {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, 4, 4);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!ok) return false;
    gl.clearColor(2, 0.5, 0.25, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return gl.getError() === gl.NO_ERROR;
  } catch {
    return false;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (tex) gl.deleteTexture(tex);
    if (rb) gl.deleteRenderbuffer(rb);
    gl.deleteFramebuffer(fb);
  }
}

/** 探测 WebGL2 与半浮点渲染目标能力；任何异常都按「不支持」处理，绝不抛错。 */
export function probeCaps(): Caps {
  const none: Caps = { webgl2: false, halfFloatRT: false, msaaHalfFloat: false };
  let gl: WebGL2RenderingContext | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return none;
    const ext = gl.getExtension('EXT_color_buffer_half_float') ?? gl.getExtension('EXT_color_buffer_float');
    const halfFloatRT = ext !== null && tryTarget(gl, 0);
    const msaaHalfFloat = halfFloatRT && tryTarget(gl, 2);
    return { webgl2: true, halfFloatRT, msaaHalfFloat };
  } catch {
    return gl ? { webgl2: true, halfFloatRT: false, msaaHalfFloat: false } : none;
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
