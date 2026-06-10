/**
 * FNV-1a 32 位流式哈希：锁步 desync 检测的状态指纹。
 * 所有客户端每 N tick 比对 World.hash()。
 */
export class StateHash {
  private h = 0x811c9dc5;

  /** 折叠一个 32 位整数（按 4 字节小端）。Math.imul 保证精确 32 位乘法。 */
  addInt(v: number): this {
    let x = v | 0;
    for (let i = 0; i < 4; i++) {
      this.h = Math.imul(this.h ^ (x & 0xff), 0x01000193) >>> 0;
      x >>>= 8;
    }
    return this;
  }

  addBytes(bytes: Uint8Array): this {
    for (let i = 0; i < bytes.length; i++) {
      this.h = Math.imul(this.h ^ bytes[i]!, 0x01000193) >>> 0;
    }
    return this;
  }

  get value(): number {
    return this.h >>> 0;
  }
}
