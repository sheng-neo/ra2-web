/**
 * 服务端：托管前端构建产物 + /api。密钥只在服务端。
 * 没有 ANTHROPIC_API_KEY 时 /api/parse 返回 503，前端回落到手动记录。
 */
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { triageText } from '../src/core/triage';
import { addCountRoutes, fileCountStore, startCountCleanup, type CountOptions } from './count';
import { callParse, type ParseClient, type ParseInput } from './parse';

const MAX_TEXT = 400;
const MAX_IMAGE_B64 = 2_000_000;
const LIMIT_PER_HOUR = 40;

export function createApp(opts: { client: ParseClient | null; staticDir?: string; counts?: CountOptions }) {
  const app = new Hono();
  const hits = new Map<string, number[]>();

  app.get('/api/health', (c) => c.json({ ok: true, ai: opts.client !== null }));

  // Anonymous counts (server/count.ts). Without a store the routes do not exist.
  if (opts.counts) addCountRoutes(app, opts.counts);

  app.post('/api/parse', async (c) => {
    if (!opts.client) return c.json({ error: 'ai_unavailable' }, 503);
    const ip = c.req.header('fly-client-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= LIMIT_PER_HOUR) return c.json({ error: 'rate_limited' }, 429);
    hits.set(ip, [...recent, now]);

    let body: ParseInput;
    try {
      body = await c.req.json<ParseInput>();
    } catch {
      return c.json({ error: 'bad_json' }, 400);
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const image = typeof body.imageJpegBase64 === 'string' ? body.imageJpegBase64 : '';
    if (!text && !image) return c.json({ error: 'empty' }, 400);
    if (text.length > MAX_TEXT || image.length > MAX_IMAGE_B64) return c.json({ error: 'too_large' }, 413);
    const ctx = body.context ?? { drug: null, doseUnit: 'mg', weightUnit: 'kg', localTime: '' };
    const context = {
      drug: typeof ctx.drug === 'string' ? ctx.drug.slice(0, 80) : null,
      doseUnit: ['mg', 'units', 'mL', 'clicks'].includes(ctx.doseUnit) ? ctx.doseUnit : 'mg',
      weightUnit: ['kg', 'jin', 'lb'].includes(ctx.weightUnit) ? ctx.weightUnit : 'kg',
      localTime: String(ctx.localTime ?? '').slice(0, 80),
    };

    // 纵深防御：前端已经先做过分诊，服务端再查一遍，命中就不送 AI。
    if (text && triageText(text, { insulinOrSU: false, drugId: null, region: 'OTHER' }).length) {
      return c.json({ events: [], triage: true });
    }

    try {
      const out = await callParse(opts.client, { text: text || undefined, imageJpegBase64: image || undefined, context });
      return c.json({ events: out.events, refused: out.refused });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return c.json({ error: 'upstream_busy' }, 503);
      if (err instanceof Anthropic.APIConnectionError) return c.json({ error: 'upstream_unreachable' }, 503);
      if (err instanceof Anthropic.APIError) {
        console.error('anthropic error', err.status, err.message);
        return c.json({ error: 'upstream_error' }, 502);
      }
      console.error(err);
      return c.json({ error: 'server_error' }, 500);
    }
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use('/*', serveStatic({ root: opts.staticDir }));
    app.get('*', serveStatic({ path: `${opts.staticDir}/index.html` }));
  }
  return app;
}

/**
 * The count routes, from the environment. They exist only when COUNT_FILE names the file the
 * counts go to (one line each). Without it, or with COUNT_FILE=off, the server has no count
 * routes at all: a server that only serves the full app, which never counts, must not accept
 * writes from anyone who finds the address.
 * COUNT_KEEP_DAYS is the age limit: rows older than that many days are deleted, once at start
 * and then once a day. Without it rows are kept until their install id is deleted.
 */
export function countOptionsFromEnv(env: Record<string, string | undefined>): { file: string; keepDays: number | null; options: CountOptions } | null {
  const file = env.COUNT_FILE?.trim();
  if (!file || file === 'off') return null;
  let keepDays: number | null = null;
  if (env.COUNT_KEEP_DAYS !== undefined && env.COUNT_KEEP_DAYS.trim() !== '') {
    keepDays = Number(env.COUNT_KEEP_DAYS);
    // A typo must not quietly keep rows for ever, or delete them all.
    if (!Number.isInteger(keepDays) || keepDays < 1) throw new Error(`COUNT_KEEP_DAYS must be a whole number of days, 1 or more, not ${JSON.stringify(env.COUNT_KEEP_DAYS)}`);
  }
  return { file, keepDays, options: { store: fileCountStore(file), allowOrigin: env.COUNT_ALLOW_ORIGIN || undefined } };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  const port = Number(process.env.PORT ?? 8787);
  const staticDir = process.env.STATIC_DIR ?? (existsSync('dist') ? 'dist' : undefined);
  const counts = countOptionsFromEnv(process.env);
  if (counts?.keepDays) startCountCleanup(counts.options.store, counts.keepDays);
  serve({ fetch: createApp({ client, staticDir, counts: counts?.options }).fetch, port });
  console.log(`glp1 server on :${port} · AI ${client ? 'on' : 'off（没有 ANTHROPIC_API_KEY）'} · static ${staticDir ?? '无'} · counts ${counts ? `${counts.file}, ${counts.keepDays ? `rows deleted after ${counts.keepDays} days` : 'no age limit (COUNT_KEEP_DAYS is not set)'}` : 'off'}`);
}
