/**
 * 地表专用的程序化贴图(canvas 绘制，全部可平铺)。
 * 亮度约定：中性灰 128 = 乘数 1.0，着色器里用 `tex * 2.0` 去调制调色板颜色，所以这里只画明暗与轻微色偏。
 */
import * as THREE from 'three';
import { Rng, fbm2, hash2, makeCanvasTexture, tileStamp, valueNoise2 } from '../materials';

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * 先在低分辨率下逐像素算出可平铺的底色，再用「重复图案 + 缩放」平滑放大铺满整张画布。
 * 逐像素噪声是纹理生成里最慢的一步，底色本来就是低频的，放大后看不出差别，但快一个数量级。
 */
function fillTileableBase(ctx: CanvasRenderingContext2D, size: number, low: number, shade: (u: number, v: number) => [number, number, number]): void {
  const c = document.createElement('canvas');
  c.width = c.height = low;
  const lc = c.getContext('2d');
  if (!lc) return;
  const img = lc.createImageData(low, low);
  const d = img.data;
  for (let y = 0; y < low; y++) {
    for (let x = 0; x < low; x++) {
      const [r, g, b] = shade(x / low, y / low);
      const o = (y * low + x) * 4;
      d[o] = clamp255(r);
      d[o + 1] = clamp255(g);
      d[o + 2] = clamp255(b);
      d[o + 3] = 255;
    }
  }
  lc.putImageData(img, 0, 0);
  const pattern = ctx.createPattern(c, 'repeat');
  if (!pattern) return;
  const k = size / low;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(k, k);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, low, low);
  ctx.restore();
}

/**
 * 草地(手绘感)：柔和色块 → 大片的扇形草叶笔触(亮叶尖、暗叶根) → 细碎短笔触。建议每 10 米平铺。
 */
export function makeGrassTexture(size = 1024): THREE.CanvasTexture {
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      const k = size / 512;
      fillTileableBase(ctx, size, 256, (u, v) => {
        const n = fbm2(u * 7, v * 7, 4, 13, 7);
        const f = fbm2(u * 48, v * 48, 2, 29, 48);
        const g = 120 + (n - 0.5) * 40 + (f - 0.5) * 16;
        return [g * 0.98, g * 1.02, g * 0.96];
      });
      const rng = new Rng(2024);
      ctx.lineCap = 'round';
      // 一片草叶：从根部到叶尖逐渐变细的弯月形，根暗尖亮
      const blade = (px: number, py: number, ang: number, len: number, w: number, bend: number, light: number, alpha: number): void => {
        const ex = px + Math.cos(ang) * len;
        const ey = py + Math.sin(ang) * len;
        const nx = Math.cos(ang + Math.PI / 2);
        const ny = Math.sin(ang + Math.PI / 2);
        const mx = (px + ex) / 2 + nx * bend * len;
        const my = (py + ey) / 2 + ny * bend * len;
        const grad = ctx.createLinearGradient(px, py, ex, ey);
        const lo = Math.round(light * 0.55);
        grad.addColorStop(0, `rgba(${lo},${Math.round(lo * 1.06)},${Math.round(lo * 0.95)},${alpha * 0.5})`);
        grad.addColorStop(1, `rgba(${Math.round(light)},${Math.round(Math.min(255, light * 1.05))},${Math.round(light * 0.78)},${alpha})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(px - nx * w, py - ny * w);
        ctx.quadraticCurveTo(mx - nx * w * 0.6, my - ny * w * 0.6, ex, ey);
        ctx.quadraticCurveTo(mx + nx * w * 0.6, my + ny * w * 0.6, px + nx * w, py + ny * w);
        ctx.closePath();
        ctx.fill();
      };
      // 大扇形草簇
      const fans = Math.round(150 * k * k);
      for (let c = 0; c < fans; c++) {
        const cx = rng.range(0, size);
        const cy = rng.range(0, size);
        const baseAng = -Math.PI / 2 + rng.range(-0.7, 0.7);
        const blades = 4 + rng.int(5);
        const bright = rng.chance(0.6);
        const len0 = rng.range(22, 44) * k;
        tileStamp(size, cx, cy, len0 * 1.3, (px, py) => {
          // 簇根的暗影
          const sh = ctx.createRadialGradient(px, py, 0, px, py, len0 * 0.55);
          sh.addColorStop(0, 'rgba(46,62,44,0.3)');
          sh.addColorStop(1, 'rgba(46,62,44,0)');
          ctx.fillStyle = sh;
          ctx.beginPath();
          ctx.arc(px, py, len0 * 0.55, 0, Math.PI * 2);
          ctx.fill();
        });
        for (let bI = 0; bI < blades; bI++) {
          const ang = baseAng + ((bI + 0.5) / blades - 0.5) * 1.5 + rng.range(-0.1, 0.1);
          const len = len0 * rng.range(0.65, 1.1);
          const w = rng.range(2.2, 3.8) * k;
          const bend = rng.range(-0.22, 0.22);
          const light = bright ? rng.range(165, 215) : rng.range(120, 160);
          const alpha = rng.range(0.4, 0.62);
          tileStamp(size, cx, cy, len + 6, (px, py) => blade(px, py, ang, len, w, bend, light, alpha));
        }
      }
      // 细碎短笔触：成簇，每簇 3~6 笔
      const clumps = Math.round((size * size) / (420 * k * k));
      for (let c = 0; c < clumps; c++) {
        const cx = rng.range(0, size);
        const cy = rng.range(0, size);
        const baseAng = -Math.PI / 2 + rng.range(-0.9, 0.9);
        const light = rng.chance(0.5);
        const blades = 3 + rng.int(4);
        for (let b2 = 0; b2 < blades; b2++) {
          const x = cx + rng.range(-7, 7) * k;
          const y = cy + rng.range(-5, 5) * k;
          const len = rng.range(7, 15) * k;
          const ang = baseAng + rng.range(-0.45, 0.45);
          const tone = light ? rng.range(150, 200) : rng.range(66, 104);
          const a = rng.range(0.2, 0.42);
          ctx.strokeStyle = `rgba(${Math.round(tone * (light ? 1.0 : 0.92))},${Math.round(tone * 1.04)},${Math.round(tone * (light ? 0.8 : 0.95))},${a})`;
          ctx.lineWidth = rng.range(1.2, 2.4) * k;
          tileStamp(size, x, y, len + 4, (px, py) => {
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
            ctx.stroke();
          });
        }
      }
    },
    { repeat: true, anisotropy: 8 },
  );
}

/**
 * 泥土/碎石：斑驳底色 + 带高光与投影的小卵石。建议每 4 米平铺。
 * sunX / sunZ = 指向太阳的水平方向(世界 xz，已归一化)：卵石的投影落在背光一侧，高光在向光一侧。
 * canvas 贴图上下翻转后采样：画布 +y 对应世界 -z。
 */
export function makeDirtTexture(size: number, sunX: number, sunZ: number): THREE.CanvasTexture {
  const sdx = -sunX;
  const sdy = sunZ;
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      fillTileableBase(ctx, size, 256, (u, v) => {
        const n = fbm2(u * 5, v * 5, 4, 51, 5);
        const f = fbm2(u * 60, v * 60, 2, 63, 60);
        const cr = fbm2(u * 10 + 4.1, v * 10, 3, 77, 10);
        let g = 126 + (n - 0.5) * 50 + (f - 0.5) * 26;
        if (Math.abs(cr - 0.5) < 0.014) g -= 22;
        return [g * 1.02, g * 0.99, g * 0.94];
      });
      const rng = new Rng(808);
      const pebbles = Math.round((size * size) / 3200);
      for (let i = 0; i < pebbles; i++) {
        const x = rng.range(0, size);
        const y = rng.range(0, size);
        const r = rng.range(2, 7.5) * (rng.chance(0.12) ? 1.8 : 1);
        const rot = rng.range(0, Math.PI);
        const tone = rng.range(128, 190);
        const sq = rng.range(0.6, 0.95);
        tileStamp(size, x, y, r + 4, (px, py) => {
          // 投影(背光侧) → 卵石本体 → 向光一侧的高光
          ctx.fillStyle = 'rgba(40,34,30,0.32)';
          ctx.beginPath();
          ctx.ellipse(px + sdx * r * 0.4, py + sdy * r * 0.4, r, r * sq, rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgb(${Math.round(tone)},${Math.round(tone * 0.97)},${Math.round(tone * 0.92)})`;
          ctx.beginPath();
          ctx.ellipse(px, py, r, r * sq, rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,250,0.3)';
          ctx.beginPath();
          ctx.ellipse(px - sdx * r * 0.3, py - sdy * r * 0.3, r * 0.5, r * sq * 0.42, rot, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    { repeat: true, anisotropy: 8 },
  );
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function dataTexture(data: Uint8Array, size: number, anisotropy: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export interface LaneStoneTextures {
  /** R = 石面明暗(0.5 = 乘数 1)，G = 石面蒙版(缝隙为 0)，B = 每块石头的随机 id，A = 烘好的倒角受光(0.5 = 乘数 1；不读法线的低画质档用) */
  data: THREE.DataTexture;
  /** RG = 法线 xy(对应世界 x / z)，B = 高度(缝底 0)，A = 苔藓/磨损噪声(缝边偏高) */
  normal: THREE.DataTexture;
}

/** 一张贴图横向排几块大石板(8 米平铺 → 每块 1.6 米) */
const SLAB_CELLS = 5;

/**
 * 兵线石板(两张 512² 数据贴图，可平铺，建议每 8 米铺一次)。
 * 版式：偏方正的大石板(1.6 米)里随机再直切成 2~3 块，两种尺度混排；每块有各自的明度、细微倾角、崩角与偶尔的裂纹。
 * 倒角不画进颜色，而是给出真法线，主光换方向、技能点光扫过都会有反应。
 * sun = 指向太阳的单位向量(世界坐标)，只用于烘 A 通道里给低画质档用的倒角明暗。
 */
export function makeLaneStoneTextures(sun: { x: number; y: number; z: number }, size = 512, anisotropy = 8): LaneStoneTextures {
  const cells = SLAB_CELLS;
  const rng = new Rng(4127);
  const n = cells * cells;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  // 每块大板的切分方式：0 不切，1 竖切一刀，2 横切一刀，3 竖切后其中半边再横切
  const split = new Uint8Array(n);
  const cutX = new Float32Array(n);
  const cutY = new Float32Array(n);
  const side = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    px[k] = (k % cells) + 0.5 + rng.range(-0.26, 0.26);
    py[k] = Math.floor(k / cells) + 0.5 + rng.range(-0.26, 0.26);
    const r = rng.next();
    split[k] = r < 0.3 ? 0 : r < 0.58 ? 1 : r < 0.8 ? 2 : 3;
    cutX[k] = rng.range(-0.13, 0.13);
    cutY[k] = rng.range(-0.13, 0.13);
    side[k] = rng.chance(0.5) ? 1 : 0;
  }
  // 每块小石头的随机量(一块大板最多 3 块)
  const tone0 = new Float32Array(n * 3);
  const id0 = new Float32Array(n * 3);
  const tiltX = new Float32Array(n * 3);
  const tiltY = new Float32Array(n * 3);
  const cracked = new Uint8Array(n * 3);
  for (let k = 0; k < n * 3; k++) {
    tone0[k] = rng.range(-1, 1);
    id0[k] = rng.range(0.06, 1);
    tiltX[k] = rng.range(-1, 1);
    tiltY[k] = rng.range(-1, 1);
    cracked[k] = rng.chance(0.16) ? 1 : 0;
  }
  const count = size * size;
  const height = new Float32Array(count);
  const tone = new Float32Array(count);
  const mask = new Float32Array(count);
  const stone = new Uint16Array(count);
  const moss = new Float32Array(count);
  const BEVEL = 0.05;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const cx = u * cells;
      const cy = v * cells;
      const ix = Math.floor(cx);
      const iy = Math.floor(cy);
      let f1 = 9;
      let f2 = 9;
      let bi = 0;
      let lx = 0;
      let ly = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const gi = (ix + di + cells) % cells;
          const gj = (iy + dj + cells) % cells;
          const k = gj * cells + gi;
          const ddx = cx - (px[k] - gi + ix + di);
          const ddy = cy - (py[k] - gj + iy + dj);
          const ax = Math.abs(ddx);
          const ay = Math.abs(ddy);
          // 偏切比雪夫的度量：石板接近矩形，只在角上带一点斜切
          const dist = Math.hypot(ddx, ddy) * 0.2 + Math.max(ax, ay) * 0.8;
          if (dist < f1) {
            f2 = f1;
            f1 = dist;
            bi = k;
            lx = ddx;
            ly = ddy;
          } else if (dist < f2) f2 = dist;
        }
      }
      // 到大板边缘的距离(格) + 板内直切缝
      let edge = (f2 - f1) * 0.5;
      let sub = 0;
      const sp = split[bi];
      if (sp === 1 || sp === 3) {
        const d = lx - cutX[bi];
        sub = d > 0 ? 1 : 0;
        edge = Math.min(edge, Math.abs(d));
        if (sp === 3 && sub === side[bi]) {
          const d2 = ly - cutY[bi];
          if (d2 > 0) sub = 2;
          edge = Math.min(edge, Math.abs(d2));
        }
      } else if (sp === 2) {
        const d = ly - cutY[bi];
        sub = d > 0 ? 1 : 0;
        edge = Math.min(edge, Math.abs(d));
      }
      const si = bi * 3 + sub;
      const nLow = fbm2(u * 6, v * 6, 3, 5, 6);
      const nMid = valueNoise2(u * 28, v * 28, 9, 28);
      const nFine = valueNoise2(u * 90, v * 90, 13, 90);
      // 缝宽带一点手工的不匀
      edge += (nMid - 0.5) * 0.008;
      const grout = 0.0085 + (nLow - 0.5) * 0.003;
      const o = y * size + x;
      const m = clamp01((edge - grout) / 0.009);
      const t = clamp01((edge - grout) / BEVEL);
      // 倒角剖面：圆角
      let h = (1 - (1 - t) * (1 - t)) * (0.86 + (nLow - 0.5) * 0.3 + (nFine - 0.5) * 0.07);
      let tn = 0.5 + tone0[si] * 0.055 + (nLow - 0.5) * 0.09 + (nFine - 0.5) * 0.035;
      // 崩角：靠近边缘处随机缺一小块
      const chip = sstep(0.78, 0.92, valueNoise2(u * 19 + 3.7, v * 19, 31, 19)) * (1 - sstep(0.02, 0.13, edge - grout));
      h -= chip * 0.4;
      tn -= chip * 0.05;
      // 裂纹：少数石头上一道细线
      if (cracked[si] && edge > grout + 0.035) {
        const c = fbm2(u * 7 + id0[si] * 13, v * 7 + id0[si] * 5, 2, 77, 7);
        const cl = 1 - sstep(0.004, 0.013, Math.abs(c - 0.5));
        h -= cl * 0.5;
        tn -= cl * 0.1;
      }
      height[o] = m > 0 ? Math.max(0.02, h) * m : 0;
      tone[o] = tn;
      mask[o] = m;
      stone[o] = si;
      // 苔藓/磨损噪声：大块斑驳 + 贴着石缝的一圈
      moss[o] = clamp01(fbm2(u * 4 + 9.3, v * 4 + 2.1, 3, 41, 4) * 0.8 + (1 - sstep(0, 0.13, edge - grout)) * 0.34 - 0.05);
    }
  }
  const data = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  const at = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)];
  // 高度 1 ≈ 2.4 厘米；一个像素 = 800 / size 厘米
  const slope = 2.4 / (800 / size) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = y * size + x;
      const si = stone[o];
      const m = mask[o];
      // 法线：倒角/崩角/裂纹来自高度场，另加每块石头自己的一点倾角(整块石面的明度因此各不相同)
      let nx = -(at(x + 1, y) - at(x - 1, y)) * slope + tiltX[si] * 0.03 * m;
      let ny = -(at(x, y + 1) - at(x, y - 1)) * slope + tiltY[si] * 0.03 * m;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      const lit = (nx * sun.x + inv * sun.y + ny * sun.z) / sun.y;
      data[o * 4] = clamp255(tone[o] * 255);
      data[o * 4 + 1] = clamp255(m * 255);
      data[o * 4 + 2] = clamp255(id0[si] * 255);
      data[o * 4 + 3] = clamp255(lit * 127.5);
      normal[o * 4] = clamp255((nx * 0.5 + 0.5) * 255);
      normal[o * 4 + 1] = clamp255((ny * 0.5 + 0.5) * 255);
      normal[o * 4 + 2] = clamp255(height[o] * 255);
      normal[o * 4 + 3] = clamp255(moss[o] * 255);
    }
  }
  return { data: dataTexture(data, size, anisotropy), normal: dataTexture(normal, size, anisotropy) };
}

/**
 * 水下焦散(单通道，可平铺，存在 RGBA 的 R 里；G = 同一张图错开半幅的副本，着色器一次采样就能拿到两层)。
 * 做法：被几组正弦互相扭曲过的细胞网，只留胞壁上的细亮线，交汇处更亮。
 */
export function makeCausticTexture(size = 256): THREE.DataTexture {
  const cells = 7;
  const TAU = Math.PI * 2;
  const pts: number[] = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push(i + 0.5 + (hash2(i, j, 311) - 0.5) * 0.86, j + 0.5 + (hash2(i, j, 313) - 0.5) * 0.86);
  const web = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u0 = x / size;
      const v0 = y / size;
      // 可平铺的域扭曲：整数波数的正弦
      const u = u0 + 0.03 * Math.sin(TAU * (2 * v0 + u0) + 1.3) + 0.014 * Math.sin(TAU * (5 * v0 - 3 * u0) + 4.0);
      const v = v0 + 0.03 * Math.sin(TAU * (2 * u0 - v0) + 2.9) + 0.014 * Math.sin(TAU * (4 * u0 + 5 * v0) + 0.6);
      const cx = (((u % 1) + 1) % 1) * cells;
      const cy = (((v % 1) + 1) % 1) * cells;
      const ix = Math.floor(cx);
      const iy = Math.floor(cy);
      let f1 = 9;
      let f2 = 9;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const gi = (ix + di + cells) % cells;
          const gj = (iy + dj + cells) % cells;
          const k = (gj * cells + gi) * 2;
          const d = Math.hypot(pts[k] - gi + ix + di - cx, pts[k + 1] - gj + iy + dj - cy);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      }
      const e = f2 - f1;
      // 细亮线 + 一层很淡的宽晕
      const line = 1 - sstep(0.0, 0.13, e);
      web[y * size + x] = clamp01(line * line * 0.85 + (1 - sstep(0.0, 0.5, e)) * 0.2);
    }
  }
  const data = new Uint8Array(size * size * 4);
  const half = size >> 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      data[o] = web[y * size + x] * 255;
      data[o + 1] = web[((size - 1 - y + half) % size) * size + ((x + half + 37) % size)] * 255;
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
  }
  return dataTexture(data, size, 2);
}
