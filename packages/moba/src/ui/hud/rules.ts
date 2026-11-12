/**
 * 商店规则的界面侧镜像（与 core/hero.ts 的 buyItem/sellItem 保持一致）：
 * 界面要在下单前就知道「买不买得起、会不会顶掉鞋、实际花多少」，才能把卡片状态画对。
 * 真正的裁决仍在模拟层——这里判错也只会多一条 reject 提示。
 *
 * 「下一件该买什么 / 实际花费 / 栏位够不够 / 六张推荐卡」不在这里另算一遍，全部取自 core/build.ts：
 * Bot、模拟层的自动出装、商店界面三处对「下一件」的判断同源。这里只补界面要的「为什么买不了」。
 */
import { buildCards, buildCost, buildStatus, canAutoBuy, isBuildItem, nextBuildItem } from '../../core/build';
import type { BuildCard, BuildOwner } from '../../core/build';
import { ITEMS, SELL_RATIO } from '../../core/data/items';
import type { HeroUnit, ItemId } from '../../core/types';

export { buildCards, buildCost, buildStatus, isBuildItem };
export type { BuildCard };

export type BuyBlock = 'ok' | 'gold' | 'full' | 'boots_owned' | 'boots_same';

export interface BuyCheck {
  ok: boolean;
  block: BuyBlock;
  /** 实际花费（升级鞋已抵扣旧鞋售价） */
  cost: number;
  /** 会被替换掉的旧鞋 */
  replaces: ItemId | null;
}

export const sellValue = (id: ItemId): number => Math.floor(ITEMS[id].cost * SELL_RATIO);

/** 身上的鞋(同时只会有一双) */
export function ownedBoots(hero: BuildOwner): ItemId | null {
  for (const id of hero.items) if (id && ITEMS[id].category === 'boots') return id;
  return null;
}

/** 这件现在买不买得了；买不了时 block 说明原因(鞋的规则 → 栏位 → 金币，与 buyItem 的判定顺序一致) */
export function checkBuy(hero: BuildOwner & Pick<HeroUnit, 'gold'>, itemId: ItemId): BuyCheck {
  const def = ITEMS[itemId];
  let replaces: ItemId | null = null;
  if (def.category === 'boots') {
    const owned = ownedBoots(hero);
    if (owned) {
      // 已有鞋时：不能重复买同一双，也不能再买基础鞋(这两种情况不涉及抵扣，报原价)
      if (owned === itemId) return { ok: false, block: 'boots_same', cost: def.cost, replaces: null };
      if (def.tier === 1) return { ok: false, block: 'boots_owned', cost: def.cost, replaces: null };
      replaces = owned;
    }
  }
  const cost = buildCost(hero, itemId);
  if (!canAutoBuy(hero, itemId)) return { ok: false, block: 'full', cost, replaces };
  if (hero.gold < cost) return { ok: false, block: 'gold', cost, replaces };
  return { ok: true, block: 'ok', cost, replaces };
}

export const BLOCK_TEXT: Record<Exclude<BuyBlock, 'ok'>, string> = {
  gold: '金币不足',
  full: '装备栏已满',
  boots_owned: '已有鞋子',
  boots_same: '已拥有',
};

/** 下一件推荐装备；全部出完、或栏位已满(且轮到的不是换鞋)返回 null */
export function nextRecommended(hero: BuildOwner): ItemId | null {
  return nextBuildItem(hero);
}

/**
 * 攒钱进度：当前金币 / 下一件推荐装的实际花费，0..1。
 * 没有下一件(已买齐)或栏位满(买不进来)时返回 -1——此时没有「在攒的东西」，不该画进度。
 */
export function savingProgress(hero: BuildOwner & Pick<HeroUnit, 'gold'>): number {
  const next = nextBuildItem(hero);
  if (!next || !canAutoBuy(hero, next)) return -1;
  const cost = buildCost(hero, next);
  return cost <= 0 ? 1 : Math.max(0, Math.min(1, hero.gold / cost));
}
