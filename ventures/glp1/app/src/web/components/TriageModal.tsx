import { alertCards } from '../../core/alert';
import { guideChoice } from '../../core/medGuide';
import { emergencyDial, emergencyRegion } from '../../core/triage';
import { deviceTz } from '../db';
import type { Profile } from '../../core/types';
import { ackTriage } from '../actions';
import { features } from '../features';
import { useT } from '../i18n';
import { setUi, useUi } from '../store';

/** 危险症状分诊卡。全屏、警示色，是"不显示红色警告"规则的唯一例外。 */
export function TriageModal({ profile }: { profile: Profile }) {
  const { triage } = useUi();
  const t = useT();
  if (!triage) return null;
  const where = emergencyRegion(deviceTz(), profile.region);
  // Which cards the hits show depends on the build: the card of each rule, or one fixed card (core/alert.ts).
  const cards = alertCards(triage.hits, where, t.lang, features.triageDetailCards, triage.wrote === true);
  if (!cards.length) return null;
  const emergency = cards.some((c) => c.card.showEmergency);
  const num = emergencyDial(where);
  return (
    <div className="triage-backdrop" role="alertdialog" aria-label={t('triage.aria')}>
      <div className={`triage ${cards[0].level}`}>
        {cards.map(({ key, card }) => (
          <div key={key} className="triage-item">
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </div>
        ))}
        <p className="fine">{t('triage.note')}</p>
        {/* The whole list of the Medication Guide, never the one item a rule may stand for: the app does not say which it is. Not on a crisis card. */}
        {features.guideWarningSigns && cards.some((c) => c.key !== 'crisis') && guideChoice(profile.regimen, profile.region).kind !== 'none' && (
          <button className="btn block guide-open" onClick={() => setUi({ guide: true })}>
            {t('guide.open')}
          </button>
        )}
        <div className="row">
          {emergency && num !== null && (
            <a className="btn danger" href={`tel:${num}`}>
              {t('triage.call', { number: num })}
            </a>
          )}
          <button className="btn" onClick={() => void ackTriage(triage.rowId)}>
            {t('triage.ack')}
          </button>
        </div>
      </div>
    </div>
  );
}
