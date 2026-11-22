import { describe, expect, it } from 'vitest';
import type { Lang } from '../../core/i18n';
import type { ProteinTarget } from '../../core/protein';
import type { Advice } from '../../core/today';
import type { CourseStatus } from '../../core/types';
import { copyProblems } from '../copyRules';
import { adviceText } from './advice';
import { COPING_IDS, copingById, copingCards, copingFor } from './coping';
import golden from './content.golden.hans.json';
import { disclaimer, statusLabel } from './labels';
import { ROUTINE_IDS, routineExercises, routineTitle } from './workouts';

/**
 * content.golden.hans.json holds the Chinese content exactly as the code produced it before
 * the content files became bilingual. Do not regenerate it to make a test pass.
 */
const cases = golden.advice as { a: Advice; p: ProteinTarget; oral: boolean; text: { title: string; body: string; tone: string } }[];
const STATUSES = Object.keys(golden.status) as CourseStatus[];

describe('Chinese content is unchanged', () => {
  it.each(['hans', 'hant'] as Lang[])('advice card (%s)', (lang) => {
    expect(cases.length).toBeGreaterThan(100);
    for (const c of cases) expect(adviceText(c.a, c.p, { oral: c.oral, lang })).toEqual(c.text);
  });

  it('coping cards', () => {
    expect(copingCards('hans')).toEqual(golden.coping);
    expect(copingCards('hant')).toEqual(golden.coping);
  });

  it('workouts', () => {
    const now = Object.fromEntries(ROUTINE_IDS.map((r) => [r, { title: routineTitle(r, 'hans'), exercises: routineExercises(r, 'hans') }]));
    expect(now).toEqual(golden.routines);
  });

  it('status labels and the disclaimer', () => {
    for (const s of STATUSES) expect(statusLabel(s, 'hans')).toBe(golden.status[s]);
    expect(disclaimer('hans')).toBe(golden.disclaimer);
  });
});

describe('English content', () => {
  const english: string[] = [];
  for (const c of cases) {
    const t = adviceText(c.a, c.p, { oral: c.oral, lang: 'en' });
    english.push(t.title, t.body);
  }
  for (const c of copingCards('en')) english.push(c.title, ...c.tryFirst, ...c.avoid, ...c.seeDoctor, ...c.sources);
  for (const r of ROUTINE_IDS) {
    english.push(routineTitle(r, 'en'));
    for (const e of routineExercises(r, 'en')) english.push(e.name, e.how, e.standard, e.light);
  }
  for (const s of STATUSES) english.push(statusLabel(s, 'en'));
  english.push(disclaimer('en'));

  it('follows the copy rules', () => {
    for (const s of english) expect(copyProblems(s), s).toEqual([]);
  });

  it('is never empty and has no doubled or trailing spaces', () => {
    for (const s of english) {
      expect(s.trim()).not.toBe('');
      expect(s, s).not.toMatch(/ {2}|^ | $/);
    }
  });

  it('advice keeps the tone of the Chinese card and names the same numbers', () => {
    for (const c of cases) {
      const t = adviceText(c.a, c.p, { oral: c.oral, lang: 'en' });
      expect(t.tone).toBe(c.text.tone);
      const numbers = (s: string) => [...new Set(s.match(/\d+/g) ?? [])].sort();
      expect(numbers(t.title + ' ' + t.body), JSON.stringify(c.a)).toEqual(numbers(c.text.title + ' ' + c.text.body));
    }
  });

  it('coping cards have the same lines as the Chinese cards', () => {
    const zh = copingCards('hans');
    const out = copingCards('en');
    expect(out.map((c) => c.id)).toEqual(COPING_IDS);
    out.forEach((c, i) => {
      expect(c.forSymptoms).toEqual(zh[i].forSymptoms);
      expect([c.tryFirst.length, c.avoid.length, c.seeDoctor.length, c.sources.length]).toEqual([zh[i].tryFirst.length, zh[i].avoid.length, zh[i].seeDoctor.length, zh[i].sources.length]);
    });
    expect(copingFor('vomiting', 'en')?.id).toBe('nausea');
    expect(copingFor('hair_loss', 'en')).toBeUndefined();
    expect(copingById('fatigue', 'en')?.title).toBe('Tired, no energy');
  });

  it('workouts have the same exercises and the same amounts as the Chinese ones', () => {
    for (const r of ROUTINE_IDS) {
      const zh = routineExercises(r, 'hans');
      const out = routineExercises(r, 'en');
      expect(out).toHaveLength(zh.length);
      const numbers = (s: string) => s.match(/\d+/g);
      out.forEach((e, i) => {
        expect(numbers(e.standard)).toEqual(numbers(zh[i].standard));
        expect(numbers(e.light)).toEqual(numbers(zh[i].light));
      });
    }
  });
});
