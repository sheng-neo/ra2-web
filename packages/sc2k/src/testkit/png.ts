// ===== testkit/png.ts =====（CONTRACTS §U pngOf：编译 + CPU 合成 + PNG 字节与 FNV 哈希）
// 经 render/index.ts 的 cpuCompositor（WP0 为桩实现，WP10 合入后自动切到 render/cpu）：render → toRgba → encodePng；
// hash = FNV-1a 32 over PNG 字节（PNG 编码器确定性，故等价于对像素哈希）。另给 bitmapHash 直接对索引位图哈希（不依赖编码器）。
import { FNV_OFFSET, fnv1aBytes } from '../contracts/prng';
import type { IndexedBitmap } from '../contracts/render';
import type { PngOfFn } from '../contracts/testkit';
import { cpuCompositor } from '../render';

export const pngOf: PngOfFn = (items, provider, scale, rect) => {
  const bmp = cpuCompositor.render(items, provider, scale, rect);
  const rgba = cpuCompositor.toRgba(bmp, provider.palette);
  const png = cpuCompositor.encodePng(rgba, bmp.w, bmp.h);
  return { png, hash: fnv1aBytes(FNV_OFFSET, png) >>> 0 };
};

/** 索引位图的 FNV 哈希（w、h 小端 4 字节 + data）。 */
export function bitmapHash(bmp: IndexedBitmap): number {
  const head = new Uint8Array([bmp.w & 0xff, (bmp.w >>> 8) & 0xff, (bmp.w >>> 16) & 0xff, (bmp.w >>> 24) & 0xff, bmp.h & 0xff, (bmp.h >>> 8) & 0xff, (bmp.h >>> 16) & 0xff, (bmp.h >>> 24) & 0xff]);
  return fnv1aBytes(fnv1aBytes(FNV_OFFSET, head), bmp.data) >>> 0;
}

/** 位图是否"非单色"（至少两种不同索引值；e2e 降级路径 headless --thumbnail 的断言）。 */
export function isMonochrome(bmp: IndexedBitmap): boolean {
  const first = bmp.data[0];
  for (let k = 1; k < bmp.data.length; k++) if (bmp.data[k] !== first) return false;
  return true;
}
