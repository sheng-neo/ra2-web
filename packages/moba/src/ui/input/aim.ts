/**
 * 瞄准求解：把「拖动向量」(触控) 或「鼠标落在地面上的点」(键鼠) 换算成
 * 渲染层要画的指示器(AimIndicator) 与施法命令要带的参数(dir / pos / targetId)。
 *
 * 坐标约定：屏幕右 = 世界 +x(东)，屏幕下 = 世界 +y(南)——镜头朝北俯视，所以拖动方向可以直接当世界方向用。
 * 指示器以玩家英雄为原点；position 型的 pos 与命令里的 pos 一样是世界坐标。
 */
import { HEROES } from '../../core/data/heroes';
import type { CastSpec, HeroUnit, SkillSlot, Vec2 } from '../../core/types';
import type { AimIndicator } from '../../render/api';
import type { HudCtx } from '../hud/common';
import { SUMMONER_CAST } from '../hud/text';

export interface AimSolution {
  indicator: AimIndicator;
  dir?: Vec2;
  pos?: Vec2;
  targetId?: number;
}

export function castSpecOf(me: HeroUnit, slot: SkillSlot): CastSpec {
  return slot === 's1' || slot === 's2' || slot === 'ult' ? HEROES[me.heroId].skills[slot].cast : SUMMONER_CAST[slot];
}

/** 这个技能有没有可瞄准/可预览的东西（回城、恢复这种纯自身技能没有） */
export function isAimable(spec: CastSpec): boolean {
  return spec.type !== 'self' || spec.radius > 0;
}

/** 还没给出方向时的预览：只画一圈射程/范围 */
export function previewIndicator(spec: CastSpec): AimIndicator | null {
  if (spec.type === 'self') return spec.radius > 0 ? { kind: 'self', radius: spec.radius } : null;
  if (spec.type === 'target') return { kind: 'target', targetId: -1, range: spec.range };
  return { kind: 'self', radius: spec.range };
}

/** 指向型技能选目标时的射程余量：与模拟层自动瞄准「射程 + 少量余量」的口径一致 */
const TARGET_SLACK = 1;

/**
 * 在给定方向上挑一个可见的敌方英雄：夹角越小、距离越近越优先；偏离方向超过 maxAngle 的不要。
 * near 有值时(鼠标)改为优先离该点最近的。
 */
export function pickEnemyHero(ctx: HudCtx, dx: number, dy: number, range: number, maxAngle: number, near?: Vec2 | null, nearRadius = 0): number {
  const me = ctx.me;
  let best = -1;
  let bestScore = Infinity;
  for (const h of ctx.state.heroes) {
    if (h.team === ctx.team || !h.alive || !h.visible[ctx.team]) continue;
    const vx = h.pos.x - me.pos.x;
    const vy = h.pos.y - me.pos.y;
    const dist = Math.hypot(vx, vy);
    if (dist > range + h.radius + TARGET_SLACK) continue;
    let untargetable = false;
    for (const b of h.buffs) if (b.id === 'untargetable') untargetable = true;
    if (untargetable) continue;
    let score: number;
    if (near) {
      const nd = Math.hypot(h.pos.x - near.x, h.pos.y - near.y);
      if (nd > nearRadius + h.radius) continue;
      score = nd;
    } else {
      const cos = dist > 1e-4 ? (vx * dx + vy * dy) / dist : 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (ang > maxAngle) continue;
      // 夹角为主、距离为辅：1 弧度 ≈ 12 米的权重
      score = ang * 12 + dist;
    }
    if (score < bestScore) {
      bestScore = score;
      best = h.id;
    }
  }
  return best;
}

const DEG = Math.PI / 180;

/** 触控拖动：(nx, ny) 为单位方向，mag ∈ [0,1] 为拖动幅度占满幅的比例 */
export function solveByVector(ctx: HudCtx, spec: CastSpec, nx: number, ny: number, mag: number): AimSolution {
  const me = ctx.me;
  const dir = { x: nx, y: ny };
  switch (spec.type) {
    case 'direction':
      return { indicator: { kind: 'direction', dir, range: spec.range, width: spec.width }, dir };
    case 'cone':
      return { indicator: { kind: 'cone', dir, range: spec.range, angle: spec.angle }, dir };
    case 'position': {
      const d = spec.range * Math.max(0, Math.min(1, mag));
      const pos = { x: me.pos.x + nx * d, y: me.pos.y + ny * d };
      return { indicator: { kind: 'position', pos, range: spec.range, radius: spec.radius }, pos };
    }
    case 'target': {
      const id = pickEnemyHero(ctx, nx, ny, spec.range, 50 * DEG);
      return id >= 0 ? { indicator: { kind: 'target', targetId: id, range: spec.range }, targetId: id } : { indicator: { kind: 'target', targetId: -1, range: spec.range } };
    }
    default:
      return { indicator: { kind: 'self', radius: spec.radius } };
  }
}

/** 键鼠：ground 为鼠标指向的地面点，picked 为鼠标正下方的单位 id(无则 -1) */
export function solveByPoint(ctx: HudCtx, spec: CastSpec, ground: Vec2, picked: number): AimSolution {
  const me = ctx.me;
  let vx = ground.x - me.pos.x;
  let vy = ground.y - me.pos.y;
  const dist = Math.hypot(vx, vy);
  if (dist > 1e-3) {
    vx /= dist;
    vy /= dist;
  } else {
    vx = Math.cos(me.facing);
    vy = Math.sin(me.facing);
  }
  if (spec.type === 'position') {
    const d = Math.min(dist, spec.range);
    const pos = { x: me.pos.x + vx * d, y: me.pos.y + vy * d };
    return { indicator: { kind: 'position', pos, range: spec.range, radius: spec.radius }, pos };
  }
  if (spec.type === 'target') {
    let id = -1;
    const hit = picked >= 0 ? ctx.hero(picked) : undefined;
    if (hit && hit.team !== ctx.team && hit.alive && Math.hypot(hit.pos.x - me.pos.x, hit.pos.y - me.pos.y) <= spec.range + hit.radius + TARGET_SLACK) id = hit.id;
    // 没点中人：先找鼠标附近的，再找鼠标方向上的
    if (id < 0) id = pickEnemyHero(ctx, vx, vy, spec.range, 0, ground, 3.5);
    if (id < 0) id = pickEnemyHero(ctx, vx, vy, spec.range, 22 * DEG);
    return id >= 0 ? { indicator: { kind: 'target', targetId: id, range: spec.range }, targetId: id } : { indicator: { kind: 'target', targetId: -1, range: spec.range } };
  }
  return solveByVector(ctx, spec, vx, vy, 1);
}
