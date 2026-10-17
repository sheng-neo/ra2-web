// ===== ui/windows/format.ts =====（WP12b：数字 / 金额 / 等级离散化，spec:ui-art §2.4 / §2.5.2）
import type { Strings } from '../../contracts/strings';
import type { ClockState } from '../../contracts/state';
import { dateOf } from '../../contracts/state';

/** 千分位（不依赖 locale，保证测试稳定）。 */
export function thousands(n: number): string {
  const v = Math.round(Math.abs(n));
  const s = String(v);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += ',';
  }
  return (n < 0 ? '-' : '') + out;
}

/** `$` + 千分位；负数 `-$1,234`。 */
export function money(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? '-$' : '$') + thousands(Math.abs(v));
}

export const pct = (n: number): string => `${Math.round(n)}%`;

/** 64² 图取值 0..255 → 五档 strings 键（spec:ui-art §2.5.2）。 */
export function levelKey(v: number): string {
  if (v <= 0) return 'level.none';
  if (v < 64) return 'level.low';
  if (v < 128) return 'level.medium';
  if (v < 192) return 'level.high';
  return 'level.veryHigh';
}

/** `Mon YYYY`（月份名经 strings month.<m>）。 */
export function monthYear(strings: Strings, clock: Pick<ClockState, 'age' | 'foundedYear'>): string {
  const d = dateOf({ ...clock, speed: 1, mode: 1, modalPause: 0, phaseCursor: 0, accumMs: 0, disasterTicks: 0, prngState: 0 });
  return `${strings.t(`month.${d.month}`)} ${d.year}`;
}

/** 给定 year / month（0..11）的日期文案。 */
export const monthYearOf = (strings: Strings, year: number, month: number): string => `${strings.t(`month.${month}`)} ${year}`;

/** 本地时间戳 → 可读字符串（存档列表用；UI 层允许 Date）。 */
export function timestampLabel(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
