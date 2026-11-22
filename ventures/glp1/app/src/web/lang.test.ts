import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { langOrDefault } from '../core/i18n';
import { newProfile } from '../core/profile';
import { zonedToUtc } from '../core/tz';
import type { DoseEvent, Profile } from '../core/types';
import { fmtWeight, toKg } from '../core/units';
import { storedKg } from './actions';
import { App, Screens } from './App';
import { InputBar } from './components/InputBar';
import { Sheets } from './components/Sheets';
import { TriageModal } from './components/TriageModal';
import { Toast } from './components/ui';
import { copyProblems } from './copyRules';
import { db } from './db';
import { derive, type Records } from './derive';
import { BackupError, buildCsv, importBackup } from './exportData';
import { I18nProvider, msg } from './i18n';
import { savedLang } from './lang';
import { Me } from './screens/Me';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Trends } from './screens/Trends';
import { setUi, type SheetName } from './store';

const TZ = 'America/New_York';
const NOW = zonedToUtc(2026, 11, 20, 12, 0, TZ);

/** A profile exactly as the app saved it before the language field existed. */
const legacy: Profile = {
  id: 'me',
  script: 'hans',
  region: 'CN',
  weightUnit: 'jin',
  heightCm: 160,
  startWeightKg: 78,
  goalWeightKg: 65,
  birthYear: null,
  dayStartHour: 4,
  tz: TZ,
  safety: { kidneyOrLiver: false, pregnancy: false, insulinOrSU: false, eatingDisorder: false, under18: false },
  proteinMode: 'auto',
  proteinManualG: null,
  aiConsent: true,
  regimen: { drugId: 'tirzepatide', doseAmount: 5, doseUnit: 'mg', schedule: { kind: 'weekly', weekday: 1, time: '21:00' }, status: 'escalating', weeksOnDoseAtStart: 3 },
  onboardedAt: 1,
  largeText: false,
};

const english: Profile = { ...legacy, lang: 'en', region: 'US', weightUnit: 'lb', regimen: { ...legacy.regimen!, brand: 'Zepbound' } };

const row = (at: number) => ({ id: `r${at}`, createdAt: at, updatedAt: at, deletedAt: null, occurredAt: at, tz: TZ, source: 'manual' as const });
const dose = (at: number, amount: number): DoseEvent => ({ ...row(at), drugId: 'tirzepatide', amount, unit: 'mg', site: 'thigh_l' });

function records(foodText: string): Records {
  const day = 86_400_000;
  return {
    doses: [dose(NOW - 18 * day, 2.5), dose(NOW - 11 * day, 5), dose(NOW - 4 * day, 5), dose(NOW - 3_600_000, 5)],
    foods: [{ ...row(NOW - 7_200_000), text: foodText, proteinG: 12, lowG: 8, highG: 16 }],
    weights: Array.from({ length: 8 }, (_, i) => ({ ...row(NOW - i * day - 5_000), kg: 80 - i * 0.1 })),
    symptoms: [
      { ...row(NOW - 9_000_000), kind: 'nausea' as const, grade: 2 },
      { ...row(NOW - 9_500_000), kind: 'other' as const, grade: 3, note: foodText, triageId: 'dehydration' as const, triageLevel: 'urgent' as const, ack: true },
    ],
    workouts: [{ ...row(NOW - 10_000_000), routine: 'band' as const, variant: 'light' as const }],
  };
}

/** Text a person would read: tags removed, plus the labels and placeholders that screen readers and empty inputs show. */
function visibleText(html: string): string {
  const attrs = [...html.matchAll(/(?:aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1]);
  return [html.replace(/<[^>]+>/g, ' '), ...attrs].join(' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
}

function render(profile: Profile, el: ReactElement): string {
  return visibleText(renderToStaticMarkup(createElement(I18nProvider, { lang: langOrDefault(profile), children: el })));
}

/** Every screen and sheet that can be drawn without a browser, for one profile. */
function allScreens(profile: Profile, foodText: string): string {
  const rec = records(foodText);
  const d = derive(profile, rec, NOW, TZ);
  const noop = () => undefined;
  const parts = [
    render(profile, createElement(Today, { profile, d, now: NOW, onOpenTrends: noop, onOpenMe: noop })),
    render(profile, createElement(Trends, { profile, d, rec, now: NOW })),
    render(profile, createElement(Me, { profile, d, onRedoSetup: noop })),
    render(profile, createElement(InputBar, { profile, d })),
  ];
  for (const sheet of ['dose', 'weight', 'symptom', 'food', 'workout'] as SheetName[]) {
    setUi({ sheet, coping: null });
    parts.push(render(profile, createElement(Sheets, { profile, d })));
  }
  for (const coping of ['nausea', 'constipation', 'no_appetite', 'fatigue']) {
    setUi({ sheet: null, coping });
    parts.push(render(profile, createElement(Sheets, { profile, d })));
  }
  setUi({ sheet: null, coping: null, triage: { hits: [{ id: 'chest_or_faint', level: 'emergency' }, { id: 'crisis', level: 'crisis' }], rowId: null }, toast: { id: 1, msg: msg('toast.weight'), undo: noop } });
  parts.push(render(profile, createElement(TriageModal, { profile })), render(profile, createElement(Toast)));
  setUi({ triage: null, toast: null });
  return parts.join('\n');
}

describe('language of a saved profile', () => {
  beforeEach(async () => {
    await db.profile.clear();
  });

  it('is English when nothing is saved yet', async () => {
    expect(await savedLang()).toBe('en');
  });

  it('stays Chinese for a profile saved before the language field existed', async () => {
    await db.profile.put(legacy);
    expect('lang' in legacy).toBe(false);
    expect(await savedLang()).toBe('hans');
    // Without a lang field the app shows what it always showed, whatever `script` says.
    await db.profile.put({ ...legacy, script: 'hant' });
    expect(await savedLang()).toBe('hans');
    await db.profile.put({ ...legacy, script: 'hans', lang: 'hant' });
    expect(await savedLang()).toBe('hant');
  });

  it('follows the saved language field', async () => {
    await db.profile.put(newProfile(TZ));
    expect(await savedLang()).toBe('en');
    await db.profile.put({ ...legacy, lang: 'en' });
    expect(await savedLang()).toBe('en');
    await db.profile.put({ ...newProfile(TZ), lang: 'hans' });
    expect(await savedLang()).toBe('hans');
  });
});

describe('screens follow the profile language', () => {
  it('the loading screen uses the language read at start', () => {
    expect(renderToStaticMarkup(createElement(App, { bootLang: 'hans' }))).toContain('加载中…');
    expect(renderToStaticMarkup(createElement(App, { bootLang: 'en' }))).toContain('Loading…');
  });

  it('a profile without a language field gets the Chinese tabs, an English profile the English ones', () => {
    const zh = renderToStaticMarkup(createElement(Screens, { profile: legacy }));
    for (const s of ['今天', '趋势', '问问', '我的', 'lang="zh-Hans"']) expect(zh).toContain(s);
    const en = renderToStaticMarkup(createElement(Screens, { profile: english }));
    for (const s of ['>Today<', '>Trends<', '>Ask<', '>Me<', 'lang="en"']) expect(en).toContain(s);
    expect(copyProblems(visibleText(en))).toEqual([]);
  });

  it('a profile without a language field is shown in Chinese on every screen', () => {
    const text = allScreens(legacy, '鸡蛋 × 2');
    for (const s of ['今天的记录', '下一针：', '药物水平（估算）', '体重（7 天平均）', '备份和导出', '穆峰达（替尔泊肽）', '每周一 21:00', '记一针', '哪里不舒服？', '可以先试试', '请立即就医', '拨打 ', '我知道了', '已记下体重', '撤销', '内容仅供参考，不构成医疗建议；调整用药或训练前请咨询医生。']) {
      expect(text, s).toContain(s);
    }
    for (const s of ["Today's log", 'Next shot', 'Estimated medication level', 'Backup and export', 'Log shot', 'Undo']) expect(text, s).not.toContain(s);
    // This profile has no brand, and the two US labels of tirzepatide give different chart numbers: no chart, and a line that says so.
    // The line names the two brands and does not send the person to a list that cannot offer them (Mainland China).
    expect(text).toContain('这个药暂时不画曲线。曲线要用美国说明书里的两个数字，Zepbound 和 Mounjaro 的说明书写法不一样，应用不替你选。');
    expect(text).not.toContain('只有每周一次');
    expect(text).not.toContain('选一下品牌');
    expect(text).not.toContain('这里会显示估算曲线');
  });

  it('a Chinese profile on a medication with one US label keeps its chart, with the method link', () => {
    const wegovy: Profile = { ...legacy, regimen: { ...legacy.regimen!, drugId: 'semaglutide-wl', doseAmount: 1 } };
    const rec = records('鸡蛋 × 2');
    rec.doses = rec.doses.map((x) => ({ ...x, drugId: 'semaglutide-wl', amount: 1 }));
    const d = derive(wegovy, rec, NOW, TZ);
    expect(d.curve.length).toBeGreaterThan(0);
    const trends = render(wegovy, createElement(Trends, { profile: wegovy, d, rec, now: NOW }));
    for (const s of ['药物水平（估算）', '药物水平估算曲线', '这是怎么算的', '诺和盈']) expect(trends + render(wegovy, createElement(Me, { profile: wegovy, d, onRedoSetup: () => undefined })), s).toContain(s);
    expect(trends).not.toContain('这个药不画曲线');
  });

  it('the full build, tirzepatide without a brand: the line says why there is no chart, and where the person can choose', () => {
    const noop = () => undefined;
    const pages = (profile: Profile) => {
      const rec = records('Egg × 2');
      const d = derive(profile, rec, NOW, TZ);
      expect(d.curve).toEqual([]);
      return render(profile, createElement(Today, { profile, d, now: NOW, onOpenTrends: noop, onOpenMe: noop })) + render(profile, createElement(Trends, { profile, d, rec, now: NOW }));
    };
    const noBrand: Profile = { ...english, regimen: { ...english.regimen!, brand: undefined } };
    // United States: the list offers both brands, in English and in Chinese.
    const us = pages(noBrand);
    expect(us.split('they are stated differently for Zepbound and Mounjaro. So the chart needs to know your brand. To choose it, go to Me and tap "Change medication or redo setup".').length - 1).toBe(2);
    const usChinese = pages({ ...noBrand, lang: 'hans' });
    expect(usChinese.split('Zepbound 和 Mounjaro 的说明书写法不一样，所以要先知道你用的是哪一个。请到"我的"里点"换药或重新设置"，选一下品牌。').length - 1).toBe(2);
    // "Other": nothing to choose from, so the line only says why.
    const other = pages({ ...noBrand, region: 'OTHER' });
    expect(other.split('they are stated differently for Zepbound and Mounjaro. The app does not choose between them.').length - 1).toBe(2);
    expect(other).not.toContain('go to Me');
    // The line for medications without chart numbers states a rule tirzepatide meets, so it is not shown here.
    for (const text of [us, usChinese, other]) expect(text).not.toMatch(/drawn only for weekly shots|只有每周一次|will show here|这里会显示估算曲线/);
    // A medication with no chart numbers at all still gets that line.
    const mazdutide: Profile = { ...legacy, lang: 'en', regimen: { ...legacy.regimen!, drugId: 'mazdutide' } };
    const rec = records('Egg × 2');
    const d = derive(mazdutide, { ...rec, doses: rec.doses.map((x) => ({ ...x, drugId: 'mazdutide' })) }, NOW, TZ);
    expect(render(mazdutide, createElement(Today, { profile: mazdutide, d, now: NOW, onOpenTrends: noop, onOpenMe: noop }))).toContain('No chart for this medication. The chart is drawn only for weekly shots that have a half-life and a time to peak from US prescribing information.');
  });

  it('the example in the note box is the person\'s own dose: no dose number is written into the copy', () => {
    const box = (profile: Profile) => render(profile, createElement(InputBar, { profile, d: derive(profile, records('Egg × 2'), NOW, TZ) }));
    expect(box(english)).toContain('Type a note: "took 5 mg"');
    expect(box({ ...english, regimen: { ...english.regimen!, drugId: 'semaglutide-wl', brand: 'Wegovy', doseAmount: 1.7 } })).toContain('Type a note: "took 1.7 mg"');
    expect(box(legacy)).toContain('说一句，比如"刚打了 5 左腹"');
    // No saved dose in mg, large text, or a pill in Chinese (the Chinese example speaks of a shot): the plain line.
    const plain: Profile[] = [{ ...english, regimen: null }, { ...english, regimen: { ...english.regimen!, doseAmount: null } }, { ...english, regimen: { ...english.regimen!, doseUnit: 'units' } }, { ...english, largeText: true }];
    for (const p of plain) {
      expect(box(p)).toContain('Type a note');
      expect(box(p)).not.toMatch(/took|\d mg/);
    }
    const pill: Profile = { ...legacy, regimen: { drugId: 'semaglutide-oral-t2d', doseAmount: 7, doseUnit: 'mg', schedule: { kind: 'daily', time: '08:00' }, status: 'maintenance' } };
    expect(box(pill)).toContain('说一句');
    expect(box(pill)).not.toContain('刚打了');
    expect(box({ ...pill, lang: 'en' })).toContain('Type a note: "took 7 mg"');
  });

  it('an English profile shows no Chinese anywhere, and breaks no copy rule', () => {
    const text = allScreens(english, 'Egg × 2');
    for (const s of ["Today's log", 'Next shot: Mon 9:00 PM', 'Estimated medication level', 'Weight (7-day average)', 'Backup and export', 'Zepbound (tirzepatide)', 'Every Monday at 9:00 PM', 'Get medical help right away', 'Weight logged', '176.4 lb']) {
      expect(text, s).toContain(s);
    }
    // The number on the card follows where the phone is, so only its shape is checked here.
    expect(text).toMatch(/Call \d{3}/);
    // The language setting lists every language by its own name; nothing else may be Chinese.
    expect(copyProblems(text.replace('简体中文', '').replace('繁體中文', ''))).toEqual([]);
  });

  it('first-time setup starts in English; redoing setup keeps a Chinese profile in Chinese', () => {
    const fresh = visibleText(renderToStaticMarkup(createElement(Onboarding, { existing: null })));
    expect(fresh).toContain("Hi, I'm your GLP-1 companion");
    expect(fresh).toContain('United States');
    expect(copyProblems(fresh.replace('简体中文', '').replace('繁體中文', ''))).toEqual([]);
    const redo = visibleText(renderToStaticMarkup(createElement(Onboarding, { existing: { ...legacy, onboardedAt: null } })));
    expect(redo).toContain('你好，我是你的 GLP-1 伴侣');
    expect(redo).toContain('目前是简体中文，繁体版在做。');
    expect(redo).not.toContain('Where are you?');
  });
});

describe('stored weight', () => {
  it('a weight entered with one decimal reads back the same in every unit', () => {
    for (const unit of ['lb', 'jin', 'kg'] as const) {
      for (let tenths = 700; tenths <= 4500; tenths++) {
        const typed = tenths / 10;
        const kg = storedKg(toKg(typed, unit));
        if (kg < 30 || kg > 300) continue;
        expect(fmtWeight(kg, unit, 'en'), `${typed} ${unit}`).toBe(`${typed.toFixed(1)} ${unit}`);
      }
    }
  });

  it('keeps a weight entered in kilograms exactly as it was typed', () => {
    for (const kg of [50, 62.5, 81.6, 120.3]) expect(storedKg(kg)).toBe(kg);
  });
});

describe('spreadsheet export', () => {
  beforeEach(async () => {
    await Promise.all([db.profile.clear(), db.doses.clear(), db.foods.clear(), db.weights.clear(), db.symptoms.clear(), db.workouts.clear(), db.questions.clear()]);
    await db.doses.add(dose(NOW - 3_600_000, 5));
    await db.weights.add({ ...row(NOW - 5_000), kg: 80 });
    await db.symptoms.add({ ...row(NOW - 9_000_000), kind: 'nausea', grade: 2 });
    await db.questions.add({ ...row(NOW - 9_100_000), text: 'q', asked: false });
  });

  it('is unchanged in Chinese: same header, generic drug name, kilograms', async () => {
    await db.profile.put(legacy);
    const lines = (await buildCsv('hans')).replace(/^﻿/, '').split('\n');
    // The header has always ended up on the last line of the Chinese file; this pins that it has not moved.
    expect(lines[lines.length - 1]).toBe('日期,时间,时区,类型,内容,数值,单位,备注');
    expect(lines).toContain('2026-11-20,11:00,America/New_York,用药,替尔泊肽,5,mg,左大腿');
    expect(lines).toContain('2026-11-20,11:59,America/New_York,体重,体重,80,kg,');
    expect(lines).toContain('2026-11-20,09:30,America/New_York,症状,恶心,2,0–3 级,');
    expect(lines).toContain('2026-11-20,09:28,America/New_York,想问医生,q,未问,,');
  });

  it('is English for an English profile, with the brand name and pounds', async () => {
    await db.profile.put(english);
    const csv = (await buildCsv('en')).replace(/^﻿/, '');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Time,Time zone,Type,Item,Value,Unit,Note');
    expect(lines.slice(1).map((l) => l.slice(0, 16))).toEqual(['2026-11-20,09:28', '2026-11-20,09:30', '2026-11-20,11:00', '2026-11-20,11:59']);
    expect(lines).toContain('2026-11-20,11:00,America/New_York,Medication,Zepbound (tirzepatide),5,mg,Left thigh');
    expect(lines).toContain('2026-11-20,11:59,America/New_York,Weight,Weight,176.4,lb,');
    expect(lines).toContain('2026-11-20,09:30,America/New_York,Symptom,Nausea,2,Grade 0–3,');
    expect(lines).toContain('2026-11-20,09:28,America/New_York,Question for doctor,q,Not asked,,');
    expect(copyProblems(csv)).toEqual([]);
  });

  it('English names workouts and alerts the way the screens do; Chinese keeps the stored codes', async () => {
    await db.workouts.add({ ...row(NOW - 10_000_000), routine: 'dumbbell', variant: 'standard' });
    await db.workouts.add({ ...row(NOW - 10_100_000), routine: 'band', variant: 'light' });
    await db.symptoms.add({ ...row(NOW - 9_600_000), kind: 'abdominal_pain', grade: 3, triageId: 'abdominal_pain_severe', triageLevel: 'urgent' });
    await db.symptoms.add({ ...row(NOW - 9_700_000), kind: 'other', grade: 3, note: 'x', triageId: 'crisis', triageLevel: 'crisis' });
    await db.symptoms.add({ ...row(NOW - 9_800_000), kind: 'dizziness', grade: 3, triageId: 'hypoglycemia', triageLevel: 'act_now' });

    await db.profile.put(english);
    const en = (await buildCsv('en')).replace(/^\uFEFF/, '');
    const enLines = en.split('\n');
    expect(enLines).toContain('2026-11-20,09:13,America/New_York,Workout,Dumbbells,Standard,,');
    expect(enLines).toContain('2026-11-20,09:11,America/New_York,Workout,Resistance band,Light,,');
    expect(enLines).toContain('2026-11-20,09:20,America/New_York,Symptom,Stomach pain,3,Grade 0–3,Alert: Severe or lasting stomach pain: see a doctor as soon as possible');
    expect(enLines).toContain('2026-11-20,09:18,America/New_York,Symptom,x,3,Grade 0–3,Alert: You are not alone');
    expect(enLines).toContain('2026-11-20,09:16,America/New_York,Symptom,Dizziness,3,Grade 0–3,Alert: This may be low blood sugar. Treat it first');
    // No internal code is left in the English file.
    expect(en).not.toMatch(/,dumbbell,|,band,|,standard,|,light,|abdominal_pain_severe|hypoglycemia|Alert: crisis/);
    expect(copyProblems(en)).toEqual([]);

    await db.profile.put(legacy);
    const zh = (await buildCsv('hans')).split('\n');
    expect(zh).toContain('2026-11-20,09:13,America/New_York,训练,dumbbell,standard,,');
    expect(zh).toContain('2026-11-20,09:20,America/New_York,症状,肚子疼,3,0–3 级,分诊：abdominal_pain_severe');
  });
});

describe('restoring a backup', () => {
  it('refuses a file that is not a backup with a reason the screen can put in words', async () => {
    const ours = { app: 'glp1-companion', version: 1, exportedAt: 1, profile: null };
    const cases: [string, 'not_ours' | 'bad_format'][] = [
      ['hello', 'bad_format'],
      ['', 'bad_format'],
      ['{"app":', 'bad_format'],
      ['null', 'not_ours'],
      ['[]', 'not_ours'],
      ['42', 'not_ours'],
      [JSON.stringify({ app: 'other', version: 1 }), 'not_ours'],
      [JSON.stringify(ours), 'bad_format'],
      [JSON.stringify({ ...ours, tables: { doses: {} } }), 'bad_format'],
      [JSON.stringify({ ...ours, tables: { doses: [{}] } }), 'bad_format'],
      [JSON.stringify({ ...ours, tables: { doses: [null] } }), 'bad_format'],
    ];
    for (const [json, code] of cases) {
      const err: unknown = await importBackup(json).catch((e: unknown) => e);
      expect(err, json).toBeInstanceOf(BackupError);
      expect((err as BackupError).code, json).toBe(code);
    }
  });

  it('restores what was exported', async () => {
    await db.doses.clear();
    await db.doses.add(dose(NOW - 3_600_000, 5));
    await db.profile.put(english);
    const { buildBackup } = await import('./exportData');
    const json = JSON.stringify(await buildBackup());
    await db.doses.clear();
    expect(await importBackup(json)).toBeGreaterThanOrEqual(1);
    expect(await db.doses.count()).toBe(1);
  });
});
