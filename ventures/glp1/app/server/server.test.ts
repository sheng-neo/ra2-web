import { describe, expect, it, vi } from 'vitest';
import { createApp } from './index';
import { toEvents, type ParseClient, type ParseOutput } from './parse';

const blank = {
  label: null,
  protein_g: null,
  protein_low_g: null,
  protein_high_g: null,
  kcal: null,
  confidence: null,
  dose_amount: null,
  dose_unit: null,
  site: null,
  minutes_ago: null,
  weight_kg: null,
  symptom: null,
  grade: null,
  out_of_scope: null,
} as const;

describe('toEvents (model output validation)', () => {
  it('keeps sane records and clamps or drops nonsense', () => {
    const out: ParseOutput = {
      events: [
        { ...blank, type: 'food', label: '牛肉面一碗', protein_g: 22, protein_low_g: 16, protein_high_g: 28, kcal: 550, confidence: 0.8 },
        { ...blank, type: 'food', label: '巨无霸', protein_g: 999, protein_low_g: null, protein_high_g: null, confidence: 3 },
        { ...blank, type: 'food', label: '不知道', protein_g: null },
        { ...blank, type: 'dose', dose_amount: 7.5, dose_unit: 'mg', site: 'thigh_r', minutes_ago: 30 },
        { ...blank, type: 'dose', dose_amount: -1 },
        { ...blank, type: 'weight', weight_kg: 81.63 },
        { ...blank, type: 'weight', weight_kg: 8 },
        { ...blank, type: 'symptom', symptom: 'nausea', grade: 7 },
        { ...blank, type: 'question', label: '能加到 10 吗', out_of_scope: null },
      ],
    };
    expect(toEvents(out)).toEqual([
      { type: 'food', label: '牛肉面一碗', proteinG: 22, lowG: 16, highG: 28, kcal: 550, confidence: 0.8 },
      { type: 'food', label: '巨无霸', proteinG: 200, lowG: 150, highG: 250, kcal: null, confidence: 1 },
      { type: 'unknown', text: '不知道' },
      { type: 'dose', amount: 7.5, unit: 'mg', site: 'thigh_r', minutesAgo: 30 },
      { type: 'weight', kg: 81.6 },
      { type: 'symptom', kind: 'nausea', grade: 3 },
      { type: 'question', text: '能加到 10 吗', outOfScope: true },
    ]);
  });
});

describe('server', () => {
  const body = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const ctx = { drug: '穆峰达', doseUnit: 'mg', weightUnit: 'kg', localTime: 'x' };

  it('reports AI off and returns 503 without a key', async () => {
    const app = createApp({ client: null });
    expect(await (await app.request('/api/health')).json()).toEqual({ ok: true, ai: false });
    expect((await app.request('/api/parse', body({ text: '牛肉面', context: ctx }))).status).toBe(503);
  });

  it('never sends danger-symptom text to the model', async () => {
    const parse = vi.fn();
    const app = createApp({ client: { beta: { messages: { parse } } } as unknown as ParseClient });
    const res = await app.request('/api/parse', body({ text: '上腹剧痛疼到后背', context: ctx }));
    expect(await res.json()).toEqual({ events: [], triage: true });
    expect(parse).not.toHaveBeenCalled();
  });

  it('passes model, effort, structured output and fallbacks; maps the parsed output', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { events: [{ ...blank, type: 'food', label: '皮蛋瘦肉粥', protein_g: 9, protein_low_g: 6, protein_high_g: 12, confidence: 0.7 }] },
    });
    const app = createApp({ client: { beta: { messages: { parse } } } as unknown as ParseClient });
    const res = await app.request('/api/parse', body({ text: '皮蛋瘦肉粥一碗', context: ctx }));
    expect(await res.json()).toEqual({ events: [{ type: 'food', label: '皮蛋瘦肉粥', proteinG: 9, lowG: 6, highG: 12, kcal: null, confidence: 0.7 }], refused: false });
    const req = parse.mock.calls[0][0];
    expect(req).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'low' } });
    expect(req.output_config.format).toBeTruthy();
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(JSON.stringify(req.system)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('handles refusals and rejects oversized input', async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'refusal', parsed_output: null });
    const app = createApp({ client: { beta: { messages: { parse } } } as unknown as ParseClient });
    expect(await (await app.request('/api/parse', body({ text: '随便', context: ctx }))).json()).toEqual({ events: [], refused: true });
    expect((await app.request('/api/parse', body({ text: 'x'.repeat(500), context: ctx }))).status).toBe(413);
  });
});
