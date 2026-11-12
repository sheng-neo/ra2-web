/**
 * 技能键「原地按压」的手势判定(纯函数，便于单测)。
 *
 * 轻点 = 智能施法，原地长按 = 看技能详情。两者只按「按下」与「松手」两个事件自带的时间戳之差来分——
 * 事件时间戳记的是手指真正落下 / 抬起的时刻；而长按定时器是在主线程上排队的，主线程一卡(开局、团战、
 * 低端机)，定时器可能在一次很短的轻点松手之后才被执行，单看「定时器触发过没有」会把轻点误判成长按、把施法吞掉。
 */

/** 原地按住超过这么久才算长按(毫秒)。真人轻点一般在 50~250ms，留足余量 */
export const LONG_PRESS_MS = 400;

/**
 * 松手时判定这次原地按压是不是轻点。
 * 时间戳缺失或不合理(合成事件给 0 / NaN、时钟回拨)时当作轻点：宁可施放，不吞操作。
 */
export function isTapPress(downStamp: number, upStamp: number, longPressMs = LONG_PRESS_MS): boolean {
  const held = upStamp - downStamp;
  if (!Number.isFinite(held) || held < 0) return true;
  return held <= longPressMs;
}
