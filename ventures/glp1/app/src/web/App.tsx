import { useEffect, useState } from 'react';
import { thirdTab } from '../core/features';
import { htmlLang, langOrDefault, type Lang } from '../core/i18n';
import type { Profile } from '../core/types';
import { GuideSheet } from './components/GuideSheet';
import { InputBar } from './components/InputBar';
import { Sheets } from './components/Sheets';
import { TriageModal } from './components/TriageModal';
import { Toast } from './components/ui';
import { Ask } from './screens/Ask';
import { Me } from './screens/Me';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Trends } from './screens/Trends';
import { updateProfile } from './actions';
import { features } from './features';
import { I18nProvider, translate, useT } from './i18n';
import { useDerived, useNow, useProfile, useRecords } from './useData';

const TABS = ['today', 'trends', 'ask', 'me'] as const;
type Tab = (typeof TABS)[number];

/**
 * `bootLang` is the language of the saved profile, read before the first render (see main.tsx).
 * It is only used until the profile itself has loaded.
 */
export function App({ bootLang }: { bootLang: Lang }) {
  const profile = useProfile();
  if (profile === undefined) return <div className="loading">{translate(bootLang, 'app.loading')}</div>;
  if (profile === null || profile.onboardedAt === null) return <Onboarding existing={profile} />;
  return <Screens profile={profile} />;
}

/** The app for a profile that has finished setup. The interface language comes from that profile. */
export function Screens({ profile }: { profile: Profile }) {
  // A profile saved before the language field existed stays Chinese (see profileLang in core/i18n.ts).
  return (
    <I18nProvider lang={langOrDefault(profile)}>
      <Main profile={profile} />
    </I18nProvider>
  );
}

function Main({ profile }: { profile: Profile }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('today');
  const now = useNow();
  const rec = useRecords();
  const d = useDerived(profile, rec, now);

  useEffect(() => {
    document.documentElement.classList.toggle('large', profile.largeText);
  }, [profile.largeText]);

  return (
    <div className="app" lang={htmlLang(t.lang)}>
      <main>
        {tab === 'today' && <Today profile={profile} d={d} now={now} onOpenTrends={() => setTab('trends')} onOpenMe={() => setTab('me')} />}
        {tab === 'trends' && <Trends profile={profile} d={d} rec={rec} now={now} />}
        {tab === 'ask' && <Ask profile={profile} />}
        {tab === 'me' && <Me profile={profile} d={d} onRedoSetup={() => void updateProfile({ onboardedAt: null })} />}
      </main>
      {/* On the third tab the dock is the note box for typing a question. Without the note box it has no use there. */}
      {(tab === 'today' || (tab === 'ask' && features.freeTextNote)) && <InputBar profile={profile} d={d} />}
      <nav className="tabs">
        {TABS.map((id) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {t(id === 'ask' ? `tab.${thirdTab(features)}` : `tab.${id}`)}
          </button>
        ))}
      </nav>
      <Sheets profile={profile} d={d} />
      <TriageModal profile={profile} />
      {features.guideWarningSigns && <GuideSheet profile={profile} />}
      <Toast />
    </div>
  );
}
