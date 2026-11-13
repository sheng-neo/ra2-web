/**
 * 星陨战纪 · 共享着色套件（渲染层全体共用，保证画面风格统一）
 *
 * ── 给 R2/R3 的用法速查 ──────────────────────────────────────────────
 * 1) 风格化受光材质（阶梯明暗 + 轮廓光 + 受击闪白 + 淡出 + 队伍色 + 风摆 + 接收/投射阴影 + 雾）：
 *      const mat = createToonMaterial({ color: 0x6f7f8f, steps: 2, rim: 0.5 });
 *      mesh.castShadow = mesh.receiveShadow = true;
 *    - 合并几何 + 顶点色：`vertexColors: true`；贴图：`map: tex`(需要 uv)；没有 uv 的石材/岩体用
 *      `map: getRockTexture(), triplanar: 0.3, mapGain: 1.75`(按世界坐标三向投影)；`flat: true` 得到切面感。
 *    - 自发光：`emissive: 0x55c8ff, emissiveIntensity: 2`(>1 的部分会被 bloom 溢出)。
 *    - 可选顶点属性 aFx(vec4)：x=风摆权重 y=自发光强度(乘以底色) z=队伍色蒙版 w=AO(1=无遮蔽)。
 *      用 `setFxAttribute(geometry, { sway, glow, team, ao })` 填常量；不提供该属性时等价于 (0,0,0,1)。
 *    - 一个材质给多个单位共用、又要「每个单位各自闪白/淡出/换队伍色」：
 *        const params = createToonParams();          // 每个单位一份
 *        bindToonParams(unitRoot, params);           // 递归写到 mesh.userData.toon
 *        params.flash = 1; params.opacity = 0.4; params.teamColor.set(...); params.tint.set(...)
 *      渲染时材质会在 onBeforeRender 里读取并上传，无需克隆材质(省 draw state 切换与内存)。
 *    - 不绑定 params 时直接改材质：mat.flash / mat.fade / mat.teamColor / mat.color / mat.emissive。
 *    - 淡出默认是「抖动镂空」(不需要透明排序，阴影照常)；要真正的半透明混合传 `transparent: true`。
 * 2) 描边（背面外扩法）：`createOutlineMaterial({ color: 0x1a2030, thickness: 0.035 })`，
 *    用同一 geometry 再建一个 Mesh 即可(要求平滑法线)。
 * 3) 纯发光体（不受光，核心/水晶/光球/光柱）：`createGlowMaterial({ color, intensity: 3, fresnel: 2, additive: true })`。
 * 4) 调色板：`PALETTE`(蓝/红/中立/玩家/环境)、`teamPalette(team)`、`linearColor(hex)`。
 * 5) 程序化纹理：`makeCanvasTexture`、`makeNoiseTexture`、`makeGradientTexture`、`heightToNormalTexture`、
 *    `tileStamp`(可平铺绘制)、`getStoneTexture()/getRockTexture()`(带缓存的石板/岩石颜色贴图)。
 *    注意：不要用 canvas 的 alpha 通道存数据(预乘会毁掉 RGB)，数据贴图请用 DataTexture。
 *    噪声：`Rng`(种子随机)、`hash2`、`valueNoise2`、`fbm2`；GLSL 片段 `GLSL_NOISE`。
 * 6) 全局动画 uniform：`SHARED.uTime / uWind`，每帧由引擎 `tickShared(dt)` 推进；自写 shader 直接引用
 *    `uniforms: { uTime: SHARED.uTime }` 即可同步(不要 clone 这个对象)。
 * 7) 自写受光 shader(地面贴花/特殊表面)：用 `litUniforms({...})` + `lights: true, fog: true`，顶点里拼
 *    GLSL_LIGHT_PARS_VERTEX / GLSL_LIGHT_VERTEX_TAIL，片元里拼 GLSL_LIGHT_PARS_FRAGMENT，即可调用
 *    kitShadow() / kitAmbient(N) / kitSunDir() / kitSunColor() / kitPointLights(N, viewPos)，结尾接 GLSL_OUTPUT_FRAGMENT。
 *    写法可参考 terrain/decals.ts(预乘透明贴花) 与 terrain/water.ts。
 *
 * 8) 第二阶段的光影接口(art-v2 §4)：
 *    - 三阶明暗自定义阈值：`createToonMaterial({ ramp: [0.05, 0.42, 0.55], softness: 0.1, shadeTint: PALETTE.env.shadeRock })`
 *      (岩石/建筑/构件)。在主光方向下：顶面与西立面 = 亮，朝镜头的南立面 = 灰，东立面 = 暗。
 *    - 背光侧冷色边缘光：`kicker: 0.1`(岩石) / `0.3`(建筑)；自写 shader 用片段 GLSL_KICK 的 kitKick(N, V, uKickDir) × uKickColor。
 *    - 顶面贴图：`mapTop: 草贴图, mapTopScale: 0.1, mapTopNoise: 噪声贴图`——法线朝上的片元按世界 xz 采样并叠大块色斑。
 *    - 环境染色贴图：Toon 材质默认采样(lightTint: false 可关)；自写 shader 拼 GLSL_LIGHT_TINT，
 *      `vec4 lt = kitLightTint(worldXZ); irr = kitTintAmbient(kitAmbient(N) * ao, lt) + 主光…`。写入见 engine/lighttint.ts。
 *    - 暗部色：实体用 SHARED.uShadeTint(不传 shadeTint 的 Toon 材质自动跟随)，地表/水面/贴花声明
 *      `uniform vec3 uShadeTintGround;` 即可(litUniforms 自动绑定)，然后 `col *= mix(uShadeTintGround, vec3(1.0), 受光量)`。
 *    - kitAmbient(N) 自带「立面补光」：法线越水平多吃一份地面反光，岩壁与角色的背光面不会发黑；朝上的面不受影响。
 *    - 色调映射：全工程统一用 TONE_MAPPING(Neutral 的高光段、暗部线性，见本文件「色调映射」一节)。
 *      独立的小渲染器(立绘、头像、画廊)也请设 `renderer.toneMapping = TONE_MAPPING`，颜色才和对局里一致。
 *
 * 光照约定与 three 内置材质一致(辐照度 × 反照率 / π)，所以同一场景里混用 MeshStandardMaterial 亮度也对得上。
 * 所有自定义 shader 结尾都带 tonemapping/colorspace/fog，直出屏幕(low 档)与走后期(HDR 目标)两条路径都正确。
 * 注意：low 档没有 HDR 中间目标，叠加混合发生在 gamma 空间，同样的数值会显得更亮。自写的叠加类 shader 可以用
 *   片段 GLSL_ADDITIVE 提供的 `kitAdditive(color)` 包一下输出颜色来对齐观感(HDR 路径下它原样返回)。
 *
 * 对色基准(1280×720，quality=high；用 /dev/lookdev.html 的亮度色卡实测，CIE L*)：
 *   受光兵线石 #c0b08d ≈ 72、阴影里 ≈ 40；受光草 #6f9d4a ≈ 58；崖顶草 #5a9150 ≈ 53；岩·亮 #a9a39f 朝上 ≈ 67；
 *   岩色 #7f7c86 的立面 亮 / 灰 / 暗 ≈ 60 / 49 / 35；白甲 #e9e9e9 受光 ≈ 93。亮度阶梯：墙体 < 地面 < 单位 < 特效核心。
 */
import * as THREE from 'three';
import type { TeamId } from '../core/types';

// ───────────────────────────── 调色板 ─────────────────────────────

export interface TeamPalette {
  /** 队伍主色(光环/饰带/血条) */
  main: number;
  light: number;
  dark: number;
  /** 自发光/水晶 */
  glow: number;
  /** 建筑石材亮面 / 暗面 */
  stone: number;
  stoneDark: number;
  /** 金属饰边 */
  trim: number;
  /** 基地地台的铺地石(中明度：水晶、塔、英雄站在上面要分得出来) */
  plaza: number;
}

/**
 * 调色板(sRGB 十六进制)。第二阶段「暖石青林」：午后斜阳，受光暖、背光冷；草木收成橄榄绿到青绿，石色暖灰米，
 * 河水青碧；发光的东西少而准。明度阶梯：墙体/树冠(暗) < 可走地面(中) < 单位(亮) < 特效核心(最亮)。
 * 环境里不出现纯蓝纯红(留给队伍色)。色值出处：design/art-v2.md §2.1。
 */
export const PALETTE = {
  blue: { main: 0x3f8fff, light: 0xa8d4ff, dark: 0x1d3f9a, glow: 0x38a8ff, stone: 0xc3cde0, stoneDark: 0x8494b6, trim: 0xe8b84a, plaza: 0x8fa2c6 } as TeamPalette,
  red: { main: 0xff4b3e, light: 0xffb09a, dark: 0x8e1f1c, glow: 0xff5a36, stone: 0x5a4a50, stoneDark: 0x2e2529, trim: 0xf09a3c, plaza: 0x5a4a50 } as TeamPalette,
  neutral: { main: 0xe2c66a, light: 0xfff0b0, dark: 0x7a6230, glow: 0xffd870, stone: 0x9aa0a8, stoneDark: 0x5c626c, trim: 0xd8c690, plaza: 0x8c8a88 } as TeamPalette,
  /** 玩家自己：金绿色 */
  player: { main: 0xb6ff5c, light: 0xe6ffb0, dark: 0x4f8f1c, glow: 0xd8ff7a, stone: 0xe6ebf5, stoneDark: 0xa9b6cf, trim: 0xf0c050, plaza: 0x8fa2c6 } as TeamPalette,
  env: {
    // 光：主光暖金 / 天光(半球光上半) / 地面反光(半球光下半) / 雾与远景 / 屏幕上沿的远景薄霾
    sun: 0xffe6b4,
    sky: 0xb6d0ff,
    bounce: 0xc2ae84,
    fog: 0xcfe2f0,
    haze: 0xd7e6f5,
    horizon: 0xdff1ff,
    zenith: 0x5fa8ee,
    cloud: 0xffffff,
    cloudShade: 0xa9c4e6,
    // 草：主 / 日晒暖 / 近水冷 / 暗；崖顶草两色(比地面草暗一档)
    grass: 0x6f9d4a,
    grassWarm: 0xa3b458,
    grassCool: 0x4f8f62,
    grassDark: 0x3d7046,
    cliffGrass: 0x5a9150,
    cliffGrassLight: 0x6f9a4e,
    // 兵线石：石板 / 交替石板 / 夯土(路边) / 石缝
    lane: 0xc0b08d,
    laneAlt: 0xb0a592,
    laneDark: 0x94784f,
    laneGrout: 0x6e5a44,
    // 野区土：腐殖土亮 / 暗
    dirt: 0x8a7350,
    dirtDark: 0x6e5a44,
    sand: 0xcabf96,
    // 断崖岩：中 / 暗 / 亮 / 暖沿 / 苔
    rock: 0x7f7c86,
    rockDark: 0x5b5a68,
    rockLight: 0xa9a39f,
    rockWarm: 0xc9bfa6,
    moss: 0x5a8a52,
    // 水：浅 / 中 / 深 / 泡沫 / 焦散
    waterShallow: 0x7fe0d6,
    water: 0x2fa7c4,
    waterDeep: 0x1b6f9c,
    foam: 0xf2fffb,
    caustic: 0xc8fff0,
    // 高草(草丛)
    reed: 0x8fae4a,
    reedTip: 0xd9d98a,
    reedDark: 0x4d7a2c,
    // 树冠：中层 / 顶层亮 / 底层暗；树干
    canopy: 0x3f8f5e,
    canopyLight: 0x9ccf5a,
    canopyDark: 0x1f5f4c,
    trunk: 0x6e4d3c,
    crystal: 0x35c4ff,
    crystalDeep: 0x5a6cff,
    starGold: 0xffd67a,
    ember: 0xff7a3c,
    frost: 0x6fd0ff,
    abyss: 0xa070ff,
    // 野区点缀(故意避开纯蓝纯红)：琥珀灯果 / 荧青菌 / 紫罗兰晶 / 花白 / 花粉
    amber: 0xffb347,
    glowCyan: 0x5fe8c8,
    violet: 0xa47cff,
    petalWhite: 0xfff3e0,
    petalPink: 0xffd1e0,
    outline: 0x1b2233,
    // 光影常量：单位暗部乘色 / 岩石暗部乘色 / 受光侧暖边 / 背光侧冷边
    shadeUnit: 0xc4d0ff,
    shadeRock: 0xe6e9ff,
    rimWarm: 0xffe9c4,
    kickCool: 0xbfe2ff,
  },
} as const;

export function teamPalette(team: TeamId): TeamPalette {
  return team === 0 ? PALETTE.blue : team === 1 ? PALETTE.red : PALETTE.neutral;
}

/** sRGB 十六进制 → 线性空间 THREE.Color（uniform/顶点色都应使用线性值） */
export function linearColor(hex: THREE.ColorRepresentation): THREE.Color {
  return new THREE.Color(hex);
}

// ───────────────────────────── 全局共享 uniform ─────────────────────────────

/**
 * 立面补光系数(见 kitAmbient)：水平法线的面额外得到 地面反光色 × 这个系数 的环境光。
 * 与 lighting.ts 的 BOUNCE_GAIN 配合，把「岩石暗面」托到亮度表要求的 L* 35~40。
 */
export const SIDE_FILL = 0.45;

/** 环境染色贴图覆盖的世界半径(米)：贴图覆盖 [-64, 64]²，1 米 / texel(128²) */
export const LIGHT_TINT_EXTENT = 64;
/** 环境染色贴图 RGB → 附加辐照度的倍率 */
export const LIGHT_TINT_GAIN = 1.6;

/** 1×1 的中性染色贴图：不加色、不遮天光。主引擎不在绘制时(选人立绘、头像等独立小场景)采到的就是它 */
const NEUTRAL_LIGHT_TINT = /* @__PURE__ */ (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.name = 'moba.lightTint.neutral';
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

/**
 * 全局共享 uniform(引用同一个对象，不要 clone)：
 *   uTime / uWind          全局动画时钟与风(风向为世界 xz 平面单位向量；z = 强度 0..1.5；w = 节奏倍率)
 *   uShadeTint             暗部乘色(单位、默认的 Toon 材质)：线性空间里约 (0.55, 0.63, 1.0)，暗部压暗并偏冷紫
 *   uShadeTintGround       地表类大面积表面的暗部乘色(线性值，只偏色不压暗；把纯天光的蓝往青紫上带一点)：地表、水面、贴花读它
 *   uKickDir / uKickColor  背光侧冷色边缘光的方向(视图空间 xy，指向屏幕右上)与颜色(HDR)
 *   tLightTint             环境染色贴图(见 engine/lighttint.ts)；litUniforms() 会自动带上它和上面几项
 * 调全局的阴影色 / 冷边色只改这里一处。
 */
export const SHARED = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector4(0.82, -0.57, 1, 1) },
  uShadeTint: { value: new THREE.Color(PALETTE.env.shadeUnit) },
  uShadeTintGround: { value: new THREE.Color().setRGB(1.0, 0.95, 1.1) },
  uKickDir: { value: new THREE.Vector2(0.78, 0.62).normalize() },
  uKickColor: { value: new THREE.Color(PALETTE.env.kickCool).multiplyScalar(1.15) },
  tLightTint: { value: NEUTRAL_LIGHT_TINT as THREE.Texture },
};

/** 把环境染色贴图挂到共享 uniform 上；传 null 换回中性贴图 */
export function setSharedLightTint(tex: THREE.Texture | null): void {
  SHARED.tLightTint.value = tex ?? NEUTRAL_LIGHT_TINT;
}

/** 每帧由引擎调用一次 */
export function tickShared(dt: number): void {
  // 限幅：切后台回来时不让动画跳变过大
  SHARED.uTime.value += Math.min(dt, 0.1);
}

// ───────────────────────────── 色调映射 ─────────────────────────────

/**
 * 全工程统一的色调映射曲线：Khronos Neutral 的高光段，去掉它的暗部偏移。
 *
 * three 自带的 NeutralToneMapping 会先从三个通道里各减掉最多 0.04(低于 0.08 的部分按平方趾部压下去)——那是给产品展示图
 * 去掉 4% 菲涅尔底色用的。放在游戏里，阴影(线性值 0.03~0.1)会被压掉一半以上，而且哪个通道最小就先死哪个：
 * 偏冷的阴影红通道归零，变成又黑又艳的深蓝，谁也没法照着亮度表对色。
 * 所以这里只保留它真正有用的部分：峰值低于 0.76 时完全线性(中间调不偏色、不改饱和)，以上按峰值收拢并略去饱和
 * (石板、白石和青白色特效不再被压成一片白)。暗部是纯线性的：阴影色 = 反照率 × 环境光 × 暗部乘色，所见即所算。
 *
 * 做法是 three 官方的自定义色调映射入口：把 ShaderChunk 里 CustomToneMapping 的空实现换成我们的，
 * 渲染器选 THREE.CustomToneMapping。low 档直出(材质内映射)与走后期(FinalPass 里映射)是同一个函数。
 * 只影响选了 CustomToneMapping 的渲染器；本模块一加载就装好，重复调用无副作用。
 */
export const TONE_MAPPING = THREE.CustomToneMapping;
/**
 * 直出屏幕(low 档，没有后期)时烘在色调映射里的基础调色：与 engine.ts 里 grade 的默认值一致的 对比 / 饱和 / 自然饱和。
 * 逐像素的颜色变换放在材质里做和放在全屏通道里做结果相同(不透明物体完全一致)，所以 low 档不需要后期也能和高档同一个色调；
 * 色彩分离、薄霾、暗角这些与屏幕位置有关或可有可无的项仍只在后期里。
 */
export const BASE_GRADE = { contrast: 1.08, pivot: 0.42, saturation: 1.06, vibrance: 0.07 } as const;
const TONE_MAPPING_GLSL = /* glsl */ `vec3 CustomToneMapping( vec3 color ) {
	const float StartCompression = 0.76;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak >= StartCompression ) {
		float d = 1.0 - StartCompression;
		float newPeak = 1.0 - d * d / ( peak + d - StartCompression );
		color *= newPeak / peak;
		float g = 1.0 - 1.0 / ( Desaturation * ( peak - newPeak ) + 1.0 );
		color = mix( color, vec3( newPeak ), g );
	}
	#ifdef TONE_MAPPING
	// 只有直出屏幕的材质定义了 TONE_MAPPING：把基础调色并进来(走后期时由 FinalPass 调色)
	const float Pivot = ${Math.pow(BASE_GRADE.pivot, 2.2).toFixed(4)};
	color = Pivot * pow( max( color, vec3( 0.0 ) ) / Pivot, vec3( ${BASE_GRADE.contrast.toFixed(3)} ) );
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	float mx = max( color.r, max( color.g, color.b ) );
	float mn = min( color.r, min( color.g, color.b ) );
	color = max( mix( vec3( l ), color, ${BASE_GRADE.saturation.toFixed(3)} + ${BASE_GRADE.vibrance.toFixed(3)} * ( 1.0 - ( mx - mn ) / max( mx, 1e-4 ) ) ), vec3( 0.0 ) );
	#endif
	return color;
}`;
export function installToneMapping(): void {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  if (chunk.includes('StartCompression = 0.76')) return;
  const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  // three 换了这段源码的写法时(找不到空实现)：追加一个同名函数会重定义报错，所以只在找得到时替换；
  // 找不到就保持原样(画面退回「不做色调映射」的线性直出，偏亮但不会坏)，并在控制台留一条提示
  if (chunk.includes(stub)) THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stub, TONE_MAPPING_GLSL);
  else console.warn('[moba] 未找到 CustomToneMapping 的默认实现，色调映射未安装');
}
installToneMapping();

// ───────────────────────────── 种子随机 / CPU 噪声 ─────────────────────────────

/** mulberry32：渲染层的散布/纹理一律用它，保证每次构建结果一致 */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** 近似正态(-1..1，集中在 0) */
  gauss(): number {
    return (this.next() + this.next() + this.next()) / 1.5 - 1;
  }
}

/** 整数格点哈希 → [0,1) */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 值噪声 [0,1]。period > 0 时在该周期上可平铺(periodY 省略则两轴同周期) */
export function valueNoise2(x: number, y: number, seed = 0, period = 0, periodY = period): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const wx = (v: number): number => (period > 0 ? ((v % period) + period) % period : v);
  const wy = (v: number): number => (periodY > 0 ? ((v % periodY) + periodY) % periodY : v);
  const a = hash2(wx(x0), wy(y0), seed);
  const b = hash2(wx(x0 + 1), wy(y0), seed);
  const c = hash2(wx(x0), wy(y0 + 1), seed);
  const d = hash2(wx(x0 + 1), wy(y0 + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** 分形噪声 [0,1]。period 为第一个倍频的周期(之后每倍频翻倍，保持可平铺) */
export function fbm2(x: number, y: number, octaves = 4, seed = 0, period = 0, periodY = period): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * f, y * f, seed + i * 17, period > 0 ? period * f : 0, periodY > 0 ? periodY * f : 0);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// ───────────────────────────── 程序化纹理工具 ─────────────────────────────

export interface TextureOptions {
  /** 颜色贴图(默认 true)→ sRGB；数据/蒙版贴图传 false */
  srgb?: boolean;
  repeat?: boolean;
  mipmaps?: boolean;
  anisotropy?: number;
  /** 最近邻采样(像素化图案/查找表) */
  nearest?: boolean;
}

function applyTextureOptions(tex: THREE.Texture, o: TextureOptions): void {
  const repeat = o.repeat ?? true;
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.colorSpace = (o.srgb ?? true) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const mip = o.mipmaps ?? true;
  tex.generateMipmaps = mip;
  tex.minFilter = o.nearest ? THREE.NearestFilter : mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = o.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  tex.anisotropy = o.anisotropy ?? 4;
  tex.needsUpdate = true;
}

/** 用 2D canvas 绘制一张贴图 */
export function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: TextureOptions = {},
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2D canvas 不可用');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  applyTextureOptions(tex, opts);
  return tex;
}

/**
 * 可平铺绘制：把以 (x,y) 为中心、半径 r 的图元在跨越边界时重复绘制到对侧。
 * fn 里以 (px,py) 为中心作画。
 */
export function tileStamp(size: number, x: number, y: number, r: number, fn: (px: number, py: number) => void): void {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const px = x + ox * size;
      const py = y + oy * size;
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      fn(px, py);
    }
  }
}

/**
 * 四通道可平铺噪声贴图(数据贴图，线性)：
 * R=低频 fbm，G=中频 fbm，B=高频 fbm，A=细胞噪声(到最近特征点的距离，0 在点上)。
 */
export function makeNoiseTexture(size = 256, seed = 7): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const cells = 16;
  const pts: number[] = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push(i + hash2(i, j, seed + 91), j + hash2(i, j, seed + 92));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const o = (y * size + x) * 4;
      data[o] = fbm2(u * 4, v * 4, 4, seed, 4) * 255;
      data[o + 1] = fbm2(u * 12, v * 12, 4, seed + 31, 12) * 255;
      data[o + 2] = fbm2(u * 40, v * 40, 3, seed + 67, 40) * 255;
      const cx = u * cells;
      const cy = v * cells;
      const ix = Math.floor(cx);
      const iy = Math.floor(cy);
      let best = 9;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const gi = (ix + di + cells) % cells;
          const gj = (iy + dj + cells) % cells;
          const k = (gj * cells + gi) * 2;
          const dx = pts[k] - gi + (ix + di) - cx;
          const dy = pts[k + 1] - gj + (iy + dj) - cy;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
      }
      data[o + 3] = Math.min(1, Math.sqrt(best)) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  applyTextureOptions(tex, { srgb: false, repeat: true, mipmaps: true });
  return tex;
}

/** 一维渐变查找贴图(横向)。stops: [位置 0..1, 颜色]。颜色贴图(sRGB) */
export function makeGradientTexture(stops: [number, string][], width = 128, opts: TextureOptions = {}): THREE.CanvasTexture {
  return makeCanvasTexture(
    width,
    4,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      for (const [p, c] of stops) g.addColorStop(p, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: false, mipmaps: false, ...opts },
  );
}

/** 径向柔光斑(白色→透明)，粒子/光晕/贴花通用 */
export function makeSoftDotTexture(size = 64, power = 2): THREE.CanvasTexture {
  return makeCanvasTexture(
    size,
    size,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x + 0.5) / w - 0.5;
          const dy = (y + 0.5) / h - 0.5;
          const d = Math.min(1, Math.hypot(dx, dy) * 2);
          const a = Math.pow(1 - d, power);
          const o = (y * w + x) * 4;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
          img.data[o + 3] = a * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { repeat: false, srgb: true },
  );
}

/** 高度图(Float32，行优先) → 切线空间法线贴图(可平铺) */
export function heightToNormalTexture(height: Float32Array, size: number, strength = 2, opts: TextureOptions = {}): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      data[o] = (-dx * inv * 0.5 + 0.5) * 255;
      data[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      data[o + 2] = (inv * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  applyTextureOptions(tex, { srgb: false, repeat: true, mipmaps: true, ...opts });
  return tex;
}

const texCache = new Map<string, THREE.Texture>();
function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = texCache.get(key) as T | undefined;
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

/** 释放本模块缓存的贴图（渲染器销毁时调用） */
export function disposeSharedTextures(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  stoneField = null;
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

interface StoneField {
  size: number;
  /** 石面明暗(0.5 = 中性，含倒角高光/裂纹) */
  tone: Float32Array;
  /** 1 = 石面，0 = 缝隙(边缘抗锯齿) */
  mask: Float32Array;
  /** 每块石头一个随机值(0.06..1) */
  id: Float32Array;
}

let stoneField: StoneField | null = null;

/** 碎拼石板的逐像素数据：改良的 Voronoi(偏方正)，可平铺 */
function buildStoneField(): StoneField {
  if (stoneField) return stoneField;
  const size = 512;
  const cells = 7;
  const rng = new Rng(4127);
  const px: number[] = [];
  const py: number[] = [];
  const tone0: number[] = [];
  const id0: number[] = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      px.push(i + 0.5 + rng.range(-0.34, 0.34));
      py.push(j + 0.5 + rng.range(-0.34, 0.34));
      tone0.push(rng.range(-1, 1));
      id0.push(rng.range(0.06, 1));
    }
  }
  const tone = new Float32Array(size * size);
  const mask = new Float32Array(size * size);
  const id = new Float32Array(size * size);
  // 主光来自西南上方：贴图空间里 (-x, +y) 朝向光
  const lx = -0.62;
  const ly = 0.78;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = (x / size) * cells;
      const cy = (y / size) * cells;
      const ix = Math.floor(cx);
      const iy = Math.floor(cy);
      let f1 = 9;
      let f2 = 9;
      let bi = 0;
      let bdx = 0;
      let bdy = 0;
      let sdx = 0;
      let sdy = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const gi = (ix + di + cells) % cells;
          const gj = (iy + dj + cells) % cells;
          const k = gj * cells + gi;
          const ddx = px[k] - gi + (ix + di) - cx;
          const ddy = py[k] - gj + (iy + dj) - cy;
          // 介于欧氏与切比雪夫之间的度量：石板更方正
          const dist = Math.hypot(ddx, ddy) * 0.5 + Math.max(Math.abs(ddx), Math.abs(ddy)) * 0.5;
          if (dist < f1) {
            f2 = f1;
            sdx = bdx;
            sdy = bdy;
            f1 = dist;
            bi = k;
            bdx = ddx;
            bdy = ddy;
          } else if (dist < f2) {
            f2 = dist;
            sdx = ddx;
            sdy = ddy;
          }
        }
      }
      const edge = f2 - f1; // 0 在缝上
      const o = y * size + x;
      const n = fbm2((x / size) * 20, (y / size) * 20, 2, 5, 20);
      const n2 = valueNoise2((x / size) * 64, (y / size) * 64, 9, 64);
      const groutW = 0.034 + (n - 0.5) * 0.016;
      mask[o] = Math.min(1, Math.max(0, (edge - groutW) / 0.018));
      id[o] = id0[bi];
      // 倒角：朝光的边提亮、背光的边压暗
      const bevel = 1 - Math.min(1, Math.max(0, (edge - groutW) / 0.15));
      let gx = sdx - bdx;
      let gy = sdy - bdy;
      const gl = Math.hypot(gx, gy) || 1;
      gx /= gl;
      gy /= gl;
      const facing = gx * lx + gy * ly;
      let v = 0.5 + tone0[bi] * 0.05 + (n - 0.5) * 0.1 + (n2 - 0.5) * 0.05;
      v += bevel * bevel * facing * 0.13 - bevel * 0.02;
      // 偶尔的裂纹
      if (edge > 0.12) {
        const crack = fbm2((x / size) * 8 + tone0[bi] * 7, (y / size) * 8, 2, 77 + bi, 8);
        if (Math.abs(crack - 0.5) < 0.01) v -= 0.1;
      }
      tone[o] = v;
    }
  }
  stoneField = { size, tone, mask, id };
  return stoneField;
}

/**
 * 可平铺「碎拼石板」颜色贴图(sRGB，不带透明)：浅色石板 + 深色缝隙，带朝向主光的手绘倒角。
 * 建议每 8 米平铺一次；中性偏暖，使用时再乘上想要的石色(乘数约 ×1.3)。
 */
export function getStoneTexture(): THREE.CanvasTexture {
  return cached('stone', () =>
    makeCanvasTexture(
      512,
      512,
      (ctx, w) => {
        const f = buildStoneField();
        const img = ctx.createImageData(w, w);
        const d = img.data;
        for (let i = 0; i < w * w; i++) {
          const v = (f.tone[i] * 1.56 * f.mask[i] + 0.36 * (1 - f.mask[i])) * 255;
          const warm = f.id[i];
          d[i * 4] = clamp255(v * (1.0 + warm * 0.02));
          d[i * 4 + 1] = clamp255(v * (0.965 - warm * 0.012));
          d[i * 4 + 2] = clamp255(v * (0.9 - warm * 0.04));
          d[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      },
      { repeat: true, anisotropy: 8 },
    ),
  );
}

/**
 * 同一套石板的数据贴图(线性)：R = 石面明暗(0.5 = 乘数 1)，G = 石面蒙版(缝隙为 0)，B = 每块石头的随机 id。
 * 地表 shader 用它做「越靠路边石板越稀疏」的整块剔除。
 */
export function getStoneDataTexture(): THREE.DataTexture {
  return cached('stoneData', () => {
    const f = buildStoneField();
    const n = f.size * f.size;
    const data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4] = clamp255(f.tone[i] * 255);
      data[i * 4 + 1] = clamp255(f.mask[i] * 255);
      data[i * 4 + 2] = clamp255(f.id[i] * 255);
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, f.size, f.size, THREE.RGBAFormat, THREE.UnsignedByteType);
    applyTextureOptions(tex, { srgb: false, repeat: true, mipmaps: true, anisotropy: 8 });
    return tex;
  });
}

/**
 * 可平铺岩石肌理(中性灰)：横向岩层 + 斑驳 + 手绘笔触。不需要 uv：配合 createToonMaterial 的 triplanar 选项按世界坐标投影，
 * 再乘上顶点色/基础色(mapGain 取 1.75 左右把均值拉回 1)。
 */
export function getRockTexture(): THREE.CanvasTexture {
  return cached('rock', () =>
    makeCanvasTexture(
      256,
      256,
      (ctx, w) => {
        const size = w;
        const img = ctx.createImageData(size, size);
        const d = img.data;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            const warp = fbm2(u * 4, v * 4, 3, 3, 4);
            // 岩层：沿 v 方向的条带，被低频噪声扭曲
            const band = fbm2(u * 2 + warp * 0.6, v * 9 + warp * 1.6, 3, 11, 2, 9);
            const strata = Math.abs(((v * 7 + warp * 1.4) % 1) - 0.5);
            let g = 196 + (band - 0.5) * 56;
            if (strata < 0.04) g -= 18 * (1 - strata / 0.04);
            const fine = fbm2(u * 48, v * 48, 2, 23, 48);
            g += (fine - 0.5) * 30;
            const o = (y * size + x) * 4;
            d[o] = clamp255(g);
            d[o + 1] = clamp255(g * 0.985);
            d[o + 2] = clamp255(g * 1.0);
            d[o + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        // 手绘感的亮边笔触
        const rng = new Rng(99);
        ctx.lineCap = 'round';
        for (let i = 0; i < 46; i++) {
          const x = rng.range(0, size);
          const y = rng.range(0, size);
          const len = rng.range(10, 42);
          const a = rng.range(-0.25, 0.25);
          ctx.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.16)' : 'rgba(40,44,60,0.14)';
          ctx.lineWidth = rng.range(1, 2.6);
          tileStamp(size, x, y, len, (qx, qy) => {
            ctx.beginPath();
            ctx.moveTo(qx - Math.cos(a) * len * 0.5, qy - Math.sin(a) * len * 0.5);
            ctx.lineTo(qx + Math.cos(a) * len * 0.5, qy + Math.sin(a) * len * 0.5);
            ctx.stroke();
          });
        }
      },
      { repeat: true, anisotropy: 4 },
    ),
  );
}

// ───────────────────────────── GLSL 片段 ─────────────────────────────

/** 通用噪声函数：hash12 / hash22 / vnoise(值噪声) / fbm(4 倍频) */
export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s / 0.9375;
}
`;

/** 风摆位移：uniform uTime/uWind 已声明时可用。w = 权重(0 不动) */
export const GLSL_WIND = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
vec3 windOffset(vec3 wp, float w) {
  float t = uTime * uWind.w;
  float phase = dot(wp.xz, uWind.xy) * 0.42;
  float gust = sin(t * 1.25 - phase) * 0.55 + sin(t * 2.9 - phase * 2.1 + wp.x * 0.61) * 0.3 + 0.35;
  float flutter = sin(t * 6.3 + wp.x * 3.3 + wp.z * 2.7) * 0.12;
  float cross = sin(t * 1.9 + wp.x * 0.9 - wp.z * 1.3) * 0.25;
  vec2 d = (uWind.xy * (gust + flutter) + vec2(-uWind.y, uWind.x) * cross) * uWind.z * w;
  return vec3(d.x, -dot(d, d) * 0.35, d.y);
}
`;

/** 屏幕空间有序抖动阈值(0..1)，用于抖动淡出 */
export const GLSL_DITHER = /* glsl */ `
float ditherThreshold(vec2 fragCoord) {
  return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}
`;

/**
 * 自定义受光 shader 的公共头(片元)：引入 three 的灯光/阴影/雾定义，并提供
 *   vec3 kitAmbient(vec3 N)                 —— 环境 + 半球光辐照度(含立面补光：水平法线多吃一份地面反光)
 *   float kitShadow()                       —— 主光阴影(0..1)
 *   vec3 kitSunDir() / vec3 kitSunColor()   —— 视图空间主光方向 / 颜色
 *   vec3 kitPointLights(vec3 N, vec3 viewPos) —— 所有点光(技能闪光)的平滑漫反射辐照度
 * 需要 varying：vViewPosition(= -mvPosition.xyz)。材质要 lights:true, fog:true。
 */
export const GLSL_LIGHT_PARS_FRAGMENT = /* glsl */ `
#define KIT_SIDE_FILL ${SIDE_FILL.toFixed(3)}
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
vec3 kitAmbient(vec3 N) {
  vec3 irr = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
    irr += getHemisphereLightIrradiance(hemisphereLights[i], N);
  }
  // 立面补光：法线越接近水平，多吃一份地面反光(被太阳晒亮的地面与对面的墙弹回来的暖光)。
  // 朝上的面(地表、台面)和朝下的面不受影响——只把岩壁、建筑和角色的背光立面托起来，暗面不发黑
  float ny = dot(N, hemisphereLights[0].direction);
  irr += hemisphereLights[0].groundColor * (KIT_SIDE_FILL * (1.0 - ny * ny));
  #endif
  return irr;
}
float kitShadow() {
  return getShadowMask();
}
vec3 kitSunDir() {
  #if NUM_DIR_LIGHTS > 0
  return directionalLights[0].direction;
  #else
  return normalize(vec3(-0.4, 0.8, 0.45));
  #endif
}
vec3 kitSunColor() {
  #if NUM_DIR_LIGHTS > 0
  return directionalLights[0].color;
  #else
  return vec3(0.0);
  #endif
}
vec3 kitPointLights(vec3 N, vec3 viewPos) {
  vec3 sum = vec3(0.0);
  #if NUM_POINT_LIGHTS > 0
  IncidentLight pl;
  for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
    getPointLightInfo(pointLights[i], viewPos, pl);
    sum += pl.color * (dot(N, pl.direction) * 0.6 + 0.4);
  }
  #endif
  return sum;
}
`;

/** 自定义受光 shader 的公共头(顶点)。之后在 main 里按 KIT_VERTEX_MAIN 的顺序写 */
export const GLSL_LIGHT_PARS_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
`;

/**
 * 顶点 main 尾段：输入 `vec3 objectNormal`(物体空间法线) 与 `vec4 worldPosition`(世界坐标，已含实例矩阵/位移)，
 * 输出 gl_Position、vViewPosition、阴影坐标、雾深度，并定义 transformedNormal(视图空间)。
 */
export const GLSL_LIGHT_VERTEX_TAIL = /* glsl */ `
#include <defaultnormal_vertex>
vec4 mvPosition = viewMatrix * worldPosition;
gl_Position = projectionMatrix * mvPosition;
vViewPosition = -mvPosition.xyz;
#include <shadowmap_vertex>
#include <fog_vertex>
`;

/**
 * `vec3 kitAdditive(vec3 c)`：叠加类发光在输出前过一遍。
 * 走后期(HDR 目标)时原样返回；low 档直出屏幕时混合发生在 gamma 空间，同样的线性数值会亮得多，
 * 这里把它预先压到等效观感(只有直出屏幕时 three 才定义 TONE_MAPPING，借它区分两条路径)。
 * 返回值之后还要过一遍色调映射与 sRGB 编码，所以这里给的是「期望的显示增量」的 2.2 次方。
 */
export const GLSL_ADDITIVE = /* glsl */ `
vec3 kitAdditive(vec3 c) {
  #ifdef TONE_MAPPING
  // 目标是「在 gamma 空间直接加上去」之后，观感接近 HDR 路径里「线性相加再色调映射」。后者在亮背景上其实加不了多少
  // (沙石地面上 1.0 的线性叠加只让显示值涨 0.2 出头)，所以这里把叠加量做成饱和曲线：显示值的增量最多 0.68，
  // 小数值基本线性。否则团战里几层辉光一叠就是一块死白，把英雄整个盖住(low 档又没有 bloom 来柔化边缘)。
  vec3 d = 0.68 * (1.0 - exp(-0.9 * max(c, vec3(0.0))));
  return pow(d, vec3(2.2));
  #else
  return c;
  #endif
}
`;

/** 片元 main 结尾：色调映射 → 输出色彩空间 → 雾（与内置材质顺序一致） */
export const GLSL_OUTPUT_FRAGMENT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
`;

/**
 * 背光侧冷色边缘光的形状函数：`float kitKick(vec3 N, vec3 V, vec2 dir)`，N / V 为视图空间的法线与视线方向。
 * 返回 0..1：一道贴着轮廓、宽度约为半径一成多的硬边亮带(卡通式的轮廓光，不是又细又虚的菲涅尔)，
 * 只出现在法线朝 dir(屏幕右上)的那一侧。调用方再乘「不受光」的权重、强度与 uKickColor。
 */
export const GLSL_KICK = /* glsl */ `
float kitKick(vec3 N, vec3 V, vec2 dir) {
  float edge = smoothstep(0.42, 0.64, 1.0 - saturate(dot(N, V)));
  return edge * smoothstep(0.05, 0.6, dot(N.xy, dir));
}
`;

/**
 * 环境染色贴图的采样片段(顶点、片元着色器都能用)：
 *   vec4 kitLightTint(vec2 worldXZ)            —— rgb = 附加的彩色环境光(未乘增益)，a = 天空光可见度
 *   vec3 kitTintAmbient(vec3 ambient, vec4 lt) —— ambient * lt.a + lt.rgb * KIT_LIGHT_TINT_GAIN
 * 用法：`vec4 lt = kitLightTint(vWorldPos.xz); vec3 irr = kitTintAmbient(kitAmbient(N) * ao, lt) + 主光…`
 * uniform tLightTint 由 litUniforms() 自动提供；没走 litUniforms 的材质自己加 `tLightTint: SHARED.tLightTint`。
 */
export const GLSL_LIGHT_TINT = /* glsl */ `
#define KIT_LIGHT_TINT_GAIN ${LIGHT_TINT_GAIN.toFixed(2)}
uniform sampler2D tLightTint;
vec4 kitLightTint(vec2 worldXZ) {
  return texture2D(tLightTint, worldXZ * ${(0.5 / LIGHT_TINT_EXTENT).toFixed(8)} + 0.5);
}
vec3 kitTintAmbient(vec3 ambient, vec4 lt) {
  return ambient * lt.a + lt.rgb * KIT_LIGHT_TINT_GAIN;
}
`;

/**
 * 合并 three 的灯光/雾 uniform 与自定义 uniform（自定义项保持引用，不被克隆）。
 * 同时带上全局共享的光影 uniform：tLightTint / uShadeTintGround / uKickDir / uKickColor
 * (着色器里声明了同名 uniform 就能直接用；custom 里的同名项优先)。
 * 注意：用它建出来的材质不要调 three 自带的 material.clone()——那会把共享 uniform(含环境染色贴图)拷成各自的副本，
 * 之后全局改动就传不到副本上。需要第二份材质时重新构造一个(ToonMaterial.clone() 已经这样处理)。
 */
export function litUniforms(custom: Record<string, THREE.IUniform>): Record<string, THREE.IUniform> {
  return {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    tLightTint: SHARED.tLightTint,
    uShadeTintGround: SHARED.uShadeTintGround,
    uKickDir: SHARED.uKickDir,
    uKickColor: SHARED.uKickColor,
    ...custom,
  };
}

// ───────────────────────────── 风格化受光材质 ─────────────────────────────

export interface ToonMaterialOptions {
  /** 基础色(与顶点色、贴图相乘)。默认白 */
  color?: THREE.ColorRepresentation;
  /** 颜色贴图(需要 uv 属性) */
  map?: THREE.Texture | null;
  /** 贴图 uv 缩放 */
  mapScale?: number;
  /** > 0：不用 uv，按世界坐标三向投影采样 map(值 = 每米的贴图重复数)。适合岩石/石材这类没有展 uv 的合并几何 */
  triplanar?: number;
  /** 贴图亮度增益(中性灰贴图常用 1.6~2 把均值拉回 1)。默认 1 */
  mapGain?: number;
  /** true：aFx.z 不再是队伍色蒙版，而是「贴图强度」(0 = 不叠贴图，1 = 全强度)。地形用它让岩面有肌理、草顶保持干净 */
  mapMask?: boolean;
  /**
   * 顶面贴图：法线朝上(世界 y > 0.55~0.8 过渡)的片元按世界 xz 平铺采样这张贴图并乘到底色上，让崖顶/台面与地面草地用同一套纹理。
   * mapMask 模式下还会乘 (1 - aFx.z)：岩面(aFx.z 高)不受影响。贴图应是均值约 0.47 的中性明暗贴图(如地表草贴图)。
   */
  mapTop?: THREE.Texture | null;
  /** 顶面贴图每米的重复数。默认 0.1(与地表草贴图一致：10 米一铺) */
  mapTopScale?: number;
  /** 顶面贴图亮度增益。默认 2.1(把均值 0.47 的贴图拉回 1，不改变整体明度) */
  mapTopGain?: number;
  /** 顶面的大块色斑(日晒发黄 / 背阴发青)强度 0..1。默认 1 */
  mapTopPatch?: number;
  /** 色斑用的噪声贴图(makeNoiseTexture 的四通道噪声，R/G 两个通道)。不给时用解析的低频波纹代替 */
  mapTopNoise?: THREE.Texture | null;
  /** 顶面细节(第二尺度采样 + 色斑)。默认 true；low 档传 false(只采一次)，也可以之后调 setMapTopDetail() */
  mapTopDetail?: boolean;
  vertexColors?: boolean;
  /** 自发光颜色与强度(强度 > 1 会触发 bloom) */
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  /** aFx.y 的自发光倍率(底色 × aFx.y × glowBoost)。默认 3 */
  glowBoost?: number;
  /** 明暗阶数：1 = 平滑(植被)，2 = 明/暗两阶(默认)，3 = 明/中/暗三阶(角色、岩石、建筑) */
  steps?: 1 | 2 | 3;
  /**
   * 三阶明暗的自定义阈值 [暗→灰的 N·L 阈值, 灰→亮的 N·L 阈值, 灰阶亮度 0..1]。给了它就按三阶算(steps 不用再传)。
   * 岩石/建筑/构件用 [0.05, 0.42, 0.55] 配 softness 0.10：在主光方向下 顶面 / 西立面 = 亮，朝镜头的南立面 = 灰，东立面 = 暗。
   */
  ramp?: [number, number, number];
  /** 阶梯边缘柔和度 0.02(硬)..0.3(软)。默认 0.08 */
  softness?: number;
  /** 暗部乘色。不传 = 跟随全局 SHARED.uShadeTint(#c4d0ff)；岩石用 PALETTE.env.shadeRock(#d2d8ff) */
  shadeTint?: THREE.ColorRepresentation;
  /** 轮廓光(受光侧暖边)强度(0 关闭)、颜色、指数 */
  rim?: number;
  rimColor?: THREE.ColorRepresentation;
  rimPower?: number;
  /** 背光侧冷色边缘光强度(0 = 关，默认)：只出现在朝屏幕右上、且不受光的轮廓上，把暗面和地面分开。岩石 0.10，建筑 0.3 */
  kicker?: number;
  /** 风格化高光强度(0 关闭) 与锐度 */
  specular?: number;
  gloss?: number;
  /** 按面着色(岩石/晶体的切面感) */
  flat?: boolean;
  /** 队伍色(作用在 aFx.z 蒙版上) */
  teamColor?: THREE.ColorRepresentation;
  /** 风摆幅度(米)。权重取 aFx.x；windByHeight 时改用物体空间高度 y × 该系数 */
  wind?: number;
  windByHeight?: number;
  /** 是否读取 aFx 顶点属性(默认 true；几何体没有该属性时等价于 0,0,0,1) */
  fx?: boolean;
  /** 是否采样环境染色贴图(发光体/基地/河道对周围的染色 + 树冠下的天光遮蔽)。默认 true */
  lightTint?: boolean;
  side?: THREE.Side;
  /** 双面材质的背面是否翻转法线(默认 true)。薄叶片(草簇/蕨/花)传 false：两面同一个法线，背面不会掉进暗部 */
  flipBackNormals?: boolean;
  /** 真透明混合(默认 false：淡出用抖动镂空) */
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  alphaTest?: number;
  /** 是否受雾影响(默认 true) */
  fog?: boolean;
  /** 多边形偏移(贴地物防 z-fighting) */
  polygonOffset?: number;
}

/** 每个单位一份的逐对象参数（见文件头用法） */
export interface ToonParams {
  /** 受击闪白 0..1 */
  flash: number;
  flashColor: THREE.Color;
  /** 不透明度 0..1 */
  opacity: number;
  /** 队伍色 */
  teamColor: THREE.Color;
  /** 整体染色(乘在底色上，如石化/冰冻/死亡变灰) */
  tint: THREE.Color;
}

export function createToonParams(): ToonParams {
  return { flash: 0, flashColor: new THREE.Color(1, 1, 1), opacity: 1, teamColor: new THREE.Color(1, 1, 1), tint: new THREE.Color(1, 1, 1) };
}

/** 把 params 绑定到 root 下所有使用 ToonMaterial 的网格上 */
export function bindToonParams(root: THREE.Object3D, params: ToonParams): void {
  root.traverse((o) => {
    o.userData.toon = params;
  });
}

const TOON_VERTEX = /* glsl */ `
${GLSL_LIGHT_PARS_VERTEX}
#include <color_pars_vertex>
${GLSL_WIND}
uniform float uSway;
uniform float uSwayHeight;
#ifdef TOON_FX
attribute vec4 aFx;
#endif
varying vec4 vFx;
varying vec3 vNormal;
varying vec3 vViewPosition;
#ifdef TOON_MAP
uniform float uMapScale;
varying vec2 vUv;
#endif
#ifdef TOON_WORLD_POS
varying vec3 vWorldPos;
#endif
void main() {
  #include <color_vertex>
  #ifdef TOON_FX
  vFx = aFx;
  #else
  vFx = vec4(0.0, 0.0, 0.0, 1.0);
  #endif
  #ifdef TOON_MAP
  vUv = uv * uMapScale;
  #endif
  vec3 objectNormal = normal;
  vec4 worldPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  worldPosition = instanceMatrix * worldPosition;
  #endif
  worldPosition = modelMatrix * worldPosition;
  #ifdef TOON_WIND
  worldPosition.xyz += windOffset(worldPosition.xyz, uSway * (vFx.x + max(position.y, 0.0) * uSwayHeight));
  #endif
  #ifdef TOON_WORLD_POS
  vWorldPos = worldPosition.xyz;
  #endif
  ${GLSL_LIGHT_VERTEX_TAIL}
  vNormal = normalize(transformedNormal);
}
`;

const TOON_FRAGMENT = /* glsl */ `
${GLSL_LIGHT_PARS_FRAGMENT}
#include <color_pars_fragment>
${GLSL_DITHER}
${GLSL_KICK}
#ifdef TOON_LIGHT_TINT
${GLSL_LIGHT_TINT}
#endif
uniform vec3 uColor;
uniform vec3 uTint;
uniform float uOpacity;
uniform vec3 uEmissive;
uniform float uGlowBoost;
uniform vec4 uRamp;
uniform vec3 uShadeTint;
uniform vec3 uRimColor;
uniform vec2 uRim;
uniform vec2 uSpec;
uniform vec3 uTeamColor;
uniform float uFlash;
uniform vec3 uFlashColor;
#ifdef TOON_KICKER
uniform float uKick;
uniform vec2 uKickDir;
uniform vec3 uKickColor;
#endif
#ifdef TOON_MAP
uniform sampler2D tMap;
varying vec2 vUv;
#endif
#ifdef TOON_TRIPLANAR
uniform sampler2D tMap;
uniform float uTriScale;
#endif
#ifdef TOON_MAP_TOP
uniform sampler2D tMapTop;
uniform vec3 uMapTop;
#ifdef TOON_MAP_TOP_NOISE
uniform sampler2D tMapTopNoise;
#endif
#endif
#ifdef TOON_WORLD_POS
varying vec3 vWorldPos;
#endif
uniform float uMapGain;
varying vec4 vFx;
varying vec3 vNormal;
varying vec3 vViewPosition;

float toonRamp(float ndl) {
  #if TOON_STEPS == 1
  float h = ndl * 0.5 + 0.5;
  return h * h;
  #elif TOON_STEPS == 2
  return smoothstep(uRamp.x - uRamp.w, uRamp.x + uRamp.w, ndl);
  #else
  float a = smoothstep(uRamp.x - uRamp.w, uRamp.x + uRamp.w, ndl);
  float b = smoothstep(uRamp.y - uRamp.w, uRamp.y + uRamp.w, ndl);
  return a * uRamp.z + b * (1.0 - uRamp.z);
  #endif
}

void main() {
  #ifdef TOON_FLAT
  vec3 N = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  #else
  vec3 N = normalize(vNormal);
  #if defined(DOUBLE_SIDED) && !defined(TOON_KEEP_BACK_NORMALS)
  N *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  #endif

  vec4 base = vec4(uColor, uOpacity);
  #ifdef USE_COLOR
  base.rgb *= vColor.rgb;
  #endif
  #ifdef TOON_MAP
  vec4 texel = texture2D(tMap, vUv);
  base *= vec4(texel.rgb * uMapGain, texel.a);
  #endif
  #if defined(TOON_TRIPLANAR) || defined(TOON_MAP_TOP)
  vec3 Nw = inverseTransformDirection(N, viewMatrix);
  #endif
  #ifdef TOON_TRIPLANAR
  vec3 tw = abs(Nw);
  tw = tw * tw * tw * tw;
  tw /= tw.x + tw.y + tw.z;
  vec3 tp = vWorldPos * uTriScale;
  vec3 triTex = (texture2D(tMap, tp.zy).rgb * tw.x + texture2D(tMap, tp.xz).rgb * tw.y + texture2D(tMap, tp.xy).rgb * tw.z) * uMapGain;
  #ifdef TOON_MAP_MASK
  base.rgb *= mix(vec3(1.0), triTex, vFx.z);
  #else
  base.rgb *= triTex;
  #endif
  #endif
  #ifdef TOON_MAP_TOP
  // 顶面：按世界 xz 平铺的草贴图 + 大块色斑(与地表草地同一套做法，崖顶和地面连成一片)
  // 过渡放在 0.32~0.6：崖顶中轴线附近隆起处的斜面(法线 y 0.6~0.8)也铺满草贴图，不再是一块块没有纹理的浅色三角；
  // 竖直的岩面本来就被 aFx.z 蒙版挡在外面
  float topW = smoothstep(0.32, 0.6, Nw.y);
  #ifdef TOON_MAP_MASK
  topW *= 1.0 - vFx.z;
  #endif
  vec2 tuv = vWorldPos.xz * uMapTop.x;
  vec3 tg = texture2D(tMapTop, tuv).rgb * uMapTop.y;
  #ifdef TOON_MAP_TOP_DETAIL
  tg *= texture2D(tMapTop, vec2(tuv.y, -tuv.x) * 0.371 + 0.4).rgb * 0.8 + 0.62;
  #ifdef TOON_MAP_TOP_NOISE
  vec2 tn = texture2D(tMapTopNoise, vWorldPos.xz * 0.0213).rg;
  #else
  vec2 tn = 0.5 + 0.5 * vec2(sin(vWorldPos.x * 0.13 + sin(vWorldPos.z * 0.11) * 1.7), sin(vWorldPos.z * 0.17 - vWorldPos.x * 0.09 + 1.3));
  #endif
  vec3 topTint = mix(vec3(0.84, 0.97, 1.06), vec3(1.0), smoothstep(0.34, 0.62, tn.x));
  // 日晒那一档往橄榄收(不再发黄)，幅度减半
  topTint = mix(topTint, vec3(1.08, 1.04, 0.84), smoothstep(0.5, 0.74, tn.y) * 0.5);
  tg *= mix(vec3(1.0), topTint, uMapTop.z);
  #endif
  base.rgb *= mix(vec3(1.0), tg, topW);
  // 崖顶草向灰收一点：贴图乘上顶点色之后饱和度比色表高一截(实测 0.6 上下)，崖顶是画框，不该比场内的草还艳
  base.rgb = mix(base.rgb, vec3(dot(base.rgb, vec3(0.2126, 0.7152, 0.0722))), topW * 0.16);
  #endif
  #ifdef TOON_MAP_MASK
  base.rgb *= uTint;
  #else
  base.rgb = mix(base.rgb, uTeamColor, vFx.z) * uTint;
  #endif
  #ifdef ALPHATEST
  if (base.a < ALPHATEST) discard;
  #endif
  #ifdef TOON_DITHER_FADE
  if (base.a < 0.995) {
    if (base.a <= ditherThreshold(gl_FragCoord.xy)) discard;
  }
  base.a = 1.0;
  #endif

  vec3 V = normalize(vViewPosition);
  vec3 L = kitSunDir();
  float ndl = dot(N, L);
  float lit = toonRamp(ndl) * kitShadow();
  vec3 sun = kitSunColor();

  vec3 amb = kitAmbient(N);
  #ifdef TOON_LIGHT_TINT
  amb = kitTintAmbient(amb, kitLightTint(vWorldPos.xz));
  #endif
  vec3 irradiance = amb * vFx.w + sun * lit + kitPointLights(N, -vViewPosition);
  vec3 col = base.rgb * RECIPROCAL_PI * irradiance;
  col *= mix(uShadeTint, vec3(1.0), lit);

  // 轮廓光：受光侧暖边(暗部只留一点)
  float fres = pow(1.0 - saturate(dot(N, V)), uRim.y);
  col += uRimColor * (fres * uRim.x * (0.3 + 0.7 * lit));
  #ifdef TOON_KICKER
  // 背光侧冷边：只在朝屏幕右上、且不受光的轮廓上出现，把暗面从地面上分出来
  col += uKickColor * (kitKick(N, V, uKickDir) * (1.0 - 0.6 * lit) * uKick);
  #endif

  #ifdef TOON_SPECULAR
  vec3 H = normalize(L + V);
  float sp = pow(saturate(dot(N, H)), uSpec.y);
  col += sun * RECIPROCAL_PI * smoothstep(0.42, 0.58, sp) * uSpec.x * lit;
  #endif

  col += uEmissive + base.rgb * (vFx.y * uGlowBoost);
  col = mix(col, uFlashColor * 1.8, uFlash);

  gl_FragColor = vec4(col, base.a);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export class ToonMaterial extends THREE.ShaderMaterial {
  readonly isToonMaterial = true;
  private opts: ToonMaterialOptions;

  constructor(opts: ToonMaterialOptions = {}) {
    super();
    this.opts = { ...opts };
    const steps = opts.ramp ? 3 : (opts.steps ?? 2);
    const soft = opts.softness ?? 0.08;
    const emissive = new THREE.Color(opts.emissive ?? 0x000000).multiplyScalar(opts.emissive !== undefined ? (opts.emissiveIntensity ?? 1) : 0);
    // x/y = 暗→中 / 中→亮 的 N·L 阈值，z = 中间调亮度，w = 柔和度
    const ramp = opts.ramp ? new THREE.Vector4(opts.ramp[0], opts.ramp[1], opts.ramp[2], soft) : new THREE.Vector4(steps === 3 ? -0.08 : 0.06, 0.5, 0.58, soft);
    this.uniforms = litUniforms({
      uTime: SHARED.uTime,
      uWind: SHARED.uWind,
      uSway: { value: opts.wind ?? 0 },
      uSwayHeight: { value: opts.windByHeight ?? 0 },
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: opts.opacity ?? 1 },
      uEmissive: { value: emissive },
      uGlowBoost: { value: opts.glowBoost ?? 3 },
      uRamp: { value: ramp },
      // 没指定暗部色的材质共用全局那一个(引用同一个 uniform 对象：改 SHARED.uShadeTint 即全体生效)
      uShadeTint: opts.shadeTint !== undefined ? { value: new THREE.Color(opts.shadeTint) } : SHARED.uShadeTint,
      uRimColor: { value: new THREE.Color(opts.rimColor ?? PALETTE.env.rimWarm) },
      uRim: { value: new THREE.Vector2(opts.rim ?? 0.25, opts.rimPower ?? 3) },
      uKick: { value: opts.kicker ?? 0 },
      uSpec: { value: new THREE.Vector2(opts.specular ?? 0, opts.gloss ?? 40) },
      uTeamColor: { value: new THREE.Color(opts.teamColor ?? 0xffffff) },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      tMap: { value: opts.map ?? null },
      uMapScale: { value: opts.mapScale ?? 1 },
      uTriScale: { value: opts.triplanar ?? 0 },
      uMapGain: { value: opts.mapGain ?? 1 },
      tMapTop: { value: opts.mapTop ?? null },
      tMapTopNoise: { value: opts.mapTopNoise ?? null },
      // x = 每米重复数，y = 亮度增益，z = 色斑强度
      uMapTop: { value: new THREE.Vector3(opts.mapTopScale ?? 0.1, opts.mapTopGain ?? 2.1, opts.mapTopPatch ?? 1) },
    });
    const defines: Record<string, string | number> = { TOON_STEPS: steps };
    const tri = !!opts.map && (opts.triplanar ?? 0) > 0;
    const lightTint = opts.lightTint ?? true;
    if (opts.fx ?? true) defines.TOON_FX = '';
    if (tri) defines.TOON_TRIPLANAR = '';
    else if (opts.map) defines.TOON_MAP = '';
    if (opts.mapMask) defines.TOON_MAP_MASK = '';
    if (opts.mapTop) {
      defines.TOON_MAP_TOP = '';
      if (opts.mapTopDetail ?? true) defines.TOON_MAP_TOP_DETAIL = '';
      if (opts.mapTopNoise) defines.TOON_MAP_TOP_NOISE = '';
    }
    if (lightTint) defines.TOON_LIGHT_TINT = '';
    if (tri || opts.mapTop || lightTint) defines.TOON_WORLD_POS = '';
    if (opts.flat) defines.TOON_FLAT = '';
    if (opts.flipBackNormals === false) defines.TOON_KEEP_BACK_NORMALS = '';
    if ((opts.wind ?? 0) > 0) defines.TOON_WIND = '';
    if ((opts.specular ?? 0) > 0) defines.TOON_SPECULAR = '';
    if ((opts.kicker ?? 0) > 0) defines.TOON_KICKER = '';
    if (!opts.transparent) defines.TOON_DITHER_FADE = '';
    this.defines = defines;
    this.vertexShader = TOON_VERTEX;
    this.fragmentShader = TOON_FRAGMENT;
    this.lights = true;
    this.fog = opts.fog ?? true;
    this.vertexColors = opts.vertexColors ?? false;
    this.side = opts.side ?? THREE.FrontSide;
    this.transparent = opts.transparent ?? false;
    if (opts.depthWrite !== undefined) this.depthWrite = opts.depthWrite;
    if (opts.alphaTest) this.alphaTest = opts.alphaTest;
    if (opts.polygonOffset) {
      this.polygonOffset = true;
      this.polygonOffsetFactor = -opts.polygonOffset;
      this.polygonOffsetUnits = -opts.polygonOffset;
    }
  }

  get color(): THREE.Color {
    return this.uniforms.uColor.value as THREE.Color;
  }
  get emissive(): THREE.Color {
    return this.uniforms.uEmissive.value as THREE.Color;
  }
  get teamColor(): THREE.Color {
    return this.uniforms.uTeamColor.value as THREE.Color;
  }
  get tint(): THREE.Color {
    return this.uniforms.uTint.value as THREE.Color;
  }
  get rimColor(): THREE.Color {
    return this.uniforms.uRimColor.value as THREE.Color;
  }
  /** 受击闪白 0..1（未绑定 ToonParams 的对象使用此值） */
  get flash(): number {
    return this.baseFlash;
  }
  set flash(v: number) {
    this.baseFlash = v;
    this.uniforms.uFlash.value = v;
  }
  /** 不透明度 0..1（未绑定 ToonParams 的对象使用此值）。注意不要与 Material.opacity 混淆 */
  get fade(): number {
    return this.baseFade;
  }
  set fade(v: number) {
    this.baseFade = v;
    this.uniforms.uOpacity.value = v;
  }
  private baseFlash = 0;
  private baseFade = 1;
  private dirtyFromParams = false;

  /** 开关顶面贴图的细节(第二尺度 + 色斑)：画质切到 low 时关掉。没有 mapTop 的材质调用无效果 */
  setMapTopDetail(on: boolean): void {
    if (!this.opts.mapTop) return;
    const has = this.defines.TOON_MAP_TOP_DETAIL !== undefined;
    if (has === on) return;
    this.opts.mapTopDetail = on;
    if (on) this.defines.TOON_MAP_TOP_DETAIL = '';
    else delete this.defines.TOON_MAP_TOP_DETAIL;
    this.needsUpdate = true;
  }

  override onBeforeRender(_r: THREE.WebGLRenderer, _s: THREE.Scene, _c: THREE.Camera, _g: THREE.BufferGeometry, object: THREE.Object3D): void {
    const p = object.userData.toon as ToonParams | undefined;
    const u = this.uniforms;
    if (p) {
      u.uFlash.value = p.flash;
      (u.uFlashColor.value as THREE.Color).copy(p.flashColor);
      u.uOpacity.value = p.opacity * this.baseFade;
      (u.uTeamColor.value as THREE.Color).copy(p.teamColor);
      (u.uTint.value as THREE.Color).copy(p.tint);
      this.uniformsNeedUpdate = true;
      this.dirtyFromParams = true;
    } else if (this.dirtyFromParams) {
      // 上一个对象写过逐对象参数：还原材质自身的默认值
      u.uFlash.value = this.baseFlash;
      (u.uFlashColor.value as THREE.Color).setRGB(1, 1, 1);
      u.uOpacity.value = this.baseFade;
      (u.uTeamColor.value as THREE.Color).set(this.opts.teamColor ?? 0xffffff);
      (u.uTint.value as THREE.Color).setRGB(1, 1, 1);
      this.uniformsNeedUpdate = true;
      this.dirtyFromParams = false;
    }
  }

  /** 克隆并保持与 SHARED 的引用（ShaderMaterial.clone 会把共享 uniform 拷成副本） */
  override clone(): this {
    const m = new ToonMaterial(this.opts) as this;
    const src = this.uniforms;
    const dst = m.uniforms;
    for (const k of ['uColor', 'uEmissive', 'uRimColor', 'uTeamColor', 'uTint', 'uFlashColor'] as const) (dst[k].value as THREE.Color).copy(src[k].value as THREE.Color);
    // 暗部色：共用全局的那份不拷(同一个对象)，自带的才拷
    if (dst.uShadeTint !== SHARED.uShadeTint) (dst.uShadeTint.value as THREE.Color).copy(src.uShadeTint.value as THREE.Color);
    (dst.uRamp.value as THREE.Vector4).copy(src.uRamp.value as THREE.Vector4);
    (dst.uRim.value as THREE.Vector2).copy(src.uRim.value as THREE.Vector2);
    (dst.uSpec.value as THREE.Vector2).copy(src.uSpec.value as THREE.Vector2);
    (dst.uMapTop.value as THREE.Vector3).copy(src.uMapTop.value as THREE.Vector3);
    dst.uKick.value = src.uKick.value;
    dst.uSway.value = src.uSway.value;
    dst.uSwayHeight.value = src.uSwayHeight.value;
    dst.uGlowBoost.value = src.uGlowBoost.value;
    dst.tMap.value = src.tMap.value;
    dst.tMapTop.value = src.tMapTop.value;
    dst.tMapTopNoise.value = src.tMapTopNoise.value;
    m.flash = this.baseFlash;
    m.fade = this.baseFade;
    return m;
  }
}

export function createToonMaterial(opts: ToonMaterialOptions = {}): ToonMaterial {
  return new ToonMaterial(opts);
}

/** 给几何体写入常量 aFx 属性（逐顶点不同的值请自行构造 Float32Array/Uint8Array，itemSize=4） */
export function setFxAttribute(geometry: THREE.BufferGeometry, fx: { sway?: number; glow?: number; team?: number; ao?: number }): void {
  const n = geometry.attributes.position.count;
  const arr = new Uint8Array(n * 4);
  const s = clamp255((fx.sway ?? 0) * 255);
  const g = clamp255((fx.glow ?? 0) * 255);
  const t = clamp255((fx.team ?? 0) * 255);
  const a = clamp255((fx.ao ?? 1) * 255);
  for (let i = 0; i < n; i++) {
    arr[i * 4] = s;
    arr[i * 4 + 1] = g;
    arr[i * 4 + 2] = t;
    arr[i * 4 + 3] = a;
  }
  geometry.setAttribute('aFx', new THREE.BufferAttribute(arr, 4, true));
}

// ───────────────────────────── 描边 ─────────────────────────────

export interface OutlineOptions {
  color?: THREE.ColorRepresentation;
  /** 外扩厚度(米)。默认 0.035 */
  thickness?: number;
}

/**
 * 背面外扩描边材质。与本体共用 geometry，另建一个 Mesh；支持 InstancedMesh。
 * 若对象(或其祖先经 bindToonParams)绑定了 ToonParams，描边会跟随其 opacity 一起抖动淡出。
 */
export function createOutlineMaterial(opts: OutlineOptions = {}): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(opts.color ?? PALETTE.env.outline) },
      uThickness: { value: opts.thickness ?? 0.035 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uThickness;
      void main() {
        vec4 p = vec4(position + normalize(normal) * uThickness, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        vec4 mvPosition = modelViewMatrix * p;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      ${GLSL_DITHER}
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        if (uOpacity < 0.995 && uOpacity <= ditherThreshold(gl_FragCoord.xy)) discard;
        gl_FragColor = vec4(uColor, 1.0);
        ${GLSL_OUTPUT_FRAGMENT}
      }
    `,
    side: THREE.BackSide,
    fog: true,
  });
  let dirty = false;
  mat.onBeforeRender = (_r, _s, _c, _g, object) => {
    const p = object.userData.toon as ToonParams | undefined;
    if (p) {
      mat.uniforms.uOpacity.value = p.opacity;
      mat.uniformsNeedUpdate = true;
      dirty = true;
    } else if (dirty) {
      mat.uniforms.uOpacity.value = 1;
      mat.uniformsNeedUpdate = true;
      dirty = false;
    }
  };
  return mat;
}

// ───────────────────────────── 纯发光体 ─────────────────────────────

export interface GlowOptions {
  color?: THREE.ColorRepresentation;
  /** HDR 亮度倍率。> 1 触发 bloom。默认 2.5 */
  intensity?: number;
  /** > 0：按视角菲涅尔调制。正值 = 边缘亮(光壳)，负值 = 中心亮(光球)。绝对值为指数 */
  fresnel?: number;
  /** 叠加混合(光效)；false 时为不透明自发光实体 */
  additive?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** 颜色贴图(乘到颜色与透明度上) */
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  /** 竖直方向的亮度渐变：物体空间 y 从 0→gradientHeight 亮度从 gradientBase→1 */
  gradientHeight?: number;
  gradientBase?: number;
}

/** 不受光的发光材质：水晶核心、能量体、光柱、光环等。uniform：uColor / uIntensity / uOpacity */
export function createGlowMaterial(opts: GlowOptions = {}): THREE.ShaderMaterial {
  const additive = opts.additive ?? false;
  const defines: Record<string, string | number> = {};
  if (opts.fresnel) defines.GLOW_FRESNEL = '';
  if (opts.map) defines.GLOW_MAP = '';
  if (opts.gradientHeight) defines.GLOW_GRADIENT = '';
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uIntensity: { value: opts.intensity ?? 2.5 },
      uOpacity: { value: opts.opacity ?? 1 },
      uFresnel: { value: opts.fresnel ?? 0 },
      uGradient: { value: new THREE.Vector2(opts.gradientHeight ?? 1, opts.gradientBase ?? 0.3) },
      tMap: { value: opts.map ?? null },
    },
    defines,
    vertexShader: /* glsl */ `
      #include <common>
      #include <color_pars_vertex>
      #include <fog_pars_vertex>
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying float vH;
      void main() {
        #include <color_vertex>
        vUv = uv;
        vH = position.y;
        vec3 objectNormal = normal;
        #include <defaultnormal_vertex>
        vNormal = normalize(transformedNormal);
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        vec4 mvPosition = modelViewMatrix * p;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <color_pars_fragment>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform float uFresnel;
      uniform vec2 uGradient;
      uniform sampler2D tMap;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying float vH;
      void main() {
        vec3 col = uColor * uIntensity;
        float a = uOpacity;
        #ifdef USE_COLOR
        col *= vColor.rgb;
        #endif
        #ifdef GLOW_MAP
        vec4 t = texture2D(tMap, vUv);
        col *= t.rgb;
        a *= t.a;
        #endif
        #ifdef GLOW_GRADIENT
        col *= mix(uGradient.y, 1.0, saturate(vH / uGradient.x));
        #endif
        #ifdef GLOW_FRESNEL
        float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float f = uFresnel > 0.0 ? pow(1.0 - ndv, uFresnel) : pow(ndv, -uFresnel);
        a *= f;
        #endif
        gl_FragColor = vec4(col, a);
        ${GLSL_OUTPUT_FRAGMENT}
      }
    `,
    transparent: additive || (opts.opacity ?? 1) < 1 || !!opts.fresnel || !!opts.map,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !(additive || (opts.opacity ?? 1) < 1 || !!opts.fresnel || !!opts.map),
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
    fog: true,
  });
}
