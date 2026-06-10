/**
 * 种子 PRNG（xorshift32）：模拟层唯一的随机数来源。
 * 状态是 World 状态的一部分，进哈希、可回放。
 */
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** [0, 2^32) 整数。 */
  nextU32(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x;
  }

  /** [0, n) 整数。 */
  nextInt(n: number): number {
    return n <= 0 ? 0 : this.nextU32() % n;
  }

  /** 序列化状态（desync 对账 / 存档）。 */
  getState(): number {
    return this.state;
  }

  setState(s: number): void {
    this.state = s >>> 0;
  }
}
