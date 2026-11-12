/**
 * 地表专用的程序化贴图(canvas 绘制，全部可平铺)。
 * 亮度约定：中性灰 128 = 乘数 1.0，着色器里用 `tex * 2.0` 去调制调色板颜色，所以这里只画明暗与轻微色偏。
 */
import type * as THREE from 'three';
import { Rng, fbm2, makeCanvasTexture, tileStamp } from '../materials';

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** 草地：柔和色块 + 成簇的短笔触(手绘感)。建议每 5 米平铺 */
export function makeGrassTexture(size = 512): THREE.CanvasTexture {
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      const d = img.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const n = fbm2(u * 6, v * 6, 4, 13, 6);
          const f = fbm2(u * 40, v * 40, 2, 29, 40);
          const g = 122 + (n - 0.5) * 46 + (f - 0.5) * 20;
          const o = (y * size + x) * 4;
          d[o] = clamp255(g * 0.98);
          d[o + 1] = clamp255(g * 1.02);
          d[o + 2] = clamp255(g * 0.96);
          d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const rng = new Rng(2024);
      ctx.lineCap = 'round';
      // 成簇的草叶笔触：每簇 4~7 笔，朝向相近
      const clumps = Math.round((size * size) / 300);
      for (let c = 0; c < clumps; c++) {
        const cx = rng.range(0, size);
        const cy = rng.range(0, size);
        const baseAng = -Math.PI / 2 + rng.range(-0.9, 0.9);
        const light = rng.chance(0.55);
        const blades = 3 + rng.int(5);
        for (let b = 0; b < blades; b++) {
          const x = cx + rng.range(-7, 7);
          const y = cy + rng.range(-5, 5);
          const len = rng.range(7, 17);
          const ang = baseAng + rng.range(-0.45, 0.45);
          const bend = rng.range(-0.5, 0.5);
          const tone = light ? rng.range(150, 205) : rng.range(62, 104);
          const a = rng.range(0.22, 0.5);
          ctx.strokeStyle = `rgba(${Math.round(tone * (light ? 1.0 : 0.92))},${Math.round(tone * 1.04)},${Math.round(tone * (light ? 0.8 : 0.95))},${a})`;
          ctx.lineWidth = rng.range(1.3, 2.8);
          tileStamp(size, x, y, len + 4, (px, py) => {
            const ex = px + Math.cos(ang) * len;
            const ey = py + Math.sin(ang) * len;
            const mx = (px + ex) / 2 + Math.cos(ang + Math.PI / 2) * bend * len * 0.5;
            const my = (py + ey) / 2 + Math.sin(ang + Math.PI / 2) * bend * len * 0.5;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.quadraticCurveTo(mx, my, ex, ey);
            ctx.stroke();
          });
        }
      }
    },
    { repeat: true, anisotropy: 8 },
  );
}

/** 泥土/碎石：斑驳底色 + 带高光与投影的小卵石。建议每 4 米平铺 */
export function makeDirtTexture(size = 512): THREE.CanvasTexture {
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      const d = img.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const n = fbm2(u * 5, v * 5, 4, 51, 5);
          const f = fbm2(u * 60, v * 60, 2, 63, 60);
          const cr = fbm2(u * 10 + 4.1, v * 10, 3, 77, 10);
          let g = 126 + (n - 0.5) * 50 + (f - 0.5) * 26;
          if (Math.abs(cr - 0.5) < 0.01) g -= 26;
          const o = (y * size + x) * 4;
          d[o] = clamp255(g * 1.02);
          d[o + 1] = clamp255(g * 0.99);
          d[o + 2] = clamp255(g * 0.94);
          d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const rng = new Rng(808);
      const pebbles = Math.round((size * size) / 1500);
      for (let i = 0; i < pebbles; i++) {
        const x = rng.range(0, size);
        const y = rng.range(0, size);
        const r = rng.range(2, 7.5) * (rng.chance(0.12) ? 1.8 : 1);
        const rot = rng.range(0, Math.PI);
        const tone = rng.range(128, 190);
        const sq = rng.range(0.6, 0.95);
        tileStamp(size, x, y, r + 4, (px, py) => {
          // 投影(东北侧) → 卵石本体 → 朝西南的高光
          ctx.fillStyle = 'rgba(40,34,30,0.32)';
          ctx.beginPath();
          ctx.ellipse(px + r * 0.28, py - r * 0.3, r, r * sq, rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgb(${Math.round(tone)},${Math.round(tone * 0.97)},${Math.round(tone * 0.92)})`;
          ctx.beginPath();
          ctx.ellipse(px, py, r, r * sq, rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,250,0.33)';
          ctx.beginPath();
          ctx.ellipse(px - r * 0.25, py + r * 0.22, r * 0.5, r * sq * 0.42, rot, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    { repeat: true, anisotropy: 8 },
  );
}

/**
 * 基地地台方砖(数据贴图，线性)：R = 石面明暗(128 = 1.0)，G = 金属嵌线蒙版，B = 发光星纹蒙版。
 * 一张贴图 = 2×2 块大方砖，建议每 4.4 米平铺。
 */
export function makePlazaTexture(size = 512): THREE.CanvasTexture {
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      const half = size / 2;
      const rng = new Rng(31337);
      // R：石面
      const img = ctx.createImageData(size, size);
      const d = img.data;
      const tones = [rng.range(-10, 10), rng.range(-10, 10), rng.range(-10, 10), rng.range(-10, 10)];
      const grout = size * 0.011;
      const bevel = size * 0.03;
      const inset = size * 0.085;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const lx = x % half;
          const ly = y % half;
          const slab = (y >= half ? 2 : 0) + (x >= half ? 1 : 0);
          const ex = Math.min(lx, half - lx);
          const ey = Math.min(ly, half - ly);
          const e = Math.min(ex, ey);
          const n = fbm2((x / size) * 14, (y / size) * 14, 3, 5, 14);
          const f = fbm2((x / size) * 64, (y / size) * 64, 2, 9, 64);
          let g = 132 + tones[slab] + (n - 0.5) * 30 + (f - 0.5) * 12;
          if (e < grout) g = 70 + n * 16;
          else if (e < grout + bevel) {
            // 倒角：朝西南(左/下)的边亮，朝东北(右/上)的边暗
            const t = 1 - (e - grout) / bevel;
            const left = lx < half - lx;
            const bottom = ly > half - ly;
            const lit = ex < ey ? (left ? 1 : -1) : bottom ? 1 : -1;
            g += lit * t * 26;
          }
          // 内嵌的细刻线
          if (Math.abs(e - inset) < size * 0.004) g -= 16;
          const o = (y * size + x) * 4;
          d[o] = clamp255(g);
          d[o + 1] = 0;
          d[o + 2] = 0;
          d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      // G：四砖交汇处的菱形金属嵌片 + 砖缝中点的小钉
      ctx.fillStyle = 'rgb(0,255,0)';
      const diamond = (cx: number, cy: number, r: number): void => {
        tileStamp(size, cx, cy, r + 2, (px, py) => {
          ctx.beginPath();
          ctx.moveTo(px, py - r);
          ctx.lineTo(px + r, py);
          ctx.lineTo(px, py + r);
          ctx.lineTo(px - r, py);
          ctx.closePath();
          ctx.fill();
        });
      };
      // 先把嵌片位置的 R 通道压暗一点做出镶嵌槽
      ctx.globalCompositeOperation = 'source-over';
      diamond(0, 0, size * 0.062);
      diamond(half, half, size * 0.062);
      diamond(half, 0, size * 0.026);
      diamond(0, half, size * 0.026);
      // B：隔块的四角星发光刻纹
      ctx.fillStyle = 'rgb(118,0,255)';
      const star = (cx: number, cy: number, r: number): void => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const rr = i % 2 === 0 ? r : r * 0.3;
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      };
      star(half * 0.5, half * 0.5, size * 0.05);
      star(half * 1.5, half * 1.5, size * 0.05);
    },
    { repeat: true, srgb: false, anisotropy: 8 },
  );
}
