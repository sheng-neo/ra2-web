// 周边环境 · 天空与昼夜 · 灯光
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { scene, mat, std, C, box, cyl, group, describe, canvasTexture, balustrade, nightOnly, lanternMats } from './lib.js';
import { layers, RAMPART } from './gate.js';

export const isSmall = Math.min(innerWidth, innerHeight) < 560;
const RIVER = { z0: 36, z1: 48, hx: 82, depth: 1.6 };

// ---- 地面（金水河处分块留槽） ----
{
  const mk = (w, d, x, z) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.plaza);
    g.rotation.x = -Math.PI / 2; g.position.set(x, -0.02, z); g.receiveShadow = true;
    scene.add(g);
    return g;
  };
  mk(900, 450 + RIVER.z0, 0, (RIVER.z0 - 450) / 2);
  mk(900, 450 - RIVER.z1, 0, (RIVER.z1 + 450) / 2);
  mk(450 - RIVER.hx, RIVER.z1 - RIVER.z0, (RIVER.hx + 450) / 2, (RIVER.z0 + RIVER.z1) / 2);
  mk(450 - RIVER.hx, RIVER.z1 - RIVER.z0, -(RIVER.hx + 450) / 2, (RIVER.z0 + RIVER.z1) / 2);
  for (const z of [RIVER.z0, RIVER.z1]) box(RIVER.hx * 2, RIVER.depth, 0.6, mat.marbleShade, 0, -RIVER.depth / 2, z);
  for (const x of [-RIVER.hx, RIVER.hx]) box(0.6, RIVER.depth, RIVER.z1 - RIVER.z0, mat.marbleShade, x, -RIVER.depth / 2, (RIVER.z0 + RIVER.z1) / 2);
}

// ---- 金水河：镜面反射 + 水色 ----
export let reflector = null;
{
  const river = group(scene);
  const geo = new THREE.PlaneGeometry(RIVER.hx * 2, RIVER.z1 - RIVER.z0);
  reflector = new Reflector(geo, {
    clipBias: 0.003,
    textureWidth: isSmall ? 512 : 1024,
    textureHeight: isSmall ? 512 : 1024,
    color: 0x8fa3a8,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, -RIVER.depth, (RIVER.z0 + RIVER.z1) / 2);
  river.add(reflector);
  const tint = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: C.water, transparent: true, opacity: 0.38, roughness: 0.12, metalness: 0.2, depthWrite: false, envMapIntensity: 0.35 }));
  tint.rotation.x = -Math.PI / 2;
  tint.position.set(0, -RIVER.depth + 0.03, (RIVER.z0 + RIVER.z1) / 2);
  river.add(tint);
  describe(river, {
    eyebrow: '前庭', title: '外金水河', sub: 'OUTER GOLDEN WATER RIVER',
    text: '天安门前的外金水河自西向东穿过，河上架七座汉白玉石桥，中间五座正对五阙券门，称外金水桥。水面倒映城楼，是最经典的取景角度。',
    dims: [['河宽', '约 12 m'], ['桥数', '七座（此处示意五座）']],
  });
  balustrade(scene, RIVER.hx, 0.01, 0, { sides: 's', step: 2.2, postH: 1.2, panelH: 0.75, skipFront: 25.5 }).position.z = RIVER.z0 - 0.7;
  balustrade(scene, RIVER.hx, 0.01, 0, { sides: 's', step: 2.2, postH: 1.2, panelH: 0.75, skipFront: 25.5 }).position.z = RIVER.z1 + 0.7;
}

// ---- 金水桥 ----
{
  const bridges = group(scene);
  const mkBridge = (x, w) => {
    const L = RIVER.z1 - RIVER.z0 + 4, half = L / 2, hump = 1.25;
    const prof = (t) => hump * Math.cos((t / half) * Math.PI / 2) ** 1.4;
    const s = new THREE.Shape();
    s.moveTo(-half, -RIVER.depth + 0.2);
    s.lineTo(-half, 0);
    const n = 24;
    for (let i = 0; i <= n; i++) { const t = -half + (i / n) * L; s.lineTo(t, prof(t)); }
    s.lineTo(half, -RIVER.depth + 0.2);
    s.lineTo(half * 0.62, -RIVER.depth + 0.2);
    s.absarc(0, -RIVER.depth + 0.2, half * 0.62, 0, Math.PI, true);
    s.lineTo(-half, -RIVER.depth + 0.2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 16 });
    geo.translate(0, 0, -w / 2);
    const deck = new THREE.Mesh(geo, mat.marble);
    deck.rotation.y = Math.PI / 2;
    deck.position.set(x, 0, (RIVER.z0 + RIVER.z1) / 2);
    deck.castShadow = deck.receiveShadow = true;
    bridges.add(deck);
    const postGeo = new THREE.BoxGeometry(0.3, 1.1, 0.3);
    const count = 9;
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
  mkBridge(0, 7.4); mkBridge(-10.5, 5.8); mkBridge(10.5, 5.8); mkBridge(-21, 5.2); mkBridge(21, 5.2);
  describe(bridges, {
    eyebrow: '前庭', title: '外金水桥', sub: 'GOLDEN WATER BRIDGES',
    text: '五座汉白玉单孔拱桥正对五阙券门。中央御路桥最宽，桥栏望柱雕蟠龙，其余各桥依次递减，与门阙等级一一对应。',
    dims: [['御路桥宽', '约 7 m'], ['桥长', '约 16 m']],
  });
}

// ---- 华表 ----
{
  const mkHuabiao = (x, z, parent) => {
    const g = group(parent, x, 0, z);
    cyl(1.9, 2.1, 0.9, mat.marble, 0, 0.45, 0, 8, g);
    cyl(1.5, 1.7, 0.6, mat.marbleShade, 0, 1.2, 0, 8, g);
    cyl(0.5, 0.58, 7.2, mat.marble, 0, 1.5 + 3.6, 0, 8, g);
    box(3.0, 0.8, 0.3, mat.marble, 0, 7.6, 0, g);
    cyl(0.95, 0.95, 0.22, mat.marble, 0, 8.85, 0, 16, g);
    const hou = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat.marble);
    hou.position.y = 9.35; hou.scale.set(0.9, 1, 1.3); hou.castShadow = true;
    g.add(hou);
    balustrade(g, 2.2, 2.2, 0, { postH: 0.9, panelH: 0.55, step: 1.5 });
    return g;
  };
  const hb = group(scene);
  mkHuabiao(-17.5, RIVER.z0 - 6, hb); mkHuabiao(17.5, RIVER.z0 - 6, hb);
  mkHuabiao(-17.5, -RAMPART.hl - 10, hb); mkHuabiao(17.5, -RAMPART.hl - 10, hb);
  describe(hb, {
    eyebrow: '前庭', title: '华表', sub: 'HUABIAO · ORNAMENTAL COLUMNS',
    text: '门前门后各一对汉白玉华表，柱身盘龙、顶置云板与承露盘，盘上蹲兽名“犼”。门前的犼面向南，称“望君归”；门后的面北，称“望君出”。',
    dims: [['通高', '9.57 m'], ['重量', '约 20 吨'], ['数量', '四座']],
  });
}

// ---- 石狮 ----
{
  const mkLion = (x, z, faceSouth, parent) => {
    const g = group(parent, x, 0, z);
    box(2.6, 1.7, 1.9, mat.marbleShade, 0, 0.85, 0, g);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), mat.stone);
    body.scale.set(1, 1.05, 1.5); body.position.set(0, 2.5, 0.1); body.castShadow = true; g.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), mat.stone);
    chest.position.set(0, 2.9, 0.95); chest.castShadow = true; g.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), mat.stone);
    head.position.set(0, 3.85, 1.05); head.castShadow = true; g.add(head);
    const mane = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.22, 8, 14), mat.stone);
    mane.position.set(0, 3.7, 0.7); mane.castShadow = true; g.add(mane);
    for (const sx of [-0.55, 0.55]) box(0.42, 1.3, 0.5, mat.stone, sx, 2.35, 1.35, g);
    box(0.9, 0.6, 1.1, mat.stone, 0, 2.05, -0.9, g);
    g.rotation.y = faceSouth ? 0 : Math.PI;
    return g;
  };
  const lions = group(scene);
  mkLion(-9.5, RAMPART.hl + 5.5, true, lions); mkLion(9.5, RAMPART.hl + 5.5, true, lions);
  mkLion(-9.5, -RAMPART.hl - 5.5, false, lions); mkLion(9.5, -RAMPART.hl - 5.5, false, lions);
  describe(lions, {
    eyebrow: '前庭', title: '石狮', sub: 'STONE LIONS',
    text: '门前门后各一对明代汉白玉石狮，东为雄狮踏绣球，西为雌狮抚幼狮。传说东狮腹部有一处凹痕，为 1900 年前后战火所留。',
    dims: [['年代', '明 · 永乐年间'], ['高', '约 2.5 m（不含座）']],
  });
}

// ---- 长安街 ----
{
  const road = group(scene);
  const z0 = 56, z1 = 94;
  box(420, 0.12, z1 - z0, mat.asphalt, 0, 0.04, (z0 + z1) / 2, road).receiveShadow = true;
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.02, 0.25), new THREE.MeshBasicMaterial({ color: 0xe9e4d6 }), 5 * 52);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let lane = -2; lane <= 2; lane++) for (let i = 0; i < 52; i++) {
    m4.makeTranslation(-206 + i * 8, 0.11, (z0 + z1) / 2 + lane * 6.5);
    dash.setMatrixAt(k++, m4);
  }
  road.add(dash);
  box(420, 0.3, 1.2, mat.marbleShade, 0, 0.15, z0 - 0.6, road);
  box(420, 0.3, 1.2, mat.marbleShade, 0, 0.15, z1 + 0.6, road);
  describe(road, {
    eyebrow: '前庭', title: '长安街', sub: "CHANG'AN AVENUE",
    text: '东西横贯天安门前的长安街是北京的中轴横线，国庆阅兵的受阅方队自东向西沿此街行进，于城楼前通过。',
    dims: [['路宽', '此段约 40 m'], ['走向', '东西向']],
  });
}

// ---- 国旗 ----
export const flag = {};
{
  const g = group(scene, 0, 0, 122);
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
  const geo = new THREE.PlaneGeometry(6, 4, 30, 18);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.35 }));
  cloth.position.set(3.05, 27.8, 0);
  cloth.castShadow = true;
  g.add(cloth);
  flag.mesh = cloth;
  flag.base = geo.attributes.position.array.slice();
  describe(g, {
    eyebrow: '广场', title: '国旗杆', sub: 'NATIONAL FLAGPOLE',
    text: '国旗杆立于长安街南侧、天安门广场北端。每日随太阳升起升旗、日落降旗，国旗为 5 × 3.33 m 的一号旗。',
    dims: [['杆高', '32.6 m'], ['旗面', '5 × 3.33 m']],
  });
}

// ---- 松柏 ----
{
  const trees = group(scene);
  const coneA = new THREE.ConeGeometry(2.2, 5, 7), coneB = new THREE.ConeGeometry(1.7, 4, 7), trunkGeo = new THREE.CylinderGeometry(0.25, 0.32, 2.2, 6);
  const spots = [];
  for (const sgn of [-1, 1]) {
    for (let x = 44; x <= 168; x += 7.5) spots.push([sgn * x, RIVER.z0 - 5.5 + (x % 3), 0.8 + (x % 5) / 8]);
    for (let x = 40; x <= 170; x += 9) spots.push([sgn * x, -RAMPART.hl - 8 - (x % 4), 0.9 + (x % 7) / 10]);
  }
  const mA = new THREE.InstancedMesh(coneA, mat.pine, spots.length), mB = new THREE.InstancedMesh(coneB, mat.pineDark, spots.length), mT = new THREE.InstancedMesh(trunkGeo, mat.trunk, spots.length);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  spots.forEach(([x, z, s], i) => {
    sc.set(s, s, s);
    m4.compose(v.set(x, 1.1 * s, z), q, sc); mT.setMatrixAt(i, m4);
    m4.compose(v.set(x, 2.2 * s + 2.5 * s, z), q, sc); mA.setMatrixAt(i, m4);
    m4.compose(v.set(x, 2.2 * s + 4.8 * s, z), q, sc); mB.setMatrixAt(i, m4);
  });
  mA.castShadow = mB.castShadow = true;
  trees.add(mA, mB, mT);
}

// ============================================================================
// 灯光 · 物理天空 · 时刻
// ============================================================================
export const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7a5a, 0.9);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff1d6, 3.2);
sun.castShadow = !isSmall;
sun.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 520;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const moonLight = new THREE.DirectionalLight(0x9db4ff, 0);
moonLight.position.set(-120, 200, -80);
scene.add(moonLight);

// 夜景泛光灯
for (const [x, z, tx, i] of [[-46, 64, -12, 7000], [46, 64, 12, 7000], [0, 56, 0, 5600], [-60, -40, -10, 6000], [60, -40, 10, 6000]]) {
  const sp = new THREE.SpotLight(0xffc98a, 0, 260, Math.PI / 6, 0.6, 2);
  sp.position.set(x, 4, z);
  sp.target.position.set(tx, 22, 0);
  scene.add(sp, sp.target);
  nightOnly.push({ light: sp, intensity: i });
}
{
  const sp = new THREE.SpotLight(0xffe2b0, 0, 90, Math.PI / 9, 0.5, 2);
  sp.position.set(0, 3, 44); sp.target.position.set(0, 11, RAMPART.hl);
  scene.add(sp, sp.target);
  nightOnly.push({ light: sp, intensity: 700 });
}

// 轮廓灯（HDR 亮度 >1，供辉光提取）
{
  const pts = [];
  for (const ring of [layers.roof.userData.eaveRing, layers.lowerEave.userData.eaveRing]) {
    for (let i = 0; i < ring.length; i += 2) pts.push([ring[i].x, ring[i].y + 0.35, ring[i].z, ring === layers.roof.userData.eaveRing ? 'roof' : 'lowerEave']);
  }
  const hw = RAMPART.hw, hl = RAMPART.hl, y = RAMPART.h + 0.1;
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
sky.material.uniforms.turbidity.value = 4;
sky.material.uniforms.rayleigh.value = 2.2;
sky.material.uniforms.mieCoefficient.value = 0.005;
sky.material.uniforms.mieDirectionalG.value = 0.8;
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

scene.fog = new THREE.Fog(0xd7dfe6, 260, 620);

// ---- 时刻 → 太阳、灯光、雾、夜景 ----
export const clock = { hours: 10.5, night: 0, elevation: 0 };
const sunDir = new THREE.Vector3();
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
  sun.intensity = 3.0 * day;
  sun.color.copy(lerpHex(0xffb070, 0xfff4e4, warm));
  hemi.intensity = 0.08 + 0.55 * smooth(elev, -6, 15);
  hemi.color.copy(lerpHex(0x6d7ea0, 0xcfe3ff, warm));
  hemi.groundColor.copy(lerpHex(0x2a2622, 0x8a7a5a, day));
  moonLight.intensity = 0.32 * night;

  const dayFog = lerpHex(0xf0c8a3, 0xd9e1e8, smooth(elev, 0, 20)).clone();
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
