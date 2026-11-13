/**
 * Bot 工厂。world 为每个需要 AI 的英雄调用 createBot(view) 得到一个控制器。
 *
 * 正式 Bot = HeroBot(战术层，bot.ts) + TeamBrain(战略层，team.ts)；FallbackBot 是引擎早期用的兜底 AI，
 * 只保留作对照/调试(测试里可用 SimOptions.botFactory 或 setDefaultBotFactory 指定)。
 */
import { HeroBot } from './bot';
import { FallbackBot } from './fallback';
import type { BotController, BotFactory, BotView } from './types';

export type { BotController, BotFactory, BotView, LastSeen, PublicState } from './types';
export { HeroBot } from './bot';
export { FallbackBot } from './fallback';
export { botTierFor, PROFILES, STYLES, TUNE } from './params';
export type { BotTier } from './params';
export { teamBrain, TeamBrain } from './team';

const heroBot: BotFactory = (view) => new HeroBot(view);
/** 兜底 AI 的工厂（对照实验用） */
export const fallbackBotFactory: BotFactory = (view) => new FallbackBot(view);

let defaultFactory: BotFactory = heroBot;

/** 替换全局默认 Bot 工厂（传 null 恢复为正式 Bot） */
export function setDefaultBotFactory(factory: BotFactory | null): void {
  defaultFactory = factory ?? heroBot;
}

export function createBot(view: BotView): BotController {
  return defaultFactory(view);
}
