/**
 * 行人天桥 / 高架行人通道（realism C10）：footway / pedestrian 中标了 bridge 或 level 1–2 的路段
 * （层数规则与 roads.ts 相同：level 1–2，或 bridge；每层 6 m），合并成一个网格（一个 draw call）。
 * - 桥面 3.5 m 宽、0.6 m 厚，底面被街面反光照亮（钠灯下偏橙，参考照 12）；
 * - 两侧 1.1 m 深色玻璃 / 金属栏板（朝外一面）；
 * - 约 60 % 有顶棚（+3 m 薄板），棚底中线一条冷白光管（tubeCool 1.0，参考照 11、12）；
 * - 每 30 m 一根桥墩。三角形约 2 万（全图），一个 draw call。
 */
import { BufferAttribute, Mesh, type BufferGeometry } from 'three';
import type { Road } from '@central/data';
import { simToThree } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import { cleanRing } from '../../geom/ring';
import { elevationTiers } from '../roads';
import { drapeResample } from '../ribbon';
import { seedOf, unit } from './lamp-placement';
import { createPropMaterial } from './prop-material';
import { PropBuilder, linearRGB, type V3 } from './prop-geometry';
import { lightV3 } from './vehicles';

const TIER_M = 6;
const HALF_W = 1.75;
const DECK_T = 0.6;
const PARAPET_H = 1.1;
const ROOF_H = 3.0;
const PIER_EVERY_M = 30;

/** 是否画成天桥：footway / pedestrian，且 level 1–2 或标了 bridge，不是隧道。 */
export function isFootbridge(r: Road): boolean {
  if (r.tunnel || (r.cls !== 'footway' && r.cls !== 'pedestrian')) return false;
  return elevationTiers(r) > 0 || r.bridge === true;
}

/** 天桥层数（标了 bridge 但没给 level 的算 1 层）。 */
export function footbridgeTiers(r: Road): number {
  return Math.max(elevationTiers(r), r.bridge ? 1 : 0);
}

export function footbridgeGeometry(roads: readonly Road[], ground: HeightFn): { geometry: BufferGeometry; lift: number[] } | null {
  const b = new PropBuilder();
  const lift: number[] = [];
  const deck = { alb: linearRGB('#5d5953') };
  const soffit = { alb: linearRGB('#6b665e') };
  const rail = { alb: linearRGB('#22272b'), part: 3 };
  const roofTop = { alb: linearRGB('#3a3b3c') };
  const tube = { alb: [0.6, 0.6, 0.6] as V3, em: lightV3('tubeCool', 1.0) };
  const pier = { alb: linearRGB('#6f6a62') };
  const v = [0, 0, 0];
  const at = (x: number, y: number, z: number): V3 => {
    simToThree(x, y, z, v);
    return [v[0]!, v[1]!, v[2]!];
  };
  const mark = (from: number, h: (k: number) => number) => {
    const n = b.pos.length / 3;
    for (let k = from; k < n; k++) lift.push(h(k));
  };
  for (const r of roads) {
    if (!isFootbridge(r)) continue;
    const tiers = footbridgeTiers(r);
    const pts = drapeResample(cleanRing(r.pts), ground, 300, 8);
    const n = pts.length >> 1;
    if (n < 2) continue;
    const seed = seedOf(r.id);
    const roofed = unit(seed, 9) < 0.6;
    let sinceP = PIER_EVERY_M;
    for (let i = 0; i + 1 < n; i++) {
      const ax = pts[i * 2]!;
      const ay = pts[i * 2 + 1]!;
      const bx = pts[i * 2 + 2]!;
      const by = pts[i * 2 + 3]!;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1) continue;
      // 左法线（dm 单位向量）× 半宽
      const lx = (-(by - ay) / len) * HALF_W * 10;
      const ly = ((bx - ax) / len) * HALF_W * 10;
      const ga = ground(ax, ay);
      const gb = ground(bx, by);
      const za = ga + tiers * TIER_M * 10;
      const zb = gb + tiers * TIER_M * 10;
      const from = b.pos.length / 3;
      const T = (x: number, y: number, z: number, dz: number) => at(x, y, z + dz * 10);
      const aL = (dz: number) => T(ax + lx, ay + ly, za, dz);
      const aR = (dz: number) => T(ax - lx, ay - ly, za, dz);
      const bL = (dz: number) => T(bx + lx, by + ly, zb, dz);
      const bR = (dz: number) => T(bx - lx, by - ly, zb, dz);
      // 桥面（朝上）、底面（朝下）
      b.quad(aR(0), bR(0), bL(0), aL(0), deck);
      b.quad(aL(-DECK_T), bL(-DECK_T), bR(-DECK_T), aR(-DECK_T), soffit);
      // 两侧：桥面封边 + 栏板合成一块朝外的面（从桥底到栏板顶；桥内侧只有走在桥上才看得到）
      b.quad(bL(-DECK_T), aL(-DECK_T), aL(PARAPET_H), bL(PARAPET_H), rail);
      b.quad(aR(-DECK_T), bR(-DECK_T), bR(PARAPET_H), aR(PARAPET_H), rail);
      if (roofed) {
        b.quad(aR(ROOF_H), bR(ROOF_H), bL(ROOF_H), aL(ROOF_H), roofTop);
        b.quad(aL(ROOF_H - 0.1), bL(ROOF_H - 0.1), bR(ROOF_H - 0.1), aR(ROOF_H - 0.1), soffit);
        // 光管：棚底中线 0.3 m 宽
        const k = 0.3 / (2 * HALF_W);
        const mid = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - 0.02, p[2] + (q[2] - p[2]) * t];
        const A = aL(ROOF_H - 0.1);
        const B = aR(ROOF_H - 0.1);
        const C = bL(ROOF_H - 0.1);
        const D = bR(ROOF_H - 0.1);
        b.quad(mid(A, B, 0.5 - k), mid(C, D, 0.5 - k), mid(C, D, 0.5 + k), mid(A, B, 0.5 + k), tube);
      }
      mark(from, (k) => {
        const y = b.pos[k * 3 + 1]!;
        // 离地高度：按本段两端地面平均
        return y - ((ga + gb) / 2) * 0.1;
      });
      // 桥墩
      sinceP += len / 10;
      if (sinceP >= PIER_EVERY_M) {
        sinceP = 0;
        const from2 = b.pos.length / 3;
        const c = at(ax, ay, ga);
        const h = tiers * TIER_M - DECK_T;
        b.box([c[0], c[1] - 0.5, c[2]], [0.8, h + 0.5, 0.8], pier, { bottom: null, top: null });
        mark(from2, (k) => b.pos[k * 3 + 1]! - c[1]);
      }
    }
  }
  if (b.pos.length === 0) return null;
  return { geometry: b.build(), lift };
}

export function buildFootbridges(roads: readonly Road[], ground: HeightFn): Mesh | null {
  const built = footbridgeGeometry(roads, ground);
  if (!built) return null;
  built.geometry.setAttribute('aLift', new BufferAttribute(new Float32Array(built.lift), 1));
  const mesh = new Mesh(built.geometry, createPropMaterial({ warmth: 0.5, vertexLift: true }));
  mesh.name = 'footbridges';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

