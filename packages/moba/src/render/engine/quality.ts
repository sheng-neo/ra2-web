/**
 * 画质档定义与默认档检测。
 * high = 阴影 2048 + bloom + 调色 + MSAA，DPR≤2；medium = 阴影 1024 + 轻 bloom，DPR≤1.5；low = 无阴影无后期，DPR 1。
 */
import type { Quality } from '../api';

export interface QualitySettings {
  name: Quality;
  /** 设备像素比上限 */
  dprCap: number;
  shadows: boolean;
  shadowMapSize: number;
  /** 是否启用后期管线(HDR 目标 + bloom + 调色)。false 时直出屏幕 */
  post: boolean;
  /** 场景渲染目标的 MSAA 采样数(仅 post=true 时有效) */
  msaa: number;
  /** bloom 强度(0 关闭)与降采样级数 */
  bloom: number;
  bloomLevels: number;
  /** 调色 + 暗角 */
  grade: boolean;
  /** 技能闪光用的点光池大小(改变它会触发全部受光 shader 重编译，只在切档时变) */
  pointLights: number;
  /** 草丛/草簇密度倍率 */
  foliage: number;
  /** 地表 shader 细节级别：0 = 最简，2 = 全部细节(焦散/星屑/多层噪声) */
  groundDetail: 0 | 1 | 2;
  /** 环境粒子(萤火/星屑)数量倍率 */
  motes: number;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: { name: 'low', dprCap: 1, shadows: false, shadowMapSize: 0, post: false, msaa: 0, bloom: 0, bloomLevels: 0, grade: false, pointLights: 0, foliage: 0.5, groundDetail: 0, motes: 0.4 },
  medium: { name: 'medium', dprCap: 1.5, shadows: true, shadowMapSize: 1024, post: true, msaa: 2, bloom: 0.5, bloomLevels: 4, grade: true, pointLights: 2, foliage: 0.75, groundDetail: 1, motes: 0.7 },
  high: { name: 'high', dprCap: 2, shadows: true, shadowMapSize: 2048, post: true, msaa: 4, bloom: 0.75, bloomLevels: 5, grade: true, pointLights: 4, foliage: 1, groundDetail: 2, motes: 1 },
};

/** 读一次显卡名(小写)；拿不到 WebGL 返回 null */
function gpuName(): string | null {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return null;
  }
}

/**
 * 依据设备给出默认画质(玩家随时可以在设置里改；帧率长期过低时引擎还会自动降渲染分辨率，见 engine.ts)：
 *   软件光栅(SwiftShader/llvmpipe，帧率极低)或拿不到 WebGL → low
 *   手机/平板：内存 ≤3GB、核心 ≤4、或老一代移动显卡(Adreno 3~5 系、Mali-4xx/T 系、PowerVR) → low；其余 → medium
 *     (medium = 1024 阴影 + 轻 bloom + DPR≤1.5，是中端机能稳住 30 帧的上限；high 的 2048 阴影 + 4×MSAA + DPR 2 在手机上太重)
 *   桌面：内存 ≤2GB / 核心 ≤2 / Intel 核显(高分屏下 4×MSAA 的 HDR 目标吃不消) → medium；其余 → high
 */
export function detectQuality(): Quality {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return 'medium';
  const gpu = gpuName();
  if (gpu === null || /swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  const ua = navigator.userAgent;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua) || (coarse && Math.min(screen.width, screen.height) < 900);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (mobile) {
    const oldGpu = /adreno \(tm\) [3-5]\d\d|mali-4|mali-t|powervr/.test(gpu);
    return mem <= 3 || cores <= 4 || oldGpu ? 'low' : 'medium';
  }
  const integrated = /intel/.test(gpu) && !/arc/.test(gpu);
  return mem <= 2 || cores <= 2 || integrated ? 'medium' : 'high';
}
