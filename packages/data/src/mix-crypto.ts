/**
 * Westwood MIX 加密头的密钥推导：
 * 80 字节 key source = 2 个 40 字节小端大整数块，各做 RSA 公钥幂运算
 * （公钥随游戏二进制发布，为公开常量），每块得到 39 字节小端明文，
 * 拼接后取前 56 字节作为 Blowfish key。
 */

/** Westwood 公钥模数（base64 DER 整数，tag 0x02 + 长度 0x28 + 40 字节大端）。 */
export const WESTWOOD_PUBLIC_MODULUS_B64 = 'AihRvNoIbTn85FZRYNZRcT+i6KpU+maCsEqr3Q5q+LDB5tH7Tz2qQ38V';
export const WESTWOOD_PUBLIC_EXPONENT = 65537n;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 解析 DER INTEGER（tag 0x02），返回大端字节串对应的 bigint。 */
export function derIntegerToBigInt(der: Uint8Array): bigint {
  if (der[0] !== 0x02) throw new Error('不是 DER INTEGER');
  let len = der[1]!;
  let off = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | der[off++]!;
  }
  let v = 0n;
  for (let i = 0; i < len; i++) v = (v << 8n) | BigInt(der[off + i]!);
  return v;
}

export function bytesLEToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]!);
  return v;
}

export function bigIntToBytesLE(v: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error('bigint 超出目标长度');
  return out;
}

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

export function westwoodModulus(): bigint {
  return derIntegerToBigInt(base64ToBytes(WESTWOOD_PUBLIC_MODULUS_B64));
}

/**
 * 80 字节 key source → 56 字节 Blowfish key。
 * modulus/exponent 可注入以便测试；默认 Westwood 公钥。
 */
export function decryptKeySource(
  keySource: Uint8Array,
  modulus: bigint = westwoodModulus(),
  exponent: bigint = WESTWOOD_PUBLIC_EXPONENT,
): Uint8Array {
  const inBlock = Math.ceil(modulus.toString(2).length / 8); // 40
  const outBlock = inBlock - 1; // 39
  if (keySource.length % inBlock !== 0) {
    throw new Error(`key source 长度应为 ${inBlock} 的倍数: ${keySource.length}`);
  }
  const blocks = keySource.length / inBlock;
  const plain = new Uint8Array(blocks * outBlock);
  for (let b = 0; b < blocks; b++) {
    const c = bytesLEToBigInt(keySource.subarray(b * inBlock, (b + 1) * inBlock));
    const m = modPow(c, exponent, modulus);
    plain.set(bigIntToBytesLE(m, outBlock), b * outBlock);
  }
  return plain.subarray(0, 56);
}
