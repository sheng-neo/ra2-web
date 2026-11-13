/**
 * 建筑的无敌护罩：前一座塔还没破、现在打不动的防御塔 / 水晶，外面罩一圈半透明的六边护罩纹。
 *
 * 一圈略微收顶的圆筒面，只画朝向镜头的半圈(背面剔除)，片元里程序计算六边格：
 * 每格一层很淡的队伍色填充(像一片薄玻璃) + 两三个像素宽的格线；轮廓处按菲涅尔提亮；一道扫光自下而上、两秒一次。
 * 护罩解除(前一座塔被毁)时：格线向格心收拢、整圈外扩并淡出，约 0.45 秒。
 * 所有护罩合成一个 draw call(每个 64 个三角形)；预乘透明度混合：填充略微压暗背景，格线与扫光是叠加的发光。
 *
 * 以前护罩是建筑模型里的一圈细线框(每格六根细棍)：没有面、不透明，远看像没关掉的调试线框，和厚重的石与晶不是一个质感。
 */
import * as THREE from 'three';
import { GLSL_ADDITIVE, GLSL_OUTPUT_FRAGMENT, SHARED } from '../materials';

const SEGMENTS = 32;

const VERTEX = /* glsl */ `
#include <common>
attribute vec4 aPosR;
attribute vec4 aDim;
attribute vec3 aCol;
varying vec2 vCell;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying vec3 vT;
void main() {
  // position.x = 绕一圈的 0..1，position.y = 自下而上的 0..1
  float a = position.x * 6.2831853;
  float t = position.y;
  float crack = aDim.w;
  // 略微收顶；解除时整圈外扩
  float R = aPosR.w * (1.0 - 0.12 * t * t) * (1.0 + 0.22 * crack);
  vec3 n = vec3(cos(a), 0.0, sin(a));
  vec3 w = vec3(aPosR.x, aPosR.y + t * aDim.x, aPosR.z) + n * R;
  // 六边格坐标：周向 aDim.y 格，纵向按格宽换算(格子保持正六边形)
  float cellW = 6.2831853 * aPosR.w / aDim.y;
  vCell = vec2(position.x * aDim.y, t * aDim.x / cellW);
  vN = n;
  vW = w;
  vCol = aCol;
  vT = vec3(t, aDim.z, crack);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
${GLSL_ADDITIVE}
uniform float uTime;
varying vec2 vCell;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying vec3 vT;
void main() {
  // 到最近格心的六边形距离 d：格心 0，格边 0.5
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 p = vCell;
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  vec2 q = abs(dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw);
  float d = max(dot(q, s * 0.5), q.x);
  float t = vT.x;
  float crack = vT.z;
  // 格线：离格边 1.3 个像素以内(总宽两三个像素)；解除时线向格心收拢变粗
  float aa = fwidth(d) + 1e-4;
  float edge = 0.5 - d;
  float lw = aa * 1.0 + crack * 0.3;
  float line = 1.0 - smoothstep(lw, lw + aa, edge);
  // 填充：薄玻璃，靠近格边略浓
  float fill = 0.5 + 0.5 * smoothstep(0.1, 0.5, d);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 1.6);
  // 扫光：自下而上，两秒一次
  float sweep = fract(uTime * 0.5);
  float band = exp(-pow((t - sweep) * 5.0, 2.0)) * smoothstep(0.0, 0.1, sweep) * (1.0 - smoothstep(0.85, 1.0, sweep));
  // 上下两端渐隐
  float fade = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.84, 1.0, t)) * vT.y * (1.0 - crack);
  float glow = (line * (0.3 + 0.8 * band + 0.4 * fres + 1.6 * crack) + fill * (0.035 + 0.16 * band + 0.1 * fres)) * fade;
  float alpha = (line * 0.3 + fill * 0.1) * fade;
  if (glow + alpha < 0.004) discard;
  // 填充的本色(预乘) + 叠加的发光
  gl_FragColor = vec4(vCol * alpha * 0.45 + kitAdditive(vCol * glow), alpha);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export class ShieldBatch {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private posR: THREE.InstancedBufferAttribute;
  private dim: THREE.InstancedBufferAttribute;
  private col: THREE.InstancedBufferAttribute;
  private capacity: number;
  private count = 0;
  private material: THREE.ShaderMaterial;

  constructor(capacity = 16) {
    this.capacity = capacity;
    const geo = new THREE.InstancedBufferGeometry();
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) pos.push(i / SEGMENTS, 0, 0, i / SEGMENTS, 1, 0);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      // 朝外的一面为正面(只画朝向镜头的半圈)
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.posR = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.dim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (const a of [this.posR, this.dim, this.col]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPosR', this.posR);
    geo.setAttribute('aDim', this.dim);
    geo.setAttribute('aCol', this.col);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'unit-shields';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  begin(): void {
    this.count = 0;
  }

  /**
   * 追加一个护罩。(x, z) 为建筑中心，y0 为护罩底边高度，radius / height 为圆筒的半径与高(米)，cells 为绕一圈的六边格数，
   * alpha 为整体强度 0..1，crack 为解除进度 0..1(0 = 完好)。
   */
  push(x: number, y0: number, z: number, radius: number, height: number, cells: number, color: THREE.Color, alpha: number, crack: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const p = this.posR.array as Float32Array;
    p[i * 4] = x;
    p[i * 4 + 1] = y0;
    p[i * 4 + 2] = z;
    p[i * 4 + 3] = radius;
    const d = this.dim.array as Float32Array;
    d[i * 4] = height;
    d[i * 4 + 1] = cells;
    d[i * 4 + 2] = alpha;
    d[i * 4 + 3] = crack;
    const c = this.col.array as Float32Array;
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }

  end(): void {
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count === 0) return;
    this.posR.needsUpdate = true;
    this.dim.needsUpdate = true;
    this.col.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
