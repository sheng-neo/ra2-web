/**
 * 建筑 → 按块的立面网格。
 * - 楼底基准：数据给了 base 用 base，否则（0）用地形采样；墙脚再埋到整圈墙脚下最低地面以下 0.5 m（walls.ts）。
 * - 与别栋楼共面重合的墙只画一次（walls.ts），塔楼与裙楼共用外边处不再闪条纹。
 * - 写实化一轮：每栋楼先定类型（typology.ts：写字楼 / 住宅 / 唐楼 / 裙楼 / 敏感区）、层高（height ÷ storeys）、
 *   街面冷暖（lighting.streetWarmth）与少数塔楼的冠顶 / 避难层，写进 aBldg；敏感区内的楼一律素灰石材、无灯。
 * - 屋顶机房与水箱（rooftops.ts）并进同一块的几何，不加 draw call。
 */
import type { Object3D } from 'three';
import type { Building, CityFile, FlatXY, SensitiveZone } from '@central/data';
import type { HeightFn } from '../data/terrain';
import { normalizeRing, pointInRing, ringCentroid } from '../geom/ring';
import { groupByChunk, chunkOf, type ChunkCoord } from './chunks';
import { extrudePrism, type WallSpanInfo } from './extrude';
import { FEATURE, FacadeMode, facadeKey, hash01, newFacadeArrays, styleCode, type BldgAttr } from './facade';
import { streetWarmth } from './materials/lighting';
import { createNeonMaterial } from './materials/neon';
import type { MeshArrays } from './mesh-arrays';
import { addRooftops } from './rooftops';
import { atlasLayout, signAtlasTexture } from './signs/atlas';
import { buildSignMesh } from './signs/material';
import { RoadIndex, facesStreet, hasShopfront, placeSigns, type FrontageSpan, type SignQuad } from './signs/placement';
import { buildTowerLights, type NearHarbourFn } from './tower-lights';
import { isWaterAt, rasterizeWater } from './water/mask';
import type { Emitter } from './water/strip';
import { TYPOLOGY_ORDER, classify, coreWeight, floorToFloor, typologyInput, type Typology } from './typology';
import { lowestAlongRings, planWallCuts, type WallCutsFn } from './walls';

const SINK_DM = 5;
const MIN_HEIGHT_DM = 25;

export function inSensitive(zones: readonly SensitiveZone[], x: number, y: number): boolean {
  return zones.some((z) => pointInRing(z.area, x, y));
}

/** 一栋楼的墙体参数（模拟坐标，dm）。 */
export interface PreparedBuilding {
  b: Building;
  ring: { outer: FlatXY; holes: FlatXY[] };
  /** [外环, ...洞]，与 extrudePrism 的环序号一致。 */
  rings: FlatXY[];
  cx: number;
  cy: number;
  base: number;
  bottom: number;
  top: number;
  /** 整圈墙脚下最低的地面（dm）。 */
  low: number;
}

/** 楼底、墙底、楼顶与共面墙去重（cutsOf 的楼序号即 items 下标）。 */
export function prepareBuildings(
  buildings: readonly Building[],
  ground: HeightFn,
): { items: PreparedBuilding[]; cutsOf: WallCutsFn } {
  const items = buildings.flatMap((b) => {
    const ring = normalizeRing(b.footprint);
    if (!ring) return [];
    const [cx, cy] = ringCentroid(ring.outer);
    const rings = [ring.outer, ...ring.holes];
    const base = b.base !== 0 ? b.base : ground(cx, cy);
    const low = lowestAlongRings(rings, ground);
    const bottom = Math.min(base, low) - SINK_DM;
    return [{ b, ring, rings, cx, cy, base, bottom, top: base + Math.max(b.height, MIN_HEIGHT_DM), low }];
  });
  return { items, cutsOf: planWallCuts(items) };
}

/** 类型 → 立面模式（敏感区沿用 Plain）。 */
export function modeOf(t: Typology): FacadeMode {
  return t === 'sensitive' ? FacadeMode.Plain : ((FacadeMode.Office + TYPOLOGY_ORDER.indexOf(t)) as FacadeMode);
}

/** 冠顶泛光色（FEATURE.crownMask 的值）：白 50 %、金 25 %、青 15 %、品红 10 %。 */
export function crownColour(h: number): number {
  return h < 0.5 ? 1 : h < 0.75 ? 2 : h < 0.9 ? 3 : 4;
}

/** 一栋楼的立面规划。 */
export interface BuildingPlan {
  p: PreparedBuilding;
  /** prepareBuildings 里的序号（cutsOf 用）。 */
  k: number;
  typology: Typology;
  mode: FacadeMode;
  style: number;
  rnd: number;
  f2f: number;
  /** 墙脚地面（mPD，米）。 */
  groundM: number;
  /** 楼顶离地面高度（米）。 */
  tallM: number;
  warmth: number;
  feature: number;
  /** 是否有静态边缘 LED（tower-lights.ts 画）。 */
  edgeLed: boolean;
  bldg: BldgAttr;
}

/** 每栋楼的类型、层高、冷暖与特征位（全部确定性）。 */
export function planBuildings(
  buildings: readonly Building[],
  ground: HeightFn,
  sensitive: readonly SensitiveZone[],
): { plans: BuildingPlan[]; cutsOf: WallCutsFn } {
  const { items, cutsOf } = prepareBuildings(buildings, ground);
  const plans = items.map((p, k): BuildingPlan => {
    const sens = inSensitive(sensitive, p.cx, p.cy);
    const input = typologyInput(p.b, p.base, sens);
    const typology = classify(input);
    const mode = modeOf(typology);
    const rnd = hash01(p.b.id);
    const style = styleCode(p.b.style, mode, rnd);
    const heightM = (p.top - p.base) / 10;
    const f2f = floorToFloor(typology, heightM, p.b.storeys);
    const groundM = p.low / 10;
    const tallM = p.top / 10 - groundM;
    const warmth = streetWarmth(p.cx / 10, p.cy / 10, groundM);
    let feature = 0;
    let edgeLed = false;
    if (!sens && (typology === 'office' || typology === 'residential') && tallM > 120) {
      // 15–25 % 的 120 m 以上塔楼有冠顶泛光，其中一半另有边缘 LED（静态）
      const h = hash01(`${p.b.id}:crown`);
      if (h < 0.15) {
        feature |= crownColour(hash01(`${p.b.id}:crown-colour`));
        edgeLed = hash01(`${p.b.id}:edge`) < 0.5;
      }
    }
    if (!sens && typology === 'office' && tallM >= 150) feature |= FEATURE.refuge;
    if (typology === 'podium') {
      const h = hash01(`${p.b.id}:podium`);
      if (h < 0.5) feature |= FEATURE.mall;
      else if (h < 0.65) feature |= FEATURE.carPark;
    }
    return {
      p,
      k,
      typology,
      mode,
      style,
      rnd,
      f2f,
      groundM,
      tallM,
      warmth,
      feature,
      edgeLed,
      bldg: [f2f, warmth, groundM, feature],
    };
  });
  return { plans, cutsOf };
}

export interface BuildingChunkOptions {
  /** 每画一块墙面回调（铺面招牌摆放）。 */
  onSpan?: (plan: BuildingPlan, span: WallSpanInfo) => void;
  /** 屋顶机房与水箱（默认 true）。 */
  rooftops?: boolean;
}

/** 已规划好的楼 → 按块的立面网格。 */
export function chunksFromPlans(
  plans: readonly BuildingPlan[],
  cutsOf: WallCutsFn,
  opts: BuildingChunkOptions = {},
): Map<string, { coord: ChunkCoord; arrays: MeshArrays }> {
  const out = new Map<string, { coord: ChunkCoord; arrays: MeshArrays }>();
  for (const [key, g] of groupByChunk(plans, (pl) => chunkOf(pl.p.cx, pl.p.cy))) {
    const arrays = newFacadeArrays();
    for (const pl of g.items) {
      const { p } = pl;
      extrudePrism(arrays, {
        outer: p.ring.outer,
        holes: p.ring.holes,
        bottom: p.bottom,
        base: p.base,
        top: p.top,
        style: pl.style,
        uOffset: pl.rnd * 97,
        cuts: (ring, edge) => cutsOf(pl.k, ring, edge),
        bldg: pl.bldg,
        onSpan: opts.onSpan ? (s) => opts.onSpan!(pl, s) : undefined,
      });
      if (opts.rooftops !== false) addRooftops(arrays, pl);
    }
    out.set(key, { coord: g.coord, arrays });
  }
  return out;
}

export function buildBuildingChunks(
  buildings: readonly Building[],
  ground: HeightFn,
  sensitive: readonly SensitiveZone[],
  opts: BuildingChunkOptions = {},
): Map<string, { coord: ChunkCoord; arrays: MeshArrays }> {
  const { plans, cutsOf } = planBuildings(buildings, ground, sensitive);
  return chunksFromPlans(plans, cutsOf, opts);
}

/** 质心处的中环商业核心权重（招牌密度用）。 */
export function planCore(pl: BuildingPlan): number {
  return coreWeight(pl.p.cx / 10, pl.p.cy / 10);
}

/** 城市建筑图层的全部产物：分块立面网格 + 附属对象（招牌、航空灯、边缘 LED）。 */
export interface CityBuildings {
  chunks: Map<string, { coord: ChunkCoord; arrays: MeshArrays }>;
  objects: Object3D[];
  plans: BuildingPlan[];
  /** 天台灯箱、LED 幕墙等亮面：LOW 档海面发光条的光源。 */
  emitters: Emitter[];
}

/** 以北 700 m 内是否有维港海面（10 m 栅格；要 3 个以上水样本，排除喷水池、小水塘）。 */
export function nearHarbourFn(city: Pick<CityFile, 'water' | 'meta'>): NearHarbourFn {
  const [x0, y0, x1, y1] = city.meta.bbox.map((v) => v / 10) as [number, number, number, number];
  const cell = 10;
  const mask = rasterizeWater(city.water, x0, y0, cell, cell, Math.ceil((x1 - x0) / cell), Math.ceil((y1 - y0) / cell));
  return (x, y) => {
    let wet = 0;
    for (let d = 50; d <= 700; d += 50) if (isWaterAt(mask, x, y + d)) wet++;
    return wet >= 3;
  };
}

/** 墙面块是否临街（墙脚贴地、够高够长、外环）：招牌只挂在这些墙上。 */
export function frontageOf(pl: BuildingPlan, s: WallSpanInfo): FrontageSpan | null {
  if (s.ring !== 0 || !hasShopfront(pl.typology)) return null;
  const groundDm = pl.groundM * 10;
  if (s.z0 > groundDm + 5 || s.z1 < groundDm + 60) return null;
  if (Math.hypot(s.x1 - s.x0, s.y1 - s.y0) < 40) return null;
  return {
    key: facadeKey(pl.style),
    typology: pl.typology,
    core: planCore(pl),
    groundM: pl.groundM,
    topM: pl.p.top / 10,
    x0: s.x0 / 10,
    y0: s.y0 / 10,
    x1: s.x1 / 10,
    y1: s.y1 / 10,
    u0: s.u0,
    nx: s.nx,
    ny: s.ny,
  };
}

/**
 * CityRenderer 的「生成建築」一步：分块立面网格 + 招牌（1 个 draw call）+ 航空灯（1）+ 边缘 LED（1）。
 * tier = 'low' 时不加屋顶机房、不出直招牌（三角形预算：HIGH 约 147k、LOW 约 108k，整层未剔除）。没有 DOM（单元测试）时不建招牌。
 */
export function buildCityBuildings(city: CityFile, ground: HeightFn, tier: 'high' | 'low' = 'high'): CityBuildings {
  const { plans, cutsOf } = planBuildings(city.buildings, ground, city.zones.sensitive);
  const quads: SignQuad[] = [];
  const cells = atlasLayout();
  const roads = new RoadIndex(city.roads);
  const chunks = chunksFromPlans(plans, cutsOf, {
    rooftops: tier === 'high',
    onSpan: (pl, s) => {
      const f = frontageOf(pl, s);
      if (f && facesStreet(f, roads)) quads.push(...placeSigns(f, cells, tier === 'high'));
    },
  });
  const objects: Object3D[] = [];
  const atlas = signAtlasTexture();
  // LOW 档（整合时加）：平贴招牌按序号抽掉约四成（全城视角 LOW 档三角形卡在 30 万上限；招牌密度本就是近似值）
  const kept = tier === 'high' ? quads : quads.filter((_, i) => i % 5 < 3);
  const signs = atlas ? buildSignMesh(kept, atlas) : null;
  if (signs) objects.push(signs);
  const towers = buildTowerLights(plans, city.landmarks, city.zones.sensitive, createNeonMaterial(), nearHarbourFn(city));
  objects.push(...towers.objects);
  return { chunks, objects, plans, emitters: towers.emitters };
}
