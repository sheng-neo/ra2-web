/**
 * 圓窗大廈（porthole-house）：方塔立面满布圆窗网格，底部略宽的裙楼，顶部内缩机房。
 */
import { FacadeMode, styleSeed } from '../facade';
import { prism, rectRing, type LandmarkSink, type Placement } from './kit';

export function portholeHouse(p: Placement, sink: LandmarkSink): void {
  const a = Math.min(p.hx, p.hy);
  const body = p.height * 0.96;
  prism(p, sink, rectRing(a * 1.05, a * 1.05), 0, 14, p.style(styleSeed(0, 2, 2, 3), FacadeMode.Podium));
  prism(p, sink, rectRing(a, a), 14, body, p.style(styleSeed(1, 2, 0, 0), FacadeMode.Porthole));
  prism(p, sink, rectRing(a * 0.55, a * 0.55), body, p.height, p.style(styleSeed(0, 0, 1, 0), FacadeMode.Plant));
}
