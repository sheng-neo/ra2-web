/**
 * Labels that only the screens use. Labels built from core data (injection site, symptom,
 * grade, region, weekday) are in src/core and take the same `Lang`.
 */
import { brandLabel } from '../../core/catalog';
import { listNames, pick, type Lang, type Text } from '../../core/i18n';
import type { CourseStatus } from '../../core/types';
import type { Derived } from '../derive';
import { features } from '../features';
import { translate } from '../i18n/translate';

const STATUS: Record<CourseStatus, Text> = {
  not_started: { hans: '还没开始', en: 'Not started yet' },
  escalating: { hans: '加量中', en: 'Increasing dose' },
  maintenance: { hans: '维持剂量', en: 'Maintenance dose' },
  paused: { hans: '暂停中', en: 'Paused' },
  stopped: { hans: '已停药', en: 'Stopped' },
};

/** Where the user is in their course. It is what the user told the app, never a suggestion. */
export function statusLabel(status: CourseStatus, lang: Lang): string {
  return pick(lang, STATUS[status]);
}

// English wording is PENDING CLINICAL REVIEW.
const DISCLAIMER: Text = {
  hans: '内容仅供参考，不构成医疗建议；调整用药或训练前请咨询医生。',
  en: 'For information only. This is not medical advice. Talk to your doctor before you change your medication or your workouts.',
};

export function disclaimer(lang: Lang): string {
  return pick(lang, DISCLAIMER);
}

/**
 * The line shown in place of the chart for a medication that has none.
 * - The chart numbers belong to single brands and the saved medication names none of them
 *   (tirzepatide without Zepbound or Mounjaro): the line says so, and where the person's list
 *   offers those brands it says where to choose one.
 * - Any other medication without a chart: the neutral line of the build.
 */
export function noChartText(d: Pick<Derived, 'drug' | 'chartNeedsBrand'>, lang: Lang): string {
  if (d.drug && d.chartNeedsBrand) {
    const drug = d.drug;
    const brands = listNames(d.chartNeedsBrand.brands.map((b) => brandLabel(drug, b, lang)), lang);
    return d.chartNeedsBrand.canChoose ? translate(lang, 'curve.chooseBrand', { brands, button: translate(lang, 'me.med.change') }) : translate(lang, 'curve.twoLabels', { brands });
  }
  return translate(lang, features.curveNeedsSource ? 'curve.unavailable' : 'today.noCurve');
}

/**
 * The line at the foot of a screen. A build with the logging-tool notice shows that notice
 * here; any other build shows the disclaimer, as before.
 */
export function footNote(lang: Lang): string {
  return features.loggingToolNotice ? translate(lang, 'notice.loggingTool') : disclaimer(lang);
}
