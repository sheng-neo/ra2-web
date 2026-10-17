// ===== sim/terrain/changes.ts =====
// 一次命令内"改过的地块"去重集合（CommandResult.changed 的来源）：位图 + 列表，take() 后清空可复用。
import { TILES } from '../../contracts/grid';

export class ChangeSet {
  readonly mark = new Uint8Array(TILES);
  private list: number[] = [];
  add(i: number): void { if (i >= 0 && i < TILES && this.mark[i] === 0) { this.mark[i] = 1; this.list.push(i); } }
  addAll(tiles: readonly number[]): void { for (const i of tiles) this.add(i); }
  get size(): number { return this.list.length; }
  /** 取走并清空。 */
  take(): number[] {
    const out = this.list;
    for (const i of out) this.mark[i] = 0;
    this.list = [];
    return out;
  }
}
