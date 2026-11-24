/**
 * 招牌网格与材质：全部招牌（平贴 + 直招牌两面）合成一个网格、一个 draw call。
 * 顶点：position（three 世界坐标）、aUv（格内坐标，可超出 0–1）、aCell（格子 UV 矩形）、aGain（发光增益）。
 * 片元：图集纹素（sRGB 纹理，采样即线性）× 增益 = 发光；单面（正面朝街），背面另有一片，所以从哪边看字都不镜像。
 */
import { BufferAttribute, BufferGeometry, FrontSide, Mesh, ShaderMaterial, type Texture } from 'three';
import { simToThree } from '../../coords';
import { GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, sharedUniforms } from '../materials/lighting';
import { atlasLayout, cellUv } from './atlas';
import type { SignQuad } from './placement';

const vertexShader = /* glsl */ `
attribute vec2 aUv;
attribute vec4 aCell;
attribute float aGain;
varying vec2 vUv;
flat varying vec4 vCell;
flat varying float vGain;
varying vec3 vWorld;
void main() {
  vUv = aUv;
  vCell = aCell;
  vGain = aGain;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
uniform sampler2D uAtlas;
varying vec2 vUv;
flat varying vec4 vCell;
flat varying float vGain;
varying vec3 vWorld;
void main() {
  // 夹在格内（留 1–4 像素边），超出部分延续底色；远处 mip 自然变暗淡的平均色
  vec2 c = clamp(vUv, vec2(0.02, 0.04), vec2(0.98, 0.96));
  vec3 tex = texture2D(uAtlas, vCell.xy + c * vCell.zw).rgb;
  vec3 col = applyHaze(vec3(0.0), tex * vGain, vWorld);
  ${GLSL_FINISH}
}
`;

export function createSignMaterial(atlas: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...sharedUniforms(), uAtlas: { value: atlas } },
    vertexShader,
    fragmentShader,
    side: FrontSide,
  });
}

/** 招牌四边形 → 一个几何体（模拟坐标米 → three，经 coords.ts）。 */
export function signGeometry(quads: readonly SignQuad[]): BufferGeometry {
  const cells = atlasLayout().map(cellUv);
  const n = quads.length * 4;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const cell = new Float32Array(n * 4);
  const gain = new Float32Array(n);
  const index = n > 65535 ? new Uint32Array(quads.length * 6) : new Uint16Array(quads.length * 6);
  quads.forEach((q, i) => {
    const c = cells[q.cell]!;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      const [x, y, z] = q.corners[k]!;
      simToThree(x, y, z, pos, v * 3, 1);
      uv[v * 2] = q.uv[k]![0];
      uv[v * 2 + 1] = q.uv[k]![1];
      cell.set(c, v * 4);
      gain[v] = q.gain;
    }
    // BL, BR, TR / BL, TR, TL：从正面看逆时针
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aUv', new BufferAttribute(uv, 2));
  g.setAttribute('aCell', new BufferAttribute(cell, 4));
  g.setAttribute('aGain', new BufferAttribute(gain, 1));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

export function buildSignMesh(quads: readonly SignQuad[], atlas: Texture): Mesh | null {
  if (quads.length === 0) return null;
  const mesh = new Mesh(signGeometry(quads), createSignMaterial(atlas));
  mesh.name = 'signs';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
