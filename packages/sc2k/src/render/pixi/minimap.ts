// ===== render/pixi/minimap.ts =====（ARCHITECTURE §6.9 RendererApi.minimap；spec:ui-art §2.5.1 Map 窗口 15 图层）
// 按图层 LUT 直接写 128×128 RGBA（out[(y*128+x)*4]，ImageData 行序），不走 Pixi。颜色全部原创取值。
// WP10 的 render/scene/minimap.ts 落地后集成者可把 paintMinimap 切到它；本实现只读 CityState 的层与数据图。
import type { MapLayerMode } from '../../contracts/render';
import type { CityState } from '../../contracts/state';
import { MAP, XBit, ZONE_MASK, halfIndex, quarterIndex, tileIndex, isDenseZone, zoneTypeOf } from '../../contracts/grid';
import { isHighway, isPipeUnd, isPowerCarrier, isRail, isRoad, isBridge } from '../../contracts/net';

type Rgb = readonly [number, number, number];
const WATER_FRESH: Rgb = [30, 76, 156], WATER_SALT: Rgb = [24, 58, 132];
const BUILDING: Rgb = [214, 210, 196], ROAD: Rgb = [92, 92, 100], HIGHWAY: Rgb = [230, 230, 236], RAIL: Rgb = [122, 88, 58], POWER_LINE: Rgb = [176, 152, 64], BRIDGE: Rgb = [150, 190, 210];
const ZONE_R: Rgb = [72, 182, 72], ZONE_C: Rgb = [72, 112, 222], ZONE_I: Rgb = [222, 190, 60], ZONE_OTHER: Rgb = [160, 120, 180];
const POWERED: Rgb = [242, 212, 72], UNPOWERED: Rgb = [222, 60, 48], WATERED: Rgb = [60, 140, 240], UNWATERED: Rgb = [240, 140, 60], PIPE: Rgb = [90, 200, 220];
const HEALTH: Rgb = [240, 84, 84], EDUCATION: Rgb = [84, 124, 240];
const HOSPITAL_ID = 0xd1, SCHOOL_ID = 0xd6, COLLEGE_ID = 0xd9;
const HEAT_STOPS: readonly Rgb[] = [[30, 60, 140], [40, 170, 90], [230, 210, 60], [230, 60, 40]];

/** 热力色带：0..255 → 四段线性插值（原创）。 */
export function heatColor(v: number): Rgb {
  const t = Math.max(0, Math.min(255, v)) / 255 * (HEAT_STOPS.length - 1);
  const k = Math.min(HEAT_STOPS.length - 2, Math.floor(t)), f = t - k;
  const a = HEAT_STOPS[k]!, b = HEAT_STOPS[k + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const dim = (c: Rgb, k = 0.45): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const isTree = (id: number): boolean => id >= 0x06 && id <= 0x0c;

/** 地形底色：水按咸淡；陆地绿度随海拔升高；树更深。 */
function baseColor(s: Readonly<CityState>, i: number): Rgb {
  const L = s.layers;
  const xbit = L.xbit[i]!;
  if ((xbit & XBit.Water) !== 0) return (xbit & XBit.SaltWater) !== 0 ? WATER_SALT : WATER_FRESH;
  const alt = L.alt[i]!;
  if (isTree(L.xbld[i]!)) return [34 + alt, 96 + alt * 3, 30 + alt];
  return [58 + alt * 2, 118 + alt * 4, 44 + alt * 2];
}

function structureColor(s: Readonly<CityState>, i: number): Rgb {
  const id = s.layers.xbld[i]!;
  if (id >= 0x70) return BUILDING;
  if (isHighway(id)) return HIGHWAY;
  if (isBridge(id)) return BRIDGE;
  if (isRoad(id)) return ROAD;
  if (isRail(id)) return RAIL;
  if (isPowerCarrier(id)) return POWER_LINE;
  const z = s.layers.xzon[i]! & ZONE_MASK;
  if (z !== 0) { const b = baseColor(s, i); const zc = zoneColor(z); return [(b[0] + zc[0]) / 2, (b[1] + zc[1]) / 2, (b[2] + zc[2]) / 2]; }
  return baseColor(s, i);
}
function zoneColor(z: number): Rgb {
  const t = zoneTypeOf(z);
  const c = t === 'R' ? ZONE_R : t === 'C' ? ZONE_C : t === 'I' ? ZONE_I : ZONE_OTHER;
  return isDenseZone(z) ? c : dim(c, 0.7);
}

/** 128×128×4 小地图：mode 选图层；out 按 ImageData 行序。 */
export function paintMinimap(s: Readonly<CityState>, mode: MapLayerMode, out: Uint8ClampedArray): void {
  const L = s.layers, M = s.maps;
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = tileIndex(x, y), o = (y * MAP + x) * 4;
    const id = L.xbld[i]!, xbit = L.xbit[i]!;
    let c: Rgb;
    switch (mode) {
      case 'structures': c = structureColor(s, i); break;
      case 'zones': { const z = L.xzon[i]! & ZONE_MASK; c = z !== 0 ? zoneColor(z) : dim(baseColor(s, i)); break; }
      case 'transport': c = isHighway(id) ? HIGHWAY : isBridge(id) ? BRIDGE : isRoad(id) ? ROAD : isRail(id) ? RAIL : dim(baseColor(s, i)); break;
      case 'power':
        c = id >= 0x70 && (xbit & XBit.Powerable) !== 0 ? ((xbit & XBit.Powered) !== 0 ? POWERED : UNPOWERED)
          : isPowerCarrier(id) || (xbit & XBit.Powered) !== 0 ? dim(POWERED, 0.8) : dim(baseColor(s, i));
        break;
      case 'water':
        c = (xbit & XBit.Watered) !== 0 ? WATERED : (xbit & XBit.Piped) !== 0 ? UNWATERED : isPipeUnd(L.xund[i]!) ? PIPE : dim(baseColor(s, i));
        break;
      case 'pop': c = heatOrBase(s, i, M.xpop[quarterIndex(x, y)]!); break;
      case 'growth': c = heatOrBase(s, i, M.xrog[quarterIndex(x, y)]!); break;
      case 'traffic': c = heatOrBase(s, i, M.xtrf[halfIndex(x, y)]!); break;
      case 'pollution': c = heatOrBase(s, i, M.xplt[halfIndex(x, y)]!); break;
      case 'crime': c = heatOrBase(s, i, M.xcrm[halfIndex(x, y)]!); break;
      case 'landValue': c = heatOrBase(s, i, M.xval[halfIndex(x, y)]!); break;
      case 'police': c = heatOrBase(s, i, M.xplc[quarterIndex(x, y)]!); break;
      case 'fire': c = heatOrBase(s, i, M.xfir[quarterIndex(x, y)]!); break;
      case 'health': c = id === HOSPITAL_ID ? HEALTH : dim(structureColor(s, i), 0.5); break;
      case 'education': c = id === SCHOOL_ID || id === COLLEGE_ID ? EDUCATION : dim(structureColor(s, i), 0.5); break;
      default: c = structureColor(s, i);
    }
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
}
const heatOrBase = (s: Readonly<CityState>, i: number, v: number): Rgb => (v > 0 ? heatColor(v) : dim(baseColor(s, i)));
