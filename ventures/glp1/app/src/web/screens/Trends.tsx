import { useState } from 'react';
import { brandLabel, brandNumbers, drugById, hasLabelSource, labelBrand, regimenBrand } from '../../core/catalog';
import type { Lang } from '../../core/i18n';
import type { DoseEvent, Profile } from '../../core/types';
import { dayKey, fmtDayKey, shiftDayKey } from '../../core/tz';
import { fmtWeight, fmtWeightChange, fromKg, unitLabel, type WeightUnit } from '../../core/units';
import { Curve } from '../components/Curve';
import { Card } from '../components/ui';
import { noChartText } from '../content/labels';
import type { Derived, Records } from '../derive';
import { features } from '../features';
import { bold, useT } from '../i18n';

/**
 * What the method note names: the US brand whose prescribing information the two numbers were
 * read from, and the half-life and time to peak the chart uses for this person's medication.
 * They are read from the catalog, so the note cannot drift from the curve. Null when the numbers
 * have no US label behind them; the note says they do, so it is then not offered.
 */
export function methodFacts(profile: Profile, lang: Lang): { name: string; halfLife: number; peak: number } | null {
  const reg = profile.regimen;
  if (!reg) return null;
  const drug = drugById(reg.drugId);
  const brand = regimenBrand(reg, profile.region);
  const pk = brandNumbers(drug, brand).pk;
  const usBrand = labelBrand(drug, brand);
  if (!pk || !usBrand || !hasLabelSource(drug)) return null;
  return { name: brandLabel(drug, usBrand, lang), halfLife: pk.halfLifeH, peak: pk.tmaxH };
}

/** How far a single weigh-in can swing, in the user's unit (about half a kilogram to one kilogram). */
function dailySwing(u: WeightUnit): string {
  return u === 'kg' ? '0.5–1 kg' : u === 'lb' ? '1–2 lb' : '1–2 jin';
}

export function Trends({ profile, d, rec, now }: { profile: Profile; d: Derived; rec: Records; now: number }) {
  const t = useT();
  const [method, setMethod] = useState(false);
  const methodNote = methodFacts(profile, t.lang);
  const doses = rec.doses.filter((x) => x.deletedAt === null && (!profile.regimen || x.drugId === profile.regimen.drugId));
  return (
    <div className="screen">
      <h1 className="pad">{t('trends.title')}</h1>
      <WeeklyCard profile={profile} d={d} />
      {d.curve.length > 0 ? (
        <Card>
          <div className="row between">
            <h3>{t('curve.title')}</h3>
            <span className="big">{d.curveNow ?? '–'}</span>
          </div>
          <Curve points={d.curve} nowMs={now} doseTimes={doses.map((x) => x.occurredAt)} height={150} />
          <p className="fine">{t('trends.curve.note')}</p>
          {methodNote && (
            <button className="link" onClick={() => setMethod(!method)}>
              {t('trends.method.link')}
            </button>
          )}
          {methodNote && method && <div className="fine method">{t('trends.method.body', methodNote)}</div>}
        </Card>
      ) : d.drug && !d.curveAvailable ? (
        // No chart can be drawn for this medication in this build, so the card must not promise one.
        <Card>
          <h3>{t('curve.title')}</h3>
          <p className="muted">{noChartText(d, t.lang)}</p>
        </Card>
      ) : features.curveNeedsSource && !d.drug ? null : (
        // A chart will come once doses are logged in mg. Without a medication the launch build says nothing.
        <Card>
          <h3>{t('trends.curve.emptyTitle')}</h3>
          <p className="muted">{t('trends.curve.empty')}</p>
        </Card>
      )}
      <WeightCard profile={profile} d={d} />
      <SymptomCard d={d} rec={rec} doses={doses} profile={profile} />
      {features.foodAndProtein && <ProteinWeek d={d} />}
      {features.workouts && <WorkoutWeek d={d} />}
    </div>
  );
}

/**
 * Weekly summary: three numbers about the last seven days (core/weekly.ts). It only counts what
 * was logged; it gives no advice and no judgement.
 */
function WeeklyCard({ profile, d }: { profile: Profile; d: Derived }) {
  const t = useT();
  const lang = t.lang;
  const w = d.weekly;
  const range = w.fromDay === w.toDay ? fmtDayKey(w.toDay, lang) : t('weekly.range', { from: fmtDayKey(w.fromDay, lang), to: fmtDayKey(w.toDay, lang) });
  return (
    <Card className="weekly">
      <h3>{t('weekly.title')}</h3>
      <p className="muted">{range}</p>
      <dl className="facts">
        <div>
          <dt>{t('weekly.doses')}</dt>
          {/* "of N scheduled" is shown only when the schedule called for a dose on these days. */}
          <dd>{w.dosesScheduled ? t('weekly.dosesOf', { logged: w.dosesLogged, scheduled: w.dosesScheduled }) : w.dosesLogged}</dd>
        </div>
        <div>
          <dt>{t('weekly.weight')}</dt>
          <dd>{w.firstWeightKg !== null && w.lastWeightKg !== null ? fmtWeightChange(w.firstWeightKg, w.lastWeightKg, profile.weightUnit, lang) : t('weekly.none')}</dd>
        </div>
        <div>
          <dt>{t('weekly.symptomDays')}</dt>
          <dd>{w.symptomDays}</dd>
        </div>
      </dl>
      <p className="fine">{t('weekly.note')}</p>
    </Card>
  );
}

function WorkoutWeek({ d }: { d: Derived }) {
  const t = useT();
  return (
    <Card>
      <h3>{t('trends.workouts.title')}</h3>
      <p>{bold(t('trends.workouts.body', { count: d.workoutDays.filter((k) => k > shiftDayKey(d.today, -7)).length }))}</p>
    </Card>
  );
}

function WeightCard({ profile, d }: { profile: Profile; d: Derived }) {
  const t = useT();
  const lang = t.lang;
  const u = profile.weightUnit;
  const avgs = d.weightAvgs.slice(-60);
  if (!avgs.length) {
    return (
      <Card>
        <h3>{t('weight.title')}</h3>
        <p className="muted">{t('weight.empty')}</p>
      </Card>
    );
  }
  const vals = avgs.map((a) => fromKg(a.avgKg, u));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const w = 340;
  const h = 100;
  const x = (i: number) => (avgs.length === 1 ? w / 2 : (i / (avgs.length - 1)) * w);
  const y = (v: number) => (max === min ? h / 2 : 8 + ((max - v) / (max - min)) * (h - 16));
  const nadir = Math.min(...avgs.map((a) => a.avgKg));
  return (
    <Card>
      <h3>{t('weight.avgTitle')}</h3>
      <svg className="curve" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t('weight.aria')}>
        <path className="curve-past" d={vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')} />
      </svg>
      <p>
        {bold(t('weight.summary', { now: fmtWeight(avgs[avgs.length - 1].avgKg, u, lang), low: fmtWeight(nadir, u, lang) }))}
        {profile.startWeightKg && t('weight.start', { start: fmtWeight(profile.startWeightKg, u, lang) })}
      </p>
      {features.maintenanceContent && d.regain && <p className={d.regain.band === 'green' ? 'muted' : 'warn'}>{t(`weight.regain.${d.regain.band}`, { pct: d.regain.regainPct.toFixed(1) })}</p>}
      <p className="fine">{t('weight.note', { unit: unitLabel(u, lang), swing: dailySwing(u) })}</p>
    </Card>
  );
}

function SymptomCard({ d, rec, doses, profile }: { d: Derived; rec: Records; doses: DoseEvent[]; profile: Profile }) {
  const t = useT();
  if (!doses.length || d.drug?.frequency !== 'weekly') return null;
  const sorted = [...doses].sort((a, b) => a.occurredAt - b.occurredAt);
  const counts = new Array(7).fill(0);
  for (const s of rec.symptoms) {
    if (s.deletedAt !== null || s.kind === 'other') continue;
    const prev = [...sorted].reverse().find((x) => x.occurredAt <= s.occurredAt);
    if (!prev) continue;
    const off = Math.round((Date.parse(dayKey(s.occurredAt, d.tz, profile.dayStartHour)) - Date.parse(dayKey(prev.occurredAt, d.tz, profile.dayStartHour))) / 86400000);
    if (off >= 0 && off < 7) counts[off] += s.grade;
  }
  const max = Math.max(1, ...counts);
  return (
    <Card>
      <h3>{t('symptomDays.title')}</h3>
      <div className="bars">
        {counts.map((c, i) => (
          <div key={i} className={`barcol ${d.highDays?.highDays.includes(i) ? 'hi' : ''}`}>
            <div className="barv" style={{ height: `${(c / max) * 60}px` }} />
            <span>{i === 0 ? t('symptomDays.day0') : `+${i}`}</span>
          </div>
        ))}
      </div>
      {/* The longer sentence says the Today tab plans around these days; that is only true with the daily advice card. */}
      <p className="fine">{d.highDays?.enoughData ? t(features.dailyAdvice ? 'symptomDays.found' : 'symptomDays.foundPlain') : t('symptomDays.needMore', { count: d.highDays?.cycles ?? 0 })}</p>
    </Card>
  );
}

function ProteinWeek({ d }: { d: Derived }) {
  const t = useT();
  const floor = d.protein.kind === 'auto' || d.protein.kind === 'manual' ? d.protein.floorG : null;
  const days = Array.from({ length: 7 }, (_, i) => shiftDayKey(d.today, i - 6));
  const vals = days.map((k) => d.proteinByDay[k]);
  const max = Math.max(floor ?? 0, ...vals.map((v) => v ?? 0), 1);
  const hit = floor ? vals.filter((v) => v !== undefined && v >= floor).length : 0;
  return (
    <Card>
      <h3>{t('proteinWeek.title')}</h3>
      <div className="bars">
        {days.map((k, i) => (
          <div key={k} className={`barcol ${floor && vals[i] !== undefined && vals[i]! >= floor ? 'ok' : ''}`}>
            <div className="barv" style={{ height: `${((vals[i] ?? 0) / max) * 60}px` }} />
            <span>{k.slice(8)}</span>
          </div>
        ))}
      </div>
      {floor && <p className="fine">{t('proteinWeek.note', { floor, hit })}</p>}
    </Card>
  );
}
