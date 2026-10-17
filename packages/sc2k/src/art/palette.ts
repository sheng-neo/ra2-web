// ===== art/palette.ts =====（spec:ui-art §3.5 原创调色板；WP9）
// 256 项 = 保留区 0..15 + 16 个色带 × 8 阶（16..143）+ 火/烟（144..159）+ 三个循环组（160..191）+ 杂色立方（192..255）。
// 纯算术 HSL→RGB（无超越函数），同输入同输出；DAT 导入路径不用本表。
import type { Palette } from '../contracts/render';

/** 16 个色带（ramp）的编号；索引 = RAMP_BASE + ramp*8 + i（i 0 最暗 … 7 最亮）。 */
export const enum Ramp { Neutral = 0, WarmGray, Asphalt, Earth, Sand, Grass, Forest, Water, Glass, Brick, Rust, Amber, Signal, Teal, Violet, Olive }
export const RAMP_COUNT = 16;
export const RAMP_STEPS = 8;
export const RAMP_BASE = 16;
/** 每个色带的 (色相°, 饱和度)（spec:ui-art §3.5 表）。 */
export const RAMP_HS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.0], [30, 0.06], [210, 0.04], [28, 0.45], [42, 0.40], [95, 0.38], [130, 0.42], [205, 0.55],
  [195, 0.30], [12, 0.50], [22, 0.62], [45, 0.85], [2, 0.80], [170, 0.45], [275, 0.40], [70, 0.35]];
/** 8 阶明度。 */
export const RAMP_L: readonly number[] = [0.12, 0.22, 0.32, 0.42, 0.52, 0.63, 0.75, 0.88];

/** 保留索引。 */
export const IDX = {
  Transparent: 0, Black: 1, White: 2, UiHighlight: 3, UiShadow: 4, ZoneR: 5, ZoneC: 6, ZoneI: 7,
  HeatBase: 8,            // 8..15 热力 8 阶（冷→热）
  FireBase: 144,          // 144..151 火焰 / 爆炸 8 阶橙红（暗→亮）
  SmokeBase: 152,         // 152..159 烟 8 阶灰（暗→亮）
  CycleA: 160, CycleALen: 16,   // 水面高光（Water i=4..7 交错），1200 ms 环移
  CycleB: 176, CycleBLen: 8,    // 夜景 / 信号灯（Amber ↔ Signal），800 ms
  CycleC: 184, CycleCLen: 8,    // 瀑布 / 溪流，600 ms
  MiscBase: 192,          // 192..255 杂色 4×4×4 立方（车辆 / 集装箱 / 旗帜等"杂色"用）
} as const;

/** 色带索引：ci(Ramp.Grass, 5)；i 自动夹到 0..7。 */
export const ci = (ramp: Ramp, i: number): number => RAMP_BASE + ramp * RAMP_STEPS + (i < 0 ? 0 : i > 7 ? 7 : i | 0);
/** 杂色立方索引（r,g,b ∈ 0..3）。 */
export const misc = (r: number, g: number, b: number): number => IDX.MiscBase + (r & 3) * 16 + (g & 3) * 4 + (b & 3);

/** HSL → RGB（h 度，s/l 0..1），纯算术。 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1) { r = c; g = x; } else if (hh < 2) { r = x; g = c; } else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; } else if (hh < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** 色带某阶的 RGB（与 buildPalette 一致）。 */
export const rampRgb = (ramp: Ramp, i: number): [number, number, number] => {
  const [h, s] = RAMP_HS[ramp]!;
  return hslToRgb(h, s, RAMP_L[i < 0 ? 0 : i > 7 ? 7 : i | 0]!);
};

/** 原创 256 色调色板（spec:ui-art §3.5）。 */
export function buildPalette(): Palette {
  const rgba = new Uint8ClampedArray(256 * 4);
  const set = (k: number, r: number, g: number, b: number, a = 255): void => { rgba[k * 4] = r; rgba[k * 4 + 1] = g; rgba[k * 4 + 2] = b; rgba[k * 4 + 3] = a; };
  // 0..7 透明 / 纯色
  set(0, 0, 0, 0, 0);
  set(IDX.Black, 10, 8, 12); set(IDX.White, 250, 248, 240); set(IDX.UiHighlight, 230, 228, 220); set(IDX.UiShadow, 96, 92, 100);
  set(IDX.ZoneR, 60, 170, 70); set(IDX.ZoneC, 70, 110, 210); set(IDX.ZoneI, 210, 180, 60);
  // 8..15 热力 8 阶：冷蓝 → 绿 → 黄 → 红
  for (let k = 0; k < 8; k++) { const [r, g, b] = hslToRgb(220 - k * 31, 0.75, 0.35 + k * 0.03); set(IDX.HeatBase + k, r, g, b); }
  // 16..143 色带
  for (let ramp = 0; ramp < RAMP_COUNT; ramp++) for (let i = 0; i < RAMP_STEPS; i++) { const [r, g, b] = rampRgb(ramp as Ramp, i); set(ci(ramp as Ramp, i), r, g, b); }
  // 144..151 火焰（暗红 → 橙 → 黄白）；152..159 烟（深灰 → 浅灰）
  for (let k = 0; k < 8; k++) { const [r, g, b] = hslToRgb(4 + k * 7, 0.92, 0.28 + k * 0.085); set(IDX.FireBase + k, r, g, b); }
  for (let k = 0; k < 8; k++) { const v = 52 + k * 24; set(IDX.SmokeBase + k, v, v, v + 4); }
  // 160..175 循环组 A：水面高光，Water i=4..7 交错
  const waveSteps = [4, 5, 6, 7, 6, 5, 4, 5, 6, 7, 6, 5, 4, 5, 6, 5];
  for (let k = 0; k < 16; k++) { const [r, g, b] = rampRgb(Ramp.Water, waveSteps[k]!); set(IDX.CycleA + k, r, g, b); }
  // 176..183 循环组 B：Amber ↔ Signal 往返
  const bSteps: ReadonlyArray<readonly [Ramp, number]> = [[Ramp.Amber, 6], [Ramp.Amber, 7], [Ramp.Amber, 6], [Ramp.Amber, 5], [Ramp.Signal, 5], [Ramp.Signal, 6], [Ramp.Signal, 5], [Ramp.Amber, 5]];
  for (let k = 0; k < 8; k++) { const [rp, i] = bSteps[k]!; const [r, g, b] = rampRgb(rp, i); set(IDX.CycleB + k, r, g, b); }
  // 184..191 循环组 C：瀑布 / 溪流（Water 5..7 与 Glass 6 交错）
  const cSteps: ReadonlyArray<readonly [Ramp, number]> = [[Ramp.Water, 5], [Ramp.Water, 6], [Ramp.Glass, 6], [Ramp.Water, 7], [Ramp.Glass, 7], [Ramp.Water, 7], [Ramp.Glass, 6], [Ramp.Water, 6]];
  for (let k = 0; k < 8; k++) { const [rp, i] = cSteps[k]!; const [r, g, b] = rampRgb(rp, i); set(IDX.CycleC + k, r, g, b); }
  // 192..255 杂色立方 4×4×4（略压饱和，避免刺眼）
  for (let r = 0; r < 4; r++) for (let g = 0; g < 4; g++) for (let b = 0; b < 4; b++) set(misc(r, g, b), 30 + r * 68, 30 + g * 68, 30 + b * 68);
  return {
    rgba,
    cycles: [
      { start: IDX.CycleA, length: IDX.CycleALen, periodMs: 1200, dir: 1 },
      { start: IDX.CycleB, length: IDX.CycleBLen, periodMs: 800, dir: 1 },
      { start: IDX.CycleC, length: IDX.CycleCLen, periodMs: 600, dir: -1 },
    ],
  };
}

/** 相对亮度（0..1，Rec.601 权重），测试与 Map 图层共用。 */
export const luma = (r: number, g: number, b: number): number => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
