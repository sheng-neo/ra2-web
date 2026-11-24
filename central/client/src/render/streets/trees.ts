/**
 * 树（realism C11）：props.trees 的行道树 + 路旁 60 m 内树冠坡地上的树丛；只画相机 500 m（HIGH）/ 250 m（LOW）内，
 * 近（150 m 内，约 88 个三角形，4 团扰动二十面体）远（24 个三角形）两级，各一个 InstancedMesh，相机移动 40 / 60 m 时重排。
 * 深橄榄色、团块明暗；近路时树冠底面被街面反光照成暖色（prop-material 的 cityAmbient 按离地高度给街面反光）。
 */
import type { FlatXY, TerrainGrid } from '@central/data';
import { simToThree } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import type { GroundMask } from './ground-mask';
import { hash32 } from './lamp-placement';
import { NearProps, type NearItem } from './lamps';
import { createPropMaterial } from './prop-material';
import { PropBuilder, type V3 } from './prop-geometry';

const u = (k: number, salt: number) => hash32(k * 2654435761 + salt * 97) / 4294967296;

/** 树的位置（three 坐标）：行道树 + 坡地树丛（纯函数，确定性）。 */
export function treeItems(
  props: FlatXY,
  ground: HeightFn,
  relief: TerrainGrid | null,
  mask: Pick<GroundMask, 'sample'> | null,
  hillLimit = 3000,
  /** 看得见的地面（dm）：路面上取水平路面，否则取路廊压低后的地形（streets/surface.ts）；缺省用 ground。 */
  surface: HeightFn = ground,
  /** 这里不种树（敏感区、楼内）。 */
  skip: (x: number, y: number) => boolean = () => false,
): NearItem[] {
  const out: NearItem[] = [];
  const v = [0, 0, 0];
  const push = (x: number, y: number, k: number) => {
    if (skip(x, y)) return;
    // 树干埋进地面 0.3 m（树冠底下看不到缝），不再按原始地形 − 2 m（路廊压低处会悬空）
    simToThree(x, y, surface(x, y) - 3, v);
    const a = u(k, 1) * Math.PI * 2;
    out.push({ p: [v[0]!, v[1]!, v[2]!], dirX: Math.cos(a), dirZ: Math.sin(a), scale: 0.6 + 0.8 * u(k, 2), sy: 0.8 + 0.45 * u(k, 9) });
  };
  for (let i = 0; i + 1 < props.length; i += 2) push(props[i]!, props[i + 1]!, i);
  if (relief && mask) {
    const { x0, y0, cell, nx, ny, heights: h } = relief;
    let n = 0;
    for (let j = 1; j + 1 < ny && n < hillLimit; j++) {
      for (let i = 1; i + 1 < nx && n < hillLimit; i++) {
        const k = j * nx + i;
        if (h[k]! <= 0) continue;
        const slope = Math.hypot(h[k + 1]! - h[k - 1]!, h[k + nx]! - h[k - nx]!) / (2 * cell);
        if (slope < 0.12) continue;
        const xm = (x0 + i * cell) / 10;
        const ym = (y0 + j * cell) / 10;
        // 只在路旁（遮罩 R 有值）且非建成区：路边坡地的树最容易被看见、也被路灯照到
        if (mask.sample(xm, ym, 1) > 0.3 || mask.sample(xm, ym, 0) < 0.05) continue;
        if (u(k, 3) > 0.45) continue;
        push(x0 + i * cell + (u(k, 4) - 0.5) * cell, y0 + j * cell + (u(k, 5) - 0.5) * cell, 100000 + k);
        n++;
      }
    }
  }
  return out;
}

/** 正二十面体（单位球上 12 个顶点、20 个面，逆时针朝外）。 */
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: [number, number, number][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x!, y!, z!);
    return [x! / l, y! / l, z! / l] as [number, number, number];
  });
  const f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ] as const;
  return { v, f };
})();

/**
 * 一团树冠（扰动过的二十面体，20 个三角形）：顶点沿径向 ±18 % 起伏（团块不圆整），
 * 法线取顶点方向（平滑明暗）；反照率按顶点抖动 ±35 %、越靠树心（低处、内侧）越暗，近看有团簇的明暗。
 */
function blob(b: PropBuilder, c: V3, r: readonly [number, number, number], seed: number, leaf: V3, centre: V3): void {
  const pts = ICO.v.map(([x, y, z], i) => {
    const k = 1 + 0.36 * (u(seed * 31 + i, 7) - 0.5);
    return [c[0] + x * r[0] * k, c[1] + y * r[1] * k, c[2] + z * r[2] * k] as V3;
  });
  const shade = ICO.v.map(([, y], i) => {
    const jitter = 0.65 + 0.7 * u(seed * 31 + i, 8);
    const low = 0.75 + 0.25 * (y + 1) * 0.5;
    return jitter * low;
  });
  for (const [ia, ib, ic] of ICO.f) {
    const base = b.pos.length / 3;
    for (const i of [ia, ib, ic]) {
      const p = pts[i]!;
      b.pos.push(p[0], p[1], p[2]);
      // 平滑法线：顶点相对整棵树冠中心的方向（各团连成一个整体的明暗，底面朝下吃街面暖光）
      const nx = p[0] - centre[0];
      const ny = p[1] - centre[1];
      const nz = p[2] - centre[2];
      const l = Math.hypot(nx, ny, nz) || 1;
      b.nrm.push(nx / l, ny / l, nz / l);
      const k = shade[i]!;
      b.alb.push(leaf[0] * k, leaf[1] * k, leaf[2] * k);
      b.em.push(0, 0, 0);
      b.part.push(0);
    }
    b.index.push(base, base + 1, base + 2);
  }
}

/**
 * 近处的树（约 150 m 内）：树干 + 4 团扰动过的二十面体树冠（中心约 5 m 高、整体半径约 3 m），约 88 个三角形。
 * 远处的树（farTreeGeometry）：一团略扁的树冠 + 树干，24 个三角形。实例另有随机朝向、0.6–1.4 倍大小、竖向 0.8–1.25 倍。
 */
export function treeGeometry() {
  const b = new PropBuilder();
  // 树冠反照率略高于山林冠层：路树就在路灯底下，底面被照成暖色（照片 08）
  const leaf: V3 = [0.05, 0.065, 0.032];
  const trunk = { alb: [0.04, 0.032, 0.025] as V3 };
  b.box([0, 0, 0], [0.3, 3.8, 0.3], trunk, { bottom: null, top: null });
  const centre: V3 = [0, 5, 0];
  blob(b, [0.2, 5.1, 0.1], [2.1, 1.7, 2.1], 1, leaf, centre);
  blob(b, [-1.4, 4.6, 0.9], [1.6, 1.3, 1.5], 2, leaf, centre);
  blob(b, [1.3, 4.4, -1.1], [1.5, 1.2, 1.6], 3, leaf, centre);
  blob(b, [-0.3, 6.2, -0.6], [1.4, 1.2, 1.3], 4, leaf, centre);
  return b.build();
}

/** 远处的树：一团略扁的树冠 + 树干（24 个三角形）。 */
export function farTreeGeometry() {
  const b = new PropBuilder();
  const leaf: V3 = [0.05, 0.065, 0.032];
  b.box([0, 0, 0], [0.3, 3.8, 0.3], { alb: [0.04, 0.032, 0.025] }, { bottom: null, top: null, px: null, nx: null });
  blob(b, [0, 5, 0], [2.9, 2.0, 2.9], 9, leaf, [0, 5, 0]);
  return b.build();
}

/** 近处树的半径（米，三维距离）：以内画细的，以外画粗的。 */
export const TREE_NEAR_M = 150;

/** 树（近、远两级 LOD，两个 InstancedMesh）。相机 6 m 内的树冠不画（不会一个树冠糊满屏幕）。 */
export function treeProps(items: readonly NearItem[], high: boolean): NearProps[] {
  const mat = createPropMaterial({ warmth: 0.5, light: 1.8, nearCull: 6 });
  return [
    new NearProps(treeGeometry(), mat, items, high ? TREE_NEAR_M : 0, high ? 600 : 1, 'trees', 40),
    new NearProps(farTreeGeometry(), mat, items, high ? 500 : 250, high ? 1500 : 400, 'trees-far', 60, high ? TREE_NEAR_M : 0),
  ];
}
