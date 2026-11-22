import { describe, expect, it } from 'vitest';
import { brandOptions, CATALOG, hasLabelSource } from './catalog';
import { LABELS } from './labelFacts';
import { GUIDE_ACTIONS, guideChoice, guideDated, guideItems, MED_GUIDE_LIST, MED_GUIDE_OTHER, MED_GUIDES, MED_GUIDES_READ_ON, medGuideFor, type GuideItem, type MedGuide, type MedGuideKey } from './medGuide';

/** Every string of a guide that holds the guide's words. */
function words(g: MedGuide): string[] {
  const ofItem = (i: GuideItem) => [i.text, ...i.bullets, ...(i.after === undefined ? [] : [i.after]), ...i.symptoms];
  return [g.title, g.revised, g.approval, g.mostImportant.question, g.mostImportant.intro, g.seriousSideEffects.question, g.seriousSideEffects.intro, ...guideItems(g).flatMap(ofItem), ...MED_GUIDE_OTHER[g.key as MedGuideKey].flatMap((o) => [o.text])];
}

describe('the Medication Guides that were read', () => {
  it('there are seven, one per US label, each with the set id, version, date and page of that label', () => {
    expect(MED_GUIDES_READ_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MED_GUIDE_LIST).toHaveLength(7);
    expect(Object.keys(MED_GUIDES).sort()).toEqual(Object.keys(LABELS).sort());
    for (const [key, g] of Object.entries(MED_GUIDES)) {
      expect(g.key).toBe(key);
      expect(g.setid, key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      // The page address matches the set id.
      expect(g.url, key).toBe(`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${g.setid}`);
      expect(g.version, key).toMatch(/^\d+$/);
      expect(g.effective, key).toMatch(/^20\d{6}$/);
      // The guide is part of the label the medication numbers were read from: same file, same version.
      const label = LABELS[key as keyof typeof LABELS];
      expect({ setid: g.setid, version: g.version, effective: g.effective, url: g.url }, key).toEqual({ setid: label.setid, version: label.version, effective: label.effective, url: label.url });
      expect(g.revised, key).toMatch(/^(Revised|Issued): \S.*\d{4}$/);
      expect(g.approval, key).toMatch(/^This Medication Guide has been approved by the U\.S\. Food and Drug Administration\.?$/);
      expect(g.title, key).toMatch(/^medication guide /i);
    }
    expect(new Set(MED_GUIDE_LIST.map((g) => g.setid)).size).toBe(7);
  });

  it('every US brand of every label-backed catalog entry has exactly one guide, and a guide names only such brands', () => {
    const backed = CATALOG.filter(hasLabelSource);
    expect(backed.length).toBeGreaterThan(0);
    const pairs = backed.flatMap((d) => (d.brands.US ?? []).map((brand) => ({ id: d.id, brand })));
    expect(pairs).toHaveLength(9);
    for (const { id, brand } of pairs) {
      expect(MED_GUIDE_LIST.filter((g) => g.brands[brand] === id), `${id} / ${brand}`).toHaveLength(1);
      expect(medGuideFor(id, brand)?.brands[brand], brand).toBe(id);
    }
    const named = MED_GUIDE_LIST.flatMap((g) => Object.entries(g.brands).map(([brand, id]) => `${id} / ${brand}`));
    expect(named.sort()).toEqual(pairs.map((p) => `${p.id} / ${p.brand}`).sort());
    // A brand that is not a US brand of the entry, and an entry without a label, have no guide.
    expect(medGuideFor('tirzepatide', '穆峰达')).toBeUndefined();
    expect(medGuideFor('semaglutide-wl', 'Ozempic')).toBeUndefined();
    expect(medGuideFor('mazdutide', '信尔美')).toBeUndefined();
    expect(medGuideFor('custom', '')).toBeUndefined();
  });

  it('no text is empty, and white space is one plain space', () => {
    for (const g of MED_GUIDE_LIST) {
      for (const s of words(g)) {
        expect(s.trim(), g.key).not.toBe('');
        expect(s, g.key).toBe(s.trim());
        expect(s, g.key).not.toMatch(/\s{2,}|[\t\n\r ]/);
      }
      for (const other of MED_GUIDE_OTHER[g.key as MedGuideKey]) expect(other.under, g.key).toBe(other.under.trim());
    }
  });

  it('item ids are unique within a guide, and every action is one of the fixed set', () => {
    for (const g of MED_GUIDE_LIST) {
      const ids = guideItems(g).map((i) => i.id);
      expect(new Set(ids).size, g.key).toBe(ids.length);
      for (const i of guideItems(g)) expect(GUIDE_ACTIONS, `${g.key} ${i.id}`).toContain(i.action);
      for (const o of MED_GUIDE_OTHER[g.key as MedGuideKey]) expect(['emergency', 'right_away', 'tell'], `${g.key} ${o.kind}`).toContain(o.action);
    }
  });

  it('each guide has the two "most important" items, then the serious side effects, the first of which points back', () => {
    for (const g of MED_GUIDE_LIST) {
      expect(g.mostImportant.items.map((i) => i.id), g.key).toEqual(['thyroid_tumors', 'thyroid_do_not_use']);
      expect(g.mostImportant.question, g.key).toMatch(/^What is the most important information I should know about .+\?$/);
      expect(g.seriousSideEffects.question, g.key).toMatch(/^What are the possible side effects of .+\?$/);
      expect(g.seriousSideEffects.intro, g.key).toMatch(/may cause serious side effects,? including:$/);
      expect(g.seriousSideEffects.items[0].id, g.key).toBe('see_most_important');
      expect(g.seriousSideEffects.items.length, g.key).toBeGreaterThanOrEqual(9);
      for (const id of ['pancreatitis', 'kidney_dehydration', 'severe_stomach', 'allergic_reaction', 'gallbladder', 'low_blood_sugar', 'aspiration_anesthesia'] as const) expect(g.seriousSideEffects.items.map((i) => i.id), `${g.key} ${id}`).toContain(id);
    }
  });

  it('lead, instruction and symptoms are slices of the item: they add no words', () => {
    for (const g of MED_GUIDE_LIST) {
      for (const i of guideItems(g)) {
        const where = `${g.key} ${i.id}`;
        expect(i.text.startsWith(i.lead), where).toBe(true);
        expect(i.text.includes(i.instruction), where).toBe(true);
        const own = [i.text, ...i.bullets, i.after ?? ''];
        for (const s of i.symptoms) expect(own.some((part) => part.includes(s)), `${where}: ${s}`).toBe(true);
        // An item that tells the patient to contact someone has the sentence that says so, and the other way round.
        expect(i.instruction === '' ? i.action : 'has words', where).not.toBe(i.action === 'none' ? 'has no words' : i.action);
      }
    }
  });

  it('the action is the one the words of the instruction give', () => {
    for (const g of MED_GUIDE_LIST) {
      for (const i of guideItems(g)) {
        const where = `${g.key} ${i.id}`;
        if (i.action === 'emergency') expect(i.instruction, where).toMatch(/get medical help right away/);
        if (i.action === 'right_away') expect(i.instruction, where).toMatch(/(call|[Tt]ell) your healthcare provider right away/);
        if (i.action === 'tell') {
          expect(i.instruction, where).toMatch(/(Tell|Call|Talk to) (all )?your healthcare provider/);
          expect(i.instruction, where).not.toMatch(/right away/);
        }
        expect(i.stopUsing, where).toBe(/^Stop (using|taking) /.test(i.instruction));
      }
      // The one instruction outside the two parts that names an emergency room: taking too much.
      const emergency = MED_GUIDE_OTHER[g.key as MedGuideKey].filter((o) => o.action === 'emergency');
      expect(emergency.map((o) => o.kind), g.key).toEqual(['overdose']);
      expect(emergency[0].text, g.key).toMatch(/nearest hospital emergency room right away/);
    }
  });

  it('what the guides say differently is kept: gallbladder is "right away" in five guides, and three items are not in every guide', () => {
    const actionOf = (id: string) => Object.fromEntries(MED_GUIDE_LIST.map((g) => [g.key, guideItems(g).find((i) => i.id === id)?.action ?? null]));
    expect(actionOf('gallbladder')).toEqual({ wegovy: 'tell', ozempic: 'right_away', semaglutideTablets: 'right_away', zepbound: 'right_away', mounjaro: 'right_away', saxenda: 'tell', foundayo: 'right_away' });
    expect(actionOf('heart_rate')).toEqual({ wegovy: 'tell', ozempic: null, semaglutideTablets: null, zepbound: null, mounjaro: null, saxenda: 'tell', foundayo: null });
    expect(actionOf('vision_changes').saxenda).toBeNull();
    expect(actionOf('low_blood_sugar')).toEqual({ wegovy: 'tell', ozempic: 'none', semaglutideTablets: 'none', zepbound: 'none', mounjaro: 'none', saxenda: 'tell', foundayo: 'none' });
    for (const id of ['pancreatitis', 'kidney_dehydration']) expect(new Set(Object.values(actionOf(id))), id).toEqual(new Set(['right_away']));
    expect(new Set(Object.values(actionOf('allergic_reaction')))).toEqual(new Set(['emergency']));
  });
});

describe('the date line as part of a sentence', () => {
  it('keeps the guide\'s own word and date', () => {
    expect(guideDated(MED_GUIDES.wegovy, 'en')).toBe('revised 06/2026');
    expect(guideDated(MED_GUIDES.mounjaro, 'en')).toBe('revised August 2026');
    expect(guideDated(MED_GUIDES.foundayo, 'en')).toBe('issued 07/2026');
    expect(guideDated(MED_GUIDES.wegovy, 'hans')).toBe('修订于 06/2026');
    expect(guideDated(MED_GUIDES.foundayo, 'hans')).toBe('发布于 07/2026');
    // Only the first letter and the colon change.
    for (const g of MED_GUIDE_LIST) expect(guideDated(g, 'en'), g.key).toBe(`${g.revised[0].toLowerCase()}${g.revised.slice(1).replace(': ', ' ')}`);
  });
});

describe('which guide a saved medication gets', () => {
  it('each row of the US medication list gets the guide of its brand; "Other / custom" gets none', () => {
    const got = brandOptions('US').map((o) => {
      const c = guideChoice({ drugId: o.drugId, brand: o.brand ?? undefined }, 'US');
      return [o.brand, c.kind === 'guide' ? `${c.guide.key}/${c.brand}` : c.kind];
    });
    expect(got).toEqual([
      ['Wegovy', 'wegovy/Wegovy'],
      ['Ozempic', 'ozempic/Ozempic'],
      ['Zepbound', 'zepbound/Zepbound'],
      ['Mounjaro', 'mounjaro/Mounjaro'],
      ['Wegovy pill', 'wegovy/Wegovy pill'],
      ['Foundayo', 'foundayo/Foundayo'],
      ['Rybelsus', 'semaglutideTablets/Rybelsus'],
      ['Ozempic pill', 'semaglutideTablets/Ozempic pill'],
      ['Saxenda', 'saxenda/Saxenda'],
      [null, 'none'],
    ]);
  });

  it('a regimen saved without a brand uses the only brand of its region; tirzepatide in the US is asked to choose', () => {
    expect(guideChoice({ drugId: 'semaglutide-wl' }, 'US')).toMatchObject({ kind: 'guide', brand: 'Wegovy' });
    expect(guideChoice({ drugId: 'tirzepatide' }, 'US')).toEqual({ kind: 'chooseBrand', brands: ['Zepbound', 'Mounjaro'] });
    // A brand that is not one of the two is not guessed at.
    expect(guideChoice({ drugId: 'tirzepatide', brand: '穆峰达' }, 'US')).toEqual({ kind: 'chooseBrand', brands: ['Zepbound', 'Mounjaro'] });
  });

  it('no medication, no US brand, or a region whose list does not offer the US brands: none on file', () => {
    expect(guideChoice(null, 'US')).toEqual({ kind: 'none' });
    expect(guideChoice(undefined, 'US')).toEqual({ kind: 'none' });
    expect(guideChoice({ drugId: 'custom' }, 'US')).toEqual({ kind: 'none' });
    expect(guideChoice({ drugId: 'mazdutide', brand: '信尔美' }, 'CN')).toEqual({ kind: 'none' });
    // The region "Other" lists medications by generic name, with no brand.
    for (const o of brandOptions('OTHER')) expect(guideChoice({ drugId: o.drugId, brand: o.brand ?? undefined }, 'OTHER'), o.drugId).toEqual({ kind: 'none' });
    // Mainland China: the brand names there are not US brands, and its list has neither Zepbound nor Mounjaro.
    expect(guideChoice({ drugId: 'tirzepatide', brand: '穆峰达' }, 'CN')).toEqual({ kind: 'none' });
    expect(guideChoice({ drugId: 'tirzepatide' }, 'CN')).toEqual({ kind: 'none' });
    expect(guideChoice({ drugId: 'semaglutide-wl', brand: '诺和盈' }, 'CN')).toEqual({ kind: 'none' });
    expect(guideChoice({ drugId: 'not-in-the-catalog' }, 'US')).toEqual({ kind: 'none' });
  });
});

describe('the guides are US documents', () => {
  it('a brand of the same name in another region gets no US guide', async () => {
    const { guideChoice, guideOverdose, MED_GUIDE_LIST } = await import('./medGuide');
    for (const region of ['HK', 'SG', 'MY', 'CN', 'TW', 'OTHER'] as const) {
      for (const reg of [{ drugId: 'semaglutide-wl', brand: 'Wegovy' }, { drugId: 'tirzepatide', brand: 'Mounjaro' }, { drugId: 'liraglutide', brand: 'Saxenda' }, { drugId: 'semaglutide-t2d', brand: 'Ozempic' }]) {
        expect(guideChoice(reg, region).kind, `${region} ${reg.brand}`).toBe('none');
      }
    }
    expect(guideChoice({ drugId: 'semaglutide-wl', brand: 'Wegovy' }, 'US').kind).toBe('guide');
    // Every guide has its sentence about taking too much, and it names the emergency room.
    for (const g of MED_GUIDE_LIST) expect(guideOverdose(g)?.text, g.key).toMatch(/If you take too much .* emergency room right away/);
  });
});
