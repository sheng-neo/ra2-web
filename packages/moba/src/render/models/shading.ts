/**
 * 单位着色与合批：
 *   - 单位材质 = 共享着色套件(materials.ts)的三阶明暗 + 轮廓光 + 风格化高光，外加「骨骼贴图蒙皮 + 逐实例参数」。
 *     同一种模型的所有实例一次 draw call 画完：每个实例占骨骼贴图的一行，顶点着色器按 gl_InstanceID 取自己的骨骼。
 *   - 逐实例参数：不透明度(抖动淡出) / 受击闪白 / 自发光倍率 / 队伍色 / 整体染色。
 *   - 阴影通道用同一套蒙皮的深度材质(customDepthMaterial)。
 * 骨骼数据已经是世界空间(见 rig.ts 的 pack)，所以网格本身必须保持单位矩阵。
 */
import * as THREE from 'three';
import { GLSL_DITHER, GLSL_LIGHT_PARS_FRAGMENT, GLSL_LIGHT_PARS_VERTEX, GLSL_LIGHT_VERTEX_TAIL, GLSL_OUTPUT_FRAGMENT, litUniforms } from '../materials';
import type { Skeleton } from './rig';

const SKIN_PARS = /* glsl */ `
uniform highp sampler2D uBones;
attribute vec3 aSkin;
vec3 qrot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
void boneXf(float idx, out vec4 ps, out vec4 q) {
  int x = int(idx + 0.5) * 2;
  ps = texelFetch(uBones, ivec2(x, gl_InstanceID), 0);
  q = texelFetch(uBones, ivec2(x + 1, gl_InstanceID), 0);
}
`;

/** 输出 skinnedPos / skinnedNormal(世界空间) */
const SKIN_MAIN = /* glsl */ `
  vec4 ps0;
  vec4 q0;
  vec4 ps1;
  vec4 q1;
  boneXf(aSkin.x, ps0, q0);
  vec3 skinnedPos = ps0.xyz + ps0.w * qrot(q0, position);
  vec3 skinnedNormal = qrot(q0, normal);
  if (aSkin.z < 0.999) {
    boneXf(aSkin.y, ps1, q1);
    skinnedPos = mix(ps1.xyz + ps1.w * qrot(q1, position), skinnedPos, aSkin.z);
    skinnedNormal = mix(qrot(q1, normal), skinnedNormal, aSkin.z);
  }
`;

const UNIT_VERTEX = /* glsl */ `
${GLSL_LIGHT_PARS_VERTEX}
#include <color_pars_vertex>
${SKIN_PARS}
attribute vec4 aFx;
attribute vec4 aInstA;
attribute vec3 aInstTeam;
attribute vec4 aInstTint;
varying vec4 vFx;
varying vec4 vInstA;
varying vec3 vTeam;
varying vec4 vTint;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  #include <color_vertex>
  vFx = aFx;
  vInstA = aInstA;
  vTeam = aInstTeam;
  vTint = aInstTint;
  ${SKIN_MAIN}
  vec3 objectNormal = skinnedNormal;
  vec4 worldPosition = vec4(skinnedPos, 1.0);
  ${GLSL_LIGHT_VERTEX_TAIL}
  vNormal = normalize(transformedNormal);
}
`;

const UNIT_FRAGMENT = /* glsl */ `
${GLSL_LIGHT_PARS_FRAGMENT}
#include <color_pars_fragment>
${GLSL_DITHER}
uniform vec4 uRamp;
uniform vec3 uShadeTint;
uniform vec3 uRimColor;
uniform vec2 uRim;
uniform vec2 uSpec;
uniform float uGlowBoost;
varying vec4 vFx;
varying vec4 vInstA;
varying vec3 vTeam;
varying vec4 vTint;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  float opacity = vInstA.x;
  if (opacity < 0.995) {
    if (opacity <= ditherThreshold(gl_FragCoord.xy)) discard;
  }
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  // 队伍色只染蒙版区域；整体染色(石化/冰冻/阵亡变灰)按 vTint.a 的强度向灰度化后的染色过渡
  vec3 base = mix(vColor.rgb, vTeam, vFx.z);
  float lum = dot(base, vec3(0.3, 0.55, 0.15));
  base = mix(base, vTint.rgb * mix(lum, 1.0, 0.25) * 1.6, vTint.a);

  vec3 L = kitSunDir();
  float ndl = dot(N, L);
  float a = smoothstep(uRamp.x - uRamp.w, uRamp.x + uRamp.w, ndl);
  float b = smoothstep(uRamp.y - uRamp.w, uRamp.y + uRamp.w, ndl);
  float lit = (a * uRamp.z + b * (1.0 - uRamp.z)) * kitShadow();
  vec3 sun = kitSunColor();
  float ao = vFx.w;

  vec3 irradiance = kitAmbient(N) * ao + sun * lit * mix(1.0, ao, 0.4) + kitPointLights(N, -vViewPosition);
  vec3 col = base * RECIPROCAL_PI * irradiance;
  col *= mix(uShadeTint, vec3(1.0), lit);

  // 轮廓光：俯视角下把单位从地面上「抠」出来；受光侧更强，暗部保留一点冷色勾边
  float fres = pow(1.0 - saturate(dot(N, V)), uRim.y);
  col += uRimColor * (fres * uRim.x * (0.3 + 0.7 * lit) * mix(0.55, 1.0, ao));

  // 风格化高光：只在金属/晶体(aFx.x)上出现的硬边亮斑
  vec3 H = normalize(L + V);
  float sp = pow(saturate(dot(N, H)), uSpec.y);
  col += sun * RECIPROCAL_PI * smoothstep(0.42, 0.58, sp) * uSpec.x * vFx.x * lit;
  // 金属的环境反光：朝上的面带一点天光
  col += base * vFx.x * 0.22 * saturate(N.y * 0.5 + 0.5) * kitAmbient(vec3(0.0, 1.0, 0.0)) * RECIPROCAL_PI;

  col += base * (vFx.y * uGlowBoost * vInstA.z);
  col = mix(col, vec3(1.8), vInstA.y);

  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

const DEPTH_VERTEX = /* glsl */ `
#include <common>
${SKIN_PARS}
attribute vec4 aInstA;
varying vec2 vHighPrecisionZW;
varying float vOpacity;
void main() {
  ${SKIN_MAIN}
  vOpacity = aInstA.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(skinnedPos, 1.0);
  vHighPrecisionZW = gl_Position.zw;
}
`;

const DEPTH_FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
varying vec2 vHighPrecisionZW;
varying float vOpacity;
void main() {
  // 半透明(草丛内/淡出中)的单位不投影
  if (vOpacity < 0.75) discard;
  #ifdef USE_REVERSED_DEPTH_BUFFER
  float fragCoordZ = vHighPrecisionZW[0] / vHighPrecisionZW[1];
  #else
  float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
  #endif
  gl_FragColor = packDepthToRGBA(fragCoordZ);
}
`;

const OUTLINE_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${SKIN_PARS}
attribute vec4 aOutline;
attribute vec4 aInstA;
uniform float uLine;
varying float vOpacity;
void main() {
  ${SKIN_MAIN}
  vec3 n = qrot(q0, aOutline.xyz);
  if (aSkin.z < 0.999) n = mix(qrot(q1, aOutline.xyz), n, aSkin.z);
  vec4 mvPosition = viewMatrix * vec4(skinnedPos, 1.0);
  // 线宽按视距换算成恒定的屏幕像素；被缩没的部件(骨骼缩放趋零)不留描边残点
  float sc = ps0.w;
  if (aSkin.z < 0.999) sc = mix(ps1.w, ps0.w, aSkin.z);
  float w = aOutline.w * uLine * -mvPosition.z * min(1.0, sc * 4.0);
  mvPosition = viewMatrix * vec4(skinnedPos + normalize(n) * w, 1.0);
  vOpacity = aInstA.x;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${GLSL_DITHER}
uniform vec3 uColor;
varying float vOpacity;
void main() {
  if (vOpacity < 0.995) {
    if (vOpacity <= ditherThreshold(gl_FragCoord.xy)) discard;
  }
  gl_FragColor = vec4(uColor, 1.0);
  ${GLSL_OUTPUT_FRAGMENT}
}
`;

export interface UnitMaterialOptions {
  /** 轮廓光强度 / 指数 */
  rim?: number;
  rimPower?: number;
  rimColor?: THREE.ColorRepresentation;
  /** 高光强度 / 锐度 */
  specular?: number;
  gloss?: number;
  /** aFx.y 自发光倍率 */
  glowBoost?: number;
  shadeTint?: THREE.ColorRepresentation;
  /** 描边线宽(CSS 像素)；0 = 不描边 */
  outline?: number;
  outlineColor?: THREE.ColorRepresentation;
}

function createUnitMaterial(bones: THREE.DataTexture, o: UnitMaterialOptions): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: litUniforms({
      uBones: { value: bones },
      // 与套件里 steps=3 的角色配置一致：暗→中 / 中→亮 的 N·L 阈值、中间调亮度、柔和度
      uRamp: { value: new THREE.Vector4(-0.08, 0.5, 0.58, 0.08) },
      uShadeTint: { value: new THREE.Color(o.shadeTint ?? 0xc4d0ff) },
      uRimColor: { value: new THREE.Color(o.rimColor ?? 0xfff2d8) },
      uRim: { value: new THREE.Vector2(o.rim ?? 0.5, o.rimPower ?? 3) },
      uSpec: { value: new THREE.Vector2(o.specular ?? 0.9, o.gloss ?? 36) },
      uGlowBoost: { value: o.glowBoost ?? 3 },
    }),
    vertexShader: UNIT_VERTEX,
    fragmentShader: UNIT_FRAGMENT,
    lights: true,
    fog: true,
    vertexColors: true,
  });
  return mat;
}

function createDepthMaterial(bones: THREE.DataTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uBones: { value: bones } },
    vertexShader: DEPTH_VERTEX,
    fragmentShader: DEPTH_FRAGMENT,
  });
}

const _size = new THREE.Vector2();

function createOutlineMaterial(bones: THREE.DataTexture, px: number, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uBones: { value: bones },
      uLine: { value: 0.001 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: THREE.BackSide,
    fog: true,
  });
  mat.onBeforeRender = (renderer, _scene, camera) => {
    // 视距 d 处一个 CSS 像素对应的世界尺寸 = 2·tan(fov/2)·d / 视口高度；投影矩阵的 [5] 就是 1/tan(fov/2)
    renderer.getSize(_size);
    mat.uniforms.uLine.value = (px * 2) / (camera.projectionMatrix.elements[5] * Math.max(1, _size.y));
  };
  return mat;
}

/** 逐实例外观参数 */
export interface InstanceLook {
  opacity: number;
  flash: number;
  /** 自发光倍率(1 = 原样) */
  glow: number;
  /** 队伍色(线性 RGB) */
  team: THREE.Color;
  /** 整体染色与强度 0..1 */
  tint: THREE.Color;
  tintAmount: number;
}

export function createInstanceLook(): InstanceLook {
  return { opacity: 1, flash: 0, glow: 1, team: new THREE.Color(1, 1, 1), tint: new THREE.Color(1, 1, 1), tintAmount: 0 };
}

/**
 * 一种模型的实例批：InstancedBufferGeometry(共享模型的顶点缓冲) + 骨骼贴图 + 逐实例属性。
 * 每帧 begin() → 若干次 push() → end()。容量不够时自动翻倍。
 */
export class RigBatch {
  readonly mesh: THREE.Mesh;
  /** 本帧实例数 */
  count = 0;
  readonly triangles: number;
  private readonly source: THREE.BufferGeometry;
  private readonly bones: number;
  private capacity: number;
  private geo!: THREE.InstancedBufferGeometry;
  private tex!: THREE.DataTexture;
  private data!: Float32Array;
  private instA!: THREE.InstancedBufferAttribute;
  private instTeam!: THREE.InstancedBufferAttribute;
  private instTint!: THREE.InstancedBufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private readonly depth: THREE.ShaderMaterial;
  /** 描边壳(背面外扩)；不描边的批为 null */
  readonly outline: THREE.Mesh | null = null;
  private readonly outlineMat: THREE.ShaderMaterial | null = null;

  constructor(source: THREE.BufferGeometry, bones: number, capacity: number, opts: UnitMaterialOptions = {}, name = 'unit-batch') {
    this.source = source;
    this.bones = bones;
    this.capacity = Math.max(1, capacity);
    this.triangles = (source.index ? source.index.count : source.attributes.position.count) / 3;
    this.allocate();
    this.material = createUnitMaterial(this.tex, opts);
    this.depth = createDepthMaterial(this.tex);
    const mesh = new THREE.Mesh(this.geo, this.material);
    mesh.name = name;
    mesh.customDepthMaterial = this.depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 实例分布在整张地图上，由调用方自己做可见性裁剪
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.mesh = mesh;
    const px = opts.outline ?? 0;
    if (px > 0) {
      this.outlineMat = createOutlineMaterial(this.tex, px, opts.outlineColor ?? 0x1b2233);
      const ol = new THREE.Mesh(this.geo, this.outlineMat);
      ol.name = `${name}:outline`;
      ol.frustumCulled = false;
      ol.matrixAutoUpdate = false;
      ol.visible = false;
      this.outline = ol;
    }
  }

  /** 把本批的网格(本体 + 描边壳)加到父节点 */
  addTo(parent: THREE.Object3D): void {
    parent.add(this.mesh);
    if (this.outline) parent.add(this.outline);
  }

  removeFrom(parent: THREE.Object3D): void {
    parent.remove(this.mesh);
    if (this.outline) parent.remove(this.outline);
  }

  setOutlineVisible(on: boolean): void {
    this.outlineOn = on;
  }
  private outlineOn = true;

  private allocate(): void {
    const cap = this.capacity;
    const geo = new THREE.InstancedBufferGeometry();
    const src = this.source;
    geo.setIndex(src.index);
    for (const name of ['position', 'normal', 'color', 'aFx', 'aSkin', 'aOutline']) geo.setAttribute(name, src.attributes[name]);
    this.instA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.instTeam = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.instTint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.instA.setUsage(THREE.DynamicDrawUsage);
    this.instTeam.setUsage(THREE.DynamicDrawUsage);
    this.instTint.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aInstA', this.instA);
    geo.setAttribute('aInstTeam', this.instTeam);
    geo.setAttribute('aInstTint', this.instTint);
    geo.instanceCount = 0;
    this.geo = geo;
    this.data = new Float32Array(this.bones * 8 * cap);
    const tex = new THREE.DataTexture(this.data, this.bones * 2, cap, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.tex = tex;
  }

  private grow(): void {
    const oldData = this.data;
    const oldA = this.instA.array as Float32Array;
    const oldTeam = this.instTeam.array as Float32Array;
    const oldTint = this.instTint.array as Float32Array;
    const oldGeo = this.geo;
    const oldTex = this.tex;
    this.capacity *= 2;
    this.allocate();
    this.data.set(oldData);
    (this.instA.array as Float32Array).set(oldA);
    (this.instTeam.array as Float32Array).set(oldTeam);
    (this.instTint.array as Float32Array).set(oldTint);
    this.mesh.geometry = this.geo;
    this.material.uniforms.uBones.value = this.tex;
    this.depth.uniforms.uBones.value = this.tex;
    if (this.outline && this.outlineMat) {
      this.outline.geometry = this.geo;
      this.outlineMat.uniforms.uBones.value = this.tex;
    }
    // 旧的实例属性与贴图直接释放；共享的模型顶点缓冲会在下次绘制时由新几何体重新上传
    oldGeo.dispose();
    oldTex.dispose();
  }

  begin(): void {
    this.count = 0;
  }

  /** 追加一个实例：拷贝骨架的蒙皮数据与外观参数 */
  push(skeleton: Skeleton, look: InstanceLook): void {
    if (this.count >= this.capacity) this.grow();
    const i = this.count++;
    skeleton.pack(this.data, i * this.bones * 8);
    const a = this.instA.array as Float32Array;
    a[i * 4] = look.opacity;
    a[i * 4 + 1] = look.flash;
    a[i * 4 + 2] = look.glow;
    a[i * 4 + 3] = 0;
    const t = this.instTeam.array as Float32Array;
    t[i * 3] = look.team.r;
    t[i * 3 + 1] = look.team.g;
    t[i * 3 + 2] = look.team.b;
    const n = this.instTint.array as Float32Array;
    n[i * 4] = look.tint.r;
    n[i * 4 + 1] = look.tint.g;
    n[i * 4 + 2] = look.tint.b;
    n[i * 4 + 3] = look.tintAmount;
  }

  end(): void {
    const n = this.count;
    this.mesh.visible = n > 0;
    if (this.outline) this.outline.visible = n > 0 && this.outlineOn;
    this.geo.instanceCount = n;
    if (n === 0) return;
    this.tex.needsUpdate = true;
    this.instA.needsUpdate = true;
    this.instTeam.needsUpdate = true;
    this.instTint.needsUpdate = true;
  }

  setShadows(cast: boolean): void {
    this.mesh.castShadow = cast;
  }

  dispose(): void {
    this.geo.dispose();
    this.tex.dispose();
    this.material.dispose();
    this.depth.dispose();
    this.outlineMat?.dispose();
  }
}
