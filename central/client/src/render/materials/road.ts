/**
 * 路面材质：深色沥青 + 街灯光斑 + 标线（白色虚线分道线、双向路中央白实线、路边黄线）。
 * 标线左右对称，不画箭头等任何暗示行车方向的元素（香港靠左行驶，方向箭头留给 M1 车道层）。
 *
 * aRoad = (沿线距离 m, 横向偏移 m（左正）, 半宽 m, 段长 m)
 * aLane = (车道数, 标志位)：bit0 单行，bit1 行人街（铺砖、无标线）
 * |横向偏移| > 半宽 的顶点属于高架桥侧板/底面，画成混凝土。
 */
import { ShaderMaterial } from 'three';
import { GLSL_OUTPUT, GLSL_FOG_PARS_FRAG, GLSL_FOG_VERT, GLSL_HASH, withFog } from './common';

const vertexShader = /* glsl */ `
attribute vec4 aRoad;
attribute vec2 aLane;
varying vec4 vRoad;
varying vec2 vLane;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vRoad = aRoad;
  vLane = aLane;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  ${GLSL_FOG_VERT}
}
`;

const fragmentShader = /* glsl */ `
varying vec4 vRoad;
varying vec2 vLane;
varying vec3 vWorld;
${GLSL_FOG_PARS_FRAG}
${GLSL_HASH}

float line(float d, float hw, float aa) {
  return 1.0 - smoothstep(hw - aa, hw + aa, d);
}

void main() {
  float along = vRoad.x;
  float across = vRoad.y;
  float hw = vRoad.z;
  float len = vRoad.w;
  float lanes = vLane.x;
  float flags = vLane.y;
  bool oneway = mod(flags, 2.0) > 0.5;
  bool ped = mod(floor(flags / 2.0), 2.0) > 0.5;
  vec3 col;

  if (abs(across) > hw + 0.01) {
    col = vec3(0.040, 0.040, 0.046) * (0.7 + 0.3 * vnoise(vWorld.xz * 0.5));
  } else if (ped) {
    vec2 g = vec2(along, across) / 0.6;
    vec2 t = abs(fract(g) - 0.5);
    vec2 aaT = fwidth(g);
    float grout = max(1.0 - line(t.x, 0.45, aaT.x), 1.0 - line(t.y, 0.45, aaT.y));
    col = vec3(0.045, 0.040, 0.037) * (1.0 - 0.35 * grout * (1.0 - smoothstep(0.2, 0.6, aaT.x)));
  } else {
    float grain = vnoise(vec2(along, across) * 1.7);
    col = vec3(0.011, 0.011, 0.014) * (0.85 + 0.3 * grain);
    // 街灯光斑：每 30 m 一盏，左右交替
    float seg = floor(along / 30.0);
    float ls = mod(along, 30.0) - 15.0;
    float side = mod(seg, 2.0) * 2.0 - 1.0;
    float de = across - side * (hw - 0.5);
    col += vec3(0.13, 0.075, 0.03) * exp(-(ls * ls) / 32.0 - (de * de) / 14.0);

    float aa = fwidth(across);
    float fade = (1.0 - smoothstep(0.06, 0.22, aa)) * smoothstep(3.0, 8.0, min(along, len - along));
    float white = 0.0;
    float yellow = line(abs(abs(across) - (hw - 0.35)), 0.06, aa);
    if (lanes >= 2.0) {
      float lw = 2.0 * hw / lanes;
      float t = (across + hw) / lw;
      float k = floor(t + 0.5);
      float d = abs(t - k) * lw;
      bool inner = k >= 1.0 && k <= lanes - 1.0;
      bool isCentre = !oneway && abs(k * lw - hw) < 0.3;
      float dash = step(mod(along, 9.0), 4.0);
      if (inner && !isCentre) white = line(d, 0.07, aa) * dash;
    }
    if (!oneway && lanes >= 2.0) {
      float dc = abs(across);
      white = max(white, lanes >= 4.0 ? line(abs(dc - 0.17), 0.065, aa) : line(dc, 0.07, aa));
    }
    col = mix(col, vec3(0.52, 0.52, 0.50), white * fade);
    col = mix(col, vec3(0.55, 0.36, 0.035), yellow * fade);
  }
  ${GLSL_OUTPUT}
}
`;

export function createRoadMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: withFog({}),
    vertexShader,
    fragmentShader,
    fog: true,
  });
}
