/**
 * 生成可以加进系统日历的重复提醒（.ics）。
 * 用"浮动时间"（不带时区）：用户走到哪，提醒就按当地的这个钟点响。
 * 标题不写药名和剂量（PRD v2.0 第 5.5 节）。
 */
import type { Route } from './catalog';
import { pick, type Lang } from './i18n';
import { parseHHMM } from './tz';
import type { Schedule } from './schedule';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function fmtLocal(y: number, mo: number, d: number, h: number, mi: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}${p(mo)}${p(d)}T${p(h)}${p(mi)}00`;
}

/** Reminder title. It never names the medication or the dose. */
export function reminderTitle(route: Route, lang: Lang): string {
  return route === 'oral' ? pick(lang, { hans: '该记吃药了', en: 'Time to log your pill' }) : pick(lang, { hans: '该记一针了', en: 'Time to log your shot' });
}

/** File name for the downloaded calendar file. */
export function reminderFileName(lang: Lang): string {
  return pick(lang, { hans: '提醒.ics', en: 'reminder.ics' });
}

/** Escapes commas, semicolons, backslashes and line breaks in calendar text (RFC 5545, section 3.3.11). */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

export function reminderIcs(
  s: Schedule,
  first: { year: number; month: number; day: number; hour: number; minute: number },
  uid: string,
  lang: Lang,
  title: string = reminderTitle('sc', lang),
): string {
  let rrule: string;
  if (s.kind === 'weekly') rrule = `FREQ=WEEKLY;BYDAY=${BYDAY[s.weekday]}`;
  else if (s.kind === 'daily') rrule = 'FREQ=DAILY';
  else rrule = s.hours % 24 === 0 ? `FREQ=DAILY;INTERVAL=${s.hours / 24}` : `FREQ=HOURLY;INTERVAL=${s.hours}`;
  if (s.kind !== 'interval') parseHHMM(s.time);
  const start = fmtLocal(first.year, first.month, first.day, first.hour, first.minute);
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}T000000Z`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//glp1-companion//reminders//${lang === 'en' ? 'EN' : 'ZH'}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    'DURATION:PT15M',
    `RRULE:${rrule}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(pick(lang, { hans: '打开 App 记一下吧', en: 'Open the app to log it' }))}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
