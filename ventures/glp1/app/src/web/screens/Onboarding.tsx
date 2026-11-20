import { useMemo, useState } from 'react';
import { drugById, drugLabel, searchCatalog, type DoseUnit, type Region } from '../../core/catalog';
import type { Schedule } from '../../core/schedule';
import type { CourseStatus, Profile, Safety } from '../../core/types';
import { toKg, unitLabel, type WeightUnit } from '../../core/units';
import { base, db, deviceTz } from '../db';
import { REGION_LABEL, WEEKDAY_LABEL } from '../content/labels';
import { Chips, fromLocalInput, toLocalInput } from '../components/ui';

const NO_SAFETY: Safety = { kidneyOrLiver: false, pregnancy: false, insulinOrSU: false, eatingDisorder: false, under18: false };

function guessRegion(): Region {
  const tz = deviceTz();
  if (tz === 'Asia/Shanghai' || tz === 'Asia/Chongqing' || tz === 'Asia/Urumqi') return 'CN';
  if (tz === 'Asia/Taipei') return 'TW';
  if (tz === 'Asia/Hong_Kong' || tz === 'Asia/Macau') return 'HK';
  if (tz === 'Asia/Singapore') return 'SG';
  if (tz === 'Asia/Kuala_Lumpur') return 'MY';
  if (tz.startsWith('America/')) return 'US';
  return 'OTHER';
}

export function Onboarding({ existing }: { existing: Profile | null }) {
  const [step, setStep] = useState(0);
  const [region, setRegion] = useState<Region>(existing?.region ?? guessRegion());
  const [unit, setUnit] = useState<WeightUnit>(existing?.weightUnit ?? (guessRegion() === 'US' ? 'lb' : guessRegion() === 'CN' ? 'jin' : 'kg'));
  const [q, setQ] = useState('');
  const [drugId, setDrugId] = useState<string | null>(existing?.regimen?.drugId ?? null);
  const [status, setStatus] = useState<CourseStatus>('escalating');
  const [amount, setAmount] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mg');
  const [weekday, setWeekday] = useState(new Date().getDay());
  const [time, setTime] = useState('21:00');
  const [intervalDays, setIntervalDays] = useState('7');
  const [freqMode, setFreqMode] = useState<'weekly' | 'daily' | 'interval'>('weekly');
  const [lastDose, setLastDose] = useState(toLocalInput(Date.now() - 2 * 86400000));
  const [weeksOnDose, setWeeksOnDose] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState('');
  const [safety, setSafety] = useState<Safety>(NO_SAFETY);

  const results = useMemo(() => searchCatalog(q), [q]);
  const drug = drugId ? drugById(drugId) : null;
  const pickDrug = (id: string) => {
    setDrugId(id);
    const d = drugById(id);
    setFreqMode(d.frequency === 'daily' ? 'daily' : 'weekly');
    if (d.frequency === 'daily') setTime('08:00');
  };

  const schedule = (): Schedule =>
    freqMode === 'weekly' ? { kind: 'weekly', weekday, time } : freqMode === 'daily' ? { kind: 'daily', time } : { kind: 'interval', hours: Math.max(1, Number(intervalDays) || 7) * 24 };

  const finish = async (aiConsent: boolean) => {
    const heightCm = Number(height) || null;
    const startKg = weight ? Math.round(toKg(Number(weight), unit) * 10) / 10 : null;
    const goalKg = goal && !safety.pregnancy && !safety.eatingDisorder ? Math.round(toKg(Number(goal), unit) * 10) / 10 : null;
    const p: Profile = {
      id: 'me',
      script: 'hans',
      region,
      weightUnit: unit,
      heightCm,
      startWeightKg: startKg,
      goalWeightKg: goalKg,
      birthYear: null,
      dayStartHour: 4,
      tz: deviceTz(),
      safety,
      proteinMode: 'auto',
      proteinManualG: null,
      aiConsent,
      regimen: drugId
        ? {
            drugId,
            doseAmount: Number(amount) || null,
            doseUnit,
            schedule: schedule(),
            status,
            weeksOnDoseAtStart: Number(weeksOnDose) || null,
            stoppedAt: status === 'stopped' ? fromLocalInput(lastDose) : null,
          }
        : null,
      onboardedAt: Date.now(),
      largeText: false,
    };
    await db.transaction('rw', db.profile, db.doses, db.weights, async () => {
      await db.profile.put(p);
      // 只存真实的上一次用药。"当前剂量用了几周"只在算曲线时用来补虚拟点，不写进记录（不会出现在医生报告里）。
      if (drugId && status !== 'not_started' && Number(amount) > 0 && lastDose) {
        await db.doses.add({ ...base('import', fromLocalInput(lastDose)), drugId, amount: Number(amount), unit: doseUnit, site: null });
      }
      if (startKg) await db.weights.add({ ...base('import'), kg: startKg });
    });
  };

  if (safety.under18) {
    return (
      <div className="onboarding">
        <h1>抱歉</h1>
        <p>暂不为未满 18 岁的用户提供服务。用药和饮食请听医生和家长的安排。</p>
        <button className="btn" onClick={() => setSafety({ ...safety, under18: false })}>
          返回
        </button>
      </div>
    );
  }

  const steps = [
    <div key="0">
      <h1>你好，我是你的 GLP-1 伴侣</h1>
      <p className="muted">记针、吃够蛋白、守住肌肉、停药不反弹。不用注册，90 秒设好。</p>
      <h3>你在哪里？</h3>
      <Chips options={(Object.keys(REGION_LABEL) as Region[]).map((r) => ({ value: r, label: REGION_LABEL[r] }))} value={region} onChange={setRegion} />
      <h3>体重用什么单位？</h3>
      <Chips options={(['kg', 'jin', 'lb'] as WeightUnit[]).map((u) => ({ value: u, label: unitLabel(u) }))} value={unit} onChange={setUnit} />
      <p className="fine">目前是简体中文，繁体版在做。</p>
    </div>,
    <div key="1">
      <h1>你用的是哪种药？</h1>
      <input placeholder="搜药名，中文英文都行" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list">
        {results.map((d) => (
          <button key={d.id} className={`list-item ${drugId === d.id ? 'on' : ''}`} onClick={() => pickDrug(d.id)}>
            {drugLabel(d, region)}
            <span className="muted">{d.route === 'oral' ? '口服' : '注射'} · {d.frequency === 'daily' ? '每天' : '每周'}</span>
          </button>
        ))}
      </div>
      {drug && (
        <>
          <h3>现在的状态</h3>
          <Chips
            options={[
              { value: 'escalating' as CourseStatus, label: '加量中' },
              { value: 'maintenance' as CourseStatus, label: '维持剂量' },
              { value: 'not_started' as CourseStatus, label: '还没开始' },
              { value: 'stopped' as CourseStatus, label: '已经停药' },
            ]}
            value={status}
            onChange={setStatus}
          />
          <h3>剂量</h3>
          <div className="row">
            <input inputMode="decimal" placeholder={drug.ladderMg.length ? `比如 ${drug.ladderMg[0]}` : '剂量'} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="剂量" />
            <Chips options={(['mg', 'units', 'mL'] as DoseUnit[]).map((u) => ({ value: u, label: u }))} value={doseUnit} onChange={setDoseUnit} />
          </div>
          {status !== 'stopped' && (
            <>
              <h3>多久一次</h3>
              <Chips
                options={[
                  { value: 'weekly' as const, label: '每周固定一天' },
                  { value: 'daily' as const, label: '每天' },
                  { value: 'interval' as const, label: '每隔几天' },
                ]}
                value={freqMode}
                onChange={setFreqMode}
              />
              {freqMode === 'weekly' && <Chips options={WEEKDAY_LABEL.map((l, i) => ({ value: i, label: l }))} value={weekday} onChange={setWeekday} />}
              {freqMode === 'interval' && (
                <label>
                  每隔几天
                  <input inputMode="numeric" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
                </label>
              )}
              {freqMode !== 'interval' && (
                <label>
                  一般几点
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </label>
              )}
            </>
          )}
          {status !== 'not_started' && (
            <>
              <label>
                {status === 'stopped' ? '最后一次是什么时候' : '上一次是什么时候'}
                <input type="datetime-local" value={lastDose} onChange={(e) => setLastDose(e.target.value)} />
              </label>
              {status !== 'stopped' && drug.frequency === 'weekly' && (
                <label>
                  现在这个剂量用了几周
                  <input inputMode="numeric" placeholder="比如 3" value={weeksOnDose} onChange={(e) => setWeeksOnDose(e.target.value)} />
                </label>
              )}
            </>
          )}
        </>
      )}
      <p className="fine">还没开始用药、或者只想先看看，也可以跳过。</p>
    </div>,
    <div key="2">
      <h1>身高体重</h1>
      <label>
        身高（厘米）
        <input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
      </label>
      <label>
        现在的体重（{unitLabel(unit)}）
        <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </label>
      <label>
        目标体重（{unitLabel(unit)}，选填）
        <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <p className="fine">用来算你每天的蛋白目标。</p>
    </div>,
    <div key="3">
      <h1>几个安全问题</h1>
      <p className="muted">有以下情况请勾上，我会相应调整建议。</p>
      {(
        [
          ['kidneyOrLiver', '有肾病或肝病'],
          ['pregnancy', '怀孕、备孕或哺乳中'],
          ['insulinOrSU', '在用胰岛素或磺脲类降糖药（如格列美脲）'],
          ['eatingDisorder', '有过进食障碍'],
          ['under18', '未满 18 岁'],
        ] as [keyof Safety, string][]
      ).map(([key, label]) => (
        <label key={key} className="check">
          <input type="checkbox" checked={safety[key]} onChange={(e) => setSafety({ ...safety, [key]: e.target.checked })} />
          {label}
        </label>
      ))}
      {safety.pregnancy && <p className="warn">请联系开药的医生。我会关掉减重目标。</p>}
      {safety.kidneyOrLiver && <p className="warn">蛋白目标请向医生确认，我不会自动设。</p>}
    </div>,
    <div key="4">
      <h1>关于 AI</h1>
      <p>
        你说的话或拍的照片，如果本机认不出来，会发给 AI 服务（Anthropic 的 Claude）识别。一起发过去的只有你用的药名和单位。
      </p>
      <ul>
        <li>不用于训练模型</li>
        <li>照片识别完就丢弃，不在我们的服务器保存</li>
        <li>体重、饮食明细不会发给 AI 用来回答问题</li>
      </ul>
      <p className="muted">不同意也没关系，所有记录都可以手动完成，随时可以在"我的"里改。</p>
      <p className="fine">内容仅供参考，不构成医疗建议；调整用药或训练前请咨询医生。</p>
    </div>,
  ];

  const canNext = step !== 1 || !drugId || status === 'not_started' || (Number(amount) > 0 && (status === 'stopped' || freqMode !== 'interval' || Number(intervalDays) > 0));

  return (
    <div className="onboarding">
      <div className="progress">
        {steps.map((_, i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      {steps[step]}
      <div className="row nav">
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)}>
            上一步
          </button>
        )}
        {step < steps.length - 1 ? (
          <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            {step === 1 && !drugId ? '跳过' : '下一步'}
          </button>
        ) : (
          <>
            <button className="btn" onClick={() => void finish(false)}>
              不用 AI
            </button>
            <button className="btn primary" onClick={() => void finish(true)}>
              同意，开始用
            </button>
          </>
        )}
      </div>
    </div>
  );
}
