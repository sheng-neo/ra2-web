/**
 * 视野（战争迷雾）：维护 unit.visible[队伍] 与 unit.bushId，约每 0.2 秒更新一次。
 *
 * 规则：己方单位恒可见；建筑、野怪恒可见；敌方英雄/小兵需在己方任一存活单位/建筑的视野半径内。
 * 草丛里的单位只对「同一草丛内」或「bushReveal 距离内」的观察者可见；草里出手会暴露 revealOnAttack 秒。
 */
import { VISION } from './data/units';
import type { SimUnit } from './internal';
import { pointInPolygon } from './map';
import type { MapData, PlayerTeam, Vec2 } from './types';
import type { Sim } from './world';

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boxCache = new WeakMap<MapData, Box[]>();

function bushBoxes(map: MapData): Box[] {
  let boxes = boxCache.get(map);
  if (!boxes) {
    boxes = map.bushes.map((poly) => {
      const b: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const p of poly) {
        b.minX = Math.min(b.minX, p.x);
        b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x);
        b.maxY = Math.max(b.maxY, p.y);
      }
      return b;
    });
    boxCache.set(map, boxes);
  }
  return boxes;
}

/** 所在草丛下标（包围盒预筛版的 bushAt） */
export function bushIndexAt(map: MapData, p: Vec2): number {
  const boxes = bushBoxes(map);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;
    if (pointInPolygon(p, map.bushes[i])) return i;
  }
  return -1;
}

const viewers: SimUnit[] = [];

export function updateVision(sim: Sim): void {
  const units = sim.units;
  const map = sim.map;
  const time = sim.state.time;
  const reveal2 = VISION.bushReveal * VISION.bushReveal;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.kind === 'hero' || u.kind === 'minion' || u.kind === 'monster') u.bushId = u.alive ? bushIndexAt(map, u.pos) : -1;
  }

  for (const team of [0, 1] as PlayerTeam[]) {
    viewers.length = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.alive && u.team === team && u.rt.sight > 0) viewers.push(u);
    }
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.team === team || u.kind === 'tower' || u.kind === 'core' || u.kind === 'monster' || !u.alive) {
        u.visible[team] = true;
        continue;
      }
      const inBush = u.bushId >= 0 && u.rt.revealUntil <= time;
      let seen = false;
      const ux = u.pos.x;
      const uy = u.pos.y;
      for (let k = 0; k < viewers.length; k++) {
        const v = viewers[k];
        const dx = v.pos.x - ux;
        const dy = v.pos.y - uy;
        const d2 = dx * dx + dy * dy;
        const sight = v.rt.sight;
        if (d2 > sight * sight) continue;
        if (inBush && v.bushId !== u.bushId && d2 > reveal2) continue;
        seen = true;
        break;
      }
      u.visible[team] = seen;
      // 记下敌方英雄最后一次被看到的位置（给 Bot 的公平记忆）
      if (seen && u.kind === 'hero') {
        const ls = sim.lastSeen[team][u.h.index];
        ls.x = ux;
        ls.y = uy;
        ls.time = time;
      }
    }
  }
}
