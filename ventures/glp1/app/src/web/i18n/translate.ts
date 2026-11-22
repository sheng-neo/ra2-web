/**
 * Message layer for the screens: a typed key, {placeholder} interpolation and English plurals.
 * No React in this file, so non-React code and tests can use it.
 *
 * - en.ts is the source of the keys. zh.ts must have every key (type Messages).
 * - `translator(lang)` returns a function `t(key, params)`. The parameters a key needs are
 *   read from the English text at compile time, so a missing one is a type error.
 * - Numbers passed as parameters are formatted for the language (Intl, en-US for English).
 *   Chinese prints them as they are, which is what the screens did before.
 * - Text built from core data (drug names, dates, units, danger-symptom cards) does not live
 *   here: the core functions take the same `Lang`.
 */
import { type Lang } from '../../core/i18n';
import { en } from './en';
import { hans, hant } from './zh';

export interface Plural {
  one: string;
  other: string;
}
export type Msg = string | Plural;
export type MsgKey = keyof typeof en;
export type Messages = { [K in MsgKey]: Msg };

type Vars<S> = S extends `${string}{${infer P}}${infer R}` ? P | Vars<R> : never;
type MsgVars<M> = M extends string ? Vars<M> : M extends Plural ? Vars<M['one']> | Vars<M['other']> | 'count' : never;
/** Names of the parameters a message needs. */
export type ParamsOf<K extends MsgKey> = MsgVars<(typeof en)[K]>;
export type Params = Record<string, string | number>;
/** The parameter argument of t(): absent when the message has no placeholders. */
export type Args<K extends MsgKey> = [ParamsOf<K>] extends [never] ? [] : [params: { [P in ParamsOf<K>]: string | number }];

/** A message that is turned into text later, where the language is known (see toast() in store.ts). */
export interface MsgRef {
  key: MsgKey;
  params?: Params;
}

export function msg<K extends MsgKey>(key: K, ...args: Args<K>): MsgRef {
  return { key, params: args[0] };
}

export const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', hans: '简体中文', hant: '繁體中文' };

const EN_NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

/** A number as text. English uses en-US grouping and decimals; Chinese prints the plain number, as before. */
export function fmtNumber(n: number, lang: Lang): string {
  return lang === 'en' ? EN_NUMBER.format(n) : String(n);
}

function lookup(lang: Lang, key: MsgKey): Msg {
  if (lang === 'en') return en[key];
  if (lang === 'hant') {
    const m = hant[key];
    if (m !== undefined) return m;
  }
  return hans[key];
}

/** Untyped entry point. Screens should use a Translator; this is for MsgRef and tests. */
export function translate(lang: Lang, key: MsgKey, params?: Params): string {
  const m: Msg | undefined = lookup(lang, key);
  // Keys are checked at compile time; a key that is missing anyway is shown as it is.
  if (m === undefined) return key;
  const text = typeof m === 'string' ? m : params?.count === 1 ? m.one : m.other;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    if (v === undefined) return whole;
    return typeof v === 'number' ? fmtNumber(v, lang) : v;
  });
}

export interface Translator {
  <K extends MsgKey>(key: K, ...args: Args<K>): string;
  readonly lang: Lang;
  /** Text of a message reference made with msg(). */
  ref(m: MsgRef): string;
}

const translators = new Map<Lang, Translator>();

/** The translator for a language. The same object is returned every time, so it is safe in hook dependencies. */
export function translator(lang: Lang): Translator {
  let t = translators.get(lang);
  if (!t) {
    const fn = <K extends MsgKey>(key: K, ...args: Args<K>) => translate(lang, key, args[0]);
    t = Object.assign(fn, { lang, ref: (m: MsgRef) => translate(lang, m.key, m.params) });
    translators.set(lang, t);
  }
  return t;
}

/** Placeholder names used in a message, for tests. */
export function placeholders(m: Msg): string[] {
  const texts = typeof m === 'string' ? [m] : [m.one, m.other];
  return [...new Set(texts.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1])))].sort();
}

export { en, hans, hant };
