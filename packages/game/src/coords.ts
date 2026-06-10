/**
 * 坐标系 —— 沿用红警2 原版的整数坐标：
 * 1 个地图格（cell）= 256 lepton。模拟层一切位置均为整数 lepton，
 * 这是锁步联机确定性的根基（杜绝浮点误差）。
 */

export const LEPTONS_PER_CELL = 256;

/** 模拟 tick 频率（Hz）。渲染层在 tick 之间做插值。 */
export const SIM_TICKS_PER_SECOND = 15;

/** 格 → lepton（取格中心）。 */
export function cellToLepton(cell: number): number {
  return cell * LEPTONS_PER_CELL + LEPTONS_PER_CELL / 2;
}

/** lepton → 所在格（向下取整）。 */
export function leptonToCell(lepton: number): number {
  return Math.floor(lepton / LEPTONS_PER_CELL);
}
