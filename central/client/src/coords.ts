/**
 * 模拟坐标 → three.js 坐标：全客户端唯一的换算点（见 @central/data schema 注释）。
 *
 * 模拟坐标：x 东、y 北、z 上，单位分米（dm）；three.js：x 东、y 上、z 南，单位米。
 * (x, y, z)sim → (x/10, z/10, −y/10)three。这是一次真旋转（行列式 +1），
 * 所以从外面看逆时针的三角形换算后仍是逆时针，正面朝向不变。
 *
 * 方向（法线等）同样走这个函数，传 scale = 1 只换轴不缩放。
 */
export const DM_TO_M = 0.1;

export function simToThree(
  x: number,
  y: number,
  z: number,
  out: { [i: number]: number },
  offset = 0,
  scale = DM_TO_M,
): void {
  out[offset] = x * scale;
  out[offset + 1] = z * scale;
  out[offset + 2] = -y * scale;
}

/** 便捷版：返回新数组 [x, y, z]（米）。只用于非热点路径。 */
export function simToThreeVec(x: number, y: number, z: number, scale = DM_TO_M): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  simToThree(x, y, z, out, 0, scale);
  return out;
}

/** 米为单位的模拟坐标（相机预设、地标局部坐标用）→ three。 */
export function simMetresToThree(x: number, y: number, z: number): [number, number, number] {
  return simToThreeVec(x, y, z, 1);
}

/** 逆换算：three（米）→ 模拟坐标（dm）。只给相机贴地、拾取等少数读回场景的地方用。 */
export function threeToSim(x: number, y: number, z: number): [number, number, number] {
  return [x / DM_TO_M, -z / DM_TO_M, y / DM_TO_M];
}
