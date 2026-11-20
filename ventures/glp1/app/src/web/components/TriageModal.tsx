import { EMERGENCY_NUMBER, triageCard } from '../../core/triage';
import type { Profile } from '../../core/types';
import { ackTriage } from '../actions';
import { useUi } from '../store';

/** 危险症状分诊卡。全屏、警示色，是"不显示红色警告"规则的唯一例外。 */
export function TriageModal({ profile }: { profile: Profile }) {
  const { triage } = useUi();
  if (!triage) return null;
  const cards = triage.hits.map((h) => ({ hit: h, card: triageCard(h, profile.region) }));
  const emergency = cards.some((c) => c.card.showEmergency);
  const num = EMERGENCY_NUMBER[profile.region];
  return (
    <div className="triage-backdrop" role="alertdialog" aria-label="身体情况提醒">
      <div className={`triage ${cards[0].hit.level}`}>
        {cards.map(({ hit, card }) => (
          <div key={hit.id} className="triage-item">
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </div>
        ))}
        <p className="fine">这是根据你的描述做的提醒，不是诊断。拿不准就去看医生。</p>
        <div className="row">
          {emergency && /^\d+$/.test(num) && (
            <a className="btn danger" href={`tel:${num}`}>
              拨打 {num}
            </a>
          )}
          <button className="btn" onClick={() => void ackTriage(triage.rowId)}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
