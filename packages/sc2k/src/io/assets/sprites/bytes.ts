// ===== io/assets/sprites/bytes.ts =====（spec:file-formats §3.1 / §4.1）
// 显式字节序的只读游标：精灵文件头是大端、BMP / IDX 是小端，故不提供"默认字节序"方法；越界即抛 RangeError。
// 纯函数、无 DOM，供 sprites / palette / import 三处共用。

export class AssetFormatError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'AssetFormatError'; this.code = code; }
}

export class ByteReader {
  readonly bytes: Uint8Array;
  pos = 0;
  constructor(src: ArrayBuffer | Uint8Array) {
    this.bytes = src instanceof Uint8Array ? src : new Uint8Array(src);
  }
  get length(): number { return this.bytes.length; }
  get remaining(): number { return this.bytes.length - this.pos; }
  seek(pos: number): void { this.pos = pos; }
  private need(n: number): void {
    if (this.pos + n > this.bytes.length) throw new RangeError(`ByteReader: 读取越界（pos ${this.pos} + ${n} > ${this.bytes.length}）`);
  }
  u8(): number { this.need(1); return this.bytes[this.pos++]!; }
  u16be(): number { this.need(2); const b = this.bytes, p = this.pos; this.pos += 2; return (b[p]! << 8) | b[p + 1]!; }
  u32be(): number { this.need(4); const b = this.bytes, p = this.pos; this.pos += 4; return ((b[p]! << 24) | (b[p + 1]! << 16) | (b[p + 2]! << 8) | b[p + 3]!) >>> 0; }
  u16le(): number { this.need(2); const b = this.bytes, p = this.pos; this.pos += 2; return b[p]! | (b[p + 1]! << 8); }
  u32le(): number { this.need(4); const b = this.bytes, p = this.pos; this.pos += 4; return (b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16) | (b[p + 3]! << 24)) >>> 0; }
  i32le(): number { return this.u32le() | 0; }
  ascii(n: number): string { this.need(n); let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(this.bytes[this.pos + k]!); this.pos += n; return s; }
}

/** 不移动游标的便捷读取（identify 用；越界返回 undefined 而非抛错）。 */
export const peekU16be = (b: Uint8Array, at: number): number | undefined => at + 2 <= b.length ? (b[at]! << 8) | b[at + 1]! : undefined;
export const peekU32be = (b: Uint8Array, at: number): number | undefined => at + 4 <= b.length ? ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0 : undefined;
export const peekU16le = (b: Uint8Array, at: number): number | undefined => at + 2 <= b.length ? b[at]! | (b[at + 1]! << 8) : undefined;
export const peekU32le = (b: Uint8Array, at: number): number | undefined => at + 4 <= b.length ? (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0 : undefined;
export const peekAscii = (b: Uint8Array, at: number, n: number): string | undefined => {
  if (at + n > b.length) return undefined;
  let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(b[at + k]!); return s;
};

/** 小端写入辅助（夹具 / BMP 写出用）。 */
export class ByteWriter {
  private buf: Uint8Array;
  pos = 0;
  constructor(capacity = 256) { this.buf = new Uint8Array(capacity); }
  private grow(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let cap = this.buf.length * 2; while (cap < this.pos + n) cap *= 2;
    const next = new Uint8Array(cap); next.set(this.buf); this.buf = next;
  }
  u8(v: number): this { this.grow(1); this.buf[this.pos++] = v & 0xff; return this; }
  u16be(v: number): this { this.grow(2); this.buf[this.pos++] = (v >>> 8) & 0xff; this.buf[this.pos++] = v & 0xff; return this; }
  u32be(v: number): this { this.grow(4); this.buf[this.pos++] = (v >>> 24) & 0xff; this.buf[this.pos++] = (v >>> 16) & 0xff; this.buf[this.pos++] = (v >>> 8) & 0xff; this.buf[this.pos++] = v & 0xff; return this; }
  u16le(v: number): this { this.grow(2); this.buf[this.pos++] = v & 0xff; this.buf[this.pos++] = (v >>> 8) & 0xff; return this; }
  u32le(v: number): this { this.grow(4); this.buf[this.pos++] = v & 0xff; this.buf[this.pos++] = (v >>> 8) & 0xff; this.buf[this.pos++] = (v >>> 16) & 0xff; this.buf[this.pos++] = (v >>> 24) & 0xff; return this; }
  bytes(src: ArrayLike<number>): this { this.grow(src.length); this.buf.set(src, this.pos); this.pos += src.length; return this; }
  ascii(s: string): this { for (let k = 0; k < s.length; k++) this.u8(s.charCodeAt(k)); return this; }
  /** 独立拷贝（长度 = 已写字节数）。 */
  toUint8Array(): Uint8Array { return this.buf.slice(0, this.pos); }
  toArrayBuffer(): ArrayBuffer { return this.toUint8Array().buffer as ArrayBuffer; }
}
