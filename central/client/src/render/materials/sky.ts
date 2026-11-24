/**
 * 夜空穹顶：天顶深蓝 → 地平线紫（与雾色一致）+ 城市光污染暖晕 + 稀疏暗星。
 * 穹顶跟随相机、最先绘制、不写深度。
 */
import { BackSide, ShaderMaterial } from 'three';
import { GLSL_HASH, NIGHT, linear } from './common';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uFog;
varying vec3 vDir;
${GLSL_HASH}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
  col += uGlow * exp(-max(h, 0.0) * 9.0) * 0.6;
  col = mix(uFog, col, smoothstep(-0.02, 0.04, h));
  // 星：按方向网格取稀疏亮点，靠近地平线隐去
  vec2 sp = vec2(atan(d.z, d.x) * 120.0, h * 240.0);
  vec2 cell = floor(sp);
  float star = step(0.9975, hash12(cell)) * smoothstep(0.15, 0.5, h);
  vec2 f = fract(sp) - 0.5;
  col += vec3(0.5, 0.55, 0.7) * star * smoothstep(0.35, 0.0, length(f)) * 0.35;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createSkyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uZenith: { value: linear(NIGHT.skyZenith) },
      uHorizon: { value: linear(NIGHT.skyHorizon) },
      uGlow: { value: linear(NIGHT.skyGlow) },
      uFog: { value: linear(NIGHT.fog) },
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
}
