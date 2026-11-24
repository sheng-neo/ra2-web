/**
 * 三稜塔（prism-tower）：方形平面按对角线分成四个三角柱，四柱逐级升高，顶部斜切；
 * 外立面 X 形斜撑亮线，最高柱顶一对桅杆。造型神似、不按比例复刻。
 */
import { FacadeMode, styleSeed } from '../facade';
import { aabb, facadePoly, line, type LandmarkSink, type Placement, type Vec3 } from './kit';

export function prismTower(p: Placement, sink: LandmarkSink): void {
  const s = Math.min(p.hx, p.hy);
  const mastH = p.height * 0.12;
  const bodyH = p.height - mastH;
  const cap = bodyH * 0.07;
  const hs = [0.42, 0.6, 0.78, 0.93].map((f) => f * bodyH);
  const corners: [number, number][] = [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ];
  const style = p.style(styleSeed(3, 1, 1, 1), FacadeMode.Glass);
  for (let q = 0; q < 4; q++) {
    const [ax, ay] = corners[q]!;
    const [bx, by] = corners[(q + 1) % 4]!;
    const h = hs[q]!;
    const hO = h + cap;
    // 贴地的顶点伸到楼脚以下（z = 0 → −footing），斜坡上不悬空
    const v = (x: number, y: number, z: number): Vec3 => [x, y, z === 0 ? -p.footing : z];
    // 外立面、两侧内立面（被相邻柱遮住的部分无妨）、斜屋面；均从外面看逆时针
    facadePoly(p, sink, [v(ax, ay, 0), v(bx, by, 0), v(bx, by, h), v(ax, ay, h)], style);
    facadePoly(p, sink, [v(0, 0, 0), v(ax, ay, 0), v(ax, ay, h), v(0, 0, hO)], style);
    facadePoly(p, sink, [v(bx, by, 0), v(0, 0, 0), v(0, 0, hO), v(bx, by, h)], style);
    facadePoly(p, sink, [v(0, 0, hO), v(ax, ay, h), v(bx, by, h)], style);
    // 斜撑：每个模数（= 边长）一个 X 加一道环梁，贴外立面外 0.3 m
    const len = Math.hypot(bx - ax, by - ay);
    const ox = ((by - ay) / len) * 0.3;
    const oy = (-(bx - ax) / len) * 0.3;
    const A = (z: number): Vec3 => [ax + ox, ay + oy, z];
    const B = (z: number): Vec3 => [bx + ox, by + oy, z];
    const mod = 2 * s;
    let z = 0;
    for (; z + mod * 0.5 <= h; z += mod) {
      const z1 = Math.min(z + mod, h);
      line(p, sink, A(z), B(z1));
      line(p, sink, B(z), A(z1));
      line(p, sink, A(z), B(z));
    }
    line(p, sink, A(0), A(h));
    line(p, sink, A(h), B(h));
    line(p, sink, A(h), [ox * 0.2, oy * 0.2, hO]);
  }
  const top = hs[3]! + cap;
  for (const y of [-0.12 * s, 0.12 * s]) {
    aabb(p, sink, [-0.3 * s - 0.6, y - 0.6, top - cap * 0.3], [-0.3 * s + 0.6, y + 0.6, p.height], [0.85, 0.85, 0.9], 0.6);
  }
}
