/**
 * 港铁中环站出口（R3 STATIONS）。由 SCR 里的生成脚本 gen-mtr-exits.mjs 从 central/client/public/city/central.json
 * （地政总署楼宇轮廓，整数分米 → 米）生成，勿手改；改动请改脚本重新生成。
 * - id：地政总署出口结构（楼宇）的 ID；STATIONS 只在它外面包一层港铁出口的外观（招牌带、不锈钢洞口、梯井），不改楼宇本身。
 * - left / right：洞口所在边的两端（模拟坐标米，从外面看左 → 右）；normal：洞口朝外的法线；width：边长；depth：结构沿法线的进深。
 * - verified：true = 有照片佐证（J3：照片 16）；false = 规格候选，出口字母按常识，整合时对照地政总署照片纹理确认，不对就删。
 * 出口字母只取中环站正式出口表（A、B、C、D1、D2、E、F、G、H、J1、J2、J3、K、L），不重复。
 */

export interface MtrExit {
  id: string;
  code: string;
  verified: boolean;
  note: string;
  left: readonly [number, number];
  right: readonly [number, number];
  normal: readonly [number, number];
  width: number;
  depth: number;
  base: number;
  height: number;
}

/** 中环站正式出口表（Commons 分类 + 港铁站内图，surfaces-facts §8.4）。 */
export const CENTRAL_EXIT_CODES: readonly string[] = ['A', 'B', 'C', 'D1', 'D2', 'E', 'F', 'G', 'H', 'J1', 'J2', 'J3', 'K', 'L'];

export const MTR_EXITS: readonly MtrExit[] = [
  { id: '8f1d3baf7b', code: 'J3', verified: true, note: '照片 16（2024-01-28 22:01，GPS 约 (638, −167)，图注 Chater Road J exits）', left: [625.3, -180.8], right: [626.2, -177.6], normal: [0.963, -0.271], width: 3.3, depth: 12.6, base: 4.6, height: 3.6 },
  { id: '21cd3a0b04', code: 'J2', verified: false, note: '规格候选（遮打道，J3 以南 25 m）', left: [627.6, -207.2], right: [628.4, -204.6], normal: [0.956, -0.294], width: 2.7, depth: 10.8, base: 6.2, height: 4.4 },
  { id: 'c1b1ec2232', code: 'F', verified: false, note: '规格候选（遮打道西段）', left: [345.5, -104], right: [346.8, -99.5], normal: [0.961, -0.278], width: 4.7, depth: 13.7, base: 3.7, height: 3.5 },
  { id: 'e520be241f', code: 'G', verified: false, note: '规格候选（遮打道西段）', left: [390.1, -116.4], right: [391.3, -112], normal: [0.965, -0.263], width: 4.6, depth: 12.9, base: 3.7, height: 4.2 },
];
