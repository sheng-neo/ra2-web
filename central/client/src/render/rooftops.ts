/**
 * 屋顶机房、电梯机房、住宅水箱、天线桅杆（规格 B10）。并进建筑块的同一几何（同一材质，模式 Plant），不加 draw call。
 * 只给楼高 ≥ 20 m 的楼；敏感区不加（只做素体）。盒子按楼轮廓最长边的方向摆，四角都要落在轮廓内（不在洞里），
 * 放不下就缩小，三次不行就不放。全部确定性（逐栋哈希）。
 */
import type { FlatXY } from '@central/data';
import { pointInFlat } from '../geom/ring';
import { extrudePrism } from './extrude';
import { FacadeMode, hash01, styleCode } from './facade';
import type { MeshArrays } from './mesh-arrays';

/** addRooftops 需要的楼参数（BuildingPlan 的子集）。 */
export interface RooftopHost {
  p: { b: { id: string; style: number }; ring: { outer: FlatXY; holes: FlatXY[] }; cx: number; cy: number; base: number; top: number };
  typology: string;
  rnd: number;
  bldg: readonly [number, number, number, number];
}

/** 一个屋顶盒子：中心（dm）、沿主轴 / 垂直方向半长（dm）、高（m）。 */
export interface RoofBox {
  cx: number;
  cy: number;
  hu: number;
  hv: number;
  heightM: number;
}

/** 轮廓的主方向（最长边）与在该方向上的半长（dm）。 */
function frame(outer: FlatXY, cx: number, cy: number): { ux: number; uy: number; eu: number; ev: number } {
  const n = outer.length >> 1;
  let best = 0;
  let ux = 1;
  let uy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = outer[j * 2]! - outer[i * 2]!;
    const dy = outer[j * 2 + 1]! - outer[i * 2 + 1]!;
    const l = Math.hypot(dx, dy);
    if (l > best) {
      best = l;
      ux = dx / l;
      uy = dy / l;
    }
  }
  let eu = 0;
  let ev = 0;
  for (let i = 0; i < n; i++) {
    const dx = outer[i * 2]! - cx;
    const dy = outer[i * 2 + 1]! - cy;
    eu = Math.max(eu, Math.abs(dx * ux + dy * uy));
    ev = Math.max(ev, Math.abs(-dx * uy + dy * ux));
  }
  return { ux, uy, eu, ev };
}

function boxRing(b: RoofBox, ux: number, uy: number): FlatXY {
  const out: FlatXY = [];
  for (const [i, j] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    out.push(Math.round(b.cx + ux * b.hu * i - uy * b.hv * j), Math.round(b.cy + uy * b.hu * i + ux * b.hv * j));
  }
  return out;
}

function fits(ring: FlatXY, outer: FlatXY, holes: readonly FlatXY[]): boolean {
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i]!;
    const y = ring[i + 1]!;
    if (!pointInFlat(outer, x, y) || holes.some((h) => pointInFlat(h, x, y))) return false;
  }
  return true;
}

/** 规划一栋楼的屋顶盒子（纯函数，测试用）：返回放得下的盒子与主方向。 */
export function planRooftop(host: RooftopHost): { boxes: RoofBox[]; ux: number; uy: number; rings: FlatXY[] } {
  const { p } = host;
  const heightM = (p.top - p.base) / 10;
  if (heightM < 20 || host.typology === 'sensitive') return { boxes: [], ux: 1, uy: 0, rings: [] };
  const { ux, uy, eu, ev } = frame(p.ring.outer, p.cx, p.cy);
  if (eu < 40 || ev < 30) return { boxes: [], ux, uy, rings: [] };
  const h = (k: string) => hash01(`${p.b.id}:roof:${k}`);
  const want: RoofBox[] = [];
  // 1. 核心机房（电梯机房 + 楼梯间）：靠近质心，占屋顶约 10–20 %
  want.push({ cx: p.cx, cy: p.cy, hu: eu * (0.3 + 0.15 * h('a')), hv: ev * (0.3 + 0.15 * h('b')), heightM: 3 + 1.5 * h('c') });
  // 2. 一端的机电盒子（冷却塔等）
  if (h('d') < 0.75) {
    const side = h('e') < 0.5 ? -1 : 1;
    const off = eu * 0.62 * side;
    want.push({ cx: p.cx + ux * off, cy: p.cy + uy * off, hu: eu * 0.18, hv: ev * (0.35 + 0.2 * h('f')), heightM: 2 + 1.5 * h('g') });
  }
  // 3. 住宅 / 唐楼：水箱（压在核心机房上方或旁边）
  if ((host.typology === 'residential' || host.typology === 'tenement') && h('i') < 0.8) {
    const s = Math.min(25 + 15 * h('j'), eu * 0.3, ev * 0.4);
    const off = eu * 0.35 * (h('k') < 0.5 ? -1 : 1);
    want.push({ cx: p.cx + ux * off, cy: p.cy + uy * off, hu: s, hv: s, heightM: 2 + h('l') });
  }
  // 4. 桅杆：60 m 以上的楼三成有
  if (heightM > 60 && h('m') < 0.3) want.push({ cx: p.cx - ux * eu * 0.2, cy: p.cy - uy * eu * 0.2, hu: 2, hv: 2, heightM: 4 + 5 * h('n') });
  const boxes: RoofBox[] = [];
  const rings: FlatXY[] = [];
  for (const w of want) {
    let b = w;
    for (let tries = 0; tries < 3; tries++) {
      const r = boxRing(b, ux, uy);
      if (fits(r, p.ring.outer, p.ring.holes)) {
        boxes.push(b);
        rings.push(r);
        break;
      }
      b = { ...b, hu: b.hu * 0.7, hv: b.hv * 0.7 };
    }
  }
  return { boxes, ux, uy, rings };
}

/** 把屋顶盒子写进 m（立面模式 Plant，aBldg 沿用所在楼的）。 */
export function addRooftops(m: MeshArrays, host: RooftopHost): void {
  const { boxes, rings } = planRooftop(host);
  const roof = host.p.top;
  boxes.forEach((b, i) => {
    extrudePrism(m, {
      outer: rings[i]!,
      holes: [],
      bottom: roof - 2,
      base: roof,
      top: roof + Math.round(b.heightM * 10),
      style: styleCode(host.p.b.style, FacadeMode.Plant, host.rnd),
      uOffset: host.rnd * 31 + i * 7,
      bldg: host.bldg,
    });
  });
}
