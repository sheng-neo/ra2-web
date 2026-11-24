/**
 * 地面：一块 0 mPD 的大平面（只画陆地底色；海面由 water/ 图层画在它上面）。
 * 有地形时再叠一张只含陆地的地形网格（terrain.bin 抽稀后的渲染网格，外沿带裙坡）。
 * 地形网格用自己的材质（materials/terrain.ts：树冠 / 混凝土 / 路灯照亮的边缘），
 * 并在道路路廊下压低（road-corridor.ts），水平路面不会被地形顶穿（realism STREETS）。
 */
import { BufferAttribute, BufferGeometry, Mesh, PlaneGeometry } from 'three';
import type { CityFile, TerrainGrid } from '@central/data';
import { simToThree, simToThreeVec } from '../coords';
import { APRON_DM, apronFalloff, reliefHeight } from '../data/terrain';
import { createGroundMaterial } from './materials/ground';
import { getQuality } from './materials/lighting';
import { createTerrainMaterial } from './materials/terrain';
import { cellsUnderBuildings, renderedTerrain } from './road-corridor';
import { cachedRoadPlans } from './roads';
import { groundMask } from './streets/ground-mask';

const OUTER_M = 14000;

/** 裙坡各圈离网格边的距离（占 APRON_DM 的比例），越往外越疏；LOW 档用疏的一套。 */
const APRON_RINGS = [0, 0.04, 0.12, 0.28, 0.55, 1];
const APRON_RINGS_LOW = [0, 0.08, 0.28, 0.7, 1];

/**
 * 陆地地形网格：只输出至少有一个角是陆地（≠ 0）的格子；海面交给 0 mPD 的大平面。
 * hidden（可选，按格子下标）标记的格子不画（完全在楼宇里面，见 road-corridor.cellsUnderBuildings）。
 * 每格沿 (i, j)–(i+1, j+1) 对角线分成两个三角形（与 data/terrain.reliefHeight 一致），从上往下看逆时针。
 * 网格外沿再向外铺一圈裙坡：高度按 apronFalloff 从边上的值降到 0，范围边缘不会出现断崖。
 */
export function reliefGeometry(grid: TerrainGrid, hidden?: Uint8Array, apronRings: readonly number[] = APRON_RINGS): BufferGeometry {
  const { x0, y0, cell, nx, ny, heights: h } = grid;
  const pos: number[] = [];
  const idx: number[] = [];
  const ids = new Int32Array(nx * ny).fill(-1);
  const v = [0, 0, 0];
  const vertex = (x: number, y: number, z: number): number => {
    simToThree(x, y, z, v);
    pos.push(v[0]!, v[1]!, v[2]!);
    return pos.length / 3 - 1;
  };
  const node = (i: number, j: number): number => {
    const k = j * nx + i;
    if (ids[k]! < 0) ids[k] = vertex(x0 + i * cell, y0 + j * cell, h[k]!);
    return ids[k]!;
  };
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i;
      if (h[a] === 0 && h[a + 1] === 0 && h[a + nx] === 0 && h[a + nx + 1] === 0) continue;
      if (hidden?.[a]) continue;
      const p00 = node(i, j);
      const p10 = node(i + 1, j);
      const p11 = node(i + 1, j + 1);
      const p01 = node(i, j + 1);
      idx.push(p00, p10, p11, p00, p11, p01);
    }
  }
  // 裙坡：沿外沿逆时针走一圈（南 → 东 → 北 → 西），每个边节点带外法线；四角插一个对角法线，补成圆角
  const edge: { i: number; j: number; nx: number; ny: number }[] = [];
  const side = (i0: number, j0: number, di: number, dj: number, n: number, ox: number, oy: number) => {
    for (let k = 0; k < n; k++) edge.push({ i: i0 + di * k, j: j0 + dj * k, nx: ox, ny: oy });
  };
  const corner = (i: number, j: number, ox: number, oy: number) => edge.push({ i, j, nx: ox * Math.SQRT1_2, ny: oy * Math.SQRT1_2 });
  corner(0, 0, -1, -1);
  side(0, 0, 1, 0, nx, 0, -1);
  corner(nx - 1, 0, 1, -1);
  side(nx - 1, 0, 0, 1, ny, 1, 0);
  corner(nx - 1, ny - 1, 1, 1);
  side(nx - 1, ny - 1, -1, 0, nx, 0, 1);
  corner(0, ny - 1, -1, 1);
  side(0, ny - 1, 0, -1, ny, -1, 0);
  const rings = edge.map((e) => {
    const h0 = h[e.j * nx + e.i]!;
    if (h0 === 0) return null;
    const x = x0 + e.i * cell;
    const y = y0 + e.j * cell;
    return apronRings.map((t, r) =>
      r === 0 ? node(e.i, e.j) : vertex(x + e.nx * t * APRON_DM, y + e.ny * t * APRON_DM, h0 * apronFalloff(t)),
    );
  });
  for (let k = 0; k < edge.length; k++) {
    const a = rings[k];
    const b = rings[(k + 1) % edge.length];
    if (!a || !b) continue;
    // 前进方向左侧是网格（逆时针），外圈在右侧：(a[r], a[r+1], b[r+1]) 从上往下看逆时针
    for (let r = 0; r + 1 < apronRings.length; r++) idx.push(a[r]!, a[r + 1]!, b[r + 1]!, a[r]!, b[r + 1]!, b[r]!);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * 返回地面网格：0 mPD 的大平面（陆地底色，也是平地模式的地面），有地形时再加陆地网格。
 * apron = false（整合时加）：不画网格外的裙坡——远景（backdrop.ts）的山体高度场在网格边上正好接上地形，
 * 裙坡全被它盖住或与它穿插，只是白白多出 1.4–1.8 万个三角形（LOW 档全城视角正好卡在 30 万上限）。
 */
export function buildGround(city: CityFile, relief: TerrainGrid | null, apron = true): Mesh[] {
  const [x0, y0, x1, y1] = city.meta.bbox;
  const material = createGroundMaterial();
  const [cx, , cz] = simToThreeVec((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const plane = new PlaneGeometry(OUTER_M, OUTER_M);
  plane.rotateX(-Math.PI / 2);
  plane.translate(cx, 0, cz);
  const base = new Mesh(plane, material);
  base.name = 'ground';
  if (!relief) return [base];
  // 地形：路廊下压低后的网格 + 地形材质（遮罩与道路规划和街道层共用同一份缓存）
  const plans = cachedRoadPlans(city.roads, reliefHeight(relief));
  const mask = groundMask(city, plans);
  const low = getQuality().tier === 'low';
  const geometry = reliefGeometry(
    renderedTerrain(relief, plans, city.buildings).grid,
    cellsUnderBuildings(relief, city.buildings),
    !apron ? [] : low ? APRON_RINGS_LOW : APRON_RINGS,
  );
  geometry.computeVertexNormals();
  const land = new Mesh(geometry, createTerrainMaterial(mask.texture, mask.rect));
  land.name = 'terrain';
  return [land, base];
}
