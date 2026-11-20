import { useState } from 'react';
import type { DoseEvent, Profile } from '../../core/types';
import { dayKey, shiftDayKey } from '../../core/tz';
import { fmtWeight, fromKg, unitLabel } from '../../core/units';
import { Curve } from '../components/Curve';
import { Card } from '../components/ui';
import type { Derived, Records } from '../derive';

export function Trends({ profile, d, rec, now }: { profile: Profile; d: Derived; rec: Records; now: number }) {
  const [method, setMethod] = useState(false);
  const doses = rec.doses.filter((x) => x.deletedAt === null && (!profile.regimen || x.drugId === profile.regimen.drugId));
  return (
    <div className="screen">
      <h1 className="pad">趋势</h1>
      {d.curve.length > 0 ? (
        <Card>
          <div className="row between">
            <h3>药物水平（估算）</h3>
            <span className="big">{d.curveNow ?? '–'}</span>
          </div>
          <Curve points={d.curve} nowMs={now} doseTimes={doses.map((x) => x.occurredAt)} height={150} />
          <p className="fine">过去 14 天和未来 7 天。实线是已经发生的，虚线假设你按计划继续用。100 = 这个剂量长期使用后的最高点。</p>
          <button className="link" onClick={() => setMethod(!method)}>
            这是怎么算的
          </button>
          {method && (
            <div className="fine method">
              用一级吸收、一级消除模型，按公开的人群平均数据估算：司美格鲁肽半衰期约 168 小时、达峰约 48 小时；替尔泊肽半衰期约 120 小时、达峰约 24 小时（待对照说明书核实）。只用你以 mg 记录的剂量计算。每个人吸收和代谢的速度差别很大，这条线只帮你理解"药效大概在什么水平"，不是血药浓度的测量值，不能用来调整剂量。
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <h3>药物水平</h3>
          <p className="muted">以 mg 记录司美格鲁肽或替尔泊肽针剂后，这里会显示估算曲线。</p>
        </Card>
      )}
      <WeightCard profile={profile} d={d} />
      <SymptomCard d={d} rec={rec} doses={doses} profile={profile} />
      <ProteinWeek d={d} />
      <Card>
        <h3>训练</h3>
        <p>
          最近 7 天练了 <b>{d.workoutDays.filter((k) => k > shiftDayKey(d.today, -7)).length}</b> 次（建议每周 2–3 次）。
        </p>
      </Card>
    </div>
  );
}

function WeightCard({ profile, d }: { profile: Profile; d: Derived }) {
  const u = profile.weightUnit;
  const avgs = d.weightAvgs.slice(-60);
  if (!avgs.length) {
    return (
      <Card>
        <h3>体重</h3>
        <p className="muted">一周内称满 3 次，就能看到 7 天平均趋势。</p>
      </Card>
    );
  }
  const vals = avgs.map((a) => fromKg(a.avgKg, u));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const w = 340;
  const h = 100;
  const x = (i: number) => (avgs.length === 1 ? w / 2 : (i / (avgs.length - 1)) * w);
  const y = (v: number) => (max === min ? h / 2 : 8 + ((max - v) / (max - min)) * (h - 16));
  const nadir = Math.min(...avgs.map((a) => a.avgKg));
  return (
    <Card>
      <h3>体重（7 天平均）</h3>
      <svg className="curve" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="体重趋势">
        <path className="curve-past" d={vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')} />
      </svg>
      <p>
        现在 <b>{fmtWeight(avgs[avgs.length - 1].avgKg, u)}</b> · 最低 {fmtWeight(nadir, u)}
        {profile.startWeightKg && ` · 起点 ${fmtWeight(profile.startWeightKg, u)}`}
      </p>
      {d.regain && (
        <p className={d.regain.band === 'green' ? 'muted' : 'warn'}>
          {d.regain.band === 'green' && `比最低点回升 ${d.regain.regainPct.toFixed(1)}%，正常波动。`}
          {d.regain.band === 'yellow' && `比最低点回升 ${d.regain.regainPct.toFixed(1)}%。回看一下这两周的饮食和运动。`}
          {d.regain.band === 'orange' && `比最低点回升 ${d.regain.regainPct.toFixed(1)}%，建议和医生聊聊。`}
        </p>
      )}
      <p className="fine">单位：{unitLabel(u)}。单次称重会因为喝水、吃饭上下波动 1–2 斤，看平均就好。</p>
    </Card>
  );
}

function SymptomCard({ d, rec, doses, profile }: { d: Derived; rec: Records; doses: DoseEvent[]; profile: Profile }) {
  if (!doses.length || d.drug?.frequency !== 'weekly') return null;
  const sorted = [...doses].sort((a, b) => a.occurredAt - b.occurredAt);
  const counts = new Array(7).fill(0);
  for (const s of rec.symptoms) {
    if (s.deletedAt !== null || s.kind === 'other') continue;
    const prev = [...sorted].reverse().find((x) => x.occurredAt <= s.occurredAt);
    if (!prev) continue;
    const off = Math.round((Date.parse(dayKey(s.occurredAt, d.tz, profile.dayStartHour)) - Date.parse(dayKey(prev.occurredAt, d.tz, profile.dayStartHour))) / 86400000);
    if (off >= 0 && off < 7) counts[off] += s.grade;
  }
  const max = Math.max(1, ...counts);
  return (
    <Card>
      <h3>不舒服出现在打针后第几天</h3>
      <div className="bars">
        {counts.map((c, i) => (
          <div key={i} className={`barcol ${d.highDays?.highDays.includes(i) ? 'hi' : ''}`}>
            <div className="barv" style={{ height: `${(c / max) * 60}px` }} />
            <span>{i === 0 ? '当天' : `+${i}`}</span>
          </div>
        ))}
      </div>
      <p className="fine">{d.highDays?.enoughData ? '橙色是你的"高症状日"，今天页会据此安排轻量日。' : `记满 3 个周期后，会找出你自己的高症状日（现在 ${d.highDays?.cycles ?? 0} 个）。`}</p>
    </Card>
  );
}

function ProteinWeek({ d }: { d: Derived }) {
  const floor = d.protein.kind === 'auto' || d.protein.kind === 'manual' ? d.protein.floorG : null;
  const days = Array.from({ length: 7 }, (_, i) => shiftDayKey(d.today, i - 6));
  const vals = days.map((k) => d.proteinByDay[k]);
  const max = Math.max(floor ?? 0, ...vals.map((v) => v ?? 0), 1);
  const hit = floor ? vals.filter((v) => v !== undefined && v >= floor).length : 0;
  return (
    <Card>
      <h3>最近 7 天蛋白</h3>
      <div className="bars">
        {days.map((k, i) => (
          <div key={k} className={`barcol ${floor && vals[i] !== undefined && vals[i]! >= floor ? 'ok' : ''}`}>
            <div className="barv" style={{ height: `${((vals[i] ?? 0) / max) * 60}px` }} />
            <span>{k.slice(8)}</span>
          </div>
        ))}
      </div>
      {floor && <p className="fine">达到最低线（{floor} 克）的天数：{hit} / 7。没记录的日子不算。</p>}
    </Card>
  );
}
