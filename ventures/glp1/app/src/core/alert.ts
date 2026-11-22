/**
 * What a danger-symptom alert shows.
 *
 * Matching is in triage.ts and is the same in every build. This file decides which card the
 * person sees for the hits:
 * - with detail cards, the card written for each rule (triageCard);
 * - without them, one fixed card for every serious hit, the crisis card for a crisis hit, and
 *   nothing for a hit of a mild level.
 *
 * The fixed card says "contact your doctor right away" and offers the emergency number, so it
 * is shown only for the levels that mean that: emergency, act_now and urgent. The mild levels
 * (contact, remind, care) belong to rules about pregnancy, an operation ahead, birth control
 * pills and eating very little. Their own cards are reminders with no call button; without
 * those cards there is nothing honest to show, so nothing is shown.
 *
 * The fixed card makes no statement about what the problem might be. Its English wording is
 * fixed by the launch plan; do not reword it without review.
 */
import type { Region } from './catalog';
import type { Lang } from './i18n';
import { EMERGENCY_NUMBER, emergencyNumber, triageCard, type TriageCard, type TriageHit, type TriageLevel } from './triage';

export interface AlertCard {
  /** Stable key for lists. */
  key: string;
  /** Level used for the colour of the alert. */
  level: TriageLevel;
  card: TriageCard;
}

/** The one card shown for every serious hit that is not a crisis hit, when detail cards are off. */
export function fixedAlertCard(region: Region, lang: Lang): TriageCard {
  const text =
    lang === 'en'
      ? {
          title: 'Contact your doctor right away',
          body: `What you logged can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call ${emergencyNumber(region, 'en')}.`,
        }
      : {
          title: '请马上联系医生',
          body: `你记录的情况可能是严重问题的信号。请马上联系你的医生。如果情况紧急，请拨打 ${EMERGENCY_NUMBER[region]}。`,
        };
  // The card names the emergency number, so the call button is offered with it.
  return { ...text, showEmergency: true, pauseCoaching: true };
}

/** The levels the fixed card stands for. A hit of any other level shows no card when detail cards are off. */
const FIXED_CARD_LEVELS: readonly TriageLevel[] = ['emergency', 'act_now', 'urgent'];

/** Whether a hit shows a card at all. `detail` is the triageDetailCards switch. */
export function showsAlert(hit: TriageHit, detail: boolean): boolean {
  return detail || hit.id === 'crisis' || FIXED_CARD_LEVELS.includes(hit.level);
}

/** The hits that show a card, in the order given. An empty list means there is no alert to show. */
export function alertHits(hits: TriageHit[], detail: boolean): TriageHit[] {
  return hits.filter((h) => showsAlert(h, detail));
}

/**
 * The cards to show for the hits of one alert, most serious first (the order of `hits`).
 * `detail` is the triageDetailCards switch. The list is empty when no hit shows a card.
 */
export function alertCards(hits: TriageHit[], region: Region, lang: Lang, detail: boolean): AlertCard[] {
  if (detail) return hits.map((h) => ({ key: h.id, level: h.level, card: triageCard(h, region, lang) }));
  const cards: AlertCard[] = [];
  const crisis = hits.find((h) => h.id === 'crisis');
  if (crisis) cards.push({ key: crisis.id, level: crisis.level, card: triageCard(crisis, region, lang) });
  if (hits.some((h) => h.id !== 'crisis' && showsAlert(h, detail))) cards.push({ key: 'fixed', level: 'urgent', card: fixedAlertCard(region, lang) });
  return cards;
}

/**
 * Title of the card that is shown for one hit, or null when the hit shows no card.
 * Used where an alert is named after the fact (the reminder on Today, the export).
 */
export function alertTitle(hit: TriageHit, region: Region, lang: Lang, detail: boolean): string | null {
  return alertCards([hit], region, lang, detail)[0]?.card.title ?? null;
}
