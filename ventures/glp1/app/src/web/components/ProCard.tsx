import { useState } from 'react';
import { countingOn, tapWantsPro } from '../counting';
import { useT } from '../i18n';
import { useInstallState } from './Counts';
import { Card, Sheet } from './ui';

/**
 * The "Want Pro?" row in settings. Its sheet says that Pro is not available yet, promises
 * nothing and lists no features. The one button records that the person would want a paid
 * version. It unlocks nothing and changes nothing in the app.
 */
export function ProCard() {
  const t = useT();
  const state = useInstallState();
  const [open, setOpen] = useState(false);
  const sharing = countingOn && state?.countsConsent === true;
  const tapped = (state?.proTappedAt ?? null) !== null;
  const counted = (state?.proCountedAt ?? null) !== null;
  // A tap made while sharing was off was not sent. If sharing is on now, the question can be answered again.
  const done = tapped && (counted || !sharing);
  return (
    <Card>
      <button className="card-btn row-link" onClick={() => setOpen(true)}>
        <h3>{t('me.pro.row')}</h3>
        <span className="muted" aria-hidden="true">
          ›
        </span>
      </button>
      <Sheet open={open} title={t('me.pro.title')} onClose={() => setOpen(false)}>
        <p>{t('pro.sheet.body')}</p>
        <p>{t('pro.sheet.ask')}</p>
        {done ? (
          <p role="status">
            <b>{t('pro.sheet.thanks')}</b>
          </p>
        ) : (
          <button className="btn primary block" onClick={() => void tapWantsPro(Date.now())}>
            {t('pro.sheet.want')}
          </button>
        )}
        {countingOn && <p className="fine">{t(sharing ? 'pro.sheet.counted' : 'pro.sheet.notCounted')}</p>}
      </Sheet>
    </Card>
  );
}
