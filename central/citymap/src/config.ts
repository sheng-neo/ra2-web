/**
 * 管线常量：范围、原点、目录。改动范围或原点须同步 PLAN.md §3 与客户端。
 */
import path from 'node:path';

/** 管线版本：输出格式或算法变化时递增（写进 meta.build.pipelineVersion）。 */
export const PIPELINE_VERSION = '0.3.0';

export const OVERTURE_RELEASE = '2026-11-18.0';

/** WGS84 经纬度矩形。 */
export interface LonLatRect {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** 渲染/数据范围（v2 + 余量）。 */
export const EXTENT: LonLatRect = { west: 114.147, south: 22.274, east: 114.171, north: 22.291 };

/** MVP 可玩区：东界停在花园道一线，离军事用地 ≥100 m。 */
export const MVP_RECT: LonLatRect = { west: 114.155, south: 22.2785, east: 114.1612, north: 22.2875 };

/** 本地原点（HK1980 Grid，米）。 */
export const ORIGIN = { e: 834000, n: 816000 } as const;

const ROOT = path.resolve(import.meta.dirname, '..');

export const RAW_DIR = path.join(ROOT, 'data-raw', `overture-${OVERTURE_RELEASE}`);

/** 港府官方数据快照目录（CEDD LiDAR 地形、LandsD 建筑与行人网络），条款见其中的 TERMS.md。 */
export const LANDSD_DIR = path.join(ROOT, 'data-raw', 'landsd');

/** 产物目录（客户端 public/，Vite 原样拷贝）。 */
export const OUT_DIR = path.resolve(ROOT, '..', 'client', 'public', 'city');
