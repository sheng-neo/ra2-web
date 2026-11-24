/**
 * 海港塔（harbour-spire）：切角方塔分四级收分，楼顶一圈竖向鳍片组成开口冠顶，四角最高。
 * 切角处有竖向亮线。造型神似、不按比例复刻。
 */
import { FacadeMode, styleSeed } from '../facade';
import { box, chamferSquare, line, prism, type LandmarkSink, type Placement } from './kit';

const TIERS: readonly [number, number, number][] = [
  [0, 0.44, 1],
  [0.44, 0.64, 0.93],
  [0.64, 0.79, 0.86],
  [0.79, 1, 0.78],
];

export function harbourSpire(p: Placement, sink: LandmarkSink): void {
  const a = Math.min(p.hx, p.hy);
  const bodyH = p.height * 0.9;
  const crownH = p.height - bodyH;
  const style = p.style(styleSeed(3, 2, 0, 1), FacadeMode.Windows);
  for (const [f0, f1, k] of TIERS) {
    const ring = chamferSquare(a * k, a * k * 0.2);
    const z0 = f0 * bodyH;
    const z1 = f1 * bodyH;
    prism(p, sink, ring, z0, z1, style);
    for (let i = 0; i < ring.length; i += 2) {
      const x = ring[i]! * 1.004;
      const y = ring[i + 1]! * 1.004;
      line(p, sink, [x, y, z0], [x, y, z1]);
    }
  }
  // 冠顶鳍片：沿顶层轮廓等距排布，高度按方位角在四角取峰
  const top = chamferSquare(a * 0.78, a * 0.78 * 0.2);
  const n = top.length >> 1;
  let perim = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    perim += Math.hypot(top[j * 2]! - top[i * 2]!, top[j * 2 + 1]! - top[i * 2 + 1]!);
  }
  const fins = 36;
  for (let k = 0; k < fins; k++) {
    let s = (k / fins) * perim;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = top[i * 2]!;
      const y0 = top[i * 2 + 1]!;
      const dx = top[j * 2]! - x0;
      const dy = top[j * 2 + 1]! - y0;
      const len = Math.hypot(dx, dy);
      if (s > len) {
        s -= len;
        continue;
      }
      const x = x0 + (dx * s) / len;
      const y = y0 + (dy * s) / len;
      const nx = dy / len;
      const ny = -dx / len;
      const peak = Math.pow(Math.abs(Math.sin(2 * Math.atan2(y, x))), 1.5);
      const fh = crownH * (0.35 + 0.65 * peak);
      box(p, sink, [x, y, bodyH + fh / 2], [nx * 1.3, ny * 1.3, 0], [-ny * 0.35, nx * 0.35, 0], [0, 0, fh / 2], [0.72, 0.82, 1.0], 0.55);
      break;
    }
  }
}
