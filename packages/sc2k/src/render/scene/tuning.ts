// ===== render/scene/tuning.ts =====（spec:ui-art §3.6.2 / §3.7 / §3.9.1、ARCHITECTURE §6.2–§6.3）
// 场景编译的全部 [设计] / [低] 数值集中于此；compiler / picking / minimap 代码里不写魔法数。
import { OverlayId } from '../../contracts/render';

export interface AnimSpec { frames: number; fps: number }

export interface SceneTuning {
  /** 平地色海拔分带：i = 3 + floor(alt / altBandDiv)，共 altBands 带（0–10 / 11–21 / 22–31）。 */
  altBandDiv: number;
  altBands: number;
  /** 地形 1 px 噪点变体数（variant = altBand·terrainVariants + noise）与 hashNoise 种子。 */
  terrainVariants: number;
  terrainNoiseSeed: number;
  /** 地下视图地表的 variant（contracts/render.ts：terrain variant 0x80 位）。 */
  undergroundVariant: number;
  /** 水深分带数：water variant = min(waterLevel − alt, waterDepthBands − 1)。 */
  waterDepthBands: number;
  /** 岸边 / 浅水 / 溪流 / 瀑布项画在 alt（false）还是 waterLevel（true）；水下 0x1X 恒画在 waterLevel（ARCHITECTURE §6.3）。 */
  waterSurfaceAtLevel: boolean;
  /** 动画节拍频率（Hz）：frame = floor(animTick · fps / animTickHz) mod frames。24 可被 2/3/4/6/8 整除。 */
  animTickHz: number;
  /** 覆盖物帧数 / fps（spec:ui-art §3.9.1）。 */
  anim: Readonly<Record<'fire' | 'flood' | 'toxic' | 'riot' | 'traffic', AnimSpec>>;
  /** 车流阈值缺省（RenderSnapshot.trafficLight / trafficHeavy 为 NaN / 非正时回退）。 */
  trafficLightDefault: number;
  trafficHeavyDefault: number;
  /** 玩家告示牌的 XTXT 区间与邻城连接牌值（spec:file-formats §2.2.7）。 */
  signMin: number;
  signMax: number;
  connectionXtxt: number;
  /** 小地图热力层：医院 / 教育覆盖半径（Chebyshev，格），v1 由建筑位置派生（spec:ui-art §2.5.1 [M]）。 */
  minimapHealthRadius: number;
  minimapEducationRadius: number;
}

export const DEFAULT_SCENE_TUNING: SceneTuning = {
  altBandDiv: 11,
  altBands: 3,
  terrainVariants: 4,
  terrainNoiseSeed: 0x5c2b,
  undergroundVariant: 0x80,
  waterDepthBands: 4,
  waterSurfaceAtLevel: false,
  animTickHz: 24,
  anim: {
    fire: { frames: 4, fps: 8 },
    flood: { frames: 3, fps: 3 },
    toxic: { frames: 3, fps: 2 },
    riot: { frames: 2, fps: 4 },
    traffic: { frames: 4, fps: 6 },
  },
  trafficLightDefault: 48,
  trafficHeavyDefault: 160,
  signMin: 0x01,
  signMax: 0x32,
  connectionXtxt: 0xfa,
  minimapHealthRadius: 12,
  minimapEducationRadius: 10,
};

/** 覆盖物 id → 动画规格键（无动画的覆盖物不在表内）。 */
export const OVERLAY_ANIM: Readonly<Partial<Record<number, keyof SceneTuning['anim']>>> = {
  [OverlayId.Fire]: 'fire', [OverlayId.Flood]: 'flood', [OverlayId.Toxic]: 'toxic', [OverlayId.Riot]: 'riot',
  [OverlayId.TrafficLight]: 'traffic', [OverlayId.TrafficHeavy]: 'traffic',
};

/** 由动画节拍派生帧号（spec:ui-art §3.10：同组同相位）。 */
export const frameOf = (animTick: number, spec: AnimSpec, tickHz: number): number =>
  spec.frames <= 1 ? 0 : Math.floor((Math.max(0, animTick | 0) * spec.fps) / tickHz) % spec.frames;
