/**
 * 港铁中环站出口（R3 STATIONS S-M，照片 16 = J3 夜景、17 = D1 日景）：在地政总署的出口结构（mtr-exits.ts 的楼宇）外面包一层
 * 0.08 m 的外壳，不改楼宇本身（规格 C-5）：
 * - 洞口一端：全宽 0.6 m 黑色招牌带（港铁标志红圆底白标、中環站、Central Station，背光；右端浅蓝出口字块如 J3），
 *   拉丝不锈钢门框与上檐、两支带红色环带的不锈钢柱；
 * - 洞口里是「室内贴图」梯井（life-material kind 13）：白色小瓷砖侧墙、白天花与圆筒灯、灰色触觉砖、花岗岩梯级、黄色级咀、
 *   红白扶手套，冷白自发光；洞口前行人路上一块 1.2 m 深的黄色触觉警示砖；
 * - 其余三面与顶：拉丝不锈钢（下）+ 深灰顶边。
 * 敏感区 3 m 内的结构不包（规格：72401c4078 保持素白；表里本来就没有它，这里再按距离检查一次）。
 */
import { K_ATLAS, K_REDBAND, K_STAINLESS, K_STAIRWELL, K_TACTILE, LifeBuilder, type Face, type FurnitureItem, type Template } from '../streets/furniture';
import { linearRGB, type V3 } from '../streets/prop-geometry';
import { stationsAtlas, type AtlasRect } from './atlas';
import { MTR_EXITS, type MtrExit } from './mtr-exits';
import { STATION_REACH, placeItem, type StationsInput } from './common';
import { clearOfZones } from './rules';

/** 招牌带高（m）、洞口高（m）。 */
export const MTR_BAND_M = 0.6;
export const MTR_OPENING_H_M = 2.5;

// 复审修正：冷中性的拉丝不锈钢（照片 16 实测 #7e7f77、Y 0.23 是受光后的；反照率取 #9a9a98），不再是偏暖的灰褐
const STEEL = linearRGB('#9a9a98');
const BLACK = linearRGB('#070807');

/** 竖直四边形（朝 +x，局部 x = x0），z0 < z1，uv 以米计（u 沿看的人的右手 = −z）。 */
function frontQuad(b: LifeBuilder, x0: number, y0: number, y1: number, z0: number, z1: number, f: Face, uv?: [number, number][]): void {
  b.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], f, uv ?? [
    [0, y0],
    [z1 - z0, y0],
    [z1 - z0, y1],
    [0, y1],
  ]);
}

/** 方柱（uv.y = 离地米，给红色环带用）。 */
function post(b: LifeBuilder, cx: number, cz: number, w: number, y0: number, y1: number, f: Face): void {
  const h = w / 2;
  const uv: [number, number][] = [
    [0, y0],
    [w, y0],
    [w, y1],
    [0, y1],
  ];
  b.quad([cx + h, y0, cz + h], [cx + h, y0, cz - h], [cx + h, y1, cz - h], [cx + h, y1, cz + h], f, uv);
  b.quad([cx - h, y0, cz - h], [cx - h, y0, cz + h], [cx - h, y1, cz + h], [cx - h, y1, cz - h], f, uv);
  b.quad([cx - h, y0, cz + h], [cx + h, y0, cz + h], [cx + h, y1, cz + h], [cx - h, y1, cz + h], f, uv);
  b.quad([cx + h, y0, cz - h], [cx - h, y0, cz - h], [cx - h, y1, cz - h], [cx + h, y1, cz - h], f, uv);
}

/**
 * 一个出口的外壳模板。局部：原点 = 洞口所在边的中点（地面），+x = 洞口朝外，结构向 −x 延伸 depth，z ∈ [−width/2, width/2]
 * （看洞口的人右手 = −z）；top = 结构顶离地面（m）。
 */
export function mtrExitTemplate(width: number, depth: number, top: number, band: AtlasRect | null, tile: AtlasRect | null): Template {
  const b = new LifeBuilder();
  const P = 0.08;
  const half = width / 2 + P;
  const xf = P;
  const ho = Math.min(MTR_OPENING_H_M, top - MTR_BAND_M - 0.15);
  const wo = Math.min(Math.max(width - 0.9, 1.6), 2.6);
  const yb = top - MTR_BAND_M;
  const steel: Face = { alb: STEEL, kind: K_STAINLESS };
  // 正面：两侧门框、洞口上檐（拉丝不锈钢）
  frontQuad(b, xf, 0, ho, -half, -wo / 2, steel);
  frontQuad(b, xf, 0, ho, wo / 2, half, steel);
  frontQuad(b, xf, ho, yb, -half, half, steel);
  // 洞口：室内贴图梯井（aux = 洞口宽）
  b.quad([xf - 0.005, 0, wo / 2], [xf - 0.005, 0, -wo / 2], [xf - 0.005, ho, -wo / 2], [xf - 0.005, ho, wo / 2], { alb: [0, 0, 0], kind: K_STAIRWELL, aux: wo }, [
    [wo, 0],
    [0, 0],
    [0, ho],
    [wo, ho],
  ]);
  // 洞口两边的不锈钢柱（复审修正：细柱 0.09 m，上部几道 4–5 cm 的细红环，不再是 0.25 m 一段的「理发店柱」）
  for (const s of [-1, 1]) post(b, xf + 0.06, s * (wo / 2 + 0.06), 0.09, 0, ho, { alb: STEEL, kind: K_REDBAND, em: [0.02, 0.02, 0.022] });
  // 洞口内侧的门框进深（不锈钢）
  for (const s of [-1, 1]) {
    const z = s * (wo / 2);
    const f: Face = { alb: STEEL, kind: K_STAINLESS, em: [0.05, 0.055, 0.058] };
    if (s > 0) b.quad([xf, 0, z], [xf - 0.4, 0, z], [xf - 0.4, ho, z], [xf, ho, z], f);
    else b.quad([xf - 0.4, 0, z], [xf, 0, z], [xf, ho, z], [xf - 0.4, ho, z], f);
  }
  // 招牌带：黑色盒（凸出 0.15 m）+ 字幅（背光）+ 出口字块
  b.box([xf + 0.02, yb, 0], [0.3, MTR_BAND_M + 0.02, 2 * half + 0.04], { alb: BLACK }, { bottom: { alb: BLACK } });
  const xs = xf + 0.175;
  const bh = MTR_BAND_M - 0.06;
  const bw = bh * (FIXED_BAND_ASPECT);
  const zL = half - 0.12;
  const bandAvg: V3 = [0.06, 0.02, 0.02];
  if (band) frontQuad(b, xs, yb + 0.03, yb + 0.03 + bh, zL - bw, zL, { alb: bandAvg, em: [1.8, 1.8, 1.8], kind: K_ATLAS }, uvOf(band));
  const ts = 0.4;
  const zR = -half + 0.12;
  if (tile) frontQuad(b, xs, yb + 0.1, yb + 0.1 + ts, zR, zR + ts, { alb: linearRGB('#93b1cc'), em: [1.0, 1.0, 1.0], kind: K_ATLAS }, uvOf(tile));
  // 招牌带转过两侧的角，往后包 2.4 m（复审修正：3/4 看过去不再是一个素箱子）
  for (const sz of [-1, 1]) {
    const zz = sz * (half + 0.025);
    const bandF: Face = { alb: BLACK };
    if (sz > 0) b.quad([xf + 0.02, yb, zz], [xf - 2.4, yb, zz], [xf - 2.4, top + 0.02, zz], [xf + 0.02, top + 0.02, zz], bandF);
    else b.quad([xf - 2.4, yb, zz], [xf + 0.02, yb, zz], [xf + 0.02, top + 0.02, zz], [xf - 2.4, top + 0.02, zz], bandF);
  }
  // 侧面与背面：拉丝不锈钢板（1.25 m 一道板缝，见 life-material kind 14）+ 深灰顶边；顶盖
  const xb = -depth - P;
  const sideTop = yb;
  const grey: Face = { alb: linearRGB('#3a3c3e') };
  // 左侧（+z，外法线 +z）：从外面看左→右 = +x→−x；下沿伸到地面以下 0.6 m（地面往后低下去时不露出楼宇底）
  const yl = -0.6;
  b.quad([xf, yl, half], [xb, yl, half], [xb, sideTop, half], [xf, sideTop, half], steel, [
    [0, 0],
    [depth, 0],
    [depth, sideTop],
    [0, sideTop],
  ]);
  b.quad([xb, yl, -half], [xf, yl, -half], [xf, sideTop, -half], [xb, sideTop, -half], steel, [
    [0, 0],
    [depth, 0],
    [depth, sideTop],
    [0, sideTop],
  ]);
  b.quad([xf - 0.1, sideTop, half], [xb, sideTop, half], [xb, top + 0.05, half], [xf - 0.1, top + 0.05, half], grey);
  b.quad([xb, sideTop, -half], [xf - 0.1, sideTop, -half], [xf - 0.1, top + 0.05, -half], [xb, top + 0.05, -half], grey);
  b.quad([xb, yl, half], [xb, yl, -half], [xb, top + 0.05, -half], [xb, top + 0.05, half], steel, [
    [0, 0],
    [width, 0],
    [width, top],
    [0, top],
  ]);
  b.quad([xb, top + 0.05, half], [xf - 0.1, top + 0.05, half], [xf - 0.1, top + 0.05, -half], [xb, top + 0.05, -half], { alb: linearRGB('#2c2e30') });
  // 洞口前的黄色触觉警示砖（1.2 m 深、洞口宽），带一点梯井溢出的冷光
  const yp = 0.015;
  b.quad([xf + 0.25, yp, wo / 2], [xf + 1.45, yp, wo / 2], [xf + 1.45, yp, -wo / 2], [xf + 0.25, yp, -wo / 2], { alb: linearRGB('#d0b97f'), kind: K_TACTILE, em: [0.06, 0.05, 0.025] }, [
    [0, 0],
    [1.2, 0],
    [1.2, wo],
    [0, wo],
  ]);
  return b.template();
}

/** 字幅格子的宽高比（atlas FIXED_SIZES.mtrBand）。 */
const FIXED_BAND_ASPECT = 320 / 96;

function uvOf(r: AtlasRect): [number, number][] {
  return [
    [r.u0, r.v0],
    [r.u1, r.v0],
    [r.u1, r.v1],
    [r.u0, r.v1],
  ];
}

/** 港铁出口的模板与实例。 */
export function mtrFurniture(input: StationsInput, templateBase: number): { templates: Template[]; items: FurnitureItem[]; count: number; exits: MtrExit[] } {
  const atlas = stationsAtlas();
  const band = atlas.rect('mtr-band');
  const templates: Template[] = [];
  const items: FurnitureItem[] = [];
  const exits: MtrExit[] = [];
  const tier = input.high ? 0 : 1;
  const ids = new Set(input.buildings.map((b) => b.id));
  for (const e of MTR_EXITS) {
    // 只包数据里真有的出口结构（?fixture=1 的小城没有这些楼）
    if (!ids.has(e.id)) continue;
    const mx = (e.left[0] + e.right[0]) / 2;
    const my = (e.left[1] + e.right[1]) / 2;
    // 整个结构（洞口与背面）离敏感区 ≥ 3 m
    const bx = mx - e.normal[0] * e.depth;
    const by = my - e.normal[1] * e.depth;
    if (!clearOfZones(input.zones, mx, my) || !clearOfZones(input.zones, bx, by) || !clearOfZones(input.zones, e.left[0], e.left[1]) || !clearOfZones(input.zones, e.right[0], e.right[1])) continue;
    const ground = input.surface((mx + e.normal[0] * 1.5) * 10, (my + e.normal[1] * 1.5) * 10) / 10;
    const top = e.base + e.height - ground + 0.06;
    const t = templateBase + templates.length;
    // 复审修正：出口字母只画有照片佐证的（verified）；候选出口只画港铁标志与站名带，不写可能错的字母
    templates.push(mtrExitTemplate(e.width, e.depth, top, band, e.verified ? atlas.exitTile(e.code) : null));
    placeItem(items, t, mx, my, ground, e.normal[0], e.normal[1], STATION_REACH.mtr[tier]);
    exits.push(e);
  }
  return { templates, items, count: exits.length, exits };
}
