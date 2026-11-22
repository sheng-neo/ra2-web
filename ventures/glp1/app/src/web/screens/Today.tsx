import { alertTitle } from '../../core/alert';
import { doseUnitLabel, drugById } from '../../core/catalog';
import { countdownText, siteLabel } from '../../core/schedule';
import { gradeLabel, symptomLabel } from '../../core/symptoms';
import { emergencyRegion } from '../../core/triage';
import { fmtDay, fmtTime, fmtWhen } from '../../core/tz';
import type { Profile } from '../../core/types';
import { fmtWeight } from '../../core/units';
import { deleteRecord } from '../actions';
import { adviceText } from '../content/advice';
import { footNote, noChartText, statusLabel } from '../content/labels';
import { routineTitle } from '../content/workouts';
import { Curve } from '../components/Curve';
import { Card } from '../components/ui';
import { deviceTz } from '../db';
import type { Derived, TodayItem } from '../derive';
import { features } from '../features';
import { bold, useT } from '../i18n';
import { setUi } from '../store';

export function Today({ profile, d, now, onOpenTrends, onOpenMe }: { profile: Profile; d: Derived; now: number; onOpenTrends: () => void; onOpenMe: () => void }) {
  const t = useT();
  const lang = t.lang;
  const reg = profile.regimen;
  const oral = d.drug?.route === 'oral';
  const statusBits: string[] = [fmtDay(now, d.tz, lang)];
  if (reg) {
    if (reg.status === 'stopped') {
      // The "after stopping" view is maintenance-stage content. The status itself is on the next line of the header.
      if (features.maintenanceContent) statusBits.push(t('today.status.stopped'));
    } else if (d.daysSinceDose !== null && !oral) statusBits.push(d.daysSinceDose === 0 ? t('today.status.shotToday') : t('today.status.daysSinceShot', { days: d.daysSinceDose }));
    if (d.escalation?.escalationActive && (reg.status === 'escalating' || reg.status === 'maintenance')) statusBits.push(t('today.status.escalation'));
  }
  // Records of a kind this build does not show (they can come in with a restored backup) stay out of the list.
  const items = d.todayItems.filter((it) => (it.kind !== 'food' || features.foodAndProtein) && (it.kind !== 'workout' || features.workouts));

  return (
    <div className="screen">
      <header className="status">
        <div>{statusBits.join(' · ')}</div>
        {reg && d.nextDue !== null && (
          <div className={`due ${d.dueStatus}`}>{t(oral ? 'today.next.pill' : 'today.next.shot', { when: fmtWhen(d.nextDue, d.tz, now, lang), countdown: countdownText(d.nextDue, now, lang) })}</div>
        )}
        {reg && d.nextDue === null && <div className="due">{statusLabel(reg.status, lang)}</div>}
        {d.fastingUntil && <div className="due">{t('today.fasting', { count: Math.ceil((d.fastingUntil - now) / 60000) })}</div>}
        {!reg && (
          <div className="due">
            {t('today.noRegimen')}
            <button className="link" onClick={onOpenMe}>
              {t('today.noRegimen.link')}
            </button>
          </div>
        )}
      </header>

      {features.dailyAdvice ? <AdviceCard d={d} oral={oral} /> : <AlertReminder profile={profile} d={d} />}

      {features.foodAndProtein && <ProteinCard d={d} />}

      {d.curve.length > 0 && (
        <Card className="clickable">
          <button className="card-btn" onClick={onOpenTrends} aria-label={t('today.curve.open')}>
            <div className="row between">
              <h3>{t('curve.title')}</h3>
              <span className="big">{d.curveNow ?? '–'}</span>
            </div>
            <Curve points={d.curve} nowMs={now} doseTimes={[]} height={70} compact />
            <p className="fine">{t('today.curve.note')}</p>
          </button>
        </Card>
      )}
      {reg &&
        d.drug &&
        !d.curveAvailable &&
        (features.curveNeedsSource ? (
          <Card>
            <h3>{t('curve.title')}</h3>
            <p className="muted">{noChartText(d, lang)}</p>
          </Card>
        ) : (
          <p className="fine pad">{noChartText(d, lang)}</p>
        ))}

      <Card>
        <h3>{t('today.log.title')}</h3>
        {items.length === 0 ? <p className="muted">{t(features.freeTextNote ? 'today.log.empty' : 'today.log.emptyButtons')}</p> : <ul className="log">{items.map((it) => <LogRow key={it.row.id} it={it} profile={profile} tz={d.tz} />)}</ul>}
      </Card>
      <p className="fine pad">{footNote(lang)}</p>
    </div>
  );
}

/** The daily advice card ("how to spend today"), with its buttons. */
function AdviceCard({ d, oral }: { d: Derived; oral: boolean }) {
  const t = useT();
  const advice = adviceText(d.advice, d.protein, { oral, lang: t.lang });
  return (
    <Card className={`advice ${advice.tone}`}>
      <h2>{advice.title}</h2>
      <p>{advice.body}</p>
      <div className="row wrap">
        {features.workouts && d.advice.kind === 'normal' && d.advice.train && (
          <button className="btn primary" onClick={() => setUi({ sheet: 'workout' })}>
            {t('today.startWorkout')}
          </button>
        )}
        {d.advice.kind === 'triage' && (
          <button className="btn danger" onClick={() => d.advice.kind === 'triage' && setUi({ triage: { hits: [d.advice.hit], rowId: d.openTriage?.rowId ?? null } })}>
            {t('today.seeAlert')}
          </button>
        )}
        {d.advice.kind === 'dose_day' && (
          <button className="btn primary" onClick={() => setUi({ sheet: 'dose' })}>
            {t(oral ? 'action.logPill' : 'action.logShot')}
          </button>
        )}
        <button className="btn" onClick={() => setUi({ sheet: 'symptom' })}>
          {t('today.unwell')}
        </button>
      </div>
      {d.fastLoss && <p className="warn">{t('today.fastLoss')}</p>}
    </Card>
  );
}

/**
 * Where there is no daily advice card: a danger-symptom alert from today stays at the top of
 * the screen, under the title of the card that was shown, with a way to open it again.
 */
function AlertReminder({ profile, d }: { profile: Profile; d: Derived }) {
  const t = useT();
  if (d.advice.kind !== 'triage') return null;
  const hit = d.advice.hit;
  // A hit that shows no card in this build (it can come in with a restored backup) has nothing to keep in view.
  const title = alertTitle(hit, emergencyRegion(deviceTz(), profile.region), t.lang, features.triageDetailCards);
  if (title === null) return null;
  return (
    <Card className="advice alert">
      <h2>{title}</h2>
      <div className="row wrap">
        <button className="btn danger" onClick={() => setUi({ triage: { hits: [hit], rowId: d.openTriage?.rowId ?? null } })}>
          {t('today.seeAlert')}
        </button>
      </div>
    </Card>
  );
}

function ProteinCard({ d }: { d: Derived }) {
  const t = useT();
  const p = d.protein;
  if (p.kind === 'off') return null;
  if (p.kind === 'ask_doctor') {
    return (
      <Card>
        <h3>{t('protein.title')}</h3>
        <p>{bold(t('protein.askDoctor', { grams: d.proteinToday }))}</p>
      </Card>
    );
  }
  const floor = p.floorG;
  const pct = Math.min(100, Math.round((d.proteinToday / floor) * 100));
  const gap = Math.max(0, floor - d.proteinToday);
  return (
    <Card>
      <div className="row between">
        <h3>{t('protein.title')}</h3>
        <span>
          <b className="big">{d.proteinToday}</b> {t('protein.ofFloor', { floor })}
        </span>
      </div>
      <div className="bar-track" aria-label={t('protein.done', { pct })}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted">
        {gap > 0 ? t('protein.gap', { gap }) : t('protein.reached')}
        {p.kind === 'auto' && t('protein.ideal', { low: p.idealLowG, high: p.idealHighG })}
      </p>
    </Card>
  );
}

function LogRow({ it, profile, tz }: { it: TodayItem; profile: Profile; tz: string }) {
  const t = useT();
  const lang = t.lang;
  let label = '';
  let value = '';
  let table: 'doses' | 'foods' | 'weights' | 'symptoms' | 'workouts' = 'foods';
  switch (it.kind) {
    case 'dose': {
      const drug = drugById(it.row.drugId);
      label = drug.route === 'oral' ? t('log.pill') : it.row.site ? t('log.shotAt', { site: siteLabel(it.row.site, lang) }) : t('log.shot');
      value = `${it.row.amount} ${doseUnitLabel(it.row.unit, lang)}`;
      table = 'doses';
      break;
    }
    case 'food': {
      const grams = Math.round(it.row.proteinG);
      const wide = it.row.lowG !== undefined && it.row.highG !== undefined && it.row.highG - it.row.lowG >= 4;
      label = it.row.text;
      value = wide ? t('log.gramsRange', { grams, spread: Math.round((it.row.highG! - it.row.lowG!) / 2) }) : t('log.grams', { grams });
      table = 'foods';
      break;
    }
    case 'weight':
      label = t('log.weight');
      value = fmtWeight(it.row.kg, profile.weightUnit, lang);
      table = 'weights';
      break;
    case 'symptom':
      label = it.row.kind === 'other' ? (it.row.note ?? symptomLabel('other', lang)) : symptomLabel(it.row.kind, lang);
      value = it.row.triageId ? t('log.alerted') : gradeLabel(it.row.grade, lang);
      table = 'symptoms';
      break;
    case 'workout':
      label = t('log.workout', { routine: routineTitle(it.row.routine, lang) });
      value = t(it.row.variant === 'light' ? 'workout.light' : 'workout.standard');
      table = 'workouts';
      break;
  }
  return (
    <li>
      <span className="time">{fmtTime(it.row.occurredAt, tz, lang)}</span>
      <span className="what">{label}</span>
      <span className="val">{value}</span>
      <button className="icon-btn small" aria-label={t('log.delete', { item: label })} onClick={() => void deleteRecord(table, it.row.id)}>
        ✕
      </button>
    </li>
  );
}
