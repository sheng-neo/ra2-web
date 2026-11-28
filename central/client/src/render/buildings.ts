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
import type { Building, CityFile, FacadeMeta, FlatXY, HiresMeta, SensitiveZone } from '@central/data';
import type { HeightFn } from '../data/terrain';
import { normalizeRing, pointInRing, ringCentroid } from '../geom/ring';
import { crestPart, isPlantPart, lowTierPartBuildings, mainPart, peakPart, prepareParts, type PreparedPart } from './building-parts';
import { groupByChunk, chunkOf, type ChunkCoord } from './chunks';
import { extrudePrism, type WallSpanInfo } from './extrude';
import { buildingPhoto, prismPhoto, recordPages, ringBounds, type BuildingPhoto } from './facades/layout';
import { buildingHires, hiresAttr, hiresCutsS, hiresFaceKey, hiresPieceAt, noPhotoFaces, sectionPages, type BuildingHiresPlan } from './facades/hires-layout';
import { canopyThicknessDm, type CanopyHires, type CanopyItem } from './facades/canopies';
import { isCorridorWall, trackIndex } from './facades/corridor';
import { FEATURE, FacadeMode, LUXURY_PODIUMS, facadeKey, hash01, newFacadeArrays, styleCode, type BldgAttr } from './facade';
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
  /** R4 电车走廊高清街面层（city.meta.hires）；省略时没有高清层。 */
  hires?: HiresMeta;
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
  /** R4 电车走廊高清街面层（不在走廊、敏感区里的楼为 null）。 */
  hires: BuildingHiresPlan | null;
  /** R4 整合（红线）：不贴照片（连 R3 贴面也不贴）的面键（hiresFaceKey）；没有时 null。 */
  noPhoto: Set<number> | null;
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
    const hires = sens ? null : buildingHires(p.b.hires, opts.hires);
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
    if (!sens && LUXURY_PODIUMS.has(p.b.id)) feature |= FEATURE.luxury | FEATURE.mall;
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
      hires,
      noPhoto: noPhotoFaces(p.b.hires),
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
  /** R4 高清街面层的贴图集（与 PrepareOptions.hires 相同）。 */
  hires?: HiresMeta;
}

/** 这栋楼第 part 块棱柱第 ring 个环第 edge 条边的高清段（没有时 undefined）。 */
function hiresFn(pl: BuildingPlan, part: number) {
  const faces = pl.hires?.faces;
  if (!faces || faces.size === 0) return undefined;
  return (ring: number, edge: number) => faces.get(hiresFaceKey(part, ring, edge));
}

/** R4 整合（红线）：这栋楼第 part 块第 ring 个环第 edge 条边不贴照片（BuildingHires.x）。 */
function noPhotoFn(pl: Pick<BuildingPlan, 'noPhoto'>, part: number) {
  const set = pl.noPhoto;
  if (!set) return undefined;
  return (ring: number, edge: number) => set.has(hiresFaceKey(part, ring, edge));
}

/**
 * 雨篷檐口四角的 aHires：雨篷贴墙的一边落在底座外环的哪条边上（两端离边线 ≤ 0.4 m、在边的范围内），
 * 再按这面墙的高清段取片（檐口照片就是投影到墙上的那几行）。找不到边或没有片时 null。
 */
export function canopyFascia(pl: Pick<BuildingPlan, 'p' | 'hires'>, rec: readonly number[], page: number): CanopyItem['fascia'] {
  return canopyItems(pl, rec, page)[0]?.fascia ?? null;
}

/**
 * 雨篷记录 → 雨篷项（复审修正：檐口跨过高清片的左右边时在片边切开，每段取自己的片——原来按中点那一片的仿射关系外推，
 * 片外的檐口贴到了页里别的墙、别的楼）。没有高清段的雨篷原样一项（fascia null）。
 */
export function canopyItems(pl: Pick<BuildingPlan, 'p' | 'hires'>, rec: readonly number[], page: number): CanopyItem[] {
  const whole: CanopyItem[] = [{ rec, fascia: null }];
  const faces = pl.hires?.faces;
  if (!faces || faces.size === 0 || rec.length !== 10) return whole;
  const base = pl.p.parts?.find((x) => x.index === 0)?.ring.outer ?? pl.p.ring.outer;
  const [x0, y0, x1, y1, , zt, th] = rec as [number, number, number, number, number, number, number];
  const zb = zt - canopyThicknessDm(th);
  const n = base.length >> 1;
  for (let e = 0; e < n; e++) {
    const ax = base[e * 2]!;
    const ay = base[e * 2 + 1]!;
    const bx = base[((e + 1) % n) * 2]!;
    const by = base[((e + 1) % n) * 2 + 1]!;
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1) continue;
    const tx = (bx - ax) / L;
    const ty = (by - ay) / L;
    const off = (x: number, y: number) => Math.abs((x - ax) * ty - (y - ay) * tx);
    const along = (x: number, y: number) => (x - ax) * tx + (y - ay) * ty;
    const s0 = along(x0, y0);
    const s1 = along(x1, y1);
    if (off(x0, y0) > 4 || off(x1, y1) > 4 || s0 < -4 || s1 > L + 4 || s1 <= s0) continue;
    const secs = faces.get(hiresFaceKey(0, 0, e));
    if (!secs) return whole;
    // 片的左右边（米，沿边）→ dm
    const cuts = [s0, ...hiresCutsS(secs, s0 / 10, s1 / 10).map((c) => c * 10), s1];
    const out: CanopyItem[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a0 = cuts[i]!;
      const a1 = cuts[i + 1]!;
      if (a1 - a0 < 1) continue;
      const t0 = (a0 - s0) / (s1 - s0);
      const t1 = (a1 - s0) / (s1 - s0);
      const sub = [x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, ...rec.slice(4)];
      const hit = hiresPieceAt(secs, (a0 + a1) / 20, (zt + zb) / 2);
      // 檐口上下沿也要在同一片里（片按行切成带，檐口跨带时不贴照片）
      const fit = !!hit && hiresPieceAt(secs, (a0 + a1) / 20, zt - 0.01)?.pc === hit.pc && hiresPieceAt(secs, (a0 + a1) / 20, zb + 0.01)?.pc === hit.pc;
      const at = (sd: number, z: number): CanopyHires => hiresAttr(hit, sd / 10, z, page);
      out.push({ rec: sub, fascia: hit && fit ? [at(a0, zb), at(a1, zb), at(a1, zt), at(a0, zt)] : null });
    }
    return out.length ? out : whole;
  }
  return whole;
}

/** 这面临街墙（底座、外环）有高清街面段：照片里有真实的铺面与招牌，程序招牌、直招牌、冷气机都不加。 */
export function hasHiresStreet(pl: Pick<BuildingPlan, 'hires'>, ring: number, edge: number): boolean {
  const secs = pl.hires?.faces.get(hiresFaceKey(0, ring, edge));
  return !!secs?.some((s) => s.kind === 0 && s.pieces.length > 0);
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
      hires: hiresFn(pl, part.index),
      noPhoto: noPhotoFn(pl, part.index), // [r4:int] 红线：排除的面不贴 R3 照片
      hiresPage: opts.hires?.page,
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
          // R4：整栋平顶（数据里也没有 parts）时第 0 块就是整栋；LOW 档按 parts 分块的楼画成平顶时不用高清层
          hires: p.b.parts?.length ? undefined : hiresFn(pl, 0),
          noPhoto: noPhotoFn(pl, 0), // [r4:int] 第 0 块的环 = footprint（parts[0] 省略环）
          hiresPage: opts.hires?.page,
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
  /** R4：高清页的 (页号, 面外包盒) 对，见 hiresPageEntries。 */
  hiresEntries: { pageOf: Int32Array; boxes: Float32Array } | null;
  /** R4 雨篷项（HIGH 档；网格在街道建好后由 city-renderer 让开障碍再建，见 facades/canopy-fit.ts）。 */
  canopies: CanopyItem[];
  /** R4 整合：因为有高清街面照片而不加程序招牌 / 直招牌 / 冷气机的临街墙段数（调试钩子 facades().procSuppressed）。 */
  procSuppressed: number;
}

/**
 * R4 高清页：每个用到它的面一项 (页号, 面外包盒)（模拟坐标米，[minX, minY, minZ, maxX, maxY, maxZ]）。
 * 面外包盒 = 这栋楼外环外包框在 xy 上、段的高程范围在 z 上（面比楼更细的盒要几何；楼盒已足够让「页上最近的面」排序有效）。
 */
export function hiresPageEntries(plans: readonly BuildingPlan[], pages: number): { pageOf: Int32Array; boxes: Float32Array } {
  const pageOf: number[] = [];
  const boxes: number[] = [];
  for (const pl of plans) {
    if (!pl.hires) continue;
    const bb = ringBounds(pl.p.ring.outer);
    const z: Map<number, [number, number]> = new Map();
    for (const secs of pl.hires.faces.values()) {
      for (const sec of secs) {
        for (const pg of sectionPages([sec])) {
          if (pg < 0 || pg >= pages) continue;
          const cur = z.get(pg);
          z.set(pg, cur ? [Math.min(cur[0], sec.zBot), Math.max(cur[1], sec.zTop)] : [sec.zBot, sec.zTop]);
        }
      }
    }
    for (const pg of [...z.keys()].sort((a, b) => a - b)) {
      const [z0, z1] = z.get(pg)!;
      pageOf.push(pg);
      boxes.push(bb.minX / 10, bb.minY / 10, z0 / 10, bb.maxX / 10, bb.maxY / 10, z1 / 10);
    }
  }
  return { pageOf: Int32Array.from(pageOf), boxes: Float32Array.from(boxes) };
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
export function buildCityBuildings(
  city: CityFile,
  ground: HeightFn,
  tier: 'high' | 'low' = 'high',
): CityBuildings {
  const lowParts = tier === 'low' ? lowTierPartBuildings(city.buildings) : null;
  const facades = city.meta.facades;
  // R4：高清街面层只给 HIGH 档（LOW 档显存份额放不下，见 facades/budget.ts）
  const hires = tier === 'high' ? city.meta.hires : undefined;
  const { plans, cutsOf } = planBuildings(city.buildings, ground, city.zones.sensitive, {
    useParts: lowParts ? (b) => lowParts.has(b.id) : undefined,
    facades,
    hires,
  });
  const quads: SignQuad[] = [];
  const acs: AcUnit[] = [];
  const cells = atlasLayout();
  const roads = new RoadIndex(city.roads);
  const tracks = trackIndex(city.rails ?? []);
  let procSuppressed = 0;
  const chunks = chunksFromPlans(plans, cutsOf, {
    rooftops: tier === 'high',
    facades,
    hires,
    onSpan: (pl, s) => {
      const f = frontageOf(pl, s);
      if (!f || !facesStreet(f, roads)) return;
      // R4：有高清街面照片的墙（真实的铺面与招牌、窗口冷气机都在照片里）不加程序招牌、直招牌与冷气机
      if (hasHiresStreet(pl, s.ring, s.edge)) {
        procSuppressed++; // [r4:int] 调试钩子 facades().procSuppressed
        return;
      }
      // 复审修正：没有高清照片的电车走廊墙（排除的面、没有照片的楼、LOW 档）不挂程序招牌 / 直招牌，只留暗一点的程序铺面
      const corridor = isCorridorWall(tracks, f.x0, f.y0, f.x1, f.y1, f.nx, f.ny);
      if (corridor) procSuppressed++;
      else quads.push(...placeSigns(f, cells, tier === 'high'));
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
  // R4：走廊楼的雨篷（HIGH 档才有高清层）。[r4:int] 这里只给出雨篷项（檐口照片坐标、墙脚地面）；网格由 city-renderer 在街道建好后
  // 按 facades/canopy-fit.ts 让开路灯 / 交通灯杆、候车亭、港铁出口、电车行车线与天桥再建（全城一个 draw call，buildCanopies）
  const canopies = hires
    ? plans.flatMap((pl) => (pl.hires?.canopies ?? []).flatMap((rec) => canopyItems(pl, rec, hires.page).map((it): CanopyItem => ({ ...it, groundM: pl.groundM }))))
    : [];
  const pageBoxes = facades ? facadePageBoxes(plans, facades.pages.length) : null;
  const pageEntries = facades ? facadePageEntries(plans, facades.pages.length) : null;
  const hiresEntries = hires ? hiresPageEntries(plans, hires.pages.length) : null;
  return { chunks, objects, plans, emitters: towers.emitters, pageBoxes, pageEntries, hiresEntries, canopies, procSuppressed, update: (camera) => ac?.update(camera) };
}
