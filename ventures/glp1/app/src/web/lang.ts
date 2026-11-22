/**
 * The interface language before React has loaded anything.
 */
import { DEFAULT_LANG, langOrDefault, type Lang } from '../core/i18n';
import { db } from './db';

/**
 * Language of the profile saved on this device: its `lang`, Chinese when it was saved before
 * that field existed, and English when there is no profile yet (or storage cannot be read).
 */
export async function savedLang(): Promise<Lang> {
  try {
    return langOrDefault(await db.profile.get('me'));
  } catch {
    return DEFAULT_LANG;
  }
}
