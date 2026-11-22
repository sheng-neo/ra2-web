/**
 * Anonymous counting: the part that touches storage and the network.
 * What is counted, and what a message may contain, is decided in src/core/counts.ts.
 *
 * Rules this file keeps:
 * - Counting is on only in a build that has the `anonymousCounts` switch and was given the
 *   address of our server (VITE_COUNT_URL). Otherwise nothing is asked, queued or sent.
 * - Before the person says yes there is no id, nothing is queued and nothing is sent.
 * - A yes makes a random id on the phone. From then on the counts that are due are put in a
 *   small queue in IndexedDB and sent one at a time. A count that could not be sent stays in
 *   the queue and is tried again later.
 * - A no after a yes empties the queue, throws the id away and asks the server to delete
 *   everything stored under it. The request is repeated until the server confirms it.
 * - send() below is the only code in the launch build that opens a connection.
 *   scripts/check-launch.mjs fails the build if there is another one, and it knows this one by
 *   the options it sets (no cookies, no referrer), so keep them written as they are.
 */
import { version as APP_VERSION } from '../../package.json';
import { drugById } from '../core/catalog';
import { dueCounts, NO_PROGRESS, parseCountMessage, parseCountUrl, type CountFacts, type CountMessage, type MedicationForm } from '../core/counts';
import type { Profile } from '../core/types';
import { db, deviceTz } from './db';
import { features } from './features';
import { BLANK_INSTALL, installDb, readInstall, type InstallState } from './installDb';

/** The address the build was given, if any. vite.config.ts has already refused a malformed one. */
const GIVEN_URL: string | undefined = import.meta.env.VITE_COUNT_URL;

/**
 * Whether this build counts at all: it has the switch and it was given an address. When this
 * is false, nothing in this file does anything. Both parts are fixed when the bundle is built,
 * so a build that does not count carries no code that can send.
 */
export const countingOn: boolean = features.anonymousCounts && !!GIVEN_URL;

/** Where counts are sent. */
const COUNT_URL: string = countingOn ? (parseCountUrl(GIVEN_URL) ?? '') : '';

/** A change is counted this long after it was made, so a log entry that is undone right away is not counted. */
export const SETTLE_MS = 6000;
const TIMEOUT_MS = 10_000;
const RETRY_FIRST_MS = 60_000;
const RETRY_MAX_MS = 3_600_000;
const MAX_QUEUE = 100;

// ── Answers and taps ─────────────────────────────────────────────────────────

/** Applies an answer to "share anonymous counts?" to the saved state. Returns whether the queue must be emptied. */
function applyConsent(s: InstallState, yes: boolean): boolean {
  if (yes) {
    if (s.countsConsent === true && s.installId) return false;
    s.countsConsent = true;
    s.installId = crypto.randomUUID();
    s.progress = { ...NO_PROGRESS };
    return false;
  }
  // The id is thrown away. What the server holds under it is deleted (see flush).
  if (s.installId) s.pendingDeletes = [...s.pendingDeletes, s.installId];
  s.countsConsent = false;
  s.installId = null;
  s.progress = { ...NO_PROGRESS };
  s.proCountedAt = null;
  return true;
}

/**
 * Called when setup is finished. Remembers when setup was first finished on this phone and,
 * if the consent screen was shown, the answer given there (`consent` is null when it was not).
 */
export async function setupFinished(nowMs: number, consent: boolean | null): Promise<void> {
  const idb = installDb();
  await idb.transaction('rw', idb.state, idb.queue, async () => {
    const s = await readInstall();
    if (s.setupDoneAt === null) s.setupDoneAt = nowMs;
    if (consent !== null && applyConsent(s, consent)) await idb.queue.clear();
    await idb.state.put(s);
  });
}

/** Whether this phone has already answered "share anonymous counts?". */
export async function countsAnswered(): Promise<boolean> {
  return (await readInstall()).countsConsent !== null;
}

/** The setting: turns sharing on or off. Turning it off also starts the delete request. */
export async function setCountsConsent(yes: boolean): Promise<void> {
  if (!countingOn) return;
  const idb = installDb();
  await idb.transaction('rw', idb.state, idb.queue, async () => {
    const s = await readInstall();
    if (applyConsent(s, yes)) await idb.queue.clear();
    await idb.state.put(s);
  });
  await syncCounts(true);
}

/**
 * "I would want this" was tapped. The tap is remembered on the phone either way. It is counted
 * only if counts are being shared at this moment; a tap made while sharing is off is never sent,
 * not even if sharing is turned on later.
 */
export async function tapWantsPro(nowMs: number): Promise<void> {
  const idb = installDb();
  await idb.transaction('rw', idb.state, async () => {
    const s = await readInstall();
    if (s.proTappedAt === null) s.proTappedAt = nowMs;
    if (countingOn && s.countsConsent === true && s.proCountedAt === null) s.proCountedAt = nowMs;
    await idb.state.put(s);
  });
  await syncCounts(true);
}

// ── Queue ────────────────────────────────────────────────────────────────────

function medicationForm(p: Profile): MedicationForm | null {
  if (!p.regimen) return null;
  return drugById(p.regimen.drugId).route === 'oral' ? 'pill' : 'injection';
}

/** Puts the counts that are due in the queue. Does nothing unless the answer is yes. */
async function queueDue(nowMs: number): Promise<void> {
  const profile = await db.profile.get('me');
  // No profile, or setup is being redone: nothing new is counted until setup is finished.
  if (!profile || profile.onboardedAt === null) return;
  const onboardedAt = profile.onboardedAt;
  const doses = (await db.doses.toArray()).filter((d) => d.deletedAt === null).map((d) => ({ createdAt: d.createdAt, occurredAt: d.occurredAt, source: d.source }));
  const idb = installDb();
  await idb.transaction('rw', idb.state, idb.queue, async () => {
    const s = await idb.state.get('me');
    if (!s || s.countsConsent !== true || !s.installId) return;
    const installId = s.installId;
    // A phone that finished setup before this state existed: the profile's own time is the best there is.
    const setupDoneAt = s.setupDoneAt ?? onboardedAt;
    const facts: CountFacts = {
      nowMs,
      tz: deviceTz(),
      dayStartHour: profile.dayStartHour,
      setupDoneAt,
      answers: profile.setupAnswers,
      form: medicationForm(profile),
      schedule: profile.regimen?.schedule ?? null,
      status: profile.regimen?.status ?? null,
      doses,
      wantsProAt: s.proCountedAt,
    };
    const { events, progress } = dueCounts(facts, s.progress);
    // Every message is checked against the exact shape the server accepts before it is queued.
    const messages = events.map((e) => parseCountMessage({ installId, appVersion: APP_VERSION, ...e })).filter((m): m is CountMessage => m !== null);
    await idb.queue.bulkAdd(messages.map((message) => ({ message })));
    await idb.state.put({ ...s, setupDoneAt, progress });
    // The queue stays small even if the server cannot be reached for a long time: the oldest go first.
    const extra = (await idb.queue.count()) - MAX_QUEUE;
    if (extra > 0) await idb.queue.bulkDelete(await idb.queue.orderBy(':id').limit(extra).primaryKeys());
  });
}

// ── Sending ──────────────────────────────────────────────────────────────────

/**
 * The one place that opens a connection. It sends the given text and nothing else: no cookies,
 * and no address of the page it was sent from. Returns the status, or null if nothing came back.
 */
async function send(method: 'POST' | 'DELETE', url: string, body?: string): Promise<number | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      body,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: abort.signal,
    });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const accepted = (status: number | null) => status !== null && status >= 200 && status < 300;
/** The server read the message and will never take it; trying again cannot help. Any other failure is tried again. */
const refused = (status: number | null) => status === 400 || status === 413 || status === 415 || status === 422;

let failures = 0;
let retryAt = 0;

/**
 * Sends what is waiting: delete requests first, then the queue in order. A delete request that
 * fails does not hold up the queue (the queue belongs to another id). The queue stops at its
 * first failure, so messages always arrive in order. Whatever failed is tried again later.
 */
async function flush(nowMs: number, force: boolean): Promise<void> {
  if (!force && nowMs < retryAt) return;
  const idb = installDb();
  let deleteFailed = false;
  let failed = false;

  for (const id of (await readInstall()).pendingDeletes) {
    if (accepted(await send('DELETE', `${COUNT_URL}/${id}`))) {
      await idb.transaction('rw', idb.state, async () => {
        const s = await idb.state.get('me');
        if (s) await idb.state.put({ ...s, pendingDeletes: s.pendingDeletes.filter((x) => x !== id) });
      });
    } else deleteFailed = true;
  }

  while (!failed) {
    const next = await idb.queue.orderBy(':id').first();
    if (!next || next.seq === undefined) break;
    // The answer is read again before every send: after a no, nothing more goes out.
    const s = await readInstall();
    if (s.countsConsent !== true || next.message.installId !== s.installId) {
      await idb.queue.delete(next.seq);
      continue;
    }
    const status = await send('POST', COUNT_URL, JSON.stringify(next.message));
    if (accepted(status) || refused(status)) await idb.queue.delete(next.seq);
    else failed = true;
  }

  if (failed || deleteFailed) {
    failures += 1;
    retryAt = Date.now() + Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** (failures - 1));
  } else {
    failures = 0;
    retryAt = 0;
  }
}

let chain: Promise<void> = Promise.resolve();

/**
 * Queues the counts that are due and sends what is waiting. Runs are lined up one after the
 * other. `force` skips the wait after an earlier failure; it is used when the person has just
 * changed the setting, so a delete request goes out at once.
 */
export function syncCounts(force = false): Promise<void> {
  if (!countingOn) return Promise.resolve();
  chain = chain
    .then(async () => {
      await queueDue(Date.now());
      await flush(Date.now(), force);
    })
    .catch(() => undefined);
  return chain;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Counts a change once it has settled (see SETTLE_MS). */
export function countSoon(): void {
  if (!countingOn) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncCounts(), SETTLE_MS);
}

let started = false;

/**
 * Called once when the app starts. Sends what is waiting, and from then on looks again when a
 * dose or the profile changes, when the app comes back to the front, and when the phone is
 * online again.
 */
export function startCounting(): void {
  if (!countingOn || started) return;
  started = true;
  // The hooks only start a timer. They must return nothing: a return value would change the row.
  for (const table of [db.doses, db.profile]) {
    table.hook('creating', () => {
      countSoon();
    });
    table.hook('updating', () => {
      countSoon();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncCounts();
  });
  window.addEventListener('online', () => void syncCounts(true));
  void syncCounts();
}

// ── Delete all data ──────────────────────────────────────────────────────────

/**
 * Part of "Delete all data": forgets everything this install knows about itself. If counts
 * were shared, the server is asked to delete them too. A delete request that does not get
 * through is the one thing kept, so it can be sent again the next time the app is opened.
 *
 * The order matters. Counting is stopped first, the same way as a "no" in settings: the answer
 * becomes no, the queue is emptied, and a change that is still settling is not counted. Only
 * then, and only after a run that is still sending has ended, does the delete request go out.
 * So no count can be queued or sent after the request, and nothing is left on the server under
 * an id the phone has forgotten.
 */
export async function wipeInstall(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const idb = installDb();
  await idb.transaction('rw', idb.state, idb.queue, async () => {
    const s = await readInstall();
    applyConsent(s, false);
    await idb.queue.clear();
    await idb.state.put(s);
  });
  const run = chain.then(async () => {
    // Read again: a run that was under way may already have had some of these confirmed.
    let left = (await readInstall()).pendingDeletes;
    if (countingOn) {
      for (const id of [...left]) if (accepted(await send('DELETE', `${COUNT_URL}/${id}`))) left = left.filter((x) => x !== id);
    } else left = [];
    await idb.delete();
    await idb.open();
    if (left.length) await idb.state.put({ ...BLANK_INSTALL, pendingDeletes: left });
  });
  // Anything that asks to count from here on waits for the wipe, and then finds nothing to count.
  chain = run.catch(() => undefined);
  await run;
}

/** For tests: forgets the wait after a failure. */
export function resetCountRetry(): void {
  failures = 0;
  retryAt = 0;
}
