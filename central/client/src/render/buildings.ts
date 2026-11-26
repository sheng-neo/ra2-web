/**
 * 建筑 → 按块的立面网格。
 * - 楼底基准：数据给了 base 用 base，否则（0）用地形采样；墙脚再埋到整圈墙脚下最低地面以下 0.5 m（walls.ts）。
 * - 与别栋楼共面重合的墙只画一次（walls.ts），塔楼与裙楼共用外边处不再闪条纹。
 * - 写实化一轮：每栋楼先定类型（typology.ts：写字楼 / 住宅 / 唐楼 / 裙楼 / 敏感区）、层高（height ÷ storeys）、
 *   街面冷暖（lighting.streetWarmth）与少数塔楼的冠顶 / 避难层，写进 aBldg；敏感区内的楼一律素灰石材、无灯。
 * - 屋顶机房与水箱（rooftops.ts）并进同一块的几何，不加 draw call。
 * - 细节一轮（R2）：有 LOD2 分层体块（Building.parts，地政总署 3D 模型派生）的楼逐块挤出（building-parts.ts）：
 *   上层块的墙从下一层的顶起，每块各有屋顶；楼层线（v 从楼底量）与窗格（u 按世界坐标投影）跨块连续，
 *   类型、层高、亮灯按整栋楼算；女儿墙带画在每块顶上（退台边缘）；冠顶泛光只在主体及以上；
 *   主体之上的小块按屋顶机房立面画；天台机房、灯箱、边缘 LED 放主体上，航空灯放最高块上。
 *   LOW 档只给最高的一批楼分层（三角形预算约 5k），其余照旧平顶。
 */
import type { Camera, Object3D } from 'three';
import type { Building, CityFile, FacadeMeta, FlatXY, SensitiveZone } from '@central/data';
import type { HeightFn } from '../data/terrain';
import { normalizeRing, pointInRing, ringCentroid } from '../geom/ring';
import { crestPart, isPlantPart, lowTierPartBuildings, mainPart, peakPart, prepareParts, type PreparedPart } from './building-parts';
import { groupByChunk, chunkOf, type ChunkCoord } from './chunks';
import { extrudePrism, type WallSpanInfo } from './extrude';
import { buildingPhoto, prismPhoto, recordPages, ringBounds, type BuildingPhoto } from './facades/layout';
import { FEATURE, FacadeMode, facadeKey, hash01, newFacadeArrays, styleCode, type BldgAttr } from './facade';
import { streetWarmth } from './materials/lighting';
import { createNeonMaterial } from './materials/neon';
import type { MeshArrays } from './mesh-arrays';
import { addRooftops } from './rooftops';
import { atlasLayout, signAtlasTexture } from './signs/atlas';
import { buildSignMesh } from './signs/material';
import { RoadIndex, facesStreet, hasShopfront, placeSigns, type FrontageSpan, type SignQuad } from './signs/placement';
import { buildAcUnits, planAcUnits, type AcUnit } from './ac-units';
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
  /** 2D 主屋面（base + height）：类型、层高、楼高都按它算。 */
  top: number;
  /** 整圈墙脚下最低的地面（dm）。 */
  low: number;
  /** 墙面去重的楼体序号（没有分层体块时用）。 */
  body: number;
  /** LOD2 分层体块（逐块挤出）；没有时为 null，整栋按 footprint 从 bottom 挤到 top。 */
  parts: PreparedPart[] | null;
  /** 主体（冠顶泛光从这里起）、顶块（天台机房、灯箱、边缘 LED）与最高块（航空灯），见 building-parts.ts；没有分层时都是整栋楼。 */
  main: { ring: { outer: FlatXY; holes: FlatXY[] }; top: number };
  crest: { ring: { outer: FlatXY; holes: FlatXY[] }; top: number };
  peak: { ring: { outer: FlatXY; holes: FlatXY[] }; top: number };
  /** 顶块之上还有块（机房、桅杆）：不再加程序化屋顶机房。 */
  crowned: boolean;
}

export interface PrepareOptions {
  /** 哪些楼按分层体块画（默认全部；LOW 档只挑一批，见 building-parts.lowTierPartBuildings）。 */
  useParts?: (b: Building) => boolean;
  /** R3 真实贴面的贴图集（city.meta.facades）；省略时一律程序立面。 */
  facades?: FacadeMeta;
}

/** 楼底、墙底、楼顶、分层体块与共面墙去重（cutsOf 的楼体序号见 PreparedBuilding.body / PreparedPart.body）。 */
export function prepareBuildings(
  buildings: readonly Building[],
  ground: HeightFn,
  opts: PrepareOptions = {},
): { items: PreparedBuilding[]; cutsOf: WallCutsFn } {
  const bodies: { rings: FlatXY[]; bottom: number; top: number }[] = [];
  const items = buildings.flatMap((b): PreparedBuilding[] => {
    const ring = normalizeRing(b.footprint);
    if (!ring) return [];
    const [cx, cy] = ringCentroid(ring.outer);
    const rings = [ring.outer, ...ring.holes];
    const base = b.base !== 0 ? b.base : ground(cx, cy);
    const low = lowestAlongRings(rings, ground);
    const bottom = Math.min(base, low) - SINK_DM;
    const top = base + Math.max(b.height, MIN_HEIGHT_DM);
    const parts = opts.useParts && !opts.useParts(b) ? null : prepareParts(b, ring, bottom, base, b.base !== 0 ? 0 : base);
    const whole = { ring, top };
    if (!parts) {
      bodies.push({ rings, bottom, top });
      return [{ b, ring, rings, cx, cy, base, bottom, top, low, body: bodies.length - 1, parts: null, main: whole, crest: whole, peak: whole, crowned: false }];
    }
    for (const pt of parts) {
      pt.body = bodies.length;
      bodies.push({ rings: pt.rings, bottom: pt.bottom, top: pt.top });
    }
    const main = mainPart(parts);
    const crest = crestPart(parts);
    const peak = peakPart(parts);
    return [
      {
        b,
        ring,
        rings,
        cx,
        cy,
        base,
        bottom,
        top,
        low,
        body: parts[0]!.body,
        parts,
        main: { ring: main.ring, top: main.top },
        crest: { ring: crest.ring, top: crest.top },
        peak: { ring: peak.ring, top: peak.top },
        crowned: peak.top > crest.top,
      },
    ];
  });
  return { items, cutsOf: planWallCuts(bodies) };
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
  /** R3 真实贴面（敏感区与没有照片的楼为 null）。 */
  photo: BuildingPhoto | null;
  /** 楼层线相位（米，楼底起算；照片检测到的真楼层，没有时 0）。 */
  phase: number;
}

/** 每栋楼的类型、层高、冷暖与特征位（全部确定性）。 */
export function planBuildings(
  buildings: readonly Building[],
  ground: HeightFn,
  sensitive: readonly SensitiveZone[],
  opts: PrepareOptions = {},
): { plans: BuildingPlan[]; cutsOf: WallCutsFn } {
  const { items, cutsOf } = prepareBuildings(buildings, ground, opts);
  const plans = items.map((p, k): BuildingPlan => {
    const sens = inSensitive(sensitive, p.cx, p.cy);
    const input = typologyInput(p.b, p.base, sens);
    const typology = classify(input);
    const mode = modeOf(typology);
    const rnd = hash01(p.b.id);
    const style = styleCode(p.b.style, mode, rnd);
    const heightM = (p.top - p.base) / 10;
    const photo = sens ? null : buildingPhoto(p.b, opts.facades);
    // 照片检测到的层高与程序层高（层数推出来的）相差 12 % 以内才用，连同相位（窗灯落在真楼层上）；否则只用程序层高
    const fp = floorToFloor(typology, heightM, p.b.storeys);
    const usePhotoFloors = !!photo?.f2f && Math.abs(photo.f2f / fp - 1) <= 0.12;
    const f2f = usePhotoFloors ? photo!.f2f! : fp;
    // 相位 > 0 也是着色器「检测到楼层」的标志（building.ts floorsKnown），所以至少 1 cm
    const phase = usePhotoFloors ? Math.max(photo!.phase, 0.01) : 0;
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
      photo,
      phase,
    };
  });
  return { plans, cutsOf };
}

export interface BuildingChunkOptions {
  /** 每画一块墙面回调（铺面招牌摆放）。 */
  onSpan?: (plan: BuildingPlan, span: WallSpanInfo) => void;
  /** 屋顶机房与水箱（默认 true）。 */
  rooftops?: boolean;
  /** R3 真实贴面的贴图集（与 PrepareOptions.facades 相同）。 */
  facades?: FacadeMeta;
}

/** 这栋楼的墙（任何一片）有照片。 */
export function hasWallPhoto(pl: Pick<BuildingPlan, 'photo'>): boolean {
  return !!pl.photo?.records.some((r) => r?.rings.some((ring) => ring.some((pc) => pc.page >= 0)));
}

/** 这栋楼的屋顶（任何一块）有照片。 */
export function hasRoofPhoto(pl: Pick<BuildingPlan, 'photo'>): boolean {
  return !!pl.photo?.records.some((r) => r && r.roof.page >= 0);
}

/** 屋顶机房的宿主：有分层体块时放在顶块上。 */
function rooftopHost(pl: BuildingPlan): BuildingPlan {
  return pl.p.parts ? { ...pl, p: { ...pl.p, ring: pl.p.crest.ring, top: pl.p.crest.top } } : pl;
}

/** 分层体块逐块挤出：顶块之上的小块换屋顶机房立面，冠顶泛光只给主体及以上，只有底座回调墙面（招牌）。 */
function extrudeParts(arrays: MeshArrays, pl: BuildingPlan, parts: readonly PreparedPart[], cutsOf: WallCutsFn, opts: BuildingChunkOptions): void {
  const { p } = pl;
  const main = parts.find((x) => x.ring === p.main.ring) ?? parts[0]!;
  const crest = parts.find((x) => x.ring === p.crest.ring) ?? main;
  const noCrown: BldgAttr = [pl.bldg[0], pl.bldg[1], pl.bldg[2], pl.bldg[3] & ~FEATURE.crownMask];
  for (const part of parts) {
    const plant = isPlantPart(part, crest);
    const ph = pl.photo && opts.facades ? prismPhoto(pl.photo, opts.facades, part.index, part.top, ringBounds(part.ring.outer), null) : null;
    extrudePrism(arrays, {
      wallPhoto: ph?.wall,
      roofPhoto: ph?.roof,
      phase: pl.phase,
      outer: part.ring.outer,
      holes: part.ring.holes,
      bottom: part.bottom,
      base: p.base,
      top: part.top,
      style: plant ? styleCode(p.b.style, FacadeMode.Plant, pl.rnd) : pl.style,
      uOffset: pl.rnd * 97,
      uProject: true,
      cuts: (ring, edge) => cutsOf(part.body, ring, edge),
      bldg: part.top >= main.top ? pl.bldg : noCrown,
      onSpan: part.index === 0 && opts.onSpan ? (s) => opts.onSpan!(pl, s) : undefined,
    });
  }
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
      if (p.parts) extrudeParts(arrays, pl, p.parts, cutsOf, opts);
      else {
        // 整栋平顶而记录按 parts 分块（LOW 档不分层的楼）：不用照片——只用底座那项要在底座顶切开墙面，
        // 每面墙多两个三角形，LOW 档全城加起来约 2 万；LOW 只有 4 m/px 的远景图集，这些楼照旧画程序立面
        const ph = pl.photo && opts.facades && !pl.photo.parted ? prismPhoto(pl.photo, opts.facades, null, p.top, ringBounds(p.ring.outer), null) : null;
        extrudePrism(arrays, {
          wallPhoto: ph?.wall,
          roofPhoto: ph?.roof,
          phase: pl.phase,
          outer: p.ring.outer,
          holes: p.ring.holes,
          bottom: p.bottom,
          base: p.base,
          top: p.top,
          style: pl.style,
          uOffset: pl.rnd * 97,
          cuts: (ring, edge) => cutsOf(p.body, ring, edge),
          bldg: pl.bldg,
          onSpan: opts.onSpan ? (s) => opts.onSpan!(pl, s) : undefined,
        });
      }
      // 复审修正：照片屋顶上照样加程序机房 / 水箱（照片俯视图把机房压成一张平面，斜看没有体积）
      if (opts.rooftops !== false && !p.crowned) addRooftops(arrays, rooftopHost(pl));
    }
    out.set(key, { coord: g.coord, arrays });
  }
  return out;
}

export function buildBuildingChunks(
  buildings: readonly Building[],
  ground: HeightFn,
  sensitive: readonly SensitiveZone[],
  opts: BuildingChunkOptions & PrepareOptions = {},
): Map<string, { coord: ChunkCoord; arrays: MeshArrays }> {
  const { plans, cutsOf } = planBuildings(buildings, ground, sensitive, opts);
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
  /** 每帧（相机附近的实例：窗口冷气机）。 */
  update(camera: Camera): void;
  plans: BuildingPlan[];
  /** 天台灯箱、LED 幕墙等亮面：LOW 档海面发光条的光源。 */
  emitters: Emitter[];
  /** R3：每个贴图页覆盖的楼群外包盒（模拟坐标米，[minX, minY, minZ, maxX, maxY, maxZ] × 页数；没有楼用到的页全为 0）。 */
  pageBoxes: Float32Array | null;
  /** R3：(页号, 楼外包盒) 对，见 facadePageEntries。 */
  pageEntries: { pageOf: Int32Array; boxes: Float32Array } | null;
}

/** 每个贴图页覆盖的楼群外包盒（模拟坐标米；流式加载按相机到盒的距离排先后）。 */
export function facadePageBoxes(plans: readonly BuildingPlan[], pages: number): Float32Array {
  const out = new Float32Array(pages * 6);
  const seen = new Uint8Array(pages);
  for (const pl of plans) {
    if (!pl.photo) continue;
    const used = new Set<number>();
    for (const rec of pl.photo.records) if (rec) for (const pg of recordPages(rec)) used.add(pg);
    if (used.size === 0) continue;
    const bb = ringBounds(pl.p.ring.outer);
    let top = pl.p.top;
    for (const part of pl.p.parts ?? []) top = Math.max(top, part.top);
    const box = [bb.minX / 10, bb.minY / 10, pl.p.bottom / 10, bb.maxX / 10, bb.maxY / 10, top / 10];
    for (const pg of used) {
      if (pg >= pages) continue;
      const o = pg * 6;
      if (!seen[pg]) {
        out.set(box, o);
        seen[pg] = 1;
        continue;
      }
      for (let k = 0; k < 3; k++) {
        out[o + k] = Math.min(out[o + k]!, box[k]!);
        out[o + 3 + k] = Math.max(out[o + 3 + k]!, box[3 + k]!);
      }
    }
  }
  return out;
}

/** 每栋有照片的楼在它用到的每页上各一项 (页号, 楼外包盒)：流式加载按「页上最近一栋楼」排先后（budget.pageNearest）。 */
export function facadePageEntries(plans: readonly BuildingPlan[], pages: number): { pageOf: Int32Array; boxes: Float32Array } {
  const pageOf: number[] = [];
  const boxes: number[] = [];
  for (const pl of plans) {
    if (!pl.photo) continue;
    const used = new Set<number>();
    for (const rec of pl.photo.records) if (rec) for (const pg of recordPages(rec)) if (pg < pages) used.add(pg);
    if (used.size === 0) continue;
    const bb = ringBounds(pl.p.ring.outer);
    let top = pl.p.top;
    for (const part of pl.p.parts ?? []) top = Math.max(top, part.top);
    for (const pg of [...used].sort((a, b) => a - b)) {
      pageOf.push(pg);
      boxes.push(bb.minX / 10, bb.minY / 10, pl.p.bottom / 10, bb.maxX / 10, bb.maxY / 10, top / 10);
    }
  }
  return { pageOf: Int32Array.from(pageOf), boxes: Float32Array.from(boxes) };
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
    // 整合（R2）：LoD2 多块楼的招牌只挂底座墙，顶取这段墙的顶（退台以上没有墙，直招牌不能伸出去）
    topM: Math.min(pl.p.top, s.z1) / 10,
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
  const lowParts = tier === 'low' ? lowTierPartBuildings(city.buildings) : null;
  const facades = city.meta.facades;
  const { plans, cutsOf } = planBuildings(city.buildings, ground, city.zones.sensitive, {
    useParts: lowParts ? (b) => lowParts.has(b.id) : undefined,
    facades,
  });
  const quads: SignQuad[] = [];
  const acs: AcUnit[] = [];
  const cells = atlasLayout();
  const roads = new RoadIndex(city.roads);
  const chunks = chunksFromPlans(plans, cutsOf, {
    rooftops: tier === 'high',
    facades,
    onSpan: (pl, s) => {
      const f = frontageOf(pl, s);
      if (!f || !facesStreet(f, roads)) return;
      quads.push(...placeSigns(f, cells, tier === 'high'));
      // 窗口冷气机（R2 修复轮 S9）：HIGH 档、住宅 / 唐楼临街面。复审修正：照片 4 px/m 看不出冷气机，
      // 照片墙也照样加（hasShopfront 已限住宅 / 唐楼临街面；冷气机是独立几何，不依赖程序窗格）
      if (tier === 'high') acs.push(...planAcUnits(f));
    },
  });
  const objects: Object3D[] = [];
  const atlas = signAtlasTexture();
  // LOW 档（整合时加）：平贴招牌按序号抽掉约四成（全城视角 LOW 档三角形卡在 30 万上限；招牌密度本就是近似值）
  const kept = tier === 'high' ? quads : quads.filter((_, i) => i % 5 < 3);
  const signs = atlas ? buildSignMesh(kept, atlas) : null;
  if (signs) objects.push(signs);
  // 灯箱、边缘 LED 放顶块上，航空灯放最高块上（没有分层时都是整栋楼）
  const hosts = plans.map((pl) => ({ ...pl, p: { ...pl.p, ring: pl.p.crest.ring, top: pl.p.crest.top, peak: { outer: pl.p.peak.ring.outer, top: pl.p.peak.top } } }));
  const towers = buildTowerLights(hosts, city.landmarks, city.zones.sensitive, createNeonMaterial(), nearHarbourFn(city));
  objects.push(...towers.objects);
  const ac = buildAcUnits(acs);
  if (ac) objects.push(ac.mesh);
  const pageBoxes = facades ? facadePageBoxes(plans, facades.pages.length) : null;
  const pageEntries = facades ? facadePageEntries(plans, facades.pages.length) : null;
  return { chunks, objects, plans, emitters: towers.emitters, pageBoxes, pageEntries, update: (camera) => ac?.update(camera) };
}
