/**
 * 预设机位（模拟坐标，米；原点 = HK1980 E834000 N816000）。
 * 参考点由 proj4 按 schema 的投影换算：皇后像廣場一带约 (498, −252)，海旁约 y = +500…+650。
 */
import { viewFromEye, type View } from './rig';

export interface Preset {
  id: string;
  label: string;
  eye: [number, number, number];
  target: [number, number, number];
}

export const PRESETS: readonly Preset[] = [
  // 从维港海面向南望中环天际线（默认）
  { id: 'harbour', label: '維港天際線', eye: [380, 940, 45], target: [430, -60, 165] },
  // 皇后像廣場北端，低机位向南望（正前方钢架大楼，左后方三稜塔）
  { id: 'statue', label: '皇后像廣場', eye: [512, -168, 9], target: [510, -320, 50] },
  // 高空俯瞰，北在上
  { id: 'aerial', label: '鳥瞰', eye: [330, -780, 1250], target: [330, 10, 0] },
  // 德輔道中西行電車站（W1，介乎租庇利街與畢打街）：站在站岛西北端的候车位，沿两条电车轨向东南望——
  // 右边是遮篷与广告板，左边是轨道板、对面东行站岛，头顶是架空线；开场约 10 s 有一辆西行车进站、停站、打铃开走
  { id: 'tram', label: '電車', eye: [231.6, -8.6, 6.0], target: [314, -85, 10] },
];

export function presetView(p: Preset): View {
  return viewFromEye(p.eye, p.target);
}
