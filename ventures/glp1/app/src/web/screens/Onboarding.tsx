import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { brandOptionLabel, drugById, drugFormText, regionLabel, searchCatalog, type BrandOption, type DoseUnit, type Region } from '../../core/catalog';
import { doseExample, languageChoices, regionChoices, safetyQuestions, setupSteps, type SetupStep } from '../../core/features';
import { DEFAULT_LANG, htmlLang, isChinese, profileLang, scriptFor, type Lang } from '../../core/i18n';
import { NO_SAFETY_FLAGS, startRegion } from '../../core/profile';
import type { Schedule } from '../../core/schedule';
import { cleanSetupAnswers, hasSetupAnswer, type SetupAnswers } from '../../core/setupQuestions';
import { weekdayLabels } from '../../core/tz';
import type { CourseStatus, Profile, Safety } from '../../core/types';
import { cmToFtIn, defaultWeightUnit, ftInToCm, heightUnitFor, unitLabel, weightUnitsFor, type WeightUnit } from '../../core/units';
import { base, db, deviceTz } from '../db';
import { disclaimer, statusLabel } from '../content/labels';
import { features } from '../features';
import { CountsChoice, CountsExplainer } from '../components/Counts';
import { SetupQuestions } from '../components/SetupQuestions';
import { Chips, fromLocalInput, toLocalInput } from '../components/ui';
import { WipeButton } from '../components/WipeButton';
import { countingOn, countsAnswered, setupFinished } from '../counting';
import { I18nProvider, LANGUAGE_NAMES, translator } from '../i18n';
import { addsStartingDose, addsStartingWeight, brandIn, englishRows, fieldWeightKg, isRowPicked, needsBrandPick, savedWeightText, setupStart } from '../setupChoice';

const SETUP_STATUSES = ['escalating', 'maintenance', 'not_started', 'stopped'] as const;
// What this build asks (core/features.ts).
const SAFETY_KEYS = safetyQuestions(features);

/** Every name a row of the English medication list can be found by. */
function optionNames(o: BrandOption, region: Region): string[] {
  const e = o.entry;
  return [brandOptionLabel(o, region, 'en'), o.brand ?? '', e.generic.en, e.generic.hans, e.generic.hant, e.ingredient ?? ''];
}

export function Onboarding({ existing }: { existing: Profile | null }) {
  // "Start over" mounts a fresh setup, so nothing that was typed is kept.
  const [run, setRun] = useState(0);
  return <Setup key={run} existing={existing} onStartOver={() => setRun(run + 1)} />;
}

function Setup({ existing, onStartOver }: { existing: Profile | null; onStartOver: () => void }) {
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
  // For a medication saved as stopped this field is the day it was stopped, so it starts from the saved day.
  const [lastDose, setLastDose] = useState(toLocalInput(saved?.status === 'stopped' && saved.stoppedAt ? saved.stoppedAt : Date.now() - 2 * 86400000));
  const [weeksOnDose, setWeeksOnDose] = useState(start.weeksOnDose);
  // Redoing setup starts from the saved answers here too, so walking through it changes nothing.
  // Height: both ways of entering it start from the saved height, and it is kept as saved until a field is edited.
  const savedHeight = existing?.heightCm ?? null;
  const [height, setHeight] = useState(savedHeight ? String(Math.round(savedHeight * 10) / 10) : '');
  const [heightFt, setHeightFt] = useState(savedHeight ? String(cmToFtIn(savedHeight).ft) : '');
  const [heightIn, setHeightIn] = useState(savedHeight ? String(cmToFtIn(savedHeight).inches) : '');
  const [heightEdited, setHeightEdited] = useState(false);
  // Weights: null until the field is edited. Until then the field shows the saved weight in the
  // unit chosen on the first step, and the saved weight is kept exactly (see setupChoice.ts).
  const [weight, setWeight] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  // "Under 18" is never carried over: a saved profile was finished without it.
  const [safety, setSafety] = useState<Safety>(existing ? { ...NO_SAFETY_FLAGS, ...existing.safety, under18: false } : NO_SAFETY_FLAGS);
  // Medications the log already has a dose of. Setup asks for the most recent dose only to start
  // the log, so for these it is not asked again (and finish() does not add it again).
  const [loggedDrugs, setLoggedDrugs] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let live = true;
    void db.doses.toArray().then(
      (rows) => live && setLoggedDrugs(new Set(rows.filter((r) => r.deletedAt === null).map((r) => r.drugId))),
      () => undefined, // storage could not be read: finish() checks again before it adds anything
    );
    return () => {
      live = false;
    };
  }, []);
  // The three optional questions. Redoing setup starts from the answers given before.
  const [answers, setAnswers] = useState<SetupAnswers>(() => cleanSetupAnswers(existing?.setupAnswers));
  // What was chosen on the AI step, kept in case another step follows it.
  const [aiChoice, setAiChoice] = useState<boolean | null>(null);
  // "Share anonymous counts?" is asked once on a phone. A phone that has answered is not asked
  // again when setup is redone; the setting under Me is where the answer is changed.
  const [countsAsked, setCountsAsked] = useState(false);
  useEffect(() => {
    if (!countingOn) return;
    let live = true;
    void countsAnswered().then(
      (asked) => live && setCountsAsked(asked),
      () => undefined, // storage could not be read: the question stays in setup
    );
    return () => {
      live = false;
    };
  }, []);
  // The steps of this build, in order.
  const stepIds = setupSteps(features, countingOn && !countsAsked);
  const saving = useRef(false);

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
  const example = drug ? doseExample(drug, features) : null;
  const hasDoses = drugId !== null && loggedDrugs.has(drugId);
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

  /**
   * Saves the profile. `aiConsent` is null where setup has no AI step: the question was never
   * asked. `shareCounts` is the answer to "share anonymous counts?", or null where that screen
   * was not shown.
   */
  const finish = async (aiConsent: boolean | null, shareCounts: boolean | null) => {
    if (saving.current) return;
    saving.current = true;
    const startKg = fieldWeightKg(weight, existing?.startWeightKg, unit);
    const goalKg = safety.pregnancy || safety.eatingDisorder ? null : fieldWeightKg(goal, existing?.goalWeightKg, unit);
    const p: Profile = {
      id: 'me',
      lang,
      script: existing && lang === profileLang(existing) ? existing.script : scriptFor(lang),
      region,
      weightUnit: unit,
      heightCm: heightEdited ? heightCm() : savedHeight,
      startWeightKg: startKg,
      goalWeightKg: goalKg,
      // Settings that setup does not ask about are kept when setup is redone.
      birthYear: existing?.birthYear ?? null,
      dayStartHour: existing?.dayStartHour ?? 4,
      tz: deviceTz(),
      safety,
      proteinMode: existing?.proteinMode ?? 'auto',
      proteinManualG: existing?.proteinManualG ?? null,
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
      largeText: existing?.largeText ?? false,
      // Only a build that asks the questions writes the field. Another build keeps what is there.
      ...(features.setupQuestions ? { setupAnswers: answers } : existing?.setupAnswers ? { setupAnswers: existing.setupAnswers } : {}),
    };
    // This phone's own notes (when setup was finished, the answer about counts) are kept apart
    // from the records. A failure there must not stop setup; the answer then stays "not asked".
    if (features.anonymousCounts) await setupFinished(p.onboardedAt ?? Date.now(), shareCounts).catch(() => undefined);
    try {
      await db.transaction('rw', db.profile, db.doses, db.weights, async () => {
        await db.profile.put(p);
        // 只存真实的上一次用药。"当前剂量用了几周"只在算曲线时用来补虚拟点，不写进记录（不会出现在医生报告里）。
        // The most recent dose only starts the log. A log that already has a dose of this medication
        // gets nothing added, so redoing setup does not add the same dose again (setupChoice.ts).
        if (drugId && lastDose) {
          const logged = (await db.doses.filter((d) => d.deletedAt === null && d.drugId === drugId).count()) > 0;
          if (addsStartingDose(status, Number(amount), logged)) await db.doses.add({ ...base('import', fromLocalInput(lastDose)), drugId, amount: Number(amount), unit: doseUnit, site: null });
        }
        // The weight is logged as a weigh-in the first time, and again only if it was changed.
        if (addsStartingWeight(startKg, existing?.startWeightKg)) await db.weights.add({ ...base('import'), kg: startKg });
      });
    } catch (e) {
      // Nothing was saved: the last button can be tapped again.
      saving.current = false;
      throw e;
    }
  };

  // Where "Under 18" ends setup. Nothing has been written at this point: only finish() saves.
  // When setup is being redone, the earlier profile and records are still stored (and counts may
  // have been shared), so the screen says so and offers "Delete all data" right there.
  if (safety.under18 && features.under18EndsSetup) {
    return (
      <I18nProvider lang={lang}>
        <div className="onboarding" lang={htmlLang(lang)}>
          <h1>{t('onb.under18.stopTitle')}</h1>
          <p>{t(existing ? 'onb.under18.stopBodySaved' : 'onb.under18.stopBody')}</p>
          <div className="row wrap">
            {existing && <WipeButton />}
            <button className="btn" onClick={onStartOver}>
              {t('onb.under18.restart')}
            </button>
          </div>
        </div>
      </I18nProvider>
    );
  }
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

  const languages = languageChoices(lang, features);

  const helloStep = (
    <div key="0">
      <h1>{t('onb.hello.title')}</h1>
      {/* The Chinese line promises protein and muscle results; where those features are hidden a plain line is used. */}
      <p className="muted">{t(features.foodAndProtein ? 'onb.hello.sub' : 'onb.hello.subPlain')}</p>
      {languages.length > 1 && (
        <>
          <h3>{t('common.language')}</h3>
          <Chips options={languages.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))} value={lang} onChange={pickLang} />
        </>
      )}
      <h3>{t('onb.region')}</h3>
      <Chips options={regionChoices(lang, region, features).map((r) => ({ value: r, label: regionLabel(r, lang) }))} value={region} onChange={pickRegion} />
      <h3>{t('onb.unit')}</h3>
      <Chips options={units.map((u) => ({ value: u, label: unitLabel(u, lang) }))} value={unit} onChange={(u) => ((unitPicked.current = true), setUnit(u))} />
      {isChinese(lang) && <p className="fine">{t('onb.scriptNote')}</p>}
      {features.loggingToolNotice && <p className="fine notice">{t('notice.loggingTool')}</p>}
    </div>
  );
  const medicationStep = (
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
          {/* The example is the first strength in the catalog. It shows the format; it is not a suggestion. Where the build may not show that number there is no example (core/features.ts). */}
          <input inputMode="decimal" placeholder={example !== null ? t('onb.dose.example', { dose: example }) : t('onb.dose.title')} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('onb.dose.title')} />
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
              {/* Not asked when the log already has a dose of this medication. For "stopped" it is the day it was stopped, so it stays. */}
              {(status === 'stopped' || !hasDoses) && (
                <label>
                  {status === 'stopped' ? t('onb.lastDose.stopped') : t('onb.lastDose.recent')}
                  <input type="datetime-local" value={lastDose} onChange={(e) => setLastDose(e.target.value)} />
                </label>
              )}
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
    </div>
  );
  const bodyStep = (
    <div key="2">
      <h1>{t(features.foodAndProtein ? 'onb.body.title' : 'onb.body.titleWeight')}</h1>
      {/* Height is only used for the protein target, so it is only asked where there is one. */}
      {!features.foodAndProtein ? null : heightUnit === 'ft_in' ? (
        <div className="field" role="group" aria-label={t('onb.height.ftIn')}>
          {t('onb.height.ftIn')}
          <div className="row">
            <label className="unit-field">
              <input inputMode="numeric" value={heightFt} onChange={(e) => (setHeightEdited(true), setHeightFt(e.target.value))} aria-label={t('onb.height.feet')} />
              <span className="muted">{t('onb.height.ft')}</span>
            </label>
            <label className="unit-field">
              <input inputMode="decimal" value={heightIn} onChange={(e) => (setHeightEdited(true), setHeightIn(e.target.value))} aria-label={t('onb.height.inches')} />
              <span className="muted">{t('onb.height.in')}</span>
            </label>
          </div>
        </div>
      ) : (
        <label>
          {t('onb.height.cm')}
          <input inputMode="numeric" value={height} onChange={(e) => (setHeightEdited(true), setHeight(e.target.value))} />
        </label>
      )}
      <label>
        {t('onb.weight.now', { unit: unitLabel(unit, lang) })}
        <input inputMode="decimal" value={weight ?? savedWeightText(existing?.startWeightKg, unit)} onChange={(e) => setWeight(e.target.value)} />
      </label>
      <label>
        {t('onb.weight.goal', { unit: unitLabel(unit, lang) })}
        <input inputMode="decimal" value={goal ?? savedWeightText(existing?.goalWeightKg, unit)} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <p className="fine">{t(features.foodAndProtein ? 'onb.body.note' : 'onb.body.noteWeight')}</p>
    </div>
  );
  const safetyStep = (
    <div key="3">
      <h1>{t('onb.safety.title')}</h1>
      {/* The longer sentence promises adjusted tips, which only the daily advice card gives. */}
      <p className="muted">{t(features.dailyAdvice ? 'onb.safety.sub' : 'onb.safety.subPlain')}</p>
      {SAFETY_KEYS.map((key) => (
        <label key={key} className="check">
          <input type="checkbox" checked={safety[key]} onChange={(e) => setSafety({ ...safety, [key]: e.target.checked })} />
          {t(`onb.safety.${key}`)}
        </label>
      ))}
      {safety.pregnancy && <p className="warn">{t('onb.safety.pregnancyWarn')}</p>}
      {safety.kidneyOrLiver && <p className="warn">{t('onb.safety.kidneyWarn')}</p>}
    </div>
  );
  const aiStep = (
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
    </div>
  );
  const askCounts = stepIds.includes('counts');
  const aboutStep = (
    <div key="about">
      <h1>{t('onb.about.title')}</h1>
      <p className="muted">{t('onb.about.sub')}</p>
      <SetupQuestions answers={answers} onChange={setAnswers} />
      <p className="fine">{t(askCounts ? 'onb.about.noteCounts' : 'onb.about.note')}</p>
    </div>
  );
  /** An answer given with a button of the current step: it is kept, and setup moves on or ends. */
  const answer = (given: { ai?: boolean; counts?: boolean }) => {
    const ai = given.ai ?? aiChoice;
    if (given.ai !== undefined) setAiChoice(given.ai);
    if (step >= stepIds.length - 1) void finish(ai, given.counts ?? null);
    else setStep(step + 1);
  };
  const countsStep = (
    <div key="counts">
      <h1>{t('counts.title')}</h1>
      <CountsExplainer />
      <CountsChoice onAnswer={(yes) => answer({ counts: yes })} />
    </div>
  );
  const stepViews: Record<SetupStep, ReactElement> = { hello: helloStep, medication: medicationStep, body: bodyStep, safety: safetyStep, about: aboutStep, ai: aiStep, counts: countsStep };
  const steps = stepIds.map((id) => stepViews[id]);
  const stepId = stepIds[step];
  const onMedication = stepId === 'medication';

  const canNext = !onMedication || !drugId || (!needsBrand && (status === 'not_started' || (Number(amount) > 0 && (status === 'stopped' || freqMode !== 'interval' || Number(intervalDays) > 0))));

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
          {stepId === 'counts' ? null : stepId === 'ai' ? ( // The counts step is answered with its own two buttons.
            <>
              <button className="btn" onClick={() => answer({ ai: false })}>
                {t('onb.noAi')}
              </button>
              <button className="btn primary" onClick={() => answer({ ai: true })}>
                {t('onb.agree')}
              </button>
            </>
          ) : step < steps.length - 1 ? (
            <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {(onMedication && !drugId) || (stepId === 'about' && !hasSetupAnswer(answers)) ? t('onb.skip') : t('onb.next')}
            </button>
          ) : (
            // Setup ends on a step without a choice of its own; AI consent is left as "never asked".
            <button className="btn primary" onClick={() => answer({})}>
              {t('onb.start')}
            </button>
          )}
        </div>
      </div>
    </I18nProvider>
  );
}
