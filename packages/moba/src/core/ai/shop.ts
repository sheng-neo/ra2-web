/**
 * 购买：按 HeroDef.build 的顺序，金币够下一件就买(随时随地可买，阵亡时也可以)。
 * 不记「买到第几件」这种状态，每次都从装备栏推算，托管切换/卖装备后也不会错位。
 */
import { HEROES } from '../data/heroes';
import { ITEMS, SELL_RATIO } from '../data/items';
import type { HeroUnit, ItemId } from '../types';
import type { BotView } from './types';

/** 推荐出装里下一件该买的装备；全部买齐或格子已满返回 null */
export function nextBuildItem(hero: HeroUnit): ItemId | null {
  const build = HEROES[hero.heroId].build;
  const owned = hero.items;
  let boots: ItemId | null = null;
  for (const it of owned) if (it && ITEMS[it].category === 'boots') boots = it;
  const full = owned.indexOf(null) < 0;
  // 同一件装备在出装表里可能出现多次：按件数核对
  const used: boolean[] = owned.map(() => false);
  for (const id of build) {
    const def = ITEMS[id];
    if (def.category === 'boots') {
      // 已有升级鞋：所有鞋都算买过；只有基础鞋：基础鞋算买过
      if (boots && (ITEMS[boots].tier === 2 || def.tier === 1)) continue;
      return id;
    }
    let found = false;
    for (let i = 0; i < owned.length; i++) {
      if (!used[i] && owned[i] === id) {
        used[i] = true;
        found = true;
        break;
      }
    }
    if (found) continue;
    return full ? null : id;
  }
  return null;
}

/** 买下一件的实际花费（升级鞋会抵扣旧鞋的售价） */
export function buildCost(hero: HeroUnit, id: ItemId): number {
  const def = ITEMS[id];
  if (def.category === 'boots') {
    for (const it of hero.items) if (it && ITEMS[it].category === 'boots') return def.cost - Math.floor(ITEMS[it].cost * SELL_RATIO);
  }
  return def.cost;
}

/** 每次思考调用；钱够就买。返回是否买了东西 */
export function shop(v: BotView): boolean {
  const me = v.hero;
  // 最便宜的一步也要 250，没钱就不用算了
  if (me.gold < 250) return false;
  const id = nextBuildItem(me);
  if (!id || me.gold < buildCost(me, id)) return false;
  v.command({ type: 'buy', itemId: id });
  return true;
}
