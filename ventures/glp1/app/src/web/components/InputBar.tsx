import { useRef, useState } from 'react';
import { drugById, drugLabel } from '../../core/catalog';
import { foodById } from '../../core/foods';
import { parseLocal } from '../../core/localParse';
import { SITES, type Site } from '../../core/schedule';
import type { Profile } from '../../core/types';
import { addFood, addQuestion, addSymptom, addWeight, checkTextTriage, updateProfile } from '../actions';
import { AiUnavailable, compressImage, parseRemote, type AiEvent } from '../api';
import { symptomLabel } from '../content/labels';
import type { Derived } from '../derive';
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

/** 涉及加量、减量、停药、换药的问题：不回答，转成"想问医生的问题"。 */
const DOSE_Q = /((加量|加到|加大|减量|減量|减到|減到|停药|停藥|换药|換藥|剂量|劑量|几毫克|幾毫克).{0,12}(吗|嗎|么|麼|呢|\?|？))|((能不能|可不可以|可以不可以|能否).{0,8}(加|减|減|停|换|換))/;
const QUESTION = /([?？]|吗|嗎|么|麼|呢)\s*$|^(怎么|怎麼|为什么|為什麼|要不要|能不能|可不可以|how|what|why|can i|should i)/i;

let seq = 0;
const k = () => `p${++seq}`;

export function InputBar({ profile, d }: { profile: Profile; d: Derived }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const drop = (key: string) => setPending((ps) => ps.filter((p) => p.key !== key));
  const push = (...ps: Pending[]) => setPending((cur) => [...cur, ...ps]);
  const reg = profile.regimen;

  const context = () => ({
    drug: reg ? drugLabel(drugById(reg.drugId), profile.region) : null,
    doseUnit: reg?.doseUnit ?? 'mg',
    weightUnit: profile.weightUnit,
    localTime: new Date().toString(),
  });

  const handleAi = async (input: { text?: string; image?: File }) => {
    if (profile.aiConsent === null) return push({ key: k(), kind: 'consent', text: input.text, image: input.image });
    if (profile.aiConsent === false) return push({ key: k(), kind: 'unrecognized', text: input.text ?? '照片', reason: 'ai_off' });
    setBusy(true);
    try {
      const events = await parseRemote(input.image ? { imageJpegBase64: await compressImage(input.image) } : { text: input.text }, context());
      await applyAi(events, input.text ?? '照片');
    } catch (e) {
      push({ key: k(), kind: 'unrecognized', text: input.text ?? '照片', reason: e instanceof AiUnavailable ? 'ai_unavailable' : 'empty' });
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
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    if (await checkTextTriage(profile, t)) return;
    if (DOSE_Q.test(t)) return push({ key: k(), kind: 'doctorq', text: t });
    if (QUESTION.test(t)) return push({ key: k(), kind: 'question', text: t });
    const { events, rest } = parseLocal(t, profile.weightUnit);
    for (const e of events) {
      if (e.type === 'weight') await addWeight(e.kg, 'text');
      else if (e.type === 'food') for (const it of e.items) await addFood({ text: it.label, proteinG: it.proteinG, lowG: it.lowG, highG: it.highG, foodId: it.foodId }, 'text');
      else if (e.type === 'dose') push({ key: k(), kind: 'dose', draft: { amount: e.amount, unit: e.unit, site: e.site, occurredAt: Date.now() } });
    }
    if (rest) await handleAi({ text: rest });
  };

  const onPhoto = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (f) await handleAi({ image: f });
  };

  const quickFoods = topFoods(d).slice(0, 3);
  const oral = reg ? drugById(reg.drugId).route === 'oral' : false;

  return (
    <div className="input-dock">
      {pending.length > 0 && (
        <div className="pending">
          {pending.map((p) => (
            <PendingCard key={p.key} p={p} profile={profile} d={d} onClose={() => drop(p.key)} onConsent={async (yes) => {
              drop(p.key);
              await updateProfile({ aiConsent: yes });
              if (yes && p.kind === 'consent') {
                const fresh = { ...profile, aiConsent: true };
                setBusy(true);
                try {
                  const events = await parseRemote(p.image ? { imageJpegBase64: await compressImage(p.image) } : { text: p.text }, { ...context(), drug: fresh.regimen ? drugLabel(drugById(fresh.regimen.drugId), fresh.region) : null });
                  await applyAi(events, p.text ?? '照片');
                } catch (e) {
                  push({ key: k(), kind: 'unrecognized', text: p.text ?? '照片', reason: e instanceof AiUnavailable ? 'ai_unavailable' : 'empty' });
                } finally {
                  setBusy(false);
                }
              }
            }} />
          ))}
        </div>
      )}
      <div className="quick">
        <button className="qbtn" onClick={() => setUi({ sheet: 'dose' })}>{oral ? '记吃药' : '记一针'}</button>
        <button className="qbtn" onClick={() => setUi({ sheet: 'weight' })}>体重</button>
        <button className="qbtn" onClick={() => setUi({ sheet: 'symptom' })}>不舒服</button>
        {quickFoods.map((f) => (
          <button key={f.id} className="qbtn food" onClick={() => void addFood({ text: f.name, proteinG: f.proteinG, lowG: f.proteinG - f.spreadG, highG: f.proteinG + f.spreadG, foodId: f.id }, 'quick')}>
            +{f.short} {f.proteinG}
          </button>
        ))}
        <button className="qbtn" onClick={() => setUi({ sheet: 'food' })}>+吃的</button>
      </div>
      <form className="bar" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={busy ? '识别中…' : '说一句，比如"刚打了 2.5 左腹"'}
          aria-label="说一句"
          enterKeyHint="send"
          disabled={busy}
        />
        <button type="button" className="icon-btn" aria-label="拍照" onClick={() => fileRef.current?.click()} disabled={busy}>
          📷
        </button>
        <button type="submit" className="send" disabled={!text.trim() || busy}>
          记
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
      </form>
    </div>
  );
}

function topFoods(d: Derived) {
  const count = new Map<string, number>();
  for (const f of Object.values(d.todayFoods)) if (f.foodId) count.set(f.foodId, (count.get(f.foodId) ?? 0) + 1);
  const ids = ['egg', 'soymilk', 'whey', 'milk'];
  const ranked = [...new Set([...[...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id), ...ids])];
  return ranked
    .map((id) => foodById(id))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ ...f, short: f.name.replace(/（.*）/, '').replace('无糖', '') }));
}

function PendingCard({ p, profile, d, onClose, onConsent }: { p: Pending; profile: Profile; d: Derived; onClose: () => void; onConsent: (yes: boolean) => void }) {
  switch (p.kind) {
    case 'dose':
      return (
        <div className="pcard">
          <div className="pcard-head">
            <b>确认这条用药记录</b>
            <button className="icon-btn" onClick={onClose} aria-label="不记">✕</button>
          </div>
          {profile.regimen ? <DoseForm profile={profile} d={d} draft={p.draft} onDone={onClose} /> : <p>先在"我的"里设置你用的药。</p>}
        </div>
      );
    case 'food': {
      const save = (f: number) => {
        void addFood({ text: p.ev.label, proteinG: Math.round(p.ev.proteinG * f), lowG: p.ev.lowG * f, highG: p.ev.highG * f, kcal: p.ev.kcal }, 'text');
        onClose();
      };
      return (
        <div className={`pcard ${p.ev.confidence < 0.7 ? 'unsure' : ''}`}>
          <div className="pcard-head">
            <b>{p.ev.label}</b>
            <button className="icon-btn" onClick={onClose} aria-label="不记">✕</button>
          </div>
          <p>
            约 <b>{Math.round(p.ev.proteinG)}</b> 克蛋白（{Math.round(p.ev.lowG)}–{Math.round(p.ev.highG)}）
            {p.ev.confidence < 0.7 && <span className="warn-text"> 不太确定，调一下份量</span>}
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => save(1)}>对</button>
            <button className="btn" onClick={() => save(0.7)}>少一点</button>
            <button className="btn" onClick={() => save(1.3)}>多一点</button>
          </div>
        </div>
      );
    }
    case 'symptom':
      return (
        <div className="pcard">
          <p>
            记下：<b>{symptomLabel(p.ev.kind)}</b>（{['', '轻', '中', '重'][p.ev.grade] ?? ''}）？
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => (void addSymptom(profile, p.ev.kind, p.ev.grade), onClose())}>记下</button>
            <button className="btn" onClick={onClose}>不用</button>
          </div>
        </div>
      );
    case 'doctorq':
      return (
        <div className="pcard">
          <p>这个问题需要医生根据你的情况判断，我不回答剂量相关的问题。</p>
          <p className="muted">"{p.text}"</p>
          <div className="row">
            <button className="btn primary" onClick={() => (void addQuestion(p.text), onClose())}>存进"想问医生的问题"</button>
            <button className="btn" onClick={onClose}>算了</button>
          </div>
        </div>
      );
    case 'question':
      return (
        <div className="pcard">
          <p>问答功能还在做。可以先看看应对卡，或者把问题存起来，复诊时问医生。</p>
          <p className="muted">"{p.text}"</p>
          <div className="row">
            <button className="btn" onClick={() => (setUi({ coping: 'nausea' }), onClose())}>看应对卡</button>
            <button className="btn primary" onClick={() => (void addQuestion(p.text), onClose())}>存起来</button>
          </div>
        </div>
      );
    case 'consent':
      return (
        <div className="pcard">
          <p>
            这部分要用 AI 识别。会把{p.image ? '这张照片' : `"${p.text}"`}和你用的药名、单位发给 AI 服务（Anthropic 的 Claude）识别，不用于训练模型，照片不在我们的服务器保存。
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => onConsent(true)}>同意并识别</button>
            <button className="btn" onClick={() => onConsent(false)}>不用 AI，我手动记</button>
          </div>
        </div>
      );
    case 'unrecognized':
      return (
        <div className="pcard">
          <p>
            {p.reason === 'ai_unavailable' ? 'AI 识别暂时不可用' : p.reason === 'ai_off' ? '你关闭了 AI 识别' : '没认出来'}：<span className="muted">"{p.text}"</span>
          </p>
          <div className="row">
            <button className="btn" onClick={() => (setUi({ sheet: 'food' }), onClose())}>手动记吃的</button>
            <button className="btn" onClick={() => (setUi({ sheet: 'symptom' }), onClose())}>记不舒服</button>
            <button className="btn" onClick={onClose}>忽略</button>
          </div>
        </div>
      );
  }
}
