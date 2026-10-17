// ===== footprint.ts =====（spec:building-catalogue §3.2 / §3.3）
// 占地与锚点：没有实例表，占地只由 XBLD 值与 XZON 角标推出（CONTRACTS §C）。
import { Corner, tileIndex, tileX, tileY } from './grid';
export type Footprint = 1 | 2 | 3 | 4;
/** 占地区间（闭区间，含端点）；FOOTPRINT 由此生成，data/buildings.generated.ts 的 size 列用测试与此对账。 */
export const FOOTPRINT_RANGES: Readonly<Record<2 | 3 | 4, ReadonlyArray<readonly [number, number]>>> = {
  2: [[0x61, 0x6b], [0x8c, 0xad], [0xeb, 0xf7]],
  3: [[0xae, 0xc5], [0xd0, 0xd6], [0xf8, 0xfa]],
  4: [[0xc9, 0xcf], [0xd7, 0xda], [0xfb, 0xff]] };
function buildFootprint(): Uint8Array {
  const t = new Uint8Array(256).fill(1);
  for (const s of [2, 3, 4] as const) for (const [lo, hi] of FOOTPRINT_RANGES[s]) for (let id = lo; id <= hi; id++) t[id] = s;
  return t;
}
/**
 * FOOTPRINT[id] = 占地边长。2×2: 0x61–0x6B, 0x8C–0xAD, 0xEB–0xF7；3×3: 0xAE–0xC5, 0xD0–0xD6, 0xF8–0xFA；4×4: 0xC9–0xCF, 0xD7–0xDA, 0xFB–0xFF；其余 1（0x49/0x4A 高速直线段按 1 计）。
 * data/buildings.generated.ts 的 size 列用测试与此表对账，不得另写尺寸表。
 */
export const FOOTPRINT: Uint8Array = buildFootprint();                      // 256
export interface AnchorLayers { xbld: Uint8Array; xzon: Uint8Array }
/** 占地 (ax,ay,s) 内每格 xbld 是否都等于 id（经 tileIndex 偏移，不用 i±128）。 */
export function lotIsUniform(l: AnchorLayers, ax: number, ay: number, s: number, id: number): boolean {
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) if (l.xbld[tileIndex(ax + dx, ay + dy)] !== id) return false;
  return true;
}
/** 格 → 世界 TL 锚格；xbld < 0x0E 返回 −1；1×1 返回自身；多格最多探测 16 次；损坏（找不到带 TL 位且占地一致的锚点）返回 −1，调用方按 1×1 处理并记诊断。 */
export function anchorOf(l: AnchorLayers, i: number): number {
  const id = l.xbld[i]!; if (id < 0x0e) return -1;
  const s = FOOTPRINT[id]!; if (s === 1) return i;
  const x = tileX(i), y = tileY(i);
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) {
    const ax = x - dx, ay = y - dy;
    if (ax < 0 || ay < 0 || ax + s > 128 || ay + s > 128) continue;
    const a = tileIndex(ax, ay);
    if (l.xbld[a] !== id || (l.xzon[a]! & Corner.TL) === 0) continue;
    if (lotIsUniform(l, ax, ay, s, id)) return a;
  }
  return -1;
}
/** 遍历占地：fn(i, dx, dy)，dx/dy 为相对锚格偏移（0..n−1）。 */
export function forEachLotTile(anchor: number, n: number, fn: (i: number, dx: number, dy: number) => void): void {
  const x0 = tileX(anchor), y0 = tileY(anchor);
  for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) fn(tileIndex(x0 + dx, y0 + dy), dx, dy);
}
/** 写 XZON 高 4 位用：1×1 → 0xF0；角格 TL/TR/BL/BR；内部与边中格 0。 */
export function cornerBits(n: number, dx: number, dy: number): number {
  if (n === 1) return Corner.All;
  const l = dx === 0, r = dx === n - 1, t = dy === 0, b = dy === n - 1;
  return (l && t ? Corner.TL : 0) | (r && t ? Corner.TR : 0) | (l && b ? Corner.BL : 0) | (r && b ? Corner.BR : 0);
}
export const isAnchorTile = (l: AnchorLayers, i: number): boolean => l.xbld[i]! >= 0x0e && (l.xzon[i]! & Corner.TL) !== 0;
