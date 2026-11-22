/**
 * 时区工具：所有记录按 UTC 毫秒存储，展示和"今天"的划分按用户时区计算。
 * 只依赖 Intl，不引入时区库。
 */
import type { Lang } from './i18n';

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = 周日
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    cache.set(tz, f);
  }
  return f;
}

export function zonedParts(ms: number, tz: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday] ?? 0,
  };
}

/** 该时刻在 tz 下的 UTC 偏移（本地时间 − UTC），毫秒。 */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** tz 下的墙上时间 → UTC 毫秒。夏令时缺口里的时间会落到相邻的有效时刻。 */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMs(guess, tz);
  let t = guess - off1;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off1) t = guess - off2;
  return t;
}

/** 本地日期加减天数（纯日历运算，不受时区影响）。 */
export function addDays(year: number, month: number, day: number, n: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "今天"的键：YYYY-MM-DD。dayStartHour 允许把凌晨算进前一天（默认 4 点），
 * 照顾夜班和晚睡的人。
 */
export function dayKey(ms: number, tz: string, dayStartHour = 4): string {
  const p = zonedParts(ms - dayStartHour * HOUR, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 某个 dayKey 的起始 UTC 时刻（含 dayStartHour 偏移）。 */
export function dayStartMs(key: string, tz: string, dayStartHour = 4): number {
  const [y, m, d] = key.split('-').map(Number);
  return zonedToUtc(y, m, d, dayStartHour, 0, tz);
}

export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const r = addDays(y, m, d, n);
  return `${r.year}-${pad(r.month)}-${pad(r.day)}`;
}

/** 两个 dayKey 相差几天（b − a）。 */
export function dayDiff(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY);
}

export function parseHHMM(s: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`bad time: ${s}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`bad time: ${s}`);
  return { hour, minute };
}

export { HOUR, DAY };

// ── Text for dates and times ─────────────────────────────────────────────────
// Names are written out here instead of asking Intl for them, so the output is the same on
// every device and the Chinese text stays exactly as it was.

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_EN_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Weekday names, index 0 = Sunday. Chinese has one form; `style` only changes English. */
export function weekdayLabels(lang: Lang, style: 'short' | 'long' = 'short'): string[] {
  if (lang !== 'en') return WEEKDAY_ZH;
  return style === 'long' ? WEEKDAY_EN_LONG : WEEKDAY_EN_SHORT;
}

export function weekdayLabel(weekday: number, lang: Lang, style: 'short' | 'long' = 'short'): string {
  return weekdayLabels(lang, style)[((weekday % 7) + 7) % 7];
}

/** Clock time. English uses the 12-hour clock ("9:00 PM"); Chinese keeps "21:00". */
export function fmtClock(hour: number, minute: number, lang: Lang): string {
  if (lang !== 'en') return `${pad(hour)}:${pad(minute)}`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** A stored "HH:MM" schedule time, as text for the user. */
export function fmtHHMM(time: string, lang: Lang): string {
  const { hour, minute } = parseHHMM(time);
  return fmtClock(hour, minute, lang);
}

export function fmtTime(ms: number, tz: string, lang: Lang): string {
  const p = zonedParts(ms, tz);
  return fmtClock(p.hour, p.minute, lang);
}

/** "Fri, Nov 20" in English, "11月20日 周五" in Chinese. */
export function fmtDay(ms: number, tz: string, lang: Lang): string {
  const p = zonedParts(ms, tz);
  if (lang === 'en') return `${WEEKDAY_EN_SHORT[p.weekday]}, ${MONTH_EN_SHORT[p.month - 1]} ${p.day}`;
  return `${p.month}月${p.day}日 ${WEEKDAY_ZH[p.weekday]}`;
}

/** "Today 9:00 PM" on the same calendar day as nowMs, otherwise the weekday: "Mon 9:00 PM". */
export function fmtWhen(ms: number, tz: string, nowMs: number, lang: Lang): string {
  const a = zonedParts(ms, tz);
  const b = zonedParts(nowMs, tz);
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  const day = sameDay ? (lang === 'en' ? 'Today' : '今天') : weekdayLabel(a.weekday, lang);
  return `${day} ${fmtClock(a.hour, a.minute, lang)}`;
}
