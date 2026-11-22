import { useMemo, useRef, useState } from 'react';
import { brandOptionLabel, drugById, drugFormText, regionLabel, regionsFor, searchCatalog, type BrandOption, type DoseUnit, type Region } from '../../core/catalog';
import { DEFAULT_LANG, htmlLang, isChinese, LANGS, profileLang, scriptFor, type Lang } from '../../core/i18n';
import { NO_SAFETY_FLAGS, startRegion } from '../../core/profile';
import type { Schedule } from '../../core/schedule';
import { weekdayLabels } from '../../core/tz';
import type { CourseStatus, Profile, Safety } from '../../core/types';
import { defaultWeightUnit, ftInToCm, heightUnitFor, storedKg, toKg, unitLabel, weightUnitsFor, type WeightUnit } from '../../core/units';
import { base, db, deviceTz } from '../db';
import { disclaimer, statusLabel } from '../content/labels';
import { Chips, fromLocalInput, toLocalInput } from '../components/ui';
import { I18nProvider, LANGUAGE_NAMES, translator } from '../i18n';
import { brandIn, englishRows, isRowPicked, needsBrandPick, setupStart } from '../setupChoice';

const SETUP_STATUSES = ['escalating', 'maintenance', 'not_started', 'stopped'] as const;
const SAFETY_KEYS = ['kidneyOrLiver', 'pregnancy', 'insulinOrSU', 'eatingDisorder', 'under18'] as const;

/** Every name a row of the English medication list can be found by. */
function optionNames(o: BrandOption, region: Region): string[] {
  const e = o.entry;
  return [brandOptionLabel(o, region, 'en'), o.brand ?? '', e.generic.en, e.generic.hans, e.generic.hant, e.ingredient ?? ''];
}

export function Onboarding({ existing }: { existing: Profile | null }) {
  const [step, setStep] = useState(0);
  // A saved profile keeps its language (Chinese when it has no lang field). A new one starts in English.
  const [lang, setLang] = useState<Lang>(existing ? profileLang(existing) : DEFAULT_LANG);
  const t = translator(lang);
  // A new user starts in the region of the phone's time zone, in either language (see startRegion).
  const [region, setRegion] = useState<Region>(existing?.region ?? startRegion(deviceTz()));
  const [unit, setUnit] = useState<WeightUnit>(existing?.weightUnit ?? defaultWeightUnit(lang, startRegion(deviceTz())));
  // The unit follows the language until the user picks one by hand.
  const unitPicked = useRef(false);
  const [q, setQ] = useState('');
  // Redoing setup starts from the saved medication and schedule, not from blank defaults.
  const saved = existing?.regimen ?? null;
  const start = setupStart(saved);
  const [drugId, setDrugId] = useState<string | null>(saved?.drugId ?? null);
  const [brand, setBrand] = useState<string | null>(existing ? brandIn(existing.region, saved?.drugId, saved?.brand) : null);
  const [status, setStatus] = useState<CourseStatus>(start.status);
  const [amount, setAmount] = useState(start.amount);
  const [doseUnit, setDoseUnit] = useState<DoseUnit>(start.doseUnit);
  const [weekday, setWeekday] = useState(start.weekday ?? new Date().getDay());
  const [time, setTime] = useState(start.time);
  const [intervalDays, setIntervalDays] = useState(start.intervalDays);
  const [freqMode, setFreqMode] = useState<'weekly' | 'daily' | 'interval'>(start.freqMode);
  const [lastDose, setLastDose] = useState(toLocalInput(Date.now() - 2 * 86400000));
  const [weeksOnDose, setWeeksOnDose] = useState(start.weeksOnDose);
  const [height, setHeight] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState('');
  const [safety, setSafety] = useState<Safety>(NO_SAFETY_FLAGS);

  const pickLang = (next: Lang) => {
    setLang(next);
    if (existing) return; // a saved profile keeps its unit
    if (!unitPicked.current || !weightUnitsFor(next).includes(unit)) setUnit(defaultWeightUnit(next, region));
  };
  const pickRegion = (next: Region) => {
    setRegion(next);
    // A brand chosen for another region is not carried along: the list there shows other names.
    setBrand(brandIn(next, drugId, brand));
  };

  // English lists the brands sold in the region, one row each. Chinese lists the catalog entries, as before.
  const rows: BrandOption[] = useMemo(() => {
    if (lang !== 'en') return searchCatalog(q).map((entry) => ({ drugId: entry.id, brand: null, entry }));
    const s = q.trim().toLowerCase();
    return englishRows(region, drugId).filter((o) => !s || optionNames(o, region).some((n) => n.toLowerCase().includes(s)));
  }, [lang, q, region, drugId]);
  const drug = drugId ? drugById(drugId) : null;
  // Only the English list has brand rows, so only there can a brand still be missing (see setupChoice.ts).
  const needsBrand = lang === 'en' && needsBrandPick(region, drugId, brand);
  const isPicked = (o: BrandOption) => (lang === 'en' ? isRowPicked(o, region, drugId, brand) : o.drugId === drugId);
  const pickDrug = (o: BrandOption) => {
    // A row without a brand keeps the brand already chosen for the same medication.
    setBrand(o.brand ?? (o.drugId === drugId ? brand : null));
    if (o.drugId === drugId) return;
    // Another medication: it starts from its own usual rhythm, and a dose typed or saved for
    // the old one is not carried over.
    setDrugId(o.drugId);
    setAmount('');
    setWeeksOnDose('');
    setFreqMode(o.entry.frequency === 'daily' ? 'daily' : 'weekly');
    if (o.entry.frequency === 'daily') setTime('08:00');
  };

  const schedule = (): Schedule =>
    freqMode === 'weekly' ? { kind: 'weekly', weekday, time } : freqMode === 'daily' ? { kind: 'daily', time } : { kind: 'interval', hours: Math.max(1, Number(intervalDays) || 7) * 24 };

  // Height is stored in centimetres whatever the input was.
  const heightUnit = heightUnitFor(lang, unit);
  const heightCm = (): number | null => {
    if (heightUnit === 'cm') return Number(height) || null;
    const ft = Number(heightFt) || 0;
    const inches = Number(heightIn) || 0;
    return ft > 0 || inches > 0 ? ftInToCm(ft, inches) : null;
  };

  const finish = async (aiConsent: boolean) => {
    const startKg = weight ? storedKg(toKg(Number(weight), unit)) : null;
    const goalKg = goal && !safety.pregnancy && !safety.eatingDisorder ? storedKg(toKg(Number(goal), unit)) : null;
    const p: Profile = {
      id: 'me',
      lang,
      script: existing && lang === profileLang(existing) ? existing.script : scriptFor(lang),
      region,
      weightUnit: unit,
      heightCm: heightCm(),
      startWeightKg: startKg,
      goalWeightKg: goalKg,
      birthYear: null,
      dayStartHour: 4,
      tz: deviceTz(),
      safety,
      proteinMode: 'auto',
      proteinManualG: null,
      aiConsent,
      regimen: drugId
        ? {
            drugId,
            ...(brand ? { brand } : {}),
            doseAmount: Number(amount) || null,
            doseUnit,
            schedule: schedule(),
            status,
            weeksOnDoseAtStart: Number(weeksOnDose) || null,
            stoppedAt: status === 'stopped' ? fromLocalInput(lastDose) : null,
          }
        : null,
      onboardedAt: Date.now(),
      largeText: false,
    };
    await db.transaction('rw', db.profile, db.doses, db.weights, async () => {
      await db.profile.put(p);
      // 只存真实的上一次用药。"当前剂量用了几周"只在算曲线时用来补虚拟点，不写进记录（不会出现在医生报告里）。
      if (drugId && status !== 'not_started' && Number(amount) > 0 && lastDose) {
        await db.doses.add({ ...base('import', fromLocalInput(lastDose)), drugId, amount: Number(amount), unit: doseUnit, site: null });
      }
      if (startKg) await db.weights.add({ ...base('import'), kg: startKg });
    });
  };

  if (safety.under18) {
    return (
      <I18nProvider lang={lang}>
        <div className="onboarding" lang={htmlLang(lang)}>
          <h1>{t('onb.under18.title')}</h1>
          <p>{t('onb.under18.body')}</p>
          <button className="btn" onClick={() => setSafety({ ...safety, under18: false })}>
            {t('onb.back')}
          </button>
        </div>
      </I18nProvider>
    );
  }

  // A unit the profile already uses stays selectable even when the language does not offer it.
  const units = weightUnitsFor(lang).includes(unit) ? weightUnitsFor(lang) : [...weightUnitsFor(lang), unit];
  // The same for a saved status that setup does not offer ("Paused" is set under Me).
  const statusOptions: { value: CourseStatus; label: string }[] = SETUP_STATUSES.map((s) => ({ value: s, label: t(`onb.status.${s}`) }));
  if (!statusOptions.some((o) => o.value === status)) statusOptions.push({ value: status, label: statusLabel(status, lang) });

  const steps = [
    <div key="0">
      <h1>{t('onb.hello.title')}</h1>
      <p className="muted">{t('onb.hello.sub')}</p>
      <h3>{t('common.language')}</h3>
      <Chips options={LANGS.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))} value={lang} onChange={pickLang} />
      <h3>{t('onb.region')}</h3>
      <Chips options={regionsFor(lang).map((r) => ({ value: r, label: regionLabel(r, lang) }))} value={region} onChange={pickRegion} />
      <h3>{t('onb.unit')}</h3>
      <Chips options={units.map((u) => ({ value: u, label: unitLabel(u, lang) }))} value={unit} onChange={(u) => ((unitPicked.current = true), setUnit(u))} />
      {isChinese(lang) && <p className="fine">{t('onb.scriptNote')}</p>}
    </div>,
    <div key="1">
      <h1>{t('onb.drug.title')}</h1>
      <input placeholder={t('onb.drug.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list">
        {rows.map((o) => (
          <button key={`${o.drugId}:${o.brand ?? ''}`} className={`list-item ${isPicked(o) ? 'on' : ''}`} onClick={() => pickDrug(o)}>
            {brandOptionLabel(o, region, lang)}
            <span className="muted">{drugFormText(o.entry, lang)}</span>
          </button>
        ))}
      </div>
      {needsBrand && <p className="warn">{t('onb.drug.pickBrand')}</p>}
      {drug && (
        <>
          <h3>{t('onb.status.title')}</h3>
          <Chips options={statusOptions} value={status} onChange={setStatus} />
          <h3>{t('onb.dose.title')}</h3>
          {/* The example is the first strength in the catalog. It shows the format; it is not a suggestion. */}
          <input inputMode="decimal" placeholder={drug.ladderMg.length ? t('onb.dose.example', { dose: drug.ladderMg[0] }) : t('onb.dose.title')} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('onb.dose.title')} />
          <Chips options={(['mg', 'units', 'mL'] as DoseUnit[]).map((u) => ({ value: u, label: u }))} value={doseUnit} onChange={setDoseUnit} />
          {status !== 'stopped' && (
            <>
              <h3>{t('onb.freq.title')}</h3>
              <Chips
                options={[
                  { value: 'weekly' as const, label: t('onb.freq.weekly') },
                  { value: 'daily' as const, label: t('onb.freq.daily') },
                  { value: 'interval' as const, label: t('onb.freq.interval') },
                ]}
                value={freqMode}
                onChange={setFreqMode}
              />
              {freqMode === 'weekly' && <Chips options={weekdayLabels(lang).map((l, i) => ({ value: i, label: l }))} value={weekday} onChange={setWeekday} />}
              {freqMode === 'interval' && (
                <label>
                  {t('onb.freq.intervalLabel')}
                  <input inputMode="numeric" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
                </label>
              )}
              {freqMode !== 'interval' && (
                <label>
                  {t('onb.freq.time')}
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </label>
              )}
            </>
          )}
          {status !== 'not_started' && (
            <>
              <label>
                {status === 'stopped' ? t('onb.lastDose.stopped') : t('onb.lastDose.recent')}
                <input type="datetime-local" value={lastDose} onChange={(e) => setLastDose(e.target.value)} />
              </label>
              {status !== 'stopped' && drug.frequency === 'weekly' && (
                <label>
                  {t('onb.weeksOnDose')}
                  <input inputMode="numeric" placeholder={t('onb.weeksOnDose.example')} value={weeksOnDose} onChange={(e) => setWeeksOnDose(e.target.value)} />
                </label>
              )}
            </>
          )}
        </>
      )}
      <p className="fine">{t('onb.drug.skipNote')}</p>
    </div>,
    <div key="2">
      <h1>{t('onb.body.title')}</h1>
      {heightUnit === 'ft_in' ? (
        <div className="field" role="group" aria-label={t('onb.height.ftIn')}>
          {t('onb.height.ftIn')}
          <div className="row">
            <label className="unit-field">
              <input inputMode="numeric" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} aria-label={t('onb.height.feet')} />
              <span className="muted">{t('onb.height.ft')}</span>
            </label>
            <label className="unit-field">
              <input inputMode="decimal" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} aria-label={t('onb.height.inches')} />
              <span className="muted">{t('onb.height.in')}</span>
            </label>
          </div>
        </div>
      ) : (
        <label>
          {t('onb.height.cm')}
          <input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
        </label>
      )}
      <label>
        {t('onb.weight.now', { unit: unitLabel(unit, lang) })}
        <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </label>
      <label>
        {t('onb.weight.goal', { unit: unitLabel(unit, lang) })}
        <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <p className="fine">{t('onb.body.note')}</p>
    </div>,
    <div key="3">
      <h1>{t('onb.safety.title')}</h1>
      <p className="muted">{t('onb.safety.sub')}</p>
      {SAFETY_KEYS.map((key) => (
        <label key={key} className="check">
          <input type="checkbox" checked={safety[key]} onChange={(e) => setSafety({ ...safety, [key]: e.target.checked })} />
          {t(`onb.safety.${key}`)}
        </label>
      ))}
      {safety.pregnancy && <p className="warn">{t('onb.safety.pregnancyWarn')}</p>}
      {safety.kidneyOrLiver && <p className="warn">{t('onb.safety.kidneyWarn')}</p>}
    </div>,
    <div key="4">
      <h1>{t('onb.ai.title')}</h1>
      <p>{t('onb.ai.body')}</p>
      <ul>
        <li>{t('onb.ai.point1')}</li>
        <li>{t('onb.ai.point2')}</li>
        <li>{t('onb.ai.point3')}</li>
      </ul>
      <p className="muted">{t('onb.ai.optional')}</p>
      <p className="fine">{disclaimer(lang)}</p>
    </div>,
  ];

  const canNext = step !== 1 || !drugId || (!needsBrand && (status === 'not_started' || (Number(amount) > 0 && (status === 'stopped' || freqMode !== 'interval' || Number(intervalDays) > 0))));

  return (
    <I18nProvider lang={lang}>
      <div className="onboarding" lang={htmlLang(lang)}>
        <div className="progress">
          {steps.map((_, i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        {steps[step]}
        <div className="row nav">
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              {t('onb.prev')}
            </button>
          )}
          {step < steps.length - 1 ? (
            <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {step === 1 && !drugId ? t('onb.skip') : t('onb.next')}
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => void finish(false)}>
                {t('onb.noAi')}
              </button>
              <button className="btn primary" onClick={() => void finish(true)}>
                {t('onb.agree')}
              </button>
            </>
          )}
        </div>
      </div>
    </I18nProvider>
  );
}
