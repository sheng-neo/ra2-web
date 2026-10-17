// ===== sim/utilities/fixtures.ts =====（仅供本目录 *.test.ts 使用：最小"假 placement"系统与建造助手）
// 只依赖 contracts（不 import testkit / app），因此可被 sim 的 ESLint 方向规则与 tsconfig.sim.json 接受；不进生产装配。
import type { CommandResult, RejectReason } from '../../contracts/commands';
import { FOOTPRINT, cornerBits, forEachLotTile } from '../../contracts/footprint';
import { Corner, DEVELOPED_FIRST, XBit, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { SimHost } from '../../contracts/host';
import { NET_BASE } from '../../contracts/net';
import type { NetFamily } from '../../contracts/net';
import type { PlacementQuery } from '../../contracts/queries';
import type { CityState } from '../../contracts/state';
import type { System } from '../../contracts/system';
import { ruleBits } from './bits';
import { XBLD_BIG_PARK, XBLD_PUMP, XBLD_STATUE } from './defs';

const ok = (changed: number[]): CommandResult => ({ ok: true, cost: 0, changed });
const fail = (reason: RejectReason): CommandResult => ({ ok: false, cost: 0, reason, changed: [] });
/** 最小 PlacementQuery（全部放行；只为满足 createSim 的查询完整性校验）。 */
const PASS_QUERY: PlacementQuery = { canPlace: () => ({ ok: true, cost: 0 }), availability: () => ({ enabled: true }), preview: () => ({ ok: true, cost: 0, tiles: [] }) };

/**
 * 假 placement：placeBuilding 写占地 XBLD + XZON 角标 + 乐观预置（POWERABLE|POWERED|PIPED；雕像 / 大公园清 POWERABLE；水泵下自动铺一格管线）；
 * bulldoze 清 XBLD 与角标（保留 XUND 与分区码）；network 沿主轴写直线片段（power → XBLD 0x0E/0x0F，pipe → XUND 0x10/0x11，subway → XUND 0x01/0x02，road / rail 同理）。
 * 不是桩（无 stub 标记），host.dispatch 会真正执行并写命令日志，因此 onTilesChanged 的扇出时机与真放置系统一致。
 */
export function fakePlacementSystem(): System {
  return {
    id: 'placement',
    init() { /* 无状态 */ },
    queries: { placement: PASS_QUERY },
    commands: {
      placeBuilding(ctx, cmd) {
        const n = FOOTPRINT[cmd.id] ?? 1;
        if (!inMap(cmd.x, cmd.y) || !inMap(cmd.x + n - 1, cmd.y + n - 1)) return fail('outOfBounds');
        const changed: number[] = [];
        const powerable = cmd.id !== XBLD_STATUE && cmd.id !== XBLD_BIG_PARK;
        forEachLotTile(tileIndex(cmd.x, cmd.y), n, (i, dx, dy) => {
          ctx.act.setXbld(i, cmd.id);
          ctx.act.setXzon(i, (ctx.state.layers.xzon[i]! & 0x0f) | cornerBits(n, dx, dy));
          ctx.act.setXbit(i, XBit.Piped | (powerable ? XBit.Powerable | XBit.Powered : 0), true);
          if (!powerable) ctx.act.setXbit(i, XBit.Powerable, false);
          if (cmd.id === XBLD_PUMP && ctx.state.layers.xund[i] === 0) ctx.act.setXund(i, NET_BASE.pipe);
          changed.push(i);
        });
        return ok(changed);
      },
      bulldoze(ctx, cmd) {
        for (const i of cmd.tiles) { ctx.act.setXbld(i, 0); ctx.act.setXzon(i, ctx.state.layers.xzon[i]! & ~Corner.All); }
        return ok([...cmd.tiles]);
      },
      network(ctx, cmd) {
        const x0 = tileX(cmd.from), y0 = tileY(cmd.from), x1 = tileX(cmd.to), y1 = tileY(cmd.to);
        const alongX = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
        const lo = alongX ? Math.min(x0, x1) : Math.min(y0, y1), hi = alongX ? Math.max(x0, x1) : Math.max(y0, y1);
        const piece = alongX ? 0 : 1;
        const changed: number[] = [];
        for (let k = lo; k <= hi; k++) {
          const i = alongX ? tileIndex(k, y0) : tileIndex(x0, k);
          switch (cmd.kind) {
            case 'power': if (ctx.state.layers.xbld[i]! < DEVELOPED_FIRST) ctx.act.setXbld(i, NET_BASE.power + piece); break;
            case 'road': ctx.act.setXbld(i, NET_BASE.road + piece); break;
            case 'rail': ctx.act.setXbld(i, NET_BASE.rail + piece); break;
            case 'pipe': ctx.act.setXund(i, NET_BASE.pipe + piece); break;
            case 'subway': ctx.act.setXund(i, NET_BASE.subway + piece); break;
            default: return fail('notImplemented');
          }
          changed.push(i);
        }
        return ok(changed);
      },
    },
  };
}

// ---- host 级助手（经命令派发：扇出 → 本系统 onTilesChanged → 日末重扫） ----
export const place = (host: SimHost, id: number, x: number, y: number): CommandResult => host.dispatch({ type: 'placeBuilding', id, x, y });
export const bulldoze = (host: SimHost, ...tiles: number[]): CommandResult => host.dispatch({ type: 'bulldoze', tiles });
export const line = (host: SimHost, kind: NetFamily, x0: number, y0: number, x1: number, y1: number): CommandResult =>
  host.dispatch({ type: 'network', kind, from: tileIndex(x0, y0), to: tileIndex(x1, y1) });

// ---- 直接写层的夹具助手（绕过 TileWriter，用于批量场景；位按本模块规则预置，不置 POWERED / WATERED） ----
function paintTile(state: CityState, i: number, id: number): void {
  const L = state.layers, old = L.xbld[i]!;
  L.xbld[i] = id;
  state.counts.tile[old] = state.counts.tile[old]! - 1;
  state.counts.tile[id] = state.counts.tile[id]! + 1;
  L.xbit[i] = (L.xbit[i]! & ~(XBit.Powerable | XBit.Piped)) | ruleBits(id, L.xund[i]!);
}
/** 整栋写入（占地按 FOOTPRINT，角标按 cornerBits）。 */
export function paintLot(state: CityState, id: number, x: number, y: number): number {
  const n = FOOTPRINT[id] ?? 1, anchor = tileIndex(x, y);
  forEachLotTile(anchor, n, (i, dx, dy) => { paintTile(state, i, id); state.layers.xzon[i] = (state.layers.xzon[i]! & 0x0f) | cornerBits(n, dx, dy); });
  return anchor;
}
/** 单格写 XBLD（电线 / 道路 / 树等）。 */
export function paintXbld(state: CityState, x: number, y: number, id: number): number { const i = tileIndex(x, y); paintTile(state, i, id); return i; }
/** 单格写 XUND 并按规则刷新 PIPED。 */
export function paintXund(state: CityState, x: number, y: number, v: number): number {
  const i = tileIndex(x, y), L = state.layers;
  L.xund[i] = v;
  L.xbit[i] = (L.xbit[i]! & ~(XBit.Powerable | XBit.Piped)) | ruleBits(L.xbld[i]!, v);
  return i;
}
/** 置水面位（淡 / 咸）。 */
export function paintWater(state: CityState, x: number, y: number, salt = false): number {
  const i = tileIndex(x, y);
  state.layers.xbit[i] = state.layers.xbit[i]! | XBit.Water | (salt ? XBit.SaltWater : 0);
  return i;
}
