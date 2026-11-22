/**
 * Language layer.
 *
 * - One language per profile. Every core function that returns or builds user-facing text
 *   takes a `Lang` and returns English for 'en'.
 * - 'hans' text is the original Chinese copy and must not change.
 * - 'hant' behaves as it did before this layer existed: it uses Traditional text where the
 *   code already had it (drug names) and falls back to the Simplified text everywhere else.
 * - A saved profile without a `lang` field belongs to an existing Chinese user and is shown
 *   exactly as before: 'hans'. Only a brand-new profile starts in English.
 */

export type Lang = 'en' | 'hans' | 'hant';

export const LANGS: readonly Lang[] = ['en', 'hans', 'hant'];

/** Language of a brand-new profile. */
export const DEFAULT_LANG: Lang = 'en';

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'hans' || v === 'hant';
}

export function isChinese(lang: Lang): boolean {
  return lang !== 'en';
}

/** The two profile fields that decide the language. Kept structural so this file has no imports. */
export interface HasLang {
  lang?: Lang | null;
  script?: 'hans' | 'hant';
}

/**
 * Language of a saved profile: `lang` if set, otherwise 'hans'.
 * A profile saved before `lang` existed stays Chinese and looks exactly as it did. The screens
 * of that time never read `script`, so it is not read here either: such a profile is 'hans'
 * whatever its `script` says. Traditional Chinese is chosen through `lang: 'hant'`.
 */
export function profileLang(p: HasLang): Lang {
  return isLang(p.lang) ? p.lang : 'hans';
}

/** Language to use when there may be no profile yet (first launch): DEFAULT_LANG. */
export function langOrDefault(p: HasLang | null | undefined): Lang {
  return p ? profileLang(p) : DEFAULT_LANG;
}

/** Value for the older `Profile.script` field, which is still written for backward compatibility. */
export function scriptFor(lang: Lang): 'hans' | 'hant' {
  return lang === 'hant' ? 'hant' : 'hans';
}

/** A piece of text in every language. `hant` is optional and falls back to `hans`. */
export interface Text<T = string> {
  en: T;
  hans: T;
  hant?: T;
}

export function pick<T>(lang: Lang, t: Text<T>): T {
  if (lang === 'en') return t.en;
  if (lang === 'hant' && t.hant !== undefined) return t.hant;
  return t.hans;
}

/** English count with the right plural: plural(1, 'day') is "1 day", plural(2, 'day') is "2 days". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** BCP 47 tag, for the page's lang attribute and for Intl. */
export function htmlLang(lang: Lang): 'en' | 'zh-Hans' | 'zh-Hant' {
  return lang === 'en' ? 'en' : lang === 'hant' ? 'zh-Hant' : 'zh-Hans';
}
