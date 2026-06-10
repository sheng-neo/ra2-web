/**
 * 体素→精灵烘焙：把 VXL 模型按朝向光栅化成等距精灵。
 * 每个体素画成一个带光照的等距小立方体（顶面亮、左右面渐暗），
 * 按深度画家排序——无需法线表即可得到立体的载具外观。
 * 启动时按 N 个朝向烘焙好，运行期按单位朝向取对应精灵。
 */
import type { VxlFile, Voxel } from '@ra2web/data';

/** 单个体素的等距尺寸（像素）。 */
const VS = 2.2;
/** 体素竖直高度（像素）。 */
const VZ = 2.2;

interface Projected {
  voxel: Voxel;
  sx: number;
  sy: number;
  depth: number;
}

/** 玩家变色调色板区间（与 SHP 一致）。 */
const REMAP_LO = 16;
const REMAP_HI = 31;

/**
 * 烘焙一个朝向。bangle 为 0–255 二进制角（0=朝右/东，逆时针）。
 * remapRgb 给定时，把调色板 16–31（玩家变色区）替换为该色的明暗梯度。
 * 返回 canvas，及锚点（单位中心在 canvas 内的像素坐标）。
 */
export function bakeVoxelFacing(
  vxl: VxlFile,
  bangle: number,
  remapRgb?: readonly [number, number, number],
): { canvas: HTMLCanvasElement; anchorX: number; anchorY: number } {
  const rad = (bangle / 256) * Math.PI * 2;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 收集所有节的体素，统一以模型中心为原点旋转
  const projected: Projected[] = [];
  let minSX = Infinity;
  let maxSX = -Infinity;
  let minSY = Infinity;
  let maxSY = -Infinity;

  for (const sec of vxl.sections) {
    const cx = sec.sizeX / 2;
    const cy = sec.sizeY / 2;
    for (const v of sec.voxels) {
      // 以中心为原点，绕竖直轴旋转
      const ox = v.x - cx;
      const oy = v.y - cy;
      const rx = ox * cos - oy * sin;
      const ry = ox * sin + oy * cos;
      const sx = (rx - ry) * VS;
      const sy = (rx + ry) * VS * 0.5 - v.z * VZ;
      const depth = rx + ry + v.z * 0.5;
      projected.push({ voxel: v, sx, sy, depth });
      minSX = Math.min(minSX, sx - VS);
      maxSX = Math.max(maxSX, sx + VS);
      minSY = Math.min(minSY, sy - VZ);
      maxSY = Math.max(maxSY, sy + VS);
    }
  }

  const pad = 4;
  const w = Math.max(2, Math.ceil(maxSX - minSX) + pad * 2);
  const h = Math.max(2, Math.ceil(maxSY - minSY) + pad * 2);
  const originX = -minSX + pad;
  const originY = -minSY + pad;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // 远→近
  projected.sort((a, b) => a.depth - b.depth);

  const pal = vxl.palette;
  for (const p of projected) {
    const c = p.voxel.color;
    let r: number;
    let g: number;
    let b: number;
    if (remapRgb && c >= REMAP_LO && c <= REMAP_HI) {
      // 玩家变色：按区间内位置取明暗梯度
      const f = 0.45 + 0.55 * ((REMAP_HI - c) / (REMAP_HI - REMAP_LO));
      r = remapRgb[0] * f;
      g = remapRgb[1] * f;
      b = remapRgb[2] * f;
    } else {
      r = pal[c * 4]!;
      g = pal[c * 4 + 1]!;
      b = pal[c * 4 + 2]!;
    }
    drawVoxelCube(ctx, originX + p.sx, originY + p.sy, r, g, b);
  }

  return { canvas, anchorX: originX, anchorY: originY };
}

function shade(v: number, f: number): number {
  return Math.max(0, Math.min(255, Math.round(v * f)));
}

/** 画一个等距小立方体：顶面 + 左面(暗) + 右面(中)。 */
function drawVoxelCube(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, g: number, b: number): void {
  const w2 = VS;
  const h2 = VS * 0.5;
  // 右面（中亮）
  ctx.fillStyle = `rgb(${shade(r, 0.82)},${shade(g, 0.82)},${shade(b, 0.82)})`;
  ctx.beginPath();
  ctx.moveTo(x, y + h2);
  ctx.lineTo(x + w2, y);
  ctx.lineTo(x + w2, y + VZ);
  ctx.lineTo(x, y + h2 + VZ);
  ctx.closePath();
  ctx.fill();
  // 左面（暗）
  ctx.fillStyle = `rgb(${shade(r, 0.6)},${shade(g, 0.6)},${shade(b, 0.6)})`;
  ctx.beginPath();
  ctx.moveTo(x - w2, y);
  ctx.lineTo(x, y + h2);
  ctx.lineTo(x, y + h2 + VZ);
  ctx.lineTo(x - w2, y + VZ);
  ctx.closePath();
  ctx.fill();
  // 顶面（亮）
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.beginPath();
  ctx.moveTo(x, y - h2);
  ctx.lineTo(x + w2, y);
  ctx.lineTo(x, y + h2);
  ctx.lineTo(x - w2, y);
  ctx.closePath();
  ctx.fill();
}
