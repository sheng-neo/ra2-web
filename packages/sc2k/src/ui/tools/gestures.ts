// ===== ui/tools/gestures.ts =====（spec:ui-art §3.11 触控表；ARCHITECTURE §7.2 v1 手势子集）
// 纯几何 / 状态机：屏幕位移 → 世界地块位移、两指距离与质心、捏合累计比例的带滞回档位判定。无 DOM。
import type { ViewState } from '../../contracts/render';
import { ZOOM_TABLE } from '../../contracts/render';

/** 触控判定参数（spec:ui-art §3.11 [设计]）。 */
export const GESTURE = {
  tapMaxMs: 300, tapMaxPx: 8, longPressMs: 500, doubleTapMs: 300, doubleTapPx: 24,
  pinchIn: 1.5, pinchOut: 0.67, hysteresis: 0.1,
} as const;

/** 屏幕像素位移 → 世界地块位移（忽略海拔；旋转 r 次的逆变换：向量 (rx,ry) 每步 → (−ry, rx)）。 */
export function panDelta(view: Pick<ViewState, 'zoom' | 'rotation'>, dx: number, dy: number): [number, number] {
  const S = ZOOM_TABLE[view.zoom].tileW / 2;
  let vx = (dx / S + dy / (S / 2)) / 2;
  let vy = (dy / (S / 2) - dx / S) / 2;
  for (let k = 0; k < view.rotation; k++) { const t = vx; vx = -vy; vy = t; }
  return [vx, vy];
}
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);
export const mid = (ax: number, ay: number, bx: number, by: number): [number, number] => [(ax + bx) / 2, (ay + by) / 2];

export interface PinchTracker {
  /** 当前累计比例 k（相对于手势开始）。 */
  ratio(): number;
  /** 当前档位偏移（整数，相对手势开始的缩放档）。 */
  level(): number;
  /** 喂入新的两指距离；返回本次需要施加的档位增量（−1 / 0 / +1，极端情况下可能更多）。 */
  update(d: number): number;
}
/**
 * 捏合档位判定：k = d / d0 累计；进档阈值 1.5^(n+1)，退档阈值 0.67^(m+1)（m 为已退档数）；
 * 退回时需要反向越过 10% 滞回（例如进了一档后要回到 0 档需 k ≤ 1.5 × 0.9）。松手后 level() 即吸附的整数档偏移。
 */
export function createPinchTracker(d0: number): PinchTracker {
  const base = Math.max(1e-6, d0);
  let k = 1, n = 0;
  const upAt = (lvl: number): number => Math.pow(GESTURE.pinchIn, lvl);          // 到达 lvl（>0）所需 k
  const downAt = (lvl: number): number => Math.pow(GESTURE.pinchOut, -lvl);      // 到达 lvl（<0）所需 k
  return {
    ratio: () => k,
    level: () => n,
    update(d: number): number {
      k = Math.max(1e-6, d) / base;
      let delta = 0;
      // 进档
      while (k >= upAt(n + 1)) { n++; delta++; }
      // 退档
      while (k <= downAt(n - 1)) { n--; delta--; }
      // 反向回退（滞回 10%）：从正档回落 / 从负档回升
      while (n > 0 && k <= upAt(n) * (1 - GESTURE.hysteresis)) { n--; delta--; }
      while (n < 0 && k >= downAt(n) * (1 + GESTURE.hysteresis)) { n++; delta++; }
      return delta;
    },
  };
}
