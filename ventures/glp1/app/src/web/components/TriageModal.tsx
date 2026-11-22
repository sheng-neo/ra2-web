import { emergencyDial, emergencyRegion, triageCard } from '../../core/triage';
import { deviceTz } from '../db';
import type { Profile } from '../../core/types';
import { ackTriage } from '../actions';
import { useT } from '../i18n';
import { useUi } from '../store';

/** 危险症状分诊卡。全屏、警示色，是"不显示红色警告"规则的唯一例外。 */
export function TriageModal({ profile }: { profile: Profile }) {
  const { triage } = useUi();
  const t = useT();
  if (!triage) return null;
  const where = emergencyRegion(deviceTz(), profile.region);
  const cards = triage.hits.map((h) => ({ hit: h, card: triageCard(h, where, t.lang) }));
  const emergency = cards.some((c) => c.card.showEmergency);
  const num = emergencyDial(where);
  return (
    <div className="triage-backdrop" role="alertdialog" aria-label={t('triage.aria')}>
      <div className={`triage ${cards[0].hit.level}`}>
        {cards.map(({ hit, card }) => (
          <div key={hit.id} className="triage-item">
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </div>
        ))}
        <p className="fine">{t('triage.note')}</p>
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
