/**
 * 鋼架大樓（steel-frame）：三段高低不同的板楼并列，前后立面外露成对钢桅杆，
 * 桅杆之间挂「衣架」桁架（水平弦 + 人字斜撑）。造型神似、不按比例复刻。
 */
import { FacadeMode, styleSeed } from '../facade';
import { aabb, box, prism, type LandmarkSink, type Placement, type Rgb } from './kit';

const STEEL: Rgb = [0.55, 0.56, 0.62];
const MAST = 1.2;
const RISE = 9;

export function steelFrame(p: Placement, sink: LandmarkSink): void {
  const W = p.hx;
  const D = p.hy * 0.8;
  const H = p.height;
  const slabs: [number, number, number][] = [
    [-W, -W / 3, 0.68 * H],
    [-W / 3, W / 3, H * 0.97],
    [W / 3, W, 0.84 * H],
  ];
  const style = p.style(styleSeed(3, 3, 1, 1), FacadeMode.Windows);
  for (const [x0, x1, h] of slabs) prism(p, sink, [x0, -D, x1, -D, x1, D, x0, D], 0, h, style);
  const xs = [-W + MAST, -W / 3, W / 3, W - MAST];
  const mastTop = [slabs[0]![2], slabs[1]![2], slabs[1]![2], slabs[2]![2]];
  for (const yf of [D + MAST + 0.2, -(D + MAST + 0.2)]) {
    xs.forEach((x, i) => aabb(p, sink, [x - MAST, yf - MAST, -p.footing], [x + MAST, yf + MAST, mastTop[i]!], STEEL, 0.12));
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i]!;
      const xb = xs[i + 1]!;
      const limit = Math.min(mastTop[i]!, mastTop[i + 1]!) - RISE - 2;
      const xm = (xa + xb) / 2;
      for (let z = 0.2 * H; z <= limit; z += 0.19 * H) {
        aabb(p, sink, [xa, yf - 0.8, z - 0.7], [xb, yf + 0.8, z + 0.7], STEEL, 0.12);
        for (const [x0, x1] of [
          [xa, xm],
          [xb, xm],
        ] as const) {
          const dx = x1 - x0;
          const len = Math.hypot(dx, RISE);
          const cx = dx / len;
          const cz = RISE / len;
          box(p, sink, [(x0 + x1) / 2, yf, z + RISE / 2], [(cx * len) / 2, 0, (cz * len) / 2], [0, 0.8, 0], [-cz * 0.7, 0, cx * 0.7], STEEL, 0.12);
        }
      }
    }
  }
}
