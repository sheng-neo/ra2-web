/**
 * 栅格掩膜工具（本地 dm）：多边形偶奇填充、4 连通分量、沿格边追踪轮廓。
 * 用来在量化网格上做精确的多边形并 / 交 / 差（LOD2 分层体块，见 stages/building-parts.ts），不引新依赖。
 *
 * 网格：格 (i, j) 覆盖 [x0 + i·cell, x0 + (i+1)·cell) × [y0 + j·cell, …)，j 向北；格心在多边形内即算在内。
 * 掩膜下标 idx = j·nx + i。
 */

export interface Grid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
}

/** 环集合的外包框 [minX, minY, maxX, maxY]。 */
export function ringsBounds(rings: readonly (readonly number[])[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      x0 = Math.min(x0, r[i]!);
      x1 = Math.max(x1, r[i]!);
      y0 = Math.min(y0, r[i + 1]!);
      y1 = Math.max(y1, r[i + 1]!);
    }
  }
  return [x0, y0, x1, y1];
}

/** 覆盖 bounds（外扩 pad 格）的网格，原点对齐到 cell 的整数倍（同一 cell 的网格之间格角重合）。 */
export function gridFor(bounds: readonly [number, number, number, number], cell: number, pad = 1): Grid {
  const x0 = (Math.floor(bounds[0] / cell) - pad) * cell;
  const y0 = (Math.floor(bounds[1] / cell) - pad) * cell;
  const nx = Math.floor(bounds[2] / cell) + pad + 1 - x0 / cell;
  const ny = Math.floor(bounds[3] / cell) + pad + 1 - y0 / cell;
  return { x0, y0, cell, nx, ny };
}

/**
 * 偶奇规则扫描线填充，按行段回调：span(k0, k1) 表示下标 k0..k1（含两端，同一行）的格都在 rings 里。
 * rings 为外环与洞一起，绕向无关；格心在内即算。每格只出现一次。
 */
export function fillSpans(g: Grid, rings: readonly (readonly number[])[], span: (k0: number, k1: number) => void): void {
  // 每条非水平边按它跨过的格心行分桶（格心 y ∈ [ya, yb)：顶点只算一次）
  const rows: (number[] | undefined)[] = new Array<number[] | undefined>(g.ny);
  for (const r of rings) {
    const n = r.length >> 1;
    for (let k = 0; k < n; k++) {
      const m = (k + 1) % n;
      let xa = r[2 * k]!;
      let ya = r[2 * k + 1]!;
      let xb = r[2 * m]!;
      let yb = r[2 * m + 1]!;
      if (ya === yb) continue;
      if (ya > yb) [xa, ya, xb, yb] = [xb, yb, xa, ya];
      const j0 = Math.max(0, Math.ceil((ya - g.y0) / g.cell - 0.5));
      const j1 = Math.min(g.ny - 1, Math.ceil((yb - g.y0) / g.cell - 0.5) - 1);
      for (let j = j0; j <= j1; j++) {
        const y = g.y0 + (j + 0.5) * g.cell;
        (rows[j] ??= []).push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
      }
    }
  }
  for (let j = 0; j < g.ny; j++) {
    const xs = rows[j];
    if (!xs || xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k]! - g.x0) / g.cell - 0.5));
      const i1 = Math.min(g.nx - 1, Math.ceil((xs[k + 1]! - g.x0) / g.cell - 0.5) - 1);
      if (i0 <= i1) span(j * g.nx + i0, j * g.nx + i1);
    }
  }
}

/** 同 fillSpans，逐格回调 visit(idx)。 */
export function fillRings(g: Grid, rings: readonly (readonly number[])[], visit: (idx: number) => void): void {
  fillSpans(g, rings, (k0, k1) => {
    for (let k = k0; k <= k1; k++) visit(k);
  });
}

/** rings 的掩膜（1 = 在内）。 */
export function rasterRings(g: Grid, rings: readonly (readonly number[])[]): Uint8Array {
  const m = new Uint8Array(g.nx * g.ny);
  fillSpans(g, rings, (k0, k1) => m.fill(1, k0, k1 + 1));
  return m;
}

/** 掩膜里的格数。 */
export function countMask(m: Uint8Array): number {
  let n = 0;
  for (let k = 0; k < m.length; k++) n += m[k]!;
  return n;
}

/** 4 连通分量：labels（0 = 背景，1.. 按行优先首次出现的顺序编号）与各分量格数（下标即标号，sizes[0] = 0）。 */
export function components(m: Uint8Array, nx: number, ny: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(nx * ny);
  const sizes = [0];
  const stack: number[] = [];
  let id = 0;
  const visit = (q: number) => {
    if (m[q] && !labels[q]) {
      labels[q] = id;
      stack.push(q);
    }
  };
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || labels[s]) continue;
    id = sizes.length;
    let size = 0;
    visit(s);
    while (stack.length > 0) {
      const k = stack.pop()!;
      size++;
      const i = k % nx;
      const j = (k - i) / nx;
      if (i > 0) visit(k - 1);
      if (i + 1 < nx) visit(k + 1);
      if (j > 0) visit(k - nx);
      if (j + 1 < ny) visit(k + nx);
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

// 方向：0 东、1 北、2 西、3 南
const DI = [1, 0, -1, 0] as const;
const DJ = [0, 1, 0, -1] as const;

/**
 * 沿格边追踪掩膜边界，返回环（扁平格角坐标 [i0, j0, i1, j1, ...]，只留拐点）。
 * 实体在行进方向左侧：外环逆时针、洞顺时针。鞍点（对角相接）一律左转，对角相接的格各成一环（与 components 的 4 连通一致）。
 * 每个环从它最南、再最西的格角起；环按起点（先南后西）排序。确定性。
 */
export function traceMask(m: Uint8Array, nx: number, ny: number): number[][] {
  const W = nx + 1;
  // 每个格角最多两条出边（鞍点），存方向 +1（0 = 无）
  const out0 = new Uint8Array(W * (ny + 1));
  const out1 = new Uint8Array(W * (ny + 1));
  const add = (i: number, j: number, d: number) => {
    const c = j * W + i;
    if (!out0[c]) out0[c] = d + 1;
    else out1[c] = d + 1;
  };
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && m[j * nx + i] === 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!m[j * nx + i]) continue;
      if (!at(i, j - 1)) add(i, j, 0); // 南边 向东
      if (!at(i + 1, j)) add(i + 1, j, 1); // 东边 向北
      if (!at(i, j + 1)) add(i + 1, j + 1, 2); // 北边 向西
      if (!at(i - 1, j)) add(i, j + 1, 3); // 西边 向南
    }
  }
  const used = new Uint8Array(W * (ny + 1) * 4);
  const has = (c: number, d: number) => out0[c] === d + 1 || out1[c] === d + 1;
  const loops: number[][] = [];
  for (let c0 = 0; c0 < out0.length; c0++) {
    for (const slot of [out0, out1]) {
      if (!slot[c0]) continue;
      const d0 = slot[c0]! - 1;
      if (used[c0 * 4 + d0]) continue;
      const pts: number[] = [];
      const dirs: number[] = [];
      let c = c0;
      let d = d0;
      for (;;) {
        used[c * 4 + d] = 1;
        pts.push(c);
        dirs.push(d);
        const i = (c % W) + DI[d]!;
        const j = Math.floor(c / W) + DJ[d]!;
        c = j * W + i;
        // 左转 > 直行 > 右转
        let nd = (d + 1) & 3;
        if (!has(c, nd)) nd = has(c, d) ? d : (d + 3) & 3;
        if (c === c0 && nd === d0) break;
        d = nd;
      }
      const ring: number[] = [];
      const n = pts.length;
      for (let k = 0; k < n; k++) {
        if (dirs[k] === dirs[(k + n - 1) % n]) continue;
        ring.push(pts[k]! % W, Math.floor(pts[k]! / W));
      }
      if (ring.length >= 8) loops.push(ring);
    }
  }
  return loops;
}

/** 点在环内（偶奇）。 */
export function insideRing(x: number, y: number, r: readonly number[]): boolean {
  let inside = false;
  const n = r.length >> 1;
  for (let a = 0, b = n - 1; a < n; b = a++) {
    const xa = r[2 * a]!;
    const ya = r[2 * a + 1]!;
    const xb = r[2 * b]!;
    const yb = r[2 * b + 1]!;
    if (ya > y !== yb > y && x < xa + ((y - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
  }
  return inside;
}
