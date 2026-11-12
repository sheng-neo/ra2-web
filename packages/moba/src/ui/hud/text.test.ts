/**
 * HUD 文案与技能标签数据的一致性：标签词表、大白话的长度与写法、英雄专属状态说明里不残留第一阶段的旧设定词。
 */
import { describe, expect, it } from 'vitest';
import { HEROES, HERO_IDS, SKILL_TAG_NAME, SUMMONER } from '../../core/data/heroes';
import type { Buff, BuffId, SkillTag } from '../../core/types';
import { SKILL_TAG_META, SUMMONER_CAST, buffDesc, castKind, castReach } from './text';

const HERO_BUFFS: BuffId[] = ['panyue_passive', 'panyue_bulwark', 'chijin_ember', 'chijin_blaze', 'chijin_spin', 'xingli_mark', 'fengling_gale', 'fengling_crit', 'yeque_shadow'];
const buff = (id: BuffId, stacks = 2, value = 0.4): Buff => ({ id, sourceId: 1, timeLeft: 2, duration: 3, stacks, value });

describe('技能类型标签', () => {
  it('八个标签都有显示信息：全名取自数据层，角标恰好两个字，颜色是 #rrggbb', () => {
    const tags = Object.keys(SKILL_TAG_NAME) as SkillTag[];
    expect(tags).toHaveLength(8);
    for (const t of tags) {
      const m = SKILL_TAG_META[t];
      expect(m.name).toBe(SKILL_TAG_NAME[t]);
      expect([...m.short]).toHaveLength(2);
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('每个技能与被动都有 1~2 个标签和一句大白话(≤18 字，不带数字与占位符)', () => {
    for (const id of HERO_IDS) {
      const def = HEROES[id];
      for (const info of [def.passive, def.skills.s1, def.skills.s2, def.skills.ult]) {
        expect(info.tags?.length, `${def.name} ${info.name} 的标签数`).toBeGreaterThanOrEqual(1);
        expect(info.tags?.length).toBeLessThanOrEqual(2);
        for (const t of info.tags ?? []) expect(SKILL_TAG_META[t], `${info.name} 的标签 ${t}`).toBeTruthy();
        const brief = info.brief ?? '';
        expect(brief.length, `${info.name} 的大白话`).toBeGreaterThan(0);
        expect([...brief].length, `${info.name}：${brief}`).toBeLessThanOrEqual(18);
        expect(brief).not.toMatch(/[0-9{}%]/);
      }
    }
  });

  it('通用技能有大白话', () => {
    for (const s of ['recall', 'heal', 'flash'] as const) expect(SUMMONER[s].brief.length).toBeGreaterThan(0);
  });
});

describe('施法方式', () => {
  it('五种施法方式各有一个词，距离 / 半径分开给', () => {
    expect(castKind({ type: 'direction', range: 7.5, width: 2 })).toBe('方向');
    expect(castKind({ type: 'cone', range: 5.5, angle: 1 })).toBe('扇形');
    expect(castKind({ type: 'position', range: 9, radius: 3 })).toBe('范围');
    expect(castKind({ type: 'target', range: 8 })).toBe('指向');
    expect(castKind({ type: 'self', radius: 4.2 })).toBe('自身');
    expect(castReach({ type: 'cone', range: 5.5, angle: 1 })).toBe('距离 5.5');
    expect(castReach({ type: 'self', radius: 4.2 })).toBe('半径 4.2');
    expect(castReach({ type: 'self', radius: 0 })).toBe('');
    expect(castReach(SUMMONER_CAST.flash)).toBe(`距离 ${SUMMONER.flash.range}`);
    expect(castReach(SUMMONER_CAST.recall)).toBe('');
  });
});

describe('英雄专属状态说明', () => {
  it('九条说明按新身份写：不残留岩 / 焰 / 星辉 / 风势 / 暗影这些旧设定词', () => {
    for (const id of HERO_BUFFS) {
      const text = buffDesc(buff(id));
      expect(text.length).toBeGreaterThan(4);
      expect(text, id).not.toMatch(/岩|烈焰|火焰|星辉|风势|暗影|潜行/);
    }
  });

  it('层数与数值写进说明里', () => {
    expect(buffDesc(buff('panyue_passive', 2))).toContain('2/3');
    expect(buffDesc(buff('xingli_mark', 1))).toContain('余音 1/3');
    expect(buffDesc(buff('fengling_gale', 4))).toContain('连射 4/5');
    expect(buffDesc(buff('chijin_blaze', 1, 0.48))).toContain('48%');
  });

  it('两条纠错：拥盾怒目不再说「周围敌人减速」，得手不再说「移动速度提高」', () => {
    expect(buffDesc(buff('panyue_bulwark'))).not.toContain('减速');
    expect(buffDesc(buff('yeque_shadow'))).not.toContain('移动速度');
    expect(buffDesc(buff('yeque_shadow'))).toContain('冷却已刷新');
  });
});
