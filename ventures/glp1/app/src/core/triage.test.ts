import { describe, expect, it } from 'vitest';
import { triageCard, triageSymptom, triageText, type TriageContext, type TriageId } from './triage';

const ctx: TriageContext = { insulinOrSU: false, drugId: 'semaglutide-wl', region: 'CN' };
const top = (t: string, c: TriageContext = ctx) => triageText(t, c)[0]?.id ?? null;

/** PRD 验收标准第 5 条：附录 B 每一行至少 3 种说法都要触发。 */
const MUST_TRIGGER: Record<string, string[]> = {
  pancreatitis: ['上腹剧痛，还吐了', '肚子疼得受不了，疼到后背', '胃绞痛直不起腰', '上腹劇痛', 'severe stomach pain going to my back'],
  chest_or_faint: ['胸痛', '刚才晕倒了', 'I passed out after the shot'],
  anaphylaxis: ['嘴唇肿了喘不上气', '喉咙肿', '全身起疹子', 'my throat is swelling'],
  vision: ['一只眼突然看不清了', '右眼看东西模糊', '视野缺了一块', 'sudden vision loss in one eye'],
  dehydration: ['吐了一整天，喝水也吐', '一直拉肚子', '一天没怎么尿', '站起来眼前发黑', '喝水都吐', "can't keep water down"],
  gallbladder: ['右上腹疼还发烧', '眼白发黄', '皮膚變黃', 'jaundice'],
  thyroid: ['脖子摸到一个肿块', '吞咽困难', 'lump in my neck'],
  pregnancy: ['我怀孕了', '在备孕能打吗', '哺乳期', 'I am pregnant'],
  procedure: ['下周要做胃镜', '要全麻手术', 'colonoscopy next week'],
  eating_too_little: ['好几天几乎吃不下', '连续三天没怎么吃', "haven't eaten in 3 days"],
  crisis: ['不想活了', '有点想死', 'I want to die'],
};

describe('triage — must trigger', () => {
  for (const [id, phrases] of Object.entries(MUST_TRIGGER)) {
    for (const p of phrases) {
      it(`${id}: ${p}`, () => {
        expect(triageText(p, ctx).map((h) => h.id)).toContain(id as TriageId);
      });
    }
  }
});

describe('triage — must stay quiet on ordinary logs', () => {
  for (const p of ['早饭俩鸡蛋一杯豆浆', '有点恶心', '今天有点累', '刚打了 7.5，右大腿', '今早 81.6', '吐了一次', '肚子有点胀', '没有剧痛', '我没怀孕', '胃口很差']) {
    it(p, () => expect(triageText(p, ctx)).toEqual([]));
  }
});

describe('triage — context', () => {
  it('hypoglycemia is act-now only for insulin or sulfonylurea users', () => {
    expect(triageText('手抖出冷汗心慌', { ...ctx, insulinOrSU: true })[0]).toEqual({ id: 'hypoglycemia', level: 'act_now' });
    expect(triageText('手抖出冷汗心慌', ctx)[0]).toEqual({ id: 'hypoglycemia', level: 'urgent' });
    expect(triageText('有点心慌', ctx)).toEqual([]);
  });

  it('the contraception reminder only applies to tirzepatide', () => {
    expect(top('我在吃避孕药', { ...ctx, drugId: 'tirzepatide' })).toBe('contraception');
    expect(top('我在吃避孕药', ctx)).toBeNull();
  });

  it('sorts by severity: crisis, then emergencies', () => {
    expect(triageText('上腹剧痛，不想活了', ctx).map((h) => h.id)).toEqual(['crisis', 'pancreatitis']);
  });

  it('grade-3 quick logs trigger the matching card', () => {
    expect(triageSymptom('vomiting', 3, ctx)).toEqual([{ id: 'dehydration', level: 'urgent' }]);
    expect(triageSymptom('vomiting', 2, ctx)).toEqual([]);
    expect(triageSymptom('abdominal_pain', 3, ctx)[0].id).toBe('abdominal_pain_severe');
    expect(triageSymptom('dizziness', 3, ctx)).toEqual([]);
    expect(triageSymptom('dizziness', 3, { ...ctx, insulinOrSU: true })[0].id).toBe('hypoglycemia');
  });

  it('cards show the local emergency number', () => {
    expect(triageCard({ id: 'pancreatitis', level: 'emergency' }, 'TW').body).toContain('119');
    expect(triageCard({ id: 'crisis', level: 'crisis' }, 'US').body).toContain('988');
  });
});

describe('emergency number follows where the phone is', () => {
  it('a Hong Kong user in Los Angeles gets 911; unknown zones fall back to the chosen region', async () => {
    const { emergencyRegion, EMERGENCY_NUMBER } = await import('./triage');
    expect(EMERGENCY_NUMBER[emergencyRegion('America/Los_Angeles', 'HK')]).toBe('911');
    expect(EMERGENCY_NUMBER[emergencyRegion('Asia/Hong_Kong', 'US')]).toBe('999');
    expect(EMERGENCY_NUMBER[emergencyRegion('Europe/London', 'TW')]).toBe('119');
  });
});
