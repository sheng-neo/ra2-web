/**
 * 推荐出装的纯函数：「下一件该买什么」「实际要花多少」「现在买不买得了」「六张推荐卡」。
 *
 * Bot(ai/shop.ts)、模拟层的自动出装(hero.ts 的 autoBuyStep)、商店界面三处都从这里取数，
 * 对「下一件」的判断完全同源。只依赖契约类型与数据表，不碰模拟状态，界面层可以直接 import。
 *
 * 约定：
 * - 不记「买到第几件」这种状态，每次都从装备栏现状推算，手动乱序买了推荐装、卖了装备都不会错位；
 * - 鞋是一条线：基础鞋 → 该英雄的进阶鞋(原地替换，旧鞋按售价抵扣)。身上已有任意一双进阶鞋就视为鞋已完成；
 * - 同一件装备在出装表里出现多次时按件数核对。
 */
import { HEROES, HERO_IDS } from './data/heroes';
import { ITEMS, SELL_RATIO } from './data/items';
import type { HeroId, HeroUnit, ItemId } from './types';

/** 只读英雄的这两个字段，方便界面/测试传入简化对象 */
export type BuildOwner = Pick<HeroUnit, 'heroId' | 'items'>;

function ownedBoots(items: readonly (ItemId | null)[]): ItemId | null {
  let boots: ItemId | null = null;
  for (const it of items) if (it && ITEMS[it].category === 'boots') boots = it;
  return boots;
}

/**
 * 推荐出装里下一件该买的装备；全部买齐返回 null。
 * 格子已满时：轮到的那件买不进来，但进阶鞋是原地替换、不占格子——身上只有基础鞋、出装表后面还排着进阶鞋，
 * 就先返回进阶鞋(否则金币只能一直攒着)；除此之外返回 null(暂停，不代卖)。
 * 注意：返回值只表示「按顺序轮到它」，买不买得起看 buildCost，栏位够不够看 canAutoBuy。
 */
export function nextBuildItem(hero: BuildOwner): ItemId | null {
  const build = HEROES[hero.heroId].build;
  const owned = hero.items;
  const boots = ownedBoots(owned);
  const full = owned.indexOf(null) < 0;
  // 同一件装备在出装表里可能出现多次：按件数核对
  const used: boolean[] = owned.map(() => false);
  /** 前面已经有一件因为栏位满而买不进来 */
  let blocked = false;
  for (const id of build) {
    const def = ITEMS[id];
    if (def.category === 'boots') {
      // 已有进阶鞋：所有鞋都算买过；只有基础鞋：基础鞋算买过
      if (boots && (ITEMS[boots].tier === 2 || def.tier === 1)) continue;
      // 栏位满又一双鞋都没有：基础鞋同样要占一格，买不进来
      if (blocked && !boots) return null;
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
    if (!full) return id;
    blocked = true;
  }
  return null;
}

/** 买这件的实际花费（买鞋时会抵扣身上旧鞋的售价；与 buyItem 的扣款一致） */
export function buildCost(hero: BuildOwner, id: ItemId): number {
  const def = ITEMS[id];
  if (def.category === 'boots') {
    const boots = ownedBoots(hero.items);
    if (boots) return def.cost - Math.floor(ITEMS[boots].cost * SELL_RATIO);
  }
  return def.cost;
}

/**
 * 不看金币，只看栏位与鞋的规则：这件现在能不能买进来(与 buyItem 的校验一致)。
 * 换鞋是原地替换，不需要空格；其余装备需要一个空格。已有鞋时不能再买基础鞋或同一双鞋。
 */
export function canAutoBuy(hero: BuildOwner, id: ItemId): boolean {
  const def = ITEMS[id];
  if (def.category === 'boots') {
    const boots = ownedBoots(hero.items);
    if (boots) return def.tier !== 1 && boots !== id;
  }
  return hero.items.indexOf(null) >= 0;
}

/** 这件装备是否在该英雄的推荐出装里（卖出它会让本局自动出装关闭） */
export function isBuildItem(heroId: HeroId, id: ItemId): boolean {
  return HEROES[heroId].build.includes(id);
}

/** 商店「推荐」页的一张卡。六张卡 = 六个装备格：鞋一张(两个阶段)，其余五件成装各一张 */
export interface BuildCard {
  /** 这张卡最终是什么（鞋卡 = 该英雄的进阶鞋） */
  finalId: ItemId;
  /** 仅鞋卡：基础鞋；其余为 null */
  baseId: ItemId | null;
  /** todo = 还没买；base = 鞋卡专用，只有基础鞋；done = 已买(鞋卡：身上有任意一双进阶鞋) */
  stage: 'todo' | 'base' | 'done';
  /** 现在点这张卡会买什么（done 时为 null） */
  buyId: ItemId | null;
  /** buyId 的实际花费（换鞋已抵扣旧鞋售价）；done 时为 0 */
  cost: number;
  /** 是否「下一件」（同一时刻至多一张；栏位满或已买齐时没有） */
  next: boolean;
  /** 1..6：鞋固定第 1 张，其余按出装表里成装出现的先后 */
  order: number;
}

/** 给界面的推荐卡：顺序 = 鞋，然后按 build 里成装出现的先后 */
export function buildCards(hero: BuildOwner): BuildCard[] {
  const build = HEROES[hero.heroId].build;
  const owned = hero.items;
  const boots = ownedBoots(owned);
  const next = nextBuildItem(hero);
  const cards: BuildCard[] = [];
  let baseBoots: ItemId | null = null;
  let finalBoots: ItemId | null = null;
  for (const id of build) {
    const def = ITEMS[id];
    if (def.category !== 'boots') continue;
    if (def.tier === 1) baseBoots = baseBoots ?? id;
    else finalBoots = id;
  }
  if (baseBoots || finalBoots) {
    const finalId = (finalBoots ?? baseBoots) as ItemId;
    const hasUpgrade = finalBoots !== null;
    let stage: BuildCard['stage'];
    if (boots && (ITEMS[boots].tier === 2 || !hasUpgrade)) stage = 'done';
    else stage = boots ? 'base' : 'todo';
    const buyId = stage === 'done' ? null : stage === 'base' ? finalId : baseBoots ?? finalId;
    cards.push({
      finalId, baseId: hasUpgrade ? baseBoots : null, stage, buyId,
      cost: buyId ? buildCost(hero, buyId) : 0, next: false, order: 1,
    });
  }
  const used: boolean[] = owned.map(() => false);
  for (const id of build) {
    if (ITEMS[id].category === 'boots') continue;
    let found = false;
    for (let i = 0; i < owned.length; i++) {
      if (!used[i] && owned[i] === id) {
        used[i] = true;
        found = true;
        break;
      }
    }
    cards.push({
      finalId: id, baseId: null, stage: found ? 'done' : 'todo', buyId: found ? null : id,
      cost: found ? 0 : ITEMS[id].cost, next: false, order: cards.length + 1,
    });
  }
  if (next) {
    const card = cards.find((c) => c.buyId === next);
    if (card) card.next = true;
  }
  return cards;
}

/** 推荐出装是否已全部买齐（六张卡都是 done） */
export function buildComplete(hero: BuildOwner): boolean {
  return buildCards(hero).every((c) => c.stage === 'done');
}

/**
 * 自动出装此刻的状态(界面的开关小字、提示条、商店按钮进度环都可以直接用)：
 * done = 推荐出装已买齐；paused = 没买齐但栏位满了(自动出装不会代卖)；ready = 金币够下一件；saving = 还在攒钱。
 * 不看 hero.autoBuy 开关本身：关着的时候同样可以拿它判断「下一件买不买得起」。
 */
export function buildStatus(hero: BuildOwner & Pick<HeroUnit, 'gold'>): 'done' | 'paused' | 'ready' | 'saving' {
  const next = nextBuildItem(hero);
  if (!next || !canAutoBuy(hero, next)) return buildComplete(hero) ? 'done' : 'paused';
  return hero.gold >= buildCost(hero, next) ? 'ready' : 'saving';
}

/** 所有英雄的推荐出装里最便宜的一步(= 基础鞋的价格)：金币低于它时不用再算下一件 */
export const MIN_BUILD_COST: number = Math.min(...HERO_IDS.flatMap((id) => HEROES[id].build.map((it) => ITEMS[it].cost)));
