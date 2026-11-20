import { useState } from 'react';
import { drugById, drugLabel, needsDoseConfirm, type DoseUnit } from '../../core/catalog';
import { FOODS } from '../../core/foods';
import { SITES, type Site } from '../../core/schedule';
import type { SymptomKind } from '../../core/triage';
import type { Profile } from '../../core/types';
import { fromKg, toKg, unitLabel } from '../../core/units';
import { addDose, addFood, addSymptom, addWeight, addWorkout } from '../actions';
import { COPING, copingFor } from '../content/coping';
import { GRADE_LABEL, SITE_LABEL, SYMPTOMS } from '../content/labels';
import { ROUTINES, type Routine } from '../content/workouts';
import type { Derived } from '../derive';
import { setUi, useUi } from '../store';
import { Chips, fromLocalInput, Sheet, toLocalInput } from './ui';

const close = () => setUi({ sheet: null });

export function Sheets({ profile, d }: { profile: Profile; d: Derived }) {
  const { sheet, coping } = useUi();
  return (
    <>
      {sheet === 'dose' && <DoseSheet profile={profile} d={d} />}
      {sheet === 'weight' && <WeightSheet profile={profile} d={d} />}
      {sheet === 'symptom' && <SymptomSheet profile={profile} />}
      {sheet === 'food' && <FoodSheet />}
      {sheet === 'workout' && <WorkoutSheet />}
      {coping && <CopingSheet id={coping} />}
    </>
  );
}

export interface DoseDraft {
  amount: number | null;
  unit: DoseUnit;
  site: Site | null;
  occurredAt: number;
}

/** 记一针 / 记一次服药。用药记录必须点"确认"才入库；超过最高剂量再确认一次。 */
export function DoseForm({ profile, d, draft, onDone }: { profile: Profile; d: Derived; draft?: Partial<DoseDraft>; onDone: () => void }) {
  const reg = profile.regimen!;
  const drug = drugById(reg.drugId);
  const oral = drug.route === 'oral';
  const [amount, setAmount] = useState<string>(String(draft?.amount ?? d.lastDose?.amount ?? reg.doseAmount ?? ''));
  const [unit, setUnit] = useState<DoseUnit>(draft?.unit ?? d.lastDose?.unit ?? reg.doseUnit);
  const [site, setSite] = useState<Site | null>(oral ? null : (draft?.site ?? d.nextSite));
  const [when, setWhen] = useState(toLocalInput(draft?.occurredAt ?? Date.now()));
  const [overMax, setOverMax] = useState(false);
  const n = Number(amount);
  const valid = amount !== '' && n > 0 && n < 1000;

  const save = async () => {
    if (!valid) return;
    if (!overMax && needsDoseConfirm(drug, n, unit)) {
      setOverMax(true);
      return;
    }
    await addDose(profile, { drugId: reg.drugId, amount: n, unit, site, occurredAt: fromLocalInput(when), source: draft ? 'text' : 'manual' });
    onDone();
  };

  return (
    <div className="form">
      <p className="muted">{drugLabel(drug, profile.region)}</p>
      <label>
        剂量
        <div className="row">
          <input inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setOverMax(false))} aria-label="剂量" />
          <Chips
            options={(['mg', 'units', 'mL', 'clicks'] as DoseUnit[]).map((u) => ({ value: u, label: u === 'clicks' ? '格' : u }))}
            value={unit}
            onChange={(u) => (setUnit(u), setOverMax(false))}
          />
        </div>
      </label>
      {unit !== 'mg' && <p className="fine">只记录你填的数，不做单位换算。药物水平曲线只用 mg 的记录来算。</p>}
      {!oral && (
        <label>
          部位 <span className="muted">（建议：{SITE_LABEL[d.nextSite]}）</span>
          <Chips options={SITES.map((s) => ({ value: s, label: SITE_LABEL[s] }))} value={site} onChange={setSite} />
        </label>
      )}
      <label>
        时间
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      {overMax && (
        <p className="warn">
          {n} {unit} 超过了这个药常见的最高剂量（{drug.maxMg} mg）。是不是多打了一位数？确认无误再点一次"确认"。
        </p>
      )}
      <button className="btn primary block" disabled={!valid} onClick={() => void save()}>
        {overMax ? '确认无误，记下' : '确认'}
      </button>
      {drug.fastingMin && <p className="fine">吃完药后 {drug.fastingMin} 分钟内先别吃东西、别喝水（只用少量水送服）。</p>}
    </div>
  );
}

function DoseSheet({ profile, d }: { profile: Profile; d: Derived }) {
  const oral = profile.regimen ? drugById(profile.regimen.drugId).route === 'oral' : false;
  if (!profile.regimen) {
    return (
      <Sheet open title="记一针" onClose={close}>
        <p>先在"我的"里设置你用的药。</p>
      </Sheet>
    );
  }
  return (
    <Sheet open title={oral ? '记一次服药' : '记一针'} onClose={close}>
      <DoseForm profile={profile} d={d} onDone={close} />
    </Sheet>
  );
}

function WeightSheet({ profile, d }: { profile: Profile; d: Derived }) {
  const u = profile.weightUnit;
  const [v, setV] = useState(d.latestWeightKg ? String(Math.round(fromKg(d.latestWeightKg, u) * 10) / 10) : '');
  const kg = toKg(Number(v), u);
  const valid = v !== '' && kg >= 30 && kg <= 300;
  return (
    <Sheet open title="称体重" onClose={close}>
      <div className="form">
        <label>
          体重（{unitLabel(u)}）
          <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus aria-label="体重" />
        </label>
        <p className="fine">建议早上起床、上完厕所、吃东西之前称，用同一台秤。看 7 天平均，不看单次。</p>
        <button className="btn primary block" disabled={!valid} onClick={() => void addWeight(kg, 'manual').then(close)}>
          记下
        </button>
      </div>
    </Sheet>
  );
}

function SymptomSheet({ profile }: { profile: Profile }) {
  const [kind, setKind] = useState<SymptomKind | null>(null);
  return (
    <Sheet open title="哪里不舒服？" onClose={close}>
      {!kind ? (
        <div className="grid3">
          {SYMPTOMS.map((s) => (
            <button key={s.kind} className="tile" onClick={() => setKind(s.kind)}>
              {s.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="form">
          <p>
            <b>{SYMPTOMS.find((s) => s.kind === kind)!.label}</b>，有多严重？
          </p>
          <div className="row">
            {[1, 2, 3].map((g) => (
              <button
                key={g}
                className={`btn ${g === 3 ? 'warn-btn' : ''}`}
                onClick={() => {
                  close();
                  void addSymptom(profile, kind, g);
                }}
              >
                {GRADE_LABEL[g]}
              </button>
            ))}
          </div>
          <p className="fine">"重"是指明显影响吃饭、喝水或日常活动。</p>
        </div>
      )}
    </Sheet>
  );
}

function FoodSheet() {
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('');
  const g = Number(grams);
  return (
    <Sheet open title="记吃的" onClose={close}>
      <div className="form">
        <p className="muted">点一下记一份</p>
        <div className="grid2">
          {FOODS.map((f) => (
            <button key={f.id} className="tile left" onClick={() => void addFood({ text: f.name, proteinG: f.proteinG, lowG: f.proteinG - f.spreadG, highG: f.proteinG + f.spreadG, foodId: f.id }, 'quick')}>
              <span>{f.name}</span>
              <span className="muted">
                {f.proteinG} 克/{f.unit}
              </span>
            </button>
          ))}
        </div>
        <p className="muted">或者自己填</p>
        <div className="row">
          <input placeholder="吃了什么" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="蛋白克数" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} style={{ maxWidth: 110 }} />
        </div>
        <button
          className="btn primary block"
          disabled={!name.trim() || !(g >= 0 && g < 300) || grams === ''}
          onClick={() => void addFood({ text: name.trim(), proteinG: g }, 'manual').then(close)}
        >
          记下
        </button>
        <p className="fine">包装食品看营养成分表最准：每 100 克的蛋白 × 吃了多少。</p>
      </div>
    </Sheet>
  );
}

function WorkoutSheet() {
  const [routine, setRoutine] = useState<Routine>('bodyweight');
  const [variant, setVariant] = useState<'standard' | 'light'>('light');
  const r = ROUTINES[routine];
  return (
    <Sheet open title="练一次" onClose={close}>
      <div className="form">
        <Chips options={(Object.keys(ROUTINES) as Routine[]).map((k) => ({ value: k, label: ROUTINES[k].title }))} value={routine} onChange={setRoutine} />
        <Chips
          options={[
            { value: 'light' as const, label: '轻量版 10–15 分钟' },
            { value: 'standard' as const, label: '标准版 20–25 分钟' },
          ]}
          value={variant}
          onChange={setVariant}
        />
        <ol className="exercises">
          {r.exercises.map((e) => (
            <li key={e.name}>
              <b>{e.name}</b> <span className="muted">{variant === 'light' ? e.light : e.standard}</span>
              <div className="fine">{e.how}</div>
            </li>
          ))}
        </ol>
        <p className="fine">组间休息 60–90 秒。哪里疼就停下；不舒服的日子做轻量版或者改天，不算没完成。</p>
        <button className="btn primary block" onClick={() => void addWorkout(routine, variant).then(close)}>
          练完了
        </button>
      </div>
    </Sheet>
  );
}

function CopingSheet({ id }: { id: string }) {
  const c = COPING.find((x) => x.id === id) ?? copingFor(id as SymptomKind);
  if (!c) return null;
  return (
    <Sheet open title={c.title} onClose={() => setUi({ coping: null })}>
      <CopingBody id={c.id} />
    </Sheet>
  );
}

export function CopingBody({ id }: { id: string }) {
  const c = COPING.find((x) => x.id === id)!;
  return (
    <div className="coping">
      <h3>可以先试试</h3>
      <ul>
        {c.tryFirst.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h3>少做</h3>
      <ul>
        {c.avoid.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h3>这些情况要找医生</h3>
      <ul className="see-doctor">
        {c.seeDoctor.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="fine">来源：{c.sources.join('；')}。内容待医生审核，仅供参考。</p>
    </div>
  );
}
