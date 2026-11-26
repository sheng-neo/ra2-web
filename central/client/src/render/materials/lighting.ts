/**
 * 写实化共享光照契约 v1（realism contract）。ATMOSPHERE / BUILDINGS / STREETS 三个工作包并行开发，
 * 各自的材质只要遵守本文件，合并后亮度、雾、色调就能对上。
 *
 * 规则（详见本轮写实化规格 realism spec §iii，仓库外文档）：
 * - 全部在线性 HDR 里算（working space = 线性 sRGB 原色）。十六进制颜色一律经 new Color(hex) 转线性。
 * - 材质输出「场景出射亮度」，不在材质里做曝光、不手写 gamma。片元最后：
 *     vec3 col = applyHaze(surface, emissive, vWorld);   // 表面项吃满雾，发光项只吃 uLightHaze 比例
 *     ${GLSL_FINISH}                                     // three 的 tone mapping（直出画布时）+ 输出色彩空间
 *   渲染到 HDR 目标（HIGH 档后处理）时 three 自动跳过材质内 tone mapping，由输出 pass 统一做。
 * - 亮度标尺：曝光 1.0、bloom 阈值 1.0（线性亮度 Y）。各类发光体的范围见 EMISSIVE；
 *   亮窗整窗平均必须 < 1（整片立面不能 bloom），只有灯具、招牌、车灯、航空灯、冠顶等才 > 1。
 * - 共享 uniform 只能「按引用」挂到材质上（见 sharedUniforms），不得 UniformsUtils.merge/clone，否则时间、雾不会同步。
 * - 本文件的导出名与函数签名冻结；函数体与数值由 ATMOSPHERE 负责调校，BUILDINGS / STREETS 不改本文件。
 */
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  CustomToneMapping,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderChunk,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  type IUniform,
  type WebGLRenderer,
} from 'three';

export const CONTRACT_VERSION = 1;

/** bloom 阈值（线性亮度 Y，tone map 前）。 */
export const BLOOM_THRESHOLD = 1.0;
/** 曝光：固定 1.0，不做自动曝光。 */
export const EXPOSURE = 1.0;

/**
 * 发光体亮度范围（线性亮度 Y，tone map 前，曝光 1.0）：[下限, 上限]。
 * 表面类（路面、立面）是「反照率 × 照度」后的出射亮度；发光类是发光面自身亮度。
 */
export const EMISSIVE = {
  /** 天空任意方向（含地平线光晕）。 */
  sky: [0.004, 0.06],
  /** 未亮灯立面（含街面反光照亮的底部 0–30 m 时取上限）。 */
  facadeUnlit: [0.004, 0.06],
  /** 屋顶：必须暗于亮着的路面。 */
  roof: [0.002, 0.015],
  /** 路面：两灯之间 / 灯下光斑中心。 */
  roadBetweenLamps: [0.015, 0.05],
  roadUnderLamp: [0.1, 0.25],
  /** 人行道（店铺溢光）。 */
  pavement: [0.05, 0.15],
  /** 写字楼亮窗（整窗平均）与天花灯具（点、条，只占窗高上部 25–35 %）。 */
  windowOffice: [0.25, 0.6],
  windowOfficeLuminaire: [1.0, 1.8],
  /** 避难层 / 机电层整层通亮带。 */
  refugeBand: [0.8, 1.2],
  /** 住宅亮窗（整窗平均）。 */
  windowResidential: [0.12, 0.45],
  /** 铺面橱窗（室内灯光）。 */
  shopGlazing: [0.5, 1.2],
  /** 招牌：灯箱 / 霓虹字与 LED 灯带。 */
  signLightbox: [1.5, 2.5],
  signNeon: [2.5, 4.0],
  /** 路灯灯头（发光面）。 */
  lampHead: [6, 20],
  /** 车头灯 / 车尾灯（刹车时取上限）/ 车厢（巴士上层、电车窗）。 */
  headlight: [6, 12],
  tailLight: [1.5, 3],
  vehicleCabin: [0.4, 1.0],
  /** 航空障碍灯（红，闪烁峰值）。 */
  aviation: [4, 8],
  /** 冠顶泛光面 / 边缘 LED 线。 */
  crownWash: [1.2, 3],
  edgeLed: [2, 4],
  /** 山上零星灯点、对岸灯点。 */
  hillLight: [2, 5],
} as const satisfies Record<string, readonly [number, number]>;

/** 光源色（sRGB 十六进制）。用 lightColour() 取「亮度归一（Y = 1）的线性 RGB」，再乘 EMISSIVE 里的亮度。 */
export const LIGHT_HEX = {
  /** 高压钠灯 ~2100 K：横街、山路、旧区。 */
  sodium: '#ff9a3c',
  /** 白光 LED 路灯 ~4000 K：主干道。 */
  ledWhite: '#ffd6aa',
  /** 写字楼：中性白 ~5600 K（主）/ 冷白偏绿 ~6500 K / 暖白 3000 K（10–15 %）。 */
  officeNeutral: '#fff0dc',
  officeCool: '#f1f6ee',
  officeWarm: '#ffc78a',
  /** 住宅：暖 2900 K（55–65 %）/ 冷白光管 5500 K（35–45 %）。 */
  homeWarm: '#ffb56e',
  homeCool: '#eef4e8',
  /** 铺面室内。 */
  shopWarm: '#ffd3a1',
  /** 招牌。 */
  neonRed: '#ff3b2f',
  ledBlue: '#2f6bff',
  neonGreen: '#38ff7a',
  lightboxWhite: '#fff6e8',
  /** 冠顶 / 边缘 LED（静态）。 */
  crownWhite: '#f4f8ff',
  crownGold: '#ffbf40',
  crownCyan: '#3be8ff',
  crownMagenta: '#ff3bd0',
  /** 车灯。 */
  headlight: '#eef4ff',
  tailLight: '#ff2018',
  /** 航空障碍灯。 */
  aviation: '#ff1a10',
  /** 冷白光管（行人天桥、有盖通道）~6800 K。 */
  tubeCool: '#e8f0f0',
} as const;

export type LightName = keyof typeof LIGHT_HEX;

/** 亮度归一（Y = 1）的线性 RGB。 */
export function lightColour(name: LightName | string): Color {
  const c = new Color(name in LIGHT_HEX ? LIGHT_HEX[name as LightName] : name);
  const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return y > 0 ? c.multiplyScalar(1 / y) : c;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * 街面主光源的「钠灯比例」0–1（0 = 白光 LED 主干道区，1 = 钠灯横街 / 山路）。
 * BUILDINGS 用它定楼底街面反光的冷暖（cityAmbient 的 warmth），STREETS 用它抽路灯颜色，两边一致。
 * x, y：模拟坐标（米，东 / 北）；groundM：地面高程 mPD（米）。
 * 中环核心与新填海区偏白光；半山（地面越高越暖）与上环横街偏钠灯。
 */
export function streetWarmth(x: number, y: number, groundM: number): number {
  const hill = 0.45 * smooth(30, 90, groundM);
  const west = 0.2 * smooth(-100, -400, x);
  const harbourfront = 0.15 * smooth(100, 400, y);
  return Math.min(Math.max(0.3 + hill + west - harbourfront, 0), 0.9);
}

/** 夜色调色板（sRGB 十六进制）：天空与雾。雾色 = 地平线天色（远景与天空在地平线无缝相接）。 */
export const NIGHT_SKY = {
  zenith: '#14151c',
  mid: '#1f2029',
  horizon: '#3d3a4c',
  /** 低云天的暖色变体（低云被钠灯 + 暖 LED 从下照亮）。 */
  horizonOvercast: '#3b3029',
} as const;

/** 雾 / 空气透视默认值。 */
export const HAZE = {
  /** 海平面消光长度（m）：典型夜 4000，潮湿 2500，罕见通透夜 8000。 */
  extinctionM: 4000,
  /** 高度衰减尺度（m）：密度 ∝ exp(−y / falloff)。 */
  falloffM: 600,
  /** 低云底（mPD）与云内消光长度（m）；默认无低云（密度 0）。 */
  cloudBaseM: 320,
  cloudExtinctionM: 0,
  /** 发光项所受光学厚度比例（灯比墙更「穿雾」）。 */
  lightHaze: 0.5,
} as const;

/** 全部共享 uniform（同一批对象，按引用挂到每个材质上）。 */
export const SHARED = {
  /** 秒，自启动起累加；每 3600 s 回绕一次（着色器里的周期函数应能容忍这次跳变）。 */
  uTime: { value: 0 } as IUniform<number>,
  /** 当地钟点（小时，18–26 = 18:00 至次日 02:00），驱动亮灯率。默认 20:00。 */
  uClock: { value: 20 } as IUniform<number>,
  /** 雾色（线性），= 地平线天色。 */
  uHazeColor: { value: new Color(NIGHT_SKY.horizon) } as IUniform<Color>,
  /** 海平面消光系数（1/m）。 */
  uHazeDensity: { value: 1 / HAZE.extinctionM } as IUniform<number>,
  uHazeFalloff: { value: HAZE.falloffM } as IUniform<number>,
  uCloudBase: { value: HAZE.cloudBaseM } as IUniform<number>,
  /** 云内额外消光系数（1/m），0 = 无低云。 */
  uCloudDensity: { value: 0 } as IUniform<number>,
  uLightHaze: { value: HAZE.lightHaze } as IUniform<number>,
  /** 光点精灵的光晕倍率：HIGH（有 bloom）1.0，LOW（无 bloom）1.1。 */
  uHaloGain: { value: 1 } as IUniform<number>,
  /** 光点核心的最小屏幕直径（drawing-buffer 像素）。 */
  uGlowMinPx: { value: 2 } as IUniform<number>,
  /** drawing buffer 尺寸（像素，含 DPR）；CityRenderer.resize 负责更新。 */
  uViewportPx: { value: new Vector2(1280, 720) } as IUniform<Vector2>,
  /** 路面湿度 0–1（0.25 = 刚下过微雨的微湿反光）。 */
  uWetness: { value: 0.25 } as IUniform<number>,
};

export type SharedUniforms = typeof SHARED;

/** 返回共享 uniform 的浅拷贝记录（值对象仍是同一引用），可直接与材质自己的 uniform 合并：{ ...sharedUniforms(), uMine }。 */
export function sharedUniforms(): Record<keyof SharedUniforms, IUniform> {
  return { ...SHARED };
}

/**
 * CPU 端模拟用的单调时钟（秒，双精度，不回绕）：车流、电车、船的位置只看它。
 * uTime 每小时回绕一次（着色器里的 float 精度），车船的周期不整除 3600，若跟着 uTime 走，每小时会整体跳一次。
 */
export const SIM_CLOCK = { t: 0 };

/** 每帧推进共享时间（CityRenderer.frame 调用）。 */
export function advanceShared(dt: number): void {
  SIM_CLOCK.t += dt;
  SHARED.uTime.value = SIM_CLOCK.t % 3600;
}

/** GLSL：共享 uniform 声明（顶点与片元都可 include；材质不得再自行声明同名 uniform）。 */
export const GLSL_SHARED_PARS = /* glsl */ `
uniform float uTime;
uniform float uClock;
uniform vec3 uHazeColor;
uniform float uHazeDensity;
uniform float uHazeFalloff;
uniform float uCloudBase;
uniform float uCloudDensity;
uniform float uLightHaze;
uniform float uHaloGain;
uniform float uGlowMinPx;
uniform vec2 uViewportPx;
uniform float uWetness;
`;

/**
 * GLSL：空气透视（需要 GLSL_SHARED_PARS；cameraPosition 由 three 提供）。
 * 指数高度雾沿视线的解析光学厚度 + 低云层。不透明表面用 applyHaze：表面吃满雾并叠加雾色，发光项只按 uLightHaze 衰减；
 * 加色混合的发光体用 hazeLight（只衰减，不叠雾色）。
 */
export const GLSL_HAZE = /* glsl */ `
float hazeDepth(vec3 wp) {
  vec3 ro = cameraPosition;
  float d = length(wp - ro);
  float H = max(uHazeFalloff, 1.0);
  float y0 = max(ro.y, 0.0);
  float y1 = max(wp.y, 0.0);
  float dy = y1 - y0;
  float k = abs(dy) < 1.0 ? exp(-0.5 * (y0 + y1) / H) : (exp(-y0 / H) - exp(-y1 / H)) * H / dy;
  float tau = uHazeDensity * d * k;
  if (uCloudDensity > 0.0) {
    float ylo = min(ro.y, wp.y);
    float yhi = max(ro.y, wp.y);
    float inside = yhi <= uCloudBase ? 0.0 : (ylo >= uCloudBase ? 1.0 : (yhi - uCloudBase) / max(yhi - ylo, 1e-3));
    tau += uCloudDensity * d * inside;
  }
  return tau;
}
vec3 applyHaze(vec3 surface, vec3 emissive, vec3 wp) {
  float tau = hazeDepth(wp);
  float T = exp(-tau);
  return surface * T + emissive * exp(-tau * uLightHaze) + uHazeColor * (1.0 - T);
}
// 加色混合的发光体（光点精灵、光晕、灯带叠层）只衰减、不加雾色，否则整个精灵方块会被雾色抬亮
vec3 hazeLight(vec3 emissive, vec3 wp) {
  return emissive * exp(-hazeDepth(wp) * uLightHaze);
}
`;

/**
 * GLSL：夜间城市环境照度（线性，乘反照率 = 出射亮度）。
 * n：世界法线；lift：离地高度（m）；warmth：街面主光源 0 = 白光 LED 区，1 = 钠灯区。
 * 天光是被城市光照亮的雾 / 云（中性偏冷、很弱）；街面反光贴地最强、按 e^(−lift/10 m) 衰减，侧面与朝下面更强。
 * 照片（visual-facts §4，参考 05、06、15）：住宅墙只有最低 5–15 m 被路灯照亮，往上近黑（Y 0.001–0.008），
 * 所以天光底数很低（约为街面反光的 6 %），20 m 以上的墙 Y ≤ 0.01，不再是整面均匀发亮的「纸板」。
 */
export const GLSL_CITY_LIGHT = /* glsl */ `
vec3 cityAmbient(vec3 n, float lift, float warmth) {
  float up = 0.55 + 0.45 * n.y;
  vec3 skyC = vec3(0.015, 0.015, 0.019) * up;
  float street = exp(-max(lift, 0.0) / 10.0) * (1.0 - 0.7 * max(n.y, 0.0));
  vec3 streetC = mix(vec3(0.24, 0.22, 0.19), vec3(0.32, 0.19, 0.07), clamp(warmth, 0.0, 1.0));
  return skyC + streetC * street;
}
`;

/**
 * GLSL：片元收尾。要求局部变量 vec3 col（线性 HDR，已经 applyHaze）。
 * 直出画布（LOW 档、或各包单独开发时）由 three 在这里做 tone mapping；渲染到 HDR 目标时这一步自动跳过。
 */
export const GLSL_FINISH = /* glsl */ `
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/** 同上，带透明度（要求局部变量 vec3 col、float alpha）。 */
export const GLSL_FINISH_ALPHA = /* glsl */ `
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/**
 * 相机白平衡（线性 RGB 乘子，契约允许的全局调色 ≤ ±5 %）：照片是手机按约 4300 K 白平衡拍的，
 * 渲染不做白平衡时 4000 K 的白光 LED 路面会偏橙褐；略压红、略提蓝。HIGH（输出 pass）与 LOW（材质内）同一处生效。
 */
export const WHITE_BALANCE = [0.96, 1.0, 1.04] as const;

/**
 * GLSL：tone mapping 曲线（CustomToneMapping 的函数体）。曝光后：
 * - 最大通道 ≤ 0.75 时恒等（调色板在暗部所见即所得）；
 * - 以上用指数肩部压到 1.0，并按原始 HDR 强度向白收敛（模拟相机里灯芯过曝成白、外圈留色）。
 * ATMOSPHERE 可调参数与追加调色（grade），不得改成会改变暗部（< 0.75）的曲线。
 */
export const GLSL_TONEMAP_BODY = /* glsl */ `
  color *= toneMappingExposure;
  // 相机白平衡（整合时加，全局调色 ≤ ±5 %）：手机夜拍约 4300 K 白平衡，白光 LED 路面不再显得橙褐
  color *= vec3(${WHITE_BALANCE.map((v) => v.toFixed(3)).join(', ')});
  float m = max(color.r, max(color.g, color.b));
  const float K = 0.75;
  if (m > K) {
    float mc = K + (1.0 - K) * (1.0 - exp(-(m - K) / (1.0 - K)));
    color *= mc / m;
    color = mix(color, vec3(mc), smoothstep(1.0, 8.0, m) * 0.75);
  }
  return color;
`;

let toneMappingInstalled = false;

/**
 * 把 GLSL_TONEMAP_BODY 装进 three 的 CustomToneMapping（必须在任何着色器编译前调用），并让渲染器使用它。
 * 同时把 renderer.info 改为手动清零：一帧可能多次 render（反射、后处理），stats() 要报整帧总数。
 */
export function installToneMapping(renderer: WebGLRenderer): void {
  if (!toneMappingInstalled) {
    const chunk = ShaderChunk.tonemapping_pars_fragment;
    const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
    if (!chunk.includes(stub)) throw new Error('three tonemapping_pars_fragment 结构已变，CustomToneMapping 无法安装');
    ShaderChunk.tonemapping_pars_fragment = chunk.replace(stub, `vec3 CustomToneMapping( vec3 color ) {${GLSL_TONEMAP_BODY}}`);
    toneMappingInstalled = true;
  }
  renderer.toneMapping = CustomToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.info.autoReset = false;
}

// ---------------------------------------------------------------------------------------------
// GPU 贴图 / 渲染目标内存登记（stats().texMB 汇总；HIGH 档总预算 64 MB）
// ---------------------------------------------------------------------------------------------

const textureLedger = new Map<string, number>();

/**
 * 登记一张贴图或渲染目标占用的 GPU 字节数（同名覆盖；尺寸变化时重新登记）。
 * 估算：宽 × 高 × 每像素字节 × MSAA 采样数（有 mipmap 再 × 4/3）；深度缓冲另算一项。
 * 键名以包名开头：'atmosphere:scene-rt'、'buildings:sign-atlas'、'streets:canopy-noise'。
 */
export function registerTextureBytes(key: string, bytes: number): void {
  if (bytes > 0) textureLedger.set(key, bytes);
  else textureLedger.delete(key);
}

/** 已登记的全部 GPU 贴图字节数。 */
export function textureBytes(): number {
  let sum = 0;
  for (const v of textureLedger.values()) sum += v;
  return sum;
}

/** 各项明细（调试 / perf 面板用）。 */
export function textureLedgerEntries(): [string, number][] {
  return [...textureLedger.entries()];
}

// ---------------------------------------------------------------------------------------------
// 画质档与 URL 参数（?query 与 #hash 都认：artifact 链接只透传 #hash）
// ---------------------------------------------------------------------------------------------

export type Tier = 'high' | 'low';

export interface Quality {
  tier: Tier;
  /** 半分辨率 bloom（只 HIGH）。 */
  bloom: boolean;
  /** 实时平面反射（只 HIGH）。 */
  reflection: boolean;
}

/**
 * 读 URL 参数：先 ?name=value，再 #hash 令牌。hash 令牌以 & , ; 分隔，
 * 支持 #name-value、#name=value、#name（值为 '1'）。例：#q-low&perf、#view-statue,t-21.5。
 */
export function readParam(name: string, loc: Pick<Location, 'search' | 'hash'> = location): string | null {
  const q = new URLSearchParams(loc.search).get(name);
  if (q !== null) return q;
  for (const raw of loc.hash.replace(/^#/, '').split(/[&,;]/)) {
    // 坏的 % 转义（如 #q-low&50%）不能让整个应用起不来：解码失败就按原样读
    let tok: string;
    try {
      tok = decodeURIComponent(raw.trim());
    } catch {
      tok = raw.trim();
    }
    if (!tok) continue;
    const m = /^([A-Za-z][\w]*)(?:[-=](.*))?$/.exec(tok);
    if (m && m[1] === name) return m[2] ?? '1';
  }
  return null;
}

/** URL 指定的画质档（?q=low|high 或 #q-low / #q-high）；没指定返回 null。 */
export function urlTier(loc: Pick<Location, 'search' | 'hash'> = location): Tier | null {
  const v = readParam('q', loc);
  return v === 'low' || v === 'high' ? v : null;
}

let quality: Quality | null = null;

/** 当前画质档。ATMOSPHERE 在 build 之前用 setQuality 写入自动检测结果；其余包只在 build 时读。 */
export function getQuality(): Quality {
  if (!quality) {
    const tier = urlTier() ?? 'high';
    setQuality({ tier, bloom: tier === 'high', reflection: tier === 'high' });
  }
  return quality as Quality;
}

export function setQuality(q: Quality): void {
  quality = q;
  SHARED.uHaloGain.value = q.bloom ? 1 : 1.1;
}

// ---------------------------------------------------------------------------------------------
// 光点精灵（路灯灯头、车灯、航空灯、冠顶灯点、山上灯点）：一个 GlowBatch = 一个 draw call
// ---------------------------------------------------------------------------------------------

const GLOW_VERT = /* glsl */ `
${GLSL_SHARED_PARS}
attribute vec3 aCenter;   // 世界坐标（three，米）
attribute vec3 aColour;   // 亮度归一的线性 RGB
attribute vec2 aGlow;     // x = 核心亮度（EMISSIVE 标尺），y = 发光体物理半径（m）
attribute vec3 aBlink;    // x = 频率 Hz（0 = 常亮），y = 相位 0–1，z = 占空比 0–1
varying vec2 vCorner;
varying vec3 vEmit;
varying float vCoreFrac;
varying vec3 vCenter;
void main() {
  vec4 mv = viewMatrix * vec4(aCenter, 1.0);
  vec4 clip = projectionMatrix * mv;
  float depth = max(-mv.z, 0.05);
  float pxPerM = projectionMatrix[1][1] * 0.5 * uViewportPx.y / depth;
  float rPx = aGlow.y * pxPerM;
  float corePx = max(rPx, uGlowMinPx * 0.5);
  // 小于最小尺寸时按面积摊薄亮度（能量守恒），但保留 15 % 下限：远处的灯在照片里也是一个过曝小点
  float boost = max((rPx * rPx) / (corePx * corePx), 0.15);
  // 光晕：核心的 4 倍（LOW 无 bloom 时 × uHaloGain），但不超过画面高度的 3.4 %（720p 约 24 px）——
  // 照片里灯是过曝的小核加一圈小光晕（visual-facts §6），不是大团的散景光球
  float haloPx = max(min(corePx * 4.0 * uHaloGain, 0.034 * uViewportPx.y), corePx * 1.5);
  float blink = 1.0;
  if (aBlink.x > 0.0) blink = step(fract(uTime * aBlink.x + aBlink.y), aBlink.z);
  vCorner = position.xy;
  vCoreFrac = corePx / haloPx;
  vEmit = aColour * aGlow.x * boost * blink;
  vCenter = aCenter;
  clip.xy += position.xy * haloPx * 2.0 / uViewportPx * clip.w;
  gl_Position = clip;
}
`;

const GLOW_FRAG = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
varying vec2 vCorner;
varying vec3 vEmit;
varying float vCoreFrac;
varying vec3 vCenter;
void main() {
  float r = length(vCorner);
  if (r > 1.0) discard;
  float core = 1.0 - smoothstep(vCoreFrac * 0.55, vCoreFrac, r);
  float halo = exp(-r * r * 14.0) * 0.12 * uHaloGain;
  vec3 col = hazeLight(vEmit * (core + halo), vCenter);
  ${GLSL_FINISH}
}
`;

/** 光点精灵材质：加色混合、测深度不写深度。所有光点共用一个实例即可。 */
export function createGlowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: sharedUniforms(),
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

let glowMaterial: ShaderMaterial | null = null;

/** 全局共用的光点材质（一个 program）。 */
export function glowMaterial1(): ShaderMaterial {
  glowMaterial ??= createGlowMaterial();
  return glowMaterial;
}

/**
 * 一批光点（一个 InstancedBufferGeometry + 一个 Mesh = 一个 draw call）。
 * set() 写入后调用 commit()；会动的批（车灯）每帧 set 完再 commit(true)，静态批 commit() 一次即可。
 */
export class GlowBatch {
  readonly mesh: Mesh;
  private readonly geo = new InstancedBufferGeometry();
  private readonly center: InstancedBufferAttribute;
  private readonly colour: InstancedBufferAttribute;
  private readonly glow: InstancedBufferAttribute;
  private readonly blink: InstancedBufferAttribute;
  private count = 0;

  constructor(
    readonly capacity: number,
    name: string,
  ) {
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.center = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.colour = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.glow = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    this.blink = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.geo.setAttribute('aCenter', this.center);
    this.geo.setAttribute('aColour', this.colour);
    this.geo.setAttribute('aGlow', this.glow);
    this.geo.setAttribute('aBlink', this.blink);
    this.geo.instanceCount = 0;
    this.mesh = new Mesh(this.geo, glowMaterial1());
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 10;
  }

  /** 第 i 个光点：p 为 three 世界坐标（米，用 coords.ts 换算）；colour 为 lightColour()；intensity 为 EMISSIVE 标尺；radiusM 为物理半径。 */
  set(i: number, p: readonly [number, number, number], colour: Color, intensity: number, radiusM: number, blinkHz = 0, phase = 0, duty = 0.5): void {
    if (i >= this.capacity) return;
    this.center.setXYZ(i, p[0], p[1], p[2]);
    this.colour.setXYZ(i, colour.r, colour.g, colour.b);
    this.glow.setXY(i, intensity, radiusM);
    this.blink.setXYZ(i, blinkHz, phase, duty);
    this.count = Math.max(this.count, i + 1);
  }

  /** set 的不分配版本（热循环：车灯、电车灯）。 */
  setXYZ(i: number, x: number, y: number, z: number, colour: Color, intensity: number, radiusM: number): void {
    if (i >= this.capacity) return;
    this.center.setXYZ(i, x, y, z);
    this.colour.setXYZ(i, colour.r, colour.g, colour.b);
    this.glow.setXY(i, intensity, radiusM);
    this.blink.setXYZ(i, 0, 0, 0.5);
    this.count = Math.max(this.count, i + 1);
  }

  /** 实例数改为 n（之后的光点不画）。 */
  setCount(n: number): void {
    this.count = Math.min(n, this.capacity);
  }

  commit(dynamic = false): void {
    this.geo.instanceCount = this.count;
    for (const a of [this.center, this.colour, this.glow, this.blink]) {
      if (dynamic) a.setUsage(DynamicDrawUsage);
      a.needsUpdate = true;
    }
    if (!dynamic && this.count > 0) {
      const pts: Vector3[] = [];
      for (let i = 0; i < this.count; i++) pts.push(new Vector3(this.center.getX(i), this.center.getY(i), this.center.getZ(i)));
      this.geo.boundingSphere = new Sphere().setFromPoints(pts);
      this.mesh.frustumCulled = true;
    }
  }
}
