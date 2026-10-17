// ===== sim/events/quake.ts =====（spec:disasters §2.6.5 地震）
// 第 1 tick 一次性结算：每个非清地格 pQuake = perMagnitude × (magnitude − 4.5)（基础设施 ×0.5、桥 ×1.5）→ destroyStructure；
// 命中格以 fireChance 起火、以 undergroundChance 清地下；之后 shakeTicks 倒数并进入普通火灾流程。地形不变。
import { DisasterKind, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { SimContext } from '../../contracts/system';
import { TileClass, classOf, isBridgeId, privOf } from './common';
import { destroyStructure } from './destroy';
import { igniteTile } from './marker';
import type { EventsPriv } from './priv';
import type { EventsTuning } from './tuning';

export function startQuake(ctx: SimContext, T: EventsTuning): void {
  const t = T.quake, s = ctx.state, L = s.layers, prng = ctx.prng;
  const P = privOf(s);
  P.quakeMag10 = t.magnitudeMin10 + prng.int(t.magnitudeSpan10);
  P.quakeShake = t.shakeTicks;
  const base = t.perMagnitude * (P.quakeMag10 / 10 - t.magnitudeBase);
  ctx.act.emit({ type: 'sound', id: 'quake' });
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = tileIndex(x, y);
    const id = L.xbld[i]!;
    const c = classOf(id);
    if (c === TileClass.Empty) continue;
    let p = base;
    if (c === TileClass.Infra) p *= isBridgeId(id) ? t.bridgeFactor : t.infraFactor;
    if (prng.float() >= p) continue;
    destroyStructure(ctx, T, x, y, DisasterKind.Earthquake);
    if (prng.float() < t.fireChance) igniteTile(ctx, P, T.fire, i);
    if (L.xund[i] !== 0 && prng.float() < t.undergroundChance) ctx.act.setXund(i, 0);
  }
}

/** 每 tick 摇晃倒数；返回是否仍在摇。 */
export function stepQuake(P: EventsPriv): boolean {
  if (P.quakeShake > 0) P.quakeShake--;
  return P.quakeShake > 0;
}

/** 震中坐标（仅 goto）：从已毁格里取第一个，否则地图中心。 */
export function quakeFocus(ctx: SimContext): { x: number; y: number } {
  const L = ctx.state.layers;
  for (let i = 0; i < 16384; i++) if (L.xbld[i]! >= 0x01 && L.xbld[i]! <= 0x04) return { x: tileX(i), y: tileY(i) };
  return { x: 64, y: 64 };
}
