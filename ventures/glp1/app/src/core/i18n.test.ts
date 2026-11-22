import { describe, expect, it } from 'vitest';
import { brandOptionLabel, brandOptions, CATALOG, DEFAULT_REGION, doseUnitLabel, drugById, drugFormText, drugLabel, drugShortName, hasLabelSource, regimenLabel, regionLabel, regionsFor, searchCatalog } from './catalog';
import { FOODS, foodName, foodShortName, foodUnit } from './foods';
import { DEFAULT_LANG, htmlLang, isLang, langOrDefault, pick, plural, profileLang, scriptFor, type Lang } from './i18n';
import { reminderFileName, reminderIcs, reminderTitle } from './ics';
import { parseLocal } from './localParse';
import { newProfile, startRegion } from './profile';
import { countdownText, scheduleText, siteLabel, SITES } from './schedule';
import { gradeLabel, SYMPTOM_ORDER, symptomLabel } from './symptoms';
import { DAY, fmtClock, fmtDay, fmtHHMM, fmtTime, fmtWhen, HOUR, weekdayLabel, weekdayLabels, zonedToUtc } from './tz';
import type { Profile } from './types';
import { emergencyDial, emergencyRegion, triageCard } from './triage';
import { cmToFtIn, defaultWeightUnit, fmtHeight, fmtWeight, ftInToCm, heightUnitFor, heightUnitLabel, toKg, unitLabel, weightUnitsFor } from './units';

const NY = 'America/New_York';
const ASCII = /^[\x20-\x7E]*$/;
const CJK = /[\u3400-\u9fff]/;

describe('language of a profile', () => {
  it('a profile saved before the lang field existed stays Chinese', () => {
    expect(profileLang({ script: 'hans' })).toBe('hans');
    expect(profileLang({})).toBe('hans');
    // The screens of that time never read `script`: such a profile was shown in Simplified text
    // whatever `script` said, and still is. Traditional is chosen with lang: 'hant'.
    expect(profileLang({ script: 'hant' })).toBe('hans');
    expect(langOrDefault({ script: 'hant' })).toBe('hans');
    // The shape an existing user has in their database today: no lang key at all.
    const saved = { ...newProfile('Asia/Shanghai'), region: 'CN', weightUnit: 'jin' } as Profile;
    delete saved.lang;
    expect(profileLang(saved)).toBe('hans');
  });

  it('lang wins over script when it is set', () => {
    expect(profileLang({ lang: 'en', script: 'hans' })).toBe('en');
    expect(profileLang({ lang: 'hant', script: 'hans' })).toBe('hant');
    expect(profileLang({ lang: 'hans', script: 'hant' })).toBe('hans');
  });

  it('ignores a lang value it does not know', () => {
    expect(profileLang({ lang: 'fr' as Lang, script: 'hant' })).toBe('hans');
    expect(profileLang({ lang: null, script: 'hans' })).toBe('hans');
    expect(isLang('en')).toBe(true);
    expect(isLang('zh')).toBe(false);
  });

  it('with no profile yet, the app starts in English', () => {
    expect(DEFAULT_LANG).toBe('en');
    expect(langOrDefault(null)).toBe('en');
    expect(langOrDefault(undefined)).toBe('en');
    expect(langOrDefault({ script: 'hans' })).toBe('hans');
  });

  it('small helpers', () => {
    expect(scriptFor('en')).toBe('hans');
    expect(scriptFor('hant')).toBe('hant');
    expect(pick('en', { en: 'a', hans: 'b' })).toBe('a');
    expect(pick('hans', { en: 'a', hans: 'b' })).toBe('b');
    expect(pick('hant', { en: 'a', hans: 'b' })).toBe('b');
    expect(pick('hant', { en: 'a', hans: 'b', hant: 'c' })).toBe('c');
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(0, 'day')).toBe('0 days');
    expect(plural(2, 'hour')).toBe('2 hours');
    expect(htmlLang('en')).toBe('en');
    expect(htmlLang('hans')).toBe('zh-Hans');
    expect(htmlLang('hant')).toBe('zh-Hant');
  });
});

describe('new profile', () => {
  it('starts in English, in the US, in pounds, and not yet set up', () => {
    const p = newProfile(NY);
    expect(p).toMatchObject({ id: 'me', lang: 'en', script: 'hans', region: 'US', weightUnit: 'lb', tz: NY, onboardedAt: null, regimen: null, aiConsent: null, dayStartHour: 4 });
    expect(profileLang(p)).toBe('en');
    expect(DEFAULT_REGION).toBe('US');
  });

  it('starts in the region of the phone\'s time zone, in any language', () => {
    expect(newProfile('Asia/Taipei', 'hant')).toMatchObject({ lang: 'hant', script: 'hant', region: 'TW', weightUnit: 'kg' });
    expect(newProfile('Asia/Shanghai', 'hans')).toMatchObject({ lang: 'hans', region: 'CN', weightUnit: 'jin' });
    expect(newProfile('Asia/Hong_Kong')).toMatchObject({ lang: 'en', region: 'HK', weightUnit: 'kg' });
    expect(newProfile('America/Los_Angeles', 'hans')).toMatchObject({ region: 'US', weightUnit: 'lb' });
    expect(startRegion('Pacific/Honolulu')).toBe('US');
  });

  it('a time zone the app does not know starts in "Other", never in the US', () => {
    for (const tz of ['Europe/London', 'Australia/Sydney', 'Asia/Tokyo', 'Europe/Berlin', 'Asia/Kolkata', 'UTC']) {
      expect(startRegion(tz), tz).toBe('OTHER');
      const p = newProfile(tz);
      expect(p, tz).toMatchObject({ lang: 'en', region: 'OTHER', weightUnit: 'kg' });
      // So an untouched default never puts a US number on an alert card.
      const where = emergencyRegion(tz, p.region);
      expect(emergencyDial(where), tz).toBeNull();
      const chest = triageCard({ id: 'chest_or_faint', level: 'emergency' }, where, 'en').body;
      expect(chest, tz).toBe('Chest pain or fainting needs care right away. Call your local emergency number.');
      const crisis = triageCard({ id: 'crisis', level: 'crisis' }, where, 'en').body;
      expect(crisis, tz).not.toMatch(/911|988/);
    }
    // A region picked by hand still decides when the time zone is unknown.
    expect(emergencyDial(emergencyRegion('Europe/London', 'US'))).toBe('911');
  });
});

describe('units', () => {
  it('labels and formats weight per language', () => {
    expect(unitLabel('lb', 'en')).toBe('lb');
    expect(unitLabel('kg', 'en')).toBe('kg');
    expect(unitLabel('lb', 'hans')).toBe('磅');
    expect(unitLabel('kg', 'hans')).toBe('公斤');
    expect(unitLabel('jin', 'hans')).toBe('斤');
    expect(unitLabel('jin', 'hant')).toBe('斤');
    expect(fmtWeight(toKg(182.4, 'lb'), 'lb', 'en')).toBe('182.4 lb');
    expect(fmtWeight(81.63, 'kg', 'en')).toBe('81.6 kg');
    expect(fmtWeight(81.63, 'kg', 'hans')).toBe('81.6 公斤');
    expect(fmtWeight(81.5, 'jin', 'hans')).toBe('163.0 斤');
  });

  it('offers jin only in Chinese', () => {
    expect(weightUnitsFor('en')).toEqual(['lb', 'kg']);
    expect(weightUnitsFor('hans')).toEqual(['kg', 'jin', 'lb']);
    expect(weightUnitsFor('hant')).toEqual(['kg', 'jin', 'lb']);
    expect(defaultWeightUnit('en', 'US')).toBe('lb');
    expect(defaultWeightUnit('en', 'CN')).toBe('kg');
    expect(defaultWeightUnit('hans', 'CN')).toBe('jin');
    expect(defaultWeightUnit('hans', 'US')).toBe('lb');
    expect(defaultWeightUnit('hans', 'HK')).toBe('kg');
    // A profile that already uses jin still gets a label in English.
    expect(unitLabel('jin', 'en')).toBe('jin');
  });

  it('converts height between centimetres and feet and inches', () => {
    expect(cmToFtIn(170)).toEqual({ ft: 5, inches: 7 });
    expect(cmToFtIn(152.4)).toEqual({ ft: 5, inches: 0 });
    expect(cmToFtIn(160)).toEqual({ ft: 5, inches: 3 });
    expect(ftInToCm(5, 7)).toBe(170.2);
    expect(ftInToCm(6)).toBe(182.9);
    expect(ftInToCm(5, 3.5)).toBe(161.3);
    expect(ftInToCm(0, 67)).toBe(170.2);
  });

  it('rounds to the nearest inch and never shows 12 inches', () => {
    expect(cmToFtIn(182)).toEqual({ ft: 6, inches: 0 }); // 71.65 in
    expect(cmToFtIn(181)).toEqual({ ft: 5, inches: 11 }); // 71.26 in
    expect(cmToFtIn(166.4)).toEqual({ ft: 5, inches: 6 }); // 65.51 in rounds up
    expect(cmToFtIn(166.3)).toEqual({ ft: 5, inches: 5 }); // 65.47 in rounds down
  });

  it('feet and inches survive a round trip through the stored centimetres', () => {
    for (let ft = 4; ft <= 7; ft++) {
      for (let inches = 0; inches < 12; inches++) expect(cmToFtIn(ftInToCm(ft, inches))).toEqual({ ft, inches });
    }
  });

  it('formats height and picks the height unit', () => {
    expect(fmtHeight(170.2, 'ft_in', 'en')).toBe('5 ft 7 in');
    expect(fmtHeight(170.2, 'cm', 'en')).toBe('170 cm');
    expect(fmtHeight(160, 'cm', 'hans')).toBe('160 厘米');
    expect(heightUnitFor('en', 'lb')).toBe('ft_in');
    expect(heightUnitFor('en', 'kg')).toBe('cm');
    expect(heightUnitFor('hans', 'lb')).toBe('cm');
    expect(heightUnitLabel('ft_in', 'en')).toBe('ft, in');
    expect(heightUnitLabel('cm', 'hans')).toBe('厘米');
  });
});

describe('dates and times', () => {
  const fri = zonedToUtc(2026, 11, 20, 21, 0, NY);

  it('uses the 12-hour clock in English and keeps 24-hour time in Chinese', () => {
    expect(fmtClock(21, 0, 'en')).toBe('9:00 PM');
    expect(fmtClock(0, 5, 'en')).toBe('12:05 AM');
    expect(fmtClock(12, 0, 'en')).toBe('12:00 PM');
    expect(fmtClock(11, 59, 'en')).toBe('11:59 AM');
    expect(fmtClock(21, 0, 'hans')).toBe('21:00');
    expect(fmtClock(0, 5, 'hans')).toBe('00:05');
    expect(fmtHHMM('08:30', 'en')).toBe('8:30 AM');
    expect(fmtHHMM('08:30', 'hant')).toBe('08:30');
    expect(fmtTime(fri, NY, 'en')).toBe('9:00 PM');
    expect(fmtTime(fri, NY, 'hans')).toBe('21:00');
  });

  it('formats a day', () => {
    expect(fmtDay(fri, NY, 'en')).toBe('Fri, Nov 20');
    expect(fmtDay(fri, NY, 'hans')).toBe('11月20日 周五');
    expect(fmtDay(zonedToUtc(2027, 1, 3, 9, 0, NY), NY, 'en')).toBe('Sun, Jan 3');
  });

  it('says "Today" for the same calendar day, otherwise the weekday', () => {
    const noon = zonedToUtc(2026, 11, 20, 12, 0, NY);
    expect(fmtWhen(fri, NY, noon, 'en')).toBe('Today 9:00 PM');
    expect(fmtWhen(fri, NY, noon, 'hans')).toBe('今天 21:00');
    expect(fmtWhen(fri + 3 * DAY, NY, noon, 'en')).toBe('Mon 9:00 PM');
    expect(fmtWhen(fri + 3 * DAY, NY, noon, 'hans')).toBe('周一 21:00');
  });

  it('names weekdays, Sunday first', () => {
    expect(weekdayLabels('en')).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(weekdayLabels('hans')).toEqual(['周日', '周一', '周二', '周三', '周四', '周五', '周六']);
    expect(weekdayLabel(1, 'en', 'long')).toBe('Monday');
    expect(weekdayLabel(0, 'hant')).toBe('周日');
  });
});

describe('schedule text', () => {
  it('describes a schedule', () => {
    expect(scheduleText({ kind: 'weekly', weekday: 1, time: '21:00' }, 'en')).toBe('Every Monday at 9:00 PM');
    expect(scheduleText({ kind: 'daily', time: '08:00' }, 'en')).toBe('Every day at 8:00 AM');
    expect(scheduleText({ kind: 'interval', hours: 72 }, 'en')).toBe('Every 3 days');
    expect(scheduleText({ kind: 'interval', hours: 24 }, 'en')).toBe('Every day');
    expect(scheduleText({ kind: 'interval', hours: 84 }, 'en')).toBe('Every 84 hours');
    expect(scheduleText({ kind: 'weekly', weekday: 1, time: '21:00' }, 'hans')).toBe('每周一 21:00');
    expect(scheduleText({ kind: 'daily', time: '08:00' }, 'hans')).toBe('每天 08:00');
    expect(scheduleText({ kind: 'interval', hours: 72 }, 'hans')).toBe('每 3 天');
  });

  it('counts down with correct plurals', () => {
    const M = 60_000;
    expect(countdownText(2 * DAY + 3 * HOUR, 0, 'en')).toBe('in 2 days 3 hours');
    expect(countdownText(DAY + HOUR, 0, 'en')).toBe('in 1 day 1 hour');
    expect(countdownText(3 * HOUR + 20 * M, 0, 'en')).toBe('in 3 hours 20 minutes');
    expect(countdownText(M, 0, 'en')).toBe('in 1 minute');
    expect(countdownText(0, 45 * M, 'en')).toBe('45 minutes ago');
    expect(countdownText(0, DAY + 2 * HOUR, 'en')).toBe('1 day 2 hours ago');
    expect(countdownText(2 * DAY, 0, 'en')).toBe('in 2 days');
    expect(countdownText(3 * HOUR, 0, 'en')).toBe('in 3 hours');
    expect(countdownText(20_000, 0, 'en')).toBe('now');
    expect(countdownText(2 * DAY, 0, 'hans')).toBe('还有 2 天 0 小时');
    expect(countdownText(2 * DAY + 3 * HOUR, 0, 'hans')).toBe('还有 2 天 3 小时');
    expect(countdownText(3 * HOUR + 20 * M, 0, 'hans')).toBe('还有 3 小时 20 分');
    expect(countdownText(0, 45 * M, 'hans')).toBe('已过 45 分钟');
  });

  it('names injection sites', () => {
    expect(SITES.map((s) => siteLabel(s, 'en'))).toEqual(['Left stomach area', 'Right stomach area', 'Left thigh', 'Right thigh', 'Left upper arm', 'Right upper arm']);
    expect(SITES.map((s) => siteLabel(s, 'hans'))).toEqual(['左腹', '右腹', '左大腿', '右大腿', '左上臂', '右上臂']);
  });
});

describe('calendar reminder in English', () => {
  const first = { year: 2026, month: 11, day: 23, hour: 21, minute: 0 };

  it('has an English title and note, and still names no medication or dose', () => {
    const s = reminderIcs({ kind: 'weekly', weekday: 1, time: '21:00' }, first, 'u1', 'en');
    expect(s).toContain('SUMMARY:Time to log your shot\r\n');
    expect(s).toContain('DESCRIPTION:Open the app to log it\r\n');
    expect(s).toContain('PRODID:-//glp1-companion//reminders//EN');
    expect(s).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(s).not.toMatch(CJK);
    expect(s).not.toMatch(/\bmg\b|tirzepatide|semaglutide|zepbound|wegovy/i);
  });

  it('has a title for pills, and escapes text that would break the file', () => {
    expect(reminderTitle('oral', 'en')).toBe('Time to log your pill');
    expect(reminderTitle('oral', 'hans')).toBe('该记吃药了');
    expect(reminderTitle('sc', 'hant')).toBe('该记一针了');
    expect(reminderFileName('en')).toBe('reminder.ics');
    expect(reminderFileName('hans')).toBe('提醒.ics');
    expect(reminderIcs({ kind: 'daily', time: '08:00' }, first, 'u1', 'en', 'Log it, then relax; done')).toContain('SUMMARY:Log it\\, then relax\\; done\r\n');
  });
});

describe('US medication list', () => {
  const us = brandOptions('US');

  it('is exactly the launch list, in order, with "Other / custom" last', () => {
    expect(us.map((o) => brandOptionLabel(o, 'US', 'en'))).toEqual([
      'Wegovy (semaglutide)',
      'Ozempic (semaglutide)',
      'Zepbound (tirzepatide)',
      'Mounjaro (tirzepatide)',
      'Wegovy pill (semaglutide)',
      'Foundayo (orforglipron)',
      'Rybelsus (semaglutide)',
      'Saxenda (liraglutide)',
      'Other / custom',
    ]);
    // "Shot", the word every other screen uses for an injection.
    expect(us.map((o) => drugFormText(o.entry, 'en')).slice(0, 8)).toEqual(['Shot · weekly', 'Shot · weekly', 'Shot · weekly', 'Shot · weekly', 'Pill · daily', 'Pill · daily', 'Pill · daily', 'Shot · daily']);
  });

  it('lets the user pick Zepbound and Mounjaro separately although they share one entry', () => {
    const zep = us.find((o) => o.brand === 'Zepbound')!;
    const mou = us.find((o) => o.brand === 'Mounjaro')!;
    expect(zep.drugId).toBe('tirzepatide');
    expect(mou.drugId).toBe('tirzepatide');
    expect(regimenLabel({ drugId: zep.drugId, brand: zep.brand }, 'US', 'en')).toBe('Zepbound (tirzepatide)');
    expect(regimenLabel({ drugId: mou.drugId, brand: mou.brand }, 'US', 'en')).toBe('Mounjaro (tirzepatide)');
    expect(drugShortName(drugById('tirzepatide'), 'US', 'en', 'Mounjaro')).toBe('Mounjaro');
    // A profile saved before brands were stored lists both, as before.
    expect(regimenLabel({ drugId: 'tirzepatide' }, 'US', 'en')).toBe('Zepbound / Mounjaro (tirzepatide)');
    expect(regimenLabel({ drugId: 'tirzepatide' }, 'US', 'hans')).toBe('Zepbound / Mounjaro（替尔泊肽）');
  });

  it('every row has a unique key and an entry of the right kind', () => {
    const keys = us.map((o) => `${o.drugId}|${o.brand}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(us.find((o) => o.brand === 'Wegovy pill')!.entry).toMatchObject({ id: 'semaglutide-oral-wl', route: 'oral', frequency: 'daily' });
    expect(us.find((o) => o.brand === 'Foundayo')!.entry).toMatchObject({ id: 'orforglipron', route: 'oral', frequency: 'daily' });
    expect(us.find((o) => o.brand === 'Saxenda')!.entry).toMatchObject({ id: 'liraglutide', route: 'sc', frequency: 'daily' });
    expect(us.find((o) => o.brand === 'Wegovy')!.entry).toMatchObject({ id: 'semaglutide-wl', route: 'sc', frequency: 'weekly' });
    expect(us[us.length - 1]).toMatchObject({ drugId: 'custom', brand: null });
  });

  it('shows names in the right language', () => {
    const pill = drugById('semaglutide-oral-wl');
    expect(drugLabel(pill, 'US', 'en')).toBe('Wegovy pill (semaglutide)');
    expect(drugLabel(pill, 'US', 'hans')).toBe('Wegovy 片（口服司美格鲁肽（减重））');
    expect(drugLabel(pill, 'US', 'hant')).toBe('Wegovy 片（口服司美格魯肽（減重））');
    expect(drugShortName(pill, 'US', 'hans')).toBe('Wegovy 片');
    expect(drugShortName(pill, 'US', 'en')).toBe('Wegovy pill');
    // No brand in the region: the generic name, which says which semaglutide it is.
    expect(drugLabel(drugById('semaglutide-wl'), 'OTHER', 'en')).toBe('semaglutide for weight');
    expect(drugLabel(drugById('semaglutide-oral-t2d'), 'OTHER', 'en')).toBe('oral semaglutide for diabetes');
    expect(drugLabel(drugById('mazdutide'), 'US', 'en')).toBe('mazdutide');
    expect(drugLabel(drugById('custom'), 'US', 'en')).toBe('Other / custom');
    expect(regimenLabel({ drugId: 'custom', customName: ' Compounded semaglutide ' }, 'US', 'en')).toBe('Compounded semaglutide');
    expect(drugFormText(drugById('tirzepatide'), 'hans')).toBe('注射 · 每周');
    expect(doseUnitLabel('clicks', 'en')).toBe('clicks');
    expect(doseUnitLabel('clicks', 'hans')).toBe('格');
    expect(doseUnitLabel('mg', 'hans')).toBe('mg');
  });

  it('English labels contain no Chinese', () => {
    for (const region of regionsFor('en')) {
      for (const o of brandOptions(region)) {
        expect(brandOptionLabel(o, region, 'en'), `${region} ${o.drugId}`).toMatch(ASCII);
        expect(drugShortName(o.entry, region, 'en', o.brand), `${region} ${o.drugId}`).toMatch(ASCII);
        expect(regimenLabel({ drugId: o.drugId, brand: o.brand }, region, 'en'), `${region} ${o.drugId}`).toMatch(ASCII);
      }
      expect(regionLabel(region, 'en')).toMatch(ASCII);
    }
    // A brand that is only written in Chinese is shown by its generic English name.
    expect(brandOptions('CN').map((o) => brandOptionLabel(o, 'CN', 'en'))).toEqual(['semaglutide for weight', 'semaglutide for diabetes', 'tirzepatide', 'mazdutide', 'liraglutide', 'oral semaglutide for diabetes', 'Other / custom']);
    expect(brandOptions('TW').map((o) => brandOptionLabel(o, 'TW', 'en'))).toEqual(['semaglutide for weight', 'semaglutide for diabetes', 'tirzepatide', 'liraglutide', 'oral semaglutide for diabetes', 'Other / custom']);
    expect(regimenLabel({ drugId: 'tirzepatide', brand: '穆峰达' }, 'CN', 'en')).toBe('tirzepatide');
    expect(regimenLabel({ drugId: 'tirzepatide', brand: '穆峰达' }, 'CN', 'hans')).toBe('穆峰达（替尔泊肽）');
    expect(regionLabel('US', 'en')).toBe('United States');
    expect(regionLabel('US', 'hans')).toBe('美国');
    expect(regionsFor('en')[0]).toBe('US');
    expect(regionsFor('hans')).toEqual(['CN', 'HK', 'TW', 'SG', 'MY', 'US', 'OTHER']);
  });

  it('other regions keep their own brands; a region without brands lists generic names', () => {
    expect(brandOptions('CN').map((o) => brandOptionLabel(o, 'CN', 'hans'))).toEqual(['诺和盈（司美格鲁肽（减重））', '诺和泰（司美格鲁肽（降糖））', '穆峰达（替尔泊肽）', '信尔美（玛仕度肽）', '利拉鲁肽（利拉鲁肽）', '诺和忻（口服司美格鲁肽（降糖））', '其他 / 自己填']);
    expect(brandOptions('OTHER').map((o) => o.brand)).toEqual([null, null, null, null, null, null, null, null, null]);
    expect(brandOptions('OTHER').map((o) => o.drugId)).toEqual(CATALOG.map((d) => d.id));
  });

  it('finds medications by English, Chinese and brand names', () => {
    expect(searchCatalog('foundayo').map((d) => d.id)).toEqual(['orforglipron']);
    expect(searchCatalog('wegovy pill').map((d) => d.id)).toEqual(['semaglutide-oral-wl']);
    expect(searchCatalog('Wegovy 片').map((d) => d.id)).toEqual(['semaglutide-oral-wl']);
    expect(searchCatalog('semaglutide').map((d) => d.id)).toEqual(['semaglutide-wl', 'semaglutide-t2d', 'semaglutide-oral-wl', 'semaglutide-oral-t2d']);
  });
});

describe('drug facts are never invented', () => {
  /** The numbers that were in the code before the US list was added. */
  const KNOWN: Record<string, { ladderMg: number[]; maxMg: number | null; pk: { halfLifeH: number; tmaxH: number } | null; fastingMin?: number }> = {
    'semaglutide-wl': { ladderMg: [0.25, 0.5, 1, 1.7, 2.4, 7.2], maxMg: 7.2, pk: { halfLifeH: 168, tmaxH: 48 } },
    'semaglutide-t2d': { ladderMg: [0.25, 0.5, 1, 2], maxMg: 2, pk: { halfLifeH: 168, tmaxH: 48 } },
    tirzepatide: { ladderMg: [2.5, 5, 7.5, 10, 12.5, 15], maxMg: 15, pk: { halfLifeH: 120, tmaxH: 24 } },
    mazdutide: { ladderMg: [], maxMg: null, pk: null },
    liraglutide: { ladderMg: [0.6, 1.2, 1.8, 2.4, 3], maxMg: 3, pk: null },
    'semaglutide-oral-wl': { ladderMg: [1.5, 4, 9, 25], maxMg: 25, pk: null, fastingMin: 30 },
    'semaglutide-oral-t2d': { ladderMg: [3, 7, 14], maxMg: 14, pk: null, fastingMin: 30 },
    orforglipron: { ladderMg: [], maxMg: null, pk: null },
    custom: { ladderMg: [], maxMg: null, pk: null },
  };

  it('an entry without a label source has only the numbers the code already had', () => {
    expect(CATALOG.map((d) => d.id)).toEqual(Object.keys(KNOWN));
    for (const d of CATALOG) {
      if (d.source) continue;
      expect({ ladderMg: d.ladderMg, maxMg: d.maxMg, pk: d.pk, fastingMin: d.fastingMin }, d.id).toEqual({ fastingMin: undefined, ...KNOWN[d.id] });
    }
  });

  it('a source is an FDA label page, and nothing is marked verified by code', () => {
    for (const d of CATALOG) {
      if (d.source) expect(d.source, d.id).toMatch(/^https:\/\/(www\.accessdata\.fda\.gov|dailymed\.nlm\.nih\.gov)\//);
      expect(hasLabelSource(d), d.id).toBe(d.source !== undefined);
      expect(d.verified, d.id).toBe(false);
    }
  });

  it('Foundayo can be logged but has no dose ladder, no dose check and no curve until its label is read', () => {
    expect(drugById('orforglipron')).toMatchObject({ ladderMg: [], maxMg: null, pk: null, verified: false });
    expect(drugById('orforglipron').source).toBeUndefined();
  });
});

describe('local parser — English', () => {
  it('reads a weight', () => {
    // Stored to 0.01 kg: 182.4 lb is 82.74 kg, which reads back as 182.4 lb (82.7 kg would read back as 182.3).
    expect(parseLocal('182.4 lb', 'kg', 'en')).toEqual({ events: [{ type: 'weight', kg: 82.74, raw: '182.4 lb' }], rest: '' });
    expect(parseLocal('weighed 182.4', 'lb', 'en')).toEqual({ events: [{ type: 'weight', kg: 82.74, raw: 'weighed 182.4' }], rest: '' });
    expect(parseLocal('weighed 82.4', 'kg', 'en').events[0]).toMatchObject({ type: 'weight', kg: 82.4 });
    expect(parseLocal('Weight 182.4 lbs', 'kg', 'en').events[0]).toMatchObject({ type: 'weight', kg: 82.74 });
    expect(parseLocal('182.4 pounds', 'kg', 'en').events[0]).toMatchObject({ type: 'weight', kg: 82.74 });
    expect(parseLocal('I weighed in at 182 this morning', 'lb', 'en')).toMatchObject({ events: [{ type: 'weight', kg: 82.55 }], rest: '' });
    for (const e of [parseLocal('182.4 lb', 'kg', 'en'), parseLocal('weighed 182.4', 'lb', 'en'), parseLocal('182.4 pounds', 'kg', 'en')]) {
      const w = e.events[0];
      expect(w.type === 'weight' && fmtWeight(w.kg, 'lb', 'en')).toBe('182.4 lb');
    }
  });

  it('ignores weights that cannot be a person', () => {
    expect(parseLocal('weighed 18', 'lb', 'en').events).toEqual([]);
    expect(parseLocal('weighed 900', 'lb', 'en').events).toEqual([]);
  });

  it('reads a dose with its unit, and the site if given', () => {
    expect(parseLocal('took 5 mg', 'lb', 'en')).toEqual({ events: [{ type: 'dose', amount: 5, unit: 'mg', site: null, raw: 'took 5 mg' }], rest: '' });
    expect(parseLocal('shot 2.5mg left thigh', 'lb', 'en')).toEqual({ events: [{ type: 'dose', amount: 2.5, unit: 'mg', site: 'thigh_l', raw: 'shot 2.5mg' }], rest: '' });
    expect(parseLocal('took my shot, 5 mg, left thigh', 'lb', 'en')).toMatchObject({ events: [{ type: 'dose', amount: 5, unit: 'mg', site: 'thigh_l' }], rest: '' });
    expect(parseLocal('Injected 7.5 mg in the right side of my stomach', 'lb', 'en')).toMatchObject({ events: [{ type: 'dose', amount: 7.5, unit: 'mg', site: 'abd_r' }], rest: '' });
    expect(parseLocal('took 20 units right arm', 'lb', 'en')).toMatchObject({ events: [{ type: 'dose', amount: 20, unit: 'units', site: 'arm_r' }], rest: '' });
    expect(parseLocal('took 0.25 mg', 'lb', 'en').events[0]).toMatchObject({ amount: 0.25 });
  });

  it('reads a dose and a weight from one message', () => {
    const r = parseLocal('took 5 mg, weighed 182.4', 'lb', 'en');
    expect(r.events.map((e) => e.type).sort()).toEqual(['dose', 'weight']);
    expect(r.rest).toBe('');
  });

  it('never guesses a dose: no unit, a lost decimal point, or another medicine all fall through', () => {
    expect(parseLocal('took 5', 'lb', 'en')).toEqual({ events: [], rest: 'took 5' });
    expect(parseLocal('took .5 mg', 'lb', 'en').events).toEqual([]);
    expect(parseLocal('took 500 mg acetaminophen', 'lb', 'en')).toEqual({ events: [], rest: 'took 500 mg acetaminophen' });
    expect(parseLocal('took 5 mg and my stomach hurts', 'lb', 'en').events).toEqual([]);
    expect(parseLocal('should I take 5 mg', 'lb', 'en').events).toEqual([]);
  });

  it('lets everything else fall through untouched', () => {
    expect(parseLocal('had a turkey sandwich for lunch', 'lb', 'en')).toEqual({ events: [], rest: 'had a turkey sandwich for lunch' });
    expect(parseLocal('a little nauseous', 'lb', 'en')).toEqual({ events: [], rest: 'a little nauseous' });
  });

  it('labels locally recognised food in the profile language', () => {
    const en = parseLocal('two eggs', 'lb', 'en').events[0];
    expect(en.type === 'food' && en.items[0].label).toBe('Egg × 2');
    const zh = parseLocal('two eggs', 'lb', 'hans').events[0];
    expect(zh.type === 'food' && zh.items[0].label).toBe('鸡蛋 × 2');
  });
});

describe('food and symptom names', () => {
  it('every food has an English name and portion word', () => {
    for (const f of FOODS) {
      expect(foodName(f, 'en'), f.id).toMatch(/^[A-Z][\x20-\x7E]+$/);
      expect(foodUnit(f, 'en'), f.id).toMatch(/^[a-z]+$/);
      expect(foodName(f, 'hans')).toBe(f.name);
      expect(foodUnit(f, 'hant')).toBe(f.unit);
    }
    const soy = FOODS.find((f) => f.id === 'soymilk')!;
    expect(foodShortName(soy, 'en')).toBe('Soy milk');
    expect(foodShortName(soy, 'hans')).toBe('豆浆');
    expect(foodShortName(FOODS.find((f) => f.id === 'fish')!, 'en')).toBe('Fish or shrimp');
    expect(foodShortName(FOODS.find((f) => f.id === 'fish')!, 'hans')).toBe('鱼或虾');
  });

  it('names symptoms and grades', () => {
    expect(new Set(SYMPTOM_ORDER).size).toBe(13);
    for (const k of SYMPTOM_ORDER) {
      expect(symptomLabel(k, 'en'), k).toMatch(/^[A-Z][a-z ]+$/);
      expect(symptomLabel(k, 'hans'), k).toMatch(CJK);
    }
    expect(symptomLabel('nausea', 'en')).toBe('Nausea');
    expect(symptomLabel('nausea', 'hans')).toBe('恶心');
    expect(symptomLabel('other', 'en')).toBe('Not feeling well');
    expect(symptomLabel('other', 'hans')).toBe('不舒服');
    expect([0, 1, 2, 3].map((g) => gradeLabel(g, 'en'))).toEqual(['None', 'Mild', 'Moderate', 'Severe']);
    expect([0, 1, 2, 3].map((g) => gradeLabel(g, 'hans'))).toEqual(['没有', '轻', '中', '重']);
    expect(gradeLabel(9, 'en')).toBe('');
  });
});
