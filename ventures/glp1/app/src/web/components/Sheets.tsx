import { useState } from 'react';
import { doseUnitLabel, drugById, needsDoseConfirm, regimenLabel, type DoseUnit } from '../../core/catalog';
import { FOODS, foodName, foodUnit } from '../../core/foods';
import { siteLabel, SITES, type Site } from '../../core/schedule';
import { gradeLabel, SYMPTOM_ORDER, symptomLabel } from '../../core/symptoms';
import type { SymptomKind } from '../../core/triage';
import type { Profile } from '../../core/types';
import { fromKg, toKg, unitLabel } from '../../core/units';
import { addDose, addFood, addSymptom, addWeight, addWorkout } from '../actions';
import { copingById, copingFor } from '../content/coping';
import { ROUTINE_IDS, routineExercises, routineTitle, type Routine } from '../content/workouts';
import type { Derived } from '../derive';
import { bold, useT } from '../i18n';
import { setUi, useUi } from '../store';
import { Chips, fromLocalInput, Sheet, toLocalInput } from './ui';

const close = () => setUi({ sheet: null });

export function Sheets({ profile, d }: { profile: Profile; d: Derived }) {
  const { sheet, coping } = useUi();
  return (
    <>
      {sheet === 'dose' && <DoseSheet profile={profile} d={d} />}
      {sheet === 'weight' && <WeightSheet profile={profile} d={d} />}
      {sheet === 'symptom' && <SymptomSheet profile={profile} />}
      {sheet === 'food' && <FoodSheet />}
      {sheet === 'workout' && <WorkoutSheet />}
      {coping && <CopingSheet id={coping} />}
    </>
  );
}

export interface DoseDraft {
  amount: number | null;
  unit: DoseUnit;
  site: Site | null;
  occurredAt: number;
}

/** 记一针 / 记一次服药。用药记录必须点"确认"才入库；超过最高剂量再确认一次。 */
export function DoseForm({ profile, d, draft, onDone }: { profile: Profile; d: Derived; draft?: Partial<DoseDraft>; onDone: () => void }) {
  const t = useT();
  const lang = t.lang;
  const reg = profile.regimen!;
  const drug = drugById(reg.drugId);
  const oral = drug.route === 'oral';
  const [amount, setAmount] = useState<string>(String(draft?.amount ?? d.lastDose?.amount ?? reg.doseAmount ?? ''));
  const [unit, setUnit] = useState<DoseUnit>(draft?.unit ?? d.lastDose?.unit ?? reg.doseUnit);
  const [site, setSite] = useState<Site | null>(oral ? null : (draft?.site ?? d.nextSite));
  const [when, setWhen] = useState(toLocalInput(draft?.occurredAt ?? Date.now()));
  const [overMax, setOverMax] = useState(false);
  const n = Number(amount);
  const valid = amount !== '' && n > 0 && n < 1000;

  const save = async () => {
    if (!valid) return;
    if (!overMax && needsDoseConfirm(drug, n, unit)) {
      setOverMax(true);
      return;
    }
    await addDose(profile, { drugId: reg.drugId, amount: n, unit, site, occurredAt: fromLocalInput(when), source: draft ? 'text' : 'manual' });
    onDone();
  };

  return (
    <div className="form">
      <p className="muted">{regimenLabel(reg, profile.region, lang)}</p>
      <label>
        {t('dose.amount')}
        <input inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setOverMax(false))} aria-label={t('dose.amount')} />
        <Chips options={(['mg', 'units', 'mL', 'clicks'] as DoseUnit[]).map((u) => ({ value: u, label: doseUnitLabel(u, lang) }))} value={unit} onChange={(u) => (setUnit(u), setOverMax(false))} />
      </label>
      {unit !== 'mg' && <p className="fine">{t('dose.unitNote')}</p>}
      {!oral && (
        <label>
          {t('dose.site')} <span className="muted">{t('dose.siteSuggested', { site: siteLabel(d.nextSite, lang) })}</span>
          <Chips options={SITES.map((s) => ({ value: s, label: siteLabel(s, lang) }))} value={site} onChange={setSite} />
        </label>
      )}
      <label>
        {t('dose.time')}
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      {/* The largest dose comes from the catalog and only guards against a typing slip. */}
      {overMax && <p className="warn">{t('dose.overMax.form', { amount: String(n), unit, max: String(drug.maxMg) })}</p>}
      <button className="btn primary block" disabled={!valid} onClick={() => void save()}>
        {overMax ? t('dose.confirmSure') : t('common.confirm')}
      </button>
      {drug.fastingMin && <p className="fine">{t('dose.fasting', { minutes: drug.fastingMin })}</p>}
    </div>
  );
}

function DoseSheet({ profile, d }: { profile: Profile; d: Derived }) {
  const t = useT();
  const oral = profile.regimen ? drugById(profile.regimen.drugId).route === 'oral' : false;
  if (!profile.regimen) {
    return (
      <Sheet open title={t('action.logShot')} onClose={close}>
        <p>{t('dose.setupFirst')}</p>
      </Sheet>
    );
  }
  return (
    <Sheet open title={oral ? t('sheet.pill') : t('action.logShot')} onClose={close}>
      <DoseForm profile={profile} d={d} onDone={close} />
    </Sheet>
  );
}

function WeightSheet({ profile, d }: { profile: Profile; d: Derived }) {
  const t = useT();
  const u = profile.weightUnit;
  const [v, setV] = useState(d.latestWeightKg ? String(Math.round(fromKg(d.latestWeightKg, u) * 10) / 10) : '');
  const kg = toKg(Number(v), u);
  const valid = v !== '' && kg >= 30 && kg <= 300;
  return (
    <Sheet open title={t('sheet.weight')} onClose={close}>
      <div className="form">
        <label>
          {t('weight.field', { unit: unitLabel(u, t.lang) })}
          <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus aria-label={t('log.weight')} />
        </label>
        <p className="fine">{t('weight.tip')}</p>
        <button className="btn primary block" disabled={!valid} onClick={() => void addWeight(kg, 'manual').then(close)}>
          {t('common.logIt')}
        </button>
      </div>
    </Sheet>
  );
}

function SymptomSheet({ profile }: { profile: Profile }) {
  const t = useT();
  const lang = t.lang;
  const [kind, setKind] = useState<SymptomKind | null>(null);
  return (
    <Sheet open title={t('sheet.symptom')} onClose={close}>
      {!kind ? (
        <div className="grid3">
          {SYMPTOM_ORDER.map((s) => (
            <button key={s} className="tile" onClick={() => setKind(s)}>
              {symptomLabel(s, lang)}
            </button>
          ))}
        </div>
      ) : (
        <div className="form">
          <p>{bold(t('symptom.howBad', { symptom: symptomLabel(kind, lang) }))}</p>
          <div className="row">
            {[1, 2, 3].map((g) => (
              <button
                key={g}
                className={`btn ${g === 3 ? 'warn-btn' : ''}`}
                onClick={() => {
                  close();
                  void addSymptom(profile, kind, g);
                }}
              >
                {gradeLabel(g, lang)}
              </button>
            ))}
          </div>
          <p className="fine">{t('symptom.severeNote')}</p>
        </div>
      )}
    </Sheet>
  );
}

function FoodSheet() {
  const t = useT();
  const lang = t.lang;
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('');
  const g = Number(grams);
  return (
    <Sheet open title={t('sheet.food')} onClose={close}>
      <div className="form">
        <p className="muted">{t('food.tapOne')}</p>
        <div className="grid2">
          {FOODS.map((f) => (
            <button key={f.id} className="tile left" onClick={() => void addFood({ text: foodName(f, lang), proteinG: f.proteinG, lowG: f.proteinG - f.spreadG, highG: f.proteinG + f.spreadG, foodId: f.id }, 'quick')}>
              <span>{foodName(f, lang)}</span>
              <span className="muted">{t('food.per', { grams: f.proteinG, unit: foodUnit(f, lang) })}</span>
            </button>
          ))}
        </div>
        <p className="muted">{t('food.orOwn')}</p>
        <div className="row">
          <input placeholder={t('food.what')} value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder={t('food.grams')} inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} style={{ maxWidth: lang === 'en' ? '6.875em' : 110 }} />
        </div>
        <button className="btn primary block" disabled={!name.trim() || !(g >= 0 && g < 300) || grams === ''} onClick={() => void addFood({ text: name.trim(), proteinG: g }, 'manual').then(close)}>
          {t('common.logIt')}
        </button>
        <p className="fine">{t('food.tip')}</p>
      </div>
    </Sheet>
  );
}

function WorkoutSheet() {
  const t = useT();
  const lang = t.lang;
  const [routine, setRoutine] = useState<Routine>('bodyweight');
  const [variant, setVariant] = useState<'standard' | 'light'>('light');
  return (
    <Sheet open title={t('sheet.workout')} onClose={close}>
      <div className="form">
        <Chips options={ROUTINE_IDS.map((k) => ({ value: k, label: routineTitle(k, lang) }))} value={routine} onChange={setRoutine} />
        <Chips
          options={[
            { value: 'light' as const, label: t('workout.lightLong') },
            { value: 'standard' as const, label: t('workout.standardLong') },
          ]}
          value={variant}
          onChange={setVariant}
        />
        <ol className="exercises">
          {routineExercises(routine, lang).map((e) => (
            <li key={e.name}>
              <b>{e.name}</b> <span className="muted">{variant === 'light' ? e.light : e.standard}</span>
              <div className="fine">{e.how}</div>
            </li>
          ))}
        </ol>
        <p className="fine">{t('workout.note')}</p>
        <button className="btn primary block" onClick={() => void addWorkout(routine, variant).then(close)}>
          {t('workout.done')}
        </button>
      </div>
    </Sheet>
  );
}

function CopingSheet({ id }: { id: string }) {
  const t = useT();
  const c = copingById(id, t.lang) ?? copingFor(id as SymptomKind, t.lang);
  if (!c) return null;
  return (
    <Sheet open title={c.title} onClose={() => setUi({ coping: null })}>
      <CopingBody id={c.id} />
    </Sheet>
  );
}

export function CopingBody({ id }: { id: string }) {
  const t = useT();
  const c = copingById(id, t.lang);
  if (!c) return null;
  return (
    <div className="coping">
      <h3>{t('coping.try')}</h3>
      <ul>
        {c.tryFirst.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <h3>{t('coping.avoid')}</h3>
      <ul>
        {c.avoid.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <h3>{t('coping.seeDoctor')}</h3>
      <ul className="see-doctor">
        {c.seeDoctor.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="fine">{t('coping.sources', { sources: c.sources.join(t('coping.sourceSeparator')) })}</p>
    </div>
  );
}
