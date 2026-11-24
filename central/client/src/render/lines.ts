/**
 * 线框图层：电车路轨（每条轨道两根钢轨，轨距 1067 mm）与敏感区边界（暗色虚线，只示意、不可交互）。
 */
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
} from 'three';
import type { FlatXY, Rail, SensitiveZone } from '@central/data';
import { simToThree } from '../coords';
import type { HeightFn } from '../data/terrain';
import { cleanRing } from '../geom/ring';
import { drapeResample } from './ribbon';

const HALF_GAUGE_DM = 5.35;
const RAIL_LIFT_DM = 2;
const ZONE_LIFT_DM = 6;

function lineGeometry(pos: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeBoundingSphere();
  return g;
}

/** 折线按左右偏移 off（dm）输出线段端点（three 坐标）。 */
function offsetSegments(pts: FlatXY, off: number, z: (x: number, y: number) => number, out: number[]): void {
  const n = pts.length >> 1;
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, n - 1);
    const dx = pts[b * 2]! - pts[a * 2]!;
    const dy = pts[b * 2 + 1]! - pts[a * 2 + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    const x = pts[i * 2]! - (dy / l) * off;
    const y = pts[i * 2 + 1]! + (dx / l) * off;
    const v = [0, 0, 0];
    simToThree(x, y, z(x, y), v);
    p.push(...v);
  }
  for (let i = 0; i + 1 < n; i++) out.push(...p.slice(i * 3, i * 3 + 6));
}

export function buildRails(rails: readonly Rail[], ground: HeightFn): LineSegments | null {
  const pos: number[] = [];
  const z = (x: number, y: number) => ground(x, y) + RAIL_LIFT_DM;
  for (const r of rails) {
    const pts = drapeResample(cleanRing(r.pts), ground, 160);
    if (pts.length < 4) continue;
    offsetSegments(pts, HALF_GAUGE_DM, z, pos);
    offsetSegments(pts, -HALF_GAUGE_DM, z, pos);
  }
  if (pos.length === 0) return null;
  const lines = new LineSegments(lineGeometry(pos), new LineBasicMaterial({ color: 0x8c8a99, fog: true }));
  lines.name = 'rails';
  return lines;
}

export function buildZoneOutlines(zones: readonly SensitiveZone[], ground: HeightFn): LineSegments | null {
  const pos: number[] = [];
  const z = (x: number, y: number) => ground(x, y) + ZONE_LIFT_DM;
  for (const zone of zones) {
    for (const ring of [zone.area.outer, ...(zone.area.holes ?? [])]) {
      const r = cleanRing(ring);
      if (r.length < 6) continue;
      const closed = drapeResample([...r, r[0]!, r[1]!], ground, 80);
      offsetSegments(closed, 0, z, pos);
    }
  }
  if (pos.length === 0) return null;
  const lines = new LineSegments(
    lineGeometry(pos),
    new LineDashedMaterial({ color: 0x6f7590, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.55, depthWrite: false, fog: true }),
  );
  lines.computeLineDistances();
  lines.name = 'sensitive-zones';
  return lines;
}
