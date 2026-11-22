import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FULL } from '../core/features';
import { newProfile } from '../core/profile';
import type { Profile } from '../core/types';
import { Screens } from './App';
import { countingOn } from './counting';
import { derive } from './derive';
import { BUILD_PROFILE, features } from './features';
import { I18nProvider } from './i18n';
import { Me } from './screens/Me';
import { Onboarding } from './screens/Onboarding';
import { Trends } from './screens/Trends';

describe('the default build', () => {
  it('is the full profile', () => {
    expect(import.meta.env.VITE_BUILD_PROFILE).toBeUndefined();
    expect(BUILD_PROFILE).toBe('full');
    expect(features).toBe(FULL);
  });

  it('still has the note box, the camera, the Ask tab and the daily advice card', () => {
    const profile: Profile = { ...newProfile('America/New_York'), onboardedAt: 1 };
    const html = renderToStaticMarkup(createElement(Screens, { profile }));
    for (const s of ['aria-label="Type a note"', 'aria-label="Take a photo"', 'capture="environment"', '>Ask<', '+ Food', 'class="card advice', 'Protein']) expect(html, s).toContain(s);
    expect(html).not.toContain('>Questions<');
    expect(html).not.toContain('This app is a logging tool.');
  });

  it('setup still offers every language and has no launch notice', () => {
    const html = renderToStaticMarkup(createElement(Onboarding, { existing: null }));
    for (const s of ['English', '简体中文', '繁體中文']) expect(html, s).toContain(s);
    expect(html).not.toContain('This app is a logging tool.');
  });
});

describe('the default build and the additions made for launch', () => {
  const profile: Profile = { ...newProfile('America/New_York'), onboardedAt: 1 };
  const rec = { doses: [], foods: [], weights: [], symptoms: [], workouts: [] };
  const d = derive(profile, rec, Date.UTC(2026, 10, 20, 17), 'America/New_York');
  const render = (lang: 'en' | 'hans', el: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(I18nProvider, { lang, children: el }));

  it('setup still has its five steps: no extra questions and no consent screen for counts', () => {
    const html = renderToStaticMarkup(createElement(Onboarding, { existing: null }));
    expect(html.match(/<div class="progress">(.*?)<\/div>/)![1].match(/<span/g)).toHaveLength(5);
  });

  it('settings have no Pro row and no counts setting, and the build does not count', () => {
    const me = render('en', createElement(Me, { profile, d, onRedoSetup: () => undefined }));
    expect(me).not.toMatch(/Want Pro|Usage counts|Share usage counts/);
    expect(countingOn).toBe(false);
  });

  it('Trends has the weekly summary, in the language of the profile', () => {
    expect(render('en', createElement(Trends, { profile, d, rec, now: Date.UTC(2026, 10, 20, 17) }))).toContain('Weekly summary');
    const legacy: Profile = { ...profile, region: 'CN', weightUnit: 'jin' };
    delete legacy.lang;
    const zh = render('hans', createElement(Trends, { profile: legacy, d, rec, now: Date.UTC(2026, 10, 20, 17) }));
    expect(zh).toContain('每周小结');
    expect(zh).not.toContain('Weekly summary');
  });
});

describe('the launch scripts', () => {
  const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;

  it('.env.launch names the launch profile, and nothing else', () => {
    expect(readFileSync('.env.launch', 'utf8').trim()).toBe('VITE_BUILD_PROFILE=launch');
  });

  it('build:launch and dev:launch use it, and the launch build is checked after it is built', () => {
    expect(scripts['dev:launch']).toBe('vite --mode launch');
    expect(scripts['build:launch']).toBe('vite build --mode launch && node scripts/check-launch.mjs');
    // The default scripts are as they were.
    expect(scripts.dev).toBe('vite');
    expect(scripts.build).toBe('vite build');
  });
});
