/**
 * 输出 pass（全分辨率，唯一一个）：HDR 场景 + bloom 合成 → 调色（饱和度 0.97、暗角 ≤ 8 %）
 * → 契约的 CustomToneMapping → sRGB → 1/255 量级抖动（夜空渐变不出色带）。
 */
import { Color, ShaderMaterial, Vector2 } from 'three';
import { NIGHT_SKY } from '../materials/lighting';
import { GLSL_TENT } from './bloom';
import { FULLSCREEN_VERT } from './fullscreen';

/** bloom 强度（契约：0.6–0.8）。 */
export const BLOOM_STRENGTH = 0.7;
/**
 * 雾中光幕：bloom 链 alpha 里 1/4–1/32 四级累加的局部平均亮度 × 此增益，按雾色（亮度归一）着色加回。
 * 亮楼群周围的暗玻璃、夜空被抬起一层淡紫灰（照片 01：塔楼中位亮度约为渲染的 3 倍、局部对比约一半）。
 */
export const VEIL_GAIN = 0.06;
/** 调色：饱和度（契约 0.95–1.0）与暗角（≤ 12 %）。 */
export const GRADE = { saturation: 0.97, vignette: 0.08 } as const;

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloomHalf;
uniform sampler2D tBloomQuarter;
uniform vec2 uQuarterTexel;
uniform float uBloom;        // 0 = 关
uniform float uVeil;
uniform vec3 uVeilTint;
uniform float uSaturation;
uniform float uVignette;
uniform vec2 uResolution;
varying vec2 vUv;
${GLSL_TENT}
float hashDither(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  if (uBloom > 0.0) {
    // 5 级（1/2 … 1/32）各级等权平均：小核 + 大核叠出灯芯周围的柔光
    vec4 q = tent(tBloomQuarter, vUv, uQuarterTexel);
    vec3 b = texture2D(tBloomHalf, vUv).rgb + q.rgb;
    col += b * (uBloom / 5.0);
    // 光幕：q.a 是四级局部平均亮度之和
    col += uVeilTint * (q.a * uVeil);
  }
  float y = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(y), col, uSaturation), 0.0);
  vec2 q = vUv - 0.5;
  col *= 1.0 - uVignette * smoothstep(0.15, 0.75, dot(q, q) * 2.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hashDither(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;

/** 光幕色：地平线雾色，亮度归一（线性）。 */
function veilTint(): Color {
  const c = new Color(NIGHT_SKY.horizon);
  return c.multiplyScalar(1 / (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b));
}

export function createOutputMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tBloomHalf: { value: null },
      tBloomQuarter: { value: null },
      uQuarterTexel: { value: new Vector2(1, 1) },
      uBloom: { value: BLOOM_STRENGTH },
      uVeil: { value: VEIL_GAIN },
      uVeilTint: { value: veilTint() },
      uSaturation: { value: GRADE.saturation },
      uVignette: { value: GRADE.vignette },
      uResolution: { value: new Vector2(1, 1) },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
}
