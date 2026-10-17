// ===== io/sc2/bytes.ts =====（spec:file-formats §3.1）
// 二进制读写工具：字节序一律显式（u16be / u16le …），越界读取抛 RangeError；ByteWriter 自动增长。
// 另含 CNAM / XLAB 用的最小 UTF-8 / Latin-1 编解码（tsconfig.sim.json 无 DOM lib，不能用 TextEncoder）。

export class ByteReader {
  private readonly view: DataView;
  private readonly u8s: Uint8Array;
  pos: number;
  constructor(buf: ArrayBuffer | Uint8Array, pos = 0) {
    this.u8s = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.view = new DataView(this.u8s.buffer, this.u8s.byteOffset, this.u8s.byteLength);
    this.pos = pos;
  }
  get length(): number { return this.u8s.length; }
  get remaining(): number { return this.u8s.length - this.pos; }
  private need(n: number): void {
    if (n < 0 || this.pos + n > this.u8s.length) throw new RangeError(`ByteReader: 越界读取 ${n} 字节 @${this.pos}（长度 ${this.u8s.length}）`);
  }
  u8(): number { this.need(1); return this.u8s[this.pos++]!; }
  u16be(): number { this.need(2); const v = this.view.getUint16(this.pos, false); this.pos += 2; return v; }
  u16le(): number { this.need(2); const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  u32be(): number { this.need(4); const v = this.view.getUint32(this.pos, false); this.pos += 4; return v; }
  u32le(): number { this.need(4); const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i32be(): number { this.need(4); const v = this.view.getInt32(this.pos, false); this.pos += 4; return v; }
  /** n 个字节按 Latin-1 转字符（不做 UTF-8 解码）。 */
  ascii(n: number): string { this.need(n); let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(this.u8s[this.pos + k]!); this.pos += n; return s; }
  /** 子视图（不拷贝）。 */
  bytes(n: number): Uint8Array { this.need(n); const v = this.u8s.subarray(this.pos, this.pos + n); this.pos += n; return v; }
  /** 不移动游标地窥视 n 个字节的 Latin-1 文本；越界返回 ''。 */
  peekAscii(at: number, n: number): string {
    if (at < 0 || at + n > this.u8s.length) return '';
    let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(this.u8s[at + k]!);
    return s;
  }
  peekU8(at: number): number { return at >= 0 && at < this.u8s.length ? this.u8s[at]! : -1; }
  peekU32be(at: number): number { return at >= 0 && at + 4 <= this.u8s.length ? this.view.getUint32(at, false) : -1; }
}

export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  private len = 0;
  constructor(initial = 1024) { this.buf = new Uint8Array(Math.max(16, initial)); this.view = new DataView(this.buf.buffer); }
  get length(): number { return this.len; }
  private ensure(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap); nb.set(this.buf.subarray(0, this.len));
    this.buf = nb; this.view = new DataView(nb.buffer);
  }
  u8(v: number): void { this.ensure(1); this.buf[this.len++] = v & 0xff; }
  u16be(v: number): void { this.ensure(2); this.view.setUint16(this.len, v & 0xffff, false); this.len += 2; }
  u16le(v: number): void { this.ensure(2); this.view.setUint16(this.len, v & 0xffff, true); this.len += 2; }
  u32be(v: number): void { this.ensure(4); this.view.setUint32(this.len, v >>> 0, false); this.len += 4; }
  i32be(v: number): void { this.ensure(4); this.view.setInt32(this.len, v | 0, false); this.len += 4; }
  /** 每字符取低 8 位（Latin-1）。 */
  ascii(s: string): void { this.ensure(s.length); for (let k = 0; k < s.length; k++) this.buf[this.len++] = s.charCodeAt(k) & 0xff; }
  bytes(b: ArrayLike<number>): void { this.ensure(b.length); for (let k = 0; k < b.length; k++) this.buf[this.len++] = b[k]! & 0xff; }
  zeros(n: number): void { this.ensure(n); this.buf.fill(0, this.len, this.len + n); this.len += n; }
  /** 回填已写位置的 u32（容器总长占位）。 */
  patchU32be(at: number, v: number): void { if (at < 0 || at + 4 > this.len) throw new RangeError('ByteWriter.patchU32be: 位置越界'); this.view.setUint32(at, v >>> 0, false); }
  toUint8Array(): Uint8Array { return this.buf.slice(0, this.len); }
  toArrayBuffer(): ArrayBuffer { return this.buf.slice(0, this.len).buffer as ArrayBuffer; }
}

/** 字符串 → UTF-8 字节（手写，避免依赖 DOM 的 TextEncoder）。 */
export function encodeUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let k = 0; k < s.length; k++) {
    let cp = s.charCodeAt(k);
    if (cp >= 0xd800 && cp <= 0xdbff && k + 1 < s.length) {
      const lo = s.charCodeAt(k + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) { cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00); k++; }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}

/** UTF-8 字节 → 字符串；序列非法时返回 null（调用方回退 Latin-1）。 */
export function decodeUtf8(b: ArrayLike<number>): string | null {
  let s = '';
  for (let k = 0; k < b.length;) {
    const c = b[k]!;
    let cp: number, n: number;
    if (c < 0x80) { cp = c; n = 0; }
    else if ((c & 0xe0) === 0xc0) { cp = c & 0x1f; n = 1; }
    else if ((c & 0xf0) === 0xe0) { cp = c & 0x0f; n = 2; }
    else if ((c & 0xf8) === 0xf0) { cp = c & 0x07; n = 3; }
    else return null;
    for (let j = 1; j <= n; j++) {
      const d = b[k + j];
      if (d === undefined || (d & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (d & 0x3f);
    }
    if ((n === 1 && cp < 0x80) || (n === 2 && cp < 0x800) || (n === 3 && cp < 0x10000) || cp > 0x10ffff) return null;
    s += cp < 0x10000 ? String.fromCharCode(cp) : String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
    k += n + 1;
  }
  return s;
}

/** Latin-1 字节 → 字符串。 */
export function decodeLatin1(b: ArrayLike<number>): string {
  let s = ''; for (let k = 0; k < b.length; k++) s += String.fromCharCode(b[k]!);
  return s;
}
