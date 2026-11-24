/**
 * 03-terrain：官方 DTM 快照（data-raw/landsd/）→ TerrainGrid（本地 dm，覆盖渲染范围）。
 * 数据：CEDD 2020 机载 LiDAR DTM（裸地，HK1980 Grid，mPD），快照里已重采样成 1 m 整米节点 int16 dm
 * （fetch/landsd_fetch.py 生成，格式见 cedd-dtm-2020-1m.json）。
 * 步骤：按 sources.json 校验 sha256 → 解压 → 修补（terrain-repair）→ 面积加权盒式重采样到 cell
 * （默认 5 m）→ 高架结构检查（terrain-elevated，只报告）。
 * 海面与无数据写 0（schema 约定）。地形单独成层写 terrain.bin，不混进 ODbL 记录。
 */
import { gunzipSync } from 'node:zlib';
import type { TerrainGrid } from '@central/data';
import { EXTENT, LANDSD_DIR, ORIGIN } from '../config';
import type { Rect } from '../geo/polyline';
import { projectRectBounds } from './project';
import { loadSnapshot, type Snapshot } from './snapshot';
import { findElevated, type ElevatedReport } from './terrain-elevated';
import { repairDtm, type RepairReport } from './terrain-repair';

export const DTM_HEADER_FILE = 'cedd-dtm-2020-1m.json';
/** 默认 5 m：MVP 下载预算里 terrain.bin 约 0.37 MB（未压缩）；LiDAR 原始 0.5 m 先在快照里降到 1 m。 */
export const DEFAULT_TERRAIN_CELL_DM = 50;
/** 采样框里有效（陆地）面积不足这个比例就算海面，写 0。 */
const LAND_SHARE = 0.5;

/** cedd-dtm-2020-1m.json 里管线用到的字段。 */
interface DtmHeader {
  format: string;
  version: number;
  source: string;
  crs: string;
  e0: number;
  n0: number;
  cell: number;
  nx: number;
  ny: number;
  unit: string;
  nodata: number;
  data: string;
}

/** 解压后的原始 DTM：采样 (i, j) 在 HK1980 Grid (e0 + i*cell, n0 + j*cell)，米。 */
export interface RawDtm {
  source: string;
  e0: number;
  n0: number;
  /** 采样间距（米）。 */
  cell: number;
  nx: number;
  ny: number;
  nodata: number;
  /** 高程 dm（mPD），index = j*nx + i，行由南向北。 */
  data: Int16Array;
}

export interface TerrainOptions {
  /** 输出范围（本地 dm），默认渲染范围 EXTENT 的投影外包。网格向外对齐到 cell 的整数倍。 */
  bounds?: Rect;
  /** 网格间距（dm），默认 50。 */
  cell?: number;
}

export interface TerrainReport {
  source: string;
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  landCells: number;
  seaCells: number;
  /** 采样框有一部分落在快照外的格（应为 0）。 */
  uncoveredCells: number;
  /** 陆地格的高程统计（dm）。 */
  minDm: number;
  medianDm: number;
  maxDm: number;
  /** 低于 0 mPD 的陆地格（隧道口明挖段属正常）。 */
  negativeCells: number;
  repair: RepairReport;
  elevated: ElevatedReport;
}

export interface TerrainBuild {
  grid: TerrainGrid;
  /** 每格是否陆地（1）或海面（0），与 grid.heights 同索引。 */
  land: Uint8Array;
  report: TerrainReport;
  /** 快照全部文件的组合 sha256（见 snapshot.ts）。 */
  inputsDigest: string;
}

/** 从快照文件表（loadSnapshot(dir).files）读出网格头和数据。 */
export function parseRawDtm(files: ReadonlyMap<string, Uint8Array>): RawDtm {
  const headerBytes = files.get(DTM_HEADER_FILE);
  if (!headerBytes) throw new Error(`快照缺少 ${DTM_HEADER_FILE}`);
  const h = JSON.parse(new TextDecoder().decode(headerBytes)) as DtmHeader;
  if (h.format !== 'central-dtm-raw' || h.version !== 1) throw new Error(`不认识的 DTM 头：${h.format} v${h.version}`);
  if (h.crs !== 'EPSG:2326' || h.unit !== 'dm') throw new Error(`DTM 须为 EPSG:2326 + dm，实为 ${h.crs} + ${h.unit}`);
  const gz = files.get(h.data);
  if (!gz) throw new Error(`快照缺少 ${h.data}`);
  const raw = gunzipSync(gz);
  const n = h.nx * h.ny;
  if (raw.byteLength !== 2 * n) throw new Error(`${h.data} 解压后 ${raw.byteLength} 字节，应为 ${2 * n}`);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const data = new Int16Array(n);
  for (let k = 0; k < n; k++) data[k] = dv.getInt16(2 * k, true);
  return { source: h.source, e0: h.e0, n0: h.n0, cell: h.cell, nx: h.nx, ny: h.ny, nodata: h.nodata, data };
}

/** 一个轴向的盒式滤波抽头：源索引、权重（重叠长度，源采样为单位），以及落在源网格外的权重。 */
interface Taps {
  idx: number[];
  w: number[];
  missing: number;
}

function taps(f: number, half: number, n: number): Taps {
  const out: Taps = { idx: [], w: [], missing: 0 };
  for (let s = Math.ceil(f - half - 0.5); s <= Math.floor(f + half + 0.5); s++) {
    const w = Math.min(f + half, s + 0.5) - Math.max(f - half, s - 0.5);
    if (w <= 1e-9) continue;
    if (s < 0 || s >= n) out.missing += w;
    else {
      out.idx.push(s);
      out.w.push(w);
    }
  }
  return out;
}

/**
 * 重采样到本地 dm 网格：每个节点取以它为中心、边长 cell 的方框与源采样的面积加权均值，只计有效采样；
 * 有效面积不足一半算海面（0）。返回网格、陆地掩膜与有采样框越出快照的格数。
 */
export function resampleDtm(
  raw: RawDtm,
  bounds: Rect,
  cell: number,
): { grid: TerrainGrid; land: Uint8Array; uncovered: number } {
  const x0 = Math.floor(bounds[0] / cell) * cell;
  const y0 = Math.floor(bounds[1] / cell) * cell;
  const nx = Math.ceil((bounds[2] - x0) / cell) + 1;
  const ny = Math.ceil((bounds[3] - y0) / cell) + 1;
  const half = cell / 10 / 2 / raw.cell;
  const cols = Array.from({ length: nx }, (_, i) => taps((ORIGIN.e + (x0 + i * cell) / 10 - raw.e0) / raw.cell, half, raw.nx));
  const rows = Array.from({ length: ny }, (_, j) => taps((ORIGIN.n + (y0 + j * cell) / 10 - raw.n0) / raw.cell, half, raw.ny));
  const full = (2 * half) ** 2;

  const heights = new Int16Array(nx * ny);
  const land = new Uint8Array(nx * ny);
  let uncovered = 0;
  for (let j = 0; j < ny; j++) {
    const row = rows[j]!;
    for (let i = 0; i < nx; i++) {
      const col = cols[i]!;
      if (row.missing > 0 || col.missing > 0) uncovered++;
      let sum = 0;
      let wValid = 0;
      for (let b = 0; b < row.idx.length; b++) {
        const base = row.idx[b]! * raw.nx;
        const wy = row.w[b]!;
        for (let a = 0; a < col.idx.length; a++) {
          const v = raw.data[base + col.idx[a]!]!;
          if (v === raw.nodata) continue;
          const w = wy * col.w[a]!;
          sum += w * v;
          wValid += w;
        }
      }
      const k = j * nx + i;
      if (wValid > 0 && wValid >= LAND_SHARE * full) {
        heights[k] = Math.round(sum / wValid);
        land[k] = 1;
      }
    }
  }
  return { grid: { x0, y0, cell, nx, ny, heights }, land, uncovered };
}

/** 读快照 → 修补 → 重采样 → 报告。默认读仓库里的 data-raw/landsd，覆盖渲染范围，5 m 网格。 */
export function buildTerrain(snapshot: Snapshot = loadSnapshot(LANDSD_DIR), opts: TerrainOptions = {}): TerrainBuild {
  const raw = parseRawDtm(snapshot.files);
  const repaired = repairDtm(raw.data, raw.nx, raw.ny, raw.nodata);
  const cell = opts.cell ?? DEFAULT_TERRAIN_CELL_DM;
  const { grid, land, uncovered } = resampleDtm(
    { ...raw, data: repaired.data },
    opts.bounds ?? projectRectBounds(EXTENT),
    cell,
  );

  const landHeights: number[] = [];
  for (let k = 0; k < land.length; k++) if (land[k]) landHeights.push(grid.heights[k]!);
  landHeights.sort((a, b) => a - b);
  const report: TerrainReport = {
    source: raw.source,
    x0: grid.x0,
    y0: grid.y0,
    cell,
    nx: grid.nx,
    ny: grid.ny,
    landCells: landHeights.length,
    seaCells: land.length - landHeights.length,
    uncoveredCells: uncovered,
    minDm: landHeights[0] ?? 0,
    medianDm: landHeights[landHeights.length >> 1] ?? 0,
    maxDm: landHeights[landHeights.length - 1] ?? 0,
    negativeCells: landHeights.filter((v) => v < 0).length,
    repair: repaired.report,
    elevated: findElevated(grid, land),
  };
  return { grid, land, report, inputsDigest: snapshot.inputsDigest };
}
