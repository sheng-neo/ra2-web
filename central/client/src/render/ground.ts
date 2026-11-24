/**
 * 地面与海面：一块 0 mPD 的大平面 + 水体遮罩贴图（ground 材质据此区分陆地/海面）。
 * 有地形时再叠一张只含陆地的地形网格（terrain.bin 抽稀后的渲染网格，外沿带裙坡），海面仍是那块平面。
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  type IUniform,
} from 'three';
import type { CityFile, TerrainGrid } from '@central/data';
import { DM_TO_M, simToThree, simToThreeVec } from '../coords';
import { APRON_DM, apronFalloff } from '../data/terrain';
import { createGroundMaterial } from './materials/ground';

/** 遮罩分辨率（米/像素）。 */
const MASK_M = 4;
const OUTER_M = 14000;

function waterMask(city: CityFile): CanvasTexture {
  const [x0, y0, x1, y1] = city.meta.bbox;
  const w = Math.ceil(((x1 - x0) * DM_TO_M) / MASK_M);
  const h = Math.ceil(((y1 - y0) * DM_TO_M) / MASK_M);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  // 像素栅格正好铺满 bbox（每像素略小于 MASK_M）：贴图边缘那一列/行完全落在数据范围内。
  // 若按整 MASK_M 取整，最后一列有一截伸出 bbox、只被海面多边形盖住一部分，
  // 范围外按边缘像素延伸时会被当成陆地（鸟瞰东北角那块直边浅色楔形）。
  const px = (x: number) => ((x - x0) / (x1 - x0)) * w;
  const py = (y: number) => ((y1 - y) / (y1 - y0)) * h;
  for (const ring of city.water) {
    g.beginPath();
    for (const r of [ring.outer, ...(ring.holes ?? [])]) {
      for (let i = 0; i < r.length; i += 2) {
        if (i === 0) g.moveTo(px(r[i]!), py(r[i + 1]!));
        else g.lineTo(px(r[i]!), py(r[i + 1]!));
      }
      g.closePath();
    }
    g.fill('evenodd');
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/** 裙坡各圈离网格边的距离（占 APRON_DM 的比例），越往外越疏。 */
const APRON_RINGS = [0, 0.03, 0.08, 0.16, 0.28, 0.45, 0.7, 1];

/**
 * 陆地地形网格：只输出至少有一个角是陆地（≠ 0）的格子；海面交给 0 mPD 的大平面。
 * 每格沿 (i, j)–(i+1, j+1) 对角线分成两个三角形（与 data/terrain.reliefHeight 一致），从上往下看逆时针。
 * 网格外沿再向外铺一圈裙坡：高度按 apronFalloff 从边上的值降到 0，范围边缘不会出现断崖。
 */
export function reliefGeometry(grid: TerrainGrid): BufferGeometry {
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
    return APRON_RINGS.map((t, r) =>
      r === 0 ? node(e.i, e.j) : vertex(x + e.nx * t * APRON_DM, y + e.ny * t * APRON_DM, h0 * apronFalloff(t)),
    );
  });
  for (let k = 0; k < edge.length; k++) {
    const a = rings[k];
    const b = rings[(k + 1) % edge.length];
    if (!a || !b) continue;
    // 前进方向左侧是网格（逆时针），外圈在右侧：(a[r], a[r+1], b[r+1]) 从上往下看逆时针
    for (let r = 0; r + 1 < APRON_RINGS.length; r++) idx.push(a[r]!, a[r + 1]!, b[r + 1]!, a[r]!, b[r + 1]!, b[r]!);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

/** 返回地面网格：0 mPD 的大平面（海面，也是平地模式的地面），有地形时再加陆地网格。farShore 为对岸岸线的模拟 y（米）。 */
export function buildGround(city: CityFile, relief: TerrainGrid | null, farShore: number, time: IUniform<number>): Mesh[] {
  const [x0, y0, x1, y1] = city.meta.bbox;
  const rect: [number, number, number, number] = [x0 * DM_TO_M, y0 * DM_TO_M, (x1 - x0) * DM_TO_M, (y1 - y0) * DM_TO_M];
  const material = createGroundMaterial(waterMask(city), rect, farShore, time);
  const [cx, , cz] = simToThreeVec((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const plane = new PlaneGeometry(OUTER_M, OUTER_M);
  plane.rotateX(-Math.PI / 2);
  plane.translate(cx, 0, cz);
  const sea = new Mesh(plane, material);
  sea.name = 'ground';
  if (!relief) return [sea];
  const land = new Mesh(reliefGeometry(relief), material);
  land.name = 'terrain';
  return [land, sea];
}
