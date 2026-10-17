// ===== sim/events/destroy.ts =====（spec:disasters §2.5 共用毁损例程；Actions.destroyStructure 的真实现）
// 整栋 → 瓦砾 0x01..0x04（树 / 小公园 → 清地）+ 角标清 + 分区 nibble 保留 + 电水位清 + 微模拟标签释放（freeMicrosim）+ 电厂爆炸 + 重扫请求。
// 不消费 PRNG（调用方可能处于 usesPrng:false 的阶段，如 transport 的桥梁坍塌）：瓦砾花色与死亡数用 hash32 派生。
import type { DestroyCause } from '../../contracts/actions';
import { FOOTPRINT, anchorOf, forEachLotTile } from '../../contracts/footprint';
import { Corner, DisasterKind, TileMarker, XBit, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { hash32 } from '../../contracts/prng';
import type { SimContext } from '../../contracts/system';
import { TileClass, classOf, isPowerPlant, isWaterFacility, privOf } from './common';
import type { EventsTuning } from './tuning';

const CLEAR_BITS = XBit.Powered | XBit.Powerable | XBit.Watered | XBit.Piped;
/** 独立微模拟标签区 0x3D..0xC8（记录号 = 标签 − 0x33）；共享 0x34..0x3C 只清格不释放。 */
const LABEL_SHARED_LO = 0x34, LABEL_INDEP_LO = 0x3d, LABEL_HI = 0xc8, LABEL_BASE = 0x33;

/** 瓦砾花色：按 (dx + dy + 盐) 轮换，确定性且无 PRNG。 */
const rubbleId = (salt: number, dx: number, dy: number): number => 0x01 + ((dx + dy + salt) & 3);
/** 哪些原因清为空地而非瓦砾：推土、桥梁坍塌（桥下是水）、巨型住区升空。 */
const clearsGround = (cause: DestroyCause): boolean => cause === 'BULLDOZE' || cause === 'BRIDGE' || cause === 'LAUNCH';

/**
 * 毁损一格所属的整栋结构。返回受影响的占地格列表（空 = 无事发生）。
 * cause 为数字时是 DisasterKind；'PLANT_EOL' 额外预点燃瓦砾并请求进入火灾（spec §2.6.14）。
 */
export function destroyStructure(ctx: SimContext, T: EventsTuning, x: number, y: number, cause: DestroyCause): number[] {
  if (!inMap(x, y)) return [];
  const s = ctx.state, L = s.layers, i = tileIndex(x, y);
  const id = L.xbld[i]!;
  if (id === 0 || id === 0x05) return [];                           // 清地 / 放射（放射 v2）
  const P = privOf(s);
  const salt = hash32(s.clock.age, s.clock.disasterTicks, i) & 3;
  const cls = classOf(id);
  const tiles: number[] = [];
  const labelsFreed = new Set<number>();
  let xtxtTouched = false;

  const wipe = (j: number, dx: number, dy: number, toGround: boolean): void => {
    const label = L.xtxt[j]!;
    if (label >= LABEL_SHARED_LO && label <= LABEL_HI) {
      if (label >= LABEL_INDEP_LO) labelsFreed.add(label - LABEL_BASE);
      L.xtxt[j] = 0; xtxtTouched = true;
    }
    ctx.act.setXbld(j, toGround ? 0 : rubbleId(salt, dx, dy));
    ctx.act.setXzon(j, L.xzon[j]! & ~Corner.All);
    ctx.act.setXbit(j, CLEAR_BITS, false);
    tiles.push(j);
  };

  if (cls === TileClass.Trees || cls === TileClass.Rubble) {
    // 树 / 小公园 → 清地；瓦砾再毁 → 保持瓦砾（推土则清地）
    if (cls === TileClass.Trees || clearsGround(cause)) wipe(i, 0, 0, true);
    else return [];
  } else {
    const n = FOOTPRINT[id]!;
    const anchor = n === 1 ? i : anchorOf(L, i);
    if (anchor < 0) {
      ctx.diag.push({ level: 'warn', code: 'events.anchorBroken', message: `毁损 (${x},${y}) XBLD 0x${id.toString(16)} 找不到锚点，按 1×1 处理` });
      wipe(i, 0, 0, clearsGround(cause));
    } else {
      forEachLotTile(anchor, n, (j, dx, dy) => wipe(j, dx, dy, clearsGround(cause)));
    }
    if (isPowerPlant(id)) {
      const ax = anchor < 0 ? x : tileX(anchor), ay = anchor < 0 ? y : tileY(anchor);
      ctx.act.emit({ type: 'explosion', x: ax, y: ay });
      ctx.act.emit({ type: 'sound', id: 'explosion' });
      ctx.act.requestRescan('power');
    } else if (isWaterFacility(id)) ctx.act.requestRescan('water');
    else if (id >= 0x70) ctx.act.requestRescan('power');          // 用电建筑消失：负荷变化
  }
  for (const r of labelsFreed) ctx.act.freeMicrosim(r);
  if (xtxtTouched) ctx.act.layerChanged('xtxt');

  // 死亡与损失统计（报纸 token；仅分区建筑计人）
  const def = ctx.catalogue.BUILDINGS[id];
  if (def?.zone && cause !== 'BULLDOZE') {
    const [lo, hi] = T.deathsPerZoneBuilding;
    P.deaths += lo + (hash32(s.clock.age, i, 'deaths') % (hi - lo + 1));
  }
  if (cause !== 'BULLDOZE') P.destroyedTiles += tiles.length;

  // 已在烧的格：建筑没了，燃料改按瓦砾（火在瓦砾上自然过渡，不二次毁损）
  const rubbleFuel = T.fire.fuel.rubble;
  for (const j of tiles) if (P.marker[j] === TileMarker.Fire && P.fuel[j]! > rubbleFuel) P.fuel[j] = rubbleFuel;

  // 电厂寿命到期：瓦砾预点燃 + 请求火灾（状态机见到已有火标记不再另选火点）
  if (cause === 'PLANT_EOL') {
    for (const j of tiles) if (P.marker[j] === 0 && L.xbld[j]! >= 0x01 && L.xbld[j]! <= 0x04) { P.marker[j] = TileMarker.Fire; P.fuel[j] = rubbleFuel; }
    if (!s.disaster.active && s.disaster.pending === DisasterKind.None) { s.disaster.pending = DisasterKind.Fire; s.disaster.pointX = x; s.disaster.pointY = y; }
  }
  ctx.act.emit({ type: 'structureDestroyed', x, y, oldId: id, cause });
  return tiles;
}
