import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { setUi, useUi } from '../store';

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
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
  const t = useT();
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{t.ref(toast.msg)}</span>
      {toast.undo && (
        <button
          onClick={() => {
            toast.undo!();
            setUi({ toast: null });
          }}
        >
          {t('common.undo')}
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

/** 给 datetime-local 输入框用的本地时间字符串。 */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(s: string): number {
  return new Date(s).getTime();
}
