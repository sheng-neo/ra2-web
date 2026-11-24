/**
 * CityRenderer：渲染层的唯一入口（PLAN §5）。持有 WebGLRenderer、场景与相机，
 * 从 CityFile 搭建全部图层，每帧做区块远近切换、雾浓度随视距调整、动画时间推进。
 */
import { Color, FogExp2, PerspectiveCamera, Scene, WebGLRenderer, type Mesh, type Object3D } from 'three';
import type { CityFile, TerrainGrid } from '@central/data';
import type { HeightFn } from '../data/terrain';
import { FAR_SHORE_M, buildBackdrop, buildSky } from './backdrop';
import { buildBuildingChunks } from './buildings';
import { ChunkLayer } from './chunk-layer';
import { buildGround } from './ground';
import { buildLandmarks } from './landmarks';
import { buildRails, buildZoneOutlines } from './lines';
import { createBuildingMaterial } from './materials/building';
import { NIGHT } from './materials/common';
import { createNeonMaterial } from './materials/neon';
import { createRoadMaterial } from './materials/road';
import { createSolidMaterial } from './materials/solid';
import { buildRoadChunks } from './roads';

/** 相机离区包围盒小于此距离（米）时拆成逐块绘制。 */
const NEAR_REGION_M = 220;
const FAR_CLIP_M = 9000;
const BASE_FOV = 50;
const MIN_HFOV = 50;

/** 雾浓度随视距（相机到注视点，米）在对数尺度上插值：贴地约 350–600 m 能见，远观与高空放宽。 */
export function fogDensityFor(distanceM: number): number {
  const t = Math.min(Math.max(Math.log(distanceM / 120) / Math.log(1500 / 120), 0), 1);
  return 0.0024 + (0.00045 - 0.0024) * t;
}

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

export type BuildStep = (label: string, fraction: number) => Promise<void>;

export class CityRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(BASE_FOV, 1, 1, FAR_CLIP_M);
  private readonly fog = new FogExp2(NIGHT.fog, fogDensityFor(1000));
  private readonly time = { value: 0 };
  private readonly layers: ChunkLayer[] = [];
  private readonly sky: Mesh;

  constructor(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new WebGLRenderer({ canvas, antialias: dpr <= 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.scene.fog = this.fog;
    this.scene.background = new Color(NIGHT.fog);
    this.sky = buildSky(FAR_CLIP_M * 0.9);
    this.scene.add(this.sky);
  }

  /**
   * 分阶段搭建；每阶段之后 await step，让加载界面有机会刷新。
   * relief 为地形渲染网格（没有地形时为 null），ground 是在同一网格上取高度的函数。
   */
  async build(city: CityFile, ground: HeightFn, relief: TerrainGrid | null, step: BuildStep): Promise<void> {
    const zones = city.zones.sensitive;
    const facade = createBuildingMaterial();
    const add = (...objs: (Object3D | null)[]) => {
      for (const o of objs) if (o) this.scene.add(o);
    };

    await step('生成建築', 0.72);
    const buildings = new ChunkLayer('buildings', buildBuildingChunks(city.buildings, ground, zones), facade);
    this.layers.push(buildings);
    add(buildings.group);

    await step('生成道路', 0.8);
    const roads = new ChunkLayer('roads', buildRoadChunks(city.roads, ground), createRoadMaterial());
    this.layers.push(roads);
    add(roads.group, buildRails(city.rails, ground), buildZoneOutlines(zones, ground));

    await step('生成地標與海港', 0.86);
    add(
      ...buildLandmarks(city.landmarks, ground, zones, {
        facade: createBuildingMaterial(0.75),
        solid: createSolidMaterial(),
        neon: createNeonMaterial(this.time),
      }),
      ...buildGround(city, relief, FAR_SHORE_M, this.time),
      buildBackdrop(createBuildingMaterial(0.32)),
    );

    await step('編譯著色器', 0.92);
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    // 竖屏时放大垂直视角，保证水平视角不小于 MIN_HFOV
    const needV = (2 * Math.atan(Math.tan((MIN_HFOV * Math.PI) / 360) / aspect) * 180) / Math.PI;
    this.camera.fov = Math.max(BASE_FOV, needV);
    this.camera.updateProjectionMatrix();
  }

  /** viewDistance：相机到注视点距离（米），决定雾浓度。 */
  frame(dt: number, viewDistance: number): void {
    this.time.value += dt;
    this.fog.density = fogDensityFor(viewDistance);
    this.sky.position.copy(this.camera.position);
    for (const l of this.layers) l.update(this.camera.position, NEAR_REGION_M);
    this.renderer.render(this.scene, this.camera);
  }

  stats(): RenderStats {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
    };
  }

  /** 各分块图层的区/块数（调试用）。 */
  layerSummary(): string {
    return this.layers.map((l) => `${l.group.name} ${l.regionCount}區/${l.chunkCount}塊`).join(' · ');
  }
}
