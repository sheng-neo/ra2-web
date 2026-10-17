// ===== prng.ts =====（spec:economy §2.13：mulberry32；每个方法恰好消费一次 next32()）
// 随机数契约（CONTRACTS §E）：sim 流 / terrain 流 / brush 流共用 createPrng；art 用无状态 hashNoise。
/** 每个方法恰好消费一次 next32()（shuffle 消费 length−1 次）。 */
export interface Prng {
  next32(): number;                       // u32
  next15(): number;                       // next32() >>> 17
  int(n: number): number;                 // [0, n)；n ≤ 0 → 0
  range(lo: number, hi: number): number;  // 闭区间 [lo, hi]
  float(): number;                        // [0, 1) = next32() / 2^32
  bit(): boolean;
  pick<T>(a: readonly T[]): T;            // 空数组抛错
  shuffle<T>(a: T[]): void;               // Fisher–Yates 从末尾向前
  state(): number; seed(s: number): void;
}
export const FNV_OFFSET = 0x811c9dc5, FNV_PRIME = 0x01000193;
const TWO_POW_32 = 4294967296;

/**
 * 可选 cell：以外部对象的 prngState 字段为后备存储（core 用 state.clock 作为 cell，使 prngState 天然入快照）。
 * 有 cell 时状态只存在于 cell.prngState（u32 按 i32 位模式存，与 MISC 0x1058 一致）；state() 始终返回 u32。
 * 算法 mulberry32（spec:economy §2.13.2）：
 *   state = (state + 0x6D2B79F5) | 0
 *   t = imul(state ^ (state >>> 15), 1 | state)
 *   t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t
 *   return (t ^ (t >>> 14)) >>> 0
 */
export function createPrng(seed: number, cell?: { prngState: number }): Prng {
  let local = 0;
  const get: () => number = cell ? () => cell.prngState >>> 0 : () => local >>> 0;
  const set: (s: number) => void = cell ? (s) => { cell.prngState = s | 0; } : (s) => { local = s | 0; };
  set(seed >>> 0);
  const next32 = (): number => {
    const s = (get() + 0x6d2b79f5) | 0;
    set(s);
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  /** n ≤ 0 也消费一次，保证"每方法一次"的状态推进量恒定。 */
  const int = (n: number): number => { const v = next32(); return n > 0 ? v % n : 0; };
  return {
    next32,
    next15: () => next32() >>> 17,
    int,
    range: (lo, hi) => lo + int(hi - lo + 1),
    float: () => next32() / TWO_POW_32,
    bit: () => (next32() >>> 31) === 1,
    pick<T>(a: readonly T[]): T {
      if (a.length === 0) throw new RangeError('Prng.pick: 空数组');
      return a[int(a.length)]!;
    },
    shuffle<T>(a: T[]): void {
      for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); const t = a[i]!; a[i] = a[j]!; a[j] = t; }
    },
    state: () => get(),
    seed: (s) => set(s >>> 0),
  };
}

const fnv1aByte = (h: number, b: number): number => Math.imul(h ^ (b & 0xff), FNV_PRIME) >>> 0;
/** FNV-1a 32 累积器（hashState 用）：h 为当前哈希（首次传 FNV_OFFSET），逐字节吸收 bytes（只取低 8 位）。 */
export function fnv1aBytes(h: number, bytes: ArrayLike<number>): number {
  let x = h >>> 0;
  for (let k = 0; k < bytes.length; k++) x = fnv1aByte(x, bytes[k]!);
  return x;
}
const f64 = new DataView(new ArrayBuffer(8));
/** 数字按确定性字节序列吸收：安全整数 → 64 位二补码小端 8 字节；其它 → IEEE754 小端 8 字节（NaN 规范化为 0x7ff8…）。 */
function fnv1aNumber(h: number, n: number): number {
  let x = h;
  if (Number.isSafeInteger(n)) {
    const lo = n >>> 0, hi = Math.floor(n / TWO_POW_32) >>> 0;
    for (let k = 0; k < 4; k++) x = fnv1aByte(x, lo >>> (k * 8));
    for (let k = 0; k < 4; k++) x = fnv1aByte(x, hi >>> (k * 8));
    return x;
  }
  f64.setFloat64(0, Number.isNaN(n) ? NaN : n, true);
  if (Number.isNaN(n)) { f64.setUint32(0, 0, true); f64.setUint32(4, 0x7ff80000, true); }
  for (let k = 0; k < 8; k++) x = fnv1aByte(x, f64.getUint8(k));
  return x;
}
/** FNV-1a 32：派生子种子。每个参数前缀 1 字节类型标记（0 = 数字，1 = 字符串）；字符串按 UTF-16 码元小端 2 字节吸收。 */
export function hash32(...parts: (number | string)[]): number {
  let h = FNV_OFFSET;
  for (const p of parts) {
    if (typeof p === 'string') {
      h = fnv1aByte(h, 1);
      for (let k = 0; k < p.length; k++) { const c = p.charCodeAt(k); h = fnv1aByte(h, c); h = fnv1aByte(h, c >>> 8); }
    } else {
      h = fnv1aByte(h, 0);
      h = fnv1aNumber(h, p);
    }
  }
  return h >>> 0;
}
/** [0,1) 无状态噪声（art 用）：参数为 int32 时走整数混合快路径，否则退化为 hash32；两条路径都确定性。 */
export function hashNoise(seed: number, x: number, y: number): number {
  let h: number;
  if ((seed | 0) === seed && (x | 0) === x && (y | 0) === y) {
    h = Math.imul(seed, 0x9e3779b1) ^ FNV_OFFSET;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h ^= x; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= y; h = Math.imul(h ^ (h >>> 16), 0x27d4eb2d);
  } else {
    h = hash32(seed, x, y);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  }
  h ^= h >>> 15;
  return (h >>> 0) / TWO_POW_32;
}
/** 固化测试向量：seed → 前 5 个 next32 与之后的 state（prng.test.ts）。 */
export const PRNG_TEST_VECTORS: ReadonlyArray<{ seed: number; next32: readonly number[]; state: number }> = [
  { seed: 0, next32: [0x4434b462, 0x00159c37, 0x39285b08, 0x256d8104, 0x77a2cbd4], state: 0x21d961c9 },
  { seed: 1, next32: [0xa087eaf3, 0x00b349c9, 0x8706c4eb, 0xfb2627fd, 0xf7e79d2b], state: 0x21d961ca },
  { seed: 12345, next32: [0xfacf78c5, 0x4e875100, 0x7bf4e2f2, 0xd1642650, 0x8269e5ca], state: 0x21d99202 }];
