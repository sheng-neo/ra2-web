/**
 * 皇后像广场（R2 STREETLIFE S6，参考照 18、19）：遮打道南北两片花园里的浅水池（花岗石池边 0.45 m、暗蓝反光水面、
 * 水下青色射灯）、四片雕塑喷泉墙（约 9 m 长、2.6 m 高，底部暖色投光、墙间淡亮水幕）、黑色灯柱（3.8 m，暖色灯球
 * 进街道静态光点批）、花岗石花槽与绿篱、遮打道旁的白色有盖走廊（细柱、棚底筒灯）、长凳、树下地面射灯，
 * 以及绕水池的步道（行人走线）。
 * 全部摆放先在花园局部坐标里定，再逐件检查：不进车行道、不进楼、离敏感区（东侧旧法院大楼一带）≥ 2 m——
 * 不合格的那件就不放（敏感区只做背景，不加任何东西）。只在 HIGH 画（一个静态网格）；LOW 只留灯球光点。
 */
import { BufferGeometry, Mesh, type Color } from 'three';
import { simToThreeVec } from '../../coords';
import { lightColour } from '../materials/lighting';
import { footOk, makeWalkPath, type WalkContext, type WalkPath } from '../people/walkways';
import { K_SHEET, K_UPLIT, K_WATER, LifeBuilder, type Face } from './furniture';
import { createLifeMaterial } from './life-material';
import { linearRGB, scale3, type V3 } from './prop-geometry';

/** 花园局部坐标系：原点（模拟米）、沿遮打道方向 u、垂直方向 v。 */
interface Garden {
  o: readonly [number, number];
  u: readonly [number, number];
}

/** 南花园（遮打道与德辅道中之间）与北花园（遮打道与干诺道中之间）。 */
export const GARDENS: { south: Garden; north: Garden } = {
  south: { o: [507, -196], u: [0.97, -0.243] },
  north: { o: [540, -122], u: [0.97, -0.243] },
};

/** 局部 (a, b) → 模拟米。 */
export function gardenPoint(g: Garden, a: number, b: number): [number, number] {
  return [g.o[0] + g.u[0] * a - g.u[1] * b, g.o[1] + g.u[1] * a + g.u[0] * b];
}

export interface PlazaLight {
  /** three 坐标。 */
  p: [number, number, number];
  colour: Color;
  intensity: number;
  radius: number;
}

export interface StatueSquare {
  mesh: Mesh | null;
  lights: PlazaLight[];
  paths: WalkPath[];
  /** 放下 / 丢掉的件数（测试、调试）。 */
  placed: number;
  dropped: number;
}

/** 离敏感区的最小距离（m）。 */
export const ZONE_CLEAR_M = 2;

/**
 * 建皇后像广场设施。surface(x, y)：看得见的地面高度（模拟 dm）。firstPathId：走线编号起点。
 * withMesh = false（LOW）时只出灯与步道。
 */
export function buildStatueSquare(ctx: WalkContext, surface: (xDm: number, yDm: number) => number, firstPathId: number, withMesh: boolean): StatueSquare {
  const b = new LifeBuilder();
  const lights: PlazaLight[] = [];
  const paths: WalkPath[] = [];
  let placed = 0;
  let dropped = 0;
  // 一件设施的占地（局部矩形）是否全部合格：不进车行道 / 楼 / 敏感区（外扩 ZONE_CLEAR_M）
  const okRect = (g: Garden, a0: number, a1: number, b0: number, b1: number): boolean => {
    for (let a = a0; a <= a1 + 1e-6; a += Math.max((a1 - a0) / Math.ceil((a1 - a0) / 2), 0.5)) {
      for (let c = b0; c <= b1 + 1e-6; c += Math.max((b1 - b0) / Math.ceil((b1 - b0) / 2), 0.5)) {
        const [x, y] = gardenPoint(g, a, c);
        if (!footOk(ctx, x, y, -1, 0.5)) return false;
        for (const [dx, dy] of [
          [ZONE_CLEAR_M, 0],
          [-ZONE_CLEAR_M, 0],
          [0, ZONE_CLEAR_M],
          [0, -ZONE_CLEAR_M],
        ] as const) {
          if (!footOk(ctx, x + dx, y + dy, -1, -100)) return false;
        }
      }
    }
    return true;
  };
  const zAt = (g: Garden, a: number, c: number) => {
    const [x, y] = gardenPoint(g, a, c);
    return surface(x * 10, y * 10) / 10;
  };
  // 局部坐标 → three（米）
  const P = (g: Garden, a: number, c: number, h: number, z0: number): V3 => {
    const [x, y] = gardenPoint(g, a, c);
    return simToThreeVec(x, y, z0 + h, 1);
  };
  const granite: Face = { alb: linearRGB('#6e6a64') };
  const graniteTop: Face = { alb: linearRGB('#8c877f') };
  const warm = lightColour('#e09743');
  const warmV = (k: number): V3 => scale3([warm.r, warm.g, warm.b], k);

  /** 局部轴对齐盒子（a、c 范围，高 h0–h1）：四个侧面 + 顶面。 */
  const box = (g: Garden, z0: number, a0: number, a1: number, c0: number, c1: number, h0: number, h1: number, side: Face, top: Face | null, emGrad?: [V3, V3]) => {
    const corners = [
      [a0, c0],
      [a1, c0],
      [a1, c1],
      [a0, c1],
    ] as const;
    for (let k = 0; k < 4; k++) {
      const [pa, pc] = corners[k]!;
      const [qa, qc] = corners[(k + 1) % 4]!;
      // 局部 (a, c) 是右手系（u 东南、v 东北）：沿逆时针走，外侧面 = 从外看逆时针
      const f = emGrad ? { ...side, em: emGrad[0] } : side;
      b.quad(P(g, pa, pc, h0, z0), P(g, qa, qc, h0, z0), P(g, qa, qc, h1, z0), P(g, pa, pc, h1, z0), f, undefined, [h0, h0, h1, h1]);
      if (emGrad) {
        // 上半段渐暗（底部投光）：再叠一层不需要，直接改顶点发光
        const n = b.em.length;
        for (const i of [n - 6, n - 3]) {
          b.em[i] = emGrad[1][0];
          b.em[i + 1] = emGrad[1][1];
          b.em[i + 2] = emGrad[1][2];
        }
      }
    }
    if (top) b.quad(P(g, a0, c0, h1, z0), P(g, a1, c0, h1, z0), P(g, a1, c1, h1, z0), P(g, a0, c1, h1, z0), top, undefined, [h1, h1, h1, h1]);
  };

  /** 水池：花岗石池边（0.45 m 高、0.4 m 宽）+ 水面（0.35 m）。 */
  const pool = (g: Garden, a0: number, a1: number, c0: number, c1: number): boolean => {
    if (!okRect(g, a0, a1, c0, c1)) return false;
    const z0 = zAt(g, (a0 + a1) / 2, (c0 + c1) / 2);
    const w = 0.4;
    box(g, z0, a0, a1, c0, c0 + w, 0, 0.45, granite, graniteTop);
    box(g, z0, a0, a1, c1 - w, c1, 0, 0.45, granite, graniteTop);
    box(g, z0, a0, a0 + w, c0 + w, c1 - w, 0, 0.45, granite, graniteTop);
    box(g, z0, a1 - w, a1, c0 + w, c1 - w, 0, 0.45, granite, graniteTop);
    // 水面（uv 以米计：涟漪与水下射灯）
    const A = P(g, a0 + w, c0 + w, 0.35, z0);
    const B = P(g, a1 - w, c0 + w, 0.35, z0);
    const C = P(g, a1 - w, c1 - w, 0.35, z0);
    const D = P(g, a0 + w, c1 - w, 0.35, z0);
    b.quad(A, B, C, D, { kind: K_WATER, alb: [0.004, 0.006, 0.012] }, [
      [a0, c0],
      [a1, c0],
      [a1, c1],
      [a0, c1],
    ], [0.35, 0.35, 0.35, 0.35]);
    return true;
  };

  /** 四片雕塑喷泉墙（沿 u，中心 (ac, cc)），墙间水幕。 */
  const fountainWall = (g: Garden, ac: number, cc: number): boolean => {
    const len = 9.2;
    if (!okRect(g, ac - len / 2, ac + len / 2, cc - 0.6, cc + 0.6)) return false;
    const z0 = zAt(g, ac, cc);
    const panelW = 2.1;
    const gap = (len - 4 * panelW) / 3;
    const cols = ['#3b3029', '#2a383b', '#46392b', '#2f3b31'];
    for (let i = 0; i < 4; i++) {
      const a0 = ac - len / 2 + i * (panelW + gap);
      const h = 2.35 + 0.25 * ((i * 7) % 3);
      // 两个大面：底部暖色投光（kind 9，往上衰减），其余面普通
      // aux = 墙面高（uv 米），着色器在顶边画水帘亮线
      const face: Face = { alb: linearRGB(cols[i]!), kind: K_UPLIT, em: warmV(1.1), aux: h - 0.35 };
      for (const side of [-1, 1]) {
        const c = cc + side * 0.18;
        const s0 = side > 0 ? a0 + panelW : a0;
        const s1 = side > 0 ? a0 : a0 + panelW;
        b.quad(P(g, s0, c, 0.35, z0), P(g, s1, c, 0.35, z0), P(g, s1, c, h, z0), P(g, s0, c, h, z0), face, [
          [s0, 0],
          [s1, 0],
          [s1, h - 0.35],
          [s0, h - 0.35],
        ], [0.35, 0.35, h, h]);
      }
      box(g, z0, a0, a0 + 0.001, cc - 0.18, cc + 0.18, 0.35, h, { alb: linearRGB(cols[i]!) }, { alb: linearRGB(cols[i]!) });
      box(g, z0, a0 + panelW - 0.001, a0 + panelW, cc - 0.18, cc + 0.18, 0.35, h, { alb: linearRGB(cols[i]!) }, null);
      if (i < 3) {
        // 墙间水幕（两面都看得到）
        const s0 = a0 + panelW;
        const s1 = s0 + gap;
        b.quad(P(g, s0, cc, 0.35, z0), P(g, s1, cc, 0.35, z0), P(g, s1, cc, h - 0.2, z0), P(g, s0, cc, h - 0.2, z0), { kind: K_SHEET, alb: [0.02, 0.03, 0.04], em: [0.3, 0.42, 0.5] }, [
          [s0, 0.35],
          [s1, 0.35],
          [s1, h - 0.2],
          [s0, h - 0.2],
        ]);
      }
    }
    // 墙脚暖色投光（光点）
    for (let i = 0; i < 4; i++) {
      const a = ac - len / 2 + i * (panelW + gap) + panelW / 2;
      for (const side of [-1, 1]) lights.push({ p: [...P(g, a, cc + side * 0.6, 0.4, z0)] as [number, number, number], colour: warm, intensity: 2.5, radius: 0.12 });
    }
    return true;
  };

  /** 灯柱：黑色 3.8 m，暖色灯球（光点）。 */
  const lantern = (g: Garden, a: number, c: number): boolean => {
    if (!okRect(g, a - 0.3, a + 0.3, c - 0.3, c + 0.3)) return false;
    const z0 = zAt(g, a, c);
    const black: Face = { alb: [0.012, 0.012, 0.013] };
    box(g, z0, a - 0.11, a + 0.11, c - 0.11, c + 0.11, 0, 0.5, black, null);
    box(g, z0, a - 0.05, a + 0.05, c - 0.05, c + 0.05, 0.5, 3.45, black, null);
    box(g, z0, a - 0.14, a + 0.14, c - 0.14, c + 0.14, 3.45, 3.55, black, black);
    lights.push({ p: [...P(g, a, c, 3.72, z0)] as [number, number, number], colour: warm, intensity: 8, radius: 0.2 });
    return true;
  };

  /** 花槽（花岗石 0.6 m）+ 绿篱。 */
  const planter = (g: Garden, a0: number, a1: number, c0: number, c1: number): boolean => {
    if (!okRect(g, a0, a1, c0, c1)) return false;
    const z0 = zAt(g, (a0 + a1) / 2, (c0 + c1) / 2);
    box(g, z0, a0, a1, c0, c1, 0, 0.6, granite, null);
    box(g, z0, a0 + 0.15, a1 - 0.15, c0 + 0.15, c1 - 0.15, 0.6, 1.25, { alb: linearRGB('#1f3a1c') }, { alb: linearRGB('#2a4a22') });
    return true;
  };

  /** 长凳。 */
  const bench = (g: Garden, a: number, c: number): boolean => {
    if (!okRect(g, a - 1, a + 1, c - 0.3, c + 0.3)) return false;
    const z0 = zAt(g, a, c);
    box(g, z0, a - 1, a + 1, c - 0.25, c + 0.25, 0, 0.45, { alb: linearRGB('#4a3a2c') }, { alb: linearRGB('#5c4834') });
    return true;
  };

  /** 白色有盖走廊：细柱（6 m 一对）、平顶（3 m 高）、棚底筒灯带。 */
  const walkway = (g: Garden, a0: number, a1: number, c0: number, c1: number): boolean => {
    if (!okRect(g, a0, a1, c0, c1)) return false;
    const z0 = zAt(g, (a0 + a1) / 2, (c0 + c1) / 2);
    const white: Face = { alb: linearRGB('#dfdddc') };
    for (let a = a0; a <= a1 + 1e-6; a += (a1 - a0) / Math.max(1, Math.round((a1 - a0) / 6))) {
      for (const c of [c0 + 0.2, c1 - 0.2]) box(g, z0, a - 0.08, a + 0.08, c - 0.08, c + 0.08, 0, 2.9, white, null);
    }
    // 顶板（侧面白色檐口 + 顶面）与棚底（灰、带一条筒灯光带）
    box(g, z0, a0 - 0.3, a1 + 0.3, c0 - 0.3, c1 + 0.3, 2.9, 3.25, white, { alb: linearRGB('#a9a7a4') });
    const soffit = (h: number, f: Face, cc0: number, cc1: number) =>
      b.quad(P(g, a0 - 0.3, cc1, h, z0), P(g, a1 + 0.3, cc1, h, z0), P(g, a1 + 0.3, cc0, h, z0), P(g, a0 - 0.3, cc0, h, z0), f, undefined, [h, h, h, h]);
    soffit(2.9, { alb: linearRGB('#bdbbb8') }, c0 - 0.3, c1 + 0.3);
    const mid = (c0 + c1) / 2;
    const tube = lightColour('tubeCool');
    soffit(2.88, { alb: [0.6, 0.6, 0.6], em: scale3([tube.r, tube.g, tube.b], 1.05) }, mid - 0.12, mid + 0.12);
    return true;
  };

  /** 绕水池的步道（局部矩形周长）。 */
  const loop = (g: Garden, a0: number, a1: number, c0: number, c1: number) => {
    const pts: [number, number][] = [];
    const step = 1;
    const edge = (fa: number, fc: number, ta: number, tc: number) => {
      const n = Math.max(1, Math.round(Math.hypot(ta - fa, tc - fc) / step));
      for (let i = 0; i < n; i++) pts.push([fa + ((ta - fa) * i) / n, fc + ((tc - fc) * i) / n]);
    };
    edge(a0, c0, a1, c0);
    edge(a1, c0, a1, c1);
    edge(a1, c1, a0, c1);
    edge(a0, c1, a0, c0);
    pts.push([a0, c0]);
    // 不合格的点处断开：只留最长的一段
    let best: number[] = [];
    let cur: number[] = [];
    for (const [a, c] of pts) {
      const [x, y] = gardenPoint(g, a, c);
      if (footOk(ctx, x, y, -1, 1.0) && footOk(ctx, x + ZONE_CLEAR_M, y, -1, -100) && footOk(ctx, x - ZONE_CLEAR_M, y, -1, -100)) cur.push(x, y, surface(x * 10, y * 10) / 10);
      else {
        if (cur.length > best.length) best = cur;
        cur = [];
      }
    }
    if (cur.length > best.length) best = cur;
    if (best.length >= 30) paths.push(makeWalkPath(firstPathId + paths.length, best, 0.45, 'street', true));
  };

  const S = GARDENS.south;
  const N = GARDENS.north;
  const tally = (ok: boolean) => (ok ? placed++ : dropped++);
  // 南花园：靠遮打道的长水池（池中喷泉墙）、南面两个并排水池、遮打道旁有盖走廊、灯柱、花槽、长凳
  tally(pool(S, -14, 24, 17, 25));
  tally(fountainWall(S, 9, 21));
  tally(pool(S, -16, -1, -14, -2));
  tally(pool(S, 2, 16, -14, -2));
  tally(walkway(S, -30, 24, 30, 33));
  for (const a of [-24, -12, 0, 12, 24]) for (const c of [-18, 8, 27.5]) tally(lantern(S, a, c));
  for (const [a, c] of [
    [-26, -24],
    [22, -24],
    [-24, 21],
    [28, 12],
  ] as const)
    tally(planter(S, a - 1.2, a + 1.2, c - 1.2, c + 1.2));
  for (const a of [-12, -4, 4, 12]) tally(bench(S, a, 4.5));
  loop(S, -17, 27, 14, 28);
  loop(S, -19, 19, -17, 1);
  // 北花园（相机「皇后像廣場」机位就站在这里）：前方一个长水池（池中第二道喷泉墙）、灯柱、花槽
  tally(pool(N, -16, 8, -27, -17));
  tally(fountainWall(N, -3.4, -22));
  for (const a of [-20, -8, 4, 16]) tally(lantern(N, a, -31));
  for (const a of [-8, 4, 16]) tally(lantern(N, a, -13));
  tally(planter(N, 11, 13.5, -16, -13.5));
  tally(planter(N, -26, -23.5, -24, -21.5));
  loop(N, -19, 11, -30, -14);

  let mesh: Mesh | null = null;
  if (withMesh && b.vertexCount > 0) {
    const g: BufferGeometry = b.geometry();
    mesh = new Mesh(g, createLifeMaterial(0.3));
    mesh.name = 'statue-square';
    mesh.matrixAutoUpdate = false;
  }
  return { mesh, lights, paths, placed, dropped };
}
