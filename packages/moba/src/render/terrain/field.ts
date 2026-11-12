/**
 * 地图数据的解析距离场：地形着色的 splat 烘焙、几何生成与散布避让都以它为唯一依据，
 * 保证画面与模拟层的碰撞/草丛/兵线范围严格一致。
 */
import * as THREE from 'three';
import { distToPolygonEdge, distToSegment, pointInPolygon } from '../../core/map';
import type { MapData, MonsterType, Polygon, Vec2 } from '../../core/types';

/** 水面高度与河床最大下沉(米) */
export const WATER_LEVEL = -0.13;
export const RIVER_DEPTH = 0.52;
/** splat 贴图覆盖的半边长(米) */
export const SPLAT_EXTENT = 64;

/** 各通道把「米」映射到 0..1 时使用的量程(±range) */
export const SPLAT_RANGE = { lane: 6, river: 6, solid: 4, base: 6, bush: 3, camp: 6, pad: 6 } as const;

/** 野怪营地地面标记半径 */
export function campRadius(type: MonsterType): number {
  switch (type) {
    case 'abyss_drake':
    case 'star_colossus':
      return 5.2;
    case 'frost_golem':
    case 'ember_golem':
      return 3.6;
    default:
      return 2.8;
  }
}

export const TOWER_PAD_RADIUS = 3.3;
export const CORE_PAD_RADIUS = 6.6;

/**
 * 营地主题号(地表/水面着色器的 uCamps / uPits 与贴花、布景共用；见 art-v2 §9.2 I7)：
 * 1 霜晶洼地(蓝buff) / 2 余烬坑(红buff) / 3 树根巢穴(苔背獾) / 4 灯花丛(荧翅蛾) / 5 沉渊潭(河道巨龙) / 6 坠星潭(远古巨灵)
 */
export const CAMP_THEME: Record<MonsterType, number> = {
  frost_golem: 1,
  ember_golem: 2,
  mossback: 3,
  glimwing: 4,
  abyss_drake: 5,
  star_colossus: 6,
};
/** uCamps 数组长度(地图上一共 14 个营地) */
export const MAX_CAMPS = 14;

/** 低画质档的静态投影按这个墙高估算(米) */
const STATIC_SHADOW_HEIGHT = 2.6;

const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface PolyInfo {
  poly: Polygon;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function polyInfo(poly: Polygon): PolyInfo {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { poly, minX, maxX, minY, maxY };
}

/** 多边形有符号距离：内部为负 */
export function polygonSignedDist(p: Vec2, poly: Polygon): number {
  const d = distToPolygonEdge(p, poly);
  return pointInPolygon(p, poly) ? -d : d;
}

export class MapField {
  readonly map: MapData;
  readonly walls: PolyInfo[];
  readonly bushes: PolyInfo[];
  readonly bases: PolyInfo[];
  /** 视觉上的河道中心线：两端延长到地图外(河水从西北山泉流入、从东南跌落) */
  readonly riverLine: Vec2[];
  private laneSegs: [Vec2, Vec2][] = [];
  private pads: { pos: Vec2; r: number }[] = [];
  private tmp: Vec2 = { x: 0, y: 0 };

  constructor(map: MapData) {
    this.map = map;
    this.walls = map.walls.map(polyInfo);
    this.bushes = map.bushes.map(polyInfo);
    this.bases = map.bases.map((b) => polyInfo(b.area));
    for (const lane of Object.values(map.lanes)) for (let i = 1; i < lane.length; i++) this.laneSegs.push([lane[i - 1], lane[i]]);
    const r = map.river;
    const a = r[0];
    const a1 = r[1];
    const z = r[r.length - 1];
    const z1 = r[r.length - 2];
    const ext = (p: Vec2, q: Vec2, len: number): Vec2 => {
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / l) * len, y: p.y + (dy / l) * len };
    };
    this.riverLine = [ext(a, a1, 40), ...r, ext(z, z1, 40)];
    for (const t of map.towers) this.pads.push({ pos: t.pos, r: TOWER_PAD_RADIUS });
    for (const b of map.bases) this.pads.push({ pos: b.core, r: CORE_PAD_RADIUS });
  }

  private pt(x: number, y: number): Vec2 {
    this.tmp.x = x;
    this.tmp.y = y;
    return this.tmp;
  }

  /** 到兵线石板路边缘的有符号距离(路内为负) */
  laneDist(x: number, y: number): number {
    const p = this.pt(x, y);
    let d = Infinity;
    for (const s of this.laneSegs) d = Math.min(d, distToSegment(p, s[0], s[1]));
    return d - this.map.laneWidth / 2;
  }

  /** 到河岸的有符号距离(河内为负) */
  riverDist(x: number, y: number): number {
    const p = this.pt(x, y);
    let d = Infinity;
    const l = this.riverLine;
    for (let i = 1; i < l.length; i++) d = Math.min(d, distToSegment(p, l[i - 1], l[i]));
    return d - this.map.riverWidth / 2;
  }

  /** 到最近墙体的有符号距离(墙内为负) */
  wallDist(x: number, y: number, maxDist = 8): number {
    const p = this.pt(x, y);
    let d = maxDist;
    for (const w of this.walls) {
      if (x < w.minX - d || x > w.maxX + d || y < w.minY - d || y > w.maxY + d) continue;
      d = Math.min(d, polygonSignedDist(p, w.poly));
    }
    return d;
  }

  /** 到可走边界的距离(界内为正) */
  boundDist(x: number, y: number): number {
    return this.map.bound - Math.max(Math.abs(x), Math.abs(y));
  }

  /** 到任何不可走区域(墙体或边界外)的距离：可走处为正 */
  solidDist(x: number, y: number, maxDist = 8): number {
    return Math.min(this.wallDist(x, y, maxDist), this.boundDist(x, y));
  }

  /** 到基地地台边缘的有符号距离(台内为负) */
  baseDist(x: number, y: number, maxDist = 8): number {
    const p = this.pt(x, y);
    let d = maxDist;
    for (const b of this.bases) {
      if (x < b.minX - d || x > b.maxX + d || y < b.minY - d || y > b.maxY + d) continue;
      d = Math.min(d, polygonSignedDist(p, b.poly));
    }
    return d;
  }

  bushDist(x: number, y: number, maxDist = 4): number {
    const p = this.pt(x, y);
    let d = maxDist;
    for (const b of this.bushes) {
      if (x < b.minX - d || x > b.maxX + d || y < b.minY - d || y > b.maxY + d) continue;
      d = Math.min(d, polygonSignedDist(p, b.poly));
    }
    return d;
  }

  /** 到最近野怪营地标记圈边缘的距离(圈内为负) */
  campDist(x: number, y: number): number {
    let d = Infinity;
    for (const c of this.map.camps) d = Math.min(d, Math.hypot(x - c.pos.x, y - c.pos.y) - campRadius(c.monsterType));
    return d;
  }

  /** 到最近塔座/水晶座铺装边缘的距离(座内为负) */
  padDist(x: number, y: number): number {
    let d = Infinity;
    for (const p of this.pads) d = Math.min(d, Math.hypot(x - p.pos.x, y - p.pos.y) - p.r);
    return d;
  }

  /** 泉水范围内？ */
  fountainDist(x: number, y: number): number {
    let d = Infinity;
    for (const b of this.map.bases) d = Math.min(d, Math.hypot(x - b.fountain.x, y - b.fountain.y) - b.fountainRadius);
    return d;
  }

  /** 地表高度：陆地 0；河道内平滑下沉(兵线渡口处较浅) */
  heightAt(x: number, y: number): number {
    const d = this.riverDist(x, y);
    if (d > 0.4) return 0;
    const ford = sstep(1.0, -1.5, this.laneDist(x, y));
    const depth = RIVER_DEPTH * (1 - 0.42 * ford);
    return -depth * sstep(0.4, -1.9, d);
  }

  inWater(x: number, y: number): boolean {
    return this.heightAt(x, y) < WATER_LEVEL && this.boundDist(x, y) > -1;
  }

  /** 是否可摆放「贴地小物件」：可走、且不在兵线/河道/基地/塔座/营地/泉水的核心区域 */
  clutterOk(x: number, y: number, laneMargin = 0.3): boolean {
    if (this.solidDist(x, y) < 0.15) return false;
    if (this.laneDist(x, y) < laneMargin) return false;
    if (this.riverDist(x, y) < 0.8) return false;
    if (this.baseDist(x, y) < 0.6) return false;
    if (this.padDist(x, y) < 0.5) return false;
    return true;
  }
}

/** 往 Float32 距离缓冲写入「到线段的距离」(取最小) */
function stampSegment(buf: Float32Array, size: number, a: Vec2, b: Vec2, reach: number): void {
  const toPx = size / (SPLAT_EXTENT * 2);
  const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach + SPLAT_EXTENT) * toPx));
  const x1 = Math.min(size - 1, Math.ceil((Math.max(a.x, b.x) + reach + SPLAT_EXTENT) * toPx));
  const y0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - reach + SPLAT_EXTENT) * toPx));
  const y1 = Math.min(size - 1, Math.ceil((Math.max(a.y, b.y) + reach + SPLAT_EXTENT) * toPx));
  const p = { x: 0, y: 0 };
  for (let j = y0; j <= y1; j++) {
    p.y = (j + 0.5) / toPx - SPLAT_EXTENT;
    for (let i = x0; i <= x1; i++) {
      p.x = (i + 0.5) / toPx - SPLAT_EXTENT;
      const d = distToSegment(p, a, b);
      const k = j * size + i;
      if (d < buf[k]) buf[k] = d;
    }
  }
}

function stampPolygon(buf: Float32Array, size: number, info: PolyInfo, reach: number): void {
  const toPx = size / (SPLAT_EXTENT * 2);
  const x0 = Math.max(0, Math.floor((info.minX - reach + SPLAT_EXTENT) * toPx));
  const x1 = Math.min(size - 1, Math.ceil((info.maxX + reach + SPLAT_EXTENT) * toPx));
  const y0 = Math.max(0, Math.floor((info.minY - reach + SPLAT_EXTENT) * toPx));
  const y1 = Math.min(size - 1, Math.ceil((info.maxY + reach + SPLAT_EXTENT) * toPx));
  const p = { x: 0, y: 0 };
  for (let j = y0; j <= y1; j++) {
    p.y = (j + 0.5) / toPx - SPLAT_EXTENT;
    for (let i = x0; i <= x1; i++) {
      p.x = (i + 0.5) / toPx - SPLAT_EXTENT;
      const d = polygonSignedDist(p, info.poly);
      const k = j * size + i;
      if (d < buf[k]) buf[k] = d;
    }
  }
}

function stampCircle(buf: Float32Array, size: number, c: Vec2, r: number, reach: number): void {
  const toPx = size / (SPLAT_EXTENT * 2);
  const x0 = Math.max(0, Math.floor((c.x - r - reach + SPLAT_EXTENT) * toPx));
  const x1 = Math.min(size - 1, Math.ceil((c.x + r + reach + SPLAT_EXTENT) * toPx));
  const y0 = Math.max(0, Math.floor((c.y - r - reach + SPLAT_EXTENT) * toPx));
  const y1 = Math.min(size - 1, Math.ceil((c.y + r + reach + SPLAT_EXTENT) * toPx));
  for (let j = y0; j <= y1; j++) {
    const py = (j + 0.5) / toPx - SPLAT_EXTENT;
    for (let i = x0; i <= x1; i++) {
      const px = (i + 0.5) / toPx - SPLAT_EXTENT;
      const d = Math.hypot(px - c.x, py - c.y) - r;
      const k = j * size + i;
      if (d < buf[k]) buf[k] = d;
    }
  }
}

export interface SplatTextures {
  /** R=兵线 G=河道 B=不可走(墙体/边界) A=基地地台，均为有符号距离(0.5 = 边界，<0.5 = 内部) */
  a: THREE.DataTexture;
  /** R=草丛 G=野怪营地 B=静态受光蒙版(255 = 受光；没有阴影贴图的低画质档拿它当主光阴影) A=塔座/水晶座 */
  b: THREE.DataTexture;
}

/** 太阳方向在水平面上的分量：单位方向 + 「每米物高的影长」 */
function sunGround(sun: { x: number; y: number; z: number }): { hx: number; hz: number; cot: number } {
  const hl = Math.hypot(sun.x, sun.z) || 1;
  return { hx: sun.x / hl, hz: sun.z / hl, cot: hl / Math.max(0.05, sun.y) };
}

/**
 * 静态受光蒙版：对离墙不远的 texel，朝太阳的水平方向在墙体距离缓冲里步进，看是否被石台挡住(1 = 受光)。
 * 西/北/东三面的界外高崖同样算遮挡；南面是矮石沿，不算。
 */
function bakeStaticLight(wall: Float32Array, size: number, bound: number, sun: { x: number; y: number; z: number }): Float32Array {
  const { hx, hz, cot } = sunGround(sun);
  const reach = STATIC_SHADOW_HEIGHT * cot;
  const toPx = size / (SPLAT_EXTENT * 2);
  const lit = new Float32Array(size * size).fill(1);
  const STEPS = 7;
  for (let j = 0; j < size; j++) {
    const z = (j + 0.5) / toPx - SPLAT_EXTENT;
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / toPx - SPLAT_EXTENT;
      const k = j * size + i;
      const d0 = wall[k];
      const edge = bound - Math.max(Math.abs(x), Math.abs(z));
      if (d0 <= 0 || edge < -1) continue;
      if (d0 > reach + 0.6 && edge > reach + 0.6) continue;
      let occ = 0;
      for (let s = 1; s <= STEPS; s++) {
        const t = (reach * s) / STEPS;
        const qx = x + hx * t;
        const qz = z + hz * t;
        let o = 0;
        if (Math.max(Math.abs(qx), Math.abs(qz)) > bound + 0.25) {
          // 界外高崖(南侧矮石沿除外)
          if (qz < bound - 9) o = 1;
        } else {
          const qi = Math.min(size - 1, Math.max(0, Math.floor((qx + SPLAT_EXTENT) * toPx)));
          const qj = Math.min(size - 1, Math.max(0, Math.floor((qz + SPLAT_EXTENT) * toPx)));
          // 石台要进到墙体里 0.35 米左右才是全高
          o = Math.min(1, Math.max(0, (-wall[qj * size + qi] - 0.05) / 0.3));
        }
        // 影子末端渐隐
        o *= 1 - 0.55 * sstep(0.55, 1, s / STEPS);
        if (o > occ) occ = o;
      }
      lit[k] = 1 - occ;
    }
  }
  // 两遍 3×3 盒式模糊：半影
  const tmp = new Float32Array(size * size);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(size - 1, i + 1);
        tmp[j * size + i] = (lit[j * size + i0] + lit[j * size + i] + lit[j * size + i1]) / 3;
      }
    }
    for (let j = 0; j < size; j++) {
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(size - 1, j + 1);
      for (let i = 0; i < size; i++) lit[j * size + i] = (tmp[j0 * size + i] + tmp[j * size + i] + tmp[j1 * size + i]) / 3;
    }
  }
  return lit;
}

/** 一处会在低画质档留下静态投影的高物：根部位置、根部高度、投影体的离地高度与半径 */
export interface StaticCaster {
  x: number;
  z: number;
  /** 投影体中心离地面(y = 0)的高度 */
  height: number;
  radius: number;
  strength: number;
}

/**
 * 把树冠等高物的投影盖进静态受光蒙版(splatB.B)：沿太阳反方向按高度平移后的一个软圆。
 * 在散布完成后调用一次；贴图尚未上传时只是改内存数据。
 */
export function stampStaticShadows(splat: SplatTextures, casters: StaticCaster[], sun: { x: number; y: number; z: number }): void {
  const img = splat.b.image as { data: Uint8Array; width: number };
  const data = img.data;
  const size = img.width;
  const { hx, hz, cot } = sunGround(sun);
  const toPx = size / (SPLAT_EXTENT * 2);
  for (const c of casters) {
    const cx = c.x - hx * c.height * cot;
    const cz = c.z - hz * c.height * cot;
    const r = c.radius;
    const i0 = Math.max(0, Math.floor((cx - r + SPLAT_EXTENT) * toPx));
    const i1 = Math.min(size - 1, Math.ceil((cx + r + SPLAT_EXTENT) * toPx));
    const j0 = Math.max(0, Math.floor((cz - r + SPLAT_EXTENT) * toPx));
    const j1 = Math.min(size - 1, Math.ceil((cz + r + SPLAT_EXTENT) * toPx));
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) / toPx - SPLAT_EXTENT;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) / toPx - SPLAT_EXTENT;
        const d = Math.hypot(x - cx, z - cz) / r;
        if (d >= 1) continue;
        const k = 1 - c.strength * (1 - sstep(0.55, 1, d));
        const o = (j * size + i) * 4 + 2;
        data[o] = Math.min(data[o], Math.round(255 * k));
      }
    }
  }
  splat.b.needsUpdate = true;
}

/** 把距离场烘焙成两张 RGBA8 贴图(线性过滤即可还原出平滑且准确的边界)。sun = 指向太阳的单位向量 */
export function bakeSplat(field: MapField, size: number, sun: { x: number; y: number; z: number }): SplatTextures {
  const n = size * size;
  const R = SPLAT_RANGE;
  const map = field.map;
  const lw = map.laneWidth / 2;
  const rw = map.riverWidth / 2;
  // 兵线/河道先存「到中心线的距离」，编码时再减去半宽
  const lane = new Float32Array(n).fill(lw + R.lane);
  const river = new Float32Array(n).fill(rw + R.river);
  const solid = new Float32Array(n).fill(R.solid);
  const base = new Float32Array(n).fill(R.base);
  const bush = new Float32Array(n).fill(R.bush);
  const camp = new Float32Array(n).fill(R.camp);
  const pad = new Float32Array(n).fill(R.pad);

  for (const l of Object.values(map.lanes)) for (let i = 1; i < l.length; i++) stampSegment(lane, size, l[i - 1], l[i], lw + R.lane);
  const rl = field.riverLine;
  for (let i = 1; i < rl.length; i++) stampSegment(river, size, rl[i - 1], rl[i], rw + R.river);
  for (const w of field.walls) stampPolygon(solid, size, w, R.solid);
  for (const b of field.bases) stampPolygon(base, size, b, R.base);
  for (const b of field.bushes) stampPolygon(bush, size, b, R.bush);
  for (const c of map.camps) stampCircle(camp, size, c.pos, campRadius(c.monsterType), R.camp);
  for (const t of map.towers) stampCircle(pad, size, t.pos, TOWER_PAD_RADIUS, R.pad);
  for (const b of map.bases) stampCircle(pad, size, b.core, CORE_PAD_RADIUS, R.pad);

  const lit = bakeStaticLight(solid, size, map.bound, sun);

  const da = new Uint8Array(n * 4);
  const db = new Uint8Array(n * 4);
  const enc = (d: number, range: number): number => Math.min(255, Math.max(0, Math.round((d / range) * 127.5 + 127.5)));
  const toM = (SPLAT_EXTENT * 2) / size;
  for (let j = 0; j < size; j++) {
    const y = (j + 0.5) * toM - SPLAT_EXTENT;
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) * toM - SPLAT_EXTENT;
      const k = j * size + i;
      const o = k * 4;
      da[o] = enc(lane[k] - lw, R.lane);
      da[o + 1] = enc(river[k] - rw, R.river);
      da[o + 2] = enc(Math.min(solid[k], map.bound - Math.max(Math.abs(x), Math.abs(y))), R.solid);
      da[o + 3] = enc(base[k], R.base);
      db[o] = enc(bush[k], R.bush);
      db[o + 1] = enc(camp[k], R.camp);
      db[o + 2] = Math.round(lit[k] * 255);
      db[o + 3] = enc(pad[k], R.pad);
    }
  }
  const mk = (data: Uint8Array): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { a: mk(da), b: mk(db) };
}
