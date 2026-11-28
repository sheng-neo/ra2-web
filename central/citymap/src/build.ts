/**
 * 管线编排：快照 → 各阶段 → CityFile + 地形网格。只读输入、不写盘，CLI 和测试共用。
 *
 * 图层与来源（每层只用一个来源，PLAN §3.2）：
 * - 道路、电车轨、海面、区域、道具点：Overture（OSM 派生，少量路段来自 TomTom；均为 ODbL）；
 * - 建筑（及由建筑轮廓得出的地标摆放）：默认地政总署 Building（CSDI 条款），可整层换回 Overture；
 * - 地形：CEDD 2020 LiDAR DTM（CSDI 条款），单独写 terrain.bin。
 */
import path from 'node:path';
import { CITY_FORMAT, CITY_FORMAT_VERSION, type CityFile, type SourceRef } from '@central/data';
import { EXTENT, LANDSD_DIR, MVP_RECT, ORIGIN, OUT_DIR, PIPELINE_VERSION, RAW_DIR } from './config';
import { groundOf } from './geo/ground';
import { sha256Hex } from './geo/hash';
import { LANDMARKS } from './overrides/landmarks';
import { landsdBuildingSource } from './sources/landsd-buildings';
import { readOverture } from './sources/overture';
import { overtureBuildingSource } from './sources/overture-buildings';
import { REF_OSM, REF_OVERTURE } from './sources/refs';
import { addBuildingParts, readModels, type PartsStats } from './stages/building-parts';
import { buildBuildings } from './stages/buildings';
import { FACADES_DIR, attachFacades, readFacadeDir, readFacades, verifyFacadeFiles, type FacadesStats } from './stages/facades';
import { attachHires, readHires, readHiresBays, verifyHiresFiles, type HiresStats } from './stages/hires';
import {
  LANDMARKS_DIR,
  attachLandmarkMeshes,
  clearCanopiesOfLandmarks,
  landmarkStreetSections,
  cutLandmarkFootprints,
  meshTriangles,
  readLandmarkDir,
  readLandmarkMeshes,
  verifyLandmarkFiles,
  type LandmarkMeshStats,
} from './stages/landmark-meshes';
import { placeLandmarks } from './stages/landmarks';
import { buildProps } from './stages/props';
import { projectRectBounds, unproject } from './stages/project';
import { buildRails } from './stages/rails';
import { buildRoads } from './stages/roads';
import { loadSnapshot } from './stages/snapshot';
import { buildTerrain, type TerrainBuild } from './stages/terrain';
import { readLandsdBuildings } from './stages/terrain-buildings';
import { REF_CEDD_DTM, REF_LANDSD_3DVM, REF_LANDSD_3DVM_TEX } from './stages/terrain-refs';
import { buildWater } from './stages/water';
import { buildZones } from './stages/zones';

/** 建筑图层的来源：整层二选一，绝不逐栋混合。 */
export type BuildingsFrom = 'landsd' | 'overture';

export interface BuildOptions {
  /** Overture 快照目录（含 sources.json），默认仓库里的快照。 */
  rawDir?: string;
  /** 港府数据快照目录（地形 + LandsD 建筑），默认 data-raw/landsd。 */
  landsdDir?: string;
  /** 建筑图层来源，默认 'landsd'。 */
  buildings?: BuildingsFrom;
  /** 贴面贴图目录（校验 sha256 用），默认 client/public/city/facades。 */
  facadesDir?: string;
  /** R5 地标网格与图集目录（校验 sha256 用），默认 client/public/city/landmarks。 */
  landmarksDir?: string;
}

export interface CityBuild {
  city: CityFile;
  /** terrain.bin 的内容来源（网格、陆地掩膜、统计报告）。 */
  terrain: TerrainBuild;
  /** LOD2 分层体块的统计（Overture 建筑层时为 null）。 */
  parts: PartsStats | null;
  /** 真实贴面的统计（没有烘焙清单或 Overture 建筑层时为 null）。 */
  facades: FacadesStats | null;
  /** 电车走廊高清街面层的统计（R4；没有清单时为 null）。 */
  hires: HiresStats | null;
  /** R5 地标真实网格的统计（没有烘焙清单或 Overture 建筑层时为 null）。 */
  landmarkMeshes: LandmarkMeshStats | null;
}

export async function buildCity(opts: BuildOptions = {}): Promise<CityBuild> {
  const snapshot = loadSnapshot(opts.rawDir ?? RAW_DIR);
  const gov = loadSnapshot(opts.landsdDir ?? LANDSD_DIR);
  const ovt = await readOverture(snapshot.files);
  const extent = projectRectBounds(EXTENT);
  const terrain = buildTerrain(gov);
  const ground = groundOf(terrain.grid);

  const landsd = (opts.buildings ?? 'landsd') === 'landsd';
  const source = landsd ? landsdBuildingSource(readLandsdBuildings(gov.files)) : overtureBuildingSource(ovt.buildings);
  const built = buildBuildings(await source.load(), source.src, extent, ground);
  const placed = placeLandmarks(LANDMARKS, built.buildings, ground);
  const { landmarks } = placed;

  const roads = buildRoads(ovt.segments, extent);
  const zones = buildZones(ovt.landUse, ovt.buildings, MVP_RECT);
  // LOD2：地政总署 3D 模型 → 分层体块（只配 LandsD 建筑层；匹配时带上地标原型，免得原型的造型转嫁给邻楼）
  const withParts = landsd
    ? addBuildingParts(built.buildings, placed.buildings, readModels(gov.files), { landmarks, sensitive: zones.sensitive })
    : null;
  // R3 真实贴面：烘焙清单 + public/city/facades/ 的贴图（校验 sha256）→ Building.facade（几何指纹不符的楼不接）
  const facadesDoc = landsd ? readFacades(gov.files) : null;
  if (facadesDoc) verifyFacadeFiles(facadesDoc, readFacadeDir(opts.facadesDir ?? path.join(OUT_DIR, FACADES_DIR)));
  const withFacades = facadesDoc ? attachFacades(withParts?.buildings ?? placed.buildings, facadesDoc, zones.sensitive) : null;
  // R4 电车走廊高清街面层：同一目录的 h*.webp（校验 sha256）→ Building.hires（几何指纹同 R3）
  const hiresDoc = landsd ? readHires(gov.files) : null;
  if (hiresDoc) verifyHiresFiles(hiresDoc, readFacadeDir(opts.facadesDir ?? path.join(OUT_DIR, FACADES_DIR)));
  const afterFacades = withFacades?.buildings ?? withParts?.buildings ?? placed.buildings;
  // [r4:int] 铺位清单（I-1 路面铺面溢光的数据）：页摘要不符时报错
  const withHires = hiresDoc ? attachHires(afterFacades, hiresDoc, zones.sensitive, undefined, readHiresBays(gov.files)) : null;
  const facaded = withHires?.buildings ?? afterFacades;
  // R5 真实地标：烘焙清单 + public/city/landmarks/ 的网格与图集（校验 sha256）→ LandmarkPlacement.mesh；与之重叠的楼切掉重叠部分
  // [r45:int] 切口在高清层之后：被切的楼连 R3 照片与 R4 高清页一并去掉（按旧轮廓烘的页不能贴到切过的墙上）
  const lmDoc = landsd ? readLandmarkMeshes(gov.files) : null;
  const readLm = readLandmarkDir(opts.landmarksDir ?? path.join(OUT_DIR, LANDMARKS_DIR));
  if (lmDoc) verifyLandmarkFiles(lmDoc, readLm);
  const withMeshes = lmDoc ? attachLandmarkMeshes(landmarks, lmDoc, zones.sensitive) : null;
  const cut = withMeshes ? cutLandmarkFootprints(facaded, withMeshes.landmarks) : null;
  if (withMeshes && cut) withMeshes.stats.cut = cut.cut;
  // [r45:int] R4 的雨篷让开 R5 的地标网格（网格在街面高度可能伸出旧轮廓；按近景网格的三角形量，文件已校验过 sha256）
  const meshes = new Map<string, Float64Array>();
  for (const l of withMeshes?.landmarks ?? []) if (l.mesh) meshes.set(l.id, meshTriangles(readLm(l.mesh.high)!));
  const cleared = withMeshes && cut ? clearCanopiesOfLandmarks(cut.buildings, withMeshes.landmarks, meshes) : null;
  if (withMeshes && cleared) {
    withMeshes.stats.canopiesTrimmed = cleared.trimmed;
    withMeshes.stats.canopiesDropped = cleared.dropped;
  }
  const buildings = cleared?.buildings ?? cut?.buildings ?? facaded;
  // [r45:fix] 地标网格在行人高度的实心范围（客户端的走线、街上设施、路灯杆避开它；网格在街面高度会伸出旧轮廓）
  const street = withMeshes ? landmarkStreetSections(withMeshes.landmarks, meshes, ground) : null;
  if (withMeshes && street) withMeshes.stats.streetRings = street.rings;

  const sources = new Map<string, SourceRef>([[REF_OSM.id, REF_OSM], [REF_OVERTURE.id, REF_OVERTURE]]);
  for (const ref of [...roads.refs, ...built.refs]) sources.set(ref.id, ref);
  if (withParts && withParts.stats.buildingsWithParts > 0) sources.set(REF_LANDSD_3DVM.id, REF_LANDSD_3DVM);
  if (withFacades?.meta || withHires?.meta || withMeshes?.meta) sources.set(REF_LANDSD_3DVM_TEX.id, REF_LANDSD_3DVM_TEX);
  sources.set(REF_CEDD_DTM.id, REF_CEDD_DTM);

  const [lon, lat] = unproject(0, 0);
  const city: CityFile = {
    format: CITY_FORMAT,
    version: CITY_FORMAT_VERSION,
    meta: {
      origin: { e: ORIGIN.e, n: ORIGIN.n, lon: Math.round(lon * 1e7) / 1e7, lat: Math.round(lat * 1e7) / 1e7 },
      crs: 'EPSG:2326',
      unit: 'dm',
      bbox: [extent[0], extent[1], extent[2], extent[3]],
      sources: [...sources.values()],
      build: {
        pipelineVersion: PIPELINE_VERSION,
        inputsDigest: sha256Hex(`overture ${snapshot.inputsDigest}\nlandsd ${gov.inputsDigest}`),
      },
      ...(withFacades?.meta ? { facades: withFacades.meta } : {}),
      ...(withHires?.meta ? { hires: withHires.meta } : {}),
      ...(withMeshes?.meta ? { landmarkMeshes: withMeshes.meta } : {}),
    },
    buildings,
    roads: roads.roads,
    rails: buildRails(ovt.segments, extent),
    water: buildWater(ovt.water),
    zones,
    props: buildProps(ovt.infrastructure, ovt.land, extent, zones.sensitive),
    landmarks: street?.landmarks ?? withMeshes?.landmarks ?? landmarks,
  };
  return {
    city,
    terrain,
    parts: withParts?.stats ?? null,
    facades: withFacades?.stats ?? null,
    hires: withHires?.stats ?? null,
    landmarkMeshes: withMeshes?.stats ?? null,
  };
}
