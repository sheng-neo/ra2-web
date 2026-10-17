// ===== sim/core/tileWriter.ts =====
// TileWriter：Actions 的 core 部分（ARCHITECTURE §3.5、CONTRACTS §J）。
//  - set*：写真源层、增量维护 counts、dirty.mark(i)、记入本批"待扇出"集合；
//  - layerChanged(k)：dirty.markBulk(k)；
//  - emit(ev)：推入 ctx.events（同一数组引用，app 每帧 drain）；
//  - flush(ctx, systems)：阶段 / 命令 / tick 末由调度器调用，把本批写过的格按 TileChangeKind 批量扇出到
//    全部实现了 onTilesChanged 的系统（按 SYSTEM_ORDER，即传入的 systems 顺序）；扇出期间的新写入再扇出，最多 MAX_FANOUT_ROUNDS 轮。
// 本文件不 import io/** app/** render/** ui/**。
import type { Actions } from '../../contracts/actions';
import type { CatalogueApi } from '../../contracts/catalogue';
import type { DirtyTracker } from '../../contracts/dirty';
import type { SimEvent } from '../../contracts/events';
import type { CityState } from '../../contracts/state';
import type { SimContext, System, TileChangeKind } from '../../contracts/system';
import { TILES } from '../../contracts/grid';

export type CoreActions = Pick<Actions, 'setXbld' | 'setXzon' | 'setXund' | 'setXbit' | 'setTerrain' | 'layerChanged' | 'emit'>;

export interface TileWriter {
  readonly actions: CoreActions;
  /** 本批尚未扇出的（去重后）格数之和（测试 / 调试用）。 */
  readonly pendingCount: number;
  /** 阶段 / 命令 / tick 末调用：扇出 onTilesChanged 并清空本批。 */
  flush(ctx: SimContext, systems: readonly System[]): void;
  /** 丢弃本批（newCity / 读档前）。 */
  reset(): void;
}

/** 扇出顺序固定（与 TileChangeKind 的声明顺序一致）。 */
export const TILE_CHANGE_KINDS: readonly TileChangeKind[] = ['terrain', 'building', 'zone', 'underground', 'bit'];
/** onTilesChanged 处理者自己再写格时的最大再扇出轮数；超过则记 diag 并丢弃剩余（防止两系统互相触发无限循环）。 */
export const MAX_FANOUT_ROUNDS = 8;

/**
 * counts.zone 的槽位语义（MISC 0x05F0 的 8 项 i32，spec:file-formats §2.3.2 / spec:zones §4 Q9）：
 *  slot 0 = 已建 R/C/I 建筑格总数，slot 2 / 4 / 6 = R / C / I 已建建筑格数；奇数槽原版含义未明，本项目恒 0。
 * "已建" = catalogue 中带 zone 且无 transition（施工 / 废弃瓦片不计）。由 setXbld 增量维护（而非 setXzon：分区码本身不是 MISC 计数口径）。
 */
const ZONE_SLOT: Readonly<Record<'R' | 'C' | 'I', number>> = { R: 2, C: 4, I: 6 };

/** 本批写过的格：每种 kind 一张位图 + 一张去重列表（与 DirtyTracker 同构，但按 kind 分桶且与渲染消费无关）。 */
class KindBatch {
  private readonly bits = new Uint8Array(TILES);
  private readonly list = new Int32Array(TILES);
  count = 0;
  add(i: number): void {
    if (this.bits[i] !== 0) return;
    this.bits[i] = 1;
    this.list[this.count++] = i;
  }
  /** 取走并清空：返回普通数组（onTilesChanged 的参数类型是 ReadonlyArray<number>）。 */
  take(): number[] {
    const out = new Array<number>(this.count);
    for (let k = 0; k < this.count; k++) { const i = this.list[k]!; out[k] = i; this.bits[i] = 0; }
    this.count = 0;
    return out;
  }
  clear(): void { for (let k = 0; k < this.count; k++) this.bits[this.list[k]!] = 0; this.count = 0; }
}

/**
 * @param state   真源（引用保持不变；newCity / 读档都是就地重置，所以本文件不缓存任何子数组）
 * @param dirty   渲染消费的脏追踪
 * @param events  ctx.events 同一数组
 * @param catalogue 判定"已建分区建筑"用（counts.zone）
 */
export function createTileWriter(state: CityState, dirty: DirtyTracker, events: SimEvent[], catalogue: CatalogueApi): TileWriter {
  const batches: Record<TileChangeKind, KindBatch> = {
    terrain: new KindBatch(), building: new KindBatch(), zone: new KindBatch(), underground: new KindBatch(), bit: new KindBatch() };
  const inRange = (i: number): boolean => i >= 0 && i < TILES && (i | 0) === i;
  const touch = (i: number, kind: TileChangeKind): void => { dirty.mark(i); batches[kind].add(i); };

  /** 已建分区建筑的 R/C/I 槽位；非分区建筑 / 施工 / 废弃 → −1。 */
  const builtZoneSlot = (id: number): number => {
    const def = catalogue.BUILDINGS[id];
    if (!def || !def.zone || def.transition !== undefined) return -1;
    return ZONE_SLOT[def.zone.type];
  };
  const bumpZone = (id: number, delta: number): void => {
    const slot = builtZoneSlot(id);
    if (slot < 0) return;
    const z = state.counts.zone;
    z[0] = z[0]! + delta;
    z[slot] = z[slot]! + delta;
  };

  const actions: CoreActions = {
    setXbld(i, id) {
      if (!inRange(i)) return;
      const v = id & 0xff;
      const xbld = state.layers.xbld;
      const old = xbld[i]!;
      const tile = state.counts.tile;
      tile[old] = tile[old]! - 1;
      tile[v] = tile[v]! + 1;
      bumpZone(old, -1); bumpZone(v, +1);
      xbld[i] = v;
      touch(i, 'building');
    },
    setXzon(i, v) {
      if (!inRange(i)) return;
      state.layers.xzon[i] = v & 0xff;
      touch(i, 'zone');
    },
    setXund(i, v) {
      if (!inRange(i)) return;
      state.layers.xund[i] = v & 0xff;
      touch(i, 'underground');
    },
    setXbit(i, mask, on) {
      if (!inRange(i)) return;
      const xbit = state.layers.xbit;
      xbit[i] = on ? (xbit[i]! | mask) & 0xff : xbit[i]! & ~mask & 0xff;
      touch(i, 'bit');
    },
    setTerrain(i, alt, xter, waterLevel) {
      if (!inRange(i)) return;
      const L = state.layers;
      L.alt[i] = alt & 0xff; L.xter[i] = xter & 0xff; L.waterLevel[i] = waterLevel & 0xff;
      touch(i, 'terrain');
    },
    layerChanged(layer) { dirty.markBulk(layer); },
    emit(ev) { events.push(ev); },
  };

  const pending = (): number => TILE_CHANGE_KINDS.reduce((n, k) => n + batches[k].count, 0);

  return {
    actions,
    get pendingCount(): number { return pending(); },
    flush(ctx, systems) {
      const listeners = systems.filter((s) => typeof s.onTilesChanged === 'function');
      let rounds = 0;
      while (pending() > 0) {
        if (rounds++ >= MAX_FANOUT_ROUNDS) {
          ctx.diag.push({ level: 'warn', code: 'core.fanoutLoop', message: `onTilesChanged 连锁写入超过 ${MAX_FANOUT_ROUNDS} 轮，剩余变更不再扇出（仍已 dirty.mark）` });
          for (const k of TILE_CHANGE_KINDS) batches[k].clear();
          return;
        }
        for (const kind of TILE_CHANGE_KINDS) {
          const b = batches[kind];
          if (b.count === 0) continue;
          const tiles = b.take();
          if (listeners.length === 0) continue;
          for (const s of listeners) s.onTilesChanged!(ctx, tiles, kind);
        }
      }
    },
    reset() { for (const k of TILE_CHANGE_KINDS) batches[k].clear(); },
  };
}
