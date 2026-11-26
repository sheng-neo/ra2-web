/**
 * 用仓库里的真实产物（public/city/central.json + terrain.bin）检查渲染几何的不变量：
 * 楼脚不悬空、共面墙只画一次、路面高架不离谱。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { flatGround, reliefGrid, reliefHeight } from '../data/terrain';
import { prepareBuildings } from './buildings';
import { buildRoadChunks, elevationTiers } from './roads';
import { visibleSpans } from './walls';

const read = (name: string) => readFileSync(new URL(`../../public/city/${name}`, import.meta.url));
const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
const ground = reliefHeight(reliefGrid(decodeTerrain(read('terrain.bin'))));

interface Quad {
  body: number;
  x0: number;
  y0: number;
  ux: number;
  uy: number;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

/** 实际要画的全部墙面块；withCuts = false 时忽略去重（用来证明下面的检测确实有效）。 */
function wallQuads(withCuts: boolean): Quad[] {
  const { items, cutsOf } = prepareBuildings(city.buildings, ground);
  const out: Quad[] = [];
  // 每栋楼的墙体：没有分层时一块，有分层体块（LOD2）时逐块；body 记楼的序号（同一栋楼的块之间高程不重叠）
  const walls = items.flatMap((p, body) =>
    (p.parts ?? [{ body: p.body, rings: p.rings, bottom: p.bottom, top: p.top }]).map((w) => ({ ...w, building: body })),
  );
  walls.forEach(({ body: wallBody, building: body, rings, bottom, top }) =>
    rings.forEach((r, ring) => {
      const p = { bottom, top };
      const n = r.length >> 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = r[i * 2]!;
        const y0 = r[i * 2 + 1]!;
        const len = Math.hypot(r[j * 2]! - x0, r[j * 2 + 1]! - y0);
        if (len < 1e-6) continue;
        const ux = (r[j * 2]! - x0) / len;
        const uy = (r[j * 2 + 1]! - y0) / len;
        const cuts = withCuts ? cutsOf(wallBody, ring, i) : undefined;
        const spans = cuts ? visibleSpans(len, p.bottom, p.top, cuts) : [{ s0: 0, s1: len, z0: p.bottom, z1: p.top }];
        for (const s of spans) out.push({ body, x0: x0 + ux * s.s0, y0: y0 + uy * s.s0, ux, uy, s0: 0, s1: s.s1 - s.s0, z0: s.z0, z1: s.z1 });
      }
    }),
  );
  return out;
}

/** 朝向相同（≤ 0.5°）、相距 ≤ 2 cm、沿边与竖向都重叠 > 0.1 m 的两块墙（不同楼）——深度缓冲分不清前后。 */
function coplanarPairs(quads: readonly Quad[]): number {
  const CELL = 400;
  const grid = new Map<string, number[]>();
  quads.forEach((q, k) => {
    const xs = [q.x0, q.x0 + q.ux * q.s1];
    const ys = [q.y0, q.y0 + q.uy * q.s1];
    for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++) {
      for (let gy = Math.floor(Math.min(...ys) / CELL); gy <= Math.floor(Math.max(...ys) / CELL); gy++) {
        const key = `${gx},${gy}`;
        (grid.get(key) ?? grid.set(key, []).get(key)!).push(k);
      }
    }
  });
  const cos = Math.cos((0.5 * Math.PI) / 180);
  const found = new Set<number>();
  for (const list of grid.values()) {
    for (const a of list) {
      const A = quads[a]!;
      for (const b of list) {
        const B = quads[b]!;
        if (b <= a || A.body === B.body || A.ux * B.ux + A.uy * B.uy < cos) continue;
        const bx1 = B.x0 + B.ux * B.s1;
        const by1 = B.y0 + B.uy * B.s1;
        const d0 = (B.x0 - A.x0) * A.uy - (B.y0 - A.y0) * A.ux;
        const d1 = (bx1 - A.x0) * A.uy - (by1 - A.y0) * A.ux;
        if (Math.abs(d0) > 0.2 || Math.abs(d1) > 0.2) continue;
        const t0 = (B.x0 - A.x0) * A.ux + (B.y0 - A.y0) * A.uy;
        const t1 = (bx1 - A.x0) * A.ux + (by1 - A.y0) * A.uy;
        const along = Math.min(A.s1, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1));
        const up = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0);
        if (along > 1 && up > 1) found.add(a * quads.length + b);
      }
    }
  }
  return found.size;
}

describe('真实数据：建筑墙面', () => {
  it('墙底低于整圈墙脚的地面（沿每条边每 0.25 m 检查，不只看顶点）', () => {
    const { items } = prepareBuildings(city.buildings, ground);
    let worst = -Infinity;
    for (const p of items) {
      for (const r of p.rings) {
        const n = r.length >> 1;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const steps = Math.ceil(Math.hypot(r[j * 2]! - r[i * 2]!, r[j * 2 + 1]! - r[i * 2 + 1]!) / 2.5);
          for (let k = 0; k <= steps; k++) {
            const x = r[i * 2]! + ((r[j * 2]! - r[i * 2]!) * k) / Math.max(steps, 1);
            const y = r[i * 2 + 1]! + ((r[j * 2 + 1]! - r[i * 2 + 1]!) * k) / Math.max(steps, 1);
            worst = Math.max(worst, p.bottom - ground(x, y));
          }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(0);
  });

  it('不同楼的墙不共面重叠（塔楼与裙楼共用外边处只画一面）', () => {
    // 不去重时这样的墙有几百对（塔楼压在裙楼上、共用外边），去重后一对都没有
    expect(coplanarPairs(wallQuads(false))).toBeGreaterThan(300);
    expect(coplanarPairs(wallQuads(true))).toBe(0);
  });
});

describe('真实数据：道路高架', () => {
  it('Overture level 只当叠放次序：裙楼顶的楼层号（17、18）不抬高，桥面最多离地 2 层', () => {
    const podiumDecks = city.roads.filter((r) => (r.level ?? 0) >= 3 && !r.bridge);
    expect(podiumDecks.length).toBeGreaterThan(0);
    for (const r of podiumDecks) expect(elevationTiers(r)).toBe(0);
    let maxY = 0;
    for (const c of buildRoadChunks(city.roads, flatGround).values()) {
      const pos = c.arrays.data[0]!;
      for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i]!);
    }
    // 2 层 × 6 m + 离地 0.1 m + 等级抬升 ≤ 0.14 m
    expect(maxY).toBeLessThan(12.5);
  });
});
