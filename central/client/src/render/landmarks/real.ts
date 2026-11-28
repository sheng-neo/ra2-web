/**
 * R5 真实地标（负责人 D5）：地政总署带照片纹理的原型楼，离线减面、重新展开、去日照烘焙（citymap/fetch/landsd_3d_landmark_bake.py）。
 *
 * 加载（首帧之后才开始，不算进首帧前的数据量）：
 * 1. 先下载六座合一的远景网格（LOW），校验通过才下载照片图集（按 GPU 能力挑：BC3 / ETC2 压缩，或 WebP，见 format.chooseAtlas），
 *    两样都到了才替换轮廓白模（之前一直显示白模；任何一样失败就 console.warn 一次、留着白模）。只替换管线接了网格的地标
 *    （LandmarkPlacement.mesh）：没接的（敏感区里、记录不合规）一直画白模，远景网格里它的那部分按位隐藏；
 * 2. HIGH 档再按离相机的远近逐个下载近景网格（LOW 档从不下载；手机只下载 HIGH_LOAD_MOBILE_M 内的），
 *    GPU 上常驻最多 MAX_RESIDENT 座（手机 MAX_RESIDENT_MOBILE），多了先释放最远的、没在画的；离相机 HIGH_DROP_M 外的也释放
 *    （只释放 GPU 几何，解析好的数据留在内存里，再走近不重新下载）。
 * 每帧：离相机 450 m 内（已显示的 500 m 内，滞回）的地标画近景网格，最多 MAX_HIGH = 4 座；远景合并网格用 uHide 按位隐藏这几座，
 * 全部隐藏时整个远景网格不画。一帧地标的 draw call ≤ 6（近景 ≤ 4 + 远景 1 + 水面倒影里的远景 1）。
 * 碰撞、摆放不变（footprint）；名字是覆盖表里的建筑真名（D6），只在数据里。
 */
import {
  BufferAttribute,
  BufferGeometry,
  CompressedTexture,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RGBA_ETC2_EAC_Format,
  RGBA_S3TC_DXT5_Format,
  SRGBColorSpace,
  Sphere,
  Texture,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
  type ShaderMaterial,
  type WebGLRenderer,
} from 'three';
import type { CityFile, LandmarkMeshMeta, LandmarkPlacement } from '@central/data';
import { simToThreeVec } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import { readParam, registerTextureBytes, streetWarmth, type Tier } from '../materials/lighting';
import { hash3 } from '../windows';
import { CLTX_BC3, chooseAtlas, isWebp, parseMesh, parseTexture, rgbaBytes, type AtlasChoice, type DesktopAtlasRes, type LandmarkMeshData } from './format';
import { createLandmarkMaterial, landmarkUniforms, MAX_LANDMARKS, type LandmarkUniforms } from './material';

/** 近景 / 远景切换距离（米，相机到网格外包盒），已显示的放宽到 HIGH_KEEP_M（滞回）。 */
export const HIGH_SHOW_M = 450;
export const HIGH_KEEP_M = 500;
/** 这么远以内才下载近景网格（手机更近）；这么远以外的近景网格释放。 */
export const HIGH_LOAD_M = 1000;
export const HIGH_LOAD_MOBILE_M = 650;
export const HIGH_DROP_M = 1600;
/** 近景网格最多常驻几座（手机更少）。 */
export const MAX_RESIDENT = 6;
export const MAX_RESIDENT_MOBILE = 3;
/** 同时最多画几座近景：远景合并网格再占 1 个、水面倒影里的远景再 1 个，一帧地标合计 ≤ 6 个 draw call（R5 预算）。 */
export const MAX_HIGH = 4;

export interface LandmarkNight {
  /** 20:00 的亮窗比例（写字楼钟点曲线按它缩放）。 */
  share: number;
  /** 冠顶 / 特征带的高程范围（mPD）。 */
  crown?: [number, number];
  /** 大堂天花离地（m）。 */
  lobbyTop?: number;
  /** 窗光色调：0 暖白 … 0.5 中性 … 1 冷白。 */
  tone?: number;
  /** 0：逐扇独立（整面均匀的细格）；1：租户成段、1–3 层一组。 */
  cluster?: number;
  /** 整层全亮的楼层比例上限。 */
  full?: number;
  /** 大堂样式：0 玻璃后面一间亮大堂；1 亮着的扶梯玻璃筒。 */
  lobbyMode?: number;
  /** 泛光倍率（桅杆、桁架、泛光外墙）。 */
  flood?: number;
  /** 冠顶泛光往下洗到外墙的高度（m，冠顶带底以下）。 */
  crownSpill?: number;
  /**
   * 桅杆紫光灯格（steel-frame）：本地轴转角（度，与烘焙的 frame 相同）、两排桅杆灯格中线的本地 e（m，两条腿内沿的正中，
   * 按近景网格 40–100 mPD 的桅杆腿量得）、灯格最高的高程（mPD，2019 北立面照片里灯格从广场顶一直到第三、四道桁架之间约四成处，
   * 东桅杆略低；两排取同一个值）。
   */
  mastCells?: { frame: number; e: [number, number]; top: number };
  /** 裙楼去白天残影的高度（m，离楼底）：以下的立面反照率收向块的平均色、玻璃度按整块定。 */
  podiumFlat?: number;
  /** 大堂暖光（0 中性白 … 1 暖色筒灯下的米色石材）。 */
  lobbyWarm?: number;
}

/**
 * 每座的夜景参数（对照 2019 年以后的夜景照片估计，照片与不确定项见 README「R5 真实地标」）。
 */
export const NIGHT: Readonly<Record<string, LandmarkNight>> = {
  'harbour-spire': { share: 0.2, crown: [396, 422], lobbyTop: 9, tone: 0.15, cluster: 1, full: 0.03, crownSpill: 12 },
  'prism-tower': { share: 0.18, crown: [318, 368], lobbyTop: 8, tone: 0.6, cluster: 1, full: 0.05 },
  'neon-centre': { share: 0.15, crown: [279.5, 307], lobbyTop: 10, tone: 0.5, cluster: 1, full: 0.05, podiumFlat: 50 },
  'mirror-block': { share: 0.45, lobbyTop: 8, tone: 0.65, cluster: 0, full: 0.04 },
  'steel-frame': {
    share: 0.72,
    lobbyTop: 8,
    tone: 0.9,
    cluster: 1,
    full: 0.55,
    lobbyMode: 1,
    flood: 1,
    mastCells: { frame: -16, e: [523.0, 561.4], top: 129 },
  },
  'porthole-house': { share: 0.12, lobbyTop: 6.5, tone: 0.45, cluster: 1, full: 0.04, flood: 1.1, lobbyWarm: 1 },
};

/**
 * 近景挑选（纯函数）：已下载、离相机 < HIGH_SHOW_M（已显示的 < HIGH_KEEP_M，滞回）的地标，按距离取最近的 MAX_HIGH 座。
 * 返回每座是否画近景。
 */
export function selectHigh(dist: readonly number[], loaded: readonly boolean[], shown: readonly boolean[]): boolean[] {
  const cand = dist
    .map((d, i) => i)
    .filter((i) => loaded[i] && dist[i]! < (shown[i] ? HIGH_KEEP_M : HIGH_SHOW_M))
    .sort((a, b) => dist[a]! - dist[b]! || a - b)
    .slice(0, MAX_HIGH);
  const out = dist.map(() => false);
  for (const i of cand) out[i] = true;
  return out;
}

export interface RealLandmarksInit {
  renderer: WebGLRenderer;
  city: CityFile;
  ground: HeightFn;
  tier: Tier;
  mobile: boolean;
  /** 相对页面的目录前缀（'city/'）与文件名后缀（与贴面相同，见 main.ts FACADE_SUFFIX）。 */
  base: string;
  suffix?: string;
  /** 桌面 HIGH 档图集分辨率（begin() 时调，渲染目标都已建好；见 format.desktopAtlasRes）；省略按 'half'。 */
  desktopAtlas?: () => DesktopAtlasRes;
}

interface HighEntry {
  index: number;
  id: string;
  file: string;
  /** 网格外包盒（three 坐标）。 */
  min: Vector3;
  max: Vector3;
  mesh: Mesh | null;
  /** 已下载、解析过的网格数据（释放 GPU 几何后留着，再走近时直接重建，不重新下载；六座合计约 6.6 MB 内存）。 */
  data: LandmarkMeshData | null;
  loading: boolean;
  failed: boolean;
  shown: boolean;
  dist: number;
}

export interface LandmarkDebug {
  atlas: AtlasChoice | null;
  atlasMB: number;
  lowReady: boolean;
  broken: boolean;
  high: { id: string; loaded: boolean; shown: boolean; dist: number }[];
  bytes: number;
}

/** 地标顶点属性（format.ts 的 CLMK）→ three 几何。 */
export function meshGeometry(d: LandmarkMeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new InterleavedBufferAttribute(new InterleavedBuffer(d.pos, 4), 3, 0, true));
  g.setAttribute('aNrm', new BufferAttribute(d.nrm, 4, true));
  g.setAttribute('aUv', new BufferAttribute(d.uv, 2, true));
  g.setAttribute('aRect', new BufferAttribute(d.rect, 4, true));
  g.setAttribute('aCol', new BufferAttribute(d.col, 4, true));
  g.setAttribute('aFac', new BufferAttribute(d.fac, 2, false));
  g.setAttribute('aGrid', new BufferAttribute(d.grid, 4, false));
  g.setIndex(new BufferAttribute(d.index, 1));
  // 归一化坐标 [0, 1]³ 的包围球（网格的 position / scale 把它放到世界里）
  g.boundingSphere = new Sphere(new Vector3(0.5, 0.5, 0.5), Math.sqrt(3) / 2);
  return g;
}

/** 一个占位的退化三角形（建场景时让远景网格的材质跟着一起编译；三个顶点重合，画不出任何像素）。 */
function placeholderGeometry(): BufferGeometry {
  return meshGeometry(
    parseMesh(
      (() => {
        const nv = 3;
        const buf = new ArrayBuffer(48 + nv * 36 + 8);
        const u8 = new Uint8Array(buf);
        u8.set([0x43, 0x4c, 0x4d, 0x4b]);
        const dv = new DataView(buf);
        dv.setUint16(4, 1, true);
        dv.setUint32(8, nv, true);
        dv.setUint32(12, 3, true);
        for (let k = 0; k < 3; k++) dv.setFloat32(28 + 4 * k, 1, true);
        const idx = new Uint16Array(buf, 48 + nv * 36, 3);
        idx.set([0, 1, 2]);
        return buf;
      })(),
    ),
  );
}

function place(mesh: Mesh, d: LandmarkMeshData): void {
  mesh.position.set(d.offset[0], d.offset[1], d.offset[2]);
  mesh.scale.set(d.span[0], d.span[1], d.span[2]);
  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
}

export class RealLandmarks {
  readonly objects: Object3D[];
  private readonly meta: LandmarkMeshMeta | null;
  private readonly shared: LandmarkUniforms = landmarkUniforms();
  private readonly highMat: ShaderMaterial;
  private readonly lowMat: ShaderMaterial;
  private readonly low: Mesh;
  private readonly entries: HighEntry[] = [];
  /** 图集档（begin() 时定：桌面 HIGH 要看起始渲染目标多大）。 */
  private atlasChoice: AtlasChoice | null = null;
  private readonly caps: { s3tc: boolean; etc: boolean };
  private started = false;
  private lowReady = false;
  private broken = false;
  private warned = false;
  private atlasBytes = 0;
  private downloaded = 0;
  private hideMask = 0;
  private waiters: (() => void)[] = [];
  private readonly camPos = new Vector3();
  private readonly tmp = new Vector3();
  /** 管线没接网格的地标（远景网格里永远隐藏）。 */
  private readonly noMeshMask: number;
  /** 有网格的地标的轮廓白模（真实外观到了就隐藏）；没网格的另一份一直画。 */
  private readonly fallback: Object3D | null;

  /** buildFallback：给一组地标建轮廓白模（一个网格，名字以 landmarks 开头），空组返回 null。 */
  constructor(
    private readonly init: RealLandmarksInit,
    buildFallback: (list: readonly LandmarkPlacement[]) => Object3D | null,
  ) {
    this.meta = init.city.meta.landmarkMeshes ?? null;
    const lmsAll = init.city.landmarks;
    const meshed = (l: LandmarkPlacement, i: number) => !!this.meta && !!l.mesh && i < MAX_LANDMARKS;
    this.fallback = buildFallback(lmsAll.filter(meshed));
    const keep = buildFallback(lmsAll.filter((l, i) => !meshed(l, i)));
    this.noMeshMask = lmsAll.reduce((m, l, i) => (i < MAX_LANDMARKS && !meshed(l, i) ? m | (1 << i) : m), 0);
    this.highMat = createLandmarkMaterial(this.shared);
    this.lowMat = createLandmarkMaterial(this.shared);
    this.shared.uCycle.value = readParam('lmcycle') !== null ? 1 : 0;
    const dbg = Number(readParam('lmdebug'));
    this.shared.uDebug.value = Number.isInteger(dbg) && dbg >= 1 && dbg <= 4 ? dbg : 0;
    this.low = new Mesh(placeholderGeometry(), this.lowMat);
    this.low.name = 'landmarks-low';
    this.low.frustumCulled = false;
    this.low.matrixAutoUpdate = false;
    // 倒影（镜像相机只开 REFLECT_LAYER）里一律画全部六座的远景
    this.low.onBeforeRender = (_r, _s, camera) => {
      (this.lowMat.uniforms.uHide as { value: number }).value = (camera.layers.isEnabled(0) ? this.hideMask : 0) | this.noMeshMask;
    };
    const lms = init.city.landmarks;
    lms.forEach((l, i) => this.setLandmarkUniforms(l, i));
    this.objects = [this.low, ...(this.fallback ? [this.fallback] : []), ...(keep ? [keep] : [])];
    this.caps = {
      s3tc: !!init.renderer.extensions.get('WEBGL_compressed_texture_s3tc') && !!init.renderer.extensions.get('WEBGL_compressed_texture_s3tc_srgb'),
      etc: !!init.renderer.extensions.get('WEBGL_compressed_texture_etc'),
    };
    if (!this.meta) {
      this.low.visible = false;
      return;
    }
    lms.forEach((l, i) => {
      if (!l.mesh || i >= MAX_LANDMARKS) return;
      const [x0, y0, z0, x1, y1, z1] = l.mesh.bbox;
      const a = simToThreeVec(x0, y0, z0);
      const b = simToThreeVec(x1, y1, z1);
      this.entries.push({
        index: i,
        id: l.id,
        file: l.mesh.high,
        min: new Vector3(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])),
        max: new Vector3(Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])),
        mesh: null,
        data: null,
        loading: false,
        failed: false,
        shown: false,
        dist: Infinity,
      });
    });
  }

  private setLandmarkUniforms(l: LandmarkPlacement, i: number): void {
    if (i >= MAX_LANDMARKS) return;
    const night: LandmarkNight = NIGHT[l.id] ?? { share: 0.35 };
    const groundM = l.base / 10;
    const F = l.mesh ? l.mesh.floors[0] / 100 : 4;
    const ph = l.mesh ? l.mesh.floors[1] / 100 : 0;
    this.shared.uLmA.value[i]!.set(F, ph, night.share, groundM);
    const key = Math.floor(hash3(i + 7, 911, 3) * 4093) + 1;
    const crown = night.crown ?? [0, 1];
    this.shared.uLmB.value[i]!.set(streetWarmth(l.x / 10, l.y / 10, groundM), key, crown[0], crown[1]);
    this.shared.uLmC.value[i]!.set(night.lobbyTop ?? 8, night.tone ?? 0.5, night.cluster ?? 1, night.full ?? 0.06);
    this.shared.uLmD.value[i]!.set(night.lobbyMode ?? 0, night.flood ?? 1, night.crownSpill ?? 0, 0);
    const mc = night.mastCells;
    this.shared.uLmE.value[i]!.set(mc?.frame ?? 0, mc?.e[0] ?? 0, mc?.e[1] ?? 0, mc?.top ?? 0);
    this.shared.uLmF.value[i]!.set(night.podiumFlat ?? 0, night.lobbyWarm ?? 0, 0, 0);
  }

  private url(name: string): string {
    return `${this.init.base}${this.meta!.dir}/${name}${this.init.suffix ?? ''}`;
  }

  private warn(msg: string): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[central] 地標真實外觀載入失敗，改用輪廓白模：${msg}`);
  }

  private async fetchBuf(name: string): Promise<ArrayBuffer> {
    const r = await fetch(this.url(name));
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    const b = await r.arrayBuffer();
    this.downloaded += b.byteLength;
    return b;
  }

  /** 首帧之后调用：开始下载（远景网格与图集）。 */
  begin(): void {
    if (this.started) return;
    this.started = true;
    if (this.meta) {
      const desktop = !this.init.mobile && this.init.tier === 'high' ? (this.init.desktopAtlas?.() ?? 'half') : 'half';
      this.atlasChoice = chooseAtlas(this.init.tier, this.init.mobile, this.caps, readParam('lmtex'), desktop);
    }
    if (!this.meta || !this.atlasChoice) {
      this.flush();
      return;
    }
    const meta = this.meta;
    const choice = this.atlasChoice;
    // 先取远景网格并校验，成功了才请求图集（熔断：文件缺失时只有 1 次失败请求、1 条网络错误，与贴面同理）
    void this.fetchBuf(meta.low)
      .then(async (lowBuf) => {
        const d = parseMesh(lowBuf);
        return [d, await this.loadAtlas(meta, choice)] as const;
      })
      .then(([d, tex]) => {
        this.low.geometry.dispose();
        this.low.geometry = meshGeometry(d);
        place(this.low, d);
        this.shared.uAtlas.value = tex;
        this.shared.uAtlasPx.value = (tex.image as { width: number }).width;
        this.shared.uAtlasOn.value = 1;
        this.lowReady = true;
        if (this.fallback) this.fallback.visible = false;
        this.low.visible = true;
        this.flush();
      })
      .catch((e: unknown) => {
        this.broken = true;
        this.low.visible = false;
        this.warn(e instanceof Error ? e.message : String(e));
        this.flush();
      });
  }

  private async loadAtlas(meta: LandmarkMeshMeta, choice: AtlasChoice): Promise<Texture> {
    const name = meta.atlas[choice];
    const buf = await this.fetchBuf(name);
    if (choice === 'webpHalf' || choice === 'webpQuarter') {
      if (!isWebp(buf)) throw new Error(`${name}: 不是 WebP`);
      const bmp = await createImageBitmap(new Blob([buf]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const t = new Texture(bmp as unknown as HTMLImageElement);
      t.flipY = false;
      t.premultiplyAlpha = false;
      t.colorSpace = SRGBColorSpace;
      t.generateMipmaps = true;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = 4;
      t.needsUpdate = true;
      this.atlasBytes = rgbaBytes(bmp.width, bmp.height);
      registerTextureBytes('landmarks:atlas', this.atlasBytes);
      return t;
    }
    const c = parseTexture(buf);
    const levels = c.levels;
    const t = new CompressedTexture(
      levels.map((l) => ({ data: l.data, width: l.width, height: l.height })) as unknown as ImageData[],
      levels[0]!.width,
      levels[0]!.height,
      c.format === CLTX_BC3 ? RGBA_S3TC_DXT5_Format : RGBA_ETC2_EAC_Format,
    );
    t.colorSpace = SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    this.atlasBytes = levels.reduce((s, l) => s + l.data.byteLength, 0);
    registerTextureBytes('landmarks:atlas', this.atlasBytes);
    return t;
  }

  /** 由解析好的数据建近景网格（GPU 几何在第一次画时上传）。 */
  private attachHigh(e: HighEntry, d: LandmarkMeshData): void {
    const m = new Mesh(meshGeometry(d), this.highMat);
    m.name = `lmk-high-${e.id}`;
    m.matrixAutoUpdate = false;
    place(m, d);
    m.visible = false;
    e.data = d;
    e.mesh = m;
    this.low.parent?.add(m);
  }

  private loadHigh(e: HighEntry): void {
    if (e.data) {
      this.attachHigh(e, e.data);
      return;
    }
    e.loading = true;
    void this.fetchBuf(e.file)
      .then((buf) => this.attachHigh(e, parseMesh(buf)))
      .catch((err: unknown) => {
        e.failed = true;
        this.warn(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        e.loading = false;
        this.flush();
      });
  }

  private get loadRadius(): number {
    return this.init.mobile ? HIGH_LOAD_MOBILE_M : HIGH_LOAD_M;
  }

  /** 释放一座的近景网格（GPU 上的几何体还回去；解析好的数据留着，之后走近直接重建、不重新下载）。 */
  private evict(e: HighEntry): void {
    if (!e.mesh) return;
    e.mesh.removeFromParent();
    e.mesh.geometry.dispose();
    e.mesh = null;
    e.shown = false;
  }

  /** 每帧：近景 / 远景切换、近景按距离下载与释放。 */
  update(camera: Camera): void {
    if (!this.meta) return;
    camera.getWorldPosition(this.camPos);
    for (const e of this.entries) {
      this.tmp.copy(this.camPos).clamp(e.min, e.max);
      e.dist = this.tmp.distanceTo(this.camPos);
    }
    if (!this.lowReady) return;
    const high = this.init.tier === 'high';
    if (high) {
      // 太远的、或常驻超过上限时最远的（没在画的）近景网格释放
      const cap = this.init.mobile ? MAX_RESIDENT_MOBILE : MAX_RESIDENT;
      for (const e of this.entries) if (e.mesh && !e.shown && e.dist > HIGH_DROP_M) this.evict(e);
      const resident = this.entries.filter((e) => e.mesh).sort((a, b) => b.dist - a.dist);
      for (let k = 0; k < resident.length - cap; k++) if (!resident[k]!.shown) this.evict(resident[k]!);
      // 近景网格逐个下载（同一时刻一个），近的先；常驻满了就不再下载比常驻里最远的还远的
      if (!this.entries.some((e) => e.loading)) {
        const loaded = this.entries.filter((e) => e.mesh);
        const far = loaded.length >= cap ? Math.max(...loaded.map((e) => e.dist)) : Infinity;
        let best: HighEntry | null = null;
        for (const e of this.entries) {
          if (!e.mesh && !e.failed && e.dist < this.loadRadius && e.dist < far && (!best || e.dist < best.dist)) best = e;
        }
        if (best) this.loadHigh(best);
      }
    }
    const pick = selectHigh(
      this.entries.map((e) => e.dist),
      this.entries.map((e) => !!e.mesh),
      this.entries.map((e) => e.shown),
    );
    let mask = 0;
    for (const [k, e] of this.entries.entries()) {
      e.shown = pick[k]!;
      if (e.mesh) e.mesh.visible = e.shown;
      if (e.shown) mask |= 1 << e.index;
    }
    this.hideMask = mask;
    const all = Math.min(this.init.city.landmarks.length, MAX_LANDMARKS);
    this.low.visible = this.lowReady && (mask | this.noMeshMask) !== (1 << all) - 1;
    this.flush();
  }

  /** 视野要的东西都到了（或失败）：远景与图集、离相机 HIGH_LOAD_M 内的近景（只算 HIGH 档）。 */
  private pending(): number {
    if (!this.meta) return 0;
    if (!this.started) return 1;
    if (!this.lowReady && !this.broken) return 1;
    if (this.broken || this.init.tier !== 'high') return 0;
    const cap = this.init.mobile ? MAX_RESIDENT_MOBILE : MAX_RESIDENT;
    const want = this.entries.filter((e) => !e.failed && e.dist < this.loadRadius).sort((a, b) => a.dist - b.dist).slice(0, cap);
    return want.filter((e) => !e.mesh).length;
  }

  private flush(): void {
    if (this.pending() > 0 || this.waiters.length === 0) return;
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  idle(): Promise<void> {
    if (this.pending() === 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  stats(): { landmarkMB: number; landmarkPending: number; landmarkBytes: number; landmarkHigh: number } {
    return {
      landmarkMB: Math.round((this.atlasBytes / (1024 * 1024)) * 10) / 10,
      landmarkPending: this.pending(),
      landmarkBytes: this.downloaded,
      landmarkHigh: this.entries.filter((e) => e.shown).length,
    };
  }

  debug(): LandmarkDebug {
    return {
      atlas: this.atlasChoice,
      atlasMB: Math.round((this.atlasBytes / (1024 * 1024)) * 100) / 100,
      lowReady: this.lowReady,
      broken: this.broken,
      high: this.entries.map((e) => ({ id: e.id, loaded: !!e.mesh, shown: e.shown, dist: Math.round(e.dist) })),
      bytes: this.downloaded,
    };
  }

  /** 材质（测试与调试用）。 */
  get materials(): Material[] {
    return [this.highMat, this.lowMat];
  }
}
