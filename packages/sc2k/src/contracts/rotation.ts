// ===== rotation.ts =====（spec:terrain §2.5.4、spec:ui-art §3.3；由坐标变换 (x,y)→(y,127−x) 严格推出）
// 旋转置换：渲染 / 拾取 / 路网 / 预览的唯一真源；terrain 模块只 re-export（CONTRACTS §B）。
import { Dir, XBit, tileIndex, tileX, tileY } from './grid';

export type Rotation = 0 | 1 | 2 | 3;                           // 逆时针次数 = MISC 0x0008
/** 地块坐标逆时针旋转 r 次：1 次 = (x,y) → (y, 127−x)。 */
export function rotateTile(x: number, y: number, r: Rotation): [number, number] {
  let rx = x, ry = y;
  for (let k = 0; k < r; k++) { const t = rx; rx = ry; ry = 127 - t; }
  return [rx, ry];
}
export function unrotateTile(rx: number, ry: number, r: Rotation): [number, number] {
  let x = rx, y = ry;
  for (let k = 0; k < r; k++) { const t = x; x = 127 - y; y = t; }
  return [x, y];
}
/** 角点网格（129×129）的同款变换：(cx,cy) → (cy, 128−cx)。 */
export function rotateCorner(cx: number, cy: number, r: Rotation): [number, number] {
  let a = cx, b = cy;
  for (let k = 0; k < r; k++) { const t = a; a = b; b = 128 - t; }
  return [a, b];
}
/** 方向映射：T→L→B→R→T（逆时针 1 次）。 */
export const DIR_ROT_CCW: readonly Dir[] = [Dir.L, Dir.T, Dir.R, Dir.B];
export const rotateDir = (d: Dir, r: Rotation): Dir => { let x = d; for (let k = 0; k < r; k++) x = DIR_ROT_CCW[x]!; return x; };

/** 坡面码 → 角位 (a=c00, b=c10, x=c01, y=c11)，bit3..bit0；nibble 不是位掩码，必须查表。 */
export const SLOPE_CORNERS: readonly number[] = [0b0000, 0b1100, 0b0101, 0b0011, 0b1010, 0b1101, 0b0111, 0b1011, 0b1110, 0b0100, 0b0001, 0b0010, 0b1000, 0b1111];
export const CORNERS_TO_SLOPE: readonly number[] = (() => { const t = new Array<number>(16).fill(-1); SLOPE_CORNERS.forEach((bits, code) => { t[bits] = code; }); return t; })();
/** 逆时针 1 次的坡面码置换（下标 = 旧码）；由角点重命名 c10→c00', c11→c10', c01→c11', c00→c01' 推出。 */
export const SLOPE_ROT_CCW: readonly number[] = [0, 4, 1, 2, 3, 8, 5, 6, 7, 12, 9, 10, 11, 13];
export const SLOPE_ROT_CW: readonly number[] = [0, 2, 3, 4, 1, 6, 7, 8, 5, 10, 11, 12, 9, 13];
/** 溪流 / 水湾（0x40–0x45）的逆时针置换；0x3E 瀑布不变。 */
export const XTER_STREAM_ROT_CCW: Readonly<Record<number, number>> = { 0x40: 0x41, 0x41: 0x40, 0x42: 0x45, 0x45: 0x44, 0x44: 0x43, 0x43: 0x42 };
/** 整个 XTER 字节逆时针旋转 r 次（0x0X/0x1X/0x2X 坡面码与 0x3X 浅水形状码同为角位编码）。 */
export function rotateXter(code: number, r: Rotation): number {
  let c = code;
  for (let k = 0; k < r; k++) {
    if (c === 0x3e) continue;
    if (c >= 0x40 && c <= 0x45) { c = XTER_STREAM_ROT_CCW[c]!; continue; }
    const hi = c & 0xf0, lo = c & 0x0f;
    if (lo <= 13) c = hi | SLOPE_ROT_CCW[lo]!;
  }
  return c;
}

// ---- 置换表生成（模块初始化时一次）----
/** 把环 [a, b, c, …] 写入表：a→b, b→c, …, 末项→a（长度 2 即对换）。 */
function applyRing(t: Uint8Array, ring: readonly number[]): void {
  for (let k = 0; k < ring.length; k++) t[ring[k]!] = ring[(k + 1) % ring.length]!;
}
/** 网络族 15 片段的偏移环（电线 / 道路 / 铁路 / 地铁 / 管线共用）：直线 0↔1；坡 2→5→4→3→2；弯 6→9→8→7→6；三岔 10→13→12→11→10；十字 14 不变。 */
const NET_PIECE_RINGS: ReadonlyArray<readonly number[]> = [[0, 1], [2, 5, 4, 3], [6, 9, 8, 7], [10, 13, 12, 11]];
function applyNetRings(t: Uint8Array, base: number): void {
  for (const ring of NET_PIECE_RINGS) applyRing(t, ring.map((k) => base + k));
}
function identity256(): Uint8Array {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = i;
  return t;
}
function buildXbldRotCcw(): Uint8Array {
  const t = identity256();
  for (const base of [0x0e, 0x1d, 0x2c]) applyNetRings(t, base);          // 电线 / 道路 / 铁路
  applyRing(t, [0x3b, 0x3e, 0x3d, 0x3c]);                                  // 铁路半高
  applyRing(t, [0x3f, 0x42, 0x41, 0x40]);                                  // 隧道口
  applyRing(t, [0x6c, 0x6f, 0x6e, 0x6d]);                                  // 地铁↔铁路
  const pairs: ReadonlyArray<readonly [number, number]> = [
    [0x43, 0x44], [0x45, 0x46], [0x47, 0x48], [0x4b, 0x4c], [0x4d, 0x4e], [0x4f, 0x50],   // 交叉件对
    [0x49, 0x4a],                                                                          // 高速直线
    [0xc6, 0xc7]];                                                                         // 水电
  for (const p of pairs) applyRing(t, p);
  applyRing(t, [0x61, 0x64, 0x63, 0x62]);                                  // 高速坡
  applyRing(t, [0x65, 0x68, 0x67, 0x66]);                                  // 高速弯；0x69 不变
  return t;
}
function buildXundRotCcw(): Uint8Array {
  const t = identity256();
  applyNetRings(t, 0x01);                                                  // 地铁 0x01+k
  applyNetRings(t, 0x10);                                                  // 管线 0x10+k
  applyRing(t, [0x1f, 0x20]);                                              // 交叉；0x22 0x23 不变
  return t;
}

/**
 * XBLD 逆时针 1 次置换表（256 项，建筑 0x70–0xFF 除 0xC6↔0xC7 外不变）。由下列环在模块初始化时生成：
 *  网络族（基址 0x0E 电线 / 0x1D 道路 / 0x2C 铁路）偏移 k：直线 0↔1；坡 2→5→4→3→2；弯 6→9→8→7→6；三岔 10→13→12→11→10；十字 14 不变
 *  铁路半高 0x3B→0x3E→0x3D→0x3C→0x3B；隧道口 0x3F→0x42→0x41→0x40→0x3F；地铁↔铁路 0x6C→0x6F→0x6E→0x6D→0x6C
 *  交叉件对 0x43↔0x44 0x45↔0x46 0x47↔0x48 0x4B↔0x4C 0x4D↔0x4E 0x4F↔0x50
 *  高速 0x49↔0x4A；坡 0x61→0x64→0x63→0x62→0x61；弯 0x65→0x68→0x67→0x66→0x65；0x69 不变
 *  水电 0xC6↔0xC7；匝道 0x5D–0x60 与翻转族不在此表（见 rotateXbldFlip）
 */
export const XBLD_ROT_CCW: Uint8Array = buildXbldRotCcw();
export function rotateXbld(id: number, r: Rotation): number { let c = id; for (let k = 0; k < r; k++) c = XBLD_ROT_CCW[c]!; return c; }
/** XUND 置换：地铁 0x01+k / 管线 0x10+k 与电线同偏移环；0x1F↔0x20；0x22 0x23 不变。 */
export const XUND_ROT_CCW: Uint8Array = buildXundRotCcw();
export function rotateXund(code: number, r: Rotation): number { let c = code; for (let k = 0; k < r; k++) c = XUND_ROT_CCW[c]!; return c; }

/** 用 XBit.Flipped 表示朝向的"翻转族"（spec:building-catalogue §2.3 / §2.8）：桥件、高架电线、加固桥、跑道、栈桥、起重机。 */
export const FLIP_FAMILY: ReadonlySet<number> = new Set([0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x5b, 0x5c, 0x6a, 0x6b, 0xdd, 0xdf, 0xe0]);
/** 显示翻转：每转 1 次取反（LR↔TB）；只对翻转族有意义；渲染器只读 XBIT，永不写。 */
export const drawFlip = (xbit: number, id: number, r: Rotation): boolean =>
  FLIP_FAMILY.has(id) && (((xbit & XBit.Flipped) !== 0) !== ((r & 1) === 1));

/** 匝道朝向元组（0x5D–0x60）；Flipped 置位 = 整体再转 90°。 */
export const ONRAMP_ORIENT: Readonly<Record<number, { hwy: Dir.T | Dir.B; road: Dir.L | Dir.R }>> = {
  0x5d: { hwy: Dir.T, road: Dir.L }, 0x5e: { hwy: Dir.T, road: Dir.R }, 0x5f: { hwy: Dir.B, road: Dir.L }, 0x60: { hwy: Dir.B, road: Dir.R } };
/**
 * 精灵水平镜像在 2:1 等轴下等于世界轴交换 x↔y，方向映射 T↔L、R↔B（spec:ui-art §2.9.3："L–R 件的镜像就是 T–B 件"）。
 * 翻转族与匝道的 Flipped 位都按此镜像理解（对 LR/TB 对称件它与"转 90°"同义；对匝道这是唯一与镜像画法一致的解释）。
 */
export const DIR_MIRROR: readonly Dir[] = [Dir.L, Dir.B, Dir.R, Dir.T];
const ONRAMP_IDS: readonly number[] = [0x5d, 0x5e, 0x5f, 0x60];
function onrampIdFor(hwy: Dir, road: Dir, fallback: number): number {
  for (const id of ONRAMP_IDS) { const o = ONRAMP_ORIENT[id]!; if (o.hwy === hwy && o.road === road) return id; }
  return fallback;                                               // 不可达：hwy∈{T,B}×road∈{L,R} 四种组合全在表中
}
/** 匝道在世界坐标里的实际朝向（已折算 XBit.Flipped）；非匝道返回 null。transport 的连通判定与渲染选精灵共用，避免两处口径不一。 */
export function onrampWorldOrient(id: number, xbit: number): { hwy: Dir; road: Dir } | null {
  const o = ONRAMP_ORIENT[id];
  if (!o) return null;
  if ((xbit & XBit.Flipped) === 0) return { hwy: o.hwy, road: o.road };
  return { hwy: DIR_MIRROR[o.hwy]!, road: DIR_MIRROR[o.road]! };
}
/** 通用入口：给出 (id, xbit, rotation) 应选的精灵 ID 与是否水平镜像。匝道走元组反查；翻转族走 drawFlip；其余走 rotateXbld。结果只用于选精灵，不写回 XBIT。 */
export function rotateXbldFlip(id: number, xbit: number, r: Rotation): { id: number; flip: boolean } {
  const o = onrampWorldOrient(id, xbit);
  if (o) {
    const hwy = rotateDir(o.hwy, r), road = rotateDir(o.road, r);
    if (hwy === Dir.T || hwy === Dir.B) return { id: onrampIdFor(hwy, road, id), flip: false };
    return { id: onrampIdFor(DIR_MIRROR[hwy]!, DIR_MIRROR[road]!, id), flip: true };
  }
  if (FLIP_FAMILY.has(id)) return { id, flip: drawFlip(xbit, id, r) };
  return { id: rotateXbld(id, r), flip: false };
}

/**
 * 多格建筑的渲染锚格 = 旋转后 rx+ry 最大的占地格（屏幕最下方那格），不是 TL 格：
 *  rot0 (x0+s−1, y0+s−1)  rot1 (x0, y0+s−1)  rot2 (x0, y0)  rot3 (x0+s−1, y0)
 * originTile 为世界 TL 锚格索引（anchorOf 的返回值）。精灵锚点对齐到该格菱形的底顶点 c11'。
 */
export function renderAnchor(originTile: number, size: 1 | 2 | 3 | 4, r: Rotation): number {
  const x0 = tileX(originTile), y0 = tileY(originTile), s = size - 1;
  switch (r) {
    case 0: return tileIndex(x0 + s, y0 + s);
    case 1: return tileIndex(x0, y0 + s);
    case 2: return tileIndex(x0, y0);
    default: return tileIndex(x0 + s, y0);
  }
}
