import { useState } from 'react';
import { useT } from '../i18n';
import { wipeAllData } from '../wipe';

/** "Delete all data", asked twice: the first tap changes the label, the second one deletes. */
export function WipeButton() {
  const t = useT();
  const [asked, setAsked] = useState(false);
  return (
    <button className="btn danger" onClick={() => (asked ? void wipeAllData() : setAsked(true))}>
      {asked ? t('me.wipe.confirm') : t('me.wipe.title')}
    </button>
  );
}
