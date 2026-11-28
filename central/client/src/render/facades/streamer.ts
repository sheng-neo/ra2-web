/**
 * 真实贴面（R3）的流式加载：远景图集 + 近景页池（WebGL2 纹理数组）。
 *
 * - 远景图集（HIGH 全分辨率、LOW 半分辨率）：首帧之后第一个下载（不算进首帧前的数据量），three 普通贴图（ImageBitmap，sRGB，自带 mipmap）。
 * - 下载过的页按字节留一份压缩数据（手机 16 MB、桌面 32 MB，LRU）：页被让出槽后再要时不必重新下载（生产服务器不给缓存头）。
 *   还没到时 uPhotoFarGrid.z = 0，着色器一律走程序立面；下载失败也一样（不报错，只 console.warn 一次）。
 * - 每个文件是 RGBA WebP：颜色 sRGB + alpha 码（0 = 无照片、135–255 连续玻璃度、24 + k（k = 0..89）独立窗，见烘焙脚本）。
 * - 近景池（HIGH 按份额 2–12 层；LOW 2 层、只给 80 m 内，见 budget.ts）：一个 TEXTURE_2D_ARRAY（SRGB8_ALPHA8，alpha 保持线性；page × page × 层数，texStorage3D 一次分配），
 *   以 three 的 ExternalTexture 交给材质；页号 → 槽号查表是一张 页数 × 1 的 RGBA8 DataTexture（r = 槽，255 = 不在池里；
 *   g = 淡入 0–255，新页 0.4 s 从远景淡入）。
 * - 每 12 帧（或相机移动 > 15 m）按「相机到页上最近一栋楼的距离」（budget.choosePages：视野外加权、已常驻打折的滞回）
 *   挑最近的若干页（≤ 层数、900 m 内），缺的页按先后下载（同时 ≤ 2 个）→ createImageBitmap 解码（不占主线程）→
 *   每帧最多上传一张；mipmap 只为这一层逐级 blit（不再整个数组重算 generateMipmap），不支持时退回 generateMipmap。
 *   槽满时让出最久没被需要的页（budget.SlotLru）：被让出的页先 0.3 s 淡回远景、再覆盖（不突然变糊）。
 *   显存严格按层数封顶，登记进贴图账本。
 * - 熔断：远景图集到了才开始流近景页；远景图集或任何一页下载失败（非 200 / 不是 WebP / 尺寸不符）就停掉整个近景池、
 *   释放纹理数组并把账本记 0（浏览器最多报一次 404，不会一页接一页地请求）。
 * - 上下文丢失恢复后重建纹理数组、清空槽位重新流式加载（远景图集由 three 自己重传）。
 * 调试：idle() 在「当前视野要的页都已常驻（或失败）、远景图集已到、没有在途请求」时兑现；stats() 给 MB、待办数、已下载字节。
 *
 * R4 电车走廊高清街面层（HIRES，meta.hires 存在且 HIGH 档）：高清页（page × 1.5 page 的 RGBA WebP：上面颜色 + alpha 码，
 * 下面左半是半分辨率辅助图）与 R3 页共用同一个近景池；辅助图另放一个 aux × aux 的 RGBA8 纹理数组（每个常驻高清页一层，
 * 层数见 budget.HIRES_LAYERS）。虚拟页号：0..nR3−1 为 R3 页，nR3.. 为高清页；页号 → 槽查表另一张 uHiresSlots
 * （r = 颜色层，255 = 不在池里；g = 淡入；b = 辅助图层）。高清页按预测距离（相机速度外推 16 s / 200 m，budget.predictDistance）
 * 挑页、预取进字节缓存，搭电车时前方的页在开到之前就位。解码后 createImageBitmap 裁出颜色与辅助图两张（不占主线程），
 * 每帧最多上传一页（颜色 + 辅助图 + 各自逐层 mipmap）。高清页任何一页失败只停高清层（R3 照旧）。
 */
import {
  DataTexture,
  ExternalTexture,
  Frustum,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  Box3,
  Vector3,
  Vector4,
  type IUniform,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import type { FacadeMeta, HiresMeta } from '@central/data';
import { simMetresToThree, threeToSim, DM_TO_M } from '../../coords';
import { registerTextureBytes, type Tier } from '../materials/lighting';
import { HIRES_MAX_M, HIRES_UPPER_PHONE_M, SlotLru, auxLayerBytes, boxDistance, chooseMixed, facadeBudget, farBytes, layerBytes, pageNearest, predictDistance } from './budget';

export interface FacadeStreamerInit {
  renderer: WebGLRenderer;
  meta: FacadeMeta;
  /** 贴图目录前缀（如 'city/'）与文件名后缀（artifact 副本可改，见 main.ts FACADE_SUFFIX）。 */
  base: string;
  suffix: string;
  tier: Tier;
  mobile: boolean;
  /** R4 高清街面层（HIGH 档才用）。 */
  hires?: HiresMeta;
}

const SELECT_EVERY = 12;
/** LOW 档：相机快于此（米 / 秒）时不请求新的近景页。 */
const LOW_MOVING_MS = 4;
const MOVE_M = 15;
const MAX_FETCH = 2;
const FADE_S = 0.4;
/** 被让出的页淡回远景的时长（秒）。 */
const FADE_OUT_S = 0.3;
/** 远景图集淡入时长（秒）、首帧之后开始下载的延迟（毫秒，墙钟）。 */
const FADE_FAR_S = 0.6;
const START_DELAY_MS = 800;
const START_FRAMES = 4;

interface Decoded {
  page: number;
  slot: number;
  bmp: ImageBitmap;
  /** 高清页：辅助图与它的层。 */
  aux?: ImageBitmap;
  auxSlot?: number;
}

function placeholder(r: number, g: number, b: number, a = 255): DataTexture {
  const t = new DataTexture(new Uint8Array([r, g, b, a]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

const BITMAP_OPTS: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

/** 文件头是否是 WebP（RIFF....WEBP）。 */
export function isWebp(head: Uint8Array): boolean {
  const tag = (o: number, t: string) => [...t].every((c, i) => head[o + i] === c.charCodeAt(0));
  return head.length >= 12 && tag(0, 'RIFF') && tag(8, 'WEBP');
}

/** 调试钩子 __central.facades() 的内容。 */
export interface FacadeDebug {
  pagesTotal: number;
  pagesResident: number;
  residentMB: number;
  budgetMB: number;
  wanted: number;
  queued: number;
  failed: number;
  bytesFetched: number;
  uploadsLastFrame: number;
  evictions: number;
  excluded: number;
  /** R4 高清页：总数、常驻、想要、是否已熔断。 */
  hiresTotal: number;
  hiresResident: number;
  hiresWanted: number;
  hiresBroken: boolean;
  /** 复审修正：在视野里、预测距离内、却因高清层数上限没挑上的高清页数（hiresPending 只数挑上了的）。 */
  hiresDropped: number;
}

export class FacadeStreamer {
  readonly uniforms: Record<string, IUniform>;
  readonly near: boolean;
  private readonly gl: WebGL2RenderingContext;
  private readonly page: number;
  private readonly layers: number;
  /** 近景页的最远有效距离（米，见 budget.ts）。 */
  private readonly nearMaxM: number;
  private readonly lru: SlotLru;
  private readonly slotTex: DataTexture;
  private readonly fade: Float32Array;
  private nearCol: WebGLTexture | null = null;
  private readonly extCol = new ExternalTexture(null);
  /** R4 高清层：R3 页数、高清页数、辅助图层数与边长、辅助图数组、页号 → 槽查表、辅助图槽 LRU。 */
  private readonly nR3: number;
  private readonly nHi: number;
  private readonly hiLayers: number;
  private readonly auxSize: number;
  private auxArr: WebGLTexture | null = null;
  private readonly extAux = new ExternalTexture(null);
  private readonly hiSlotTex: DataTexture;
  private readonly auxLru: SlotLru;
  private hiBroken = false;
  private hiEntries: { pageOf: Int32Array; boxes: Float32Array } | null = null;
  private hiBoxes3: Box3[] = [];
  private hiDist = new Float64Array(0);
  private hiScratch = new Float64Array(0);
  private hiBytes = 0;
  /** 相机速度（模拟坐标米 / 秒，按帧时钟平滑，见 trackVelocity）。 */
  private readonly vel: [number, number] = [0, 0];
  private lastPos: [number, number] | null = null;
  private lastPosT = 0;
  /** 预取中的高清页数（只进字节缓存）。 */
  private prefetching = 0;
  private boxes: Float32Array | null = null;
  private boxes3: Box3[] = [];
  /** (页号, 楼外包盒) 对：按页上最近一栋楼排先后。 */
  private entries: { pageOf: Int32Array; boxes: Float32Array } | null = null;
  private dist = new Float64Array(0);
  private view: boolean[] = [];
  /** 正在淡出（让槽）的页。 */
  private readonly fadingOut = new Set<number>();
  /** 熔断：近景池停用（下载失败后）。 */
  private broken = false;
  private fbRead: WebGLFramebuffer | null = null;
  private fbDraw: WebGLFramebuffer | null = null;
  private blitMips = true;
  private blitChecked = false;
  private readonly pendingPages = new Set<number>();
  /** pump() 每帧复用（复审修正：原来每帧 new Set）。 */
  private readonly reservedAux = new Set<number>();
  /** 在视野里、预测距离内却因层数上限没挑上的高清页数（调试）。 */
  private hiDropped = 0;
  /** 已有一张高清页成功下载解码：之前同时只发一个高清请求（全部 404 时只报一条错）。 */
  private hiOk = false;
  private readonly reservedSlots = new Set<number>();
  private readonly wantFree: number[] = [];
  private readonly failed = new Set<number>();
  private readonly inflight = new Map<number, number>();
  /** 在途高清页 → 辅助图槽。 */
  private readonly inflightAux = new Map<number, number>();
  private readonly ready: Decoded[] = [];
  private want: number[] = [];
  private frame = 0;
  private lastSel = new Vector3(Infinity, 0, 0);
  private gen = 0;
  private doneGen = -1;
  private farState: 'loading' | 'ready' | 'failed' = 'loading';
  private bytes = 0;
  private farMB = 0;
  private farWhich: 'full' | 'low' = 'full';
  /** 首帧之后才开始下载（远景图集不算进首帧前的数据量）。 */
  private started = false;
  private readyWall: number | null = null;
  private readyFrame = 0;
  /** 已下载页的压缩字节（LRU，按字节封顶）：页被让出槽后再要时不必重新下载（生产服务器不给缓存头）。 */
  private readonly cache = new Map<string, ArrayBuffer>();
  private cacheBytes = 0;
  private readonly cacheCap: number;
  private uploads = 0;
  private uploadsLast = 0;
  private evictions = 0;
  private waiters: { gen: number; resolve: () => void }[] = [];
  private warned = false;
  private readonly frustum = new Frustum();
  private readonly pm = new Matrix4();
  private readonly camSim: [number, number, number] = [0, 0, 0];
  /** 淡入用墙钟（Date.now）：不随模拟时钟（截图脚本会冻结 performance.now）。 */
  private lastWall = Date.now();

  constructor(private readonly init: FacadeStreamerInit) {
    this.gl = init.renderer.getContext() as WebGL2RenderingContext;
    this.page = init.meta.page;
    const fullFar = farBytes(init.meta.far.cols * init.meta.far.cell, init.meta.far.rows * init.meta.far.cell);
    // 高清层要求与 R3 页同样的页边长（共用近景池）
    const hm = init.hires && init.hires.page === init.meta.page && init.tier === 'high' ? init.hires : undefined;
    const budget = facadeBudget(init.tier, init.mobile, fullFar, init.meta.page, hm?.aux ?? 0);
    const isGl2 = typeof WebGL2RenderingContext !== 'undefined' && this.gl instanceof WebGL2RenderingContext;
    this.near = budget.nearLayers > 0 && isGl2;
    this.layers = this.near ? budget.nearLayers : 0;
    this.nearMaxM = budget.nearMaxM;
    this.lru = new SlotLru(this.layers);
    this.nR3 = init.meta.pages.length;
    this.nHi = this.near && hm ? hm.pages.length : 0;
    this.hiLayers = this.nHi > 0 ? budget.hiresLayers : 0;
    this.auxSize = hm?.aux ?? 0;
    this.auxLru = new SlotLru(this.hiLayers);
    const nh = Math.max(this.nHi, 1);
    const hs = new Uint8Array(nh * 4).fill(0);
    for (let i = 0; i < nh; i++) {
      hs[i * 4] = 255;
      hs[i * 4 + 2] = 255;
    }
    this.hiSlotTex = new DataTexture(hs, nh, 1, RGBAFormat);
    this.hiSlotTex.magFilter = NearestFilter;
    this.hiSlotTex.minFilter = NearestFilter;
    this.hiSlotTex.needsUpdate = true;
    this.hiDist = new Float64Array(this.nHi);
    this.hiScratch = new Float64Array(this.nHi);
    const n = init.meta.pages.length;
    const slots = new Uint8Array(Math.max(n, 1) * 4).fill(0);
    for (let i = 0; i < n; i++) slots[i * 4] = 255;
    this.slotTex = new DataTexture(slots, Math.max(n, 1), 1, RGBAFormat);
    this.slotTex.magFilter = NearestFilter;
    this.slotTex.minFilter = NearestFilter;
    this.slotTex.needsUpdate = true;
    this.fade = new Float32Array(n + this.nHi);
    const { cols, rows } = init.meta.far;
    this.uniforms = {
      uPhotoFarCol: { value: placeholder(96, 96, 96, 0) },
      uPhotoFarGrid: { value: new Vector4(cols, rows, 0, 0) },
      uPhotoNearCol: { value: this.extCol },
      uPhotoSlots: { value: this.slotTex },
      // R4 高清层：辅助图数组、页号 → 槽查表、(页边长, 辅助图边长, 后退深度满量程 m, 有高清层 1/0)
      uHiresAux: { value: this.extAux },
      uHiresSlots: { value: this.hiSlotTex },
      uHiresInfo: { value: new Vector4(init.meta.page, this.auxSize || 1, hm?.reliefMaxM ?? 2.5, this.hiLayers > 0 ? 1 : 0) },
    };
    if (this.near) this.allocNear();
    init.renderer.domElement.addEventListener('webglcontextrestored', () => this.restore());
    this.farWhich = budget.far;
    // R4：LOW 也留 4 MB 压缩字节（走动时近景页进出池不再重下）
    this.cacheCap = (init.tier === 'low' ? 4 : init.mobile ? 16 : 32) * 1024 * 1024;
  }

  private url(name: string): string {
    return `${this.init.base}${this.init.meta.dir}/${name}${this.init.suffix}`;
  }

  /** 有高清层（HIGH 档、有清单、辅助图层 > 0）。 */
  get hires(): boolean {
    return this.hiLayers > 0;
  }

  private isHi(v: number): boolean {
    return v >= this.nR3;
  }

  /** 虚拟页号 → 文件名。 */
  private nameOf(v: number): string {
    return v < this.nR3 ? this.init.meta.pages[v]! : this.init.hires!.pages[v - this.nR3]!;
  }

  /** 近景池：一个纹理数组一次分配（texStorage3D），登记显存。 */
  private allocNear(): void {
    const gl = this.gl;
    const levels = Math.floor(Math.log2(this.page)) + 1;
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const mk = (fmt: number): WebGLTexture => {
      const t = gl.createTexture()!;
      this.init.renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, fmt, this.page, this.page, this.layers);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (aniso) {
        const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
        gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, max));
      }
      return t;
    };
    this.nearCol = mk(gl.SRGB8_ALPHA8);
    this.extCol.sourceTexture = this.nearCol;
    registerTextureBytes('facades:near', this.layers * layerBytes(this.page));
    if (this.hiLayers > 0 && !this.hiBroken) {
      const lv = Math.floor(Math.log2(this.auxSize)) + 1;
      const t = gl.createTexture()!;
      this.init.renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, lv, gl.RGBA8, this.auxSize, this.auxSize, this.hiLayers);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.auxArr = t;
      this.extAux.sourceTexture = t;
      registerTextureBytes('facades:hires-aux', this.hiLayers * auxLayerBytes(this.auxSize));
    }
  }

  private restore(): void {
    this.fbRead = null;
    this.fbDraw = null;
    this.fadingOut.clear();
    for (let s = 0; s < this.layers; s++) this.lru.release(s);
    const data = this.slotTex.image.data as Uint8Array;
    for (let i = 0; i < this.fade.length; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 0;
    }
    this.slotTex.needsUpdate = true;
    this.clearHiSlots();
    for (let s = 0; s < this.hiLayers; s++) this.auxLru.release(s);
    for (const d of this.ready.splice(0)) this.closeDecoded(d);
    if (this.near && !this.broken) this.allocNear();
    this.lastSel.set(Infinity, 0, 0);
  }

  private closeDecoded(d: Decoded): void {
    d.bmp.close();
    d.aux?.close();
  }

  private clearHiSlots(): void {
    const h = this.hiSlotTex.image.data as Uint8Array;
    for (let i = 0; i < this.nHi; i++) {
      h[i * 4] = 255;
      h[i * 4 + 1] = 0;
      h[i * 4 + 2] = 255;
    }
    this.hiSlotTex.needsUpdate = true;
  }

  /** 高清层熔断：只停高清页（R3 近景照旧）；已常驻的高清页让出槽、辅助图数组释放。 */
  private breakHires(msg: string): void {
    if (this.hiLayers === 0) return;
    this.warn(msg);
    if (this.hiBroken) return;
    this.hiBroken = true;
    for (let s = 0; s < this.layers; s++) {
      const p = this.lru.page(s);
      if (p >= this.nR3) {
        this.lru.release(s);
        this.fade[p] = 0;
      }
    }
    for (let s = 0; s < this.hiLayers; s++) this.auxLru.release(s);
    this.clearHiSlots();
    if (this.auxArr) {
      this.gl.deleteTexture(this.auxArr);
      this.auxArr = null;
      this.extAux.sourceTexture = null;
      registerTextureBytes('facades:hires-aux', 0);
    }
    (this.uniforms.uHiresInfo!.value as Vector4).w = 0;
    this.want = this.want.filter((p) => p < this.nR3);
    this.prefetchList = [];
  }

  /** 熔断：停掉近景池（释放纹理数组、账本记 0、全部页退回远景），之后不再请求近景页。 */
  private breakNear(msg: string): void {
    this.warn(msg);
    if (this.broken) return;
    this.broken = true;
    for (const d of this.ready.splice(0)) this.closeDecoded(d);
    this.breakHires('近景池停用');
    const data = this.slotTex.image.data as Uint8Array;
    for (let i = 0; i < this.fade.length; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 0;
    }
    this.slotTex.needsUpdate = true;
    for (let s = 0; s < this.layers; s++) this.lru.release(s);
    this.fadingOut.clear();
    if (this.nearCol) {
      this.gl.deleteTexture(this.nearCol);
      this.nearCol = null;
      this.extCol.sourceTexture = null;
    }
    if (this.fbRead) this.gl.deleteFramebuffer(this.fbRead);
    if (this.fbDraw) this.gl.deleteFramebuffer(this.fbDraw);
    this.fbRead = null;
    this.fbDraw = null;
    if (this.near) registerTextureBytes('facades:near', 0);
    this.want = [];
    this.prefetchList = [];
  }

  private warn(msg: string): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[central] 真實貼面：${msg}（改用程序立面）`);
  }

  private async fetchBytes(name: string, hi = false): Promise<ArrayBuffer> {
    let buf = this.cache.get(name);
    if (buf) {
      this.cache.delete(name);
      this.cache.set(name, buf);
    } else {
      const res = await fetch(this.url(name));
      if (!res.ok) throw new Error(`${res.status}`);
      buf = await res.arrayBuffer();
      this.bytes += buf.byteLength;
      if (hi) this.hiBytes += buf.byteLength;
      this.remember(name, buf);
    }
    return buf;
  }

  /** 高清页：解码后裁成颜色（page²）与辅助图（aux²，在 page 行以下的左半）两张 ImageBitmap。 */
  private async fetchHires(name: string): Promise<{ col: ImageBitmap; aux: ImageBitmap }> {
    const buf = await this.fetchBytes(name, true);
    if (!isWebp(new Uint8Array(buf, 0, Math.min(12, buf.byteLength)))) throw new Error('不是 WebP');
    const all = await createImageBitmap(new Blob([buf], { type: 'image/webp' }), BITMAP_OPTS);
    try {
      if (all.width !== this.page || all.height !== this.page + this.auxSize) throw new Error(`尺寸 ${all.width}×${all.height}`);
      const [col, aux] = await Promise.all([
        createImageBitmap(all, 0, 0, this.page, this.page, BITMAP_OPTS),
        createImageBitmap(all, 0, this.page, this.auxSize, this.auxSize, BITMAP_OPTS),
      ]);
      return { col, aux };
    } finally {
      all.close();
    }
  }

  /** 预取：高清页的压缩字节先进字节缓存（不解码、不占槽；同时最多一个，不挤占正式下载）。 */
  private prefetch(names: readonly string[]): void {
    if (this.broken || this.hiBroken || !this.hiOk) return;
    for (const name of names) {
      if (this.prefetching >= 1 || this.inflight.size >= MAX_FETCH) return;
      if (this.cache.has(name)) continue;
      this.prefetching++;
      this.fetchBytes(name, true).then(
        () => {
          this.prefetching--;
        },
        (e: unknown) => {
          // 复审修正：预取失败也记进 failed 并熔断高清层（原来只减计数，下一帧又请求同一页：每帧一个 404 与一条 console error）
          this.prefetching--;
          const k = this.init.hires?.pages.indexOf(name) ?? -1;
          if (k >= 0) this.failed.add(this.nR3 + k);
          this.breakHires(`高清頁預取失敗 ${e instanceof Error ? e.message : String(e)}`);
        },
      );
    }
  }

  private async fetchBitmap(name: string): Promise<ImageBitmap> {
    const buf = await this.fetchBytes(name);
    // 生产服务器找不到文件时回 200 + 别的网页（SPA 回退）：先认文件头（RIFF....WEBP）再解码
    if (!isWebp(new Uint8Array(buf, 0, Math.min(12, buf.byteLength)))) throw new Error('不是 WebP');
    // 生产服务器的 MIME 表里没有 .webp（回 application/octet-stream）：显式标成 WebP 再解码
    return createImageBitmap(new Blob([buf], { type: 'image/webp' }), BITMAP_OPTS);
  }

  private async loadFar(which: 'full' | 'low'): Promise<void> {
    const { far } = this.init.meta;
    const k = which === 'low' ? 2 : 1;
    const w = (far.cols * far.cell) / k;
    const h = (far.rows * far.cell) / k;
    try {
      const bmp = await this.fetchBitmap(which === 'low' ? far.low : far.file);
      if (bmp.width !== w || bmp.height !== h) {
        bmp.close();
        throw new Error(`尺寸 ${bmp.width}×${bmp.height} ≠ ${w}×${h}`);
      }
      const t = new Texture(bmp);
      t.flipY = false;
      t.premultiplyAlpha = false;
      t.generateMipmaps = true;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = 4;
      t.colorSpace = SRGBColorSpace;
      t.needsUpdate = true;
      this.uniforms.uPhotoFarCol!.value = t;
      (this.uniforms.uPhotoFarGrid!.value as Vector4).set(far.cols, far.rows, 0.001, far.cell / k);
      this.farMB = farBytes(w, h);
      registerTextureBytes('facades:far', this.farMB);
      this.farState = 'ready';
    } catch (e) {
      this.farState = 'failed';
      this.breakNear(`遠景圖集載入失敗 ${e instanceof Error ? e.message : String(e)}`);
    }
    this.checkIdle();
  }

  /** 记进字节缓存，超过上限从最久没用的开始丢。 */
  private remember(name: string, buf: ArrayBuffer): void {
    if (buf.byteLength > this.cacheCap) return;
    this.cache.set(name, buf);
    this.cacheBytes += buf.byteLength;
    for (const [k, v] of this.cache) {
      if (this.cacheBytes <= this.cacheCap) break;
      this.cache.delete(k);
      this.cacheBytes -= v.byteLength;
    }
  }

  /** 首帧画完（main.ts 置 ready）时调用一次：之后才开始流式下载。 */
  begin(): void {
    if (this.readyWall !== null) return;
    this.readyWall = Date.now();
    this.readyFrame = this.frame;
  }

  /** 页外包盒（模拟坐标米，见 buildings.facadePageBoxes；视野判断用）与 (页号, 楼外包盒) 对（距离用，见 facadePageEntries）。 */
  setBoxes(boxes: Float32Array, entries?: { pageOf: Int32Array; boxes: Float32Array } | null): void {
    this.boxes = boxes;
    this.entries = entries ?? null;
    this.dist = new Float64Array(boxes.length / 6 + this.nHi);
    this.view = new Array<boolean>(boxes.length / 6 + this.nHi).fill(false);
    this.boxes3 = [];
    for (let i = 0; i < boxes.length / 6; i++) {
      const o = i * 6;
      const a = simMetresToThree(boxes[o]!, boxes[o + 1]!, boxes[o + 2]!);
      const b = simMetresToThree(boxes[o + 3]!, boxes[o + 4]!, boxes[o + 5]!);
      this.boxes3.push(new Box3(new Vector3(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])), new Vector3(Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]))));
    }
    this.lastSel.set(Infinity, 0, 0);
  }

  /** R4：高清页的 (页号, 面外包盒) 对（模拟坐标米，见 buildings.hiresPageEntries）。 */
  setHires(entries: { pageOf: Int32Array; boxes: Float32Array } | null): void {
    if (!entries || this.nHi === 0) return;
    this.hiEntries = entries;
    const lo = new Float64Array(this.nHi * 3).fill(Infinity);
    const hi = new Float64Array(this.nHi * 3).fill(-Infinity);
    for (let i = 0; i < entries.pageOf.length; i++) {
      const pg = entries.pageOf[i]!;
      if (pg < 0 || pg >= this.nHi) continue;
      for (let k = 0; k < 3; k++) {
        lo[pg * 3 + k] = Math.min(lo[pg * 3 + k]!, entries.boxes[i * 6 + k]!);
        hi[pg * 3 + k] = Math.max(hi[pg * 3 + k]!, entries.boxes[i * 6 + 3 + k]!);
      }
    }
    this.hiBoxes3 = [];
    for (let pg = 0; pg < this.nHi; pg++) {
      if (!Number.isFinite(lo[pg * 3]!)) {
        this.hiBoxes3.push(new Box3());
        continue;
      }
      const a = simMetresToThree(lo[pg * 3]!, lo[pg * 3 + 1]!, lo[pg * 3 + 2]!);
      const b = simMetresToThree(hi[pg * 3]!, hi[pg * 3 + 1]!, hi[pg * 3 + 2]!);
      this.hiBoxes3.push(new Box3(new Vector3(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])), new Vector3(Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]))));
    }
    this.lastSel.set(Infinity, 0, 0);
  }

  /**
   * 相机速度（模拟坐标米 / 秒）：按帧时钟（performance.now，与相机、电车的模拟时钟同源）平滑约 0.6 s；一帧跳过 60 m/s 以上（切视角）
   * 当作瞬移，速度清零。[r45:fix] 原来用墙钟（Date.now）：真机上两者一样，但截图 / 端到端脚本的假时钟（每帧固定推进模拟时间、
   * 帧与帧之间还有脚本取数的空档）下墙钟速度随机器快慢变，LOW「移动中不请求新页」与高清页预测就随机器负载变（同一构建
   * LOW 整程搭电车 27 / 40 页）。时钟冻结（dt 一直 < 0.05 s）时速度保持不变。
   */
  private trackVelocity(camera: PerspectiveCamera, t: number): void {
    const s = threeToSim(camera.position.x, camera.position.y, camera.position.z);
    const x = s[0] * DM_TO_M;
    const y = s[1] * DM_TO_M;
    if (!this.lastPos) {
      this.lastPos = [x, y];
      this.lastPosT = t;
      return;
    }
    const dt = (t - this.lastPosT) / 1000;
    if (dt < 0.05) return;
    const vx = (x - this.lastPos[0]) / dt;
    const vy = (y - this.lastPos[1]) / dt;
    if (Math.hypot(vx, vy) > 60 || dt > 2) {
      this.vel[0] = 0;
      this.vel[1] = 0;
    } else {
      const k = Math.min(1, dt / 0.6);
      this.vel[0] += (vx - this.vel[0]) * k;
      this.vel[1] += (vy - this.vel[1]) * k;
    }
    this.lastPos = [x, y];
    this.lastPosT = t;
  }

  /** 每帧：挑页、发请求、上传一步、推进淡入。 */
  update(camera: PerspectiveCamera): void {
    this.frame++;
    // main.ts 置 ready（首帧画完）时调 begin()，再过 START_FRAMES 帧且 START_DELAY_MS 墙钟才开始下载：
    // 远景图集与近景页都不算进首帧前的数据量（无头测试里一帧可能超过 1 s，所以两个条件都要）
    if (!this.started) {
      if (this.readyWall === null || this.frame - this.readyFrame < START_FRAMES || Date.now() - this.readyWall < START_DELAY_MS) return;
      this.started = true;
      void this.loadFar(this.farWhich);
    }
    // 远景图集到了以后 0.6 s 内从程序立面淡入
    const wall = Date.now();
    const dtWall = Math.min((wall - this.lastWall) / 1000, 0.1);
    this.lastWall = wall;
    const grid = this.uniforms.uPhotoFarGrid!.value as Vector4;
    if (this.farState === 'ready' && grid.z < 1) grid.z = Math.min(1, grid.z + dtWall / FADE_FAR_S);
    // 近景页只在远景图集到了之后才流（远景都失败了就不会一页接一页地请求，见 breakNear）
    if (!this.near || !this.boxes || this.broken || this.farState !== 'ready') {
      this.advanceFade(dtWall);
      this.gen++;
      this.doneGen = this.gen;
      this.checkIdle();
      return;
    }
    const now = performance.now();
    if (this.hiLayers > 0 || this.init.tier === 'low') this.trackVelocity(camera, now); // [r45:fix] 帧时钟，不用墙钟
    if (this.frame % SELECT_EVERY === 0 || camera.position.distanceTo(this.lastSel) > MOVE_M) this.select(camera, now);
    this.pump();
    this.uploads = 0;
    this.uploadStep(now);
    this.uploadsLast = this.uploads;
    this.advanceFade(dtWall);
    this.checkIdle();
  }

  private select(camera: PerspectiveCamera, now: number): void {
    this.lastSel.copy(camera.position);
    const s = threeToSim(camera.position.x, camera.position.y, camera.position.z);
    this.camSim[0] = s[0] * DM_TO_M;
    this.camSim[1] = s[1] * DM_TO_M;
    this.camSim[2] = s[2] * DM_TO_M;
    camera.updateMatrixWorld();
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const n = this.boxes3.length;
    const dist = this.dist;
    const view = this.view;
    const [cx, cy, cz] = this.camSim;
    if (this.entries) pageNearest(this.entries.pageOf, this.entries.boxes, cx, cy, cz, dist);
    for (let i = 0; i < n; i++) {
      if (!this.entries) dist[i] = boxDistance(this.boxes!, i, cx, cy, cz);
      if (this.failed.has(i)) dist[i] = Infinity;
      view[i] = this.frustum.intersectsBox(this.boxes3[i]!);
    }
    // R4 高清页：预测距离（相机速度外推）；熔断或没有面外包盒时不参加
    const hiOn = this.hiLayers > 0 && !this.hiBroken && !!this.hiEntries;
    if (hiOn) predictDistance(this.hiEntries!.pageOf, this.hiEntries!.boxes, cx, cy, cz, this.vel[0], this.vel[1], this.hiDist, this.hiScratch);
    for (let i = 0; i < this.nHi; i++) {
      const v = this.nR3 + i;
      dist[v] = hiOn && !this.failed.has(v) ? this.hiDist[i]! : Infinity;
      view[v] = hiOn && !!this.hiBoxes3[i] && this.frustum.intersectsBox(this.hiBoxes3[i]!);
    }
    const resident = (p: number) => this.lru.slot(p) >= 0 && !this.fadingOut.has(p);
    // R4（LOW 下载预算）：LOW 档移动快于 LOW_MOVING_MS（搭电车、开车）时不再请求新的近景页，只留已常驻的（远景图集照常）；
    // 停下或走路时照旧。整程搭电车 LOW 只下远景图集与沿途少数页
    if (this.init.tier === 'low' && Math.hypot(this.vel[0], this.vel[1]) > LOW_MOVING_MS) {
      this.want = this.want.filter(resident);
      this.lru.touch(this.want, now);
      this.gen++;
      return;
    }
    // 手机：上段页（下标 ≥ streetPages）只在近处要
    const nStreet = this.init.hires?.streetPages ?? 0;
    const hiMax = this.init.mobile ? (p: number) => (p - this.nR3 >= nStreet ? HIRES_UPPER_PHONE_M : HIRES_MAX_M) : HIRES_MAX_M;
    this.want = chooseMixed(dist, view, (p) => p >= this.nR3, this.layers, hiOn ? this.hiLayers : 0, this.nearMaxM, hiMax, resident);
    this.lru.touch(this.want, now);
    this.auxLru.touch(this.want, now);
    this.hiDropped = 0;
    if (hiOn) {
      for (let i = 0; i < this.nHi; i++) {
        const v = this.nR3 + i;
        if (view[v] && this.hiDist[i]! <= (typeof hiMax === 'number' ? hiMax : hiMax(v)) && !this.failed.has(v) && !this.want.includes(v)) this.hiDropped++;
      }
    }
    // 预取：预测 HIRES_MAX_M 内、还没常驻也没在 want 里的高清页先下载字节（按预测距离，最多 4 页排队）
    if (hiOn) {
      const pre: { v: number; d: number }[] = [];
      for (let i = 0; i < this.nHi; i++) {
        const v = this.nR3 + i;
        const lim = typeof hiMax === 'number' ? hiMax : hiMax(v);
        if (this.hiDist[i]! <= lim && !this.failed.has(v) && this.lru.slot(v) < 0 && !this.want.includes(v)) pre.push({ v, d: this.hiDist[i]! });
      }
      pre.sort((a, b) => a.d - b.d || a.v - b.v);
      this.prefetchList = pre.slice(0, 4).map((c) => this.nameOf(c.v));
    } else this.prefetchList = [];
    this.gen++;
  }

  private prefetchList: string[] = [];

  /** 发起下载：按 want 的先后，给还没槽、没在途的页挑槽。 */
  private pump(): void {
    if (this.inflight.size >= MAX_FETCH || this.broken) return;
    // 每帧调：复用集合，不分配
    const pending = this.pendingPages;
    const reserved = this.reservedSlots;
    pending.clear();
    reserved.clear();
    for (const [p, sl] of this.inflight) {
      pending.add(p);
      reserved.add(sl);
    }
    const reservedAux = this.reservedAux;
    reservedAux.clear();
    for (const sl of this.inflightAux.values()) reservedAux.add(sl);
    for (const d of this.ready) {
      pending.add(d.page);
      reserved.add(d.slot);
      if (d.auxSlot !== undefined) reservedAux.add(d.auxSlot);
    }
    const want = this.wantFree;
    want.length = 0;
    for (const p of this.want) if (!pending.has(p) && !this.failed.has(p) && this.lru.slot(p) < 0) want.push(p);
    if (want.length === 0) {
      this.prefetch(this.prefetchList);
      return;
    }
    for (const { page, slot } of this.lru.plan(want, MAX_FETCH - this.inflight.size, reserved)) {
      if (this.isHi(page)) {
        if (this.hiBroken || !this.auxArr) continue;
        // 第一张高清页成功之前同时只发一个高清请求（高清页整体缺失时只报一条错就熔断）
        if (!this.hiOk && this.inflightAux.size > 0) continue;
        const ap = this.auxLru.plan([page], 1, reservedAux)[0];
        if (!ap) continue;
        reservedAux.add(ap.slot);
        reserved.add(slot);
        this.inflight.set(page, slot);
        this.inflightAux.set(page, ap.slot);
        this.fetchHires(this.nameOf(page)).then(
          ({ col, aux }) => {
            this.inflight.delete(page);
            this.inflightAux.delete(page);
            this.hiOk = true;
            if (this.broken || this.hiBroken) {
              col.close();
              aux.close();
              return;
            }
            this.ready.push({ page, slot, bmp: col, aux, auxSlot: ap.slot });
          },
          (e: unknown) => {
            this.inflight.delete(page);
            this.inflightAux.delete(page);
            this.failed.add(page);
            this.breakHires(`高清第 ${page - this.nR3} 頁載入失敗 ${e instanceof Error ? e.message : String(e)}`);
          },
        );
        continue;
      }
      this.inflight.set(page, slot);
      const name = this.init.meta.pages[page]!;
      this.fetchBitmap(name).then(
        (bmp) => {
          this.inflight.delete(page);
          if (this.broken) {
            bmp.close();
            return;
          }
          if (bmp.width !== this.page || bmp.height !== this.page) {
            bmp.close();
            this.failed.add(page);
            this.breakNear(`第 ${page} 頁尺寸不符`);
            return;
          }
          this.ready.push({ page, slot, bmp });
        },
        (e: unknown) => {
          this.inflight.delete(page);
          this.failed.add(page);
          this.breakNear(`第 ${page} 頁載入失敗 ${e instanceof Error ? e.message : String(e)}`);
        },
      );
    }
  }

  /** 每帧最多上传一页 + 这一层的 mipmap。槽里原来的页先淡出（FADE_OUT_S）再覆盖。 */
  private uploadStep(now: number): void {
    if (!this.nearCol || this.ready.length === 0) return;
    let idx = -1;
    for (let i = 0; i < this.ready.length; i++) {
      const r = this.ready[i]!;
      const old = this.lru.page(r.slot);
      if (old >= 0 && old !== r.page && this.fade[old]! > 0) {
        this.fadingOut.add(old);
        continue;
      }
      idx = i;
      break;
    }
    if (idx < 0) return;
    const d = this.ready.splice(idx, 1)[0]!;
    const gl = this.gl;
    const state = this.init.renderer.state;
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    // 槽里原来的页立即退回远景（高清页连同它的辅助图槽）
    const old = this.lru.page(d.slot);
    if (old >= 0) this.evict(old, d.slot);
    // 辅助图槽里原来的高清页（颜色层还在）也让出：没有辅助图的高清页不完整
    if (d.auxSlot !== undefined) {
      const ao = this.auxLru.page(d.auxSlot);
      if (ao >= 0 && ao !== d.page) {
        const so = this.lru.slot(ao);
        if (so >= 0) this.evict(ao, so);
        this.auxLru.release(d.auxSlot);
      }
    }
    this.uploads++;
    this.lru.release(d.slot);
    state.bindTexture(gl.TEXTURE_2D_ARRAY, this.nearCol);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, d.slot, this.page, this.page, 1, gl.RGBA, gl.UNSIGNED_BYTE, d.bmp);
    this.mipLayer(this.nearCol, d.slot, this.page);
    d.bmp.close();
    if (d.aux && d.auxSlot !== undefined && this.auxArr) {
      state.bindTexture(gl.TEXTURE_2D_ARRAY, this.auxArr);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, d.auxSlot, this.auxSize, this.auxSize, 1, gl.RGBA, gl.UNSIGNED_BYTE, d.aux);
      this.mipLayer(this.auxArr, d.auxSlot, this.auxSize);
      this.auxLru.commit(d.page, d.auxSlot, now);
    }
    d.aux?.close();
    this.lru.commit(d.page, d.slot, now);
    this.fade[d.page] = 0;
    this.setSlot(d.page, d.slot, 0, d.auxSlot);
  }

  /** 让出页 old 的颜色槽 slot（高清页连同辅助图槽）：立即退回远景 / R3。 */
  private evict(old: number, slot: number): void {
    this.fadingOut.delete(old);
    this.fade[old] = 0;
    this.setSlot(old, 255, 0, 255);
    if (this.isHi(old)) {
      const as = this.auxLru.slot(old);
      if (as >= 0) this.auxLru.release(as);
    }
    if (this.lru.page(slot) === old) this.lru.release(slot);
    this.evictions++;
  }

  /**
   * 只为这一层生成 mipmap：逐级 blitFramebuffer（线性过滤，sRGB 附件按线性空间混合，与 generateMipmap 一致）。
   * 原来每上传一页就对整个 9–12 层的数组 generateMipmap（48–64 MB 的 mip 流量）。framebuffer 不完整或报错时永久退回 generateMipmap。
   * 前后的 framebuffer 绑定与剪裁测试原样恢复（three 的状态缓存不受影响）。
   */
  private mipLayer(tex: WebGLTexture, slot: number, page: number): void {
    const gl = this.gl;
    if (this.blitMips) {
      let ok = true;
      const prevR = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const prevD = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const scissor = gl.isEnabled(gl.SCISSOR_TEST);
      try {
        if (scissor) gl.disable(gl.SCISSOR_TEST);
        this.fbRead ??= gl.createFramebuffer();
        this.fbDraw ??= gl.createFramebuffer();
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbRead);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbDraw);
        const levels = Math.floor(Math.log2(page)) + 1;
        let size = page;
        for (let l = 1; l < levels; l++) {
          gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, l - 1, slot);
          gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, l, slot);
          if (l === 1 && (gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE || gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)) {
            ok = false;
            break;
          }
          const n = Math.max(1, size >> 1);
          gl.blitFramebuffer(0, 0, size, size, 0, 0, n, n, gl.COLOR_BUFFER_BIT, gl.LINEAR);
          size = n;
        }
        gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, null, 0, 0);
        gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, null, 0, 0);
        // 第一次用时查一次错误（之后不再同步 GPU）
        if (ok && !this.blitChecked) {
          this.blitChecked = true;
          if (gl.getError() !== gl.NO_ERROR) ok = false;
        }
      } catch {
        ok = false;
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevR);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, prevD);
      if (scissor) gl.enable(gl.SCISSOR_TEST);
      if (ok) return;
      this.blitMips = false;
    }
    this.init.renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  }

  private setSlot(page: number, slot: number, fade: number, aux?: number): void {
    if (this.isHi(page)) {
      const h = this.hiSlotTex.image.data as Uint8Array;
      const i = (page - this.nR3) * 4;
      h[i] = slot;
      h[i + 1] = fade;
      if (aux !== undefined) h[i + 2] = aux;
      this.hiSlotTex.needsUpdate = true;
      return;
    }
    const data = this.slotTex.image.data as Uint8Array;
    data[page * 4] = slot;
    data[page * 4 + 1] = fade;
    this.slotTex.needsUpdate = true;
  }

  private advanceFade(dt: number): void {
    const data = this.slotTex.image.data as Uint8Array;
    const hdata = this.hiSlotTex.image.data as Uint8Array;
    let dirty = false;
    let hdirty = false;
    for (let s = 0; s < this.layers; s++) {
      const p = this.lru.page(s);
      if (p < 0) continue;
      if (this.fadingOut.has(p)) {
        if (this.fade[p]! <= 0) continue;
        this.fade[p] = Math.max(0, this.fade[p]! - dt / FADE_OUT_S);
      } else {
        if (this.fade[p]! >= 1) continue;
        this.fade[p] = Math.min(1, this.fade[p]! + dt / FADE_S);
      }
      if (this.isHi(p)) {
        hdata[(p - this.nR3) * 4 + 1] = Math.round(this.fade[p]! * 255);
        hdirty = true;
      } else {
        data[p * 4 + 1] = Math.round(this.fade[p]! * 255);
        dirty = true;
      }
    }
    if (dirty) this.slotTex.needsUpdate = true;
    if (hdirty) this.hiSlotTex.needsUpdate = true;
  }

  /** 视野要的页还有几张没到（在途 + 待上传 + 还没开始 + 还在淡入）。 */
  private pendingCount(): number {
    if (!this.near || this.broken) return 0;
    let n = 0;
    for (const p of this.want) if ((this.lru.slot(p) < 0 || this.fade[p]! < 1) && !this.failed.has(p)) n++;
    return n;
  }

  private checkIdle(): void {
    if (this.waiters.length === 0) return;
    const farDone = this.farState === 'failed' || (this.farState === 'ready' && (this.uniforms.uPhotoFarGrid!.value as Vector4).z >= 1);
    const idle = farDone && this.pendingCount() === 0 && this.ready.length === 0;
    if (idle) this.doneGen = this.gen;
    this.waiters = this.waiters.filter((w) => {
      if (idle && this.doneGen > w.gen) {
        w.resolve();
        return false;
      }
      return true;
    });
  }

  /** 视野要的页都已常驻（或失败）、远景图集已到时兑现（以调用之后的下一次挑页为准）。 */
  idle(): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ gen: this.gen, resolve }));
  }

  /** 调试钩子 __central.facades()。 */
  debug(): FacadeDebug {
    const MB = 1024 * 1024;
    return {
      pagesTotal: this.init.meta.pages.length,
      pagesResident: this.lru.resident,
      residentMB: Math.round(((this.lru.resident * layerBytes(this.page) + this.farMB) / MB) * 10) / 10,
      budgetMB: Math.round((((this.near && !this.broken ? this.layers * layerBytes(this.page) : 0) + this.farMB) / MB) * 10) / 10,
      wanted: this.want.length,
      queued: this.inflight.size + this.ready.length,
      failed: this.failed.size,
      bytesFetched: this.bytes,
      uploadsLastFrame: this.uploadsLast,
      evictions: this.evictions,
      excluded: this.init.meta.excluded?.length ?? 0,
      hiresTotal: this.nHi,
      hiresResident: this.hiResident(),
      hiresWanted: this.want.filter((p) => p >= this.nR3).length,
      hiresBroken: this.hiBroken,
      hiresDropped: this.hiDropped,
    };
  }

  /** 常驻的高清页数。 */
  private hiResident(): number {
    let n = 0;
    for (let s = 0; s < this.layers; s++) if (this.lru.page(s) >= this.nR3) n++;
    return n;
  }

  /** 视野要的高清页还有几张没到（在途 + 待上传 + 还没开始 + 还在淡入）。 */
  private hiPending(): number {
    if (!this.near || this.broken || this.hiBroken) return 0;
    let n = 0;
    for (const p of this.want) if (p >= this.nR3 && (this.lru.slot(p) < 0 || this.fade[p]! < 1) && !this.failed.has(p)) n++;
    return n;
  }

  /**
   * 贴面显存与流式状态：facadeMB = 远景图集 + 近景池（含高清页占的颜色层）+ 高清辅助图（R4）；hiresMB = 常驻高清页的颜色层 + 辅助图；
   * hiresPending = 视野要的高清页还没到的；hiresBytes = 已下载的高清页字节（含预取）。
   */
  stats(): { facadeMB: number; facadePending: number; facadeBytes: number; hiresMB: number; hiresPending: number; hiresBytes: number } {
    const MB = 1024 * 1024;
    const nearOk = this.near && !this.broken;
    const aux = nearOk && this.auxArr ? this.hiLayers * auxLayerBytes(this.auxSize) : 0;
    const mb = ((nearOk ? this.layers * layerBytes(this.page) : 0) + aux + this.farMB) / MB;
    const hiMB = (this.hiResident() * layerBytes(this.page) + aux) / MB;
    return {
      facadeMB: Math.round(mb * 10) / 10,
      facadePending: this.pendingCount() + (this.farState === 'loading' || (this.farState === 'ready' && (this.uniforms.uPhotoFarGrid!.value as Vector4).z < 1) ? 1 : 0),
      facadeBytes: this.bytes,
      hiresMB: Math.round(hiMB * 10) / 10,
      hiresPending: this.hiPending(),
      hiresBytes: this.hiBytes,
    };
  }
}
