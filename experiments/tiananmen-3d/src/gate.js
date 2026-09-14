// 城台 · 两翼 · 城楼 —— 尺寸按公开资料（米）
//   城台：下端 120 × 40，上端 116 × 38.76；须弥座 1.59，朱红墩台 13 → 城台顶 14.59
//   券门：中门 8.82 × 5.25，次间 7.6 × 4.43，梢间 6.2 × 3.83
//   城楼：面阔九间 57.14，进深五间 20.97；台基（含回廊）66 × 37；城台顶至正脊 ≈ 20.1；通高 34.7
//   画像 6 × 4.6（框 6.4 × 5），标语 30 × 2.2
import * as THREE from 'three';
import {
  scene, mat, std, box, cyl, group, describe, canvasTexture, textBoardTexture,
  latticeTex, caihuaTex, roofLoft, ridgeTube, balustrade, nightOnly, lanternMats, quality, sumeru,
} from './lib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roofTiles } from './tiles.js';

/** 高画质：屋面底图改为板瓦，叠加实例化筒瓦。 */
function tileRoof(roofMesh, parent) {
  if (quality !== 'high') return;
  roofMesh.material = roofMesh.material.map((m, i) => (i === 0 ? mat.glazePan : m));
  const t = roofTiles(roofMesh);
  t.position.copy(roofMesh.position);
  parent.add(t);
}

export const layers = { rampart: group(), base: group(), lowerEave: group(), upper: group(), roof: group() };
export const explodeOffsets = { rampart: 0, base: 7, lowerEave: 14, upper: 21, roof: 30 };

export const RAMPART = {
  hwBot: 60, hwTop: 58, hlBot: 20, hlTop: 19.38,
  baseH: 1.59, redH: 13.0,
};
RAMPART.top = RAMPART.baseH + RAMPART.redH;   // 14.59
export const TOTAL_HEIGHT = 34.7;

export const ARCHES = [
  { x: 0, w: 5.25, h: 8.82 },
  { x: -18.5, w: 4.43, h: 7.6 }, { x: 18.5, w: 4.43, h: 7.6 },
  { x: -37, w: 3.83, h: 6.2 }, { x: 37, w: 3.83, h: 6.2 },
].sort((a, b) => a.x - b.x);

// ---- 城台：带五个券门缺口的梯形轮廓，沿南北向拉伸，再按收分收窄南北 ----
{
  const R = RAMPART;
  const s = new THREE.Shape();
  s.moveTo(-R.hwBot, 0);
  for (const a of ARCHES) {
    const l = a.x - a.w / 2, r = a.x + a.w / 2, cy = a.h - a.w / 2;
    s.lineTo(l, 0); s.lineTo(l, cy);
    s.absarc(a.x, cy, a.w / 2, Math.PI, 0, true);
    s.lineTo(r, 0);
  }
  s.lineTo(R.hwBot, 0); s.lineTo(R.hwTop, R.top); s.lineTo(-R.hwTop, R.top);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: R.hlBot * 2, bevelEnabled: false, curveSegments: 20 });
  geo.translate(0, 0, -R.hlBot);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) * (1 - (1 - R.hlTop / R.hlBot) * (y / R.top)));   // 南北收分
    uv.setXY(i, (p.getX(i) + p.getZ(i)) / 9, y / 9);
  }
  geo.computeVertexNormals();
  const rampart = new THREE.Mesh(geo, mat.brick);
  rampart.castShadow = rampart.receiveShadow = true;
  layers.rampart.add(rampart);
  describe(rampart, {
    eyebrow: '城台', title: '城台与五阙券门', sub: 'RAMPART · FIVE ARCHED GATEWAYS',
    text: '朱红城台是天安门的基座：下端东西长 120 m、南北宽 40 m，上端收至 116 × 38.76 m，连须弥座高 14.6 m。五个券门贯通南北、各长 40 m，中门最高大，明清时唯皇帝可行；两侧依次为宗室、文武官员所用。',
    dims: [['城台', '120 × 40 m（底）'], ['高', '14.6 m（含须弥座 1.59）'], ['中门', '高 8.82 · 宽 5.25 m'], ['次间 / 梢间', '7.6 × 4.43 · 6.2 × 3.83 m']],
  });

  // 须弥座：前后分段（避开券门）+ 两侧
  const bh = R.baseH, bump = 0.6;
  const segsX = [];
  let cursor = -R.hwBot - bump;
  for (const a of ARCHES) { segsX.push([cursor, a.x - a.w / 2]); cursor = a.x + a.w / 2; }
  segsX.push([cursor, R.hwBot + bump]);
  for (const [x0, x1] of segsX) {
    for (const zc of [R.hlBot + bump / 2, -R.hlBot - bump / 2]) {
      sumeru(layers.rampart, x1 - x0, bump + 0.4, bh, (x0 + x1) / 2, 0, zc > 0 ? zc - 0.2 : zc + 0.2);
    }
  }
  for (const xc of [R.hwBot + bump / 2, -R.hwBot - bump / 2]) {
    sumeru(layers.rampart, bump + 0.4, R.hlBot * 2 + bump * 2, bh, xc > 0 ? xc - 0.2 : xc + 0.2, 0, 0);
  }

  // 城台顶：台基以外的边缘为琉璃瓦封顶的矮墙
  const parapet = group(layers.rampart, 0, R.top, 0);
  const wall = (len, x, z, alongX) => {
    box(alongX ? len : 0.6, 1.0, alongX ? 0.6 : len, mat.vermilion, x, 0.5, z, parapet);
    box(alongX ? len + 0.2 : 0.9, 0.18, alongX ? 0.9 : len + 0.2, mat.glazePlain, x, 1.05, z, parapet);
  };
  const px0 = 33.6, px1 = R.hwTop - 0.3;
  for (const sgn of [-1, 1]) {
    wall(px1 - px0, sgn * (px0 + px1) / 2, R.hlTop - 0.3, true);
    wall(px1 - px0, sgn * (px0 + px1) / 2, -R.hlTop + 0.3, true);
    wall(R.hlTop * 2 - 0.6, sgn * px1, 0, false);
  }

  // 画像（中性色板示意）
  const portrait = group(layers.rampart, 0, 11.55, R.hlBot + 0.18);
  box(6.4, 5.0 + 1.4, 0.34, mat.gold, 0, 0, 0, portrait).scale.set(0.78, 1, 1);
  const portraitTex = canvasTexture(256, 320, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#b9c6d3'); grad.addColorStop(0.55, '#8fa0b2'); grad.addColorStop(1, '#4f5a66');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.22, h * 0.3, 0, 0, 7); g.fill();
  });
  const portraitPanel = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 5.8), std(0xffffff, { map: portraitTex, roughness: 0.7 }));
  portraitPanel.position.z = 0.19;
  portrait.add(portraitPanel);
  describe(portrait, {
    eyebrow: '城台', title: '画像', sub: 'PORTRAIT',
    text: '中门上方悬挂的巨幅画像高 6 m、宽 4.6 m（外框 6.4 × 5 m），连框重约 1.5 吨，每年国庆前更换一次。此处以中性色板示意位置与尺度。',
    dims: [['画幅', '6.0 × 4.6 m'], ['外框', '6.4 × 5.0 m'], ['位置', '中门正上方']],
  });

  // 标语：各长 30 m、高 2.2 m
  const slogans = [
    { x: -20.5, text: '中华人民共和国万岁', name: '西侧标语' },
    { x: 20.5, text: '世界人民大团结万岁', name: '东侧标语' },
  ];
  const sloganMeshes = [];
  for (const s2 of slogans) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.2), std(0xffffff, { map: textBoardTexture(s2.text, 1536, 112), roughness: 0.8 }));
    m.position.set(s2.x, 12.3, R.hlBot + 0.06);
    m.userData.retext = s2.text;
    layers.rampart.add(m);
    sloganMeshes.push(m);
    describe(m, {
      eyebrow: '城台', title: s2.name, sub: s2.text,
      text: '两条标语分列画像两侧，各长 30 m、高 2.2 m，每字约两米见方。西侧“中华人民共和国万岁”，东侧“世界人民大团结万岁”，均为白字朱底，1950 年代定型沿用至今。',
      dims: [['字数', `${s2.text.length} 字`], ['尺寸', '30 × 2.2 m'], ['字高', '约 2 m']],
    });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      for (const m of sloganMeshes) {
        const old = m.material.map;
        m.material.map = textBoardTexture(m.userData.retext, 1536, 112);
        m.material.needsUpdate = true;
        old.dispose();
      }
    });
  }
}

// ---- 两翼皇城红墙 · 观礼台 ----
{
  const R = RAMPART;
  const wing = group(scene);
  for (const sgn of [-1, 1]) {
    const x0 = R.hwBot, x1 = 320;
    const len = x1 - x0, xc = sgn * (x0 + len / 2);
    box(len, 7.6, 2.0, mat.brick, xc, 3.8, R.hlBot - 1.0, wing);
    box(len + 0.4, 1.2, 2.8, mat.marble, xc, 0.6, R.hlBot - 1.0, wing);
    const cap = cyl(1.25, 1.25, len, mat.glazePlain, xc, 7.35, R.hlBot - 1.0, 4, wing);
    cap.rotation.set(0, 0, Math.PI / 2); cap.rotateY(Math.PI / 4);
    // 大观礼台 95 × 12，小观礼台 73 × 12，均北高南低
    for (const [sx0, slen, name] of [[62, 95, '大观礼台'], [170, 73, '小观礼台']]) {
      const stand = group(wing);
      const sxc = sgn * (sx0 + slen / 2);
      for (let i = 0; i < 5; i++) {
        const h = (5 - i) * 1.05;
        box(slen, h, 2.4, i % 2 ? mat.vermilionDeep : mat.vermilion, sxc, h / 2, R.hlBot + 2.4 * i + 1.2, stand);
      }
      balustrade(stand, slen / 2, 1.0, 5 * 1.05, { postH: 1.0, panelH: 0.7, step: 2.6, sides: 's' }).position.set(sxc, 0, R.hlBot + 1.2);
      describe(stand, {
        eyebrow: '两翼', title: name, sub: 'REVIEWING STANDS',
        text: '1954 年建成的东西观礼台紧贴皇城红墙：紧邻城楼的两座大观礼台各长 95 m、宽 12 m，外侧两座小观礼台各长 73 m，北高南低，共可容纳约两万一千人观礼。',
        dims: [['长度', `${slen} m`], ['进深', '12 m'], ['容量', '合计约 21000 人']],
      });
    }
  }
  describe(wing, {
    eyebrow: '两翼', title: '皇城红墙', sub: 'IMPERIAL CITY WALL',
    text: '天安门两侧向东西延伸的红墙是明清皇城南墙的一段，高约 7.5 m，顶覆黄琉璃瓦，下承汉白玉须弥座，把城楼与长安街隔开。',
    dims: [['墙高', '约 7.5 m'], ['瓦顶', '黄琉璃']],
  });
}

// ---- 城楼 ----
//  面阔九间：明间 7.2，其余 6.2425 → 57.14；进深五间 4.194 → 20.97
const T = {
  y0: RAMPART.top,               // 14.59
  baseH: 1.0,                    // 台基
  colH: 6.0,                     // 下层檐柱
  xs: [-28.57, -22.33, -16.09, -9.84, -3.6, 3.6, 9.84, 16.09, 22.33, 28.57],
  zs: [-10.485, -6.291, -2.097, 2.097, 6.291, 10.485],
};
const floorY = T.y0 + T.baseH;   // 15.59

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
  if (quality === 'high') latticeGeometry(hw, hl, y0, h, g);
  return g;
}
/** 隔扇棂格与边框的真实几何：每扇 1.1 m 宽，上段菱花棂条（斜向双层格），下段裙板。 */
function latticeGeometry(hw, hl, y0, h, parent) {
  const bars = [], frames = [], panels = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const leafW = 1.1, gridStep = 0.16, barT = 0.045;
  const top = h * 0.62;                     // 棂格高度
  const edge = (x0, z0, x1, z1) => {        // 沿一面墙布置：从 (x0,z0) 到 (x1,z1)，外法线朝外
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const nx = uz, nz = -ux;                // 右手外法线（顺时针绕行时朝外）
    const rotY = Math.atan2(ux, uz) - Math.PI / 2;
    const n = Math.floor(len / leafW);
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) * leafW;
      const cx = x0 + ux * c + nx * 0.06, cz = z0 + uz * c + nz * 0.06;
      // 边框（竖）
      q.setFromEuler(e.set(0, rotY, 0));
      for (const off of [-leafW / 2 + 0.04, leafW / 2 - 0.04]) {
        m4.compose(v.set(cx + ux * off, y0 + h / 2, cz + uz * off), q, sc.set(0.08, h - 0.1, 0.09)); frames.push(m4.clone());
      }
      // 横向抹头：顶、棂格下缘、裙板上缘、底
      for (const yy of [y0 + h - 0.06, y0 + h - top, y0 + h - top - 0.26, y0 + 0.08]) {
        m4.compose(v.set(cx, yy, cz), q, sc.set(leafW - 0.1, 0.09, 0.09)); frames.push(m4.clone());
      }
      // 裙板
      m4.compose(v.set(cx, y0 + (h - top - 0.3) / 2 + 0.05, cz), q, sc.set(leafW - 0.2, h - top - 0.42, 0.06)); panels.push(m4.clone());
      // 棂条：斜向两组（菱花）
      const yTop = y0 + h - 0.1, yBot = y0 + h - top + 0.05, hh = yTop - yBot, ww = leafW - 0.16;
      for (const dir of [1, -1]) {
        q.setFromEuler(e.set(0, rotY, dir * Math.PI / 4));
        for (let k = -Math.ceil((ww + hh) / gridStep / 1.4142); k <= Math.ceil((ww + hh) / gridStep / 1.4142); k++) {
          const off = k * gridStep * 1.4142;          // 沿墙偏移
          // 斜线与矩形交：长度近似取 min(...)，粗略裁剪
          const L = Math.min(hh * 1.4142, (ww - Math.abs(off)) * 1.4142 + hh * 0.2);
          if (L < 0.2) continue;
          const cxx = cx + ux * (off * 0.5), cyy = (yTop + yBot) / 2 - dir * 0 - (Math.abs(off) > ww ? 0 : 0);
          m4.compose(v.set(cxx + ux * 0, cyy, cz + uz * (off * 0.5)), q, sc.set(L, barT, barT)); bars.push(m4.clone());
        }
      }
    }
  };
  // 顺时针（俯视）绕殿身一周，使外法线朝外
  edge(-hw, hl, hw, hl); edge(hw, hl, hw, -hl); edge(hw, -hl, -hw, -hl); edge(-hw, -hl, -hw, hl);
  const mk = (list, material) => {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    parent.add(im);
  };
  mk(bars, mat.gold); mk(frames, mat.vermilionDeep); mk(panels, mat.vermilion);
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
      items.push([ax + (bx - ax) * t - nx * 0.55, az + (bz - az) * t - nz * 0.55, Math.atan2(nx, nz), i % 2]);
    }
  };
  along(-hw, hl, hw, hl, 0, 1); along(-hw, -hl, hw, -hl, 0, -1);
  along(hw, -hl, hw, hl, 1, 0); along(-hw, -hl, -hw, hl, -1, 0);
  // 一朵斗拱：坐斗 → 两层横栱（沿墙）+ 出跳华栱与昂（向外），几何合并后实例化
  const k = h / 1.1;
  const parts = (color) => color;
  const dou = (w, d, y, hh) => { const b = new THREE.BoxGeometry(w, hh, d); b.translate(0, y, 0); return b; };
  const greenParts = mergeGeometries([
    dou(0.5, 0.5, 0.12 * k, 0.24 * k),                        // 坐斗
    dou(1.5, 0.28, 0.4 * k, 0.16 * k),                        // 一层横栱
    dou(0.28, 1.1, 0.4 * k, 0.16 * k),                        // 一层华栱（出跳）
    dou(2.2, 0.28, 0.72 * k, 0.16 * k),                       // 二层横栱
    dou(0.28, 1.6, 0.72 * k, 0.16 * k),                       // 二层华栱
    dou(0.36, 0.36, 0.56 * k, 0.12 * k), dou(0.36, 0.36, 0.88 * k, 0.12 * k),
  ]);
  const goldParts = mergeGeometries([
    dou(0.3, 0.3, 0.26 * k, 0.1 * k),
    (() => { const b = new THREE.BoxGeometry(0.3, 0.14 * k, 1.9); b.rotateX(-0.42); b.translate(0, 0.95 * k, 0.45); return b; })(),   // 昂
    dou(0.4, 0.4, 0.48 * k, 0.08 * k), dou(0.4, 0.4, 0.8 * k, 0.08 * k),
  ]);
  const ma = new THREE.InstancedMesh(greenParts, mat.jadeLight, items.length), mb = new THREE.InstancedMesh(goldParts, mat.gold, items.length);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  items.forEach((it, i) => { q.setFromEuler(e.set(0, it[2], 0)); v.set(it[0], y, it[1]); m4.compose(v, q, one); ma.setMatrixAt(i, m4); mb.setMatrixAt(i, m4); });
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
  // 台基 66 × 37（含前后回廊），四周栏杆
  const base = sumeru(layers.base, 66, 37, T.baseH, 0, T.y0, 0);
  describe(base, {
    eyebrow: '城楼', title: '汉白玉台基与回廊', sub: 'MARBLE PLATFORM · 66 × 37 m',
    text: '城楼坐落在城台顶的汉白玉台基上，台基连同前后回廊长 66 m、宽 37 m，几乎占满城台顶面，四周设汉白玉栏杆。国庆典礼上，领导人即于南侧回廊的栏杆后检阅。',
    dims: [['台基', '66 × 37 m'], ['前廊进深', '约 8 m']],
  });
  balustrade(layers.base, 32.7, 18.3, floorY, { postH: 1.1, panelH: 0.7, step: 2.0 });

  // 下层外檐柱：面阔九间 × 进深五间的外圈
  const cols = group(layers.base);
  const colGeo = new THREE.CylinderGeometry(0.44, 0.46, T.colH, 14);
  const plinthGeo = mergeGeometries([
    (() => { const b = new THREE.BoxGeometry(1.3, 0.14, 1.3); b.translate(0, -0.08, 0); return b; })(),
    (() => { const c = new THREE.CylinderGeometry(0.58, 0.66, 0.26, 16); c.translate(0, 0.12, 0); return c; })(),
  ]);
  const pts = [];
  for (const x of T.xs) for (const z of T.zs) if (Math.abs(x) === 28.57 || Math.abs(z) === 10.485) pts.push([x, z]);
  const colMesh = new THREE.InstancedMesh(colGeo, mat.vermilion, pts.length);
  const plinthMesh = new THREE.InstancedMesh(plinthGeo, mat.marbleShade, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => {
    m4.makeTranslation(x, floorY + T.colH / 2, z); colMesh.setMatrixAt(i, m4);
    m4.makeTranslation(x, floorY + 0.08, z); plinthMesh.setMatrixAt(i, m4);
  });
  colMesh.castShadow = colMesh.receiveShadow = true;
  cols.add(colMesh, plinthMesh);
  describe(cols, {
    eyebrow: '城楼', title: '朱红檐柱', sub: 'VERMILION COLUMNS · 9 × 5 BAYS',
    text: '城楼面阔九间（57.14 m）、进深五间（20.97 m），取“九五之尊”之意。外檐一周立朱红圆柱，形成环绕殿身的外廊；全楼共 60 根木柱，柱径约 0.92 m，1970 年重建时每根用材长 12 m。',
    dims: [['开间', '面阔九间 · 进深五间'], ['通面阔', '57.14 m'], ['通进深', '20.97 m'], ['柱数', '60 根']],
  });

  const lowerHall = hall(22.33, 6.291, floorY, T.colH, layers.base);
  describe(lowerHall, {
    eyebrow: '城楼', title: '菱花隔扇', sub: 'LATTICE DOORS',
    text: '殿身四面装菱花隔扇门，上部棂格透光，下部裙板雕饰。朱红与金线的配色是紫禁城外朝建筑的通例。',
    dims: [['隔扇高', '约 6 m'], ['殿身', '45 × 13 m']],
  });

  const lanternGroup = group(layers.base);
  for (const x of [-25.45, -19.21, -12.96, -6.72, 6.72, 12.96, 19.21, 25.45]) {
    const g = group(lanternGroup, x, floorY + T.colH - 0.1, 10.485 + 1.4);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), mat.lantern.clone());
    body.scale.set(1, 0.82, 1); body.position.y = -1.7; body.castShadow = true;
    g.add(body);
    lanternMats.push(body.material);
    cyl(0.5, 0.5, 0.22, mat.gold, 0, -0.82, 0, 12, g);
    cyl(0.5, 0.5, 0.22, mat.gold, 0, -2.58, 0, 12, g);
    cyl(0.04, 0.04, 0.7, mat.gold, 0, -0.35, 0, 6, g);
    cyl(0.1, 0.14, 1.2, mat.lantern, 0, -3.3, 0, 8, g);
    const light = new THREE.PointLight(0xff7a3a, 0, 14, 2);
    light.position.y = -1.7;
    g.add(light);
    nightOnly.push({ light, intensity: 3 });
  }
  describe(lanternGroup, {
    eyebrow: '城楼', title: '八盏红宫灯', sub: 'EIGHT RED LANTERNS',
    text: '重大庆典时下檐外廊悬挂八盏大红宫灯，与朱柱黄瓦相映。1949 年开国大典所挂宫灯直径逾 2 m、重 80 kg，由当时的画家赶制。',
    dims: [['数量', '8 盏'], ['直径', '约 2 m']],
  });

  lintelRing(28.9, 10.8, floorY + T.colH - 0.8, 0.8, layers.base);
  const bk1 = bracketRing(30.1, 12.2, floorY + T.colH, 1.1, layers.lowerEave);
  describe(bk1, {
    eyebrow: '城楼', title: '斗拱与和玺彩画', sub: 'DOUGONG BRACKETS · HEXI PAINTING',
    text: '柱头之上层层出挑的斗与栱把屋檐托出约 3 m，是中国木构的核心构件。额枋施青绿地和玺彩画，金线勾勒龙纹，为最高等级的彩画。',
    dims: [['出檐', '约 3 m'], ['彩画等级', '和玺彩画']],
  });

  // 腰檐：檐口 62.77 × 27.25
  const lowerRoof = roofLoft({ hw: 31.4, hl: 13.6, rise: 2.6, depthIn: 4.2, curve: 1.35, lift: 0.7, liftSpan: 6 });
  lowerRoof.position.y = floorY + T.colH + 1.1;          // 22.69
  layers.lowerEave.add(lowerRoof);
  tileRoof(lowerRoof, layers.lowerEave);
  addRidges(lowerRoof, layers.lowerEave, 4);
  box(55, 0.6, 20, mat.eaveUnder, 0, lowerRoof.position.y + 2.6 - 0.3, 0, layers.lowerEave);
  describe(lowerRoof, {
    eyebrow: '城楼', title: '下檐（腰檐）', sub: 'LOWER EAVE · 62.77 × 27.25 m',
    text: '重檐即上下两层屋檐。下檐环绕殿身一周，檐口约 62.77 × 27.25 m，檐角起翘，脊上列走兽，覆黄琉璃瓦。',
    dims: [['檐口', '62.77 × 27.25 m'], ['离城台顶', '约 8 m']],
  });

  // 上层楼身
  const upperY = lowerRoof.position.y + 2.6 - 0.6;         // 24.69
  const upperH = 3.5;
  hall(24.5, 8.8, upperY, upperH, layers.upper);
  const ucols = group(layers.upper);
  const ucolGeo = new THREE.CylinderGeometry(0.36, 0.38, upperH, 12);
  const upts = [];
  for (const x of T.xs) for (const z of T.zs) if (Math.abs(x) === 28.57 || Math.abs(z) === 10.485) upts.push([x * (25.3 / 28.57), z * (9.6 / 10.485)]);
  const ucolMesh = new THREE.InstancedMesh(ucolGeo, mat.vermilion, upts.length);
  upts.forEach(([x, z], i) => { m4.makeTranslation(x, upperY + upperH / 2, z); ucolMesh.setMatrixAt(i, m4); });
  ucolMesh.castShadow = true;
  ucols.add(ucolMesh);
  lintelRing(25.6, 9.9, upperY + upperH - 0.8, 0.8, layers.upper);
  bracketRing(27.0, 11.2, upperY + upperH, 1.1, layers.upper);
  describe(layers.upper, {
    eyebrow: '城楼', title: '上层楼身', sub: 'UPPER STOREY',
    text: '上层楼身收进一圈，四面亦装隔扇，外围再立一周檐柱承托上檐。上下两檐之间的这段楼身让整座城楼显得高耸而稳重。',
    dims: [['楼身', '49 × 18 m'], ['层高', '约 3.5 m']],
  });

  // 上檐：重檐歇山顶，正脊到 34.7
  const roofY = upperY + upperH + 1.1;                     // 29.29
  const rise = TOTAL_HEIGHT - 0.3 - roofY;                 // 5.11
  const upperRoof = roofLoft({ hw: 28.6, hl: 12.4, rise, depthIn: 12.4, gableAt: 8.8, curve: 1.5, lift: 0.9, liftSpan: 7.5, rings: 16 });
  upperRoof.position.y = roofY;
  layers.roof.add(upperRoof);
  tileRoof(upperRoof, layers.roof);
  addRidges(upperRoof, layers.roof, 6);
  const ridgeHalf = 28.6 - 8.8;
  const ridgeTop = roofY + rise;
  box(ridgeHalf * 2, 0.9, 0.9, mat.glazeDeep, 0, ridgeTop + 0.15, 0, layers.roof);
  for (const sgn of [-1, 1]) {
    const chi = group(layers.roof, sgn * ridgeHalf, ridgeTop + 0.15, 0);
    box(1.1, 2.4, 1.3, mat.glazeDeep, 0, 1.1, 0, chi);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.28, 8, 12, Math.PI), mat.glazeDeep);
    tail.position.set(-sgn * 0.4, 2.2, 0); tail.rotation.y = Math.PI / 2; tail.rotation.z = sgn > 0 ? 0 : Math.PI;
    tail.castShadow = true;
    chi.add(tail);
  }
  describe(upperRoof, {
    eyebrow: '城楼', title: '重檐歇山顶', sub: 'DOUBLE-EAVE HIP-AND-GABLE ROOF',
    text: '上檐为歇山顶：前后坡直抵正脊，两侧下段为四坡的戗脊，上段收为竖直山花。等级仅次于庑殿顶，配黄琉璃瓦、正脊两端置鸱吻。1970 年重建后通高 34.7 m（原 33.87 m）。',
    dims: [['通高', '34.7 m'], ['城台顶至正脊', '约 20.1 m'], ['正脊长', '约 40 m']],
  });
  layers.roof.userData.eaveRing = upperRoof.userData.eaveRing.map((p) => p.clone().add(new THREE.Vector3(0, roofY, 0)));
  layers.lowerEave.userData.eaveRing = lowerRoof.userData.eaveRing.map((p) => p.clone().add(new THREE.Vector3(0, lowerRoof.position.y, 0)));
}
