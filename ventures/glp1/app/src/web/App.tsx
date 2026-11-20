import { useEffect, useState } from 'react';
import type { Profile } from '../core/types';
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
import { useDerived, useNow, useProfile, useRecords } from './useData';

type Tab = 'today' | 'trends' | 'ask' | 'me';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'trends', label: '趋势' },
  { id: 'ask', label: '问问' },
  { id: 'me', label: '我的' },
];

export function App() {
  const profile = useProfile();
  if (profile === undefined) return <div className="loading">加载中…</div>;
  if (profile === null || profile.onboardedAt === null) return <Onboarding existing={profile} />;
  return <Main profile={profile} />;
}

function Main({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('today');
  const now = useNow();
  const rec = useRecords();
  const d = useDerived(profile, rec, now);

  useEffect(() => {
    document.documentElement.classList.toggle('large', profile.largeText);
  }, [profile.largeText]);

  return (
    <div className="app">
      <main>
        {tab === 'today' && <Today profile={profile} d={d} now={now} onOpenTrends={() => setTab('trends')} onOpenMe={() => setTab('me')} />}
        {tab === 'trends' && <Trends profile={profile} d={d} rec={rec} now={now} />}
        {tab === 'ask' && <Ask />}
        {tab === 'me' && <Me profile={profile} d={d} onRedoSetup={() => void updateProfile({ onboardedAt: null })} />}
      </main>
      {(tab === 'today' || tab === 'ask') && <InputBar profile={profile} d={d} />}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <Sheets profile={profile} d={d} />
      <TriageModal profile={profile} />
      <Toast />
    </div>
  );
}
