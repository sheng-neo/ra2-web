/**
 * 推荐出装纯函数(core/build.ts)与第二阶段数据表的约束：
 * 下一件的推算、鞋的升级与抵扣、栏位满/买齐的状态、六张推荐卡；装备 17 件、简介与标签的长度和词表。
 */
import { describe, expect, it } from 'vitest';
import { buildCards, buildComplete, buildCost, buildStatus, canAutoBuy, isBuildItem, MIN_BUILD_COST, nextBuildItem, type BuildOwner } from './build';
import { HEROES, HERO_IDS, heroFullName, SKILL_TAG_NAME, SUMMONER } from './data/heroes';
import { ITEM_LIST, ITEMS, SELL_RATIO } from './data/items';
import { MINIONS, MONSTER_RULES, MONSTERS, monsterFullName } from './data/units';
import type { HeroId, ItemId, MonsterType } from './types';

const owner = (heroId: HeroId, ...items: ItemId[]): BuildOwner & { gold: number } => ({
  heroId, gold: 0, items: [...items, ...new Array<null>(6).fill(null)].slice(0, 6),
});
/** 模拟一次购买对装备栏的影响(与 buyItem 的规则一致：换鞋原地替换) */
function put(o: BuildOwner, id: ItemId): void {
  const boots = o.items.findIndex((it) => it !== null && ITEMS[it].category === 'boots');
  if (ITEMS[id].category === 'boots' && boots >= 0) o.items[boots] = id;
  else o.items[o.items.indexOf(null)] = id;
}
const UPGRADE = ITEMS.boots_guard.cost - Math.floor(ITEMS.boots.cost * SELL_RATIO);
const len = (s: string): number => [...s].length;

describe('推荐出装：下一件', () => {
  it('五位英雄：从空栏位一路买下去，顺序 = 出装表；鞋升级的花费 = 710 − 150；买齐后为 null', () => {
    expect(UPGRADE).toBe(560);
    for (const id of HERO_IDS) {
      const o = owner(id);
      const bought: ItemId[] = [];
      let spent = 0;
      for (let i = 0; i < 10; i++) {
        const next = nextBuildItem(o);
        if (!next) break;
        expect(canAutoBuy(o, next)).toBe(true);
        const cost = buildCost(o, next);
        expect(cost).toBe(ITEMS[next].category === 'boots' && ITEMS[next].tier === 2 ? UPGRADE : ITEMS[next].cost);
        spent += cost;
        put(o, next);
        bought.push(next);
      }
      expect(bought).toEqual(HEROES[id].build);
      expect(o.items.every((it) => it !== null)).toBe(true);
      expect(buildComplete(o)).toBe(true);
      expect(buildStatus(o)).toBe('done');
      // 七步出装的实际总花费在 1.03 万 ~ 1.11 万之间(五套各不相同)
      expect(spent).toBeGreaterThan(10300 - 1);
      expect(spent).toBeLessThan(11100);
    }
  });

  it('手动乱序买了推荐装：那一步算完成，其余照旧', () => {
    const o = owner('chijin', 'starfall_blade');
    expect(nextBuildItem(o)).toBe('boots');
    put(o, 'boots');
    expect(nextBuildItem(o)).toBe('blood_scythe');
    put(o, 'blood_scythe');
    expect(nextBuildItem(o)).toBe('boots_guard');
    put(o, 'boots_guard');
    // 第四步的斩马剑已经有了，直接轮到第五步
    expect(nextBuildItem(o)).toBe('guardian_plate');
  });

  it('自己买了别的进阶鞋：鞋视为已完成，不会再换', () => {
    const o = owner('chijin', 'boots_fury');
    expect(nextBuildItem(o)).toBe('blood_scythe');
    put(o, 'blood_scythe');
    expect(nextBuildItem(o)).toBe('starfall_blade');
    const boots = buildCards(o)[0];
    expect(boots).toMatchObject({ finalId: 'boots_guard', stage: 'done', buyId: null, cost: 0, next: false });
  });

  it('栏位满：没买齐也返回 null(暂停)；正好轮到换鞋时仍然可以(原地替换)', () => {
    // 基础鞋 + 第一件大件 + 4 件推荐之外的装备
    const o = owner('chijin', 'boots', 'blood_scythe', 'sage_codex', 'void_crown', 'thorn_mail', 'undying_heart');
    expect(nextBuildItem(o)).toBe('boots_guard');
    expect(canAutoBuy(o, 'boots_guard')).toBe(true);
    expect(buildCost(o, 'boots_guard')).toBe(UPGRADE);
    o.gold = UPGRADE;
    expect(buildStatus(o)).toBe('ready');
    put(o, 'boots_guard');
    expect(nextBuildItem(o)).toBeNull();
    expect(buildComplete(o)).toBe(false);
    expect(buildStatus(o)).toBe('paused');
    expect(canAutoBuy(o, 'starfall_blade')).toBe(false);
    expect(buildCards(o).some((c) => c.next)).toBe(false);
    // 腾出一格就继续
    o.items[2] = null;
    expect(nextBuildItem(o)).toBe('starfall_blade');
    expect(buildStatus(o)).toBe('saving');
    o.gold = ITEMS.starfall_blade.cost;
    expect(buildStatus(o)).toBe('ready');
  });

  it('栏位满、身上只有基础鞋：前面缺着的大件买不进来，先原地换进阶鞋，换完才暂停', () => {
    // 基础鞋 + 5 件推荐之外的装备：轮到的吸血环首刀要占一格买不了，但进阶鞋是原地替换
    const stuck = owner('chijin', 'boots', 'sage_codex', 'sage_codex', 'void_crown', 'thorn_mail', 'undying_heart');
    expect(nextBuildItem(stuck)).toBe('boots_guard');
    expect(canAutoBuy(stuck, 'boots_guard')).toBe(true);
    stuck.gold = UPGRADE - 1;
    expect(buildStatus(stuck)).toBe('saving');
    stuck.gold = UPGRADE;
    expect(buildStatus(stuck)).toBe('ready');
    // 推荐页上「下一件」落在鞋卡
    expect(buildCards(stuck).filter((c) => c.next).map((c) => c.buyId)).toEqual(['boots_guard']);
    put(stuck, 'boots_guard');
    expect(nextBuildItem(stuck)).toBeNull();
    expect(buildStatus(stuck)).toBe('paused');
    // 腾出一格：回到出装表里最靠前的缺件
    stuck.items[1] = null;
    expect(nextBuildItem(stuck)).toBe('blood_scythe');
  });

  it('栏位满、鞋是别的进阶鞋或没有鞋：没有可原地换的，暂停', () => {
    const other = owner('chijin', 'boots_fury', 'sage_codex', 'sage_codex', 'void_crown', 'thorn_mail', 'undying_heart');
    expect(nextBuildItem(other)).toBeNull();
    expect(buildStatus(other)).toBe('paused');
    // 樊哙的出装表里基础鞋排第一：一双鞋都没有时仍然是「轮到基础鞋但买不进来」
    const none = owner('panyue', 'sage_codex', 'sage_codex', 'void_crown', 'thorn_mail', 'undying_heart', 'astral_staff');
    expect(nextBuildItem(none)).toBe('boots');
    expect(canAutoBuy(none, 'boots')).toBe(false);
    expect(buildStatus(none)).toBe('paused');
  });

  it('栏位满且一双鞋都没有：轮到的是基础鞋，但买不进来 → 暂停', () => {
    const o = owner('xingli', 'sage_codex', 'sage_codex', 'sage_codex', 'thorn_mail', 'thorn_mail', 'thorn_mail');
    expect(nextBuildItem(o)).toBe('boots');
    expect(canAutoBuy(o, 'boots')).toBe(false);
    o.gold = 99999;
    expect(buildStatus(o)).toBe('paused');
  });

  it('鞋的规则与 buyItem 一致：有鞋时不能再买基础鞋或同一双；换另一双进阶鞋按旧鞋售价抵扣', () => {
    const o = owner('fengling', 'boots_fury');
    expect(canAutoBuy(o, 'boots')).toBe(false);
    expect(canAutoBuy(o, 'boots_fury')).toBe(false);
    expect(canAutoBuy(o, 'boots_guard')).toBe(true);
    expect(buildCost(o, 'boots_guard')).toBe(ITEMS.boots_guard.cost - Math.floor(ITEMS.boots_fury.cost * SELL_RATIO));
  });

  it('MIN_BUILD_COST = 基础鞋的价格；isBuildItem 只认本英雄的出装表', () => {
    expect(MIN_BUILD_COST).toBe(ITEMS.boots.cost);
    expect(isBuildItem('panyue', 'boots')).toBe(true);
    expect(isBuildItem('panyue', 'winter_scepter')).toBe(true);
    expect(isBuildItem('panyue', 'sage_codex')).toBe(false);
    expect(isBuildItem('chijin', 'boots_fury')).toBe(false);
  });
});

describe('推荐出装：六张卡', () => {
  it('鞋一张(两个阶段) + 五件成装；order 1..6；同一时刻至多一张「下一件」', () => {
    for (const id of HERO_IDS) {
      const o = owner(id);
      const build = HEROES[id].build;
      const finals = build.filter((it) => ITEMS[it].category !== 'boots');
      const upgrade = build.find((it) => ITEMS[it].category === 'boots' && ITEMS[it].tier === 2);
      let cards = buildCards(o);
      expect(cards.length).toBe(6);
      expect(cards.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(cards.map((c) => c.finalId)).toEqual([upgrade, ...finals]);
      expect(cards[0]).toMatchObject({ baseId: 'boots', stage: 'todo', buyId: 'boots', cost: ITEMS.boots.cost, next: true });
      expect(cards.slice(1).every((c) => c.baseId === null && c.stage === 'todo' && c.buyId === c.finalId && c.cost === ITEMS[c.finalId].cost)).toBe(true);
      // 高亮顺序：鞋 → 第一件大件 → 鞋(升级) → 其余四件
      const highlight: number[] = [];
      for (let i = 0; i < 7; i++) {
        cards = buildCards(o);
        const next = cards.filter((c) => c.next);
        expect(next.length).toBe(1);
        expect(next[0].buyId).toBe(nextBuildItem(o));
        highlight.push(next[0].order);
        put(o, next[0].buyId as ItemId);
      }
      expect(highlight).toEqual([1, 2, 1, 3, 4, 5, 6]);
      cards = buildCards(o);
      expect(cards.every((c) => c.stage === 'done' && c.buyId === null && !c.next && c.cost === 0)).toBe(true);
    }
  });

  it('鞋卡的三个阶段：没鞋 → 只有基础鞋(下一步是升级，花费已抵扣) → 进阶鞋', () => {
    const o = owner('xingli');
    expect(buildCards(o)[0]).toMatchObject({ finalId: 'boots_arcane', baseId: 'boots', stage: 'todo', buyId: 'boots', cost: 250 });
    put(o, 'boots');
    // 第二步是法杖，鞋卡此时不是「下一件」，但点它买的是进阶鞋
    expect(buildCards(o)[0]).toMatchObject({ stage: 'base', buyId: 'boots_arcane', cost: UPGRADE, next: false });
    expect(buildCards(o)[1]).toMatchObject({ finalId: 'astral_staff', next: true });
    put(o, 'astral_staff');
    expect(buildCards(o)[0]).toMatchObject({ stage: 'base', buyId: 'boots_arcane', next: true });
    put(o, 'boots_arcane');
    expect(buildCards(o)[0]).toMatchObject({ stage: 'done', buyId: null, next: false });
    expect(buildCards(o)[1].stage).toBe('done');
  });
});

describe('第二阶段数据表', () => {
  it('装备 17 件：鞋 4 / 攻击 5 / 法术 4 / 防御 4；只有基础鞋是 tier 1；每件都有不超过 16 字的简介', () => {
    expect(ITEM_LIST.length).toBe(17);
    const count = (cat: string): number => ITEM_LIST.filter((it) => it.category === cat).length;
    expect([count('boots'), count('attack'), count('magic'), count('defense')]).toEqual([4, 5, 4, 4]);
    expect(ITEM_LIST.filter((it) => it.tier === 1).map((it) => it.id)).toEqual(['boots']);
    const names = new Set<string>();
    for (const it of ITEM_LIST) {
      expect(it.brief, it.id).toBeTruthy();
      expect(len(it.brief ?? ''), `${it.id} 的简介太长`).toBeLessThanOrEqual(16);
      expect(len(it.name), `${it.id} 的名字太长`).toBeLessThanOrEqual(5);
      expect(names.has(it.name)).toBe(false);
      names.add(it.name);
      if (it.passive) expect(len(it.passive.name)).toBeLessThanOrEqual(4);
    }
    // 出装表只引用现存的装备，七步买完正好六格
    for (const id of HERO_IDS) {
      const build = HEROES[id].build;
      expect(build.every((it) => ITEMS[it] !== undefined)).toBe(true);
      expect(build.length).toBe(7);
      expect(build.filter((it) => ITEMS[it].category === 'boots').length).toBe(2);
    }
  });

  it('英雄：全称「名字 · 职业」；被动与技能都有 ≤18 字、不带占位符的大白话和 1~2 个词表内的标签', () => {
    expect(HERO_IDS.map((id) => heroFullName(id))).toEqual(['樊哙 · 坦克', '程咬金 · 战士', '王昭君 · 法师', '李广 · 射手', '荆轲 · 刺客']);
    expect(heroFullName(HEROES.xingli)).toBe('王昭君 · 法师');
    expect(Object.keys(SKILL_TAG_NAME).length).toBe(8);
    const skillNames = new Set<string>();
    for (const id of HERO_IDS) {
      const def = HEROES[id];
      const entries = [def.passive, def.skills.s1, def.skills.s2, def.skills.ult];
      for (const e of entries) {
        expect(e.brief, `${id} ${e.name}`).toBeTruthy();
        expect(len(e.brief ?? '')).toBeLessThanOrEqual(18);
        expect(/[{}\d]/.test(e.brief ?? '')).toBe(false);
        const tags = e.tags ?? [];
        expect(tags.length).toBeGreaterThanOrEqual(1);
        expect(tags.length).toBeLessThanOrEqual(2);
        expect(new Set(tags).size).toBe(tags.length);
        for (const t of tags) expect(SKILL_TAG_NAME[t]).toBeTruthy();
        expect(len(e.name)).toBe(4);
        expect(skillNames.has(e.name)).toBe(false);
        skillNames.add(e.name);
      }
      expect(len(def.title)).toBe(4);
      // 五人界面身份色的主色互不相同
      expect(HERO_IDS.filter((o) => HEROES[o].palette.primary === def.palette.primary)).toEqual([id]);
    }
    for (const s of Object.values(SUMMONER)) expect(len(s.brief)).toBeLessThanOrEqual(18);
    expect(SUMMONER.heal.name).toBe('疗伤');
  });

  it('叫法：野怪用通用叫法 + 自拟副名，奖励说明里的数字取自 MONSTER_RULES；兵种用通用叫法', () => {
    const full = (Object.keys(MONSTERS) as MonsterType[]).map((t) => monsterFullName(t));
    expect(full).toEqual(['小野怪 · 苔背獾', '小野怪 · 荧翅蛾', '蓝buff · 霜晶巨鹿', '红buff · 炽焰巨熊', '河道巨龙 · 沉渊鳞龙', '星陨巨灵']);
    expect(MONSTERS.frost_golem.reward).toContain(`${MONSTER_RULES.buffDuration} 秒`);
    expect(MONSTERS.abyss_drake.reward).toContain(`+${MONSTER_RULES.drakeTeamGold} 金币`);
    expect(MONSTERS.abyss_drake.reward).toContain(`+${MONSTER_RULES.drakeTeamXp} 经验`);
    expect(MONSTERS.star_colossus.reward).toContain(`${MONSTER_RULES.blessingDuration} 秒`);
    expect(MONSTERS.mossback.reward).toBeUndefined();
    expect(Object.values(MINIONS).map((m) => m.name)).toEqual(['近战兵', '远程兵', '攻城兵', '超级兵']);
  });
});
