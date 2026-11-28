/**
 * R5 真实地标的二进制格式（纯函数，不碰 three / DOM，有单元测试）。离线烘焙见 citymap/fetch/landsd_3d_landmark_bake.py 文件头。
 *
 * CLMK v1（网格，小端）：48 字节头（'CLMK'、版本 u16、标志 u16（bit0 = 32 位索引）、顶点数 u32、索引数 u32、
 * three 坐标的反量化偏移 f32×3 与跨度 f32×3、保留 8 字节），之后依次：位置 u16×4（归一化）、法线 i8×4（归一化）、
 * 图集 uv u16×2、uv 夹取框 u16×4（全 0 = 用顶点色）、顶点色 u8×4（sRGB 反照率 + 玻璃度）、立面 i16×2（相位对齐的水平坐标 cm；第 2 分量平时为 0，
 * steel-frame 红光楼梯间的块是条带坐标 = 离条带中线 / 半宽 × 1000，LED 线顶点是线宽 mm）、
 * 网格 u8×4（竖梃间距 2 cm 单位、特征号、地标序号、保留），最后是索引（u16 / u32，补齐到 4 字节）。
 *
 * CLTX v1（GPU 压缩贴图，小端）：'CLTX'、版本 u16、格式 u16（1 = BC3 / DXT5 sRGB、2 = ETC2 RGBA8 EAC sRGB）、宽、高、级数（u32），
 * 各级字节数 u32 × 级数，之后逐级的块数据（每个 4×4 块 16 字节）。
 */

export const CLMK_HEADER = 48;

export interface LandmarkMeshData {
  vertexCount: number;
  indexCount: number;
  /** three 坐标：位置 = offset + 归一化值 × span。 */
  offset: [number, number, number];
  span: [number, number, number];
  pos: Uint16Array;
  nrm: Int8Array;
  uv: Uint16Array;
  rect: Uint16Array;
  col: Uint8Array;
  fac: Int16Array;
  grid: Uint8Array;
  index: Uint16Array | Uint32Array;
}

/** 解析 CLMK v1；格式不对时抛错（坏文件、SPA 回退页）。 */
export function parseMesh(buf: ArrayBuffer): LandmarkMeshData {
  if (buf.byteLength < CLMK_HEADER) throw new Error('CLMK：文件太短');
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x43 || u8[1] !== 0x4c || u8[2] !== 0x4d || u8[3] !== 0x4b) throw new Error('CLMK：魔数不对');
  const dv = new DataView(buf);
  const version = dv.getUint16(4, true);
  if (version !== 1) throw new Error(`CLMK：不支持的版本 ${version}`);
  const flags = dv.getUint16(6, true);
  const nv = dv.getUint32(8, true);
  const ni = dv.getUint32(12, true);
  const f = (o: number) => dv.getFloat32(o, true);
  const offset: [number, number, number] = [f(16), f(20), f(24)];
  const span: [number, number, number] = [f(28), f(32), f(36)];
  const big = (flags & 1) !== 0;
  const need = CLMK_HEADER + nv * 36 + ni * (big ? 4 : 2);
  if (buf.byteLength < need) throw new Error(`CLMK：长度 ${buf.byteLength} 不足 ${need}`);
  let o = CLMK_HEADER;
  const take = <T>(make: (b: ArrayBuffer, off: number, len: number) => T, bytesPer: number, k: number): T => {
    const a = make(buf, o, nv * k);
    o += nv * k * bytesPer;
    return a;
  };
  const pos = take((b, off, n) => new Uint16Array(b, off, n), 2, 4);
  const nrm = take((b, off, n) => new Int8Array(b, off, n), 1, 4);
  const uv = take((b, off, n) => new Uint16Array(b, off, n), 2, 2);
  const rect = take((b, off, n) => new Uint16Array(b, off, n), 2, 4);
  const col = take((b, off, n) => new Uint8Array(b, off, n), 1, 4);
  const fac = take((b, off, n) => new Int16Array(b, off, n), 2, 2);
  const grid = take((b, off, n) => new Uint8Array(b, off, n), 1, 4);
  const index = big ? new Uint32Array(buf, o, ni) : new Uint16Array(buf, o, ni);
  for (let i = 0; i < ni; i++) if (index[i]! >= nv) throw new Error('CLMK：索引越界');
  return { vertexCount: nv, indexCount: ni, offset, span, pos, nrm, uv, rect, col, fac, grid, index };
}

export const CLTX_BC3 = 1;
export const CLTX_ETC2 = 2;

export interface CompressedLevels {
  format: number;
  width: number;
  height: number;
  levels: { data: Uint8Array; width: number; height: number }[];
  bytes: number;
}

/** 解析 CLTX v1；每级的字节数须等于 ceil(w/4) × ceil(h/4) × 16。 */
export function parseTexture(buf: ArrayBuffer): CompressedLevels {
  if (buf.byteLength < 20) throw new Error('CLTX：文件太短');
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x43 || u8[1] !== 0x4c || u8[2] !== 0x54 || u8[3] !== 0x58) throw new Error('CLTX：魔数不对');
  const dv = new DataView(buf);
  if (dv.getUint16(4, true) !== 1) throw new Error('CLTX：不支持的版本');
  const format = dv.getUint16(6, true);
  if (format !== CLTX_BC3 && format !== CLTX_ETC2) throw new Error(`CLTX：未知格式 ${format}`);
  const width = dv.getUint32(8, true);
  const height = dv.getUint32(12, true);
  const n = dv.getUint32(16, true);
  if (n < 1 || n > 16) throw new Error('CLTX：级数不对');
  let o = 20 + 4 * n;
  const levels: CompressedLevels['levels'] = [];
  let w = width;
  let h = height;
  for (let k = 0; k < n; k++) {
    const len = dv.getUint32(20 + 4 * k, true);
    if (len !== Math.ceil(w / 4) * Math.ceil(h / 4) * 16) throw new Error(`CLTX：第 ${k} 级长度不对`);
    if (o + len > buf.byteLength) throw new Error('CLTX：数据不足');
    levels.push({ data: new Uint8Array(buf, o, len), width: w, height: h });
    o += len;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return { format, width, height, levels, bytes: levels.reduce((s, l) => s + l.data.byteLength, 0) };
}

/** WebP 文件头（RIFF … WEBP）。 */
export function isWebp(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const u = new Uint8Array(buf, 0, 12);
  return u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50;
}

export type AtlasChoice = 'bc3' | 'bc3Half' | 'etc2Half' | 'bc3Quarter' | 'etc2Quarter' | 'webpHalf' | 'webpQuarter';

/** 桌面 HIGH 档的地标图集分辨率：'full' = BC3 2048²（含 mip 5.3 MiB）、'half' = BC3 1024²（1.3 MiB，与手机同一份）。 */
export type DesktopAtlasRes = 'full' | 'half';

/**
 * 桌面 HIGH 档用全分辨率图集的条件（R4 + R5 整合复审修正：原来整合时为守 2560×1440 的 160 MB 把所有桌面都改成 'half'）：
 * 起始画面的渲染目标（显存账本里随 drawing buffer 变的四项：场景 HDR 目标、画布、平面反射、bloom）合计 ≤ 这么多字节。
 * 依据（整合后实测的桌面账本，`__central.texLedger()`）：不随 buffer 变的部分 103.2 MiB（贴面 86.7、招牌 / 车站 / 涂装图集、
 * 地面遮罩……含半分辨率地标图集 1.3），换全分辨率 +4.0 → 107.2 MiB；160 MB 上限减冒烟脚本 1.5 MB 余量 = 158.5，渲染目标 ≤ 51.3 MiB
 * 才放得下，取 48 MiB 再留约 3 MiB。1280×720 @1（MSAA 2，41.3 MiB）、1366×768 @1（47.0）、1440×900 / 1680×1050 @1（33.4 / 45.4，
 * 不开 MSAA）用 'full'；1920×1080 @1、2560×1440、1280×720 @2（buffer 都是 2.07 Mpx，53.4 MiB）用 'half'。
 * 自适应 DPR 只会降不会升，会话里渲染目标不会比起始时大（窗口拉大另说，见 README「预算」）。
 */
export const FULL_ATLAS_MAX_RT_BYTES = 48 * 1024 * 1024;

/** 按起始渲染目标的字节数挑桌面 HIGH 档的图集分辨率（见 FULL_ATLAS_MAX_RT_BYTES）。 */
export function desktopAtlasRes(renderTargetBytes: number): DesktopAtlasRes {
  return renderTargetBytes <= FULL_ATLAS_MAX_RT_BYTES ? 'full' : 'half';
}

/**
 * 按 GPU 能力与画质档挑图集（显存见 README「预算」）：
 * - HIGH 桌面：desktop = 'full' 时 BC3 全分辨率（2048²，5.3 MiB）> ETC2 半分辨率 > WebP 半分辨率（RGBA8 1024²，5.3 MiB）；
 *   'half' 时 BC3 半分辨率（1024²，1.3 MiB）> ETC2 半分辨率 > WebP 四分之一（512²，1.3 MiB）；
 * - HIGH 手机：ETC2 半分辨率（1024²，1.3 MiB）> BC3 半分辨率 > WebP 四分之一（512²，1.3 MiB）；
 * - LOW（全程只画远景网格）：BC3 / ETC2 四分之一分辨率（512² 起的 mip 链，下载与显存都是 0.33 MiB）> WebP 四分之一。
 *   R4 + R5 整合时 LOW 下载 1.4 MB 的半分辨率文件、上传时丢掉最大一级（atlasSkipMips），复审修正改成单独的四分之一文件，每次 LOW 会话少下载 1.05 MB。
 * desktop 缺省按 'half'（不知道渲染目标多大时取省显存的一档；real.ts 在首帧之后按 desktopAtlasRes 定）。
 */
export function chooseAtlas(
  tier: 'high' | 'low',
  mobile: boolean,
  caps: { s3tc: boolean; etc: boolean },
  force?: string | null,
  desktop: DesktopAtlasRes = 'half',
): AtlasChoice {
  const all: AtlasChoice[] = ['bc3', 'bc3Half', 'etc2Half', 'bc3Quarter', 'etc2Quarter', 'webpHalf', 'webpQuarter'];
  if (force && (all as string[]).includes(force)) {
    const f = force as AtlasChoice;
    if ((f === 'bc3' || f === 'bc3Half' || f === 'bc3Quarter') && !caps.s3tc) return 'webpQuarter';
    if ((f === 'etc2Half' || f === 'etc2Quarter') && !caps.etc) return 'webpQuarter';
    return f;
  }
  if (tier === 'low') return caps.s3tc ? 'bc3Quarter' : caps.etc ? 'etc2Quarter' : 'webpQuarter';
  if (mobile) return caps.etc ? 'etc2Half' : caps.s3tc ? 'bc3Half' : 'webpQuarter';
  const half = desktop === 'half';
  return caps.s3tc ? (half ? 'bc3Half' : 'bc3') : caps.etc ? 'etc2Half' : half ? 'webpQuarter' : 'webpHalf';
}

/** 一档图集在 GPU 上的字节数（含整条 mip；BC3 / ETC2 每 4×4 块 16 字节，WebP 解码成 RGBA8）。size = 全分辨率边长。 */
export function atlasGpuBytes(choice: AtlasChoice, size: number): number {
  const blocks = (w: number): number => {
    let n = 0;
    for (let s = w; s >= 4; s >>= 1) n += Math.ceil(s / 4) * Math.ceil(s / 4) * 16;
    return n;
  };
  switch (choice) {
    case 'bc3':
      return blocks(size);
    case 'bc3Half':
    case 'etc2Half':
      return blocks(size / 2);
    case 'bc3Quarter':
    case 'etc2Quarter':
      return blocks(size / 4);
    case 'webpHalf':
      return rgbaBytes(size / 2, size / 2);
    case 'webpQuarter':
      return rgbaBytes(size / 4, size / 4);
  }
}

/** 带 mip 的 RGBA8 贴图显存（字节）。 */
export function rgbaBytes(w: number, h: number): number {
  return Math.round(w * h * 4 * (4 / 3));
}
