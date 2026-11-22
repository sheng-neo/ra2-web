/**
 * /api/count: the receiving end of anonymous counting. What a message may contain is decided in
 * src/core/counts.ts; the phone and this server check it with the same function.
 *
 *   POST   /api/count              one message
 *   DELETE /api/count/:installId   delete everything stored under that id
 *
 * What these routes keep to:
 * - A message is stored only if it is exactly one of the known shapes. An unknown field, a
 *   missing field, a value outside its list or range, or a body over the size limit is refused
 *   and nothing is stored.
 * - A stored row is the checked message plus the day it arrived (a date, no time of day).
 *   The consent screen tells the person that this date is noted. It is what lets rows be
 *   deleted by age (pruneCounts below).
 * - Nothing about the sender is stored: no IP address, no user agent, no language, no cookie.
 *   The routes do not read them at all.
 * - A delete answers the same way whether or not anything was stored under the id.
 * - After a delete, a message that still arrives for that id (one that was already on its way,
 *   or a late retry) is dropped. The server remembers a deleted id for an hour, in memory only;
 *   nothing about a deleted id is written anywhere.
 *
 * The store is an interface. The default writes one JSON line per row to a file.
 */
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isInstallId, parseCountMessage, type CountMessage } from '../src/core/counts';

/** A valid message is about 250 bytes at most. Anything larger than this is refused unread. */
export const MAX_COUNT_BODY = 1024;

/** A row as it is stored: the message, and the day (UTC) it arrived. */
export type StoredCount = { receivedOn: string } & CountMessage;

export interface CountStore {
  /** Adds one row. */
  append(row: StoredCount): Promise<void>;
  /** Removes every row stored under the id. */
  deleteInstall(installId: string): Promise<void>;
  /** Removes every row that arrived before the given day (a UTC date, YYYY-MM-DD). */
  deleteBefore(day: string): Promise<void>;
}

/** How long a deleted id is remembered, so a message that arrives after its delete is not stored again. */
export const DELETED_ID_MEMORY_MS = 60 * 60 * 1000;
/** The most deleted ids remembered at once. The oldest are forgotten first. */
const MAX_DELETED_IDS = 10_000;

/** The UTC date of a moment, as rows carry it. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Deletes the rows that are older than `keepDays` days: a row that arrived on day D is removed
 * once `keepDays` full days have passed since D. This is the age limit the privacy policy names.
 */
export async function pruneCounts(store: CountStore, keepDays: number, nowMs: number): Promise<void> {
  if (!Number.isFinite(keepDays) || keepDays < 1) throw new Error(`the number of days to keep counts must be 1 or more, not ${String(keepDays)}`);
  await store.deleteBefore(utcDay(nowMs - Math.floor(keepDays) * 86_400_000));
}

/**
 * Runs pruneCounts now and then once a day while the server runs. Returns a function that stops it.
 * A failed run is tried again the next day; it must not take the server down.
 */
export function startCountCleanup(store: CountStore, keepDays: number, now: () => number = Date.now): () => void {
  const run = () => void pruneCounts(store, keepDays, now()).catch((err: unknown) => console.error('count cleanup failed', err));
  run();
  const timer = setInterval(run, 86_400_000);
  timer.unref();
  return () => clearInterval(timer);
}

/** Keeps the rows in memory. For tests and local trials. */
export function memoryCountStore(): CountStore & { rows: StoredCount[] } {
  const store = {
    rows: [] as StoredCount[],
    async append(row: StoredCount) {
      store.rows.push(row);
    },
    async deleteInstall(installId: string) {
      store.rows = store.rows.filter((r) => r.installId !== installId);
    },
    async deleteBefore(day: string) {
      store.rows = store.rows.filter((r) => r.receivedOn >= day);
    },
  };
  return store;
}

/**
 * The default store: a text file with one JSON object per line. A new row is only ever added at
 * the end. A delete (of one id, or of rows past the age limit) is the one time the file is
 * rewritten: the rows to drop are left out of a copy, and the copy takes the file's place in one
 * step. `maxBytes` stops the file from growing without limit.
 */
export function fileCountStore(path: string, opts: { maxBytes?: number } = {}): CountStore {
  const maxBytes = opts.maxBytes ?? 200 * 1024 * 1024;
  let size: number | null = null;
  // One operation at a time, so a row is never added while the file is being rewritten.
  let chain: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  };
  const currentSize = async () => {
    if (size === null) size = await stat(path).then((s) => s.size, () => 0);
    return size;
  };
  /** Rewrites the file without the rows `drop` picks. */
  const rewrite = (drop: (row: { installId?: unknown; receivedOn?: unknown }) => boolean) =>
    inTurn(async () => {
      const text = await readFile(path, 'utf8').catch(() => null);
      if (text === null) return;
      const kept = text.split('\n').filter((line) => {
        if (!line) return false;
        try {
          return !drop(JSON.parse(line) as { installId?: unknown; receivedOn?: unknown });
        } catch {
          // A line that cannot be read is not ours to drop.
          return true;
        }
      });
      const out = kept.length ? `${kept.join('\n')}\n` : '';
      if (out === text) return;
      await writeFile(`${path}.tmp`, out, 'utf8');
      await rename(`${path}.tmp`, path);
      size = Buffer.byteLength(out);
    });
  return {
    append: (row) =>
      inTurn(async () => {
        const line = `${JSON.stringify(row)}\n`;
        const bytes = Buffer.byteLength(line);
        if ((await currentSize()) + bytes > maxBytes) throw new Error('count store is full');
        await mkdir(dirname(path), { recursive: true });
        await appendFile(path, line, 'utf8');
        size = (size ?? 0) + bytes;
      }),
    deleteInstall: (installId) => rewrite((row) => row.installId === installId),
    // A row without a readable arrival day is kept: it is not ours to drop.
    deleteBefore: (day) => rewrite((row) => typeof row.receivedOn === 'string' && row.receivedOn < day),
  };
}

export interface CountOptions {
  store: CountStore;
  /**
   * The site the app is served from, when that is not this server (for example the app inside
   * a phone shell). Browsers then need the server to name it before they send a message.
   * Leave it out when the app and this server share one site.
   */
  allowOrigin?: string;
  /** Messages accepted per minute, all senders together. No sender is looked at. */
  limitPerMinute?: number;
  /** The clock, for tests. */
  now?: () => number;
}

export function addCountRoutes(app: Hono, opts: CountOptions): void {
  const { store, allowOrigin } = opts;
  const limit = opts.limitPerMinute ?? 600;
  const now = opts.now ?? Date.now;
  let recent: number[] = [];
  /** Ids deleted a short while ago, with the time of the delete. Kept in memory only. */
  const deleted = new Map<string, number>();
  const wasJustDeleted = (id: string, t: number) => {
    const at = deleted.get(id);
    if (at === undefined) return false;
    if (t - at < DELETED_ID_MEMORY_MS) return true;
    deleted.delete(id);
    return false;
  };

  app.use('/api/count/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    if (allowOrigin) {
      c.header('Access-Control-Allow-Origin', allowOrigin);
      c.header('Vary', 'Origin');
    }
  });
  if (allowOrigin) {
    const preflight = (c: { header: (k: string, v: string) => void; body: (b: null, s: 204) => Response }) => {
      c.header('Access-Control-Allow-Methods', 'POST, DELETE');
      c.header('Access-Control-Allow-Headers', 'content-type');
      c.header('Access-Control-Max-Age', '86400');
      return c.body(null, 204);
    };
    app.options('/api/count', preflight);
    app.options('/api/count/:installId', preflight);
  }

  app.post(
    '/api/count',
    bodyLimit({ maxSize: MAX_COUNT_BODY, onError: (c) => c.json({ error: 'too_large' }, 413) }),
    async (c) => {
      if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) return c.json({ error: 'not_json' }, 415);
      const t = now();
      recent = recent.filter((x) => t - x < 60_000);
      if (recent.length >= limit) return c.json({ error: 'busy' }, 429);
      recent.push(t);
      let raw: unknown;
      try {
        raw = JSON.parse(await c.req.text());
      } catch {
        return c.json({ error: 'bad_json' }, 400);
      }
      const message = parseCountMessage(raw);
      if (!message) return c.json({ error: 'bad_message' }, 400);
      // The id was deleted a moment ago: the message is dropped, and the sender is told nothing different.
      if (wasJustDeleted(message.installId, t)) return c.body(null, 204);
      try {
        await store.append({ receivedOn: utcDay(t), ...message });
      } catch {
        return c.json({ error: 'store_unavailable' }, 503);
      }
      return c.body(null, 204);
    },
  );

  app.delete('/api/count/:installId', async (c) => {
    const id = c.req.param('installId');
    if (!isInstallId(id)) return c.json({ error: 'bad_id' }, 400);
    // Remembered before the rows are removed, so a message that arrives meanwhile is not stored after them.
    const t = now();
    deleted.delete(id);
    deleted.set(id, t);
    for (const [old, at] of deleted) {
      if (deleted.size <= MAX_DELETED_IDS && t - at < DELETED_ID_MEMORY_MS) break;
      deleted.delete(old);
    }
    try {
      await store.deleteInstall(id);
    } catch {
      return c.json({ error: 'store_unavailable' }, 503);
    }
    return c.body(null, 204);
  });
}
