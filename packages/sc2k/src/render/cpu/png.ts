// ===== render/cpu/png.ts =====（CONTRACTS §Q CpuCompositor.encodePng；ARCHITECTURE §6.4）
// 无依赖 PNG 编码器（Node / 浏览器皆可，无 DOM）：IHDR + 单 IDAT + IEND，8 bit RGBA。
// IDAT 的 zlib 流两种：stored 块（zlibStore，字节级可预测）或 LZ77 + 固定 Huffman（deflateFixed，默认；RFC 1951 §3.2.6）。
// 一切确定性：同输入同字节。

// ---- CRC32 / Adler32 ----
export const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  // 5552 = 每批最多字节数而不溢出 32 位（zlib 的 NMAX）
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(bytes.length, i + 5552);
    for (; i < end; i++) { a += bytes[i]!; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// ---- zlib stored ----
/** zlib 流：CMF/FLG 0x78 0x01 + stored 块（每块 ≤ 65535 B）+ Adler32 大端。 */
export function zlibStore(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let o = 0;
  out[o++] = 0x78; out[o++] = 0x01;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535, len = Math.min(65535, raw.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 0xff; out[o++] = (len >>> 8) & 0xff;
    out[o++] = ~len & 0xff; out[o++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), o); o += len;
  }
  const ad = adler32(raw);
  out[o++] = (ad >>> 24) & 0xff; out[o++] = (ad >>> 16) & 0xff; out[o++] = (ad >>> 8) & 0xff; out[o++] = ad & 0xff;
  return out.subarray(0, o);
}

// ---- deflate：LZ77 + 固定 Huffman ----
/** LSB 先行的位写入器（deflate 位序）；Huffman 码按 MSB 先行写入（写前反转）。 */
class BitWriter {
  private buf: Uint8Array;
  private pos = 0;
  private acc = 0;
  private n = 0;
  constructor(cap: number) { this.buf = new Uint8Array(Math.max(16, cap)); }
  private grow(): void { const b = new Uint8Array(this.buf.length * 2); b.set(this.buf); this.buf = b; }
  writeBits(value: number, count: number): void {
    this.acc |= (value & ((1 << count) - 1)) << this.n;
    this.n += count;
    while (this.n >= 8) {
      if (this.pos >= this.buf.length) this.grow();
      this.buf[this.pos++] = this.acc & 0xff;
      this.acc >>>= 8; this.n -= 8;
    }
  }
  /** Huffman 码：MSB 先行 → 反转后按 LSB 先行写。 */
  writeCode(code: number, len: number): void {
    let r = 0;
    for (let k = 0; k < len; k++) r = (r << 1) | ((code >>> k) & 1);
    this.writeBits(r, len);
  }
  finish(): Uint8Array {
    if (this.n > 0) { if (this.pos >= this.buf.length) this.grow(); this.buf[this.pos++] = this.acc & 0xff; this.acc = 0; this.n = 0; }
    return this.buf.subarray(0, this.pos);
  }
}

const LEN_BASE: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE: readonly number[] = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA: readonly number[] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** 长度 3..258 → 长度码下标（0..28）。 */
const LEN_SLOT: Uint8Array = (() => {
  const t = new Uint8Array(259);
  for (let s = 0; s < 29; s++) { const hi = s === 28 ? 258 : LEN_BASE[s + 1]! - 1; for (let l = LEN_BASE[s]!; l <= hi; l++) t[l] = s; }
  return t;
})();
const distSlot = (d: number): number => { let s = 29; while (s > 0 && DIST_BASE[s]! > d) s--; return s; };

/** 固定 Huffman 的字面 / 长度符号码（RFC 1951 §3.2.6）。 */
function writeLit(bw: BitWriter, sym: number): void {
  if (sym <= 143) bw.writeCode(0x30 + sym, 8);
  else if (sym <= 255) bw.writeCode(0x190 + (sym - 144), 9);
  else if (sym <= 279) bw.writeCode(sym - 256, 7);
  else bw.writeCode(0xc0 + (sym - 280), 8);
}

const WINDOW = 32768, WMASK = WINDOW - 1, HASH_BITS = 15, HMASK = (1 << HASH_BITS) - 1, MIN_MATCH = 3, MAX_MATCH = 258, MAX_CHAIN = 48;
const hash3 = (raw: Uint8Array, i: number): number => ((raw[i]! << 10) ^ (raw[i + 1]! << 5) ^ raw[i + 2]!) & HMASK;

/** 原始 deflate 流（单个 BFINAL=1 / BTYPE=01 块）：贪心 LZ77（哈希链、窗口 32 K、链长 ≤ 48）+ 固定 Huffman。 */
export function deflateFixed(raw: Uint8Array): Uint8Array {
  const n = raw.length;
  const bw = new BitWriter(Math.ceil((n * 9) / 8) + 16);
  bw.writeBits(1, 1);          // BFINAL
  bw.writeBits(1, 2);          // BTYPE = 01（固定 Huffman）
  const head = new Int32Array(1 << HASH_BITS).fill(-1);
  const prev = new Int32Array(WINDOW).fill(-1);
  const insert = (i: number): void => { const h = hash3(raw, i); prev[i & WMASK] = head[h]!; head[h] = i; };
  let i = 0;
  while (i < n) {
    let bestLen = 0, bestDist = 0;
    if (i + MIN_MATCH <= n) {
      const h = hash3(raw, i);
      const maxLen = Math.min(MAX_MATCH, n - i);
      let cand = head[h]!, chain = 0;
      while (cand >= 0 && i - cand <= WINDOW && chain++ < MAX_CHAIN) {
        if (raw[cand + bestLen] === raw[i + bestLen] && raw[cand] === raw[i]) {
          let l = 0;
          while (l < maxLen && raw[cand + l] === raw[i + l]) l++;
          if (l > bestLen) { bestLen = l; bestDist = i - cand; if (l === maxLen) break; }
        }
        const nx = prev[cand & WMASK]!;
        if (nx >= cand) break;   // 陈旧链（被覆盖）
        cand = nx;
      }
      insert(i);
    }
    if (bestLen >= MIN_MATCH) {
      const ls = LEN_SLOT[bestLen]!;
      writeLit(bw, 257 + ls);
      if (LEN_EXTRA[ls]! > 0) bw.writeBits(bestLen - LEN_BASE[ls]!, LEN_EXTRA[ls]!);
      const ds = distSlot(bestDist);
      bw.writeCode(ds, 5);
      if (DIST_EXTRA[ds]! > 0) bw.writeBits(bestDist - DIST_BASE[ds]!, DIST_EXTRA[ds]!);
      for (let k = 1; k < bestLen && i + k + MIN_MATCH <= n; k++) insert(i + k);
      i += bestLen;
    } else {
      writeLit(bw, raw[i]!);
      i++;
    }
  }
  writeLit(bw, 256);           // EOB
  return bw.finish();
}

/** zlib 流：0x78 0x9C + deflateFixed + Adler32 大端。 */
export function zlibDeflate(raw: Uint8Array): Uint8Array {
  const body = deflateFixed(raw);
  const out = new Uint8Array(2 + body.length + 4);
  out[0] = 0x78; out[1] = 0x9c;
  out.set(body, 2);
  const ad = adler32(raw);
  let o = 2 + body.length;
  out[o++] = (ad >>> 24) & 0xff; out[o++] = (ad >>> 16) & 0xff; out[o++] = (ad >>> 8) & 0xff; out[o] = ad & 0xff;
  return out;
}

// ---- PNG ----
export type PngFilter = 'none' | 'sub' | 'up';
export interface PngOptions { compress?: boolean /*默认 true：LZ77 + 固定 Huffman；false：stored*/; filter?: PngFilter /*默认 'none'*/ }

const writeU32 = (buf: Uint8Array, at: number, v: number): void => { buf[at] = (v >>> 24) & 0xff; buf[at + 1] = (v >>> 16) & 0xff; buf[at + 2] = (v >>> 8) & 0xff; buf[at + 3] = v & 0xff; };
function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  writeU32(out, 0, body.length);
  for (let k = 0; k < 4; k++) out[4 + k] = type.charCodeAt(k);
  out.set(body, 8);
  writeU32(out, 8 + body.length, crc32(out, 4, 8 + body.length));
  return out;
}
export const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 扫描行滤波（PNG 规范 §9）：None / Sub / Up。 */
export function filterRows(rgba: Uint8ClampedArray, w: number, h: number, filter: PngFilter): Uint8Array {
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  const ft = filter === 'sub' ? 1 : filter === 'up' ? 2 : 0;
  for (let y = 0; y < h; y++) {
    const ro = y * (stride + 1), so = y * stride;
    raw[ro] = ft;
    for (let k = 0; k < stride; k++) {
      const cur = rgba[so + k]!;
      const left = ft === 1 && k >= 4 ? rgba[so + k - 4]! : 0;
      const up = ft === 2 && y > 0 ? rgba[so - stride + k]! : 0;
      raw[ro + 1 + k] = (cur - left - up) & 0xff;
    }
  }
  return raw;
}

/** 8 bit RGBA PNG 字节。 */
export function encodePng(rgba: Uint8ClampedArray, w: number, h: number, opts: PngOptions = {}): Uint8Array {
  if (!(w >= 0 && h >= 0) || rgba.length < w * h * 4) throw new RangeError(`encodePng: rgba 长度 ${rgba.length} < ${w}×${h}×4`);
  const raw = filterRows(rgba, w, h, opts.filter ?? 'none');
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, w); writeU32(ihdr, 4, h);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8 bit、RGBA、deflate、自适应滤波、无交错
  const idat = opts.compress === false ? zlibStore(raw) : zlibDeflate(raw);
  const parts = [Uint8Array.from(PNG_SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
