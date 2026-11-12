/**
 * 单位空间哈希（均匀网格 + 类型化数组链表）。每 tick 重建两次(决策前 / 弹道与分离前)，范围查询只扫相关格子。
 * 查询把候选写进调用方提供的数组，热路径零分配。
 */
import type { SimUnit } from './internal';

const CELL = 4;
const ORIGIN = -60;
const DIM = 30;
/** 最大单位半径（水晶 2.6）：查询时自动外扩，保证「圆与单位身体相交」的单位不会漏 */
const MAX_UNIT_RADIUS = 2.6;
/** 再多留一点：网格是 tick 开始时建的，单位在本 tick 内可能已经挪动了一小段 */
const STALE_MARGIN = 1.2;

export class SpatialGrid {
  /** 每个格子的链表头（items 的下标），-1 = 空 */
  private readonly head = new Int32Array(DIM * DIM).fill(-1);
  private next = new Int32Array(256);
  private readonly items: SimUnit[] = [];

  private index(x: number, y: number): number {
    let cx = ((x - ORIGIN) / CELL) | 0;
    let cy = ((y - ORIGIN) / CELL) | 0;
    cx = cx < 0 ? 0 : cx >= DIM ? DIM - 1 : cx;
    cy = cy < 0 ? 0 : cy >= DIM ? DIM - 1 : cy;
    return cy * DIM + cx;
  }

  private push(u: SimUnit): void {
    const items = this.items;
    const i = items.length;
    if (i >= this.next.length) {
      const grown = new Int32Array(this.next.length * 2);
      grown.set(this.next);
      this.next = grown;
    }
    items.push(u);
    const c = this.index(u.pos.x, u.pos.y);
    this.next[i] = this.head[c];
    this.head[c] = i;
  }

  rebuild(units: readonly SimUnit[]): void {
    this.head.fill(-1);
    this.items.length = 0;
    // 倒序插入，使同一格内的遍历顺序与单位创建顺序一致
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (u.alive) this.push(u);
    }
  }

  /** 让新生成/刚复活的单位立即可被查询到（只对当前不在网格里的单位调用） */
  insert(u: SimUnit): void {
    this.push(u);
  }

  /**
   * 粗筛：把可能与圆 (x, y, r) 相交的单位写入 out（先清空），返回数量。
   * 只按格子筛选，调用方需自行做精确距离/存活判断。
   */
  query(x: number, y: number, r: number, out: SimUnit[]): number {
    out.length = 0;
    const rr = r + MAX_UNIT_RADIUS + STALE_MARGIN;
    let x0 = ((x - rr - ORIGIN) / CELL) | 0;
    let x1 = ((x + rr - ORIGIN) / CELL) | 0;
    let y0 = ((y - rr - ORIGIN) / CELL) | 0;
    let y1 = ((y + rr - ORIGIN) / CELL) | 0;
    x0 = x0 < 0 ? 0 : x0;
    y0 = y0 < 0 ? 0 : y0;
    x1 = x1 >= DIM ? DIM - 1 : x1;
    y1 = y1 >= DIM ? DIM - 1 : y1;
    const head = this.head;
    const next = this.next;
    const items = this.items;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = head[cy * DIM + cx]; i >= 0; i = next[i]) out.push(items[i]);
      }
    }
    return out.length;
  }
}
