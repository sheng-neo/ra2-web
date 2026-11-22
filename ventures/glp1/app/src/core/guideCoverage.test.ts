import { describe, expect, it } from 'vitest';
import { alertCards, alertHits, fixedAlertCard } from './alert';
import { BUTTONS_THAT_RAISE_NOTHING, buttonItems, buttonRules, GENERAL_SIGN, guidesWithItem, ITEM_COVERAGE, NOT_FROM_A_GUIDE, OTHER_COVERAGE, reminderFor, ruleItems, showsLaunchCard } from './guideCoverage';
import { guideItems, MED_GUIDE_LIST, MED_GUIDE_OTHER, type GuideItemId, type GuideOtherKind, type MedGuideKey } from './medGuide';
import { SYMPTOM_ORDER } from './symptoms';
import { triageRuleLevels, triageSymptom, triageText, type TriageContext, type TriageId } from './triage';

const ctx: TriageContext = { insulinOrSU: false, drugId: 'tirzepatide', region: 'US' };
const ALL_RULES = Object.keys(triageRuleLevels()) as TriageId[];
const oneSentence = (s: string | undefined) => s !== undefined && s.trim().length > 20 && /[.]$/.test(s);
/** The guide's words as a person would say them of themselves: "your neck" becomes "my neck". */
const asOwn = (words: string) => words.replace(/\byour\b/g, 'my');
const coverageOf = (item: GuideItemId) => ITEM_COVERAGE.find((c) => c.item === item);

describe('from the guides to the rules', () => {
  it('every item of every guide is in the table, once', () => {
    const inGuides = new Set(MED_GUIDE_LIST.flatMap((g) => guideItems(g).map((i) => i.id)));
    expect(ITEM_COVERAGE.map((c) => c.item).sort()).toEqual([...inGuides].sort());
    expect(new Set(ITEM_COVERAGE.map((c) => c.item)).size).toBe(ITEM_COVERAGE.length);
  });

  it('every sign a guide names is accounted for, in the guide\'s own words, and the table has no words that are in no guide', () => {
    for (const g of MED_GUIDE_LIST) {
      for (const item of guideItems(g)) {
        const row = coverageOf(item.id);
        expect(row, `${g.key} ${item.id}`).toBeDefined();
        for (const sign of item.symptoms) expect(row!.signs.filter((s) => s.words.includes(sign)), `${g.key} ${item.id}: "${sign}"`).toHaveLength(1);
      }
    }
    for (const row of ITEM_COVERAGE) {
      const inGuides = new Set(MED_GUIDE_LIST.flatMap((g) => guideItems(g).filter((i) => i.id === row.item).flatMap((i) => i.symptoms)));
      for (const sign of row.signs) for (const words of sign.words) expect(inGuides.has(words), `${row.item}: "${words}" is in no guide`).toBe(true);
      expect(new Set(row.signs.flatMap((s) => s.words)).size, row.item).toBe(row.signs.flatMap((s) => s.words).length);
    }
  });

  it('a sign has a rule that raises the card for it, or a reason why none does; an item without signs has a reason', () => {
    for (const row of ITEM_COVERAGE) {
      if (row.signs.length === 0) expect(oneSentence(row.reason), `${row.item}: reason`).toBe(true);
      else expect(row.reason, row.item).toBeUndefined();
      for (const sign of row.signs) {
        const where = `${row.item}: "${sign.words[0]}"`;
        if (sign.alone) expect(sign.rules.length, where).toBeGreaterThan(0);
        else expect(oneSentence(sign.reason), `${where}: reason`).toBe(true);
        for (const rule of sign.rules) expect(ALL_RULES, where).toContain(rule);
      }
    }
  });

  it('an item that tells the patient to tell, call or get help, and names signs, has every sign covered or explained', () => {
    for (const g of MED_GUIDE_LIST) {
      for (const item of guideItems(g)) {
        if (item.action === 'none' || item.symptoms.length === 0) continue;
        for (const words of item.symptoms) {
          const sign = coverageOf(item.id)!.signs.find((s) => s.words.includes(words))!;
          expect(sign.alone || oneSentence(sign.reason), `${g.key} ${item.id}: "${words}"`).toBe(true);
          // Only the list of low-blood-sugar signs has signs that do not raise the card alone.
          if (!sign.alone) expect(item.id, words).toBe('low_blood_sugar');
        }
      }
    }
  });

  it('the guide\'s own words, said of oneself, raise the card through one of the rules named', () => {
    for (const row of ITEM_COVERAGE) {
      for (const sign of row.signs) {
        for (const words of sign.words) {
          const typed = asOwn(words);
          const fired = triageText(typed, ctx).map((h) => h.id);
          if (sign.alone) {
            expect(fired.some((id) => sign.rules.includes(id)), `"${typed}" fired ${JSON.stringify(fired)}, expected one of ${JSON.stringify(sign.rules)}`).toBe(true);
            expect(alertCards(alertHits(triageText(typed, ctx), false), 'US', 'en', false).map((c) => c.card), typed).toEqual([fixedAlertCard('US', 'en')]);
          } else if (!/ or |, /.test(words)) {
            // One sign of the low-blood-sugar list alone: nothing. (A line that names two signs, such as "confusion or drowsiness", is two.)
            expect(fired, `"${typed}" alone`).toEqual([]);
          }
        }
      }
    }
  });

  it('two signs of the low-blood-sugar list raise the card; two of the common ones alone do not', () => {
    const fires = (t: string) => triageText(t, ctx).some((h) => h.id === 'hypoglycemia');
    for (const pair of ['sweating and shakiness', 'slurred speech and confusion', 'shakiness and hunger', 'sweating and a headache', 'confusion and weakness', 'feeling jittery and anxiety']) expect(fires(pair), pair).toBe(true);
    for (const pair of ['hunger and a headache', 'weakness and hunger', 'anxiety and a headache', 'irritability and hunger']) expect(triageText(pair, ctx), pair).toEqual([]);
  });

  it('a rule named for a sign shows the fixed card in the first public version, so the card is never weaker than the guide\'s instruction', () => {
    const fixed = fixedAlertCard('US', 'en');
    // The fixed card says "right away" and offers the emergency number: the strongest instruction of any item.
    expect(fixed.title).toBe('Contact your doctor right away');
    expect(fixed.body).toMatch(/Contact your doctor right away\. If it is an emergency, call 911\.$/);
    expect(fixed.showEmergency).toBe(true);
    for (const row of ITEM_COVERAGE) {
      for (const sign of row.signs) {
        for (const rule of sign.rules) {
          for (const level of triageRuleLevels()[rule]) expect(alertCards([{ id: rule, level }], 'US', 'en', false).map((c) => c.card), `${row.item}: ${rule} at ${level}`).toEqual([fixed]);
        }
      }
    }
  });

  it('every kind of other instruction in the guides has its line, and none of them is left to a card', () => {
    const kinds = new Set(MED_GUIDE_LIST.flatMap((g) => MED_GUIDE_OTHER[g.key as MedGuideKey].map((o) => o.kind)));
    expect(Object.keys(OTHER_COVERAGE).sort()).toEqual([...kinds].sort());
    for (const [kind, row] of Object.entries(OTHER_COVERAGE)) {
      expect(oneSentence(row.reason), kind).toBe(true);
      // A reminder rule shows no card in the first public version.
      if (row.reminder) expect(showsLaunchCard(row.reminder), kind).toBe(false);
    }
    expect(reminderFor('pregnancy')).toEqual(['pregnancy', 'pregnancy_registry', 'breastfeeding'] satisfies GuideOtherKind[]);
    expect(reminderFor('procedure')).toEqual(['aspiration_anesthesia']);
    expect(reminderFor('contraception')).toEqual(['birth_control']);
  });
});

describe('from the rules to the guides', () => {
  it('every rule is accounted for: it stands for guide items, it is a reminder for an instruction, or it is marked as not from a guide', () => {
    expect(GENERAL_SIGN).toBe('general emergency sign, not from a Medication Guide');
    for (const rule of ALL_RULES) {
      const whole = NOT_FROM_A_GUIDE.some((n) => n.rule === rule && n.whole);
      const accounted = ruleItems(rule).length > 0 || reminderFor(rule).length > 0 || whole;
      expect(accounted, rule).toBe(true);
      // A rule marked as a whole stands for no guide item, and the other way round.
      if (whole) expect(ruleItems(rule), rule).toEqual([]);
    }
    for (const n of NOT_FROM_A_GUIDE) {
      expect(ALL_RULES, n.part).toContain(n.rule);
      expect(oneSentence(n.reason), `${n.rule}: reason`).toBe(true);
      expect(n.part.trim(), n.rule).not.toBe('');
    }
  });

  it('a rule that shows a card in the first public version has a guide item behind it, or the mark with a reason', () => {
    const withCard = ALL_RULES.filter(showsLaunchCard);
    expect(withCard.sort()).toEqual(['abdominal_pain_severe', 'anaphylaxis', 'chest_or_faint', 'crisis', 'dehydration', 'gallbladder', 'hypoglycemia', 'pancreatitis', 'thyroid', 'vision']);
    for (const rule of withCard) expect(ruleItems(rule).length > 0 || NOT_FROM_A_GUIDE.some((n) => n.rule === rule && n.whole), rule).toBe(true);
    // The only card rule with no guide item at all is the crisis rule, which keeps its own card.
    expect(withCard.filter((rule) => ruleItems(rule).length === 0)).toEqual(['crisis']);
    // The rules that show no card are the four reminders.
    expect(ALL_RULES.filter((r) => !showsLaunchCard(r)).sort()).toEqual(['contraception', 'eating_too_little', 'pregnancy', 'procedure']);
  });

  it('the items each card rule stands for', () => {
    expect(Object.fromEntries(ALL_RULES.filter(showsLaunchCard).map((r) => [r, ruleItems(r)]))).toEqual({
      crisis: [],
      pancreatitis: ['pancreatitis', 'severe_stomach'],
      chest_or_faint: ['low_blood_sugar', 'allergic_reaction', 'heart_rate'],
      anaphylaxis: ['thyroid_tumors', 'allergic_reaction'],
      vision: ['low_blood_sugar', 'vision_changes'],
      hypoglycemia: ['low_blood_sugar', 'allergic_reaction'],
      dehydration: ['low_blood_sugar', 'kidney_dehydration', 'severe_stomach', 'allergic_reaction'],
      gallbladder: ['gallbladder'],
      thyroid: ['thyroid_tumors', 'allergic_reaction'],
      abdominal_pain_severe: ['pancreatitis', 'gallbladder', 'severe_stomach'],
    });
  });

  it('the parts kept without a guide behind them really are in no guide', () => {
    const everyWord = MED_GUIDE_LIST.flatMap((g) => guideItems(g).flatMap((i) => [i.text, ...i.bullets])).join(' ').toLowerCase();
    for (const absent of ['suicid', 'self-harm', 'chest pain', 'urine', 'blood in', 'bleeding', 'tarry']) expect(everyWord, absent).not.toContain(absent);
    // And each of them does raise a card today.
    for (const [typed, rule] of [['chest pain', 'chest_or_faint'], ["I haven't peed all day", 'dehydration'], ['vomited blood', 'abdominal_pain_severe'], ['I want to die', 'crisis']] as const) expect(triageText(typed, ctx).map((h) => h.id), typed).toContain(rule);
  });
});

describe('the symptom buttons at "Severe"', () => {
  it('every button is accounted for: it stands for guide items and raises the card for everyone, or it raises nothing and says why', () => {
    for (const kind of SYMPTOM_ORDER) {
      const items = buttonItems(kind);
      const why = BUTTONS_THAT_RAISE_NOTHING[kind];
      if (items.length > 0) {
        expect(why, kind).toBeUndefined();
        for (const insulinOrSU of [false, true]) {
          const hits = triageSymptom(kind, 3, { ...ctx, insulinOrSU });
          expect(alertCards(alertHits(hits, false), 'US', 'en', false).map((c) => c.card), `${kind} / insulin ${insulinOrSU}`).toEqual([fixedAlertCard('US', 'en')]);
        }
      } else {
        expect(oneSentence(why), kind).toBe(true);
        expect(buttonRules(kind), kind).toEqual([]);
      }
      // Below "Severe" no button raises anything.
      for (const grade of [0, 1, 2]) expect(triageSymptom(kind, grade, { ...ctx, insulinOrSU: true }), `${kind} ${grade}`).toEqual([]);
    }
    expect(Object.keys(BUTTONS_THAT_RAISE_NOTHING).every((k) => (SYMPTOM_ORDER as string[]).includes(k))).toBe(true);
  });

  it('the items each button stands for, and the rule it raises', () => {
    expect(Object.fromEntries(SYMPTOM_ORDER.filter((k) => buttonItems(k).length).map((k) => [k, { items: buttonItems(k), rules: buttonRules(k) }]))).toEqual({
      nausea: { items: ['kidney_dehydration', 'severe_stomach'], rules: ['dehydration'] },
      vomiting: { items: ['kidney_dehydration', 'severe_stomach'], rules: ['dehydration'] },
      diarrhea: { items: ['kidney_dehydration', 'severe_stomach'], rules: ['dehydration'] },
      dizziness: { items: ['low_blood_sugar', 'allergic_reaction'], rules: ['dehydration', 'hypoglycemia'] },
      abdominal_pain: { items: ['pancreatitis', 'gallbladder', 'severe_stomach'], rules: ['abdominal_pain_severe'] },
    });
  });

  it('every item whose guide says "right away", or "get medical help", has a button that leads to it', () => {
    const urgent = new Set(MED_GUIDE_LIST.flatMap((g) => guideItems(g).filter((i) => i.action === 'right_away' || i.action === 'emergency').map((i) => i.id)));
    expect([...urgent].sort()).toEqual(['allergic_reaction', 'gallbladder', 'kidney_dehydration', 'pancreatitis']);
    for (const item of urgent) expect(SYMPTOM_ORDER.some((k) => buttonItems(k).includes(item)), item).toBe(true);
  });
});

describe('where each item is', () => {
  it('names the guides that have an item', () => {
    expect(guidesWithItem('pancreatitis')).toHaveLength(7);
    expect(guidesWithItem('heart_rate')).toEqual(['wegovy', 'saxenda']);
    expect(guidesWithItem('vision_changes')).not.toContain('saxenda');
  });
});
