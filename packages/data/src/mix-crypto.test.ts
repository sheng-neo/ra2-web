import { describe, expect, it } from 'vitest';
import {
  bigIntToBytesLE,
  bytesLEToBigInt,
  decryptKeySource,
  modPow,
  westwoodModulus,
  WESTWOOD_PUBLIC_EXPONENT,
} from './mix-crypto';
import { encryptKeySource, westwoodPrivateExponent } from './mix-fixtures';

describe('mix-crypto 基础件', () => {
  it('modPow', () => {
    expect(modPow(4n, 13n, 497n)).toBe(445n);
    expect(modPow(2n, 0n, 7n)).toBe(1n);
  });

  it('小端 bigint 往返', () => {
    const bytes = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
    expect(bytesLEToBigInt(bytes)).toBe(0x12345678n);
    expect(bigIntToBytesLE(0x12345678n, 4)).toEqual(bytes);
  });

  it('Westwood 公钥模数为 320 位整数', () => {
    const n = westwoodModulus();
    expect(n.toString(2).length).toBeGreaterThan(312);
    expect(n.toString(2).length).toBeLessThanOrEqual(320);
    expect(n & 1n).toBe(1n); // RSA 模数必为奇数
  });
});

describe('key source RSA 链路', () => {
  it('公私钥确为配对：私钥加密 → 公钥解密还原', () => {
    // 该往返若通过，即数学上证明了两个常量是有效 RSA 对
    const key = new Uint8Array(56);
    for (let i = 0; i < 56; i++) key[i] = (i * 199 + 31) & 0xff;
    const keySource = encryptKeySource(key);
    expect(keySource.length).toBe(80);
    expect(decryptKeySource(keySource)).toEqual(key);
  });

  it('指数常量符合预期', () => {
    expect(WESTWOOD_PUBLIC_EXPONENT).toBe(65537n);
    expect(westwoodPrivateExponent() > 1n).toBe(true);
  });
});
