// ===== actions.ts =====
// 跨系统写（CONTRACTS §J）：每键一个 owner；core 的 TileWriter 实现 set* / layerChanged / emit，其余由各系统注册（桩在 app/stubs）。
import type { SimEvent } from './events';
import type { SystemId } from './system';
import type { BulkLayer } from './dirty';
export type DestroyCause = number /*DisasterKind*/ | 'PLANT_EOL' | 'BRIDGE' | 'DECAY' | 'LAUNCH' | 'BULLDOZE';
export interface Actions {
  // core（TileWriter）：增量更新 counts、dirty.mark、阶段末 onTilesChanged 扇出
  setXbld(i: number, id: number): void; setXzon(i: number, v: number): void; setXund(i: number, v: number): void;
  setXbit(i: number, mask: number, on: boolean): void;
  setTerrain(i: number, alt: number, xter: number, waterLevel: number): void;
  layerChanged(layer: BulkLayer): void;                            // 整层重建后一次调用
  emit(ev: SimEvent): void;
  // economy
  charge(cost: number): boolean;                                   // 资金不足返回 false 并 emit insufficientFunds；cost ≤ 0 恒 true
  // events（桩：整栋 → 瓦砾 0x01..0x04 + 角标清 + 分区保留；news 空操作）
  destroyStructure(x: number, y: number, cause: DestroyCause): void; news(type: number, value: number): void;
  // services
  // allocMicrosim 返回约定（contract-rfc WP7-1）：≥ 1 = 记录号（共享 1..9 / 独占 10..149）；0 = 该建筑不需要微模拟记录（不是失败）；−1 = 独占记录用尽（140 座）。放置者只对 < 0 判 microsimFull。
  addTraffic(tile: number, weight: number): void; allocMicrosim(tileId: number): number; freeMicrosim(slot: number): void;
  // utilities（桩：空操作）
  requestRescan(kind: 'power' | 'water'): void;
  // transport（桩：空操作）
  markAccessDirty(tiles: ReadonlyArray<number>): void;
}
/** 每个 Actions 键的唯一 owner（registry.test：System.actions 只能填归自己的键；actions.test：键集合 == keyof Actions）。 */
export const ACTION_OWNER: Readonly<Record<keyof Actions, SystemId>> = {
  setXbld: 'core', setXzon: 'core', setXund: 'core', setXbit: 'core', setTerrain: 'core', layerChanged: 'core', emit: 'core',
  charge: 'economy', destroyStructure: 'events', news: 'events', addTraffic: 'services', allocMicrosim: 'services', freeMicrosim: 'services',
  requestRescan: 'utilities', markAccessDirty: 'transport' };
