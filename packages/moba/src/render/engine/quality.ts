/**
 * 画质档定义与默认档检测。
 * high = 阴影 2048(PCF 半径 2) + bloom + 调色 + 4×MSAA，DPR≤2；medium = 阴影 1024(PCFSoft) + 轻 bloom + 2×MSAA，DPR≤1.5；
 * low = 无阴影贴图(静态烘焙影 + 单位圆斑)、无后期，DPR 1。三档共用同一套主光方向、三阶明暗、环境染色、冷暖边缘光与 Neutral 色调映射。
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
  /**
   * 主光阴影的滤波方式：'pcfsoft' = three 的 PCFSoftShadowMap(medium)；'pcf' = PCFShadowMap + shadowRadius(high，固定 17 次采样，
   * 半影宽度由 shadowRadius 决定，无噪点)。整个渲染器只能有一种类型，切档时由引擎切换。
   */
  shadowType: 'pcf' | 'pcfsoft';
  /** 'pcf' 时的半影半径(texel，取整数，见 high 档注释)；'pcfsoft' 下不生效 */
  shadowRadius: number;
  /** 远景薄霾强度(屏幕上沿向冷亮色混合的最大比例)。0 = 关 */
  haze: number;
  /** bloom 亮度阈值(线性 HDR)。只有自发光件与特效核心应越过它 */
  bloomThreshold: number;
  /** 体积光束与雾片(terrain/atmos.ts)：0 = 关，1 = 数量减半，2 = 全部 */
  atmos: 0 | 1 | 2;
  /** 水面与河床细节：0 = 无折射晃动/焦散、单条泡沫，1 = 折射 + 单层焦散 + 两条泡沫，2 = 再加双层焦散/碎闪/涟漪圈/坑内旋涡 */
  waterDetail: 0 | 1 | 2;
  /** 单位材质的程序纹样(鳞/岩层/毛笔触/织纹…)。false 时只保留材质类别的高光与明暗差异 */
  unitPatterns: boolean;
  /** 装饰构件的附属效果(星灯柱光晕、构件环境粒子等)倍率 0..1 */
  props: number;
  /**
   * 地形散件的密度档(terrain/geo.ts 的 RANK_*)：1 = 只画基础那一批，2 = 再加 medium 的加密散件，3 = 全部。
   * 合并网格里按档位排好了索引，这里只决定画到哪一段(不增减 draw call)。
   */
  sceneryRank: 1 | 2 | 3;
  /**
   * 阴影通道画到哪一档的地形投影者：0 = 只画主要投影者(崖壁、场内的树、建筑与构件)，3 = 连灌木、碎石、界外林木一起画。
   */
  shadowRank: 0 | 3;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: {
    name: 'low',
    dprCap: 1,
    shadows: false,
    shadowMapSize: 0,
    post: false,
    msaa: 0,
    bloom: 0,
    bloomLevels: 0,
    grade: false,
    pointLights: 0,
    foliage: 0.5,
    groundDetail: 0,
    motes: 0.4,
    shadowType: 'pcfsoft',
    shadowRadius: 1,
    haze: 0,
    bloomThreshold: 1.35,
    atmos: 0,
    waterDetail: 0,
    unitPatterns: false,
    props: 0.5,
    sceneryRank: 1,
    shadowRank: 0,
  },
  medium: {
    name: 'medium',
    dprCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    post: true,
    msaa: 2,
    bloom: 0.4,
    bloomLevels: 4,
    grade: true,
    pointLights: 2,
    foliage: 0.75,
    groundDetail: 1,
    motes: 0.7,
    shadowType: 'pcfsoft',
    shadowRadius: 1,
    haze: 0.05,
    bloomThreshold: 1.35,
    atmos: 1,
    waterDetail: 1,
    unitPatterns: true,
    props: 0.75,
    sceneryRank: 2,
    shadowRank: 0,
  },
  high: {
    name: 'high',
    dprCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    post: true,
    msaa: 4,
    bloom: 0.55,
    bloomLevels: 5,
    grade: true,
    pointLights: 4,
    foliage: 1,
    groundDetail: 2,
    motes: 1,
    shadowType: 'pcf',
    // 取整数：three 的 PCF 是 17 个最近邻比较点，落在 ±r 与 ±r/2 texel 上；r = 2.5 时采样点落在半 texel 处，
    // 阴影边缘与树冠自影出现点状网纹(ra-sr 对比)。r = 2 时各点同步跨 texel，边缘干净，半影约 4 texel ≈ 9 厘米
    shadowRadius: 2,
    haze: 0.06,
    bloomThreshold: 1.35,
    atmos: 2,
    waterDetail: 2,
    unitPatterns: true,
    props: 1,
    sceneryRank: 3,
    shadowRank: 3,
  },
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
