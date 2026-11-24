import { gzipSync } from 'node:zlib';
import { decodeTerrain, encodeTerrain, sampleTerrain } from '@central/data';
import { describe, expect, it } from 'vitest';
import { EXTENT, ORIGIN } from '../config';
import { project, projectRectBounds } from './project';
import { buildTerrain, DTM_HEADER_FILE, parseRawDtm, resampleDtm, type RawDtm } from './terrain';

const ND = -32768;

/** 1 m 原始网格：西南角在本地 (ex, ny) 米处，f 按 HK1980 坐标（米）给 dm。 */
function rawGrid(e0: number, n0: number, nx: number, ny: number, f: (e: number, n: number) => number): RawDtm {
  const data = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = f(e0 + i, n0 + j);
  return { source: 'test', e0, n0, cell: 1, nx, ny, nodata: ND, data };
}

describe('resampleDtm', () => {
  // 覆盖本地 x ∈ [-100, 100] m、y ∈ [-100, 100] m
  const E0 = ORIGIN.e - 100;
  const N0 = ORIGIN.n - 100;

  it('网格对齐到 cell 整数倍并包住 bounds', () => {
    const raw = rawGrid(E0, N0, 201, 201, () => 70);
    const { grid, uncovered } = resampleDtm(raw, [-512, -488, 513, 487], 50);
    expect([grid.x0, grid.y0, grid.cell]).toEqual([-550, -500, 50]);
    expect(grid.x0 + (grid.nx - 1) * grid.cell).toBeGreaterThanOrEqual(513);
    expect(grid.y0 + (grid.ny - 1) * grid.cell).toBeGreaterThanOrEqual(487);
    expect(uncovered).toBe(0);
    expect(new Set(grid.heights)).toEqual(new Set([70]));
  });

  it('线性坡面：盒式均值等于节点处的值', () => {
    // 每米向东升 0.3 m（3 dm），向北升 0.1 m
    const raw = rawGrid(E0, N0, 201, 201, (e, n) => 200 + 3 * (e - ORIGIN.e) + (n - ORIGIN.n));
    const { grid } = resampleDtm(raw, [-500, -500, 500, 500], 50);
    for (const [x, y] of [[-500, -500], [0, 0], [250, -100], [500, 500]] as const) {
      expect(sampleTerrain(grid, x, y)).toBe(200 + 3 * (x / 10) + y / 10);
    }
  });

  it('海岸：有效面积过半取陆地均值，否则写 0', () => {
    // 本地 y ≥ 0（N ≥ ORIGIN.n）是海
    const raw = rawGrid(E0, N0, 201, 201, (_e, n) => (n >= ORIGIN.n ? ND : 45));
    const { grid, land } = resampleDtm(raw, [-500, -500, 500, 500], 50);
    const at = (x: number, y: number) => (y - grid.y0) / 50 * grid.nx + (x - grid.x0) / 50;
    // y = -50 dm 的节点框 [-7.5, -2.5] m 全是陆地；y = 0 的框 [-2.5, 2.5] m 有 2 行陆地 3 行海 → 海
    expect(grid.heights[at(0, -50)]).toBe(45);
    expect(land[at(0, -50)]).toBe(1);
    expect(grid.heights[at(0, 0)]).toBe(0);
    expect(land[at(0, 0)]).toBe(0);
    expect(grid.heights[at(0, 500)]).toBe(0);
  });

  it('局部无数据只用有效采样求均值', () => {
    // 节点 (0,0) 的 5×5 框里挖掉 4 个采样，其余为 80
    const raw = rawGrid(E0, N0, 201, 201, (e, n) => (Math.abs(e - ORIGIN.e) <= 1 && n === ORIGIN.n ? ND : 80));
    const { grid } = resampleDtm(raw, [-100, -100, 100, 100], 50);
    expect(sampleTerrain(grid, 0, 0)).toBe(80);
  });

  it('越出快照的格计入 uncovered', () => {
    const raw = rawGrid(E0, N0, 201, 201, () => 10);
    expect(resampleDtm(raw, [-1000, -1000, 1000, 1000], 50).uncovered).toBeGreaterThan(0);
  });
});

describe('parseRawDtm', () => {
  const header = { format: 'central-dtm-raw', version: 1, source: 's', crs: 'EPSG:2326', e0: 1, n0: 2, cell: 1, nx: 3, ny: 2, unit: 'dm', nodata: ND, data: 'd.gz' };
  const bytes = (h: object) => new TextEncoder().encode(JSON.stringify(h));
  const body = () => {
    const b = Buffer.alloc(12);
    [10, -20, 30, ND, 0, 32767].forEach((v, k) => b.writeInt16LE(v, 2 * k));
    return gzipSync(b);
  };

  it('按小端 int16 解出网格', () => {
    const raw = parseRawDtm(new Map([[DTM_HEADER_FILE, bytes(header)], ['d.gz', body()]]));
    expect(raw).toMatchObject({ e0: 1, n0: 2, cell: 1, nx: 3, ny: 2, nodata: ND });
    expect(Array.from(raw.data)).toEqual([10, -20, 30, ND, 0, 32767]);
  });

  it('缺文件、格式不对、长度不符都抛错', () => {
    expect(() => parseRawDtm(new Map())).toThrow(/缺少/);
    expect(() => parseRawDtm(new Map([[DTM_HEADER_FILE, bytes(header)]]))).toThrow(/缺少 d\.gz/);
    expect(() => parseRawDtm(new Map([[DTM_HEADER_FILE, bytes({ ...header, unit: 'm' })], ['d.gz', body()]]))).toThrow(/dm/);
    expect(() => parseRawDtm(new Map([[DTM_HEADER_FILE, bytes({ ...header, nx: 4 })], ['d.gz', body()]]))).toThrow(/字节/);
  });
});

describe('buildTerrain（仓库快照：CEDD 2020 LiDAR DTM）', () => {
  const { grid, land, report } = buildTerrain();
  const at = (lon: number, lat: number) => sampleTerrain(grid, ...project(lon, lat)) / 10;

  it('5 m 网格覆盖整个渲染范围，无越界格', () => {
    const b = projectRectBounds(EXTENT);
    expect(grid.cell).toBe(50);
    expect(grid.x0).toBeLessThanOrEqual(b[0]);
    expect(grid.y0).toBeLessThanOrEqual(b[1]);
    expect(grid.x0 + (grid.nx - 1) * grid.cell).toBeGreaterThanOrEqual(b[2]);
    expect(grid.y0 + (grid.ny - 1) * grid.cell).toBeGreaterThanOrEqual(b[3]);
    expect(report.uncoveredCells).toBe(0);
    expect(land.length).toBe(grid.nx * grid.ny);
  });

  it('高程范围合理：海面为 0，陆地 −5 m 到 600 m', () => {
    expect(report.minDm).toBeGreaterThan(-50);
    expect(report.maxDm).toBeLessThan(6000);
    expect(report.seaCells).toBeGreaterThan(0.15 * grid.nx * grid.ny);
    expect(report.repair).toEqual({ outOfRange: 0, spikes: 0, holesFilled: 0, holeCellsFilled: 0, holesLeft: 0 });
  });

  it('地标处高程（mPD）落在常识区间', () => {
    expect(at(114.16, 22.281)).toBeGreaterThan(3); // 皇后像广场
    expect(at(114.16, 22.281)).toBeLessThan(8);
    expect(at(114.157, 22.28133)).toBeGreaterThan(4); // 皇后大道中 × 毕打街
    expect(at(114.157, 22.28133)).toBeLessThan(10);
    expect(at(114.1505, 22.284)).toBeGreaterThan(18); // 荷李活道 · 文武庙
    expect(at(114.1505, 22.284)).toBeLessThan(35);
    expect(at(114.15236, 22.28101)).toBeGreaterThan(55); // 坚道 × 扶梯
    expect(at(114.15236, 22.28101)).toBeLessThan(80);
    expect(at(114.1612, 22.28707)).toBe(0); // 天星码头桥面在海上，裸地模型里是海
  });

  it('裸地模型里没有长条高架', () => {
    expect(report.elevated.clusters.length).toBeLessThanOrEqual(1);
  });

  it('编码进 terrain.bin 再解码不变', () => {
    const back = decodeTerrain(encodeTerrain(grid));
    expect(back.nx).toBe(grid.nx);
    expect(Buffer.from(back.heights.buffer).equals(Buffer.from(grid.heights.buffer))).toBe(true);
  });
});
