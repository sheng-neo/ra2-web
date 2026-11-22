/**
 * The default build never counts, even if a count address is present when it is built: only
 * the launch profile has the switch. This file runs as the default profile with VITE_COUNT_URL set.
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => vi.stubEnv('VITE_COUNT_URL', 'https://counts.test/api/count'));

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { newProfile } from '../core/profile';
import type { Profile } from '../core/types';
import { countingOn, setCountsConsent, syncCounts, tapWantsPro } from './counting';
import { db } from './db';
import { derive } from './derive';
import { BUILD_PROFILE } from './features';
import { I18nProvider } from './i18n';
import { Me } from './screens/Me';
import { Onboarding } from './screens/Onboarding';

const fetchSpy = vi.fn(() => Promise.reject(new Error('the default build must not send counts')));
beforeAll(() => vi.stubGlobal('fetch', fetchSpy));
afterAll(() => vi.unstubAllGlobals());

describe('the default build with a count address', () => {
  const profile: Profile = { ...newProfile('America/New_York'), onboardedAt: 1 };

  it('does not count', () => {
    expect(BUILD_PROFILE).toBe('full');
    expect(import.meta.env.VITE_COUNT_URL).toBe('https://counts.test/api/count');
    expect(countingOn).toBe(false);
  });

  it('asks nothing: no consent screen in setup and no setting', () => {
    const setup = renderToStaticMarkup(createElement(Onboarding, { existing: null }));
    expect(setup.match(/<div class="progress">(.*?)<\/div>/)![1].match(/<span/g)).toHaveLength(5);
    const d = derive(profile, { doses: [], foods: [], weights: [], symptoms: [], workouts: [] }, 1_800_000_000_000, 'America/New_York');
    const me = renderToStaticMarkup(createElement(I18nProvider, { lang: 'en', children: createElement(Me, { profile, d, onRedoSetup: () => undefined }) }));
    expect(me).not.toMatch(/Usage counts|Share usage counts|Want Pro/);
  });

  it('sends nothing, whatever is called', async () => {
    await db.profile.put(profile);
    await setCountsConsent(true);
    await tapWantsPro(Date.now());
    await syncCounts(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
