/**
 * 地面遮罩（一张 RGBA8 贴图，铺满数据范围，4 m / 像素）：地形材质与山上灯点共用。
 *   R：被路灯照到的程度（车行道 + 人行道 = 1，往外 10 m / 25 m 两圈渐弱）——山坡树冠近路处的暖色边、广场的光
 *   G：建成区（楼宇轮廓外扩约 6 m）——平地画混凝土 / 铺地，坡地画树冠
 *   B：路灯冷暖（钠灯 = 1，白光 LED = 0）
 *   A：水面（data water 多边形）——地形网格在海边伸进水里的部分不画
 * 用 2D canvas 栅格化，贴图约 620 × 470（含 mipmap ≈ 1.6 MB），登记在 streets:ground-mask。
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType } from 'three';
import type { CityFile, FlatXY } from '@central/data';
import { DM_TO_M } from '../../coords';
import { registerTextureBytes } from '../materials/lighting';
import type { RoadPlan } from '../roads';

/** 米 / 像素。 */
export const MASK_M = 4;

export interface GroundMask {
  texture: DataTexture;
  /** 原始像素（行 0 = 北边），供 CPU 采样。 */
  data: Uint8Array;
  w: number;
  h: number;
  /** 模拟坐标（米）：minX, minY, sizeX, sizeY。 */
  rect: [number, number, number, number];
  /** 在模拟坐标 (x, y)（米）处取某通道（0–1），范围外为 0。 */
  sample(x: number, y: number, ch: 0 | 1 | 2 | 3): number;
}

const cache = new WeakMap<CityFile, GroundMask>();

export function groundMask(city: CityFile, plans: readonly RoadPlan[]): GroundMask {
  const hit = cache.get(city);
  if (hit) return hit;
  const [x0, y0, x1, y1] = city.meta.bbox;
  const rect: [number, number, number, number] = [x0 * DM_TO_M, y0 * DM_TO_M, (x1 - x0) * DM_TO_M, (y1 - y0) * DM_TO_M];
  const w = Math.max(1, Math.ceil(rect[2] / MASK_M));
  const h = Math.max(1, Math.ceil(rect[3] / MASK_M));
  const px = (x: number) => ((x - x0) / (x1 - x0)) * w;
  const py = (y: number) => ((y1 - y) / (y1 - y0)) * h;
  const pxPerDm = w / (x1 - x0);
  const layer = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    return g;
  };
  const path = (g: CanvasRenderingContext2D, pts: FlatXY) => {
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) g.moveTo(px(pts[i]!), py(pts[i + 1]!));
      else g.lineTo(px(pts[i]!), py(pts[i + 1]!));
    }
  };

  // R：路灯照度（外圈先画、叠加）
  const r = layer();
  r.globalCompositeOperation = 'lighter';
  for (const [extra, alpha] of [
    [250, 0.07],
    [100, 0.2],
  ] as const) {
    r.strokeStyle = `rgba(255,255,255,${alpha})`;
    for (const p of plans) {
      if (!p.lamps || p.elev > 0) continue;
      const half = p.hw + Math.max(p.pavL[0] ?? 0, p.pavR[0] ?? 0);
      r.lineWidth = Math.max(1, 2 * (half + extra) * pxPerDm);
      path(r, p.pts);
      r.stroke();
    }
  }
  r.globalCompositeOperation = 'source-over';
  r.strokeStyle = '#fff';
  for (const p of plans) {
    if (!p.lamps || p.elev > 0) continue;
    const half = p.hw + Math.max(...p.pavL, ...p.pavR, 0);
    r.lineWidth = Math.max(1, 2 * half * pxPerDm);
    path(r, p.pts);
    r.stroke();
  }

  // G：建成区
  const gC = layer();
  gC.fillStyle = '#fff';
  gC.strokeStyle = '#fff';
  gC.lineWidth = Math.max(1, 120 * pxPerDm);
  for (const b of city.buildings) {
    path(gC, b.footprint.outer);
    gC.closePath();
    gC.fill();
    gC.stroke();
  }

  // B：钠灯比例
  const bC = layer();
  for (const p of plans) {
    if (!p.lamps || p.elev > 0) continue;
    bC.strokeStyle = p.lamps.sodium ? '#fff' : '#000';
    bC.lineWidth = Math.max(1, 2 * (p.hw + 300) * pxPerDm);
    path(bC, p.pts);
    bC.stroke();
  }

  // A：水面
  const aC = layer();
  aC.fillStyle = '#fff';
  for (const ring of city.water) {
    aC.beginPath();
    for (const rr of [ring.outer, ...(ring.holes ?? [])]) {
      for (let i = 0; i < rr.length; i += 2) {
        if (i === 0) aC.moveTo(px(rr[i]!), py(rr[i + 1]!));
        else aC.lineTo(px(rr[i]!), py(rr[i + 1]!));
      }
      aC.closePath();
    }
    aC.fill('evenodd');
  }

  const data = new Uint8Array(w * h * 4);
  const chans = [r, gC, bC, aC].map((g) => g.getImageData(0, 0, w, h).data);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 4; c++) data[i * 4 + c] = chans[c]![i * 4]!;
  }
  // DataTexture 的第 0 行是贴图底边（v = 0）：canvas 行 0 是北边，上传时翻转，使 v 随北向增大
  const flipped = new Uint8Array(data.length);
  for (let j = 0; j < h; j++) flipped.set(data.subarray((h - 1 - j) * w * 4, (h - j) * w * 4), j * w * 4);
  const texture = new DataTexture(flipped, w, h, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  registerTextureBytes('streets:ground-mask', Math.round(w * h * 4 * (4 / 3)));

  const sample = (x: number, y: number, ch: 0 | 1 | 2 | 3): number => {
    const i = Math.floor(((x - rect[0]) / rect[2]) * w);
    const j = Math.floor((1 - (y - rect[1]) / rect[3]) * h);
    if (i < 0 || j < 0 || i >= w || j >= h) return 0;
    return data[(j * w + i) * 4 + ch]! / 255;
  };
  const mask: GroundMask = { texture, data, w, h, rect, sample };
  cache.set(city, mask);
  return mask;
}
