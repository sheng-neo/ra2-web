/**
 * 商店规则的界面侧镜像(checkBuy / savingProgress)必须与模拟层的 buyItem 一致：
 * 逐个英雄、逐件装备，在同一个世界里先问界面「买不买得了、花多少」，再真的下购买命令核对结果。
 */
import { describe, expect, it } from 'vitest';
import { HEROES, HERO_IDS } from '../../core/data/heroes';
import { ITEM_LIST, ITEMS } from '../../core/data/items';
import type { GameEvent, HeroId, HeroUnit, ItemId } from '../../core/types';
import { createWorld } from '../../core/world';
import { buildCards, checkBuy, nextRecommended, ownedBoots, savingProgress, sellValue } from './rules';

function setup(heroId: HeroId): { me: HeroUnit; buy(id: ItemId): GameEvent[]; sell(index: number): void } {
  const world = createWorld({ seed: 7, playerHero: heroId, difficulty: 'normal' }, { noBots: true });
  const pid = world.state.playerId;
  const me = world.state.heroes.find((h) => h.id === pid) as HeroUnit;
  world.drainEvents();
  return {
    me,
    buy(id) {
      world.command(pid, { type: 'buy', itemId: id });
      return world.drainEvents().filter((e) => (e.type === 'itemBought' || e.type === 'reject') && e.unitId === pid);
    },
    sell: (index) => world.command(pid, { type: 'sell', index }),
  };
}

describe('ui/hud/rules：checkBuy 与模拟层的购买裁决一致', () => {
  it('五位英雄 × 17 件装备 × 四种装备栏状态：能不能买、实际扣多少钱都对得上', () => {
    let cases = 0;
    for (const heroId of HERO_IDS) {
      // 每位英雄只建一个世界，每个用例开头把装备栏卖空重摆(建世界比买卖贵得多)
      const { me, buy, sell } = setup(heroId);
      const states: ItemId[][] = [[], ['boots'], ['boots_fury', 'thorn_mail'], ['boots', 'thorn_mail', 'thorn_mail', 'thorn_mail', 'thorn_mail', 'thorn_mail']];
      for (const preset of states) {
        for (const it of ITEM_LIST) {
          for (const gold of [0, it.cost - 151, it.cost - 1, it.cost, 99999]) {
            for (let i = 0; i < me.items.length; i++) sell(i);
            me.gold = 99999;
            for (const id of preset) buy(id);
            expect(me.items.filter(Boolean)).toHaveLength(preset.length);
            me.gold = Math.max(0, gold);
            const before = me.gold;
            const chk = checkBuy(me, it.id);
            const ev = buy(it.id);
            const bought = ev.some((e) => e.type === 'itemBought');
            expect(bought, `${heroId} ${preset.join('+')} 买 ${it.id} 金币 ${before}`).toBe(chk.ok);
            if (bought) expect(before - me.gold).toBe(chk.cost);
            else {
              expect(me.gold).toBe(before);
              const reason = (ev.find((e) => e.type === 'reject') as Extract<GameEvent, { type: 'reject' }> | undefined)?.reason;
              // 模拟层只有两种拒绝理由：金币不足 / 栏位(含鞋的规则)
              expect(reason).toBe(chk.block === 'gold' ? 'gold' : 'full');
            }
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(5 * 4 * 17 * 5);
  });

  it('换鞋：报的是抵扣后的价格，并指出被替换的旧鞋；同一双 / 基础鞋买不了', () => {
    const { me, buy } = setup('panyue');
    me.gold = 250;
    buy('boots');
    expect(ownedBoots(me)).toBe('boots');
    me.gold = 559;
    expect(checkBuy(me, 'boots_guard')).toEqual({ ok: false, block: 'gold', cost: 560, replaces: 'boots' });
    me.gold = 560;
    expect(checkBuy(me, 'boots_guard')).toEqual({ ok: true, block: 'ok', cost: 560, replaces: 'boots' });
    expect(checkBuy(me, 'boots')).toMatchObject({ ok: false, block: 'boots_same', cost: ITEMS.boots.cost });
    buy('boots_guard');
    expect(checkBuy(me, 'boots')).toMatchObject({ ok: false, block: 'boots_owned' });
    expect(sellValue('boots_guard')).toBe(426);
  });

  it('savingProgress：金币 / 下一件的实际花费；买齐或栏位满时为 -1', () => {
    const { me, buy, sell } = setup('fengling');
    me.gold = 0;
    expect(nextRecommended(me)).toBe('boots');
    expect(savingProgress(me)).toBe(0);
    me.gold = 125;
    expect(savingProgress(me)).toBeCloseTo(0.5);
    me.gold = 99999;
    expect(savingProgress(me)).toBe(1);
    // 按推荐顺序买齐
    for (let i = 0; i < 10; i++) {
      const next = nextRecommended(me);
      if (!next) break;
      buy(next);
    }
    expect(buildCards(me).every((c) => c.stage === 'done')).toBe(true);
    expect(savingProgress(me)).toBe(-1);
    // 卖掉一件推荐装、换成非推荐装占住格子：栏位满，没有「在攒的东西」
    const idx = me.items.indexOf(HEROES.fengling.build[HEROES.fengling.build.length - 1]);
    sell(idx);
    expect(savingProgress(me)).toBe(1);
    buy('thorn_mail');
    expect(nextRecommended(me)).toBeNull();
    expect(savingProgress(me)).toBe(-1);
  });
});
