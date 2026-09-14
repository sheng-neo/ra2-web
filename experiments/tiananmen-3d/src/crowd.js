// 人群：低模行人（躯干 + 头 + 腿），实例化，随机衣色与朝向，散布在广场、长安街人行道与桥上
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, group, describe } from './lib.js';

function figureGeometry() {
  const torso = new THREE.CapsuleGeometry(0.19, 0.5, 4, 8); torso.translate(0, 1.15, 0);
  const head = new THREE.SphereGeometry(0.11, 8, 6); head.translate(0, 1.6, 0);
  const legL = new THREE.CylinderGeometry(0.07, 0.06, 0.8, 6); legL.translate(-0.1, 0.4, 0);
  const legR = new THREE.CylinderGeometry(0.07, 0.06, 0.8, 6); legR.translate(0.1, 0.4, 0);
  const armL = new THREE.CylinderGeometry(0.05, 0.045, 0.6, 5); armL.translate(-0.27, 1.12, 0);
  const armR = new THREE.CylinderGeometry(0.05, 0.045, 0.6, 5); armR.translate(0.27, 1.12, 0);
  return mergeGeometries([torso, head, legL, legR, armL, armR]);
}

export function addCrowd({ river, front, count = 420, bridgeY = () => 0 }) {
  const g = group(scene);
  const geo = figureGeometry();
  const matBody = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, envMapIntensity: 0.3 });
  const im = new THREE.InstancedMesh(geo, matBody, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  const rnd = (a, b) => a + Math.random() * (b - a);
  let i = 0;
  const place = (x, z) => {
    if (i >= count) return;
    const s = rnd(0.9, 1.08);
    q.setFromEuler(e.set(0, rnd(0, Math.PI * 2), 0));
    m4.compose(v.set(x, bridgeY(x, z), z), q, sc.set(s, s, s));
    im.setMatrixAt(i, m4);
    const palette = [0x2b2b33, 0xe9e2d5, 0x8c2a2e, 0x3a5a8c, 0xd8b56a, 0x4a6a4f, 0x6b3f5a, 0xf0f0ea, 0x1f3a5f, 0xb35b3a];
    col.setHex(palette[Math.floor(Math.random() * palette.length)]).offsetHSL(rnd(-0.02, 0.02), 0, rnd(-0.08, 0.08));
    im.setColorAt(i, col);
    i++;
  };
  // 广场（长安街南、旗杆周围）
  for (let k = 0; k < count * 0.45; k++) place(rnd(-90, 90), rnd(river.z1 + 72, river.z1 + 150));
  // 河与门之间的前庭（游客拍照区）
  for (let k = 0; k < count * 0.3; k++) place(rnd(-46, 46), rnd(front + 3, river.z0 - 3));
  // 桥上
  for (const bx of [0, -18.5, 18.5, -37, 37]) for (let k = 0; k < 8; k++) place(bx + rnd(-1.6, 1.6), rnd(river.z0 - 2, river.z1 + 2));
  // 长安街北侧人行道
  for (let k = 0; k < count * 0.12; k++) place(rnd(-160, 160), rnd(river.z1 + 1.5, river.z1 + 5));
  im.count = i;
  im.instanceColor.needsUpdate = true;
  im.castShadow = true; im.receiveShadow = true;
  g.add(im);
  describe(g, {
    eyebrow: '广场', title: '游客', sub: 'VISITORS',
    text: '天安门前每日游人如织。人物为示意比例用的简化模型（身高约 1.7 m），帮助判断城楼与广场的真实尺度。',
    dims: [['人数', `${i} 人（示意）`], ['身高', '约 1.7 m']],
  });
  return g;
}
