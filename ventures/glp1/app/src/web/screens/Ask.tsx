import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { CopingBody } from '../components/Sheets';
import { Card } from '../components/ui';
import { COPING } from '../content/coping';
import { DISCLAIMER } from '../content/labels';
import { db } from '../db';
import { deleteRecord } from '../actions';

export function Ask() {
  const [open, setOpen] = useState<string | null>(null);
  const questions = useLiveQuery(() => db.questions.toArray(), []) ?? [];
  const live = questions.filter((q) => q.deletedAt === null).sort((a, b) => b.occurredAt - a.occurredAt);
  return (
    <div className="screen">
      <h1 className="pad">问问</h1>
      <p className="muted pad">AI 问答还在做。先看看常见情况怎么应对；拿不准的问题存起来，复诊时问医生。</p>
      {COPING.map((c) => (
        <Card key={c.id}>
          <button className="card-btn row between" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <h3>{c.title}</h3>
            <span className="muted">{open === c.id ? '收起' : '展开'}</span>
          </button>
          {open === c.id && <CopingBody id={c.id} />}
        </Card>
      ))}
      <Card>
        <h3>想问医生的问题</h3>
        {live.length === 0 ? (
          <p className="muted">还没有。在下面输入框里问用药剂量相关的问题，会自动存到这里。</p>
        ) : (
          <ul className="log">
            {live.map((q) => (
              <li key={q.id}>
                <label className="check grow">
                  <input type="checkbox" checked={q.asked} onChange={(e) => void db.questions.update(q.id, { asked: e.target.checked, updatedAt: Date.now() })} />
                  <span className={q.asked ? 'done' : ''}>{q.text}</span>
                </label>
                <button className="icon-btn small" aria-label="删除" onClick={() => void deleteRecord('questions', q.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="fine pad">{DISCLAIMER}</p>
    </div>
  );
}
