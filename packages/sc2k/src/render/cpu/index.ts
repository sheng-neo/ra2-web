// ===== render/cpu/index.ts =====（WP10；CONTRACTS §V RenderEntry.cpuCompositor 的真实现出口）
// CPU 合成 + 无依赖 PNG + 缩略图纯函数（tsconfig.sim.json 下编译，无 DOM）。
// render/index.ts（WP11）把 cpuCompositor 切到这里：`export { cpuCompositor } from './cpu'`。
import type { CpuCompositor } from '../../contracts/render';
import { cpuCompositor } from './compositor';

export { cpuCompositor, render, toRgba, renderRgba, blit, sortByZ } from './compositor';
export type { Rect } from './compositor';
export { encodePng, filterRows, crc32, adler32, zlibStore, zlibDeflate, deflateFixed, CRC_TABLE, PNG_SIGNATURE } from './png';
export type { PngOptions, PngFilter } from './png';
export { thumbnailRgba, thumbnailPng, thumbnailScaleOf, boxDownsample } from './thumbnail';
export type { ThumbnailDeps } from './thumbnail';

cpuCompositor satisfies CpuCompositor;
