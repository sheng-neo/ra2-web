/**
 * 导航：有符号距离场(SDF)网格 + A* 寻路 + 贴墙滑动碰撞。
 *
 * 做法：把地图采样成 0.5m 间距的节点网格，每个节点存「净空」= 到最近墙体/边界/存活建筑的有符号距离
 * (墙内为负)。任意点的净空用双线性插值得到；半径为 r 的单位站在某点合法 ⇔ 净空 ≥ r。
 * A* 直接在节点上搜索(节点净空 ≥ r 即可走)，由于插值场在相邻可走节点之间的连线上处处 ≥ r，
 * 「寻路认为能走」与「碰撞认为能走」是同一套判据，不会出现寻路穿墙或沿路被卡的不一致。
 * 存活的塔/水晶是圆形障碍：叠加进同一张净空图，被毁时局部恢复。
 */
import { distToPolygonEdge, pointInPolygon } from './map';
import type { MapData, Vec2 } from './types';

/** 节点间距（米） */
export const NAV_CELL = 0.5;
const INV = 1 / NAV_CELL;
/** 网格覆盖 [-EXTENT, EXTENT]²，略大于可走范围 */
const EXTENT = 58;
/** 寻路比碰撞多留的一点余量，避免贴着墙角走时反复触发滑动 */
const PATH_MARGIN = 0.06;
/** 启发式权重(>1 换取更少的展开；路径之后还会被拉直) */
const HEUR_W = 1.12;
/** 单次碰撞步进的最大步长：高速位移会被拆成多步，防止穿墙 */
const MAX_STEP = 0.3;
/**
 * 净空值的上限：只关心「离障碍有多近」，开阔地带统一记为这个值。
 * 这样建图时远处的墙可以直接跳过(快几倍)，建筑障碍也只需要更新周围这么大的范围。
 */
const CLEAR_CAP = 6;
/** 障碍物影响净空图的范围（= 净空上限：更远处的净空值本来就不会超过它，射线步进不会跨过建筑） */
const OBSTACLE_REACH = CLEAR_CAP;
const MAX_EXPANSIONS = 40000;
const SQRT2 = Math.SQRT2;

interface Obstacle {
  id: number;
  x: number;
  y: number;
  r: number;
}

/** 静态地形的距离场只与墙体几何有关，按几何内容缓存（测试里会反复 createWorld） */
const staticCache = new Map<string, Float32Array>();

function buildStaticField(map: MapData, n: number): Float32Array {
  const key = `${map.bound}|${JSON.stringify(map.walls)}`;
  const cached = staticCache.get(key);
  if (cached) return cached;
  const field = new Float32Array(n * n);
  const walls = map.walls;
  const boxes = walls.map((w) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of w) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  });
  const p: Vec2 = { x: 0, y: 0 };
  for (let iy = 0; iy < n; iy++) {
    const y = -EXTENT + iy * NAV_CELL;
    for (let ix = 0; ix < n; ix++) {
      const x = -EXTENT + ix * NAV_CELL;
      let d = Math.min(map.bound - Math.abs(x), map.bound - Math.abs(y), CLEAR_CAP);
      p.x = x;
      p.y = y;
      for (let k = 0; k < walls.length; k++) {
        const b = boxes[k];
        const ox = Math.max(b.minX - x, 0, x - b.maxX);
        const oy = Math.max(b.minY - y, 0, y - b.maxY);
        // 包围盒都比当前最小值远 → 这面墙不可能更近
        if ((ox > 0 || oy > 0) && Math.hypot(ox, oy) >= d) continue;
        const e = distToPolygonEdge(p, walls[k]);
        const sd = pointInPolygon(p, walls[k]) ? -e : e;
        if (sd < d) d = sd;
      }
      field[iy * n + ix] = d;
    }
  }
  staticCache.set(key, field);
  return field;
}

export class NavGrid {
  /** 每轴节点数 */
  readonly n: number;
  /** 当前净空图（静态地形 ∩ 存活建筑） */
  readonly clear: Float32Array;
  /** 仅静态地形 */
  private readonly base: Float32Array;
  private readonly obstacles: Obstacle[] = [];

  // A* 工作区（一次分配，世代计数免清零）
  private readonly gScore: Float32Array;
  private readonly parent: Int32Array;
  private readonly opened: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly heapNode: Int32Array;
  private readonly heapKey: Float32Array;
  private heapSize = 0;
  private gen = 0;
  private readonly nodeBuf: Int32Array;
  // 梯度输出
  private gx = 0;
  private gy = 0;

  /** 统计（性能测试/调试用） */
  readonly stats = { searches: 0, expansions: 0 };
  /** 最近一次 findPath 是否只找到了部分路径（终点不连通/搜索超限） */
  lastPathPartial = false;

  constructor(map: MapData) {
    const n = Math.round((EXTENT * 2) / NAV_CELL) + 1;
    this.n = n;
    this.base = buildStaticField(map, n);
    this.clear = new Float32Array(this.base);
    const total = n * n;
    this.gScore = new Float32Array(total);
    this.parent = new Int32Array(total);
    this.opened = new Uint32Array(total);
    this.closed = new Uint32Array(total);
    this.heapNode = new Int32Array(total * 2);
    this.heapKey = new Float32Array(total * 2);
    this.nodeBuf = new Int32Array(total);
  }

  // ───────────────────────── 净空查询 ─────────────────────────

  private sample(field: Float32Array, x: number, y: number): number {
    const n = this.n;
    let fx = (x + EXTENT) * INV;
    let fy = (y + EXTENT) * INV;
    if (fx < 0) fx = 0;
    else if (fx > n - 1) fx = n - 1;
    if (fy < 0) fy = 0;
    else if (fy > n - 1) fy = n - 1;
    let ix = fx | 0;
    let iy = fy | 0;
    if (ix > n - 2) ix = n - 2;
    if (iy > n - 2) iy = n - 2;
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * n + ix;
    const a = field[i];
    const b = field[i + 1];
    const c = field[i + n];
    const d = field[i + n + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  /** 该点到最近障碍(墙/边界/存活建筑)的有符号距离 */
  clearanceAt(x: number, y: number): number {
    return this.sample(this.clear, x, y);
  }

  /** 半径 r 的单位能否站在 (x, y) */
  isFree(x: number, y: number, r: number): boolean {
    return this.sample(this.clear, x, y) >= r;
  }

  /** 只看静态地形（不含建筑）是否可站 */
  isFreeTerrain(x: number, y: number, r: number): boolean {
    return this.sample(this.base, x, y) >= r;
  }

  private gradient(x: number, y: number): void {
    const h = 0.25;
    const f = this.clear;
    const gx = this.sample(f, x + h, y) - this.sample(f, x - h, y);
    const gy = this.sample(f, x, y + h) - this.sample(f, x, y - h);
    const l = Math.hypot(gx, gy);
    if (l < 1e-6) {
      this.gx = 0;
      this.gy = 0;
    } else {
      this.gx = gx / l;
      this.gy = gy / l;
    }
  }

  private trace(field: Float32Array, ax: number, ay: number, bx: number, by: number, r: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return this.sample(field, ax, ay) >= r;
    const ux = dx / d;
    const uy = dy / d;
    let t = 0;
    for (;;) {
      const c = this.sample(field, ax + ux * t, ay + uy * t);
      if (c < r) return false;
      if (t >= d) return true;
      // 距离场近似 1-Lipschitz：净空有多大就能放心前进多远
      const adv = (c - r) * 0.9;
      t += adv > 0.2 ? adv : 0.2;
      if (t > d) t = d;
    }
  }

  /** 半径 r 的单位能否沿线段 a→b 直线通过（含建筑） */
  segmentFree(ax: number, ay: number, bx: number, by: number, r: number): boolean {
    return this.trace(this.clear, ax, ay, bx, by, r);
  }

  /** 视线检测：a→b 之间是否没有墙体遮挡（不考虑建筑） */
  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    return this.trace(this.base, ax, ay, bx, by, 0);
  }

  // ───────────────────────── 建筑障碍 ─────────────────────────

  private stamp(o: Obstacle, minIx: number, minIy: number, maxIx: number, maxIy: number): void {
    const n = this.n;
    const reach = o.r + OBSTACLE_REACH;
    const x0 = Math.max(minIx, Math.floor((o.x - reach + EXTENT) * INV));
    const x1 = Math.min(maxIx, Math.ceil((o.x + reach + EXTENT) * INV));
    const y0 = Math.max(minIy, Math.floor((o.y - reach + EXTENT) * INV));
    const y1 = Math.min(maxIy, Math.ceil((o.y + reach + EXTENT) * INV));
    for (let iy = y0; iy <= y1; iy++) {
      const dy = -EXTENT + iy * NAV_CELL - o.y;
      for (let ix = x0; ix <= x1; ix++) {
        const dx = -EXTENT + ix * NAV_CELL - o.x;
        const d = Math.hypot(dx, dy) - o.r;
        const i = iy * n + ix;
        if (d < this.clear[i]) this.clear[i] = d;
      }
    }
  }

  /** 加入一个圆形障碍（存活的塔/水晶） */
  addObstacle(id: number, x: number, y: number, r: number): void {
    const o: Obstacle = { id, x, y, r };
    this.obstacles.push(o);
    this.stamp(o, 0, 0, this.n - 1, this.n - 1);
  }

  /** 移除障碍（建筑被毁）：局部恢复为静态地形，再把仍然存活的障碍叠回去 */
  removeObstacle(id: number): void {
    const idx = this.obstacles.findIndex((o) => o.id === id);
    if (idx < 0) return;
    const o = this.obstacles[idx];
    this.obstacles.splice(idx, 1);
    const n = this.n;
    const reach = o.r + OBSTACLE_REACH;
    const x0 = Math.max(0, Math.floor((o.x - reach + EXTENT) * INV));
    const x1 = Math.min(n - 1, Math.ceil((o.x + reach + EXTENT) * INV));
    const y0 = Math.max(0, Math.floor((o.y - reach + EXTENT) * INV));
    const y1 = Math.min(n - 1, Math.ceil((o.y + reach + EXTENT) * INV));
    for (let iy = y0; iy <= y1; iy++) {
      const row = iy * n;
      for (let ix = x0; ix <= x1; ix++) this.clear[row + ix] = this.base[row + ix];
    }
    for (const other of this.obstacles) this.stamp(other, x0, y0, x1, y1);
  }

  // ───────────────────────── 碰撞移动 ─────────────────────────

  /**
   * 让半径 r 的单位从 pos 位移 (dx, dy)，遇墙沿墙面滑动，绝不进入墙体。pos 就地修改。
   * 返回是否发生了位移。
   */
  moveWithCollision(pos: Vec2, dx: number, dy: number, r: number): boolean {
    const total = Math.hypot(dx, dy);
    if (total < 1e-9) return false;
    const steps = total > MAX_STEP ? Math.ceil(total / MAX_STEP) : 1;
    const sx = dx / steps;
    const sy = dy / steps;
    let moved = false;
    for (let i = 0; i < steps; i++) {
      if (!this.stepOnce(pos, sx, sy, r)) break;
      moved = true;
    }
    return moved;
  }

  private stepOnce(pos: Vec2, sx: number, sy: number, r: number): boolean {
    const f = this.clear;
    let nx = pos.x + sx;
    let ny = pos.y + sy;
    let c = this.sample(f, nx, ny);
    if (c >= r) {
      pos.x = nx;
      pos.y = ny;
      return true;
    }
    // 目标点侵入了墙：沿距离场梯度把它推回可走区 —— 效果就是贴着墙面滑动
    for (let it = 0; it < 3; it++) {
      this.gradient(nx, ny);
      if (this.gx === 0 && this.gy === 0) break;
      const push = r - c + 0.004;
      nx += this.gx * push;
      ny += this.gy * push;
      c = this.sample(f, nx, ny);
      if (c >= r) {
        pos.x = nx;
        pos.y = ny;
        return true;
      }
    }
    // 凹角等梯度不可靠的地方：退化为分轴尝试
    if (sx !== 0 && this.sample(f, pos.x + sx, pos.y) >= r) {
      pos.x += sx;
      return true;
    }
    if (sy !== 0 && this.sample(f, pos.x, pos.y + sy) >= r) {
      pos.y += sy;
      return true;
    }
    return false;
  }

  /**
   * 沿单位方向 (ux, uy) 直线前进至多 dist，撞墙即停（不滑动，用于冲刺位移）。
   * pos 就地修改，返回实际前进的距离。
   */
  moveStraight(pos: Vec2, ux: number, uy: number, dist: number, r: number): number {
    const f = this.clear;
    // 冲刺对「贴墙起步」宽容一点，否则擦着墙放位移会原地不动
    const rr = r - 0.05;
    let t = 0;
    while (t < dist) {
      const step = Math.min(0.2, dist - t);
      if (this.sample(f, pos.x + ux * (t + step), pos.y + uy * (t + step)) < rr) break;
      t += step;
    }
    pos.x += ux * t;
    pos.y += uy * t;
    return t;
  }

  // ───────────────────────── 最近可走点 ─────────────────────────

  private nearestNode(x: number, y: number, r: number, maxRing: number): number {
    const n = this.n;
    const f = this.clear;
    let cx = Math.round((x + EXTENT) * INV);
    let cy = Math.round((y + EXTENT) * INV);
    cx = cx < 0 ? 0 : cx > n - 1 ? n - 1 : cx;
    cy = cy < 0 ? 0 : cy > n - 1 ? n - 1 : cy;
    if (f[cy * n + cx] >= r) return cy * n + cx;
    let best = -1;
    let bestD = Infinity;
    let foundRing = -1;
    for (let ring = 1; ring <= maxRing; ring++) {
      // 找到后再多扫两圈：方形环上的最近点不一定是欧氏距离最近的
      if (foundRing >= 0 && ring > foundRing + 2) break;
      const x0 = cx - ring;
      const x1 = cx + ring;
      const y0 = cy - ring;
      const y1 = cy + ring;
      for (let iy = y0; iy <= y1; iy++) {
        if (iy < 0 || iy >= n) continue;
        const edgeRow = iy === y0 || iy === y1;
        const stepX = edgeRow ? 1 : x1 - x0;
        for (let ix = x0; ix <= x1; ix += stepX) {
          if (ix < 0 || ix >= n) continue;
          const i = iy * n + ix;
          if (f[i] < r) continue;
          const px = -EXTENT + ix * NAV_CELL - x;
          const py = -EXTENT + iy * NAV_CELL - y;
          const d = px * px + py * py;
          if (d < bestD) {
            bestD = d;
            best = i;
            if (foundRing < 0) foundRing = ring;
          }
        }
      }
    }
    return best;
  }

  /**
   * 离 (x, y) 最近的、半径 r 可站立的点，写入 out。本身可站则原样返回。
   * maxDist 内找不到返回 false（out 不变）。
   */
  nearestFree(x: number, y: number, r: number, out: Vec2, maxDist = 12): boolean {
    if (this.sample(this.clear, x, y) >= r) {
      out.x = x;
      out.y = y;
      return true;
    }
    const node = this.nearestNode(x, y, r + 0.02, Math.ceil(maxDist * INV));
    if (node < 0) return false;
    out.x = -EXTENT + (node % this.n) * NAV_CELL;
    out.y = -EXTENT + Math.floor(node / this.n) * NAV_CELL;
    return true;
  }

  // ───────────────────────── A* ─────────────────────────

  private heapPush(node: number, key: number): void {
    const hn = this.heapNode;
    const hk = this.heapKey;
    let i = this.heapSize++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= key) break;
      hn[i] = hn[p];
      hk[i] = hk[p];
      i = p;
    }
    hn[i] = node;
    hk[i] = key;
  }

  private heapPop(): number {
    const hn = this.heapNode;
    const hk = this.heapKey;
    const top = hn[0];
    const size = --this.heapSize;
    if (size > 0) {
      const node = hn[size];
      const key = hk[size];
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= size) break;
        if (c + 1 < size && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= key) break;
        hn[i] = hn[c];
        hk[i] = hk[c];
        i = c;
      }
      hn[i] = node;
      hk[i] = key;
    }
    return top;
  }

  /**
   * 为半径 r 的单位规划 (sx,sy)→(gx,gy) 的路径。返回拉直后的路点(不含起点)。
   * avoid = 这次搜索额外的禁行圆；heurW = 启发权重(越大搜索越贪心、展开节点越少，路径可能略绕)。
   * 终点不可走时走到离它最近的可走点；完全不连通时返回尽量靠近终点的部分路径；起点无处可走返回 null。
   */
  findPath(sx: number, sy: number, gx: number, gy: number, r: number, avoid?: readonly AvoidZone[], heurW = HEUR_W): Vec2[] | null {
    const n = this.n;
    const f = this.clear;
    const rp = r + PATH_MARGIN;
    // 额外的禁行圆(如敌方防御塔的射程)：只影响这一次搜索，不改净空图
    const zones = avoid && avoid.length > 0 ? avoid : null;
    const start = this.nearestNode(sx, sy, rp, 8);
    const goal = this.nearestNode(gx, gy, rp, 40);
    if (start < 0 || goal < 0) return null;
    this.stats.searches++;

    const goalX = goal % n;
    const goalY = (goal / n) | 0;
    const gen = ++this.gen;
    const g = this.gScore;
    const parent = this.parent;
    const opened = this.opened;
    const closed = this.closed;
    const cap = this.heapNode.length - 8;
    this.heapSize = 0;

    g[start] = 0;
    parent[start] = -1;
    opened[start] = gen;
    this.heapPush(start, 0);
    let found = start === goal;
    let bestNode = start;
    let bestH = Infinity;
    let expansions = 0;

    while (!found && this.heapSize > 0) {
      const cur = this.heapPop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expansions > MAX_EXPANSIONS || this.heapSize > cap) break;
      const cx = cur % n;
      const cy = (cur / n) | 0;
      const cg = g[cur];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= n) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= n) continue;
          const ni = ny * n + nx;
          if (closed[ni] === gen || f[ni] < rp) continue;
          if (zones && inZones(zones, -EXTENT + nx * NAV_CELL, -EXTENT + ny * NAV_CELL)) continue;
          const diag = dx !== 0 && dy !== 0;
          // 防穿角：斜走要求两个正交邻格都可走
          if (diag && (f[cy * n + nx] < rp || f[ny * n + cx] < rp)) continue;
          const ng = cg + (diag ? SQRT2 : 1);
          if (opened[ni] === gen && ng >= g[ni]) continue;
          g[ni] = ng;
          parent[ni] = cur;
          opened[ni] = gen;
          const hx = nx > goalX ? nx - goalX : goalX - nx;
          const hy = ny > goalY ? ny - goalY : goalY - ny;
          const h = hx > hy ? hx + hy * (SQRT2 - 1) : hy + hx * (SQRT2 - 1);
          if (h < bestH) {
            bestH = h;
            bestNode = ni;
          }
          this.heapPush(ni, ng + h * heurW);
        }
      }
    }
    this.stats.expansions += expansions;
    this.lastPathPartial = !found;

    // 回溯节点序列（终点 → 起点）
    const buf = this.nodeBuf;
    let count = 0;
    for (let node = found ? goal : bestNode; node >= 0; node = parent[node]) buf[count++] = node;

    // 候选路点：节点序列(起点→终点) + 真实终点
    const pts: Vec2[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const node = buf[i];
      pts.push({ x: -EXTENT + (node % n) * NAV_CELL, y: -EXTENT + ((node / n) | 0) * NAV_CELL });
    }
    if (found && this.sample(f, gx, gy) >= r) {
      const last = pts[pts.length - 1];
      if (this.trace(f, last.x, last.y, gx, gy, r)) pts.push({ x: gx, y: gy });
    }

    // 视线拉直：从锚点出发贪心跳到能直达的最远路点
    const out: Vec2[] = [];
    let ax = sx;
    let ay = sy;
    let i = 0;
    const m = pts.length;
    while (i < m) {
      let j = i;
      for (let k = i + 1; k < m; k++) {
        if (!this.trace(f, ax, ay, pts[k].x, pts[k].y, rp)) break;
        if (zones && segmentHitsZones(zones, ax, ay, pts[k].x, pts[k].y)) break;
        j = k;
      }
      out.push(pts[j]);
      ax = pts[j].x;
      ay = pts[j].y;
      i = j + 1;
    }
    return out;
  }
}

/** findPath 的额外禁行圆 */
export interface AvoidZone {
  x: number;
  y: number;
  r: number;
}

function inZones(zones: readonly AvoidZone[], x: number, y: number): boolean {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const dx = x - z.x;
    const dy = y - z.y;
    if (dx * dx + dy * dy < z.r * z.r) return true;
  }
  return false;
}

/** 线段 a→b 是否穿过任何一个禁行圆 */
export function segmentHitsZones(zones: readonly AvoidZone[], ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    let t = len2 > 1e-9 ? ((z.x - ax) * dx + (z.y - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t - z.x;
    const cy = ay + dy * t - z.y;
    if (cx * cx + cy * cy < z.r * z.r) return true;
  }
  return false;
}

/** 路径总长（含从 from 到第一个路点） */
export function pathLength(from: Vec2, path: Vec2[]): number {
  let total = 0;
  let px = from.x;
  let py = from.y;
  for (const p of path) {
    total += Math.hypot(p.x - px, p.y - py);
    px = p.x;
    py = p.y;
  }
  return total;
}
