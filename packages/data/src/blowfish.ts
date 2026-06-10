/**
 * Blowfish 分组密码（Schneier 公开规范实现）。
 * Westwood MIX 加密头按 8 字节块 ECB 处理，块内按大端取两个 32 位字。
 */
import { BLOWFISH_P, BLOWFISH_S } from './blowfish-constants';

export class Blowfish {
  private readonly p = Uint32Array.from(BLOWFISH_P);
  private readonly s: Uint32Array[];

  constructor(key: Uint8Array) {
    if (key.length === 0) throw new Error('Blowfish key 不能为空');
    this.s = BLOWFISH_S.map((box) => Uint32Array.from(box));

    for (let i = 0, j = 0; i < 18; i++) {
      let data = 0;
      for (let k = 0; k < 4; k++) {
        data = ((data << 8) | key[j]!) >>> 0;
        j = (j + 1) % key.length;
      }
      this.p[i] = (this.p[i]! ^ data) >>> 0;
    }

    let l = 0;
    let r = 0;
    for (let i = 0; i < 18; i += 2) {
      [l, r] = this.encryptWords(l, r);
      this.p[i] = l;
      this.p[i + 1] = r;
    }
    for (let b = 0; b < 4; b++) {
      const box = this.s[b]!;
      for (let i = 0; i < 256; i += 2) {
        [l, r] = this.encryptWords(l, r);
        box[i] = l;
        box[i + 1] = r;
      }
    }
  }

  private f(x: number): number {
    const s = this.s;
    const h = (s[0]![(x >>> 24) & 0xff]! + s[1]![(x >>> 16) & 0xff]!) >>> 0;
    return (((h ^ s[2]![(x >>> 8) & 0xff]!) >>> 0) + s[3]![x & 0xff]!) >>> 0;
  }

  encryptWords(l: number, r: number): [number, number] {
    const p = this.p;
    for (let i = 0; i < 16; i++) {
      l = (l ^ p[i]!) >>> 0;
      r = (r ^ this.f(l)) >>> 0;
      const t = l;
      l = r;
      r = t;
    }
    const t = l;
    l = r;
    r = t;
    r = (r ^ p[16]!) >>> 0;
    l = (l ^ p[17]!) >>> 0;
    return [l, r];
  }

  decryptWords(l: number, r: number): [number, number] {
    const p = this.p;
    for (let i = 17; i > 1; i--) {
      l = (l ^ p[i]!) >>> 0;
      r = (r ^ this.f(l)) >>> 0;
      const t = l;
      l = r;
      r = t;
    }
    const t = l;
    l = r;
    r = t;
    r = (r ^ p[1]!) >>> 0;
    l = (l ^ p[0]!) >>> 0;
    return [l, r];
  }

  /** ECB 加密，length 必须为 8 的倍数。返回新数组。 */
  encryptECB(data: Uint8Array): Uint8Array {
    return this.runECB(data, (l, r) => this.encryptWords(l, r));
  }

  /** ECB 解密，length 必须为 8 的倍数。返回新数组。 */
  decryptECB(data: Uint8Array): Uint8Array {
    return this.runECB(data, (l, r) => this.decryptWords(l, r));
  }

  private runECB(data: Uint8Array, fn: (l: number, r: number) => [number, number]): Uint8Array {
    if (data.length % 8 !== 0) throw new Error(`ECB 数据长度需为 8 的倍数: ${data.length}`);
    const out = new Uint8Array(data.length);
    const src = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const dst = new DataView(out.buffer);
    for (let o = 0; o < data.length; o += 8) {
      const [l, r] = fn(src.getUint32(o, false), src.getUint32(o + 4, false));
      dst.setUint32(o, l, false);
      dst.setUint32(o + 4, r, false);
    }
    return out;
  }
}
