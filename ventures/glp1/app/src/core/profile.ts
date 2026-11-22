/**
 * Defaults for a brand-new profile.
 * New profiles start in English, in the region of the phone's time zone. Profiles saved earlier
 * are never rewritten by this file: they keep their language (see profileLang in i18n.ts) and
 * their region.
 */
import type { Region } from './catalog';
import { DEFAULT_LANG, scriptFor, type Lang } from './i18n';
import { regionFromTz } from './triage';
import type { Profile, Safety } from './types';
import { defaultWeightUnit } from './units';

export const NO_SAFETY_FLAGS: Safety = { kidneyOrLiver: false, pregnancy: false, insulinOrSU: false, eatingDisorder: false, under18: false };

/**
 * Where a new user starts, in any language: the region of the phone's time zone, or 'OTHER'
 * when the time zone is not one the app knows. It is never a fixed country. The region decides
 * which brand names are offered, and when the time zone is unknown it also decides the
 * emergency number on the alert cards (see emergencyRegion in triage.ts). A number must not
 * come from a default the user never chose: 'OTHER' shows "your local emergency number".
 */
export function startRegion(tz: string): Region {
  return regionFromTz(tz) ?? 'OTHER';
}

/**
 * A blank profile that has not been through setup yet (onboardedAt is null).
 * `tz` is the phone's time zone; the region is guessed from it (see startRegion).
 */
export function newProfile(tz: string, lang: Lang = DEFAULT_LANG): Profile {
  const region = startRegion(tz);
  return {
    id: 'me',
    lang,
    script: scriptFor(lang),
    region,
    weightUnit: defaultWeightUnit(lang, region),
    heightCm: null,
    startWeightKg: null,
    goalWeightKg: null,
    birthYear: null,
    dayStartHour: 4,
    tz,
    safety: { ...NO_SAFETY_FLAGS },
    proteinMode: 'auto',
    proteinManualG: null,
    aiConsent: null,
    regimen: null,
    onboardedAt: null,
    largeText: false,
  };
}
