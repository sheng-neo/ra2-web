/**
 * 自写材质共用的小工具与 GLSL 片段。
 * 写实化之后（realism contract v1，见 lighting.ts）：颜色在线性 HDR 里算，雾、天光、tone mapping 一律走契约
 * （GLSL_HAZE / GLSL_CITY_LIGHT / GLSL_FINISH）；旧的 FogExp2、逐图层雾系数与紫色 NIGHT 调色板已删除。
 */
import { Color } from 'three';

export function linear(hex: string): Color {
  return new Color(hex);
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
