/**
 * Bot 工厂。world 为每个需要 AI 的英雄调用 createBot(view) 得到一个控制器。
 * 正式 Bot 完成后把 defaultFactory 换成它即可（或在测试里用 SimOptions.botFactory 临时指定）。
 */
import { FallbackBot } from './fallback';
import type { BotController, BotFactory, BotView } from './types';

export type { BotController, BotFactory, BotView, LastSeen, PublicState } from './types';
export { FallbackBot } from './fallback';

let defaultFactory: BotFactory = (view) => new FallbackBot(view);

/** 替换全局默认 Bot 工厂（传 null 恢复为兜底 AI） */
export function setDefaultBotFactory(factory: BotFactory | null): void {
  defaultFactory = factory ?? ((view) => new FallbackBot(view));
}

export function createBot(view: BotView): BotController {
  return defaultFactory(view);
}
