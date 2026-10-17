// ===== art/overlays.ts =====（spec:ui-art §3.9.1 覆盖物与角色静帧；WP9 v1：每种 1 帧，v2 补帧）
// overlay id 用 contracts/render.OverlayId；actor id 用 ActorId（8 朝向共用一张）。
import type { IndexedBitmap } from '../contracts/render';
import { ActorId, OverlayId } from '../contracts/render';
import { hashNoise } from '../contracts/prng';
import { IDX, Ramp, ci, misc } from './palette';
import type { ScaleSpec } from './raster';
import { ditherFill, fillEllipse, fillPoly, fillRect, line, newBitmap, setPx, strokeEllipse } from './raster';
import { car, fillLot, lotPoly, lotPt, newObjectLot, newTallLot, newTileLot, strokeLot, type Lot } from './iso';
import { zoneTint } from './nature';
import { genEdgeWall } from './terrain';

const DIAMOND_UVZ = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
/** 菱形描边 lw 像素（向内收）。 */
function diamondOutline(lot: Lot, idx: number, lwL: number): void {
  const lw = Math.max(1, Math.round(lwL * lot.sp.k));
  for (let k = 0; k < lw; k++) { const ins = k / (lot.sp.W / 2); strokeLot(lot, [ins, ins, 0, 1 - ins, ins, 0, 1 - ins, 1 - ins, 0, ins, 1 - ins, 0], idx); }
}
const ZONE_COLOR: Readonly<Record<number, [number, boolean]>> = {
  [OverlayId.ZoneRLight]: [IDX.ZoneR, false], [OverlayId.ZoneRDense]: [IDX.ZoneR, true], [OverlayId.ZoneCLight]: [IDX.ZoneC, false], [OverlayId.ZoneCDense]: [IDX.ZoneC, true],
  [OverlayId.ZoneILight]: [IDX.ZoneI, false], [OverlayId.ZoneIDense]: [IDX.ZoneI, true], [OverlayId.ZoneMilitary]: [ci(Ramp.Olive, 5), true], [OverlayId.ZoneAirport]: [ci(Ramp.Neutral, 7), true], [OverlayId.ZoneSeaport]: [ci(Ramp.Water, 6), true],
};

/** genOverlay(id, variant)：EdgeWall 的 variant = levels 1..31；其余忽略 variant。不支持的 id 返回 null。 */
export function genOverlay(id: number, variant: number, sp: ScaleSpec): IndexedBitmap | null {
  const pxs = (v: number): number => Math.max(1, Math.round(v * sp.k));
  switch (id) {
    case OverlayId.CursorTile: { const lot = newTileLot(sp); diamondOutline(lot, ci(Ramp.Neutral, 7), 2); return lot.bmp; }
    case OverlayId.PreviewOk: case OverlayId.PreviewBad: {
      const lot = newTileLot(sp);
      const c = id === OverlayId.PreviewOk ? IDX.ZoneR : ci(Ramp.Signal, 5);
      ditherFill(lot.bmp, lotPoly(lot, DIAMOND_UVZ), c, 0, 'checker');
      diamondOutline(lot, c, 2);
      return lot.bmp;
    }
    case OverlayId.ZoneRLight: case OverlayId.ZoneRDense: case OverlayId.ZoneCLight: case OverlayId.ZoneCDense: case OverlayId.ZoneILight: case OverlayId.ZoneIDense:
    case OverlayId.ZoneMilitary: case OverlayId.ZoneAirport: case OverlayId.ZoneSeaport: {
      const lot = newTileLot(sp); const [c, dense] = ZONE_COLOR[id]!; zoneTint(lot, c, dense); return lot.bmp;
    }
    case OverlayId.NoPower: {
      const lot = newTallLot(sp, 36);
      const [cx, cy] = lotPt(lot, 0.5, 0.5);
      const w = pxs(16), h = pxs(24);
      const bolt = [cx + w * 0.1, cy - h - pxs(4), cx - w * 0.4, cy - h * 0.45 - pxs(4), cx - w * 0.05, cy - h * 0.45 - pxs(4), cx - w * 0.2, cy - pxs(4), cx + w * 0.45, cy - h * 0.55 - pxs(4), cx + w * 0.05, cy - h * 0.55 - pxs(4)];
      fillPoly(lot.bmp, bolt, ci(Ramp.Amber, 7));
      if (sp.scale !== 'S') outline(lot.bmp, ci(Ramp.Neutral, 1));
      return lot.bmp;
    }
    case OverlayId.NoWater: {
      const lot = newTallLot(sp, 28);
      const [cx, cy] = lotPt(lot, 0.5, 0.5);
      const r = pxs(6);
      fillEllipse(lot.bmp, cx, cy - r - pxs(4), r, r, ci(Ramp.Water, 6));
      fillPoly(lot.bmp, [cx - r + 1, cy - r - pxs(6), cx + r - 1, cy - r - pxs(6), cx, cy - r * 2 - pxs(12)], ci(Ramp.Water, 6));
      line(lot.bmp, cx - r, cy - pxs(2), cx + r, cy - r * 2 - pxs(10), ci(Ramp.Signal, 5), sp.lw);
      if (sp.scale !== 'S') outline(lot.bmp, ci(Ramp.Neutral, 1));
      return lot.bmp;
    }
    case OverlayId.Fire: {
      const lot = newObjectLot(sp, 1);
      const seeds: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.42, 1.0], [0.3, 0.62, 0.7], [0.7, 0.62, 0.8]];
      for (const [u, v, s] of seeds) {
        const [x, y] = lotPt(lot, u, v);
        const fh = pxs(40 * s), fw = pxs(14 * s);
        for (let k = 0; k < 5; k++) { const f = 1 - k * 0.18; fillEllipse(lot.bmp, x + (k % 2 ? 1 : -1) * k * 0.5, y - fh * (1 - f) * 0.55, fw * f, fh * 0.5 * f, IDX.FireBase + 1 + k); }
      }
      // 抖动边缘
      const b = lot.bmp;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const v = b.data[y * b.w + x]!; if (v >= IDX.FireBase && v < IDX.FireBase + 8 && hashNoise(3, x, y) > 0.8) b.data[y * b.w + x] = v + (hashNoise(4, x, y) > 0.5 ? 1 : -1); }
      return b;
    }
    case OverlayId.Flood: {
      const lot = newTileLot(sp);
      fillLot(lot, DIAMOND_UVZ, ci(Ramp.Water, 4));
      if (sp.scale !== 'S') { const b = lot.bmp; for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.data[y * b.w + x] !== 0 && hashNoise(9, x, y) > 0.9) { b.data[y * b.w + x] = IDX.CycleA + ((x + y) & 15); b.cycling = true; } }
      return lot.bmp;
    }
    case OverlayId.Toxic: {
      const lot = newTallLot(sp, 40);
      const [cx, cy] = lotPt(lot, 0.5, 0.5);
      const rx = pxs(24), ry = pxs(10), lift = pxs(14);
      const pts = ellipsePts(cx, cy - lift, rx, ry);
      ditherFill(lot.bmp, pts, ci(Ramp.Olive, 5), ci(Ramp.Olive, 6), 'checker');
      ditherFill(lot.bmp, ellipsePts(cx - rx * 0.3, cy - lift - ry * 0.6, rx * 0.5, ry * 0.6), ci(Ramp.Olive, 6), ci(Ramp.Olive, 7), 'checker');
      ditherFill(lot.bmp, ellipsePts(cx + rx * 0.35, cy - lift - ry * 0.4, rx * 0.4, ry * 0.5), ci(Ramp.Olive, 5), ci(Ramp.Olive, 6), 'rows');
      return lot.bmp;
    }
    case OverlayId.Riot: {
      const lot = newObjectLot(sp, 1);
      for (let k = 0; k < 7; k++) {
        const u = 0.2 + 0.6 * hashNoise(21, k, 1), v = 0.2 + 0.6 * hashNoise(21, k, 2);
        const [x, y] = lotPt(lot, u, v);
        const bw = pxs(2), bh = pxs(4);
        fillRect(lot.bmp, Math.round(x) - (bw >> 1), Math.round(y) - bh, bw, bh, k % 3 === 0 ? ci(Ramp.Signal, 4) : ci(Ramp.Neutral, 2));
        setPx(lot.bmp, Math.round(x) - (bw >> 1), Math.round(y) - bh - 1, ci(Ramp.Sand, 6));
        if (sp.scale !== 'S' && k % 2 === 0) line(lot.bmp, Math.round(x) + bw, Math.round(y) - bh, Math.round(x) + bw + pxs(2), Math.round(y) - bh - pxs(3), ci(Ramp.Rust, 3));
      }
      return lot.bmp;
    }
    case OverlayId.Sign: case OverlayId.Connection: {
      const lot = newTallLot(sp, 40);
      const [cx, cy] = lotPt(lot, 0.5, 0.5);
      const post = pxs(22), pw = pxs(22), ph = pxs(9);
      line(lot.bmp, cx, cy, cx, cy - post, ci(Ramp.Neutral, 3));
      fillRect(lot.bmp, Math.round(cx - pw / 2), Math.round(cy - post - ph), pw, ph, id === OverlayId.Sign ? ci(Ramp.Neutral, 7) : ci(Ramp.Amber, 6));
      if (sp.scale !== 'S') { const b = lot.bmp; const x0 = Math.round(cx - pw / 2), y0 = Math.round(cy - post - ph); for (let x = x0; x < x0 + pw; x++) { setPx(b, x, y0, ci(Ramp.Neutral, 1)); setPx(b, x, y0 + ph - 1, ci(Ramp.Neutral, 1)); } for (let y = y0; y < y0 + ph; y++) { setPx(b, x0, y, ci(Ramp.Neutral, 1)); setPx(b, x0 + pw - 1, y, ci(Ramp.Neutral, 1)); } }
      return lot.bmp;
    }
    case OverlayId.TrafficLight: case OverlayId.TrafficHeavy: {
      const lot = newTileLot(sp);
      const heavy = id === OverlayId.TrafficHeavy;
      const cols = [misc(3, 1, 0), misc(1, 1, 3), misc(3, 3, 3), misc(3, 3, 0), misc(0, 2, 1), misc(2, 0, 0)];
      const n = heavy ? 6 : 2;
      for (let k = 0; k < n; k++) {
        const t = 0.1 + 0.7 * hashNoise(31 + id, k, 1);
        if (k % 2 === 0) car(lot, t, 0.38, 0, cols[k]!, 'u'); else car(lot, t, 0.54, 0, cols[k]!, 'u');
      }
      return lot.bmp;
    }
    case OverlayId.EdgeWallL: return genEdgeWall(Math.max(1, variant | 0), 'L', sp);
    case OverlayId.EdgeWallR: return genEdgeWall(Math.max(1, variant | 0), 'R', sp);
    default: return null;
  }
}
function ellipsePts(cx: number, cy: number, rx: number, ry: number): number[] {
  // 16 边形近似（用预置的 cos/sin 表，避免三角函数）
  const C = [1, 0.9239, 0.7071, 0.3827, 0, -0.3827, -0.7071, -0.9239, -1, -0.9239, -0.7071, -0.3827, 0, 0.3827, 0.7071, 0.9239];
  const out: number[] = [];
  for (let k = 0; k < 16; k++) out.push(cx + rx * C[k]!, cy + ry * C[(k + 12) & 15]!);
  return out;
}
/** 给非透明像素加 1 px 外轮廓。 */
function outline(b: IndexedBitmap, idx: number): void {
  const src = new Uint8Array(b.data);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (src[y * b.w + x] !== 0) continue;
    const n = (x > 0 && src[y * b.w + x - 1]! !== 0) || (x + 1 < b.w && src[y * b.w + x + 1]! !== 0) || (y > 0 && src[(y - 1) * b.w + x]! !== 0) || (y + 1 < b.h && src[(y + 1) * b.w + x]! !== 0);
    if (n) b.data[y * b.w + x] = idx;
  }
}

/** 角色静帧 genActor(id)：Tornado / Monster / Explosion / DeployPolice / DeployFire / DeployMilitary；其余 v2，返回 null。锚点在底部中心。 */
export function genActor(id: number, sp: ScaleSpec): IndexedBitmap | null {
  const pxs = (v: number): number => Math.max(1, Math.round(v * sp.k));
  switch (id) {
    case ActorId.Tornado: {
      const w = pxs(64), h = pxs(96);
      const b = newBitmap(w, h, w >> 1, h);
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const half = (pxs(12) + (w / 2 - pxs(12)) * (1 - t)) * (0.85 + 0.15 * hashNoise(5, y, 0));
        const wob = Math.round((hashNoise(6, y >> 2, 0) - 0.5) * pxs(6) * t);
        const x0 = Math.round(w / 2 - half + wob), x1 = Math.round(w / 2 + half + wob);
        for (let x = x0; x <= x1; x++) { const f = (x - x0) / Math.max(1, x1 - x0); const shade = f < 0.3 ? 6 : f < 0.7 ? 5 : 4; const v = ((x + y) & 1) === 0 ? ci(Ramp.Neutral, shade) : ci(Ramp.Neutral, shade - 1 + ((y >> 1) & 1)); setPx(b, x, y, v); }
      }
      // 碎屑
      for (let k = 0; k < 12; k++) setPx(b, Math.floor(hashNoise(7, k, 1) * w), Math.floor(hashNoise(7, k, 2) * h), k & 1 ? ci(Ramp.Earth, 3) : ci(Ramp.Rust, 3));
      fillEllipse(b, w / 2, h - pxs(3), pxs(16), pxs(4), ci(Ramp.Earth, 4));
      return b;
    }
    case ActorId.Monster: {
      const w = pxs(48), h = pxs(64);
      const b = newBitmap(w, h, w >> 1, h);
      const body = ci(Ramp.Forest, 2), hi = ci(Ramp.Forest, 3);
      fillEllipse(b, w * 0.5, h * 0.9, pxs(16), pxs(4), ci(Ramp.Earth, 4));   // 尘土
      fillRect(b, Math.round(w * 0.33), Math.round(h * 0.65), pxs(8), Math.round(h * 0.3), body); fillRect(b, Math.round(w * 0.55), Math.round(h * 0.68), pxs(8), Math.round(h * 0.27), body);
      fillEllipse(b, w * 0.5, h * 0.48, pxs(14), pxs(16), body); fillEllipse(b, w * 0.42, h * 0.45, pxs(6), pxs(9), hi);
      fillEllipse(b, w * 0.5, h * 0.2, pxs(9), pxs(8), body);
      fillRect(b, Math.round(w * 0.2), Math.round(h * 0.42), pxs(6), pxs(3), body); fillRect(b, Math.round(w * 0.72), Math.round(h * 0.4), pxs(6), pxs(3), body);
      fillPoly(b, [w * 0.62, h * 0.4, w * 0.72, h * 0.6, w * 0.78, h * 0.75, w * 0.66, h * 0.62], body);   // 尾
      setPx(b, Math.round(w * 0.46), Math.round(h * 0.18), ci(Ramp.Signal, 6)); setPx(b, Math.round(w * 0.55), Math.round(h * 0.18), ci(Ramp.Signal, 6));
      if (sp.scale !== 'S') for (let k = 0; k < 4; k++) setPx(b, Math.round(w * 0.42 + k * pxs(3)), Math.round(h * 0.27), ci(Ramp.Neutral, 7));
      return b;
    }
    case ActorId.Explosion: {
      const w = pxs(64), h = pxs(64);
      const b = newBitmap(w, h, w >> 1, h);
      for (let k = 0; k < 7; k++) { const f = 1 - k / 7; fillEllipse(b, w / 2 + (k % 2 ? pxs(1) : -pxs(1)), h * 0.55, w * 0.5 * f, h * 0.45 * f, IDX.FireBase + 1 + k); }
      const d = b.data; for (let i = 0; i < d.length; i++) { const v = d[i]!; if (v >= IDX.FireBase && v < IDX.FireBase + 8 && hashNoise(11, i % w, (i / w) | 0) > 0.75) d[i] = Math.max(IDX.FireBase, v - 1); }
      for (let k = 0; k < 10; k++) setPx(b, Math.floor(hashNoise(12, k, 1) * w), Math.floor(hashNoise(12, k, 2) * h * 0.6), IDX.SmokeBase + 2 + (k & 3));
      return b;
    }
    case ActorId.DeployPolice: case ActorId.DeployFire: case ActorId.DeployMilitary: {
      const s = pxs(24);
      const b = newBitmap(s, s, s >> 1, s);
      const c = s / 2;
      fillEllipse(b, c, c, c - 1, c - 1, ci(Ramp.Neutral, 7)); strokeEllipse(b, c, c, c - 1, c - 1, ci(Ramp.Neutral, 1));
      if (id === ActorId.DeployPolice) { fillPoly(b, [c - s * 0.25, c - s * 0.25, c + s * 0.25, c - s * 0.25, c + s * 0.25, c + s * 0.05, c, c + s * 0.3, c - s * 0.25, c + s * 0.05], ci(Ramp.Water, 5)); if (sp.scale !== 'S') setPx(b, Math.round(c - 1), Math.round(c - 1), ci(Ramp.Water, 7)); }
      else if (id === ActorId.DeployFire) { fillEllipse(b, c, c + s * 0.05, s * 0.28, s * 0.14, ci(Ramp.Signal, 5)); fillEllipse(b, c, c - s * 0.05, s * 0.2, s * 0.22, ci(Ramp.Signal, 5)); if (sp.scale !== 'S') fillRect(b, Math.round(c - 1), Math.round(c - s * 0.2), 2, Math.round(s * 0.25), ci(Ramp.Amber, 6)); }
      else { fillPoly(b, [c, c - s * 0.3, c + s * 0.08, c - s * 0.08, c + s * 0.3, c - s * 0.08, c + s * 0.12, c + s * 0.06, c + s * 0.2, c + s * 0.3, c, c + s * 0.15, c - s * 0.2, c + s * 0.3, c - s * 0.12, c + s * 0.06, c - s * 0.3, c - s * 0.08, c - s * 0.08, c - s * 0.08], ci(Ramp.Olive, 5)); }
      return b;
    }
    default: return null;
  }
}
