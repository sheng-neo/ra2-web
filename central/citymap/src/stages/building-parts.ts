/**
 * 02b-building-parts：地政总署「可視化三維地圖（無紋理模型）」→ Building.parts（LOD2 叠层棱柱，见 @central/data schema）。
 *
 * 输入是 fetch/landsd_3d_fetch.py 派生的快照 landsd-3dvm-parts.json.gz：每栋 3D 楼的各层屋面轮廓
 * （第 k 层 = 高度 ≥ 第 k 层的全部屋面投影的并集，已去掉 ≤ 0.5 m 宽的女儿墙 / 栏杆、坡屋顶切成约 1 m 台阶）。
 * 这一阶段只碰本地 dm，全部是确定性的整数 / 栅格运算：
 *
 * 1. 匹配：每个 3D 模型找一栋 2D 楼（地政总署 Building，含被地标替换掉的楼）：覆盖 IoU ≥ 0.5，或一方 ≥ 80 % 落在另一方里；
 *    且模型主屋面（面积 ≥ 25 % 的最高一层）与 2D 楼顶相符（不高出 max(15 m, 30 % 楼高)、不低于 max(15 m, 50 % 楼高)）；
 *    候选里取「IoU − 0.02 × |模型最低点 − 楼底| − 0.01 × |主屋面 − 2D 楼顶|（米）」最大的
 *    （塔楼模型从裙楼顶起，裙楼模型从地面起：靠楼底与楼顶分开）。
 *    匹配到地标原型楼（已删除）的模型直接丢掉，不会转嫁给旁边的裙楼；没匹配上的模型丢掉。
 * 2. 每栋有模型的楼，在 0.4 m 网格上（footprint 外包框；特大的楼 0.5 m）求「最高屋面高度」：各模型各层取 max，裁到 footprint 里；
 *    压在本楼上的别的 2D 楼（塔楼立在裙楼上）的轮廓里，本楼最高只到那栋楼的楼底；
 *    footprint 里模型没盖到的格按邻格向外延伸（2D 轮廓比 3D 稍大的边条），仍够不着的取最低一层；
 *    与地标轮廓、敏感区重叠的格压到最低一层（地标周围不长出真楼的造型）。模型覆盖不到 footprint 的 60 % 时不出 parts。
 * 3. 合层：高度升序成串，相邻差 < 1.5 m 且串长 < 2.5 m 的归一层（坡屋顶、塔冠变成 2–3 m 的台阶），
 *    代表高度取面积加权中位数；再把相邻代表高度差 < 1.5 m 的层并掉。
 * 4. 去碎块：每层累积掩膜里 < 4 m²、或露出墙面（周长 × 抬升）< 80 m² 的 4 连通块降到下一层（高出下层 ≥ 6 m、≥ 0.5 m² 的桅杆保留）；
 *    露出部分平均宽度 < 1 m 的窄边条层并到上一层；
 *    块数（底座 + 各层各连通块）> 12 时，反复把「墙面积」（周长 × 抬升）最小的层并到下一层。
 * 5. 轮廓：每层（k ≥ 1）掩膜沿格边追踪 → Douglas–Peucker 0.5 m（每环超过 16 点时放大容差；栅格切出的墙角小斜边还原成直角）→ 离 footprint 边 ≤ 0.5 m 的顶点吸到边上
 *    （与底座共面的墙严丝合缝，立面窗格连续）→ 外环 CCW、洞 CW。底座 parts[0] 不存环（就是 footprint）。
 * 敏感区里的楼（质心或任一顶点在区内）不出 parts。
 */
import { gunzipSync } from 'node:zlib';
import type { Building, BuildingPart, FlatXY, LandmarkPlacement, SensitiveZone } from '@central/data';
import { components, fillRings, fillSpans, gridFor, insideRing, rasterRings, ringsBounds, traceMask } from '../geo/mask';
import { dedupeRing, pointInRing, ringArea, ringCentroid, ringSimple, ringsTouch, signedArea2, simplifyRing } from '../geo/ring';
import { gridToLocal } from './project';

export const LANDSD_3D_FILE = 'landsd-3dvm-parts.json.gz';

/** 参数（dm、dm²）。 */
export const PARTS = {
  /** 合成网格边长（0.4 m；外包框超过 maxCells 格时用 0.5 m）。 */
  cell: 4,
  bigCell: 5,
  maxCells: 300_000,
  /** 两层之间至少高出（1.5 m）。 */
  minRise: 15,
  /** 同一层的高度跨度上限（2.5 m：坡屋顶 / 塔冠切成 2–3 m 台阶）。 */
  step: 25,
  /** 块顶至少高出楼底（2.5 m，与客户端的最矮楼高一致）。 */
  minHeight: 25,
  /** 窄边条：某层露出部分的平均宽度（面积 ÷ 该层轮廓周长）< 1 m 时并到上一层（檐口、窗台、塔楼脚下的窄台）。 */
  ledge: 10,
  /** 每块最小面积（4 m²）。 */
  minArea: 400,
  /** 桅杆：高出下层 ≥ 6 m、面积 ≥ 0.5 m² 的小块保留。 */
  spireRise: 60,
  spireArea: 50,
  /** 小块露出的墙面积（周长 × 高出下层）< 80 m² 的并到下一层（桅杆除外）：远看不出来，三角形却不少。 */
  minWall: 8000,
  /** 每栋最多块数（含底座）。 */
  maxParts: 12,
  /** 轮廓简化容差（0.5 m）；简化后仍多于 maxVerts 个点时容差逐次 ×1.5（最多 4 m）。 */
  simplify: 5,
  maxVerts: 16,
  /** 栅格切出的墙角小斜边（< 1.2 m）还原成直角。 */
  corner: 12,
  /** 顶点吸附到 footprint 边的距离（0.5 m）。 */
  snap: 5,
  /** 模型至少盖住 footprint 的这个比例才出 parts。 */
  minCover: 0.6,
  /** 匹配：IoU 门槛、包含门槛、楼底差罚分（每米）、匹配网格（0.5 m）。 */
  matchIou: 0.5,
  matchContain: 0.8,
  basePenaltyPerM: 0.02,
  matchCell: 5,
  /** 高度一致：模型主屋面（面积 ≥ 25 % 的最高一层）不得高出 2D 楼顶 max(15 m, 30 % 楼高)、不得低于 max(15 m, 50 % 楼高)；
   *  分数再按两者之差每米扣 0.01。 */
  mainShare: 0.25,
  topSlack: 150,
  topOver: 0.3,
  topUnder: 0.5,
  topPenaltyPerM: 0.01,
} as const;

/** 快照里的一栋 3D 楼（坐标已换成本地 dm）。 */
export interface Model3d {
  id: string;
  /** 模型最低点（dm，mPD）。 */
  base: number;
  /** 各层（top 升序）：polys 为 [外环, ...洞] 的列表。第 k 层 = 高度 ≥ top 的全部屋面投影。 */
  levels: { top: number; polys: FlatXY[][] }[];
}

interface SnapshotDoc {
  format: string;
  version: number;
  models: { id: string; sheet: string; base: number; levels: { top: number; polys: number[][][] }[] }[];
}

/** 快照 JSON → Model3d[]（HK1980 米 → 本地 dm 只经 project.gridToLocal）。 */
export function parseModels(doc: SnapshotDoc): Model3d[] {
  if (doc.format !== 'central-3dvm-parts' || doc.version !== 1) throw new Error(`${LANDSD_3D_FILE}: 格式不符`);
  return doc.models.map((m) => ({
    id: m.id,
    base: m.base,
    levels: m.levels.map((lv) => ({
      top: lv.top,
      polys: lv.polys.map((poly) =>
        poly.map((ring) => {
          const out: FlatXY = [];
          for (let i = 0; i < ring.length; i += 2) out.push(...gridToLocal(ring[i]!, ring[i + 1]!));
          return dedupeRing(out);
        }),
      ),
    })),
  }));
}

/** 从快照文件表读模型；文件不在快照里时返回空表（管线照旧出平顶楼）。 */
export function readModels(files: ReadonlyMap<string, Uint8Array>): Model3d[] {
  const gz = files.get(LANDSD_3D_FILE);
  if (!gz) return [];
  return parseModels(JSON.parse(gunzipSync(gz).toString('utf8')) as SnapshotDoc);
}

// ---------------------------------------------------------------- 匹配

/** 多边形列表（[外环, ...洞]）的面积（dm²）。 */
function polysArea(polys: readonly FlatXY[][]): number {
  let a = 0;
  for (const p of polys) {
    a += ringArea(p[0]!);
    for (const h of p.slice(1)) a -= ringArea(h);
  }
  return a;
}

function footprintRings(b: Building): FlatXY[] {
  return [b.footprint.outer, ...(b.footprint.holes ?? [])];
}

function footprintArea(b: Building): number {
  return ringArea(b.footprint.outer) - (b.footprint.holes ?? []).reduce((s, h) => s + ringArea(h), 0);
}

export interface Overlap {
  /** 交集、模型、楼的面积（dm²）。 */
  inter: number;
  a3: number;
  a2: number;
}

/** 模型第 0 层（全部屋面）与楼轮廓的重叠（0.5 m 网格计数）。 */
export function overlapOf(model: Model3d, b: Building): Overlap {
  const mr = model.levels[0]!.polys.flat();
  const fr = footprintRings(b);
  const [ax0, ay0, ax1, ay1] = ringsBounds(mr);
  const [bx0, by0, bx1, by1] = ringsBounds([b.footprint.outer]);
  const a3 = polysArea(model.levels[0]!.polys);
  const a2 = footprintArea(b);
  const lo = [Math.max(ax0, bx0), Math.max(ay0, by0), Math.min(ax1, bx1), Math.min(ay1, by1)] as const;
  if (lo[0] >= lo[2] || lo[1] >= lo[3]) return { inter: 0, a3, a2 };
  const g = gridFor(lo, PARTS.matchCell, 1);
  const m = rasterRings(g, mr);
  let n = 0;
  fillRings(g, fr, (k) => {
    n += m[k]!;
  });
  return { inter: n * g.cell * g.cell, a3, a2 };
}

/** 模型主屋面（dm）：轮廓面积 ≥ 第 0 层 25 % 的最高一层（塔冠、桅杆、机房通常小于它）。 */
export function mainTop(m: Model3d): number {
  const a0 = polysArea(m.levels[0]!.polys);
  let top = m.levels[0]!.top;
  for (const lv of m.levels) if (polysArea(lv.polys) >= a0 * PARTS.mainShare) top = Math.max(top, lv.top);
  return top;
}

/**
 * 模型 → 楼的匹配分数；不够格时为 null。
 * 够格：覆盖（IoU 或包含）够，且（楼高不是估算时）模型主屋面与 2D 楼顶相符——裙楼不会拿到压在它上面的塔楼模型，
 * 塔楼也不会拿到脚下的裙楼模型。分数 = IoU − 楼底差罚分 − 楼顶差罚分。
 */
export function matchScore(o: Overlap, m: Pick<Model3d, 'base'> & { mainTop: number }, b: Building): number | null {
  if (o.inter <= 0) return null;
  const iou = o.inter / (o.a3 + o.a2 - o.inter);
  const ok = iou >= PARTS.matchIou || o.inter / o.a3 >= PARTS.matchContain || o.inter / o.a2 >= PARTS.matchContain;
  if (!ok) return null;
  const top2 = b.base + b.height;
  if (b.heightSource !== 'heuristic') {
    if (m.mainTop > top2 + Math.max(PARTS.topSlack, PARTS.topOver * b.height)) return null;
    if (m.mainTop < top2 - Math.max(PARTS.topSlack, PARTS.topUnder * b.height)) return null;
  }
  return (
    iou -
    (PARTS.basePenaltyPerM * Math.abs(m.base - b.base)) / 10 -
    (PARTS.topPenaltyPerM * Math.abs(m.mainTop - top2)) / 10
  );
}

/** 空间哈希（100 m 格）：外包框相交的候选。 */
class BoxIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly boxes: [number, number, number, number][] = [];
  private static readonly CELL = 1000;
  add(box: [number, number, number, number]): void {
    const id = this.boxes.length;
    this.boxes.push(box);
    this.each(box, (k) => {
      const c = this.cells.get(k);
      if (c) c.push(id);
      else this.cells.set(k, [id]);
    });
  }
  query(box: readonly [number, number, number, number]): number[] {
    const seen = new Set<number>();
    this.each(box, (k) => {
      for (const id of this.cells.get(k) ?? []) {
        const b = this.boxes[id]!;
        if (b[0] <= box[2] && box[0] <= b[2] && b[1] <= box[3] && box[1] <= b[3]) seen.add(id);
      }
    });
    return [...seen].sort((a, b) => a - b);
  }
  private each(box: readonly [number, number, number, number], f: (k: number) => void): void {
    const C = BoxIndex.CELL;
    for (let gx = Math.floor(box[0] / C); gx <= Math.floor(box[2] / C); gx++) {
      for (let gy = Math.floor(box[1] / C); gy <= Math.floor(box[3] / C); gy++) f(gx * 65536 + gy);
    }
  }
}

/** 每个模型匹配到的楼下标（buildings 里）；没匹配上为 −1。 */
export function matchModels(models: readonly Model3d[], buildings: readonly Building[]): number[] {
  const index = new BoxIndex();
  for (const b of buildings) index.add(ringsBounds([b.footprint.outer]));
  return models.map((m) => {
    if (m.levels.length === 0) return -1;
    const mt = { base: m.base, mainTop: mainTop(m) };
    let best = -1;
    let bestScore = -Infinity;
    for (const k of index.query(ringsBounds(m.levels[0]!.polys.flat()))) {
      const b = buildings[k]!;
      const s = matchScore(overlapOf(m, b), mt, b);
      if (s === null) continue;
      if (s > bestScore || (s === bestScore && best >= 0 && b.id < buildings[best]!.id)) {
        bestScore = s;
        best = k;
      }
    }
    return best;
  });
}

// ---------------------------------------------------------------- 合层

/**
 * 高度直方图（升序的 [高度 dm, 格数]）→ 每个高度的层号与各层代表高度。
 * 相邻差 < minRise 且串长 < step 的成一串，代表高度取面积加权中位数；再并掉代表高度差 < minRise 的相邻层
 * （并到面积大的一方的高度）。
 */
export function clusterLevels(hist: readonly (readonly [number, number])[]): { levelOf: number[]; tops: number[] } {
  const groups: { members: number[]; rep: number; area: number }[] = [];
  let cur: number[] = [];
  const close = () => {
    if (cur.length === 0) return;
    const area = cur.reduce((s, i) => s + hist[i]![1], 0);
    let acc = 0;
    let rep = hist[cur[0]!]![0];
    for (const i of cur) {
      acc += hist[i]![1];
      if (acc * 2 >= area) {
        rep = hist[i]![0];
        break;
      }
    }
    groups.push({ members: cur, rep, area });
    cur = [];
  };
  for (let i = 0; i < hist.length; i++) {
    if (cur.length > 0) {
      const h = hist[i]![0];
      const prev = hist[cur[cur.length - 1]!]![0];
      const start = hist[cur[0]!]![0];
      if (h - prev >= PARTS.minRise || h - start >= PARTS.step) close();
    }
    cur.push(i);
  }
  close();
  // 并掉相邻差 < minRise 的层：每次并差最小的一对
  for (;;) {
    let k = -1;
    let d = Infinity;
    for (let i = 1; i < groups.length; i++) {
      const r = groups[i]!.rep - groups[i - 1]!.rep;
      if (r < PARTS.minRise && r < d) {
        d = r;
        k = i;
      }
    }
    if (k < 0) break;
    const a = groups[k - 1]!;
    const b = groups[k]!;
    groups.splice(k - 1, 2, { members: [...a.members, ...b.members], rep: a.area >= b.area ? a.rep : b.rep, area: a.area + b.area });
  }
  const levelOf = new Array<number>(hist.length).fill(0);
  groups.forEach((g, k) => {
    for (const i of g.members) levelOf[i] = k;
  });
  return { levelOf, tops: groups.map((g) => g.rep) };
}

// ---------------------------------------------------------------- 每栋楼

const NONE = -0x7fffffff;

/** 各分量的周长（格边数，内部边不算），下标即标号。 */
function perimeters(labels: Int32Array, count: number, nx: number): number[] {
  const p = new Array<number>(count).fill(0);
  const n = labels.length;
  for (let k = 0; k < n; k++) {
    const id = labels[k]!;
    if (!id) continue;
    const i = k % nx;
    if (i === 0 || labels[k - 1] !== id) p[id]!++;
    if (i === nx - 1 || labels[k + 1] !== id) p[id]!++;
    if (k < nx || labels[k - nx] !== id) p[id]!++;
    if (k + nx >= n || labels[k + nx] !== id) p[id]!++;
  }
  return p;
}

/** 裁到外包框的层掩膜：at(q) 把子网格下标换回整张网格的下标。 */
interface Sub {
  m: Uint8Array;
  w: number;
  h: number;
  i0: number;
  j0: number;
  at: (q: number) => number;
}

/** 顶点吸附：离 footprint 任一顶点 ≤ snap 时吸到顶点，否则离任一边 ≤ snap 时投到边上。 */
export function snapRing(r: FlatXY, rings: readonly FlatXY[], snap: number): FlatXY {
  const out: FlatXY = [];
  for (let i = 0; i < r.length; i += 2) {
    const x = r[i]!;
    const y = r[i + 1]!;
    let bx = x;
    let by = y;
    let bestV = snap * snap;
    let bestE = snap * snap;
    let vx = NaN;
    let vy = NaN;
    for (const f of rings) {
      const n = f.length >> 1;
      for (let a = 0; a < n; a++) {
        const b = (a + 1) % n;
        const ax = f[2 * a]!;
        const ay = f[2 * a + 1]!;
        const dv = (x - ax) ** 2 + (y - ay) ** 2;
        if (dv <= bestV) {
          bestV = dv;
          vx = ax;
          vy = ay;
        }
        const ex = f[2 * b]! - ax;
        const ey = f[2 * b + 1]! - ay;
        const l2 = ex * ex + ey * ey;
        if (l2 === 0) continue;
        const t = ((x - ax) * ex + (y - ay) * ey) / l2;
        if (t < 0 || t > 1) continue;
        const px = ax + t * ex;
        const py = ay + t * ey;
        const de = (x - px) ** 2 + (y - py) ** 2;
        if (de < bestE) {
          bestE = de;
          bx = px;
          by = py;
        }
      }
    }
    if (!Number.isNaN(vx)) out.push(vx, vy);
    else out.push(Math.round(bx), Math.round(by));
  }
  return dropCollinear(dedupeRing(out));
}

/** Douglas–Peucker，点数超过 maxVerts 时放大容差再来（圆塔等曲线轮廓）。 */
function simplifyCapped(r: FlatXY, ok?: (x: number, y: number) => boolean): FlatXY {
  let tol: number = PARTS.simplify;
  let s = squareCorners(simplifyRing(r, tol), PARTS.corner, ok);
  while (s.length > PARTS.maxVerts * 2 && tol < 40) {
    tol *= 1.5;
    s = squareCorners(simplifyRing(r, tol), PARTS.corner, ok);
  }
  return s;
}

/** 点在环内，或离环边 ≤ d。 */
function withinRing(x: number, y: number, r: FlatXY, d: number): boolean {
  if (insideRing(x, y, r)) return true;
  const n = r.length >> 1;
  for (let a = 0; a < n; a++) {
    const b = (a + 1) % n;
    const ax = r[2 * a]!;
    const ay = r[2 * a + 1]!;
    const ex = r[2 * b]! - ax;
    const ey = r[2 * b + 1]! - ay;
    const l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
    if ((x - ax - t * ex) ** 2 + (y - ay - t * ey) ** 2 <= d * d) return true;
  }
  return false;
}

/**
 * 还原被栅格切掉的墙角：夹在两条长边之间、短于 corner 的小斜边，换成两条长边延长线的交点
 * （交点离小斜边中点 ≤ corner、两边夹角 > 30°、且 ok(交点) 时——管线里要求交点不出 footprint 0.5 m）。
 * 屋面轮廓多是直角，切角会多出点、也不好看。
 */
export function squareCorners(r: FlatXY, corner: number = PARTS.corner, ok?: (x: number, y: number) => boolean): FlatXY {
  let cur = r;
  for (let pass = 0; pass < 8; pass++) {
    const n = cur.length >> 1;
    if (n <= 4) return cur;
    const P = (i: number): [number, number] => [cur[2 * ((i + n) % n)]!, cur[2 * ((i + n) % n) + 1]!];
    let done = -1;
    let hit: [number, number] = [0, 0];
    for (let i = 0; i < n && done < 0; i++) {
      const [ax, ay] = P(i - 1);
      const [bx, by] = P(i);
      const [cx, cy] = P(i + 1);
      const [dx, dy] = P(i + 2);
      const short = Math.hypot(cx - bx, cy - by);
      const la = Math.hypot(bx - ax, by - ay);
      const lb = Math.hypot(dx - cx, dy - cy);
      if (short >= corner || la <= short || lb <= short) continue;
      // 直线 A：a→b，直线 B：c→d
      const ux = (bx - ax) / la;
      const uy = (by - ay) / la;
      const vx = (dx - cx) / lb;
      const vy = (dy - cy) / lb;
      const den = ux * vy - uy * vx;
      if (Math.abs(den) < Math.sin((30 * Math.PI) / 180)) continue;
      const t = ((cx - bx) * vy - (cy - by) * vx) / den;
      const hx = bx + ux * t;
      const hy = by + uy * t;
      if (Math.hypot(hx - (bx + cx) / 2, hy - (by + cy) / 2) > corner) continue;
      if (ok && !ok(hx, hy)) continue;
      done = i;
      hit = [Math.round(hx), Math.round(hy)];
    }
    if (done < 0) return cur;
    const out: FlatXY = [];
    for (let k = 0; k < n; k++) {
      if (k === (done + 1) % n) continue;
      if (k === done) out.push(hit[0], hit[1]);
      else out.push(cur[2 * k]!, cur[2 * k + 1]!);
    }
    cur = dedupeRing(out);
  }
  return cur;
}

/** 去掉共线点（叉积为 0）。 */
function dropCollinear(r: FlatXY): FlatXY {
  let cur = r;
  for (let pass = 0; pass < 4; pass++) {
    const n = cur.length >> 1;
    if (n < 4) return cur;
    const out: FlatXY = [];
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n;
      const b = (i + 1) % n;
      const cross =
        (cur[2 * i]! - cur[2 * a]!) * (cur[2 * b + 1]! - cur[2 * a + 1]!) -
        (cur[2 * i + 1]! - cur[2 * a + 1]!) * (cur[2 * b]! - cur[2 * a]!);
      if (cross !== 0) out.push(cur[2 * i]!, cur[2 * i + 1]!);
    }
    if (out.length === cur.length) return out;
    cur = out;
  }
  return cur;
}

export interface DeriveOptions {
  /** 不许长出体块的区域（地标轮廓、敏感区）。 */
  exclude?: readonly FlatXY[][];
  /** 压在本楼上的别的 2D 楼（塔楼立在裙楼上）：它的轮廓里本楼最高只到它的楼底，免得两栋楼的体块重叠、屋面打架。 */
  caps?: readonly { rings: readonly FlatXY[]; z: number }[];
}

/** 一栋楼 + 匹配到的模型 → parts（不足两层或覆盖不够时 undefined）。 */
export function deriveParts(b: Building, models: readonly Model3d[], opts: DeriveOptions = {}): BuildingPart[] | undefined {
  if (models.length === 0) return undefined;
  const fr = footprintRings(b);
  const bounds = ringsBounds([b.footprint.outer]);
  const big = ((bounds[2] - bounds[0]) * (bounds[3] - bounds[1])) / (PARTS.cell * PARTS.cell) > PARTS.maxCells;
  const g = gridFor(bounds, big ? PARTS.bigCell : PARTS.cell, 2);
  const n = g.nx * g.ny;
  const F = rasterRings(g, fr);
  const H = new Int32Array(n).fill(NONE);
  for (const m of models) {
    for (const lv of m.levels) {
      for (const poly of lv.polys) {
        // 不低于楼底 + 2.5 m（下沉庭院等低于 2D 楼底的面当作矮台）
        const top = Math.max(lv.top, b.base + PARTS.minHeight);
        fillSpans(g, poly, (k0, k1) => {
          for (let k = k0; k <= k1; k++) if (F[k] && H[k]! < top) H[k] = top;
        });
      }
    }
  }
  for (const c of opts.caps ?? []) {
    const z = Math.max(c.z, b.base + PARTS.minHeight);
    fillSpans(g, c.rings, (k0, k1) => {
      for (let k = k0; k <= k1; k++) if (H[k]! > z) H[k] = z;
    });
  }
  const X = new Uint8Array(n);
  for (const rings of opts.exclude ?? []) {
    fillSpans(g, rings, (k0, k1) => X.fill(1, k0, k1 + 1));
  }
  let inside = 0;
  let covered = 0;
  for (let k = 0; k < n; k++) {
    if (!F[k]) continue;
    if (X[k]) H[k] = NONE;
    inside++;
    if (H[k] !== NONE) covered++;
  }
  if (inside === 0 || covered < inside * PARTS.minCover) return undefined;
  // 没盖到的格（2D 轮廓比 3D 稍大的边条）：从盖到的格向外广度优先延伸，取最先到达的邻格高度
  if (covered < inside) {
    const queue = new Int32Array(n);
    let qh = 0;
    let qt = 0;
    for (let k = 0; k < n; k++) if (F[k] && !X[k] && H[k] !== NONE) queue[qt++] = k;
    const reach = (q: number, h: number) => {
      if (F[q] && !X[q] && H[q] === NONE) {
        H[q] = h;
        queue[qt++] = q;
      }
    };
    while (qh < qt) {
      const k = queue[qh++]!;
      const i = k % g.nx;
      const h = H[k]!;
      if (i > 0) reach(k - 1, h);
      if (i + 1 < g.nx) reach(k + 1, h);
      if (k >= g.nx) reach(k - g.nx, h);
      if (k + g.nx < n) reach(k + g.nx, h);
    }
  }
  // 高度直方图 → 合层
  const count = new Map<number, number>();
  for (let k = 0; k < n; k++) if (F[k] && H[k] !== NONE) count.set(H[k]!, (count.get(H[k]!) ?? 0) + 1);
  const hist = [...count.entries()].sort((a, b) => a[0] - b[0]);
  const { levelOf, tops } = clusterLevels(hist);
  if (tops.length < 2) return undefined;
  const levelOfH = new Map(hist.map(([h], i) => [h, levelOf[i]!]));
  // 每格层号（−1 = 楼外）；没盖到 / 排除的格归底层
  const L = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) if (F[k]) L[k] = H[k] === NONE ? 0 : levelOfH.get(H[k]!)!;

  const cellA = g.cell * g.cell;
  // 第 k 层累积掩膜（L ≥ k）裁到自己的外包框：上层多半只占一小块，连通分量、追踪都不必在整张网格上做
  // 各层（L ≥ k）的外包框：一遍扫出每个层号的框，再从高到低累积；L 改了就作废重算
  let boxCache: Int32Array | null = null;
  const boxes = (): Int32Array => {
    if (boxCache) return boxCache;
    let top = 0;
    for (let c = 0; c < n; c++) if (L[c]! > top) top = L[c]!;
    const bb = new Int32Array((top + 2) * 4);
    for (let k = 0; k <= top + 1; k++) bb.set([g.nx, g.ny, -1, -1], k * 4);
    for (let j = 0, c = 0; j < g.ny; j++) {
      for (let i = 0; i < g.nx; i++, c++) {
        const l = L[c]!;
        if (l < 0) continue;
        const o = l * 4;
        if (i < bb[o]!) bb[o] = i;
        if (j < bb[o + 1]!) bb[o + 1] = j;
        if (i > bb[o + 2]!) bb[o + 2] = i;
        if (j > bb[o + 3]!) bb[o + 3] = j;
      }
    }
    for (let k = top - 1; k >= 0; k--) {
      const o = k * 4;
      const u = o + 4;
      bb[o] = Math.min(bb[o]!, bb[u]!);
      bb[o + 1] = Math.min(bb[o + 1]!, bb[u + 1]!);
      bb[o + 2] = Math.max(bb[o + 2]!, bb[u + 2]!);
      bb[o + 3] = Math.max(bb[o + 3]!, bb[u + 3]!);
    }
    boxCache = bb;
    return bb;
  };
  const sub = (k: number): Sub | null => {
    const bb = boxes();
    if (k * 4 >= bb.length) return null;
    const i0 = bb[k * 4]!;
    const j0 = bb[k * 4 + 1]!;
    const i1 = bb[k * 4 + 2]!;
    const j1 = bb[k * 4 + 3]!;
    if (i1 < 0) return null;
    const w = i1 - i0 + 1;
    const h = j1 - j0 + 1;
    const m = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      const row = (j0 + j) * g.nx + i0;
      for (let i = 0; i < w; i++) if (L[row + i]! >= k) m[j * w + i] = 1;
    }
    return { m, w, h, i0, j0, at: (q: number) => (j0 + Math.floor(q / w)) * g.nx + i0 + (q % w) };
  };
  // 去碎块（从高到低）：小块、露出墙面太小的块降到下一层，桅杆保留
  for (let k = tops.length - 1; k >= 1; k--) {
    const s = sub(k);
    if (!s) continue;
    const { labels, sizes } = components(s.m, s.w, s.h);
    const peak = new Array<number>(sizes.length).fill(0);
    for (let q = 0; q < s.m.length; q++) if (labels[q]) peak[labels[q]!] = Math.max(peak[labels[q]!]!, L[s.at(q)]!);
    const per = perimeters(labels, sizes.length, s.w);
    const drop = sizes.map((size, id) => {
      if (id === 0) return false;
      const area = size * cellA;
      const rise = tops[peak[id]!]! - tops[k - 1]!;
      if (area >= PARTS.spireArea && rise >= PARTS.spireRise) return false;
      return area < PARTS.minArea || per[id]! * g.cell * rise < PARTS.minWall;
    });
    if (drop.some(Boolean)) {
      for (let q = 0; q < s.m.length; q++) if (drop[labels[q]!]) L[s.at(q)] = k - 1;
      boxCache = null;
    }
  }
  // 去掉空层、重新编号
  const used = new Set<number>();
  for (let c = 0; c < n; c++) if (L[c]! >= 0) used.add(L[c]!);
  const keep = [...used].sort((a, b) => a - b);
  const remap = new Map(keep.map((k, i) => [k, i]));
  let levels = keep.map((k) => tops[k]!);
  for (let c = 0; c < n; c++) if (L[c]! >= 0) L[c] = remap.get(L[c]!)!;
  boxCache = null;
  // 各层累积掩膜的周长（格边数）与每层露出的格数：相邻两格层号 a > b 时，这条边是 b < k ≤ a 各层的边界——一遍扫完
  const levelStats = (count: number): { per: number[]; exposed: number[] } => {
    const diff = new Array<number>(count + 1).fill(0);
    const exposed = new Array<number>(count).fill(0);
    const edge = (a: number, b: number) => {
      // a、b 为两侧层号（楼外 −1）
      if (a === b) return;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      diff[lo + 1]!++;
      diff[hi + 1]!--;
    };
    for (let j = 0, c = 0; j < g.ny; j++) {
      for (let i = 0; i < g.nx; i++, c++) {
        const l = L[c]!;
        if (l >= 0) exposed[l]!++;
        // 每格只看左、下两条边；网格外一圈（gridFor 外扩 2 格）都是 −1，最右、最上边界上的楼格不存在
        edge(l, i > 0 ? L[c - 1]! : -1);
        edge(l, j > 0 ? L[c - g.nx]! : -1);
      }
    }
    const per = new Array<number>(count).fill(0);
    let run = 0;
    for (let k = 0; k < count; k++) {
      run += diff[k]!;
      per[k] = run;
    }
    return { per, exposed };
  };
  // 窄边条并到上一层（否则共面立面上会多出一道女儿墙横带）
  for (let k = 0; k < levels.length - 1; ) {
    const st = levelStats(levels.length);
    while (k < levels.length - 1 && (st.exposed[k]! * g.cell) / Math.max(st.per[k]!, 1) >= PARTS.ledge) k++;
    if (k >= levels.length - 1) break;
    for (let i = 0; i < n; i++) if (L[i]! > k) L[i]!--;
    levels = levels.filter((_, j) => j !== k);
    boxCache = null;
  }
  // 块数上限：反复把墙面积最小的层并到下一层；只剩两层时把最小的几块降下去
  for (;;) {
    if (levels.length < 2) return undefined;
    const subs = levels.map((_, k) => (k === 0 ? null : sub(k)));
    const comps = subs.map((s) => (s ? components(s.m, s.w, s.h) : null));
    const parts = 1 + comps.reduce((acc, c) => acc + (c ? c.sizes.length - 1 : 0), 0);
    if (parts <= PARTS.maxParts) break;
    if (levels.length === 2) {
      const c = comps[1]!;
      const s = subs[1]!;
      const ids = c.sizes
        .map((size, id) => [size, id] as const)
        .slice(1)
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .slice(0, parts - PARTS.maxParts)
        .map(([, id]) => id);
      const lower = new Set(ids);
      for (let q = 0; q < s.m.length; q++) if (lower.has(c.labels[q]!)) L[s.at(q)] = 0;
      boxCache = null;
      break;
    }
    const st = levelStats(levels.length);
    let worst = -1;
    let worstScore = Infinity;
    for (let k = 1; k < levels.length; k++) {
      const score = st.per[k]! * g.cell * (levels[k]! - levels[k - 1]!);
      if (score < worstScore) {
        worstScore = score;
        worst = k;
      }
    }
    for (let c = 0; c < n; c++) if (L[c]! >= worst) L[c]!--;
    levels = levels.filter((_, k) => k !== worst);
    boxCache = null;
  }
  // 轮廓
  const out: BuildingPart[] = [{ top: levels[0]! }];
  const inFoot = (x: number, y: number) => withinRing(x, y, b.footprint.outer, PARTS.snap);
  for (let k = 1; k < levels.length; k++) {
    const s = sub(k);
    if (!s) continue;
    const loops = traceMask(s.m, s.w, s.h).map((loop) => {
      const raw: FlatXY = [];
      for (let i = 0; i < loop.length; i += 2) raw.push(g.x0 + (s.i0 + loop[i]!) * g.cell, g.y0 + (s.j0 + loop[i + 1]!) * g.cell);
      const sgn = Math.sign(signedArea2(raw));
      // 简化 / 吸附后绕向翻转、面积缩到一半以下、或不再是简单多边形（自交、重复点）就换下一个候选：
      // 封顶简化 → 1 m 简化 → 0.5 m 简化 → 原环；都不行（原环在对角像素处有夹点）就整个丢掉（R2 修复轮）
      const ok = (r: FlatXY) => r.length >= 6 && Math.sign(signedArea2(r)) === sgn && ringArea(r) >= ringArea(raw) * 0.5 && ringSimple(r);
      if (raw.length <= 6) return ringSimple(raw) ? raw : null;
      const cands = [() => snapRing(simplifyCapped(raw, inFoot), fr, PARTS.snap), () => snapRing(dedupeRing(simplifyRing(raw, 10)), fr, PARTS.snap), () => snapRing(dedupeRing(simplifyRing(raw, 5)), fr, PARTS.snap), () => raw];
      for (const c of cands) {
        const r = c();
        if (ok(r)) return r;
      }
      return null;
    }).filter((r): r is FlatXY => r !== null);
    const outers = loops.filter((r) => signedArea2(r) > 0 && ringArea(r) >= PARTS.spireArea);
    // 洞：简单、与外环的边不相碰（不然 earcut 的洞桥会交叉，屋顶三角形重叠）
    const holes = loops.filter((r) => signedArea2(r) < 0 && ringArea(r) >= PARTS.minArea);
    // 洞归给包含它的最小外环
    const byArea = [...outers].sort((a, b) => ringArea(a) - ringArea(b));
    const holesOf = new Map<FlatXY, FlatXY[]>();
    for (const h of holes) {
      // 洞内一点：首边中点向右偏 0.5 dm（洞环顺时针，右侧是洞内）
      const ex = h[2]! - h[0]!;
      const ey = h[3]! - h[1]!;
      const el = Math.hypot(ex, ey) || 1;
      const hx = (h[0]! + h[2]!) / 2 + (ey / el) * 0.5;
      const hy = (h[1]! + h[3]!) / 2 - (ex / el) * 0.5;
      const host = byArea.find((o) => insideRing(hx, hy, o));
      if (!host || ringsTouch(h, host)) continue;
      // 洞的每个顶点都在外环里、与同一外环的其它洞不相碰
      let ok = true;
      for (let i = 0; i < h.length && ok; i += 2) if (!pointInRing(h[i]!, h[i + 1]!, host)) ok = false;
      for (const other of holesOf.get(host) ?? []) if (ok && ringsTouch(h, other)) ok = false;
      if (ok) holesOf.set(host, [...(holesOf.get(host) ?? []), h]);
    }
    for (const o of outers) {
      const part: BuildingPart = { ring: o, top: levels[k]! };
      const hs = holesOf.get(o);
      if (hs) part.holes = hs;
      out.push(part);
    }
  }
  if (out.length < 2) return undefined;
  const first = out.shift()!;
  out.sort((a, b) => a.top - b.top || ringArea(b.ring!) - ringArea(a.ring!) || a.ring![0]! - b.ring![0]! || a.ring![1]! - b.ring![1]!);
  return [first, ...out];
}

// ---------------------------------------------------------------- 整层

export interface PartsStats {
  models: number;
  matched: number;
  /** 匹配到地标原型楼（已删除）而丢掉的模型。 */
  toLandmarks: number;
  buildingsWithParts: number;
  parts: number;
}

export interface PartsResult {
  buildings: Building[];
  stats: PartsStats;
}

/** 楼是否落在敏感区（质心或任一外环顶点在区内）。 */
function inSensitive(b: Building, zones: readonly SensitiveZone[]): boolean {
  const [cx, cy] = ringCentroid(b.footprint.outer);
  const o = b.footprint.outer;
  return zones.some((z) => {
    if (pointInRing(cx, cy, z.area.outer)) return true;
    for (let i = 0; i < o.length; i += 2) if (pointInRing(o[i]!, o[i + 1]!, z.area.outer)) return true;
    return false;
  });
}

/**
 * 给 kept 里的楼加 parts。all：地标替换前的全部楼（匹配用，含地标原型）；kept：最终的 buildings（地标原型已删）。
 * 返回新的数组（不改输入对象），顺序与 kept 相同。
 */
export function addBuildingParts(
  all: readonly Building[],
  kept: readonly Building[],
  models: readonly Model3d[],
  opts: { landmarks?: readonly LandmarkPlacement[]; sensitive?: readonly SensitiveZone[] } = {},
): PartsResult {
  const match = matchModels(models, all);
  const keptIds = new Set(kept.map((b) => b.id));
  const byBuilding = new Map<string, Model3d[]>();
  let matched = 0;
  let toLandmarks = 0;
  match.forEach((k, i) => {
    if (k < 0) return;
    matched++;
    const b = all[k]!;
    if (!keptIds.has(b.id)) {
      toLandmarks++;
      return;
    }
    byBuilding.set(b.id, [...(byBuilding.get(b.id) ?? []), models[i]!]);
  });
  const sensitive = opts.sensitive ?? [];
  const excludeAll: { box: [number, number, number, number]; rings: FlatXY[] }[] = [
    ...(opts.landmarks ?? []).map((l) => [l.footprint.outer, ...(l.footprint.holes ?? [])]),
    ...sensitive.map((z) => [z.area.outer, ...(z.area.holes ?? [])]),
  ].map((rings) => ({ box: ringsBounds([rings[0]!]), rings }));
  const keptIndex = new BoxIndex();
  for (const b of kept) keptIndex.add(ringsBounds([b.footprint.outer]));
  let withParts = 0;
  let parts = 0;
  const buildings = kept.map((b, i) => {
    const ms = byBuilding.get(b.id);
    if (!ms || inSensitive(b, sensitive)) return b;
    const box = ringsBounds([b.footprint.outer]);
    const exclude = excludeAll
      .filter((e) => e.box[0] <= box[2] && box[0] <= e.box[2] && e.box[1] <= box[3] && box[1] <= e.box[3])
      .map((e) => e.rings);
    const caps = keptIndex
      .query(box)
      .filter((k) => k !== i && kept[k]!.base >= b.base + PARTS.minHeight)
      .map((k) => ({ rings: footprintRings(kept[k]!), z: kept[k]!.base }));
    const p = deriveParts(b, ms, { exclude, caps });
    if (!p) return b;
    withParts++;
    parts += p.length;
    return { ...b, parts: p };
  });
  return { buildings, stats: { models: models.length, matched, toLandmarks, buildingsWithParts: withParts, parts } };
}
