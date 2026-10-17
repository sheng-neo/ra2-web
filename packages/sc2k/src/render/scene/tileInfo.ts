// ===== render/scene/tileInfo.ts =====（spec:terrain §2.5 / §2.6、spec:ui-art §2.9.2 / §3.6.2 / §3.7.2）
// 单格地形 / 水面的纯分类：旋转后坡面码与角位、海拔分带、水面精灵号 0..20、水面基准海拔与水深带、拾取用表面。
import { XterClass, xterClassOf } from '../../contracts/grid';
import type { Rotation } from '../../contracts/rotation';
import { SLOPE_CORNERS, rotateXter } from '../../contracts/rotation';
import type { SceneTuning } from './tuning';

/** water 族 id 的固定段（spec:ui-art §2.9.2：270+n）：0 整块、1–13 岸形 / 孤立水、14 瀑布、15–20 溪流 / 水湾。 */
export const WATER_FULL = 0, WATER_WATERFALL = 14, WATER_STREAM_BASE = 15, WATER_SHAPE_COUNT = 21;
export const BEDROCK_SLOPE = 13;

/** 旋转后的坡面码 0..13：干地 / 水下 / 岸边取旋转后低 nibble；浅水（0x3X 低 nibble 是形状码不是高度）与溪流为 0；瀑布为 13（bedrock 高台）。 */
export function rotatedSlopeOf(xter: number, rot: Rotation): number {
  const cls = xterClassOf(xter);
  if (cls === XterClass.Waterfall) return BEDROCK_SLOPE;
  if (cls === XterClass.Stream || cls === XterClass.Surface) return 0;
  const lo = rotateXter(xter, rot) & 0x0f;
  return lo <= 13 ? lo : 0;
}
/** 旋转后角位（SLOPE_CORNERS 编码：bit3 = c00'，bit2 = c10'，bit1 = c01'，bit0 = c11'）。 */
export const rotatedCornerBits = (xter: number, rot: Rotation): number => SLOPE_CORNERS[rotatedSlopeOf(xter, rot)]!;

export const isWaterXter = (xter: number): boolean => xterClassOf(xter) !== XterClass.Dry;

/** 水面精灵号：水下 0；岸边 n = 旋转后坡面码；浅水 n = 旋转后形状码；瀑布 14；溪流 / 水湾 15 + (旋转后码 − 0x40)。非水返回 −1。 */
export function waterSpriteOf(xter: number, rot: Rotation): number {
  switch (xterClassOf(xter)) {
    case XterClass.Dry: return -1;
    case XterClass.Submerged: return WATER_FULL;
    case XterClass.Waterfall: return WATER_WATERFALL;
    case XterClass.Stream: return WATER_STREAM_BASE + (rotateXter(xter, rot) - 0x40);
    default: { const lo = rotateXter(xter, rot) & 0x0f; return lo <= 13 ? lo : 0; }   // Shore / Surface
  }
}

/** 平地色海拔分带 0..altBands−1（spec:ui-art §3.6.2）。 */
export const altBandOf = (alt: number, t: SceneTuning): number => Math.max(0, Math.min(t.altBands - 1, Math.floor(alt / t.altBandDiv)));

/** 水面项的基准海拔：水下 0x1X 画在 waterLevel；岸边 / 浅水 / 溪流 / 瀑布画在 alt（tuning.waterSurfaceAtLevel 可切到 waterLevel）。 */
export function waterHeightOf(xter: number, alt: number, waterLevel: number, t: SceneTuning): number {
  const level = Math.max(alt, waterLevel);
  if (xterClassOf(xter) === XterClass.Submerged) return level;
  return t.waterSurfaceAtLevel ? level : alt;
}
/** 水深带 = min(waterLevel − alt, waterDepthBands − 1)，下限 0。 */
export const depthBandOf = (alt: number, waterLevel: number, t: SceneTuning): number => Math.max(0, Math.min(t.waterDepthBands - 1, waterLevel - alt));

/** 拾取用表面：水下格为 waterLevel 的平面（玩家看到的是水面）；bedrock 13 为 alt+1 的平台；其余为 alt + 旋转后角位。 */
export function pickSurfaceOf(xter: number, alt: number, waterLevel: number, rot: Rotation): { base: number; bits: number } {
  if (xterClassOf(xter) === XterClass.Submerged) return { base: Math.max(alt, waterLevel), bits: 0 };
  const slope = rotatedSlopeOf(xter, rot);
  if (slope === BEDROCK_SLOPE) return { base: alt + 1, bits: 0 };
  return { base: alt, bits: SLOPE_CORNERS[slope]! };
}
/** 四角中抬高的个数（0..4）；表面中心的海拔 = base + raised/4。 */
export const raisedCornerCount = (bits: number): number => (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1) + ((bits >> 3) & 1);
