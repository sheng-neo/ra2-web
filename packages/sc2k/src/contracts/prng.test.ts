import { describe, expect, it } from 'vitest';
import { FNV_OFFSET, FNV_PRIME, PRNG_TEST_VECTORS, createPrng, fnv1aBytes, hash32, hashNoise } from './prng';

const hex = (v: number): string => '0x' + v.toString(16).padStart(8, '0');

describe('prng: mulberry32 测试向量', () => {
  it.each(PRNG_TEST_VECTORS)('seed $seed：前 5 个 next32 与之后 state', ({ seed, next32, state }) => {
    const p = createPrng(seed);
    const got = next32.map(() => p.next32());
    expect(got.map(hex)).toEqual(next32.map(hex));
    expect(hex(p.state())).toBe(hex(state));
  });
  it('seed 1 的派生值（spec:economy §2.13.2）', () => {
    const a = createPrng(1), b = createPrng(1), c = createPrng(1);
    expect([0, 1, 2, 3, 4].map(() => a.next15())).toEqual([20547, 89, 17283, 32147, 31731]);
    expect([0, 1, 2, 3, 4].map(() => b.int(100))).toEqual([67, 33, 87, 21, 3]);
    const f = [0, 1, 2, 3, 4].map(() => c.float());
    const want = [0.627074, 0.002736, 0.527447, 0.981051, 0.968378];
    f.forEach((v, k) => expect(Math.abs(v - want[k]!)).toBeLessThan(1e-6));
  });
  it('seed() 重置、state() 为 u32、种子按 >>> 0 取', () => {
    const p = createPrng(-1);
    expect(p.state()).toBe(0xffffffff);
    const first = p.next32();
    p.seed(-1);
    expect(p.next32()).toBe(first);
    p.seed(0x80000000);
    expect(p.state()).toBe(0x80000000);
    expect(createPrng(2 ** 32 + 5).state()).toBe(5);
  });
});

describe('prng: 每方法恰好消费一次 next32()', () => {
  const consumed = (fn: (p: ReturnType<typeof createPrng>) => void): number => {
    const ref = createPrng(777);
    const p = createPrng(777);
    fn(p);
    let n = 0;
    while (ref.state() !== p.state() && n < 100) { ref.next32(); n++; }
    return n;
  };
  it('next15 / int / range / float / bit / pick 各 1 次；n ≤ 0 的 int 也消费 1 次', () => {
    expect(consumed((p) => p.next15())).toBe(1);
    expect(consumed((p) => p.int(10))).toBe(1);
    expect(consumed((p) => p.int(0))).toBe(1);
    expect(consumed((p) => p.int(-3))).toBe(1);
    expect(consumed((p) => p.range(3, 9))).toBe(1);
    expect(consumed((p) => p.float())).toBe(1);
    expect(consumed((p) => p.bit())).toBe(1);
    expect(consumed((p) => p.pick([1, 2, 3]))).toBe(1);
  });
  it('shuffle 消费 length−1 次；空 / 单元素 0 次', () => {
    expect(consumed((p) => p.shuffle([1, 2, 3, 4, 5]))).toBe(4);
    expect(consumed((p) => p.shuffle([1]))).toBe(0);
    expect(consumed((p) => p.shuffle([]))).toBe(0);
  });
  it('值域与定义', () => {
    const p = createPrng(42), q = createPrng(42);
    for (let k = 0; k < 2000; k++) {
      const v = q.next32();
      const n15 = p.next15(); q.seed(q.state()); // 不改状态，只为对齐
      expect(n15).toBe(v >>> 17);
    }
    const r = createPrng(9);
    for (let k = 0; k < 1000; k++) {
      const a = r.int(7); expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(7); expect(Number.isInteger(a)).toBe(true);
      const b = r.range(-2, 2); expect(b).toBeGreaterThanOrEqual(-2); expect(b).toBeLessThanOrEqual(2);
      const f = r.float(); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1);
    }
    expect(r.int(0)).toBe(0); expect(r.int(-1)).toBe(0);
    expect(() => r.pick([])).toThrow();
    // range 覆盖闭区间两端
    const seen = new Set<number>();
    for (let k = 0; k < 500; k++) seen.add(r.range(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
    // shuffle 为置换
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    r.shuffle(arr);
    expect([...arr].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // bit 两种值都出现
    const bits = new Set<boolean>();
    for (let k = 0; k < 64; k++) bits.add(r.bit());
    expect(bits.size).toBe(2);
  });
});

describe('prng: cell 后备存储', () => {
  it('状态只存在于 cell.prngState（i32 位模式），与无 cell 的序列相同', () => {
    const cell = { prngState: 123 };
    const p = createPrng(0xdeadbeef, cell);
    expect(cell.prngState).toBe(0xdeadbeef | 0);
    expect(p.state()).toBe(0xdeadbeef);
    const ref = createPrng(0xdeadbeef);
    for (let k = 0; k < 20; k++) {
      expect(p.next32()).toBe(ref.next32());
      expect(cell.prngState).toBe(ref.state() | 0);
      expect(p.state()).toBe(ref.state());
    }
    // 外部改写 cell（如读档）立即生效
    cell.prngState = 1;
    expect(p.next32()).toBe(createPrng(1).next32());
    // 两个 Prng 共享一个 cell 时共享状态
    const p2 = createPrng(1, cell);
    const ref2 = createPrng(1);
    expect(p.next32()).toBe(ref2.next32());
    expect(p2.next32()).toBe(ref2.next32());
  });
});

describe('prng: 哈希', () => {
  it('fnv1aBytes 符合 FNV-1a 32 标准向量', () => {
    const bytes = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
    expect(FNV_OFFSET).toBe(0x811c9dc5); expect(FNV_PRIME).toBe(0x01000193);
    expect(fnv1aBytes(FNV_OFFSET, [])).toBe(0x811c9dc5);
    expect(fnv1aBytes(FNV_OFFSET, bytes('a'))).toBe(0xe40c292c);
    expect(fnv1aBytes(FNV_OFFSET, bytes('foobar'))).toBe(0xbf9cf968);
    // 可分段累积
    expect(fnv1aBytes(fnv1aBytes(FNV_OFFSET, bytes('foo')), bytes('bar'))).toBe(0xbf9cf968);
    expect(fnv1aBytes(FNV_OFFSET, new Uint8Array([0x61]))).toBe(0xe40c292c);
  });
  it('hash32 确定、u32、对参数敏感、区分类型与顺序', () => {
    expect(hash32()).toBe(FNV_OFFSET);
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hash32('1')).not.toBe(hash32(1));
    expect(hash32('ab')).not.toBe(hash32('a', 'b'));
    expect(hash32(0)).not.toBe(hash32(-0 + 0, 0));
    expect(hash32(-1)).not.toBe(hash32(0xffffffff));
    expect(hash32(2 ** 40)).not.toBe(hash32(0));
    expect(hash32(0.5)).not.toBe(hash32(0));
    expect(hash32(NaN)).toBe(hash32(NaN));
    expect(hash32('城市', 12, -3.25)).toBe(hash32('城市', 12, -3.25));
    for (const v of [hash32(7), hash32('x'), hash32(1e12), hash32(Infinity)]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(0xffffffff); expect(Number.isInteger(v)).toBe(true); }
    // 作为子种子：不同 (age, x, y) 给出不同序列
    expect(createPrng(hash32(5, 10, 20)).next32()).not.toBe(createPrng(hash32(5, 10, 21)).next32());
  });
  it('hashNoise ∈ [0,1)、无状态、分布不退化', () => {
    const vals: number[] = [];
    for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) {
      const v = hashNoise(3, x, y);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);
      expect(hashNoise(3, x, y)).toBe(v);
      vals.push(v);
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.03);
    expect(vals.filter((v) => v > 0.93).length / vals.length).toBeGreaterThan(0.04);
    expect(new Set(vals).size).toBeGreaterThan(4000);
    expect(hashNoise(3, 1, 2)).not.toBe(hashNoise(4, 1, 2));
    expect(hashNoise(3, 1, 2)).not.toBe(hashNoise(3, 2, 1));
    // 非整数参数走慢路径，同样确定
    expect(hashNoise(0.5, 1, 2)).toBe(hashNoise(0.5, 1, 2));
    expect(hashNoise(0.5, 1, 2)).toBeLessThan(1);
  });
});
