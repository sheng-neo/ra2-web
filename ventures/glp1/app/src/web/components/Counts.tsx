/**
 * Anonymous counts on screen: the explanation of what is sent, the two answers, and the card in
 * settings. The same explanation and the same two buttons are used in setup and in settings, so
 * a yes is always given with the full list in view.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { setCountsConsent } from '../counting';
import { features } from '../features';
import { msg, useT } from '../i18n';
import { installDb, type InstallState } from '../installDb';
import { toast } from '../store';
import { Card, Sheet } from './ui';

/**
 * What this install knows about itself, kept up to date. Undefined while it loads, when nothing
 * is saved yet, and when the storage cannot be read (the screens then show "off").
 */
export function useInstallState(): InstallState | undefined {
  return useLiveQuery(() => installDb().state.get('me').catch(() => undefined), []);
}

/**
 * Everything that is sent, one line each. It follows CountEvent in src/core/counts.ts: a field
 * added there needs a line here. A line is left out where the build cannot send that thing.
 */
const SENT = ['id', 'answers', 'form', 'activated', 'weekly', 'week2', 'streak', 'paused', 'pro', 'day'] as const;

export function CountsExplainer() {
  const t = useT();
  const lines = SENT.filter((k) => (k !== 'answers' || features.setupQuestions) && (k !== 'pro' || features.proInterest));
  return (
    <div className="counts-explainer">
      <p>{t('counts.intro')}</p>
      <p>{t('counts.what')}</p>
      <ul>
        {lines.map((k) => (
          <li key={k}>{t(`counts.item.${k}`)}</li>
        ))}
      </ul>
      <p>{t('counts.never')}</p>
      <p>{t('counts.received')}</p>
      <p>{t('counts.notShared')}</p>
      <p className="fine">{t('counts.address')}</p>
      <p className="fine">{t('counts.change')}</p>
    </div>
  );
}

/** The two answers: two buttons of the same size and style, and neither is chosen in advance. */
export function CountsChoice({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  const t = useT();
  return (
    <div className="choice">
      <button className="btn block" onClick={() => onAnswer(true)}>
        {t('counts.share')}
      </button>
      <button className="btn block" onClick={() => onAnswer(false)}>
        {t('counts.decline')}
      </button>
    </div>
  );
}

/**
 * The setting. Turning it on opens the explanation with the two answers; it is on only after
 * "Share anonymous counts" is tapped there. Turning it off takes one tap.
 */
export function CountsCard() {
  const t = useT();
  const state = useInstallState();
  const [open, setOpen] = useState(false);
  const on = state?.countsConsent === true;
  const answer = (yes: boolean) => {
    setOpen(false);
    if (yes !== on) toast(msg(yes ? 'toast.counts.on' : 'toast.counts.off'));
    void setCountsConsent(yes);
  };
  return (
    <Card>
      <h3>{t('me.counts.title')}</h3>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => (e.target.checked ? setOpen(true) : answer(false))} />
        {t('me.counts.toggle')}
      </label>
      <p className="fine">{t(on ? 'me.counts.on' : 'me.counts.off')}</p>
      {on && state?.installId && <p className="fine install-id">{t('me.counts.id', { id: state.installId })}</p>}
      {state && state.pendingDeletes.length > 0 && <p className="fine">{t('me.counts.deleting')}</p>}
      <button className="link" onClick={() => setOpen(true)}>
        {t('me.counts.details')}
      </button>
      <Sheet open={open} title={t('counts.title')} onClose={() => setOpen(false)}>
        <CountsExplainer />
        <CountsChoice onAnswer={answer} />
      </Sheet>
    </Card>
  );
}
