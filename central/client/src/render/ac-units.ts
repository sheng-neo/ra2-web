/**
 * 窗口冷气机（R2 修复轮，规格 S9）：住宅、唐楼临街面最低几层（铺面以上 3–6 层）挂的窗口式冷气机箱，
 * 0.8 × 0.6 × 0.3 m，浅灰 / 米白，离墙 15 cm。位置是纯函数（逐楼哈希，确定性）；
 * 渲染用一个实例网格，只画相机 120 m 内的（HIGH 档；LOW 档不画），1 个 draw call。
 */
import { Vector3, type BufferGeometry, type Camera } from 'three';
import { simToThree } from '../coords';
import { NearInstances, placeMatrix, type NearItem } from './streets/tram/infra';
import { PropBuilder, linearRGB, type V3 } from './streets/prop-geometry';
import type { FrontageSpan } from './signs/placement';
import { INT_OFFSET, hash3 } from './windows';

/** 一台冷气机：中心（模拟坐标米 / mPD）与朝外方向（墙面法线）。 */
export interface AcUnit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  /** 0–1，定颜色深浅。 */
  tone: number;
}

/** 铺面顶（m，与 building.ts 一致）以上从第几层开始挂、层高。 */
const FIRST_M = 5.2;
const STOREY_M = 2.9;
/** 沿墙每格宽（m）。 */
const PITCH_M = 2.4;

/** 一段临街墙面上的冷气机（只给住宅 / 唐楼）。 */
export function planAcUnits(span: FrontageSpan): AcUnit[] {
  if (span.typology !== 'residential' && span.typology !== 'tenement') return [];
  const dx = span.x1 - span.x0;
  const dy = span.y1 - span.y0;
  const len = Math.hypot(dx, dy);
  if (len < 3) return [];
  const ex = dx / len;
  const ey = dy / len;
  const key = span.key;
  // 3–6 层，不超过楼高
  const floors = Math.min(3 + Math.floor(hash3(key, 3, 171) * 4), Math.floor((span.topM - span.groundM - FIRST_M - 2) / STOREY_M));
  const out: AcUnit[] = [];
  const first = Math.ceil((span.u0 + 0.8) / PITCH_M);
  const last = Math.floor((span.u0 + len - 0.8) / PITCH_M);
  for (let f = 0; f < floors; f++) {
    for (let i = first; i <= last; i++) {
      const h = (salt: number) => hash3(key, i * 31 + f + INT_OFFSET, 172 + salt);
      // 约一半的窗口有冷气机；唐楼多一些
      if (h(0) > (span.typology === 'tenement' ? 0.6 : 0.45)) continue;
      const s = i * PITCH_M - span.u0 + (h(1) - 0.5) * 0.6;
      const z = span.groundM + FIRST_M + f * STOREY_M + 0.35 + 0.2 * h(2);
      out.push({ x: span.x0 + ex * s + span.nx * 0.3, y: span.y0 + ey * s + span.ny * 0.3, z, nx: span.nx, ny: span.ny, tone: h(3) });
    }
  }
  return out;
}

/** 冷气机箱几何（局部：x = 朝外，y 向上，z 沿墙）：机箱 + 正面格栅暗面 + 底下一根托架。约 12 个三角形。 */
function acGeometry(): BufferGeometry {
  const b = new PropBuilder();
  b.box([0, 0, 0], [0.3, 0.6, 0.8], { part: 1 }, { bottom: { alb: [0.05, 0.05, 0.05] }, px: { alb: [0.16, 0.16, 0.155] } });
  b.box([-0.02, -0.06, 0], [0.34, 0.05, 0.06], { alb: [0.04, 0.04, 0.04] }, { bottom: null, top: null, pz: null, nz: null });
  return b.build();
}

const TONES: readonly V3[] = [linearRGB('#c9c9c2'), linearRGB('#b5b2a8'), linearRGB('#d8d6cc'), linearRGB('#9ea3a6')];

/** 冷气机实例网格（只画相机 range 米内的）。 */
export function buildAcUnits(units: readonly AcUnit[], range = 120): { mesh: NearInstances['mesh']; update(camera: Camera): void } | null {
  if (!units.length) return null;
  const v = [0, 0, 0];
  const d = [0, 0, 0];
  const items: NearItem[] = units.map((u) => {
    // 模拟米坐标 → three（coords.ts）
    simToThree(u.x, u.y, u.z, v, 0, 1);
    simToThree(u.nx, u.ny, 0, d, 0, 1);
    const tone = TONES[Math.floor(u.tone * TONES.length) % TONES.length]!;
    return { pos: new Vector3(v[0], v[1], v[2]), matrix: placeMatrix([v[0]!, v[1]!, v[2]!], d[0]!, d[2]!), body: tone, band: tone };
  });
  const near = new NearInstances(acGeometry(), items, range, 'ac-units', true);
  return { mesh: near.mesh, update: (camera) => near.update(camera) };
}
