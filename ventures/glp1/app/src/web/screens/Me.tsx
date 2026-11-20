import { useRef, useState } from 'react';
import { drugById, drugLabel } from '../../core/catalog';
import { reminderIcs } from '../../core/ics';
import { zonedParts } from '../../core/tz';
import type { CourseStatus, Profile } from '../../core/types';
import { unitLabel, type WeightUnit } from '../../core/units';
import { updateProfile } from '../actions';
import { Card, Chips } from '../components/ui';
import { DISCLAIMER, STATUS_LABEL, WEEKDAY_LABEL } from '../content/labels';
import { db } from '../db';
import type { Derived } from '../derive';
import { buildBackup, buildCsv, download, importBackup } from '../exportData';
import { toast } from '../store';

export function Me({ profile, d, onRedoSetup }: { profile: Profile; d: Derived; onRedoSetup: () => void }) {
  const reg = profile.regimen;
  const drug = reg ? drugById(reg.drugId) : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState(String(profile.proteinManualG ?? ''));
  const [confirmWipe, setConfirmWipe] = useState(0);

  const setStatus = async (status: CourseStatus) => {
    if (!reg) return;
    await updateProfile({ regimen: { ...reg, status, stoppedAt: status === 'stopped' ? Date.now() : reg.stoppedAt ?? null } });
    toast(`已切换为：${STATUS_LABEL[status]}`);
  };

  const addToCalendar = () => {
    if (!reg || d.nextDue === null) return;
    const p = zonedParts(d.nextDue, d.tz);
    const title = drug?.route === 'oral' ? '该记吃药了' : '该记一针了';
    download('提醒.ics', reminderIcs(reg.schedule, { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute }, `${crypto.randomUUID()}@glp1-companion`, title), 'text/calendar');
    toast('已生成日历文件，打开它加到手机日历里');
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="screen">
      <h1 className="pad">我的</h1>

      <Card>
        <h3>用药</h3>
        {reg && drug ? (
          <>
            <p>
              {drugLabel(drug, profile.region)}
              {reg.doseAmount ? ` · ${reg.doseAmount} ${reg.doseUnit}` : ''}
            </p>
            <p className="muted">
              {reg.schedule.kind === 'weekly' && `每${WEEKDAY_LABEL[reg.schedule.weekday]} ${reg.schedule.time}`}
              {reg.schedule.kind === 'daily' && `每天 ${reg.schedule.time}`}
              {reg.schedule.kind === 'interval' && `每 ${reg.schedule.hours / 24} 天`}
            </p>
            <Chips
              options={(['escalating', 'maintenance', 'paused', 'stopped'] as CourseStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              value={reg.status}
              onChange={(s) => void setStatus(s)}
            />
            {reg.status === 'stopped' && <p className="fine">停药后，今天页会切到维持期：继续蛋白和训练，看体重回升。重新开始用药时切回"加量中"，历史都在。</p>}
          </>
        ) : (
          <p className="muted">还没设置。</p>
        )}
        <button className="btn" onClick={onRedoSetup}>
          {reg ? '换药或重新设置' : '设置用药'}
        </button>
      </Card>

      <Card>
        <h3>提醒</h3>
        <p className="muted">最可靠的办法：加到手机自带的日历里，到点会响。提醒里不写药名。</p>
        <button className="btn primary" disabled={!reg || d.nextDue === null} onClick={addToCalendar}>
          添加到手机日历
        </button>
        <p className="fine">改了用药时间后，需要重新添加一次（并删掉旧的日程）。</p>
      </Card>

      <Card>
        <h3>蛋白目标</h3>
        <Chips
          options={[
            { value: 'auto' as const, label: '自动计算' },
            { value: 'manual' as const, label: '自己填' },
            { value: 'off' as const, label: '不设' },
          ]}
          value={profile.proteinMode}
          onChange={(m) => void updateProfile({ proteinMode: m })}
        />
        {profile.proteinMode === 'manual' && (
          <div className="row">
            <input inputMode="numeric" placeholder="每天最低多少克" value={manual} onChange={(e) => setManual(e.target.value)} />
            <button className="btn" onClick={() => void updateProfile({ proteinManualG: Number(manual) || null }).then(() => toast('已保存'))}>
              保存
            </button>
          </div>
        )}
        {d.protein.kind === 'auto' && (
          <p className="fine">
            按参考体重 {d.protein.refWeightKg} 公斤算：最低 {d.protein.floorG} 克，理想 {d.protein.idealLowG}–{d.protein.idealHighG} 克。公式待营养师确认。
          </p>
        )}
      </Card>

      <Card>
        <h3>显示</h3>
        <p className="muted">体重单位</p>
        <Chips options={(['kg', 'jin', 'lb'] as WeightUnit[]).map((u) => ({ value: u, label: unitLabel(u) }))} value={profile.weightUnit} onChange={(u) => void updateProfile({ weightUnit: u })} />
        <p className="muted">每天从几点开始算（夜班、晚睡的人可以调晚）</p>
        <Chips options={[0, 3, 4, 5, 6].map((h) => ({ value: h, label: `${h} 点` }))} value={profile.dayStartHour} onChange={(h) => void updateProfile({ dayStartHour: h })} />
        <label className="check">
          <input type="checkbox" checked={profile.largeText} onChange={(e) => void updateProfile({ largeText: e.target.checked })} />
          大字模式
        </label>
      </Card>

      <Card>
        <h3>AI 识别</h3>
        <label className="check">
          <input type="checkbox" checked={profile.aiConsent === true} onChange={(e) => void updateProfile({ aiConsent: e.target.checked })} />
          允许把本机认不出的文字和照片发给 AI 识别
        </label>
        <p className="fine">发送的只有你输入的内容、照片和药名、单位。不用于训练，照片不保存。关掉后所有记录都可以手动完成。</p>
      </Card>

      <Card className="backup">
        <h3>备份和导出</h3>
        <p className="warn">现在数据只存在这台手机的浏览器里。换手机、清理浏览器、或者很久不打开，都可能丢。邮箱同步在做，之前请定期导出。</p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => void buildBackup().then((b) => download(`稳瘦备份-${today}.json`, JSON.stringify(b), 'application/json'))}>
            导出备份
          </button>
          <button className="btn" onClick={() => void buildCsv().then((c) => download(`稳瘦记录-${today}.csv`, c, 'text/csv'))}>
            导出表格（CSV）
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            从备份恢复
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const n = await importBackup(await f.text());
              toast(`已恢复 ${n} 条记录`);
            } catch (err) {
              toast(`恢复失败：${(err as Error).message}`);
            }
          }}
        />
      </Card>

      <Card>
        <h3>关于</h3>
        <p className="fine">{DISCLAIMER}</p>
        <p className="fine">这是内测版。危险症状提醒、应对卡、蛋白公式和药物参数都还在等医生或药师审核。药品名称仅用于识别，商标归各自权利人所有，本产品与药企无关联。不卖药、不带货、不放广告。</p>
      </Card>

      <Card>
        <h3>删除全部数据</h3>
        <button
          className="btn danger"
          onClick={async () => {
            if (confirmWipe < 1) return setConfirmWipe(1);
            await db.delete();
            location.reload();
          }}
        >
          {confirmWipe ? '再点一次，永久删除这台设备上的全部记录' : '删除全部数据'}
        </button>
      </Card>
    </div>
  );
}
