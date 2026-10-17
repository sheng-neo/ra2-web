# `packages/sc2k` 共享契约（CONTRACTS）

> 本文是 `src/contracts/**` 的落地蓝本：WP0 把每个代码块原样复制为同名文件并补齐 `declare` 的实现体；T+1:30 冻结后只允许加法（见文末 §Z）。每个工作包**只依赖本文**即可独立开工；跨 WP 的一切交汇都经这里的类型 / 常量 / 纯函数。
> 约定：`i = x*128 + y`（x 主序）；方向 `T = −y, R = +x, B = +y, L = −x`；锚点 = `XZON` 的 TL 位 `0x40`；所有函数纯、同步、无 I/O；`sim` 侧不得出现 DOM / `Math.random` / `Date` / `performance`。
> 文件一览（全部在 `src/contracts/`，`index.ts` 为桶文件）：`grid.ts rotation.ts footprint.ts net.ts prng.ts state.ts clock.ts system.ts queries.ts actions.ts commands.ts events.ts catalogue.ts io.ts snapshot.ts dirty.ts render.ts host.ts assets.ts audio.ts strings.ts testkit.ts entrypoints.ts`。
> 终审修订（冻结前已并入正文）：① `CreateSimOptions.snapshot` 必填注入（§H）；② §V 模块入口 `entrypoints.ts`；③ `COMMAND_OWNER / MODAL_OWNER / NOT_IMPLEMENTED_RESULT` 与 `System.onModalAnswer`（§K / §H）；④ `OverlayId / ActorId / UiIconId`（§Q）；⑤ `mapOrigin` 与像素锚点约定（§Q）；⑥ `System.endOfDay` + `END_OF_DAY_IO`（§H / §G）；⑦ 删 `IndustryState.tax`；`CensusSnapshot.workforcePctUsed` 保留为只读副本并标 `hash:'none'`（§F；WP0 Reconcile 按正文与「不可协商项」裁定，原「删」字为笔误）；另为 v1 的灾害 / 报纸 / 桥补 `DisasterKind / DISASTER_MENU`（§A）、`NewsType`（§L）、`NewsQuery`（§I）、`ModalId 'newspaper'`（§K）、`TransportQuery.bridgeOptions / bridgePieces`（§I）。
> 规格引用写作 `spec:<file> §x.y`；本文只给接口与必要语义，数值与公式以规格为准。

---

## A. `grid.ts` —— 坐标、位标志、枚举

```ts
// ===== grid.ts =====（spec:file-formats §2.2.1、spec:power-water §1.1、spec:terrain §2.1）
export const MAP = 128, TILES = 16384, HALF_N = 4096, QUARTER_N = 1024, CORNER_SIZE = 129, MAX_ALT = 31;

/** 全仓库唯一的线性索引：x 主序，y 变化最快；与 .SC2 逐字节一致。禁止在任何模块自写 `* 128`。 */
export const tileIndex = (x: number, y: number): number => x * 128 + y;
export const tileX = (i: number): number => i >> 7;            // 不是 i % 128
export const tileY = (i: number): number => i & 127;
/** 64×64 半格图（XTRF XPLT XVAL XCRM）与 32×32 四分格图（XPLC XFIR XPOP XROG）的索引。 */
export const halfIndex = (x: number, y: number): number => (x >> 1) * 64 + (y >> 1);
export const quarterIndex = (x: number, y: number): number => (x >> 2) * 32 + (y >> 2);
export const halfOfTile = (i: number): number => halfIndex(tileX(i), tileY(i));
export const quarterOfTile = (i: number): number => quarterIndex(tileX(i), tileY(i));
export const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 128 && y < 128;

export const enum Dir { T = 0, R = 1, B = 2, L = 3 }           // T=−y R=+x B=+y L=−x（与 XBLD 片段命名一致）
export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];
export const opposite = (d: Dir): Dir => ((d + 2) & 3) as Dir;
export const dirBit = (d: Dir): number => 1 << d;              // T=1 R=2 B=4 L=8（spec:transport §2.1 掩码位序）
/** 4 邻；越界返回 −1。任何模块不得用 i±1±128 直接加减（x 边缘会绕到相邻列）。 */
export function neighbor(i: number, d: Dir): number {
  const x = tileX(i) + DX[d]!, y = tileY(i) + DY[d]!;
  return inMap(x, y) ? tileIndex(x, y) : -1;
}
export function neighborXY(i: number, dx: number, dy: number): number {
  const x = tileX(i) + dx, y = tileY(i) + dy;
  return inMap(x, y) ? tileIndex(x, y) : -1;
}
/** 电 / 水 BFS 的邻居顺序（spec:power-water §2.4）：索引增量 −1, −128, +1, +128。只允许重排，不许增删。 */
export const SCAN_NEIGHBORS: ReadonlyArray<readonly [dx: number, dy: number]> = [[0, -1], [-1, 0], [0, 1], [1, 0]];

/** XBIT 掩码值（bit0 = 最低位；社区文档的"bit 0"是最高位，一律按掩码）。 */
export const enum XBit { SaltWater = 0x01, Flipped = 0x02, Water = 0x04, Mark = 0x08, Watered = 0x10, Piped = 0x20, Powered = 0x40, Powerable = 0x80 }
/** XZON 高 4 位角标；1×1 写 All (0xF0)；多格建筑每格只置自己所在角，内部格 0。 */
export const enum Corner { BL = 0x10, BR = 0x20, TL = 0x40, TR = 0x80, All = 0xF0 }
export const ANCHOR_BIT = Corner.TL;                            // 全仓库唯一锚点约定（1×1 也含 TL）
export const ZONE_MASK = 0x0F;
export const enum ZoneCode { None = 0, LightR = 1, DenseR = 2, LightC = 3, DenseC = 4, LightI = 5, DenseI = 6, Military = 7, Airport = 8, Seaport = 9 }
export type ZoneType = 'R' | 'C' | 'I';
export const zoneTypeOf = (z: number): ZoneType | null => (z === 1 || z === 2 ? 'R' : z === 3 || z === 4 ? 'C' : z === 5 || z === 6 ? 'I' : null);
export const isDenseZone = (z: number): boolean => z === 2 || z === 4 || z === 6;
export const enum CityMode { TerrainEdit = 0, City = 1, Disaster = 2 }
/** XTER 高 nibble 类别（spec:terrain §2.5.1）。 */
export const enum XterClass { Dry = 0x00, Submerged = 0x10, Shore = 0x20, Surface = 0x30, Waterfall = 0x3e, Stream = 0x40 }
export const xterClassOf = (code: number): XterClass =>
  code === 0x3e ? XterClass.Waterfall : code >= 0x40 && code <= 0x45 ? XterClass.Stream : ((code & 0xf0) as XterClass);
/** XBLD ≥ 0x70 即"建筑格"（电 / 水消费者口径）。 */
export const DEVELOPED_FIRST = 0x70;
/** 运行时灾害标记（沿用 XTXT 字节值；运行时只存在于 events 的 marker 层，写档时才合成，spec:disasters §2.5.1）。 */
export const enum TileMarker { None = 0, ToxicCloud = 0xfb, Flood = 0xfc, Rioters = 0xfd, MassRioters = 0xfe, Fire = 0xff }
/** 灾害类型（MISC 0x0070 / SCEN 0x04 同一枚举，spec:disasters §2.1）：Command.requestDisaster.kind、SimEvent.disasterStarted.kind、DestroyCause 的数字分支、state.disaster.pending/current 都用它。 */
export const enum DisasterKind { None = 0, Fire, Flood, Riot, ToxicSpill, AirCrashLegacy, Earthquake, Tornado, Monster, Meltdown, Microwave, Volcano, Firestorm, MassRiots, MassFloods, Pollution, Hurricane, HelicopterCrash, PlaneCrash }
/** Disasters 菜单 8 项的顺序（UI 与 events 共用）。v1 实现 Fire / Flood / Tornado / Earthquake / Monster；其余项 requestDisaster 返回 notImplemented（UI 灰掉）。 */
export const DISASTER_MENU: readonly DisasterKind[] = [DisasterKind.Fire, DisasterKind.Flood, DisasterKind.PlaneCrash, DisasterKind.Tornado, DisasterKind.Earthquake, DisasterKind.Monster, DisasterKind.Hurricane, DisasterKind.Riot];
export const V1_DISASTERS: ReadonlySet<DisasterKind> = new Set([DisasterKind.Fire, DisasterKind.Flood, DisasterKind.Tornado, DisasterKind.Earthquake, DisasterKind.Monster]);
```

---

## B. `rotation.ts` —— 旋转置换（渲染 / 拾取 / 路网 / 预览唯一真源；terrain 模块 re-export）

```ts
// ===== rotation.ts =====（spec:terrain §2.5.4、spec:ui-art §3.3；由坐标变换 (x,y)→(y,127−x) 严格推出）
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

/**
 * XBLD 逆时针 1 次置换表（256 项，建筑 0x70–0xFF 除 0xC6↔0xC7 外不变）。由下列环在模块初始化时生成：
 *  网络族（基址 0x0E 电线 / 0x1D 道路 / 0x2C 铁路）偏移 k：直线 0↔1；坡 2→5→4→3→2；弯 6→9→8→7→6；三岔 10→13→12→11→10；十字 14 不变
 *  铁路半高 0x3B→0x3E→0x3D→0x3C→0x3B；隧道口 0x3F→0x42→0x41→0x40→0x3F；地铁↔铁路 0x6C→0x6F→0x6E→0x6D→0x6C
 *  交叉件对 0x43↔0x44 0x45↔0x46 0x47↔0x48 0x4B↔0x4C 0x4D↔0x4E 0x4F↔0x50
 *  高速 0x49↔0x4A；坡 0x61→0x64→0x63→0x62→0x61；弯 0x65→0x68→0x67→0x66→0x65；0x69 不变
 *  水电 0xC6↔0xC7；匝道 0x5D–0x60 与翻转族不在此表（见 rotateXbldFlip）
 */
export declare const XBLD_ROT_CCW: Uint8Array;
export function rotateXbld(id: number, r: Rotation): number { let c = id; for (let k = 0; k < r; k++) c = XBLD_ROT_CCW[c]!; return c; }
/** XUND 置换：地铁 0x01+k / 管线 0x10+k 与电线同偏移环；0x1F↔0x20；0x22 0x23 不变。 */
export declare const XUND_ROT_CCW: Uint8Array;
export function rotateXund(code: number, r: Rotation): number { let c = code; for (let k = 0; k < r; k++) c = XUND_ROT_CCW[c]!; return c; }

/** 用 XBit.Flipped 表示朝向的"翻转族"（spec:building-catalogue §2.3 / §2.8）：桥件、高架电线、加固桥、跑道、栈桥、起重机。 */
export const FLIP_FAMILY: ReadonlySet<number> = new Set([0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x5b, 0x5c, 0x6a, 0x6b, 0xdd, 0xdf, 0xe0]);
/** 显示翻转：每转 1 次取反（LR↔TB）；只对翻转族有意义；渲染器只读 XBIT，永不写。 */
export const drawFlip = (xbit: number, id: number, r: Rotation): boolean =>
  FLIP_FAMILY.has(id) && (((xbit & XBit.Flipped) !== 0) !== ((r & 1) === 1));

/** 匝道朝向元组（0x5D–0x60）；Flipped 置位 = 整体再转 90°。 */
export const ONRAMP_ORIENT: Readonly<Record<number, { hwy: Dir.T | Dir.B; road: Dir.L | Dir.R }>> = {
  0x5d: { hwy: Dir.T, road: Dir.L }, 0x5e: { hwy: Dir.T, road: Dir.R }, 0x5f: { hwy: Dir.B, road: Dir.L }, 0x60: { hwy: Dir.B, road: Dir.R } };
/** 通用入口：给出 (id, xbit, rotation) 应选的精灵 ID 与是否水平镜像。匝道走元组反查；翻转族走 drawFlip；其余走 rotateXbld。结果只用于选精灵，不写回 XBIT。 */
export declare function rotateXbldFlip(id: number, xbit: number, r: Rotation): { id: number; flip: boolean };

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
```

---

## C. `footprint.ts` —— 占地与锚点（无实例表）

```ts
// ===== footprint.ts =====（spec:building-catalogue §3.2 / §3.3）
import { Corner, tileIndex, tileX, tileY } from './grid';
export type Footprint = 1 | 2 | 3 | 4;
/**
 * FOOTPRINT[id] = 占地边长。2×2: 0x61–0x6B, 0x8C–0xAD, 0xEB–0xF7；3×3: 0xAE–0xC5, 0xD0–0xD6, 0xF8–0xFA；4×4: 0xC9–0xCF, 0xD7–0xDA, 0xFB–0xFF；其余 1（0x49/0x4A 高速直线段按 1 计）。
 * data/buildings.generated.ts 的 size 列用测试与此表对账，不得另写尺寸表。
 */
export declare const FOOTPRINT: Uint8Array;                     // 256
export interface AnchorLayers { xbld: Uint8Array; xzon: Uint8Array }
/** 占地 (ax,ay,s) 内每格 xbld 是否都等于 id（经 tileIndex 偏移，不用 i±128）。 */
export function lotIsUniform(l: AnchorLayers, ax: number, ay: number, s: number, id: number): boolean {
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) if (l.xbld[tileIndex(ax + dx, ay + dy)] !== id) return false;
  return true;
}
/** 格 → 世界 TL 锚格；xbld < 0x0E 返回 −1；1×1 返回自身；多格最多探测 16 次；损坏（找不到带 TL 位且占地一致的锚点）返回 −1，调用方按 1×1 处理并记诊断。 */
export function anchorOf(l: AnchorLayers, i: number): number {
  const id = l.xbld[i]!; if (id < 0x0e) return -1;
  const s = FOOTPRINT[id]!; if (s === 1) return i;
  const x = tileX(i), y = tileY(i);
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) {
    const ax = x - dx, ay = y - dy;
    if (ax < 0 || ay < 0 || ax + s > 128 || ay + s > 128) continue;
    const a = tileIndex(ax, ay);
    if (l.xbld[a] !== id || (l.xzon[a]! & Corner.TL) === 0) continue;
    if (lotIsUniform(l, ax, ay, s, id)) return a;
  }
  return -1;
}
/** 遍历占地：fn(i, dx, dy)，dx/dy 为相对锚格偏移（0..n−1）。 */
export function forEachLotTile(anchor: number, n: number, fn: (i: number, dx: number, dy: number) => void): void {
  const x0 = tileX(anchor), y0 = tileY(anchor);
  for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) fn(tileIndex(x0 + dx, y0 + dy), dx, dy);
}
/** 写 XZON 高 4 位用：1×1 → 0xF0；角格 TL/TR/BL/BR；内部与边中格 0。 */
export function cornerBits(n: number, dx: number, dy: number): number {
  if (n === 1) return Corner.All;
  const l = dx === 0, r = dx === n - 1, t = dy === 0, b = dy === n - 1;
  return (l && t ? Corner.TL : 0) | (r && t ? Corner.TR : 0) | (l && b ? Corner.BL : 0) | (r && b ? Corner.BR : 0);
}
export const isAnchorTile = (l: AnchorLayers, i: number): boolean => l.xbld[i]! >= 0x0e && (l.xzon[i]! & Corner.TL) !== 0;
```

---

## D. `net.ts` —— 网络族片段、瓦片集合、可达偏移

```ts
// ===== net.ts =====（spec:transport §2.1 / §2.3 / §2.11、spec:power-water §3.5）
import { Dir } from './grid';
/** 15 片段：idx → 连接掩码（bit0=T bit1=R bit2=B bit3=L）。0–5 直线（含 4 个坡面件），6–9 弯 BR BL TL TR，10–13 三岔，14 十字。 */
export const PIECE_MASK: readonly number[] = [0b1010, 0b0101, 0b0101, 0b1010, 0b0101, 0b1010, 0b0110, 0b1100, 0b1001, 0b0011, 0b0111, 0b1110, 0b1101, 0b1011, 0b1111];
/** 坡面件：XTER 0x01..0x04 → idx 2..5。 */
export const SLOPE_PIECE: Readonly<Record<number, number>> = { 0x01: 2, 0x02: 3, 0x03: 4, 0x04: 5 };
export const NET_BASE = { power: 0x0e, road: 0x1d, rail: 0x2c, subway: 0x01, pipe: 0x10 } as const;
export type NetFamily = keyof typeof NET_BASE;                  // 'highway' 不是族（2×2 块），见 commands.ts
/**
 * 平地选形：由 4 邻可连通掩码给出 idx。单方向视为沿该轴直线；掩码 0：电线 / 地铁 / 道路 / 铁路取 0 (L-R)，管线取 14 (十字，原版孤立管线为十字)。
 * 坡面格由调用方先查 SLOPE_PIECE 并要求直线沿坡向。
 */
export function pieceIndexFor(mask: number, family: NetFamily): number {
  if (mask === 0) return family === 'pipe' ? 14 : 0;
  if (mask === 0b0001 || mask === 0b0100) return 1;
  if (mask === 0b0010 || mask === 0b1000) return 0;
  for (let k = 0; k < 15; k++) if (k !== 2 && k !== 3 && k !== 4 && k !== 5 && PIECE_MASK[k] === mask) return k;
  return 0;
}
/** 瓦片类别位（按 XBLD 值预计算成 256 项表，spec:transport §2.3）。 */
export const enum NetFlag { Road = 1, Rail = 2, Highway = 4, Power = 8, Bridge = 16, Portal = 32, Onramp = 64, Station = 128 }
export declare const NET_FLAGS: Uint8Array;                     // 256；ROAD_SET = 0x1D–0x2B,0x3F–0x46,0x4B,0x4C,0x5D–0x60；RAIL_SET = 0x2C–0x3E,0x45–0x48,0x4D,0x4E,0x6C–0x6F；HIGHWAY_SET = 0x49–0x50,0x61–0x6B；BRIDGE_SET = 0x51–0x5C,0x6A,0x6B；PORTAL_SET = 0x3F–0x42；Onramp = 0x5D–0x60；Station = 0xE9,0xEC,0xED；Power = 0x0E–0x1C,0x43,0x44,0x47,0x48,0x4F,0x50,0x5C
export const isRoad = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Road) !== 0;
export const isRoadSurface = (id: number): boolean => isRoad(id) && !(id >= 0x5d && id <= 0x60);
export const isRail = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Rail) !== 0;
export const isHighway = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Highway) !== 0;
export const isBridge = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Bridge) !== 0;
export const isPortal = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Portal) !== 0;
export const isOnramp = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Onramp) !== 0;
export const isPowerCarrier = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Power) !== 0;
export const isStationTile = (id: number): boolean => (NET_FLAGS[id]! & NetFlag.Station) !== 0;
export const isTerminal = (id: number): boolean => id > 0xfa;   // 四种 Arco + 大穹顶：出行无条件目的地
export const isSubwayUnd = (u: number): boolean => (u >= 0x01 && u <= 0x0f) || u === 0x1f || u === 0x20 || u === 0x22 || u === 0x23;
export const isPipeUnd = (u: number): boolean => (u >= 0x10 && u <= 0x1e) || u === 0x1f || u === 0x20;
/** 24 偏移可达表，顺序即原版检查顺序（spec:transport §2.11）；关于原点对称，可用于反向脏标记。 */
export const ACCESS_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 0], [0, -1], [-1, 0], [0, 2], [2, 0], [0, -2], [-2, 0], [0, 3], [3, 0], [0, -3], [-3, 0],
  [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]];
export const enum StationKind { None = 0, Bus = 1, Rail = 2, Subway = 3, SubRail = 4 }
export const enum BridgeKind { Causeway = 0, Raising = 1, Suspension = 2, Rail = 3, HighwayLow = 4, HighwayReinforced = 5, Wire = 6 }
export { Dir };
```

---

## E. `prng.ts` —— 随机数契约（spec:economy §2.13）

```ts
// ===== prng.ts =====
/** 每个方法恰好消费一次 next32()（shuffle 消费 length−1 次）。 */
export interface Prng {
  next32(): number;                       // u32
  next15(): number;                       // next32() >>> 17
  int(n: number): number;                 // [0, n)；n ≤ 0 → 0
  range(lo: number, hi: number): number;  // 闭区间 [lo, hi]
  float(): number;                        // [0, 1) = next32() / 2^32
  bit(): boolean;
  pick<T>(a: readonly T[]): T;            // 空数组抛错
  shuffle<T>(a: T[]): void;               // Fisher–Yates 从末尾向前
  state(): number; seed(s: number): void;
}
/** 可选 cell：以外部对象的 state 字段为后备存储（core 用 state.clock 作为 cell，使 prngState 天然入快照）。 */
export declare function createPrng(seed: number, cell?: { prngState: number }): Prng;
export declare function hash32(...parts: (number | string)[]): number;          // FNV-1a 32，派生子种子
export declare function fnv1aBytes(h: number, bytes: ArrayLike<number>): number; // 累积器（hashState 用）
export declare function hashNoise(seed: number, x: number, y: number): number;  // [0,1) 无状态，art 用
export const FNV_OFFSET = 0x811c9dc5, FNV_PRIME = 0x01000193;
/** 固化测试向量：seed → 前 5 个 next32 与之后的 state（prng.test.ts）。 */
export const PRNG_TEST_VECTORS: ReadonlyArray<{ seed: number; next32: readonly number[]; state: number }> = [
  { seed: 0, next32: [0x4434b462, 0x00159c37, 0x39285b08, 0x256d8104, 0x77a2cbd4], state: 0x21d961c9 },
  { seed: 1, next32: [0xa087eaf3, 0x00b349c9, 0x8706c4eb, 0xfb2627fd, 0xf7e79d2b], state: 0x21d961ca },
  { seed: 12345, next32: [0xfacf78c5, 0x4e875100, 0x7bf4e2f2, 0xd1642650, 0x8269e5ca], state: 0x21d99202 }];
```

---

## F. `state.ts` —— 真源 `CityState`

```ts
// ===== state.ts =====
import type { CityMode } from './grid';
import type { SystemId } from './system';

export interface TileLayers {
  alt: Uint8Array; waterLevel: Uint8Array; tunnelLevels: Uint8Array;          // ALTM 拆位（16384）
  xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;   // 16384
  xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array;                        // 6400 / 1200 / 480
}
export interface DataMaps { xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array; xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array }
export interface Counts { tile: Int32Array; zone: Int32Array; military: Int32Array }   // 256 / 8 / 16（core 增量维护）

export type Speed = 1 | 2 | 3 | 4 | 5;                                         // Paused Turtle Llama Cheetah Swallow
export interface ClockState {
  age: number;              // MISC 0x0010，唯一真源
  foundedYear: number;      // MISC 0x000C
  speed: Speed;             // MISC 0x0FEC（不入哈希）
  mode: CityMode;           // MISC 0x0004
  modalPause: number;       // >0 不推进（不入哈希）
  phaseCursor: number;      // 当日已完成阶段数；.SC2 要求 0；快照可在挂起态保存
  accumMs: number;          // 真实时间余量（不入哈希）
  disasterTicks: number;    // 灾害模式 tick 计数（命令日志时间戳）
  prngState: number;        // sim 流状态（u32 按 i32 位模式存）；MISC 0x1058
}
export interface GameDate { year: number; month: number; day: number }
export const dateOf = (c: ClockState): GameDate => ({ year: c.foundedYear + Math.floor(c.age / 300), month: Math.floor((c.age % 300) / 25), day: c.age % 25 });
export const monthIndex = (age: number): number => Math.floor(age / 25);

export interface TaxRates { r: number; c: number; i: number }                  // 0..20
export interface Bond { rateRaw: number; issuedYear: number; issuedMonth: number }   // rateRaw = 百分比 × 10000
export const enum BudgetLine { Police = 0, Fire, Health, Schools, Colleges, Roads, Highways, Bridges, Rail, Subway, Tunnel }
export const BUDGET_LINE_COUNT = 11;
export const enum OrdinanceId { SalesTax = 0, IncomeTax, LegalizedGambling, ParkingFines, ProReading, AntiDrug, CprTraining, NeighborhoodWatch,
  EnergyConservation, NuclearFreeZone, HomelessShelter, PollutionControls, VolunteerFire, SmokingBan, FreeClinics, JuniorSports,
  TouristAdvertising, BusinessAdvertising, CityBeautification, AnnualCarnival }
export interface EconomyState {
  funds: number; difficulty: 1 | 2 | 3; taxRate: TaxRates; industryTax: Int32Array /*11*/; funding: Uint8Array /*11*/;
  ordinances: number /*20 位*/; bonds: Bond[] /*≤50*/; fedRateRaw: number; autoBudget: boolean;
  counters: { advertising: number; fame: number }; impeached: boolean; yearOpeningFunds: number;
}
/** zones 第 21 天定稿、economy 下月第 0 天消费的人口快照（含 arco 税基份额，spec:zones §2.7）。 */
export interface CensusSnapshot {
  res: number; com: number; ind: number; arcoPop: number; normalPop: number; citySize: number;
  taxableRes: number; taxableCom: number; taxableInd: number;
  /** census 阶段从 demographics.workforcePct 拷贝的只读副本（services 缺席 / 桩 / 值为 0 时 fallback 50）。唯一 owner 是 demographics.workforcePct（services，MISC 0x0044）；本字段在 SCALAR_FIELDS 标 hash:'none'，不导出 .SC2。 */
  workforcePctUsed: number;
  workforce: number; jobs: number; unemployedN: number; unemploymentPct: number;
  tiles: { res: number; com: number; ind: number; total: number };
}
export interface RciDemand { r: number; c: number; i: number }                 // −2000..2000
export type DemandCaps = RciDemand;
/** 没有 tax 字段：11 条产业税率的唯一真源是 economy.industryTax（setIndustryTax 写；zones 的 taxF_k 与 economy 的工业税都读它；MISC 0x016C+44.. 的 11 项由 economy.exportTo 写、importFrom 读）。 */
export interface IndustryState { ratio: Int32Array; demand: Int32Array; pollutionBonus: number }   // 11 / 11 / −1..2（zones 写 MISC 0x016C 的 ratio 与 0x016C+88.. 的 demand）
export interface NeighborCity { index: number; name: string; population: number; value: number; fame: number; edge: 0 | 1 | 2 | 3; connections: { road: number; rail: number; highway: number } }
export interface NationalEconomy { population: number; value: number; tax: number; trend: 0 | 1 | 2 }
export interface DemographicsState { cohorts: Int32Array /*60 = 20 × [count, eqSum, leSum]*/; workforcePct: number; workforceEQ: number; workforceLE: number }
export interface RewardState { progression: number; grantedMask: number; militaryBase: 0 | 1 | 2 | 3 | 4 | 5; prisonBonus: 0 | 1; oldArrests: number; stadiumTeams: number; mayorApproval: number }
export interface WeatherState { heat: number; wind: number; humid: number; trend: number; season: 0 | 1 | 2 | 3 }
export interface DisasterCore { pending: number; current: number; active: boolean; pointX: number; pointY: number; noDisasters: boolean; autoGoto: boolean; windOverride: number }   // windOverride −1 = 无
export interface TechState { invented: Int32Array /*17*/; announced: Uint8Array /*17*/ }
export interface PowerReport { generation: number; consumers: number; supplied: number; usagePct: number; unpoweredBuildingTiles: number }
export interface WaterReport { supply: number; consumers: number; watered: number; usagePct: number; towerCapacity: number; towerCharged: number; treatmentCapacity: number; treatmentSufficient: boolean; unwateredBuildingTiles: number }
export interface TrafficReport { total: number; graph: number; roadTiles: number; highwayTiles: number; bridgeTiles: number }
export interface DataMapTotals { pollution: number; landValue: number; crime: number; developedTiles: number; centerX: number; centerY: number }
export interface TerrainMeta { seaLevel: number; coast: boolean; river: boolean; rotation: 0 | 1 | 2 | 3 }
export interface ViewPersist { x: number; y: number; zoom: number }            // MISC 0x1018/0x101C/0x1014（不入哈希）

/** priv 值的类型白名单：安全整数 / 字符串 / 布尔 / 整数 TypedArray / 其数组与普通对象。编码器遇到其它类型抛错。 */
export type PrivTypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array;
export type PrivValue = number | string | boolean | PrivTypedArray | PrivValue[] | { [k: string]: PrivValue };
/** 每个系统私有持久态；v = 该系统 priv schema 版本（≥1）。只放不可由真源层重建的运行态。 */
export interface PrivState { v: number; [k: string]: PrivValue }

export interface CityState {
  readonly formatVersion: 2;
  cityName: string; mayorName: string;
  layers: TileLayers; maps: DataMaps; counts: Counts; xgrp: Int32Array /*832*/; rawMisc: Int32Array /*1200*/;
  clock: ClockState; terrain: TerrainMeta; economy: EconomyState;
  census: CensusSnapshot; demand: RciDemand; caps: DemandCaps; industry: IndustryState; neighbors: NeighborCity[] /*4*/; national: NationalEconomy;
  demographics: DemographicsState; rewards: RewardState; totals: DataMapTotals; traffic: TrafficReport;
  weather: WeatherState; disaster: DisasterCore; tech: TechState; utilities: { power: PowerReport; water: WaterReport };
  view: ViewPersist;
  priv: Partial<Record<Exclude<SystemId, 'core'>, PrivState>>;   // 进快照、进 hash('full')、不进 .SC2
}
/** 全零 / 空表分配；neighbors 固定 4 条、bonds 空数组、formatVersion 2。 */
export declare function createCityState(): CityState;
```

---

## G. `clock.ts` —— 日程、owner、I/O 声明、固定顺序

```ts
// ===== clock.ts =====（spec:economy §2.3 / §3.2；nationalAnnual 拆为 zones / economy 两个 PhaseId）
import type { Speed } from './state';
import type { SystemId } from './system';

export type PhaseId =
  | 'settleMonth' | 'closeYear' | 'techCheck' | 'nationalAnnual.zones' | 'nationalAnnual.economy' | 'neighborsAnnual'
  | 'approvalSurvey' | 'facilityAnnual' | 'utilitiesAnnual' | 'budgetWindow' | 'beginMonth'
  | 'powerScan' | 'dataMaps' | 'growthScan' | 'trafficDecay' | 'waterScan'
  | 'census' | 'demand' | 'demographics' | 'graphs' | 'milestones' | 'scenario' | 'solvency' | 'uiRefresh'
  | 'weatherAndDisaster' | 'cityStatus' | 'news';

export const DAY_PHASES: Readonly<Record<number, readonly PhaseId[]>> = {
  0: ['settleMonth', 'closeYear', 'techCheck', 'nationalAnnual.zones', 'nationalAnnual.economy', 'neighborsAnnual', 'approvalSurvey',
      'facilityAnnual', 'utilitiesAnnual', 'budgetWindow', 'beginMonth'],
  1: ['powerScan'], 2: ['dataMaps'],
  3: ['growthScan'], 4: ['growthScan'], 5: ['growthScan'], 6: ['growthScan'], 7: ['growthScan'], 8: ['growthScan'], 9: ['growthScan'], 10: ['growthScan'],
  11: ['growthScan'], 12: ['growthScan'], 13: ['growthScan'], 14: ['growthScan'], 15: ['growthScan'], 16: ['growthScan'], 17: ['growthScan'], 18: ['growthScan'],
  19: ['trafficDecay'], 20: ['waterScan'], 21: ['census', 'demand', 'demographics', 'graphs'],
  22: ['milestones', 'scenario', 'solvency'], 23: ['uiRefresh'], 24: ['weatherAndDisaster', 'cityStatus', 'news'] };

export const PHASE_OWNER: Readonly<Record<PhaseId, SystemId>> = {
  settleMonth: 'economy', closeYear: 'economy', techCheck: 'events', 'nationalAnnual.zones': 'zones', 'nationalAnnual.economy': 'economy',
  neighborsAnnual: 'zones', approvalSurvey: 'services', facilityAnnual: 'services', utilitiesAnnual: 'utilities', budgetWindow: 'economy', beginMonth: 'zones',
  powerScan: 'utilities', dataMaps: 'services', growthScan: 'core', trafficDecay: 'services', waterScan: 'utilities',
  census: 'zones', demand: 'zones', demographics: 'services', graphs: 'economy', milestones: 'services', scenario: 'economy', solvency: 'economy', uiRefresh: 'core',
  weatherAndDisaster: 'events', cityStatus: 'services', news: 'events' };

export type LayerName = 'XBLD' | 'XZON' | 'XUND' | 'XBIT.POWERED' | 'XBIT.WATERED' | 'XTRF' | 'XPLT' | 'XVAL' | 'XCRM' | 'XPLC' | 'XFIR' | 'XPOP' | 'XROG' | 'XMIC';
export interface PhaseIo { reads: readonly LayerName[]; bulk: readonly LayerName[]; point: readonly LayerName[]; usesPrng: boolean; canSuspend: boolean }
/** 静态 I/O 声明；dayPhases.test 断言：同日无两阶段 bulk 写同层、每层每月至多一个 bulk 写者、键集合 == PhaseId 全集。 */
export const PHASE_IO: Readonly<Record<PhaseId, PhaseIo>> = {
  settleMonth: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  closeYear: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  techCheck: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  'nationalAnnual.zones': { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  'nationalAnnual.economy': { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  neighborsAnnual: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  approvalSurvey: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  facilityAnnual: { reads: ['XMIC', 'XBLD'], bulk: ['XMIC'], point: ['XBLD'], usesPrng: true, canSuspend: false },
  utilitiesAnnual: { reads: ['XBLD'], bulk: [], point: ['XBLD'], usesPrng: true, canSuspend: false },
  budgetWindow: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  beginMonth: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  powerScan: { reads: ['XBLD', 'XUND', 'XBIT.POWERED'], bulk: ['XBIT.POWERED'], point: [], usesPrng: true, canSuspend: false },
  dataMaps: { reads: ['XBLD', 'XZON', 'XBIT.POWERED', 'XTRF', 'XPLT', 'XCRM', 'XPOP', 'XROG'], bulk: ['XPLT', 'XVAL', 'XPLC', 'XFIR', 'XPOP', 'XROG', 'XCRM'], point: [], usesPrng: false, canSuspend: false },
  growthScan: { reads: ['XBLD', 'XZON', 'XUND', 'XBIT.POWERED', 'XBIT.WATERED', 'XVAL', 'XCRM', 'XPLT'], bulk: [], point: ['XBLD', 'XZON', 'XTRF', 'XMIC'], usesPrng: true, canSuspend: false },
  trafficDecay: { reads: ['XTRF'], bulk: ['XTRF'], point: [], usesPrng: false, canSuspend: false },
  waterScan: { reads: ['XUND', 'XBIT.POWERED', 'XBIT.WATERED'], bulk: ['XBIT.WATERED'], point: [], usesPrng: false, canSuspend: false },
  census: { reads: ['XBLD', 'XZON', 'XMIC'], bulk: [], point: [], usesPrng: false, canSuspend: false },
  demand: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  demographics: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  graphs: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  milestones: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  scenario: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  solvency: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  uiRefresh: { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  weatherAndDisaster: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  cityStatus: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  news: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: true } };   // newspaper / extraPaper 模态可挂起

/**
 * System.endOfDay 的静态 I/O 声明：只有在此声明的系统才会被 core 在日末调用（按 SYSTEM_ORDER）。dayPhases.test 断言键 ⊆ SystemId、每层每月至多一个 bulk 写者的约束把本表算作"第 25 个槽"。
 *  utilities：flush requestRescan 置的脏标志 → 即时电 / 水重扫（消费 PRNG：风 / 太阳能抽样），layerChanged('xbit')；无脏标志时必须零 PRNG 消费。
 *  zones：逐日推进 lot 计时器（phaseDays / unpoweredDays）并执行到期转换；不消费 PRNG——到期转换需要的随机选择在 growthVisit 阶段预掷（startConstruction 时即 pickBuilding 存 pendingId），瓦砾 / 废弃精灵用 hash32(age, anchor) 派生。
 */
export const END_OF_DAY_IO: Readonly<Partial<Record<SystemId, PhaseIo>>> = {
  utilities: { reads: ['XBLD', 'XUND', 'XBIT.POWERED', 'XBIT.WATERED'], bulk: ['XBIT.POWERED', 'XBIT.WATERED'], point: [], usesPrng: true, canSuspend: false },
  zones: { reads: ['XBLD', 'XZON', 'XBIT.POWERED'], bulk: [], point: ['XBLD', 'XZON'], usesPrng: false, canSuspend: false } };

export const growthStep = (day: number): number => Math.floor((day - 3) / 4);   // 0..3 → x 偏移
export const growthSubstep = (day: number): number => (day + 1) % 4;            // 0..3 → y 偏移
/** 速度 → 每天毫秒；5 = 尽可能快（受 advance 预算与 maxDaysPerFrame 约束）。 */
export const MS_PER_DAY: Readonly<Record<Speed, number>> = { 1: Infinity, 2: 480, 3: 160, 4: 40, 5: 0 };
/** 灾害 tick 与常驻物件 tick 的节奏（spec:disasters §3.2）。 */
export const DISASTER_TICK_MS: Readonly<Record<Speed, number>> = { 1: Infinity, 2: 200, 3: 100, 4: 50, 5: 25 };
export const DEFAULT_BUDGET_MS = 6, MAX_DAYS_PER_FRAME = 10;

/** createSim 注册顺序（与传入顺序无关）；也是 priv 编码顺序。 */
export const SYSTEM_ORDER: readonly SystemId[] = ['core', 'terrain', 'placement', 'utilities', 'transport', 'zones', 'services', 'economy', 'events'];
/** 生长扫描每格回调顺序（spec:economy §2.3.3）。 */
export const GROWTH_VISIT_ORDER: readonly SystemId[] = ['transport', 'zones', 'services'];
/** .SC2 导入：importFrom 调用顺序（spec:file-formats §3.4.2 第 2–9b 步；events 在 services 之前剥离 XTXT 标记）。 */
export const IMPORT_ORDER: readonly SystemId[] = ['terrain', 'core', 'zones', 'events', 'transport', 'services', 'utilities', 'economy', 'placement'];
/** 任一读档路径后 postLoad 的调用顺序（utilities 的重扫先于 services 的 cityCenter / trafficReport）。 */
export const POSTLOAD_ORDER: readonly SystemId[] = ['utilities', 'services', 'transport', 'zones', 'events', 'economy', 'placement', 'terrain', 'core'];
/** .SC2 导出：exportTo 调用顺序（events 最后合成 XTXT 与写 XTHG）。 */
export const EXPORT_ORDER: readonly SystemId[] = ['core', 'terrain', 'zones', 'transport', 'services', 'utilities', 'economy', 'events'];

/** 阶段是否在当日生效（core 调用；不生效直接跳过、不消费 PRNG）。 */
export function phaseApplies(id: PhaseId, age: number, impeachMonthly: boolean): boolean {
  const m = Math.floor((age % 300) / 25);
  switch (id) {
    case 'settleMonth': return age > 0;
    case 'closeYear': case 'budgetWindow': return m === 0 && age > 0;
    case 'techCheck': case 'nationalAnnual.zones': case 'nationalAnnual.economy': case 'neighborsAnnual':
    case 'approvalSurvey': case 'facilityAnnual': case 'utilitiesAnnual': return m === 0;
    case 'solvency': return impeachMonthly;
    default: return true;
  }
}
```

---

## H. `system.ts` —— 系统接口与模拟上下文

```ts
// ===== system.ts =====
import type { CityState } from './state';
import type { Prng } from './prng';
import type { PhaseId } from './clock';
import type { Queries } from './queries';
import type { Actions } from './actions';
import type { Command, CommandResult, ModalId } from './commands';
import type { SimEvent } from './events';
import type { CatalogueApi } from './catalogue';
import type { Sc2Document } from './io';
import type { SnapshotCodec } from './snapshot';

export type SystemId = 'core' | 'terrain' | 'placement' | 'utilities' | 'zones' | 'transport' | 'services' | 'economy' | 'events';
export interface Diagnostic { level: 'info' | 'warn' | 'error'; code: string; message: string; at?: string }
/** 只读调参输入（与 state.priv 同样按 SystemId 键，但语义完全不同：tuning 是输入、不持久化、不入哈希）。 */
export type TuningBag = Readonly<Partial<Record<SystemId, object>>>;

export interface SimContext {
  readonly state: CityState;
  readonly prng: Prng;                        // 唯一 sim 流；后备存储 = state.clock.prngState
  readonly tuning: TuningBag;
  readonly catalogue: CatalogueApi;           // 与 SimHost.catalogue 为同一对象
  readonly day: number;                       // 0..24；灾害 / 物件 tick 与命令处理中为 −1
  readonly events: SimEvent[];                // 当帧事件缓冲，app drain
  readonly diag: Diagnostic[];
  readonly q: Queries;
  readonly act: Actions;
}
/** 浅合并：ctx.tuning[id] 覆盖 defaults；结果按 id 缓存于 ctx。契约不认识任何模块的 Tuning 类型。 */
export declare function getTuning<T extends object>(ctx: SimContext, id: SystemId, defaults: T): T;

export type PhaseResult = 'done' | 'suspend';
export type PhaseRunner = (ctx: SimContext, day: number) => PhaseResult;
export type CommandHandler<C extends Command = Command> = (ctx: SimContext, cmd: C) => CommandResult;
export type PostLoadSource = 'snapshot' | 'sc2';

export interface NewCityParams {
  name: string; mayor?: string; difficulty: 1 | 2 | 3; startYear: 1900 | 1950 | 2000 | 2050;
  seed: number;                               // sim 流种子
  terrainSeed: number;                        // terrain 流种子（与 sim 流无关）
  terrain: { coast: boolean; river: boolean; hills: number; water: number; trees: number };   // 0..47
}

/** 每个系统实现一个；app/wire.ts 把它们交给 createSim（按 SYSTEM_ORDER 排序，与传入顺序无关）。全部方法同步、无 I/O。 */
export interface System {
  readonly id: SystemId;
  readonly stub?: true;                                            // 桩系统标记；createSim 对 allowlist 之外的桩抛错
  readonly privVersion?: number;                                   // 声明 priv 的系统必填（≥1）；与 state.priv[id].v 比较
  readonly phases?: Partial<Record<PhaseId, PhaseRunner>>;        // 必须 ⊆ PHASE_OWNER 中标为本系统者
  growthVisit?(ctx: SimContext, x: number, y: number): void;      // core 按 GROWTH_VISIT_ORDER 调用（仅 transport / zones / services）
  disasterTick?(ctx: SimContext): void;                            // 灾害模式 tick（events）
  thingsTick?(ctx: SimContext): void;                              // 常驻物件 tick（events；两种模式都调；v1 只在此消费 disaster.pending → 启动灾害）
  /**
   * 日末钩子：core 在当日全部阶段完成（phaseCursor 归零）后、age++ 之前，按 SYSTEM_ORDER 调用 END_OF_DAY_IO 中声明了的系统；当日挂起时不调用，modalClosed() 续跑完剩余阶段后再调用（每天恰一次）。
   * utilities 在此 flush requestRescan 置的脏标志（电 / 水即时重扫，消费 PRNG）；zones 在此逐日推进 lot 计时器（不消费 PRNG）。determinism.test 把它纳入重放。
   */
  endOfDay?(ctx: SimContext): void;
  /** 模态回答：core 的 modalAnswer 处理者按 MODAL_OWNER[dialog] 转发到 systems[owner].onModalAnswer?.(ctx, dialog, answer)；owner 未实现时 core 记 diag 并忽略。 */
  onModalAnswer?(ctx: SimContext, dialog: ModalId, answer: number): void;
  readonly commands?: { [K in Command['type']]?: CommandHandler<Extract<Command, { type: K }>> };   // 键集合必须恰为 COMMAND_OWNER 归本系统者：越权注册 createSim 抛错，真系统缺一则 registry.test 失败
  readonly queries?: Partial<Queries>;                             // 只能填自己的键
  readonly actions?: Partial<Actions>;                             // 只能填 ACTION_OWNER 归自己的键
  init(ctx: SimContext, p: NewCityParams): void;                   // 新城（按 SYSTEM_ORDER 调用）
  importFrom?(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void;   // 读 .SC2（按 IMPORT_ORDER；快照不经此）
  exportTo?(ctx: SimContext, doc: Sc2Document): void;              // 写 .SC2（按 EXPORT_ORDER）
  /** 任一读档后重建闭包缓存（按 POSTLOAD_ORDER）。source='sc2' 允许不消费 PRNG 的电 / 水重扫与从真源推断 priv；source='snapshot' 不得重扫、不得消费 PRNG、不得改真源层。 */
  postLoad?(ctx: SimContext, source: PostLoadSource): void;
  onTilesChanged?(ctx: SimContext, tiles: ReadonlyArray<number>, kind: TileChangeKind): void;   // 阶段 / 命令末批量扇出
}
export type TileChangeKind = 'terrain' | 'building' | 'zone' | 'underground' | 'bit';

/** 桩：无阶段、无命令；queries / actions 取 app/stubs 的 'realistic' 桩（测试可换乐观 / 悲观）。stub: true。 */
export declare function nullSystem(id: SystemId, profile?: 'realistic' | 'optimistic' | 'pessimistic'): System;

export interface CreateSimOptions {
  systems: readonly System[];
  catalogue: CatalogueApi;
  /**
   * 必填：快照编解码器（io/snapshot/index.ts 的 snapshotCodec）。sim/** 禁止 import io/**（ARCHITECTURE §2.2），所以由调用方注入：app/wire.ts、testkit.createTestContext、replay 的调用方。
   * SimHost.saveSnapshot / loadSnapshot / hash(scope) 与 testkit.hashOf 都经它实现；core 自身不持有第二套编码器。
   */
  snapshot: SnapshotCodec;
  tuning?: TuningBag;
  stubAllowlist: readonly SystemId[];       // 允许为桩的系统；其它桩 → 抛错（打标 v1-playable 时为 []）
  impeachMonthly?: boolean;                 // phaseApplies('solvency')
}
```

（续 §I 起：`queries / actions / commands / events / catalogue / io / snapshot / dirty / render / host / assets / audio / strings / testkit` 与契约变更协议。）

---

## I. `queries.ts` —— 跨系统只读查询（实现者 = owner；缺席时由桩提供）

```ts
// ===== queries.ts =====
import type { ZoneCode, XterClass } from './grid';
import type { NetFamily, StationKind, BridgeKind } from './net';
import type { BudgetLine, OrdinanceId, PowerReport, WaterReport, TrafficReport, TaxRates, Bond, WeatherState } from './state';
import type { TechKey, ToolId } from './catalogue';
import type { Command, RejectReason, PlacementPreview } from './commands';

export interface TerrainQuery {                                   // owner: terrain
  alt(i: number): number; slope(i: number): number;               // slope: xter & 0x0F（0x3E → 13，0x4X → 0）
  xterClass(i: number): XterClass;
  isWater(i: number): boolean; isSalt(i: number): boolean; isFlatDry(i: number): boolean;
  waterDepth(i: number): number;                                  // waterLevel − alt（无水 0）
  treeDensity(i: number): number;                                 // 0..7
  cornerHeights(i: number): [number, number, number, number];    // c00 c10 c01 c11
  distanceToWater(i: number): number;                             // Chebyshev，上限 8
  altitudeFeet(i: number): number;                                // alt*100+50
}
export interface PlantInfo { kind: string; anchor: number; ageYears: number; loadPct: number; nominalMW: number; expires: boolean }
export interface UtilityQuery {                                   // owner: utilities
  poweredSelf(i: number): boolean;                                // XBIT.POWERED(i)（断电计时用）
  hasPower(i: number): boolean;                                   // POWERED(i) || 任一 4 邻 POWERED（生长判定用）
  watered(i: number): boolean; piped(i: number): boolean;
  plantAt(i: number): PlantInfo | null;
  lastPower(): PowerReport; lastWater(): WaterReport;
}
export interface TripResult { ok: boolean; usedBus: boolean; usedRail: boolean; usedSubway: boolean; steps: number }
export interface StationInfo { kind: StationKind; id: number; anchor: number; n: 1 | 2 }
export interface TransportQuery {                                 // owner: transport
  hasAccess(x: number, y: number): boolean;                       // 24 偏移命中 ROAD_SET 或车站占地任一格
  /** 消费 PRNG、成功时经 act.addTraffic 写 XTRF；每格每月只许调用一次（zones 保证）。 */
  runTrip(i: number, zone: ZoneCode, popLevel: 0 | 1 | 2 | 3 | 4): TripResult;
  /**
   * 给出 (family, i) 在当前四邻与坡面下应写入的 XBLD/XUND 值（含交叉件）；非法（坡面不沿轴、非直角重叠）→ −1。
   * 桩默认：NET_BASE[family] + pieceIndexFor(四邻同族掩码)，不处理坡面与交叉件。
   */
  pieceFor(family: NetFamily, i: number): number;
  roadDistance(x: number, y: number): number;                     // 仅 UI：Chebyshev 距最近 ROAD_SET，>3 返回 4
  roadTileCounts(): { roadTiles: number; highwayTiles: number; bridgeTiles: number };
  connections(): { commerce: number; industry: number; total: number };
  stationAt(i: number): StationInfo | null;
  bridgeBlocksShips(i: number): boolean;
  /**
   * 桥型菜单与片段序列（spec:transport §2.6；n = 水面格数；纯函数、不消费 PRNG）。
   * options = 本族"长度表允许 ∩ 已实现"的桥型：道路长度表 n<5 仅 Causeway；5–6 +Raising；7–12 三种；>12 Causeway+Suspension；铁路 [Rail]；电线 [Wire]；高速 [HighwayLow, HighwayReinforced]。
   * v1 已实现 Causeway（0x58/0x57 交替）、Rail（0x5B/0x5A 交替）、Wire（0x5C）；Raising / Suspension / 高速两种 v2（v1 的 options 不列出、pieces 返回 null）。
   * pieces 返回沿行进方向的 XBLD 序列（长度 n；高速按 2×2 块给块序列）；placement 据此整段写入并按 n × 基价计费。桩：options 同 v1 集合，pieces 只给三者。
   */
  bridgeOptions(family: NetFamily | 'highway', n: number): readonly BridgeKind[];
  bridgePieces(kind: BridgeKind, family: NetFamily | 'highway', n: number): readonly number[] | null;
  railMask(i: number): number; subwayMask(i: number): number;     // T R B L 四位
  trafficAt(x: number, y: number): number;                        // 只读 XTRF 半格
}
export interface LotInfo { anchor: number; size: 1 | 2 | 3; level: 0 | 1 | 2 | 3 | 4; tier: 0 | 1 | 2; phase: 'construct' | 'built' | 'abandoned' }
export interface ZonesQuery {                                     // owner: zones
  lotAt(i: number): LotInfo | null;
  recreation(): { smallPark: number; bigPark: number; marina: number; zoo: number; stadium: number };
}
export interface QueryStat { key: string; value: string | number }   // key 为 strings 表键，UI 翻译
export interface MicrosimInfo { slot: number; tileId: number; stat0: number; stat1: number; stat2: number; stat3: number }
export interface ServicesQuery {                                  // owner: services
  structureCounts(): { police: number; prison: number; fire: number; hospital: number; school: number; college: number; busDepot: number };
  graphCurrent(s: 'pollution' | 'landValue' | 'crime'): number;
  cityCenter(): { x: number; y: number };
  landValue(i: number): number; pollution(i: number): number; crime(i: number): number;   // 半格值 0..255（渲染热力与 zones 用）
  microsimOf(i: number): MicrosimInfo | null;
  queryStats(i: number): ReadonlyArray<QueryStat>;
  seaportCranes(): number; airportRunwayGroups(): number; airportTiles(): number;
  trafficReport(): TrafficReport;
}
export interface BudgetRow { key: string; ytd: number; estimate: number; slider?: { value: number; min: number; max: number } }
export interface BudgetView { rows: BudgetRow[]; taxRate: TaxRates; funding: Uint8Array; autoBudget: boolean; funds: number; openingFunds: number; endOfYearFunds: number; advisors: ReadonlyArray<{ advisor: string; key: string }> }
export interface BondView { bonds: ReadonlyArray<Bond & { ratePctFloor: number; annual: number }>; count: number; avgRatePctFloor: number; sumRatePctFloor: number; nextRatePctFloor: number | null; rating: string; cityValueDollars: number; canIssue: boolean; canRepay: boolean }
export interface EconomyQuery {                                   // owner: economy
  canAfford(cost: number): boolean; funding(line: BudgetLine): number; ordinance(id: OrdinanceId): boolean; year(): number;
  budgetView(): BudgetView; bondView(): BondView;                 // 纯函数，不消费 PRNG（债券利率预览 jitter = 0）
  costOf(tool: ToolId, units: number): number;
}
export interface TechQuery { invented(key: TechKey): boolean }    // owner: events（桩：year >= TECH_BASE_YEAR[key] + 10）
export interface ThingView { slot: number; type: number; x: number; y: number; z: number; px: number; py: number; dir: number; variant: number; air: boolean }
export interface DisasterQuery {                                  // owner: events
  marker(i: number): number;                                      // TileMarker
  markers(): Readonly<Uint8Array>;                                // 16384 只读视图（渲染全量编译用；桩返回全零）
  focusPoints(): ReadonlyArray<{ x: number; y: number }>;
  thingsAt(i: number): ReadonlyArray<ThingView>; things(): ReadonlyArray<ThingView>;
  dispatchAvailable(kind: 0 | 1 | 2): number;
}
export interface NewsStoryView { type: number /*NewsType*/; value: number; power: number; monthIndex: number }
/** 一份报纸的版面数据：UI 按 strings 键 `news.<NewsType>.headline` / `.body` 渲染（WP0 预置 ≤ 20 条原创骨架），extra = 号外。 */
export interface PaperView { year: number; month: number; extra: boolean; headline: NewsStoryView | null; stories: ReadonlyArray<NewsStoryView>; weather: WeatherState }
export interface NewsQuery {                                      // owner: events（桩：currentPaper → null，stories → []）
  currentPaper(): PaperView | null;                               // 最近一次 paper 事件对应的版面；UI 打开 Newspaper 窗口 / newspaper·extraPaper 模态时读取
  stories(): ReadonlyArray<NewsStoryView>;                        // 当前事件池（按 power 降序）
}
export interface PlaceCheck { ok: boolean; reason?: RejectReason; cost: number }
export interface Availability { enabled: boolean; reason?: RejectReason }
export interface PlacementQuery {                                 // owner: placement
  canPlace(id: number, x: number, y: number): PlaceCheck;
  availability(toolId: ToolId): Availability;                     // 顺序：notImplemented → notInvented → ordinance → locked → funds
  preview(cmd: Command): PlacementPreview;                        // 纯函数，不消费 PRNG，不写状态
}
export interface Queries {
  terrain: TerrainQuery; utilities: UtilityQuery; transport: TransportQuery; zones: ZonesQuery; services: ServicesQuery;
  economy: EconomyQuery; tech: TechQuery; disasters: DisasterQuery; news: NewsQuery; placement: PlacementQuery;   // tech / disasters / news 三键同归 events
}
```

---

## J. `actions.ts` —— 跨系统写（每键一个 owner）

```ts
// ===== actions.ts =====
import type { SimEvent } from './events';
import type { SystemId } from './system';
import type { BulkLayer } from './dirty';
export type DestroyCause = number /*DisasterKind*/ | 'PLANT_EOL' | 'BRIDGE' | 'DECAY' | 'LAUNCH' | 'BULLDOZE';
export interface Actions {
  // core（TileWriter）：增量更新 counts、dirty.mark、阶段末 onTilesChanged 扇出
  setXbld(i: number, id: number): void; setXzon(i: number, v: number): void; setXund(i: number, v: number): void;
  setXbit(i: number, mask: number, on: boolean): void;
  setTerrain(i: number, alt: number, xter: number, waterLevel: number): void;
  layerChanged(layer: BulkLayer): void;                            // 整层重建后一次调用
  emit(ev: SimEvent): void;
  // economy
  charge(cost: number): boolean;                                   // 资金不足返回 false 并 emit insufficientFunds；cost ≤ 0 恒 true
  // events（桩：整栋 → 瓦砾 0x01..0x04 + 角标清 + 分区保留；news 空操作）
  destroyStructure(x: number, y: number, cause: DestroyCause): void; news(type: number, value: number): void;
  // services
  addTraffic(tile: number, weight: number): void; allocMicrosim(tileId: number): number /*slot 或 −1*/; freeMicrosim(slot: number): void;
  // utilities（桩：空操作）
  requestRescan(kind: 'power' | 'water'): void;
  // transport（桩：空操作）
  markAccessDirty(tiles: ReadonlyArray<number>): void;
}
export const ACTION_OWNER: Readonly<Record<keyof Actions, SystemId>> = {
  setXbld: 'core', setXzon: 'core', setXund: 'core', setXbit: 'core', setTerrain: 'core', layerChanged: 'core', emit: 'core',
  charge: 'economy', destroyStructure: 'events', news: 'events', addTraffic: 'services', allocMicrosim: 'services', freeMicrosim: 'services',
  requestRescan: 'utilities', markAccessDirty: 'transport' };
```

---

## K. `commands.ts` —— 命令、拒绝原因、模态

```ts
// ===== commands.ts =====
import type { ZoneCode } from './grid';
import type { NetFamily } from './net';
import type { Speed, TaxRates, BudgetLine, OrdinanceId } from './state';
import type { ToolId } from './catalogue';
import type { SystemId } from './system';

export type RejectReason =
  | 'funds' | 'occupied' | 'slope' | 'water' | 'needWaterfall' | 'outOfBounds' | 'zoned' | 'notInvented' | 'locked' | 'alreadyBuilt'
  | 'ordinance' | 'adjacency' | 'nimby' | 'microsimFull' | 'waterCells' | 'terrain' | 'obstructed' | 'mode' | 'limit' | 'noTarget'
  | 'needsBridge' | 'tooHigh' | 'tooLow' | 'tooLong' | 'notImplemented' | 'cancelled';
/** 模态对话框标识：阶段挂起型（budget militaryOffer scenarioBrief scenarioResult gameOver newspaper extraPaper disasterAlert rewardOffer）由 SimEvent 'modal' 打开；命令结果型（bridgeType teamPick neighborConnect）由 CommandResult.modal 打开；importAssets 为纯 UI 模态。newspaper = 4 月 / 8 月订阅版，extraPaper = 号外（UI 用同一 Newspaper 组件）。 */
export type ModalId = 'budget' | 'militaryOffer' | 'disasterAlert' | 'scenarioBrief' | 'scenarioResult' | 'gameOver' | 'newspaper' | 'extraPaper' | 'rewardOffer'
  | 'bridgeType' | 'teamPick' | 'neighborConnect' | 'importAssets';

export type Command =
  | { type: 'placeBuilding'; id: number; x: number; y: number }                 // (x,y) = 占地 TL 锚格；体育场成功后 modal teamPick
  | { type: 'zoneRect'; zone: ZoneCode; x0: number; y0: number; x1: number; y1: number }   // 不合格格跳过并按实际格数计费
  | { type: 'dezone'; tiles: number[] } | { type: 'bulldoze'; tiles: number[] }
  | { type: 'terrainTool'; tool: 'raise' | 'lower' | 'level' | 'water' | 'trees' | 'forest' | 'stream' | 'stretch' | 'seaLevel'; path: number[]; arg?: number }
  /**
   * 线性网络：from/to 为格索引，沿位移大的轴约束成直线。kind='highway' 时 from/to 先吸附到偶数 2×2 块（x0 = tileX & ~1，y0 = tileY & ~1），
   * 按块步进；preview 返回全部块格。遇水且未给 bridge → { ok:false, reason:'needsBridge', modal:{ id:'bridgeType', payload:{ from, to, length, options:BridgeKind[] } } }，
   * UI 带 bridge 重新派发。到达边缘格且构成连接 → 正常放置并返回 modal neighborConnect，UI 再派发 neighborConnection。
   */
  | { type: 'network'; kind: NetFamily | 'highway'; from: number; to: number; bridge?: number }
  | { type: 'tunnel'; at: number } | { type: 'neighborConnection'; at: number; accept: boolean }
  | { type: 'setTax'; rates: TaxRates } | { type: 'setIndustryTax'; k: number; rate: number }
  | { type: 'setFunding'; line: BudgetLine; pct: number } | { type: 'setOrdinance'; id: OrdinanceId; on: boolean }
  | { type: 'issueBond' } | { type: 'repayBond' }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'setOption'; key: 'autoBudget' | 'autoGoto' | 'noDisasters' | 'sound' | 'music' | 'paperDelivery' | 'extraPaper'; value: boolean }
  | { type: 'requestDisaster'; kind: number /*DisasterKind；不在 DISASTER_MENU 或 v1 未实现 → notImplemented*/; x?: number; y?: number } | { type: 'dispatch'; kind: 0 | 1 | 2 /*警 / 消 / 军*/; x: number; y: number }
  | { type: 'sign'; at: number; text: string | null } | { type: 'rename'; slot: number; text: string }
  | { type: 'cheat'; code: string } | { type: 'terrainDone' }
  | { type: 'setView'; x: number; y: number; zoom: number; rotation: 0 | 1 | 2 | 3 }       // 只写 view/terrain.rotation（不入哈希）
  | { type: 'modalAnswer'; dialog: ModalId; answer: number };                               // 挂起期间允许派发
export interface CommandResult { ok: boolean; cost: number; reason?: RejectReason; changed: readonly number[]; modal?: { id: ModalId; payload: unknown } }
export interface PlacementPreview { ok: boolean; cost: number; tiles: ReadonlyArray<{ i: number; ok: boolean; reason?: RejectReason }>; footprint?: { x0: number; y0: number; size: number }; reason?: RejectReason }
/** 命令日志条目：phaseCursor = 派发时 clock.phaseCursor（0 = 两天之间；>0 = 挂起期间），重放据此在同一阶段重新挂起。 */
export interface LoggedCommand { age: number; phaseCursor: number; seq: number; cmd: Command }

/**
 * 每种命令唯一处理者（registry.test：键集合 == Command['type'] 全集；每个真系统的 commands 键集合 == 归自己的集合；createSim 对越权注册抛错）。
 *  core 的四条：setSpeed 写 clock.speed；setView 写 view / terrain.rotation（不入哈希）；terrainDone 把 clock.mode TerrainEdit → City 并 emit modeChanged；modalAnswer 按 MODAL_OWNER 转发 onModalAnswer。
 *  economy 的 cheat：资金类直接处理；带灾害副作用的码（如起火）只写 state.disaster.pending = DisasterKind.Fire，由 events 的状态机（thingsTick / requestDisaster 同一入口）启动。
 */
export const COMMAND_OWNER: Readonly<Record<Command['type'], SystemId>> = {
  setSpeed: 'core', setView: 'core', terrainDone: 'core', modalAnswer: 'core',
  terrainTool: 'terrain',
  placeBuilding: 'placement', zoneRect: 'placement', dezone: 'placement', bulldoze: 'placement', network: 'placement', tunnel: 'placement', neighborConnection: 'placement',
  sign: 'services', rename: 'services',
  setTax: 'economy', setIndustryTax: 'economy', setFunding: 'economy', setOrdinance: 'economy', issueBond: 'economy', repayBond: 'economy', setOption: 'economy', cheat: 'economy',
  requestDisaster: 'events', dispatch: 'events' };
/** 模态回答的归属：core 的 modalAnswer 处理者执行 systems[MODAL_OWNER[dialog]].onModalAnswer?.(ctx, dialog, answer)。bridgeType / neighborConnect 由 UI 重发命令（network+bridge / neighborConnection）而非 modalAnswer，列入只为覆盖全集；importAssets 纯 UI，core 忽略。 */
export const MODAL_OWNER: Readonly<Record<ModalId, SystemId>> = {
  budget: 'economy', scenarioBrief: 'economy', scenarioResult: 'economy', gameOver: 'economy',
  militaryOffer: 'services', rewardOffer: 'services',
  disasterAlert: 'events', newspaper: 'events', extraPaper: 'events',
  bridgeType: 'placement', teamPick: 'placement', neighborConnect: 'placement',
  importAssets: 'core' };
/** 无处理者（COMMAND_OWNER[type] 缺席 / 为桩 / 未实现该命令）时 host.dispatch 的固定返回值：不写 commandLog、不消费 PRNG、不 emit。UI 用 rejectKey('notImplemented') 文案。 */
export const NOT_IMPLEMENTED_RESULT: CommandResult = { ok: false, cost: 0, reason: 'notImplemented', changed: [] };
export type ToolMode = 'Click' | 'Paint' | 'Line' | 'Rect' | 'Place' | 'Query' | 'Sign' | 'Center' | 'Help' | 'Dispatch';
```

---

## L. `events.ts` —— sim → 外界（全部可 JSON 化）

```ts
// ===== events.ts =====
import type { CityMode } from './grid';
import type { BudgetLine, OrdinanceId, WeatherState } from './state';
import type { DestroyCause } from './actions';
import type { ModalId } from './commands';
import type { SoundId } from './audio';
export type SimEvent =
  // 时钟 / UI 节拍
  | { type: 'dayTick'; age: number } | { type: 'monthTick'; year: number; month: number } | { type: 'yearClosed'; year: number } | { type: 'uiRefresh' }
  | { type: 'modal'; id: ModalId; payload: unknown }                     // 阶段已挂起（core 已 modalPause++）；UI 关闭后 host.modalClosed()
  | { type: 'goto'; x: number; y: number; smooth: boolean }              // autoGoto / 事件居中
  | { type: 'sound'; id: SoundId }
  | { type: 'actor'; op: 'spawn' | 'move' | 'remove'; slot: number }     // 渲染据此从 q.disasters.things() 读位置
  | { type: 'toolbar'; reason: 'tech' | 'reward' | 'ordinance' | 'funds' | 'mode' }   // 可用性需刷新
  | { type: 'message'; key: string; args?: Record<string, string | number>; level: 'info' | 'reject' | 'alert' }
  | { type: 'complaint'; key: string | null }                            // 状态栏第二行诉求（services cityStatus）
  // 经济
  | { type: 'monthSettled'; funds: number; net: number } | { type: 'budgetWindow' }
  | { type: 'insufficientFunds'; cost: number } | { type: 'bondIssued'; rateRaw: number } | { type: 'bondRepaid' } | { type: 'bondRefused'; reason: 'max' | 'rating' }
  | { type: 'fedRate'; direction: 'up' | 'down'; rateRaw: number } | { type: 'ordinance'; id: OrdinanceId; enacted: boolean }
  | { type: 'underfunded'; line: BudgetLine } | { type: 'taxGripe'; rate: number; severe: boolean } | { type: 'impeached'; funds: number }
  // 电 / 水
  | { type: 'brownout'; unpowered: number } | { type: 'waterShortage'; unwatered: number } | { type: 'needPower' } | { type: 'needWater' }
  | { type: 'plantAging'; anchor: number } | { type: 'plantExpired'; anchor: number } | { type: 'plantAutoRebuilt'; anchor: number; cost: number }
  // 服务 / 分区
  | { type: 'citizenDemand'; key: string } | { type: 'milestone'; progression: number } | { type: 'reward'; bit: number } | { type: 'militaryOffer' }
  | { type: 'approval'; pct: number; gripes: number[] } | { type: 'fundEducation' } | { type: 'fundPrison' } | { type: 'arcoExodus'; count: number }
  // 事件 / 灾害 / 科技 / 报纸 / 物件
  | { type: 'weatherChanged'; weather: WeatherState } | { type: 'disasterStarted'; kind: number; x: number; y: number } | { type: 'disasterEnded'; kind: number; deaths: number }
  | { type: 'structureDestroyed'; x: number; y: number; oldId: number; cause: DestroyCause } | { type: 'explosion'; x: number; y: number }
  | { type: 'techInvented'; slot: number } | { type: 'newsStory'; storyType: number /*NewsType*/; value: number } | { type: 'paper'; extra: boolean }   // paper：版面经 q.news.currentPaper() 读取；订阅 / 号外选项关闭时只发事件不挂起
  | { type: 'thingSpawned'; slot: number; thingType: number } | { type: 'thingRemoved'; slot: number; reason: string } | { type: 'helicopterReport'; x: number; y: number; level: number }
  | { type: 'bridgeCollapse'; x: number; y: number } | { type: 'connectionOffer'; at: number }
  | { type: 'scenario'; result: 'won' | 'lost' } | { type: 'modeChanged'; mode: CityMode };
/** 报纸事件类型（spec:disasters §2.10.2 的 67 种，数值 = 表中 #）。Actions.news(type, value)、SimEvent newsStory.storyType、NewsStoryView.type 与 strings 键 news.<NewsType> 都用它；v1 必含子集见 WORKPLAN WP13。 */
export const enum NewsType {
  Weather = 0, Junk, Founding, Growth, Invention, Innovation, War, Market, Sports, FedRateUp, FedRateDown, Politics, Diplomacy, Disaster, Medical, Upbeat,
  HighCrime, HighTraffic, HighPollution, PoorEducation, PoorHealth, PoorEmployment,
  DisasterFire, DisasterFlood, DisasterPlaneCrash, DisasterHelicopterCrash, DisasterTornado, DisasterEarthquake, DisasterMonster, DisasterMeltdown, DisasterMicrowave, DisasterVolcano,
  DisasterPollution, DisasterChemicalSpill, DisasterHurricane, DisasterRiot,
  PowerPlantEol, OvercrowdedPrisons, AngryTeachers, BridgeCollapse, AngryBulldozer, Ordinance, OpinionGuest, OpinionEditor, Survey, AdviceColumn,
  DemandPower, DemandTransit, DemandPolice, DemandFire, DemandWater, DemandHospital, DemandSchool, DemandSeaport, DemandAirport, DemandZoo, DemandStadium, DemandMarina, DemandPark,
  DemandIndustrialConnection, DemandCommercialConnection, LowCrime, LowTraffic, LowPollution, GoodEducation, GoodHealth, GoodEmployment }
export const NEWS_TYPE_COUNT = 67;
export interface EventBus {
  on<K extends SimEvent['type']>(type: K, fn: (e: Extract<SimEvent, { type: K }>) => void): () => void;
  publish(e: SimEvent): void;
}
```

---

## M. `catalogue.ts` —— 建筑 / 工具 / 法令数据类型（数据由 `src/data/**` 提供，W0 生成）

```ts
// ===== catalogue.ts =====（spec:building-catalogue §3.1；没有 phase 字段——排期在 app/v1Tools.ts）
import type { Footprint } from './footprint';
import type { OrdinanceId } from './state';
export type TechKey = 'gas' | 'nuclear' | 'solar' | 'wind' | 'microwave' | 'fusion' | 'airport' | 'highways' | 'buses' | 'subways' | 'waterTreatment' | 'desalinization' | 'arcoPioneer' | 'arcoCanopy' | 'arcoDusk' | 'arcoSkyward';
/** 17 个 MISC 槽位的键顺序（槽 16 未用，为 null）。 */
export const TECH_SLOT_KEYS: ReadonlyArray<TechKey | null> = ['gas', 'nuclear', 'solar', 'wind', 'microwave', 'fusion', 'airport', 'highways', 'buses', 'subways', 'waterTreatment', 'desalinization', 'arcoPioneer', 'arcoCanopy', 'arcoDusk', 'arcoSkyward', null];
export type BuildingCategory = 'ground' | 'rubble' | 'radioactive' | 'tree' | 'park' | 'powerLine' | 'road' | 'rail' | 'tunnel' | 'crossover' | 'highway' | 'highwayCrossover' | 'bridge' | 'onramp' | 'subRail'
  | 'zoneR' | 'zoneC' | 'zoneI' | 'construction' | 'abandoned' | 'powerPlant' | 'civic' | 'recreation' | 'reward' | 'waterFacility' | 'transitStation' | 'airportPart' | 'seaportPart' | 'militaryPart' | 'church' | 'arcology';
export type OrientMode = 'none' | 'byId' | 'flipBit' | 'byIdAndFlip';
export type BudgetLineKey = 'police' | 'fire' | 'health' | 'schools' | 'colleges' | 'roads' | 'highways' | 'bridges' | 'rail' | 'subway' | 'tunnel' | 'busFixed';
export interface RewardUnlock { rewardBit: 0 | 1 | 2 | 3 | 4; popOver: number; once: boolean }
export interface BuildingDef {
  id: number; key: string;
  name: string;                                   // strings 表键（玩家可见名经 t()），不是原版文本
  category: BuildingCategory; size: Footprint; placeable: boolean; tool?: ToolId;
  cost: number; upkeepPerYear: number; budgetLine?: BudgetLineKey; tech?: TechKey; unlock?: RewardUnlock;
  powerable: boolean; consumesPower: boolean; piped: boolean; consumesWater: boolean;
  powerOutput?: { kind: 'fixed'; tiles: number } | { kind: 'wind' } | { kind: 'solar' } | { kind: 'hydro' };
  waterOutput?: { kind: 'pump' } | { kind: 'desal' } | { kind: 'tower'; unitsPerCell: number } | { kind: 'treatment'; tilesPerPlant: number };
  pollutionPerTile: number; popWeight: number; residents: number; jobs: number;
  zone?: { type: 'R' | 'C' | 'I'; tier: 0 | 1 | 2; weight: number; level: 1 | 2 | 3 | 4 };
  transition?: 'construction' | 'abandoned';
  coverage?: { layer: 'XPLC' | 'XFIR'; strengthAt100: number };
  microsim?: { type: number; shared: boolean }; nimby: boolean; orient: OrientMode; lifetimeYears?: number;
  placement?: { terrain: 'flat' | 'waterfall' | 'slopeEntrance' | 'any'; waterCellsInFootprint?: [number, number]; needsAdjacent?: 'road' | 'rail' | 'highway+road' };
}
export type ToolId = string;                        // 'roads.road' 'zone.rDense' 'power.coal' …（spec:building-catalogue §2.11）
export type ToolGroup = 'bulldozer' | 'nature' | 'dispatch' | 'power' | 'water' | 'rewards' | 'roads' | 'rail' | 'ports' | 'residential' | 'commercial' | 'industrial' | 'education' | 'services' | 'parks' | 'signs' | 'query' | 'center';
export type PlaceMode = 'point' | 'line' | 'rect' | 'path';
export type CostUnit = 'tile' | 'segment2x2' | 'click' | 'building' | 'changedTile' | 'none';
export interface ToolDef {
  id: ToolId; group: ToolGroup; label: string /*strings 键*/; placeMode: PlaceMode; cursor: Footprint | 'variable' | 'none';
  cost: number; costUnit: CostUnit; buildingIds?: readonly number[]; zoneCode?: number; undergroundView?: boolean;
  tech?: TechKey; unlock?: RewardUnlock; requires?: 'policeStation' | 'fireStation' | 'militaryBase'; hotkey?: string; availableIn: 'city' | 'map' | 'both';
}
export type OrdinanceGroup = 'finance' | 'educationSafety' | 'environment' | 'healthSafety' | 'promotional';
export interface OrdinanceDef { id: OrdinanceId; group: OrdinanceGroup; key: string; availableYear: number; money: { base: 'R' | 'C' | 'I' | 'All'; pct: { num: number; den: number }; sign: 1 | -1 } | null; demand: Partial<Record<'r' | 'c' | 'i', number>>; forbidNuclear?: true; advertising?: true }
export interface CatalogueApi {
  readonly BUILDINGS: readonly BuildingDef[];      // 恰好 256 条，按 id 升序
  readonly TOOLS: readonly ToolDef[];
  readonly FOOTPRINT: Uint8Array;                  // === contracts/footprint.FOOTPRINT（测试对账）
  readonly CATEGORY: readonly BuildingCategory[];  // 256
  readonly TECH_BASE_YEAR: Readonly<Record<TechKey, number>>;
  readonly ORDINANCES: readonly OrdinanceDef[];    // 20，demand 列与 zones 乘数表一致（registry.test）
  toolById(id: ToolId): ToolDef | undefined; buildingByKey(key: string): BuildingDef | undefined;
}
```

---

## N. `io.ts` —— `.SC2` 文档与 `MISC` 访问器

```ts
// ===== io.ts =====（spec:file-formats §3.2 / §3.4.4）
export type ChunkId = 'CNAM' | 'MISC' | 'ALTM' | 'XTER' | 'XBLD' | 'XZON' | 'XUND' | 'XTXT' | 'XLAB' | 'XMIC' | 'XTHG' | 'XBIT' | 'XTRF' | 'XPLT' | 'XVAL' | 'XCRM' | 'XPLC' | 'XFIR' | 'XPOP' | 'XROG' | 'XGRP' | 'TEXT' | 'SCEN' | 'PICT' | 'TMPL';
export const CHUNK_SIZES: Readonly<Record<Exclude<ChunkId, 'TEXT' | 'SCEN' | 'PICT' | 'TMPL'>, number>> = {
  CNAM: 32, MISC: 4800, ALTM: 32768, XTER: 16384, XBLD: 16384, XZON: 16384, XUND: 16384, XTXT: 16384, XLAB: 6400, XMIC: 1200, XTHG: 480, XBIT: 16384,
  XTRF: 4096, XPLT: 4096, XVAL: 4096, XCRM: 4096, XPLC: 1024, XFIR: 1024, XPOP: 1024, XROG: 1024, XGRP: 3328 };
export const UNCOMPRESSED: ReadonlySet<ChunkId> = new Set<ChunkId>(['CNAM', 'ALTM', 'TEXT', 'SCEN', 'PICT', 'TMPL']);
export const WRITE_ORDER: readonly ChunkId[] = ['CNAM', 'MISC', 'ALTM', 'XTER', 'XBLD', 'XZON', 'XUND', 'XTXT', 'XLAB', 'XMIC', 'XTHG', 'XBIT', 'XTRF', 'XPLT', 'XVAL', 'XCRM', 'XPLC', 'XFIR', 'XPOP', 'XROG', 'XGRP', 'TEXT', 'SCEN', 'PICT', 'TMPL'];
/** 解压后的原始 chunk 集合：导入 / 导出的中间表示，与 CityState 解耦。 */
export interface Sc2Document {
  cityName: string; misc: Int32Array /*1200*/; altm: Uint16Array /*16384*/;
  xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;
  xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array;
  xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array; xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array;
  xgrp: Int32Array /*832*/;
  scenario?: { texts: { kind: number; text: string }[]; scen: Uint8Array; pict?: Uint8Array; tmpl?: Uint8Array };
  unknownChunks: { id: string; data: Uint8Array }[];
}
export interface ReadResult<T> { value: T; diagnostics: import('./system').Diagnostic[] }
export interface Sc2ExportOptions { compat?: boolean }           // compat：清零 0x1054–0x10B7 与 0x10BC–0x12BB，不写 PRNG 标志 / 侧表
/** 纯编解码（WP2 实现，不认识 CityState）。 */
export interface Sc2Codec { readSc2(buf: ArrayBuffer, fileName?: string): ReadResult<Sc2Document>; writeSc2(doc: Sc2Document): ArrayBuffer; newDocument(): Sc2Document }
/** MISC 字节偏移表（spec:file-formats §3.4.4 全表）+ 零区注册（本项目扩展，防碰撞）。 */
export const MISC = {
  header: 0x0000, cityMode: 0x0004, rotation: 0x0008, yearFounded: 0x000c, cityAge: 0x0010, money: 0x0014, bondCount: 0x0018, difficulty: 0x001c, cityStatus: 0x0020,
  cityValue: 0x0024, landValueSum: 0x0028, crimeSum: 0x002c, trafficCount: 0x0030, pollution: 0x0034, fame: 0x0038, advertising: 0x003c, garbage: 0x0040,
  workforcePct: 0x0044, lifeExpectancy: 0x0048, educationQuotient: 0x004c, nationalPop: 0x0050, nationalValue: 0x0054, nationalTax: 0x0058, nationalTrend: 0x005c,
  heat: 0x0060, wind: 0x0064, humidity: 0x0068, weather: 0x006c, disaster: 0x0070, residentialPop: 0x0074, rewardsAvailable: 0x0078,
  cohorts: 0x007c, industryGraph: 0x016c, tileCounts: 0x01f0, zoneTileCounts: 0x05f0, bonds: 0x0610, neighbors: 0x06d8, rciDemand: 0x0718, techYears: 0x0738,
  taxRes: 0x077c, taxCom: 0x07e8, taxInd: 0x0854, ordinanceBlock: 0x08c0, bondBlock: 0x0930,
  svcPolice: 0x0998, svcFire: 0x0a04, svcHealth: 0x0a70, svcSchools: 0x0adc, svcColleges: 0x0b48, svcRoads: 0x0bb4, svcHighways: 0x0c20, svcBridges: 0x0c8c, svcRail: 0x0cf8, svcSubway: 0x0d64, svcTunnel: 0x0dd0,
  yearEnd: 0x0e3c, seaLevel: 0x0e40, terrainCoast: 0x0e44, terrainRiver: 0x0e48, militaryBase: 0x0e4c, paperList: 0x0e50, newsList: 0x0ec8,
  ordinances: 0x0fa0, unemployed: 0x0fa4, militaryCounts: 0x0fa8, subwayCount: 0x0fe8, speed: 0x0fec, autoBudget: 0x0ff0, autoGoto: 0x0ff4, sound: 0x0ff8, music: 0x0ffc,
  noDisasters: 0x1000, paperDelivery: 0x1004, extraPaper: 0x1008, paperChoice: 0x100c, zoom: 0x1014, viewX: 0x1018, viewY: 0x101c,
  arcoPop: 0x1020, connectionTiles: 0x1024, sportsTeams: 0x1028, normalPop: 0x102c, industryBonus: 0x1030, pollutionBonus: 0x1034, oldArrests: 0x1038, policeBonus: 0x103c,
  pendingDisaster: 0x1040, disasterActive: 0x1048, goDisaster: 0x104c, sewerBonus: 0x1050,
  // ---- 零区（原版样本恒为 0）：本项目扩展 ----
  prngMarker: 0x1054, prngState: 0x1058, saveFormatVersion: 0x105c, viewZoom: 0x1060, xtxtShadow: 0x10bc /* 512 B 至 0x12BB */,
} as const;
export const miscGet = (m: Int32Array, off: number): number => m[off >> 2]!;
export const miscSet = (m: Int32Array, off: number, v: number): void => { m[off >> 2] = v | 0; };
export const COHORT_COUNT = 20, COHORT_STRIDE = 12;
export type CohortField = 'count' | 'eqSum' | 'leSum';
const COHORT_FIELD_SLOT: Record<CohortField, number> = { count: 0, eqSum: 1, leSum: 2 };   // 字段序是唯一允许改动处（spec:file-formats §5.14）
export const cohortOffset = (k: number, f: CohortField): number => MISC.cohorts + k * COHORT_STRIDE + COHORT_FIELD_SLOT[f] * 4;
```

---

## O. `snapshot.ts` —— 通用快照 schema 与哈希

```ts
// ===== snapshot.ts =====
import type { CityState } from './state';
import type { SystemId } from './system';
import type { Diagnostic } from './system';
export const SNAPSHOT_MAGIC = 'SC2KWEBS', SNAPSHOT_VERSION = 2;
export type HashScope = 'full' | 'sc2';
export type SnapshotEntryKind = 'u8' | 'u16' | 'i32' | 'scalars' | 'strings' | 'priv';
/** 一条静态 schema 项；hash 标注决定它进入哪一档哈希（'none' = 两档都不进）。entries 的顺序即编码顺序。 */
export interface SnapshotSchemaEntry { path: string; kind: SnapshotEntryKind; len?: number; hash: HashScope | 'none' }
/**
 * 静态有序表（W0 落地）：layers.*（u8，各自长度）→ maps.* → counts.* → xgrp → rawMisc(hash:'none') → scalars → strings → priv。
 * 'scalars' 条目由 SCALAR_FIELDS 决定字段序；'priv' 条目按 SYSTEM_ORDER 逐系统规范化编码（键名排序、TypedArray 追加为二进制块、整数 i32）。
 */
export declare const SNAPSHOT_SCHEMA: readonly SnapshotSchemaEntry[];
/** 顶层标量的固定路径序（如 'clock.age','clock.foundedYear',…,'economy.funds',…,'bonds[0..49].rateRaw'…,'view.x'）；每项带 hash 标注。 */
export declare const SCALAR_FIELDS: ReadonlyArray<{ path: string; hash: HashScope | 'none' }>;
/** 显式排除表（两档都不进）：clock.accumMs clock.speed clock.modalPause view.* rawMisc；'sc2' 档另排除 priv 与 hash:'full' 的标量（economy.yearOpeningFunds 等）。 */
export declare const HASH_EXCLUDE: readonly string[];
/** 每个系统 priv 的字节预算（编码后）；registry.test / snapshot.test 断言。总和 ≤ 512 KB。 */
export const PRIV_BUDGET_BYTES: Readonly<Record<Exclude<SystemId, 'core'>, number>> = {
  terrain: 8192, placement: 4096, utilities: 16384, transport: 65536, zones: 131072, services: 32768, economy: 16384, events: 131072 };
export interface SnapshotCodec {
  encode(s: CityState): Uint8Array;                                   // 遇非白名单类型（Map/Set/函数/非有限数/非整数/类实例）抛错
  decode(bytes: Uint8Array, into: CityState): Diagnostic[];           // 缺失条目补默认；priv.v 交给各系统 postLoad('snapshot') 处理
  hash(s: CityState, scope: HashScope): number;                       // fnv1a32 over 同一遍历器输出的、按 scope 过滤后的字节
  validatePriv(s: CityState): Diagnostic[];                           // 类型白名单 + 预算；测试与 debug 面板用
}
```

---

## P. `dirty.ts` —— 脏追踪（core 产出，渲染消费）

```ts
// ===== dirty.ts =====
export type BulkLayer = 'xbit' | 'maps' | 'xtxt' | 'xthg' | 'xmic' | 'all';
export interface DirtyChanges { readonly tiles: Int32Array /*subarray(0,count)*/; readonly bulk: Readonly<Record<BulkLayer, boolean>> }
/** Uint8Array(16384) 位图 + Int32Array(16384) 去重列表；mark O(1)；take 返回视图并清空。 */
export interface DirtyTracker {
  mark(i: number): void; markBulk(k: BulkLayer): void;
  readonly count: number; readonly bulk: Readonly<Record<BulkLayer, boolean>>;
  take(): DirtyChanges;                                               // 调用后内部清空；返回的 tiles 在下次 mark 前有效
  clear(): void;
}
export declare function createDirtyTracker(): DirtyTracker;
```

---

## Q. `render.ts` —— 视图、精灵来源、场景编译、后端 API

```ts
// ===== render.ts =====（spec:ui-art §3.1 / §3.4；render-first §4.3–§4.9）
import { MAX_ALT, TileMarker } from './grid';
import type { TileLayers, DataMaps, CityState } from './state';
import type { Rotation } from './rotation';
import type { PlacementPreview } from './commands';
import type { Queries } from './queries';
import type { DirtyChanges } from './dirty';

export type ZoomLevel = 0 | 1 | 2 | 3 | 4; export type ArtScale = 'XS' | 'S' | 'M' | 'L' | 'XL';
export const ZOOM_TABLE = [
  { scale: 'XS', tileW: 8, tileH: 4, levelPx: 3, dat: 'small' }, { scale: 'S', tileW: 16, tileH: 8, levelPx: 6, dat: 'medium' },
  { scale: 'M', tileW: 32, tileH: 16, levelPx: 12, dat: 'large' }, { scale: 'L', tileW: 64, tileH: 32, levelPx: 24, dat: null }, { scale: 'XL', tileW: 128, tileH: 64, levelPx: 48, dat: null } ] as const;
/**
 * 地图像素系原点（旋转后、按当前档原生像素、不含相机）：旋转后地块 (0,0) 在海拔 MAX_ALT 时的顶点 c00' 落在 y = 0；旋转后 (0,127) 的左顶点落在 x = 0。
 * 地图像素画布尺寸 = 128·tileW × (MAX_ALT·levelPx + 128·tileH)。渲染（Pixi 与 CpuCompositor）、pick / screenOf、DOM 标牌、thumbnail 全部共用此原点。
 */
export const mapOrigin = (z: ZoomLevel): { x: number; y: number } => ({ x: 128 * ZOOM_TABLE[z].tileW / 2, y: MAX_ALT * ZOOM_TABLE[z].levelPx });
/**
 * 像素锚点约定（spec:ui-art §3.1；S = tileW/2，LEVEL = levelPx，(rx,ry) = rotateTile(x,y,rot)，(ox,oy) = mapOrigin(zoom)）：
 *  SceneCompiler.worldToScreen(x,y,h) = 旋转后地块**顶点 c00'** = [ox + (rx−ry)·S, oy + (rx+ry)·S/2 − h·LEVEL]
 *  SceneItem.x/y                      = 该项锚格在其基准海拔处的**底顶点 c11'** = worldToScreen(x,y,h) + [0, tileH]；IndexedBitmap 的 (anchorX, anchorY) 贴到此点
 *  地块中心                           = worldToScreen(x,y,h) + [0, tileH/2]（picking.test 的往返用例以此为输入，避免落在共享边上）
 *  RendererApi.screenOf(x,y)          = worldToScreen(x,y,alt[i]) + 相机偏移（worldRoot 的整数位置）；pick(px,py) 先减去同一偏移
 */
export type MapLayerMode = 'structures' | 'zones' | 'transport' | 'power' | 'water' | 'pop' | 'growth' | 'traffic' | 'pollution' | 'crime' | 'landValue' | 'police' | 'fire' | 'health' | 'education';
export interface ViewState { zoom: ZoomLevel; rotation: Rotation; centerX: number; centerY: number; underground: boolean; show: { buildings: boolean; signs: boolean; infrastructure: boolean; zones: boolean }; mapLayer: MapLayerMode | null }

/** 8 bit 索引色位图。procedural：0 = 透明；DAT：索引 0 是合法黑色，用 opaque 掩码（存在时以它为准）。 */
export interface IndexedBitmap { w: number; h: number; data: Uint8Array; anchorX: number; anchorY: number; cycling: boolean; opaque?: Uint8Array }
export type SpriteKind = 'xbld' | 'terrain' | 'water' | 'xund' | 'overlay' | 'actor' | 'ui';
/**
 * overlay 族 id（kind:'overlay'；spec:ui-art §3.9.1 的名字在此落为整数，WP9 生产 / WP10 编译 / WP11 图集 / WP14 DAT 相对号映射共用）。
 *  EdgeWall 项：{ kind:'overlay', id: EdgeWallL | EdgeWallR, variant: levels 1..31 }（SceneLayer.EdgeWall）
 *  ZoneTint 项：{ kind:'overlay', id: zoneOverlayId(zone) }（SceneLayer.ZoneTint）
 *  Marker 项：  { kind:'overlay', id: Fire | Flood | Toxic | Riot, frame }（SceneLayer.Marker）
 *  车流：       { kind:'overlay', id: TrafficLight | TrafficHeavy, frame }；标牌 Sign / 邻城连接 Connection；预览 PreviewOk / PreviewBad；光标 CursorTile
 */
export const enum OverlayId { CursorTile = 0, PreviewOk, PreviewBad, ZoneRLight, ZoneRDense, ZoneCLight, ZoneCDense, ZoneILight, ZoneIDense, ZoneMilitary, ZoneAirport, ZoneSeaport,
  NoPower, NoWater, Fire, Flood, Toxic, Riot, Sign, Connection, TrafficLight, TrafficHeavy, EdgeWallL, EdgeWallR }
export const OVERLAY_COUNT = 24;
/** actor 族 id（kind:'actor'；variant = 朝向 0..7，frame = 动画帧）。 */
export const enum ActorId { Plane = 0, Helicopter, Ship, Sailboat, Nessie, TrainHead, TrainCar, Monster, Tornado, Explosion, DeployPolice, DeployFire, DeployMilitary }
export const ACTOR_COUNT = 13;
/**
 * ui 族 id（kind:'ui'，24×24；spec:ui-art §3.9.2）。固定图标显式枚举；区段：速度 = SpeedBase + (speed−1)；天气 = WeatherBase + 天气类型 0..11；
 * Map 图层 = MapLayerBase + MAP_LAYER_MODES 下标；子工具 = SubToolBase + CATALOGUE.TOOLS 下标（CATALOGUE.TOOLS 为 67 项，SubToolBase 96 + 67 = 163，总数 < 256 以适配 spriteKeyHash 的 8 位 id）。
 */
export const enum UiIconId {
  Bulldozer = 0, Landscape, Emergency, Roads, Power, Water, Rails, Ports, Residential, Commercial, Industrial, Education, Services, Recreation, Signs, Query, Rewards,
  RotateCcw, RotateCw, ZoomOut, ZoomIn, Centering, Help, MapWin, GraphsWin, PopulationWin, IndustriesWin, NeighborsWin, BudgetWin,
  ShowBuildings, ShowSigns, ShowInfra, ShowZones, ShowUnderground, GotoArrow, RciBase, Close, Minimize, Pin,
  SpeedBase = 48, WeatherBase = 56, MapLayerBase = 72, SubToolBase = 96 }
export const MAP_LAYER_MODES: readonly MapLayerMode[] = ['structures', 'zones', 'transport', 'power', 'water', 'pop', 'growth', 'traffic', 'pollution', 'crime', 'landValue', 'police', 'fire', 'health', 'education'];
export const zoneOverlayId = (zone: number): OverlayId => (OverlayId.ZoneRLight + zone - 1) as OverlayId;   // ZoneCode 1..9 与枚举同序
export const markerOverlayId = (m: number): OverlayId | null =>
  m === TileMarker.Fire ? OverlayId.Fire : m === TileMarker.Flood ? OverlayId.Flood : m === TileMarker.ToxicCloud ? OverlayId.Toxic
  : m === TileMarker.Rioters || m === TileMarker.MassRioters ? OverlayId.Riot : null;
/** 建筑格在地下视图里的"短管桩"：xund 族借用原版未用的 0x21（variant 1 = 有水）。 */
export const XUND_PIPE_STUB = 0x21;
/** id 语义：xbld = XBLD 号；terrain = 坡面码 0..13（variant: altBand*4 + noise，'underground' 用 variant 0x80 位）；water = 0..20（270+n 的相对号；variant = depthBand）；xund = XUND 号（variant 1 = 有水；0x21 = 短管桩）；overlay / actor / ui = 上面的 OverlayId / ActorId / UiIconId。 */
export interface SpriteKey { kind: SpriteKind; id: number; variant?: number; frame?: number }
export const spriteKeyHash = (k: SpriteKey): number => ((k.kind.charCodeAt(0) & 0xff) << 24) | ((k.id & 0xff) << 16) | (((k.variant ?? 0) & 0xff) << 8) | ((k.frame ?? 0) & 0xff);
export interface Palette { rgba: Uint8ClampedArray /*256×4*/; cycles: ReadonlyArray<{ start: number; length: number; periodMs: number; dir: 1 | -1 }> }
export interface SpriteProvider {
  readonly name: 'procedural' | 'dat'; readonly palette: Palette; readonly nativeScales: ReadonlySet<ArtScale>;   // procedural {S,M,L}；dat {XS,S,M}
  has(key: SpriteKey, scale: ArtScale): boolean;                 // 只回答原生档
  bitmap(key: SpriteKey, scale: ArtScale): IndexedBitmap | null; // 同步；非原生档返回 null（回退链在渲染器）
  frameCount(key: SpriteKey): number; fps(key: SpriteKey): number;   // 0 = 静态
}

/** 画家序层键：zKey = depth·4096 + rx·16 + layer。 */
export const enum SceneLayer { Terrain = 0, EdgeWall = 1, Water = 2, ZoneTint = 3, Ground = 4, Structure = 5, Overlay = 6, Marker = 7, Actor = 8, Preview = 9 }
export const zKeyOf = (depth: number, rx: number, layer: SceneLayer): number => depth * 4096 + rx * 16 + layer;
export const bandOf = (depth: number): number => depth >> 4;     // 16 条深度带
export type AnimGroup = 'none' | 'water' | 'blink' | 'traffic' | 'fire' | 'flood' | 'toxic' | 'riot' | 'cycleOnly';
export interface SceneItem {
  tile: number; layer: SceneLayer; key: SpriteKey;
  x: number; y: number;                                           // 锚格底顶点 c11'（基准海拔）的地图像素 = worldToScreen(x,y,h) + [0, tileH]；位图 (anchorX, anchorY) 贴到此点（见 mapOrigin 注释）
  depth: number; rx: number; zKey: number; flip: boolean; anim: AnimGroup; tint?: number; alpha?: number;
}
/** 渲染器需要的只读快照（由 app 构造；不含任何模块私有对象）。 */
export interface RenderSnapshot {
  readonly layers: Readonly<TileLayers>; readonly maps: Readonly<DataMaps>;
  readonly markers: Readonly<Uint8Array>;                        // q.disasters.markers()
  readonly view: Readonly<ViewState>; readonly seaLevel: number; readonly artScale: ArtScale;
  readonly trafficLight: number; readonly trafficHeavy: number;   // 叠加阈值（默认 48 / 160）
}
export interface SceneCompiler {
  compileTile(snap: RenderSnapshot, i: number, out: SceneItem[]): void;    // 只读本格 + anchorOf 探测；每格 ≤ 5 项
  compileAll(snap: RenderSnapshot): SceneItem[];                            // 16384 格，≈3.5 万项
  worldToScreen(snap: RenderSnapshot, x: number, y: number, h: number): [number, number];   // 旋转后地块顶点 c00' 的地图像素（mapOrigin 原点，未含相机）
  pick(snap: RenderSnapshot, px: number, py: number): number | null;        // 31→0 级逆投影 + 四边形测试，只按地面
  edgeOf(snap: RenderSnapshot, i: number): 'L' | 'R' | 'LR' | null;         // 旋转后 rx==127 / ry==127
}
export interface CpuCompositor {
  render(items: readonly SceneItem[], provider: SpriteProvider, scale: ArtScale, rect: { x: number; y: number; w: number; h: number }): IndexedBitmap;
  toRgba(bmp: IndexedBitmap, palette: Palette): Uint8ClampedArray;
  encodePng(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array;    // Node / 浏览器皆可（无 DOM 依赖）
}
export interface ActorSprite { slot: number; key: SpriteKey; x: number; y: number; z: number; px: number; py: number; dir: number; air: boolean }
/** 渲染器输入：由 app 构造，每帧提供脏信息与动画节拍。 */
export interface RenderSource {
  readonly state: Readonly<CityState>;
  readonly q: Pick<Queries, 'disasters' | 'transport' | 'zones' | 'utilities' | 'services'>;
  takeChanges(): DirtyChanges;
  readonly animTick: number;                                      // app 推进的动画节拍（AnimationClock 在渲染器内按 fps 组派生相位）
}
export interface RendererStats { sprites: number; drawCalls: number; bandRebuilds: number; frameMs: number; vramBytes: number }
export interface RendererApi {
  attach(host: HTMLElement): Promise<void>; destroy(): void; resize(): void;
  setSource(src: RenderSource): void;                             // 新城 / 读档：全量重建
  setProvider(primary: SpriteProvider, fallback: SpriteProvider | null): void;   // 热切换 DAT ↔ procedural
  setView(v: ViewState): void; getView(): ViewState; goto(x: number, y: number, smooth: boolean): void;
  frame(dtMs: number): void;                                      // 消费 dirty、推进动画、提交
  setPreview(p: PlacementPreview | null): void; setActors(a: readonly ActorSprite[]): void; setHeatLayer(layer: MapLayerMode | null): void;
  pick(px: number, py: number): { x: number; y: number } | null; screenOf(x: number, y: number): [number, number];   // 屏幕像素 = worldToScreen(x,y,alt) + 相机偏移；pick 为其逆（减偏移后交给 SceneCompiler.pick）
  minimap(mode: MapLayerMode, out: Uint8ClampedArray /*128×128×4*/): void;
  thumbnail(w: number, h: number): Promise<Uint8Array /*PNG*/>;   // 走 CpuCompositor（XS 全图 → 盒式降采样）
  stats(): RendererStats;
}
/** WP11 必须使用的初始化参数（smoke 门禁读 stats()）。 */
export const PIXI_INIT_OPTIONS = { preference: 'webgl', antialias: false, resolution: 1, roundPixels: true, backgroundAlpha: 1, powerPreference: 'high-performance' } as const;
export const backingScaleFor = (dpr: number): number => Math.max(1, Math.floor(dpr));   // 整数舞台缩放，不用小数 resolution
export const RENDER_BUDGET = { maxDrawCallsStatic: 48, maxFullRebuildMs: 60, maxVramBytes: 128 * 1024 * 1024, maxDynamicSprites: 600, maxActors: 39 } as const;
```

---

## R. `host.ts` —— UI / app 唯一需要知道的 sim 外形（core 实现）

```ts
// ===== host.ts =====
import type { CityState } from './state';
import type { Queries } from './queries';
import type { CatalogueApi } from './catalogue';
import type { Command, CommandResult, LoggedCommand } from './commands';
import type { SimEvent } from './events';
import type { NewCityParams, Diagnostic, CreateSimOptions, System } from './system';
import type { Sc2Document, Sc2ExportOptions } from './io';
import type { HashScope } from './snapshot';
import type { DirtyTracker } from './dirty';
import type { PhaseId } from './clock';

export interface AdvanceOptions { budgetMs?: number; maxDaysPerFrame?: number }
export interface SimHost {
  readonly state: Readonly<CityState>; readonly q: Queries; readonly catalogue: CatalogueApi; readonly dirty: DirtyTracker;
  readonly systems: readonly System[];                           // 已按 SYSTEM_ORDER 排序
  /** 每帧：按速度档把真实时间折成天数，逐天 advanceDay；超过 budgetMs 或遇挂起即停，余量带到下一帧；灾害 / 物件 tick 计入同一预算。now 由 app 注入。 */
  advance(dtMs: number, now: () => number, opts?: AdvanceOptions): { daysRun: number; suspended: boolean };
  dispatch(cmd: Command): CommandResult;                          // 只在 phaseCursor==0 或挂起期间执行；同步；写 commandLog。COMMAND_OWNER[cmd.type] 缺席 / 为桩 / 未实现 → 返回 NOT_IMPLEMENTED_RESULT（不写日志、不消费 PRNG）；modalAnswer 由 core 按 MODAL_OWNER 转发
  modalOpened(): void; modalClosed(): void;                       // modalPause ±1；归零且 phaseCursor>0 时续跑当天剩余阶段
  drainEvents(): SimEvent[];
  hash(scope: HashScope): number; commandLog(): readonly LoggedCommand[];
  newCity(p: NewCityParams): void;
  loadSnapshot(bytes: Uint8Array): Diagnostic[]; saveSnapshot(): Uint8Array;          // 经 CreateSimOptions.snapshot；挂起态允许保存（编码 phaseCursor）
  importSc2(doc: Sc2Document): Diagnostic[]; exportSc2(opts?: Sc2ExportOptions): Sc2Document;   // phaseCursor>0 时 export 抛错
  phaseTimings(): Readonly<Record<PhaseId, { count: number; p95Ms: number }>>;   // headless / debug 面板
}
/** core 实现；systems 任意顺序传入，内部按 SYSTEM_ORDER 排序并校验注册约束。 */
export declare function createSim(opts: CreateSimOptions): SimHost;
/** 重放：相同 seed + params + 日志 → 相同 hash('full')；日志中 phaseCursor>0 的命令在同一游标派发后自动 modalClosed()；endOfDay 与阶段一样被重放；编解码器取自同一 opts.snapshot。 */
export declare function replay(opts: CreateSimOptions, params: NewCityParams, log: readonly LoggedCommand[], untilAge: number): SimHost;
```

---

## S. `assets.ts` —— 本地导入与存档库（WP14 实现；WP12 的 `savesLite` 实现 `SaveStore` 子集）

```ts
// ===== assets.ts =====（spec:file-formats §3.9）
export type AssetKind = 'LARGE' | 'SMALLMED' | 'SPECIAL' | 'PAL_MSTR' | 'PAL_STTC' | 'PAL_MAC' | 'DATA_USA_DAT' | 'DATA_USA_IDX' | 'TEXT_USA_DAT' | 'TEXT_USA_IDX' | 'SC2' | 'SCN' | 'MIF' | 'UNKNOWN';
export interface IdentifiedFile { kind: AssetKind; name: string; size: number; lastModified: number; file: File }
export type SaveKind = 'sc2' | 'sc2kweb';
export interface SaveMeta { id: number; kind: SaveKind; name: string; cityName: string; year: number; population: number; savedAt: number; thumbnail: Blob | null }
export interface SaveRecord extends Omit<SaveMeta, 'id'> { id?: number; bytes: ArrayBuffer }
export interface SaveStore { listSaves(): Promise<SaveMeta[]>; putSave(s: SaveRecord): Promise<number>; getSave(id: number): Promise<SaveRecord | undefined>; deleteSave(id: number): Promise<void> }
/** idLayout：键 = `${SpriteKind}:${id}`（overlay / actor 用 OverlayId / ActorId 的数值，terrain 256+nibble、water 270+shape 等相对号规则见 spec:ui-art §2.9.2），值 = DAT 精灵号；缺项即 DatSpriteProvider.has → false 走回退链。 */
export interface DecodedAssets { atlasPages: Blob[]; frames: Map<number, { page: number; x: number; y: number; w: number; h: number; anchorX: number; anchorY: number }>; idLayout: Record<string, number>; diagnostics: import('./system').Diagnostic[] }
export interface AssetStore extends SaveStore {
  putFile(f: IdentifiedFile, bytes: ArrayBuffer): Promise<void>; getFile(kind: AssetKind): Promise<{ bytes: ArrayBuffer; sha256: string } | undefined>;
  putDecoded(key: string, v: DecodedAssets): Promise<void>; getDecoded(key: string): Promise<DecodedAssets | undefined>;
  getPrefs(): Promise<{ useOriginalArt: boolean; persistGranted: boolean }>; setPrefs(p: { useOriginalArt?: boolean; persistGranted?: boolean }): Promise<void>;
  clearAll(): Promise<void>; estimate(): Promise<{ usage: number; quota: number }>;
}
export interface AssetImporter { mount(el: HTMLElement): void; unmount(): void; onProviderReady(fn: (p: import('./render').SpriteProvider | null) => void): () => void }
export const DEFAULT_SAVE_KIND: SaveKind = 'sc2';
```

---

## T. `audio.ts` / `strings.ts`

```ts
// ===== audio.ts =====（WP12；v1 静默实现，v2 WebAudio 原创合成）
export type SoundId = 'click' | 'place' | 'bulldoze' | 'reject' | 'zone' | 'cash' | 'siren' | 'explosion' | 'thunder' | 'monster' | 'tornado' | 'plane' | 'helicopter' | 'train' | 'ship' | 'boo' | 'cheer' | 'news' | 'invention' | 'milestone' | 'launch' | 'quake' | 'flood';
export interface AudioSink { play(id: SoundId, opts?: { volume?: number; pan?: number }): void; loop(id: SoundId, on: boolean): void; setEnabled(sound: boolean, music: boolean): void; startMusic(track: 'city' | 'disaster' | 'title'): void; stopMusic(): void }

// ===== strings.ts =====（全部玩家可见文案在 src/data/strings.<lang>.ts；CI 黑名单扫描）
export type StringTable = Readonly<Record<string, string>>;
export interface Strings { t(key: string, args?: Record<string, string | number>): string; has(key: string): boolean; lang: 'zh' | 'en' }
/** RejectReason / ModalId / QueryStat.key / BuildingDef.name / ToolDef.label 都是 strings 键；UI 不得写死文案。 */
export declare function rejectKey(reason: import('./commands').RejectReason): string;   // 'reject.funds' …
```

---

## U. `testkit.ts` —— 测试工具的契约面（实现在 `src/testkit/**`，只允许测试与 `tools/` import）

```ts
// ===== testkit.ts =====
import type { CityState } from './state';
import type { SimContext, System, NewCityParams, SystemId } from './system';
import type { Queries } from './queries';
import type { Actions } from './actions';
import type { SimHost } from './host';
import type { LoggedCommand } from './commands';
import type { CatalogueApi } from './catalogue';
import type { SceneItem, SpriteProvider, ArtScale } from './render';
import type { SnapshotCodec } from './snapshot';

export type StubProfile = 'optimistic' | 'pessimistic' | 'realistic';
/** 乐观：hasPower/hasAccess/invented → true，runTrip → ok，landValue → 128，天气 Clear。悲观：全部 false / fail / 0。现实：科技 year ≥ base+10；hasAccess 查 24 偏移；hasPower 查 XBIT 自身或 4 邻；runTrip = hasAccess；pieceFor 简单选形。三套共同：news.currentPaper → null、stories → []；bridgeOptions → v1 集合（Causeway / Rail / Wire）；disasters.markers → 全零。 */
export declare function stubQueries(profile: StubProfile, state: CityState, catalogue: CatalogueApi): Queries;
export declare function stubActions(state: CityState): Pick<Actions, 'charge' | 'destroyStructure' | 'news' | 'addTraffic' | 'allocMicrosim' | 'freeMicrosim' | 'requestRescan' | 'markAccessDirty'>;
export interface TestContextOptions { profile?: StubProfile; seed?: number; systems?: readonly System[]; params?: Partial<NewCityParams>; tuning?: Partial<Record<SystemId, object>>; flat?: boolean /*全平地 alt=4 无水，默认 true*/; snapshot?: SnapshotCodec /*默认 io/snapshot/index.ts 的 snapshotCodec；testkit 可 import io/**（sim/** 不可）*/ }
/** 空城 ctx（真实 TileWriter + DirtyTracker + 桩 Queries/Actions）；systems 给出的系统覆盖对应桩；内部 createSim({ ..., snapshot: opts.snapshot ?? snapshotCodec }) —— 与 wire.ts 同一注入点。 */
export declare function createTestContext(opts?: TestContextOptions): { ctx: SimContext; host: SimHost; state: CityState };
export declare function runDays(host: SimHost, days: number): void;              // 无预算限制地推进；遇挂起自动 modalClosed
export declare function hashOf(state: CityState, scope?: 'full' | 'sc2'): number;   // = snapshotCodec.hash(state, scope ?? 'full')，同一注入的编解码器
/** 迷你金城：煤电 + 电线 + R/C/I 分区 + 道路 + 水泵管线的命令脚本；含反例段 'noPower'（移除电线后 2 个月无施工瓦片）。 */
export declare function goldenMiniCity(variant?: 'full' | 'noPower' | 'noRoad'): { params: NewCityParams; commands: readonly LoggedCommand[] };
/** 像素快照辅助：编译 + CPU 合成 + PNG 字节与 FNV 哈希。 */
export declare function pngOf(items: readonly SceneItem[], provider: SpriteProvider, scale: ArtScale, rect: { x: number; y: number; w: number; h: number }): { png: Uint8Array; hash: number };
export declare const BUILTIN_PROCEDURAL_STUB: SpriteProvider;   // 洋红占位 provider（WP0），任何 key 返回同一菱形
```

---

## V. `entrypoints.ts` —— 模块入口（各目录 `index.ts` 的唯一合法出口）

> WP0 的转发桩、各 WP 的真实现、`app/wire.ts` 与 `app/boot.ts` 三方都只认这里的名字与签名；每个 `index.ts` 以 `satisfies` 对账（WP0 在桩里统一写法，例：`export const createRenderer = ((): RendererApi => …) satisfies RenderEntry['createRenderer']`）。`wire.ts` 只 import 这些 `index.ts`；`registry.test` 之外另有 `app/wire.test.ts` 的类型层对账（`import * as m from '../render'; m satisfies RenderEntry`）。

| 目录 `index.ts` | 导出（名字与签名冻结） | WP0 桩实现 | 接手 |
|---|---|---|---|
| `sim/core/index.ts` | `createCoreSystem(): System`、`createSim(opts)`、`replay(opts, params, log, untilAge)` | 最小调度（25 天桩推进 + 四条 core 命令） | WP1 |
| `sim/<id>/index.ts` ×8 | `createTerrainSystem / createPlacementSystem / createUtilitiesSystem / createZonesSystem / createTransportSystem / createServicesSystem / createEconomySystem / createEventsSystem(): System` | `nullSystem(id)` 转发 | WP2–WP8、WP13 |
| `render/index.ts` | `createRenderer(): RendererApi`、`sceneCompiler: SceneCompiler`、`cpuCompositor: CpuCompositor` | `stubRenderer`（CPU 合成到 `<canvas>`）+ WP0 最小编译器 / 合成器 | WP11（后两者 re-export WP10 的 `render/scene`、`render/cpu`） |
| `art/index.ts` | `createProceduralProvider(): SpriteProvider`；可选 `createProceduralProviderAsync(worker: WorkerLike): Promise<SpriteProvider>` | `stubProvider`（洋红菱形） | WP9 |
| `io/sc2/index.ts` | `sc2Codec: Sc2Codec` | `readSc2 / writeSc2` 抛 `Error('notImplemented')`、`newDocument()` 全零 | WP2（T+3 第一切片） |
| `io/snapshot/index.ts` | `snapshotCodec: SnapshotCodec` | WP0 最小实现（TypedArray + scalars + priv） | WP1 |
| `io/assets/index.ts` | `createAssetStore(): AssetStore`、`createAssetImporter(store: AssetStore, sc2: Sc2Codec): AssetImporter` | 内存 `AssetStore`、空面板（`mount` 无操作） | WP14 |
| `audio/index.ts` | `createAudioSink(): AudioSink` | 静默 | WP12 |
| `ui/index.ts` | `mountShell(opts: ShellOptions): ShellHandle` | `stubShell`（速度按钮 + 资金 / 日期 + 新城按钮） | WP12 |
| `data/index.ts` | `CATALOGUE: CatalogueApi`、`createStrings(lang: 'zh' \| 'en'): Strings` | 生成 / 手写（冻结） | WP0 |
| `app/boot.ts` | 无导出；`import.meta.env.DEV` 或 `location.search` 含 `debug` 时挂 `window.__sc2k: Sc2kDebugHandle` | WP0 最小 boot | WP12 |

```ts
// ===== entrypoints.ts =====（只有类型；实现体在各目录 index.ts）
import type { System } from './system';
import type { SimHost, createSim, replay } from './host';
import type { RendererApi, SceneCompiler, CpuCompositor, SpriteProvider } from './render';
import type { Sc2Codec } from './io';
import type { SnapshotCodec } from './snapshot';
import type { AssetStore, AssetImporter, SaveStore } from './assets';
import type { AudioSink } from './audio';
import type { Strings } from './strings';
import type { CatalogueApi, ToolId } from './catalogue';

export type SystemFactory = () => System;
export interface SimCoreEntry { createCoreSystem: SystemFactory; createSim: typeof createSim; replay: typeof replay }
export interface SimEntries {
  createTerrainSystem: SystemFactory; createPlacementSystem: SystemFactory; createUtilitiesSystem: SystemFactory; createZonesSystem: SystemFactory;
  createTransportSystem: SystemFactory; createServicesSystem: SystemFactory; createEconomySystem: SystemFactory; createEventsSystem: SystemFactory;
}
export interface RenderEntry { createRenderer(): RendererApi; sceneCompiler: SceneCompiler; cpuCompositor: CpuCompositor }
/** 结构化的 Worker 外形（art 目录在 tsconfig.sim.json 下没有 DOM lib，不能写 Worker 类型）。 */
export interface WorkerLike { postMessage(message: unknown, transfer?: ArrayBuffer[]): void; addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void; terminate(): void }
export interface ArtEntry { createProceduralProvider(): SpriteProvider; createProceduralProviderAsync?(worker: WorkerLike): Promise<SpriteProvider> }
export interface Sc2Entry { sc2Codec: Sc2Codec }
export interface SnapshotEntry { snapshotCodec: SnapshotCodec }
export interface AssetsEntry { createAssetStore(): AssetStore; createAssetImporter(store: AssetStore, sc2: Sc2Codec): AssetImporter }
export interface AudioEntry { createAudioSink(): AudioSink }
export interface DataEntry { CATALOGUE: CatalogueApi; createStrings(lang: 'zh' | 'en'): Strings }
export type WindowId = 'newCity' | 'budget' | 'ordinances' | 'bonds' | 'map' | 'graphs' | 'neighbors' | 'newspaper' | 'query' | 'saveLoad' | 'population' | 'industries' | 'importAssets';
export interface ShellOptions {
  root: HTMLElement; host: SimHost; renderer: RendererApi; strings: Strings; audio: AudioSink; saves: SaveStore; v1Tools: ReadonlySet<ToolId>;
  importer?: AssetImporter | null;            // Title 页 / File 菜单的"导入素材"入口（WP14 [v1]）；null 时隐藏入口
}
export interface ShellHandle { destroy(): void; openWindow(id: WindowId): void; closeWindow(id: WindowId): void; setTool(tool: ToolId | null): void; showTitle(): void }
export interface UiEntry { mountShell(opts: ShellOptions): ShellHandle }
/** boot.ts 自行 `declare global { interface Window { __sc2k?: Sc2kDebugHandle } }`；e2e/hash.spec 读 host.hash('full')，smoke 读 renderer.stats() 与 shell.openWindow。 */
export interface Sc2kDebugHandle { host: SimHost; renderer: RendererApi; shell: ShellHandle; version: string }
```

---

## Z. 冻结清单与契约变更协议

**不可协商项**（改动须 RFC + 全员 rebase）：`tileIndex` 主序；`ANCHOR_BIT`；`DAY_PHASES / PHASE_OWNER / PHASE_IO / END_OF_DAY_IO / SYSTEM_ORDER / GROWTH_VISIT_ORDER / IMPORT_ORDER / POSTLOAD_ORDER / EXPORT_ORDER`；`ACTION_OWNER / COMMAND_OWNER / MODAL_OWNER / NOT_IMPLEMENTED_RESULT`；`System.endOfDay` 的调用时点（全部阶段之后、`age++` 之前、挂起日延后）；`CreateSimOptions.snapshot`（必填，唯一的快照编解码注入点）；`Command / SimEvent` 的 `type` 字面量与 `RejectReason / ModalId` 的现有成员；`Prng` 语义与 `PRNG_TEST_VECTORS`；`XBit` 掩码；`FOOTPRINT`；`SLOPE_ROT_CCW / XTER_STREAM_ROT_CCW / XBLD_ROT_CCW / renderAnchor / drawFlip`；`zKeyOf / SceneLayer / bandOf`；`OverlayId / ActorId / UiIconId / DisasterKind / DISASTER_MENU / NewsType / XUND_PIPE_STUB` 的数值；`mapOrigin` 与"顶点 c00' / 底顶点 c11' / 地块中心"像素约定；§V 的入口名与签名；`IndustryState` 不含 `tax`（产业税率唯一真源 `economy.industryTax`）与 `CensusSnapshot.workforcePctUsed`（只读副本，`hash:'none'`）；`PrivValue` 白名单与 `PrivState.v`；`SNAPSHOT_SCHEMA / SCALAR_FIELDS / HASH_EXCLUDE` 的顺序与标注；`MISC` 零区分配。

**日内变更协议**：
1. 只允许**加法**：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认实现）、新增 `PRIV_BUDGET_BYTES` 额度（需说明用途）。禁止改名、改语义、删键、改顺序。
2. 流程：在 `docs/contract-rfc.md` 追加一行（谁 / 要什么 / 为什么 / 三套桩默认值）→ Lead 30 分钟内合并到 `src/contracts/**` 与 `src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行（不得改契约文件）。
3. 命名约定：类型 PascalCase；常量表 UPPER_SNAKE；枚举用 `const enum`（`isolatedModules` 下由 WP0 在 `tsconfig` 开启 `preserveConstEnums` 或改用对象字面量 + `as const`，二选一由 WP0 在落地时统一，全仓库一致）；所有坐标参数顺序 `(x, y)`，所有格索引参数名 `i`，半格 `h`，四分格 `q`。

---

## 落地偏差（WP0）

> 本节由 WP0 落地时追加：记录 `src/contracts/**` 与上文代码块的差异及理由。以 `src/contracts/**` 为准，上文代码块为蓝本；下列改动均来自 WP0 统一裁定或落地时发现的蓝本缺陷。

### 1. `nullSystem` 移出 contracts（裁定 1）

- §H 的 `export declare function nullSystem(...)` 删除；实现放在 `src/app/stubs/null.ts`（它需要桩 Queries / Actions，contracts 不得依赖上层）。`system.ts` 留一行注释指向该文件。

### 2. `declare function / declare const` → 同名类型别名（裁定 2）

`declare function` 在运行时不存在，误以值导入会得到 `undefined`，因此"实现体在别处"的声明一律改成类型别名，实现文件以 `satisfies` 对账：

| 蓝本 declare | 落地类型（文件） | 实现体 |
|---|---|---|
| host.ts `createSim` | `CreateSimFn`（host.ts） | `src/sim/core/index.ts` |
| host.ts `replay` | `ReplayFn`（host.ts） | `src/sim/core/index.ts` |
| testkit.ts `stubQueries` | `StubQueriesFn` | `src/testkit/**` |
| testkit.ts `stubActions` | `StubActionsFn`（返回 `StubActions`） | 同上 |
| testkit.ts `createTestContext` | `CreateTestContextFn`（返回 `TestContext`） | 同上 |
| testkit.ts `runDays` | `RunDaysFn` | 同上 |
| testkit.ts `hashOf` | `HashOfFn` | 同上 |
| testkit.ts `goldenMiniCity` | `GoldenMiniCityFn`（返回 `GoldenMiniCity`，参数 `GoldenMiniCityVariant`） | 同上 |
| testkit.ts `pngOf` | `PngOfFn`（返回 `PngResult`） | 同上 |
| testkit.ts `BUILTIN_PROCEDURAL_STUB` | `BuiltinProceduralStub`（= `SpriteProvider`） | 同上 |

- 新增聚合接口 `TestkitEntry`（`src/testkit/index.ts` 以 `import * as t; t satisfies TestkitEntry` 对账）。
- `entrypoints.ts` 的 `SimCoreEntry` 改用 `CreateSimFn / ReplayFn`（蓝本为 `typeof createSim / typeof replay`）。
- 其余 declare 全部给出真实现：`snapshot.ts` 的 `SNAPSHOT_SCHEMA / SCALAR_FIELDS / HASH_EXCLUDE`、`dirty.ts` 的 `createDirtyTracker`、`strings.ts` 的 `rejectKey`；`grid / rotation / footprint / net / prng / state / system` 中的 declare 由契约第一部分落地。

### 3. DOM 类型隔离：文件拆分（裁定 4）

`tsconfig.sim.json` 没有 DOM lib 而 `src/contracts` 整体在其 include 内，凡引用 `HTMLElement / File / Blob` 的接口单独成文件、不进桶文件、不被 sim 侧代码 import：

| 项 | 蓝本位置 | 落地位置 |
|---|---|---|
| `RendererApi` | render.ts | `rendererApi.ts` |
| `RenderEntry / AssetsEntry / UiEntry / WindowId / ShellOptions / ShellHandle / Sc2kDebugHandle` | entrypoints.ts | `shell.ts` |
| `WorkerLike` | entrypoints.ts | `render.ts`（纯类型，art 目录可 import） |
| `assets.ts` 全部 | assets.ts | 不变（单独文件） |

- `render.ts` 只保留纯类型与常量（SceneItem、SpriteProvider、SceneCompiler、CpuCompositor、ViewState、RenderSource、ActorSprite、RendererStats、RENDER_BUDGET、PIXI_INIT_OPTIONS、backingScaleFor、WorkerLike 等）。
- `entrypoints.ts` 只留纯项：`SystemFactory、SimCoreEntry、SimEntries、ArtEntry、Sc2Entry、SnapshotEntry、AudioEntry、DataEntry`。
- `index.ts` 桶文件只 re-export 纯文件（不含 `rendererApi.ts / assets.ts / shell.ts`）；上层代码直接从这三个文件 import。`tsconfig.sim.json` 的 exclude 另列这三个文件（包文件归 WP0 脚手架）。

### 4. 加法导出（蓝本之外，供编解码器 / 测试使用）

- `io.ts`：`MiscKey`；`MISC_BYTES`（每个 MISC 条目的字节长度，io.test 据此断言条目两两不重叠、全部落在 4800 B 内）；`MISC_ZERO_RANGES`（compat 导出清零区间）。`ReadResult` 的诊断类型改为 `import type { Diagnostic }`（蓝本为内联 `import('./system')`）。
- `snapshot.ts`：`HashTag`（`HashScope | 'none'`）与 `inHashScope(tag, scope)`；`parsePath(path)`（路径语法的唯一解析器，语法注释见文件头）；`ScalarField` 接口（`path / hash / bool?`，bool 字段编码 0/1）；`BOND_SLOTS = 50`、`NEIGHBOR_SLOTS = 4`；`STRING_FIELDS`（cityName、mayorName、neighbors[0..3].name）；`PRIV_BUDGET_TOTAL_MAX`。`SNAPSHOT_SCHEMA` 在 `rawMisc` 之后、`scalars` 之前多一组"小型定长 TypedArray"条目：`economy.industryTax / economy.funding / industry.ratio / industry.demand / demographics.cohorts / tech.invented / tech.announced`（这些字段因此不在 `SCALAR_FIELDS`）。
- `dirty.ts`：`BULK_LAYERS`（固定顺序的整层键表）。
- `render.ts`：`mapCanvasSize(z)`；`SPRITE_KINDS / SPRITE_KIND_CODE`（见 §5）。
- `strings.ts`：`REJECT_KEY_PREFIX = 'reject.'`。
- `commands.ts`：`NOT_IMPLEMENTED_RESULT` 以 `Object.freeze` 冻结（含 `changed`）；删除蓝本中未使用的 `ToolId` 导入。
- `assets.ts`：`DecodedAssets.diagnostics` / `AssetImporter.onProviderReady` 用 `import type` 替代内联 `import()`。

### 5. 语义修正

- **`spriteKeyHash`**：蓝本以 `kind.charCodeAt(0)` 为高 8 位，但 `'xbld'` 与 `'xund'` 首字母同为 `x`，同 id 的两族会碰撞（例如 xbld 0x21 与 `XUND_PIPE_STUB` 0x21 同哈希）。落地改为 `(SPRITE_KIND_CODE[kind] + 1) << 24`（kind 码 0..6，高字节 1..7，结果恒 > 0），其余三字节不变。render.test 断言七族两两不同。
- **哈希标注**：`SCALAR_FIELDS` 按裁定标注——`'none'`：`clock.speed / clock.modalPause / clock.accumMs`、`view.*`、`census.workforcePctUsed`（以及 schema 条目 `rawMisc`）；`'full'`：`clock.phaseCursor`、`economy.yearOpeningFunds`（以及 schema 条目 `priv`）；其余 `'sc2'`。此外 **`terrain.rotation` 标 `'none'` 并列入 `HASH_EXCLUDE`**：§K 规定 `setView` "只写 view / terrain.rotation（不入哈希）"，蓝本 §O 的排除表漏列了它。
- `economy.bondCount` 为虚拟标量（= `bonds.length`），`economy.bonds[0..49].*` 固定 50 槽（缺省 0）；`neighbors[0..3].*` 固定 4 条；布尔字段（`terrain.coast / river`、`economy.autoBudget / impeached`、`disaster.active / noDisasters / autoGoto`、`utilities.water.treatmentSufficient`）标 `bool: true`。

### 6. Reconcile（WP0 收敛）追加的偏差

- **`QUERY_OWNER` 入契约**：`queries.ts` 新增 `export const QUERY_OWNER: Readonly<Record<keyof Queries, SystemId>>`（唯一真源）；`sim/core/createSim.ts` 与 `app/stubs/null.ts` 原各自的一份已删除并改为 import（`sim/core/index.ts` 仍转发导出以兼容）。
- **原创性改名（裁定 7）**：`TechKey` / `TECH_SLOT_KEYS` 的四个巨型住区键 `arcoPlymouth / arcoForest / arcoDarco / arcoLaunch` → **`arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`**（槽位顺序不变；`ToolId` 后缀、`BuildingDef.key`、strings 键 `tool.rewards.*` / `tech.*`、`TECH_BASE_YEAR` 同步；`tools/gen-catalogue.ts` 按 ID 0xFB–0xFE 映射规格表的 key 列）。`NewsType` 成员 `OpinionFred / MissSim` → **`OpinionGuest / AdviceColumn`**（数值不变）。`SimEvent` 成员 `{ type: 'arcoLaunch'; count }` → **`'arcoExodus'`**（巨型住区集体离开事件；避开黑名单整词）。`tools/strings-scan.ts` 黑名单补入这些标识符形式，防止回退。上文 §L / §M 代码块已同步改名。
- **`mayorName` 哈希标注 `'full'`**：`.SC2`（MISC / CNAM）没有市长名字段，按 `'sc2'` 标注会让 `.SC2` 往返改变 `hash('sc2')`。`snapshot.ts` 新增 `STRING_FIELD_HASH = { mayorName: 'full' }` 与 `stringFieldHash(path)`（其余字符串 `'sc2'`）；`io/snapshot/codec.ts` 的哈希遍历对 `strings` 条目逐项过滤（与 `scalars` 同理；条目级 `hash:'sc2'` 为名义值）。`STRING_FIELDS` 的类型与顺序不变。
- **`CensusSnapshot.workforcePctUsed`**：按 §F 正文与「不可协商项」保留（只读副本，`hash:'none'`）；顶部终审修订 ⑦ 的「删」字已更正。
- **`UiIconId` 注释**：`CATALOGUE.TOOLS` 为 67 项（spec §2.11 全表，含 v2 工具），`SubToolBase 96 + 67 = 163 < 256`；原注释「≤ 64」已改，`data/catalogue.test` 断言该不等式。
- **`nullSystem` 绑定前不抛错**（app/stubs/null.ts，C1）：`init / postLoad` 之前的查询回退到桩私有的空城 `createCityState()` 作答（boot 在玩家点「新城」之前就渲染空地图，会先调 `q.disasters.markers()`）；绑定后读 `ctx.state`。
- **ESLint 依赖方向**：`*.test.ts` 对方向规则整体豁免（`sim/core/*.test.ts` 合法 import `testkit` 与 `io/snapshot`）；新增 `NO_DOM_CONTRACTS`：`tsconfig.sim.json` 覆盖的目录（data / sim/** / io/sc2 / io/snapshot / io/assets/{sprites,palette,text} / art / render/scene / render/cpu）不得 import `contracts/{rendererApi,assets,shell}.ts`（裁定 4 从「只靠注释」升级为规则）。
- **`pnpm --filter sc2k lint`**：新增脚本串联 `tools/strings-scan.ts src e2e index.html` 与 `tools/gen-catalogue.ts --check`（根 `pnpm lint` 仍只是 `eslint .`，CI 需另调用该脚本）。
