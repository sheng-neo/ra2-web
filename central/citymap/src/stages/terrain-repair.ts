/**
 * 03-terrain 的原始网格修补：屏蔽离谱值、削掉孤立尖刺、补内陆小空洞。
 * 输入输出都是 dm 整数网格（index = j*nx + i），无数据为 nodata；海面（连到网格边界的无数据）保持无数据。
 */

/** 合理高程区间（dm）：−30 m（隧道口明挖段约 −3 m）到 1000 m（港岛最高约 552 m）。 */
const VALID_MIN_DM = -300;
const VALID_MAX_DM = 10000;
/** 尖刺：比 8 邻域全部高（或低）出 10 m 以上的单个采样。真实挡土墙至少一侧有同高邻居，不会命中。 */
const SPIKE_DM = 100;
/** 只补不连边界、面积 ≤ 此值（采样数）的无数据空洞；更大的封闭空洞当水面留着并报告。 */
export const MAX_HOLE_CELLS = 2500;

export interface RepairReport {
  /** 超出合理区间、改成无数据的采样数。 */
  outOfRange: number;
  /** 被替换成邻域中位数的尖刺数。 */
  spikes: number;
  /** 补上的空洞个数与采样数。 */
  holesFilled: number;
  holeCellsFilled: number;
  /** 太大而没补的封闭空洞个数。 */
  holesLeft: number;
}

/** 返回修补后的新数组与报告；不改输入。 */
export function repairDtm(
  input: Int16Array,
  nx: number,
  ny: number,
  nodata: number,
): { data: Int16Array; report: RepairReport } {
  const data = input.slice();
  let outOfRange = 0;
  for (let k = 0; k < data.length; k++) {
    const v = data[k]!;
    if (v !== nodata && (v < VALID_MIN_DM || v > VALID_MAX_DM)) {
      data[k] = nodata;
      outOfRange++;
    }
  }
  const spikes = removeSpikes(data, nx, ny, nodata);
  return { data, report: { outOfRange, spikes, ...fillHoles(data, nx, ny, nodata) } };
}

/** 就地替换孤立尖刺（读取用修补前的快照，避免连锁）。只看 8 邻域都有数据的内部点。 */
function removeSpikes(data: Int16Array, nx: number, ny: number, nodata: number): number {
  const src = data.slice();
  const nb = new Array<number>(8);
  let count = 0;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      const v = src[k]!;
      if (v === nodata) continue;
      let lo = Infinity;
      let hi = -Infinity;
      let m = 0;
      let complete = true;
      for (let dj = -1; dj <= 1 && complete; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const w = src[k + dj * nx + di]!;
          if (w === nodata) {
            complete = false;
            break;
          }
          nb[m++] = w;
          lo = Math.min(lo, w);
          hi = Math.max(hi, w);
        }
      }
      if (!complete || (v <= hi + SPIKE_DM && v >= lo - SPIKE_DM)) continue;
      nb.sort((a, b) => a - b);
      data[k] = Math.round((nb[3]! + nb[4]!) / 2);
      count++;
    }
  }
  return count;
}

/** 4 连通标记无数据区；不连边界且不大的空洞由外向内逐层取已知 4 邻居均值补上。 */
function fillHoles(
  data: Int16Array,
  nx: number,
  ny: number,
  nodata: number,
): Pick<RepairReport, 'holesFilled' | 'holeCellsFilled' | 'holesLeft'> {
  const seen = new Uint8Array(data.length);
  const queue = new Int32Array(data.length);
  let holesFilled = 0;
  let holeCellsFilled = 0;
  let holesLeft = 0;
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || data[start] !== nodata) continue;
    // BFS 收集整个无数据连通块
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let touchesEdge = false;
    const visit = (n: number): void => {
      if (!seen[n] && data[n] === nodata) {
        seen[n] = 1;
        queue[tail++] = n;
      }
    };
    // 海面连通块有数百万格，这里不走 neighbours4，免得每格分配数组
    while (head < tail) {
      const k = queue[head++]!;
      const i = k % nx;
      const j = (k - i) / nx;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) touchesEdge = true;
      if (i > 0) visit(k - 1);
      if (i < nx - 1) visit(k + 1);
      if (j > 0) visit(k - nx);
      if (j < ny - 1) visit(k + nx);
    }
    if (touchesEdge) continue;
    if (tail > MAX_HOLE_CELLS) {
      holesLeft++;
      continue;
    }
    fillComponent(data, Array.from(queue.subarray(0, tail)), nx, ny, nodata);
    holesFilled++;
    holeCellsFilled += tail;
  }
  return { holesFilled, holeCellsFilled, holesLeft };
}

function fillComponent(data: Int16Array, cells: number[], nx: number, ny: number, nodata: number): void {
  let rest = cells;
  while (rest.length > 0) {
    const next: number[] = [];
    const updates: [number, number][] = [];
    for (const k of rest) {
      const i = k % nx;
      const j = (k - i) / nx;
      let sum = 0;
      let n = 0;
      for (const nb of neighbours4(k, i, j, nx, ny)) {
        if (data[nb] !== nodata) {
          sum += data[nb]!;
          n++;
        }
      }
      if (n > 0) updates.push([k, Math.round(sum / n)]);
      else next.push(k);
    }
    // 封闭空洞每层至少有一个格挨着已知值，不会死循环
    for (const [k, v] of updates) data[k] = v;
    rest = next;
  }
}

function neighbours4(k: number, i: number, j: number, nx: number, ny: number): number[] {
  const out: number[] = [];
  if (i > 0) out.push(k - 1);
  if (i < nx - 1) out.push(k + 1);
  if (j > 0) out.push(k - nx);
  if (j < ny - 1) out.push(k + nx);
  return out;
}
