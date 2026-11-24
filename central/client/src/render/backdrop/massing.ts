/**
 * 远景城区体块（纯函数，确定性）：对岸九龙（西九、尖沙咀、红磡、油尖旺、九龙东）与港岛数据范围以外的两翼
 * （东：金钟 / 湾仔；西：上环以西 / 西营盘）。全部是通用盒子楼，不对应任何真实建筑；
 * 西九一栋约 480 m 的通用超高层（只有亮窗和少量静态白色角灯，没有灯光秀）。
 * 另给出远景灯点（海旁步道灯、街灯、楼顶角灯与航空障碍灯）。坐标为模拟米。
 */
import { kowloonShoreY } from '../water/mask';
import { Kind, type BoxSpec, type KindId } from './geometry';

export interface GlowSpec {
  x: number;
  y: number;
  z: number;
  /** LIGHT_HEX 名称或十六进制颜色。 */
  colour: string;
  intensity: number;
  radius: number;
  blinkHz?: number;
  phase?: number;
}

export interface Zone {
  name: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** 街廓格距（米）与成楼概率。 */
  pitch: number;
  fill: number;
  hMin: number;
  hMax: number;
  /** 高度分布指数（> 1 偏矮）。 */
  hPow: number;
  /** 写字楼比例（其余住宅）。 */
  office: number;
  lit: number;
  warmth: number;
  /** 街道网格方向（弧度）。 */
  rot: number;
  /** 'kowloon' = 必须在九龙岸线以北；'island' = 港岛两翼（不进水、不上山、不进数据范围）。 */
  side: 'kowloon' | 'island';
  /** 街灯：每隔几条街画一条、灯距（米）。 */
  lampEvery: number;
  lampStep: number;
}

export const ZONES: readonly Zone[] = [
  { name: '西九商业', x0: 250, x1: 1050, y0: 2060, y1: 2650, pitch: 85, fill: 0.5, hMin: 90, hMax: 270, hPow: 1.3, office: 0.9, lit: 0.42, warmth: 0.15, rot: 0.05, side: 'kowloon', lampEvery: 1, lampStep: 40 },
  { name: '西九文化', x0: -520, x1: 250, y0: 1930, y1: 2250, pitch: 95, fill: 0.22, hMin: 8, hMax: 35, hPow: 1.5, office: 1, lit: 0.3, warmth: 0.3, rot: 0.05, side: 'kowloon', lampEvery: 1, lampStep: 30 },
  { name: '广东道', x0: 1165, x1: 1330, y0: 1080, y1: 1835, pitch: 60, fill: 0.9, hMin: 22, hMax: 110, hPow: 2.4, office: 1, lit: 0.5, warmth: 0.3, rot: -0.06, side: 'kowloon', lampEvery: 1, lampStep: 30 },
  { name: '尖沙咀', x0: 1330, x1: 2420, y0: 1120, y1: 2500, pitch: 52, fill: 0.72, hMin: 25, hMax: 125, hPow: 1.9, office: 0.55, lit: 0.4, warmth: 0.4, rot: -0.35, side: 'kowloon', lampEvery: 2, lampStep: 38 },
  { name: '红磡', x0: 2420, x1: 4300, y0: 1420, y1: 2700, pitch: 62, fill: 0.58, hMin: 25, hMax: 150, hPow: 1.6, office: 0.4, lit: 0.34, warmth: 0.45, rot: -0.35, side: 'kowloon', lampEvery: 2, lampStep: 45 },
  { name: '油尖旺', x0: -300, x1: 2600, y0: 2500, y1: 5000, pitch: 80, fill: 0.55, hMin: 30, hMax: 120, hPow: 1.5, office: 0.2, lit: 0.28, warmth: 0.6, rot: 0.0, side: 'kowloon', lampEvery: 3, lampStep: 50 },
  { name: '大角咀', x0: -1700, x1: -300, y0: 2000, y1: 4600, pitch: 85, fill: 0.45, hMin: 60, hMax: 190, hPow: 1.2, office: 0.15, lit: 0.28, warmth: 0.55, rot: 0.25, side: 'kowloon', lampEvery: 3, lampStep: 55 },
  { name: '九龙东', x0: 4300, x1: 8200, y0: 2100, y1: 5000, pitch: 105, fill: 0.45, hMin: 20, hMax: 120, hPow: 1.6, office: 0.35, lit: 0.3, warmth: 0.5, rot: -0.5, side: 'kowloon', lampEvery: 3, lampStep: 60 },
  { name: '金钟湾仔', x0: 1700, x1: 4700, y0: -700, y1: 900, pitch: 52, fill: 0.7, hMin: 30, hMax: 230, hPow: 1.55, office: 0.6, lit: 0.38, warmth: 0.35, rot: -0.1, side: 'island', lampEvery: 2, lampStep: 35 },
  { name: '铜锣湾', x0: 4700, x1: 6800, y0: -900, y1: 1400, pitch: 70, fill: 0.6, hMin: 30, hMax: 180, hPow: 1.6, office: 0.4, lit: 0.34, warmth: 0.45, rot: -0.15, side: 'island', lampEvery: 3, lampStep: 45 },
  { name: '上环以西', x0: -3600, x1: -830, y0: -650, y1: 800, pitch: 55, fill: 0.7, hMin: 25, hMax: 160, hPow: 1.5, office: 0.25, lit: 0.28, warmth: 0.6, rot: 0.12, side: 'island', lampEvery: 2, lampStep: 35 },
];

/** 西九 480 m 通用超高层的位置（模拟米）。 */
export const MEGA_TOWER = { x: 529, y: 2261, w: 66, d: 66, height: 480 } as const;

export interface MassingInput {
  /** 港岛两翼地面高度（米）。 */
  ground: (x: number, y: number) => number;
  isWater: (x: number, y: number) => boolean;
  /** 数据范围（模拟米）：两翼不进入。 */
  bbox: readonly [number, number, number, number];
}

export interface Massing {
  boxes: BoxSpec[];
  glows: GlowSpec[];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LED_KINDS: readonly KindId[] = [Kind.LedWhite, Kind.LedWhite, Kind.LedGold, Kind.LedBlue];

export function buildMassing(input: MassingInput, seed = 20261124): Massing {
  const rand = mulberry32(seed);
  const boxes: BoxSpec[] = [];
  const glows: GlowSpec[] = [];
  const [bx0, by0, bx1, by1] = input.bbox;
  const mega = MEGA_TOWER;

  for (const z of ZONES) {
    const c = Math.cos(z.rot);
    const s = Math.sin(z.rot);
    const cx = (z.x0 + z.x1) / 2;
    const cy = (z.y0 + z.y1) / 2;
    // 旋转后的格网覆盖整块区域
    const span = Math.hypot(z.x1 - z.x0, z.y1 - z.y0) / 2;
    const n = Math.ceil(span / z.pitch);
    for (let gj = -n; gj <= n; gj++) {
      for (let gi = -n; gi <= n; gi++) {
        const lx = gi * z.pitch;
        const ly = gj * z.pitch;
        const x = cx + lx * c - ly * s;
        const y = cy + lx * s + ly * c;
        if (x < z.x0 || x > z.x1 || y < z.y0 || y > z.y1) continue;
        const r = rand();
        const r2 = rand();
        const r3 = rand();
        const r4 = rand();
        if (r > z.fill) continue;
        // 港式楼宇偏瘦：18–48 m，不超过格距的 85 %
        const w = Math.min(18 + 30 * r2, z.pitch * 0.85);
        const d = Math.min(16 + 26 * r3, z.pitch * 0.85);
        const rad = Math.hypot(w, d) / 2;
        // 九龙地台 4 mPD；楼底略埋进地里
        let base = 2;
        let groundTop = 4;
        if (z.side === 'kowloon') {
          if (y - rad < kowloonShoreY(x) + 25) continue;
          if (Math.hypot(x - mega.x, y - mega.y) < 75) continue;
        } else {
          if (x + rad > bx0 - 15 && x - rad < bx1 + 15 && y + rad > by0 - 15 && y - rad < by1 + 15) continue;
          let wet = false;
          let gmax = -Infinity;
          let gmin = Infinity;
          for (const [ox, oy] of [
            [-w / 2, -d / 2],
            [w / 2, -d / 2],
            [w / 2, d / 2],
            [-w / 2, d / 2],
            [0, 0],
          ] as const) {
            const px = x + ox * c - oy * s;
            const py = y + ox * s + oy * c;
            if (input.isWater(px, py)) wet = true;
            const g = input.ground(px, py);
            gmax = Math.max(gmax, g);
            gmin = Math.min(gmin, g);
          }
          if (wet || gmax > 90) continue;
          base = gmin - 1;
          groundTop = gmax;
        }
        let height = z.hMin + (z.hMax - z.hMin) * Math.pow(r4, z.hPow);
        // 偶有更高的楼（住宅区里的新式高层）
        if (rand() < 0.04) height *= 1.5;
        const office = rand() < z.office;
        let kind: KindId = office ? Kind.WallOffice : Kind.WallHome;
        // 海旁商业楼的静态 LED 外墙：极少
        const nearShore = z.side === 'kowloon' && y < kowloonShoreY(x) + 260;
        if (nearShore && office && height > 50 && rand() < 0.16) kind = LED_KINDS[Math.floor(rand() * LED_KINDS.length)]!;
        const seedV = rand();
        const top = groundTop + height;
        boxes.push({ x, y, w, d, rot: z.rot, base, height: top - base, kind, seed: seedV, lit: z.lit * (0.75 + 0.5 * rand()), warmth: office ? z.warmth * 0.5 : z.warmth });
        // 楼顶：高楼两角白灯；最高的楼加航空障碍灯（红，部分慢闪）
        if (height > 120 && rand() < 0.3) {
          for (const k of [0, 2]) {
            const ox = (k === 0 ? -w : w) / 2;
            const oy = (k === 0 ? -d : d) / 2;
            glows.push({ x: x + ox * c - oy * s, y: y + ox * s + oy * c, z: top + 0.5, colour: 'crownWhite', intensity: 3, radius: 0.6 });
          }
        }
        // 航空灯只给极少数最高的楼（照片里这个距离几乎看不到红点）
        if (height > 200 && rand() < 0.12) glows.push({ x, y, z: top + 3, colour: 'aviation', intensity: 2, radius: 0.35, blinkHz: rand() < 0.6 ? 0.75 : 0, phase: rand() });
      }
    }
    // 街灯：沿格网的街（楼与楼之间的中线）
    for (let gj = -n; gj <= n; gj += z.lampEvery) {
      const ly = (gj + 0.5) * z.pitch;
      for (let t = -span; t <= span; t += z.lampStep) {
        const x = cx + t * c - ly * s;
        const y = cy + t * s + ly * c;
        if (x < z.x0 || x > z.x1 || y < z.y0 || y > z.y1) continue;
        let gz = 4;
        if (z.side === 'kowloon') {
          if (y < kowloonShoreY(x) + 15) continue;
        } else {
          if (x > bx0 - 10 && x < bx1 + 10 && y > by0 - 10 && y < by1 + 10) continue;
          if (input.isWater(x, y)) continue;
          gz = input.ground(x, y);
          if (gz > 140) continue;
        }
        const sodium = rand() < z.warmth * 0.8;
        glows.push({ x, y, z: gz + 9, colour: sodium ? 'sodium' : 'ledWhite', intensity: sodium ? 7 : 9, radius: 0.3 });
      }
    }
  }

  // 西九 480 m 超高层：通用方塔，微收分；四角每 30 m 一个静态白灯，顶部航空灯
  boxes.push({ x: mega.x, y: mega.y, w: mega.w, d: mega.d, rot: 0.05, base: 2, height: mega.height + 2, kind: Kind.WallOffice, seed: 0.37, lit: 0.55, warmth: 0.1 });
  const mc = Math.cos(0.05);
  const ms = Math.sin(0.05);
  for (const [ox, oy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const px = mega.x + (ox * mega.w * 0.5) * mc - (oy * mega.d * 0.5) * ms;
    const py = mega.y + (ox * mega.w * 0.5) * ms + (oy * mega.d * 0.5) * mc;
    for (let zz = 60; zz <= mega.height; zz += 30) glows.push({ x: px, y: py, z: zz, colour: 'crownWhite', intensity: 3.2, radius: 0.8 });
    glows.push({ x: px, y: py, z: mega.height + 4, colour: 'aviation', intensity: 6, radius: 0.7, blinkHz: 0.75, phase: (ox + oy + 2) * 0.1 });
  }

  // 九龙海旁步道灯：沿岸线约每 14 m 一盏（间距 ±30 %、亮度 0.4–1.2 倍、白光与暖光混用），向陆地内收 6 m；
  // 码头、货运区一带留出 60–150 m 的空档——不再是机场跑道一样等距等亮的一串珠子
  const shore = shorePolyline(-520, 2420, 20);
  let next = 0;
  let acc = 0;
  let gapUntil = -1;
  for (let i = 0; i + 1 < shore.length; i++) {
    const [ax, ay] = shore[i]!;
    const [bx, by] = shore[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    while (next <= acc + len) {
      const k = (next - acc) / len;
      if (next > gapUntil) {
        if (rand() < 0.012) gapUntil = next + 60 + 90 * rand();
        else {
          const warm = rand() < 0.35;
          glows.push({ x: ax + (bx - ax) * k + nx * 6, y: ay + (by - ay) * k + ny * 6, z: 7 + 3 * rand(), colour: warm ? 'sodium' : 'ledWhite', intensity: 5 * (0.4 + 0.8 * rand()), radius: 0.3 });
        }
      }
      next += 14 * (0.7 + 0.6 * rand());
    }
    acc += len;
  }
  return { boxes, glows };
}

/** 九龙岸线折线（按 x 等距取样，step 米）。 */
export function shorePolyline(x0: number, x1: number, step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x += step) out.push([x, kowloonShoreY(x)]);
  return out;
}
