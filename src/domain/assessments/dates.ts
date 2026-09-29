/**
 * Calendar-day helpers for assessments (M3-02, UX D). Assessments are dated in Singapore school
 * time, so "today" is the Singapore calendar day, never the server's or the browser's.
 *
 * Days are "YYYY-MM-DD" strings. They are compared as text and never turned into local-time
 * Date objects, so there is no timezone drift.
 */

/** A calendar day, "YYYY-MM-DD". Compares correctly as text. */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's calendar date in Singapore. */
export function todayInSingapore(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True for a real calendar day such as "2026-10-14" ("2026-02-30" is not one). */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function dayNumber(value: IsoDate): number {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from);
}

export type AssessmentDateCheck = { ok: true } | { ok: false; message: string };

/** An assessment may be today or later. The message is what the parent reads next to the field. */
export function validateAssessmentDate(value: string, today: IsoDate): AssessmentDateCheck {
  if (value.trim() === "") return { ok: false, message: "Choose the date of the assessment." };
  if (!isValidIsoDate(value)) return { ok: false, message: "Choose a date from the calendar, like 14 Oct 2026." };
  if (value < today) return { ok: false, message: "Choose today or a later date." };
  return { ok: true };
}

/** "today", "tomorrow", "in 12 days", "yesterday", "3 days ago". */
export function countdownText(date: IsoDate, today: IsoDate): string {
  const days = daysBetween(today, date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  if (days === -1) return "yesterday";
  return `${-days} days ago`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Tue 14 Oct". Adds the year ("Tue 14 Oct 2027") when it is not the year of `today`. */
export function formatAssessmentDate(date: IsoDate, today?: IsoDate): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const base = `${weekday} ${day} ${MONTHS[month - 1]}`;
  return today && today.slice(0, 4) !== date.slice(0, 4) ? `${base} ${year}` : base;
}
