/**
 * 全屏三角形：后处理各 pass 共用一个几何体与一个占位相机（一个 draw call / pass）。
 */
import { BufferAttribute, BufferGeometry, Mesh, OrthographicCamera, type Material, type WebGLRenderer, type WebGLRenderTarget } from 'three';

const geometry = new BufferGeometry();
geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** 顶点着色器：直接输出裁剪坐标，传 vUv。 */
export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export class FullScreenPass {
  private readonly mesh: Mesh;

  constructor(material: Material) {
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  get material(): Material {
    return this.mesh.material as Material;
  }

  render(renderer: WebGLRenderer, target: WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, camera);
  }

  dispose(): void {
    this.material.dispose();
  }
}
