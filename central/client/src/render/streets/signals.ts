/**
 * 交通灯（realism C12）：props.signals 每处一支 3.6 m 灯杆 + 红 / 黄 / 绿三个光点（进静态 GlowBatch，
 * 用 GlowBatch 的闪烁参数做 60 s 周期：绿 0–45 %、黄 45–50 %、红 50–100 %，不用每帧写 CPU）。
 * 同一路口（40 m 格）同一相位；沿东西向道路的灯与沿南北向的错开半个周期。全部只取决于 uTime。
 * 灯杆立在最近道路的路缘外 0.6 m 的人行道上（高度 = 该路水平路面 centreZ），只在相机 300 m 内画（HIGH）。
 */
import type { FlatXY } from '@central/data';
import { simToThree } from '../../coords';
import type { HeightFn } from '../../data/terrain';
import { lightColour, type GlowBatch } from '../materials/lighting';
import { centreZ, projectOnto, type RoadPlan } from '../roads';
import { hash32 } from './lamp-placement';
import { NearProps, type NearItem } from './lamps';
import { createPropMaterial } from './prop-material';
import { PropBuilder, linearRGB } from './prop-geometry';

/** 信号周期（s）与各色在周期里的区间。 */
export const SIGNAL_CYCLE_S = 60;
export const GREEN_END = 0.45;
export const AMBER_END = 0.5;

export interface SignalHead {
  /** 灯杆底（three 坐标）。 */
  base: [number, number, number];
  /** 灯头朝向（指向路中，three xz）。 */
  dirX: number;
  dirZ: number;
  /** 周期相位 0–1。 */
  phase: number;
  /** 路口相位（0–1，同一路口相同）；沿东西向的灯 = junction，沿南北向的 = junction + 0.5。 */
  junction: number;
}

/** 周期相位 c（0–1）下亮哪盏：0 绿、1 黄、2 红（纯函数，与 GlowBatch 闪烁参数一致）。 */
export function signalState(c: number): 0 | 1 | 2 {
  const f = ((c % 1) + 1) % 1;
  return f < GREEN_END ? 0 : f < AMBER_END ? 1 : 2;
}

/**
 * surface：看得见的地面高度（dm，streets/surface.ts 的 RenderedSurface.heightAt）；缺省取最近道路的水平路面 centreZ。
 */
export function signalHeads(points: FlatXY, plans: readonly RoadPlan[], ground: HeightFn, surface?: HeightFn): SignalHead[] {
  const out: SignalHead[] = [];
  const near = plans.filter((p) => p.elev === 0 && p.road.cls !== 'pedestrian');
  const v = [0, 0, 0];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    // 最近的道路：定灯头朝向与东西 / 南北相位
    let best: { p: RoadPlan; d: number; s: number } | null = null;
    for (const p of near) {
      const hit = projectOnto(p.pts, p.along, x, y);
      if (hit.d < 300 && (!best || hit.d < best.d)) best = { p, d: hit.d, s: hit.s };
    }
    let tx = 1;
    let ty = 0;
    let toX = 1;
    let toY = 0;
    // OSM 的交通灯多标在路中线的节点上：灯杆挪到该路的路缘外 0.6 m（点在哪侧就挪到哪侧，正在中线上则放左侧——靠左行驶）
    let bx = x;
    let by = y;
    if (best) {
      const p = best.p;
      let k = 1;
      while (k < p.along.length - 1 && p.along[k]! < best.s) k++;
      const dx = p.pts[k * 2]! - p.pts[k * 2 - 2]!;
      const dy = p.pts[k * 2 + 1]! - p.pts[k * 2 - 1]!;
      const l = Math.hypot(dx, dy) || 1;
      tx = dx / l;
      ty = dy / l;
      // 指向路中：投影点 − 灯位
      const t = Math.min(Math.max((best.s - p.along[k - 1]!) / l, 0), 1);
      const px = p.pts[k * 2 - 2]! + dx * t - x;
      const py = p.pts[k * 2 - 1]! + dy * t - y;
      const pl = Math.hypot(px, py);
      // 侧：+1 = 道路左侧
      const side = pl > 1 && -ty * -px + tx * -py < 0 ? -1 : 1;
      const off = p.hw + 6;
      bx = x + px + -ty * side * off;
      by = y + py + tx * side * off;
      // 灯头朝路中
      toX = ty * side;
      toY = -tx * side;
    }
    const junction = hash32(Math.floor(x / 400) * 73856093 ^ Math.floor(y / 400) * 19349663) / 4294967296;
    const axis = Math.abs(tx) >= Math.abs(ty) ? 0 : 0.5;
    // 灯杆立在人行道上：地面道路横向水平，人行道与路面同高（centreZ），不按原始地形（坡路上会埋进地里或悬空）
    simToThree(bx, by, surface ? surface(bx, by) : best ? centreZ(best.p, best.s) : ground(bx, by), v);
    out.push({ base: [v[0]!, v[1]!, v[2]!], dirX: toX, dirZ: -toY, phase: (junction + axis) % 1, junction });
  }
  return out;
}

const HEAD_H = 3.4;

/** 灯头三个光点（红上、黄中、绿下）写进光点批，从 start 起，返回下一个下标。 */
export function writeSignalHeads(batch: GlowBatch, heads: readonly SignalHead[], start: number): number {
  const red = lightColour('#ff2a1a');
  const amber = lightColour('#ffae1a');
  const green = lightColour('#2dffa0');
  const hz = 1 / SIGNAL_CYCLE_S;
  let i = start;
  for (const h of heads) {
    const x = h.base[0] + h.dirX * 0.35;
    const z = h.base[2] + h.dirZ * 0.35;
    const y = h.base[1] + HEAD_H;
    const wrap = (p: number) => ((p % 1) + 1) % 1;
    batch.set(i++, [x, y + 0.32, z], red, 4, 0.11, hz, wrap(h.phase - AMBER_END), 1 - AMBER_END);
    batch.set(i++, [x, y, z], amber, 4, 0.11, hz, wrap(h.phase - GREEN_END), AMBER_END - GREEN_END);
    batch.set(i++, [x, y - 0.32, z], green, 4, 0.11, hz, wrap(h.phase), GREEN_END);
  }
  return i;
}

function signalGeometry() {
  const b = new PropBuilder();
  const metal = { alb: linearRGB('#2f3236') };
  b.box([0, 0, 0], [0.14, HEAD_H + 0.6, 0.14], metal, { bottom: null });
  // 灯箱（朝 +x，伸到 0.35 m 处）
  b.box([0.3, HEAD_H - 0.55, 0], [0.22, 1.1, 0.34], { alb: [0.012, 0.012, 0.012] }, { bottom: null });
  return b.build();
}

export function signalPoles(heads: readonly SignalHead[], radiusM: number): NearProps {
  const items: NearItem[] = heads.map((h) => ({ p: h.base, dirX: h.dirX, dirZ: h.dirZ, scale: 1 }));
  return new NearProps(signalGeometry(), createPropMaterial({ warmth: 0.4 }), items, radiusM, radiusM > 0 ? 250 : 1, 'signal-poles');
}

/** 方向（three xz）对应的信号相位：沿东西向 0、沿南北向 0.5（与 signalHeads 的 axis 一致）。 */
export function axisPhase(dx: number, dz: number): number {
  return Math.abs(dx) >= Math.abs(dz) ? 0 : 0.5;
}

/**
 * 车道终点的信号相位（纯函数）：车道终点 25 m 内有交通灯时取该路口相位 + 本车道方向的相位，否则 NaN（无灯）。
 * ends：每条车道终点（three x, z）与终点处行驶方向（three xz）。
 */
export function laneSignalPhases(ends: readonly { x: number; z: number; dx: number; dz: number }[], heads: readonly SignalHead[], reachM = 25): Float32Array {
  const out = new Float32Array(ends.length).fill(NaN);
  const cell = 50;
  const grid = new Map<string, number[]>();
  heads.forEach((h, i) => {
    const k = `${Math.floor(h.base[0] / cell)},${Math.floor(h.base[2] / cell)}`;
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  });
  ends.forEach((e, li) => {
    let best = reachM;
    for (let gx = Math.floor(e.x / cell) - 1; gx <= Math.floor(e.x / cell) + 1; gx++) {
      for (let gz = Math.floor(e.z / cell) - 1; gz <= Math.floor(e.z / cell) + 1; gz++) {
        for (const i of grid.get(`${gx},${gz}`) ?? []) {
          const h = heads[i]!;
          const d = Math.hypot(h.base[0] - e.x, h.base[2] - e.z);
          if (d < best) {
            best = d;
            out[li] = (h.junction + axisPhase(e.dx, e.dz)) % 1;
          }
        }
      }
    }
  });
  return out;
}
