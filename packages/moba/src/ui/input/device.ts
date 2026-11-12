/**
 * 输入设备识别：有触摸屏且主指针是粗指针(手指) → 触控布局；否则键鼠布局。
 * 混合设备(带触摸屏的笔记本、接了键鼠的平板)开局先按这里的结果，之后在手指按下 / 鼠标键按下 / 按游戏键时切换（见 input/index.ts）。
 */
import type { InputMode } from '../hud/common';

export function detectInputMode(): InputMode {
  if (typeof window === 'undefined') return 'kbm';
  const hasTouch = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  let coarse = false;
  try {
    coarse = window.matchMedia('(pointer: coarse)').matches;
  } catch {
    coarse = false;
  }
  return hasTouch && coarse ? 'touch' : 'kbm';
}
