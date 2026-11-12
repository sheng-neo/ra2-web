import * as THREE from 'three';

/** 递归释放一棵对象树上的几何体、材质，以及材质(含 ShaderMaterial uniform)引用的贴图 */
export function disposeObject3D(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) materials.add(m);
    (o as THREE.InstancedMesh).dispose?.();
  });
  for (const m of materials) {
    const uniforms = (m as THREE.ShaderMaterial).uniforms as Record<string, THREE.IUniform> | undefined;
    if (uniforms) {
      for (const k in uniforms) {
        const v = uniforms[k].value as unknown;
        if (v instanceof THREE.Texture) textures.add(v);
      }
    }
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
    m.dispose();
  }
  for (const t of textures) t.dispose();
}
