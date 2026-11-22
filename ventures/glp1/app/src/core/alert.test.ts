import { describe, expect, it } from 'vitest';
import { alertCards, alertHits, alertTitle, fixedAlertCard, showsAlert } from './alert';
import type { Region } from './catalog';
import { emergencyDial, triageCard, triageSymptom, triageText, type TriageContext, type TriageHit, type TriageId, type TriageLevel } from './triage';

const REGIONS: Region[] = ['CN', 'TW', 'HK', 'US', 'SG', 'MY', 'OTHER'];
/** Rules whose level means "contact your doctor right away". */
const SERIOUS: [TriageId, TriageLevel][] = [
  ['pancreatitis', 'emergency'],
  ['chest_or_faint', 'emergency'],
  ['anaphylaxis', 'emergency'],
  ['vision', 'emergency'],
  ['hypoglycemia', 'act_now'],
  ['hypoglycemia', 'urgent'],
  ['dehydration', 'urgent'],
  ['gallbladder', 'urgent'],
  ['thyroid', 'urgent'],
  ['abdominal_pain_severe', 'urgent'],
];
/** Rules of a mild level: their own cards are reminders, with no call button. */
const MILD: [TriageId, TriageLevel][] = [
  ['pregnancy', 'contact'],
  ['procedure', 'remind'],
  ['contraception', 'remind'],
  ['eating_too_little', 'care'],
];
const NON_CRISIS: [TriageId, TriageLevel][] = [...SERIOUS, ...MILD];
const hit = (id: TriageId, level: TriageLevel): TriageHit => ({ id, level });
const CRISIS = hit('crisis', 'crisis');

describe('fixed alert card', () => {
  it('has the launch wording, with the emergency number of the region', () => {
    expect(fixedAlertCard('US', 'en')).toEqual({
      title: 'Contact your doctor right away',
      body: 'What you logged can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call 911.',
      showEmergency: true,
      pauseCoaching: true,
    });
    expect(fixedAlertCard('HK', 'en').body).toContain('call 999.');
    // Without a single number for the region the card says so in words, and there is nothing to dial.
    expect(fixedAlertCard('OTHER', 'en').body).toBe('What you logged can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call your local emergency number.');
    expect(emergencyDial('OTHER')).toBeNull();
  });

  it('says "What you wrote" when the alert came from a typed question, and is otherwise the same card', () => {
    expect(fixedAlertCard('US', 'en', true)).toEqual({
      title: 'Contact your doctor right away',
      body: 'What you wrote can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call 911.',
      showEmergency: true,
      pauseCoaching: true,
    });
    for (const r of REGIONS) expect(fixedAlertCard(r, 'en', true).body, r).toBe(fixedAlertCard(r, 'en').body.replace('What you logged', 'What you wrote'));
    expect(fixedAlertCard('US', 'en', false)).toEqual(fixedAlertCard('US', 'en'));
    // The cards of an alert pass it on; a crisis card and the detail cards have no such word.
    expect(alertCards([hit('dehydration', 'urgent')], 'US', 'en', false, true)[0].card.body).toMatch(/^What you wrote can be/);
    expect(alertCards([hit('dehydration', 'urgent')], 'US', 'en', false)[0].card.body).toMatch(/^What you logged can be/);
    expect(alertCards([CRISIS], 'US', 'en', false, true)).toEqual(alertCards([CRISIS], 'US', 'en', false));
    expect(alertCards([hit('dehydration', 'urgent')], 'US', 'en', true, true)).toEqual(alertCards([hit('dehydration', 'urgent')], 'US', 'en', true));
    // The Chinese card has one wording. It is not changed without review.
    expect(fixedAlertCard('CN', 'hans', true)).toEqual(fixedAlertCard('CN', 'hans'));
  });

  it('says nothing about what the problem might be, in any region', () => {
    for (const r of REGIONS) {
      const c = fixedAlertCard(r, 'en');
      expect(c.title).toBe('Contact your doctor right away');
      expect(c.body).not.toMatch(/pancrea|gallbladder|thyroid|dehydrat|blood sugar|allerg|pregnan|sugar|juice|water|emergency room/i);
      expect(c.body).not.toMatch(/[㐀-鿿!]/);
    }
  });

  it('has a Chinese version for a profile that is already Chinese', () => {
    expect(fixedAlertCard('CN', 'hans')).toMatchObject({ title: '请马上联系医生', showEmergency: true });
    expect(fixedAlertCard('CN', 'hans').body).toContain('请拨打 120。');
    expect(fixedAlertCard('TW', 'hant').body).toContain('请拨打 119。');
  });
});

describe('cards shown for an alert', () => {
  it('with detail cards, every hit shows the card of its rule, as before', () => {
    const hits = [CRISIS, ...NON_CRISIS.map(([id, level]) => hit(id, level))];
    for (const lang of ['en', 'hans'] as const) {
      const cards = alertCards(hits, 'US', lang, true);
      expect(cards.map((c) => c.card)).toEqual(hits.map((h) => triageCard(h, 'US', lang)));
      expect(cards.map((c) => c.level)).toEqual(hits.map((h) => h.level));
      expect(cards.map((c) => c.key)).toEqual(hits.map((h) => h.id));
    }
  });

  it('without detail cards, every serious hit that is not a crisis shows the one fixed card', () => {
    for (const [id, level] of SERIOUS) {
      for (const r of REGIONS) {
        const cards = alertCards([hit(id, level)], r, 'en', false);
        expect(cards, id).toHaveLength(1);
        expect(cards[0].card, id).toEqual(fixedAlertCard(r, 'en'));
        expect(alertTitle(hit(id, level), r, 'en', false)).toBe('Contact your doctor right away');
      }
    }
  });

  it('without detail cards, a hit of a mild level shows nothing: a reminder is not "contact your doctor right away"', () => {
    // A question such as "Do I need to stop before surgery?" matches the procedure rule (level remind).
    expect(alertCards([hit('procedure', 'remind')], 'US', 'en', false)).toEqual([]);
    expect(alertTitle(hit('procedure', 'remind'), 'US', 'en', false)).toBeNull();
    for (const [id, level] of MILD) {
      for (const r of REGIONS) {
        expect(alertCards([hit(id, level)], r, 'en', false), id).toEqual([]);
        expect(alertTitle(hit(id, level), r, 'en', false), id).toBeNull();
      }
      expect(showsAlert(hit(id, level), false), id).toBe(false);
      // With detail cards the same hit shows the card of its rule, as before.
      expect(showsAlert(hit(id, level), true), id).toBe(true);
      expect(alertTitle(hit(id, level), 'US', 'en', true), id).toBe(triageCard(hit(id, level), 'US', 'en').title);
    }
    // Every level is either shown or not; the list of mild levels is exactly these three.
    const shown = (['crisis', 'emergency', 'act_now', 'urgent', 'contact', 'remind', 'care'] as const).filter((level) => showsAlert(hit(level === 'crisis' ? 'crisis' : 'dehydration', level), false));
    expect(shown).toEqual(['crisis', 'emergency', 'act_now', 'urgent']);
  });

  it('the hits that show a card are picked the same way, in the order given', () => {
    const hits = [hit('pancreatitis', 'emergency'), hit('pregnancy', 'contact'), hit('procedure', 'remind')];
    expect(alertHits(hits, false)).toEqual([hit('pancreatitis', 'emergency')]);
    expect(alertHits(hits, true)).toEqual(hits);
    expect(alertHits([hit('procedure', 'remind'), hit('contraception', 'remind')], false)).toEqual([]);
    expect(alertHits([CRISIS, hit('eating_too_little', 'care')], false)).toEqual([CRISIS]);
  });

  it('several hits still show the fixed card once', () => {
    const cards = alertCards([hit('pancreatitis', 'emergency'), hit('dehydration', 'urgent'), hit('procedure', 'remind')], 'US', 'en', false);
    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe('fixed');
    expect(cards[0].level).toBe('urgent');
    // A mild hit next to a crisis hit adds no fixed card.
    expect(alertCards([CRISIS, hit('procedure', 'remind')], 'US', 'en', false).map((c) => c.key)).toEqual(['crisis']);
  });

  it('a crisis hit keeps its own card', () => {
    const only = alertCards([CRISIS], 'US', 'en', false);
    expect(only).toHaveLength(1);
    expect(only[0].card).toEqual(triageCard(CRISIS, 'US', 'en'));
    expect(only[0].card.title).toBe('You are not alone');
    expect(only[0].level).toBe('crisis');
    expect(alertTitle(CRISIS, 'US', 'en', false)).toBe('You are not alone');
  });

  it('a crisis hit together with others shows the crisis card first, then the fixed card', () => {
    for (const hits of [[CRISIS, hit('chest_or_faint', 'emergency')], [hit('chest_or_faint', 'emergency'), CRISIS]]) {
      const cards = alertCards(hits, 'US', 'en', false);
      expect(cards.map((c) => c.card.title)).toEqual(['You are not alone', 'Contact your doctor right away']);
    }
  });

  it('the call button is offered with every card it can show', () => {
    for (const [id, level] of SERIOUS) expect(alertCards([hit(id, level)], 'US', 'en', false).some((c) => c.card.showEmergency), id).toBe(true);
    expect(alertCards([CRISIS], 'US', 'en', false)[0].card.showEmergency).toBe(true);
  });

  it('typed questions about an operation, birth control, pregnancy or breastfeeding match only mild rules, so they show nothing', () => {
    const ctx: TriageContext = { insulinOrSU: false, drugId: 'tirzepatide', region: 'US' };
    for (const text of ['Do I need to stop before surgery?', 'Can I take it with my birth control pill?', 'Can I get pregnant while taking this?', 'Is it safe while breastfeeding?']) {
      const hits = triageText(text, ctx);
      expect(hits.length, text).toBeGreaterThan(0);
      expect(alertCards(hits, 'US', 'en', false), text).toEqual([]);
      // The default build still shows the reminder card of the rule.
      expect(alertCards(hits, 'US', 'en', true).length, text).toBe(hits.length);
    }
  });
});

describe('matching is the same with and without detail cards', () => {
  const ctx: TriageContext = { insulinOrSU: true, drugId: 'tirzepatide', region: 'US' };

  it('a severe symptom from the symptom sheet still triggers, and shows the fixed card', () => {
    for (const kind of ['nausea', 'vomiting', 'diarrhea', 'abdominal_pain', 'dizziness'] as const) {
      const hits = triageSymptom(kind, 3, ctx);
      expect(hits.length, kind).toBeGreaterThan(0);
      expect(alertCards(hits, 'US', 'en', false).map((c) => c.card.title), kind).toEqual(['Contact your doctor right away']);
    }
  });

  it('a mild or moderate symptom does not', () => {
    for (const kind of ['vomiting', 'diarrhea', 'abdominal_pain', 'dizziness', 'nausea'] as const) for (const grade of [1, 2]) expect(triageSymptom(kind, grade, ctx)).toEqual([]);
  });
});
