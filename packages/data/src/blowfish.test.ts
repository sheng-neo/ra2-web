import { describe, expect, it } from 'vitest';
import { Blowfish } from './blowfish';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe('Blowfish（Schneier 官方测试向量）', () => {
  it('全零 key/明文', () => {
    const bf = new Blowfish(fromHex('0000000000000000'));
    expect(hex(bf.encryptECB(fromHex('0000000000000000')))).toBe('4ef997456198dd78');
  });

  it('全 FF key/明文', () => {
    const bf = new Blowfish(fromHex('ffffffffffffffff'));
    expect(hex(bf.encryptECB(fromHex('ffffffffffffffff')))).toBe('51866fd5b85ecb8a');
  });

  it('多块 ECB 加解密往返', () => {
    const key = new TextEncoder().encode('WestwoodBlowfishKey-56bytes-padding-padding-padding!!!42');
    expect(key.length).toBe(56);
    const bf = new Blowfish(key);
    const plain = new Uint8Array(64);
    for (let i = 0; i < plain.length; i++) plain[i] = (i * 37 + 11) & 0xff;
    const cipherText = bf.encryptECB(plain);
    expect(cipherText).not.toEqual(plain);
    expect(bf.decryptECB(cipherText)).toEqual(plain);
  });

  it('拒绝非 8 倍数长度', () => {
    const bf = new Blowfish(new Uint8Array([1, 2, 3]));
    expect(() => bf.encryptECB(new Uint8Array(7))).toThrow();
  });
});
