// 公共：材质、贴图、几何工具（单位：米，y 向上，+z 朝南 / 面向观者，+x 朝东）
import * as THREE from 'three';

export const C = {
  vermilion: 0xa5262b,
  vermilionDeep: 0x8a1f24,
  glaze: 0xd9a31c,
  glazeDeep: 0xb78516,
  marble: 0xede8dc,
  marbleShade: 0xd8d2c3,
  jade: 0x2f6f8e,
  green: 0x3e8a5a,
  gold: 0xe3b93e,
  stone: 0x8d877b,
  asphalt: 0x4a4744,
  water: 0x3f7f8c,
  pine: 0x2e5a3a,
  pineDark: 0x1f4028,
  trunk: 0x5a4632,
  lantern: 0xd6262b,
};

/** 画质档：high 铺实例化筒瓦、开阴影级联与环境光遮蔽；low 供手机。可用 ?q=low|high 覆盖。 */
export const quality = (new URLSearchParams(location.search).get('q') === 'low' || new URLSearchParams(location.search).get('q') === 'high')
  ? new URLSearchParams(location.search).get('q')
  : (Math.min(innerWidth, innerHeight) < 560 ? 'low' : 'high');

export function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.35, ...extra });
}

// ---- Canvas 贴图 --------------------------------------------------------
export function canvasTexture(w, h, draw, repeat, { srgb = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** 菱花隔扇：朱红框、金色棂格。 */
export const latticeTex = canvasTexture(256, 512, (g, w, h) => {
  g.fillStyle = '#8f1f23'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e0b548'; g.lineWidth = 3;
  const top = 0.62 * h;
  for (let y = 14; y < top; y += 24) { g.beginPath(); g.moveTo(14, y); g.lineTo(w - 14, y); g.stroke(); }
  for (let x = 14; x < w; x += 24) { g.beginPath(); g.moveTo(x, 14); g.lineTo(x, top - 8); g.stroke(); }
  g.lineWidth = 1.5;
  for (let y = 2; y < top; y += 24) for (let x = 2; x < w; x += 24) {
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 24, y + 24); g.moveTo(x + 24, y); g.lineTo(x, y + 24); g.stroke();
  }
  g.fillStyle = '#7a1a1e'; g.fillRect(12, top + 10, w - 24, h - top - 22);
  g.strokeStyle = '#d5a53a'; g.lineWidth = 4; g.strokeRect(22, top + 22, w - 44, h - top - 46);
  g.strokeStyle = '#b5852a'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
});

/** 和玺彩画：青绿地、金线枋心。 */
export const caihuaTex = canvasTexture(512, 64, (g, w, h) => {
  g.fillStyle = '#2b5f7e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3a8458'; g.fillRect(w * 0.2, 0, w * 0.6, h);
  g.fillStyle = '#2b5f7e'; g.fillRect(w * 0.34, 8, w * 0.32, h - 16);
  g.strokeStyle = '#e3b93e'; g.lineWidth = 3;
  g.strokeRect(w * 0.34, 8, w * 0.32, h - 16);
  g.beginPath();
  g.moveTo(w * 0.2, 0); g.lineTo(w * 0.28, h / 2); g.lineTo(w * 0.2, h);
  g.moveTo(w * 0.8, 0); g.lineTo(w * 0.72, h / 2); g.lineTo(w * 0.8, h);
  g.stroke();
  g.fillStyle = '#e3b93e';
  for (let x = 12; x < w; x += 32) { g.beginPath(); g.arc(x, 6, 2.5, 0, 7); g.arc(x, h - 6, 2.5, 0, 7); g.fill(); }
}, [1, 1]);

/** 广场花岗岩铺装。 */
export const plazaTex = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#b7b0a2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${60 + Math.random() * 40},${55 + Math.random() * 40},${50 + Math.random() * 40},${0.08 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.strokeStyle = 'rgba(70,64,56,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
}, [290, 290]);

/** 朱红墙面：抹灰质感，轻微斑驳与雨痕。 */
export const brickTex = canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#a4272c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) {
    const a = Math.random();
    g.fillStyle = a < 0.5 ? `rgba(120,20,22,${0.05 + Math.random() * 0.12})` : `rgba(215,90,80,${0.03 + Math.random() * 0.08})`;
    const r = 1 + Math.random() * 3;
    g.fillRect(Math.random() * w, Math.random() * h, r, r);
  }
  for (let i = 0; i < 9; i++) {            // 少量竖向雨痕
    const x = Math.random() * w;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(80,10,12,0)'); grad.addColorStop(1, `rgba(80,10,12,${0.04 + Math.random() * 0.06})`);
    g.fillStyle = grad; g.fillRect(x, 0, 4 + Math.random() * 10, h);
  }
  g.fillStyle = 'rgba(255,230,210,0.05)';   // 上部微亮
  g.fillRect(0, 0, w, h * 0.3);
}, [6, 6]);

/**
 * 琉璃瓦：颜色图 + 法线图。一张贴图覆盖 TILE_SPAN × TILE_SPAN 米：
 * 4 列筒瓦（凸半圆）间夹板瓦（凹），沿坡向每 0.32 m 一道瓦口叠压。
 */
export const TILE_SPAN = 1.28;
const tileCols = 4, tileRows = 4;
export const tileColorTex = canvasTexture(256, 256, (g, w, h) => {
  const cw = w / tileCols, rh = h / tileRows;
  for (let c = 0; c < tileCols; c++) {
    for (let x = 0; x < cw; x++) {
      const u = x / cw;                         // 0..1 跨一列
      // 筒瓦占 45%（凸），板瓦占 55%（凹）
      const ridge = u < 0.45 ? Math.sin((u / 0.45) * Math.PI) : 0;
      const pan = u >= 0.45 ? Math.sin(((u - 0.45) / 0.55) * Math.PI) : 0;
      const l = 0.78 + ridge * 0.22 - pan * 0.12;
      g.fillStyle = `rgb(${Math.round(217 * l)},${Math.round(163 * l)},${Math.round(28 * l)})`;
      g.fillRect(c * cw + x, 0, 1, h);
    }
  }
  for (let r = 0; r < tileRows; r++) {
    g.fillStyle = 'rgba(70,45,0,0.42)'; g.fillRect(0, r * rh, w, 2);
    g.fillStyle = 'rgba(255,240,180,0.28)'; g.fillRect(0, r * rh + 2, w, 1);
  }
}, [1, 1]);
/** 仅板瓦（凹）阴影的底图：筒瓦以实例几何体表现时使用。 */
export const tilePanTex = canvasTexture(256, 256, (g, w, h) => {
  const cw = w / tileCols, rh = h / tileRows;
  for (let c = 0; c < tileCols; c++) {
    for (let x = 0; x < cw; x++) {
      const u = x / cw;
      const pan = Math.sin(u * Math.PI);
      const l = 0.7 + pan * 0.14;
      g.fillStyle = `rgb(${Math.round(190 * l)},${Math.round(140 * l)},${Math.round(30 * l)})`;
      g.fillRect(c * cw + x, 0, 1, h);
    }
  }
  for (let r = 0; r < tileRows; r++) { g.fillStyle = 'rgba(60,40,0,0.35)'; g.fillRect(0, r * rh, w, 2); }
}, [1, 1]);
export const tileNormalTex = canvasTexture(256, 256, (g, w, h) => {
  const cw = w / tileCols, rh = h / tileRows;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x % cw) / cw;
      const v = (y % rh) / rh;
      let nx = 0, ny = 0;
      if (u < 0.45) nx = -Math.cos((u / 0.45) * Math.PI) * 0.75;
      else nx = Math.cos(((u - 0.45) / 0.55) * Math.PI) * 0.35;
      if (v < 0.06) ny = 0.7;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      const i = (y * w + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}, [1, 1], { srgb: false });

/** 文字牌：红底白字。 */
export function textBoardTexture(text, w, h, opts = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = opts.bg || '#a5262b'; g.fillRect(0, 0, w, h);
    g.fillStyle = opts.fg || '#f6efe2';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const px = Math.floor(Math.min(h * 0.68, (w / text.length) * 0.82));
    g.font = `700 ${px}px ${opts.font || "'Noto Serif SC','Songti SC','STSong','SimSun',serif"}`;
    g.fillText(text, w / 2, h / 2 + px * 0.04);
  });
}

// ---- 材质表 --------------------------------------------------------------
export const mat = {
  vermilion: std(C.vermilion, { roughness: 0.9 }),
  vermilionDeep: std(C.vermilionDeep, { roughness: 0.9 }),
  glaze: std(0xffffff, { map: tileColorTex, normalMap: tileNormalTex, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.36, metalness: 0.12 }),
  glazePlain: std(C.glaze, { roughness: 0.42, metalness: 0.08 }),
  glazePan: std(0xffffff, { map: tilePanTex, roughness: 0.5, metalness: 0.05 }),
  tile: std(C.glaze, { roughness: 0.3, metalness: 0.12, envMapIntensity: 0.55 }),
  glazeDeep: std(C.glazeDeep, { roughness: 0.5 }),
  marble: std(C.marble, { roughness: 0.55 }),
  marbleShade: std(C.marbleShade, { roughness: 0.6 }),
  jade: std(C.jade, { roughness: 0.8 }),
  jadeLight: std(0x3f8aa8, { roughness: 0.75 }),
  green: std(C.green, { roughness: 0.8 }),
  gold: std(C.gold, { roughness: 0.35, metalness: 0.5 }),
  stone: std(C.stone, { roughness: 0.95 }),
  asphalt: std(C.asphalt, { roughness: 1 }),
  pine: std(C.pine, { roughness: 1, flatShading: true }),
  pineDark: std(C.pineDark, { roughness: 1, flatShading: true }),
  trunk: std(C.trunk, { roughness: 1 }),
  lantern: std(C.lantern, { roughness: 0.6, emissive: 0x000000 }),
  eaveUnder: std(0x2a5a72, { roughness: 0.9 }),
  gable: std(0x8d2b26, { roughness: 0.9 }),
  ridgeBeast: std(0x6f5410, { roughness: 0.9 }),
  bulb: new THREE.MeshBasicMaterial({ color: 0xfff1c4 }),
  brick: std(0xffffff, { map: brickTex, roughness: 0.92 }),
  lattice: std(0xffffff, { map: latticeTex, roughness: 0.7 }),
  caihua: std(0xffffff, { map: caihuaTex, roughness: 0.75 }),
  plaza: std(0xffffff, { map: plazaTex, roughness: 0.95 }),
};

// ---- 场景登记 ------------------------------------------------------------
export const scene = new THREE.Scene();
export const pickables = [];
export const nightOnly = [];
export const lanternMats = [];

export function describe(obj, info) {
  obj.userData.info = info;
  pickables.push(obj);
  return obj;
}
export function box(w, h, d, material, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 16, parent = scene) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function group(parent = scene, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---- 屋面放样 -------------------------------------------------------------
/**
 * 中国式屋面：由一圈圈向内收缩、逐级抬升的矩形放样而成。
 *  hw, hl   檐口半宽 / 半深；rise 总起翘高度；depthIn 放样的向内深度
 *  gableAt  歇山：达到该收进深度后不再收窄 x（形成竖直山花），null=庑殿/腰檐
 *  curve    屋面凹曲指数（>1 檐口平缓、近脊陡）；lift 翼角起翘高度
 *  UV 按米计：u 沿檐口周长、v 沿坡面，配合 TILE_SPAN 平铺琉璃瓦贴图
 */
export function roofLoft({ hw, hl, rise, depthIn, gableAt = null, curve = 1.55, lift = 0.9, liftSpan = 7, thickness = 0.55, rings = 14, segs = 18 }) {
  const ringPts = [];
  const yAt = (d) => rise * Math.pow(d / depthIn, curve);
  for (let k = 0; k <= rings; k++) {
    const d = (k / rings) * depthIn;
    const y = yAt(d);
    const inX = gableAt != null ? Math.min(d, gableAt) : d;
    const cw = hw - inX, cl = hl - d;
    const liftK = Math.max(0, 1 - d / 4.5);
    const pts = [];
    const corners = [[-cw, cl], [cw, cl], [cw, -cl], [-cw, -cl]];
    for (let s = 0; s < 4; s++) {
      const a = corners[s], b = corners[(s + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let i = 0; i < segs; i++) {
        const t = i / segs;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const dc = Math.min(t * len, (1 - t) * len);
        const f = Math.max(0, 1 - dc / liftSpan);
        pts.push([x, y + lift * f * f * liftK, z, s]);
      }
    }
    ringPts.push(pts);
  }
  const N = segs * 4;
  // 檐口周长参数（米）与坡面里程（米）
  const uAt = [0];
  for (let i = 1; i <= N; i++) {
    const a = ringPts[0][i - 1], b = ringPts[0][i % N];
    uAt.push(uAt[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const vAt = [0];
  for (let k = 1; k <= rings; k++) {
    const a = ringPts[k - 1][segs >> 1], b = ringPts[k][segs >> 1];
    vAt.push(vAt[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const pos = [], uvs = [], groups = { slope: [], gable: [], under: [], fascia: [] };
  const quad = (a, b, c, d, list, uv) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2]);
    uvs.push(...uv);
    list.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const lower = (p) => [p[0], p[1] - thickness, p[2], p[3]];
  for (let k = 0; k < rings; k++) {
    const A = ringPts[k], B = ringPts[k + 1];
    const d = (k / rings) * depthIn;
    for (let i = 0; i < N; i++) {
      const s = A[i][3];
      const j = (i + 1) % N;
      const isGable = gableAt != null && d >= gableAt - 1e-6 && (s === 1 || s === 3);
      const u0 = uAt[i] / TILE_SPAN, u1 = uAt[i + 1] / TILE_SPAN, v0 = vAt[k] / TILE_SPAN, v1 = vAt[k + 1] / TILE_SPAN;
      quad(A[i], A[j], B[j], B[i], isGable ? groups.gable : groups.slope, [u0, v0, u1, v0, u1, v1, u0, v1]);
      if (!isGable) quad(lower(B[i]), lower(B[j]), lower(A[j]), lower(A[i]), groups.under, [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  }
  const R0 = ringPts[0];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    quad(lower(R0[i]), lower(R0[j]), R0[j], R0[i], groups.fascia, [0, 0, 1, 0, 1, 1, 0, 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const index = [];
  ['slope', 'gable', 'under', 'fascia'].forEach((name, gi) => {
    geo.addGroup(index.length, groups[name].length, gi);
    index.push(...groups[name]);
  });
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, [mat.glaze, mat.gable, mat.eaveUnder, mat.glazeDeep]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.cornerPaths = [0, 1, 2, 3].map((c) => ringPts.map((r) => new THREE.Vector3(r[c * segs][0], r[c * segs][1] + 0.1, r[c * segs][2])));
  mesh.userData.eaveRing = ringPts[0].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  mesh.userData.loft = {
    hw, hl, rise, depthIn, gableAt, curve, lift, liftSpan, yAt,
    liftAt: (dc, d) => { const f = Math.max(0, 1 - dc / liftSpan); return lift * f * f * Math.max(0, 1 - d / 4.5); },
  };
  return mesh;
}

/** 须弥座：上枋 / 上枭 / 束腰 / 下枭 / 下枋 五层线脚，盒体叠成。w×d 为顶面尺寸，h 总高，底边略外放。 */
export function sumeru(parent, w, d, h, x = 0, y = 0, z = 0, material = mat.marble) {
  const g = group(parent, x, y, z);
  const layers = [[1.0, 0.16], [0.96, 0.12], [0.9, 0.36], [0.96, 0.12], [1.02, 0.16], [1.06, 0.08]];   // [相对外放, 相对高度] 自上而下
  let yy = h;
  for (const [k, hh] of layers) {
    const th = h * hh;
    box(w + (k - 1) * 2.4, th, d + (k - 1) * 2.4, material, 0, yy - th / 2, 0, g);
    yy -= th;
  }
  return g;
}

export function ridgeTube(points, radius = 0.32, material = mat.glazeDeep) {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 8, false), material);
  m.castShadow = true;
  return m;
}

/** 汉白玉栏杆：望柱 + 栏板，沿矩形四边。 */
export function balustrade(parent, hw, hl, y, { postH = 1.35, panelH = 0.85, step = 2.2, skipFront = null, sides = 'snew' } = {}) {
  const g = group(parent, 0, y, 0);
  const postGeo = new THREE.BoxGeometry(0.34, postH, 0.34);
  const capGeo = (() => {                      // 望柱头：束腰莲座上的圆头
    const pts = [0.19, 0.19, 0.12, 0.2, 0.24, 0.2, 0.1].map((r, i) => new THREE.Vector2(r, [0, 0.05, 0.1, 0.17, 0.32, 0.44, 0.52][i]));
    pts.push(new THREE.Vector2(0.0, 0.56));
    const g = new THREE.LatheGeometry(pts, 10); g.translate(0, -0.1, 0); return g;
  })();
  const posts = [], rails = [];
  const edges = [
    ['s', [-hw, hl], [hw, hl]], ['n', [-hw, -hl], [hw, -hl]],
    ['w', [-hw, -hl], [-hw, hl]], ['e', [hw, -hl], [hw, hl]],
  ];
  for (const [name, a, b] of edges) {
    if (!sides.includes(name)) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (skipFront && name === 's' && Math.abs(x) < skipFront) continue;
      posts.push([x, z]);
      if (i < n) {
        const x2 = a[0] + (b[0] - a[0]) * (i + 1) / n, z2 = a[1] + (b[1] - a[1]) * (i + 1) / n;
        if (skipFront && name === 's' && Math.abs((x + x2) / 2) < skipFront) continue;
        rails.push([(x + x2) / 2, (z + z2) / 2, name === 's' || name === 'n']);
      }
    }
  }
  const postMesh = new THREE.InstancedMesh(postGeo, mat.marble, posts.length);
  const capMesh = new THREE.InstancedMesh(capGeo, mat.marble, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => {
    m4.makeTranslation(x, postH / 2, z); postMesh.setMatrixAt(i, m4);
    m4.makeTranslation(x, postH, z); capMesh.setMatrixAt(i, m4);
  });
  postMesh.castShadow = capMesh.castShadow = true;
  postMesh.receiveShadow = true;
  g.add(postMesh, capMesh);
  const rx = rails.filter((r) => r[2]), rz = rails.filter((r) => !r[2]);
  const mx = new THREE.InstancedMesh(new THREE.BoxGeometry(step, panelH, 0.18), mat.marbleShade, rx.length);
  const mz = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, panelH, step), mat.marbleShade, rz.length);
  rx.forEach((r, i) => { m4.makeTranslation(r[0], panelH / 2 + 0.05, r[1]); mx.setMatrixAt(i, m4); });
  rz.forEach((r, i) => { m4.makeTranslation(r[0], panelH / 2 + 0.05, r[1]); mz.setMatrixAt(i, m4); });
  mx.castShadow = mz.castShadow = true;
  g.add(mx, mz);
  return g;
}
