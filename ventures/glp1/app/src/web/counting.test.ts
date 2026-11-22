/**
 * Anonymous counting, tested as the launch build with a count address: this file runs with
 * VITE_BUILD_PROFILE=launch and VITE_COUNT_URL set, so the code under test is what such a build
 * ships. The definitions themselves are tested in src/core/counts.test.ts, the server in
 * server/count.test.ts.
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const URL = 'https://counts.test/api/count';
vi.hoisted(() => {
  vi.stubEnv('VITE_BUILD_PROFILE', 'launch');
  vi.stubEnv('VITE_COUNT_URL', 'https://counts.test/api/count/');
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { version as APP_VERSION } from '../../package.json';
import { COUNT_EVENT_NAMES, parseCountMessage } from '../core/counts';
import type { DoseEvent, Profile } from '../core/types';
import { CountsCard, CountsChoice, CountsExplainer } from './components/Counts';
import { ProCard } from './components/ProCard';
import { copyProblems } from './copyRules';
import { countingOn, countsAnswered, resetCountRetry, setCountsConsent, setupFinished, syncCounts, tapWantsPro, wipeInstall } from './counting';
import { db } from './db';
import { derive } from './derive';
import { I18nProvider, translate, en, hans } from './i18n';
import { installDb, readInstall } from './installDb';
import { Me } from './screens/Me';
import { Onboarding } from './screens/Onboarding';

const DAY = 86_400_000;
/** Local noon-ish times, so a test never sits on a day boundary whatever the machine's time zone is. */
const SETUP = new Date(2026, 2, 2, 10, 0, 0).getTime();
const at = (day: number, hour = 12) => new Date(2026, 2, 2 + day, hour, 0, 0).getTime();

const profile: Profile = {
  id: 'me',
  lang: 'en',
  script: 'hans',
  region: 'US',
  weightUnit: 'lb',
  heightCm: null,
  startWeightKg: 90.72,
  goalWeightKg: 77.11,
  birthYear: null,
  dayStartHour: 4,
  tz: 'America/New_York',
  safety: { kidneyOrLiver: false, pregnancy: false, insulinOrSU: false, eatingDisorder: false, under18: false },
  proteinMode: 'auto',
  proteinManualG: null,
  aiConsent: null,
  regimen: { drugId: 'tirzepatide', brand: 'Zepbound', doseAmount: 5, doseUnit: 'mg', schedule: { kind: 'weekly', weekday: 1, time: '21:00' }, status: 'escalating', weeksOnDoseAtStart: 3 },
  onboardedAt: SETUP,
  largeText: false,
  setupAnswers: { timeOnMedication: '1_to_3_months', loggedBefore: 'tracker_app', heardFrom: null },
};
let n = 0;
const dose = (createdAt: number, source: DoseEvent['source'] = 'manual'): DoseEvent => ({ id: `d${++n}`, createdAt, updatedAt: createdAt, deletedAt: null, occurredAt: createdAt, tz: 'America/New_York', source, drugId: 'tirzepatide', amount: 5, unit: 'mg', site: 'thigh_l' });

interface Call {
  method: string;
  url: string;
  body: unknown;
  init: RequestInit;
}
const calls: Call[] = [];
/** What the pretend server answers: a status, or null for "could not be reached". */
let answer: (call: Call) => number | null = () => 204;
/** While set, the pretend server holds every answer back until this is settled (a slow connection). */
let hold: Promise<void> | null = null;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const call: Call = { method: init.method ?? 'GET', url, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, init };
  calls.push(call);
  if (hold) await hold;
  const status = answer(call);
  if (status === null) throw new TypeError('network down');
  return new Response(null, { status });
});
const posts = () => calls.filter((c) => c.method === 'POST').map((c) => c.body as Record<string, unknown>);
const deletes = () => calls.filter((c) => c.method === 'DELETE').map((c) => c.url);
const queued = async () => (await installDb().queue.toArray()).map((q) => q.message.event);

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await Promise.all([db.profile.clear(), db.doses.clear()]);
  await installDb().delete();
  await installDb().open();
  calls.length = 0;
  fetchMock.mockClear();
  answer = () => 204;
  hold = null;
  resetCountRetry();
  vi.setSystemTime(SETUP);
});

/** Finishes setup as the last setup screen does, with the given answer to "share anonymous counts?". */
async function finishSetup(consent: boolean | null, p: Profile = profile): Promise<void> {
  await setupFinished(SETUP, consent);
  await db.profile.put(p);
  await db.doses.add(dose(SETUP + 1000, 'import')); // the last dose that setup asks about
}

describe('this build counts', () => {
  it('because it is the launch profile and was given an address', () => {
    expect(countingOn).toBe(true);
  });
});

describe('before a yes', () => {
  it('nothing is queued or sent while the question has not been answered', async () => {
    await finishSetup(null);
    await db.doses.add(dose(at(1)));
    vi.setSystemTime(at(1, 13));
    await syncCounts();
    await tapWantsPro(Date.now());
    await syncCounts(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await queued()).toEqual([]);
    const s = await readInstall();
    expect([s.countsConsent, s.installId, s.proCountedAt]).toEqual([null, null, null]);
    expect(await countsAnswered()).toBe(false);
  });

  it('"Do not share" sends nothing, through setup and logged doses, and makes no id', async () => {
    await finishSetup(false);
    await syncCounts();
    for (const day of [1, 8, 15, 22]) {
      await db.doses.add(dose(at(day)));
      vi.setSystemTime(at(day, 13));
      await syncCounts(true);
    }
    await db.profile.update('me', { regimen: { ...profile.regimen!, status: 'stopped' } });
    await tapWantsPro(Date.now());
    await syncCounts(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await queued()).toEqual([]);
    const s = await readInstall();
    expect([s.countsConsent, s.installId, s.pendingDeletes]).toEqual([false, null, []]);
    expect(await countsAnswered()).toBe(true);
  });
});

describe('after a yes', () => {
  it('sends "setup finished" with the answers and the form, and nothing about the medication', async () => {
    await finishSetup(true);
    await syncCounts();
    const { installId } = await readInstall();
    expect(installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(posts()).toEqual([{ installId, appVersion: APP_VERSION, event: 'setup_finished', day: 0, timeOnMedication: '1_to_3_months', loggedBefore: 'tracker_app', heardFrom: null, form: 'injection' }]);
    expect(calls[0].url).toBe(URL);
    expect(await queued()).toEqual([]);
  });

  it('sends the text of the message and nothing else: no cookies, no page address, one header', async () => {
    await finishSetup(true);
    await syncCounts();
    const { init } = calls[0];
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.cache).toBe('no-store');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(Object.keys(init).sort()).toEqual(['body', 'cache', 'credentials', 'headers', 'method', 'referrerPolicy', 'signal']);
  });

  it('a pill and a skipped medication are told apart from an injection', async () => {
    await finishSetup(true, { ...profile, regimen: { drugId: 'semaglutide-oral-wl', brand: 'Wegovy pill', doseAmount: 4, doseUnit: 'mg', schedule: { kind: 'daily', time: '08:00' }, status: 'escalating' }, setupAnswers: undefined });
    await syncCounts();
    expect(posts()[0]).toMatchObject({ event: 'setup_finished', form: 'pill', timeOnMedication: null, loggedBefore: null, heardFrom: null });
    await setCountsConsent(false);
    calls.length = 0;
    await db.profile.put({ ...profile, regimen: null });
    await setCountsConsent(true);
    expect(posts()[0]).toMatchObject({ event: 'setup_finished', form: null });
  });

  it('a new dose in the first days sends "activated" and the first week; the dose from setup does not', async () => {
    await finishSetup(true);
    vi.setSystemTime(at(0, 18));
    await syncCounts();
    expect(posts().map((b) => b.event)).toEqual(['setup_finished']);
    await db.doses.add(dose(at(2)));
    vi.setSystemTime(at(2, 13));
    await syncCounts();
    const { installId } = await readInstall();
    expect(posts().slice(1)).toEqual([
      { installId, appVersion: APP_VERSION, event: 'activated', day: 2 },
      { installId, appVersion: APP_VERSION, event: 'logged_week', day: 2, week: 1, logged: true },
    ]);
  });

  it('a dose that was deleted again (undo) is not counted', async () => {
    await finishSetup(true);
    const d = dose(at(1));
    await db.doses.add(d);
    await db.doses.update(d.id, { deletedAt: at(1) + 2000 });
    vi.setSystemTime(at(1, 13));
    await syncCounts();
    expect(posts().map((b) => b.event)).toEqual(['setup_finished']);
  });

  it('over four weeks it sends every listed event, each with only its listed fields', async () => {
    await finishSetup(true);
    await syncCounts();
    for (const day of [1, 8, 15]) {
      await db.doses.add(dose(at(day)));
      vi.setSystemTime(at(day, 13));
      await syncCounts(true);
    }
    await tapWantsPro(Date.now());
    vi.setSystemTime(at(29));
    await db.profile.update('me', { regimen: { ...profile.regimen!, status: 'paused' } });
    await syncCounts(true);
    const bodies = posts();
    expect(bodies.map((b) => b.event)).toEqual(['setup_finished', 'activated', 'logged_week', 'logged_week', 'week2_active', 'logged_week', 'four_week_streak', 'wants_pro', 'logged_week', 'paused_or_stopped']);
    expect(new Set(bodies.map((b) => b.event))).toEqual(new Set(COUNT_EVENT_NAMES));
    const { installId } = await readInstall();
    const fields: Record<string, string[]> = { setup_finished: ['timeOnMedication', 'loggedBefore', 'heardFrom', 'form'], logged_week: ['week', 'logged'] };
    for (const b of bodies) {
      expect(Object.keys(b).sort(), String(b.event)).toEqual(['installId', 'appVersion', 'event', 'day', ...(fields[String(b.event)] ?? [])].sort());
      expect(b.installId).toBe(installId);
      expect(b.appVersion).toBe(APP_VERSION);
      // The server would accept it exactly as sent.
      expect(parseCountMessage(b)).toEqual(b);
    }
    // Nothing that was logged or typed is in any message, and no time zone, locale or timestamp.
    const sent = JSON.stringify(bodies);
    for (const secret of ['tirzepatide', 'Zepbound', 'thigh', 'mg', '90.72', 'America', 'New_York', 'en-US', '2026', String(SETUP).slice(0, 6)]) expect(sent, secret).not.toContain(secret);
    for (const b of bodies) for (const v of Object.values(b)) if (typeof v === 'number') expect(v).toBeLessThan(100);
  });
});

describe('when a count cannot be sent', () => {
  it('it stays in the queue, in order, and goes out later', async () => {
    await finishSetup(true);
    answer = () => null;
    await syncCounts();
    await db.doses.add(dose(at(1)));
    vi.setSystemTime(at(1, 13));
    await syncCounts(true);
    expect(await queued()).toEqual(['setup_finished', 'activated', 'logged_week']);
    // The server is back.
    calls.length = 0;
    answer = () => 204;
    await syncCounts(true);
    expect(posts().map((b) => b.event)).toEqual(['setup_finished', 'activated', 'logged_week']);
    expect(await queued()).toEqual([]);
  });

  it('it waits before trying again instead of asking over and over', async () => {
    await finishSetup(true);
    answer = () => 503;
    await syncCounts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await syncCounts();
    await syncCounts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(SETUP + 61_000);
    await syncCounts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Two failures in a row: the wait is longer now.
    vi.setSystemTime(SETUP + 61_000 + 61_000);
    await syncCounts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(SETUP + 61_000 + 121_000);
    answer = () => 204;
    await syncCounts();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await queued()).toEqual([]);
  });

  it('a message the server refuses as malformed is dropped; any other failure keeps it', async () => {
    await finishSetup(true);
    for (const status of [401, 403, 404, 408, 429, 500, 502]) {
      answer = () => status;
      await syncCounts(true);
      expect(await queued(), String(status)).toEqual(['setup_finished']);
    }
    answer = () => 400;
    await syncCounts(true);
    expect(await queued()).toEqual([]);
  });
});

describe('turning it off', () => {
  it('sends a delete request for the id, empties the queue and forgets the id', async () => {
    await finishSetup(true);
    answer = (c) => (c.method === 'POST' ? null : 204);
    await syncCounts();
    const { installId } = await readInstall();
    expect(await queued()).toEqual(['setup_finished']);
    calls.length = 0;
    await setCountsConsent(false);
    expect(deletes()).toEqual([`${URL}/${installId}`]);
    expect(calls.filter((c) => c.method === 'DELETE')[0].body).toBeUndefined();
    expect(posts()).toEqual([]);
    expect(await queued()).toEqual([]);
    const s = await readInstall();
    expect([s.countsConsent, s.installId, s.pendingDeletes, s.progress.setupSent]).toEqual([false, null, [], false]);
  });

  it('after that nothing more is sent, whatever is logged', async () => {
    await finishSetup(true);
    await syncCounts();
    await setCountsConsent(false);
    calls.length = 0;
    for (const day of [1, 8, 15]) {
      await db.doses.add(dose(at(day)));
      vi.setSystemTime(at(day, 13));
      await syncCounts(true);
    }
    await tapWantsPro(Date.now());
    expect(calls).toEqual([]);
    expect(await queued()).toEqual([]);
  });

  it('a delete request that does not get through is kept and sent again until the server confirms it', async () => {
    await finishSetup(true);
    await syncCounts();
    const { installId } = await readInstall();
    answer = () => null;
    await setCountsConsent(false);
    expect((await readInstall()).pendingDeletes).toEqual([installId]);
    answer = () => 500;
    await syncCounts(true);
    expect((await readInstall()).pendingDeletes).toEqual([installId]);
    answer = () => 204;
    await syncCounts(true);
    expect((await readInstall()).pendingDeletes).toEqual([]);
    expect(deletes()).toEqual([`${URL}/${installId}`, `${URL}/${installId}`, `${URL}/${installId}`]);
  });

  it('turning it on again makes a new id, and the old one is still deleted', async () => {
    await finishSetup(true);
    await syncCounts();
    const first = (await readInstall()).installId;
    answer = (c) => (c.method === 'DELETE' ? null : 204);
    await setCountsConsent(false);
    calls.length = 0;
    await setCountsConsent(true);
    const second = (await readInstall()).installId;
    expect(second).not.toBe(first);
    expect(posts().map((b) => [b.event, b.installId])).toEqual([['setup_finished', second]]);
    expect(deletes()).toEqual([`${URL}/${first}`]);
    answer = () => 204;
    await syncCounts(true);
    expect((await readInstall()).pendingDeletes).toEqual([]);
  });

  it('saying yes twice keeps the same id', async () => {
    await finishSetup(true);
    const first = (await readInstall()).installId;
    await setCountsConsent(true);
    expect((await readInstall()).installId).toBe(first);
    expect(posts().map((b) => b.event)).toEqual(['setup_finished']);
  });
});

describe('redoing setup', () => {
  it('keeps the time setup was first finished and the answer already given', async () => {
    await finishSetup(true);
    await syncCounts();
    const before = await readInstall();
    vi.setSystemTime(at(5));
    // The screen was not shown again, so there is no new answer.
    await setupFinished(at(5), null);
    await db.profile.put({ ...profile, onboardedAt: at(5) });
    await db.doses.add(dose(at(5) + 1000));
    vi.setSystemTime(at(5, 13));
    await syncCounts();
    const after = await readInstall();
    expect([after.setupDoneAt, after.installId, after.countsConsent]).toEqual([before.setupDoneAt, before.installId, true]);
    // The new dose was logged on day 5 since the first setup, not day 0 since the second.
    expect(posts().map((b) => [b.event, b.day])).toEqual([['setup_finished', 0], ['activated', 5], ['logged_week', 5]]);
  });
});

describe('"I would want this"', () => {
  it('is counted when counts are shared', async () => {
    await finishSetup(true);
    await syncCounts();
    vi.setSystemTime(at(3));
    await tapWantsPro(Date.now());
    await tapWantsPro(Date.now());
    expect(posts().filter((b) => b.event === 'wants_pro')).toEqual([{ installId: (await readInstall()).installId, appVersion: APP_VERSION, event: 'wants_pro', day: 3 }]);
  });

  it('a tap made while sharing is off is remembered on the phone and never sent, not even after a later yes', async () => {
    await finishSetup(false);
    await tapWantsPro(at(1));
    expect((await readInstall()).proTappedAt).toBe(at(1));
    await setCountsConsent(true);
    vi.setSystemTime(at(40));
    await syncCounts(true);
    expect(posts().map((b) => b.event)).toEqual(['setup_finished']);
  });
});

describe('"Delete all data"', () => {
  it('asks the server to delete the counts and forgets everything about this install', async () => {
    await finishSetup(true);
    await syncCounts();
    const { installId } = await readInstall();
    await wipeInstall();
    expect(deletes()).toEqual([`${URL}/${installId}`]);
    expect(await installDb().state.count()).toBe(0);
    expect(await installDb().queue.count()).toBe(0);
  });

  it('keeps only a delete request that did not get through, and sends it the next time', async () => {
    await finishSetup(true);
    await syncCounts();
    const { installId } = await readInstall();
    answer = () => null;
    await wipeInstall();
    const s = await readInstall();
    expect(s).toMatchObject({ countsConsent: null, installId: null, setupDoneAt: null, pendingDeletes: [installId] });
    answer = () => 204;
    await syncCounts(true);
    expect((await readInstall()).pendingDeletes).toEqual([]);
  });

  it('sends nothing when counts were never shared', async () => {
    await finishSetup(false);
    await wipeInstall();
    expect(calls).toEqual([]);
  });

  it('nothing is counted after the delete request, even when a dose was logged a moment before and the server is slow', async () => {
    await finishSetup(true);
    await syncCounts();
    const { installId } = await readInstall();
    calls.length = 0;
    // A new dose: "activated" and "logged this week" are due, but not queued yet (the change is still settling).
    await db.doses.add(dose(at(1)));
    vi.setSystemTime(at(1, 13));
    let release!: () => void;
    hold = new Promise<void>((resolve) => (release = resolve));
    const wiping = wipeInstall();
    // What the settle timer, or the app coming back to the front, would start while the delete request is on its way.
    const counting = syncCounts();
    await new Promise((resolve) => setTimeout(resolve, 30));
    release();
    await Promise.all([wiping, counting]);
    hold = null;
    await syncCounts(true);
    expect(posts()).toEqual([]);
    expect(deletes()).toEqual([`${URL}/${installId}`]);
    expect(await queued()).toEqual([]);
    const s = await readInstall();
    expect([s.countsConsent, s.installId, s.pendingDeletes]).toEqual([null, null, []]);
  });

  it('a run that is still sending ends before the delete request goes out', async () => {
    await finishSetup(true);
    await db.doses.add(dose(at(1)));
    vi.setSystemTime(at(1, 13));
    let release!: () => void;
    hold = new Promise<void>((resolve) => (release = resolve));
    // The first count is on its way when "Delete all data" is tapped.
    const counting = syncCounts();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const { installId } = await readInstall();
    const wiping = wipeInstall();
    await new Promise((resolve) => setTimeout(resolve, 30));
    release();
    await Promise.all([counting, wiping]);
    hold = null;
    // One count had left before the tap. Nothing follows it except the delete request, which comes last.
    expect(calls.map((c) => c.method)).toEqual(['POST', 'DELETE']);
    expect(deletes()).toEqual([`${URL}/${installId}`]);
    expect(await installDb().state.count()).toBe(0);
  });
});

describe('screens', () => {
  const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(I18nProvider, { lang: 'en', children: el }));
  const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

  it('setup has six steps: the consent screen is the last one', () => {
    const page = renderToStaticMarkup(createElement(Onboarding, { existing: null }));
    expect(page.match(/<div class="progress">(.*?)<\/div>/)![1].match(/<span/g)).toHaveLength(6);
  });

  it('the two answers are two buttons of the same kind, and neither is marked as chosen or preferred', () => {
    const page = html(createElement(CountsChoice, { onAnswer: () => undefined }));
    const buttons = [...page.matchAll(/<button class="([^"]*)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
    expect(buttons).toEqual([
      ['btn block', 'Share usage counts'],
      ['btn block', 'Do not share'],
    ]);
    expect(page).not.toMatch(/primary|checked|selected|aria-pressed|autofocus/i);
  });

  it('the explanation lists what is sent, one line for each thing a message can carry', () => {
    const page = text(html(createElement(CountsExplainer)));
    for (const line of [
      'A random ID made on this phone, and the app version',
      'Your answers to the three setup questions, if you gave any',
      'Whether your medication is a shot or a pill',
      'Whether you logged a dose in the first 8 days after setup',
      'For each week after that, the week number and whether you logged a dose (yes or no)',
      'Whether you logged a dose in your second week',
      'Whether you kept logging your doses for four weeks',
      'Whether you marked your medication as paused or stopped',
      'Whether you tapped "I would want this" about Pro',
      'the number of days since you finished setup',
    ]) expect(page, line).toContain(line);
    expect(html(createElement(CountsExplainer)).match(/<li/g)).toHaveLength(10);
    expect(page).toContain('The phone sends no date and no time of day');
    expect(page).toContain('The counts never include the name of your medication, your dose, your weight, your symptoms, your questions, your time zone or your language.');
    // The server stores the date a count arrived (server/count.ts), so the screen says so and does not promise "no dates".
    expect(page).toContain('Our server notes the date each count arrives, but not the time of day.');
    expect(page).not.toMatch(/No dates and no times|or any date or time/);
    expect(page).toContain('We do not sell these counts, and we do not share them with other companies.');
    // What the browser adds to any request by itself is named too, with what the server does about it.
    expect(page).toContain("a count also shows the receiving server your phone's network address, the kind of phone and browser you use, and its language setting. Our server does not store these with the counts.");
    expect(page).toContain('The app works the same either way.');
    expect(copyProblems(page)).toEqual([]);
  });

  it('the wording makes none of the claims the copy rules forbid', () => {
    for (const k of Object.keys(en).filter((key) => /^(counts\.|me\.counts\.|pro\.|me\.pro\.|onb\.about\.|weekly\.|toast\.counts\.)/.test(key)) as (keyof typeof en)[]) {
      const s = translate('en', k);
      expect(copyProblems(s), k).toEqual([]);
      expect(s, k).not.toMatch(/HIPAA|stays? in the US|on your phone only|never leaves|doctor-reviewed|guarantee/i);
      // The Chinese text exists and is Chinese.
      expect(hans[k], k).toBeTruthy();
    }
  });

  it('settings have the setting, off until a yes, and the Pro row', () => {
    const d = derive(profile, { doses: [], foods: [], weights: [], symptoms: [], workouts: [] }, SETUP, 'America/New_York');
    const me = text(html(createElement(Me, { profile, d, onRedoSetup: () => undefined })));
    const order = ['Medication', 'Backup and export', 'Reminders', 'Display', 'Want Pro?', 'Usage counts', 'Share usage counts', 'Off. No counts are sent.', 'See what is sent', 'About', 'Delete all data'].map((s) => me.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const card = html(createElement(CountsCard));
    expect(card).toContain('type="checkbox"');
    expect(card).not.toContain('checked');
    // The random ID is shown only while sharing is on; there is none to show here.
    expect(card).not.toContain('Your random ID');
    expect(translate('en', 'me.counts.id', { id: 'abc' })).toBe('Your random ID: abc');
    expect(copyProblems(me)).toEqual([]);
  });

  it('the Pro row promises nothing', () => {
    const row = text(html(createElement(ProCard)));
    expect(row).toContain('Want Pro?');
    for (const k of ['pro.sheet.body', 'pro.sheet.ask', 'pro.sheet.want', 'pro.sheet.thanks', 'pro.sheet.counted', 'pro.sheet.notCounted'] as const) {
      expect(translate('en', k), k).not.toMatch(/\$|price|per (month|year)|soon|coming|will (include|have|get)|feature|unlock(s|ed)? [a-z]+ (report|sync|plan)/i);
    }
    expect(translate('en', 'pro.sheet.body')).toBe('Pro is not available yet. There is nothing to buy.');
    expect(translate('en', 'pro.sheet.want')).toBe('I would want this');
  });
});

describe('the time is never sent', () => {
  it('a message carries day numbers, not the moment it was made', async () => {
    await finishSetup(true);
    await db.doses.add(dose(at(1)));
    vi.setSystemTime(at(1, 13));
    await syncCounts();
    for (const b of posts()) for (const v of Object.values(b)) expect(typeof v === 'number' ? v < DAY : true).toBe(true);
  });
});
