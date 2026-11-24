/**
 * 海面平面反射（HIGH）：镜像相机（y = 0 平面）+ 斜裁剪近平面，渲染「反射代理层」到 ≤ 半分辨率的 RGBA16F 目标。
 *
 * 代理层：单独的 Layers 通道 REFLECT_LAYER，只有镜像相机渲染它（ChunkLayer 不用改）：
 * - 建筑：遍历 scene 里名为 'buildings' 的组，取整区网格（geometry.drawRange.count === Infinity；
 *   分块叶子是有限 draw range 的 subGeometry 视图），新建共享几何与材质、只在 REFLECT_LAYER 上的 Mesh；
 * - 地标（名字以 'landmarks' 开头）、全部光点批（GlowBatch，共用 glowMaterial1）、远景、天空，
 *   以及任何 userData.reflect === true 的对象：直接在原对象上开启 REFLECT_LAYER。
 * 镜像相机的视场比主相机大约 35 %，波纹扰动后的反射方向也大多落在纹理里；落在外面的由水面着色器补天色。
 */
import {
  Frustum,
  Group,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Line,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { glowMaterial1, registerTextureBytes } from '../materials/lighting';

/** 反射代理层通道（0 = 主场景）。其他包的对象想进倒影：obj.layers.enable(REFLECT_LAYER) 或 userData.reflect = true。 */
export const REFLECT_LAYER = 5;
/** 镜像相机视场放大倍数。 */
const FOV_SCALE = 1.35;
/** 建筑代理的预算：按「越靠北（越近海旁）越先」选整区网格，三角形总数与个数不超过此值。 */
export const REFLECT_BUILDING_TRIANGLES = 72_000;
export const REFLECT_BUILDING_MESHES = 8;

function triangles(m: Mesh): number {
  const g = m.geometry;
  return (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
}

/** 反射纹理分辨率：drawing buffer 每轴的一半（向上取整，至少 1）。 */
export function reflectionSize(w: number, h: number): [number, number] {
  return [Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2))];
}

export class PlanarReflection {
  readonly target: WebGLRenderTarget;
  readonly camera = new PerspectiveCamera();
  /** 世界坐标 → 镜像相机裁剪坐标（proj × view，未做斜裁剪；斜裁剪不改 x、y、w 行）。 */
  readonly viewProj = new Matrix4();
  readonly proxies = new Group();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly tmpV = new Vector3();
  private readonly tmpT = new Vector3();
  private readonly tmpR = new Matrix4();
  private readonly clipPlane = new Vector4();
  private readonly q = new Vector4();
  private readonly frustum = new Frustum();
  /** 进倒影的全部对象（代理 + 开了 REFLECT_LAYER 的原对象）：手动按真实视锥剔除。 */
  private readonly members: Object3D[] = [];
  private readonly hidden: Object3D[] = [];

  constructor() {
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: true,
    });
    this.target.texture.name = 'water-reflection';
    // 各向异性过滤：水面用 textureGrad 只在竖直方向展宽采样（光柱竖向拉长）
    this.target.texture.anisotropy = 8;
    this.camera.layers.set(REFLECT_LAYER);
    this.proxies.name = 'reflection-proxy';
    this.proxies.matrixAutoUpdate = false;
  }

  setSize(w: number, h: number): void {
    const [rw, rh] = reflectionSize(w, h);
    this.target.setSize(rw, rh);
    // 颜色 8 B/px × 4/3（mipmap）+ 深度 4 B/px
    registerTextureBytes('atmosphere:reflection', Math.round(rw * rh * (8 * (4 / 3) + 4)));
  }

  /** 建好场景之后调用一次：收集代理。 */
  collect(scene: Scene): void {
    const buildings = scene.getObjectByName('buildings');
    const wholes: Mesh[] = [];
    buildings?.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.geometry.drawRange.count === Infinity) wholes.push(m);
    });
    // 海旁的楼才大片映进水里：按包围盒北缘（three −z 最小）排序，预算内依次选
    const north = (m: Mesh) => {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      return -m.geometry.boundingBox!.min.z;
    };
    wholes.sort((a, b) => north(b) - north(a));
    let budget = REFLECT_BUILDING_TRIANGLES;
    for (const m of wholes) {
      const t = triangles(m);
      if (t > budget || this.proxies.children.length >= REFLECT_BUILDING_MESHES) continue;
      budget -= t;
      const p = new Mesh(m.geometry, m.material);
      p.name = `${m.name}#reflect`;
      p.matrixAutoUpdate = false;
      p.matrix.copy(m.matrixWorld);
      p.matrixWorld.copy(m.matrixWorld);
      p.layers.set(REFLECT_LAYER);
      this.proxies.add(p);
    }
    scene.traverse((o: Object3D) => {
      // 1 px 线框不进倒影（省一个 draw call）
      if ((o as Line).isLine) return;
      // 所有光点批（共用契约的 glowMaterial1：路灯、车灯、航空灯……）都进倒影：水里的光柱主要来自它们
      const glow = (o as Mesh).isMesh && (o as Mesh).material === glowMaterial1();
      if (glow || o.name.startsWith('landmarks') || o.userData.reflect === true) {
        o.layers.enable(REFLECT_LAYER);
        this.members.push(o);
      }
    });
    this.members.push(...this.proxies.children);
    if (!this.proxies.parent) scene.add(this.proxies);
  }

  /**
   * 斜裁剪投影的远平面是斜的，three 用它做视锥剔除会把远处的楼全剔掉；
   * 所以先用未改的投影手动剔除（不在视锥里的临时设为不可见），渲染时关掉 three 的剔除。
   */
  private cull(): void {
    this.frustum.setFromProjectionMatrix(this.viewProj);
    for (const o of this.members) {
      if (!o.visible) continue;
      const mesh = o as Mesh;
      if (o.frustumCulled && mesh.geometry) {
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        if (!this.frustum.intersectsObject(o)) {
          o.visible = false;
          this.hidden.push(o);
          continue;
        }
      }
      if (o.frustumCulled) {
        o.frustumCulled = false;
        o.userData.reflectCulled = true;
      }
    }
  }

  private uncull(): void {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    for (const o of this.members) {
      if (o.userData.reflectCulled) {
        o.frustumCulled = true;
        delete o.userData.reflectCulled;
      }
    }
  }

  /** 按主相机更新镜像相机并渲染反射纹理。 */
  render(renderer: WebGLRenderer, scene: Scene, main: PerspectiveCamera): void {
    const cam = this.camera;
    main.updateMatrixWorld();
    const eye = this.tmpV.setFromMatrixPosition(main.matrixWorld);
    if (eye.y <= 0.05) return;
    // 镜像眼点与注视点
    this.tmpR.extractRotation(main.matrixWorld);
    const look = this.tmpT.set(0, 0, -1).applyMatrix4(this.tmpR).add(eye);
    cam.position.set(eye.x, -eye.y, eye.z);
    cam.up.set(0, 1, 0).applyMatrix4(this.tmpR);
    cam.up.y = -cam.up.y;
    look.y = -look.y;
    cam.lookAt(look);
    cam.fov = Math.min(main.fov * FOV_SCALE, 110);
    cam.aspect = main.aspect;
    cam.near = main.near;
    cam.far = main.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    // 斜裁剪：近平面换成水面，水下的东西（楼脚、地基）不进倒影
    const pl = this.plane.clone().applyMatrix4(cam.matrixWorldInverse);
    this.clipPlane.set(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant);
    const pm = cam.projectionMatrix.elements;
    const q = this.q;
    q.x = (Math.sign(this.clipPlane.x) + pm[8]!) / pm[0]!;
    q.y = (Math.sign(this.clipPlane.y) + pm[9]!) / pm[5]!;
    q.z = -1;
    q.w = (1 + pm[10]!) / pm[14]!;
    this.clipPlane.multiplyScalar(2 / this.clipPlane.dot(q));
    pm[2] = this.clipPlane.x;
    pm[6] = this.clipPlane.y;
    pm[10] = this.clipPlane.z + 1;
    pm[14] = this.clipPlane.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    const prev = renderer.getRenderTarget();
    this.cull();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    this.uncull();
  }

  dispose(): void {
    this.target.dispose();
    registerTextureBytes('atmosphere:reflection', 0);
  }
}
