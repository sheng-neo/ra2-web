import { HEARD_FROM, LOGGED_BEFORE, TIME_ON_MEDICATION, type SetupAnswers } from '../../core/setupQuestions';
import { useT } from '../i18n';
import { Chips } from './ui';

/**
 * The three optional questions at the end of setup. Each one is a row of choices; tapping the
 * chosen answer again clears it, so a question can always be left blank.
 */
export function SetupQuestions({ answers, onChange }: { answers: SetupAnswers; onChange: (next: SetupAnswers) => void }) {
  const t = useT();
  const pick = <K extends keyof SetupAnswers>(key: K, value: SetupAnswers[K]) => onChange({ ...answers, [key]: answers[key] === value ? null : value });
  return (
    <>
      <h3>{t('onb.about.time.title')}</h3>
      <Chips options={TIME_ON_MEDICATION.map((v) => ({ value: v, label: t(`onb.about.time.${v}`) }))} value={answers.timeOnMedication} onChange={(v) => pick('timeOnMedication', v)} />
      <h3>{t('onb.about.before.title')}</h3>
      <Chips options={LOGGED_BEFORE.map((v) => ({ value: v, label: t(`onb.about.before.${v}`) }))} value={answers.loggedBefore} onChange={(v) => pick('loggedBefore', v)} />
      <h3>{t('onb.about.heard.title')}</h3>
      <Chips options={HEARD_FROM.map((v) => ({ value: v, label: t(`onb.about.heard.${v}`) }))} value={answers.heardFrom} onChange={(v) => pick('heardFrom', v)} />
    </>
  );
}
