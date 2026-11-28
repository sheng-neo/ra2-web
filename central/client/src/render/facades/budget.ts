/**
 * 真实贴面流式加载的纯逻辑（不碰 three / DOM，有单元测试）：显存预算、页的先后、槽位 LRU。
 *
 * 显存（贴图账本，含 mipmap 的 4/3）：近景池每层 = RGBA8 page² × 4 B（颜色 sRGB + alpha 照片 / 玻璃 / 独立窗码）；远景图集同样。
 * 本包的显存份额（PLAN R3 预算；复审修正后）：HIGH 手机 +76.5 MB、HIGH 桌面（2560 × 1440）+87 MB、LOW +16.5 MB（MiB）。
 * - HIGH：远景全分辨率图集 + 近景池（份额减远景后能放几层放几层，最多 12 层、至少 2 层）；手机比原来多一层（复审：手机近景池不够用）。
 * - LOW：半分辨率远景图集（每页 64 × 64，约 5 MB）+ 2 层近景池，只给相机 LOW_NEAR_M 内的页（复审：LOW 原来近看完全没有照片）。
 *   LOW 的 drawing buffer 封顶 1.3 Mpx（quality.ts），画布 + 4× MSAA 在任何窗口下都不超过约 43 MB，加上本包仍 ≤ 64 MB。
 * 挑页（choosePages）：有效距离 = 到页上最近一栋楼外包盒的距离 ×（视野外：100 m 内 1.25、更远 2.5）×（已常驻 0.75：滞回，
 * 新页要近 25 % 以上才换掉常驻页，转身、走动时不来回换页）。
 *
 * R4 电车走廊高清街面层（HIRES）：高清页与 R3 近景页共用同一个近景池（颜色层），另有一个半边长的辅助图数组（每个常驻高清页一层：
 * 后退深度 / 店面 / 招牌 / 店铺种子）。HIGH 手机 4 层、桌面 5 层辅助图，颜色层数按份额减去远景与辅助图后重算（各少约一层）。
 * 挑页（chooseMixed）：高清页只在 HIRES_MAX_M 内参加，有效距离再乘 HIRES_FACTOR（近处高清页比同距离的 R3 页更值），
 * 同时常驻的高清页不超过辅助图层数；距离用预测位置（相机速度外推，见 predictDistance）——搭电车时前方 150–200 m 的页提前到。
 */
import type { Tier } from '../materials/lighting';

/** mipmap 链的额外开销。 */
const MIP = 4 / 3;

export interface FacadeBudget {
  /** 近景池层数（0 = 不建近景池）。 */
  nearLayers: number;
  /** R4：高清页辅助图层数（= 同时常驻的高清页上限；0 = 不用高清层）。 */
  hiresLayers: number;
  /** 用哪份远景图集。 */
  far: 'full' | 'low';
  /** 近景页的最远有效距离（米）。 */
  nearMaxM: number;
}

/** 本包的显存份额（MB）。 */
export const FACADE_SHARE_MB = { phone: 76.5, desktop: 87, low: 16.5 } as const;
const MAX_LAYERS = 12;
const LOW_LAYERS = 2;
const HIGH_NEAR_M = 900;
const LOW_NEAR_M = 80;
/** 视野外的页：100 m 内只加一点（身边的楼一转身就看到），更远 × 2.5。 */
const OUT_OF_VIEW_NEAR_M = 100;
/** 已常驻页的距离折扣（滞回）。 */
const RESIDENT_BONUS = 0.75;
const MIN_LAYERS = 2;

/** 近景池一层的显存（字节）。 */
export function layerBytes(page: number): number {
  return page * page * 4 * MIP;
}

/** 高清辅助图一层的显存（字节；RGBA8，边长 = 页边长 / 2）。 */
export function auxLayerBytes(aux: number): number {
  return aux * aux * 4 * MIP;
}

/** 高清辅助图层数（HIGH）：手机 4、桌面 5。 */
export const HIRES_LAYERS = { phone: 4, desktop: 5 } as const;
/** 高清页参加挑页的最远距离（米）与有效距离系数；手机的上段页（15–45 m）只在 HIRES_UPPER_PHONE_M 内要（省下载量）。 */
export const HIRES_MAX_M = 160;
export const HIRES_UPPER_PHONE_M = 50;
export const HIRES_FACTOR = 0.4;

/**
 * 档位与设备 → 预算。mobile：触屏 / 粗指针设备（手机、平板）；farFull：全分辨率远景图集的显存（字节）；page：页边长；
 * hiresAux：高清辅助图边长（没有高清层时省略或 0）。LOW 不用高清层。
 */
export function facadeBudget(tier: Tier, mobile: boolean, farFull: number, page: number, hiresAux = 0): FacadeBudget {
  if (tier === 'low') {
    const n = Math.floor((FACADE_SHARE_MB.low * 1024 * 1024 - farFull / 4) / layerBytes(page));
    return { nearLayers: Math.max(0, Math.min(LOW_LAYERS, n)), hiresLayers: 0, far: 'low', nearMaxM: LOW_NEAR_M };
  }
  const share = (mobile ? FACADE_SHARE_MB.phone : FACADE_SHARE_MB.desktop) * 1024 * 1024;
  const h = hiresAux > 0 ? (mobile ? HIRES_LAYERS.phone : HIRES_LAYERS.desktop) : 0;
  const n = Math.floor((share - farFull - h * auxLayerBytes(hiresAux)) / layerBytes(page));
  const near = Math.max(MIN_LAYERS, Math.min(MAX_LAYERS, n));
  // 高清页至少要比辅助图层数多留两层给 R3 页
  return { nearLayers: near, hiresLayers: Math.max(0, Math.min(h, near - 2)), far: 'full', nearMaxM: HIGH_NEAR_M };
}

/** 远景图集（RGBA，w × h）的显存（字节）。 */
export function farBytes(w: number, h: number): number {
  return w * h * 4 * MIP;
}

/**
 * 每页的「最近一栋楼」距离：entries 是 (页号, 楼外包盒) 对（一栋楼的墙 / 屋顶分在几页就有几项），按页取最小。
 * 页覆盖的楼群外包盒可能把相机围在里面（距离 0），而页上的楼其实都在 100 m 外；按楼算才分得出真正近的页。
 * out 预先分配（页数），返回 out。
 */
export function pageNearest(pageOf: Int32Array, boxes: Float32Array, x: number, y: number, z: number, out: Float64Array): Float64Array {
  out.fill(Infinity);
  for (let i = 0; i < pageOf.length; i++) {
    const p = pageOf[i]!;
    const d = boxDistance(boxes, i, x, y, z);
    if (d < out[p]!) out[p] = d;
  }
  return out;
}

/** 点（模拟坐标米）到第 i 个外包盒（[minX, minY, minZ, maxX, maxY, maxZ]）的距离；全 0 的盒（没有楼用到的页）为 Infinity。 */
export function boxDistance(boxes: Float32Array, i: number, x: number, y: number, z: number): number {
  const o = i * 6;
  if (boxes[o] === 0 && boxes[o + 3] === 0 && boxes[o + 1] === 0 && boxes[o + 4] === 0) return Infinity;
  const dx = Math.max(boxes[o]! - x, 0, x - boxes[o + 3]!);
  const dy = Math.max(boxes[o + 1]! - y, 0, y - boxes[o + 4]!);
  const dz = Math.max(boxes[o + 2]! - z, 0, z - boxes[o + 5]!);
  return Math.hypot(dx, dy, dz);
}

/**
 * 挑要常驻近景池的页：有效距离 = 距离 ×（在视野里 1；不在：100 m 内 1.25、更远 2.5）×（已常驻 0.75），超过 maxDist 的不要；
 * 按有效距离升序取前 cap 个（同距离按页号，确定性）。dist、inView、resident 按页号（resident 可省略）。
 */
export function choosePages(
  dist: ArrayLike<number>,
  inView: ArrayLike<boolean>,
  cap: number,
  maxDist: number,
  resident?: (page: number) => boolean,
): number[] {
  const cand: { p: number; e: number }[] = [];
  for (let p = 0; p < dist.length; p++) {
    const d = dist[p]!;
    let e = d * (inView[p] ? 1 : d < OUT_OF_VIEW_NEAR_M ? 1.25 : 2.5);
    if (resident?.(p)) e *= RESIDENT_BONUS;
    if (e <= maxDist) cand.push({ p, e });
  }
  cand.sort((a, b) => a.e - b.e || a.p - b.p);
  return cand.slice(0, cap).map((c) => c.p);
}

/**
 * R3 页与高清页一起挑（R4）：dist、inView 按虚拟页号（0..nR3−1 为 R3 页，其后为高清页，hi(p) 为真）。
 * 高清页：距离 ≤ hiMax 才参加，有效距离再 × HIRES_FACTOR，入选的高清页不超过 capHi（辅助图层数）；其余同 choosePages。
 */
export function chooseMixed(
  dist: ArrayLike<number>,
  inView: ArrayLike<boolean>,
  hi: (page: number) => boolean,
  cap: number,
  capHi: number,
  maxDist: number,
  hiMax: number | ((page: number) => number),
  resident?: (page: number) => boolean,
): number[] {
  const cand: { p: number; e: number; h: boolean }[] = [];
  for (let p = 0; p < dist.length; p++) {
    const d = dist[p]!;
    const h = hi(p);
    if (h && (capHi <= 0 || d > (typeof hiMax === 'number' ? hiMax : hiMax(p)))) continue;
    let e = d * (inView[p] ? 1 : d < OUT_OF_VIEW_NEAR_M ? 1.25 : 2.5);
    if (h) e *= HIRES_FACTOR;
    if (resident?.(p)) e *= RESIDENT_BONUS;
    if (e <= maxDist) cand.push({ p, e, h });
  }
  cand.sort((a, b) => a.e - b.e || a.p - b.p);
  const out: number[] = [];
  let nh = 0;
  for (const c of cand) {
    if (out.length >= cap) break;
    if (c.h) {
      if (nh >= capHi) continue;
      nh++;
    }
    out.push(c.p);
  }
  return out;
}

/**
 * 预测距离（R4 预取）：相机位置 (x, y, z) 按速度 (vx, vy)（米 / 秒）外推到 t = 0、2、4、7、11、16 s（最远 PREDICT_MAX_M），
 * 每页取 min(到页的距离 + 0.3 × 走过的路)。out 预先分配（页数），scratch 同长。
 */
const PREDICT_T = [0, 2, 4, 7, 11, 16];
export const PREDICT_MAX_M = 200;
export function predictDistance(
  pageOf: Int32Array,
  boxes: Float32Array,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  out: Float64Array,
  scratch: Float64Array,
): Float64Array {
  out.fill(Infinity);
  const v = Math.hypot(vx, vy);
  for (const t of PREDICT_T) {
    const run = Math.min(v * t, PREDICT_MAX_M);
    if (t > 0 && v < 0.5) break;
    const k = v > 0 ? run / v : 0;
    pageNearest(pageOf, boxes, x + vx * k, y + vy * k, z, scratch);
    for (let i = 0; i < out.length; i++) {
      const d = scratch[i]! + 0.3 * run;
      if (d < out[i]!) out[i] = d;
    }
    if (run >= PREDICT_MAX_M) break;
  }
  return out;
}

/**
 * 近景池槽位：页 ↔ 槽，最近一次「被需要」的时刻做 LRU。
 * plan(want, now)：want 里还没有槽的页按先后分配槽（空槽优先，其次不在 want 里、最久没被需要的页让出槽）；
 * 返回 [{ page, slot, evicted }]（evicted = 让出槽的页，−1 表示空槽）。调用方上传完成后 commit；上传失败 release。
 */
export class SlotLru {
  private readonly pageOf: Int32Array;
  private readonly used: Float64Array;
  private readonly slotOf = new Map<number, number>();

  constructor(readonly slots: number) {
    this.pageOf = new Int32Array(slots).fill(-1);
    this.used = new Float64Array(slots).fill(-Infinity);
  }

  /** 页所在的槽（没有为 −1）。 */
  slot(page: number): number {
    return this.slotOf.get(page) ?? -1;
  }

  /** 槽里的页（空为 −1）。 */
  page(slot: number): number {
    return this.pageOf[slot]!;
  }

  /** 标记这些页此刻被需要（更新 LRU 时刻）。 */
  touch(pages: readonly number[], now: number): void {
    for (const p of pages) {
      const s = this.slotOf.get(p);
      if (s !== undefined) this.used[s] = now;
    }
  }

  /** 为 want 里还没有槽的页挑槽（不改状态）；最多 limit 个；reserved 里的槽（正在加载）不动。 */
  plan(want: readonly number[], limit = Infinity, reserved: ReadonlySet<number> = new Set()): { page: number; slot: number; evicted: number }[] {
    const wanted = new Set(want);
    const taken = new Set<number>(reserved);
    const out: { page: number; slot: number; evicted: number }[] = [];
    for (const p of want) {
      if (out.length >= limit) break;
      if (this.slotOf.has(p)) continue;
      let best = -1;
      let bestT = Infinity;
      for (let s = 0; s < this.slots; s++) {
        if (taken.has(s)) continue;
        const q = this.pageOf[s]!;
        if (q === -1) {
          best = s;
          break;
        }
        if (wanted.has(q)) continue;
        if (this.used[s]! < bestT) {
          bestT = this.used[s]!;
          best = s;
        }
      }
      if (best < 0) break;
      taken.add(best);
      out.push({ page: p, slot: best, evicted: this.pageOf[best]! });
    }
    return out;
  }

  /** 页上传进槽后登记（槽里原来的页让出）。 */
  commit(page: number, slot: number, now: number): void {
    const old = this.pageOf[slot]!;
    if (old >= 0) this.slotOf.delete(old);
    const prev = this.slotOf.get(page);
    if (prev !== undefined) this.pageOf[prev] = -1;
    this.pageOf[slot] = page;
    this.slotOf.set(page, slot);
    this.used[slot] = now;
  }

  /** 清空一个槽（上下文丢失后、或上传失败）。 */
  release(slot: number): void {
    const old = this.pageOf[slot]!;
    if (old >= 0) this.slotOf.delete(old);
    this.pageOf[slot] = -1;
    this.used[slot] = -Infinity;
  }

  /** 当前常驻的页数。 */
  get resident(): number {
    return this.slotOf.size;
  }
}
