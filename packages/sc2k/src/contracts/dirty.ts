// ===== dirty.ts =====
// 脏追踪（CONTRACTS §P）：core 的 TileWriter 产出、渲染每帧 takeChanges() 消费。位图 + 去重列表，mark O(1)。
import { TILES } from './grid';

export type BulkLayer = 'xbit' | 'maps' | 'xtxt' | 'xthg' | 'xmic' | 'all';
/** 全部整层键（固定顺序；'all' = 全量重建）。 */
export const BULK_LAYERS: readonly BulkLayer[] = ['xbit', 'maps', 'xtxt', 'xthg', 'xmic', 'all'];
export interface DirtyChanges { readonly tiles: Int32Array /*subarray(0,count)*/; readonly bulk: Readonly<Record<BulkLayer, boolean>> }
/** Uint8Array(16384) 位图 + Int32Array(16384) 去重列表；mark O(1)；take 返回视图并清空。 */
export interface DirtyTracker {
  mark(i: number): void; markBulk(k: BulkLayer): void;
  readonly count: number; readonly bulk: Readonly<Record<BulkLayer, boolean>>;
  take(): DirtyChanges;                                               // 调用后内部清空；返回的 tiles 在下次 mark 前有效
  clear(): void;
}
const freshBulk = (): Record<BulkLayer, boolean> => ({ xbit: false, maps: false, xtxt: false, xthg: false, xmic: false, all: false });

/**
 * 真实现：
 *  - mark(i)：越界（i ∉ [0, TILES)）忽略；已置位忽略；否则置位并追加到列表——同一格多次 setXbld/setXzon 只产生一项。
 *  - markBulk(k)：置整层标志（不展开为逐格）。
 *  - take()：返回 { tiles: list.subarray(0, count), bulk: 当前标志的拷贝 }，然后清空位图（只清列表中的格）、count 与标志。
 *    tiles 是内部列表的视图：在下一次 mark 之前有效，调用方需要保留时自行拷贝。
 *  - clear()：同 take() 的清空部分，不返回。
 */
export function createDirtyTracker(): DirtyTracker {
  const bits = new Uint8Array(TILES);
  const list = new Int32Array(TILES);
  let count = 0;
  const bulk = freshBulk();
  const reset = (): void => {
    for (let k = 0; k < count; k++) bits[list[k]!] = 0;
    count = 0;
    for (const key of BULK_LAYERS) bulk[key] = false;
  };
  return {
    mark(i: number): void {
      if (!(i >= 0 && i < TILES)) return;
      if (bits[i] !== 0) return;
      bits[i] = 1;
      list[count++] = i;
    },
    markBulk(k: BulkLayer): void { bulk[k] = true; },
    get count(): number { return count; },
    get bulk(): Readonly<Record<BulkLayer, boolean>> { return bulk; },
    take(): DirtyChanges {
      const tiles = list.subarray(0, count);
      const snapshot: Readonly<Record<BulkLayer, boolean>> = { ...bulk };
      reset();
      return { tiles, bulk: snapshot };
    },
    clear(): void { reset(); },
  };
}
