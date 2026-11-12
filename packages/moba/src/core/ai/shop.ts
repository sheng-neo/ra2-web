/**
 * 购买：按 HeroDef.build 的顺序，金币够下一件就买(随时随地可买，阵亡时也可以)。
 * 「下一件是什么 / 要花多少」的推算在 core/build.ts(与自动出装、商店界面同源)：不记「买到第几件」这种状态，
 * 每次都从装备栏推算，托管切换/卖装备后也不会错位。
 */
import { buildCost, MIN_BUILD_COST, nextBuildItem } from '../build';
import type { BotView } from './types';

export { buildCost, nextBuildItem } from '../build';

/** 每次思考调用；钱够就买。返回是否买了东西 */
export function shop(v: BotView): boolean {
  const me = v.hero;
  // 连最便宜的一步都买不起就不用算了
  if (me.gold < MIN_BUILD_COST) return false;
  const id = nextBuildItem(me);
  if (!id || me.gold < buildCost(me, id)) return false;
  v.command({ type: 'buy', itemId: id });
  return true;
}
