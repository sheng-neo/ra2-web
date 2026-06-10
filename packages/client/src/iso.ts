/** 等距投影工具（屏幕格 60×30）。世界坐标单位为 lepton（256/格）。 */
export const TILE_W = 60;
export const TILE_H = 30;

/** 网格角 (cx,cy) → 屏幕坐标（格菱形的上顶点）。 */
export function cornerX(cx: number, cy: number): number {
  return ((cx - cy) * TILE_W) / 2;
}
export function cornerY(cx: number, cy: number): number {
  return ((cx + cy) * TILE_H) / 2;
}

/** lepton 世界坐标 → 屏幕。 */
export function leptonToScreenX(x: number, y: number): number {
  return ((x - y) * (TILE_W / 2)) / 256;
}
export function leptonToScreenY(x: number, y: number): number {
  return ((x + y) * (TILE_H / 2)) / 256;
}

/** 屏幕（世界容器内坐标）→ lepton。 */
export function screenToLepton(wx: number, wy: number): { x: number; y: number } {
  const a = (wx * 256) / (TILE_W / 2);
  const b = (wy * 256) / (TILE_H / 2);
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}
