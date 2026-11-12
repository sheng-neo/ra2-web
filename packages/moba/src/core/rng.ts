/**
 * 种子伪随机数（mulberry32）。模拟层唯一的随机源：
 * 同种子 + 同调用序列 → 完全相同的结果（core 内禁止使用 Math.random / Date）。
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    const s = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** 整数 [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** 派生一条独立的子序列（给各个 Bot 用，互不干扰战斗随机流） */
  fork(): Rng {
    return new Rng((Math.floor(this.next() * 4294967296) ^ 0x9e3779b9) >>> 0);
  }

  /** 内部状态（做状态哈希用） */
  get state(): number {
    return this.s;
  }
}
