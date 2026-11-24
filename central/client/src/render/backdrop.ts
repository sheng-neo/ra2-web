/**
 * 远景（全部程序合成，不是真实数据；ATMOSPHERE A6）：
 * - 港岛山体与两翼平地：地形网格以外的高度场，在网格边上正好接上地形（无缝、无悬空裙坡），
 *   往南升到太平山 / 奇力山 / 歌赋山 / 金马伦山一线（近似位置），Peak 观景台眼点处 ≤ 405 m；
 * - 两翼（金钟湾仔、铜锣湾、上环以西）与对岸九龙：通用盒子楼 + 地台 + 海堤，九龙岸线按近似锚点；
 *   西九一栋约 480 m 的通用超高层（只有亮窗与静态白色角灯）；
 * - 九龙背后的狮子山一线山脊（6–8 km，雾里只比天色略暗）；
 * - 灯点：山路灯链、零散屋苑、九龙海旁步道灯、街灯、楼顶角灯与航空障碍灯，一个 GlowBatch。
 * 港岛部分与九龙部分各一个网格 + 各一批光点 = 4 个 draw call（背对的一半会被视锥剔掉）；都进平面反射的代理层。
 */
import { Mesh, SphereGeometry, type Object3D } from 'three';
import type { TerrainGrid } from '@central/data';
import { simMetresToThree } from '../coords';
import { addBox, addHeightfield, axisNodes, bdVertex, Kind, newBackdropArrays } from './backdrop/geometry';
import { hillLights } from './backdrop/hill-lights';
import { buildMassing, MEGA_TOWER, type GlowSpec } from './backdrop/massing';
import { gridRect, makeOuterHeight, PEAK_EYE } from './backdrop/ridge';
import { createBackdropMaterial } from './materials/backdrop';
import { GlowBatch, LIGHT_HEX, lightColour, type LightName } from './materials/lighting';
import { createSkyMaterial } from './materials/sky';
import { mergeArrays } from './mesh-arrays';
import { KOWLOON_SHORE, kowloonShoreY } from './water/mask';
import type { Emitter } from './water/strip';

/**
 * 旧 0 mPD 地面平面的「对岸」参数（模拟 y，米）：设大，让旧平面在北面一律是海；
 * 真正的对岸由本文件的九龙地台盖住，海面由 water/ 画。
 */
export const FAR_SHORE_M = 6000;

/** 九龙地台高度（mPD）与北界（其北是九龙山脊高度场）。 */
const KOWLOON_PLATE_M = 4;
const KOWLOON_NORTH_M = 5000;

export interface BackdropInput {
  relief: TerrainGrid | null;
  /** LOW 档：高度场节点更疏、远处矮楼减半（远景 ≤ 约 35k 三角形）。 */
  low?: boolean;
  /** 数据范围（dm）。 */
  bboxDm: readonly [number, number, number, number];
  isWater: (x: number, y: number) => boolean;
}

export interface Backdrop {
  objects: Object3D[];
  /** 给倒影发光条（LOW）用的光源。 */
  emitters: Emitter[];
}

const KOWLOON_SUMMITS = [
  { x: 1560, y: 7211, h: 457 }, // 笔架山
  { x: 3280, y: 7621, h: 495 }, // 狮子山
  { x: 5300, y: 7100, h: 577 }, // 大老山
  { x: 7257, y: 6260, h: 602 }, // 飞鹅山
  { x: -1800, y: 8000, h: 369 }, // 金山
  { x: -4200, y: 8600, h: 430 },
  { x: 9800, y: 7300, h: 480 },
] as const;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 九龙背后山脊高度（模拟米 → mPD 米）。 */
export function kowloonHills(x: number, y: number): number {
  let h = 260 * smooth(5300, 7800, y) * (1 - 0.3 * smooth(9000, 12000, Math.abs(x - 1500)));
  for (const s of KOWLOON_SUMMITS) h = Math.max(h, s.h - 0.32 * Math.hypot(x - s.x, y - s.y));
  h += Math.sin(x * 0.0023 + 0.4) * Math.sin(y * 0.0031) * 25 * smooth(150, 300, h);
  return KOWLOON_PLATE_M + Math.max(h, 0);
}

export function buildBackdrop(input: BackdropInput): Backdrop {
  const { relief, isWater } = input;
  const bbox = input.bboxDm.map((v) => v * 0.1) as [number, number, number, number];
  const hole = relief ? gridRect(relief) : bbox;
  const [hx0, hy0, hx1, hy1] = hole;
  const outer = makeOuterHeight(relief, hole);
  const inHole = (x: number, y: number) => x > hx0 + 0.01 && x < hx1 - 0.01 && y > hy0 + 0.01 && y < hy1 - 0.01;
  // 网格外的水面格点压到 −2 m（坡进海里，岸线落在格子中间）
  const islandHeight = (x: number, y: number) => (!inHole(x, y) && isWater(x, y) ? -2 : outer(x, y));
  const m = newBackdropArrays();
  const mk = newBackdropArrays();
  const k = input.low ? 1.6 : 1;

  // 1. 港岛：网格外的高度场。网格边上 40 m 一个节点（relief 10 m 节点的子集），往外逐渐加大间距
  const ysSouth = [-4300, -3600, -3000, -2500, -2100, -1800, -1550, -1350, -1200].filter((y) => y < hy0 - 60);
  for (const d of [200, 120, 70, 35, 15, 0]) ysSouth.push(hy0 - d);
  const ys = [...ysSouth.filter((y, i, a) => i === 0 || y > a[i - 1]!), ...axisNodes(hy0, hy1, 40 * k).slice(1), hy1 + 150, hy1 + 400];
  const xs = [
    ...axisNodes(-7600, hx0 - 300, 150 * k),
    ...[hx0 - 200, hx0 - 110, hx0 - 50, hx0 - 15].filter((x) => x > hx0 - 300),
    ...axisNodes(hx0, hx1, 40 * k),
    hx1 + 15,
    hx1 + 50,
    hx1 + 110,
    hx1 + 200,
    ...axisNodes(hx1 + 300, 9500, 150 * k),
  ];
  const water = new Uint8Array(xs.length * ys.length);
  for (let j = 0; j < ys.length; j++) for (let i = 0; i < xs.length; i++) water[j * xs.length + i] = isWater(xs[i]!, ys[j]!) && !inHole(xs[i]!, ys[j]!) ? 1 : 0;
  addHeightfield(
    m,
    xs,
    ys,
    islandHeight,
    (i, j) => {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      if (inHole(cx, cy)) return true;
      const w = xs.length;
      return water[j * w + i]! + water[j * w + i + 1]! + water[(j + 1) * w + i]! + water[(j + 1) * w + i + 1]! === 4;
    },
    (_x, _y, h) => (h < 28 ? Kind.Ground : Kind.Canopy),
  );

  // 2. 九龙地台：沿岸线到北界的条带 + 海堤立面
  const shore: [number, number][] = [];
  for (let i = 0; i < KOWLOON_SHORE.length; i++) {
    const [ax, ay] = KOWLOON_SHORE[i]!;
    shore.push([ax, ay]);
    const next = KOWLOON_SHORE[i + 1];
    if (!next) break;
    const n = Math.max(1, Math.ceil(Math.hypot(next[0] - ax, next[1] - ay) / 200));
    for (let k = 1; k < n; k++) shore.push([ax + ((next[0] - ax) * k) / n, ay + ((next[1] - ay) * k) / n]);
  }
  for (let i = 0; i + 1 < shore.length; i++) {
    const [ax, ay] = shore[i]!;
    const [bx, by] = shore[i + 1]!;
    const p = KOWLOON_PLATE_M;
    const a0 = bdVertex(mk, ax, ay, p, 0, 0, 1, ax, ay, Kind.Ground, 0.5, 0, 0);
    const b0 = bdVertex(mk, bx, by, p, 0, 0, 1, bx, by, Kind.Ground, 0.5, 0, 0);
    const b1 = bdVertex(mk, bx, KOWLOON_NORTH_M, p, 0, 0, 1, bx, KOWLOON_NORTH_M, Kind.Ground, 0.5, 0, 0);
    const a1 = bdVertex(mk, ax, KOWLOON_NORTH_M, p, 0, 0, 1, ax, KOWLOON_NORTH_M, Kind.Ground, 0.5, 0, 0);
    mk.tri(a0, b0, b1);
    mk.tri(a0, b1, a1);
    // 海堤：朝南（水面一侧）；lit 槽记墙顶高度（材质画顶部的海旁亮带）
    const len = Math.hypot(bx - ax, by - ay);
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    const s0 = bdVertex(mk, ax, ay, -1, nx, ny, 0, 0, 0, Kind.SeaWall, 0, p + 1, 0);
    const s1 = bdVertex(mk, bx, by, -1, nx, ny, 0, len, 0, Kind.SeaWall, 0, p + 1, 0);
    const s2 = bdVertex(mk, bx, by, p, nx, ny, 0, len, p + 1, Kind.SeaWall, 0, p + 1, 0);
    const s3 = bdVertex(mk, ax, ay, p, nx, ny, 0, 0, p + 1, Kind.SeaWall, 0, p + 1, 0);
    mk.tri(s0, s1, s2);
    mk.tri(s0, s2, s3);
  }

  // 3. 九龙背后山脊（6–8 km）
  addHeightfield(
    mk,
    axisNodes(-9500, 12000, 250 * k),
    axisNodes(KOWLOON_NORTH_M, 10000, 250 * k),
    kowloonHills,
    () => false,
    (_x, _y, h) => (h < 30 ? Kind.Ground : Kind.Canopy),
  );

  // 4. 盒子楼
  const massing = buildMassing({ ground: islandHeight, isWater: (x, y) => isWater(x, y), bbox });
  // LOW：远处（离中环 > 2.2 km）50 m 以下的楼隔一栋去一栋
  const boxes = input.low ? massing.boxes.filter((b, i) => b.height >= 50 || i % 2 === 0 || Math.hypot(b.x - 450, b.y) < 2200) : massing.boxes;
  for (const b of boxes) addBox(b.y > kowloonShoreY(b.x) - 1 ? mk : m, b);

  const material = createBackdropMaterial();
  const meshOf = (arrays: typeof m, name: string) => {
    const mesh = new Mesh(mergeArrays([arrays]).geometry, material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.userData.reflect = true;
    return mesh;
  };

  // 5. 灯点
  const hills = hillLights({
    height: islandHeight,
    allowed: (x, y) => !inHole(x, y) && !isWater(x, y),
    rect: [-6500, -3900, 8000, 1000],
    avoid: [{ x: PEAK_EYE.x, y: PEAK_EYE.y, r: 160 }],
  });
  const colours = new Map<string, ReturnType<typeof lightColour>>();
  const batchOf = (list: readonly GlowSpec[], name: string) => {
    const batch = new GlowBatch(Math.max(list.length, 1), name);
    list.forEach((g, i) => {
      let c = colours.get(g.colour);
      if (!c) {
        c = lightColour(g.colour in LIGHT_HEX ? (g.colour as LightName) : g.colour);
        colours.set(g.colour, c);
      }
      batch.set(i, simMetresToThree(g.x, g.y, g.z), c, g.intensity, g.radius, g.blinkHz ?? 0, g.phase ?? 0, 0.5);
    });
    batch.commit();
    batch.mesh.userData.reflect = true;
    return batch.mesh;
  };
  const isKowloon = (g: GlowSpec) => g.y > kowloonShoreY(g.x) - 30;
  const objects: Object3D[] = [
    meshOf(m, 'backdrop-island'),
    meshOf(mk, 'backdrop-kowloon'),
    batchOf([...massing.glows.filter((g) => !isKowloon(g)), ...hills], 'backdrop-island-lights'),
    batchOf(massing.glows.filter(isKowloon), 'backdrop-kowloon-lights'),
  ];

  // 倒影发光条用的光源：楼面平均亮度（远处不分窗）
  const office = lightColour('officeNeutral');
  const home = lightColour('homeWarm');
  const led = lightColour('crownGold');
  const emitters: Emitter[] = boxes.map((b) => {
    const isOffice = b.kind === Kind.WallOffice;
    const isLed = b.kind >= Kind.LedWhite && b.kind <= Kind.LedBlue;
    const c = isLed ? led : isOffice ? office : home;
    const k = isLed ? 0.6 : isOffice ? b.lit * 0.24 : b.lit * 0.06;
    return { x: b.x, y: b.y, z0: b.base + 8, z1: b.base + b.height, halfWidth: Math.max(b.w, b.d) / 2, r: c.r * k, g: c.g * k, b: c.b * k };
  });
  emitters.push({ x: MEGA_TOWER.x, y: MEGA_TOWER.y, z0: MEGA_TOWER.height - 20, z1: MEGA_TOWER.height, halfWidth: 35, r: 2, g: 2, b: 2 });

  return { objects, emitters };
}

export function buildSky(radius: number): Mesh {
  const sky = new Mesh(new SphereGeometry(radius, 32, 16), createSkyMaterial());
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.userData.reflect = true;
  return sky;
}
