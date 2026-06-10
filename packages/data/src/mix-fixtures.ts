/**
 * 测试夹具：构造合成 MIX 文件。
 * 加密夹具用泄露的 Westwood 配对私钥指数（仅测试用）对 key 做「签名式」
 * 加密，再由解析器用公钥还原 —— 完整验证 RSA/Blowfish/头解析整条链路。
 */
import { Blowfish } from './blowfish';
import { mixIdRA2 } from './crc32';
import {
  bigIntToBytesLE,
  bytesLEToBigInt,
  derIntegerToBigInt,
  modPow,
  westwoodModulus,
} from './mix-crypto';

/** 泄露的 Westwood 私钥指数（keys.ini，历史公开事实；仅测试使用）。 */
const WESTWOOD_PRIVATE_EXPONENT_B64 = 'AigKVje8mROcR8QixnxUEF5b29Curkq01DNDWCdOG99XBqH79OaCiTCB';

export function westwoodPrivateExponent(): bigint {
  const bin = atob(WESTWOOD_PRIVATE_EXPONENT_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return derIntegerToBigInt(bytes);
}

/** 用私钥把 56 字节 Blowfish key 加密成 80 字节 key source（两块 39→40）。 */
export function encryptKeySource(key56: Uint8Array): Uint8Array {
  const n = westwoodModulus();
  const d = westwoodPrivateExponent();
  const out = new Uint8Array(80);
  const padded = new Uint8Array(78);
  padded.set(key56);
  for (let b = 0; b < 2; b++) {
    const m = bytesLEToBigInt(padded.subarray(b * 39, (b + 1) * 39));
    const c = modPow(m, d, n);
    out.set(bigIntToBytesLE(c, 40), b * 40);
  }
  return out;
}

export interface FixtureFile {
  name: string;
  data: Uint8Array;
}

/** 构造新式（带 flags）MIX，可选加密头。 */
export function buildMix(files: FixtureFile[], opts: { encrypted?: boolean; key?: Uint8Array } = {}): Uint8Array {
  const entries: { id: number; offset: number; size: number }[] = [];
  let dataSize = 0;
  const bodies: Uint8Array[] = [];
  for (const f of files) {
    entries.push({ id: mixIdRA2(f.name), offset: dataSize, size: f.data.length });
    dataSize += f.data.length;
    bodies.push(f.data);
  }
  // 索引按有符号 id 排序（原版规范）
  entries.sort((a, b) => (a.id | 0) - (b.id | 0));

  const header = new Uint8Array(6 + entries.length * 12);
  const hv = new DataView(header.buffer);
  hv.setUint16(0, entries.length, true);
  hv.setUint32(2, dataSize, true);
  entries.forEach((e, i) => {
    hv.setUint32(6 + i * 12, e.id, true);
    hv.setUint32(6 + i * 12 + 4, e.offset, true);
    hv.setUint32(6 + i * 12 + 8, e.size, true);
  });

  if (!opts.encrypted) {
    const out = new Uint8Array(4 + header.length + dataSize);
    // flags = 0（前两字节为 0 表示新式头）
    out.set(header, 4);
    let o = 4 + header.length;
    for (const b of bodies) {
      out.set(b, o);
      o += b.length;
    }
    return out;
  }

  const key = opts.key ?? new Uint8Array(Array.from({ length: 56 }, (_, i) => (i * 73 + 5) & 0xff));
  const keySource = encryptKeySource(key);
  const padded = new Uint8Array(Math.ceil(header.length / 8) * 8);
  padded.set(header);
  const cipherHeader = new Blowfish(key).encryptECB(padded);

  const out = new Uint8Array(4 + 80 + cipherHeader.length + dataSize);
  new DataView(out.buffer).setUint32(0, 0x00020000, true);
  out.set(keySource, 4);
  out.set(cipherHeader, 84);
  let o = 84 + cipherHeader.length;
  for (const b of bodies) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}
