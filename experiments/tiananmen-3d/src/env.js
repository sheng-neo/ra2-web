// 周边环境 · 天空与昼夜 · 灯光 —— 尺寸按公开资料（米）
//   外金水河：宽 18，长 500，北岸距城台墙基 32；外金水桥五座（御路 8.55 / 王公 5.78 / 品级 4.55 宽，长 23.15）+ 两座公生桥
//   华表：通高 9.57，柱径 0.98，同侧一对间距 96；石狮高 3.4（含座）；国旗杆净高 30
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import waterNormalsUrl from '../assets/waternormals.jpg';
import flare0Url from '../assets/lensflare0.png';
import flare3Url from '../assets/lensflare3.png';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { scene, mat, std, C, box, cyl, group, describe, canvasTexture, balustrade, nightOnly, lanternMats, postCapGeo } from './lib.js';
import { layers, RAMPART, ARCHES } from './gate.js';
import { lion, huabiao } from './detail.js';
import { addCrowd } from './crowd.js';

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
    const deck = new THREE.Mesh(geo, mat.bridgeStone);
    deck.rotation.y = Math.PI / 2;
    deck.position.set(x, 0, (RIVER.z0 + RIVER.z1) / 2);
    deck.castShadow = deck.receiveShadow = true;
    bridges.add(deck);
    const postGeo = new THREE.BoxGeometry(0.3, 1.1, 0.3);
    const count = 11;
    for (const side of [-1, 1]) {
      const pm = new THREE.InstancedMesh(postGeo, mat.marble, count);
      const cm = new THREE.InstancedMesh(postCapGeo, mat.marble, count);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        const t = -half + 0.3 + (i / (count - 1)) * (L - 0.6);
        m4.makeTranslation(x + side * (w / 2 - 0.25), prof(t) + 0.55, (RIVER.z0 + RIVER.z1) / 2 + t);
        pm.setMatrixAt(i, m4);
        m4.makeTranslation(x + side * (w / 2 - 0.25), prof(t) + 1.1, (RIVER.z0 + RIVER.z1) / 2 + t);
        cm.setMatrixAt(i, m4);
      }
      pm.castShadow = cm.castShadow = true;
      bridges.add(pm, cm);
      for (let i = 0; i < count - 1; i++) {
        const t0 = -half + 0.3 + (i / (count - 1)) * (L - 0.6), t1 = -half + 0.3 + ((i + 1) / (count - 1)) * (L - 0.6);
        const y0 = prof(t0), y1 = prof(t1);
        const len = Math.hypot(t1 - t0, y1 - y0);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, len), mat.marbleShade);
        panel.position.set(x + side * (w / 2 - 0.25), (y0 + y1) / 2 + 0.4, (RIVER.z0 + RIVER.z1) / 2 + (t0 + t1) / 2);
        panel.rotation.x = -Math.atan2(y1 - y0, t1 - t0);
        const inset = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.42, len - 0.3), mat.marble);
        inset.position.copy(panel.position); inset.rotation.copy(panel.rotation);
        bridges.add(panel, inset);
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
  const hb = group(scene);
  huabiao(-48, FRONT + 24, hb, true); huabiao(48, FRONT + 24, hb, true);
  huabiao(-48, -FRONT - 14, hb, false); huabiao(48, -FRONT - 14, hb, false);
  describe(hb, {
    eyebrow: '前庭', title: '华表', sub: 'HUABIAO · ORNAMENTAL COLUMNS',
    text: '门前门后各一对汉白玉华表，建于明永乐十八年（1420）：通高 9.57 m，柱径 0.98 m，重 20 余吨，同侧一对相距 96 m。柱身盘龙、顶置云板与承露盘，盘上蹲兽名“犼”。门前的犼面向南，称“望君归”；门后的面北，称“望君出”。',
    dims: [['通高', '9.57 m'], ['柱径', '0.98 m'], ['间距', '96 m'], ['数量', '四座']],
  });
}

// ---- 石狮：高 3.4 m（含座），东雄西雌 ----
{
  const lions = group(scene);
  lion(-10, FRONT + 9, true, false, lions); lion(10, FRONT + 9, true, true, lions);
  lion(-10, -FRONT - 9, false, false, lions); lion(10, -FRONT - 9, false, true, lions);
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

// ---- 松柏：树干 + 交叉面片针叶簇（实例化，透明剔除） ----
{
  const trees = group(scene);
  const plane = new THREE.PlaneGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 7);
  const spots = [];
  for (const sgn of [-1, 1]) {
    for (let x = 66; x <= 250; x += 7.5) spots.push([sgn * x, RIVER.z0 - 9 + (x % 3), 0.85 + (x % 5) / 8, x * 0.37]);
    for (let x = 66; x <= 250; x += 9) spots.push([sgn * x, -FRONT - 10 - (x % 4), 0.95 + (x % 7) / 10, x * 0.53]);
    // 中山公园 / 劳动人民文化宫：红墙以北的成片树林
    for (let x = 70; x <= 330; x += 9) for (let zz = -34; zz >= -150; zz -= 11) spots.push([sgn * (x + (zz % 5)), zz + (x % 7), 1.0 + ((x + zz) % 9) / 12, x * 0.11 + zz]);
    // 广场两侧树带
    for (let zz = 130; zz <= 620; zz += 10) spots.push([sgn * (150 + (zz % 7)), zz, 0.9 + (zz % 6) / 10, zz * 0.3]);
  }
  const CL = 6, PL = 3;
  const mF = new THREE.InstancedMesh(plane, mat.foliage, spots.length * CL * PL), mT = new THREE.InstancedMesh(trunkGeo, mat.trunk, spots.length);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  let k = 0;
  spots.forEach(([x, z, s, seed], i) => {
    const h = 7.5 * s;
    m4.compose(v.set(x, h * 0.5, z), q.identity(), sc.set(1, h, 1)); mT.setMatrixAt(i, m4);
    for (let b = 0; b < CL; b++) {
      const t = b / (CL - 1);
      const ang = seed + b * 2.4, r = (1 - t) * 1.7 * s;
      const y = h * (0.4 + 0.6 * t), size = (5.2 - 2.6 * t) * s;
      const cx = x + Math.cos(ang) * r, cz = z + Math.sin(ang) * r;
      for (let p = 0; p < PL; p++) {
        q.setFromEuler(e.set(0, seed + (p * Math.PI) / PL, 0));
        m4.compose(v.set(cx, y, cz), q, sc.set(size, size * 0.8, 1));
        mF.setMatrixAt(k, m4);
        col.setHSL(0.33 + ((i * 13 + b * 7) % 10) / 120 - 0.04, 0.35, 0.36 + t * 0.14);
        mF.setColorAt(k, col);
        k++;
      }
    }
  });
  mF.instanceColor.needsUpdate = true;
  mF.castShadow = mT.castShadow = true; mF.receiveShadow = true;
  mF.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.foliage.map, alphaTest: 0.45 });
  trees.add(mF, mT);
}

// ---- 远景：人民大会堂（西）、国家博物馆（东）、人民英雄纪念碑，以及两侧公园树带 ----
{
  const far = group(scene);
  const hall = (x, w, d, h, name, text) => {
    const g = group(far, x, 0, 400);
    box(w, 3, d, mat.marbleShade, 0, 1.5, 0, g);
    box(w - 6, h - 12, d - 6, std(0xd9d3c4, { roughness: 0.9 }), 0, 3 + (h - 12) / 2, 0, g);
    box(w, 6, d, std(0xcfc8b8, { roughness: 0.9 }), 0, h - 3, 0, g);
    // 柱廊：面向广场一侧
    const colGeo = new THREE.CylinderGeometry(1.1, 1.1, h - 12, 10);
    const n = Math.floor(d / 8.4);
    const im = new THREE.InstancedMesh(colGeo, mat.marble, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m4.makeTranslation(-Math.sign(x) * (w / 2 - 4), 3 + (h - 12) / 2, -d / 2 + 4.2 + i * 8.4); im.setMatrixAt(i, m4); }
    im.castShadow = true; g.add(im);
    describe(g, { eyebrow: '广场', title: name, sub: 'TIANANMEN SQUARE', text, dims: [['体量', `${w} × ${d} m · 高 ${h} m`]] });
  };
  hall(-420, 206, 336, 46.5, '人民大会堂', '天安门广场西侧的人民大会堂，1959 年建成，东西宽 206 m、南北长 336 m、高 46.5 m，远景以简化体块示意。');
  hall(420, 149, 313, 40, '中国国家博物馆', '天安门广场东侧的国家博物馆，与人民大会堂对称布置，远景以简化体块示意。');
  // 人民英雄纪念碑：须弥座 + 碑身
  {
    const g = group(far, 0, 0, 440);
    sumeruLike(g);
    function sumeruLike(gg) {
      box(50, 1.5, 50, mat.marbleShade, 0, 0.75, 0, gg); box(38, 1.5, 38, mat.marbleShade, 0, 2.25, 0, gg);
      box(20, 4, 20, mat.marble, 0, 5, 0, gg);
      box(6.4, 30, 3.2, mat.marbleShade, 0, 7 + 15, 0, gg);
      box(7.6, 2.2, 4.4, mat.marble, 0, 38, 0, gg);
      balustrade(gg, 24, 24, 3, { postH: 1.0, panelH: 0.7, step: 2.4 });
    }
    describe(g, { eyebrow: '广场', title: '人民英雄纪念碑', sub: 'MONUMENT TO THE PEOPLE\'S HEROES', text: '广场中央的人民英雄纪念碑高 37.94 m，1958 年落成，位于天安门以南约 440 m 的中轴线上。', dims: [['高', '37.94 m']] });
  }
}

// ---- 人群 ----
addCrowd({
  river: RIVER, front: FRONT, count: isSmall ? 160 : 460,
  bridgeY: (x, z) => {
    const zc = (RIVER.z0 + RIVER.z1) / 2, half = BRIDGE_L / 2, t = z - zc;
    if (Math.abs(t) > half) return 0;
    for (const b of BRIDGES) if (Math.abs(x - b.x) < b.w / 2) return 1.3 * Math.cos((t / half) * Math.PI / 2) ** 1.4;
    return 0;
  },
});

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
  'retColor *= vec3( 0.36, 0.46, 0.74 ); gl_FragColor = vec4( retColor, 1.0 );',
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

// 云层：积云（成团软椭圆）与高空薄云两层，缓慢漂移
const cumulusTex = canvasTexture(1024, 1024, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const puff = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.7})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  for (let c = 0; c < 14; c++) {
    const cx = Math.random() * w, cy = Math.random() * h, n = 10 + Math.floor(Math.random() * 14), sz = 40 + Math.random() * 70;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * sz * 1.6;
      puff(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.45, sz * (0.5 + Math.random() * 0.7), 0.55 + Math.random() * 0.35);
    }
  }
}, [2, 2]);
const cirrusTex = canvasTexture(512, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`; g.lineWidth = 6 + Math.random() * 20; g.lineCap = 'round';
    const x = Math.random() * w, y = Math.random() * h;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 80, y - 20, x + 160, y + 20, x + 260 + Math.random() * 120, y);
    g.stroke();
  }
}, [3, 3]);
export const clouds = new THREE.Group();
const cumulus = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ map: cumulusTex, transparent: true, depthWrite: false, opacity: 0.9, fog: false }));
cumulus.rotation.x = Math.PI / 2; cumulus.position.y = 1500; cumulus.renderOrder = -1;
const cirrus = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ map: cirrusTex, transparent: true, depthWrite: false, opacity: 0.7, fog: false }));
cirrus.rotation.x = Math.PI / 2; cirrus.position.y = 3200; cirrus.renderOrder = -1;
clouds.add(cumulus, cirrus);
scene.add(clouds);
clouds.material = cumulus.material;   // setTime 里按昼夜染色

// 镜头光晕：跟随太阳方向
const flareTex0 = new THREE.TextureLoader().load(flare0Url), flareTex3 = new THREE.TextureLoader().load(flare3Url);
export const sunFlare = new Lensflare();
sunFlare.addElement(new LensflareElement(flareTex0, 420, 0, new THREE.Color(1, 0.95, 0.85)));
sunFlare.addElement(new LensflareElement(flareTex3, 60, 0.6));
sunFlare.addElement(new LensflareElement(flareTex3, 70, 0.7));
sunFlare.addElement(new LensflareElement(flareTex3, 120, 0.9));
sunFlare.addElement(new LensflareElement(flareTex3, 70, 1.0));
scene.add(sunFlare);

/** 每帧：水面时间、云层漂移。 */
export function tickEnv(dt) {
  if (water) water.material.uniforms.time.value += dt * 0.45;
  cumulusTex.offset.x += dt * 0.0012;
  cirrusTex.offset.x += dt * 0.0006;
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
  const cc = lerpHex(0xffc9a0, 0xffffff, warm).clone().lerp(tmpB.setHex(0x161c2a), night);
  for (const m of clouds.children) m.material.color.copy(cc);
  sunFlare.position.copy(sunDir).multiplyScalar(1400);
  sunFlare.visible = elev > 1;
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
