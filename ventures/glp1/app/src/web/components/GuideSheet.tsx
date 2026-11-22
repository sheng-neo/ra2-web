import { brandLabel, drugById } from '../../core/catalog';
import { listNames } from '../../core/i18n';
import { guideChoice, guideDated, type GuideSection, type MedGuide } from '../../core/medGuide';
import type { Profile } from '../../core/types';
import { useT } from '../i18n';
import { setUi, useUi } from '../store';

/**
 * The warning signs of the person's own medication, in the words of its FDA Medication Guide.
 *
 * Everything in the list is the guide's text as it stands in core/medGuide.ts: the two
 * headings, the line under each, every item whole and in the guide's order, sub-bullets as
 * bullets. Nothing is reworded, shortened, reordered, set in bold or coloured here, and nothing
 * marks one item as more urgent than another: the app does not say which item a person may
 * have. So this screen always shows the whole list, also when it is opened from an alert.
 *
 * It lies over everything else, an alert included, so closing it leads back to where it was opened.
 */
export function GuideSheet({ profile }: { profile: Profile }) {
  const { guide } = useUi();
  const t = useT();
  if (!guide) return null;
  const close = () => setUi({ guide: false });
  const reg = profile.regimen;
  const choice = guideChoice(reg, profile.region);
  const drug = reg ? drugById(reg.drugId) : null;
  return (
    <div className="sheet-backdrop over-alert" onClick={close}>
      <div className="sheet guide" role="dialog" aria-label={t('guide.title')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{t('guide.title')}</h2>
          <button className="icon-btn" aria-label={t('common.close')} onClick={close}>
            ✕
          </button>
        </div>
        <div className="sheet-body">
          {choice.kind === 'guide' && drug ? (
            <GuideText guide={choice.guide} brand={brandLabel(drug, choice.brand, t.lang)} />
          ) : choice.kind === 'chooseBrand' && drug ? (
            <p>{t('guide.chooseBrand', { brands: listNames(choice.brands.map((b) => brandLabel(drug, b, t.lang)), t.lang), button: t('me.med.change') })}</p>
          ) : (
            <p>{reg ? t('guide.none') : t('dose.setupFirst')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function GuideText({ guide, brand }: { guide: MedGuide; brand: string }) {
  const t = useT();
  return (
    <>
      <p>{t('guide.source', { brand, dated: guideDated(guide, t.lang) })}</p>
      <p className="fine">
        {t('guide.parts')}{' '}
        <a className="guide-link" href={guide.url} target="_blank" rel="noopener noreferrer">
          {guide.url}
        </a>
      </p>
      {/* A Chinese screen says once that what follows is the English original. */}
      {t.lang !== 'en' && <p className="warn">{t('guide.original')}</p>}
      <div className="guide-text" lang="en">
        <Part section={guide.mostImportant} />
        <Part section={guide.seriousSideEffects} />
      </div>
    </>
  );
}

/** One part of the guide: its heading, the line under it, and its items. */
function Part({ section }: { section: GuideSection }) {
  return (
    <section>
      <h3>{section.question}</h3>
      <p>{section.intro}</p>
      <ul>
        {section.items.map((item) => (
          <li key={item.id}>
            {item.text}
            {item.bullets.length > 0 && (
              <ul>
                {item.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {item.after !== undefined && <p>{item.after}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
