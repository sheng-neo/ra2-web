// 琉璃瓦实例化：在放样屋面上按列铺筒瓦（半圆筒），檐口加瓦当与滴水
import * as THREE from 'three';
import { mat } from './lib.js';

const tileGeo = (() => {
  const g = new THREE.CylinderGeometry(0.115, 0.115, 1, 7, 1, true, 0, Math.PI);
  g.rotateX(-Math.PI / 2);          // 轴向 +Z，弧面朝 +Y
  g.translate(0, 0, 0.5);           // 从 z=0 延伸到 z=1（沿坡向）
  return g;
})();
const wadangGeo = (() => { const g = new THREE.CircleGeometry(0.135, 10); return g; })();   // 瓦当：圆形，法线 +Z
const dishuiGeo = (() => {                                                                 // 滴水：倒三角
  const s = new THREE.Shape(); s.moveTo(-0.15, 0); s.lineTo(0.15, 0); s.lineTo(0, -0.2); s.closePath();
  return new THREE.ShapeGeometry(s);
})();

/**
 * 给一片放样屋面铺瓦。roofMesh 需带 userData.loft（roofLoft 生成）。
 * 列距 spacing、行距 rowStep（米）。返回 Group（挂到与屋面相同的父节点、同一位置）。
 */
export function roofTiles(roofMesh, { spacing = 0.32, rowStep = 0.31 } = {}) {
  const L = roofMesh.userData.loft;
  const cw = (d) => L.hw - (L.gableAt != null ? Math.min(d, L.gableAt) : d);
  const cl = (d) => L.hl - d;
  // 表面点：side 's'|'n' 用 x，'e'|'w' 用 z
  const point = (side, a, d) => {
    let x, z, dc;
    if (side === 's' || side === 'n') { x = a; z = (side === 's' ? 1 : -1) * cl(d); dc = Math.min(a + cw(d), cw(d) - a); }
    else { z = a; x = (side === 'e' ? 1 : -1) * cw(d); dc = Math.min(a + cl(d), cl(d) - a); }
    return new THREE.Vector3(x, L.yAt(d) + L.liftAt(Math.max(0, dc), d), z);
  };
  const tiles = [], caps = [], drips = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of ['s', 'n', 'e', 'w']) {
    const alongHalf = (side === 's' || side === 'n') ? L.hw : L.hl;
    const dMax = (side === 'e' || side === 'w') && L.gableAt != null ? Math.min(L.depthIn, L.gableAt) : L.depthIn;
    const nCols = Math.floor((alongHalf * 2 - 0.2) / spacing);
    for (let i = 0; i <= nCols; i++) {
      const a = -alongHalf + 0.1 + i * spacing + (spacing / 2);
      if (a > alongHalf - 0.1) break;
      let first = true;
      for (let d = 0; d < dMax - 0.05; d += rowStep) {
        const limit = (side === 's' || side === 'n') ? cw(d) : cl(d);
        if (Math.abs(a) > limit - 0.12) break;         // 出了这片坡（进入戗脊另一侧）
        const d2 = Math.min(d + rowStep, dMax);
        const p0 = point(side, a, d), p1 = point(side, a, d2);
        const fwd = p1.clone().sub(p0);
        const len = fwd.length(); fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
        const nrm = new THREE.Vector3().crossVectors(right, fwd).normalize();
        const m = new THREE.Matrix4().makeBasis(right, nrm, fwd.clone().multiplyScalar(len * 1.08));
        m.setPosition(p0);
        tiles.push(m);
        if (first) {
          // 瓦当：立在檐口，法线朝外（-fwd）
          const outward = fwd.clone().negate();
          const mc = new THREE.Matrix4().makeBasis(right.clone().negate(), nrm, outward);
          mc.setPosition(p0.clone().addScaledVector(outward, 0.02).addScaledVector(nrm, 0.0));
          caps.push(mc);
          // 滴水：挂在相邻两列之间、檐口下缘
          const pd = point(side, a + spacing / 2, d);
          const md = new THREE.Matrix4().makeBasis(right.clone().negate(), nrm, outward);
          md.setPosition(pd.clone().addScaledVector(outward, 0.03).addScaledVector(nrm, -0.09));
          drips.push(md);
          first = false;
        }
      }
    }
  }
  const g = new THREE.Group();
  const mk = (geo, list, material) => {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    g.add(im);
    return im;
  };
  const tm = mk(tileGeo, tiles, mat.tile);
  // 每片瓦轻微色差
  const col = new THREE.Color();
  for (let i = 0; i < tiles.length; i++) {
    const k = 0.9 + ((i * 7919) % 97) / 97 * 0.2;
    col.setRGB(k, k * (0.97 + ((i * 131) % 13) / 400), k * 0.92);
    tm.setColorAt(i, col);
  }
  tm.instanceColor.needsUpdate = true;
  mk(wadangGeo, caps, mat.glazeDeep);
  mk(dishuiGeo, drips, mat.glazeDeep);
  g.userData.count = tiles.length;
  return g;
}
