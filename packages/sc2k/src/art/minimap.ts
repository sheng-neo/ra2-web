// ===== art/minimap.ts =====（spec:ui-art §2.5.1 Map 窗口图层着色；WP9 genMinimapLut）
// 每种模式一张 256 × RGBA 查找表。字节语义（WP10 render/scene/minimap.ts 按此喂值）：
//  structures：MinimapClass 枚举；zones：XZON 低 4 位 0..9；transport / power / water：下方的 TransportClass / PowerClass / WaterClass；
//  growth：XROG 原值（0x7F 中性，> 0x82 绿、< 0x7D 红）；其余热力模式：原值 0..255 → 16 阶（8 阶色 × 两档亮度）。
import type { MapLayerMode } from '../contracts/render';
import { IDX, Ramp, hslToRgb, rampRgb } from './palette';

/** structures 模式的字节值。 */
export const enum MinimapClass { Water = 0, Shallow = 1, Land0 = 2, Land1 = 3, Land2 = 4, Land3 = 5, Tree = 6, ZoneR = 7, ZoneC = 8, ZoneI = 9, Civic = 10, PowerPlant = 11, Net = 12, Rubble = 13, Radioactive = 14, Park = 15 }
export const enum TransportClass { None = 0, Road = 1, Rail = 2, Highway = 3, Bridge = 4, Tunnel = 5, Water = 6 }
export const enum PowerClass { None = 0, Powered = 1, Unpowered = 2, Line = 3, Water = 4 }
export const enum WaterClass { None = 0, Watered = 1, Unwatered = 2, Pipe = 3, Water = 4 }

type Rgb = readonly [number, number, number];
const LAND: Rgb = [116, 136, 84];
const WATER: Rgb = rampRgb(Ramp.Water, 3);
const put = (lut: Uint8ClampedArray, k: number, c: Rgb, a = 255): void => { lut[k * 4] = c[0]; lut[k * 4 + 1] = c[1]; lut[k * 4 + 2] = c[2]; lut[k * 4 + 3] = a; };
const fillAll = (lut: Uint8ClampedArray, c: Rgb): void => { for (let k = 0; k < 256; k++) put(lut, k, c); };
/** 16 阶热力：8 阶色相 × 两档亮度。 */
export function heatColor(step16: number): Rgb {
  const s = Math.max(0, Math.min(15, step16 | 0));
  const base = IDX.HeatBase + (s >> 1);
  const [h, sat, l] = [220 - (base - IDX.HeatBase) * 31, 0.75, 0.35 + (base - IDX.HeatBase) * 0.03];
  return hslToRgb(h, sat, l + (s & 1 ? 0.12 : 0));
}

export function genMinimapLut(mode: MapLayerMode): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  fillAll(lut, LAND);
  switch (mode) {
    case 'structures': {
      put(lut, MinimapClass.Water, WATER); put(lut, MinimapClass.Shallow, rampRgb(Ramp.Water, 4));
      put(lut, MinimapClass.Land0, [104, 134, 76]); put(lut, MinimapClass.Land1, [122, 142, 80]); put(lut, MinimapClass.Land2, [140, 134, 84]); put(lut, MinimapClass.Land3, [150, 122, 90]);
      put(lut, MinimapClass.Tree, rampRgb(Ramp.Forest, 2)); put(lut, MinimapClass.ZoneR, [60, 170, 70]); put(lut, MinimapClass.ZoneC, [70, 110, 210]); put(lut, MinimapClass.ZoneI, [210, 180, 60]);
      put(lut, MinimapClass.Civic, rampRgb(Ramp.Neutral, 6)); put(lut, MinimapClass.PowerPlant, rampRgb(Ramp.Rust, 3)); put(lut, MinimapClass.Net, rampRgb(Ramp.Asphalt, 2));
      put(lut, MinimapClass.Rubble, rampRgb(Ramp.Earth, 3)); put(lut, MinimapClass.Radioactive, rampRgb(Ramp.Olive, 4)); put(lut, MinimapClass.Park, rampRgb(Ramp.Grass, 6));
      break;
    }
    case 'zones': {
      put(lut, 0, [128, 128, 120]); put(lut, 1, [120, 200, 120]); put(lut, 2, [40, 140, 50]); put(lut, 3, [130, 160, 230]); put(lut, 4, [50, 90, 190]);
      put(lut, 5, [230, 210, 120]); put(lut, 6, [190, 150, 40]); put(lut, 7, rampRgb(Ramp.Olive, 4)); put(lut, 8, rampRgb(Ramp.Neutral, 7)); put(lut, 9, rampRgb(Ramp.Water, 6));
      break;
    }
    case 'transport': {
      put(lut, TransportClass.None, [150, 150, 140]); put(lut, TransportClass.Road, rampRgb(Ramp.Asphalt, 2)); put(lut, TransportClass.Rail, rampRgb(Ramp.Rust, 3)); put(lut, TransportClass.Highway, rampRgb(Ramp.Amber, 5));
      put(lut, TransportClass.Bridge, rampRgb(Ramp.WarmGray, 5)); put(lut, TransportClass.Tunnel, rampRgb(Ramp.Earth, 2)); put(lut, TransportClass.Water, WATER);
      break;
    }
    case 'power': {
      put(lut, PowerClass.None, [150, 150, 140]); put(lut, PowerClass.Powered, rampRgb(Ramp.Amber, 6)); put(lut, PowerClass.Unpowered, rampRgb(Ramp.Signal, 4)); put(lut, PowerClass.Line, rampRgb(Ramp.Amber, 4)); put(lut, PowerClass.Water, WATER);
      break;
    }
    case 'water': {
      put(lut, WaterClass.None, [150, 150, 140]); put(lut, WaterClass.Watered, rampRgb(Ramp.Water, 5)); put(lut, WaterClass.Unwatered, rampRgb(Ramp.Signal, 4)); put(lut, WaterClass.Pipe, rampRgb(Ramp.Teal, 4)); put(lut, WaterClass.Water, WATER);
      break;
    }
    case 'growth': {
      for (let v = 0; v < 256; v++) {
        if (v > 0x82) { const t = Math.min(1, (v - 0x7f) / 128); put(lut, v, [Math.round(140 - 100 * t), Math.round(140 + 80 * t), Math.round(130 - 80 * t)]); }
        else if (v < 0x7d) { const t = Math.min(1, (0x7f - v) / 127); put(lut, v, [Math.round(140 + 100 * t), Math.round(140 - 100 * t), Math.round(130 - 90 * t)]); }
        else put(lut, v, [140, 140, 130]);
      }
      break;
    }
    default: {   // pop traffic pollution crime landValue police fire health education：16 阶
      for (let v = 0; v < 256; v++) put(lut, v, heatColor(v >> 4));
      break;
    }
  }
  return lut;
}
