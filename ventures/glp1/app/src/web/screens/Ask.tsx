import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { CopingBody } from '../components/Sheets';
import { Card } from '../components/ui';
import { copingCards } from '../content/coping';
import { disclaimer } from '../content/labels';
import { db } from '../db';
import { deleteRecord } from '../actions';
import { useT } from '../i18n';

export function Ask() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const questions = useLiveQuery(() => db.questions.toArray(), []) ?? [];
  const live = questions.filter((q) => q.deletedAt === null).sort((a, b) => b.occurredAt - a.occurredAt);
  return (
    <div className="screen">
      <h1 className="pad">{t('ask.title')}</h1>
      <p className="muted pad">{t('ask.intro')}</p>
      {copingCards(t.lang).map((c) => (
        <Card key={c.id}>
          <button className="card-btn row between" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <h3>{c.title}</h3>
            <span className="muted">{open === c.id ? t('ask.hide') : t('ask.show')}</span>
          </button>
          {open === c.id && <CopingBody id={c.id} />}
        </Card>
      ))}
      <Card>
        <h3>{t('ask.questions.title')}</h3>
        {live.length === 0 ? (
          <p className="muted">{t('ask.questions.empty')}</p>
        ) : (
          <ul className="log">
            {live.map((q) => (
              <li key={q.id}>
                <label className="check grow">
                  <input type="checkbox" checked={q.asked} onChange={(e) => void db.questions.update(q.id, { asked: e.target.checked, updatedAt: Date.now() })} />
                  <span className={q.asked ? 'done' : ''}>{q.text}</span>
                </label>
                <button className="icon-btn small" aria-label={t('common.delete')} onClick={() => void deleteRecord('questions', q.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="fine pad">{disclaimer(t.lang)}</p>
    </div>
  );
}
