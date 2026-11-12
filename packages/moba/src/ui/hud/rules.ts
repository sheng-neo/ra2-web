/**
 * 商店规则的界面侧镜像（与 core/hero.ts 的 buyItem/sellItem 保持一致）：
 * 界面要在下单前就知道「买不买得起、会不会顶掉鞋、实际花多少」，才能把卡片状态画对。
 * 真正的裁决仍在模拟层——这里判错也只会多一条 reject 提示。
 */
import { HEROES } from '../../core/data/heroes';
import { ITEMS, SELL_RATIO } from '../../core/data/items';
import type { HeroUnit, ItemId } from '../../core/types';

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

export function checkBuy(hero: HeroUnit, itemId: ItemId): BuyCheck {
  const def = ITEMS[itemId];
  let cost = def.cost;
  let replaces: ItemId | null = null;
  let hasSlot = hero.items.indexOf(null) >= 0;
  if (def.category === 'boots') {
    const owned = hero.items.find((id) => id !== null && ITEMS[id].category === 'boots') ?? null;
    if (owned) {
      if (owned === itemId) return { ok: false, block: 'boots_same', cost, replaces: null };
      if (def.tier === 1) return { ok: false, block: 'boots_owned', cost, replaces: null };
      replaces = owned;
      cost -= sellValue(owned);
      hasSlot = true;
    }
  }
  if (!hasSlot) return { ok: false, block: 'full', cost, replaces };
  if (hero.gold < cost) return { ok: false, block: 'gold', cost, replaces };
  return { ok: true, block: 'ok', cost, replaces };
}

export const BLOCK_TEXT: Record<Exclude<BuyBlock, 'ok'>, string> = {
  gold: '金币不足',
  full: '装备栏已满',
  boots_owned: '已有鞋子',
  boots_same: '已拥有',
};

export interface BuildStep {
  itemId: ItemId;
  /** 已完成（已持有，或基础鞋已被进阶鞋取代） */
  done: boolean;
  /** 下一件该买的 */
  next: boolean;
}

/**
 * 推荐出装进度：按 build 顺序逐件核对装备栏（同名装备按件数消耗）。
 * 基础鞋在已有任意进阶鞋时视为完成——它本来就是要被换掉的。
 */
export function buildSteps(hero: HeroUnit): BuildStep[] {
  const have = new Map<ItemId, number>();
  let upgradedBoots = false;
  for (const id of hero.items) {
    if (!id) continue;
    have.set(id, (have.get(id) ?? 0) + 1);
    if (ITEMS[id].category === 'boots' && ITEMS[id].tier === 2) upgradedBoots = true;
  }
  const steps: BuildStep[] = [];
  let nextFound = false;
  for (const itemId of HEROES[hero.heroId].build) {
    const n = have.get(itemId) ?? 0;
    let done = false;
    if (n > 0) {
      have.set(itemId, n - 1);
      done = true;
    } else if (itemId === 'boots' && upgradedBoots) {
      done = true;
    }
    const next = !done && !nextFound;
    if (next) nextFound = true;
    steps.push({ itemId, done, next });
  }
  return steps;
}

/** 下一件推荐装备；全部出完返回 null */
export function nextRecommended(hero: HeroUnit): ItemId | null {
  for (const s of buildSteps(hero)) if (s.next) return s.itemId;
  return null;
}
