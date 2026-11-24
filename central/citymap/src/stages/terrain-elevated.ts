/**
 * 03-terrain 的高架结构检查：在低地里找“两侧地面齐平、中间凸起”的细长窄脊，即疑似天桥/高架路被当成地面。
 * 只报告不修：CEDD LiDAR DTM 是裸地模型，正常应为 0；换成地政总署 5 m DTM（含高架路和植被顶）时会命中。
 * 短于 minLengthDm 的凸起（挡土墙围起的平台、两条明挖槽之间的地面）只计入 candidates，不当高架报告。
 */
import type { TerrainGrid } from '@central/data';

export interface ElevatedOptions {
  /** 两侧取样距离（dm）。高架桥面一般 10–25 m 宽。 */
  reachDm: number;
  /** 比两侧都高出至少这么多才算（dm）。 */
  minRiseDm: number;
  /** 两侧地面高差不超过这么多才算“齐平”（dm），排除山坡。 */
  levelDm: number;
  /** 两侧地面都不高于此高程（dm）才检查：高架路都在海旁填海平地，山脊不算。 */
  maxGroundDm: number;
  /** 聚类外包对角线至少这么长（dm）才报告：高架路是长条。 */
  minLengthDm: number;
}

export const ELEVATED_DEFAULTS: ElevatedOptions = {
  reachDm: 150,
  minRiseDm: 40,
  levelDm: 15,
  maxGroundDm: 300,
  minLengthDm: 400,
};

export interface ElevatedCluster {
  /** 质心（本地 dm）。 */
  x: number;
  y: number;
  cells: number;
  /** 外包对角线长度（dm）。 */
  lengthDm: number;
  /** 最大凸起（dm）。 */
  maxRiseDm: number;
}

export interface ElevatedReport {
  /** 满足凸起条件的格数（含太短而不报告的）。 */
  candidates: number;
  /** 已报告聚类的格数合计。 */
  cells: number;
  /** 足够长的 8 连通聚类，按格数从多到少。 */
  clusters: ElevatedCluster[];
}

/** 东西、南北、两条对角线。 */
const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** land[k] 为 0 的格（海面）既不检查也不当两侧地面。 */
export function findElevated(
  grid: TerrainGrid,
  land: Uint8Array,
  opts: ElevatedOptions = ELEVATED_DEFAULTS,
): ElevatedReport {
  const { nx, ny, cell, heights } = grid;
  const r = Math.max(1, Math.round(opts.reachDm / cell));
  const rise = new Int32Array(nx * ny);
  const at = (i: number, j: number): number | null => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return null;
    const k = j * nx + i;
    return land[k] ? heights[k]! : null;
  };
  let candidates = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!land[k]) continue;
      const v = heights[k]!;
      let best = 0;
      for (const [dx, dy] of DIRS) {
        const a = at(i - r * dx, j - r * dy);
        const b = at(i + r * dx, j + r * dy);
        if (a === null || b === null) continue;
        const ground = Math.max(a, b);
        if (Math.abs(a - b) > opts.levelDm || ground > opts.maxGroundDm) continue;
        best = Math.max(best, v - ground);
      }
      if (best >= opts.minRiseDm) {
        rise[k] = best;
        candidates++;
      }
    }
  }
  const clusters = cluster(grid, rise).filter((c) => c.lengthDm >= opts.minLengthDm);
  return { candidates, cells: clusters.reduce((s, c) => s + c.cells, 0), clusters };
}

function cluster(grid: TerrainGrid, rise: Int32Array): ElevatedCluster[] {
  const { nx, ny, x0, y0, cell } = grid;
  const seen = new Uint8Array(rise.length);
  const out: ElevatedCluster[] = [];
  for (let start = 0; start < rise.length; start++) {
    if (!rise[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let maxRiseDm = 0;
    let i0 = nx;
    let i1 = 0;
    let j0 = ny;
    let j1 = 0;
    while (stack.length > 0) {
      const k = stack.pop()!;
      const i = k % nx;
      const j = (k - i) / nx;
      n++;
      sx += i;
      sy += j;
      maxRiseDm = Math.max(maxRiseDm, rise[k]!);
      i0 = Math.min(i0, i);
      i1 = Math.max(i1, i);
      j0 = Math.min(j0, j);
      j1 = Math.max(j1, j);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const kk = jj * nx + ii;
          if (rise[kk] && !seen[kk]) {
            seen[kk] = 1;
            stack.push(kk);
          }
        }
      }
    }
    out.push({
      x: Math.round(x0 + (sx / n) * cell),
      y: Math.round(y0 + (sy / n) * cell),
      cells: n,
      lengthDm: Math.round(Math.hypot(i1 - i0 + 1, j1 - j0 + 1) * cell),
      maxRiseDm,
    });
  }
  return out.sort((a, b) => b.cells - a.cells || a.x - b.x || a.y - b.y);
}
