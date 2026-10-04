/* Dates as the person's language writes them. Records are Taiwan dates, so everything is shown in Taiwan time. */

// Gregorian years in Thai too, so dates match the company's own documents.
const LOCALES: Record<string, string> = { zh: 'zh-TW', en: 'en-US', ja: 'ja-JP', vi: 'vi-VN', th: 'th-TH-u-ca-gregory' };

/** A calendar date (YYYY-MM-DD) or a timestamp. `year: false` for near dates such as a due date. */
export function formatDate(value: string, lang: string, { year = true }: { year?: boolean } = {}): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+08:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(LOCALES[lang] ?? 'zh-TW', {
    timeZone: 'Asia/Taipei', year: year ? 'numeric' : undefined, month: 'numeric', day: 'numeric',
  }).format(date);
}
