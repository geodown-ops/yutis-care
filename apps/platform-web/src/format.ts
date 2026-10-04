/*
 * Dates and times for the platform admin. Yutis staff work in Taiwan, so every time is shown and entered in Taiwan
 * time (UTC+8, no daylight saving) whatever the laptop's time zone, and the same moment reads the same for everyone.
 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60_000;

/** The instant as a Taiwan wall-clock ISO string without zone, e.g. 2026-10-04T09:30:00.000. */
const taipei = (at: Date | string) => new Date(new Date(at).getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 23);

/** Today in Taiwan as YYYY-MM-DD. */
export const todayInTaipei = (now = new Date()) => taipei(now).slice(0, 10);

/** This month in Taiwan as YYYY-MM. */
export const monthInTaipei = (now = new Date()) => taipei(now).slice(0, 7);

/** 2026/10/04 from a date (YYYY-MM-DD) or a timestamp. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : taipei(value).slice(0, 10)).replaceAll('-', '/');
}

/** 2026/10/04 09:30 in Taiwan time. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const t = taipei(value);
  return `${t.slice(0, 10).replaceAll('-', '/')} ${t.slice(11, 16)}`;
}

/** A timestamp as the value of `<input type="datetime-local">`, in Taiwan time (YYYY-MM-DDTHH:mm). */
export const toLocalInput = (iso: string) => taipei(iso).slice(0, 16);

/** A `datetime-local` value (Taiwan time) as an ISO timestamp with offset, as the API expects. */
export const fromLocalInput = (local: string) => `${local}:00+08:00`;

/** The last `count` months up to and including `month` (YYYY-MM), newest first. */
export function recentMonths(month: string, count: number): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const index = y * 12 + (m - 1) - i;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

/** 2026-10 → 2026 年 10 月 */
export const formatMonth = (month: string) => `${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月`;

export const formatCount = (n: number) => n.toLocaleString('zh-TW');
