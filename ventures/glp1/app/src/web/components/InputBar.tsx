import { useRef, useState } from 'react';
import { doseUnitLabel, drugById, drugShortName, regimenLabel } from '../../core/catalog';
import { doseCheckApplies } from '../../core/features';
import { foodById, foodName, foodShortName } from '../../core/foods';
import type { Lang } from '../../core/i18n';
import { parseLocal } from '../../core/localParse';
import { siteLabel, SITES, type Site } from '../../core/schedule';
import { gradeLabel, symptomLabel } from '../../core/symptoms';
import { fmtWhen } from '../../core/tz';
import type { Profile } from '../../core/types';
import { addDose, addFood, addQuestion, addSymptom, addWeight, checkTextTriage, updateProfile } from '../actions';
import { AiUnavailable, compressImage, parseRemote, type AiEvent } from '../api';
import type { Derived } from '../derive';
import { features } from '../features';
import { bold, useT } from '../i18n';
import { routeQuestion } from '../intent';
import { setUi } from '../store';
import { DoseForm, type DoseDraft } from './Sheets';

type Pending =
  | { key: string; kind: 'dose'; draft: Partial<DoseDraft> }
  | { key: string; kind: 'food'; ev: Extract<AiEvent, { type: 'food' }> }
  | { key: string; kind: 'symptom'; ev: Extract<AiEvent, { type: 'symptom' }> }
  | { key: string; kind: 'doctorq'; text: string }
  | { key: string; kind: 'question'; text: string }
  | { key: string; kind: 'unrecognized'; text: string; reason: 'ai_off' | 'ai_unavailable' | 'empty' }
  | { key: string; kind: 'consent'; text?: string; image?: File };

let seq = 0;
const k = () => `p${++seq}`;

/**
 * The dock above the tabs. With the note box it is the quick buttons plus the box. Without it,
 * logging is by the quick buttons only.
 */
export function InputBar({ profile, d }: { profile: Profile; d: Derived }) {
  if (features.freeTextNote) return <NoteDock profile={profile} d={d} />;
  return (
    <div className="input-dock">
      <QuickButtons profile={profile} d={d} only />
    </div>
  );
}

/** The quick log buttons: shot or pill, weight, symptom, and the food buttons where food is logged. */
function QuickButtons({ profile, d, only = false }: { profile: Profile; d: Derived; only?: boolean }) {
  const t = useT();
  const reg = profile.regimen;
  const oral = reg ? drugById(reg.drugId).route === 'oral' : false;
  return (
    <div className={only ? 'quick only' : 'quick'}>
      <button className="qbtn" onClick={() => setUi({ sheet: 'dose' })}>{t(oral ? 'action.logPill' : 'action.logShot')}</button>
      <button className="qbtn" onClick={() => setUi({ sheet: 'weight' })}>{t('quick.weight')}</button>
      <button className="qbtn" onClick={() => setUi({ sheet: 'symptom' })}>{t('quick.symptom')}</button>
      {features.foodAndProtein && <QuickFoods d={d} />}
    </div>
  );
}

function QuickFoods({ d }: { d: Derived }) {
  const t = useT();
  const lang = t.lang;
  const quickFoods = topFoods(d, lang).slice(0, 3);
  return (
    <>
      {quickFoods.map((f) => (
        <button key={f.id} className="qbtn food" onClick={() => void addFood({ text: foodName(f, lang), proteinG: f.proteinG, lowG: f.proteinG - f.spreadG, highG: f.proteinG + f.spreadG, foodId: f.id }, 'quick')}>
          {t('quick.foodItem', { name: f.short, grams: f.proteinG })}
        </button>
      ))}
      <button className="qbtn" onClick={() => setUi({ sheet: 'food' })}>{t('quick.food')}</button>
    </>
  );
}

/** The note box with everything a typed note or a photo can turn into. */
function NoteDock({ profile, d }: { profile: Profile; d: Derived }) {
  const t = useT();
  const lang = t.lang;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const drop = (key: string) => setPending((ps) => ps.filter((p) => p.key !== key));
  const push = (...ps: Pending[]) => setPending((cur) => [...cur, ...ps]);
  const reg = profile.regimen;
  const photo = t('common.photo');

  const context = () => ({
    drug: reg ? regimenLabel(reg, profile.region, lang) : null,
    doseUnit: reg?.doseUnit ?? 'mg',
    weightUnit: profile.weightUnit,
    localTime: new Date().toString(),
  });

  /** What the phone could not read. Where model calls exist and the user agreed, it goes to the server. */
  const handleAi = async (input: { text?: string; image?: File }) => {
    // A build without model calls stops here: what was typed stays on the phone.
    if (!features.ai) return push({ key: k(), kind: 'unrecognized', text: input.text ?? photo, reason: 'empty' });
    if (profile.aiConsent === null) return push({ key: k(), kind: 'consent', text: input.text, image: input.image });
    if (profile.aiConsent === false) return push({ key: k(), kind: 'unrecognized', text: input.text ?? photo, reason: 'ai_off' });
    await readRemote(input);
  };

  /** The only place that sends a note or a photo to the server. */
  const readRemote = async (input: { text?: string; image?: File }) => {
    if (!features.ai) return;
    setBusy(true);
    try {
      const events = await parseRemote(input.image ? { imageJpegBase64: await compressImage(input.image) } : { text: input.text }, context());
      await applyAi(events, input.text ?? photo);
    } catch (e) {
      push({ key: k(), kind: 'unrecognized', text: input.text ?? photo, reason: e instanceof AiUnavailable ? 'ai_unavailable' : 'empty' });
    } finally {
      setBusy(false);
    }
  };

  const applyAi = async (events: AiEvent[], original: string) => {
    if (!events.length) return push({ key: k(), kind: 'unrecognized', text: original, reason: 'empty' });
    for (const ev of events) {
      if (ev.type === 'weight') await addWeight(ev.kg, 'text');
      else if (ev.type === 'food') push({ key: k(), kind: 'food', ev });
      else if (ev.type === 'dose') {
        const site = SITES.includes(ev.site as Site) ? (ev.site as Site) : null;
        push({ key: k(), kind: 'dose', draft: { amount: ev.amount, unit: ev.unit, site, occurredAt: Date.now() - (ev.minutesAgo ?? 0) * 60000 } });
      } else if (ev.type === 'symptom') push({ key: k(), kind: 'symptom', ev });
      else if (ev.type === 'question') push({ key: k(), kind: ev.outOfScope ? 'doctorq' : 'question', text: ev.text });
      else push({ key: k(), kind: 'unrecognized', text: ev.text, reason: 'empty' });
    }
  };

  const submit = async () => {
    const s = text.trim();
    if (!s || busy) return;
    setText('');
    if (await checkTextTriage(profile, s)) return;
    const route = routeQuestion(s);
    if (route === 'doctor') return push({ key: k(), kind: 'doctorq', text: s });
    if (route === 'question') return push({ key: k(), kind: 'question', text: s });
    const { events, rest } = parseLocal(s, profile.weightUnit, lang);
    for (const e of events) {
      if (e.type === 'weight') await addWeight(e.kg, 'text');
      else if (e.type === 'food') {
        // Where food is not logged, a food note is answered like any note the phone cannot use.
        if (!features.foodAndProtein) push({ key: k(), kind: 'unrecognized', text: s, reason: 'empty' });
        else for (const it of e.items) await addFood({ text: it.label, proteinG: it.proteinG, lowG: it.lowG, highG: it.highG, foodId: it.foodId }, 'text');
      } else if (e.type === 'dose') push({ key: k(), kind: 'dose', draft: { amount: e.amount, unit: e.unit, site: e.site, occurredAt: Date.now() } });
    }
    if (rest) await handleAi({ text: rest });
  };

  const onPhoto = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (f) await handleAi({ image: f });
  };

  return (
    <div className="input-dock">
      {pending.length > 0 && (
        <div className="pending">
          {pending.map((p) => (
            <PendingCard key={p.key} p={p} profile={profile} d={d} onClose={() => drop(p.key)} onConsent={async (yes) => {
              drop(p.key);
              await updateProfile({ aiConsent: yes });
              if (yes && p.kind === 'consent') await readRemote({ text: p.text, image: p.image });
            }} />
          ))}
        </div>
      )}
      <QuickButtons profile={profile} d={d} />
      <form className="bar" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={busy ? t('input.busy') : t(profile.largeText ? 'input.placeholderLarge' : 'input.placeholder')}
          aria-label={t('input.aria')}
          enterKeyHint="send"
          disabled={busy}
        />
        {features.ai && (
          <button type="button" className="icon-btn" aria-label={t('input.camera')} onClick={() => fileRef.current?.click()} disabled={busy}>
            📷
          </button>
        )}
        <button type="submit" className="send" disabled={!text.trim() || busy}>
          {t('input.send')}
        </button>
        {features.ai && <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />}
      </form>
    </div>
  );
}

function topFoods(d: Derived, lang: Lang) {
  const count = new Map<string, number>();
  for (const f of Object.values(d.todayFoods)) if (f.foodId) count.set(f.foodId, (count.get(f.foodId) ?? 0) + 1);
  const ids = ['egg', 'soymilk', 'whey', 'milk'];
  const ranked = [...new Set([...[...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id), ...ids])];
  return ranked
    .map((id) => foodById(id))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ ...f, short: foodShortName(f, lang) }));
}

function PendingCard({ p, profile, d, onClose, onConsent }: { p: Pending; profile: Profile; d: Derived; onClose: () => void; onConsent: (yes: boolean) => void }) {
  const t = useT();
  const lang = t.lang;
  switch (p.kind) {
    case 'dose':
      return <DoseConfirm profile={profile} d={d} draft={p.draft} onClose={onClose} />;
    case 'food': {
      const save = (f: number) => {
        void addFood({ text: p.ev.label, proteinG: Math.round(p.ev.proteinG * f), lowG: p.ev.lowG * f, highG: p.ev.highG * f, kcal: p.ev.kcal }, 'text');
        onClose();
      };
      return (
        <div className={`pcard ${p.ev.confidence < 0.7 ? 'unsure' : ''}`}>
          <div className="pcard-head">
            <b>{p.ev.label}</b>
            <button className="icon-btn" onClick={onClose} aria-label={t('pending.dismiss')}>✕</button>
          </div>
          <p>
            {bold(t('pending.food.estimate', { grams: Math.round(p.ev.proteinG), low: Math.round(p.ev.lowG), high: Math.round(p.ev.highG) }))}
            {p.ev.confidence < 0.7 && <span className="warn-text">{t('pending.food.unsure')}</span>}
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => save(1)}>{t('pending.food.right')}</button>
            <button className="btn" onClick={() => save(0.7)}>{t('pending.food.less')}</button>
            <button className="btn" onClick={() => save(1.3)}>{t('pending.food.more')}</button>
          </div>
        </div>
      );
    }
    case 'symptom':
      return (
        <div className="pcard">
          <p>{bold(t('pending.symptom.ask', { symptom: symptomLabel(p.ev.kind, lang), grade: p.ev.grade >= 1 ? gradeLabel(p.ev.grade, lang) : '' }))}</p>
          <div className="row">
            <button className="btn primary" onClick={() => (void addSymptom(profile, p.ev.kind, p.ev.grade), onClose())}>{t('common.logIt')}</button>
            <button className="btn" onClick={onClose}>{t('pending.symptom.no')}</button>
          </div>
        </div>
      );
    case 'doctorq':
      return (
        <div className="pcard">
          <p>{t('pending.doctorq.body')}</p>
          <p className="muted">"{p.text}"</p>
          <div className="row">
            <button className="btn primary" onClick={() => (void addQuestion(p.text), onClose())}>{t('pending.doctorq.save')}</button>
            <button className="btn" onClick={onClose}>{t('pending.doctorq.cancel')}</button>
          </div>
        </div>
      );
    case 'question':
      return (
        <div className="pcard">
          <p>{t('pending.question.body')}</p>
          <p className="muted">"{p.text}"</p>
          <div className="row">
            {features.copingCards && <button className="btn" onClick={() => (setUi({ coping: 'nausea' }), onClose())}>{t('pending.question.cards')}</button>}
            <button className="btn primary" onClick={() => (void addQuestion(p.text), onClose())}>{t('pending.question.save')}</button>
          </div>
        </div>
      );
    case 'consent':
      return (
        <div className="pcard">
          <p>{t('pending.consent.body', { what: p.image ? t('pending.consent.thisPhoto') : `"${p.text}"` })}</p>
          <div className="row">
            <button className="btn primary" onClick={() => onConsent(true)}>{t('pending.consent.yes')}</button>
            <button className="btn" onClick={() => onConsent(false)}>{t('pending.consent.no')}</button>
          </div>
        </div>
      );
    case 'unrecognized':
      return (
        <div className="pcard">
          <p>
            {t(p.reason === 'ai_unavailable' ? 'pending.unrecognized.unavailable' : p.reason === 'ai_off' ? 'pending.unrecognized.off' : 'pending.unrecognized.empty')}
            {t('common.colon')}
            <span className="muted">"{p.text}"</span>
          </p>
          <div className="row">
            {features.foodAndProtein && <button className="btn" onClick={() => (setUi({ sheet: 'food' }), onClose())}>{t('pending.unrecognized.food')}</button>}
            <button className="btn" onClick={() => (setUi({ sheet: 'symptom' }), onClose())}>{t('pending.unrecognized.symptom')}</button>
            <button className="btn" onClick={onClose}>{t('pending.unrecognized.ignore')}</button>
          </div>
        </div>
      );
  }
}

/** 一句话记针的确认卡（PRD 2.1）：一行摘要，必须点"确认"才入库；超过最高剂量再确认一次。 */
function DoseConfirm({ profile, d, draft, onClose }: { profile: Profile; d: Derived; draft: Partial<DoseDraft>; onClose: () => void }) {
  const t = useT();
  const lang = t.lang;
  const [editing, setEditing] = useState(false);
  const [overMax, setOverMax] = useState(false);
  const reg = profile.regimen;
  if (!reg) {
    return (
      <div className="pcard">
        <p>{t('dose.setupFirst.thenLog')}</p>
        <button className="btn" onClick={onClose}>{t('common.ok')}</button>
      </div>
    );
  }
  const drug = drugById(reg.drugId);
  const name = drugShortName(drug, profile.region, lang, reg.brand);
  const amount = draft.amount ?? reg.doseAmount ?? 0;
  const unit = draft.unit ?? reg.doseUnit;
  const at = draft.occurredAt ?? Date.now();
  const site = draft.site ?? null;
  if (editing) {
    return (
      <div className="pcard">
        <div className="pcard-head">
          <b>{t('dose.edit.title')}</b>
          <button className="icon-btn" onClick={onClose} aria-label={t('pending.dismiss')}>✕</button>
        </div>
        <DoseForm profile={profile} d={d} draft={draft} onDone={onClose} />
      </div>
    );
  }
  const confirm = async () => {
    if (!overMax && doseCheckApplies(drug, amount, unit, features)) return setOverMax(true);
    await addDose(profile, { drugId: reg.drugId, amount, unit, site, occurredAt: at, source: 'text' });
    onClose();
  };
  return (
    <div className="pcard">
      <div className="pcard-head">
        <b>{t('dose.confirm.title')}</b>
        <button className="icon-btn" onClick={onClose} aria-label={t('pending.dismiss')}>✕</button>
      </div>
      <p className="dose-line">
        {name} <b>{amount} {doseUnitLabel(unit, lang)}</b> · {drug.route === 'oral' ? t('dose.byMouth') : site ? siteLabel(site, lang) : t('dose.noSite', { site: siteLabel(d.nextSite, lang) })} · {fmtWhen(at, d.tz, Date.now(), lang)}
      </p>
      {/* The largest dose comes from the catalog and only guards against a typing slip. */}
      {overMax && <p className="warn">{t('dose.overMax.card', { max: String(drug.maxMg) })}</p>}
      <div className="row">
        <button className="btn primary" onClick={() => void confirm()}>{overMax ? t('dose.confirmSure') : t('common.confirm')}</button>
        <button className="btn" onClick={() => setEditing(true)}>{t('dose.edit')}</button>
      </div>
    </div>
  );
}
