// 城台 · 两翼 · 城楼
import * as THREE from 'three';
import {
  scene, mat, std, box, cyl, group, describe, canvasTexture, textBoardTexture,
  latticeTex, caihuaTex, roofLoft, ridgeTube, balustrade, nightOnly, lanternMats,
} from './lib.js';

export const layers = { rampart: group(), base: group(), lowerEave: group(), upper: group(), roof: group() };
export const explodeOffsets = { rampart: 0, base: 7, lowerEave: 14, upper: 21, roof: 30 };

export const RAMPART = { hw: 34, hl: 19, h: 13.6, baseH: 1.6 };
const ARCHES = [
  { x: 0, w: 5.4, h: 8.6 },
  { x: -10.5, w: 4.6, h: 7.3 }, { x: 10.5, w: 4.6, h: 7.3 },
  { x: -21, w: 4.2, h: 6.5 }, { x: 21, w: 4.2, h: 6.5 },
].sort((a, b) => a.x - b.x);

// ---- 城台 ----
{
  const s = new THREE.Shape();
  s.moveTo(-RAMPART.hw, 0);
  for (const a of ARCHES) {
    const l = a.x - a.w / 2, r = a.x + a.w / 2, cy = a.h - a.w / 2;
    s.lineTo(l, 0); s.lineTo(l, cy);
    s.absarc(a.x, cy, a.w / 2, Math.PI, 0, true);
    s.lineTo(r, 0);
  }
  s.lineTo(RAMPART.hw, 0); s.lineTo(RAMPART.hw, RAMPART.h); s.lineTo(-RAMPART.hw, RAMPART.h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: RAMPART.hl * 2, bevelEnabled: false, curveSegments: 18 });
  geo.translate(0, 0, -RAMPART.hl);
  const uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 9, p.getY(i) / 9);
  const rampart = new THREE.Mesh(geo, mat.brick);
  rampart.castShadow = rampart.receiveShadow = true;
  layers.rampart.add(rampart);
  describe(rampart, {
    eyebrow: '城台', title: '城台与五阙券门', sub: 'RAMPART · FIVE ARCHED GATEWAYS',
    text: '朱红城台是天安门的基座，下承汉白玉须弥座。五个券门贯通南北，中门最高大，明清时唯皇帝可行；两侧依次为宗室、文武官员所用。',
    dims: [['城台高度', '约 13 m'], ['中门', '高 8.8 m · 宽 5.3 m'], ['券门数', '五阙']],
  });

  const bh = RAMPART.baseH, bump = 0.7;
  const segsX = [];
  let cursor = -RAMPART.hw - bump;
  for (const a of ARCHES) { segsX.push([cursor, a.x - a.w / 2]); cursor = a.x + a.w / 2; }
  segsX.push([cursor, RAMPART.hw + bump]);
  for (const [x0, x1] of segsX) {
    for (const zc of [RAMPART.hl + bump / 2, -RAMPART.hl - bump / 2]) {
      box(x1 - x0, bh, bump + 0.4, mat.marble, (x0 + x1) / 2, bh / 2, zc > 0 ? zc - 0.2 : zc + 0.2, layers.rampart);
    }
  }
  for (const xc of [RAMPART.hw + bump / 2, -RAMPART.hw - bump / 2]) {
    box(bump + 0.4, bh, RAMPART.hl * 2 + bump * 2, mat.marble, xc > 0 ? xc - 0.2 : xc + 0.2, bh / 2, 0, layers.rampart);
  }
  const bal = balustrade(layers.rampart, RAMPART.hw - 0.5, RAMPART.hl - 0.5, RAMPART.h);
  describe(bal, {
    eyebrow: '城台', title: '汉白玉栏杆', sub: 'MARBLE BALUSTRADE',
    text: '城台四周环以汉白玉望柱与栏板。望柱头雕云龙纹，栏板间以地栿相连，是明清官式建筑的等级标识。',
    dims: [['望柱高', '约 1.4 m'], ['间距', '约 2.2 m']],
  });

  // 画像（中性色板示意）
  const portrait = group(layers.rampart, 0, 11.1, RAMPART.hl + 0.18);
  box(6.2, 4.8, 0.34, mat.gold, 0, 0, 0, portrait);
  const portraitTex = canvasTexture(256, 200, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#b9c6d3'); grad.addColorStop(0.55, '#8fa0b2'); grad.addColorStop(1, '#4f5a66');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.22, h * 0.3, 0, 0, 7); g.fill();
  });
  const portraitPanel = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 4.3), std(0xffffff, { map: portraitTex, roughness: 0.7 }));
  portraitPanel.position.z = 0.19;
  portrait.add(portraitPanel);
  describe(portrait, {
    eyebrow: '城台', title: '画像', sub: 'PORTRAIT',
    text: '中门上方悬挂的巨幅画像高约 6 m、宽约 4.6 m，重逾 1.5 吨，每年国庆前更换一次。此处以中性色板示意位置与尺度。',
    dims: [['尺寸', '6.0 × 4.6 m'], ['位置', '中门正上方']],
  });

  const slogans = [
    { x: -14.2, text: '中华人民共和国万岁', name: '西侧标语' },
    { x: 14.2, text: '世界人民大团结万岁', name: '东侧标语' },
  ];
  const sloganMeshes = [];
  for (const s2 of slogans) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(20.5, 1.9), std(0xffffff, { map: textBoardTexture(s2.text, 1024, 96), roughness: 0.8 }));
    m.position.set(s2.x, 11.6, RAMPART.hl + 0.06);
    m.userData.retext = s2.text;
    layers.rampart.add(m);
    sloganMeshes.push(m);
    describe(m, {
      eyebrow: '城台', title: s2.name, sub: s2.text,
      text: '两条标语分列画像两侧。西侧“中华人民共和国万岁”，东侧“世界人民大团结万岁”，均为白字朱底，1950 年代定型沿用至今。',
      dims: [['字数', `${s2.text.length} 字`], ['长度', '约 20 m']],
    });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      for (const m of sloganMeshes) {
        const old = m.material.map;
        m.material.map = textBoardTexture(m.userData.retext, 1024, 96);
        m.material.needsUpdate = true;
        old.dispose();
      }
    });
  }
}

// ---- 两翼城墙 · 观礼台 ----
{
  const wing = group(scene);
  for (const sgn of [-1, 1]) {
    const x0 = RAMPART.hw, x1 = 172;
    const len = x1 - x0, xc = sgn * (x0 + len / 2);
    box(len, 7.6, 2.0, mat.brick, xc, 3.8, RAMPART.hl - 1.0, wing);
    box(len + 0.4, 1.2, 2.8, mat.marble, xc, 0.6, RAMPART.hl - 1.0, wing);
    const cap = cyl(1.25, 1.25, len, mat.glazePlain, xc, 7.35, RAMPART.hl - 1.0, 4, wing);
    cap.rotation.set(0, 0, Math.PI / 2); cap.rotateY(Math.PI / 4);
    const stand = group(wing);
    const sx0 = 40, sx1 = 150, slen = sx1 - sx0, sxc = sgn * (sx0 + slen / 2);
    for (let i = 0; i < 5; i++) {
      const h = (5 - i) * 1.05;
      box(slen, h, 2.7, i % 2 ? mat.vermilionDeep : mat.vermilion, sxc, h / 2, RAMPART.hl + 2.7 * i + 1.35, stand);
    }
    balustrade(stand, slen / 2, 1.2, 5 * 1.05, { postH: 1.0, panelH: 0.7, step: 2.6, sides: 's' }).position.set(sxc, 0, RAMPART.hl + 1.35);
    describe(stand, {
      eyebrow: '两翼', title: '观礼台', sub: 'REVIEWING STANDS',
      text: '1954 年建成的东西观礼台紧贴皇城红墙，各分五级台阶，国庆阅兵与群众游行时可容纳约两万人观礼。',
      dims: [['长度', '各约 110 m'], ['台阶', '五级']],
    });
  }
  describe(wing, {
    eyebrow: '两翼', title: '皇城红墙', sub: 'IMPERIAL CITY WALL',
    text: '天安门两侧向东西延伸的红墙是明清皇城南墙的一段，顶覆黄琉璃瓦，下承汉白玉须弥座，把城楼与长安街隔开。',
    dims: [['墙高', '约 7.6 m'], ['瓦顶', '黄琉璃']],
  });
}

// ---- 城楼 ----
const T = {
  y0: RAMPART.h, baseH: 1.4, colH: 7.0,
  xs: [-25.1, -19.6, -14.1, -8.6, -3.1, 3.1, 8.6, 14.1, 19.6, 25.1],
  zs: [-11, -6.6, -2.2, 2.2, 6.6, 11],
};
const floorY = T.y0 + T.baseH;

function latticeWall(w, h, x, y, z, rotY, parent) {
  const tex = latticeTex.clone();
  tex.repeat.set(Math.max(1, Math.round(w / 2.6)), 1);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std(0xffffff, { map: tex, roughness: 0.7 }));
  m.position.set(x, y, z); m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function hall(hw, hl, y0, h, parent) {
  const g = group(parent);
  latticeWall(hw * 2, h, 0, y0 + h / 2, hl, 0, g);
  latticeWall(hw * 2, h, 0, y0 + h / 2, -hl, Math.PI, g);
  latticeWall(hl * 2, h, hw, y0 + h / 2, 0, Math.PI / 2, g);
  latticeWall(hl * 2, h, -hw, y0 + h / 2, 0, -Math.PI / 2, g);
  box(hw * 2, h, hl * 2, mat.vermilionDeep, 0, y0 + h / 2, 0, g).scale.set(0.985, 1, 0.985);
  return g;
}
function lintelRing(hw, hl, y, h, parent) {
  const g = group(parent);
  const mk = (len, x, z, rotY) => {
    const tex = caihuaTex.clone(); tex.repeat.set(Math.max(1, Math.round(len / 5.5)), 1); tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.7), std(0xffffff, { map: tex, roughness: 0.75 }));
    m.position.set(x, y + h / 2, z); m.rotation.y = rotY; m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  mk(hw * 2, 0, hl, 0); mk(hw * 2, 0, -hl, 0); mk(hl * 2, hw, 0, Math.PI / 2); mk(hl * 2, -hw, 0, Math.PI / 2);
  return g;
}
function bracketRing(hw, hl, y, h, parent) {
  const g = group(parent);
  box(hw * 2, h, 2.2, mat.jade, 0, y + h / 2, hl - 1.1, g);
  box(hw * 2, h, 2.2, mat.jade, 0, y + h / 2, -hl + 1.1, g);
  box(2.2, h, hl * 2 - 4.4, mat.jade, hw - 1.1, y + h / 2, 0, g);
  box(2.2, h, hl * 2 - 4.4, mat.jade, -hw + 1.1, y + h / 2, 0, g);
  const items = [];
  const along = (ax, az, bx, bz, nx, nz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 1.35);
    for (let i = 0; i <= n; i++) {
      const t = (i + 0.5) / (n + 1);
      items.push([ax + (bx - ax) * t + nx * 0.42, az + (bz - az) * t + nz * 0.42, Math.atan2(nx, nz), i % 2]);
    }
  };
  along(-hw, hl, hw, hl, 0, 1); along(-hw, -hl, hw, -hl, 0, -1);
  along(hw, -hl, hw, hl, 1, 0); along(-hw, -hl, -hw, hl, -1, 0);
  const geoA = new THREE.BoxGeometry(0.62, h * 0.82, 0.85), geoB = new THREE.BoxGeometry(0.62, h * 0.55, 0.85);
  const a = items.filter((i) => i[3] === 0), b = items.filter((i) => i[3] === 1);
  const ma = new THREE.InstancedMesh(geoA, mat.green, a.length), mb = new THREE.InstancedMesh(geoB, mat.gold, b.length);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  a.forEach((it, i) => { q.setFromEuler(e.set(0, it[2], 0)); v.set(it[0], y + h / 2, it[1]); m4.compose(v, q, one); ma.setMatrixAt(i, m4); });
  b.forEach((it, i) => { q.setFromEuler(e.set(0, it[2], 0)); v.set(it[0], y + h * 0.36, it[1]); m4.compose(v, q, one); mb.setMatrixAt(i, m4); });
  ma.castShadow = mb.castShadow = true;
  g.add(ma, mb);
  return g;
}
function addRidges(roofMesh, parent, beasts = 5) {
  for (const path of roofMesh.userData.cornerPaths) {
    parent.add(ridgeTube(path, 0.34));
    for (let i = 1; i <= beasts; i++) {
      const p = path[i], q2 = path[i + 1] || p;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 6), mat.ridgeBeast);
      m.position.copy(p).lerp(q2, 0.3); m.position.y += 0.55;
      m.castShadow = true;
      parent.add(m);
    }
  }
}

{
  const base = box(56, T.baseH, 28, mat.marble, 0, T.y0 + T.baseH / 2, 0, layers.base);
  describe(base, {
    eyebrow: '城楼', title: '汉白玉台基', sub: 'MARBLE PLATFORM',
    text: '城楼坐落在城台之上的汉白玉台基上，台基四周设栏杆。国庆典礼上，领导人即于台基南缘的城楼廊下检阅。',
    dims: [['台基', '56 × 28 m'], ['高', '1.4 m']],
  });
  balustrade(layers.base, 27.6, 13.6, floorY, { postH: 1.1, panelH: 0.7, step: 2.0 });

  const cols = group(layers.base);
  const colGeo = new THREE.CylinderGeometry(0.55, 0.58, T.colH, 14);
  const plinthGeo = new THREE.CylinderGeometry(0.78, 0.82, 0.32, 14);
  const pts = [];
  for (const x of T.xs) for (const z of T.zs) if (Math.abs(x) === 25.1 || Math.abs(z) === 11) pts.push([x, z]);
  const colMesh = new THREE.InstancedMesh(colGeo, mat.vermilion, pts.length);
  const plinthMesh = new THREE.InstancedMesh(plinthGeo, mat.marbleShade, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => {
    m4.makeTranslation(x, floorY + T.colH / 2, z); colMesh.setMatrixAt(i, m4);
    m4.makeTranslation(x, floorY + 0.16, z); plinthMesh.setMatrixAt(i, m4);
  });
  colMesh.castShadow = colMesh.receiveShadow = true;
  cols.add(colMesh, plinthMesh);
  describe(cols, {
    eyebrow: '城楼', title: '朱红檐柱', sub: 'VERMILION COLUMNS · 9 × 5 BAYS',
    text: '城楼面阔九间、进深五间，取“九五之尊”之意。外檐一周立朱红圆柱，形成环绕殿身的外廊，全楼共 60 根柱。',
    dims: [['开间', '面阔九间 · 进深五间'], ['柱高', '约 7 m'], ['柱径', '约 1.1 m']],
  });

  const lowerHall = hall(19.6, 6.6, floorY, T.colH, layers.base);
  describe(lowerHall, {
    eyebrow: '城楼', title: '菱花隔扇', sub: 'LATTICE DOORS',
    text: '殿身四面装菱花隔扇门，上部棂格透光，下部裙板雕饰。朱红与金线的配色是紫禁城外朝建筑的通例。',
    dims: [['隔扇高', '约 7 m'], ['殿身', '39 × 13 m']],
  });

  const lanternGroup = group(layers.base);
  for (const x of [-22.35, -16.85, -11.35, -5.85, 5.85, 11.35, 16.85, 22.35]) {
    const g = group(lanternGroup, x, floorY + T.colH - 0.1, 12.4);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), mat.lantern.clone());
    body.scale.set(1, 0.82, 1); body.position.y = -1.9; body.castShadow = true;
    g.add(body);
    lanternMats.push(body.material);
    cyl(0.5, 0.5, 0.22, mat.gold, 0, -1.02, 0, 12, g);
    cyl(0.5, 0.5, 0.22, mat.gold, 0, -2.78, 0, 12, g);
    cyl(0.04, 0.04, 0.9, mat.gold, 0, -0.45, 0, 6, g);
    cyl(0.1, 0.14, 1.3, mat.lantern, 0, -3.55, 0, 8, g);
    const light = new THREE.PointLight(0xff7a3a, 0, 14, 2);
    light.position.y = -1.9;
    g.add(light);
    nightOnly.push({ light, intensity: 3 });
  }
  describe(lanternGroup, {
    eyebrow: '城楼', title: '八盏红宫灯', sub: 'EIGHT RED LANTERNS',
    text: '重大庆典时下檐外廊悬挂八盏大红宫灯，与朱柱黄瓦相映。1949 年开国大典所挂宫灯直径逾 2 m、重 80 kg，由当时的画家赶制。',
    dims: [['数量', '8 盏'], ['直径', '约 2 m']],
  });

  lintelRing(25.4, 11.3, floorY + T.colH - 0.8, 0.8, layers.base);
  const bk1 = bracketRing(26.7, 12.6, floorY + T.colH, 1.1, layers.lowerEave);
  describe(bk1, {
    eyebrow: '城楼', title: '斗拱与和玺彩画', sub: 'DOUGONG BRACKETS · HEXI PAINTING',
    text: '柱头之上层层出挑的斗与栱把屋檐托出数米，是中国木构的核心构件。额枋施青绿地和玺彩画，金线勾勒龙纹，为最高等级的彩画。',
    dims: [['出檐', '约 5 m'], ['彩画等级', '和玺彩画']],
  });

  const lowerRoof = roofLoft({ hw: 30.1, hl: 16, rise: 2.9, depthIn: 4.6, curve: 1.35, lift: 0.75, liftSpan: 6 });
  lowerRoof.position.y = floorY + T.colH + 1.1;
  layers.lowerEave.add(lowerRoof);
  addRidges(lowerRoof, layers.lowerEave, 4);
  box(52, 0.6, 24, mat.eaveUnder, 0, lowerRoof.position.y + 2.9 - 0.3, 0, layers.lowerEave);
  describe(lowerRoof, {
    eyebrow: '城楼', title: '下檐（腰檐）', sub: 'LOWER EAVE',
    text: '重檐即上下两层屋檐。下檐环绕殿身一周，檐角起翘，脊上列走兽，覆黄琉璃瓦。',
    dims: [['檐口', '60 × 32 m'], ['瓦色', '黄琉璃']],
  });

  const upperY = lowerRoof.position.y + 2.9;
  const upperH = 4.0;
  hall(23.3, 9.3, upperY, upperH, layers.upper);
  const ucols = group(layers.upper);
  const ucolGeo = new THREE.CylinderGeometry(0.42, 0.45, upperH, 12);
  const upts = [];
  for (const x of T.xs) for (const z of T.zs) if (Math.abs(x) === 25.1 || Math.abs(z) === 11) upts.push([x * (24.2 / 25.1), z * (10.2 / 11)]);
  const ucolMesh = new THREE.InstancedMesh(ucolGeo, mat.vermilion, upts.length);
  upts.forEach(([x, z], i) => { m4.makeTranslation(x, upperY + upperH / 2, z); ucolMesh.setMatrixAt(i, m4); });
  ucolMesh.castShadow = true;
  ucols.add(ucolMesh);
  lintelRing(24.5, 10.5, upperY + upperH - 0.8, 0.8, layers.upper);
  bracketRing(25.9, 11.9, upperY + upperH, 1.1, layers.upper);
  describe(layers.upper, {
    eyebrow: '城楼', title: '上层楼身', sub: 'UPPER STOREY',
    text: '上层楼身收进一圈，四面亦装隔扇，外围再立一周檐柱承托上檐。上下两檐之间的这段楼身让整座城楼显得高耸而稳重。',
    dims: [['楼身', '47 × 19 m'], ['层高', '约 4 m']],
  });

  const roofY = upperY + upperH + 1.1;
  const upperRoof = roofLoft({ hw: 29.7, hl: 15.4, rise: 5.6, depthIn: 15.4, gableAt: 10.6, curve: 1.5, lift: 0.95, liftSpan: 7.5, rings: 16 });
  upperRoof.position.y = roofY;
  layers.roof.add(upperRoof);
  addRidges(upperRoof, layers.roof, 6);
  const ridgeHalf = 29.7 - 10.6;
  const ridgeTop = roofY + 5.6;
  box(ridgeHalf * 2, 1.0, 1.0, mat.glazeDeep, 0, ridgeTop + 0.3, 0, layers.roof);
  for (const sgn of [-1, 1]) {
    const chi = group(layers.roof, sgn * ridgeHalf, ridgeTop + 0.3, 0);
    box(1.1, 2.6, 1.3, mat.glazeDeep, 0, 1.2, 0, chi);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.28, 8, 12, Math.PI), mat.glazeDeep);
    tail.position.set(-sgn * 0.4, 2.4, 0); tail.rotation.y = Math.PI / 2; tail.rotation.z = sgn > 0 ? 0 : Math.PI;
    tail.castShadow = true;
    chi.add(tail);
  }
  describe(upperRoof, {
    eyebrow: '城楼', title: '重檐歇山顶', sub: 'DOUBLE-EAVE HIP-AND-GABLE ROOF',
    text: '上檐为歇山顶：前后坡直抵正脊，两侧下段为四坡的戗脊，上段收为竖直山花。等级仅次于庑殿顶，配黄琉璃瓦、正脊两端置鸱吻。',
    dims: [['通高', '约 34.7 m'], ['正脊长', '约 38 m'], ['屋面', '黄琉璃瓦']],
  });
  layers.roof.userData.eaveRing = upperRoof.userData.eaveRing.map((p) => p.clone().add(new THREE.Vector3(0, roofY, 0)));
  layers.lowerEave.userData.eaveRing = lowerRoof.userData.eaveRing.map((p) => p.clone().add(new THREE.Vector3(0, lowerRoof.position.y, 0)));
}
