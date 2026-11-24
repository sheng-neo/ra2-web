/**
 * 霓虹中心（neon-centre）：四角内凹的方塔，立面每两层一圈灯带；顶部收窄的冠顶与桅杆。造型神似、不按比例复刻。
 * 写实化一轮：灯带改为静态颜色（塔身青白、冠顶金色，取冠顶色板），不再变色流动（不做灯光秀）。
 */
import { FacadeMode, styleSeed } from '../facade';
import { aabb, emitOf, neonQuad, notchedSquare, prism, ringEdges, type LandmarkSink, type Placement, type Rgb } from './kit';

/** 塔身灯带（青，契约 edgeLed 2–4 的下沿）与冠顶灯带（金）。 */
const BODY_BAND = emitOf('crownCyan', 2.0);
const CROWN_BAND = emitOf('crownGold', 2.6);

const BAND_STEP = 6.4;
const BAND_H = 0.7;

export function neonCentre(p: Placement, sink: LandmarkSink): void {
  const a = Math.min(p.hx, p.hy);
  const bodyH = p.height * 0.86;
  const crownTop = p.height * 0.93;
  const body = notchedSquare(a, a * 0.16);
  const crown = notchedSquare(a * 0.7, a * 0.12);
  prism(p, sink, body, 0, bodyH, p.style(styleSeed(1, 1, 1, 0), FacadeMode.Office));
  prism(p, sink, crown, bodyH, crownTop, p.style(styleSeed(3, 0, 1, 1), FacadeMode.Glass));
  aabb(p, sink, [-0.8, -0.8, crownTop], [0.8, 0.8, p.height], [0.8, 0.8, 0.85], 0.5);
  if (p.sensitive) return;
  const bands = (ring: number[], z0: number, z1: number, step: number, emit: Rgb) => {
    const edges = ringEdges(ring, 0.25);
    for (let z = z0; z + BAND_H < z1; z += step) {
      for (const [x0, y0, x1, y1] of edges) {
        neonQuad(p, sink, [x0, y0, z], [x1, y1, z], [x1, y1, z + BAND_H], [x0, y0, z + BAND_H], emit);
      }
    }
  };
  bands(body, 12, bodyH - 1, BAND_STEP * 2, BODY_BAND);
  bands(crown, bodyH + 2, crownTop - 1, BAND_STEP / 2, CROWN_BAND);
}
