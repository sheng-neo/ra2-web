import { describe, expect, it } from 'vitest';
import { LANGS } from '../../core/i18n';
import { copyProblems } from '../copyRules';
import { en, fmtNumber, hans, hant, LANGUAGE_NAMES, msg, placeholders, translate, translator, type Msg, type MsgKey } from './translate';

const KEYS = Object.keys(en) as MsgKey[];
const texts = (m: Msg) => (typeof m === 'string' ? [m] : [m.one, m.other]);

describe('message dictionaries', () => {
  it('Chinese has exactly the English keys', () => {
    expect(Object.keys(hans).sort()).toEqual([...KEYS].sort());
    for (const k of Object.keys(hant)) expect(KEYS).toContain(k);
  });

  it('a translation never uses a placeholder the English message does not have', () => {
    for (const k of KEYS) {
      const allowed = new Set([...placeholders(en[k]), ...(typeof en[k] === 'string' ? [] : ['count'])]);
      for (const table of [hans, hant]) {
        const m = table[k];
        if (m === undefined) continue;
        for (const p of placeholders(m)) expect(allowed.has(p), `${k}: {${p}}`).toBe(true);
      }
    }
  });

  it('both forms of an English plural use the same placeholders, including {count}', () => {
    for (const k of KEYS) {
      const m: Msg = en[k];
      if (typeof m === 'string') continue;
      expect(placeholders(m.one), k).toEqual(placeholders(m.other));
      expect(placeholders(m.one), k).toContain('count');
    }
  });

  it('English copy follows the copy rules', () => {
    for (const k of KEYS) for (const s of texts(en[k])) expect(copyProblems(s), `${k}: ${s}`).toEqual([]);
  });

  it('the only markup in a message is <b>', () => {
    for (const k of KEYS) for (const table of [en, hans]) for (const s of texts(table[k])) expect(s.replace(/<\/?b>/g, ''), k).not.toMatch(/[<>]/);
  });

  it('every language has a name in its own script', () => {
    expect(LANGS.map((l) => LANGUAGE_NAMES[l])).toEqual(['English', '简体中文', '繁體中文']);
  });
});

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate('en', 'log.delete', { item: 'Weight' })).toBe('Delete Weight');
    expect(translate('hans', 'log.delete', { item: '体重' })).toBe('删除 体重');
    expect(translate('en', 'toast.food', { food: '$1 & {grams}', grams: 6 })).toBe('Logged: $1 & {grams}, about 6 g protein');
  });

  it('picks the English plural by count; Chinese has one form', () => {
    expect(translate('en', 'toast.restored', { count: 1 })).toBe('Restored 1 record');
    expect(translate('en', 'toast.restored', { count: 2 })).toBe('Restored 2 records');
    expect(translate('en', 'toast.restored', { count: 0 })).toBe('Restored 0 records');
    expect(translate('hans', 'toast.restored', { count: 1 })).toBe('已恢复 1 条记录');
  });

  it('formats numbers for the language', () => {
    expect(fmtNumber(1234.5, 'en')).toBe('1,234.5');
    expect(fmtNumber(1234.5, 'hans')).toBe('1234.5');
    expect(fmtNumber(0.25, 'en')).toBe('0.25');
    expect(translate('en', 'toast.restored', { count: 1200 })).toBe('Restored 1,200 records');
    expect(translate('hans', 'toast.restored', { count: 1200 })).toBe('已恢复 1200 条记录');
  });

  it('Traditional Chinese falls back to the Simplified text', () => {
    for (const k of KEYS) if (hant[k] === undefined) expect(translate('hant', k)).toBe(translate('hans', k));
  });

  it('a translator is typed, knows its language and is stable', () => {
    const t = translator('en');
    expect(t.lang).toBe('en');
    expect(translator('en')).toBe(t);
    expect(t('tab.today')).toBe('Today');
    expect(t('today.status.daysSinceShot', { days: 4 })).toBe('Day 4 after your shot');
    expect(t.ref(msg('toast.dose.shot', { amount: 2.5, unit: 'mg' }))).toBe('Logged: shot, 2.5 mg');
    expect(translator('hans').ref(msg('toast.dose.shot', { amount: 2.5, unit: 'mg' }))).toBe('已记下：打针 2.5 mg');
    // @ts-expect-error a message with placeholders needs its parameters
    t('today.status.daysSinceShot');
    // @ts-expect-error wrong parameter name
    t('today.status.daysSinceShot', { day: 4 });
    // @ts-expect-error unknown key
    expect(t('tab.nope')).toBe('tab.nope');
  });
});
