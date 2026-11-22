import { useRef, useState } from 'react';
import { doseUnitLabel, drugById, regimenLabel } from '../../core/catalog';
import { LANGS, scriptFor, type Lang } from '../../core/i18n';
import { reminderFileName, reminderIcs, reminderTitle } from '../../core/ics';
import { scheduleText } from '../../core/schedule';
import { fmtClock, zonedParts } from '../../core/tz';
import type { CourseStatus, Profile } from '../../core/types';
import { fmtWeight, unitLabel, weightUnitsFor } from '../../core/units';
import { updateProfile } from '../actions';
import { Card, Chips } from '../components/ui';
import { disclaimer, statusLabel } from '../content/labels';
import { db } from '../db';
import { cloudState, wipeCloud } from '../cloud';
import type { Derived } from '../derive';
import { BackupError, buildBackup, buildCsv, download, importBackup } from '../exportData';
import { LANGUAGE_NAMES, msg, useT } from '../i18n';
import { toast } from '../store';

export function Me({ profile, d, onRedoSetup }: { profile: Profile; d: Derived; onRedoSetup: () => void }) {
  const t = useT();
  const lang = t.lang;
  const reg = profile.regimen;
  const drug = reg ? drugById(reg.drugId) : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState(String(profile.proteinManualG ?? ''));
  const [confirmWipe, setConfirmWipe] = useState(0);

  const setStatus = async (status: CourseStatus) => {
    if (!reg) return;
    await updateProfile({ regimen: { ...reg, status, stoppedAt: status === 'stopped' ? Date.now() : reg.stoppedAt ?? null } });
    toast(msg('toast.statusChanged', { status: statusLabel(status, lang) }));
  };

  const addToCalendar = () => {
    if (!reg || d.nextDue === null) return;
    const p = zonedParts(d.nextDue, d.tz);
    const title = reminderTitle(drug?.route ?? 'sc', lang);
    void download(reminderFileName(lang), reminderIcs(reg.schedule, { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute }, `${crypto.randomUUID()}@glp1-companion`, lang, title), 'text/calendar');
    toast(msg('toast.calendar'));
  };

  // The profile keeps the older `script` field in step with the language.
  const setLanguage = (next: Lang) => void updateProfile({ lang: next, script: scriptFor(next) });

  const today = new Date().toISOString().slice(0, 10);
  // A unit the profile already uses stays selectable even when the language does not offer it.
  const units = weightUnitsFor(lang).includes(profile.weightUnit) ? weightUnitsFor(lang) : [...weightUnitsFor(lang), profile.weightUnit];
  // Chinese shows the reference weight in kilograms, as before. English uses the profile's unit.
  const refWeight = (kg: number) => (lang === 'en' ? fmtWeight(kg, profile.weightUnit, lang) : `${kg} ${unitLabel('kg', lang)}`);

  return (
    <div className="screen">
      <h1 className="pad">{t('me.title')}</h1>

      <Card>
        <h3>{t('me.med.title')}</h3>
        {reg && drug ? (
          <>
            <p>
              {regimenLabel(reg, profile.region, lang)}
              {reg.doseAmount ? ` · ${reg.doseAmount} ${doseUnitLabel(reg.doseUnit, lang)}` : ''}
            </p>
            <p className="muted">{scheduleText(reg.schedule, lang)}</p>
            <Chips
              options={(['escalating', 'maintenance', 'paused', 'stopped'] as CourseStatus[]).map((s) => ({ value: s, label: statusLabel(s, lang) }))}
              value={reg.status}
              onChange={(s) => void setStatus(s)}
            />
            {reg.status === 'stopped' && <p className="fine">{t('me.med.stoppedNote', { escalating: statusLabel('escalating', lang) })}</p>}
          </>
        ) : (
          <p className="muted">{t('me.med.none')}</p>
        )}
        <button className="btn" onClick={onRedoSetup}>
          {reg ? t('me.med.change') : t('me.med.setup')}
        </button>
      </Card>

      <Card>
        <h3>{t('me.reminder.title')}</h3>
        <p className="muted">{t('me.reminder.body')}</p>
        <button className="btn primary" disabled={!reg || d.nextDue === null} onClick={addToCalendar}>
          {t('me.reminder.add')}
        </button>
        <p className="fine">{t('me.reminder.note')}</p>
      </Card>

      <Card>
        <h3>{t('me.protein.title')}</h3>
        <Chips
          options={[
            { value: 'auto' as const, label: t('me.protein.auto') },
            { value: 'manual' as const, label: t('me.protein.manual') },
            { value: 'off' as const, label: t('me.protein.off') },
          ]}
          value={profile.proteinMode}
          onChange={(m) => void updateProfile({ proteinMode: m })}
        />
        {profile.proteinMode === 'manual' && (
          <div className="row">
            <input inputMode="numeric" placeholder={t('me.protein.placeholder')} value={manual} onChange={(e) => setManual(e.target.value)} />
            <button className="btn" onClick={() => void updateProfile({ proteinManualG: Number(manual) || null }).then(() => toast(msg('toast.saved')))}>
              {t('common.save')}
            </button>
          </div>
        )}
        {d.protein.kind === 'auto' && (
          <p className="fine">{t('me.protein.formula', { ref: refWeight(d.protein.refWeightKg), floor: d.protein.floorG, low: d.protein.idealLowG, high: d.protein.idealHighG })}</p>
        )}
      </Card>

      <Card>
        <h3>{t('me.display.title')}</h3>
        <p className="muted">{t('common.language')}</p>
        <Chips options={LANGS.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))} value={lang} onChange={setLanguage} />
        <p className="muted">{t('me.display.unit')}</p>
        <Chips options={units.map((u) => ({ value: u, label: unitLabel(u, lang) }))} value={profile.weightUnit} onChange={(u) => void updateProfile({ weightUnit: u })} />
        <p className="muted">{t('me.display.dayStart')}</p>
        <Chips
          options={[0, 3, 4, 5, 6].map((h) => ({ value: h, label: t('me.display.hour', { hour: lang === 'en' ? fmtClock(h, 0, lang) : h }) }))}
          value={profile.dayStartHour}
          onChange={(h) => void updateProfile({ dayStartHour: h })}
        />
        <label className="check">
          <input type="checkbox" checked={profile.largeText} onChange={(e) => void updateProfile({ largeText: e.target.checked })} />
          {t('me.display.largeText')}
        </label>
      </Card>

      <Card>
        <h3>{t('me.ai.title')}</h3>
        <label className="check">
          <input type="checkbox" checked={profile.aiConsent === true} onChange={(e) => void updateProfile({ aiConsent: e.target.checked })} />
          {t('me.ai.allow')}
        </label>
        <p className="fine">{t('me.ai.note')}</p>
      </Card>

      <Card className="backup">
        <h3>{t('me.backup.title')}</h3>
        {cloudState() === 'on' ? <p className="muted">{t('me.backup.cloud')}</p> : <p className="warn">{t('me.backup.local')}</p>}
        <div className="row wrap">
          <button className="btn primary" onClick={() => void buildBackup().then((b) => download(t('me.backup.fileName', { date: today }), JSON.stringify(b), 'application/json'))}>
            {t('me.backup.export')}
          </button>
          <button className="btn" onClick={() => void buildCsv(lang).then((c) => download(t('me.backup.csvName', { date: today }), c, 'text/csv'))}>
            {t('me.backup.csv')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            {t('me.backup.restore')}
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
              toast(msg('toast.restored', { count: n }));
            } catch (err) {
              const reason = err instanceof BackupError ? t(err.code === 'not_ours' ? 'backup.notOurs' : 'backup.badFormat') : (err as Error).message;
              toast(msg('toast.restoreFailed', { reason }));
            }
          }}
        />
      </Card>

      <Card>
        <h3>{t('me.about.title')}</h3>
        <p className="fine">{disclaimer(lang)}</p>
        <p className="fine">{t('me.about.body')}</p>
      </Card>

      <Card>
        <h3>{t('me.wipe.title')}</h3>
        <button
          className="btn danger"
          onClick={async () => {
            if (confirmWipe < 1) return setConfirmWipe(1);
            await wipeCloud();
            await db.delete();
            location.reload();
          }}
        >
          {confirmWipe ? t('me.wipe.confirm') : t('me.wipe.title')}
        </button>
      </Card>
    </div>
  );
}
