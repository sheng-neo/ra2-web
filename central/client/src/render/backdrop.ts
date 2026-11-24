/**
 * 远景（全部程序合成，不是真实数据）：
 * - 海港北岸一圈低矮楼块，暗示对岸天际线；
 * - 对岸楼群后方和城区南面各一道山脊，夜里是深色剪影加零星灯点。
 * 全部写进一个立面网格，用 fogScale < 1 的建筑材质，雾里也能透出轮廓。一个 draw call。
 */
import { Mesh, SphereGeometry, type Material } from 'three';
import { extrudePrism } from './extrude';
import { FacadeMode, facadeVertex, newFacadeArrays, styleCode } from './facade';
import { mergeArrays, type MeshArrays } from './mesh-arrays';
import { createSkyMaterial } from './materials/sky';

/** 对岸岸线（模拟 y，米）：数据范围北界约 +900 m，对岸放在约 1.5 km 外。 */
export const FAR_SHORE_M = 1500;

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function farSkyline(m: MeshArrays): void {
  const rand = rng(918273);
  for (let x = -3600; x < 4800; ) {
    const w = 18 + rand() * 40;
    for (let row = 0; row < 4; row++) {
      if (rand() < 0.25) continue;
      const d = 16 + rand() * 30;
      const y = FAR_SHORE_M + 30 + row * 90 + rand() * 40;
      const tall = rand() < 0.08 ? 2.2 : 1;
      const h = (14 + rand() * rand() * 75 + row * 12) * tall;
      const cx = x + w / 2;
      const hw = (w / 2 - 2) * 10;
      const hd = (d / 2) * 10;
      extrudePrism(m, {
        outer: [cx * 10 - hw, y * 10 - hd, cx * 10 + hw, y * 10 - hd, cx * 10 + hw, y * 10 + hd, cx * 10 - hw, y * 10 + hd],
        holes: [],
        bottom: -10,
        base: 0,
        top: h * 10,
        style: styleCode(Math.floor(rand() * 256), FacadeMode.Windows, rand()),
        uOffset: rand() * 100,
      });
    }
    x += w + 4 + rand() * 10;
  }
}

/**
 * 山脊面：x 从 x0 到 x1，按 yRows（米）给出的若干条等 x 剖面连成网格，
 * 高度 height(x, y)（米）。法线由相邻点差分估算。
 */
function ridge(m: MeshArrays, x0: number, x1: number, yRows: number[], height: (x: number, y: number) => number): void {
  const step = 80;
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const style = styleCode(0, FacadeMode.Hill, 0.5);
  const ids: number[][] = [];
  for (const y of yRows) {
    const row: number[] = [];
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const z = height(x, y);
      const gx = (height(x + 5, y) - height(x - 5, y)) / 10;
      const gy = (height(x, y + 5) - height(x, y - 5)) / 10;
      const l = Math.hypot(gx, gy, 1);
      row.push(facadeVertex(m, x * 10, y * 10, z * 10, -gx / l, -gy / l, 1 / l, x, y, 999, style));
    }
    ids.push(row);
  }
  const forward = yRows[1]! > yRows[0]!;
  for (let j = 0; j + 1 < ids.length; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = ids[j]![i]!;
      const b = ids[j]![i + 1]!;
      const c = ids[j + 1]![i + 1]!;
      const d = ids[j + 1]![i]!;
      // 行沿 +y 排列时 (a, b, c) 从上往下看逆时针；沿 −y 时反过来
      if (forward) {
        m.tri(a, b, c);
        m.tri(a, c, d);
      } else {
        m.tri(a, c, b);
        m.tri(a, d, c);
      }
    }
  }
}

const bumps = (x: number, a: number, b: number, c: number) =>
  Math.sin(x * a) * 0.5 + Math.sin(x * b + 1.3) * 0.3 + Math.sin(x * c + 2.1) * 0.2;

export function buildBackdrop(material: Material): Mesh {
  const m = newFacadeArrays();
  farSkyline(m);
  // 对岸背后的山：离岸约 2.5–4 km，高 250–480 m
  ridge(m, -5000, 7000, [FAR_SHORE_M + 1200, FAR_SHORE_M + 2600, FAR_SHORE_M + 3600], (x, y) => {
    const t = Math.min(Math.max((y - FAR_SHORE_M - 1200) / 2400, 0), 1);
    return t * (330 + 150 * bumps(x, 0.0011, 0.0027, 0.0063));
  });
  // 城区南面的山：数据范围南界约 −980 m 以外，升到 380–560 m
  ridge(m, -4000, 5500, [-1050, -1500, -2000, -2600], (x, y) => {
    const t = Math.min(Math.max((-1050 - y) / 1300, 0), 1);
    return 20 + Math.pow(t, 0.8) * (440 + 120 * bumps(x, 0.0013, 0.0031, 0.0071));
  });
  const { geometry } = mergeArrays([m]);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'backdrop';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export function buildSky(radius: number): Mesh {
  const sky = new Mesh(new SphereGeometry(radius, 32, 16), createSkyMaterial());
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  return sky;
}
