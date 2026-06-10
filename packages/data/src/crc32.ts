/** 标准 CRC32（IEEE 802.3，反射多项式 0xEDB88320）。 */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * TS/RA2 系 MIX 文件名补位规则：大写后若长度不是 4 的倍数，
 * 先追加一个字节 = (len & 3)，再用「最后一个完整 4 字节块之后首字符」
 * 补齐到 4 的倍数。与 XCC/ccmix 的 get_id 一致。
 */
export function padMixName(name: string): string {
  let s = name.toUpperCase();
  const l = s.length;
  if (l & 3) {
    const a = l >> 2;
    s += String.fromCharCode(l - (a << 2));
    let i = 3 - (l & 3);
    while (i-- > 0) s += s[a << 2]!;
  }
  return s;
}

/** 文件名 → RA2 MIX 条目 ID（无符号 32 位）。 */
export function mixIdRA2(name: string): number {
  const padded = padMixName(name);
  const bytes = new Uint8Array(padded.length);
  for (let i = 0; i < padded.length; i++) bytes[i] = padded.charCodeAt(i) & 0xff;
  return crc32(bytes);
}
