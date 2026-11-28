/**
 * 人群（R2 STREETLIFE S1，纯函数，可测）：每个行人的外形（身高、体型、衣着配色）与任意时刻的位置。
 * 位置只取决于模拟时钟 t 与固定种子（同一 t 截图相同）：
 * - 走路的人：沿走线环（walkways.ts）匀速走，s = u0 + v·t（自动取模）；
 * - 过路的人：每个过路处两侧路缘各一群，在行人红灯时陆续到达候车（淡入），绿色行人亮起后按排先后起步，
 *   横过车行道（只在斑马线的 ±1.7 m 内、只在 [PED_GREEN, PED_FLASH) 内踏上车行道），到对面后沿人行道走几米淡出；
 * - 候车的人：巴士站、电车站台（setWaitingAreas）原地站着轻微晃动。
 * 衣着（R4，route-facts §9 照片 12，2026-11 18:45）：上衣约 45 % 深色、30 % 白 / 浅色（白恤衫、浅蓝衬衫）、15 % 中灰 / 卡其 / 橄榄、
 * 10 % 饱和色（粉、紫、红）；下装多为深色长裤 / 牛仔裤，部分卡其与裙；约四成背背包、三成五拿着手机（低头）、少数戴口罩。
 * 近景人形（figure.ts）另用发型、外套、袖长、裙、鞋、包、口罩等字段；远景低模只用上衣 / 下装 / 肤色 / 发色。
 */
import { hash32 } from '../streets/lamp-placement';
import { PED_GREEN, SIGNAL_CYCLE_S } from '../streets/signals';
import { linearRGB, type V3 } from '../streets/prop-geometry';
import { CROSSING_HALF_M, inCore, pathPose, type CrossingSite, type WalkClass, type WalkContext, type WalkPath, footOk } from './walkways';

const unit = (seed: number, salt: number) => hash32(Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(salt + 17, 0x85ebca77)) / 4294967296;

/** 每米（单侧行人路，两个方向合计）人数：20:00，核心区；核心区外 × OUTSIDE。 */
export const DENSITY: Record<WalkClass, number> = { main: 0.45, side: 0.2, street: 0.25, bridge: 0.35 };
export const OUTSIDE = 0.3;
/**
 * R4（route-facts §9）：行人密度随钟点的倍率（纯函数）。DENSITY 是 20:00 前的满员值；德辅道中 20:00–21:00 约 0.3 人/米，
 * 21:30 后约 0.07–0.1，金钟道 18:45 下班高峰约 0.8。
 */
const CLOCK_DENSITY: readonly (readonly [number, number])[] = [
  [18, 1.5],
  [18.75, 1.6],
  [19.5, 1.0],
  [20, 0.75],
  [21, 0.55],
  [21.5, 0.28],
  [23, 0.14],
  [26, 0.05],
];
export function clockDensity(clock: number): number {
  const t = CLOCK_DENSITY;
  if (clock <= t[0]![0]) return t[0]![1];
  for (let i = 1; i < t.length; i++) {
    const [x1, y1] = t[i]!;
    if (clock <= x1) {
      const [x0, y0] = t[i - 1]!;
      return y0 + ((y1 - y0) * (clock - x0)) / (x1 - x0);
    }
  }
  return t[t.length - 1]![1];
}

/** 步行速度（m/s）与步幅（一个完整步态周期两步，m）。 */
export const WALK_SPEED = 1.25;
export const STRIDE_M = 1.37;

/** 衣着色板（sRGB）。 */
export const PALETTE = {
  // R4：照片 12 实测深色上衣 #100d0c–#262027
  dark: ['#100d0c', '#1b1b20', '#22232a', '#262027', '#181c26', '#141012'],
  // 中灰 / 卡其 / 橄榄 / 写字楼的蓝
  mid: ['#5a5650', '#685749', '#4a4d52', '#6e6a62', '#5b6048', '#7a7266', '#3f5f8f', '#5b7aa6', '#8a7a5c'],
  // 白恤衫、浅蓝衬衫（照片 12 #b1bcb2）、米色
  light: ['#e8e6e0', '#f0efe9', '#b1bcb2', '#c4d4e8', '#d8d4cc', '#dbc8a0', '#b9c8da'],
  // 饱和色：粉（照片 12 #ae605d）、紫、红、蓝、芥末黄
  accent: ['#ae605d', '#6a4a8a', '#8a2430', '#2f5c8a', '#a8742a', '#c25a7a'],
  skin: ['#c99c7a', '#b5876a', '#9e7058', '#d8b090'],
  // 八成以上黑 / 深褐，部分染棕，少数花白
  hair: ['#0b0908', '#120e0c', '#1a1512', '#2a2018', '#4a3020', '#6a5a50'],
  shoe: ['#141414', '#1e1a18', '#d8d6d0', '#5a3e2a', '#2a2e36'],
  bag: ['#121212', '#1c1c20', '#2a2e3a', '#4a4440', '#6a4a36', '#c8a8b0', '#3a4a3a'],
} as const;

/** 发型（近景人形）：0 短发、1 侧分、2 齐耳短发、3 长发、4 马尾、5 棒球帽。 */
export const HAIR_STYLES = ['short', 'sidePart', 'bob', 'long', 'ponytail', 'cap'] as const;
/** 发型的「长发」形变量（figure.ts aMorph 的倍数）。 */
export const HAIR_LENGTH = [0, 0, 0.45, 1, 0, 0] as const;
/** 随身包：0 无、1 背包、2 斜挎包、3 托特包 / 手袋、4 公文包。 */
export type Carry = 0 | 1 | 2 | 3 | 4;

export type Tone = 'dark' | 'mid' | 'light' | 'accent';

/** 上衣色调的比例（累计阈值）。 */
const TOP_SHARE: [Tone, number][] = [
  ['dark', 0.45],
  ['light', 0.75],
  ['mid', 0.9],
  ['accent', 1],
];
const BOTTOM_SHARE: [Tone, number][] = [
  ['dark', 0.74],
  ['mid', 0.97],
  ['light', 1],
];

const pick = (share: [Tone, number][], r: number): Tone => share.find(([, c]) => r < c)?.[0] ?? 'dark';

export interface Look {
  topTone: Tone;
  top: V3;
  bottom: V3;
  skin: V3;
  hair: V3;
  /** 身高（m）1.55–1.85，平均约 1.68。 */
  height: number;
  /** 体型宽度系数（肩宽 0.42–0.48 m 对应 0.93–1.07）。 */
  build: number;
  /** 手上亮着手机屏幕（R4：约 35 %，低头看手机）。 */
  phone: boolean;
  /** R4 近景人形：女性（身高、肩宽、发型的分布不同）。 */
  female: boolean;
  /** 发型下标（HAIR_STYLES）。 */
  hairStyle: number;
  /** 外套（深色西装外套 / 夹克，胸前 V 领露出衬衫 shirt）。 */
  jacket: boolean;
  shirt: V3;
  /** 短袖（前臂与上臂下半露皮肤）。 */
  shortSleeve: boolean;
  /** 裙（膝上露腿；约三成女性）。 */
  skirt: boolean;
  shoe: V3;
  carry: Carry;
  bag: V3;
  /** 口罩（约 12 %）。 */
  mask: boolean;
}

/** 由种子定外形（纯函数）。 */
export function lookOf(seed: number): Look {
  const topTone = pick(TOP_SHARE, unit(seed, 1));
  const botTone = pick(BOTTOM_SHARE, unit(seed, 2));
  const from = (list: readonly string[], r: number) => linearRGB(list[Math.floor(r * list.length) % list.length]!);
  // R4：女性平均 1.59 m（1.55–1.72，偏低的三角分布）、男性平均 1.71 m（1.60–1.82）
  const female = unit(seed, 12) < 0.5;
  const u5 = unit(seed, 5);
  const u6 = unit(seed, 6);
  const h = female ? 1.55 + 0.17 * u5 * u6 : 1.6 + 0.22 * ((u5 + u6) / 2);
  // 发型：男 短 55 %、侧分 35 %、帽 7 %、长 3 %；女 齐耳 30 %、长 30 %、马尾 25 %、短 10 %、帽 5 %
  const hr = unit(seed, 13);
  const hairStyle = female ? (hr < 0.3 ? 2 : hr < 0.6 ? 3 : hr < 0.85 ? 4 : hr < 0.95 ? 0 : 5) : hr < 0.55 ? 0 : hr < 0.9 ? 1 : hr < 0.97 ? 5 : 3;
  // 外套：深色或中色上衣的人约三成（写字楼西装外套），衬衫白 / 浅蓝
  const jacket = (topTone === 'dark' || topTone === 'mid') && unit(seed, 14) < 0.32;
  // 发色：八成五黑 / 深褐，一成染棕，少数花白（u² 偏向前面的黑色）
  const hc = unit(seed, 9);
  const hair = linearRGB(PALETTE.hair[hc < 0.86 ? Math.floor((hc / 0.86) * 3) : hc < 0.96 ? 3 + Math.floor(((hc - 0.86) / 0.1) * 2) : 5]!);
  const cr = unit(seed, 16);
  const carry: Carry = cr < 0.4 ? 1 : cr < 0.6 ? 2 : cr < 0.72 ? 3 : cr < 0.77 && !female ? 4 : 0;
  return {
    topTone,
    top: from(PALETTE[topTone], unit(seed, 3)),
    bottom: from(PALETTE[botTone], unit(seed, 4)),
    skin: from(PALETTE.skin, unit(seed, 8)),
    hair,
    height: Math.min(Math.max(h, 1.55), 1.85),
    build: 0.96 + 0.08 * unit(seed, 10),
    phone: unit(seed, 11) < 0.35,
    female,
    hairStyle,
    jacket,
    shirt: from(['#f0efe9', '#e8e6e0', '#c4d4e8', '#b1bcb2'], unit(seed, 15)),
    shortSleeve: !jacket && unit(seed, 17) < 0.4,
    skirt: female && unit(seed, 18) < 0.3,
    shoe: from(PALETTE.shoe, unit(seed, 19) * (0.6 + 0.4 * unit(seed, 20))),
    carry,
    bag: from(PALETTE.bag, unit(seed, 21) * unit(seed, 21) * 0.999),
    mask: unit(seed, 22) < 0.12,
  };
}

/** 一个行人此刻的姿态（模拟米）。 */
export interface AgentPose {
  x: number;
  y: number;
  z: number;
  /** 朝向（模拟坐标单位向量）。 */
  hx: number;
  hy: number;
  /** 步态幅度 0（站着）–1（走路）。 */
  walk: number;
  /** 步态相位（弧度）。 */
  phase: number;
  /** 淡入淡出（整体缩放 0–1）。 */
  scale: number;
  seed: number;
}

interface Walker {
  path: number;
  u0: number;
  v: number;
  seed: number;
}

/** 过路的人：side 0 = 道路左侧（+n）路缘出发。 */
interface Crosser {
  site: number;
  side: 0 | 1;
  /** 候车位置（横向离路缘线 d，沿路 u）。 */
  d: number;
  u: number;
  /** 过路时走的沿路位置（靠左）。 */
  lane: number;
  delay: number;
  v: number;
  /** 绿色行人亮起前多久到达（s）。 */
  wait: number;
  /** 到对面后沿路走的方向（±1）与距离（m）。 */
  leaveDir: number;
  leaveLen: number;
  seed: number;
}

interface Waiter {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  seed: number;
}

/** 候车区（巴士站、电车站台）：中心、长轴方向（单位向量）、长宽（m）、地面高（mPD）、朝向（面向哪边，单位向量）。 */
export interface WaitingArea {
  centre: readonly [number, number];
  axis: readonly [number, number];
  length: number;
  width: number;
  z: number;
  /** 人面向的方向（缺省：长轴的左法线）。 */
  face?: readonly [number, number];
  /** 人数（缺省按面积 3–8）。 */
  count?: number;
  seed?: number;
}

export interface CrowdOptions {
  /** 密度倍率（LOW 档 0.5）。 */
  density?: number;
  seed?: number;
}

/** 过路处每侧的人数（纯函数）。 */
export function crossersPerSide(site: Pick<CrossingSite, 'signal' | 'core' | 'main' | 'id'>, seed: number): number {
  const r = unit(seed + site.id * 31, 40);
  // 核心区大街（灯控或斑马线）一侧 4–11 人；其余灯控 2–6 人，斑马线 1–3 人
  let n = site.main && site.core ? 4 + Math.floor(r * 8) : site.signal ? 2 + Math.floor(r * 5) : 1 + Math.floor(r * 3);
  if (!site.core) n = Math.floor(n * 0.4 + unit(seed + site.id, 41));
  return n;
}

/** 过路处的周期起点（绿色行人亮起）：t 所在周期的起点 G（s），G ≤ t < G + 60。 */
export function greenStart(t: number, phase: number): number {
  const k = Math.floor(t / SIGNAL_CYCLE_S + phase - PED_GREEN);
  return (k + PED_GREEN - phase) * SIGNAL_CYCLE_S;
}

/** 淡入淡出时长（s）。 */
const FADE_S = 0.6;

export class Crowd {
  readonly walkers: Walker[] = [];
  readonly crossers: Crosser[] = [];
  readonly waiters: Waiter[] = [];
  /** 各走线的走路人下标范围 [起, 止)。 */
  private readonly ranges: [number, number][] = [];
  /** 各过路处的相位（NaN 已按种子补上）。 */
  readonly sitePhase: number[];
  private readonly pose = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };

  constructor(
    readonly paths: readonly WalkPath[],
    readonly sites: readonly CrossingSite[],
    readonly ctx: WalkContext | null,
    opts: CrowdOptions = {},
  ) {
    const k = opts.density ?? 1;
    const seed = opts.seed ?? 20261125;
    for (const p of paths) {
      const dens = DENSITY[p.cls] * (p.core ? 1 : OUTSIDE) * k;
      const want = dens * p.side;
      const n = Math.floor(want + unit(seed + p.id, 1));
      const from = this.walkers.length;
      for (let i = 0; i < n; i++) {
        const s = seed + p.id * 7919 + i * 104729;
        this.walkers.push({ path: p.id, u0: ((i + 0.8 * (unit(s, 2) - 0.5)) * p.len) / n, v: WALK_SPEED * (0.86 + 0.3 * unit(s, 3)), seed: s >>> 0 });
      }
      this.ranges[p.id] = [from, this.walkers.length];
    }
    this.sitePhase = sites.map((c) => (Number.isNaN(c.phase) ? unit(seed + c.id, 50) : c.phase));
    for (const c of sites) {
      if (!c.kerbs) continue;
      for (const side of [0, 1] as const) {
        const kb = c.kerbs[side];
        const n = Math.round(crossersPerSide(c, seed) * k);
        const rows = Math.max(1, Math.min(4, Math.floor(kb.depth / 0.55) + 1));
        for (let i = 0; i < n && i < rows * 6; i++) {
          const s = (seed + c.id * 1013 + side * 577 + i * 7907) >>> 0;
          const row = Math.floor(i / 6);
          const col = i % 6;
          const lane = (side === 0 ? 1 : -1) * (0.25 + 1.35 * unit(s, 5));
          // 离开方向：两个方向里能走得最远的（检查人行道是否合格）
          const sgn = side === 0 ? -1 : 1; // 对面在 −n（side 0）或 +n
          const nx = -c.ty;
          const ny = c.tx;
          const across = sgn * (c.hw + 0.6 + 0.4 * unit(s, 6));
          const pref = unit(s, 7) < 0.5 ? 1 : -1;
          let leaveDir = pref;
          let leaveLen = 0;
          for (const dir of [pref, -pref]) {
            let len = 0;
            for (let m = 1; m <= 12; m++) {
              const px = c.x + nx * across + c.tx * (lane + dir * m);
              const py = c.y + ny * across + c.ty * (lane + dir * m);
              if (ctx && !footOk(ctx, px, py, c.plan, 0.25)) break;
              len = m;
            }
            if (len > leaveLen) {
              leaveLen = len;
              leaveDir = dir;
            }
          }
          this.crossers.push({
            site: c.id,
            side,
            d: Math.min(row * 0.55 + 0.1 * unit(s, 1), Math.max(kb.depth - 0.1, 0)),
            u: -CROSSING_HALF_M + 0.45 + col * 0.62 + 0.2 * (unit(s, 2) - 0.5),
            lane,
            delay: 0.2 + row * 0.7 + 0.8 * unit(s, 3),
            v: WALK_SPEED * (0.92 + 0.24 * unit(s, 4)),
            wait: 3 + 27 * unit(s, 8),
            leaveDir,
            leaveLen: Math.min(leaveLen, 6 + 6 * unit(s, 9)),
            seed: s,
          });
        }
      }
    }
  }

  /** 候车区里站着的人（巴士站、电车站台）。重设会替换旧的。 */
  setWaitingAreas(areas: readonly WaitingArea[], seed = 7): void {
    this.waiters.length = 0;
    areas.forEach((a, ai) => {
      const al = Math.hypot(a.axis[0], a.axis[1]) || 1;
      const ax = a.axis[0] / al;
      const ay = a.axis[1] / al;
      const face = a.face ?? [-ay, ax];
      const s0 = (a.seed ?? ai) * 2654435761 + seed;
      const n = a.count ?? Math.min(8, Math.max(3, Math.round(a.length * a.width * 0.25 + 3 * unit(s0, 1))));
      for (let i = 0; i < n; i++) {
        const s = (s0 + i * 7919) >>> 0;
        const along = (unit(s, 2) - 0.5) * a.length * 0.9;
        const across = (unit(s, 3) - 0.5) * a.width * 0.8;
        // 大多面向车来的方向，少数侧身 / 背对
        const turn = (unit(s, 4) - 0.5) * (unit(s, 5) < 0.75 ? 1.2 : 4);
        const c = Math.cos(turn);
        const sn = Math.sin(turn);
        this.waiters.push({
          x: a.centre[0] + ax * along - ay * across,
          y: a.centre[1] + ay * along + ax * across,
          z: a.z,
          hx: face[0] * c - face[1] * sn,
          hy: face[0] * sn + face[1] * c,
          seed: s,
        });
      }
    });
  }

  /** 过路的人在时刻 t 的姿态；不在场返回 false。 */
  crosserPose(a: Crosser, t: number, out: AgentPose): boolean {
    const c = this.sites[a.site]!;
    const G = greenStart(t, this.sitePhase[a.site]!);
    const tau = t - G;
    const nx = -c.ty;
    const ny = c.tx;
    const sgn = a.side === 0 ? 1 : -1; // 出发一侧
    const kb = c.kerbs![a.side];
    const kerbLine = c.hw + 0.5;
    const slotX = c.x + nx * sgn * (kerbLine + a.d) + c.tx * a.u;
    const slotY = c.y + ny * sgn * (kerbLine + a.d) + c.ty * a.u;
    out.seed = a.seed;
    // 路径：候车位 → 本侧路缘（lane）→ 对侧路缘外 0.6 m → 沿路离开
    const p1x = c.x + nx * sgn * (c.hw + 0.15) + c.tx * a.lane;
    const p1y = c.y + ny * sgn * (c.hw + 0.15) + c.ty * a.lane;
    const p2x = c.x - nx * sgn * (c.hw + 0.6) + c.tx * a.lane;
    const p2y = c.y - ny * sgn * (c.hw + 0.6) + c.ty * a.lane;
    const p3x = p2x + c.tx * a.leaveDir * a.leaveLen;
    const p3y = p2y + c.ty * a.leaveDir * a.leaveLen;
    const l1 = Math.hypot(p1x - slotX, p1y - slotY);
    const l2 = Math.hypot(p2x - p1x, p2y - p1y);
    const l3 = a.leaveLen;
    const walkT = (l1 + l2 + l3) / a.v;
    const fadeIn = (x: number) => Math.min(Math.max(x / FADE_S, 0), 1);
    const far = c.kerbs![1 - a.side]!;
    // 放行延迟（车还压在过路处上就等）；不放行的周期整个周期都在等
    const rel = this.release ? this.release(a.site, G) : 0;
    const start = Number.isFinite(rel) ? a.delay + rel : Infinity;
    if (tau < start || tau >= SIGNAL_CYCLE_S - a.wait) {
      // 候车：上一周期（或本周期末）到达
      const since = tau < start ? tau + a.wait : tau - (SIGNAL_CYCLE_S - a.wait);
      out.x = slotX;
      out.y = slotY;
      out.z = kb.z;
      out.hx = -nx * sgn;
      out.hy = -ny * sgn;
      out.walk = 0;
      out.phase = (a.seed % 628) / 100 + t * 0.7;
      out.scale = fadeIn(since);
      return out.scale > 0;
    }
    const d = (tau - start) * a.v;
    if (d >= l1 + l2 + l3) return false;
    let x: number;
    let y: number;
    let hx: number;
    let hy: number;
    let z: number;
    if (d < l1) {
      const f = l1 > 0 ? d / l1 : 1;
      x = slotX + (p1x - slotX) * f;
      y = slotY + (p1y - slotY) * f;
      hx = (p1x - slotX) / (l1 || 1);
      hy = (p1y - slotY) / (l1 || 1);
      z = kb.z;
    } else if (d < l1 + l2) {
      const f = (d - l1) / l2;
      x = p1x + (p2x - p1x) * f;
      y = p1y + (p2y - p1y) * f;
      hx = (p2x - p1x) / l2;
      hy = (p2y - p1y) / l2;
      z = c.z + 0.02;
    } else {
      const f = l3 > 0 ? (d - l1 - l2) / l3 : 1;
      x = p2x + (p3x - p2x) * f;
      y = p2y + (p3y - p2y) * f;
      hx = c.tx * a.leaveDir;
      hy = c.ty * a.leaveDir;
      z = far.z;
    }
    out.x = x;
    out.y = y;
    out.z = z;
    out.hx = hx;
    out.hy = hy;
    out.walk = 1;
    out.phase = ((d / STRIDE_M) * Math.PI * 2) % (Math.PI * 2);
    out.scale = Math.min(fadeIn(walkT - (tau - start)), 1);
    return out.scale > 0;
  }

  /** 走路的人在时刻 t 的姿态。 */
  walkerPose(w: Walker, t: number, out: AgentPose): void {
    const p = this.paths[w.path]!;
    const s = w.u0 + w.v * t;
    pathPose(p, s, this.pose);
    out.x = this.pose.x;
    out.y = this.pose.y;
    out.z = this.pose.z;
    out.hx = this.pose.hx;
    out.hy = this.pose.hy;
    out.walk = 1;
    out.phase = ((s / STRIDE_M) * Math.PI * 2) % (Math.PI * 2);
    out.scale = 1;
    out.seed = w.seed;
  }

  /**
   * 收集 (cx, cy, cz)（模拟米）三维距离 radius 内的全部行人，写进 out（复用对象），返回个数（≤ out.length）。
   * 走线按包围盒粗筛。
   */
  gather(cx: number, cy: number, cz: number, radius: number, t: number, out: AgentPose[]): number {
    let n = 0;
    const r2 = radius * radius;
    const cap = out.length;
    const take = (p: AgentPose): boolean => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dz = p.z - cz;
      return dx * dx + dy * dy + dz * dz <= r2;
    };
    for (const p of this.paths) {
      const [a, b, c, d] = p.box;
      const ex = Math.max(a - cx, 0, cx - c);
      const ey = Math.max(b - cy, 0, cy - d);
      if (ex * ex + ey * ey > r2) continue;
      const [from, to] = this.ranges[p.id] ?? [0, 0];
      for (let i = from; i < to && n < cap; i++) {
        this.walkerPose(this.walkers[i]!, t, out[n]!);
        if (take(out[n]!)) n++;
      }
    }
    for (const a of this.crossers) {
      if (n >= cap) break;
      const c = this.sites[a.site]!;
      const dx = c.x - cx;
      const dy = c.y - cy;
      if (dx * dx + dy * dy > (radius + 25) * (radius + 25)) continue;
      if (this.crosserPose(a, t, out[n]!) && take(out[n]!)) n++;
    }
    for (const w of this.waiters) {
      if (n >= cap) break;
      const o = out[n]!;
      o.x = w.x;
      o.y = w.y;
      o.z = w.z;
      o.hx = w.hx;
      o.hy = w.hy;
      o.walk = 0;
      o.phase = (w.seed % 628) / 100 + t * 0.6;
      o.scale = 1;
      o.seed = w.seed;
      if (take(o)) n++;
    }
    return n;
  }

  /** 放行延迟（车流模拟给出）：见 setRelease。 */
  private release: ((site: number, g: number) => number) | null = null;

  /**
   * 过路处的放行延迟：fn(site, g) 返回绿色行人灯起点 g 那个周期的放行延迟（s，≥ 0），还没放行 Infinity，
   * 该周期不放行 NaN（车流模拟 Traffic.releaseDelay：过路处上还有车身就等）。不设时绿灯一亮就走。
   */
  setRelease(fn: ((site: number, g: number) => number) | null): void {
    this.release = fn;
  }

  /** 各过路处的过路人下标（懒建）。 */
  private bySite: number[][] | null = null;

  /** 过路处此刻车行道上是否有人（测试用）：返回在车行道（|横距| < hw）内的人数。 */
  onCarriageway(site: number, t: number): number {
    const c = this.sites[site]!;
    if (!c.kerbs) return 0;
    if (!this.bySite) {
      this.bySite = this.sites.map(() => []);
      this.crossers.forEach((a, i) => this.bySite![a.site]!.push(i));
    }
    const o: AgentPose = { x: 0, y: 0, z: 0, hx: 1, hy: 0, walk: 0, phase: 0, scale: 0, seed: 0 };
    let k = 0;
    for (const i of this.bySite[site]!) {
      const a = this.crossers[i]!;
      if (!this.crosserPose(a, t, o)) continue;
      const across = (o.x - c.x) * -c.ty + (o.y - c.y) * c.tx;
      if (Math.abs(across) < c.hw) k++;
    }
    return k;
  }
}

/** 核心区判定（重新导出，测试用）。 */
export { inCore };
