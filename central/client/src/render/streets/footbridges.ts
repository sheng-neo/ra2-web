/**
 * 行人天桥 / 高架行人通道（realism C10，R2 STREETLIFE S7 细化，参考照 09、R1-11、R1-14）：
 * footway / pedestrian 中标了 bridge 或 level 1–2 的路段（层数规则与 roads.ts 相同：level 1–2，或 bridge；每层 6 m）。
 * - 跨车行道的段：封闭玻璃廊——桥面 4.5 m 宽，围合 3.2 m 高；玻璃墙 1.5 m 一根窗框、室内冷白灯（玻璃带 0.5–0.8、
 *   顶部光管 1.0–1.4）、白色平顶檐口（0.6 m），桥底浅灰、两排筒灯（1.0–1.4）；跨车行道处不立桥墩。
 * - 其余高架通道：开敞有盖走廊（栏杆 1.1 m、细柱、平顶、棚底筒灯），约 1/4 无盖只有栏杆。
 * - 桥墩：只立在不在车行道上的地方，30 m 一根。
 * 合并成网格（life-material）：HIGH 一个网格；LOW 按 120 m 分块，只画相机 150 m 内的块（P1：LOW 也看得到天桥）。
 */
import { Group, Mesh, type Camera, type Object3D } from 'three';
import type { Road } from '@central/data';
import { simToThreeVec } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import { cleanRing } from '../../geom/ring';
import { elevationTiers } from '../roads';
import { drapeResample } from '../ribbon';
import { seedOf, unit } from './lamp-placement';
import { K_GLAZING, K_SOFFIT, LifeBuilder, type Face } from './furniture';
import { createLifeMaterial } from './life-material';
import { linearRGB, type V3 } from './prop-geometry';

const TIER_M = 6;
/** 中环至半山自动扶梯的路段名（OSM）。 */
const ESCALATOR = /Escalator/i;
const HALF_W = 2.25;
const DECK_T = 0.6;
const PARAPET_H = 1.1;
const ROOF_H = 3.2;
const ROOF_T = 0.6;
const PIER_EVERY_M = 30;
/** LOW 档分块大小（m）。 */
const CHUNK_M = 120;

/** 是否画成天桥：footway / pedestrian，且 level 1–2 或标了 bridge，不是隧道。 */
export function isFootbridge(r: Road): boolean {
  if (r.tunnel || (r.cls !== 'footway' && r.cls !== 'pedestrian')) return false;
  return elevationTiers(r) > 0 || r.bridge === true;
}

/** 天桥层数（标了 bridge 但没给 level 的算 1 层）。 */
export function footbridgeTiers(r: Road): number {
  return Math.max(elevationTiers(r), r.bridge ? 1 : 0);
}

/** 一段桥的样式（纯函数）：跨车行道 → 封闭玻璃廊；否则按种子 3/4 开敞有盖、1/4 无盖。 */
export function bridgeStyle(overRoad: boolean, seed: number): 'glazed' | 'canopy' | 'open' {
  if (overRoad) return 'glazed';
  const r = unit(seed, 9);
  return r < 0.35 ? 'glazed' : r < 0.8 ? 'canopy' : 'open';
}

/**
 * 天桥几何，按 CHUNK_M 分块（键 = 块坐标）。overRoad(x, y)：模拟 dm 处是否在地面车行道上（不立桥墩、用玻璃廊）。
 */
export function footbridgeChunks(
  roads: readonly Road[],
  ground: HeightFn,
  overRoad: (xDm: number, yDm: number) => boolean = () => false,
  /** 敏感区（模拟坐标 dm）：区内与贴着区边（4 m 内）的桥段一律不画（PLAN §1：敏感区只做背景）。 */
  inZone: (xDm: number, yDm: number) => boolean = () => false,
): Map<string, LifeBuilder> {
  const chunks = new Map<string, LifeBuilder>();
  const deck: Face = { alb: linearRGB('#5d5953') };
  const edge: Face = { alb: linearRGB('#8a8782') };
  const roofTop: Face = { alb: linearRGB('#7c7b78') };
  const pier: Face = { alb: linearRGB('#6f6a62') };
  const white: Face = { alb: linearRGB('#d8d6d2') };
  // 自动扶梯走道：米色地砖（照片 18 #c2a17b，夜里按反照率暗一些）
  const escDeck: Face = { alb: linearRGB('#8f7656') };
  for (const r of roads) {
    if (!isFootbridge(r)) continue;
    const tiers = footbridgeTiers(r);
    const pts = drapeResample(cleanRing(r.pts), ground, 300, 8);
    const n = pts.length >> 1;
    if (n < 2) continue;
    const seed = seedOf(r.id);
    let sinceP = PIER_EVERY_M;
    let along = 0;
    for (let i = 0; i + 1 < n; i++) {
      const ax = pts[i * 2]!;
      const ay = pts[i * 2 + 1]!;
      const bx = pts[i * 2 + 2]!;
      const by = pts[i * 2 + 3]!;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1) continue;
      // 敏感区：桥段中线两端、中点与两侧 4 m 处都不能在区内
      {
        const nxs = (-(by - ay) / len) * 40;
        const nys = ((bx - ax) / len) * 40;
        let hit = false;
        for (const f of [0, 0.5, 1])
          for (const k of [-1, 0, 1]) if (inZone(ax + (bx - ax) * f + nxs * k, ay + (by - ay) * f + nys * k)) hit = true;
        if (hit) continue;
      }
      const lenM = len / 10;
      const key = `${Math.floor((ax + bx) / 2 / 10 / CHUNK_M)},${Math.floor((ay + by) / 2 / 10 / CHUNK_M)}`;
      let b = chunks.get(key);
      if (!b) {
        b = new LifeBuilder();
        chunks.set(key, b);
      }
      // 左法线（dm 单位向量）× 半宽
      const lx = (-(by - ay) / len) * HALF_W * 10;
      const ly = ((bx - ax) / len) * HALF_W * 10;
      const ga = ground(ax, ay);
      const gb = ground(bx, by);
      const za = ga + tiers * TIER_M * 10;
      const zb = gb + tiers * TIER_M * 10;
      const T = (x: number, y: number, z: number, dz: number): V3 => simToThreeVec(x, y, z + dz * 10);
      const aL = (dz: number) => T(ax + lx, ay + ly, za, dz);
      const aR = (dz: number) => T(ax - lx, ay - ly, za, dz);
      const bL = (dz: number) => T(bx + lx, by + ly, zb, dz);
      const bR = (dz: number) => T(bx - lx, by - ly, zb, dz);
      // 离地高度（lift）：按本段两端地面平均
      const base = tiers * TIER_M;
      const L4 = (d: number) => [base + d, base + d, base + d, base + d];
      // 每 2 m 取样：段内任一处在车行道 / 电车路上方就算跨路
      let over = false;
      for (let k = 0, m = Math.max(1, Math.ceil(lenM / 2)); k <= m && !over; k++) over = overRoad(ax + ((bx - ax) * k) / m, ay + ((by - ay) * k) / m);
      const escalator = ESCALATOR.test(r.name?.en ?? ''); // [r3:stations] 中环至半山自动扶梯
      const style = escalator ? 'canopy' : bridgeStyle(over, seed + i * 31);
      const u0 = along;
      const u1 = along + lenM;
      // 桥面（朝上）、桥底（朝下，筒灯）
      b.quad(aR(0), bR(0), bL(0), aL(0), escalator ? escDeck : deck, undefined, L4(0));
      b.quad(aL(-DECK_T), bL(-DECK_T), bR(-DECK_T), aR(-DECK_T), { alb: linearRGB('#9d9a95'), kind: K_SOFFIT }, [
        [u0, HALF_W],
        [u1, HALF_W],
        [u1, -HALF_W],
        [u0, -HALF_W],
      ], L4(-DECK_T));
      const roofed = style !== 'open';
      const top = roofed ? ROOF_H + ROOF_T : PARAPET_H;
      // 两侧：从桥底到顶（玻璃廊）或到栏杆顶（开敞）；aux 1 = 开敞（栏杆以上透空）
      const sideFace: Face = { alb: linearRGB('#2a2e31'), kind: K_GLAZING, aux: escalator ? 2 : style === 'glazed' ? 0 : 1 };
      const sideTop = style === 'glazed' ? top : PARAPET_H;
      b.quad(bL(-DECK_T), aL(-DECK_T), aL(sideTop), bL(sideTop), sideFace, [
        [u1, -DECK_T],
        [u0, -DECK_T],
        [u0, sideTop],
        [u1, sideTop],
      ], [base - DECK_T, base - DECK_T, base + sideTop, base + sideTop]);
      b.quad(aR(-DECK_T), bR(-DECK_T), bR(sideTop), aR(sideTop), sideFace, [
        [u0, -DECK_T],
        [u1, -DECK_T],
        [u1, sideTop],
        [u0, sideTop],
      ], [base - DECK_T, base - DECK_T, base + sideTop, base + sideTop]);
      if (escalator) {
        // 拱形顶棚：两侧 2.6 m 起拱、屋脊 3.35 m（三折），两面都画（life-material 双面），uv = (沿线 m, 离桥面 m)
        const arch: [number, number][] = [
          [1, 2.6],
          [0.55, 3.15],
          [-0.55, 3.15],
          [-1, 2.6],
        ];
        const roof: Face = { alb: linearRGB('#b08a55'), kind: K_GLAZING, aux: 3 };
        const P = (end: 'a' | 'b', f: number, h: number): V3 => {
          const [x, y, z] = end === 'a' ? [ax, ay, za] : [bx, by, zb];
          return T(x + lx * f, y + ly * f, z, h);
        };
        for (let k = 0; k < 3; k++) {
          const [f0, h0] = arch[k]!;
          const [f1, h1] = arch[k + 1]!;
          const v0 = k === 1 ? 3.25 : h0;
          const v1 = k === 1 ? 3.25 : h1;
          b.quad(P('a', f0, h0), P('b', f0, h0), P('b', f1, h1), P('a', f1, h1), roof, [
            [u0, v0],
            [u1, v0],
            [u1, v1],
            [u0, v1],
          ], [base + h0, base + h0, base + h1, base + h1]);
        }
        // 拱肋立柱（每段两端，奶白）
        for (const side of [1, -1]) {
          const c = side > 0 ? aL(0) : aR(0);
          b.box([c[0], c[1] + PARAPET_H, c[2]], [0.08, 2.6 - PARAPET_H, 0.08], { alb: linearRGB('#d8d2c0') }, { bottom: null, top: null });
        }
      } else if (roofed) {
        b.quad(aR(top), bR(top), bL(top), aL(top), roofTop, undefined, L4(top));
        if (style === 'canopy') {
          // 檐口（白）、棚底（筒灯）、细柱
          b.quad(bL(ROOF_H), aL(ROOF_H), aL(top), bL(top), white, undefined, [base + ROOF_H, base + ROOF_H, base + top, base + top]);
          b.quad(aR(ROOF_H), bR(ROOF_H), bR(top), aR(top), white, undefined, [base + ROOF_H, base + ROOF_H, base + top, base + top]);
          b.quad(aL(ROOF_H), bL(ROOF_H), bR(ROOF_H), aR(ROOF_H), { alb: linearRGB('#b5b2ad'), kind: K_SOFFIT }, [
            [u0, HALF_W],
            [u1, HALF_W],
            [u1, -HALF_W],
            [u0, -HALF_W],
          ], L4(ROOF_H));
          for (const side of [1, -1]) {
            const c = side > 0 ? aL(0) : aR(0);
            const inset = simToThreeVec(-lx * 0.06 * side, -ly * 0.06 * side, 0);
            b.box([c[0] + inset[0], c[1], c[2] + inset[2]], [0.12, ROOF_H, 0.12], edge, { bottom: null, top: null });
          }
        }
      }
      // 桥墩：不在车行道上才立
      sinceP += lenM;
      if (sinceP >= PIER_EVERY_M && !overRoad(ax, ay)) {
        sinceP = 0;
        const c = simToThreeVec(ax, ay, ga);
        const h = tiers * TIER_M - DECK_T;
        const from = b.vertexCount;
        b.box([c[0], c[1] - 0.5, c[2]], [0.8, h + 0.5, 0.8], pier, { bottom: null, top: null });
        for (let k = from; k < b.vertexCount; k++) b.k[k * 3 + 2] = b.pos[k * 3 + 1]! - c[1];
      }
      along = u1;
    }
  }
  return chunks;
}

export interface Footbridges {
  objects: Object3D[];
  update(camera: Camera): void;
  triangles: number;
}

/**
 * 天桥网格。nearM = Infinity（HIGH）：合成一个网格；有限值（LOW）：分块，只显示相机 nearM 内的块。
 */
export function buildFootbridges(
  roads: readonly Road[],
  ground: HeightFn,
  overRoad?: (xDm: number, yDm: number) => boolean,
  nearM = Infinity,
  inZone?: (xDm: number, yDm: number) => boolean,
): Footbridges {
  const chunks = footbridgeChunks(roads, ground, overRoad, inZone);
  const material = createLifeMaterial(0.5);
  if (nearM === Infinity) {
    const all = new LifeBuilder();
    for (const b of chunks.values()) {
      const off = all.vertexCount;
      all.pos.push(...b.pos);
      all.nrm.push(...b.nrm);
      all.alb.push(...b.alb);
      all.em.push(...b.em);
      all.uv.push(...b.uv);
      all.k.push(...b.k);
      all.useAux.push(...b.useAux);
      for (const i of b.index) all.index.push(i + off);
    }
    if (all.vertexCount === 0) return { objects: [], update: () => {}, triangles: 0 };
    const mesh = new Mesh(all.geometry(), material);
    mesh.name = 'footbridges';
    mesh.matrixAutoUpdate = false;
    return { objects: [mesh], update: () => {}, triangles: all.index.length / 3 };
  }
  const group = new Group();
  group.name = 'footbridges';
  const parts: { mesh: Mesh; cx: number; cz: number }[] = [];
  let tris = 0;
  for (const [key, b] of chunks) {
    if (b.vertexCount === 0) continue;
    const [i, j] = key.split(',').map(Number) as [number, number];
    const c = simToThreeVec((i + 0.5) * CHUNK_M, (j + 0.5) * CHUNK_M, 0, 1);
    const mesh = new Mesh(b.geometry(), material);
    mesh.name = `footbridges-${key}`;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    group.add(mesh);
    parts.push({ mesh, cx: c[0], cz: c[2] });
    tris += b.index.length / 3;
  }
  const r = nearM + CHUNK_M * 0.71;
  return {
    objects: [group],
    triangles: tris,
    update(camera) {
      const p = camera.position;
      for (const q of parts) q.mesh.visible = Math.hypot(q.cx - p.x, q.cz - p.z) < r && p.y < 400;
    },
  };
}
