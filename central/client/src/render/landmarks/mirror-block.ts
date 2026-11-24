/**
 * 鏡面大廈（mirror-block）：方正的玻璃盒子，幕墙反射夜空，竖梃节点一格一点 LED（约 1.5，静态）；四角白色 LED 线；
 * 屋顶一个内缩机房。
 */
import { FEATURE, FacadeMode, styleSeed } from '../facade';
import { emitOf, line, prism, rectRing, type LandmarkSink, type Placement } from './kit';

export function mirrorBlock(p: Placement, sink: LandmarkSink): void {
  const hx = p.hx * 0.97;
  const hy = p.hy * 0.97;
  const body = p.height * 0.97;
  const glass = p.style(styleSeed(3, 0, 0, 1), FacadeMode.Glass);
  prism(p, sink, rectRing(hx, hy), 0, body, glass, p.bldg(4, FEATURE.nodeLeds));
  prism(p, sink, rectRing(hx * 0.6, hy * 0.6), body, p.height, glass);
  for (const [x, y] of [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ] as const) {
    line(p, sink, [x * 1.004, y * 1.004, 0], [x * 1.004, y * 1.004, body], emitOf('crownWhite', 2.4), 0.15);
  }
}
