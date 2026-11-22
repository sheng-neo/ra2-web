import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { Profile } from '../../core/types';
import { CopingBody } from '../components/Sheets';
import { Card } from '../components/ui';
import { copingCards } from '../content/coping';
import { footNote } from '../content/labels';
import { db } from '../db';
import { addQuestionFromList, deleteRecord } from '../actions';
import { features } from '../features';
import { useT } from '../i18n';

/**
 * The third tab. With coping cards it is the Ask tab: the cards, then the questions saved for
 * the doctor. Without them it is only that list, under its own name (thirdTab in core/features.ts
 * names the tab by the same switch).
 */
export function Ask({ profile }: { profile: Profile }) {
  return features.copingCards ? <AskScreen /> : <QuestionsScreen profile={profile} />;
}

function AskScreen() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
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
        <QuestionList empty={t('ask.questions.empty')} />
      </Card>
      <p className="fine pad">{footNote(t.lang)}</p>
    </div>
  );
}

/**
 * The list of questions for the doctor as a screen of its own. Questions are added here with
 * the box at the top. The app only keeps the list; it never answers a question.
 */
function QuestionsScreen({ profile }: { profile: Profile }) {
  const t = useT();
  const [text, setText] = useState('');
  const add = () => {
    const s = text.trim();
    if (!s) return;
    setText('');
    void addQuestionFromList(profile, s);
  };
  return (
    <div className="screen">
      <h1 className="pad">{t('ask.questions.title')}</h1>
      <p className="muted pad">{t('questions.intro')}</p>
      <Card>
        <form className="row question-add" onSubmit={(e) => (e.preventDefault(), add())}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('questions.placeholder')} aria-label={t('questions.field')} maxLength={300} enterKeyHint="done" />
          <button type="submit" className="btn primary" disabled={!text.trim()}>
            {t('questions.add')}
          </button>
        </form>
        <QuestionList empty={t('questions.empty')} />
      </Card>
      <p className="fine pad">{footNote(t.lang)}</p>
    </div>
  );
}

function QuestionList({ empty }: { empty: string }) {
  const t = useT();
  const questions = useLiveQuery(() => db.questions.toArray(), []) ?? [];
  const live = questions.filter((q) => q.deletedAt === null).sort((a, b) => b.occurredAt - a.occurredAt);
  if (live.length === 0) return <p className="muted">{empty}</p>;
  return (
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
  );
}
