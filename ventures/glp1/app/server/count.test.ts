import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DELETED_ID_MEMORY_MS, fileCountStore, MAX_COUNT_BODY, memoryCountStore, pruneCounts, utcDay, type CountStore, type StoredCount } from './count';
import { countOptionsFromEnv, createApp } from './index';

const ID_A = '3f2b8c1e-7a4d-4e9b-a1c6-0d5e8f7a9b2c';
const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const NOW = Date.UTC(2026, 10, 22, 15, 30, 12);
const common = { installId: ID_A, appVersion: '0.0.1', day: 3 };
const setup = { ...common, event: 'setup_finished', day: 0, timeOnMedication: 'under_1_month', loggedBefore: 'drug_maker_app', heardFrom: null, form: 'pill' };
const everyKind = [
  setup,
  { ...common, event: 'activated' },
  { ...common, event: 'logged_week', week: 1, logged: true },
  { ...common, event: 'week2_active', day: 9 },
  { ...common, event: 'four_week_streak', day: 17 },
  { ...common, event: 'paused_or_stopped', day: 40 },
  { ...common, event: 'wants_pro', day: 5 },
];

function appWith(store: CountStore, extra: { allowOrigin?: string; limitPerMinute?: number } = {}) {
  return createApp({ client: null, counts: { store, now: () => NOW, ...extra } });
}
/** A request as a browser would send it, with the headers that say who is sending. */
const post = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (iPhone; TestPhone)', 'x-forwarded-for': '203.0.113.9', 'fly-client-ip': '203.0.113.9', 'accept-language': 'en-US,en;q=0.9', cookie: 'sid=abc', referer: 'https://app.example/me', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'glp1-counts-'));
  dirs.push(dir);
  return join(dir, 'nested', 'counts.jsonl');
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('POST /api/count', () => {
  it('stores every kind of message, with the day it arrived and nothing else', async () => {
    const store = memoryCountStore();
    const app = appWith(store);
    for (const m of everyKind) {
      const res = await app.request('/api/count', post(m));
      expect(res.status, m.event).toBe(204);
      expect(await res.text()).toBe('');
    }
    expect(store.rows).toEqual(everyKind.map((m) => ({ receivedOn: '2026-11-22', ...m })));
  });

  it('writes no IP address, user agent, language, cookie or page address to the store', async () => {
    const file = tempFile();
    const app = appWith(fileCountStore(file));
    for (const m of everyKind) expect((await app.request('/api/count', post(m))).status).toBe(204);
    const text = readFileSync(file, 'utf8');
    for (const secret of ['203.0.113.9', 'Mozilla', 'iPhone', 'en-US', 'sid=abc', 'app.example', 'user-agent', 'forwarded', '15:30', String(NOW)]) expect(text, secret).not.toContain(secret);
    const rows = text.trim().split('\n').map((l) => JSON.parse(l) as StoredCount);
    expect(rows).toHaveLength(everyKind.length);
    const allowed = new Set(['receivedOn', 'installId', 'appVersion', 'event', 'day', 'timeOnMedication', 'loggedBefore', 'heardFrom', 'form', 'week', 'logged']);
    for (const row of rows) for (const k of Object.keys(row)) expect(allowed.has(k), k).toBe(true);
    // The arrival day is a date. There is no time of day anywhere in the file.
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.receivedOn))).toBe(true);
    expect(text).not.toMatch(/\d{2}:\d{2}|T\d{2}/);
  });

  it('refuses a message with an unknown field, and stores nothing', async () => {
    const store = memoryCountStore();
    const app = appWith(store);
    for (const extra of [{ medication: 'Zepbound' }, { doseMg: 5 }, { weightKg: 81.2 }, { symptom: 'nausea' }, { note: 'hi' }, { tz: 'America/New_York' }, { locale: 'en-US' }, { at: NOW }, { ip: '203.0.113.9' }]) {
      for (const m of everyKind) {
        const res = await app.request('/api/count', post({ ...m, ...extra }));
        expect(res.status, `${m.event} + ${Object.keys(extra).join()}`).toBe(400);
        expect(await res.json()).toEqual({ error: 'bad_message' });
      }
    }
    expect(store.rows).toEqual([]);
  });

  it('refuses a message with a missing field, a wrong value, a wrong type, or more than one message', async () => {
    const store = memoryCountStore();
    const app = appWith(store);
    const bad: unknown[] = [
      {},
      { event: 'activated' },
      { ...common, event: 'app_opened' },
      { ...common, event: 'activated', day: -1 },
      { ...common, event: 'activated', day: 1.5 },
      { ...common, event: 'activated', day: 100_000 },
      { ...common, event: 'activated', installId: 'not-an-id' },
      { ...common, event: 'activated', appVersion: 'latest' },
      { ...common, event: 'logged_week', week: 1 },
      { ...common, event: 'logged_week', week: 1, logged: 'yes' },
      { ...setup, loggedBefore: 'some product name' },
      { ...setup, form: 'tirzepatide' },
      [everyKind[1]],
      { events: everyKind },
      'activated',
      null,
      7,
    ];
    for (const b of bad) expect((await app.request('/api/count', post(b))).status, JSON.stringify(b)).toBe(400);
    expect(store.rows).toEqual([]);
  });

  it('refuses text that is not JSON, and a body that is not sent as JSON', async () => {
    const store = memoryCountStore();
    const app = appWith(store);
    const notJson = await app.request('/api/count', post('{"event":'));
    expect([notJson.status, await notJson.json()]).toEqual([400, { error: 'bad_json' }]);
    expect((await app.request('/api/count', post(''))).status).toBe(400);
    const form = await app.request('/api/count', post(JSON.stringify(everyKind[1]), { 'content-type': 'text/plain' }));
    expect([form.status, await form.json()]).toEqual([415, { error: 'not_json' }]);
    expect((await app.request('/api/count', { method: 'POST', body: JSON.stringify(everyKind[1]) })).status).toBe(415);
    expect(store.rows).toEqual([]);
  });

  it('refuses a body over the size limit without storing it', async () => {
    const store = memoryCountStore();
    const app = appWith(store);
    // A valid message padded with spaces: the same JSON, but too large.
    const padded = `${JSON.stringify(everyKind[1])}${' '.repeat(MAX_COUNT_BODY)}`;
    const res = await app.request('/api/count', post(padded));
    expect([res.status, await res.json()]).toEqual([413, { error: 'too_large' }]);
    const huge = await app.request('/api/count', post(JSON.stringify({ ...common, event: 'activated', note: 'x'.repeat(50_000) })));
    expect(huge.status).toBe(413);
    // The largest message there can be fits well inside the limit.
    const largest = { installId: ID_A, appVersion: '9999.9999.9999', event: 'setup_finished', day: 9999, timeOnMedication: '3_to_12_months', loggedBefore: 'notes_or_spreadsheet', heardFrom: 'friend_or_family', form: 'injection' };
    expect(JSON.stringify(largest).length).toBeLessThan(MAX_COUNT_BODY / 2);
    expect((await app.request('/api/count', post(largest))).status).toBe(204);
    expect(store.rows).toHaveLength(1);
  });

  it('accepts only so many messages a minute, counted for all senders together', async () => {
    const store = memoryCountStore();
    const app = appWith(store, { limitPerMinute: 3 });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await app.request('/api/count', post(everyKind[1]))).status);
    expect(statuses).toEqual([204, 204, 204, 429, 429]);
    expect(store.rows).toHaveLength(3);
  });

  it('answers 503 when the store cannot take the row', async () => {
    const failing: CountStore = { append: () => Promise.reject(new Error('disk full')), deleteInstall: () => Promise.reject(new Error('disk full')), deleteBefore: () => Promise.reject(new Error('disk full')) };
    const app = appWith(failing);
    expect((await app.request('/api/count', post(everyKind[1]))).status).toBe(503);
    expect((await app.request(`/api/count/${ID_A}`, { method: 'DELETE' })).status).toBe(503);
  });
});

describe('DELETE /api/count/:installId', () => {
  it('removes every row of that id and leaves the others', async () => {
    const store = memoryCountStore();
    const app = appWith(store);
    for (const m of everyKind) await app.request('/api/count', post(m));
    await app.request('/api/count', post({ ...everyKind[1], installId: ID_B }));
    const res = await app.request(`/api/count/${ID_A}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(store.rows.map((r) => r.installId)).toEqual([ID_B]);
  });

  it('answers the same way when nothing is stored under the id', async () => {
    const store = memoryCountStore();
    const app = appWith(store);
    expect((await app.request(`/api/count/${ID_B}`, { method: 'DELETE' })).status).toBe(204);
    expect((await app.request(`/api/count/${ID_B}`, { method: 'DELETE' })).status).toBe(204);
  });

  it('a message that arrives for an id after its delete is dropped, so nothing is left under an id the phone has forgotten', async () => {
    const store = memoryCountStore();
    let clock = NOW;
    const app = createApp({ client: null, counts: { store, now: () => clock } });
    await app.request('/api/count', post(everyKind[1]));
    expect((await app.request(`/api/count/${ID_A}`, { method: 'DELETE' })).status).toBe(204);
    // A count that was already on its way, and a late retry a little later: both get the usual answer and neither is stored.
    for (const later of [0, 5_000, DELETED_ID_MEMORY_MS - 1]) {
      clock = NOW + later;
      const res = await app.request('/api/count', post(everyKind[2]));
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    }
    expect(store.rows).toEqual([]);
    // Another id is not affected.
    await app.request('/api/count', post({ ...everyKind[1], installId: ID_B }));
    expect(store.rows.map((r) => r.installId)).toEqual([ID_B]);
    // The deleted id is remembered for a limited time only, and only in memory.
    clock = NOW + DELETED_ID_MEMORY_MS;
    await app.request('/api/count', post(everyKind[2]));
    expect(store.rows.map((r) => r.installId)).toEqual([ID_B, ID_A]);
  });

  it('refuses anything that is not an install id', async () => {
    const store = memoryCountStore();
    const app = appWith(store);
    await app.request('/api/count', post(everyKind[1]));
    for (const bad of ['all', '*', '..%2Fcounts', ID_A.toUpperCase(), `${ID_A}x`]) expect((await app.request(`/api/count/${bad}`, { method: 'DELETE' })).status, bad).toBe(400);
    expect((await app.request('/api/count', { method: 'DELETE' })).status).toBe(404);
    expect(store.rows).toHaveLength(1);
  });
});

describe('the file store', () => {
  it('adds one line per row at the end of the file, and creates the folder', async () => {
    const file = tempFile();
    const store = fileCountStore(file);
    expect(existsSync(file)).toBe(false);
    await store.append({ receivedOn: '2026-11-22', ...common, event: 'activated' });
    const afterOne = readFileSync(file, 'utf8');
    await store.append({ receivedOn: '2026-11-23', ...common, event: 'week2_active' });
    const afterTwo = readFileSync(file, 'utf8');
    expect(afterTwo.startsWith(afterOne)).toBe(true);
    expect(afterTwo.split('\n')).toEqual([
      '{"receivedOn":"2026-11-22","installId":"3f2b8c1e-7a4d-4e9b-a1c6-0d5e8f7a9b2c","appVersion":"0.0.1","day":3,"event":"activated"}',
      '{"receivedOn":"2026-11-23","installId":"3f2b8c1e-7a4d-4e9b-a1c6-0d5e8f7a9b2c","appVersion":"0.0.1","day":3,"event":"week2_active"}',
      '',
    ]);
  });

  it('a delete takes that id out of the file for good, also for a second store on the same file', async () => {
    const file = tempFile();
    const store = fileCountStore(file);
    await Promise.all([
      store.append({ receivedOn: '2026-11-22', ...common, event: 'activated' }),
      store.append({ receivedOn: '2026-11-22', ...common, installId: ID_B, event: 'activated' }),
      store.append({ receivedOn: '2026-11-22', ...common, event: 'wants_pro' }),
    ]);
    await store.deleteInstall(ID_A);
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain(ID_A);
    expect(text.trim().split('\n')).toHaveLength(1);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    // Rows keep arriving after a delete, and a restart reads the same file.
    await store.append({ receivedOn: '2026-11-23', ...common, installId: ID_B, event: 'week2_active' });
    const restarted = fileCountStore(file);
    await restarted.deleteInstall(ID_B);
    expect(readFileSync(file, 'utf8')).toBe('');
  });

  it('deleting from a file that does not exist, or an id that is not in it, changes nothing', async () => {
    const file = tempFile();
    const store = fileCountStore(file);
    await store.deleteInstall(ID_A);
    expect(existsSync(file)).toBe(false);
    await store.append({ receivedOn: '2026-11-22', ...common, event: 'activated' });
    const before = readFileSync(file, 'utf8');
    await store.deleteInstall(ID_B);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('keeps a line it cannot read', async () => {
    const file = tempFile();
    const store = fileCountStore(file);
    await store.append({ receivedOn: '2026-11-22', ...common, event: 'activated' });
    writeFileSync(file, `${readFileSync(file, 'utf8')}not json\n`);
    await store.deleteInstall(ID_A);
    expect(readFileSync(file, 'utf8')).toBe('not json\n');
  });

  it('stops growing at its size limit', async () => {
    const file = tempFile();
    const store = fileCountStore(file, { maxBytes: 300 });
    const row = { receivedOn: '2026-11-22', ...common, event: 'activated' as const };
    await store.append(row);
    await store.append(row);
    await expect(store.append(row)).rejects.toThrow(/full/);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
    // A delete makes room again.
    await store.deleteInstall(ID_A);
    await store.append(row);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1);
  });
});

describe('deleting by age', () => {
  const rowOn = (receivedOn: string, installId = ID_A): StoredCount => ({ receivedOn, installId, appVersion: '0.0.1', day: 1, event: 'activated' });

  it('removes the rows that arrived before a day, and keeps that day and later ones', async () => {
    const store = memoryCountStore();
    for (const day of ['2024-11-21', '2024-11-22', '2024-11-23', '2026-11-22']) await store.append(rowOn(day));
    await store.deleteBefore('2024-11-22');
    expect(store.rows.map((r) => r.receivedOn)).toEqual(['2024-11-22', '2024-11-23', '2026-11-22']);
  });

  it('the age limit is counted in whole days from the day a row arrived', async () => {
    const store = memoryCountStore();
    for (const day of ['2026-11-11', '2026-11-12', '2026-11-22']) await store.append(rowOn(day));
    expect(utcDay(NOW)).toBe('2026-11-22');
    // Keep 10 days: a row from 10 days ago stays, one from 11 days ago goes.
    await pruneCounts(store, 10, NOW);
    expect(store.rows.map((r) => r.receivedOn)).toEqual(['2026-11-12', '2026-11-22']);
    await pruneCounts(store, 9, NOW);
    expect(store.rows.map((r) => r.receivedOn)).toEqual(['2026-11-22']);
    await pruneCounts(store, 1, NOW);
    expect(store.rows.map((r) => r.receivedOn)).toEqual(['2026-11-22']);
    for (const bad of [0, -1, Number.NaN]) await expect(pruneCounts(store, bad, NOW)).rejects.toThrow(/days/);
    expect(store.rows).toHaveLength(1);
  });

  it('the file store rewrites the file without the old rows, and keeps a line it cannot read', async () => {
    const file = tempFile();
    const store = fileCountStore(file);
    await store.append(rowOn('2024-01-05'));
    await store.append(rowOn('2026-11-20', ID_B));
    writeFileSync(file, `${readFileSync(file, 'utf8')}not json\n{"installId":"${ID_A}"}\n`);
    await store.deleteBefore('2026-01-01');
    expect(readFileSync(file, 'utf8')).toBe(`${JSON.stringify(rowOn('2026-11-20', ID_B))}\nnot json\n{"installId":"${ID_A}"}\n`);
    // A file that does not exist is left alone.
    await fileCountStore(tempFile()).deleteBefore('2026-01-01');
  });
});

describe('the server\'s settings', () => {
  it('there are no count routes unless COUNT_FILE names the file: a server for the full app accepts no counts', () => {
    expect(countOptionsFromEnv({})).toBeNull();
    expect(countOptionsFromEnv({ COUNT_FILE: '' })).toBeNull();
    expect(countOptionsFromEnv({ COUNT_FILE: 'off' })).toBeNull();
    expect(countOptionsFromEnv({ COUNT_KEEP_DAYS: '30', COUNT_ALLOW_ORIGIN: 'https://app.example' })).toBeNull();
  });

  it('COUNT_FILE turns them on; COUNT_KEEP_DAYS sets the age limit and must be a whole number of days', () => {
    const file = tempFile();
    expect(countOptionsFromEnv({ COUNT_FILE: file })).toMatchObject({ file, keepDays: null });
    expect(countOptionsFromEnv({ COUNT_FILE: file, COUNT_KEEP_DAYS: '730', COUNT_ALLOW_ORIGIN: 'https://app.example' })).toMatchObject({ file, keepDays: 730, options: { allowOrigin: 'https://app.example' } });
    for (const bad of ['0', '-3', '1.5', 'two years', '24 months']) expect(() => countOptionsFromEnv({ COUNT_FILE: file, COUNT_KEEP_DAYS: bad }), bad).toThrow(/COUNT_KEEP_DAYS/);
  });
});

describe('where the routes exist and who may call them', () => {
  it('there are no count routes unless a store is given', async () => {
    const app = createApp({ client: null });
    expect((await app.request('/api/count', post(everyKind[1]))).status).toBe(404);
    expect((await app.request(`/api/count/${ID_A}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('answers are not to be kept by a cache, and no other site is named unless one is set', async () => {
    const app = appWith(memoryCountStore());
    const res = await app.request('/api/count', post(everyKind[1]));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect((await app.request('/api/count', { method: 'OPTIONS' })).status).toBe(404);
  });

  it('with an app on another site, that site is named and its browser check is answered', async () => {
    const app = appWith(memoryCountStore(), { allowOrigin: 'https://app.example' });
    for (const path of ['/api/count', `/api/count/${ID_A}`]) {
      const pre = await app.request(path, { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'POST' } });
      expect(pre.status, path).toBe(204);
      expect(pre.headers.get('access-control-allow-origin')).toBe('https://app.example');
      expect(pre.headers.get('access-control-allow-methods')).toBe('POST, DELETE');
      expect(pre.headers.get('access-control-allow-headers')).toBe('content-type');
    }
    const res = await app.request('/api/count', post(everyKind[1]));
    expect([res.status, res.headers.get('access-control-allow-origin')]).toEqual([204, 'https://app.example']);
    const del = await app.request(`/api/count/${ID_A}`, { method: 'DELETE' });
    expect([del.status, del.headers.get('access-control-allow-origin')]).toEqual([204, 'https://app.example']);
  });
});
