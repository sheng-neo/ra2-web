/**
 * 自写材质共用的调色板与 GLSL 片段。
 * 颜色在线性空间里算，最后经 three 的 colorspace_fragment 转 sRGB；不开 tone mapping。
 * 雾沿用 scene.fog（FogExp2）的 uniform，额外乘 uFogScale：远景层（对岸、山脊）与地标用小于 1 的值透出轮廓。
 */
import { Color, UniformsLib, UniformsUtils, type IUniform } from 'three';

/** 夜色调色板（sRGB 十六进制；Color 会自动转线性）。 */
export const NIGHT = {
  fog: '#262046',
  skyZenith: '#05051a',
  skyHorizon: '#2c2350',
  skyGlow: '#4a2c5e',
} as const;

export function linear(hex: string): Color {
  return new Color(hex);
}

/** 合并 three 的雾 uniform 与自定义 uniform。 */
export function withFog(extra: Record<string, IUniform>): Record<string, IUniform> {
  return UniformsUtils.merge([UniformsLib.fog, { uFogScale: { value: 1 } }, extra]);
}

export const GLSL_HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** 顶点着色器里写雾深度（要求局部变量 mvPosition）。 */
export const GLSL_FOG_VERT = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = -mvPosition.z;
#endif
`;

/**
 * 片元输出：线性 col → 输出色彩空间，再按雾混合。
 * 与 three 内建材质一致：fogColor 由渲染器以输出色彩空间（sRGB）提供，雾在转换之后施加。
 */
export const GLSL_OUTPUT = /* glsl */ `
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogD = fogDensity * uFogScale * vFogDepth;
    float fogFactor = 1.0 - exp(-fogD * fogD);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

export const GLSL_FOG_PARS_FRAG = /* glsl */ `
uniform float uFogScale;
#include <fog_pars_fragment>
`;

/**
 * 夜间统一光照：偏蓝环境光 + 西北高空的月光 + 街面向上的暖光（贴地最强，向上衰减）。
 * n 为世界法线，lift 为离地高度（米）。
 */
export const GLSL_NIGHT_LIGHT = /* glsl */ `
vec3 nightLight(vec3 n, float lift) {
  vec3 moonDir = normalize(vec3(-0.35, 0.75, -0.55));
  float moon = max(dot(n, moonDir), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 amb = vec3(0.30, 0.32, 0.55) * (0.55 + 0.45 * sky);
  vec3 moonC = vec3(0.35, 0.40, 0.65) * moon;
  float up = exp(-max(lift, 0.0) / 16.0) * (1.0 - max(n.y, 0.0));
  vec3 street = vec3(1.0, 0.55, 0.28) * 1.2 * up;
  return amb + moonC + street;
}
`;
