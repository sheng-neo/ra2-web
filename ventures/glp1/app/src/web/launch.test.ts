/**
 * The launch build, tested as a whole: this file runs with VITE_BUILD_PROFILE=launch, so the
 * screens and actions it imports are the ones the launch build ships.
 * What each switch decides on its own is tested in src/core/features.test.ts and alert.test.ts.
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => vi.stubEnv('VITE_BUILD_PROFILE', 'launch'));

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { drugById } from '../core/catalog';
import { LAUNCH } from '../core/features';
import { langOrDefault } from '../core/i18n';
import { guideItems, MED_GUIDE_LIST, MED_GUIDES, type MedGuide } from '../core/medGuide';
import { zonedToUtc } from '../core/tz';
import type { DoseEvent, Profile } from '../core/types';
import { addQuestionFromList, addSymptom } from './actions';
import { Screens } from './App';
import { GuideSheet } from './components/GuideSheet';
import { InputBar } from './components/InputBar';
import { SetupQuestions } from './components/SetupQuestions';
import { Sheets } from './components/Sheets';
import { TriageModal } from './components/TriageModal';
import { footNote } from './content/labels';
import { copyProblems } from './copyRules';
import { countingOn, syncCounts } from './counting';
import { db } from './db';
import { derive, type Records } from './derive';
import { buildCsv } from './exportData';
import { BUILD_PROFILE, features } from './features';
import { I18nProvider } from './i18n';
import { translate } from './i18n/translate';
import { Ask } from './screens/Ask';
import { Me } from './screens/Me';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { methodFacts, Trends } from './screens/Trends';
import { setUi, type SheetName } from './store';

const TZ = 'America/New_York';
const NOW = zonedToUtc(2026, 11, 20, 12, 0, TZ);
const DAY = 86_400_000;
const NOTICE = 'This app is a logging tool. It is not a medical device and does not give medical advice. Talk to your doctor before making decisions about your medication. Not affiliated with any drug maker.';
const NO_ESTIMATE = 'An estimate for this medication is not available yet.';

const english: Profile = {
  id: 'me',
  lang: 'en',
  script: 'hans',
  region: 'US',
  weightUnit: 'lb',
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
  regimen: { drugId: 'tirzepatide', brand: 'Zepbound', doseAmount: 5, doseUnit: 'mg', schedule: { kind: 'weekly', weekday: 1, time: '21:00' }, status: 'escalating', weeksOnDoseAtStart: 3 },
  onboardedAt: 1,
  largeText: false,
};
/** A profile saved before the language field existed: Chinese. */
const chinese: Profile = { ...english, region: 'CN', weightUnit: 'jin', regimen: { ...english.regimen!, brand: undefined } };
delete chinese.lang;
const stopped: Profile = { ...english, regimen: { ...english.regimen!, status: 'stopped', stoppedAt: NOW - 40 * DAY } };

const row = (at: number) => ({ id: `r${at}`, createdAt: at, updatedAt: at, deletedAt: null, occurredAt: at, tz: TZ, source: 'manual' as const });
const dose = (at: number, amount: number): DoseEvent => ({ ...row(at), drugId: 'tirzepatide', amount, unit: 'mg', site: 'thigh_l' });

/** Records as a backup from the full build could bring them in: food and a workout are among them. */
const records: Records = {
  doses: [dose(NOW - 18 * DAY, 2.5), dose(NOW - 11 * DAY, 5), dose(NOW - 4 * DAY, 5), dose(NOW - 3_600_000, 5)],
  foods: [{ ...row(NOW - 7_200_000), text: 'Greek yogurt', proteinG: 17, lowG: 14, highG: 20 }],
  weights: Array.from({ length: 8 }, (_, i) => ({ ...row(NOW - i * DAY - 5_000), kg: 80 + i * 0.4 })),
  symptoms: [
    { ...row(NOW - 9_000_000), kind: 'nausea' as const, grade: 2 },
    { ...row(NOW - 9_500_000), kind: 'vomiting' as const, grade: 3, triageId: 'dehydration' as const, triageLevel: 'urgent' as const, ack: true },
  ],
  workouts: [{ ...row(NOW - 10_000_000), routine: 'band' as const, variant: 'light' as const }],
};

/** Text a person would read: tags removed, plus labels and placeholders. */
function visibleText(html: string): string {
  const attrs = [...html.matchAll(/(?:aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1]);
  return [html.replace(/<[^>]+>/g, ' '), ...attrs].join(' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
}

function html(profile: Profile, el: ReactElement): string {
  return renderToStaticMarkup(createElement(I18nProvider, { lang: langOrDefault(profile), children: el }));
}

const noop = () => undefined;
function screens(profile: Profile, rec: Records = records) {
  const d = derive(profile, rec, NOW, TZ);
  return {
    today: visibleText(html(profile, createElement(Today, { profile, d, now: NOW, onOpenTrends: noop, onOpenMe: noop }))),
    trends: visibleText(html(profile, createElement(Trends, { profile, d, rec, now: NOW }))),
    me: visibleText(html(profile, createElement(Me, { profile, d, onRedoSetup: noop }))),
    questions: visibleText(html(profile, createElement(Ask, { profile }))),
    dock: html(profile, createElement(InputBar, { profile, d })),
  };
}

function alertText(profile: Profile, hits: Parameters<typeof setUi>[0]['triage']): string {
  setUi({ triage: hits });
  const text = visibleText(html(profile, createElement(TriageModal, { profile })));
  setUi({ triage: null });
  return text;
}

/** Any network call from the code under test fails the test that made it. */
const fetchSpy = vi.fn(() => Promise.reject(new Error('the launch build must not call the network')));
beforeAll(() => vi.stubGlobal('fetch', fetchSpy));
afterAll(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('launch build: switches', () => {
  it('this file runs as the launch profile', () => {
    expect(BUILD_PROFILE).toBe('launch');
    expect(features).toBe(LAUNCH);
  });
});

describe('launch build: no model calls and no note box', () => {
  it('the dock is three log buttons: no note box, no camera, no food buttons', () => {
    const dock = screens(english).dock;
    expect(visibleText(dock).replace(/\s+/g, ' ').trim()).toBe('Log shot Weight Symptom');
    expect(dock).not.toMatch(/<input|<form|capture=|type="file"/);
    for (const s of ['Type a note', 'Take a photo', 'Food', 'Egg']) expect(dock, s).not.toContain(s);
  });

  it('a pill is logged with a button too', () => {
    const oral: Profile = { ...english, regimen: { drugId: 'semaglutide-oral-wl', brand: 'Wegovy pill', doseAmount: 4, doseUnit: 'mg', schedule: { kind: 'daily', time: '08:00' }, status: 'escalating' } };
    expect(visibleText(screens(oral).dock).replace(/\s+/g, ' ').trim()).toBe('Log pill Weight Symptom');
  });

  it('settings have no AI section, and no screen mentions AI', () => {
    const s = screens(english);
    for (const text of Object.values(s)) expect(text).not.toMatch(/\bAI\b|AI service|recognition/);
  });

  it('the dock is on Today only: the third tab has its own box for a question', () => {
    const page = renderToStaticMarkup(createElement(Screens, { profile: english }));
    expect(page).toContain('class="quick only"');
    for (const s of ['>Today<', '>Trends<', '>Questions<', '>Me<']) expect(page, s).toContain(s);
    expect(page).not.toContain('>Ask<');
  });
});

describe('launch build: danger symptoms', () => {
  it('every serious hit that is not a crisis shows the one fixed card, with the call button and the "not a diagnosis" line', () => {
    for (const hit of [
      { id: 'dehydration', level: 'urgent' },
      { id: 'abdominal_pain_severe', level: 'urgent' },
      { id: 'hypoglycemia', level: 'act_now' },
      { id: 'pancreatitis', level: 'emergency' },
    ] as const) {
      const text = alertText(english, { hits: [hit], rowId: null }).replace(/\s+/g, ' ');
      expect(text, hit.id).toContain('Contact your doctor right away');
      // The number follows where the phone is, so only its shape is checked.
      expect(text, hit.id).toMatch(/What you logged can be a sign of a serious problem\. Contact your doctor right away\. If it is an emergency, call (\d{3}|your local emergency number)\./);
      expect(text, hit.id).toContain('It is not a diagnosis.');
      expect(text, hit.id).toContain('Got it');
      // The alert leads to the whole list of the Medication Guide. It names no item of it.
      expect(text, hit.id).toContain('See the warning signs in the Medication Guide');
      // None of the detail cards' text.
      expect(text, hit.id).not.toMatch(/dehydration|pancreas|blood sugar|emergency room|Tell your doctor ahead of time|paused/i);
    }
    expect(alertText(english, { hits: [{ id: 'dehydration', level: 'urgent' }], rowId: null })).toMatch(/Call \d{3}/);
  });

  it('a hit of a mild level (a reminder in the default build) shows no alert at all', () => {
    for (const hit of [
      { id: 'procedure', level: 'remind' },
      { id: 'contraception', level: 'remind' },
      { id: 'pregnancy', level: 'contact' },
      { id: 'eating_too_little', level: 'care' },
    ] as const) {
      setUi({ triage: { hits: [hit], rowId: null } });
      expect(html(english, createElement(TriageModal, { profile: english })), hit.id).toBe('');
      setUi({ triage: null });
    }
  });

  it('a crisis hit shows the crisis card', () => {
    const text = alertText(english, { hits: [{ id: 'crisis', level: 'crisis' }], rowId: null });
    expect(text).toContain('You are not alone');
    expect(text).not.toContain('Contact your doctor right away');
    // The crisis card is as it was: no button to the Medication Guide.
    expect(text).not.toContain('Medication Guide');
  });

  it('an alert from a typed question says "What you wrote"; an alert from a log entry says "What you logged"', () => {
    const hits = [{ id: 'chest_or_faint', level: 'emergency' }] as const;
    const wrote = alertText(english, { hits: [...hits], rowId: null, wrote: true });
    expect(wrote).toMatch(/What you wrote can be a sign of a serious problem\. Contact your doctor right away\./);
    expect(wrote).not.toContain('What you logged');
    const logged = alertText(english, { hits: [...hits], rowId: 'row' });
    expect(logged).toMatch(/What you logged can be a sign of a serious problem\./);
    expect(logged).not.toContain('What you wrote');
  });

  it('a severe symptom from the symptom sheet still triggers the alert', async () => {
    await db.symptoms.clear();
    setUi({ triage: null, coping: null });
    const hits = await addSymptom(english, 'vomiting', 3);
    expect(hits).toEqual([{ id: 'dehydration', level: 'urgent' }]);
    const saved = await db.symptoms.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: 'vomiting', grade: 3, triageId: 'dehydration', triageLevel: 'urgent' });
    expect(visibleText(html(english, createElement(TriageModal, { profile: english })))).toContain('Contact your doctor right away');
    setUi({ triage: null });
  });

  it('Today keeps the alert of the day in view under the fixed title, without the advice card', () => {
    const today = screens(english).today;
    expect(today).toContain('Contact your doctor right away');
    expect(today).toContain('See the alert again');
    expect(today).not.toContain('Take care of your body first today');
    expect(today).not.toMatch(/tips are paused/);
  });

  it('the spreadsheet names an alert by the card that was shown', async () => {
    await Promise.all([db.profile.clear(), db.symptoms.clear()]);
    await db.profile.put(english);
    await db.symptoms.add({ ...row(NOW - 9_600_000), kind: 'abdominal_pain', grade: 3, triageId: 'abdominal_pain_severe', triageLevel: 'urgent' });
    await db.symptoms.add({ ...row(NOW - 9_700_000), kind: 'other', grade: 3, note: 'x', triageId: 'crisis', triageLevel: 'crisis' });
    const lines = (await buildCsv('en')).split('\n');
    expect(lines).toContain('2026-11-20,09:20,America/New_York,Symptom,Stomach pain,3,Grade 0–3,Alert: Contact your doctor right away');
    expect(lines).toContain('2026-11-20,09:18,America/New_York,Symptom,x,3,Grade 0–3,Alert: You are not alone');
    await db.symptoms.clear();
  });
});

describe('launch build: warning signs in the Medication Guide', () => {
  const sheet = (profile: Profile): string => {
    setUi({ guide: true });
    const out = html(profile, createElement(GuideSheet, { profile }));
    setUi({ guide: false });
    return out;
  };
  const words = (markup: string) => visibleText(markup).replace(/\s+/g, ' ');
  /** Every piece of the guide the screen shows, in the order the guide prints them. */
  const inOrder = (g: MedGuide): string[] => [g.mostImportant, g.seriousSideEffects].flatMap((part) => [part.question, part.intro, ...part.items.flatMap((i) => [i.text, ...i.bullets, ...(i.after === undefined ? [] : [i.after])])]);
  const withMed = (drugId: string, brand?: string): Profile => ({ ...english, regimen: { ...english.regimen!, drugId, brand } });

  it('the switch is on, Me has the row that opens the list, and a closed list renders nothing', () => {
    expect(features.guideWarningSigns).toBe(true);
    expect(screens(english).me).toContain('Warning signs in the Medication Guide');
    setUi({ guide: false });
    expect(html(english, createElement(GuideSheet, { profile: english }))).toBe('');
  });

  it('says where the list is from, in the fixed words, and gives the page address as a link', () => {
    const out = sheet(english);
    expect(words(out)).toContain("From the Medication Guide for Zepbound, revised 08/2026. These are the manufacturer's words, approved by the FDA. Nothing here is written by this app.");
    expect(out).toContain(`<a class="guide-link" href="${MED_GUIDES.zepbound.url}" target="_blank" rel="noopener noreferrer">${MED_GUIDES.zepbound.url}</a>`);
    expect(words(out)).toContain('The full guide comes with your prescription.');
    // An English screen has no line about a translation.
    expect(words(out)).not.toContain('English original');
  });

  it('shows the whole list of the person\'s own guide, word for word and in the guide\'s order, for every brand', () => {
    for (const g of MED_GUIDE_LIST) {
      for (const [brand, drugId] of Object.entries(g.brands)) {
        const out = sheet(withMed(drugId, brand));
        const text = words(out);
        expect(text, brand).toContain(`From the Medication Guide for ${brand}, `);
        let at = 0;
        for (const piece of inOrder(g)) {
          const found = text.indexOf(piece, at);
          expect(found, `${brand}: "${piece.slice(0, 60)}" is missing or out of order`).toBeGreaterThanOrEqual(0);
          at = found + piece.length;
        }
        // Every item and every sub-bullet is a list entry of its own; none is left out.
        expect(out.match(/<li>/g), brand).toHaveLength(guideItems(g).length + guideItems(g).reduce((n, i) => n + i.bullets.length, 0));
        // Nothing is set in bold or coloured: the guide's words carry no emphasis of ours.
        expect(out, brand).not.toMatch(/<(?:b|strong|em|i|mark)\b|style=/);
        // Inside the guide's text there is no class at all: only headings, paragraphs and lists.
        const guideText = out.slice(out.indexOf('<div class="guide-text" lang="en">') + '<div class="guide-text" lang="en">'.length);
        expect(guideText, brand).not.toMatch(/class=/);
        expect(guideText.replace(/<\/?(?:section|h3|p|ul|li|div)>/g, ''), brand).not.toMatch(/<[a-z]/);
      }
    }
  });

  it('two brands on one guide each get that guide under their own name', () => {
    expect(words(sheet(withMed('semaglutide-oral-t2d', 'Rybelsus')))).toContain('From the Medication Guide for Rybelsus, revised 1/2026.');
    expect(words(sheet(withMed('semaglutide-oral-t2d-ozempic', 'Ozempic pill')))).toContain('From the Medication Guide for Ozempic pill, revised 1/2026.');
    expect(words(sheet(withMed('orforglipron', 'Foundayo')))).toContain('From the Medication Guide for Foundayo, issued 07/2026.');
  });

  it('a medication with no guide on file gets one honest line, and no list', () => {
    const none = 'This app has no Medication Guide on file for your medication. The Medication Guide comes with your prescription.';
    for (const profile of [withMed('custom'), { ...withMed('semaglutide-wl'), region: 'OTHER' as const }, { ...withMed('tirzepatide'), region: 'OTHER' as const }]) {
      const out = sheet(profile);
      expect(words(out)).toContain(none);
      expect(out).not.toMatch(/<li>|<a /);
      expect(words(out)).not.toMatch(/From the Medication Guide for|may cause serious side effects/);
    }
  });

  it('tirzepatide without Zepbound or Mounjaro is asked to choose the brand, as the chart asks', () => {
    const out = sheet(withMed('tirzepatide'));
    expect(words(out)).toContain('The Medication Guides for Zepbound and Mounjaro are separate. So the list needs to know your brand. To choose it, go to Me and tap "Change medication or redo setup".');
    expect(out).not.toMatch(/<li>|<a /);
  });

  it('with no medication set up it says so', () => {
    const out = sheet({ ...english, regimen: null });
    expect(words(out)).toContain('Set up your medication under Me first.');
    expect(out).not.toMatch(/<li>/);
  });

  it('a Chinese profile sees the English original under one Chinese line', () => {
    const zh: Profile = { ...chinese, region: 'US', regimen: { ...chinese.regimen!, brand: 'Zepbound' } };
    const out = sheet(zh);
    const text = words(out);
    expect(text).toContain('下面是英文原文，没有翻译。');
    expect(text).toContain('出自 Zepbound 的美国《用药指南》（Medication Guide），修订于 08/2026。');
    expect(out).toContain('<div class="guide-text" lang="en">');
    expect(text).toContain(MED_GUIDES.zepbound.seriousSideEffects.items[1].text);
    // In Mainland China the brand is not a US brand: none on file.
    expect(words(sheet(chinese))).toContain('本应用没有收录你这种药的《用药指南》。');
  });

  it('opened from an alert, it lies over the alert and still shows the whole list', () => {
    setUi({ triage: { hits: [{ id: 'gallbladder', level: 'urgent' }], rowId: null, wrote: true }, guide: true });
    const out = html(english, createElement(GuideSheet, { profile: english }));
    setUi({ triage: null, guide: false });
    expect(out).toContain('class="sheet-backdrop over-alert"');
    expect(out.match(/<li>/g)).toHaveLength(guideItems(MED_GUIDES.zepbound).length + guideItems(MED_GUIDES.zepbound).reduce((n, i) => n + i.bullets.length, 0));
  });
});

describe('launch build: hidden features', () => {
  const s = screens(english);
  const all = Object.values(s).join('\n');

  it('no coping cards: not on the third tab, not as a sheet, not after logging a symptom', async () => {
    expect(all).not.toMatch(/Things to try first|Try to avoid|See a doctor if|coping/i);
    for (const coping of ['nausea', 'constipation', 'no_appetite', 'fatigue']) {
      setUi({ sheet: null, coping });
      expect(html(english, createElement(Sheets, { profile: english, d: derive(english, records, NOW, TZ) })), coping).toBe('');
    }
    setUi({ coping: null });
    // Logging a symptom that is not an alert only logs it.
    await db.symptoms.clear();
    expect(await addSymptom(english, 'nausea', 2)).toEqual([]);
    expect(await db.symptoms.count()).toBe(1);
    expect(html(english, createElement(Sheets, { profile: english, d: derive(english, records, NOW, TZ) }))).toBe('');
    setUi({ toast: null });
    await db.symptoms.clear();
  });

  it('no workouts, food or protein: no sheet, no card, no row in the log', () => {
    const d = derive(english, records, NOW, TZ);
    for (const sheet of ['food', 'workout'] as SheetName[]) {
      setUi({ sheet, coping: null });
      expect(html(english, createElement(Sheets, { profile: english, d })), String(sheet)).toBe('');
    }
    setUi({ sheet: null });
    // (The weight note says a weigh-in moves "because of water and food"; that sentence stays.)
    expect(all).not.toMatch(/workout|protein|Log food|\+ Food|Greek yogurt|\b17 g\b|Resistance band/i);
    // The records are still on the phone (and in the export); only their rows are hidden.
    expect(d.todayItems.some((it) => it.kind === 'food')).toBe(true);
    expect(d.todayItems.some((it) => it.kind === 'workout')).toBe(true);
    // The three kinds the launch build logs are listed.
    for (const text of ['Weight', 'Shot · Left thigh', 'Nausea', 'Vomiting']) expect(s.today, text).toContain(text);
  });

  it('the sheets the launch build does use still open', () => {
    const d = derive(english, records, NOW, TZ);
    const titles: [SheetName, string][] = [['dose', 'Log shot'], ['weight', 'Log weight'], ['symptom', 'Log a symptom']];
    for (const [sheet, title] of titles) {
      setUi({ sheet, coping: null });
      expect(visibleText(html(english, createElement(Sheets, { profile: english, d }))), title).toContain(title);
    }
    setUi({ sheet: null });
  });

  it('no daily advice card', () => {
    const calm = screens(english, { ...records, symptoms: [] }).today;
    expect(calm).not.toMatch(/A good day for a workout|A regular day today|Today is shot day|Day \d+ after a dose increase|Did you forget to log it|Log a symptom/);
    expect(renderToStaticMarkup(createElement(I18nProvider, { lang: 'en', children: createElement(Today, { profile: english, d: derive(english, { ...records, symptoms: [] }, NOW, TZ), now: NOW, onOpenTrends: noop, onOpenMe: noop }) }))).not.toContain('class="card advice');
  });

  it('no maintenance-stage content, but the status choices stay', () => {
    const after = screens(stopped);
    expect(after.me).toMatch(/Increasing dose\s+Maintenance dose\s+Paused\s+Stopped/);
    expect(after.today).toContain('Stopped');
    for (const text of Object.values(after)) expect(text).not.toMatch(/After stopping|after-stopping|regain|from your lowest point/i);
  });

  it('no Chinese language choice for an English profile; settings show no language picker', () => {
    expect(s.me).not.toMatch(/简体中文|繁體中文|Language/);
    expect(copyProblems(all)).toEqual([]);
  });

  it('the third tab is the list of questions for the doctor', () => {
    expect(s.questions).toContain('Questions for my doctor');
    expect(s.questions).toContain('A question for your doctor');
    expect(s.questions).toContain('No questions yet.');
    expect(s.questions).not.toMatch(/answers are not ready|in the box below/i);
  });
});

describe('launch build: estimated medication level', () => {
  const chart = 'aria-label="Estimated medication level chart"';
  const pages = (profile: Profile, rec: Records) => {
    const d = derive(profile, rec, NOW, TZ);
    return html(profile, createElement(Trends, { profile, d, rec, now: NOW })) + html(profile, createElement(Today, { profile, d, now: NOW, onOpenTrends: noop, onOpenMe: noop }));
  };
  const mounjaro: Profile = { ...english, regimen: { ...english.regimen!, brand: 'Mounjaro' } };
  const noBrand: Profile = { ...english, regimen: { ...english.regimen!, brand: undefined } };
  const saxenda: Profile = { ...english, regimen: { drugId: 'liraglutide', brand: 'Saxenda', doseAmount: 3, doseUnit: 'mg', schedule: { kind: 'daily', time: '08:00' }, status: 'maintenance' } };
  const saxendaDoses: Records = { ...records, doses: [1, 2, 3].map((n) => ({ ...row(NOW - n * DAY), drugId: 'liraglutide', amount: 3, unit: 'mg' as const, site: 'thigh_l' as const })) };

  it('a curve is drawn for a weekly shot whose numbers were read from its US label', () => {
    const d = derive(english, records, NOW, TZ);
    expect(d.curveAvailable).toBe(true);
    expect(d.curve.length).toBeGreaterThan(0);
    expect(d.curveNow).not.toBeNull();
    const s = screens(english);
    expect(s.today).not.toContain(NO_ESTIMATE);
    expect(s.trends).not.toContain(NO_ESTIMATE);
    const page = pages(english, records);
    expect(page.split(chart).length - 1).toBe(2);
    expect(page).toContain('How this is calculated');
    expect(copyProblems(visibleText(page))).toEqual([]);
  });

  it('Zepbound and Mounjaro are drawn with the numbers of their own labels, so the same doses give two curves', () => {
    const zep = derive(english, records, NOW, TZ).curve.map((p) => p.index);
    const mou = derive(mounjaro, records, NOW, TZ).curve.map((p) => p.index);
    expect(mou).toHaveLength(zep.length);
    expect(mou).not.toEqual(zep);
    expect(methodFacts(english, 'en')).toEqual({ name: 'Zepbound', halfLife: 132, peak: 24 });
    expect(methodFacts(mounjaro, 'en')).toEqual({ name: 'Mounjaro', halfLife: 120, peak: 40 });
  });

  it('the method note names the US prescribing information, the two numbers and the rule, and keeps its limits', () => {
    const note = translate('en', 'trends.method.body', methodFacts(english, 'en')!);
    // The rule is about one section of the label: another section can give the same figure in other words (Zepbound, section 10).
    expect(note).toContain('Both come from the pharmacokinetics section of the US prescribing information for Zepbound.');
    expect(note).toContain('For Zepbound the chart uses a half-life of 132 hours and a time to peak of 24 hours.');
    expect(note).toContain('Where that section gives one value or a median, the chart uses it. Where it gives only a range, the chart uses the middle of the range.');
    for (const kept of ['The chart uses these same two numbers for every person on this medication. They are not measured in you.', 'This line is an estimate.', 'It is not a lab measurement and cannot be used to adjust your dose.', 'Only doses you logged in mg are used.']) expect(note, kept).toContain(kept);
    // Some of the numbers are the middle of a range, so nothing calls them averages.
    expect(note).not.toMatch(/average|still to be checked|not verified|\{|\?/i);
    expect(translate('en', 'today.curve.note')).toBe('An estimate based on numbers from US prescribing information. It is not a measurement and cannot be used to adjust your dose.');
    expect(translate('hans', 'today.curve.note')).not.toMatch(/平均/);
    expect(copyProblems(note)).toEqual([]);
    const wegovy: Profile = { ...english, regimen: { ...english.regimen!, drugId: 'semaglutide-wl', brand: 'Wegovy' } };
    expect(translate('en', 'trends.method.body', methodFacts(wegovy, 'en')!)).toContain('For Wegovy the chart uses a half-life of 168 hours and a time to peak of 48 hours.');
    // Chinese: the same facts, for a profile that is already Chinese. Its numbers are those of the US label.
    const zh = translate('hans', 'trends.method.body', methodFacts({ ...chinese, regimen: { ...chinese.regimen!, drugId: 'semaglutide-wl' } }, 'hans')!);
    for (const kept of ['来自 Wegovy 美国处方信息（说明书）的药代动力学一节', '半衰期 168 小时、达峰时间 48 小时', '该节给出单一数值或中位数的，直接采用；只给出范围的，取范围的中间值', '不是你本人的测量值', '帮你理解药物水平大概在什么位置', '不是血药浓度的测量值，不能用来调整剂量']) expect(zh, kept).toContain(kept);
    expect(zh).not.toMatch(/待对照说明书核实|平均|药效|\{/);
  });

  it('no curve, and no method note, where the medication has no chart numbers; a line says so instead', () => {
    const CHOOSE = 'The chart uses two numbers from US prescribing information, and they are stated differently for Zepbound and Mounjaro. So the chart needs to know your brand. To choose it, go to Me and tap "Change medication or redo setup".';
    const TWO_LABELS = 'No chart for this medication yet. The chart uses two numbers from US prescribing information, and they are stated differently for Zepbound and Mounjaro. The app does not choose between them.';
    // A daily medication gets the neutral line. Tirzepatide saved without a brand gets its own: its
    // two US labels state the numbers differently, and in the United States the person can choose.
    const other: Profile = { ...noBrand, region: 'OTHER' };
    for (const [profile, rec, line] of [[saxenda, saxendaDoses, NO_ESTIMATE], [noBrand, records, CHOOSE], [other, records, TWO_LABELS]] as [Profile, Records, string][]) {
      const d = derive(profile, rec, NOW, TZ);
      expect(d.curveAvailable).toBe(false);
      expect(d.curve).toEqual([]);
      expect(d.curveNow).toBeNull();
      const s = screens(profile, rec);
      expect(s.today).toContain(line);
      expect(s.trends).toContain(line);
      for (const not of [NO_ESTIMATE, CHOOSE, TWO_LABELS].filter((x) => x !== line)) expect(s.today + s.trends).not.toContain(not);
      const page = pages(profile, rec);
      expect(page).not.toContain(chart);
      expect(page).not.toMatch(/How this is calculated|half-life|will show here|only for weekly shots/);
      expect(methodFacts(profile, 'en')).toBeNull();
      expect(copyProblems(s.today + s.trends)).toEqual([]);
    }
    // The button the line names is the one on the Me screen.
    expect(screens(noBrand).me).toContain('Change medication or redo setup');
    // The full build draws no curve for them either: there are no numbers to draw with.
    expect(derive(saxenda, saxendaDoses, NOW, TZ, false).curve).toEqual([]);
    expect(derive(noBrand, records, NOW, TZ, false).curve).toEqual([]);
  });

  it('the wait after a pill is shown where the label states one', () => {
    const oral: Profile = { ...english, regimen: { drugId: 'semaglutide-oral-wl', brand: 'Wegovy pill', doseAmount: 4, doseUnit: 'mg', schedule: { kind: 'daily', time: '08:00' }, status: 'escalating' } };
    const pill: DoseEvent = { ...row(NOW - 5 * 60_000), drugId: 'semaglutide-oral-wl', amount: 4, unit: 'mg', site: null };
    const rec: Records = { ...records, doses: [pill] };
    // A pill taken five minutes ago: the countdown is on Today, and the waiting rule is on the pill sheet.
    const wait = drugById('semaglutide-oral-wl').fastingMin;
    expect(wait).toBe(30);
    const d = derive(oral, rec, NOW, TZ);
    expect(d.fastingUntil).toBe(pill.occurredAt + wait! * 60_000);
    // Both lines use the words of the label: "at least", and eating, drinking and other oral medications.
    expect(screens(oral, rec).today).toContain('Wait at least 25 more minutes before you eat, drink or take other oral medications');
    setUi({ sheet: 'dose' });
    const sheet = visibleText(html(oral, createElement(Sheets, { profile: oral, d })));
    setUi({ sheet: null });
    expect(sheet).toContain('Log a pill');
    expect(sheet).toContain('After your pill, wait at least 30 minutes before you eat, drink or take other oral medications.');
    // Nothing the label does not say: no "sip", no "do not drink", no rule about water.
    expect(screens(oral, rec).today + sheet).not.toMatch(/sip|Empty stomach|do not eat or drink|water/i);
    expect(translate('en', 'today.fasting', { count: 1 })).toBe('Wait at least 1 more minute before you eat, drink or take other oral medications');
    for (const key of ['today.fasting', 'dose.fasting'] as const) {
      const zh = translate('hans', key, { count: 30, minutes: 30 });
      expect(zh, key).toMatch(/至少.*30 分钟.*吃东西、喝饮料或服用?其他口服药/);
      expect(zh, key).not.toMatch(/少量水|别喝水|空腹/);
    }
    // A pill logged with a time later than now starts no countdown.
    const later: Records = { ...records, doses: [{ ...pill, occurredAt: NOW + 5 * 3_600_000 }] };
    expect(derive(oral, later, NOW, TZ).fastingUntil).toBeNull();
    expect(screens(oral, later).today).not.toMatch(/more minutes? before you eat/);
  });

  it('the typing check names the US label its highest dose is from, and does not call it "usual"', () => {
    const d = derive(english, records, NOW, TZ);
    expect(translate('en', 'dose.overMax.form', { amount: '25', unit: 'mg', max: '15', name: 'Zepbound' })).toBe(
      '25 mg is more than the highest dose in the US prescribing information for Zepbound (15 mg). Did you type an extra digit? If it is correct, tap the button again.',
    );
    for (const key of ['dose.overMax.form', 'dose.overMax.card'] as const) {
      const en = translate('en', key, { amount: '8.2', unit: 'mg', max: '7.2', name: 'Wegovy' });
      expect(en, key).toContain('the highest dose in the US prescribing information for Wegovy (7.2 mg)');
      expect(en, key).not.toMatch(/usual|recommended|\{/);
      const zh = translate('hans', key, { amount: '8.2', unit: 'mg', max: '7.2', name: 'Wegovy' });
      expect(zh, key).toContain('超过了 Wegovy 美国说明书上的最高剂量（7.2 mg）');
      expect(zh, key).not.toMatch(/常见|\{/);
    }
    // The sheet itself asks nothing until a dose is typed; its text has no leftover placeholder.
    setUi({ sheet: 'dose' });
    const sheet = visibleText(html(english, createElement(Sheets, { profile: english, d })));
    setUi({ sheet: null });
    expect(sheet).not.toMatch(/highest dose|\{name\}/);
  });

  it('no wait is shown for a tablet whose label says "with or without food"', () => {
    const oral: Profile = { ...english, regimen: { drugId: 'orforglipron', brand: 'Foundayo', doseAmount: 2.5, doseUnit: 'mg', schedule: { kind: 'daily', time: '08:00' }, status: 'escalating' } };
    const pill: DoseEvent = { ...row(NOW - 5 * 60_000), drugId: 'orforglipron', amount: 2.5, unit: 'mg', site: null };
    const rec: Records = { ...records, doses: [pill] };
    const d = derive(oral, rec, NOW, TZ);
    expect(d.fastingUntil).toBeNull();
    expect(screens(oral, rec).today).not.toMatch(/Empty stomach|more minutes? before you eat/);
    setUi({ sheet: 'dose' });
    const sheet = visibleText(html(oral, createElement(Sheets, { profile: oral, d })));
    setUi({ sheet: null });
    expect(sheet).toContain('Log a pill');
    expect(sheet).not.toMatch(/do not eat or drink|small sip of water|minutes after your pill/);
  });

  it('nothing about an estimate is shown without a medication', () => {
    const none = screens({ ...english, regimen: null }, { ...records, doses: [] });
    expect(none.today).not.toContain(NO_ESTIMATE);
    expect(none.trends).not.toMatch(/Estimated medication level/);
  });
});

describe('launch build: notice and settings', () => {
  it('the notice is shown in setup, in settings, on Today and on the questions tab, in place of the older disclaimer', () => {
    expect(footNote('en')).toBe(NOTICE);
    const s = screens(english);
    for (const text of [s.today, s.me, s.questions]) {
      expect(text).toContain(NOTICE);
      expect(text).not.toContain('For information only.');
    }
    const setup = visibleText(renderToStaticMarkup(createElement(Onboarding, { existing: null })));
    expect(setup).toContain(NOTICE);
    expect(copyProblems(NOTICE)).toEqual([]);
  });

  it('settings no longer describe hidden features', () => {
    expect(screens(english).me).not.toMatch(/test version|coping cards|protein formula/i);
  });

  it('export comes right after the medication card in settings', () => {
    const me = screens(english).me;
    const order = ['Medication', 'Backup and export', 'Export backup', 'Export spreadsheet (CSV)', 'Restore from backup', 'Reminders', 'Display', 'About', 'Delete all data'].map((t) => me.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('launch build: setup', () => {
  const first = visibleText(renderToStaticMarkup(createElement(Onboarding, { existing: null })));

  it('starts in English with no language picker and no Chinese', () => {
    expect(first).toContain("Hi, I'm your GLP-1 companion");
    expect(first).not.toMatch(/Language|简体中文|繁體中文/);
    expect(copyProblems(first)).toEqual([]);
  });

  it('has five steps: the four from before and the three optional questions (the progress bar shows one mark per step)', () => {
    const page = renderToStaticMarkup(createElement(Onboarding, { existing: null }));
    expect(page.match(/<div class="progress">(.*?)<\/div>/)![1].match(/<span/g)).toHaveLength(5);
  });
});

describe('launch build: a profile that is already Chinese keeps working', () => {
  it('its screens are Chinese, with the launch rules applied', () => {
    const page = renderToStaticMarkup(createElement(Screens, { profile: chinese }));
    for (const s of ['今天', '趋势', '问医生', '我的', 'lang="zh-Hans"', '记一针']) expect(page, s).toContain(s);
    const s = screens(chinese);
    expect(s.me).toMatch(/English\s+简体中文/);
    expect(s.me).not.toContain('繁體中文');
    expect(s.today).toContain('请马上联系医生');
    for (const text of Object.values(s)) expect(text).not.toMatch(/蛋白|训练|应对|可以先试试|Today's log|Backup and export/);
    expect(alertText(chinese, { hits: [{ id: 'dehydration', level: 'urgent' }], rowId: null })).toMatch(/请马上联系医生[\s\S]*不是诊断/);
  });

  it('redoing setup stays Chinese and still offers English', () => {
    const redo = visibleText(renderToStaticMarkup(createElement(Onboarding, { existing: { ...chinese, onboardedAt: null } })));
    expect(redo).toContain('你好，我是你的 GLP-1 伴侣');
    expect(redo).toMatch(/English\s+简体中文/);
    expect(redo).not.toContain('繁體中文');
  });
});

describe('launch build: questions for the doctor', () => {
  beforeEach(async () => {
    await Promise.all([db.questions.clear(), db.symptoms.clear()]);
    setUi({ triage: null, toast: null });
  });

  it('a question is saved as typed and nothing else happens', async () => {
    await addQuestionFromList(english, 'Can I move my shot day to Sunday?');
    const saved = await db.questions.toArray();
    expect(saved.map((q) => q.text)).toEqual(['Can I move my shot day to Sunday?']);
    expect(saved[0].asked).toBe(false);
    expect(html(english, createElement(TriageModal, { profile: english }))).toBe('');
    expect(await db.symptoms.count()).toBe(0);
  });

  it('typed text is still checked for danger signs: the alert is shown, the question is kept, no symptom is logged', async () => {
    await addQuestionFromList(english, 'Is severe stomach pain going to my back normal?');
    expect((await db.questions.toArray()).map((q) => q.text)).toEqual(['Is severe stomach pain going to my back normal?']);
    const alert = visibleText(html(english, createElement(TriageModal, { profile: english })));
    expect(alert).toContain('Contact your doctor right away');
    // Nothing was logged, so the card does not say "What you logged".
    expect(alert).toContain('What you wrote can be a sign of a serious problem.');
    expect(alert).not.toContain('What you logged');
    expect(await db.symptoms.count()).toBe(0);
  });

  it('a general question that describes no symptom is saved and shows no alert', async () => {
    const asked = ['What are the signs of low blood sugar?', 'Can Zepbound cause pancreatitis?', 'My dad had chest pain last year, is this safe for him?'];
    for (const text of asked) {
      await addQuestionFromList(english, text);
      expect(html(english, createElement(TriageModal, { profile: english })), text).toBe('');
    }
    expect(await db.questions.count()).toBe(asked.length);
  });

  it('an ordinary question about an operation, birth control, pregnancy or breastfeeding is saved and shows no alert', async () => {
    const asked = ['Do I need to stop before surgery?', 'Can I take it with my birth control pill?', 'Can I get pregnant while taking this?', 'Is it safe while breastfeeding?'];
    for (const text of asked) {
      await addQuestionFromList(english, text);
      expect(html(english, createElement(TriageModal, { profile: english })), text).toBe('');
    }
    expect((await db.questions.toArray()).map((q) => q.text).sort()).toEqual([...asked].sort());
    expect(await db.symptoms.count()).toBe(0);
  });

  it('a row with a mild alert that came in with a backup shows no reminder on Today and no note in the spreadsheet', async () => {
    const restored = { ...row(NOW - 3_000_000), kind: 'other' as const, grade: 3, note: 'surgery next week', triageId: 'procedure' as const, triageLevel: 'remind' as const };
    const today = screens(english, { ...records, symptoms: [restored] }).today;
    expect(today).not.toContain('Contact your doctor right away');
    expect(today).not.toContain('See the alert again');
    await db.profile.clear();
    await db.profile.put(english);
    await db.symptoms.add(restored);
    expect((await buildCsv('en')).split('\n')).toContain('2026-11-20,11:10,America/New_York,Symptom,surgery next week,3,Grade 0–3,');
    await Promise.all([db.symptoms.clear(), db.profile.clear()]);
  });

  it('a crisis message shows the crisis card', async () => {
    await addQuestionFromList(english, 'I want to kill myself');
    const text = visibleText(html(english, createElement(TriageModal, { profile: english })));
    expect(text).toContain('You are not alone');
    expect(text).not.toContain('Contact your doctor right away');
  });
});

describe('launch build: the three optional setup questions', () => {
  const page = html(english, createElement(SetupQuestions, { answers: { timeOnMedication: '1_to_3_months', loggedBefore: null, heardFrom: null }, onChange: noop }));
  const text = visibleText(page);

  it('asks how long, what was used before and where the person heard about the app, with the listed choices', () => {
    for (const s of [
      'How long have you been on your medication?',
      'Not started yet', 'Less than 1 month', '1 to 3 months', '3 to 12 months', 'More than a year',
      'Before this app, how did you keep track of your medication?',
      'I did not keep track', 'Notes or a spreadsheet', 'Another tracker app', "The drug maker's app", 'Something else',
      'Where did you hear about this app?',
      'App store search', 'A friend or family member', 'An online community', 'A web search', 'Somewhere else',
    ]) expect(text, s).toContain(s);
    expect(page.match(/class="chip[ "]/g)).toHaveLength(15);
    // Only the given answer is marked. Nothing is chosen in advance.
    expect(page.match(/class="chip on"/g)).toHaveLength(1);
    expect(page).toContain('<button class="chip on" type="button">1 to 3 months</button>');
    expect(copyProblems(text)).toEqual([]);
  });

  it('is there in Chinese for a profile that is already Chinese', () => {
    const zh = visibleText(html(chinese, createElement(SetupQuestions, { answers: { timeOnMedication: null, loggedBefore: null, heardFrom: null }, onChange: noop })));
    for (const s of ['你用药多久了？', '不到 1 个月', '用这个应用之前，你怎么记用药？', '药厂的应用', '你是从哪里知道这个应用的？', '朋友或家人']) expect(zh, s).toContain(s);
    expect(zh).not.toMatch(/[A-Za-z]{4,}/);
  });
});

describe('launch build: weekly summary', () => {
  it('is the first card on Trends, with three numbers and no advice', () => {
    const trends = screens(english).trends.replace(/\s+/g, ' ');
    // Doses in the last seven days: four days ago and one hour ago. Monday is one of the seven days.
    expect(trends).toContain('Weekly summary Sat, Nov 14 to Fri, Nov 20 Doses logged 2 of 1 scheduled Weight change −5.3 lb Days with a symptom logged 1');
    expect(trends.indexOf('Weekly summary')).toBeLessThan(trends.indexOf('Estimated medication level'));
    const card = renderToStaticMarkup(createElement(I18nProvider, { lang: 'en', children: createElement(Trends, { profile: english, d: derive(english, records, NOW, TZ), rec: records, now: NOW }) })).match(/<section class="card weekly">.*?<\/section>/)![0];
    expect(visibleText(card)).not.toMatch(/should|try|good|great|well done|keep it up|on track|behind|missed|goal|lost|gained/i);
    expect(copyProblems(visibleText(card))).toEqual([]);
  });

  it('shows no weight change with fewer than two weigh-ins, and no "of N" without a schedule', () => {
    const few = screens(stopped, { ...records, weights: records.weights.slice(0, 1), symptoms: [] }).trends.replace(/\s+/g, ' ');
    expect(few).toContain('Doses logged 2 Weight change – Days with a symptom logged 0');
  });

  it('is in Chinese for a Chinese profile', () => {
    expect(screens(chinese).trends.replace(/\s+/g, ' ')).toContain('每周小结 11月14日 周六 至 11月20日 周五 记下的用药次数 2 次（计划 1 次） 体重变化 −4.8 斤 记了症状的天数 1');
  });
});

describe('launch build: Pro and anonymous counts', () => {
  it('settings have the Pro row, between Display and About', () => {
    const me = screens(english).me;
    const order = ['Display', 'Want Pro?', 'About'].map((t) => me.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('a build that was given no count address does not count: no screen, no setting, nothing sent', async () => {
    expect(import.meta.env.VITE_COUNT_URL).toBeUndefined();
    expect(countingOn).toBe(false);
    expect(screens(english).me).not.toMatch(/Usage counts|Share usage counts/);
    await db.profile.put(english);
    await syncCounts(true);
    // (That nothing was sent is checked for the whole file: any call to the network fails it.)
    await db.profile.clear();
  });
});

