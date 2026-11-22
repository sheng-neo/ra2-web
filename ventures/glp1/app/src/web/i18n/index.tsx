/**
 * React side of the message layer.
 *
 * App wraps the screens in <I18nProvider lang={...}>, with the language taken from the saved
 * profile (profileLang / langOrDefault in core/i18n.ts). A component then calls useT():
 *
 *   const t = useT();
 *   t('tab.today')                      // "Today" / "今天"
 *   t('log.delete', { item: label })    // parameters are type-checked
 *   t.lang                              // pass this to core functions that take a Lang
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { DEFAULT_LANG, htmlLang, type Lang } from '../../core/i18n';
import { translator, type Translator } from './translate';

export * from './translate';

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  useEffect(() => applyDocumentLang(lang), [lang]);
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): Translator {
  return translator(useContext(LangContext));
}

/** Renders the <b>…</b> parts of a message as bold text. No other markup is understood. */
export function bold(text: string): ReactNode {
  return text.split(/<b>(.*?)<\/b>/).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

function setMeta(name: string, content: string): void {
  document.querySelector(`meta[name="${name}"]`)?.setAttribute('content', content);
}

/** Page language, title and install name follow the interface language. */
export function applyDocumentLang(lang: Lang): void {
  const t = translator(lang);
  document.documentElement.lang = htmlLang(lang);
  document.title = t('app.title');
  setMeta('description', t('app.description'));
  setMeta('apple-mobile-web-app-title', t('app.shortTitle'));
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', lang === 'en' ? '/manifest.webmanifest' : '/manifest.zh.webmanifest');
}
