/**
 * 夜空穹顶（realism contract NIGHT_SKY）：中性暗天顶 #14151c → 约 20° 处 ≈ #1f2029 → 低处淡紫灰光害光晕，
 * 光晕在地平线上正好等于雾色 uHazeColor（远景与天空在地平线无缝相接），地平线以下全是雾色。不画星星。
 *
 * 光晕形状按「雾沿视线积分到无穷远」：天色 = mix(天顶, 雾色, 1 − exp(−a / sin(仰角)))，
 * a = 雾密度 × 高度尺度 × 2/3 × exp(−相机高度 / 高度尺度)（默认 0.1）。所以天色与雾模型一致：
 * 远山（6–8 km）只比山顶上方的天略暗，相机越高天越暗；改雾密度（潮湿 / 通透）时光晕一起变。
 * 穹顶以当前相机为中心（主相机或镜像相机都对）、最先绘制、不写深度；也进平面反射的代理层。
 * 另加一层「光害穹」：城市灯光照亮低空雾气，天际线上方约 12° 内再亮一截（照片 01：天际线上方 Y ≈ 0.048–0.061，
 * 只靠雾积分只有一半）。形状 (1 − e^(−s/0.01)) · e^(−s/0.12)，地平线处为 0（与雾色无缝），3–6° 最亮，30° 以上可忽略。
 */
import { BackSide, Color, ShaderMaterial } from 'three';
import { GLSL_FINISH, GLSL_SHARED_PARS, HAZE, NIGHT_SKY, sharedUniforms } from './lighting';

export const SKY_GLOW_FACTOR = 2 / 3;
/** 光害穹的强度（× 雾色）与高度尺度（仰角正弦）。 */
export const SKY_DOME_GAIN = 0.55;
export const SKY_DOME_SCALE = 0.12;

/**
 * GLSL：天色函数 nightSky(dir)（dir 为单位方向，three 世界坐标 y 向上）。需要 GLSL_SHARED_PARS 与 uniform uSkyZenith。
 * 水面在反射纹理取不到时也用它补天色。
 */
export const GLSL_SKY = /* glsl */ `
uniform vec3 uSkyZenith;
vec3 nightSky(vec3 d) {
  float s = d.y;
  if (s <= 0.0) return uHazeColor;
  float a = uHazeDensity * uHazeFalloff * ${SKY_GLOW_FACTOR.toFixed(4)} * exp(-max(cameraPosition.y, 0.0) / max(uHazeFalloff, 1.0));
  float dome = (1.0 - exp(-s / 0.01)) * exp(-s / ${SKY_DOME_SCALE.toFixed(3)});
  return mix(uSkyZenith, uHazeColor, 1.0 - exp(-a / max(s, 0.004))) + uHazeColor * (${SKY_DOME_GAIN.toFixed(3)} * dome);
}
`;

/**
 * nightSky 的 TS 镜像（线性 RGB），给单元测试核对调色板：sinElev 为仰角正弦，camY 为相机高度（米）。
 */
export function nightSkyRgb(sinElev: number, camY = 0, density = 1 / HAZE.extinctionM, falloff = HAZE.falloffM): [number, number, number] {
  const z = new Color(NIGHT_SKY.zenith);
  const h = new Color(NIGHT_SKY.horizon);
  if (sinElev <= 0) return [h.r, h.g, h.b];
  const a = density * falloff * SKY_GLOW_FACTOR * Math.exp(-Math.max(camY, 0) / Math.max(falloff, 1));
  const t = 1 - Math.exp(-a / Math.max(sinElev, 0.004));
  const dome = SKY_DOME_GAIN * (1 - Math.exp(-sinElev / 0.01)) * Math.exp(-sinElev / SKY_DOME_SCALE);
  return [z.r + (h.r - z.r) * t + h.r * dome, z.g + (h.g - z.g) * t + h.g * dome, z.b + (h.b - z.b) * t + h.b * dome];
}

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  // 以当前相机为中心（不用 modelMatrix）：平面反射的镜像相机也看到正确的天色
  vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_SKY}
varying vec3 vDir;
void main() {
  vec3 col = nightSky(normalize(vDir));
  ${GLSL_FINISH}
}
`;

/** 天顶色 uniform（线性）；雾色走共享的 uHazeColor。 */
export function skyUniforms(): { uSkyZenith: { value: Color } } {
  return { uSkyZenith: { value: new Color(NIGHT_SKY.zenith) } };
}

export function createSkyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...sharedUniforms(), ...skyUniforms() },
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
}
