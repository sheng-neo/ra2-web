/**
 * 塔楼灯（规格 B11，写实化复审后收紧）：
 * - 航空障碍灯：只给全城最高的 15 栋（楼顶离地 ≥ 180 m 的写字楼、≥ 200 m 的任何塔楼，敏感区除外）与 250 m 以上的地标。
 *   照片（01、05、06、07）在这个尺度几乎看不到红灯，visual-facts §12 说最多 10–20 盏、1–3 px 的小点。
 *   300 m 以下一栋一盏，以上四角。红色；60 % 慢闪（0.5–1.0 Hz，占空比 0.5，逐栋相位，峰值 2.5），40 % 常亮（1.8）。
 *   全部进一个 GlowBatch（1 个 draw call）。
 * - 边缘 LED：有冠顶泛光的塔楼里一半在外轮廓的凸角上加竖向 LED 线（上部 40 % 楼高，冠顶同色，约 2.6），静态。
 * - 天台灯箱（照片 01：海旁天台一排白 / 黄 / 红 / 青 / 绿的灯箱，是「香港夜景」的头号标志）：离海 ≤ 700 m、
 *   高 ≥ 60 m 的塔楼约 1/5 在朝海（北）的屋顶边缘立一块空白灯箱，不写字、不做标志，静态单色，亮度 1.0–1.6（过曝进 bloom）。
 * - LED 幕墙：两栋海旁中层楼朝海的立面整片静态单色（绿 / 青），亮度 0.45–0.6。
 * - 裙楼 LED 灯带：四座海旁裙楼朝海一面 2–3 道横向蓝 / 白灯带（照片 01 会展中心式）。
 * 边缘 LED、灯箱、LED 幕墙、灯带全部进一个发光网格（materials/neon.ts，1 个 draw call），也进平面反射——
 * 水里的彩色光柱主要就靠它们。LOW 档的方位角发光条另由 lightBoxEmitters 给出。
 * 纯规划函数 planAviation / planEdgeLeds / planLightBoxes 可测。
 */
import { Mesh, type Material, type Object3D } from 'three';
import type { FlatXY, LandmarkPlacement, SensitiveZone } from '@central/data';
import { simToThree } from '../coords';
import { mergeArrays } from './mesh-arrays';
import { pointInRing } from '../geom/ring';
import { hash01 } from './facade';
import { GlowBatch, lightColour, type LightName } from './materials/lighting';
import { newNeonArrays, neonLine, neonVertex } from './materials/neon';
import type { Emitter } from './water/strip';

/** 规划需要的楼参数（BuildingPlan 的子集）。 */
export interface TowerHost {
  /** ring / top：主体（灯箱、边缘 LED）；peak：最高块（航空灯，省略时同主体）。 */
  p: { b: { id: string }; ring: { outer: FlatXY }; top: number; peak?: { outer: FlatXY; top: number } };
  typology: string;
  tallM: number;
  feature: number;
  edgeLed: boolean;
}

export interface AviationLight {
  /** 模拟坐标（米）。 */
  x: number;
  y: number;
  z: number;
  intensity: number;
  blinkHz: number;
  phase: number;
}

export const AVIATION_MIN_M = 180;
/** 非写字楼要到这个高度才加航空灯。 */
export const AVIATION_ANY_M = 200;
/** 全城最多这么多栋楼有航空灯（按楼高取最高的）。 */
export const AVIATION_MAX_HOSTS = 15;
/** 地标要高过这个才加。 */
export const AVIATION_LANDMARK_M = 250;

/** 这栋楼够不够格加航空障碍灯（再按楼高取全城前 AVIATION_MAX_HOSTS 栋）。 */
export function wantsAviation(h: Pick<TowerHost, 'typology' | 'tallM'>): boolean {
  if (h.typology === 'sensitive') return false;
  return h.tallM >= AVIATION_ANY_M || (h.typology === 'office' && h.tallM >= AVIATION_MIN_M);
}

/** 外环上最「外」的 4 个角（按 ±x±y 对角方向投影最大），去重后 2–4 个。 */
export function extremeCorners(outer: FlatXY): [number, number][] {
  const dirs: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const picked = new Map<number, [number, number]>();
  for (const [dx, dy] of dirs) {
    let best = -Infinity;
    let at = 0;
    for (let i = 0; i < outer.length; i += 2) {
      const d = outer[i]! * dx + outer[i + 1]! * dy;
      if (d > best) {
        best = d;
        at = i;
      }
    }
    picked.set(at, [outer[at]!, outer[at + 1]!]);
  }
  return [...picked.values()];
}

/** 航空障碍灯（模拟坐标米）。 */
export function planAviation(hosts: readonly TowerHost[], landmarks: readonly LandmarkPlacement[] = [], zones: readonly SensitiveZone[] = []): AviationLight[] {
  const out: AviationLight[] = [];
  const add = (id: string, pts: [number, number][], zM: number) => {
    const flashing = hash01(`${id}:avi`) < 0.6;
    const hz = 0.5 + 0.5 * hash01(`${id}:avi-hz`);
    const phase = hash01(`${id}:avi-ph`);
    for (const [x, y] of pts) out.push({ x: x / 10, y: y / 10, z: zM, intensity: flashing ? 2.5 : 1.8, blinkHz: flashing ? hz : 0, phase });
  };
  const picked = hosts
    .filter(wantsAviation)
    .sort((a, b) => b.tallM - a.tallM || (a.p.b.id < b.p.b.id ? -1 : 1))
    .slice(0, AVIATION_MAX_HOSTS);
  for (const h of picked) {
    // 300 m 以下一盏（最外的一个角），以上四角
    const peak = h.p.peak ?? { outer: h.p.ring.outer, top: h.p.top };
    const corners = extremeCorners(peak.outer);
    add(h.p.b.id, h.tallM >= 300 ? corners : corners.slice(0, 1), peak.top / 10 + 0.6);
  }
  for (const l of landmarks) {
    if (zones.some((z) => pointInRing(z.area, l.x, l.y)) || l.height < AVIATION_LANDMARK_M * 10) continue;
    add(`lm:${l.id}`, [[l.x, l.y]], (l.base + l.height) / 10 + 0.5);
  }
  return out;
}

const CROWN_LIGHT: readonly LightName[] = ['crownWhite', 'crownGold', 'crownCyan', 'crownMagenta'];

/** 边缘 LED 线：凸角上的竖线（模拟坐标 dm 的两端点 + 发光）。 */
export function planEdgeLeds(hosts: readonly TowerHost[]): { a: [number, number, number]; b: [number, number, number]; emit: [number, number, number] }[] {
  const out: { a: [number, number, number]; b: [number, number, number]; emit: [number, number, number] }[] = [];
  for (const h of hosts) {
    const crown = h.feature & 7;
    if (!h.edgeLed || crown === 0 || h.typology === 'sensitive') continue;
    const c = lightColour(CROWN_LIGHT[crown - 1]!).multiplyScalar(2.6);
    const top = h.p.top;
    const z0 = top - h.tallM * 0.4 * 10;
    const r = h.p.ring.outer;
    const n = r.length >> 1;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n;
      const b = (i + 1) % n;
      const ax = r[i * 2]! - r[a * 2]!;
      const ay = r[i * 2 + 1]! - r[a * 2 + 1]!;
      const bx = r[b * 2]! - r[i * 2]!;
      const by = r[b * 2 + 1]! - r[i * 2 + 1]!;
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la < 30 || lb < 30) continue;
      // 外环逆时针：叉积 > 0 为凸角；只取转角 > 35° 的明显角
      const crossZ = ax * by - ay * bx;
      const cos = (ax * bx + ay * by) / (la * lb);
      if (crossZ <= 0 || cos > Math.cos((35 * Math.PI) / 180)) continue;
      out.push({ a: [r[i * 2]!, r[i * 2 + 1]!, z0], b: [r[i * 2]!, r[i * 2 + 1]!, top], emit: [c.r, c.g, c.b] });
    }
  }
  return out;
}

/** 朝海（北）最好的一条外边：外环逆时针，外法线 = (dy, −dx)/l；返回端点（dm）与外法线，没有就 null。 */
export function northEdge(outer: FlatXY, minLenDm = 120): { ax: number; ay: number; bx: number; by: number; nx: number; ny: number; len: number } | null {
  const n = outer.length >> 1;
  let best: { ax: number; ay: number; bx: number; by: number; nx: number; ny: number; len: number } | null = null;
  let score = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = outer[i * 2]!;
    const ay = outer[i * 2 + 1]!;
    const bx = outer[j * 2]!;
    const by = outer[j * 2 + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < minLenDm) continue;
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    if (ny < 0.5) continue;
    const sc = ny * Math.min(len, 400);
    if (sc > score) {
      score = sc;
      best = { ax, ay, bx, by, nx, ny, len };
    }
  }
  return best;
}

/** 灯箱颜色表：白 40 %、黄 20 %、红 15 %、青蓝 15 %、绿 10 %（sRGB）。 */
export const LIGHTBOX_COLOURS: readonly (readonly [number, string])[] = [
  [0.4, '#fff6e8'],
  [0.6, '#ffd23c'],
  [0.75, '#ff3b2f'],
  [0.9, '#3aa8ff'],
  [1.0, '#38ff7a'],
];

function pickColour(h: number): string {
  for (const [p, c] of LIGHTBOX_COLOURS) if (h < p) return c;
  return LIGHTBOX_COLOURS[LIGHTBOX_COLOURS.length - 1]![1];
}

/** 一块发光面（模拟坐标 dm 的四角 a→b→c→d，从正面看逆时针）+ 线性发光；back 为背板的外法线（米），无背板为 null。 */
export interface LightPanel {
  kind: 'box' | 'field' | 'strip';
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
  emit: [number, number, number];
  /** 正面朝向（模拟坐标单位向量）。 */
  nx: number;
  ny: number;
}

export interface LightBoxHost extends TowerHost {
  p: TowerHost['p'] & { cx: number; cy: number };
  groundM: number;
}

/** 离海判定：(x, y) 模拟米 → 以北 700 m 内有没有维港海面。 */
export type NearHarbourFn = (x: number, y: number) => boolean;

/** 天台灯箱 + LED 幕墙 + 裙楼灯带（纯函数，确定性）。 */
export function planLightBoxes(hosts: readonly LightBoxHost[], nearHarbour: NearHarbourFn): LightPanel[] {
  const out: LightPanel[] = [];
  const emitOf = (hex: string, k: number): [number, number, number] => {
    const c = lightColour(hex).multiplyScalar(k);
    return [c.r, c.g, c.b];
  };
  const fields: { h: LightBoxHost; e: NonNullable<ReturnType<typeof northEdge>>; r: number }[] = [];
  const strips: { h: LightBoxHost; e: NonNullable<ReturnType<typeof northEdge>>; r: number }[] = [];
  for (const h of hosts) {
    if (h.typology === 'sensitive') continue;
    const id = h.p.b.id;
    const xM = h.p.cx / 10;
    const yM = h.p.cy / 10;
    if (!nearHarbour(xM, yM)) continue;
    const e = northEdge(h.p.ring.outer);
    if (!e) continue;
    if (h.tallM >= 60 && (h.typology === 'office' || h.typology === 'residential') && hash01(`${id}:lightbox`) < 0.2) {
      // 灯箱：沿朝海边居中，宽 14–36 m（照片 01 里海旁天台灯箱约 25–40 m 宽）、高 = 宽 × 0.22–0.32（4–10 m），
      // 离边 1.5 m，底边在楼顶上 1.5 m（钢架）
      const lenM = e.len / 10;
      const w = Math.min(lenM * 0.85, 14 + 22 * hash01(`${id}:lb-w`));
      if (w >= 8) {
        const hM = Math.min(Math.max(w * (0.22 + 0.1 * hash01(`${id}:lb-h`)), 4), 10);
        const mx = (e.ax + e.bx) / 2 - e.nx * 15;
        const my = (e.ay + e.by) / 2 - e.ny * 15;
        const tx = -e.ny;
        const ty = e.nx;
        const hw = (w / 2) * 10;
        const z0 = h.p.top + 15;
        const z1 = z0 + hM * 10;
        const emit = emitOf(pickColour(hash01(`${id}:lb-c`)), 1.0 + 0.6 * hash01(`${id}:lb-i`));
        // 正面朝 +n：从正面看 a(左下) → b(右下) → c(右上) → d(左上)，左 = −t 方向（t = n 逆时针转 90°）
        out.push({
          kind: 'box',
          a: [mx + tx * hw, my + ty * hw, z0],
          b: [mx - tx * hw, my - ty * hw, z0],
          c: [mx - tx * hw, my - ty * hw, z1],
          d: [mx + tx * hw, my + ty * hw, z1],
          emit,
          nx: e.nx,
          ny: e.ny,
        });
      }
    }
    // 幕墙与灯带只挑中环到金钟一段（x −300…1300 m），从维港机位看得见
    const core = xM > -300 && xM < 1300;
    if (core && h.typology === 'office' && h.tallM >= 35 && h.tallM <= 130 && e.len >= 250) fields.push({ h, e, r: hash01(`${id}:ledfield`) });
    if (core && h.typology === 'podium' && e.len >= 200 && h.tallM >= 8) strips.push({ h, e, r: hash01(`${id}:ledstrip`) });
  }
  // LED 幕墙：抽两栋，整片朝海立面 25–85 % 楼高、宽 80 %，离墙 0.4 m
  fields.sort((a, b) => a.r - b.r);
  fields.slice(0, 2).forEach(({ h, e }, i) => {
    const tx = (e.bx - e.ax) / e.len;
    const ty = (e.by - e.ay) / e.len;
    const inset = e.len * 0.1;
    const ox = e.nx * 4;
    const oy = e.ny * 4;
    const g = h.groundM * 10;
    const H = h.tallM * 10;
    const z0 = g + H * 0.25;
    const z1 = g + H * 0.85;
    const emit = emitOf(i === 0 ? '#38ff7a' : '#3be8ff', 0.45 + 0.15 * hash01(`${h.p.b.id}:lf-i`));
    // 外环逆时针、外法线朝北时边的方向朝西（a 在东）：从正面看 a 在左……按 a→b 的方向放即可
    out.push({
      kind: 'field',
      a: [e.ax + tx * inset + ox, e.ay + ty * inset + oy, z0],
      b: [e.bx - tx * inset + ox, e.by - ty * inset + oy, z0],
      c: [e.bx - tx * inset + ox, e.by - ty * inset + oy, z1],
      d: [e.ax + tx * inset + ox, e.ay + ty * inset + oy, z1],
      emit,
      nx: e.nx,
      ny: e.ny,
    });
  });
  // 裙楼灯带：抽四座，3.5 m 起每 4 m 一道（不高过楼顶 1 m），宽 0.35 m，离墙 0.3 m
  strips.sort((a, b) => a.r - b.r);
  for (const { h, e } of strips.slice(0, 4)) {
    const blue = hash01(`${h.p.b.id}:ls-c`) < 0.7;
    const emit = emitOf(blue ? '#2f6bff' : '#f4f8ff', blue ? 2.6 : 2.2);
    const ox = e.nx * 3;
    const oy = e.ny * 3;
    const g = h.groundM * 10;
    for (let zM = 3.5; zM <= Math.min(h.tallM - 1, 12); zM += 4) {
      const z = g + zM * 10;
      out.push({
        kind: 'strip',
        a: [e.ax + ox, e.ay + oy, z],
        b: [e.bx + ox, e.by + oy, z],
        c: [e.bx + ox, e.by + oy, z + 3.5],
        d: [e.ax + ox, e.ay + oy, z + 3.5],
        emit,
        nx: e.nx,
        ny: e.ny,
      });
    }
  }
  return out;
}

/** 发光面 → LOW 档倒影发光条的光源（模拟米）。 */
export function lightBoxEmitters(panels: readonly LightPanel[]): Emitter[] {
  return panels.map((p) => {
    const cx = (p.a[0] + p.c[0]) / 20;
    const cy = (p.a[1] + p.c[1]) / 20;
    const halfWidth = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) / 20;
    // 发光条按「亮度 × 可见仰角覆盖」累加：面积小的灯箱按亮度直接给，幕墙与灯带按面积打折
    const k = p.kind === 'box' ? 0.6 : p.kind === 'field' ? 0.3 : 0.2;
    return { x: cx, y: cy, z0: p.a[2] / 10, z1: p.c[2] / 10, halfWidth, r: p.emit[0] * k, g: p.emit[1] * k, b: p.emit[2] * k };
  });
}

/** 发光面写进发光网格：正面一片；灯箱另加 0.4 m 后的暗背板（从背后看是黑的，不透光）。 */
function writePanel(m: ReturnType<typeof newNeonArrays>, p: LightPanel): void {
  const q = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], e: readonly [number, number, number]) => {
    const i0 = neonVertex(m, a[0]!, a[1]!, a[2]!, e);
    const i1 = neonVertex(m, b[0]!, b[1]!, b[2]!, e);
    const i2 = neonVertex(m, c[0]!, c[1]!, c[2]!, e);
    const i3 = neonVertex(m, d[0]!, d[1]!, d[2]!, e);
    m.tri(i0, i1, i2);
    m.tri(i0, i2, i3);
  };
  if (p.kind === 'strip') {
    // 灯带：竖直方向 0.35 m 的细条（c、d 的 z 只是 +0.35 m）
    q(p.a, p.b, p.c, p.d, p.emit);
    return;
  }
  q(p.a, p.b, p.c, p.d, p.emit);
  if (p.kind === 'box') {
    const bx = -p.nx * 4;
    const by = -p.ny * 4;
    const sh = (v: readonly number[]) => [v[0]! + bx, v[1]! + by, v[2]!];
    q(sh(p.b), sh(p.a), sh(p.d), sh(p.c), [0.004, 0.004, 0.004]);
  }
}

/** 建对象：航空灯 GlowBatch + 发光网格（边缘 LED、灯箱、LED 幕墙、灯带）；另返回 LOW 档倒影用的光源。 */
export function buildTowerLights(
  hosts: readonly LightBoxHost[],
  landmarks: readonly LandmarkPlacement[],
  zones: readonly SensitiveZone[],
  stripMaterial: Material,
  nearHarbour: NearHarbourFn = () => false,
): { objects: Object3D[]; emitters: Emitter[] } {
  const out: Object3D[] = [];
  const lights = planAviation(hosts, landmarks, zones);
  if (lights.length > 0) {
    const batch = new GlowBatch(lights.length, 'aviation-lights');
    const red = lightColour('aviation');
    const p: [number, number, number] = [0, 0, 0];
    lights.forEach((l, i) => {
      simToThree(l.x, l.y, l.z, p, 0, 1);
      batch.set(i, p, red, l.intensity, 0.3, l.blinkHz, l.phase, 0.5);
    });
    batch.commit();
    out.push(batch.mesh);
  }
  const leds = planEdgeLeds(hosts);
  const panels = planLightBoxes(hosts, nearHarbour);
  if (leds.length + panels.length > 0) {
    const m = newNeonArrays();
    for (const l of leds) neonLine(m, l.a, l.b, l.emit, 0.15);
    for (const p of panels) writePanel(m, p);
    const mesh = new Mesh(mergeArrays([m]).geometry, stripMaterial);
    mesh.name = 'edge-leds';
    mesh.matrixAutoUpdate = false;
    // 边缘 LED、灯箱、幕墙又亮又高，海面倒影里拉出彩色光柱：进平面反射（1 个 draw call、约 1k 三角形）
    mesh.userData.reflect = true;
    out.push(mesh);
  }
  return { objects: out, emitters: lightBoxEmitters(panels) };
}
