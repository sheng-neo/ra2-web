/**
 * 兵线折线的弧长参数化：小兵用「投影到兵线 → 取前方一小段的点」的方式沿路行进，
 * 被拉离兵线后也能自然地回到线上继续走。
 */
import type { Vec2 } from './types';
import { projectT } from './vec';

export class LanePath {
  readonly pts: readonly Vec2[];
  /** cum[i] = 起点到 pts[i] 的累计长度 */
  readonly cum: number[];
  readonly total: number;
  /** pointAt 的附带输出：该处的单位切向 */
  tx = 1;
  ty = 0;
  /** project 的附带输出：到兵线的垂直距离 */
  lateral = 0;

  constructor(pts: readonly Vec2[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    this.total = this.cum[this.cum.length - 1];
  }

  /** 最近点的弧长参数 s∈[0,total]；同时把到兵线的距离写入 this.lateral */
  project(x: number, y: number): number {
    const pts = this.pts;
    let best = Infinity;
    let bestS = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = projectT(x, y, a.x, a.y, b.x, b.y);
      const cx = a.x + (b.x - a.x) * t - x;
      const cy = a.y + (b.y - a.y) * t - y;
      const d = cx * cx + cy * cy;
      if (d < best) {
        best = d;
        bestS = this.cum[i - 1] + (this.cum[i] - this.cum[i - 1]) * t;
      }
    }
    this.lateral = Math.sqrt(best);
    return bestS;
  }

  /** 弧长 s 处的点写入 out；切向写入 this.tx/ty */
  pointAt(s: number, out: Vec2): Vec2 {
    const pts = this.pts;
    const cum = this.cum;
    const cs = s < 0 ? 0 : s > this.total ? this.total : s;
    let i = 1;
    while (i < pts.length - 1 && cum[i] < cs) i++;
    const a = pts[i - 1];
    const b = pts[i];
    const seg = cum[i] - cum[i - 1];
    const t = seg > 1e-9 ? (cs - cum[i - 1]) / seg : 0;
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    if (seg > 1e-9) {
      this.tx = (b.x - a.x) / seg;
      this.ty = (b.y - a.y) / seg;
    }
    return out;
  }
}
