import { drugById } from '../../core/catalog';
import type { Profile } from '../../core/types';
import { fmtWeight } from '../../core/units';
import { deleteRecord } from '../actions';
import { adviceText } from '../content/advice';
import { DISCLAIMER, SITE_LABEL, STATUS_LABEL, symptomLabel, GRADE_LABEL } from '../content/labels';
import { ROUTINES } from '../content/workouts';
import { Curve } from '../components/Curve';
import { Card, fmtCountdown, fmtDay, fmtTime, fmtWhen } from '../components/ui';
import type { Derived, TodayItem } from '../derive';
import { setUi } from '../store';

export function Today({ profile, d, now, onOpenTrends, onOpenMe }: { profile: Profile; d: Derived; now: number; onOpenTrends: () => void; onOpenMe: () => void }) {
  const reg = profile.regimen;
  const oral = d.drug?.route === 'oral';
  const advice = adviceText(d.advice, d.protein, { oral });
  const statusBits: string[] = [fmtDay(now, d.tz)];
  if (reg) {
    if (reg.status === 'stopped') statusBits.push('停药维持期');
    else if (d.daysSinceDose !== null && !oral) statusBits.push(d.daysSinceDose === 0 ? '今天打了针' : `打针后第 ${d.daysSinceDose} 天`);
    if (d.escalation?.escalationActive && (reg.status === 'escalating' || reg.status === 'maintenance')) statusBits.push('加量期');
  }

  return (
    <div className="screen">
      <header className="status">
        <div>{statusBits.join(' · ')}</div>
        {reg && d.nextDue !== null && (
          <div className={`due ${d.dueStatus}`}>
            {oral ? '下次吃药' : '下一针'}：{fmtWhen(d.nextDue, d.tz, now)}（{fmtCountdown(d.nextDue, now)}）
          </div>
        )}
        {reg && d.nextDue === null && <div className="due">{STATUS_LABEL[reg.status]}</div>}
        {d.fastingUntil && <div className="due">空腹中：还有 {Math.ceil((d.fastingUntil - now) / 60000)} 分钟再吃东西</div>}
        {!reg && <div className="due">还没设置用药。<button className="link" onClick={onOpenMe}>去"我的"里设置</button></div>}
      </header>

      <Card className={`advice ${advice.tone}`}>
        <h2>{advice.title}</h2>
        <p>{advice.body}</p>
        <div className="row">
          {d.advice.kind === 'normal' && d.advice.train && (
            <button className="btn primary" onClick={() => setUi({ sheet: 'workout' })}>
              开始练
            </button>
          )}
          {d.advice.kind === 'triage' && (
            <button className="btn danger" onClick={() => d.advice.kind === 'triage' && setUi({ triage: { hits: [d.advice.hit], rowId: d.openTriage?.rowId ?? null } })}>
              再看一次提醒
            </button>
          )}
          {d.advice.kind === 'dose_day' && (
            <button className="btn primary" onClick={() => setUi({ sheet: 'dose' })}>
              {oral ? '记吃药' : '记一针'}
            </button>
          )}
          <button className="btn" onClick={() => setUi({ sheet: 'symptom' })}>
            我不舒服
          </button>
        </div>
        {d.fastLoss && <p className="warn">最近两周每周都掉了 1.5% 以上，减得偏快。注意吃够蛋白，可以和医生聊聊。</p>}
      </Card>

      <ProteinCard d={d} />

      {d.curve.length > 0 && (
        <Card className="clickable">
          <button className="card-btn" onClick={onOpenTrends} aria-label="查看药物水平曲线">
            <div className="row between">
              <h3>药物水平（估算）</h3>
              <span className="big">{d.curveNow ?? '–'}</span>
            </div>
            <Curve points={d.curve} nowMs={now} doseTimes={[]} height={70} compact />
            <p className="fine">按公开的人群平均数据估算，不是测量值，不能用来调整剂量。</p>
          </button>
        </Card>
      )}
      {reg && d.drug && !d.drug.pk && <p className="fine pad">这个药暂不画曲线（参数还没核实，或者是每天用的药）。</p>}

      <Card>
        <h3>今天的记录</h3>
        {d.todayItems.length === 0 ? <p className="muted">还没有记录。在下面说一句，或者点按钮。</p> : <ul className="log">{d.todayItems.map((it) => <LogRow key={it.row.id} it={it} profile={profile} tz={d.tz} />)}</ul>}
      </Card>
      <p className="fine pad">{DISCLAIMER}</p>
    </div>
  );
}

function ProteinCard({ d }: { d: Derived }) {
  const p = d.protein;
  if (p.kind === 'off') return null;
  if (p.kind === 'ask_doctor') {
    return (
      <Card>
        <h3>蛋白</h3>
        <p>
          今天 <b>{d.proteinToday}</b> 克。你勾选了肾病或肝病，蛋白目标请向医生确认，可以在"我的"里手动填。
        </p>
      </Card>
    );
  }
  const floor = p.floorG;
  const pct = Math.min(100, Math.round((d.proteinToday / floor) * 100));
  const gap = Math.max(0, floor - d.proteinToday);
  return (
    <Card>
      <div className="row between">
        <h3>蛋白</h3>
        <span>
          <b className="big">{d.proteinToday}</b> / {floor} 克
        </span>
      </div>
      <div className="bar-track" aria-label={`完成 ${pct}%`}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted">
        {gap > 0 ? `离最低线还差 ${gap} 克。` : '今天的最低线达到了。'}
        {p.kind === 'auto' && ` 理想 ${p.idealLowG}–${p.idealHighG} 克。`}
      </p>
    </Card>
  );
}

function LogRow({ it, profile, tz }: { it: TodayItem; profile: Profile; tz: string }) {
  let label = '';
  let value = '';
  let table: 'doses' | 'foods' | 'weights' | 'symptoms' | 'workouts' = 'foods';
  switch (it.kind) {
    case 'dose': {
      const drug = drugById(it.row.drugId);
      label = drug.route === 'oral' ? '吃药' : `打针${it.row.site ? ' · ' + SITE_LABEL[it.row.site] : ''}`;
      value = `${it.row.amount} ${it.row.unit === 'clicks' ? '格' : it.row.unit}`;
      table = 'doses';
      break;
    }
    case 'food':
      label = it.row.text;
      value = it.row.lowG !== undefined && it.row.highG !== undefined && it.row.highG - it.row.lowG >= 4 ? `${Math.round(it.row.proteinG)} 克 ±${Math.round((it.row.highG - it.row.lowG) / 2)}` : `${Math.round(it.row.proteinG)} 克`;
      table = 'foods';
      break;
    case 'weight':
      label = '体重';
      value = fmtWeight(it.row.kg, profile.weightUnit);
      table = 'weights';
      break;
    case 'symptom':
      label = it.row.kind === 'other' ? (it.row.note ?? '不舒服') : symptomLabel(it.row.kind);
      value = it.row.triageId ? '⚠ 已提醒' : GRADE_LABEL[it.row.grade] ?? '';
      table = 'symptoms';
      break;
    case 'workout':
      label = `训练 · ${ROUTINES[it.row.routine].title}`;
      value = it.row.variant === 'light' ? '轻量版' : '标准版';
      table = 'workouts';
      break;
  }
  return (
    <li>
      <span className="time">{fmtTime(it.row.occurredAt, tz)}</span>
      <span className="what">{label}</span>
      <span className="val">{value}</span>
      <button className="icon-btn small" aria-label={`删除 ${label}`} onClick={() => void deleteRecord(table, it.row.id)}>
        ✕
      </button>
    </li>
  );
}
