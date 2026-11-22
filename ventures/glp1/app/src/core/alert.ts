/**
 * What a danger-symptom alert shows.
 *
 * Matching is in triage.ts and is the same in every build. This file decides which card the
 * person sees for the hits:
 * - with detail cards, the card written for each rule (triageCard). A hit marked `fixedCard`
 *   shows the fixed card here too: it was raised by a sign the rule's own card does not name
 *   (see triage.ts), and that card would tell the person about something they did not report;
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
 * fixed by the launch plan; do not reword it without review. One word follows where the alert
 * came from: "What you logged" for a log entry, "What you wrote" for a question typed into the
 * list of questions for the doctor, where nothing is logged.
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

/**
 * The one card shown for every serious hit that is not a crisis hit, when detail cards are off.
 * `wrote` is true when the alert came from a typed question and nothing was logged. The Chinese
 * card has one wording for both; it is not changed without review.
 */
export function fixedAlertCard(region: Region, lang: Lang, wrote = false): TriageCard {
  const text =
    lang === 'en'
      ? {
          title: 'Contact your doctor right away',
          body: `What you ${wrote ? 'wrote' : 'logged'} can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call ${emergencyNumber(region, 'en')}.`,
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
 * `wrote` is passed on to the fixed card (see fixedAlertCard).
 */
export function alertCards(hits: TriageHit[], region: Region, lang: Lang, detail: boolean, wrote = false): AlertCard[] {
  if (detail) {
    // The card of each rule, in the order of the hits. Hits marked `fixedCard` share one fixed card, where the first of them stands.
    const cards: AlertCard[] = [];
    for (const h of hits) {
      if (!h.fixedCard) cards.push({ key: h.id, level: h.level, card: triageCard(h, region, lang) });
      else if (!cards.some((c) => c.key === 'fixed')) cards.push({ key: 'fixed', level: h.level, card: fixedAlertCard(region, lang, wrote) });
    }
    return cards;
  }
  const cards: AlertCard[] = [];
  const crisis = hits.find((h) => h.id === 'crisis');
  if (crisis) cards.push({ key: crisis.id, level: crisis.level, card: triageCard(crisis, region, lang) });
  if (hits.some((h) => h.id !== 'crisis' && showsAlert(h, detail))) cards.push({ key: 'fixed', level: 'urgent', card: fixedAlertCard(region, lang, wrote) });
  return cards;
}

/**
 * Title of the card that is shown for one hit, or null when the hit shows no card.
 * Used where an alert is named after the fact (the reminder on Today, the export).
 */
export function alertTitle(hit: TriageHit, region: Region, lang: Lang, detail: boolean): string | null {
  return alertCards([hit], region, lang, detail)[0]?.card.title ?? null;
}
