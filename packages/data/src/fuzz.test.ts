import { describe, expect, it } from 'vitest';
import { parseShp } from './shp';
import { parseTmp } from './tmp';
import { parseVxl } from './vxl';
import { parseCsf } from './csf';
import { IniFile } from './ini';
import { Palette } from './pal';
import { lzo1xDecompress } from './lzo';
import { format80Decompress } from './format80';

/**
 * 健壮性：解析器对随机/截断/恶意数据必须「抛 Error 或返回」，
 * 绝不允许卡死、OOM 或抛非 Error。资源浏览器/真实素材会遍历大量条目，
 * 单个坏条目不能拖垮整页。
 */
function randomBytes(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out[i] = (s >>> 16) & 0xff;
  }
  return out;
}

describe('解析器健壮性（坏数据不崩）', () => {
  const sizes = [0, 1, 7, 16, 64, 803, 1024, 4096];
  for (const size of sizes) {
    it(`随机 ${size} 字节：各解析器只抛 Error 不卡死`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const bytes = randomBytes(size, seed * 31 + size);
        const tryParse = (fn: () => unknown): void => {
          try {
            fn();
          } catch (e) {
            expect(e).toBeInstanceOf(Error); // 必须是受控错误，不是别的
          }
        };
        tryParse(() => parseShp(bytes));
        tryParse(() => parseTmp(bytes));
        tryParse(() => parseVxl(bytes));
        tryParse(() => parseCsf(bytes));
        tryParse(() => Palette.parse(bytes));
        tryParse(() => lzo1xDecompress(bytes, 256));
        tryParse(() => format80Decompress(bytes, 256));
        // INI 永远不该抛（任意字节按文本解析）
        expect(() => IniFile.fromBytes(bytes)).not.toThrow();
      }
    });
  }

  it('截断的合法头（SHP/VXL）不卡死', () => {
    // 声称很大但数据不足
    const shp = new Uint8Array(8);
    new DataView(shp.buffer).setUint16(6, 5000, true); // 5000 帧但无数据
    expect(() => parseShp(shp)).toThrow();

    const vxl = new Uint8Array(810);
    new TextEncoder().encodeInto('Voxel Animation\0', vxl);
    new DataView(vxl.buffer).setUint32(20, 999999, true); // 巨量 limb
    expect(() => parseVxl(vxl)).toThrow();
  });
});
