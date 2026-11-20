import type { ReactNode } from 'react';
import { countdown } from '../../core/schedule';
import { zonedParts } from '../../core/tz';
import { setUi, useUi } from '../store';

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast() {
  const { toast } = useUi();
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          onClick={() => {
            toast.undo!();
            setUi({ toast: null });
          }}
        >
          撤销
        </button>
      )}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Chips<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={String(o.value)} className={`chip ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function fmtTime(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function fmtDay(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.month}月${p.day}日 ${WD[p.weekday]}`;
}

export function fmtWhen(ms: number, tz: string, nowMs: number): string {
  const a = zonedParts(ms, tz);
  const b = zonedParts(nowMs, tz);
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  return sameDay ? `今天 ${fmtTime(ms, tz)}` : `${WD[a.weekday]} ${fmtTime(ms, tz)}`;
}

export function fmtCountdown(dueMs: number, nowMs: number): string {
  const c = countdown(dueMs, nowMs);
  const s = c.days > 0 ? `${c.days} 天 ${c.hours} 小时` : c.hours > 0 ? `${c.hours} 小时 ${c.minutes} 分` : `${c.minutes} 分钟`;
  return c.past ? `已过 ${s}` : `还有 ${s}`;
}

/** 给 datetime-local 输入框用的本地时间字符串。 */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(s: string): number {
  return new Date(s).getTime();
}
