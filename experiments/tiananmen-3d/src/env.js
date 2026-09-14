// 周边环境 · 天空与昼夜 · 灯光 —— 尺寸按公开资料（米）
//   外金水河：宽 18，长 500，北岸距城台墙基 32；外金水桥五座（御路 8.55 / 王公 5.78 / 品级 4.55 宽，长 23.15）+ 两座公生桥
//   华表：通高 9.57，柱径 0.98，同侧一对间距 96；石狮高 3.4（含座）；国旗杆净高 30
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import waterNormalsUrl from '../assets/waternormals.jpg';
import { scene, mat, std, C, box, cyl, group, describe, canvasTexture, balustrade, nightOnly, lanternMats } from './lib.js';
import { layers, RAMPART, ARCHES } from './gate.js';

export const isSmall = Math.min(innerWidth, innerHeight) < 560;
const FRONT = RAMPART.hlBot;                                  // 城台南面墙基 z = 20
const RIVER = { z0: FRONT + 32, z1: FRONT + 32 + 18, hx: 250, depth: 3.0 };   // 52 → 70
export { RIVER };

// ---- 地面（金水河处分块留槽） ----
{
  const mk = (w, d, x, z) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.plaza);
    g.rotation.x = -Math.PI / 2; g.position.set(x, -0.02, z); g.receiveShadow = true;
    scene.add(g);
    return g;
  };
  const S = 700;
  mk(1400, S + RIVER.z0, 0, (RIVER.z0 - S) / 2);
  mk(1400, S - RIVER.z1, 0, (RIVER.z1 + S) / 2);
  mk(S - RIVER.hx, RIVER.z1 - RIVER.z0, (RIVER.hx + S) / 2, (RIVER.z0 + RIVER.z1) / 2);
  mk(S - RIVER.hx, RIVER.z1 - RIVER.z0, -(RIVER.hx + S) / 2, (RIVER.z0 + RIVER.z1) / 2);
  for (const z of [RIVER.z0, RIVER.z1]) box(RIVER.hx * 2, RIVER.depth, 0.6, mat.marbleShade, 0, -RIVER.depth / 2, z);
  for (const x of [-RIVER.hx, RIVER.hx]) box(0.6, RIVER.depth, RIVER.z1 - RIVER.z0, mat.marbleShade, x, -RIVER.depth / 2, (RIVER.z0 + RIVER.z1) / 2);
}

// ---- 金水桥：五座正对券门 + 两座公生桥 ----
const BRIDGES = [
  { x: 0, w: 8.55, name: '御路桥' },
  { x: ARCHES[1].x, w: 5.78, name: '王公桥' }, { x: ARCHES[3].x, w: 5.78, name: '王公桥' },
  { x: ARCHES[0].x, w: 4.55, name: '品级桥' }, { x: ARCHES[4].x, w: 4.55, name: '品级桥' },
  { x: -96, w: 4.6, name: '公生桥' }, { x: 96, w: 4.6, name: '公生桥' },
].sort((a, b) => a.x - b.x);
const BRIDGE_L = 23.15;

// ---- 金水河：带波纹与日光高光的反射水面（Water） ----
export const reflector = null;
export let water = null;
{
  const river = group(scene);
  const geo = new THREE.PlaneGeometry(RIVER.hx * 2, RIVER.z1 - RIVER.z0);
  const waterNormals = new THREE.TextureLoader().load(waterNormalsUrl, (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  water = new Water(geo, {
    textureWidth: isSmall ? 512 : 1024,
    textureHeight: isSmall ? 512 : 1024,
    waterNormals,
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: 0xffffff,
    waterColor: 0x17414d,
    distortionScale: 0.12,
    fog: true,
    clipBias: 0.002,
  });
  water.material.uniforms.size.value = 6.0;
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -RIVER.depth, (RIVER.z0 + RIVER.z1) / 2);
  river.add(water);
  describe(river, {
    eyebrow: '前庭', title: '外金水河', sub: 'OUTER GOLDEN WATER RIVER',
    text: '天安门前的外金水河自西向东穿过，全长 500 m、宽 18 m，北岸距城台墙基 32 m。河上架七座汉白玉石桥，中间五座正对五阙券门。水面倒映城楼，是最经典的取景角度。',
    dims: [['河宽', '18 m'], ['全长', '500 m'], ['距墙基', '32 m'], ['桥数', '七座']],
  });
  // 两岸栏杆：避开桥位分段
  const bankRail = (z) => {
    const cuts = BRIDGES.map((b) => [b.x - b.w / 2 - 0.4, b.x + b.w / 2 + 0.4]);
    let x = -RIVER.hx;
    for (const [c0, c1] of [...cuts, [RIVER.hx, RIVER.hx]]) {
      if (c0 - x > 1.5) {
        const g = balustrade(scene, (c0 - x) / 2, 0.01, 0, { sides: 's', step: 2.2, postH: 1.2, panelH: 0.75 });
        g.position.set((x + c0) / 2, 0, z);
      }
      x = c1;
    }
  };
  bankRail(RIVER.z0 - 0.7);
  bankRail(RIVER.z1 + 0.7);
}
{
  const bridges = group(scene);
  const mkBridge = (x, w) => {
    const L = BRIDGE_L, half = L / 2, hump = 1.3;
    const prof = (t) => hump * Math.cos((t / half) * Math.PI / 2) ** 1.4;
    const s = new THREE.Shape();
    s.moveTo(-half, -RIVER.depth + 0.2);
    s.lineTo(-half, 0);
    const n = 24;
    for (let i = 0; i <= n; i++) { const t = -half + (i / n) * L; s.lineTo(t, prof(t)); }
    s.lineTo(half, -RIVER.depth + 0.2);
    s.lineTo(half * 0.72, -RIVER.depth + 0.2);
    s.absarc(0, -RIVER.depth + 0.2, half * 0.72, 0, Math.PI, true);
    s.lineTo(-half, -RIVER.depth + 0.2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 16 });
    geo.translate(0, 0, -w / 2);
    const deck = new THREE.Mesh(geo, mat.marble);
    deck.rotation.y = Math.PI / 2;
    deck.position.set(x, 0, (RIVER.z0 + RIVER.z1) / 2);
    deck.castShadow = deck.receiveShadow = true;
    bridges.add(deck);
    const postGeo = new THREE.BoxGeometry(0.3, 1.1, 0.3);
    const count = 11;
    for (const side of [-1, 1]) {
      const pm = new THREE.InstancedMesh(postGeo, mat.marble, count);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        const t = -half + 0.3 + (i / (count - 1)) * (L - 0.6);
        m4.makeTranslation(x + side * (w / 2 - 0.25), prof(t) + 0.55, (RIVER.z0 + RIVER.z1) / 2 + t);
        pm.setMatrixAt(i, m4);
      }
      pm.castShadow = true;
      bridges.add(pm);
      for (let i = 0; i < count - 1; i++) {
        const t0 = -half + 0.3 + (i / (count - 1)) * (L - 0.6), t1 = -half + 0.3 + ((i + 1) / (count - 1)) * (L - 0.6);
        const y0 = prof(t0), y1 = prof(t1);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, Math.hypot(t1 - t0, y1 - y0)), mat.marbleShade);
        panel.position.set(x + side * (w / 2 - 0.25), (y0 + y1) / 2 + 0.4, (RIVER.z0 + RIVER.z1) / 2 + (t0 + t1) / 2);
        panel.rotation.x = -Math.atan2(y1 - y0, t1 - t0);
        bridges.add(panel);
      }
    }
  };
  for (const b of BRIDGES) mkBridge(b.x, b.w);
  describe(bridges, {
    eyebrow: '前庭', title: '外金水桥', sub: 'GOLDEN WATER BRIDGES',
    text: '正对五阙券门的五座汉白玉拱桥长均 23.15 m：中央御路桥宽 8.55 m，两侧王公桥宽 5.78 m，再外品级桥宽 4.55 m，与门阙等级一一对应；东西更远处还有两座公生桥，合计七座。',
    dims: [['桥长', '23.15 m'], ['御路桥宽', '8.55 m'], ['王公桥 / 品级桥', '5.78 / 4.55 m']],
  });
}

// ---- 华表：同侧一对间距 96 m ----
{
  const mkHuabiao = (x, z, parent) => {
    const g = group(parent, x, 0, z);
    cyl(1.9, 2.1, 0.9, mat.marble, 0, 0.45, 0, 8, g);
    cyl(1.5, 1.7, 0.6, mat.marbleShade, 0, 1.2, 0, 8, g);
    cyl(0.49, 0.55, 6.9, mat.marble, 0, 1.5 + 3.45, 0, 8, g);
    box(3.0, 0.8, 0.3, mat.marble, 0, 7.4, 0, g);
    cyl(0.95, 0.95, 0.22, mat.marble, 0, 8.6, 0, 16, g);
    const hou = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat.marble);
    hou.position.y = 9.1; hou.scale.set(0.9, 1, 1.3); hou.castShadow = true;
    g.add(hou);
    balustrade(g, 2.2, 2.2, 0, { postH: 0.9, panelH: 0.55, step: 1.5 });
    return g;
  };
  const hb = group(scene);
  mkHuabiao(-48, FRONT + 24, hb); mkHuabiao(48, FRONT + 24, hb);
  mkHuabiao(-48, -FRONT - 14, hb); mkHuabiao(48, -FRONT - 14, hb);
  describe(hb, {
    eyebrow: '前庭', title: '华表', sub: 'HUABIAO · ORNAMENTAL COLUMNS',
    text: '门前门后各一对汉白玉华表，建于明永乐十八年（1420）：通高 9.57 m，柱径 0.98 m，重 20 余吨，同侧一对相距 96 m。柱身盘龙、顶置云板与承露盘，盘上蹲兽名“犼”。门前的犼面向南，称“望君归”；门后的面北，称“望君出”。',
    dims: [['通高', '9.57 m'], ['柱径', '0.98 m'], ['间距', '96 m'], ['数量', '四座']],
  });
}

// ---- 石狮：高 3.4 m（含座） ----
{
  const mkLion = (x, z, faceSouth, parent) => {
    const g = group(parent, x, 0, z);
    box(2.6, 1.4, 1.9, mat.marbleShade, 0, 0.7, 0, g);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), mat.stone);
    body.scale.set(1, 1.05, 1.5); body.position.set(0, 2.1, 0.1); body.castShadow = true; g.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), mat.stone);
    chest.position.set(0, 2.45, 0.85); chest.castShadow = true; g.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), mat.stone);
    head.position.set(0, 3.15, 0.95); head.castShadow = true; g.add(head);
    const mane = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.2, 8, 14), mat.stone);
    mane.position.set(0, 3.0, 0.62); mane.castShadow = true; g.add(mane);
    for (const sx of [-0.5, 0.5]) box(0.38, 1.1, 0.45, mat.stone, sx, 1.95, 1.2, g);
    box(0.8, 0.5, 1.0, mat.stone, 0, 1.7, -0.8, g);
    g.rotation.y = faceSouth ? 0 : Math.PI;
    return g;
  };
  const lions = group(scene);
  mkLion(-10, FRONT + 9, true, lions); mkLion(10, FRONT + 9, true, lions);
  mkLion(-10, -FRONT - 9, false, lions); mkLion(10, -FRONT - 9, false, lions);
  describe(lions, {
    eyebrow: '前庭', title: '石狮', sub: 'STONE LIONS',
    text: '门前门后各一对明代汉白玉石狮，连座高 3.4 m，是北京最高大的石狮。东为雄狮踏绣球，西为雌狮抚幼狮。传说东狮腹部有一处凹痕，为 1900 年前后战火所留。',
    dims: [['年代', '明 · 永乐年间'], ['高', '3.4 m（含座）']],
  });
}

// ---- 长安街 ----
{
  const road = group(scene);
  const z0 = RIVER.z1 + 6, z1 = z0 + 64;
  box(700, 0.12, z1 - z0, mat.asphalt, 0, 0.04, (z0 + z1) / 2, road).receiveShadow = true;
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.02, 0.25), new THREE.MeshBasicMaterial({ color: 0xe9e4d6 }), 5 * 86);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let lane = -2; lane <= 2; lane++) for (let i = 0; i < 86; i++) {
    m4.makeTranslation(-344 + i * 8, 0.11, (z0 + z1) / 2 + lane * 6.5);
    dash.setMatrixAt(k++, m4);
  }
  road.add(dash);
  box(700, 0.3, 1.2, mat.marbleShade, 0, 0.15, z0 - 0.6, road);
  box(700, 0.3, 1.2, mat.marbleShade, 0, 0.15, z1 + 0.6, road);
  describe(road, {
    eyebrow: '前庭', title: '长安街', sub: "CHANG'AN AVENUE",
    text: '东西横贯天安门前的长安街是北京的中轴横线，红线宽 100 m；金水桥南至国旗杆之间铺成宽 80 m 的石板道。国庆阅兵的受阅方队自东向西沿此街行进，于城楼前通过。',
    dims: [['红线宽', '100 m'], ['石板道', '80 m'], ['走向', '东西向']],
  });
}

// ---- 国旗：杆净高 30 m，距金水桥南端约 80 m ----
export const flag = {};
{
  const g = group(scene, 0, 0, RIVER.z1 + 4 + 80);
  cyl(2.2, 2.4, 0.4, mat.marble, 0, 0.2, 0, 8, g);
  cyl(0.18, 0.24, 30, std(0xd8d4cc, { metalness: 0.7, roughness: 0.3 }), 0, 15.2, 0, 10, g);
  const flagTex = canvasTexture(512, 342, (ctx, w, h) => {
    ctx.fillStyle = '#de2910'; ctx.fillRect(0, 0, w, h);
    const star = (cx, cy, r, rot) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.382 : r, a = rot + (i * Math.PI) / 5;
        ctx.lineTo(cx + rr * Math.sin(a), cy - rr * Math.cos(a));
      }
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = '#ffde00';
    const u = w / 30;
    star(5 * u, 5 * u, 3 * u, 0);
    for (const [x, y] of [[10, 2], [12, 4], [12, 7], [10, 9]]) star(x * u, y * u, u, Math.atan2(x - 5, -(y - 5)) + Math.PI);
  });
  const geo = new THREE.PlaneGeometry(5, 3.33, 30, 18);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.35 }));
  cloth.position.set(2.55, 28.2, 0);
  cloth.castShadow = true;
  g.add(cloth);
  flag.mesh = cloth;
  flag.base = geo.attributes.position.array.slice();
  describe(g, {
    eyebrow: '广场', title: '国旗杆', sub: 'NATIONAL FLAGPOLE',
    text: '国旗杆立于长安街南侧、天安门广场北端，净高 30 m（含地下部分 32.6 m）。每日随太阳升起升旗、日落降旗，国旗为 5 × 3.33 m 的一号旗。',
    dims: [['杆高', '30 m（净高）'], ['旗面', '5 × 3.33 m']],
  });
}

// ---- 松柏：树干 + 多团不规则树冠（实例化） ----
{
  const trees = group(scene);
  const blob = new THREE.IcosahedronGeometry(1, 2);
  { const p = blob.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.82 + ((i * 7919) % 101) / 101 * 0.36; p.setXYZ(i, p.getX(i) * k, p.getY(i) * (0.7 + ((i * 131) % 17) / 40), p.getZ(i) * k); } blob.computeVertexNormals(); }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 7);
  const spots = [];
  for (const sgn of [-1, 1]) {
    for (let x = 66; x <= 250; x += 7.5) spots.push([sgn * x, RIVER.z0 - 9 + (x % 3), 0.85 + (x % 5) / 8, x * 0.37]);
    for (let x = 66; x <= 250; x += 9) spots.push([sgn * x, -FRONT - 10 - (x % 4), 0.95 + (x % 7) / 10, x * 0.53]);
  }
  const BLOBS = 5;
  const mF = new THREE.InstancedMesh(blob, mat.pine, spots.length * BLOBS), mT = new THREE.InstancedMesh(trunkGeo, mat.trunk, spots.length);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  spots.forEach(([x, z, s, seed], i) => {
    const h = 7.5 * s;
    m4.compose(v.set(x, h * 0.5, z), q.identity(), sc.set(1, h, 1)); mT.setMatrixAt(i, m4);
    for (let b = 0; b < BLOBS; b++) {
      const t = b / (BLOBS - 1);
      const ang = seed + b * 2.4, r = (1 - t) * 1.6 * s;
      const y = h * (0.42 + 0.58 * t), rad = (2.6 - 1.4 * t) * s;
      q.setFromEuler(e.set(0, seed + b, 0));
      m4.compose(v.set(x + Math.cos(ang) * r, y, z + Math.sin(ang) * r), q, sc.set(rad, rad * 0.75, rad));
      mF.setMatrixAt(i * BLOBS + b, m4);
      col.setHSL(0.34 + ((i * 13 + b * 7) % 10) / 100 - 0.05, 0.42, 0.2 + t * 0.07);
      mF.setColorAt(i * BLOBS + b, col);
    }
  });
  mF.instanceColor.needsUpdate = true;
  mF.castShadow = mT.castShadow = true; mF.receiveShadow = true;
  trees.add(mF, mT);
}

// ============================================================================
// 灯光 · 物理天空 · 时刻
// ============================================================================
export const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7a5a, 0.9);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff1d6, 3.0);
sun.castShadow = !isSmall;
sun.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 620;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const moonLight = new THREE.DirectionalLight(0x9db4ff, 0);
moonLight.position.set(-120, 200, -80);
scene.add(moonLight);

// 夜景泛光灯（物理衰减）
for (const [x, z, tx, i] of [[-70, 76, -20, 9000], [70, 76, 20, 9000], [0, 74, 0, 8000], [-80, -50, -15, 8000], [80, -50, 15, 8000]]) {
  const sp = new THREE.SpotLight(0xffc98a, 0, 320, Math.PI / 6, 0.6, 2);
  sp.position.set(x, 4, z);
  sp.target.position.set(tx, 22, 0);
  scene.add(sp, sp.target);
  nightOnly.push({ light: sp, intensity: i });
}
{
  const sp = new THREE.SpotLight(0xffe2b0, 0, 110, Math.PI / 9, 0.5, 2);
  sp.position.set(0, 3, FRONT + 30); sp.target.position.set(0, 11, FRONT);
  scene.add(sp, sp.target);
  nightOnly.push({ light: sp, intensity: 1100 });
}

// 轮廓灯（HDR 亮度 >1，供辉光提取）
{
  const pts = [];
  for (const ring of [layers.roof.userData.eaveRing, layers.lowerEave.userData.eaveRing]) {
    for (let i = 0; i < ring.length; i += 2) pts.push([ring[i].x, ring[i].y + 0.35, ring[i].z, ring === layers.roof.userData.eaveRing ? 'roof' : 'lowerEave']);
  }
  const hw = RAMPART.hwTop, hl = RAMPART.hlTop, y = RAMPART.top + 0.1;
  for (let x = -hw; x <= hw; x += 1.5) { pts.push([x, y, hl, 'rampart']); pts.push([x, y, -hl, 'rampart']); }
  for (let z = -hl + 1.5; z < hl; z += 1.5) { pts.push([hw, y, z, 'rampart']); pts.push([-hw, y, z, 'rampart']); }
  const byLayer = {};
  for (const p of pts) (byLayer[p[3]] ||= []).push(p);
  const m4 = new THREE.Matrix4();
  for (const [name, list] of Object.entries(byLayer)) {
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 5), mat.bulb, list.length);
    list.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); inst.setMatrixAt(i, m4); });
    inst.visible = false;
    layers[name].add(inst);
    nightOnly.push({ mesh: inst });
  }
}

// 物理天空 · 星空 · 月亮
export const sky = new Sky();
sky.scale.setScalar(450000);
sky.material.uniforms.turbidity.value = 1.9;
sky.material.uniforms.rayleigh.value = 3.4;
sky.material.uniforms.mieCoefficient.value = 0.003;
sky.material.uniforms.mieDirectionalG.value = 0.8;
// Preetham 天空在 ACES 下偏白，整体压暗并略偏蓝，接近晴天照片的天色
sky.material.fragmentShader = sky.material.fragmentShader.replace(
  'gl_FragColor = vec4( retColor, 1.0 );',
  'retColor *= vec3( 0.42, 0.50, 0.70 ); gl_FragColor = vec4( retColor, 1.0 );',
);
sky.material.needsUpdate = true;
scene.add(sky);

export const stars = (() => {
  const n = 1100, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 0.9 + 0.08);
    arr[i * 3] = 640 * Math.sin(b) * Math.cos(a); arr[i * 3 + 1] = 640 * Math.cos(b); arr[i * 3 + 2] = 640 * Math.sin(b) * Math.sin(a);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6e0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(p);
  return p;
})();
const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 2.0), transparent: true, opacity: 0, depthWrite: false, fog: false }));
moon.position.set(-0.45, 0.62, -0.65).normalize().multiplyScalar(620);
scene.add(moon);

scene.fog = new THREE.Fog(0xd7dfe6, 320, 760);

// 云层：程序噪声贴图的高空平面，缓慢漂移
const cloudTex = canvasTexture(512, 512, (g, w, h) => {
  const img = g.createImageData(w, h);
  // 简易分形噪声（值噪声叠加）
  const rnd = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = rnd(xi, yi), b = rnd(xi + 1, yi), c = rnd(xi, yi + 1), d = rnd(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let f = 0, amp = 0.5, fr = 4 / w;
    for (let o = 0; o < 5; o++) { f += amp * noise(x * fr, y * fr); amp *= 0.5; fr *= 2; }
    const a = Math.min(1, Math.max(0, (f - 0.545) * 4.5));
    const i = (y * w + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * a * 255);
  }
  g.putImageData(img, 0, 0);
}, [2, 2]);
export const clouds = new THREE.Mesh(
  new THREE.PlaneGeometry(5200, 5200),
  new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.78, fog: false }),
);
clouds.rotation.x = Math.PI / 2;
clouds.position.y = 2100;
clouds.renderOrder = -1;
scene.add(clouds);

/** 每帧：水面时间、云层漂移。 */
export function tickEnv(dt) {
  if (water) water.material.uniforms.time.value += dt * 0.45;
  cloudTex.offset.x += dt * 0.0016;
}
/** 级联阴影接管太阳光时由 main.js 填入。 */
export const csmHook = { lights: null };
export const sunDir = new THREE.Vector3();

// ---- 时刻 → 太阳、灯光、雾、夜景 ----
export const clock = { hours: 10.5, night: 0, elevation: 0 };
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
const lerpHex = (a, b, t) => tmpA.setHex(a).lerp(tmpB.setHex(b), t);
const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

export function setTime(hours) {
  clock.hours = hours;
  const elev = Math.max(-18, 60 * Math.sin((Math.PI * (hours - 6)) / 13));
  const az = 90 - ((hours - 6) / 13) * 180;
  clock.elevation = elev;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
  sky.material.uniforms.sunPosition.value.copy(sunDir);

  const day = smooth(elev, -2, 12);
  const warm = smooth(elev, 0, 25);
  const night = 1 - smooth(elev, -8, 3);
  clock.night = night;

  sun.position.copy(sunDir).multiplyScalar(320).add(sun.target.position);
  sun.color.copy(lerpHex(0xffb070, 0xfff4e4, warm));
  sun.intensity = csmHook.lights ? 0 : 4.2 * day;
  if (csmHook.lights) for (const l of csmHook.lights) { l.intensity = 4.2 * day; l.color.copy(sun.color); }
  if (water) {
    water.material.uniforms.sunDirection.value.copy(sunDir);
    water.material.uniforms.sunColor.value.copy(sun.color).multiplyScalar(0.25 + 0.75 * day);
    water.material.uniforms.waterColor.value.copy(lerpHex(0x17414d, 0x05090f, night));
  }
  clouds.material.color.copy(lerpHex(0xffc9a0, 0xffffff, warm)).lerp(tmpB.setHex(0x161c2a), night);
  hemi.intensity = 0.06 + 0.38 * smooth(elev, -6, 15);
  hemi.color.copy(lerpHex(0x6d7ea0, 0xcfe3ff, warm));
  hemi.groundColor.copy(lerpHex(0x2a2622, 0x8a7a5a, day));
  moonLight.intensity = 0.32 * night;

  const dayFog = lerpHex(0xf0c8a3, 0xcfdcea, smooth(elev, 0, 20)).clone();
  scene.fog.color.copy(dayFog.lerp(tmpB.setHex(0x0d121b), night));
  scene.background = null;

  stars.material.opacity = Math.max(0, night - 0.35) / 0.65;
  moon.material.opacity = night;

  const k = smooth(night, 0.35, 1);
  for (const item of nightOnly) {
    if (item.light) item.light.intensity = item.intensity * k;
    if (item.mesh) item.mesh.visible = k > 0.05;
  }
  const lc = lerpHex(0x000000, 0xff3a1e, k);
  for (const m of lanternMats) { m.emissive.copy(lc); m.emissiveIntensity = 5.5; }
  mat.bulb.color.setRGB(2.4, 2.0, 1.3);
}

/** 用天空生成环境贴图（琉璃瓦高光与整体环境光）。 */
let pmrem = null;
export function refreshEnvironment(renderer) {
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  const old = scene.environment;
  scene.environment = pmrem.fromScene(sky, 0, 1, 5000).texture;
  if (old) old.dispose();
}
setTime(clock.hours);
