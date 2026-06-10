/**
 * 网格 A*（8 向，直行 256 / 斜行 362 ≈ 256√2）。
 * 输入抽象的通行性回调，地形/占位由 World 提供。
 * 全整数，迭代上限防御病态输入。
 */
export interface PathGrid {
  width: number;
  height: number;
  /** 该格能否通行。 */
  passable(x: number, y: number): boolean;
}

const DIRS: readonly { dx: number; dy: number; cost: number }[] = [
  { dx: 1, dy: 0, cost: 256 },
  { dx: -1, dy: 0, cost: 256 },
  { dx: 0, dy: 1, cost: 256 },
  { dx: 0, dy: -1, cost: 256 },
  { dx: 1, dy: 1, cost: 362 },
  { dx: 1, dy: -1, cost: 362 },
  { dx: -1, dy: 1, cost: 362 },
  { dx: -1, dy: -1, cost: 362 },
];

/** 二叉小顶堆（按 f 值）。 */
class MinHeap {
  private keys: number[] = [];
  private prios: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, prio: number): void {
    this.keys.push(key);
    this.prios.push(prio);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prios[p]! <= this.prios[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.keys[0]!;
    const lastK = this.keys.pop()!;
    const lastP = this.prios.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastK;
      this.prios[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.prios.length && this.prios[l]! < this.prios[m]!) m = l;
        if (r < this.prios.length && this.prios[r]! < this.prios[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.prios[a], this.prios[b]] = [this.prios[b]!, this.prios[a]!];
  }
}

function heuristic(x0: number, y0: number, x1: number, y1: number): number {
  // 八向距离（octile）：整数化 256/106（362-256）
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  return 256 * Math.max(dx, dy) + 106 * Math.min(dx, dy);
}

/**
 * 返回从 (sx,sy) 到 (tx,ty) 的格序列（不含起点，含终点）；
 * 不可达时返回 null。目标不可通行时寻最近可达格（简化：直接失败）。
 */
export function findPath(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxIterations = 20000,
): { x: number; y: number }[] | null {
  const { width: w, height: h } = grid;
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || !grid.passable(tx, ty)) return null;
  if (sx === tx && sy === ty) return [];

  const key = (x: number, y: number): number => y * w + x;
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open = new MinHeap();

  gScore.set(key(sx, sy), 0);
  open.push(key(sx, sy), heuristic(sx, sy, tx, ty));

  let iterations = 0;
  while (open.size > 0 && iterations++ < maxIterations) {
    const cur = open.pop();
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    if (cx === tx && cy === ty) {
      const path: { x: number; y: number }[] = [];
      let k = cur;
      while (k !== key(sx, sy)) {
        path.push({ x: k % w, y: Math.floor(k / w) });
        k = cameFrom.get(k)!;
      }
      path.reverse();
      return path;
    }
    const g = gScore.get(cur)!;
    for (const d of DIRS) {
      const nx = cx + d.dx;
      const ny = cy + d.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !grid.passable(nx, ny)) continue;
      // 斜行不许穿角：两侧正交格都要可通行
      if (d.dx !== 0 && d.dy !== 0 && (!grid.passable(cx + d.dx, cy) || !grid.passable(cx, cy + d.dy))) {
        continue;
      }
      const nk = key(nx, ny);
      const ng = g + d.cost;
      const old = gScore.get(nk);
      if (old !== undefined && old <= ng) continue;
      gScore.set(nk, ng);
      cameFrom.set(nk, cur);
      open.push(nk, ng + heuristic(nx, ny, tx, ty));
    }
  }
  return null;
}
