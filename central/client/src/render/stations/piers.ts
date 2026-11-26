/**
 * 中环码头正面（R3 STATIONS S-F1，照片 19 = 5 号码头、15 = 码头巴士站）：3–7 号码头的「码头楼」（地政总署楼宇，含 PIER_POINTS
 * 的 pier 点的那栋）朝岸一端的立面外面，挂：
 * - 青色方牌白色大号码头号（1.2 m，背光 1.4）；
 * - 青蓝色航线牌（白字中英：如「天星小輪 · 尖沙咀 / Star Ferry · Tsim Sha Tsui」、「新渡輪 · 長洲 / Sun Ferry · Cheung Chau」，背光 1.3）；
 * - 5、6 号码头另有青色檐口「歡迎乘搭新渡輪 / WELCOME TO SUN FERRY」；
 * - 3.5 m 深的白色波纹铁皮雨篷（棚底筒灯）立在青绿色钢柱上（不用照片 19 节日装饰的粉红色）。
 * 码头楼本身不改（规格 C-5），这些都是立面外 0.1 m 起的独立几何，并进街道设施网格。
 */
import { pointInRing } from '../../geom/ring';
import { K_ATLAS, K_SOFFIT, LifeBuilder, type Face, type FurnitureItem, type Template } from '../streets/furniture';
import { linearRGB, type V3 } from '../streets/prop-geometry';
import { PIER_POINTS, PIER_SERVICES } from '../streets/transit-data';
import { stationsAtlas, type AtlasRect } from './atlas';
import { STATION_REACH, placeItem, type StationsInput } from './common';
import { clearOfZones } from './rules';

/** 朝岸方向（模拟坐标单位向量）：海旁分界线法线的反方向（materials/road.ts WATERFRONT_LINE）。 */
const LANDWARD: readonly [number, number] = [-0.2612, -0.9653];

export interface PierFront {
  pier: number;
  /** 朝岸立面所在边的中点、外法线（朝岸）、边长（m）。 */
  mid: [number, number];
  normal: [number, number];
  width: number;
  /** 西侧长立面（泊位一侧）靠岸一端的挂牌点（模拟米）与外法线；没有合适的边为 null。 */
  side: { at: [number, number]; normal: [number, number]; dir: [number, number] } | null;
}

/** 码头楼西侧长立面的朝向（模拟坐标）：码头指向东北偏北，西侧外法线约朝西北偏西。 */
const WESTWARD: readonly [number, number] = [-0.92, 0.39];

/** 码头 n 的朝岸立面：含 pier 点的楼宇里外法线最朝岸、长 ≥ 8 m 的边。找不到返回 null。纯函数。 */
export function pierFront(pier: number, buildings: StationsInput['buildings']): PierFront | null {
  const pt = PIER_POINTS.find((p) => p.pier === pier && p.kind === 'pier');
  if (!pt) return null;
  const b = buildings.find((bb) => pointInRing(bb.footprint, pt.x * 10, pt.y * 10));
  if (!b) return null;
  const o = b.footprint.outer;
  const n = o.length >> 1;
  let best: PierFront | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = o[i * 2]! / 10;
    const ay = o[i * 2 + 1]! / 10;
    const bx = o[j * 2]! / 10;
    const by = o[j * 2 + 1]! / 10;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 8) continue;
    // 外环逆时针：外法线 = (dy, −dx)
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    const score = nx * LANDWARD[0] + ny * LANDWARD[1];
    if (score > bestScore) {
      bestScore = score;
      best = { pier, mid: [(ax + bx) / 2, (ay + by) / 2], normal: [nx, ny], width: len, side: null };
    }
  }
  if (!best || bestScore <= 0.5) return null;
  // 西侧长立面：外法线最朝西、长 ≥ 15 m 的边；挂牌点在靠岸一端往里 8 m
  let sideScore = 0.6;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = o[i * 2]! / 10;
    const ay = o[i * 2 + 1]! / 10;
    const bx = o[j * 2]! / 10;
    const by = o[j * 2 + 1]! / 10;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 15) continue;
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    const sc = nx * WESTWARD[0] + ny * WESTWARD[1];
    if (sc <= sideScore) continue;
    sideScore = sc;
    // 两端里离朝岸立面近的一端
    const da = Math.hypot(ax - best.mid[0], ay - best.mid[1]);
    const db = Math.hypot(bx - best.mid[0], by - best.mid[1]);
    const [ex, ey, fx, fy] = da < db ? [ax, ay, bx, by] : [bx, by, ax, ay];
    const dx = (fx - ex) / len;
    const dy = (fy - ey) / len;
    best.side = { at: [ex + dx * 8, ey + dy * 8], normal: [nx, ny], dir: [dx, dy] };
  }
  return best;
}

function uvOf(r: AtlasRect): [number, number][] {
  return [
    [r.u0, r.v0],
    [r.u1, r.v0],
    [r.u1, r.v1],
    [r.u0, r.v1],
  ];
}

/** 朝 +x 的字牌（看的人右手 = −z）：z 从 zl（左）到 zl − w。 */
function sign(b: LifeBuilder, x: number, y0: number, h: number, zl: number, w: number, rect: AtlasRect | null, avg: V3, em: number): void {
  const f: Face = rect ? { alb: avg, em: [em, em, em], kind: K_ATLAS } : { alb: avg, em: [avg[0] * em, avg[1] * em, avg[2] * em] };
  b.quad([x, y0, zl], [x, y0, zl - w], [x, y0 + h, zl - w], [x, y0 + h, zl], f, rect ? uvOf(rect) : undefined);
  b.box([x - 0.06, y0 - 0.03, zl - w / 2], [0.1, h + 0.06, w + 0.06], { alb: linearRGB('#2b3134') }, { bottom: null, px: null });
}

/** 码头正面模板（局部：+x 朝岸，立面在 x = 0，z ∈ [−width/2, width/2]，看的人右手 = −z）。 */
export function pierFrontTemplate(width: number, num: AtlasRect | null, board: AtlasRect | null, fascia: AtlasRect | null): Template {
  const b = new LifeBuilder();
  const half = width / 2;
  const teal = linearRGB('#1b8a9c');
  const x = 0.12;
  // 码头号方牌 + 航线牌（左半）
  sign(b, x, 3.5, 1.2, half - 1.2, 1.2, num, teal, 1.4);
  sign(b, x, 3.85, 0.5, half - 2.7, 2.65, board, linearRGB('#1f7f93'), 1.3);
  if (fascia) sign(b, x, 5.0, 0.5, 2.0, 4.0, fascia, linearRGB('#55889e'), 1.2);
  // 白色波纹铁皮雨篷（顶面白、棚底两排筒灯）+ 青绿色钢柱
  const depth = 3.5;
  const y = 3.2;
  b.quad([x, y + 0.12, half], [x + depth, y + 0.12, half], [x + depth, y + 0.12, -half], [x, y + 0.12, -half], { alb: linearRGB('#c9cbca') });
  b.quad([x, y, -half], [x + depth, y, -half], [x + depth, y, half], [x, y, half], { alb: linearRGB('#b5b7b6'), kind: K_SOFFIT }, [
    [0, -1.75],
    [0, 1.75],
    [width, 1.75],
    [width, -1.75],
  ]);
  b.quad([x + depth, y - 0.15, half], [x + depth, y - 0.15, -half], [x + depth, y + 0.14, -half], [x + depth, y + 0.14, half], { alb: linearRGB('#d8dad9') });
  const cols = Math.max(2, Math.round(width / 4.5) + 1);
  for (let i = 0; i < cols; i++) {
    const z = -half + 0.4 + ((width - 0.8) * i) / (cols - 1);
    b.box([x + depth - 0.3, 0, z], [0.22, y, 0.22], { alb: linearRGB('#3f8a86') }, { bottom: null, top: null });
  }
  return b.template();
}

/**
 * 码头楼西侧（泊位一侧）高处的大号码头牌（局部：+x 朝外，立面在 x = 0；看的人右手 = −z）：
 * 3.0 m 青色方牌白色码头号 + 6.4 × 1.2 m 航线牌（离地 5.9–8.9 m，远处看得见），背光。
 */
export function pierSideTemplate(num: AtlasRect | null, board: AtlasRect | null, landwardRight: boolean): Template {
  const b = new LifeBuilder();
  const teal = linearRGB('#1b8a9c');
  // 码头号放在靠岸一端：靠岸方向在看的人右手（−z）还是左手（+z）
  const s = landwardRight ? -1 : 1;
  // 航线牌以挂牌点为中心，码头号在它靠岸的一侧（挂牌点离楼端 8 m）
  sign(b, 0.12, 6.8, 1.2, 3.2, 6.4, board, linearRGB('#1f7f93'), 1.4);
  sign(b, 0.12, 5.9, 3.0, s > 0 ? 6.6 : -3.6, 3.0, num, teal, 1.5);
  return b.template();
}

/** 码头正面的模板与实例。 */
export function pierFurniture(input: StationsInput, templateBase: number): { templates: Template[]; items: FurnitureItem[]; count: number; fronts: PierFront[] } {
  const atlas = stationsAtlas();
  const templates: Template[] = [];
  const items: FurnitureItem[] = [];
  const fronts: PierFront[] = [];
  const tier = input.high ? 0 : 1;
  for (const svc of PIER_SERVICES) {
    const f = pierFront(svc.pier, input.buildings);
    if (!f || !clearOfZones(input.zones, f.mid[0], f.mid[1])) continue;
    const num = atlas.pierNumber(svc.pier);
    const board = atlas.pierBoard(String(svc.pier), `${svc.operatorZh} · ${svc.zh}`, `${svc.operatorEn} · ${svc.en}`);
    const fascia = svc.operatorEn === 'Sun Ferry' ? atlas.sunFascia() : null;
    const t = templateBase + templates.length;
    templates.push(pierFrontTemplate(f.width, num, board, fascia));
    const gx = f.mid[0] + f.normal[0] * 2;
    const gy = f.mid[1] + f.normal[1] * 2;
    const z0 = input.surface(gx * 10, gy * 10) / 10;
    placeItem(items, t, f.mid[0], f.mid[1], z0, f.normal[0], f.normal[1], STATION_REACH.pier[tier]);
    if (f.side) {
      // 看的人面向 −n，右手 = (−ny, nx)（模拟坐标）；靠岸一端在 −dir 方向
      const rx = -f.side.normal[1];
      const ry = f.side.normal[0];
      const landwardRight = -(f.side.dir[0] * rx + f.side.dir[1] * ry) > 0;
      const ts = templateBase + templates.length;
      templates.push(pierSideTemplate(num, board, landwardRight));
      placeItem(items, ts, f.side.at[0], f.side.at[1], z0, f.side.normal[0], f.side.normal[1], STATION_REACH.pier[tier]);
    }
    fronts.push(f);
  }
  return { templates, items, count: fronts.length, fronts };
}
