// ===== sim/events/actors.ts =====（spec:disasters §2.6.4 龙卷风 / §2.6.6 怪兽 / §3.4 stepActors）
// 灾害主物件（v1 一次一只，占预留槽 39）：边缘生成、路径抖动 / 寻路、脚下毁坏与点火；出界或 life==0 删除。位置经 things() 以 ThingView 暴露。
import { DisasterKind, inMap, tileIndex } from '../../contracts/grid';
import type { ThingView } from '../../contracts/queries';
import { ActorId } from '../../contracts/render';
import type { SimContext } from '../../contracts/system';
import { DIR8_DX, DIR8_DY, EDGE_TILES, TileClass, cheb, classOf, edgeTile, privOf, toward8 } from './common';
import { destroyStructure } from './destroy';
import { PRIMARY_SLOT, UNIT_SLOT_BASE } from './dispatch';
import { igniteTile } from './marker';
import { ActorKind, UnitKind } from './priv';
import type { ActorRec, EventsPriv } from './priv';
import type { EventsTuning } from './tuning';

const CENTER = 64;

/** 随机边缘格 + 指向地图内部（±45° 抖动）的初始朝向。消费 2 次 PRNG。 */
function spawnAtEdge(ctx: SimContext): { x: number; y: number; dir: number } {
  const { x, y } = edgeTile(ctx.prng.int(EDGE_TILES));
  const dir = (toward8(x, y, CENTER, CENTER) + ctx.prng.int(3) - 1 + 8) & 7;
  return { x, y, dir };
}

export function spawnTornado(ctx: SimContext, T: EventsTuning): ActorRec {
  const P = privOf(ctx.state);
  const e = spawnAtEdge(ctx);
  const a: ActorRec = { kind: ActorKind.Tornado, x: e.x, y: e.y, dir: e.dir, life: ctx.prng.range(T.tornado.life[0], T.tornado.life[1]), flag: 0 };
  P.actors = [a];
  ctx.act.emit({ type: 'actor', op: 'spawn', slot: PRIMARY_SLOT });
  ctx.act.emit({ type: 'sound', id: 'tornado' });
  return a;
}
export function spawnMonster(ctx: SimContext, T: EventsTuning): ActorRec {
  const P = privOf(ctx.state);
  const e = spawnAtEdge(ctx);
  const a: ActorRec = { kind: ActorKind.Monster, x: e.x, y: e.y, dir: e.dir, life: ctx.prng.range(T.monster.life[0], T.monster.life[1]), flag: 0 };
  P.actors = [a];
  ctx.act.emit({ type: 'actor', op: 'spawn', slot: PRIMARY_SLOT });
  ctx.act.emit({ type: 'sound', id: 'monster' });
  return a;
}

function removeActor(ctx: SimContext, P: EventsPriv, a: ActorRec): void {
  P.actors = P.actors.filter((x) => x !== a);
  ctx.act.emit({ type: 'actor', op: 'remove', slot: PRIMARY_SLOT });
}

function stepTornado(ctx: SimContext, P: EventsPriv, T: EventsTuning, a: ActorRec): void {
  const t = T.tornado, prng = ctx.prng;
  if (prng.float() < t.jitter) a.dir = (a.dir + (prng.bit() ? 1 : 7)) & 7;
  a.x += DIR8_DX[a.dir]!; a.y += DIR8_DY[a.dir]!;
  if (!inMap(a.x, a.y)) { removeActor(ctx, P, a); return; }
  const i = tileIndex(a.x, a.y);
  const c = classOf(ctx.state.layers.xbld[i]!);
  const p = c === TileClass.Building ? t.destroyBuilding : c === TileClass.Infra ? t.destroyInfra : c === TileClass.Trees ? t.destroyTrees : 0;
  if (p > 0 && prng.float() < p) destroyStructure(ctx, T, a.x, a.y, DisasterKind.Tornado);
  if (--a.life <= 0) { removeActor(ctx, P, a); return; }
  ctx.act.emit({ type: 'actor', op: 'move', slot: PRIMARY_SLOT });
}

function stepMonster(ctx: SimContext, P: EventsPriv, T: EventsTuning, a: ActorRec): void {
  const t = T.monster, prng = ctx.prng, L = ctx.state.layers;
  const target = ctx.q.services.cityCenter();
  const seek = prng.float() < t.seekChance, rnd = prng.int(8);
  a.dir = a.flag === 0 && seek ? toward8(a.x, a.y, target.x, target.y) : rnd;
  a.x += DIR8_DX[a.dir]!; a.y += DIR8_DY[a.dir]!;
  if (!inMap(a.x, a.y)) { removeActor(ctx, P, a); return; }
  if (cheb(a.x, a.y, target.x, target.y) <= 1) a.flag = 1;
  const i = tileIndex(a.x, a.y);
  if (prng.float() < t.crush && classOf(L.xbld[i]!) !== TileClass.Empty) destroyStructure(ctx, T, a.x, a.y, DisasterKind.Monster);
  if (prng.float() < t.ignite) igniteTile(ctx, P, T.fire, i);
  for (let d = 0; d < 8; d++) {
    const r = prng.float();
    const nx = a.x + DIR8_DX[d]!, ny = a.y + DIR8_DY[d]!;
    if (r < t.rayIgnite && inMap(nx, ny)) igniteTile(ctx, P, T.fire, tileIndex(nx, ny));
  }
  if (--a.life <= 0) { removeActor(ctx, P, a); return; }
  ctx.act.emit({ type: 'actor', op: 'move', slot: PRIMARY_SLOT });
}

export function stepActors(ctx: SimContext, P: EventsPriv, T: EventsTuning): void {
  for (const a of P.actors.slice()) {
    if (a.kind === ActorKind.Tornado) stepTornado(ctx, P, T, a);
    else if (a.kind === ActorKind.Monster) stepMonster(ctx, P, T, a);
  }
}

/** 物件视图：调度单位（槽 1..）+ 灾害主物件（槽 39）。type = ActorId。 */
export function thingViews(P: EventsPriv): ThingView[] {
  const out: ThingView[] = [];
  P.units.forEach((u, k) => out.push({
    slot: UNIT_SLOT_BASE + k, type: u.kind === UnitKind.Police ? ActorId.DeployPolice : ActorId.DeployFire,
    x: u.x, y: u.y, z: 0, px: 8, py: 8, dir: 0, variant: 0, air: false }));
  for (const a of P.actors) out.push({
    slot: PRIMARY_SLOT, type: a.kind === ActorKind.Tornado ? ActorId.Tornado : ActorId.Monster,
    x: a.x, y: a.y, z: 0, px: 8, py: 8, dir: a.dir, variant: 0, air: false });
  return out;
}
