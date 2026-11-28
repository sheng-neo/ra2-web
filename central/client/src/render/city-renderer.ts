/**
 * CityRenderer：渲染层的唯一入口（PLAN §5）。持有 WebGLRenderer、场景与相机，
 * 从 CityFile 搭建全部图层，每帧做区块远近切换、动画时间推进、海面反射与后处理。
 * 写实化（realism spec §iii、§v）：画质档在构造时定（URL → 能力探测），HIGH 走 HDR 目标 + bloom + 输出 pass，
 * LOW 直出画布；雾是契约里的指数高度雾（共享 uniform），不再随视距调整。
 */
import { Frustum, Matrix4, PerspectiveCamera, Scene, WebGLRenderer, type Camera, type Material, type Mesh, type Object3D } from 'three';
import type { CityFile, TerrainGrid } from '@central/data';
import type { HeightFn } from '../data/terrain';
import { buildBackdrop, buildSky } from './backdrop';
import { buildCityBuildings } from './buildings';
import { ChunkLayer } from './chunk-layer';
import { buildGround } from './ground';
import { RealLandmarks, buildLandmarkFallback, type LandmarkDebug } from './landmarks'; // [r5:landmarks]
import { desktopAtlasRes } from './landmarks/format'; // [r45:fix]
import { buildRails, buildZoneOutlines } from './lines';
import { createBuildingMaterial } from './materials/building';
import { createRoadMaterial } from './materials/road';
import { SHARED, advanceShared, installToneMapping } from './materials/lighting';
import { getQuality, readParam, registerTextureBytes, setQuality, textureBytes, textureLedgerEntries, urlTier, type Quality, type Tier } from './materials/lighting';
import { footprintTest } from './road-corridor';
import { buildRoadChunks, planRoads } from './roads';
import { dropZoneLamps } from './streets/surface';
import { buildStreets, type Streets } from './streets';
import { PostPipeline } from './post/pipeline';
import { TIER_SPECS, canvasBytes, chooseQuality, msaaSamples, probeCaps, startDpr } from './quality';
import { WaterLayer } from './water';
import { Boats, type BoatDebug } from './boats'; // [r3:liveries]
import type { VehicleDebug } from './streets/vehicles'; // [r3:liveries]
import { FacadeStreamer, type FacadeDebug } from './facades/streamer';
import { setFrontageLights } from './streets/frontage-field'; // [r4:street]
import { stubFrontageLights } from './streets/frontage-stub'; // [r4:street]
import { canopyLights, dropOnHiresFaces, frontageLights, hiresStreetWalls } from './facades/frontage'; // [r4:int]
import { buildCanopies } from './facades/canopies'; // [r4:int]
import { fitCanopies } from './facades/canopy-fit'; // [r4:int]
import { canopyObstacles } from './canopy-obstacles'; // [r4:int]
import { tramStopIslands } from './streets/trams'; // [r4:int]

/** 相机离区包围盒小于此距离（米）时拆成逐块绘制。 */
const NEAR_REGION_M = 220;
const FAR_CLIP_M = 9000;
const BASE_FOV = 50;
const MIN_HFOV = 50;

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  // 画质档与管线（realism spec §iii.6）
  tier: Tier;
  dpr: number;
  /** drawing buffer 像素数。 */
  bufferPx: number;
  msaa: number;
  bloom: boolean;
  reflection: boolean;
  /** 全分辨率后处理 pass 数。 */
  passesFull: number;
  /** 已登记的 GPU 贴图 + 渲染目标内存（MB）。 */
  texMB: number;
  /** 其中平面反射 pass 的 draw call / 三角形（不在视野时为 0）。 */
  reflCalls?: number;
  reflTriangles?: number;
  /** R3 真实贴面：贴面贴图显存（MB，已含在 texMB 里）、视野要的页还有几张没到、已下载的贴图字节数。 */
  facadeMB?: number;
  facadePending?: number;
  facadeBytes?: number;
  /** R4 高清街面层：常驻高清页显存（MB，含在 facadeMB 里）、视野要的高清页还没到的、已下载的高清页字节。 */
  hiresMB?: number; // [r4:hires]
  hiresPending?: number; // [r4:hires]
  hiresBytes?: number; // [r4:hires]
  /** R5 真实地标：图集显存（MB，已含在 texMB 里）、还在等的下载、已下载字节、正在画近景网格的座数。 */
  landmarkMB?: number;
  landmarkPending?: number;
  landmarkBytes?: number;
  landmarkHigh?: number;
}

/** 贴面贴图的位置（相对页面的目录前缀与文件名后缀，见 main.ts FACADE_SUFFIX）。 */
export interface FacadeSource {
  base: string;
  suffix: string;
}

export type BuildStep = (label: string, fraction: number) => Promise<void>;

export class CityRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(BASE_FOV, 1, 1, FAR_CLIP_M);
  private readonly layers: ChunkLayer[] = [];
  /** 分块图层判断「近区大部分在视野里」用（每帧重算，不分配）。 */
  private readonly layerFrustum = new Frustum();
  private readonly layerPm = new Matrix4();
  private readonly sky: Mesh;
  readonly quality: Quality;
  private readonly post: PostPipeline;
  private water: WaterLayer | null = null;
  private boats: Boats | null = null;
  private streets: Streets | null = null;
  private buildingsUpdate: ((camera: Camera) => void) | null = null;
  private procSuppressed = 0; // [r4:int]
  private landmarkSuppressed = 0; // [r45:int]
  private canopyPieces = 0; // [r4:int]
  private facades: FacadeStreamer | null = null; // [r3:facades]
  private landmarks: RealLandmarks | null = null; // [r5:landmarks]
  private dpr: number;
  private css: [number, number] = [1, 1];
  private readonly canvasDepth: boolean;
  /** 触屏 / 粗指针设备（贴面与地标的手机预算）。 */
  private readonly mobile: boolean;
  /** 画布自带 MSAA 的采样数（LOW 档；HIGH 为 0）。 */
  private readonly canvasSamples: number;

  constructor(canvas: HTMLCanvasElement) {
    // 画质档：URL（?q= / #q-）优先，其次能力探测；必须在 build 之前 setQuality
    const caps = probeCaps();
    this.quality = chooseQuality(urlTier(), caps);
    setQuality(this.quality);
    const spec = TIER_SPECS[this.quality.tier];
    const hdr = this.quality.tier === 'high' && readParam('post') !== '0'; // #post-0 调试直出
    // HIGH 走 HDR 目标（自带深度），画布不要深度缓冲（省约 4 B/px 显存）
    this.canvasDepth = !hdr;
    this.renderer = new WebGLRenderer({ canvas, antialias: spec.canvasAntialias, depth: this.canvasDepth, powerPreference: 'high-performance' });
    this.canvasSamples = spec.canvasAntialias ? Number(this.renderer.getContext().getParameter(this.renderer.getContext().SAMPLES)) || 0 : 0;
    this.mobile = navigator.maxTouchPoints > 0 || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    this.dpr = startDpr(this.quality.tier, window.devicePixelRatio || 1, window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.dpr);
    installToneMapping(this.renderer);
    const startPx = window.innerWidth * window.innerHeight * this.dpr * this.dpr;
    const bloom = hdr && this.quality.bloom && readParam('bloom') !== '0';
    this.post = new PostPipeline(this.renderer, { hdr, bloom, samples: msaaSamples(this.quality, caps, startPx) });
    this.scene.background = SHARED.uHazeColor.value; // 背景 = 雾色 = 地平线天色
    this.sky = buildSky(FAR_CLIP_M * 0.9);
    this.scene.add(this.sky);
  }

  /**
   * 分阶段搭建；每阶段之后 await step，让加载界面有机会刷新。
   * relief 为地形渲染网格（没有地形时为 null），ground 是在同一网格上取高度的函数。
   */
  async build(city: CityFile, ground: HeightFn, relief: TerrainGrid | null, step: BuildStep, facadeSrc?: FacadeSource): Promise<void> {
    const zones = city.zones.sensitive;
    // R3 真实贴面：有贴图集时建流式加载器，把它的贴图 uniform 交给建筑材质
    if (city.meta.facades && facadeSrc) {
      const mobile = this.mobile;
      this.facades = new FacadeStreamer({ renderer: this.renderer, meta: city.meta.facades, ...facadeSrc, tier: this.quality.tier, mobile, hires: city.meta.hires }); // [r4:hires]
    }
    const facade = createBuildingMaterial(this.facades ? { uniforms: this.facades.uniforms, near: this.facades.near, hires: this.facades.hires } : undefined); // [r4:hires]
    const add = (...objs: (Object3D | null)[]) => {
      for (const o of objs) if (o) this.scene.add(o);
    };

    await step('生成建築', 0.72);
    const bld = buildCityBuildings(city, ground, getQuality().tier); // [r4:int] 雨篷网格（檐口贴照片）在街道建好后再建，见下
    this.buildingsUpdate = bld.update;
    this.procSuppressed = bld.procSuppressed; // [r4:int]
    this.landmarkSuppressed = bld.landmarkSuppressed; // [r45:int]
    if (bld.pageBoxes) this.facades?.setBoxes(bld.pageBoxes, bld.pageEntries);
    this.facades?.setHires(bld.hiresEntries); // [r4:hires]
    const buildings = new ChunkLayer('buildings', bld.chunks, facade);
    this.layers.push(buildings);
    add(buildings.group, ...bld.objects); // 招牌、航空灯、边缘 LED

    await step('生成道路', 0.8);
    const roadPlans = planRoads(city.roads, ground, city.props);
    dropZoneLamps(roadPlans, zones); // 敏感区只做背景：区内的路不装路灯
    const roads = new ChunkLayer('roads', buildRoadChunks(city.roads, ground, roadPlans, getQuality().tier === 'high', footprintTest(city.buildings)), createRoadMaterial()); // 挡土墙遇楼即停（整合）
    this.layers.push(roads);
    add(roads.group, buildRails(city.rails.filter((r) => r.kind !== 'tram'), ground), readParam('zones') ? buildZoneOutlines(zones, ground) : null); // [r2:trams] 电车路轨改由 streets/trams 画

    await step('生成街道', 0.83);
    this.streets = buildStreets(city, roadPlans, ground, relief);
    add(...this.streets.objects);
    // [r4:int] 雨篷让开路灯 / 交通灯 / 架空线杆、候车亭、港铁出口、电车行车线与天桥后再建（全城一个 draw call）；
    // I-1 铺面光源 = 高清街面的真实铺位（照片里亮着的铺）+ 同一组雨篷的雨篷灯 + 没有高清街面的墙上的占位铺位（今天的程序铺位）
    const tramPoles = this.streets.trams.overhead.supports.filter((p) => p.kind === 'pole').map((p) => [p.x, p.y] as const); // [r4:int]
    const fit = fitCanopies(bld.canopies, canopyObstacles(city.roads, { ...this.streets.canopyParts, routes: this.streets.trams.routes, islands: tramStopIslands(), overheadPoles: tramPoles })); // [r4:int]
    add(buildCanopies(fit.items, this.facades ? { uniforms: this.facades.uniforms, hires: this.facades.hires } : undefined)); // [r4:int]
    this.canopyPieces = fit.items.length; // [r4:int]
    setFrontageLights([...frontageLights(bld.plans), ...canopyLights(fit.items), ...dropOnHiresFaces(stubFrontageLights(bld.plans, city.roads), hiresStreetWalls(bld.plans))], zones, SHARED.uClock.value); // [r4:int]

    await step('生成地標與海港', 0.86);
    add(
      ...this.buildRealLandmarks(city, ground, facade, facadeSrc), // [r5:landmarks] 真实外观首帧后流式加载，之前画轮廓白模
      ...buildGround(city, relief, false), // 网格外由远景山体高度场接上，不画裙坡
    );
    // 新海面（盖在旧 0 mPD 平面之上）、远景（港岛山体两翼 + 九龙）、船
    this.water = new WaterLayer(city, this.quality);
    this.water.setSize(this.renderer.domElement.width, this.renderer.domElement.height);
    const backdrop = buildBackdrop({ relief, low: this.quality.tier === 'low', bboxDm: city.meta.bbox, isWater: (x, y) => this.water!.isWater(x, y) });
    this.water.addEmitters(backdrop.emitters);
    this.water.addEmitters(bld.emitters); // 天台灯箱、LED 幕墙进 LOW 档倒影发光条
    this.boats = new Boats();
    add(this.water.mesh, ...backdrop.objects, ...this.boats.objects);

    await step('編譯著色器', 0.92);
    this.water?.collect(this.scene); // 反射代理层（楼、地标、远景、天空），须在全部图层之后
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.css = [width, height];
    // 复审修正：窗口变大（平板、折叠屏、桌面拉窗口）时按档位的 drawing buffer 上限重新封顶 DPR（原来只在开场算一次，
    // 874×402 @2 拉到 1280×720 后画布 2560×1440、账本 174 MB）；只往下压，变小后不自动升回（自适应 DPR 管升降）
    const cap = this.dprCap(width, height);
    if (this.dpr > cap + 1e-6) {
      this.dpr = cap;
      this.renderer.setPixelRatio(cap);
    }
    this.renderer.setSize(width, height, false);
    SHARED.uViewportPx.value.set(this.renderer.domElement.width, this.renderer.domElement.height);
    // 画布默认帧缓冲也计入显存账本（HIGH：RGBA8 前后两份；LOW：4× MSAA 颜色 + 深度 + resolve）
    registerTextureBytes('atmosphere:canvas', canvasBytes(this.renderer.domElement.width * this.renderer.domElement.height, this.canvasDepth, this.canvasSamples));
    this.post.setSize(this.renderer.domElement.width, this.renderer.domElement.height);
    this.water?.setSize(this.renderer.domElement.width, this.renderer.domElement.height);
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    // 竖屏时放大垂直视角，保证水平视角不小于 MIN_HFOV
    const needV = (2 * Math.atan(Math.tan((MIN_HFOV * Math.PI) / 360) / aspect) * 180) / Math.PI;
    this.camera.fov = Math.max(BASE_FOV, needV);
    this.camera.updateProjectionMatrix();
  }

  /** viewDistance：相机到注视点距离（米）；只用来调雾中光幕（看得越远，相机与亮处之间的雾越厚）。 */
  frame(dt: number, viewDistance: number): void {
    this.renderer.info.reset(); // 一帧可能多次 render，stats() 报整帧总数
    advanceShared(dt);
    this.sky.position.copy(this.camera.position);
    this.camera.updateMatrixWorld();
    this.layerPm.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.layerFrustum.setFromProjectionMatrix(this.layerPm);
    // 只在 HIGH 档按视锥合并近区（省 draw call，多一点三角形）；LOW 档三角形上限更紧，照旧逐块拆
    for (const l of this.layers) l.update(this.camera.position, NEAR_REGION_M, this.quality.tier === 'high' ? this.layerFrustum : undefined);
    this.streets?.update(dt, this.camera);
    this.buildingsUpdate?.(this.camera);
    this.facades?.update(this.camera);
    this.landmarks?.update(this.camera); // [r5:landmarks]
    this.boats?.update(this.water, this.camera); // [r3:liveries] 视野外的船不画
    this.water?.update(this.renderer, this.scene, this.camera); // 平面反射须在主场景之前
    const t = Math.min(Math.max((viewDistance - 150) / 450, 0), 1);
    this.post.render(this.scene, this.camera, 0.3 + 0.7 * t * t * (3 - 2 * t));
  }

  /** 电车系统（调试钩子、打铃音频、跟车机位用）。 */
  get trams(): Streets['trams'] | null { // [r2:trams]
    return this.streets?.trams ?? null; // [r2:trams]
  } // [r2:trams]

  /** 调试钩子（R3 LIVERIES）：全部车辆与船（模拟坐标，米）。 */ // [r3:liveries]
  vehicles(): VehicleDebug[] { // [r3:liveries]
    return this.streets?.vehicles() ?? []; // [r3:liveries]
  } // [r3:liveries]
  /** R4 调试钩子：行人各级 LOD 的人数与三角形数。 */ // [r4:street]
  people(): ReturnType<Streets['people']> { // [r4:street]
    return this.streets?.people() ?? { near: 0, mid: 0, far: 0, triangles: 0, nearTriangles: 0 }; // [r4:street]
  } // [r4:street]
  boatList(): BoatDebug[] { // [r3:liveries]
    return this.boats?.debug() ?? []; // [r3:liveries]
  } // [r3:liveries]

  /** 这个 CSS 尺寸下档位允许的最大 DPR（drawing buffer ≤ TIER_SPECS.bufferCapPx，见 quality.startDpr）。 */
  private dprCap(width: number, height: number): number {
    return startDpr(this.quality.tier, window.devicePixelRatio || 1, Math.max(width, 1), Math.max(height, 1));
  }

  /** 自适应 DPR：换像素比后按当前 CSS 尺寸重建画布与目标。 */
  setPixelRatio(dpr: number): void {
    dpr = Math.min(dpr, this.dprCap(this.css[0], this.css[1]));
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.resize(this.css[0], this.css[1]);
  }

  /** A11 自动降档：关 bloom 与平面反射（不回升）。 */
  downgrade(): void {
    this.post.disableBloom();
    this.water?.disableReflection();
  }

  stats(): RenderStats {
    const info = this.renderer.info;
    const el = this.renderer.domElement;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
     
      tier: this.quality.tier,
      dpr: this.dpr,
      bufferPx: el.width * el.height,
      msaa: this.post.hdr ? this.post.samples : this.canvasSamples,
      bloom: this.post.bloomOn,
      reflection: this.water?.reflectionOn ?? false,
      passesFull: this.post.passesFull,
      texMB: Math.round((textureBytes() / (1024 * 1024)) * 10) / 10,
      reflCalls: this.water?.reflCalls ?? 0,
      reflTriangles: this.water?.reflTriangles ?? 0,
      ...(this.facades?.stats() ?? { facadeMB: 0, facadePending: 0, facadeBytes: 0, hiresMB: 0, hiresPending: 0, hiresBytes: 0 }), // [r4:hires]
      ...(this.landmarks?.stats() ?? {}), // [r5:landmarks]
    };
  }

  /** 首帧画完：贴面开始流式下载（不算进首帧前的数据量）。 */
  facadesBegin(): void {
    this.facades?.begin();
    this.landmarks?.begin(); // [r5:landmarks] 地标真实外观也在首帧之后才下载
  }

  /** 视野要的贴面页都到了（没有贴面时立即兑现）；R5 起也等地标的远景网格、图集与视野附近的近景网格。 */
  facadesIdle(): Promise<void> {
    return Promise.all([this.facades?.idle(), this.landmarks?.idle()]).then(() => undefined);
  }

  /** 地标真实外观的调试状态（没有烘焙产物时为 null）。 */ // [r5:landmarks]
  landmarksDebug(): LandmarkDebug | null { // [r5:landmarks]
    return this.landmarks?.debug() ?? null; // [r5:landmarks]
  } // [r5:landmarks]

  /** [r5:landmarks] 轮廓白模 + 真实外观（远景网格占位，倒影收集时要已在场景里）。 */
  private buildRealLandmarks(city: CityFile, ground: HeightFn, facade: Material, src?: FacadeSource): Object3D[] {
    const mobile = this.mobile;
    // [r45:fix] 桌面 HIGH 的地标图集分辨率按起始渲染目标的显存定（首帧之后、begin() 时算；见 landmarks/format.ts FULL_ATLAS_MAX_RT_BYTES）
    const desktopAtlas = () => desktopAtlasRes(renderTargetBytes());
    const init = { renderer: this.renderer, city, ground, tier: this.quality.tier, mobile, base: src?.base ?? 'city/', suffix: src?.suffix ?? '', desktopAtlas };
    this.landmarks = new RealLandmarks(init, (list) => buildLandmarkFallback(list, ground, city.zones.sensitive, facade));
    return this.landmarks.objects;
  }

  /** 贴面流式加载的调试状态（没有贴面时为 null）。 */
  facadesDebug(): (FacadeDebug & { procSuppressed: number; landmarkSuppressed: number; canopies: number }) | null { // [r4:int]
    const d = this.facades?.debug();
    return d ? { ...d, procSuppressed: this.procSuppressed, landmarkSuppressed: this.landmarkSuppressed, canopies: this.canopyPieces } : null; // [r4:int]
  }

  /** 各分块图层的区/块数（调试用）。 */
  /** 调试（复审修正）：下一帧按物体名（没有名字用父物体名）统计 draw call，看是谁超了 150 个的上限。 */
  drawCounts(): Promise<Record<string, number>> {
    const r = this.renderer as unknown as { renderBufferDirect: (...a: unknown[]) => unknown };
    const orig = r.renderBufferDirect;
    const tally: Record<string, number> = {};
    r.renderBufferDirect = function (this: unknown, ...a: unknown[]) {
      const obj = a[4] as { name?: string; parent?: { name?: string } | null; type?: string } | undefined;
      const k = obj?.name || obj?.parent?.name || obj?.type || '?';
      tally[k] = (tally[k] ?? 0) + 1;
      return orig.apply(this, a);
    };
    return new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          r.renderBufferDirect = orig;
          resolve(tally);
        }),
      );
    });
  }

  layerSummary(): string {
    const parts = this.layers.map((l) => `${l.group.name} ${l.regionCount}區/${l.chunkCount}塊`);
    if (this.water) parts.push(this.water.summary());
    return parts.join(' · ');
  }
}

/** 显存账本里随 drawing buffer 变的几项（场景 HDR 目标、画布、平面反射、bloom）的字节数合计。 */ // [r45:fix]
const RT_KEYS: ReadonlySet<string> = new Set(['atmosphere:scene-rt', 'atmosphere:canvas', 'atmosphere:reflection', 'atmosphere:bloom']); // [r45:fix]
function renderTargetBytes(): number { // [r45:fix]
  return textureLedgerEntries().reduce((a, [k, v]) => (RT_KEYS.has(k) ? a + v : a), 0); // [r45:fix]
} // [r45:fix]
