// 细部构件：檐椽 · 正脊与鸱吻 · 券脸与门扇 · 石狮 · 华表
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, std, box, cyl, group, sumeru, canvasTexture } from './lib.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
const inst = (geo, list, material, parent) => {
  const im = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
  parent.add(im);
  return im;
};

/** 椽头贴图：圆椽端面绘白底青绿“万字”，飞椽端面绘金边。 */
const rafterEndTex = canvasTexture(64, 64, (g, w, h) => {
  g.fillStyle = '#2f6f8e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e9e3d2'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.36, 0, 7); g.fill();
  g.strokeStyle = '#2f6f8e'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h / 2, w * 0.2, 0, 7); g.stroke();
});
mat.rafterEnd = std(0xffffff, { map: rafterEndTex, roughness: 0.8 });

/**
 * 檐椽与飞椽：沿檐口每 0.32 m 一根，圆椽在下、方飞椽在上，向外微向下伸出檐板之下。
 * ring 为屋面檐口点列（含翼角起翘），parent 与屋面同坐标。
 */
export function addRafters(ring, parent, { thickness = 0.55, spacing = 0.32 } = {}) {
  const round = [], flying = [], caps = [];
  const N = ring.length;
  // 沿环重采样到等距
  const pts = [];
  let acc = 0, next = 0;
  for (let i = 0; i < N; i++) {
    const a = ring[i], b = ring[(i + 1) % N];
    const seg = a.distanceTo(b);
    while (next <= acc + seg) {
      const t = (next - acc) / seg;
      pts.push({ p: a.clone().lerp(b, t), dir: b.clone().sub(a).normalize() });
      next += spacing;
    }
    acc += seg;
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const { p, dir } of pts) {
    // 外法线：环为俯视顺时针（s→e→n→w），外法线 = dir × up
    const out = new THREE.Vector3().crossVectors(dir, up).normalize();
    // 向内、向下取椽头位置：檐板之下 0.15，端面在檐口内 0.05
    const base = p.clone().addScaledVector(out, -0.05).add(new THREE.Vector3(0, -thickness - 0.16, 0));
    const fwd = out.clone().multiplyScalar(0.94).add(new THREE.Vector3(0, -0.34, 0)).normalize(); // 略向下
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const nrm = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const mr = new THREE.Matrix4().makeBasis(right, nrm, fwd); mr.setPosition(base.clone().addScaledVector(fwd, -0.6));
    round.push(mr.clone());
    const mc = new THREE.Matrix4().makeBasis(right, nrm, fwd); mc.setPosition(base);
    caps.push(mc);
    const fb = base.clone().add(new THREE.Vector3(0, 0.24, 0)).addScaledVector(out, 0.28);
    const mf = new THREE.Matrix4().makeBasis(right, nrm, out.clone().multiplyScalar(0.98).add(new THREE.Vector3(0, -0.2, 0)).normalize()); mf.setPosition(fb.clone().addScaledVector(out, -0.5));
    flying.push(mf);
  }
  const roundGeo = new THREE.CylinderGeometry(0.075, 0.075, 1.2, 8); roundGeo.rotateX(Math.PI / 2);
  const flyGeo = new THREE.BoxGeometry(0.13, 0.11, 1.0);
  const capGeo = new THREE.CircleGeometry(0.075, 10);
  inst(roundGeo, round, mat.jade, parent);
  inst(flyGeo, flying, mat.jadeLight, parent);
  inst(capGeo, caps, mat.rafterEnd, parent);
}

/** 鸱吻：龙头张口吞脊、尾部上卷的侧影，拉伸成体。sgn 为左右。 */
export function chiwen(sgn) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(1.6, 0); s.lineTo(1.6, 1.2);
  s.quadraticCurveTo(1.7, 2.4, 1.1, 3.0);          // 背脊上扬
  s.quadraticCurveTo(0.9, 3.3, 1.3, 3.5);          // 尾尖外卷
  s.quadraticCurveTo(1.9, 3.6, 1.5, 4.0);
  s.quadraticCurveTo(0.6, 4.3, 0.2, 3.4);          // 尾内卷
  s.lineTo(0.05, 2.2); s.lineTo(-0.5, 2.2);        // 张口上颚
  s.lineTo(-0.5, 1.7); s.lineTo(0.05, 1.5);        // 口
  s.lineTo(-0.3, 1.1); s.lineTo(0, 0.8);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -0.5);
  geo.scale(0.78, 0.78, 1);
  const m = new THREE.Mesh(geo, mat.glazeDeep);
  m.rotation.y = sgn > 0 ? 0 : Math.PI;   // 张口朝向正脊中央
  m.castShadow = true;
  return m;
}

/** 正脊：脊筒（成节）+ 脊座，两端鸱吻。 */
export function mainRidge(halfLen, y, parent) {
  const g = group(parent, 0, y, 0);
  box(halfLen * 2 + 1.2, 0.5, 1.15, mat.glazeDeep, 0, 0.25, 0, g);           // 脊座
  const segs = [];
  for (let x = -halfLen + 0.45; x < halfLen - 0.4; x += 0.9) {
    m4.compose(v.set(x, 0.5 + 0.42, 0), q.identity(), sc.set(0.8, 0.84, 0.95)); segs.push(m4.clone());
  }
  inst(new THREE.BoxGeometry(1, 1, 1), segs, mat.glazeDeep, g);
  box(halfLen * 2 + 1.0, 0.16, 1.05, mat.glazeDeep, 0, 1.36, 0, g);            // 顶带
  for (const sgn of [-1, 1]) {
    const c = chiwen(sgn); c.position.set(sgn * (halfLen + 0.2), 0.3, 0); g.add(c);
  }
  return g;
}

/** 券脸：汉白玉券石边框（拱 + 两侧直边），略凸出墙面。 */
export function archTrim(a, zFace, parent, sgnZ = 1) {
  const g = group(parent, a.x, 0, zFace + sgnZ * 0.18);
  const r = a.w / 2, cy = a.h - r, band = 0.55, t = 0.36;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(r + band / 2, 0, 1, 1), mat.marble);   // 占位，替换为环带
  g.remove(arc);
  // 环带：用 RingGeometry 挤出
  const ring = new THREE.Shape();
  ring.absarc(0, 0, r + band, 0, Math.PI, false); ring.lineTo(-r, 0); ring.absarc(0, 0, r, Math.PI, 0, true); ring.closePath();
  const rg = new THREE.ExtrudeGeometry(ring, { depth: t, bevelEnabled: false, curveSegments: 24 });
  rg.translate(0, cy, -t / 2);
  const rm = new THREE.Mesh(rg, mat.marble); rm.castShadow = rm.receiveShadow = true; g.add(rm);
  for (const sx of [-1, 1]) box(band, cy, t, mat.marble, sx * (r + band / 2), cy / 2, 0, g);
  return g;
}

/** 门扇：朱红大门，九路门钉（9×9 鎏金），开启约 80°，靠向门洞内壁。 */
export function gateDoors(a, zFace, parent) {
  const g = group(parent, a.x, 0, zFace - 1.2);
  const leafW = a.w / 2 - 0.12, leafH = a.h - 0.4, thick = 0.18;
  for (const sgn of [-1, 1]) {
    const hinge = group(g, sgn * (a.w / 2 - 0.02), 0, 0);
    const leaf = box(leafW, leafH, thick, mat.vermilionDeep, -sgn * leafW / 2, leafH / 2, 0, hinge);
    leaf.material = mat.vermilionDeep;
    // 门钉：面向门洞内（打开后朝向通道）
    const studs = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const x = -sgn * (0.28 + (c + 0.5) * (leafW - 0.56) / 9), y = 0.5 + (r + 0.5) * (leafH - 1.0) / 9;
      m4.compose(v.set(x, y, thick / 2 + 0.03), q.identity(), sc.set(1, 1, 1)); studs.push(m4.clone());
    }
    inst(new THREE.SphereGeometry(0.075, 8, 6), studs, mat.gold, hinge);
    // 铺首（门环）
    cyl(0.16, 0.16, 0.05, mat.gold, -sgn * leafW * 0.5, leafH * 0.52, thick / 2 + 0.04, 12, hinge).rotation.x = Math.PI / 2;
    hinge.rotation.y = -sgn * (Math.PI / 2 - 0.1);   // 向门洞内开启，贴向内壁
  }
  return g;
}

/** 石狮：座、身、胸、头、鬃卷、前腿、绣球 / 幼狮。faceSouth 决定朝向，male 为雄狮（踏球）。 */
export function lion(x, z, faceSouth, male, parent) {
  const g = group(parent, x, 0, z);
  sumeru(g, 2.5, 1.9, 1.25, 0, 0, 0, mat.marbleShade);
  const Y = 1.25;
  const part = (geo, px, py, pz, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat.stone); m.position.set(px, Y + py, pz); m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const sph = (r) => new THREE.SphereGeometry(r, 16, 12);
  part(sph(0.66), 0, 0.72, -0.25, 1.0, 0.9, 1.35);              // 后躯
  part(sph(0.6), 0, 0.95, 0.42, 1.0, 1.15, 0.85);               // 胸
  part(sph(0.46), 0, 1.72, 0.5, 1.0, 0.92, 1.0);                // 头
  part(sph(0.2), 0, 1.55, 0.92, 1.15, 0.7, 0.9);                // 吻
  part(new THREE.BoxGeometry(0.34, 0.1, 0.16), 0, 1.66, 1.02);  // 鼻
  for (const sx of [-0.19, 0.19]) part(sph(0.07), sx, 1.82, 0.9);          // 眼
  for (const sx of [-0.3, 0.3]) part(new THREE.ConeGeometry(0.1, 0.22, 6), sx, 2.15, 0.35);   // 耳
  // 鬃：环绕头颈两层螺卷
  const curls = [];
  for (let ring = 0; ring < 2; ring++) {
    const n = 11 + ring * 5, rad = 0.5 + ring * 0.2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.cos(a) * rad, py = Y + 1.72 + Math.sin(a) * rad * 0.9, pz = 0.3 - ring * 0.28;
      if (py < Y + 1.05) continue;
      m4.compose(v.set(px, py, pz), q.identity(), sc.set(1, 1, 1).multiplyScalar(0.15 + ring * 0.03)); curls.push(m4.clone());
    }
  }
  inst(new THREE.SphereGeometry(1, 8, 6), curls, mat.stone, g);
  for (const sx of [-0.38, 0.38]) {                               // 前腿与爪
    part(new THREE.CylinderGeometry(0.16, 0.19, 1.15, 10), sx, 0.6, 0.72);
    part(new THREE.BoxGeometry(0.36, 0.2, 0.48), sx, 0.1, 0.82);
  }
  for (const sx of [-0.46, 0.46]) part(new THREE.SphereGeometry(0.34, 12, 10), sx, 0.42, -0.5, 1, 0.9, 1.2);   // 后腿
  if (male) part(sph(0.24), 0.55, 0.22, 0.95);
  else part(sph(0.2), -0.5, 0.18, 0.9, 1, 0.8, 1.5);
  g.rotation.y = faceSouth ? 0 : Math.PI;
  return g;
}

/** 华表：八角须弥座与围栏、盘龙柱、云板、承露盘与犼。通高 9.57。 */
export function huabiao(x, z, parent, faceSouth = true) {
  const g = group(parent, x, 0, z);
  sumeru(g, 3.2, 3.2, 1.2, 0, 0, 0);
  cyl(1.5, 1.6, 0.4, mat.marbleShade, 0, 1.4, 0, 8, g);
  const colH = 6.2;
  cyl(0.46, 0.5, colH, mat.marble, 0, 1.6 + colH / 2, 0, 8, g);
  // 盘龙：绕柱螺旋的管体
  const pts = [];
  for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 2 * 2.2; pts.push(new THREE.Vector3(Math.cos(a) * 0.52, 1.9 + t * (colH - 0.8), Math.sin(a) * 0.52)); }
  const dragon = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.075, 7, false), mat.marbleShade);
  dragon.castShadow = true; g.add(dragon);
  // 云板：云头形板，横穿柱身
  const cs = new THREE.Shape();
  cs.moveTo(-1.5, -0.35); cs.lineTo(1.2, -0.35);
  cs.quadraticCurveTo(1.75, -0.3, 1.5, 0.05); cs.quadraticCurveTo(1.85, 0.25, 1.45, 0.45); cs.quadraticCurveTo(1.2, 0.7, 0.85, 0.45);
  cs.lineTo(-0.85, 0.45); cs.quadraticCurveTo(-1.2, 0.7, -1.45, 0.45); cs.quadraticCurveTo(-1.85, 0.25, -1.5, 0.05); cs.quadraticCurveTo(-1.75, -0.3, -1.5, -0.35);
  const cb = new THREE.Mesh(new THREE.ExtrudeGeometry(cs, { depth: 0.26, bevelEnabled: false, curveSegments: 10 }), mat.marble);
  cb.geometry.translate(0, 0, -0.13); cb.position.y = 7.3; cb.castShadow = true; g.add(cb);
  cyl(1.0, 0.85, 0.26, mat.marble, 0, 7.95, 0, 20, g);              // 承露盘
  const hou = group(g, 0, 8.25, 0);                                   // 犼：蹲兽
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat.marble); hb.scale.set(0.8, 1, 1.25); hb.position.y = 0.45; hou.add(hb);
  const hh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat.marble); hh.position.set(0, 0.95, 0.35); hou.add(hh);
  box(0.16, 0.5, 0.16, mat.marble, -0.18, 0.28, 0.35, hou); box(0.16, 0.5, 0.16, mat.marble, 0.18, 0.28, 0.35, hou);
  hou.rotation.y = faceSouth ? 0 : Math.PI;
  // 基座围栏
  const rail = group(g);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, r = 2.35;
    const p = cyl(0.11, 0.11, 0.9, mat.marble, Math.cos(a) * r, 1.65, Math.sin(a) * r, 8, rail);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat.marble); cap.position.set(Math.cos(a) * r, 2.15, Math.sin(a) * r); rail.add(cap);
    void p;
    const a2 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    const mx = (Math.cos(a) + Math.cos(a2)) / 2 * r, mz = (Math.sin(a) + Math.sin(a2)) / 2 * r;
    const len = Math.hypot(Math.cos(a2) - Math.cos(a), Math.sin(a2) - Math.sin(a)) * r;
    const panel = box(len - 0.24, 0.5, 0.1, mat.marbleShade, mx, 1.55, mz, rail);
    panel.rotation.y = -Math.atan2(Math.sin(a2) - Math.sin(a), Math.cos(a2) - Math.cos(a));
  }
  return g;
}
