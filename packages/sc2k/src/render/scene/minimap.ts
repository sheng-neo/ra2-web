// ===== render/scene/minimap.ts =====（spec:ui-art §2.5.1 Map 窗口 15 种图层；ARCHITECTURE §6.9 minimap 走 LUT 不走 Pixi）
// 纯函数：图层 + 数据图 → 128×128 RGBA（世界坐标、不旋转；out[(y·128 + x)·4]）。配色为本项目原创 [设计]。
import type { MapLayerMode, RenderSnapshot } from '../../contracts/render';
import { DEVELOPED_FIRST, MAP, XBit, ZONE_MASK, halfIndex, quarterIndex, tileIndex } from '../../contracts/grid';
import { isHighway, isPipeUnd, isPowerCarrier, isRail, isRoad } from '../../contracts/net';
import { FOOTPRINT, anchorOf } from '../../contracts/footprint';
import { BUILDINGS, CATEGORY } from '../../data';
import { isWaterXter } from './tileInfo';
import { DEFAULT_SCENE_TUNING } from './tuning';
import type { SceneTuning } from './tuning';

export const MINIMAP_SIZE = MAP;
export const MINIMAP_BYTES = MAP * MAP * 4;
/** 只需图层与数据图：RenderSnapshot 或 CityState 都可直接传入。 */
export type MinimapSource = Pick<RenderSnapshot, 'layers' | 'maps'>;
export type Rgb = readonly [number, number, number];

/** 原创配色（[设计]）。 */
export const MINIMAP_COLORS = {
  water: [[70, 120, 190], [48, 96, 170], [32, 72, 150], [22, 52, 124]] as readonly Rgb[],   // 按水深
  land: [[96, 150, 74], [120, 160, 80], [150, 150, 84], [160, 128, 92]] as readonly Rgb[],   // 4 阶 绿 → 褐
  tree: [52, 104, 56] as Rgb,
  rubble: [120, 110, 100] as Rgb,
  network: [72, 72, 78] as Rgb,
  zoneR: [[120, 200, 110], [60, 150, 60]] as readonly Rgb[],      // 轻 / 密
  zoneC: [[120, 160, 230], [50, 90, 200]] as readonly Rgb[],
  zoneI: [[230, 210, 110], [190, 160, 40]] as readonly Rgb[],
  zoneMilitary: [130, 140, 90] as Rgb, zoneAirport: [170, 130, 190] as Rgb, zoneSeaport: [90, 170, 180] as Rgb,
  civic: [170, 170, 176] as Rgb, powerPlant: [150, 100, 60] as Rgb, waterFacility: [110, 170, 200] as Rgb,
  park: [90, 170, 90] as Rgb, port: [140, 150, 170] as Rgb, reward: [200, 180, 140] as Rgb,
  road: [150, 150, 150] as Rgb, rail: [140, 100, 70] as Rgb, highway: [230, 140, 50] as Rgb,
  powered: [240, 220, 60] as Rgb, unpowered: [220, 60, 50] as Rgb, powerLine: [210, 200, 140] as Rgb,
  watered: [60, 140, 230] as Rgb, unwatered: [220, 60, 50] as Rgb, pipe: [70, 170, 170] as Rgb,
  growthUp: [60, 200, 80] as Rgb, growthDown: [220, 60, 50] as Rgb, neutral: [128, 128, 128] as Rgb,
  heat: {
    pop: [180, 90, 200] as Rgb, traffic: [240, 150, 40] as Rgb, pollution: [120, 80, 40] as Rgb, crime: [220, 40, 40] as Rgb,
    landValue: [40, 190, 90] as Rgb, police: [60, 90, 220] as Rgb, fire: [240, 90, 30] as Rgb, health: [40, 200, 210] as Rgb, education: [230, 190, 50] as Rgb,
  },
} as const;

const HEAT_STEPS = 16;
const dim = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 地形底色：水按深度、陆地按海拔 4 阶。 */
function baseColor(src: MinimapSource, i: number): Rgb {
  const L = src.layers;
  const alt = L.alt[i]!;
  if (isWaterXter(L.xter[i]!) || (L.xbit[i]! & XBit.Water) !== 0) {
    const depth = Math.max(0, Math.min(3, L.waterLevel[i]! - alt));
    return MINIMAP_COLORS.water[depth]!;
  }
  return MINIMAP_COLORS.land[Math.max(0, Math.min(3, alt >> 3))]!;
}

function structureColor(src: MinimapSource, i: number): Rgb {
  const id = src.layers.xbld[i]!;
  if (id === 0) return baseColor(src, i);
  if (id >= 0x06 && id <= 0x0c) return MINIMAP_COLORS.tree;
  if (id <= 0x05) return MINIMAP_COLORS.rubble;
  if (id === 0x0d) return MINIMAP_COLORS.park;
  if (id < DEVELOPED_FIRST) return MINIMAP_COLORS.network;
  const def = BUILDINGS[id];
  const z = def?.zone?.type;
  if (z === 'R') return MINIMAP_COLORS.zoneR[1]!;
  if (z === 'C') return MINIMAP_COLORS.zoneC[1]!;
  if (z === 'I') return MINIMAP_COLORS.zoneI[1]!;
  switch (CATEGORY[id]) {
    case 'powerPlant': return MINIMAP_COLORS.powerPlant;
    case 'waterFacility': return MINIMAP_COLORS.waterFacility;
    case 'park': case 'recreation': return MINIMAP_COLORS.park;
    case 'airportPart': case 'seaportPart': case 'militaryPart': case 'transitStation': return MINIMAP_COLORS.port;
    case 'reward': case 'arcology': case 'church': return MINIMAP_COLORS.reward;
    case 'construction': case 'abandoned': return MINIMAP_COLORS.rubble;
    default: return MINIMAP_COLORS.civic;
  }
}

function zoneColor(src: MinimapSource, i: number): Rgb {
  const z = src.layers.xzon[i]! & ZONE_MASK;
  switch (z) {
    case 1: return MINIMAP_COLORS.zoneR[0]!; case 2: return MINIMAP_COLORS.zoneR[1]!;
    case 3: return MINIMAP_COLORS.zoneC[0]!; case 4: return MINIMAP_COLORS.zoneC[1]!;
    case 5: return MINIMAP_COLORS.zoneI[0]!; case 6: return MINIMAP_COLORS.zoneI[1]!;
    case 7: return MINIMAP_COLORS.zoneMilitary; case 8: return MINIMAP_COLORS.zoneAirport; case 9: return MINIMAP_COLORS.zoneSeaport;
    default: return dim(baseColor(src, i), 0.6);
  }
}

function transportColor(src: MinimapSource, i: number): Rgb {
  const id = src.layers.xbld[i]!;
  if (isHighway(id)) return MINIMAP_COLORS.highway;
  if (isRail(id)) return MINIMAP_COLORS.rail;
  if (isRoad(id)) return MINIMAP_COLORS.road;
  return dim(baseColor(src, i), 0.5);
}

function powerColor(src: MinimapSource, i: number): Rgb {
  const L = src.layers;
  const id = L.xbld[i]!, bit = L.xbit[i]!;
  if (id >= DEVELOPED_FIRST && (bit & XBit.Powerable) !== 0) return (bit & XBit.Powered) !== 0 ? MINIMAP_COLORS.powered : MINIMAP_COLORS.unpowered;
  if (isPowerCarrier(id)) return MINIMAP_COLORS.powerLine;
  return dim(baseColor(src, i), 0.5);
}

function waterColor(src: MinimapSource, i: number): Rgb {
  const L = src.layers;
  const id = L.xbld[i]!, bit = L.xbit[i]!;
  if (id >= DEVELOPED_FIRST && (bit & XBit.Piped) !== 0) return (bit & XBit.Watered) !== 0 ? MINIMAP_COLORS.watered : MINIMAP_COLORS.unwatered;
  if (isPipeUnd(L.xund[i]!)) return MINIMAP_COLORS.pipe;
  return dim(baseColor(src, i), 0.5);
}

const heat = (src: MinimapSource, i: number, v: number, hue: Rgb): Rgb => mix(dim(baseColor(src, i), 0.45), hue, (v >> 4) / (HEAT_STEPS - 1));

function growthColor(src: MinimapSource, i: number, v: number): Rgb {
  const base = dim(baseColor(src, i), 0.45);
  if (v > 0x82) return mix(base, MINIMAP_COLORS.growthUp, Math.min(1, (v - 0x7f) / 128));
  if (v < 0x7d) return mix(base, MINIMAP_COLORS.growthDown, Math.min(1, (0x7f - v) / 128));
  return mix(base, MINIMAP_COLORS.neutral, 0.35);
}

/** 建筑覆盖场（v1 [M]：医院 / 教育机构按 Chebyshev 半径线性衰减，取最大值），值域 0..255。 */
export function coverageField(src: MinimapSource, ids: ReadonlySet<number>, radius: number): Uint8Array {
  const L = src.layers;
  const field = new Uint8Array(MAP * MAP);
  for (let i = 0; i < MAP * MAP; i++) {
    const id = L.xbld[i]!;
    if (!ids.has(id)) continue;
    const n = FOOTPRINT[id]!;
    if (n > 1 && anchorOf(L, i) !== i) continue;                 // 多格只算锚格一次
    const x0 = i >> 7, y0 = i & 127;
    const cx = x0 + (n - 1) / 2, cy = y0 + (n - 1) / 2;
    for (let x = Math.max(0, x0 - radius); x <= Math.min(MAP - 1, x0 + n - 1 + radius); x++) {
      for (let y = Math.max(0, y0 - radius); y <= Math.min(MAP - 1, y0 + n - 1 + radius); y++) {
        const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)) - (n - 1) / 2;
        const v = Math.round(255 * Math.max(0, 1 - Math.max(0, d) / radius));
        const k = tileIndex(x, y);
        if (v > field[k]!) field[k] = v;
      }
    }
  }
  return field;
}
export const HEALTH_BUILDINGS: ReadonlySet<number> = new Set([0xd1]);                   // 医院
export const EDUCATION_BUILDINGS: ReadonlySet<number> = new Set([0xd4, 0xd6, 0xd9, 0xf5]); // 博物馆 / 学校 / 大学 / 图书馆

/** 写 128×128×4 RGBA（alpha 恒 255）。 */
export function renderMinimap(src: MinimapSource, mode: MapLayerMode, out: Uint8ClampedArray, t: SceneTuning = DEFAULT_SCENE_TUNING): void {
  const M = src.maps;
  let field: Uint8Array | null = null;
  if (mode === 'health') field = coverageField(src, HEALTH_BUILDINGS, t.minimapHealthRadius);
  else if (mode === 'education') field = coverageField(src, EDUCATION_BUILDINGS, t.minimapEducationRadius);
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const i = tileIndex(x, y);
      let c: Rgb;
      switch (mode) {
        case 'structures': c = structureColor(src, i); break;
        case 'zones': c = zoneColor(src, i); break;
        case 'transport': c = transportColor(src, i); break;
        case 'power': c = powerColor(src, i); break;
        case 'water': c = waterColor(src, i); break;
        case 'pop': c = heat(src, i, M.xpop[quarterIndex(x, y)]!, MINIMAP_COLORS.heat.pop); break;
        case 'growth': c = growthColor(src, i, M.xrog[quarterIndex(x, y)]!); break;
        case 'traffic': c = heat(src, i, M.xtrf[halfIndex(x, y)]!, MINIMAP_COLORS.heat.traffic); break;
        case 'pollution': c = heat(src, i, M.xplt[halfIndex(x, y)]!, MINIMAP_COLORS.heat.pollution); break;
        case 'crime': c = heat(src, i, M.xcrm[halfIndex(x, y)]!, MINIMAP_COLORS.heat.crime); break;
        case 'landValue': c = heat(src, i, M.xval[halfIndex(x, y)]!, MINIMAP_COLORS.heat.landValue); break;
        case 'police': c = heat(src, i, M.xplc[quarterIndex(x, y)]!, MINIMAP_COLORS.heat.police); break;
        case 'fire': c = heat(src, i, M.xfir[quarterIndex(x, y)]!, MINIMAP_COLORS.heat.fire); break;
        case 'health': c = heat(src, i, field![i]!, MINIMAP_COLORS.heat.health); break;
        default: c = heat(src, i, field![i]!, MINIMAP_COLORS.heat.education); break;   // 'education'
      }
      const o = (y * MAP + x) * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
}

export function minimapRgba(src: MinimapSource, mode: MapLayerMode, t: SceneTuning = DEFAULT_SCENE_TUNING): Uint8ClampedArray {
  const out = new Uint8ClampedArray(MINIMAP_BYTES);
  renderMinimap(src, mode, out, t);
  return out;
}
